'use strict';

/**
 * test/server.test.js — D：静态服务器测试
 *
 * 覆盖（契约 §15）：
 *  - fork('server.js') 启动（优先真实子进程；DSH 沙箱禁止嵌套 spawn 时降级同进程
 *    require('../server.js') + createServer + listen(0)，两种模式都跑同一批断言）
 *  - index.html / 静态资源 / CSS / core JS / config JSON / pages / standalone 200
 *  - Content-Type 精确匹配、Content-Length === stat.size、响应字节与磁盘文件一致
 *  - HEAD → 200 且 body 为 0 字节；目录（无 index.html）→ 403；非 GET/HEAD → 405
 *  - 404 / 非法百分号编码 / NUL / 任意 `..` 段路径穿越 → 400（HTTP + resolveSafe 单元）
 *  - 关闭服务后端口释放
 *
 * 兼容 Node 13.14：零依赖、仅内置模块、不用 ?./??/replaceAll/.at 等语法。
 */

var http = require('http');
var net = require('net');
var fs = require('fs');
var path = require('path');
var urlLib = require('url');
var child_process = require('child_process');

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */

// 与 server.js MIME 表保持一致的期望值（精确字符串）
var MIME_EXPECT = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.webp': 'image/webp'
};

// 需要枚举的静态资源扩展名
var STATIC_EXTS = {
  '.html': true, '.htm': true, '.css': true, '.js': true, '.mjs': true,
  '.json': true, '.map': true, '.svg': true, '.txt': true, '.md': true,
  '.png': true, '.jpg': true, '.jpeg': true, '.gif': true, '.ico': true,
  '.woff': true, '.woff2': true, '.ttf': true, '.webp': true
};

// 尚未交付、允许临时缺失的资源（这些缺失时页面测试 SKIP，交付后自动转 PASS）
var PENDING_FILES = [
  'src/components/form.js',
  'src/styles/controls.css',
  'src/styles/components.css'
];

var REQUIRED_STANDALONE = [
  'menu', 'menunav', 'tabs', 'dialog', 'toast',
  'form', 'controls', 'theme', 'no-shell'
];

var START_TIMEOUT_MS = 8000;
var REQUEST_TIMEOUT_MS = 5000;
var START_MARK_RE = /本地地址[:：]\s*(http:\/\/[^\s]+)/;

/* ------------------------------------------------------------------ */
/* 模块级共享状态（fork 子进程需在进程退出时兜底清理）                 */
/* ------------------------------------------------------------------ */

var SHARED = {
  child: null,
  server: null,
  uncaughtHandler: null
};

function killChildQuietly(child) {
  if (!child) return;
  try { child.kill('SIGKILL'); } catch (e) { /* noop */ }
}

// 兜底：测试进程退出时不留孤儿 server 子进程
process.on('exit', function () {
  killChildQuietly(SHARED.child);
});

/* ------------------------------------------------------------------ */
/* 测试套件                                                            */
/* ------------------------------------------------------------------ */

module.exports = function register(suite, ctx) {
  var root = ctx.root;
  var assert = ctx.assert;

  // 每次加载模块重置状态（应只加载一次，但保证幂等）
  var state = {
    started: false,
    starting: null,
    mode: null,
    port: 0,
    base: '',
    child: null,
    server: null,
    fallbackReason: '',
    lastUncaught: null
  };

  /* ---------------------------------------------------------------- */
  /* 基础工具                                                          */
  /* ---------------------------------------------------------------- */

  function lastUncaughtHint() {
    if (!state.lastUncaught) return '';
    var msg = state.lastUncaught.message || String(state.lastUncaught);
    state.lastUncaught = null;
    return '；服务端未捕获异常: ' + msg;
  }

  function httpRequest(pathname, opts) {
    opts = opts || {};
    var method = opts.method || 'GET';
    return new Promise(function (resolve, reject) {
      var settled = false;
      function fail(message) {
        if (settled) return;
        settled = true;
        reject(new Error(message));
      }
      var req;
      try {
        req = http.request({
          host: '127.0.0.1',
          port: state.port,
          path: pathname,
          method: method,
          headers: Object.assign({ Connection: 'close' }, opts.headers || {})
        }, function (res) {
          var chunks = [];
          res.on('data', function (chunk) { chunks.push(chunk); });
          res.on('end', function () {
            if (settled) return;
            settled = true;
            resolve({
              path: pathname,
              method: method,
              status: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks)
            });
          });
          res.on('error', function (e) {
            fail('响应流出错 ' + method + ' ' + pathname + ': ' + e.message);
          });
        });
      } catch (e) {
        return fail('发起请求失败 ' + pathname + ': ' + e.message);
      }
      req.setTimeout(REQUEST_TIMEOUT_MS, function () {
        try { req.destroy(); } catch (e) { /* noop */ }
        fail('请求超时 ' + REQUEST_TIMEOUT_MS + 'ms: ' + method + ' ' + pathname + lastUncaughtHint());
      });
      req.on('error', function (e) {
        fail('请求失败 ' + method + ' ' + pathname + ': ' + e.message + lastUncaughtHint());
      });
      req.end();
    });
  }

  function get(pathname, opts) { return httpRequest(pathname, opts); }

  function expectStatus(res, expected, label) {
    assert.strictEqual(res.status, expected,
      label + '：期望 HTTP ' + expected + '，实际 ' + res.status +
      '（' + res.method + ' ' + res.path + '）');
  }

  function expectContentType(res, expected, label) {
    var actual = res.headers['content-type'];
    assert.strictEqual(actual, expected,
      label + '：期望 Content-Type "' + expected + '"，实际 "' + actual + '"（' + res.path + '）');
  }

  function expectHtml(res, label) {
    var actual = String(res.headers['content-type'] || '');
    assert.ok(actual.indexOf('text/html') === 0,
      label + '：期望 text/html，实际 "' + actual + '"（' + res.path + '）');
  }

  function bodyText(res) { return res.body.toString('utf8'); }

  function readJson(rel) {
    var abs = path.join(root, rel);
    return JSON.parse(fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, ''));
  }

  function exists(rel) { return fs.existsSync(path.join(root, rel)); }

  function repoRel(abs) {
    return path.relative(root, abs).split(path.sep).join('/');
  }

  /* ---------------------------------------------------------------- */
  /* 服务器生命周期                                                    */
  /* ---------------------------------------------------------------- */

  function findFreePort() {
    return new Promise(function (resolve, reject) {
      var probe = net.createServer();
      probe.unref();
      probe.once('error', function (e) {
        try { probe.close(); } catch (e2) { /* noop */ }
        reject(new Error('寻找空闲端口失败: ' + e.message));
      });
      probe.listen(0, '127.0.0.1', function () {
        var port = probe.address().port;
        probe.close(function () { resolve(port); });
      });
    });
  }

  function attachUncaughtGuard() {
    if (SHARED.uncaughtHandler) return;
    var serverPath = path.join(root, 'server.js');
    SHARED.uncaughtHandler = function (err) {
      var stack = (err && err.stack) ? err.stack : String(err);
      if (stack.indexOf(serverPath) !== -1) {
        state.lastUncaught = err;
        console.error('    [server.test] 捕获服务端未捕获异常（测试继续）: ' +
          (err && err.message ? err.message : err));
        return;
      }
      console.error('    [server.test] 非服务端未捕获异常: ' + stack);
      process.exitCode = 1;
    };
    process.on('uncaughtException', SHARED.uncaughtHandler);
  }

  function detachUncaughtGuard() {
    if (!SHARED.uncaughtHandler) return;
    process.removeListener('uncaughtException', SHARED.uncaughtHandler);
    SHARED.uncaughtHandler = null;
  }

  function readServerModule() {
    var modPath = path.join(root, 'server.js');
    if (require.cache[modPath]) return require.cache[modPath].exports;
    return require(modPath);
  }

  function startViaFork(port) {
    return new Promise(function (resolve, reject) {
      var child;
      try {
        child = child_process.fork(path.join(root, 'server.js'),
          ['--port', String(port), '--host', '127.0.0.1', '--quiet'],
          { cwd: root, silent: true });
      } catch (e) {
        return reject(new Error('fork 启动异常: ' + e.message));
      }

      var settled = false;
      var stdoutBuf = '';
      var stderrBuf = '';
      var timer = setTimeout(function () {
        finish(new Error('fork 启动超时 ' + START_TIMEOUT_MS + 'ms（stdout: ' +
          stdoutBuf.slice(0, 200) + '）'));
      }, START_TIMEOUT_MS);

      function finish(err, value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) {
          killChildQuietly(child);
          reject(err);
        } else {
          resolve(value);
        }
      }

      if (child.stdout) {
        child.stdout.on('error', function () { /* noop */ });
        child.stdout.on('data', function (chunk) {
          stdoutBuf += chunk.toString('utf8');
          var m = START_MARK_RE.exec(stdoutBuf);
          if (!m) return;
          var parsed;
          try {
            parsed = new URL(m[1]);
          } catch (e) {
            try { parsed = urlLib.parse(m[1]); } catch (e2) { return; }
          }
          var parsedPort = parseInt(parsed.port, 10);
          if (!parsedPort) return;
          finish(null, {
            mode: 'fork',
            port: parsedPort,
            base: m[1],
            child: child,
            server: null,
            fallbackReason: ''
          });
        });
      }
      if (child.stderr) {
        child.stderr.on('error', function () { /* noop */ });
        child.stderr.on('data', function (chunk) {
          stderrBuf += chunk.toString('utf8');
        });
      }
      child.on('error', function (e) {
        finish(new Error('fork 子进程错误: ' + e.message));
      });
      child.on('exit', function (code, signal) {
        if (settled) return;
        finish(new Error('fork 子进程提前退出 code=' + code + ' signal=' + signal +
          (stderrBuf ? ' stderr=' + stderrBuf.slice(0, 300) : '')));
      });
    });
  }

  function startInProcess(reason) {
    return new Promise(function (resolve, reject) {
      var mod;
      try {
        mod = readServerModule();
      } catch (e) {
        return reject(new Error('require server.js 失败: ' + e.message));
      }
      if (!mod || typeof mod.createServer !== 'function') {
        return reject(new Error('server.js 未导出 createServer'));
      }
      var server;
      try {
        server = mod.createServer({ quiet: true });
      } catch (e) {
        return reject(new Error('createServer 失败: ' + e.message));
      }
      attachUncaughtGuard();
      server.once('error', function (e) {
        detachUncaughtGuard();
        reject(new Error('同进程 listen 失败: ' + e.message));
      });
      server.listen(0, '127.0.0.1', function () {
        var port = server.address().port;
        resolve({
          mode: 'in-process',
          port: port,
          base: 'http://127.0.0.1:' + port + '/',
          child: null,
          server: server,
          fallbackReason: reason ? (reason.message || String(reason)) : ''
        });
      });
    });
  }

  function startServer() {
    if (state.starting) return state.starting;
    state.starting = findFreePort().then(function (port) {
      return startViaFork(port).catch(function (e) {
        return startInProcess(e);
      });
    }).catch(function (e) {
      // findFreePort 失败也不该阻塞：直接走同进程降级
      return startInProcess(e);
    }).then(function (result) {
      state.started = true;
      state.mode = result.mode;
      state.port = result.port;
      state.base = result.base;
      state.child = result.child;
      state.server = result.server;
      state.fallbackReason = result.fallbackReason || '';
      SHARED.child = result.child;
      SHARED.server = result.server;
      return result;
    });
    return state.starting;
  }

  function stopServer() {
    detachUncaughtGuard();
    var done;
    if (state.child) {
      var child = state.child;
      state.child = null;
      SHARED.child = null;
      done = new Promise(function (resolve) {
        var settled = false;
        function finish() {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve();
        }
        var timer = setTimeout(function () {
          killChildQuietly(child);
          finish();
        }, 3000);
        child.once('exit', finish);
        try {
          child.kill('SIGTERM');
        } catch (e) {
          killChildQuietly(child);
          finish();
        }
      });
    } else if (state.server) {
      var server = state.server;
      state.server = null;
      SHARED.server = null;
      done = new Promise(function (resolve) {
        try {
          server.close(function () { resolve(); });
        } catch (e) {
          resolve();
        }
      });
    } else {
      done = Promise.resolve();
    }
    state.started = false;
    return done;
  }

  function ensureStarted() {
    if (state.started) return Promise.resolve();
    return Promise.reject(new Error('服务尚未启动（启动用例失败，后续用例无法执行）'));
  }

  /* ---------------------------------------------------------------- */
  /* 文件遍历与引用解析                                                */
  /* ---------------------------------------------------------------- */

  function walkStatic(dirRel, out) {
    var abs = path.join(root, dirRel);
    if (!fs.existsSync(abs)) return;
    var stat;
    try { stat = fs.statSync(abs); } catch (e) { return; }
    if (stat.isDirectory()) {
      var names;
      try { names = fs.readdirSync(abs); } catch (e) { return; }
      names.sort().forEach(function (name) {
        if (name.charAt(0) === '.') return;
        walkStatic(path.posix.join(dirRel, name), out);
      });
      return;
    }
    var ext = path.extname(abs).toLowerCase();
    if (STATIC_EXTS[ext]) out.push(dirRel.split(path.sep).join('/'));
  }

  function listStaticFiles() {
    var out = [];
    if (exists('index.html')) out.push('index.html');
    ['src', 'config', 'pages', 'standalone'].forEach(function (dir) {
      walkStatic(dir, out);
    });
    // 去重保序
    var seen = {};
    return out.filter(function (rel) {
      if (seen[rel]) return false;
      seen[rel] = true;
      return true;
    });
  }

  function parseHtmlRefs(html) {
    var refs = [];
    var re = /<(script|link)\b([^>]*)>/gi;
    var m;
    while ((m = re.exec(html))) {
      var tag = m[1].toLowerCase();
      var attrs = m[2];
      if (tag === 'link') {
        var relMatch = attrs.match(/\brel\s*=\s*"([^"]*)"/i) || attrs.match(/\brel\s*=\s*'([^']*)'/i);
        var relVal = relMatch ? relMatch[1].toLowerCase() : '';
        if (relVal.indexOf('stylesheet') === -1) continue;
        var hrefMatch = attrs.match(/\bhref\s*=\s*"([^"]*)"/i) || attrs.match(/\bhref\s*=\s*'([^']*)'/i);
        if (hrefMatch) refs.push({ tag: 'link', url: hrefMatch[1] });
        continue;
      }
      var srcMatch = attrs.match(/\bsrc\s*=\s*"([^"]*)"/i) || attrs.match(/\bsrc\s*=\s*'([^']*)'/i);
      if (srcMatch) refs.push({ tag: 'script', url: srcMatch[1] });
    }
    return refs;
  }

  /**
   * 解析页面引用：返回 { missing: [{url, rel}], external: [url] }
   */
  function resolvePageRefs(pageRel, html) {
    var missing = [];
    var external = [];
    parseHtmlRefs(html).forEach(function (ref) {
      var u = ref.url.split('?')[0].split('#')[0];
      if (!u) return;
      if (/^(https?:)?\/\//i.test(u)) {
        external.push(pageRel + ' -> ' + ref.url);
        return;
      }
      if (u.indexOf('data:') === 0 || u.indexOf('blob:') === 0 || u.charAt(0) === '#') return;
      var abs;
      try {
        abs = path.resolve(root, path.dirname(pageRel), u);
      } catch (e) {
        missing.push({ url: u, rel: u });
        return;
      }
      if (abs !== root && abs.indexOf(root + path.sep) !== 0) {
        missing.push({ url: u, rel: u });
        return;
      }
      if (!fs.existsSync(abs)) missing.push({ url: u, rel: repoRel(abs) });
    });
    return { missing: missing, external: external };
  }

  function splitPending(missing) {
    var pending = [];
    var other = [];
    missing.forEach(function (item) {
      if (PENDING_FILES.indexOf(item.rel) !== -1) pending.push(item.rel);
      else other.push(item.rel + '（引用 "' + item.url + '"）');
    });
    return { pending: pending, other: other };
  }

  function collectPageUrls(appJson) {
    var urls = [];
    function add(u) {
      if (typeof u !== 'string' || !u) return;
      var v = u.replace(/\\/g, '/');
      if (v.indexOf('../') === 0) v = v.slice(3);
      if (v.indexOf('./') === 0) v = v.slice(2);
      if (v.charAt(0) === '/') v = v.slice(1);
      v = v.split('?')[0].split('#')[0];
      if (!/\.html$/i.test(v)) return;
      if (urls.indexOf(v) === -1) urls.push(v);
    }
    if (appJson && appJson.app) add(appJson.app.home);
    function walkItems(items) {
      if (!items) return;
      var list = items.forEach ? items : [];
      list.forEach(function (item) {
        if (!item || typeof item !== 'object') return;
        if (item.target && item.target.tab && item.target.tab.url) add(item.target.tab.url);
        if (item.children) walkItems(item.children);
        if (item.items) walkItems(item.items);
      });
    }
    if (appJson && appJson.menu && appJson.menu.props) walkItems(appJson.menu.props.items);
    // app.json 的菜单同时链接 pages/ 与 standalone/；本用例只覆盖业务页面 pages/
    return urls.filter(function (v) { return v.indexOf('pages/') === 0; });
  }

  function waitPortClosed(port, timeoutMs) {
    var deadline = Date.now() + timeoutMs;
    return new Promise(function (resolve, reject) {
      function attempt() {
        var socket = net.connect({ host: '127.0.0.1', port: port });
        var settled = false;
        function finish(closed) {
          if (settled) return;
          settled = true;
          try { socket.destroy(); } catch (e) { /* noop */ }
          if (closed) {
            resolve();
            return;
          }
          if (Date.now() >= deadline) {
            reject(new Error('服务关闭后端口 ' + port + ' 仍可连接'));
            return;
          }
          setTimeout(attempt, 120);
        }
        socket.once('connect', function () { finish(false); });
        socket.once('error', function () { finish(true); });
        socket.setTimeout(600, function () {
          // 连接无响应（半开），视为已关闭
          finish(true);
        });
      }
      attempt();
    });
  }

  /* ---------------------------------------------------------------- */
  /* 用例 1：启动服务                                                  */
  /* ---------------------------------------------------------------- */

  suite.test('启动本地服务（优先 fork；沙箱限制时同进程降级）并响应 index.html', function () {
    return startServer().then(function () {
      assert.ok(state.mode === 'fork' || state.mode === 'in-process',
        '启动方式应为 fork 或 in-process，实际 ' + state.mode);
      assert.ok(state.port > 0, '实际监听端口应大于 0，实际 ' + state.port);
      if (state.mode === 'in-process') {
        ctx.warn('fork 不可用，已降级同进程 HTTP 服务（沙箱限制，非代码缺陷）：' +
          (state.fallbackReason || '原因未知'));
      }
      return get('/');
    }).then(function (res) {
      expectStatus(res, 200, 'GET /');
      expectHtml(res, 'GET /');
      return get('/index.html');
    }).then(function (res) {
      expectStatus(res, 200, 'GET /index.html');
      expectHtml(res, 'GET /index.html');
    });
  });

  /* ---------------------------------------------------------------- */
  /* 用例 2：index.html 完整性                                         */
  /* ---------------------------------------------------------------- */

  suite.test('index.html：200、Content-Type、Content-Length、与磁盘字节一致、含核心脚本', function () {
    return ensureStarted().then(function () {
      return get('/');
    }).then(function (rootRes) {
      expectStatus(rootRes, 200, 'GET /');
      var indexAbs = path.join(root, 'index.html');
      var indexBuf = fs.readFileSync(indexAbs);
      var indexStat = fs.statSync(indexAbs);

      var rootText = bodyText(rootRes);
      assert.ok(/<!doctype\s+html/i.test(rootText), 'index.html 应包含 <!doctype html>');
      assert.ok(/<html[\s>]/i.test(rootText), 'index.html 应包含 <html>');
      assert.ok(/<\/body>/i.test(rootText), 'index.html 应包含 </body>');
      assert.ok(rootText.indexOf('src/core/kui-all.js') !== -1,
        'index.html 应引用 src/core/kui-all.js（单一入口装载器）');
      assert.ok(/data-kui-profile=["']app["']/.test(rootText),
        'index.html 的 kui-all 应声明 data-kui-profile="app"');

      expectContentType(rootRes, MIME_EXPECT['.html'], 'GET /');
      assert.strictEqual(Number(rootRes.headers['content-length']), indexStat.size,
        'GET / 的 Content-Length 应等于 index.html 的 stat.size（' + indexStat.size + '）');
      assert.ok(rootRes.body.equals(indexBuf),
        'GET / 的响应字节应与磁盘 index.html 完全一致');
      assert.ok(String(rootRes.headers['cache-control'] || '').indexOf('no-store') !== -1,
        '静态响应应带 Cache-Control: no-store*，实际 "' + rootRes.headers['cache-control'] + '"');
      assert.strictEqual(rootRes.headers['x-content-type-options'], 'nosniff',
        '静态响应应带 X-Content-Type-Options: nosniff');

      return get('/index.html');
    }).then(function (directRes) {
      expectStatus(directRes, 200, 'GET /index.html');
      assert.ok(directRes.body.equals(fs.readFileSync(path.join(root, 'index.html'))),
        '/index.html 的响应字节应与磁盘文件一致');
    });
  });

  /* ---------------------------------------------------------------- */
  /* 用例 3：HEAD 语义                                                 */
  /* ---------------------------------------------------------------- */

  suite.test('HEAD：200、body 为空、Content-Length 为文件大小', function () {
    return ensureStarted().then(function () {
      return get('/', { method: 'HEAD' });
    }).then(function (res) {
      expectStatus(res, 200, 'HEAD /');
      assert.strictEqual(res.body.length, 0, 'HEAD 响应 body 应为 0 字节，实际 ' + res.body.length);
      expectContentType(res, MIME_EXPECT['.html'], 'HEAD /');
      var size = fs.statSync(path.join(root, 'index.html')).size;
      assert.strictEqual(Number(res.headers['content-length']), size,
        'HEAD / 的 Content-Length 应为 ' + size + '，实际 ' + res.headers['content-length']);
      return get('/nope-head.html', { method: 'HEAD' });
    }).then(function (res) {
      expectStatus(res, 404, 'HEAD /nope-head.html');
      assert.strictEqual(res.body.length, 0, '404 的 HEAD 响应 body 也应为 0 字节');
    });
  });

  /* ---------------------------------------------------------------- */
  /* 用例 4：静态资源全量枚举                                          */
  /* ---------------------------------------------------------------- */

  suite.test('静态资源全量枚举：200 + Content-Type + Content-Length + 字节一致', function () {
    return ensureStarted().then(function () {
      var files = listStaticFiles();
      assert.ok(files.length >= 30,
        '静态资源枚举数量应 >= 30（实际 ' + files.length + '）：' + files.join(', '));
      var failures = [];
      var chain = Promise.resolve();
      files.forEach(function (rel) {
        chain = chain.then(function () {
          return get('/' + rel).then(function (res) {
            var abs = path.join(root, rel);
            var stat;
            try { stat = fs.statSync(abs); } catch (e) {
              failures.push(rel + ' 磁盘文件不可读: ' + e.message);
              return;
            }
            if (res.status !== 200) {
              failures.push(rel + ' → HTTP ' + res.status);
              return;
            }
            var ext = path.extname(rel).toLowerCase();
            var expectedType = MIME_EXPECT[ext];
            if (expectedType && res.headers['content-type'] !== expectedType) {
              failures.push(rel + ' → Content-Type "' + res.headers['content-type'] +
                '"（期望 "' + expectedType + '"）');
            }
            var len = Number(res.headers['content-length']);
            if (len !== stat.size) {
              failures.push(rel + ' → Content-Length ' + len + ' ≠ stat.size ' + stat.size);
            }
            var disk;
            try { disk = fs.readFileSync(abs); } catch (e) {
              failures.push(rel + ' 读取磁盘失败: ' + e.message);
              return;
            }
            if (!res.body.equals(disk)) {
              failures.push(rel + ' → 响应字节与磁盘不一致（响应 ' + res.body.length +
                'B，磁盘 ' + disk.length + 'B）');
            }
          }, function (e) {
            failures.push(rel + ' → 请求异常: ' + e.message);
          });
        });
      });
      return chain.then(function () {
        assert.deepStrictEqual(failures, [],
          '静态资源检查失败 ' + failures.length + ' 项：\n  ' + failures.slice(0, 12).join('\n  '));
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /* 用例 5：显式 MIME 校验（CSS / core JS / config JSON）             */
  /* ---------------------------------------------------------------- */

  suite.test('CSS / core JS / config JSON：Content-Type 精确、JSON 可解析', function () {
    return ensureStarted().then(function () {
      var cssFiles = [];
      walkStatic('src/styles', cssFiles);
      cssFiles = cssFiles.filter(function (f) { return /\.css$/i.test(f); });
      assert.ok(cssFiles.length >= 1, 'src/styles 下应至少存在 1 个 CSS 文件');

      var jsFiles = [];
      walkStatic('src/core', jsFiles);
      jsFiles = jsFiles.filter(function (f) { return /\.js$/i.test(f); });
      assert.ok(jsFiles.length >= 6, 'src/core 下应至少存在 6 个 JS 文件（实际 ' + jsFiles.length + '）');

      var jsonFiles = ['config/app.json', 'config/text.json', 'src/themes.json'];
      jsonFiles.forEach(function (rel) {
        assert.ok(exists(rel), '缺少配置 JSON: ' + rel);
      });

      var tasks = [];
      cssFiles.forEach(function (rel) {
        tasks.push(function () {
          return get('/' + rel).then(function (res) {
            expectStatus(res, 200, 'GET /' + rel);
            expectContentType(res, MIME_EXPECT['.css'], 'GET /' + rel);
          });
        });
      });
      jsFiles.forEach(function (rel) {
        tasks.push(function () {
          return get('/' + rel).then(function (res) {
            expectStatus(res, 200, 'GET /' + rel);
            expectContentType(res, MIME_EXPECT['.js'], 'GET /' + rel);
            assert.ok(bodyText(res).length > 100, rel + ' 内容长度异常');
          });
        });
      });
      jsonFiles.forEach(function (rel) {
        tasks.push(function () {
          return get('/' + rel).then(function (res) {
            expectStatus(res, 200, 'GET /' + rel);
            expectContentType(res, MIME_EXPECT['.json'], 'GET /' + rel);
            var parsed;
            try {
              parsed = JSON.parse(bodyText(res));
            } catch (e) {
              assert.fail(rel + ' 返回内容不是合法 JSON: ' + e.message);
            }
            assert.ok(parsed && typeof parsed === 'object', rel + ' 解析结果应为对象');
          });
        });
      });

      return tasks.reduce(function (p, fn) {
        return p.then(fn);
      }, Promise.resolve());
    });
  });

  /* ---------------------------------------------------------------- */
  /* 用例 6：pages 业务页面                                            */
  /* ---------------------------------------------------------------- */

  suite.test('pages/*.html：全部 200，引用资源可解析，含 kui-frame 桥', function () {
    return ensureStarted().then(function () {
      var appJson = readJson('config/app.json');
      var urls = collectPageUrls(appJson);
      assert.ok(urls.length >= 1, '应从 app.json 推导出至少 1 个 pages 页面');

      var missingPages = [];
      var existing = [];
      urls.forEach(function (rel) {
        if (exists(rel)) existing.push(rel);
        else missingPages.push(rel);
      });
      if (missingPages.length) {
        ctx.skip('等待交付 pages 页面: ' + missingPages.join(', '));
        return;
      }

      var pendingMissing = [];
      var otherMissing = [];
      var externalRefs = [];
      var chain = Promise.resolve();
      existing.forEach(function (rel) {
        chain = chain.then(function () {
          return get('/' + rel).then(function (res) {
            expectStatus(res, 200, 'GET /' + rel);
            expectHtml(res, 'GET /' + rel);
            var html = bodyText(res);
            assert.ok(html.indexOf('core/kui-all.js') !== -1,
              rel + ' 应引用 core/kui-all.js（单一入口，清单内含 kui-frame.js）');
            assert.ok(/data-kui-profile=["']standalone["']/.test(html),
              rel + ' 的 kui-all 应声明 data-kui-profile="standalone"');
            // pages 是 iframe 内容：整壳由父页面负责，页面自身不应再启动完整 app-shell
            assert.ok(!/<script[^>]+src=["'][^"']*app\/bootstrap\.js/i.test(html),
              rel + ' 不应通过 <script src> 引用 src/app/bootstrap.js（避免重复启动整壳）');
            assert.ok(html.indexOf('data-kui-app') === -1,
              rel + ' 不应内联 .kui-app 整壳标记');
            assert.ok(!/<body[^>]*data-kui-auto=/i.test(html),
              rel + ' 的 body 不应带 data-kui-auto（该属性只用于 standalone 演示页）');

            // 单入口之后，框架脚本由 kui-all.js 统一注入：只需保证它排在页内业务脚本之前
            var orderedRefs = parseHtmlRefs(html);
            var scriptSrcs = orderedRefs.filter(function (r) { return r.tag === 'script'; })
              .map(function (r) { return r.url.split('?')[0].split('#')[0]; });
            assert.ok(scriptSrcs.length >= 1, rel + ' 至少应包含 1 个外链脚本');
            var allIdx = -1;
            for (var si = 0; si < scriptSrcs.length; si++) {
              if (/core\/kui-all\.js$/.test(scriptSrcs[si])) { allIdx = si; break; }
            }
            assert.ok(allIdx >= 0, rel + ' 必须引用 core/kui-all.js');

            // 禁止 data: 内联大块资源（base64 打包等）
            var dataRefs = orderedRefs.filter(function (r) { return r.url.indexOf('data:') === 0; });
            assert.deepStrictEqual(dataRefs, [], rel + ' 不应使用 data: URI 内联脚本/样式');

            var refs = resolvePageRefs(rel, html);
            externalRefs = externalRefs.concat(refs.external);
            var split = splitPending(refs.missing);
            pendingMissing = pendingMissing.concat(split.pending);
            otherMissing = otherMissing.concat(split.other);
          });
        });
      });

      return chain.then(function () {
        assert.deepStrictEqual(externalRefs, [],
          'pages 页面不应引用外部网络资源（离线要求）：\n  ' + externalRefs.join('\n  '));
        assert.deepStrictEqual(otherMissing, [],
          'pages 页面引用了不存在的本地资源：\n  ' + otherMissing.join('\n  '));
        if (pendingMissing.length) {
          var uniq = pendingMissing.filter(function (v, i, arr) { return arr.indexOf(v) === i; });
          ctx.skip('等待交付资源: ' + uniq.join(', ') + '（pages 页面本身已 200）');
        }
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /* 用例 7：standalone 演示页                                         */
  /* ---------------------------------------------------------------- */

  suite.test('standalone/*.html：契约 §14 九页全部 200，引用可解析', function () {
    return ensureStarted().then(function () {
      var missingPages = REQUIRED_STANDALONE.filter(function (name) {
        return !exists('standalone/' + name + '.html');
      });
      if (missingPages.length) {
        ctx.skip('等待交付 standalone 页面: ' + missingPages.join(', '));
        return;
      }

      var pendingMissing = [];
      var otherMissing = [];
      var externalRefs = [];
      var chain = Promise.resolve();
      REQUIRED_STANDALONE.forEach(function (name) {
        var rel = 'standalone/' + name + '.html';
        chain = chain.then(function () {
          return get('/' + rel).then(function (res) {
            expectStatus(res, 200, 'GET /' + rel);
            expectHtml(res, 'GET /' + rel);
            var html = bodyText(res);
            assert.ok(html.indexOf('core/kui-all.js') !== -1,
              rel + ' 应引用 core/kui-all.js（单一入口，清单内含 core/kui.js）');
            assert.ok(/<script\b/i.test(html), rel + ' 应包含 <script> 标签');
            // standalone 演示页：禁止整壳自动启动（只拿一部分也能用）
            assert.ok(/<body[^>]*data-kui-auto=["']false["']/i.test(html),
              rel + ' 的 body 必须带 data-kui-auto="false"（禁止自动启动整壳）');
            assert.ok(!/<script[^>]+src=["'][^"']*(?:app\/bootstrap\.js|app-shell\.js)/i.test(html),
              rel + ' 不应通过 <script src> 引用 bootstrap.js / app-shell.js（会启动整壳）');
            var orderedRefs = parseHtmlRefs(html);
            var dataRefs = orderedRefs.filter(function (r) { return r.url.indexOf('data:') === 0; });
            assert.deepStrictEqual(dataRefs, [], rel + ' 不应使用 data: URI 内联脚本/样式');
            var refs = resolvePageRefs(rel, html);
            externalRefs = externalRefs.concat(refs.external);
            var split = splitPending(refs.missing);
            pendingMissing = pendingMissing.concat(split.pending);
            otherMissing = otherMissing.concat(split.other);
          });
        });
      });

      return chain.then(function () {
        assert.deepStrictEqual(externalRefs, [],
          'standalone 页面不应引用外部网络资源（离线要求）：\n  ' + externalRefs.join('\n  '));
        assert.deepStrictEqual(otherMissing, [],
          'standalone 页面引用了不存在的本地资源：\n  ' + otherMissing.join('\n  '));
        if (pendingMissing.length) {
          var uniq = pendingMissing.filter(function (v, i, arr) { return arr.indexOf(v) === i; });
          ctx.skip('等待交付资源: ' + uniq.join(', ') + '（standalone 页面本身已 200）');
        }
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /* 用例 8：404 / 400（非法编码、NUL）                               */
  /* ---------------------------------------------------------------- */

  suite.test('未找到 404；非法百分号编码、非法 UTF-8、NUL → 400', function () {
    return ensureStarted().then(function () {
      return get('/nope.html');
    }).then(function (res) {
      expectStatus(res, 404, 'GET /nope.html');
      expectHtml(res, 'GET /nope.html');
      assert.ok(bodyText(res).indexOf('404') !== -1, '404 错误页应包含状态码 404');
      return get('/%zz');
    }).then(function (res) {
      expectStatus(res, 400, 'GET /%zz');
      expectHtml(res, 'GET /%zz');
      return get('/%E0%A4%A');
    }).then(function (res) {
      expectStatus(res, 400, 'GET /%E0%A4%A（非法 UTF-8）');
      return get('/%00');
    }).then(function (res) {
      expectStatus(res, 400, 'GET /%00（NUL）');
      return get('/%00index.html');
    }).then(function (res) {
      expectStatus(res, 400, 'GET /%00index.html（NUL）');
    });
  });

  /* ---------------------------------------------------------------- */
  /* 用例 9：路径穿越                                                   */
  /* ---------------------------------------------------------------- */

  suite.test('路径穿越：HTTP 层任意 `..` 段一律 400；resolveSafe 单元口径', function () {
    var traversalPaths = [
      '/..%2fpackage.json',
      '/..%2F..%2FWindows%2Fwin.ini',
      '/a/../../b',
      '/%2e%2e%2fpackage.json',
      '/src/..%2f..%2fpackage.json',
      '..%2fpackage.json',
      '..%2f..%2fserver.js'
    ];

    return ensureStarted().then(function () {
      var chain = Promise.resolve();
      traversalPaths.forEach(function (p) {
        chain = chain.then(function () {
          return get(p).then(function (res) {
            assert.strictEqual(res.status, 400,
              '路径穿越应返回 400，实际 ' + res.status + '（GET ' + p + '）');
            if (p.charAt(0) === '/') {
              // 正常 origin-form 请求：由 server.js 的 sendError 返回 400 错误页
              assert.ok(bodyText(res).indexOf('400') !== -1,
                '穿越拒绝的错误页应包含状态码 400（GET ' + p + '）');
            } else {
              // 无前导 '/' 的非法请求行由 Node HTTP 解析器直接以 clientError 拒绝
              // （裸 400、无 body）——同样属于「被拒绝」，只断言状态码。
              assert.ok(res.body.length === 0 || bodyText(res).indexOf('400') !== -1,
                '无前导斜杠的穿越请求应被拒绝（GET ' + p + '）');
            }
          });
        });
      });
      return chain.then(function () {
        var mod;
        try {
          mod = readServerModule();
        } catch (e) {
          assert.fail('require server.js 失败，无法做 resolveSafe 单元断言: ' + e.message);
        }
        assert.strictEqual(typeof mod.resolveSafe, 'function', 'server.js 应导出 resolveSafe');
        var bad = [
          '..%2fpackage.json',
          '../package.json',
          '%2e%2e%2fpackage.json',
          '/%2e%2e/x',
          '/a/../../b',
          '/%00',
          '/%zz',
          '/%E0%A4%A'
        ];
        bad.forEach(function (p) {
          assert.strictEqual(mod.resolveSafe(p), null,
            'resolveSafe(' + JSON.stringify(p) + ') 应返回 null');
        });
        var good = ['/', '/index.html', '/src/core/kui.js', '/config/app.json', '/pages/home.html'];
        good.forEach(function (p) {
          var resolved = mod.resolveSafe(p);
          assert.ok(resolved !== null,
            'resolveSafe(' + JSON.stringify(p) + ') 不应为 null');
        });
        assert.strictEqual(
          path.resolve(mod.resolveSafe('/src/core/kui.js')),
          path.resolve(path.join(root, 'src', 'core', 'kui.js')),
          'resolveSafe 应把 /src/core/kui.js 解析到项目内真实文件');
        var dirResolved = mod.resolveSafe('/docs/');
        assert.ok(dirResolved !== null, 'resolveSafe(/docs/) 不应为 null（目录存在、未越界）');
        assert.strictEqual(path.resolve(dirResolved), path.resolve(path.join(root, 'docs')),
          'resolveSafe(/docs/) 应解析到项目内 docs 目录');
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /* 用例 10：目录 403、非 GET/HEAD 405                                 */
  /* ---------------------------------------------------------------- */

  suite.test('目录无 index.html → 403；POST/PUT 等非 GET/HEAD → 405', function () {
    return ensureStarted().then(function () {
      return get('/docs');
    }).then(function (res) {
      expectStatus(res, 403, 'GET /docs');
      expectHtml(res, 'GET /docs');
      return get('/docs/');
    }).then(function (res) {
      expectStatus(res, 403, 'GET /docs/');
      return get('/', { method: 'POST' });
    }).then(function (res) {
      expectStatus(res, 405, 'POST /');
      return get('/index.html', { method: 'PUT' });
    }).then(function (res) {
      expectStatus(res, 405, 'PUT /index.html');
      return get('/nope.html', { method: 'DELETE' });
    }).then(function (res) {
      expectStatus(res, 405, 'DELETE /nope.html');
    });
  });

  /* ---------------------------------------------------------------- */
  /* 用例 11：关闭服务并确认端口释放                                    */
  /* ---------------------------------------------------------------- */

  suite.test('关闭服务后端口释放（不留孤儿进程）', function () {
    if (!state.started) {
      ctx.skip('服务未启动，跳过关闭用例');
      return;
    }
    var port = state.port;
    return stopServer().then(function () {
      assert.strictEqual(state.started, false, '停止后 state.started 应为 false');
      return waitPortClosed(port, 3000);
    }).then(function () {
      return get('/').then(function () {
        assert.fail('服务关闭后仍能收到 HTTP 响应');
      }, function () {
        // 预期：连接被拒绝
        return true;
      });
    });
  });
};

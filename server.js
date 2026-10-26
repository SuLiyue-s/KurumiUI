/**
 * KurumiUI —— 本地静态服务器（零依赖）
 * ---------------------------------------------------------------
 * 用途：本项目是纯前端 + JSON 配置的框架，浏览器出于安全限制无法
 * 通过 file:// 读取 JSON 配置（CORS），因此官方推荐 `node server.js`
 * 后访问 http://127.0.0.1:8080 。
 *
 * 兼容 Node 13.14：仅使用 http / fs / path / url 等内置模块，
 * 不使用 ?. ?? replaceAll 等新语法。
 */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');

var ROOT = __dirname;
var DEFAULT_PORT = 8080;
var DEFAULT_HOST = '127.0.0.1';

var MIME = {
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

function parseArgs(argv) {
  var opts = { port: DEFAULT_PORT, host: DEFAULT_HOST, open: false, quiet: false };
  argv = argv || [];
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if ((a === '--port' || a === '-p') && argv[i + 1]) {
      opts.port = parseInt(argv[++i], 10) || DEFAULT_PORT;
    } else if (a.indexOf('--port=') === 0) {
      opts.port = parseInt(a.slice(7), 10) || DEFAULT_PORT;
    } else if ((a === '--host' || a === '-h') && argv[i + 1]) {
      opts.host = argv[++i];
    } else if (a.indexOf('--host=') === 0) {
      opts.host = a.slice(7);
    } else if (a === '--quiet') {
      opts.quiet = true;
    } else if (a === '--help') {
      console.log('用法: node server.js [--port 8080] [--host 127.0.0.1] [--quiet]');
      process.exit(0);
    }
  }
  return opts;
}

/** 把 URL 路径解析为 ROOT 内的安全绝对路径；越界/非法返回 null */
function resolveSafe(urlPath) {
  var raw = String(urlPath || '/');
  var q = raw.indexOf('?');
  if (q !== -1) raw = raw.slice(0, q);
  var decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch (e) {
    return null;
  }
  if (decoded.indexOf('\u0000') !== -1) return null;
  decoded = decoded.replace(/\\/g, '/');
  // 去掉协议头/域名（防御性）
  decoded = decoded.replace(/^[a-zA-Z]+:\/\/[^/]*/, '');
  // 拒绝任何「向上穿越」：decode 之后逐段检查，`..%2f`、`/../`、`a/../../b` 一律非法。
  // 必须在 normalize 之前判断，否则会被 normalize 钳制成合法路径。
  var segments = decoded.split('/');
  for (var i = 0; i < segments.length; i++) {
    if (segments[i] === '..') return null;
  }
  var normalized = path.posix.normalize(decoded);
  // 双重保险：normalize 之后仍以 .. 开头也算越界
  if (normalized === '..' || normalized.indexOf('../') === 0) return null;
  var rel = normalized.replace(/^\/+/, '');
  var full = path.resolve(ROOT, rel);
  var rootWithSep = ROOT + path.sep;
  if (full !== ROOT && full.indexOf(rootWithSep) !== 0) return null;
  return full;
}

function send(res, status, headers, body) {
  var h = headers || {};
  h['Cache-Control'] = h['Cache-Control'] || 'no-store, no-cache, must-revalidate';
  h['X-Content-Type-Options'] = 'nosniff';
  res.writeHead(status, h);
  if (body === undefined || body === null) {
    res.end();
    return;
  }
  // 流式响应（静态文件）：用 pipe，避免把 ReadStream 交给 res.end 导致
  // ERR_INVALID_ARG_TYPE → 未捕获异常 → 进程崩溃。
  if (typeof body.pipe === 'function') {
    body.on('error', function (e) {
      try { res.destroy(); } catch (e2) { /* noop */ }
      if (!res.__kuiQuiet) console.error('[500] 读取文件失败: ' + (e && e.message));
    });
    body.pipe(res);
    return;
  }
  res.end(body);
}

function sendError(res, status, message) {
  var body = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<title>' + status + ' · KurumiUI</title>' +
    '<style>html,body{height:100%}body{margin:0;display:flex;align-items:center;justify-content:center;' +
    'background:#08050a;color:#e8d8dc;font:14px/1.7 "Microsoft YaHei",sans-serif;text-align:center}' +
    'b{display:block;font-size:64px;color:#c8102e;letter-spacing:.08em}' +
    'span{color:#8f7f86;display:block;margin-top:6px;font-size:12px}</style></head><body><div>' +
    '<b>' + status + '</b><div>' + String(message) + '</div>' +
    '<span>KurumiUI · 刻刻帝终端</span></div></body></html>';
  send(res, status, { 'Content-Type': 'text/html; charset=utf-8' }, body);
}

function serveStatic(req, res, opts) {
  var parsed = url.parse(req.url);
  var pathname = parsed.pathname || '/';

  if (pathname === '/') pathname = '/index.html';

  var full = resolveSafe(pathname);
  if (!full) {
    if (!opts.quiet) console.log('[404] 非法路径 ' + pathname);
    return sendError(res, 400, '请求路径非法');
  }

  fs.stat(full, function (err, stat) {
    if (err) {
      if (!opts.quiet) console.log('[404] ' + pathname);
      return sendError(res, 404, '未找到 ' + pathname);
    }

    if (stat.isDirectory()) {
      var indexPath = path.join(full, 'index.html');
      if (fs.existsSync(indexPath)) {
        full = indexPath;
        stat = fs.statSync(full);
      } else {
        return sendError(res, 403, '目录不可浏览: ' + pathname);
      }
    }

    var ext = path.extname(full).toLowerCase();
    var type = MIME[ext] || 'application/octet-stream';
    var headers = {
      'Content-Type': type,
      'Content-Length': stat.size
    };

    if (req.method === 'HEAD') return send(res, 200, headers, null);

    send(res, 200, headers, fs.createReadStream(full));
    if (!opts.quiet && ext !== '.map') {
      console.log('[200] ' + pathname + '  ' + type.split(';')[0] + '  ' + stat.size + 'B');
    }
  });
}

function createServer(opts) {
  opts = opts || {};
  opts.port = opts.port || DEFAULT_PORT;
  opts.host = opts.host || DEFAULT_HOST;
  opts.quiet = !!opts.quiet;

  var server = http.createServer(function (req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendError(res, 405, '仅支持 GET / HEAD');
    }
    try {
      serveStatic(req, res, opts);
    } catch (e) {
      console.error('[500] ' + (e && e.stack ? e.stack : e));
      sendError(res, 500, '服务器内部错误');
    }
  });

  server.on('clientError', function (err, socket) {
    try {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    } catch (e) { /* ignore */ }
  });

  return server;
}

function listen(server, opts, cb) {
  server.on('error', function (e) {
    if (e && e.code === 'EADDRINUSE') {
      console.error('端口 ' + opts.port + ' 已被占用，正在尝试 ' + (opts.port + 1));
      opts.port += 1;
      setTimeout(function () {
        server.listen(opts.port, opts.host);
      }, 60);
      return;
    }
    console.error('服务器启动失败: ' + (e && e.message ? e.message : e));
    process.exitCode = 1;
  });
  server.listen(opts.port, opts.host, function () {
    var addr = server.address();
    var shown = opts.host === '0.0.0.0' ? '127.0.0.1' : opts.host;
    var link = 'http://' + shown + ':' + addr.port + '/';
    console.log('');
    console.log('  KurumiUI · 刻刻帝终端');
    console.log('  ────────────────────────────────────────────');
    console.log('  本地地址: ' + link);
    console.log('  根目录  : ' + ROOT);
    console.log('  Node    : ' + process.version);
    console.log('  停止服务: Ctrl + C');
    console.log('');
    if (typeof cb === 'function') cb(server, addr.port);
  });
  return server;
}

function start(argv) {
  var opts = parseArgs(argv);

  // 启动时重新生成配置包与单一入口清单（file:// 兜底、离线校验、模块清单一致性）
  try {
    var builder = require('./tools/build-config.js');
    if (builder && typeof builder.build === 'function') {
      builder.build({ silent: true, root: ROOT });
    }
    var allBuilder = require('./tools/build-all.js');
    if (allBuilder && typeof allBuilder.build === 'function') {
      allBuilder.build({ silent: true, root: ROOT });
    }
  } catch (e) {
    console.warn('[warn] 生成配置包 / kui-all.js 失败（不影响 http 模式）: ' + (e && e.message ? e.message : e));
  }

  var server = createServer(opts);
  listen(server, opts);
  return server;
}

module.exports = {
  createServer: createServer,
  listen: listen,
  start: start,
  parseArgs: parseArgs,
  resolveSafe: resolveSafe,
  MIME: MIME,
  ROOT: ROOT
};

if (require.main === module) {
  start(process.argv.slice(2));
}

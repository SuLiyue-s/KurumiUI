#!/usr/bin/env node
/*!
 * KurumiUI · 视觉验证截图工具（零依赖，兼容 Node 13.14）
 * -----------------------------------------------------------------------------
 * 用本机 Edge / Chrome 的 headless 模式给页面截图，产出到 .shots/ 目录，
 * 用于人工核对「科技未来 + 动漫（时崎狂三）」风格的视觉一致性。
 *
 * 用法：
 *   node tools/screenshot.js                        # 启动内置服务器，截默认页面
 *   node tools/screenshot.js --open               # 截完自动打开图片目录
 *   node tools/screenshot.js --pages=index.html,standalone/controls.html
 *   node tools/screenshot.js --theme=starry       # 追加 ?kuiTheme=starry
 *   node tools/screenshot.js --size=1600x1000 --wait=2500
 *   node tools/screenshot.js --url=http://127.0.0.1:8080/   # 用已有服务
 *
 * 说明：headless 截图不触发鼠标交互，弹窗/浮层类页面由 standalone 页面自演示。
 */

'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');
var http = require('http');
var childProcess = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var OUT_DIR = path.join(ROOT, '.shots');

var BROWSERS = [
  process.env.KUI_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];

/* ------------------------------------------------------------------ 参数解析 */

function parseArgs(argv) {
  var out = {
    pages: ['index.html'],
    theme: '',
    size: '1600x1000',
    wait: 2500,
    url: '',
    out: OUT_DIR,
    open: false,
    quiet: false
  };
  (argv || process.argv.slice(2)).forEach(function (arg) {
    var m = /^--([a-zA-Z][\w-]*)(?:=(.*))?$/.exec(arg);
    if (!m) return;
    var key = m[1];
    var val = m[2] == null ? '' : m[2];
    if (key === 'pages') out.pages = val ? val.split(',').map(trim) : [];
    else if (key === 'theme') out.theme = val;
    else if (key === 'size') out.size = val;
    else if (key === 'wait') out.wait = parseInt(val, 10) || out.wait;
    else if (key === 'url') out.url = val;
    else if (key === 'out') out.out = path.resolve(ROOT, val);
    else if (key === 'open') out.open = true;
    else if (key === 'quiet') out.quiet = true;
  });
  return out;
}

function trim(s) { return String(s || '').trim(); }

/* -------------------------------------------------------------------- 工具 */

function log(msg) { process.stdout.write('[shot] ' + msg + '\n'); }

function mkdirp(dir) {
  if (fs.existsSync(dir)) return;
  mkdirp(path.dirname(dir));
  try { fs.mkdirSync(dir); } catch (e) { /* 并发安全 */ }
}

function findBrowser() {
  for (var i = 0; i < BROWSERS.length; i++) {
    var file = BROWSERS[i];
    if (file && fs.existsSync(file)) return file;
  }
  return '';
}

function safeName(page) {
  return String(page || 'index')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'page';
}

/* -------------------------------------------------------------------- 服务 */

function startServer(port) {
  var server = require('../server.js');
  return new Promise(function (resolve, reject) {
    var instance = server.createServer();
    instance.on('error', reject);
    instance.listen(port || 0, '127.0.0.1', function () {
      var addr = instance.address();
      resolve({ server: instance, origin: 'http://127.0.0.1:' + addr.port });
    });
  });
}

function stopServer(instance) {
  return new Promise(function (resolve) {
    if (!instance) return resolve();
    try { instance.close(function () { resolve(); }); } catch (e) { resolve(); }
  });
}

/* ------------------------------------------------------------------ 截图 */

function shoot(browser, url, file, size, wait) {
  var args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--force-device-scale-factor=1',
    '--window-size=' + size,
    '--virtual-time-budget=' + Math.max(1000, wait),
    '--user-data-dir=' + path.join(os.tmpdir(), 'kui-shot-profile'),
    '--screenshot=' + file,
    url
  ];
  var res = childProcess.spawnSync(browser, args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
    timeout: Math.max(20000, wait + 15000)
  });
  var okFile = fs.existsSync(file) && fs.statSync(file).size > 1024;
  return {
    ok: okFile,
    file: file,
    stderr: res.stderr ? String(res.stderr).split(/\r?\n/).filter(function (l) {
      return l && !/DevTools|Fontconfig|GPU|dbus|Certificate|voice|Angle/i.test(l);
    }).slice(-3).join(' | ') : ''
  };
}

/* -------------------------------------------------------------------- 主流程 */

function main() {
  var opts = parseArgs();
  var browser = findBrowser();
  if (!browser) {
    log('未找到 Chrome / Edge，可用 KUI_BROWSER 指定浏览器可执行文件路径');
    process.exitCode = 2;
    return Promise.resolve();
  }
  mkdirp(opts.out);
  log('浏览器: ' + browser);
  log('输出目录: ' + path.relative(ROOT, opts.out) || opts.out);

  return (opts.url
    ? Promise.resolve({ server: null, origin: opts.url.replace(/\/+$/, '') })
    : startServer(0)
  ).then(function (ctx) {
    var tasks = opts.pages.map(function (page) {
      return function () {
        var rel = page.indexOf('http') === 0 ? page : '/' + page.replace(/^\/+/, '');
        var url = opts.url || (ctx.origin + rel);
        if (opts.theme) {
          url += (url.indexOf('?') >= 0 ? '&' : '?') + 'kuiTheme=' + encodeURIComponent(opts.theme);
        }
        var file = path.join(opts.out, safeName(page).replace(/\.html?$/i, '') + (opts.theme ? '@' + opts.theme : '') + '.png');
        return new Promise(function (resolve) {
          var r = shoot(browser, url, file, opts.size, opts.wait);
          log((r.ok ? '✔ ' : '✘ ') + path.relative(ROOT, file) + '  ' + url + (r.stderr ? '  ' + r.stderr : ''));
          resolve(r);
        });
      };
    });

    return tasks.reduce(function (prev, task) {
      return prev.then(task);
    }, Promise.resolve()).then(function () {
      return stopServer(ctx.server);
    }).then(function () {
      log('完成，图片目录: ' + opts.out);
      if (opts.open) {
        try {
          var opener = process.platform === 'win32' ? 'explorer' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
          childProcess.spawn(opener, [opts.out], { detached: true, stdio: 'ignore' }).unref();
        } catch (e) { /* 忽略 */ }
      }
    });
  }).catch(function (err) {
    log('失败: ' + (err && err.stack || err));
    process.exitCode = 1;
  });
}

if (require.main === module) main();

module.exports = { main: main, parseArgs: parseArgs, shoot: shoot, findBrowser: findBrowser };

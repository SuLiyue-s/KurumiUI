/*!
 * tools/audit-all-pages.js —— 第四轮反馈①「是否还有其他未注册元素」的审计探针
 * ---------------------------------------------------------------
 * 用 test/dom-stub.js 在 Node 里加载 pages/*.html 与 standalone/*.html 的
 * 全部脚本与内联脚本，逐个页面断言：
 *   1) 渲染后没有 .kui-unknown 占位，也没有「未注册的元素类型」文本；
 *   2) 没有 console.error；
 *   3) 悬浮提示模块（KUI.tooltip）已加载（tooltip.js 在脚本清单内）；
 *   4) 页面引用的脚本全部存在（零 404 风险，等价于 check-assets 的语义）。
 *
 * 用法：
 *   node tools/audit-all-pages.js
 *   node tools/audit-all-pages.js --verbose
 */
'use strict';

var fs = require('fs');
var path = require('path');
var dom = require('../test/dom-stub');
var loadKui = require('../test/load-kui');

var ROOT = path.resolve(__dirname, '..');
var verbose = process.argv.indexOf('--verbose') !== -1;
var checks = 0;
var failures = 0;

function check(name, ok, detail) {
  checks += 1;
  if (ok) {
    if (verbose) console.log('  ✔ ' + name + (detail ? '  ' + detail : ''));
  } else {
    failures += 1;
    console.log('  ✘ ' + name + (detail ? '  ' + detail : ''));
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function parsePage(rel) {
  var html = read(rel);
  var titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(html);
  var bodyMatch = /<body([^>]*)>([\s\S]*?)<\/body>/i.exec(html);
  var bodyAttrs = bodyMatch ? bodyMatch[1] : '';
  var bodyHtml = bodyMatch ? bodyMatch[2] : '';
  bodyHtml = bodyHtml.replace(/<script[\s\S]*?<\/script>/gi, '');
  var scripts = [];
  var re = /<script[^>]*\bsrc="([^"]+)"/gi;
  var m;
  while ((m = re.exec(html))) { scripts.push(m[1]); }
  var inline = [];
  var re2 = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = re2.exec(html))) { inline.push(m[1]); }
  return {
    rel: rel,
    title: titleMatch ? titleMatch[1].trim() : path.basename(rel),
    bodyAttrs: bodyAttrs || '',
    bodyHtml: bodyHtml,
    scripts: scripts,
    inline: inline
  };
}

function makeConsole(logs) {
  function push(level) {
    return function () {
      var parts = [];
      for (var i = 0; i < arguments.length; i++) {
        var a = arguments[i];
        if (a instanceof Error) parts.push(a.message);
        else if (typeof a === 'object') parts.push('[object]');
        else parts.push(String(a));
      }
      logs.push({ level: level, text: parts.join(' ') });
    };
  }
  return { log: push('log'), info: push('info'), warn: push('warn'), error: push('error'), debug: push('debug') };
}

/* 解析页内相对脚本（../src/... 归一化到根；同目录脚本补全目录前缀） */
function resolveScript(rel, pageRel) {
  var norm = rel;
  while (norm.indexOf('../') === 0) norm = norm.slice(3);
  if (fs.existsSync(path.join(ROOT, norm))) return norm;
  var localRel = path.dirname(pageRel).split(path.sep).join('/') + '/' + rel;
  if (fs.existsSync(path.join(ROOT, localRel))) return localRel;
  return null;
}

var KUI_ALL = require(path.join(ROOT, 'src/core/kui-all.js'));
var KUI_ALL_FILES = (KUI_ALL.profiles.standalone || {}).files || [];

var KUI_ALL = require(path.join(ROOT, 'src/core/kui-all.js'));
var KUI_ALL_FILES = (KUI_ALL.profiles.standalone || {}).files || [];

function loadPageScripts(env, page) {
  /* v1.0.9：页面只引 kui-all.js，这里展开成模块清单（与浏览器 document.write 的顺序一致） */
  var expanded = [];
  for (var si = 0; si < page.scripts.length; si++) {
    var one = page.scripts[si];
    if (/core\/kui-all\.js$/.test(one)) {
      for (var fi = 0; fi < KUI_ALL_FILES.length; fi++) { expanded.push(KUI_ALL_FILES[fi]); }
    } else { expanded.push(one); }
  }
  for (var i = 0; i < expanded.length; i++) {
    var raw = expanded[i];
    var rel = raw.indexOf('/') === -1 ? resolveScript(raw, page.rel) : (fs.existsSync(path.join(ROOT, raw)) ? raw : resolveScript(raw, page.rel));
    if (!rel) {
      /* 远端/数据 URL 只允许 data: 内联图标等，其他视为缺文件 */
      if (raw.indexOf('data:') !== 0) {
        check('脚本存在：' + raw + '（' + page.rel + '）', false, 'missing file');
      }
      continue;
    }
    if (rel === 'config/bundle.js') {
      env.window.__KUI_BUNDLE__ = loadKui.buildBundle(ROOT);
      env.window.KUI_BUNDLE = env.window.__KUI_BUNDLE__;
      continue;
    }
    if (rel === 'src/components/controls/index.js') {
      env.window.__KUI_CONTROLS_NO_BOOT__ = true;
      env.loadScript(rel);
      var KUI = env.window.KUI;
      var files = (KUI && KUI.controls && KUI.controls.files) ? KUI.controls.files.slice() : [];
      var ordered = ['control-base.js'];
      for (var j = 0; j < files.length; j++) {
        if (files[j] !== 'control-base.js') ordered.push(files[j]);
      }
      for (var k = 0; k < ordered.length; k++) {
        env.loadScript('src/components/controls/' + ordered[k]);
      }
      if (KUI && KUI.controls && typeof KUI.controls.init === 'function') KUI.controls.init();
      continue;
    }
    env.loadScript(rel);
  }
}

function loadInlineScripts(env, page) {
  for (var i = 0; i < page.inline.length; i++) {
    env.runCode(page.inline[i], page.rel + '#inline-' + (i + 1), page.rel);
  }
}

async function runPage(rel) {
  var page = parsePage(rel);
  var logs = [];
  var env = dom.createEnvironment({ root: ROOT, fileMode: true, url: dom.pathToFileHref(path.join(ROOT, rel)) });
  env.window.console = makeConsole(logs);
  var fakeParent = {
    postMessage: function () { },
    document: { title: 'KurumiUI' },
    location: { href: 'http://127.0.0.1:8080/index.html' }
  };
  env.window.parent = fakeParent;
  env.window.top = fakeParent;
  env.document.title = page.title;
  env.document.body.innerHTML = page.bodyHtml;
  if (page.bodyAttrs.indexOf('data-kui-auto') !== -1) {
    env.document.body.setAttribute('data-kui-auto', 'false');
  }

  var hasTooltipScript = false;
  for (var i = 0; i < page.scripts.length; i++) {
    if (page.scripts[i].indexOf('core/tooltip.js') >= 0) hasTooltipScript = true;
    if (page.scripts[i].indexOf('core/kui-all.js') >= 0 && KUI_ALL_FILES.indexOf('src/core/tooltip.js') >= 0) hasTooltipScript = true;
  }

  try {
    loadPageScripts(env, page);
    loadInlineScripts(env, page);
    for (var round = 0; round < 4; round++) { await delay(50); }
  } catch (e) {
    logs.push({ level: 'error', text: 'probe-exception: ' + (e && e.message ? e.message : String(e)) });
  }

  var doc = env.document;
  var unknowns = doc.querySelectorAll ? doc.querySelectorAll('.kui-unknown') : [];
  var bodyText = (doc.body && doc.body.textContent) || '';
  var errors = [];
  for (var n = 0; n < logs.length; n++) {
    if (logs[n].level === 'error') errors.push(logs[n].text);
  }
  var result = {
    page: rel,
    unknownCount: unknowns.length,
    hasUnknownText: bodyText.indexOf('未注册的元素类型') !== -1,
    errors: errors,
    hasTooltipScript: hasTooltipScript,
    hasTooltip: !!(env.window.KUI && env.window.KUI.tooltip),
    scriptCount: page.scripts.length
  };
  env.destroy();
  return result;
}

async function main() {
  var files = [];
  ['pages', 'standalone'].forEach(function (dir) {
    var d = path.join(ROOT, dir);
    fs.readdirSync(d).filter(function (f) { return /\.html$/.test(f); }).sort().forEach(function (f) {
      files.push(dir + '/' + f);
    });
  });

  console.log('=== KurumiUI 全页面注册审计（' + files.length + ' 个页面，dom-stub 探针）===');
  var bad = [];
  for (var i = 0; i < files.length; i++) {
    var r = await runPage(files[i]);
    var ok = r.unknownCount === 0 && !r.hasUnknownText && r.errors.length === 0 && r.hasTooltipScript && r.hasTooltip;
    if (!ok) {
      bad.push(r);
      console.log('✘ ' + r.page +
        '  unknown=' + r.unknownCount + ' text=' + r.hasUnknownText +
        ' tooltipScript=' + r.hasTooltipScript + ' tooltip=' + r.hasTooltip +
        (r.errors.length ? '  errors=' + r.errors.slice(0, 2).join(' | ') : ''));
    } else if (verbose) {
      console.log('✔ ' + r.page + '  scripts=' + r.scriptCount);
    }
    checks += 1;
    if (!ok) failures += 1;
  }

  console.log('\n=== 结果: ' + (files.length - bad.length) + ' / ' + files.length +
    ' 页面通过，失败 ' + failures + ' 项 ===');
  if (bad.length) process.exitCode = 1;
}

main().catch(function (e) {
  console.error('[audit] 探针异常：' + (e && e.stack ? e.stack : e));
  process.exitCode = 1;
});

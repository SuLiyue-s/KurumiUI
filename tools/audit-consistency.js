/*
 * KurumiUI · 一致性审计（源码 ↔ 测试 ↔ 构建产物）
 *
 * 目标（用户要求）：确认「源码」与「测试使用的代码」保持一致，不存在漂移。
 * 做法：所有路径/版本/清单都以「唯一事实来源」为准，逐项交叉比对。
 *
 *   事实来源 A：config/kui-modules.json     —— 模块清单（app / standalone 两个 profile）
 *   事实来源 B：src/core/kui-all.js         —— build-all 生成产物（应等于 A）
 *   事实来源 C：src/core/kui.js 的 KUI.version / package.json version / kui-frame fallback / dom-enhance VERSION
 *   事实来源 D：HTML 的 <script> 引用（单入口约定）
 *   事实来源 E：test/load-kui.js 的加载清单（应与 A 的 app profile 等价）
 *
 * 用法：node tools/audit-consistency.js [--verbose]
 * 退出码：0 = 全部通过；1 = 存在漂移
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var VERBOSE = process.argv.indexOf('--verbose') >= 0;

var pass = [];
var fail = [];
var warn = [];

function ok(name, extra) { pass.push({ name: name, extra: extra || '' }); }
function bad(name, detail) { fail.push({ name: name, detail: detail }); }
function warning(name, detail) { warn.push({ name: name, detail: detail }); }

function read(rel) {
  var p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { return null; }
  var raw = fs.readFileSync(p, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) { raw = raw.slice(1); }
  return raw;
}
function readJson(rel) {
  var t = read(rel);
  if (t === null) { return null; }
  try { return JSON.parse(t); } catch (e) { return null; }
}
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }
function listHtml(dir) {
  var out = [];
  var base = path.join(ROOT, dir);
  if (!fs.existsSync(base)) { return out; }
  fs.readdirSync(base).forEach(function (n) {
    if (/\.html$/i.test(n)) { out.push(dir + '/' + n); }
  });
  out.sort();
  return out;
}
function scriptsOf(html) {
  var out = [];
  var re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  var m;
  while ((m = re.exec(html))) {
    var src = m[1];
    var q = src.indexOf('?');
    out.push(q >= 0 ? src.slice(0, q) : src);
  }
  return out;
}
function normalizeRef(pageHtmlRel, ref) {
  // 相对 HTML 所在目录 → 站点根相对路径
  var dir = path.posix.dirname(pageHtmlRel);
  var base = path.posix.normalize(dir + '/' + ref);
  return base.replace(/^\.\//, '');
}

/* ============ A. 模块清单 ============ */
var modules = readJson('config/kui-modules.json');
if (!modules || !modules.profiles) {
  bad('A1 config/kui-modules.json 可解析', '文件缺失或 JSON 非法');
} else {
  ok('A1 config/kui-modules.json 可解析');
  var appFiles = (modules.profiles.app || {}).files || [];
  var stdFiles = (modules.profiles.standalone || {}).files || [];

  var missing = appFiles.concat(stdFiles).filter(function (f, i, arr) {
    return arr.indexOf(f) === i && !exists(f);
  });
  if (missing.length) { bad('A2 清单文件均存在', '缺失：' + missing.join(', ')); }
  else { ok('A2 清单文件均存在', 'app=' + appFiles.length + ' / standalone=' + stdFiles.length); }

  // app 与 standalone 的差异应只有 app-shell/bootstrap 与 kui-frame 的取舍
  var onlyApp = appFiles.filter(function (f) { return stdFiles.indexOf(f) < 0; });
  var onlyStd = stdFiles.filter(function (f) { return appFiles.indexOf(f) < 0; });
  var expectOnlyApp = ['src/components/app-shell.js', 'src/components/handlers/app-shell.handlers.js', 'src/app/bootstrap.js'];
  var badDelta = onlyApp.filter(function (f) { return expectOnlyApp.indexOf(f) < 0; })
    .concat(onlyStd.filter(function (f) { return f !== 'src/frame/kui-frame.js'; }));
  if (badDelta.length) { bad('A3 两个 profile 的差异符合预期', '意外差异：' + badDelta.join(', ')); }
  else { ok('A3 两个 profile 的差异符合预期', '仅 app 独有=' + onlyApp.length + ' 项，仅 standalone 独有=' + onlyStd.length + ' 项'); }

  // 加载顺序约束（依赖先于使用者）
  function idx(list, f) { return list.indexOf(f); }
  var orderRules = [
    ['src/core/kui.js', 'src/core/icons.js'],
    ['src/core/icons.js', 'src/core/registry.js'],
    ['src/core/registry.js', 'src/core/avatar.js'],
    ['src/core/config.js', 'src/components/controls/index.js'],
    ['src/core/theme.js', 'src/core/theme-art.js'],
    ['src/core/registry.js', 'src/components/menu.js'],
    ['src/core/registry.js', 'src/components/tabs.js'],
    ['src/components/controls/index.js', 'src/components/form.js'],
    ['src/components/form.js', 'src/components/form.handlers.js'.replace('form.handlers.js', 'handlers/form.handlers.js')],
    ['src/components/menu.js', 'src/components/app-shell.js'],
    ['src/components/tabs.js', 'src/components/app-shell.js'],
    ['src/components/app-shell.js', 'src/app/bootstrap.js'],
    ['src/core/tooltip.js', 'src/app/bootstrap.js']
  ];
  var orderProblems = [];
  orderRules.forEach(function (rule) {
    var a = idx(appFiles, rule[0]);
    var b = idx(appFiles, rule[1]);
    if (a < 0 || b < 0) { orderProblems.push('清单缺少 ' + (a < 0 ? rule[0] : rule[1])); return; }
    if (a > b) { orderProblems.push(rule[0] + ' 应早于 ' + rule[1]); }
  });
  if (orderProblems.length) { bad('A4 模块加载顺序满足依赖', orderProblems.join('；')); }
  else { ok('A4 模块加载顺序满足依赖', orderRules.length + ' 条规则'); }
}

/* ============ B. 生成物 kui-all.js 与清单一致 ============ */
var kuiAll = read('src/core/kui-all.js');
if (!kuiAll) {
  bad('B1 src/core/kui-all.js 存在', '文件缺失');
} else {
  ok('B1 src/core/kui-all.js 存在');
  var mApp = kuiAll.match(/app\s*:\s*\{[^}]*files\s*:\s*\[([\s\S]*?)\]/);
  // 生成物结构较复杂，直接调用 node 解析更可靠：这里做「文件清单逐项包含」校验
  var listed = (modules && modules.profiles ? (modules.profiles.app.files || []) : []);
  var missingInBundle = listed.filter(function (f) { return kuiAll.indexOf(f) < 0; });
  if (missingInBundle.length) { bad('B2 kui-all.js 覆盖 app profile 全部模块', '缺少：' + missingInBundle.join(', ')); }
  else { ok('B2 kui-all.js 覆盖 app profile 全部模块', listed.length + ' 项'); }

  // 生成物必须与清单字节一致（比对 build-all 的产出一致性在 build-all 内做幂等；这里校验头部标记）
  if (kuiAll.indexOf('自动生成') < 0 && kuiAll.indexOf('AUTO-GENERATED') < 0) {
    warning('B3 kui-all.js 含「自动生成」标记', '未找到标记，可能被手改过');
  } else { ok('B3 kui-all.js 含「自动生成」标记'); }
}

/* ============ C. 版本号一致 ============ */
var pkg = readJson('package.json');
var kui = read('src/core/kui.js') || '';
var frame = read('src/frame/kui-frame.js') || '';
var domEnh = read('src/core/dom-enhance.js') || '';
var tooltipJs = read('src/core/tooltip.js') || '';

var vKui = (kui.match(/KUI\.version\s*=\s*'([\d.]+)'/) || [])[1] || '';
var vPkg = (pkg && pkg.version) || '';
var vFrame = (frame.match(/currentVersion\(\)\s*\|\|\s*'([\d.]+)'/) || [])[1] || '';
var vDom = (domEnh.match(/var VERSION\s*=\s*'([\d.]+)'/) || [])[1] || '';
var vTip = (tooltipJs.match(/version:\s*'([\d.]+)'/) || [])[1] || '';

if (!vKui) { bad('C1 能读出源码版本号', 'KUI.version 缺失'); }
else if (vKui !== vPkg || vKui !== vFrame || vKui !== vDom) {
  bad('C2 四份版本号一致（kui/package/kui-frame/dom-enhance）',
    'kui=' + vKui + ' pkg=' + vPkg + ' frame=' + vFrame + ' domEnhance=' + vDom);
} else {
  ok('C2 四份版本号一致', vKui);
}
if (!vTip) { bad('C3 tooltip 版本号存在', '未读出'); }
else { ok('C3 tooltip 版本号', vTip); }

/* ============ D. HTML 入口（单入口） ============ */
var htmls = ['index.html'].concat(listHtml('pages')).concat(listHtml('standalone'));
var htmlProblems = [];
var dialogFrameHtml = 'src/frame/dialog-frame.html';
htmls.forEach(function (rel) {
  var html = read(rel);
  if (html === null) { htmlProblems.push(rel + ' 不存在'); return; }
  var refs = scriptsOf(html).map(function (r) { return normalizeRef(rel, r); });
  var hasKuiAll = refs.some(function (r) { return /core\/kui-all\.js$/.test(r); });
  var hasThemeBoot = refs.some(function (r) { return /core\/theme-boot\.js$/.test(r); });
  var hasAppShell = refs.some(function (r) { return /components\/app-shell\.js$/.test(r); });
  if (!hasKuiAll) { htmlProblems.push(rel + ' 未使用单入口 kui-all.js'); }
  if (!hasThemeBoot) { htmlProblems.push(rel + ' 缺少 theme-boot.js（会闪主题）'); }
  if (rel.indexOf('pages/') === 0 || rel.indexOf('standalone/') === 0) {
    var profile = (html.match(/data-kui-profile\s*=\s*["']([^"']+)["']/) || [])[1] || '';
    if (!profile) { htmlProblems.push(rel + ' kui-all.js 缺少 data-kui-profile'); }
    if (hasAppShell) { htmlProblems.push(rel + ' 不应直接引 app-shell.js（应由 kui-all 按 profile 决定）'); }
  } else if (rel === 'index.html') {
    var prof2 = (html.match(/data-kui-profile\s*=\s*["']([^"']+)["']/) || [])[1] || '';
    if (prof2 !== 'app') { htmlProblems.push('index.html 的 data-kui-profile 应为 app，实际=' + prof2); }
  }
});
if (htmlProblems.length) { bad('D1 页面脚本装配符合单入口约定', htmlProblems.join('；')); }
else { ok('D1 页面脚本装配符合单入口约定', htmls.length + ' 个 HTML'); }

/* dialog-frame 例外：显式清单，且不应引 kui-all */
var dfHtml = read(dialogFrameHtml);
if (dfHtml === null) { bad('D2 dialog-frame.html 存在', '缺失'); }
else {
  var dfRefs = scriptsOf(dfHtml).map(function (r) { return normalizeRef(dialogFrameHtml, r); });
  var dfNeed = [
    'src/core/theme-boot.js', 'src/core/kui.js', 'src/core/tooltip.js', 'src/core/icons.js',
    'src/core/registry.js', 'src/core/config.js', 'src/core/theme.js', 'src/core/theme-art.js',
    'src/core/dom-enhance.js', 'src/components/controls/index.js', 'src/components/form.js',
    'src/frame/dialog-frame.js'
  ];
  var dfMissing = dfNeed.filter(function (f) { return dfRefs.indexOf(f) < 0; });
  var dfHasAll = dfRefs.some(function (r) { return /core\/kui-all\.js$/.test(r); });
  if (dfMissing.length) { bad('D2 dialog-frame 脚本清单完整', '缺少：' + dfMissing.join(', ')); }
  else if (dfHasAll) { bad('D2 dialog-frame 脚本清单完整', 'dialog-frame 不应使用 kui-all（它是独立精简文档）'); }
  else { ok('D2 dialog-frame 脚本清单完整', dfNeed.length + ' 个必需脚本'); }
}

/* ============ E. 测试加载清单 vs 模块清单 ============ */
var loadKui = read('test/load-kui.js');
if (!loadKui) { bad('E1 test/load-kui.js 存在', '缺失'); }
else {
  /* v1.3.5 起 load-kui.js 不再手写清单，改为从 config/kui-modules.json 派生：
   * 因此这里做「语义等价」检查 —— require 它，比较 app 清单是否与模块清单一致。 */
  var loadKuiMod = null;
  try { loadKuiMod = require(path.join(ROOT, 'test/load-kui.js')); } catch (e) { loadKuiMod = null; }
  if (!loadKuiMod) {
    bad('E2 测试加载清单与模块清单等价', 'test/load-kui.js 无法 require（' + (e && e.message) + '）');
  } else {
    var mkApp = (modules && modules.profiles && modules.profiles.app && modules.profiles.app.files) || [];
    var lkApp = loadKuiMod.APP_FILES || [];
    var mkNoBundle = mkApp.filter(function (f) { return !/^config\/bundle\.js$/.test(f); });
    var drift = [];
    mkNoBundle.forEach(function (f) { if (lkApp.indexOf(f) < 0) { drift.push(f); } });
    lkApp.forEach(function (f) { if (mkNoBundle.indexOf(f) < 0) { drift.push('+' + f); } });
    var derives = loadKui.indexOf('kui-modules.json') >= 0;
    if (!derives) { bad('E2 测试加载清单与模块清单等价', 'load-kui.js 未从 config/kui-modules.json 派生（疑似手写清单）'); }
    else if (drift.length) { bad('E2 测试加载清单与模块清单等价', '差异：' + drift.join(', ')); }
    else { ok('E2 测试加载清单与模块清单等价', lkApp.length + ' 个文件，由 kui-modules.json 派生'); }
  }
}

/* ============ E4. 控件类型清单 ↔ 注册表静态扫描 ============ */
(function () {
  var expected = null;
  try {
    expected = (require(path.join(ROOT, 'test', 'load-kui.js')).EXPECTED_CONTROL_TYPES || []).slice().sort();
  } catch (e) { expected = null; }
  var dir = path.join(ROOT, 'src', 'components', 'controls');
  var files = [];
  try { files = fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); }); } catch (e) { files = []; }
  var found = [];
  files.forEach(function (f) {
    var src = fs.readFileSync(path.join(dir, f), 'utf8');
    /* 控件既可能直接 KUI.registry.register(...)（components / 框架壳），
     * 也可能走 KUI.controls.define(...) 封装（src/components/controls/*.js, 32 处）——两者都要认。
     * 再用 category:'control' 过滤，排除 define('button',{category:'action'}) 这类非表单控件。 */
    var re = /(?:define|register)\(\s*'([a-z][a-z0-9-]*)'\s*,\s*\{[\s\S]{0,400}?category:\s*'control'/g;
    var mm;
    while ((mm = re.exec(src))) { found.push(mm[1]); }
  });
  var uniq = found.filter(function (v, i, arr) { return arr.indexOf(v) === i; }).sort();
  if (!expected) { bad('E4 控件类型清单与注册表一致', '无法读取 EXPECTED_CONTROL_TYPES'); return; }
  var missing = expected.filter(function (t) { return uniq.indexOf(t) < 0; });
  var extra = uniq.filter(function (t) { return expected.indexOf(t) < 0; });
  if (missing.length || extra.length) {
    bad('E4 控件类型清单与注册表一致', '清单有/源码无=' + (missing.join(',') || '-') + '；源码有/清单无=' + (extra.join(',') || '-'));
  } else {
    ok('E4 控件类型清单与注册表一致', uniq.length + ' 个 control 类型（静态扫描 controls/*.js）');
  }
})();

/* ============ F. 测试/冒烟脚本断言与源码的一致性 ============ */
['tools/smoke.js', 'test/config.test.js', 'test/render.test.js', 'test/server.test.js'].forEach(function (rel) {
  var t = read(rel);
  if (t === null) { warning('F ' + rel + ' 存在', '文件缺失'); return; }
  var staleVers = [];
  var re = /'1\.\d+\.\d+'/g;
  var mm;
  while ((mm = re.exec(t))) {
    var v = mm[0].replace(/'/g, '');
    if (v.indexOf(vKui + '.') !== 0 && v !== vKui && v !== '1.0.6' && v.indexOf('1.0.') !== 0) {
      // 仅记录「看起来像主版本号」的旧值
      if (/^1\.1\d?\.\d+$/.test(v) && v !== vKui) { staleVers.push(v); }
    }
  }
  if (staleVers.length) { bad('F ' + rel + ' 版本断言未漂移', '出现过期版本：' + staleVers.join(', ') + '（当前 ' + vKui + '）'); }
  else { ok('F ' + rel + ' 版本断言未漂移'); }
});

/* ============ 汇总 ============ */
function line(title, rows) {
  console.log('\n' + title + '（' + rows.length + '）');
  rows.forEach(function (r) {
    var mark = title.indexOf('失败') >= 0 ? '  ✘ ' : '  ✔ ';
    console.log(mark + r.name + (r.extra || r.detail ? '  ' + (r.extra || r.detail) : ''));
  });
}
console.log('=== KurumiUI 一致性审计（源码 ↔ 测试 ↔ 构建产物）===');
if (VERBOSE) {
  line('通过', pass);
  if (warn.length) { line('警告', warn); }
}
console.log('\n通过 ' + pass.length + ' 项 / 失败 ' + fail.length + ' 项 / 警告 ' + warn.length + ' 项');
if (fail.length) {
  line('失败', fail);
  process.exit(1);
}
if (warn.length) { line('警告', warn); }

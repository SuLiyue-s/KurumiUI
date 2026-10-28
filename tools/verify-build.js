/*
 * tools/verify-build.js —— 校验「源码」与「编译后运行代码」是否一致，以及版本号是否一致
 *
 * 背景：
 *   KurumiUI 的运行时代码有两份产物，它们都是「生成物」：
 *     1) src/core/kui-all.js  —— 由 config/kui-modules.json + tools/build-all.js 生成（清单装载器）
 *     2) config/bundle.js     —— 由 config/*.json + src/themes.json + tools/build-config.js 生成（JSON 包）
 *   产物一旦手工改过、或源码改了忘重建，浏览器跑的就是旧逻辑。本脚本用于一键判定：
 *     [A] kui-all.js 与 build-all 的当前输出是否逐字节一致（无手工改动、无过期）
 *     [B] bundle.js 与 build-config 的当前输出是否语义一致（忽略 meta.generatedAt 时间戳）
 *     [C] bundle.js 内嵌的 app/text/themes/demos 是否与磁盘上的源 JSON 一致
 *     [D] kui-all.js 的 MODULES 清单是否与 config/kui-modules.json 一致
 *     [E] 框架版本号（package.json / KUI.version / kui-frame 兜底 / dom-enhance VERSION）是否一致
 *   退出码：0 = 全部一致；1 = 存在不一致（逐项打印 diff 摘要）。
 *
 * 兼容 Node 13.14：仅用 fs / path / vm 内置模块与 ES5 语法。零依赖。
 *
 * 用法：node tools/verify-build.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var KUI_ALL = path.join(ROOT, 'src', 'core', 'kui-all.js');
var BUNDLE = path.join(ROOT, 'config', 'bundle.js');
var MANIFEST = path.join(ROOT, 'config', 'kui-modules.json');

var failures = [];
var passes = 0;

function pass(name, detail) {
  passes++;
  console.log('  [PASS] ' + name + (detail ? '  —— ' + detail : ''));
}

function fail(name, detail) {
  failures.push(name + (detail ? '：' + detail : ''));
  console.log('  [FAIL] ' + name + (detail ? '  —— ' + detail : ''));
}

function read(p) { return fs.readFileSync(p, 'utf8'); }

function readJson(p) {
  var raw = read(p).replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

/* 递归规范化：对象键排序，便于「语义相等」比较 */
function canonical(value) {
  if (value === null || typeof value !== 'object') { return JSON.stringify(value); }
  if (Array.isArray(value)) {
    var arr = [];
    for (var i = 0; i < value.length; i++) { arr.push(canonical(value[i])); }
    return '[' + arr.join(',') + ']';
  }
  var keys = Object.keys(value).sort();
  var parts = [];
  for (var k = 0; k < keys.length; k++) {
    parts.push(JSON.stringify(keys[k]) + ':' + canonical(value[keys[k]]));
  }
  return '{' + parts.join(',') + '}';
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }

/* 从 bundle.js 里取出 window.__KUI_BUNDLE__ */
function loadBundleData(file) {
  var code = read(file);
  var sandbox = { window: {} };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(code, sandbox, { filename: file });
  return sandbox.window.__KUI_BUNDLE__;
}

/* ============ A. kui-all.js 与生成器输出逐字节一致 ============ */
function checkKuiAll() {
  console.log('[A] src/core/kui-all.js ↔ tools/build-all.js 生成结果');
  var buildAll = require('./build-all.js');
  var before = read(KUI_ALL);
  var r = buildAll.build();           // 重写为当前生成结果（生成器是确定性的）
  var after = read(KUI_ALL);
  if (before === after) {
    pass('kui-all.js 与生成结果逐字节一致', r.bytes + ' 字节，' + r.counts);
  } else {
    fail('kui-all.js 与生成结果不一致（手工改过或已过期）', '已按生成器重建，请纳入提交');
  }
  return after;
}

/* ============ B/C. bundle.js 语义一致 + 与源 JSON 一致 ============ */
function stripMeta(data) {
  var copy = clone(data);
  if (copy.meta) { delete copy.meta.generatedAt; }
  return copy;
}

function expectedFromSources() {
  var expected = {};
  expected.app = readJson(path.join(ROOT, 'config', 'app.json'));
  expected.text = readJson(path.join(ROOT, 'config', 'text.json'));
  expected.themes = readJson(path.join(ROOT, 'src', 'themes.json'));
  var demoDir = path.join(ROOT, 'config', 'demos');
  var demos = {};
  var names = fs.readdirSync(demoDir).filter(function (f) { return /\.json$/i.test(f); }).sort();
  for (var i = 0; i < names.length; i++) {
    demos[names[i].replace(/\.json$/i, '')] = readJson(path.join(demoDir, names[i]));
  }
  expected.demos = demos;
  return expected;
}

function checkBundle() {
  console.log('[B] config/bundle.js ↔ tools/build-config.js 生成结果（忽略生成时间戳）');
  var buildConfig = require('./build-config.js');

  var before = loadBundleData(BUNDLE);
  var beforeSemantic = canonical(stripMeta(before));

  var r = buildConfig.build({ silent: true });   // 重写为当前生成结果
  var after = loadBundleData(BUNDLE);
  var afterSemantic = canonical(stripMeta(after));

  if (beforeSemantic === afterSemantic) {
    pass('bundle.js 与生成结果语义一致', (r.bytes / 1024).toFixed(1) + ' KB，demos=' + r.demoCount);
  } else {
    fail('bundle.js 与生成结果不一致（手工改过或已过期）', '已按生成器重建，请纳入运行产物');
  }

  console.log('[C] config/bundle.js 内嵌数据 ↔ 磁盘源 JSON');
  var expected = expectedFromSources();
  var keys = ['app', 'text', 'themes', 'demos'];
  var mismatched = [];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var got = stripMeta({ k: after[key] }).k;
    if (canonical(got) !== canonical(expected[key])) { mismatched.push(key); }
  }
  if (mismatched.length) {
    fail('bundle 内嵌数据与源 JSON 不一致', mismatched.join(', '));
  } else {
    pass('bundle 内嵌 app/text/themes/demos 与源 JSON 一致', 'demos=' + Object.keys(expected.demos).length + ' 个');
  }

  return after;
}

/* ============ D. kui-all 的 MODULES 清单 ↔ config/kui-modules.json ============ */
function checkManifest() {
  console.log('[D] kui-all.js 的 MODULES 清单 ↔ config/kui-modules.json');
  var MODULES = require(KUI_ALL);          // Node 分支：module.exports = MODULES
  var manifest = readJson(MANIFEST);
  var expected = { schema: manifest.schema, note: manifest.note, profiles: {} };
  Object.keys(manifest.profiles).forEach(function (name) {
    expected.profiles[name] = {
      desc: manifest.profiles[name].desc,
      files: manifest.profiles[name].files.slice()
    };
  });
  if (canonical(MODULES) === canonical(expected)) {
    var counts = Object.keys(expected.profiles).map(function (n) {
      return n + '=' + expected.profiles[n].files.length;
    }).join(', ');
    pass('MODULES 与清单一致', counts);
  } else {
    var diffs = [];
    Object.keys(expected.profiles).forEach(function (n) {
      var a = (MODULES.profiles[n] && MODULES.profiles[n].files) || [];
      var b = expected.profiles[n].files;
      if (canonical(a) !== canonical(b)) { diffs.push(n + '（产物 ' + a.length + ' 项 / 清单 ' + b.length + ' 项）'); }
    });
    fail('MODULES 与清单不一致', diffs.join(', ') || 'schema/note/profiles 结构差异');
  }

  // 清单引用的文件必须真实存在（防止「清单有、磁盘无」的编译期谎言）
  var missing = [];
  Object.keys(manifest.profiles).forEach(function (n) {
    manifest.profiles[n].files.forEach(function (rel) {
      if (!fs.existsSync(path.join(ROOT, rel))) { missing.push(rel); }
    });
  });
  if (missing.length) { fail('清单引用的文件存在', '缺失：' + missing.join(', ')); }
  else { pass('清单引用的文件全部存在'); }
}

/* ============ E. 框架版本号一致 ============ */
function extractVersion(file, re, label) {
  var src = read(path.join(ROOT, file));
  var m = src.match(re);
  if (!m) { fail(label + ' 版本号可读', file + ' 未匹配到 ' + re); return ''; }
  return m[1];
}

function checkVersions() {
  console.log('[E] 框架版本号一致性');
  var pkg = readJson(path.join(ROOT, 'package.json'));
  var expected = pkg.version;
  var items = [
    { label: 'package.json', value: expected, file: 'package.json' },
    { label: 'KUI.version', file: 'src/core/kui.js', re: /KUI\.version\s*=\s*'([\d.]+)'/ },
    { label: 'dom-enhance VERSION', file: 'src/core/dom-enhance.js', re: /var VERSION\s*=\s*'([\d.]+)'/ },
    { label: 'kui-frame 兜底版本', file: 'src/frame/kui-frame.js', re: /version:\s*currentVersion\(\)\s*\|\|\s*'([\d.]+)'/ }
  ];
  var bad = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var v = it.value || extractVersion(it.file, it.re, it.label);
    if (!v) { continue; }
    if (v !== expected) { bad.push(it.label + '=' + v); }
  }
  if (bad.length) {
    fail('框架版本号一致（应为 ' + expected + '）', bad.join(', '));
  } else {
    pass('框架版本号一致', expected + '（package / KUI.version / kui-frame / dom-enhance）');
  }

  // 模块内部独立版本号仅作提示（不属于框架版本语义，允许独立演进）
  var notes = [];
  function note(file, re, label) {
    var m = read(path.join(ROOT, file)).match(re);
    if (m) { notes.push(label + '=' + m[1]); }
  }
  note('src/core/diag.js', /var VERSION\s*=\s*'([\d.]+)'/, 'diag 模块');
  note('src/core/tooltip.js', /version:\s*'([\d.]+)'/, 'tooltip 模块');
  note('src/app/bootstrap.js', /bootApi\.version\s*=\s*'([\d.]+)'/, 'boot API 模块');
  console.log('  [INFO] 模块独立版本（允许与框架版本不同）：' + notes.join('，'));
}

/* ============ 主流程 ============ */
try {
  console.log('=== KurumiUI 源码 ↔ 编译产物 一致性校验 ===');
  console.log('项目根：' + ROOT);
  checkKuiAll();
  checkBundle();
  checkManifest();
  checkVersions();
  console.log('');
  console.log('汇总：通过 ' + passes + ' 项，失败 ' + failures.length + ' 项');
  if (failures.length) {
    console.log('不一致明细：');
    for (var i = 0; i < failures.length; i++) { console.log('  - ' + failures[i]); }
    process.exit(1);
  }
  console.log('结果：源码与编译产物一致，版本号一致 ✔');
} catch (e) {
  console.error('校验异常：' + (e && e.stack ? e.stack : e));
  process.exit(1);
}

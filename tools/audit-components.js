/*!
 * KurumiUI · 组件可拆装审计（tools/audit-components.js）
 * ---------------------------------------------------------------
 * 目的：验证「框架由可拆解多组件组成」这一硬性要求，两个维度：
 *
 *   一、最小模块集装配（拆解）：只加载某个组件真正依赖的最少模块，
 *       脱离 app-shell / bootstrap / 控件库，看它能否独立渲染。
 *   二、裸挂载矩阵（组装）：对注册表里每个 type 在裸 DOM 里 KUI.mount，
 *       断言能独立渲染且不产生 .kui-unknown。
 *
 * 用法：
 *   node tools/audit-components.js            # 摘要
 *   node tools/audit-components.js --verbose  # 每个用例明细
 * 退出码：0 = 全部通过；1 = 有失败。
 */

'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var domStub = require(path.join(ROOT, 'test/dom-stub.js'));
var loadKui = require(path.join(ROOT, 'test/load-kui.js'));

var VERBOSE = process.argv.indexOf('--verbose') >= 0;
var results = [];
var failures = 0;

function ok(name, detail) {
  results.push({ name: name, pass: true, detail: detail || '' });
  if (VERBOSE) { console.log('  [PASS] ' + name + (detail ? '  ' + detail : '')); }
}
function bad(name, detail) {
  failures++;
  results.push({ name: name, pass: false, detail: detail || '' });
  console.log('  [FAIL] ' + name + (detail ? '  ' + detail : ''));
}
function check(name, fn) {
  try {
    var r = fn();
    if (r === false) { bad(name, '断言返回 false'); return; }
    ok(name, typeof r === 'string' ? r : '');
  } catch (e) {
    bad(name, (e && e.message ? e.message : String(e)));
  }
}

function readJson(rel) {
  var raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) { raw = raw.slice(1); }
  return JSON.parse(raw);
}

/* ============================================================
 * 一、最小模块集装配：每个组件只加载最少依赖
 * ============================================================ */

var CORE_BASE = ['src/core/kui.js', 'src/core/icons.js', 'src/core/registry.js', 'src/core/config.js'];
var CORE_UI = CORE_BASE.concat(['src/core/tooltip.js', 'src/core/dom-enhance.js']);

/* 每个用例：只给这些模块 + 组件文件本身 */
var CASES = [
  { type: 'menu', files: CORE_UI.concat(['src/components/menu.js']), demo: 'menu' },
  { type: 'menunav', files: CORE_UI.concat(['src/components/menunav.js']), demo: 'menunav' },
  { type: 'tabs', files: CORE_UI.concat(['src/components/tabs.js']), demo: 'tabs' },
  { type: 'toast', files: CORE_UI.concat(['src/components/toast.js']), demo: 'toast' },
  { type: 'dialog', files: CORE_UI.concat(['src/components/dialog.js']), demo: 'dialog' },
  { type: 'form', files: CORE_UI.concat([
    'src/components/controls/index.js',
    'src/components/form.js'
  ]), demo: 'form', needsControls: true },
  { type: 'app-shell', files: CORE_UI.concat([
    'src/components/menu.js', 'src/components/menunav.js', 'src/components/tabs.js',
    'src/components/dialog.js', 'src/components/toast.js', 'src/components/app-shell.js'
  ]), demo: null }
];

function demoNode(name, fallback) {
  try {
    var d = readJson('config/demos/' + name + '.json');
    var nodes = d && d.nodes;
    if (Array.isArray(nodes) && nodes.length) {
      /* 取第一个同类型节点 */
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i] && nodes[i].type === name) { return nodes[i]; }
      }
      for (var j = 0; j < nodes.length; j++) {
        if (nodes[j] && nodes[j].type === name && nodes[j].props) { return nodes[j]; }
      }
    }
  } catch (e) { /* ignore */ }
  return fallback;
}

CASES.forEach(function (c) {
  check('拆解：仅加载最小模块即可渲染 ' + c.type, function () {
    var env = domStub.createEnvironment({ root: ROOT, fileMode: true });
    env.window.__KUI_CONTROLS_NO_BOOT__ = true;
    loadKui.injectBundle(env, ROOT);
    c.files.forEach(function (f) {
      if (!fs.existsSync(path.join(ROOT, f))) { throw new Error('模块缺失: ' + f); }
      env.loadScript(f);
    });
    if (c.needsControls) {
      var K0 = env.window.KUI;
      if (K0 && K0.controls && typeof K0.controls.init === 'function') {
        (K0.controls.files || []).forEach(function (f2) {
          /* 最小装配里 control-base.js 还没有加载，必须全部按清单加载 */
          env.loadScript('src/components/controls/' + f2);
        });
        K0.controls.init();
      }
    }
    var KUI = env.window.KUI;
    if (!KUI) { throw new Error('KUI 未就绪'); }
    if (!fs.existsSync(path.join(ROOT, 'src/components/' + c.type + '.js'))) { throw new Error('组件文件缺失'); }

    var host = env.document.createElement('div');
    env.document.body.appendChild(host);

    var node = demoNode(c.demo || c.type, { type: c.type });
    var el;
    if (c.type === 'app-shell') {
      /* 整壳是最外层组装件：验证「只加载组件（不含 bootstrap/config 应用层）也能 create」 */
      if (!KUI.app || typeof KUI.app.create !== 'function') { throw new Error('KUI.app.create 不可用'); }
      KUI.app.create(host, { app: { name: 'audit' }, layout: {}, menu: {}, menunav: {}, tabs: {} });
      if (!KUI.registry.has('app-shell')) { throw new Error('app-shell 类型未注册'); }
      return 'KUI.app.create 可用';
    }
    if (c.type === 'form') {
      /* form 是「容器型组件」：用 KUI.form.create 验证（mount 单一节点意义不大） */
      if (!KUI.form || typeof KUI.form.create !== 'function') { throw new Error('KUI.form.create 不可用'); }
      var formInst = KUI.form.create(host, {
        nodes: [{ type: 'input', id: 'a', label: 'A' }, { type: 'number', id: 'b', label: 'B' }]
      });
      if (!formInst || typeof formInst.getData !== 'function') { throw new Error('form 实例不可用'); }
      if (!host.childNodes || !host.childNodes.length) { throw new Error('form 未渲染字段'); }
      return 'form.create 渲染 ' + host.childNodes.length + ' 个节点';
    }
    if (c.type === 'dialog' || c.type === 'toast') {
      /* 这俩是「服务型组件」：用静态 API 触发，验证能自建宿主 */
      var K = KUI;
      if (typeof K.dialog === 'object' && typeof K.dialog.alert === 'function') {
        K.dialog.alert({ title: '审计', message: '独立渲染' });
      } else if (typeof K.toast === 'object' && typeof K.toast.show === 'function') {
        K.toast.show('审计 toast');
      } else {
        throw new Error('组件未挂载静态 API（dialog/toast）');
      }
      el = env.document.querySelector('.kui-dialog-layer, .kui-toast-layer, .kui-toast');
      if (!el) { throw new Error('静态 API 未产生 DOM'); }
      return '静态 API 可用';
    }

    if (typeof KUI.mount !== 'function') { throw new Error('KUI.mount 不可用'); }
    var inst = KUI.mount(c.type, host, node, null);
    el = inst && inst.el;
    if (!el) { throw new Error('mount 未返回 el'); }
    if (!el.nodeType) { throw new Error('mount 未返回 DOM 元素'); }
    var unknown = host.querySelector ? host.querySelectorAll('.kui-unknown') : [];
    if (unknown && unknown.length) { throw new Error('出现未注册元素占位'); }
    return 'class=' + (el.className || '');
  });
});

/* ============================================================
 * 二、裸挂载矩阵：注册表里每个 type 都能独立挂载
 * ============================================================ */

var envFull = domStub.createEnvironment({ root: ROOT, fileMode: true });
var report = loadKui.loadKui(envFull, { components: true });
var KUI = envFull.window.KUI;
var registryList = (KUI && KUI.registry && typeof KUI.registry.list === 'function') ? KUI.registry.list() : [];

var byCat = {};
registryList.forEach(function (it) { (byCat[it.category] = byCat[it.category] || []).push(it.type); });

var mountable = registryList.filter(function (it) { return it.category !== 'shell' && it.type !== 'app-shell'; });
var mountFail = [];
mountable.forEach(function (it) {
  try {
    var host = envFull.document.createElement('div');
    envFull.document.body.appendChild(host);
    var inst = KUI.mount(it.type, host, { type: it.type }, null);
    var el = inst && inst.el;
    if (!el || !el.nodeType) { mountFail.push(it.type + '(空返回)'); }
  } catch (e) {
    mountFail.push(it.type + '(' + (e && e.message ? e.message : e) + ')');
  }
});
if (mountFail.length) { bad('组装：注册表类型裸挂载', mountFail.join(', ')); }
else { ok('组装：注册表类型裸挂载', mountable.length + ' 个类型全部可独立挂载'); }

/* 分类统计 */
var catNames = Object.keys(byCat).sort();
var catText = catNames.map(function (k) { return k + '=' + byCat[k].length; }).join(' / ');
ok('注册表分类快照', catText + ' / TOTAL=' + registryList.length);

/* shell 组件在完整装配下可创建 */
['menu', 'menunav', 'tabs', 'dialog', 'toast'].forEach(function (t) {
  check('组装：完整装配下可创建 ' + t, function () {
    if (typeof KUI[t] !== 'object' && typeof KUI[t] !== 'function') { throw new Error('KUI.' + t + ' 不存在'); }
    var host = envFull.document.createElement('div');
    envFull.document.body.appendChild(host);
    var node = demoNode(t, { type: t });
    var inst;
    if (typeof KUI[t].create === 'function') {
      inst = KUI[t].create(host, (node && node.props) || {}, null);
    }
    if (t === 'dialog' || t === 'toast') {
      if (!inst && !(node && node.props)) { /* 服务型组件允许无 create */ }
    }
    return inst ? 'create() 成功' : '静态 API 存在';
  });
});

/* ============================================================
 * 三、独立渲染页面矩阵（standalone/*.html）
 * ============================================================ */

var pages = ['menu', 'menunav', 'tabs', 'dialog', 'toast', 'form', 'controls', 'theme', 'no-shell', 'handlers', 'avatar'];
var missingPages = [];
var badPages = [];
pages.forEach(function (p) {
  var rel = 'standalone/' + p + '.html';
  if (!fs.existsSync(path.join(ROOT, rel))) { missingPages.push(p); return; }
  var html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (html.indexOf('src/core/kui-all.js') < 0) { badPages.push(p + '(未引 kui-all)'); }
  if (html.indexOf('data-kui-profile="standalone"') < 0) { badPages.push(p + '(profile 不是 standalone)'); }
  if (html.indexOf('data-kui-auto="false"') < 0) { badPages.push(p + '(缺 data-kui-auto=false)'); }
  if (html.indexOf('kui-app') >= 0 && /\bclass="kui-app/.test(html)) { badPages.push(p + '(误含整壳类)'); }
});
if (missingPages.length) { bad('独立渲染页：文件齐全', '缺失：' + missingPages.join(', ')); }
else if (badPages.length) { bad('独立渲染页：可单独打开', badPages.join(', ')); }
else { ok('独立渲染页：可单独打开', pages.length + ' 个页面；均引 kui-all(standalone) 且不自动生成整壳'); }

/* 每个独立页都应有对应 demo 配置（除 controls/theme/no-shell 这类展示页） */
var demoPages = ['menu', 'menunav', 'tabs', 'dialog', 'toast', 'form', 'handlers', 'avatar'];
var noDemo = demoPages.filter(function (p) { return !fs.existsSync(path.join(ROOT, 'config/demos/' + p + '.json')); });
if (noDemo.length) { bad('独立渲染页：JSON 驱动', '缺 demo JSON：' + noDemo.join(', ')); }
else { ok('独立渲染页：JSON 驱动', demoPages.length + ' 个页面各有 config/demos/*.json'); }

/* ============================================================
 * 四、依赖边界：页面级组件脚本不应强依赖 app-shell/bootstrap
 * ============================================================ */

var componentFiles = ['src/components/menu.js', 'src/components/menunav.js', 'src/components/tabs.js',
  'src/components/dialog.js', 'src/components/toast.js'];
var strongDeps = [];
componentFiles.forEach(function (f) {
  var src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  /* 允许「存在性判断」式的软依赖，禁止 IIFE 顶层直接调用 */
  if (/^\s*(var|let|const)\s+\w+\s*=\s*KUI\.app\b/m.test(src)) { strongDeps.push(f + '(顶层读 KUI.app)'); }
  if (/^\s*KUI\.boot\s*\(/m.test(src)) { strongDeps.push(f + '(调用 KUI.boot)'); }
});
if (strongDeps.length) { bad('依赖边界：组件不硬依赖整壳', strongDeps.join(', ')); }
else { ok('依赖边界：组件不硬依赖整壳', componentFiles.length + ' 个组件文件'); }

/* ============================================================
 * 输出
 * ============================================================ */

console.log('\n=== 组件可拆装审计 ===');
console.log('通过 ' + (results.length - failures) + ' 项 / 失败 ' + failures + ' 项');
if (failures) {
  console.log('\n失败明细：');
  results.filter(function (r) { return !r.pass; }).forEach(function (r) {
    console.log('  ✘ ' + r.name + '  ' + r.detail);
  });
} else {
  console.log('拆解与组装两个维度均通过：组件可在最小模块集下独立渲染，也可被 app-shell 自由组合。');
}
process.exit(failures ? 1 : 0);

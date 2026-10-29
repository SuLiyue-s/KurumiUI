#!/usr/bin/env node
/**
 * KurumiUI audit-unused.js — 未消费资产审计（v1.4.1 新增）
 *
 * 目的：找出「写了但没人读」的静态资产，避免「配置/样式/函数/API 声明了却不生效」这类缺陷。
 * 四类检查：
 *   A. storage 键   ：只写不读 / 只读不写（localStorage、sessionStorage）
 *   B. CSS 变量     ：定义了但从未被 var() 引用 / 被 var() 引用但从未定义（含 themes.json 运行时 token）
 *   C. data-* 属性  ：JS 写入但 CSS/JS 从不读取
 *   D. 死函数/死类  ：源码里声明了但从未被引用的函数；样式表里定义但项目任何文件均未出现的类
 *
 * 用法：
 *   node tools/audit-unused.js            # 报告（ERROR + WARN + INFO）
 *   node tools/audit-unused.js --strict   # ERROR > 0 时退出码 1（接入 npm run verify）
 *   node tools/audit-unused.js --json     # 机器可读
 *
 * 维护约定：新增「有意保留」的项加进 ALLOW 并写清原因，不要放宽正则。
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var STRICT = process.argv.indexOf('--strict') !== -1;
var JSON_OUT = process.argv.indexOf('--json') !== -1;

/* ---------------- 允许清单 ---------------- */
var ALLOW = {
  storage: {
    'kui-debug': '诊断开关：用户手动在控制台/地址栏写，源码只读（设计如此）',
    'kui-theme': '主题 id：写入侧走 state.storageKey（动态键），读取侧另有 theme-boot 提前读；静态扫描看不到动态写'
  },
  cssVar: {
    '--kui-theme': '运行时写入的当前主题 id，供调试/自定义主题读取',
    '--kui-avatar-size': 'avatar.css 的尺寸兜底变量（可变尺寸实例优先用内联 width/height）',
    '--kui-on-info': '信息色前景：未纳入 token 切面，使用 var() 兜底（var(--kui-text-inverse)）',
    '--kui-danger-soft': '危险色弱背景：使用 var() 兜底 rgba，主题可按需补充',
    '--kui-form-columns': 'form.js 通过 setVar() 动态注入（变量名是字符串参数），静态扫描看不到 setProperty 字面量',
    '--kui-form-gap': 'form.js 通过 setVar() 动态注入',
    '--kui-danger-hover': '危险色 hover：主题无此 token，使用 var() 兜底 --kui-danger',
    '--kui-scheme': 'theme-boot 从父级 tokens 透传的 scheme 值（用于 iframe 早同步），非样式变量',
    '--kui-test-only-token': 'test/render.test.js 的断言用 token，故意不定义'
  },
  /* 文档化的公共扩展 token（docs/04-theme.md 有表）：框架内部不消费，供用户自定义覆盖 */
  publicTokens: {
    '--kui-radius-xl': 1, '--kui-z-header': 1, '--kui-z-mask': 1,
    '--kui-z-fullscreen': 1, '--kui-z-content': 1, '--kui-z-art': 1,
    '--kui-z-dialog': 1, '--kui-z-toast': 1, '--kui-popup-z': 1, '--kui-z-popup': 1
  },
  dataAttr: {
    /* 可观测性标记：框架写进 DOM 供 DevTools/用户脚本/回归测试观察，框架自身不需要回读 */
    'data-kui-error': 1, 'data-kui-controls-file': 1, 'data-row-index': 1, 'data-index': 1,
    'data-role': 1, 'data-kui-form': 1, 'data-kui-menu': 1, 'data-toast-id': 1, 'data-kui-avatar': 1,
    'data-kui-diag': 1, 'data-kui-preview': 1, 'data-dialog-subtitle': 1, 'data-kui-app': 1,
    'data-kui-type': '调试/测试用标记（占位与诊断读取）',
    'data-boot-step': '调试可观测标记（boot 阶段）',
    'data-kui-filled': 'select 填充态样式钩子（已由 .is-filled 消费，保留给自定义样式）'
  },
  cssClass: {
    'kui-theme-picker__theme': '主题选择器卡片基类，运行时拼接 --<themeId> 修饰类',
    'kui-text-accent': '公共文本工具类（文档 §主题 token 的示例用法）',
    'kui-text-accent-2': '公共文本工具类',
    'kui-nums': '公共等宽数字工具类'
  }
};

/* ---------------- 工具 ---------------- */
function walk(dir, out, filter) {
  out = out || [];
  var list;
  try { list = fs.readdirSync(dir); } catch (e) { return out; }
  for (var i = 0; i < list.length; i++) {
    var name = list[i];
    if (name === 'node_modules' || name === '.git' || name === '.tools' || name === '.shots') { continue; }
    var full = path.join(dir, name);
    var st;
    try { st = fs.statSync(full); } catch (e) { continue; }
    if (st.isDirectory()) { walk(full, out, filter); }
    else if (!filter || filter.test(full)) { out.push(full); }
  }
  return out;
}
function rel(p) { return path.relative(ROOT, p).replace(/\\/g, '/'); }
function read(p) { return fs.readFileSync(p, 'utf8'); }
function uniq(arr) { var seen = {}, out = []; for (var i = 0; i < arr.length; i++) { if (!seen[arr[i]]) { seen[arr[i]] = 1; out.push(arr[i]); } } return out; }
function add(map, key, file) { (map[key] = map[key] || []).push(file); }

var allFiles = walk(ROOT, [], /\.(js|html|css|json|md)$/);
var cssFiles = allFiles.filter(function (f) { return /\.css$/.test(f); });
var htmlFiles = allFiles.filter(function (f) { return /\.html$/.test(f); });
var jsFiles = allFiles.filter(function (f) { return /\.js$/.test(f); });
var codeText = '';
allFiles.forEach(function (f) { if (!/\.css$/.test(f)) { codeText += '\n' + read(f); } });

var ERROR = [];   /* 会导致功能/样式静默失效的缺陷 */
var WARN = [];    /* 疑似未消费（需确认是否公共 API） */
var INFO = [];    /* 仅统计：大量公共工具类等 */

/* ---------------- A. storage 键 ---------------- */
(function () {
  var readKeys = {}, writeKeys = {};
  var re = /(localStorage|sessionStorage)\.(getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]/g;
  jsFiles.forEach(function (f) {
    var s = read(f), m;
    while ((m = re.exec(s))) {
      var key = m[1] + ':' + m[3];
      if (m[2] === 'getItem') { add(readKeys, key, rel(f)); } else { add(writeKeys, key, rel(f)); }
    }
  });
  Object.keys(writeKeys).forEach(function (k) {
    var name = k.split(':')[1];
    if (readKeys[k] || ALLOW.storage[name]) { return; }
    ERROR.push({ cat: 'storage', name: name, files: uniq(writeKeys[k]), problem: '只写不读：写入后再也没有读取点' });
  });
  Object.keys(readKeys).forEach(function (k) {
    var name = k.split(':')[1];
    if (writeKeys[k] || ALLOW.storage[name]) { return; }
    WARN.push({ cat: 'storage', name: name, files: uniq(readKeys[k]), problem: '只读不写：读取点无对应写入点（注意动态键写入）' });
  });
})();

/* ---------------- B. CSS 变量 ---------------- */
(function () {
  var defined = {}, used = {};
  var defRe = /(--kui-[a-z0-9-]+)\s*:/g;
  var setRe = /setProperty\(\s*['"](--kui-[a-z0-9-]+)['"]/g;
  var useRe = /var\(\s*(--kui-[a-z0-9-]+)/g;
  var jsTokRe = /['"](--kui-[a-z0-9-]+)['"]/g;

  cssFiles.concat(htmlFiles).forEach(function (f) {
    var s = read(f), m;
    while ((m = defRe.exec(s))) { add(defined, m[1], rel(f)); }
    while ((m = useRe.exec(s))) { add(used, m[1], rel(f)); }
  });
  jsFiles.forEach(function (f) {
    var s = read(f), m;
    while ((m = setRe.exec(s))) { add(defined, m[1], rel(f)); }      // JS 运行时注入 = 定义
    while ((m = jsTokRe.exec(s))) { add(used, m[1], rel(f)); }
  });
  /* themes.json 的 tokens 是运行时注入的 CSS 变量 */
  var themesJson = path.join(ROOT, 'src', 'themes.json');
  if (fs.existsSync(themesJson)) {
    var tj;
    try { tj = JSON.parse(read(themesJson)); } catch (e) { tj = null; }
    if (tj) {
      var list = Array.isArray(tj.themes) ? tj.themes : [];
      list.forEach(function (t) {
        var toks = (t && t.tokens) || {};
        Object.keys(toks).forEach(function (k) { add(defined, k, 'src/themes.json'); });
      });
    }
  }
  Object.keys(defined).forEach(function (k) {
    if (used[k] || ALLOW.cssVar[k] || ALLOW.publicTokens[k]) { return; }
    WARN.push({ cat: 'cssVar', name: k, files: uniq(defined[k]), problem: '定义了但从未被 var() 引用' });
  });
  Object.keys(used).forEach(function (k) {
    if (defined[k] || ALLOW.cssVar[k]) { return; }
    /* 有 var() 兜底值的降级为 WARN（视觉可退化，不会整条声明失效） */
    var hasFallback = false;
    cssFiles.concat(htmlFiles).forEach(function (f) {
      if (hasFallback) { return; }
      var re2 = new RegExp('var\\(\\s*' + k + '\\s*,');
      if (re2.test(read(f))) { hasFallback = true; }
    });
    var item = { cat: 'cssVar', name: k, files: uniq(used[k]), problem: hasFallback ? '被 var() 引用但无定义（有兜底值）' : '被 var() 引用但无定义（无兜底，声明会整条失效）' };
    if (hasFallback) { WARN.push(item); } else { ERROR.push(item); }
  });
})();

/* ---------------- C. data-* 属性 ---------------- */
(function () {
  var setAttrs = {}, readAttrs = {};
  var setRe = /setAttribute\(\s*['"](data-[a-z0-9-]+)['"]/g;
  var getRe = /(?:getAttribute|hasAttribute)\(\s*['"](data-[a-z0-9-]+)['"]/g;
  var selRe = /\[\s*(data-[a-z0-9-]+)/g;
  var dsRe = /\.dataset\.([a-zA-Z0-9_]+)/g;

  jsFiles.forEach(function (f) {
    var s = read(f), m;
    while ((m = setRe.exec(s))) { add(setAttrs, m[1], rel(f)); }
    while ((m = getRe.exec(s))) { add(readAttrs, m[1], rel(f)); }
    while ((m = dsRe.exec(s))) {
      add(readAttrs, 'data-' + m[1].replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }), rel(f));
    }
  });
  cssFiles.concat(htmlFiles).forEach(function (f) {
    var s = read(f), m;
    while ((m = selRe.exec(s))) { add(readAttrs, m[1], rel(f)); }
  });
  Object.keys(setAttrs).forEach(function (k) {
    if (readAttrs[k] || ALLOW.dataAttr[k]) { return; }
    /* JS 里也可能用 querySelector('[data-xxx]') / 字符串比较读取属性，语义上算「被消费」。
     * 判定：该属性名在全部非 CSS 代码中出现的次数 > 写入次数 ⇒ 有读取点。 */
    var occ = (codeText.match(new RegExp(k.replace(/[-]/g, '\\-'), 'g')) || []).length;
    if (occ > setAttrs[k].length) { return; }
    WARN.push({ cat: 'dataAttr', name: k, files: uniq(setAttrs[k]), problem: 'JS 写入但 CSS/JS 从不读取' });
  });
})();

/* ---------------- D. 死函数 / 死类 ---------------- */
(function () {
  /* D1：源码里声明但从未被引用的函数（排除：返回的闭包、具名 IIFE、对象属性赋值） */
  jsFiles.forEach(function (f) {
    var r = rel(f);
    if (/^(tools|test)\//.test(r) || /kui-all\.js$/.test(r)) { return; }
    var s = read(f), m;
    var fnRe = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    while ((m = fnRe.exec(s))) {
      var name = m[1];
      var idx = m.index;
      var prev = s.slice(Math.max(0, idx - 40), idx);
      if (/\(\s*$/.test(prev) && /\(\s*$/.test(prev)) { continue; }      // 具名 IIFE
      if (/return\s+$/.test(prev)) { continue; }                         // 返回的具名闭包
      var re2 = new RegExp('(?:^|[^\\w$.])' + name.replace(/\$/g, '\\$') + '(?![\\w$])', 'g');
      var cnt = (s.match(re2) || []).length;
      if (cnt <= 1) {
        WARN.push({ cat: 'deadFn', name: name, files: [r + ':' + (s.slice(0, idx).split('\n').length)], problem: '函数声明后从未被引用' });
      }
    }
  });

  /* D2：样式表中定义、但项目所有 js/html/json/md 中都不出现的类 */
  var classDefs = {};
  var selRe = /\.((?:kui|is|has)-[a-z0-9_-]+)/g;
  cssFiles.forEach(function (f) {
    var s = read(f), m;
    while ((m = selRe.exec(s))) { add(classDefs, m[1], rel(f)); }
  });
  Object.keys(classDefs).forEach(function (cls) {
    if (ALLOW.cssClass[cls] || codeText.indexOf(cls) !== -1) { return; }
    /* 动态拼接的修饰类：如 'kui-btn--' + size、'kui-toast--' + type。
     * 判定：去掉最后一段 --modifier 后，代码里存在 base + '--' 的拼接痕迹 ⇒ 视为动态消费。 */
    var base = cls.replace(/--[a-z0-9_-]+$/, '');
    if (base !== cls && base.indexOf('kui-') === 0 && codeText.indexOf(base + '--') !== -1) { return; }
    INFO.push({ cat: 'cssClass', name: cls, files: uniq(classDefs[cls]), problem: '样式类在 js/html/json/md 中均未出现（非动态拼接）' });
  });
})();

/* ---------------- 输出 ---------------- */
function dump(title, list, quiet) {
  console.log('[' + title + ']  ' + list.length + ' 项' + (quiet && list.length ? '（详见 --json）' : ''));
  if (!quiet) {
    list.forEach(function (item) {
      console.log('  - ' + item.name + '  (' + item.problem + ')');
      console.log('      ' + item.files.slice(0, 3).join(', ') + (item.files.length > 3 ? ' …' : ''));
    });
  }
  if (!list.length) { console.log('  （无）'); }
  console.log('');
}

/* ---------------- 输出（仅 CLI 模式打印；被 require 时静默返回结果） ---------------- */
function main() {
  if (JSON_OUT) {
    console.log(JSON.stringify({ error: ERROR.length, warn: WARN.length, info: INFO.length, ERROR: ERROR, WARN: WARN, INFO: INFO }, null, 2));
  } else {
    console.log('=== KurumiUI 未消费资产审计 ===');
    console.log('扫描 ' + cssFiles.length + ' CSS / ' + htmlFiles.length + ' HTML / ' + jsFiles.length + ' JS / ' + allFiles.length + ' 文件\n');
    dump('ERROR 会导致功能静默失效', ERROR);
    dump('WARN 疑似未消费（需确认或加入 ALLOW）', WARN);
    dump('INFO 未引用的样式类（公共工具类可忽略）', INFO, true);
    console.log('结论：ERROR ' + ERROR.length + ' / WARN ' + WARN.length + ' / INFO ' + INFO.length);
  }

}

/* 供 smoke / 测试复用：require 即完成扫描，返回结果集合 */
module.exports = { ERROR: ERROR, WARN: WARN, INFO: INFO, main: main, ALLOW: ALLOW };

if (require.main === module) {
  main();
  if (STRICT && ERROR.length > 0) { process.exit(1); }
}

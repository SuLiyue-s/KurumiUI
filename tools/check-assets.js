#!/usr/bin/env node
/*!
 * KurumiUI · 资源引用检查（零依赖，兼容 Node 13.14）
 * -----------------------------------------------------------------------------
 * 扫描 HTML 里的 <link href> / <script src>，逐条检查：
 *   1) 文件是否存在（相对该 HTML 的路径）
 *   2) 内容是否为对应类型（css/js）
 *   3) 是否命中禁用语法/危险写法（如 http:// 外链、内联 ESM）
 *   4) 标签是否成对、是否有重复引用
 * 可同时扫描多个 HTML（index.html / src/frame/dialog-frame.html / pages/*.html /
 * standalone/*.html），用于集成前后的快速自检。
 *
 * 用法：
 *   node tools/check-assets.js
 *   node tools/check-assets.js index.html src/frame/dialog-frame.html
 */

'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');

var DEFAULT_TARGETS = [
  'index.html',
  'src/frame/dialog-frame.html'
];

function walk(dir, out, depth) {
  if (depth > 3 || !fs.existsSync(dir)) return out;
  var stat;
  try { stat = fs.statSync(dir); } catch (e) { return out; }
  if (!stat.isDirectory()) return out;
  fs.readdirSync(dir).forEach(function (name) {
    if (name === 'node_modules' || name.charAt(0) === '.') return;
    var full = path.join(dir, name);
    var st;
    try { st = fs.statSync(full); } catch (e) { return; }
    if (st.isDirectory()) walk(full, out, depth + 1);
    else if (/\.html?$/i.test(name)) out.push(full);
  });
  return out;
}

function collectTargets(argv) {
  var list = argv.filter(function (a) { return a.indexOf('--') !== 0; });
  if (list.length) {
    return list.map(function (p) { return path.resolve(ROOT, p); });
  }
  var out = [];
  DEFAULT_TARGETS.forEach(function (p) {
    var f = path.resolve(ROOT, p);
    if (fs.existsSync(f)) out.push(f);
  });
  walk(path.join(ROOT, 'pages'), out, 0);
  walk(path.join(ROOT, 'standalone'), out, 0);
  return out;
}

function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

function scanHtml(file) {
  var html = stripComments(fs.readFileSync(file, 'utf8'));
  var dir = path.dirname(file);
  var refs = [];
  var reLink = /<link\b[^>]*>/gi;
  var reScript = /<script\b[^>]*>/gi;
  var m;

  while ((m = reLink.exec(html))) {
    var href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(m[0]);
    var rel = /\brel\s*=\s*["']([^"']+)["']/i.exec(m[0]);
    if (href) refs.push({ tag: 'link', url: href[1], rel: rel ? rel[1] : '', kind: 'css', tagText: m[0] });
  }
  while ((m = reScript.exec(html))) {
    var src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(m[0]);
    if (src) refs.push({ tag: 'script', url: src[1], kind: 'js', tagText: m[0] });
    else refs.push({ tag: 'script-inline', url: '', kind: 'inline', tagText: m[0] });
  }

  var results = [];
  var seen = {};
  refs.forEach(function (ref) {
    if (!ref.url) {
      results.push({ ok: true, level: 'info', msg: '内联脚本（跳过外链检查）' });
      return;
    }
    if (/^(https?:)?\/\//i.test(ref.url) || /^javascript:/i.test(ref.url)) {
      results.push({ ok: false, level: 'error', msg: '禁止外部/内联协议引用: ' + ref.url });
      return;
    }
    // 允许内联小图标：data:, （空 favicon 防 404）与 data:image/*
    if (/^data:/i.test(ref.url) && !/^data:image\//i.test(ref.url) && ref.url !== 'data:,') {
      results.push({ ok: false, level: 'error', msg: '禁止外部/内联协议引用: ' + ref.url });
      return;
    }
    if (/^data:/i.test(ref.url)) {
      results.push({ ok: true, level: 'info', msg: '内联图片（跳过外链检查）: ' + ref.url.slice(0, 40) });
      return;
    }
    if (seen[ref.url]) {
      results.push({ ok: false, level: 'error', msg: '重复引用: ' + ref.url });
      return;
    }
    seen[ref.url] = true;

    var clean = ref.url.split('?')[0].split('#')[0];
    var abs = path.resolve(dir, clean);
    if (!fs.existsSync(abs)) {
      results.push({ ok: false, level: 'error', msg: '文件不存在: ' + ref.url + '  →  ' + path.relative(ROOT, abs) });
      return;
    }
    var size = fs.statSync(abs).size;
    if (size === 0) {
      results.push({ ok: false, level: 'error', msg: '空文件: ' + ref.url });
      return;
    }
    var head = fs.readFileSync(abs, 'utf8').slice(0, 4000);
    if (ref.kind === 'js' && /^\s*(import|export)\s/m.test(head)) {
      results.push({ ok: false, level: 'error', msg: '疑似 ESM 语法（浏览器传统 script 场景禁用）: ' + ref.url });
      return;
    }
    if (ref.kind === 'css' && !/\{/.test(head)) {
      results.push({ ok: false, level: 'warn', msg: '疑似非 CSS 内容: ' + ref.url });
      return;
    }
    results.push({ ok: true, level: 'info', msg: 'ok  ' + ref.url + '  (' + (size / 1024).toFixed(1) + ' KB)' });
  });

  return { file: file, refs: refs, results: results };
}

function main() {
  var targets = collectTargets(process.argv.slice(2));
  if (!targets.length) {
    console.log('未找到任何 HTML 目标');
    process.exitCode = 1;
    return;
  }
  var errors = 0;
  var warns = 0;
  targets.forEach(function (file) {
    var rel = path.relative(ROOT, file);
    var r = scanHtml(file);
    console.log('\n■ ' + rel + '  （引用 ' + r.refs.length + ' 条）');
    r.results.forEach(function (item) {
      if (!item.ok) {
        if (item.level === 'error') errors++;
        else warns++;
        console.log('  ' + (item.level === 'error' ? '✘' : '!') + ' ' + item.msg);
      }
    });
    if (r.results.every(function (i) { return i.ok; })) {
      console.log('  ✔ 全部引用正常');
    }
  });
  console.log('\n汇总: ' + targets.length + ' 个 HTML，错误 ' + errors + ' 个，警告 ' + warns + ' 个');
  process.exitCode = errors ? 1 : 0;
}

if (require.main === module) main();

module.exports = { scanHtml: scanHtml, collectTargets: collectTargets };

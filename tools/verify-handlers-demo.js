'use strict';
/* 校验 config/demos/handlers.json + standalone/handlers.html 的装配是否真的可渲染。
 * 只在终端/沙箱外运行：node .tools/verify-handlers-page.js
 */
var fs = require('fs');
var path = require('path');
var stub = require('../test/dom-stub.js');

var ROOT = path.resolve(__dirname, '..');
var html = fs.readFileSync(path.join(ROOT, 'standalone/handlers.html'), 'utf8');
var scripts = [];
html.replace(/<script\s+([^>]*)>([\s\S]*?)<\/script>/gi, function (m, attrs, body) {
  var src = /src\s*=\s*["']([^"']+)["']/i.exec(attrs);
  if (src) scripts.push({ src: src[1], inline: false, attrs: attrs });
  else if (body.trim()) scripts.push({ src: null, inline: true, code: body });
  return m;
});

var env = stub.createEnvironment({ root: ROOT, fileMode: true });
var win = env.window;

// 1) 本地脚本按文档顺序加载
// 页面若用单入口 kui-all.js（v1.0.9 起），展开成清单后再逐个加载。
var kuiAll = require(path.join(ROOT, 'src/core/kui-all.js'));
function loadOne(relPath) {
  var abs = path.resolve(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    console.log('  ⚠ 清单文件不存在：' + relPath);
    return;
  }
  env.loadScript(abs);
}
scripts.forEach(function (s) {
  if (s.inline) return;
  if (/^https?:/i.test(s.src)) throw new Error('出现了外链脚本：' + s.src);
  var profile = /data-kui-profile\s*=\s*["']([^"']+)["']/i.exec(s.attrs || '');
  if (/core\/kui-all\.js$/.test(s.src)) {
    var key = (profile && profile[1]) || 'standalone';
    var list = (kuiAll.profiles && kuiAll.profiles[key] && kuiAll.profiles[key].files) || [];
    list.forEach(loadOne);
    return;
  }
  // src 相对 standalone/handlers.html 所在目录解析（如 embedded.js 是同级文件），
  // 兜底再按项目根解析，兼容早期清单里写 "src/..." 全路径的写法。
  var abs = path.resolve(ROOT, 'standalone', s.src);
  if (!fs.existsSync(abs)) abs = path.resolve(ROOT, s.src);
  env.loadScript(abs);
});

var KUI = win.KUI;
if (!KUI) throw new Error('KUI 未加载');

// 1.1) 控件子脚本：浏览器由 controls/index.js 用 document.write 注入，dom-stub 不解析，显式加载
if (KUI.controls && KUI.controls.files) {
  KUI.controls.files.forEach(function (file) {
    var abs = path.resolve(ROOT, 'src/components/controls', file);
    if (fs.existsSync(abs)) env.loadScript(abs);
  });
  if (KUI.controls.init) KUI.controls.init();
}

if (!KUI.handlers) throw new Error('KUI.handlers 未加载');

// 2) 注入 JSON 读取器（等价于 http 下 fetch）
KUI.config.setReader(function (name) {
  var file = path.join(ROOT, 'config', name + '.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
});

var demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/demos/handlers.json'), 'utf8'));
var host = win.document.createElement('div');
win.document.body.appendChild(host);

var groups = demo.groups || demo.sections || [];
var counts = { groups: 0, nodes: 0, unknown: 0, buttons: 0, menus: 0, tabs: 0 };
groups.forEach(function (g) {
  counts.groups++;
  var wrap = win.document.createElement('section');
  host.appendChild(wrap);
  (g.nodes || []).forEach(function (node) {
    var el = KUI.renderNode(node, null);
    if (!el) return;
    wrap.appendChild(el);
    counts.nodes++;
    if (el.querySelector && el.querySelector('.kui-unknown')) counts.unknown++;
  });
  counts.buttons += wrap.querySelectorAll('.kui-control--button').length;
  counts.menus += wrap.querySelectorAll('.kui-menu').length;
  counts.tabs += wrap.querySelectorAll('.kui-tabs').length;
});

var text = host.textContent || '';
if (counts.unknown) throw new Error('存在未注册类型占位：' + counts.unknown);
if (/未注册的元素类型/.test(text)) throw new Error('文本里出现「未注册的元素类型」');
if (!counts.menus) throw new Error('menu 实例未渲染');
if (!counts.tabs) throw new Error('tabs 实例未渲染');

// 3) 点一个 JSON 里的 toast 按钮，验证 fn 真的执行
var before = KUI.toast ? win.document.querySelectorAll('.kui-toast').length : 0;
var fired = false;
win.document.querySelectorAll('.kui-control--button').forEach(function (btn) {
  if (fired) return;
  btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  fired = true;
});
var after = win.document.querySelectorAll('.kui-toast').length;
if (after <= before) throw new Error('点击 JSON 按钮未产生提醒（fn 可能未执行）');

console.log('✔ handlers 演示页装配正常');
console.log('  分组 ' + counts.groups + ' / 节点 ' + counts.nodes + ' / 按钮 ' + counts.buttons +
  ' / menu ' + counts.menus + ' / tabs ' + counts.tabs + ' / toast ' + before + '→' + after);
env.destroy();

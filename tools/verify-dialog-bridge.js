'use strict';
/* 校验弹窗 iframe 的节点级动作桥：dialog-frame.js 是否把 app./theme./handlers.run 等动作转发给父页面。
 * 只需终端运行：node .tools/verify-dialog-bridge.js
 */
var fs = require('fs');
var path = require('path');
var stub = require('../test/dom-stub.js');
var ROOT = path.resolve(__dirname, '..');

var env = stub.createEnvironment({ root: ROOT, fileMode: true });
var win = env.window;

var html = fs.readFileSync(path.join(ROOT, 'src/frame/dialog-frame.html'), 'utf8');

// 复刻页面骨架：dialog-frame.js 需要 #kui-dialog 根节点才会 boot
var root = win.document.createElement('div');
root.id = 'kui-dialog';
root.className = 'kui-dialog kui-dialog--frame';
win.document.body.appendChild(root);

html.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, function (m, src) {
  env.loadScript(path.resolve(ROOT, 'src/frame', src));
  return m;
});

var KUI = win.KUI;
if (!KUI || !KUI.actions) throw new Error('dialog-frame 环境未就绪');
if (!KUI.actions.__kuiBridged) throw new Error('installActionBridge 未安装');

var sent = [];
win.parent = {
  postMessage: function (msg) { sent.push(msg); }
};

KUI.actions.run({ action: 'app.applyTheme', params: { id: 'sakura' } });
var msg = sent.filter(function (m) { return m && m.type === 'dialog:action'; })[0];
if (!msg) throw new Error('app.applyTheme 未转发为 dialog:action');
if (!msg.payload || msg.payload.action !== 'app.applyTheme') throw new Error('转发的 action 名不对：' + JSON.stringify(msg));
if (!msg.payload.params || msg.payload.params.id !== 'sakura') throw new Error('转发的 params 丢失');

sent.length = 0;
KUI.actions.run({ action: 'handlers.run', params: { fn: 'toast.success', args: { text: 'hi' } } });
msg = sent.filter(function (m) { return m && m.type === 'dialog:action'; })[0];
if (!msg || !msg.payload || msg.payload.action !== 'handlers.run') throw new Error('handlers.run 未转发');
if (!msg.payload.params || msg.payload.params.fn !== 'toast.success') throw new Error('handlers.run 参数丢失');

sent.length = 0;
KUI.actions.run({ actions: [
  { action: 'dialog.close', params: { id: 'theme-picker' } },
  { fn: 'toast.info', args: { text: 'x' } }
] });
var actions = sent.filter(function (m) { return m && m.type === 'dialog:action'; })
  .map(function (m) { return m.payload.action; });
if (actions.indexOf('dialog.close') < 0 || actions.indexOf('handlers.run') < 0) {
  throw new Error('动作数组混写未全部转发：' + JSON.stringify(actions));
}

console.log('✔ 弹窗动作桥正常：app.applyTheme / handlers.run / 动作数组均转发父页，参数完整');
env.destroy();

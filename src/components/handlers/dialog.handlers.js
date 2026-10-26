/*!
 * KurumiUI · dialog 组件的业务函数文件（scope = 'dialog'）
 * JSON 示例：
 *   { "fn": "dialog.alert", "args": { "title": "提示", "text": "操作完成" } }
 *   { "fn": "dialog.confirm", "args": { "title": "确认", "text": "确定要重置吗？" } }
 *   { "fn": "dialog.close", "args": { "id": "theme-picker" } }
 * 注意：dialog.* 在弹窗 iframe 内调用会被动作桥自动转发回父页面执行。
 */
(function (global) {
  'use strict';

  var KUI = global.KUI || {};
  if (!KUI.handlers) { return; }

  function api() {
    return KUI.dialog || null;
  }

  function pick(args) {
    args = args || {};
    var payload = {};
    for (var key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key)) { payload[key] = args[key]; }
    }
    if (payload.text === undefined) { payload.text = payload.message; }
    return payload;
  }

  var handlers = {
    alert: function (ctx, args) {
      var dialog = api();
      if (!dialog) { return null; }
      return dialog.alert(pick(args));
    },
    confirm: function (ctx, args) {
      var dialog = api();
      if (!dialog) { return null; }
      return dialog.confirm(pick(args));
    },
    prompt: function (ctx, args) {
      var dialog = api();
      if (!dialog) { return null; }
      return dialog.prompt(pick(args));
    },
    form: function (ctx, args) {
      var dialog = api();
      if (!dialog) { return null; }
      return dialog.form(pick(args));
    },
    custom: function (ctx, args) {
      var dialog = api();
      if (!dialog) { return null; }
      return dialog.custom(pick(args));
    },
    info: function (ctx, args) {
      var dialog = api();
      if (!dialog) { return null; }
      var payload = pick(args);
      payload.kind = payload.kind || 'info';
      return dialog.alert(payload);
    },
    close: function (ctx, args) {
      var dialog = api();
      if (!dialog) { return false; }
      var id = args && (args.id || args.dialogId);
      if (!id) { return false; }
      dialog.close(id);
      return true;
    },
    closeAll: function (ctx) {
      var dialog = api();
      if (!dialog || typeof dialog.closeAll !== 'function') { return false; }
      dialog.closeAll();
      return true;
    }
  };

  KUI.handlers.registerMany('dialog', handlers, {
    title: '弹窗',
    desc: 'dialog 组件的业务函数：提醒/确认/输入/表单/自定义弹窗与关闭'
  });
})(typeof window !== 'undefined' ? window : globalThis);

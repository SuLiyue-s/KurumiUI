/*!
 * KurumiUI · form 组件的业务函数文件（scope = 'form'）
 * 在页面里通过 ctx（KUI.frame 或自定义配置）创建表单后，JSON 里即可：
 *   { "fn": "form.reset" }
 *   { "fn": "form.getData" }
 *   { "fn": "form.setData", "args": { "data": { "name": "示例" } } }
 *   { "fn": "form.setVisible", "args": { "field": "remark", "visible": true } }
 * 取实例顺序：ctx.form → ctx.formInstance → KUI.form.instance
 */
(function (global) {
  'use strict';

  var KUI = global.KUI || {};
  if (!KUI.handlers) { return; }

  function formOf(ctx) {
    if (!ctx) { return null; }
    if (ctx.form) { return ctx.form; }
    if (ctx.formInstance) { return ctx.formInstance; }
    if (ctx.page && ctx.page.form) { return ctx.page.form; }
    return null;
  }

  function toastMsg(box, type, text) {
    if (!KUI.toast || typeof KUI.toast[type] !== 'function') { return; }
    KUI.toast[type](text);
  }

  var handlers = {
    reset: function (ctx) {
      var form = formOf(ctx);
      if (!form || typeof form.reset !== 'function') { return false; }
      form.reset();
      toastMsg(null, 'info', '表单已重置');
      return true;
    },
    validate: function (ctx) {
      var form = formOf(ctx);
      if (!form || typeof form.validate !== 'function') { return false; }
      var ok = form.validate();
      toastMsg(null, ok ? 'success' : 'error', ok ? '校验通过' : '校验未通过，请检查标红字段');
      return ok;
    },
    getData: function (ctx) {
      var form = formOf(ctx);
      if (!form || typeof form.getData !== 'function') { return null; }
      var data = form.getData();
      if (KUI.log) { KUI.log('form.getData →', data); }
      toastMsg(null, 'info', '已取到表单数据（结果见控制台）');
      return data;
    },
    setData: function (ctx, args) {
      var form = formOf(ctx);
      if (!form || typeof form.setData !== 'function') { return false; }
      var data = (args && (args.data || args.values || args.formData)) || args || {};
      form.setData(data);
      return true;
    },
    setValue: function (ctx, args) {
      var form = formOf(ctx);
      if (!form || typeof form.setValue !== 'function' || !args) { return false; }
      var field = args.field || args.id || args.name;
      if (!field) { return false; }
      form.setValue(field, args.value === undefined ? args.text : args.value);
      return true;
    },
    getValue: function (ctx, args) {
      var form = formOf(ctx);
      var field = args && (args.field || args.id || args.name);
      if (!form || !field || typeof form.getValue !== 'function') { return null; }
      return form.getValue(field);
    },
    setVisible: function (ctx, args) {
      var form = formOf(ctx);
      var field = args && (args.field || args.id || args.name);
      if (!form || !field || typeof form.setVisible !== 'function') { return false; }
      form.setVisible(field, args.visible !== false);
      return true;
    },
    setDisabled: function (ctx, args) {
      var form = formOf(ctx);
      var field = args && (args.field || args.id || args.name);
      if (!form || !field || typeof form.setDisabled !== 'function') { return false; }
      form.setDisabled(field, args.disabled !== false);
      return true;
    },
    setRequired: function (ctx, args) {
      var form = formOf(ctx);
      var field = args && (args.field || args.id || args.name);
      if (!form || !field || typeof form.setRequired !== 'function') { return false; }
      form.setRequired(field, args.required !== false);
      return true;
    },
    setError: function (ctx, args) {
      var form = formOf(ctx);
      var field = args && (args.field || args.id || args.name);
      if (!form || !field || typeof form.setError !== 'function') { return false; }
      form.setError(field, args.error || args.text || '错误');
      return true;
    },
    clearError: function (ctx, args) {
      var form = formOf(ctx);
      var field = args && (args.field || args.id || args.name);
      if (!form) { return false; }
      if (field && typeof form.clearError === 'function') { form.clearError(field); return true; }
      if (typeof form.clearValidate === 'function') { form.clearValidate(); return true; }
      return false;
    }
  };

  KUI.handlers.registerMany('form', handlers, {
    title: '表单',
    desc: 'form 组件的业务函数：重置、校验、取值、赋值、显隐与状态'
  });
})(typeof window !== 'undefined' ? window : globalThis);

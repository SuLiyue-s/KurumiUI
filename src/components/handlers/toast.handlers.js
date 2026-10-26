/*!
 * KurumiUI · toast 组件的业务函数文件（scope = 'toast'）
 * JSON 示例：
 *   { "fn": "toast.success", "args": { "text": "保存成功" } }
 *   { "fn": "toast.show", "args": { "type": "info", "title": "提示", "text": "已复制" } }
 * 作用：让配置 JSON 不需要写函数也能弹提醒信息。
 */
(function (global) {
  'use strict';

  var KUI = global.KUI || {};
  if (!KUI.handlers) { return; }

  function api() {
    return KUI.toast || null;
  }

  function text(args) {
    args = args || {};
    return args.text || args.message || args.msg || '';
  }

  var handlers = {
    show: function (ctx, args) {
      var toast = api();
      if (!toast || typeof toast.show !== 'function') { return false; }
      toast.show(args || {});
      return true;
    },
    success: function (ctx, args) {
      var toast = api();
      if (!toast || typeof toast.success !== 'function') { return false; }
      toast.success(text(args));
      return true;
    },
    error: function (ctx, args) {
      var toast = api();
      if (!toast || typeof toast.error !== 'function') { return false; }
      toast.error(text(args));
      return true;
    },
    warning: function (ctx, args) {
      var toast = api();
      if (!toast || typeof toast.warning !== 'function') { return false; }
      toast.warning(text(args));
      return true;
    },
    info: function (ctx, args) {
      var toast = api();
      if (!toast || typeof toast.info !== 'function') { return false; }
      toast.info(text(args));
      return true;
    },
    demo: function (ctx, args) {
      var toast = api();
      if (!toast) { return false; }
      var seq = [
        ['success', '操作成功：配置已应用'],
        ['info', '提示：JSON 里只写了函数名与入参'],
        ['warning', '注意：这是纯配置驱动的提醒'],
        ['error', '错误示例：演示统一风格']
      ];
      var delay = (args && args.delay) || 180;
      seq.forEach(function (item, index) {
        setTimeout(function () {
          if (typeof toast[item[0]] === 'function') { toast[item[0]](item[1]); }
        }, delay * index);
      });
      return seq.length;
    },
    clear: function (ctx) {
      var toast = api();
      if (!toast || typeof toast.closeAll !== 'function') { return false; }
      toast.closeAll();
      return true;
    }
  };

  KUI.handlers.registerMany('toast', handlers, {
    title: '提醒信息',
    desc: 'toast 组件的业务函数：成功/失败/警告/提示/轮播演示/清空'
  });
})(typeof window !== 'undefined' ? window : globalThis);

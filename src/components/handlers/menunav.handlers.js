/*!
 * KurumiUI · menunav 组件的业务函数文件（scope = 'menunav'）
 * JSON 示例：
 *   { "fn": "menunav.refresh" }
 *   { "fn": "menunav.fullscreen" }
 *   { "fn": "menunav.setTitle", "args": { "title": "工作台" } }
 */
(function (global) {
  'use strict';

  var KUI = global.KUI || {};
  if (!KUI.handlers) { return; }

  function navOf(ctx) {
    if (ctx && ctx.menunav) { return ctx.menunav; }
    var app = (ctx && ctx.app) || KUI.app;
    if (app && app.instance && app.instance.menunav) { return app.instance.menunav; }
    return null;
  }

  var handlers = {
    refresh: function (ctx) {
      var nav = navOf(ctx);
      if (nav && typeof nav.refresh === 'function') { nav.refresh(); return true; }
      return false;
    },
    fullscreen: function (ctx) {
      var nav = navOf(ctx);
      if (nav && typeof nav.fullscreen === 'function') { nav.fullscreen(); return true; }
      if (typeof KUI.toggleFullscreen === 'function') { KUI.toggleFullscreen(); return true; }
      return false;
    },
    toggleMenu: function (ctx) {
      var nav = navOf(ctx);
      if (nav && typeof nav.toggleMenu === 'function') { nav.toggleMenu(); return true; }
      var app = (ctx && ctx.app) || KUI.app;
      var inst = app && app.instance;
      if (inst && typeof inst.toggleCollapsed === 'function') { inst.toggleCollapsed(); return true; }
      return false;
    },
    back: function (ctx) {
      var nav = navOf(ctx);
      if (nav && typeof nav.emit === 'function') { nav.emit('history:back', {}); return true; }
      return false;
    },
    forward: function (ctx) {
      var nav = navOf(ctx);
      if (nav && typeof nav.emit === 'function') { nav.emit('history:forward', {}); return true; }
      return false;
    },
    setTitle: function (ctx, args) {
      var nav = navOf(ctx);
      var title = args && (args.title || args.text || args.value);
      if (nav && typeof nav.setTitle === 'function') { nav.setTitle(title || ''); return title || ''; }
      return null;
    },
    setBreadcrumb: function (ctx, args) {
      var nav = navOf(ctx);
      var items = (args && (args.items || args.breadcrumb)) || [];
      if (nav && typeof nav.setBreadcrumb === 'function') { nav.setBreadcrumb(items); return items.length; }
      return 0;
    }
  };

  KUI.handlers.registerMany('menunav', handlers, {
    title: '菜单导航',
    desc: 'menunav 组件的业务函数：刷新、全屏、折叠菜单、前进后退、标题与面包屑'
  });
})(typeof window !== 'undefined' ? window : globalThis);

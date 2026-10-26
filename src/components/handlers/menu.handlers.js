/*!
 * KurumiUI · menu 组件的业务函数文件
 * ---------------------------------------------------------------
 * 注册到 KUI.handlers，scope = 'menu'。
 * 配置 JSON 里可直接写：
 *   { "fn": "menu.toggleCollapse" }
 *   { "fn": "menu.select", "args": { "id": "home" } }
 *   { "fn": "menu.setBadge", "args": { "id": "notify", "text": "3", "type": "danger" } }
 * 这些函数只在主应用里执行（菜单实例由 app-shell 持有）；弹窗 iframe 内的调用
 * 会由 dialog-frame 的动作桥转发回父页面。
 */
(function (global) {
  'use strict';

  var KUI = global.KUI || {};
  if (!KUI.handlers) { return; }

  function menuOf(ctx) {
    if (ctx && ctx.menu) { return ctx.menu; }
    var app = (ctx && ctx.app) || KUI.app;
    if (app && app.instance && app.instance.menu) { return app.instance.menu; }
    // 独立渲染场景：页面可把菜单实例挂到 KUI.demoMenu
    if (KUI.demoMenu) { return KUI.demoMenu; }
    return null;
  }

  function menuApi(ctx) {
    var inst = menuOf(ctx);
    return inst && inst.menu ? inst.menu : inst;
  }

  var handlers = {
    toggleCollapse: function (ctx) {
      var app = (ctx && ctx.app) || KUI.app;
      var inst = app && app.instance;
      if (inst && typeof inst.toggleCollapsed === 'function') { return inst.toggleCollapsed(); }
      var menu = menuApi(ctx);
      if (menu && typeof menu.toggle === 'function') { return menu.toggle(); }
      return false;
    },
    collapse: function (ctx) {
      var menu = menuApi(ctx);
      if (menu && typeof menu.collapse === 'function') { menu.collapse(); return true; }
      return false;
    },
    expand: function (ctx) {
      var menu = menuApi(ctx);
      if (menu && typeof menu.expand === 'function') { menu.expand(); return true; }
      return false;
    },
    select: function (ctx, args) {
      var app = (ctx && ctx.app) || KUI.app;
      var inst = app && app.instance;
      var id = args && (args.id || args.menuId || args.value);
      if (!inst || !id) { return null; }
      if (typeof inst.selectMenu === 'function') { return inst.selectMenu(id); }
      return null;
    },
    setBadge: function (ctx, args) {
      var menu = menuApi(ctx);
      var id = args && (args.id || args.menuId);
      if (!menu || !id || typeof menu.setBadge !== 'function') { return false; }
      menu.setBadge(id, args.text === undefined ? args.value : args.text, args.type || args.badgeType);
      return true;
    },
    clearBadges: function (ctx) {
      var menu = menuApi(ctx);
      if (!menu || typeof menu.setBadge !== 'function' || typeof menu.getItems !== 'function') { return 0; }
      var count = 0;
      (function walk(items) {
        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          if (!item || typeof item !== 'object') { continue; }
          if (item.badge !== undefined && item.badge !== null && item.badge !== '' && item.id) {
            menu.setBadge(item.id, null);
            count += 1;
          }
          if (item.children && item.children.length) { walk(item.children); }
        }
      })(menu.getItems() || []);
      return count;
    },
    cycleActive: function (ctx) {
      var menu = menuApi(ctx);
      if (!menu || typeof menu.getItems !== 'function' || typeof menu.setActive !== 'function') { return null; }
      var flat = [];
      (function walk(items) {
        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          if (!item || typeof item !== 'object') { continue; }
          if (item.type === 'item' && item.id && !item.disabled) { flat.push(item.id); }
          if (item.children && item.children.length) { walk(item.children); }
        }
      })(menu.getItems() || []);
      if (!flat.length) { return null; }
      var cur = null;
      try { cur = menu.getActive(); } catch (e) { cur = null; }
      var idx = flat.indexOf(cur);
      var next = flat[(idx + 1 + flat.length) % flat.length];
      menu.setActive(next);
      var app = (ctx && ctx.app) || KUI.app;
      var inst = app && app.instance;
      if (inst && typeof inst.selectMenu === 'function') { inst.selectMenu(next); }
      return next;
    },
    setCollapsed: function (ctx, args) {
      var app = (ctx && ctx.app) || KUI.app;
      var inst = app && app.instance;
      var collapsed = args && args.collapsed !== undefined ? !!args.collapsed : true;
      if (inst && typeof inst.setCollapsed === 'function') { inst.setCollapsed(collapsed); return collapsed; }
      var menu = menuApi(ctx);
      if (menu && typeof menu.setCollapsed === 'function') { menu.setCollapsed(collapsed); return collapsed; }
      return false;
    }
  };

  KUI.handlers.registerMany('menu', handlers, {
    title: '菜单',
    desc: 'menu 组件的业务函数：折叠、选中、徽标、循环切换'
  });
})(typeof window !== 'undefined' ? window : globalThis);

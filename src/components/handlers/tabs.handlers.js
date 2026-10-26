/*!
 * KurumiUI · tabs 组件的业务函数文件（scope = 'tabs'）
 * JSON 示例：
 *   { "fn": "tabs.open", "args": { "id": "demo", "title": "演示", "url": "pages/home.html" } }
 *   { "fn": "tabs.activateNext" }
 *   { "fn": "tabs.closeActive" }
 */
(function (global) {
  'use strict';

  var KUI = global.KUI || {};
  if (!KUI.handlers) { return; }

  function tabsOf(ctx) {
    if (ctx && ctx.tabs) { return ctx.tabs; }
    var app = (ctx && ctx.app) || KUI.app;
    if (app && app.instance && app.instance.tabs) { return app.instance.tabs; }
    // 独立渲染场景：页面可把标签实例挂到 KUI.demoTabs
    if (KUI.demoTabs) { return KUI.demoTabs; }
    return null;
  }

  function idsOf(tabs) {
    var list = [];
    try { list = tabs.list() || []; } catch (e) { list = []; }
    var ids = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id) { ids.push(list[i].id); }
    }
    return ids;
  }

  function step(ctx, delta) {
    var tabs = tabsOf(ctx);
    if (!tabs || typeof tabs.activate !== 'function') { return null; }
    var ids = idsOf(tabs);
    if (!ids.length) { return null; }
    var cur = null;
    try { cur = tabs.getActive(); } catch (e) { cur = null; }
    if (cur && cur.id) { cur = cur.id; }
    var idx = ids.indexOf(cur);
    var next = ids[(idx + delta + ids.length) % ids.length];
    tabs.activate(next);
    return next;
  }

  var handlers = {
    open: function (ctx, args) {
      var tabs = tabsOf(ctx);
      if (!tabs || typeof tabs.open !== 'function' || !args) { return null; }
      var tab = {
        id: args.id || args.tabId,
        title: args.title || args.text,
        url: args.url || args.src,
        icon: args.icon,
        pinned: args.pinned === true
      };
      if (!tab.url) { return null; }
      return tabs.open(tab);
    },
    activateNext: function (ctx) { return step(ctx, 1); },
    activatePrev: function (ctx) { return step(ctx, -1); },
    closeActive: function (ctx) {
      var tabs = tabsOf(ctx);
      if (!tabs || typeof tabs.close !== 'function') { return null; }
      var cur = null;
      try { cur = tabs.getActive(); } catch (e) { cur = null; }
      var id = cur && cur.id ? cur.id : tabs.activeId;
      if (!id && typeof tabs.activeTabId === 'function') { id = tabs.activeTabId(); }
      if (!id) { return null; }
      tabs.close(id);
      return id;
    },
    closeOthers: function (ctx) {
      var tabs = tabsOf(ctx);
      if (!tabs) { return 0; }
      var cur = null;
      try { cur = tabs.getActive(); } catch (e) { cur = null; }
      var id = cur && cur.id ? cur.id : null;
      if (id && typeof tabs.closeOthers === 'function') { tabs.closeOthers(id); return 1; }
      return 0;
    },
    closeAll: function (ctx) {
      var tabs = tabsOf(ctx);
      if (tabs && typeof tabs.closeAll === 'function') { tabs.closeAll(); return true; }
      return false;
    },
    refreshActive: function (ctx) {
      var tabs = tabsOf(ctx);
      if (!tabs || typeof tabs.refresh !== 'function') { return null; }
      var cur = null;
      try { cur = tabs.getActive(); } catch (e) { cur = null; }
      var id = cur && cur.id ? cur.id : null;
      if (!id) { return null; }
      tabs.refresh(id);
      return id;
    },
    setBadge: function (ctx, args) {
      var tabs = tabsOf(ctx);
      var id = args && (args.id || args.tabId);
      if (!tabs || !id || typeof tabs.setBadge !== 'function') { return false; }
      tabs.setBadge(id, args.text === undefined ? args.value : args.text, args.type);
      return true;
    }
  };

  KUI.handlers.registerMany('tabs', handlers, {
    title: '标签页',
    desc: 'tabs 组件的业务函数：打开/切换/前后/关闭/刷新标签'
  });
})(typeof window !== 'undefined' ? window : globalThis);

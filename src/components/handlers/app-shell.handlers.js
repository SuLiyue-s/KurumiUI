/*!
 * KurumiUI · app-shell 应用外壳的业务函数文件（scope = 'app'）
 * JSON 示例：
 *   { "fn": "app.setTheme", "args": { "id": "kurumi-angel" } }
 *   { "fn": "app.pickTheme" }
 *   { "fn": "app.toggleMenu" }
 *   { "fn": "app.openTab", "args": { "id": "demo", "title": "演示", "url": "pages/home.html" } }
 */
(function (global) {
  'use strict';

  var KUI = global.KUI || {};
  if (!KUI.handlers) { return; }

  function inst(ctx) {
    var app = (ctx && ctx.app) || KUI.app;
    return app && app.instance ? app.instance : null;
  }

  var handlers = {
    setTheme: function (ctx, args) {
      if (!KUI.theme) { return null; }
      var id = args && (args.id || args.theme || args.value);
      if (!id) { return null; }
      KUI.theme.apply(id, { persist: true, broadcast: true });
      if (KUI.toast && typeof KUI.toast.success === 'function' && args && args.silent !== true) {
        var name = args.name || id;
        KUI.toast.success('已切换主题：' + name);
      }
      return id;
    },
    nextTheme: function () {
      if (!KUI.theme) { return null; }
      KUI.theme.next({ persist: true });
      return KUI.theme.currentId ? KUI.theme.currentId() : null;
    },
    prevTheme: function () {
      if (!KUI.theme) { return null; }
      KUI.theme.prev({ persist: true });
      return KUI.theme.currentId ? KUI.theme.currentId() : null;
    },
    randomTheme: function () {
      if (!KUI.theme) { return null; }
      var ids = KUI.theme.ids ? KUI.theme.ids() : [];
      if (!ids.length) { return null; }
      var id = ids[Math.floor(Math.random() * ids.length)];
      KUI.theme.apply(id, { persist: true, broadcast: true });
      return id;
    },
    pickTheme: function (ctx) {
      if (!KUI.actions || typeof KUI.actions.run !== 'function') { return false; }
      if (KUI.actions.has && KUI.actions.has('theme.picker')) {
        KUI.actions.run('theme.picker', ctx);
        return true;
      }
      // 独立渲染场景（未加载 bootstrap）：用 dialog.custom 现场拼一个主题选择弹窗
      if (!KUI.dialog || typeof KUI.dialog.custom !== 'function' || !KUI.theme) { return false; }
      var themes = (KUI.theme.list && KUI.theme.list()) || [];
      if (!themes.length) { return false; }
      var nodes = [];
      for (var i = 0; i < themes.length; i++) {
        var theme = themes[i];
        nodes.push({
          type: 'button',
          id: 'pick-theme-' + theme.id,
          props: {
            text: theme.name + '（' + theme.id + '）',
            icon: 'palette',
            on: {
              click: {
                actions: [
                  { fn: 'app.setTheme', args: { id: theme.id } },
                  { action: 'dialog.close', params: { id: 'theme-picker-demo' } }
                ]
              }
            }
          }
        });
      }
      return KUI.dialog.custom({
        id: 'theme-picker-demo',
        title: '选择界面风格',
        width: 520,
        nodes: nodes
      });
    },
    toggleMenu: function (ctx) {
      var app = inst(ctx);
      if (app && typeof app.toggleCollapsed === 'function') { return app.toggleCollapsed(); }
      if (KUI.demoMenu && typeof KUI.demoMenu.toggle === 'function') { KUI.demoMenu.toggle(); return true; }
      return false;
    },
    openHome: function (ctx) {
      var app = inst(ctx);
      if (!app || typeof app.openTab !== 'function') { return null; }
      var home = KUI.config && typeof KUI.config.get === 'function'
        ? KUI.config.get('app.home', 'pages/home.html') : 'pages/home.html';
      return app.openTab({ id: 'home', title: '总览 · 刻刻帝终端', url: home, icon: 'home', pinned: true });
    },
    openTab: function (ctx, args) {
      var app = inst(ctx);
      if (!app || typeof app.openTab !== 'function' || !args) { return null; }
      return app.openTab(args);
    },
    closeTab: function (ctx, args) {
      var app = inst(ctx);
      var id = args && (args.id || args.tabId);
      if (!app || !id) { return false; }
      app.closeTab(id);
      return true;
    },
    refreshTab: function (ctx, args) {
      var app = inst(ctx);
      var id = args && (args.id || args.tabId);
      if (!app) { return false; }
      app.refreshTab(id);
      return true;
    },
    notify: function (ctx, args) {
      if (!KUI.toast || typeof KUI.toast.show !== 'function') { return false; }
      KUI.toast.show(args || {});
      return true;
    },
    info: function (ctx) {
      if (!KUI.toast || typeof KUI.toast.info !== 'function') { return false; }
      var name = KUI.config && typeof KUI.config.get === 'function'
        ? KUI.config.get('app.name', 'KurumiUI') : 'KurumiUI';
      KUI.toast.info('当前框架：' + name);
      return name;
    }
  };

  KUI.handlers.registerMany('app', handlers, {
    title: '应用外壳',
    desc: 'app-shell 的业务函数：主题切换、菜单折叠、打开与关闭标签、提醒'
  });
})(typeof window !== 'undefined' ? window : globalThis);

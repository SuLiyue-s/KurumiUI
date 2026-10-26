/*!
 * KurumiUI · components/app-shell.js
 * ---------------------------------------------------------------
 * 应用外壳：把 menu / menunav / tabs 组装成完整主界面。
 *
 *   左：menu(252 或折叠 68)
 *   右上：menunav
 *   右下：tabs（内部为 iframe 主体区，保活由 tabs 负责）
 *   浮层：toast / dialog 由各自组件在 body 上创建
 *
 * 设计要点：
 *   - 全部组件都通过 KUI.<type>.create(host, props, ctx) 挂载；
 *     任一组件未加载时只渲染占位提示，不影响其它部分（可拆解）。
 *   - 尺寸/初始折叠/初始标签页全部来自配置 JSON。
 *   - 本文件不写任何颜色与文案，全部走 CSS token 与 KUI.text()。
 */
(function (global) {
  'use strict';

  var KUI = global.KUI = global.KUI || {};
  var hasOwn = Object.prototype.hasOwnProperty;

  var COLLAPSE_KEY = 'kui-menu-collapsed';

  var DEFAULTS = {
    gap: 10,
    menuWidth: 252,
    menuCollapsedWidth: 68,
    headerHeight: 56,
    tabbarHeight: 38,
    collapsed: false
  };

  /* ------------------------------------------------------------------ */
  /* 小工具                                                              */
  /* ------------------------------------------------------------------ */

  function num(v, fallback) {
    var n = parseInt(v, 10);
    return isNaN(n) ? fallback : n;
  }

  function px(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v + 'px';
    return String(v);
  }

  function firstDefined() {
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  }

  function readCollapsed() {
    if (!KUI.env.isBrowser) return null;
    try {
      var v = global.localStorage ? global.localStorage.getItem(COLLAPSE_KEY) : null;
      if (v === null || v === undefined) return null;
      return v === '1' || v === 'true';
    } catch (e) {
      return null;
    }
  }

  function writeCollapsed(v) {
    if (!KUI.env.isBrowser) return;
    try {
      if (global.localStorage) global.localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
    } catch (e) { /* 忽略隐私模式异常 */ }
  }

  /** 组件配置归一：{type,props} 或直接扁平 props */
  function componentConfig(raw, type) {
    if (!raw || typeof raw !== 'object') return { type: type, props: {} };
    if (raw.type || raw.props) {
      return {
        type: raw.type || type,
        props: KUI.utils.assign({}, raw.props || {})
      };
    }
    return { type: type, props: KUI.utils.assign({}, raw) };
  }

  /** 标签对象归一：url 与 src 双兼容 */
  function normalizeTab(tab) {
    if (!tab || typeof tab !== 'object') return null;
    var id = tab.id || tab.key || tab.name;
    var url = firstDefined(tab.url, tab.src, tab.href);
    if (!id && url) id = String(url);
    var t = KUI.utils.assign({}, tab);
    t.id = id;
    t.url = url;
    t.title = firstDefined(tab.title, tab.label, tab.name, id);
    return t;
  }

  /** 从菜单树里找出某 id 的路径（用于面包屑） */
  function findMenuPath(items, id, trail) {
    trail = trail || [];
    if (!items || !items.length) return null;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || typeof it !== 'object') continue;
      if (it.type === 'divider') continue;
      var label = firstDefined(it.label, it.text, it.title);
      var node = { id: it.id, label: label, icon: it.icon };
      var cur = trail.concat([node]);
      if (it.id === id) return cur;
      if (it.children && it.children.length) {
        var found = findMenuPath(it.children, id, cur);
        if (found) return found;
      }
    }
    return null;
  }

  function flattenItems(items, out) {
    out = out || [];
    if (!items) return out;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || typeof it !== 'object') continue;
      out.push(it);
      if (it.children) flattenItems(it.children, out);
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* 创建外壳                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * KUI.app.create(host, config, opts)
   * config：app.json 全量，或 {app,layout,menu,menunav,tabs,text}
   * opts：{ ctx, initialTabs, autoOpen, setTitle }
   */
  function create(host, config, opts) {
    opts = opts || {};
    var cfg = config || {};
    var ctx = opts.ctx || KUI.createContext(null);

    var appMeta = cfg.app || cfg.meta || {};
    var layoutCfg = cfg.layout || {};
    var menuLayout = layoutCfg.menu || layoutCfg.left || {};
    var headerLayout = layoutCfg.header || {};

    var menuWidth = num(firstDefined(menuLayout.width, layoutCfg.menuWidth), DEFAULTS.menuWidth);
    var menuCollapsedWidth = num(firstDefined(menuLayout.collapsedWidth, layoutCfg.menuCollapsedWidth), DEFAULTS.menuCollapsedWidth);
    var headerHeight = num(firstDefined(headerLayout.height, layoutCfg.headerHeight), DEFAULTS.headerHeight);
    var tabbarHeight = num(firstDefined(layoutCfg.tabbarHeight), DEFAULTS.tabbarHeight);
    var gap = num(layoutCfg.gap, DEFAULTS.gap);

    var collapsedPref = readCollapsed();
    var collapsed = firstDefined(
      menuLayout.collapsed,
      layoutCfg.collapsed,
      collapsedPref,
      DEFAULTS.collapsed
    ) === true;

    /* ---------------- DOM 骨架（与 base.css 的 .kui-app 网格对齐） --------------- */

    var rootEl = KUI.h('div', {
      'class': 'kui-app',
      'data-kui-shell': 'true'
    });
    rootEl.setAttribute('role', 'application');

    var leftEl = KUI.h('aside', { 'class': 'kui-app__left', 'aria-label': KUI.text('shell.menu', '主菜单') });
    var mainEl = KUI.h('div', { 'class': 'kui-app__main' });
    var headerEl = KUI.h('header', { 'class': 'kui-app__header' });
    var centerEl = KUI.h('div', { 'class': 'kui-app__center' });
    mainEl.appendChild(headerEl);
    mainEl.appendChild(centerEl);
    rootEl.appendChild(leftEl);
    rootEl.appendChild(mainEl);

    // 布局尺寸交给 CSS 变量（配置 JSON 可调，不改代码）
    var styleVars = {
      '--kui-menu-width': px(menuWidth),
      '--kui-menu-width-collapsed': px(menuCollapsedWidth),
      '--kui-header-height': px(headerHeight),
      '--kui-tabbar-height': px(tabbarHeight),
      '--kui-app-gap': px(gap)
    };
    for (var vn in styleVars) {
      if (!hasOwn.call(styleVars, vn) || styleVars[vn] === null) continue;
      try { rootEl.style.setProperty(vn, styleVars[vn]); } catch (e) { /* noop */ }
    }

    if (collapsed) {
      KUI.addClass(rootEl, 'is-menu-collapsed');
      KUI.addClass(rootEl, 'kui-app--collapsed');
    }

    /* ---------------- 组装组件 ---------------- */

    var menuCfg = componentConfig(cfg.menu, 'menu');
    var menunavCfg = componentConfig(cfg.menunav, 'menunav');
    var tabsCfg = componentConfig(cfg.tabs, 'tabs');

    var bus = KUI.events.create();
    var events = [];      // 已注册动作名, destroy 时清理
    var destroyed = false;

    var app = {
      el: rootEl,
      root: rootEl,
      leftEl: leftEl,
      headerEl: headerEl,
      centerEl: centerEl,
      ctx: ctx,
      config: cfg,
      collapsed: collapsed,
      menu: null,
      menunav: null,
      tabs: null,
      on: function (n, fn) { return bus.on(n, fn); },
      off: function (n, fn) { bus.off(n, fn); },
      emit: function (n, payload) { return bus.emit(n, payload); }
    };

    /* v1.1.5：子组件（menunav 的折叠同步、tabs 的历史状态）通过 ctx.app 找宿主实例；
     * 之前 ctx.app 恒为 null，导致「菜单收起后顶部导航图标/文案不跟随」等联动失效。 */
    ctx.app = app;

    function emit(name, payload) {
      if (destroyed) return;
      bus.emit(name, payload);
      if (KUI.bus) KUI.bus.emit('app:' + name, payload);
    }

    /* ---- menu ---- */
    var menuProps = menuCfg.props;
    if (!menuProps.brand) {
      menuProps.brand = {
        title: firstDefined(appMeta.title, appMeta.name),
        subtitle: appMeta.subtitle,
        logoIcon: firstDefined(appMeta.logoIcon, appMeta.icon)
      };
    }
    if (menuProps.width === undefined) menuProps.width = menuWidth;
    if (menuProps.collapsedWidth === undefined) menuProps.collapsedWidth = menuCollapsedWidth;
    menuProps.collapsed = app.collapsed;
    if (!menuProps.items) menuProps.items = [];

    /* v1.2.0：头像配置透传（app.json 顶层 avatar → menu.props.brand.avatar）。
     * 仍保留 menu.props.brand.avatar 更高优先级，便于独立渲染时单独配置。 */
    var avatarCfg = firstDefined(cfg.avatar, appMeta.avatar);
    if (avatarCfg && menuProps.brand && menuProps.brand.avatar === undefined) {
      menuProps.brand.avatar = avatarCfg;
    }

    app.menu = mountWrapper('menu', leftEl, menuProps, ctx);

    /* ---- menunav ---- */
    var menunavProps = menunavCfg.props;
    if (!menunavProps.breadcrumb) {
      menunavProps.breadcrumb = {
        enabled: true,
        home: { label: firstDefined(appMeta.title, KUI.text('shell.home', '首页')), icon: 'home' }
      };
    }
    if (menunavProps.title === undefined) menunavProps.title = appMeta.title || '';
    if (menunavProps.subtitle === undefined) menunavProps.subtitle = appMeta.subtitle || '';

    app.menunav = mountWrapper('menunav', headerEl, menunavProps, ctx);

    /* ---- tabs ---- */
    var tabsProps = tabsCfg.props;
    app.tabs = mountWrapper('tabs', centerEl, tabsProps, ctx);

    /* v1.2.0：头像运行时入口（默认头像由 app.json 的 avatar 配置决定） */
    app.setAvatar = function (url, extra) {
      if (app.menu && typeof app.menu.setAvatar === 'function') {
        app.menu.setAvatar(url, extra);
      }
      return app;
    };
    app.getAvatar = function () {
      if (app.menu && typeof app.menu.getAvatar === 'function') { return app.menu.getAvatar(); }
      return '';
    };
    app.openAvatarPicker = function () {
      if (app.menu && typeof app.menu.openAvatarPicker === 'function') { return app.menu.openAvatarPicker(); }
      return null;
    };

    /* ---------------- 行为接线 ---------------- */

    // 菜单 -> 打开标签 / 面包屑
    var menuApi = app.menu;
    function onMenuSelect(payload) {
      if (destroyed) return;
      payload = payload || {};
      var item = payload.item || payload;
      var tab = payload.tab || item.tab;

      // 面包屑：菜单层级路径
      var path = findMenuPath(menuProps.items, item.id);
      if (path && path.length) {
        var crumbs = [];
        for (var i = 0; i < path.length; i++) {
          crumbs.push({ label: path[i].label, icon: path[i].icon });
        }
        setBreadcrumb(crumbs);
      } else if (item.label || item.text) {
        setBreadcrumb([{ label: firstDefined(item.label, item.text) }]);
      }

      emit('menu:select', payload);

      if (tab) {
        openTab(normalizeTab(KUI.utils.assign({}, tab, { id: tab.id || item.id, title: tab.title || item.label })));
        return;
      }
      if (payload.url || item.url) {
        openTab(normalizeTab({
          id: item.id,
          title: item.label,
          url: payload.url || item.url,
          icon: item.icon
        }));
      }
    }

    if (menuApi) {
      if (typeof menuApi.on === 'function') menuApi.on('select', onMenuSelect);
      // props.onSelect 为 JSON 里自定义回调时不要覆盖；这里只在没有时挂默认实现
      if (!menuProps.onSelect && typeof menuApi.on !== 'function') {
        menuProps.onSelect = function (item) { onMenuSelect({ item: item }); };
      }
      if (typeof menuApi.on === 'function') {
        menuApi.on('collapsed', function (p) {
          var value = typeof p === 'boolean' ? p : p && p.collapsed;
          applyCollapsed(value, { silent: true, fromMenu: true });
        });
      }
    }

    // 标签页事件
    var tabsApi = app.tabs;
    if (tabsApi && typeof tabsApi.on === 'function') {
      tabsApi.on('activate', function (p) {
        var tab = (p && p.tab) || p || {};
        emit('tab:activate', p);
        // 没有菜单来源的标签（例如弹窗里打开的页面）用标签标题补面包屑
        var menuHit = findMenuPath(menuProps.items, tab.id);
        if (!menuHit) {
          var crumbs = [{ label: firstDefined(appMeta.title, ''), icon: 'home' }];
          crumbs.push({ label: tab.title || tab.id, icon: tab.icon });
          setBreadcrumb(crumbs);
        }
        updateHistoryButtons();
      });
      tabsApi.on('close', function (p) { emit('tab:close', p); updateHistoryButtons(); });
      tabsApi.on('open', function (p) { emit('tab:open', p); });
      tabsApi.on('dirty', function (p) { emit('tab:dirty', p); });
      tabsApi.on('contextmenu', function (p) { emit('tab:contextmenu', p); });
    }

    // 导航条事件
    var navApi = app.menunav;
    if (navApi && typeof navApi.on === 'function') {
      navApi.on('collapse', function () { toggleCollapsed(); });
      navApi.on('refresh', function () { refreshTab(); });
      navApi.on('fullscreen', function () { if (KUI.toggleFullscreen) KUI.toggleFullscreen(); });
      navApi.on('history:back', function () { tabsBack(); });
      navApi.on('history:forward', function () { tabsForward(); });
    }

    /* ---------------- app 方法 ---------------- */

    function setBreadcrumb(items) {
      if (navApi && typeof navApi.setBreadcrumb === 'function') {
        try { navApi.setBreadcrumb(items); } catch (e) { KUI.error('setBreadcrumb 失败', e); }
      }
    }

    function applyCollapsed(value, o) {
      o = o || {};
      var next = typeof value === 'boolean' ? value : !app.collapsed;
      app.collapsed = next;
      KUI.toggleClass(rootEl, 'is-menu-collapsed', next);
      KUI.toggleClass(rootEl, 'kui-app--collapsed', next);
      if (!o.fromMenu && menuApi && typeof menuApi.setCollapsed === 'function') {
        try { menuApi.setCollapsed(next); } catch (e) { /* noop */ }
      }
      if (!o.silent) writeCollapsed(next);
      emit('collapse', { collapsed: next });
      if (KUI.bus) KUI.bus.emit('app:collapse', { collapsed: next });
    }

    function toggleCollapsed(force) {
      return applyCollapsed(typeof force === 'boolean' ? force : !app.collapsed, {});
    }
    function setCollapsed(force) {
      return applyCollapsed(!!force, {});
    }
    function isCollapsed() { return app.collapsed; }

    function openTab(tab) {
      var t = normalizeTab(tab);
      if (!t) return null;
      if (tabsApi && typeof tabsApi.open === 'function') {
        try { return tabsApi.open(t); } catch (e) { KUI.error('打开标签页失败', e); return null; }
      }
      KUI.warnOnce('no-tabs', 'tabs 组件未加载，无法打开标签页。');
      return null;
    }

    function closeTab(id) {
      if (tabsApi && typeof tabsApi.close === 'function') return tabsApi.close(id);
      return undefined;
    }

    function getActiveTab() {
      if (tabsApi && typeof tabsApi.getActive === 'function') return tabsApi.getActive();
      return null;
    }

    function activeTabId() {
      var a = getActiveTab();
      if (!a) return null;
      return typeof a === 'string' ? a : a.id;
    }

    function refreshTab(id) {
      if (!tabsApi || typeof tabsApi.refresh !== 'function') return undefined;
      return tabsApi.refresh(id === undefined ? activeTabId() : id);
    }

    function tabsBack() {
      if (tabsApi && typeof tabsApi.back === 'function') return tabsApi.back();
      return undefined;
    }
    function tabsForward() {
      if (tabsApi && typeof tabsApi.forward === 'function') return tabsApi.forward();
      return undefined;
    }
    function updateHistoryButtons() {
      if (navApi && typeof navApi.setBackForward === 'function') {
        try {
          navApi.setBackForward({
            canBack: !!(tabsApi && tabsApi.canBack && tabsApi.canBack()),
            canForward: !!(tabsApi && tabsApi.canForward && tabsApi.canForward())
          });
        } catch (e) { /* noop */ }
      }
    }

    function selectMenu(id, o) {
      o = o || {};
      if (menuApi && typeof menuApi.setActive === 'function') {
        try { menuApi.setActive(id); } catch (e) { /* noop */ }
      }
      if (o.open !== false) {
        var all = flattenItems(menuProps.items);
        for (var i = 0; i < all.length; i++) {
          if (all[i].id === id) { onMenuSelect({ item: all[i], id: id }); break; }
        }
      }
      return app;
    }

    function setTitle(t) {
      if (navApi && typeof navApi.setTitle === 'function') {
        try { navApi.setTitle(t); } catch (e) { /* noop */ }
      }
      if (KUI.env.isBrowser && opts.setTitle !== false && t) document.title = String(t);
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      for (var i = events.length - 1; i >= 0; i--) {
        if (KUI.actions.has(events[i])) KUI.actions.unregister(events[i]);
      }
      events.length = 0;
      ['tabs', 'menunav', 'menu'].forEach(function (k) {
        var inst = app[k];
        if (inst && typeof inst.destroy === 'function') {
          try { inst.destroy(); } catch (e) { /* noop */ }
        }
      });
      bus.clear();
      if (rootEl.parentNode) rootEl.parentNode.removeChild(rootEl);
      if (KUI.app && KUI.app.instance === app) KUI.app.instance = null;
    }

    app.toggleCollapsed = toggleCollapsed;
    app.setCollapsed = setCollapsed;
    app.isCollapsed = isCollapsed;
    app.openTab = openTab;
    app.open = openTab;
    app.closeTab = closeTab;
    app.getActiveTab = getActiveTab;
    app.activeTabId = activeTabId;
    app.refreshTab = refreshTab;
    app.back = tabsBack;
    app.forward = tabsForward;
    app.selectMenu = selectMenu;
    app.setBreadcrumb = setBreadcrumb;
    app.setTitle = setTitle;
    app.destroy = destroy;

    /* ---------------- 应用级动作注册（供配置 JSON 直接使用） ---------------- */

    function reg(name, fn) {
      if (!name || typeof fn !== 'function') return;
      KUI.actions.register(name, fn);
      events.push(name);
    }
    reg('nav.refresh', function () { return refreshTab(); });
    reg('nav.back', function () { return tabsBack(); });
    reg('nav.forward', function () { return tabsForward(); });
    reg('nav.toggleCollapse', function () { return toggleCollapsed(); });
    reg('nav.fullscreen', function () { return KUI.toggleFullscreen ? KUI.toggleFullscreen() : undefined; });
    reg('nav.open', function (c, p) { return openTab(p); });
    reg('nav.close', function (c, p) { return closeTab(p && p.id ? p.id : p); });
    reg('menu.select', function (c, p) { return selectMenu(p && (p.id || p.menuId)); });
    reg('menu.toggle', function () { return toggleCollapsed(); });

    /* ---------------- 挂载与初始化 ---------------- */

    if (host) {
      while (host.firstChild) host.removeChild(host.firstChild);
      host.appendChild(rootEl);
    }

    if (KUI.env.isBrowser && opts.setTitle !== false && appMeta.title) {
      try { document.title = String(appMeta.title); } catch (e) { /* noop */ }
    }

    // 初始标签页：tabs.props.initial / opts.initialTabs / opts.autoOpen
    var initial = firstDefined(opts.initialTabs, tabsProps.initial, tabsProps.tabs);
    if (initial && initial.length) {
      for (var i2 = 0; i2 < initial.length; i2++) {
        var raw = initial[i2];
        if (typeof raw === 'string') openTab({ id: raw, title: raw, url: raw });
        else openTab(raw);
      }
    } else if (tabsProps.home && opts.autoOpen !== false) {
      // 没有初始标签时打开首页
      openTab(KUI.utils.assign({ id: 'home', title: KUI.text('shell.home', '首页'), icon: 'home' }, tabsProps.home));
    }

    updateHistoryButtons();
    emit('ready', { app: app });
    if (KUI.bus) KUI.bus.emit('app:ready', { app: app });

    // 实例挂到全局，供动作层使用
    KUI.app.instance = app;
    if (!KUI.app.instances) KUI.app.instances = [];
    KUI.app.instances.push(app);

    return app;
  }

  /** 挂载子组件：优先静态 API，回退注册表，最后占位提示 */
  function mountWrapper(type, host, props, ctx) {
    var api = KUI[type];
    if (api && typeof api.create === 'function') {
      try {
        return api.create(host, props, ctx);
      } catch (e) {
        KUI.error('挂载 ' + type + ' 失败:', e);
      }
    }
    if (KUI.registry && KUI.registry.has && KUI.registry.has(type)) {
      try {
        return KUI.mount(type, host, { type: type, props: props }, ctx);
      } catch (e2) {
        KUI.error('挂载 ' + type + ' 失败:', e2);
      }
    }
    var ph = KUI.h('div', { 'class': 'kui-shell__missing' }, [
      KUI.h('span', { 'class': 'kui-shell__missing-icon' }, '?'),
      KUI.h('span', {}, KUI.text('shell.missing', '组件未加载') + ': ' + type)
    ]);
    if (host) host.appendChild(ph);
    KUI.warnOnce('missing-component:' + type,
      '组件 "' + type + '" 未加载，已渲染占位区域。可单独加载该组件或检查脚本顺序。');
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* 静态 API                                                            */
  /* ------------------------------------------------------------------ */

  var appApi = KUI.app || {};

  appApi.create = create;
  appApi.instance = null;
  appApi.instances = appApi.instances || [];

  function withInstance(name, fallback) {
    return function () {
      var inst = appApi.instance;
      if (inst && typeof inst[name] === 'function') return inst[name].apply(inst, arguments);
      KUI.warnOnce('app-api:' + name, '动作需要先创建 app-shell（KUI.app.create）。');
      return fallback;
    };
  }

  appApi.toggleCollapsed = withInstance('toggleCollapsed');
  appApi.setCollapsed = withInstance('setCollapsed');
  appApi.isCollapsed = function () {
    var inst = appApi.instance;
    return inst ? !!inst.isCollapsed() : false;
  };
  appApi.openTab = withInstance('openTab');
  appApi.open = appApi.openTab;
  appApi.closeTab = withInstance('closeTab');
  appApi.refreshTab = withInstance('refreshTab');
  appApi.selectMenu = withInstance('selectMenu');
  appApi.setBreadcrumb = withInstance('setBreadcrumb');
  appApi.setTitle = withInstance('setTitle');
  appApi.getActiveTab = function () {
    var inst = appApi.instance;
    return inst ? inst.getActiveTab() : null;
  };
  appApi.destroy = function () {
    var inst = appApi.instance;
    if (inst) inst.destroy();
  };

  KUI.app = appApi;

  /* ------------------------------------------------------------------ */
  /* 注册为可 JSON 挂载的控件                                            */
  /* ------------------------------------------------------------------ */

  if (KUI.registry && typeof KUI.registry.register === 'function') {
    KUI.registry.register('app-shell', {
      category: 'layout',
      title: '应用外壳',
      defaults: {
        app: { title: 'KurumiUI' },
        layout: {},
        menu: { type: 'menu', props: { items: [] } },
        menunav: { type: 'menunav', props: {} },
        tabs: { type: 'tabs', props: {} }
      },
      render: function (node, ctx) {
        var box = KUI.h('div', { 'class': 'kui-app-shell__box' });
        var conf = (node && node.props) || node || {};
        var instance = create(box, conf, { ctx: ctx });
        var el = box.firstChild || box;
        if (el) el.__kuiApp = instance;
        return el;
      },
      api: function (el) {
        return { app: el && el.__kuiApp ? el.__kuiApp : null };
      }
    });
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));

/*!
 * KurumiUI · shell · menunav.js
 * 顶部导航条：折叠按钮 + 面包屑（配置化）+ 历史前进/后退 + 刷新 + 全屏 +
 *            配置化动作按钮 + 右侧插槽
 * 契约：docs/00-contract.md §8.2、§9、§10、§11、§12、§16
 *
 * 注册 type：menunav
 * 实例 API：
 *   el / props / setBreadcrumb(items|{items,home,enabled}) / push(item) / pop()
 *   setTitle(t) / setSubtitle(t) / setActions(list) / setBackForward({canBack,canForward})
 *   refresh() / toggleMenu() / on(name,fn) / off(name,fn) / emit(name,payload) / destroy()
 * 事件：breadcrumb / action / refresh / history / collapse / fullscreen
 */
(function (KUI) {
  'use strict';

  if (!KUI) { KUI = window.KUI = window.KUI || {}; }

  var hasOwn = Object.prototype.hasOwnProperty;

  /* ================= 防御式工具（core 缺失时仍可用） ================= */

  function safe(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
  }

  function deepMerge(base, patch) {
    var out = {}, key;
    for (key in base) {
      if (hasOwn.call(base, key)) { out[key] = base[key]; }
    }
    if (patch) {
      for (key in patch) {
        if (!hasOwn.call(patch, key)) { continue; }
        var pv = patch[key], bv = out[key];
        if (pv && typeof pv === 'object' && !Array.isArray(pv) &&
            bv && typeof bv === 'object' && !Array.isArray(bv)) {
          out[key] = deepMerge(bv, pv);
        } else {
          out[key] = pv;
        }
      }
    }
    return out;
  }

  function txt(key, fallback, vars) {
    var value = safe(function () { return KUI.text(key, fallback, vars); }, fallback);
    if (value === undefined || value === null || value === '') { return fallback; }
    return value;
  }

  function iconHtml(name, cls) {
    if (!name) { return ''; }
    var klass = cls || 'kui-icon';
    var html = safe(function () {
      // core/icons 提供 icons.get(name, opts) 返回完整 svg 标记；create 返回 DOM
      if (KUI.icons && typeof KUI.icons.get === 'function') {
        return KUI.icons.get(name, { 'class': klass, size: 16 });
      }
      return '';
    }, '');
    if (html && typeof html === 'string') { return html; }
    // 降级：图标系统尚未加载时直接引用 sprite symbol（core/icons 的 id 前缀为 kui-icon-）
    return '<svg class="' + klass + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<use href="#kui-icon-' + String(name).replace(/[^A-Za-z0-9_-]/g, '') + '"></use></svg>';
  }

  function el(tag, cls) {
    var node = document.createElement(tag);
    if (cls) { node.className = cls; }
    return node;
  }

  function elText(tag, cls, value) {
    var node = el(tag, cls);
    node.textContent = (value === undefined || value === null) ? '' : String(value);
    return node;
  }

  function iconBox(name, cls) {
    var box = el('span', cls || 'kui-menunav__icon');
    var html = iconHtml(name);
    if (html) { box.innerHTML = html; }
    box.setAttribute('aria-hidden', 'true');
    return box;
  }

  function on(target, type, fn, opts) {
    if (target && typeof target.addEventListener === 'function') {
      target.addEventListener(type, fn, opts || false);
    }
  }

  function emitGlobal(name, payload) {
    safe(function () {
      if (KUI.events && typeof KUI.events.emit === 'function') { KUI.events.emit(name, payload); }
    });
  }

  function register(type, descriptor) {
    if (KUI.registry && typeof KUI.registry.register === 'function') {
      KUI.registry.register(type, descriptor);
      return;
    }
    var pending = KUI.__pendingComponents || (KUI.__pendingComponents = []);
    pending.push({ type: type, descriptor: descriptor });
  }

  function isElement(obj) {
    return !!(obj && typeof obj === 'object' && obj.nodeType === 1 && obj.nodeName);
  }

  function clearChildren(node) {
    if (!node) { return; }
    while (node.firstChild) { node.removeChild(node.firstChild); }
  }

  /* ================= 默认配置（契约 §8.2） ================= */

  var DEFAULTS = {
    mode: 'header',
    title: '',
    subtitle: '',
    showCollapse: true,
    showHistory: true,
    showRefresh: true,
    showFullscreen: true,
    breadcrumb: { enabled: true, separator: '/', home: null, items: [] },
    actions: [],
    slot: null,
    right: null,
    home: null,
    // 0 表示不裁剪；>0 时超出部分折叠为省略号（保留首尾）
    maxBreadcrumb: 0,
    on: null,
    onAction: null
  };

  // app-shell 会在挂载前把 props 合并进节点，故扁平字段与 node.props 都要读
  var FLAT_KEYS = ['mode', 'title', 'subtitle', 'showCollapse', 'showHistory', 'showRefresh',
    'showFullscreen', 'breadcrumb', 'actions', 'slot', 'right', 'home', 'maxBreadcrumb', 'onAction'];

  /* v1.3.9：breadcrumb.max 是 props.breadcrumb 里的字段，真正的读取点是 maxBreadcrumb；
     此前只合并进 breadcrumb 对象却没人读，配置等于没写。
     统一放在归一函数里，保证「registry 渲染」与「KUI.menunav.create 直连」两条路径都生效。 */
  function normalizeProps(props) {
    if (props && props.breadcrumb && props.breadcrumb.max !== undefined &&
        (props.maxBreadcrumb === undefined || props.maxBreadcrumb === 0)) {
      props.maxBreadcrumb = props.breadcrumb.max;
    }
    return props;
  }

  function resolveProps(node) {
    var nodeProps = (node && node.props) || {};
    var merged = deepMerge(DEFAULTS, nodeProps);
    if (!node) { return merged; }
    var i, key;
    for (i = 0; i < FLAT_KEYS.length; i++) {
      key = FLAT_KEYS[i];
      if (node[key] === undefined) { continue; }
      if (key === 'breadcrumb' && merged.breadcrumb && typeof merged.breadcrumb === 'object') {
        merged.breadcrumb = deepMerge(merged.breadcrumb, node[key]);
      } else {
        merged[key] = node[key];
      }
    }
    return normalizeProps(merged);
  }

  /* ================= 实例 ================= */

  function createMenunav(host, rawProps, ctx, node) {
    var props = rawProps && rawProps.__resolved ? rawProps : normalizeProps(deepMerge(DEFAULTS, rawProps || {}));
    var handlers = {};
    var globalOffs = [];
    var state = {
      title: props.title || '',
      subtitle: props.subtitle || '',
      collapsed: false,
      destroyed: false,
      canBack: false,
      canForward: false,
      breadcrumb: (props.breadcrumb && props.breadcrumb.items) || [],
      home: (props.breadcrumb && props.breadcrumb.home) || props.home || null,
      actions: props.actions || []
    };

    var root, leftEl, rightEl, crumbEl, slotEl, actionsEl;
    var collapseBtn, backBtn, forwardBtn, refreshBtn, fsBtn;

    /* ---------- 事件总线 ---------- */
    function fire(name, payload) {
      var list = handlers[name];
      if (list) {
        for (var i = 0; i < list.length; i++) {
          (function (fn) {
            safe(function () { fn.call(api, payload); });
          })(list[i]);
        }
      }
      if (props.on && typeof props.on[name] === 'function') {
        safe(function () { props.on[name](payload); });
      }
      var nodeOn = node && node.on;
      if (nodeOn && typeof nodeOn[name] === 'function') {
        safe(function () { nodeOn[name](payload); });
      }
      if (ctx && typeof ctx.emit === 'function') {
        safe(function () { ctx.emit(name, payload); });
      }
      emitGlobal('menunav:' + name, payload);
    }

    /* ---------- 取协作实例（app-shell 可能晚于本组件创建，故延迟取） ---------- */
    function getApp() {
      return (ctx && ctx.app) || (KUI.app && KUI.app.instance) || (KUI.app && KUI.app) || null;
    }

    function getMenu() {
      var app = getApp();
      return (app && app.menu) || (KUI.app && KUI.app.menu) || null;
    }

    function getTabs() {
      var app = getApp();
      return (app && app.tabs) || (KUI.app && KUI.app.tabs) || null;
    }

    // 是否已有外部（app-shell 等）监听该事件：有则只派发，交由外部统一执行，
    // 避免组件内部操作与外部监听重复执行（例如后退跳两次、全屏切换两次）。
    function hasListener(name) {
      return !!(handlers && handlers[name] && handlers[name].length);
    }

    /* ---------- 动作分发：ctx.action → KUI.actions.run → 事件 ---------- */
    function runAction(action, ev, meta) {
      if (!action) { return false; }
      if (typeof action === 'function') {
        safe(function () { action(ctx, ev, meta); });
        fire('action', { action: action, ev: ev, meta: meta });
        return true;
      }
      if (ctx && typeof ctx.action === 'function') {
        var ran = safe(function () { ctx.action(action, ctx, ev); return true; }, false);
        if (ran) { fire('action', { action: action, ev: ev, meta: meta }); return true; }
      }
      if (KUI.actions && typeof KUI.actions.run === 'function') {
        var ran2 = safe(function () { KUI.actions.run(action, ctx, ev); return true; }, false);
        if (ran2) { fire('action', { action: action, ev: ev, meta: meta }); return true; }
      }
      fire('action', { action: action, ev: ev, meta: meta });
      return false;
    }

    /* ---------- 基础按钮 ---------- */
    function navBtn(icon, title, handler, extraCls) {
      var btn = el('button', 'kui-menunav__btn' + (extraCls ? ' ' + extraCls : ''));
      btn.type = 'button';
      btn.title = title || '';
      btn.setAttribute('aria-label', title || '');
      var box = el('span', 'kui-menunav__btn-icon');
      box.innerHTML = iconHtml(icon);
      box.setAttribute('aria-hidden', 'true');
      btn.appendChild(box);
      on(btn, 'click', function (ev) {
        if (ev && ev.preventDefault) { ev.preventDefault(); }
        safe(function () { handler(ev); });
      });
      return btn;
    }

    /* ---------- 构建 ---------- */
    function build() {
      root = el('header', 'kui-menunav kui-menunav--' + (props.mode || 'header'));
      root.setAttribute('role', 'banner');
      leftEl = el('div', 'kui-menunav__left');
      rightEl = el('div', 'kui-menunav__right');

      // 折叠按钮（联动 menu）
      if (props.showCollapse) {
        collapseBtn = navBtn('collapse', txt('menunav.collapse', '折叠菜单'), function () {
          toggleMenu();
        }, 'kui-menunav__btn--collapse');
        leftEl.appendChild(collapseBtn);
      }

      // 标题 / 副标题
      if (state.title || state.subtitle) {
        var titleWrap = el('div', 'kui-menunav__title-wrap');
        if (state.title) {
          titleWrap.appendChild(elText('div', 'kui-menunav__title', state.title));
        }
        if (state.subtitle) {
          titleWrap.appendChild(elText('div', 'kui-menunav__subtitle', state.subtitle));
        }
        leftEl.appendChild(titleWrap);
      }

      // 面包屑
      if (props.breadcrumb && props.breadcrumb.enabled) {
        crumbEl = el('nav', 'kui-menunav__breadcrumb');
        crumbEl.setAttribute('aria-label', txt('menunav.breadcrumb', '面包屑导航'));
        leftEl.appendChild(crumbEl);
      }

      // 右侧：历史 / 刷新
      var group = el('div', 'kui-menunav__group');
      if (props.showHistory) {
        backBtn = navBtn('arrow-left', txt('menunav.back', '后退'), function () { goBack(); }, 'kui-menunav__btn--back');
        backBtn.disabled = true;
        forwardBtn = navBtn('arrow-right', txt('menunav.forward', '前进'), function () { goForward(); }, 'kui-menunav__btn--forward');
        forwardBtn.disabled = true;
        group.appendChild(backBtn);
        group.appendChild(forwardBtn);
      }
      if (props.showRefresh) {
        refreshBtn = navBtn('refresh', txt('menunav.refresh', '刷新当前页'), function () { refresh(); }, 'kui-menunav__btn--refresh');
        group.appendChild(refreshBtn);
      }
      if (group.childNodes.length) { rightEl.appendChild(group); }

      // 全屏
      if (props.showFullscreen) {
        fsBtn = navBtn('fullscreen', txt('menunav.fullscreen', '全屏'), function () { toggleFullscreen(); }, 'kui-menunav__btn--fullscreen');
        rightEl.appendChild(fsBtn);
      }

      // 配置化动作
      actionsEl = el('div', 'kui-menunav__actions');
      rightEl.appendChild(actionsEl);

      // 右侧插槽
      slotEl = el('div', 'kui-menunav__slot');
      rightEl.appendChild(slotEl);

      root.appendChild(leftEl);
      root.appendChild(rightEl);

      if (host && typeof host.appendChild === 'function') { host.appendChild(root); }

      renderBreadcrumb();
      renderActions();
      renderSlot();
      updateFullscreenIcon();
      syncCollapseIcon();
      syncHistoryState();
    }

    /* ---------- 面包屑 ---------- */
    function renderBreadcrumb() {
      if (!crumbEl) { return; }
      clearChildren(crumbEl);
      if (!(props.breadcrumb && props.breadcrumb.enabled)) { return; }

      var sepText = (props.breadcrumb && props.breadcrumb.separator) || '/';
      var list = [];
      if (state.home !== null && state.home !== undefined && state.home !== false) {
        var home = state.home;
        if (typeof home === 'string') { home = { label: home }; }
        list.push({
          id: home.id || '__home',
          label: home.label || '',
          icon: home.icon || 'home',
          title: home.title || home.label || '',
          action: home.action,
          tab: home.tab,
          url: home.url,
          isHome: true
        });
      }
      var items = state.breadcrumb || [];
      var i;
      for (i = 0; i < items.length; i++) {
        if (!items[i]) { continue; }
        list.push(items[i]);
      }

      // 超出 maxBreadcrumb 时折叠中间项
      var max = props.maxBreadcrumb > 0 ? props.maxBreadcrumb : 0;
      var ellipsisIndex = -1;
      if (max > 0 && list.length > max) {
        var head = list.slice(0, 1);
        var tail = list.slice(list.length - (max - 2));
        list = head.concat([{ __ellipsis: true }]).concat(tail);
        ellipsisIndex = 1;
      }

      for (i = 0; i < list.length; i++) {
        var item = list[i];
        if (i > 0) {
          var sep = elText('span', 'kui-menunav__crumb-sep', sepText);
          sep.setAttribute('aria-hidden', 'true');
          crumbEl.appendChild(sep);
        }
        if (item.__ellipsis) {
          var more = elText('span', 'kui-menunav__crumb-ellipsis', '…');
          more.title = txt('menunav.more', '更多层级');
          crumbEl.appendChild(more);
          continue;
        }
        var label = item.label !== undefined ? item.label : (item.text || '');
        var crumb = el('a', 'kui-menunav__crumb');
        crumb.setAttribute('role', 'link');
        crumb.setAttribute('tabindex', '0');
        crumb.setAttribute('href', 'javascript:void(0);');
        crumb.title = item.title || label || '';
        if (item.icon) {
          crumb.appendChild(iconBox(item.icon, 'kui-menunav__crumb-icon'));
          if (!label) { crumb.classList.add('is-icon-only'); }
        }
        if (label) {
          crumb.appendChild(elText('span', 'kui-menunav__crumb-label', label));
        }
        if (i === list.length - 1) { crumb.classList.add('is-current'); }
        if (item.disabled) { crumb.classList.add('is-disabled'); }
        on(crumb, 'click', (function (it, idx) {
          return function (ev) {
            if (ev && ev.preventDefault) { ev.preventDefault(); }
            selectCrumb(it, idx, ev);
          };
        })(item, i));
        on(crumb, 'keydown', (function (it, idx) {
          return function (ev) {
            if (ev && (ev.key === 'Enter' || ev.key === ' ')) {
              if (ev.preventDefault) { ev.preventDefault(); }
              selectCrumb(it, idx, ev);
            }
          };
        })(item, i));
        crumbEl.appendChild(crumb);
      }
    }

    function selectCrumb(item, index, ev) {
      if (item && item.disabled) { return; }
      fire('breadcrumb', { item: item, index: index, ev: ev });
      if (item && item.action) {
        runAction(item.action, ev, { type: 'breadcrumb', item: item });
      } else if (item && item.tab) {
        runAction({ tab: item.tab }, ev, { type: 'breadcrumb', item: item });
      }
    }

    /* ---------- 配置化动作 ---------- */
    function renderActions() {
      if (!actionsEl) { return; }
      clearChildren(actionsEl);
      var list = state.actions || [];
      var i;
      for (i = 0; i < list.length; i++) {
        var item = list[i];
        if (!item) { continue; }
        if (item.visible === false) { continue; }
        if (item.type === 'divider') {
          actionsEl.appendChild(el('span', 'kui-menunav__actions-divider'));
          continue;
        }
        var btn = el('button', 'kui-menunav__action');
        btn.type = 'button';
        if (item.id) { btn.setAttribute('data-action', item.id); }
        var label = item.label || item.title || '';
        var title = item.title || item.label || item.id || '';
        btn.title = title;
        btn.setAttribute('aria-label', title);
        if (item.icon) {
          var iconWrap = iconBox(item.icon, 'kui-menunav__action-icon');
          btn.appendChild(iconWrap);
        }
        if (item.label) {
          btn.appendChild(elText('span', 'kui-menunav__action-label', item.label));
        }
        if (item.badge !== undefined && item.badge !== null && item.badge !== '') {
          var badge = elText('span', 'kui-menunav__action-badge', item.badge);
          if (item.badgeType) { badge.classList.add('kui-menunav__action-badge--' + item.badgeType); }
          btn.appendChild(badge);
        }
        if (item.disabled) {
          btn.disabled = true;
          btn.classList.add('is-disabled');
        }
        if (item.active) { btn.classList.add('is-active'); }
        if (!item.icon && !item.label && title) {
          btn.appendChild(elText('span', 'kui-menunav__action-label', title));
        }
        on(btn, 'click', (function (cfg) {
          return function (ev) {
            if (ev && ev.preventDefault) { ev.preventDefault(); }
            if (cfg.disabled) { return; }
            var action = cfg.action;
            if (action === undefined && cfg.id) { action = cfg.id; }
            runAction(action, ev, { type: 'action', item: cfg });
          };
        })(item));
        actionsEl.appendChild(btn);
      }
      actionsEl.style.display = actionsEl.childNodes.length ? '' : 'none';
    }

    /* ---------- 右侧插槽 ---------- */
    function renderSlot() {
      if (!slotEl) { return; }
      var content = props.slot || props.right;
      if (content === null || content === undefined) { return; }
      if (isElement(content)) {
        slotEl.appendChild(content);
        return;
      }
      if (typeof content === 'string') {
        slotEl.innerHTML = content;
        return;
      }
      if (Object.prototype.toString.call(content) === '[object Array]') {
        var i;
        for (i = 0; i < content.length; i++) {
          var one = content[i];
          if (isElement(one)) { slotEl.appendChild(one); }
          else if (one && typeof one === 'object') {
            safe(function () {
              if (KUI.renderNode) {
                var rendered = KUI.renderNode(one, ctx);
                if (rendered) { slotEl.appendChild(rendered); }
              }
            });
          }
        }
        return;
      }
      if (typeof content === 'object') {
        safe(function () {
          if (KUI.renderNode) {
            var rendered = KUI.renderNode(content, ctx);
            if (rendered) { slotEl.appendChild(rendered); }
          }
        });
      }
    }

    /* ---------- 折叠联动 ---------- */
    function syncCollapseIcon() {
      var menu = getMenu();
      var collapsed = null;
      if (menu && typeof menu.isCollapsed === 'function') {
        collapsed = safe(function () { return menu.isCollapsed(); }, null);
      }
      if (collapsed === null) { return; }
      state.collapsed = !!collapsed;
      if (collapseBtn) {
        var icon = collapseBtn.querySelector ? collapseBtn.querySelector('.kui-menunav__btn-icon') : null;
        if (icon) { icon.innerHTML = iconHtml(state.collapsed ? 'expand' : 'collapse'); }
        var label = state.collapsed ? txt('menunav.expand', '展开菜单') : txt('menunav.collapse', '折叠菜单');
        collapseBtn.title = label;
        collapseBtn.setAttribute('aria-label', label);
        collapseBtn.setAttribute('aria-expanded', state.collapsed ? 'false' : 'true');
      }
      if (root.classList) {
        if (state.collapsed) { root.classList.add('is-collapsed'); }
        else { root.classList.remove('is-collapsed'); }
      }
    }

    function toggleMenu() {
      var menu = getMenu();
      // app-shell 若监听 collapse 则由它统一执行折叠（它会调用 menu.setCollapsed），避免重复切换
      if (!hasListener('collapse') && menu && typeof menu.toggle === 'function') {
        safe(function () { menu.toggle(); });
      }
      fire('collapse', {});
      syncCollapseIcon();
    }

    /* ---------- 历史 ---------- */
    function goBack() {
      var tabs = getTabs();
      // app-shell 若监听 history:back 则由它执行，避免双重后退
      if (!hasListener('history:back') && tabs && typeof tabs.back === 'function') {
        safe(function () { tabs.back(); });
      }
      fire('history', { direction: 'back' });
      fire('history:back', {});
      syncHistoryState();
    }

    function goForward() {
      var tabs = getTabs();
      if (!hasListener('history:forward') && tabs && typeof tabs.forward === 'function') {
        safe(function () { tabs.forward(); });
      }
      fire('history', { direction: 'forward' });
      fire('history:forward', {});
      syncHistoryState();
    }

    function updateBackForward(flagBack, flagForward) {
      state.canBack = !!flagBack;
      state.canForward = !!flagForward;
      if (backBtn) { backBtn.disabled = !state.canBack; }
      if (forwardBtn) { forwardBtn.disabled = !state.canForward; }
    }

    function syncHistoryState() {
      var tabs = getTabs();
      if (!tabs) { return; }
      var cb = typeof tabs.canBack === 'function' ? safe(function () { return !!tabs.canBack(); }, false) : false;
      var cf = typeof tabs.canForward === 'function' ? safe(function () { return !!tabs.canForward(); }, false) : false;
      updateBackForward(cb, cf);
    }

    /* ---------- 刷新 ---------- */
    function refresh() {
      var tabs = getTabs();
      var active = '';
      if (tabs && typeof tabs.getActive === 'function') {
        active = safe(function () { return tabs.getActive(); }, '');
      }
      // app-shell 若监听 refresh 则由它执行，避免刷新两次
      if (!hasListener('refresh') && active && tabs && typeof tabs.refresh === 'function') {
        safe(function () { tabs.refresh(active); });
      }
      fire('refresh', { id: active });
      return api;
    }

    /* ---------- 全屏 ---------- */
    function fullscreenElement() {
      if (!document) { return null; }
      return document.fullscreenElement || document.webkitFullscreenElement ||
        document.webkitCurrentFullScreenElement || document.msFullscreenElement || null;
    }

    function toggleFullscreen() {
      var doc = document;
      var rootEl = doc && doc.documentElement;
      var active = !!fullscreenElement();
      // app-shell 若监听 fullscreen 则由它执行（KUI.toggleFullscreen），避免切换两次
      if (!hasListener('fullscreen')) {
        try {
          if (active) {
            if (doc.exitFullscreen) {
              var p1 = doc.exitFullscreen();
              if (p1 && typeof p1.catch === 'function') { p1.catch(function () {}); }
            } else if (doc.webkitExitFullscreen) { doc.webkitExitFullscreen(); }
            else if (doc.msExitFullscreen) { doc.msExitFullscreen(); }
          } else if (rootEl) {
            if (rootEl.requestFullscreen) {
              var p2 = rootEl.requestFullscreen();
              if (p2 && typeof p2.catch === 'function') { p2.catch(function () {}); }
            } else if (rootEl.webkitRequestFullscreen) { rootEl.webkitRequestFullscreen(); }
            else if (rootEl.msRequestFullscreen) { rootEl.msRequestFullscreen(); }
          }
        } catch (e) { /* 全屏可能被浏览器策略拒绝 */ }
      }
      fire('fullscreen', { active: !active });
      // 浏览器异步切换，稍后同步图标
      window.setTimeout(updateFullscreenIcon, 80);
    }

    function updateFullscreenIcon() {
      if (!fsBtn) { return; }
      var active = !!fullscreenElement();
      var box = fsBtn.querySelector ? fsBtn.querySelector('.kui-menunav__btn-icon') : null;
      if (box) { box.innerHTML = iconHtml(active ? 'exit-fullscreen' : 'fullscreen'); }
      var label = active ? txt('menunav.exitFullscreen', '退出全屏') : txt('menunav.fullscreen', '全屏');
      fsBtn.title = label;
      fsBtn.setAttribute('aria-label', label);
    }

    /* ---------- 全局事件（菜单折叠 / 标签历史状态） ---------- */
    function bindGlobal(name, fn) {
      var off = null;
      if (KUI.events && typeof KUI.events.on === 'function') {
        off = safe(function () { return KUI.events.on(name, fn); }, null);
      }
      globalOffs.push(function () {
        if (typeof off === 'function') { safe(function () { off(); }); }
        else if (KUI.events && typeof KUI.events.off === 'function') { safe(function () { KUI.events.off(name, fn); }); }
      });
    }

    function bindGlobals() {
      bindGlobal('menu:collapsed', function () { syncCollapseIcon(); });
      bindGlobal('menu:ready', function () { syncCollapseIcon(); });
      bindGlobal('tabs:activate', function () { syncHistoryState(); });
      bindGlobal('tabs:open', function () { syncHistoryState(); });
      bindGlobal('tabs:close', function () { syncHistoryState(); });
    }

    function bindDocumentEvents() {
      var handler = function () { updateFullscreenIcon(); };
      on(document, 'fullscreenchange', handler);
      on(document, 'webkitfullscreenchange', handler);
      on(document, 'msfullscreenchange', handler);
    }

    /* ---------- 对外 API ---------- */
    var api = {
      node: node,
      ctx: ctx,
      type: 'menunav',
      props: props,

      on: function (name, fn) {
        if (typeof fn === 'function') {
          if (!handlers[name]) { handlers[name] = []; }
          handlers[name].push(fn);
        }
        return api;
      },
      off: function (name, fn) {
        var list = handlers[name];
        if (!list) { return api; }
        if (!fn) { handlers[name] = []; return api; }
        for (var i = list.length - 1; i >= 0; i--) {
          if (list[i] === fn) { list.splice(i, 1); }
        }
        return api;
      },
      emit: function (name, payload) { fire(name, payload); return api; },

      setBreadcrumb: function (input) {
        if (!input) {
          state.breadcrumb = [];
        } else if (Object.prototype.toString.call(input) === '[object Array]') {
          state.breadcrumb = input;
        } else if (typeof input === 'object') {
          if (input.items !== undefined) { state.breadcrumb = input.items || []; }
          if (input.home !== undefined) { state.home = input.home; }
          if (input.enabled !== undefined) {
            props.breadcrumb.enabled = !!input.enabled;
            if (props.breadcrumb.enabled && !crumbEl && leftEl) {
              crumbEl = el('nav', 'kui-menunav__breadcrumb');
              leftEl.appendChild(crumbEl);
            }
            if (!props.breadcrumb.enabled && crumbEl) {
              clearChildren(crumbEl);
            }
          }
        }
        renderBreadcrumb();
        return api;
      },
      push: function (item) {
        if (!state.breadcrumb) { state.breadcrumb = []; }
        state.breadcrumb.push(item);
        renderBreadcrumb();
        return api;
      },
      pop: function () {
        var removed = (state.breadcrumb || []).pop();
        renderBreadcrumb();
        return removed || null;
      },
      getBreadcrumb: function () {
        return { home: state.home, items: state.breadcrumb || [] };
      },
      setTitle: function (title) {
        state.title = title || '';
        var node2 = root && root.querySelector ? root.querySelector('.kui-menunav__title') : null;
        if (node2) { node2.textContent = state.title; }
        else if (state.title && leftEl) {
          var wrap = el('div', 'kui-menunav__title-wrap');
          wrap.appendChild(elText('div', 'kui-menunav__title', state.title));
          leftEl.appendChild(wrap);
        }
        return api;
      },
      setSubtitle: function (subtitle) {
        state.subtitle = subtitle || '';
        var node3 = root && root.querySelector ? root.querySelector('.kui-menunav__subtitle') : null;
        if (node3) { node3.textContent = state.subtitle; }
        return api;
      },
      setActions: function (list) {
        state.actions = list || [];
        renderActions();
        return api;
      },
      getActions: function () { return state.actions || []; },
      setBackForward: function (flagBack, flagForward) {
        if (flagBack && typeof flagBack === 'object') {
          updateBackForward(flagBack.canBack, flagBack.canForward);
        } else {
          updateBackForward(flagBack, flagForward);
        }
        return api;
      },
      syncHistory: function () { syncHistoryState(); return api; },
      refresh: refresh,
      toggleMenu: toggleMenu,
      toggleFullscreen: toggleFullscreen,
      update: function (patch) {
        if (!patch || typeof patch !== 'object') { return api; }
        if (patch.title !== undefined) { api.setTitle(patch.title); }
        if (patch.subtitle !== undefined) { api.setSubtitle(patch.subtitle); }
        if (patch.actions !== undefined) { api.setActions(patch.actions); }
        if (patch.breadcrumb !== undefined) { api.setBreadcrumb(patch.breadcrumb); }
        return api;
      },
      destroy: function () {
        if (state.destroyed) { return; }
        state.destroyed = true;
        var i;
        for (i = 0; i < globalOffs.length; i++) {
          safe(globalOffs[i]);
        }
        globalOffs = [];
        handlers = {};
        if (root && root.parentNode) { root.parentNode.removeChild(root); }
        emitGlobal('menunav:destroy', { el: root });
      }
    };

    build();
    api.el = root;
    bindGlobals();
    bindDocumentEvents();
    // 延迟同步一次（app-shell 的 menu/tabs 可能在本组件之后创建）
    window.setTimeout(function () {
      if (state.destroyed) { return; }
      syncCollapseIcon();
      syncHistoryState();
    }, 0);

    return api;
  }

  /* ================= 组件注册（契约 §6） ================= */

  register('menunav', {
    category: 'shell',
    defaults: DEFAULTS,
    render: function (node, ctx) {
      var props = resolveProps(node);
      props.__resolved = true;
      var inst = createMenunav(null, props, ctx, node);
      inst.el.__kuiMenunav = inst;
      return inst.el;
    },
    api: function (elm) {
      return elm && elm.__kuiMenunav ? elm.__kuiMenunav : {};
    }
  });

  /* ================= 静态入口（app-shell 用：KUI.menunav.create） ================= */

  KUI.menunav = {
    create: function (host, props, ctx) {
      var merged = normalizeProps(deepMerge(DEFAULTS, props || {}));
      merged.__resolved = true;
      var inst = createMenunav(host, merged, ctx, null);
      return inst;
    },
    defaults: DEFAULTS
  };

})(window.KUI);

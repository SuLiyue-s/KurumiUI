/*!
 * KurumiUI · shell · tabs.js
 * 子标签 + 主体 iframe 区（本项目最硬验收点）
 *
 * ★ 保活语义（契约 §8.3）：
 *   1. 每个 tab 创建时同时创建「固定 pane + 固定 <iframe>」，pane / iframe 一旦创建永不重建；
 *   2. 首次 activate 才给 iframe 设置 src；再次切换只切 hidden / .is-active 类，
 *      绝不改 src、绝不 reload、绝不 remove；
 *   3. 只有 close 才移除节点；
 *   4. 刷新是显式动作（refresh），重设 src 或调用 location.reload。
 *
 * 注册 type：tabs
 * 实例 API：open / close / closeOthers / closeAll / activate / refresh /
 *          setTitle / setIcon / setBadge / setDirty / updateUrl / exists /
 *          getActive / getTabs / list / count / back / forward / canBack / canForward /
 *          hasHistory / on / off / destroy
 * 事件：open / close / activate / refresh / dirty / overflow / reorder / action
 */
(function (KUI) {
  'use strict';

  if (!KUI) { KUI = window.KUI = window.KUI || {}; }

  var hasOwn = Object.prototype.hasOwnProperty;
  var slice = Array.prototype.slice;

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
    var box = el('span', cls || 'kui-tabs__icon');
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

  function off(target, type, fn, opts) {
    if (target && typeof target.removeEventListener === 'function') {
      target.removeEventListener(type, fn, opts || false);
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

  /**
   * 向指定 iframe 发 postMessage。
   * targetOrigin 固定用 '*'：本框架面向 file:// 与任意 host 部署，父页面无法预知子页面的 origin；
   * 父页面侧已严格校验 event.source === iframe.contentWindow，若部署环境同源可自行收紧 targetOrigin。
   */
  function post(frame, type, payload, requestId) {
    var win = frame && frame.contentWindow;
    if (!win) { return false; }
    safe(function () {
      win.postMessage({
        __kui: true,
        type: type,
        requestId: requestId || '',
        payload: payload || {}
      }, '*');
    });
    return true;
  }

  /* ================= 默认配置（契约 §8.3） ================= */

  var DEFAULTS = {
    closable: true,
    pinnedClosable: false,
    keepAlive: true,
    maxTabs: 24,
    contextMenu: true,
    drag: true,
    emptyText: '',
    home: null,
    initial: null,
    // sandbox 默认留空：不设置 sandbox 属性，保证 file:// 与需要存储/同源的业务页可用；
    // 需要隔离时显式传 sandbox 字符串（如 'allow-scripts allow-same-origin allow-forms'）
    sandbox: '',
    urlPrefix: '',
    showScrollButtons: true,
    height: '',
    on: null,
    onOpen: null,
    onClose: null,
    onActivate: null,
    onRefresh: null,
    onDirty: null
  };

  var FLAT_KEYS = ['closable', 'pinnedClosable', 'keepAlive', 'maxTabs', 'contextMenu', 'drag',
    'emptyText', 'home', 'initial', 'sandbox', 'urlPrefix', 'showScrollButtons', 'height',
    'onOpen', 'onClose', 'onActivate', 'onRefresh', 'onDirty'];

  function resolveProps(node) {
    var nodeProps = (node && node.props) || {};
    var merged = deepMerge(DEFAULTS, nodeProps);
    if (!node) { return merged; }
    var i, key;
    for (i = 0; i < FLAT_KEYS.length; i++) {
      key = FLAT_KEYS[i];
      if (node[key] !== undefined) { merged[key] = node[key]; }
    }
    return merged;
  }

  /* ================= 实例 ================= */

  function createTabs(host, rawProps, ctx, node) {
    var props = rawProps && rawProps.__resolved ? rawProps : deepMerge(DEFAULTS, rawProps || {});
    var handlers = {};
    var state = {
      map: {},           // id -> tab
      order: [],         // 标签顺序
      activeId: '',
      history: [],       // 历史栈（id）
      hIndex: -1,
      destroyed: false,
      seq: 0,
      dragId: '',
      leftVisible: false,
      rightVisible: false,
      contextEl: null,
      contextTabId: '',
      ro: null,
      themeKey: ''
    };

    var root, barEl, listEl, bodyEl, emptyEl, leftBtn, rightBtn;

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
      // 契约 §8.3 的 onOpen / onClose / onActivate 回调
      var camel = 'on' + name.charAt(0).toUpperCase() + name.slice(1);
      if (typeof props[camel] === 'function') {
        safe(function () { props[camel](payload); });
      }
      var nodeOn = node && node.on;
      if (nodeOn && typeof nodeOn[name] === 'function') {
        safe(function () { nodeOn[name](payload); });
      }
      if (ctx && typeof ctx.emit === 'function') {
        safe(function () { ctx.emit(name, payload); });
      }
      emitGlobal('tabs:' + name, payload);
    }

    /* ---------- 主题 ---------- */
    // 取当前主题快照：{ id, name, scheme, tokens }。
    // 注意：core/theme.js 并不存在 tokens() 方法（只有 currentTokens()/current()），
    // 旧实现调用 KUI.theme.tokens() 得到 undefined，导致发往 iframe 的 tokens 恒为空，
    // 表现为「切换主题后部分页面仍是原主题」。这里统一从 current() 的主题对象取 tokens/scheme。
    function currentTheme() {
      var theme = null;
      safe(function () {
        if (!KUI.theme) { return; }
        var id = '';
        var tokens = null;
        var scheme = '';
        var name = '';
        var cur = null;
        if (typeof KUI.theme.current === 'function') {
          cur = KUI.theme.current();
        } else if (typeof KUI.theme.current === 'string') {
          id = KUI.theme.current;
        }
        if (typeof cur === 'string') { id = cur; }
        else if (cur && typeof cur === 'object') {
          id = cur.id || '';
          name = cur.name || '';
          scheme = cur.scheme || '';
          if (cur.tokens && typeof cur.tokens === 'object') { tokens = cur.tokens; }
        }
        if (!tokens && typeof KUI.theme.currentTokens === 'function') {
          tokens = KUI.theme.currentTokens();
        }
        if (!tokens && KUI.theme.tokens && typeof KUI.theme.tokens === 'object') {
          tokens = KUI.theme.tokens;
        }
        theme = { id: id, name: name, scheme: scheme, tokens: tokens || {} };
      });
      return theme || { id: '', name: '', scheme: '', tokens: {} };
    }

    function themeKeyOf(theme) {
      return theme && theme.id ? theme.id : '';
    }

    /* ---------- 基础结构 ---------- */
    function build() {
      root = el('div', 'kui-tabs');
      root.setAttribute('data-kui-type', 'tabs');

      barEl = el('div', 'kui-tabs__bar');
      barEl.setAttribute('role', 'tablist');

      if (props.showScrollButtons) {
        leftBtn = scrollBtn('left', 'chevron-left', txt('tabs.scrollLeft', '向左滚动'));
        barEl.appendChild(leftBtn);
      }

      listEl = el('div', 'kui-tabs__list');
      barEl.appendChild(listEl);

      if (props.showScrollButtons) {
        rightBtn = scrollBtn('right', 'chevron-right', txt('tabs.scrollRight', '向右滚动'));
        barEl.appendChild(rightBtn);
      }

      bodyEl = el('div', 'kui-tabs__body');

      emptyEl = el('div', 'kui-tabs__empty');
      emptyEl.setAttribute('aria-hidden', 'true');
      var emptyIcon = el('span', 'kui-tabs__empty-icon');
      emptyIcon.innerHTML = iconHtml('grid');
      emptyEl.appendChild(emptyIcon);
      emptyEl.appendChild(elText('div', 'kui-tabs__empty-text',
        props.emptyText || txt('tabs.empty', '暂无打开的页面')));
      bodyEl.appendChild(emptyEl);

      root.appendChild(barEl);
      root.appendChild(bodyEl);

      if (props.height) { root.style.height = typeof props.height === 'number' ? props.height + 'px' : props.height; }
      if (host && typeof host.appendChild === 'function') { host.appendChild(root); }
    }

    function scrollBtn(dir, icon, title) {
      var btn = el('button', 'kui-tabs__scroll kui-tabs__scroll--' + dir);
      btn.type = 'button';
      btn.title = title;
      btn.setAttribute('aria-label', title);
      btn.innerHTML = iconHtml(icon);
      on(btn, 'click', function (ev) {
        if (ev && ev.preventDefault) { ev.preventDefault(); }
        scrollBy(dir === 'left' ? -160 : 160);
      });
      return btn;
    }

    /* ---------- 标签项 ---------- */
    function renderItem(tab) {
      var item = el('div', 'kui-tabs__item');
      item.setAttribute('role', 'tab');
      item.setAttribute('tabindex', '-1');
      item.setAttribute('aria-selected', 'false');
      item.setAttribute('data-tab-id', tab.id);
      if (tab.pinned) { item.classList.add('is-pinned'); }

      if (tab.icon) {
        item.appendChild(iconBox(tab.icon, 'kui-tabs__item-icon'));
      }
      if (tab.pinned) {
        var pin = el('span', 'kui-tabs__item-pin');
        pin.innerHTML = iconHtml('pin');
        pin.setAttribute('aria-hidden', 'true');
        item.appendChild(pin);
      }

      var titleEl = elText('span', 'kui-tabs__item-title', tab.title || '');
      item.appendChild(titleEl);
      tab.titleEl = titleEl;

      if (tab.badge !== undefined && tab.badge !== null && tab.badge !== '') {
        item.appendChild(elText('span', 'kui-tabs__item-badge', tab.badge));
      }

      var dirtyEl = el('span', 'kui-tabs__item-dirty');
      dirtyEl.setAttribute('aria-hidden', 'true');
      item.appendChild(dirtyEl);

      if (isClosable(tab)) {
        var closeBtn = el('button', 'kui-tabs__close');
        closeBtn.type = 'button';
        closeBtn.title = txt('tabs.close', '关闭');
        closeBtn.setAttribute('aria-label', closeBtn.title);
        closeBtn.innerHTML = iconHtml('close');
        on(closeBtn, 'click', function (ev) {
          if (ev && ev.stopPropagation) { ev.stopPropagation(); }
          if (ev && ev.preventDefault) { ev.preventDefault(); }
          requestClose(tab);
        });
        item.appendChild(closeBtn);
      }

      on(item, 'click', function () { activate(tab.id); });
      on(item, 'keydown', function (ev) {
        if (ev && (ev.key === 'Enter' || ev.key === ' ')) {
          if (ev.preventDefault) { ev.preventDefault(); }
          activate(tab.id);
        }
      });
      on(item, 'auxclick', function (ev) {
        if (ev && ev.button === 1) {
          if (ev.preventDefault) { ev.preventDefault(); }
          requestClose(tab);
        }
      });
      on(item, 'contextmenu', function (ev) {
        if (ev && ev.preventDefault) { ev.preventDefault(); }
        showContext(tab, ev);
      });
      bindDrag(item, tab);

      tab.itemEl = item;
      return item;
    }

    /* ---------- 面板 + iframe（创建后永不重建） ---------- */
    function createPane(tab) {
      var pane = el('div', 'kui-tabs__pane');
      pane.setAttribute('data-tab-id', tab.id);
      pane.hidden = true;

      var frame = el('iframe', 'kui-tabs__frame');
      frame.setAttribute('frameborder', '0');
      frame.setAttribute('title', tab.title || tab.id);
      frame.setAttribute('data-tab-id', tab.id);
      if (props.sandbox) { frame.setAttribute('sandbox', props.sandbox); }

      // 注意：这里不设置 src。首次 activate 时才设置（保活语义第 2 条）
      pane.appendChild(frame);
      bodyEl.appendChild(pane);

      tab.paneEl = pane;
      tab.frameEl = frame;
      return pane;
    }

    function isHttpPage() {
      return typeof window !== 'undefined' && window.location &&
        /^https?:$/i.test(window.location.protocol || '');
    }

    function buildSrc(tab) {
      var url = tab.url || '';
      if (!url) { return ''; }
      if (tab.query) {
        var qs = [];
        for (var key in tab.query) {
          if (hasOwn.call(tab.query, key)) {
            qs.push(encodeURIComponent(key) + '=' + encodeURIComponent(tab.query[key]));
          }
        }
        if (qs.length) { url += (url.indexOf('?') >= 0 ? '&' : '?') + qs.join('&'); }
      }
      if (props.urlPrefix && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) {
        url = props.urlPrefix + url;
      }
      // ★ 版本戳（缓存穿透）：http(s) 环境下给子页面 URL 追加 kui_v=<KUI.version>。
      // 目的：长会话 / 浏览器缓存命中旧版 iframe 文档时，旧页面可能缺少新脚本
      // （典型症状：出现「未注册的元素类型 xxx」占位）。带版本号后每次发布必换 URL。
      if (isHttpPage() && KUI.version && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) {
        url += (url.indexOf('?') >= 0 ? '&' : '?') + 'kui_v=' + encodeURIComponent(KUI.version);
      }
      return url;
    }

    /* ---------- 空状态 / 活动态 ---------- */
    function updateEmptyState() {
      if (!emptyEl) { return; }
      var empty = state.order.length === 0;
      emptyEl.hidden = !empty;
      if (root.classList) {
        if (empty) { root.classList.add('is-empty'); }
        else { root.classList.remove('is-empty'); }
      }
    }

    function updateActiveClasses() {
      var i;
      for (i = 0; i < state.order.length; i++) {
        var tab = state.map[state.order[i]];
        if (!tab) { continue; }
        var active = tab.id === state.activeId;
        if (tab.itemEl && tab.itemEl.classList) {
          if (active) { tab.itemEl.classList.add('is-active'); }
          else { tab.itemEl.classList.remove('is-active'); }
          tab.itemEl.setAttribute('aria-selected', active ? 'true' : 'false');
          tab.itemEl.setAttribute('tabindex', active ? '0' : '-1');
        }
        if (tab.paneEl) {
          tab.paneEl.hidden = !active;
          if (active) { tab.paneEl.classList.add('is-active'); }
          else { tab.paneEl.classList.remove('is-active'); }
        }
      }
    }

    function publicTab(tab) {
      if (!tab) { return null; }
      return {
        id: tab.id,
        title: tab.title,
        url: tab.url,
        icon: tab.icon,
        pinned: tab.pinned,
        closable: isClosable(tab),
        badge: tab.badge,
        dirty: tab.dirty,
        params: tab.params,
        active: tab.id === state.activeId,
        loaded: tab.loaded
      };
    }

    /* ---------- 打开 ---------- */
    function uid() {
      state.seq++;
      return 'tab-' + state.seq + '-' + Date.now().toString(36);
    }

    function normalizeTab(input) {
      var t = input || {};
      var id = t.id || t.tabId || '';
      if (!id) { id = uid(); }
      return {
        id: String(id),
        title: t.title || t.label || t.name || t.url || '',
        url: t.url || t.src || '',
        icon: t.icon || '',
        pinned: !!t.pinned,
        closable: t.closable !== undefined ? !!t.closable : undefined,
        badge: t.badge,
        params: t.params || null,
        query: t.query || null,
        dirty: !!t.dirty,
        loaded: false,
        inited: false,
        closing: false,
        timer: null,
        itemEl: null,
        paneEl: null,
        frameEl: null,
        titleEl: null
      };
    }

    function open(tabInput) {
      if (!tabInput || state.destroyed) { return null; }
      var tab = normalizeTab(tabInput);
      var existing = state.map[tab.id];
      if (existing) {
        if (tabInput.title) { setTitle(tab.id, tabInput.title); }
        if (tabInput.icon) { setIcon(tab.id, tabInput.icon); }
        if (tabInput.url) { existing.url = tabInput.url; }
        if (tabInput.params) { existing.params = tabInput.params; }
        activate(tab.id);
        return tab.id;
      }
      if (state.order.length >= props.maxTabs) {
        var msg = txt('tabs.maxTabs', '最多只能打开 {max} 个标签', { max: props.maxTabs });
        safe(function () {
          if (KUI.toast && typeof KUI.toast.warning === 'function') { KUI.toast.warning(msg); }
        });
        return null;
      }
      renderItem(tab);
      createPane(tab);
      state.map[tab.id] = tab;
      state.order.push(tab.id);
      if (listEl && tab.itemEl) { listEl.appendChild(tab.itemEl); }
      updateEmptyState();
      fire('open', { tab: publicTab(tab) });
      activate(tab.id);
      updateScroll();
      return tab.id;
    }

    /* ---------- 激活 ---------- */
    function ensureSrc(tab) {
      if (!tab || tab.loaded) { return; }
      var src = buildSrc(tab);
      if (!src) { return; }
      tab.loaded = true;
      // 保活语义：src 只在首次激活时设置一次
      safe(function () { tab.frameEl.src = src; });
    }

    function pushHistory(id) {
      if (state.hIndex >= 0 && state.history[state.hIndex] === id) { return; }
      if (state.hIndex < state.history.length - 1) {
        state.history = state.history.slice(0, state.hIndex + 1);
      }
      state.history.push(id);
      if (state.history.length > 100) { state.history.shift(); }
      state.hIndex = state.history.length - 1;
    }

    function removeFromHistory(id) {
      var next = [];
      var i;
      for (i = 0; i < state.history.length; i++) {
        if (state.history[i] !== id) { next.push(state.history[i]); }
      }
      var removedBefore = 0;
      for (i = 0; i < state.history.length && i <= state.hIndex; i++) {
        if (state.history[i] === id) { removedBefore++; }
      }
      state.history = next;
      state.hIndex = Math.max(-1, Math.min(state.hIndex - removedBefore, next.length - 1));
    }

    function activate(id, options) {
      options = options || {};
      if (state.destroyed) { return api; }
      var tab = state.map[id];
      if (!tab) { return api; }
      var prev = state.map[state.activeId] || null;

      state.activeId = tab.id;
      updateActiveClasses();
      ensureSrc(tab);
      scrollIntoView(tab.itemEl);
      if (!options.fromHistory) { pushHistory(tab.id); }

      if (tab.loaded && tab.inited) {
        post(tab.frameEl, 'tab:activate', { tabId: tab.id });
      }

      var payload = {
        tab: publicTab(tab),
        previous: prev ? publicTab(prev) : null,
        fromHistory: !!options.fromHistory
      };
      if (options.silent) {
        // 静默激活（批量/恢复场景）不派发 activate
      } else {
        fire('activate', payload);
      }
      updateScroll();
      return api;
    }

    /* ---------- 滚动 ---------- */
    function updateScroll() {
      if (!listEl) { return; }
      var max = listEl.scrollWidth - listEl.clientWidth;
      state.leftVisible = listEl.scrollLeft > 1;
      state.rightVisible = max > 1 && listEl.scrollLeft < max - 1;
      if (leftBtn && leftBtn.classList) {
        if (state.leftVisible) { leftBtn.classList.add('is-visible'); }
        else { leftBtn.classList.remove('is-visible'); }
      }
      if (rightBtn && rightBtn.classList) {
        if (state.rightVisible) { rightBtn.classList.add('is-visible'); }
        else { rightBtn.classList.remove('is-visible'); }
      }
      fire('overflow', { left: state.leftVisible, right: state.rightVisible });
    }

    function scrollBy(delta) {
      if (!listEl) { return; }
      var target = listEl.scrollLeft + delta;
      if (typeof listEl.scrollTo === 'function') {
        safe(function () { listEl.scrollTo({ left: target, behavior: 'smooth' }); });
      }
      listEl.scrollLeft = target;
      window.setTimeout(updateScroll, 220);
    }

    function scrollIntoView(itemEl) {
      if (!itemEl || !listEl) { return; }
      var left = itemEl.offsetLeft;
      var right = left + itemEl.offsetWidth;
      var viewLeft = listEl.scrollLeft;
      var viewRight = viewLeft + listEl.clientWidth;
      if (left < viewLeft) {
        listEl.scrollLeft = Math.max(0, left - 8);
      } else if (right > viewRight) {
        listEl.scrollLeft = right - listEl.clientWidth + 8;
      }
      updateScroll();
    }

    /* ---------- 关闭 ---------- */
    function isClosable(tab) {
      if (!tab) { return false; }
      var closable = tab.closable !== undefined ? !!tab.closable : props.closable !== false;
      if (tab.pinned && !props.pinnedClosable) { closable = false; }
      return closable;
    }

    function removeTab(tab) {
      if (!tab) { return; }
      if (tab.timer) { clearTimeout(tab.timer); tab.timer = null; }
      // 关闭才移除节点（保活语义第 3 条）
      if (tab.itemEl && tab.itemEl.parentNode) { tab.itemEl.parentNode.removeChild(tab.itemEl); }
      if (tab.paneEl && tab.paneEl.parentNode) { tab.paneEl.parentNode.removeChild(tab.paneEl); }
      delete state.map[tab.id];
      var idx = state.order.indexOf(tab.id);
      if (idx >= 0) { state.order.splice(idx, 1); }
      removeFromHistory(tab.id);
      if (state.activeId === tab.id) { state.activeId = ''; }
      fire('close', { tab: publicTab(tab) });
      updateEmptyState();
      updateScroll();
    }

    function settleActive(preferredId) {
      if (state.activeId && state.map[state.activeId]) { return; }
      var nextId = preferredId && state.map[preferredId] ? preferredId : (state.order.length ? state.order[0] : '');
      if (nextId) {
        activate(nextId, { silent: false });
      } else {
        state.activeId = '';
        updateActiveClasses();
        updateEmptyState();
      }
    }

    function forceClose(tab) {
      if (!tab || !state.map[tab.id]) { return; }
      var idx = state.order.indexOf(tab.id);
      removeTab(tab);
      settleActive(state.order[Math.min(idx, state.order.length - 1)]);
    }

    /** API close：显式关闭。默认强制关闭；传 {confirmDirty:true} 时脏标签走确认流程 */
    function close(id, options) {
      var tab = state.map[id];
      if (!tab) { return false; }
      if (options && options.confirmDirty && tab.dirty) {
        requestClose(tab);
        return true;
      }
      forceClose(tab);
      return true;
    }

    function closeOthers(id) {
      var keepId = id || state.activeId;
      var ids = state.order.slice();
      var i, tab;
      for (i = 0; i < ids.length; i++) {
        if (ids[i] === keepId) { continue; }
        tab = state.map[ids[i]];
        if (!tab) { continue; }
        // pinned 标签保留
        if (tab.pinned && !props.pinnedClosable) { continue; }
        forceClose(tab);
      }
      if (keepId && state.map[keepId]) { activate(keepId); }
      return api;
    }

    function closeAll() {
      var ids = state.order.slice();
      var i, tab;
      for (i = 0; i < ids.length; i++) {
        tab = state.map[ids[i]];
        if (!tab) { continue; }
        if (tab.pinned && !props.pinnedClosable) { continue; }
        forceClose(tab);
      }
      settleActive('');
      return api;
    }

    /* ---------- 脏标签关闭确认 ---------- */
    function confirmClose(tab, cb) {
      var message = txt('tabs.dirtyMessage', '「{title}」尚有未保存的修改，确定关闭吗？', { title: tab.title || tab.id });
      var title = txt('tabs.dirtyTitle', '关闭确认');
      if (KUI.dialog && typeof KUI.dialog.confirm === 'function') {
        var p = KUI.dialog.confirm({ title: title, message: message, type: 'warning' });
        if (p && typeof p.then === 'function') {
          p.then(function (ok) { cb(!!ok); }, function () { cb(false); });
          return;
        }
        cb(!!p);
        return;
      }
      // 兜底：原生 confirm
      var ok = false;
      safe(function () { ok = window.confirm(message); });
      cb(!!ok);
    }

    function requestClose(tab) {
      if (!tab || state.destroyed) { return; }
      if (!isClosable(tab)) {
        var msg = txt('tabs.notClosable', '该标签不可关闭');
        safe(function () {
          if (KUI.toast && typeof KUI.toast.info === 'function') { KUI.toast.info(msg); }
        });
        return;
      }
      if (tab.closing) { return; }
      tab.closing = true;

      var responded = false;
      var finish = function (allow) {
        if (responded) { return; }
        responded = true;
        if (tab.timer) { clearTimeout(tab.timer); tab.timer = null; }
        if (!allow) { tab.closing = false; return; }
        if (tab.dirty) {
          confirmClose(tab, function (ok) {
            tab.closing = false;
            if (ok) { forceClose(tab); }
          });
        } else {
          tab.closing = false;
          forceClose(tab);
        }
      };

      // 先通知业务页（tab:before-close），260ms 无响应则走默认策略
      tab.timer = window.setTimeout(function () { finish(true); }, 260);
      if (tab.loaded && tab.frameEl) {
        post(tab.frameEl, 'tab:before-close', {});
      } else {
        finish(true);
      }
      tab.__closeFinish = finish;
    }

    function handleCloseResult(tab, payload) {
      if (!tab || !tab.__closeFinish) { return; }
      var ok = payload && payload.ok !== false;
      tab.__closeFinish(ok);
      tab.__closeFinish = null;
    }

    /* ---------- 刷新 ---------- */
    var refreshLock = {};
    function refresh(id, options) {
      options = options || {};
      var tab = state.map[id || state.activeId];
      if (!tab) { return false; }
      if (refreshLock[tab.id] && Date.now() - refreshLock[tab.id] < 200) { return true; }
      refreshLock[tab.id] = Date.now();
      if (options.notifyOnly) {
        // 仅通知业务页自行刷新，不重载 iframe
        post(tab.frameEl, 'tab:refresh', { tabId: tab.id });
      } else if (tab.frameEl) {
        if (tab.loaded && tab.url) {
          // 显式刷新：重设 src（保活语义只禁止「切换」时改 src）
          var src = buildSrc(tab);
          tab.loaded = false;
          safe(function () { tab.frameEl.src = src; });
          tab.loaded = true;
          tab.inited = false;
        } else {
          ensureSrc(tab);
        }
      }
      fire('refresh', { tab: publicTab(tab) });
      return true;
    }

    /* ---------- 元数据 ---------- */
    function setTitle(id, title) {
      var tab = state.map[id];
      if (!tab) { return api; }
      tab.title = title === undefined || title === null ? '' : String(title);
      if (tab.titleEl) { tab.titleEl.textContent = tab.title; }
      if (tab.frameEl) { tab.frameEl.setAttribute('title', tab.title); }
      return api;
    }

    function setIcon(id, icon) {
      var tab = state.map[id];
      if (!tab) { return api; }
      tab.icon = icon || '';
      if (tab.itemEl && tab.itemEl.querySelector) {
        var old = tab.itemEl.querySelector('.kui-tabs__item-icon');
        if (old && old.parentNode) { old.parentNode.removeChild(old); }
        if (tab.icon) {
          var box = iconBox(tab.icon, 'kui-tabs__item-icon');
          tab.itemEl.insertBefore(box, tab.itemEl.firstChild);
        }
      }
      return api;
    }

    function setBadge(id, value) {
      var tab = state.map[id];
      if (!tab) { return api; }
      tab.badge = value;
      if (!tab.itemEl) { return api; }
      var badge = tab.itemEl.querySelector ? tab.itemEl.querySelector('.kui-tabs__item-badge') : null;
      var empty = value === undefined || value === null || value === '';
      if (!badge) {
        if (empty) { return api; }
        badge = el('span', 'kui-tabs__item-badge');
        var dirtyEl = tab.itemEl.querySelector ? tab.itemEl.querySelector('.kui-tabs__item-dirty') : null;
        if (dirtyEl && tab.itemEl.insertBefore) { tab.itemEl.insertBefore(badge, dirtyEl); }
        else { tab.itemEl.appendChild(badge); }
      }
      badge.textContent = empty ? '' : String(value);
      if (empty) { badge.classList.add('is-empty'); }
      else { badge.classList.remove('is-empty'); }
      return api;
    }

    function setDirty(id, dirty) {
      var tab = state.map[id];
      if (!tab) { return api; }
      tab.dirty = !!dirty;
      if (tab.itemEl && tab.itemEl.classList) {
        if (tab.dirty) { tab.itemEl.classList.add('is-dirty'); }
        else { tab.itemEl.classList.remove('is-dirty'); }
      }
      fire('dirty', { tab: publicTab(tab), dirty: tab.dirty });
      return api;
    }

    function updateUrl(id, url) {
      var tab = state.map[id];
      if (!tab) { return api; }
      tab.url = url || '';
      tab.loaded = false;
      tab.inited = false;
      if (tab.id === state.activeId) { ensureSrc(tab); }
      return api;
    }

    /* ---------- 查询 ---------- */
    function getActive() { return state.activeId || ''; }
    function count() { return state.order.length; }
    function exists(id) { return !!state.map[id]; }
    function list() {
      var out = [];
      var i;
      for (i = 0; i < state.order.length; i++) {
        var tab = state.map[state.order[i]];
        if (tab) { out.push(publicTab(tab)); }
      }
      return out;
    }

    /* ---------- 历史 ---------- */
    function back() {
      if (state.hIndex <= 0) { return false; }
      state.hIndex--;
      var id = state.history[state.hIndex];
      if (id && state.map[id]) { activate(id, { fromHistory: true }); }
      return true;
    }

    function forward() {
      if (state.hIndex < 0 || state.hIndex >= state.history.length - 1) { return false; }
      state.hIndex++;
      var id = state.history[state.hIndex];
      if (id && state.map[id]) { activate(id, { fromHistory: true }); }
      return true;
    }

    function canBack() { return state.hIndex > 0; }
    function canForward() { return state.hIndex >= 0 && state.hIndex < state.history.length - 1; }
    function hasHistory() { return state.history.length > 1; }

    /* ---------- 右键菜单 ---------- */
    function showContext(tab, ev) {
      if (!props.contextMenu || !tab) { return; }
      hideContext();
      var x = ev && ev.clientX ? ev.clientX : 0;
      var y = ev && ev.clientY ? ev.clientY : 0;

      var menu = el('div', 'kui-tabs__context');
      menu.setAttribute('role', 'menu');
      menu.setAttribute('data-tab-id', tab.id);

      var items = [
        { id: 'tab.refresh', label: txt('tabs.refresh', '刷新'), icon: 'refresh', disabled: false },
        { id: 'tab.close', label: txt('tabs.close', '关闭'), icon: 'close', disabled: !isClosable(tab) },
        { type: 'divider' },
        { id: 'tab.closeOthers', label: txt('tabs.closeOthers', '关闭其他'), icon: 'grid', disabled: state.order.length <= 1 },
        { id: 'tab.closeAll', label: txt('tabs.closeAll', '关闭全部'), icon: 'trash', disabled: state.order.length === 0 }
      ];

      var i;
      for (i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.type === 'divider') {
          menu.appendChild(el('div', 'kui-tabs__context-divider'));
          continue;
        }
        var row = el('div', 'kui-tabs__context-item');
        row.setAttribute('role', 'menuitem');
        row.setAttribute('tabindex', '0');
        row.setAttribute('data-action', item.id);
        if (item.disabled) { row.classList.add('is-disabled'); }
        var iconWrap = el('span', 'kui-tabs__context-icon');
        iconWrap.innerHTML = iconHtml(item.icon);
        row.appendChild(iconWrap);
        row.appendChild(elText('span', 'kui-tabs__context-label', item.label));
        on(row, 'click', (function (actId, tabId) {
          return function (ev2) {
            if (ev2 && ev2.stopPropagation) { ev2.stopPropagation(); }
            runContextAction(actId, tabId);
          };
        })(item.id, tab.id));
        on(row, 'keydown', (function (actId, tabId) {
          return function (ev3) {
            if (ev3 && (ev3.key === 'Enter' || ev3.key === ' ')) {
              if (ev3.preventDefault) { ev3.preventDefault(); }
              runContextAction(actId, tabId);
            }
          };
        })(item.id, tab.id));
        menu.appendChild(row);
      }

      menu.style.position = 'fixed';
      menu.style.left = x + 'px';
      menu.style.top = y + 'px';
      menu.style.zIndex = '1080';
      document.body.appendChild(menu);

      // 边界修正
      var rect = menu.getBoundingClientRect ? menu.getBoundingClientRect() : null;
      if (rect) {
        var vw = window.innerWidth || 0;
        var vh = window.innerHeight || 0;
        if (rect.right > vw - 4) { menu.style.left = Math.max(4, x - rect.width) + 'px'; }
        if (rect.bottom > vh - 4) { menu.style.top = Math.max(4, y - rect.height) + 'px'; }
      }

      state.contextEl = menu;
      state.contextTabId = tab.id;
      fire('contextmenu', { tab: publicTab(tab), x: x, y: y, menu: menu });
    }

    function hideContext() {
      if (state.contextEl && state.contextEl.parentNode) {
        state.contextEl.parentNode.removeChild(state.contextEl);
      }
      state.contextEl = null;
      state.contextTabId = '';
    }

    function runContextAction(actionId, tabId) {
      var tab = state.map[tabId];
      var params = { id: tabId };
      // 右键菜单的关闭/刷新必须走组件内部流程（脏标签确认、保活语义），
      // 同时通过事件把动作暴露给外部（ctx.action 也可作为外部入口调用 tab.* 动作）
      if (actionId === 'tab.refresh') {
        refresh(tabId);
      } else if (actionId === 'tab.close') {
        if (tab) { requestClose(tab); }
      } else if (actionId === 'tab.closeOthers') {
        closeOthers(tabId);
      } else if (actionId === 'tab.closeAll') {
        closeAll();
      }
      hideContext();
      var payload = { action: actionId, params: params, tabId: tabId };
      fire('action', payload);
      emitGlobal('tabs:action', payload);
    }

    /* ---------- 拖拽排序（只移动标签 DOM，不触碰 pane/iframe） ---------- */
    function bindDrag(itemEl, tab) {
      if (!props.drag) { return; }
      itemEl.setAttribute('draggable', 'true');
      on(itemEl, 'dragstart', function (ev) {
        var target = ev && ev.target;
        if (target && target.closest && target.closest('.kui-tabs__close')) {
          if (ev.preventDefault) { ev.preventDefault(); }
          return;
        }
        state.dragId = tab.id;
        itemEl.classList.add('is-dragging');
        if (ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = 'move';
          safe(function () { ev.dataTransfer.setData('text/plain', tab.id); });
        }
      });
      on(itemEl, 'dragover', function (ev) {
        if (!state.dragId || state.dragId === tab.id) { return; }
        if (ev.preventDefault) { ev.preventDefault(); }
        var dragTab = state.map[state.dragId];
        if (!dragTab || !dragTab.itemEl || !listEl) { return; }
        var rect = itemEl.getBoundingClientRect ? itemEl.getBoundingClientRect() : null;
        var before = true;
        if (rect) { before = (ev.clientX - rect.left) < rect.width / 2; }
        if (before) { listEl.insertBefore(dragTab.itemEl, itemEl); }
        else { listEl.insertBefore(dragTab.itemEl, itemEl.nextSibling); }
        syncOrderFromDom();
      });
      on(itemEl, 'dragend', function () {
        state.dragId = '';
        if (itemEl.classList) { itemEl.classList.remove('is-dragging'); }
        updateScroll();
      });
      on(itemEl, 'drop', function (ev) {
        if (ev && ev.preventDefault) { ev.preventDefault(); }
      });
    }

    function syncOrderFromDom() {
      if (!listEl) { return; }
      var next = [];
      var children = listEl.childNodes;
      var i;
      for (i = 0; i < children.length; i++) {
        var id = children[i].getAttribute ? children[i].getAttribute('data-tab-id') : '';
        if (id && state.map[id]) { next.push(id); }
      }
      if (next.length === state.order.length) {
        state.order = next;
        fire('reorder', { order: next.slice() });
      }
    }

    /* ---------- iframe 消息（严格校验 source） ---------- */
    function findTabByWindow(win) {
      if (!win) { return null; }
      var i;
      for (i = 0; i < state.order.length; i++) {
        var tab = state.map[state.order[i]];
        if (tab && tab.frameEl && tab.frameEl.contentWindow === win) { return tab; }
      }
      return null;
    }

    function sendInit(tab) {
      if (!tab) { return; }
      post(tab.frameEl, 'tab:init', {
        tabId: tab.id,
        title: tab.title,
        params: tab.params || {},
        theme: currentTheme(),
        app: { title: txt('app.title', 'KurumiUI') },
        // 版本自愈：子页面若发现自己与父级版本不一致（旧缓存文档），会带新版本号自动刷新一次
        parentVersion: KUI.version || '',
        src: buildSrc(tab)
      });
      tab.inited = true;
    }

    function handleFrameDialog(tab, msg) {
      var payload = msg.payload || {};
      var method = payload.method || 'alert';
      var config = payload.config || {};
      var requestId = msg.requestId || '';
      var dialog = KUI.dialog;
      var done = function (value) {
        // requestId 必须放消息信封（kui-frame.js 用 data.requestId 做 Promise 配对）
        post(tab.frameEl, 'frame:dialog-result', {
          value: value === undefined ? null : value
        }, requestId);
      };
      if (!dialog || typeof dialog[method] !== 'function') {
        // 兜底：原生对话框
        var nativeValue = null;
        safe(function () {
          if (method === 'alert') { window.alert(config.message || config.title || ''); }
          else if (method === 'confirm') { nativeValue = window.confirm(config.message || config.title || ''); }
          else if (method === 'prompt') { nativeValue = window.prompt(config.message || config.title || '', config.defaultValue || ''); }
        });
        done(nativeValue);
        return;
      }
      var result;
      try {
        result = dialog[method](config);
      } catch (e) {
        done(null);
        return;
      }
      if (result && typeof result.then === 'function') {
        result.then(function (value) { done(value); }, function () { done(null); });
      } else {
        done(result);
      }
    }

    function handleNavigate(payload) {
      if (!payload) { return; }
      var tab = payload.tab || payload;
      if (tab && (tab.url || tab.id)) { open(tab); }
    }

    /* iframe 内请求切换全局主题：父级应用后由 KUI.theme 广播回所有 iframe（整壳 + 标签同步） */
    function handleFrameTheme(tab, payload) {
      payload = payload || {};
      var id = payload.id || (payload.theme && payload.theme.id) || '';
      if (!id) { return; }
      var ok = false;
      if (KUI.theme && typeof KUI.theme.apply === 'function') {
        ok = safe(function () {
          var has = typeof KUI.theme.has === 'function' ? KUI.theme.has(id) : true;
          if (!has) {
            if (payload.tokens && typeof KUI.theme.register === 'function') {
              KUI.theme.register({
                id: id,
                name: payload.name || id,
                scheme: payload.scheme || '',
                tokens: payload.tokens,
                art: payload.art || null
              });
            } else {
              return false;
            }
          }
          KUI.theme.apply(id, { persist: true, broadcast: true });
          return true;
        }, false);
      }
      if (ok && KUI.toast && typeof KUI.toast.show === 'function' && props.themeToast !== false) {
        safe(function () {
          KUI.toast.show({ text: txt('tabs.themeChanged', '主题已切换：{name}', { name: payload.name || id }), type: 'success', duration: 1600 });
        });
      }
      fire('theme', { tab: publicTab(tab), id: id, applied: !!ok });
      return ok;
    }

    /* iframe 加载后主动索取当前主题 */
    function pushThemeTo(tab) {
      if (!tab || !tab.frameEl) { return; }
      var theme = currentTheme();
      safe(function () {
        if (tab.frameEl.contentWindow) {
          tab.frameEl.contentWindow.postMessage({ __kui: true, type: 'theme:apply', payload: theme }, '*');
        }
      });
    }

    function onMessage(event) {
      var data = event && event.data;
      if (!data || data.__kui !== true) { return; }
      // 严格校验：event.source 必须正好是本实例某个 iframe 的 contentWindow
      var tab = findTabByWindow(event.source);
      if (!tab || !tab.frameEl || event.source !== tab.frameEl.contentWindow) { return; }
      var type = data.type || '';
      var payload = data.payload || {};
      switch (type) {
        case 'frame:ready':
          sendInit(tab);
          break;
        case 'frame:title':
          if (payload.title !== undefined) { setTitle(tab.id, payload.title); }
          break;
        case 'frame:dirty':
          setDirty(tab.id, !!payload.dirty);
          break;
        case 'frame:toast':
          if (KUI.toast && typeof KUI.toast.show === 'function') {
            safe(function () { KUI.toast.show(payload); });
          }
          break;
        case 'frame:dialog':
          handleFrameDialog(tab, data);
          break;
        case 'frame:close':
          requestClose(tab);
          break;
        case 'frame:height':
          fire('height', { tab: publicTab(tab), height: payload.height });
          break;
        case 'frame:navigate':
          handleNavigate(payload);
          break;
        case 'frame:theme':
          handleFrameTheme(tab, payload);
          break;
        case 'frame:theme-request':
          pushThemeTo(tab);
          break;
        case 'tab:close-result':
          handleCloseResult(tab, payload);
          break;
        default:
          break;
      }
    }

    /* ---------- 全局监听 ---------- */
    var globalOffs = [];

    function bindGlobal(name, fn) {
      var offFn = null;
      var bus = KUI.bus;
      if (bus && typeof bus.on === 'function') {
        offFn = safe(function () { return bus.on(name, fn); }, null);
      } else if (KUI.events && typeof KUI.events.on === 'function') {
        offFn = safe(function () { return KUI.events.on(name, fn); }, null);
      }
      globalOffs.push(function () {
        if (typeof offFn === 'function') { safe(function () { offFn(); }); }
        else if (bus && typeof bus.off === 'function') { safe(function () { bus.off(name, fn); }); }
        else if (KUI.events && typeof KUI.events.off === 'function') { safe(function () { KUI.events.off(name, fn); }); }
      });
    }

    function broadcastTheme(payload) {
      var theme = payload && payload.tokens ? payload : currentTheme();
      var key = themeKeyOf(theme);
      if (key && key === state.themeKey && !payload) { return; }
      state.themeKey = key;
      var i;
      for (i = 0; i < state.order.length; i++) {
        var tab = state.map[state.order[i]];
        if (tab && tab.loaded) {
          // 必须带完整 tokens（旧实现因 currentTheme() 取错 API 恒为空对象），
          // 同时带 scheme 供业务页同步 data-kui-scheme / light-dark 细节。
          post(tab.frameEl, 'theme:change', {
            id: theme.id || '',
            name: theme.name || '',
            scheme: theme.scheme || '',
            tokens: theme.tokens || {}
          });
        }
      }
    }

    function bindGlobals() {
      bindGlobal('theme:change', function (payload) { broadcastTheme(payload); });
      on(window, 'message', onMessage);
      on(document, 'mousedown', function (ev) {
        if (!state.contextEl) { return; }
        var target = ev && ev.target;
        var inside = false;
        safe(function () {
          inside = !!(target && state.contextEl.contains && state.contextEl.contains(target));
        });
        if (!inside) { hideContext(); }
      }, true);
      on(document, 'keydown', function (ev) {
        if (state.contextEl && ev && ev.key === 'Escape') { hideContext(); }
      });
      // v1.3.0：点击到 iframe 内部时父页收不到 mousedown，右键菜单需要靠 focusin 关闭
      on(document, 'focusin', function (ev) {
        if (!state.contextEl) { return; }
        var tag = safe(function () { return String((ev && ev.target && ev.target.tagName) || '').toUpperCase(); }, '');
        if (tag === 'IFRAME') { hideContext(); }
      }, true);
      // v1.3.0：窗口失焦（点到父级 UI / 切到其它 iframe）时关闭右键菜单
      on(window, 'blur', function () { if (state.contextEl) { hideContext(); } });
      on(window, 'resize', function () { updateScroll(); });
      if (listEl && typeof ResizeObserver === 'function') {
        safe(function () {
          state.ro = new ResizeObserver(function () { updateScroll(); });
          state.ro.observe(listEl);
        });
      }
      if (listEl) {
        on(listEl, 'scroll', function () { updateScroll(); });
        on(listEl, 'wheel', function (ev) {
          if (!ev) { return; }
          // 垂直滚轮转横向滚动（标签栏常见交互）
          if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX)) {
            listEl.scrollLeft += ev.deltaY;
            if (ev.preventDefault) { ev.preventDefault(); }
          }
        }, { passive: false });
      }
    }

    /* ---------- 初始标签 ---------- */
    function mountInitial() {
      if (props.home) {
        var home = typeof props.home === 'string' ? { url: props.home } : props.home;
        var homeTab = deepMerge({
          id: 'home',
          title: txt('tabs.home', '首页'),
          icon: 'home',
          pinned: true
        }, home || {});
        open(homeTab);
      }
      if (props.initial) {
        var initials = Object.prototype.toString.call(props.initial) === '[object Array]'
          ? props.initial : [props.initial];
        var i;
        for (i = 0; i < initials.length; i++) { open(initials[i]); }
      }
      updateEmptyState();
      updateScroll();
    }

    /* ---------- 对外 API ---------- */
    var api = {
      node: node,
      ctx: ctx,
      type: 'tabs',
      props: props,

      on: function (name, fn) {
        if (typeof fn === 'function') {
          if (!handlers[name]) { handlers[name] = []; }
          handlers[name].push(fn);
        }
        return api;
      },
      off: function (name, fn) {
        var list2 = handlers[name];
        if (!list2) { return api; }
        if (!fn) { handlers[name] = []; return api; }
        for (var i = list2.length - 1; i >= 0; i--) {
          if (list2[i] === fn) { list2.splice(i, 1); }
        }
        return api;
      },
      emit: function (name, payload) { fire(name, payload); return api; },

      open: open,
      close: close,
      closeOthers: closeOthers,
      closeAll: closeAll,
      activate: activate,
      refresh: refresh,
      requestClose: requestClose,

      setTitle: setTitle,
      setIcon: setIcon,
      setBadge: setBadge,
      setDirty: setDirty,
      updateUrl: updateUrl,

      getActive: getActive,
      getTabs: list,
      list: list,
      count: count,
      exists: exists,

      back: back,
      forward: forward,
      canBack: canBack,
      canForward: canForward,
      hasHistory: hasHistory,

      scrollIntoView: function () { scrollIntoView(state.map[state.activeId] && state.map[state.activeId].itemEl); return api; },

      destroy: function () {
        if (state.destroyed) { return; }
        state.destroyed = true;
        var i;
        for (i = 0; i < globalOffs.length; i++) { safe(globalOffs[i]); }
        globalOffs = [];
        if (state.ro) { safe(function () { state.ro.disconnect(); }); state.ro = null; }
        off(window, 'message', onMessage);
        hideContext();
        // 清理所有 pane / item
        for (i = 0; i < state.order.length; i++) {
          var tab = state.map[state.order[i]];
          if (!tab) { continue; }
          if (tab.timer) { clearTimeout(tab.timer); }
          if (tab.itemEl && tab.itemEl.parentNode) { tab.itemEl.parentNode.removeChild(tab.itemEl); }
          if (tab.paneEl && tab.paneEl.parentNode) { tab.paneEl.parentNode.removeChild(tab.paneEl); }
        }
        state.map = {};
        state.order = [];
        state.history = [];
        state.hIndex = -1;
        state.activeId = '';
        handlers = {};
        if (root && root.parentNode) { root.parentNode.removeChild(root); }
        emitGlobal('tabs:destroy', { el: root });
      }
    };

    build();
    api.el = root;
    bindGlobals();
    mountInitial();
    fire('ready', { el: root });

    return api;
  }

  /* ================= 组件注册（契约 §6） ================= */

  register('tabs', {
    category: 'shell',
    defaults: DEFAULTS,
    render: function (node, ctx) {
      var props = resolveProps(node);
      props.__resolved = true;
      var inst = createTabs(null, props, ctx, node);
      inst.el.__kuiTabs = inst;
      currentInstance = inst;
      return inst.el;
    },
    api: function (elm) {
      return elm && elm.__kuiTabs ? elm.__kuiTabs : {};
    }
  });

  /* ================= 静态入口（app-shell / core 动作用：KUI.tabs.*） ================= */

  var currentInstance = null;

  KUI.tabs = {
    defaults: DEFAULTS,
    create: function (host, props, ctx) {
      var merged = deepMerge(DEFAULTS, props || {});
      merged.__resolved = true;
      var inst = createTabs(host, merged, ctx, null);
      currentInstance = inst;
      return inst;
    },
    get: function () { return currentInstance; }
  };

  var DELEGATED = ['open', 'close', 'closeOthers', 'closeAll', 'activate', 'refresh',
    'requestClose', 'setTitle', 'setIcon', 'setBadge', 'setDirty', 'updateUrl',
    'getActive', 'getTabs', 'list', 'count', 'exists',
    'back', 'forward', 'canBack', 'canForward', 'hasHistory', 'destroy'];

  function delegate(name) {
    return function () {
      var inst = currentInstance;
      if (!inst || typeof inst[name] !== 'function') { return undefined; }
      return inst[name].apply(inst, slice.call(arguments));
    };
  }

  for (var di = 0; di < DELEGATED.length; di++) {
    KUI.tabs[DELEGATED[di]] = delegate(DELEGATED[di]);
  }

})(window.KUI);

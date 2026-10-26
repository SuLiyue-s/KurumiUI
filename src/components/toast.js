/*!
 * KurumiUI · shell · toast.js
 * 提醒信息：toast（角落堆叠）/ notification（右上大卡片）
 * 4 种类型：info / success / warning / error
 * 契约：docs/00-contract.md §8.5、§10、§11、§12、§16
 *
 * 注册 type：toast（同时暴露 KUI.toast 静态 API，加载完成立即挂载）
 * 纯 DOM 实现，不依赖任何第三方库。
 */
(function (KUI) {
  'use strict';

  if (!KUI) { KUI = window.KUI = window.KUI || {}; }

  var hasOwn = Object.prototype.hasOwnProperty;

  /* ================= 防御式工具 ================= */

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

  function el(tag, cls) {
    var node = document.createElement(tag);
    if (cls) { node.className = cls; }
    return node;
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

  var seq = 0;
  function uid(prefix) {
    var id = safe(function () { return KUI.utils && KUI.utils.uid ? KUI.utils.uid(prefix) : ''; }, '');
    if (id) { return id; }
    seq++;
    return (prefix || 'kui') + '-' + seq + '-' + Date.now().toString(36);
  }

  function now() {
    return (typeof window.performance !== 'undefined' && window.performance.now)
      ? window.performance.now() : Date.now();
  }

  function raf(fn) {
    if (typeof window.requestAnimationFrame === 'function') { return window.requestAnimationFrame(fn); }
    return window.setTimeout(fn, 16);
  }

  function caf(id) {
    if (id === null || id === undefined) { return; }
    if (typeof window.cancelAnimationFrame === 'function') { window.cancelAnimationFrame(id); }
    else { window.clearTimeout(id); }
  }

  function iconHtml(name) {
    var html = safe(function () {
      if (!KUI.icons) { return ''; }
      // core/icons 的 get 返回完整 svg 标记，create 返回 SVGElement，两者都兼容
      if (typeof KUI.icons.get === 'function') { return KUI.icons.get(name, { 'class': 'kui-icon', size: 16 }); }
      if (typeof KUI.icons.create === 'function') { return KUI.icons.create(name, { 'class': 'kui-icon', size: 16 }); }
      return '';
    }, '');
    if (html && typeof html === 'string') { return html; }
    if (html && html.nodeType === 1) { return html.outerHTML || ''; }
    // 图标系统尚未加载时的降级：直接引用 sprite symbol（id 前缀 kui-icon-）
    return '<svg class="kui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#kui-icon-' +
      String(name).replace(/[^A-Za-z0-9_-]/g, '') + '"></use></svg>';
  }

  function iconNode(name, cls) {
    var wrap = el('span', cls || 'kui-toast__icon');
    wrap.innerHTML = iconHtml(name);
    return wrap;
  }

  /* ================= 默认配置 ================= */

  var DEFAULTS = {
    id: '',
    type: 'info',                  // info | success | warning | error
    mode: 'toast',                 // toast | notification
    title: '',
    message: '',
    icon: '',                      // 覆盖默认类型图标
    duration: 3200,                // 毫秒；0 = 不自动消失
    position: 'top-right',         // toast 位置
    closable: true,
    progress: true,                // 自动消失进度条
    action: null,                  // { text, onClick }
    max: 5,
    onClose: null,
    className: ''
  };

  var TYPES = { info: 'info', success: 'success', warning: 'warning', error: 'error', danger: 'error' };
  var TYPE_ICONS = { info: 'info', success: 'success', warning: 'warning', error: 'error' };
  var POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center', 'bottom-center'];
  var modeCounter = { toast: 0, notification: 0 };

  var state = {
    items: [],
    layers: {},                    // layerKey -> layerEl
    notificationPosition: 'top-right',
    config: DEFAULTS,
    inited: false
  };

  function normalizePosition(pos) {
    if (typeof pos !== 'string') { return 'top-right'; }
    return POSITIONS.indexOf(pos) >= 0 ? pos : 'top-right';
  }

  /* ================= 图层 ================= */

  function layerKeyFor(opts) {
    if (opts.mode === 'notification') { return 'notification'; }
    return normalizePosition(opts.position);
  }

  function getLayer(key) {
    var cached = state.layers[key];
    if (cached && cached.parentNode) { return cached; }
    var layer = el('div', 'kui-toast-layer');
    layer.setAttribute('data-toast-layer', key);
    if (key === 'notification') {
      layer.classList.add('kui-toast-layer--notification');
      layer.classList.add('kui-toast-layer--' + normalizePosition(state.notificationPosition));
    } else {
      layer.classList.add('kui-toast-layer--' + key);
    }
    document.body.appendChild(layer);
    state.layers[key] = layer;
    return layer;
  }

  function removeLayerIfEmpty(key) {
    var layer = state.layers[key];
    if (!layer) { return; }
    if (layer.children && layer.children.length === 0) {
      if (layer.parentNode) { layer.parentNode.removeChild(layer); }
      delete state.layers[key];
    }
  }

  /* ================= 条目构建 ================= */

  function buildItem(opts, type, id) {
    var mode = opts.mode === 'notification' ? 'notification' : 'toast';
    var root = el('div', 'kui-toast kui-toast--' + type + ' kui-toast--' + mode);
    root.setAttribute('data-toast-id', id);
    root.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');
    if (opts.className) { root.classList.add(opts.className); }

    // 左侧强调色条（CSS 用 ::before 或独立元素，这里放独立元素便于主题控制）
    var accent = el('span', 'kui-toast__accent');
    root.appendChild(accent);

    var icon = iconNode(opts.icon || TYPE_ICONS[type], 'kui-toast__icon');
    root.appendChild(icon);

    var body = el('div', 'kui-toast__body');
    if (opts.title) {
      var titleEl = el('div', 'kui-toast__title');
      titleEl.textContent = String(opts.title);
      body.appendChild(titleEl);
    }
    if (opts.message) {
      var msgEl = el('div', 'kui-toast__message');
      msgEl.textContent = String(opts.message);
      body.appendChild(msgEl);
    }
    root.appendChild(body);

    if (opts.action && opts.action.text) {
      var actionBtn = el('button', 'kui-toast__action');
      actionBtn.type = 'button';
      actionBtn.textContent = String(opts.action.text);
      on(actionBtn, 'click', function (ev) {
        if (ev && ev.stopPropagation) { ev.stopPropagation(); }
        var keep = false;
        safe(function () {
          if (typeof opts.action.onClick === 'function') { keep = opts.action.onClick(opts, ev) === false; }
        });
        if (!keep) { closeById(id); }
      });
      root.appendChild(actionBtn);
    }

    var closable = opts.closable !== false;
    var closeBtn = null;
    if (closable) {
      closeBtn = el('button', 'kui-toast__close');
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', txt('toast.close', '关闭'));
      closeBtn.innerHTML = iconHtml('close');
      on(closeBtn, 'click', function (ev) {
        if (ev && ev.stopPropagation) { ev.stopPropagation(); }
        closeById(id);
      });
      root.appendChild(closeBtn);
    }

    var progress = null;
    var progressBar = null;
    if (opts.progress && opts.duration > 0) {
      progress = el('div', 'kui-toast__progress');
      progressBar = el('div', 'kui-toast__progress-bar');
      progressBar.style.width = '100%';
      progress.appendChild(progressBar);
      root.appendChild(progress);
    }

    return { root: root, progressBar: progressBar, closeBtn: closeBtn, body: body };
  }

  /* ================= 计时 / 进度 ================= */

  function startTimer(item) {
    if (!item.opts.duration || item.opts.duration <= 0) { return; }
    item.startTime = now();
    item.timer = window.setTimeout(function () { closeById(item.id, 'timeout'); }, Math.max(16, item.remaining()));
    startProgress(item);
  }

  function remainingOf(item) {
    if (item.paused) { return Math.max(0, item.opts.duration - item.elapsed); }
    return Math.max(0, item.opts.duration - item.elapsed - (now() - item.startTime));
  }

  function startProgress(item) {
    if (!item.progressBar) { return; }
    caf(item.rafId);
    var tick = function () {
      var left = remainingOf(item);
      var ratio = item.opts.duration > 0 ? (left / item.opts.duration) : 1;
      item.progressBar.style.width = (Math.max(0, Math.min(1, ratio)) * 100).toFixed(2) + '%';
      if (!item.paused && item.timer !== null) { item.rafId = raf(tick); }
      else { item.rafId = null; }
    };
    item.rafId = raf(tick);
  }

  function pauseItem(item) {
    if (item.paused || item.closed) { return; }
    item.elapsed = item.elapsed + (now() - item.startTime);
    item.paused = true;
    if (item.timer !== null) {
      window.clearTimeout(item.timer);
      item.timer = null;
    }
    caf(item.rafId);
    item.rafId = null;
    if (item.root && item.root.classList) { item.root.classList.add('is-paused'); }
  }

  function resumeItem(item) {
    if (!item.paused || item.closed) { return; }
    item.paused = false;
    if (item.root && item.root.classList) { item.root.classList.remove('is-paused'); }
    if (!item.opts.duration) { return; }
    var left = Math.max(0, item.opts.duration - item.elapsed);
    if (left <= 0) { closeById(item.id, 'timeout'); return; }
    item.startTime = now();
    item.timer = window.setTimeout(function () { closeById(item.id, 'timeout'); }, Math.max(16, left));
    startProgress(item);
  }

  /* ================= 打开 / 关闭 ================= */

  function trimOverflow(mode, key, max) {
    var same = [];
    var i;
    for (i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      if (it.closed) { continue; }
      if (mode === 'notification') {
        if (it.opts.mode === 'notification') { same.push(it); }
      } else if (it.opts.mode !== 'notification' && layerKeyFor(it.opts) === key) {
        same.push(it);
      }
    }
    var limit = Math.max(1, Number(max) || 5);
    while (same.length > limit) {
      var oldest = same.shift();
      closeById(oldest.id, 'overflow');
    }
  }

  function show(opts) {
    if (typeof opts === 'string') { opts = { message: opts }; }
    var merged = deepMerge(state.config, opts || {});
    if (!merged.title && !merged.message) { return null; }
    var type = TYPES[merged.type] || 'info';
    merged.type = type;
    merged.mode = merged.mode === 'notification' ? 'notification' : 'toast';
    if (!merged.id) { merged.id = uid('toast'); }
    var id = merged.id;
    if (findItem(id)) { closeById(id, 'replace'); }

    var built = buildItem(merged, type, id);
    var key = layerKeyFor(merged);
    var layer = getLayer(key);
    layer.appendChild(built.root);

    var item = {
      id: id,
      opts: merged,
      root: built.root,
      progressBar: built.progressBar,
      layerKey: key,
      elapsed: 0,
      startTime: 0,
      remaining: function () { return remainingOf(this); },
      timer: null,
      rafId: null,
      paused: false,
      closed: false,
      removeTimer: null
    };
    state.items.push(item);
    modeCounter[merged.mode] = (modeCounter[merged.mode] || 0) + 1;

    // hover 暂停计时（契约 §8.5）
    on(built.root, 'mouseenter', function () { pauseItem(item); });
    on(built.root, 'mouseleave', function () { resumeItem(item); });

    // 进入动效
    built.root.classList.add('is-enter');
    raf(function () {
      raf(function () {
        if (!item.closed) { built.root.classList.add('is-open'); }
      });
    });

    startTimer(item);
    trimOverflow(merged.mode, key, merged.max);

    emitGlobal('toast:show', { id: id, type: type, mode: merged.mode, options: merged });
    return id;
  }

  function findItem(id) {
    var i;
    for (i = 0; i < state.items.length; i++) {
      if (state.items[i].id === id) { return state.items[i]; }
    }
    return null;
  }

  function closeById(id, reason) {
    var item = findItem(id);
    if (!item || item.closed) { return false; }
    item.closed = true;
    if (item.timer !== null) { window.clearTimeout(item.timer); item.timer = null; }
    caf(item.rafId);
    item.rafId = null;
    var root = item.root;
    if (root && root.classList) {
      root.classList.remove('is-open');
      root.classList.add('is-leaving');
    }
    item.removeTimer = window.setTimeout(function () {
      if (root && root.parentNode) { root.parentNode.removeChild(root); }
      var idx = state.items.indexOf(item);
      if (idx >= 0) { state.items.splice(idx, 1); }
      removeLayerIfEmpty(item.layerKey);
      safe(function () { item.opts.onClose && item.opts.onClose(reason || 'close'); });
      emitGlobal('toast:close', { id: id, reason: reason || 'close' });
    }, 240);
    return true;
  }

  function closeAll(filter) {
    var list = state.items.slice();
    var i;
    for (i = list.length - 1; i >= 0; i--) {
      var it = list[i];
      if (typeof filter === 'function' && !filter(it)) { continue; }
      closeById(it.id, 'closeAll');
    }
    return true;
  }

  function count(filter) {
    var n = 0, i;
    for (i = 0; i < state.items.length; i++) {
      if (state.items[i].closed) { continue; }
      if (typeof filter === 'function' && !filter(state.items[i])) { continue; }
      n++;
    }
    return n;
  }

  /* ================= 静态 API ================= */

  function showOfType(type, message, opts) {
    if (typeof message === 'object' && message !== null) { opts = message; message = opts.message; }
    var cfg = deepMerge({}, opts || {});
    cfg.type = type;
    if (message !== undefined && message !== null) { cfg.message = message; }
    return show(cfg);
  }

  function notify(opts) {
    if (typeof opts === 'string') { opts = { message: opts }; }
    var cfg = deepMerge({}, opts || {});
    cfg.mode = 'notification';
    return show(cfg);
  }

  var toastApi = {
    defaults: DEFAULTS,
    show: show,
    close: closeById,
    closeAll: closeAll,
    clear: function () { return closeAll(); },
    count: count,
    info: function (message, opts) { return showOfType('info', message, opts); },
    success: function (message, opts) { return showOfType('success', message, opts); },
    warning: function (message, opts) { return showOfType('warning', message, opts); },
    error: function (message, opts) { return showOfType('error', message, opts); },
    message: function (message, opts) { return showOfType('info', message, opts); },
    notify: notify,
    config: function (patch) {
      if (patch && typeof patch === 'object') {
        state.config = deepMerge(state.config, patch);
        if (patch.notificationPosition) { state.notificationPosition = normalizePosition(patch.notificationPosition); }
        if (patch.position) { state.config.position = normalizePosition(patch.position); }
      }
      return state.config;
    },
    notification: {
      show: notify,
      close: closeById,
      closeAll: function () {
        return closeAll(function (it) { return it.opts.mode === 'notification'; });
      },
      setPosition: function (pos) {
        state.notificationPosition = normalizePosition(pos);
        var layer = state.layers.notification;
        if (layer && layer.classList) {
          POSITIONS.forEach(function (p) { layer.classList.remove('kui-toast-layer--' + p); });
          layer.classList.add('kui-toast-layer--' + state.notificationPosition);
        }
        return state.notificationPosition;
      },
      getPosition: function () { return state.notificationPosition; }
    }
  };

  /* ================= 组件注册（type: toast） ================= */

  function createComponent(node, ctx) {
    var props = deepMerge(state.config, (node && node.props) || {});
    if (node) {
      var flat = ['type', 'mode', 'title', 'message', 'icon', 'duration', 'position',
        'closable', 'progress', 'action', 'max', 'className'];
      var i;
      for (i = 0; i < flat.length; i++) {
        if (node[flat[i]] !== undefined) { props[flat[i]] = node[flat[i]]; }
      }
    }
    var anchor = el('div', 'kui-toast-anchor');
    anchor.hidden = true;
    var id = show(props);
    var api = {
      el: anchor,
      id: id,
      close: function () { return closeById(id); }
    };
    anchor.__kuiToastApi = api;
    return anchor;
  }

  register('toast', {
    category: 'shell',
    defaults: DEFAULTS,
    render: function (node, ctx) { return createComponent(node, ctx); },
    api: function (elm) { return elm && elm.__kuiToastApi ? elm.__kuiToastApi : {}; }
  });

  /* ================= 加载完成立即挂载（bootstrap / 动作依赖） ================= */

  KUI.toast = toastApi;

})(window.KUI);

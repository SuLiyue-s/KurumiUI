/*!
 * KurumiUI · shell · dialog.js
 * 弹窗：每个弹窗 = 独立 iframe（dialog-frame.html）
 * Promise API：alert / confirm / prompt / form / custom / open / close / closeAll / get / update
 * 契约：docs/00-contract.md §8.4、§9、§10、§11、§12、§16
 *
 * 注册 type：dialog（同时暴露 KUI.dialog 静态 API，加载完成立即挂载）
 * DOM（契约 §8.4 强制）：
 *   <div class="kui-dialog-layer" data-dialog-id><div class="kui-dialog-mask"></div>
 *     <div class="kui-dialog-wrap"><iframe class="kui-dialog-frame" src="dialog-frame.html"></iframe></div>
 *   </div>
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

  function clamp(value, min, max) {
    var v = Number(value) || 0;
    if (v < min) { return min; }
    if (v > max) { return max; }
    return v;
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

  var seq = 0;
  function uid(prefix) {
    var id = safe(function () { return KUI.utils && KUI.utils.uid ? KUI.utils.uid(prefix) : ''; }, '');
    if (id) { return id; }
    seq++;
    return (prefix || 'kui') + '-' + seq + '-' + Date.now().toString(36);
  }

  // 取当前主题快照：{ id, name, scheme, tokens }。
  // core/theme.js 没有 tokens() 方法（只有 currentTokens()/current()），旧实现因此恒返回空 tokens，
  // 导致弹窗 iframe 收到的 dialog:init/theme:apply 不带 token → 弹窗内不跟随主题。
  function currentTheme() {
    var theme = null;
    safe(function () {
      if (!KUI.theme) { return; }
      var id = '';
      var name = '';
      var scheme = '';
      var tokens = null;
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

  /* ================= 默认配置（契约 §8.4） ================= */

  var DEFAULTS = {
    id: '',
    title: '',
    type: 'dialog',            // alert | confirm | prompt | form | custom | dialog
    icon: '',
    width: 480,
    height: 'auto',            // 'auto' | number
    maxWidth: '92vw',
    maskClosable: true,
    closeOnEsc: true,
    closable: true,
    draggable: false,
    maximizable: false,
    maximized: false,
    layer: 1,
    parentId: null,
    className: '',
    theme: null,               // null = 继承全局主题
    loading: false,
    // 内容
    message: '',
    nodes: null,
    data: null,
    layout: 'vertical',
    // prompt
    label: '',
    placeholder: '',
    defaultValue: '',
    rules: null,
    input: null,
    // 按钮
    okText: '',
    cancelText: '',
    // form 提交（父级函数，由本文件调用）
    submitApi: null,
    // 行为
    danger: false,
    actions: null,
    remoteAction: false,
    // 回调
    onOk: null,
    onCancel: null,
    onClose: null,
    onResolve: null
  };

  /* ================= dialog-frame.html 地址解析 ================= */

  var frameUrlCache = '';

  function resolveFrameUrl() {
    if (frameUrlCache) { return frameUrlCache; }
    // ① 配置逃生口：KUI.config.get('dialog.frameUrl')，app.json 里可覆盖
    var configured = safe(function () {
      return KUI.config && typeof KUI.config.get === 'function'
        ? KUI.config.get('dialog.frameUrl', '') : '';
    }, '');
    if (configured) {
      frameUrlCache = configured;
      return frameUrlCache;
    }
    // ② 从 dialog.js 自身 script.src 推导项目根，权威位置是 <root>/src/frame/dialog-frame.html
    var root = '';
    safe(function () {
      var scripts = document.getElementsByTagName('script');
      var i;
      for (i = scripts.length - 1; i >= 0; i--) {
        var src = scripts[i].src || '';
        var idx = src.indexOf('/src/components/dialog.js');
        if (idx > 0) { root = src.substring(0, idx); break; }
      }
    });
    if (root) {
      frameUrlCache = root.replace(/\/+$/, '') + '/src/frame/dialog-frame.html';
      return frameUrlCache;
    }
    // ③ standalone 页面（<root>/standalone/xxx.html）：按目录深度写相对路径
    var standalone = safe(function () {
      return window.location.pathname.indexOf('/standalone/') >= 0;
    }, false);
    if (standalone) {
      frameUrlCache = '../src/frame/dialog-frame.html';
      return frameUrlCache;
    }
    // ④ 兜底：相对当前文档（index.html 位于项目根时正确）
    frameUrlCache = 'src/frame/dialog-frame.html';
    return frameUrlCache;
  }

  /* ================= 弹窗 iframe 版本戳（缓存穿透 + 自愈） =================
   * 弹窗 iframe 的脚本一旦被浏览器缓存成旧版本（例如缺少 installActionBridge 的旧
   * dialog-frame.js），弹窗里的动作就会静默失效（例如「切换灵装主题」点卡片没反应）。
   * 因此给 dialog-frame.html 的地址统一追加 ?kui_v=<KUI.version>，并在 dialog:ready
   * 回执里核对版本：版本缺失/不一致时自动换新地址重载一次（只重载一次，防循环）。
   */
  function frameVersion() {
    var v = safe(function () { return KUI.version; }, '');
    return v || '0';
  }

  function withVersion(url) {
    if (!url) { return url; }
    if (url.indexOf('kui_v=') >= 0) { return url; }
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    return url + sep + 'kui_v=' + encodeURIComponent(frameVersion());
  }

  function reloadFrame(rec) {
    if (!rec || !rec.iframeEl) { return; }
    var url = withVersion(resolveFrameUrl());
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    rec.versionRetried = true;
    rec.ready = false;
    safe(function () { rec.iframeEl.src = url + sep + 'kui_r=' + Date.now(); });
  }

  /* ================= 单例弹窗管理器 ================= */

  // 弹窗层起始 z-index：优先读主题提供的 --kui-z-dialog，缺失时回退 1200
  function readDialogZ(fallback) {
    var value = null;
    try {
      if (window.getComputedStyle && document.documentElement) {
        value = window.getComputedStyle(document.documentElement).getPropertyValue('--kui-z-dialog');
      }
    } catch (e) {
      value = null;
    }
    var num = parseInt(value, 10);
    return isFinite(num) ? num : fallback;
  }
  var baseZ = readDialogZ(1200);
  var zCounter = 0;

  var layers = {};    // id -> record
  var order = [];     // 打开顺序（栈）
  var bodyLock = 0;
  var inited = false;
  var themeListenerOff = null;

  function lockBody() {
    bodyLock++;
    if (bodyLock === 1 && document && document.body && document.body.classList) {
      document.body.classList.add('kui-dialog-open');
    }
  }

  function unlockBody() {
    bodyLock = Math.max(0, bodyLock - 1);
    /* v1.3.6：关闭动画的 setTimeout 可能在宿主已销毁（测试 dom-stub / iframe 卸载）后触发，
     * 此时 document 可能为 null —— 必须容错，否则定时器里抛 uncaught 异常会让进程崩溃。 */
    if (bodyLock === 0 && document && document.body && document.body.classList) {
      document.body.classList.remove('kui-dialog-open');
    }
  }

  function topRecord() {
    for (var i = order.length - 1; i >= 0; i--) {
      var rec = layers[order[i]];
      if (rec && !rec.closed) { return rec; }
    }
    return null;
  }

  function postTo(rec, type, payload, requestId) {
    var win = rec && rec.iframeEl && rec.iframeEl.contentWindow;
    if (!win) { return false; }
    // targetOrigin 用 '*'：本框架面向 file:// 与任意 host 部署，父页面无法预知弹窗页面的 origin；
    // 接收侧严格校验 event.source === iframe.contentWindow，同源部署可自行收紧。
    var ok = safe(function () {
      win.postMessage({
        __kui: true,
        type: type,
        requestId: requestId || '',
        payload: payload || {}
      }, '*');
      return true;
    }, false);
    if (!ok && KUI.warnOnce) {
      KUI.warnOnce('dialog-post-failed:' + type, '[KurumiUI] 弹窗消息发送失败（' + type + '）：payload 含不可克隆值');
    }
    return true;
  }

  /* ------------------------------------------------------------------ *
   * 可结构化克隆的深拷贝（v1.2.1）
   *   postMessage 无法克隆函数 / undefined / symbol / DOM 节点 / 循环引用；
   *   之前 sendInit 只删了少数几个回调键，调用方传入 onSubmit 等函数时
   *   postMessage 直接抛 DataCloneError 且被 safe() 吞掉，导致父级永远发不出
   *   dialog:init，弹窗 iframe 反复 dialog:ready（熔断 6 次）=「弹窗空白/按钮无反应」。
   * ------------------------------------------------------------------ */
  var SANITIZE_MAX_DEPTH = 12;
  function sanitizeForPost(value, depth, seen) {
    depth = depth || 0;
    seen = seen || [];
    if (depth > SANITIZE_MAX_DEPTH) { return undefined; }
    var t = typeof value;
    if (value === null) { return null; }
    if (t === 'string' || t === 'number' || t === 'boolean') { return value; }
    if (t === 'function' || t === 'symbol' || t === 'undefined' || t === 'bigint') { return undefined; }
    if (t !== 'object') { return value; }
    if (typeof value.nodeType === 'number' && typeof value.nodeName === 'string') { return undefined; }
    if (seen.indexOf(value) >= 0) { return undefined; }
    seen.push(value);
    var out;
    if (Object.prototype.toString.call(value) === '[object Array]') {
      out = [];
      for (var i = 0; i < value.length; i += 1) {
        var item = sanitizeForPost(value[i], depth + 1, seen);
        if (item !== undefined) { out.push(item); } else { out.push(null); }
      }
    } else if (value instanceof Date) {
      out = new Date(value.getTime());
    } else {
      out = {};
      Object.keys(value).forEach(function (key) {
        var v = sanitizeForPost(value[key], depth + 1, seen);
        if (v !== undefined) { out[key] = v; }
      });
    }
    seen.pop();
    return out;
  }

  function sendInit(rec) {
    if (!rec || rec.closed) { return; }
    // 统一清洗：剔除所有不可克隆值（函数等），避免 DataCloneError 让 init 静默丢失
    var config = sanitizeForPost(deepMerge({}, rec.config));
    postTo(rec, 'dialog:init', {
      dialogId: rec.id,
      method: rec.method || rec.config.type,
      config: config,
      theme: rec.config.theme || currentTheme()
    });
  }

  /* ---------- 创建 layer ---------- */
  function createRecord(config) {
    var id = config.id;
    var layerEl = el('div', 'kui-dialog-layer');
    layerEl.setAttribute('data-dialog-id', id);
    if (config.className) { layerEl.classList.add(config.className); }
    if (config.type) { layerEl.classList.add('kui-dialog-layer--' + config.type); }
    if (config.loading) { layerEl.classList.add('is-loading'); }
    if (order.length > 0) { layerEl.classList.add('is-stacked'); }
    layerEl.style.zIndex = String(baseZ + (++zCounter) * 2);

    var maskEl = el('div', 'kui-dialog-mask');
    layerEl.appendChild(maskEl);

    var wrapEl = el('div', 'kui-dialog-wrap');
    applySize(wrapEl, config);
    if (config.draggable) { wrapEl.classList.add('is-draggable'); }
    if (config.maximized) { wrapEl.classList.add('is-maximized'); }

    var frameEl = el('iframe', 'kui-dialog-frame');
    frameEl.setAttribute('frameborder', '0');
    frameEl.setAttribute('title', config.title || txt('dialog.title', '提示'));
    frameEl.setAttribute('data-dialog-id', id);
    // 弹窗 iframe 一律加载 dialog-frame.html（每个弹窗一个独立 iframe）
    frameEl.src = withVersion(resolveFrameUrl());
    wrapEl.appendChild(frameEl);

    layerEl.appendChild(wrapEl);
    document.body.appendChild(layerEl);

    var resolveFn = null;
    var promise = new Promise(function (resolve) { resolveFn = resolve; });

    var rec = {
      id: id,
      config: config,
      el: layerEl,
      maskEl: maskEl,
      wrapEl: wrapEl,
      iframeEl: frameEl,
      promise: promise,
      resolveFn: resolveFn,
      ready: false,
      loaded: false,
      closed: false,
      resolved: false,
      cancelValue: undefined,
      drag: null,
      maximized: !!config.maximized,
      prevSize: null
    };

    // 遮罩点击：按配置关闭
    on(maskEl, 'click', function (ev) {
      if (!rec.config.maskClosable) { return; }
      rec.cancelValue = rec.cancelValue === undefined ? null : rec.cancelValue;
      closeLayer(rec, { fromMask: true });
    });

    // 拖拽条（draggable 时在 iframe 上方留一条可拖区域，iframe 内部标题栏拖拽走 dialog:drag-* 消息）
    if (config.draggable) {
      var handle = el('div', 'kui-dialog-handle');
      handle.title = txt('dialog.drag', '拖动');
      wrapEl.appendChild(handle);
      bindHandleDrag(rec, handle);
    }

    // 进入动效
    requestAnimationFrameSafe(function () {
      layerEl.classList.add('is-enter');
      requestAnimationFrameSafe(function () { layerEl.classList.add('is-open'); });
    });

    // 兜底自愈：若 RAF 被节流（后台标签页 / iframe 尚未可见）导致 is-open 没加上，
    // 弹窗会「透明但仍挡住点击」——700ms 后强制补上。
    setTimeout(function () {
      if (rec.closed) { return; }
      if (!layerEl.classList.contains('is-open')) { layerEl.classList.add('is-enter', 'is-open'); }
    }, 700);

    lockBody();
    return rec;
  }

  function applySize(wrapEl, config) {
    var width = config.width;
    if (typeof width === 'number') { wrapEl.style.width = width + 'px'; }
    else if (typeof width === 'string' && width) { wrapEl.style.width = width; }
    wrapEl.style.maxWidth = config.maxWidth || '92vw';
    var height = config.height;
    if (typeof height === 'number') { wrapEl.style.height = height + 'px'; }
    else if (typeof height === 'string' && height && height !== 'auto') { wrapEl.style.height = height; }
    else { wrapEl.style.height = ''; }
  }

  function requestAnimationFrameSafe(fn) {
    if (typeof window.requestAnimationFrame === 'function') { window.requestAnimationFrame(fn); }
    else { window.setTimeout(fn, 16); }
  }

  /* ---------- 拖拽（父页面手柄 + iframe 标题栏消息） ---------- */
  function bindHandleDrag(rec, handle) {
    on(handle, 'mousedown', function (ev) {
      beginDrag(rec, ev);
    });
    on(handle, 'dblclick', function () {
      toggleMaximize(rec.id);
    });
  }

  function beginDrag(rec, ev) {
    if (!rec || rec.closed) { return; }
    if (ev && ev.preventDefault) { ev.preventDefault(); }
    var rect = rec.wrapEl.getBoundingClientRect();
    rec.wrapEl.style.position = 'fixed';
    rec.wrapEl.style.margin = '0';
    rec.wrapEl.style.left = rect.left + 'px';
    rec.wrapEl.style.top = rect.top + 'px';
    rec.drag = {
      startX: ev.clientX,
      startY: ev.clientY,
      left: rect.left,
      top: rect.top
    };
    rec.el.classList.add('is-dragging');
    var move = function (e2) {
      if (!rec.drag || rec.closed) { return; }
      var left = rec.drag.left + (e2.clientX - rec.drag.startX);
      var top = rec.drag.top + (e2.clientY - rec.drag.startY);
      var maxLeft = Math.max(0, window.innerWidth - 80);
      var maxTop = Math.max(0, window.innerHeight - 60);
      rec.wrapEl.style.left = clamp(left, 0 - (rec.wrapEl.offsetWidth - 80), maxLeft) + 'px';
      rec.wrapEl.style.top = clamp(top, 0, maxTop) + 'px';
    };
    var up = function () {
      off(document, 'mousemove', move, true);
      off(document, 'mouseup', up, true);
      rec.drag = null;
      rec.el.classList.remove('is-dragging');
    };
    on(document, 'mousemove', move, true);
    on(document, 'mouseup', up, true);
  }

  function moveByDrag(rec, payload) {
    if (!rec || !rec.drag) { return; }
    var x = payload && payload.x !== undefined ? payload.x : 0;
    var y = payload && payload.y !== undefined ? payload.y : 0;
    var left = rec.drag.left + (x - rec.drag.startX);
    var top = rec.drag.top + (y - rec.drag.startY);
    rec.wrapEl.style.left = clamp(left, 0 - (rec.wrapEl.offsetWidth - 80), Math.max(0, window.innerWidth - 80)) + 'px';
    rec.wrapEl.style.top = clamp(top, 0, Math.max(0, window.innerHeight - 60)) + 'px';
  }

  /* ---------- 最大化 ---------- */
  function toggleMaximize(id) {
    var rec = layers[id];
    if (!rec || rec.closed) { return; }
    if (!rec.config.maximizable && !rec.config.maximized && id !== rec.id) {
      // 未声明 maximizable 时也允许程序调用 maximize API，这里仅在显式 API 时生效
    }
    if (!rec.maximized) {
      rec.prevSize = { left: rec.wrapEl.style.left, top: rec.wrapEl.style.top, width: rec.wrapEl.style.width, height: rec.wrapEl.style.height, position: rec.wrapEl.style.position };
      rec.maximized = true;
      rec.wrapEl.classList.add('is-maximized');
      rec.el.classList.add('is-maximized');
    } else {
      rec.maximized = false;
      rec.wrapEl.classList.remove('is-maximized');
      rec.el.classList.remove('is-maximized');
      if (rec.prevSize) {
        rec.wrapEl.style.left = rec.prevSize.left || '';
        rec.wrapEl.style.top = rec.prevSize.top || '';
        rec.wrapEl.style.width = rec.prevSize.width || '';
        rec.wrapEl.style.height = rec.prevSize.height || '';
        rec.wrapEl.style.position = rec.prevSize.position || '';
        rec.prevSize = null;
      }
    }
    rec.el.classList.toggle('is-maximized', rec.maximized);
    postTo(rec, 'dialog:update', { patch: { maximized: rec.maximized } });
    emitGlobal('dialog:maximize', { id: rec.id, maximized: rec.maximized });
  }

  /* ---------- 关闭 ---------- */
  function closeLayer(rec, options) {
    options = options || {};
    if (!rec || rec.closed) { return false; }
    rec.closed = true;
    hideContextAll();
    rec.el.classList.add('is-leaving');
    rec.el.classList.remove('is-open');
    if (!rec.resolved) {
      rec.resolved = true;
      rec.resolveFn(rec.cancelValue);
    }
    safe(function () { rec.config.onClose && rec.config.onClose(rec.cancelValue); });
    window.setTimeout(function () {
      if (rec.el && rec.el.parentNode) { rec.el.parentNode.removeChild(rec.el); }
      delete layers[rec.id];
      var idx = order.indexOf(rec.id);
      if (idx >= 0) { order.splice(idx, 1); }
      unlockBody();
      emitGlobal('dialog:close', { id: rec.id, value: rec.cancelValue });
      recomputeStack();
    }, 240);
    return true;
  }

  function recomputeStack() {
    var i;
    for (i = 0; i < order.length; i++) {
      var rec = layers[order[i]];
      if (!rec) { continue; }
      if (i < order.length - 1) { rec.el.classList.add('is-stacked'); }
      else { rec.el.classList.remove('is-stacked'); }
      rec.el.style.zIndex = String(baseZ + i * 2);
    }
  }

  /* ---------- 打开 ---------- */
  function openDialog(config) {
    config = deepMerge(DEFAULTS, config || {});
    if (!config.id) { config.id = uid('dialog'); }
    var id = config.id;
    if (layers[id]) { closeLayer(layers[id], { force: true }); }

    var rec = createRecord(config);
    rec.method = config.type;
    layers[id] = rec;
    order.push(id);

    // 默认取消值
    if (config.type === 'confirm') { rec.cancelValue = false; }
    else if (config.type === 'alert') { rec.cancelValue = undefined; }
    else { rec.cancelValue = null; }

    var promise = rec.promise;
    promise.id = id;
    emitGlobal('dialog:open', { id: id, config: config });
    return promise;
  }

  /* ---------- 消息处理 ---------- */
  function findRecordByWindow(win) {
    if (!win) { return null; }
    var id, rec;
    for (id in layers) {
      if (!hasOwn.call(layers, id)) { continue; }
      rec = layers[id];
      if (rec && rec.iframeEl && rec.iframeEl.contentWindow === win) { return rec; }
    }
    return null;
  }

  function handleRemoteAction(rec, msg) {
    var payload = msg.payload || {};
    var action = payload.action;
    var params = payload.params || {};
    var result = { ok: false, result: null, error: '' };
    var has = true;
    if (KUI.actions && typeof KUI.actions.has === 'function') { has = !!KUI.actions.has(action); }
    if (!has) {
      // 弹窗 iframe 请求了父页面没注册的动作（例如 demo 页未注册 demo.trace/demo.nested）：
      // 回执 ok:false + 在页面上 toast 提示，避免按钮"点了没反应"却无从排查。
      result.error = '动作未注册：' + String(action || '');
      if (KUI.toast && typeof KUI.toast.warning === 'function') {
        safe(function () {
          KUI.toast.warning({
            title: txt('dialog.actionMissing', '动作未注册'),
            message: txt('dialog.actionMissingDetail', '父页面未注册动作「{name}」，请先用 KUI.actions.register 注册。', { name: String(action || '') })
          });
        });
      }
      if (KUI.warn) { safe(function () { KUI.warn('[dialog] 弹窗请求的动作未注册：' + action); }); }
    } else {
      try {
        var ctx = { scope: 'dialog', dialogId: rec.id, app: KUI.app || null };
        var ret = KUI.actions.run({ action: action, params: params }, ctx);
        result.ok = true;
        result.result = ret === undefined ? null : ret;
      } catch (e) {
        result.error = (e && e.message) ? e.message : String(e);
      }
    }
    postTo(rec, 'dialog:action:result', result, msg.requestId);
  }

  function handleFormSubmit(rec, msg) {
    var payload = msg.payload || {};
    var data = payload.data || {};
    var submitApi = rec.config.submitApi;
    var finish = function (value) {
      rec.resolved = true;
      rec.resolveFn(value);
      safe(function () { rec.config.onOk && rec.config.onOk(value); });
      closeLayer(rec, { force: true });
    };
    var fail = function (message) {
      postTo(rec, 'dialog:form-error', { message: message || txt('dialog.submitError', '提交失败，请稍后重试') }, msg.requestId);
    };
    if (typeof submitApi !== 'function') {
      finish(data);
      return;
    }
    var ret;
    try { ret = submitApi(data, rec); }
    catch (e) { fail((e && e.message) || String(e)); return; }
    if (ret && typeof ret.then === 'function') {
      ret.then(function (value) {
        if (value === false) { return; } // 业务侧明确拒绝关闭
        finish(value === undefined || value === true ? data : value);
      }, function (err) {
        fail((err && err.message) || (typeof err === 'string' ? err : ''));
      });
    } else if (ret === false) {
      // 保持打开
    } else {
      finish(ret === undefined || ret === true ? data : ret);
    }
  }

  function handleMessage(event) {
    var data = event && event.data;
    if (!data || data.__kui !== true) { return; }
    var rec = findRecordByWindow(event.source);
    // 严格校验：event.source 必须正好是该弹窗 iframe 的 contentWindow
    if (!rec || !rec.iframeEl || event.source !== rec.iframeEl.contentWindow) { return; }
    var type = data.type || '';
    var payload = data.payload || {};

    switch (type) {
      case 'dialog:ready':
        // 版本自愈：旧版缓存文档（不报版本 / 版本不一致）只重载一次
        if (!rec.versionRetried && payload.version !== frameVersion()) {
          reloadFrame(rec);
          return;
        }
        rec.readyCount = (rec.readyCount || 0) + 1;
        // 熔断：正常弹窗只会 ready 1~2 次（重试计时器）；超过 5 次说明出现消息乒乓
        if (rec.readyCount > 5) {
          if (KUI.diag && typeof KUI.diag.log === 'function') {
            KUI.diag.log('dialog', 'ready 次数异常（' + rec.readyCount + ' 次），已停止重复初始化：' + rec.id);
          }
          break;
        }
        rec.ready = true;
        rec.loaded = true;
        if (rec.config.loading) { rec.el.classList.remove('is-loading'); rec.config.loading = false; }
        // 只初始化一次：此前每次 ready 都 sendInit，而 frame 的 render 又回发 ready，
        // 形成 ~15ms 一轮的无限乒乓，导致按钮点击像没反应、输入时主线程满载（v1.1.1 修复）。
        if (!rec.inited) {
          rec.inited = true;
          sendInit(rec);
        }
        rec.el.classList.add('is-ready');
        break;
      case 'dialog:resize':
        handleResize(rec, payload);
        break;
      case 'dialog:resolve':
        resolveOnce(rec, payload.value, 'resolve', data);
        break;
      case 'dialog:cancel':
        resolveOnce(rec, rec.cancelValue, 'cancel', data);
        break;
      case 'dialog:toast':
        if (KUI.toast && typeof KUI.toast.show === 'function') {
          safe(function () { KUI.toast.show(payload); });
        }
        break;
      case 'dialog:debug':
      if (KUI.diag && typeof KUI.diag.log === 'function') {
        KUI.diag.log('frame', (data.payload && data.payload.message) || '(empty)');
      }
      return;

    case 'dialog:clicked':
        // 弹窗内按钮点击反馈：父页面弹一条轻提示，用户能确认「点击已生效」
        if (rec.config.clickFeedback !== false && KUI.toast && typeof KUI.toast.info === 'function') {
          var hitText = (payload && payload.text) ? String(payload.text) : '';
          safe(function () {
            KUI.toast.info(hitText ? '已点击：' + hitText : '已点击', { duration: 1400 });
          });
        }
        break;
      case 'dialog:open':
        // 弹窗内再打开弹窗：由父级创建新的独立 iframe 弹窗（扩展回传 dialog:open:result）
        handleNestedOpen(rec, payload, data.requestId);
        break;
      case 'dialog:theme-request':
        postTo(rec, 'theme:apply', rec.config.theme || currentTheme());
        break;
      case 'dialog:action':
        handleRemoteAction(rec, data);
        break;
      case 'dialog:form-submit':
        handleFormSubmit(rec, data);
        break;
      case 'dialog:drag-start':
        beginDragFromFrame(rec, payload);
        break;
      case 'dialog:drag-move':
        moveByDrag(rec, payload);
        break;
      case 'dialog:drag-end':
        endDragFromFrame(rec);
        break;
      case 'dialog:maximize':
        toggleMaximize(rec.id);
        break;
      case 'dialog:restore':
        if (rec.maximized) { toggleMaximize(rec.id); }
        break;
      case 'dialog:close':
        rec.cancelValue = rec.cancelValue === undefined ? undefined : rec.cancelValue;
        closeLayer(rec, { force: true });
        break;
      default:
        break;
    }
  }

  function beginDragFromFrame(rec, payload) {
    var rect = rec.wrapEl.getBoundingClientRect();
    rec.wrapEl.style.position = 'fixed';
    rec.wrapEl.style.margin = '0';
    rec.wrapEl.style.left = rect.left + 'px';
    rec.wrapEl.style.top = rect.top + 'px';
    rec.drag = {
      startX: payload && payload.x !== undefined ? payload.x : 0,
      startY: payload && payload.y !== undefined ? payload.y : 0,
      left: rect.left,
      top: rect.top
    };
    rec.el.classList.add('is-dragging');
  }

  function endDragFromFrame(rec) {
    rec.drag = null;
    rec.el.classList.remove('is-dragging');
  }

  function handleNestedOpen(parentRec, payload, requestId) {
    // 弹窗内 KUI.dialog.alert/confirm/prompt/form/custom 转发格式：{ method, config }
    // 兼容直接传 config 的调用（以下方 method 推导 type）
    var method = payload && payload.method;
    var raw = payload && payload.config ? payload.config : (payload || {});
    var childConfig = deepMerge({}, raw);
    if (!childConfig.type) { childConfig.type = method || 'custom'; }
    childConfig.parentId = childConfig.parentId || parentRec.id;
    childConfig.layer = parentRec.config.layer + 1;
    var promise = openDialog(childConfig);
    if (!requestId) { return; }
    // 子弹窗结束后把结果回传给发起方 iframe（requestId 放信封，与 dialog-frame 的 settle 对齐）
    promise.then(function (value) {
      postTo(parentRec, 'dialog:open:result', { value: value === undefined ? null : value }, requestId);
    }, function () {
      postTo(parentRec, 'dialog:open:result', { value: null }, requestId);
    });
  }

  function resolveOnce(rec, value, kind, msg) {
    if (!rec || rec.closed) { return; }
    if (!rec.resolved) {
      rec.resolved = true;
      rec.resolveFn(value);
    }
    if (kind === 'resolve') {
      safe(function () { rec.config.onOk && rec.config.onOk(value); });
    } else {
      safe(function () { rec.config.onCancel && rec.config.onCancel(value); });
    }
    closeLayer(rec, { force: true });
  }

  function handleResize(rec, payload) {
    // 令牌桶熔断：同一弹窗 500ms 内超过 40 次高度变更，视为「高度上报 ↔ iframe 改高」
    // 自激循环，直接忽略后续变更，避免主线程被消息刷屏（v1.1.1）。
    var nowTs = Date.now();
    if (!rec.resizeWindowAt || nowTs - rec.resizeWindowAt > 500) {
      rec.resizeWindowAt = nowTs;
      rec.resizeBudget = 0;
    }
    rec.resizeBudget = (rec.resizeBudget || 0) + 1;
    if (rec.resizeBudget > 40) {
      if (!rec.resizeWarned) {
        rec.resizeWarned = true;
        if (KUI.diag && typeof KUI.diag.log === 'function') {
          KUI.diag.log('dialog', '高度上报异常频繁（>40 次/500ms），已熔断：' + rec.id);
        }
      }
      return;
    }
    if (!rec || rec.closed) { return; }
    var config = rec.config;
    if (payload && payload.width && (config.width === 'auto' || config.width === 0)) {
      rec.wrapEl.style.width = Math.max(240, Number(payload.width) || 0) + 'px';
    }
    if (!payload || payload.height === undefined || payload.height === null) { return; }
    var maxH = Math.max(160, (window.innerHeight || 720) - 80);
    var h = clamp(payload.height, 80, maxH);
    // 去抖：高度没变时不改样式，避免「iframe 改高 → 内容重排 → 再次上报」的抖动链
    if (Math.abs(h - (rec.lastHeight || 0)) < 1) { return; }
    rec.lastHeight = h;
    rec.iframeEl.style.height = h + 'px';
    rec.wrapEl.style.height = 'auto';
    rec.el.classList.add('is-resized');
    emitGlobal('dialog:resize', { id: rec.id, height: h, width: payload.width || null });
  }

  /* ---------- 公共 API 实现 ---------- */

  function getRecord(id) {
    return id ? (layers[id] || null) : null;
  }

  function snapshot(rec) {
    if (!rec) { return null; }
    return {
      id: rec.id,
      type: rec.config.type,
      title: rec.config.title,
      width: rec.config.width,
      height: rec.config.height,
      closed: rec.closed,
      ready: rec.ready,
      maximized: rec.maximized,
      config: rec.config,
      el: rec.el
    };
  }

  function closeById(id) {
    var rec = getRecord(id);
    if (!rec) { return false; }
    rec.cancelValue = rec.cancelValue;
    return closeLayer(rec, { force: true });
  }

  function closeAll() {
    var ids = order.slice();
    var i;
    for (i = ids.length - 1; i >= 0; i--) {
      var rec = layers[ids[i]];
      if (rec) { closeLayer(rec, { force: true }); }
    }
  }

  function updateDialog(id, patch) {
    var rec = getRecord(id);
    if (!rec) { return false; }
    rec.config = deepMerge(rec.config, patch || {});
    if (patch && patch.width !== undefined) { applySize(rec.wrapEl, rec.config); }
    if (patch && patch.maximized !== undefined) {
      if (!!patch.maximized !== rec.maximized) { toggleMaximize(rec.id); }
    }
    postTo(rec, 'dialog:update', { patch: patch || {} });
    return true;
  }

  function alertDialog(config) {
    if (typeof config === 'string') { config = { message: config }; }
    config = config || {};
    var merged = deepMerge({
      type: 'alert',
      title: txt('dialog.alertTitle', '提示'),
      icon: config.icon || 'info',
      width: 420,
      maskClosable: config.closeOnMask !== undefined ? !!config.closeOnMask : true,
      cancelValue: undefined
    }, config);
    merged.okText = merged.okText || txt('dialog.ok', '确定');
    merged.cancelText = merged.cancelText || '';
    // 强制以工厂方法为准：业务配置里的 type 常被用来表示配色/图标语义（如 type:'info'），
    // 若允许覆盖，弹窗 iframe 会按 info 渲染 → 正文空白、底部只剩一个按钮。
    merged.type = 'alert';
    var p = openDialog(merged);
    return p;
  }

  function confirmDialog(config) {
    if (typeof config === 'string') { config = { message: config }; }
    config = config || {};
    var merged = deepMerge({
      type: 'confirm',
      title: txt('dialog.confirmTitle', '确认'),
      icon: config.icon || 'question',
      width: 420,
      maskClosable: false
    }, config);
    merged.okText = merged.okText || txt('dialog.ok', '确定');
    merged.cancelText = merged.cancelText || txt('dialog.cancel', '取消');
    merged.type = 'confirm';
    return openDialog(merged);
  }

  function promptDialog(config) {
    if (typeof config === 'string') { config = { message: config }; }
    config = config || {};
    var merged = deepMerge({
      type: 'prompt',
      title: txt('dialog.promptTitle', '输入'),
      width: 420,
      maskClosable: false,
      input: { type: 'text' }
    }, config);
    merged.okText = merged.okText || txt('dialog.ok', '确定');
    merged.cancelText = merged.cancelText || txt('dialog.cancel', '取消');
    merged.type = 'prompt';
    return openDialog(merged);
  }

  function formDialog(config) {
    config = config || {};
    var merged = deepMerge({
      type: 'form',
      title: txt('dialog.formTitle', '表单'),
      width: 520,
      maskClosable: false,
      nodes: [],
      data: null,
      layout: 'vertical'
    }, config);
    merged.okText = merged.okText || txt('dialog.ok', '确定');
    merged.cancelText = merged.cancelText || txt('dialog.cancel', '取消');
    merged.type = 'form';
    return openDialog(merged);
  }

  function customDialog(config) {
    config = config || {};
    var merged = deepMerge({
      type: 'custom',
      title: config.title || '',
      width: 560,
      nodes: [],
      actions: []
    }, config);
    merged.type = 'custom';
    return openDialog(merged);
  }

  /* ---------- 全局监听 ---------- */
  // 拖拽卡死兜底（v1.1.0）：若 mouseup 丢在窗口外/iframe 内，is-dragging 会残留，
  // 而 .kui-dialog-layer.is-dragging .kui-dialog-frame { pointer-events: none } 会让
  // 整个弹窗「点什么都没反应」。这里监听极端情况并强制收尾。
  function forceEndDrag() {
    for (var id in layers) {
      if (!hasOwn.call(layers, id)) { continue; }
      var rec = layers[id];
      if (!rec || rec.closed) { continue; }
      if (rec.el && rec.el.classList && rec.el.classList.contains('is-dragging')) {
        rec.el.classList.remove('is-dragging');
        rec.dragging = false;
      }
    }
  }

  function bindDragWatchdog() {
    on(document, 'mouseup', function () { safe(forceEndDrag); }, true);
    on(document, 'pointerup', function () { safe(forceEndDrag); }, true);
    on(global.window || window, 'blur', function () { safe(forceEndDrag); });
    on(document, 'visibilitychange', function () { safe(forceEndDrag); });
    // 定时兜底：任何超过 2.4s 的拖拽状态都视为卡住
    (function tick() {
      safe(forceEndDrag);
      var timer = global.setTimeout(tick, 2400);
      // Node / 测试用 DOM 桩：别让这个看门狗阻止进程退出（浏览器无 unref，忽略）
      if (timer && typeof timer.unref === 'function') { timer.unref(); }
    })();
  }

  function bindGlobalEvents() {
    if (inited) { return; }
    safe(bindDragWatchdog);
    inited = true;
    on(window, 'message', handleMessage);
    on(document, 'keydown', function (ev) {
      if (!ev || ev.key !== 'Escape') { return; }
      var rec = topRecord();
      if (!rec) { return; }
      if (!rec.config.closeOnEsc) { return; }
      if (!rec.config.closable) { return; }
      // 有右键菜单时优先由右键菜单自己消费
      hideContextAll();
      rec.cancelValue = rec.cancelValue;
      closeLayer(rec, { fromEsc: true });
    }, true);
    // 说明（v1.1.0）：此前这里用 document 级 focusin「持续把焦点抢回弹窗 iframe」。
    // 在某些浏览器/输入法组合下，这种反复 refocus 会让输入框拿不稳焦点（表现为
    // 点输入框没反应、打字卡顿甚至整页失去响应），因此改为「打开时聚焦一次」，
    // 不再持续干预用户的焦点。弹窗打开后的焦点由 iframe 文档自己维护。
    // 主题变化广播到所有弹窗
    if (KUI.bus && typeof KUI.bus.on === 'function') {
      themeListenerOff = safe(function () {
        return KUI.bus.on('theme:change', function (payload) {
          var theme = payload && payload.tokens ? payload : currentTheme();
          var id;
          for (id in layers) {
            if (!hasOwn.call(layers, id)) { continue; }
            var rec = layers[id];
            if (rec && !rec.closed) { postTo(rec, 'theme:apply', theme); }
          }
        });
      }, null);
    }
  }

  function hideContextAll() {
    // 由 tabs/其他组件管理右键菜单；此处仅保留 hook，便于后续扩展
  }

  /* ================= 组件注册（type: dialog） ================= */

  function createComponent(node, ctx) {
    var props = deepMerge(DEFAULTS, (node && node.props) || {});
    if (node) {
      var flat = ['title', 'type', 'icon', 'width', 'height', 'maxWidth', 'maskClosable',
        'closeOnEsc', 'closable', 'draggable', 'layer', 'className', 'message', 'nodes',
        'data', 'layout', 'okText', 'cancelText', 'label', 'placeholder', 'defaultValue',
        'rules', 'input', 'danger', 'actions', 'submitApi', 'loading'];
      var i;
      for (i = 0; i < flat.length; i++) {
        if (node[flat[i]] !== undefined) { props[flat[i]] = node[flat[i]]; }
      }
      if (node.id && !props.id) { props.id = String(node.id); }
    }
    var anchor = el('div', 'kui-dialog-anchor');
    anchor.hidden = true;
    var promise = openDialog(props);
    var api = {
      el: anchor,
      id: props.id,
      promise: promise,
      close: function () { return closeById(props.id); },
      update: function (patch) { return updateDialog(props.id, patch); }
    };
    anchor.__kuiDialogApi = api;
    return anchor;
  }

  register('dialog', {
    category: 'shell',
    defaults: DEFAULTS,
    render: function (node, ctx) { return createComponent(node, ctx); },
    api: function (elm) { return elm && elm.__kuiDialogApi ? elm.__kuiDialogApi : {}; }
  });

  /* ================= 静态 API：加载完成立即挂载（Lead 要求） ================= */

  bindGlobalEvents();

  var dialogApi = {
    defaults: DEFAULTS,
    open: openDialog,
    close: closeById,
    closeAll: closeAll,
    get: function (id) { return snapshot(getRecord(id)); },
    has: function (id) { return !!getRecord(id); },
    update: updateDialog,
    alert: alertDialog,
    confirm: confirmDialog,
    prompt: promptDialog,
    form: formDialog,
    custom: customDialog,
    maximize: function (id) { toggleMaximize(id); return true; },
    restore: function (id) {
      var rec = getRecord(id);
      if (rec && rec.maximized) { toggleMaximize(id); }
      return true;
    },
    count: function () { return order.length; },
    top: function () { return snapshot(topRecord()); },
    /**
     * 合并全局弹窗配置。
     * 兼容旧字段 ui.dialog.escClosable（docs/02-config-reference.md §1.6）：
     * 归一为内部字段 closeOnEsc，保证「配了就有读取点」。
     */
    config: function (patch) {
      if (patch && typeof patch === 'object') {
        var p = patch;
        // ① 直接传 { escClosable: false }
        if (p.escClosable !== undefined && p.closeOnEsc === undefined) {
          var copy = {};
          for (var k in p) { if (Object.prototype.hasOwnProperty.call(p, k)) { copy[k] = p[k]; } }
          copy.closeOnEsc = !!p.escClosable;
          p = copy;
        }
        // ② 传 { ui: { escClosable: false } }（直接调 KUI.dialog.config 的场景）
        if (p.ui && typeof p.ui === 'object' && p.ui.escClosable !== undefined && p.closeOnEsc === undefined) {
          var copy2 = {};
          for (var k2 in p) { if (Object.prototype.hasOwnProperty.call(p, k2)) { copy2[k2] = p[k2]; } }
          copy2.closeOnEsc = !!p.ui.escClosable;
          p = copy2;
        }
        // deepMerge 返回新对象（不修改入参），必须写回 DEFAULTS 才能让全局配置生效
        DEFAULTS = deepMerge(DEFAULTS, p);
      }
      return DEFAULTS;
    }
  };

  KUI.dialog = dialogApi;

})(window.KUI);

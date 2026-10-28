/**
 * KurumiUI · 业务 iframe SDK（页面桥）
 * ---------------------------------------------------------------------------
 * 被 pages/*.html 引入（<script src="../src/frame/kui-frame.js"></script>），
 * 负责业务页面与主框架（app-shell + tabs）之间的消息桥：
 *
 *   父级 → 业务页：tab:init / tab:before-close / tab:refresh / theme:change / tab:activate
 *   业务页 → 父级：frame:ready / frame:title / frame:dirty / frame:toast /
 *                  frame:dialog / frame:close / frame:height / frame:navigate
 *   父级回执：frame:dialog-result{requestId,value}
 *
 * 对外 API：KUI.frame.{ready,setTitle,setDirty,isDirty,toast,dialog,close,refresh,
 *                         navigate,getParams,onTheme,theme,on,off,emit,height,heightAuto,isFramed}
 *
 * 依赖：core/kui.js（可选 core/icons.js、config.js、theme.js）。全部防御式调用，
 * 即使 core 尚未就绪也能工作（纯 DOM + postMessage + 原生兜底）。
 * 文件位置固定为 src/frame/kui-frame.js；页面引用时用 ../src/frame/kui-frame.js。
 *
 * postMessage 约定：{ __kui: true, type, requestId, payload }
 * targetOrigin 使用 '*'：本框架面向 file:// 与任意 host 部署，父页面 origin 无法预知；
 * 同源部署时可按需收紧为具体 origin。入站消息一律校验 event.source === window.parent。
 */
(function (global) {
  'use strict';

  var K = global.KUI || {};
  K = K && typeof K === 'object' ? K : {};
  global.KUI = K;

  /* ------------------------------------------------------------------ */
  /* 基础工具                                                            */
  /* ------------------------------------------------------------------ */

  function safe(fn, fallback) {
    try {
      var value = fn();
      return value === undefined ? fallback : value;
    } catch (e) {
      return fallback;
    }
  }

  function txt(key, fallback, vars) {
    var value = safe(function () { return K.text(key, fallback, vars); }, fallback);
    return (value === undefined || value === null || value === '') ? fallback : value;
  }

  function uid(prefix) {
    return safe(function () { return K.utils.uid(prefix); }, (prefix || 'kui') + '-' + Math.random().toString(36).slice(2, 8));
  }

  /* ------------------------------------------------------------------ */
  /* 消息发送                                                            */
  /* ------------------------------------------------------------------ */

  function getParent() {
    try {
      if (global.parent && global.parent !== global) { return global.parent; }
    } catch (e) { /* 忽略：跨域读取 parent 本身安全 */ }
    return null;
  }

  function isFramed() {
    return !!getParent();
  }

  /* ------------------------------------------------------------------ */
  /* 版本自愈                                                            */
  /* ------------------------------------------------------------------ */
  /* 场景：父级页面已经升级（KUI.version 递增），但本 iframe 里的文档仍是浏览器
   * 缓存中的旧版（长会话 / 强缓存都可能出现）。旧版页面可能缺少新脚本，典型症状
   * 是渲染时出现「未注册的元素类型 xxx」。
   * 做法：tab:init 携带父级版本号；版本不一致时带 kui_v=<父版本> 自动刷新一次，
   * 用 sessionStorage 记账避免反复刷新。直接打开的独立页不做自愈。
   */
  function currentVersion() {
    return safe(function () { return K.version; }, '') || '';
  }

  function selfHealVersion(parentVersion) {
    var mine = currentVersion();
    if (!parentVersion || !mine || String(parentVersion) === String(mine)) { return false; }
    if (!isFramed()) { return false; }
    var key = 'kui-self-heal:' + parentVersion;
    var healed = false;
    try {
      healed = !!(global.sessionStorage && global.sessionStorage.getItem(key));
    } catch (e) {
      healed = false;
    }
    if (healed) { return false; }
    try {
      if (global.sessionStorage) { global.sessionStorage.setItem(key, '1'); }
    } catch (e) { /* 隐私模式忽略 */ }
    safe(function () {
      var href = String(global.location.href || '');
      var cleaned = href.replace(/([?&])kui_v=[^&#]*/g, '$1').replace(/[?&](?=#|$)/g, '');
      var sep = cleaned.indexOf('?') >= 0 ? '&' : '?';
      global.location.replace(cleaned + sep + 'kui_v=' + encodeURIComponent(parentVersion));
    });
    return true;
  }

  function post(type, payload, requestId) {
    var parent = getParent();
    if (!parent) { return false; }
    var message = { __kui: true, type: type, requestId: requestId || '', payload: payload || {} };
    try {
      // 面向 file:// 与任意 host，父页面 origin 无法预知，故用 '*'；同源部署可收紧
      parent.postMessage(message, '*');
      return true;
    } catch (e) {
      return false;
    }
  }

  var requestSeq = 0;
  var pending = {};

  function request(type, payload, timeout) {
    var parent = getParent();
    if (!parent) { return Promise.reject(new Error('not-framed')); }
    requestSeq += 1;
    var requestId = 'kfr' + requestSeq + '-' + Date.now().toString(36);
    return new Promise(function (resolve, reject) {
      pending[requestId] = { resolve: resolve, reject: reject, timer: null };
      if (!post(type, payload, requestId)) {
        delete pending[requestId];
        reject(new Error('post-failed'));
        return;
      }
      pending[requestId].timer = global.setTimeout(function () {
        var item = pending[requestId];
        if (item) {
          delete pending[requestId];
          item.reject(new Error('timeout'));
        }
      }, timeout || 60000);
    });
  }

  function settle(requestId, ok, value) {
    var item = pending[requestId];
    if (!item) { return false; }
    delete pending[requestId];
    if (item.timer) { global.clearTimeout(item.timer); }
    if (ok) { item.resolve(value); }
    else { item.reject(value instanceof Error ? value : new Error(String(value || 'failed'))); }
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* 事件                                                                */
  /* ------------------------------------------------------------------ */

  var listeners = {};

  function on(name, fn) {
    if (!name || typeof fn !== 'function') { return api; }
    if (!listeners[name]) { listeners[name] = []; }
    listeners[name].push(fn);
    return api;
  }

  function off(name, fn) {
    if (!name) { listeners = {}; return api; }
    var list = listeners[name];
    if (!list) { return api; }
    if (!fn) { delete listeners[name]; return api; }
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i] === fn) { list.splice(i, 1); }
    }
    if (!list.length) { delete listeners[name]; }
    return api;
  }

  function one(name, fn) {
    function wrapper() {
      off(name, wrapper);
      return fn.apply(api, arguments);
    }
    return on(name, wrapper);
  }

  function emit(name, payload) {
    var list = listeners[name];
    var results = [];
    if (list) {
      var copy = list.slice();
      for (var i = 0; i < copy.length; i++) {
        (function (fn) {
          results.push(safe(function () { return fn(payload); }, undefined));
        })(copy[i]);
      }
    }
    // 全局事件总线（存在时）
    safe(function () {
      if (K.events && typeof K.events.emit === 'function') { K.events.emit('frame:' + name, payload); }
    });
    return results;
  }

  /* ------------------------------------------------------------------ */
  /* 主题应用                                                            */
  /* ------------------------------------------------------------------ */

  var themeState = { id: '', name: '', scheme: '', tokens: null, art: null };

  // 业务页装饰层宿主：复用 base.css 的 .kui-art 容器（theme-art 会自行填充）
  function ensureArtHost() {
    return safe(function () {
      var host = document.querySelector('.kui-art');
      if (!host) {
        host = document.createElement('div');
        host.className = 'kui-art';
        host.setAttribute('aria-hidden', 'true');
        var parent = document.body || document.documentElement;
        if (parent) { parent.insertBefore(host, parent.firstChild || null); }
      }
      return host;
    }, null);
  }

  // 直接写 token 变量（theme.js 的 applyTokens 缺失时的兜底）
  function writeTokens(tokens) {
    if (!tokens) { return; }
    var applied = safe(function () {
      if (K.theme && typeof K.theme.applyTokens === 'function') {
        K.theme.applyTokens(tokens);
        return true;
      }
      return false;
    }, false);
    if (applied) { return; }
    var root = document.documentElement;
    if (!root || !root.style) { return; }
    Object.keys(tokens).forEach(function (key) {
      var value = tokens[key];
      if (value === undefined || value === null) { return; }
      var name = key.indexOf('--') === 0 ? key : ('--kui-' + String(key).replace(/^--?kui-/, ''));
      safe(function () { root.style.setProperty(name, String(value)); });
    });
  }

  /**
   * 应用父级下发的主题。
   * 优先级：注册表里的主题整应用（含 tokens/scheme/art）→ 直接写 tokens → 手写 CSS 变量。
   * 注意：core/theme.js 没有 tokens() 方法，且 apply() 受 persist/broadcast 影响，
   * iframe 内一律 persist:false、broadcast:false、transition:false，防止与父级动画叠加或回环广播。
   */
  function applyTheme(payload) {
    payload = payload || {};
    var theme = payload.theme || payload;
    var id = theme.id || payload.id || '';
    var tokens = theme.tokens || payload.tokens || null;
    var scheme = theme.scheme || payload.scheme || '';
    var art = theme.art || payload.art || null;
    var name = theme.name || payload.name || '';
    var applied = false;

    if (id) {
      themeState.id = id;
      applied = safe(function () {
        if (!K.theme || typeof K.theme.apply !== 'function') { return false; }
        var known = typeof K.theme.has === 'function' ? !!K.theme.has(id) : true;
        if (!known) { return false; }
        K.theme.apply(id, { persist: false, broadcast: false, transition: false, silent: true });
        var nowId = typeof K.theme.currentId === 'function' ? K.theme.currentId() : '';
        return !!(nowId ? nowId === id : true);
      }, false);
    }

    if (!applied && tokens) {
      themeState.tokens = tokens;
      writeTokens(tokens);
    }
    if (name) { themeState.name = name; }
    if (!applied && art && K.themeArt) {
      // 父级把装饰层配置一起下发：本地重绘，保证未注册主题时 iframe 内也有 art
      safe(function () {
        var host = ensureArtHost();
        if (host && typeof K.themeArt.render === 'function') {
          K.themeArt.render(art, host);
          themeState.art = art;
        }
      });
    }
    if (scheme) { themeState.scheme = scheme; }
    safe(function () {
      var root = document.documentElement;
      if (!root || !root.setAttribute) { return; }
      if (themeState.id) { root.setAttribute('data-kui-theme', themeState.id); }
      if (themeState.scheme) { root.setAttribute('data-kui-scheme', themeState.scheme); }
    });
    return api;
  }

  function currentTheme() {
    var theme = {
      id: themeState.id,
      name: themeState.name,
      scheme: themeState.scheme,
      tokens: themeState.tokens || {}
    };
    safe(function () {
      if (K.theme && typeof K.theme.current === 'function') {
        var cur = K.theme.current();
        var id = typeof cur === 'string' ? cur : (cur && cur.id);
        if (id) { theme.id = id; }
        if (cur && typeof cur === 'object') {
          if (cur.name) { theme.name = cur.name; }
          if (cur.scheme) { theme.scheme = cur.scheme; }
          if (cur.tokens && typeof cur.tokens === 'object' && Object.keys(cur.tokens).length) {
            theme.tokens = cur.tokens;
          }
        }
      }
      if (!theme.tokens || !Object.keys(theme.tokens).length) {
        // core/theme.js 没有 tokens()（旧死分支已移除），只有 currentTokens()/tokensOf(id)
        if (K.theme && typeof K.theme.currentTokens === 'function') {
          theme.tokens = K.theme.currentTokens() || {};
        } else if (K.theme && typeof K.theme.tokensOf === 'function' && theme.id) {
          theme.tokens = K.theme.tokensOf(theme.id) || {};
        } else if (K.theme && K.theme.tokens && typeof K.theme.tokens === 'object') {
          theme.tokens = K.theme.tokens;
        }
      }
    });
    return theme;
  }

  /* ------------------------------------------------------------------ */
  /* 状态                                                                */
  /* ------------------------------------------------------------------ */

  var state = {
    inited: false,
    tabId: '',
    title: '',
    params: {},
    app: {},
    initPayload: null,
    dirty: false,
    readyQueued: [],
    booted: false,
    readyTries: 0,
    readyTimer: 0,
    heightAuto: false,
    resizeTimer: 0
  };

  /* ------------------------------------------------------------------ */
  /* 接收父级消息                                                        */
  /* ------------------------------------------------------------------ */

  function handleMessage(event) {
    var parent = getParent();
    if (!parent) { return; }
    if (!event || event.source !== parent) { return; }   // 严格来源校验
    var data = event && event.data;
    if (!data || typeof data !== 'object' || data.__kui !== true) { return; }
    var type = data.type || '';
    var payload = data.payload || {};

    if (type === 'tab:init') {
      state.inited = true;
      state.tabId = payload.tabId || '';
      state.title = payload.title || document.title || '';
      state.params = payload.params || {};
      state.app = payload.app || {};
      state.initPayload = payload;
      applyTheme(payload.theme || payload);
      if (state.title) { document.title = state.title; }
      emit('init', payload);
      emit('ready', payload);
      flushReadyQueue(payload);
      // 版本不一致（旧缓存文档）→ 自动带版本号刷新，刷新后本次逻辑不会继续执行
      selfHealVersion(payload.parentVersion);
      return;
    }
    if (type === 'tab:before-close') {
      handleBeforeClose();
      return;
    }
    if (type === 'tab:refresh') {
      emit('refresh', payload);
      safe(function () {
        if (K.events && typeof K.events.emit === 'function') { K.events.emit('frame:refresh', payload); }
      });
      return;
    }
    if (type === 'theme:change' || type === 'theme:apply') {
      applyTheme(payload);
      emit('theme', { id: themeState.id, name: themeState.name, tokens: themeState.tokens || {} });
      return;
    }
    if (type === 'tab:activate') {
      emit('activate', payload);
      return;
    }
    if (type === 'frame:dialog-result') {
      settle(data.requestId, true, payload && payload.value !== undefined ? payload.value : null);
      return;
    }
    if (type === 'frame:action') {
      // 可选：父级要求业务页执行某个动作（扩展消息）
      safe(function () {
        if (K.actions && typeof K.actions.run === 'function' && payload && payload.action) {
          K.actions.run(payload.action, makeCtx(payload));
        }
      });
      return;
    }
  }

  /* tab:before-close：调用业务页的 before-close 监听，回执 tab:close-result{ok} */
  function handleBeforeClose() {
    var list = listeners['before-close'] || [];
    if (!list.length) {
      post('tab:close-result', { ok: true });
      return;
    }
    var results = [];
    var pendingAsync = [];
    list.slice().forEach(function (fn) {
      var result = safe(function () { return fn(); }, undefined);
      if (result && typeof result.then === 'function') {
        pendingAsync.push(result);
      } else {
        results.push(result);
      }
    });
    function finish(values) {
      var blocked = false;
      values.forEach(function (value) { if (value === false) { blocked = true; } });
      post('tab:close-result', { ok: !blocked });
    }
    if (pendingAsync.length) {
      Promise.all(pendingAsync).then(function (values) {
        finish(results.concat(values));
      }, function () {
        // 异步检查本身失败时不阻塞关闭
        post('tab:close-result', { ok: true });
      });
    } else {
      finish(results);
    }
  }

  function makeCtx(extra) {
    var ctx = {
      scope: 'frame',
      tab: { id: state.tabId, title: state.title, params: state.params },
      data: state.params || {},
      KUI: K,
      emit: function (name, detail) {
        safe(function () {
          if (K.events && typeof K.events.emit === 'function') { K.events.emit(name, detail); }
        });
      }
    };
    if (extra && typeof extra === 'object') {
      Object.keys(extra).forEach(function (key) { ctx[key] = extra[key]; });
    }
    return ctx;
  }

  /* ------------------------------------------------------------------ */
  /* ready / 初始化                                                      */
  /* ------------------------------------------------------------------ */

  function flushReadyQueue(payload) {
    var list = state.readyQueued;
    state.readyQueued = [];
    list.forEach(function (fn) {
      safe(function () { fn(payload); });
    });
  }

  function ready(options) {
    var callback = null;
    if (typeof options === 'function') {
      callback = options;
      options = null;
    } else if (options && typeof options === 'object') {
      if (typeof options.title === 'string') { setTitle(options.title); }
      if (options.dirty !== undefined) { setDirty(!!options.dirty); }
      if (typeof options.onReady === 'function') { callback = options.onReady; }
    }
    if (callback) {
      if (state.inited) { safe(function () { callback(state.initPayload); }); }
      else { state.readyQueued.push(callback); }
    }
    // 主动声明就绪：父级收到后会回 tab:init（重复发送是幂等的）
    sendFrameReady();
    return api;
  }

  function sendFrameReady() {
    if (!isFramed()) { return; }
    state.readyTries += 1;
    post('frame:ready', { title: document.title || state.title || '' });
    if (!state.inited && state.readyTries <= 5) {
      if (state.readyTimer) { global.clearTimeout(state.readyTimer); }
      state.readyTimer = global.setTimeout(sendFrameReady, 600);
    }
  }

  function boot() {
    if (state.booted) { return; }
    state.booted = true;
    global.addEventListener('message', handleMessage, false);
    // 页面已渲染完成，主动告诉父级就绪
    sendFrameReady();
    // 独立打开（无父级）时仅应用 base.css 默认 token，不报错
    if (!isFramed()) {
      safe(function () { flushReadyQueue(null); });
    }
    // 自动高度（默认关闭，heightAuto 打开后开启）
    safe(function () {
      global.addEventListener('resize', function () {
        if (!state.heightAuto) { return; }
        if (state.resizeTimer) { global.clearTimeout(state.resizeTimer); }
        state.resizeTimer = global.setTimeout(function () { height(); }, 120);
      }, false);
    });
  }

  /* ------------------------------------------------------------------ */
  /* 对外 API                                                            */
  /* ------------------------------------------------------------------ */

  function setTitle(title) {
    state.title = title === undefined || title === null ? '' : String(title);
    if (state.title) { document.title = state.title; }
    post('frame:title', { title: state.title });
    return api;
  }

  function setDirty(dirty) {
    state.dirty = !!dirty;
    safe(function () {
      if (global.document && global.document.body) {
        if (state.dirty) { global.document.body.classList.add('is-dirty'); }
        else { global.document.body.classList.remove('is-dirty'); }
      }
    });
    post('frame:dirty', { dirty: state.dirty });
    return api;
  }

  function isDirty() {
    return !!state.dirty;
  }

  function close() {
    post('frame:close', {});
    return true;
  }

  function refresh() {
    // 语义：重新加载当前业务页。iframe 元素本身不变（标签保活规则只禁止切换时改 src）。
    safe(function () { global.location.reload(); });
    return true;
  }

  function normalizeTab(tab) {
    if (!tab) { return null; }
    if (typeof tab === 'string') {
      return { id: tab, title: tab, url: tab };
    }
    var out = {};
    Object.keys(tab).forEach(function (key) { out[key] = tab[key]; });
    if (!out.id) { out.id = out.url || ('tab-' + Date.now().toString(36)); }
    if (!out.title) { out.title = out.id; }
    return out;
  }

  function navigate(tab) {
    var normalized = normalizeTab(tab);
    if (!normalized) { return false; }
    post('frame:navigate', { tab: normalized });
    return true;
  }

  function parseQuery() {
    var result = {};
    safe(function () {
      var search = global.location.search || '';
      if (!search) { return; }
      var params = new URLSearchParams(search);
      params.forEach(function (value, key) { result[key] = value; });
    });
    return result;
  }

  function getParams() {
    var query = parseQuery();
    var merged = {};
    Object.keys(query).forEach(function (key) { merged[key] = query[key]; });
    var tabParams = state.params || {};
    Object.keys(tabParams).forEach(function (key) { merged[key] = tabParams[key]; });
    merged.tabId = state.tabId;
    merged.title = state.title;
    return merged;
  }

  function height(value) {
    var h = value;
    if (h === undefined || h === null) {
      h = safe(function () {
        return Math.max(
          document.documentElement ? document.documentElement.scrollHeight : 0,
          document.body ? document.body.scrollHeight : 0,
          document.body ? document.body.offsetHeight : 0
        );
      }, 0);
    }
    if (!h) { return 0; }
    post('frame:height', { height: Math.ceil(h) });
    return Math.ceil(h);
  }

  function heightAuto(enable) {
    state.heightAuto = enable !== false;
    if (state.heightAuto) {
      safe(function () {
        if (typeof global.MutationObserver === 'function' && document.body) {
          var mo = new global.MutationObserver(function () {
            if (state.resizeTimer) { global.clearTimeout(state.resizeTimer); }
            state.resizeTimer = global.setTimeout(function () { height(); }, 120);
          });
          mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
        }
      });
      height();
    }
    return api;
  }

  /* ------------------------------ toast ----------------------------- */

  function toast(options) {
    var payload;
    if (typeof options === 'string') {
      payload = { message: options };
    } else if (options && typeof options === 'object') {
      payload = {};
      Object.keys(options).forEach(function (key) { payload[key] = options[key]; });
    } else {
      payload = {};
    }
    // 优先交给主框架统一呈现（跨 iframe 的 toast 层级更高、不进页面布局）
    var sent = post('frame:toast', payload);
    if (!sent) {
      // 独立打开：若本页恰好加载了 toast.js 则本地显示，否则静默降级
      safe(function () {
        if (K.toast && typeof K.toast.show === 'function') { K.toast.show(payload); }
      });
    }
    return payload.id || state.tabId || '';
  }

  ['info', 'success', 'warning', 'error'].forEach(function (type) {
    toast[type] = function (message, extra) {
      var options;
      if (message && typeof message === 'object') {
        options = message;
        if (!options.type) { options.type = type; }
      } else {
        options = { message: message, type: type };
      }
      if (extra && typeof extra === 'object') {
        Object.keys(extra).forEach(function (key) { options[key] = extra[key]; });
      }
      return toast(options);
    };
  });
  toast.message = function (message, extra) { return toast.info(message, extra); };
  toast.show = toast;
  toast.notify = function (options) {
    var payload = (options && typeof options === 'object') ? options : { message: options };
    payload.mode = 'notification';
    return toast(payload);
  };

  /* ------------------------------ dialog ---------------------------- */

  function fallbackDialog(method, config) {
    config = config || {};
    var message = config.message || config.title || '';
    return safe(function () {
      if (method === 'confirm') { return Promise.resolve(!!global.confirm(message)); }
      if (method === 'prompt') { return Promise.resolve(global.prompt(message, config.defaultValue || '')); }
      if (method === 'alert') { global.alert(message); return Promise.resolve(undefined); }
      return Promise.resolve(null);
    }, Promise.resolve(null));
  }

  function openDialog(method, config) {
    config = config || {};
    if (!isFramed()) { return fallbackDialog(method, config); }
    return request('frame:dialog', { method: method, config: config }, 0).then(function (value) {
      if (method === 'confirm') { return !!value; }
      if (method === 'alert') { return undefined; }
      return value;
    });
  }

  var dialog = {
    alert: function (config) {
      return openDialog('alert', typeof config === 'string' ? { message: config } : config);
    },
    confirm: function (config) {
      return openDialog('confirm', typeof config === 'string' ? { message: config } : config);
    },
    prompt: function (config) {
      return openDialog('prompt', typeof config === 'string' ? { message: config } : config);
    },
    form: function (config) {
      return openDialog('form', config);
    },
    custom: function (config) {
      return openDialog('custom', config);
    },
    open: function (config) {
      var method = (config && config.type) || 'custom';
      return openDialog(method, config);
    },
    close: function () { return false; },
    closeAll: function () { return false; }
  };

  /* ------------------------------ API ------------------------------- */

  /* 在 iframe 内请求父级切换全局主题：父级应用后广播回所有 iframe（整壳 + 标签同步） */
  function requestTheme(id, extra) {
    extra = extra || {};
    if (!id) { return false; }
    var payload = {
      id: id,
      name: extra.name || '',
      scheme: extra.scheme || '',
      tokens: extra.tokens || null,
      art: extra.art || null
    };
    var framed = false;
    safe(function () { framed = isFramed(); }, false);
    if (framed) {
      safe(function () { post('frame:theme', payload); });
    }
    // 本地先行应用，避免等待父级广播造成闪烁
    safe(function () {
      if (K.theme && typeof K.theme.apply === 'function') {
        var has = typeof K.theme.has === 'function' ? K.theme.has(id) : true;
        if (has) { K.theme.apply(id, { persist: true }); }
      }
    });
    return true;
  }

  var api = {
    version: currentVersion() || '1.3.7',
    /* 生命周期 */
    ready: ready,
    boot: boot,
    isFramed: isFramed,
    /* 标题 / 脏标记 */
    setTitle: setTitle,
    getTitle: function () { return state.title; },
    setDirty: setDirty,
    isDirty: isDirty,
    /* 提醒 */
    toast: toast,
    notify: toast.notify,
    /* 弹窗 */
    dialog: dialog,
    /* 导航 */
    close: close,
    refresh: refresh,
    navigate: navigate,
    getParams: getParams,
    /* 主题 */
    theme: currentTheme,
    themeId: function () {
      var id = themeState.id;
      if (!id) {
        safe(function () {
          if (K.theme && typeof K.theme.currentId === 'function') { id = K.theme.currentId(); }
        });
      }
      return id || '';
    },
    onTheme: function (fn) { return on('theme', fn); },
    applyTheme: applyTheme,
    /* 主题切换：请求父级同步（内嵌时）并本地应用 */
    setTheme: requestTheme,
    requestTheme: requestTheme,
    /* 事件 */
    on: on,
    off: off,
    one: one,
    emit: emit,
    /* 高度 */
    height: height,
    heightAuto: heightAuto,
    /* 状态查询 */
    getTab: function () {
      return { id: state.tabId, title: state.title, params: state.params, app: state.app, inited: state.inited };
    },
    /* 内部：请求父级执行动作（扩展能力，动作由父页面注册） */
    action: function (action, params) {
      return request('frame:action', { action: action, params: params || {} }, 30000).catch(function () {
        return null;
      });
    }
  };

  K.frame = api;

  /* ------------------------------------------------------------------ */
  /* 启动                                                                */
  /* ------------------------------------------------------------------ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, false);
  } else {
    boot();
  }
})(window);

/*!
 * KurumiUI · core/theme.js
 * ---------------------------------------------------------------
 * 主题管理器：把 themes.json 里的 tokens 写成 :root 上的 CSS 变量，
 * 并调用 KUI.themeArt 渲染装饰层。主题只由「tokens + art 配置」表达，
 * 代码里不写死任何主题专属颜色/选择器（契约 §13）。
 *
 * 关键行为：
 *   - 切换主题时先清除上一套主题写过、且新主题没有的 token，
 *     避免残留（base.css 的 :root 默认值会重新生效）
 *   - 自动持久化到 localStorage（可关）
 *   - 自动向页面内所有 iframe 广播 theme:apply（弹窗与业务页同步换肤）
 *   - 支持 URL ?kuiTheme=starry 快速预览
 */
(function (global) {
  'use strict';

  var KUI = global.KUI = global.KUI || {};

  var DEFAULT_STORAGE_KEY = 'kui-theme';
  var ART_HOST_ID = 'kui-art-host';
  var TRANSITION_MS = 340;   // 与 base.css 的 .kui-theme-transition 过渡时长配套
  var transitionTimer = null;

  var state = {
    themes: [],
    byId: Object.create(null),
    defaultId: 'kurumi',
    currentId: null,
    storageKey: DEFAULT_STORAGE_KEY,
    persist: true,
    rootEl: null,
    artHost: null,
    art: null,
    artConfig: null,
    appliedTokens: Object.create(null),   // 当前写到 :root 的 token 名
    bus: null
  };

  function root() {
    if (state.rootEl) return state.rootEl;
    if (KUI.env.isBrowser) return document.documentElement;
    return null;
  }

  /** token 名规范化：bg-0 -> --kui-bg-0；--x -> --x；kui-bg-0 -> --kui-bg-0 */
  function tokenName(key) {
    var k = String(key || '').trim();
    if (!k) return '';
    if (k.indexOf('--') === 0) return k;
    if (k.indexOf('kui-') === 0) return '--' + k;
    return '--kui-' + k;
  }

  function normalizeTheme(raw, index) {
    if (!raw || typeof raw !== 'object') return null;
    var id = raw.id || ('theme-' + index);
    var tokens = raw.tokens || {};
    var clean = {};
    for (var k in tokens) {
      if (!Object.prototype.hasOwnProperty.call(tokens, k)) continue;
      var name = tokenName(k);
      if (!name) continue;
      clean[name] = tokens[k] === null || tokens[k] === undefined ? '' : String(tokens[k]);
    }
    var scheme = raw.scheme || (String(clean['--kui-bg-0'] || '').match(/^#(f|e|d|c)/i) ? 'light' : 'dark');
    return {
      id: id,
      name: raw.name || id,
      desc: raw.desc || '',
      scheme: scheme,
      tokens: clean,
      art: raw.art || null,
      preview: raw.preview || null,
      meta: raw.meta || null
    };
  }

  function clearAppliedTokens() {
    var el = root();
    if (!el || !el.style) return;
    for (var name in state.appliedTokens) {
      if (!Object.prototype.hasOwnProperty.call(state.appliedTokens, name)) continue;
      try { el.style.removeProperty(name); } catch (e) { /* noop */ }
    }
    state.appliedTokens = Object.create(null);
  }

  function writeTokens(tokens) {
    var el = root();
    if (!el || !el.style) return;
    var next = Object.create(null);
    for (var name in tokens) {
      if (!Object.prototype.hasOwnProperty.call(tokens, name)) continue;
      var value = tokens[name];
      if (value === null || value === undefined || value === '') continue;
      next[name] = true;
      try {
        el.style.setProperty(name, String(value));
      } catch (e) {
        KUI.warn('写入 CSS 变量失败: ' + name, e);
      }
    }
    // 清除新主题未定义、但旧主题写过的变量
    for (var oldName in state.appliedTokens) {
      if (!Object.prototype.hasOwnProperty.call(state.appliedTokens, oldName)) continue;
      if (next[oldName]) continue;
      try { el.style.removeProperty(oldName); } catch (e2) { /* noop */ }
    }
    state.appliedTokens = next;
  }

  function ensureArtHost(customHost) {
    if (customHost) return customHost;
    if (state.artHost && state.artHost.parentNode) return state.artHost;
    if (!KUI.env.isBrowser) return null;
    var existing = document.getElementById(ART_HOST_ID);
    if (existing) { state.artHost = existing; return existing; }
    var host = document.createElement('div');
    host.id = ART_HOST_ID;
    host.className = 'kui-art-host';
    host.setAttribute('aria-hidden', 'true');
    var mount = document.body || document.documentElement;
    mount.insertBefore(host, mount.firstChild);
    state.artHost = host;
    return host;
  }

  function renderArt(theme, opts) {
    opts = opts || {};
    if (state.art && typeof state.art.destroy === 'function') {
      try { state.art.destroy(); } catch (e) { /* noop */ }
      state.art = null;
    }
    state.art = null;
    state.artConfig = null;
    if (!theme || !theme.art) return;
    if (!KUI.themeArt || typeof KUI.themeArt.render !== 'function') return;
    var host = opts.artHost !== undefined ? opts.artHost : ensureArtHost();
    if (!host) return;
    try {
      state.art = KUI.themeArt.render(theme.art, host);
      state.artConfig = theme.art;
    } catch (e) {
      KUI.error('主题装饰层渲染失败: ' + theme.id, e);
    }
  }

  function persist(themeId) {
    if (!state.persist || !KUI.env.isBrowser) return;
    try {
      if (global.localStorage) global.localStorage.setItem(state.storageKey, themeId);
    } catch (e) { /* 隐身模式等场景忽略 */ }
  }
  function readPersisted() {
    if (!state.persist || !KUI.env.isBrowser) return null;
    try {
      return global.localStorage ? global.localStorage.getItem(state.storageKey) : null;
    } catch (e) {
      return null;
    }
  }
  function readFromUrl() {
    if (!KUI.env.isBrowser || !global.location) return null;
    var search = global.location.search || '';
    var m = search.match(/[?&]kuiTheme=([^&#]+)/);
    if (!m) return null;
    try {
      return decodeURIComponent(m[1]);
    } catch (e) {
      return m[1];
    }
  }

  function broadcast(payload) {
    if (!KUI.env.isBrowser || !document.querySelectorAll) return;
    var frames = document.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) {
      try {
        var win = frames[i].contentWindow;
        if (win && win.postMessage) {
          win.postMessage({
            __kui: true,
            type: 'theme:apply',
            payload: payload
          }, '*');
        }
      } catch (e) {
        // 跨域 iframe：静默跳过（同源 file:// 也会走到这里）
      }
    }
  }

  var theme = {
    /* ---------------- 数据 ---------------- */

    /**
     * 载入主题数据：{ default:'kurumi', themes:[...] } 或直接数组
     * 返回载入的主题数量。
     */
    load: function (data) {
      var list = [];
      var defaultId = null;
      if (Array.isArray(data)) {
        list = data;
      } else if (data && Array.isArray(data.themes)) {
        list = data.themes;
        defaultId = data['default'] || data.defaultId || null;
      } else if (data && Array.isArray(data.list)) {
        list = data.list;
        defaultId = data['default'] || null;
      }
      state.themes = [];
      state.byId = Object.create(null);
      for (var i = 0; i < list.length; i++) {
        var t = normalizeTheme(list[i], i);
        if (!t) continue;
        state.themes.push(t);
        state.byId[t.id] = t;
      }
      if (defaultId && state.byId[defaultId]) state.defaultId = defaultId;
      else if (state.themes.length) state.defaultId = state.themes[0].id;
      theme._emit('load', { count: state.themes.length, defaultId: state.defaultId });
      return state.themes.length;
    },

    register: function (raw) {
      var t = normalizeTheme(raw, state.themes.length);
      if (!t) return null;
      if (state.byId[t.id]) {
        var idx = state.themes.indexOf(state.byId[t.id]);
        if (idx !== -1) state.themes.splice(idx, 1);
      }
      state.themes.push(t);
      state.byId[t.id] = t;
      theme._emit('register', t);
      return t;
    },

    /** 主题清单（轻量，给选择器用） */
    list: function () {
      var out = [];
      for (var i = 0; i < state.themes.length; i++) {
        var t = state.themes[i];
        out.push({
          id: t.id,
          name: t.name,
          desc: t.desc,
          scheme: t.scheme,
          preview: t.preview,
          tokens: t.tokens
        });
      }
      return out;
    },

    ids: function () { return state.themes.map(function (t) { return t.id; }); },
    get: function (id) { return state.byId[id] || null; },
    has: function (id) { return !!state.byId[id]; },
    count: function () { return state.themes.length; },
    defaultId: function () { return state.defaultId; },

    current: function () { return state.currentId ? state.byId[state.currentId] : null; },
    currentId: function () { return state.currentId; },
    currentTokens: function () {
      var t = theme.current();
      return t ? t.tokens : {};
    },

    /**
     * 按 id 取某套主题的 token 对象（浅拷贝，调用方可安全改动）。
     * 供 iframe 侧在只收到 theme:apply 的 id、没有 tokens 载荷时回查；
     * 省略 id 时返回当前主题的 token，找不到时返回 null。
     */
    tokensOf: function (id) {
      var t = id ? state.byId[id] : theme.current();
      if (!t || !t.tokens) return null;
      var out = {};
      for (var k in t.tokens) {
        if (Object.prototype.hasOwnProperty.call(t.tokens, k)) out[k] = t.tokens[k];
      }
      return out;
    },

    /* ---------------- 应用 ---------------- */

    /**
     * 应用主题。
     * apply('starry') / apply('starry', {silent:true, persist:false, artHost:el})
     *
     * silent:true 表示「安静应用」：不写 localStorage、不向 iframe 回播 theme:apply、
     * 不派发 DOM 事件 kui:themechange（内部 theme.on('change') / KUI.bus 仍会触发，
     * 供页面内组件更新 UI）。iframe 被父级驱动时应使用
     * { silent:true, persist:false, broadcast:false }，避免回环与污染用户选择。
     * 返回实际生效的主题对象；找不到时回退默认主题并返回默认主题。
     */
    apply: function (id, opts) {
      opts = opts || {};
      var t = id ? state.byId[id] : null;
      if (!t) {
        if (id) KUI.warnOnce('theme-missing:' + id, '主题不存在: ' + id);
        t = state.byId[state.defaultId] || state.themes[0] || null;
      }
      if (!t) {
        KUI.warnOnce('theme-empty', '尚未载入任何主题（请先 theme.load(themesJson)）');
        return null;
      }
      var previousId = state.currentId;
      state.currentId = t.id;

      writeTokens(t.tokens);

      var el = root();
      if (el && el.setAttribute) {
        el.setAttribute('data-kui-theme', t.id);
        el.setAttribute('data-kui-scheme', t.scheme || 'dark');
      }

      renderArt(t, opts);

      if (opts.persist !== false && !opts.silent) persist(t.id);

      // 主题切换过渡：短暂给 <html> 挂 .kui-theme-transition（base.css 第 11 节）
      if (KUI.env.isBrowser && el && el.classList && opts.transition !== false) {
        try {
          el.classList.add('kui-theme-transition');
          if (transitionTimer) clearTimeout(transitionTimer);
          transitionTimer = setTimeout(function () {
            try { el.classList.remove('kui-theme-transition'); } catch (e2) { /* noop */ }
            transitionTimer = null;
          }, TRANSITION_MS);
        } catch (e) { /* noop */ }
      }

      var detail = {
        id: t.id,
        theme: t,
        tokens: t.tokens,
        scheme: t.scheme,
        previousId: previousId
      };
      theme._emit('change', detail);
      KUI.bus.emit('theme:change', detail);
      if (!opts.silent && KUI.env.isBrowser) {
        try { KUI.trigger(root(), 'kui:themechange', detail); } catch (e) { /* noop */ }
      }
      if (opts.broadcast !== false && !opts.silent) {
        broadcast({
          id: t.id,
          name: t.name,
          desc: t.desc,
          scheme: t.scheme,
          tokens: t.tokens,
          art: t.art,
          defaultId: state.defaultId
        });
      }
      return t;
    },

    /** 只写 tokens 不起用主题（iframe 内同步用） */
    applyTokens: function (tokens) {
      if (!tokens) return;
      var clean = {};
      for (var k in tokens) {
        if (!Object.prototype.hasOwnProperty.call(tokens, k)) continue;
        var name = tokenName(k);
        if (name) clean[name] = tokens[k];
      }
      writeTokens(clean);
    },

    next: function () {
      var ids = theme.ids();
      if (!ids.length) return null;
      var idx = ids.indexOf(state.currentId);
      return theme.apply(ids[(idx + 1) % ids.length]);
    },
    prev: function () {
      var ids = theme.ids();
      if (!ids.length) return null;
      var idx = ids.indexOf(state.currentId);
      return theme.apply(ids[(idx - 1 + ids.length) % ids.length]);
    },

    /** 在深色/浅色主题之间切换（按 scheme 分组） */
    toggleScheme: function () {
      var ids = theme.ids();
      if (!ids.length) return null;
      var cur = theme.current();
      var targetScheme = cur && cur.scheme === 'light' ? 'dark' : 'light';
      for (var i = 0; i < ids.length; i++) {
        var t = state.byId[ids[i]];
        if (t && t.scheme === targetScheme) return theme.apply(t.id);
      }
      return theme.next();
    },

    /* ---------------- 初始化辅助 ---------------- */

    /** 解析应使用的主题：early(pre-paint) > URL > localStorage > default */
    resolveInitial: function (fallbackId) {
      var early = '';
      try { early = (typeof window !== 'undefined' && window.__KUI_EARLY_THEME__) || ''; } catch (e) { early = ''; }
      if (early && state.byId[early]) return early;
      var fromUrl = readFromUrl();
      if (fromUrl && state.byId[fromUrl]) return fromUrl;
      var stored = readPersisted();
      if (stored && state.byId[stored]) return stored;
      if (fallbackId && state.byId[fallbackId]) return fallbackId;
      if (state.byId[state.defaultId]) return state.defaultId;
      return theme.ids()[0] || null;
    },

    /** 一步到位：载入数据 + 选中初始主题并应用 */
    init: function (data, opts) {
      opts = opts || {};
      theme.load(data);
      if (opts.storageKey) state.storageKey = opts.storageKey;
      if (opts.persist === false) state.persist = false;
      var initial = opts.id || theme.resolveInitial(opts.fallbackId);
      return theme.apply(initial, opts);
    },

    /* ---------------- 配置 ---------------- */

    setRoot: function (el) { state.rootEl = el || null; return theme; },
    getRoot: function () { return root(); },
    setArtHost: function (el) { state.artHost = el || null; return theme; },
    getArtHost: function () { return ensureArtHost(); },
    setStorageKey: function (key) { state.storageKey = key || DEFAULT_STORAGE_KEY; return theme; },
    getStorageKey: function () { return state.storageKey; },
    setPersist: function (v) { state.persist = !!v; return theme; },
    clearPersisted: function () {
      if (!KUI.env.isBrowser) return;
      try { global.localStorage && global.localStorage.removeItem(state.storageKey); } catch (e) { /* noop */ }
    },

    /** 重新渲染装饰层（窗口尺寸变化 / 关闭动画时用） */
    refreshArt: function () {
      if (!state.currentId) return;
      renderArt(theme.current(), {});
    },

    /** 手动把当前主题推给所有 iframe（新 iframe 加载完成后调用） */
    broadcast: function () {
      var t = theme.current();
      if (!t) return;
      broadcast({ id: t.id, tokens: t.tokens, scheme: t.scheme, art: t.art });
    },

    /* ---------------- 事件 ---------------- */

    _bus: null,
    on: function (name, fn) { return theme._bus().on(name, fn); },
    once: function (name, fn) { return theme._bus().once(name, fn); },
    off: function (name, fn) { theme._bus().off(name, fn); },
    _bus_get: function () { return theme._bus(); },
    _emit: function (name, payload) { theme._bus().emit(name, payload); },
    _busReset: null
  };

  // 惰性创建事件总线（避免依赖加载顺序）
  theme._bus = function () {
    if (!theme._busInstance) theme._busInstance = KUI.events.create();
    return theme._busInstance;
  };

  KUI.theme = theme;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));

/*!
 * KurumiUI · core/config.js
 * ---------------------------------------------------------------
 * 配置加载器：统一读取「配置 JSON」，并做多环境兜底。
 *
 * 读取优先级：
 *   1) http(s) 环境：fetch 原始 JSON（改完刷新即生效）
 *   2) 失败或 file:// 环境：window.__KUI_BUNDLE__（tools/build-config.js 生成）
 *   3) 都不可用：返回 null，由调用方决定降级文案
 *
 * 逻辑名称 -> 文件路径：
 *   app      -> config/app.json
 *   text     -> config/text.json
 *   themes   -> src/themes.json
 *   demos/xx -> config/demos/xx.json
 */
(function (global) {
  'use strict';

  var KUI = global.KUI = global.KUI || {};

  var cache = Object.create(null);
  var inflight = Object.create(null);

  var PATHS = {
    app: 'config/app.json',
    text: 'config/text.json',
    themes: 'src/themes.json'
  };

  /* ------------------------------------------------------------------ */
  /* 站点根前缀：本文件通常位于 <root>/src/core/config.js                 */
  /*   - 根目录页面（index.html / standalone）：BASE = ''                */
  /*   - 子目录页面（pages/*.html）：BASE = '../'                        */
  /*   - 交给浏览器时用脚本 src 的绝对地址，fetch 才不会被页面路径带偏    */
  /* ------------------------------------------------------------------ */
  var BASE = '';
  (function detectBase() {
    if (!KUI.env || !KUI.env.isBrowser || typeof document === 'undefined') { return; }
    var src = '';
    var cur = document.currentScript;
    if (cur && cur.src) { src = String(cur.src); }
    if (!src && document.getElementsByTagName) {
      var list = document.getElementsByTagName('script');
      var i;
      for (i = list.length - 1; i >= 0; i--) {
        var v = list[i] && list[i].src ? String(list[i].src) : '';
        if (/core\/config\.js(?:[?#].*)?$/.test(v)) { src = v; break; }
      }
    }
    var idx = src.indexOf('/src/core/config.js');
    if (idx < 0) { idx = src.indexOf('src/core/config.js'); }
    if (idx >= 0) {
      BASE = src.slice(0, idx);
      if (BASE && BASE.charAt(BASE.length - 1) !== '/') { BASE += '/'; }
    }
  })();

  /** 逻辑路径 → 可 fetch 的地址（绝对 http/file 地址或带 BASE 的相对地址） */
  function resolveUrl(p) {
    var s = String(p || '');
    if (!s) { return s; }
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(s)) { return s; } // 已是绝对地址
    if (s.charAt(0) === '/') { return s; }
    return (BASE || '') + s;
  }

  function isHttp() {
    if (!KUI.env.isBrowser || !global.location) return false;
    return /^https?:$/.test(global.location.protocol || '');
  }

  function pathOf(name) {
    if (PATHS[name]) return PATHS[name];
    if (name && name.indexOf('demos/') === 0) {
      return 'config/demos/' + name.slice(6) + '.json';
    }
    // 其它直接当相对路径用
    return name;
  }

  function fromBundle(name) {
    var b = global.__KUI_BUNDLE__;
    // file:// 下若父窗口加载了 bundle.js，子页面也能复用（同源时可行，跨域会抛错则忽略）
    if (!b && global.parent && global.parent !== global) {
      try { b = global.parent.__KUI_BUNDLE__; } catch (e) { b = null; }
    }
    if (!b) return undefined;
    if (name === 'app') return b.app;
    if (name === 'text') return b.text;
    if (name === 'themes') return b.themes;
    if (name.indexOf('demos/') === 0) {
      return b.demos ? b.demos[name.slice(6)] : undefined;
    }
    return undefined;
  }

  function parseJson(text, name) {
    var raw = String(text || '').replace(/^\uFEFF/, '');
    try {
      return JSON.parse(raw);
    } catch (e) {
      KUI.error('配置 JSON 解析失败: ' + name + ' -> ' + (e && e.message ? e.message : e));
      return null;
    }
  }

  function fetchJson(url) {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('当前环境不支持 fetch，请使用 http 模式或加载 config/bundle.js'));
    }
    return fetch(url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
      return res.text();
    });
  }

  // Node / 测试环境：允许注入读取器（test/dom-stub 或 tools 使用）
  var injectedReader = null;

  var config = {
    /** 逻辑名 -> 路径 */
    paths: PATHS,
    pathOf: pathOf,
    /** 站点根前缀（'' / '../' / 'http://host/'） */
    base: function () { return BASE; },
    /** 逻辑路径 → 可 fetch 地址（子目录页面自动带上 BASE） */
    resolveUrl: resolveUrl,

    /** 注入同步读取器：fn(name, path) -> data|null （测试 / Node 环境用） */
    setReader: function (fn) { injectedReader = typeof fn === 'function' ? fn : null; return config; },

    /** 直接塞入配置（联机模式 / 测试用） */
    set: function (name, data) {
      cache[name] = data;
      return config;
    },

    /** 同步拿缓存（没有则返回 undefined） */
    peek: function (name) {
      if (name in cache) return cache[name];
      return undefined;
    },

    cache: cache,

    /** 统一读取入口，返回 Promise<data|null> */
    load: function (name, opts) {
      opts = opts || {};
      if (!name) return Promise.resolve(null);

      if (cache[name] !== undefined && !opts.force) {
        return Promise.resolve(cache[name]);
      }
      if (inflight[name] && !opts.force) return inflight[name];

      // 1) 注入读取器（Node/测试）
      if (injectedReader) {
        var injected = injectedReader(name, pathOf(name));
        cache[name] = injected;
        return Promise.resolve(injected);
      }

      // 2) 浏览器
      if (!KUI.env.isBrowser) {
        var b0 = fromBundle(name);
        cache[name] = b0 === undefined ? null : b0;
        return Promise.resolve(cache[name]);
      }

      var url = resolveUrl(pathOf(name));
      var tryFetch = isHttp() && typeof fetch === 'function';

      var p;
      if (tryFetch) {
        p = fetchJson(url).then(function (text) {
          var data = parseJson(text, name);
          if (data === null) throw new Error('解析失败');
          cache[name] = data;
          return data;
        })['catch'](function (err) {
          var b = fromBundle(name);
          if (b !== undefined) {
            if (opts.quiet !== true) {
              KUI.warnOnce('cfg-fallback:' + name,
                '读取 ' + url + ' 失败，已回退到 config/bundle.js（可能不是最新配置）: ' + (err && err.message ? err.message : err));
            }
            cache[name] = b;
            return b;
          }
          KUI.error('配置读取失败: ' + name + ' (' + (err && err.message ? err.message : err) + ')');
          cache[name] = null;
          return null;
        });
      } else {
        var b2 = fromBundle(name);
        if (b2 !== undefined) {
          cache[name] = b2;
          p = Promise.resolve(b2);
        } else {
          p = fetchJson(url).then(function (text) { return parseJson(text, name); })['catch'](function (err) {
            KUI.error('配置读取失败（' + url + '），且未找到 config/bundle.js 兜底。请运行 npm run build:config 或使用 npm start。');
            cache[name] = null;
            return null;
          });
        }
      }

      inflight[name] = p;
      p.then(function () { delete inflight[name]; }, function () { delete inflight[name]; });
      return p;
    },

    /** 批量读取：loadMany(['app','text','themes']) -> Promise<{app,text,themes}> */
    loadMany: function (names, opts) {
      var list = names || [];
      var jobs = list.map(function (n) { return config.load(n, opts); });
      return Promise.all(jobs).then(function (results) {
        var out = {};
        for (var i = 0; i < list.length; i++) out[list[i]] = results[i];
        return out;
      });
    },

    /**
     * 载入文案字典并注入 KUI.i18n。
     * 返回 Promise<dict|null>
     */
    loadText: function (opts) {
      return config.load('text', opts).then(function (dict) {
        if (dict && typeof dict === 'object') {
          KUI.i18n.set(dict);
        }
        return dict;
      });
    },

    /** 清空缓存（热更新用） */
    clear: function (name) {
      if (name) delete cache[name];
      else for (var k in cache) delete cache[k];
      return config;
    },

    /**
     * 从已加载的配置里按点路径取一个值（给组件留的"配置逃生口"）。
     *   KUI.config.get('dialog.frameUrl', '')
     *   KUI.config.get('app.menu.props.collapsed', false)   // 显式指定 app
     *   KUI.config.get('text.buttons.ok', '确定')            // 显式指定 text
     * 只读缓存，不触发加载。
     */
    get: function (dotPath, fallback) {
      var p = String(dotPath || '');
      if (!p) return fallback;
      var roots = [];
      var head = p.split('.')[0];
      if (head === 'app') { roots.push(['app', cache.app]); }
      else if (head === 'text') { roots.push(['text', cache.text]); }
      else if (head === 'themes') { roots.push(['themes', cache.themes]); }
      else { roots.push(['app', cache.app]); roots.push(['text', cache.text]); }
      for (var i = 0; i < roots.length; i++) {
        var data = roots[i][1];
        if (!data) continue;
        var key = head === roots[i][0] ? p.slice(head.length + 1) : p;
        var val = typeof KUI.utils.deepGet === 'function'
          ? KUI.utils.deepGet(data, key, undefined)
          : undefined;
        if (val !== undefined && val !== null) return val;
      }
      return fallback;
    },

    /** 当前是否 http(s) 模式（file:// 下无法 fetch JSON） */
    isHttp: isHttp
  };

  KUI.config = config;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));

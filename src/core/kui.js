/*!
 * KurumiUI · core/kui.js
 * ---------------------------------------------------------------
 * 框架核心：命名空间 / 工具函数 / 事件 / 文案字典 / DOM 助手 /
 *           动作（action）分发 / 上下文 / 节点渲染调度（renderNode / mount）
 *
 * 设计约束（见 docs/00-contract.md）：
 *   - 零依赖、无构建、传统 <script> 加载（非 ESM）
 *   - 兼容 Node 13.14 语法：不使用 ?. ?? ||= &&= ??= replaceAll .at() 等
 *   - 本文件只提供“渲染框架”的通用能力，不包含任何具体控件/组件
 *     （控件在 src/components/**，主题在 src/core/theme*.js）
 */
(function (global) {
  'use strict';

  var KUI = global.KUI = global.KUI || {};

  KUI.name = 'KurumiUI';
  // 版本号同时用于 iframe 的缓存穿透（tabs 会拼到子页面 URL 的 kui_v 参数上），
  // 每次发布 UI 修复时递增，避免旧 iframe 文档被浏览器缓存后继续跑旧版代码。
  KUI.version = '1.3.6';
  KUI.env = {
    isBrowser: typeof window !== 'undefined' && typeof document !== 'undefined',
    isNode: typeof process !== 'undefined' && !!(process.versions && process.versions.node),
    nodeVersion: (typeof process !== 'undefined' && process.versions && process.versions.node) || null
  };

  var toString = Object.prototype.toString;
  var hasOwn = Object.prototype.hasOwnProperty;

  /* =============================================================
   *  1. 日志
   * ============================================================= */
  var LOG_PREFIX = '[KurumiUI]';
  var warned = Object.create(null);

  KUI.log = function () {
    if (typeof console === 'undefined' || !console.log) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift(LOG_PREFIX);
    console.log.apply(console, args);
  };
  KUI.warn = function () {
    if (typeof console === 'undefined' || !console.warn) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift(LOG_PREFIX);
    console.warn.apply(console, args);
  };
  KUI.error = function () {
    if (typeof console === 'undefined' || !console.error) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift(LOG_PREFIX);
    console.error.apply(console, args);
  };
  /** 同一 key 只警告一次，避免配置错误刷屏 */
  KUI.warnOnce = function (key, message) {
    if (warned[key]) return;
    warned[key] = true;
    KUI.warn(message);
  };

  /* =============================================================
   *  2. 类型判断
   * ============================================================= */
  function isType(v, t) { return toString.call(v) === '[object ' + t + ']'; }

  var utils = {
    isString: function (v) { return typeof v === 'string'; },
    isNumber: function (v) { return typeof v === 'number' && isFinite(v); },
    isNumeric: function (v) {
      return (typeof v === 'number' && isFinite(v)) ||
        (typeof v === 'string' && v !== '' && !isNaN(v));
    },
    isBoolean: function (v) { return typeof v === 'boolean'; },
    isFunction: function (v) { return typeof v === 'function'; },
    isArray: function (v) { return Array.isArray(v); },
    isObject: function (v) { return v !== null && typeof v === 'object'; },
    isPlainObject: function (v) { return isType(v, 'Object'); },
    isDate: function (v) { return isType(v, 'Date'); },
    isRegExp: function (v) { return isType(v, 'RegExp'); },
    isNil: function (v) { return v === null || v === undefined; },
    isEmpty: function (v) {
      if (v === null || v === undefined || v === '') return true;
      if (Array.isArray(v)) return v.length === 0;
      if (isType(v, 'Object')) {
        for (var k in v) { if (hasOwn.call(v, k)) return false; }
        return true;
      }
      return false;
    },
    isDom: function (v) {
      if (!v || typeof v !== 'object') return false;
      if (v.nodeType === 1) return true;
      if (v.nodeType === 11) return true;      // fragment
      if (v.nodeType === 3) return true;       // text
      return false;
    },

    /* ---- 对象 ---- */
    assign: function (target) {
      target = target || {};
      for (var i = 1; i < arguments.length; i++) {
        var src = arguments[i];
        if (!src) continue;
        for (var k in src) {
          if (hasOwn.call(src, k)) target[k] = src[k];
        }
      }
      return target;
    },
    /** 深合并：数组直接替换，纯对象递归合并 */
    deepMerge: function (target) {
      target = target || {};
      for (var i = 1; i < arguments.length; i++) {
        var src = arguments[i];
        if (!src) continue;
        for (var k in src) {
          if (!hasOwn.call(src, k)) continue;
          var sv = src[k];
          if (isType(sv, 'Object') && isType(target[k], 'Object')) {
            target[k] = utils.deepMerge({}, target[k], sv);
          } else {
            target[k] = sv;
          }
        }
      }
      return target;
    },
    clone: function (v) {
      if (v === null || typeof v !== 'object') return v;
      if (isType(v, 'Date')) return new Date(v.getTime());
      if (Array.isArray(v)) {
        var arr = [];
        for (var i = 0; i < v.length; i++) arr[i] = utils.clone(v[i]);
        return arr;
      }
      if (isType(v, 'Object')) {
        var obj = {};
        for (var k in v) if (hasOwn.call(v, k)) obj[k] = utils.clone(v[k]);
        return obj;
      }
      return v;
    },
    getByPath: function (obj, path) {
      if (!obj || !path) return undefined;
      var parts = String(path).split('.');
      var cur = obj;
      for (var i = 0; i < parts.length; i++) {
        if (cur === null || cur === undefined) return undefined;
        cur = cur[parts[i]];
      }
      return cur;
    },
    /**
     * getByPath 的带默认值版本（controls 等模块常用 deepGet 名字）。
     * deepGet(obj, 'a.b.c', fallback)
     */
    deepGet: function (obj, path, fallback) {
      var v = KUI.utils.getByPath(obj, path);
      return v === undefined || v === null ? fallback : v;
    },
    setByPath: function (obj, path, value) {
      if (!obj || !path) return obj;
      var parts = String(path).split('.');
      var cur = obj;
      for (var i = 0; i < parts.length - 1; i++) {
        if (cur[parts[i]] === null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
      return obj;
    },
    pick: function (obj, keys) {
      var out = {};
      for (var i = 0; i < keys.length; i++) {
        if (obj && hasOwn.call(obj, keys[i])) out[keys[i]] = obj[keys[i]];
      }
      return out;
    },
    omit: function (obj, keys) {
      var out = {};
      for (var k in obj) {
        if (!hasOwn.call(obj, k)) continue;
        if (keys.indexOf(k) === -1) out[k] = obj[k];
      }
      return out;
    },

    /* ---- 数字/字符串 ---- */
    noop: function () { },
    identity: function (v) { return v; },
    toInt: function (v, fallback) {
      var n = parseInt(v, 10);
      return isNaN(n) ? (fallback === undefined ? 0 : fallback) : n;
    },
    toFloat: function (v, fallback) {
      var n = parseFloat(v);
      return isNaN(n) ? (fallback === undefined ? 0 : fallback) : n;
    },
    clamp: function (n, min, max) {
      n = utils.toFloat(n, 0);
      if (typeof min === 'number' && n < min) n = min;
      if (typeof max === 'number' && n > max) n = max;
      return n;
    },
    pad2: function (n) { return (n < 10 ? '0' : '') + n; },
    /** 保留小数并去掉浮点误差，如 toFixedNum(0.1+0.2, 2) -> 0.3 */
    round: function (n, precision) {
      var p = Math.pow(10, precision || 0);
      return Math.round(n * p) / p;
    },
    uid: function (prefix) {
      uidCounter += 1;
      return (prefix || 'kui') + '-' + uidCounter.toString(36);
    },
    camel: function (s) {
      return String(s).replace(/[-_\s]+([a-zA-Z0-9])/g, function (m, c) { return c.toUpperCase(); });
    },
    kebab: function (s) {
      return String(s).replace(/([A-Z])/g, '-$1').replace(/[_\s]+/g, '-').toLowerCase().replace(/^-/, '');
    },
    upperFirst: function (s) {
      s = String(s);
      return s.charAt(0).toUpperCase() + s.slice(1);
    },
    escapeHtml: function (s) {
      return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    escapeAttr: function (s) { return utils.escapeHtml(s); },
    truncate: function (s, len, ellipsis) {
      s = String(s || '');
      if (s.length <= len) return s;
      return s.slice(0, len) + (ellipsis === undefined ? '…' : ellipsis);
    },
    toArray: function (v) {
      if (v === null || v === undefined) return [];
      return Array.isArray(v) ? v : [v];
    },

    /* ---- 时间 ---- */
    now: function () { return Date.now ? Date.now() : new Date().getTime(); },
    formatDate: function (date, pattern) {
      var d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return '';
      var p = pattern || 'YYYY-MM-DD';
      var map = {
        YYYY: d.getFullYear(),
        YY: String(d.getFullYear()).slice(-2),
        MM: utils.pad2(d.getMonth() + 1),
        M: d.getMonth() + 1,
        DD: utils.pad2(d.getDate()),
        D: d.getDate(),
        HH: utils.pad2(d.getHours()),
        H: d.getHours(),
        mm: utils.pad2(d.getMinutes()),
        m: d.getMinutes(),
        ss: utils.pad2(d.getSeconds()),
        s: d.getSeconds(),
        SSS: ('00' + d.getMilliseconds()).slice(-3)
      };
      return p.replace(/YYYY|YY|MM|DD|HH|mm|ss|SSS|M|D|H|m|s/g, function (k) {
        return String(map[k]);
      });
    },
    /** 支持 YYYY-MM-DD / YYYY-MM-DD HH:mm[:ss] / ISO */
    parseDate: function (str) {
      if (str instanceof Date) return new Date(str.getTime());
      if (!str) return null;
      if (typeof str === 'number') return new Date(str);
      var s = String(str).trim().replace(/\//g, '-');
      var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
      if (m) {
        return new Date(
          utils.toInt(m[1]), utils.toInt(m[2]) - 1, utils.toInt(m[3]),
          utils.toInt(m[4], 0), utils.toInt(m[5], 0), utils.toInt(m[6], 0)
        );
      }
      var d = new Date(str);
      return isNaN(d.getTime()) ? null : d;
    },
    daysInMonth: function (year, month) {  // month: 0-11
      return new Date(year, month + 1, 0).getDate();
    },
    isSameDay: function (a, b) {
      return !!a && !!b &&
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
    },
    /** "HH:mm:ss" -> 秒 */
    timeToSeconds: function (t, withSeconds) {
      if (!t) return 0;
      var p = String(t).split(':');
      return utils.toInt(p[0]) * 3600 + utils.toInt(p[1]) * 60 + (withSeconds === false ? 0 : utils.toInt(p[2]));
    },
    /** 秒 -> "HH:mm:ss" */
    secondsToTime: function (s, withSeconds) {
      s = Math.max(0, utils.toInt(s));
      var h = Math.floor(s / 3600);
      var m = Math.floor((s % 3600) / 60);
      var sec = s % 60;
      var out = utils.pad2(h) + ':' + utils.pad2(m);
      if (withSeconds !== false) out += ':' + utils.pad2(sec);
      return out;
    },

    /* ---- 函数 ---- */
    debounce: function (fn, wait) {
      var timer = null;
      return function () {
        var self = this, args = arguments;
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
          timer = null;
          fn.apply(self, args);
        }, wait || 0);
      };
    },
    throttle: function (fn, wait) {
      var last = 0, timer = null;
      return function () {
        var self = this, args = arguments, now = utils.now();
        var remain = wait - (now - last);
        if (remain <= 0) {
          if (timer) { clearTimeout(timer); timer = null; }
          last = now;
          fn.apply(self, args);
        } else if (!timer) {
          timer = setTimeout(function () {
            last = utils.now();
            timer = null;
            fn.apply(self, args);
          }, remain);
        }
      };
    }
  };

  var uidCounter = 0;

  /* =============================================================
   *  3. 事件中心（观察者）
   * ============================================================= */
  function createEmitter() {
    var map = Object.create(null);
    var emitter = {
      on: function (name, fn) {
        if (!fn) return utils.noop;
        (map[name] || (map[name] = [])).push(fn);
        return function off() { emitter.off(name, fn); };
      },
      once: function (name, fn) {
        var off = emitter.on(name, function () {
          off();
          fn.apply(this, arguments);
        });
        return off;
      },
      off: function (name, fn) {
        if (!name) { map = Object.create(null); return; }
        if (!fn) { delete map[name]; return; }
        var list = map[name];
        if (!list) return;
        var idx = list.indexOf(fn);
        if (idx !== -1) list.splice(idx, 1);
        if (!list.length) delete map[name];
      },
      emit: function (name) {
        var args = Array.prototype.slice.call(arguments, 1);
        var list = map[name];
        if (list && list.length) {
          var copy = list.slice();
          for (var i = 0; i < copy.length; i++) {
            try {
              copy[i].apply(emitter, args);
            } catch (e) {
              KUI.error('事件处理异常 [' + name + ']:', e);
            }
          }
        }
        return emitter;
      },
      has: function (name) { return !!(map[name] && map[name].length); },
      count: function (name) { return name ? (map[name] || []).length : Object.keys(map).length; },
      clear: function () { map = Object.create(null); return emitter; }
    };
    return emitter;
  }

  KUI.events = { create: createEmitter, createEmitter: createEmitter };
  /** 全局事件总线 */
  KUI.bus = createEmitter();

  /* 兼容层（v1.1.5）
   * 早期组件（menu / menunav / tabs / toast / dialog）用 KUI.events.emit / KUI.events.on
   * 收发「模块级」全局事件（如 menu:collapsed、tabs:activate）。但 KUI.events 只提供了
   * create/createEmitter 工厂，emit / on 并不存在 → 所有这类全局事件被静默丢弃，
   * 表现为：菜单自带按钮收起后，顶部导航的折叠图标与 tooltip 不跟着变。
   * 这里把 events 上的监听/派发统一委托给全局总线 KUI.bus（同一份订阅表），
   * 组件侧无需改动即可恢复；新代码请直接用 KUI.bus。 */
  KUI.events.on = function (name, fn) { return KUI.bus.on(name, fn); };
  KUI.events.once = function (name, fn) { return KUI.bus.once(name, fn); };
  KUI.events.off = function (name, fn) { return KUI.bus.off(name, fn); };
  KUI.events.emit = function (name, payload) { return KUI.bus.emit(name, payload); };
  KUI.events.has = function (name) { return KUI.bus.has(name); };
  KUI.events.count = function (name) { return KUI.bus.count(name); };

  /* =============================================================
   *  4. 文案字典（i18n / text）
   * ============================================================= */
  var i18n = {
    dict: Object.create(null),
    /** 深度合并字典，返回 this */
    set: function (dict, deep) {
      if (!dict) return i18n;
      if (deep === false) {
        utils.assign(i18n.dict, dict);
      } else {
        utils.deepMerge(i18n.dict, dict);
      }
      KUI.bus.emit('text:change', i18n.dict);
      return i18n;
    },
    reset: function (dict) {
      i18n.dict = Object.create(null);
      if (dict) i18n.set(dict);
      return i18n;
    },
    has: function (key) {
      return utils.getByPath(i18n.dict, key) !== undefined;
    },
    get: function (key, fallback) {
      var v = utils.getByPath(i18n.dict, key);
      return v === undefined || v === null || v === '' ? fallback : v;
    },
    all: function () { return i18n.dict; }
  };
  KUI.i18n = i18n;

  /**
   * 取文案：KUI.text('dialog.ok', '确定', {name:'x'})
   * 优先使用 text.json 中的键，缺失时回退到 fallback（保证独立组件可用）。
   */
  KUI.text = function (key, fallback, vars) {
    var v = utils.getByPath(i18n.dict, key);
    if (v === undefined || v === null || v === '') v = fallback;
    if (v === undefined || v === null) v = key;
    return KUI.fmt(v, vars);
  };

  /** 变量替换：{name} / {0} */
  KUI.fmt = function (str, vars) {
    if (str === null || str === undefined) return '';
    str = String(str);
    if (!vars) return str;
    return str.replace(/\{([\w$]+)\}/g, function (m, key) {
      if (vars[key] !== undefined) return String(vars[key]);
      var idx = parseInt(key, 10);
      if (!isNaN(idx) && vars[idx] !== undefined) return String(vars[idx]);
      return m;
    });
  };

  /* =============================================================
   *  5. DOM 助手
   * ============================================================= */
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var XLINK_NS = 'http://www.w3.org/1999/xlink';

  function each(list, fn) {
    if (!list) return;
    for (var i = 0; i < list.length; i++) fn(list[i], i);
  }

  function applyAttrs(el, attrs, ns) {
    if (!attrs) return el;
    for (var k in attrs) {
      if (!hasOwn.call(attrs, k)) continue;
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class' || k === 'className' || k === 'cls') {
        KUI.addClass(el, v);
      } else if (k === 'style') {
        KUI.setStyle(el, v);
      } else if (k === 'dataset' || k === 'data') {
        for (var dk in v) {
          if (hasOwn.call(v, dk)) {
            var dv = v[dk];
            el.setAttribute('data-' + KUI.utils.kebab(dk), dv === null || dv === undefined ? '' : String(dv));
          }
        }
      } else if (k === 'text' || k === 'textContent') {
        el.textContent = v === null || v === undefined ? '' : String(v);
      } else if (k === 'html' || k === 'innerHTML') {
        el.innerHTML = String(v);
      } else if (k === 'on' || k === 'events') {
        for (var evt in v) {
          if (hasOwn.call(v, evt) && typeof v[evt] === 'function') {
            el.addEventListener(evt, v[evt]);
          }
        }
      } else if (k === 'href' && ns === SVG_NS) {
        el.setAttributeNS(XLINK_NS, 'xlink:href', v);
      } else if (k === 'ref' || k === 'children' || k === 'nodes') {
        // ignore
      } else if (k === 'value' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
        el.value = v;
      } else if (k === 'disabled' || k === 'checked' || k === 'selected' || k === 'readOnly') {
        el[k] = !!v;
      } else {
        el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    return el;
  }

  function appendChildren(el, children) {
    if (children === null || children === undefined) return el;
    if (Array.isArray(children)) {
      for (var i = 0; i < children.length; i++) appendChildren(el, children[i]);
      return el;
    }
    if (typeof children === 'string' || typeof children === 'number') {
      el.appendChild(document.createTextNode(String(children)));
      return el;
    }
    if (children.nodeType) {
      el.appendChild(children);
    }
    return el;
  }

  /**
   * 创建元素：KUI.h('div', { class:'a', style:{color:'red'}, on:{click:fn} }, [子节点])
   * 第二个参数可省略（直接传 children）。
   */
  KUI.h = function (tag, attrs, children) {
    if (!KUI.env.isBrowser) return null;
    if (attrs && (attrs.nodeType || typeof attrs === 'string' || Array.isArray(attrs))) {
      children = attrs;
      attrs = null;
    }
    var el = document.createElement(tag || 'div');
    applyAttrs(el, attrs, null);
    appendChildren(el, children);
    return el;
  };

  /** 创建 SVG 元素（图标/装饰用） */
  KUI.hs = function (tag, attrs, children) {
    if (!KUI.env.isBrowser) return null;
    if (attrs && (attrs.nodeType || Array.isArray(attrs))) {
      children = attrs;
      attrs = null;
    }
    var el = document.createElementNS(SVG_NS, tag || 'g');
    applyAttrs(el, attrs, SVG_NS);
    appendChildren(el, children);
    return el;
  };

  KUI.frag = function (children) {
    if (!KUI.env.isBrowser) return null;
    var f = document.createDocumentFragment();
    appendChildren(f, children);
    return f;
  };

  KUI.textNode = function (str) {
    if (!KUI.env.isBrowser) return null;
    return document.createTextNode(str === null || str === undefined ? '' : String(str));
  };

  KUI.addClass = function (el, cls) {
    if (!el || !cls) return el;
    if (Array.isArray(cls)) { each(cls, function (c) { KUI.addClass(el, c); }); return el; }
    var list = String(cls).split(/\s+/);
    for (var i = 0; i < list.length; i++) {
      if (!list[i]) continue;
      if (el.classList) el.classList.add(list[i]);
      else {
        var cur = ' ' + (el.className || '') + ' ';
        if (cur.indexOf(' ' + list[i] + ' ') === -1) el.className = (el.className || '') + ' ' + list[i];
      }
    }
    return el;
  };
  KUI.removeClass = function (el, cls) {
    if (!el || !cls) return el;
    if (Array.isArray(cls)) { each(cls, function (c) { KUI.removeClass(el, c); }); return el; }
    var list = String(cls).split(/\s+/);
    for (var i = 0; i < list.length; i++) {
      if (!list[i]) continue;
      if (el.classList) el.classList.remove(list[i]);
      else el.className = String(el.className || '').split(' ').filter(function (c) { return c && c !== list[i]; }).join(' ');
    }
    return el;
  };
  KUI.hasClass = function (el, cls) {
    if (!el) return false;
    if (el.classList) return el.classList.contains(cls);
    return (' ' + (el.className || '') + ' ').indexOf(' ' + cls + ' ') !== -1;
  };
  KUI.toggleClass = function (el, cls, force) {
    if (!el) return el;
    var on = force === undefined ? !KUI.hasClass(el, cls) : !!force;
    return on ? KUI.addClass(el, cls) : KUI.removeClass(el, cls);
  };

  KUI.setStyle = function (el, style) {
    if (!el || !style) return el;
    if (typeof style === 'string') {
      el.style.cssText = (el.style.cssText ? el.style.cssText + ';' : '') + style;
      return el;
    }
    for (var k in style) {
      if (!hasOwn.call(style, k)) continue;
      var v = style[k];
      if (v === null || v === undefined) continue;
      if (k.indexOf('--') === 0) {
        if (el.style.setProperty) el.style.setProperty(k, String(v));
        else el.style[k] = v;
      } else if (el.style.setProperty) {
        el.style.setProperty(k, String(v));
      } else {
        el.style[k] = v;
      }
    }
    return el;
  };

  KUI.setAttr = function (el, name, value) {
    if (!el) return el;
    if (value === null || value === undefined || value === false) el.removeAttribute(name);
    else el.setAttribute(name, value === true ? '' : String(value));
    return el;
  };
  KUI.setAttrs = function (el, attrs) {
    if (!el || !attrs) return el;
    for (var k in attrs) if (hasOwn.call(attrs, k)) KUI.setAttr(el, k, attrs[k]);
    return el;
  };
  KUI.getAttr = function (el, name) {
    if (!el) return null;
    return el.getAttribute ? el.getAttribute(name) : null;
  };

  /**
   * 事件绑定：KUI.on(el, 'click', fn) / KUI.on(el, 'click', '.sel', fn) 委托
   * 返回解除函数。
   */
  KUI.on = function (el, type, selector, fn, options) {
    if (!el) return utils.noop;
    if (typeof selector === 'function') {
      options = fn;
      fn = selector;
      selector = null;
    }
    var handler = fn;
    if (selector) {
      handler = function (e) {
        var target = e.target;
        while (target && target !== el) {
          if (target.matches && target.matches(selector)) {
            fn.call(target, e, target);
            return;
          }
          target = target.parentNode;
        }
      };
    }
    el.addEventListener(type, handler, options || false);
    return function off() {
      el.removeEventListener(type, handler, options || false);
    };
  };
  KUI.off = function (el, type, fn, options) {
    if (el) el.removeEventListener(type, fn, options || false);
  };
  KUI.once = function (el, type, fn) {
    return KUI.on(el, type, function (e) {
      fn(e);
    }, { once: true });
  };

  /** 派发自定义事件（兼容老浏览器） */
  KUI.trigger = function (el, type, detail) {
    if (!el) return;
    var evt;
    try {
      evt = new CustomEvent(type, { bubbles: true, cancelable: true, detail: detail });
    } catch (e) {
      evt = document.createEvent('CustomEvent');
      evt.initCustomEvent(type, true, true, detail);
    }
    el.dispatchEvent(evt);
  };

  KUI.remove = function (el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
    return el;
  };
  KUI.empty = function (el) {
    if (!el) return el;
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  };
  KUI.clearNode = KUI.empty;
  KUI.insertAfter = function (newEl, refEl) {
    if (refEl && refEl.parentNode) refEl.parentNode.insertBefore(newEl, refEl.nextSibling);
    return newEl;
  };
  KUI.qs = function (sel, root) {
    if (!KUI.env.isBrowser) return null;
    return (root || document).querySelector(sel);
  };
  KUI.qsa = function (sel, root) {
    if (!KUI.env.isBrowser) return [];
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };
  KUI.elText = function (el, value) {
    if (!el) return '';
    if (value === undefined) return el.textContent || '';
    el.textContent = value === null || value === undefined ? '' : String(value);
    return el;
  };
  KUI.isVisible = function (el) {
    if (!el) return false;
    if (el.hidden) return false;
    var cs = null;
    try { cs = el.ownerDocument && el.ownerDocument.defaultView && el.ownerDocument.defaultView.getComputedStyle(el); } catch (e) { cs = null; }
    if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
    return true;
  };
  KUI.offset = function (el) {
    if (!el) return { top: 0, left: 0, width: 0, height: 0 };
    var rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { top: 0, left: 0, width: 0, height: 0 };
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
  };
  KUI.viewport = function () {
    if (!KUI.env.isBrowser) return { width: 0, height: 0 };
    return {
      width: global.innerWidth || document.documentElement.clientWidth || 0,
      height: global.innerHeight || document.documentElement.clientHeight || 0
    };
  };

  /* ---- 动画帧 ---- */
  KUI.raf = function (fn) {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn);
    return setTimeout(fn, 16);
  };
  KUI.caf = function (id) {
    if (typeof cancelAnimationFrame === 'function') return cancelAnimationFrame(id);
    return clearTimeout(id);
  };
  /** 下一帧（用于插入 DOM 后触发进场动画） */
  KUI.nextFrame = function (fn) {
    KUI.raf(function () { KUI.raf(fn); });
  };

  /* ---- DOM READY ---- */
  KUI.ready = function (fn) {
    if (!KUI.env.isBrowser) { fn(); return; }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function once() {
        document.removeEventListener('DOMContentLoaded', once);
        fn();
      });
    } else {
      fn();
    }
  };

  /* =============================================================
   *  6. 动作（action）分发
   * =============================================================
   * 配置 JSON 中通过 `on` 绑定动作，例如：
   *   { "type":"button", "text":"打开弹窗",
   *     "on": { "click": { "action":"dialog.alert", "params":{ "message":"hi" } } } }
   * 支持的写法：
   *   string        —— 动作名，无参数
   *   {action,params} —— 标准写法
   *   {emit,detail} —— 派发 DOM 自定义事件
   *   {actions:[...]} —— 顺序执行
   *   function      —— 直接调用（仅代码内使用，JSON 不支持）
   */
  var actionHandlers = Object.create(null);

  var actions = {
    register: function (name, fn) {
      if (!name || typeof fn !== 'function') return actions;
      actionHandlers[name] = fn;
      return actions;
    },
    unregister: function (name) { delete actionHandlers[name]; return actions; },
    has: function (name) { return typeof actionHandlers[name] === 'function'; },
    list: function () { return Object.keys(actionHandlers).sort(); },
    /** 执行动作；返回动作的返回值（可能为 Promise） */
    run: function (action, ctx, ev) {
      if (action === null || action === undefined || action === '') return undefined;

      if (Array.isArray(action)) {
        var results = [];
        for (var i = 0; i < action.length; i++) {
          results.push(actions.run(action[i], ctx, ev));
        }
        return results;
      }
      if (typeof action === 'function') return action(ctx, ev);
      if (typeof action === 'string') return invoke(action, {}, ctx, ev);

      if (typeof action !== 'object') {
        KUI.warnOnce('action-type', '无法识别的动作配置: ' + action);
        return undefined;
      }

      if (action.actions) return actions.run(action.actions, ctx, ev);
      if (action.chain) return actions.run(action.chain, ctx, ev);
      if (action.action) {
        return invoke(action.action, action.params || action.args || action.data || {}, ctx, ev);
      }
      // JSON 不能存函数：允许写业务函数名 + 入参，交给 handlers 注册表执行
      //   { fn: 'menu.toggleCollapse' }
      //   { fn: 'toast.success', args: { text: '已保存' } }
      //   { handler: { name: 'tabs.activateNext', args: {} } }
      if (action.fn || action.handler) {
        var hs = action.handler || action.fn;
        var hname = typeof hs === 'string' ? hs : (hs && (hs.fn || hs.name || hs.function));
        var hargs = action.args || action.params || action.data || {};
        if (hs && typeof hs === 'object') { hargs = hs.args || hs.params || hargs; }
        return invoke('handlers.run', { fn: hname, args: hargs }, ctx, ev);
      }
      if (action.emit) {
        var detail = action.detail || action.params || {};
        if (ctx && typeof ctx.emit === 'function') ctx.emit(action.emit, detail);
        else KUI.bus.emit(action.emit, detail);
        return undefined;
      }
      if (action.theme) {
        var themeId = typeof action.theme === 'string' ? action.theme : action.theme.id;
        return invoke('theme.apply', { id: themeId }, ctx, ev);
      }
      if (action.tab) {
        return invoke('tab.open', action.tab, ctx, ev);
      }
      if (action.toast) {
        return invoke('toast.show', action.toast, ctx, ev);
      }
      if (action.dialog) {
        var d = action.dialog;
        var kind = d.kind || d.mode || 'alert';
        return invoke('dialog.' + kind, d, ctx, ev);
      }
      KUI.warnOnce('action-shape', '动作配置缺少 action/emit/theme/tab/toast/dialog 字段: ' + JSON.stringify(action));
      return undefined;
    }
  };

  function invoke(name, params, ctx, ev) {
    var fn = actionHandlers[name];
    if (typeof fn !== 'function') {
      // 兼容「字符串直接写业务函数名」：JSON 里可写 "on": { "click": "toast.success" }
      if (KUI.handlers && typeof KUI.handlers.has === 'function' && KUI.handlers.has(name, ctx)) {
        return KUI.handlers.invoke(name, ctx, params);
      }
      KUI.warnOnce('action-missing:' + name, '未注册的动作: ' + name);
      return undefined;
    }
    try {
      var ret = fn(ctx || {}, params || {}, ev);
      if (ret && typeof ret.then === 'function' && ret['catch']) {
        ret['catch'](function (e) { KUI.error('动作异常 [' + name + ']:', e); });
      }
      return ret;
    } catch (e) {
      KUI.error('动作执行异常 [' + name + ']:', e);
      return undefined;
    }
  }

  KUI.actions = actions;

  /* =============================================================
   *  7. 渲染上下文
   * =============================================================
   * ctx 贯穿整棵渲染树，组件/控件通过它访问父级、应用实例、表单实例等。
   */
  function createContext(parent, extra) {
    var ctx = {
      KUI: KUI,
      parent: parent || null,
      children: [],
      app: (parent && parent.app) || null,
      root: (parent && parent.root) || null,
      form: (parent && parent.form) || null,
      dialog: (parent && parent.dialog) || null,
      tab: (parent && parent.tab) || null,
      data: (parent && parent.data) || null,
      path: (parent && parent.path) || '',
      depth: parent ? (parent.depth || 0) + 1 : 0,
      type: null,
      node: null,
      inst: null,

      emit: function (name, detail) {
        var host = ctx.app && ctx.app.rootEl ? ctx.app.rootEl : (ctx.root || null);
        if (host) KUI.trigger(host, name, detail);
        KUI.bus.emit(name, detail, ctx);
        /* v1.1.5：这里必须是 emit（派发），不是 on（注册）。
         * 之前写成 ctx.app.on(name, detail) 会把 payload 当成监听函数塞进事件表，
         * 之后同一事件派发时就会报 copy[i].apply is not a function。 */
        if (ctx.app && typeof ctx.app.emit === 'function') ctx.app.emit(name, detail);
      },
      action: function (action, ev) {
        return KUI.actions.run(action, ctx, ev);
      },
      /** 向上查找最近的具备某能力的上下文 */
      closest: function (key) {
        var cur = ctx;
        while (cur) {
          if (cur[key]) return cur;
          cur = cur.parent;
        }
        return null;
      },
      /** 子上下文 */
      child: function (extra) {
        return createContext(ctx, extra);
      }
    };
    if (extra) utils.assign(ctx, extra);
    return ctx;
  }
  KUI.createContext = createContext;

  /* =============================================================
   *  8. 节点渲染调度
   * ============================================================= */

  /** 统一取子节点列表 */
  function childNodes(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node.children)) return node.children;
    if (Array.isArray(node.nodes)) return node.nodes;
    if (Array.isArray(node.content)) return node.content;
    return [];
  }

  /** 把任意值标准化为节点数组 */
  function normalizeNodes(v) {
    if (v === null || v === undefined) return [];
    return Array.isArray(v) ? v : [v];
  }

  function decorate(el, node, ctx) {
    if (!el || el.nodeType !== 1) return el;
    if (node.id) el.id = node.id;

    var cls = node['class'] || node.className || node.cls;
    if (cls) {
      KUI.addClass(el, cls);
      KUI.addClass(el, 'kui-node');
    }
    if (node.style) KUI.setStyle(el, node.style);
    if (node.attrs) KUI.setAttrs(el, node.attrs);
    if (node.dataset || node.dataAttrs) {
      var ds = node.dataset || node.dataAttrs;
      for (var k in ds) {
        if (hasOwn.call(ds, k)) {
          el.setAttribute('data-' + utils.kebab(k), ds[k] === null || ds[k] === undefined ? '' : String(ds[k]));
        }
      }
    }
    if (node.title) el.setAttribute('title', String(node.title));
    if (node.hidden === true) el.hidden = true;
    if (node.disabled === true && 'disabled' in el) el.disabled = true;

    // 绑定配置里的动作
    if (node.on && typeof node.on === 'object') {
      for (var evt in node.on) {
        if (!hasOwn.call(node.on, evt)) continue;
        if (evt === 'mount' || evt === 'destroy') continue; // 生命周期钩子，由调用方处理
        (function (type, action) {
          KUI.on(el, type, function (e) {
            // 允许节点阻止冒泡动作
            if (e && e.__kuiActionHandled) return;
            KUI.actions.run(action, ctx, e);
          });
        })(evt, node.on[evt]);
      }
    }
    if (node.ref && typeof node.ref === 'function') node.ref(el, ctx);
    el.__kuiNode = node;
    el.__kuiCtx = ctx;
    return el;
  }

  function unknownNode(type, node, ctx) {
    var el = KUI.h('div', {
      'class': 'kui-control kui-unknown',
      title: '未注册的元素类型: ' + type
    }, [
      KUI.h('span', { 'class': 'kui-unknown__icon' }, '?'),
      KUI.h('span', { 'class': 'kui-unknown__text' }, KUI.text('framework.unknownType', '未注册的元素类型') + ': ' + type)
    ]);
    KUI.warnOnce('unknown-type:' + type, '未注册的元素类型 "' + type + '"，已渲染占位节点。请检查配置 JSON 或是否漏加载该控件的脚本。');
    return el;
  }

  /**
   * 渲染单个节点，返回 DOM 节点（可能是 text/fragment/Element），不可见时返回 null。
   * ctx 可为空（独立渲染时自动创建根上下文）。
   */
  function renderNode(node, ctx) {
    if (node === null || node === undefined) return null;
    if (typeof node === 'string' || typeof node === 'number') return KUI.textNode(node);
    if (node.nodeType) return node; // 已经是 DOM
    if (Array.isArray(node)) return KUI.frag(renderNodes(node, ctx));

    if (!ctx) ctx = createContext(null);

    // visible:false 完全不渲染；hidden:true 渲染后隐藏（用于保留状态）
    if (node.visible === false || node.if === false) return null;

    var type = node.type;
    if (!type) {
      // 无 type 时：有 text 视为纯文本节点，否则视为容器
      if (node.text !== undefined && node.text !== null) return KUI.textNode(node.text);
      if (childNodes(node).length) {
        var box = KUI.h('div', { 'class': node['class'] || '' });
        renderNodesInto(childNodes(node), box, ctx.child({}));
        return box;
      }
      return null;
    }

    if (type === 'fragment' || type === 'group') {
      var fbox = KUI.h('div', { 'class': 'kui-fragment' });
      decorate(fbox, node, ctx);
      renderNodesInto(childNodes(node), fbox, ctx.child({}));
      return fbox;
    }

    var def = KUI.registry && KUI.registry.get ? KUI.registry.get(type) : null;
    if (!def || typeof def.render !== 'function') return unknownNode(type, node, ctx);

    var childCtx = ctx.child({ type: type, node: node });
    var el;
    try {
      el = def.render(node, childCtx);
    } catch (e) {
      KUI.error('元素渲染失败 [' + type + ']:', e);
      return unknownNode(type, node, ctx);
    }
    if (!el || !el.nodeType) {
      if (typeof el === 'string') el = KUI.textNode(el);
      else el = KUI.h('div');
    }
    decorate(el, node, childCtx);

    if (el.nodeType === 1) {
      KUI.addClass(el, 'kui-control');
      KUI.addClass(el, 'kui-control--' + type);
    }

    var inst = { type: type, el: el, node: node, ctx: childCtx };
    if (typeof def.api === 'function') {
      try {
        var api = def.api(el, node, childCtx);
        if (api && typeof api === 'object') utils.assign(inst, api);
      } catch (e) {
        KUI.error('元素初始化失败 [' + type + ']:', e);
      }
    }
    childCtx.inst = inst;
    if (el.nodeType === 1) {
      el.__kuiInstance = inst;
    }
    if (typeof def.mounted === 'function') {
      try { def.mounted(el, node, childCtx, inst); } catch (e) { KUI.error('元素挂载钩子异常 [' + type + ']:', e); }
    }
    if (node.on && typeof node.on.mount === 'function') {
      try { node.on.mount(inst, childCtx); } catch (e) { KUI.error('on.mount 异常 [' + type + ']:', e); }
    }
    if (ctx.children) ctx.children.push(inst);
    return el;
  }

  function renderNodes(nodes, ctx) {
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = renderNode(nodes[i], ctx);
      if (el) out.push(el);
    }
    return out;
  }

  function renderNodesInto(nodes, host, ctx) {
    var list = normalizeNodes(nodes);
    for (var i = 0; i < list.length; i++) {
      var el = renderNode(list[i], ctx);
      if (el) host.appendChild(el);
    }
    return host;
  }

  KUI.renderNode = renderNode;
  KUI.renderNodes = renderNodes;
  KUI.renderTree = function (nodes, host, ctx) {
    if (!host) return host;
    var c = ctx || createContext(null);
    renderNodesInto(nodes, host, c);
    return host;
  };
  KUI.childNodes = childNodes;
  KUI.normalizeNodes = normalizeNodes;
  KUI.decorate = decorate;

  /**
   * 挂载指定类型节点到宿主元素，返回实例对象。
   * KUI.mount('button', host, { text:'确定', variant:'primary' }, ctx)
   */
  KUI.mount = function (type, host, node, ctx) {
    var cfg = node ? utils.assign({}, node) : {};
    cfg.type = type || cfg.type;
    var c = ctx || createContext(null);
    var el = renderNode(cfg, c);
    var inst = (el && el.__kuiInstance) || { type: cfg.type, el: el, node: cfg, ctx: c };
    if (host && el) host.appendChild(el);
    return inst;
  };

  /** 挂载一个带 type 的节点配置（host 可选） */
  KUI.mountNode = function (node, host, ctx) {
    var inst;
    var el = renderNode(node, ctx || createContext(null));
    inst = (el && el.__kuiInstance) || { type: node && node.type, el: el, node: node, ctx: ctx || null };
    if (host && el) host.appendChild(el);
    return inst;
  };

  /** 批量挂载并返回实例数组 */
  KUI.mountAll = function (nodes, host, ctx) {
    var c = ctx || createContext(null);
    var out = [];
    var list = normalizeNodes(nodes);
    for (var i = 0; i < list.length; i++) {
      var inst = KUI.mountNode(list[i], host, c);
      if (inst && inst.el) out.push(inst);
    }
    return out;
  };

  /* =============================================================
   *  9. 内置通用动作
   * =============================================================
   * 组件加载后各自的静态 API 才存在，这里在“运行动作时”再检查，
   * 因此任何页面只加载部分组件也不会报错（未加载的动作给出提示）。
   */
  function need(apiName, actionName) {
    return function () {
      KUI.warnOnce('api-missing:' + apiName,
        '动作 ' + actionName + ' 需要 ' + apiName + ' 组件，但它尚未加载。');
      return undefined;
    };
  }

  /* ---- 弹窗 ---- */
  actions.register('dialog.alert', function (ctx, p) {
    if (!KUI.dialog || !KUI.dialog.alert) return need('KUI.dialog', 'dialog.alert')();
    return KUI.dialog.alert(p);
  });
  actions.register('dialog.confirm', function (ctx, p) {
    if (!KUI.dialog || !KUI.dialog.confirm) return need('KUI.dialog', 'dialog.confirm')();
    return KUI.dialog.confirm(p);
  });
  actions.register('dialog.prompt', function (ctx, p) {
    if (!KUI.dialog || !KUI.dialog.prompt) return need('KUI.dialog', 'dialog.prompt')();
    return KUI.dialog.prompt(p);
  });
  actions.register('dialog.form', function (ctx, p) {
    if (!KUI.dialog || !KUI.dialog.form) return need('KUI.dialog', 'dialog.form')();
    return KUI.dialog.form(p);
  });
  actions.register('dialog.custom', function (ctx, p) {
    if (!KUI.dialog || !KUI.dialog.custom) return need('KUI.dialog', 'dialog.custom')();
    return KUI.dialog.custom(p);
  });
  actions.register('dialog.close', function (ctx, p) {
    if (!KUI.dialog || !KUI.dialog.close) return need('KUI.dialog', 'dialog.close')();
    return KUI.dialog.close(p && p.id ? p.id : p);
  });
  actions.register('dialog.closeAll', function () {
    if (!KUI.dialog || !KUI.dialog.closeAll) return need('KUI.dialog', 'dialog.closeAll')();
    return KUI.dialog.closeAll();
  });

  /* ---- 提醒信息 ---- */
  actions.register('toast.show', function (ctx, p) {
    if (!KUI.toast || !KUI.toast.show) return need('KUI.toast', 'toast.show')();
    var opts = typeof p === 'string' ? { message: p } : (p || {});
    return KUI.toast.show(opts);
  });
  actions.register('toast.info', function (ctx, p) {
    if (!KUI.toast || !KUI.toast.info) return need('KUI.toast', 'toast.info')();
    return KUI.toast.info(p && p.message ? p.message : p, p);
  });
  actions.register('toast.success', function (ctx, p) {
    if (!KUI.toast || !KUI.toast.success) return need('KUI.toast', 'toast.success')();
    return KUI.toast.success(p && p.message ? p.message : p, p);
  });
  actions.register('toast.warning', function (ctx, p) {
    if (!KUI.toast || !KUI.toast.warning) return need('KUI.toast', 'toast.warning')();
    return KUI.toast.warning(p && p.message ? p.message : p, p);
  });
  actions.register('toast.error', function (ctx, p) {
    if (!KUI.toast || !KUI.toast.error) return need('KUI.toast', 'toast.error')();
    return KUI.toast.error(p && p.message ? p.message : p, p);
  });
  actions.register('toast.notify', function (ctx, p) {
    if (!KUI.toast || !KUI.toast.notify) return need('KUI.toast', 'toast.notify')();
    return KUI.toast.notify(p);
  });
  actions.register('toast.clear', function () {
    if (!KUI.toast || !KUI.toast.clear) return need('KUI.toast', 'toast.clear')();
    return KUI.toast.clear();
  });

  /* ---- 主题 ---- */
  actions.register('theme.apply', function (ctx, p) {
    if (!KUI.theme || !KUI.theme.apply) return need('KUI.theme', 'theme.apply')();
    return KUI.theme.apply(p && p.id ? p.id : p, p);
  });
  actions.register('theme.next', function () {
    if (!KUI.theme || !KUI.theme.next) return need('KUI.theme', 'theme.next')();
    return KUI.theme.next();
  });
  actions.register('theme.prev', function () {
    if (!KUI.theme || !KUI.theme.prev) return need('KUI.theme', 'theme.prev')();
    return KUI.theme.prev();
  });

  /* ---- 标签页 ---- */
  actions.register('tab.open', function (ctx, p) {
    if (!KUI.tabs || !KUI.tabs.open) return need('KUI.tabs', 'tab.open')();
    return KUI.tabs.open(p);
  });
  actions.register('tab.close', function (ctx, p) {
    if (!KUI.tabs || !KUI.tabs.close) return need('KUI.tabs', 'tab.close')();
    return KUI.tabs.close(p && p.id ? p.id : p);
  });
  actions.register('tab.refresh', function (ctx, p) {
    if (!KUI.tabs || !KUI.tabs.refresh) return need('KUI.tabs', 'tab.refresh')();
    return KUI.tabs.refresh(p && p.id ? p.id : p);
  });
  actions.register('tab.closeAll', function () {
    if (!KUI.tabs || !KUI.tabs.closeAll) return need('KUI.tabs', 'tab.closeAll')();
    return KUI.tabs.closeAll();
  });
  // 关闭其它：显式传 id 时以它为目标，否则用当前激活标签
  actions.register('tab.closeOthers', function (ctx, p) {
    var tabs = KUI.tabs || KUI.app && KUI.app.tabs;
    if (!tabs || !tabs.closeOthers) return need('KUI.tabs', 'tab.closeOthers')();
    return tabs.closeOthers(p && p.id ? p.id : p);
  });
  actions.register('tab.activate', function (ctx, p) {
    var tabs = KUI.tabs || KUI.app && KUI.app.tabs;
    if (!tabs || !tabs.activate) return need('KUI.tabs', 'tab.activate')();
    return tabs.activate(p && p.id ? p.id : p);
  });

  /* ---- 应用级 ---- */
  actions.register('app.refresh', function () {
    if (KUI.env.isBrowser && global.location && global.location.reload) global.location.reload();
  });
  actions.register('app.fullscreen', function () {
    return KUI.toggleFullscreen ? KUI.toggleFullscreen() : undefined;
  });
  actions.register('app.collapse', function (ctx, p) {
    if (KUI.app && KUI.app.toggleCollapsed) return KUI.app.toggleCollapsed(p && p.value);
    return undefined;
  });
  actions.register('clipboard.copy', function (ctx, p) {
    var text = p && (p.text || p.value);
    if (!text || !KUI.env.isBrowser || !navigator.clipboard) return undefined;
    return navigator.clipboard.writeText(String(text));
  });

  /* ---- 全屏 ---- */
  KUI.toggleFullscreen = function () {
    if (!KUI.env.isBrowser) return;
    var doc = document;
    var el = doc.documentElement;
    var isFull = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement;
    try {
      if (isFull) {
        (doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || utils.noop).call(doc);
      } else {
        (el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || utils.noop).call(el);
      }
    } catch (e) {
      KUI.warn('全屏切换失败:', e);
    }
    return !isFull;
  };

  /* =============================================================
   *  10. 杂项
   * ============================================================= */
  KUI.utils = utils;

  /** 防抖/节流等常用工具别名 */
  KUI.debounce = utils.debounce;
  KUI.throttle = utils.throttle;

  /** 兼容旧浏览器：Array.prototype.forEach 等由 ES5 提供，无需 polyfill */

  /** 版本 & 自检 */
  KUI.info = function () {
    return {
      name: KUI.name,
      version: KUI.version,
      controls: KUI.registry && KUI.registry.list ? KUI.registry.list().length : 0,
      themes: KUI.theme && KUI.theme.list ? KUI.theme.list().length : 0,
      env: KUI.env
    };
  };

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));

/**
 * KurumiUI —— 零依赖轻量 DOM 桩（测试专用）
 * ---------------------------------------------------------------
 * 目标：在 Node 中构建一个「浏览器窗口」沙箱，使本项目全部传统 <script>
 *       （src/core/*.js、src/components/**、config/*.js）可以被 `vm` 加载并
 *       正常完成渲染，从而在没有浏览器的情况下做渲染 / 交互 / 标签保活测试。
 *
 * 覆盖能力（够本项目用，不追求完整规范）：
 *   - Node / Element / Text / Comment / DocumentFragment / Document / Window
 *   - querySelector(All) / getElementById / matches / closest（轻量选择器引擎）
 *   - classList / style（cssText + setProperty + 变量）/ dataset / attributes
 *   - appendChild / insertBefore / removeChild / replaceChild / cloneNode
 *   - innerHTML（最小 HTML 解析器，支持 tag/attr/文本/注释/void 标签）
 *   - Event / CustomEvent / MouseEvent / KeyboardEvent / MessageEvent 与冒泡
 *   - matchMedia / requestAnimationFrame / setTimeout 接管（destroy 时清理）
 *   - localStorage / sessionStorage / history / fetch（读本地文件）/ getComputedStyle
 *   - iframe：懒创建 contentWindow，支持父 <-> 子 postMessage 事件
 *
 * 兼容 Node 13.14：不使用 ?. / ?? / replaceAll / .at() 等新语法。
 *
 * 用法：
 *   var dom = require('./dom-stub');
 *   var env = dom.createEnvironment({ root: <项目根目录> });
 *   env.loadScript('src/core/kui.js');
 *   env.window.KUI.utils.el(...)；
 *   env.destroy();   // 清理定时器，保证测试进程能退出
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var HTML_NS = 'http://www.w3.org/1999/xhtml';
var SVG_NS = 'http://www.w3.org/2000/svg';
var XLINK_NS = 'http://www.w3.org/1999/xlink';

/* =============================================================
 *  0. 通用工具
 * ============================================================= */
function isNode(v) {
  return !!v && typeof v === 'object' && typeof v.nodeType === 'number';
}

function toArray(v) {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function kebab(name) {
  if (name === null || name === undefined) return '';
  var s = String(name);
  if (s.indexOf('--') === 0) return s;
  if (s.indexOf('-') !== -1) return s.toLowerCase();
  return s.replace(/([A-Z])/g, function (m, c) { return '-' + c.toLowerCase(); }).replace(/^ms-/, '-ms-');
}

function camel(name) {
  return String(name).replace(/-([a-z0-9])/g, function (m, c) { return c.toUpperCase(); });
}

function escapeText(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

var ENTITY_MAP = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  copy: '\u00a9', reg: '\u00ae', hellip: '\u2026', mdash: '\u2014',
  ndash: '\u2013', times: '\u00d7', middot: '\u00b7', laquo: '\u00ab',
  raquo: '\u00bb', deg: '\u00b0', plusmn: '\u00b1', bull: '\u2022'
};

function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, function (m, key) {
    if (key.charAt(0) === '#') {
      var code;
      if (key.charAt(1) === 'x' || key.charAt(1) === 'X') code = parseInt(key.slice(2), 16);
      else code = parseInt(key.slice(1), 10);
      if (!isNaN(code)) {
        try { return String.fromCharCode(code); } catch (e) { return m; }
      }
      return m;
    }
    var lower = key.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(ENTITY_MAP, lower)) return ENTITY_MAP[lower];
    return m;
  });
}

var VOID_TAGS = Object.create(null);
['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr'].forEach(function (t) { VOID_TAGS[t] = true; });

/* =============================================================
 *  1. Event 家族
 * ============================================================= */
function Event(type, init) {
  init = init || {};
  this.type = String(type === undefined || type === null ? '' : type);
  this.bubbles = !!init.bubbles;
  this.cancelable = !!init.cancelable;
  this.composed = !!init.composed;
  this.detail = init.detail === undefined ? null : init.detail;
  this.defaultPrevented = false;
  this.isTrusted = false;
  this.timeStamp = Date.now();
  this.target = null;
  this.currentTarget = null;
  this.eventPhase = 0;
  this._stop = false;
  this._stopImmediate = false;
  this._dispatching = false;
  this._path = [];
  this._errors = [];
}
Event.prototype.preventDefault = function () {
  if (this.cancelable) this.defaultPrevented = true;
};
Event.prototype.stopPropagation = function () { this._stop = true; };
Event.prototype.stopImmediatePropagation = function () {
  this._stop = true;
  this._stopImmediate = true;
};
Event.prototype.composedPath = function () { return this._path.slice(); };
Event.prototype.initEvent = function (type, bubbles, cancelable) {
  this.type = String(type);
  this.bubbles = !!bubbles;
  this.cancelable = !!cancelable;
  return this;
};
Event.prototype.initCustomEvent = function (type, bubbles, cancelable, detail) {
  this.initEvent(type, bubbles, cancelable);
  this.detail = detail;
  return this;
};
Event.prototype.initMouseEvent = function (type, bubbles, cancelable) {
  return this.initEvent(type, bubbles, cancelable);
};

function CustomEvent(type, init) {
  Event.call(this, type, init);
  this.detail = init && init.detail !== undefined ? init.detail : null;
}
CustomEvent.prototype = Object.create(Event.prototype);
CustomEvent.prototype.constructor = CustomEvent;

function MouseEvent(type, init) {
  Event.call(this, type, init);
  init = init || {};
  this.screenX = init.screenX || 0;
  this.screenY = init.screenY || 0;
  this.clientX = init.clientX || 0;
  this.clientY = init.clientY || 0;
  this.pageX = init.pageX || 0;
  this.pageY = init.pageY || 0;
  this.button = init.button || 0;
  this.buttons = init.buttons || 0;
  this.ctrlKey = !!init.ctrlKey;
  this.shiftKey = !!init.shiftKey;
  this.altKey = !!init.altKey;
  this.metaKey = !!init.metaKey;
  this.relatedTarget = init.relatedTarget || null;
}
MouseEvent.prototype = Object.create(Event.prototype);
MouseEvent.prototype.constructor = MouseEvent;

function KeyboardEvent(type, init) {
  Event.call(this, type, init);
  init = init || {};
  this.key = init.key === undefined ? '' : String(init.key);
  this.code = init.code === undefined ? '' : String(init.code);
  this.keyCode = init.keyCode || 0;
  this.which = init.which || this.keyCode;
  this.charCode = init.charCode || 0;
  this.ctrlKey = !!init.ctrlKey;
  this.shiftKey = !!init.shiftKey;
  this.altKey = !!init.altKey;
  this.metaKey = !!init.metaKey;
  this.repeat = !!init.repeat;
  this.isComposing = !!init.isComposing;
}
KeyboardEvent.prototype = Object.create(Event.prototype);
KeyboardEvent.prototype.constructor = KeyboardEvent;

function FocusEvent(type, init) {
  Event.call(this, type, init);
  init = init || {};
  this.relatedTarget = init.relatedTarget || null;
}
FocusEvent.prototype = Object.create(Event.prototype);
FocusEvent.prototype.constructor = FocusEvent;

function InputEvent(type, init) {
  Event.call(this, type, init);
  init = init || {};
  this.data = init.data === undefined ? null : init.data;
  this.inputType = init.inputType === undefined ? '' : init.inputType;
  this.isComposing = !!init.isComposing;
}
InputEvent.prototype = Object.create(Event.prototype);
InputEvent.prototype.constructor = InputEvent;

function WheelEvent(type, init) {
  Event.call(this, type, init);
  init = init || {};
  this.deltaX = init.deltaX || 0;
  this.deltaY = init.deltaY || 0;
  this.deltaZ = init.deltaZ || 0;
  this.deltaMode = init.deltaMode || 0;
}
WheelEvent.prototype = Object.create(Event.prototype);
WheelEvent.prototype.constructor = WheelEvent;

function MessageEvent(type, init) {
  Event.call(this, type, init);
  init = init || {};
  this.data = init.data === undefined ? null : init.data;
  this.origin = init.origin === undefined ? '' : init.origin;
  this.source = init.source === undefined ? null : init.source;
  this.ports = init.ports || [];
}
MessageEvent.prototype = Object.create(Event.prototype);
MessageEvent.prototype.constructor = MessageEvent;

function MediaQueryList(query, matches) {
  this.media = String(query || '');
  this.matches = !!matches;
  this.onchange = null;
  this._listeners = Object.create(null);
}
MediaQueryList.prototype.addEventListener = function (type, fn) {
  (this._listeners[type] || (this._listeners[type] = [])).push(fn);
};
MediaQueryList.prototype.removeEventListener = function (type, fn) {
  var list = this._listeners[type];
  if (!list) return;
  var i = list.indexOf(fn);
  if (i !== -1) list.splice(i, 1);
};
MediaQueryList.prototype.addListener = MediaQueryList.prototype.addEventListener;
MediaQueryList.prototype.removeListener = MediaQueryList.prototype.removeEventListener;
MediaQueryList.prototype.dispatchEvent = function (evt) {
  var list = this._listeners[evt.type] || [];
  evt.target = this;
  evt.currentTarget = this;
  for (var i = 0; i < list.length; i++) list[i].call(this, evt);
  if (typeof this.onchange === 'function') this.onchange.call(this, evt);
  return !evt.defaultPrevented;
};

/* =============================================================
 *  2. 事件系统（attach 到任意带 _listeners 的对象）
 * ============================================================= */
function initTarget(target) {
  if (!target._listeners) target._listeners = Object.create(null);
  return target._listeners;
}

function addListener(target, type, fn, options) {
  if (!type || typeof fn !== 'function') return;
  var map = initTarget(target);
  var list = map[type] || (map[type] = []);
  var capture = options === true || (!!options && !!options.capture);
  var once = !!(options && typeof options === 'object' && options.once);
  for (var i = 0; i < list.length; i++) {
    if (list[i].fn === fn && list[i].capture === capture) return;
  }
  list.push({ fn: fn, capture: capture, once: once });
}

function removeListener(target, type, fn, options) {
  var map = target._listeners;
  if (!map) return;
  var list = map[type];
  if (!list) return;
  var capture = options === true || (!!options && !!options.capture);
  for (var i = 0; i < list.length; i++) {
    if (list[i].fn === fn && list[i].capture === capture) { list.splice(i, 1); break; }
  }
  if (!list.length) delete map[type];
}

function invokeListeners(target, event, mode) {
  var map = target._listeners;
  if (!map) return;
  var list = map[event.type];
  if (!list || !list.length) return;
  var copy = list.slice();
  for (var i = 0; i < copy.length; i++) {
    var item = copy[i];
    if (mode === true && !item.capture) continue;
    if (mode === false && item.capture) continue;
    if (item.once) removeListener(target, event.type, item.fn, { capture: item.capture });
    event.currentTarget = target;
    try {
      item.fn.call(target, event);
    } catch (e) {
      event._errors.push(e);
      if (typeof console !== 'undefined' && console.error) {
        console.error('[dom-stub] 事件监听器异常 [' + event.type + ']:', e && e.stack ? e.stack : e);
      }
    }
    if (event._stopImmediate) break;
  }
}

function invokePropertyHandler(target, event) {
  var key = 'on' + event.type;
  var fn = target[key];
  if (typeof fn === 'function') {
    event.currentTarget = target;
    try {
      var ret = fn.call(target, event);
      if (ret === false && event.cancelable) event.preventDefault();
    } catch (e) {
      event._errors.push(e);
      if (typeof console !== 'undefined' && console.error) {
        console.error('[dom-stub] on' + event.type + ' 异常:', e && e.stack ? e.stack : e);
      }
    }
  }
}

/** 在 target 上派发事件；path 为完整传播路径（target 在首位） */
function dispatchEventOn(target, event, path) {
  if (!event || (typeof event !== 'object' && typeof event !== 'function')) {
    throw new TypeError('dispatchEvent 需要一个 Event 对象');
  }
  if (event._dispatching) return !event.defaultPrevented;
  path = (path && path.length) ? path : [target];
  if (path[0] !== target) path = [target].concat(path);
  event._dispatching = true;
  event.target = path[0];
  event._path = path.slice();
  event.eventPhase = 0;
  var i;

  // 捕获阶段：window -> ... -> target 的父级
  for (i = path.length - 1; i > 0 && !event._stop; i--) {
    event.eventPhase = 1;
    event.currentTarget = path[i];
    invokeListeners(path[i], event, true);
    if (event._stopImmediate) break;
  }
  // 目标阶段
  if (!event._stop && path.length) {
    event.eventPhase = 2;
    event.currentTarget = path[0];
    invokeListeners(path[0], event, null);
    if (!event._stopImmediate) invokePropertyHandler(path[0], event);
  }
  // 冒泡阶段
  if (event.bubbles) {
    for (i = 1; i < path.length && !event._stop; i++) {
      event.eventPhase = 3;
      event.currentTarget = path[i];
      invokeListeners(path[i], event, false);
      if (!event._stopImmediate) invokePropertyHandler(path[i], event);
    }
  }

  event.eventPhase = 0;
  event.currentTarget = null;
  event._dispatching = false;
  return !event.defaultPrevented;
}

/* =============================================================
 *  3. CSSStyleDeclaration（含 Proxy，支持 style.width = '10px'）
 * ============================================================= */
function CSSStyleDeclaration() {
  this._props = Object.create(null);
  this._order = [];
}

Object.defineProperty(CSSStyleDeclaration.prototype, 'cssText', {
  get: function () {
    var out = [];
    for (var i = 0; i < this._order.length; i++) {
      var k = this._order[i];
      out.push(k + ': ' + this._props[k] + ';');
    }
    return out.join(' ');
  },
  set: function (value) {
    this._props = Object.create(null);
    this._order = [];
    var parts = String(value === null || value === undefined ? '' : value).split(';');
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      var idx = part.indexOf(':');
      if (idx === -1) continue;
      var name = part.slice(0, idx).trim();
      var val = part.slice(idx + 1).trim();
      if (!name || !val) continue;
      this.setProperty(name, val);
    }
  }
});

CSSStyleDeclaration.prototype.setProperty = function (name, value, priority) {
  var key = kebab(name);
  if (!key) return;
  var v = value === null || value === undefined ? '' : String(value);
  if (v === '') {
    this.removeProperty(key);
    return;
  }
  if (!(key in this._props)) this._order.push(key);
  this._props[key] = v;
  if (priority) this._props['!' + key] = String(priority);
};
CSSStyleDeclaration.prototype.getPropertyValue = function (name) {
  var key = kebab(name);
  if (key in this._props) return this._props[key];
  return '';
};
CSSStyleDeclaration.prototype.getPropertyPriority = function (name) {
  var key = kebab(name);
  return this._props['!' + key] ? this._props['!' + key] : '';
};
CSSStyleDeclaration.prototype.removeProperty = function (name) {
  var key = kebab(name);
  var old = this._props[key] === undefined ? '' : this._props[key];
  delete this._props[key];
  delete this._props['!' + key];
  var idx = this._order.indexOf(key);
  if (idx !== -1) this._order.splice(idx, 1);
  return old;
};
Object.defineProperty(CSSStyleDeclaration.prototype, 'length', {
  get: function () { return this._order.length; }
});
CSSStyleDeclaration.prototype.item = function (index) {
  return this._order[index] || '';
};

/**
 * 创建可读写样式对象（Proxy）：
 *   el.style.color = 'red'  /  el.style.cssText = '...'  /  el.style.setProperty('--x','1')
 */
function createStyle() {
  var decl = new CSSStyleDeclaration();
  return new Proxy(decl, {
    get: function (target, prop) {
      if (prop === 'cssText') return target.cssText;
      if (typeof prop === 'symbol') {
        var sv = target[prop];
        return typeof sv === 'function' ? sv.bind(target) : sv;
      }
      if (prop in target) {
        var v = target[prop];
        return typeof v === 'function' ? v.bind(target) : v;
      }
      return target.getPropertyValue(prop);
    },
    set: function (target, prop, value) {
      if (prop === 'cssText') { target.cssText = value; return true; }
      if (typeof prop === 'symbol') { target[prop] = value; return true; }
      if (prop in target && typeof target[prop] === 'function') { target[prop] = value; return true; }
      target.setProperty(prop, value);
      return true;
    },
    has: function (target, prop) {
      if (typeof prop === 'symbol') return prop in target;
      return (prop in target) || (kebab(prop) in target._props);
    },
    deleteProperty: function (target, prop) {
      if (typeof prop === 'string') target.removeProperty(prop);
      return true;
    },
    ownKeys: function (target) {
      return target._order.slice();
    },
    getOwnPropertyDescriptor: function (target, prop) {
      if (typeof prop === 'string' && (kebab(prop) in target._props)) {
        return { enumerable: true, configurable: true, value: target._props[kebab(prop)] };
      }
      return Object.getOwnPropertyDescriptor(target, prop);
    }
  });
}

/** 计算样式：内联 -> :root 变量 -> '' */
function createComputedStyle(el) {
  var doc = el.ownerDocument || null;
  var inline = el.style ? el.style._props : Object.create(null);
  var root = doc && doc.documentElement && doc.documentElement !== el && doc.documentElement.style
    ? doc.documentElement.style._props : null;
  function lookup(name) {
    var key = kebab(name);
    if (key in inline) return inline[key];
    if (root && key in root) return root[key];
    return '';
  }
  var decl = {
    getPropertyValue: function (name) { return lookup(name); },
    getPropertyPriority: function () { return ''; },
    removeProperty: function () { return ''; },
    setProperty: function () { }
  };
  Object.defineProperty(decl, 'length', { get: function () { return Object.keys(inline).length; } });
  return new Proxy(decl, {
    get: function (target, prop) {
      if (typeof prop === 'symbol') return target[prop];
      if (prop in target) {
        var v = target[prop];
        return typeof v === 'function' ? v.bind(target) : v;
      }
      return lookup(prop);
    },
    has: function (target, prop) {
      if (typeof prop === 'symbol') return prop in target;
      return (prop in target) || (prop === 'cssText');
    }
  });
}

/* =============================================================
 *  4. DOMTokenList / dataset
 * ============================================================= */
function DOMTokenList(el) {
  this._el = el;
}
Object.defineProperty(DOMTokenList.prototype, '_items', {
  get: function () {
    var raw = this._el.getAttribute('class');
    if (!raw) return [];
    var parts = String(raw).split(/\s+/);
    var out = [];
    for (var i = 0; i < parts.length; i++) if (parts[i]) out.push(parts[i]);
    return out;
  }
});
DOMTokenList.prototype._write = function (items) {
  this._el.setAttribute('class', items.join(' '));
};
Object.defineProperty(DOMTokenList.prototype, 'length', {
  get: function () { return this._items.length; }
});
DOMTokenList.prototype.item = function (i) { return this._items[i] || null; };
DOMTokenList.prototype.contains = function (token) {
  return this._items.indexOf(String(token)) !== -1;
};
DOMTokenList.prototype.add = function () {
  var items = this._items;
  for (var i = 0; i < arguments.length; i++) {
    var t = String(arguments[i]);
    if (t && items.indexOf(t) === -1) items.push(t);
  }
  this._write(items);
};
DOMTokenList.prototype.remove = function () {
  var items = this._items;
  for (var i = 0; i < arguments.length; i++) {
    var idx = items.indexOf(String(arguments[i]));
    if (idx !== -1) items.splice(idx, 1);
  }
  this._write(items);
};
DOMTokenList.prototype.toggle = function (token, force) {
  token = String(token);
  var has = this.contains(token);
  var on = force === undefined ? !has : !!force;
  if (on && !has) this.add(token);
  else if (!on && has) this.remove(token);
  return on;
};
DOMTokenList.prototype.replace = function (oldToken, newToken) {
  var items = this._items;
  var idx = items.indexOf(String(oldToken));
  if (idx === -1) return false;
  items[idx] = String(newToken);
  this._write(items);
  return true;
};
DOMTokenList.prototype.forEach = function (fn, thisArg) {
  this._items.forEach(fn, thisArg);
};
DOMTokenList.prototype.entries = function () { return this._items.entries(); };
DOMTokenList.prototype.keys = function () { return this._items.keys(); };
DOMTokenList.prototype.values = function () { return this._items.values(); };
DOMTokenList.prototype[Symbol.iterator] = function () { return this._items[Symbol.iterator](); };
Object.defineProperty(DOMTokenList.prototype, 'value', {
  get: function () { return this._items.join(' '); },
  set: function (v) { this._write(String(v || '').split(/\s+/).filter(function (s) { return !!s; })); }
});
DOMTokenList.prototype.toString = function () { return this._items.join(' '); };

function createDataset(el) {
  return new Proxy({}, {
    get: function (target, prop) {
      if (typeof prop !== 'string') return undefined;
      var name = 'data-' + kebab(prop);
      var v = el.getAttribute(name);
      return v === null ? undefined : v;
    },
    set: function (target, prop, value) {
      if (typeof prop !== 'string') return true;
      el.setAttribute('data-' + kebab(prop), value === null || value === undefined ? '' : String(value));
      return true;
    },
    has: function (target, prop) {
      if (typeof prop !== 'string') return false;
      return el.hasAttribute('data-' + kebab(prop));
    },
    deleteProperty: function (target, prop) {
      if (typeof prop === 'string') el.removeAttribute('data-' + kebab(prop));
      return true;
    },
    ownKeys: function () {
      var names = el.getAttributeNames();
      var out = [];
      for (var i = 0; i < names.length; i++) {
        if (names[i].indexOf('data-') === 0) out.push(camel(names[i].slice(5)));
      }
      return out;
    },
    getOwnPropertyDescriptor: function (target, prop) {
      if (typeof prop === 'string' && el.hasAttribute('data-' + kebab(prop))) {
        return { enumerable: true, configurable: true, value: el.getAttribute('data-' + kebab(prop)) };
      }
      return undefined;
    }
  });
}

/* =============================================================
 *  5. 选择器引擎（轻量）：tag / #id / .class / [attr op value] / 常用伪类
 *     组合器支持：后代(空格) / 子代(>)
 * ============================================================= */
var selectorCache = Object.create(null);

function parseCompound(text) {
  var compound = { tag: null, id: null, classes: [], attrs: [], pseudos: [] };
  var i = 0;
  var len = text.length;
  while (i < len) {
    var ch = text.charAt(i);
    if (ch === '*') { i++; continue; }
    if (ch === '.') {
      var start = ++i;
      while (i < len && /[A-Za-z0-9_\-]/.test(text.charAt(i))) i++;
      compound.classes.push(text.slice(start, i));
      continue;
    }
    if (ch === '#') {
      var start2 = ++i;
      while (i < len && /[A-Za-z0-9_\-]/.test(text.charAt(i))) i++;
      compound.id = text.slice(start2, i);
      continue;
    }
    if (ch === '[') {
      var end = findClose(text, i, '[', ']');
      var body = text.slice(i + 1, end).trim();
      i = end + 1;
      var m = body.match(/^([^\s~^$*|=]+)\s*(?:([~^$*|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+)))?$/);
      if (m) {
        compound.attrs.push({
          name: m[1].toLowerCase(),
          op: m[2] || null,
          value: m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : m[5])
        });
      } else {
        compound.attrs.push({ name: body.split(/\s/)[0].toLowerCase(), op: null, value: null });
      }
      continue;
    }
    if (ch === ':') {
      var pStart = ++i;
      while (i < len && /[A-Za-z\-]/.test(text.charAt(i))) i++;
      var pName = text.slice(pStart, i).toLowerCase();
      var arg = null;
      if (text.charAt(i) === '(') {
        var pEnd = findClose(text, i, '(', ')');
        arg = text.slice(i + 1, pEnd).trim();
        i = pEnd + 1;
      }
      compound.pseudos.push({ name: pName, arg: arg });
      continue;
    }
    // 标签名
    var tStart = i;
    while (i < len && /[A-Za-z0-9_\-]/.test(text.charAt(i))) i++;
    if (i > tStart) {
      compound.tag = text.slice(tStart, i).toLowerCase();
    } else {
      i++;
    }
  }
  return compound;
}

function findClose(text, from, open, close) {
  var depth = 0;
  for (var i = from; i < text.length; i++) {
    var c = text.charAt(i);
    if (c === '"' || c === "'") {
      var quote = c;
      i++;
      while (i < text.length && text.charAt(i) !== quote) i++;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return text.length - 1;
}

function parseSelector(selector) {
  var cached = selectorCache[selector];
  if (cached) return cached;
  var groups = [];
  var rawGroups = String(selector).split(',');
  for (var g = 0; g < rawGroups.length; g++) {
    var raw = rawGroups[g].trim();
    if (!raw) continue;
    var parts = [];
    var buf = '';
    var pendingComb = ' ';
    var depth = 0;
    var i = 0;
    while (i < raw.length) {
      var ch = raw.charAt(i);
      if (ch === '[' || ch === '(') depth++;
      else if (ch === ']' || ch === ')') depth--;
      if (depth === 0 && (ch === '>' || ch === '+' || ch === '~' || /\s/.test(ch))) {
        if (buf.trim()) {
          parts.push({ compound: parseCompound(buf.trim()), combinator: pendingComb });
          buf = '';
          pendingComb = ' ';
        }
        if (ch === '>' || ch === '+' || ch === '~') pendingComb = ch;
        i++;
        continue;
      }
      buf += ch;
      i++;
    }
    if (buf.trim()) parts.push({ compound: parseCompound(buf.trim()), combinator: pendingComb });
    if (parts.length) groups.push(parts);
  }
  selectorCache[selector] = groups;
  return groups;
}

function previousElementSibling(el) {
  if (!el.parentNode) return null;
  var list = el.parentNode._childNodes;
  var idx = list.indexOf(el);
  for (var i = idx - 1; i >= 0; i--) if (list[i].nodeType === 1) return list[i];
  return null;
}

function matchCompound(el, compound) {
  if (!el || el.nodeType !== 1) return false;
  if (compound.tag) {
    var name = String(el.localName || el.tagName || '').toLowerCase();
    if (name !== compound.tag) return false;
  }
  if (compound.id && el.getAttribute('id') !== compound.id) return false;
  for (var c = 0; c < compound.classes.length; c++) {
    if (!el.classList.contains(compound.classes[c])) return false;
  }
  for (var a = 0; a < compound.attrs.length; a++) {
    var attr = compound.attrs[a];
    var val = el.getAttribute(attr.name);
    if (val === null) return false;
    if (attr.op === null) continue;
    var expect = attr.value === undefined ? '' : attr.value;
    if (attr.op === '=') { if (val !== expect) return false; }
    else if (attr.op === '~=') { if ((' ' + val + ' ').indexOf(' ' + expect + ' ') === -1) return false; }
    else if (attr.op === '^=') { if (val.indexOf(expect) !== 0) return false; }
    else if (attr.op === '$=') { if (val.length < expect.length || val.slice(val.length - expect.length) !== expect) return false; }
    else if (attr.op === '*=') { if (val.indexOf(expect) === -1) return false; }
    else if (attr.op === '|=') { if (val !== expect && val.indexOf(expect + '-') !== 0) return false; }
  }
  for (var p = 0; p < compound.pseudos.length; p++) {
    if (!matchPseudo(el, compound.pseudos[p])) return false;
  }
  return true;
}

function matchPseudo(el, pseudo) {
  var siblings = el.parentNode ? el.parentNode._childNodes.filter(function (n) { return n.nodeType === 1; }) : [el];
  var index = siblings.indexOf(el);
  var name = pseudo.name;
  if (name === 'first-child') return index === 0;
  if (name === 'last-child') return index === siblings.length - 1;
  if (name === 'only-child') return siblings.length === 1;
  if (name === 'nth-child') {
    var arg = String(pseudo.arg || '').trim().toLowerCase();
    if (arg === 'odd') return index % 2 === 0;
    if (arg === 'even') return index % 2 === 1;
    var n = parseInt(arg, 10);
    return !isNaN(n) && index === n - 1;
  }
  if (name === 'empty') return el._childNodes.length === 0;
  if (name === 'not') {
    var inner = pseudo.arg || '';
    var inners = parseSelector(inner);
    for (var g = 0; g < inners.length; g++) {
      if (matchesComplex(el, inners[g])) return false;
    }
    return true;
  }
  if (name === 'checked') return el.checked === true;
  if (name === 'disabled') return el.disabled === true;
  if (name === 'enabled') return el.disabled !== true;
  if (name === 'visible') return el.hidden !== true;
  return true;
}

function matchesComplex(el, parts) {
  if (!parts || !parts.length) return false;
  function matchAt(node, index) {
    if (!node || node.nodeType !== 1) return false;
    if (!matchCompound(node, parts[index].compound)) return false;
    if (index === 0) return true;
    var comb = parts[index].combinator;
    if (comb === '>') return matchAt(node.parentNode, index - 1);
    if (comb === '+') return matchAt(previousElementSibling(node), index - 1);
    if (comb === '~') {
      var prev = previousElementSibling(node);
      while (prev) {
        if (matchAt(prev, index - 1)) return true;
        prev = previousElementSibling(prev);
      }
      return false;
    }
    var parent = node.parentNode;
    while (parent) {
      if (matchAt(parent, index - 1)) return true;
      parent = parent.parentNode;
    }
    return false;
  }
  return matchAt(el, parts.length - 1);
}

function matches(el, selector) {
  var groups = parseSelector(selector);
  for (var i = 0; i < groups.length; i++) {
    if (matchesComplex(el, groups[i])) return true;
  }
  return false;
}

function collectDescendants(root, out) {
  var list = root._childNodes;
  for (var i = 0; i < list.length; i++) {
    var node = list[i];
    if (node.nodeType === 1) {
      out.push(node);
      collectDescendants(node, out);
    }
  }
  return out;
}

function querySelectorAllOn(root, selector) {
  var groups = parseSelector(selector);
  var all = collectDescendants(root, []);
  var out = [];
  for (var i = 0; i < all.length; i++) {
    for (var g = 0; g < groups.length; g++) {
      if (matchesComplex(all[i], groups[g])) { out.push(all[i]); break; }
    }
  }
  return out;
}

/* =============================================================
 *  6. innerHTML 最小解析器 / 序列化
 * ============================================================= */
function parseAttrs(raw, el) {
  var re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  var m;
  while ((m = re.exec(raw))) {
    var name = m[1];
    if (!name) continue;
    var value = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
    try {
      el.setAttribute(name, decodeEntities(value));
    } catch (e) { /* 非法属性名忽略 */ }
  }
}

function findTagEnd(html, from) {
  var i = from;
  while (i < html.length) {
    var ch = html.charAt(i);
    if (ch === '"' || ch === "'") {
      var quote = ch;
      i++;
      while (i < html.length && html.charAt(i) !== quote) i++;
      i++;
      continue;
    }
    if (ch === '>') return i;
    i++;
  }
  return -1;
}

function parseHTML(html, doc) {
  var root = [];
  var stack = [{ el: null, list: root }];
  var current = function () { return stack[stack.length - 1]; };
  var appendChildNode = function (node) {
    var top = current();
    if (top.el) top.el.appendChild(node);
    else top.list.push(node);
  };
  var textBuffer = '';
  var flushText = function () {
    if (!textBuffer) return;
    appendChildNode(doc.createTextNode(decodeEntities(textBuffer)));
    textBuffer = '';
  };

  var i = 0;
  var len = html.length;
  while (i < len) {
    var ch = html.charAt(i);
    if (ch !== '<') {
      var next = html.indexOf('<', i);
      if (next === -1) next = len;
      textBuffer += html.slice(i, next);
      i = next;
      continue;
    }
    // 注释
    if (html.substr(i, 4) === '<!--') {
      flushText();
      var cEnd = html.indexOf('-->', i + 4);
      var cText = html.slice(i + 4, cEnd === -1 ? len : cEnd);
      appendChildNode(doc.createComment(cText));
      i = cEnd === -1 ? len : cEnd + 3;
      continue;
    }
    // doctype / CDATA
    if (html.charAt(i + 1) === '!') {
      flushText();
      var dEnd = html.indexOf('>', i);
      i = dEnd === -1 ? len : dEnd + 1;
      continue;
    }
    // 结束标签
    if (html.charAt(i + 1) === '/') {
      flushText();
      var ctEnd = html.indexOf('>', i);
      if (ctEnd === -1) ctEnd = len;
      var closeName = html.slice(i + 2, ctEnd).trim().toLowerCase();
      // 找到最近的同名开放元素
      var found = -1;
      for (var s = stack.length - 1; s > 0; s--) {
        if (stack[s].name === closeName) { found = s; break; }
      }
      if (found !== -1) stack.length = found;
      i = ctEnd + 1;
      continue;
    }
    // 开始标签
    var tagEnd = findTagEnd(html, i + 1);
    if (tagEnd === -1) { textBuffer += html.slice(i); break; }
    flushText();
    var raw = html.slice(i + 1, tagEnd);
    var selfClose = false;
    if (raw.charAt(raw.length - 1) === '/') { selfClose = true; raw = raw.slice(0, -1); }
    var nameMatch = raw.match(/^([A-Za-z0-9:_\-]*)/);
    var tagName = nameMatch && nameMatch[1] ? nameMatch[1] : 'div';
    var attrsRaw = raw.slice(nameMatch ? nameMatch[0].length : 0);
    var lowerTag = tagName.toLowerCase();
    var parentEl = current().el;
    var inSvg = parentEl && parentEl.namespaceURI === SVG_NS;
    var el;
    if (lowerTag === 'svg' || inSvg) el = doc.createElementNS(SVG_NS, tagName);
    else if (lowerTag === 'iframe') el = doc.createElement('iframe');
    else el = doc.createElement(lowerTag);
    if (attrsRaw) parseAttrs(attrsRaw, el);
    appendChildNode(el);
    i = tagEnd + 1;

    // script / style：内容按原始文本处理
    if (lowerTag === 'script' || lowerTag === 'style') {
      var closeIndex = html.toLowerCase().indexOf('</' + lowerTag, i);
      var rawText = closeIndex === -1 ? html.slice(i) : html.slice(i, closeIndex);
      if (rawText) el.appendChild(doc.createTextNode(rawText));
      var gt = closeIndex === -1 ? -1 : html.indexOf('>', closeIndex);
      i = gt === -1 ? len : gt + 1;
      continue;
    }
    if (!selfClose && !VOID_TAGS[lowerTag]) {
      stack.push({ el: el, list: null, name: lowerTag });
    }
  }
  flushText();
  return root;
}

function serializeChildren(el) {
  var out = '';
  var list = el._childNodes;
  for (var i = 0; i < list.length; i++) {
    var node = list[i];
    if (node.nodeType === 1) {
      var tag = node.localName || node.tagName || 'div';
      var lower = String(tag).toLowerCase();
      out += '<' + tag;
      var names = node.getAttributeNames();
      for (var a = 0; a < names.length; a++) {
        out += ' ' + names[a] + '="' + escapeAttr(node.getAttribute(names[a])) + '"';
      }
      if (VOID_TAGS[lower]) {
        out += '>';
      } else if (lower === 'script' || lower === 'style') {
        out += '>' + node.textContent + '</' + tag + '>';
      } else {
        out += '>' + serializeChildren(node) + '</' + tag + '>';
      }
    } else if (node.nodeType === 3) {
      out += escapeText(node.data);
    } else if (node.nodeType === 8) {
      out += '<!--' + node.data + '-->';
    }
  }
  return out;
}

/* =============================================================
 *  7. Node 基类
 * ============================================================= */
function Node(ownerDocument) {
  this._listeners = Object.create(null);
  this.ownerDocument = ownerDocument || null;
  this.parentNode = null;
  this._childNodes = [];
  this.nodeType = 0;
  this.nodeName = '';
}

Object.defineProperty(Node.prototype, 'childNodes', {
  get: function () { return this._childNodes; }
});
Object.defineProperty(Node.prototype, 'firstChild', {
  get: function () { return this._childNodes.length ? this._childNodes[0] : null; }
});
Object.defineProperty(Node.prototype, 'lastChild', {
  get: function () { return this._childNodes.length ? this._childNodes[this._childNodes.length - 1] : null; }
});
Object.defineProperty(Node.prototype, 'nextSibling', {
  get: function () {
    if (!this.parentNode) return null;
    var list = this.parentNode._childNodes;
    var i = list.indexOf(this);
    return i === -1 || i === list.length - 1 ? null : list[i + 1];
  }
});
Object.defineProperty(Node.prototype, 'previousSibling', {
  get: function () {
    if (!this.parentNode) return null;
    var list = this.parentNode._childNodes;
    var i = list.indexOf(this);
    return i <= 0 ? null : list[i - 1];
  }
});
Object.defineProperty(Node.prototype, 'parentElement', {
  get: function () { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
});
Object.defineProperty(Node.prototype, 'isConnected', {
  get: function () {
    var root = this;
    while (root.parentNode) root = root.parentNode;
    return root.nodeType === 9;
  }
});

Node.prototype.appendChild = function (node) {
  if (!node) return node;
  if (node.nodeType === 11) {
    var fragChildren = node._childNodes.slice();
    for (var i = 0; i < fragChildren.length; i++) this.appendChild(fragChildren[i]);
    return node;
  }
  if (node.parentNode) node.parentNode.removeChild(node);
  this._childNodes.push(node);
  node.parentNode = this;
  if (!node.ownerDocument && this.ownerDocument) node.ownerDocument = this.ownerDocument;
  return node;
};
Node.prototype.insertBefore = function (node, ref) {
  if (!node) return node;
  if (!ref) return this.appendChild(node);
  if (node.nodeType === 11) {
    var fragChildren = node._childNodes.slice();
    for (var f = 0; f < fragChildren.length; f++) this.insertBefore(fragChildren[f], ref);
    return node;
  }
  var idx = this._childNodes.indexOf(ref);
  if (idx === -1) return this.appendChild(node);
  if (node.parentNode) node.parentNode.removeChild(node);
  idx = this._childNodes.indexOf(ref);
  if (idx === -1) idx = this._childNodes.length;
  this._childNodes.splice(idx, 0, node);
  node.parentNode = this;
  if (!node.ownerDocument && this.ownerDocument) node.ownerDocument = this.ownerDocument;
  return node;
};
Node.prototype.removeChild = function (node) {
  var idx = this._childNodes.indexOf(node);
  if (idx === -1) throw new Error('removeChild: 节点不是当前节点的子节点');
  this._childNodes.splice(idx, 1);
  node.parentNode = null;
  return node;
};
Node.prototype.replaceChild = function (newNode, oldNode) {
  var idx = this._childNodes.indexOf(oldNode);
  if (idx === -1) throw new Error('replaceChild: 旧节点不是当前节点的子节点');
  this.removeChild(oldNode);
  this.insertBefore(newNode, this._childNodes[idx] || null);
  return oldNode;
};
Node.prototype.hasChildNodes = function () { return this._childNodes.length > 0; };
Node.prototype.contains = function (node) {
  var cur = node;
  while (cur) {
    if (cur === this) return true;
    cur = cur.parentNode;
  }
  return false;
};
Node.prototype.remove = function () {
  if (this.parentNode) this.parentNode.removeChild(this);
};
Node.prototype.replaceWith = function () {
  if (!this.parentNode) return;
  var parent = this.parentNode;
  var ref = this.nextSibling;
  parent.removeChild(this);
  for (var i = 0; i < arguments.length; i++) {
    var node = arguments[i];
    if (typeof node === 'string') node = this.ownerDocument.createTextNode(node);
    parent.insertBefore(node, ref);
  }
};
Node.prototype.before = function () {
  if (!this.parentNode) return;
  var parent = this.parentNode;
  for (var i = 0; i < arguments.length; i++) {
    var node = arguments[i];
    if (typeof node === 'string') node = this.ownerDocument.createTextNode(node);
    parent.insertBefore(node, this);
  }
};
Node.prototype.after = function () {
  if (!this.parentNode) return;
  var parent = this.parentNode;
  var ref = this.nextSibling;
  for (var i = 0; i < arguments.length; i++) {
    var node = arguments[i];
    if (typeof node === 'string') node = this.ownerDocument.createTextNode(node);
    parent.insertBefore(node, ref);
  }
};
Node.prototype.remove = Node.prototype.remove;
Node.prototype.dispatchEvent = function (event) {
  return dispatchEventOn(this, event, this._buildPath());
};
Node.prototype._buildPath = function () {
  var path = [this];
  var cur = this.parentNode;
  while (cur) {
    path.push(cur);
    cur = cur.parentNode;
  }
  var doc = this.ownerDocument;
  if (doc && path.indexOf(doc) === -1) path.push(doc);
  if (doc && doc.defaultView && path.indexOf(doc.defaultView) === -1) path.push(doc.defaultView);
  return path;
};
Node.prototype.getRootNode = function () {
  var cur = this;
  while (cur.parentNode) cur = cur.parentNode;
  return cur;
};
Node.prototype.addEventListener = function (type, fn, options) { addListener(this, type, fn, options); };
Node.prototype.removeEventListener = function (type, fn, options) { removeListener(this, type, fn, options); };

Object.defineProperty(Node.prototype, 'textContent', {
  get: function () {
    var out = '';
    for (var i = 0; i < this._childNodes.length; i++) {
      var node = this._childNodes[i];
      if (node.nodeType === 3) out += node.data;
      else if (node.nodeType === 1) out += node.textContent;
    }
    return out;
  },
  set: function (value) {
    this._childNodes = [];
    var text = value === null || value === undefined ? '' : String(value);
    if (text) this.appendChild((this.ownerDocument || this).createTextNode(text));
  }
});

Node.prototype.cloneNode = function (deep) {
  var clone = this._cloneShallow();
  if (deep) {
    for (var i = 0; i < this._childNodes.length; i++) {
      clone.appendChild(this._childNodes[i].cloneNode(true));
    }
  }
  return clone;
};

/* =============================================================
 *  8. Text / Comment / DocumentFragment
 * ============================================================= */
function Text(ownerDocument, data) {
  Node.call(this, ownerDocument);
  this.nodeType = 3;
  this.nodeName = '#text';
  this.data = data === undefined || data === null ? '' : String(data);
}
Text.prototype = Object.create(Node.prototype);
Text.prototype.constructor = Text;
Object.defineProperty(Text.prototype, 'nodeValue', {
  get: function () { return this.data; },
  set: function (v) { this.data = String(v); }
});
Object.defineProperty(Text.prototype, 'wholeText', {
  get: function () { return this.data; }
});
Text.prototype._cloneShallow = function () { return new Text(this.ownerDocument, this.data); };

function Comment(ownerDocument, data) {
  Node.call(this, ownerDocument);
  this.nodeType = 8;
  this.nodeName = '#comment';
  this.data = data === undefined || data === null ? '' : String(data);
}
Comment.prototype = Object.create(Node.prototype);
Comment.prototype.constructor = Comment;
Comment.prototype._cloneShallow = function () { return new Comment(this.ownerDocument, this.data); };

function DocumentFragment(ownerDocument) {
  Node.call(this, ownerDocument);
  this.nodeType = 11;
  this.nodeName = '#document-fragment';
}
DocumentFragment.prototype = Object.create(Node.prototype);
DocumentFragment.prototype.constructor = DocumentFragment;
DocumentFragment.prototype._cloneShallow = function () {
  return new DocumentFragment(this.ownerDocument);
};
Object.defineProperty(DocumentFragment.prototype, 'children', {
  get: function () { return this._childNodes.filter(function (n) { return n.nodeType === 1; }); }
});
DocumentFragment.prototype.querySelector = function (sel) {
  var list = querySelectorAllOn(this, sel);
  return list.length ? list[0] : null;
};
DocumentFragment.prototype.querySelectorAll = function (sel) {
  return querySelectorAllOn(this, sel);
};

/* =============================================================
 *  9. Element / HTMLElement / SVGElement / HTMLIFrameElement
 * ============================================================= */
function Element(ownerDocument, tagName, namespaceURI) {
  Node.call(this, ownerDocument);
  this.nodeType = 1;
  this.namespaceURI = namespaceURI || HTML_NS;
  var isHtml = this.namespaceURI === HTML_NS;
  this.localName = isHtml ? String(tagName || 'div').toLowerCase() : String(tagName || 'div');
  this.tagName = isHtml ? this.localName.toUpperCase() : this.localName;
  this.nodeName = this.tagName;
  this._attrs = Object.create(null);
  this._classList = null;
  this._style = null;
  this._dataset = null;
  this._value = undefined;
  this._checked = undefined;
  this._selected = undefined;
  this._rect = null;
  this._size = null;
}
Element.prototype = Object.create(Node.prototype);
Element.prototype.constructor = Element;

Object.defineProperty(Element.prototype, 'id', {
  get: function () { return this.getAttribute('id') || ''; },
  set: function (v) { this.setAttribute('id', v); }
});
Object.defineProperty(Element.prototype, 'className', {
  get: function () { return this.getAttribute('class') || ''; },
  set: function (v) { this.setAttribute('class', v === null || v === undefined ? '' : String(v)); }
});
Object.defineProperty(Element.prototype, 'classList', {
  get: function () {
    if (!this._classList) this._classList = new DOMTokenList(this);
    return this._classList;
  }
});
Object.defineProperty(Element.prototype, 'style', {
  get: function () {
    if (!this._style) this._style = createStyle();
    return this._style;
  },
  set: function (v) {
    if (!this._style) this._style = createStyle();
    if (typeof v === 'string') this._style.cssText = v;
    else if (v && typeof v === 'object') {
      for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) this._style.setProperty(k, v[k]);
    }
  }
});
Object.defineProperty(Element.prototype, 'dataset', {
  get: function () {
    if (!this._dataset) this._dataset = createDataset(this);
    return this._dataset;
  }
});
Object.defineProperty(Element.prototype, 'attributes', {
  get: function () {
    var out = [];
    var names = this.getAttributeNames();
    for (var i = 0; i < names.length; i++) {
      out.push({ name: names[i], nodeName: names[i], localName: names[i], value: this.getAttribute(names[i]), specified: true });
    }
    out.getNamedItem = function (name) {
      for (var j = 0; j < out.length; j++) if (out[j].name === name) return out[j];
      return null;
    };
    out.item = function (i) { return out[i] || null; };
    return out;
  }
});
Object.defineProperty(Element.prototype, 'children', {
  get: function () { return this._childNodes.filter(function (n) { return n.nodeType === 1; }); }
});
Object.defineProperty(Element.prototype, 'childElementCount', {
  get: function () { return this.children.length; }
});
Object.defineProperty(Element.prototype, 'firstElementChild', {
  get: function () { var c = this.children; return c.length ? c[0] : null; }
});
Object.defineProperty(Element.prototype, 'lastElementChild', {
  get: function () { var c = this.children; return c.length ? c[c.length - 1] : null; }
});
Object.defineProperty(Element.prototype, 'nextElementSibling', {
  get: function () { return previousElementSibling(this.nextSibling) || null; }
});
Object.defineProperty(Element.prototype, 'previousElementSibling', {
  get: function () { return previousElementSibling(this); }
});

Element.prototype.setAttribute = function (name, value) {
  var key = String(name);
  if (this.namespaceURI === HTML_NS) key = key.toLowerCase();
  var v = value === null || value === undefined ? '' : String(value);
  if (key === 'style') {
    this.style.cssText = v;
    return;
  }
  if (key === 'class') {
    this._attrs['class'] = v;
    return;
  }
  this._attrs[key] = v;
};
Element.prototype.setAttributeNS = function (ns, qualifiedName, value) {
  this._attrs[String(qualifiedName)] = value === null || value === undefined ? '' : String(value);
};
Element.prototype.getAttribute = function (name) {
  var key = this.namespaceURI === HTML_NS ? String(name).toLowerCase() : String(name);
  if (key === 'style') return this.style.cssText;
  if (key in this._attrs) return this._attrs[key];
  return null;
};
Element.prototype.getAttributeNS = function (ns, localName) {
  var key = String(localName);
  for (var name in this._attrs) {
    if (name === key || name.indexOf(':' + key) !== -1) return this._attrs[name];
  }
  return null;
};
Element.prototype.hasAttribute = function (name) {
  var key = this.namespaceURI === HTML_NS ? String(name).toLowerCase() : String(name);
  if (key === 'style') return this.style.cssText !== '';
  return key in this._attrs;
};
Element.prototype.removeAttribute = function (name) {
  var key = this.namespaceURI === HTML_NS ? String(name).toLowerCase() : String(name);
  if (key === 'style') { this.style.cssText = ''; return; }
  delete this._attrs[key];
};
Element.prototype.toggleAttribute = function (name, force) {
  var has = this.hasAttribute(name);
  var on = force === undefined ? !has : !!force;
  if (on) this.setAttribute(name, '');
  else this.removeAttribute(name);
  return on;
};
Element.prototype.getAttributeNames = function () {
  var names = Object.keys(this._attrs);
  if (this.style.cssText) names.push('style');
  return names;
};

/* ---- 常用属性反射 ---- */
function defineReflect(prop, attr, boolean) {
  Object.defineProperty(Element.prototype, prop, {
    get: function () {
      if (boolean) return this.hasAttribute(attr);
      var v = this.getAttribute(attr);
      return v === null ? '' : v;
    },
    set: function (v) {
      if (boolean) {
        if (v) this.setAttribute(attr, '');
        else this.removeAttribute(attr);
      } else {
        this.setAttribute(attr, v === null || v === undefined ? '' : v);
      }
    }
  });
}
defineReflect('src', 'src', false);
defineReflect('href', 'href', false);
defineReflect('title', 'title', false);
defineReflect('name', 'name', false);
defineReflect('type', 'type', false);
defineReflect('placeholder', 'placeholder', false);
defineReflect('alt', 'alt', false);
defineReflect('target', 'target', false);
defineReflect('rel', 'rel', false);
defineReflect('width', 'width', false);
defineReflect('height', 'height', false);
defineReflect('role', 'role', false);
defineReflect('htmlFor', 'for', false);
defineReflect('disabled', 'disabled', true);
defineReflect('readOnly', 'readonly', true);
defineReflect('hidden', 'hidden', true);
defineReflect('multiple', 'multiple', true);

Object.defineProperty(Element.prototype, 'value', {
  get: function () {
    if (this._value !== undefined) return this._value;
    var attr = this.getAttribute('value');
    return attr === null ? '' : attr;
  },
  set: function (v) { this._value = v === null || v === undefined ? '' : String(v); }
});
Object.defineProperty(Element.prototype, 'checked', {
  get: function () {
    if (this._checked !== undefined) return this._checked;
    return this.hasAttribute('checked');
  },
  set: function (v) { this._checked = !!v; }
});
Object.defineProperty(Element.prototype, 'selected', {
  get: function () {
    if (this._selected !== undefined) return this._selected;
    return this.hasAttribute('selected');
  },
  set: function (v) { this._selected = !!v; }
});
Object.defineProperty(Element.prototype, 'indeterminate', {
  get: function () { return this._indeterminate === true; },
  set: function (v) { this._indeterminate = !!v; }
});
Object.defineProperty(Element.prototype, 'tabIndex', {
  get: function () {
    var v = this.getAttribute('tabindex');
    return v === null ? -1 : parseInt(v, 10) || 0;
  },
  set: function (v) { this.setAttribute('tabindex', String(v)); }
});
Object.defineProperty(Element.prototype, 'innerHTML', {
  get: function () { return serializeChildren(this); },
  set: function (value) {
    this._childNodes = [];
    if (value === null || value === undefined || value === '') return;
    var nodes = parseHTML(String(value), this.ownerDocument || createDetachedDocument());
    for (var i = 0; i < nodes.length; i++) this.appendChild(nodes[i]);
  }
});
Object.defineProperty(Element.prototype, 'outerHTML', {
  get: function () {
    var tmp = this.ownerDocument.createElement('div');
    tmp.appendChild(this.cloneNode(true));
    return tmp.innerHTML;
  },
  set: function (value) {
    if (!this.parentNode) return;
    var tmp = this.ownerDocument.createElement('div');
    tmp.innerHTML = value;
    var parent = this.parentNode;
    var ref = this.nextSibling;
    parent.removeChild(this);
    for (var i = 0; i < tmp._childNodes.length; i++) parent.insertBefore(tmp._childNodes[i], ref);
  }
});
Object.defineProperty(Element.prototype, 'innerText', {
  get: function () { return this.textContent; },
  set: function (v) { this.textContent = v; }
});
Object.defineProperty(Element.prototype, 'offsetWidth', {
  get: function () {
    if (this._size && this._size.width !== undefined) return this._size.width;
    var w = this.style.width;
    var n = parseFloat(w);
    return isNaN(n) ? 0 : n;
  }
});
Object.defineProperty(Element.prototype, 'offsetHeight', {
  get: function () {
    if (this._size && this._size.height !== undefined) return this._size.height;
    var h = this.style.height;
    var n = parseFloat(h);
    return isNaN(n) ? 0 : n;
  }
});
Object.defineProperty(Element.prototype, 'clientWidth', {
  get: function () { return this._size && this._size.clientWidth !== undefined ? this._size.clientWidth : this.offsetWidth; }
});
Object.defineProperty(Element.prototype, 'clientHeight', {
  get: function () { return this._size && this._size.clientHeight !== undefined ? this._size.clientHeight : this.offsetHeight; }
});
Object.defineProperty(Element.prototype, 'scrollWidth', {
  get: function () { return this._size && this._size.scrollWidth !== undefined ? this._size.scrollWidth : this.offsetWidth; }
});
Object.defineProperty(Element.prototype, 'scrollHeight', {
  get: function () { return this._size && this._size.scrollHeight !== undefined ? this._size.scrollHeight : this.offsetHeight; }
});
Object.defineProperty(Element.prototype, 'offsetTop', {
  get: function () { return this._size && this._size.offsetTop !== undefined ? this._size.offsetTop : 0; }
});
Object.defineProperty(Element.prototype, 'offsetLeft', {
  get: function () { return this._size && this._size.offsetLeft !== undefined ? this._size.offsetLeft : 0; }
});
Object.defineProperty(Element.prototype, 'scrollTop', {
  get: function () { return this._scrollTop || 0; },
  set: function (v) { this._scrollTop = Number(v) || 0; }
});
Object.defineProperty(Element.prototype, 'scrollLeft', {
  get: function () { return this._scrollLeft || 0; },
  set: function (v) { this._scrollLeft = Number(v) || 0; }
});
Object.defineProperty(Element.prototype, 'offsetParent', {
  get: function () { return this.parentElement; }
});

Element.prototype.getBoundingClientRect = function () {
  if (this._rect) {
    var r = this._rect;
    return {
      left: r.left || 0, top: r.top || 0,
      right: r.right !== undefined ? r.right : (r.left || 0) + (r.width || 0),
      bottom: r.bottom !== undefined ? r.bottom : (r.top || 0) + (r.height || 0),
      width: r.width || 0, height: r.height || 0, x: r.x || r.left || 0, y: r.y || r.top || 0
    };
  }
  var w = this.offsetWidth;
  var h = this.offsetHeight;
  return { left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0 };
};
Element.prototype.getClientRects = function () { return [this.getBoundingClientRect()]; };

Element.prototype.querySelector = function (sel) {
  var list = querySelectorAllOn(this, sel);
  return list.length ? list[0] : null;
};
Element.prototype.querySelectorAll = function (sel) { return querySelectorAllOn(this, sel); };
Element.prototype.getElementsByTagName = function (tag) {
  var want = String(tag).toLowerCase();
  var out = collectDescendants(this, []);
  if (want === '*') return out;
  return out.filter(function (el) { return String(el.localName).toLowerCase() === want; });
};
Element.prototype.getElementsByClassName = function (cls) {
  var names = String(cls).split(/\s+/).filter(Boolean);
  return collectDescendants(this, []).filter(function (el) {
    for (var i = 0; i < names.length; i++) if (!el.classList.contains(names[i])) return false;
    return names.length > 0;
  });
};
Element.prototype.matches = function (sel) { return matches(this, sel); };
Element.prototype.matchesSelector = Element.prototype.matches;
Element.prototype.webkitMatchesSelector = Element.prototype.matches;
Element.prototype.closest = function (sel) {
  var cur = this;
  while (cur && cur.nodeType === 1) {
    if (matches(cur, sel)) return cur;
    cur = cur.parentNode;
  }
  return null;
};
Element.prototype.focus = function () {
  var doc = this.ownerDocument;
  if (doc) doc.activeElement = this;
  this.dispatchEvent(new FocusEvent('focus'));
  this.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
};
Element.prototype.blur = function () {
  var doc = this.ownerDocument;
  if (doc && doc.activeElement === this) doc.activeElement = doc.body;
  this.dispatchEvent(new FocusEvent('blur'));
  this.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
};
Element.prototype.click = function () {
  this.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
};
Element.prototype.select = function () { };
Element.prototype.setSelectionRange = function () { };
Element.prototype.scrollIntoView = function () { };
Element.prototype.scrollTo = function () { };
Element.prototype.scrollBy = function () { };
Element.prototype.animate = function () {
  return {
    finished: Promise.resolve(),
    cancel: function () { },
    play: function () { },
    pause: function () { },
    addEventListener: function () { },
    removeEventListener: function () { },
    onfinish: null
  };
};
Element.prototype.requestFullscreen = function () { return Promise.resolve(); };
Element.prototype.webkitRequestFullscreen = function () { return Promise.resolve(); };
Element.prototype.insertAdjacentHTML = function (position, html) {
  var doc = this.ownerDocument || createDetachedDocument();
  var tmp = doc.createElement('div');
  tmp.innerHTML = String(html);
  var nodes = tmp._childNodes.slice();
  var i;
  if (position === 'beforebegin') {
    for (i = 0; i < nodes.length; i++) this.before(nodes[i]);
  } else if (position === 'afterbegin') {
    for (i = nodes.length - 1; i >= 0; i--) this.insertBefore(nodes[i], this.firstChild);
  } else if (position === 'beforeend') {
    for (i = 0; i < nodes.length; i++) this.appendChild(nodes[i]);
  } else if (position === 'afterend') {
    for (i = 0; i < nodes.length; i++) this.after(nodes[i]);
  }
};
Element.prototype.insertAdjacentElement = function (position, el) {
  var tmp = this.ownerDocument.createElement('div');
  tmp.appendChild(el);
  this.insertAdjacentHTML(position, tmp.innerHTML);
  return el;
};
Element.prototype.append = function () {
  for (var i = 0; i < arguments.length; i++) {
    var node = arguments[i];
    if (typeof node === 'string') node = (this.ownerDocument || createDetachedDocument()).createTextNode(node);
    if (isNode(node)) this.appendChild(node);
  }
};
Element.prototype.prepend = function () {
  var ref = this.firstChild;
  for (var i = 0; i < arguments.length; i++) {
    var node = arguments[i];
    if (typeof node === 'string') node = (this.ownerDocument || createDetachedDocument()).createTextNode(node);
    if (isNode(node)) this.insertBefore(node, ref);
  }
};
Element.prototype._cloneShallow = function () {
  var clone = new Element(this.ownerDocument, this.localName, this.namespaceURI);
  var names = this.getAttributeNames();
  for (var i = 0; i < names.length; i++) {
    if (names[i] === 'style') continue;
    clone.setAttribute(names[i], this.getAttribute(names[i]));
  }
  if (this.style.cssText) clone.style.cssText = this.style.cssText;
  if (this._value !== undefined) clone._value = this._value;
  if (this._checked !== undefined) clone._checked = this._checked;
  if (this._selected !== undefined) clone._selected = this._selected;
  if (this._size) clone._size = this._size;
  return clone;
};

/** HTMLElement：标签名 < 特殊判断，本项目主要用 Element 即可 */
function HTMLElement(ownerDocument, tagName) {
  Element.call(this, ownerDocument, tagName, HTML_NS);
}
HTMLElement.prototype = Object.create(Element.prototype);
HTMLElement.prototype.constructor = HTMLElement;

function SVGElement(ownerDocument, tagName) {
  Element.call(this, ownerDocument, tagName, SVG_NS);
}
SVGElement.prototype = Object.create(Element.prototype);
SVGElement.prototype.constructor = SVGElement;

/**
 * iframe：contentWindow 懒创建；父窗口 postMessage 到子窗口会触发子 window 的 message 事件，
 * 子窗口 postMessage 到父窗口会触发父 window 的 message 事件（event.source 为子窗口）。
 */
function HTMLIFrameElement(ownerDocument) {
  HTMLElement.call(this, ownerDocument, 'iframe');
  this._contentWindow = null;
  this._contentDocument = null;
  // src 赋值计数：tabs 保活断言（src 只在首次 activate 设置一次）依赖它
  this.__srcSetCount = 0;
  var self = this;
  Object.defineProperty(this, 'src', {
    configurable: true,
    enumerable: true,
    get: function () {
      var v = self.getAttribute('src');
      return v === null ? '' : v;
    },
    set: function (v) {
      self.__srcSetCount++;
      self.setAttribute('src', v === null || v === undefined ? '' : v);
    }
  });
}
HTMLIFrameElement.prototype = Object.create(HTMLElement.prototype);
HTMLIFrameElement.prototype.constructor = HTMLIFrameElement;
Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
  get: function () {
    if (!this._contentWindow) {
      var frame = this;
      var parentWindow = this.ownerDocument ? this.ownerDocument.defaultView : null;
      this._contentWindow = createFrameWindow(frame, parentWindow);
    }
    return this._contentWindow;
  }
});
Object.defineProperty(HTMLIFrameElement.prototype, 'contentDocument', {
  get: function () {
    if (!this._contentDocument) {
      this._contentDocument = createDetachedDocument(this.contentWindow);
    }
    return this._contentDocument;
  }
});
Object.defineProperty(HTMLIFrameElement.prototype, 'sandbox', {
  get: function () {
    var v = this.getAttribute('sandbox');
    return v === null ? { add: function () { }, remove: function () { }, contains: function () { return false; } } : v;
  },
  set: function (v) { this.setAttribute('sandbox', v); }
});

function createFrameWindow(frame, parentWindow) {
  var win = {};
  win._listeners = Object.create(null);
  win.frameElement = frame;
  win.parent = parentWindow;
  win.top = parentWindow;
  win.self = win;
  win.window = win;
  win.innerWidth = 800;
  win.innerHeight = 600;
  win.location = createLocation('about:blank');
  win.document = createDetachedDocument(win);
  win.addEventListener = function (type, fn, opts) { addListener(win, type, fn, opts); };
  win.removeEventListener = function (type, fn, opts) { removeListener(win, type, fn, opts); };
  win.dispatchEvent = function (event) { return dispatchEventOn(win, event, [win]); };
  win.postMessage = function (data, targetOrigin) {
    if (parentWindow && typeof parentWindow._dispatchMessage === 'function') {
      parentWindow._dispatchMessage(data, win, 'null');
    }
  };
  win.getComputedStyle = function (el) { return createComputedStyle(el); };
  return win;
}

/* =============================================================
 *  10. Document
 * ============================================================= */
function Document() {
  Node.call(this, null);
  this.nodeType = 9;
  this.nodeName = '#document';
  this.readyState = 'complete';
  this.currentScript = null;
  this._defaultView = null;
  this._location = null;
  this.fullscreenElement = null;
  this.hidden = false;
  this.visibilityState = 'visible';
  this.documentElement = new HTMLElement(this, 'html');
  this.head = new HTMLElement(this, 'head');
  this.body = new HTMLElement(this, 'body');
  this.documentElement.appendChild(this.head);
  this.documentElement.appendChild(this.body);
  this.appendChild(this.documentElement);
  this.activeElement = this.body;
  this.fonts = { ready: Promise.resolve(), add: function () { }, delete: function () { }, check: function () { return true; } };
}
Document.prototype = Object.create(Node.prototype);
Document.prototype.constructor = Document;

Object.defineProperty(Document.prototype, 'defaultView', {
  get: function () { return this._defaultView; }
});
Document.prototype._buildPath = function () {
  var path = [this];
  if (this._defaultView) path.push(this._defaultView);
  return path;
};
Document.prototype.createElement = function (tag) {
  var name = String(tag || 'div');
  if (name.toLowerCase() === 'iframe') return new HTMLIFrameElement(this);
  return new HTMLElement(this, name);
};
Document.prototype.createElementNS = function (ns, tag) {
  if (ns === SVG_NS) return new SVGElement(this, tag);
  var el = new HTMLElement(this, tag);
  el.namespaceURI = ns || HTML_NS;
  return el;
};
Document.prototype.createTextNode = function (data) { return new Text(this, data); };
Document.prototype.createComment = function (data) { return new Comment(this, data); };
Document.prototype.createDocumentFragment = function () { return new DocumentFragment(this); };
Document.prototype.createEvent = function (kind) {
  var k = String(kind || '').toLowerCase();
  var evt;
  if (k.indexOf('mouse') !== -1) evt = new MouseEvent('');
  else if (k.indexOf('keyboard') !== -1 || k.indexOf('key') !== -1) evt = new KeyboardEvent('');
  else if (k.indexOf('custom') !== -1) evt = new CustomEvent('');
  else evt = new Event('');
  return evt;
};
Document.prototype.createRange = function () {
  return {
    setStart: function () { }, setEnd: function () { },
    selectNodeContents: function () { }, collapse: function () { },
    getBoundingClientRect: function () { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    getClientRects: function () { return []; }
  };
};
Document.prototype.getElementById = function (id) {
  var target = String(id);
  if (!this.documentElement) return null;
  if (this.documentElement.getAttribute('id') === target) return this.documentElement;
  var all = collectDescendants(this.documentElement, []);
  for (var i = 0; i < all.length; i++) {
    if (all[i].getAttribute('id') === target) return all[i];
  }
  return null;
};
Document.prototype.querySelector = function (sel) {
  if (!this.documentElement) return null;
  if (matches(this.documentElement, sel)) return this.documentElement;
  var list = querySelectorAllOn(this.documentElement, sel);
  return list.length ? list[0] : null;
};
Document.prototype.querySelectorAll = function (sel) {
  if (!this.documentElement) return [];
  return querySelectorAllOn(this.documentElement, sel);
};
Document.prototype.getElementsByTagName = function (tag) {
  if (!this.documentElement) return [];
  return this.documentElement.getElementsByTagName(tag);
};
Document.prototype.getElementsByClassName = function (cls) {
  if (!this.documentElement) return [];
  return this.documentElement.getElementsByClassName(cls);
};
Document.prototype.hasFocus = function () { return true; };
Document.prototype.exitFullscreen = function () { return Promise.resolve(); };
Document.prototype.webkitExitFullscreen = function () { return Promise.resolve(); };
Document.prototype.execCommand = function () { return false; };
Document.prototype.elementFromPoint = function () { return this.body; };

Object.defineProperty(Document.prototype, 'title', {
  get: function () {
    var t = this.head ? this.head.querySelector('title') : null;
    return t ? t.textContent : '';
  },
  set: function (v) {
    if (!this.head) return;
    var t = this.head.querySelector('title');
    if (!t) {
      t = this.createElement('title');
      this.head.appendChild(t);
    }
    t.textContent = v;
  }
});
Object.defineProperty(Document.prototype, 'baseURI', {
  get: function () {
    if (this._location && this._location.href) return this._location.href;
    return 'file:///';
  }
});
Document.prototype._cloneShallow = function () {
  return new Document();
};

/** 独立的轻量 Document（iframe contentDocument 用，不建立 html/head/body） */
function createDetachedDocument(defaultView) {
  var doc = new Document();
  doc._defaultView = defaultView || null;
  return doc;
}

/* =============================================================
 *  11. location / history / storage
 * ============================================================= */
function createLocation(href) {
  var loc = {
    href: href,
    protocol: 'file:',
    host: '',
    hostname: '',
    port: '',
    pathname: '/',
    search: '',
    hash: '',
    origin: 'null',
    assign: function (url) { loc.href = String(url); },
    replace: function (url) { loc.href = String(url); },
    reload: function () { loc._reloadCount = (loc._reloadCount || 0) + 1; },
    toString: function () { return loc.href; }
  };
  loc._reloadCount = 0;
  try {
    var u = new URL(href);
    loc.protocol = u.protocol;
    loc.host = u.host;
    loc.hostname = u.hostname;
    loc.port = u.port;
    loc.pathname = u.pathname;
    loc.search = u.search;
    loc.hash = u.hash;
    loc.origin = u.origin;
  } catch (e) { /* 保留 file 默认值 */ }
  return loc;
}

function createHistory(win) {
  var stack = [{ state: null, url: win.location ? win.location.href : 'about:blank' }];
  var index = 0;
  return {
    get length() { return stack.length; },
    get state() { return stack[index].state; },
    pushState: function (state, title, url) {
      index += 1;
      stack = stack.slice(0, index);
      stack.push({ state: state, url: url ? String(url) : stack[index - 1].url });
      if (url && win.location) win.location.href = String(url);
    },
    replaceState: function (state, title, url) {
      stack[index] = { state: state, url: url ? String(url) : stack[index].url };
      if (url && win.location) win.location.href = String(url);
    },
    back: function () { if (index > 0) index -= 1; },
    forward: function () { if (index < stack.length - 1) index += 1; },
    go: function (n) {
      var delta = parseInt(n, 10) || 0;
      var next = index + delta;
      if (next >= 0 && next < stack.length) index = next;
    }
  };
}

function createStorage() {
  var data = Object.create(null);
  return {
    get length() { return Object.keys(data).length; },
    key: function (i) { return Object.keys(data)[i] || null; },
    getItem: function (k) {
      var key = String(k);
      return key in data ? data[key] : null;
    },
    setItem: function (k, v) {
      data[String(k)] = String(v);
    },
    removeItem: function (k) {
      delete data[String(k)];
    },
    clear: function () {
      data = Object.create(null);
    }
  };
}

/* =============================================================
 *  12. 各类观察器桩
 * ============================================================= */
function MutationObserverStub(callback) {
  this._callback = callback || function () { };
  this._records = [];
}
MutationObserverStub.prototype.observe = function () { };
MutationObserverStub.prototype.disconnect = function () { };
MutationObserverStub.prototype.takeRecords = function () { return []; };

function ResizeObserverStub(callback) {
  this._callback = callback || function () { };
}
ResizeObserverStub.prototype.observe = function () { };
ResizeObserverStub.prototype.unobserve = function () { };
ResizeObserverStub.prototype.disconnect = function () { };

function IntersectionObserverStub(callback) {
  this._callback = callback || function () { };
}
IntersectionObserverStub.prototype.observe = function () { };
IntersectionObserverStub.prototype.unobserve = function () { };
IntersectionObserverStub.prototype.disconnect = function () { };
IntersectionObserverStub.prototype.takeRecords = function () { return []; };

/* =============================================================
 *  13. 环境创建
 * ============================================================= */
function createEnvironment(options) {
  options = options || {};
  var root = options.root || process.cwd();
  var fileMode = options.fileMode !== false;
  var href = options.url || pathToFileHref(path.join(root, 'index.html'));

  var doc = new Document();
  var win = {};
  var sandbox = win;

  // ---- 定时器接管（destroy 时统一清理，避免测试进程挂起） ----
  var timers = { timeouts: [], intervals: [], rafs: [] };
  var rafSeq = 0;
  var rafMap = Object.create(null);

  function trackTimeout(fn, ms) {
    if (typeof fn !== 'function') fn = function () { };
    var id = setTimeout(function () {
      var idx = timers.timeouts.indexOf(id);
      if (idx !== -1) timers.timeouts.splice(idx, 1);
      try { fn(); } catch (e) {
        if (console.error) console.error('[dom-stub] setTimeout 回调异常:', e && e.stack ? e.stack : e);
      }
    }, ms || 0);
    timers.timeouts.push(id);
    return id;
  }
  function untrackTimeout(id) {
    var idx = timers.timeouts.indexOf(id);
    if (idx !== -1) timers.timeouts.splice(idx, 1);
    clearTimeout(id);
  }
  function trackInterval(fn, ms) {
    if (typeof fn !== 'function') fn = function () { };
    var id = setInterval(function () {
      try { fn(); } catch (e) {
        if (console.error) console.error('[dom-stub] setInterval 回调异常:', e && e.stack ? e.stack : e);
      }
    }, ms || 0);
    timers.intervals.push(id);
    return id;
  }
  function untrackInterval(id) {
    var idx = timers.intervals.indexOf(id);
    if (idx !== -1) timers.intervals.splice(idx, 1);
    clearInterval(id);
  }
  function requestAnimationFrame(fn) {
    rafSeq += 1;
    var id = rafSeq;
    var handle = setTimeout(function () {
      delete rafMap[id];
      var idx = timers.rafs.indexOf(id);
      if (idx !== -1) timers.rafs.splice(idx, 1);
      try { fn(Date.now()); } catch (e) {
        if (console.error) console.error('[dom-stub] rAF 回调异常:', e && e.stack ? e.stack : e);
      }
    }, 16);
    rafMap[id] = handle;
    timers.rafs.push(id);
    return id;
  }
  function cancelAnimationFrame(id) {
    var handle = rafMap[id];
    if (handle) {
      clearTimeout(handle);
      delete rafMap[id];
      var idx = timers.rafs.indexOf(id);
      if (idx !== -1) timers.rafs.splice(idx, 1);
    }
  }

  var location = createLocation(fileMode ? href : (options.url || 'http://127.0.0.1:8080/index.html'));
  doc._location = location;
  doc._defaultView = win;

  // ---- 消息分发辅助 ----
  function dispatchMessage(data, source, origin) {
    var evt = new MessageEvent('message', {
      data: data,
      source: source || null,
      origin: origin === undefined ? 'null' : origin
    });
    return win.dispatchEvent(evt);
  }

  // ---- fetch：从磁盘读取（file:// 或相对路径），响应头模拟 ----
  function makeFetchResponse(url, text) {
    var body = String(text);
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      url: url,
      headers: {
        get: function (name) {
          var n = String(name).toLowerCase();
          if (n === 'content-type') {
            if (/\.json$/i.test(url)) return 'application/json';
            if (/\.js$/i.test(url)) return 'application/javascript';
            if (/\.css$/i.test(url)) return 'text/css';
            return 'text/plain';
          }
          return null;
        }
      },
      text: function () { return Promise.resolve(body); },
      json: function () {
        return new Promise(function (resolve, reject) {
          try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        });
      },
      clone: function () { return makeFetchResponse(url, body); }
    };
  }
  function resolveFetchPath(url) {
    var raw = String(url);
    var rel = raw;
    if (raw.indexOf('file://') === 0) {
      rel = raw.replace(/^file:\/\/+/, '');
      try { rel = decodeURIComponent(rel); } catch (e) { /* ignore */ }
      rel = rel.replace(/^\/+/, '');
      return path.resolve(rel);
    }
    if (/^https?:\/\//i.test(raw)) {
      try {
        var u = new URL(raw);
        rel = u.pathname;
      } catch (e) { rel = raw; }
    }
    rel = rel.replace(/^\/+/, '').split('?')[0].split('#')[0];
    try { rel = decodeURIComponent(rel); } catch (e2) { /* ignore */ }
    return path.resolve(root, rel);
  }
  function fetchStub(input) {
    var url = typeof input === 'string' ? input : (input && input.url ? input.url : String(input));
    return new Promise(function (resolve, reject) {
      var abs = resolveFetchPath(url);
      fs.readFile(abs, 'utf8', function (err, text) {
        if (err) {
          var notFound = new Error('fetch 失败: ' + url + ' (' + abs + ')');
          notFound.code = 'ENOENT';
          reject(notFound);
          return;
        }
        resolve(makeFetchResponse(url, text));
      });
    });
  }

  // ---- window 基础属性 ----
  win.window = win;
  win.self = win;
  win.top = win;
  win.parent = win;
  win.frames = win;
  win.global = win;
  win.closed = false;
  win.name = '';
  win.innerWidth = options.innerWidth || 1280;
  win.innerHeight = options.innerHeight || 800;
  win.outerWidth = win.innerWidth;
  win.outerHeight = win.innerHeight;
  win.devicePixelRatio = 1;
  win.screenX = 0;
  win.screenY = 0;
  win.scrollX = 0;
  win.scrollY = 0;
  win.pageXOffset = 0;
  win.pageYOffset = 0;
  win.isSecureContext = false;
  win.document = doc;
  win.location = location;
  win.history = createHistory(win);
  win.localStorage = createStorage();
  win.sessionStorage = createStorage();
  win.performance = {
    now: function () { return Date.now(); },
    timeOrigin: Date.now(),
    timing: {},
    mark: function () { },
    measure: function () { }
  };
  win.navigator = {
    userAgent: 'KurumiUI-DOMStub/1.0 (Node ' + process.version + ')',
    platform: 'Win32',
    language: 'zh-CN',
    languages: ['zh-CN', 'zh'],
    onLine: true,
    cookieEnabled: true,
    appName: 'KurumiUI-Test',
    appVersion: '1.0',
    hardwareConcurrency: 4,
    maxTouchPoints: 0,
    clipboard: null,
    sendBeacon: function () { return false; }
  };
  win.screen = {
    width: win.innerWidth, height: win.innerHeight,
    availWidth: win.innerWidth, availHeight: win.innerHeight,
    colorDepth: 24, pixelDepth: 24
  };
  win.console = console;
  win.Math = Math;
  win.Date = Date;
  win.JSON = JSON;
  win.Promise = Promise;

  // ---- 计时 API ----
  win.setTimeout = trackTimeout;
  win.clearTimeout = untrackTimeout;
  win.setInterval = trackInterval;
  win.clearInterval = untrackInterval;
  win.setImmediate = trackTimeout;
  win.clearImmediate = untrackTimeout;
  win.requestAnimationFrame = requestAnimationFrame;
  win.cancelAnimationFrame = cancelAnimationFrame;
  win.requestIdleCallback = function (fn) { return trackTimeout(function () { fn({ didTimeout: false, timeRemaining: function () { return 10; } }); }, 1); };
  win.cancelIdleCallback = untrackTimeout;
  win.queueMicrotask = function (fn) { Promise.resolve().then(fn); };
  win.alert = function () { };
  win.confirm = function () { return true; };
  win.prompt = function () { return null; };
  win.open = function () { return null; };
  win.close = function () { win.closed = true; };
  win.focus = function () { };
  win.blur = function () { };
  win.scrollTo = function () { };
  win.scrollBy = function () { };
  win.matchMedia = function (query) {
    var q = String(query || '');
    var matches = false;
    if (q.indexOf('prefers-color-scheme: dark') !== -1) matches = false;
    return new MediaQueryList(q, matches);
  };
  win.getComputedStyle = function (el) { return createComputedStyle(el); };
  win.getSelection = function () {
    return { rangeCount: 0, toString: function () { return ''; }, removeAllRanges: function () { }, addRange: function () { } };
  };
  win.postMessage = function (data, targetOrigin) { return dispatchMessage(data, win, 'null'); };
  win._dispatchMessage = dispatchMessage;
  win.fetch = fetchStub;
  win.btoa = function (s) { return Buffer.from(String(s), 'binary').toString('base64'); };
  win.atob = function (s) { return Buffer.from(String(s), 'base64').toString('binary'); };
  win.URL = URL;
  win.URLSearchParams = URLSearchParams;
  win.CSS = {
    escape: function (s) { return String(s).replace(/[^a-zA-Z0-9_\-\u00a0-\uffff]/g, '\\$&'); },
    supports: function () { return false; }
  };
  win.crypto = {
    getRandomValues: function (arr) {
      for (var i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
      return arr;
    },
    randomUUID: function () {
      var hex = '0123456789abcdef';
      var out = '';
      for (var i = 0; i < 32; i++) out += hex.charAt(Math.floor(Math.random() * 16));
      return out.slice(0, 8) + '-' + out.slice(8, 12) + '-4' + out.slice(13, 16) + '-a' + out.slice(17, 20) + '-' + out.slice(20, 32);
    }
  };
  win.localStorage.getItem = win.localStorage.getItem;
  win.addEventListener = function (type, fn, opts) { addListener(win, type, fn, opts); };
  win.removeEventListener = function (type, fn, opts) { removeListener(win, type, fn, opts); };
  win.dispatchEvent = function (event) { return dispatchEventOn(win, event, [win]); };
  win.documentElement = doc.documentElement;

  // ---- 事件/节点构造器（注入沙箱，供框架代码 instanceof / new 使用） ----
  win.Event = Event;
  win.CustomEvent = CustomEvent;
  win.MouseEvent = MouseEvent;
  win.KeyboardEvent = KeyboardEvent;
  win.FocusEvent = FocusEvent;
  win.InputEvent = InputEvent;
  win.WheelEvent = WheelEvent;
  win.MessageEvent = MessageEvent;
  win.EventTarget = EventTargetBase;
  win.Node = Node;
  win.Element = Element;
  win.HTMLElement = HTMLElement;
  win.SVGElement = SVGElement;
  win.HTMLIFrameElement = HTMLIFrameElement;
  win.Text = Text;
  win.Comment = Comment;
  win.DocumentFragment = DocumentFragment;
  win.Document = Document;
  win.MediaQueryList = MediaQueryList;
  win.MutationObserver = MutationObserverStub;
  win.ResizeObserver = ResizeObserverStub;
  win.IntersectionObserver = IntersectionObserverStub;
  win.NodeFilter = { SHOW_ALL: 0xffffffff, SHOW_ELEMENT: 1, SHOW_TEXT: 4 };

  // ---- Blob / File 桩（下载、上传控件用） ----
  function BlobStub(parts, opts) {
    this._parts = parts || [];
    this.type = opts && opts.type ? String(opts.type) : '';
    var size = 0;
    for (var i = 0; i < this._parts.length; i++) {
      var p = this._parts[i];
      size += typeof p === 'string' ? Buffer.byteLength(p, 'utf8') : (p && p.size ? p.size : 0);
    }
    this.size = size;
  }
  BlobStub.prototype.slice = function () { return new BlobStub(this._parts, { type: this.type }); };
  BlobStub.prototype.text = function () { return Promise.resolve(this._parts.join('')); };
  win.Blob = BlobStub;
  win.File = function FileStub(parts, name, opts) {
    BlobStub.call(this, parts, opts);
    this.name = String(name || 'file');
    this.lastModified = Date.now();
  };
  win.File.prototype = Object.create(BlobStub.prototype);
  win.File.prototype.constructor = win.File;
  var objectUrlSeq = 0;
  var objectUrls = Object.create(null);
  win.URL = function URLStub(url, base) {
    if (!(this instanceof win.URL)) return new win.URL(url, base);
    this.href = String(url);
    this.toString = function () { return this.href; };
  };
  win.URL.createObjectURL = function (blob) {
    objectUrlSeq += 1;
    var id = 'blob:kui-test-' + objectUrlSeq;
    objectUrls[id] = blob;
    return id;
  };
  win.URL.revokeObjectURL = function (id) { delete objectUrls[id]; };
  win.URLSearchParams = URLSearchParams;
  win.DOMParser = function DOMParserStub() {
    this.parseFromString = function (text) {
      var d = new Document();
      d.body.innerHTML = String(text);
      return d;
    };
  };

  // ---- XMLHttpRequest 最小实现（读本地文件，兼容老代码兜底） ----
  function XMLHttpRequestStub() {
    this.readyState = 0;
    this.status = 0;
    this.responseText = '';
    this.response = '';
    this.onload = null;
    this.onerror = null;
    this.onreadystatechange = null;
    this._url = '';
    this._async = true;
  }
  XMLHttpRequestStub.prototype.open = function (method, url, async) {
    this._url = String(url);
    this._async = async !== false;
    this.readyState = 1;
  };
  XMLHttpRequestStub.prototype.setRequestHeader = function () { };
  XMLHttpRequestStub.prototype.getResponseHeader = function () { return null; };
  XMLHttpRequestStub.prototype.send = function () {
    var xhr = this;
    fs.readFile(resolveFetchPath(this._url), 'utf8', function (err, text) {
      if (err) {
        xhr.readyState = 4;
        xhr.status = 404;
        if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange();
        if (typeof xhr.onerror === 'function') xhr.onerror(err);
        return;
      }
      xhr.readyState = 4;
      xhr.status = 200;
      xhr.responseText = text;
      xhr.response = text;
      if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange();
      if (typeof xhr.onload === 'function') xhr.onload();
    });
  };
  XMLHttpRequestStub.prototype.abort = function () { };
  win.XMLHttpRequest = XMLHttpRequestStub;

  // ---- vm 沙箱（window 即全局对象） ----
  var context = vm.createContext(win);

  // ---- 脚本加载 ----
  var scripts = [];
  function toFileHref(absPath) {
    return pathToFileHref(absPath);
  }
  function runCode(code, filename, scriptSrc) {
    var prev = doc.currentScript;
    var scriptEl = doc.createElement('script');
    if (scriptSrc) scriptEl.setAttribute('src', scriptSrc);
    doc.currentScript = scriptEl;
    try {
      return vm.runInContext(code, context, { filename: filename || 'kui-script.js', displayErrors: true });
    } finally {
      doc.currentScript = prev;
      scriptEl.parentNode = null;
    }
  }
  function loadScript(absPath, opts) {
    var abs = path.isAbsolute(absPath) ? absPath : path.resolve(root, absPath);
    var entry = { path: abs, relative: path.relative(root, abs).split(path.sep).join('/'), ok: false, error: null };
    try {
      var code = fs.readFileSync(abs, 'utf8');
      if (code.charCodeAt(0) === 0xfeff) code = code.slice(1);
      runCode(code, abs, toFileHref(abs));
      entry.ok = true;
      scripts.push(entry);
      return entry;
    } catch (e) {
      entry.error = e;
      scripts.push(entry);
      if (opts && opts.continueOnError) return entry;
      throw e;
    }
  }
  function loadScripts(list, opts) {
    var out = [];
    for (var i = 0; i < list.length; i++) out.push(loadScript(list[i], opts));
    return out;
  }
  function loadText(relPath) {
    var abs = path.isAbsolute(relPath) ? relPath : path.resolve(root, relPath);
    return fs.readFileSync(abs, 'utf8');
  }
  function readJson(relPath) {
    return JSON.parse(loadText(relPath).replace(/^\uFEFF/, ''));
  }
  function exists(relPath) {
    try {
      return fs.existsSync(path.isAbsolute(relPath) ? relPath : path.resolve(root, relPath));
    } catch (e) {
      return false;
    }
  }

  function destroy() {
    var i;
    for (i = 0; i < timers.timeouts.length; i++) clearTimeout(timers.timeouts[i]);
    for (i = 0; i < timers.intervals.length; i++) clearInterval(timers.intervals[i]);
    for (var key in rafMap) {
      if (Object.prototype.hasOwnProperty.call(rafMap, key)) clearTimeout(rafMap[key]);
    }
    timers.timeouts = [];
    timers.intervals = [];
    timers.rafs = [];
    rafMap = Object.create(null);
    try { win.dispatchEvent(new Event('unload')); } catch (e) { /* ignore */ }
    doc._defaultView = null;
    win.document = null;
  }

  var env = {
    window: win,
    document: doc,
    root: root,
    context: context,
    location: location,
    scripts: scripts,
    runCode: runCode,
    loadScript: loadScript,
    loadScripts: loadScripts,
    loadText: loadText,
    readJson: readJson,
    exists: exists,
    dispatchMessage: dispatchMessage,
    fetchPath: resolveFetchPath,
    makeEvent: function (type, init) { return new Event(type, init); },
    makeCustomEvent: function (type, init) { return new CustomEvent(type, init); },
    makeMessageEvent: function (type, init) { return new MessageEvent(type, init); },
    destroy: destroy
  };
  return env;
}

function pathToFileHref(absPath) {
  var normalized = path.resolve(absPath).split(path.sep).join('/');
  if (normalized.charAt(0) !== '/') normalized = '/' + normalized;
  return 'file://' + encodeURI(normalized).replace(/#/g, '%23');
}

/** 事件目标基类（供 instanceof 检查；实际逻辑使用上面的函数） */
function EventTargetBase() { }
EventTargetBase.prototype.addEventListener = function (type, fn, opts) { addListener(this, type, fn, opts); };
EventTargetBase.prototype.removeEventListener = function (type, fn, opts) { removeListener(this, type, fn, opts); };
EventTargetBase.prototype.dispatchEvent = function (event) { return dispatchEventOn(this, event, [this]); };

module.exports = {
  createEnvironment: createEnvironment,
  createDocument: function (win) {
    var d = new Document();
    d._defaultView = win || null;
    return d;
  },
  pathToFileHref: pathToFileHref,
  Event: Event,
  CustomEvent: CustomEvent,
  MouseEvent: MouseEvent,
  KeyboardEvent: KeyboardEvent,
  MessageEvent: MessageEvent,
  // 便于测试直接断言节点类型
  ELEMENT_NODE: 1,
  TEXT_NODE: 3,
  COMMENT_NODE: 8,
  DOCUMENT_NODE: 9,
  DOCUMENT_FRAGMENT_NODE: 11
};

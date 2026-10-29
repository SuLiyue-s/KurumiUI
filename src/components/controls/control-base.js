/**
 * KurumiUI 控件基础层（controls/control-base.js）
 * 职责：字段包装器、状态机、统一弹层 popup、数字/日期格式化、键盘交互工具、公共小工具。
 * 约定：所有控件脚本只依赖 KUI.controls.base / KUI.controls.popup，不直接依赖任何外部库。
 * 语法：兼容 Node 13.14（禁止可选链、空值合并、replaceAll、私有字段等）。
 */
window.KUI = window.KUI || {};
(function (KUI) {
  'use strict';

  var ns = KUI.controls = KUI.controls || {};
  var base = ns.base = ns.base || {};

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var uidSeq = 0;

  /* ============================================================
   * 一、基础判断 / 通用工具
   * ============================================================ */

  function isFn(v) { return typeof v === 'function'; }
  function isStr(v) { return typeof v === 'string'; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function isBool(v) { return typeof v === 'boolean'; }
  function isArr(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function isObj(v) { return !!v && typeof v === 'object' && !isArr(v); }
  function has(obj, key) { return !!obj && Object.prototype.hasOwnProperty.call(obj, key); }
  function noop() {}
  function toStr(v) { return v === null || v === undefined ? '' : String(v); }
  function trim(s) { return String(s === null || s === undefined ? '' : s).replace(/^\s+|\s+$/g, ''); }
  function each(list, fn) {
    if (!list) { return; }
    if (isArr(list)) {
      for (var i = 0; i < list.length; i++) { fn(list[i], i); }
      return;
    }
    var keys = Object.keys(list);
    for (var k = 0; k < keys.length; k++) { fn(list[keys[k]], keys[k]); }
  }
  function map(list, fn) {
    var out = [];
    each(list, function (item, i) { out.push(fn(item, i)); });
    return out;
  }
  function indexOf(list, item) {
    if (!isArr(list)) { return -1; }
    for (var i = 0; i < list.length; i++) { if (list[i] === item) { return i; } }
    return -1;
  }
  function deepGet(obj, path, fallback) {
    if (KUI.utils && isFn(KUI.utils.deepGet)) {
      try { return KUI.utils.deepGet(obj, path, fallback); } catch (e) { /* ignore */ }
    }
    if (KUI.utils && isFn(KUI.utils.getByPath)) {
      try {
        var got = KUI.utils.getByPath(obj, path);
        return got === undefined ? fallback : got;
      } catch (e2) { /* ignore */ }
    }
    if (obj === null || obj === undefined || !path) { return fallback; }
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) { return fallback; }
      cur = cur[parts[i]];
    }
    return cur === undefined ? fallback : cur;
  }
  function clamp(n, min, max) {
    if (KUI.utils && isFn(KUI.utils.clamp)) {
      try { return KUI.utils.clamp(n, min, max); } catch (e) { /* ignore */ }
    }
    n = parseFloat(n);
    if (!isFinite(n)) { n = 0; }
    if (isNum(min) && n < min) { n = min; }
    if (isNum(max) && n > max) { n = max; }
    return n;
  }
  function uid(prefix) {
    if (KUI.utils && isFn(KUI.utils.uid)) {
      try { return KUI.utils.uid(prefix || 'kui'); } catch (e) { /* ignore */ }
    }
    uidSeq += 1;
    return (prefix || 'kui') + '-' + uidSeq + '-' + Math.floor(Math.random() * 100000);
  }
  function debounce(fn, wait) {
    if (KUI.utils && isFn(KUI.utils.debounce)) {
      try { return KUI.utils.debounce(fn, wait); } catch (e) { /* ignore */ }
    }
    var timer = null;
    return function () {
      var self = this;
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, wait || 0);
    };
  }
  function nextFrame(fn) {
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      window.requestAnimationFrame(fn);
    } else {
      setTimeout(fn, 16);
    }
  }
  function round(n, precision) {
    var p = precision === null || precision === undefined ? 0 : precision;
    var f = Math.pow(10, p);
    return Math.round(n * f) / f;
  }
  function pad(n, len) {
    var s = String(n);
    while (s.length < (len || 2)) { s = '0' + s; }
    return s;
  }
  function escapeHtml(s) {
    if (KUI.utils && isFn(KUI.utils.escapeHtml)) {
      try { return KUI.utils.escapeHtml(s); } catch (e) { /* ignore */ }
    }
    return toStr(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function merge(target) {
    var sources = Array.prototype.slice.call(arguments, 1);
    each(sources, function (src) {
      if (!isObj(src)) { return; }
      each(src, function (v, k) {
        if (isObj(v) && isObj(target[k])) { target[k] = merge({}, target[k], v); }
        else { target[k] = v; }
      });
    });
    return target;
  }

  /* ============================================================
   * 二、KUI 桥接（存在则复用，不存在则用本地兜底）
   * ============================================================ */

  function t(key, fallback, vars) {
    if (KUI && isFn(KUI.text)) {
      try {
        var v = KUI.text(key, fallback, vars);
        if (v !== undefined && v !== null && v !== '') { return v; }
        if (v === '') { return ''; }
      } catch (e) { /* ignore */ }
    }
    var s = fallback === null || fallback === undefined ? '' : String(fallback);
    if (vars) {
      s = s.replace(/\{\{(\w+)\}\}/g, function (m, name) {
        return vars[name] === null || vars[name] === undefined ? '' : String(vars[name]);
      });
    }
    return s;
  }

  function token(name, fallback) {
    return 'var(--kui-' + name + (fallback ? ', ' + fallback : '') + ')';
  }

  function cssVar(name) {
    if (typeof document === 'undefined' || !document.documentElement) { return ''; }
    var win = typeof window !== 'undefined' ? window : null;
    if (!win || !isFn(win.getComputedStyle)) { return ''; }
    try {
      return trim(win.getComputedStyle(document.documentElement).getPropertyValue(name));
    } catch (e) { return ''; }
  }

  function themeColor(name) {
    var v = cssVar('--kui-' + (isStr(name) && name.indexOf('--kui-') === 0 ? name.slice(6) : name));
    return v || '';
  }

  /* ============================================================
   * 三、DOM 小工具
   * ============================================================ */

  var BOOL_ATTRS = {
    disabled: 1, checked: 1, readonly: 1, multiple: 1, hidden: 1,
    selected: 1, required: 1, autofocus: 1
  };

  function appendChildren(el, children) {
    if (children === null || children === undefined) { return; }
    if (isArr(children)) {
      for (var i = 0; i < children.length; i++) { appendChildren(el, children[i]); }
      return;
    }
    if (typeof children === 'string' || typeof children === 'number') {
      el.appendChild(document.createTextNode(String(children)));
      return;
    }
    if (children && children.nodeType) { el.appendChild(children); }
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      each(attrs, function (v, k) {
        if (k === 'style' && isObj(v)) {
          each(v, function (sv, sk) { node.style[sk] = sv; });
          return;
        }
        if (k === 'dataset' && isObj(v)) {
          each(v, function (dv, dk) { node.setAttribute('data-' + dk, dv); });
          return;
        }
        if (k === 'on' && isObj(v)) {
          each(v, function (fn, ev) { on(node, ev, fn); });
          return;
        }
        if (k === 'text') { node.textContent = toStr(v); return; }
        if (k === 'html') { node.innerHTML = toStr(v); return; }
        if (k === 'class' || k === 'className') {
          var cls = isArr(v) ? v.join(' ') : toStr(v);
          if (cls) { node.className = node.className ? node.className + ' ' + cls : cls; }
          return;
        }
        if (v === null || v === undefined || v === false) { return; }
        if (BOOL_ATTRS[k]) {
          if (v) { node.setAttribute(k, ''); } else { node.removeAttribute(k); }
          return;
        }
        if (k.indexOf('on') === 0 && k.length > 2 && isFn(v)) {
          on(node, k.slice(2).toLowerCase(), v);
          return;
        }
        node.setAttribute(k, v === true ? '' : String(v));
      });
    }
    appendChildren(node, children);
    return node;
  }

  function frag(children) {
    var f = document.createDocumentFragment();
    appendChildren(f, children);
    return f;
  }

  function clear(el) {
    while (el && el.firstChild) { el.removeChild(el.firstChild); }
    return el;
  }

  function remove(el) {
    if (el && el.parentNode) { el.parentNode.removeChild(el); }
  }

  function addClass(el, cls) {
    if (!el || !cls) { return el; }
    var list = String(cls).split(/\s+/);
    for (var i = 0; i < list.length; i++) {
      if (list[i] && el.classList) { el.classList.add(list[i]); }
    }
    return el;
  }

  function removeClass(el, cls) {
    if (!el || !cls) { return el; }
    var list = String(cls).split(/\s+/);
    for (var i = 0; i < list.length; i++) {
      if (list[i] && el.classList) { el.classList.remove(list[i]); }
    }
    return el;
  }

  function toggleClass(el, cls, on) {
    if (!el || !cls) { return el; }
    if (on) { addClass(el, cls); } else { removeClass(el, cls); }
    return el;
  }

  function hasClass(el, cls) {
    if (!el || !el.classList) { return false; }
    return el.classList.contains(cls);
  }

  function attr(el, name, value) {
    if (value === undefined) {
      return el && el.getAttribute ? el.getAttribute(name) : null;
    }
    if (el && el.setAttribute) {
      if (value === null || value === false) { el.removeAttribute(name); }
      else { el.setAttribute(name, value === true ? '' : String(value)); }
    }
    return el;
  }

  function setAria(el, map) {
    if (!el) { return el; }
    each(map, function (v, k) {
      var name = k.indexOf('aria-') === 0 ? k : 'aria-' + k;
      if (v === null || v === undefined || v === false) { el.removeAttribute(name); }
      else { el.setAttribute(name, v === true ? 'true' : String(v)); }
    });
    return el;
  }

  function on(target, type, fn, opts) {
    if (!target || !isFn(fn)) { return noop; }
    if (target.addEventListener) { target.addEventListener(type, fn, opts || false); }
    return function offOne() {
      if (target.removeEventListener) { target.removeEventListener(type, fn, opts || false); }
    };
  }

  function once(target, type, fn, opts) {
    var off = on(target, type, function (ev) {
      off();
      fn(ev);
    }, opts);
    return off;
  }

  function closest(target, selector) {
    var node = target;
    while (node && node !== document) {
      if (node.nodeType === 1) {
        if (node.matches && node.matches(selector)) { return node; }
        if (node === target && node.className && (' ' + node.className + ' ').indexOf(' ' + selector + ' ') >= 0) { return node; }
      }
      node = node.parentNode;
    }
    return null;
  }

  function contains(parent, child) {
    if (!parent || !child) { return false; }
    if (parent === child) { return true; }
    if (isFn(parent.contains)) { return parent.contains(child); }
    var node = child.parentNode;
    while (node) {
      if (node === parent) { return true; }
      node = node.parentNode;
    }
    return false;
  }

  function scrollIntoView(container, item) {
    if (!container || !item) { return; }
    var top = item.offsetTop || 0;
    var bottom = top + (item.offsetHeight || 0);
    var viewTop = container.scrollTop || 0;
    var viewBottom = viewTop + (container.clientHeight || 0);
    if (top < viewTop) { container.scrollTop = top; }
    else if (bottom > viewBottom) { container.scrollTop = bottom - (container.clientHeight || 0); }
    if (isFn(container.scrollTo)) {
      try { container.scrollTo({ top: container.scrollTop }); } catch (e) { /* ignore */ }
    }
  }

  /* ============================================================
   * 四、图标（统一 sprite 材质，见契约 §11）
   * ============================================================ */

  /**
   * 生成图标 SVG 元素。
   * 优先走 core/icons：icons.create 会确保 sprite（<svg id="kui-icon-sprite">）注入，
   * 且 <use href="#kui-icon-<name>"> 指向真实存在的 <symbol>。
   * 旧实现写死 #kui-i-<name> 且从不注入 sprite，导致真实浏览器里控件图标全部空白。
   */
  function iconEl(name, cls) {
    var icons = KUI.icons;
    if (icons && isFn(icons.create)) {
      var made = null;
      try { made = icons.create(name, { 'class': cls || '' }); } catch (e) { made = null; }
      if (made) {
        // 尺寸统一由 base.css 的 .kui-icon { width/height: var(--kui-icon-size) } 控制，
        // create() 写入的默认 16px 仅作为无 CSS 环境的兜底，这里保留即可。
        return made;
      }
    }
    // 降级：core/icons 不可用时按 icons.js 的 sprite symbol 约定（#kui-icon-<name>）输出
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'kui-icon' + (cls ? ' ' + cls : ''));
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#kui-icon-' + name);
    svg.appendChild(use);
    return svg;
  }

  function iconHtml(name, cls) {
    var icons = KUI.icons;
    if (icons && isFn(icons.get)) {
      var html = '';
      try { html = icons.get(name, { 'class': cls || '' }); } catch (e) { html = ''; }
      if (html) { return html; }
    }
    return '<svg class="kui-icon' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<use href="#kui-icon-' + name + '"></use></svg>';
  }

  /* ============================================================
   * 五、属性读取（兼容 renderNode 是否把 props 合并进 node）
   * ============================================================ */

  function getProps(node) {
    if (!node) { return {}; }
    if (isObj(node.__props)) { return node.__props; }
    var out = {};
    if (isObj(node.props)) {
      each(node.props, function (v, k) { out[k] = v; });
    }
    // 顶层同名字段作为 fallback（默认节点通用字段不覆盖 props）
    var skip = {
      type: 1, props: 1, children: 1, deps: 1, id: 1, class: 1, style: 1, attrs: 1,
      visible: 1, disabled: 1, readonly: 1, required: 1, label: 1, help: 1, error: 1,
      unit: 1, width: 1, span: 1, labelPosition: 1, labelWidth: 1, rules: 1, __props: 1,
      on: 1, noField: 1, template: 1
    };
    each(node, function (v, k) {
      if (skip[k]) { return; }
      if (out[k] === undefined && v !== undefined) { out[k] = v; }
    });
    return out;
  }

  function p(node, name, fallback) {
    if (!node) { return fallback; }
    if (isObj(node.__props) && node.__props[name] !== undefined) { return node.__props[name]; }
    if (isObj(node.props) && node.props[name] !== undefined) { return node.props[name]; }
    if (node[name] !== undefined) { return node[name]; }
    return fallback;
  }

  /* ============================================================
   * 六、文案 / 选项归一化
   * ============================================================ */

  function normOptions(list) {
    var out = [];
    if (!list) { return out; }
    each(list, function (item) {
      if (item === null || item === undefined) { return; }
      if (isStr(item) || isNum(item) || isBool(item)) {
        out.push({ label: String(item), value: item, disabled: false, raw: item });
        return;
      }
      if (isObj(item)) {
        var label = item.label !== undefined ? item.label : (item.text !== undefined ? item.text : item.value);
        var value = item.value !== undefined ? item.value : item.label;
        out.push({
          label: label === null || label === undefined ? String(value) : String(label),
          value: value,
          disabled: !!item.disabled,
          icon: item.icon || '',
          desc: item.desc || item.description || '',
          raw: item
        });
      }
    });
    return out;
  }

  function optionLabelByValue(options, value) {
    for (var i = 0; i < options.length; i++) {
      if (options[i].value === value) { return options[i].label; }
    }
    return null;
  }

  // 分组选项：支持 [{ label:'分组', options:[...] }]
  function isGroupOptions(list) {
    if (!isArr(list) || !list.length) { return false; }
    for (var i = 0; i < list.length; i++) {
      if (!isObj(list[i]) || !isArr(list[i].options)) { return false; }
    }
    return true;
  }

  function flattenOptions(list) {
    if (isGroupOptions(list)) {
      var out = [];
      each(list, function (group) {
        each(normOptions(group.options), function (opt) {
          opt.group = group.label;
          out.push(opt);
        });
      });
      return out;
    }
    return normOptions(list);
  }

  /* ============================================================
   * 七、数字格式化 / 日期工具
   * ============================================================ */

  function formatThousands(numberText) {
    var parts = String(numberText).split('.');
    var intPart = parts[0];
    var sign = '';
    if (intPart.charAt(0) === '-') { sign = '-'; intPart = intPart.slice(1); }
    var out = '';
    var count = 0;
    for (var i = intPart.length - 1; i >= 0; i--) {
      out = intPart.charAt(i) + out;
      count++;
      if (count % 3 === 0 && i > 0) { out = ',' + out; }
    }
    return sign + out + (parts.length > 1 ? '.' + parts.slice(1).join('.') : '');
  }

  function formatNumber(value, opts) {
    opts = opts || {};
    var n = typeof value === 'number' ? value : parseFloat(value);
    if (!isFinite(n)) { return ''; }
    var precision = opts.precision === null || opts.precision === undefined ? null : opts.precision;
    var s;
    if (precision === null) {
      s = String(n);
    } else {
      s = n.toFixed(precision);
    }
    if (opts.thousands) { s = formatThousands(s); }
    return (opts.prefix || '') + s + (opts.suffix || '');
  }

  function parseNumber(text, opts) {
    opts = opts || {};
    var raw = toStr(text);
    var cleaned = raw.replace(/[,\s]/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '-.') {
      return { value: null, valid: false, empty: true };
    }
    var n = parseFloat(cleaned);
    if (!isFinite(n)) { return { value: null, valid: false, empty: false }; }
    if (opts.precision !== null && opts.precision !== undefined) { n = round(n, opts.precision); }
    return { value: n, valid: true, empty: false };
  }

  function formatBytes(bytes) {
    var n = Number(bytes);
    if (!isFinite(n) || n < 0) { return ''; }
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = 0;
    while (n >= 1024 && i < units.length - 1) { n = n / 1024; i++; }
    var text = i === 0 ? String(n) : n.toFixed(n < 10 ? 2 : 1);
    return text + ' ' + units[i];
  }

  var DATE_TOKEN_RE = /YYYY|YY|MM|M|DD|D|HH|H|mm|m|ss|s|SSS/g;

  function formatDate(date, fmt) {
    var d = toDate(date);
    if (!d) { return ''; }
    var pattern = fmt || 'YYYY-MM-DD';
    if (KUI.utils && isFn(KUI.utils.formatDate) && pattern === 'YYYY-MM-DD HH:mm:ss') {
      try { return KUI.utils.formatDate(d, pattern); } catch (e) { /* ignore */ }
    }
    return pattern.replace(DATE_TOKEN_RE, function (tk) {
      switch (tk) {
        case 'YYYY': return String(d.getFullYear());
        case 'YY': return pad(d.getFullYear() % 100);
        case 'MM': return pad(d.getMonth() + 1);
        case 'M': return String(d.getMonth() + 1);
        case 'DD': return pad(d.getDate());
        case 'D': return String(d.getDate());
        case 'HH': return pad(d.getHours());
        case 'H': return String(d.getHours());
        case 'mm': return pad(d.getMinutes());
        case 'm': return String(d.getMinutes());
        case 'ss': return pad(d.getSeconds());
        case 's': return String(d.getSeconds());
        case 'SSS': return pad(d.getMilliseconds(), 3);
        default: return tk;
      }
    });
  }

  function toDate(value) {
    if (!value && value !== 0) { return null; }
    if (Object.prototype.toString.call(value) === '[object Date]') {
      return isNaN(value.getTime()) ? null : value;
    }
    if (isNum(value)) {
      var dn = new Date(value);
      return isNaN(dn.getTime()) ? null : dn;
    }
    if (!isStr(value)) { return null; }
    var s = trim(value);
    if (!s) { return null; }
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/.exec(s);
    if (m) {
      return new Date(
        parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10),
        m[4] ? parseInt(m[4], 10) : 0,
        m[5] ? parseInt(m[5], 10) : 0,
        m[6] ? parseInt(m[6], 10) : 0
      );
    }
    m = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(s);
    if (m) {
      var now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(),
        parseInt(m[1], 10), parseInt(m[2], 10), m[3] ? parseInt(m[3], 10) : 0);
    }
    var fallback = new Date(s);
    return isNaN(fallback.getTime()) ? null : fallback;
  }

  function parseDate(text, fmt) {
    var s = trim(text);
    if (!s) { return null; }
    if (isStr(fmt) && fmt !== 'YYYY-MM-DD' && fmt !== 'YYYY-MM-DD HH:mm:ss') {
      var d = toDate(s);
      return d;
    }
    return toDate(s);
  }

  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function addDays(date, days) {
    var d = new Date(date.getTime());
    d.setDate(d.getDate() + days);
    return d;
  }

  function addMonths(date, months) {
    var d = new Date(date.getTime());
    var day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    var max = daysInMonth(d.getFullYear(), d.getMonth());
    d.setDate(Math.min(day, max));
    return d;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function compareDay(a, b) {
    var av = a.getFullYear() * 10000 + (a.getMonth() + 1) * 100 + a.getDate();
    var bv = b.getFullYear() * 10000 + (b.getMonth() + 1) * 100 + b.getDate();
    return av - bv;
  }

  function todayText() {
    return formatDate(new Date(), 'YYYY-MM-DD');
  }

  /* ============================================================
   * 八、事件发射 / 动作分发
   * ============================================================ */

  function dispatchDomEvent(el, name, detail) {
    if (!el || !el.dispatchEvent || typeof document === 'undefined') { return; }
    try {
      var ev;
      if (typeof window !== 'undefined' && isFn(window.CustomEvent)) {
        ev = new window.CustomEvent(name, { bubbles: true, cancelable: false, detail: detail });
      } else if (isFn(document.createEvent)) {
        ev = document.createEvent('CustomEvent');
        ev.initCustomEvent(name, true, false, detail);
      } else {
        return;
      }
      el.dispatchEvent(ev);
    } catch (e) { /* 测试桩可能不支持自定义事件，静默降级 */ }
  }

  function emit(ctx, name, payload) {
    if (ctx && isFn(ctx.emit)) {
      try { ctx.emit(name, payload); } catch (e) { /* 宿主回调异常不应打断控件 */ }
    }
  }

  function notifyForm(ctx, node, payload) {
    if (ctx && isFn(ctx.emit)) { return; }
    if (ctx && ctx.form && isFn(ctx.form._notifyChange) && node && node.id) {
      try { ctx.form._notifyChange(node.id, payload.value, payload.el); } catch (e) { /* ignore */ }
    } else if (ctx && ctx.form && isFn(ctx.form._notify)) {
      try { ctx.form._notify(payload); } catch (e) { /* ignore */ }
    }
  }

  function emitChange(el, ctx, node, value, extra) {
    if (el && el.__kuiSilent) { return; }
    var payload = {
      id: node ? node.id : undefined,
      value: value,
      node: node,
      el: el,
      control: el ? el.__kuiControl : null,
      type: node ? node.type : ''
    };
    if (extra) { each(extra, function (v, k) { payload[k] = v; }); }
    if (ctx && isFn(ctx.emit)) { emit(ctx, 'control:change', payload); }
    else { notifyForm(ctx, node, payload); }
    dispatchDomEvent(el, 'kui-change', payload);
    var onChange = node && node.on && node.on.change;
    if (!onChange && node && node.props && node.props.onChangeAction) {
      onChange = node.props.onChangeAction;
    }
    if (onChange) { dispatchAction(onChange, ctx, el, node, payload); }
    return payload;
  }

  function emitFocus(el, ctx, node) {
    emit(ctx, 'control:focus', { id: node ? node.id : undefined, node: node, el: el });
    dispatchDomEvent(el, 'kui-focus', { el: el, node: node });
  }

  function emitBlur(el, ctx, node) {
    emit(ctx, 'control:blur', { id: node ? node.id : undefined, node: node, el: el });
    dispatchDomEvent(el, 'kui-blur', { el: el, node: node });
  }

  function emitAction(el, ctx, node, name, payload) {
    var data = payload || {};
    data.id = node ? node.id : undefined;
    data.node = node;
    data.el = el;
    data.action = name;
    emit(ctx, 'control:action', data);
    dispatchDomEvent(el, 'kui-action', data);
    if (ctx && ctx.form && node && node.id && isFn(ctx.form._notifyAction)) {
      try { ctx.form._notifyAction(node.id, name, data); } catch (e) { /* ignore */ }
    }
    return data;
  }

  function resolvePath(root, path) {
    if (!root || !path) { return null; }
    var parts = String(path).split('.');
    var cur = root;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) { return null; }
      cur = cur[parts[i]];
    }
    return cur;
  }

  /**
   * action 分发：node.on.click / props.action 的 JSON 描述。
   * 支持 {action:'theme.picker', params:{}}、字符串动作名、{emit,detail} 等。
   * 统一走 core 的 KUI.actions.run(action, ctx, ev)；不存在时降级为 ctx.emit('action')。
   */
  function dispatchAction(spec, ctx, el, node, extra) {
    var action = spec;
    if (isStr(spec)) { action = { action: spec }; }
    if (!isObj(action)) { return null; }
    var payload = extra || {};
    var ev = {
      id: node ? node.id : undefined,
      value: payload.value,
      payload: payload,
      node: node,
      el: el,
      ctx: ctx
    };
    if (KUI.actions && isFn(KUI.actions.run)) {
      try { return KUI.actions.run(action, ctx, ev); } catch (e) { /* core 已 try/catch，这里再兜一层 */ }
    }
    if (isFn(action.handler)) { return action.handler(ev); }
    var name = action.action || action.name || action.type;
    if (ctx && isFn(ctx.emit)) {
      emit(ctx, 'action', { action: name, payload: ev, node: node, el: el });
    }
    if (ctx && ctx.form) {
      if (name === 'submit' || name === 'form.submit') { return ctx.form.submit ? ctx.form.submit() : null; }
      if (name === 'reset' || name === 'form.reset') { return ctx.form.reset ? ctx.form.reset() : null; }
      if (name === 'clear') { return ctx.form.clearValidate ? ctx.form.clearValidate() : null; }
    }
    if (name === 'close') {
      if (ctx && isFn(ctx.close)) { return ctx.close(); }
      if (KUI.dialog && isFn(KUI.dialog.close)) { return KUI.dialog.close(); }
    }
    var target = resolvePath(KUI, name);
    if (isFn(target)) {
      try { return target(ev); } catch (e) { /* ignore */ }
    }
    return null;
  }

  /* ============================================================
   * 九、状态机 / API 构造
   * ============================================================ */

  function setState(target, state) {
    if (!target || !state) { return target; }
    if (state.disabled !== undefined) {
      toggleClass(target, 'is-disabled', !!state.disabled);
      attr(target, 'aria-disabled', state.disabled ? 'true' : null);
    }
    if (state.readonly !== undefined) { toggleClass(target, 'is-readonly', !!state.readonly); }
    if (state.error !== undefined) { toggleClass(target, 'is-error', !!state.error); }
    if (state.active !== undefined) { toggleClass(target, 'is-active', !!state.active); }
    if (state.open !== undefined) { toggleClass(target, 'is-open', !!state.open); }
    if (state.focus !== undefined) { toggleClass(target, 'is-focus', !!state.focus); }
    if (state.empty !== undefined) { toggleClass(target, 'is-empty', !!state.empty); }
    return target;
  }

  function addDestroyer(el, fn) {
    if (!el) { return; }
    if (!el.__kuiDestroyers) { el.__kuiDestroyers = []; }
    if (isFn(fn)) { el.__kuiDestroyers.push(fn); }
  }

  function runDestroyers(el) {
    if (!el || !el.__kuiDestroyers) { return; }
    var list = el.__kuiDestroyers;
    el.__kuiDestroyers = [];
    each(list, function (fn) {
      try { fn(); } catch (e) { /* ignore */ }
    });
  }

  function emptyValue(v) {
    if (v === null || v === undefined) { return true; }
    // v1.3.0：开关（switch）关掉 → 布尔 false，视为「未填写」，这样 required 才能真正拦住未开启的开关
    if (v === false) { return true; }
    if (isStr(v) && trim(v) === '') { return true; }
    if (isArr(v) && v.length === 0) { return true; }
    return false;
  }

  function validateValue(value, rules, required, node) {
    var list = isArr(rules) ? rules : [];
    var isRequired = !!required;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].required) { isRequired = true; break; }
    }
    if (isRequired && emptyValue(value)) {
      for (var r = 0; r < list.length; r++) {
        if (list[r] && list[r].required) { return { valid: false, message: list[r].message || t('validate.required', '该项为必填') }; }
      }
      return { valid: false, message: t('validate.required', '该项为必填') };
    }
    if (emptyValue(value)) { return { valid: true, message: '' }; }
    for (var j = 0; j < list.length; j++) {
      var rule = list[j];
      if (!rule || rule.required) { continue; }
      var msg = rule.message || '';
      var text = isArr(value) ? String(value.join(',')) : String(value);
      if (rule.pattern) {
        var re = null;
        if (rule.pattern instanceof RegExp) { re = rule.pattern; }
        else { try { re = new RegExp(String(rule.pattern)); } catch (e) { re = null; } }
        if (re && !re.test(text)) { return { valid: false, message: msg || t('validate.pattern', '格式不正确') }; }
      }
      if (rule.type) {
        var typeValid = true;
        if (rule.type === 'email') { typeValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text); }
        else if (rule.type === 'number') { typeValid = isFinite(parseFloat(text)); }
        else if (rule.type === 'url') { typeValid = /^https?:\/\/[^\s]+$/.test(text); }
        else if (rule.type === 'phone') { typeValid = /^1[3-9]\d{9}$/.test(text); }
        else if (rule.type === 'integer') { typeValid = /^-?\d+$/.test(text); }
        if (!typeValid) { return { valid: false, message: msg || t('validate.type', '格式不正确') }; }
      }
      if (rule.min !== null && rule.min !== undefined) {
        var minOk = isNum(value) ? value >= rule.min : text.length >= rule.min;
        if (!minOk) {
          return { valid: false, message: msg || (isNum(value) ? t('validate.minNumber', '不能小于 {{min}}', { min: rule.min }) : t('validate.minLength', '至少 {{min}} 个字符', { min: rule.min })) };
        }
      }
      if (rule.max !== null && rule.max !== undefined) {
        var maxOk = isNum(value) ? value <= rule.max : text.length <= rule.max;
        if (!maxOk) {
          return { valid: false, message: msg || (isNum(value) ? t('validate.maxNumber', '不能大于 {{max}}', { max: rule.max }) : t('validate.maxLength', '最多 {{max}} 个字符', { max: rule.max })) };
        }
      }
      if (rule.len !== null && rule.len !== undefined && text.length !== rule.len) {
        return { valid: false, message: msg || t('validate.len', '长度需为 {{len}}', { len: rule.len }) };
      }
      if (isFn(rule.validator)) {
        var result = rule.validator(value, node);
        if (result === false) { return { valid: false, message: msg || t('validate.failed', '校验未通过') }; }
        if (isStr(result)) { return { valid: false, message: result }; }
      }
    }
    return { valid: true, message: '' };
  }

  function getValidateRules(node) {
    if (!node) { return []; }
    var rules = p(node, 'rules', []);
    if (isArr(rules)) { return rules; }
    return [];
  }

  function makeApi(el, node, ctx, impl) {
    impl = impl || {};
    var getValue = impl.getValue || function () { return null; };
    var api = {
      el: el,
      node: node,
      getValue: getValue,
      setValue: impl.setValue || function () { return api; },
      validate: impl.validate || function () {
        return validateValue(getValue(), getValidateRules(node), p(node, 'required', false), node);
      },
      setDisabled: impl.setDisabled || function (flag) {
        setState(el, { disabled: flag });
        if (impl.__disabledHook) { impl.__disabledHook(flag); }
        el.setAttribute('aria-disabled', flag ? 'true' : 'false');
        return api;
      },
      setReadonly: impl.setReadonly || function (flag) {
        setState(el, { readonly: flag });
        if (impl.__readonlyHook) { impl.__readonlyHook(flag); }
        return api;
      },
      focus: impl.focus || function () {
        if (isFn(el.focus)) { el.focus(); }
        return api;
      },
      destroy: function () {
        try { if (isFn(impl.destroy)) { impl.destroy(); } } catch (e) { /* ignore */ }
        runDestroyers(el);
        if (el.__kuiControl === api) { el.__kuiControl = null; }
      }
    };
    each(impl, function (v, k) {
      if (api[k] === undefined) { api[k] = v; }
    });
    el.__kuiControl = api;
    el.__kuiNode = node;
    el.__kuiCtx = ctx;
    return api;
  }

  function regEl(type, node, ctx, extraClass) {
    var el2 = document.createElement('div');
    el2.className = 'kui-control kui-control--' + type + (extraClass ? ' ' + extraClass : '');
    el2.setAttribute('data-kui-type', type);
    if (node && node.id) { el2.setAttribute('data-kui-id', node.id); }
    if (node && node.disabled) { addClass(el2, 'is-disabled'); }
    if (node && node.readonly) { addClass(el2, 'is-readonly'); }
    return el2;
  }

  /**
   * 控件收尾：
   * - 表单内（ctx.form 存在）：返回控件盒本身（label 由 form 统一包装）。
   * - 独立渲染且节点带 label/help/error/unit/required：自动补 .kui-field 包装。
   * - 统一挂 el.__kuiControl，并补齐 setError / setDisabled / setReadonly 的视觉联动。
   */
  function finalize(node, ctx, type, box, impl, opts) {
    opts = opts || {};
    impl = impl || {};
    var isForm = !!(ctx && ctx.form);
    var meta = node && (
      node.label || node.help || node.error || node.unit ||
      node.required || (node.rules && node.rules.length) || node.width
    );
    var needsField = !isForm && opts.selfWrap !== false && !!meta;
    var field = null;
    var returned = box;
    addClass(box, 'kui-control__box');
    if (needsField) {
      field = createField(node, ctx, {});
      field.row.appendChild(box);
      addClass(field.el, 'kui-control');
      addClass(field.el, 'kui-control--' + type);
      if (node && node.id) { field.el.setAttribute('data-kui-id', node.id); }
      returned = field.el;
      if (p(node, 'error', '')) { field.setError(p(node, 'error', '')); setState(box, { error: true }); }
    } else {
      addClass(box, 'kui-control');
      addClass(box, 'kui-control--' + type);
      returned = box;
    }
    if (isFn(impl.__prepare)) { impl.__prepare(returned); }

    var apiImpl = {};
    each(impl, function (v, k) { apiImpl[k] = v; });
    var prevDisabledHook = impl.__disabledHook;
    var prevReadonlyHook = impl.__readonlyHook;
    apiImpl.__disabledHook = function (flag) {
      setState(box, { disabled: !!flag });
      if (field) { setState(field.el, { disabled: !!flag }); }
      if (isFn(prevDisabledHook)) { prevDisabledHook(!!flag); }
    };
    apiImpl.__readonlyHook = function (flag) {
      setState(box, { readonly: !!flag });
      if (field) { setState(field.el, { readonly: !!flag }); }
      if (isFn(prevReadonlyHook)) { prevReadonlyHook(!!flag); }
    };
    var api = makeApi(returned, node, ctx, apiImpl);
    api.box = box;
    api.field = field;
    if (box !== returned) { box.__kuiControl = api; box.__kuiNode = node; box.__kuiCtx = ctx; }
    api.error = '';
    api.setError = function (msg) {
      api.error = msg ? String(msg) : '';
      setState(box, { error: !!api.error });
      if (field) { field.setError(api.error); }
      return api;
    };
    api.clearError = function () { return api.setError(''); };
    api.getBox = function () { return box; };
    if (node && node.disabled) { api.setDisabled(true); }
    if (node && node.readonly) { api.setReadonly(true); }
    if (isFn(impl.__after)) { impl.__after(api, returned); }
    return returned;
  }

  /* ============================================================
   * 十、字段包装器（form 与 field 控件共用）
   * ============================================================ */

  function fieldOptions(node, ctx, opts) {
    opts = opts || {};
    var form = ctx && ctx.form;
    var layout = form && form.options && form.options.layout ? form.options.layout : null;
    var labelPosition = p(node, 'labelPosition', null);
    if (!labelPosition) {
      labelPosition = opts.labelPosition || (layout && layout.labelPosition) || 'left';
    }
    var labelWidth = p(node, 'labelWidth', null);
    if (labelWidth === null && layout && layout.labelWidth) { labelWidth = layout.labelWidth; }
    return {
      labelPosition: labelPosition,
      labelWidth: labelWidth,
      label: p(node, 'label', ''),
      help: p(node, 'help', p(node, 'hint', p(node, 'tip', ''))),
      error: p(node, 'error', ''),
      required: p(node, 'required', false),
      unit: p(node, 'unit', ''),
      width: p(node, 'width', null),
      span: p(node, 'span', p(node, 'colspan', null)),
      className: opts.className || ''
    };
  }

  function createField(node, ctx, opts) {
    opts = opts || {};
    var fo = fieldOptions(node, ctx, opts);
    var rootClass = 'kui-field kui-field--' + fo.labelPosition;
    if (opts.controlType) { rootClass += ' kui-control kui-control--' + opts.controlType + ' kui-control--field'; }
    if (fo.className) { rootClass += ' ' + fo.className; }
    var root = el('div', { 'class': rootClass, 'data-kui-type': 'field' });
    if (node && node.id) { root.setAttribute('data-kui-field-id', node.id); }
    if (fo.width !== null && fo.width !== undefined) {
      if (isNum(fo.width)) { root.style.width = fo.width + 'px'; }
      else { root.style.width = String(fo.width); }
    }
    if (fo.span !== null && fo.span !== undefined) {
      root.style.gridColumn = 'span ' + fo.span;
    }
    var labelEl = null;
    var labelTextEl = null;
    if (opts.label !== false && (fo.label || (node && (node.__linkRequired || p(node, 'required', false))))) {
      labelEl = el('label', { 'class': 'kui-field__label' });
      labelTextEl = el('span', { 'class': 'kui-field__label-text', text: fo.label || '' });
      var star = el('i', { 'class': 'kui-field__required', text: '*' });
      labelEl.appendChild(labelTextEl);
      labelEl.appendChild(star);
      root.appendChild(labelEl);
    } else if (opts.label === false) {
      root.classList.add('kui-field--no-label');
    }
    // v1.3.0：星号显隐由 .kui-field.is-required 控制（未必填字段不再出现星号），这里先同步初始态
    if (node && (p(node, 'required', false) || node.__linkRequired)) { root.classList.add('is-required'); }
    var main = el('div', { 'class': 'kui-field__main' });
    var row = el('div', { 'class': 'kui-field__row' });
    var suffixEl = el('span', { 'class': 'kui-field__suffix', text: fo.unit || '' });
    var foot = el('div', { 'class': 'kui-field__foot' });
    var errorEl = el('span', { 'class': 'kui-field__error' });
    var helpEl = el('span', { 'class': 'kui-field__help', text: fo.help || '' });
    foot.appendChild(errorEl);
    foot.appendChild(helpEl);
    main.appendChild(row);
    main.appendChild(foot);
    root.appendChild(main);

    var parts = {
      el: root,
      labelEl: labelEl,
      labelTextEl: labelTextEl,
      main: main,
      row: row,
      foot: foot,
      errorEl: errorEl,
      helpEl: helpEl,
      suffixEl: suffixEl,
      state: { required: !!fo.required, error: fo.error || '', help: fo.help || '' },
      setLabel: function (txt) {
        if (!labelEl && txt) {
          labelEl = el('label', { 'class': 'kui-field__label' });
          labelTextEl = el('span', { 'class': 'kui-field__label-text', text: txt });
          labelEl.appendChild(labelTextEl);
          labelEl.appendChild(el('i', { 'class': 'kui-field__required', text: '*' }));
          root.insertBefore(labelEl, main);
          parts.labelEl = labelEl;
          parts.labelTextEl = labelTextEl;
        }
        if (labelTextEl) { labelTextEl.textContent = toStr(txt); }
      },
      setRequired: function (flag) {
        parts.state.required = !!flag;
        toggleClass(root, 'is-required', !!flag);
        // v1.3.0：动态变成必填时同步去掉「可选」标记，否则星号会被 .is-required-optional 规则压住
        toggleClass(root, 'is-required-optional', !flag);
        if (labelEl) { labelEl.style.display = ''; }
        if (flag && !labelEl) { parts.setLabel(fo.label || ''); }
      },
      setError: function (msg) {
        parts.state.error = msg ? String(msg) : '';
        toggleClass(root, 'is-error', !!parts.state.error);
        errorEl.textContent = parts.state.error;
        errorEl.style.display = parts.state.error ? '' : 'none';
      },
      setHelp: function (msg) {
        parts.state.help = msg ? String(msg) : '';
        helpEl.textContent = parts.state.help;
        helpEl.style.display = parts.state.help ? '' : 'none';
      },
      setUnit: function (unit) {
        suffixEl.textContent = unit ? String(unit) : '';
        suffixEl.style.display = unit ? '' : 'none';
      },
      setVisible: function (flag) {
        toggleClass(root, 'is-hidden', !flag);
        if (flag) { root.removeAttribute('hidden'); } else { root.setAttribute('hidden', ''); }
      },
      setState: function (state) { setState(root, state); return parts; },
      destroy: function () { runDestroyers(root); }
    };
    if (!fo.unit) { suffixEl.style.display = 'none'; }
    if (!fo.help) { helpEl.style.display = 'none'; }
    if (fo.labelPosition === 'left' && fo.labelWidth) {
      root.style.setProperty('--kui-field-label-width', isNum(fo.labelWidth) ? fo.labelWidth + 'px' : String(fo.labelWidth));
    }
    if (!fo.required) { if (labelEl) { addClass(root, 'is-required-optional'); } }
    return parts;
  }

  /* ============================================================
   * 十一、焦点 / 键盘 / 长按工具
   * ============================================================ */

  function bindFocus(el, opts) {
    opts = opts || {};
    var root = opts.root || el;
    var focusTarget = opts.target || el;
    var offIn = on(root, 'focusin', function () {
      addClass(root, 'is-focus');
      if (isFn(opts.onFocus)) { opts.onFocus(); }
    });
    var offOut = on(root, 'focusout', function (ev) {
      if (ev && ev.relatedTarget && contains(root, ev.relatedTarget)) { return; }
      removeClass(root, 'is-focus');
      if (isFn(opts.onBlur)) { opts.onBlur(); }
    });
    addDestroyer(root, offIn);
    addDestroyer(root, offOut);
    return root;
  }

  function bindEnter(root, ctx, opts) {
    opts = opts || {};
    if (opts.textarea) { return null; }
    return on(root, 'keydown', function (ev) {
      if (ev.key !== 'Enter') { return; }
      if (ev.isComposing) { return; }
      if (isFn(opts.onEnter)) {
        ev.preventDefault();
        opts.onEnter(ev);
        return;
      }
      if (ctx && ctx.form && isFn(ctx.form._enterSubmit) && p(ctx.form.__node || {}, 'submitOnEnter', true)) {
        var allow = true;
        if (isFn(ctx.form.canEnterSubmit)) { allow = ctx.form.canEnterSubmit(); }
        if (allow) {
          ev.preventDefault();
          ctx.form._enterSubmit();
        }
      }
    });
  }

  /**
   * 长按连发：用于 number 加减、time 列箭头。
   * handler(kind) kind: 'click' | 'repeat' | 'start'
   */
  function repeatPress(el, handler, opts) {
    opts = opts || {};
    var delay = opts.delay === undefined ? 420 : opts.delay;
    var interval = opts.interval === undefined ? 90 : opts.interval;
    var fastInterval = opts.fastInterval === undefined ? 45 : opts.fastInterval;
    var fastAfter = opts.fastAfter === undefined ? 10 : opts.fastAfter;
    var timer = null;
    var timer2 = null;
    var count = 0;
    var pointerHandled = false;
    var offs = [];

    function clearTimers() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (timer2) { clearTimeout(timer2); timer2 = null; }
    }
    function loop() {
      count += 1;
      handler('repeat', count);
      var gap = count >= fastAfter ? fastInterval : interval;
      timer2 = setTimeout(loop, gap);
    }
    function stop() {
      clearTimers();
      removeClass(el, 'is-pressing');
      document.removeEventListener('mouseup', stop, true);
    }
    function startRepeat() {
      clearTimers();
      count = 0;
      addClass(el, 'is-pressing');
      timer = setTimeout(loop, delay);
      document.addEventListener('mouseup', stop, true);
    }
    offs.push(on(el, 'mousedown', function (ev) {
      if (ev.button !== undefined && ev.button !== 0) { return; }
      ev.preventDefault();
      pointerHandled = true;
      handler('click');
      startRepeat();
    }));
    offs.push(on(el, 'click', function (ev) {
      if (pointerHandled) { return; }
      handler('click');
    }));
    offs.push(on(el, 'mouseup', stop));
    offs.push(on(el, 'mouseleave', stop));
    addDestroyer(el, function () {
      clearTimers();
      each(offs, function (off) { off(); });
    });
    return { stop: stop };
  }

  /* ============================================================
   * 十二、统一弹层 popup（契约 §6）
   * ============================================================ */

  var popup = ns.popup = ns.popup || {};
  popup._stack = popup._stack || [];
  popup._seq = popup._seq || 0;
  popup._zBase = popup._zBase || null;

  function popupZBase() {
    if (popup._zBase) { return popup._zBase; }
    var raw = cssVar('--kui-popup-z');
    var n = parseInt(raw, 10);
    popup._zBase = isFinite(n) && n > 0 ? n : 3000;
    return popup._zBase;
  }

  function isInLayer(state, target) {
    if (!state || !target) { return false; }
    return contains(state.el, target);
  }

  function onDocDown(ev) {
    var states = popup._stack.slice();
    for (var i = states.length - 1; i >= 0; i--) {
      var state = states[i];
      if (!state.isOpen) { continue; }
      var target = ev.target;
      if (isInLayer(state, target)) { continue; }
      if (state.anchorEl && contains(state.anchorEl, target)) { continue; }
      if (state.opts && state.opts.ignoreOutside && state.opts.ignoreOutside(target)) { continue; }
      state.close();
    }
  }

  function onDocKey(ev) {
    if (ev.key !== 'Escape' && ev.keyCode !== 27) { return; }
    var states = popup._stack.slice();
    for (var i = states.length - 1; i >= 0; i--) {
      if (states[i].isOpen) {
        states[i].close();
        if (states[i].opts && states[i].opts.stopEsc) { ev.stopPropagation(); }
        break;
      }
    }
  }

  function onReflow(ev) {
    var states = popup._stack.slice();
    for (var i = 0; i < states.length; i++) {
      var state = states[i];
      if (!state.isOpen) { continue; }
      if (ev && ev.type === 'scroll' && ev.target && state.el && contains(state.el, ev.target)) { continue; }
      state.reposition();
    }
  }

  // v1.3.0：点击到 iframe 内部（跨文档时父页收不到 mousedown）也要把弹层关掉
  function hasIframeTarget(target) {
    var node = target;
    while (node && node !== document) {
      if (node.nodeType === 1 && String(node.tagName || '').toUpperCase() === 'IFRAME') { return true; }
      node = node.parentNode;
    }
    return false;
  }

  function onFocusIntoFrame(ev) {
    if (!hasIframeTarget(ev && ev.target)) { return; }
    var states = popup._stack.slice();
    for (var i = 0; i < states.length; i++) {
      if (states[i].isOpen) { states[i].close(); }
    }
  }

  // v1.3.0：点击父级 UI（弹层所在文档失焦）时也要关闭弹层
  function onWindowBlur() {
    var states = popup._stack.slice();
    for (var i = 0; i < states.length; i++) {
      if (states[i].isOpen) { states[i].close(); }
    }
  }

  function bindGlobalPopupEvents() {
    if (popup._bound) { return; }
    popup._bound = true;
    on(document, 'mousedown', onDocDown, true);
    on(document, 'keydown', onDocKey, true);
    on(document, 'focusin', onFocusIntoFrame, true);
    // v1.3.0：焦点离开本文档（点到父级 UI / 切到其它 iframe）时关闭弹层
    on(document, 'focusout', function (ev) {
      if (!ev || ev.relatedTarget) { return; }
      onWindowBlur();
    }, true);
    if (typeof window !== 'undefined') {
      on(window, 'resize', onReflow);
      on(window, 'scroll', onReflow, true);
      on(window, 'blur', onWindowBlur);
    }
  }

  popup.open = function (anchorEl, contentEl, opts) {
    if (!anchorEl || !contentEl) { return null; }
    if (typeof document === 'undefined') { return null; }
    opts = opts || {};
    // v1.3.0：点外部先用 mousedown 关闭弹层，紧随其后的同一锚点 click 又把它打开 → 表现为「点外面关不掉」。
    // 最近 300ms 内同一锚点刚关闭过就忽略本次打开。
    var lastClosed = popup._lastClosed;
    if (lastClosed && lastClosed.anchorEl === anchorEl && (Date.now() - lastClosed.at) < 300) { return null; }
    // 同一锚点重复打开：先关闭旧弹层
    var old = popup._stack.slice();
    for (var oi = 0; oi < old.length; oi++) {
      if (old[oi].anchorEl === anchorEl) { old[oi].close(); }
    }

    var layer = document.createElement('div');
    layer.className = 'kui-popup-layer';
    if (opts.className) { layer.className += ' ' + opts.className; }
    layer.appendChild(contentEl);
    document.body.appendChild(layer);
    bindGlobalPopupEvents();

    var state = {
      el: layer,
      contentEl: contentEl,
      anchorEl: anchorEl,
      opts: opts,
      isOpen: true
    };
    state.zIndex = popupZBase() + (++popup._seq);
    layer.style.zIndex = String(state.zIndex);

    function place() {
      if (!state.isOpen || !layer.parentNode) { return; }
      var a;
      try { a = anchorEl.getBoundingClientRect(); } catch (e) { return; }
      if (!a) { return; }
      var win = typeof window !== 'undefined' ? window : null;
      var vw = (win && win.innerWidth) || 0;
      var vh = (win && win.innerHeight) || 0;
      var margin = opts.margin === undefined ? 8 : opts.margin;
      var offset = opts.offset === undefined ? 6 : opts.offset;
      var placement = opts.placement || 'bottom-start';
      var vertical = placement.indexOf('top') === 0 ? 'top' : 'bottom';
      var horizontal = /-end$/.test(placement) ? 'end' : 'start';

      if (opts.width === 'anchor' || opts.matchWidth) {
        var w0 = Math.max(a.width || 0, opts.minWidth || 0);
        if (w0) { layer.style.width = Math.round(w0) + 'px'; }
      } else if (isNum(opts.width)) {
        layer.style.width = opts.width + 'px';
      } else if (isStr(opts.width) && opts.width !== 'auto') {
        layer.style.width = opts.width;
      } else {
        layer.style.width = '';
      }

      var rect;
      try { rect = layer.getBoundingClientRect(); } catch (e) { return; }
      var w = rect.width || 0;
      var h = rect.height || 0;
      var spaceBelow = vh - a.bottom - margin;
      var spaceAbove = a.top - margin;
      if (vertical === 'bottom' && h > spaceBelow && spaceAbove > spaceBelow) { vertical = 'top'; }
      else if (vertical === 'top' && h > spaceAbove && spaceBelow > spaceAbove) { vertical = 'bottom'; }
      var top = vertical === 'bottom' ? a.bottom + offset : a.top - offset - h;
      top = Math.max(margin, Math.min(top, vh - margin - h));
      var left = horizontal === 'end' ? a.right - w : a.left;
      left = Math.max(margin, Math.min(left, vw - margin - w));
      layer.style.top = Math.round(top) + 'px';
      layer.style.left = Math.round(left) + 'px';
      layer.setAttribute('data-placement', vertical + '-' + horizontal);
      if (opts.maxHeight === 'auto') {
        var available = vertical === 'bottom' ? spaceBelow : spaceAbove;
        if (available > 80) { layer.style.maxHeight = Math.round(available) + 'px'; }
        else { layer.style.maxHeight = ''; }
      }
      state.placement = vertical + '-' + horizontal;
      if (isFn(opts.onPlace)) {
        try { opts.onPlace(layer, { vertical: vertical, horizontal: horizontal, anchorRect: a }); } catch (e) { /* ignore */ }
      }
    }

    state.reposition = function () { place(); };
    state.close = function () {
      if (!state.isOpen) { return; }
      state.isOpen = false;
      // v1.3.0：记录最近一次关闭，供 popup.open 做「点击外部关闭后又被 click 重新打开」的守卫
      popup._lastClosed = { anchorEl: state.anchorEl, at: Date.now() };
      // v1.3.0：记录最近一次关闭，供 popup.open 做「点击外部关闭后又被 click 重新打开」的守卫
      popup._lastClosed = { anchorEl: state.anchorEl, at: Date.now() };
      var idx = indexOf(popup._stack, state);
      if (idx >= 0) { popup._stack.splice(idx, 1); }
      document.removeEventListener('mousedown', onDocDown, true);
      document.removeEventListener('keydown', onDocKey, true);
      // 全局监听由其他弹层继续登记
      if (popup._stack.length) { bindGlobalPopupEvents(); }
      layer.classList.add('is-closing');
      var removed = false;
      function removeLayer() {
        if (removed) { return; }
        removed = true;
        remove(layer);
      }
      if (opts.closeAnimation === false) { removeLayer(); }
      else { setTimeout(removeLayer, 140); }
      if (isFn(opts.onClose)) {
        try { opts.onClose(state); } catch (e) { /* ignore */ }
      }
    };
    state.setContent = function (next) {
      clear(layer);
      if (next) { layer.appendChild(next); }
      state.contentEl = next;
      place();
    };

    popup._stack.push(state);
    place();
    nextFrame(function () {
      if (!state.isOpen) { return; }
      addClass(layer, 'is-open');
      if (isFn(opts.onOpen)) {
        try { opts.onOpen(state); } catch (e) { /* ignore */ }
      }
    });
    return state;
  };

  popup.closeAll = function () {
    var states = popup._stack.slice();
    for (var i = 0; i < states.length; i++) { states[i].close(); }
  };
  popup.isOpen = function (anchorEl) {
    for (var i = 0; i < popup._stack.length; i++) {
      if (popup._stack[i].anchorEl === anchorEl && popup._stack[i].isOpen) { return true; }
    }
    return false;
  };
  popup.top = function () {
    var list = popup._stack;
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i].isOpen) { return list[i]; }
    }
    return null;
  };
  popup.repositionAll = function () {
    for (var i = 0; i < popup._stack.length; i++) {
      if (popup._stack[i].isOpen) { popup._stack[i].reposition(); }
    }
  };

  /* ============================================================
   * 十三、descriptor 注册 / index.js 装配
   * ============================================================ */

  ns.defs = ns.defs || {};
  ns.autoRegister = !!ns.autoRegister;

  function registerOne(type, def) {
    if (!KUI.registry || !isFn(KUI.registry.register)) { return false; }
    try {
      if (isFn(KUI.registry.has) && KUI.registry.has(type)) { return true; }
      KUI.registry.register(type, def);
      return true;
    } catch (e) {
      return false;
    }
  }

  ns.define = ns.define || function (type, def) {
    ns.defs[type] = def;
    if (ns.autoRegister) { registerOne(type, def); }
    return def;
  };

  ns.registerAll = function () {
    var count = 0;
    each(ns.defs, function (def, type) {
      if (registerOne(type, def)) { count += 1; }
    });
    ns.autoRegister = true;
    // form 类型的 render 依赖 form.js（后加载），注册放在 index.js，此处只兜底
    if (KUI.registry && isFn(KUI.registry.has) && !KUI.registry.has('form') && isObj(ns.defs.form)) {
      registerOne('form', ns.defs.form);
    }
    ns.__registered = true;
    return count;
  };

  ns.init = ns.init || ns.registerAll;

  /* ============================================================
   * 十四、对外导出
   * ============================================================ */

  base.isFn = isFn;
  base.isStr = isStr;
  base.isNum = isNum;
  base.isBool = isBool;
  base.isArr = isArr;
  base.isObj = isObj;
  base.has = has;
  base.noop = noop;
  base.toStr = toStr;
  base.trim = trim;
  base.each = each;
  base.map = map;
  base.indexOf = indexOf;
  base.deepGet = deepGet;
  base.clamp = clamp;
  base.uid = uid;
  base.debounce = debounce;
  base.nextFrame = nextFrame;
  base.round = round;
  base.pad = pad;
  base.escapeHtml = escapeHtml;
  base.merge = merge;
  base.t = t;
  base.text = t;
  base.token = token;
  base.cssVar = cssVar;
  base.themeColor = themeColor;
  base.el = el;
  base.frag = frag;
  base.clear = clear;
  base.remove = remove;
  base.addClass = addClass;
  base.removeClass = removeClass;
  base.toggleClass = toggleClass;
  base.hasClass = hasClass;
  base.attr = attr;
  base.setAria = setAria;
  base.on = on;
  base.once = once;
  base.closest = closest;
  base.contains = contains;
  base.scrollIntoView = scrollIntoView;
  base.iconEl = iconEl;
  base.iconHtml = iconHtml;
  base.getProps = getProps;
  base.p = p;
  base.normOptions = normOptions;
  base.flattenOptions = flattenOptions;
  base.isGroupOptions = isGroupOptions;
  base.optionLabelByValue = optionLabelByValue;
  base.formatThousands = formatThousands;
  base.formatNumber = formatNumber;
  base.parseNumber = parseNumber;
  base.formatBytes = formatBytes;
  base.formatDate = formatDate;
  base.toDate = toDate;
  base.parseDate = parseDate;
  base.daysInMonth = daysInMonth;
  base.addDays = addDays;
  base.addMonths = addMonths;
  base.startOfDay = startOfDay;
  base.sameDay = sameDay;
  base.compareDay = compareDay;
  base.todayText = todayText;
  base.dispatchDomEvent = dispatchDomEvent;
  base.emit = emit;
  base.emitChange = emitChange;
  base.emitFocus = emitFocus;
  base.emitBlur = emitBlur;
  base.emitAction = emitAction;
  base.dispatchAction = dispatchAction;
  base.resolvePath = resolvePath;
  base.setState = setState;
  base.addDestroyer = addDestroyer;
  base.runDestroyers = runDestroyers;
  base.emptyValue = emptyValue;
  base.validateValue = validateValue;
  base.getValidateRules = getValidateRules;
  base.makeApi = makeApi;
  base.regEl = regEl;
  base.finalize = finalize;
  base.createField = createField;
  base.fieldOptions = fieldOptions;
  base.bindFocus = bindFocus;
  base.bindEnter = bindEnter;
  base.repeatPress = repeatPress;
  base.openPopup = function (anchorEl, contentEl, opts) { return popup.open(anchorEl, contentEl, opts); };
  base.closePopups = function () { popup.closeAll(); };
  base.typeOf = function (node) { return node && node.type ? node.type : ''; };

  ns.register = ns.register || function (type, def) { return ns.define(type, def); };

  // control-base.js 自身也走 index.js 的统一注册；若 index.js 已提前加载完成，define 会立即注册。
})(window.KUI);

/*!
 * KurumiUI · form.js（表单容器 + 联动引擎）
 * -----------------------------------------------------------------------------
 * 契约 §7：KUI.form.create(hostEl, opts) -> formInstance
 *   - 字段渲染完全复用 KUI.renderNode（控件自身负责取值/校验/disabled/readonly）
 *   - deps 联动：先恢复默认态，再按声明顺序应用所有命中规则
 *   - 字段 DOM 统一带 data-field-id="<字段 id>"，方便测试与外部定位
 *   - 零依赖、无构建、传统 <script>、Node 13.14 语法兼容
 */
(function (window, document) {
  'use strict';

  var KUI = window.KUI = window.KUI || {};
  if (KUI.form && typeof KUI.form.create === 'function') { return; }

  var hasOwn = Object.prototype.hasOwnProperty;
  var toString = Object.prototype.toString;
  var FORM_SEQ = 0;

  /* ============================================================
   * 一、基础工具
   * ============================================================ */

  function isFn(v) { return typeof v === 'function'; }
  function isStr(v) { return typeof v === 'string'; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function isBool(v) { return typeof v === 'boolean'; }
  function isObj(v) { return !!v && typeof v === 'object'; }
  function isArr(v) { return toString.call(v) === '[object Array]'; }

  function each(list, fn) {
    if (!list) { return; }
    for (var i = 0; i < list.length; i++) { fn(list[i], i); }
  }

  function assign(target) {
    target = target || {};
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) { continue; }
      for (var k in src) {
        if (hasOwn.call(src, k)) { target[k] = src[k]; }
      }
    }
    return target;
  }

  function toInt(v, dft) {
    var n = parseInt(v, 10);
    return isNaN(n) ? dft : n;
  }

  function trimStr(s) {
    return String(s === null || s === undefined ? '' : s).replace(/^\s+|\s+$/g, '');
  }

  function px(v) {
    if (isNum(v)) { return v + 'px'; }
    return String(v);
  }

  function warn() {
    if (KUI.warn) {
      try { KUI.warn.apply(KUI, arguments); return; } catch (e) { /* ignore */ }
    }
    if (window.console && window.console.warn) {
      try {
        var args = ['[KUI.form]'];
        for (var i = 0; i < arguments.length; i++) { args.push(arguments[i]); }
        window.console.warn.apply(window.console, args);
      } catch (e2) { /* ignore */ }
    }
  }

  function fail() {
    if (KUI.error) {
      try { KUI.error.apply(KUI, arguments); return; } catch (e) { /* ignore */ }
    }
    if (window.console && window.console.error) {
      try {
        var args = ['[KUI.form]'];
        for (var i = 0; i < arguments.length; i++) { args.push(arguments[i]); }
        window.console.error.apply(window.console, args);
      } catch (e2) { /* ignore */ }
    }
  }

  /** 文案：优先 options.text 覆盖，其次全局字典，最后默认中文 */
  function makeText(dict) {
    return function t(key, dft) {
      if (dict) {
        if (hasOwn.call(dict, key)) {
          var dv = dict[key];
          if (dv !== undefined && dv !== null && dv !== '') { return dv; }
        }
        if (key.indexOf('.') !== -1) {
          var dv2 = pathGet(dict, key);
          if (dv2 !== undefined && dv2 !== null && dv2 !== '') { return dv2; }
        }
      }
      if (isFn(KUI.text)) {
        try { return KUI.text(key, dft); } catch (e) { /* ignore */ }
      }
      return dft === undefined ? key : dft;
    };
  }

  function pathGet(obj, path) {
    if (!obj || path === null || path === undefined) { return undefined; }
    if (!isStr(path) || path.indexOf('.') === -1) { return obj[path]; }
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) { return undefined; }
      cur = cur[parts[i]];
    }
    return cur;
  }

  function cloneValue(v) {
    if (v === null || v === undefined) { return v; }
    if (isArr(v)) {
      var arr = [];
      for (var i = 0; i < v.length; i++) { arr.push(cloneValue(v[i])); }
      return arr;
    }
    if (isObj(v) && toString.call(v) !== '[object Date]' && toString.call(v) !== '[object RegExp]') {
      try { return JSON.parse(JSON.stringify(v)); } catch (e) { return assign({}, v); }
    }
    return v;
  }

  function copyData(data) {
    var out = {};
    for (var k in data) {
      if (hasOwn.call(data, k)) { out[k] = cloneValue(data[k]); }
    }
    return out;
  }

  /* ---------------- DOM 小工具（尽量复用 KUI，缺失时自建） ---------------- */

  function addClass(el, cls) {
    if (!el || !cls) { return el; }
    if (isFn(KUI.addClass)) { return KUI.addClass(el, cls); }
    var list = String(cls).split(/\s+/);
    each(list, function (c) {
      if (c && (' ' + el.className + ' ').indexOf(' ' + c + ' ') === -1) {
        el.className = trimStr(el.className + ' ' + c);
      }
    });
    return el;
  }

  function removeClass(el, cls) {
    if (!el || !cls) { return el; }
    if (isFn(KUI.removeClass)) { return KUI.removeClass(el, cls); }
    var list = String(cls).split(/\s+/);
    each(list, function (c) {
      if (!c) { return; }
      el.className = trimStr((' ' + el.className + ' ').replace(' ' + c + ' ', ' '));
    });
    return el;
  }

  function toggleClass(el, cls, on) {
    if (!el || !cls) { return el; }
    if (isFn(KUI.toggleClass)) { return KUI.toggleClass(el, cls, on); }
    if (on) { return addClass(el, cls); }
    return removeClass(el, cls);
  }

  function clearEl(el) {
    if (!el) { return el; }
    if (isFn(KUI.empty)) { return KUI.empty(el); }
    while (el.firstChild) { el.removeChild(el.firstChild); }
    return el;
  }

  function setVar(el, name, value) {
    if (!el || !el.style) { return; }
    if (isFn(el.style.setProperty)) {
      try { el.style.setProperty(name, String(value)); return; } catch (e) { /* ignore */ }
    }
    try { el.style[name] = String(value); } catch (e2) { /* ignore */ }
  }

  function listen(el, type, fn) {
    if (!el) { return function () {}; }
    if (isFn(KUI.on)) {
      var off = KUI.on(el, type, fn);
      if (isFn(off)) { return off; }
    }
    addEventListenerCompat(el, type, fn);
    return function () { removeEventListenerCompat(el, type, fn); };
  }

  function addEventListenerCompat(el, type, fn) {
    if (el.addEventListener) { el.addEventListener(type, fn, false); }
    else if (el.attachEvent) { el.attachEvent('on' + type, fn); }
  }

  function removeEventListenerCompat(el, type, fn) {
    if (el.removeEventListener) { el.removeEventListener(type, fn, false); }
    else if (el.detachEvent) { el.detachEvent('on' + type, fn); }
  }

  /* ============================================================
   * 二、值比较与联动条件求值（纯函数，方便单独测试）
   * ============================================================ */

  function emptyValue(v) {
    if (v === null || v === undefined) { return true; }
    if (isBool(v)) { return false; }
    if (isStr(v)) { return trimStr(v) === ''; }
    if (isNum(v)) { return false; }
    if (isArr(v)) { return v.length === 0; }
    if (isObj(v)) {
      for (var k in v) {
        if (hasOwn.call(v, k)) { return false; }
      }
      return true;
    }
    return false;
  }

  function looseEq(a, b) {
    if (a === b) { return true; }
    if (a === null || a === undefined || b === null || b === undefined) { return false; }
    if (isArr(a) || isArr(b) || isObj(a) || isObj(b)) {
      try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
    }
    if (isBool(a) || isBool(b)) {
      return String(a) === String(b);
    }
    return String(a) === String(b);
  }

  function toArrayValue(v) {
    if (isArr(v)) { return v; }
    if (v === null || v === undefined) { return []; }
    if (isStr(v) && v.indexOf(',') !== -1) {
      var out = [];
      each(v.split(','), function (s) { out.push(trimStr(s)); });
      return out;
    }
    return [v];
  }

  function numberCompare(a, b) {
    var na = isNum(a) ? a : parseFloat(a);
    var nb = isNum(b) ? b : parseFloat(b);
    if (isNaN(na) || isNaN(nb)) { return null; }
    return na - nb;
  }

  function containsValue(actual, expected) {
    if (actual === null || actual === undefined) { return false; }
    if (isArr(actual)) {
      for (var i = 0; i < actual.length; i++) {
        if (looseEq(actual[i], expected)) { return true; }
      }
      return false;
    }
    if (isObj(actual)) {
      if (isStr(expected) || isNum(expected)) { return hasOwn.call(actual, expected); }
      return false;
    }
    return String(actual).indexOf(String(expected)) !== -1;
  }

  function testOp(op, expected, actual) {
    var name = op === undefined || op === null || op === '' ? 'eq' : String(op);
    switch (name) {
      case 'eq': return looseEq(actual, expected);
      case 'ne': return !looseEq(actual, expected);
      case 'in': return containsValue(toArrayValue(expected), actual);
      case 'nin': return !containsValue(toArrayValue(expected), actual);
      case 'contains': return containsValue(actual, expected);
      case 'notContains': return !containsValue(actual, expected);
      case 'gt': var c1 = numberCompare(actual, expected); return c1 !== null && c1 > 0;
      case 'gte': var c2 = numberCompare(actual, expected); return c2 !== null && c2 >= 0;
      case 'lt': var c3 = numberCompare(actual, expected); return c3 !== null && c3 < 0;
      case 'lte': var c4 = numberCompare(actual, expected); return c4 !== null && c4 <= 0;
      case 'empty': return emptyValue(actual);
      case 'notEmpty': return !emptyValue(actual);
      case 'truthy': return !!actual;
      case 'falsy': return !actual;
      case 'regex': return testRegex(expected, actual);
      case 'match': return testRegex(expected, actual);
      case 'notMatch': return !testRegex(expected, actual);
      default:
        warn('未知的联动操作符 "' + name + '"，按 eq 处理');
        return looseEq(actual, expected);
    }
  }

  function testRegex(expected, actual) {
    if (expected === null || expected === undefined) { return true; }
    var source = expected;
    var flags = '';
    if (isArr(expected)) { source = expected[0]; flags = expected[1] || ''; }
    if (source === null || source === undefined) { return true; }
    try {
      var re = new RegExp(String(source), String(flags || ''));
      return re.test(String(actual === null || actual === undefined ? '' : actual));
    } catch (e) {
      warn('联动正则无效: ' + source);
      return false;
    }
  }

  function testFieldCond(field, op, expected, data) {
    var actual;
    if (isStr(field) && field.indexOf('.') !== -1) {
      actual = pathGet(data, field);
    } else {
      actual = data[field];
    }
    return testOp(op, expected, actual);
  }

  function evalWhen(when, data) {
    if (when === undefined || when === null) { return true; }
    if (isArr(when)) {
      for (var i = 0; i < when.length; i++) {
        if (!evalWhen(when[i], data)) { return false; }
      }
      return true;
    }
    if (isBool(when)) { return when; }
    if (!isObj(when)) {
      warn('联动 when 不是合法 JSON 对象，已忽略');
      return false;
    }

    var fieldRes = null;
    var field = when.field !== undefined ? when.field : when.id;
    if (field !== undefined && field !== null) {
      fieldRes = testFieldCond(field, when.op, when.value, data);
    }

    var hasAll = isArr(when.all);
    var hasAny = isArr(when.any);
    var result;

    if (hasAll) {
      var allOk = true;
      for (var a = 0; a < when.all.length; a++) {
        if (!evalWhen(when.all[a], data)) { allOk = false; break; }
      }
      if (hasAny) {
        var anyOk0 = false;
        for (var b0 = 0; b0 < when.any.length; b0++) {
          if (evalWhen(when.any[b0], data)) { anyOk0 = true; break; }
        }
        result = allOk && anyOk0 && (fieldRes === null ? true : fieldRes);
      } else {
        result = fieldRes === null ? allOk : (fieldRes && allOk);
      }
    } else if (hasAny) {
      var anyOk = false;
      for (var b = 0; b < when.any.length; b++) {
        if (evalWhen(when.any[b], data)) { anyOk = true; break; }
      }
      result = fieldRes === null ? anyOk : (fieldRes || anyOk);
    } else {
      result = fieldRes === null ? true : fieldRes;
    }

    if (when.not === true) { result = !result; }
    if (when.negate === true) { result = !result; }
    return result;
  }

  /* ============================================================
   * 三、布局归一化
   * ============================================================ */

  function normLayout(options) {
    var layout = assign({}, options && options.layout ? options.layout : {});
    // form 节点上的同名属性也作为 fallback
    var src = options || {};
    var keys = ['columns', 'gap', 'labelWidth', 'labelPosition', 'labelAlign', 'submitAlign'];
    each(keys, function (k) {
      if (layout[k] === undefined && src[k] !== undefined) { layout[k] = src[k]; }
    });
    var out = {
      columns: Math.max(1, toInt(layout.columns, 1)),
      gap: layout.gap === undefined || layout.gap === null ? 16 : layout.gap,
      labelWidth: layout.labelWidth === undefined || layout.labelWidth === null ? 96 : layout.labelWidth,
      labelPosition: layout.labelPosition || 'left',
      labelAlign: layout.labelAlign || '',
      submitAlign: layout.submitAlign || 'right'
    };
    if (isNum(out.columns) && out.columns < 1) { out.columns = 1; }
    return out;
  }

  /* ============================================================
   * 四、create 主流程
   * ============================================================ */

  function create(hostEl, options) {
    if (!hostEl || !hostEl.nodeType) {
      throw new Error('[KUI.form] 需要一个宿主 DOM 元素');
    }
    options = options || {};

    var exists = hostEl.__kuiForm;
    if (exists && isFn(exists.destroy)) {
      try { exists.destroy(); } catch (e) { /* ignore */ }
    }

    var seq = ++FORM_SEQ;
    var formId = 'kui-form-' + seq;
    var layout = normLayout(options);
    var t = makeText(options.text);
    var validateOn = options.validateOn || 'submit';
    var nodes = options.nodes || options.fields || [];
    var data = assign({}, options.data);
    var fields = Object.create(null);      // id -> record
    var allRecords = [];                   // 所有已渲染字段（含无 id 的）
    var subscribers = [];
    var destroyed = false;
    var linkLock = false;
    var offList = [];
    var initialData = {};
    var lastFocused = null;

    /* ---------------- DOM 根 ---------------- */

    clearEl(hostEl);
    addClass(hostEl, 'kui-form');
    addClass(hostEl, 'kui-form--label-' + layout.labelPosition);
    addClass(hostEl, 'kui-form--columns-' + layout.columns);
    if (options.bordered) { addClass(hostEl, 'kui-form--bordered'); }
    if (options.class) { addClass(hostEl, options.class); }
    if (options.size) { addClass(hostEl, 'kui-form--' + options.size); }
    hostEl.setAttribute('data-kui-form', formId);
    hostEl.setAttribute('role', 'form');
    if (options.node && options.node.id) { hostEl.setAttribute('data-kui-id', options.node.id); }
    setVar(hostEl, '--kui-form-columns', layout.columns);
    setVar(hostEl, '--kui-form-gap', px(layout.gap));
    if (layout.labelWidth) { setVar(hostEl, '--kui-field-label-width', px(layout.labelWidth)); }

    /* ---------------- 渲染上下文 ---------------- */

    var rootCtx;
    if (isFn(KUI.createContext)) {
      rootCtx = KUI.createContext(null);
    } else {
      rootCtx = { children: [], emit: function () {}, action: function () {}, child: function (extra) { return assign({}, rootCtx, extra); } };
    }
    rootCtx.form = null; // 下面 formApi 建好后再指向
    rootCtx.root = hostEl;
    rootCtx.data = data;
    rootCtx.app = options.app || (options.ctx && options.ctx.app) || (hostEl.__kuiCtx && hostEl.__kuiCtx.app) || null;
    rootCtx.render = function (node, ctx) {
      return renderOne(node, ctx || rootCtx, { anonymous: true });
    };
    rootCtx.uid = function (prefix) { return (prefix || 'kui') + '-' + (++FORM_SEQ); };

    /* ---------------- 字段状态 / API ---------------- */

    var formApi = {
      el: hostEl,
      id: formId,
      seq: seq,
      options: {
        layout: layout,
        validateOn: validateOn,
        text: options.text || null,
        bordered: !!options.bordered
      },
      layout: layout,
      __node: options.node || {},
      getData: getData,
      setData: setData,
      getValue: getValue,
      setValue: setValue,
      getField: getField,
      getFields: getFields,
      validate: validate,
      validateField: function (id) { return validateField(id, {}); },
      clearValidate: clearValidate,
      reset: reset,
      submit: submit,
      setVisible: setVisible,
      setDisabled: setDisabled,
      setReadonly: setReadonly,
      setRequired: setRequired,
      setOptions: setOptions,
      setLabelText: setLabelText,
      setError: setError,
      clearError: clearError,
      getLinkageGraph: getLinkageGraph,
      subscribe: subscribe,
      destroy: destroy,
      canEnterSubmit: function () { return options.submitOnEnter !== false; },
      _enterSubmit: function () { return submit(); },
      _notifyChange: function (id, value) { return handleExternChange(id, value, 'notify'); },
      _notify: function (payload) {
        if (payload && payload.id) { return handleExternChange(payload.id, payload.value, payload.reason || 'notify'); }
        return null;
      },
      _notifyAction: function (id, name, payload) {
        emitEvent({ type: 'action', id: id, action: name, value: getValue(id), data: getData(), payload: payload || null });
      }
    };
    rootCtx.form = formApi;
    hostEl.__kuiForm = formApi;

    /* ---------------- 事件订阅（控件 ctx.emit -> 全局 bus） ---------------- */

    function onBusChange(detail, ctx) {
      if (destroyed) { return; }
      if (!ctx || ctx.form !== formApi) { return; }
      if (!detail || !detail.id) { return; }
      handleExternChange(detail.id, detail.value, detail.reason || 'change', detail);
    }

    function onBusBlur(detail, ctx) {
      if (destroyed || !detail || !detail.id) { return; }
      if (validateOn !== 'blur') { return; }
      var rec = fields[detail.id];
      if (!rec || isInvisible(rec)) { return; }
      validateField(detail.id, { silent: true });
    }

    if (KUI.bus && isFn(KUI.bus.on)) {
      offList.push(KUI.bus.on('control:change', onBusChange));
      offList.push(KUI.bus.on('control:blur', onBusBlur));
    }

    var offFocus = listen(hostEl, 'focusin', function (ev) {
      var target = ev && ev.target;
      while (target && target !== hostEl) {
        if (target.__kuiNode && target.__kuiNode.id) { lastFocused = target.__kuiNode.id; break; }
        target = target.parentNode;
      }
    });
    offList.push(offFocus);

    /* ============================================================
     * 1) 逐字段渲染
     * ============================================================ */

    function renderOne(node, ctx, info) {
      if (node === null || node === undefined) { return null; }
      if (!isObj(node) || node.nodeType || isArr(node) || isStr(node) || isNum(node)) {
        // 纯文本/已有 DOM/fragment 配置：直接交给 core
        return isFn(KUI.renderNode) ? KUI.renderNode(node, ctx) : null;
      }
      var type = node.type;
      if (!type) {
        // 无 type 的容器：交给 core 统一处理
        return isFn(KUI.renderNode) ? KUI.renderNode(node, ctx) : null;
      }

      var id = node.id !== undefined && node.id !== null ? String(node.id) : '';
      var props = assign({}, node.props);
      var cfg = assign({}, node);
      cfg.props = props;
      cfg.visible = true; // 联动负责隐藏，构建时先全部渲染

      // 把表单初始数据注入为控件初始值
      if (id && data[id] !== undefined && props.value === undefined && node.value === undefined) {
        props.value = cloneValue(data[id]);
      }

      var rendered = isFn(KUI.renderNode) ? KUI.renderNode(cfg, ctx) : null;
      if (!rendered) { return null; }

      var control = rendered.__kuiControl || null;
      var meta = hasFieldMeta(cfg);
      var field = null;
      var item = document.createElement('div');
      addClass(item, 'kui-form__item');
      addClass(item, 'kui-form__item--' + type);
      if (id) { item.setAttribute('data-field-id', id); }
      applySpan(item, cfg, layout);

      if (meta) {
        field = createFieldWrap(cfg, ctx);
        if (field) {
          field.row.appendChild(rendered);
          item.appendChild(field.el);
          if (id) { field.el.setAttribute('data-field-id', id); }
        } else {
          item.appendChild(rendered);
        }
      } else {
        item.appendChild(rendered);
      }

      // field 控件自己可能已经是字段包装（type=field），不再重复包裹
      if (!meta) { addClass(item, 'kui-form__item--plain'); }

      if (info && info.anonymous) { return item; }

      hostEl.appendChild(item);

      var rec = {
        id: id,
        type: type,
        node: cfg,          // 真正用于渲染的节点（控件 validate 读取它）
        rawNode: node,      // 原始配置（deps 等以它为准）
        item: item,
        field: field,
        el: field ? field.el : rendered,
        controlEl: rendered,
        control: control,
        state: {},
        applied: {},
        override: {},
        deps: isArr(node.deps) ? node.deps : (isArr(props.deps) ? props.deps : []),
        optionsSig: ''
      };
      allRecords.push(rec);
      if (id) { fields[id] = rec; }
      return rec;
    }

    function hasFieldMeta(node) {
      var props = node.props || {};
      return !!(props.label || node.label || props.help || node.help || props.hint || node.hint ||
        props.tip || node.tip || props.error || node.error || props.unit || node.unit ||
        props.required || node.required || (props.rules && props.rules.length) ||
        (node.rules && node.rules.length) || props.width || node.width ||
        props.labelWidth || node.labelWidth);
    }

    function applySpan(item, node, lay) {
      var props = node.props || {};
      var span = props.span !== undefined ? props.span : (node.span !== undefined ? node.span : props.colspan);
      if (span === undefined || span === null || span === '') { return; }
      if (String(span) === '1') { return; }
      var n = toInt(span, 1);
      if (n > 1) { item.style.gridColumn = 'span ' + Math.min(n, lay.columns); }
    }

    function createFieldWrap(cfg, ctx) {
      var base = KUI.controls && KUI.controls.base ? KUI.controls.base : null;
      if (base && isFn(base.createField)) {
        var parts = base.createField(cfg, ctx, {});
        if (parts && parts.el) { return parts; }
      }
      return fallbackFieldWrap(cfg);
    }

    /** 极端情况（control-base 未加载）下的最小字段包装 */
    function fallbackFieldWrap(cfg) {
      var props = cfg.props || {};
      var root = document.createElement('div');
      root.className = 'kui-field';
      var label = props.label || cfg.label || '';
      if (label) {
        var labelEl = document.createElement('label');
        labelEl.className = 'kui-field__label';
        var textEl = document.createElement('span');
        textEl.className = 'kui-field__label-text';
        textEl.textContent = String(label);
        labelEl.appendChild(textEl);
        if (props.required || cfg.required) {
          var star = document.createElement('i');
          star.className = 'kui-field__required';
          star.textContent = '*';
          labelEl.appendChild(star);
        }
        root.appendChild(labelEl);
      }
      var main = document.createElement('div');
      main.className = 'kui-field__main';
      var row = document.createElement('div');
      row.className = 'kui-field__row';
      var foot = document.createElement('div');
      foot.className = 'kui-field__foot';
      var errorEl = document.createElement('span');
      errorEl.className = 'kui-field__error';
      errorEl.style.display = 'none';
      var helpEl = document.createElement('span');
      helpEl.className = 'kui-field__help';
      var help = props.help || cfg.help || props.hint || cfg.hint || '';
      helpEl.textContent = String(help);
      helpEl.style.display = help ? '' : 'none';
      foot.appendChild(errorEl);
      foot.appendChild(helpEl);
      main.appendChild(row);
      main.appendChild(foot);
      root.appendChild(main);
      return {
        el: root,
        row: row,
        main: main,
        foot: foot,
        errorEl: errorEl,
        helpEl: helpEl,
        setLabel: function (txt) {
          var tEl = root.querySelector ? root.querySelector('.kui-field__label-text') : null;
          if (tEl) { tEl.textContent = String(txt === undefined || txt === null ? '' : txt); }
        },
        setRequired: function (flag) { toggleClass(root, 'is-required', !!flag); },
        setError: function (msg) {
          errorEl.textContent = msg ? String(msg) : '';
          errorEl.style.display = msg ? '' : 'none';
          toggleClass(root, 'is-error', !!msg);
        },
        setHelp: function (msg) {
          helpEl.textContent = msg ? String(msg) : '';
          helpEl.style.display = msg ? '' : 'none';
        },
        setVisible: function (flag) {
          if (flag) { root.removeAttribute('hidden'); } else { root.setAttribute('hidden', ''); }
          toggleClass(root, 'is-hidden', !flag);
        },
        setState: function () { return this; },
        destroy: function () {}
      };
    }

    // 构建
    each(nodes, function (node) {
      try {
        renderOne(node, rootCtx, null);
      } catch (e) {
        fail('字段渲染失败:', node && node.id ? node.id : node, e);
      }
    });

    // 补齐没有初始值的字段
    each(allRecords, function (rec) {
      if (!rec.id) { return; }
      if (data[rec.id] === undefined && rec.control && isFn(rec.control.getValue)) {
        try { data[rec.id] = rec.control.getValue(); } catch (e) { /* ignore */ }
      }
    });

    // v1.3.0：requiredAny —— 「多个字段至少填一项」的必填组
    // 节点配置示例：{ type: 'input', id: 'a', requiredAny: ['a', 'b', 'c'], requiredAnyMessage: '请至少填写其中一项' }
    // 规则：组内全部为空 → 组内可见字段视为必填并提示；任一项有值 → 组内其余字段自动解除必填（星号同步消失）。
    var requireGroups = buildRequireGroups();

    function buildRequireGroups() {
      var groups = { list: [], byId: {} };
      each(allRecords, function (rec) {
        if (!rec.id) { return; }
        var raw = rec.rawNode || {};
        var props = raw.props || {};
        var ids = isArr(raw.requiredAny) ? raw.requiredAny : (isArr(props.requiredAny) ? props.requiredAny : null);
        if (!ids || !ids.length) { return; }
        var members = [];
        each(ids, function (id) {
          id = String(id || '');
          if (id && members.indexOf(id) < 0) { members.push(id); }
        });
        if (members.length < 2) { return; }
        var group = {
          ids: members,
          message: raw.requiredAnyMessage || props.requiredAnyMessage || t('validate.requiredAny', '请至少填写其中一项')
        };
        groups.list.push(group);
        each(members, function (id) { groups.byId[id] = group; });
      });
      return groups;
    }

    function isFilledValue(v) {
      if (v === undefined || v === null || v === '' || v === false) { return false; }
      if (isArr(v)) { return v.length > 0; }
      if (typeof v === 'object') {
        for (var k in v) { if (hasOwn.call(v, k)) { return true; } }
        return false;
      }
      return true;
    }

    function groupFilled(group) {
      if (!group) { return true; }
      for (var i = 0; i < group.ids.length; i++) {
        if (isFilledValue(data[group.ids[i]])) { return true; }
      }
      return false;
    }

    // 初始默认态 + 联动
    recalc('init');
    initialData = copyData(data);

    /* ---------------- 提交/重置按钮 ---------------- */

    if (options.showSubmit) {
      buildFooter();
    }

    function buildFooter() {
      var footer = document.createElement('div');
      footer.className = 'kui-form__footer';
      if (layout.submitAlign) { addClass(footer, 'kui-form__footer--' + layout.submitAlign); }
      var submitBtn = document.createElement('button');
      submitBtn.type = 'button';
      submitBtn.className = 'kui-btn kui-btn--primary kui-form__submit';
      submitBtn.textContent = String(options.submitText || t('form.submit', '提交'));
      listen(submitBtn, 'click', function () { submit(); });
      footer.appendChild(submitBtn);
      if (options.showReset !== false) {
        var resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'kui-btn kui-form__reset';
        resetBtn.textContent = String(options.resetText || t('form.reset', '重置'));
        listen(resetBtn, 'click', function () { reset(); });
        footer.appendChild(resetBtn);
      }
      var host2 = document.createElement('div');
      addClass(host2, 'kui-form__item kui-form__item--submit');
      host2.style.gridColumn = '1 / -1';
      host2.appendChild(footer);
      hostEl.appendChild(host2);
    }

    /* ============================================================
     * 2) 联动引擎
     * ============================================================ */

    function computeDefaults(rec) {
      var props = rec.node.props || {};
      var raw = rec.rawNode || {};
      var rprops = raw.props || {};
      var rules = isArr(props.rules) ? props.rules : (isArr(raw.rules) ? raw.rules : []);
      var required = !!(props.required || raw.required);
      if (!required) {
        for (var i = 0; i < rules.length; i++) {
          if (rules[i] && rules[i].required) { required = true; break; }
        }
      }
      var out = {
        visible: raw.visible !== false,
        disabled: !!(raw.disabled || props.disabled),
        readonly: !!(raw.readonly || props.readonly),
        required: required,
        options: rec.override.options !== undefined ? rec.override.options
          : (props.options !== undefined ? props.options : raw.options),
        text: rec.override.text !== undefined ? rec.override.text
          : (props.label !== undefined ? props.label : raw.label),
        error: rec.override.error !== undefined ? rec.override.error : ''
      };
      // 显式声明了「可见性联动」的字段：默认隐藏，改由命中规则显示。
      // 没有 deps.then.visible 的字段仍严格按契约 §7：visible = node.visible !== false。
      if (raw.visible === undefined && hasVisibilityDeps(rec.deps)) {
        out.visible = false;
      }
      // 程序化 setXxx 的覆盖（优先级高于节点默认态，但低于命中的联动规则）
      if (rec.manual) {
        if (rec.manual.visible !== undefined) { out.visible = rec.manual.visible; }
        if (rec.manual.disabled !== undefined) { out.disabled = rec.manual.disabled; }
        if (rec.manual.readonly !== undefined) { out.readonly = rec.manual.readonly; }
        if (rec.manual.required !== undefined) { out.required = rec.manual.required; }
      }
      return out;
    }

    function hasVisibilityDeps(deps) {
      if (!isArr(deps)) { return false; }
      for (var i = 0; i < deps.length; i++) {
        var dep = deps[i];
        if (dep && isObj(dep.then) && dep.then.visible !== undefined) { return true; }
      }
      return false;
    }

    function applyThen(state, then) {
      if (!isObj(then)) { return; }
      if (then.visible !== undefined) { state.visible = !!then.visible; }
      if (then.disabled !== undefined) { state.disabled = !!then.disabled; }
      if (then.readonly !== undefined) { state.readonly = !!then.readonly; }
      if (then.required !== undefined) { state.required = !!then.required; }
      if (then.value !== undefined) { state.value = then.value; }
      if (then.options !== undefined) { state.options = then.options; }
      if (then.text !== undefined) { state.text = then.text; }
      if (then.label !== undefined) { state.text = then.label; }
      if (then.error !== undefined) { state.error = then.error; }
    }

    function recalc(reason) {
      if (destroyed || linkLock) { return; }
      linkLock = true;
      try {
        each(allRecords, function (rec) {
          if (!rec.id) { return; }
          var state = computeDefaults(rec);
          var deps = rec.deps;
          for (var i = 0; i < deps.length; i++) {
            var dep = deps[i];
            if (!dep || !isObj(dep)) { continue; }
            if (!evalWhen(dep.when, data)) { continue; }
            applyThen(state, dep.then);
          }
          // v1.3.0：必填组——一个都没填则组内全部必填，填了任一项则其余自动解除必填
          var group = requireGroups.byId[rec.id];
          if (group) { state.required = !groupFilled(group); }
          applyState(rec, state, reason);
        });
      } catch (e) {
        fail('联动求值失败:', e);
      } finally {
        linkLock = false;
      }
    }

    function applyState(rec, state, reason) {
      var prev = rec.applied || {};

      /* 1. visible */
      if (prev.visible !== state.visible) {
        setRecordVisible(rec, state.visible);
        prev.visible = state.visible;
        if (!state.visible && formApi.__lastFocused === rec.id) { formApi.__lastFocused = null; }
      }

      /* 2. disabled */
      if (prev.disabled !== state.disabled) {
        if (rec.control && isFn(rec.control.setDisabled)) {
          try { rec.control.setDisabled(!!state.disabled); } catch (e) { /* ignore */ }
        }
        toggleClass(rec.item, 'is-disabled', !!state.disabled);
        if (rec.el && rec.el !== rec.item) { toggleClass(rec.el, 'is-disabled', !!state.disabled); }
        prev.disabled = state.disabled;
      }

      /* 3. readonly */
      if (prev.readonly !== state.readonly) {
        if (rec.control && isFn(rec.control.setReadonly)) {
          try { rec.control.setReadonly(!!state.readonly); } catch (e) { /* ignore */ }
        }
        toggleClass(rec.item, 'is-readonly', !!state.readonly);
        prev.readonly = state.readonly;
      }

      /* 4. required */
      if (prev.required !== state.required) {
        rec.node.props.required = !!state.required;
        rec.node.required = !!state.required;
        if (rec.field && isFn(rec.field.setRequired)) { rec.field.setRequired(!!state.required); }
        toggleClass(rec.item, 'is-required', !!state.required);
        if (rec.controlEl && rec.controlEl.setAttribute) {
          rec.controlEl.setAttribute('aria-required', state.required ? 'true' : 'false');
        }
        prev.required = state.required;
      }

      /* 5. value */
      if (state.value !== undefined) {
        var cur = data[rec.id];
        if (!looseEq(cur, state.value)) {
          setValue(rec.id, state.value, { silent: true, reason: 'linkage' });
        }
      }

      /* 6. options */
      if (state.options !== undefined && isArr(state.options)) {
        var sig = optionsSignature(state.options);
        if (rec.optionsSig !== sig) {
          rec.optionsSig = sig;
          rec.node.props.options = state.options;
          rec.node.options = state.options;
          if (rec.control && isFn(rec.control.setOptions)) {
            try { rec.control.setOptions(state.options); } catch (e) { /* ignore */ }
          }
        }
      }

      /* 7. text */
      if (state.text !== undefined && state.text !== null && prev.text !== state.text) {
        rec.node.props.label = state.text;
        rec.node.label = state.text;
        if (rec.field && isFn(rec.field.setLabel)) { rec.field.setLabel(state.text); }
        prev.text = state.text;
      }

      /* 8. error */
      if (prev.error !== state.error) {
        applyError(rec, state.error);
        prev.error = state.error;
      }
    }

    function optionsSignature(list) {
      var out = [];
      each(list, function (item) {
        if (item === null || item === undefined) { out.push(String(item)); return; }
        if (isObj(item)) {
          out.push(String(item.label !== undefined ? item.label : item.text) + ':' + String(item.value) + ':' + (item.disabled ? 1 : 0));
        } else {
          out.push(String(item));
        }
      });
      return out.join('\u0001');
    }

    function setRecordVisible(rec, visible) {
      var show = !!visible;
      if (rec.item) {
        rec.item.hidden = !show;
        if (show) {
          rec.item.removeAttribute('hidden');
          rec.item.style.display = '';
        } else {
          rec.item.setAttribute('hidden', '');
          rec.item.style.display = 'none';
        }
        toggleClass(rec.item, 'is-hidden', !show);
      }
      if (rec.field && isFn(rec.field.setVisible)) { rec.field.setVisible(show); }
      rec.state.visible = show;
      if (rec.controlEl) { rec.controlEl.setAttribute('aria-hidden', show ? 'false' : 'true'); }
    }

    function isInvisible(rec) {
      if (!rec) { return true; }
      if (rec.state.visible === false) { return true; }
      if (rec.item && (rec.item.hidden || rec.item.style.display === 'none')) { return true; }
      return false;
    }

    /* ============================================================
     * 3) 变更入口
     * ============================================================ */

    function handleExternChange(id, value, reason, detail) {
      if (destroyed) { return; }
      var rec = fields[id];
      if (!rec) { return; }
      var prev = data[id];
      data[id] = value;
      rec.applied.error = rec.applied.error || '';
      // 用户手动修改后清掉上一次的错误提示
      if (rec.applied.error) { applyError(rec, ''); rec.applied.error = ''; }

      notifyChange(rec, value, prev, reason, detail);
      recalc(reason || 'change');
      if (validateOn === 'change' || (validateOn === 'blur' && detail && detail.type === 'blur')) {
        if (!isInvisible(rec)) { validateField(id, { silent: true }); }
      }
      return value;
    }

    function notifyChange(rec, value, prev, reason, detail) {
      var snapshot = getData();
      emitEvent({
        type: 'change',
        id: rec.id,
        value: value,
        prev: prev,
        data: snapshot,
        reason: reason || 'change',
        node: rec.rawNode,
        el: rec.el,
        detail: detail || null
      });
      if (isFn(options.onChange)) {
        try { options.onChange(rec.id, value, snapshot, formApi); } catch (e) { fail('onChange 回调异常:', e); }
      }
    }

    function emitEvent(evt) {
      if (!subscribers.length) { return; }
      var list = subscribers.slice();
      for (var i = 0; i < list.length; i++) {
        try { list[i](evt); } catch (e) { fail('subscribe 回调异常:', e); }
      }
    }

    /* ============================================================
     * 4) 数据读写
     * ============================================================ */

    function getData() {
      return copyData(data);
    }

    function getValue(id) {
      var rec = fields[id];
      if (rec && rec.control && isFn(rec.control.getValue)) {
        var v;
        try { v = rec.control.getValue(); } catch (e) { v = data[id]; }
        data[id] = v;
        return v;
      }
      return data[id];
    }

    function setValue(id, value, opts) {
      opts = opts || {};
      var rec = fields[id];
      if (!rec) {
        data[id] = value;
        if (!opts.silent) { emitEvent({ type: 'data', id: id, value: value, data: getData() }); }
        return formApi;
      }
      var prev = data[id];
      var silent = !!opts.silent;
      data[id] = value;
      if (rec.control && isFn(rec.control.setValue)) {
        try { rec.control.setValue(cloneValue(value), { silent: true }); } catch (e) { warn('setValue 失败 [' + id + ']:', e); }
      }
      rec.node.props.value = value;
      rec.node.value = value;
      if (!silent) {
        notifyChange(rec, value, prev, opts.reason || 'set');
      }
      recalc(opts.reason || 'setValue');
      if (!silent && validateOn !== 'submit' && !isInvisible(rec)) {
        validateField(id, { silent: true });
      }
      return formApi;
    }

    function setData(obj, opts) {
      opts = opts || {};
      if (!isObj(obj)) { return formApi; }
      for (var k in obj) {
        if (!hasOwn.call(obj, k)) { continue; }
        if (fields[k]) { setValue(k, obj[k], { silent: true, reason: 'setData' }); }
        else { data[k] = obj[k]; }
      }
      recalc('setData');
      if (!opts.silent) {
        emitEvent({ type: 'data', data: getData(), reason: 'setData' });
      }
      return formApi;
    }

    function getField(id) {
      var rec = fields[id];
      if (!rec) { return null; }
      return {
        id: rec.id,
        el: rec.el,
        item: rec.item,
        field: rec.field,
        control: rec.control,
        node: rec.rawNode,
        rendered: rec.controlEl,
        isVisible: !isInvisible(rec)
      };
    }

    function getFields() {
      var out = [];
      for (var k in fields) {
        if (hasOwn.call(fields, k)) { out.push(getField(k)); }
      }
      return out;
    }

    /* ============================================================
     * 5) 校验
     * ============================================================ */

    function validateField(id, opts) {
      opts = opts || {};
      var rec = fields[id];
      if (!rec) { return { valid: true, message: '' }; }
      // v1.3.0：联动隐藏的字段不参与校验（隐藏的必填项不应拦截提交）
      if (isInvisible(rec)) { return { valid: true, message: '' }; }
      // v1.3.0：必填组「至少填一项」
      var group = requireGroups.byId[rec.id];
      if (group && !groupFilled(group)) {
        applyError(rec, group.message);
        return { valid: false, message: group.message };
      }
      var result = { valid: true, message: '' };
      if (rec.control && isFn(rec.control.validate)) {
        try { result = rec.control.validate() || result; } catch (e) { result = { valid: true, message: '' }; }
      }
      if (!result.valid) {
        applyError(rec, result.message || t('validate.invalid', '校验未通过'));
      } else if (!opts.keepError) {
        applyError(rec, '');
      }
      return result;
    }

    function validate(ids) {
      var targets = [];
      if (ids === undefined || ids === null) {
        each(allRecords, function (rec) { if (rec.id) { targets.push(rec.id); } });
      } else if (isArr(ids)) {
        each(ids, function (id) { if (fields[id]) { targets.push(id); } });
      } else if (fields[ids]) {
        targets.push(ids);
      }

      var errors = {};
      var firstInvalid = null;
      each(targets, function (id) {
        var rec = fields[id];
        if (!rec || isInvisible(rec)) { return; }
        var res = validateField(id, { silent: true });
        if (res && res.valid === false) {
          errors[id] = res.message || t('validate.invalid', '校验未通过');
          if (!firstInvalid) { firstInvalid = rec; }
        }
      });

      var valid = true;
      for (var k in errors) {
        if (hasOwn.call(errors, k)) { valid = false; break; }
      }

      if (!valid && firstInvalid) {
        if (firstInvalid.control && isFn(firstInvalid.control.focus)) {
          try { firstInvalid.control.focus(); } catch (e) { /* ignore */ }
        } else if (firstInvalid.el && isFn(firstInvalid.el.focus)) {
          firstInvalid.el.focus();
        }
      }
      return { valid: valid, errors: errors, data: getData() };
    }

    function clearValidate(ids) {
      var targets = [];
      if (ids === undefined || ids === null) {
        each(allRecords, function (rec) { if (rec.id) { targets.push(rec.id); } });
      } else if (isArr(ids)) {
        targets = ids;
      } else {
        targets = [ids];
      }
      each(targets, function (id) {
        var rec = fields[id];
        if (rec) { applyError(rec, ''); rec.applied.error = ''; }
      });
      return formApi;
    }

    function applyError(rec, msg) {
      var text = msg ? String(msg) : '';
      rec.error = text;
      if (rec.field && isFn(rec.field.setError)) {
        rec.field.setError(text);
      } else if (rec.control && isFn(rec.control.setError)) {
        try { rec.control.setError(text); } catch (e) { /* ignore */ }
      }
      toggleClass(rec.item, 'is-error', !!text);
      rec.state.error = text;
      if (rec.controlEl) { rec.controlEl.setAttribute('aria-invalid', text ? 'true' : 'false'); }
    }

    function setError(id, msg) {
      var rec = fields[id];
      if (rec) {
        applyError(rec, msg);
        rec.applied.error = msg ? String(msg) : '';
      }
      return formApi;
    }

    function clearError(id) {
      return setError(id, '');
    }

    /* ============================================================
     * 6) 状态类 API
     * ============================================================ */

    function setVisible(id, flag) {
      var rec = fields[id];
      if (rec) {
        rec.manual = rec.manual || {};
        rec.manual.visible = !!flag;
        setRecordVisible(rec, !!flag);
      }
      return formApi;
    }

    function setDisabled(id, flag) {
      var rec = fields[id];
      if (rec) {
        rec.manual = rec.manual || {};
        rec.manual.disabled = !!flag;
        applyState(rec, assign(computeDefaults(rec), { visible: rec.manual.visible !== false }));
      }
      return formApi;
    }

    function setReadonly(id, flag) {
      var rec = fields[id];
      if (rec) {
        rec.manual = rec.manual || {};
        rec.manual.readonly = !!flag;
        applyState(rec, computeDefaults(rec));
      }
      return formApi;
    }

    function setRequired(id, flag) {
      var rec = fields[id];
      if (rec) {
        rec.manual = rec.manual || {};
        rec.manual.required = !!flag;
        applyState(rec, computeDefaults(rec));
      }
      return formApi;
    }

    function setOptions(id, list) {
      var rec = fields[id];
      if (rec) {
        rec.override.options = isArr(list) ? list : [];
        rec.node.props.options = rec.override.options;
        rec.node.options = rec.override.options;
        rec.optionsSig = optionsSignature(rec.override.options);
        if (rec.control && isFn(rec.control.setOptions)) {
          try { rec.control.setOptions(rec.override.options); } catch (e) { /* ignore */ }
        }
      }
      return formApi;
    }

    function setLabelText(id, text) {
      var rec = fields[id];
      if (rec) {
        rec.override.text = text;
        rec.node.props.label = text;
        rec.node.label = text;
        if (rec.field && isFn(rec.field.setLabel)) { rec.field.setLabel(text); }
      }
      return formApi;
    }

    /* ============================================================
     * 7) reset / submit / graph
     * ============================================================ */

    function reset() {
      each(allRecords, function (rec) {
        if (!rec.id) { return; }
        var init = initialData[rec.id];
        var value = init === undefined ? null : cloneValue(init);
        data[rec.id] = value;
        if (rec.control && isFn(rec.control.setValue)) {
          try { rec.control.setValue(value, { silent: true }); } catch (e) { /* ignore */ }
        }
        applyError(rec, '');
        rec.applied.error = '';
      });
      recalc('reset');
      emitEvent({ type: 'reset', data: getData() });
      return formApi;
    }

    function submit() {
      var result = validate();
      if (!result.valid) {
        emitEvent({ type: 'invalid', errors: result.errors, data: result.data });
        if (isFn(options.onInvalid)) {
          try { options.onInvalid(result.errors, formApi); } catch (e) { fail('onInvalid 回调异常:', e); }
        }
        return result;
      }
      emitEvent({ type: 'submit', data: result.data });
      if (isFn(options.onSubmit)) {
        try { options.onSubmit(result.data, formApi); } catch (e) { fail('onSubmit 回调异常:', e); }
      }
      if (KUI.bus && isFn(KUI.bus.emit)) {
        try { KUI.bus.emit('form:submit', { el: hostEl, data: result.data, form: formApi }); } catch (e2) { /* ignore */ }
      }
      return result;
    }

    function getLinkageGraph() {
      var out = [];
      each(allRecords, function (rec) {
        if (!rec.id) { return; }
        var list = [];
        each(rec.deps, function (dep) {
          if (!dep || !isObj(dep)) { return; }
          list.push({ when: dep.when, then: dep.then, hit: !!evalWhen(dep.when, data) });
        });
        out.push({
          id: rec.id,
          type: rec.type,
          deps: list,
          state: assign({}, rec.state)
        });
      });
      return out;
    }

    /* ============================================================
     * 8) 生命周期
     * ============================================================ */

    function subscribe(fn) {
      if (!isFn(fn)) { return function () {}; }
      subscribers.push(fn);
      return function unsubscribe() {
        var idx = subscribers.indexOf(fn);
        if (idx !== -1) { subscribers.splice(idx, 1); }
      };
    }

    function destroy() {
      if (destroyed) { return; }
      destroyed = true;
      each(offList, function (off) {
        try { if (isFn(off)) { off(); } } catch (e) { /* ignore */ }
      });
      offList.length = 0;
      each(allRecords, function (rec) {
        if (rec.control && isFn(rec.control.destroy)) {
          try { rec.control.destroy(); } catch (e) { /* ignore */ }
        }
        if (rec.field && isFn(rec.field.destroy)) {
          try { rec.field.destroy(); } catch (e2) { /* ignore */ }
        }
      });
      fields = Object.create(null);
      allRecords.length = 0;
      subscribers.length = 0;
      clearEl(hostEl);
      removeClass(hostEl, 'kui-form');
      if (hostEl.__kuiForm === formApi) { hostEl.__kuiForm = null; }
    }

    /* ---------------- 初始通知 ---------------- */

    if (isFn(options.onReady)) {
      try { options.onReady(formApi, getData()); } catch (e) { fail('onReady 回调异常:', e); }
    }

    return formApi;
  }

  /* ============================================================
   * 五、导出
   * ============================================================ */

  KUI.form = {
    version: '1.0.0',
    create: create,
    /** 纯函数导出：方便单独测试联动条件（不参与渲染） */
    evalWhen: function (when, data) { return evalWhen(when, data || {}); },
    testOp: testOp,
    emptyValue: emptyValue,
    looseEq: looseEq
  };
})(window, document);

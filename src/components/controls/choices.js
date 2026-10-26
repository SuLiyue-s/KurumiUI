/*!
 * KurumiUI - controls/choices.js
 * 选择/范围/反馈类控件：checkbox / checkbox-group / radio / radio-group /
 * switch / slider / progress / rating / color
 */
(function (global) {
  'use strict';

  var KUI = global.KUI = global.KUI || {};
  var controls = KUI.controls = KUI.controls || {};

  if (!controls.define) {
    controls.defs = controls.defs || {};
    controls.define = function (type, def) { controls.defs[type] = def; return def; };
  }
  var base = controls.base;
  if (!base) { return; }

  var define = controls.define;
  var p = base.p;

  function propsOf(node, defaults) {
    return base.merge({}, defaults, base.getProps(node));
  }
  function applySize(box, size, prefix) {
    if (!size || size === 'md') { return; }
    base.addClass(box, prefix + '--' + size);
  }
  function sameValue(a, b) {
    if (a === b) { return true; }
    if (a === null || a === undefined || b === null || b === undefined) { return false; }
    return String(a) === String(b);
  }
  function includesValue(list, value) {
    if (!base.isArr(list)) { return false; }
    for (var i = 0; i < list.length; i++) {
      if (sameValue(list[i], value)) { return true; }
    }
    return false;
  }
  function removeValue(list, value) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (!sameValue(list[i], value)) { out.push(list[i]); }
    }
    return out;
  }
  function num(v, fallback) {
    var n = Number(v);
    return isNaN(n) ? fallback : n;
  }

  /* ============================================================
   * 勾选项视觉件（checkbox / radio 共用）
   * ============================================================ */

  function checkboxItem(option, checked, isDisabled, onChange) {
    var cls = 'kui-checkbox';
    if (option.disabled || isDisabled) { cls += ' is-disabled'; }
    var label = base.el('label', { 'class': cls });
    var input = base.el('input', { type: 'checkbox', 'class': 'kui-checkbox__input' });
    input.checked = !!checked;
    if (option.disabled || isDisabled) { input.disabled = true; }
    var visual = base.el('span', { 'class': 'kui-checkbox__box' });
    visual.appendChild(base.iconEl('check', 'kui-checkbox__tick'));
    label.appendChild(input);
    label.appendChild(visual);
    if (option.label !== undefined && option.label !== '') {
      label.appendChild(base.el('span', { 'class': 'kui-checkbox__label', text: option.label }));
    }
    base.on(input, 'change', function () {
      onChange(!!input.checked, option);
    });
    return { el: label, input: input };
  }

  function radioItem(option, checked, isDisabled, name, onChange) {
    var cls = 'kui-radio';
    if (option.disabled || isDisabled) { cls += ' is-disabled'; }
    var label = base.el('label', { 'class': cls });
    var input = base.el('input', { type: 'radio', 'class': 'kui-radio__input' });
    if (name) { input.setAttribute('name', name); }
    input.checked = !!checked;
    if (option.disabled || isDisabled) { input.disabled = true; }
    var visual = base.el('span', { 'class': 'kui-radio__box' });
    visual.appendChild(base.el('span', { 'class': 'kui-radio__dot' }));
    label.appendChild(input);
    label.appendChild(visual);
    if (option.label !== undefined && option.label !== '') {
      label.appendChild(base.el('span', { 'class': 'kui-radio__label', text: option.label }));
    }
    base.on(input, 'change', function () {
      if (!input.checked) { return; }
      onChange(option, input);
    });
    return { el: label, input: input };
  }

  function valueList(value) {
    if (base.isArr(value)) { return value.slice(); }
    if (value === null || value === undefined || value === '') { return []; }
    return [value];
  }

  /* ============================================================
   * 1. checkbox（单个布尔勾选）
   * ============================================================ */

  var CHECKBOX_DEFAULTS = {
    checked: false,
    text: '',
    disabled: false,
    readonly: false,
    indeterminate: false,
    trueValue: undefined,
    falseValue: undefined,
    size: 'md'
  };

  function renderCheckbox(node, ctx) {
    var props = propsOf(node, CHECKBOX_DEFAULTS);
    var box = base.el('div', { 'class': 'kui-checkbox-wrap' });
    var state = { checked: false, disabled: !!props.disabled, readonly: !!props.readonly };

    if (props.value !== undefined) {
      state.checked = props.trueValue !== undefined ? sameValue(props.value, props.trueValue) : !!props.value;
    } else if (props.checked !== undefined) {
      state.checked = !!props.checked;
    }

    var input = base.el('input', { type: 'checkbox', 'class': 'kui-checkbox__input' });
    input.checked = state.checked;
    var visual = base.el('span', { 'class': 'kui-checkbox__box' });
    visual.appendChild(base.iconEl('check', 'kui-checkbox__tick'));
    var textEl = base.el('span', { 'class': 'kui-checkbox__label', text: props.text || '' });
    var label = base.el('label', { 'class': 'kui-checkbox' });
    label.appendChild(input);
    label.appendChild(visual);
    if (props.text) { label.appendChild(textEl); }
    box.appendChild(label);

    function currentValue() {
      if (props.trueValue !== undefined) { return state.checked ? props.trueValue : props.falseValue; }
      return state.checked;
    }
    function sync() {
      input.checked = state.checked;
      input.indeterminate = !!props.indeterminate;
      base.toggleClass(box, 'is-disabled', state.disabled);
      base.toggleClass(box, 'is-readonly', state.readonly);
      input.disabled = state.disabled;
      base.toggleClass(box, 'is-checked', state.checked);
    }
    function toggle(flag, reason) {
      if (state.disabled || state.readonly) { input.checked = state.checked; return; }
      state.checked = !!flag;
      props.indeterminate = false;
      sync();
      base.emitChange(box, ctx, node, currentValue(), { reason: reason || 'toggle' });
    }

    base.on(input, 'change', function () { toggle(!!input.checked, 'toggle'); });
    base.on(box, 'click', function (ev) {
      if (!state.readonly) { return; }
      if (ev.preventDefault) { ev.preventDefault(); }
    }, true);
    base.on(input, 'focus', function () { base.addClass(box, 'is-focus'); base.emitFocus(box, ctx, node); });
    base.on(input, 'blur', function () { base.removeClass(box, 'is-focus'); base.emitBlur(box, ctx, node); });

    sync();
    if (props.indeterminate) { base.addClass(box, 'is-indeterminate'); }

    var impl = {
      getValue: currentValue,
      setValue: function (v, opts) {
        state.checked = props.trueValue !== undefined ? sameValue(v, props.trueValue) : !!v;
        sync();
        if (!opts || !opts.silent) { base.emitChange(box, ctx, node, currentValue(), { reason: 'set' }); }
        return api;
      },
      setDisabled: function (flag) {
        state.disabled = !!flag;
        sync();
        return api;
      },
      setReadonly: function (flag) {
        state.readonly = !!flag;
        sync();
        return api;
      },
      setIndeterminate: function (flag) {
        props.indeterminate = !!flag;
        base.toggleClass(box, 'is-indeterminate', !!flag);
        input.indeterminate = !!flag;
        return api;
      },
      focus: function () { if (input.focus) { input.focus(); } return api; },
      destroy: function () { }
    };

    var returned = base.finalize(node, ctx, 'checkbox', box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('checkbox', {
    category: 'control',
    defaults: CHECKBOX_DEFAULTS,
    render: renderCheckbox,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 2. checkbox-group（多选组）
   * ============================================================ */

  var CHECKBOX_GROUP_DEFAULTS = {
    options: [],
    value: [],
    inline: false,
    disabled: false,
    readonly: false,
    size: 'md'
  };

  function renderCheckboxGroup(node, ctx) {
    var props = propsOf(node, CHECKBOX_GROUP_DEFAULTS);
    var options = base.normOptions(base.isArr(props.options) ? props.options : []);
    var state = {
      value: valueList(props.value),
      disabled: !!props.disabled,
      readonly: !!props.readonly
    };
    var box = base.el('div', { 'class': 'kui-checkbox-group' });
    if (props.inline) { base.addClass(box, 'kui-checkbox-group--inline'); }
    applySize(box, props.size, 'kui-checkbox-group');
    var items = [];

    function emit(reason) {
      base.emitChange(box, ctx, node, state.value.slice(), { reason: reason || 'toggle' });
    }
    function toggle(option, flag) {
      if (state.disabled || state.readonly) { return; }
      if (flag) {
        if (!includesValue(state.value, option.value)) { state.value.push(option.value); }
      } else {
        state.value = removeValue(state.value, option.value);
      }
      emit('toggle');
    }
    function build() {
      base.clear(box);
      items = [];
      for (var i = 0; i < options.length; i++) {
        var option = options[i];
        var checked = includesValue(state.value, option.value);
        var item = checkboxItem(option, checked, state.disabled || state.readonly, (function (opt) {
          return function (flag) { toggle(opt, flag); };
        })(option));
        box.appendChild(item.el);
        items.push(item);
      }
    }
    function sync() {
      for (var i = 0; i < items.length; i++) {
        var checked = includesValue(state.value, options[i] ? options[i].value : undefined);
        items[i].input.checked = checked;
        items[i].input.disabled = state.disabled || state.readonly || !!(options[i] && options[i].disabled);
      }
      base.toggleClass(box, 'is-disabled', state.disabled);
      base.toggleClass(box, 'is-readonly', state.readonly);
    }
    function attachFocus() {
      base.on(box, 'focusin', function () { base.addClass(box, 'is-focus'); base.emitFocus(box, ctx, node); });
      base.on(box, 'focusout', function (ev) {
        if (ev && ev.relatedTarget && base.contains(box, ev.relatedTarget)) { return; }
        base.removeClass(box, 'is-focus');
        base.emitBlur(box, ctx, node);
      });
    }

    build();
    attachFocus();
    sync();

    var impl = {
      getValue: function () { return state.value.slice(); },
      setValue: function (v, opts) {
        state.value = valueList(v);
        sync();
        if (!opts || !opts.silent) { emit('set'); }
        return api;
      },
      setOptions: function (list) {
        options = base.normOptions(base.isArr(list) ? list : []);
        build();
        sync();
        return api;
      },
      __disabledHook: function (flag) { state.disabled = !!flag; sync(); },
      __readonlyHook: function (flag) { state.readonly = !!flag; sync(); },
      focus: function () {
        if (items.length && items[0].input.focus) { items[0].input.focus(); }
        return api;
      },
      destroy: function () { }
    };

    var returned = base.finalize(node, ctx, 'checkbox-group', box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('checkbox-group', {
    category: 'control',
    defaults: CHECKBOX_GROUP_DEFAULTS,
    render: renderCheckboxGroup,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 3. radio（单个，一般配合 radio-group 使用）
   * ============================================================ */

  var RADIO_DEFAULTS = {
    checked: false,
    text: '',
    disabled: false,
    readonly: false,
    trueValue: undefined,
    falseValue: undefined,
    size: 'md'
  };

  function renderRadio(node, ctx) {
    var props = propsOf(node, RADIO_DEFAULTS);
    var state = { checked: false, disabled: !!props.disabled, readonly: !!props.readonly };
    if (props.value !== undefined) {
      state.checked = props.trueValue !== undefined ? sameValue(props.value, props.trueValue) : !!props.value;
    } else if (props.checked !== undefined) {
      state.checked = !!props.checked;
    }
    var option = { label: props.text || '', value: props.trueValue };
    var item = radioItem(option, state.checked, state.disabled, p(node, 'name', '') || '', function () {
      if (state.disabled || state.readonly) { item.input.checked = state.checked; return; }
      state.checked = true;
      sync();
      base.emitChange(box, ctx, node, currentValue(), { reason: 'toggle' });
    });
    // radioItem 已生成 label，这里把 label 直接作为控件盒
    var box = item.el;
    base.addClass(box, 'kui-radio-wrap');

    function currentValue() {
      if (props.trueValue !== undefined) { return state.checked ? props.trueValue : props.falseValue; }
      return state.checked;
    }
    function sync() {
      item.input.checked = state.checked;
      item.input.disabled = state.disabled;
      base.toggleClass(box, 'is-disabled', state.disabled);
      base.toggleClass(box, 'is-readonly', state.readonly);
      base.toggleClass(box, 'is-checked', state.checked);
    }
    base.on(box, 'click', function (ev) {
      if (!state.readonly) { return; }
      if (ev.preventDefault) { ev.preventDefault(); }
    }, true);
    base.on(item.input, 'focus', function () { base.addClass(box, 'is-focus'); base.emitFocus(box, ctx, node); });
    base.on(item.input, 'blur', function () { base.removeClass(box, 'is-focus'); base.emitBlur(box, ctx, node); });

    sync();

    var impl = {
      getValue: currentValue,
      setValue: function (v, opts) {
        state.checked = props.trueValue !== undefined ? sameValue(v, props.trueValue) : !!v;
        sync();
        if (!opts || !opts.silent) { base.emitChange(box, ctx, node, currentValue(), { reason: 'set' }); }
        return api;
      },
      __disabledHook: function (flag) { state.disabled = !!flag; sync(); },
      __readonlyHook: function (flag) { state.readonly = !!flag; sync(); },
      focus: function () { if (item.input.focus) { item.input.focus(); } return api; },
      destroy: function () { }
    };

    var returned = base.finalize(node, ctx, 'radio', box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('radio', {
    category: 'control',
    defaults: RADIO_DEFAULTS,
    render: renderRadio,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 4. radio-group（单选组）
   * ============================================================ */

  var RADIO_GROUP_DEFAULTS = {
    options: [],
    value: null,
    inline: false,
    name: '',
    disabled: false,
    readonly: false,
    size: 'md'
  };

  function renderRadioGroup(node, ctx) {
    var props = propsOf(node, RADIO_GROUP_DEFAULTS);
    var options = base.normOptions(base.isArr(props.options) ? props.options : []);
    var state = {
      value: props.value === undefined ? null : props.value,
      disabled: !!props.disabled,
      readonly: !!props.readonly
    };
    var box = base.el('div', { 'class': 'kui-radio-group' });
    if (props.inline) { base.addClass(box, 'kui-radio-group--inline'); }
    applySize(box, props.size, 'kui-radio-group');
    var groupName = props.name || ('kui-radio-' + base.uid(''));
    var items = [];

    function sync() {
      for (var i = 0; i < items.length; i++) {
        var checked = options[i] ? sameValue(options[i].value, state.value) : false;
        items[i].input.checked = checked;
        items[i].input.disabled = state.disabled || state.readonly || !!(options[i] && options[i].disabled);
      }
      base.toggleClass(box, 'is-disabled', state.disabled);
      base.toggleClass(box, 'is-readonly', state.readonly);
    }
    function build() {
      base.clear(box);
      items = [];
      for (var i = 0; i < options.length; i++) {
        var option = options[i];
        var item = radioItem(option, sameValue(option.value, state.value), state.disabled || state.readonly, groupName, (function (opt) {
          return function () {
            if (state.disabled || state.readonly) { sync(); return; }
            state.value = opt.value;
            sync();
            base.emitChange(box, ctx, node, state.value, { reason: 'toggle', option: opt.raw || opt });
          };
        })(option));
        box.appendChild(item.el);
        items.push(item);
      }
    }
    base.on(box, 'focusin', function () { base.addClass(box, 'is-focus'); base.emitFocus(box, ctx, node); });
    base.on(box, 'focusout', function (ev) {
      if (ev && ev.relatedTarget && base.contains(box, ev.relatedTarget)) { return; }
      base.removeClass(box, 'is-focus');
      base.emitBlur(box, ctx, node);
    });

    build();
    sync();

    var impl = {
      getValue: function () { return state.value; },
      setValue: function (v, opts) {
        state.value = v === undefined ? null : v;
        sync();
        if (!opts || !opts.silent) { base.emitChange(box, ctx, node, state.value, { reason: 'set' }); }
        return api;
      },
      setOptions: function (list) {
        options = base.normOptions(base.isArr(list) ? list : []);
        build();
        sync();
        return api;
      },
      __disabledHook: function (flag) { state.disabled = !!flag; sync(); },
      __readonlyHook: function (flag) { state.readonly = !!flag; sync(); },
      focus: function () {
        for (var i = 0; i < items.length; i++) {
          if (!items[i].input.disabled) { items[i].input.focus(); return api; }
        }
        return api;
      },
      destroy: function () { }
    };

    var returned = base.finalize(node, ctx, 'radio-group', box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('radio-group', {
    category: 'control',
    defaults: RADIO_GROUP_DEFAULTS,
    render: renderRadioGroup,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 5. switch
   * ============================================================ */

  var SWITCH_DEFAULTS = {
    value: false,
    activeText: '',
    inactiveText: '',
    activeValue: undefined,
    inactiveValue: undefined,
    size: 'md',
    disabled: false,
    readonly: false,
    loading: false
  };

  function renderSwitch(node, ctx) {
    var props = propsOf(node, SWITCH_DEFAULTS);
    var box = base.el('div', { 'class': 'kui-switch' });
    applySize(box, props.size, 'kui-switch');
    var state = { checked: false, disabled: !!props.disabled, readonly: !!props.readonly };

    if (props.value !== undefined) {
      state.checked = props.activeValue !== undefined ? sameValue(props.value, props.activeValue) : !!props.value;
    }

    var btn = base.el('button', { type: 'button', 'class': 'kui-switch__inner', role: 'switch', 'aria-checked': 'false' });
    var rail = base.el('span', { 'class': 'kui-switch__rail' });
    var thumb = base.el('span', { 'class': 'kui-switch__thumb' });
    rail.appendChild(thumb);
    var labelEl = base.el('span', { 'class': 'kui-switch__label' });
    btn.appendChild(rail);
    btn.appendChild(labelEl);
    box.appendChild(btn);

    function currentValue() {
      if (props.activeValue !== undefined) { return state.checked ? props.activeValue : props.inactiveValue; }
      return state.checked;
    }
    function sync() {
      base.toggleClass(box, 'is-checked', state.checked);
      base.toggleClass(box, 'is-disabled', state.disabled);
      base.toggleClass(box, 'is-readonly', state.readonly);
      base.toggleClass(box, 'is-loading', !!props.loading);
      btn.setAttribute('aria-checked', state.checked ? 'true' : 'false');
      btn.disabled = state.disabled;
      var text = state.checked ? (props.activeText || '') : (props.inactiveText || '');
      labelEl.textContent = text || '';
      labelEl.style.display = text ? '' : 'none';
      base.setState(box, { disabled: state.disabled });
    }
    function toggle(reason) {
      if (state.disabled || state.readonly || props.loading) { return; }
      state.checked = !state.checked;
      sync();
      base.emitChange(box, ctx, node, currentValue(), { reason: reason || 'toggle' });
    }

    base.on(btn, 'click', function () { toggle('toggle'); });
    base.on(btn, 'keydown', function (ev) {
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); if (state.checked) { toggle('key'); } }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); if (!state.checked) { toggle('key'); } }
    });
    base.on(btn, 'focus', function () { base.addClass(box, 'is-focus'); base.emitFocus(box, ctx, node); });
    base.on(btn, 'blur', function () { base.removeClass(box, 'is-focus'); base.emitBlur(box, ctx, node); });

    sync();

    var impl = {
      getValue: currentValue,
      setValue: function (v, opts) {
        state.checked = props.activeValue !== undefined ? sameValue(v, props.activeValue) : !!v;
        sync();
        if (!opts || !opts.silent) { base.emitChange(box, ctx, node, currentValue(), { reason: 'set' }); }
        return api;
      },
      setLoading: function (flag) { props.loading = !!flag; sync(); return api; },
      setActiveText: function (t) { props.activeText = t || ''; sync(); return api; },
      setInactiveText: function (t) { props.inactiveText = t || ''; sync(); return api; },
      __disabledHook: function (flag) { state.disabled = !!flag; sync(); },
      __readonlyHook: function (flag) { state.readonly = !!flag; sync(); },
      focus: function () { if (btn.focus) { btn.focus(); } return api; },
      destroy: function () { }
    };

    var returned = base.finalize(node, ctx, 'switch', box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('switch', {
    category: 'control',
    defaults: SWITCH_DEFAULTS,
    render: renderSwitch,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 6. slider
   * ============================================================ */

  var SLIDER_DEFAULTS = {
    min: 0,
    max: 100,
    step: 1,
    value: 0,
    showValue: true,
    tooltip: true,
    unit: '',
    disabled: false,
    readonly: false,
    size: 'md'
  };

  function decimals(step) {
    var s = String(step);
    var i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
  }

  function renderSlider(node, ctx) {
    var props = propsOf(node, SLIDER_DEFAULTS);
    var min = num(props.min, 0);
    var max = num(props.max, 100);
    if (max <= min) { max = min + 1; }
    var step = num(props.step, 1);
    if (step <= 0) { step = 1; }
    var prec = decimals(step);
    var box = base.el('div', { 'class': 'kui-slider' });
    applySize(box, props.size, 'kui-slider');
    var state = {
      value: base.clamp(num(props.value, min), min, max),
      disabled: !!props.disabled,
      readonly: !!props.readonly,
      dragging: false
    };

    var rail = base.el('div', { 'class': 'kui-slider__rail' });
    var fill = base.el('div', { 'class': 'kui-slider__fill' });
    var thumb = base.el('div', { 'class': 'kui-slider__thumb', tabindex: '0', role: 'slider' });
    var tip = base.el('span', { 'class': 'kui-slider__tip' });
    thumb.appendChild(tip);
    rail.appendChild(fill);
    rail.appendChild(thumb);
    box.appendChild(rail);
    var valueEl = null;
    if (props.showValue) {
      valueEl = base.el('span', { 'class': 'kui-slider__value' });
      box.appendChild(valueEl);
    }

    function snap(v) {
      var n = Math.round((v - min) / step) * step + min;
      n = base.clamp(n, min, max);
      var factor = Math.pow(10, prec);
      return Math.round(n * factor) / factor;
    }
    function percent() {
      return ((state.value - min) / (max - min)) * 100;
    }
    function text(v) {
      var s = base.formatNumber(v, { precision: prec });
      return props.unit ? s + String(props.unit) : s;
    }
    function sync() {
      var pc = percent();
      fill.style.width = pc + '%';
      thumb.style.left = pc + '%';
      tip.textContent = text(state.value);
      if (valueEl) { valueEl.textContent = text(state.value); }
      thumb.setAttribute('aria-valuemin', String(min));
      thumb.setAttribute('aria-valuemax', String(max));
      thumb.setAttribute('aria-valuenow', String(state.value));
      thumb.setAttribute('aria-valuetext', text(state.value));
      base.toggleClass(box, 'is-disabled', state.disabled);
      base.toggleClass(box, 'is-readonly', state.readonly);
      thumb.setAttribute('tabindex', state.disabled ? '-1' : '0');
    }
    function setValue(v, reason) {
      var next = snap(num(v, min));
      if (next === state.value) {
        sync();
        return false;
      }
      state.value = next;
      sync();
      base.emitChange(box, ctx, node, state.value, { reason: reason || 'slide' });
      return true;
    }
    function valueByClientX(clientX) {
      var rect = rail.getBoundingClientRect ? rail.getBoundingClientRect() : null;
      if (!rect || !rect.width) { return state.value; }
      var pc = (clientX - rect.left) / rect.width;
      pc = base.clamp(pc, 0, 1);
      return min + pc * (max - min);
    }
    function onDragMove(ev) {
      var x = ev && ev.clientX !== undefined ? ev.clientX : (ev.touches && ev.touches[0] ? ev.touches[0].clientX : null);
      if (x === null) { return; }
      setValue(valueByClientX(x), 'slide');
    }
    function stopDrag() {
      state.dragging = false;
      base.removeClass(box, 'is-dragging');
      base.removeClass(thumb, 'is-dragging');
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', stopDrag);
      document.removeEventListener('pointermove', onDragMove);
      document.removeEventListener('pointerup', stopDrag);
    }
    function startDrag(ev) {
      if (state.disabled || state.readonly) { return; }
      ev.preventDefault();
      state.dragging = true;
      base.addClass(box, 'is-dragging');
      base.addClass(thumb, 'is-dragging');
      setValue(valueByClientX(ev.clientX), 'slide');
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', stopDrag);
      document.addEventListener('pointermove', onDragMove);
      document.addEventListener('pointerup', stopDrag);
      if (thumb.focus) { thumb.focus(); }
    }
    function onKeydown(ev) {
      if (state.disabled || state.readonly) { return; }
      var key = ev.key;
      if (key === 'ArrowRight' || key === 'ArrowUp') { ev.preventDefault(); setValue(state.value + step, 'key'); }
      else if (key === 'ArrowLeft' || key === 'ArrowDown') { ev.preventDefault(); setValue(state.value - step, 'key'); }
      else if (key === 'PageUp') { ev.preventDefault(); setValue(state.value + step * 10, 'key'); }
      else if (key === 'PageDown') { ev.preventDefault(); setValue(state.value - step * 10, 'key'); }
      else if (key === 'Home') { ev.preventDefault(); setValue(min, 'key'); }
      else if (key === 'End') { ev.preventDefault(); setValue(max, 'key'); }
    }

    base.on(rail, 'mousedown', startDrag);
    base.on(rail, 'touchstart', function (ev) {
      if (state.disabled || state.readonly) { return; }
      startDrag({ preventDefault: function () { }, clientX: ev.touches && ev.touches[0] ? ev.touches[0].clientX : 0 });
    });
    base.on(thumb, 'keydown', onKeydown);
    base.on(thumb, 'focus', function () { base.addClass(box, 'is-focus'); base.emitFocus(box, ctx, node); });
    base.on(thumb, 'blur', function () { base.removeClass(box, 'is-focus'); base.emitBlur(box, ctx, node); });

    sync();

    var impl = {
      getValue: function () { return state.value; },
      setValue: function (v, opts) {
        state.value = snap(num(v, min));
        sync();
        if (!opts || !opts.silent) { base.emitChange(box, ctx, node, state.value, { reason: 'set' }); }
        return api;
      },
      setRange: function (a, b) {
        min = num(a, min);
        max = num(b, max);
        if (max <= min) { max = min + 1; }
        state.value = base.clamp(state.value, min, max);
        sync();
        return api;
      },
      __disabledHook: function (flag) { state.disabled = !!flag; sync(); if (flag) { stopDrag(); } },
      __readonlyHook: function (flag) { state.readonly = !!flag; sync(); },
      focus: function () { if (thumb.focus) { thumb.focus(); } return api; },
      destroy: function () { stopDrag(); }
    };

    var returned = base.finalize(node, ctx, 'slider', box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('slider', {
    category: 'control',
    defaults: SLIDER_DEFAULTS,
    render: renderSlider,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 7. progress
   * ============================================================ */

  var PROGRESS_DEFAULTS = {
    value: 0,
    status: '',
    striped: false,
    animated: false,
    showText: true,
    size: 'md',
    textInside: false
  };

  function renderProgress(node, ctx) {
    var props = propsOf(node, PROGRESS_DEFAULTS);
    var box = base.el('div', { 'class': 'kui-progress' });
    applySize(box, props.size, 'kui-progress');
    if (props.striped) { base.addClass(box, 'is-striped'); }
    if (props.animated) { base.addClass(box, 'is-animated'); }
    if (props.status) { base.addClass(box, 'kui-progress--' + props.status); }
    if (props.textInside) { base.addClass(box, 'is-text-inside'); }
    var track = base.el('div', { 'class': 'kui-progress__track' });
    var fill = base.el('div', { 'class': 'kui-progress__fill' });
    var textEl = base.el('span', { 'class': 'kui-progress__text' });
    track.appendChild(fill);
    box.appendChild(track);
    if (props.showText) { box.appendChild(textEl); }
    var state = { value: base.clamp(num(props.value, 0), 0, 100) };

    function sync() {
      var pc = Math.round(state.value * 100) / 100;
      fill.style.width = pc + '%';
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', '100');
      track.setAttribute('aria-valuenow', String(pc));
      track.setAttribute('role', 'progressbar');
      textEl.textContent = pc + '%';
    }
    sync();

    var impl = {
      getValue: function () { return state.value; },
      setValue: function (v, opts) {
        state.value = base.clamp(num(v, 0), 0, 100);
        sync();
        if (!opts || !opts.silent) { base.emitChange(box, ctx, node, state.value, { reason: 'set' }); }
        return api;
      },
      setStatus: function (status) {
        base.removeClass(box, 'kui-progress--success');
        base.removeClass(box, 'kui-progress--warning');
        base.removeClass(box, 'kui-progress--danger');
        if (status) { base.addClass(box, 'kui-progress--' + status); }
        return api;
      },
      setDisabled: function () { return api; },
      setReadonly: function () { return api; },
      focus: function () { return api; },
      destroy: function () { }
    };

    var returned = base.finalize(node, ctx, 'progress', box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('progress', {
    category: 'feedback',
    defaults: PROGRESS_DEFAULTS,
    render: renderProgress,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 8. rating
   * ============================================================ */

  var RATING_DEFAULTS = {
    value: 0,
    count: 5,
    allowHalf: false,
    allowClear: true,
    showText: false,
    texts: [],
    disabled: false,
    readonly: false,
    size: 'md'
  };

  function renderRating(node, ctx) {
    var props = propsOf(node, RATING_DEFAULTS);
    var count = Math.max(1, Math.floor(num(props.count, 5)));
    var half = halfStep(props.allowHalf);
    var box = base.el('div', { 'class': 'kui-rating' });
    applySize(box, props.size, 'kui-rating');
    var state = {
      value: base.clamp(num(props.value, 0), 0, count),
      hover: null,
      disabled: !!props.disabled,
      readonly: !!props.readonly
    };
    var stars = [];
    var textEl = null;

    for (var i = 0; i < count; i++) {
      var star = base.el('button', {
        type: 'button',
        'class': 'kui-rating__star',
        tabindex: '-1',
        'aria-label': base.t('rating.star', '{{n}} 星', { n: i + 1 })
      });
      star.appendChild(base.iconEl('star'));
      star.__index = i;
      box.appendChild(star);
      stars.push(star);
    }
    if (props.showText) {
      textEl = base.el('span', { 'class': 'kui-rating__text' });
      box.appendChild(textEl);
    }

    function halfStep(allowHalf) {
      return allowHalf ? 0.5 : 1;
    }
    function displayValue() {
      return state.hover !== null ? state.hover : state.value;
    }
    function sync() {
      var shown = displayValue();
      for (var i = 0; i < stars.length; i++) {
        var filled = shown >= i + 1;
        var halfFilled = !filled && shown >= i + 0.5;
        base.toggleClass(stars[i], 'is-active', filled);
        base.toggleClass(stars[i], 'is-half', halfFilled);
      }
      if (textEl) {
        var txt = String(shown);
        var map = base.isArr(props.texts) ? props.texts : [];
        if (map.length) {
          var idx = Math.max(0, Math.min(map.length - 1, Math.ceil(shown) - 1));
          txt = shown > 0 ? String(map[idx]) : String(map[0]);
        }
        textEl.textContent = txt;
      }
      base.toggleClass(box, 'is-disabled', state.disabled);
      base.toggleClass(box, 'is-readonly', state.readonly);
    }
    function setValue(v, reason) {
      if (state.disabled || state.readonly) { return; }
      var next = base.clamp(num(v, 0), 0, count);
      if (props.allowHalf) { next = Math.round(next * 2) / 2; }
      else { next = Math.round(next); }
      if (props.allowClear && next === state.value) { next = 0; }
      state.value = next;
      state.hover = null;
      sync();
      base.emitChange(box, ctx, node, state.value, { reason: reason || 'pick' });
    }
    function valueFromEvent(star, ev) {
      var index = star.__index;
      if (!props.allowHalf) { return index + 1; }
      var rect = star.getBoundingClientRect ? star.getBoundingClientRect() : null;
      if (!rect || !rect.width || ev.clientX === undefined) { return index + 1; }
      return (ev.clientX - rect.left) < rect.width / 2 ? index + 0.5 : index + 1;
    }
    for (var s = 0; s < stars.length; s++) {
      (function (star) {
        base.on(star, 'click', function (ev) {
          setValue(valueFromEvent(star, ev), 'pick');
        });
        base.on(star, 'mouseenter', function () {
          if (state.disabled || state.readonly) { return; }
          state.hover = props.allowHalf ? star.__index + 0.5 : star.__index + 1;
          sync();
        });
      })(stars[s]);
    }
    base.on(box, 'mouseleave', function () {
      if (state.hover !== null) { state.hover = null; sync(); }
    });
    base.on(box, 'keydown', function (ev) {
      if (state.disabled || state.readonly) { return; }
      var step = props.allowHalf ? 0.5 : 1;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') { ev.preventDefault(); setValue(state.value + step, 'key'); }
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') { ev.preventDefault(); setValue(state.value - step, 'key'); }
      else if (ev.key === 'Home') { ev.preventDefault(); setValue(0, 'key'); }
      else if (ev.key === 'End') { ev.preventDefault(); setValue(count, 'key'); }
    });
    box.setAttribute('tabindex', props.disabled ? '-1' : '0');
    box.setAttribute('role', 'slider');
    box.setAttribute('aria-valuemin', '0');
    box.setAttribute('aria-valuemax', String(count));
    base.on(box, 'focus', function () { base.addClass(box, 'is-focus'); base.emitFocus(box, ctx, node); });
    base.on(box, 'blur', function () { base.removeClass(box, 'is-focus'); base.emitBlur(box, ctx, node); });

    sync();

    var impl = {
      getValue: function () { return state.value; },
      setValue: function (v, opts) {
        state.value = base.clamp(num(v, 0), 0, count);
        if (props.allowHalf) { state.value = Math.round(state.value * 2) / 2; }
        else { state.value = Math.round(state.value); }
        sync();
        if (!opts || !opts.silent) { base.emitChange(box, ctx, node, state.value, { reason: 'set' }); }
        return api;
      },
      __disabledHook: function (flag) { state.disabled = !!flag; sync(); },
      __readonlyHook: function (flag) { state.readonly = !!flag; sync(); },
      focus: function () { if (box.focus) { box.focus(); } return api; },
      destroy: function () { }
    };

    var returned = base.finalize(node, ctx, 'rating', box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('rating', {
    category: 'control',
    defaults: RATING_DEFAULTS,
    render: renderRating,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 9. color
   * ============================================================ */

  var COLOR_DEFAULTS = {
    value: '',
    presets: ['accent', 'accent-2', 'accent-3', 'success', 'warning', 'danger', 'info', 'text-1', 'text-2', 'bg-3', 'bg-4'],
    clearable: true,
    disabled: false,
    readonly: false,
    size: 'md'
  };

  function isColorLiteral(v) {
    if (!base.isStr(v) || !v) { return false; }
    return v.charAt(0) === '#' || v.indexOf('rgb') === 0 || v.indexOf('hsl') === 0 || v.indexOf('var(') === 0;
  }
  function colorCss(v) {
    if (!v) { return 'transparent'; }
    if (isColorLiteral(v)) { return v; }
    return base.token(v);
  }

  function renderColor(node, ctx) {
    var props = propsOf(node, COLOR_DEFAULTS);
    var box = base.el('div', { 'class': 'kui-color' });
    applySize(box, props.size, 'kui-color');
    var state = { value: props.value === undefined ? '' : props.value, disabled: !!props.disabled, readonly: !!props.readonly };
    var popup = null;
    var panel = null;

    var trigger = base.el('button', { type: 'button', 'class': 'kui-color__trigger' });
    var swatch = base.el('span', { 'class': 'kui-color__swatch' });
    var textEl = base.el('span', { 'class': 'kui-color__text' });
    var arrow = base.el('span', { 'class': 'kui-color__arrow' });
    arrow.appendChild(base.iconEl('chevron-down'));
    trigger.appendChild(swatch);
    trigger.appendChild(textEl);
    trigger.appendChild(arrow);
    box.appendChild(trigger);

    function displayText() {
      if (!state.value) { return props.placeholder || base.t('color.placeholder', '选择颜色'); }
      if (base.isStr(state.value) && state.value.charAt(0) === '#') { return state.value.toUpperCase(); }
      return String(state.value);
    }
    function sync() {
      var css = colorCss(state.value);
      swatch.style.background = css;
      if (css === 'transparent') { base.addClass(swatch, 'is-empty'); }
      else { base.removeClass(swatch, 'is-empty'); }
      textEl.textContent = displayText();
      base.toggleClass(box, 'is-empty', !state.value);
      base.toggleClass(box, 'is-disabled', state.disabled);
      base.toggleClass(box, 'is-readonly', state.readonly);
      trigger.disabled = state.disabled;
      if (panel) { syncPanel(); }
    }
    function setValue(v, reason) {
      state.value = v === null || v === undefined ? '' : String(v);
      sync();
      base.emitChange(box, ctx, node, state.value, { reason: reason || 'pick' });
      return api;
    }
    function syncPanel() {
      if (!panel) { return; }
      var presets = panel.querySelectorAll('.kui-color__preset');
      for (var i = 0; i < presets.length; i++) {
        var tokenName = presets[i].getAttribute('data-token') || presets[i].getAttribute('data-color') || '';
        base.toggleClass(presets[i], 'is-active', sameValue(tokenName, state.value) || sameValue(colorCss(tokenName), state.value));
      }
      var nativeInput = panel.querySelector('.kui-color__native');
      if (nativeInput && base.isStr(state.value) && state.value.charAt(0) === '#') {
        try { nativeInput.value = state.value; } catch (e) { /* ignore */ }
      }
    }
    function buildPanel() {
      if (panel) { return panel; }
      panel = base.el('div', { 'class': 'kui-color-panel' });
      var grid = base.el('div', { 'class': 'kui-color__presets' });
      var presets = base.isArr(props.presets) ? props.presets : [];
      for (var i = 0; i < presets.length; i++) {
        var preset = presets[i];
        var name = base.isObj(preset) ? (preset.value || preset.color || preset.token || '') : preset;
        if (!name) { continue; }
        var sw = base.el('button', {
          type: 'button',
          'class': 'kui-color__preset',
          title: String(name),
          'data-token': isColorLiteral(name) ? '' : String(name),
          'data-color': isColorLiteral(name) ? String(name) : ''
        });
        sw.style.background = colorCss(name);
        (function (val) {
          base.on(sw, 'click', function () {
            var next = isColorLiteral(val) ? val : (base.themeColor(val) || val);
            setValue(next, 'pick');
            close();
          });
        })(name);
        grid.appendChild(sw);
      }
      panel.appendChild(grid);

      var custom = base.el('label', { 'class': 'kui-color__custom' });
      var nativeInput = base.el('input', { type: 'color', 'class': 'kui-color__native' });
      var themeAccent = base.themeColor('accent');
      if (themeAccent) {
        try { nativeInput.value = themeAccent; } catch (e2) { /* ignore */ }
      }
      custom.appendChild(nativeInput);
      custom.appendChild(base.el('span', { 'class': 'kui-color__custom-text', text: base.t('color.custom', '自定义') }));
      base.on(nativeInput, 'input', function () {
        setValue(nativeInput.value, 'pick');
      });
      panel.appendChild(custom);

      if (props.clearable) {
        var clearBtn = base.el('button', { type: 'button', 'class': 'kui-color__clear', text: base.t('color.clear', '清除') });
        base.on(clearBtn, 'click', function () {
          setValue('', 'clear');
          close();
        });
        panel.appendChild(clearBtn);
      }
      return panel;
    }
    function open() {
      if (state.disabled || state.readonly) { return; }
      var content = buildPanel();
      syncPanel();
      base.addClass(box, 'is-open');
      popup = base.openPopup(trigger, content, {
        placement: 'bottom-start',
        offset: 6,
        width: 220,
        className: 'kui-color-popup',
        onClose: function () {
          popup = null;
          base.removeClass(box, 'is-open');
        }
      });
    }
    function close() {
      if (popup) { popup.close(); }
    }
    function toggle() {
      if (popup) { close(); } else { open(); }
    }

    base.on(trigger, 'click', toggle);
    base.on(trigger, 'focus', function () { base.addClass(box, 'is-focus'); base.emitFocus(box, ctx, node); });
    base.on(trigger, 'blur', function (ev) {
      if (ev && ev.relatedTarget && base.contains(box, ev.relatedTarget)) { return; }
      base.removeClass(box, 'is-focus');
      base.emitBlur(box, ctx, node);
    });

    sync();

    var impl = {
      getValue: function () { return state.value; },
      setValue: function (v, opts) {
        state.value = v === null || v === undefined ? '' : String(v);
        sync();
        if (!opts || !opts.silent) { base.emitChange(box, ctx, node, state.value, { reason: 'set' }); }
        return api;
      },
      __disabledHook: function (flag) { state.disabled = !!flag; sync(); if (flag) { close(); } },
      __readonlyHook: function (flag) { state.readonly = !!flag; sync(); },
      focus: function () { if (trigger.focus) { trigger.focus(); } return api; },
      open: open,
      close: close,
      destroy: function () { close(); }
    };

    var returned = base.finalize(node, ctx, 'color', box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('color', {
    category: 'control',
    defaults: COLOR_DEFAULTS,
    render: renderColor,
    api: function (el) { return el.__kuiControl; }
  });

})(typeof window !== 'undefined' ? window : this);

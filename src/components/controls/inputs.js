/*!
 * KurumiUI - controls/inputs.js
 * 输入类控件：button / input / password / textarea / number
 *
 * 依赖：control-base.js（KUI.controls.base），以 KUI.registry.register 协议注册。
 * 每个控件均可在 ctx.form == null 时独立挂载（finalize 自动补 .kui-field 包装）。
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
  var isFn = base.isFn;

  function propsOf(node, defaults) {
    return base.merge({}, defaults, base.getProps(node));
  }
  function applySize(box, size, prefix) {
    if (!size || size === 'md') { return; }
    base.addClass(box, prefix + '--' + size);
  }
  function isEmptyValue(v) {
    if (v === null || v === undefined) { return true; }
    if (base.isStr(v) && base.trim(v) === '') { return true; }
    if (base.isArr(v) && v.length === 0) { return true; }
    return false;
  }
  function syncEmpty(box, value) {
    base.toggleClass(box, 'is-empty', isEmptyValue(value));
  }
  function makeButton(cls, iconName, ariaLabel) {
    var btn = base.el('button', {
      type: 'button',
      'class': cls,
      tabindex: '-1',
      'aria-label': ariaLabel || ''
    });
    if (iconName) { btn.appendChild(base.iconEl(iconName)); }
    return btn;
  }
  function keepFocusOn(btn) {
    base.on(btn, 'mousedown', function (ev) { ev.preventDefault(); });
  }
  function setIcon(host, name) {
    base.clear(host);
    host.appendChild(base.iconEl(name));
  }
  function validAlways() { return { valid: true, message: '' }; }

  /* ============================================================
   * 1. button
   * ============================================================ */

  var BUTTON_DEFAULTS = {
    text: '',
    variant: 'default',
    size: 'md',
    icon: '',
    iconRight: '',
    block: false,
    round: false,
    iconOnly: false,
    loading: false,
    disabled: false
  };

  function renderButton(node, ctx) {
    var props = propsOf(node, BUTTON_DEFAULTS);
    var box = base.el('button', {
      type: 'button',
      'class': 'kui-btn',
      'data-kui-size': props.size || 'md'
    });
    if (props.variant && props.variant !== 'default') {
      base.addClass(box, 'kui-btn--' + props.variant);
    }
    applySize(box, props.size, 'kui-btn');
    if (props.block) { base.addClass(box, 'kui-btn--block'); }
    if (props.round) { base.addClass(box, 'kui-btn--round'); }
    if (props.iconOnly) { base.addClass(box, 'kui-btn--icon-only'); }
    if (props.loading) { base.addClass(box, 'is-loading'); }

    var text = props.text === undefined || props.text === null ? '' : String(props.text);
    if (!text && !props.iconOnly) { text = base.t('button.label', '按钮'); }

    var stateEls = { icon: null, text: null, loading: null };
    if (props.icon) {
      stateEls.icon = base.el('span', { 'class': 'kui-btn__icon' });
      stateEls.icon.appendChild(base.iconEl(props.icon));
      box.appendChild(stateEls.icon);
    }
    if (!props.iconOnly) {
      stateEls.text = base.el('span', { 'class': 'kui-btn__text', text: text });
      box.appendChild(stateEls.text);
    }
    if (props.iconRight) {
      var right = base.el('span', { 'class': 'kui-btn__icon kui-btn__icon--right' });
      right.appendChild(base.iconEl(props.iconRight));
      box.appendChild(right);
    }
    stateEls.loading = base.el('span', { 'class': 'kui-btn__loading' });
    stateEls.loading.appendChild(base.el('i', { 'class': 'kui-spinner' }));
    if (props.loading) { box.appendChild(stateEls.loading); }

    if (props.iconOnly) {
      var aria = props.title || props.text || base.t('button.label', '按钮');
      box.setAttribute('aria-label', aria);
      if (props.title) { box.setAttribute('title', props.title); }
    }
    if (props.disabled) { box.disabled = true; }
    if (props.loading) { box.setAttribute('aria-busy', 'true'); }

    var state = {
      value: props.value === undefined ? null : props.value,
      disabled: !!props.disabled,
      loading: !!props.loading,
      readonly: false
    };
    var api = null;

    function setLoading(flag) {
      state.loading = !!flag;
      base.toggleClass(box, 'is-loading', state.loading);
      if (state.loading && stateEls.loading.parentNode !== box) { box.appendChild(stateEls.loading); }
      if (state.loading) { box.setAttribute('aria-busy', 'true'); }
      else { box.removeAttribute('aria-busy'); }
      box.disabled = state.disabled || state.loading;
      return api;
    }

    base.on(box, 'click', function (ev) {
      if (state.disabled || state.loading) {
        ev.preventDefault();
        return;
      }
      base.dispatchAction(props.action, ctx, box, node, { value: state.value, event: ev });
      base.emitAction(box, ctx, node, 'click', { event: ev, value: state.value });
    });

    var impl = {
      getValue: function () { return state.value; },
      setValue: function (v) {
        state.value = v;
        if (props.text === undefined && stateEls.text && v !== null && v !== undefined) {
          stateEls.text.textContent = String(v);
        }
        return api;
      },
      validate: validAlways,
      __disabledHook: function (flag) {
        state.disabled = !!flag;
        box.disabled = state.disabled || state.loading;
      },
      focus: function () { if (box.focus) { box.focus(); } return api; },
      setLoading: setLoading,
      setText: function (txt) {
        if (stateEls.text) { stateEls.text.textContent = base.toStr(txt); }
        return api;
      }
    };

    var returned = base.finalize(node, ctx, 'button', box, impl, { selfWrap: false });
    api = returned.__kuiControl;
    if (props.pressed) { box.setAttribute('aria-pressed', 'true'); }
    return returned;
  }

  define('button', {
    category: 'action',
    defaults: BUTTON_DEFAULTS,
    render: renderButton,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 2. input / password（共用一个渲染器）
   * ============================================================ */

  var INPUT_DEFAULTS = {
    type: 'text',
    value: '',
    placeholder: '',
    size: 'md',
    clearable: false,
    prefixIcon: '',
    suffixIcon: '',
    prefix: '',
    suffix: '',
    unit: '',
    maxlength: null,
    readonly: false,
    disabled: false,
    align: '',
    autofocus: false,
    showCount: false
  };

  function renderTextInput(node, ctx, kind, extraDefaults) {
    var props = propsOf(node, base.merge({}, INPUT_DEFAULTS, extraDefaults || {}));
    var isPassword = kind === 'password';
    var box = base.el('div', { 'class': 'kui-input kui-input--' + kind });
    applySize(box, props.size, 'kui-input');

    var initial = props.value;
    if (initial === null || initial === undefined) { initial = ''; }
    var state = {
      value: String(initial),
      last: String(initial),
      disabled: !!props.disabled,
      readonly: !!props.readonly,
      passwordVisible: false
    };

    if (props.prefixIcon || props.prefix) {
      var prefixEl = base.el('span', { 'class': 'kui-input__prefix' });
      if (props.prefixIcon) { prefixEl.appendChild(base.iconEl(props.prefixIcon, 'kui-input__prefix-icon')); }
      if (props.prefix) { prefixEl.appendChild(base.el('span', { 'class': 'kui-input__prefix-text', text: props.prefix })); }
      box.appendChild(prefixEl);
    }
    var input = base.el('input', { 'class': 'kui-input__inner' });
    input.setAttribute('type', isPassword ? 'password' : (props.type || 'text'));
    input.value = state.value;
    if (props.placeholder) { input.setAttribute('placeholder', props.placeholder); }
    if (props.maxlength !== null && props.maxlength !== undefined) {
      input.setAttribute('maxlength', String(props.maxlength));
    }
    if (props.autofocus) { input.setAttribute('autofocus', 'autofocus'); }
    if (props.align) { input.style.textAlign = props.align; }
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('aria-label', props.placeholder || (node && node.label) || '');
    if (state.disabled) { input.disabled = true; }
    if (state.readonly) { input.readOnly = true; }
    box.appendChild(input);

    var suffixEl = base.el('span', { 'class': 'kui-input__suffix' });
    if (props.suffixIcon) { suffixEl.appendChild(base.iconEl(props.suffixIcon)); }
    if (props.suffix) { suffixEl.appendChild(base.el('span', { 'class': 'kui-input__suffix-text', text: props.suffix })); }
    if (props.unit) { suffixEl.appendChild(base.el('span', { 'class': 'kui-input__unit', text: props.unit })); }

    var clearBtn = null;
    if (props.clearable) {
      clearBtn = makeButton('kui-input__clear', 'close', base.t('control.clear', '清空'));
      keepFocusOn(clearBtn);
      suffixEl.appendChild(clearBtn);
    }
    var eyeBtn = null;
    if (isPassword && props.toggleable !== false) {
      eyeBtn = makeButton('kui-input__eye', 'eye', base.t('control.showPassword', '显示密码'));
      keepFocusOn(eyeBtn);
      suffixEl.appendChild(eyeBtn);
    }
    var countEl = null;
    if (props.showCount && props.maxlength !== null && props.maxlength !== undefined) {
      countEl = base.el('span', { 'class': 'kui-input__count' });
      suffixEl.appendChild(countEl);
    }
    if (suffixEl.childNodes && suffixEl.childNodes.length) { box.appendChild(suffixEl); }
    else { suffixEl = null; }

    function updateCount() {
      if (!countEl) { return; }
      countEl.textContent = String(input.value.length) + ' / ' + String(props.maxlength);
    }
    function updateClear() {
      if (!clearBtn) { return; }
      var show = !state.disabled && !state.readonly && input.value.length > 0;
      clearBtn.style.display = show ? '' : 'none';
    }
    function syncVisual() {
      syncEmpty(box, input.value);
      updateClear();
      updateCount();
    }

    function notify(reason) {
      var v = input.value;
      if (state.last === v && reason !== 'force') { return; }
      state.last = v;
      state.value = v;
      base.emitChange(box, ctx, node, v, { reason: reason || 'input' });
    }
    function setValue(v, opts) {
      var next = v === null || v === undefined ? '' : String(v);
      input.value = next;
      state.value = next;
      syncVisual();
      if (!opts || !opts.silent) { notify('set'); }
      return api;
    }

    base.on(input, 'input', function () {
      state.value = input.value;
      syncVisual();
      notify('input');
      base.emit(ctx, 'control:input', { id: node ? node.id : undefined, value: input.value, node: node, el: box });
    });
    base.on(input, 'change', function () {
      syncVisual();
      notify('change');
    });
    base.on(input, 'focus', function () {
      base.addClass(box, 'is-focus');
      base.emitFocus(box, ctx, node);
    });
    base.on(input, 'blur', function () {
      base.removeClass(box, 'is-focus');
      if (props.trim && isFn(input.value.trim)) {
        var t = input.value.trim();
        if (t !== input.value) { input.value = t; syncVisual(); notify('blur'); }
      }
      base.emitBlur(box, ctx, node);
      notify('blur');
    });
    if (clearBtn) {
      base.on(clearBtn, 'click', function () {
        setValue('', { silent: false });
        if (input.focus) { input.focus(); }
      });
    }
    if (eyeBtn) {
      base.on(eyeBtn, 'click', function () {
        state.passwordVisible = !state.passwordVisible;
        input.setAttribute('type', state.passwordVisible ? 'text' : 'password');
        setIcon(eyeBtn, state.passwordVisible ? 'eye-off' : 'eye');
        eyeBtn.setAttribute('aria-label', base.t(
          state.passwordVisible ? 'control.hidePassword' : 'control.showPassword',
          state.passwordVisible ? '隐藏密码' : '显示密码'
        ));
        if (input.focus) { input.focus(); }
      });
    }
    base.bindEnter(input, ctx, {});
    base.on(input, 'keydown', function (ev) {
      if (ev.key === 'Escape' && clearBtn && input.value) {
        ev.stopPropagation();
        setValue('');
      }
    });
    syncVisual();

    var impl = {
      getValue: function () { return input.value; },
      setValue: setValue,
      __disabledHook: function (flag) {
        state.disabled = !!flag;
        input.disabled = state.disabled;
        updateClear();
      },
      __readonlyHook: function (flag) {
        state.readonly = !!flag;
        input.readOnly = state.readonly;
        updateClear();
      },
      focus: function () { if (input.focus) { input.focus(); } return api; },
      blur: function () { if (input.blur) { input.blur(); } return api; },
      select: function () { if (input.select) { input.select(); } return api; },
      getInput: function () { return input; },
      setPlaceholder: function (text) {
        input.setAttribute('placeholder', base.toStr(text));
        return api;
      }
    };

    var returned = base.finalize(node, ctx, kind, box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('input', {
    category: 'control',
    defaults: INPUT_DEFAULTS,
    render: function (node, ctx) { return renderTextInput(node, ctx, 'input', null); },
    api: function (el) { return el.__kuiControl; }
  });

  define('password', {
    category: 'control',
    defaults: base.merge({}, INPUT_DEFAULTS, { toggleable: true }),
    render: function (node, ctx) { return renderTextInput(node, ctx, 'password', { toggleable: true }); },
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 3. textarea
   * ============================================================ */

  var TEXTAREA_DEFAULTS = {
    value: '',
    placeholder: '',
    size: 'md',
    rows: 3,
    maxRows: 8,
    autosize: false,
    resize: 'vertical',
    maxlength: null,
    showCount: false,
    readonly: false,
    disabled: false
  };

  function renderTextarea(node, ctx) {
    var props = propsOf(node, TEXTAREA_DEFAULTS);
    var box = base.el('div', { 'class': 'kui-textarea' });
    applySize(box, props.size, 'kui-textarea');
    var initial = props.value === null || props.value === undefined ? '' : String(props.value);
    var state = {
      value: initial,
      last: initial,
      disabled: !!props.disabled,
      readonly: !!props.readonly
    };
    var ta = base.el('textarea', { 'class': 'kui-textarea__inner' });
    ta.value = initial;
    ta.setAttribute('rows', String(props.rows || 3));
    ta.setAttribute('spellcheck', 'false');
    if (props.placeholder) { ta.setAttribute('placeholder', props.placeholder); }
    if (props.maxlength !== null && props.maxlength !== undefined) {
      ta.setAttribute('maxlength', String(props.maxlength));
    }
    if (state.disabled) { ta.disabled = true; }
    if (state.readonly) { ta.readOnly = true; }
    box.appendChild(ta);

    var footer = base.el('div', { 'class': 'kui-textarea__footer' });
    var countEl = null;
    if (props.showCount) {
      countEl = base.el('span', { 'class': 'kui-textarea__count' });
      footer.appendChild(countEl);
    }
    if (footer.childNodes && footer.childNodes.length) { box.appendChild(footer); }
    else { footer = null; }

    function updateCount() {
      if (!countEl) { return; }
      var suffix = props.maxlength !== null && props.maxlength !== undefined ? ' / ' + String(props.maxlength) : '';
      countEl.textContent = String(ta.value.length) + suffix;
    }
    function autoGrow() {
      if (!props.autosize) { return; }
      var lineHeight = 20;
      var max = (props.maxRows || 8) * lineHeight;
      ta.style.height = 'auto';
      var next = Math.min(Math.max(ta.scrollHeight || 0, (props.rows || 3) * lineHeight), max);
      ta.style.height = next + 'px';
    }
    function notify(reason) {
      var v = ta.value;
      if (state.last === v) { return; }
      state.last = v;
      state.value = v;
      base.emitChange(box, ctx, node, v, { reason: reason || 'input' });
    }
    function setValue(v, opts) {
      ta.value = v === null || v === undefined ? '' : String(v);
      state.value = ta.value;
      syncEmpty(box, ta.value);
      updateCount();
      autoGrow();
      if (!opts || !opts.silent) { notify('set'); }
      return api;
    }
    function syncVisual() {
      syncEmpty(box, ta.value);
      updateCount();
    }

    base.on(ta, 'input', function () {
      state.value = ta.value;
      syncVisual();
      autoGrow();
      notify('input');
      base.emit(ctx, 'control:input', { id: node ? node.id : undefined, value: ta.value, node: node, el: box });
    });
    base.on(ta, 'change', function () { notify('change'); });
    base.on(ta, 'focus', function () {
      base.addClass(box, 'is-focus');
      base.emitFocus(box, ctx, node);
    });
    base.on(ta, 'blur', function () {
      base.removeClass(box, 'is-focus');
      base.emitBlur(box, ctx, node);
      notify('blur');
    });
    base.bindEnter(ta, ctx, { textarea: true });

    var resizeHandle = null;
    var dragCleanup = null;
    if (props.resize !== 'none' && !props.autosize) {
      resizeHandle = base.el('span', {
        'class': 'kui-textarea__resize',
        'aria-hidden': 'true',
        title: base.t('control.resize', '拖动调整高度')
      });
      box.appendChild(resizeHandle);
      base.on(resizeHandle, 'mousedown', function (ev) {
        if (state.disabled || state.readonly) { return; }
        ev.preventDefault();
        var startY = ev.clientY;
        var startH = box.getBoundingClientRect ? box.getBoundingClientRect().height : box.offsetHeight;
        base.addClass(box, 'is-resizing');
        function onMove(me) {
          var delta = me.clientY - startY;
          var min = ((props.rows || 3) * 20) + 8;
          var next = base.clamp(startH + delta, min, 520);
          box.style.height = Math.round(next) + 'px';
          ta.style.height = '100%';
        }
        function onUp() {
          base.removeClass(box, 'is-resizing');
          document.removeEventListener('mousemove', onMove, true);
          document.removeEventListener('mouseup', onUp, true);
          if (dragCleanup === onUp) { dragCleanup = null; }
        }
        document.addEventListener('mousemove', onMove, true);
        document.addEventListener('mouseup', onUp, true);
        dragCleanup = onUp;
      });
    }

    syncVisual();
    autoGrow();

    var impl = {
      getValue: function () { return ta.value; },
      setValue: setValue,
      __disabledHook: function (flag) {
        state.disabled = !!flag;
        ta.disabled = state.disabled;
      },
      __readonlyHook: function (flag) {
        state.readonly = !!flag;
        ta.readOnly = state.readonly;
      },
      focus: function () { if (ta.focus) { ta.focus(); } return api; },
      blur: function () { if (ta.blur) { ta.blur(); } return api; },
      getInput: function () { return ta; },
      setPlaceholder: function (text) { ta.setAttribute('placeholder', base.toStr(text)); return api; },
      destroy: function () {
        if (dragCleanup) {
          document.removeEventListener('mousemove', dragCleanup, true);
          dragCleanup = null;
        }
      }
    };

    var returned = base.finalize(node, ctx, 'textarea', box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('textarea', {
    category: 'control',
    defaults: TEXTAREA_DEFAULTS,
    render: renderTextarea,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 4. number（含加减箭头 + 长按连加）
   * ============================================================ */

  var NUMBER_DEFAULTS = {
    value: null,
    min: null,
    max: null,
    step: 1,
    precision: null,
    controls: true,
    placeholder: '',
    unit: '',
    thousands: false,
    align: 'left',
    wheel: false,
    readonly: false,
    disabled: false,
    allowOutOfRange: false
  };

  function stepPrecision(step) {
    var s = String(step);
    var i = s.indexOf('.');
    return i >= 0 ? Math.min(10, s.length - i - 1) : 0;
  }

  function renderNumber(node, ctx) {
    var props = propsOf(node, NUMBER_DEFAULTS);
    var precision = props.precision === null || props.precision === undefined
      ? stepPrecision(props.step) : Math.max(0, Math.min(10, Number(props.precision) || 0));
    var min = props.min === null || props.min === undefined ? null : Number(props.min);
    var max = props.max === null || props.max === undefined ? null : Number(props.max);
    var stepNum = Number(props.step);
    if (!isFinite(stepNum) || stepNum <= 0) { stepNum = 1; }

    var box = base.el('div', { 'class': 'kui-number' });
    applySize(box, props.size, 'kui-number');
    if (props.align === 'right') { base.addClass(box, 'kui-number--right'); }

    var initial = props.value;
    var parsed = base.parseNumber(initial, { precision: precision });
    var state = {
      value: parsed.valid ? parsed.value : null,
      disabled: !!props.disabled,
      readonly: !!props.readonly,
      text: ''
    };

    var input = base.el('input', { 'class': 'kui-number__inner' });
    input.setAttribute('type', 'text');
    input.setAttribute('inputmode', 'decimal');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    if (props.placeholder) { input.setAttribute('placeholder', props.placeholder); }
    if (props.align) { input.style.textAlign = props.align; }
    if (state.disabled) { input.disabled = true; }
    if (state.readonly) { input.readOnly = true; }
    box.appendChild(input);

    if (props.unit) {
      box.appendChild(base.el('span', { 'class': 'kui-number__unit', text: props.unit }));
    }

    var upBtn = null;
    var downBtn = null;
    if (props.controls) {
      var stepsEl = base.el('span', { 'class': 'kui-number__steps' });
      upBtn = base.el('button', {
        type: 'button',
        'class': 'kui-number__step kui-number__step--up',
        tabindex: '-1',
        'aria-label': base.t('number.increase', '增加')
      });
      upBtn.appendChild(base.iconEl('chevron-up'));
      downBtn = base.el('button', {
        type: 'button',
        'class': 'kui-number__step kui-number__step--down',
        tabindex: '-1',
        'aria-label': base.t('number.decrease', '减少')
      });
      downBtn.appendChild(base.iconEl('chevron-down'));
      stepsEl.appendChild(upBtn);
      stepsEl.appendChild(downBtn);
      box.appendChild(stepsEl);
    }

    function formatVal(v) {
      if (v === null || v === undefined || !isFinite(v)) { return ''; }
      return base.formatNumber(v, { precision: precision, thousands: props.thousands });
    }
    function clampVal(n) {
      if (props.allowOutOfRange) { return n; }
      if (min !== null && n < min) { n = min; }
      if (max !== null && n > max) { n = max; }
      return n;
    }
    function syncSteps() {
      if (!upBtn) { return; }
      var atMax = state.value !== null && max !== null && state.value >= max;
      var atMin = state.value !== null && min !== null && state.value <= min;
      var disabled = state.disabled || state.readonly;
      upBtn.disabled = disabled || atMax;
      downBtn.disabled = disabled || atMin;
      base.toggleClass(upBtn, 'is-disabled', upBtn.disabled);
      base.toggleClass(downBtn, 'is-disabled', downBtn.disabled);
    }
    function syncVisual() {
      syncEmpty(box, state.value);
      syncSteps();
    }
    function notify(reason) {
      base.emitChange(box, ctx, node, state.value, { reason: reason || 'input', text: input.value });
    }
    function renderInput() {
      input.value = formatVal(state.value);
      syncVisual();
    }
    function applyValue(next, reason) {
      var before = state.value;
      state.value = next;
      renderInput();
      if (before !== next) { notify(reason); }
      return next;
    }
    function commitFromText(reason) {
      var raw = input.value;
      var parsedText = base.parseNumber(raw, { precision: null });
      if (parsedText.empty) {
        if (state.value !== null) {
          state.value = null;
          renderInput();
          notify(reason || 'clear');
        } else { renderInput(); }
        return;
      }
      if (!parsedText.valid) {
        renderInput();
        return;
      }
      var n = clampVal(base.round(parsedText.value, precision));
      var before = state.value;
      state.value = n;
      renderInput();
      if (before !== n) { notify(reason || 'change'); }
    }
    function stepBy(dir, multiplier) {
      if (state.disabled || state.readonly) { return; }
      var current = state.value;
      if (current === null) {
        var parsedText = base.parseNumber(input.value, { precision: null });
        if (parsedText.valid) { current = parsedText.value; }
        else { current = min !== null ? min : (dir > 0 ? 0 : 0); }
      }
      var next = current + dir * stepNum * (multiplier || 1);
      next = base.round(next, precision);
      next = clampVal(next);
      applyValue(next, 'step');
    }

    function setValue(v, opts) {
      var parsedV = base.parseNumber(v, { precision: precision });
      if (v === null || v === undefined || v === '') {
        state.value = null;
      } else if (parsedV.valid) {
        state.value = clampVal(base.round(parsedV.value, precision));
      } else {
        state.value = null;
      }
      renderInput();
      if (!opts || !opts.silent) { notify('set'); }
      return api;
    }

    base.on(input, 'input', function () {
      var parsedText = base.parseNumber(input.value, { precision: null });
      syncEmpty(box, parsedText.empty ? null : input.value);
      if (parsedText.valid) {
        var n = clampVal(base.round(parsedText.value, precision));
        if (n !== state.value) {
          state.value = n;
          syncSteps();
          notify('input');
        }
      }
      base.emit(ctx, 'control:input', { id: node ? node.id : undefined, value: state.value, node: node, el: box });
    });
    base.on(input, 'change', function () { commitFromText('change'); });
    base.on(input, 'blur', function () {
      base.removeClass(box, 'is-focus');
      commitFromText('blur');
      base.emitBlur(box, ctx, node);
    });
    base.on(input, 'focus', function () {
      base.addClass(box, 'is-focus');
      base.emitFocus(box, ctx, node);
    });
    base.on(input, 'keydown', function (ev) {
      var key = ev.key;
      if (key === 'ArrowUp') {
        ev.preventDefault();
        stepBy(1);
      } else if (key === 'ArrowDown') {
        ev.preventDefault();
        stepBy(-1);
      } else if (key === 'PageUp') {
        ev.preventDefault();
        stepBy(1, 10);
      } else if (key === 'PageDown') {
        ev.preventDefault();
        stepBy(-1, 10);
      } else if (key === 'Home' && min !== null) {
        ev.preventDefault();
        applyValue(min, 'step');
      } else if (key === 'End' && max !== null) {
        ev.preventDefault();
        applyValue(max, 'step');
      } else if (key === 'Enter') {
        commitFromText('change');
      }
    });
    base.on(input, 'wheel', function (ev) {
      var focused = document.activeElement === input;
      if (!props.wheel && !focused) { return; }
      if (state.disabled || state.readonly) { return; }
      ev.preventDefault();
      stepBy(ev.deltaY < 0 ? 1 : -1);
    }, { passive: false });

    if (upBtn) {
      base.repeatPress(upBtn, function () { stepBy(1); });
      base.repeatPress(downBtn, function () { stepBy(-1); });
    }

    renderInput();
    if (props.autofocus && input.focus) { input.focus(); }

    var impl = {
      getValue: function () { return state.value; },
      setValue: setValue,
      __disabledHook: function (flag) {
        state.disabled = !!flag;
        input.disabled = state.disabled;
        syncSteps();
      },
      __readonlyHook: function (flag) {
        state.readonly = !!flag;
        input.readOnly = state.readonly;
        syncSteps();
      },
      focus: function () { if (input.focus) { input.focus(); } return api; },
      blur: function () { if (input.blur) { input.blur(); } return api; },
      getInput: function () { return input; },
      stepUp: function () { stepBy(1); return api; },
      stepDown: function () { stepBy(-1); return api; },
      setPlaceholder: function (text) { input.setAttribute('placeholder', base.toStr(text)); return api; }
    };

    var returned = base.finalize(node, ctx, 'number', box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('number', {
    category: 'control',
    defaults: NUMBER_DEFAULTS,
    render: renderNumber,
    api: function (el) { return el.__kuiControl; }
  });

})(typeof window !== 'undefined' ? window : this);

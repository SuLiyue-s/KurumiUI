/*!
 * KurumiUI - controls/selects.js
 * 选择类控件：select / multiselect
 *
 * 统一弹层：KUI.controls.popup.open（自动翻转 / matchWidth / 点击外部关闭 / Esc）。
 * 下拉面板结构统一使用 .kui-select-panel，多选复用同一套选项渲染。
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
  function keepFocusOn(btn) {
    base.on(btn, 'mousedown', function (ev) { ev.preventDefault(); });
  }

  /* ============================================================
   * 通用下拉面板
   * cfg = {
   *   multiple, searchable, searchPlaceholder, emptyText,
   *   getSelected(option) -> bool,
   *   onPick(option, ev),
   *   footer: { checkAllText, clearText, onCheckAll(flag), onClear() } | null
   * }
   * ============================================================ */
  function createPanel(cfg) {
    var panel = base.el('div', { 'class': 'kui-select-panel' });
    if (cfg.multiple) { base.addClass(panel, 'kui-select-panel--multiple'); }
    var searchWrap = null;
    var searchInput = null;
    if (cfg.searchable) {
      searchWrap = base.el('div', { 'class': 'kui-select__search' });
      searchInput = base.el('input', { 'class': 'kui-select__search-input', type: 'text' });
      searchInput.setAttribute('placeholder', cfg.searchPlaceholder || base.t('select.search', '搜索'));
      searchInput.setAttribute('autocomplete', 'off');
      searchWrap.appendChild(base.iconEl('search', 'kui-select__search-icon'));
      searchWrap.appendChild(searchInput);
      panel.appendChild(searchWrap);
    }
    var listEl = base.el('div', { 'class': 'kui-select-list' });
    listEl.setAttribute('role', 'listbox');
    if (cfg.multiple) { listEl.setAttribute('aria-multiselectable', 'true'); }
    panel.appendChild(listEl);

    var emptyEl = base.el('div', { 'class': 'kui-select__empty', text: cfg.emptyText || base.t('select.empty', '无匹配项') });
    emptyEl.style.display = 'none';
    panel.appendChild(emptyEl);

    var footerEl = null;
    if (cfg.footer) {
      footerEl = base.el('div', { 'class': 'kui-select__footer' });
      var checkAllBtn = base.el('button', { type: 'button', 'class': 'kui-select__footer-btn' });
      var clearBtn = base.el('button', { type: 'button', 'class': 'kui-select__footer-btn kui-select__footer-btn--clear' });
      checkAllBtn.textContent = cfg.footer.checkAllText || base.t('select.checkAll', '全选');
      clearBtn.textContent = cfg.footer.clearText || base.t('select.clear', '清空');
      footerEl.appendChild(checkAllBtn);
      footerEl.appendChild(clearBtn);
      panel.appendChild(footerEl);
      base.on(checkAllBtn, 'click', function (ev) {
        ev.stopPropagation();
        if (cfg.footer && cfg.footer.onCheckAll) { cfg.footer.onCheckAll(); }
      });
      base.on(clearBtn, 'click', function (ev) {
        ev.stopPropagation();
        if (cfg.footer && cfg.footer.onClear) { cfg.footer.onClear(); }
      });
      if (!cfg.hasFooterActions) {
        footerEl.style.display = 'none';
      }
    }

    var state = {
      options: [],
      visible: [],
      activeIndex: -1,
      keyword: '',
      itemEls: []
    };

    function markActive(index) {
      state.activeIndex = index;
      for (var i = 0; i < state.itemEls.length; i++) {
        var item = state.itemEls[i];
        base.toggleClass(item.el, 'is-active', i === index);
      }
      var active = state.itemEls[index];
      if (active && active.el && base.scrollIntoView) {
        base.scrollIntoView(listEl, active.el);
      }
    }
    function isDisabledItem(index) {
      var item = state.itemEls[index];
      return !item || !!item.option.disabled;
    }
    function moveActive(delta) {
      var total = state.itemEls.length;
      if (!total) { return; }
      var start = state.activeIndex;
      var i = start;
      for (var count = 0; count < total; count++) {
        i += delta;
        if (i < 0) { i = total - 1; }
        if (i >= total) { i = 0; }
        if (!isDisabledItem(i)) {
          markActive(i);
          return;
        }
      }
    }
    function optionEl(option, index) {
      var item = base.el('div', { 'class': 'kui-option', 'role': 'option', tabindex: '-1' });
      if (option.disabled) { base.addClass(item, 'is-disabled'); }
      if (cfg.getSelected && cfg.getSelected(option)) { base.addClass(item, 'is-selected'); }
      var check = base.el('span', { 'class': 'kui-option__check' });
      check.appendChild(base.iconEl('check'));
      if (option.icon) {
        var ico = base.el('span', { 'class': 'kui-option__icon' });
        ico.appendChild(base.iconEl(option.icon));
        item.appendChild(ico);
      }
      item.appendChild(base.el('span', { 'class': 'kui-option__label', text: option.label }));
      if (option.desc) {
        item.appendChild(base.el('span', { 'class': 'kui-option__desc', text: option.desc }));
      }
      item.appendChild(check);
      if (cfg.multiple) {
        item.setAttribute('aria-selected', cfg.getSelected(option) ? 'true' : 'false');
      } else if (cfg.getSelected && cfg.getSelected(option)) {
        item.setAttribute('aria-selected', 'true');
      }
      item.__kuiOption = option;
      base.on(item, 'mouseenter', function () {
        if (!option.disabled) { markActive(index); }
      });
      base.on(item, 'click', function (ev) {
        if (option.disabled) { return; }
        ev.stopPropagation();
        if (cfg.onPick) { cfg.onPick(option, ev); }
      });
      return item;
    }

    function rebuild(keyword) {
      state.keyword = keyword || '';
      state.options = cfg.getOptions ? cfg.getOptions() : [];
      state.visible = [];
      state.itemEls = [];
      state.activeIndex = -1;
      base.clear(listEl);
      var kw = state.keyword ? String(state.keyword).toLowerCase() : '';
      var source = state.options;
      for (var i = 0; i < source.length; i++) {
        var opt = source[i];
        if (kw && String(opt.label).toLowerCase().indexOf(kw) < 0 && String(opt.value).toLowerCase().indexOf(kw) < 0) {
          continue;
        }
        var el = optionEl(opt, state.itemEls.length);
        listEl.appendChild(el);
        state.visible.push(opt);
        state.itemEls.push({ option: opt, el: el });
      }
      if (!state.itemEls.length) {
        emptyEl.style.display = '';
      } else {
        emptyEl.style.display = 'none';
        // 默认高亮首个选中项或无选中时首个可选项
        var selectedIndex = -1;
        for (var s = 0; s < state.itemEls.length; s++) {
          if (!isDisabledItem(s) && cfg.getSelected && cfg.getSelected(state.itemEls[s].option)) {
            selectedIndex = s;
            break;
          }
        }
        if (selectedIndex >= 0) { markActive(selectedIndex); }
        else { markActive(0); }
      }
      if (cfg.onRebuild) { cfg.onRebuild(); }
    }

    return {
      el: panel,
      listEl: listEl,
      searchInput: searchInput,
      searchWrap: searchWrap,
      rebuild: rebuild,
      moveActive: moveActive,
      markActive: markActive,
      getActive: function () {
        var item = state.itemEls[state.activeIndex];
        return item ? item.option : null;
      },
      getKeyword: function () { return state.keyword; },
      reset: function () {
        if (searchInput) { searchInput.value = ''; }
        rebuild('');
      },
      focusSearch: function () {
        if (searchInput && searchInput.focus) { searchInput.focus(); }
      }
    };
  }

  /* ============================================================
   * 1. select（单选）
   * ============================================================ */

  var SELECT_DEFAULTS = {
    options: [],
    value: null,
    placeholder: '',
    size: 'md',
    clearable: true,
    filterable: false,
    disabled: false,
    readonly: false
  };

  function renderSelect(node, ctx) {
    var props = propsOf(node, SELECT_DEFAULTS);
    if (!base.isArr(props.options)) { props.options = []; }
    var flat = base.flattenOptions(props.options);
    var grouped = base.isGroupOptions(props.options);
    var box = base.el('div', { 'class': 'kui-select' });
    applySize(box, props.size, 'kui-select');
    box.setAttribute('data-kui-filled', '');
    var state = {
      value: props.value === undefined ? null : props.value,
      disabled: !!props.disabled,
      readonly: !!props.readonly,
      open: false
    };

    var trigger = base.el('div', {
      'class': 'kui-select__trigger',
      tabindex: '0',
      role: 'combobox',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false'
    });
    var valueEl = base.el('span', { 'class': 'kui-select__value' });
    var clearBtn = base.el('button', {
      type: 'button',
      'class': 'kui-select__clear',
      tabindex: '-1',
      'aria-label': base.t('control.clear', '清空')
    });
    clearBtn.appendChild(base.iconEl('close'));
    var arrowEl = base.el('span', { 'class': 'kui-select__arrow', 'aria-hidden': 'true' });
    arrowEl.appendChild(base.iconEl('chevron-down'));
    trigger.appendChild(valueEl);
    if (props.clearable) { trigger.appendChild(clearBtn); }
    trigger.appendChild(arrowEl);
    box.appendChild(trigger);
    keepFocusOn(clearBtn);

    var panel = null;
    var popup = null;

    function selectedOption() {
      for (var i = 0; i < flat.length; i++) {
        if (sameValue(flat[i].value, state.value)) { return flat[i]; }
      }
      return null;
    }
    function syncValue() {
      var selected = selectedOption();
      var hasValue = state.value !== null && state.value !== undefined && state.value !== '';
      valueEl.textContent = selected ? selected.label : (hasValue ? String(state.value) : (props.placeholder || base.t('select.placeholder', '请选择')));
      base.toggleClass(box, 'is-empty', !hasValue);
      base.toggleClass(box, 'is-selected', !!selected);
      if (clearBtn) {
        clearBtn.style.display = hasValue && !state.disabled && !state.readonly ? '' : 'none';
      }
      trigger.setAttribute('title', valueEl.textContent || '');
    }
    function syncDisabled() {
      trigger.setAttribute('tabindex', state.disabled ? '-1' : '0');
      base.toggleClass(box, 'is-disabled', state.disabled);
      base.toggleClass(box, 'is-readonly', state.readonly);
      if (clearBtn) {
        clearBtn.style.display = (state.value !== null && state.value !== undefined && state.value !== '' && !state.disabled && !state.readonly) ? '' : 'none';
      }
    }
    function ensurePanel() {
      if (panel) { return panel; }
      panel = createPanel({
        multiple: false,
        searchable: !!props.filterable,
        searchPlaceholder: base.t('select.search', '搜索'),
        emptyText: base.t('select.empty', '无匹配项'),
        getOptions: function () { return base.flattenOptions(props.options); },
        getSelected: function (option) { return sameValue(option.value, state.value); },
        onPick: function (option) {
          state.value = option.value;
          syncValue();
          syncDisabled();
          base.emitChange(box, ctx, node, state.value, { option: option.raw || option, label: option.label, reason: 'pick' });
          close();
          if (trigger.focus) { trigger.focus(); }
        }
      });
      if (panel.searchInput) {
        base.on(panel.searchInput, 'input', function () { panel.rebuild(panel.searchInput.value); });
        base.on(panel.searchInput, 'keydown', onKeydown);
      }
      return panel;
    }
    function onKeydown(ev) {
      if (state.disabled || state.readonly) { return; }
      var key = ev.key;
      if (key === 'ArrowDown') {
        ev.preventDefault();
        if (!state.open) { open(); }
        else { panel.moveActive(1); }
      } else if (key === 'ArrowUp') {
        ev.preventDefault();
        if (!state.open) { open(); }
        else { panel.moveActive(-1); }
      } else if (key === 'Enter') {
        if (!state.open) { return; }
        ev.preventDefault();
        var opt = panel.getActive();
        if (opt && !opt.disabled) {
          state.value = opt.value;
          syncValue();
          base.emitChange(box, ctx, node, state.value, { option: opt.raw || opt, label: opt.label, reason: 'pick' });
          close();
        }
      } else if (key === 'Escape') {
        if (state.open) {
          ev.stopPropagation();
          close();
        }
      } else if (key === 'Home' || key === 'End') {
        if (!state.open) { return; }
        ev.preventDefault();
        var total = panel.listEl.children.length;
        if (key === 'Home') { panel.markActive(0); } else { panel.markActive(total - 1); }
      } else if (key === 'Tab') {
        if (state.open) { close(); }
      }
    }
    function open() {
      if (state.disabled || state.readonly || state.open) { return; }
      state.open = true;
      base.addClass(box, 'is-open');
      trigger.setAttribute('aria-expanded', 'true');
      var p0 = ensurePanel();
      p0.reset();
      popup = base.openPopup(box, p0.el, {
        placement: 'bottom-start',
        offset: 6,
        matchWidth: true,
        maxHeight: 'auto',
        className: 'kui-select-popup',
        ignoreOutside: function (target) { return base.contains(box, target); },
        onClose: function () {
          state.open = false;
          popup = null;
          base.removeClass(box, 'is-open');
          trigger.setAttribute('aria-expanded', 'false');
        }
      });
      if (props.filterable) { p0.focusSearch(); }
    }
    function close() {
      if (popup) { popup.close(); }
      if (panel) { panel.reset(); }
    }

    base.on(trigger, 'click', function (ev) {
      if (state.disabled || state.readonly) { return; }
      if (ev.target === clearBtn || (clearBtn && base.contains(clearBtn, ev.target))) { return; }
      if (state.open) { close(); } else { open(); }
    });
    base.on(trigger, 'keydown', onKeydown);
    base.on(trigger, 'focus', function () { base.addClass(box, 'is-focus'); base.emitFocus(box, ctx, node); });
    base.on(trigger, 'blur', function (ev) {
      if (ev && ev.relatedTarget && base.contains(box, ev.relatedTarget)) { return; }
      base.removeClass(box, 'is-focus');
      base.emitBlur(box, ctx, node);
    });
    if (clearBtn) {
      base.on(clearBtn, 'click', function (ev) {
        ev.stopPropagation();
        if (state.disabled || state.readonly) { return; }
        var had = state.value !== null && state.value !== undefined && state.value !== '';
        state.value = null;
        syncValue();
        syncDisabled();
        if (had) { base.emitChange(box, ctx, node, null, { reason: 'clear' }); }
      });
    }

    syncValue();
    syncDisabled();
    if (p(node, 'autofocus', false)) {
      try { trigger.focus(); } catch (e) { /* ignore */ }
    }

    var impl = {
      getValue: function () { return state.value; },
      setValue: function (v, opts) {
        state.value = v === undefined ? null : v;
        syncValue();
        syncDisabled();
        if (!opts || !opts.silent) {
          base.emitChange(box, ctx, node, state.value, { reason: 'set' });
        }
        return api;
      },
      setOptions: function (options) {
        props.options = base.isArr(options) ? options : [];
        flat = base.flattenOptions(props.options);
        if (panel) { panel.rebuild(panel.getKeyword ? panel.getKeyword() : ''); }
        syncValue();
        return api;
      },
      __disabledHook: function (flag) {
        state.disabled = !!flag;
        syncDisabled();
        if (state.disabled && state.open) { close(); }
      },
      __readonlyHook: function (flag) {
        state.readonly = !!flag;
        syncDisabled();
        if (state.readonly && state.open) { close(); }
      },
      focus: function () { if (trigger.focus) { trigger.focus(); } return api; },
      open: open,
      close: close,
      getSelectedOption: selectedOption,
      destroy: function () { close(); }
    };

    var returned = base.finalize(node, ctx, 'select', box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('select', {
    category: 'control',
    defaults: SELECT_DEFAULTS,
    render: renderSelect,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 2. multiselect（多选 + 搜索 + 全选/清空 + 标签 + Cover 溢出）
   * ============================================================ */

  var MULTISELECT_DEFAULTS = {
    options: [],
    value: [],
    placeholder: '',
    size: 'md',
    clearable: true,
    filterable: true,
    maxTagCount: 3,
    collapseTags: true,
    showCheckAll: true,
    searchPlaceholder: '',
    disabled: false,
    readonly: false
  };

  function renderMultiselect(node, ctx) {
    var props = propsOf(node, MULTISELECT_DEFAULTS);
    if (!base.isArr(props.options)) { props.options = []; }
    var flat = base.flattenOptions(props.options);
    var box = base.el('div', { 'class': 'kui-multiselect' });
    applySize(box, props.size, 'kui-multiselect');
    var state = {
      value: base.isArr(props.value) ? props.value.slice() : [],
      disabled: !!props.disabled,
      readonly: !!props.readonly,
      open: false
    };

    var trigger = base.el('div', {
      'class': 'kui-multiselect__trigger',
      tabindex: '0',
      role: 'combobox',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false'
    });
    var tagsEl = base.el('div', { 'class': 'kui-multiselect__tags' });
    var arrowEl = base.el('span', { 'class': 'kui-multiselect__arrow', 'aria-hidden': 'true' });
    arrowEl.appendChild(base.iconEl('chevron-down'));
    trigger.appendChild(tagsEl);
    trigger.appendChild(arrowEl);
    box.appendChild(trigger);

    var panel = null;
    var popup = null;

    function optionsByValue(value) {
      for (var i = 0; i < flat.length; i++) {
        if (sameValue(flat[i].value, value)) { return flat[i]; }
      }
      return null;
    }
    function syncTags() {
      base.clear(tagsEl);
      var maxCount = props.collapseTags === false ? state.value.length : (Number(props.maxTagCount) > 0 ? Number(props.maxTagCount) : state.value.length);
      if (!state.value.length) {
        tagsEl.appendChild(base.el('span', {
          'class': 'kui-multiselect__placeholder',
          text: props.placeholder || base.t('select.placeholder', '请选择')
        }));
      } else {
        var shown = 0;
        for (var i = 0; i < state.value.length; i++) {
          if (shown >= maxCount) { break; }
          var option = optionsByValue(state.value[i]);
          var tag = base.el('span', { 'class': 'kui-tag kui-tag--sm kui-multiselect__tag' });
          tag.appendChild(base.el('span', { 'class': 'kui-tag__text', text: option ? option.label : String(state.value[i]) }));
          var close = base.el('button', {
            type: 'button',
            'class': 'kui-tag__close',
            tabindex: '-1',
            'aria-label': base.t('control.remove', '移除')
          });
          close.appendChild(base.iconEl('close'));
          tag.appendChild(close);
          (function (value) {
            keepFocusOn(close);
            base.on(close, 'click', function (ev) {
              ev.stopPropagation();
              if (state.disabled || state.readonly) { return; }
              removeOne(value);
            });
          })(state.value[i]);
          tagsEl.appendChild(tag);
          shown += 1;
        }
        var rest = state.value.length - shown;
        if (rest > 0) {
          tagsEl.appendChild(base.el('span', {
            'class': 'kui-multiselect__more',
            text: '+' + String(rest)
          }));
        }
      }
      var hasValue = state.value.length > 0;
      base.toggleClass(box, 'is-empty', !hasValue);
    }
    function syncDisabled() {
      trigger.setAttribute('tabindex', state.disabled ? '-1' : '0');
      base.toggleClass(box, 'is-disabled', state.disabled);
      base.toggleClass(box, 'is-readonly', state.readonly);
    }
    function emit(reason) {
      base.emitChange(box, ctx, node, state.value.slice(), { reason: reason || 'pick' });
    }
    function addOne(value) {
      if (includesValue(state.value, value)) { return false; }
      state.value.push(value);
      syncTags();
      emit('add');
      return true;
    }
    function removeOne(value) {
      var before = state.value.length;
      state.value = removeValue(state.value, value);
      if (state.value.length !== before) {
        syncTags();
        emit('remove');
      }
    }
    function ensurePanel() {
      if (panel) { return panel; }
      panel = createPanel({
        multiple: true,
        searchable: !!props.filterable,
        searchPlaceholder: props.searchPlaceholder || base.t('select.search', '搜索'),
        emptyText: base.t('select.empty', '无匹配项'),
        hasFooterActions: !!props.showCheckAll,
        getOptions: function () { return base.flattenOptions(props.options); },
        getSelected: function (option) { return includesValue(state.value, option.value); },
        onPick: function (option) {
          if (includesValue(state.value, option.value)) { removeOne(option.value); }
          else { addOne(option.value); }
          if (panel) {
            panel.rebuild(panel.getKeyword());
            panel.markActiveSilent && panel.markActiveSilent();
          }
        },
        footer: props.showCheckAll ? {
          checkAllText: base.t('select.checkAll', '全选'),
          clearText: base.t('select.clear', '清空'),
          onCheckAll: function () {
            var all = base.flattenOptions(props.options);
            var next = [];
            for (var i = 0; i < all.length; i++) {
              if (!all[i].disabled) { next.push(all[i].value); }
            }
            var same = next.length === state.value.length;
            state.value = same ? [] : next;
            syncTags();
            if (panel) { panel.rebuild(panel.getKeyword()); }
            emit(same ? 'clear' : 'checkAll');
          },
          onClear: function () {
            if (!state.value.length) { return; }
            state.value = [];
            syncTags();
            if (panel) { panel.rebuild(panel.getKeyword()); }
            emit('clear');
          }
        } : null
      });
      if (panel.searchInput) {
        base.on(panel.searchInput, 'input', function () { panel.rebuild(panel.searchInput.value); });
        base.on(panel.searchInput, 'keydown', onKeydown);
      }
      return panel;
    }
    function onKeydown(ev) {
      if (state.disabled || state.readonly) { return; }
      var key = ev.key;
      if (key === 'ArrowDown') {
        ev.preventDefault();
        if (!state.open) { open(); } else { panel.moveActive(1); }
      } else if (key === 'ArrowUp') {
        ev.preventDefault();
        if (!state.open) { open(); } else { panel.moveActive(-1); }
      } else if (key === 'Enter') {
        if (!state.open) { return; }
        ev.preventDefault();
        var opt = panel.getActive();
        if (opt && !opt.disabled) {
          if (includesValue(state.value, opt.value)) { removeOne(opt.value); }
          else { addOne(opt.value); }
          panel.rebuild(panel.getKeyword());
        }
      } else if (key === 'Escape') {
        if (state.open) { ev.stopPropagation(); close(); }
      } else if (key === 'Backspace') {
        if (!state.open && state.value.length) {
          ev.preventDefault();
          removeOne(state.value[state.value.length - 1]);
        }
      } else if (key === 'Tab') {
        if (state.open) { close(); }
      }
    }
    function open() {
      if (state.disabled || state.readonly || state.open) { return; }
      state.open = true;
      base.addClass(box, 'is-open');
      trigger.setAttribute('aria-expanded', 'true');
      var p0 = ensurePanel();
      p0.reset();
      popup = base.openPopup(box, p0.el, {
        placement: 'bottom-start',
        offset: 6,
        matchWidth: true,
        maxHeight: 'auto',
        className: 'kui-select-popup kui-multiselect-popup',
        ignoreOutside: function (target) { return base.contains(box, target); },
        onClose: function () {
          state.open = false;
          popup = null;
          base.removeClass(box, 'is-open');
          trigger.setAttribute('aria-expanded', 'false');
        }
      });
      if (props.filterable) { p0.focusSearch(); }
    }
    function close() {
      if (popup) { popup.close(); }
      if (panel) { panel.reset(); }
    }

    base.on(trigger, 'click', function (ev) {
      if (state.disabled || state.readonly) { return; }
      if (ev.target && base.closest(ev.target, '.kui-multiselect__tag')) { return; }
      if (state.open) { close(); } else { open(); }
    });
    base.on(trigger, 'keydown', onKeydown);
    base.on(trigger, 'focus', function () { base.addClass(box, 'is-focus'); base.emitFocus(box, ctx, node); });
    base.on(trigger, 'blur', function (ev) {
      if (ev && ev.relatedTarget && base.contains(box, ev.relatedTarget)) { return; }
      base.removeClass(box, 'is-focus');
      base.emitBlur(box, ctx, node);
    });

    syncTags();
    syncDisabled();
    if (p(node, 'autofocus', false)) {
      try { trigger.focus(); } catch (e) { /* ignore */ }
    }

    var impl = {
      getValue: function () { return state.value.slice(); },
      setValue: function (v, opts) {
        state.value = base.isArr(v) ? v.slice() : [];
        syncTags();
        syncDisabled();
        if (!opts || !opts.silent) {
          base.emitChange(box, ctx, node, state.value.slice(), { reason: 'set' });
        }
        return api;
      },
      setOptions: function (options) {
        props.options = base.isArr(options) ? options : [];
        flat = base.flattenOptions(props.options);
        if (panel) { panel.rebuild(panel.getKeyword()); }
        syncTags();
        return api;
      },
      __disabledHook: function (flag) {
        state.disabled = !!flag;
        syncDisabled();
        if (state.disabled && state.open) { close(); }
      },
      __readonlyHook: function (flag) {
        state.readonly = !!flag;
        syncDisabled();
        if (state.readonly && state.open) { close(); }
      },
      focus: function () { if (trigger.focus) { trigger.focus(); } return api; },
      open: open,
      close: close,
      getSelectedOptions: function () {
        var out = [];
        for (var i = 0; i < state.value.length; i++) {
          var option = optionsByValue(state.value[i]);
          out.push(option || { value: state.value[i], label: String(state.value[i]) });
        }
        return out;
      },
      destroy: function () { close(); }
    };

    var returned = base.finalize(node, ctx, 'multiselect', box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('multiselect', {
    category: 'control',
    defaults: MULTISELECT_DEFAULTS,
    render: renderMultiselect,
    api: function (el) { return el.__kuiControl; }
  });

})(typeof window !== 'undefined' ? window : this);

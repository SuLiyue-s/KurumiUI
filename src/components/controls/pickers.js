/*!
 * KurumiUI - controls/pickers.js
 * 选择器控制：date / daterange / month / time / datetime
 *
 * 统一使用 KUI.controls.popup（自动翻转 / 点击外部关闭 / Esc），
 * 日历面板与时间列全部自绘，箭头统一使用 sprite 图标。
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
  function isoDate(d) {
    return base.formatDate(d, 'YYYY-MM-DD');
  }
  function fmtDate(d, fmt) {
    return base.formatDate(d, fmt || 'YYYY-MM-DD');
  }
  function sameDay(a, b) {
    return !!a && !!b && base.sameDay(a, b);
  }
  function compareDay(a, b) {
    if (!a || !b) { return 0; }
    return base.compareDay(a, b);
  }
  function addMonths(d, n) {
    return base.addMonths(d, n);
  }
  function addDays(d, n) {
    return base.addDays(d, n);
  }
  function startMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  function clampDate(d, min, max) {
    var next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (min && compareDay(next, min) < 0) { next = new Date(min.getFullYear(), min.getMonth(), min.getDate()); }
    if (max && compareDay(next, max) > 0) { next = new Date(max.getFullYear(), max.getMonth(), max.getDate()); }
    return next;
  }

  /* ============================================================
   * 触发器
   * ============================================================ */

  function createTrigger(type, iconName) {
    var box = base.el('div', { 'class': 'kui-picker kui-picker--' + type });
    var trigger = base.el('button', { type: 'button', 'class': 'kui-picker__trigger', 'aria-haspopup': 'dialog' });
    var icon = base.el('span', { 'class': 'kui-picker__icon', 'aria-hidden': 'true' });
    icon.appendChild(base.iconEl(iconName));
    var textEl = base.el('span', { 'class': 'kui-picker__text' });
    var clearBtn = base.el('button', {
      type: 'button',
      'class': 'kui-picker__clear',
      tabindex: '-1',
      'aria-label': base.t('control.clear', '清空')
    });
    clearBtn.appendChild(base.iconEl('close'));
    trigger.appendChild(icon);
    trigger.appendChild(textEl);
    trigger.appendChild(clearBtn);
    box.appendChild(trigger);
    return { box: box, trigger: trigger, textEl: textEl, clearBtn: clearBtn };
  }

  function applyTriggerState(parts, state) {
    base.toggleClass(parts.box, 'is-disabled', !!state.disabled);
    base.toggleClass(parts.box, 'is-readonly', !!state.readonly);
    base.toggleClass(parts.box, 'is-open', !!state.open);
    base.toggleClass(parts.box, 'is-empty', !state.hasValue);
    parts.trigger.disabled = !!state.disabled;
    parts.trigger.setAttribute('aria-disabled', state.disabled ? 'true' : 'false');
    parts.trigger.setAttribute('aria-expanded', state.open ? 'true' : 'false');
    var showClear = !!state.clearable && !!state.hasValue && !state.disabled && !state.readonly;
    parts.clearBtn.style.display = showClear ? '' : 'none';
  }

  function bindTrigger(parts, handlers) {
    base.on(parts.clearBtn, 'mousedown', function (ev) { ev.preventDefault(); });
    base.on(parts.clearBtn, 'click', function (ev) {
      ev.stopPropagation();
      if (handlers.onClear) { handlers.onClear(); }
    });
    base.on(parts.trigger, 'click', function () {
      if (handlers.disabled && handlers.disabled()) { return; }
      if (handlers.onToggle) { handlers.onToggle(); }
    });
    base.on(parts.trigger, 'focus', function () {
      base.addClass(parts.box, 'is-focus');
      if (handlers.onFocus) { handlers.onFocus(); }
    });
    base.on(parts.trigger, 'blur', function (ev) {
      if (ev && ev.relatedTarget && base.contains(parts.box, ev.relatedTarget)) { return; }
      base.removeClass(parts.box, 'is-focus');
      if (handlers.onBlur) { handlers.onBlur(); }
    });
  }

  function footerButton(text, cls, onClick) {
    var btn = base.el('button', { type: 'button', 'class': 'kui-picker__footer-btn' + (cls ? ' ' + cls : ''), text: text });
    base.on(btn, 'click', function (ev) { ev.stopPropagation(); onClick(ev); });
    return btn;
  }
  function makeFooter(items) {
    var footer = base.el('div', { 'class': 'kui-picker__footer' });
    for (var i = 0; i < items.length; i++) { footer.appendChild(items[i]); }
    return footer;
  }

  /* ============================================================
   * 日历（单月）
   * cfg = {
   *   weekStart, min, max, hidePrev, hideNext,
   *   getSelected() -> Date|null,
   *   getRange() -> {start,end,hover}|null,
   *   onPick(date), onHover(date|null), onViewChange({year,month})
   * }
   * ============================================================ */

  var WEEK_FALLBACK = ['日', '一', '二', '三', '四', '五', '六'];
  var WEEK_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  function weekLabel(index) {
    return base.t('date.week.' + WEEK_KEYS[index], WEEK_FALLBACK[index]);
  }

  function createCalendar(cfg) {
    cfg = cfg || {};
    var weekStart = cfg.weekStart === undefined ? 1 : Number(cfg.weekStart);
    if (isNaN(weekStart)) { weekStart = 1; }
    weekStart = ((weekStart % 7) + 7) % 7;
    var view = { year: 0, month: 0 };
    var focusDate = null;
    // 42 格与日期/节点的对应关系：hover 时只改 class（paint），不重建 DOM，
    // 否则鼠标悬停会把光标下的节点替换掉，真实浏览器里会导致点击丢失。
    var cellMeta = [];
    var root = base.el('div', { 'class': 'kui-date__panel' });
    var head = base.el('div', { 'class': 'kui-date__head' });
    var titleEl = base.el('span', { 'class': 'kui-date__title' });
    var prevYear = navBtn('prev', 'year', 2);
    var prevMonth = navBtn('prev', 'month', 1);
    var nextMonth = navBtn('next', 'month', 1);
    var nextYear = navBtn('next', 'year', 2);
    if (cfg.hidePrev) {
      prevYear.style.display = 'none';
      prevMonth.style.display = 'none';
    }
    if (cfg.hideNext) {
      nextMonth.style.display = 'none';
      nextYear.style.display = 'none';
    }
    head.appendChild(prevYear);
    head.appendChild(prevMonth);
    head.appendChild(titleEl);
    head.appendChild(nextMonth);
    head.appendChild(nextYear);
    var weekdays = base.el('div', { 'class': 'kui-date__weekdays' });
    var grid = base.el('div', { 'class': 'kui-date__grid', role: 'grid' });
    root.appendChild(head);
    root.appendChild(weekdays);
    root.appendChild(grid);

    for (var w = 0; w < 7; w++) {
      weekdays.appendChild(base.el('span', {
        'class': 'kui-date__weekday' + (w === 0 || w === 6 ? ' is-weekend' : ''),
        text: weekLabel((weekStart + w) % 7)
      }));
    }

    function navBtn(dir, unit, count) {
      var cls = 'kui-date__nav kui-date__nav--' + dir + '-' + unit;
      var btn = base.el('button', {
        type: 'button',
        'class': cls,
        'aria-label': dir === 'prev'
          ? (unit === 'year' ? base.t('date.prevYear', '上一年') : base.t('date.prevMonth', '上个月'))
          : (unit === 'year' ? base.t('date.nextYear', '下一年') : base.t('date.nextMonth', '下个月'))
      });
      var iconName = dir === 'prev' ? 'chevron-left' : 'chevron-right';
      btn.appendChild(base.iconEl(iconName));
      if (count === 2) {
        btn.appendChild(base.iconEl(iconName, 'kui-date__nav-second'));
      }
      base.on(btn, 'click', function (ev) {
        ev.stopPropagation();
        var monthDelta = unit === 'year' ? count * 12 : count;
        shift(monthDelta);
      });
      return btn;
    }

    function shift(months) {
      var next = addMonths(new Date(view.year, view.month, 1), months);
      setView(next.getFullYear(), next.getMonth());
      if (cfg.onViewChange) { cfg.onViewChange({ year: view.year, month: view.month }); }
    }
    function setView(year, month) {
      var d = new Date(year, month, 1);
      view.year = d.getFullYear();
      view.month = d.getMonth();
      rebuild();
    }
    function setViewDate(date, silent) {
      if (!date) { return; }
      var changed = date.getFullYear() !== view.year || date.getMonth() !== view.month;
      view.year = date.getFullYear();
      view.month = date.getMonth();
      rebuild();
      if (changed && !silent && cfg.onViewChange) {
        cfg.onViewChange({ year: view.year, month: view.month });
      }
    }
    function isDisabledDay(d) {
      if (cfg.min && compareDay(d, cfg.min) < 0) { return true; }
      if (cfg.max && compareDay(d, cfg.max) > 0) { return true; }
      return false;
    }
    function selectedList() {
      var out = [];
      if (cfg.getSelected) {
        var s = cfg.getSelected();
        if (s) { out.push(s); }
      }
      var range = cfg.getRange ? cfg.getRange() : null;
      if (range) {
        if (range.start) { out.push(range.start); }
        if (range.end) { out.push(range.end); }
      }
      return out;
    }
    // 计算单格 class（rebuild 与 paint 共用，保证 hover 刷新与重建的类名一致）
    function cellClass(d, picked, range, today) {
      var cls = 'kui-date__cell';
      if (d.getMonth() !== view.month || d.getFullYear() !== view.year) { cls += ' is-outside'; }
      if (sameDay(d, today)) { cls += ' is-today'; }
      if (d.getDay() === 0 || d.getDay() === 6) { cls += ' is-weekend'; }
      if (isDisabledDay(d)) { cls += ' is-disabled'; }
      var isSelected = false;
      for (var s = 0; s < picked.length; s++) {
        if (sameDay(d, picked[s])) { isSelected = true; break; }
      }
      if (isSelected) { cls += ' is-selected'; }
      if (range && range.start) {
        var endEff = range.end || range.hover;
        if (sameDay(d, range.start)) { cls += ' is-range-start'; }
        if (range.end && sameDay(d, range.end)) { cls += ' is-range-end'; }
        if (endEff && compareDay(d, range.start) > 0 && compareDay(d, endEff) < 0) { cls += ' is-in-range'; }
        if (range.end && sameDay(d, range.start) && sameDay(d, range.end)) { cls += ' is-range-single'; }
      }
      return cls;
    }
    function rebuild() {
      var picked = selectedList();
      var range = cfg.getRange ? cfg.getRange() : null;
      var today = new Date();
      titleEl.textContent = base.t('date.yearMonth', '{{year}} 年 {{month}} 月', {
        year: view.year,
        month: view.month + 1
      });
      base.clear(grid);
      cellMeta = [];
      var first = new Date(view.year, view.month, 1);
      var offset = (first.getDay() - weekStart + 7) % 7;
      var startDate = addDays(first, -offset);
      for (var i = 0; i < 42; i++) {
        var d = addDays(startDate, i);
        var disabled = isDisabledDay(d);
        var cls = cellClass(d, picked, range, today);
        var isSelected = cls.indexOf(' is-selected') !== -1;
        var btn = base.el('button', {
          type: 'button',
          'class': cls,
          role: 'gridcell',
          'data-date': isoDate(d),
          tabindex: focusDate && sameDay(d, focusDate) ? '0' : '-1'
        });
        btn.appendChild(base.el('span', { 'class': 'kui-date__day', text: String(d.getDate()) }));
        btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        if (disabled) { btn.setAttribute('aria-disabled', 'true'); }
        (function (day, isDis) {
          base.on(btn, 'click', function (ev) {
            ev.stopPropagation();
            if (isDis) { return; }
            focusDate = new Date(day.getFullYear(), day.getMonth(), day.getDate());
            if (cfg.onPick) { cfg.onPick(day, ev); }
          });
          base.on(btn, 'mouseenter', function () {
            if (isDis) { return; }
            if (cfg.onHover) { cfg.onHover(day); }
          });
        })(d, disabled);
        grid.appendChild(btn);
        cellMeta.push({ date: d, el: btn });
      }
    }
    // 只刷新 class/aria，不替换 DOM 节点（hover 预览用）
    function paint() {
      var picked = selectedList();
      var range = cfg.getRange ? cfg.getRange() : null;
      var today = new Date();
      for (var i = 0; i < cellMeta.length; i++) {
        var meta = cellMeta[i];
        var btn = meta.el;
        if (!btn) { continue; }
        var cls = cellClass(meta.date, picked, range, today);
        btn.className = cls;
        btn.setAttribute('aria-selected', cls.indexOf(' is-selected') !== -1 ? 'true' : 'false');
      }
    }
    base.on(root, 'mouseleave', function () {
      if (cfg.onHover) { cfg.onHover(null); }
    });
    base.on(grid, 'keydown', function (ev) {
      var key = ev.key;
      var cur = focusDate || new Date();
      var next = null;
      if (key === 'ArrowLeft') { next = addDays(cur, -1); }
      else if (key === 'ArrowRight') { next = addDays(cur, 1); }
      else if (key === 'ArrowUp') { next = addDays(cur, -7); }
      else if (key === 'ArrowDown') { next = addDays(cur, 7); }
      else if (key === 'Home') { next = addDays(cur, -(((cur.getDay() - weekStart + 7) % 7))); }
      else if (key === 'End') { next = addDays(cur, 6 - (((cur.getDay() - weekStart + 7) % 7))); }
      else if (key === 'PageUp') { next = addMonths(cur, -1); }
      else if (key === 'PageDown') { next = addMonths(cur, 1); }
      else if (key === 'Enter' || key === ' ') {
        if (isDisabledDay(cur)) { return; }
        ev.preventDefault();
        if (cfg.onPick) { cfg.onPick(cur, ev); }
        return;
      } else {
        return;
      }
      ev.preventDefault();
      next = clampDate(next, cfg.min, cfg.max);
      focusDate = next;
      if (next.getFullYear() !== view.year || next.getMonth() !== view.month) {
        view.year = next.getFullYear();
        view.month = next.getMonth();
        if (cfg.onViewChange) { cfg.onViewChange({ year: view.year, month: view.month }); }
      }
      rebuild();
      focusCell(next);
    });
    function focusCell(d) {
      var target = grid.querySelector('[data-date="' + isoDate(d) + '"]');
      if (target && target.focus) { target.focus(); }
    }

    return {
      el: root,
      rebuild: rebuild,
      paint: paint,
      setView: setView,
      setViewDate: setViewDate,
      getView: function () { return { year: view.year, month: view.month }; },
      getFocusDate: function () { return focusDate; },
      setFocusDate: function (d) { focusDate = d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null; rebuild(); },
      focusCell: focusCell
    };
  }

  /* ============================================================
   * 1. date
   * ============================================================ */

  var DATE_DEFAULTS = {
    value: '',
    format: 'YYYY-MM-DD',
    placeholder: '',
    clearable: true,
    disabled: false,
    readonly: false,
    min: '',
    max: '',
    weekStart: 1,
    showToday: true,
    size: 'md'
  };

  function renderDate(node, ctx) {
    var props = propsOf(node, DATE_DEFAULTS);
    var parts = createTrigger('date', 'calendar');
    applySize(parts.box, props.size, 'kui-picker');
    var state = {
      date: base.toDate(props.value),
      disabled: !!props.disabled,
      readonly: !!props.readonly,
      open: false
    };
    var min = base.toDate(props.min);
    var max = base.toDate(props.max);
    var popup = null;
    var panel = null;
    var cal = null;

    function displayText() {
      if (state.date) { return fmtDate(state.date, props.format); }
      return props.placeholder || base.t('date.placeholder', '选择日期');
    }
    function sync() {
      parts.textEl.textContent = displayText();
      applyTriggerState(parts, {
        disabled: state.disabled,
        readonly: state.readonly,
        open: state.open,
        hasValue: !!state.date,
        clearable: props.clearable
      });
      if (cal) { cal.rebuild(); }
    }
    function applyValue(next, reason) {
      state.date = next ? new Date(next.getFullYear(), next.getMonth(), next.getDate()) : null;
      sync();
      base.emitChange(parts.box, ctx, node, state.date ? fmtDate(state.date, props.format) : '', {
        reason: reason || 'pick',
        date: state.date
      });
    }
    function buildPanel() {
      if (panel) { return panel; }
      panel = base.el('div', { 'class': 'kui-picker-panel kui-date-panel' });
      cal = createCalendar({
        weekStart: props.weekStart,
        min: min,
        max: max,
        getSelected: function () { return state.date; },
        onPick: function (d) {
          applyValue(d, 'pick');
          close();
        }
      });
      panel.appendChild(cal.el);
      var footerItems = [];
      if (props.showToday) {
        footerItems.push(footerButton(base.t('date.today', '今天'), 'kui-picker__footer-btn--today', function () {
          var today = new Date();
          if (min && compareDay(today, min) < 0) { today = min; }
          if (max && compareDay(today, max) > 0) { today = max; }
          applyValue(today, 'today');
          close();
        }));
      }
      if (props.clearable) {
        footerItems.push(footerButton(base.t('date.clear', '清除'), 'kui-picker__footer-btn--clear', function () {
          applyValue(null, 'clear');
          close();
        }));
      }
      if (footerItems.length) { panel.appendChild(makeFooter(footerItems)); }
      return panel;
    }
    function open() {
      if (state.disabled || state.readonly || state.open) { return; }
      var content = buildPanel();
      cal.setViewDate(state.date ? startMonth(state.date) : startMonth(new Date()), true);
      cal.setFocusDate(state.date || clampDate(new Date(), min, max));
      state.open = true;
      sync();
      popup = base.openPopup(parts.trigger, content, {
        placement: 'bottom-start',
        offset: 6,
        width: 292,
        className: 'kui-picker-popup kui-date-popup',
        ignoreOutside: function (t) { return base.contains(parts.box, t); },
        onClose: function () {
          popup = null;
          state.open = false;
          sync();
        }
      });
    }
    function close() {
      if (popup) { popup.close(); }
    }
    function toggle() {
      if (popup) { close(); } else { open(); }
    }

    bindTrigger(parts, {
      disabled: function () { return state.disabled || state.readonly; },
      onToggle: toggle,
      onClear: function () {
        if (state.disabled || state.readonly) { return; }
        applyValue(null, 'clear');
        close();
      },
      onFocus: function () { base.emitFocus(parts.box, ctx, node); },
      onBlur: function () { base.emitBlur(parts.box, ctx, node); }
    });

    sync();

    var impl = {
      getValue: function () { return state.date ? fmtDate(state.date, props.format) : ''; },
      setValue: function (v, opts) {
        var d = base.toDate(v);
        state.date = d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null;
        sync();
        if (!opts || !opts.silent) {
          base.emitChange(parts.box, ctx, node, state.date ? fmtDate(state.date, props.format) : '', { reason: 'set' });
        }
        return api;
      },
      setMin: function (v) { min = base.toDate(v); sync(); return api; },
      setMax: function (v) { max = base.toDate(v); sync(); return api; },
      __disabledHook: function (flag) { state.disabled = !!flag; sync(); if (flag) { close(); } },
      __readonlyHook: function (flag) { state.readonly = !!flag; sync(); if (flag) { close(); } },
      focus: function () { if (parts.trigger.focus) { parts.trigger.focus(); } return api; },
      open: open,
      close: close,
      destroy: function () { close(); }
    };

    var returned = base.finalize(node, ctx, 'date', parts.box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('date', {
    category: 'control',
    defaults: DATE_DEFAULTS,
    render: renderDate,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 2. daterange
   * ============================================================ */

  var DATERANGE_DEFAULTS = {
    value: [],
    format: 'YYYY-MM-DD',
    placeholder: '',
    startPlaceholder: '',
    endPlaceholder: '',
    separator: '',
    clearable: true,
    disabled: false,
    readonly: false,
    min: '',
    max: '',
    weekStart: 1,
    showToday: true,
    size: 'md'
  };

  function renderDaterange(node, ctx) {
    var props = propsOf(node, DATERANGE_DEFAULTS);
    var parts = createTrigger('daterange', 'calendar');
    applySize(parts.box, props.size, 'kui-picker');
    var rawValue = base.isArr(props.value) ? props.value : [];
    var state = {
      start: base.toDate(rawValue[0]),
      end: base.toDate(rawValue[1]),
      hover: null,
      disabled: !!props.disabled,
      readonly: !!props.readonly,
      open: false
    };
    var min = base.toDate(props.min);
    var max = base.toDate(props.max);
    var popup = null;
    var panel = null;
    var leftCal = null;
    var rightCal = null;
    var syncing = false;

    function valueArray() {
      return [
        state.start ? fmtDate(state.start, props.format) : '',
        state.end ? fmtDate(state.end, props.format) : ''
      ];
    }
    function displayParts() {
      base.clear(parts.textEl);
      var ph = props.placeholder || base.t('daterange.placeholder', '选择日期范围');
      if (!state.start && !state.end) {
        parts.textEl.appendChild(base.el('span', { 'class': 'kui-daterange__placeholder', text: ph }));
        return;
      }
      // 开始/结束占位文案与分隔符支持显式覆盖（demo 配置使用 startPlaceholder/endPlaceholder/separator）
      var startPh = props.startPlaceholder || base.t('daterange.start', '开始日期');
      var endPh = props.endPlaceholder || base.t('daterange.end', '结束日期');
      var sepText = props.separator || base.t('daterange.sep', '至');
      parts.textEl.appendChild(base.el('span', {
        'class': 'kui-daterange__part' + (state.start ? '' : ' is-empty'),
        text: state.start ? fmtDate(state.start, props.format) : startPh
      }));
      parts.textEl.appendChild(base.el('span', { 'class': 'kui-daterange__sep', text: sepText }));
      parts.textEl.appendChild(base.el('span', {
        'class': 'kui-daterange__part' + (state.end ? '' : ' is-empty'),
        text: state.end ? fmtDate(state.end, props.format) : endPh
      }));
    }
    function sync() {
      displayParts();
      applyTriggerState(parts, {
        disabled: state.disabled,
        readonly: state.readonly,
        open: state.open,
        hasValue: !!(state.start || state.end),
        clearable: props.clearable
      });
      if (leftCal) { leftCal.rebuild(); }
      if (rightCal) { rightCal.rebuild(); }
    }
    function emit(reason) {
      base.emitChange(parts.box, ctx, node, valueArray(), {
        reason: reason || 'pick',
        start: state.start,
        end: state.end,
        startText: valueArray()[0],
        endText: valueArray()[1]
      });
    }
    function pick(d) {
      var day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (!state.start || (state.start && state.end)) {
        state.start = day;
        state.end = null;
        state.hover = null;
        sync();
        emit('start');
        return;
      }
      if (compareDay(day, state.start) < 0) {
        state.start = day;
        state.end = null;
        sync();
        emit('start');
        return;
      }
      state.end = day;
      state.hover = null;
      sync();
      emit('end');
      close();
    }
    function buildPanel() {
      if (panel) { return panel; }
      panel = base.el('div', { 'class': 'kui-picker-panel kui-daterange-panel' });
      var panels = base.el('div', { 'class': 'kui-daterange__panels' });
      var rangeCfg = {
        weekStart: props.weekStart,
        min: min,
        max: max,
        getSelected: function () { return null; },
        getRange: function () { return { start: state.start, end: state.end, hover: state.hover }; },
        onPick: pick,
        onHover: function (d) {
          if (!state.start || state.end) { return; }
          // 同一天不重复刷新，避免鼠标停在同一格时反复触发
          if (d && state.hover && sameDay(d, state.hover)) { return; }
          state.hover = d;
          // 只 paint class，不重建 42 格 DOM：
          // 重建会在鼠标悬停瞬间替换光标下的节点，真实浏览器里点击会被吞掉。
          if (leftCal) { leftCal.paint(); }
          if (rightCal) { rightCal.paint(); }
        }
      };
      var leftCfg = base.merge({}, rangeCfg, {
        hideNext: true,
        onViewChange: function (v) {
          if (syncing || !rightCal) { return; }
          syncing = true;
          rightCal.setViewDate(new Date(v.year, v.month + 1, 1), true);
          syncing = false;
        }
      });
      var rightCfg = base.merge({}, rangeCfg, {
        hidePrev: true,
        onViewChange: function (v) {
          if (syncing || !leftCal) { return; }
          syncing = true;
          leftCal.setViewDate(new Date(v.year, v.month - 1, 1), true);
          syncing = false;
        }
      });
      leftCal = createCalendar(leftCfg);
      rightCal = createCalendar(rightCfg);
      panels.appendChild(leftCal.el);
      panels.appendChild(rightCal.el);
      panel.appendChild(panels);
      var footerItems = [];
      if (props.showToday) {
        footerItems.push(footerButton(base.t('date.today', '今天'), 'kui-picker__footer-btn--today', function () {
          pick(clampDate(new Date(), min, max));
        }));
      }
      if (props.clearable) {
        footerItems.push(footerButton(base.t('date.clear', '清除'), 'kui-picker__footer-btn--clear', function () {
          state.start = null;
          state.end = null;
          state.hover = null;
          sync();
          emit('clear');
          close();
        }));
      }
      if (footerItems.length) { panel.appendChild(makeFooter(footerItems)); }
      return panel;
    }
    function open() {
      if (state.disabled || state.readonly || state.open) { return; }
      var content = buildPanel();
      syncing = true;
      var baseDate = startMonth(state.start || clampDate(new Date(), min, max));
      leftCal.setViewDate(baseDate, true);
      rightCal.setViewDate(addMonths(baseDate, 1), true);
      syncing = false;
      leftCal.setFocusDate(state.start || clampDate(new Date(), min, max));
      state.open = true;
      sync();
      popup = base.openPopup(parts.trigger, content, {
        placement: 'bottom-start',
        offset: 6,
        width: 604,
        className: 'kui-picker-popup kui-daterange-popup',
        ignoreOutside: function (t) { return base.contains(parts.box, t); },
        onClose: function () {
          popup = null;
          state.open = false;
          state.hover = null;
          sync();
        }
      });
    }
    function close() {
      if (popup) { popup.close(); }
    }
    function toggle() {
      if (popup) { close(); } else { open(); }
    }

    bindTrigger(parts, {
      disabled: function () { return state.disabled || state.readonly; },
      onToggle: toggle,
      onClear: function () {
        if (state.disabled || state.readonly) { return; }
        state.start = null;
        state.end = null;
        state.hover = null;
        sync();
        emit('clear');
        close();
      },
      onFocus: function () { base.emitFocus(parts.box, ctx, node); },
      onBlur: function () { base.emitBlur(parts.box, ctx, node); }
    });

    sync();

    var impl = {
      getValue: function () { return valueArray(); },
      setValue: function (v, opts) {
        var list = base.isArr(v) ? v : (v ? [v, ''] : []);
        state.start = base.toDate(list[0]);
        state.end = base.toDate(list[1]);
        state.hover = null;
        sync();
        if (!opts || !opts.silent) { emit('set'); }
        return api;
      },
      setMin: function (v) { min = base.toDate(v); sync(); return api; },
      setMax: function (v) { max = base.toDate(v); sync(); return api; },
      __disabledHook: function (flag) { state.disabled = !!flag; sync(); if (flag) { close(); } },
      __readonlyHook: function (flag) { state.readonly = !!flag; sync(); if (flag) { close(); } },
      focus: function () { if (parts.trigger.focus) { parts.trigger.focus(); } return api; },
      open: open,
      close: close,
      destroy: function () { close(); }
    };

    var returned = base.finalize(node, ctx, 'daterange', parts.box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('daterange', {
    category: 'control',
    defaults: DATERANGE_DEFAULTS,
    render: renderDaterange,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 3. month
   * ============================================================ */

  var MONTH_DEFAULTS = {
    value: '',
    placeholder: '',
    clearable: true,
    disabled: false,
    readonly: false,
    min: '',
    max: '',
    size: 'md'
  };

  function renderMonth(node, ctx) {
    var props = propsOf(node, MONTH_DEFAULTS);
    var parts = createTrigger('month', 'calendar');
    applySize(parts.box, props.size, 'kui-picker');
    var state = { date: base.toDate(props.value), disabled: !!props.disabled, readonly: !!props.readonly, open: false };
    var min = base.toDate(props.min);
    var max = base.toDate(props.max);
    var popup = null;
    var panel = null;
    var viewYear = (state.date || new Date()).getFullYear();
    var titleEl = null;
    var grid = null;

    function displayText() {
      if (state.date) { return fmtDate(state.date, 'YYYY-MM'); }
      return props.placeholder || base.t('month.placeholder', '选择月份');
    }
    function monthDisabled(year, month) {
      var start = new Date(year, month, 1);
      var end = new Date(year, month + 1, 0);
      if (min && compareDay(end, min) < 0) { return true; }
      if (max && compareDay(start, max) > 0) { return true; }
      return false;
    }
    function rebuild() {
      if (!grid) { return; }
      if (titleEl) { titleEl.textContent = base.t('month.yearTitle', '{{year}} 年', { year: viewYear }); }
      base.clear(grid);
      var today = new Date();
      for (var m = 0; m < 12; m++) {
        var cls = 'kui-month__cell';
        var isSelected = !!state.date && state.date.getFullYear() === viewYear && state.date.getMonth() === m;
        var isCurrent = today.getFullYear() === viewYear && today.getMonth() === m;
        var disabled = monthDisabled(viewYear, m);
        if (isSelected) { cls += ' is-selected'; }
        if (isCurrent) { cls += ' is-today'; }
        if (disabled) { cls += ' is-disabled'; }
        if (state.date && state.date.getFullYear() === viewYear && state.date.getMonth() === m) { cls += ' is-active'; }
        var btn = base.el('button', {
          type: 'button',
          'class': cls,
          'data-month': String(m),
          'aria-selected': isSelected ? 'true' : 'false'
        });
        btn.appendChild(base.el('span', {
          'class': 'kui-month__text',
          text: base.t('date.monthCell', '{{n}} 月', { n: m + 1 })
        }));
        (function (month, isDis) {
          base.on(btn, 'click', function (ev) {
            ev.stopPropagation();
            if (isDis) { return; }
            state.date = new Date(viewYear, month, 1);
            sync();
            base.emitChange(parts.box, ctx, node, fmtDate(state.date, 'YYYY-MM'), {
              reason: 'pick',
              date: state.date
            });
            close();
          });
        })(m, disabled);
        grid.appendChild(btn);
      }
    }
    function sync() {
      parts.textEl.textContent = displayText();
      applyTriggerState(parts, {
        disabled: state.disabled,
        readonly: state.readonly,
        open: state.open,
        hasValue: !!state.date,
        clearable: props.clearable
      });
      rebuild();
    }
    function navMonth(delta) {
      viewYear += delta;
      rebuild();
    }
    function buildPanel() {
      if (panel) { return panel; }
      panel = base.el('div', { 'class': 'kui-picker-panel kui-month-panel' });
      var head = base.el('div', { 'class': 'kui-date__head' });
      var prev = base.el('button', {
        type: 'button',
        'class': 'kui-date__nav kui-date__nav--prev-year',
        'aria-label': base.t('date.prevYear', '上一年')
      });
      prev.appendChild(base.iconEl('chevron-left'));
      prev.appendChild(base.iconEl('chevron-left', 'kui-date__nav-second'));
      var next = base.el('button', {
        type: 'button',
        'class': 'kui-date__nav kui-date__nav--next-year',
        'aria-label': base.t('date.nextYear', '下一年')
      });
      next.appendChild(base.iconEl('chevron-right'));
      next.appendChild(base.iconEl('chevron-right', 'kui-date__nav-second'));
      titleEl = base.el('span', { 'class': 'kui-date__title' });
      base.on(prev, 'click', function (ev) { ev.stopPropagation(); navMonth(-1); });
      base.on(next, 'click', function (ev) { ev.stopPropagation(); navMonth(1); });
      head.appendChild(prev);
      head.appendChild(titleEl);
      head.appendChild(next);
      grid = base.el('div', { 'class': 'kui-month__grid' });
      panel.appendChild(head);
      panel.appendChild(grid);
      var footerItems = [];
      footerItems.push(footerButton(base.t('date.today', '今天'), 'kui-picker__footer-btn--today', function () {
        var d = new Date();
        state.date = new Date(d.getFullYear(), d.getMonth(), 1);
        viewYear = d.getFullYear();
        sync();
        base.emitChange(parts.box, ctx, node, fmtDate(state.date, 'YYYY-MM'), { reason: 'today', date: state.date });
        close();
      }));
      if (props.clearable) {
        footerItems.push(footerButton(base.t('date.clear', '清除'), 'kui-picker__footer-btn--clear', function () {
          state.date = null;
          sync();
          base.emitChange(parts.box, ctx, node, '', { reason: 'clear' });
          close();
        }));
      }
      panel.appendChild(makeFooter(footerItems));
      return panel;
    }
    function open() {
      if (state.disabled || state.readonly || state.open) { return; }
      var content = buildPanel();
      viewYear = (state.date || new Date()).getFullYear();
      state.open = true;
      sync();
      popup = base.openPopup(parts.trigger, content, {
        placement: 'bottom-start',
        offset: 6,
        width: 268,
        className: 'kui-picker-popup kui-month-popup',
        ignoreOutside: function (t) { return base.contains(parts.box, t); },
        onClose: function () {
          popup = null;
          state.open = false;
          sync();
        }
      });
    }
    function close() {
      if (popup) { popup.close(); }
    }
    function toggle() {
      if (popup) { close(); } else { open(); }
    }

    bindTrigger(parts, {
      disabled: function () { return state.disabled || state.readonly; },
      onToggle: toggle,
      onClear: function () {
        if (state.disabled || state.readonly) { return; }
        state.date = null;
        sync();
        base.emitChange(parts.box, ctx, node, '', { reason: 'clear' });
        close();
      },
      onFocus: function () { base.emitFocus(parts.box, ctx, node); },
      onBlur: function () { base.emitBlur(parts.box, ctx, node); }
    });

    sync();

    var impl = {
      getValue: function () { return state.date ? fmtDate(state.date, 'YYYY-MM') : ''; },
      setValue: function (v, opts) {
        var d = base.toDate(v);
        state.date = d ? new Date(d.getFullYear(), d.getMonth(), 1) : null;
        if (state.date) { viewYear = state.date.getFullYear(); }
        sync();
        if (!opts || !opts.silent) {
          base.emitChange(parts.box, ctx, node, state.date ? fmtDate(state.date, 'YYYY-MM') : '', { reason: 'set' });
        }
        return api;
      },
      setMin: function (v) { min = base.toDate(v); sync(); return api; },
      setMax: function (v) { max = base.toDate(v); sync(); return api; },
      __disabledHook: function (flag) { state.disabled = !!flag; sync(); if (flag) { close(); } },
      __readonlyHook: function (flag) { state.readonly = !!flag; sync(); if (flag) { close(); } },
      focus: function () { if (parts.trigger.focus) { parts.trigger.focus(); } return api; },
      open: open,
      close: close,
      destroy: function () { close(); }
    };

    var returned = base.finalize(node, ctx, 'month', parts.box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('month', {
    category: 'control',
    defaults: MONTH_DEFAULTS,
    render: renderMonth,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 4. 时间列（时 / 分 / 秒三列滚动选择器，含内部上下箭头）
   * cfg = {
   *   hour, minute, second, showSeconds,
   *   hourStep, minuteStep, secondStep,
   *   onChange(hour, minute, second, reason)
   * }
   * ============================================================ */

  function pad2(n) {
    return n < 10 ? '0' + String(n) : String(n);
  }

  function createTimeColumns(cfg) {
    cfg = cfg || {};
    var state = {
      hour: Number(cfg.hour) || 0,
      minute: Number(cfg.minute) || 0,
      second: Number(cfg.second) || 0
    };
    var root = base.el('div', { 'class': 'kui-time__cols' });
    var refs = {};
    var units = [
      { key: 'hour', max: 23, step: Math.max(1, Number(cfg.hourStep) || 1), label: base.t('time.hour', '时') },
      { key: 'minute', max: 59, step: Math.max(1, Number(cfg.minuteStep) || 1), label: base.t('time.minute', '分') }
    ];
    if (cfg.showSeconds) {
      units.push({ key: 'second', max: 59, step: Math.max(1, Number(cfg.secondStep) || 1), label: base.t('time.second', '秒') });
    }

    function emit(reason) {
      if (cfg.onChange) { cfg.onChange(state.hour, state.minute, state.second, reason || 'pick'); }
    }
    function setUnit(key, value, reason) {
      state[key] = value;
      sync();
      emit(reason);
    }
    function sync() {
      for (var u = 0; u < units.length; u++) {
        var unit = units[u];
        var ref = refs[unit.key];
        if (!ref) { continue; }
        var current = state[unit.key];
        var best = 0;
        var bestDiff = Infinity;
        for (var i = 0; i < ref.values.length; i++) {
          var diff = Math.abs(ref.values[i] - current);
          if (diff < bestDiff) { bestDiff = diff; best = i; }
        }
        for (var j = 0; j < ref.options.length; j++) {
          base.toggleClass(ref.options[j], 'is-selected', j === best);
          ref.options[j].setAttribute('aria-selected', j === best ? 'true' : 'false');
        }
        ref.list.setAttribute('aria-activedescendant', '');
        if (ref.options[best] && base.scrollIntoView) {
          base.scrollIntoView(ref.list, ref.options[best]);
        }
        base.toggleClass(root, 'is-disabled', !!cfg.disabled);
      }
    }
    function buildColumn(unit) {
      var col = base.el('div', { 'class': 'kui-time__col', 'data-unit': unit.key });
      var up = base.el('button', {
        type: 'button',
        'class': 'kui-time__arrow kui-time__arrow--up',
        'aria-label': base.t('time.increase', '增加{{unit}}', { unit: unit.label })
      });
      up.appendChild(base.iconEl('chevron-up'));
      var down = base.el('button', {
        type: 'button',
        'class': 'kui-time__arrow kui-time__arrow--down',
        'aria-label': base.t('time.decrease', '减少{{unit}}', { unit: unit.label })
      });
      down.appendChild(base.iconEl('chevron-down'));
      var list = base.el('div', { 'class': 'kui-time__list', role: 'listbox', tabindex: '0' });
      list.setAttribute('aria-label', unit.label);
      var options = [];
      var values = [];
      for (var v = 0; v <= unit.max; v += unit.step) {
        values.push(v);
        var opt = base.el('button', {
          type: 'button',
          'class': 'kui-time__option',
          role: 'option',
          'data-value': String(v),
          text: pad2(v)
        });
        (function (value) {
          base.on(opt, 'click', function (ev) {
            ev.stopPropagation();
            if (cfg.disabled) { return; }
            setUnit(unit.key, value, 'pick');
          });
        })(v);
        list.appendChild(opt);
        options.push(opt);
      }
      function shift(dir) {
        if (cfg.disabled) { return; }
        var total = values.length;
        if (!total) { return; }
        var idx = Math.round(state[unit.key] / unit.step);
        if (idx < 0) { idx = 0; }
        if (idx >= total) { idx = total - 1; }
        idx += dir;
        if (idx < 0) { idx = total - 1; }
        if (idx >= total) { idx = 0; }
        setUnit(unit.key, values[idx], 'step');
      }
      base.repeatPress(up, function (kind) { if (kind === 'click' || kind === 'repeat') { shift(1); } });
      base.repeatPress(down, function (kind) { if (kind === 'click' || kind === 'repeat') { shift(-1); } });
      base.on(list, 'keydown', function (ev) {
        var key = ev.key;
        if (key === 'ArrowUp') { ev.preventDefault(); shift(-1); }
        else if (key === 'ArrowDown') { ev.preventDefault(); shift(1); }
        else if (key === 'PageUp') { ev.preventDefault(); for (var i = 0; i < 5; i++) { shift(1); } }
        else if (key === 'PageDown') { ev.preventDefault(); for (var j = 0; j < 5; j++) { shift(-1); } }
        else if (key === 'Home') { ev.preventDefault(); setUnit(unit.key, values[0], 'key'); }
        else if (key === 'End') { ev.preventDefault(); setUnit(unit.key, values[values.length - 1], 'key'); }
      });
      refs[unit.key] = { list: list, options: options, values: values };
      col.appendChild(up);
      col.appendChild(list);
      col.appendChild(down);
      root.appendChild(col);
      return col;
    }
    for (var u = 0; u < units.length; u++) { buildColumn(units[u]); }
    sync();

    return {
      el: root,
      sync: sync,
      getValue: function () { return { hour: state.hour, minute: state.minute, second: state.second }; },
      setValue: function (h, m, s) {
        state.hour = Math.max(0, Math.min(23, Number(h) || 0));
        state.minute = Math.max(0, Math.min(59, Number(m) || 0));
        state.second = Math.max(0, Math.min(59, Number(s) || 0));
        sync();
      },
      setDisabled: function (flag) {
        cfg.disabled = !!flag;
        base.toggleClass(root, 'is-disabled', !!flag);
        var lists = root.querySelectorAll('.kui-time__list');
        for (var i = 0; i < lists.length; i++) { lists[i].setAttribute('tabindex', flag ? '-1' : '0'); }
      }
    };
  }

  /* ============================================================
   * 5. time
   * ============================================================ */

  var TIME_DEFAULTS = {
    value: '',
    format: '',
    placeholder: '',
    clearable: true,
    disabled: false,
    readonly: false,
    showSeconds: true,
    hourStep: 1,
    minuteStep: 1,
    secondStep: 1,
    size: 'md'
  };

  function timeFormat(props) {
    if (props.format) { return props.format; }
    return props.showSeconds ? 'HH:mm:ss' : 'HH:mm';
  }

  function renderTime(node, ctx) {
    var props = propsOf(node, TIME_DEFAULTS);
    var parts = createTrigger('time', 'clock');
    applySize(parts.box, props.size, 'kui-picker');
    var state = { hour: 0, minute: 0, second: 0, hasValue: false, disabled: !!props.disabled, readonly: !!props.readonly, open: false };
    var parsed = base.toDate(props.value);
    if (parsed) {
      state.hour = parsed.getHours();
      state.minute = parsed.getMinutes();
      state.second = parsed.getSeconds();
      state.hasValue = true;
    }
    var popup = null;
    var panel = null;
    var cols = null;

    function timeText() {
      var d = new Date(2000, 0, 1, state.hour, state.minute, state.second);
      return base.formatDate(d, timeFormat(props));
    }
    function displayText() {
      if (state.hasValue) { return timeText(); }
      return props.placeholder || base.t('time.placeholder', '选择时间');
    }
    function sync() {
      parts.textEl.textContent = displayText();
      applyTriggerState(parts, {
        disabled: state.disabled,
        readonly: state.readonly,
        open: state.open,
        hasValue: state.hasValue,
        clearable: props.clearable
      });
      if (cols) {
        cols.setValue(state.hour, state.minute, state.second);
        cols.setDisabled(state.disabled);
      }
    }
    function emit(reason) {
      base.emitChange(parts.box, ctx, node, state.hasValue ? timeText() : '', {
        reason: reason || 'pick',
        hour: state.hour,
        minute: state.minute,
        second: state.second
      });
    }
    function applyColumns(h, m, s) {
      state.hour = h;
      state.minute = m;
      state.second = s;
    }
    function buildPanel() {
      if (panel) { return panel; }
      panel = base.el('div', { 'class': 'kui-picker-panel kui-time-panel' });
      cols = createTimeColumns({
        hour: state.hour,
        minute: state.minute,
        second: state.second,
        showSeconds: props.showSeconds,
        hourStep: props.hourStep,
        minuteStep: props.minuteStep,
        secondStep: props.secondStep,
        onChange: function (h, m, s, reason) {
          applyColumns(h, m, s);
          state.hasValue = true;
          sync();
          emit(reason);
        }
      });
      panel.appendChild(cols.el);
      var footerItems = [];
      footerItems.push(footerButton(base.t('time.now', '此刻'), 'kui-picker__footer-btn--now', function () {
        var now = new Date();
        applyColumns(now.getHours(), now.getMinutes(), now.getSeconds());
        state.hasValue = true;
        sync();
        emit('now');
        close();
      }));
      footerItems.push(footerButton(base.t('time.ok', '确定'), 'kui-picker__footer-btn--primary', function () {
        var v = cols.getValue();
        applyColumns(v.hour, v.minute, v.second);
        if (!state.hasValue) {
          state.hasValue = true;
          emit('ok');
        }
        sync();
        close();
      }));
      if (props.clearable) {
        footerItems.push(footerButton(base.t('date.clear', '清除'), 'kui-picker__footer-btn--clear', function () {
          state.hasValue = false;
          sync();
          emit('clear');
          close();
        }));
      }
      panel.appendChild(makeFooter(footerItems));
      return panel;
    }
    function open() {
      if (state.disabled || state.readonly || state.open) { return; }
      var content = buildPanel();
      var now = new Date();
      cols.setValue(
        state.hasValue ? state.hour : now.getHours(),
        state.hasValue ? state.minute : now.getMinutes(),
        state.hasValue ? state.second : now.getSeconds()
      );
      state.open = true;
      sync();
      popup = base.openPopup(parts.trigger, content, {
        placement: 'bottom-start',
        offset: 6,
        width: 248,
        className: 'kui-picker-popup kui-time-popup',
        ignoreOutside: function (t) { return base.contains(parts.box, t); },
        onClose: function () {
          popup = null;
          state.open = false;
          sync();
        }
      });
    }
    function close() {
      if (popup) { popup.close(); }
    }
    function toggle() {
      if (popup) { close(); } else { open(); }
    }

    bindTrigger(parts, {
      disabled: function () { return state.disabled || state.readonly; },
      onToggle: toggle,
      onClear: function () {
        if (state.disabled || state.readonly) { return; }
        state.hasValue = false;
        sync();
        emit('clear');
        close();
      },
      onFocus: function () { base.emitFocus(parts.box, ctx, node); },
      onBlur: function () { base.emitBlur(parts.box, ctx, node); }
    });

    sync();

    var impl = {
      getValue: function () { return state.hasValue ? timeText() : ''; },
      setValue: function (v, opts) {
        var d = base.toDate(v);
        if (d) {
          applyColumns(d.getHours(), d.getMinutes(), d.getSeconds());
          state.hasValue = true;
        } else if (v === '' || v === null || v === undefined) {
          state.hasValue = false;
        }
        sync();
        if (!opts || !opts.silent) { emit('set'); }
        return api;
      },
      __disabledHook: function (flag) { state.disabled = !!flag; sync(); if (flag) { close(); } },
      __readonlyHook: function (flag) { state.readonly = !!flag; sync(); if (flag) { close(); } },
      focus: function () { if (parts.trigger.focus) { parts.trigger.focus(); } return api; },
      open: open,
      close: close,
      destroy: function () { close(); }
    };

    var returned = base.finalize(node, ctx, 'time', parts.box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('time', {
    category: 'control',
    defaults: TIME_DEFAULTS,
    render: renderTime,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 6. datetime
   * ============================================================ */

  var DATETIME_DEFAULTS = {
    value: '',
    format: 'YYYY-MM-DD HH:mm:ss',
    placeholder: '',
    clearable: true,
    disabled: false,
    readonly: false,
    showSeconds: true,
    hourStep: 1,
    minuteStep: 1,
    secondStep: 1,
    min: '',
    max: '',
    weekStart: 1,
    showToday: true,
    size: 'md'
  };

  function renderDatetime(node, ctx) {
    var props = propsOf(node, DATETIME_DEFAULTS);
    var parts = createTrigger('datetime', 'calendar');
    applySize(parts.box, props.size, 'kui-picker');
    var parsed = base.toDate(props.value);
    var now = new Date();
    var state = {
      date: parsed ? new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) : null,
      hour: parsed ? parsed.getHours() : now.getHours(),
      minute: parsed ? parsed.getMinutes() : now.getMinutes(),
      second: parsed ? parsed.getSeconds() : now.getSeconds(),
      hasValue: !!parsed,
      disabled: !!props.disabled,
      readonly: !!props.readonly,
      open: false
    };
    var min = base.toDate(props.min);
    var max = base.toDate(props.max);
    var popup = null;
    var panel = null;
    var cal = null;
    var cols = null;

    function fullText() {
      var d = new Date(state.date.getFullYear(), state.date.getMonth(), state.date.getDate(),
        state.hour, state.minute, state.second);
      return base.formatDate(d, props.format);
    }
    function displayText() {
      if (state.hasValue && state.date) { return fullText(); }
      return props.placeholder || base.t('datetime.placeholder', '选择日期时间');
    }
    function sync() {
      parts.textEl.textContent = displayText();
      applyTriggerState(parts, {
        disabled: state.disabled,
        readonly: state.readonly,
        open: state.open,
        hasValue: !!(state.hasValue && state.date),
        clearable: props.clearable
      });
      if (cal) { cal.rebuild(); }
      if (cols) {
        cols.setValue(state.hour, state.minute, state.second);
        cols.setDisabled(state.disabled);
      }
    }
    function emit(reason) {
      base.emitChange(parts.box, ctx, node, state.hasValue && state.date ? fullText() : '', {
        reason: reason || 'pick',
        date: state.date,
        hour: state.hour,
        minute: state.minute,
        second: state.second
      });
    }
    function buildPanel() {
      if (panel) { return panel; }
      panel = base.el('div', { 'class': 'kui-picker-panel kui-datetime-panel' });
      cal = createCalendar({
        weekStart: props.weekStart,
        min: min,
        max: max,
        getSelected: function () { return state.date; },
        onPick: function (d) {
          state.date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
          state.hasValue = true;
          sync();
          emit('date');
        }
      });
      panel.appendChild(cal.el);
      var timeSection = base.el('div', { 'class': 'kui-datetime__time' });
      timeSection.appendChild(base.el('div', {
        'class': 'kui-datetime__section-label',
        text: base.t('datetime.timeLabel', '时间')
      }));
      cols = createTimeColumns({
        hour: state.hour,
        minute: state.minute,
        second: state.second,
        showSeconds: props.showSeconds,
        hourStep: props.hourStep,
        minuteStep: props.minuteStep,
        secondStep: props.secondStep,
        onChange: function (h, m, s, reason) {
          state.hour = h;
          state.minute = m;
          state.second = s;
          if (state.date) {
            state.hasValue = true;
            sync();
            emit(reason);
          } else {
            sync();
          }
        }
      });
      timeSection.appendChild(cols.el);
      panel.appendChild(timeSection);
      var footerItems = [];
      footerItems.push(footerButton(base.t('time.now', '此刻'), 'kui-picker__footer-btn--now', function () {
        var d = new Date();
        state.date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        state.hour = d.getHours();
        state.minute = d.getMinutes();
        state.second = d.getSeconds();
        state.hasValue = true;
        sync();
        emit('now');
        close();
      }));
      if (props.clearable) {
        footerItems.push(footerButton(base.t('date.clear', '清除'), 'kui-picker__footer-btn--clear', function () {
          state.date = null;
          state.hasValue = false;
          sync();
          emit('clear');
          close();
        }));
      }
      footerItems.push(footerButton(base.t('time.ok', '确定'), 'kui-picker__footer-btn--primary', function () {
        if (state.date && !state.hasValue) {
          state.hasValue = true;
          emit('ok');
        }
        close();
      }));
      panel.appendChild(makeFooter(footerItems));
      return panel;
    }
    function open() {
      if (state.disabled || state.readonly || state.open) { return; }
      var content = buildPanel();
      cal.setViewDate(state.date ? startMonth(state.date) : startMonth(new Date()), true);
      cal.setFocusDate(state.date || clampDate(new Date(), min, max));
      cols.setValue(state.hour, state.minute, state.second);
      state.open = true;
      sync();
      popup = base.openPopup(parts.trigger, content, {
        placement: 'bottom-start',
        offset: 6,
        width: 304,
        className: 'kui-picker-popup kui-datetime-popup',
        ignoreOutside: function (t) { return base.contains(parts.box, t); },
        onClose: function () {
          popup = null;
          state.open = false;
          sync();
        }
      });
    }
    function close() {
      if (popup) { popup.close(); }
    }
    function toggle() {
      if (popup) { close(); } else { open(); }
    }

    bindTrigger(parts, {
      disabled: function () { return state.disabled || state.readonly; },
      onToggle: toggle,
      onClear: function () {
        if (state.disabled || state.readonly) { return; }
        state.date = null;
        state.hasValue = false;
        sync();
        emit('clear');
        close();
      },
      onFocus: function () { base.emitFocus(parts.box, ctx, node); },
      onBlur: function () { base.emitBlur(parts.box, ctx, node); }
    });

    sync();

    var impl = {
      getValue: function () { return state.hasValue && state.date ? fullText() : ''; },
      setValue: function (v, opts) {
        var d = base.toDate(v);
        if (d) {
          state.date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
          state.hour = d.getHours();
          state.minute = d.getMinutes();
          state.second = d.getSeconds();
          state.hasValue = true;
        } else {
          state.date = null;
          state.hasValue = false;
        }
        sync();
        if (!opts || !opts.silent) { emit('set'); }
        return api;
      },
      __disabledHook: function (flag) { state.disabled = !!flag; sync(); if (flag) { close(); } },
      __readonlyHook: function (flag) { state.readonly = !!flag; sync(); if (flag) { close(); } },
      focus: function () { if (parts.trigger.focus) { parts.trigger.focus(); } return api; },
      open: open,
      close: close,
      destroy: function () { close(); }
    };

    var returned = base.finalize(node, ctx, 'datetime', parts.box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('datetime', {
    category: 'control',
    defaults: DATETIME_DEFAULTS,
    render: renderDatetime,
    api: function (el) { return el.__kuiControl; }
  });

})(typeof window !== 'undefined' ? window : this);

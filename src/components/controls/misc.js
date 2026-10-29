/*!
 * KurumiUI - controls/misc.js
 * 展示 / 数据 / 布局类控件：
 * tag / badge / divider / link / icon / text / alert /
 * table / pagination / upload / field
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

  function propsOf(node, defaults) {
    return base.merge({}, defaults, base.getProps(node));
  }
  function applySize(root, size, prefix) {
    if (!size || size === 'md') { return; }
    base.addClass(root, prefix + '--' + size);
  }
  function num(v, fallback) {
    var n = Number(v);
    return isNaN(n) ? fallback : n;
  }
  function str(v) {
    return v === null || v === undefined ? '' : String(v);
  }
  function isTrue(v) {
    return !!v;
  }
  // 允许 props 里写 #hex / rgb() / var(--x) 或语义 token 名（accent / danger ...）
  function colorValue(v) {
    if (!v) { return ''; }
    var s = String(v);
    if (/^(#|rgb|hsl|var\(|linear-gradient)/.test(s)) { return s; }
    return base.token(s);
  }
  function textContentOf(props) {
    if (props.text !== undefined && props.text !== null) { return str(props.text); }
    return '';
  }

  /* ============================================================
   * 1. tag
   * ============================================================ */

  var TAG_DEFAULTS = {
    text: '',
    type: 'default',
    size: 'md',
    closable: false,
    round: false,
    plain: false,
    icon: '',
    color: ''
  };

  function renderTag(node, ctx) {
    var props = propsOf(node, TAG_DEFAULTS);
    var state = {
      text: textContentOf(props),
      type: props.type || 'default',
      closable: isTrue(props.closable),
      closed: false
    };
    var box = base.el('span', { 'class': 'kui-tag kui-tag--' + state.type });
    applySize(box, props.size, 'kui-tag');
    if (props.round) { base.addClass(box, 'is-round'); }
    if (props.plain) { base.addClass(box, 'is-plain'); }
    if (props.color) {
      box.style.color = colorValue(props.color);
      base.addClass(box, 'is-custom-color');
    }

    var iconEl = null;
    function syncIcon() {
      if (props.icon && !iconEl) {
        iconEl = base.iconEl(props.icon, 'kui-tag__icon');
        box.insertBefore(iconEl, label);
      }
    }
    var label = base.el('span', { 'class': 'kui-tag__text', text: state.text });
    box.appendChild(label);
    syncIcon();

    var closeBtn = null;
    function syncClosable() {
      if (state.closable && !closeBtn) {
        closeBtn = base.el('button', {
          type: 'button',
          'class': 'kui-tag__close',
          'aria-label': base.t('tag.close', '移除标签')
        });
        closeBtn.appendChild(base.iconEl('close', 'kui-tag__close-icon'));
        base.on(closeBtn, 'click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          close();
        });
        box.appendChild(closeBtn);
        base.addClass(box, 'is-closable');
      } else if (!state.closable && closeBtn) {
        base.remove(closeBtn);
        closeBtn = null;
        base.removeClass(box, 'is-closable');
      }
    }
    function close() {
      if (state.closed) { return; }
      state.closed = true;
      base.emitAction(box, ctx, node, 'close', {});
      var handler = (node && node.on && node.on.close) || (node && node.props && node.props.closeAction);
      if (handler) { base.dispatchAction(handler, ctx, box, node, {}); }
      base.addClass(box, 'is-closed');
      box.style.display = 'none';
    }
    syncClosable();

    var impl = {
      getValue: function () { return state.text; },
      setValue: function (v, opts) {
        state.text = str(v);
        label.textContent = state.text;
        if (!opts || !opts.silent) { base.emitChange(box, ctx, node, state.text, { reason: 'set' }); }
        return api;
      },
      setText: function (v) { return impl.setValue(v, { silent: true }); },
      setType: function (type) {
        base.removeClass(box, 'kui-tag--' + state.type);
        state.type = type || 'default';
        base.addClass(box, 'kui-tag--' + state.type);
        return api;
      },
      setClosable: function (flag) {
        state.closable = !!flag;
        syncClosable();
        return api;
      },
      close: close,
      setDisabled: function () { return api; },
      setReadonly: function () { return api; },
      focus: function () {
        if (closeBtn && state.closable) { closeBtn.focus(); }
        return api;
      },
      destroy: function () { }
    };

    var returned = base.finalize(node, ctx, 'tag', box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('tag', {
    category: 'display',
    defaults: TAG_DEFAULTS,
    render: renderTag,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 2. badge
   * ============================================================ */

  var BADGE_DEFAULTS = {
    text: '',
    count: 0,
    max: 99,
    dot: false,
    type: 'danger',
    size: 'md',
    showZero: false
  };

  function renderBadge(node, ctx) {
    var props = propsOf(node, BADGE_DEFAULTS);
    var state = {
      text: textContentOf(props),
      count: num(props.count, 0),
      max: num(props.max, 99),
      dot: !!props.dot,
      type: props.type || 'danger',
      showZero: !!props.showZero
    };
    var box = base.el('span', { 'class': 'kui-badge kui-badge--' + state.type });
    applySize(box, props.size, 'kui-badge');
    var label = base.el('span', { 'class': 'kui-badge__text' });
    box.appendChild(label);

    function badgeText() {
      if (state.dot) { return ''; }
      if (state.text !== '') { return state.text; }
      var c = state.count;
      if (c <= 0 && !state.showZero) { return ''; }
      if (state.max > 0 && c > state.max) { return state.max + '+'; }
      return String(c);
    }
    function sync() {
      var txt = badgeText();
      label.textContent = txt;
      base.toggleClass(box, 'is-dot', state.dot);
      base.toggleClass(box, 'is-empty', txt === '' && !state.dot);
      box.setAttribute('aria-hidden', txt === '' && !state.dot ? 'true' : 'false');
      if (state.dot) { box.setAttribute('aria-label', base.t('badge.dot', '有新的内容')); }
    }
    sync();

    var impl = {
      getValue: function () { return state.text !== '' ? state.text : state.count; },
      setValue: function (v) {
        if (typeof v === 'number') { state.count = v; state.text = ''; }
        else { state.text = v === null || v === undefined ? '' : str(v); }
        sync();
        return api;
      },
      setCount: function (v) { state.count = num(v, 0); state.text = ''; sync(); return api; },
      setType: function (type) {
        base.removeClass(box, 'kui-badge--' + state.type);
        state.type = type || 'danger';
        base.addClass(box, 'kui-badge--' + state.type);
        return api;
      },
      setDot: function (flag) { state.dot = !!flag; sync(); return api; },
      setDisabled: function () { return api; },
      setReadonly: function () { return api; },
      focus: function () { return api; },
      destroy: function () { }
    };

    var returned = base.finalize(node, ctx, 'badge', box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('badge', {
    category: 'display',
    defaults: BADGE_DEFAULTS,
    render: renderBadge,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 3. divider
   * ============================================================ */

  var DIVIDER_DEFAULTS = {
    orientation: 'horizontal',
    text: '',
    textPosition: 'center',
    dashed: false,
    plain: false
  };

  function renderDivider(node, ctx) {
    var props = propsOf(node, DIVIDER_DEFAULTS);
    var vertical = props.orientation === 'vertical';
    var box = base.el(vertical ? 'div' : 'div', {
      'class': 'kui-divider' + (vertical ? ' is-vertical' : ' is-horizontal')
    });
    box.setAttribute('role', 'separator');
    if (props.dashed) { base.addClass(box, 'is-dashed'); }
    if (props.plain) { base.addClass(box, 'is-plain'); }
    if (vertical) {
      box.setAttribute('aria-orientation', 'vertical');
    } else {
      box.setAttribute('aria-orientation', 'horizontal');
      var text = str(props.text);
      if (text) {
        var pos = props.textPosition || 'center';
        if (['left', 'right', 'center'].indexOf(pos) < 0) { pos = 'center'; }
        base.addClass(box, 'kui-divider--text-' + pos);
        var lineA = base.el('span', { 'class': 'kui-divider__line' });
        var textEl = base.el('span', { 'class': 'kui-divider__text', text: text });
        var lineB = base.el('span', { 'class': 'kui-divider__line' });
        box.appendChild(lineA);
        box.appendChild(textEl);
        box.appendChild(lineB);
        box.__kuiTextEl = textEl;
      } else {
        base.addClass(box, 'kui-divider--line');
      }
    }

    var impl = {
      getValue: function () { return str(props.text); },
      setValue: function (v) {
        if (box.__kuiTextEl) { box.__kuiTextEl.textContent = str(v); }
        return api;
      },
      setDisabled: function () { return api; },
      setReadonly: function () { return api; },
      focus: function () { return api; },
      destroy: function () { }
    };

    var returned = base.finalize(node, ctx, 'divider', box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('divider', {
    category: 'layout',
    defaults: DIVIDER_DEFAULTS,
    render: renderDivider,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 4. link
   * ============================================================ */

  var LINK_DEFAULTS = {
    text: '',
    href: '',
    target: '',
    type: 'default',
    underline: false,
    disabled: false,
    icon: '',
    iconPosition: 'right'
  };

  function renderLink(node, ctx) {
    var props = propsOf(node, LINK_DEFAULTS);
    var state = {
      text: textContentOf(props),
      type: props.type || 'default',
      disabled: !!props.disabled
    };
    var box = base.el('a', { 'class': 'kui-link kui-link--' + state.type });
    if (props.href) {
      box.setAttribute('href', props.href);
      if (props.target) {
        box.setAttribute('target', props.target);
        if (props.target === '_blank') { box.setAttribute('rel', 'noopener noreferrer'); }
      }
    } else {
      box.setAttribute('href', 'javascript:void(0)');
      box.setAttribute('role', 'link');
    }
    box.setAttribute('tabindex', '0');
    if (props.underline) { base.addClass(box, 'is-underline'); }

    var iconEl = null;
    function syncIcon() {
      if (props.icon && !iconEl) {
        iconEl = base.iconEl(props.icon, 'kui-link__icon');
        if (props.iconPosition === 'left') { box.insertBefore(iconEl, label); }
        else { box.appendChild(iconEl); }
      }
    }
    var label = base.el('span', { 'class': 'kui-link__text', text: state.text });
    box.appendChild(label);
    syncIcon();

    function sync() {
      base.toggleClass(box, 'is-disabled', state.disabled);
      box.setAttribute('aria-disabled', state.disabled ? 'true' : 'false');
      if (state.disabled) { box.setAttribute('tabindex', '-1'); }
      else { box.setAttribute('tabindex', '0'); }
      label.textContent = state.text;
    }
    sync();

    function activate(ev) {
      if (state.disabled) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      var handler = (node && node.on && node.on.click) || (node && node.props && node.props.clickAction) || (node && node.props && node.props.action);
      base.emitAction(box, ctx, node, 'click', {});
      if (handler) {
        ev.preventDefault();
        base.dispatchAction(handler, ctx, box, node, {});
      }
    }
    base.on(box, 'click', activate);
    base.on(box, 'keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
        ev.preventDefault();
        activate(ev);
      }
    });

    var impl = {
      getValue: function () { return state.text; },
      setValue: function (v, opts) {
        state.text = str(v);
        sync();
        if (!opts || !opts.silent) { base.emitChange(box, ctx, node, state.text, { reason: 'set' }); }
        return api;
      },
      setText: function (v) { return impl.setValue(v, { silent: true }); },
      setHref: function (href) {
        if (href) { box.setAttribute('href', href); }
        else { box.setAttribute('href', 'javascript:void(0)'); }
        return api;
      },
      setType: function (type) {
        base.removeClass(box, 'kui-link--' + state.type);
        state.type = type || 'default';
        base.addClass(box, 'kui-link--' + state.type);
        return api;
      },
      __disabledHook: function (flag) { state.disabled = !!flag; sync(); },
      setDisabled: function (flag) { state.disabled = !!flag; sync(); return api; },
      setReadonly: function () { return api; },
      focus: function () { if (box.focus) { box.focus(); } return api; },
      destroy: function () { }
    };

    var returned = base.finalize(node, ctx, 'link', box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('link', {
    category: 'action',
    defaults: LINK_DEFAULTS,
    render: renderLink,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 5. icon
   * ============================================================ */

  var ICON_DEFAULTS = {
    name: '',
    size: 'md',
    color: '',
    rotate: 0,
    spin: false
  };

  function renderIcon(node, ctx) {
    var props = propsOf(node, ICON_DEFAULTS);
    var state = { name: props.name || '', size: props.size || 'md', spin: !!props.spin, rotate: num(props.rotate, 0) };
    var box = base.el('span', { 'class': 'kui-iconbox' });
    applySize(box, state.size, 'kui-iconbox');
    if (state.spin) { base.addClass(box, 'is-spin'); }
    if (props.color) { box.style.color = colorValue(props.color); }
    function applyRotate() {
      if (state.rotate) { box.style.transform = 'rotate(' + state.rotate + 'deg)'; }
      else { box.style.transform = ''; }
    }
    applyRotate();

    var svg = null;
    function syncIcon() {
      if (svg) { base.remove(svg); svg = null; }
      if (!state.name) { return; }
      svg = base.iconEl(state.name, 'kui-iconbox__svg');
      box.appendChild(svg);
    }
    syncIcon();

    var impl = {
      getValue: function () { return state.name; },
      setValue: function (v) { return impl.setIcon(v); },
      setIcon: function (name) {
        state.name = name || '';
        syncIcon();
        return api;
      },
      setSize: function (size) {
        base.removeClass(box, 'kui-iconbox--' + state.size);
        state.size = size || 'md';
        applySize(box, state.size, 'kui-iconbox');
        return api;
      },
      setColor: function (color) {
        box.style.color = color ? colorValue(color) : '';
        return api;
      },
      setSpin: function (flag) { state.spin = !!flag; base.toggleClass(box, 'is-spin', state.spin); return api; },
      setRotate: function (deg) { state.rotate = num(deg, 0); applyRotate(); return api; },
      setDisabled: function () { return api; },
      setReadonly: function () { return api; },
      focus: function () { return api; },
      destroy: function () { }
    };

    var returned = base.finalize(node, ctx, 'icon', box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('icon', {
    category: 'display',
    defaults: ICON_DEFAULTS,
    render: renderIcon,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 6. text
   * ============================================================ */

  var TEXT_DEFAULTS = {
    text: '',
    type: 'default',
    size: 'md',
    weight: '',
    align: '',
    truncate: false,
    lines: 0,
    block: false,
    tag: '',
    code: false
  };

  var TEXT_TYPES = { primary: 1, success: 1, warning: 1, danger: 1, info: 1, secondary: 1, muted: 1 };
  var TEXT_SIZES = { xs: 1, sm: 1, lg: 1, xl: 1, '2xl': 1 };

  function renderText(node, ctx) {
    var props = propsOf(node, TEXT_DEFAULTS);
    var tag = props.tag || (props.block ? 'div' : 'span');
    var box = base.el(tag, { 'class': 'kui-text' });
    if (props.type && props.type !== 'default' && TEXT_TYPES[props.type]) {
      base.addClass(box, 'kui-text--' + props.type);
    }
    if (props.size && props.size !== 'md' && TEXT_SIZES[props.size]) {
      base.addClass(box, 'kui-text--' + props.size);
    }
    if (props.weight) { base.addClass(box, 'is-weight-' + props.weight); }
    if (props.align) { box.style.textAlign = props.align; }
    if (props.truncate) { base.addClass(box, 'is-truncate'); }
    var lines = num(props.lines, 0);
    if (lines > 1) {
      base.addClass(box, 'is-multiline');
      box.style.webkitLineClamp = String(lines);
      box.style.display = '-webkit-box';
      box.style.webkitBoxOrient = 'vertical';
      box.style.overflow = 'hidden';
    }
    var textEl;
    if (props.code) {
      textEl = base.el('code', { 'class': 'kui-text__code', text: textContentOf(props) });
    } else {
      textEl = base.el('span', { 'class': 'kui-text__inner', text: textContentOf(props) });
    }
    box.appendChild(textEl);

    var impl = {
      getValue: function () { return textEl.textContent; },
      setValue: function (v, opts) {
        textEl.textContent = str(v);
        if (!opts || !opts.silent) { base.emitChange(box, ctx, node, textEl.textContent, { reason: 'set' }); }
        return api;
      },
      setText: function (v) { return impl.setValue(v, { silent: true }); },
      setType: function (type) {
        var keys = ['primary', 'success', 'warning', 'danger', 'info', 'secondary', 'muted'];
        for (var i = 0; i < keys.length; i++) { base.removeClass(box, 'kui-text--' + keys[i]); }
        if (type && type !== 'default' && TEXT_TYPES[type]) { base.addClass(box, 'kui-text--' + type); }
        return api;
      },
      setDisabled: function () { return api; },
      setReadonly: function () { return api; },
      focus: function () { return api; },
      destroy: function () { }
    };

    var returned = base.finalize(node, ctx, 'text', box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('text', {
    category: 'display',
    defaults: TEXT_DEFAULTS,
    render: renderText,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 7. alert
   * ============================================================ */

  var ALERT_DEFAULTS = {
    type: 'info',
    title: '',
    text: '',
    closable: true,
    showIcon: true,
    banner: false
  };

  var ALERT_ICONS = { info: 'info', success: 'success', warning: 'warning', danger: 'error', error: 'error' };

  function renderAlert(node, ctx) {
    var props = propsOf(node, ALERT_DEFAULTS);
    var state = {
      type: props.type && ALERT_ICONS[props.type] ? props.type : 'info',
      title: str(props.title),
      text: textContentOf(props),
      closable: !!props.closable,
      closed: false
    };
    var box = base.el('div', { 'class': 'kui-alert kui-alert--' + state.type });
    box.setAttribute('role', 'alert');
    if (props.banner) { base.addClass(box, 'is-banner'); }

    var iconWrap = null;
    if (props.showIcon) {
      iconWrap = base.el('span', { 'class': 'kui-alert__icon' });
      iconWrap.appendChild(base.iconEl(ALERT_ICONS[state.type], 'kui-alert__icon-svg'));
      box.appendChild(iconWrap);
    }
    var content = base.el('div', { 'class': 'kui-alert__content' });
    var titleEl = base.el('div', { 'class': 'kui-alert__title', text: state.title });
    var descEl = base.el('div', { 'class': 'kui-alert__desc', text: state.text });
    if (!state.title) { titleEl.style.display = 'none'; }
    if (!state.text) { descEl.style.display = 'none'; }
    content.appendChild(titleEl);
    content.appendChild(descEl);
    box.appendChild(content);

    var closeBtn = null;
    function syncClosable() {
      if (state.closable && !closeBtn) {
        closeBtn = base.el('button', {
          type: 'button',
          'class': 'kui-alert__close',
          'aria-label': base.t('alert.close', '关闭提示')
        });
        closeBtn.appendChild(base.iconEl('close', 'kui-alert__close-icon'));
        base.on(closeBtn, 'click', function (ev) {
          ev.preventDefault();
          close();
        });
        box.appendChild(closeBtn);
      } else if (!state.closable && closeBtn) {
        base.remove(closeBtn);
        closeBtn = null;
      }
    }
    function close() {
      if (state.closed) { return; }
      state.closed = true;
      base.emitAction(box, ctx, node, 'close', { type: state.type });
      var handler = (node && node.on && node.on.close) || (node && node.props && node.props.closeAction);
      if (handler) { base.dispatchAction(handler, ctx, box, node, {}); }
      base.addClass(box, 'is-closed');
      box.style.display = 'none';
    }
    syncClosable();

    function sync() {
      base.removeClass(box, 'kui-alert--info');
      base.removeClass(box, 'kui-alert--success');
      base.removeClass(box, 'kui-alert--warning');
      base.removeClass(box, 'kui-alert--danger');
      base.addClass(box, 'kui-alert--' + state.type);
      if (iconWrap) {
        base.clear(iconWrap);
        iconWrap.appendChild(base.iconEl(ALERT_ICONS[state.type], 'kui-alert__icon-svg'));
      }
      titleEl.textContent = state.title;
      titleEl.style.display = state.title ? '' : 'none';
      descEl.textContent = state.text;
      descEl.style.display = state.text ? '' : 'none';
    }
    sync();

    var impl = {
      getValue: function () { return state.text; },
      setValue: function (v, opts) {
        state.text = str(v);
        sync();
        if (!opts || !opts.silent) { base.emitChange(box, ctx, node, state.text, { reason: 'set' }); }
        return api;
      },
      setType: function (type) {
        state.type = type && ALERT_ICONS[type] ? type : 'info';
        sync();
        return api;
      },
      setTitle: function (t2) { state.title = str(t2); sync(); return api; },
      setClosable: function (flag) { state.closable = !!flag; syncClosable(); return api; },
      close: close,
      setDisabled: function () { return api; },
      setReadonly: function () { return api; },
      focus: function () { if (closeBtn) { closeBtn.focus(); } return api; },
      destroy: function () { }
    };

    var returned = base.finalize(node, ctx, 'alert', box, impl, {});
    var api = returned.__kuiControl;
    return returned;
  }

  define('alert', {
    category: 'feedback',
    defaults: ALERT_DEFAULTS,
    render: renderAlert,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 8. table
   * ============================================================ */

  var TABLE_DEFAULTS = {
    columns: [],
    data: [],
    rows: [],
    bordered: false,
    striped: true,
    hoverable: true,
    size: 'md',
    loading: false,
    emptyText: '',
    showHeader: true,
    rowKey: 'id',
    maxHeight: 0
  };

  function normColumns(list) {
    var out = [];
    base.each(base.isArr(list) ? list : [], function (col) {
      if (base.isStr(col) || base.isNum(col)) {
        out.push({ key: str(col), title: str(col), width: '', align: '', formatter: null, render: null });
        return;
      }
      if (!base.isObj(col)) { return; }
      var key = col.key !== undefined ? col.key : (col.prop !== undefined ? col.prop : col.dataIndex);
      var title = col.title !== undefined ? col.title : (col.label !== undefined ? col.label : key);
      out.push({
        key: key,
        title: title === undefined || title === null ? '' : str(title),
        width: col.width || '',
        align: col.align || '',
        formatter: base.isFn(col.formatter) ? col.formatter : null,
        render: base.isFn(col.render) ? col.render : null
      });
    });
    return out;
  }

  function cellValue(row, col) {
    if (!row) { return ''; }
    var v = col.key === undefined || col.key === null ? '' : base.deepGet(row, col.key);
    if (v === undefined || v === null) { return ''; }
    return v;
  }

  function renderTable(node, ctx) {
    var props = propsOf(node, TABLE_DEFAULTS);
    var state = {
      columns: normColumns(props.columns),
      rows: base.isArr(props.data) && props.data.length ? props.data : (base.isArr(props.rows) ? props.rows : []),
      loading: !!props.loading,
      bounded: false
    };
    var box = base.el('div', { 'class': 'kui-table' });
    applySize(box, props.size, 'kui-table');
    if (props.bordered) { base.addClass(box, 'is-bordered'); }
    if (props.striped) { base.addClass(box, 'is-striped'); }
    if (props.hoverable) { base.addClass(box, 'is-hoverable'); }
    box.setAttribute('role', 'table');
    var wrap = base.el('div', { 'class': 'kui-table__wrap' });
    var tableEl = base.el('table', { 'class': 'kui-table__table' });
    var thead = base.el('thead', { 'class': 'kui-table__head' });
    var headRow = base.el('tr', { 'class': 'kui-table__head-row' });
    thead.appendChild(headRow);
    var tbody = base.el('tbody', { 'class': 'kui-table__body' });
    tableEl.appendChild(thead);
    tableEl.appendChild(tbody);
    wrap.appendChild(tableEl);
    box.appendChild(wrap);
    if (props.maxHeight) {
      wrap.style.maxHeight = (base.isNum(props.maxHeight) ? props.maxHeight + 'px' : String(props.maxHeight));
    }
    var loadingEl = base.el('div', { 'class': 'kui-table__loading' });
    loadingEl.appendChild(base.iconEl('refresh', 'kui-table__spinner'));
    loadingEl.appendChild(base.el('span', { 'class': 'kui-table__loading-text', text: base.t('table.loading', '加载中…') }));
    box.appendChild(loadingEl);

    function emptyText() {
      return props.emptyText || base.t('table.empty', '暂无数据');
    }

    function syncHead() {
      base.clear(headRow);
      base.each(state.columns, function (col) {
        var th = base.el('th', { 'class': 'kui-table__th' });
        th.setAttribute('scope', 'col');
        if (col.width) { th.style.width = base.isNum(col.width) ? col.width + 'px' : String(col.width); }
        if (col.align) { base.addClass(th, 'is-' + col.align); }
        th.textContent = str(col.title);
        headRow.appendChild(th);
      });
      thead.style.display = props.showHeader && state.columns.length ? '' : 'none';
    }

    function makeRow(row, index) {
      var tr = base.el('tr', { 'class': 'kui-table__row' });
      tr.setAttribute('data-row-index', String(index));
      tr.setAttribute('tabindex', '0');
      base.each(state.columns, function (col) {
        var td = base.el('td', { 'class': 'kui-table__td' });
        if (col.align) { base.addClass(td, 'is-' + col.align); }
        var value = cellValue(row, col);
        var rendered = null;
        try {
          if (col.render) { rendered = col.render(value, row, index); }
          else if (col.formatter) { rendered = col.formatter(value, row, index); }
        } catch (e) { rendered = null; }
        if (rendered && rendered.nodeType) { td.appendChild(rendered); }
        else if (rendered !== null && rendered !== undefined && rendered !== value) { td.textContent = str(rendered); }
        else { td.textContent = str(value); }
        tr.appendChild(td);
      });
      base.on(tr, 'click', function () {
        base.emitAction(tr, ctx, node, 'rowClick', { row: row, index: index });
        var handler = (node && node.on && node.on.rowClick) || (node && node.props && node.props.rowClickAction);
        if (handler) { base.dispatchAction(handler, ctx, tr, node, { row: row, index: index }); }
      });
      base.on(tr, 'keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          base.emitAction(tr, ctx, node, 'rowClick', { row: row, index: index, keyboard: true });
        }
      });
      return tr;
    }

    function syncBody() {
      base.clear(tbody);
      if (!state.rows.length) {
        var tr = base.el('tr', { 'class': 'kui-table__empty-row' });
        var td = base.el('td', { 'class': 'kui-table__empty', text: emptyText() });
        td.setAttribute('colspan', String(Math.max(1, state.columns.length)));
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }
      base.each(state.rows, function (row, index) { tbody.appendChild(makeRow(row, index)); });
    }

    function sync() {
      state.bounded = !!props.maxHeight;
      base.toggleClass(box, 'is-loading', state.loading);
      base.toggleClass(box, 'is-empty', state.rows.length === 0);
      loadingEl.style.display = state.loading ? '' : 'none';
      syncHead();
      syncBody();
    }
    sync();

    var impl = {
      getValue: function () {
        var out = [];
        base.each(state.rows, function (row) {
          if (row && typeof row === 'object' && props.rowKey && row[props.rowKey] !== undefined) {
            out.push(row[props.rowKey]);
          } else {
            out.push(row);
          }
        });
        return out;
      },
      setValue: function (rows) { return impl.setData(rows); },
      setData: function (rows) {
        state.rows = base.isArr(rows) ? rows : [];
        sync();
        base.emitChange(box, ctx, node, impl.getValue(), { reason: 'set' });
        return api;
      },
      getData: function () { return state.rows.slice(); },
      setColumns: function (cols) {
        state.columns = normColumns(cols);
        sync();
        return api;
      },
      getColumns: function () { return state.columns.slice(); },
      setLoading: function (flag) {
        state.loading = !!flag;
        sync();
        return api;
      },
      setDisabled: function () { return api; },
      setReadonly: function () { return api; },
      focus: function () { if (tableEl.focus) { tableEl.focus(); } return api; },
      destroy: function () { }
    };

    var returned = base.finalize(node, ctx, 'table', box, impl, { selfWrap: false });
    var api = returned.__kuiControl;
    return returned;
  }

  define('table', {
    category: 'data',
    defaults: TABLE_DEFAULTS,
    render: renderTable,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 9. pagination
   * ============================================================ */

  var PAGINATION_DEFAULTS = {
    page: 1,
    pageSize: 10,
    total: 0,
    pageSizes: [10, 20, 50, 100],
    simple: false,
    showTotal: true,
    showJumper: false,
    showSizer: false,
    size: 'md',
    maxButtons: 7,
    prevText: '',
    nextText: ''
  };

  function buildPageList(current, count, max) {
    var out = [];
    if (count <= 0) { return out; }
    if (max < 5) { max = 5; }
    if (count <= max) {
      for (var i = 1; i <= count; i++) { out.push(i); }
      return out;
    }
    var side = Math.floor((max - 3) / 2);
    var start;
    var end;
    if (current <= max - 3) {
      start = 2;
      end = max - 2;
    } else if (current >= count - (max - 4)) {
      start = count - (max - 3);
      end = count - 1;
    } else {
      start = current - side;
      end = current + side;
    }
    if (start < 2) { start = 2; }
    if (end > count - 1) { end = count - 1; }
    out.push(1);
    if (start > 2) { out.push('...'); }
    for (var j = start; j <= end; j++) { out.push(j); }
    if (end < count - 1) { out.push('...'); }
    out.push(count);
    return out;
  }

  function renderPagination(node, ctx) {
    var props = propsOf(node, PAGINATION_DEFAULTS);
    var state = {
      page: Math.max(1, num(props.page, 1)),
      pageSize: Math.max(1, num(props.pageSize, 10)),
      total: Math.max(0, num(props.total, 0))
    };
    var box = base.el('nav', { 'class': 'kui-pagination', 'aria-label': base.t('pagination.label', '分页') });
    applySize(box, props.size, 'kui-pagination');
    if (props.simple) { base.addClass(box, 'is-simple'); }

    var totalEl = base.el('span', { 'class': 'kui-pagination__total' });
    var prevBtn = base.el('button', {
      type: 'button',
      'class': 'kui-pagination__btn kui-pagination__prev',
      'aria-label': props.prevText || base.t('pagination.prev', '上一页')
    });
    prevBtn.appendChild(base.iconEl('chevron-left', 'kui-pagination__arrow'));
    var pagesEl = base.el('span', { 'class': 'kui-pagination__pages' });
    var nextBtn = base.el('button', {
      type: 'button',
      'class': 'kui-pagination__btn kui-pagination__next',
      'aria-label': props.nextText || base.t('pagination.next', '下一页')
    });
    nextBtn.appendChild(base.iconEl('chevron-right', 'kui-pagination__arrow'));
    var sizerEl = null;
    var sizerDd = null;
    var jumperEl = null;

    box.appendChild(totalEl);
    box.appendChild(prevBtn);
    box.appendChild(pagesEl);
    box.appendChild(nextBtn);

    function pageCount() {
      return Math.max(1, Math.ceil(state.total / state.pageSize));
    }
    function emit(reason) {
      base.emitChange(box, ctx, node, { page: state.page, pageSize: state.pageSize, total: state.total }, {
        reason: reason || 'page',
        page: state.page,
        pageSize: state.pageSize
      });
    }
    function go(page, reason) {
      var count = pageCount();
      var target = num(page, 1);
      if (typeof target !== 'number' || isNaN(target)) { target = 1; }
      target = Math.max(1, Math.min(count, Math.round(target)));
      if (target === state.page) { sync(); return; }
      state.page = target;
      sync();
      emit(reason || 'page');
    }

    function buildSizer() {
      if (!props.showSizer || sizerEl) { return; }
      var items = [];
      base.each(props.pageSizes || PAGINATION_DEFAULTS.pageSizes, function (size) {
        var n = num(size, 0);
        if (n <= 0) { return; }
        items.push({ value: String(n), label: base.t('pagination.pageSizeOption', '{{size}} 条/页', { size: n }) });
      });
      var label = base.t('pagination.pageSize', '每页条数');
      /* v1.4.2：原生 select 的 option 弹层无法换肤，统一改为主题化下拉 */
      if (KUI.dropdown) {
        sizerEl = base.el('button', { type: 'button', 'class': 'kui-pagination__sizer', 'aria-label': label });
        sizerDd = KUI.dropdown(sizerEl, items, {
          value: String(state.pageSize),
          ariaLabel: label,
          onSelect: function (v) {
            state.pageSize = Math.max(1, num(v, state.pageSize));
            state.page = 1;
            sync();
            emit('pageSize');
          }
        });
        base.on(sizerEl, 'click', function (ev) {
          if (ev && ev.preventDefault) { ev.preventDefault(); }
          if (sizerDd) { sizerDd.toggle(); }
        });
      } else {
        sizerEl = base.el('select', { 'class': 'kui-pagination__sizer', 'aria-label': label });
        base.each(items, function (it) {
          var opt = base.el('option', { value: it.value, text: it.label });
          if (it.value === String(state.pageSize)) { opt.selected = true; }
          sizerEl.appendChild(opt);
        });
        base.on(sizerEl, 'change', function () {
          state.pageSize = Math.max(1, num(sizerEl.value, state.pageSize));
          state.page = 1;
          sync();
          emit('pageSize');
        });
      }
      box.appendChild(sizerEl);
    }
    function buildJumper() {
      if (!props.showJumper || jumperEl) { return; }
      jumperEl = base.el('span', { 'class': 'kui-pagination__jumper' });
      jumperEl.appendChild(base.el('span', { 'class': 'kui-pagination__jumper-text', text: base.t('pagination.jump', '前往') }));
      var input = base.el('input', {
        type: 'text',
        inputmode: 'numeric',
        'class': 'kui-pagination__input',
        'aria-label': base.t('pagination.jumpInput', '页码')
      });
      base.on(input, 'keydown', function (ev) {
        if (ev.key !== 'Enter') { return; }
        ev.preventDefault();
        go(input.value, 'jump');
        input.value = '';
      });
      base.on(input, 'blur', function () {
        if (input.value === '') { return; }
        go(input.value, 'jump');
        input.value = '';
      });
      jumperEl.appendChild(input);
      jumperEl.appendChild(base.el('span', { 'class': 'kui-pagination__jumper-text', text: base.t('pagination.pageUnit', '页') }));
      box.appendChild(jumperEl);
    }

    function sync() {
      var count = pageCount();
      if (state.page > count) { state.page = count; }
      if (props.showTotal) {
        totalEl.textContent = base.t('pagination.total', '共 {{total}} 条', { total: state.total });
        totalEl.style.display = '';
      } else {
        totalEl.style.display = 'none';
      }
      base.toggleClass(prevBtn, 'is-disabled', state.page <= 1);
      base.toggleClass(nextBtn, 'is-disabled', state.page >= count);
      prevBtn.disabled = state.page <= 1;
      nextBtn.disabled = state.page >= count;
      prevBtn.setAttribute('aria-label', (props.prevText || base.t('pagination.prev', '上一页')));
      nextBtn.setAttribute('aria-label', (props.nextText || base.t('pagination.next', '下一页')));

      base.clear(pagesEl);
      if (props.simple) {
        pagesEl.appendChild(base.el('span', {
          'class': 'kui-pagination__simple-text',
          text: state.page + ' / ' + count
        }));
      } else {
        var list = buildPageList(state.page, count, Math.max(5, num(props.maxButtons, 7)));
        base.each(list, function (item) {
          if (item === '...') {
            var more = base.el('span', { 'class': 'kui-pagination__ellipsis' });
            more.appendChild(base.iconEl('more-horizontal', 'kui-pagination__more-icon'));
            pagesEl.appendChild(more);
            return;
          }
          var btn = base.el('button', {
            type: 'button',
            'class': 'kui-pagination__item' + (item === state.page ? ' is-active' : ''),
            text: String(item),
            'aria-label': base.t('pagination.pageN', '第 {{n}} 页', { n: item })
          });
          if (item === state.page) { btn.setAttribute('aria-current', 'page'); }
          (function (pageNo) {
            base.on(btn, 'click', function () { go(pageNo, 'page'); });
          })(item);
          pagesEl.appendChild(btn);
        });
      }

      if (props.showSizer) {
        buildSizer();
        if (sizerDd) { sizerDd.setValue(String(state.pageSize), true); }
        else if (sizerEl) { sizerEl.value = String(state.pageSize); }
      }
      if (props.showJumper) { buildJumper(); }
    }

    base.on(prevBtn, 'click', function () { go(state.page - 1, 'prev'); });
    base.on(nextBtn, 'click', function () { go(state.page + 1, 'next'); });

    sync();

    var impl = {
      getValue: function () { return { page: state.page, pageSize: state.pageSize, total: state.total }; },
      setValue: function (v) {
        if (base.isObj(v)) {
          if (v.page !== undefined) { state.page = Math.max(1, num(v.page, state.page)); }
          if (v.pageSize !== undefined) { state.pageSize = Math.max(1, num(v.pageSize, state.pageSize)); }
          if (v.total !== undefined) { state.total = Math.max(0, num(v.total, state.total)); }
          sync();
        } else if (v !== undefined && v !== null) {
          state.page = Math.max(1, num(v, state.page));
          sync();
        }
        return api;
      },
      setPage: function (page) { state.page = Math.max(1, num(page, 1)); sync(); return api; },
      getPage: function () { return state.page; },
      setTotal: function (total) { state.total = Math.max(0, num(total, 0)); sync(); return api; },
      setPageSize: function (size) { state.pageSize = Math.max(1, num(size, 10)); state.page = 1; sync(); return api; },
      setDisabled: function (flag) {
        base.toggleClass(box, 'is-disabled', !!flag);
        prevBtn.disabled = !!flag || state.page <= 1;
        nextBtn.disabled = !!flag || state.page >= pageCount();
        return api;
      },
      setReadonly: function () { return api; },
      focus: function () { if (prevBtn.focus) { prevBtn.focus(); } return api; },
      destroy: function () { }
    };

    var returned = base.finalize(node, ctx, 'pagination', box, impl, { selfWrap: false });
    var api = returned.__kuiControl;
    return returned;
  }

  define('pagination', {
    category: 'data',
    defaults: PAGINATION_DEFAULTS,
    render: renderPagination,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 10. upload
   * ============================================================ */

  var UPLOAD_DEFAULTS = {
    accept: '',
    multiple: false,
    maxCount: 0,
    maxSize: 0,
    drag: true,
    showTip: true,
    tip: '',
    disabled: false,
    action: '',
    method: 'POST',
    name: 'file',
    headers: {},
    data: {},
    autoUpload: true,
    withCredentials: false,
    triggerText: ''
  };

  function acceptMatch(file, accept) {
    if (!accept) { return true; }
    var name = (file && file.name ? file.name : '').toLowerCase();
    var mime = (file && file.type ? file.type : '').toLowerCase();
    var parts = String(accept).split(',');
    for (var i = 0; i < parts.length; i++) {
      var rule = base.trim(parts[i]).toLowerCase();
      if (!rule) { continue; }
      if (rule.charAt(0) === '.') {
        if (name.length >= rule.length && name.slice(name.length - rule.length) === rule) { return true; }
        continue;
      }
      if (rule.indexOf('/*') >= 0) {
        var head = rule.slice(0, rule.indexOf('/'));
        if (mime.indexOf(head + '/') === 0) { return true; }
        continue;
      }
      if (mime === rule) { return true; }
    }
    return false;
  }

  function renderUpload(node, ctx) {
    var props = propsOf(node, UPLOAD_DEFAULTS);
    var state = {
      files: [],
      disabled: !!props.disabled,
      dragover: false
    };
    var box = base.el('div', { 'class': 'kui-upload' });
    if (props.disabled) { base.addClass(box, 'is-disabled'); }
    if (!props.drag) { base.addClass(box, 'is-click-only'); }
    var area = base.el('div', { 'class': 'kui-upload__area', role: 'button', tabindex: '0' });
    var input = base.el('input', { type: 'file', 'class': 'kui-upload__input' });
    if (props.accept) { input.setAttribute('accept', props.accept); }
    if (props.multiple) { input.setAttribute('multiple', ''); }
    var triggerIcon = base.el('span', { 'class': 'kui-upload__trigger-icon' });
    triggerIcon.appendChild(base.iconEl('upload', 'kui-upload__upload-icon'));
    var triggerText = base.el('span', {
      'class': 'kui-upload__trigger-text',
      text: props.triggerText || (props.drag ? base.t('upload.triggerDrag', '拖拽文件到此处，或点击选择') : base.t('upload.triggerClick', '点击选择文件'))
    });
    area.appendChild(triggerIcon);
    area.appendChild(triggerText);
    area.appendChild(input);
    box.appendChild(area);
    var tipEl = base.el('div', { 'class': 'kui-upload__tip' });
    box.appendChild(tipEl);
    var listEl = base.el('ul', { 'class': 'kui-upload__list' });
    box.appendChild(listEl);

    function tipText() {
      if (props.tip) { return String(props.tip); }
      if (!props.showTip) { return ''; }
      var arr = [];
      if (props.multiple) {
        arr.push(base.t('upload.multiple', '支持多选'));
      }
      if (props.maxSize > 0) {
        arr.push(base.t('upload.maxSize', '单个文件不超过 {{size}}', { size: base.formatBytes(props.maxSize) }));
      }
      if (props.maxCount > 0) {
        arr.push(base.t('upload.maxCount', '最多 {{count}} 个文件', { count: props.maxCount }));
      }
      return arr.join('，');
    }

    function metaValue() {
      var out = [];
      base.each(state.files, function (f) {
        out.push({
          uid: f.uid,
          name: f.name,
          size: f.size,
          type: f.type,
          status: f.status,
          percent: f.percent,
          url: f.url || ''
        });
      });
      return out;
    }
    function emit(reason) {
      base.emitChange(box, ctx, node, metaValue(), {
        reason: reason || 'change',
        files: state.files.slice()
      });
    }
    function statusText(f) {
      if (f.status === 'uploading') { return base.t('upload.uploading', '上传中 {{percent}}%', { percent: f.percent }); }
      if (f.status === 'error') { return base.t('upload.error', '上传失败'); }
      if (f.status === 'success') { return base.t('upload.success', '已上传'); }
      return base.t('upload.ready', '待上传');
    }

    function renderOne(f, index) {
      var li = base.el('li', { 'class': 'kui-upload__item is-' + f.status });
      li.setAttribute('data-index', String(index));
      var iconWrap = base.el('span', { 'class': 'kui-upload__file-icon' });
      iconWrap.appendChild(base.iconEl('file', 'kui-upload__file-svg'));
      li.appendChild(iconWrap);
      var info = base.el('div', { 'class': 'kui-upload__info' });
      info.appendChild(base.el('div', { 'class': 'kui-upload__name', text: f.name }));
      info.appendChild(base.el('div', {
        'class': 'kui-upload__meta',
        text: base.formatBytes(f.size) + ' · ' + statusText(f)
      }));
      if (f.status === 'uploading') {
        var progress = base.el('div', { 'class': 'kui-upload__progress' });
        var bar = base.el('div', { 'class': 'kui-upload__bar' });
        bar.style.width = (f.percent || 0) + '%';
        progress.appendChild(bar);
        info.appendChild(progress);
      }
      li.appendChild(info);
      var rm = base.el('button', {
        type: 'button',
        'class': 'kui-upload__remove',
        'aria-label': base.t('upload.remove', '移除文件')
      });
      rm.appendChild(base.iconEl('close', 'kui-upload__remove-icon'));
      base.on(rm, 'click', function (ev) {
        ev.preventDefault();
        removeAt(index);
      });
      li.appendChild(rm);
      return li;
    }
    function syncList() {
      base.clear(listEl);
      base.each(state.files, function (f, i) { listEl.appendChild(renderOne(f, i)); });
      base.toggleClass(box, 'is-empty', state.files.length === 0);
    }
    function sync() {
      tipEl.textContent = tipText();
      tipEl.style.display = tipText() ? '' : 'none';
      base.toggleClass(box, 'is-disabled', state.disabled);
      area.setAttribute('aria-disabled', state.disabled ? 'true' : 'false');
      area.setAttribute('tabindex', state.disabled ? '-1' : '0');
      triggerText.textContent = props.triggerText || (props.drag
        ? base.t('upload.triggerDrag', '拖拽文件到此处，或点击选择')
        : base.t('upload.triggerClick', '点击选择文件'));
      syncList();
    }

    function removeAt(index) {
      var f = state.files[index];
      if (!f) { return; }
      if (f.xhr && base.isFn(f.xhr.abort)) {
        try { f.xhr.abort(); } catch (e) { /* ignore */ }
      }
      state.files.splice(index, 1);
      sync();
      emit('remove');
    }
    function uploadOne(f) {
      if (!f.file || !props.action) {
        f.status = 'success';
        f.percent = 100;
        sync();
        emit('select');
        return;
      }
      if (typeof XMLHttpRequest === 'undefined') {
        f.status = 'error';
        f.message = 'no-xhr';
        sync();
        emit('uploadError');
        return;
      }
      var xhr = new XMLHttpRequest();
      f.xhr = xhr;
      f.status = 'uploading';
      f.percent = 0;
      sync();
      try {
        xhr.open(props.method || 'POST', props.action, true);
        if (props.withCredentials) { xhr.withCredentials = true; }
        if (base.isObj(props.headers)) {
          base.each(props.headers, function (v, k) { xhr.setRequestHeader(k, v); });
        }
        xhr.upload.onprogress = function (ev) {
          if (!ev.lengthComputable) { return; }
          f.percent = Math.max(1, Math.min(99, Math.round(ev.loaded / ev.total * 100)));
          sync();
        };
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) {
            f.status = 'success';
            f.percent = 100;
            f.url = xhr.responseText || '';
          } else {
            f.status = 'error';
            f.message = String(xhr.status);
          }
          f.xhr = null;
          sync();
          emit('upload');
        };
        xhr.onerror = function () {
          f.status = 'error';
          f.xhr = null;
          sync();
          emit('uploadError');
        };
        var form = new FormData();
        form.append(props.name || 'file', f.file, f.name);
        if (base.isObj(props.data)) {
          base.each(props.data, function (v, k) { form.append(k, v); });
        }
        xhr.send(form);
      } catch (e) {
        f.status = 'error';
        f.xhr = null;
        sync();
        emit('uploadError');
      }
    }
    function handleFiles(list) {
      if (state.disabled) { return; }
      var files = [];
      for (var i = 0; i < list.length; i++) { files.push(list[i]); }
      var accepted = [];
      for (var j = 0; j < files.length; j++) {
        var f = files[j];
        if (props.maxCount > 0 && state.files.length + accepted.length >= props.maxCount) {
          base.emitAction(box, ctx, node, 'exceed', { maxCount: props.maxCount, file: f });
          break;
        }
        if (!acceptMatch(f, props.accept)) {
          base.emitAction(box, ctx, node, 'typeError', { accept: props.accept, file: f });
          continue;
        }
        if (props.maxSize > 0 && f.size > props.maxSize) {
          base.emitAction(box, ctx, node, 'sizeError', { maxSize: props.maxSize, file: f });
          continue;
        }
        accepted.push(f);
      }
      if (!accepted.length) { return; }
      for (var k = 0; k < accepted.length; k++) {
        var file = accepted[k];
        state.files.push({
          uid: base.uid('upload'),
          name: file.name,
          size: file.size,
          type: file.type || '',
          file: file,
          status: 'ready',
          percent: 0,
          url: ''
        });
      }
      sync();
      if (props.autoUpload !== false) {
        base.each(state.files, function (f2) {
          if (f2.status === 'ready' && !f2.file) { f2.status = 'success'; f2.percent = 100; }
        });
        for (var m = 0; m < accepted.length; m++) {
          uploadOne(state.files[state.files.length - accepted.length + m]);
        }
      } else {
        emit('select');
      }
    }

    base.on(area, 'click', function (ev) {
      if (state.disabled) { return; }
      if (ev.target === input) { return; }
      input.click();
    });
    base.on(area, 'keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        if (!state.disabled) { input.click(); }
      }
    });
    base.on(input, 'change', function () {
      handleFiles(input.files || []);
      input.value = '';
    });
    if (props.drag) {
      base.on(area, 'dragenter', function (ev) {
        ev.preventDefault();
        if (state.disabled) { return; }
        state.dragover = true;
        base.addClass(box, 'is-dragover');
      });
      base.on(area, 'dragover', function (ev) {
        ev.preventDefault();
      });
      base.on(area, 'dragleave', function (ev) {
        if (ev.relatedTarget && base.contains(area, ev.relatedTarget)) { return; }
        state.dragover = false;
        base.removeClass(box, 'is-dragover');
      });
      base.on(area, 'drop', function (ev) {
        ev.preventDefault();
        state.dragover = false;
        base.removeClass(box, 'is-dragover');
        if (state.disabled) { return; }
        var dt = ev.dataTransfer;
        if (dt && dt.files) { handleFiles(dt.files); }
      });
    }

    sync();

    var impl = {
      getValue: function () { return metaValue(); },
      setValue: function (list) {
        state.files = [];
        base.each(base.isArr(list) ? list : [], function (item) {
          if (typeof item === 'string') {
            state.files.push({ uid: base.uid('upload'), name: item, size: 0, type: '', file: null, status: 'success', percent: 100, url: item });
          } else if (base.isObj(item)) {
            state.files.push({
              uid: item.uid || base.uid('upload'),
              name: item.name || '',
              size: num(item.size, 0),
              type: item.type || '',
              file: item.file || null,
              status: item.status || 'success',
              percent: num(item.percent, 100),
              url: item.url || ''
            });
          }
        });
        sync();
        return api;
      },
      getFiles: function () { return state.files.slice(); },
      clear: function () {
        base.each(state.files, function (f) {
          if (f.xhr && base.isFn(f.xhr.abort)) { try { f.xhr.abort(); } catch (e) { /* ignore */ } }
        });
        state.files = [];
        sync();
        emit('clear');
        return api;
      },
      submit: function () {
        base.each(state.files, function (f) {
          if (f.status === 'ready' || f.status === 'error') { uploadOne(f); }
        });
        return api;
      },
      __disabledHook: function (flag) { state.disabled = !!flag; sync(); },
      setDisabled: function (flag) { state.disabled = !!flag; sync(); return api; },
      setReadonly: function () { return api; },
      focus: function () { if (area.focus) { area.focus(); } return api; },
      destroy: function () {
        base.each(state.files, function (f) {
          if (f.xhr && base.isFn(f.xhr.abort)) { try { f.xhr.abort(); } catch (e) { /* ignore */ } }
        });
      }
    };

    var returned = base.finalize(node, ctx, 'upload', box, impl, { selfWrap: false });
    var api = returned.__kuiControl;
    return returned;
  }

  define('upload', {
    category: 'data',
    defaults: UPLOAD_DEFAULTS,
    render: renderUpload,
    api: function (el) { return el.__kuiControl; }
  });

  /* ============================================================
   * 11. field（布局：label + 任意子控件）
   * ============================================================ */

  var FIELD_DEFAULTS = {
    label: '',
    help: '',
    error: '',
    required: false,
    unit: '',
    width: null,
    span: null,
    labelWidth: null,
    labelPosition: ''
  };

  function childrenOf(node) {
    if (!node) { return []; }
    if (base.isArr(node.children)) { return node.children; }
    if (base.isArr(node.fields)) { return node.fields; }
    if (base.isObj(node.props) && base.isArr(node.props.children)) { return node.props.children; }
    return [];
  }

  function renderField(node, ctx) {
    var field = base.createField(node, ctx, {});
    base.addClass(field.el, 'kui-control kui-control--field');
    field.el.setAttribute('data-kui-type', 'field');
    var children = childrenOf(node);
    var childApis = [];
    function mountChild(child) {
      if (!child || child.visible === false) { return; }
      var childEl = null;
      if (ctx && base.isFn(ctx.render)) {
        childEl = ctx.render(child, ctx);
      } else if (base.isFn(KUI.renderNode)) {
        childEl = KUI.renderNode(child, ctx || KUI.ctx || {});
      }
      if (!childEl) { return; }
      field.row.appendChild(childEl);
      var control = childEl.__kuiControl;
      if (control) { childApis.push({ node: child, control: control }); }
    }
    base.each(children, mountChild);

    function collect() {
      var out = {};
      var has = false;
      base.each(childApis, function (item) {
        if (item.node && item.node.id && item.control && base.isFn(item.control.getValue)) {
          out[item.node.id] = item.control.getValue();
          has = true;
        }
      });
      return has ? out : null;
    }

    var impl = {
      getValue: collect,
      setValue: function (values, opts) {
        if (base.isObj(values)) {
          base.each(childApis, function (item) {
            if (item.node && item.node.id && values[item.node.id] !== undefined && base.isFn(item.control.setValue)) {
              item.control.setValue(values[item.node.id], opts);
            }
          });
        }
        return api;
      },
      validate: function () {
        for (var i = 0; i < childApis.length; i++) {
          var item = childApis[i];
          if (base.isFn(item.control.validate)) {
            var r = item.control.validate();
            if (r && r.valid === false) { return r; }
          }
        }
        return { valid: true, message: '' };
      },
      setLabel: function (txt) { field.setLabel(txt); return api; },
      setRequired: function (flag) { field.setRequired(flag); return api; },
      setError: function (msg) { field.setError(msg); return api; },
      clearError: function () { field.setError(''); return api; },
      setHelp: function (msg) { field.setHelp(msg); return api; },
      setUnit: function (unit) { field.setUnit(unit); return api; },
      setVisible: function (flag) { field.setVisible(flag); return api; },
      setDisabled: function (flag) {
        base.toggleClass(field.el, 'is-disabled', !!flag);
        field.el.setAttribute('aria-disabled', flag ? 'true' : 'false');
        base.each(childApis, function (item) {
          if (base.isFn(item.control.setDisabled)) { item.control.setDisabled(!!flag); }
        });
        return api;
      },
      setReadonly: function (flag) {
        base.toggleClass(field.el, 'is-readonly', !!flag);
        base.each(childApis, function (item) {
          if (base.isFn(item.control.setReadonly)) { item.control.setReadonly(!!flag); }
        });
        return api;
      },
      focus: function () {
        if (childApis.length && base.isFn(childApis[0].control.focus)) { childApis[0].control.focus(); }
        return api;
      },
      destroy: function () { }
    };

    var api = base.makeApi(field.el, node, ctx, impl);
    api.field = field;
    api.box = field.el;
    api.controls = childApis;
    return field.el;
  }

  define('field', {
    category: 'layout',
    defaults: FIELD_DEFAULTS,
    render: renderField,
    api: function (el) { return el.__kuiControl; }
  });

})(typeof window !== 'undefined' ? window : this);

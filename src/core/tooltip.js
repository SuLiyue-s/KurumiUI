/*!
 * KurumiUI · tooltip.js
 * 框架级悬浮提示：接管浏览器原生 title 提示，统一为主题化浮层。
 *
 * 为什么要有这一层：
 *   原生 <title> 提示由操作系统/浏览器绘制，无法换色、无法跟随主题、还会延迟 1s 左右，
 *   在「暗夜绯红 + 哥特动漫」的界面里非常突兀。本模块用事件委托把 title / data-kui-tip
 *   统一接管为 .kui-tooltip 浮层，样式全部走 CSS 变量（见 src/styles/tooltip.css）。
 *
 * 用法（三种，均无需改业务代码）：
 *   1) 任意元素保留 title="提示文字" —— 首次悬浮时自动转交（原生提示不会出现）
 *   2) 新代码建议用 data-kui-tip="提示文字"（语义更明确，不会被无障碍朗读误当名称）
 *   3) JS 主动：KUI.tooltip.show(el, '文字', { placement: 'bottom' })
 *
 * 元素级微调（可选）：
 *   data-kui-tip-placement="top|bottom|left|right"
 *   data-kui-tip-delay="240"        本次悬浮的显示延迟（毫秒）
 *   data-kui-tip-max-width="360"    本次最大宽度（像素）
 *   data-kui-tip-disabled="true"    该元素禁用接管（保留原生 title 行为）
 *
 * 配置：app.json 的 ui.tooltip（全部可省）
 *   { "enabled": true, "delay": 140, "hideDelay": 60, "offset": 10,
 *     "placement": "top", "maxWidth": 300, "followScroll": false }
 *
 * 兼容：Node 13.14 / 传统 <script>、无第三方依赖、无 ES2020 语法。
 */
(function (global) {
  'use strict';

  var K = global.KUI;
  if (!K) { return; }

  /* 非浏览器（Node 测试 / 构建脚本）直接跳过，只保留空壳避免调用方报错 */
  var HAS_DOM = !!(global.document && global.document.createElement && global.addEventListener);

  var DEFAULTS = {
    enabled: true,
    delay: 140,
    hideDelay: 60,
    offset: 10,
    placement: 'top',
    maxWidth: 300,
    followScroll: false,
    selector: '[title],[data-kui-tip]',
    className: ''
  };

  var state = {
    cfg: null,
    tipEl: null,
    arrow: null,
    target: null,
    text: '',
    placement: 'top',
    showTimer: null,
    hideTimer: null,
    bound: false,
    uid: 0,
    hasShown: false
  };

  /* ---------- 配置 ---------- */

  function readAppConfig() {
    var app = null;
    try {
      if (K.config && typeof K.config.peek === 'function') { app = K.config.peek('app'); }
      if (!app && K.config && typeof K.config.get === 'function') { app = K.config.get('app'); }
    } catch (e) { app = null; }
    return app;
  }

  function resolveConfig(extra) {
    var base = {};
    var conf = DEFAULTS;
    var app = readAppConfig();
    if (app && app.ui && app.ui.tooltip && typeof app.ui.tooltip === 'object') {
      base = app.ui.tooltip;
    }
    conf = K.utils && K.utils.assign ? K.utils.assign({}, DEFAULTS, base) : merge(DEFAULTS, base);
    if (extra && typeof extra === 'object') {
      conf = K.utils && K.utils.assign ? K.utils.assign({}, conf, extra) : merge(conf, extra);
      /* 键（'app.ui.tooltip' 解析为真实配置）：extra 只对本次生效，写回缓存 */
    }
    return conf;
  }

  function merge(a, b) {
    var out = {};
    var k;
    for (k in a) { if (Object.prototype.hasOwnProperty.call(a, k)) { out[k] = a[k]; } }
    for (k in b) { if (Object.prototype.hasOwnProperty.call(b, k)) { out[k] = b[k]; } }
    return out;
  }

  function cfg() {
    if (!state.cfg) { state.cfg = resolveConfig(null); }
    return state.cfg;
  }

  function configure(extra) {
    state.cfg = resolveConfig(extra);
    return state.cfg;
  }

  function refreshConfig() {
    state.cfg = null;
    return cfg();
  }

  /* ---------- 元素与文本 ---------- */

  function ensureTip() {
    if (state.tipEl && state.tipEl.parentNode) { return state.tipEl; }
    var doc = global.document;
    var el = doc.createElement('div');
    el.className = 'kui-tooltip' + (cfg().className ? ' ' + cfg().className : '');
    el.setAttribute('role', 'tooltip');
    el.setAttribute('aria-hidden', 'true');
    el.id = 'kui-tooltip-' + (++state.uid);
    var text = doc.createElement('div');
    text.className = 'kui-tooltip__text';
    var arrow = doc.createElement('span');
    arrow.className = 'kui-tooltip__arrow';
    arrow.setAttribute('aria-hidden', 'true');
    el.appendChild(text);
    el.appendChild(arrow);
    doc.body.appendChild(el);
    state.tipEl = el;
    state.textEl = text;
    state.arrow = arrow;
    return el;
  }

  /* 取提示文字：优先 data-kui-tip，其次 title（无障碍友好：title 原文回填并暂存） */
  function textOf(el) {
    if (!el || !el.getAttribute) { return ''; }
    // v1.3.4：以「当前 title」为最高优先级。
    // 组件会随状态改写 title（菜单折叠按钮的「收起/展开」、全屏按钮的「全屏/退出全屏」、
    // 标签标题等），而首次悬浮后 title 会被本模块搬进 data-kui-tip 并删除；
    // 若继续优先返回旧 data-kui-tip，提示文案就会停在旧值（用户反馈的真实原因）。
    var live = el.getAttribute('title');
    if (live !== null && String(live) !== '') {
      var tipNow = el.getAttribute('data-kui-tip');
      if (String(live) !== String(tipNow || '')) {
        el.setAttribute('data-kui-tip', String(live));
        if (!el.getAttribute('data-kui-tip-source')) { el.setAttribute('data-kui-tip-source', 'title'); }
      }
      el.removeAttribute('title'); /* 交给自绘浮层，避免浏览器再画原生提示 */
      return String(live);
    }
    var t = el.getAttribute('data-kui-tip');
    if (t) { return String(t); }
    return '';
  }

  function adopt(el) {
    /* 把 title 搬到 data-kui-tip 并移除 title，避免浏览器再画原生提示 */
    var title = el.getAttribute('title');
    if (title) {
      if (!el.getAttribute('data-kui-tip')) {
        el.setAttribute('data-kui-tip', title);
        el.setAttribute('data-kui-tip-source', 'title');
      }
      el.removeAttribute('title');
    }
  }

  function restore(el) {
    if (!el || !el.getAttribute) { return; }
    // v1.3.4：还原时把 title 写回，并「清掉本模块临时加的 data-kui-tip」——
    // 否则残留的旧 data-kui-tip 会在下次悬浮时盖住组件刚更新的 title（文案停留旧值的第二个原因）。
    if (el.getAttribute('data-kui-tip-source') === 'title') {
      if (!el.getAttribute('title')) {
        el.setAttribute('title', el.getAttribute('data-kui-tip') || '');
      }
      el.removeAttribute('data-kui-tip');
      el.removeAttribute('data-kui-tip-source');
    }
  }

  function inputInfo(el) {
    var info = {
      text: textOf(el),
      placement: el.getAttribute('data-kui-tip-placement') || '',
      delay: parseInt(el.getAttribute('data-kui-tip-delay'), 10),
      maxWidth: parseInt(el.getAttribute('data-kui-tip-max-width'), 10),
      disabled: String(el.getAttribute('data-kui-tip-disabled') || '') === 'true'
    };
    return info;
  }

  function candidate(node, root) {
    var el = node;
    while (el && el !== root && el.nodeType === 1) {
      if (el.getAttribute && (el.getAttribute('data-kui-tip') || el.getAttribute('title'))) {
        if (String(el.getAttribute('data-kui-tip-disabled') || '') !== 'true') { return el; }
        return null;
      }
      /* 浮层自身不参与 */
      if (el.className && String(el.className).indexOf('kui-tooltip') >= 0) { return null; }
      el = el.parentNode;
    }
    return null;
  }

  /* v1.3.4：提示显示期间盯住 title 变化，实时刷新文案（无需等下一次悬浮） */
  function stopWatch() {
    if (state.watch) {
      try { state.watch.disconnect(); } catch (e) { /* ignore */ }
      state.watch = null;
    }
    state.watchEl = null;
  }

  function watchTarget(el) {
    stopWatch();
    if (!el || el.nodeType !== 1) { return; }
    state.watchEl = el;
    if (typeof global.MutationObserver !== 'function') { return; }
    try {
      state.watch = new global.MutationObserver(function () {
        var target = state.watchEl;
        if (!target) { return; }
        var next = textOf(target);
        if (!next) { hide(true); return; }
        if (next === state.text) { return; }
        state.text = next;
        if (state.textEl) { state.textEl.textContent = next; }
        if (state.tipEl && state.tipEl.classList.contains('is-visible')) { place(target); }
      });
      state.watch.observe(el, { attributes: true, attributeFilter: ['title', 'data-kui-tip', 'data-kui-tip-disabled'] });
    } catch (e) { /* 老浏览器/桩环境忽略 */ }
  }

  /* ---------- 定位 ---------- */

  function clamp(n, min, max) {
    if (n < min) { return min; }
    if (n > max) { return max; }
    return n;
  }

  function place(el) {
    var c = cfg();
    var tip = ensureTip();
    var textEl = state.textEl;

    /* 先量高度：先给宽度再测量 */
    var vw = global.innerWidth || 1024;
    var vh = global.innerHeight || 768;
    var maxW = c.maxWidth;
    if (state.maxWidth) { maxW = state.maxWidth; }
    textEl.style.maxWidth = maxW + 'px';

    tip.style.left = '0px';
    tip.style.top = '0px';
    tip.style.visibility = 'hidden';
    tip.style.display = 'block';
    var tw = tip.offsetWidth;
    var th = tip.offsetHeight;

    var r = el.getBoundingClientRect();
    var placement = state.placement || c.placement;

    var top = r.top - th - c.offset;
    var left = r.left + r.width / 2 - tw / 2;

    if (placement === 'top' && top < 6) { placement = 'bottom'; }
    if (placement === 'bottom' && r.bottom + c.offset + th > vh - 6) { placement = 'top'; }
    if (placement === 'left' && r.left - tw - c.offset < 6) { placement = 'right'; }
    if (placement === 'right' && r.right + c.offset + tw > vw - 6) { placement = 'left'; }

    if (placement === 'bottom') { top = r.bottom + c.offset; }
    if (placement === 'left') {
      left = r.left - tw - c.offset;
      top = r.top + r.height / 2 - th / 2;
    }
    if (placement === 'right') {
      left = r.right + c.offset;
      top = r.top + r.height / 2 - th / 2;
    }

    if (placement === 'top' || placement === 'bottom') {
      left = clamp(left, 6, vw - tw - 6);
      top = clamp(top, 6, vh - th - 6);
    } else {
      left = clamp(left, 6, vw - tw - 6);
      top = clamp(top, 6, vh - th - 6);
    }

    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
    tip.style.visibility = 'visible';

    /* 箭头位置：在其所在边与元素中心对齐 */
    var arrow = state.arrow;
    if (placement === 'top' || placement === 'bottom') {
      var ax = clamp(r.left + r.width / 2 - left, 12, tw - 12);
      arrow.style.left = Math.round(ax) + 'px';
      arrow.style.top = placement === 'top' ? (th - 1) + 'px' : '-5px';
      arrow.style.bottom = '';
    } else {
      var ay = clamp(r.top + r.height / 2 - top, 12, th - 12);
      arrow.style.top = Math.round(ay) + 'px';
      arrow.style.left = placement === 'left' ? (tw - 1) + 'px' : '-5px';
    }

    if (state.placementShown !== placement) {
      tip.className = 'kui-tooltip kui-tooltip--' + placement + (c.className ? ' ' + c.className : '');
      state.placementShown = placement;
    }
    return placement;
  }

  /* ---------- 显示 / 隐藏 ---------- */

  function show(el, text, opts) {
    if (!HAS_DOM || !el || !el.getBoundingClientRect) { return false; }
    var c = cfg();
    if (!c.enabled) { return false; }
    if (opts && opts.enabled === false) { return false; }

    var info = opts && opts.text !== undefined ? opts : inputInfo(el);
    var content = text !== undefined && text !== null ? String(text) : (info.text || textOf(el));
    if (!content) { return false; }

    clearTimers();
    adopt(el);
    state.target = el;
    state.text = content;
    state.placement = (opts && opts.placement) || info.placement || c.placement;
    state.maxWidth = (opts && opts.maxWidth) || info.maxWidth || 0;

    var delay = (opts && typeof opts.delay === 'number') ? opts.delay : (info.delay > 0 ? info.delay : c.delay);

    var run = function () {
      var tip = ensureTip();
      state.textEl.textContent = content;
      tip.setAttribute('aria-hidden', 'false');
      place(el);
      tip.classList.add('is-visible');
      state.hasShown = true;
      if (el && el.setAttribute) { el.setAttribute('data-kui-tip-active', 'true'); }
      watchTarget(el);
      if (K.bus && K.bus.emit) {
        try { K.bus.emit('tooltip:show', { el: el, text: content }); } catch (e) { /* ignore */ }
      }
    };

    if (delay <= 0) { run(); } else { state.showTimer = global.setTimeout(run, delay); }
    return true;
  }

  function hide(immediate) {
    if (!HAS_DOM) { return; }
    clearTimers();
    var tip = state.tipEl;
    if (!tip) { return; }
    var c = cfg();
    var finish = function () {
      tip.classList.remove('is-visible');
      tip.setAttribute('aria-hidden', 'true');
      var el = state.target;
      if (el && el.removeAttribute) { el.removeAttribute('data-kui-tip-active'); }
      stopWatch();
      restore(el);
      state.target = null;
      state.text = '';
      if (K.bus && K.bus.emit) {
        try { K.bus.emit('tooltip:hide', {}); } catch (e) { /* ignore */ }
      }
    };
    if (immediate) { finish(); } else { state.hideTimer = global.setTimeout(finish, Math.max(0, c.hideDelay || 0)); }
  }

  function clearTimers() {
    if (state.showTimer) { global.clearTimeout(state.showTimer); state.showTimer = null; }
    if (state.hideTimer) { global.clearTimeout(state.hideTimer); state.hideTimer = null; }
  }

  /* ---------- 事件绑定 ---------- */

  function onOver(e) {
    var c = cfg();
    if (!c.enabled) { return; }
    var el = candidate(e.target, global.document);
    if (!el) { return; }
    if (el === state.target && (state.showTimer || (state.tipEl && state.tipEl.classList.contains('is-visible')))) { return; }
    show(el);
  }

  function onOut(e) {
    if (!state.target) { return; }
    if (candidate(e.target, global.document) !== state.target) { return; }
    var to = e.relatedTarget;
    if (to && to.nodeType === 1 && (to === state.target || (state.target.contains && state.target.contains(to)))) { return; }
    var tip = state.tipEl;
    if (to && tip && (to === tip || (tip.contains && tip.contains(to)))) { return; }
    hide(false);
  }

  function onFocusIn(e) {
    var el = candidate(e.target, global.document);
    if (el) { show(el, null, { delay: 60 }); }
  }

  function onFocusOut() { hide(true); }

  function onScroll() {
    if (state.target) { hide(true); }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' || e.keyCode === 27) { hide(true); }
  }

  function bind() {
    if (state.bound || !HAS_DOM) { return; }
    state.bound = true;
    var doc = global.document;
    doc.addEventListener('mouseover', onOver, true);
    doc.addEventListener('mouseout', onOut, true);
    doc.addEventListener('focusin', onFocusIn, true);
    doc.addEventListener('focusout', onFocusOut, true);
    doc.addEventListener('keydown', onKeyDown, true);
    doc.addEventListener('click', function () { hide(true); }, true);
    global.addEventListener('scroll', onScroll, true);
    global.addEventListener('resize', onScroll, true);
    if (global.MutationObserver) {
      state.observer = new global.MutationObserver(function (records) {
        var i, j;
        for (i = 0; i < records.length; i++) {
          if (records[i].type === 'attributes' && records[i].attributeName === 'title') {
            var t = records[i].target;
            if (t && t.getAttribute) {
              var title = t.getAttribute('title');
              if (title && !t.getAttribute('data-kui-tip')) {
                t.setAttribute('data-kui-tip', title);
                t.setAttribute('data-kui-tip-source', 'title');
                t.removeAttribute('title');
              }
            }
          }
        }
      });
      state.observer.observe(doc.body || doc.documentElement, {
        attributes: true, attributeFilter: ['title'], subtree: true
      });
    }
  }

  function unbind() {
    if (!state.bound || !HAS_DOM) { return; }
    state.bound = false;
    var doc = global.document;
    doc.removeEventListener('mouseover', onOver, true);
    doc.removeEventListener('mouseout', onOut, true);
    doc.removeEventListener('focusin', onFocusIn, true);
    doc.removeEventListener('focusout', onFocusOut, true);
    doc.removeEventListener('keydown', onKeyDown, true);
    global.removeEventListener('scroll', onScroll, true);
    global.removeEventListener('resize', onScroll, true);
    if (state.observer) { state.observer.disconnect(); state.observer = null; }
    stopWatch();
    hide(true);
  }

  function init(opts) {
    if (!HAS_DOM) { return null; }
    if (opts) { configure(opts); }
    cfg();
    bind();
    return api;
  }

  function destroy() {
    unbind();
    if (state.tipEl && state.tipEl.parentNode) { state.tipEl.parentNode.removeChild(state.tipEl); }
    state.tipEl = null;
    state.textEl = null;
    state.arrow = null;
    state.cfg = null;
    state.hasShown = false;
    return api;
  }

  var api = {
    version: '1.0.6',
    defaults: DEFAULTS,
    init: init,
    destroy: destroy,
    bind: bind,
    unbind: unbind,
    configure: configure,
    refresh: refreshConfig,
    config: cfg,
    show: function (el, text, opts) { return show(el, text, opts || {}); },
    hide: function () { hide(true); },
    element: function () { return state.tipEl; },
    isVisible: function () { return !!(state.tipEl && state.tipEl.classList.contains('is-visible')); },
    target: function () { return state.target; },
    /* v1.3.4：组件改写 title 后可立即刷新当前提示（不依赖下一次悬浮） */
    update: function (el) {
      var target = el || state.target;
      if (!target) { return false; }
      var next = textOf(target);
      if (!next) { return false; }
      if (target === state.target && next === state.text) { return true; }
      return show(target, next, { delay: 0 });
    }
  };

  K.tooltip = api;

  /* 浏览器内自动接管（DOM 就绪后），也可由业务方先 configure 再 init */
  if (HAS_DOM) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', function () { init(); });
    } else {
      /* 延后一拍，给 app.json 加载留出时间（配置在首次显示时惰性读取，稳妥） */
      global.setTimeout(function () { init(); }, 0);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * KurumiUI / dom-enhance.js —— 把页面里的「原生控件」升级为「框架控件」
 *
 * 背景
 * ------------------------------------------------------------------
 * 原生 <select> 的展开列表、原生 textarea 的右下角缩放角标，都由浏览器直接绘制，
 * CSS 无法改它们的材质与配色，在暗色/浅色主题下会明显「出戏」。本文件提供两个
 * 低侵入的升级器，让普通页面（pages/、standalone/）不写任何业务代码也能得到
 * 与框架控件完全一致的观感：
 *
 *   1) <select data-kui-native>   → 替换为框架 select 控件
 *      · 保留原 select 的 id / value / disabled / change 事件语义
 *      · 页面原有 `document.getElementById('x').value` 与 `el.onchange = fn`
 *        全部继续有效（变更时同步回原 select 并派发 input / change 事件）
 *      · 动态填充 option（页面 JS 后置 add(option)）会自动同步到框架控件
 *
 *   2) <textarea data-kui-grip>   → 右下角追加主题化自绘缩放角标
 *      · 原生 resize 手柄关闭（resize:none），改用与 .kui-textarea__resize
 *        同材质的 L 形描角，鼠标/触摸拖拽调整高度
 *      · 也可手动调用：KUI.enhance.grip(textarea, { min, max })
 *
 * 加载
 * ------------------------------------------------------------------
 * 放在 core/* 与 components/controls/index.js 之后即可，DOMContentLoaded 自动生效；
 * 动态插入的节点调用 KUI.enhance.scan(root) 手动补扫。
 *
 * 约定：本文件零依赖、仅 ES5（兼容 Node 13 / 老浏览器），不修改任何控件实现。
 */
(function (global) {
  'use strict';

  var KUI = global.KUI;
  if (!KUI) { return; }

  var VERSION = '1.3.9';
  var doc = global.document;

  /* =============================================================
   *  小工具
   * ============================================================= */

  function isFn(v) { return typeof v === 'function'; }

  function fire(el, type) {
    if (!el || !el.dispatchEvent) { return; }
    var ev;
    if (isFn(global.Event)) {
      ev = new global.Event(type, { bubbles: true, cancelable: true });
    } else {
      ev = doc.createEvent('HTMLEvents');
      ev.initEvent(type, true, true);
    }
    el.dispatchEvent(ev);
  }

  function readOptions(sel) {
    var list = [];
    for (var i = 0; i < sel.options.length; i++) {
      var o = sel.options[i];
      list.push({
        value: o.value,
        label: (o.textContent || '').replace(/^\s+|\s+$/g, ''),
        disabled: !!o.disabled
      });
    }
    return list;
  }

  function sameOptions(a, b) {
    if (!a || !b || a.length !== b.length) { return false; }
    for (var i = 0; i < a.length; i++) {
      if (a[i].value !== b[i].value || a[i].label !== b[i].label || a[i].disabled !== b[i].disabled) { return false; }
    }
    return true;
  }

  /* =============================================================
   *  1) 原生 select → 框架 select
   * ============================================================= */

  function selectControlReady() {
    return !!(KUI.registry && isFn(KUI.registry.has) && KUI.registry.has('select') && isFn(KUI.mount));
  }

  function upgradeSelect(sel, opts) {
    if (!sel || sel.__kuiSelectUpgraded) { return null; }
    if (sel.tagName !== 'SELECT') { return null; }
    if (!selectControlReady()) { return null; }

    var cfg = opts || {};
    sel.__kuiSelectUpgraded = true;

    // 宿主：与原 select 同位置、同 id（原 select 隐藏但保留在 DOM，供旧代码读写）
    var host = doc.createElement('span');
    host.className = 'kui-native-select' + (cfg.hostClass ? ' ' + cfg.hostClass : '');
    if (sel.className) { host.className += ' ' + sel.className; }
    var inlineStyle = sel.getAttribute('style');
    if (inlineStyle) { host.setAttribute('style', inlineStyle); }
    if (sel.parentNode) { sel.parentNode.insertBefore(host, sel); }

    sel.style.display = 'none';
    sel.setAttribute('aria-hidden', 'true');
    sel.setAttribute('tabindex', '-1');

    var node = {
      type: 'select',
      props: {
        options: readOptions(sel),
        value: sel.value,
        size: sel.getAttribute('data-size') || cfg.size || 'sm',
        placeholder: sel.getAttribute('data-placeholder') || cfg.placeholder || '',
        disabled: !!sel.disabled,
        clearable: false
      },
      // 保留原 select 的宽度意图：让框架控件铺满宿主
      style: sel.getAttribute('data-width') ? { width: sel.getAttribute('data-width') } : null
    };

    var mounted = null;
    function mountControl() {
      if (mounted && mounted.el && mounted.el.parentNode === host) {
        host.removeChild(mounted.el);
      }
      try {
        mounted = KUI.mount('select', host, node, null);
      } catch (e) {
        KUI.warn && KUI.warn('原生 select 升级失败:', e);
        mounted = null;
      }
    }
    mountControl();

    // 框架控件 → 原 select（value + input/change 事件）
    function syncBack(ev) {
      var detail = ev && ev.detail;
      var next = detail ? detail.value : null;
      if (next === null || next === undefined) { return; }
      if (String(sel.value) === String(next)) { return; }
      sel.value = String(next);
      fire(sel, 'input');
      fire(sel, 'change');
    }
    host.addEventListener('kui-change', syncBack);

    // 原 select 被页面后置填充 option / 改变 disabled → 同步到框架控件
    function syncOptions() {
      var options = readOptions(sel);
      if (sameOptions(options, node.props.options)) { return; }
      node.props.options = options;
      if (mounted && isFn(mounted.setOptions)) {
        safeCall(function () { mounted.setOptions(options); });
      } else {
        mountControl();
      }
    }
    var observer = null;
    if (global.MutationObserver) {
      observer = new global.MutationObserver(syncOptions);
      observer.observe(sel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled'] });
    }

    var record = {
      select: sel,
      host: host,
      get mounted() { return mounted; },
      sync: syncOptions,
      destroy: function () {
        if (observer) { observer.disconnect(); observer = null; }
        host.removeEventListener('kui-change', syncBack);
        if (mounted && isFn(mounted.destroy)) { safeCall(function () { mounted.destroy(); }); }
        sel.style.display = '';
        sel.removeAttribute('aria-hidden');
        sel.removeAttribute('tabindex');
        if (host.parentNode) { host.parentNode.removeChild(host); }
        sel.__kuiSelectUpgraded = false;
      }
    };
    upgraded.push(record);
    return record;
  }

  function safeCall(fn) {
    try { return fn(); } catch (e) { KUI.warn && KUI.warn('dom-enhance 执行异常:', e); return null; }
  }

  /* =============================================================
   *  2) textarea 右下角自绘缩放角标
   * ============================================================= */

  function grip(textarea, opts) {
    if (!textarea || textarea.__kuiGrip) { return null; }
    if (textarea.tagName !== 'TEXTAREA') { return null; }
    var wrap = textarea.parentNode;
    if (!wrap) { return null; }
    textarea.__kuiGrip = true;

    var cfg = opts || {};
    var minH = cfg.min || 56;
    var maxH = cfg.max || 900;

    // 角标要绝对定位在文本框右下角 → 父容器需要定位上下文
    if (global.getComputedStyle) {
      var pos = global.getComputedStyle(wrap).position;
      if (!pos || pos === 'static') { wrap.style.position = 'relative'; }
    }
    textarea.style.resize = 'none';

    var handle = doc.createElement('span');
    handle.className = 'kui-textarea__resize';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-label', '拖动调整高度');
    handle.setAttribute('title', '拖动调整高度');
    handle.setAttribute('tabindex', '-1');
    wrap.appendChild(handle);

    var startY = 0;
    var startH = 0;
    var dragging = false;
    var maxHeight = cfg.max;

    function clientY(ev) {
      if (ev.touches && ev.touches.length) { return ev.touches[0].clientY; }
      if (ev.changedTouches && ev.changedTouches.length) { return ev.changedTouches[0].clientY; }
      return ev.clientY;
    }

    function onMove(ev) {
      if (!dragging) { return; }
      var limit = (typeof maxHeight === 'number' && maxHeight > 0) ? maxHeight : maxH;
      var next = Math.min(limit, Math.max(minH, startH + (clientY(ev) - startY)));
      textarea.style.height = next + 'px';
      if (ev.cancelable) { ev.preventDefault(); }
    }

    function onUp() {
      if (!dragging) { return; }
      dragging = false;
      doc.removeEventListener('mousemove', onMove, true);
      doc.removeEventListener('mouseup', onUp, true);
      doc.removeEventListener('touchmove', onMove, true);
      doc.removeEventListener('touchend', onUp, true);
    }

    function onDown(ev) {
      dragging = true;
      startY = clientY(ev);
      startH = textarea.offsetHeight;
      if (ev.cancelable) { ev.preventDefault(); }
      doc.addEventListener('mousemove', onMove, true);
      doc.addEventListener('mouseup', onUp, true);
      doc.addEventListener('touchmove', onMove, true);
      doc.addEventListener('touchend', onUp, true);
    }

    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });

    return {
      el: handle,
      destroy: function () {
        handle.removeEventListener('mousedown', onDown);
        handle.removeEventListener('touchstart', onDown);
        onUp();
        if (handle.parentNode) { handle.parentNode.removeChild(handle); }
        textarea.__kuiGrip = false;
      }
    };
  }

  /* =============================================================
   *  3) 自动升级
   * ============================================================= */

  var pending = 0;
  /** 已升级的原生 select 记录（供 list()/destroy() 回滚，见 api） */
  var upgraded = [];

  function scan(root) {
    var scope = root || doc;
    if (!scope || !scope.querySelectorAll) { return; }

    var selects = scope.querySelectorAll('select[data-kui-native]');
    for (var i = 0; i < selects.length; i++) {
      safeCall(function (sel) { return function () { return upgradeSelect(sel); }; }(selects[i]));
    }

    var areas = scope.querySelectorAll('textarea[data-kui-grip]');
    for (var j = 0; j < areas.length; j++) {
      safeCall(function (ta) { return function () { return grip(ta); }; }(areas[j]));
    }
  }

  function boot() {
    // 控件库可能通过 document.write 串行注入，注册有微小延迟 → 最多等 1.5s
    function attempt() {
      pending += 1;
      if (selectControlReady() || pending > 25) {
        scan(doc);
        return;
      }
      global.setTimeout(attempt, 60);
    }
    attempt();
  }

  var api = {
    version: VERSION,
    scan: scan,
    upgradeSelect: upgradeSelect,
    grip: grip,
    list: function () {
      var out = [];
      for (var i = 0; i < upgraded.length; i++) { out.push(upgraded[i].select); }
      return out;
    }
  };

  if (KUI.enhance) {
    // 重复加载：保留先注册的实现，避免同一页面被升级两次
    KUI.warn && KUI.warn('KUI.enhance 已存在，跳过重复加载');
  } else {
    KUI.enhance = api;
  }

  if (doc) {
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
      boot();
    }
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));

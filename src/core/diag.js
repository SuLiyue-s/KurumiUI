/**
 * KurumiUI / diag.js —— 诊断面板（只在 ?kui_debug=1 时启用）
 *
 * 背景
 * ------------------------------------------------------------------
 * 「弹窗按钮点了没反应」「在弹窗里打字浏览器卡死」这类问题只出现在特定浏览器 /
 * 显卡 / 输入法组合下，抓不到现场就无法对症。本文件提供一个零依赖的现场取证工具：
 *
 *   http://127.0.0.1:8080/?kui_debug=1
 *
 * 启用后页面右下角出现一个可折叠面板，实时记录：
 *   · 版本 / UA / 视口 / 主题
 *   · window.onerror、unhandledrejection（异常不会再安静消失）
 *   · longtask（>50ms 的主线程卡顿）与输入事件耗时
 *   · 弹窗链路消息（dialog:ready / dialog:clicked / dialog:action / dialog:resize /
 *     dialog:debug …）
 *   · iframe 装载/消息与焦点事件计数
 *
 * 面板内容可以整段复制发给开发者，比口头描述「卡死」有用得多。
 *
 * 约定：零依赖、仅 ES5、不改任何组件行为；未启用时本文件只挂一个空 API。
 */
(function (global) {
  'use strict';

  var KUI = global.KUI;
  if (!KUI) { return; }

  var VERSION = '1.1.0';
  var doc = global.document;
  var MAX_LINES = 260;
  var lines = [];
  var panel = null;
  var logEl = null;
  var enabled = false;
  var seq = 0;

  function now() {
    var t = new Date();
    return ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2) + ':' +
      ('0' + t.getSeconds()).slice(-2) + '.' + ('00' + t.getMilliseconds()).slice(-3);
  }

  function el(tag, cls, text) {
    var node = doc.createElement(tag);
    if (cls) { node.className = cls; }
    if (text !== undefined && text !== null) { node.textContent = String(text); }
    return node;
  }

  function render() {
    if (!logEl) { return; }
    logEl.textContent = lines.join('\n');
    logEl.scrollTop = logEl.scrollHeight;
  }

  function log(kind, message) {
    seq += 1;
    var line = String(seq) + ' [' + now() + '] ' + (kind ? kind + ' ' : '') + message;
    lines.push(line);
    if (lines.length > MAX_LINES) { lines = lines.slice(lines.length - MAX_LINES); }
    render();
    if (KUI.log && !enabled) { KUI.log('[diag] ' + line); }
    return line;
  }

  /* ------------------------------------------------------------------ */
  /* 面板                                                               */
  /* ------------------------------------------------------------------ */

  function buildPanel() {
    if (!doc || !doc.body || panel) { return; }
    panel = el('div', 'kui-diag');
    panel.setAttribute('data-kui-diag', '1');
    var head = el('div', 'kui-diag__head');
    var title = el('span', 'kui-diag__title', 'KurumiUI 诊断 · v' + ((KUI.version || '') + ''));
    var copy = el('button', 'kui-diag__btn', '复制');
    copy.type = 'button';
    copy.addEventListener('click', function () {
      var text = lines.join('\n');
      safe(function () {
        if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
          global.navigator.clipboard.writeText(text);
        }
      });
      log('diag', '已复制 ' + text.length + ' 字符（也可直接选中面板文本）');
    });
    var toggle = el('button', 'kui-diag__btn', '收起');
    toggle.type = 'button';
    toggle.addEventListener('click', function () {
      var collapsed = panel.className.indexOf('is-collapsed') >= 0;
      panel.className = 'kui-diag' + (collapsed ? '' : ' is-collapsed');
      toggle.textContent = collapsed ? '收起' : '展开';
    });
    head.appendChild(title);
    head.appendChild(copy);
    head.appendChild(toggle);
    logEl = el('pre', 'kui-diag__log');
    panel.appendChild(head);
    panel.appendChild(logEl);
    doc.body.appendChild(panel);

    log('env', 'ver=' + (KUI.version || '?') + ' ua=' + (global.navigator ? global.navigator.userAgent : '?'));
    log('env', 'vp=' + (global.innerWidth || 0) + 'x' + (global.innerHeight || 0) +
      ' dpr=' + (global.devicePixelRatio || 1) +
      ' theme=' + safeGet(function () { return KUI.theme && KUI.theme.currentId ? KUI.theme.currentId() : '?'; }, '?') +
      ' framed=' + (global.parent !== global));
  }

  function safe(fn) {
    try { return fn(); } catch (e) { return undefined; }
  }

  function safeGet(fn, fallback) {
    var v = safe(fn);
    return v === undefined || v === null || v === '' ? fallback : v;
  }

  /* ------------------------------------------------------------------ */
  /* 采集：异常 / 长任务 / 焦点 / 输入                                    */
  /* ------------------------------------------------------------------ */

  function hookErrors() {
    if (!global.addEventListener) { return; }
    global.addEventListener('error', function (ev) {
      var where = '';
      if (ev && ev.filename) {
        where = ' @' + ev.filename + ':' + (ev.lineno || 0) + ':' + (ev.colno || 0);
      }
      log('error', ((ev && ev.message) || 'unknown') + where);
    });
    global.addEventListener('unhandledrejection', function (ev) {
      var reason = ev && ev.reason;
      var text = reason && (reason.stack || reason.message) ? (reason.stack || reason.message) : String(reason);
      log('reject', String(text).slice(0, 400));
    });
  }

  function hookLongTask() {
    safe(function () {
      if (!global.PerformanceObserver) { return; }
      var types = global.PerformanceObserver.supportedEntryTypes || [];
      if (types.indexOf('longtask') < 0) { return; }
      new global.PerformanceObserver(function (list) {
        var entries = list.getEntries();
        for (var i = 0; i < entries.length; i++) {
          var d = Math.round(entries[i].duration);
          if (d >= 120) { log('longtask', d + 'ms'); }
        }
      }).observe({ entryTypes: ['longtask'] });
    });
  }

  function hookFocus() {
    if (!doc || !doc.addEventListener) { return; }
    var focusIn = 0;
    var focusOut = 0;
    doc.addEventListener('focusin', function (ev) {
      focusIn += 1;
      var t = ev && ev.target;
      log('focus', 'in#' + focusIn + ' target=' + (t && (t.tagName || '?')) +
        '.' + (t && t.className ? String(t.className).split(' ')[0] : '') +
        ' out#' + focusOut);
    }, true);
    doc.addEventListener('focusout', function () {
      focusOut += 1;
    }, true);
  }

  function hookTyping() {
    if (!doc || !doc.addEventListener) { return; }
    var pending = 0;
    var lastKey = 0;
    function report(kind, ev) {
      var t = ev && ev.target;
      var tag = t && t.tagName ? String(t.tagName).toLowerCase() : '?';
      if (tag !== 'textarea' && tag !== 'input') { return; }
      var start = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
      pending += 1;
      lastKey = Date.now();
      global.setTimeout(function () {
        var cost = ((global.performance && global.performance.now) ? global.performance.now() : Date.now()) - start;
        if (pending <= 3 || pending % 10 === 0 || cost > 30) {
          log('type', kind + '#' + pending + ' tag=' + tag + ' cost=' + Math.round(cost) + 'ms' +
            ' len=' + (t && typeof t.value === 'string' ? t.value.length : '?'));
        }
      }, 0);
    }
    doc.addEventListener('keydown', function (ev) { report('keydown', ev); }, true);
    doc.addEventListener('input', function (ev) { report('input', ev); }, true);
    global.setTimeout(function () {
      if (pending > 0) { log('type', '输入事件合计 ' + pending + ' 次，最后一次 ' + lastKey); }
    }, 3000);
  }

  function hookMessages() {
    if (!global.addEventListener) { return; }
    global.addEventListener('message', function (ev) {
      var data = ev && ev.data;
      if (!data || !data.__kui) { return; }
      var type = String(data.type || '?');
      // 只记录与弹窗/主题相关的核心链路，避免刷屏
      if (type.indexOf('dialog:') !== 0 && type.indexOf('theme:') !== 0 &&
          type.indexOf('frame:') !== 0 && type.indexOf('kui-debug') !== 0) {
        return;
      }
      var payload = data.payload || {};
      var brief = '';
      if (type === 'dialog:init') { brief = 'method=' + payload.method + ' id=' + (payload.dialogId || payload.id); }
      else if (payload.text) { brief = 'text=' + payload.text; }
      else if (payload.action) { brief = 'action=' + payload.action; }
      else if (payload.height !== undefined) { brief = 'height=' + payload.height; }
      else if (payload.id) { brief = 'id=' + payload.id; }
      log('msg', type + (brief ? ' ' + brief : '') + ' src=' + (ev.source === global ? 'self' : 'frame'));
    }, true);
  }

  /* ------------------------------------------------------------------ */
  /* 对外 API                                                           */
  /* ------------------------------------------------------------------ */

  var api = {
    version: VERSION,
    get enabled() { return enabled; },
    log: log,
    clear: function () { lines = []; render(); },
    lines: function () { return lines.slice(); },
    copy: function () { return lines.join('\n'); },
    show: function () { buildPanel(); return panel; }
  };

  if (KUI.diag) { return; }
  KUI.diag = api;

  function shouldEnable() {
    var search = String((global.location && global.location.search) || '');
    if (/(?:^\?|&)kui_debug=1(?:&|$)/.test(search)) { return true; }
    return safeGet(function () {
      return global.localStorage && global.localStorage.getItem('kui-debug') === '1';
    }, false) === true;
  }

  function boot() {
    if (!shouldEnable()) { return; }
    enabled = true;
    buildPanel();
    hookErrors();
    hookLongTask();
    hookFocus();
    hookTyping();
    hookMessages();
    log('boot', '诊断已启用（?kui_debug=1）。复现问题后点「复制」把面板内容发回即可。');
  }

  if (doc) {
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
      boot();
    }
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));

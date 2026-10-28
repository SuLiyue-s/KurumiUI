/**
 * KurumiUI · 弹窗 iframe 内部渲染脚本
 * ---------------------------------------------------------------------------
 * 该文件只运行在 dialog-frame.html（父页面创建的 iframe）内部：
 *   - 接收父级 dialog:init / dialog:update / dialog:close / theme:apply
 *   - 渲染标题、正文 nodes、表单与按钮组
 *   - 回发 dialog:ready / dialog:resize / dialog:resolve / dialog:cancel / dialog:toast
 *   - 弹窗内再弹弹窗时转发父级 dialog:open（保证任何弹窗都是 iframe）
 *   - 动作在本地 KUI.actions 找不到时转发父级 dialog:action
 *
 * postMessage 约定（契约 §9）：{ __kui: true, type, requestId, payload }
 * targetOrigin 使用 '*'：本框架面向 file:// 与任意 host 部署，父页面 origin 无法预知；
 * 同源部署时可按需收紧为具体 origin。所有入站消息都校验 event.source === window.parent。
 */
(function (global) {
  'use strict';

  var K = global.KUI || {};
  if (!K || typeof K !== 'object') { return; }

  /* ------------------------------------------------------------------ */
  /* 基础工具：全部防御式，core 未就绪时也不抛错                          */
  /* ------------------------------------------------------------------ */

  function safe(fn, fallback) {
    try {
      var value = fn();
      return value === undefined ? fallback : value;
    } catch (e) {
      return fallback;
    }
  }

  function txt(key, fallback, vars) {
    var value = safe(function () { return K.text(key, fallback, vars); }, fallback);
    return (value === undefined || value === null || value === '') ? fallback : value;
  }

  function uid(prefix) {
    return safe(function () { return K.utils.uid(prefix); }, (prefix || 'kui') + '-' + Math.random().toString(36).slice(2, 8));
  }

  function el(tag, cls) {
    var node = document.createElement(tag);
    if (cls) { node.className = cls; }
    return node;
  }

  function clear(node) {
    while (node && node.firstChild) { node.removeChild(node.firstChild); }
  }

  function on(target, type, fn, options) {
    if (!target) { return; }
    if (typeof K.on === 'function') { K.on(target, type, fn, options); return; }
    target.addEventListener(type, fn, options || false);
  }

  function iconHtml(name) {
    if (!name) { return ''; }
    var html = safe(function () {
      if (K.icons && typeof K.icons.get === 'function') {
        return K.icons.get(name, { 'class': 'kui-icon', size: 18 });
      }
      if (K.icons && typeof K.icons.create === 'function') {
        var svg = K.icons.create(name, { 'class': 'kui-icon', size: 18 });
        return svg ? svg.outerHTML : '';
      }
      return '';
    }, '');
    if (html) { return html; }
    // 降级：core/icons 的 sprite symbol id 前缀为 kui-icon-
    return '<svg class="kui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true" focusable="false"><use href="#kui-icon-' + String(name).replace(/[^A-Za-z0-9_-]/g, '') + '"></use></svg>';
  }

  /* ------------------------------------------------------------------ */
  /* 与父页面通信                                                        */
  /* ------------------------------------------------------------------ */

  var messageSeq = 0;
  var pending = {};   // requestId -> {resolve, reject, timer}

  function getParent() {
    try {
      if (global.parent && global.parent !== global) { return global.parent; }
    } catch (e) { /* 跨域访问 parent 属性本身不会抛错，这里兜底 */ }
    return null;
  }

  function post(type, payload, requestId) {
    var parent = getParent();
    if (!parent) { return false; }
    var message = { __kui: true, type: type, requestId: requestId || '', payload: payload || {} };
    try {
      // 面向 file:// 与任意 host，父页面 origin 无法预知，故用 '*'；同源部署可收紧
      parent.postMessage(message, '*');
      return true;
    } catch (e) {
      return false;
    }
  }

  function request(parent, type, payload, timeoutMs) {
    messageSeq += 1;
    var requestId = 'dfr' + messageSeq + '-' + Date.now().toString(36);
    var timeout = (typeof timeoutMs === 'number' && timeoutMs > 0) ? timeoutMs : 12000;
    return new Promise(function (resolve, reject) {
      pending[requestId] = { resolve: resolve, reject: reject, timer: null };
      if (!post(type, payload, requestId)) {
        delete pending[requestId];
        reject(new Error('no-parent'));
        return;
      }
      // 父级超时未回执时 reject，避免 Promise 永久挂起导致按钮"点了没反应"
      pending[requestId].timer = global.setTimeout(function () {
        var item = pending[requestId];
        if (item) {
          delete pending[requestId];
          item.reject(new Error('timeout'));
        }
      }, timeout);
    });
  }

  function settle(requestId, ok, value) {
    var item = pending[requestId];
    if (!item) { return false; }
    delete pending[requestId];
    if (item.timer) { global.clearTimeout(item.timer); }
    if (ok) { item.resolve(value); }
    else { item.reject(value instanceof Error ? value : new Error(String(value || 'failed'))); }
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* 主题                                                                */
  /* ------------------------------------------------------------------ */

  var themeState = { id: '', tokens: null };

  function applyTheme(payload) {
    payload = payload || {};
    var id = payload.id || (payload.theme && payload.theme.id) || '';
    var tokens = payload.tokens || (payload.theme && payload.theme.tokens) || null;
    themeState.id = id || themeState.id;
    themeState.tokens = tokens || themeState.tokens;
    if (themeState.id) {
      safe(function () { document.documentElement.setAttribute('data-kui-theme', themeState.id); });
    }
    if (themeState.tokens) {
      // 优先交给 core/theme.js 统一应用（含缺失 token 兜底）
      var applied = safe(function () {
        if (K.theme && typeof K.theme.applyTokens === 'function') {
          K.theme.applyTokens(themeState.tokens);
          return true;
        }
        return false;
      }, false);
      if (!applied) {
        var tokensObj = themeState.tokens;
        Object.keys(tokensObj).forEach(function (key) {
          var value = tokensObj[key];
          if (value === undefined || value === null) { return; }
          var name = key.indexOf('--') === 0 ? key : ('--kui-' + String(key).replace(/^--?kui-/, ''));
          safe(function () { document.documentElement.style.setProperty(name, String(value)); });
        });
      }
    }
    if (payload.scheme) {
      safe(function () { document.documentElement.setAttribute('data-kui-scheme', payload.scheme); });
    }
  }

  /* ------------------------------------------------------------------ */
  /* DOM 引用与状态                                                      */
  /* ------------------------------------------------------------------ */

  var rootEl = document.getElementById('kui-dialog');
  var headerEl = rootEl ? rootEl.querySelector('[data-dialog-header]') : null;
  var iconEl = rootEl ? rootEl.querySelector('[data-dialog-icon]') : null;
  var titleEl = rootEl ? rootEl.querySelector('[data-dialog-title]') : null;
  var bodyEl = rootEl ? rootEl.querySelector('[data-dialog-body]') : null;
  var footerEl = rootEl ? rootEl.querySelector('[data-dialog-footer]') : null;
  var closeEl = rootEl ? rootEl.querySelector('[data-dialog-close]') : null;

  var state = {
    inited: false,
    dialogId: '',
    config: {},          // dialog:init 下发的配置
    type: 'custom',      // alert | confirm | prompt | form | custom
    resolved: false,
    submitting: false,
    fields: [],          // 表单字段描述
    formApi: null,       // KUI.form 实例（若可用）
    primary: null,       // 主按钮元素
    readyTimer: 0,
    readyTries: 0,
    drag: null
  };

  /* ------------------------------------------------------------------ */
  /* 高度自适应                                                          */
  /* ------------------------------------------------------------------ */

  var lastHeight = 0;

  function measureHeight() {
    if (!rootEl) { return 0; }
    var rect = safe(function () { return rootEl.getBoundingClientRect(); }, null);
    var height = rect ? Math.ceil(rect.height) : (rootEl.offsetHeight || 0);
    return height > 0 ? height : 0;
  }

  function reportHeight(force) {
    var height = measureHeight();
    if (!height) { return; }
    if (!force && Math.abs(height - lastHeight) < 1) { return; }
    lastHeight = height;
    post('dialog:resize', { height: height });
  }

  var resizeTimer = 0;
  function scheduleResize() {
    // 90ms 节流：输入/滚动/动画等高频变化合并成一次上报，
    // 避免「弹窗不停改高度 → 页面重排 → 再触发上报」造成的卡顿。
    if (resizeTimer) { return; }
    resizeTimer = global.setTimeout(function () {
      resizeTimer = 0;
      reportHeight(false);
    }, 90);
  }

  function observeSize() {
    if (typeof global.ResizeObserver === 'function') {
      safe(function () {
        var ro = new global.ResizeObserver(function () { scheduleResize(); });
        if (rootEl) { ro.observe(rootEl); }
      });
    }
    if (typeof global.MutationObserver === 'function' && bodyEl) {
      safe(function () {
        var mo = new global.MutationObserver(function () { scheduleResize(); });
        // 只观察节点增删：输入文字（characterData）与属性变化不该触发高度重算，
        // 否则用户每敲一个字符都会走一次「测量 + 上报 + iframe 改高」。
        mo.observe(bodyEl, { childList: true, subtree: true });
      });
    }
    on(global, 'resize', function () { reportHeight(true); });
    on(global, 'load', function () { reportHeight(true); });
  }

  /* ------------------------------------------------------------------ */
  /* 按钮与动作                                                          */
  /* ------------------------------------------------------------------ */

  function makeButton(option) {
    option = option || {};
    var btn = el('button', 'kui-dialog__btn');
    btn.type = 'button';
    var variants = { primary: 'is-primary', danger: 'is-danger', ghost: 'is-ghost' };
    var variant = variants[option.type || ''] || '';
    if (variant) { btn.className += ' ' + variant; }
    if (option.icon) {
      var iconSpan = el('span', 'kui-dialog__btn-icon');
      iconSpan.innerHTML = iconHtml(option.icon);
      btn.appendChild(iconSpan);
    }
    var label = option.text || option.label || '';
    if (label) {
      var labelSpan = el('span', 'kui-dialog__btn-text');
      labelSpan.textContent = label;
      btn.appendChild(labelSpan);
    }
    if (option.disabled) { btn.disabled = true; }
    on(btn, 'click', function (ev) {
      if (ev && ev.preventDefault) { ev.preventDefault(); }
      if (state.submitting) { return; }
      // 点击反馈：先回报父页面（父页面统一弹一条轻提示），避免「点了没反应」的错觉
      safe(function () {
        post('dialog:clicked', { text: label || '', action: option.action || '', close: option.close !== false });
      });
      if (typeof option.onClick === 'function') {
        safe(function () { option.onClick(ev); });
        return;
      }
      if (option.action) {
        runDialogAction(option, ev);
        return;
      }
      // 默认：close === 'resolve' 也走 resolve（值可序列化）
      if (option.close === false) { return; }
      resolveDialog(option.value);
    });
    return btn;
  }

  // 动作统一入口：本地注册的动作优先执行；本地没有（页面级业务动作，如 demo.trace/demo.nested）
  // 一律转发父页面执行，不再依赖前缀白名单，也不再静默丢弃。
  function sendAction(action, params) {
    var local = false;
    safe(function () {
      if (K.actions && typeof K.actions.has === 'function') { local = !!K.actions.has(action); }
    });
    if (local && typeof K.actions.run === 'function') {
      return Promise.resolve(safe(function () {
        return K.actions.run({ action: action, params: params || {} }, makeCtx());
      }, undefined));
    }
    return request(parentOrNull(), 'dialog:action', { action: action, params: params || {} }, 4000);
  }

  function runDialogAction(option, ev) {
    var action = option.action;
    var params = option.params || {};
    var closeAfter = option.close !== false;
    sendAction(action, params)['then'](function (res) {
      var ok = true;
      var error = '';
      var value = res;
      if (res && typeof res === 'object' && 'ok' in res) {
        ok = res.ok !== false;
        error = res.error || '';
        value = 'result' in res ? res.result : res;
      }
      if (!ok) {
        // 父页面也没有注册该动作：给出含动作名的明确提示，避免"点了没反应"
        post('dialog:toast', {
          type: 'warning',
          title: txt('dialog.actionMissing', '动作未注册'),
          message: error || String(action)
        });
      }
      if (closeAfter) { resolveDialog(value); }
    })['catch'](function (err) {
      // 无父级 / 超时 / 父级异常：提示并按 close 语义关闭，保证按钮一定有反馈
      post('dialog:toast', {
        type: 'warning',
        title: txt('dialog.actionFailed', '动作执行失败'),
        message: (err && err.message ? err.message : 'error') + ' · ' + String(action)
      });
      if (closeAfter) { resolveDialog(option.value); }
    });
  }

  function parentOrNull() {
    return getParent();
  }

  function makeCtx() {
    var ctx = {
      scope: 'dialog',
      dialogId: state.dialogId,
      root: bodyEl,
      data: state.config.data || {},
      KUI: K,
      emit: function (name, detail) { return post('dialog:toast', { name: name, detail: detail }); }
    };
    safe(function () {
      if (typeof K.createContext === 'function') {
        ctx = K.createContext(null, { scope: 'dialog', dialogId: state.dialogId, root: bodyEl });
      }
    });
    return ctx;
  }

  /* ------------------------------------------------------------------ */
  /* 结果与关闭                                                          */
  /* ------------------------------------------------------------------ */

  function resolveDialog(value) {
    if (state.resolved) { return; }
    state.resolved = true;
    var payload = { value: (value === undefined ? null : value), dialogId: state.dialogId };
    post('dialog:resolve', payload);
  }

  function cancelDialog() {
    if (state.resolved) { return; }
    state.resolved = true;
    post('dialog:cancel', { dialogId: state.dialogId });
  }

  function requestClose() {
    if (state.resolved) { return; }
    // 关闭按钮 / Esc / 遮罩都视为 cancel，由父级决定最终结果
    cancelDialog();
  }

  /* ------------------------------------------------------------------ */
  /* 正文渲染                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * 节点归一化：JSON 里的 alert/confirm/prompt 等控件把正文写在 props.message 上，
   * 而 controls 的 alert 渲染只读 props.text（textContentOf），导致弹窗主体渲染成空白框。
   * 这里在渲染前做一次 message → text 的兼容映射（不修改原始 config 对象）。
   */
  function normalizeNode(node) {
    if (!node || typeof node !== 'object') { return node; }
    var copy = {};
    Object.keys(node).forEach(function (k) { copy[k] = node[k]; });
    var props = {};
    if (node.props && typeof node.props === 'object') {
      Object.keys(node.props).forEach(function (k) { props[k] = node.props[k]; });
    }
    if (props.message !== undefined && props.message !== null && (props.text === undefined || props.text === null || props.text === '')) {
      props.text = props.message;
    }
    if (props.label === undefined && props.title !== undefined && copy.type === 'alert') {
      // alert 无标题槽位，title 也并进正文，避免信息丢失
      if (props.text === undefined || props.text === null || props.text === '') { props.text = props.title; }
    }
    if (copy.message !== undefined && copy.message !== null && (copy.text === undefined || copy.text === null || copy.text === '')) {
      copy.text = copy.message;
    }
    copy.props = props;
    return copy;
  }

  // 判断已渲染正文是否真的"有内容"（纯文本或可交互控件）
  function hasRenderableContent(host) {
    if (!host) { return false; }
    if (host.textContent && host.textContent.replace(/\s+/g, '') !== '') { return true; }
    var controls = safe(function () {
      return host.querySelectorAll('input, textarea, select, button, [contenteditable="true"]');
    }, null);
    return !!(controls && controls.length);
  }

  function renderNodes(host, nodes, data) {
    if (!host || !nodes) { return; }
    var list = Array.isArray(nodes) ? nodes : [nodes];
    var ctx = makeCtx();
    ctx.data = data || state.config.data || {};
    list.forEach(function (node) {
      if (!node) { return; }
      if (typeof node === 'string') {
        var p = el('p', 'kui-dialog__message');
        p.textContent = node;
        host.appendChild(p);
        return;
      }
      var normalized = normalizeNode(node);
      if (normalized.type === 'divider') {
        host.appendChild(el('div', 'kui-dialog__divider kui-divider'));
        return;
      }
      var rendered = safe(function () {
        if (typeof K.renderNode === 'function') { return K.renderNode(normalized, ctx); }
        return null;
      }, null);
      if (rendered) {
        host.appendChild(rendered);
      } else if (normalized.text || normalized.label) {
        var fallback = el('p', 'kui-dialog__message');
        fallback.textContent = String(normalized.text || normalized.label);
        host.appendChild(fallback);
      }
    });
  }

  function renderMessage(host, config) {
    if (config.nodes) {
      renderNodes(host, config.nodes, config.data);
      return;
    }
    if (config.html) {
      var htmlBox = el('div', 'kui-dialog__rich');
      htmlBox.innerHTML = String(config.html);
      host.appendChild(htmlBox);
      return;
    }
    var message = config.message;
    if (Array.isArray(message)) {
      message.forEach(function (line) {
        var p = el('p', 'kui-dialog__message');
        p.textContent = String(line);
        host.appendChild(p);
      });
      return;
    }
    if (message !== undefined && message !== null && message !== '') {
      var text = String(message);
      // 文案按行拆分，保留空行节奏；不做 HTML 注入
      text.split(/\n+/).forEach(function (line) {
        var p = el('p', 'kui-dialog__message');
        p.textContent = line;
        host.appendChild(p);
      });
    }
  }

  function renderIcon(config) {
    if (!iconEl) { return; }
    clear(iconEl);
    var name = config.icon;
    if (!name) {
      iconEl.style.display = 'none';
      return;
    }
    iconEl.style.display = '';
    iconEl.innerHTML = iconHtml(name);
  }

  /** 副标题（config.subtitle；v1.3.8 起渲染，之前该字段被丢弃） */
  function renderSubtitle(config) {
    if (!headerEl) { return; }
    var node = headerEl.querySelector('.kui-dialog__subtitle');
    var text = config.subtitle !== undefined && config.subtitle !== null ? String(config.subtitle) : '';
    if (!text) {
      if (node) { node.parentNode.removeChild(node); }
      return;
    }
    if (!node) {
      node = el('p', 'kui-dialog__subtitle');
      node.setAttribute('data-dialog-subtitle', '');
      if (titleEl && titleEl.nextSibling) { headerEl.insertBefore(node, titleEl.nextSibling); }
      else { headerEl.appendChild(node); }
    }
    node.textContent = text;
  }

  /** 副标题（config.subtitle；v1.3.8 起渲染，之前该字段被丢弃） */
  function renderSubtitle(config) {
    if (!headerEl) { return; }
    var node = headerEl.querySelector('.kui-dialog__subtitle');
    var text = config.subtitle !== undefined && config.subtitle !== null ? String(config.subtitle) : '';
    if (!text) {
      if (node) { node.parentNode.removeChild(node); }
      return;
    }
    if (!node) {
      node = el('p', 'kui-dialog__subtitle');
      node.setAttribute('data-dialog-subtitle', '');
      if (titleEl && titleEl.nextSibling) { headerEl.insertBefore(node, titleEl.nextSibling); }
      else { headerEl.appendChild(node); }
    }
    node.textContent = text;
  }

  function renderTitle(config) {
    if (!titleEl) { return; }
    var title = config.title !== undefined && config.title !== null ? String(config.title) : '';
    titleEl.textContent = title || txt('dialog.title', '提示');
    titleEl.style.display = title ? '' : '';
    if (closeEl) {
      var closable = config.closable !== false;
      closeEl.style.display = closable ? '' : 'none';
      closeEl.setAttribute('aria-label', txt('dialog.close', '关闭'));
      closeEl.title = txt('dialog.close', '关闭');
    }
    if (headerEl) {
      headerEl.style.display = (config.title === false) ? 'none' : '';
    }
  }

  /* ------------------------------------------------------------------ */
  /* 表单：优先用 KUI.form / renderNode，缺失时降级自建控件              */
  /* ------------------------------------------------------------------ */

  function fieldLabel(node) {
    return node.label || node.title || node.placeholder || '';
  }

  function createFallbackControl(node) {
    var type = node.type || 'input';
    var control;
    if (type === 'textarea') {
      control = el('textarea', 'kui-dialog__textarea');
      control.value = node.value !== undefined ? node.value : '';
    } else if (type === 'select') {
      control = el('select', 'kui-dialog__select');
      (node.options || []).forEach(function (opt) {
        if (!opt) { return; }
        var option = document.createElement('option');
        var value = typeof opt === 'string' ? opt : (opt.value !== undefined ? opt.value : opt.label);
        option.value = String(value);
        option.textContent = typeof opt === 'string' ? opt : (opt.label !== undefined ? opt.label : value);
        if (node.value !== undefined && String(node.value) === String(value)) { option.selected = true; }
        control.appendChild(option);
      });
    } else if (type === 'switch') {
      control = el('input', 'kui-dialog__input');
      control.type = 'checkbox';
      control.checked = !!node.value;
    } else {
      control = el('input', 'kui-dialog__input');
      control.type = node.inputType || node.input && node.input.type || 'text';
      control.value = node.value !== undefined ? node.value : '';
      if (node.placeholder) { control.placeholder = node.placeholder; }
      if (node.maxlength) { control.maxLength = node.maxlength; }
    }
    return control;
  }

  function getControlValue(control) {
    if (!control) { return undefined; }
    var inst = control.__kuiControl || control.__kuiInstance;
    if (inst && typeof inst.getValue === 'function') {
      return safe(function () { return inst.getValue(); }, undefined);
    }
    if (control.type === 'checkbox') { return !!control.checked; }
    return control.value;
  }

  function setControlValue(control, value) {
    if (!control) { return; }
    var inst = control.__kuiControl || control.__kuiInstance;
    if (inst && typeof inst.setValue === 'function') {
      safe(function () { inst.setValue(value); });
      return;
    }
    if (control.type === 'checkbox') { control.checked = !!value; return; }
    control.value = value === undefined || value === null ? '' : String(value);
  }

  // 规则写法兼容三种：
  //   1) 字符串数组：['required', 'email']
  //   2) {type,value,message} 数组：[{ type:'min', value:2, message:'...' }]
  //   3) 键值对象数组：[{ required:true, message:'...' }, { min:2, max:20, message:'...' }]
  //      —— 旧实现只认 1)2)，3) 会被当成「没有 type 的规则」并在末尾无条件套 message，
  //         导致「有内容反而校验失败、清空却能通过」的反向校验（v1.1.2 修复）。
  var RULE_KEYS = ['required', 'min', 'max', 'pattern', 'regex', 'email', 'url', 'len', 'minLength', 'maxLength'];
  function expandRule(rule) {
    if (!rule) { return []; }
    if (typeof rule === 'string') { return [{ type: rule }]; }
    if (typeof rule !== 'object') { return []; }
    var out = [];
    var declared = rule.type || rule.name;
    if (declared) {
      out.push({ type: declared, value: rule.value, message: rule.message });
      return out;
    }
    RULE_KEYS.forEach(function (key) {
      if (rule[key] === undefined || rule[key] === null) { return; }
      if (rule[key] === false) { return; }
      out.push({ type: key, value: rule[key], message: rule.message });
    });
    if (!out.length && rule.message) { out.push({ type: 'required', message: rule.message }); }
    return out;
  }

  function normalizeRules(node) {
    var rules = node.rules;
    if (!rules) {
      return node.required ? [{ type: 'required' }] : [];
    }
    if (Array.isArray(rules)) {
      var list = [];
      rules.forEach(function (rule) {
        expandRule(rule).forEach(function (r) { list.push(r); });
      });
      // 数组里没写 required 但节点标了 required，也补一条
      if (node.required) {
        var hasRequired = list.some(function (r) { return r.type === 'required'; });
        if (!hasRequired) { list.unshift({ type: 'required' }); }
      }
      return list;
    }
    if (typeof rules === 'object') {
      var out = [];
      Object.keys(rules).forEach(function (key) {
        out.push({ type: key, value: rules[key] });
      });
      return out;
    }
    return [];
  }

  function validateField(field) {
    var node = field.node || {};
    var value = getControlValue(field.control);
    var rules = normalizeRules(node);
    var message = '';
    var isEmpty = value === undefined || value === null || value === '' || value === false;
    rules.forEach(function (rule) {
      if (message) { return; }
      if (!rule) { return; }
      var ruleType = typeof rule === 'string' ? rule : (rule.type || rule.name || '');
      var ruleValue = typeof rule === 'object' ? rule.value : undefined;
      var failed = false;
      if (ruleType === 'required') {
        failed = isEmpty;
        if (failed) { message = rule.message || node.requiredMessage || txt('dialog.fieldRequired', '此项为必填项'); }
        return;
      }
      if (isEmpty) { return; }
      if (ruleType === 'min' || ruleType === 'minLength') {
        if (typeof value === 'number' ? value < ruleValue : String(value).length < ruleValue) {
          failed = true;
          message = rule.message || txt('dialog.fieldMin', '不能小于 {min}', { min: ruleValue });
        }
      } else if (ruleType === 'max' || ruleType === 'maxLength') {
        if (typeof value === 'number' ? value > ruleValue : String(value).length > ruleValue) {
          failed = true;
          message = rule.message || txt('dialog.fieldMax', '不能大于 {max}', { max: ruleValue });
        }
      } else if (ruleType === 'len') {
        if (String(value).length !== Number(ruleValue)) {
          failed = true;
          message = rule.message || txt('dialog.fieldLen', '长度需为 {len}', { len: ruleValue });
        }
      } else if (ruleType === 'pattern' || ruleType === 'regex') {
        var re = ruleValue instanceof RegExp ? ruleValue : safe(function () { return new RegExp(String(ruleValue)); }, null);
        if (re && !re.test(String(value))) {
          failed = true;
          message = rule.message || node.patternMessage || txt('dialog.fieldInvalid', '格式不正确');
        }
      } else if (ruleType === 'email') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
          failed = true;
          message = rule.message || txt('dialog.fieldEmail', '请输入有效邮箱');
        }
      } else if (ruleType === 'url') {
        if (!/^https?:\/\/\S+$/i.test(String(value))) {
          failed = true;
          message = rule.message || txt('dialog.fieldUrl', '请输入有效网址');
        }
      }
      if (failed && rule.message) { message = rule.message; }
    });
    if (field.errorEl) {
      field.errorEl.textContent = message;
      if (message) { field.wrap.classList.add('is-error'); }
      else { field.wrap.classList.remove('is-error'); }
    }
    return !message;
  }

  function collectFormData() {
    var data = {};
    state.fields.forEach(function (field) {
      var id = field.id;
      if (!id) { return; }
      var value = getControlValue(field.control);
      if (typeof id === 'string') {
        if (id.indexOf('.') >= 0) {
          safe(function () {
            if (K.utils && typeof K.utils.setByPath === 'function') { K.utils.setByPath(data, id, value); }
            else { data[id] = value; }
          });
        } else {
          data[id] = value;
        }
      }
    });
    return data;
  }

  function renderForm(host, config) {
    if (!host) { return; }
    var nodes = config.nodes || [];
    var data = config.data || {};
    state.fields = [];
    if (!Array.isArray(nodes) || !nodes.length) {
      // 没有 nodes 时按 prompt 处理
      renderPrompt(host, config);
      return;
    }
    // 优先使用 core 的表单引擎（controls/form.js 提供 KUI.form.create）
    var created = safe(function () {
      if (K.form && typeof K.form.create === 'function') {
        return K.form.create(host, {
          nodes: nodes,
          data: data,
          layout: config.layout,
          validateOn: config.validateOn
        });
      }
      return null;
    }, null);
    if (created && created.el) {
      state.formApi = created;
      // KUI.form.create(host) 会把表单直接挂进 host，并把 host 自身作为实例的 el 返回；
      // 直接 appendChild(host) 会抛 HierarchyRequestError（The new child contains the parent），
      // 异常会中断 render() → footer 按钮永远不渲染（v1.1.2 修复）。
      if (created.el !== host && created.el.parentNode !== host && host.appendChild) {
        host.appendChild(created.el);
      }
      return;
    }
    // 降级：逐个节点渲染并收集值
    var ctx = makeCtx();
    ctx.data = data;
    nodes.forEach(function (node) {
      if (!node || typeof node !== 'object') { return; }
      if (node.type === 'divider') {
        host.appendChild(el('div', 'kui-divider'));
        return;
      }
      var wrap = el('div', 'kui-dialog__field');
      var label = el('label', 'kui-dialog__label');
      var labelText = fieldLabel(node);
      label.textContent = labelText;
      var inputId = node.id || node.name || uid('kui-field');
      label.setAttribute('for', inputId);
      if (node.required) {
        var mark = el('span', 'kui-dialog__required');
        mark.textContent = ' *';
        label.appendChild(mark);
      }
      wrap.appendChild(label);
      var control = safe(function () { return K.renderNode(node, ctx); }, null);
      if (!control) { control = createFallbackControl(node); }
      control.id = control.id || inputId;
      if (data && node.id !== undefined && data[node.id] !== undefined && !(control.__kuiControl || control.__kuiInstance)) {
        setControlValue(control, data[node.id]);
      }
      wrap.appendChild(control);
      var errorEl = el('div', 'kui-dialog__error');
      wrap.appendChild(errorEl);
      host.appendChild(wrap);
      state.fields.push({
        id: node.id || node.name || inputId,
        node: node,
        wrap: wrap,
        control: control,
        errorEl: errorEl
      });
    });
  }

  function renderPrompt(host, config) {
    if (!host) { return; }
    var wrap = el('div', 'kui-dialog__field');
    var label = el('label', 'kui-dialog__label');
    label.textContent = config.label || config.placeholder || '';
    wrap.appendChild(label);
    var inputConfig = config.input || {};
    // 多行输入：input.type = 'textarea' 时用 textarea（带主题化缩放角标），
    // 不能把 'textarea' 赋给 <input type>（会被浏览器退化成单行文本）。
    var isArea = String(inputConfig.type || '').toLowerCase() === 'textarea';
    var input = el(isArea ? 'textarea' : 'input', isArea ? 'kui-dialog__textarea' : 'kui-dialog__input');
    // 拼写检查 / 自动纠正 / 输入法联想在部分浏览器+显卡组合下会让逐字输入明显卡顿，弹窗内统一关闭
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocomplete', 'off');
    var initialValue = config.defaultValue !== undefined && config.defaultValue !== null ? String(config.defaultValue) : '';
    if (isArea) {
      input.rows = inputConfig.rows || 3;
      input.value = initialValue;
      input.placeholder = config.placeholder || inputConfig.placeholder || '';
      if (inputConfig.maxlength) { input.maxLength = inputConfig.maxlength; }
    } else {
      input.type = inputConfig.type || 'text';
      input.value = config.defaultValue !== undefined && config.defaultValue !== null ? String(config.defaultValue) : '';
      input.placeholder = config.placeholder || inputConfig.placeholder || '';
      if (inputConfig.maxlength) { input.maxLength = inputConfig.maxlength; }
      if (inputConfig.min !== undefined) { input.min = String(inputConfig.min); }
      if (inputConfig.max !== undefined) { input.max = String(inputConfig.max); }
    }
    wrap.appendChild(input);
    var errorEl = el('div', 'kui-dialog__error');
    wrap.appendChild(errorEl);
    host.appendChild(wrap);
    // 多行输入：右下角追加主题化缩放角标（与框架 textarea 同材质）
    if (isArea && K.enhance && typeof K.enhance.grip === 'function') {
      safe(function () { K.enhance.grip(input, { min: 72 }); });
    }
    state.fields = [{
      id: '__prompt__',
      node: config,
      wrap: wrap,
      control: input,
      errorEl: errorEl
    }];
    input.addEventListener('keydown', function (ev) {
      if (!ev) { return; }
      // 多行输入：Enter 应当换行；Ctrl/Cmd + Enter 才是提交。
      if (isArea) {
        if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey) && !ev.isComposing) {
          ev.preventDefault();
          submitAction();
        }
        return;
      }
      if (ev.key === 'Enter' && !ev.isComposing) {
        ev.preventDefault();
        submitAction();
      }
    });
  }

  // v1.1.4：把 form.validate() 的返回值归一化成布尔。
  //   KUI.form.create(...).validate() 返回 { valid, errors, data } 对象，
  //   旧实现直接 !!valid → 对象恒真 → 弹窗表单的必填校验永远判通过（有星号也能空着保存）。
  function isValidatePassed(res) {
    if (res === false) { return false; }
    if (res && typeof res === 'object') {
      if (res.valid === false) { return false; }
      if (res.ok === false) { return false; }
    }
    return true;
  }

  function validateForm() {
    if (state.formApi && typeof state.formApi.validate === 'function') {
      var result = safe(function () { return state.formApi.validate(); }, false);
      if (result && typeof result.then === 'function') {
        return result.then(isValidatePassed, function () { return false; });
      }
      return Promise.resolve(isValidatePassed(result));
    }
    var ok = true;
    state.fields.forEach(function (field) {
      // v1.3.0：联动隐藏的字段不参与必填校验
      var wrap = null;
      try { wrap = field && field.closest ? field.closest('.kui-dialog__field') : null; } catch (e) { wrap = null; }
      if (wrap && (wrap.hidden || wrap.style.display === 'none')) { return; }
      if (!validateField(field)) { ok = false; }
    });
    return Promise.resolve(ok);
  }

  function readFormValue() {
    if (state.type === 'prompt') {
      var field = state.fields[0];
      return field ? getControlValue(field.control) : '';
    }
    if (state.formApi && typeof state.formApi.getData === 'function') {
      return safe(function () { return state.formApi.getData(); }, {});
    }
    return collectFormData();
  }

  /* ------------------------------------------------------------------ */
  /* 按钮组                                                              */
  /* ------------------------------------------------------------------ */

  function buildFooter(config) {
    if (!footerEl) { return; }
    clear(footerEl);
    var type = state.type;
    var okText = config.okText || config.submitText || txt('dialog.ok', '确定');
    var cancelText = config.cancelText || txt('dialog.cancel', '取消');
    var actions = el('div', 'kui-dialog__actions');
    var buttons = [];

    function addCancel(pull) {
      var btn = makeButton({
        text: cancelText,
        type: 'ghost',
        onClick: function () { cancelDialog(); }
      });
      actions.insertBefore(btn, actions.firstChild);
      return btn;
    }

    function addOk(extra) {
      var option = { text: okText, type: config.danger ? 'danger' : 'primary' };
      if (extra) { Object.keys(extra).forEach(function (k) { option[k] = extra[k]; }); }
      option.onClick = submitAction;
      var btn = makeButton(option);
      actions.appendChild(btn);
      state.primary = btn;
      return btn;
    }

    if (type === 'alert') {
      addOk();
    } else if (type === 'confirm') {
      addCancel();
      addOk();
    } else if (type === 'prompt') {
      addCancel();
      addOk();
    } else if (type === 'form') {
      addCancel();
      addOk();
    } else {
      // custom：配置化 actions；未配置时给一个关闭按钮
      var customActions = config.actions;
      if (Array.isArray(customActions) && customActions.length) {
        customActions.forEach(function (item) {
          if (!item) { return; }
          var option = {
            text: item.text || item.label || '',
            type: item.type === 'primary' ? 'primary' : (item.type === 'danger' ? 'danger' : (item.type === 'ghost' ? 'ghost' : '')),
            icon: item.icon,
            disabled: item.disabled,
            action: item.action,
            params: item.params,
            close: item.close,
            value: item.value
          };
          if (item.id) { option.id = item.id; }
          if (option.type === 'primary') { state.primary = null; }
          actions.appendChild(makeButton(option));
        });
      } else {
        actions.appendChild(makeButton({
          text: config.okText || txt('dialog.close', '关闭'),
          onClick: function () { cancelDialog(); }
        }));
      }
    }
    if (actions.childNodes.length) { footerEl.appendChild(actions); }
  }

  function setSubmitting(flag) {
    state.submitting = !!flag;
    if (!footerEl) { return; }
    var buttons = footerEl.querySelectorAll('.kui-dialog__btn');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].disabled = !!flag;
    }
    if (flag && state.primary) {
      var spinner = el('span', 'kui-btn-spinner');
      state.primary.appendChild(spinner);
    } else if (state.primary) {
      var spinners = state.primary.querySelectorAll('.kui-btn-spinner');
      for (var j = 0; j < spinners.length; j++) {
        if (spinners[j].parentNode) { spinners[j].parentNode.removeChild(spinners[j]); }
      }
    }
  }

  function submitAction() {
    if (state.submitting) { return; }
    var config = state.config || {};
    if (state.type === 'alert' || state.type === 'custom') {
      resolveDialog(state.type === 'custom' ? (config.value === undefined ? null : config.value) : null);
      return;
    }
    setSubmitting(true);
    validateForm().then(function (ok) {
      if (!ok) {
        setSubmitting(false);
        return;
      }
      var data = readFormValue();
      if (state.type === 'prompt') {
        resolveDialog(data === undefined ? '' : data);
        return;
      }
      // form：有 submitApi 时交给父级执行（父级持有原始函数与 loading 控制）
      if (config.submitApi || config.remoteSubmit) {
        request(parentOrNull(), 'dialog:form-submit', { data: data })
          .then(function (res) {
            // 父级成功后通常直接 resolve 并关闭；若父级返回 {close:false} 则保持打开
            if (res && res.close === false) {
              setSubmitting(false);
              if (res.message) { showError(res.message); }
              return;
            }
            resolveDialog(data);
          })
          .catch(function (err) {
            setSubmitting(false);
            showError(err && err.message ? err.message : txt('dialog.submitFailed', '提交失败，请重试'));
          });
        return;
      }
      resolveDialog(data);
    }).catch(function () {
      setSubmitting(false);
    });
  }

  function showError(message) {
    if (!message) { return; }
    if (state.fields.length && state.fields[0].errorEl) {
      state.fields[0].errorEl.textContent = String(message);
    }
    // 同时通知父级用 toast 提示，避免小弹窗里被忽略
    post('dialog:toast', { type: 'error', message: String(message) });
  }

  /* ------------------------------------------------------------------ */
  /* 渲染总入口                                                          */
  /* ------------------------------------------------------------------ */

  function render(config, method) {
    state.config = config || {};
    // 父级 factory 会带上权威 method（alert/confirm/prompt/form/custom）；
    // config.type 可能已被业务配置改成配色语义（如 'info'），不能作为渲染类型。
    state.type = method || state.method || config.type || 'custom';
    state.method = state.type;
    state.resolved = false;
    state.submitting = false;
    state.formApi = null;
    state.primary = null;
    if (rootEl) {
      rootEl.className = 'kui-dialog kui-dialog--frame kui-dialog--' + state.type;
      if (config.className) { rootEl.className += ' ' + config.className; }
      if (config.draggable) {
        rootEl.className += ' is-draggable';
        document.body.classList.add('is-dialog-draggable');
      }
      if (config.flat) { rootEl.className += ' is-plain'; }
    }
    renderTitle(config);
    renderIcon(config);
    renderSubtitle(config);
    if (bodyEl) {
      clear(bodyEl);
      try {
      if (state.type === 'alert' || state.type === 'confirm') {
        renderMessage(bodyEl, config);
      } else if (state.type === 'prompt') {
        renderMessage(bodyEl, config);
        renderPrompt(bodyEl, config);
      } else if (state.type === 'form') {
        renderForm(bodyEl, config);
      } else {
        // custom：优先 nodes；没有 nodes 时退化为 message/html（旧实现只认 nodes，会渲染成空白）
        var hasNodes = Array.isArray(config.nodes) ? config.nodes.length > 0 : !!config.nodes;
        if (hasNodes) {
          renderNodes(bodyEl, config.nodes, config.data);
        } else {
          renderMessage(bodyEl, config);
        }
      }
      // 兜底：任何类型渲染后正文仍为空时用 message/html 补齐，避免"空白弹窗"
      if (!hasRenderableContent(bodyEl) && (config.message || config.html)) {
        var fallbackConfig = {};
        Object.keys(config).forEach(function (k) { fallbackConfig[k] = config[k]; });
        fallbackConfig.nodes = null;
        renderMessage(bodyEl, fallbackConfig);
      }
      } catch (renderErr) {
        // 正文渲染失败也必须继续渲染 footer，否则用户会看到"没有提交按钮"的弹窗
        if (K.error) { K.error('弹窗正文渲染失败：' + (renderErr && renderErr.message ? renderErr.message : renderErr)); }
      }
    }
    safe(function () { buildFooter(config); });
    // 焦点限制：打开后聚焦首个可聚焦元素，Tab 在 iframe 内部自然循环
    focusFirst();
    scheduleResize();
    // 注意：这里不能 post dialog:ready：
    // 就绪由 sendReady() 统一上报一次；render 会因 dialog:update / 主题切换重复执行，
    // 若在 render 里回发 ready，父级会再次 sendInit → render → ready → …无限乒乓（v1.1.1 修复）。
  }

  function focusFirst() {
    var target = safe(function () {
      if (!bodyEl) { return null; }
      var controls = bodyEl.querySelectorAll('input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (controls.length) { return controls[0]; }
      return rootEl ? rootEl.querySelector('.kui-dialog__btn') : null;
    }, null);
    if (target && typeof target.focus === 'function') {
      safe(function () { target.focus(); target.select && target.select(); });
    }
  }

  /* ------------------------------------------------------------------ */
  /* 拖拽（把指针位置上报父级，由父级移动 iframe）                        */
  /* ------------------------------------------------------------------ */

  function bindDrag() {
    if (!headerEl) { return; }
    on(headerEl, 'mousedown', function (ev) {
      if (!state.config.draggable) { return; }
      if (ev.target === closeEl || (closeEl && closeEl.contains(ev.target))) { return; }
      if (ev.button !== 0) { return; }
      ev.preventDefault();
      state.drag = { active: true };
      post('dialog:drag-start', { x: ev.screenX, y: ev.screenY });
      document.body.classList.add('is-dragging');
    });
    on(document, 'mousemove', function (ev) {
      if (!state.drag || !state.drag.active) { return; }
      post('dialog:drag-move', { x: ev.screenX, y: ev.screenY });
    });
    on(document, 'mouseup', function () {
      if (!state.drag || !state.drag.active) { return; }
      state.drag.active = false;
      document.body.classList.remove('is-dragging');
      post('dialog:drag-end', {});
    });
  }

  /* ------------------------------------------------------------------ */
  /* 键盘：Esc 取消、Enter 在单行输入时提交                              */
  /* ------------------------------------------------------------------ */

  function bindKeyboard() {
    on(document, 'keydown', function (ev) {
      if (!ev) { return; }
      if (ev.key === 'Escape') {
        if (state.config.closeOnEsc === false) { return; }
        ev.preventDefault();
        requestClose();
        return;
      }
      if (ev.key === 'Enter' && !ev.isComposing) {
        var tag = ev.target && ev.target.tagName ? String(ev.target.tagName).toLowerCase() : '';
        if (tag === 'textarea') { return; }
        if (state.type === 'prompt' || state.type === 'form' || state.type === 'confirm' || state.type === 'alert') {
          ev.preventDefault();
          submitAction();
        }
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* 消息处理                                                            */
  /* ------------------------------------------------------------------ */

  function handleMessage(event) {
    // 严格校验来源：只接受父窗口（tabs/dialog.js 所在页面）的消息
    var parent = getParent();
    if (!parent || event.source !== parent) { return; }
    var data = event.data;
    if (!data || typeof data !== 'object' || data.__kui !== true) { return; }

    if (data.type === 'dialog:init') {
      var payload = data.payload || {};
      state.inited = true;
      state.dialogId = payload.dialogId || payload.id || '';
      if (state.readyTimer) {
        global.clearTimeout(state.readyTimer);
        state.readyTimer = 0;
      }
      if (payload.theme || payload.tokens) { applyTheme(payload.theme || payload); }
      render(payload.config || payload, payload.method);
      reportHeight(true);
      return;
    }
    if (data.type === 'dialog:update') {
      var patch = (data.payload && (data.payload.patch || data.payload.config)) || {};
      var next = {};
      Object.keys(state.config || {}).forEach(function (k) { next[k] = state.config[k]; });
      Object.keys(patch).forEach(function (k) { next[k] = patch[k]; });
      render(next, state.method);
      return;
    }
    if (data.type === 'dialog:close') {
      // 父级主动关闭：无需回执，父级会移除本 iframe
      return;
    }
    if (data.type === 'theme:apply') {
      applyTheme(data.payload || {});
      return;
    }
    if (data.type === 'dialog:form-error') {
      setSubmitting(false);
      showError((data.payload && data.payload.message) || txt('dialog.submitFailed', '提交失败，请重试'));
      return;
    }
    if (data.type === 'dialog:open:result') {
      settle(data.requestId, true, (data.payload || {}).value);
      return;
    }
    if (data.type === 'dialog:action:result') {
      settle(data.requestId, !!(data.payload && data.payload.ok), data.payload || {});
      return;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 启动：请求父级初始化                                                */
  /* ------------------------------------------------------------------ */

  function sendReady() {
    state.readyTries += 1;
    if (state.inited || state.readyTries > 6) { return; }
    post('dialog:ready', { dialogId: state.dialogId, version: (K && K.version) || '' });
    state.readyTimer = global.setTimeout(sendReady, 700);
  }

  /* ------------------------------------------------------------------ */
  /* 动作桥：弹窗 iframe 内节点上的 on 动作                              */
  /*   背景：JSON 里 { action: 'app.applyTheme' } 这种父页面注册的动作、  */
  /*         以及 { fn: 'menu.toggleCollapse' } 这类业务函数只在父页面注册，  */
  /*         弹窗 iframe 本地找不到，必须回发 dialog:action 交父级执行。  */
  /*         （此前只有 footer 按钮走转发，正文 nodes 上的 on 动作会静默失效）*/
  /* ------------------------------------------------------------------ */

  function installActionBridge() {
    if (!K.actions || typeof K.actions.run !== 'function') { return false; }
    if (K.actions.__kuiBridged) { return true; }

    var nativeRun = K.actions.run;
    var COMPONENT_RE = /^(app|theme|tab|tabs|nav|menu|menunav|toast|dialog|handlers|form|frame)\./;

    function hasLocal(name) {
      return !!(K.actions && typeof K.actions.has === 'function' && K.actions.has(name));
    }

    // 这些前缀的动作在弹窗 iframe 里没有对应组件/注册表，必须交父页面
    function remoteOnly(name) {
      if (!name) { return true; }
      return COMPONENT_RE.test(name);
    }

    function send(name, params, ctx) {
      var parent = getParent();
      if (!parent) { return undefined; }
      return request(parent, 'dialog:action', { action: name, params: params || {} }, 4000)['then'](function (res) {
        if (res && typeof res === 'object' && 'ok' in res) {
          if (res.ok === false && res.error) {
            post('dialog:debug', { message: '父页面执行动作失败: ' + name + ' / ' + res.error });
            // 父页面未注册该动作：给出可见提示，避免节点上的动作静默失效
            post('dialog:toast', {
              type: 'warning',
              title: txt('dialog.actionMissing', '动作未注册'),
              message: res.error
            });
          }
          return res.ok === false ? undefined : res.result;
        }
        return res;
      })['catch'](function () {
        // 无父级 / 超时 / 父级异常时静默降级，避免节点动作阻塞渲染
        return undefined;
      });
    }

    function dispatch(name, params, ctx, ev) {
      if (!name) { return undefined; }
      // 组件级前缀动作（app/theme/tab/menu/...）在弹窗 iframe 内没有宿主，必须交父页面执行
      if (remoteOnly(name)) { return send(name, params, ctx); }
      if (hasLocal(name)) {
        return nativeRun.call(K.actions, { action: name, params: params || {} }, ctx, ev);
      }
      // 本地未注册的页面级业务动作同样交父页面执行（旧实现按白名单静态丢弃 → 按钮无反应）
      return send(name, params, ctx);
    }

    function runSpec(spec, ctx, ev) {
      if (spec === null || spec === undefined || spec === '') { return undefined; }
      if (Array.isArray(spec)) {
        var out = [];
        for (var i = 0; i < spec.length; i++) { out.push(runSpec(spec[i], ctx, ev)); }
        return out;
      }
      if (typeof spec === 'function') { return spec(ctx || {}, ev); }
      if (typeof spec === 'string') { return dispatch(spec, {}, ctx, ev); }
      if (typeof spec !== 'object') { return nativeRun.call(K.actions, spec, ctx, ev); }
      if (spec.actions) { return runSpec(spec.actions, ctx, ev); }
      if (spec.chain) { return runSpec(spec.chain, ctx, ev); }
      if (spec.fn || spec.handler) {
        var hs = spec.handler || spec.fn;
        var hname = typeof hs === 'string' ? hs : (hs && (hs.fn || hs.name || hs['function']));
        var hargs = spec.args || spec.params || spec.data || {};
        if (hs && typeof hs === 'object') { hargs = hs.args || hs.params || hargs; }
        return dispatch('handlers.run', { fn: hname, args: hargs }, ctx, ev);
      }
      if (spec.action) { return dispatch(spec.action, spec.params || spec.args || spec.data || {}, ctx, ev); }
      if (spec.emit) {
        var detail = spec.detail || spec.params || {};
        safe(function () {
          if (ctx && typeof ctx.emit === 'function') { ctx.emit(spec.emit, detail); }
          else { post('dialog:toast', { name: spec.emit, detail: detail }); }
        });
        return undefined;
      }
      if (spec.theme) {
        return dispatch('theme.apply', typeof spec.theme === 'string' ? { id: spec.theme } : spec.theme, ctx, ev);
      }
      if (spec.tab) { return dispatch('tab.open', spec.tab, ctx, ev); }
      if (spec.toast) { return dispatch('toast.show', spec.toast, ctx, ev); }
      if (spec.dialog) {
        var d = spec.dialog;
        var kind = (d && (d.kind || d.mode)) || 'alert';
        return dispatch('dialog.' + kind, d || {}, ctx, ev);
      }
      return nativeRun.call(K.actions, spec, ctx, ev);
    }

    K.actions.run = function (action, ctx, ev) {
      return runSpec(action, ctx, ev);
    };
    K.actions.__kuiBridged = true;
    return true;
  }

  function boot() {
    if (!rootEl) { return; }
    // 先把动作桥装好，保证弹窗内 nodes 上的 on 动作能转发父页面
    safe(installActionBridge);
    // 悬浮提示：弹窗同样是独立 iframe，原生 title 会露出浏览器默认样式，统一接管
    safe(function () {
      if (K.tooltip && typeof K.tooltip.init === 'function') { K.tooltip.init(); }
    });
    on(global, 'message', handleMessage);
    bindDrag();
    bindKeyboard();
    observeSize();
    // 关闭按钮
    on(closeEl, 'click', function (ev) {
      if (ev && ev.preventDefault) { ev.preventDefault(); }
      requestClose();
    });
    // 先应用一次宿主默认主题，再向父级请求当前主题（父级回 theme:apply）
    applyTheme({});
    post('dialog:theme-request', {});
    sendReady();
    scheduleResize();
    // 暴露最小 API 给弹窗内的自定义 nodes/脚本使用
    K.dialogFrame = {
      close: requestClose,
      resolve: resolveDialog,
      cancel: cancelDialog,
      resize: function () { reportHeight(true); },
      getConfig: function () { return state.config; },
      toast: function (options) {
        post('dialog:toast', options);
      }
    };
    // 弹窗内调用 KUI.dialog.* 时转发父级，保证嵌套弹窗仍然是独立 iframe
    mountDialogProxy();
    mountToastProxy();
  }

  function mountDialogProxy() {
    var proxy = K.dialog || {};
    function open(method, config) {
      config = config || {};
      var payload = { method: method, config: config };
      return request(parentOrNull(), 'dialog:open', payload).then(function (res) {
        var value = res && typeof res === 'object' && 'result' in res ? res.result : res;
        if (method === 'confirm') { return !!value; }
        if (method === 'alert') { return undefined; }
        return value;
      });
    }
    proxy.alert = function (config) { return open('alert', typeof config === 'string' ? { message: config } : config); };
    proxy.confirm = function (config) { return open('confirm', typeof config === 'string' ? { message: config } : config); };
    proxy.prompt = function (config) { return open('prompt', typeof config === 'string' ? { message: config } : config); };
    proxy.form = function (config) { return open('form', config); };
    proxy.custom = function (config) { return open('custom', config); };
    proxy.open = function (config) {
      var method = (config && config.type) || 'custom';
      return open(method, config);
    };
    proxy.close = function () { requestClose(); return true; };
    proxy.closeAll = function () { requestClose(); return true; };
    proxy.get = function () { return state.config; };
    proxy.update = function (patch) {
      if (patch) {
        Object.keys(patch).forEach(function (k) { state.config[k] = patch[k]; });
        render(state.config);
      }
      return true;
    };
    K.dialog = proxy;
  }

  function mountToastProxy() {
    if (K.toast) { return; }
    K.toast = {
      show: function (options) {
        post('dialog:toast', typeof options === 'string' ? { message: options } : options);
        return '';
      },
      info: function (m) { post('dialog:toast', { type: 'info', message: m }); },
      success: function (m) { post('dialog:toast', { type: 'success', message: m }); },
      warning: function (m) { post('dialog:toast', { type: 'warning', message: m }); },
      error: function (m) { post('dialog:toast', { type: 'error', message: m }); },
      close: function () { return false; },
      closeAll: function () { return false; }
    };
  }

  if (document.readyState === 'loading') {
    on(document, 'DOMContentLoaded', boot);
  } else {
    boot();
  }

  // 供父级或调试使用（非公开契约）
  global.__KUI_DIALOG_FRAME__ = {
    post: post,
    getState: function () { return state; }
  };
})(window);

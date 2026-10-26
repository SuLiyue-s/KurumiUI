/*!
 * KurumiUI - controls entry（控件库装配入口）
 *
 * 职责：
 *   1. 维护 KUI.controls.files 子文件清单（index.js 一加载就必须存在，供测试/其他工具读取）。
 *   2. 在 document 解析期间用 document.write 同步注入子脚本（file:// 直接双击 index.html 也可用）。
 *   3. 非解析期（defer / 动态 import / 测试环境）改为按 files 顺序串行 createElement('script')，
 *      全部完成后自动 KUI.controls.init()。
 *   4. 注册 form 类型（render 时委托 KUI.form.create，form.js 由 index.html 单独引入）。
 *   5. init 幂等：重复调用不重复注册、不报错。
 *
 * 注意：本文件不自动加载 form.js；也不依赖任何构建工具。
 */
(function (global) {
  'use strict';

  var KUI = global.KUI = global.KUI || {};
  var controls = KUI.controls = KUI.controls || {};

  /* ---------- 1. 子文件清单（一加载就存在） ---------- */
  var FILES = [
    'control-base.js',
    'inputs.js',
    'selects.js',
    'choices.js',
    'pickers.js',
    'misc.js'
  ];
  controls.files = FILES.slice();
  controls.entry = 'index.js';

  var doc = typeof document !== 'undefined' ? document : null;
  var win = typeof window !== 'undefined' ? window : global;

  /* ---------- 2. 定位当前脚本目录 ---------- */
  function scriptDir() {
    var s = doc ? doc.currentScript : null;
    if (!s && doc && doc.getElementsByTagName) {
      var list = doc.getElementsByTagName('script');
      s = list && list.length ? list[list.length - 1] : null;
    }
    var src = s && s.src ? String(s.src) : '';
    var i = src.lastIndexOf('/');
    return i >= 0 ? src.slice(0, i + 1) : '';
  }

  var baseDir = scriptDir();
  controls.baseDir = baseDir;

  /* ---------- 3. 幂等 init ---------- */
  var registered = false;

  /**
   * 注册全部已定义的控件类型 + form 类型。
   * 可重复调用；返回本次新注册的数量（已注册过返回 0）。
   */
  controls.init = function () {
    if (typeof controls.registerAll !== 'function') {
      // control-base.js 尚未加载：等待其加载后由加载器再次调用
      return 0;
    }
    var count = 0;
    try {
      count = controls.registerAll() || 0;
    } catch (e) {
      if (win.console && win.console.error) { win.console.error('[KUI.controls] 注册控件失败', e); }
    }
    if (registerFormType()) { count += 1; }
    if (registered && count === 0) { return 0; }
    registered = true;
    controls.__inited = true;
    dispatchReady();
    return count;
  };

  /* ---------- 4. form 类型（委托 KUI.form，form.js 后加载） ---------- */
  var formTypeReady = false;

  function registerFormType() {
    if (formTypeReady) { return false; }
    var reg = KUI.registry;
    if (!reg || typeof reg.register !== 'function') { return false; }
    if (typeof reg.has === 'function' && reg.has('form')) {
      formTypeReady = true;
      return false;
    }
    try {
      reg.register('form', {
        category: 'layout',
        defaults: {
          bordered: false,
          labelWidth: 96,
          labelPosition: 'left',
          submitText: '提交',
          resetText: '重置',
          showSubmit: false
        },
        render: function (node, ctx) {
          var util = KUI.controls && KUI.controls.base ? KUI.controls.base : null;
          var host = (util ? util.el('div', { 'class': 'kui-form-host kui-control kui-control--form' })
            : doc.createElement('div'));
          if (!util) {
            host.className = 'kui-form-host kui-control kui-control--form';
          }
          if (node && node.id) { host.setAttribute('data-kui-id', node.id); }
          host.setAttribute('data-kui-type', 'form');
          var opts = util ? util.getProps(node) : (node && node.props ? node.props : {});
          opts = opts || {};
          if (!opts.nodes) { opts.nodes = (node && (node.children || node.fields)) || []; }
          opts.node = node;
          opts.ctx = ctx;
          opts.host = host;
          var inst = null;
          var api = {
            el: host,
            instance: null,
            node: node,
            getValue: function () { return inst && inst.getValue ? inst.getValue() : null; },
            getData: function () { return inst && inst.getData ? inst.getData() : null; },
            setValue: function (v) { if (inst && inst.setValue) { inst.setValue(v); } return api; },
            setData: function (v) { if (inst && inst.setData) { inst.setData(v); } return api; },
            getField: function (id) { return inst && inst.getField ? inst.getField(id) : null; },
            validate: function () { return inst && inst.validate ? inst.validate() : { valid: true, errors: [], data: {} }; },
            clearValidate: function () { if (inst && inst.clearValidate) { inst.clearValidate(); } return api; },
            reset: function () { if (inst && inst.reset) { inst.reset(); } return api; },
            subscribe: function (fn) {
              if (inst && inst.subscribe) { return inst.subscribe(fn); }
              return function () {};
            },
            getInstance: function () { return inst; },
            destroy: function () { if (inst && inst.destroy) { inst.destroy(); } }
          };
          host.__kuiControl = api;
          if (KUI.form && typeof KUI.form.create === 'function') {
            try {
              inst = KUI.form.create(host, opts);
              api.instance = inst;
            } catch (e) {
              if (win.console && win.console.error) { win.console.error('[KUI.controls] form 创建失败', e); }
              host.setAttribute('data-kui-error', 'create');
            }
          } else {
            host.setAttribute('data-kui-error', 'no-form');
            if (win.console && win.console.warn) {
              win.console.warn('[KUI.controls] 未找到 KUI.form.create，请先引入 src/components/form.js');
            }
          }
          return host;
        },
        api: function (el) { return el.__kuiControl; }
      });
      formTypeReady = true;
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- 5. ready 回调（测试/外部工具可用） ---------- */
  var readyQueue = [];
  var readyFired = false;

  function dispatchReady() {
    if (readyFired) { return; }
    readyFired = true;
    var list = readyQueue.slice();
    readyQueue.length = 0;
    for (var i = 0; i < list.length; i++) {
      try { list[i](controls); } catch (e) { /* ignore */ }
    }
  }

  controls.ready = function (fn) {
    if (typeof fn !== 'function') { return; }
    if (readyFired || (controls.__inited && registered)) {
      try { fn(controls); } catch (e) { /* ignore */ }
      return;
    }
    readyQueue.push(fn);
  };

  /* ---------- 6. 同步注入（解析期，file:// 可用） ---------- */
  function writeScripts() {
    if (!doc || typeof doc.write !== 'function') { return false; }
    if (doc.readyState !== 'loading') { return false; }
    for (var i = 0; i < FILES.length; i++) {
      doc.write('<script src="' + baseDir + FILES[i] + '"><\/script>');
    }
    // 注入完成后由这段内联脚本触发 init（此时子文件均已执行）
    doc.write('<script>try{window.KUI&&KUI.controls&&KUI.controls.init&&KUI.controls.init();}catch(e){' +
      'if(window.console&&console.error){console.error("[KUI.controls] auto init failed",e);}}<\/script>');
    return true;
  }

  /* ---------- 7. 串行动态加载（非解析期） ---------- */
  function headEl() {
    return (doc && (doc.head || (doc.getElementsByTagName && doc.getElementsByTagName('head')[0]))) || null;
  }

  function loadSerial(done) {
    if (!doc || typeof doc.createElement !== 'function') { if (done) { done(); } return; }
    var parent = headEl() || doc.body || doc.documentElement;
    if (!parent || typeof parent.appendChild !== 'function') { if (done) { done(); } return; }
    var index = 0;
    function next() {
      if (index >= FILES.length) { if (done) { done(); } return; }
      var file = FILES[index++];
      var s = doc.createElement('script');
      s.src = baseDir + file;
      s.async = false;
      s.setAttribute('data-kui-controls-file', file);
      var finished = false;
      function finish() {
        if (finished) { return; }
        finished = true;
        next();
      }
      s.onload = finish;
      s.onerror = function () {
        if (win.console && win.console.error) { win.console.error('[KUI.controls] 加载失败: ' + file); }
        finish();
      };
      parent.appendChild(s);
    }
    next();
  }

  /**
   * 主动加载全部子文件（可重复调用，第二次起直接回调）。
   */
  controls.load = function (done) {
    if (controls.__loaded && typeof controls.registerAll === 'function') {
      if (typeof done === 'function') { done(controls); }
      return;
    }
    controls.__loaded = true;
    loadSerial(function () {
      controls.init();
      if (typeof done === 'function') { done(controls); }
    });
  };

  /* ---------- 8. 自动引导 ---------- */
  function bootstrap() {
    if (controls.__bootstrapped) { return; }
    controls.__bootstrapped = true;
    if (win && win.__KUI_CONTROLS_NO_BOOT__ === true) { return; }
    if (!doc) { return; }

    if (writeScripts()) {
      // 解析期：脚本由 document.write 注入，init 由注入的内联脚本触发
      return;
    }
    if (doc.readyState === 'loading') {
      // 解析期但 document.write 不可用（极少数环境）：等 DOMContentLoaded 后串行加载
      doc.addEventListener('DOMContentLoaded', function () { controls.load(); });
      return;
    }
    controls.load();
  }

  bootstrap();
})(typeof window !== 'undefined' ? window : this);

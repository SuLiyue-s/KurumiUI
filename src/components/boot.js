/*!
 * KurumiUI · shell · boot.js（启动层 / 加载中页面）
 * ---------------------------------------------------------------
 * 「访问服务时或刷新时的加载中页面」的可拆装组件：
 *   - 注册 type：boot（KUI.mount / KUI.renderNode 可独立渲染）
 *   - 静态 API：KUI.bootLayer（create / attach / configure / handsAt / instance）
 *   - 实例 API：setProgress / setStep / setText / setMeta / done / error / reset /
 *               show / hide / destroy / getState / handsAt
 *
 * 时钟指针：加载进度 0% → 100% 对应钟面 0 时 → 12 时。
 *   总时长（分钟）  = p / 100 * 720        （12 小时 = 720 分钟）
 *   时针角度        = 总分钟 / 720 * 360   （连续走，每分钟 0.5°）
 *   分针角度        = (总分钟 % 60) / 60 * 360
 *   即：0% 与 100% 均为 12 点整（两针重合朝上）；25% → 3:00；50% → 6:00；75% → 9:00。
 *   纯函数 handsAt(percent) 可单测，不依赖 DOM。
 *
 * 可拆装约定：
 *   - 本文件缺失时 bootstrap 会自动退回 index.html 里的静态骨架（.kui-boot__logo）；
 *   - 本文件存在时 attach() 会「接管」已有的 #kui-boot（不重建整层，避免白屏闪一下），
 *     也可 create(host, props) 在任意容器里从零渲染（standalone/boot.html 就这样用）。
 *
 * 契约：docs/00-contract.md §4（资源顺序）、§20（启动层组件）
 * 配置：config/app.json 的 boot 段；文案：config/text.json 的 boot 段
 */
(function (KUI) {
  'use strict';

  if (!KUI) { KUI = window.KUI = window.KUI || {}; }

  var hasOwn = Object.prototype.hasOwnProperty;

  /* ================= 防御式工具（core 缺失时仍可用） ================= */

  function safe(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
  }

  function deepMerge(base, patch) {
    var out = {}, key;
    for (key in base) {
      if (hasOwn.call(base, key)) { out[key] = base[key]; }
    }
    if (patch) {
      for (key in patch) {
        if (!hasOwn.call(patch, key)) { continue; }
        var pv = patch[key], bv = out[key];
        if (pv && typeof pv === 'object' && !Array.isArray(pv) &&
            bv && typeof bv === 'object' && !Array.isArray(bv)) {
          out[key] = deepMerge(bv, pv);
        } else {
          out[key] = pv;
        }
      }
    }
    return out;
  }

  function txt(key, fallback, vars) {
    var value = safe(function () { return KUI.text(key, fallback, vars); }, fallback);
    if (value === undefined || value === null || value === '') { return fallback; }
    return value;
  }

  function el(tag, cls) {
    var node = document.createElement(tag);
    if (cls) { node.className = cls; }
    return node;
  }

  function setClass(node, cls, on) {
    if (!node) { return; }
    if (on && node.classList) { node.classList.add(cls); }
    else if (!on && node.classList) { node.classList.remove(cls); }
  }

  function clampPercent(value) {
    var n = Number(value);
    if (!isFinite(n)) { n = 0; }
    if (n < 0) { n = 0; }
    if (n > 100) { n = 100; }
    return n;
  }

  function round(n, digits) {
    var k = Math.pow(10, digits || 0);
    return Math.round(n * k) / k;
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /* ================= 进度 → 时钟指针（纯函数，可单测） ================= */

  /**
   * 把加载进度换算成钟面角度。
   * @param {number} percent 0..100
   * @returns {{percent:number,totalMinutes:number,hourAngle:number,minuteAngle:number,
   *            hour12:number,clockText:string}}
   */
  function handsAt(percent) {
    var p = clampPercent(percent);
    /* 100% = 12 小时 = 720 分钟；0% 与 100% 都落在 12 点整 */
    var totalMinutes = p / 100 * 720;
    var hourAngle = totalMinutes / 720 * 360;
    var minuteAngle = (totalMinutes % 60) / 60 * 360;
    /* 夹角收口：避免 359.999999 这种浮点噪音（整点判定在测试里用容差） */
    if (Math.abs(hourAngle - 360) < 1e-9) { hourAngle = 360; }
    if (Math.abs(minuteAngle - 360) < 1e-9) { minuteAngle = 0; }
    var h = Math.floor(totalMinutes / 60);
    var m = Math.floor(totalMinutes % 60);
    /* 0% 与 100% 都指向 12 点整：读数统一显示 12:00（12 小时制写法） */
    if (totalMinutes >= 720 || totalMinutes < 1e-9) { h = 12; m = 0; }
    return {
      percent: p,
      totalMinutes: round(totalMinutes, 4),
      hourAngle: round(hourAngle, 4),
      minuteAngle: round(minuteAngle, 4),
      hour12: round(totalMinutes / 60, 4),
      clockText: pad2(h) + ':' + pad2(m)
    };
  }

  /* ================= 默认配置（全部可被 config/app.json 的 boot 覆盖） ================= */

  var DEFAULTS = {
    enabled: true,
    mode: 'fullscreen',            /* fullscreen | inline */
    title: '',
    subtitle: '',
    text: '',
    meta: true,                    /* 底部「百分比 + 时钟读数」 */
    clock: {
      enabled: true,
      mode: 'progress',            /* progress | spin | none */
      size: 74,                    /* 直径 px */
      ticks: 12,                   /* 刻度数 */
      smooth: true                 /* 指针带过渡动画 */
    },
    bar: {
      enabled: true,
      mode: 'progress'             /* progress | indeterminate */
    },
    stages: [
      { step: 1, text: '正在加载界面配置…', progress: 8 },
      { step: 2, text: '正在应用界面风格…', progress: 46 },
      { step: 3, text: '正在构建界面…', progress: 78 },
      { step: 4, text: '结界已就绪', progress: 100 }
    ]
  };

  var BOOT_ID = 'kui-boot';
  var HIDE_DELAY = 360;

  var state = {
    instance: null,
    config: deepMerge({}, DEFAULTS)
  };

  /* ================= 渲染 ================= */

  function buildNode(cfg, existingRoot) {
    /* existingRoot：接管页面里已有的静态骨架（index.html 的 #kui-boot），
     * 保留该节点本身，只清空并重建内部结构，避免整层重建造成闪烁。 */
    var root = existingRoot || el('div', 'kui-boot');
    root.className = 'kui-boot' + (cfg.mode === 'inline' ? ' kui-boot--inline' : '');
    while (root.firstChild) { root.removeChild(root.firstChild); }
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('data-boot-layer', 'true');
    root.setAttribute('data-boot-clock', cfg.clock.enabled ? 'on' : 'off');
    root.setAttribute('data-boot-clock-mode', cfg.clock.enabled ? cfg.clock.mode : 'off');
    root.setAttribute('data-boot-bar', cfg.bar.enabled ? cfg.bar.mode : 'off');
    root.style.setProperty('--kui-boot-progress', '0%');

    var inner = el('div', 'kui-boot__inner');

    /* ---- 时钟 ---- */
    var clock = el('div', 'kui-boot__clock');
    clock.setAttribute('aria-hidden', 'true');
    clock.style.setProperty('--kui-boot-size', (Number(cfg.clock.size) || 74) + 'px');
    var dial = el('div', 'kui-boot__dial');
    dial.style.setProperty('--kui-boot-ticks', String(Number(cfg.clock.ticks) || 12));
    var hourHand = el('span', 'kui-boot__hand kui-boot__hand--hour');
    var minuteHand = el('span', 'kui-boot__hand kui-boot__hand--minute');
    var pin = el('span', 'kui-boot__pin');
    clock.appendChild(dial);
    clock.appendChild(hourHand);
    clock.appendChild(minuteHand);
    clock.appendChild(pin);

    /* ---- 文案 ---- */
    var title = el('div', 'kui-boot__title');
    title.textContent = cfg.title || 'KurumiUI';
    var sub = el('div', 'kui-boot__sub');
    sub.textContent = cfg.subtitle || '';
    sub.hidden = !cfg.subtitle;

    /* ---- 进度条 ---- */
    var bar = el('div', 'kui-boot__bar');
    var barFill = el('span', '');
    bar.appendChild(barFill);

    /* ---- 当前步骤文案 ---- */
    var text = el('div', 'kui-boot__text');
    text.setAttribute('data-boot-text', 'true');
    text.textContent = cfg.text || '';

    /* ---- 百分比 + 时钟读数 ---- */
    var meta = el('div', 'kui-boot__meta');
    var percentNode = el('span', 'kui-boot__meta-percent');
    percentNode.setAttribute('data-boot-percent', '0%');
    var sep = el('span', 'kui-boot__meta-sep');
    sep.textContent = '·';
    var clockText = el('span', 'kui-boot__meta-clock');
    clockText.setAttribute('data-boot-clock-text', '12:00');
    clockText.textContent = '12:00';
    meta.appendChild(percentNode);
    meta.appendChild(sep);
    meta.appendChild(clockText);
    meta.hidden = !cfg.meta;

    var errorBox = el('div', 'kui-boot__error');
    errorBox.hidden = true;

    inner.appendChild(clock);
    inner.appendChild(title);
    inner.appendChild(sub);
    inner.appendChild(bar);
    inner.appendChild(text);
    inner.appendChild(meta);
    inner.appendChild(errorBox);
    root.appendChild(inner);

    return {
      root: root,
      inner: inner,
      clock: clock,
      dial: dial,
      hourHand: hourHand,
      minuteHand: minuteHand,
      title: title,
      sub: sub,
      bar: bar,
      barFill: barFill,
      text: text,
      meta: meta,
      percentNode: percentNode,
      clockText: clockText,
      errorBox: errorBox
    };
  }

  /* ================= 实例 ================= */

  function createInstance(host, props, adoptRoot, opts) {
    opts = opts || {};
    var cfg = normalizeConfig(props);
    var refs = buildNode(cfg, adoptRoot);
    var root = refs.root;

    var api = {
      el: root,
      config: cfg,
      /* 当前状态 */
      progress: 0,
      step: 0,
      visible: true,

      setProgress: function (percent, opts) {
        opts = opts || {};
        var h = handsAt(percent);
        api.progress = h.percent;
        root.style.setProperty('--kui-boot-progress', h.percent + '%');
        root.setAttribute('data-boot-percent', String(Math.round(h.percent)));
        refs.hourHand.style.transform = 'rotate(' + h.hourAngle + 'deg)';
        refs.minuteHand.style.transform = 'rotate(' + h.minuteAngle + 'deg)';
        if (!opts.silent) {
          refs.percentNode.textContent = Math.round(h.percent) + '%';
          refs.percentNode.setAttribute('data-boot-percent', Math.round(h.percent) + '%');
          refs.clockText.textContent = h.clockText;
          refs.clockText.setAttribute('data-boot-clock-text', h.clockText);
        }
        if (KUI.bus && typeof KUI.bus.emit === 'function') {
          safe(function () { KUI.bus.emit('boot:progress', { percent: h.percent, hands: h }); });
        }
        return api.progress;
      },

      getProgress: function () { return api.progress; },

      setText: function (value) {
        refs.text.textContent = (value === undefined || value === null) ? '' : String(value);
        return api;
      },

      setStep: function (step) {
        api.step = Number(step) || 0;
        root.setAttribute('data-boot-step', String(api.step));
        var stages = cfg.stages || [];
        for (var i = 0; i < stages.length; i++) {
          if (Number(stages[i].step) === api.step) {
            if (stages[i].text) { api.setText(stages[i].text); }
            if (stages[i].progress !== undefined) { api.setProgress(stages[i].progress); }
            break;
          }
        }
        return api;
      },

      setMeta: function (meta) {
        meta = meta || {};
        if (meta.title !== undefined) {
          refs.title.textContent = String(meta.title || '');
        }
        if (meta.subtitle !== undefined) {
          refs.sub.textContent = String(meta.subtitle || '');
          refs.sub.hidden = !meta.subtitle;
        }
        return api;
      },

      configure: function (patch, textCfg) {
        cfg = normalizeConfig(deepMerge(cfg, patch || {}), textCfg);
        api.config = cfg;
        root.className = 'kui-boot' + (cfg.mode === 'inline' ? ' kui-boot--inline' : '');
        root.setAttribute('data-boot-clock', cfg.clock.enabled ? 'on' : 'off');
        root.setAttribute('data-boot-clock-mode', cfg.clock.enabled ? cfg.clock.mode : 'off');
        root.setAttribute('data-boot-bar', cfg.bar.enabled ? cfg.bar.mode : 'off');
        refs.clock.style.setProperty('--kui-boot-size', (Number(cfg.clock.size) || 74) + 'px');
        refs.dial.style.setProperty('--kui-boot-ticks', String(Number(cfg.clock.ticks) || 12));
        refs.meta.hidden = !cfg.meta;
        if (cfg.title) { refs.title.textContent = cfg.title; }
        if (cfg.subtitle !== undefined) {
          refs.sub.textContent = cfg.subtitle;
          refs.sub.hidden = !cfg.subtitle;
        }
        if (cfg.text) { refs.text.textContent = cfg.text; }
        return api;
      },

      show: function () {
        root.hidden = false;
        setClass(root, 'is-done', false);
        setClass(root, 'is-error', false);
        api.visible = true;
        return api;
      },

      hide: function () {
        setClass(root, 'is-done', true);
        api.visible = false;
        return api;
      },

      done: function () {
        api.setProgress(100);
        api.hide();
        var hold = api.config.hideDelay;
        if (hold === undefined || hold === null) { hold = HIDE_DELAY; }
        try {
          window.setTimeout(function () {
            if (root && root.parentNode) { root.parentNode.removeChild(root); }
            if (state.instance === api) { state.instance = null; }
          }, hold);
        } catch (e) { /* noop */ }
        return api;
      },

      error: function (message, detail) {
        setClass(root, 'is-error', true);
        refs.inner.style.display = 'none';
        refs.errorBox.hidden = false;
        refs.errorBox.innerHTML = '';
        var titleNode = el('div', 'kui-boot__error-title');
        titleNode.textContent = txt('boot.errorTitle', '界面启动失败');
        var msgNode = el('div', 'kui-boot__error-msg');
        msgNode.textContent = String(message || '');
        refs.errorBox.appendChild(titleNode);
        refs.errorBox.appendChild(msgNode);
        if (detail) {
          var detailNode = el('pre', 'kui-boot__error-detail');
          detailNode.textContent = String(detail);
          refs.errorBox.appendChild(detailNode);
        }
        var tipNode = el('div', 'kui-boot__error-tip');
        tipNode.textContent = txt('boot.errorTip', '请检查 config/ 配置与本地静态服务器后重试（file:// 模式请先运行 npm run build:config）。');
        refs.errorBox.appendChild(tipNode);
        var retry = el('button', '');
        retry.type = 'button';
        retry.textContent = txt('boot.retry', '重新加载');
        retry.onclick = function () { try { window.location.reload(); } catch (e) { /* noop */ } };
        refs.errorBox.appendChild(retry);
        return api;
      },

      setConfig: function (patch, textCfg) { return api.configure(patch, textCfg); },

      handsAt: handsAt,

      getState: function () {
        return {
          progress: api.progress,
          percent: Math.round(api.progress),
          step: api.step,
          visible: api.visible,
          mode: api.config.mode,
          clock: api.config.clock,
          bar: api.config.bar,
          hands: handsAt(api.progress)
        };
      },

      destroy: function () {
        if (root && root.parentNode) { root.parentNode.removeChild(root); }
        if (state.instance === api) { state.instance = null; }
        return null;
      }
    };

    root.__kuiBootApi = api;

    /* 单例（attach 到页面）才占用 #kui-boot；内嵌预览实例不写 id，避免重复 id */
    if (adoptRoot) { /* 保留原 id */ }
    else if (opts.singleton !== false) { root.id = BOOT_ID; }

    if (host) {
      host.appendChild(root);
    }
    if (cfg.text) { refs.text.textContent = cfg.text; }
    api.setProgress(0, { silent: true });
    refs.percentNode.textContent = '0%';
    refs.clockText.textContent = '12:00';
    if (opts.singleton !== false) { state.instance = api; }
    return api;
  }

  /* ================= 配置归一化（含文案键回退） ================= */

  function normalizeConfig(patch, textCfg) {
    var cfg = deepMerge({}, DEFAULTS);
    cfg = deepMerge(cfg, patch || {});
    /* 文案回退：config/text.json 的 boot.* 优先于内置默认 */
    var t = textCfg || {};
    if (!cfg.title) { cfg.title = t.title || txt('boot.title', 'KurumiUI'); }
    if (!cfg.subtitle) { cfg.subtitle = t.subtitle || txt('boot.subtitle', ''); }
    if (!cfg.text) { cfg.text = t.text || txt('boot.text', '正在加载界面配置…'); }
    cfg.clock = cfg.clock || {};
    cfg.bar = cfg.bar || {};
    if (!cfg.stages || !cfg.stages.length) {
      cfg.stages = DEFAULTS.stages.slice(0);
    }
    return cfg;
  }

  /* ================= 对外 API：KUI.bootLayer ================= */

  function attach(props, textCfg) {
    if (!document || !document.body) { return null; }
    var existing = document.getElementById(BOOT_ID);
    if (existing && existing.__kuiBootApi) {
      return existing.__kuiBootApi;
    }
    var cfg = normalizeConfig(props, textCfg);
    if (existing) {
      /* 接管静态骨架：保留 #kui-boot 节点，只重建内部 */
      return createInstance(null, cfg, existing, { singleton: true });
    }
    return createInstance(document.body, cfg, null, { singleton: true });
  }

  function getInstance() { return state.instance; }

  function configure(patch, textCfg) {
    var inst = state.instance || attach({}, textCfg);
    if (!inst) { return null; }
    inst.configure(patch || {}, textCfg);
    return inst.config;
  }

  function destroy() {
    if (state.instance) { state.instance.destroy(); }
    var existing = document.getElementById(BOOT_ID);
    if (existing && existing.parentNode) { existing.parentNode.removeChild(existing); }
    state.instance = null;
    return null;
  }

  /* ================= 组件注册（type: boot） ================= */

  function renderNode(node, ctx) {
    var props = (node && node.props) || {};
    /* 单节点渲染默认内嵌，避免一挂载就铺满整页；要全屏请显式给 mode:'fullscreen' */
    var merged = deepMerge({ mode: 'inline' }, props);
    var inst = createInstance(null, merged, null, { singleton: false });
    return inst.el;
  }

  function register(type, descriptor) {
    if (KUI.registry && typeof KUI.registry.register === 'function') {
      KUI.registry.register(type, descriptor);
    }
  }

  register('boot', {
    category: 'shell',
    title: '启动层 / 加载中',
    defaults: DEFAULTS,
    render: function (node, ctx) { return renderNode(node, ctx); },
    api: function (elm) { return elm && elm.__kuiBootApi ? elm.__kuiBootApi : {}; }
  });

  KUI.bootLayer = {
    version: '1.0.0',
    DEFAULTS: DEFAULTS,
    handsAt: handsAt,
    /* bootLayer 命名说明：KUI.boot 是「启动器函数」（bootstrap.js 暴露的 launcher），
     * 本组件占用 KUI.bootLayer，二者不冲突。 */
    create: function (host, props) {
      var cfg = normalizeConfig(props);
      return createInstance(host, cfg, null, { singleton: false });
    },
    attach: attach,
    configure: configure,
    instance: getInstance,
    destroy: destroy,
    isReady: function () { return !!state.instance; }
  };

  /* 便捷：已经存在 #kui-boot 骨架且组件在 bootstrap 之前加载时，可手动 attach()。
   * 组件自身不在加载时自动 attach —— 何时接管由 bootstrap（或使用方）决定。 */

})(window.KUI);

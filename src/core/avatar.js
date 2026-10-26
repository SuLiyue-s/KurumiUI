/*!
 * KurumiUI - avatar.js
 * 头像组件 + 「刻刻帝时间齿轮」头像框（核心模块，可独立使用）
 *
 * 设计要点（合同 §10 / §14 的延伸）：
 *   1. 头像地址、是否可点击更换、齿轮框样式，全部来自配置 JSON；
 *   2. 未设置自定义头像时，显示 fallback 图标（默认 = 品牌 logoIcon），不绘制齿轮框；
 *   3. 一旦设置了自定义头像，就在头像边框外绘制「刻刻帝时间齿轮」：
 *        外圈虚线齿轮 + 中圈刻线 + 罗马数字（可选）+ 时针分针 + 轴心宝石
 *      齿轮框所有颜色都走 CSS token（--kui-accent / --kui-accent-2 / --kui-glow），
 *      因此切换主题时头像框自动跟随主题变色；头像图片本身不参与主题变化。
 *   4. 渲染完成后是否允许点击更换，由配置项 editable 控制；
 *      允许时点击头像 / 回车空格 打开 KUI.dialog.form 更换弹窗（地址输入 + 预设选择 + 清除）。
 *
 * 用法：
 *   KUI.avatar.create(hostEl, { url: '', editable: true, size: 44, frame: { enabled: true } });
 *   或注册表方式：{ "type": "avatar", "props": { "url": "...", "editable": true } }
 */
(function (global) {
  'use strict';

  var KUI = global.KUI || (global.KUI = {});
  if (KUI.avatar) { return; }

  var doc = global.document;
  var hasOwn = Object.prototype.hasOwnProperty;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* ------------------------------------------------------------------ *
   * 内置预设头像（SVG data URI，离线可用；配置 JSON 可覆盖 picker.presets）
   * ------------------------------------------------------------------ */
  function svgUrl(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function presetEye() {
    return svgUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<defs><radialGradient id="g" cx="50%" cy="50%"><stop offset="0%" stop-color="#1a0b12"/>' +
      '<stop offset="70%" stop-color="#3a0c18"/><stop offset="100%" stop-color="#0a0507"/></radialGradient></defs>' +
      '<rect width="64" height="64" fill="url(#g)"/>' +
      '<path d="M8 32c8-11 16-16 24-16s16 5 24 16c-8 11-16 16-24 16S16 43 8 32z" fill="none" stroke="#d4af37" stroke-width="2"/>' +
      '<circle cx="32" cy="32" r="8" fill="#c8102e"/><circle cx="32" cy="32" r="3" fill="#0a0507"/>' +
      '<circle cx="34.5" cy="29.5" r="1.6" fill="#ffe9c9" opacity=".85"/></svg>'
    );
  }

  function presetGear() {
    return svgUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<rect width="64" height="64" fill="#0d0810"/>' +
      '<g fill="none" stroke="#d4af37" stroke-width="2.4">' +
      '<circle cx="32" cy="32" r="20"/><circle cx="32" cy="32" r="9"/>' +
      '<path d="M32 6v8M32 50v8M6 32h8M50 32h8M13.6 13.6l5.7 5.7M44.7 44.7l5.7 5.7M50.4 13.6l-5.7 5.7M19.3 44.7l-5.7 5.7"/></g>' +
      '<path d="M32 32V20M32 32l9 6" stroke="#c8102e" stroke-width="2.6" stroke-linecap="round"/></svg>'
    );
  }

  function presetClock() {
    return svgUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<rect width="64" height="64" fill="#120a1a"/>' +
      '<circle cx="32" cy="32" r="24" fill="#1b0d22" stroke="#d4af37" stroke-width="1.6"/>' +
      '<circle cx="32" cy="32" r="19" fill="none" stroke="#c8102e" stroke-width=".8" stroke-dasharray="1 3"/>' +
      '<path d="M32 15v6M32 43v6M15 32h6M43 32h6" stroke="#d4af37" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M32 32V21M32 32l8 7" stroke="#c8102e" stroke-width="2.6" stroke-linecap="round"/>' +
      '<circle cx="32" cy="32" r="2.2" fill="#d4af37"/></svg>'
    );
  }

  function presetFeather() {
    return svgUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<rect width="64" height="64" fill="#08070c"/>' +
      '<path d="M46 12C30 16 16 30 12 50c8-4 14-6 20-12 7-7 10-16 14-26z" fill="#1d2233" stroke="#8fa2d8" stroke-width="1.4"/>' +
      '<path d="M12 50l16-16" stroke="#8fa2d8" stroke-width="1.4" stroke-linecap="round"/>' +
      '<circle cx="42" cy="18" r="3" fill="#c8102e"/></svg>'
    );
  }

  var BUILTIN_PRESETS = [
    { id: 'crimson-eye', label: '绯红之瞳', url: presetEye() },
    { id: 'gold-gear', label: '黄金齿轮', url: presetGear() },
    { id: 'twelfth-clock', label: '十二刻刻帝', url: presetClock() },
    { id: 'night-feather', label: '暗夜之羽', url: presetFeather() }
  ];

  /* ------------------------------------------------------------------ *
   * 配置合并
   * ------------------------------------------------------------------ */
  var DEFAULTS = {
    url: '',                      // 自定义头像图片地址（JSON 传入）
    editable: false,              // 渲染完成后是否允许点击更换
    persist: false,               // 用户更换后是否写入 localStorage
    storageKey: 'kui-avatar',     // persist 为 true 时的存储键
    size: 44,                     // 头像直径（px）
    shape: 'circle',              // circle | square
    alt: '头像',
    title: '',                    // 悬停提示（空 = 用 clickTitle / 不显示）
    clickTitle: '更换头像',
    fallbackIcon: 'clock',        // 未设置头像时的图标
    fallbackText: '',             // 未设置头像且无图标时的文字（取首字）
    frame: {
      enabled: true,              // 设置头像后是否绘制齿轮框
      style: 'clock-gear',        // 目前仅 clock-gear（预留扩展）
      showTicks: true,
      showRoman: false,
      showHands: true,
      animated: true,             // 齿轮是否转动（prefers-reduced-motion 下自动关闭）
      spinDuration: 48            // 转一圈的秒数：>0 正转，<0 反转，0 = 停转
    },
    picker: {
      title: '更换头像',
      width: 520,
      urlLabel: '头像图片地址',
      urlPlaceholder: '粘贴图片 URL，或选择下方预设头像',
      urlTip: '支持 http(s)、相对路径与 data:image/…；留空表示清除自定义头像',
      clearLabel: '清除自定义头像',
      allowClear: true,
      presets: null,              // null = 使用内置预设；[] = 不显示预设
      okText: '应用',
      cancelText: '取消',
      // v1.3.1：更换方式 —— url = 弹出输入框填图片地址；file = 直接选本地图片
      mode: 'url',
      accept: 'image/*',
      maxSizeMB: 2,
      fileLabel: '选择本地图片',
      fileTip: '支持 PNG / JPG / WebP / GIF / SVG；建议正方形，不超过 {n}MB',
      fileErrorType: '请选择图片文件（image/*）',
      fileErrorSize: '图片不能超过 {n}MB，请压缩后再试',
      fileErrorRead: '图片读取失败，请重试'
    }
  };

  var globalDefaults = null;

  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v) && !v.nodeType;
  }

  function mergeOptions(opts) {
    var base = KUI.utils && KUI.utils.deepMerge ? KUI.utils.deepMerge({}, DEFAULTS) : DEFAULTS;
    if (globalDefaults) { base = KUI.utils.deepMerge(base, globalDefaults); }
    if (opts) { base = KUI.utils.deepMerge(base, opts); }
    if (!base.frame || typeof base.frame !== 'object') { base.frame = { enabled: true }; }
    if (!base.picker || typeof base.picker !== 'object') { base.picker = {}; }
    return base;
  }

  /* ------------------------------------------------------------------ *
   * 齿轮框 SVG（刻刻帝时间齿轮）
   * ------------------------------------------------------------------ */
  var ROMAN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

  function buildRing(opts) {
    var svg = KUI.hs('svg', {
      'class': 'kui-avatar__ring',
      viewBox: '0 0 100 100',
      'aria-hidden': 'true',
      focusable: 'false'
    });

    // 外圈齿轮（虚线描边模拟齿轮齿，随主题 token 变色）
    var rotor = KUI.hs('g', { 'class': 'kui-avatar__ring-rotor' });
    rotor.appendChild(KUI.hs('circle', {
      'class': 'kui-avatar__ring-gear',
      cx: 50, cy: 50, r: 45,
      'stroke-dasharray': '2.4 3.4'
    }));
    svg.appendChild(rotor);

    // 中圈描边
    svg.appendChild(KUI.hs('circle', {
      'class': 'kui-avatar__ring-rim',
      cx: 50, cy: 50, r: 42.5
    }));

    // 12 道刻线（时间刻度）
    if (opts.showTicks) {
      var ticks = KUI.hs('g', { 'class': 'kui-avatar__ring-ticks' });
      for (var i = 0; i < 12; i++) {
        var a = (i * 30 - 90) * Math.PI / 180;
        var r1 = i % 3 === 0 ? 33 : 34.6;
        var r2 = 37.6;
        ticks.appendChild(KUI.hs('line', {
          'class': 'kui-avatar__ring-tick' + (i % 3 === 0 ? ' is-major' : ''),
          x1: 50 + Math.cos(a) * r1,
          y1: 50 + Math.sin(a) * r1,
          x2: 50 + Math.cos(a) * r2,
          y2: 50 + Math.sin(a) * r2
        }));
      }
      svg.appendChild(ticks);
    }

    // 罗马数字（可选，字号小，避免遮挡头像）
    if (opts.showRoman) {
      var roman = KUI.hs('g', { 'class': 'kui-avatar__ring-roman' });
      for (var j = 0; j < 12; j++) {
        var ra = (j * 30 - 90) * Math.PI / 180;
        var tx = KUI.hs('text', {
          x: 50 + Math.cos(ra) * 38.6,
          y: 50 + Math.sin(ra) * 38.6,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-size': '5.2'
        });
        tx.textContent = ROMAN[j];
        roman.appendChild(tx);
      }
      svg.appendChild(roman);
    }

    // 时针分针（指向 12 点 / 4 点方向，静态装饰）
    if (opts.showHands) {
      var hands = KUI.hs('g', { 'class': 'kui-avatar__ring-hands' });
      hands.appendChild(KUI.hs('line', {
        'class': 'kui-avatar__ring-hand is-hour',
        x1: 50, y1: 50, x2: 50, y2: 27
      }));
      hands.appendChild(KUI.hs('line', {
        'class': 'kui-avatar__ring-hand is-minute',
        x1: 50, y1: 50, x2: 71, y2: 50
      }));
      hands.appendChild(KUI.hs('circle', {
        'class': 'kui-avatar__ring-pin',
        cx: 50, cy: 50, r: 2.6
      }));
      svg.appendChild(hands);
    }

    return svg;
  }

  /* ------------------------------------------------------------------ *
   * create(): 渲染一个头像
   * ------------------------------------------------------------------ */
  function create(host, opts, ctx) {
    if (!doc) { return null; }
    var options = mergeOptions(opts);

    // persist：允许从 localStorage 恢复用户选择（同页面只读一次，避免多次实例互相覆盖）
    var stored = '';
    if (options.persist) {
      try {
        stored = global.localStorage ? (global.localStorage.getItem(options.storageKey) || '') : '';
      } catch (errStored) { stored = ''; }
    }
    var currentUrl = options.url || stored || '';

    var el = KUI.h('div', {
      'class': 'kui-avatar',
      role: 'img',
      'aria-label': options.alt || '头像'
    });
    if (options.shape === 'square') { el.classList.add('kui-avatar--square'); }
    el.style.width = options.size + 'px';
    el.style.height = options.size + 'px';
    el.setAttribute('data-kui-avatar', options.url ? 'custom' : 'auto');

    // 内层：图片或回退图标
    var inner = KUI.h('div', { 'class': 'kui-avatar__inner' });
    el.appendChild(inner);

    // 外层：齿轮框（动态增删）
    var ring = null;

    function fallbackNode() {
      if (options.fallbackIcon && KUI.icons && KUI.icons.create) {
        var ic = KUI.icons.create(options.fallbackIcon, {
          'class': 'kui-avatar__fallback-icon',
          size: Math.max(16, Math.round(options.size * 0.46))
        });
        return KUI.h('span', { 'class': 'kui-avatar__fallback' }, ic);
      }
      return KUI.h('span', {
        'class': 'kui-avatar__fallback kui-avatar__fallback-text'
      }, (options.fallbackText || options.alt || 'K').charAt(0));
    }

    function renderContent() {
      KUI.empty(inner);
      if (currentUrl) {
        el.setAttribute('data-kui-avatar', 'custom');
        el.classList.remove('is-empty');
        var img = KUI.h('img', {
          'class': 'kui-avatar__img',
          src: currentUrl,
          alt: options.alt || '头像',
          draggable: 'false'
        });
        img.addEventListener('error', function () {
          // 图片加载失败：退回占位，避免空白头像
          el.classList.add('is-broken');
        });
        inner.appendChild(img);
      } else {
        el.setAttribute('data-kui-avatar', 'auto');
        el.classList.add('is-empty');
        inner.appendChild(fallbackNode());
      }
    }

    /* 齿轮转速：frame.spinDuration（秒/圈）。>0 正转，<0 反转，0 停转；
     * animated === false 或 spinDuration 为 0 时不加动画类。 */
    function applySpin() {
      var frame = options.frame || {};
      var raw = frame.spinDuration;
      var sec = (typeof raw === 'number') ? raw : parseFloat(raw);
      var hasNumber = isFinite(sec);
      var animated = frame.animated !== false && !(hasNumber && sec === 0);
      if (animated) {
        if (hasNumber) {
          el.style.setProperty('--kui-avatar-spin-duration', Math.abs(sec) + 's');
          el.style.setProperty('--kui-avatar-spin-direction', sec < 0 ? 'reverse' : 'normal');
        } else {
          el.style.removeProperty('--kui-avatar-spin-duration');
          el.style.removeProperty('--kui-avatar-spin-direction');
        }
        el.classList.add('kui-avatar--animated');
      } else {
        el.classList.remove('kui-avatar--animated');
      }
    }

    function renderRing() {
      if (ring && ring.parentNode) { ring.parentNode.removeChild(ring); }
      ring = null;
      if (!currentUrl || !options.frame || options.frame.enabled === false) { return; }
      ring = buildRing({
        showTicks: options.frame.showTicks !== false,
        showRoman: !!options.frame.showRoman,
        showHands: options.frame.showHands !== false
      });
      applySpin();
      el.appendChild(ring);
    }

    /* ---- 悬停提示 / 可点击 ---- */
    function syncInteractive() {
      var editable = !!options.editable;
      el.classList.toggle('is-editable', editable);
      if (editable) {
        el.setAttribute('tabindex', '0');
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', (options.title || options.clickTitle) || '更换头像');
        el.title = options.title || options.clickTitle || '更换头像';
      } else {
        el.removeAttribute('tabindex');
        el.setAttribute('role', 'img');
        el.removeAttribute('aria-label');
        el.setAttribute('aria-label', options.alt || '头像');
        el.title = options.title || '';
      }
      el.setAttribute('aria-haspopup', editable ? 'dialog' : 'false');
    }

    /* ---- 更换头像弹窗（配置驱动节点） ---- */
    function openPicker(override) {
      if (!options.editable) { return null; }
      var pickerOptions = KUI.utils && KUI.utils.deepMerge
        ? KUI.utils.deepMerge({}, options.picker || {}, override || {})
        : (options.picker || {});
      if (pickerOptions.mode === 'file') { return pickFile(pickerOptions); }
      if (!KUI.dialog || typeof KUI.dialog.form !== 'function') {
        KUI.warnOnce('avatar-no-dialog', 'KurumiUI: 更换头像需要加载 dialog（KUI.dialog.form）');
        return null;
      }
      var picker = pickerOptions;
      var presets = picker.presets === null || picker.presets === undefined
        ? BUILTIN_PRESETS
        : (picker.presets || []);

      var presetOptions = [{ label: '不使用预设', value: '' }];
      for (var i = 0; i < presets.length; i++) {
        presetOptions.push({ label: presets[i].label || presets[i].id || ('预设 ' + (i + 1)), value: presets[i].url || '' });
      }

      var nodes = [
        {
          type: 'input',
          id: 'avatarUrl',
          label: picker.urlLabel || '头像图片地址',
          placeholder: picker.urlPlaceholder || '粘贴图片 URL',
          help: picker.urlTip || '',
          clearable: true,
          value: currentUrl
        }
      ];
      if (presetOptions.length > 1) {
        nodes.push({
          type: 'select',
          id: 'avatarPreset',
          label: '预设头像',
          options: presetOptions,
          value: ''
        });
      }
      if (picker.allowClear !== false) {
        nodes.push({
          type: 'switch',
          id: 'avatarClear',
          label: picker.clearLabel || '清除自定义头像',
          value: false
        });
      }

      return KUI.dialog.form({
        title: picker.title || '更换头像',
        width: picker.width || 520,
        okText: picker.okText || '应用',
        cancelText: picker.cancelText || '取消',
        nodes: nodes
      }).then(function (data) {
        // 取消（null）时不改动；确认后按「清除 > 预设 > URL 输入」优先级应用
        if (data === null || data === undefined) { return currentUrl; }
        var values = data || {};
        var next = currentUrl;
        if (values.avatarClear) {
          next = '';
        } else if (values.avatarPreset) {
          next = values.avatarPreset;
        } else if (typeof values.avatarUrl === 'string') {
          next = values.avatarUrl.trim();
        }
        api.setUrl(next, { persist: true, source: 'picker' });
        return next;
      });
    }

    /* ---- 本地图片选择（picker.mode = "file"） ---- */
    function readFileAsDataUrl(file, onDone, onError) {
      try {
        if (typeof FileReader === 'function') {
          var reader = new FileReader();
          reader.onload = function () { onDone(String(reader.result || '')); };
          reader.onerror = function () { onError(reader.error || new Error('read-failed')); };
          reader.readAsDataURL(file);
          return;
        }
        if (typeof URL !== 'undefined' && URL.createObjectURL) { onDone(URL.createObjectURL(file)); return; }
        onError(new Error('FileReader 不可用'));
      } catch (err) { onError(err); }
    }

    function notify(text) {
      if (!text) { return; }
      if (KUI.toast && typeof KUI.toast.warning === 'function') { KUI.toast.warning(text, { duration: 2600 }); return; }
      KUI.warn('[KurumiUI] 头像：' + text);
    }

    function pickFile(picker) {
      if (!options.editable) { return null; }
      picker = picker || options.picker || {};
      if (typeof document === 'undefined' || !document.createElement) { return null; }
      var accept = picker.accept || 'image/*';
      var maxMB = Number(picker.maxSizeMB);
      if (!isFinite(maxMB) || maxMB <= 0) { maxMB = 2; }
      var sizeMsg = String(picker.fileErrorSize || '图片不能超过 {n}MB').replace('{n}', String(maxMB));

      return new Promise(function (resolve) {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.setAttribute('aria-hidden', 'true');
        input.style.position = 'fixed';
        input.style.left = '-9999px';
        input.style.width = '1px';
        input.style.height = '1px';
        input.style.opacity = '0';

        var settled = false;
        function cleanup() {
          if (input.parentNode) { input.parentNode.removeChild(input); }
          try { window.removeEventListener('focus', onWindowFocus); } catch (e) {}
        }
        function finish(value) {
          if (settled) { return; }
          settled = true;
          cleanup();
          resolve(value);
          return value;
        }
        function onWindowFocus() {
          // 用户取消系统文件选择框时只会触发窗口重新获得焦点，没有 change 事件
          setTimeout(function () {
            if (settled) { return; }
            if (!input.files || !input.files.length) { finish(null); }
          }, 260);
        }

        input.onchange = function () {
          var file = input.files && input.files[0];
          if (!file) { finish(null); return; }
          if (file.type && file.type.indexOf('image/') !== 0) {
            notify(picker.fileErrorType || '请选择图片文件');
            finish(null);
            return;
          }
          if (file.size > maxMB * 1024 * 1024) { notify(sizeMsg); finish(null); return; }
          readFileAsDataUrl(file, function (url) {
            if (!url) { notify(picker.fileErrorRead || '图片读取失败'); finish(null); return; }
            api.setUrl(url, { persist: true, source: 'file' });
            if (url.length > 1024 * 1024) {
              notify('图片较大，已应用；若刷新后丢失请压缩到 1MB 以内，或改用图片 URL');
            }
            finish(url);
          }, function () {
            notify(picker.fileErrorRead || '图片读取失败');
            finish(null);
          });
        };

        document.body.appendChild(input);
        try { window.addEventListener('focus', onWindowFocus); } catch (e) {}
        try {
          input.click();
        } catch (err) {
          notify('当前浏览器不允许打开文件选择框');
          finish(null);
        }
      });
    }

    function onActivate(ev) {
      if (!options.editable) { return; }
      if (ev && ev.type === 'keydown') {
        var key = ev.key || ev.keyCode;
        if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar' && key !== 13 && key !== 32) { return; }
        ev.preventDefault();
      } else if (ev && ev.target) {
        // 点击内部图片/图标不额外冒泡处理
        if (ev.target === el || el.contains(ev.target)) { /* 继续 */ }
      }
      openPicker();
    }

    KUI.on(el, 'click', onActivate);
    KUI.on(el, 'keydown', onActivate);

    /* ---- 对外 API ---- */
    var api = {
      el: el,
      options: options,
      getUrl: function () { return currentUrl; },
      hasCustom: function () { return !!currentUrl; },
      setUrl: function (url, extra) {
        currentUrl = typeof url === 'string' ? url.trim() : '';
        var opt = extra || {};
        if (opt.persist !== false && options.persist) {
          try {
            if (currentUrl) { global.localStorage.setItem(options.storageKey, currentUrl); }
            else { global.localStorage.removeItem(options.storageKey); }
          } catch (errPersist) { /* 隐私模式下忽略 */ }
        }
        renderContent();
        renderRing();
        if (KUI.bus && opt.silent !== true) {
          KUI.bus.emit('avatar:change', { url: currentUrl, el: el, options: options });
        }
        if (ctx && typeof ctx.emit === 'function' && opt.silent !== true) {
          ctx.emit('avatar:change', { url: currentUrl });
        }
        return api;
      },
      setEditable: function (editable) {
        options.editable = !!editable;
        syncInteractive();
        return api;
      },
      openPicker: openPicker,
      pickFile: function (override) {
        return pickFile(KUI.utils && KUI.utils.deepMerge ? KUI.utils.deepMerge({}, options.picker || {}, override || {}) : (options.picker || {}));
      },
      setSpinDuration: function (seconds) {
        var sec = (typeof seconds === 'number') ? seconds : parseFloat(seconds);
        if (!isFinite(sec)) { return api; }
        options.frame = options.frame || {};
        options.frame.spinDuration = sec;
        options.frame.animated = sec !== 0;
        applySpin();
        return api;
      },
      getSpinDuration: function () {
        return (options.frame && typeof options.frame.spinDuration === 'number')
          ? options.frame.spinDuration : 48;
      },
      refresh: function () { renderContent(); renderRing(); return api; },
      destroy: function () {
        KUI.off(el, 'click', onActivate);
        KUI.off(el, 'keydown', onActivate);
        if (el.parentNode) { el.parentNode.removeChild(el); }
      }
    };

    renderContent();
    renderRing();
    syncInteractive();

    if (host && host.appendChild) { host.appendChild(el); }
    return api;
  }

  /* ------------------------------------------------------------------ *
   * 导出 + 注册表接入
   * ------------------------------------------------------------------ */
  KUI.avatar = {
    DEFAULTS: DEFAULTS,
    PRESETS: BUILTIN_PRESETS,
    svgUrl: svgUrl,
    mergeOptions: mergeOptions,
    create: create,
    mount: create,
    /** 全局配置（所有未显式覆盖的实例生效） */
    configure: function (patch) {
      globalDefaults = KUI.utils.deepMerge(globalDefaults || {}, patch || {});
      return KUI.avatar;
    },
    /** 生成「刻刻帝时间齿轮」头像框 SVG（预览/测试用） */
    ring: function (opts) {
      var o = mergeOptions({ frame: opts || {} });
      var ringEl = buildRing({
        showTicks: o.frame.showTicks !== false,
        showRoman: !!o.frame.showRoman,
        showHands: o.frame.showHands !== false
      });
      var host = KUI.h('div', { 'class': 'kui-avatar kui-avatar--ring-preview is-empty' });
      host.style.width = (o.size || 44) + 'px';
      host.style.height = (o.size || 44) + 'px';
      var inner = KUI.h('div', { 'class': 'kui-avatar__inner' });
      host.appendChild(inner);
      inner.appendChild(KUI.h('span', { 'class': 'kui-avatar__fallback' },
        KUI.icons && KUI.icons.create ? KUI.icons.create('clock', { size: 18 }) : ''));
      host.appendChild(ringEl);
      return host;
    }
  };

  /* 注册表：JSON 里可直接 { "type": "avatar", "props": {...} } */
  if (KUI.registry && typeof KUI.registry.register === 'function') {
    KUI.registry.register('avatar', {
      category: 'display',
      title: '头像',
      defaults: {
        url: '',
        editable: false,
        size: 44,
        frame: { enabled: true, style: 'clock-gear', spinDuration: 48 }
      },
      render: function (node, ctx) {
        var props = (node && node.props) || {};
        var host = KUI.h('span', { 'class': 'kui-avatar-host', 'data-avatar-id': node && node.id ? node.id : '' });
        var api = create(host, props, ctx);
        host.__kuiAvatar = api;
        return host;
      },
      api: function (el) {
        return el && el.__kuiAvatar ? el.__kuiAvatar : null;
      }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);

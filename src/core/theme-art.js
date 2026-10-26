/*!
 * KurumiUI · core/theme-art.js
 * ---------------------------------------------------------------
 * 主题装饰层渲染器：把 themes.json 里的 art 配置（layers）翻译成 DOM。
 *
 * 核心约定（契约 §13 / §16）：
 *   - 主题只能通过「tokens + art」表达；本文件不写死任何主题颜色/文案，
 *     颜色只从 art 配置（可写 var(--kui-*) 引用 token）或 CSS 变量取得。
 *   - 零外部资源：所有图形用 CSS 渐变 / clip-path / box-shadow / 内联 SVG 绘制，
 *     不加载任何图片、字体或网络资源。
 *   - 具体参数（opacity / x / y / size / rotate / count / 颜色…）全部来自 JSON；
 *     代码里的默认值只是「配置缺省时的兜底层」，不是主题值。
 *
 * 用法：
 *   var art = KUI.themeArt.render(theme.art, hostEl);   // -> { el, destroy }
 *   art.destroy();                                      // 卸载并移除 DOM
 *
 *   hostEl 通常是 #kui-art-host（由 core/theme.js 创建）。
 *   预览/缩略图等需要"嵌在容器里"的场景，可传第三个参数 opts：
 *     KUI.themeArt.render(art, panelEl, { inline: true });   // 加 .kui-art--inline
 *
 * 支持的层 kind（与 base.css 第 9 节一一对应）：
 *   glow / grid / rays / scanline / noise / vignette / moon / stars /
 *   sakura / feather / clock
 * 顶层 art.noise 若是数字（0~1），会在 vignette 之前自动合成一层 noise。
 */
(function (global) {
  'use strict';

  var KUI = global.KUI = global.KUI || {};

  /* ------------------------------------------------------------------------
   * 常量
   * --------------------------------------------------------------------- */

  /* 表盘罗马数字：索引 0 位于 12 点方向，顺时针排列 */
  var ROMAN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

  /* 结构性缺省值（仅当 JSON 没写该字段时使用；不是主题值） */
  var FALLBACK = {
    stars: { count: 60, size: 2, speed: '6s' },
    sakura: { count: 12, size: 10, duration: '16s', wind: 40 },
    feather: { count: 3, size: 110, drift: '20s', angle: 0 },
    clock: { size: 560, ticks: 12, minorTicks: 60, pulse: '12s' }
  };

  /* ------------------------------------------------------------------------
   * 小工具
   * --------------------------------------------------------------------- */

  function create(tag, className) {
    var node = global.document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function warn(message) {
    var text = '[KUI.themeArt] ' + message;
    if (typeof KUI.warnOnce === 'function') KUI.warnOnce('theme-art:' + message, text);
    else if (global.console && global.console.warn) global.console.warn(text);
  }

  /** 写 CSS 变量；空值跳过，交给 base.css 的兜底默认值 */
  function setVar(node, name, value) {
    if (value === undefined || value === null || value === '') return;
    try {
      node.style.setProperty(name, String(value));
    } catch (e) {
      /* 忽略非法值，保持默认样式 */
    }
  }

  /** 数值 -> px 字符串；字符串（含单位）原样返回 */
  function cssSize(value, fallback) {
    var v = value === undefined || value === null || value === '' ? fallback : value;
    if (v === undefined || v === null || v === '') return '';
    return typeof v === 'number' ? v + 'px' : String(v);
  }

  /** 数值 -> deg 字符串；字符串（含单位）原样返回 */
  function cssDeg(value, fallback) {
    var v = value === undefined || value === null || value === '' ? fallback : value;
    if (v === undefined || v === null || v === '') return '';
    if (typeof v === 'number') return v + 'deg';
    return String(v);
  }

  /** 数值字段容错（字符串数字也接受） */
  function num(value, fallback) {
    var n = typeof value === 'number' ? value : parseFloat(value);
    if (!isFinite(n)) return fallback;
    return n;
  }

  /** '16s' / '16' / 16 -> 16（秒）；无法解析时用 fallback */
  function seconds(value, fallback) {
    if (typeof value === 'number') return isFinite(value) ? value : fallback;
    if (typeof value === 'string') {
      var n = parseFloat(value);
      return isFinite(n) ? n : fallback;
    }
    return fallback;
  }

  /** 字符串哈希（FNV-1a 变体），用于把 art 配置变成稳定随机种子 */
  function hashSeed(text) {
    var str = String(text || '');
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** 线性同余伪随机：同一份 art 配置每次生成完全相同的装饰布局 */
  function makeRandom(seed) {
    var state = (seed >>> 0) || 1;
    return function () {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  /** [min, max) 之间的随机小数 */
  function spread(rnd, min, max) {
    return min + (max - min) * rnd();
  }

  /** 小数 -> 百分比字符串（保留两位） */
  function pct(ratio) {
    return (Math.round(ratio * 10000) / 100) + '%';
  }

  /* ------------------------------------------------------------------------
   * 层工厂：公共包裹（class + 公共 art 变量）
   * --------------------------------------------------------------------- */

  function layerEl(kind, layer) {
    var node = create('div', 'kui-art__layer kui-art__layer--' + kind);
    setVar(node, '--art-opacity', layer.opacity);
    setVar(node, '--art-color', layer.color);
    setVar(node, '--art-blend', layer.blend);
    setVar(node, '--art-x', layer.x);
    setVar(node, '--art-y', layer.y);
    return node;
  }

  /* ------------------------------------------------------------------------
   * 各类层的 DOM 构建
   * --------------------------------------------------------------------- */

  var builders = {

    /* 9.1 径向光晕：size 是直径 */
    glow: function (layer) {
      var node = layerEl('glow', layer);
      setVar(node, '--art-r', cssSize(layer.size));
      return node;
    },

    /* 9.2 HUD 细网格：size 是格子边长 */
    grid: function (layer) {
      var node = layerEl('grid', layer);
      setVar(node, '--art-size', cssSize(layer.size));
      if (layer.flat) node.classList.add('is-flat');
      return node;
    },

    /* 9.3 放射光：count 条光带均分 360°，count/segment 由配置决定 */
    rays: function (layer) {
      var node = layerEl('rays', layer);
      var count = Math.max(2, Math.round(num(layer.count, 12)));
      setVar(node, '--art-ray-gap', (360 / count) + 'deg');
      setVar(node, '--art-ray-w', cssSize(layer.rayWidth));
      setVar(node, '--art-rotate', cssDeg(layer.rotate, 0));
      return node;
    },

    /* 9.4 扫描线：size=线距，angle=方向，speed=滚动一格用时 */
    scanline: function (layer) {
      var node = layerEl('scanline', layer);
      setVar(node, '--art-size', cssSize(layer.size));
      setVar(node, '--art-angle', cssDeg(layer.angle, 0));
      setVar(node, '--art-speed', layer.speed);
      return node;
    },

    /* 9.5 噪点：底色纹理由 base.css 的 data-URI SVG 提供 */
    noise: function (layer) {
      var node = layerEl('noise', layer);
      setVar(node, '--art-size', cssSize(layer.size));
      if (layer.blend) setVar(node, '--art-blend', layer.blend);
      return node;
    },

    /* 9.6 暗角：从中心透明到边缘变暗 */
    vignette: function (layer) {
      var node = layerEl('vignette', layer);
      if (layer.blend) setVar(node, '--art-blend', layer.blend);
      return node;
    },

    /* 9.7 月轮 / 血月：size=直径，glow=外发光半径，ring=外环 */
    moon: function (layer) {
      var node = layerEl('moon', layer);
      var moon = create('div', 'kui-moon');
      if (layer.ring) moon.classList.add('is-ring');
      setVar(node, '--art-size', cssSize(layer.size));
      setVar(node, '--art-glow', cssSize(layer.glow));
      node.appendChild(moon);
      return node;
    },

    /* 9.8 星点：按 count 生成 .kui-star，位置/大小/闪烁时长全部随机化 */
    stars: function (layer, rnd) {
      var node = layerEl('stars', layer);
      var count = Math.max(0, Math.round(num(layer.count, FALLBACK.stars.count)));
      var base = num(layer.size, FALLBACK.stars.size);
      var speed = seconds(layer.speed, 6);
      var frag = global.document.createDocumentFragment();
      for (var i = 0; i < count; i++) {
        var star = create('div', 'kui-star');
        var dur = seconds(spread(rnd, speed * 0.55, speed * 1.45), speed);
        setVar(star, '--s-x', pct(rnd()));
        setVar(star, '--s-y', pct(rnd()));
        setVar(star, '--s-w', cssSize(base * spread(rnd, 0.45, 1.35)));
        setVar(star, '--s-dur', dur.toFixed(2) + 's');
        setVar(star, '--s-delay', '-' + (rnd() * dur).toFixed(2) + 's');
        if (rnd() > 0.86) star.classList.add('is-bright');
        frag.appendChild(star);
      }
      node.appendChild(frag);
      return node;
    },

    /* 9.9 樱瓣：按 count 生成花瓣，wind 控制左右摆幅（可为负） */
    sakura: function (layer, rnd) {
      var node = layerEl('sakura', layer);
      var count = Math.max(0, Math.round(num(layer.count, FALLBACK.sakura.count)));
      var base = num(layer.size, FALLBACK.sakura.size);
      var duration = seconds(layer.duration, 16);
      var wind = num(layer.wind, FALLBACK.sakura.wind);
      var frag = global.document.createDocumentFragment();
      for (var i = 0; i < count; i++) {
        var petal = create('div', 'kui-sakura__petal');
        var dur = spread(rnd, duration * 0.75, duration * 1.35);
        setVar(petal, '--p-x', pct(spread(rnd, 0.02, 0.98)));
        setVar(petal, '--p-w', cssSize(base * spread(rnd, 0.7, 1.35)));
        setVar(petal, '--p-h', cssSize(base * spread(rnd, 0.5, 0.95)));
        setVar(petal, '--p-o', spread(rnd, 0.4, 0.85).toFixed(3));
        setVar(petal, '--p-dur', dur.toFixed(2) + 's');
        setVar(petal, '--p-delay', '-' + (rnd() * dur).toFixed(2) + 's');
        setVar(petal, '--p-sway', cssSize(wind * spread(rnd, 0.5, 1.2)));
        setVar(petal, '--p-sway-2', cssSize(-wind * spread(rnd, 0.4, 1.3)));
        frag.appendChild(petal);
      }
      node.appendChild(frag);
      return node;
    },

    /* 9.10 羽毛：按 count 生成 .kui-feather（CSS 画羽片 + 羽轴） */
    feather: function (layer, rnd) {
      var node = layerEl('feather', layer);
      var count = Math.max(0, Math.round(num(layer.count, FALLBACK.feather.count)));
      var height = num(layer.size, FALLBACK.feather.size);
      var drift = seconds(layer.drift, 20);
      var angle = num(layer.angle, 0);
      var frag = global.document.createDocumentFragment();
      for (var i = 0; i < count; i++) {
        var feather = create('div', 'kui-feather');
        var width = height * 0.19;
        var dur = spread(rnd, drift * 0.7, drift * 1.4);
        setVar(feather, '--f-x', pct(spread(rnd, 0.05, 0.95)));
        setVar(feather, '--f-y', pct(spread(rnd, 0.08, 0.92)));
        setVar(feather, '--f-w', cssSize(width));
        setVar(feather, '--f-h', cssSize(height * spread(rnd, 0.8, 1.15)));
        setVar(feather, '--f-rot', cssDeg(angle + spread(rnd, -12, 12)));
        setVar(feather, '--f-drift', dur.toFixed(2) + 's');
        setVar(feather, '--f-delay', '-' + (rnd() * dur).toFixed(2) + 's');
        feather.appendChild(create('div', 'kui-feather__vane'));
        feather.appendChild(create('div', 'kui-feather__root'));
        frag.appendChild(feather);
      }
      node.appendChild(frag);
      return node;
    },

    /* 9.11 刻刻帝：罗马数字表盘 + 刻度 + 指针 + 齿轮（纯 DOM/CSS） */
    clock: function (layer) {
      var node = layerEl('clock', layer);
      var size = cssSize(layer.size);
      setVar(node, '--art-size', size);
      setVar(node, '--art-rotate', cssDeg(layer.rotate, 0));
      setVar(node, '--art-pulse', layer.pulse);

      var clock = create('div', 'kui-clock');

      /* 同心圆环（外环 / 内环 / 虚线环） */
      if (layer.rings !== false) {
        clock.appendChild(create('div', 'kui-clock__ring'));
        clock.appendChild(create('div', 'kui-clock__ring kui-clock__ring--inner'));
        clock.appendChild(create('div', 'kui-clock__ring kui-clock__ring--dashed'));
      }

      /* 主刻度 + 次刻度：每根刻度是一个铺满表盘的旋转容器 */
      var major = Math.max(1, Math.round(num(layer.ticks, FALLBACK.clock.ticks)));
      var minor = Math.max(major, Math.round(num(layer.minorTicks, FALLBACK.clock.minorTicks)));
      var ticks = create('div', 'kui-clock__ticks');
      var i;
      for (i = 0; i < major; i++) {
        var mark = create('div', 'kui-clock__mark');
        setVar(mark, '--rot', ((360 / major) * i).toFixed(4) + 'deg');
        ticks.appendChild(mark);
      }
      var step = Math.max(1, Math.round(minor / major));
      for (i = 0; i < minor; i++) {
        if (i % step === 0) continue;
        var minorMark = create('div', 'kui-clock__mark is-minor');
        setVar(minorMark, '--rot', ((360 / minor) * i).toFixed(4) + 'deg');
        ticks.appendChild(minorMark);
      }
      clock.appendChild(ticks);

      /* 罗马数字：旋转容器定位 + 反向旋转保持文字竖直 */
      if (layer.numerals) {
        var numerals = create('div', 'kui-clock__numerals');
        for (i = 0; i < 12; i++) {
          var numNode = create('div', 'kui-clock__num');
          setVar(numNode, '--rot', (i * 30) + 'deg');
          var label = create('span');
          label.textContent = ROMAN[i];
          numNode.appendChild(label);
          numerals.appendChild(numNode);
        }
        clock.appendChild(numerals);
      }

      /* 齿轮：用 repeating-conic-gradient 画齿、radial mask 挖圆环 */
      if (layer.gears) {
        var gearList = layer.gears === true ? [
          { x: '20%', y: '22%', size: '17%', speed: '46s', reverse: false },
          { x: '79%', y: '74%', size: '13%', speed: '34s', reverse: true }
        ] : (Array.isArray(layer.gears) ? layer.gears : []);
        var gears = create('div', 'kui-clock__gears');
        for (i = 0; i < gearList.length; i++) {
          var g = gearList[i] || {};
          var gear = create('div', 'kui-clock__gear');
          if (g.reverse) gear.classList.add('is-reverse');
          gear.style.left = cssSize(g.x, '50%');
          gear.style.top = cssSize(g.y, '50%');
          setVar(gear, '--gear-size', cssSize(g.size));
          setVar(gear, '--gear-speed', g.speed);
          gears.appendChild(gear);
        }
        clock.appendChild(gears);
      }

      /* 指针：角度来自配置；秒针用负 animation-delay 对齐起始角度 */
      var hands = layer.hands;
      if (hands) {
        var handsNode = create('div', 'kui-clock__hands');
        if (hands.hour !== undefined) {
          var hourHand = create('div', 'kui-clock__hand kui-clock__hand--hour');
          setVar(hourHand, '--rot', cssDeg(hands.hour, 0));
          handsNode.appendChild(hourHand);
        }
        if (hands.minute !== undefined) {
          var minuteHand = create('div', 'kui-clock__hand kui-clock__hand--minute');
          setVar(minuteHand, '--rot', cssDeg(hands.minute, 0));
          handsNode.appendChild(minuteHand);
        }
        if (hands.second !== undefined) {
          var secondHand = create('div', 'kui-clock__hand kui-clock__hand--second');
          var secondDeg = num(hands.second, 0);
          setVar(secondHand, '--rot', cssDeg(secondDeg, 0));
          secondHand.style.animationDelay = '-' + (secondDeg / 6).toFixed(3) + 's';
          handsNode.appendChild(secondHand);
        }
        clock.appendChild(handsNode);
      }

      /* 中心轴 */
      clock.appendChild(create('div', 'kui-clock__pivot'));

      node.appendChild(clock);
      return node;
    }
  };

  /* ------------------------------------------------------------------------
   * 配置整理
   * --------------------------------------------------------------------- */

  /**
   * 把 art 配置整理成「待渲染的层列表」：
   *   - layers 拷贝一份，避免改动调用方数据
   *   - 顶层 art.noise 是数字时，合成一层 noise（放在 vignette 之前，保持暗角最上）
   */
  function normalizeLayers(art) {
    var list = [];
    var source = Array.isArray(art.layers) ? art.layers : [];
    var i;
    for (i = 0; i < source.length; i++) {
      if (source[i] && typeof source[i] === 'object' && source[i].kind) list.push(source[i]);
    }
    var noise = art.noise;
    if (typeof noise === 'number' && noise > 0) {
      var hasNoise = false;
      for (i = 0; i < list.length; i++) {
        if (list[i].kind === 'noise') { hasNoise = true; break; }
      }
      if (!hasNoise) {
        var synth = { kind: 'noise', opacity: noise, size: 160, blend: 'overlay' };
        var vignetteIndex = -1;
        for (i = 0; i < list.length; i++) {
          if (list[i].kind === 'vignette') { vignetteIndex = i; break; }
        }
        if (vignetteIndex >= 0) list.splice(vignetteIndex, 0, synth);
        else list.push(synth);
      }
    }
    return list;
  }

  /**
   * 校验并解析宿主容器：
   * 传入的不是可用元素（null/字符串/已移除的文档碎片/跨文档异常的节点）时回退到
   * document.body / document.documentElement；全部不可用返回 null（调用方安全跳过）。
   */
  function resolveHost(hostEl) {
    var doc = global.document;
    if (!doc) return null;
    var candidates = [hostEl, doc.body, doc.documentElement];
    for (var i = 0; i < candidates.length; i++) {
      var node = candidates[i];
      if (!node) continue;
      if (node.nodeType !== 1) continue;
      if (typeof node.appendChild !== 'function' || typeof node.removeChild !== 'function') continue;
      return node;
    }
    return null;
  }

  /** 移除某个宿主容器里已有的装饰层（重复 render 时防叠加） */
  function clear(hostEl) {
    if (!hostEl || !hostEl.children) return;
    var children = hostEl.children;
    for (var i = children.length - 1; i >= 0; i--) {
      var child = children[i];
      if (child.className && String(child.className).indexOf('kui-art') === 0) {
        hostEl.removeChild(child);
      }
    }
  }

  /* ------------------------------------------------------------------------
   * 对外 API
   * --------------------------------------------------------------------- */

  var themeArt = {

    /**
     * 渲染装饰层。
     * @param {Object|null} artConfig  themes.json 里的 art 配置
     * @param {Element|null} hostEl    挂载容器；省略时挂到 document.body
     * @param {Object} [opts]          { inline: true } 嵌在容器内（.kui-art--inline）
     * @returns {{el: Element, destroy: Function}|null}
     */
    render: function (artConfig, hostEl, opts) {
      if (!global.document) return null;
      var art = artConfig || {};
      var host = resolveHost(hostEl);
      if (!host) {
        warn('render: 宿主容器不可用，已跳过装饰层渲染');
        return null;
      }
      opts = opts || {};

      var root = create('div', opts.inline ? 'kui-art kui-art--inline' : 'kui-art');
      root.setAttribute('aria-hidden', 'true');
      if (art.motif) root.setAttribute('data-kui-motif', String(art.motif));

      var layers = normalizeLayers(art);
      var rnd = makeRandom(hashSeed(JSON.stringify(art)));
      for (var i = 0; i < layers.length; i++) {
        var layer = layers[i];
        var build = builders[layer.kind];
        if (!build) {
          warn('未知的装饰层类型，已跳过: ' + layer.kind);
          continue;
        }
        try {
          var node = build(layer, rnd);
          if (node) root.appendChild(node);
        } catch (e) {
          warn('装饰层渲染失败: ' + layer.kind + ' ' + (e && e.message ? e.message : ''));
        }
      }

      try {
        clear(host);
        host.appendChild(root);
      } catch (e2) {
        warn('装饰层挂载失败: ' + (e2 && e2.message ? e2.message : ''));
        return null;
      }

      var destroyed = false;
      return {
        el: root,
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          if (root.parentNode) root.parentNode.removeChild(root);
          root.innerHTML = '';
        }
      };
    },

    /**
     * 渲染「一套主题」的静态预览（主题卡片 / 文档用，不切换全局主题）。
     * 把 theme.tokens 以局部 CSS 变量写到包裹层上，再以 inline 模式渲染 theme.art，
     * 因此预览内部所有 var(--kui-*) 都取这套主题的值，页面其余部分不受影响。
     * @param {Object} theme        themes.json 中 themes[] 的一项（需要 id / tokens / art）
     * @param {Element|null} hostEl 预览容器；建议父级 position:relative 且给定高度
     * @param {Object} [opts]       { inline:true 用 position:relative 包裹；className 追加类名 }
     * @returns {{el: Element, destroy: Function}|null}
     */
    preview: function (theme, hostEl, opts) {
      if (!global.document || !theme) return null;
      var host = resolveHost(hostEl);
      if (!host) {
        warn('preview: 宿主容器不可用，已跳过预览渲染');
        return null;
      }
      opts = opts || {};
      var wrap = create('div', 'kui-theme-preview' + (opts.className ? ' ' + opts.className : ''));
      wrap.setAttribute('aria-hidden', 'true');
      wrap.setAttribute('data-kui-preview', String(theme.id || ''));
      wrap.style.cssText = opts.inline
        ? 'position:relative;overflow:hidden;pointer-events:none'
        : 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0';
      var tokens = theme.tokens || {};
      for (var key in tokens) {
        if (!Object.prototype.hasOwnProperty.call(tokens, key)) continue;
        var name = String(key);
        if (name.indexOf('--') !== 0) name = '--kui-' + name.replace(/^kui-/, '');
        setVar(wrap, name, tokens[key]);
      }
      var inlineArt = themeArt.render(theme.art, wrap, { inline: true });
      try {
        host.appendChild(wrap);
      } catch (e3) {
        if (inlineArt && inlineArt.destroy) inlineArt.destroy();
        warn('预览层挂载失败: ' + (e3 && e3.message ? e3.message : ''));
        return null;
      }
      var destroyed = false;
      return {
        el: wrap,
        destroy: function () {
          if (destroyed) return;
          destroyed = true;
          if (inlineArt && inlineArt.destroy) inlineArt.destroy();
          if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        }
      };
    },

    /** 移除宿主容器里的装饰层（不销毁主题数据） */
    clear: function (hostEl) {
      clear(hostEl);
    },

    /** 已支持的 layer kind 清单（文档 / 自检用） */
    kinds: (function () {
      var out = [];
      for (var k in builders) {
        if (Object.prototype.hasOwnProperty.call(builders, k)) out.push(k);
      }
      return out;
    })(),

    /** 罗马数字常量（文档 / 外部复用） */
    roman: ROMAN.slice()
  };

  KUI.themeArt = themeArt;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));

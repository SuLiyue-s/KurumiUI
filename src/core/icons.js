/*!
 * KurumiUI · core/icons.js
 * ---------------------------------------------------------------
 * 内联 SVG 图标库（零外部资源、零字体）。
 *   - 统一 24×24 线性图标，stroke: currentColor; stroke-width: 1.7
 *   - 通过 <symbol> sprite + <use> 复用，颜色随字体色变化
 *   - 控件里的装饰箭头 / 角标 / 勾选标记也必须用这里的图标，
 *     保证「所有元素控件风格一致」（契约 §11）
 *
 * 用法：
 *   KUI.icons.create('chevron-down', { size: 14, class: 'my-cls' })  -> SVGElement
 *   KUI.icons.get('search')                                          -> '<svg ...>'
 *   KUI.icons.symbol('search')                                       -> '<symbol ...>'
 *   KUI.icons.register('my-icon', '<path d="..."/>')
 */
(function (global) {
  'use strict';

  var KUI = global.KUI = global.KUI || {};
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var XLINK_NS = 'http://www.w3.org/1999/xlink';
  var SPRITE_ID = 'kui-icon-sprite';
  var spriteEl = null;

  var STROKE_ATTR = 'fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round"';

  /** 图标路径定义（全部为 24×24 视口内的 path/circle/rect 片段） */
  var defs = {
    /* — 通用 — */
    'home': '<path d="M3.4 10.7 12 3.4l8.6 7.3"/><path d="M5.8 9.4V20h12.4V9.4"/><path d="M9.9 20v-5.6h4.2V20"/>',
    'clock': '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.1V12l3.4 2.1"/>',
    'gear': '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.6 5.6l1.9 1.9M16.5 16.5l1.9 1.9M18.4 5.6l-1.9 1.9M7.5 16.5l-1.9 1.9"/>',
    'terminal': '<rect x="3.4" y="5.4" width="17.2" height="13.2" rx="1.6"/><path d="M6.7 9.4 9.3 12l-2.6 2.6M11.7 14.6h4.2"/>',
    'chart': '<path d="M4 3.8V20h16.2"/><path d="M7.6 16.6v-5.2M12 16.6V8.2M16.4 16.6v-3.2"/>',
    'folder': '<path d="M3.4 6.9h6.2l1.9 2.4h9.1v9.3H3.4z"/>',
    'file': '<path d="M6.4 3.4h7l4.2 4.3v12.9H6.4z"/><path d="M13.2 3.5V8h4.3"/>',
    'image': '<rect x="3.8" y="4.8" width="16.4" height="14.4" rx="1.6"/><circle cx="8.6" cy="9.2" r="1.2"/><path d="M4.2 16.2 9 11.4l3.3 3.3 2.9-2.9 4.6 4.6"/>',
    'code': '<path d="M8.5 8 4.5 12l4 4M15.5 8l4 4-4 4M13.6 5.4l-3.2 13.2"/>',
    'database': '<ellipse cx="12" cy="6.4" rx="7.4" ry="2.9"/><path d="M4.6 6.4v11.2c0 1.6 3.3 2.9 7.4 2.9s7.4-1.3 7.4-2.9V6.4"/><path d="M4.6 12c0 1.6 3.3 2.9 7.4 2.9s7.4-1.3 7.4-2.9"/>',
    'link': '<path d="M10.1 13.9a4 4 0 0 0 5.7 0l2.9-2.9a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M13.9 10.1a4 4 0 0 0-5.7 0l-2.9 2.9a4 4 0 0 0 5.7 5.7l1.2-1.2"/>',
    'mail': '<rect x="3.4" y="5.8" width="17.2" height="12.4" rx="1.6"/><path d="m3.8 7 8.2 5.9L20.2 7"/>',
    'message': '<path d="M4 5.4h16v10.2H9.2L4 19.8z"/>',
    'share': '<circle cx="18" cy="5.8" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18.2" r="2.6"/><path d="m8.3 10.7 7.4-3.6M8.3 13.3l7.4 3.6"/>',
    'settings': '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.8 5.8l1.7 1.7M16.5 16.5l1.7 1.7M18.2 5.8l-1.7 1.7M7.5 16.5l-1.7 1.7"/>',
    'power': '<path d="M12 3.4v7.8"/><path d="M7.6 6.4a6.8 6.8 0 1 0 8.8 0"/>',
    'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 3.2v2M12 18.8v2M3.2 12h2M18.8 12h2M5.9 5.9l1.4 1.4M16.7 16.7l1.4 1.4M18.1 5.9l-1.4 1.4M7.3 16.7l-1.4 1.4"/>',
    'moon': '<path d="M20 14.3A8.6 8.6 0 0 1 9.7 4a8.6 8.6 0 1 0 10.3 10.3z"/>',
    'wave': '<path d="M2.8 12c2-4.2 4-4.2 6 0s4 4.2 6 0 3.4-4.2 5.6 0"/>',
    'feather': '<path d="M20.2 3.9c-7 0-12.6 3.4-14.6 9.4-.7 2-.4 3.8.8 5 1.2 1.2 3 1.5 5 .8 6-2 9.4-7.6 8.8-15.2z"/><path d="m20.2 3.9-14 14"/>',
    'cross': '<path d="m5.4 5.4 13.2 13.2M18.6 5.4 5.4 18.6"/>',
    'shield': '<path d="M12 3.2 19.4 6v6c0 4.2-3.2 7.4-7.4 8.8C7.8 19.4 4.6 16.2 4.6 12V6z"/>',
    'target': '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r="1"/>',
    'palette': '<path d="M12 3.4a8.6 8.6 0 0 0 0 17.2c1.4 0 2.1-.9 2.1-2 0-1.6-1.5-1.9-1.5-3.1 0-.9.8-1.5 1.7-1.5h1.9a3.9 3.9 0 0 0 3.9-3.9c0-3.8-3.6-6.7-8.1-6.7z"/><circle cx="8.2" cy="9.2" r=".9"/><circle cx="12" cy="7.4" r=".9"/><circle cx="15.7" cy="9.2" r=".9"/>',
    'star': '<path d="m12 3.9 2.5 5.2 5.6.7-4.1 3.9 1.1 5.6-5.1-2.7-5.1 2.7 1.1-5.6L4 9.8l5.6-.7z"/>',
    'heart': '<path d="M12 20.4S3.7 15.5 3.7 9.8a4.3 4.3 0 0 1 7.7-2.6l.6.7.6-.7a4.3 4.3 0 0 1 7.7 2.6c0 5.7-8.3 10.6-8.3 10.6z"/>',
    'pin': '<path d="M12 21v-6.6"/><path d="M12 14.4c3.6 0 6.2-2.3 6.2-5.2C18.2 5.5 15.4 3 12 3S5.8 5.5 5.8 9.2c0 2.9 2.6 5.2 6.2 5.2z"/>',
    'lock': '<rect x="6.2" y="10.4" width="11.6" height="9.2" rx="1.4"/><path d="M8.8 10.4V8a3.2 3.2 0 1 1 6.4 0v2.4"/>',
    'unlock': '<rect x="6.2" y="10.4" width="11.6" height="9.2" rx="1.4"/><path d="M8.8 10.4V8a3.2 3.2 0 0 1 6.4 0"/>',
    'eye': '<path d="M2.6 12S6.1 6.6 12 6.6 21.4 12 21.4 12 17.9 17.4 12 17.4 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="2.9"/>',
    'eye-off': '<path d="m4 4 16 16"/><path d="M10.1 6.9c.6-.2 1.3-.3 1.9-.3 5.9 0 9.4 5.4 9.4 5.4a17 17 0 0 1-3 3.5"/><path d="M6.6 8.3A17 17 0 0 0 2.6 12S6.1 17.4 12 17.4c1.3 0 2.5-.3 3.6-.7"/>',
    'calendar': '<rect x="3.6" y="6.2" width="16.8" height="14.2" rx="1.6"/><path d="M3.6 10.4h16.8M8.4 3.4v4M15.6 3.4v4"/>',
    'timer': '<circle cx="12" cy="13" r="7.4"/><path d="M12 9.6V13l2.6 1.6M10.4 2.8h3.2"/>',
    'clock-hand': '<circle cx="12" cy="12" r="8.4"/><path d="M12 12 12 5.6M12 12l4.4 2.6"/>',

    /* — 状态 — */
    'info': '<circle cx="12" cy="12" r="8.4"/><path d="M12 11v5.6M12 7.6v.02"/>',
    'success': '<circle cx="12" cy="12" r="8.4"/><path d="m8.1 12.2 2.8 2.8 5.2-5.3"/>',
    'warning': '<path d="M12 3.4 21.2 19.8H2.8z"/><path d="M12 9.4v4.3M12 16.7v.02"/>',
    'error': '<circle cx="12" cy="12" r="8.4"/><path d="m9.1 9.1 5.8 5.8M14.9 9.1l-5.8 5.8"/>',
    'question': '<circle cx="12" cy="12" r="8.4"/><path d="M9.7 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.2 1-1.2 1.9M12 16.8v.02"/>',
    'spinner': '<path d="M12 3.4a8.6 8.6 0 1 0 8.6 8.6"/>',
    'check': '<path d="M4.8 12.6 9.6 17.4 19.4 7.2"/>',

    /* — 方向 — */
    'chevron-up': '<path d="M6.6 14.4 12 9l5.4 5.4"/>',
    'chevron-down': '<path d="M6.6 9.6 12 15l5.4-5.4"/>',
    'chevron-left': '<path d="M14.4 6.6 9 12l5.4 5.4"/>',
    'chevron-right': '<path d="M9.6 6.6 15 12l-5.4 5.4"/>',
    'arrow-up': '<path d="M12 19.6V5M6.6 10.6 12 5.2l5.4 5.4"/>',
    'arrow-down': '<path d="M12 4.4V19M6.6 13.4 12 18.8l5.4-5.4"/>',
    'arrow-left': '<path d="M19.6 12H5M10.6 6.6 5.2 12l5.4 5.4"/>',
    'arrow-right': '<path d="M4.4 12H19M13.4 6.6 18.8 12l-5.4 5.4"/>',
    'expand': '<path d="M9.2 4.4H4.4V9.2M14.8 4.4h4.8V9.2M9.2 19.6H4.4V14.8M14.8 19.6h4.8V14.8"/>',
    'collapse': '<path d="M4.4 9.2h4.8V4.4M19.6 9.2h-4.8V4.4M4.4 14.8h4.8v4.8M19.6 14.8h-4.8v4.8"/>',

    /* — 操作 — */
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'minus': '<path d="M5 12h14"/>',
    'close': '<path d="m6 6 12 12M18 6 6 18"/>',
    'search': '<circle cx="10.7" cy="10.7" r="6.1"/><path d="m15.2 15.2 5.2 5.2"/>',
    'refresh': '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 3.9v4.6h-4.6"/>',
    'fullscreen': '<path d="M4.4 9.4V4.4h5M19.6 9.4V4.4h-5M4.4 14.6v5h5M19.6 14.6v5h-5"/>',
    'exit-fullscreen': '<path d="M9.4 4.4v5h-5M14.6 4.4v5h5M9.4 19.6v-5h-5M14.6 19.6v-5h5"/>',
    'more-h': '<circle cx="5.2" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.8" cy="12" r="1.3"/>',
    'more-v': '<circle cx="12" cy="5.2" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="18.8" r="1.3"/>',
    'grid': '<rect x="4" y="4" width="6.6" height="6.6" rx="1.2"/><rect x="13.4" y="4" width="6.6" height="6.6" rx="1.2"/><rect x="4" y="13.4" width="6.6" height="6.6" rx="1.2"/><rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1.2"/>',
    'list': '<path d="M8.4 6.6h11M8.4 12h11M8.4 17.4h11"/><path d="M4.2 6.6h.02M4.2 12h.02M4.2 17.4h.02"/>',
    'save': '<path d="M5 4.4h10.2L19.6 8.8v10.8H5z"/><path d="M8.2 4.4v4.6h6.6V4.4M8.2 19.6v-5.4h7.6v5.4"/>',
    'download': '<path d="M12 4.2v11.2M7.6 11 12 15.4l4.4-4.4M4.8 19.6h14.4"/>',
    'upload': '<path d="M12 19.6V8.4M7.6 12.8 12 8.4l4.4 4.4M4.8 4.4h14.4"/>',
    'trash': '<path d="M4.6 6.9h14.8M9.6 4.4h4.8M6.6 6.9l1 13.1h8.8l1-13.1M10.2 10.4v6.2M13.8 10.4v6.2"/>',
    'edit': '<path d="M4.4 19.6h4l10-10-4-4-10 10z"/><path d="m13.6 5.6 4 4"/>',
    'copy': '<rect x="8.4" y="8.4" width="11.2" height="11.2" rx="1.4"/><path d="M15.6 8.4V6a1.4 1.4 0 0 0-1.4-1.4H6a1.4 1.4 0 0 0-1.4 1.4v8.2A1.4 1.4 0 0 0 6 15.6h2.4"/>',
    'external-link': '<path d="M14 4.4h5.6V10M19.6 4.4 11 13"/><path d="M9 5.4H4.4v14.2h14.2V15"/>',
    'drag': '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
    'filter': '<path d="M3.6 5.4h16.8l-6.6 7.6v6l-3.8 1.9v-7.9z"/>',
    'sort': '<path d="M8 4.8v14.4M5.2 16.4 8 19.2l2.8-2.8M16 19.2V4.8M13.2 7.6 16 4.8l2.8 2.8"/>',
    'menu': '<path d="M4 7h16M4 12h16M4 17h16"/>',
    'play': '<path d="M8.2 5.4v13.2L18.4 12z"/>',
    'pause': '<path d="M8.6 5.4v13.2M15.4 5.4v13.2"/>',
    'refresh-cw': '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 3.9v4.6h-4.6"/>',

    /* — 导航实体 — */
    'user': '<circle cx="12" cy="8" r="3.7"/><path d="M5 20c0-3.4 3.1-5.7 7-5.7s7 2.3 7 5.7"/>',
    'users': '<circle cx="9.2" cy="8.2" r="3.4"/><path d="M3 19.4c0-3.2 2.8-5.4 6.2-5.4s6.2 2.2 6.2 5.4"/><path d="M16 5.2a3.4 3.4 0 0 1 0 6.6M17.4 14.4c2.3.5 3.8 2.2 3.8 5"/>',
    'bell': '<path d="M6.4 16.6V11a5.6 5.6 0 0 1 11.2 0v5.6"/><path d="M4.8 16.6h14.4"/><path d="M10 19.6c.3.9 1.1 1.4 2 1.4s1.7-.5 2-1.4"/>',
    'book': '<path d="M4.4 5.2c2.6-1 5.2-1 7.6.4 2.4-1.4 5-1.4 7.6-.4v13.4c-2.6-1-5.2-1-7.6.4-2.4-1.4-5-1.4-7.6-.4z"/><path d="M12 5.6v13.4"/>',
    'cube': '<path d="m12 3.4 7.6 4.2v8.8L12 20.6l-7.6-4.2V7.6z"/><path d="M4.4 7.6 12 11.8l7.6-4.2M12 11.8v8.8"/>',
    'layers': '<path d="m12 3.4 8.4 4.4-8.4 4.4L3.6 7.8z"/><path d="m3.6 12.2 8.4 4.4 8.4-4.4M3.6 16.4l8.4 4.4 8.4-4.4"/>',
    'lightning': '<path d="M13.4 3 5.6 13.6h5.2L10 21l7.8-10.6h-5.2z"/>',
    'crown': '<path d="M4 8.4 7.6 15h8.8L20 8.4l-4 2.2-4-6-4 6z"/><path d="M7.6 18.2h8.8"/>',
    'key': '<circle cx="8.4" cy="8.4" r="4.4"/><path d="m11.6 11.6 8 8M16.4 16.4l2-2M18.8 18.8l2-2"/>'
  };

  var iconNames = Object.keys(defs);
  var nameSet = Object.create(null);
  for (var i = 0; i < iconNames.length; i++) nameSet[iconNames[i]] = true;

  function ensureSprite() {
    if (!KUI.env.isBrowser) return null;
    if (spriteEl && spriteEl.parentNode) return spriteEl;
    var existing = document.getElementById(SPRITE_ID);
    if (existing) { spriteEl = existing; return spriteEl; }

    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('id', SPRITE_ID);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');

    var names = Object.keys(defs);
    for (var i = 0; i < names.length; i++) {
      var sym = document.createElementNS(SVG_NS, 'symbol');
      sym.setAttribute('id', 'kui-icon-' + names[i]);
      sym.setAttribute('viewBox', '0 0 24 24');
      sym.innerHTML = '<g ' + STROKE_ATTR + '>' + defs[names[i]] + '</g>';
      svg.appendChild(sym);
    }
    var mount = document.body || document.documentElement;
    mount.appendChild(svg);
    spriteEl = svg;
    return svg;
  }

  var icons = {
    /** 注册或覆盖图标；body 为 24×24 内的 svg 片段 */
    register: function (name, body) {
      if (!name || !body) return icons;
      defs[name] = body;
      nameSet[name] = true;
      // 已存在 sprite 时同步追加 symbol
      if (spriteEl && spriteEl.parentNode) {
        var old = document.getElementById('kui-icon-' + name);
        if (old) old.parentNode.removeChild(old);
        var sym = document.createElementNS(SVG_NS, 'symbol');
        sym.setAttribute('id', 'kui-icon-' + name);
        sym.setAttribute('viewBox', '0 0 24 24');
        sym.innerHTML = '<g ' + STROKE_ATTR + '>' + body + '</g>';
        spriteEl.appendChild(sym);
      }
      return icons;
    },
    has: function (name) { return !!nameSet[name]; },
    list: function () { return Object.keys(defs).sort(); },

    /** 纯字符串形式（利于 innerHTML 批量拼接） */
    get: function (name, opts) {
      opts = opts || {};
      var size = opts.size || 16;
      var body = defs[name];
      if (!body) {
        KUI.warnOnce('icon-missing:' + name, '图标不存在: ' + name);
        body = defs.question;
      }
      var cls = 'kui-icon' + (opts['class'] ? ' ' + opts['class'] : '') +
        (opts.spin ? ' kui-icon--spin' : '');
      return '<svg class="' + cls + '" viewBox="0 0 24 24" width="' + size + '" height="' + size +
        '" aria-hidden="true" focusable="false"><g ' + STROKE_ATTR + '>' + body + '</g></svg>';
    },

    symbol: function (name) {
      var body = defs[name] || defs.question;
      return '<symbol id="kui-icon-' + name + '" viewBox="0 0 24 24"><g ' + STROKE_ATTR + '>' +
        body + '</g></symbol>';
    },

    /** 生成 SVG 元素（推荐） */
    create: function (name, opts) {
      if (!KUI.env.isBrowser) return null;
      opts = opts || {};
      var size = opts.size || 16;
      ensureSprite();
      var svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', size);
      svg.setAttribute('height', size);
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      KUI.addClass(svg, 'kui-icon');
      if (opts['class']) KUI.addClass(svg, opts['class']);
      if (opts.spin) KUI.addClass(svg, 'kui-icon--spin');
      if (opts.style) KUI.setStyle(svg, opts.style);

      var use = document.createElementNS(SVG_NS, 'use');
      var href = '#kui-icon-' + (nameSet[name] ? name : 'question');
      use.setAttribute('href', href);
      try { use.setAttributeNS(XLINK_NS, 'xlink:href', href); } catch (e) { /* noop */ }
      svg.appendChild(use);
      if (opts.title) {
        var t = document.createElementNS(SVG_NS, 'title');
        t.textContent = opts.title;
        svg.appendChild(t);
      }
      return svg;
    },

    /** 为已存在的元素填充图标（保留元素本身作为容器） */
    into: function (host, name, opts) {
      if (!host) return host;
      KUI.empty(host);
      var svg = icons.create(name, opts);
      if (svg) host.appendChild(svg);
      return host;
    },

    sprite: ensureSprite,
    spriteId: SPRITE_ID,
    /** 供服务端/测试使用：导出全部 symbol 字符串 */
    spriteMarkup: function () {
      var out = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">';
      var names = Object.keys(defs);
      for (var i = 0; i < names.length; i++) out += icons.symbol(names[i]);
      return out + '</svg>';
    }
  };

  KUI.icons = icons;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));

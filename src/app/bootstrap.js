/*!
 * KurumiUI · app/bootstrap.js
 * ---------------------------------------------------------------
 * 启动器：读取配置 JSON -> 应用主题 -> 创建 app-shell -> 注册应用级动作。
 *
 * 这里只做「装配」，不写业务与样式：
 *   config/text.json   全部文案
 *   src/themes.json    全部配色/装饰
 *   config/app.json    布局 / 菜单 / 导航 / 标签 / 初始页面 / 应用动作
 *
 * 自动化：页面里存在 `#kui-app`（或 [data-kui-app]）时自动启动；
 * 设置 <body data-kui-auto="false"> 或调用 KUI.boot.disabled = true 可关闭。
 */
(function (global) {
  'use strict';

  var KUI = global.KUI = global.KUI || {};

  var BOOT_ID = 'kui-boot';
  var bootDone = false;

  function doc() { return global.document; }
  function isDom() { return KUI.env.isBrowser && !!doc(); }

  function bootNode() {
    return isDom() ? doc().getElementById(BOOT_ID) : null;
  }

  /* 加载层组件（src/components/boot.js）：存在时交给它渲染；组件被拆掉时退回下面的静态骨架。 */
  function bootLayer() {
    return (KUI.bootLayer && typeof KUI.bootLayer.instance === 'function') ? KUI.bootLayer.instance() : null;
  }

  function bootConfigOf(appCfg) {
    if (appCfg && appCfg.boot && typeof appCfg.boot === 'object') { return appCfg.boot; }
    var legacy = (appCfg && appCfg.app && appCfg.app.loading) || null;
    if (legacy && typeof legacy === 'object') {
      var legacyCfg = { text: legacy.text, hideDelay: legacy.delay };
      if (legacy.icon === 'spinner') { legacyCfg.clock = { mode: 'spin' }; }
      else if (legacy.icon === 'none') { legacyCfg.clock = { enabled: false }; }
      return legacyCfg;
    }
    return null;
  }

  function attachBootLayer(appCfg) {
    if (!KUI.bootLayer || typeof KUI.bootLayer.attach !== 'function') { return null; }
    try {
      return KUI.bootLayer.attach(bootConfigOf(appCfg));
    } catch (e) {
      KUI.warnOnce('boot-layer', '启动层组件 attach 失败：' + ((e && e.message) || e));
      return null;
    }
  }

  function configureBootLayer(appCfg, textCfg) {
    if (!KUI.bootLayer || typeof KUI.bootLayer.configure !== 'function') { return null; }
    try {
      return KUI.bootLayer.configure(bootConfigOf(appCfg) || {}, (textCfg && textCfg.boot) || null);
    } catch (e2) {
      KUI.warnOnce('boot-layer-config', '启动层配置无效：' + ((e2 && e2.message) || e2));
      return null;
    }
  }

  var appliedBootConfig = null;

  function snapshotCfg(cfg) {
    try { return JSON.parse(JSON.stringify(cfg || null)); } catch (e) { return null; }
  }

  /* v1.3.8 接线：app.json 的 boot 段在此生效；enabled:false 时销毁实例并移除静态骨架 */
  function applyBootConfig(appCfg, textCfg) {
    var cfg = bootConfigOf(appCfg);
    if (cfg && cfg.enabled === false) {
      var inst0 = bootLayer();
      if (inst0 && inst0.destroy) { try { inst0.destroy(); } catch (e0) { /* noop */ } }
      var node0 = bootNode();
      if (node0 && node0.parentNode) { node0.parentNode.removeChild(node0); }
      if (isDom()) { doc().documentElement.setAttribute('data-kui-boot', 'off'); }
      appliedBootConfig = { enabled: false };
      if (bootApi) { bootApi.appliedBootConfig = appliedBootConfig; }
      return null;
    }
    var out = configureBootLayer(appCfg, textCfg);
    var appliedCfg = out ? (out.config || out) : cfg;
    appliedBootConfig = snapshotCfg(appliedCfg);
    if (bootApi) { bootApi.appliedBootConfig = appliedBootConfig; }
    return out;
  }

  function setBootText(text) {
    var inst = bootLayer();
    if (inst && inst.setText) { inst.setText(text); return; }
    if (!isDom()) return;
    var el = bootNode();
    if (!el) return;
    var node = el.querySelector('[data-boot-text]');
    if (node) node.textContent = text;
  }

  function setBootStep(step) {
    var inst = bootLayer();
    if (inst && inst.setStep) { inst.setStep(step); return; }
    if (!isDom()) return;
    var el = bootNode();
    if (!el) return;
    el.setAttribute('data-boot-step', String(step));
  }

  function hideBoot() {
    var inst = bootLayer();
    if (inst && inst.done) { inst.done(); return; }
    if (!isDom()) return;
    var el = bootNode();
    if (!el) return;
    KUI.addClass(el, 'is-done');
    try {
      global.setTimeout(function () {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }, 360);
    } catch (e) { /* noop */ }
  }

  function showBootError(message, detail) {
    var inst = bootLayer();
    if (inst && inst.error) {
      KUI.error('[boot] ' + message, detail);
      inst.error(message, detail);
      return;
    }    if (!isDom()) {
      KUI.error('[boot] ' + message, detail);
      return;
    }
    var el = bootNode();
    if (!el) {
      // 没有启动层时，退化为页面级错误块
      el = KUI.h('div', { 'class': 'kui-boot kui-boot--error' });
      (doc().body || doc().documentElement).appendChild(el);
    }
    KUI.addClass(el, 'is-error');
    el.innerHTML = '';
    el.appendChild(KUI.h('div', { 'class': 'kui-boot__error' }, [
      KUI.h('div', { 'class': 'kui-boot__error-title' }, KUI.text('boot.errorTitle', '界面启动失败')),
      KUI.h('div', { 'class': 'kui-boot__error-msg' }, String(message || '')),
      detail ? KUI.h('pre', { 'class': 'kui-boot__error-detail' }, String(detail)) : null,
      KUI.h('div', { 'class': 'kui-boot__error-tip' }, KUI.text('boot.errorTip', '排查建议：使用 npm start 通过 http:// 打开；或先运行 npm run build:config 生成 file:// 兜底配置。')),
      KUI.h('button', {
        'class': 'kui-btn kui-btn--primary',
        on: { click: function () { if (global.location) global.location.reload(); } }
      }, KUI.text('boot.retry', '重新加载'))
    ]));
    KUI.error('[boot] ' + message, detail);
  }

  function resolveHost(opts) {
    if (!isDom()) return null;
    if (opts.host) {
      return typeof opts.host === 'string' ? doc().querySelector(opts.host) : opts.host;
    }
    return doc().getElementById('kui-app') || doc().querySelector('[data-kui-app]');
  }

  /* ------------------------------------------------------------------ */
  /* 小工具                                                              */
  /* ------------------------------------------------------------------ */

  function hexAlpha(color, alpha) {
    var c = String(color || '').trim();
    var m = c.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    if (!m) return c;
    var hex = m[1];
    if (hex.length === 3) {
      hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
    }
    var r = parseInt(hex.slice(0, 2), 16);
    var g = parseInt(hex.slice(2, 4), 16);
    var b = parseInt(hex.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function flattenMenu(items, out) {
    out = out || [];
    if (!items) return out;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || typeof it !== 'object') continue;
      if (it.type !== 'divider') out.push(it);
      if (it.children) flattenMenu(it.children, out);
    }
    return out;
  }

  function tabOf(item) {
    if (!item) return null;
    if (item.target && typeof item.target === 'object' && item.target.tab) {
      return KUI.utils.assign({ id: item.id, title: item.label }, item.target.tab);
    }
    if (item.tab) return KUI.utils.assign({ id: item.id, title: item.label }, item.tab);
    if (item.url) return { id: item.id, title: item.label, url: item.url, icon: item.icon };
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* 应用级动作                                                          */
  /* ------------------------------------------------------------------ */

  function registerActions(app, appCfg) {
    function reg(name, fn) {
      KUI.actions.register(name, fn);
    }

    /* ---- 主题 ---- */
    reg('app.applyTheme', function (ctx, p) {
      var id = p && (p.id || p.theme || p.value);
      var t = KUI.theme.apply(id);
      if (KUI.dialog && p && (p.dialogId || p.closeDialog)) {
        var dialogId = p.dialogId || (typeof p.closeDialog === 'string' ? p.closeDialog : 'theme-picker');
        try { KUI.dialog.close(dialogId); } catch (e) { /* noop */ }
      }
      if (KUI.toast && KUI.toast.success && t) {
        KUI.toast.success(KUI.text('theme.applied', '已切换主题：{name}', { name: t.name }));
      }
      return t ? t.id : null;
    });

    reg('app.themeRandom', function () {
      var ids = [];
      var visRandom = filterVisibleThemes(KUI.theme.list(), appCfg);
      for (var vr = 0; vr < visRandom.length; vr++) { ids.push(visRandom[vr].id); }
      if (!ids.length) { ids = KUI.theme.ids(); }
      if (ids.length < 2) return KUI.theme.currentId();
      var cur = KUI.theme.currentId();
      var next = cur;
      while (next === cur) next = ids[Math.floor(Math.random() * ids.length)];
      var t = KUI.theme.apply(next);
      if (KUI.toast && KUI.toast.success && t) {
        KUI.toast.success(KUI.text('theme.applied', '已切换主题：{name}', { name: t.name }));
      }
      return next;
    });

    reg('theme.toggleScheme', function () {
      var t = KUI.theme.toggleScheme();
      if (KUI.toast && KUI.toast.success && t) {
        KUI.toast.success(KUI.text('theme.applied', '已切换主题：{name}', { name: t.name }));
      }
      return t ? t.id : null;
    });

    reg('theme.picker', function () {
      return openThemePicker(app, appCfg);
    });

    reg('theme.cycle', function () {
      var visCycle = filterVisibleThemes(KUI.theme.list(), appCfg);
      var t = null;
      if (visCycle.length > 1) {
        var curCycle = KUI.theme.currentId();
        var atCycle = -1;
        for (var vc = 0; vc < visCycle.length; vc++) {
          if (visCycle[vc].id === curCycle) { atCycle = vc; break; }
        }
        t = KUI.theme.apply(visCycle[(atCycle + 1) % visCycle.length].id);
      } else {
        t = KUI.theme.next();
      }
      if (KUI.toast && KUI.toast.success && t) {
        KUI.toast.success(KUI.text('theme.applied', '已切换主题：{name}', { name: t.name }));
      }
      return t ? t.id : null;
    });

    /* ---- 搜索（v1.3.6：多结果先展示再选择） ---- */
    reg('search.toggle', function () {
      return openSearch(app, appCfg);
    });

    /* 供「选择要打开的菜单」弹窗里的按钮调用（弹窗 iframe → 父级动作桥） */
    reg('app.openSearchById', function (ctx, p) {
      return openSearchById(app, appCfg, p && (p.id || p.menuId));
    });

    /* 对外暴露只读 API：便于自动化测试与业务扩展（不依赖 UI 交互） */
    KUI.search = {
      menu: function (keyword) { return searchMenu(appCfg, keyword); },
      open: function (id) { return openSearchById(app, appCfg, id); },
      picker: function (keyword, matches) { return showSearchPicker(app, keyword, matches || searchMenu(appCfg, keyword)); }
    };

    /* ---- 提醒信息演示 ---- */
    reg('notify.demo', function () {
      return demoNotify();
    });

    /* ---- 设置 ---- */
    reg('settings.open', function () {
      return openSettings(app, appCfg);
    });

    /* ---- 关于 ---- */
    reg('about.open', function () {
      return openAbout(appCfg);
    });

    /* ---- 提示缺失组件 ---- */
    reg('app.info', function (ctx, p) {
      var msg = p && (p.message || p.text);
      if (KUI.toast && msg) KUI.toast.info(msg);
      return msg;
    });
  }

  /* ------------------------------------------------------------------ */
  /* 主题选择弹窗                                                        */
  /* ------------------------------------------------------------------ */

  /* v1.3.8：theme.visible 的真实读取点（选择器 / 随机 / 循环共用） */
  function filterVisibleThemes(list, appCfg) {
    var all = list || [];
    var cfg = (appCfg && appCfg.theme) || {};
    var visible = cfg.visible;
    if (!visible || !visible.length) { return all; }
    var allow = {};
    for (var i = 0; i < visible.length; i++) { allow[String(visible[i])] = true; }
    var out = [];
    for (var j = 0; j < all.length; j++) {
      if (allow[all[j].id]) { out.push(all[j]); }
    }
    return out.length ? out : all;
  }

  function buildThemePickerNodes(pickerCfg, appCfg) {
    var picker = pickerCfg || {};
    var list = filterVisibleThemes(KUI.theme.list(), appCfg);
    var cur = KUI.theme.currentId();
    var columns = Math.max(1, Math.min(6, Number(picker.columns) || 3));
    var showPreview = picker.showPreview !== false;
    var cards = [];

    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      var tk = t.tokens || {};
      var bg = tk['--kui-bg-1'] || tk['--kui-bg-0'] || '#141018';
      var acc = tk['--kui-accent'] || '#c8102e';
      var gold = tk['--kui-accent-2'] || '#d4af37';
      var fg = tk['--kui-text-1'] || '#ffffff';
      var active = t.id === cur;
      cards.push({
        type: 'button',
        'class': 'kui-theme-card' + (active ? ' is-active' : ''),
        variant: active ? 'primary' : 'ghost',
        text: t.name,
        title: (t.desc || '') + ' [' + t.id + ']',
        style: showPreview ? {
          background: 'linear-gradient(145deg, ' + bg + ' 0%, ' + bg + ' 58%, ' + hexAlpha(acc, 0.32) + ' 100%)',
          color: fg,
          borderColor: active ? acc : hexAlpha(gold, 0.36),
          boxShadow: active ? '0 0 0 1px ' + hexAlpha(acc, 0.9) + ', 0 10px 26px ' + hexAlpha(acc, 0.3) : 'none',
          minHeight: '68px'
        } : {
          color: 'var(--kui-text-1)',
          borderColor: active ? acc : 'var(--kui-border)',
          minHeight: '44px'
        },
        on: {
          click: {
            actions: [
              { action: 'app.applyTheme', params: { id: t.id } },
              { action: 'dialog.close', params: { id: 'theme-picker' } }
            ]
          }
        }
      });
    }

    var ops = [
      {
        type: 'button', variant: 'ghost', icon: 'refresh',
        text: KUI.text('theme.picker.random', '随机主题'),
        on: { click: { action: 'app.themeRandom' } }
      }
    ];
    if (picker.showScheme !== false) {
      ops.push({
        type: 'button', variant: 'ghost', icon: 'sun',
        text: KUI.text('theme.picker.scheme', '深浅切换'),
        on: { click: { action: 'theme.toggleScheme' } }
      });
    }
    ops.push({
      type: 'button', variant: 'ghost', icon: 'palette',
      text: KUI.text('theme.picker.page', '主题展示页'),
      on: {
        click: {
          action: 'nav.open',
          params: { id: 'theme-page', title: KUI.text('menu.theme', '主题'), icon: 'palette', url: 'standalone/theme.html' }
        }
      }
    });

    return [
      {
        'class': 'kui-theme-picker__grid',
        style: { display: 'grid', gridTemplateColumns: 'repeat(' + columns + ', minmax(0, 1fr))', gap: '10px' },
        nodes: cards
      },
      {
        'class': 'kui-theme-picker__ops',
        style: { display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' },
        nodes: ops
      }
    ];
  }

  function openThemePicker(app, appCfg) {
    if (!KUI.dialog || typeof KUI.dialog.custom !== 'function') {
      // 没有弹窗组件时退化为循环切换，保证动作仍可用
      return KUI.actions.run('theme.cycle');
    }
    var picker = (appCfg && appCfg.theme && appCfg.theme.picker) || {};
    var width = Number(picker.width);
    return KUI.dialog.custom({
      id: 'theme-picker',
      title: picker.title || KUI.text('theme.picker.title', '选择界面风格'),
      subtitle: picker.desc || KUI.text('theme.picker.subtitle', '配置来自 src/themes.json，切换后自动保存'),
      width: width > 0 ? width : 680,
      maskClosable: picker.maskClosable !== false,
      closeOnEsc: true,
      footer: false,
      nodes: buildThemePickerNodes(picker, appCfg)
    });
  }

  /* ------------------------------------------------------------------ */
  /* 搜索（菜单/标签）                                                   */
  /* ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------ */
  /* 搜索（菜单）：模糊匹配 → 多结果先展示、再选择打开（v1.3.6）          */
  /* ------------------------------------------------------------------ */

  /**
   * 展开菜单树，保留「父路径 / 父路径 / 自己」用于展示与匹配。
   * 返回 [{ item, id, label, path }]
   */
  function flattenMenuWithPath(items, parentPath, out) {
    var list = KUI.utils.toArray(items);
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (!it || typeof it !== 'object' || it.type === 'divider') continue;
      var label = it.label || it.text || it.title || it.id || '';
      if (!label) continue;
      var pathText = parentPath ? (parentPath + ' / ' + label) : String(label);
      var children = it.children;
      if (children && children.length) {
        flattenMenuWithPath(children, pathText, out);
      } else {
        out.push({
          item: it,
          id: it.id,
          label: String(label),
          path: pathText,
          keywords: it.keywords || it.keyword || ''
        });
      }
    }
    return out;
  }

  /**
   * 6 档评分：精确 100 > 前缀 90 > 路径前缀 80 > label 包含 70 > 任意字段包含 55 > 子序列 30 > 不匹配 0
   */
  function scoreMenu(entry, kw) {
    var label = String(entry.label || '').toLowerCase();
    var pathText = String(entry.path || '').toLowerCase();
    var id = String(entry.id || '').toLowerCase();
    var hay = [label, pathText, id, String(entry.keywords || '').toLowerCase()].join(' ');
    if (label === kw || id === kw) return 100;
    if (label.indexOf(kw) === 0 || id.indexOf(kw) === 0) return 90;
    if (pathText.indexOf(kw) === 0) return 80;
    if (label.indexOf(kw) >= 0) return 70;
    if (hay.indexOf(kw) >= 0) return 55;
    var k = 0;
    for (var i = 0; i < label.length && k < kw.length; i++) {
      if (label.charAt(i) === kw.charAt(k)) k++;
    }
    return k === kw.length ? 30 : 0;
  }

  function allMenuEntries(appCfg) {
    var menuCfg = (appCfg && appCfg.menu) || {};
    var items = (menuCfg.props && menuCfg.props.items) || menuCfg.items || [];
    return flattenMenuWithPath(items, '', []);
  }

  /** 返回按评分降序排列的匹配项（含 score 字段） */
  function searchMenu(appCfg, keyword) {
    var kw = String(keyword == null ? '' : keyword).trim().toLowerCase();
    if (!kw) return [];
    var entries = allMenuEntries(appCfg);
    var hits = [];
    for (var i = 0; i < entries.length; i++) {
      var score = scoreMenu(entries[i], kw);
      if (score > 0) {
        hits.push({ item: entries[i].item, id: entries[i].id, label: entries[i].label, path: entries[i].path, score: score });
      }
    }
    hits.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.path).localeCompare(String(b.path));
    });
    return hits;
  }

  /** 打开一个搜索结果（标签走 openTab，纯菜单项走 selectMenu） */
  function openSearchEntry(app, entry) {
    if (!entry) return null;
    var tab = tabOf(entry.item || entry);
    if (tab) {
      if (app && typeof app.openTab === 'function') app.openTab(tab);
    } else if (app && typeof app.selectMenu === 'function') {
      app.selectMenu(entry.id);
    }
    if (KUI.toast && KUI.toast.success) {
      KUI.toast.success(KUI.text('search.opened', '已打开：{name}', { name: entry.label }), { duration: 1600 });
    }
    return entry.id;
  }

  /** 按 id 打开（弹窗按钮通过 app.openSearchById 动作调用） */
  function openSearchById(app, appCfg, id) {
    if (!id) return null;
    var entries = allMenuEntries(appCfg);
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].id === id) return openSearchEntry(app, entries[i]);
    }
    return null;
  }

  /**
   * 「选择要打开的菜单」列表弹窗：
   * - 最多列 10 项（每项显示完整父路径），超出部分给出补充关键词提示
   * - 点击任意一项 → 父级执行 app.openSearchById 并关闭本弹窗（弹窗是独立 iframe，动作走父级动作桥）
   */
  function showSearchPicker(app, keyword, matches) {
    if (!KUI.dialog || typeof KUI.dialog.custom !== 'function') return Promise.resolve(null);
    var list = (matches || []).slice(0, 10);
    var nodes = [{
      type: 'alert',
      props: {
        type: 'info',
        showIcon: true,
        message: KUI.text('search.matched', '关键词「{kw}」匹配到 {n} 个菜单，请选择要打开的一项：', { kw: keyword, n: (matches || []).length })
      }
    }];
    for (var i = 0; i < list.length; i++) {
      nodes.push({
        type: 'button',
        props: {
          text: list[i].path,
          variant: 'ghost',
          block: true,
          size: 'sm',
          icon: 'chevron-right'
        },
        on: {
          click: {
            actions: [
              { action: 'app.openSearchById', params: { id: list[i].id } },
              { action: 'dialog.close', params: { id: 'search-picker' } }
            ]
          }
        }
      });
    }
    if ((matches || []).length > list.length) {
      nodes.push({
        type: 'text',
        props: {
          type: 'secondary',
          text: KUI.text('search.more', '另有 {n} 项未列出，请在关键词中补充更精确的信息。', { n: (matches || []).length - list.length })
        }
      });
    }
    return KUI.dialog.custom({
      id: 'search-picker',
      title: KUI.text('search.pickerTitle', '选择要打开的菜单'),
      subtitle: KUI.text('search.pickerSubtitle', '共 {n} 个匹配', { n: (matches || []).length }),
      width: 560,
      footer: false,
      closeOnEsc: true,
      nodes: nodes
    });
  }

  function openSearch(app, appCfg) {
    if (!KUI.dialog || typeof KUI.dialog.prompt !== 'function') {
      return Promise.resolve(null);
    }
    return KUI.dialog.prompt({
      id: 'search',
      title: KUI.text('search.title', '快速跳转'),
      label: KUI.text('search.label', '输入菜单或页面名称（支持模糊匹配，多个结果会出现候选列表）'),
      placeholder: KUI.text('search.placeholder', '例如：表单 / 主题 / demo'),
      input: { type: 'text' },
      okText: KUI.text('search.ok', '搜索'),
      cancelText: KUI.text('dialog.cancel', '取消')
    }).then(function (keyword) {
      var raw = String(keyword == null ? '' : keyword).trim();
      if (!raw) return null;
      var matches = searchMenu(appCfg, raw);
      if (!matches.length) {
        if (KUI.toast && KUI.toast.warning) {
          KUI.toast.warning(KUI.text('search.notFound', '没有找到匹配项：{kw}', { kw: raw }));
        }
        return null;
      }
      if (matches.length === 1) return openSearchEntry(app, matches[0]);
      /* 多个匹配：先展示全部候选（含父路径），由用户选择后再打开 */
      showSearchPicker(app, raw, matches);
      return null;
    });
  }

  /* ------------------------------------------------------------------ */
  /* 提醒信息演示                                                        */
  /* ------------------------------------------------------------------ */

  var demoSeq = 0;
  function demoNotify() {
    if (!KUI.toast) return null;
    var tips = [
      { type: 'success', key: 'toast.demo.saved', def: '配置已保存' },
      { type: 'info', key: 'toast.demo.info', def: '这是一条普通提示信息' },
      { type: 'warning', key: 'toast.demo.warning', def: '注意：该操作不可撤销' },
      { type: 'error', key: 'toast.demo.error', def: '请求失败，请稍后重试' }
    ];
    var t = tips[demoSeq % tips.length];
    demoSeq++;
    var msg = KUI.text(t.key, t.def);
    if (typeof KUI.toast[t.type] === 'function') KUI.toast[t.type](msg);
    else if (KUI.toast.show) KUI.toast.show({ type: t.type, message: msg });

    // 每 4 次附带一个通知气泡，展示两种提醒形态
    if (demoSeq % 4 === 0) {
      if (typeof KUI.toast.notification === 'function') {
        KUI.toast.notification({
          title: KUI.text('toast.demo.notifyTitle', '系统提醒'),
          message: KUI.text('toast.demo.notifyBody', '子标签中的页面保持运行，切换不会丢失未保存的数据。'),
          duration: 5200
        });
      } else if (KUI.toast.show) {
        KUI.toast.show({
          mode: 'notification',
          title: KUI.text('toast.demo.notifyTitle', '系统提醒'),
          message: KUI.text('toast.demo.notifyBody', '子标签中的页面保持运行，切换不会丢失未保存的数据。')
        });
      }
    }
    return demoSeq;
  }

  /* ------------------------------------------------------------------ */
  /* 设置弹窗                                                            */
  /* ------------------------------------------------------------------ */

  function defaultSettingsNodes(app) {
    var themes = KUI.theme.list();
    var options = [];
    for (var i = 0; i < themes.length; i++) {
      options.push({ label: themes[i].name, value: themes[i].id });
    }
    return [
      {
        type: 'select',
        id: 'theme',
        label: KUI.text('settings.theme', '界面风格'),
        options: options,
        value: KUI.theme.currentId()
      },
      {
        type: 'switch',
        id: 'collapsed',
        label: KUI.text('settings.collapsed', '折叠左侧菜单'),
        value: !!(app && app.collapsed)
      },
      {
        type: 'switch',
        id: 'motion',
        label: KUI.text('settings.motion', '界面动效'),
        value: true,
        tip: KUI.text('settings.motionTip', '关闭后减少动画，降低视觉干扰')
      }
    ];
  }

  function openSettings(app, appCfg) {
    if (!KUI.dialog) return null;
    var conf = (appCfg && appCfg.dialogs && appCfg.dialogs.settings) || {};
    var nodes = conf.nodes && conf.nodes.length ? conf.nodes : defaultSettingsNodes(app);
    var data = conf.data || {};
    if (data.theme === undefined) data.theme = KUI.theme.currentId();
    if (data.collapsed === undefined) data.collapsed = !!(app && app.collapsed);

    var req = {
      id: 'settings',
      title: conf.title || KUI.text('settings.title', '界面设置'),
      nodes: nodes,
      data: data,
      width: conf.width || 560,
      okText: conf.okText || KUI.text('dialog.ok', '确定'),
      cancelText: conf.cancelText || KUI.text('dialog.cancel', '取消')
    };

    var api = typeof KUI.dialog.form === 'function' ? KUI.dialog.form : null;
    if (!api) return KUI.dialog.custom(req);

    return api(req).then(function (values) {
      if (!values) return null;
      if (values.theme && KUI.theme.has(values.theme)) KUI.theme.apply(values.theme);
      if (values.collapsed !== undefined && app && app.setCollapsed) app.setCollapsed(!!values.collapsed);
      if (values.motion !== undefined && isDom()) {
        KUI.toggleClass(doc().documentElement, 'kui-reduce-motion', !values.motion);
      }
      if (KUI.toast && KUI.toast.success) {
        KUI.toast.success(KUI.text('settings.saved', '设置已应用'));
      }
      return values;
    });
  }

  /* ------------------------------------------------------------------ */
  /* 关于弹窗                                                            */
  /* ------------------------------------------------------------------ */

  function openAbout(appCfg) {
    if (!KUI.dialog) return null;
    var meta = (appCfg && appCfg.app) || {};
    var cfg = (appCfg && appCfg.dialogs && appCfg.dialogs.about) || {};
    if (KUI.dialog.alert) {
      return KUI.dialog.alert({
        title: cfg.title || KUI.text('about.title', '关于'),
        icon: 'info',
        message: cfg.message || KUI.text('about.message',
          'KurumiUI 是一套「配置 JSON + 渲染代码」的 UI 框架：所有界面内容与配色都在 JSON 里，代码只负责渲染。')
      });
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* 启动主流程                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * 应用配置里的元信息：document.title、启动层标题/副标题/加载文案。
   * 全部来自 config/app.json 的 app.* 字段；缺失时保留页面自带文案。
   */
  /* v1.3.8：把 app.* 元信息注入菜单品牌/页脚/顶部导航（此前 app.version / copyright 等无读取点） */
  function applyAppMetaToConfig(appCfg) {
    if (!appCfg || typeof appCfg !== 'object') { return appCfg; }
    var meta = appCfg.app || {};
    var menu = appCfg.menu && appCfg.menu.props;
    if (menu) {
      var brand = menu.brand || (menu.brand = {});
      if (!brand.title && meta.title) { brand.title = meta.title; }
      if (!brand.subtitle && meta.subtitle) { brand.subtitle = meta.subtitle; }
      if (!brand.logoIcon && meta.logoIcon) { brand.logoIcon = meta.logoIcon; }
      if (!brand.logoText && meta.logoText) { brand.logoText = meta.logoText; }
      if (menu.footer && typeof menu.footer === 'object') {
        var footer = menu.footer;
        if (!footer.version && meta.version) { footer.version = 'v' + meta.version; }
        if (!footer.subtitle && meta.footerSubtitle) { footer.subtitle = meta.footerSubtitle; }
        if (!footer.copyright && meta.copyright) { footer.copyright = meta.copyright; }
      }
    }
    var nav = appCfg.menunav && appCfg.menunav.props;
    if (nav && !nav.title && meta.title) { nav.title = meta.title; }
    return appCfg;
  }

  function applyAppMeta(appCfg) {
    if (!isDom()) return;
    var meta = (appCfg && appCfg.app) || {};
    var title = meta.documentTitle || meta.title || meta.name || '';
    if (title) {
      try { doc().title = String(title); } catch (e) { /* noop */ }
    }
    var appText = (appCfg && appCfg.text && appCfg.text.app) || {};
    var inst = bootLayer();
    if (inst && inst.setMeta) {
      inst.setMeta({ title: meta.name || title, subtitle: meta.subtitle || appText.subtitle });
      var bootLoading = KUI.text('boot.loading');
      if (bootLoading) inst.setText(bootLoading);
      return;
    }
    var el = bootNode();
    if (!el) return;
    var titleNode = el.querySelector('.kui-boot__title');
    var subNode = el.querySelector('.kui-boot__sub');
    var textNode = el.querySelector('[data-boot-text]');
    if (titleNode && (meta.name || title)) {
      titleNode.textContent = String(meta.name || title);
    }
    if (subNode && (meta.subtitle || appText.subtitle)) {
      subNode.textContent = String(meta.subtitle || appText.subtitle);
    }
    if (textNode && KUI.text('boot.loading')) {
      textNode.textContent = KUI.text('boot.loading', textNode.textContent);
    }
  }

  /**
   * 应用 UI 级配置（config/app.json 的 ui.*），全部可选：
   *   ui.tooltip.enabled / delay / offset / maxWidth / placement
   *   ui.toast.position / max（提醒信息默认位置与数量）
   *   ui.dialog.maskClosable / escClosable / animation
   * 缺省时沿用各模块自身的 DEFAULTS。
   */
  function applyUiConfig(appCfg) {
    var ui = (appCfg && appCfg.ui) || {};
    if (!ui || typeof ui !== 'object') return;
    if (ui.tooltip && KUI.tooltip && typeof KUI.tooltip.configure === 'function') {
      try { KUI.tooltip.configure(ui.tooltip); } catch (e) {
        KUI.warnOnce('ui-tooltip', 'ui.tooltip 配置无效：' + ((e && e.message) || e));
      }
    }
    if (ui.toast && KUI.toast && typeof KUI.toast.config === 'function') {
      try { KUI.toast.config(ui.toast); } catch (e2) {
        KUI.warnOnce('ui-toast', 'ui.toast 配置无效：' + ((e2 && e2.message) || e2));
      }
    }
    if (ui.dialog && KUI.dialog && typeof KUI.dialog.config === 'function') {
      try { KUI.dialog.config(ui.dialog); } catch (e3) {
        KUI.warnOnce('ui-dialog', 'ui.dialog 配置无效：' + ((e3 && e3.message) || e3));
      }
    }
  }

  function boot(opts) {
    opts = opts || {};
    if (!isDom()) {
      return Promise.reject(new Error('KurumiUI 需要在浏览器环境启动'));
    }

    var host = resolveHost(opts);
    if (!host) {
      showBootError(KUI.text('boot.noHost', '页面缺少挂载点：#kui-app'), '请在页面中加入 <div id="kui-app"></div>');
      return Promise.reject(new Error('缺少挂载点 #kui-app'));
    }

    attachBootLayer(null);

    var t0 = Date.now();
    setBootStep(1);
    setBootText(KUI.text('boot.loading', '正在加载界面配置…'));

    return KUI.config.loadMany(['text', 'themes', 'app'], { quiet: true }).then(function (res) {
      /* ---- 文案 ---- */
      if (res.text) KUI.i18n.set(res.text);
      var appCfg = res.app || {};
      if (appCfg.text && typeof appCfg.text === 'object') KUI.i18n.set(appCfg.text);

      if (!res.app) {
        throw new Error(KUI.text('boot.noConfig', '未找到 config/app.json'));
      }

      /* ---- 应用元信息（标题/启动层文案，全部来自配置） ---- */
      applyAppMeta(appCfg);

      /* ---- 启动层配置（v1.3.8 接线：config/app.json 的 boot 段在此生效） ---- */
      applyBootConfig(appCfg, res.text);

      /* ---- UI 级配置（悬浮提示/提醒/弹窗，全部来自配置） ---- */
      applyUiConfig(appCfg);

      /* ---- app.* 元信息注入各组件配置（v1.3.8） ---- */
      applyAppMetaToConfig(appCfg);

      /* ---- 主题 ---- */
      setBootStep(2);
      setBootText(KUI.text('boot.theme', '正在应用界面风格…'));
      var themeCfg = appCfg.theme || {};
      var themesData = res.themes || (global.__KUI_BUNDLE__ && global.__KUI_BUNDLE__.themes) || null;
      if (themesData) {
        KUI.theme.init(themesData, {
          fallbackId: themeCfg['default'] || themeCfg.defaultId || null,
          storageKey: themeCfg.storageKey || 'kui-theme',
          persist: themeCfg.persist !== false,
          silent: false
        });
      } else {
        KUI.warnOnce('no-themes', '未载入 src/themes.json，使用 base.css 的默认配色。');
      }

      /* ---- 外壳 ---- */
      setBootStep(3);
      setBootText(KUI.text('boot.shell', '正在构建界面…'));
      var app = KUI.app.create(host, appCfg, { initialTabs: opts.initialTabs });

      /* ---- 应用动作 ---- */
      registerActions(app, appCfg);

      /* ---- 收尾 ---- */
      setBootStep(4);
      if (isDom()) {
        KUI.addClass(doc().body, 'kui-ready');
        doc().documentElement.setAttribute('data-kui-boot', 'done');
      }
      bootDone = true;
      hideBoot();

      // 新 iframe 加载完成后可主动来要主题；同时窗口尺寸变化时重绘装饰层
      if (isDom() && !boot.__resizeBound) {
        boot.__resizeBound = true;
        var onResize = KUI.utils.debounce(function () {
          try { KUI.theme.refreshArt(); } catch (e) { /* noop */ }
        }, 160);
        global.addEventListener('resize', onResize);
      }

      var cost = Date.now() - t0;
      KUI.bus.emit('boot:done', { app: app, cost: cost });
      if (opts.debug || /[?&]debug/.test(global.location.search || '')) {
        KUI.log('KurumiUI 启动完成，耗时 ' + cost + 'ms');
      }
      return app;
    })['catch'](function (err) {
      var msg = (err && err.message) || String(err);
      showBootError(msg, err && err.stack ? err.stack : '');
      KUI.bus.emit('boot:error', { error: err });
      return Promise.reject(err);
    });
  }

  /* ------------------------------------------------------------------ */
  /* 自动启动                                                            */
  /* ------------------------------------------------------------------ */

  function autoBoot() {
    if (bootDone) return;
    var body = doc().body;
    if (body && body.getAttribute && body.getAttribute('data-kui-auto') === 'false') return;
    if (KUI.boot.disabled === true) return;
    var host = doc().getElementById('kui-app') || doc().querySelector('[data-kui-app]');
    if (!host) return;
    bootDone = true;
    boot({});
  }

  var bootApi = KUI.boot = function (opts) {
    return boot(opts);
  };
  bootApi.boot = boot;
  bootApi.auto = autoBoot;
  bootApi.error = showBootError;
  bootApi.ready = function () { return bootDone; };
  bootApi.disabled = false;
  bootApi.version = '1.0.0';
  bootApi.applyBootConfig = applyBootConfig;
  bootApi.applyAppMetaToConfig = applyAppMetaToConfig;
  bootApi.appliedBootConfig = null;

  if (isDom()) {
    if (doc().readyState === 'loading') {
      doc().addEventListener('DOMContentLoaded', autoBoot);
    } else {
      global.setTimeout(autoBoot, 0);
    }
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));

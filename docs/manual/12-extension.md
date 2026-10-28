# 12 · 扩展开发全指南

> 适用版本：KurumiUI v1.3.8 ｜ 前置章节：05 · 表单控件、07 · 表单引擎、08 · 复合组件、10 · 动作与业务函数、11 · iframe 通信 ｜ 阅读时长：约 40 分钟

## 本章目标

- 掌握扩展点从「落点文件 → 注册 API → 装配进构建 → 验证」的闭环。
- 新增表单控件（CSS + form 集成 + 值读写 + 校验），区分 `KUI.registry.register` 与 `KUI.controls.base` 基座。
- 新增复合组件（DOM 模板、open/close、事件、单例/多实例、实例 API、handlers、动作）。
- 新增动作与业务函数，说清 `ctx / params / ev` 入参、返回值、异步与错误处理。
- 新增页面并接进 `config/app.json` 的菜单、标签页、面包屑；改 `config/kui-modules.json` 或新增 profile。
- 覆盖内置实现、扩展 dialog-frame、封装第三方库，并按检查表自查。

KurumiUI 的扩展面只有四张表：元素类型表 `KUI.registry`、动作表 `KUI.actions`、业务函数表 `KUI.handlers`、模块清单 `config/kui-modules.json`。扩展 = 往表里加东西，再让构建装进 `src/core/kui-all.js`。

| 我要新增…… | 落点文件 | 注册/装配 API | 改清单？ | 见 |
| --- | --- | --- | --- | --- |
| 表单控件 | `src/components/controls/business.js` | `controls.define(type, def)`（内部走 `registry.register`） | 路线 B 才要 | 12.2 |
| 复合组件 | `src/components/drawer.js` | `KUI.registry.register` + `KUI.drawer` 静态 API | 要 | 12.3 |
| 主题 | `src/themes.json` | `KUI.theme.register` / `KUI.theme.apply` | 不要 | 12.4 |
| 内置动作 | `src/app/bootstrap.js` 或业务文件 | `KUI.actions.register(name, fn)` | 随 profile 加载 | 12.5 |
| 业务函数 | 业务文件 / 组件 handlers 文件 | `KUI.handlers.register(scope, name, fn, meta)` | 同上 | 12.6 |
| 页面 | `pages/xxx.html` | 页面 HTML + `config/app.json` | 不要 | 12.7 |
| profile | `config/kui-modules.json` | `npm run build:all` 重生成装载器 | 要 | 12.8 |
| 覆盖内置 | 后加载的业务文件 | 同名 `KUI.registry.register` | 要（控制顺序） | 12.9 |
| 自定义弹窗页 | `src/frame/my-dialog.html` | `app.json` 的 `dialog.frameUrl` | 不要 | 12.10 |
| 第三方库封装 | `src/components/controls/third-party.js` | `controls.define` + `base.addDestroyer` | 路线 B 才要 | 12.11 |

> 框架代码全部 ES5（Node 13.14 兼容）：不要用 `?.`、`??`、`||=`、`replaceAll`、顶层 `await`，否则 `node tools/check-compat.js` 会失败。

## 12.2 新增一个表单控件（评分条 / 标签输入器）

**适用场景**：内置 19 个表单控件不够用，但仍要出现在 `KUI.form.create` 的 `nodes` 里，享受 label/必填/校验/取值/联动。

**需要改哪些文件**：新建 `src/components/controls/business.js`；样式追加到 `src/styles/controls.css`；路线 A 改 `src/components/controls/index.js` 的 `FILES` 一行，路线 B 改 `config/kui-modules.json` 两个 profile。

**第一步：写控件**。不要直接 `registry.register`——用 `KUI.controls.base` 收尾，才能自动获得 label 包装、`is-error`、`setDisabled/setReadonly/setError`、`destroy` 等契约（`control-base.js:952-1010`）。

```js
/*! KurumiUI - controls/business.js（新建）：scorebar 评分条、taginput 标签输入器 */
(function (global) {
  'use strict';
  var KUI = global.KUI = global.KUI || {};
  var controls = KUI.controls = KUI.controls || {};
  var base = controls.base;
  if (!base) { return; }
  var define = controls.define;
  function propsOf(node, defaults) { return base.merge({}, defaults, base.getProps(node)); }

  /* ============ 1. scorebar：0–max 分段评分，点击轨道/刻度/方向键改值 ============ */
  var SCOREBAR_DEFAULTS = { value: 0, min: 0, max: 10, step: 1, labels: [], showValue: true, disabled: false, readonly: false };

  function renderScorebar(node, ctx) {
    var props = propsOf(node, SCOREBAR_DEFAULTS);
    var min = base.isNum(props.min) ? Number(props.min) : 0;
    var max = base.isNum(props.max) && props.max > min ? Number(props.max) : 10;
    var step = base.isNum(props.step) && props.step >= 1 ? Number(props.step) : 1;
    var state = { value: clamp(Number(props.value)), disabled: !!props.disabled, readonly: !!props.readonly };
    var tickEls = [], api;

    var box = base.el('div', { 'class': 'kui-scorebar' });
    var track = base.el('div', { 'class': 'kui-scorebar__track', role: 'slider', tabindex: '0', 'aria-valuemin': String(min), 'aria-valuemax': String(max) });
    var fill = base.el('div', { 'class': 'kui-scorebar__fill' });
    track.appendChild(fill);
    var ticks = base.el('div', { 'class': 'kui-scorebar__ticks' });
    for (var i = min; i <= max; i += step) {
      (function (n) {
        var tik = base.el('span', { 'class': 'kui-scorebar__tick', text: String(n) });
        base.on(tik, 'click', function () { setValue(n, 'tick'); });
        ticks.appendChild(tik);
        tickEls.push({ n: n, el: tik });
      })(i);
    }
    var valueEl = base.el('span', { 'class': 'kui-scorebar__value' });
    var labelEl = base.el('span', { 'class': 'kui-scorebar__label' });
    box.appendChild(track); box.appendChild(ticks); box.appendChild(valueEl); box.appendChild(labelEl);

    function clamp(v) {
      var n = Number(v);
      if (isNaN(n)) { return min; }
      n = min + Math.round((n - min) / step) * step;
      return n < min ? min : (n > max ? max : n);
    }
    function sync() {
      var pct = max === min ? 0 : ((state.value - min) / (max - min)) * 100;
      fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
      track.setAttribute('aria-valuenow', String(state.value));
      base.toggleClass(box, 'is-disabled', state.disabled);
      base.toggleClass(box, 'is-readonly', state.readonly);
      valueEl.textContent = props.showValue ? String(state.value) : '';
      labelEl.textContent = (base.isArr(props.labels) && props.labels[state.value]) || '';
      base.each(tickEls, function (t) { base.toggleClass(t.el, 'is-active', t.n <= state.value); });
    }
    function setValue(v, reason) {
      if (state.disabled || state.readonly) { return; }
      var next = clamp(v);
      if (next === state.value) { return; }
      state.value = next;
      sync();
      base.emitChange(box, ctx, node, state.value, { reason: reason || 'input' }); // 必调：联动/校验/onChange 靠它
    }

    base.on(track, 'click', function (ev) {
      var rect = track.getBoundingClientRect();
      if (rect.width) { setValue(min + ((ev.clientX - rect.left) / rect.width) * (max - min), 'track'); }
    });
    base.on(track, 'keydown', function (ev) {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') { ev.preventDefault(); setValue(state.value + step, 'key'); }
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') { ev.preventDefault(); setValue(state.value - step, 'key'); }
    });
    base.on(track, 'focus', function () { base.addClass(box, 'is-focus'); base.emitFocus(box, ctx, node); });
    base.on(track, 'blur', function () { base.removeClass(box, 'is-focus'); base.emitBlur(box, ctx, node); });
    sync();

    var impl = {
      getValue: function () { return state.value; },
      setValue: function (v, opts) {
        state.value = clamp(v); sync();
        if (!opts || !opts.silent) { base.emitChange(box, ctx, node, state.value, { reason: 'set' }); }
        return api;
      },
      validate: function () {
        var rules = base.getValidateRules(node);
        if (state.value <= min) { return { valid: false, message: (rules[0] && rules[0].message) || '请先给出评分' }; }
        return { valid: true, message: '' };
      },
      focus: function () { if (track.focus) { track.focus(); } return api; },
      __disabledHook: function (flag) { state.disabled = !!flag; sync(); },
      __readonlyHook: function (flag) { state.readonly = !!flag; sync(); },
      destroy: function () { }
    };
    var returned = base.finalize(node, ctx, 'scorebar', box, impl, {});
    api = returned.__kuiControl;
    return returned;
  }
  define('scorebar', { category: 'control', title: '评分条', defaults: SCOREBAR_DEFAULTS, render: renderScorebar, api: function (el) { return el.__kuiControl; } });

  /* ============ 2. taginput：值 = 字符串数组 ============ */
  var TAGINPUT_DEFAULTS = { value: [], placeholder: '输入后回车添加', maxTags: 0, allowDuplicate: false, disabled: false, readonly: false };

  function renderTaginput(node, ctx) {
    var props = propsOf(node, TAGINPUT_DEFAULTS);
    var state = { tags: base.isArr(props.value) ? props.value.slice() : [], disabled: !!props.disabled, readonly: !!props.readonly };
    var api;
    var box = base.el('div', { 'class': 'kui-taginput' });
    var list = base.el('div', { 'class': 'kui-taginput__list' });
    var input = base.el('input', { 'class': 'kui-taginput__input', type: 'text', placeholder: props.placeholder });
    box.appendChild(list); box.appendChild(input);

    function emit(reason) { base.emitChange(box, ctx, node, state.tags.slice(), { reason: reason || 'input' }); }
    function render() {
      base.clear(list);
      base.each(state.tags, function (tag, idx) {
        var chip = base.el('span', { 'class': 'kui-taginput__tag' });
        chip.appendChild(base.el('span', { 'class': 'kui-taginput__text', text: tag }));
        var del = base.el('button', { 'class': 'kui-taginput__del', type: 'button', 'aria-label': '移除 ' + tag });
        del.textContent = '×';
        base.on(del, 'click', function () {
          if (state.disabled || state.readonly) { return; }
          state.tags.splice(idx, 1); render(); emit('remove');
        });
        chip.appendChild(del); list.appendChild(chip);
      });
      input.disabled = state.disabled || state.readonly;
      base.toggleClass(box, 'is-full', props.maxTags > 0 && state.tags.length >= props.maxTags);
    }
    function add(text) {
      var value = base.trim(String(text || ''));
      if (!value || state.disabled || state.readonly) { return false; }
      if (props.maxTags > 0 && state.tags.length >= props.maxTags) { return false; }
      if (!props.allowDuplicate && base.indexOf(state.tags, value) !== -1) { return false; }
      state.tags.push(value); render(); emit('add'); return true;
    }
    base.on(input, 'keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ',' || ev.key === '，') { ev.preventDefault(); if (add(input.value)) { input.value = ''; } }
      else if (ev.key === 'Backspace' && !input.value && state.tags.length) { state.tags.pop(); render(); emit('remove'); }
    });
    base.on(input, 'blur', function () { if (input.value) { add(input.value); input.value = ''; } base.emitBlur(box, ctx, node); });
    render();

    var impl = {
      getValue: function () { return state.tags.slice(); },
      setValue: function (v, opts) {
        state.tags = base.isArr(v) ? v.slice() : []; render();
        if (!opts || !opts.silent) { emit('set'); }
        return api;
      },
      getTags: function () { return state.tags.slice(); },
      validate: function () {
        if (node && node.required && !state.tags.length) { return { valid: false, message: '至少填写一个标签' }; }
        if (props.maxTags > 0 && state.tags.length > props.maxTags) { return { valid: false, message: '最多 ' + props.maxTags + ' 个标签' }; }
        return { valid: true, message: '' };
      },
      focus: function () { if (input.focus) { input.focus(); } return api; },
      __disabledHook: function (flag) { state.disabled = !!flag; render(); },
      __readonlyHook: function (flag) { state.readonly = !!flag; render(); },
      destroy: function () { }
    };
    var returned = base.finalize(node, ctx, 'taginput', box, impl, {});
    api = returned.__kuiControl;
    return returned;
  }
  define('taginput', { category: 'control', title: '标签输入器', defaults: TAGINPUT_DEFAULTS, render: renderTaginput, api: function (el) { return el.__kuiControl; } });

  /* 文件在 index.js 的 FILES 里时由 controls.init 统一注册；独立加载时这里补一次（registerOne 幂等） */
  if (controls.registerAll) { controls.registerAll(); }
})(window.KUI);
```

**第二步：写样式**，追加到 `src/styles/controls.css`（已被所有页面引入）：

```css
.kui-scorebar { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 240px; }
.kui-scorebar__track { position: relative; flex: 1 1 auto; height: 10px; border-radius: 999px; cursor: pointer;
  background: var(--kui-bg-2, #23202b); border: 1px solid var(--kui-border, #3a3444); }
.kui-scorebar__fill { height: 100%; width: 0; border-radius: 999px; transition: width .18s ease;
  background: linear-gradient(90deg, var(--kui-accent, #c8102e), var(--kui-accent-2, #d4af37)); }
.kui-scorebar__tick { min-width: 24px; text-align: center; font-size: 12px; cursor: pointer; color: var(--kui-text-3, #8b8494); }
.kui-scorebar__tick.is-active { color: var(--kui-accent-2, #d4af37); font-weight: 600; }
.kui-scorebar__value { font-weight: 700; color: var(--kui-text-1, #ece6ee); }
.kui-taginput { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 4px 6px;
  border: 1px solid var(--kui-border, #3a3444); border-radius: 8px; background: var(--kui-bg-1, #1a1721); }
.kui-taginput__tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 6px;
  font-size: 12px; color: var(--kui-accent-2, #d4af37); background: color-mix(in srgb, var(--kui-accent, #c8102e) 18%, transparent); }
.kui-taginput__del { border: 0; background: transparent; color: inherit; cursor: pointer; }
.kui-taginput__input { flex: 1 1 120px; min-width: 90px; border: 0; outline: 0; background: transparent; color: var(--kui-text-1, #ece6ee); }
```

**第三步：注册/加载（二选一）**

- 路线 A（推荐，零清单改动）：把 `'business.js'` 追加到 `src/components/controls/index.js:21-28` 的 `FILES` 数组末尾。同目录文件按序注入，全部执行完由 `controls.registerAll()` 统一注册（`control-base.js:1526-1538`；`registerOne` 对已存在类型跳过，`1509-1518`），刷新页面即生效。
- 路线 B（独立业务文件）：放 `src/components/business.js`，在 `config/kui-modules.json` 两个 profile 的 `"src/components/toast.js"`（app 第 27 行 / standalone 第 60 行）之后各加一行，再 `npm run build:all` 重生成 `src/core/kui-all.js`。位置必须晚于 `controls/index.js`、早于 `app-shell.js`。

```json
{
  "profiles": {
    "app": { "files": ["src/components/toast.js", "src/components/business.js", "src/components/handlers/menu.handlers.js"] },
    "standalone": { "files": ["src/components/toast.js", "src/components/business.js", "src/components/handlers/menu.handlers.js"] }
  }
}
```

（仅示位置：实际 `files` 以清单完整内容为准；`config/kui-modules.json:3` 注明改完运行 `npm run build:config`。）

**`registry.register` 字段契约**（`src/core/registry.js:31-70`）：

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `type` | string | 源码未设默认（调用方传入） | 是 | 元素类型名；非空字符串，否则只 `warn` 不抛错 |
| `category` | string | `'control'` | 否 | 分类：control / layout / feedback / data / shell |
| `title` | string | type 本身 | 否 | 展示名 |
| `defaults` | object\|null | `null` | 否 | 默认 props；框架渲染不自动合并，供二次封装读取 |
| `render(node, ctx)` | function | **必填** | 是 | 返回 DOM 元素；抛错被捕获并替换为 `kui-unknown` 占位 |
| `api(el, node, ctx)` | function\|null | `null` | 否 | 实例工厂，返回值 merge 进 `inst`，暴露为 `el.__kuiInstance` |
| `mounted(el, node, ctx, inst)` | function\|null | `null` | 否 | api 之后的挂载钩子 |
| `destroy(el, inst)` | function\|null | `null` | 否 | 销毁钩子，由调用方触发 |

同名重复注册会覆盖旧定义、`version++` 并派发 `onChange('register', type)`（`registry.js:54-70`、`141-148`）。

**第四步：在 form 里用**（`form.create` 的 `data[id]` 会先注入 `props.value`，见 `src/components/form.js:591-596`）：

```js
var form = KUI.form.create(document.getElementById('form-host'), {
  layout: { columns: 2, gap: 16, labelWidth: 96, labelPosition: 'left' },
  data: { score: 7, tags: ['时间线', '结界'] },
  nodes: [
    { id: 'score', type: 'scorebar', label: '满意度', required: true,
      props: { min: 0, max: 10, labels: ['', '差', '较轻', '', '一般', '', '良好', '', '优秀', '', '完美'] } },
    { id: 'tags', type: 'taginput', label: '影响范围', props: { maxTags: 5 } },
    { id: 'remark', type: 'textarea', label: '备注', span: 2, props: { rows: 3, maxLength: 200 } }
  ],
  onSubmit: function (data) { KUI.toast.success('已提交：评分 ' + data.score + '，标签 ' + data.tags.join('/')); }
});
form.getValue('score');                 // 7（优先走控件的 getValue，form.js:1107-1116）
form.setValue('tags', ['工单', 'SLA']); // 走控件的 setValue（form.js:1118-1142）
form.validate();                        // { valid, errors, data }；控件没写 validate 时用基座默认（required + node.rules）
```

**如何验证**：控制台 `KUI.registry.has('scorebar') && KUI.registry.has('taginput')` 为 `true`；点轨道、加标签后 `form.subscribe(fn)` 被调用，回调收到单个事件对象 `{ type, id, value, data }`（`form.js:38392-38420`）；`npm run audit` 的组件拆装检查全过；`node tools/check-compat.js` 无报错。

**注意事项**：type 用小写连字符、别撞内置 41 个类型名，业务控件建议加 `biz-` 前缀；根 class 必须是 `.kui-<type>`，状态用 `.is-focus/.is-disabled/.is-error`；`render` 里不发起请求（异步放 `mounted`）；每次值变化必须 `emitChange`；监听 `document/window` 要在 `impl.__after(api, returned)` 里 `base.addDestroyer(returned, off)`。

## 12.3 新增一个复合组件（以 dialog / toast 为范本）

**适用场景**：带遮罩、可开关、有事件、有实例 API 的跨页 UI（右侧抽屉、全局 Loading、命令面板）。范本：`src/components/dialog.js`（每弹窗一个 iframe）、`src/components/toast.js`（单例容器 + 多实例卡片）。

| 组成 | dialog 的做法 | 你要做什么 |
| --- | --- | --- |
| DOM 模板 | `createRecord` 建 layer/mask/wrap/iframe（`dialog.js:373-401`） | 静态容器单例，或首开懒建 |
| open/close | `open()` 返回 Promise，`close(id)` 幂等 | 对外 `open(options)` 返回实例，`close(id)` 幂等 |
| 事件 | 组件与 iframe 之间回传消息 | `KUI.bus.emit('drawer:open', { id, el })` |
| 单例/多实例 | 多实例，layer 递增 | 容器单例 + 面板多实例，文档写清 |
| 实例 API | `api = { el, id, close, update }`（`dialog.js:1088-1120`） | 挂根元素私有属性，`registry.api` 只做适配 |
| handlers | `src/components/handlers/dialog.handlers.js` | `KUI.handlers.registerMany('drawer', {…})` |

**完整实现**（`src/components/drawer.js`，已按对话框与 toast 的约定简化）：

```js
/*! KurumiUI - components/drawer.js（新建）：单例容器 + 多实例面板 */
(function (global) {
  'use strict';
  var KUI = global.KUI = global.KUI || {};
  var DEFAULTS = { id: '', title: '', placement: 'right', width: 360, maskClosable: true,
    closeOnEsc: true, content: '', nodes: null, className: '', onClose: null };
  var seq = 0, stack = [];

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) { n.className = cls; } if (text !== undefined) { n.textContent = String(text); } return n; }
  function assign(t) { for (var i = 1; i < arguments.length; i++) { var s = arguments[i]; for (var k in s) { if (s[k] !== undefined) { t[k] = s[k]; } } } return t; }
  function emit(name, detail) { if (KUI.bus && KUI.bus.emit) { KUI.bus.emit(name, detail); } }
  function ensureLayer(placement) {
    var layer = document.querySelector('.kui-drawer-layer[data-placement="' + placement + '"]');
    if (layer) { return layer; }
    layer = el('div', 'kui-drawer-layer');
    layer.setAttribute('data-placement', placement);
    document.body.appendChild(layer);
    return layer;
  }
  function find(id) { for (var i = 0; i < stack.length; i++) { if (stack[i].id === id) { return stack[i]; } } return null; }

  function open(options) {
    var cfg = assign({}, DEFAULTS, options || {});
    if (!cfg.id) { cfg.id = 'drawer-' + (++seq); }
    var exist = find(cfg.id);
    if (exist) { return exist; }
    var layer = ensureLayer(cfg.placement);
    var mask = el('div', 'kui-drawer-mask');
    var panel = el('div', 'kui-drawer kui-drawer--' + cfg.placement);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    if (cfg.className) { panel.className += ' ' + cfg.className; }
    if (cfg.width) { panel.style.width = typeof cfg.width === 'number' ? cfg.width + 'px' : String(cfg.width); }
    var head = el('div', 'kui-drawer__head');
    var titleEl = el('h3', 'kui-drawer__title', cfg.title);
    var closeBtn = el('button', 'kui-drawer__close', '×');
    closeBtn.type = 'button'; closeBtn.setAttribute('aria-label', '关闭');
    head.appendChild(titleEl); head.appendChild(closeBtn);
    var body = el('div', 'kui-drawer__body');
    if (cfg.nodes) { KUI.renderTree(cfg.nodes, body); } else { body.innerHTML = String(cfg.content || ''); }
    panel.appendChild(head); panel.appendChild(body);
    layer.appendChild(mask); layer.appendChild(panel);

    var inst = { id: cfg.id, el: panel, body: body, cfg: cfg, closed: false, close: closeSelf,
      setTitle: function (text) { titleEl.textContent = String(text || ''); return inst; } };
    panel.__kuiDrawer = inst;
    stack.push(inst);
    document.documentElement.classList.add('kui-drawer-open');

    function closeSelf(reason) {
      if (inst.closed) { return true; }
      if (cfg.onClose) { try { if (cfg.onClose({ id: inst.id, reason: reason || 'api' }) === false) { return false; } } catch (e) { /* ignore */ } }
      inst.closed = true;
      if (panel.parentNode) { panel.parentNode.removeChild(panel); }
      if (mask.parentNode) { mask.parentNode.removeChild(mask); }
      var i = stack.indexOf(inst);
      if (i !== -1) { stack.splice(i, 1); }
      if (!stack.length) { document.documentElement.classList.remove('kui-drawer-open'); }
      emit('drawer:close', { id: inst.id, reason: reason || 'api' });
      return true;
    }
    if (cfg.maskClosable) { KUI.on(mask, 'click', function () { closeSelf('mask'); }); }
    KUI.on(closeBtn, 'click', function () { closeSelf('close'); });
    if (cfg.closeOnEsc) {
      KUI.on(document, 'keydown', function (ev) {
        if (ev.key === 'Escape' && stack[stack.length - 1] === inst) { closeSelf('esc'); }
      });
    }
    emit('drawer:open', { id: inst.id, el: panel, options: cfg });
    return inst;
  }

  var api = {
    version: '1.0.0',        // 组件自身版本号（与框架 1.3.8 无关，不参与版本一致性校验）
    defaults: DEFAULTS,
    open: open,
    close: function (id) { var inst = find(id); return inst ? inst.close('api') : false; },
    closeAll: function () { var list = stack.slice(); for (var i = list.length - 1; i >= 0; i--) { list[i].close('closeAll'); } return list.length; },
    has: function (id) { return !!find(id); },
    count: function () { return stack.length; }
  };
  KUI.drawer = api;
  KUI.handlers.registerMany('drawer', {
    open: { fn: function (ctx, args) { return api.open(args); }, title: '打开抽屉' },
    close: function (ctx, args) { return api.close(args && args.id); },
    closeAll: function () { return api.closeAll(); }
  });
  KUI.actions.register('drawer.open', function (ctx, params) { return api.open(params); });
  KUI.actions.register('drawer.close', function (ctx, params) { return api.close(params && params.id); });

  if (!KUI.registry) { return; }
  KUI.registry.register('drawer', {
    category: 'shell',
    title: '抽屉',
    defaults: DEFAULTS,
    render: function (node, ctx) {
      var anchor = el('div', 'kui-drawer-anchor');
      anchor.hidden = true;
      var inst = api.open(KUI.utils.assign({}, node));
      anchor.__kuiDrawerApi = { el: anchor, inst: inst, close: function () { return inst.close('component'); } };
      return anchor;
    },
    api: function (anchor) { return anchor.__kuiDrawerApi || {}; }
  });
})(window.KUI);
```

样式要点（追加到 `src/styles/controls.css`）：`.kui-drawer-layer{position:fixed;inset:0;z-index:900;pointer-events:none}`、`.kui-drawer-layer>*{pointer-events:auto}`、`.kui-drawer-mask{position:absolute;inset:0;background:rgba(6,4,10,.58)}`、`.kui-drawer{position:absolute;top:0;bottom:0;display:flex;flex-direction:column;max-width:92vw;background:var(--kui-bg-1,#1a1721);border:1px solid var(--kui-border,#3a3444)}`、`.kui-drawer--right{right:0}`、`.kui-drawer__head{display:flex;align-items:center;padding:14px 16px;border-bottom:1px solid var(--kui-border,#3a3444)}`、`.kui-drawer__body{flex:1;overflow:auto;padding:16px}`、`html.kui-drawer-open,html.kui-drawer-open body{overflow:hidden}`。

**注册/加载**：`config/kui-modules.json` 两个 profile 加 `"src/components/drawer.js"`（`toast.js` 之后、`handlers/*.handlers.js` 之前），`npm run build:all`。

**验证**：`KUI.registry.has('drawer')`、`KUI.actions.has('drawer.open')`、`KUI.handlers.has('drawer.open')` 均为 `true`；`KUI.drawer.open({ title: '筛选', content: '<p>hi</p>', width: 320 })` 能开能关；用动作触发：`{ type:'button', props:{text:'筛选'}, on:{ click: { action:'drawer.open', params:{ title:'筛选' } } } }`。

**注意**：事件名统一 `组件:动作`；`close()` 幂等、`closeAll()` 逆序；实例挂根元素私有属性（`panel.__kuiDrawer` / `anchor.__kuiDrawerApi`），`registry.api` 只做取实例；有异步内容时关闭要撤销 `keydown` 等监听，否则重开双份监听。

## 12.4 新增主题（简版）

主题 token 表、`art` 装饰层、选择器机制见 [09-theme.md](09-theme.md)，这里只给最小步骤：① 在 `src/themes.json` 的 `themes` 数组追加 `{ "id", "name", "scheme", "tokens" }`，`tokens` 键统一 `--kui-*`；② `npm run build`（`themes.json` 打进 `config/bundle.js`，不重建不生效）；③ 验证 `?kuiTheme=<id>` 或 `KUI.theme.apply('<id>')`；运行期临时注册用 `KUI.theme.register({ id, name, scheme, tokens })`（`src/core/theme.js:227-236`），刷新即失效。

## 12.5 新增内置动作

**适用场景**：一句 JSON 就能触发的「动词」——导出、刷新、批量操作。注册 API `KUI.actions.register(name, fn)`，签名 `fn(ctx, params, ev)`（`src/core/kui.js:792-860`）。

**写在哪**：应用级动作写在 `src/app/bootstrap.js` 的 `registerActions`（133-223 行，随 app profile 加载，可用 `KUI.actions.has` 防重复）；页面也要用的业务动作放业务文件并同时加进两个 profile。

```js
KUI.actions.register('tickets.export', function (ctx, params, ev) {
  var rows = (params && params.rows) || [];
  if (!rows.length) { KUI.toast.warning('没有可导出的数据'); return null; }
  var text = rows.map(function (r) { return [r.id, r.title, r.status].join(','); }).join('\n');
  KUI.toast.success('已导出 ' + rows.length + ' 行');
  return { count: rows.length, text: text };     // 返回值原样交给 actions.run 调用方
});
```

`on` 里的三种写法（都走 `KUI.actions.run`，`kui.js:802-859`）：

```jsonc
{ "type": "button", "props": { "text": "导出 CSV" },
  "on": { "click": { "action": "tickets.export", "params": { "rows": [] } } } }
```

```js
{ on: { click: 'tickets.export' } }                                   // 字符串动作名，无入参
{ on: { click: [{ action: 'tickets.export' }, { action: 'toast.success' }] } } // 顺序执行多个动作
```

**异步与错误**：返回 Promise 时框架自动挂 `.catch` 打 `KUI.error('动作异常 [名字]:', e)`（`kui.js:872-877`）；同步抛错被捕获为 `动作执行异常 [名字]:`（`878-881`）。动作找不到只是 `warnOnce('action-missing:…')`，页面不中断。

## 12.6 新增业务函数

动作是「配置里的触发器」，业务函数是「组件能力实现」，用 `scope.name` 命名空间。注册 `KUI.handlers.register(scope, name, fn, meta)`（`src/core/handlers.js:63-82`）：

| 参数 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `scope` | string | `'app'`（空/纯点号时归一） | 否 | 命名空间；内置 7 个：app、dialog、form、menu、menunav、tabs、toast |
| `name` | string | 源码未设默认 | 是 | 函数名，非法时 `warn` 并返回 `null` |
| `fn` | function | — | 是 | `(ctx, args, info) => any`，`info = { KUI, scope, name, full, meta }` |
| `meta` | object | `{ title:'', desc:'', args:[], returns:'', example:'' }` | 否 | 文档元信息，`args` 可写 `params` 别名 |

批量注册 `KUI.handlers.registerMany(scope, map, meta)`（`handlers.js:87-106`），`map` 值可为函数或 `{ fn, title, … }`：

```js
KUI.handlers.registerMany('tickets', {
  create: { fn: function (ctx, args) { return KUI.dialog.form({ title: '新建工单', nodes: [{ id: 'title', type: 'input', label: '标题', required: true }] }); }, title: '新建工单' },
  close: function (ctx, args) { return args && args.id ? { ok: true, id: args.id } : { ok: false, error: '缺少 id' }; }
});
// 触发：on.click = 'tickets.create'（字符串先查动作表，查不到降级业务函数，kui.js:862-871）
//      或 { fn: 'tickets.create', args: {} }（kui.js:829-835）
```

**约定**：scope 用业务域（`tickets`、`report`），别复用内置 7 个；同名后注册覆盖先注册（`handlers.js:78`）；异步直接 `return promise`，拒绝由 `invoke` 记 `KUI.error('业务函数异常 [full]:', e)`；`ctx` 含 `KUI/type/node/el/form/app/data/emit/action` 等字段（见 [11-api-messaging.md](11-api-messaging.md)）。

## 12.7 新增页面

**文件清单**：`pages/portal.html`（新页面）+ `config/app.json`（菜单/标签/首页）。骨架沿用 `pages/profile.html`：`theme-boot.js` 必须最先加载（防 FOUC），然后 4 个 CSS，最后 `kui-all.js`（standalone profile）与页面脚本。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <script src="../src/core/theme-boot.js"></script>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>业务门户 · 内部管理台</title>
  <link rel="stylesheet" href="../src/styles/base.css" />
  <link rel="stylesheet" href="../src/styles/controls.css" />
  <link rel="stylesheet" href="../src/styles/components.css" />
  <link rel="stylesheet" href="../src/styles/tooltip.css" />
  <style>
    .page { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .page__title { margin: 0; font-size: 16px; color: var(--kui-text-1, #ece6ee); }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
    .card { padding: 12px; border: 1px solid var(--kui-border, #3a3444); border-radius: 10px; background: var(--kui-bg-1, #1a1721); }
    .card__num { font-size: 22px; font-weight: 700; color: var(--kui-accent-2, #d4af37); }
    .card__label { font-size: 12px; color: var(--kui-text-2, #b9b1c4); }
  </style>
</head>
<body>
  <div class="page">
    <h1 class="page__title">业务门户</h1>
    <div class="cards" id="cards"></div>
    <div id="board"></div>
  </div>
  <script src="../src/core/kui-all.js" data-kui-profile="standalone"></script>
  <script>
    (function () {
      'use strict';
      var KUI = window.KUI || {}, frame = KUI.frame || null;
      function ready(fn) {                         // 在标签页里等 frame 就绪，单独打开直接执行
        if (frame && typeof frame.ready === 'function') { try { frame.ready(fn); return; } catch (e) { /* ignore */ } }
        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', fn); } else { fn(); }
      }
      ready(function () {
        var cards = document.getElementById('cards');
        var STATS = [{ label: '今日工单', num: 42 }, { label: '待处理', num: 7 }, { label: 'SLA 达标率', num: '98%' }];
        STATS.forEach(function (s) {
          var card = document.createElement('div'); card.className = 'card';
          card.innerHTML = '<div class="card__num">' + s.num + '</div><div class="card__label">' + s.label + '</div>';
          cards.appendChild(card);
        });
        KUI.renderTree([                            // 表格 + 按钮，动作由 drawer 组件提供（见 12.3）
          { type: 'table', props: { striped: true, hoverable: true,
            columns: [{ key: 'id', title: '编号', width: 90 }, { key: 'title', title: '标题' }, { key: 'status', title: '状态', width: 100 }],
            data: [{ id: 'T-1001', title: '登录页样式错位', status: '处理中' }, { id: 'T-1002', title: '导出超时', status: '待分派' }] } },
          { type: 'button', props: { text: '打开筛选抽屉', variant: 'primary' },
            on: { click: { action: 'drawer.open', params: { title: '筛选条件', width: 320, content: '<p>筛选表单</p>' } } } }
        ], document.getElementById('board'));
        if (frame && typeof frame.setTitle === 'function') { try { frame.setTitle('业务门户'); } catch (e) { /* ignore */ } }
      });
    })();
  </script>
</body>
</html>
```

**接进菜单 / 标签页 / 面包屑**：`config/app.json` 里改三处——在 `menu.props.items` 的某个 `group.children` 下加菜单项；`tabs.props.initial` 决定默认打开的标签；面包屑不用手写，`app-shell` 用 `findMenuPath(menu.props.items, item.id)` 生成路径并调 `menunav.setBreadcrumb`（`src/components/app-shell.js:300-330`），标签页无对应菜单项时退化为「应用名 + 标签标题」。

```json
{
  "type": "item",
  "id": "portal",
  "label": "业务门户",
  "icon": "grid",
  "badge": "新",
  "badgeType": "success",
  "target": { "tab": { "id": "portal", "title": "业务门户", "url": "pages/portal.html", "icon": "grid" } }
}
```

```json
{ "initial": [ { "id": "portal", "title": "业务门户", "url": "pages/portal.html", "icon": "grid" } ] }
```

`app.home` 与 `target.tab.url` 一律相对项目根（`pages/portal.html`），不要写相对 `pages/` 的 `portal.html`。

**验证**：直接打开 `http://127.0.0.1:8080/pages/portal.html` 不报错（`frame` 空值判断要保留）；主界面点菜单新开/激活标签，标题取 `target.tab.title`，面包屑显示菜单路径；`?kui_debug=1` 看诊断面板里标签页与 iframe 消息成对出现。

## 12.8 新增 / 修改 profile

profile 就是 `config/kui-modules.json` 里的一组 `files`，装载器按它逐行注入 `<script>`（`tools/build-all.js:57-101`）。

```json
{
  "profiles": {
    "tool": {
      "desc": "离线工具页：表单 + 弹窗 + 提醒，不含菜单/导航/标签",
      "files": [
        "config/bundle.js", "src/core/kui.js", "src/core/tooltip.js", "src/core/diag.js",
        "src/core/icons.js", "src/core/registry.js", "src/core/config.js", "src/core/theme.js",
        "src/core/theme-art.js", "src/core/handlers.js", "src/core/dom-enhance.js",
        "src/components/controls/index.js", "src/components/form.js", "src/components/handlers/form.handlers.js",
        "src/components/dialog.js", "src/components/handlers/dialog.handlers.js",
        "src/components/toast.js", "src/components/handlers/toast.handlers.js"
      ]
    }
  }
}
```

- 改完 `npm run build:all`（只重生成 `src/core/kui-all.js`）；同时改了 `config/*.json` 才需要 `npm run build`；
- 页面写 `<script src="../src/core/kui-all.js" data-kui-profile="tool"></script>`；
- **profile 名写错不报错**：取不到 bucket 时静默回退 `standalone`（`tools/build-all.js:73`），「模块怎么多了/少了」先查这一行；
- 文件不存在会在构建期直接抛 `kui-modules.json 引用了不存在的文件: <路径>`（`tools/build-all.js:30-35`）；不写 `data-kui-profile` 默认 `standalone`（`build-all.js:72`）；
- 验证注入顺序：页面源码看 `document.write` 出来的 `<script>` 顺序，或 `?kui_debug=1` 看报错先后。

## 12.9 覆盖内置实现

同名 type 后注册者胜（`registry.js:54-70`），你的文件在目标控件之后加载即可整体替换：

```js
var prev = KUI.registry.get('alert');       // 留一份旧定义便于回退
KUI.registry.register('alert', {
  category: 'feedback',
  title: '带关闭按钮的提示条',
  defaults: (prev && prev.defaults) || {},
  render: function (node, ctx) { var el = document.createElement('div'); /* 你的实现 */ return el; },
  api: function (el) { return el.__kuiControl || {}; }
});
var off = KUI.registry.onChange(function (type, kind) {   // kind: register / unregister / reset
  if (kind === 'register' && type === 'alert') { KUI.log('alert 已被替换，重建列表'); }
});
```

风险与建议：**契约**——form 依赖 `getValue/setValue/validate/setDisabled`，至少实现这四个，否则表单取值校验直接失效；**升级**——覆盖层单独成文件并注明「基于 v1.3.8」，升级时对照 changelog；**顺序**——放进 `kui-modules.json` 的明确位置，不要靠 HTML 临时 `<script>`；**清理**——覆盖实现显式 `destroy()`，并用 `onChange` 记录版本。

## 12.10 扩展 dialog-frame（自定义弹窗页）

`KUI.dialog` 的每个弹窗是一个 iframe，默认页 `src/frame/dialog-frame.html`。覆盖方式：`app.json` 顶层加 `dialog.frameUrl`。解析优先级：① `KUI.config.get('dialog.frameUrl')` → ② 从 `dialog.js` 的 script.src 推项目根 + `src/frame/dialog-frame.html` → ③ 相对路径兜底（`src/components/dialog.js:187-223`）。注意 ① 的值直接作为 iframe 的 src，相对路径以**调用方页面**为基准：`index.html` 写 `src/frame/my-dialog.html`，`pages/*.html` 要写 `../src/frame/my-dialog.html`。

```json
{ "dialog": { "frameUrl": "src/frame/my-dialog.html" } }
```

协议（信封 `{ __kui: true, type, requestId, payload }`，`targetOrigin:'*'`，两端校验 `event.source`，`dialog.js:695-794`）：父→子 `dialog:init`（`{ dialogId, method, config, theme }`，`dialog.js:361-371`）、`dialog:update`、`dialog:close`、`theme:apply`、`dialog:action:result`、`dialog:form-error`；子→父 `dialog:ready`（首帧必发，否则父级每 600ms 重发 init，超 5 次熔断为空白）、`dialog:resolve`、`dialog:cancel`、`dialog:resize`、`dialog:toast`、`dialog:open`、`dialog:action`、`dialog:form-submit`。

最小自定义弹窗页（放 `src/frame/my-dialog.html`，与默认页同目录）：

```html
<!DOCTYPE html>
<html lang="zh-CN"><head>
  <script src="../core/theme-boot.js"></script><meta charset="utf-8" />
  <link rel="stylesheet" href="../styles/base.css" /><link rel="stylesheet" href="../styles/controls.css" />
  <title>自定义弹窗</title>
</head><body>
  <h2 data-dialog-title></h2><div data-dialog-body></div>
  <p><button type="button" data-cancel>取消</button> <button type="button" data-ok>确定</button></p>
  <script src="../core/kui.js"></script><script src="../core/icons.js"></script>
  <script src="../core/registry.js"></script><script src="../core/theme.js"></script>
  <script src="../core/dom-enhance.js"></script><script src="../components/controls/index.js"></script>
  <script>
    (function () {
      'use strict';
      var parentWin = window.parent;
      function post(type, payload) { parentWin.postMessage({ __kui: true, type: type, requestId: '', payload: payload || {} }, '*'); }
      window.addEventListener('message', function (ev) {
        if (ev.source !== parentWin) { return; }                 // 只信任父窗口
        var data = ev.data;
        if (!data || data.__kui !== true) { return; }
        if (data.type === 'dialog:init') {
          var cfg = data.payload.config || {};
          document.querySelector('[data-dialog-title]').textContent = cfg.title || '';
          document.querySelector('[data-dialog-body]').textContent = cfg.message || '';
          var theme = data.payload.theme;
          if (theme && theme.tokens && KUI.theme.applyTokens) { KUI.theme.applyTokens(theme.tokens); }
          post('dialog:ready', { id: data.payload.dialogId });   // 必须回 ready
        }
      });
      document.querySelector('[data-ok]').onclick = function () { post('dialog:resolve', { value: true }); };
      document.querySelector('[data-cancel]').onclick = function () { post('dialog:cancel', {}); };
      post('dialog:ready', {});                                   // 先打一次，父级收到后会重发 init
    })();
  </script>
</body></html>
```

**验证**：主界面点任意 `KUI.dialog.confirm(...)` 应弹出你的页面，点「确定」后 Promise `resolve(true)`；`?kui_debug=1` 能看到 `dialog:init` / `dialog:ready` 成对出现。

## 12.11 把第三方库封装成 KUI 控件

原则：库只加载一次、实例挂在控件里、销毁必须可逆。以假想库 `MiniChart`（`MiniChart.create(el, opts)` / `chart.destroy()`）为例：

```js
/*! KurumiUI - controls/third-party.js（新建）：type = 'chart' */
(function (global) {
  'use strict';
  var KUI = global.KUI = global.KUI || {};
  var controls = KUI.controls = KUI.controls || {};
  var base = controls.base;
  if (!base) { return; }
  var define = controls.define;
  var CHART_DEFAULTS = { data: [], height: 220, option: null, loading: false };
  var libPromise = null;

  function loadLib() {                                  // 同版本只加载一次，失败清缓存可重试
    if (global.MiniChart) { return Promise.resolve(global.MiniChart); }
    if (libPromise) { return libPromise; }
    libPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = '../vendor/mini-chart.min.js';            // 相对页面根的真实路径
      s.async = true;
      s.onload = function () { resolve(global.MiniChart); };
      s.onerror = function () { libPromise = null; reject(new Error('MiniChart 加载失败')); };
      (document.head || document.documentElement).appendChild(s);
    });
    return libPromise;
  }

  function renderChart(node, ctx) {
    var props = base.merge({}, CHART_DEFAULTS, base.getProps(node));
    var box = base.el('div', { 'class': 'kui-chart', style: { height: props.height + 'px' } });
    var state = { instance: null, data: props.data || [] };
    var api;
    function mount() {
      if (state.instance || !global.MiniChart || !box.isConnected) { return; }
      state.instance = global.MiniChart.create(box, { data: state.data, option: props.option });
    }
    loadLib().then(mount)['catch'](function (e) { KUI.warn('chart: ' + e.message); box.textContent = '图表库加载失败'; });
    var impl = {
      getValue: function () { return state.data; },
      setValue: function (v, opts) {
        state.data = base.isArr(v) ? v : [];
        if (state.instance && state.instance.setData) { state.instance.setData(state.data); }
        if (!opts || !opts.silent) { base.emitChange(box, ctx, node, state.data, { reason: 'set' }); }
        return api;
      },
      destroy: function () {
        if (state.instance && state.instance.destroy) { try { state.instance.destroy(); } catch (e) { /* ignore */ } }
        state.instance = null;
      }
    };
    var returned = base.finalize(node, ctx, 'chart', box, impl, { selfWrap: false });
    api = returned.__kuiControl;
    base.addDestroyer(returned, function () { if (api) { api.destroy(); } });
    return returned;
  }
  define('chart', { category: 'data', title: '图表', defaults: CHART_DEFAULTS, render: renderChart, api: function (el) { return el.__kuiControl; } });
  if (controls.registerAll) { controls.registerAll(); }
})(window.KUI);
```

| 关注点 | 正确做法 | 常见错误 |
| --- | --- | --- |
| 加载 | 惰性 + `libPromise` 复用 + 失败清缓存 | 每个控件插一次 `<script>` |
| 隔离 | 独立容器 + `.kui-chart` 前缀样式，参数从 props 进 | 库改全局 body 样式 |
| 销毁 | `impl.destroy` 调库 `destroy` + `base.addDestroyer` 双保险 | 只移 DOM，切标签页越积越多 |
| 路径 | 第三方文件放 `vendor/`，相对页面根 | 绝对 `/vendor/...`，部署到子目录 404 |

## 12.12 检查表、命名规范、版本化与调试

| # | 检查项 | 怎么查 |
| --- | --- | --- |
| 1 | 新 type 已注册且不撞内置名 | `KUI.registry.has('xxx')` / `KUI.registry.list()` |
| 2 | 新动作/业务函数已注册 | `KUI.actions.has('a.b')` / `KUI.handlers.has('scope.fn')` |
| 3 | 文件已进清单（或 `controls/index.js` 的 FILES） | 构建后 `kui-all.js` 能搜到文件名 |
| 4 | 页面/样式/资源路径与 profile 深度一致 | 直接打开 `pages/xxx.html` 无 404 |
| 5 | ES5 兼容 | `node tools/check-compat.js` |
| 6 | 改动后一致性 | `npm run audit`、`npm run verify` |
| 7 | 数量口径 | 截至 v1.3.8：41 个注册类型、19 个表单控件、28 个动作、61 个业务函数 |
| 8 | 销毁路径 | 关页/关表单后无残留监听与节点 |
| 9 | 主题跟随 | 颜色全部 `var(--kui-*, fallback)` |
| 10 | 无控制台 error | `?kui_debug=1` 面板无异常栈 |

**命名规范**：type 小写连字符（`scorebar`、`biz-timeline`）；动作 `域.动词`，不占 `dialog.*/toast.*/theme.*/tab.*`；业务函数 scope 用业务域、name 驼峰；CSS 只加 class 不加 ID，根 class 必须 `.kui-<type>`；事件 `组件:事件名`。

**版本化**：扩展包自带 `version` 并在文件头注明「基于 KurumiUI v1.3.8」；覆盖内置时保留 `prev` 与 `onChange` 监听；升级前跑 `npm run audit`、`npm run verify`；排障见 [15-troubleshooting.md](15-troubleshooting.md)。

**调试**：

```js
KUI.info();                    // { name, version, controls, themes, env }
KUI.registry.list();           // 全部类型（含 category/hasApi/hasMounted）
KUI.registry.version();        // 热插拔后 +1
KUI.actions.list();            // 内置 28 个 + 你的
KUI.handlers.list('tickets');  // 只看某个 scope
KUI.diag.lines();              // ?kui_debug=1 后才可用
```

`?kui_debug=1`（或 `localStorage['kui-debug']='1'`）打开右下角诊断面板，记录错误、长任务、焦点与 `dialog:`/`theme:`/`frame:` 前缀的 postMessage（`src/core/diag.js:235-252`）。

## 常见错误与排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 出现 `未注册的元素类型 "xxx"` 占位 | type 未注册或注册文件没加载 | `KUI.registry.has('xxx')`；查 `kui-all.js` 与加载顺序 |
| 控件在 form 里没有 label / 不校验 | 没走 `base.finalize` 或自建 DOM | 用 `finalize` 收尾，实现 `getValue/validate` |
| 改了控件页面没变化 | 文件在 FILES 里但浏览器缓存旧文件 | 硬刷新；或确认 `kui-all.js` 已重建 |
| 动作点了没反应 | 动作名不在表里（只有 warnOnce） | 搜「未注册的动作」；确认注册早于点击 |
| 业务函数找不到 | scope/name 拼错，或 profile 没加载业务文件 | `KUI.handlers.list(scope)`；standalone 也要加清单 |
| 新 profile 模块不对 | `data-kui-profile` 写错 → 静默回退 standalone | 核对属性值与 `profiles` 键名 |
| 新页面菜单点开空白 | `target.tab.url` 写相对 `pages/` 的路径 | 相对项目根：`pages/xxx.html` |
| 自定义弹窗一直空白 | 弹窗页没回 `dialog:ready` | 首帧必须 `post('dialog:ready', {})` |
| 切主题后自建控件不跟随 | 颜色写死 | 全部改用 `var(--kui-accent, …)` |
| 切标签页后内存上涨 | 监听/定时器/第三方实例未销毁 | `destroy`、`addDestroyer` 里清理 |

## 本章自检

```powershell
node tools/check-compat.js          # ES5 兼容性，无输出即通过
npm run audit                       # 一致性 17 项 + 组件拆装 17 项
npm run verify                      # 冒烟 94 项 + 2 个装配验证

# 运行时确认新类型/动作/业务函数都在表里
node -e "var s=require('./test/dom-stub.js'),e=s.createEnvironment({root:process.cwd(),fileMode:true}),lk=require('./test/load-kui.js');lk.loadKui(e,{});var K=e.window.KUI;console.log('types',K.registry.count(),'actions',K.actions.list().length,'handlers',K.handlers.count());"

# 构建产物里包含新文件
Select-String -Path src/core/kui-all.js -Pattern 'business.js|drawer.js'
```

预期：兼容性检查无报错；审计全过；第三行输出 `types 40 actions 28 handlers 61`（新增后会相应变大）；第四行能搜到新文件名。

## 参考源码

- `src/core/registry.js:31-49`（normalize 默认值）、`54-70`（register/覆盖）、`141-148`（onChange）
- `src/core/kui.js:792-860`（actions 注册与 run 分支）、`862-881`（invoke 与错误）、`1017-1090`（renderNode）、`1112-1155`（renderTree/mount/mountAll）
- `src/core/handlers.js:37-54`（scope/meta 归一）、`63-82`（register）、`87-106`（registerMany）、`109-150`（resolve/invoke）
- `src/components/controls/control-base.js:888-935`（规则与 makeApi）、`952-1010`（finalize）、`1509-1538`（registerOne/registerAll）
- `src/components/controls/index.js:21-28`（FILES）、`57-74`（init 幂等）、`183-260`（注入与 bootstrap）
- `src/components/form.js:557-560`（control:change 订阅）、`591-596`（data 注入 value）、`1107-1142`（取值/赋值）、`1186-1261`（校验与错误回填）
- `src/components/dialog.js:187-223`（frameUrl 解析）、`361-371`（dialog:init）、`695-794`（消息协议）、`1088-1120`（组件注册与实例 API）
- `src/components/toast.js:456-494`（静态 API）、`496-531`（组件注册与 `__kuiToastApi`）
- `config/kui-modules.json:3`（改完 `npm run build:config`）、`8-36`（app）、`41-68`（standalone）
- `tools/build-all.js:30-35`（缺文件失败）、`57-101`（生成与 profile 回退）
- `src/app/bootstrap.js:179-258`（应用级动作）、`747-840`（启动链路）、`841-851`（自动启动开关）
- `src/core/theme.js:227-236`（register）、`297-359`（apply）

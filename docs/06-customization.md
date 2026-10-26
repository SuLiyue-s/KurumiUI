# KurumiUI 定制指南

> 适用版本：v1.0.0 · 基线：`docs/00-contract.md`、`docs/02-config-reference.md`
>
> 这份文档回答四个问题：**怎么把框架拆开只用一部分**、**怎么按自己的业务组装布局**、**怎么加新控件/组件/主题/页面**、**哪些 UI 需求真的只改 JSON 就能完成**。

---

## 1. 目录结构

```
D:\nodejs\ui框架\
├─ index.html                     主应用入口：只放挂载点 + 脚本，UI 全在 config/app.json
├─ config\
│  ├─ app.json                    主应用唯一配置源（品牌/主题/布局/菜单/导航/标签/设置弹窗/文案覆盖）
│  ├─ text.json                   全文案字典（KUI.i18n 的数据源）
│  ├─ bundle.js                   构建产物：file:// 打开时的配置兜底
│  └─ demos\                      组件演示数据（可被 standalone 页直接渲染）
│     ├─ menu.json  menunav.json  tabs.json
│     ├─ dialog.json  toast.json
│     ├─ form.json  controls.json
│     ├─ theme.json  actions.json
├─ src\
│  ├─ core\                       kui.js / icons.js / registry.js / config.js / theme.js / theme-art.js
│  ├─ styles\                     base.css / controls.css / components.css
│  ├─ components\
│  │  ├─ controls\                33 种控件 + form 控件封装（index.js 一行引入全部）
│  │  ├─ menu.js  menunav.js  tabs.js  dialog.js  toast.js  form.js  app-shell.js
│  │  └─ app\bootstrap.js         自动启动、动作注册、启动层
│  └─ frame\                      kui-frame.js（业务页 SDK）+ dialog-frame.html/js（弹窗 iframe）
├─ standalone\                    10 个独立渲染页：menu / menunav / tabs / dialog / toast / form / controls / theme / no-shell / handlers
├─ pages\                         7 个 iframe 业务页：home / profile / form / editor / dialogs / notify / theme
├─ docs\                          契约与文档
├─ tools\                         build-config / check-assets / check-compat / screenshot / smoke
└─ server.js                      零依赖静态服务器（npm start）
```

写域约定：`config/**`、`standalone/**`、`pages/**`、`docs/02`、`docs/06` 是「配置与示例」写域；`src/**` 是框架实现写域。改组件实现请改 `src/`，改内容与结构请改 `config/`。

---

## 2. 三条定制路线

| 路线 | 适合 | 改动位置 | 是否需要写 JS |
| --- | --- | --- | --- |
| A. 只改 JSON | 换文案、加菜单、换主题、调布局、改示例数据 | `config/**`、`src/themes.json` | 不需要 |
| B. 拆组件单用 | 只想要菜单/标签页/表单/弹窗中的某一个 | 新建自己的 HTML，按 §4 引资源 | 少量 |
| C. 写扩展 | 新控件、新组件、新动作、新业务页 | 自己的 JS 文件 + `KUI.registry` / `KUI.actions` | 需要 |

先尽量走 A；A 不够再走 B；只有 B 也表达不了时才走 C。

---

## 3. 常见 UI 需求：只改 JSON

| 需求 | 改哪个文件 | 改哪个字段 |
| --- | --- | --- |
| 改应用名、副标题、版权 | `config/app.json` | `app.title` / `app.subtitle` / `app.copyright` |
| 改浏览器标题 | `config/app.json` | `app.documentTitle` |
| 改默认主题 | `config/app.json` | `theme.default` |
| 增删主题选择器里的可见主题 | `config/app.json` | `theme.visible` 数组 |
| 改主题选择器文案/列数 | `config/app.json` | `theme.picker.*` |
| 改菜单宽度/折叠宽度 | `config/app.json` | `layout.menu.width` / `collapsedWidth` |
| 改顶栏高度、标签栏高度 | `config/app.json` | `layout.header.height` / `tabbarHeight` |
| 加一级菜单 | `config/app.json` | `menu.props.items` 里加 `{ "type": "item", … }` |
| 加分组 | `config/app.json` | `menu.props.items` 里加 `{ "type": "group", "children": [] }` |
| 加二级菜单 | `config/app.json` | 给 `item` 加 `children`（不要写 `submenu`） |
| 菜单加徽标 | `config/app.json` | `item.badge` + `item.badgeType` |
| 禁用某菜单项 | `config/app.json` | `item.disabled: true` |
| 改菜单默认选中 | `config/app.json` | `menu.props.defaultActive` |
| 菜单项直接触发动作（不跳页） | `config/app.json` | `target: { "action": { "action": "theme.picker" } }` |
| 加顶部按钮 | `config/app.json` | `menunav.props.actions` 加 `{ id, icon, label, action }` |
| 换面包屑分隔符/上限 | `config/app.json` | `menunav.props.breadcrumb.separator` / `max` |
| 打开/关闭前进后退、刷新、全屏 | `config/app.json` | `menunav.props.showHistory` / `showRefresh` / `showFullscreen` |
| 改启动时额外打开的标签 | `config/app.json` | `tabs.props.initial` |
| 改固定首页 | `config/app.json` | `tabs.props.home` 与 `app.home` |
| 改标签上限/是否可关闭 | `config/app.json` | `tabs.props.maxTabs` / `closable` |
| 改设置弹窗内容 | `config/app.json` | `dialogs.settings.nodes` / `data` / `layout` |
| 改任意界面文案 | `config/text.json` 或 `app.json` 的 `text` | 对应键 |
| 换菜单/按钮/页面图标 | JSON 的 `icon` 字段 | 名字必须来自 `docs/02` §6.1 的 85 个 |
| 改主题色板 | `src/themes.json` | `themes[].tokens.*` |
| 加一套主题 | `src/themes.json` + `config/app.json` | 新增 `themes[]` 项 + 加入 `theme.visible` |
| 改演示数据 | `config/demos/*.json` | 对应文件 |
| 改表单校验文案 | `config/demos/form.json` 的 `rules[].message` 或 `text.json` | — |
| 改控件默认占位 | `config/text.json` | `input.placeholder` 等 |

> 判断标准：**如果改动不需要新的渲染逻辑、不需要新的交互行为，就一定能只改 JSON。**

---

## 4. 拆解：单组件独立使用

框架里每个组件都能脱离外壳单独渲染。`standalone/` 下 10 个页面就是官方示例，可以直接复制其中一个作为起点（其中 9 个是契约 §14 的系统页，`handlers.html` 为后增的业务函数演示页）。

### 4.1 最小 HTML 模板

以 `controls` 为例（其余组件同理，只换 CSS/JS 清单与演示数据）：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>控件陈列 · KurumiUI</title>
  <link rel="stylesheet" href="../src/styles/base.css">
  <link rel="stylesheet" href="../src/styles/controls.css">
  <link rel="stylesheet" href="../src/styles/components.css">
</head>
<body data-kui-auto="false">
  <div id="host"></div>

  <script src="../config/bundle.js"></script>
  <script src="../src/core/kui.js"></script>
  <script src="../src/core/icons.js"></script>
  <script src="../src/core/config.js"></script>
  <script src="../src/core/theme.js"></script>
  <script src="../src/core/theme-art.js"></script>
  <script src="../src/components/controls/index.js"></script>
  <script src="../src/components/form.js"></script>
  <script>
  (function () {
    'use strict';
    var KUI = window.KUI;
    KUI.config.load('themes').then(function (data) {
      KUI.theme.init(data, { fallbackId: 'kurumi', storageKey: 'my-demo-theme', persist: true, silent: true });
      return KUI.config.load('demos/controls');
    }).then(function (data) {
      KUI.renderNode({ type: 'form', props: { nodes: data.groups[0].nodes } }, document.getElementById('host'));
    });
  })();
  </script>
</body>
</html>
```

关键点：

- `body data-kui-auto="false"`：**不要**让 bootstrap 自动接管页面（bootstrap 只用于完整主应用）。
- `config/bundle.js` 必须在 core 之前：`file://` 双击打开时靠它提供配置兜底。
- `controls/index.js` 一行会按顺序注入并注册全部控件；它用同步 `document.write`，**不能加 `defer` / `async`**。
- `src/components/form.js` 必须在 `controls/index.js` 之后、首次渲染之前引入，否则 `form` 类型只会渲染空壳并 warn `no-form`。
- 主题初始化可省：不初始化就用 `base.css` 里的默认 token，不报错。

### 4.2 资源清单

| 你要用的东西 | 必须引入 |
| --- | --- |
| 任意组件 | `base.css` + 对应组件 js |
| 控件 | `base.css` + `controls.css` + `src/components/controls/index.js` |
| 表单 | 控件清单 + `src/components/form.js` |
| 弹窗 | `base.css` + `components.css` + `src/components/dialog.js`（`src/frame/dialog-frame.html` 由 dialog.js 自动推导） |
| toast | `base.css` + `components.css` + `src/components/toast.js` |
| 菜单 / 导航 / 标签页 | `base.css` + `components.css` + 对应 js（`menu.js` / `menunav.js` / `tabs.js`） |
| 完整外壳 | core + 全部组件 + `app-shell.js` + `bootstrap.js`（即 `index.html` 的清单） |

core 的固定顺序：`kui.js` → `icons.js` → `registry.js` → `config.js` → `theme.js` → `theme-art.js`。

### 4.3 官方 standalone 页对照

| 页面 | 演示什么 | 建议从它抄什么 |
| --- | --- | --- |
| `standalone/menu.html` | 菜单树、分组、二级、徽标、折叠 | 菜单配置与实例 API 调用 |
| `standalone/menunav.html` | 面包屑、动作按钮组 | 导航 JSON 驱动重渲染 |
| `standalone/tabs.html` | 多标签、保活、右键菜单 | 标签实例 API 与事件 |
| `standalone/dialog.html` | alert/confirm/prompt/form/custom、嵌套 | 弹窗 Promise 返回值处理 |
| `standalone/toast.html` | 四类型 toast + notification、常驻 | 提醒队列与位置 |
| `standalone/form.html` | 22+ 控件、deps 联动、validate | `KUI.form.create` / JSON 整节点挂载 |
| `standalone/controls.html` | 33 种控件陈列 | field 包裹与 registry 类型清单 |
| `standalone/theme.html` | 6 套主题卡片、token 色板、装饰预览 | 主题切换与 `KUI.themeArt.preview` |
| `standalone/no-shell.html` | 不用外壳，手拼菜单+导航+标签 | 自定义布局拼装 |
| `standalone/handlers.html` | JSON 只存函数名 + 入参（`{fn,args}`） | 业务函数层 `KUI.handlers` 用法 |

每个 standalone 页顶部都有主题下拉与九页互链导航；它们也是「单组件最小接入」的可运行样本。

### 4.4 被 iframe 嵌入时的行为（任务 8 新增）

主应用的标签页用 `<iframe src="standalone/xxx.html">` 打开这些页面时，外层 `app-shell` 已经有菜单、导航、标签栏与主题控制，内层再重复渲染就是「双壳」。所有 standalone 页统一通过 `standalone/embedded.js` 处理：

```html
<!-- 放在 config/bundle.js 之前，body 末尾 -->
<script src="embedded.js"></script>
<script src="../config/bundle.js"></script>
```

`embedded.js` 判断 `window.parent !== window`（跨域异常也按嵌入处理），命中后：

1. 给 `<html>` 加 `data-kui-embedded="true"`、给 `<body>` 加 `is-embedded`；
2. 隐藏页内的 `.demo-nav` 互链导航与 `#kuiThemeSwitch` 主题下拉（主题由外层统一下发）；
3. 在顶栏追加「已嵌入主应用 · 菜单/主题由外层接管」徽标，并注入对应样式。

`standalone/no-shell.html` 额外做了「内层壳」检测：被嵌入时**不再挂载**页内手工拼装的 `menu/menunav/tabs`，改为显示 `#framedHint` 说明卡，但保留底部「动作清单」演示区；单独双击打开时仍是完整拼装效果。判定代码：

```js
var EMBEDDED = (function () {
  try { if (window.parent && window.parent !== window) return true; } catch (e) { return true; }
  return !!(window.KUI.frame && window.KUI.frame.isFramed && window.KUI.frame.isFramed());
})();
```

另外两条任务 8 修正后的硬性约定：

- 组件页必须引 `src/core/registry.js`，否则 `menu/menunav/tabs` 等组件不会注册，页面会出现 `.kui-unknown` 占位与「未注册的元素类型」警告。
- 页面若通过 `KUI.renderNode` 渲染 `button / text / alert / tag` 等控件节点（例如 `menu` 的 `footer.actions`、`no-shell` 的动作面板），必须引 `src/components/controls/index.js`（表单再加 `src/components/form.js`）。

---

## 5. 组装：自定义布局

### 5.1 方案 A：完整外壳（推荐）

`index.html` 只保留挂载点与资源引入，UI 全部来自 `config/app.json`：

```html
<body>
  <div id="kui-app"></div>
  <script src="config/bundle.js"></script>
  <script src="src/core/kui.js"></script>
  <script src="src/core/icons.js"></script>
  <script src="src/core/registry.js"></script>
  <script src="src/core/config.js"></script>
  <script src="src/core/theme.js"></script>
  <script src="src/core/theme-art.js"></script>
  <script src="src/components/controls/index.js"></script>
  <script src="src/components/form.js"></script>
  <script src="src/components/menu.js"></script>
  <script src="src/components/menunav.js"></script>
  <script src="src/components/tabs.js"></script>
  <script src="src/components/dialog.js"></script>
  <script src="src/components/toast.js"></script>
  <script src="src/components/app-shell.js"></script>
  <script src="src/app/bootstrap.js"></script>
</body>
```

bootstrap 检测到 `#kui-app` 会自动启动：加载配置 → 注入文案 → 初始化主题 → 挂载外壳 → 注册动作。想换布局就换 `config/app.json` 的 `layout`，想换菜单就换 `menu.props.items`。

### 5.2 方案 B：手工拼装（不要外壳）

参考 `standalone/no-shell.html`：自写 CSS Grid 侧栏 + 主列，用 `KUI.renderNode` 分别挂载 app.json 里现成的节点：

```js
KUI.config.load('app').then(function (app) {
  KUI.renderNode(app.menu, sidebarEl);
  KUI.renderNode(app.menunav, headerEl);
  var tabsNode = JSON.parse(JSON.stringify(app.tabs));
  tabsNode.props.urlPrefix = '../';          // 页面在子目录时补前缀
  KUI.renderNode(tabsNode, tabsHostEl);
});
```

要点：

- 三个节点可以任意换位置、换宽度、甚至只挂其中两个。
- 菜单的 `target` 交给 app-shell 处理；手工拼装时自己监听菜单实例事件或给 `item.on.click` 写动作。
- 标签页不依赖外壳：`KUI.tabs.create(host, props)` 或 `KUI.mount('tabs', host, node)` 都能独立工作，`home` + `initial` 会自动打开。
- 想演示动作面板，直接渲染 `config/demos/actions.json` 的 `groups[].actions`（38 个按钮，覆盖 theme/nav/dialog/toast/tab 全部内置动作）。

### 5.3 方案 C：业务 iframe 页

`pages/` 下的页面都是「被标签页打开的业务页」模板：

```html
<link rel="stylesheet" href="../src/styles/base.css">
<link rel="stylesheet" href="../src/styles/components.css">
<link rel="stylesheet" href="../src/styles/controls.css">   <!-- 有控件时 -->
<script src="../src/core/kui.js"></script>
<script src="../src/core/icons.js"></script>
<script src="../src/core/config.js"></script>
<script src="../src/core/theme.js"></script>
<script src="../src/core/theme-art.js"></script>
<script src="../src/components/controls/index.js"></script>  <!-- 有控件时 -->
<script src="../src/components/form.js"></script>            <!-- 有表单时 -->
<script src="../src/frame/kui-frame.js"></script>
<script>
(function () {
  'use strict';
  var KUI = window.KUI;
  KUI.frame.ready(function () {
    KUI.frame.setTitle('我的业务页');
  });
  var form = KUI.form.create(document.getElementById('host'), {
    nodes: [
      { id: 'name', type: 'input', label: '名称', required: true }
    ],
    data: { name: '' },
    onChange: function () { KUI.frame.setDirty(true); }
  });
  document.getElementById('save').onclick = function () {
    form.validate().then(function (ok) {
      if (!ok) return;
      return KUI.frame.dialog.confirm({ title: '确认保存', message: '刻印将写入时间线。' }).then(function (yes) {
        if (yes) { KUI.frame.setDirty(false); KUI.frame.toast.success('已保存'); }
      });
    });
  };
})();
</script>
```

业务页要点：

- **不要引** `config/bundle.js`、`src/core/registry.js`，**不要自己** `KUI.theme.init`：`kui-frame.js` 会跟随父级主题下发并自动应用 token。
- `KUI.frame.setDirty(true)` 让父级标签显示未保存圆点；标签切换不会重建 iframe（`keepAlive`），所以未保存状态天然保留。
- `KUI.frame.dialog.*` 与 `KUI.frame.toast.*` 都转发给父页面渲染；独立打开（没有父窗口）时会自动降级为本地实现，不报错。
- 页面关闭拦截：`KUI.frame.on('before-close', fn)`，在 fn 里弹确认或 `KUI.frame.close()`。
- 页内导航：`KUI.frame.navigate({ id, title, url, icon })` 打开新标签。

---

## 6. 新增控件 / 组件

### 6.1 纯展示型（`KUI.registry.register`）

```js
(function (global) {
  'use strict';
  var KUI = global.KUI;

  KUI.registry.register('stat', {
    category: 'component',
    title: '统计卡',
    defaults: { label: '统计', value: 0, icon: 'chart' },
    render: function (node, ctx) {
      var props = node.props || {};
      var el = document.createElement('div');
      el.className = 'kui-stat';
      var icon = KUI.icons.create(props.icon || node.icon || 'chart');
      if (icon) el.appendChild(icon);
      var label = document.createElement('span');
      label.className = 'kui-stat__label';
      label.textContent = props.label || node.label || '统计';
      var value = document.createElement('strong');
      value.className = 'kui-stat__value';
      value.textContent = String(props.value == null ? 0 : props.value);
      el.appendChild(label);
      el.appendChild(value);
      return el;
    },
    api: function (el, ctx) {
      return {
        setValue: function (v) { el.querySelector('.kui-stat__value').textContent = String(v); }
      };
    }
  });
})(window);
```

注册后即可在 JSON 里使用：

```json
{ "type": "stat", "props": { "label": "结界数量", "value": 7, "icon": "shield" } }
```

约定：

- `register(type, def)` 的 `def` 字段：`category`（`control` / `component` / `layout`）、`title`、`defaults`、`render`（必填）、`api`、`mounted`、`destroy`。
- 渲染根元素会被自动加 `kui-control kui-control--<type>`；`class` / `style` / `attrs` / `on` 由渲染器统一处理，不用在 `render` 里重复做。
- `render(node, ctx)` 收到的是**原始节点**，属性请从 `node.props` 取（顶层字段也可用，但推荐统一写 `props`）。
- 新脚本要放在所有 core 之后、首次渲染之前。

### 6.2 表单可联动控件

表单联动依赖控件实例暴露统一协议。一个能被 `deps` 控制的控件，需要让 `el.__kuiControl`（或实例 api）提供：

```js
el.__kuiControl = {
  getValue: function () { return value; },
  setValue: function (v, opts) { /* 更新 DOM，opts.silent 时不触发 change */ },
  validate: function () { return true; },
  setDisabled: function (bool) { /* 切换 is-disabled */ },
  setReadonly: function (bool) { /* 切换 is-readonly */ },
  focus: function () {}
};
```

推荐直接参考 `src/components/controls/input.js` / `select.js` 的写法：用 `KUI.controls.base.createField(...)` + `finalize(...)` 生成字段壳与实例，再调 `KUI.controls.define('mytype', {...})` 收集，最后 `KUI.controls.registerAll()` 统一注册。**不要修改 `src/` 里的文件来加自己的控件**；在自己的页面里追加一个 `<script>`，用 `KUI.controls.define`（在 registerAll 之前）或直接 `KUI.registry.register`（手动补上 `__kuiControl`）。

### 6.3 自检

```bash
node tools/check-assets.js     # 资源引用
node tools/check-compat.js     # Node 13.14 语法
```

浏览器打开后看控制台：`unknown-type` 说明 type 没注册；`no-form` 说明漏引 `src/components/form.js`。

---

## 7. 新增主题

1. 复制 `src/themes.json` 里任意一套主题的 `tokens`（64 个外观 token；契约 §10 共 94 个 token，剩余为 `base.css :root` 的派生/布局变量，主题不必覆写）。建议全部覆写外观 token，避免继承出奇怪配色。
2. 在 `themes` 数组末尾追加一项：

```json
{
  "id": "my-theme",
  "name": "自定义灵装",
  "desc": "一句话说明这套主题的用途",
  "scheme": "dark",
  "tokens": { "--kui-bg-0": "#08050a", "--kui-accent": "#c8102e" },
  "art": {
    "motif": "clock",
    "noise": true,
    "layers": [ { "kind": "glow" }, { "kind": "grid" } ],
    "corner": true
  },
  "preview": { "bg": "#08050a", "accent": "#c8102e", "accent2": "#d4af37", "text": "#f4eef3" }
}
```

`art.layers[].kind` 可选 11 种：`glow` / `grid` / `rays` / `moon` / `clock` / `feather` / `scanline` / `noise` / `stars` / `sakura` / `vignette`（参数见 `docs/04-theme.md` §5.3）。顶层 `art.noise` 只是自动补 noise 层的快捷写法，与显式 `{"kind":"noise"}` 层**不要叠加**；想在 demo 卡片里静态展示主题装饰，用 `KUI.themeArt.preview(theme, hostEl, { className: 'theme-card__art' })`。

3. 把 `my-theme` 加进 `config/app.json` 的 `theme.visible`；想让它默认生效就改 `theme.default`。
4. 运行 `node tools/build-config.js` 让 `file://` 模式也拿到新配色。

主题只换 token，不改结构；同一份 JSON 在 6 套主题下都应完整可用——新增主题后请把 `standalone/theme.html`、`pages/theme.html`、`pages/home.html` 都切一遍确认。

---

## 8. 新增页面

### 8.1 业务页（iframe 内）

复制 `pages/profile.html` 作为模板，按 §5.3 的清单引资源；页面自己负责数据与脏状态（`KUI.frame.setDirty`）。然后把页面加进菜单与（可选的）启动标签：

```json
{
  "type": "item",
  "id": "my-page",
  "label": "我的结界",
  "icon": "shield",
  "target": {
    "tab": {
      "id": "my-page",
      "title": "我的结界",
      "url": "pages/my-page.html",
      "icon": "shield"
    }
  }
}
```

若要启动即打开，再往 `app.tabs.props.initial` 加同构对象。不需要改任何 JS。

### 8.2 独立演示页（standalone）

复制 `standalone/controls.html`：`body data-kui-auto="false"`、按需引 CSS/JS、顶部主题下拉、底部日志。演示数据放 `config/demos/my-demo.json`，页面里用 `KUI.config.load('demos/my-demo')` 读取，这样「改 JSON 即改演示」。

---

## 9. 文案与多语言

- 所有框架默认文案都在 `config/text.json`；组件里通过 `KUI.text('key', '兜底')` 取。
- 局部覆盖：在 `config/app.json` 的 `text` 里写同结构对象，会深度合并、优先级最高。
- 新增文案键：直接往 `config/text.json` 加，不会与已有键冲突；变量用 `{name}` / `{0}`。
- 做英文/其他语言：复制 `config/text.json` 为 `config/text.en.json`，启动前 `KUI.i18n.set(data)`；框架不绑定语言，注入什么就显示什么。

```js
KUI.i18n.set({ common: { save: 'Save' } }, true);
KUI.text('common.save');   // Save
```

---

## 10. 扩展动作

UI 里所有交互最终都落到动作名。内置动作见 `docs/02` §5.2；自定义动作只需一行注册：

```js
KUI.actions.register('seal.open', function (params, ctx, ev) {
  var id = (params && params.id) || 'seal';
  KUI.toast.info({ title: '开启结界', message: '结界 id：' + id });
});
```

```json
{ "type": "button", "props": { "text": "开启结界" }, "on": { "click": { "action": "seal.open", "params": { "id": "g-7" } } } }
```

> 注意：业务 iframe 内注册的动作不会出现在 dialog-frame 里；弹窗内按钮要调用业务页逻辑时，用 `close: "resolve"` + `value` 回传，或把动作注册到主框架。

---

## 11. 构建、运行与排错

| 命令 | 作用 |
| --- | --- |
| `npm start` | 起静态服务器（默认 `http://127.0.0.1:8080`），启动时自动重建 `config/bundle.js` |
| `npm run build:config` | 手动重建 `config/bundle.js`（改完 JSON 后、用 `file://` 打开前运行） |
| `node tools/check-assets.js` | 检查 HTML 引用的资源 |
| `node tools/check-compat.js` | 检查 Node 13.14 不兼容语法 |
| `node tools/smoke.js` | 冒烟自检（若存在） |

常见问题：

| 现象 | 处理 |
| --- | --- |
| `file://` 打开 UI 空白/无配置 | 先 `npm run build:config` 生成 `config/bundle.js` |
| 改了 JSON 但页面没变 | 用 HTTP（`npm start`）打开并 Ctrl+F5；`file://` 下需重新 `build:config` |
| 控制台 `unknown-type` | 检查 `type` 是否在 `src/components/controls/` 或组件清单里 |
| 图标变问号 | 图标名不在 85 个清单内 |
| 表单控件不渲染 | 漏引 `src/components/form.js` 或 `controls/index.js` 顺序不对 |
| iframe 页样式错乱 | 漏引 `controls.css` / `components.css` |
| 未保存数据丢失 | 检查父级 `tabs.props.keepAlive` 是否被改成 `false` |
| `SyntaxError` | 内联脚本用了 `?.` `??` `||=` 等新语法，改回传统写法 |

### 11.1 拆解 vs 组装的取舍

| 目标 | 选择 | 理由 |
| --- | --- | --- |
| 只用一个菜单做导航 | 方案 B（单组件） | 不必引入 app-shell 与标签页 |
| 只想要弹窗/提醒 | 方案 B | dialog/toast 完全独立 |
| 想要完整工作台（菜单+标签+iframe） | 方案 A | app-shell + JSON 一把梭 |
| 已有自己的页面骨架，想嵌入业务页 | 方案 C | kui-frame 处理主题/脏状态/弹窗转发 |
| 想验证某控件是否达标 | 打开 `standalone/controls.html` | 全部控件同屏对比 |

---

## 12. 写域与协作

| 路径 | 负责内容 |
| --- | --- |
| `config/**`、`standalone/**`、`pages/**`、`docs/02`、`docs/06` | 配置资产与示例页面 |
| `src/core/**` | 渲染核心、配置加载、主题、图标 |
| `src/components/controls/**`、`src/components/form.js` | 控件与表单联动 |
| `src/components/{menu,menunav,tabs,dialog,toast,app-shell}.js`、`src/frame/**` | 外壳与 iframe 通信 |
| `src/styles/**` | 视觉与主题 token 落地 |
| `src/themes.json` | 6 套主题色板 |

改 UI 优先改 `config/`；改能力才改 `src/`。新增演示数据放 `config/demos/`，新增展示页放 `standalone/` 或 `pages/`，并在 `docs/02` 补字段说明。

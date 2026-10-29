# KurumiUI 架构契约（团队唯一事实来源）

> 本文件由 Lead 维护，所有成员必须严格遵守。任何需要变更契约的地方，先发消息给 Lead，不要自行改契约或改别人的文件。

## 1. 项目目标与验收标准

**KurumiUI**：一套「科技未来 + 动漫（时崎狂三主题）」风格的、配置驱动、可自由拆解重组的纯前端 UI 框架。
渲染代码（JS/CSS）只负责"如何渲染"，**可见内容、颜色、布局位置、控件类型、控件属性、文案全部来自 JSON 配置**。

硬性验收点（最终逐条验收）：
1. 左侧菜单栏；顶部菜单导航；多子标签；主体区域为子标签内 iframe；每个弹窗为独立 iframe；提醒信息（toast/notification）。
2. 子标签未激活/未关闭时 iframe **隐藏但不重建、不重载**，切换标签不丢失未保存数据（有专门演示页面验证）。
3. 每个组件都能独立渲染：`standalone/*.html` 只引自身需要的资源即可运行。
4. 全部控件风格统一（数字框箭头、单选/多选下拉弹层、textarea 右下角角标、日期面板、时/分/秒选择器、全局滚动条等），且颜色/圆角/阴影等全部来自主题 token。
5. 表单控件支持由同一表单其它控件值动态控制显示/隐藏/禁用/必填/选项，依赖关系写在 JSON。
6. 主题可自定义切换，默认狂三主题；至少 6 套可切换主题。
7. 零运行时依赖、无构建步骤、`file://` 双击可直接运行、Node ≥ 13.14 可启动服务与测试。
8. 调 UI 只改 JSON：文案、颜色、控件类型与属性、显隐规则、菜单/标签/弹窗结构都在 JSON 中。

## 2. 技术约束（必须遵守）

- **Node 兼容**：`>=13.14`。Node 端脚本（server.js / test/**）与浏览器端脚本统一使用安全语法子集。
- **禁用语法/API**（兼容 13.14 与旧浏览器）：`?.`、`??`、`||=`、`&&=`、`??=`、`String.prototype.replaceAll`、`Array.prototype.at`、`Object.fromEntries`、`structuredClone`、私有字段 `#x`、顶层 await、ESM `import/export`、`Intl.RelativeTimeFormat`。
- **允许**：`let/const`、箭头函数、模板字符串、Promise、async/await、class、Map/Set、展开运算符、`Object.assign`、`Array.from`、`URLSearchParams`、`fetch`（仅服务器模式的配置加载，需有 file:// 兜底）。
- **浏览器端使用传统 `<script>`（非 module）**，全部挂到 `window.KUI` 命名空间，保证 file:// 可运行。
- **零外部依赖**：不引 npm 包、不引 CDN、不引在线字体、不引图片文件（视觉素材用内联 SVG / CSS 渐变 / data-URI）。所有图标来自 `src/core/icons.js` 统一 sprite。
- **禁止硬编码**：组件内不允许写死可见文案（用 `KUI.text('key','默认文案')`）、不允许写死颜色（用 `var(--kui-*)`）、不允许写死尺寸魔法值（用 token 或 props 默认值）。
- 文件 UTF-8、LF 换行、2 空格缩进、中文注释、JS 语句结尾分号统一。
- 每个 JS 文件用 IIFE `(function (KUI) { ... })(window.KUI)` 包裹，避免全局污染。
- CSS 层：`base.css`（重置/变量兜底/滚动条/装饰层/动画/工具类）→ `controls.css`（全部控件）→ `components.css`（菜单/导航/标签/弹窗/toast）。加载顺序固定。
- 浏览器兼容目标：Chrome/Edge 90+（不要求 IE）。

## 3. 目录结构与文件所有权（写作用域，禁止越界）

```
ui框架/
├─ package.json                     Lead
├─ server.js                        Lead   Node13.14 静态服务器（CommonJS、0 依赖）
├─ .gitignore                       Lead
├─ index.html                       Lead   主应用入口
├─ README.md                        Lead
├─ docs/
│  ├─ 00-contract.md                Lead   ← 本文件
│  ├─ 01-architecture.md            Lead
│  ├─ 02-config-reference.md        config-docs
│  ├─ 03-controls.md                controls
│  ├─ 04-theme.md                   theme
│  ├─ 05-messaging.md               shell
│  ├─ 06-customization.md           config-docs
│  └─ test-report.md                Lead
├─ src/
│  ├─ core/
│  │  ├─ kui.js                     Lead  命名空间/工具/事件总线/template/uid
│  │  ├─ icons.js                   Lead  全部图标 sprite
│  │  ├─ registry.js                Lead  组件注册与 mount/renderNode
│  │  ├─ config.js                  Lead  配置加载/合并/文件模式兜底
│  │  ├─ theme.js                   Lead  主题引擎(token→CSS变量/切换/持久化)
│  │  └─ theme-art.js               theme 装饰层渲染（art 配置→DOM）
│  ├─ components/
│  │  ├─ controls/
│  │  │  ├─ index.js                controls  统一注册全部控件（自动加载下列文件）
│  │  │  ├─ control-base.js         controls  field 包装/状态机/popup/公共工具
│  │  │  ├─ inputs.js               controls  button input textarea number password search
│  │  │  ├─ selects.js              controls  select multiselect
│  │  │  ├─ choices.js              controls  checkbox radio switch slider progress rating
│  │  │  ├─ pickers.js              controls  date daterange time datetime month color
│  │  │  ├─ misc.js                 controls  tag badge divider link icon table pagination
│  │  │  │                                    upload alert(行内提示条) panel/stack/row 等容器
│  │  ├─ form.js                    controls  表单渲染 + 联动引擎
│  │  ├─ menu.js                    shell
│  │  ├─ menunav.js                 shell
│  │  ├─ tabs.js                    shell
│  │  ├─ dialog.js                  shell
│  │  ├─ toast.js                   shell
│  │  └─ app-shell.js               Lead  整体布局组装（可拆解）
│  ├─ app/
│  │  └─ bootstrap.js               Lead  启动入口：读配置→应用主题→渲染 shell→注册动作
│  ├─ frame/
│  │  ├─ kui-frame.js               shell  业务 iframe 页 SDK（含主题同步，不再单列 theme-sync.js）
│  │  └─ dialog-frame.js            shell  弹窗 iframe 内部逻辑（dialog-frame.html 引入）
│  ├─ styles/
│  │  ├─ base.css                   theme
│  │  ├─ controls.css               controls
│  │  ├─ components.css             shell
│  │  └─ themes/README.md           theme  说明：主题不写 CSS，全部走 JSON token
│  └─ themes.json                   theme  6 套主题定义
├─ config/
│  ├─ app.json                      config-docs  主配置（菜单/导航/标签/主题/text/弹窗样例）
│  ├─ bundle.js                     Lead 自动生成：json → window.__KUI_BUNDLE__（file:// 兜底）
│  ├─ text.json                     config-docs  文案字典
│  └─ demos/*.json                  config-docs  各组件独立演示配置
├─ standalone/*.html                config-docs  组件独立渲染演示页
├─ pages/*.html                     config-docs  iframe 业务页（含未保存数据验证页）
├─ test/
│  ├─ run.js                        test  总入口（node13.14）
│  ├─ dom-stub.js                   test  轻量 DOM 桩（0 依赖）
│  ├─ compat.test.js                test  语法/API 兼容扫描
│  ├─ config.test.js                test  配置合法性 + 控件类型清单校验
│  ├─ server.test.js                test  HTTP 冒烟
│  ├─ render.test.js                test  DOM 桩下渲染/联动/标签保活测试
│  └─ fixtures/                     test
└─ tools/
   ├─ build-config.js               Lead  json→config/bundle.js
   ├─ check-compat.js               test  兼容扫描实现
   └─ screenshot.js                 Lead  Edge headless 截图（视觉验证）
```

## 4. 加载顺序

v1.0.9 起，页面**不再逐条引入框架脚本**，改由单一入口 `src/core/kui-all.js` 统一注入（与 `config/kui-modules.json` 一一对应）：

```
<head>
  <script src="../src/core/theme-boot.js"></script>   <!-- 必须最前：首帧主题预置，避免闪烁 -->
  <link rel="stylesheet" href="../src/styles/base.css">
  <link rel="stylesheet" href="../src/styles/controls.css">
  <link rel="stylesheet" href="../src/styles/components.css">
  <link rel="stylesheet" href="../src/styles/tooltip.css">
  <script src="../config/bundle.js"></script>          <!-- file:// 兜底配置包 -->
  <script src="../src/core/kui-all.js" data-kui-profile="standalone"></script>
  <!-- 业务页面自己的内联脚本 / 页面脚本 -->
</head>
```

- `data-kui-profile="app"`：主应用（含 app-shell / bootstrap，26 个模块）。
- `data-kui-profile="standalone"`：独立渲染页（含 kui-frame.js，25 个模块）。
- `kui-all.js` 是构建产物：改 `config/kui-modules.json` 后运行 `npm run build:config`（= `build-config.js` + `build-all.js`）即可，**不要手改**。
- `src/frame/dialog-frame.html` 例外：它保持显式脚本清单（弹窗 iframe 体积敏感，且不接业务模块）。
- 加载顺序契约：`theme-boot.js` → 样式表 → `config/bundle.js` → `kui-all.js` → 页面脚本。
- 头像能力（v1.2.0 起）：`src/core/avatar.js`（`KUI.avatar` + `avatar` 控件）+ `src/styles/avatar.css`（由 `base.css` 顶部 `@import` 引入，无需改 HTML）。
## 5. 核心 API（Lead 实现，队友按此调用）

```js
window.KUI = {
  version: '1.4.0',
  utils: {
    el(tag, attrs, children),          // 创建元素；attrs 支持 class/属性/onXxx/style/text/html
    qs(sel, root), qsa(sel, root),
    uid(prefix),                          // 'kui-xxxx'
    clamp(n, min, max), debounce(fn, ms), throttle(fn, ms),
    deepGet(obj, 'a.b'), setByPath(obj, 'a.b', v),
    merge(target, ...sources),            // 深合并（数组整体替换）
    escapeHtml(s), template(str, data),   // '{{a.b}}' 插值；data 可嵌套；undefined→''
    isPlainObject(v), isString, isNumber,
    formatDate(date, 'YYYY-MM-DD HH:mm:ss'),
    parseJSON(s, fallback), download(filename, text),
    nextFrame(fn), wait(ms) -> Promise
  },
  events: { on(name, fn), once, off(name, fn), emit(name, payload) },
  text(key, fallback, vars),              // 读取 config.text（点路径），缺失用 fallback
  icons: { get(name) -> svgString, svg(name, cls) -> html, has(name) },
  config: { get(), get(path, fallback), set(patch), load() -> Promise },
  theme: { list(), current(), apply(id), register(t), onChange(fn), applyTokens(tokens), tokens() },
  registry: {
    register(type, descriptor), get(type), has(type), all() -> [type...]
  },
  renderNode(node, ctx) -> HTMLElement,
  renderTree(nodes, ctx) -> DocumentFragment,
  mount(type, hostEl, node, ctx) -> instance,   // instance = {el, ...api}
  form: { create(hostEl, options) -> formInstance },
  dialog: { alert, confirm, prompt, form, custom, open, close, closeAll, get, update },
  toast: { show, success, error, info, warning, close, closeAll, config },
  tooltip: { init, destroy, configure(patch), config(), show(el, text, opts), hide(), refresh(root) },  // 接管 title（v1.0.5）
  app: { shell(), menu(), menunav(), tabs(), config, theme },   // bootstrap 填充
  frame: {},                               // iframe 内 SDK（kui-frame.js 填充）
  plugins: { use(name, fn) }
};
```

`renderNode` 行为（Lead 实现）：
1. `node` 为字符串：返回文本节点包裹的 span。
2. `node.type` 必填（或 `node.template`？不支持，保持简单）。
3. 合并 `descriptor.defaults` 与 `node.props`（深合并，node.props 优先）。
4. 创建渲染上下文（子节点渲染时共享同一 ctx，除非组件自己开新 ctx）。
5. `descriptor.render(node, ctx)` 返回 Element；若返回 null/undefined 表示不渲染。
6. 统一处理：`node.visible === false` → 不渲染（或 `display:none`，由 descriptor 决定？**统一：renderNode 不渲染 invisible 节点**）；`node.class` 追加；`node.style`；`node.attrs` 透传；`node.id` → `el.dataset.kuiId`。
7. 渲染后若 `node.deps` 存在，由 form 的联动引擎负责（非表单场景由调用方决定）。

**渲染上下文 ctx**：
```js
{
  root: HTMLElement,        // 本次渲染的根容器
  form: formInstance|null,  // 若在表单内
  data: object,             // 只读数据快照（联动/插值用）
  scope: 'app'|'form'|'dialog',
  app: KUI.app|null,
  render: function(node),   // 用同一 ctx 渲染子节点
  emit: function(name, payload),
  uid: function(prefix)
}
```

## 6. 控件注册协议（controls 队友必须实现）

```js
KUI.registry.register('input', {
  category: 'control',
  defaults: { size: 'md', clearable: false, placeholder: '' },
  render: function (node, ctx) { /* 返回 HTMLElement（含 .kui-field 包装或纯控件由 size 决定） */ },
  // 可选：
  api: function (el, node, ctx) { return { getValue, setValue, focus, ... } }
});
```

控件必须遵守：
- 根节点 class 必须包含 `kui-control kui-control--<type>`；有 label 时由 `form` 或 `field` 包装，控件本身不渲染 label（`node.label` 由 form.js 渲染 `.kui-field`）。
- 统一状态 class：`is-disabled`、`is-readonly`、`is-error`、`is-focus`、`is-active`、`is-open`、`is-empty`。
- 值读写：`el.__kuiControl = { getValue(), setValue(v), validate(), setDisabled(b), setReadonly(b), focus() }`。
- 所有可聚焦控件支持键盘：Tab 顺序、Enter 提交（表单内）、Esc 关闭弹层、方向键切换选项。
- 每个控件自清理：关闭时移除 document 级监听（`el.__kuiControl.destroy()`，由 form/宿主调用）。
- 弹层类控件（select/multiselect/date/time/datetime）统一使用 `KUI.utils.popup`？**统一用 `src/components/controls/control-base.js` 提供的 `openPopup(anchorEl, contentEl, opts)`**，保证弹层动效/描边/阴影/定位/关闭逻辑一致。Lead 在契约确认该函数签名：
  ```js
  var popup = KUI.controls.popup.open(anchorEl, contentEl, {
    placement: 'bottom-start',  // bottom-start|bottom-end|top-start|top-end
    width: 'anchor'|number|'auto',
    offset: 6, matchWidth: true,
    onClose: fn
  });
  popup.el, popup.close(), popup.reposition()
  ```
  该 helper 挂在 `KUI.controls`（由 control-base.js 暴露）。

## 7. 表单与联动规范（controls 队友实现 form.js）

```js
KUI.form.create(hostEl, {
  nodes: [ ...控件节点... ],
  data: {...},                       // 初始数据（按 node.id 取值）
  layout: { columns: 1, gap: 16, labelWidth: 96, labelPosition: 'left' },
  text: {...},                       // 覆盖文案
  onChange: function (id, value, data) {},
  onSubmit: function (data, form) {},
  validateOn: 'blur'|'change'|'submit'
}) -> formInstance
```

formInstance：
```
el
getData() -> object
setData(obj, opts)           // opts.silent
getValue(id), setValue(id, v, opts)
getField(id) -> { el, control, node }
validate(ids?) -> { valid: boolean, errors: {id: msg} }
clearValidate(ids?), reset()
setVisible(id, bool), setDisabled(id, bool), setReadonly(id,bool), setRequired(id,bool)
setOptions(id, options)
setError(id, msg), clearError(id)
subscribe(fn) -> unsubscribe    // 数据/状态变化
destroy()
```

联动（`node.deps`，纯 JSON，不写代码）：
```json
"deps": [
  { "when": { "field": "type", "op": "eq", "value": "custom" },
    "then": { "visible": true, "required": true } },
  { "when": { "all": [ { "field": "a", "op": "eq", "value": 1 },
                       { "field": "b", "op": "notEmpty" } ] },
    "then": { "visible": true } }
]
```
- 默认状态：`visible = node.visible !== false`，`disabled = !!node.disabled`，`required = !!node.required`。
  - **补充规则（bootstrap/冒烟一致口径）**：若节点**未显式写 `visible`** 且 `deps` 里存在 `then.visible`，则该字段默认**隐藏**（由命中的规则来显示它）；没有 `deps` 可见性规则时严格按 `visible !== false`（默认可见）。这样配置可直接写"满足条件才出现"，无需额外补 `"visible": false`。
- 求值顺序：先取默认，再按声明顺序应用所有命中项（后面的覆盖前面）。`when.all` / `when.any` 二选一，可与 `field/op/value` 混用。
- 操作符 `op`：`eq ne in nin contains notContains gt gte lt lte empty notEmpty truthy falsy regex`。
- `then` 支持字段：`visible`、`disabled`、`readonly`、`required`、`value`（覆盖值）、`options`（动态选项数组）、`text`（覆盖 label 文案）、`error`。
- 联动对象变化即重新求值（值变化/选项变化/表单 setData 后）。
- 联动不得覆盖用户手动输入之外的值（除非 `then.value` 显式声明）。
- `form.getLinkageGraph()` 可选实现，文档说明。

### 7.5 必填组与隐藏跳过（v1.3.0）

- `requiredAny: string[]`（节点级，写在组内任一成员）：组内全空 → 全员视为必填并报 `requiredAnyMessage`（默认「请至少填写其中一项」）；填任一 → 其余成员解除必填。
- `switch` 值为 `false` 视为空；`radio-group` / `checkbox-group` 空值视为空。
- **隐藏字段必须跳过必填校验**：`validateField(id)` 与弹窗侧 fallback 校验都要先判可见性。
- 星号显隐统一由 CSS 控制：`.kui-field__required{display:none}` + `.kui-field.is-required:not(.is-required-optional) .kui-field__required{display:inline-block}`。

## 8. 组件规格（shell 队友必须实现）

> v1.3.7 起组件清单为 8 个：`menu / menunav / tabs / dialog / toast / form / app-shell / boot`（`boot` 见 §20）。

### 8.1 menu（左侧菜单）
node: `{ "type": "menu", "props": { ... } }`
```
props: {
  brand: { title, subtitle, logoIcon, href },      // 顶部品牌区
  collapsed: false, collapsible: true,
  width: 252, collapsedWidth: 68,
  defaultActive: 'id',
  items: [
    { id, label, icon, badge, url, target: 'tab'|'blank'|'action', tab: {title, icon, url, pinned},
      children: [ ...同结构... ], type: 'item'|'group'|'divider', disabled, tooltip },
  ],
  footer: { title, version, actions: [节点] }
}
```
API：`setActive(id) getActive() toggle() setCollapsed(b) expand(id) setBadge(id, text) setItems(items)`
行为：二级菜单展开/收起带动画；折叠态 hover 弹出 flyout 子菜单（可省略，但折叠态至少显示 tooltip）；选中项左侧光条 + 图标/文字变色；徽标；点击 `target:tab` 时触发 `on.select(item)` 并由 app-shell 调 tabs.open。

### 8.2 menunav（菜单导航）
```
props: {
  mode: 'header',                    // 预留 inline
  showCollapse: true, showHistory: true, showRefresh: true, showFullscreen: true,
  breadcrumb: { enabled: true, home: {label, icon}, items: [] },  // items 空则自动由 menu 生成
  actions: [ {type:'button', text:'主题', icon:'palette', on:{click:{action:'theme.picker'}}} ],
  title: ''                          // 中间标题（可选）
}
```
API：`setBreadcrumb(items) setTitle(t) setActions(nodes)`
行为：面包屑随 tab/menu 变化；前进/后退基于 tabs 历史栈；刷新刷新当前 iframe；全屏切换。

### 8.3 tabs（子标签 + iframe 主体区）
```
props: {
  closable: true, pinnedClosable: false, keepAlive: true, maxTabs: 24,
  contextMenu: true,                 // 右键菜单：刷新/关闭/关闭其他/关闭全部/复制链接
  drag: false,                       // 预留
  emptyText: '暂无打开的页面',
  home: { title:'首页', url:'pages/home.html', icon:'home' },
  sandbox: ''                        // 传给 iframe 的 sandbox 属性（默认不设）
}
```
tab: `{ id, title, url, icon, closable, pinned, params }`
API：
```
open(tab) -> id              // 已存在则激活
close(id), closeOthers(id), closeAll(), closeLeft/Right?
activate(id), refresh(id), getActive(), getTabs(), exists(id),
setTitle(id, t), setIcon(id, icon), setDirty(id, bool), updateUrl(id, url)
```
**iframe 保活规则（硬要求）**：
- 每个 tab 对应固定 pane DOM：`<div class="kui-tab-pane" data-tab-id=".."><iframe ...></iframe></div>`。
- 首次 `open` 时创建 pane 与 iframe，但 **src 只在首次 activate 时才赋值**（懒加载）。
- 切换：只切 `.is-active` 与 `hidden` 属性，**禁止** remove/重建 iframe、禁止改 src、禁止 contentWindow.location.reload（除显式 refresh）。
- `close` 才移除 pane/iframe。
- iframe 页面 onload 后发 `frame:ready`，父页回 `tab:init`（见 §9）。
- 关闭前若页面 dirty（`frame:dirty` 上报），需要 `KUI.dialog.confirm` 确认；确认流程走主框架 dialog。
- 标签栏溢出：横向滚动（滚轮可滚动）+ 左右滚动按钮；标签宽度自适应有 min/max。

### 8.4 dialog（弹窗，每个弹窗一个 iframe）
主框架层：`<div class="kui-dialog-layer" data-dialog-id><div class="kui-dialog-mask"></div><div class="kui-dialog-wrap"><iframe class="kui-dialog-frame" src="src/frame/dialog-frame.html"></iframe></div></div>`
（实际路径由 `dialog.js` 的 `resolveFrameUrl()` 从自身 `script.src` 反推，支持 index.html 根目录、standalone 子目录、以及 `KUI.config.get('dialog.frameUrl')` 覆盖；**不提供根级薄壳**，避免同一文件两份。）
API（Promise 化）：
```
KUI.dialog.alert({ title, message, icon:'info', okText, closeOnMask, onOk }) -> Promise<void>
KUI.dialog.confirm({ title, message, icon:'warning', okText, cancelText, danger }) -> Promise<boolean>
KUI.dialog.prompt({ title, message, label, placeholder, defaultValue, rules, input:{type:'text'|'textarea'|'password'|'number'} }) -> Promise<string|null>
KUI.dialog.form({ title, nodes, data, layout, width, okText, cancelText, submitApi }) -> Promise<object|null>
KUI.dialog.custom({ title, nodes, actions, width, height, ... }) -> Promise<any>
KUI.dialog.open(config) -> Promise<any>      // 底层统一入口
KUI.dialog.close(id) closeAll() get(id) update(id, patch)
```
config 公共字段：`{ id?, title, type, icon, width, height:'auto'|number, maxWidth:'92vw', maskClosable, closeOnEsc, closable, draggable, layer, parentId, className, theme?, loading }`
行为：栈式堆叠（z-index 递增）、Esc 关闭栈顶、焦点锁定（iframe 内）、打开/关闭动效、滚动锁、iframe 内容高度自适应（resize 消息）。
**每个弹窗必须是独立 iframe**。弹窗内再打开弹窗：dialog-frame 内 `KUI.dialog.*` 会把请求转发给主框架（`dialog-host:open`），由主框架创建新的独立 iframe，保证任何弹窗都是 iframe。

### 8.5 toast（提醒信息）
```
KUI.toast.show({ type:'info'|'success'|'warning'|'error', mode:'toast'|'notification',
  title, message, duration:3200, position:'top-right'|'top-center'|'bottom-right'...,
  closable:true, progress:true, action:{text,onClick}, max:5 })
KUI.toast.success/error/info/warning(message|opts)
KUI.toast.close(id), closeAll(), config(patch)
```
纯 DOM 实现（提醒信息不属于"弹窗"），自动创建 `.kui-toast-layer`，栈式堆叠、悬停暂停计时、进出动效。

### 8.6 app-shell（Lead）
node: `{ "type":"app-shell", "props": { layout, menu, menunav, tabs, text } }`
组装：`left(menu) + header(menunav) + center(tabs) + overlay(toast layer + dialog layer)`，全由配置驱动。
**可拆解要求**：不渲染 app-shell 时，menu/menunav/tabs/toast/dialog 都能单独 `KUI.mount`。

## 9. postMessage 协议（shell 必须严格实现，双向校验 source）

所有消息统一封装：`{ __kui: true, type: '...', requestId: '...', payload: {...} }`。
主框架→dialog iframe：
- `dialog:init  { dialogId, config, theme:{id,tokens} }`
- `dialog:update { patch }`
- `dialog:close {}`
- `theme:apply { id, tokens }`
dialog iframe→主框架：
- `dialog:ready { dialogId }`
- `dialog:resize { height, width? }`
- `dialog:resolve { value }`
- `dialog:cancel {}`
- `dialog:toast { payload }`
- `dialog:open { config }`（弹窗内再开弹窗）
- `dialog:theme-request {}` → 父回 `theme:apply`
主框架→业务 iframe：
- `tab:init { tabId, title, params, theme:{id,tokens}, app:{title}, parentVersion, src }`
  - `parentVersion`：父框架 `KUI.version`（v1.0.4 起）。子页版本不一致时会带 `kui_v` 自动刷新一次，避免长会话里残留旧版 iframe 文档。
  - `src`：该标签 iframe 的最终 URL（含 `kui_v` 版本戳）。
  - iframe URL 规则（v1.0.4 起）：http(s) 环境下 `tabs.open()` 会给子页面 URL 追加 `?kui_v=<KUI.version>`（缓存穿透）；`file://` 不追加。
- `tab:before-close { }` → 子页 `tab:close-result { ok }`（可选）
- `tab:refresh`
- `theme:change { id, tokens }`
- `tab:activate {}`
业务 iframe→主框架：
- `frame:ready { }`（父据此发 tab:init）
- `frame:title { title }`
- `frame:dirty { dirty }`
- `frame:toast { payload }`
- `frame:dialog { requestId, method:'alert'|'confirm'|'prompt'|'form', config }`
  父执行后回 `frame:dialog-result { requestId, value }`
- `frame:close {}`
- `frame:height { height }`（内容自适应，可选）
- `frame:navigate { tab }`（请求打开新标签/切换）
- `frame:theme { id, name?, scheme?, tokens?, art? }`（**iframe 内请求把全局主题同步到整壳与所有 iframe**；父级应用后由 `KUI.theme` 广播 `theme:apply` 回所有子级。v1.0.1 新增）
- `frame:theme-request {}`（iframe 主动索取当前主题，父级回 `theme:apply`。v1.0.1 新增）
校验：父框架只接受 `event.source === iframe.contentWindow` 的消息；iframe 页面用 `window.parent`，发送时 targetOrigin `'*'`（注释说明同源部署可收紧）。

## 10. CSS Token 契约（theme 队友提供全部默认值，controls/shell 只能使用这些）

命名规范：`--kui-<域>-<语义>-<变体>`。**所有变量必须在 base.css 的 `:root` 给出默认值（kurumi 主题值作为兜底），主题 JSON 可覆盖任意 token。**
基础颜色：
```
--kui-bg-0 --kui-bg-1 --kui-bg-2 --kui-bg-3 --kui-bg-4
--kui-text-1 --kui-text-2 --kui-text-3 --kui-text-inverse
--kui-accent --kui-accent-hover --kui-accent-soft --kui-accent-glow
--kui-accent-2 --kui-accent-2-soft      /* 金色 */
--kui-accent-3                          /* 第三色 */
--kui-success --kui-warning --kui-danger --kui-info
--kui-on-accent --kui-on-success --kui-on-warning --kui-on-danger   /* v1.0.3：填充色上的可读前景，≥4.5:1 */
--kui-border --kui-border-strong --kui-divider
--kui-mask --kui-mask-strong
--kui-selection-bg --kui-selection-text
```
字体：
```
--kui-font-family --kui-font-display --kui-font-mono
--kui-fs-xs(11) --kui-fs-sm(12) --kui-fs-base(13) --kui-fs-md(14) --kui-fs-lg(16)
--kui-fs-xl(20) --kui-fs-2xl(26) --kui-lh --kui-letter-spacing
```
形状/阴影/动效：
```
--kui-radius-xs(2) --kui-radius-sm(4) --kui-radius-md(6) --kui-radius-lg(10)
--kui-radius-xl(14) --kui-radius-pill(999) --kui-border-width(1px)
--kui-shadow-1 --kui-shadow-2 --kui-shadow-3
--kui-glow --kui-inner-glow --kui-highlight(顶部内高光)
--kui-duration-fast(120ms) --kui-duration-base(200ms) --kui-duration-slow(320ms)
--kui-ease --kui-ease-out --kui-ease-bounce
```
控件：
```
--kui-control-h-sm(26px) --kui-control-h-md(32px) --kui-control-h-lg(38px)
--kui-control-bg --kui-control-bg-hover --kui-control-bg-active --kui-control-bg-disabled
--kui-control-border --kui-control-border-hover --kui-control-border-focus
--kui-control-text --kui-control-text-placeholder --kui-control-text-disabled
--kui-control-radius --kui-control-px
--kui-control-arrow-color --kui-control-arrow-size
--kui-scrollbar-size(8px) --kui-scrollbar-thumb --kui-scrollbar-thumb-hover --kui-scrollbar-track
--kui-popup-bg --kui-popup-border --kui-popup-shadow --kui-popup-radius --kui-popup-z
--kui-option-hover-bg --kui-option-selected-bg --kui-option-selected-text
--kui-calendar-bg --kui-calendar-head-bg --kui-calendar-today
```

## 11. 图标规范

- 全部内联 SVG symbol，`viewBox="0 0 24 24"`，线性图标：`fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round`。
- `icons.js` 由 Lead 提供至少下列图标（缺的找 Lead 补，禁止用 emoji 代替）：
  `home clock gear terminal chart folder file image user users bell search plus minus close check chevron-down chevron-up chevron-left chevron-right arrow-left arrow-right arrow-up arrow-down refresh fullscreen exit-fullscreen more-vertical more-horizontal grid list save download upload trash edit copy external-link lock unlock eye eye-off calendar timer info success warning error question spinner drag filter sort star heart pin expand collapse menu play pause palette moon feather cross shield database code link mail message share settings power sun wave target`
- 用法：`<svg class="kui-icon"><use href="#kui-i-home"></use></svg>`（`href` 不用 xlink）。图标尺寸由 `.kui-icon` + CSS 字号控制，`--kui-icon-size`。
- 控件内部装饰箭头（数字框上下箭头、下拉箭头、日历箭头、时间列箭头、textarea 角标、switch 圆点、checkbox 对勾）**必须统一材质**：优先使用同一个 SVG symbol 或 `mask-image`（`background: currentColor`），禁止各控件自己画一套。

## 12. 文案（text）规范

- 全部可见文案走 `KUI.text('tabs.empty', '暂无打开的页面')`。key 用点路径，`config/text.json` 可覆盖。
- `node` 上的 `label/text/placeholder/title/message/okText/...` 优先级高于 text 字典默认值。
- 日期时间控件的中文（年/月/日/时/分/秒、星期）也走 text 字典。
- 不允许在 JSX/HTML 模板里写死中文提示语（注释不算）。

## 13. 主题 JSON（theme 队友交付 `src/themes.json`）

```json
{
  "default": "kurumi",
  "version": "1.0",
  "themes": [
    {
      "id": "kurumi",
      "name": "绯红刻刻帝",
      "desc": "默认主题：暗夜绯红 × 金色刻刻帝",
      "scheme": "dark",
      "tokens": { "--kui-bg-0": "#08050a", "...": "..." },
      "art": {
        "motif": "clock",
        "noise": 0.02,
        "layers": [
          {"kind":"glow","color":"var(--kui-accent)","opacity":0.16,"x":"85%","y":"8%","size":"70vmax"},
          {"kind":"grid","opacity":0.05,"size":44},
          {"kind":"clock","opacity":0.08,"size":560,"x":"92%","y":"82%"},
          {"kind":"rays","opacity":0.05},
          {"kind":"scanline","opacity":0.03}
        ],
        "corner": "cut"
      },
      "preview": { "bg": "#0b0609", "accent": "#c8102e", "accent2": "#d4af37" }
    }
  ]
}
```
6 套主题（必须）：`kurumi` 绯红刻刻帝（默认，暗黑绯红金）、`kurumi-angel` 白羽灵装（银白+淡金+血色点缀，暗/浅混合）、`starry` 星夜观测（深空蓝紫+青）、`sakura` 樱雾通灵（粉紫+玫瑰金）、`abyss` 深渊刻印（墨绿黑+青铜）、`dawn` 黎明绯光（浅色/明亮，暖白绯红金）。
**主题只通过 tokens + art 表达，禁止新增主题专属 CSS 选择器。**

## 14. 独立渲染（standalone）要求

每个 `standalone/*.html`：
- 只引该组件所需 CSS/JS（不引 app-shell/bootstrap）。
- 页面内联一小段 `window.KUI_STANDALONE = {...}` 配置（或 fetch config/demos/xxx.json）；主题用 `KUI.config.set('themes', {...})` 或 `KUI.theme.load(...)` 内联注入，**不要**引 config/bundle.js。
- 必须能单独打开渲染、交互正常、主题正确、控制台无报错。
- 至少包含：`menu.html`、`menunav.html`、`tabs.html`、`dialog.html`、`toast.html`、`form.html`（含全部控件 + 联动）、`controls.html`、`theme.html`（主题切换器）、`no-shell.html`（所有组件手动 mount 的拼装演示）。

## 15. 测试要求（test 队友）
- `tools/smoke.js` 支持分节执行：`--only=list` 列出分节、`--only=N[,M]` 只执行指定分节的断言（初始化仍完整执行，保证依赖齐全），汇总会打印跳过条数；新增断言须挂在某个分节内并带 `currentSection` 标记。

> **v1.3.5 强制要求（源码↔测试一致性）**
>
> - 测试的运行时加载清单**必须**从唯一事实来源 `config/kui-modules.json` 派生（见 `test/load-kui.js`），
>   **禁止手写文件清单**——历史上手写清单漏掉 `tooltip/diag/handlers/dom-enhance/avatar`，导致「测试全绿但线上行为不同」。
> - 版本号在 `KUI.version` / `package.json` / `kui-frame.js` fallback / `dom-enhance.js` VERSION 四处必须一致，
>   由 `npm run audit:consistency` 与冒烟 `[25.1]` 双重把关。
> - 发布前建议执行：`npm run audit`（一致性 16 项 + 可拆装 17 项）→ `npm run smoke` → `npm test`。


- 全部测试脚本用 **Node 13.14 真实运行**：`D:\nodejs\ui框架\.tools\node-v13.14.0-win-x64\node.exe test/run.js`（或已加入 PATH 的 node13 路径由 Lead 提供）。
- `compat.test.js`：扫描 `src/**/*.js`、`server.js`、`test/**/*.js`、HTML 内联脚本，禁用语法/API 清单匹配；对每个 JS 用 node13 的 `--check` 做语法校验。
- `config.test.js`：所有 JSON 可解析；`config/app.json` 结构合法；所有 `type` 都在已注册类型清单内（清单由 test 从 `registry` 注册表加载 ggreg 获取）；`themes.json` 主题齐全且 tokens 键合法。
- `render.test.js`：用 `dom-stub.js` 在 node 中加载全部组件脚本，断言：注册表类型齐全；表单渲染出全部控件；联动规则生效（改 A 显隐 B）；tabs 打开/切换/关闭顺序正确且 iframe 节点不被重建（记录同一 node 引用）；dialog 打开时创建 iframe；toast 可创建/关闭；主题切换写入 CSS 变量。
- `server.test.js`：fork server.js 后对主要资源发 HTTP 请求断言 200 + Content-Type，结束 kill。
- 输出：通过/失败计数、失败详情、退出码非 0 即失败。
- 交付 `docs/test-report.md` 由 Lead 汇总，test 队友提供 `test/REPORT-TEMPLATE` 或直接给数据。

## 16. 视觉方向（theme / controls / shell 共同遵守）

**科技未来 + 动漫哥特，不是赛博朋克**：
- 是：暗夜玻璃拟态、细网格 HUD、斜切角（clip-path）、细描边、微弱内发光、刻刻帝时钟/罗马数字/齿轮/血月/羽毛、不对称装饰、优雅哥特。
- 不是：大面积荧光青紫、glitch 乱码、故障风、荧光绿、粗霓虹描边、像素风。
- 狂三元素用色：绯红 `#c8102e` 系、暗夜 `#08050a`、金 `#d4af37`、眼罩/左眼时钟、血滴、银色蕾丝。
- 布局：左侧菜单 252px（折叠 68px）；header 56px；标签栏 38px；主体 iframe 满铺圆角 6px。
- 动效：120/200/320ms，hover 微光位移 1px，激活内凹/发光，选中项左侧 2px 绯红光条。
- 细节必须统一：所有圆角、边框、焦点环、禁用态、滚动条、箭头材质、弹层阴影、文字层级（1/2/3 级）一致。
- 页面背景：`--kui-bg-0` + art 装饰层（`.kui-art`，`pointer-events:none; position:fixed; inset:0; z-index:0`），内容层 z-index ≥1。

## 17. 主配置 app.json 与动作清单（config-docs 交付、Lead 的实现读取）

```json
{
  "schema": "kui-app@1",
  "app": {
    "title": "KurumiUI",
    "subtitle": "刻刻帝控制台",
    "version": "1.0.0",
    "logoIcon": "clock"
  },
  "theme": { "default": "kurumi", "storageKey": "kui-theme", "persist": true },
  "layout": {
    "gap": 10,
    "menu":   { "width": 252, "collapsedWidth": 68, "collapsed": false },
    "header": { "height": 56 },
    "tabbarHeight": 38
  },
  "menu":    { "type": "menu",    "props": { "brand": {}, "collapsible": true, "items": [] } },
  "menunav": { "type": "menunav", "props": { "breadcrumb": {}, "actions": [] } },
  "tabs":    { "type": "tabs",    "props": { "closable": true, "initial": [] } },
  "dialogs": { "settings": {}, "about": {} },
  "text":    { }
}
```
- `layout` 字段是 app-shell 的唯一尺寸来源（嵌套写法优先，扁平 `menuWidth/headerHeight` 兼容）。
- `text` 会深合并覆盖 `config/text.json`（优先级：app.text > text.json > KUI.text 默认值）。
- `tabs.props.initial` 为标签描述数组 `{id,title,url,icon,pinned}`，启动后按序打开（首个激活）。
- `dialogs.settings` = `{title,nodes,data,width,okText,cancelText}`，为 `settings.open` 动作的弹窗内容；缺省用内置最小表单。

**菜单项 schema（app-shell / menu 的权威格式）**
```json
{ "type": "group", "id": "g-form", "label": "表单", "icon": "edit", "children": [] }
{ "type": "item", "id": "form-demo", "label": "表单联动", "icon": "layers",
  "badge": "NEW", "badgeType": "accent",
  "target": { "tab": { "id": "form-demo", "title": "表单联动", "url": "pages/form.html", "icon": "layers", "pinned": false } } }
{ "type": "item", "id": "nav-docs", "label": "文档", "icon": "book",
  "target": { "action": "nav.open", "params": { "id": "docs", "title": "文档", "url": "pages/docs.html" } } }
{ "type": "divider" }
```
- `item` 带 `children` 表示二级菜单；`target` 可以是 `{tab}`、`{action,params}`、`{actions:[...]}` 或字符串动作名。
- `menu.select` 动作可让 JSON 主动跳菜单：`{"action":"menu.select","params":{"id":"form-demo"}}`。

**bootstrap 注册的动作（JSON 里可直接引用）**
| 动作 | 参数 | 说明 |
|---|---|---|
| `theme.picker` | — | 打开主题选择弹窗 |
| `theme.apply` | `{id}` | 应用指定主题 |
| `app.applyTheme` | `{id,dialogId?}` | 应用主题 + toast + 可选关弹窗 |
| `theme.toggleScheme` / `theme.next` / `theme.prev` / `app.themeRandom` | — | 深浅切换 / 循环 / 随机 |
| `search.toggle` | — | 输入框弹窗搜索菜单并跳转 |
| `notify.demo` | — | 依次演示 4 种提醒信息 + 通知 |
| `settings.open` | — | 打开设置弹窗（读取 `app.dialogs.settings`） |
| `about.open` | — | 关于弹窗 |
| `nav.refresh` / `nav.back` / `nav.forward` | — | 刷新当前 iframe / 标签历史 |
| `nav.toggleCollapse` / `menu.toggle` / `app.collapse` | `{value?}` | 菜单折叠 |
| `nav.fullscreen` / `app.fullscreen` | — | 全屏切换 |
| `nav.open` | `{id,title,url,icon,pinned}` | 打开标签页 |
| `nav.close` | `{id}` | 关闭标签页 |
| `menu.select` | `{id}` | 选中菜单并打开其目标 |
| `dialog.alert/confirm/prompt/form/custom/close/closeAll` | 见 §8.4 | 弹窗 |
| `toast.show/info/success/warning/error/notify/clear` | 见 §8.5 | 提醒信息 |
| `tab.open/close/closeOthers/closeAll/activate/refresh` | `{id?,...}` | 标签页 |
| `clipboard.copy` | `{text}` | 复制 |
| `app.info` | `{message}` | 弹一条信息提醒 |

**弹窗内动作转发（§9 补充）**：dialog iframe 里 `KUI.actions.has(name)` 为假时，发 `{__kui:true,type:'dialog:action',requestId,payload:{action,params}}` 给父页，父页执行后回 `{type:'dialog:action:result',requestId,payload:{ok,result,error}}`；`remoteAction:true` 时强制全部转发。这样 `theme.picker` 等父级动作能从弹窗里触发，且弹窗自身仍是独立 iframe。

**节点级 `on` 动作同样要转发（v1.0.2）**：`dialog-frame.js` 启动时调用 `installActionBridge()` 包装本地 `KUI.actions.run`，凡是 `app./theme./tab(s)./nav./menu./menunav./toast./dialog./handlers./form./frame.` 前缀的动作都走 `dialog:action` 交父页，**不再只限于 footer 按钮**。修复了主题选择弹窗（节点级 `on.click → app.applyTheme`）点击无反应的 bug。

## 18. 业务函数层（JSON 不能写函数，v1.0.2）

- 根源：配置 JSON 是纯数据，无法保存函数。KurumiUI 采用 **「每个组件一个独立 handlers.js」**：
  - 注册表 `src/core/handlers.js`（`KUI.handlers`：`register/registerMany/has/resolve/invoke/list/scopes/count/clear`，内置动作 `handlers.run`）；
  - 组件业务函数：`src/components/handlers/{menu,menunav,tabs,dialog,toast,app-shell,form}.handlers.js`，scope 分别为 `menu/menunav/tabs/dialog/toast/app/form`；
  - 函数签名 `(ctx, args, info)`，命名 `scope.name`，允许同名覆盖，未注册时 `warnOnce`、抛错不中断渲染。
- **JSON 四种写法**：
  1. `{ "fn": "toast.success", "args": { "text": "保存成功" } }`
  2. `"on": { "click": "toast.info" }`（字符串=函数名或动作名）
  3. `{ "actions": [ { "fn": "…" }, { "action": "…", "params": {…} } ] }`（动作与函数混写）
  4. `{ "action": "handlers.run", "params": { "fn": "…", "args": {…} } }`
- **`kui.js` 语法糖**：`actions.run` 识别 `action.fn || action.handler` → `handlers.run`；`invoke()` 在动作未注册时回退 `KUI.handlers.invoke`（所以字符串也能直接写函数名）。
- **加载顺序**：`core/handlers.js` 紧跟 `theme-art.js`；各组件 `.handlers.js` 放在对应组件脚本之后；`app-shell.handlers.js` 放在 `app-shell.js` 之后。独立渲染页按需加载。
- **详情文档**：`docs/09-handlers.md`。

## 19. 协作规范

- **只改自己写作用域内的文件**。发现别人文件有 bug：发消息给对应队友（或 Lead），不要直接改。
- 任务板：每人领取自己的任务卡（`team_task_list` → `team_task_get` → `team_task_update` action=claim），完成后 `complete`。
- 每完成一个里程碑：`send_message` 给 `lead`，格式：`[完成] 文件清单 / 已验证项 / 未完成项 / 需要 Lead 决策`。
- 阻塞超过 10 分钟无法自行解决：立刻发消息，不要空转。
- 每写完全部文件后自测（能跑的命令自己跑，node13 路径见 §15），把命令与结果贴给 Lead。
- 不要运行会删除/移动工作区外文件的命令；不要 `npm install`（项目零依赖）。
- 中文注释、中文文档、中文汇报。

## 20. 启动层组件（boot，v1.3.7 起；v1.3.8 完成配置接线）

> 需求（用户）："访问服务时或刷新时的 加载中 页面，也需要可以单独 自由拆卸、组装，且 时钟图案 增加一项 时钟指针动画，
> 加载进度 0% 至 100% 分别对应时钟的 0 时至 12 时，要注意时钟的时针和分针的指向位置。还需要一个单独的测试页面，观察效果。"

启动层（加载中页面）从 `index.html` 的内联样式/骨架升级为**可注册、可拆装、可独立渲染**的组件：

| 项 | 约定 |
| --- | --- |
| 文件 | `src/components/boot.js`（逻辑 + 注册）、`src/styles/boot.css`（样式） |
| 注册 | `KUI.registry.register("boot", { category: "shell", defaults, render(props, ctx) })` |
| 静态 API | `KUI.bootLayer`：`create(host, props)` / `attach(props, textCfg)` / `configure(patch, textCfg)` / `instance()` / `handsAt(p)` / `isReady()` |
| 实例 API | `setProgress(p)` / `getProgress()` / `setStep(n)` / `setText(t)` / `setMeta(app)` / `configure(patch, textCfg)` / `setConfig(patch, textCfg)` / `show()` / `hide()` / `done()` / `error(msg, detail)` / `destroy()` / `getState()`（共 13 个方法；无 `reset()`，重来用 `destroy()` 后重新 `create()`） |
| 单例 | `attach()` 接管页面既有 `#kui-boot`（只重建内部结构，不整层重建）；`create()` 可在任意容器内嵌（`mode: "inline"`） |
| 拆装 | `boot.js` 未加载时 `bootstrap.js` 退回 `index.html` 静态骨架（legacy 分支），不报错、不白屏 |
| 配置 | `config/app.json` 的 `boot` 段（enabled / mode / stages / clock / bar / meta / text） |
| 文案 | `config/text.json` 的 `boot` 段；`KUI.text("boot.*")` 可被 app.json `text` 覆盖 |

### 20.1 进度 → 时钟位姿（纯函数，可单测）

```
总分钟 totalMinutes = p / 100 * 720         // 12 小时 = 720 分钟
时针角度 hourAngle  = totalMinutes / 720 * 360   // 连续走，每分钟 0.5°
分针角度 minuteAngle = (totalMinutes % 60) / 60 * 360
```

- `0%` 与 `100%` 都指向 12 点整（读数统一显示 `12:00`，两针重合朝上）；
- `25% → 3:00`、`50% → 6:00`、`75% → 9:00`，可在 `boot.html` 的「按进度设置」里逐格核对；
- 指针平滑过渡由 `clock.smooth` 控制（CSS `transition`），关闭后逐格跳变。

### 20.2 bootstrap 接线（v1.3.8 完成）

- `boot()` 在 `text / themes / app` 加载完成、`i18n.set` 之后调用 **`applyBootConfig(appCfg, res.text)`**：
  1) `configureBootLayer(appCfg, textCfg)` → `KUI.bootLayer.configure(bootConfigOf(appCfg) || {}, textCfg.boot)`，让 `app.json` 的 `boot` 段真正生效；
  2) `boot.enabled === false` 时不创建启动层，已有实例 `destroy()`；
  3) 应用后的快照写入 `KUI.boot.appliedBootConfig`（便于冒烟/控制台核对）。
- 历史（v1.3.7 及更早）：只调 `attachBootLayer(null)`，`appCfg.boot` 与 legacy `app.loading` 均未被消费（见 §20.3.3 与 CHANGELOG v1.3.8）。
- 其它既有约定不变：`ensureBootLayer()` 接管静态骨架、`setBootText / setBootStep / hideBoot / showBootError` 优先委派实例、`applyAppMeta()` 同步 `inst.setMeta(app)`、阶段默认 `8% / 46% / 78% / 100%`。

- `boot()` 开始时 `ensureBootLayer()`：有组件则 `attach()`（接管静态骨架）并 `configure(app.boot, text.boot)`；无组件则保持 legacy；
- 原有 `setBootText / setBootStep / hideBoot / showBootError` 保留为对外函数，内部优先委派给组件实例（拆掉组件后行为回到 v1.3.6）；
- `applyAppMeta()` 同时调用 `inst.setMeta(app)`，品牌/副标题/首页标题改动即时反映到加载层；
- 阶段进度：`step1 → 8%`、`step2 → 46%`、`step3 → 78%`、`step4 → 100%`（可在 `boot.stages` 改）。

### 20.3 独立性要求

- `standalone/boot.html` 只引 `kui-all.js`（standalone profile）+ `theme-boot.js` + 必要样式，不引 app-shell / bootstrap；
- 同理 `boot.js` 不依赖 app-shell、不依赖 bootstrap，缺 `KUI.config` / `KUI.text` 时走内部默认值。

### 20.4 v1.3.8 配置接通性修复（同一类缺陷的收口）

本轮要求：「是否有配置字段无读取点、配置也不生效的」。审计结论与修复：

| 配置字段 | v1.3.7 状态 | v1.3.8 修复 |
| --- | --- | --- |
| `app.json` → `boot.*` | `configureBootLayer` 无调用点 | `applyBootConfig()` 接线，`appliedBootConfig` 可核对 |
| `app.app.version / logoIcon / logoText / copyright`，`menu.props.brand.logoText`，`menu.props.footer.subtitle / copyright` | 无读取点（页脚只剩 title/version/actions） | 新增 `applyAppMeta` 注入 + `menu.js` 渲染 `logoText` / `footer.subtitle` / `footer.copyright`（配 `components.css`） |
| `theme.picker.title / desc / columns / maskClosable / showPreview / showScheme` | 取 `KUI.text` 兜底、布局写死 | `openThemePicker` + `buildThemePickerNodes` 读取上述字段 |
| `ui.dialog.escClosable` | dialog 只认 `closeOnEsc` | `dialog.config()` 增加别名映射（`closeOnEsc` 显式优先） |
| `boot.clock.smooth` | 只存在默认值 | 写入 `data-boot-smooth`，CSS 关闭/开启 `.kui-boot__hand` 过渡 |
| `tabs.props.keepAlive` | 声明未使用 | `false` 时切回重建 iframe（`true` 保持保活语义） |
| `KUI.setStyle` 驼峰键 | **v1.3.8**：`gridTemplateColumns` 等驼峰键自动转 kebab 后写入；此前被 `CSSStyleDeclaration.setProperty` 静默忽略，导致容器内联样式（主题卡片列数、边框色）失效 |
| `dialog.config()` 返回值 | 深合并后未写回 `DEFAULTS` | 合并结果回写，`ui.dialog.*` 真正全局生效 |
| 节点 `class/style/attrs`（容器） | 无 `type` 的容器节点丢弃 style/attrs，`theme.picker.columns` 不生效 | `KUI.renderNode` 容器分支统一走 `decorate()` |
| 弹窗 `subtitle` | `dialog-frame` 从不渲染该字段（`theme.picker.desc` 丢失） | `renderSubtitle()` + `.kui-dialog__subtitle` 样式 |

验证：`tools/audit-config.js`（静态核对 `config/app.json` 全部叶子键的读取点）；`tools/smoke.js` `[28]`；`test/config.test.js` 用例 5；`test/render.test.js` keepAlive 用例。
## 21. v1.3.9 配置接线补强

| 字段 / 能力 | 此前 | v1.3.9 |
| --- | --- | --- |
| `menu.props.width` / `collapsedWidth` | 只写无人消费的 `--kui-menu-w` | 写 `--kui-menu-width(-collapsed)`；app-shell 优先读 props，回退 `layout.menu.*` |
| `menunav.props.breadcrumb.max` | 只合并进 `breadcrumb` 对象，无读取点 | `normalizeProps` 归一为 `maxBreadcrumb`（两条 create 路径均生效） |
| `dialogs.settings.desc/draggable/layout` | `openSettings` 不透传 | 透传给 `KUI.dialog.form` |
| 设置弹窗保存 | 只认 `theme/collapsed/motion` | `KUI.boot.applySettings`：`shellName/defaultTheme/startTab/remember/density` + 旧字段；`boot()` 启动恢复 |
| `boot.ready` | 无读取点 | 主流程末尾显示「准备就绪」文案 |
| `select/multiselect.autofocus` | 传 `ctx` 给只认 node 的 `p()`，恒 false | 改传 `node`，渲染后聚焦 |

新增公开 API：`KUI.boot.applySettings(app, values)`；持久化键：`kui-shell-name / kui-start-tab / kui-remember-tab / kui-last-tab / kui-density`。

验证：smoke `[29]` 四组、`test/run.js` 33 项、`tools/audit-config.js` 0 缺口、真实浏览器设置弹窗保存生效。

## 22. 数据表格组件（datatable，v1.4.0 新增）

**文件**：`src/components/datatable.js`（注册 + 渲染 + 实例 API）、`src/styles/datatable.css`（全部样式走 `--kui-*` token）。

**注册**：`type = 'datatable'`，`category = 'data'`（与 `table`/`pagination` 同属数据类控件，不计入 19 个表单控件）；`KUI.datatable.version = '1.0.0'`。依赖 core（`KUI.h`/`KUI.registry`/`KUI.icons`/`KUI.text`/`KUI.bus`），不依赖 menu/tabs/dialog，可独立挂载。

**静态入口**：`KUI.datatable.create(host, props[, ctx])` 返回实例；`KUI.datatable.get()` 取最近创建的实例；`KUI.datatable.defaults` 为默认配置；其余方法以 `KUI.datatable.<方法>` 委托到最近实例。

**props（节选，全部可省略）**：

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `columns` | array | `[]` | 列定义：`key/title/width/minWidth/align/sortable/filter/format/formatOptions/dict/hidden/headerTip/className` |
| `data` / `rows` | array | `[]` | 行数据（`rows` 为兼容别名） |
| `rowKey` | string | `'id'` | 行唯一键字段；选择、行点击、跨页保持都用它 |
| `size` | string | `'md'` | `sm/md/lg` 三档行高 |
| `bordered` / `striped` / `hoverable` / `compact` | bool | `false/true/true/false` | 外观开关 |
| `height` / `maxHeight` | number | `0` | 固定表体高度（滚动 + 表头吸附），0 = 自动 |
| `showIndex` | bool | `false` | 序号列 |
| `search` | object | `{enabled:true,placeholder:'',width:240,keys:[]}` | 全局搜索；`keys` 缺省时搜索全部列 |
| `filter` | object | `{enabled:true,columns:true,clearable:true}` | 列筛选行开关 |
| `sort` | object | `{enabled:true,mode:'single',default:[]}` | `mode=single/multi`；`default` 形如 `[{key,order:'asc'\|'desc'}]` |
| `selection` | object | `{mode:'none',showSelectAll:true,selectOnRowClick:true,keepAcrossPages:true,selectAllScope:'page'}` | `mode=none/single/multi`；`selectAllScope=page\|all` |
| `pagination` | object | `{enabled:true,pageSize:10,pageSizes:[10,20,50,100],showTotal:true,showSizer:true,showJumper:true,maxButtons:7}` | 分页 |
| `rowHighlight` | bool | `true` | 行点击高亮 |
| `rowClickAction` | object | `null` | 行点击时执行的动作（`{action:'...'}`，走 `KUI.actions`） |
| `toolbar` | object | `{enabled:true,title:'',subtitle:'',actions:[],actionsAlign:'right'}` | 工具栏：标题/副标题/动作按钮 |
| `columnsToggle` / `densityToggle` / `refresh` / `export` | bool | `true/true/false/false` | 列设置、密度切换、刷新、导出 CSV |
| `selectionInfo` / `keyboard` | bool | `true/true` | 选中计数、键盘操作（↑↓ 移动、空格选择、Enter 触发行动作） |
| `text` | object | `{}` | 覆盖内置文案（如 `{empty, loading, selected, columns, density}`） |

**列格式（`format`）**：`text` / `number` / `date` / `boolean` / `tags` / `badge` / `dict` / `link` / `progress` / `code` / `ellipsis` / `actions`（行内动作列）；`dict` 传入 `{value: label}` 映射，`format` 为 `dict` 或提供 `dict` 时均生效；文本与表头统一用 `.kui-datatable__text` / `.kui-datatable__th-text` 承载，保证换肤一致。

**实例 API**：`setData/getData/getRows/getFilteredRows`、`setColumns/getColumns/setColumnVisible`、`setKeyword/setFilter/getFilter/clearFilters`、`setSort/getSort`、`setPage/getPage/setPageSize/getPageSize`、`getSelection/getSelectedKeys/getSelectedRows/setSelection/clearSelection/selectAll/clearAllSelection`、`setActive/getActive`、`setLoading/setDensity/getDensity/setToolbarTitle`、`refresh/exportCsv/getState/getConfig/on/off/destroy`。

**事件**：`api.on(name, fn)` 订阅，同时 `KUI.bus.emit('datatable:'+name, payload)`；name 为 `ready / refresh / sort / filter / page / action / destroy`。

**拆装**：从 `config/kui-modules.json` 的 `profiles.*.files` 移除 `src/components/datatable.js` 并重跑 `npm run build:config` 即可整体下架；此时 JSON 中 `{ "type": "datatable" }` 节点会渲染为未注册类型占位块，其余组件不受影响。单独页面使用时只需 `base.css + datatable.css + boot.js 之前的 core + datatable.js`，`KUI.datatable.create(host, props)` 手动挂载。

**验证**：smoke `[30]` 三组；`test/run.js` 的 datatable 渲染/交互用例；`tools/audit-components.js` 的拆解矩阵；真实测试页 `standalone/datatable.html`。

## §23 未消费资产审计（v1.4.1）

**约定**：框架声明的每个字段、样式、函数、API 都必须有真实读取点；新增「只写不读」的声明视为缺陷。

| 工具 | 命令 | 覆盖 |
| --- | --- | --- |
| `tools/audit-unused.js` | `node tools/audit-unused.js [--strict] [--json]` | storage 键 / CSS 变量 / `data-*` 属性 / 死函数 / 未引用样式类 |
| `tools/audit-config.js` | `node tools/audit-config.js` | `config/app.json` 叶子字段的代码读取点 |
| `tools/audit-consistency.js` | `npm run audit:consistency` | 清单 / 常量 / 动作 / 路径 / 顺序 |

**门禁**：`npm run audit` 依次运行 consistency → components → unused（严格模式），任一失败即退出码非 0；`tools/smoke.js` `[31]` 同步断言 ERROR/WARN 为 0。

**维护规则**：
1. 新增配置字段必须在 `src/` 有读取点，并更新对应文档；
2. 新增 CSS token 必须在样式里 `var()` 使用，或写入 `themes.json`；
3. 新增 `data-*` 必须至少被 CSS 或 JS 读取；
4. 有意保留但静态扫描无法判定的项，加入 `tools/audit-unused.js` 的 `ALLOW` 并写明原因，**不要放宽正则**；
5. 删除功能时同步删除其样式类、token、data 属性与函数，避免再次出现「只写不读」。

**存储读取优先级（v1.4.1 起）**：`avatar.persist` 为真时，`localStorage[storageKey]` 中的用户选择优先于配置 `url`；清除存储后回退配置。

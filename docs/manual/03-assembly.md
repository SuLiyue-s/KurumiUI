# 03 · 组装

> 适用版本：KurumiUI v1.4.3 ｜ 前置章节：02-build.md ｜ 阅读时长：约 16 分钟

一个 KurumiUI 页面 = 几个 `<link>` + 一个 `<script>` + 一到两个挂载点。本章拆开 `index.html`，讲清单入口 `kui-all.js` 如何注入模块、`bootstrap.js` 如何四步起界面，并给 5 种装配配方。

## 本章目标

- 逐段解释 `index.html`（163 行）每个区块，知道顺序为什么不能改。
- 理解 `kui-all.js` 的 `MODULES` 清单与 `app` / `standalone` 两份 profile。
- 说清启动时序：`theme-boot` → `kui-all` 注入 → `bootstrap` → `app-shell` → 配置 → 首屏。
- 会按场景选 5 种配方，并区分 `standalone/*.html` 与 `pages/*.html`。
- 能按常见错误表定位白屏、无壳、样式错乱、主题闪烁。

## 1. 装配模型：一个入口 + 两份清单

页面只留一行入口，加载什么由清单决定：

```html
<script src="src/core/kui-all.js" data-kui-profile="app"></script>
```

`src/core/kui-all.js`（50 行，自动生成，勿手改；来源 `config/kui-modules.json` + `tools/build-all.js`）只做四件事：

| 行为 | 位置 | 说明 |
| --- | --- | --- |
| 内嵌清单 | `:8` | `MODULES` 常量，schema `kui-modules/1` |
| Node 可读 | `:11` | 有 `module` 时直接导出，测试与浏览器同源 |
| 推根前缀 | `:16-19` | 读 `currentScript.src` 得 `/` 或 `../` |
| 选 profile | `:20-22` | 缺省 `standalone`；名字不存在时回退 `standalone` |

解析期（`readyState === "loading"`）用 `document.write` 同步写回清单，顺序等同手写（`:24-32`）；动态插入时改串行 `onload/onerror`，全部完成后在 body 派发 `kui:all-ready`（`:34-49`）。正常页面走解析期，**不会**触发该事件——等就绪请用 `KUI.boot()` 或 `boot:done`。

### 1.1 两份 profile

`app` 30 个文件，`standalone` 29 个（`config/kui-modules.json`，v1.4.0 起各含 `datatable.js`）。

| 对比项 | `app` | `standalone`（缺省） |
| --- | --- | --- |
| 用户 | 主应用 `index.html` | `standalone/*`、`pages/*`、自定义页 |
| 组件/控件/表单 | 完整 | 完整 |
| `app-shell.js` / `bootstrap.js` | 有 | 无 |
| `frame/kui-frame.js` | 无 | 有 |
| 默认行为 | 自动建壳并启动 | 不建壳，页面自己挂载 |

最常见的「装错」：主应用漏写 `data-kui-profile="app"`，`#kui-app` 永远空着。清单顺序固定：`config/bundle.js` 第一（file:// 兜底），core 打底，再控件、表单、组件（含 `boot` 加载层），最后外壳与启动器（清单见 `index.html:42-51` 的注释，入口在 `:51`）。

## 2. index.html 逐行解剖

| 行号 | 内容 | 作用 |
| --- | --- | --- |
| 2 | `data-kui-boot="loading"` | 启动状态钩子，完成后改为 `done`（`bootstrap.js:1028`） |
| 4-5 | `theme-boot.js` | head 第一个元素、所有样式之前，防 FOUC |
| 6-11 | meta/title/icon | viewport 带 `viewport-fit=cover`；`theme-color` 同 `--kui-bg-0` |
| 14-17 | 4 个基础样式表 | 顺序固定 `base → controls → components → tooltip` |
| 20 | `boot.css` | v1.3.8 起启动层样式独立成文件（v1.3.6 是内联在 `index.html` 里） |
| 25 | `#kui-app` | 应用挂载点，脚本会在里面建 menu + menunav + tabs |
| 28-36 | `#kui-boot` 静态骨架 | 启动层降级用：logo 齿轮 + 标题/副标题 + 进度条 + `[data-boot-text]` 文案 |
| 38-40 | `<noscript>` | 禁用 JS 提示 |
| 42-50 | 加载顺序注释 | 6 步顺序说明（配置包 → core → 控件 → 表单 → 组件含 boot → 外壳与启动器） |
| 51 | 入口 `<script data-kui-profile="app">` | 29 个模块由 `kui-all.js` 注入 |

### 2.1 theme-boot.js 为什么必须第一个

`src/core/theme-boot.js:4-20` 注释点明原因：换肤后新开的标签/弹窗 iframe 是全新文档，`base.css` 的 `:root` 默认 kurumi，等父级 `theme:apply` 才切会「先闪别的主题」。它是同步脚本、在首个样式表前执行：同源嵌入时读父级 `KUI.theme.currentId()/currentTokens()` 写成内联变量（`:28-41`、`:53-67`，跨域静默降级）；独立打开时读 `localStorage`（key 可由 `<html data-kui-theme-key>` 指定，否则 `kui-theme`，`:43-51`）；结果存 `window.__KUI_EARLY_THEME__` 供 `theme.js` 优先用（`:85-88`），放晚了必闪。

### 2.2 CSS 顺序为什么固定

| 顺序 | 文件 | 体积 | 职责 |
| --- | --- | --- | --- |
| 1 | `styles/base.css` | 39,982 B | `:root` 默认 token、reset；`:2` 用 `@import` 带入 avatar.css |
| 2 | `styles/controls.css` | 102,806 B | 元素控件，消费第 1 步的 `--kui-*` |
| 3 | `styles/components.css` | 60,184 B | menu/menunav/tabs/dialog/toast 布局材质 |
| 4 | `styles/tooltip.css` | 2,982 B | 提示层，需覆盖前面层叠，放最后 |
| 5 | `styles/boot.css` | 10,252 B | v1.3.8 起启动层样式（组件渲染 + 静态降级骨架） |
| 6 | `styles/avatar.css` | 5,447 B | 由 `base.css:2` `@import`，HTML 不写 |

顺序错的两个后果：`components.css` 提到 `controls.css` 前，组件对控件基础类的覆盖失效；`base.css` 放最后，变量后定义，前面规则只能吃内联兜底色。

### 2.3 启动层与挂载点

v1.3.8 起启动层样式在 `src/styles/boot.css`（`index.html:20` 引入，约 10 KB），不再内联在 HTML 里。`index.html:28-36` 只保留一份**静态降级骨架**：`#kui-boot`（`logo` 齿轮 + 标题 + 副标题 + 进度条 + `[data-boot-text]` 文案）；`boot.js` 随 `kui-all.js` 加载后，`bootstrap.js` 调 `KUI.bootLayer.attach()` 接管该节点并重建内部（logo 换成时钟表盘，见 [16-boot.md](16-boot.md) §4.2）。显隐开关：`.kui-boot.is-done{opacity:0;visibility:hidden;pointer-events:none}`（`boot.css:41-53`）；`hideBoot()`（`bootstrap.js:111-123`，在 `:1031` 被调用）加该类并在延迟后移除节点。

挂载点 `autoBoot()` 两种写法都认（`bootstrap.js:1060-1069`）：`<div id="kui-app" data-kui-app="true"></div>`。`app-shell.create()` 会先清空 host 再放骨架（`app-shell.js:530-533`、`:167-180`）：左侧 `aside`（menu）、右侧 `main`（header 放 menunav、center 放 tabs）。别把手写页头页脚塞进 `#kui-app`，启动时会被清掉。

### 2.4 最小可运行主应用

启动层样式来自 `src/styles/boot.css`（v1.3.8 起独立文件，不再内联），骨架如下：

```html
<!DOCTYPE html>
<html lang="zh-CN" data-kui-boot="loading">
<head>
  <script src="src/core/theme-boot.js"></script>
  <meta charset="utf-8">
  <title>我的 KurumiUI 应用</title>
  <link rel="stylesheet" href="src/styles/base.css">
  <link rel="stylesheet" href="src/styles/controls.css">
  <link rel="stylesheet" href="src/styles/components.css">
  <link rel="stylesheet" href="src/styles/tooltip.css">
  <link rel="stylesheet" href="src/styles/boot.css">
</head>
<body>
  <div id="kui-app" data-kui-app="true"></div>
  <div id="kui-boot" class="kui-boot" role="status" aria-live="polite">
    <div class="kui-boot__inner">
      <div class="kui-boot__logo" aria-hidden="true"></div>
      <div class="kui-boot__title">KurumiUI</div>
      <div class="kui-boot__sub">CONFIG-DRIVEN UI FRAMEWORK</div>
      <div class="kui-boot__bar"><span></span></div>
      <div class="kui-boot__text" data-boot-text>正在加载界面配置…</div>
    </div>
  </div>
  <script src="src/core/kui-all.js" data-kui-profile="app"></script>
</body>
</html>
```

正式项目把 `:6-11` 的 meta 与 `src/styles/boot.css` 一并复制，否则只剩文字提示。前提是 `src/core/kui-all.js` 与 `config/bundle.js` 已生成（`.gitignore` 忽略，`npm run build` 产出）。

## 3. 启动时序

`theme-boot.js` 同步执行 → `kui-all.js` 在解析期用 `document.write` 注入 29 个 `<script>` 并同步执行 → `DOMContentLoaded` 后 `autoBoot()` → `KUI.boot()` 四个阶段（配置 → 主题 → 外壳 → 收尾）→ `boot:done`。

| 步骤 | 位置 | 发生什么 | 可观察结果 |
| --- | --- | --- | --- |
| 0 判定 | `bootstrap.js:1060-1069` | `body[data-kui-auto="false"]`、`KUI.boot.disabled`、找不到挂载点时退出 | 页面不自动接管 |
| 1 配置 | `bootstrap.js:967-994` | `attachBootLayer(null)` 接管启动层；`config.loadMany(['text','themes','app'])`；注入 i18n；缺 `app.json` 抛错；`applyAppMeta`、`applyBootConfig`（v1.3.8 接线）、`applyUiConfig`、`applyAppMetaToConfig` | 阶段 1（8%）→ 标题/副标题/启动层配置生效；缺配置见错误块 |
| 2 主题 | `bootstrap.js:996-1009` | `setBootStep(2)`；`theme.init(themes,{fallbackId,storageKey:'kui-theme',persist})` | 阶段 2（46%），`html[data-kui-theme]` 生效 |
| 3 外壳 | `bootstrap.js:1010-1021` | `setBootStep(3)`；`KUI.app.create(host,appCfg,{initialTabs})`；`applyStoredPrefs`（v1.3.9：终端名/密度/启动页/记住上次标签）；注册 `app.*` 动作 | 阶段 3（78%），menu/menunav/tabs 出现 |
| 4 收尾 | `bootstrap.js:1022-1051` | `setBootStep(4)`、`boot.ready` 文案、`body.kui-ready`、`data-kui-boot="done"`、`hideBoot()`、`boot:done`、错误时 `boot:error` | 阶段 4（100%）→ 启动层淡出；`KUI.boot.ready()` 为 true |

初始标签取值：`opts.initialTabs` → `tabs.props.initial`/`tabs.props.tabs` → 都无则开 `tabs.props.home`（`app-shell.js:539-550`）；`app.json` 的 `tabs.props.home.url` 是 `pages/home.html`（`config/app.json:11`）。

### 3.1 三种「就绪」信号

动态插入时才有 `kui:all-ready`（`kui-all.js:34-49`）；`KUI.bus` 的 `boot:done` 在四步完成后触发，参数 `{app,cost}`（`bootstrap.js:1043`）；`KUI.boot()` 返回 Promise，resolve 为 app（`bootstrap.js:1071-1085`），业务脚本用它等外壳就绪。

启动失败时 `showBootError(msg, stack)`（`bootstrap.js:125-154`）在启动层渲染原因、建议与「重新加载」按钮，并发 `boot:error`（`bootstrap.js:1051`）。

## 4. 五种装配配方

### 4.1 完整主应用

**适用**：后台、桌面工具主界面。**体积**：29 模块 + 约 212 KB CSS。**代价**：单实例，结构全靠 `app.json`。代码见 §2.4；要官方加载动画就把 `index.html` 的 `#kui-boot` 骨架与 `src/styles/boot.css` 一起引入（或直接用组件 `KUI.bootLayer.attach()`）。

### 4.2 单组件独立页（standalone）

**适用**：组件文档、验收页、可分享示例。**体积**：28 模块。**代价**：无壳，布局自己写；主题要手动初始化且用独立 `storageKey`。结构同 `standalone/controls.html`：head 首行 `theme-boot.js`，随后 4 个样式表；`<body data-kui-auto="false">`（`:42`）；末尾先 `embedded.js` 再 `kui-all.js`（`:70-71`）。

```html
<!DOCTYPE html>
<html lang="zh-CN"><head>
  <script src="../src/core/theme-boot.js"></script>
  <meta charset="utf-8"><title>单组件页</title>
  <link rel="stylesheet" href="../src/styles/base.css">
  <link rel="stylesheet" href="../src/styles/controls.css">
  <link rel="stylesheet" href="../src/styles/components.css">
  <link rel="stylesheet" href="../src/styles/tooltip.css">
</head><body data-kui-auto="false">
  <div id="host"></div>
  <script src="../src/core/kui-all.js" data-kui-profile="standalone"></script>
  <script>
  KUI.config.load('themes').then(function (data) {
    KUI.theme.init(data, { fallbackId: 'kurumi', storageKey: 'kui-demo-theme', persist: true, silent: true });
    var btn = KUI.renderNode({ type: 'button', props: { text: '点我', variant: 'primary' } }, null);
    btn.addEventListener('click', function () { KUI.dialog.alert({ title: '提示', message: '单组件页弹窗' }); });
    document.getElementById('host').appendChild(btn);
  });
  </script>
</body></html>
```

`data-kui-auto="false"` 不是必需（standalone 无 bootstrap），但可防以后加错 profile 被自动接管。

### 4.3 手工拼装指定模块

**路线 A（推荐）：自定义 profile。** 在 `config/kui-modules.json` 的 `profiles` 加桶，`npm run build:config` 重建，页面写 `data-kui-profile="minimal"`：

```json
{
  "profiles": {
    "minimal": {
      "desc": "只要控件 + 弹窗 + 提醒",
      "files": ["config/bundle.js", "src/core/kui.js", "src/core/tooltip.js", "src/core/icons.js", "src/core/registry.js", "src/core/config.js", "src/core/theme.js", "src/core/dom-enhance.js", "src/components/controls/index.js", "src/components/dialog.js", "src/components/toast.js"]
    }
  }
}
```

裁剪依据：`kui.js` 命名空间底座、`registry.js` 管 type→构造器、`config.js` 读 JSON、`theme.js` 才有 token、`controls/index.js` 一次装齐控件、dialog/toast 依赖 registry 与 dom-enhance。改完跑 `npm test`（30 项）与 `npm run audit:components`（17 项）。

**路线 B：手写 script 顺序。** 真实范例是 `src/frame/dialog-frame.html:225-235`：`kui.js → tooltip → icons → registry → config → theme → theme-art → dom-enhance → controls/index → form → 自身脚本`。注册表之前调 `KUI.renderNode` 会得到「未注册的元素类型」。`standalone/no-shell.html` 演示不用外壳：把 `app.json` 的 `menu`/`menunav`/`tabs` 节点各自 render 后 append 到 Grid 槽位（`:166-197`），因页面在子目录，tabs 复制节点后补 `props.urlPrefix='../'`（`:189`）。

**代价**：依赖由你保证；框架升级新增模块不会自动进清单；手写顺序漏一个就半页不工作。

### 4.4 iframe 嵌入整个应用

**适用**：把后台作为他站模块，隔离 CSS 与全局变量。**体积**：同主应用。**代价**：双滚动、外层拿不到内层路由、跨域主题继承失效（`theme-boot.js:37-40` 降级）。

```html
<iframe src="https://ui.example.com/kurumi/index.html" title="KurumiUI"
  style="width:100%;height:760px;border:0;display:block" loading="lazy"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"></iframe>
```

sandbox 去掉 `allow-same-origin` 会让 `localStorage` 抛异常，主题与折叠状态无法记忆（框架已 try/catch，不崩但每次回默认）。整应用通信只能 `postMessage`；`KUI.frame` 是给 `pages/*` 用的。高度自适应无通用方案（`heightAuto()` 只作用业务页，`kui-frame.js:804-806`），建议固定高度。

### 4.5 无壳 embedded.js 模式

**适用**：`standalone/*.html` 既单独演示，又被主应用标签 iframe 嵌入（`config/app.json:381` 起的菜单项都指向 standalone）。**体积**：+3,524 B。**代价**：只收拾「演示外壳」，不改业务能力。

`standalone/embedded.js:10-77`：检测 `window.parent !== window`（跨域也算）；给 `<html>` 加 `data-kui-embedded`、`<body>` 加 `is-embedded`；注入 CSS 隐藏 `.demo-nav`、`.demo-bar__ops label`、主题选择器；追加徽标「已嵌入主应用 · 菜单/主题由外层接管」。放在 `kui-all.js` 之前（`standalone/controls.html:70-71`）：

```html
<script src="embedded.js"></script>
<script src="../src/core/kui-all.js" data-kui-profile="standalone"></script>
```

选型看三件事：外壳、独立部署、隔离样式。

## 5. standalone 与 pages

`standalone/` 11 个 HTML，`pages/` 7 个，都用 standalone profile，但定位不同。

| 对比项 | `standalone/*.html` | `pages/*.html` |
| --- | --- | --- |
| 定位 | 独立渲染页：单组件/主题演示 | 业务页：跑在标签 iframe 内 |
| 消息桥 | 可选 `embedded.js` | 必须 `../src/frame/kui-frame.js` |
| 主题 | 自己 `theme.init`，`storageKey` 常为 `kui-demo-theme` | 父级 `tab:init` 下发 + `theme:apply` 广播，`theme-boot` 首帧预置 |
| 打开方式 | 直接访问，或被菜单 iframe 打开 | tabs 以 iframe 打开（`tab:init` → `frame:ready`） |
| 导航 | 页内 `.demo-nav` 互跳 | `KUI.frame.navigate()` 请求父级开标签 |

### 5.1 kui-frame.js 提供什么

`src/frame/kui-frame.js`（830 行）是业务页 SDK，头注释 `:1-22` 列消息方向：父→子 `tab:init / tab:before-close / tab:refresh / theme:change / tab:activate`；子→父 `frame:ready / frame:title / frame:dirty / frame:toast / frame:dialog / frame:close / frame:height / frame:navigate`；回执 `frame:dialog-result`。入站消息校验 `event.source === window.parent`；`postMessage` 用 `targetOrigin='*'`，因为要支持 file:// 与任意 host（`:19-21`、`:104-115`）。

| API | 作用 | 未嵌入时 |
| --- | --- | --- |
| `ready(fn)` | 等父级 `tab:init` 后执行，会重试 `frame:ready` | 退化为 DOMContentLoaded |
| `setTitle` / `setDirty` | 标题、未保存标记 | 改 `document.title` / 只记本地 |
| `toast(...)` | 请求父级弹提醒 | 回退本地 `KUI.toast`，再回退 console |
| `dialog.alert/confirm/prompt/form/open` | 父页面弹窗，Promise 返回结果 | 回退原生 alert/confirm/prompt |
| `navigate({id,title,url,icon})` | 请求父级开新标签 | `location.href = url` |
| `close` / `refresh` | 关标签 / 刷新 | 刷新走 `location.reload()` |
| `theme()` / `onTheme` / `setTheme(id)` | 读主题、监听换肤、请求全局换肤 | 本地应用 |
| `getTab()` / `action(name,params)` | 标签信息 / 请求父级执行动作（30s 超时） | 本地状态 / 返回 null |

版本自愈：`tab:init` 带 `parentVersion`（`tabs.js:1106-1119`），子页发现与 `KUI.version` 不一致就带 `kui_v=<父版本>` `location.replace` 一次，`sessionStorage` 记账防死循环（`kui-frame.js:80-102`）。

### 5.2 业务页骨架

以 `pages/home.html` 为模板（菜单项见 `config/app.json:235-253`）：

```html
<!DOCTYPE html>
<html lang="zh-CN"><head>
  <script src="../src/core/theme-boot.js"></script>
  <meta charset="utf-8"><title>我的业务页</title>
  <link rel="stylesheet" href="../src/styles/base.css">
  <link rel="stylesheet" href="../src/styles/controls.css">
  <link rel="stylesheet" href="../src/styles/components.css">
  <link rel="stylesheet" href="../src/styles/tooltip.css">
</head><body>
  <main id="main" style="padding:18px"></main>
  <script src="../src/core/kui-all.js" data-kui-profile="standalone"></script>
  <script src="../src/frame/kui-frame.js"></script>
  <script>
  KUI.frame.ready(function () {
    KUI.frame.setTitle('我的业务页');
    var btn = KUI.renderNode({ type: 'button', props: { text: '打开资料页' } }, null);
    btn.addEventListener('click', function () {
      KUI.frame.navigate({ id: 'profile', title: '资料页', url: '../pages/profile.html', icon: 'user' });
    });
    document.getElementById('main').appendChild(btn);
  });
  </script>
</body></html>
```

要点：`theme-boot` 必须在样式表前；未嵌入时 `ready()` 退化为 `DOMContentLoaded`、`navigate()` 回退 `location.href`，所以不必自己写兜底；业务页无需 `data-kui-auto="false"`——没有 `#kui-app` 时 `autoBoot()` 自动跳过（`bootstrap.js:1060-1069`）。

### 5.3 dialog-frame.html / dialog-frame.js

`src/frame/dialog-frame.html`（237 行）+ `dialog-frame.js`（58,841 B）是「弹窗 iframe 内部文档」：被父页面以 iframe 打开，专承载弹窗内容，不打断业务页表单状态。

- `<html ... data-kui-dialog-frame="true">`（`:2`），body 为 `kui-dialog-body`（`:211`），根节点 `#kui-dialog[data-dialog-root]`（`:212`），内部按 `data-dialog-header/icon/title/close/body/footer` 分区（`:213-221`）——这些 `data-*` 是 `dialog-frame.js` 的挂载契约。
- 样式仍 `base → controls → components → tooltip`（`:11-14`），路径按 `src/frame/` 深度写；body 背景透明；`clip-path` 曾导致输入卡顿的教训记在 `:39-41`。
- **不经过 kui-all**，逐引 11 个脚本（`:225-235`）：core 七件 + `controls/index.js` + `form.js` + 自身；`theme-boot.js` 仍在 head 第一个（`:5`），保证弹窗打开即当前主题。

自定义弹窗 iframe 照抄这份脚本清单与 `data-dialog-*` 契约，比从 kui-all 起步更省体积。

## 6. 多页应用组织

```
index.html       # 唯一主应用入口（profile=app）
pages/           # 7 个业务页，跑在标签 iframe 内
standalone/      # 13 个独立页 + embedded.js
config/app.json  # 菜单/导航/标签，url 一律相对项目根
```

`app.json` 的 URL 从「根」写：`pages/home.html`、`standalone/controls.html`（`config/app.json:247`、`:381`），不带 `../`；http(s) 下 tabs 自动追加 `kui_v=<版本>` 做缓存穿透（`tabs.js:440-442`）。子目录页里才需要 `urlPrefix:'../'`（`standalone/no-shell.html:189`、`tabs.js:434-436`）。

iframe 两层：`index.html` → `#kui-app` → 每标签一个固定 iframe。保活：`createPane()` 只建 pane+iframe、**不设 src**，首次 activate 才设（`tabs.js:396-415`）；未打开的标签不耗请求，切换只改 `hidden` 与 `.is-active`。

新增业务页：复制 `pages/home.html` 改名 → `config/app.json` 加菜单/标签项（`url:"pages/mypage.html"`）→ 交互用 `KUI.frame.*`，初始化包 `frame.ready(fn)` → 跑 `node tools/audit-all-pages.js`。通信四层（详见 `11-api-messaging.md`）：`KUI.bus`；父↔业务页 `postMessage`；父↔弹窗 iframe `frame:dialog`/`frame:dialog-result`；页内 `frame.on/emit`。

## 7. 常见错误与排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 白屏，`KUI is not defined` | `kui-all.js` 404（构建产物被 .gitignore，未生成） | `npm run build`，确认文件存在 |
| `#kui-app` 永远为空 | 漏 `data-kui-profile="app"`，走默认 standalone | 补 profile；回退逻辑见 `kui-all.js:20-21` |
| 自定义 profile 不生效 | 名字不存在时静默回退 standalone | 名字写进 `kui-modules.json` 并 `npm run build:config` |
| 主题闪默认配色 | `theme-boot.js` 不在 head 第一个 | 移到 `<head>` 第一行（`index.html:5`） |
| 控件样式错乱、颜色是兜底色 | 样式顺序乱或漏 `base.css` | 严格 `base→controls→components→tooltip`；avatar 别另引 |
| 双击 index.html 报「未找到 config/app.json」 | file:// 不能 fetch，且无 `config/bundle.js` | `npm run build:config`，或 `npm start` 走 http |
| 业务页嵌入后按钮无反应 | 用了 `location.href` 或没等 `frame.ready` | 改 `frame.navigate()`，初始化放进 ready 回调 |

## 8. 本章自检

```bash
# 一次校验：两份 profile 文件数、首项兜底包、与 kui-modules.json 是否一致
node -e "var m=require('./src/core/kui-all.js'),a=require('./config/kui-modules.json');console.log('app',m.profiles.app.files.length,'standalone',m.profiles.standalone.files.length);console.log('first',m.profiles.app.files[0]);console.log('same',JSON.stringify(a.profiles)===JSON.stringify(m.profiles))"
```

Windows 下同一行命令直接在 PowerShell 运行。预期输出：

```
app 29 standalone 28
first config/bundle.js
same true
```

## 参考源码

- `index.html:1-163` 与 `src/core/theme-boot.js:1-89` —— 主应用装配范本（启动状态、CSS 顺序、启动层、挂载点、唯一入口）；首帧主题预置（父级/本地读取、内联 token、`__KUI_EARLY_THEME__`）。
- `src/core/kui-all.js:1-50` —— 单一入口：清单、profile 选择、`document.write` 注入、`kui:all-ready`。
- `src/app/bootstrap.js:955-1054`、`:1060-1085` —— 四步启动、错误处理、自动启动条件与 `KUI.boot` API；配置加载见 `src/core/config.js:25-80`、`:147-212`。
- `src/components/app-shell.js:136-209`、`:530-561`；`src/components/tabs.js:396-444`、`:1095-1131` —— DOM 骨架、初始标签、iframe 保活与 `tab:init` 载荷。
- `src/frame/kui-frame.js:1-120`、`:762-817` —— 消息约定、`postMessage` 封装、完整 API。

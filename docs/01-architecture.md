# 01 · 架构说明（KurumiUI）

> 配套契约：[`docs/00-contract.md`](./00-contract.md)。本文说明**为什么这么分层**、数据如何流动、
> 每个验收要求落在哪一层实现。改代码前请先读本文，改配置请看注释与 [`06-config-guide.md`](./06-config-guide.md)。

## 1. 设计目标与约束

| 要求 | 落地方式 |
| --- | --- |
| 配置驱动：调 UI 只改 JSON | 三层数据：`config/app.json`（结构）+ `config/text.json`（文案）+ `src/themes.json`（外观 token）；渲染代码里不出现文案与色值 |
| 组件可拆解、可独立渲染 | 每个组件都注册进 `KUI.registry`，有统一的 `create(host, props, ctx)` / 实例 API / 事件；`standalone/` 下每个组件一个独立页面 |
| 主体 iframe 保活 | `tabs` 组件为每个标签创建**固定 pane + 固定 iframe**，首次激活才赋 `src`，之后只切 `hidden` / `.is-active` |
| 弹窗也是 iframe | `dialog` 组件为每个弹窗创建独立 `<iframe src="src/frame/dialog-frame.html">`，父子通过 postMessage 通信 |
| 表单控件按依赖显隐 | `form` 提供 `node.deps` 求值引擎，控件只负责渲染与事件 |
| 主题可切换、默认狂三风 | `base.css` 只写结构与 token 引用；`themes.json` 覆盖 token；`theme-art.js` 渲染装饰层 |
| Node 13.14 兼容 | 全项目 ES5 级语法（无 `?.` `??` `#私有字段` 等）+ 传统 `<script>`；真实 Node 13.14 跑测试 |

## 2. 分层

```
┌─────────────────────────────────────────────────────────────┐
│ 配置层（不改代码可改的部分）                                  │
│   config/app.json   结构、菜单、标签、弹窗内容、动作           │
│   config/text.json  全部界面文案（供 KUI.text 键值）           │
│   src/themes.json   6 套主题的 token + 装饰层描述              │
│   config/demos/*    各 standalone 页面的演示配置               │
└───────────────────────────┬─────────────────────────────────┘
                            │ KUI.config.load()
┌───────────────────────────▼─────────────────────────────────┐
│ 核心层 src/core                                             │
│   kui.js        命名空间 / 工具 / DOM / 事件 / 动作分发 / 渲染调度 │
│   icons.js      内联 SVG sprite（约 90 图标）                │
│   registry.js   控件注册表：type → render/api/mounted        │
│   config.js     JSON 加载（fetch → bundle.js → null）        │
│   theme.js      主题注册、应用 token、广播到 iframe           │
│   theme-art.js  装饰层（齿轮/时钟/羽毛/网格/光晕…）           │
└───────────────────────────┬─────────────────────────────────┘
                            │ KUI.registry.register / KUI.mount
┌───────────────────────────▼─────────────────────────────────┐
│ 组件层 src/components                                       │
│   controls/*    25 种元素控件（纯渲染 + 取值 + 校验）          │
│   form.js       表单容器：布局、deps 联动、校验、数据读写       │
│   menu.js       左侧菜单（树、折叠、飞出、徽标）               │
│   menunav.js    顶部导航（面包屑、历史、刷新、全屏、操作）      │
│   tabs.js       标签容器 + 主体 iframe 区（保活核心）          │
│   dialog.js     弹窗管理（每个弹窗一个 iframe、Promise API）    │
│   toast.js      提醒信息（toast / notification，纯 DOM）       │
│   app-shell.js  把上面五者按 layout 组装成整页（可整体不用）    │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│ 装配层 src/app/bootstrap.js                                 │
│   加载配置 → 初始化 i18n/主题 → 创建 app-shell → 注册动作       │
└─────────────────────────────────────────────────────────────┘ */

┌ 业务页（iframe 内） src/frame/kui-frame.js ─ postMessage 桥 ─┐
│  页面只引 kui-frame.js，即可拿到 theme 同步、toast、dialog、关闭确认 │
└──────────────────────────────────────────────────────────────┘
```

## 3. 渲染流水线

1. `bootstrap` 读 `app.json`，把 `menu` / `menunav` / `tabs` 节点交给 `app-shell`。
2. `app-shell` 按 `layout` 建骨架：`.kui-app > .kui-app__left + .kui-app__main > .kui-app__header + .kui-app__center`。
3. 每个子组件调用 `KUI.mount('menu', host, node, ctx)`：
   - `KUI.renderNode(node, ctx)` → 找 `KUI.registry.get(node.type)` → `render(node, ctx)` 返回 DOM；
   - 渲染后自动加 `kui-control kui-control--<type>`，实例挂到 `el.__kuiInstance`，子实例挂 `ctx.children`；
   - `api()` 返回的实例方法会合并到挂载结果上。
4. 控件内部只读 `node`（配置）与 `ctx`（上下文），不读全局文案/色值。
5. 交互产生状态变化时：字段级 `ctx.emit('control:change', …)` → `form` 收到后跑 `deps` 求值 → 命中字段切 visible/disabled/required/value → 表单 `onChange`。
6. 按钮类节点用 `on: { click: <动作> }`；`<动作>` 支持字符串、`{action, params}`、`{actions:[…]}`，由 `KUI.actions.run(action, ctx, ev)` 统一执行。

## 4. 配置驱动的三个层次

| 层次 | 文件 | 能改什么 | 什么时候需要改代码 |
| --- | --- | --- | --- |
| 文案 | `config/text.json`（或 `app.json.text`） | 所有 label/title/placeholder/提示语 | 永远不需要 |
| 结构 | `config/app.json` | 菜单树、导航按钮、默认标签、弹窗内容、布局尺寸、动作绑定、控件属性 | 只在需要**新控件类型**或**新动作**时 |
| 外观 | `src/themes.json` + `base.css` 的 token 默认值 | 颜色、阴影、发光、字体、圆角、动效、装饰层 | 只在需要新的装饰层 `kind` 时 |

## 5. 关键机制

### 5.1 标签保活（验收点 4）

- `tabs.open()` 创建 `tab.paneEl`（只创建一次）+ `tab.frameEl`（只创建一次）。
- `activate()`：只改 `paneEl.hidden` 与 `.is-active`，**绝不改 `src`、绝不 remove/重建**。
- 首次激活时才 `frameEl.src = url`；此后切换不影响 iframe 文档状态（未保存数据安全）。
- `close()` 才移除 pane 与 iframe；关闭前可走 `tab:before-close` 让业务页确认（脏数据提示）。
- 显式 `refresh()` 才会重设 `src`（用户主动刷新，属于预期行为）。

### 5.2 弹窗即 iframe（验收点 5）

- `KUI.dialog.open({ type, url?, nodes?, ... })` → 建 `.kui-dialog[data-dialog-id]` + 遮罩 + `<iframe src="src/frame/dialog-frame.html">`。
- iframe 加载后发 `dialog:ready`，父页回 `dialog:init`（含弹窗配置与主题 token）。
- 弹窗内点确定 → `dialog:resolve`；取消/Esc → `dialog:cancel`；内容高度变化 → `dialog:resize`。
- 弹窗内动作若父级有注册则转发（`dialog:action` → `dialog:action:result`），保证 `theme.picker` 等父级动作能在弹窗里用。
- Promise API：`KUI.dialog.alert/confirm/prompt/form/custom`，全部返回 Promise。

### 5.3 表单联动（验收点 9）

`node.deps` 支持 `when`（单条件）、`{all:[…]}`、`{any:[…]}`，`then` 可设置
`visible / disabled / readonly / required / value / options / text / error`。
求值顺序：先恢复默认态，再按 `deps` 数组顺序应用命中的规则；值变化时对整个表单做一次全量重算（字段数少，代价可忽略，但行为可预测）。

### 5.4 主题切换

- `KUI.theme.apply(id)` 只改 `documentElement` 上的 CSS 变量 + `data-kui-theme`/`data-kui-scheme`。
- 切主题前清除**上一套主题写过、新主题没有**的 token，避免残留。
- 装饰层由 `theme-art.js` 根据 `theme.art.layers` 生成，与业务 DOM 完全解耦。
- 所有 iframe（业务页、弹窗）通过 `theme:apply` 收到同一套 token，保证跨 iframe 一致。
- 主题样式**不允许**写主题专属选择器，只能靠 token；这样新增主题零代码。

### 5.5 独立渲染（验收点 6、特殊要求 2）

- 每个组件只依赖 `core`，不依赖 `app-shell`；没加载的兄弟组件会退化或跳过，不报错。
- `standalone/*.html` 各演示一个组件或一类控件，只引必要脚本。
- `app-shell` 本身也可以不用：`KUI.menu.create(host, props)` 等可以直接在任意容器里创建。

## 6. 目录与文件职责

| 路径 | 职责 |
| --- | --- |
| `config/app.json` | 主配置：app/layout/menu/menunav/tabs/dialogs/text |
| `config/text.json` | 文案字典 |
| `config/demos/*.json` | standalone 演示配置（菜单/表单/弹窗/提醒/控件/主题…） |
| `config/bundle.js` | 构建产物：把上面 JSON 打成 `window.__KUI_BUNDLE__`，供 file:// 使用 |
| `src/core/*` | 框架内核（无 UI 结构） |
| `src/components/controls/*` | 元素控件，一个文件一类（基础/输入/选择/选择器/杂项） |
| `src/components/*.js` | 复合组件 |
| `src/styles/base.css` | token 默认值 + 骨架 + 工具类 + 滚动条 + 装饰层基础样式 |
| `src/styles/controls.css` | 控件样式（含箭头/角标/弹层/日历等易忽略细节） |
| `src/styles/components.css` | 复合组件样式 |
| `src/styles/themes/*.css` | 主题附加样式（只允许 token 声明，不允许主题选择器改结构） |
| `src/frame/kui-frame.js` | 业务页桥：主题同步、toast、dialog、脏数据关闭确认 |
| `src/frame/dialog-frame.html` `.js` | 弹窗 iframe 宿主页与桥 |
| `pages/*.html` | 业务页示例（全部由 JSON 渲染） |
| `standalone/*.html` | 组件独立渲染示例 |
| `test/*` | 零依赖测试（Node 13.14 必过） |
| `tools/*` | 配置打包、兼容扫描、资源检查、截图 |

## 7. 数据流一览

```
app.json ──┐
text.json ─┼─→ KUI.config.load ─→ bootstrap ─→ app-shell.create
themes.json┘                                        │
                                                    ├─→ menu.create   → 点击 → ctx.action(target) → tabs.open
                                                    ├─→ menunav.create ← 面包屑/历史状态
                                                    └─→ tabs.create   → 每 tab 一个 iframe（保活）
                                                                    │ postMessage
pages/*.html ──→ kui-frame.js ──────────────────────────────────────┘
                     │ frame:ready / frame:title / frame:dirty / frame:toast / frame:dialog
                     └ theme:change 回来更新自身 token
dialog 组件 → iframe(src/frame/dialog-frame.html) → dialog-frame.js → dialog:resolve/cancel
```

## 8. 兼容策略（Node 13.14 / 浏览器）

- **语法层**：只用 ES2017 以内语法；禁用 `?.`、`??`、`#private`、`replaceAll`、顶层 await、类字段。
  `tools/check-compat.js` 会扫描全项目并给出中文报告。
- **模块层**：浏览器端全部传统 `<script>`（非 ESM），确保 `file://` 直接双击可用；Node 端 CommonJS。
- **依赖层**：零运行时依赖（不引 UI 库、不引 CDN、不下载在线字体）。若将来要引入 UI 组件库，只能取"元素控件"的实现，并保持 token 化。
- **API 层**：DOM 只用 `addEventListener`、`dataset`、`classList`、`postMessage`、`matchMedia` 等广泛可用 API；不用 `ResizeObserver`（用 `resize` 事件兜底）。

## 9. 测试

- `npm test` → `test/run.js`：`compat`（语法/API 黑名单 + 真实 Node13 解析）、`config`（JSON 合法、type 已注册、主题齐全）、`server`（静态服务、防穿越、MIME）、`render`（dom-stub 下渲染、保活、弹窗、联动、主题）。
- `npm run test:node13` → 用仓库内 `.tools/node-v13.14.0-win-x64/node.exe` 跑同一套。
- `node tools/check-assets.js` → 检查 HTML 引用的 JS/CSS 是否齐全。
- `node tools/screenshot.js` → 本机 headless 浏览器截图（沙箱内 spawn 受限，需在普通终端跑）。

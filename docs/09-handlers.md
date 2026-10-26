# 09 · 业务函数层（JSON 不能存函数怎么办）

> 本文回答一个必然遇到的问题：**配置 JSON 是纯数据，不能写函数**。
> KurumiUI 的解法是：**每个框架组件额外带一个独立的 `*.handlers.js` 业务函数文件**，
> JSON 里只写「函数名 + 入参」，渲染代码只负责把 JSON 渲染出来。

---

## 1. 为什么这样设计

| 诉求 | 做法 |
| --- | --- |
| 调 UI 只改 JSON、不改代码 | 文案/颜色/结构/控件属性/动作全部在 JSON |
| JSON 无法存函数 | JSON 存 `{ "fn": "toast.success", "args": {...} }`，函数实现放独立文件 |
| 组件可自由拆解 | 每个组件的业务函数独立成文件，用哪个组件就引哪个文件 |
| 不污染渲染代码 | `src/core/handlers.js` 只是注册表；业务逻辑在 `src/components/handlers/*` |

一句话：**JSON 描述「做什么」，handlers.js 描述「怎么做」，core 负责把它们连起来。**

---

## 2. 文件清单（7 个 scope）

| 文件 | scope | 覆盖的组件 | 主要函数 |
| --- | --- | --- | --- |
| `src/core/handlers.js` | — | 注册表 + 内置动作 `handlers.run` | `register/registerMany/has/resolve/invoke/list/scopes/count/clear` |
| `src/components/handlers/menu.handlers.js` | `menu` | 左侧菜单 | `toggleCollapse/collapse/expand/select/setBadge/clearBadges/cycleActive/setCollapsed` |
| `src/components/handlers/menunav.handlers.js` | `menunav` | 顶部菜单导航 | `refresh/fullscreen/toggleMenu/back/forward/setTitle/setBreadcrumb` |
| `src/components/handlers/tabs.handlers.js` | `tabs` | 子标签 | `open/activateNext/activatePrev/closeActive/closeOthers/closeAll/refreshActive/setBadge` |
| `src/components/handlers/dialog.handlers.js` | `dialog` | 弹窗 | `alert/confirm/prompt/form/custom/info/close/closeAll` |
| `src/components/handlers/toast.handlers.js` | `toast` | 提醒信息 | `show/success/error/warning/info/demo/clear` |
| `src/components/handlers/app-shell.handlers.js` | `app` | 应用外壳 | `setTheme/nextTheme/prevTheme/randomTheme/pickTheme/toggleMenu/openHome/openTab/closeTab/refreshTab/notify/info` |
| `src/components/handlers/form.handlers.js` | `form` | 表单 | `reset/validate/getData/setData/setValue/getValue/setVisible/setDisabled/setRequired/setError/clearError` |

> 元素控件（input / select / date…）本身是"叶子控件"，它们的业务语义属于所在表单或页面，
> 因此不单独出 handlers 文件；需要业务函数时用 `form.*` 或自定义 scope（见 §7）。

---

## 3. JSON 里的四种写法

> **注意**：`on` 是**节点级字段**，与 `type` / `props` 平级，不要写进 `props` 里。
> 写进 `props` 的 `on` 不会被绑定（控件只从 `node.on` 取事件）。

### 3.1 单函数（推荐）

```json
{
  "type": "button",
  "props": { "text": "保存成功" },
  "on": { "click": { "fn": "toast.success", "args": { "text": "已保存" } } }
}
```

### 3.2 字符串简写

```json
{ "on": { "click": "toast.info" } }
```

字符串会被当作「函数名或动作名」执行；带点号且已注册为业务函数时走 `handlers.invoke`。

### 3.3 动作数组（顺序执行，混写 action 与 fn）

```json
{
  "on": {
    "click": {
      "actions": [
        { "fn": "toast.info", "args": { "text": "准备切换…" } },
        { "fn": "app.setTheme", "args": { "id": "sakura", "silent": true } },
        { "action": "dialog.close", "params": { "id": "theme-picker" } }
      ]
    }
  }
}
```

### 3.4 显式 `handlers.run`

```json
{ "on": { "click": { "action": "handlers.run", "params": { "fn": "menu.cycleActive", "args": {} } } } }
```

`handlers.run` 同时支持 `params.fn` / `params.name` / `params.handler` 与 `params.args|params|data`。

---

## 4. 注册自己的业务函数

```js
// 例：某个业务页自己的函数（不放进框架）
KUI.handlers.registerMany('page', {
  save: function (ctx, args) {
    // ctx: 渲染上下文（ctx.type / ctx.node / ctx.form / ctx.tab / ctx.app …）
    // args: JSON 里的 args
    return { ok: true, id: args.id };
  }
}, { title: '业务页', desc: '示例 scope' });
```

JSON 里即可写 `{ "fn": "page.save", "args": { "id": "A-01" } }`。

**简写规则**：若 JSON 里写 `{ "fn": "save" }`（不带 scope），会按 `ctx.type` 推断同 scope 的函数，
找不到时再按全名查（`KUI.handlers.resolve`）。

**函数签名**：`function (ctx, args, info) {}`，`info = { KUI, scope, name, full, meta }`。
同步返回值、Promise 都会被 `handlers.invoke` 统一返回；抛错会被 `KUI.error` 记录且不打断渲染。

---

## 5. 弹窗（iframe）里的动作是怎么执行的

弹窗是一个独立 iframe，它内部**没有**主应用的 `KUI.app` / `KUI.dialog` 实例，所以：

1. `src/frame/dialog-frame.js` 启动时装「动作桥」`installActionBridge()`，包装本 iframe 内的 `KUI.actions.run`；
2. 组件级前缀（`app. / theme. / tab(s). / nav. / menu. / menunav. / toast. / dialog. / handlers. / form. / frame.`）
   一律通过 `postMessage({ type: 'dialog:action', payload: { action, params } })` 交给父页面执行；
3. 父页面 `src/components/dialog.js` 的 `handleRemoteAction()` 用 `KUI.actions.run` 执行并把 `{ ok, result }` 回传；
4. 本地动作（如 `clipboard.copy`）仍在 iframe 内直接执行。

因此主题选择弹窗里的 6 个主题卡片（节点级 `on.click` → `app.applyTheme`）现在可以正常点击——
这正是 v1.0.2 修复的 bug。

---

## 6. 装配方式（按需加载）

```html
<!-- 主应用 index.html -->
<script src="src/core/handlers.js"></script>
...
<script src="src/components/handlers/menu.handlers.js"></script>
<script src="src/components/handlers/menunav.handlers.js"></script>
<script src="src/components/handlers/tabs.handlers.js"></script>
<script src="src/components/handlers/dialog.handlers.js"></script>
<script src="src/components/handlers/toast.handlers.js"></script>
<script src="src/components/handlers/app-shell.handlers.js"></script>
<script src="src/components/handlers/form.handlers.js"></script>
```

- 独立渲染页（`standalone/*.html`）只引自己用得到的 handlers 文件；
- `pages/*.html` 至少引 `../src/core/handlers.js`，用到 `form.*` 再引 `form.handlers.js`；
- 不引任何 handlers 文件时，框架照常工作，只是 JSON 里的 `fn` 写法不会生效（`warnOnce` 提示）。

---

## 7. 错误与安全

| 情况 | 行为 |
| --- | --- |
| 函数名未注册 | `KUI.warnOnce('handler-missing:<name>')`，返回 `undefined`，不抛异常 |
| 函数内部抛错 | `KUI.error('业务函数 <name> 执行异常', err)`，返回 `undefined` |
| 弹窗内调用父级函数 | 动作桥转发；父级也找不到时静默降级（避免弹窗按钮卡死） |
| 同 scope 同名重复注册 | 后者覆盖前者（与 `KUI.registry` 一致） |
| `handlers.clear(scope)` | 只清该 scope，便于测试隔离 |

> 安全提示：`fn` 只是字符串，不会 `eval`。所有可执行项都必须先被 `register` 注册过，
> 因此 JSON 的可执行面 = 代码里注册过的那批函数，配置无法凭空执行任意代码。

---

## 8. 演示与验证

- `config/demos/handlers.json`：**纯 JSON**，8 组按钮，覆盖上面 4 种写法；
- `standalone/handlers.html`：独立渲染该 JSON（本页没有业务逻辑代码），并内嵌一个 menu / tabs 实例供 `menu.*` / `tabs.*` 操作；
- 主应用菜单「观测回廊 → JSON 业务函数」可直接打开；
- 自动验证（`npm run verify`）：
  - `tools/verify-handlers-demo.js`：用 dom-stub 真实装配该页脚本，按 JSON 渲染 8 组 / 29 节点 / 27 按钮 / 1 menu / 1 tabs，并模拟点击确认 `toast` 真的弹出；
  - `tools/verify-dialog-bridge.js`：在 dom-stub 里启动 `dialog-frame.html`，断言 `app.applyTheme`、`handlers.run`、动作数组都被转成 `dialog:action` 且参数完整。

---

## 9. 扩展新 scope 的检查清单

1. 新建 `src/components/handlers/<name>.handlers.js`；
2. `KUI.handlers.registerMany('<name>', handlers, { title, desc })`；
3. 在需要的页面（`index.html` / `standalone/*.html` / `pages/*.html`）加 `<script>`；
4. 在 `docs/09-handlers.md` 文件清单里补一行；
5. 冒烟断言：`KUI.handlers.has('<name>.<fn>')` 为真。

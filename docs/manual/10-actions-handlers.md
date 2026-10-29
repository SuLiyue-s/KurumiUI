# 10 · 交互与业务函数：on、动作与 handlers

> 适用版本：KurumiUI v1.4.4 ｜ 前置章节：04-config-app.md、05-controls-input.md ｜ 阅读时长：约 30 分钟

## 本章目标

- 掌握 `on` 的 7 种写法、回调参数、`this`、执行顺序与错误捕获；
- 记住 28 个内置动作的名称、参数、返回值与等价 JS；
- 查表使用 7 个 scope 共 61 个业务函数；
- 会注册自定义动作与业务函数，并能调试。

## 0. 一句话概念

`on` 把 DOM 事件接到「动作」上；动作是**可序列化指令**（字符串 / 对象 / 数组），由核心分发到内置动作表或 `KUI.handlers` 业务函数表——所以配置 JSON 不写函数也能完成交互。

## 1. on 字段完整语法

### 1.1 执行链：从配置到函数

1. `renderNode` 渲染出元素后调用 `decorate(el, node, ctx)`（`src/core/kui.js:1062`）；
2. `decorate` 遍历 `node.on` 每个键，跳过 `mount` / `destroy`（`src/core/kui.js:981-985`），其余用 `KUI.on(el, 事件名, 包装函数)` 绑定（`src/core/kui.js:987-991`）；
3. 事件触发时执行 `KUI.actions.run(on[键], ctx, ev)`（`src/core/kui.js:990`）；
4. `actions.run` 按值类型分发（`src/core/kui.js:802-859`）；字符串先查内置动作表，查不到回退 `KUI.handlers`（`src/core/kui.js:862-871`）。

两条硬结论：**事件名 = 原生 DOM 事件名**（`click`/`input`/`change`/`submit`/`keydown`/`dblclick`…）；`on` 只能绑渲染出来的元素，不能直接绑 `window`。

### 1.2 七种写法总表

| 写法 | 示例（`on` 的值） | 执行方式 | 返回值 |
| --- | --- | --- | --- |
| 字符串 | `"toast.success"` | `invoke(name, {}, ctx, ev)`，先动作后业务函数（`kui.js:813,866`） | 动作返回值 |
| 函数 | `function (ctx, ev) { … }` | `action(ctx, ev)`（`kui.js:812`） | 函数返回值 |
| 标准对象 | `{ "action": "dialog.alert", "params": {…} }` | `invoke(action, params, ctx, ev)`（`kui.js:822-824`） | 动作返回值 |
| 多动作 | `{ "actions": [ … ] }` / `{ "chain": [ … ] }` | 顺序执行数组（`kui.js:820-821`） | 结果数组 |
| 业务函数 | `{ "fn": "app.openHome" }` / `{ "handler": { "name": "tabs.activateNext" } }` | 转成 `handlers.run`（`kui.js:829-835`） | 业务函数返回值 |
| 事件派发 | `{ "emit": "menu:collapsed", "detail": {…} }` | `ctx.emit(name, detail)`（`kui.js:836-841`） | `undefined` |
| 快捷字段 | `{ "theme": "sakura" }`、`{ "tab": {…} }`、`{ "toast": {…} }`、`{ "dialog": { "kind": "confirm" } }` | 转成 `theme.apply`/`tab.open`/`toast.show`/`dialog.<kind>`（`kui.js:842-856`） | 对应动作返回值 |

细节：`params` 别名 `args`、`data`（`kui.js:823`）；`{ "dialog": { "kind": "confirm", "text": "继续？" } }` 等价 `{ "action": "dialog.confirm", "params": { "text": "继续？" } }`（`kind || mode || 'alert'`）。函数值只能写在代码里，JSON 无法表达函数。

### 1.3 事件对象与回调参数

| 写法 | 回调签名 | 拿事件对象 |
| --- | --- | --- |
| 字符串 / 对象 / 快捷字段 | 动作 `function (ctx, params, ev)` | 自定义动作可收第三参 |
| 函数值 | `function (ctx, ev)` | 第二参即原生 `ev`，`ev.target` 为触发元素 |
| 业务函数 | `function (ctx, args, info, extra)` | **收不到** `ev`（`kui.js:867`） |

要 `ev.preventDefault()`、读 `ev.target.value` 时，用函数值（仅代码内配置）或注册自定义动作（4.1）。

### 1.4 顺序、this 与冒泡

- 同一元素按 `on` 键的书写顺序绑定；`actions`/`chain` 顺序执行但**不等待 Promise**（`kui.js:805-811`）；
- 冒泡：子元素先、父元素后；要阻止外层继续执行同事件的动作，在子动作/函数值里用 `ev.stopPropagation()`。`ev.__kuiActionHandled` 只是 `kui.js:989` 的内部**读取**标记（全仓无写入点），JSON 动作对象无法设置，请勿依赖；
- `this`：动作以普通函数调用执行（`kui.js:873`），模块 `'use strict'`，故 `this === undefined`；要元素用 `ctx.inst.el` 或 `ev.currentTarget`；
- 返回值可能是 Promise：框架只挂 `catch` 打日志（`kui.js:874-876`），不会 `await`。

### 1.5 错误捕获

| 场景 | 框架行为 | 日志 |
| --- | --- | --- |
| 动作名写错 | `warnOnce`，返回 `undefined` | `[KurumiUI] 未注册的动作: xxx` |
| 动作函数同步抛错 | `KUI.error` 记录 | `[KurumiUI] 动作执行异常 [名字]:` |
| 动作 Promise reject | 挂 `catch` 记录 | `[KurumiUI] 动作异常 [名字]:` |
| 业务函数抛错 | `KUI.error` 记录 | `[KurumiUI] 业务函数(执行)异常 [全名]:` |
| `on.mount` 抛错 | 捕获后继续渲染 | `[KurumiUI] on.mount 异常 [类型]:` |
| 内置动作依赖组件未加载 | `warnOnce('api-missing:…')` | `动作 dialog.alert 需要 KUI.dialog 组件，但它尚未加载。` |

`warnOnce` 同一 key 只打印一次（`src/core/kui.js:37-60`）。

### 1.6 八个真实示例

**1）按钮点击弹提醒（字符串）**

```json
{ "type": "button", "text": "打招呼", "on": { "click": "toast.success" } }
```

**2）按钮打开确认框（标准对象）**

```json
{ "type": "button", "text": "删除", "on": { "click": {
  "action": "dialog.confirm",
  "params": { "title": "删除确认", "text": "不可撤销，继续吗？", "danger": true } } } }
```

**3）表单提交取数据（按钮 `on.click` + 业务函数）**

`form` 组件的根是 `div role="form"`（`src/components/form.js:461-467`），文件里**没有监听原生 `submit`**；`form.submit()` 只通知订阅者并经 `KUI.bus` 派发 `'form:submit'`（`form.js:1379-1395`）。所以动作要写在按钮上：

```json
{ "type": "form", "id": "demoForm",
  "children": [
    { "type": "input", "id": "name", "props": { "label": "姓名", "required": true } },
    { "type": "button", "text": "校验并取值", "props": { "variant": "primary" },
      "on": { "click": { "actions": [ { "fn": "form.validate" }, { "fn": "form.getData" } ] } } },
    { "type": "button", "text": "重置", "on": { "click": { "fn": "form.reset" } } } ] }
```

```js
// 需要完整“提交”语义（校验→保存→关闭）时，监听总线事件，或在自定义动作里调 form.submit()
KUI.bus.on('form:submit', function (detail) { KUI.log('提交数据', detail.data); });
```

> **无效写法**：在 `form` 节点上写 `on.submit` / `on.reset` 不会触发——根元素不是 `<form>`，组件也不派发这两个 DOM 事件。

**4）菜单项点击做多件事（actions 数组）**

```json
{ "type": "item", "id": "home", "text": "总览", "icon": "home",
  "on": { "click": { "actions": [ { "fn": "app.openHome" },
    { "toast": { "type": "success", "message": "已回到总览" } } ] } } }
```

**5）输入框实时统计（函数值）**

```js
KUI.mount('input', host, {
  props: { label: '昵称' },
  on: {
    input: function (ctx, ev) {
      var len = String(ev.target.value || '').length;
      ctx.emit('nickname:change', { length: len });
      if (len > 12) KUI.toast.warning('昵称不要超过 12 个字符');
    }
  }
});
```

**6）窗口 resize（`on` 不绑 window，用 `on.mount`）**

```js
KUI.mount('card', host, {
  props: { title: '自适应面板' },
  on: {
    mount: function (inst, ctx) {
      var redraw = KUI.debounce(function () { ctx.emit('chart:resize', KUI.viewport()); }, 120);
      KUI.on(window, 'resize', redraw);
    }
  }
});
```

**7）表格行双击确认后删除（函数值里等待 Promise）**

```js
KUI.mount('table', host, {
  props: { columns: [{ key: 'name', title: '名称' }], data: rows },
  on: {
    'row:dblclick': function (ctx, ev) {
      var row = (ev.detail && ev.detail.row) || {};
      KUI.dialog.confirm({ title: '删除行', text: '删除「' + row.name + '」？' })
        .then(function (ok) { if (ok) KUI.toast.success('已删除'); });
    }
  }
});
```

**8）事件总线广播 + 监听（emit）**

```json
{ "type": "button", "text": "保存草稿",
  "on": { "click": { "emit": "draft:save", "detail": { "from": "toolbar" } } } }
```

```js
KUI.bus.on('draft:save', function (detail) { KUI.log('收到草稿广播', detail); });
```

## 2. 28 个内置动作

内置动作在 `src/core/kui.js:1163-1290` 注册；组件未加载时只给一次 `warnOnce`，不抛异常。统一写法：字符串 `"theme.next"`，或对象 `{ "action": "名字", "params": … }`。

| 动作名 | 参数 | 返回 | 等价 JS | 失败行为 |
| --- | --- | --- | --- | --- |
| `app.collapse` | `{ value? }` | `toggleCollapsed` 结果 | `KUI.app.toggleCollapsed(value)` | 无 app 时为 `undefined` |
| `app.fullscreen` | 无 | `!isFull` | `KUI.toggleFullscreen()` | 非浏览器 `undefined` |
| `app.refresh` | 无 | `undefined` | `location.reload()` | 非浏览器静默 |
| `clipboard.copy` | `{ text }` / `{ value }` | Promise | `navigator.clipboard.writeText(String(text))` | 无文本/无 API → `undefined` |
| `dialog.alert` | 同 `KUI.dialog.alert` | Promise | `KUI.dialog.alert(params)` | 组件未加载 → `warnOnce` |
| `dialog.confirm` | 同上 | Promise\<boolean\> | `KUI.dialog.confirm(params)` | 同上 |
| `dialog.prompt` | 同上 | Promise\<string\|null\> | `KUI.dialog.prompt(params)` | 同上 |
| `dialog.form` | 同上 | Promise\<object\|null\> | `KUI.dialog.form(params)` | 同上 |
| `dialog.custom` | 同上 | Promise | `KUI.dialog.custom(params)` | 同上 |
| `dialog.close` | `{ id }` / 字符串 id | `boolean` | `KUI.dialog.close(id)` | 同上 |
| `dialog.closeAll` | 无 | `undefined`（函数无 return，`dialog.js:913-920`） | `KUI.dialog.closeAll()` | 同上 |
| `handlers.run` | `{ fn\|name\|handler\|function, args\|params\|data }` | 业务函数返回值 | `KUI.handlers.invoke(name, ctx, args)` | 未注册 → `warnOnce` |
| `tab.activate` | `{ id }` / 字符串 id | 激活结果 | `(KUI.tabs\|\|KUI.app.tabs).activate(id)` | 组件未加载 → `warnOnce` |
| `tab.close` | `{ id }` / 字符串 id | 关闭结果 | `KUI.tabs.close(id)` | 同上 |
| `tab.closeAll` | 无 | tabs 实例（`api`，`tabs.js:734-745`） | `KUI.tabs.closeAll()` | 同上 |
| `tab.closeOthers` | `{ id? }` | 结果 | `tabs.closeOthers(id)` | 同上 |
| `tab.open` | tab 配置对象 | tab/结果 | `KUI.tabs.open(tab)` | 同上 |
| `tab.refresh` | `{ id }` / 字符串 id | 结果 | `KUI.tabs.refresh(id)` | 同上 |
| `theme.apply` | id 字符串或 `{ id, …opts }` | 应用结果 | `KUI.theme.apply(id, opts)` | 同上 |
| `theme.next` | 无 | `theme.next()` 结果 | `KUI.theme.next()` | 同上 |
| `theme.prev` | 无 | `theme.prev()` 结果 | `KUI.theme.prev()` | 同上 |
| `toast.clear` | 无 | 清空结果 | `KUI.toast.clear()` | 同上 |
| `toast.error` | 字符串 / `{ message, …opts }` | 提醒 id | `KUI.toast.error(message, opts)` | 同上 |
| `toast.info` | 同上 | 提醒 id | `KUI.toast.info(message, opts)` | 同上 |
| `toast.notify` | 通知配置 | 提醒 id | `KUI.toast.notify(opts)` | 同上 |
| `toast.show` | 字符串或完整配置 | 提醒 id | `KUI.toast.show(opts)` | 同上 |
| `toast.success` | 字符串 / `{ message, …opts }` | 提醒 id | `KUI.toast.success(message, opts)` | 同上 |
| `toast.warning` | 同上 | 提醒 id | `KUI.toast.warning(message, opts)` | 同上 |

```json
{ "on": { "click": { "actions": [
  { "action": "tab.open", "params": { "id": "orders", "title": "订单", "url": "pages/orders.html" } },
  { "action": "toast.success", "params": { "message": "已打开订单" } } ] } } }
```

## 3. 7 个 scope 的 61 个业务函数

业务函数注册在 `KUI.handlers`（`src/core/handlers.js`），全名 `scope.name`，共 **61** 个：app 12、dialog 8、form 11、menu 8、menunav 7、tabs 8、toast 7。

```js
KUI.handlers.list();                    // 61 条 { scope, name, full, title, desc, args, returns, example }
KUI.handlers.scopes();                  // ['app','dialog','form','menu','menunav','tabs','toast']
KUI.handlers.invoke('app.openHome', ctx, {}); // ctx 可为 null
```

调用方式：`{ "fn": "app.openHome" }`、`{ "handler": { "name": "tabs.activateNext" } }`，或带点字符串动作 `"app.openHome"`。

> **解析规则（易错）**：带点全名精确匹配；不带点时用 `ctx.type` 或 `ctx.scope` 拼 scope，且 `ctx.scope === 'dialog'` 时不参与（`src/core/handlers.js:112-131`）。**没有 app 兜底**，写 `"openHome"` 无效。

### 3.1 app（12）

| 全名 | 参数 | 返回 | 说明 | 同步性/副作用 |
| --- | --- | --- | --- | --- |
| `app.setTheme` | `{ id\|theme\|value, name?, silent? }` | 主题 id / `null` | 切主题并弹提醒 | 同步；持久化+广播 |
| `app.nextTheme` | 无 | 当前 id / `null` | 下一个主题 | 同步；改主题 |
| `app.prevTheme` | 无 | 当前 id / `null` | 上一个主题 | 同步；改主题 |
| `app.randomTheme` | 无 | 随机 id / `null` | 随机主题 | 同步；改主题 |
| `app.pickTheme` | 无 | `true` / Promise / `false` | 优先 `theme.picker`，否则现场拼弹窗 | 可能异步 |
| `app.toggleMenu` | 无 | `boolean` | 切换菜单折叠 | 同步；改布局 |
| `app.openHome` | 无 | tab / `null` | 开首页（`config.app.home`，pinned） | 同步；开标签 |
| `app.openTab` | `{ id, title, url, icon?, pinned? }` | `app.openTab` 结果 | 打开任意标签 | 同步；开标签 |
| `app.closeTab` | `{ id\|tabId }` | `boolean` | 关闭标签 | 同步 |
| `app.refreshTab` | `{ id\|tabId }`（可省略） | `boolean` | 刷新标签 iframe | 同步；重载 |
| `app.notify` | toast 配置 | `boolean` | 弹提醒 | 同步 |
| `app.info` | 无 | `app.name` | 弹「当前框架：xxx」 | 同步 |

```json
{ "on": { "click": { "fn": "app.openTab", "args": { "id": "demo", "title": "演示", "url": "pages/home.html" } } } }
```

### 3.2 dialog（8）

参数即 `KUI.dialog` 配置；`text` 缺省从 `message` 补齐（`src/components/handlers/dialog.handlers.js:19-27`）。**弹窗 iframe 内调用会被动作桥转发回父页面执行**（见 11 章）。

| 全名 | 参数 | 返回 | 说明 | 同步性 |
| --- | --- | --- | --- | --- |
| `dialog.alert` | `{ title, text/message, icon?, width? }` | Promise | 提醒框 | 异步 |
| `dialog.confirm` | 同上 + `danger?`, `okText?` | Promise\<boolean\> | 确定 `true`/取消 `false` | 异步 |
| `dialog.prompt` | 同上 + `input?`, `defaultValue?` | Promise\<string\|null\> | 取消为 `null` | 异步 |
| `dialog.form` | 同上 + `nodes`, `data?`, `submitApi?` | Promise\<object\|null\> | 表单弹窗 | 异步 |
| `dialog.custom` | 同上 + `nodes`, `actions?` | Promise | 自定义弹窗 | 异步 |
| `dialog.info` | 同 alert | Promise | 信息框（内部走 alert） | 异步 |
| `dialog.close` | `{ id\|dialogId }` | `boolean` | 关闭指定弹窗 | 同步 |
| `dialog.closeAll` | 无 | `undefined`（调用 `KUI.dialog.closeAll()`，无 return，`dialog.js:913-920`） | 关闭全部 | 同步 |

### 3.3 form（11）

实例来源：`ctx.form` → `ctx.formInstance` → `ctx.page.form`（`src/components/handlers/form.handlers.js:16-22`）。

| 全名 | 参数 | 返回 | 说明 | 同步性 |
| --- | --- | --- | --- | --- |
| `form.reset` | 无 | `boolean` | 重置并弹提示 | 同步；改表单 |
| `form.validate` | 无 | `validate()` 结果对象 | 整表校验并弹提示 | 同步；标红 |
| `form.getData` | 无 | 数据对象 / `null` | 取数据、打印控制台 | 同步 |
| `form.setData` | `{ data\|values\|formData }` | `boolean` | 批量赋值 | 同步 |
| `form.setValue` | `{ field\|id\|name, value\|text }` | `boolean` | 单字段赋值 | 同步 |
| `form.getValue` | `{ field\|id\|name }` | 值 / `null` | 读单字段 | 同步 |
| `form.setVisible` | `{ field, visible }` | `boolean` | 显隐字段 | 同步 |
| `form.setDisabled` | `{ field, disabled }` | `boolean` | 禁用/启用 | 同步 |
| `form.setRequired` | `{ field, required }` | `boolean` | 改必填 | 同步 |
| `form.setError` | `{ field, error\|text }` | `boolean` | 设错误文案 | 同步 |
| `form.clearError` | `{ field? }` | `boolean` | 传 field 清单个，不传清全部 | 同步 |

> **注意（真实行为）**：`form.validate` 里按 `var ok = form.validate()` 真假弹提示，而 `validate()` 返回 `{ valid, errors, data }` 对象恒真——**提示总是「校验通过」**。判断结果请读返回值的 `valid` 字段。

### 3.4 menu（8）

| 全名 | 参数 | 返回 | 说明 | 同步性 |
| --- | --- | --- | --- | --- |
| `menu.toggleCollapse` | 无 | 折叠结果 | 切换折叠（优先 app 实例） | 同步 |
| `menu.collapse` | 无 | `boolean` | 折叠 | 同步 |
| `menu.expand` | 无 | `boolean` | 展开 | 同步 |
| `menu.select` | `{ id\|menuId\|value }` | `selectMenu` 结果 / `null` | 选中菜单项 | 同步 |
| `menu.setBadge` | `{ id\|menuId, text\|value, type\|badgeType }` | `boolean` | 设徽标 | 同步 |
| `menu.clearBadges` | 无 | 数量 | 递归清空徽标 | 同步 |
| `menu.cycleActive` | 无 | 下一个 id / `null` | 循环激活 | 同步 |
| `menu.setCollapsed` | `{ collapsed }`（默认 `true`） | `boolean` | 指定折叠状态 | 同步 |

### 3.5 menunav（7）

| 全名 | 参数 | 返回 | 说明 | 同步性 |
| --- | --- | --- | --- | --- |
| `menunav.refresh` | 无 | `boolean` | 刷新导航栏 | 同步 |
| `menunav.fullscreen` | 无 | `boolean` | 导航栏全屏，回退 `KUI.toggleFullscreen()` | 同步 |
| `menunav.toggleMenu` | 无 | `boolean` | 折叠/展开侧边菜单 | 同步 |
| `menunav.back` | 无 | `boolean` | 派发 `history:back` | 同步 |
| `menunav.forward` | 无 | `boolean` | 派发 `history:forward` | 同步 |
| `menunav.setTitle` | `{ title\|text\|value }` | 标题 / `null` | 设标题 | 同步 |
| `menunav.setBreadcrumb` | `{ items\|breadcrumb }` | 条目数 | 设面包屑 | 同步 |

### 3.6 tabs（8）

| 全名 | 参数 | 返回 | 说明 | 同步性 |
| --- | --- | --- | --- | --- |
| `tabs.open` | `{ id\|tabId, title\|text, url\|src, icon?, pinned? }` | tab / `null` | 开标签（`url` 必填） | 同步；建 iframe |
| `tabs.activateNext` | 无 | id / `null` | 激活下一个 | 同步 |
| `tabs.activatePrev` | 无 | id / `null` | 激活上一个 | 同步 |
| `tabs.closeActive` | 无 | 关闭的 id / `null` | 关闭当前 | 同步 |
| `tabs.closeOthers` | 无 | `0`/`1` | 关其它（保留当前） | 同步 |
| `tabs.closeAll` | 无 | tabs 实例（`api`，`tabs.js:734-745`） | 关全部 | 同步 |
| `tabs.refreshActive` | 无 | id / `null` | 刷新当前 | 同步 |
| `tabs.setBadge` | `{ id\|tabId, text\|value, type? }` | `boolean` | 设徽标（**无 `badgeType` 别名**，`tabs.handlers.js:102`） | 同步 |

### 3.7 toast（7）

| 全名 | 参数 | 返回 | 说明 | 同步性 |
| --- | --- | --- | --- | --- |
| `toast.show` | 完整 toast 配置 | `boolean` | 万能显示 | 同步 |
| `toast.success` | `{ text\|message\|msg }` | `boolean` | 成功提醒 | 同步 |
| `toast.error` | 同上 | `boolean` | 错误提醒 | 同步 |
| `toast.warning` | 同上 | `boolean` | 警告提醒 | 同步 |
| `toast.info` | 同上 | `boolean` | 提示 | 同步 |
| `toast.demo` | `{ delay? }`（默认 180ms） | `4` | 依次演示四条 | 异步（定时） |
| `toast.clear` | 无 | `boolean` | 清空提醒 | 同步 |

```json
{ "type": "button", "text": "保存",
  "on": { "click": { "fn": "toast.success", "args": { "text": "已保存" } } } }
```

## 4. 自定义动作与业务函数

### 4.1 注册自定义动作

```js
KUI.actions.register('demo.say', function (ctx, params, ev) {
  KUI.toast.success(params.text || '你好');
  if (params.logTarget) KUI.log('触发元素：', ev && ev.currentTarget);
  return true;
});
```

```json
{ "type": "button", "text": "问候",
  "on": { "click": { "action": "demo.say", "params": { "text": "欢迎回来" } } } }
```

签名 `register(name, fn)`，`fn(ctx, params, ev)`；字符串写法时 `params` 为 `{}`。返回 `KUI.actions`，可链式 `unregister`/`has`/`list`。**同名再注册即覆盖**，内置动作也能覆盖（升级时注意核对）；抛错由分发器统一捕获。

### 4.2 注册自定义业务函数

```js
KUI.handlers.register('demo', 'save', function (ctx, args, info, extra) {
  // info = { KUI, scope:'demo', name:'save', full:'demo.save', meta:{…} }
  KUI.log('保存', args, ctx && ctx.type);
  return { ok: true, args: args };
}, { title: '保存草稿', desc: '打印参数并返回结果',
     args: ['quiet'], returns: 'Object', example: '{ "fn": "demo.save" }' });

KUI.handlers.registerMany('demo', {
  open: function (ctx, args) { return true; },
  close: function () { return false; }
}, { title: '演示', desc: '自定义 demo scope' });
```

> `meta.args` 必须是**数组**：`normalizeMeta` 用 `Array.isArray(meta.args) ? meta.args : (meta.params || [])`（`src/core/handlers.js:45-54`），传对象会被静默替换成 `[]`（或 `meta.params`）；元素可写字符串或 `{ name, type, desc }`。

| API | 签名 | 返回 | 说明 |
| --- | --- | --- | --- |
| `register` | `(scope, name, fn, meta?)` | 记录 / `null` | scope 缺省 `app`；非法时 `warn` 返回 `null` |
| `registerMany` | `(scope, map, meta?)` | 条数 | map 值可为函数或带 `fn` 的对象 |
| `resolve` / `get` | `(name, ctx?)` | 记录 / `null` | 全名精确；短名按 ctx 拼 |
| `has` | `(name, ctx?)` | `boolean` | 解析成功才 `true` |
| `invoke` / `call` | `(name, ctx, args, extra?)` | 返回值 | `extra` 作第 4 参透传 |
| `list` / `scopes` / `count` / `clear` | `()` | 数组/数字/— | `clear(scope?)` 清空 |

命名：scope 用组件名小写，name 用小驼峰，JSON 一律写全名；同 scope 同名后者覆盖前者、无冲突提示，自定义 scope 建议加前缀（如 `demo.*`）。业务函数只拿 `ctx` 和 `args`，**拿不到 DOM 事件**。

### 4.3 调试

```js
KUI.handlers.list().filter(function (h) { return h.scope === 'form'; });
KUI.handlers.count();       // 61（内置）
KUI.actions.list();         // 28 个内置动作名（字母序）
KUI.actions.has('theme.apply');
KUI.actions.run('toast.success', KUI.createContext(null), { message: '手工触发' });
```

## 5. 与 KUI.actions / KUI.handlers 的关系

- `KUI.actions.run(action, ctx, ev)` 是**分发器**，签名不是 `run(name, args)`；传字符串等价 `run({ action: 名字 })`；
- `KUI.actions.list()` 返回 28 个内置动作名；`register/unregister/has` 管理动作表；
- `KUI.handlers` 是**业务函数注册表**，动作表找不到名字时回退到这里（`kui.js:866-868`）；内置动作 `handlers.run` 是「业务函数 → 动作」的桥；
- 弹窗 iframe 内的 `dialog.*` / 业务函数调用经 postMessage 转发回父页面，协议见 [11-api-messaging.md](11-api-messaging.md)。

## 6. 常见错误与排查

| 现象 | 常见原因 | 处理 |
| --- | --- | --- |
| 「未注册的动作: xxx」 | 名字拼错或写了短名 | `KUI.actions.list()` 核对；业务函数写全名 |
| 写成 `"action:toast.success"` / `"handlers.run(...)"` | 不支持前缀和调用表达式 | 字符串只写名字，入参用 `{ "action": 名字, "params": {…} }` |
| 函数值里 `ev` 拿到 `ctx` | 函数值签名是 `function (ctx, ev)` | 第二个参数才是事件对象 |
| 窗口级事件不触发 | `on` 只绑渲染出的元素 | 在 `on.mount` 里用 `KUI.on(window, …)` |
| 弹窗确认后动作没跑 | `actions` 数组不等待 Promise | 写进函数值/自定义业务函数，用 `.then()` |
| 父元素动作也被触发 | 子动作没有阻止冒泡 | 子动作/函数值里调 `ev.stopPropagation()`；`__kuiActionHandled` 只是内部读取标记，JSON 无法设置 |
| `form.validate` 总提示「校验通过」 | 已知行为（返回对象恒真） | 读返回值 `valid` 判断 |
| `form.*` 返回 `false` | 取不到表单实例 | 建立 `ctx.form`（`KUI.form.create` 返回值） |
| `menu.*` / `tabs.*` 返回 `false`/`null` | 实例不存在 | 独立渲染挂 `KUI.demoMenu`/`KUI.demoTabs`，或传 `ctx.menu`/`ctx.tabs` |
| `clipboard.copy` 无反应 | 非安全上下文或未授权 | 用 `https://` 或 `localhost`，失败给 toast 兜底 |

## 本章自检

```bash
node -e "var s=require('./test/dom-stub.js'),e=s.createEnvironment({root:process.cwd(),fileMode:true}),lk=require('./test/load-kui.js'),r=lk.loadKui(e,{});var h=e.window.KUI.handlers.list();console.log('count',h.length);var m={};h.forEach(function(x){(m[x.scope]=m[x.scope]||0)+1;});console.log(m);"
# 预期：count 61 与 app:12 dialog:8 form:11 menu:8 menunav:7 tabs:8 toast:7

node -e "var s=require('./test/dom-stub.js'),e=s.createEnvironment({root:process.cwd(),fileMode:true}),lk=require('./test/load-kui.js'),r=lk.loadKui(e,{});console.log(e.window.KUI.actions.list().join('\n'));"
# 预期：28 行、按字母序（app.collapse 起，toast.warning 止）
```

```js
// 浏览器控制台
KUI.handlers.list().length;      // 61
KUI.actions.list().length;       // 28
KUI.toast.success('自检通过');    // 出现绿色提醒
```

## 参考源码

- `src/core/kui.js:790-884` —— `KUI.actions` 与 `invoke` 回退逻辑
- `src/core/kui.js:891-937` —— `createContext`（`ctx` 字段与 `emit/action/closest/child`）
- `src/core/kui.js:958-999` —— `decorate`（`on` 绑定；`__kuiActionHandled` 仅在 `989` 被读取）
- `src/core/kui.js:1017-1090` —— `renderNode`（`on.mount` 派发时机）
- `src/core/kui.js:1163-1290` —— 28 个内置动作注册；`1293-1308` 全屏
- `src/core/handlers.js:63-223` —— 业务函数注册表全 API 与 `handlers.run`
- `src/components/handlers/` —— app-shell(20-131)、dialog(29-76)、form(29-109)、menu(32-115)、menunav(21-63)、tabs(47-105)、toast(23-77)

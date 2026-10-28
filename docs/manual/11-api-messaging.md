# 11 · JS API 全表与跨页通信

> 适用版本：KurumiUI v1.3.9 ｜ 前置章节：10-actions-handlers.md、08-components.md ｜ 阅读时长：约 40 分钟

## 本章目标

- 按模块查 KUI 公开 API（含 `KUI.utils` 全部 45 个函数）；
- 认清 `el.__kui*`、`KUI.controls.*`、`KUI.form.*` 三种实例入口；
- 掌握 `kui-frame.js` 给业务 iframe 的对外 API；
- 对照协议表实现「父页面 ↔ iframe」的请求/响应、超时与错误处理；
- 会用 `?kui_debug=1`、`KUI.info()`、`KUI.diag` 调试。

## 0. 一句话概念

KUI 是挂在 `window` 上的单命名空间：核心提供工具与渲染，组件模块各自把 API 挂到 `KUI.<模块>`；业务 iframe 额外加载 `kui-frame.js`，用 `{__kui:true, type, requestId, payload}` 与父页面通信。

## 1. KUI 命名空间总览

实测 `Object.keys(KUI).length === 77`（v1.3.8；Node 24 下用 `test/dom-stub.js` + `test/load-kui.js` 按 app profile 加载——`config/kui-modules.json` 的 `profiles.app.files` 共 **28** 个文件——后枚举，其中不含 `KUI.frame`）。

| 分组 | 入口 | 职责 | 数量 |
| --- | --- | --- | --- |
| 核心 | `KUI` 顶层 | 元信息/日志/DOM/渲染/挂载 | 76 键 |
| 工具/事件/文案 | `utils`、`bus`、`events`、`i18n`、`text`、`fmt` | 工具函数、事件总线、字典 | 45/7/8/6 |
| 动作/业务函数 | `actions`、`handlers` | 28 动作、61 业务函数 | 5/11 |
| 配置/主题/注册表 | `config`、`theme`、`themeArt`、`registry` | 配置、主题、元素类型 | 14/32/5/12 |
| 图标/提示/头像 | `icons`、`tooltip`、`avatar` | SVG、气泡、头像 | 10/15/8 |
| 弹窗/提醒/表单 | `dialog`、`toast`、`form` | 弹窗通道、轻提醒、表单工厂 | 17/14/6 |
| 标签页/外壳/菜单 | `tabs`、`app`、`menu`、`menunav` | 静态代理与实例创建 | 26/15/2/2 |
| 控件/诊断/增强 | `controls`、`diag`、`enhance` | 装配入口、调试、原生升级 | 16/7/5 |
| iframe SDK | `KUI.frame`（仅加载 `kui-frame.js` 的页面） | 业务页 → 父页面桥 | 29 |

计数口径（v1.3.8 实测）：`theme` 共 36 键，其中 `_bus/_bus_get/_emit/_busReset` 是 4 个内部字段，公开方法 32 个；`themeArt` 有 `render/preview/clear/kinds/roman` 5 个入口；`KUI.frame` 单独加载 `src/frame/kui-frame.js` 后才出现，app profile 顶层没有 `frame` 键。

## 2. 核心 API（KUI 顶层）

### 2.1 元信息与日志

| 成员 | 签名 | 返回 | 说明 |
| --- | --- | --- | --- |
| `name` / `version` / `env` | 属性 | `'KurumiUI'` / `'1.3.8'` / `{isBrowser,isNode,nodeVersion}` | 版本四处一致 |
| `log` / `warn` / `error` | `(...args)` | `undefined` | 带 `[KurumiUI]` 前缀 |
| `warnOnce` | `(key, ...args)` | `undefined` | 同 key 只输出一次 |

### 2.2 事件总线

| 成员 | 签名 | 返回 | 说明 |
| --- | --- | --- | --- |
| `bus.on` / `bus.once` | `(name, fn)` | `bus` | 订阅 / 一次订阅 |
| `bus.off` | `(name?, fn?)` | `bus` | 省略即清空 |
| `bus.emit` | `(name, payload?)` | 结果数组 | 监听异常被捕获并 `KUI.error` |
| `bus.has` / `bus.count` / `bus.clear` | `(name?)` | boolean/number/bus | 查询与清空 |
| `events.create` / `createEmitter` | `()` | 独立发射器 | 字段同 `bus` |
| `events.on/once/off/emit/has/count` | 同 `bus` | — | 兼容层，委托 `KUI.bus`（`kui.js:403-408`） |

### 2.3 DOM 创建与操作

| 成员 | 签名与说明 | 返回 |
| --- | --- | --- |
| `h` | `(tag, attrs?, children?)`；第二参可省，支持 `class/style/dataset/on/text/html` | Element |
| `hs` / `frag` / `textNode` | `(html?)` / `(children?)` / `(text)` | Fragment / Fragment / Text |
| `addClass`/`removeClass`/`hasClass`/`toggleClass` | `(el, cls, force?)`；支持空格多类名 | el / boolean |
| `setStyle`/`setAttr`/`setAttrs`/`getAttr` | `(el, …)` | el / string |
| `on` | `(el, type, selector?, fn, opts?)`；selector 为字符串时事件委托 | 解绑函数 |
| `off`/`once`/`trigger` | `(el, type, fn?)` / `(el, type, detail?)`；trigger 派发 CustomEvent | el |
| `remove`/`empty`/`clearNode`/`insertAfter` | `(el, target?)` | el |
| `qs`/`qsa` | `(selector, root?)` | Element / Array |
| `elText` | `(el, value?)`；省略 value 读取 `textContent \|\| ''`，传入则写入并返回 el（`kui.js:723-728`） | string / Element |
| `isVisible`/`offset` | `(el)` / `(el)` | boolean / `{top,left,width,height}` |
| `viewport`/`raf`/`caf`/`nextFrame`/`ready` | `()` / `(fn)` / `(id)` / `(fn)` / `(fn)` | 对象 / id / — |

### 2.4 渲染与挂载

| 成员 | 签名 | 返回 | 说明 |
| --- | --- | --- | --- |
| `renderNode` | `(node, ctx?)` | Element \| null | 单个节点（含 `on`、`visible:false`、注册表查表） |
| `renderNodes` / `renderTree` | `(nodes\|node, host, ctx?)` | Element | 渲染并追加 |
| `mount` | `(type, host, node?, ctx?)` | inst | 返回 `{type, el, node, ctx, …api}` |
| `mountNode` / `mountAll` | `(node\|nodes, host, ctx?)` | inst / inst[] | 同义挂载 |
| `createContext` / `decorate` / `normalizeNodes` / `childNodes` | `(node?, ctx?)` / `(el,node,ctx)` / `(input)` / `(node)` | ctx / el / 数组 | 辅助 |

### 2.5 文案与信息

`KUI.text(key, fallback?, vars?)` 先查字典再回退；`KUI.fmt(str,vars)` 替换 `{name}`/`{0}`；`KUI.i18n={dict,set,reset,has,get,all}`；`KUI.info()` 见 9 节；`KUI.toggleFullscreen()` 返回是否全屏。

## 3. 模块 API 速查

### 3.1 config（14 键）

| 成员 | 签名 | 返回 | 说明 |
| --- | --- | --- | --- |
| `load` | `(name, opts?)` | Promise\<object\|null\> | fetch JSON，失败回退 `config/bundle.js` |
| `loadMany` | `(names, opts?)` | Promise\<map\> | 并行读取 |
| `loadText` | `(opts?)` | Promise\<dict\> | 读文案并注入 `KUI.i18n` |
| `get` | `(dotPath, fallback?)` | any | 只读缓存，如 `dialog.frameUrl` |
| `clear` / `isHttp` | `(name?)` / `()` | config / boolean | 清缓存 / 是否 http 模式 |

其余源码导出键 `base / cache / pathOf / paths / peek / resolveUrl / set / setReader` 供工具链与测试使用（`src/core/config.js:1-180`）。

### 3.2 theme（32 公开方法，另有 4 个内部字段）与 themeArt

| 分组 | 成员（签名） |
| --- | --- |
| 载入/应用 | `load(data)`、`init(data, opts?)`、`apply(id, opts?)`（opts：`persist/broadcast/silent/transition`）、`applyTokens(tokens)`（只写 CSS 变量） |
| 查询 | `current()`、`currentId()`、`currentTokens()`、`tokensOf(id)`、`get(id)`、`has(id)`、`ids()`、`list()`、`count()`、`defaultId()`（`theme.js:261`） |
| 轮换/初始 | `next()`、`prev()`、`toggleScheme()`、`resolveInitial(fallbackId?)`（优先级：early > URL > localStorage > 默认） |
| 注册/宿主 | `register(theme)`（`{id,name,scheme,tokens,art}`）、`setRoot/getRoot`、`setArtHost/getArtHost`、`refreshArt()` |
| 持久化/广播/事件 | `setStorageKey`、`getStorageKey`、`setPersist`、`clearPersisted`、`broadcast()`（推给所有 iframe）、`on/once/off`（事件 `change`） |
| `themeArt`（5 个入口） | `render(artConfig, host?, opts?)` 返回 `{el, destroy}` 或 `null`；另有 `preview/clear/kinds/roman`（`src/core/theme-art.js:461-591`） |

### 3.3 registry（12）／3.4 icons（10）／3.5 tooltip（15）／avatar（8）

| 模块 | 方法 | 说明 |
| --- | --- | --- |
| `registry` | `register(type,def)`、`registerMany(defs)`、`unregister`、`get`、`has`、`list`、`types`、`byCategory`、`count`、`onChange(fn)`、`version`、`reset` | `def` 至少含 `render`；返回规范化定义或 `null` |
| `icons` | `create(name,opts?)`、`into(host,name,opts?)`、`get(name,opts?)`、`symbol(name)`、`spriteMarkup()`、`register(name,body)`、`has`、`list`、`sprite()`、`spriteId` | 生成 SVG 元素 / 字符串 / sprite |
| `tooltip` | `init`、`destroy`、`bind(root?)`、`unbind`、`configure(patch?)`、`refresh`、`config`、`show(el,text,opts?)`、`hide`、`update(el?)`、`element`、`target`、`isVisible`、`defaults`、`version` | `bind` 扫描 `data-tooltip` |
| `avatar` | `create(host,props,ctx?)`、`mount`、`configure(patch)`、`mergeOptions(opts)`、`DEFAULTS`、`PRESETS`、`ring(opts)`、`svgUrl(...)` | 头像实例与预设、齿轮框 |

### 3.6 dialog（17）／toast（14）

| dialog | 签名 | 返回 | toast | 签名 | 返回 |
| --- | --- | --- | --- | --- | --- |
| `open` | `(config)` | Promise | `show` | `(options)` | id |
| `alert`/`confirm`/`prompt` | `(config)` | Promise | `info`/`success`/`warning`/`error`/`message` | `(message, opts?)` | id |
| `form`/`custom` | `(config)` | Promise | `notify` | `(options)` | id |
| `close` | `(id)` | boolean | `close` | `(id)` | boolean |
| `closeAll` | `()` | undefined | `closeAll` | `(filter?)` | boolean |
| `get`/`has`/`update` | `(id)` / `(id)` / `(id, patch)` | 快照/boolean/boolean | `clear`/`count`/`config` | `(patch?)` | — |
| `maximize`/`restore`/`count`/`top` | `(id)` / `(id)` / `()` / `()` | boolean/boolean/number/快照 | `notification` | `{show,close,closeAll,setPosition,getPosition}` | — |
| `defaults`/`config` | 属性 / `(patch)` | 默认值 | `defaults` | 属性 | 默认值 |

> toast 补充：`close` 公开只接受 `id`（`src/components/toast.js:459`，内部转 `closeById(id, reason)`）；第二个 `reason` 仅框架内部传（如 `'timeout'`、`'closeAll'`），公开签名不承诺。

### 3.7 tabs（26 静态）／app（15 静态）

`KUI.tabs` = `{defaults, create(host,props,ctx), get()}` + 23 个转发方法：`open/close/closeOthers/closeAll/activate/refresh/requestClose/setTitle/setIcon/setBadge/setDirty/updateUrl/getActive/getTabs/list/count/exists/back/forward/canBack/canForward/hasHistory/destroy`，均转发到最近实例，无实例返回 `undefined`（`src/components/tabs.js:1475-1502`）。

`KUI.app`：`create(host,conf,opts)`、`instance`、`instances`、`toggleCollapsed(force?)`、`setCollapsed(force)`、`isCollapsed()`、`openTab(tab)`/`open`、`closeTab(id)`、`refreshTab(id?)`、`selectMenu(id)`、`setBreadcrumb(items)`、`setTitle(title)`、`getActiveTab()`、`destroy()`；无实例时 `warnOnce('app-api:…')`（`app-shell.js:597-632`）。

### 3.8 menu/menunav/form/controls

| 模块 | 公开 API | 说明 |
| --- | --- | --- |
| `KUI.menu` | `create(host, props, ctx)`、`defaults` | 菜单实例 |
| `KUI.menunav` | `create(host, props, ctx)`、`defaults` | 导航实例 |
| `KUI.form` | `create(host, options)`、`version`、`evalWhen(when,data)`、`testOp`、`emptyValue`、`looseEq` | 后 4 个为纯函数（联动条件/空值/宽松比较） |
| `KUI.controls` | `files`、`entry`、`baseDir`、`init()`、`load(done?)`、`ready(fn)`、`define(type,def)`、`register`、`registerAll()`、`defs`、`base`、`popup` | 控件装配入口，细节见 05 章（`controls/index.js:29-241`） |

### 3.9 diag（7）／enhance（5）

| 模块 | 方法 | 说明 |
| --- | --- | --- |
| `diag` | `show()`、`log(kind,message)`、`lines()`、`copy()`、`clear()`、`enabled`、`version` | 调试面板 API |
| `enhance` | `scan(root?)`、`upgradeSelect(el)`、`grip(textarea)`、`list()`、`version` | 原生 `select`/`textarea` 升级 |

## 4. utils 全表（45 个）

| 分类 | 函数（签名） |
| --- | --- |
| 类型判断（13） | `isString/isNumber/isNumeric/isBoolean/isFunction/isArray/isObject/isPlainObject/isDate/isRegExp/isNil/isEmpty/isDom(v)`；返回 boolean，`isEmpty` 覆盖空串/空数组/空对象 |
| 通用（5） | `noop()`、`identity(v)`、`now()`、`clone(v)`、`toArray(v)` |
| 对象路径（7） | `assign(t,…s)`、`deepMerge(t,…s)`、`getByPath(o,path)`、`deepGet(o,path,fallback?)`、`setByPath(o,path,v)`、`pick(o,keys)`、`omit(o,keys)` |
| 数字（5） | `toInt(v,fallback?)`、`toFloat(v,fallback?)`、`clamp(n,min,max)`、`pad2(n)`、`round(n,precision?)` |
| 字符串（7） | `camel(s)`、`kebab(s)`、`upperFirst(s)`、`escapeHtml(s)`、`escapeAttr(s)`、`truncate(s,len,ellipsis?)`、`uid(prefix?)` |
| 日期时间（6） | `formatDate(date,pattern?)`、`parseDate(str)`、`daysInMonth(y,m)`、`isSameDay(a,b)`、`timeToSeconds(t,withSeconds?)`、`secondsToTime(s,withSeconds?)` |
| 函数（2） | `debounce(fn,wait)`、`throttle(fn,wait)` |

共 45 个；`KUI.debounce` / `KUI.throttle` 为别名。

## 5. 实例 API 约定

`renderNode` 给元素挂 `el.__kuiInstance`（`{type,el,node,ctx,…api}`）与 `el.__kuiCtx`（`kui.js:1062-1090`）；控件基类再挂 `el.__kuiControl`，组件另有 `__kuiForm/__kuiTabs/__kuiMenu/__kuiMenunav/__kuiDialogApi/__kuiToastApi/__kuiAvatar/__kuiApp`。取实例三法：`KUI.mount(...)` 返回值、`KUI.tabs.get()`/`KUI.app.instance`、读 `el.__kui*`。控件与表单实例 API 见 05/06/07 章；`KUI.form.create(hostOrSelector?, options)` 返回第 10 章 §3.4 的 17 个方法。

## 6. kui-frame.js：业务 iframe 的对外 API

业务页引入 `<script src="../src/frame/kui-frame.js"></script>`（不依赖主框架加载顺序；独立打开时静默降级）。该脚本只在加载它的页面注册 `KUI.frame`：业务 iframe / standalone 页面有（29 键），app profile 顶层没有 `frame`（实测 `'frame' in KUI === false`）。

| API | 签名 | 返回 | 说明 |
| --- | --- | --- | --- |
| `ready` | `(options?)` | api | 传函数或 `{title,dirty,onReady}`；收到 `tab:init` 后回调 |
| `boot` / `isFramed` / `version` | `()` / `()` / 属性 | — / boolean / string | 幂等启动、是否在 iframe、子页版本 |
| `setTitle` / `getTitle`；`setDirty` / `isDirty` | `(title)`；`(dirty)` | api / string；api / boolean | 标签标题与脏标记 |
| `toast` / `.info/.success/.warning/.error/.message` / `notify` | `(options)` | id | 交父页面统一呈现，无父级本地兜底 |
| `dialog` | `{alert,confirm,prompt,form,custom,open,close,closeAll}` | Promise | 请求父页面弹窗并取回结果 |
| `close` / `refresh` / `navigate` | `()` / `()` / `(tab)` | true / true / boolean | 关标签 / 重载 / 打开标签 |
| `getParams`；`getTab` | `()` | object；`{id,title,params,app,inited}` | query+init 参数；当前标签 |
| `theme` / `themeId` / `applyTheme` / `onTheme` / `setTheme` / `requestTheme` | `()` / `()` / `(payload)` / `(fn)` / `(id, extra?)` | 主题 / id / api / boolean | 主题读取、应用与请求 |
| `on` / `off` / `one` / `emit` | `(name, fn?)` 等 | api / 结果数组 | 页内事件，`emit` 同时广播 `frame:<name>` |
| `height` / `heightAuto` | `(value?)` / `(enable?)` | number / api | 上报高度（默认 scrollHeight）/ 自动上报（120ms 防抖） |
| `action` | `(action, params?)` | Promise | 父页面执行动作（30s 超时，失败返回 `null`） |

```js
// pages/home.html：就绪声明 + 关闭前拦截 + 弹父级确认框
KUI.frame.ready({ title: '首页', onReady: function (init) { KUI.log('init', init.tabId); } });
KUI.frame.on('before-close', function () {
  return KUI.frame.dialog.confirm('有未保存内容，确定关闭？');   // false 阻止关闭
});
```

生命周期：`boot()` 发 `frame:ready`（每 600ms 重试，最多 5 次）→ 父级回 `tab:init` → 应用主题、触发 `init`/`ready` 并执行排队回调；版本不一致时带 `?kui_v=<父版本>` 刷新一次（`kui-frame.js:480-527`）。

## 7. postMessage 协议全表

### 7.1 信封与校验

信封：`{ __kui: true, type: 'frame:title', requestId: '', payload: { title: '首页' } }`（`requestId` 仅请求需要，放信封不放 payload）。

- 子 → 父：`parent.postMessage(msg, '*')`（`kui-frame.js:104-115`）；父 → 子：`iframe.contentWindow.postMessage(msg, '*')`（`tabs.js:1205`、`dialog.js`）。
- `targetOrigin` 为 `'*'`（框架面向 `file://` 与任意 host）；同源部署可自行收紧。
- 校验：`data.__kui === true`；父侧比 `event.source === iframe.contentWindow`（`tabs.js:1210-1215`），子侧比 `event.source === window.parent`（`kui-frame.js:356-363`）。
- 请求关联：`requestId` 放**信封**（不放 payload），子页 `request()` 生成 `kfr<序号>-<时间36进制>`，父级回执带同一 id（`kui-frame.js:117-150`、`tabs.js:1121-1156`）。

### 7.2 父 → 业务页

| type | payload | 子页行为（行号） |
| --- | --- | --- |
| `tab:init` | `{tabId,title,params,theme,app:{title},parentVersion,src}` | 记录状态、应用主题、触发 `init`/`ready`、清就绪队列、版本自愈（365-379） |
| `tab:before-close` | `{}` | 调 `before-close` 监听，异步等待后回 `tab:close-result{ok}`（417-448） |
| `tab:refresh` / `tab:activate` | `{}` | 触发 `refresh` / `activate`（385-400） |
| `theme:change` / `theme:apply` | `{id,name,scheme,tokens}` | 应用主题并触发 `theme`（392-396） |
| `frame:dialog-result` | `{value}` + 信封 `requestId` | settle 对应 pending Promise（401-404） |
| `frame:action` | `{action, params}` | 在业务页执行 `K.actions.run(action, makeCtx)`（405-413） |

### 7.3 业务页 → 父（tabs 处理，`tabs.js:1210-1257`）

| type | payload | 父侧行为 |
| --- | --- | --- |
| `frame:ready` | `{title}` | `sendInit(tab)` 回 `tab:init` |
| `frame:title` / `frame:dirty` | `{title}` / `{dirty}` | 同步标题 / 脏标记 |
| `frame:toast` | toast 配置 | `KUI.toast.show(payload)` |
| `frame:dialog` | `{method, config}` + `requestId` | 调 `KUI.dialog[method]`，回 `frame:dialog-result{value}`；无 dialog 时原生弹窗兜底（1121-1156） |
| `frame:close` | `{}` | `requestClose(tab)`：先 `tab:before-close` 等 260ms |
| `frame:height` | `{height}` | 触发 tabs `height` 事件 |
| `frame:navigate` | `{tab}` | `open(tab)` |
| `frame:theme` | `{id,name,scheme,tokens}` | 应用并广播；未注册时用 tokens 现场注册（1165-1197） |
| `frame:theme-request` | `{}` | 向该 iframe 推 `theme:apply`（1200-1208） |
| `tab:close-result` | `{ok}` | 完成关闭回执 |

### 7.4 父 → 弹窗页（`dialog-frame.js`）

打开流程：`open(config)` 建记录与 iframe（`src=dialog-frame.html?kui_v=<版本>`）→ `dialog:init` 传 `{dialogId,method,config,theme}`（`dialog.js:365-370`；函数被 `sanitizeForPost` 剥离，深度 12）→ 渲染完 `dialog:ready` → 结果 `dialog:resolve`/`dialog:cancel`（`confirm`→`false`，`prompt/form`→`null`）；动作桥与嵌套弹窗见 7.5。

| type | payload | 行为 |
| --- | --- | --- |
| `dialog:init` | `{dialogId, method, config, theme}`（`dialog.js:365-370`） | 记录 id、应用主题、按 method 渲染 |
| `dialog:update` | `{patch:{maximized}}`（`dialog.js:553`；子页兼容读 `patch \|\| config`） | 增量更新并重渲染 |
| `dialog:close` | `{}` | 关闭并回传 |
| `theme:apply` | `{id,name,scheme,tokens}` | 同步主题 |
| `dialog:form-error` | `{message}`（`dialog.js:672`） | 显示提交失败信息 |
| `dialog:open:result` / `dialog:action:result` | `{value}` / `{ok,result,error}` + `requestId` | 完成嵌套弹窗 / 动作桥请求 |

### 7.5 弹窗页 → 父（`dialog.js` 处理）

| type | payload | 父侧行为（行号） |
| --- | --- | --- |
| `dialog:ready` | `{dialogId, version}`（`dialog-frame.js:1224`） | 首帧就绪：发 `dialog:init`；版本不符重载一次；重复 ready 熔断（705） |
| `dialog:resize` | `{height}` | 调 iframe 高度（上限 80vh）（730） |
| `dialog:resolve` / `dialog:cancel` | `{value}` / `{dialogId}`（`dialog-frame.js:374,380`） | resolve 结果 / 取消默认值（733、736） |
| `dialog:toast` / `dialog:debug` | toast 配置 / `{message}` | 转 `KUI.toast.show` / 转发 `diag`（739、744） |
| `dialog:clicked` | `{text}` | 按钮反馈提示（750） |
| `dialog:open` | `{config}` + `requestId` | 打开嵌套弹窗并回 `dialog:open:result`（759） |
| `dialog:theme-request` / `dialog:action` | `{}` / `{action,params}` + `requestId` | 推主题 / 父级执行动作（763、766） |
| `dialog:form-submit` | `{data}` | `submitApi`→`onOk`→resolve 并关闭；失败回 `dialog:form-error`（769） |
| `dialog:drag-start/move/end` | `{x,y}` | 拖拽（772-778） |

### 7.6 关联、超时、错误与 sandbox

| 关注点 | 规则 |
| --- | --- |
| 请求关联 | 信封 `requestId`；子页 `pending` 表按 id 存 resolve/reject；父级回执须带同一 id |
| 超时 | `request()` 默认 60000ms；`KUI.frame.action` 显式 30000ms；超时 reject `Error('timeout')` |
| 失败码 | `not-framed`（无父级）、`post-failed`、`timeout`、`failed` |
| 错误处理 | `dialog.*` Promise 由调用方 catch；`action()` 内置 catch 返回 `null` |
| origin | 发送 `'*'`，接收侧用 `event.source` 精确比对，不依赖 origin 字符串 |
| sandbox | 自加 `sandbox` 至少保留 `allow-scripts`（否则 kui-frame.js 不执行）；`allow-same-origin` 影响访问 `parent/top`；框架自身 iframe 以 `dialog.js`/`tabs.js` 为准 |

### 7.7 时序图（业务页请求父级弹确认框）

```text
业务 iframe                        主框架（tabs + dialog）
  |-- frame:dialog {method,config} --->| 校验 source/__kui
  |   requestId=kfr1-xxx               |-- dialog:init ---> 弹窗 iframe
  |                                    |<-- dialog:resolve {value:true}
  |<-- frame:dialog-result -----------| settle(requestId, true)
```

## 8. 完整示例：父页面开弹窗并取回结果

```js
// 主页面：表单弹窗，拿到用户提交的数据
KUI.dialog.form({
  title: '新建订单', width: 520,
  submitApi: function (data, rec) {           // 必须是函数（见下方说明）
    // 校验/保存：返回 Promise 或抛错；返回 false 保持弹窗打开
    return KUI.toast.success('已保存：' + data.name);
  },
  nodes: [{ type: 'input', id: 'name', props: { label: '名称', required: true } }]
}).then(function (data) {                     // 提交→表单数据；取消→null
  if (data) KUI.toast.success('已创建：' + data.name);
});
```

> `submitApi` **必须是函数**（`dialog.js:664,674`：`typeof submitApi !== 'function'` 时直接 `finish(data)`）。留空或传非函数时，表单只收集数据、不提交（以表单数据 resolve）；字符串不会被解析成业务函数，写了也不执行。

## 9. 调试

- **`?kui_debug=1`**：URL 参数或 `localStorage['kui-debug']='1'` 启用诊断面板（`diag.js:235-241`）；滚动显示 `boot/error/longtask/focus/type/msg` 日志，钩子含全局错误、长任务、焦点、输入耗时与 postMessage 摘要。
- **`?debug=1`**：仅 `bootstrap.js:925` 判断（`opts.debug || /[?&]debug/`），打印启动步骤，与 `kui_debug` 互不替代。
- **`KUI.info()`**：app 沙箱实测 `{name:'KurumiUI', version:'1.3.8', controls:41, themes:0, env:{isBrowser:true,isNode:false,nodeVersion:null}}`。`themes` 为 `KUI.theme.list()` 长度：未调用 `load/init` 时为 0，standalone 主页面加载 6 套主题后为 6；`controls` 为注册表内控件类型数。

```js
KUI.app.instance;  KUI.tabs.get();                       // 全局入口
document.querySelector('.kui-tabs').__kuiTabs;           // DOM 反查
document.querySelector('#name').__kuiControl;            // 控件 API
KUI.registry.list(); KUI.diag.lines().slice(-10);        // 类型与最近诊断
```

## 10. 常见错误与排查

| 现象 | 常见原因 | 处理 |
| --- | --- | --- |
| `KUI.frame` 不存在 | 业务页没引 `kui-frame.js`；或误在主 app 页面找它 | 业务 iframe / standalone 页面加载 `src/frame/kui-frame.js`（app profile 顶层无 `frame`） |
| 父级收不到 `frame:ready` | 子页过早报错或信封缺 `__kui` | 看诊断面板，核对信封字段 |
| 弹窗结果拿不到 | 父级没回执或 `requestId` 放错位置 | 回执把 `requestId` 放信封 |
| 子页收到 `undefined`/拿不到值 | config 传给 iframe 前被 `sanitizeForPost` 剥离函数、`undefined`、Symbol、BigInt、DOM、循环引用 | 子页要用的只传可序列化数据；`submitApi`/`onOk`/`onCancel` 由父页面持有，可直接写在 config 里 |
| 主题不同步 | 子页主题脚本缺失 | 子页收到 `theme:apply` 会直接写 CSS 变量兜底 |
| 改完不生效 | 命中旧缓存文档 | URL 加 `?kui_v=1.3.8` 强刷 |
| 找不到 utils 文件 | 误以为有 `src/core/utils.js` | utils 在 `kui.js` 内并挂 `KUI.utils` |
| 控制台 `未注册的动作/业务函数`、`动作 xxx 需要 yyy`、`配置读取失败（…）`、`主题不存在: xxx`、`未注册的元素类型` | 动作名错、组件未加载、短名无 ctx、无 bundle、未注册主题 | `KUI.actions.list()`/`handlers.list()` 核对并写全 `scope.name`；`npm run build:config`、`KUI.theme.ids()`；检查 profile 并加 `?kui_v=<版本>` |

## 本章自检

```bash
node -e "var s=require('./test/dom-stub.js'),e=s.createEnvironment({root:process.cwd(),fileMode:true}),lk=require('./test/load-kui.js'),r=lk.loadKui(e,{});var K=e.window.KUI;console.log('top',Object.keys(K).length);console.log('utils',Object.keys(K.utils).length);console.log('reg',K.registry.count());console.log(JSON.stringify(K.info()));"
# 预期：top 76  utils 45  reg 40；info 含 name/version/controls=40/themes=0/env（app 沙箱未载入主题）
```

```js
KUI.utils.debounce; KUI.bus.on; KUI.theme.on;      // app profile 入口均存在
KUI.frame.ready;                                   // 仅在加载 kui-frame.js 的页面存在，app 内为 undefined
KUI.info().version;                                // '1.3.8'
KUI.registry.list().length;                        // 40
```

## 参考源码

- `src/core/kui.js:400-540,913-937,1062-1090` —— 事件兼容层、i18n/text/fmt、DOM 助手、createContext 与实例属性
- `src/core/config.js:180-277`、`src/core/theme.js:300-461`、`src/core/theme-art.js:461-591` —— 配置、主题与装饰层
- `src/core/registry.js:51-182`、`icons.js:156-246`、`tooltip.js:488-512`、`avatar.js:542-637` —— 模块 API；`diag.js:222-241`、`dom-enhance.js:306-323` —— 调试与增强
- `src/components/dialog.js:1086-1153`、`tabs.js:1106-1257,1475-1502`、`app-shell.js:597-632` —— 组件静态 API 与 tabs 消息处理
- `src/frame/kui-frame.js:104-150,356-527,685-830`、`dialog-frame.js:1166-1215,219,280,327,374,380,1123-1134,1224,1259,1354` —— 两套 iframe 协议
- `src/components/controls/index.js:29-241`、`src/core/kui-all.js:8-40` —— 控件装配与 profile

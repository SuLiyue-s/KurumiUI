# 06 · 其余控件（动作 / 展示 / 反馈 / 数据 / 布局）

> 适用版本：KurumiUI v1.3.9 ｜ 前置章节：`05-controls-input.md`（表单控件）、`04-config-app.md`（`avatar` 段） ｜ 阅读时长：约 30 分钟

## 本章目标

- 按 5 列表查遍 14 个非表单控件的 props，默认值全部来自源码。
- 抄对 85 个内置图标名，并知道 button / tag / upload / pagination 如何复用。
- 会写 `table` 的列定义、空态、行点击，并明确它**没有**排序 / 固定列 / 多选。
- 会把 `upload` 接进表单；分清 `avatar` 控件 props 与 `app.json.avatar` 两套默认值。

## 0. 一句话概念

`props` 统一写在 `"props"` 里，合并规则 `propsOf(node, defaults) = merge({}, defaults, getProps(node))`（`src/components/controls/misc.js:22-24`），顶层同名字段只作兜底（`src/core/control-base.js:400-430`）。`size` 空或 `md` 不加类，其余加 `<prefix>--<size>`（`misc.js:25-28`）。`color` 经 `colorValue()`（`misc.js:39-45`）：`#hex/rgb()/hsl()/var()/linear-gradient()` 原样，其余当 token 名拼 `var(--kui-<名>)`（`"accent"` → `var(--kui-accent)`，见 09 章）。`on.xxx` 绑原生事件（`src/core/kui.js:981-994`）；`change` 走 `emitChange`（`control-base.js:700-707`）；通用 `getValue/setValue/validate/focus/destroy` 由 `finalize` 注入（`control-base.js:950-996`，实例取法见 11 章）。本章覆盖 `button/link`、`icon/text/tag/badge/avatar`、`divider/field`、`alert/progress`、`table/pagination/upload`；`form` 见 07 章，`dialog/toast/menu/menunav/tabs/app-shell` 见 08 章。

---

## 1. 动作类

### 1.1 button（`src/components/controls/inputs.js:64-183`）

```json
[{ "type": "button", "props": { "text": "保存", "variant": "primary", "icon": "save" } },
 { "type": "button", "props": { "text": "同步中", "icon": "refresh", "loading": true } }]
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `text` | string | `''` | 否 | 文案；空且非 `iconOnly` 回退 i18n「按钮」（`inputs.js:93-94`） |
| `variant` | string | `'default'` | 否 | `default/primary/secondary/success/warning/danger/ghost/text`，非 default 输出 `kui-btn--<v>`（`inputs.js:84-86`，样式 `controls.css:279` 起） |
| `size` | string | `'md'` | 否 | `sm/md/lg` |
| `icon` / `iconRight` | string | `''` | 否 | 左 / 右图标名（见 2.1） |
| `block` / `round` | boolean | `false` | 否 | 撑满父宽 / 胶囊圆角 |
| `iconOnly` | boolean | `false` | 否 | 只显图标；`aria-label` 取 `title`→`text`→i18n（`inputs.js:115-119`） |
| `loading` | boolean | `false` | 否 | 转圈 + `aria-busy`，点击被拦（`inputs.js:131-147`） |
| `disabled` | boolean | `false` | 否 | 原生 `<button disabled>` |
| `title` | string | 未设（undefined） | 否 | 原生提示，`iconOnly` 时兼无障碍名（`inputs.js:116-118`） |
| `value` | any | `null` | 否 | 业务值（`inputs.js:124`） |
| `pressed` | boolean | 未设（undefined） | 否 | 真时 `aria-pressed="true"`（`inputs.js:174`） |
| `action` | string \| object | 未设（undefined） | 否 | 点击执行的动作（`inputs.js:146`，语法见 10 章） |

事件 `click` → `{ event, value }`，先跑 `props.action` 再派发 `on.click`（都配会都跑，`inputs.js:146-147`）；API `getValue/setValue/setText/setLoading/focus`（`150-170`）；坑：`text` 留空显示「按钮」，`loading` 不改 `value`，未知 `variant` 不报错只是没样式。

### 1.2 link（`src/components/controls/misc.js:320-410`）

```json
{ "type": "link", "props": { "text": "查看文档", "href": "https://example.com/docs", "target": "_blank", "icon": "external-link" } }
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `text` | string | `''` | 否 | 链接文字 |
| `href` | string | `''` | 否 | 空时用 `javascript:void(0)` + `role="link"`（`misc.js:339-348`） |
| `target` | string | `''` | 否 | `_blank` 自动加 `rel="noopener noreferrer"`（`misc.js:341-343`） |
| `type` | string | `'default'` | 否 | `default/primary/secondary/success/warning/danger/info` |
| `underline` | boolean | `false` | 否 | 常显下划线 |
| `disabled` | boolean | `false` | 否 | `is-disabled`+`aria-disabled`+`tabindex="-1"`，点击被拦（`misc.js:364-378`） |
| `icon` | string | `''` | 否 | 附加图标 |
| `iconPosition` | string | `'right'` | 否 | `left` 在文字前，其余在文字后（`misc.js:356-357`） |

事件 `click` 先 `emitAction`；配了 `on.click`/`clickAction`/`action` 则 `preventDefault` 并执行，否则按 `href` 跳转（`373-385`），Enter/空格等价（`387-392`）；API `getValue`（文字）、`setValue/setText/setHref/setType/setDisabled`；坑：`disabled` 只是样式 + 拦截，不是原生禁用。

---

## 2. 展示类

### 2.1 icon（控件 `src/components/controls/misc.js:437-496`，图标库 `src/core/icons.js`）

```json
{ "type": "icon", "props": { "name": "crown", "size": "lg", "color": "accent", "spin": false } }
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `name` | string | `''` | 是 | 图标名；不存在时静默渲染 `question`（`icons.js:216`） |
| `size` | string | `'md'` | 否 | `sm/md/lg` → `kui-iconbox--<size>`；SVG 默认 16px |
| `color` | string | `''` | 否 | 颜色表达式或语义 token 名（同 0 节） |
| `rotate` | number | `0` | 否 | 顺时针角度，内联 `transform: rotate()` |
| `spin` | boolean | `false` | 否 | 持续旋转（`is-spin`） |

**85 个内置图标**（5 组，括号为 `src/core/icons.js` 定义行区间）：

| 分组（行号） | 数量 | 图标名 |
| --- | --- | --- |
| 通用（31-64） | 34 | `home clock gear terminal chart folder file image code database link mail message share settings power sun moon wave feather cross shield target palette star heart pin lock unlock eye eye-off calendar timer clock-hand` |
| 状态（67-73） | 7 | `info success warning error question spinner check` |
| 方向（76-85） | 10 | `chevron-up chevron-down chevron-left chevron-right arrow-up arrow-down arrow-left arrow-right expand collapse` |
| 操作（88-112） | 25 | `plus minus close search refresh fullscreen exit-fullscreen more-h more-v grid list save download upload trash edit copy external-link drag filter sort menu play pause refresh-cw` |
| 导航/实体（115-123） | 9 | `user users bell book cube layers lightning crown key` |

事件：无。API：`setIcon/setSize/setColor/setSpin/setRotate/getValue/setValue`（`misc.js:467-495`）。坑：名字错不报错直接显示问号（`create()` 兜底 `icons.js:216`，只有 `get()` warn `181-185`）；分页的 `more-horizontal` 是源码笔误（`misc.js:1089`，库里只有 `more-h`）；`refresh` 与 `refresh-cw` 图形相同（`icons.js:92`、`112`）。

### 2.2 text（`src/components/controls/misc.js:509-580`）

```json
{ "type": "text", "props": { "text": "距离下次同步 02:14:37", "type": "secondary", "align": "left", "truncate": true } }
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `text` | string | `''` | 否 | 文本（只读 `props.text`，`misc.js:46-49`） |
| `type` | string | `'default'` | 否 | 白名单 `primary/success/warning/danger/info/secondary/muted`（`misc.js:522`） |
| `size` | string | `'md'` | 否 | `xs/sm/md/lg/xl/2xl`，md 不加类（`misc.js:523`） |
| `weight` | string | `''` | 否 | 字重 → `is-weight-<v>` |
| `align` | string | `''` | 否 | `left/center/right` |
| `truncate` | boolean | `false` | 否 | 单行省略，与 `lines>1` 二选一 |
| `lines` | number | `0` | 否 | >1 时 `-webkit-line-clamp` 多行截断（`misc.js:538-545`） |
| `block` | boolean | `false` | 否 | 用 `<div>` 渲染（`misc.js:527`） |
| `tag` | string | `''` | 否 | 自定义标签名，优先于 `block` |
| `code` | boolean | `false` | 否 | 用 `<code>` 渲染（`misc.js:547-551`） |

事件：`setText` 触发 `change`（`misc.js:558`）。API：`getValue/setValue/setText/setType`。坑：`type` 只认白名单，写 token 名无效。

### 2.3 tag（`src/components/controls/misc.js:55-170`）

```json
{ "type": "tag", "props": { "text": "已同步", "type": "success", "icon": "check", "plain": true, "round": true } }
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `text` | string | `''` | 否 | 标签文字 |
| `type` | string | `'default'` | 否 | 直接拼 `kui-tag--<v>`（`misc.js:74`）：`default/primary/secondary/success/warning/danger/info/error` |
| `size` | string | `'md'` | 否 | `sm/md/lg` |
| `closable` | boolean | `false` | 否 | 显示关闭按钮 |
| `round` / `plain` | boolean | `false` | 否 | 胶囊 / 描边浅色（`misc.js:76-79`） |
| `icon` | string | `''` | 否 | 文字前图标 |
| `color` | string | `''` | 否 | 自定义色，加 `is-custom-color` 并覆盖 `type` 色（`misc.js:80-82`） |

事件：`close` → `emitAction('close')`，再取 `on.close`/`props.closeAction`（`misc.js:119-121`）。API：`getValue/setValue/setText/setType/setClosable`。坑：关闭只加 `is-closed` + `display:none`，节点不销毁、不可恢复。

### 2.4 badge（`src/components/controls/misc.js:173-250`）

```json
[{ "type": "badge", "props": { "count": 128, "max": 99 } },
 { "type": "badge", "props": { "text": "NEW", "type": "primary" } }]
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `text` | string | `''` | 否 | 文本角标，优先于 `count` |
| `count` | number | `0` | 否 | 数字；`<=0` 且未开 `showZero` 不显示 |
| `max` | number | `99` | 否 | 超上限显示 `max+` |
| `dot` | boolean | `false` | 否 | 只显示小红点 |
| `type` | string | `'danger'` | 否 | `default/danger/primary/secondary/success/warning/info/accent/error` |
| `size` | string | `'md'` | 否 | `sm/md/lg` |
| `showZero` | boolean | `false` | 否 | `count:0` 也显示 |

事件：无。API：`getValue`（有文字回文字，否则数字）、`setValue/setCount/setType/setDot`。坑：`dot` 与 `count` 并存只显点；`max` 只作用于数字。

### 2.5 avatar（控件 `src/core/avatar.js:639-661`，实现 `91-601`）

```json
{ "type": "avatar", "props": { "url": "data:image/svg+xml,…", "size": 44, "editable": true, "frame": { "enabled": true, "style": "clock-gear", "spinDuration": 48 } } }
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `url` | string | `''` | 否 | `http(s)` / 相对路径 / `data:image/…` |
| `editable` | boolean | `false` | 否 | 允许点击打开更换弹层 |
| `persist` / `storageKey` | boolean / string | `false` / `'kui-avatar'` | 否 | 自定义头像写 localStorage 及键名 |
| `size` | number | `44` | 否 | 边长（px） |
| `shape` | string | `'circle'` | 否 | `circle/square` |
| `alt` / `title` | string | `'头像'` / `''` | 否 | `<img alt>` / 原生提示 |
| `clickTitle` | string | `'更换头像'` | 否 | 可编辑时悬停提示 |
| `fallbackIcon` / `fallbackText` | string | `'clock'` / `''` | 否 | 无图时图标 / 文字兜底 |
| `frame.enabled` | boolean | `true` | 否 | 齿轮装饰环 |
| `frame.style` | string | `'clock-gear'` | 否 | 当前只实现 `clock-gear` |
| `frame.showTicks/showRoman/showHands` | boolean | `true/false/true` | 否 | 刻度 / 罗马数字 / 指针 |
| `frame.animated` | boolean | `true` | 否 | 旋转动画；`prefers-reduced-motion` 时自动关 |
| `frame.spinDuration` | number | `48` | 否 | 一圈秒数：正顺、负逆、`0` 停（**不是毫秒**） |
| `picker.*` | object | 见源码 | 否 | `title/width/urlLabel/urlPlaceholder/urlTip/clearLabel/allowClear/okText/cancelText/mode/accept/maxSizeMB/presets` |

`config/app.json:720-754` 的 `avatar` 段是应用级默认（`size:42` 等全量）；JSON 控件只走注册表默认 `url/editable/size:44/frame.{enabled,style,spinDuration}`（`avatar.js:644-649`），再与完整 `DEFAULTS` 深合并，因此全字段可用；改全局默认用 `KUI.avatar.configure(patch)`（`615-618`）。持久化、iframe 见 04 章，齿轮绘制见 11 章。API：`getUrl/hasCustom/setUrl(url, extra)/setEditable/pickFile(override)/setSpinDuration/getSpinDuration/refresh/destroy`（`542-601`），静态 `KUI.avatar.ring(opts)`（`620-636`）。坑：注册表默认 `editable:false`，点不动要先打开；`persist` 依赖 `storageKey`，清缓存即丢。

### 2.6 divider（`src/components/controls/misc.js:254-318`）

```json
{ "type": "divider", "props": { "text": "基础信息", "textPosition": "left", "dashed": false } }
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `orientation` | string | `'horizontal'` | 否 | `horizontal/vertical`；纵向加 `is-vertical` + `aria-orientation` |
| `text` | string | `''` | 否 | 横线文字；空则通栏细线 |
| `textPosition` | string | `'center'` | 否 | `left/center/right`，非法值按 center |
| `dashed` / `plain` | boolean | `false` | 否 | 虚线 / 文字次级色 |

事件：无。API：`getValue/setValue`。坑：纵向线需父容器有高度；纵向时 `text` 被忽略。

---

## 3. 反馈类

### 3.1 alert（`src/components/controls/misc.js:590-710`）

```json
{ "type": "alert", "props": { "type": "warning", "title": "尚未同步", "text": "本地副本与灵装回路不一致。", "closable": true } }
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `type` | string | `'info'` | 否 | `info/success/warning/error`，非法值回落 info（`misc.js:598-604`） |
| `title` / `text` | string | `''` | 否 | 标题 / 正文，空节点不渲染 |
| `closable` | boolean | `true` | 否 | 显示关闭按钮 |
| `showIcon` | boolean | `true` | 否 | 左侧状态图标 |
| `banner` | boolean | `false` | 否 | 通栏样式（不自动铺满） |

事件：`close` → `emitAction('close',{type})`，再取 `on.close`/`closeAction`（`misc.js:651-653`）；关闭只是 `is-closed` 隐藏。API：`getValue/setValue/setType/setTitle/setClosable`。坑：`title`+`text` 都空只剩色块。

### 3.2 progress（`src/components/controls/choices.js:784-852`）

```json
{ "type": "progress", "props": { "value": 68, "status": "success", "showText": true, "striped": true, "animated": true } }
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `value` | number | `0` | 否 | 百分比，内部 clamp 0–100 并保留 2 位 |
| `status` | string | `''` | 否 | `success/warning/danger` 等状态色，空为强调色 |
| `showText` | boolean | `true` | 否 | 显示百分比文字 |
| `textInside` | boolean | `false` | 否 | 文字放进条内（值很小时溢出） |
| `striped` / `animated` | boolean | `false` | 否 | 条纹 / 条纹流动（animated 需 striped） |
| `size` | string | `'md'` | 否 | `sm/md/lg` 条高 |

事件：`change` 载荷为数值。API：`getValue/setValue/setStatus`。

---

## 4. 数据类

### 4.1 table（`src/components/controls/misc.js:714-909`）

```json
{ "type": "table", "props": {
  "rowKey": "id", "bordered": true, "maxHeight": 320, "emptyText": "暂无同步记录",
  "columns": [ { "key": "id", "title": "编号", "width": 88, "align": "center" }, { "key": "event", "title": "事件" } ],
  "data": [ { "id": 1, "event": "灵装同步" }, { "id": 2, "event": "回溯校准" } ] } }
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `columns` | array | `[]` | 是 | 列定义（见下表）；空时表头也隐藏（`misc.js:804`） |
| `data` | array | `[]` | 否 | 行数据，非空时优先于 `rows`（`misc.js:762`） |
| `rows` | array | `[]` | 否 | `data` 的别名兜底 |
| `bordered` | boolean | `false` | 否 | 边框 |
| `striped` | boolean | `true` | 否 | 斑马纹（**默认开**） |
| `hoverable` | boolean | `true` | 否 | 悬停高亮 |
| `size` | string | `'md'` | 否 | `sm/md/lg` |
| `loading` | boolean | `false` | 否 | 遮罩 + `refresh` 图标 +「加载中…」（`785-788`） |
| `emptyText` | string | `''` | 否 | 空态文字，空则 i18n「暂无数据」（`790-792`） |
| `showHeader` | boolean | `true` | 否 | 显示表头 |
| `rowKey` | string | `'id'` | 否 | 主键字段，`getValue()` 按它取值（`863-872`） |
| `maxHeight` | number \| string | `0` | 否 | 限高滚动，数字按 px（`782-784`） |

columns 全字段（唯一实现 `normColumns`，`misc.js:729-749`）：

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `key` | string | 无 | 是 | 取值字段，支持点路径（`base.deepGet`，`misc.js:753`） |
| `prop` / `dataIndex` | string | 无 | 否 | `key` 的别名（`key ?? prop ?? dataIndex`） |
| `title` / `label` | string | 缺省取 `key` | 否 | 表头文字 |
| `width` | number \| string | `''` | 否 | 数字按 px，字符串原样 |
| `align` | string | `''` | 否 | `left/center/right`，表头与单元格同生效 |
| `formatter` | function | `null` | 否 | `formatter(value,row,index)` 返回文本/DOM，仅限 JS |
| `render` | function | `null` | 否 | 同签名，优先于 `formatter`，返回 DOM 节点直接挂载（`817-822`） |

数据只来自 `data`（优先）或 `rows`；空数组渲染 `colspan=列数` 的 `.kui-table__empty` 并加 `is-empty`（`841-847`）；单元格顺序 `render` → `formatter` → 原值文本，`formatter` 抛错被吞当空值。事件：`rowClick` → `{ row, index }`，键盘 Enter 多带 `keyboard:true`（`825-835`）。API：`getValue`（`rowKey` 值数组）、`setValue/setData`（触发 change）、`getData/setColumns/getColumns/setLoading`（`862-900`）。坑：**没有** `sortable/fixed/selection/expandable/pagination` 字段（默认值仅 12 键，`714-727`）；分页要另放控件并在动作里 `setData`；`formatter/render` 写不进 JSON；行点击不自动高亮；`striped` 默认 `true`。

### 4.2 pagination（`src/components/controls/misc.js:915-1118`）

```json
{ "type": "pagination", "props": { "page": 1, "pageSize": 20, "total": 137, "showSizer": true, "showJumper": true } }
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `page` | number | `1` | 否 | 当前页（1 起） |
| `pageSize` | number | `10` | 否 | 每页条数 |
| `total` | number | `0` | 否 | 总条数；页数 `max(1, ceil(total/pageSize))`（`994-996`） |
| `pageSizes` | array | `[10,20,50,100]` | 否 | 条数下拉选项 |
| `simple` | boolean | `false` | 否 | 简洁模式：上一页/页码/下一页 |
| `showTotal`/`showSizer`/`showJumper` | boolean | `true/false/false` | 否 | 总数 / 条数选择 / 跳页 |
| `size` | string | `'md'` | 否 | `sm/md/lg` |
| `maxButtons` | number | `7` | 否 | 页码按钮上限，超出省略 |
| `prevText`/`nextText` | string | `''` | 否 | 上/下一页文案，空走 i18n |

事件：`change` 载荷 `{ page, pageSize, total }` + `reason`（`997-1003`）：`page`（点页/上下页）、`pageSize`（换条数，页码重置为 1，`1028-1032`）、`jump`（跳页：`buildJumper()` 的回车与失焦两条路径都调 `go(input.value,'jump')`，`misc.js:1049、1054`，即 `reason === 'jump'`；不存在 `'jumper'` 值）。API：`getValue/setValue/setPage/getPage/setTotal/setPageSize`（`1119-1150`）。坑：**没有 `layout` 字段**，只能靠 4 个开关组合；「更多页」用了不存在的 `more-horizontal`（`1089`），显示问号；页码受控，`total` 变小不自动修正超界页。

### 4.3 upload（`src/components/controls/misc.js:1164-1544`）

```json
{ "type": "upload", "props": { "accept": ".zip,.json", "multiple": true, "maxCount": 3, "maxSize": 5242880, "drag": true, "autoUpload": false, "triggerText": "选择灵装包" } }
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `accept` | string | `''` | 否 | 写入 `<input accept>`；校验按逗号匹配扩展名/MIME/`image/*`（`1183-1206`） |
| `multiple` | boolean | `false` | 否 | 多选 |
| `maxCount` | number | `0` | 否 | 最多文件数，0 不限；超限派发 `exceed`（`1409`） |
| `maxSize` | number | `0` | 否 | 单文件字节上限（**字节**），0 不限；超限派发 `sizeError`（`1417`） |
| `drag` | boolean | `true` | 否 | 拖拽区；false 仅点击选择 |
| `showTip` / `tip` | boolean / string | `true` / `''` | 否 | 自动提示 / 自定义提示（`1234-1248`） |
| `disabled` | boolean | `false` | 否 | 禁用选择与拖拽 |
| `action` | string | `''` | 否 | 上传地址；空则无法发请求 |
| `method` / `name` | string | `'POST'` / `'file'` | 否 | XHR 方法 / 表单字段名 |
| `headers` / `data` | object | `{}` | 否 | 额外请求头 / 额外表单字段 |
| `autoUpload` | boolean | `true` | 否 | 选完立即传；false 停 `ready`，由 `submit()` 触发 |
| `withCredentials` | boolean | `false` | 否 | XHR 带凭据 |
| `triggerText` | string | `''` | 否 | 选择按钮文案，空走 i18n |

文件对象 `{ uid, name, size, type, file, status, percent, url }`（`1250-1263`），`status` 为 `ready/uploading/success/error`。事件：统一 `change`，`reason` 区分 `select`（`1343`、`1445`）、`remove`（`1336`）、`upload`（`1380`）、`uploadError`（`1350`、`1386`、`1398`）、`clear`（`1521`）；校验失败走动作事件 `exceed/typeError/sizeError`（`1409-1417`）。API：`getValue`（去掉 `file/xhr` 的元信息）、`setValue(list)`、`getFiles/clear/submit`（把 `ready/error` 重传，`1524-1529`）、`setDisabled/focus/destroy`。表单集成：`getValue()` 数组即字段值，参与收集与 `required`（详见 07 章）。坑：**无缩略图预览**（文件行只有图标+名+大小+状态，`1278-1290`）；`autoUpload:false` 没有上传按钮，必须代码调 `submit()`；成功只把响应文本写进 `url`，要解析 JSON 自己在 `reason:'upload'` 的 change 里做。

---

## 5. field（`src/components/controls/misc.js:1557-1675`）

```json
{ "type": "field", "props": { "label": "同步周期", "required": true, "help": "单位：分钟", "unit": "min" },
  "children": [ { "type": "number", "id": "interval", "props": { "value": 30 } } ] }
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `label` / `help` / `error` | string | `''` | 否 | 标签 / 帮助 / 错误文案（`error` 非空即错误态） |
| `required` | boolean | `false` | 否 | 只画必填星号，不负责校验 |
| `unit` | string | `''` | 否 | 后缀单位 |
| `width` / `span` | number \| null | `null` | 否 | 字段宽 / 栅格占位 |
| `labelWidth` | number \| null | `null` | 否 | 标签列宽 |
| `labelPosition` | string | `''` | 否 | `top/left/right` |

子节点取 `node.children` → `node.fields` → `props.children`（`1569-1575`），值按子控件 `id` 收集。事件：无。API：`setValue/validate/setLabel/setRequired/setError/clearError/setHelp/setUnit/setVisible/setDisabled`（`1610-1673`）。坑：`required:true` 只是星号，校验规则写在表单 `rules` 里（07 章）；`field` 自身没有 `getValue`。

---

## 6. 常见错误与排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 图标显示问号 | 名字拼错，或分页的 `more-horizontal` 笔误 | 对照 2.1 的 85 个名字 |
| 按钮点击无反应 | `disabled`/`loading` 为真，或动作名不在 28 个内置动作里 | 动作清单见 10 章 |
| 按钮动作与 click 都触发 | `props.action` 与 `on.click` 同时写了 | 二选一（action 先执行） |
| table 有表头无数据 | `data` 非空时 `rows` 被忽略，或列 `key` 与行字段不符 | 只留一个数据源，`key` 支持点路径 |
| pagination 换页数据不变 | 分页器不负责取数 | change 里用 `{page,pageSize}` 调 `setData` |
| upload 一直「待上传」 | `autoUpload:false` 或 `action` 为空 | 代码调 `submit()` 并配置 `action` |
| avatar 点不动 | `editable` 默认 `false` | 显式 `"editable": true` |

## 本章自检

```powershell
# 注册表总数应为 40，且本章 14 类型齐全
node -e "var s=require('./test/dom-stub.js'),e=s.createEnvironment({root:process.cwd(),fileMode:true}),lk=require('./test/load-kui.js'),r=lk.loadKui(e,{});var l=e.window.KUI.registry.list();console.log('total',l.length);console.log(l.map(function(x){return x.category+':'+x.type}).join(' '));"
```

预期 `total 40`，输出含 `action:button action:link display:icon display:text display:tag display:badge display:avatar layout:divider feedback:alert feedback:progress data:table data:pagination data:upload layout:field`。图标数量可用 `node -e` 统计 `src/core/icons.js` 定义块，应为 85；本章 json 代码块均可被 `JSON.parse` 解析。

## 参考源码

- `src/core/icons.js:31-123`（85 图标 5 组）、`156-250`（图标 API、缺失兜底 `216`）；`src/core/avatar.js:91-155`、`542-601`、`615-618`、`639-661`。
- `src/components/controls/misc.js:22-50`、`55-170`、`173-250`、`254-318`、`320-410`、`437-496`、`509-580`、`590-710`、`714-909`、`915-1118`、`1164-1544`、`1557-1675`。
- `src/components/controls/inputs.js:64-183`（button）、`src/components/controls/choices.js:784-852`（progress）。
- `src/core/control-base.js:400-430`、`700-707`、`950-996`；`src/core/kui.js:981-994`；`src/styles/controls.css:46`、`95`、`279`、`2916`；`config/app.json:720-754`。

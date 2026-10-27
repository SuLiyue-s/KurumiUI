# 08 · 组件详解：menu / menunav / tabs / dialog / toast / app-shell

> 适用版本：KurumiUI v1.3.6 ｜ 前置章节：[03-assembly.md](03-assembly.md)、[04-config-app.md](04-config-app.md)、[07-form-engine.md](07-form-engine.md) ｜ 阅读时长：约 45 分钟

## 本章目标

- 掌握六个外壳组件（`menu`、`menunav`、`tabs`、`dialog`、`toast`、`app-shell`）的 **props 全字段、源码默认值与必填项**，能判断「不配会怎样」。
- 会用 `el.__kuiInstance` 与组件专属句柄拿到实例，完成 `setActive`、`open`、`setBreadcrumb` 之类的运行时操作。
- 能区分「props 回调事件」与「全局总线事件」，知道哪些事件可以被取消、哪些只能观察。
- 能写出「菜单树 + 多标签 + 面包屑」的联动代码，并解释保活（keepAlive）与 iframe 生命周期的关系。
- 能通过排查表定位「菜单没高亮 / 标签关不掉 / 弹窗不关闭 / 提醒不出现」等高频问题。

## 0. 组件家族速览

KurumiUI 的界面由「一个骨架 + 三块外壳 + 两个全局浮层」组成。理解各自位置，后面每个字段才有落点：

| 组件 | 注册类型 | 职责 | `app.json` 配置段 | 默认挂载位置 | 能否独立使用 |
| --- | --- | --- | --- | --- | --- |
| `app-shell` | `app-shell` | 应用骨架：左菜单 + 顶导航 + 中标签页，负责三者联动 | 顶层 `app` / `layout` / `avatar` / `text` + 三个子节点 | `#kui-app` | 否（它就是外壳本身） |
| `menu` | `menu` | 左侧主菜单：品牌区、分组、子菜单、徽标、页脚、折叠与浮出 | `menu` | `.kui-app__left` | 是（`standalone/menu.html`） |
| `menunav` | `menunav` | 顶部导航：折叠按钮、标题、面包屑、历史/刷新/全屏、动作按钮 | `menunav` | `.kui-app__header` | 是（`standalone/menunav.html`） |
| `tabs` | `tabs` | 多标签工作区：每个标签一个 iframe，切换不重建 | `tabs` | `.kui-app__center` | 是（`standalone/tabs.html`） |
| `dialog` | `dialog` | iframe 弹窗：alert/confirm/prompt/form/custom 与自定义弹窗 | `dialogs`（命名弹窗配置） | `document.body` 下的浮层 | 是（`standalone/dialog.html`） |
| `toast` | `toast` | 轻提示与通知卡片，角落堆叠 | `ui.toast`（默认参数） | `document.body` 下的浮层 | 是（`standalone/toast.html`） |

三点先记住：

1. **装配关系只有一种**：`index.html` 里的 `#kui-app` 由 `bootstrap.js` 调 `KUI.app.create(host, appCfg)`，`app-shell` 再把 `menu` / `menunav` / `tabs` 挂进自己的三个格子（`src/components/app-shell.js:200-275`）。`dialog` 与 `toast` 不进骨架，它们按需在 `body` 上建层。
2. **配置语义在 [04-config-app.md](04-config-app.md)**：`app.json` 各段怎么落盘、`app` / `layout` 字段含义看 04；本章只讲每个组件自己的 props、API、事件与联动，即便两处出现同名字段。
3. **实例句柄不止一个**：通用句柄是 `el.__kuiInstance`，各组件另有专属句柄（见各节 4）。二者指向同一个实例对象。

六个组件的源码都在 `src/components/`，样式钩子在 `src/styles/components.css`；本章的行号引用以仓库当前文件为准。

## 1. menu：左侧主菜单

### 1.1 作用与在整体界面中的位置

- 渲染文件：`src/components/menu.js`（约 896 行），注册表类型名 `menu`，`category: 'shell'`（`src/components/menu.js:867-880`）。
- 主应用里**不要手写 HTML**：`app.json` 的 `menu` 段（`config/app.json:200` 起）被 `app-shell` 读取，补默认 brand 与宽度后挂到 `.kui-app__left`（`src/components/app-shell.js:237-258`）。
- 独立使用：`standalone/menu.html` 用 `KUI.renderNode(node, null)` 直接渲染一个菜单实例；也可以 `KUI.menu.create(host, props)`（`src/components/menu.js:884-894`），或写一个 `{"type":"menu","props":{…}}` 节点交给 `KUI.renderNode`。
- DOM 结构：`aside.kui-menu`（`role="navigation"`）→ `.kui-menu__brand` + `.kui-menu__scroll > .kui-menu__list-host` + `.kui-menu__footer`；每个菜单项是 `li.kui-menu__item > a.kui-menu__link`，子菜单是 `ul.kui-menu__sub`。
- 尺寸走 CSS 变量：`--kui-menu-w`、`--kui-menu-w-collapsed`，由 `width` / `collapsedWidth` 写入（`src/components/menu.js:713-762`），自定义样式优先改这两个变量而不是覆盖 `width`。
- 依赖：`avatar`（`brand.avatar` 生效时）、图标名（`icon`）、动作系统（`item.target`）。

### 1.2 最小可运行示例

下面这段可以直接粘到 `standalone/menu.html` 的 `menuHost` 渲染处（或作为 `app.json` 的 `menu` 段内容）：

```json
{
  "type": "menu",
  "props": {
    "brand": { "title": "KurumiUI", "subtitle": "控制台" },
    "defaultActive": "home",
    "items": [
      {
        "type": "group",
        "label": "工作台",
        "children": [
          {
            "type": "item",
            "id": "home",
            "label": "首页",
            "icon": "home",
            "badge": "主",
            "badgeType": "accent",
            "target": {
              "tab": { "id": "home", "title": "首页", "url": "pages/home.html", "pinned": true }
            }
          },
          { "type": "item", "id": "docs", "label": "文档", "icon": "book" }
        ]
      },
      { "type": "divider" },
      {
        "type": "group",
        "label": "系统",
        "children": [
          { "type": "item", "id": "disabled-seal", "label": "封印中", "icon": "lock", "disabled": true, "tooltip": "该功能已封印" }
        ]
      }
    ]
  }
}
```

在 JS 里挂载并接事件（`on` 写在节点上，不是 props 里）：

```js
var node = {
  type: 'menu',
  props: { /* 上面 JSON 的 props 内容 */ },
  on: {
    select: function (item) {
      console.log('选中：', item.id);
    },
    collapsed: function (payload) {
      console.log('折叠状态：', payload.collapsed);
    }
  }
};

var el = KUI.renderNode(node, null);   // 任意容器都可，renderNode 返回组件根元素
var menu = el.__kuiMenu;               // 等价：el.__kuiInstance
```

### 1.3 props 全字段表

下表的「默认值」全部取自源码兜底（`src/components/menu.js:118-132` 的 `DEFAULTS` 与渲染函数里的 `||` 回落），不是旧文档口径。

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `brand` | object | `{title:'',subtitle:'',logoIcon:'clock',href:''}` | 否 | 品牌区配置；未配时 `app-shell` 会用 `app.title` / `app.subtitle` 兜底 |
| `brand.title` | string | `''`，渲染时回落 `KUI.text('app.title','KurumiUI')` | 否 | 品牌主标题 |
| `brand.subtitle` | string | `''` | 否 | 品牌副标题；为空不渲染 `.kui-menu__brand-subtitle` |
| `brand.logoIcon` | string | `'clock'` | 否 | Logo 图标名；`brand.avatar` 生效时作为头像兜底图标 |
| `brand.logoText` | string | 源码未读取 | 否 | **源码未实现**：`menu.js` 只读 `title/subtitle/logoIcon/href/avatar`，`logoText` 配了不生效（`config/demos/menu.json` 里有该字段，仅作约定） |
| `brand.href` | string | `''` | 否 | 非空时标题成链接（`.is-link`），点击整页跳到该地址 |
| `brand.avatar` | object | 无（`undefined`） | 否 | 头像配置，交给 `KUI.avatar`；`fallbackIcon` 兜底 `brand.logoIcon \|\| 'clock'`，`alt` 兜底 `brand.title` |
| `collapsed` | boolean | `false` | 否 | 初始是否折叠；折叠后宽度取 `collapsedWidth` |
| `collapsible` | boolean | `true` | 否 | 是否显示折叠按钮（`button.kui-menu__collapse`）；`false` 时不渲染按钮 |
| `width` | number | `252` | 否 | 展开宽度（px），写入 CSS 变量 `--kui-menu-w` |
| `collapsedWidth` | number | `68` | 否 | 折叠宽度（px），写入 `--kui-menu-w-collapsed` |
| `defaultActive` | string | `''` | 否 | 初始高亮的菜单项 id |
| `items` | array | `[]` | 否 | 菜单树；节点字段见下面 `items[]` 各行 |
| `items[].type` | string | `'item'` | 否 | `item` 普通项 / `group` 分组 / `divider` 分隔线 |
| `items[].id` | string | 自动生成 `menu-item-<随机>` | 建议填 | 唯一 id；高亮、`setBadge`、动作参数都靠它 |
| `items[].label` | string | 无（`undefined`） | 可读项必填 | 显示文本；也是 `select` 回调里可读的字段 |
| `items[].icon` | string | 顶层项回落 `'list'`，子级回落 `'chevron-right'` | 否 | 图标名（`icon` 组件可用名） |
| `items[].badge` | string \| number | 无（`undefined`） | 否 | 徽标文本；空字符串/`null` 不渲染 |
| `items[].badgeType` | string | 无（`undefined`） | 否 | `accent` / `gold` / `success` / `warning` / `danger`；只加类名，不校验 |
| `items[].tooltip` | string | 无（`undefined`） | 否 | 折叠态 `a.title` 的提示文案，回落 `label` |
| `items[].disabled` | boolean | 无（按假处理） | 否 | 禁用：点击、键盘均无效，加 `.is-disabled` |
| `items[].children` | array | 无（`undefined`） | 否 | 子菜单，结构同 `items`；有子项时渲染箭头 |
| `items[].url` | string | 无（`undefined`） | 否 | 仅配合 `target: 'blank'` 新窗口打开 |
| `items[].tab` | object | 无（`undefined`） | 否 | 单项目标标签，`target.tab` 的简写 |
| `items[].target` | object \| string | 无（`undefined`） | 否 | 对象 → 交给动作系统；`'blank'` → `window.open(url)` |
| `items[].target.tab` | object | 无（`undefined`） | 否 | 目标标签，字段 `id/title/url/icon/pinned/closable`，最终传给 `tabs.open` |
| `footer` | object \| null | `null` | 否 | 页脚配置；`null` 时不渲染页脚 |
| `footer.title` | string | 无（`undefined`） | 否 | 页脚标题 |
| `footer.subtitle` | string | 源码未读取 | 否 | **源码未渲染**：`menu.js` 只渲染 `title`/`version`/`actions`，`subtitle` 配了不显示 |
| `footer.version` | string | 无（`undefined`） | 否 | 版本文字（例：`v1.3.6`） |
| `footer.actions` | array | 无（`undefined`） | 否 | 页脚动作：字符串（按钮文本）或节点对象（`button` 等，经 `KUI.renderNode`），对象也可写 `{text,icon,on:{click}}` |
| `accordion` | boolean | `true` | 否 | 同级子菜单是否互斥展开（手风琴） |
| `flyout` | boolean | `true` | 否 | 折叠态是否悬停弹出浮出子菜单（flyout） |
| `tooltip` | boolean | `true` | 否 | 折叠态是否为菜单项设置 `title` 提示 |
| `onSelect` | function | `null` | 否 | 选中回调 `(item, ctx)`；等价于节点上的 `on.select` |
| `on` | object | `null` | 否 | 实例/节点事件表：`{select, collapsed, ready}`，见 1.5 |

### 1.4 实例 API（`el.__kuiMenu`）

拿实例的三种方式：组件根元素的 `el.__kuiMenu`、通用 `el.__kuiInstance`、主应用里的 `KUI.app.instance.menu`。实例上还挂着 `el/node/ctx/type/props` 四个只读属性。

| 签名 | 返回 | 说明 |
| --- | --- | --- |
| `on(name, fn)` | `api` | 注册实例事件；实际只对 `ready` / `collapsed` 生效（见 1.5 注） |
| `off(name, [fn])` | `api` | 移除监听；不传 `fn` 清空该事件 |
| `emit(name, payload)` | `api` | 手动派发，走完整 `fire` 链（实例 → `props.on` → `node.on` → `ctx.emit` → 全局 `menu:*`） |
| `setActive(id)` | `api` | 高亮指定项并自动展开父链（最多 8 层），派发 `menu:active` |
| `getActive()` | string | 当前高亮 id；无则 `''` |
| `toggle()` | `api` | 折叠 / 展开切换（等价 `setCollapsed(!isCollapsed())`） |
| `setCollapsed(flag)` | `api` | `true` 折叠、`false` 展开；派发 `collapsed` 与全局 `menu:collapsed` |
| `isCollapsed()` | boolean | 当前是否折叠 |
| `expand([id])` | `api` | 不传参 = 展开整栏；传 id = 展开该子菜单（`openSub`） |
| `collapse([id])` | `api` | 不传参 = 折叠整栏；传 id = 收起该子菜单（`closeSub`） |
| `setBadge(id, value, [badgeType])` | `api` | 改徽标；`value` 为空清除，`badgeType` 见字段表 |
| `setItems(items)` | `api` | 整树替换并重渲染，派发 `menu:items` |
| `getItems()` | array | 当前菜单树 |
| `setCollapsible(flag)` | `api` | 增删折叠按钮；`false` 时会强制展开 |
| `setAvatar(url, [extra])` | `api` | 设置品牌头像；未配 `brand.avatar` 时重建品牌区接入头像 |
| `getAvatar()` | string | 当前头像地址 |
| `openAvatarPicker()` | Promise \| null | 打开头像选择面板（需 `KUI.avatar` 就位） |
| `destroy()` | void | 解绑 DOM/全局监听并移除根元素，派发 `menu:destroy` |

常用调用示例：

```js
var menu = KUI.app.instance.menu;

menu.setActive('pages-list');       // 高亮并展开其父级「页面管理」
menu.setBadge('mail', 12, 'danger'); // 加红色徽标
menu.setBadge('mail', '');           // 清除徽标
menu.setCollapsed(true);             // 折叠成图标栏
menu.expand('pages');                // 只展开「页面管理」这一支
console.log(menu.getActive(), menu.isCollapsed(), menu.getItems());
```

### 1.5 事件表

`| 事件名 | 参数 | 触发时机 | 可取消 |`。本组件的事件只做**观察**，没有 `preventDefault` 机制，表格统一「否」；需要拦截请在动作层做（见 [10-actions-handlers.md](10-actions-handlers.md)）。

| 事件名 | 参数 | 触发时机 | 可取消 |
| --- | --- | --- | --- |
| `ready`（实例 / `props.on` / `node.on`） | `{el}` | 渲染完成 | 否 |
| `collapsed`（实例 / `props.on` / `node.on` / `ctx.emit` / 全局 `menu:collapsed`） | `{collapsed}` | `setCollapsed`、`toggle`、点击折叠按钮 | 否 |
| `select`（`props.onSelect` / `props.on.select` / `node.on.select`） | `item`（菜单项对象） | 点击末级菜单项 | 否 |
| `menu:select`（全局总线） | `{id, item, tab, url, target}` | 同上，且动作已派发之后 | 否 |
| `menu:active`（全局总线） | `{id}` | `setActive` 被调用（含点击高亮） | 否 |
| `menu:items`（全局总线） | `{items}` | `setItems` 替换菜单树 | 否 |
| `menu:destroy`（全局总线） | `{el}` | `destroy()` | 否 |

> 注：`menu` 的选中事件**不经过实例事件表**。`activateItem` 依次调用 `props.onSelect`、`props.on.select`、`node.on.select`、`ctx.emit('select')`，再派发全局 `menu:select`（`src/components/menu.js:532-574`）；`api.on('select', …)` 注册的回调不会被点击触发。想监听选中，请用节点 `on.select`、`props.onSelect` 或全局 `menu:select`。

### 1.6 业务函数（scope `menu`）高频用法

业务函数写在 JSON 的 `on.xxx` 里，语法是 `{"fn":"menu.方法名","args":{…}}`（等价显式写法 `{"action":"handlers.run","params":{"fn":…,"args":…}}`）。完整清单见 [10-actions-handlers.md](10-actions-handlers.md)；这里给 4 个高频：

```json
{ "type": "button", "props": { "text": "折叠菜单" },
  "on": { "click": { "fn": "menu.toggleCollapse" } } }
```

```json
{ "type": "button", "props": { "text": "跳到设置" },
  "on": { "click": { "fn": "menu.select", "args": { "id": "settings" } } } }
```

```json
{ "type": "button", "props": { "text": "给邮件加徽标" },
  "on": { "click": { "fn": "menu.setBadge", "args": { "id": "mail", "text": "NEW", "type": "success" } } } }
```

```json
{ "type": "button", "props": { "text": "下一个菜单项" },
  "on": { "click": { "fn": "menu.cycleActive" } } }
```

取值链：`ctx.menu` → `ctx.app.menu` / `KUI.app.instance.menu` → `KUI.demoMenu`（standalone 演示页会挂这个全局）。`menu.select` 会联动外壳（选中并打开目标标签）；`menu.cycleActive` 适合做「演示 / 轮播」场景。

### 1.7 实战：折叠 / 展开 + flyout 模式

这是需求里的「场景 d」。配置要点：`collapsible:true` 才有折叠按钮；折叠后只剩图标，带 `children` 的项在**鼠标悬停**时浮出（`flyout:true`）；`accordion` 决定展开一支时是否收起其他支。

```json
{
  "type": "menu",
  "props": {
    "collapsed": false,
    "collapsible": true,
    "width": 252,
    "collapsedWidth": 68,
    "flyout": true,
    "accordion": true,
    "tooltip": true,
    "items": [
      {
        "type": "group",
        "label": "工作台",
        "children": [
          { "type": "item", "id": "home", "label": "首页", "icon": "home" },
          {
            "type": "item",
            "id": "pages",
            "label": "页面管理",
            "icon": "grid",
            "children": [
              { "type": "item", "id": "pages-list", "label": "页面列表", "icon": "list" },
              { "type": "item", "id": "pages-editor", "label": "页面编辑", "icon": "edit" }
            ]
          }
        ]
      }
    ]
  }
}
```

```js
var menu = el.__kuiMenu;

// 折叠：只剩图标；此时 hover「页面管理」会弹出 flyout 子菜单
menu.setCollapsed(true);
console.log(menu.isCollapsed());   // true

// 展开：恢复完整菜单树，flyout 自动失效
menu.setCollapsed(false);

// 只展开指定分支（折叠态调用等价于打开它的 flyout）
menu.expand('pages');
menu.collapse('pages');
```

三个易踩点：

- `flyout` 只在 **`collapsed: true` 且该项有 `children`** 时生效；菜单展开时是手风琴子菜单，不是浮层。
- 折叠态**键盘**不会打开 flyout（源码里 `ArrowRight` 有 `!state.collapsed` 判断），用鼠标悬停或 `api.expand(id)`。
- 想改宽度不要改 CSS `width`，改 `width` / `collapsedWidth` 两个 props（或运行时改 `--kui-menu-w` 变量）。

### 1.8 与其他组件的联动

- **菜单 → 标签**：末级项点击后，若 `item.target` 是对象，交给动作系统执行；`{tab:{…}}` 会被核心糖化为 `tab.open`，打开/激活对应标签。这条链路不依赖 `app-shell` 的事件监听，独立使用 `menu` 也能生效（前提是动作里有 `tabs` 可用，`KUI.tabs` 单例存在）。
- **菜单 → 面包屑**：`menu` 只把选中结果派发给 `props.onSelect` / `node.on.select` / `ctx.emit('select')` / 全局 `menu:select`；`app-shell` 监听的是**实例** `select` 事件（`src/components/app-shell.js:331-343`），而点击路径不触发它，所以**默认不会自动改面包屑**。要面包屑跟随，二选一：
  1. 在菜单节点上写 `on.select`，自己调 `KUI.app.instance.setBreadcrumb([{label:'首页',icon:'home'},{label:item.label}])`；
  2. 用 `KUI.app.instance.selectMenu(id)`（或动作 `menu.select`）触发，它走 `onMenuSelect`，会同时高亮 + 打开标签 + 写面包屑。
- **菜单 → 外壳宽度**：`setCollapsed` 通过 `fire('collapsed')` 派发到 `props.on`、`ctx.emit` 与全局 `menu:collapsed`，`app-shell` 靠它同步 CSS 变量与类名（`src/components/app-shell.js:331-343`）。
- **标签 → 菜单高亮**：**不会自动反向同步**。标签被程序化打开（`tab.open`、`KUI.app.openTab`、弹窗里打开的页面）后菜单仍停在旧高亮；要双向，监听全局 `tabs:activate` 后调 `menu.setActive(tab.id)`。

### 1.9 常见错误与排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 点击菜单项没有任何反应 | 既没有 `target` 也没有 `url`，或 `disabled: true` | 配 `target.tab` 或 `url`；检查该项是否被禁用 |
| 折叠后看不到悬浮子菜单 | `flyout: false`，或该层没有 `children` | 保持 `flyout: true`，并确认子菜单层级 |
| `brand.logoText` / `footer.subtitle` 配了不显示 | 源码未实现这两个字段（见 1.3 注） | 用 `brand.title`、`footer.title/version` 表达 |
| 面包屑不跟随菜单变化 | `menu` 的实例 select 事件不派发，`app-shell` 监听落空 | 用 `menu.select` 动作或 `app.selectMenu()`；或在 `on.select` 里手动 `setBreadcrumb` |
| 菜单宽度改成字符串无效 | `width` 只接受数字（内部拼 `px`） | 传 `252` 而不是 `"252px"`；必要时改用 CSS 变量 |

## 2. menunav：顶部导航条

### 2.1 作用与在整体界面中的位置

- 渲染文件：`src/components/menunav.js`（约 846 行），类型名 `menunav`，`category: 'shell'`（`src/components/menunav.js:819-832`）。
- 主应用里由 `app-shell` 读取 `app.json` 的 `menunav` 段，补 `breadcrumb` / `title` / `subtitle` 兜底后挂到 `.kui-app__header`（`src/components/app-shell.js:260-271`）。
- 独立使用：`standalone/menunav.html` 用 `KUI.renderNode(node, null)` 渲染单个导航条；也可以 `KUI.menunav.create(host, props)`。
- DOM：`header.kui-menunav.kui-menunav--{mode}`；左半区 `.kui-menunav__left`（折叠按钮 → 标题/副标题 → 面包屑 `nav.kui-menunav__breadcrumb`），右半区 `.kui-menunav__right`（历史组 → 刷新 → 全屏 → 动作按钮容器 `.kui-menunav__actions` → 插槽 `.kui-menunav__slot`）。
- 依赖：`menu`（折叠按钮、折叠图标同步）、`tabs`（刷新、历史前进后退、可后退/可前进状态）。拿不到这两个实例时按钮仍渲染，但内置动作会静默跳过。
- `mode` 目前只影响类名（`kui-menunav--header`），源码没有实现第二种布局；写别的值不会报错，但外观与 `header` 相同。

### 2.2 最小可运行示例

```json
{
  "type": "menunav",
  "props": {
    "mode": "header",
    "title": "刻刻帝终端",
    "subtitle": "灵装管理",
    "showCollapse": true,
    "showHistory": true,
    "showRefresh": true,
    "showFullscreen": true,
    "breadcrumb": {
      "enabled": true,
      "separator": "/",
      "home": { "id": "home", "label": "首页", "icon": "home" },
      "items": [
        { "label": "页面管理", "icon": "grid" },
        { "label": "页面列表" }
      ]
    },
    "actions": [
      { "id": "search", "icon": "search", "title": "搜索" },
      { "id": "notify", "icon": "bell", "title": "提醒", "badge": 8, "badgeType": "danger" },
      { "id": "settings", "icon": "settings", "label": "设置" }
    ]
  }
}
```

```js
var nav = el.__kuiMenunav;              // 等价：el.__kuiInstance
nav.setBreadcrumb([{ label: '首页', icon: 'home' }, { label: '页面列表' }]);
console.log(nav.getBreadcrumb());        // { home: {...}, items: [...] }
```

### 2.3 props 全字段表

默认值取自 `src/components/menunav.js:121-138` 的 `DEFAULTS` 与渲染兜底。

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `mode` | string | `'header'` | 否 | 只影响根类名 `kui-menunav--{mode}`，源码未实现其它布局 |
| `title` | string | `''` | 否 | 标题；`app-shell` 未配时用 `app.title` 兜底 |
| `subtitle` | string | `''` | 否 | 副标题；为空不渲染 |
| `showCollapse` | boolean | `true` | 否 | 是否显示折叠按钮 |
| `showHistory` | boolean | `true` | 否 | 是否显示后退/前进按钮 |
| `showRefresh` | boolean | `true` | 否 | 是否显示刷新当前标签按钮 |
| `showFullscreen` | boolean | `true` | 否 | 是否显示全屏切换按钮 |
| `breadcrumb` | object | `{enabled:true,separator:'/',home:null,items:[]}` | 否 | 面包屑配置 |
| `breadcrumb.enabled` | boolean | `true` | 否 | `false` 时不渲染面包屑容器 |
| `breadcrumb.home` | object \| string | `null` | 否 | 首项；字符串等价 `{label:字符串}`；`app-shell` 未配时自动补 `{label:app.title, icon:'home'}` |
| `breadcrumb.home.id` | string | `'__home'` | 否 | 首项 id（点击回调里可读到） |
| `breadcrumb.home.label` | string | `''` | 否 | 首项文字 |
| `breadcrumb.home.icon` | string | `'home'` | 否 | 首项图标；只给图标不给文字时加 `.is-icon-only` |
| `breadcrumb.items` | array | `[]` | 否 | 中间层级；每项可写 `id/label/text/icon/title/disabled/action/tab/url` |
| `breadcrumb.separator` | string | `'/'` | 否 | 分隔符**文本**（按文本渲染，不是图标名；写 `'chevron-right'` 会显示成这串字符） |
| `breadcrumb.max` | number | 源码未读取 | 否 | **不生效**：源码只读顶层 `maxBreadcrumb`，此处写了无效 |
| `maxBreadcrumb` | number | `0` | 否 | 面包屑折叠阈值，`0` 不裁剪；`>0` 且超长时保留首项 + 省略号 + 末 `max-2` 项 |
| `actions` | array | `[]` | 否 | 右侧动作按钮组；空数组时容器 `display:none` |
| `actions[].id` | string | 无（`undefined`） | 建议填 | 作为 `data-action`；未写 `action` 时点击执行的就是它 |
| `actions[].icon` | string | 无（`undefined`） | 否 | 图标名 |
| `actions[].label` | string | 无（`undefined`） | 否 | 按钮文字；与 `icon` 同时存在时图标在左、文字在右 |
| `actions[].title` | string | `id` | 否 | `title`/无障碍文本，回落顺序 `title → label → id` |
| `actions[].badge` | string \| number | 无（`undefined`） | 否 | 徽标文本 |
| `actions[].badgeType` | string | 无（`undefined`） | 否 | `accent` / `gold` / `success` / `warning` / `danger` |
| `actions[].action` | object \| string | 无（`undefined`） | 否 | 点击执行的动作；**不写时取 `id`** |
| `actions[].disabled` | boolean | 无（按假处理） | 否 | 禁用按钮 |
| `actions[].visible` | boolean | `true` | 否 | 显式 `false` 时不渲染该按钮 |
| `actions[].active` | boolean | 无（按假处理） | 否 | 加 `.is-active` 高亮（如主题按钮的选中态） |
| `actions[].type` | string | 无（`undefined`） | 否 | 写 `'divider'` 时渲染为分隔线 |
| `slot` | DOM \| string \| array \| object | `null` | 否 | 右侧插槽：元素直接插入、字符串按 HTML、数组逐项、对象交给 `KUI.renderNode` |
| `right` | 同上 | `null` | 否 | `slot` 的别名（`slot` 优先） |
| `home` | object \| string | `null` | 否 | `breadcrumb.home` 的旧别名 |
| `on` | object | `null` | 否 | 事件表：`{breadcrumb, action, refresh, history, collapse, fullscreen, …}` |
| `onAction` | function | `null` | 否 | 动作按钮点击回调 `(action, ev)`，优先于内置执行 |

### 2.4 实例 API（`el.__kuiMenunav`）

| 签名 | 返回 | 说明 |
| --- | --- | --- |
| `setBreadcrumb(input)` | `api` | `input` 为数组（替换 items）或 `{items,home,enabled}`；`enabled` 变更会挂/清面包屑容器 |
| `push(item)` | `api` | 追加一层；`item` 字段同 `breadcrumb.items` |
| `pop()` | item \| null | 弹出最后一层并返回它 |
| `getBreadcrumb()` | `{home, items}` | 读当前面包屑状态 |
| `setTitle(text)` | `api` | 改标题 |
| `setSubtitle(text)` | `api` | 改副标题 |
| `setActions(list)` | `api` | 整组替换右侧动作按钮并重渲染 |
| `getActions()` | array | 当前动作数组 |
| `setBackForward(back, forward)` | `api` | 设置前进/后退可用态；也接受 `{canBack, canForward}` 形式 |
| `syncHistory()` | `api` | 手动刷新一次历史按钮状态（读 `tabs.canBack()/canForward()`） |
| `refresh()` | `api` | 刷新当前标签（`tabs.getActive()` → `tabs.refresh(id)`） |
| `toggleMenu()` | `api` | 折叠/展开左侧菜单（无外部监听时直接调 `menu.toggle()`） |
| `toggleFullscreen()` | `api` | 切换全屏（`documentElement.requestFullscreen` / `exitFullscreen`） |
| `update(patch)` | `api` | 批量更新 `{title, subtitle, actions, breadcrumb}` |
| `on / off / emit` | `api` | 同 menu：注册/注销/手动派发实例事件 |
| `destroy()` | void | 解绑全局与 DOM 监听并移除根元素，派发 `menunav:destroy` |

```js
var nav = KUI.app.instance.menunav;

nav.setBreadcrumb({ home: { label: '首页', icon: 'home' }, items: [{ label: '日志' }] });
nav.push({ label: '详情' });
nav.setBackForward(true, false);      // 后退可用、前进不可用
nav.setTitle('新的标题');
nav.update({ subtitle: '新的副标题', actions: [{ id: 'help', icon: 'help', title: '帮助' }] });
```

### 2.5 事件表

| 事件名 | 参数 | 触发时机 | 可取消 |
| --- | --- | --- | --- |
| `breadcrumb`（实例 / `props.on` / 全局 `menunav:breadcrumb`） | `{item, index, ev}` | 点击面包屑层级 | 否 |
| `action`（实例 / 全局 `menunav:action`） | `{action, ev, meta}` | 点击右侧动作按钮 / 面包屑动作 | 否 |
| `refresh`（实例 / 全局 `menunav:refresh`） | `{id}` | 点击刷新 | 否 |
| `history`（实例 / 全局 `menunav:history`） | `{direction}` | 点击前进/后退 | 否 |
| `history:back`（实例 / 全局） | `{}` | 点击后退 | 否 |
| `history:forward`（实例 / 全局） | `{}` | 点击前进 | 否 |
| `collapse`（实例 / 全局） | `{}` | 点击折叠按钮 | 否 |
| `fullscreen`（实例 / 全局） | `{active}` | 点击全屏按钮（`active` 为切换后的期望态） | 否 |

> 没有 `ready` 事件：源码只在构建后 `setTimeout` 同步一次折叠图标与历史按钮，不派发就绪事件（`src/components/menunav.js:803-812`）。需要「就绪后」执行，用 `KUI.bus.on('app:ready')` 或下一帧。

### 2.6 业务函数（scope `menunav`）高频用法

```json
{ "type": "button", "props": { "text": "设置面包屑" },
  "on": { "click": { "fn": "menunav.setBreadcrumb",
    "args": { "items": [{ "label": "首页", "icon": "home" }, { "label": "工作台" }] } } } }
```

```json
{ "type": "button", "props": { "text": "改标题" },
  "on": { "click": { "fn": "menunav.setTitle", "args": { "title": "刻刻帝终端 · 夜间" } } } }
```

```json
{ "type": "button", "props": { "text": "刷新" }, "on": { "click": { "fn": "menunav.refresh" } } }
```

```json
{ "type": "button", "props": { "text": "折叠菜单" }, "on": { "click": { "fn": "menunav.toggleMenu" } } }
```

`menunav.back` 内部是 `nav.emit('history:back')`，适合在自定义按钮上复刻导航条的后退行为。

### 2.7 实战：面包屑与多标签联动

需求里的「场景 a」里，面包屑由 `app-shell` 在「标签激活但菜单里找不到对应项」时自动补（`src/components/app-shell.js:345-359`）——更稳的做法是业务自己按当前标签写：

```json
{
  "type": "menunav",
  "props": {
    "breadcrumb": {
      "enabled": true,
      "separator": "/",
      "home": { "label": "总览", "icon": "home" },
      "items": []
    },
    "actions": [
      { "id": "refresh", "icon": "refresh", "title": "刷新" },
      { "id": "notify", "icon": "bell", "badge": 3, "badgeType": "danger", "title": "提醒" }
    ]
  }
}
```

```js
var app = KUI.app.instance;

// 业务页面在切换页面时自己写面包屑（推荐：一个页面只写一次）
function syncBreadcrumb(tab) {
  app.setBreadcrumb([
    { label: app.config.app.title, icon: 'home' },
    { label: tab.title, icon: tab.icon }
  ]);
}

KUI.bus.on('tabs:activate', function (payload) {
  var tab = payload && payload.tab;
  if (tab) { syncBreadcrumb(tab); }
});
```

要点：`setBreadcrumb` 传 `{home, items}` 可同时替换首项；`maxBreadcrumb` 控制折叠，不要写 `breadcrumb.max`。

### 2.8 与其他组件的联动

- **折叠**：导航条折叠按钮在「没有外部 `collapse` 监听」时才直接调 `menu.toggle()`（`src/components/menunav.js:552-560`）；主应用里 `app-shell` 监听了该事件并走 `toggleCollapsed()`（`src/components/app-shell.js:366-374`），所以外壳宽度、菜单、导航图标三者一起变。
- **双向图标同步**：`menu:collapsed` / `menu:ready` 时导航条重新读 `menu.isCollapsed()` 更新按钮图标与 `aria-expanded`（`src/components/menunav.js:670-676`）。
- **历史**：后退/前进按钮的可用态由 `tabs.canBack()/canForward()` 决定，在 `tabs:activate` / `tabs:open` / `tabs:close` 时自动刷新（`src/components/menunav.js:584-597`）；点按钮最终调 `tabs.back()` / `tabs.forward()`。
- **刷新**：读 `tabs.getActive()` 后调 `tabs.refresh(id)`，只重载当前标签的 iframe。
- **全屏**：默认走浏览器 Fullscreen API；若你在 `props.on.fullscreen` 或外部监听里接管，则内置全屏不再执行（`hasListener` 判断，`src/components/menunav.js:621-646`）。

### 2.9 常见错误与排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 面包屑整条不显示 | `breadcrumb.enabled` 为 `false`，或 `enabled` 未配而只给了 `items` | 配 `enabled: true` 并给 `home` |
| 层级一长就换行、不折叠 | 写成了 `breadcrumb.max` | 改用顶层 `maxBreadcrumb`（源码只读它，`src/components/menunav.js:370`） |
| 分隔符显示成 `chevron-right` 字样 | `separator` 是文本，不解析图标名 | 用 `/`、`›`、`·` 等字符；图标分隔符需自定义样式 |
| 前进/后退永远是灰的 | 只有一次 `open`、没有历史栈；或历史被外部接管 | 先打开两个以上标签；外部接管时手动 `setBackForward` |
| 折叠按钮点了没反应 | 页面里没有 `menu` 实例，或外部监听后未自行处理 | 主应用用 `KUI.app.toggleCollapsed()`；独立页先创建菜单实例 |
| 请求全屏失败 | 非用户手势触发，或 iframe 未授权 | 由真实点击触发；`<iframe allow="fullscreen">` |

## 3. tabs：多标签工作区

### 3.1 作用与在整体界面中的位置

- 渲染文件：`src/components/tabs.js`（约 1504 行），类型名 `tabs`，`category: 'shell'`（`src/components/tabs.js:1455-1469`）。
- 主应用里由 `app-shell` 读取 `app.json` 的 `tabs` 段并挂到 `.kui-app__center`（`src/components/app-shell.js:273-275`）；初始标签由 `home` / `initial` 或 `app-shell` 的 `initialTabs` 决定。
- 独立使用：`standalone/tabs.html`；也可以 `KUI.tabs.open(...)` 直接操作当前实例（`KUI.tabs` 把方法代理到「最近创建的实例」，`src/components/tabs.js:1475-1503`）。
- DOM：`.kui-tabs` → `.kui-tabs__bar`（左右滚动按钮 + `.kui-tabs__list`）+ `.kui-tabs__body`（每个标签一个 `.kui-tabs__pane > iframe.kui-tabs__frame`，空态为 `.kui-tabs__empty`）。
- 每个标签 = 一个固定 `pane` + 一个固定 `iframe`；**首次激活才写入 `src`**，之后切换只改 `hidden` / `.is-active`（`src/components/tabs.js:5-11、558-565`）。
- 依赖：动作系统（`tab.open` 等）、`dialog`（脏标签关闭确认）、`toast`（上限/不可关闭提示）、`theme`（向 iframe 广播主题）。

### 3.2 最小可运行示例

```json
{
  "type": "tabs",
  "props": {
    "closable": true,
    "pinnedClosable": false,
    "maxTabs": 24,
    "contextMenu": true,
    "drag": true,
    "emptyText": "还没有打开任何页面",
    "home": {
      "id": "home",
      "title": "首页",
      "url": "pages/home.html",
      "icon": "home",
      "pinned": true
    },
    "initial": [
      { "id": "logs", "title": "操作日志", "url": "pages/logs.html", "icon": "list" }
    ],
    "sandbox": ""
  }
}
```

```js
var tabs = el.__kuiTabs;                // 等价：el.__kuiInstance

tabs.open({ id: 'about', title: '关于', url: 'pages/about.html', icon: 'info' });
tabs.open({ id: 'about', title: '关于（新标题）' });  // 同 id 不会重复开，会更新并激活
tabs.activate('home');
tabs.close('logs');
console.log(tabs.count(), tabs.list(), tabs.getActive());
```

### 3.3 props 全字段表

默认值取自 `src/components/tabs.js:143-165` 的 `DEFAULTS`。

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `closable` | boolean | `true` | 否 | 标签是否可关闭；单个标签的 `closable` 优先 |
| `pinnedClosable` | boolean | `false` | 否 | 固定标签（`pinned:true`）是否允许关闭 |
| `keepAlive` | boolean | `true` | 否 | **源码读取默认值但正文从未使用**：标签恒为保活（pane/iframe 永不重建），关掉它也没有效果 |
| `maxTabs` | number | `24` | 否 | 最大标签数；超出时 `open` 失败并弹 `toast.warning`（文案键 `tabs.maxTabs`） |
| `contextMenu` | boolean | `true` | 否 | 是否启用标签右键菜单（刷新/关闭/关闭其他/关闭全部） |
| `drag` | boolean | `true` | 否 | 是否允许拖拽排序标签（只换 DOM 顺序与内部 order，不动 pane/iframe） |
| `emptyText` | string | `''` | 否 | 空态文字；回落 `KUI.text('tabs.empty','暂无打开的页面')` |
| `home` | object \| string | `null` | 否 | 首页标签；字符串等价 `{url:字符串}`，并自动补 `id:'home'`、`title:tabs.home`、`icon:'home'`、`pinned:true` |
| `initial` | object \| array | `null` | 否 | 初始标签（数组或单个）；**每个元素必须是标签对象**，字符串不会自动转换 |
| `sandbox` | string | `''` | 否 | 非空时写入 iframe 的 `sandbox` 属性，如 `'allow-scripts allow-same-origin allow-forms'`；空字符串 = 不设该属性 |
| `urlPrefix` | string | `''` | 否 | 相对 `url` 的统一前缀（绝对 URL 与 `//` 开头不加） |
| `showScrollButtons` | boolean | `true` | 否 | 标签条溢出时是否显示左右滚动按钮 |
| `height` | number \| string | `''` | 否 | 根元素高度；数字按 px，字符串原样写入 |
| `on` | object | `null` | 否 | 事件表：`{open, close, activate, refresh, dirty, contextmenu, action, reorder, theme, height, overflow}` |
| `onOpen` / `onClose` / `onActivate` / `onRefresh` / `onDirty` | function | `null` | 否 | 驼峰形式的快捷回调，等价于 `props.on.xxx` |
| `themeToast` | boolean | 源码未设默认 | 否 | 源码读取但未列入 `DEFAULTS`：iframe 请求切主题后是否弹提示；`false` 时不弹 |

`open` / `initial` 里的**标签对象字段**（`normalizeTab`，`src/components/tabs.js:500-524`）：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 自动 `tab-N-<时间36进制>` | 唯一键；同 id 再次 `open` = 更新并激活 |
| `title` | string | 依次回落 `label` / `name` / `url` | 标签文字 |
| `url` | string | 回落 `src` | 页面地址；相对地址会拼 `urlPrefix` 与 `?kui_v=<版本>` |
| `icon` | string | 无 | 标签图标名 |
| `pinned` | boolean | `false` | 固定标签：不参与「关闭其他/全部」 |
| `closable` | boolean | 跟随 `props.closable` | 单标签关闭权限 |
| `badge` | string \| number | 无 | 标签徽标 |
| `dirty` | boolean | `false` | 脏标记（显示圆点）；关闭时触发确认 |
| `params` / `query` | object | 无 | `query` 会编码进 URL；`params` 通过 `tab:init` 消息传给页面 |
| `label` / `name` / `src` / `tabId` | string | — | 兼容别名，等价于 `title`/`url`/`id` |

### 3.4 实例 API（`el.__kuiTabs`）

| 签名 | 返回 | 说明 |
| --- | --- | --- |
| `open(tab)` | id \| null | 打开/更新标签并激活；超过 `maxTabs` 返回 `null` 并 toast 警告 |
| `activate(id, [options])` | `api` | 激活标签；`options.silent` 不派发 `activate`，`options.fromHistory` 不写历史 |
| `close(id, [options])` | boolean | 直接关闭；`{confirmDirty:true}` 时脏标签走确认流程 |
| `closeOthers([id])` | `api` | 关闭其他（保留固定标签，除非 `pinnedClosable`） |
| `closeAll()` | `api` | 关闭全部（同上保留固定标签） |
| `requestClose(tabOrId)` | void | 带 `tab:before-close` 握手与脏确认的关闭入口；外部建议用 `close(id,{confirmDirty:true})` |
| `refresh(id, [options])` | `api` | 重载标签；`{notifyOnly:true}` 只发 `tab:refresh` 消息不重设 `src` |
| `setTitle(id, title)` | `api` | 改标题（同步 iframe 的 `title`） |
| `setIcon(id, icon)` | `api` | 换图标（`''` 移除） |
| `setBadge(id, value, [badgeType])` | `api` | 改徽标（空值清除） |
| `setDirty(id, flag)` | `api` | 脏标记；派发 `dirty` |
| `updateUrl(id, url)` | `api` | 改地址并标脏待加载（下次激活/刷新生效） |
| `getActive()` | id \| '' | 当前激活标签 id |
| `getTabs()` / `list()` | array | `publicTab` 数组：`{id,title,url,icon,pinned,closable,badge,dirty,params,active,loaded}` |
| `count()` | number | 标签数量 |
| `exists(id)` | boolean | 是否存在 |
| `back()` / `forward()` | `api` | 历史前进/后退（上限 100 条） |
| `canBack()` / `canForward()` / `hasHistory()` | boolean | 历史状态（导航条按钮用） |
| `scrollIntoView()` | `api` | 把当前标签滚入可视区 |
| `on / off / emit` | `api` | 实例事件注册 / 注销 / 手动派发 |
| `destroy()` | void | 解绑全局监听、清空 pane/item、派发 `tabs:destroy` |

```js
var tabs = KUI.app.instance.tabs;

var id = tabs.open({ id: 'orders', title: '订单', url: 'pages/orders.html' });
tabs.setBadge('orders', 5, 'danger');
tabs.setDirty('orders', true);         // 显示脏点，关闭时弹确认
tabs.refresh(id);                       // 强制重载 iframe
tabs.closeOthers('home');               // 只留 home 与固定标签
tabs.back();                            // 历史后退
```

### 3.5 事件表

| 事件名 | 参数 | 触发时机 | 可取消 |
| --- | --- | --- | --- |
| `ready` | `{el}` | 渲染与初始标签打开完成 | 否 |
| `open` | `{tab}` | `open()` 新建成功 | 否 |
| `close` | `{tab}` | 标签 DOM 被移除后 | 否 |
| `activate` | `{tab, previous, fromHistory}` | 切换到某标签（`silent` 时不发） | 否 |
| `refresh` | `{tab}` | `refresh()` 执行后 | 否 |
| `dirty` | `{tab, dirty}` | `setDirty` 或 iframe 上报脏状态 | 否 |
| `contextmenu` | `{tab, x, y, menu}` | 标签右键菜单弹出 | 否 |
| `action` | `{action, params, tabId}` | 右键菜单项被点击 | 否 |
| `reorder` | `{order}` | 拖拽排序结束（`order` 为 id 数组） | 否 |
| `theme` | `{tab, id, applied}` | iframe 请求切主题 | 否 |
| `height` | `{tab, height}` | iframe 上报内容高度 | 否 |
| `overflow` | `{left, right}` | 标签条可滚动状态变化 | 否 |

所有事件同时以 `tabs:<事件名>` 形式发到全局总线（`ctx.emit` → `KUI.bus`），所以外部可以直接 `KUI.bus.on('tabs:activate', fn)`。**没有可取消事件**；想阻止关闭请用 `tab:before-close` 握手（业务页回 `{ok:false}`，见 11 章）。

### 3.6 业务函数（scope `tabs`）高频用法

```json
{ "type": "button", "props": { "text": "打开日志" },
  "on": { "click": { "fn": "tabs.open",
    "args": { "id": "logs", "title": "操作日志", "url": "pages/logs.html", "icon": "list" } } } }
```

```json
{ "type": "button", "props": { "text": "关闭当前" }, "on": { "click": { "fn": "tabs.closeActive" } } }
```

```json
{ "type": "button", "props": { "text": "下一个标签" },
  "on": { "click": { "fn": "tabs.activateNext" } } }
```

```json
{ "type": "button", "props": { "text": "刷新当前" }, "on": { "click": { "fn": "tabs.refreshActive" } } }
```

`tabs.open` 的 `url` 为空时返回 `null` 且不打开；需要动态 URL 时可在业务页里直接调 `KUI.app.instance.tabs.open(...)`。

### 3.7 实战：多标签工作区（场景 a 的容器部分）

这份配置就是 `config/app.json` 里 `tabs` 段的精简版，可直接粘到该段：

```json
{
  "closable": true,
  "pinnedClosable": false,
  "keepAlive": true,
  "maxTabs": 24,
  "contextMenu": true,
  "drag": false,
  "emptyText": "暂无打开的页面",
  "home": { "id": "home", "title": "首页", "url": "pages/home.html", "icon": "home", "pinned": true, "closable": false },
  "initial": [
    { "id": "profile", "title": "个人资料", "url": "pages/profile.html", "icon": "user" },
    { "id": "theme-page", "title": "主题演示", "url": "pages/theme.html", "icon": "palette" }
  ],
  "sandbox": ""
}
```

配套的关闭策略：

```js
var tabs = KUI.app.instance.tabs;

// 业务页离开前确认：脏标签才弹对话框
tabs.setDirty('profile', true);

// 程序化关闭：直接关；带确认关
tabs.close('theme-page');
tabs.close('profile', { confirmDirty: true });   // 脏状态 → dialog.confirm

// 「关闭其他」不会动 pinned 标签
tabs.closeOthers('home');
```

保活的含义：每个标签的 iframe 从第一次激活后一直存在，切走只是 `display:none`；因此页面里的滚动位置、表单输入、定时器都保留。想刷新用 `refresh`，想释放内存只能 `close`。

### 3.8 与其他组件的联动

- **菜单 → 标签**：菜单项 `target.tab` 被动作系统糖化为 `tab.open`；`target.tab.id` 与菜单项 id 相同，是「菜单高亮 / 标签复用」的约定（示例里 `home` 同 id）。
- **标签 → 面包屑 / 历史按钮**：`app-shell` 监听实例 `activate`（`src/components/app-shell.js:345-359`），派发 `tab:activate`、更新面包屑兜底与导航条历史按钮；导航条点前进/后退最终落在 `tabs.back()/forward()`。
- **标签 → 弹窗/提示**：iframe 页面通过 `kui-frame` 发 `frame:dialog` / `frame:toast`，由 `tabs` 转交 `KUI.dialog` / `KUI.toast`（`src/components/tabs.js:1095-1257`），协议细节见 [11-api-messaging.md](11-api-messaging.md)。
- **主题广播**：全局 `theme:change` 时，`tabs` 向所有已加载 iframe `postMessage` 主题；iframe 主动请求切主题时也会调 `KUI.theme.apply` 并（默认）弹提示。
- **与 dialog 的边界**：弹窗本身也是 iframe，但**不占用标签**；弹窗里的页面按钮可通过 `dialog:open` 继续开子弹窗，不能直接开标签，需要走 `tab.open` 动作。

### 3.9 常见错误与排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 标签页白屏 / 空白 iframe | `url` 404、`file://` 下跨目录、或路径没算上 `urlPrefix` | 用 http 访问；检查 Network 面板里 iframe 的 404 |
| 同一页面开了很多重复标签 | 每次 `open` 都用了新 `id`（或没写 `id`） | 固定业务 id，例如用页面 key |
| 点关闭没反应 | `closable:false`、`pinned:true` 且 `pinnedClosable:false`，或脏标签在等确认 | 检查字段；看是否弹出了确认框 |
| `open` 返回 `null` | 已达到 `maxTabs`（默认 24） | 先 `close` 或 `closeOthers`；必要时提高 `maxTabs` |
| 右键没有菜单 | `contextMenu:false`，或点在标签条空白处 | 打开 `contextMenu`；右键要落在具体标签上 |
| 拖拽没反应 | `drag:false`（`app.json` 默认就是 `false`） | 打开 `drag`；移动端拖拽体验差，建议保持关闭 |
| iframe 里 `parent.KUI` 拿不到 | 跨域 / file:// 限制 | 用 `kui-frame` 的 `postMessage` 协议，不直接访问父窗口 |

## 4. dialog：iframe 弹窗

### 4.1 作用与在整体界面中的位置

- 渲染文件：`src/components/dialog.js`（约 1155 行），类型名 `dialog`，`category: 'shell'`（`src/components/dialog.js:1115-1120`）；同时暴露静态 API `KUI.dialog`。
- **每个弹窗都是一个独立 iframe**（`src/frame/dialog-frame.html`）。父页面只负责遮罩、层叠、尺寸、拖拽/最大化、消息转发；标题、正文、表单、按钮都渲染在 iframe 里，所以弹窗内容不会污染主页面样式。
- 主应用里没有「dialog 节点」的固定位置：任何组件、动作、业务页都可以随时打开弹窗（`dialog.*` 动作、`KUI.dialog.*`）。`app.json` 的 `dialogs` 段只是**示例配置**（`src/app/bootstrap.js:583` 用它作为「设置」弹窗的内容），不是组件 props 默认值。
- 独立使用：`standalone/dialog.html`。
- DOM：`.kui-dialog-layer[data-dialog-id]`（含 `--{type}`、`.is-open`、`.is-loading`、`.is-stacked`）→ `.kui-dialog-mask` + `.kui-dialog-wrap`（`.is-maximized`、`.kui-dialog-handle` 拖拽手柄）→ `.kui-dialog-frame`。打开时 `body` 加 `.kui-dialog-open` 锁滚动；层级基准取 CSS 变量 `--kui-z-dialog`（`src/styles/base.css:342` 为 2000，JS 读取失败时兜底 1200，见 `src/components/dialog.js:256-268`）。
- 依赖：`dialog-frame.html` 必须在同一 http 源下（`file://` 直接打开会因同源策略失败）；表单内容需要表单引擎与控件（见 [05-controls-input.md](05-controls-input.md)、[07-form-engine.md](07-form-engine.md)）。

### 4.2 最小可运行示例

节点形式（挂载即打开一个弹窗，适合演示与简单提示）：

```json
{
  "type": "dialog",
  "props": {
    "type": "alert",
    "title": "提示",
    "icon": "info",
    "message": "灵装回路已重新校准。",
    "okText": "知道了"
  }
}
```

脚本形式（拿到 Promise，能等用户操作结果）：

```js
KUI.dialog.alert('灵装回路已重新校准。');

KUI.dialog.confirm({ title: '删除结界', message: '删除后不可恢复，确定继续？', danger: true })
  .then(function (ok) {
    if (ok) { KUI.toast.success('已删除'); }
  });

KUI.dialog.form({
  title: '新建结界',
  width: 520,
  data: { name: '', mode: 'timeline' },
  nodes: [
    { id: 'name', type: 'input', label: '名称', required: true },
    { id: 'mode', type: 'select', label: '模式', options: [
      { label: '时间线', value: 'timeline' },
      { label: '封印', value: 'seal' }
    ] }
  ]
}).then(function (data) {
  if (data) { KUI.toast.success('已创建：' + data.name); }
});
```

### 4.3 props 全字段表

默认值取自 `src/components/dialog.js:137-181` 的 `DEFAULTS`。**注意：源码没有 `desc`、`content`、`escClosable` 三个字段**——对应物分别是 `message`（说明文字）、`nodes`（内容节点树）、`closeOnEsc`（Esc 关闭），旧文档里的写法不会生效。

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `id` | string | `''` | 否 | 弹窗 id；不传自动生成；同 id 再次打开会先关旧窗 |
| `type` | string | `'dialog'` | 否 | `dialog` / `alert` / `confirm` / `prompt` / `form` / `custom`；决定 iframe 内的骨架与按钮 |
| `title` | string | `''` | 否 | 标题（也写入 iframe 的 `title`） |
| `icon` | string | `''` | 否 | 标题左侧图标名 |
| `width` | number \| string | `480` | 否 | 宽度；数字按 px，字符串原样 |
| `height` | number \| string | `'auto'` | 否 | 高度；`'auto'` 时由 iframe 上报内容高度自动撑开 |
| `maxWidth` | string | `'92vw'` | 否 | 最大宽度，窄屏保护 |
| `maskClosable` | boolean | `true` | 否 | 点遮罩是否关闭（`alert`/`confirm`/`prompt`/`form` 工厂会强制为 `false`） |
| `closeOnEsc` | boolean | `true` | 否 | Esc 是否关闭（只能关栈顶且要求 `closable`） |
| `closable` | boolean | `true` | 否 | 是否显示右上角关闭按钮 / 允许 Esc |
| `draggable` | boolean | `false` | 否 | 是否可拖拽（首次拖拽后 `wrap` 转为 fixed 定位） |
| `maximizable` | boolean | `false` | 否 | 是否可最大化（双击拖拽手柄也会切换） |
| `maximized` | boolean | `false` | 否 | 初始是否最大化 |
| `layer` | number | `1` | 否 | 嵌套层级；子弹窗由内部自动 +1 |
| `parentId` | string | `null` | 否 | 父弹窗 id（嵌套弹窗使用） |
| `theme` | string | `null` | 否 | 指定主题 id（`null` 跟随当前主题） |
| `className` | string | `''` | 否 | 附加到 layer 的类名 |
| `loading` | boolean | `false` | 否 | 打开时是否先显示加载态 |
| `message` | string | `''` | 否 | 正文文本（`alert`/`confirm`/`prompt` 的说明文字） |
| `nodes` | array | `null` | 否 | iframe 内的内容节点树（表单/自定义布局都靠它） |
| `data` | object | `null` | 否 | 表单初始数据（`form` 类型） |
| `layout` | string \| object | `'vertical'` | 否 | 表单布局，可传 `{columns,gap,labelWidth,labelPosition}` |
| `label` | string | `''` | 否 | `prompt` 的输入框标签 |
| `placeholder` | string | `''` | 否 | `prompt` 的占位文字 |
| `defaultValue` | any | `''` | 否 | `prompt` 的默认值 |
| `input` | object | `null` | 否 | `prompt` 输入配置，如 `{type:'textarea',maxlength:200}` |
| `rules` | array | `null` | 否 | `prompt` 校验规则，如 `[{required:true,message:'必填'}]` |
| `okText` | string | `''` | 否 | 确认按钮文字；空时按内置文本「确定」渲染 |
| `cancelText` | string | `''` | 否 | 取消按钮文字 |
| `submitApi` | function \| string | `null` | 否 | `form` 提交钩子：`function(data, record)`；返回 `false` 不关闭，返回数据则作为结果 |
| `danger` | boolean | `false` | 否 | 确认按钮使用危险色 |
| `actions` | array | `null` | 否 | `custom` 底部动作：`{id,text,type,icon,close,action,value}`；`close` 取 `true`/`false`/`'resolve'` |
| `remoteAction` | boolean | `false` | 否 | 是否允许 iframe 内的动作转发到父页面执行 |
| `onOk` | function | `null` | 否 | 确认回调，参数为结果值 |
| `onCancel` | function | `null` | 否 | 取消回调，参数为取消值（`confirm` 为 `false`，`alert` 为 `undefined`，其它为 `null`） |
| `onClose` | function | `null` | 否 | 关闭回调（无论确认/取消/遮罩/Esc 都会触发） |
| `onResolve` | function | `null` | 否 | 结果确定时的内部回调（与 `onOk`/`onCancel` 并行，普通业务用前两个即可） |

工厂默认值（`src/components/dialog.js:934-1014`）：

| 工厂 | `type` | 默认标题 | 默认图标 | 默认宽度 | `maskClosable` | 按钮 |
| --- | --- | --- | --- | --- | --- | --- |
| `alert` | `alert` | 提示 | `info` | 420 | 由 `closeOnMask` 决定（默认 `true`） | 确定（无取消） |
| `confirm` | `confirm` | 确认 | `question` | 420 | `false` | 确定 / 取消 |
| `prompt` | `prompt` | 输入 | 无 | 420 | `false` | 确定 / 取消 |
| `form` | `form` | 表单 | 无 | 520 | `false` | 确定 / 取消 |
| `custom` | `custom` | 无 | 无 | 560 | 默认值 | 由 `actions` 决定 |

### 4.4 API（`KUI.dialog.*`）

| 签名 | 返回 | 说明 |
| --- | --- | --- |
| `open(config)` | `Promise` | 打开弹窗；resolve 确认值，取消时 resolve 取消值（不 reject） |
| `close(id)` | void | 关闭指定弹窗（等价于用户点取消） |
| `closeAll()` | void | 关闭全部 |
| `has(id)` / `get(id)` | boolean / object | 是否存在 / 取快照 `{id,type,title,width,height,closed,ready,maximized,config,el}` |
| `count()` / `top()` | number / object | 当前弹窗数量 / 栈顶弹窗快照 |
| `update(id, patch)` | void | 更新 `width`/`maximized` 等运行时属性 |
| `maximize(id)` / `restore(id)` | void | 最大化 / 还原 |
| `alert(config \| string)` | `Promise` | 单按钮提示 |
| `confirm(config \| string)` | `Promise<boolean>` | 确认框，确认 `true`、取消 `false` |
| `prompt(config \| string)` | `Promise` | 输入框，确认返回输入值，取消返回 `null` |
| `form(config)` | `Promise` | 内嵌表单，确认返回数据对象 |
| `custom(config)` | `Promise` | 完全自定义内容 + `actions` |
| `config(patch)` | object | 合并默认配置（谨慎：会改动 `DEFAULTS`） |
| `defaults` | object | 只读查看默认值 |

```js
// 带业务提交的表单弹窗：失败不关闭
KUI.dialog.form({
  title: '保存配置',
  submitApi: function (data) {
    if (!data.code) {
      KUI.toast.warning('配置编码不能为空');
      return false;                 // 阻止关闭
    }
    return data;                    // 作为 Promise 结果
  },
  nodes: [
    { id: 'code', type: 'input', label: '配置编码', required: true }
  ]
}).then(function (data) {
  if (data) { KUI.toast.success('已保存 ' + data.code); }
});

// 嵌套：在已打开的弹窗之上再开一层
KUI.dialog.confirm({ title: '第 1 层', message: '继续？' }).then(function (ok) {
  if (ok) { KUI.dialog.alert('第 2 层'); }
});
```

### 4.5 事件表

弹窗**没有实例 `on/off` API**，对外事件走全局总线（`KUI.bus.on('dialog:close', …)`），配置级回调走 `onOk` / `onCancel` / `onClose`。

| 事件名 | 参数 | 触发时机 | 可取消 |
| --- | --- | --- | --- |
| `dialog:open` | `{id, config}` | 弹窗开始创建 | 否 |
| `dialog:close` | `{id, value}` | 弹窗 DOM 移除后 | 否 |
| `dialog:resize` | `{id, height, width}` | iframe 上报内容高度变化 | 否 |
| `dialog:maximize` | `{id, maximized}` | 最大化 / 还原 | 否 |
| `onOk` 回调 | `value` | 点确认并通过校验/提交 | 否 |
| `onCancel` 回调 | `cancelValue` | 点取消 / 关闭 / 遮罩（允许时） | 否 |
| `onClose` 回调 | `cancelValue` | 任何关闭路径（含 Esc） | 否 |

`alert` 只 resolve `undefined`；iframe 里的业务页还可以通过 `kui-frame` 反向调用父页面：`frame:toast`、`frame:dialog`、`frame:theme` 等（见 [11-api-messaging.md](11-api-messaging.md)）。

### 4.6 业务函数（scope `dialog`）高频用法

```json
{ "type": "button", "props": { "text": "简单提示" },
  "on": { "click": { "fn": "dialog.alert", "args": { "title": "提示", "message": "操作已完成" } } } }
```

```json
{ "type": "button", "props": { "text": "确认删除", "type": "danger" },
  "on": { "click": { "fn": "dialog.confirm",
    "args": { "title": "删除结界", "message": "删除后不可恢复", "danger": true } } } }
```

```json
{ "type": "button", "props": { "text": "打开表单" },
  "on": { "click": { "fn": "dialog.form", "args": {
    "title": "新建标签页", "width": 460,
    "nodes": [
      { "id": "title", "type": "input", "label": "标题", "required": true },
      { "id": "url", "type": "input", "label": "地址", "required": true }
    ] } } } }
```

```json
{ "type": "button", "props": { "text": "关闭全部弹窗" },
  "on": { "click": { "fn": "dialog.closeAll" } } }
```

### 4.7 实战：弹窗表单（场景 b，`dialog.form` 联动）

下面这份配置就是 `config/demos/dialog.json` 里 `form-seal` 的精简版，可直接作为 `KUI.dialog.form(config)` 的参数或 `dialog.form` 动作的 `args`：

```json
{
  "title": "灵装回路配置",
  "width": 560,
  "draggable": true,
  "okText": "保存配置",
  "cancelText": "放弃修改",
  "layout": { "columns": 1, "gap": 14, "labelWidth": 88, "labelPosition": "left" },
  "data": { "sealName": "刻刻帝 · 一之弹", "mode": "timeline", "reuse": true },
  "nodes": [
    { "id": "sealName", "type": "input", "label": "结界名称", "required": true,
      "props": { "placeholder": "输入结界名称", "clearable": true } },
    { "id": "mode", "type": "select", "label": "时间模式", "options": [
      { "label": "时间线", "value": "timeline" },
      { "label": "封印", "value": "seal" },
      { "label": "自定义", "value": "custom" }
    ] },
    { "id": "reuse", "type": "switch", "label": "复用回路",
      "props": { "activeText": "复用", "inactiveText": "新建" } },
    { "id": "remark", "type": "textarea", "label": "配置说明", "span": 2,
      "props": { "rows": 3, "maxlength": 200, "showCount": true } }
  ]
}
```

把提交逻辑放到父页面（`submitApi` 只能在父页面传，iframe 内的按钮负责触发）：

```js
function openSealForm() {
  return KUI.dialog.form({
    title: '灵装回路配置',
    width: 560,
    data: { sealName: '刻刻帝 · 一之弹', mode: 'timeline', reuse: true },
    nodes: [
      { id: 'sealName', type: 'input', label: '结界名称', required: true },
      { id: 'mode', type: 'select', label: '时间模式', options: [
        { label: '时间线', value: 'timeline' },
        { label: '封印', value: 'seal' }
      ] }
    ],
    submitApi: function (data) {
      // 模拟异步校验：返回 Promise 时等待其 resolve
      return new Promise(function (resolve) {
        setTimeout(function () {
          if (data.sealName.indexOf('禁') >= 0) {
            KUI.toast.error('名称包含禁用词');
            resolve(false);            // false = 不关闭
          } else {
            resolve(data);
          }
        }, 300);
      });
    }
  });
}
```

表单提交的返回值约定（`src/components/dialog.js:661-693`）：`submitApi` 返回 `false`（或 Promise 值为 `false`）→ **不关闭**；返回 `undefined` / `true` → 以表单数据作为结果关闭；抛错 → iframe 内显示「提交失败，请稍后重试」并保持打开。

### 4.8 与其他组件的联动

- **tabs 里的页面开弹窗**：业务页调用 `KUI.frame.dialog(...)`（`kui-frame` 注入），`tabs` 收到 `frame:dialog` 后交由 `KUI.dialog` 打开，并把结果回传给页面（协议见 [11-api-messaging.md](11-api-messaging.md)）。
- **嵌套弹窗**：iframe 内再触发 `dialog:open` 时，父页面自动加 `parentId` 与 `layer+1`，关闭子窗后回传结果；层级由 `recomputeStack` 重排。
- **Esc 只关栈顶**：全局 Escape 监听要求 `closeOnEsc` 且 `closable`，并只关最上层弹窗（`src/components/dialog.js:1046-1080`）。
- **主题**：全局 `theme:change` 会向所有弹窗 iframe `postMessage` 主题；弹窗内请求切主题也会回写主页面。
- **弹窗内动作**：`actions[].action` 或 iframe 里的按钮触发未注册动作时，父页面会提示「动作未注册」，并要求先用 `KUI.actions.register` 注册；这是故意 fail-fast，不是 bug。
- **与 `app.json` 的边界**：`app.json.dialogs` 只是「设置」弹窗的示例内容（`src/app/bootstrap.js:583`），字段语义见 [04-config-app.md](04-config-app.md)，本节讲的是 `KUI.dialog` 与节点 props。

### 4.9 常见错误与排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 弹窗空白 / iframe 加载失败 | `file://` 打开页面，或 `dialog-frame.html` 路径不对 | 用 `http://127.0.0.1:8080` 访问；检查 `KUI.config.get('dialog.frameUrl')` |
| 弹窗内容很高但出现滚动条 | 内容高度未上报（业务页未按协议发 `frame:height`） | 业务页用 `kui-frame` 的 `resize`/`height` 能力；或给弹窗固定 `height` |
| 点遮罩不关闭 | `maskClosable:false`（`confirm`/`prompt`/`form` 工厂默认 `false`） | 显式传 `maskClosable:true` |
| Esc 不关闭 | `closeOnEsc:false` 或 `closable:false`，或不是栈顶弹窗 | 检查这三个条件 |
| `submitApi` 返回 `false` 仍关闭 | 返回了 Promise 但 resolve 了非 `false` 值 | 必须 `resolve(false)`；同步返回时直接 `return false` |
| 弹窗里按钮提示「动作未注册」 | iframe 内的 `action` 没在父页面注册 | 父页面 `KUI.actions.register('demo.xxx', fn)`，或改用 `handlers.run` |
| 连续打开多个弹窗层级错乱 | 手工传了 `layer`/`parentId` | 交给内部嵌套机制：在弹窗 iframe 内触发 `dialog:open`，不要手写 `layer` |
| 弹窗打不开且无报错 | 目标 `id` 已存在（同 id 会先关旧窗） | 换 id 或先 `KUI.dialog.close(id)` |

## 5. toast：全局轻提示

### 5.1 作用与在整体界面中的位置

- 渲染文件：`src/components/toast.js`（约 531 行），类型名 `toast`，同时暴露静态 API `KUI.toast`；**加载完成即挂载**，不依赖页面节点。
- 两种形态：`mode: 'toast'`（角落小条，默认）与 `mode: 'notification'`（右上大卡片，带标题/说明/动作）。
- 四种语义类型：`info` / `success` / `warning` / `error`（兼容别名 `danger` → `error`）。
- 主应用里没有它的配置段；`app.json` 的 `ui.toast` 会被 `bootstrap` 转交给 `KUI.toast.config`（`src/app/bootstrap.js:670-685`），用来改全局默认位置/数量/时长。
- 独立使用：`standalone/toast.html`；也可以在任意业务页直接 `KUI.toast.info('...')`。
- DOM：按位置分图层 `.kui-toast-layer[data-toast-layer]`（notification 另有 `--notification` 修饰），每条约 `.kui-toast.kui-toast--{type}.kui-toast--{mode}`，内含 `.kui-toast__accent`、`.kui-toast__icon`、`.kui-toast__body`（`__title`/`__message`）、可选的 `__action`、`__close`、`__progress > __progress-bar`。层级用 CSS 变量 `--kui-z-toast`（`src/styles/base.css:343`，默认 3000）。

### 5.2 最小可运行示例

```js
KUI.toast.info('已保存');
KUI.toast.success('灵装回路已校准', { title: '成功' });
KUI.toast.warning('当前为只读模式', { duration: 0 });   // duration:0 = 常驻
KUI.toast.error({ title: '同步失败', message: '网络不可达，请稍后重试' });
KUI.toast.notify({ title: '新消息', message: '时间线出现新的分支', duration: 0 });
```

节点形式（挂载即弹出一条，适合演示配置）：

```json
{
  "type": "toast",
  "props": {
    "mode": "notification",
    "type": "success",
    "title": "部署完成",
    "message": "12 个页面已更新",
    "duration": 4000,
    "closable": true,
    "progress": true,
    "position": "top-right",
    "max": 3
  }
}
```

### 5.3 props 全字段表

默认值取自 `src/components/toast.js:123-138` 的 `DEFAULTS`；节点挂载时 `node.props` 会 `deepMerge` 到全局配置上。

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `id` | string | `''` | 否 | 唯一 id；同 id 先关旧再开新（替换语义） |
| `type` | string | `'info'` | 否 | `info`/`success`/`warning`/`error`（`danger` 当 `error`）；非法值回落 `info` |
| `mode` | string | `'toast'` | 否 | `toast` 小条 / `notification` 大卡片 |
| `title` | string | `''` | 否 | 标题；`title` 与 `message` 都为空时 `show` 直接返回 `null` |
| `message` | string | `''` | 否 | 正文；字符串形式 `show('文本')` 等价 `{message:文本}` |
| `icon` | string | `''` | 否 | 覆盖默认类型图标（空=按 `type` 取内置图标） |
| `duration` | number | `3200` | 否 | 毫秒；`0` 表示不自动关闭；`progress` 条按它计时 |
| `position` | string | `'top-right'` | 否 | `top-left`/`top-right`/`bottom-left`/`bottom-right`/`top-center`/`bottom-center`；非法值回落 `top-right` |
| `closable` | boolean | `true` | 否 | 是否显示关闭按钮 |
| `progress` | boolean | `true` | 否 | 是否显示倒计时进度条（`duration>0` 时才有意义） |
| `action` | object | `null` | 否 | 附加按钮 `{text, onClick}`；`onClick` 返回 `false` 可阻止自动关闭 |
| `max` | number | `5` | 否 | 同图层最多显示条数；超出时关掉最旧的一条（最低 1） |
| `onClose` | function | `null` | 否 | 关闭回调，参数为原因：`timeout`/`close`/`overflow`/`replace` |
| `className` | string | `''` | 否 | 附加类名 |

全局默认的调整入口是 `KUI.toast.config(patch)`（`patch.position` 与 `patch.notificationPosition` 生效）；`app.json` 的 `ui.toast` 会在启动时走到这里。

### 5.4 API（`KUI.toast.*`）

| 签名 | 返回 | 说明 |
| --- | --- | --- |
| `show(options)` | id \| null | 通用入口；字符串=正文；返回消息 id，无内容时 `null` |
| `info/success/warning/error(message, [options])` | id \| null | 四类快捷方法；`message` 传对象时当作 options |
| `message(message, [options])` | id \| null | `info` 的别名 |
| `notify(options)` | id \| null | 打开通知卡片（`mode:'notification'`） |
| `close(id)` | void | 关闭指定消息（播放退出动画） |
| `closeAll([filter])` | void | 关闭全部或按条件过滤 |
| `clear()` | void | 同 `closeAll()`，语义化别名 |
| `count([filter])` | number | 当前消息数量 |
| `config(patch)` | object | 合并全局默认（返回当前配置） |
| `defaults` | object | 只读默认值 |
| `notification.show/close/closeAll/setPosition/getPosition` | — | 通知卡片的便捷入口 |

```js
var id = KUI.toast.show({ title: '保存中', message: '正在写入…', duration: 0 });
KUI.toast.close(id);                       // 手动关闭常驻消息

KUI.toast.count();                          // 全部数量
KUI.toast.count({ mode: 'notification' });  // 只看通知卡片

KUI.toast.notify({
  title: '构建完成',
  message: '产物已写入 config/bundle.js',
  duration: 0,
  action: { text: '打开详情', onClick: function () { KUI.dialog.alert('详情'); return false; } }
});
```

### 5.5 事件表

| 事件名 | 参数 | 触发时机 | 可取消 |
| --- | --- | --- | --- |
| `toast:show` | `{id, type, mode, options}` | 一条消息开始展示 | 否 |
| `toast:close` | `{id, reason}` | 一条消息开始退出；`reason` 为 `timeout`/`close`/`overflow`/`replace` | 否 |
| `onClose(reason)` 回调 | `reason` | 同上，单条消息粒度 | 否 |

`KUI.bus.on('toast:close', function (payload) { console.log(payload.reason); })` 适合统一埋点。

### 5.6 业务函数（scope `toast`）高频用法

```json
{ "type": "button", "props": { "text": "保存" },
  "on": { "click": { "fn": "toast.success", "args": { "text": "已保存" } } } }
```

```json
{ "type": "button", "props": { "text": "同步失败示例" },
  "on": { "click": { "fn": "toast.error",
    "args": { "title": "同步失败", "message": "网络不可达" } } } }
```

```json
{ "type": "button", "props": { "text": "演示四种提示" },
  "on": { "click": { "fn": "toast.demo", "args": { "delay": 180 } } } }
```

```json
{ "type": "button", "props": { "text": "清空提示" },
  "on": { "click": { "fn": "toast.clear" } } }
```

### 5.7 实战：通知流（场景 c）

一条完整通知流：开始 → 成功/失败二选一 → 常驻卡片要求处理。可直接放进页面按钮的业务函数里：

```js
function runImport(rows) {
  var id = KUI.toast.show({ title: '正在导入', message: '共 ' + rows + ' 行', duration: 0 });

  // 第 1 步：进度提示（替换同一个 id，不会堆叠）
  setTimeout(function () {
    KUI.toast.show({ id: id, title: '正在导入', message: '已处理 ' + Math.floor(rows / 2) + ' 行', duration: 0 });
  }, 400);

  // 第 2 步：结果
  setTimeout(function () {
    KUI.toast.close(id);
    KUI.toast.success('导入完成：共 ' + rows + ' 行');
    // 失败分支：
    // KUI.toast.error({ title: '导入失败', message: '第 12 行格式不正确' });
  }, 900);
}
```

常驻通知 + 动作 + 去重：`id` 相同时后一条会替换前一条，适合「同一类事件只留最新一条」。

```js
KUI.toast.notify({
  id: 'build-status',
  title: '构建状态',
  message: '最近一次构建仍在进行',
  duration: 0,
  closable: true,
  action: {
    text: '查看日志',
    onClick: function () {
      KUI.app.instance.tabs.open({ id: 'build-log', title: '构建日志', url: 'pages/logs.html' });
      return true;                          // true = 允许自动关闭（这里 duration:0 本来也不会关）
    }
  }
});
```

### 5.8 与其他组件的联动

- **tabs 里的页面**：业务页调用 `KUI.frame.toast(...)`，`tabs` 收到 `frame:toast` 后转交 `KUI.toast.show`（`src/components/tabs.js:1095-1257`）；因此提示始终出现在主页面角落，而不是被 iframe 裁剪。
- **弹窗里的页面**：同理走 `frame:toast`/`dialog:toast`，`dialog` 会把它交给 `KUI.toast.show`。
- **业务函数**：`app` scope 的 `notify`（转 `toast.show`）与 `info`（弹「当前框架」）是最常用的组合入口；完整表见 [10-actions-handlers.md](10-actions-handlers.md)。
- **主题**：toast 是主页面 DOM，跟随 `KUI.theme` 的 CSS 变量，不需要额外处理。
- **与 dialog 的层级**：`--kui-z-toast`（3000）高于 `--kui-z-dialog`（2000），所以提示会盖在弹窗之上。

### 5.9 常见错误与排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 调用后没有任何提示 | `title` 与 `message` 都为空，`show` 返回 `null` | 至少传一个；或检查是否传了字符串但被当成 options |
| 提示不消失 | `duration:0`（常驻）、或鼠标悬停暂停了倒计时 | 关掉常驻；移开鼠标；或手动 `close(id)` |
| 提示越堆越多 | 每次都是新 `id`，且没设置 `max` 或 `max` 太大 | 复用固定 `id`（替换语义）或调小 `max`（默认 5） |
| 位置写法无效 | `position` 拼写不在 6 个枚举里 | 只用 `top-right` 等 6 个值；非法值会静默回落右上 |
| 关不掉 | `closable:false` 且 `duration:0` | 打开 `closable` 或给 `duration` |
| 自定义按钮点了没反应 | `action.onClick` 抛错，或返回 `false` 后误以为没生效 | `false` 只表示「不自动关闭」；执行逻辑要在回调里自己写 |
| iframe 里调 `KUI.toast` 报错 | iframe 内没有完整 `KUI` | 用 `KUI.frame.toast(...)`，交给父页面显示 |

## 6. app-shell：应用骨架

### 6.1 作用与在整体界面中的位置

- 渲染文件：`src/components/app-shell.js`（约 663 行），类型名 `app-shell`，`category: 'layout'`（`src/components/app-shell.js:638-661`）；实例挂在 `el.__kuiApp`，静态入口是 `KUI.app`。
- 它**不直接画界面**，只负责三件事：① 搭骨架（左侧 menu、顶部 menunav、中间 tabs）；② 把 `app.json` 的 `app`/`layout`/`menu`/`menunav`/`tabs` 段注入子组件；③ 维护折叠状态、面包屑兜底、历史按钮、子组件生命周期。
- 主应用装配：`index.html` 里只有挂载点 `#kui-app`（`index.html:120-125`），`bootstrap` 读 `config/app.json` 后调用 `KUI.app.create(host, appCfg, { initialTabs })`（`src/app/bootstrap.js:745`）。也可以直接写节点：`{"type":"app-shell","props":{...}}`。
- 独立使用：`standalone/no-shell.html` 演示了**不用** app-shell、手工拼 menu + menunav + tabs 的等价写法。
- DOM 与 CSS 变量：`.kui-app[data-kui-shell]` → `.kui-app__left`（menu）+ `.kui-app__main` → `.kui-app__header`（menunav）+ `.kui-app__center`（tabs）。布局用变量驱动：`--kui-menu-width`、`--kui-menu-width-collapsed`、`--kui-header-height`、`--kui-tabbar-height`、`--kui-app-gap`；折叠时根节点加 `.is-menu-collapsed` / `.kui-app--collapsed`。
- 折叠状态记忆：`localStorage['kui-menu-collapsed']`（`src/components/app-shell.js:57-73`），刷新后保持。

### 6.2 最小可运行示例

```json
{
  "type": "app-shell",
  "props": {
    "app": { "title": "刻刻帝终端", "subtitle": "KurumiUI v1.3.6", "logoIcon": "clock", "home": "pages/home.html" },
    "layout": {
      "gap": 10,
      "menu": { "width": 252, "collapsedWidth": 68, "collapsed": false },
      "header": { "height": 56 },
      "tabbarHeight": 38
    },
    "menu": {
      "type": "menu",
      "props": {
        "defaultActive": "home",
        "items": [
          { "id": "home", "type": "item", "label": "总览", "icon": "home",
            "target": { "tab": { "id": "home", "title": "总览", "url": "pages/home.html", "icon": "home", "pinned": true } } }
        ]
      }
    },
    "menunav": { "type": "menunav", "props": { "title": "刻刻帝终端", "showFullscreen": true } },
    "tabs": { "type": "tabs", "props": { "home": "pages/home.html", "maxTabs": 12 } }
  }
}
```

```js
KUI.app.create(document.getElementById('kui-app'), window.__KUI_CONFIG__, { initialTabs: [] });

var app = KUI.app.instance;
app.toggleCollapsed();
app.openTab({ id: 'logs', title: '日志', url: 'pages/logs.html' });
console.log(app.isCollapsed(), app.getActiveTab());
```

### 6.3 props 全字段表

默认值来自 `src/components/app-shell.js:25-32`；`config` 里没有显式给的字段都会用兜底逻辑补齐。

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `app` | object | `{title:'KurumiUI'}` | 否 | 应用元信息：`title`/`name`/`subtitle`/`version`/`documentTitle`/`logoIcon`/`home`/`copyright`；注入 menu.brand 与 menunav.title |
| `layout` | object | `{}` | 否 | 尺寸：`gap`(10)、`menu.width`(252)、`menu.collapsedWidth`(68)、`menu.collapsed`(false)、`header.height`(56)、`tabbarHeight`(38) |
| `layout.menuWidth` / `menuCollapsedWidth` / `headerHeight` | number | 同默认值 | 否 | 扁平别名，优先级低于 `layout.menu.width` 等嵌套写法 |
| `menu` | object | `{type:'menu',props:{items:[]}}` | 否 | 左侧菜单；可写 `{type,props}` 或扁平 `{items:…}`（内部自动补 `type:'menu'`） |
| `menunav` | object | `{type:'menunav',props:{}}` | 否 | 顶部导航条；同上 |
| `tabs` | object | `{type:'tabs',props:{}}` | 否 | 标签工作区；同上 |
| `collapsed`（`layout.collapsed`） | boolean | `false` | 否 | 初始折叠；优先级：`layout.menu.collapsed` → `layout.collapsed` → localStorage → `false` |
| `avatar`（`app.avatar`） | object | 无 | 否 | 传入后会注入 `menu.brand.avatar`（未显式配置 menu.brand.avatar 时） |

> `app.json` 里各字段的含义与「哪些字段会被读走」见 [04-config-app.md](04-config-app.md)；本节只讲 app-shell 如何消费它们。

### 6.4 API

静态 `KUI.app`（`src/components/app-shell.js:595-632`，除 `isCollapsed`/`getActiveTab` 外都代理到 `KUI.app.instance`）：

| 签名 | 返回 | 说明 |
| --- | --- | --- |
| `create(host, config, [opts])` | `app` | 创建骨架；`opts={initialTabs,autoOpen,setTitle,ctx}` |
| `instance` / `instances` | `app` / array | 最近创建 / 全部实例 |
| `toggleCollapsed([force])` | void | 折叠/展开（可强制） |
| `setCollapsed(force)` | void | 设为折叠/展开 |
| `isCollapsed()` | boolean | 当前是否折叠 |
| `openTab(tab)` | id | 打开标签（转 `tabs.open`） |
| `closeTab(id)` | boolean | 关闭标签 |
| `refreshTab([id])` | void | 刷新标签（默认当前） |
| `getActiveTab()` | object \| null | 当前标签快照 |
| `selectMenu(id, [opts])` | void | 高亮菜单 + 按菜单项开标签 + 写面包屑（**推荐的面包屑联动入口**） |
| `setBreadcrumb(items)` | void | 直接改面包屑 |
| `setTitle(text)` | void | 改 document.title 与导航条标题 |
| `destroy()` | void | 销毁骨架与子组件 |

实例 `app` 还多出 `activeTabId()`、`back()`、`forward()`、`applyCollapsed()`、`menu`/`menunav`/`tabs`（三个子实例引用）、`on/off/emit`。

### 6.5 事件表

| 事件名 | 参数 | 触发时机 | 可取消 |
| --- | --- | --- | --- |
| `ready`（全局 `app:ready`） | `{app}` | 骨架、子组件、初始标签全部就绪 | 否 |
| `collapse`（全局 `app:collapse`） | `{collapsed}` | 折叠状态变化 | 否 |
| `menu:select` | `{id,item,tab,url,target}` | 菜单项被点击（由 menu 转发） | 否 |
| `tab:open` / `tab:activate` / `tab:close` / `tab:dirty` / `tab:contextmenu` | 子组件原始参数 | 标签事件转发 | 否 |
| 全局 `app:destroy` | `{el}` | 骨架销毁 | 否 |

### 6.6 业务函数（scope `app`）高频用法

```json
{ "type": "button", "props": { "text": "切换菜单折叠" }, "on": { "click": { "fn": "app.toggleMenu" } } }
```

```json
{ "type": "button", "props": { "text": "下一个主题" }, "on": { "click": { "fn": "app.nextTheme" } } }
```

```json
{ "type": "button", "props": { "text": "回到首页" }, "on": { "click": { "fn": "app.openHome" } } }
```

```json
{ "type": "button", "props": { "text": "打开订单页" },
  "on": { "click": { "fn": "app.openTab",
    "args": { "id": "orders", "title": "订单", "url": "pages/orders.html", "icon": "list" } } } }
```

```json
{ "type": "button", "props": { "text": "发一条通知" },
  "on": { "click": { "fn": "app.notify", "args": { "type": "success", "message": "操作已完成" } } } }
```

### 6.7 实战：多级菜单树 + 多 tab + 面包屑（场景 a）

`app.json` 的骨架部分（可直接改 `config/app.json` 对应段）：

```json
{
  "app": { "title": "刻刻帝终端", "subtitle": "KurumiUI v1.3.6", "logoIcon": "clock", "home": "pages/home.html" },
  "layout": { "gap": 10, "menu": { "width": 252, "collapsedWidth": 68 }, "header": { "height": 56 }, "tabbarHeight": 38 },
  "menu": {
    "type": "menu",
    "props": {
      "defaultActive": "home",
      "accordion": false,
      "items": [
        { "id": "home", "type": "item", "label": "总览", "icon": "home",
          "target": { "tab": { "id": "home", "title": "总览", "url": "pages/home.html", "icon": "home", "pinned": true } } },
        { "type": "divider" },
        { "id": "g-core", "type": "group", "label": "时间中枢", "children": [
          { "id": "profile", "type": "item", "label": "档案", "icon": "user", "badge": "新", "badgeType": "accent",
            "children": [
              { "id": "profile-basic", "type": "item", "label": "基础档案", "icon": "id-card",
                "target": { "tab": { "id": "profile-basic", "title": "基础档案", "url": "pages/profile.html", "icon": "id-card" } } },
              { "id": "profile-security", "type": "item", "label": "安全设置", "icon": "lock",
                "target": { "tab": { "id": "profile-security", "title": "安全设置", "url": "pages/security.html", "icon": "lock" } } }
            ] }
        ] },
        { "id": "g-armor", "type": "group", "label": "灵装回路", "children": [
          { "id": "theme-page", "type": "item", "label": "主题", "icon": "palette",
            "target": { "tab": { "id": "theme-page", "title": "主题演示", "url": "pages/theme.html", "icon": "palette" } } }
        ] }
      ]
    }
  },
  "menunav": {
    "type": "menunav",
    "props": {
      "title": "刻刻帝终端",
      "showHistory": true,
      "breadcrumb": { "enabled": true, "separator": "/", "home": { "id": "home", "label": "总览", "icon": "home" } },
      "actions": [
        { "id": "search", "icon": "search", "title": "搜索", "action": "app.openHome" }
      ]
    }
  },
  "tabs": {
    "type": "tabs",
    "props": {
      "home": "pages/home.html",
      "initial": [ { "id": "profile", "title": "档案", "url": "pages/profile.html", "icon": "user" } ],
      "maxTabs": 12
    }
  }
}
```

**关键修正：菜单点击不会自动写面包屑。** 实测点击菜单项只会「高亮 + 打开标签」，`app-shell` 里基于子组件实例事件的联动拿不到点击（见 6.8 第 3 条）。可靠做法有两种，选其一：

```js
// 方案 1（推荐）：全局监听 menu:select，按 id 查菜单树得到路径
function findMenuPath(items, id, parents) {
  parents = parents || [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (!item || item.type === 'divider') { continue; }
    var next = parents.concat([{ label: item.label, icon: item.icon }]);
    if (item.id === id) { return next; }
    if (item.children) {
      var found = findMenuPath(item.children, id, next);
      if (found) { return found; }
    }
  }
  return null;
}

KUI.bus.on('menu:select', function (payload) {
  var app = KUI.app.instance;
  var path = findMenuPath(app.config.menu.props.items, payload.id);
  if (path) { app.menunav.setBreadcrumb(path); }
});
```

```js
// 方案 2：从按钮/代码里统一用 selectMenu（内部会写面包屑 + 高亮 + 开标签）
KUI.app.selectMenu('profile-security');
```

再补上「标签激活 → 菜单高亮」的反向联动（默认不会发生）：

```js
KUI.bus.on('tabs:activate', function (payload) {
  var app = KUI.app.instance;
  app.menu.setActive(payload.tab.id);
});
```

### 6.8 与其他组件的组合关系

1. **注入**：`app` 段 → menu.brand（title/subtitle/logoIcon）+ menunav.title；`layout` → menu.width/collapsedWidth、header 高度、tabs 区域高度；`menu`/`menunav`/`tabs` 段原样传给子组件（`src/components/app-shell.js:237-275`）。
2. **折叠链路**：`app.toggleCollapsed()`（或 `app.toggleMenu` 动作、导航条折叠按钮）→ `menu.setCollapsed` → menu 派发 `collapsed` → app-shell 改 grid 变量 + 写 localStorage → 全局 `menu:collapsed` → menunav 换折叠图标。整条链路只认 menu 的折叠事件，所以单独调 `menu.setCollapsed` 也能同步骨架。
3. **菜单点击链路（实测现状）**：menu 执行 `target` 里的动作（`tab.open`）开标签 → `tabs` 激活 → 派发 `tabs:activate`。但 app-shell 用实例 `on('select'|'activate')` 注册的监听**收不到**（menu 的 `select` 只走 `ctx.emit`/`props.on.select`/全局，见 1.8），因此面包屑与菜单高亮需要在页面侧自行接线（6.7 的两种方案）。
4. **关闭策略**：`tabs` 自己的 `closable`/`pinnedClosable`/`maxTabs`/脏确认；app-shell 只转发事件、不干预关闭（没有「关标签前」钩子）。
5. **初始标签**：`opts.initialTabs` → `tabs.props.initial`/`tabs.props.tabs` → `tabs.props.home`（`autoOpen!==false` 时），见 `src/components/app-shell.js:530-554`。
6. **子组件缺失**：某个子组件未被加载时，app-shell 渲染 `.kui-shell__missing` 占位并 `KUI.warnOnce` 提示「组件未加载，请检查脚本顺序」，不会整页崩掉。

### 6.9 常见错误与排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 页面只有一块「组件未加载」占位 | 子组件脚本没加载，或 `kui-all` profile 不对 | 用 `data-kui-profile="app"`；不要把 standalone 包当 app 用 |
| 骨架空白、H 高度为 0 | 宿主容器没有高度，或 `#kui-app` 被 CSS 设成 `display:none` | 宿主给 `height:100vh`；`index.html` 默认已设置 |
| 菜单折叠了但导航条图标没变 | 折叠是绕过 menu 直接改的 CSS/类 | 走 `app.toggleCollapsed()` 或 `menu.setCollapsed()`，让事件链完整 |
| 点菜单打开了标签，但面包屑不动 | 预期行为：实例监听链路不生效（6.7/6.8） | 用全局 `menu:select` 手动 `setBreadcrumb`，或统一用 `KUI.app.selectMenu` |
| 初始标签不出现 | `autoOpen:false` 且没有 `initialTabs`/`initial` | 传 `initialTabs` 或配置 `tabs` 段的 `initial` |
| 刷新后菜单总是折叠/展开 | `localStorage['kui-menu-collapsed']` 记忆 | 清 localStorage；或 `layout.menu.collapsed` 显式指定后仍以记忆优先 |
| 创建了两次，事件重复触发 | 多次 `KUI.app.create`，`KUI.app.instance` 只指向最后一个 | 单页只创建一次；先 `destroy()` 再创建 |
| 面包屑分隔符显示成文字 `chevron-right` | `separator` 只按文本渲染 | 想用图标请用 CSS 给 `.kui-menunav__crumb-sep` 加伪元素，别传图标名 |

## 7. 组件间联动全景

### 7.1 责任矩阵

| 能力 | 产生方 | 消费方 | 说明 |
| --- | --- | --- | --- |
| 左侧菜单渲染 / 高亮 / 折叠 | menu | app-shell、menunav | 折叠事件 `collapsed` → `menu:collapsed` |
| 面包屑展示 / 前进后退按钮 | menunav | app-shell、tabs | 历史状态来自 `tabs.canBack()/canForward()` |
| 标签打开 / 激活 / 关闭 | tabs | app-shell、menunav | 事件 `tabs:*` |
| 骨架尺寸 / 折叠状态 | app-shell | menu、menunav、tabs | CSS 变量 + 子组件 props 注入 |
| 弹窗 | dialog | 所有业务页、tabs iframe | 独立 iframe，层级高于页面 |
| 轻提示 | toast | 所有业务页、dialog/tabs iframe | 主页面角落，z-index 最高 |

### 7.2 一次点击的完整时序

1. 用户点菜单项 → menu 切 `is-active`，若有 `target` 则执行动作（`tab.open`）。
2. `tab.open` → `tabs.open()`：新建或复用标签，激活并写历史。
3. `tabs` 派发 `activate` / 全局 `tabs:activate`。
4. app-shell 转发 `tab:activate`、更新导航条历史按钮；menunav 监听 `tabs:activate` 同步按钮可用状态。
5. （需自行接线）`menu:select` → `menunav.setBreadcrumb`；`tabs:activate` → 调菜单实例的 `setActive`。

### 7.3 三条联动铁律

1. **菜单项 id 与标签 id 尽量一致**：这是「复用标签 + 高亮定位 + 面包屑查找」的共同键，不一致时三处都要额外映射。
2. **折叠只从 menu 出发**：`menu.setCollapsed()` 会广播 `menu:collapsed`，app-shell 与 menunav 都监听它；绕过 menu 直接改宽度不会同步。
3. **面包屑是「导航条的状态」，不是路由的自动产物**：KurumiUI 没有路由表，面包屑要么由 `KUI.app.selectMenu` 写，要么由业务在 `menu:select` 里维护。

### 7.4 关闭策略与保活

- **关闭权限**：标签 `closable` 优先于 `tabs.closable`；`pinned:true` 的标签在 `pinnedClosable:false`（默认）时不可关，且被 `closeOthers`/`closeAll` 跳过。
- **脏关闭**：`tab.dirty` 为真时，`close(id,{confirmDirty:true})` 或用户点关闭会弹 `dialog.confirm`；业务页若实现了 `tab:before-close` 握手，可返回 `{ok:false}` 拒绝关闭（260ms 未响应按默认放行）。
- **上限**：`maxTabs`（默认 24）满了以后 `open` 返回 `null` 并提示，不自动淘汰——淘汰策略由业务决定（例如关掉最久未用的标签）。
- **保活**：每个标签一个固定 iframe，**切换不销毁**；`keepAlive` 字段存在但源码未使用，不能通过它关闭保活。要释放资源只能 `close`。

## 8. 跨组件排查速查表

| 现象 | 最可能的原因 | 处理 |
| --- | --- | --- |
| 页面只剩骨架、没有菜单/标签 | 子组件未加载或 `kui-all` profile 选错 | 用 `data-kui-profile="app"`；检查控制台 `KUI.warnOnce` 提示 |
| 菜单点了没反应 | 菜单项没有 `target`，也没有 `on.select`/动作 | 加 `target.tab`，或绑定业务函数 |
| 菜单点了，标签没开 | `target` 写成了字符串/不是对象；或 `tab.open` 未注册 | 用 `{"target":{"tab":{...}}}` 对象形式；确认 `KUI.actions.has('tab.open')` |
| 标签开了，菜单没高亮 | 程序化 `tabs.open` 不会反向高亮 | 监听 `tabs:activate` 调 `menu.setActive(id)` |
| 面包屑一直只有首页 | 未接 `menu:select`（默认不自动写） | 用 6.7 方案 1 或统一 `KUI.app.selectMenu` |
| 前进/后退按钮一直灰 | 历史为空，或 `tabs` 未派发激活事件 | 先点几个标签；确认没有禁用全局事件 |
| 折叠后内容被遮住 | 自定义 CSS 覆盖了 `--kui-menu-width` | 改变量而不是改固定宽度；让布局走 grid |
| 弹窗/提示被页面元素盖住 | 自定义 z-index 过高 | 检查 `--kui-z-dialog`(2000) / `--kui-z-toast`(3000) 是否被覆盖 |
| 主题切换后 iframe 页面没变 | iframe 未实现 `theme:apply` 监听 | 业务页用 `kui-frame` 的主题能力（见 11 章） |
| 同一标签反复刷新丢状态 | 用了 `refresh` 而不是切换 | 保活只在切换时保留状态，`refresh` 就是重载 |

## 本章自检

在仓库根目录执行（只读校验，不会构建）：

```bash
node tools/check-manual.js
```

预期输出：`0 error`（`warning` 允许存在，会列出 JSON 代码块、动作名、链接等提示；本文件应无 `error`）。如果提示某段 JSON 不是合法 JSON，按行号修好再跑一次。

浏览器手工核对（先 `npm start` 打开 `http://127.0.0.1:8080`，在控制台执行）：

```js
KUI.app.instance.menu.isCollapsed();        // false
KUI.app.instance.menu.getActive();          // 例如 "home"
KUI.app.instance.tabs.count();              // 例如 3
KUI.app.instance.tabs.getActive();          // 当前标签 id
KUI.app.instance.menunav.getBreadcrumb();   // {home:{...}, items:[...]}

KUI.app.instance.toggleCollapsed();         // 菜单折叠，导航条图标同步变化
KUI.toast.success('自检通过');               // 右上角出现绿色提示条
KUI.dialog.alert('自检弹窗');                // 出现一个 iframe 弹窗
```

- 点菜单项：标签打开、菜单高亮；若已按 6.7 接线，面包屑同步。
- 点标签关闭按钮：可关闭标签；固定标签（`pinned:true`）点关闭无效。
- 点导航条后退按钮：标签回到上一个；再点前进回到最新。

## 参考源码

- `src/components/menu.js:118-132` —— menu 默认值；`:211-261` 品牌区；`:306-383` 菜单项；`:397-501` 子菜单与 flyout；`:504-580` 选中与高亮；`:607-623` 折叠；`:713-782` 骨架与页脚；`:784-858` 实例 API；`:867-894` 注册与 `KUI.menu.create`。
- `src/components/menunav.js:121-138` —— 默认值；`:264-338` 骨架；`:341-423` 面包屑；`:436-488` 右侧动作；`:530-560` 折叠同步；`:563-612` 历史与刷新；`:621-683` 全屏；`:686-812` API 与注册。
- `src/components/tabs.js:5-11` —— 保活语义；`:143-165` 默认值；`:277-313` 骨架；`:329-415` 标签与 pane；`:500-555` 标签归一化与 `open`；`:558-620` 加载与激活；`:664-732` 关闭策略；`:766-810` 关闭握手；`:941-1093` 右键菜单与拖拽；`:1095-1257` iframe 消息；`:1342-1361` 初始标签；`:1455-1503` 注册与 `KUI.tabs`。
- `src/components/dialog.js:137-181` —— 默认值；`:187-251` frame 地址与版本；`:374-466` 层与尺寸；`:558-614` 关闭与打开；`:628-693` 远程动作与表单提交；`:695-814` iframe 消息；`:934-1014` 五种工厂；`:1126-1153` `KUI.dialog` 公共 API。
- `src/components/toast.js:123-138` —— 默认值；`:140-156` 类型与位置；`:192-259` 条目 DOM；`:315-332` 超限裁剪；`:334-437` show/close/count；`:456-525` 静态 API 与组件注册。
- `src/components/app-shell.js:25-32` —— 默认值；`:57-73` 折叠记忆；`:141-198` 骨架与 CSS 变量；`:237-374` 子组件注入与联动；`:378-509` app 方法；`:513-526` 应用级动作；`:530-554` 挂载与初始标签；`:595-632` `KUI.app`；`:638-661` 注册。
- `src/components/handlers/menu.handlers.js`、`menunav.handlers.js`、`tabs.handlers.js`、`dialog.handlers.js`、`toast.handlers.js`、`app-shell.handlers.js`、`form.handlers.js` —— 7 个 scope 的业务函数实现（完整清单见 [10-actions-handlers.md](10-actions-handlers.md)）。
- `config/app.json` —— `app`/`layout`/`menu`/`menunav`/`tabs`/`dialogs` 段的真实配置；`config/demos/{menu,menunav,tabs,dialog,toast}.json` —— 组件 demo；`standalone/{menu,menunav,tabs,dialog,toast,no-shell}.html` —— 独立装配示例。
- `src/styles/components.css`、`src/styles/base.css:340-343` —— 组件类名与层级变量；`index.html:120-154` —— 挂载点与唯一入口脚本。

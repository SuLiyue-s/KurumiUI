# KurumiUI 配置参考

> 适用版本：v1.0.0 · 契约基线：`docs/00-contract.md`（§5 渲染协议 / §6 控件清单 / §8 组件规格 / §9 消息协议 / §13 主题 / §17 协作约定）
>
> 本文是「改 JSON 就能改 UI」的完整字段手册。每一节末尾都有可直接粘贴的示例；所有示例都是严格 JSON（无注释、无双引号以外的引号），可以直接改字段名复用。

---

## 0. 配置如何流入页面

### 0.1 唯一配置源

| 文件 | 作用 | 谁读它 |
| --- | --- | --- |
| `config/app.json` | 主应用唯一配置源：品牌、主题、布局、菜单、导航、标签页、设置弹窗、文案覆盖 | `bootstrap.js` + `app-shell.js` |
| `config/text.json` | 全文案字典，注入 `KUI.i18n`，作为 `KUI.text(key, fallback)` 的兜底 | `bootstrap.js` 启动时注入 |
| `src/themes.json` | 6 套主题的完整 token 与装饰层 | `KUI.theme.init()` |
| `config/demos/*.json` | 组件演示数据，可被 standalone 页直接加载渲染 | `KUI.config.load('demos/xxx')` |
| `config/bundle.js` | 构建产物，把上面四类打进 `window.__KUI_BUNDLE__`，供 `file://` 双击打开时兜底 | 所有页面 |

### 0.2 加载优先级

```
app.json 里的 text 覆盖        ← 最高（只覆盖写到的键）
config/text.json               ← 中间
KUI.text(key, fallback) 的 fallback / 框架内置默认  ← 最低
```

配置读取：HTTP 下优先 `fetch` 原始 JSON（改 JSON 刷新即生效）；`file://` 下读 `window.__KUI_BUNDLE__`；`fetch` 失败也会回退 bundle。

### 0.3 三个必须记住的约定

1. **JSON 严格无注释**，字段名区分大小写；所有文件 UTF-8、LF、2 空格缩进。
2. **节点的 `type` 必须来自控件/组件清单**（见 §4、§3）。未知 type 会渲染成 `.kui-unknown` 占位并 `console.warn`。
3. **Node 13.14 兼容**：页面内联脚本禁用 `?.` `??` `||=` `&&=` `??=`，禁用 ESM `import/export`；用 IIFE + `var` 写脚本。

---

## 1. app.json

### 1.1 顶层结构

```json
{
  "schema": "kurumi-app/1",
  "app": {},
  "dialogs": {},
  "theme": {},
  "layout": {},
  "boot": {},
  "menu": { "type": "menu", "props": {} },
  "menunav": { "type": "menunav", "props": {} },
  "tabs": { "type": "tabs", "props": {} },
  "text": {}
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schema` | string | 固定 `"kurumi-app/1"`，用于将来迁移 |
| `app` | object | 品牌与首页，见 §1.2 |
| `dialogs` | object | 由 JSON 驱动的内置弹窗内容，见 §1.3 |
| `theme` | object | 默认主题与可见列表，见 §1.4 |
| `ui` | object | 悬浮提示 / 提醒 / 弹窗的 UI 级参数，见 §1.7 |
| `boot` | object | 启动层（加载中页面）与时钟指针动画，见 §1.8 |
| `layout` | object | 外壳尺寸，见 §1.5 |
| `menu` | node | 左侧菜单组件节点（`type: "menu"` + `props`） |
| `menunav` | node | 顶部导航组件节点（`type: "menunav"` + `props`） |
| `tabs` | node | 标签页组件节点（`type: "tabs"` + `props`） |
| `text` | object | 文案覆盖（深度合并进 i18n），优先级最高 |

`menu` / `menunav` / `tabs` 也可以省略 `type` 直接写 `{ "props": {...} }`；app-shell 会合并 props 后挂载。推荐保留 `type` 便于阅读。

### 1.2 app

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `name` | string | `KurumiUI` | 英文名，用于 document title 兜底 |
| `title` | string | `刻刻帝终端` | 应用显示名（菜单品牌区、导航标题） |
| `subtitle` | string | — | 副标题，显示在品牌区/导航 |
| `version` | string | — | 版本号，显示在菜单 footer |
| `documentTitle` | string | — | 浏览器标签标题；不写则用 `title` |
| `logoIcon` | string | `clock` | 品牌区图标名（见 §6 图标清单） |
| `logoText` | string | `KUI` | 品牌区图标旁的文字/徽记 |
| `home` | string | `pages/home.html` | 首页 URL，对应标签固定不可关闭 |
| `copyright` | string | — | 页脚版权 |
| `loading` | object | — | 启动层：`{ "icon": "spinner", "text": "…", "delay": 120 }`，`delay` 单位 ms |

```json
"app": {
  "name": "KurumiUI",
  "title": "刻刻帝终端",
  "subtitle": "灵装回路 · 时间结界控制台",
  "version": "1.0.0",
  "documentTitle": "刻刻帝终端 · KurumiUI",
  "logoIcon": "clock",
  "logoText": "KUI",
  "home": "pages/home.html",
  "copyright": "© KurumiUI · 刻刻帝终端",
  "loading": { "icon": "spinner", "text": "灵装回路接通中…", "delay": 120 }
}
```

### 1.3 dialogs（JSON 驱动的内置弹窗）

bootstrap 的 `settings.open` 会读 `app.dialogs.settings`；`about.open` 会读 `app.dialogs.about`。不写则用内置最小表单兜底。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `settings.title` | string | 设置弹窗标题 |
| `settings.desc` | string | 说明文字 |
| `settings.width` | number | 弹窗宽度（px） |
| `settings.okText` / `cancelText` | string | 按钮文案 |
| `settings.draggable` | boolean | 是否可拖拽 |
| `settings.layout` | object | 表单布局，同 §3.6.3 |
| `settings.data` | object | 初始值 |
| `settings.nodes` | node[] | 表单节点，`id` 即数据键 |
| `about.title` / `about.message` | string | 关于弹窗内容 |

```json
"dialogs": {
  "settings": {
    "title": "终端设置",
    "width": 540,
    "okText": "保存设置",
    "cancelText": "取消",
    "draggable": true,
    "layout": { "columns": 1, "gap": 14, "labelWidth": 96, "labelPosition": "left" },
    "data": { "shellName": "刻刻帝终端", "defaultTheme": "kurumi" },
    "nodes": [
      { "id": "shellName", "type": "input", "label": "终端名称", "required": true },
      { "id": "defaultTheme", "type": "select", "label": "默认主题", "options": [
        { "label": "绯红刻刻帝", "value": "kurumi" },
        { "label": "白羽灵装", "value": "kurumi-angel" }
      ] }
    ]
  },
  "about": { "title": "关于 KurumiUI", "message": "配置驱动的时崎狂三风格 UI 框架。" }
}
```

### 1.4 theme

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `default` | string | 默认主题 id，必须是 `src/themes.json` 中存在的 id |
| `visible` | string[] | 主题选择器中可见的主题 id 列表；省略表示全部 |
| `storageKey` | string | 主题记忆的 localStorage 键，默认 `kui-theme` |
| `persist` | boolean | 是否记忆用户选择，默认 `true` |
| `picker` | object | 主题选择弹窗配置：`title/desc/columns/showPreview/showScheme/position/maskClosable` |

```json
"theme": {
  "default": "kurumi",
  "visible": ["kurumi", "kurumi-angel", "starry", "sakura", "abyss", "dawn"],
  "storageKey": "kui-theme",
  "picker": {
    "title": "选择灵装主题",
    "desc": "主题只替换 CSS Token，不改变结构与控件",
    "columns": 3,
    "showPreview": true,
    "showScheme": true,
    "position": "panel",
    "maskClosable": true
  }
}
```

> 主题色板只从 `src/themes.json` 读；`app.json` 的 `theme` 只决定「默认用哪套、列表里显示哪几套、选择器长什么样」。

### 1.5 layout

```json
"layout": {
  "gap": 10,
  "menu": { "width": 252, "collapsedWidth": 68, "collapsed": false },
  "header": { "height": 56 },
  "tabbarHeight": 38
}
```

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `gap` | number | 10 | 外壳各区块间距（px），写入 `--kui-app-gap` |
| `menu.width` | number | 252 | 菜单展开宽度 |
| `menu.collapsedWidth` | number | 68 | 菜单折叠宽度 |
| `menu.collapsed` | boolean | false | 初始是否折叠 |
| `header.height` | number | 56 | 顶部导航高度 |
| `tabbarHeight` | number | 38 | 标签栏高度 |

也兼容旧扁平写法 `menuWidth` / `menuCollapsedWidth` / `headerHeight`，但不推荐。`contentRadius` / `contentPadding` **不由 layout 读取**：圆角与内边距属于主题 token（`--kui-frame-radius`、`--kui-app-gap`）。

### 1.6 text（文案覆盖）

`app.json` 的 `text` 会深度合并到 `config/text.json` 之上，适合覆盖少量文案而不改字典文件：

```json
"text": {
  "app": { "subtitle": "灵装回路 · 时间结界控制台" },
  "menu": { "footerDefault": "灵装回路" },
  "shell": { "searchPlaceholder": "检索时间线、结界与刻印…" },
  "page": { "home": "刻刻帝终端" }
}
```

---


### 1.7 ui（UI 级参数，v1.0.5 起）

全部可选；缺省时沿用各模块自身默认值。改这里即可调整交互手感，**不需要改代码**。

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `ui.tooltip.enabled` | boolean | `true` | 是否接管全站原生 `title` / `data-kui-tip` |
| `ui.tooltip.delay` | number | `140` | 显示延迟（毫秒） |
| `ui.tooltip.hideDelay` | number | `60` | 移出后隐藏延迟（毫秒） |
| `ui.tooltip.offset` | number | `10` | 浮层与目标的间距（像素） |
| `ui.tooltip.maxWidth` | number | `300` | 浮层最大宽度（像素） |
| `ui.tooltip.placement` | string | `"top"` | `top/bottom/left/right`，空间不足自动翻转 |
| `ui.toast.position` | string | `"top-right"` | 提醒条位置（`KUI.toast.config`） |
| `ui.toast.max` | number | `5` | 同时显示的最大条数 |
| `ui.toast.duration` | number | `3200` | 自动关闭毫秒数，`0` = 不自动关 |
| `ui.dialog.maskClosable` | boolean | `true` | 点遮罩是否关闭弹窗 |

示例：

```json
"ui": {
  "tooltip": { "enabled": true, "delay": 140, "offset": 10, "placement": "top" },
  "toast": { "position": "top-right", "max": 4, "duration": 3200 },
  "dialog": { "maskClosable": true }
}
```

单个元素也可覆盖：`<button title="刷新" data-kui-tip-placement="bottom" data-kui-tip-delay="240" data-kui-tip="刷新当前页面">`；保持原生行为的元素加 `data-kui-tip-disabled="true"`。

### 1.8 boot（启动层 / 加载中页面，v1.3.7 起；v1.3.8 起字段全部生效）

控制**访问服务或刷新时**出现的加载中页面；它同时是一个可独立挂载的注册组件（`type: "boot"`）。
全部字段可选，缺省值来自 `src/components/boot.js` 的 `DEFAULTS`。

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `boot.enabled` | boolean | `true` | `false` 时不渲染启动层（`#kui-boot` 静态骨架也不显示） |
| `boot.mode` | string | `"fullscreen"` | `fullscreen`（页面级遮罩）/ `inline`（嵌在容器里，用于演示页） |
| `boot.meta` | boolean | `true` | 是否显示底部「百分比 + 时钟读数」 |
| `boot.text` | object | `{}` | 覆盖阶段文案（键名同 `stages[].textKey`） |
| `boot.stages` | array | 4 段 | 每项 `{ step, text, progress }`；`progress` 是 0–100 的百分比 |
| `boot.clock.enabled` | boolean | `true` | 时钟图形（钟面 + 时针 + 分针 + 12 刻度）是否显示 |
| `boot.clock.mode` | string | `"progress"` | `progress` 指针随进度 / `spin` 匀速自转 / `none` 不转 |
| `boot.clock.size` | number | `74` | 钟面直径（px），指针长度按比例缩放 |
| `boot.clock.ticks` | number | `12` | 刻度数量（0 表示不画刻度） |
| `boot.clock.smooth` | boolean | `true` | 指针是否带过渡动画（`false` 时逐格跳变） |
| `boot.bar.enabled` | boolean | `true` | 进度条是否显示 |
| `boot.bar.mode` | string | `"progress"` | `progress` 普通进度 / `indeterminate` 不确定态循环 |

示例（改文案 + 改成 6 段进度 + 匀速自转钟）：

```json
"boot": {
  "enabled": true,
  "clock": { "mode": "spin", "size": 82, "ticks": 12 },
  "stages": [
    { "step": 1, "progress": 5,  "text": "正在读取结界配置…" },
    { "step": 2, "progress": 30, "text": "正在召唤灵装…" },
    { "step": 3, "progress": 62, "text": "正在铺开时间结界…" },
    { "step": 4, "progress": 88, "text": "正在刻印通道…" },
    { "step": 5, "progress": 100, "text": "结界已就绪" }
  ]
}
```

> v1.3.8 起 `bootstrap.js` 自动把本节配置交给组件（`applyBootConfig`），`boot.enabled: false` 会关闭启动层；运行时可随时改：`KUI.bootLayer.configure({ clock: { mode: "spin" }, stages: [...] })`；
> 演示页 `standalone/boot.html` 的「按进度设置」滑块可直接核对 0%↔0 时、100%↔12 时的指针位置。
## 2. 节点通用字段

所有配置里出现的可渲染对象（`nodes`、`children`、`actions`、`items` 里的按钮等）都是「节点」。节点由 `KUI.renderNode(node, ctx)` 渲染，遵循同一套规则。

### 2.1 字段表

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `type` | string | 控件/组件类型，见 §3、§4；字符串节点可省略 type |
| `id` | string | 节点 id；在 form 内即数据键；DOM 上写成 `id` |
| `props` | object | 组件/控件属性主体（推荐把属性写在这里） |
| `children` | node[] | 子节点；容器类组件优先读 `children` |
| `nodes` | node[] | 同 `children`（`children` 优先级更高） |
| `content` | node\|node[] | 同 `children`（最低优先级） |
| `class` | string | 追加 class；也接受 `className` / `cls`；有 class 时会附加 `kui-node` |
| `style` | object | 内联样式对象，如 `{ "width": "220px" }` |
| `attrs` | object | 原样写到 DOM 的属性 |
| `dataset` | object | `data-*` 属性；也接受 `dataAttrs` |
| `title` | string | DOM `title` 提示 |
| `hidden` | boolean | 渲染但隐藏 |
| `visible` | boolean | `false` 时不渲染 |
| `if` | boolean | 同 `visible`（`false` 不渲染） |
| `disabled` | boolean | 禁用态 |
| `on` | object | 事件绑定，见 §5；键是事件名，值是动作、`{fn,args}` 业务函数调用或字符串函数名。**这是节点级字段，不要写进 `props`**（写进 props 不会绑定）。业务函数见 [`docs/09-handlers.md`](./09-handlers.md) |
| `ref` | function | 渲染后回调 `ref(el, ctx)` |
| `deps` | array | 表单联动规则，仅 form 内生效，见 §3.6.4 |
| `label` / `help` / `unit` / `error` / `required` / `readonly` | — | form 内字段语义，见 §3.6.2 |
| `span` | number | form 栅格占列数（别名 `colspan`） |
| `width` / `labelWidth` / `labelPosition` | — | 覆盖单个字段的表单布局 |
| `options` | array | `select` / `radio-group` / `checkbox-group` 等的选项；也可写在 `props.options` |

### 2.2 渲染规则（与实现一致）

- 字符串 / 数字节点 → 文本节点。
- 数组 → fragment 批量渲染。
- 无 `type` 且无 `text` → 容器，渲染 `children`；无 `type` 且有 `text` → 文本。
- `type: "fragment"` / `"group"` → `div.kui-fragment` 容器。
- 未知 `type` → `div.kui-unknown` 占位 + `console.warn`（不抛错）。
- 渲染后统一加 `kui-control kui-control--<type>` class，并挂 `el.__kuiInstance`。
- **属性两种写法等价**：控件内部先取节点顶层字段，再用 `props` 覆盖。因此 `{ "type": "button", "text": "保存", "variant": "primary" }` 与 `{ "type": "button", "props": { "text": "保存", "variant": "primary" } }` 都能工作。推荐统一写 `props`。

### 2.3 生命周期

```json
{
  "type": "input",
  "props": { "placeholder": "带挂载回调" },
  "on": {
    "mount": { "action": "toast.info", "params": { "message": "输入框已挂载" } },
    "change": { "action": "toast.success", "params": { "message": "内容改变" } }
  }
}
```

`on.mount(instance, ctx)` 在实例创建后触发一次；`on.destroy` 在销毁时触发。其余事件（`click`、`change`、`input`、`focus`、`blur`、`submit`、`close`、`open`…）由 `KUI.on` 绑定。

---

## 3. 组件

### 3.1 menu（左侧菜单）

```json
"menu": {
  "type": "menu",
  "props": {
    "brand": {
      "title": "刻刻帝终端",
      "subtitle": "KurumiUI · 灵装回路",
      "logoIcon": "clock",
      "logoText": "KUI"
    },
    "collapsed": false,
    "collapsible": true,
    "width": 252,
    "collapsedWidth": 68,
    "defaultActive": "home",
    "tooltip": true,
    "accordion": false,
    "flyout": true,
    "items": [],
    "footer": {}
  }
}
```

| props 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `brand` | object | — | 品牌区：`title` / `subtitle` / `logoIcon` / `logoText` |
| `collapsed` | boolean | false | 初始折叠 |
| `collapsible` | boolean | true | 是否显示折叠按钮 |
| `width` | number | 252 | 展开宽度 |
| `collapsedWidth` | number | 68 | 折叠宽度 |
| `defaultActive` | string | — | 初始选中项 id |
| `tooltip` | boolean | true | 折叠时是否对菜单项显示 tooltip |
| `accordion` | boolean | false | 手风琴模式（同级只展开一个分组） |
| `flyout` | boolean | false | 折叠时子菜单以浮层展开 |
| `items` | node[] | [] | 菜单树，见 §3.1.1 |
| `footer` | object | — | 底部区，见 §3.1.3 |

#### 3.1.1 items 结构

三种节点：`group`（分组标题 + 子项）、`item`（可点击项，可带二级 children）、`divider`（分隔线）。

```json
"items": [
  {
    "type": "group",
    "id": "g-core",
    "label": "时间中枢",
    "icon": "clock",
    "children": [
      {
        "type": "item",
        "id": "home",
        "label": "总览 · 刻刻帝终端",
        "icon": "home",
        "badge": "主",
        "badgeType": "accent",
        "tooltip": "控制台首页",
        "target": {
          "tab": {
            "id": "home",
            "title": "刻刻帝终端",
            "url": "pages/home.html",
            "icon": "clock",
            "pinned": true,
            "closable": false
          }
        }
      },
      {
        "type": "item",
        "id": "pages",
        "label": "业务结界",
        "icon": "folder",
        "badge": "6",
        "badgeType": "gold",
        "children": [
          {
            "type": "item",
            "id": "profile",
            "label": "未保存数据验证",
            "icon": "shield",
            "target": { "tab": { "id": "profile", "title": "未保存数据验证", "url": "pages/profile.html", "icon": "shield" } }
          }
        ]
      }
    ]
  },
  { "type": "divider" },
  {
    "type": "item",
    "id": "disabled-seal",
    "label": "封存的时间结界",
    "icon": "lock",
    "disabled": true,
    "tooltip": "演示禁用态"
  }
]
```

item 字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 唯一 id，用于 `defaultActive`、`setActive`、`menu.select` |
| `label` | string | 文本 |
| `icon` | string | 图标名（§6） |
| `badge` | string\|number | 徽标文本/数字 |
| `badgeType` | string | `accent` / `gold` / `success` / `warning` / `danger` |
| `tooltip` | string | 悬停提示；折叠时优先于 label 显示 |
| `disabled` | boolean | 禁用 |
| `children` | node[] | 二级菜单（item 自带 children，不要写 `type:"submenu"`） |
| `target` | object | 点击行为，见 §3.1.2；省略则不发动作 |

#### 3.1.2 target 的三种形态

| 形态 | 行为 |
| --- | --- |
| `{ "tab": { ...tab对象 } }` | `KUI.tabs.open(tab)`，打开/激活标签 |
| `{ "action": { "action": "theme.picker", "params": {} } }` | `KUI.actions.run(...)`，执行任意动作 |
| `{ "menu": "otherId" }` | 切换菜单选中项（不打开标签） |

tab 对象字段：`id` / `title` / `url` / `icon` / `pinned` / `closable` / `params` / `query`。`url` 相对项目根，例如 `pages/home.html`。

#### 3.1.3 footer

```json
"footer": {
  "title": "灵装回路",
  "subtitle": "v1.0.0 · 稳定",
  "version": "KurumiUI",
  "actions": [
    {
      "type": "button",
      "props": { "text": "切换灵装主题", "icon": "palette", "size": "sm", "variant": "ghost", "block": true },
      "on": { "click": { "action": "theme.picker" } }
    }
  ]
}
```

#### 3.1.4 实例 API

`el.__kuiInstance` 或 `KUI.mount('menu', host, node)` 返回值上可用：

`setActive(id)` / `getActive()` / `toggle()` / `setCollapsed(bool)` / `expand()` / `collapse()` / `setBadge(id, badge)` / `setItems(items)` / `destroy()`。

### 3.2 menunav（顶部导航）

```json
"menunav": {
  "type": "menunav",
  "props": {
    "mode": "header",
    "title": "刻刻帝终端",
    "showCollapse": true,
    "showHistory": true,
    "showRefresh": true,
    "showFullscreen": true,
    "breadcrumb": {
      "enabled": true,
      "home": { "id": "home", "label": "刻刻帝终端", "icon": "home" },
      "items": [],
      "separator": "chevron-right",
      "max": 4
    },
    "actions": [
      { "id": "search", "icon": "search", "label": "检索", "title": "检索", "action": "search.toggle" },
      { "id": "notify", "icon": "bell", "label": "提醒", "badge": 8, "action": "notify.demo" },
      { "id": "settings", "icon": "settings", "label": "设置", "action": "settings.open" },
      { "id": "theme", "icon": "palette", "label": "主题", "action": "theme.picker" }
    ]
  }
}
```

| props 字段 | 类型 | 说明 |
| --- | --- | --- |
| `mode` | string | `header`（默认）|
| `title` / `subtitle` | string | 导航标题，省略用 `app.title` |
| `showCollapse` | boolean | 显示折叠菜单按钮（内置能力，不用写 action） |
| `showHistory` | boolean | 显示前进/后退 |
| `showRefresh` | boolean | 显示刷新当前标签 |
| `showFullscreen` | boolean | 显示全屏切换 |
| `breadcrumb` | object | 面包屑：`enabled` / `home:{id,label,icon}` / `items:[{id,label,icon,action?,url?}]` / `separator`（图标名） / `max` |
| `actions` | array | 右侧动作按钮组 |
| `slot` / `right` | node[] | 额外自定义节点，渲染在动作组右侧 |

action 按钮字段：`id`（唯一）/ `icon` / `label` / `title` / `badge` / `disabled` / `active` / `action`（字符串动作名或 `{action,params}`）。

`showHistory` / `showRefresh` / `showFullscreen` / `showCollapse` 用导航内置能力，不要为它们写 `action`。

### 3.3 tabs（多标签 + iframe）

```json
"tabs": {
  "type": "tabs",
  "props": {
    "closable": true,
    "pinnedClosable": false,
    "keepAlive": true,
    "maxTabs": 24,
    "contextMenu": true,
    "drag": false,
    "emptyText": "暂无打开的结界",
    "home": {
      "id": "home",
      "title": "刻刻帝终端",
      "url": "pages/home.html",
      "icon": "clock",
      "pinned": true,
      "closable": false
    },
    "initial": [
      { "id": "profile", "title": "未保存数据验证", "url": "pages/profile.html", "icon": "shield" }
    ],
    "sandbox": ""
  }
}
```

| props 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `closable` | boolean | true | 标签是否可关闭 |
| `pinnedClosable` | boolean | false | 固定标签是否可关闭 |
| `keepAlive` | boolean | true | 保活：切走的 iframe 不销毁（未保存数据不丢的关键）；`false` 时切回会重建 iframe（v1.3.8 起真正生效） |
| `maxTabs` | number | 24 | 最大标签数 |
| `contextMenu` | boolean | true | 右键菜单 |
| `drag` | boolean | true | 标签拖拽排序 |
| `emptyText` | string | — | 无标签时提示 |
| `home` | tab | — | 固定首页标签，启动自动打开且不可关闭 |
| `initial` | tab[] | [] | 启动时额外打开的标签（按顺序打开，第一个激活） |
| `sandbox` | string | 内置安全值 | iframe `sandbox` 属性；空串表示用默认 |
| `urlPrefix` | string | `""` | 统一给 `url` 加前缀（standalone 页在子目录演示时用 `"../"`） |
| `showScrollButtons` | boolean | true | 标签过多时显示滚动按钮 |

tab 对象字段：`id` / `title` / `url` / `icon` / `pinned` / `closable` / `params` / `query`。`params` 会通过 `tab:init` 下发，业务页用 `KUI.frame.getParams()` 读取。

实例 API：`open(tab)` / `close(id)` / `closeOthers(id)` / `closeAll()` / `activate(id)` / `refresh(id)` / `requestClose(id)` / `setTitle(id,title)` / `setIcon(id,icon)` / `setBadge(id,badge)` / `setDirty(id,bool)` / `updateUrl(id,url)` / `getActive()` / `getTabs()` / `list()` / `count()` / `exists(id)` / `back()` / `forward()` / `canBack()` / `canForward()` / `hasHistory()` / `on(event,fn)` / `off` / `destroy()`。

事件：`open` / `close` / `activate` / `refresh` / `before-close`（可 `preventDefault()` 阻止关闭）。

### 3.4 dialog（弹窗）

#### 3.4.1 公共 config

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 自动 | 弹窗 id，供 `get/update/close` 使用 |
| `title` | string | — | 标题 |
| `subtitle` | string | — | 副标题 |
| `type` | string | — | `info` / `success` / `warning` / `error` 等语义类型（影响图标/配色） |
| `icon` | string | — | 图标名（§6） |
| `width` | number | 480 | 宽度 px |
| `height` | number\|string | `auto` | 高度 |
| `maxWidth` | string | `92vw` | 最大宽度 |
| `maskClosable` | boolean | true | 点遮罩关闭；confirm 默认 false |
| `closeOnEsc` | boolean | true | Esc 关闭（别名 `ui.dialog.escClosable`，v1.3.8 起生效；两者都传时 `closeOnEsc` 优先） |
| `closable` | boolean | true | 是否显示关闭按钮 |
| `draggable` | boolean | false | 可拖拽 |
| `layer` | number | 1 | 层级（内部维护） |
| `parentId` | string | — | 父弹窗 id（嵌套弹窗用） |
| `className` | string | — | 附加 class |
| `theme` | string | — | 弹窗内局部主题 id |
| `loading` | boolean | false | 加载态 |
| `okText` / `submitText` | string | 确定 | 主按钮文案（两者等价） |
| `cancelText` | string | 取消 | 次按钮文案 |
| `message` | string | — | 正文文本（alert/confirm 常用） |
| `nodes` | node[] | — | 自定义内容节点（form/custom） |
| `data` | object | — | 表单初始值 |
| `layout` | object | — | 表单布局（§3.6.3） |
| `rules` | array | — | 校验规则（prompt/form） |
| `label` | string | — | 输入项标签（prompt） |
| `placeholder` | string | — | 输入占位（prompt） |
| `defaultValue` | any | — | 输入默认值（prompt） |
| `input` | object | — | prompt 输入配置：`{type,placeholder,maxlength,min,max}` |
| `danger` | boolean | false | 主按钮危险色 |
| `actions` | array | — | 自定义按钮组（custom） |
| `remoteAction` | string\|object | — | 打开后自动执行的远程动作 |
| `onOk` / `onCancel` / `onClose` | — | — | 回调（函数只能写在代码里） |
| `footer` | boolean\|node[] | — | 自定义底部 |

#### 3.4.2 五个方法

| 方法 | 参数 | 返回 Promise | 说明 |
| --- | --- | --- | --- |
| `alert(config)` | 公共 config | `void` | 单按钮提示 |
| `confirm(config)` | 公共 config | `boolean` | true=确定，false=取消/关闭 |
| `prompt(config)` | + `input` / `rules` / `defaultValue` | `string\|null` | 输入框；取消返回 null |
| `form(config)` | + `nodes` / `data` / `layout` / `submitApi` | `object\|null` | 提交返回表单数据；`submitApi` 返回 false 时不关闭 |
| `custom(config)` | + `nodes` / `actions` | `any` | 自定义内容 + 按钮，返回 `value` 或动作结果 |

另有：`open(config)`（返回带 `.id` 的 Promise）、`get(id)`、`update(id, patch)`、`close(id)`、`closeAll()`。

prompt 的 `input.type` 支持 `text` / `password` / `number` / `textarea`。

custom 的 `actions[]` 字段：`id` / `text` / `type`（`primary` / `default` / `danger`）/ `icon` / `close`（`true` 关闭并 resolve、`false` 不关闭、`"resolve"` 关闭并 resolve `value`）/ `action` / `value`。

#### 3.4.3 示例

```json
{
  "method": "confirm",
  "config": {
    "title": "确认删除",
    "message": "删除后时间线无法回滚，是否继续？",
    "type": "warning",
    "danger": true,
    "okText": "删除",
    "cancelText": "保留"
  }
}
```

```json
{
  "method": "form",
  "config": {
    "title": "开启时间结界",
    "width": 560,
    "draggable": true,
    "layout": { "columns": 2, "gap": 16, "labelWidth": 96 },
    "data": { "sealName": "第七结界", "mode": "loop", "reuse": true },
    "nodes": [
      { "id": "sealName", "type": "input", "label": "结界名称", "required": true, "span": 2 },
      { "id": "mode", "type": "select", "label": "模式", "options": [
        { "label": "时间循环", "value": "loop" },
        { "label": "单次触发", "value": "once" }
      ] },
      { "id": "reuse", "type": "switch", "label": "复用灵装回路" }
    ]
  }
}
```

```json
{
  "method": "custom",
  "config": {
    "title": "刻印确认",
    "nodes": [
      { "type": "alert", "props": { "type": "warning", "message": "刻印一旦落下将写入时间锚点。" } },
      { "type": "divider" },
      { "type": "tag", "props": { "text": "不可撤销", "type": "danger" } }
    ],
    "actions": [
      { "id": "cancel", "text": "取消", "close": true },
      { "id": "trace", "text": "查看轨迹", "type": "default", "close": false, "action": "demo.trace" },
      { "id": "stamp", "text": "落印", "type": "primary", "close": "resolve", "value": { "stamped": true } }
    ]
  }
}
```

> 弹窗内动作：`dialog-frame` 会先在它自己的页面执行；执行不到时（组件级前缀 `app./theme./tab(s)./nav./menu./menunav./toast./dialog./handlers./form./frame.`）自动转发给主框架。v1.0.2 起**节点级 `on` 动作同样走这条桥**，所以弹窗 JSON 可以直接写 `{ "on": { "click": { "action": "app.applyTheme" } } }`。业务 iframe 里 `KUI.actions.register` 的自定义动作收不到弹窗内动作，跨弹窗通信建议用 `close:"resolve"` 回传 `value`。

### 3.5 toast（轻提示 / 通知）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `type` | string | `info` | `info` / `success` / `warning` / `error` |
| `mode` | string | `toast` | `toast` 轻提示 / `notification` 通知卡 |
| `title` | string | — | 标题 |
| `message` | string | — | 正文 |
| `duration` | number | 3200 | 停留毫秒；`0` 表示常驻，需手动关闭 |
| `position` | string | `top-right` | toast 位置：`top-left` / `top-right` / `top-center` / `bottom-left` / `bottom-right` / `bottom-center`；notification 固定在右上（可设置四角） |
| `closable` | boolean | true | 显示关闭按钮 |
| `progress` | boolean | true | 显示倒计时进度条 |
| `action` | object | — | `{ "text": "查看", "onClick": ... }`（回调只能写在代码里） |
| `max` | number | 5 | 同屏最大数量，超出排队/顶掉最旧 |
| `icon` | string | 按 type | 覆盖图标名 |
| `onClose` | function | — | 关闭回调（代码） |

方法：`KUI.toast.show(opts)`、`KUI.toast.info/success/warning/error(message|opts)`、`KUI.toast.message`、`KUI.toast.close(id)`、`KUI.toast.closeAll()`、`KUI.toast.config(patch)`、`KUI.toast.notification.show(opts)`（别名 `KUI.toast.notify(opts)`）。

```json
{ "type": "success", "title": "刻印完成", "message": "第七结界已写入时间锚点。", "duration": 3200, "closable": true, "progress": true }
```

```json
{ "type": "warning", "mode": "notification", "title": "结界波动", "message": "检测到时间线偏移 0.7 秒。", "duration": 0, "position": "top-right" }
```

### 3.6 form（表单与联动）

#### 3.6.1 创建方式

```json
{ "type": "form", "props": { "title": "灵装表单", "nodes": [], "data": {}, "layout": {} } }
```

或代码创建：

```js
var form = KUI.form.create(hostEl, {
  nodes: nodes,
  data: data,
  layout: { columns: 2, gap: 16, labelWidth: 96, labelPosition: 'left' },
  validateOn: 'blur',
  onSubmit: function (values, form) { return true; }
});
```

props 字段：

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `nodes` | node[] | `[]` | 表单节点（也可写 `children` / `fields`） |
| `data` | object | `{}` | 初始值，键=节点 `id` |
| `layout` | object | 见 §3.6.3 | 布局 |
| `validateOn` | string | `blur` | `blur` / `change` / `submit` |
| `text` | object | — | 覆盖提交/重置按钮等文案 |
| `showSubmit` | boolean | false | 是否自动显示底部提交/重置按钮 |
| `submitText` / `resetText` | string | — | 按钮文案 |
| `bordered` | boolean | false | 表单容器边框 |
| `title` | string | — | 表单标题 |
| `disabled` | boolean | false | 整体禁用 |

#### 3.6.2 form 节点字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 数据键（必填，表单内唯一） |
| `type` | string | 控件类型（§4）或非输入节点（divider/alert/text/button/tag） |
| `props` | object | 控件属性（`value` / `placeholder` / `options` 等） |
| `label` | string | 标签文本 |
| `help` / `hint` / `tip` | string | 帮助提示（三者等价） |
| `unit` | string | 单位后缀 |
| `error` | string | 初始错误信息 |
| `required` | boolean | 必填，等价一条 required 规则 |
| `readonly` | boolean | 只读 |
| `visible` | boolean | `false` 初始不显示；可被 deps 改 |
| `disabled` | boolean | 初始禁用；可被 deps 改 |
| `rules` | array | 校验规则，见 §3.6.5 |
| `options` | array | 选项（select/radio-group/checkbox-group 等） |
| `deps` | array | 联动规则，见 §3.6.4 |
| `span` | number | 占列数，别名 `colspan` |
| `width` / `labelWidth` / `labelPosition` | — | 覆盖单项布局 |
| `class` | string | 附加 class |

非输入节点：`divider` / `alert` / `text` / `tag` / `button` / `icon` 等可以直接放进 `nodes`，form 不会包装成字段，按普通节点渲染。

#### 3.6.3 layout

```json
"layout": { "columns": 2, "gap": 16, "labelWidth": 96, "labelPosition": "left", "labelAlign": "right", "submitAlign": "right" }
```

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `columns` | 1 | 栅格列数；节点 `span` 可跨列 |
| `gap` | 16 | 行列间距 px |
| `labelWidth` | 96 | 标签宽度 px |
| `labelPosition` | `left` | `left` / `right` / `top` |
| `labelAlign` | `right` | 标签文字对齐 |
| `submitAlign` | `right` | 提交按钮对齐 |

#### 3.6.3b `requiredAny` 必填组（v1.3.0）

同一表单内「多个字段至少填一个」的规则，写在**组内任一成员**上即可：

```json
{ "id": "codeName", "type": "input", "label": "代号", "requiredAny": ["codeName", "codeAlias"] },
{ "id": "codeAlias", "type": "input", "label": "别名" }
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `requiredAny` | `string[]` | 组内字段 id 列表；全空时组内成员全部标记必填并拦截提交 |
| `requiredAnyMessage` | `string` | 组校验失败文案，默认「请至少填写其中一项」 |

- 填任一成员 → 组满足，其余成员自动解除必填（星号同步消失）。
- `switch` 的 `false` 视为未填；`radio-group`/`checkbox-group` 的空值同样视为未填。
- 被 `deps` 隐藏的字段不参与必填校验（v1.3.0 起）。

#### 3.6.4 deps 联动

```json
"deps": [
  {
    "when": { "field": "deployType", "op": "eq", "value": "seal" },
    "then": { "visible": true, "required": true }
  }
]
```

- `when` 可以是单个条件，也可以是组合：
  - `{ "all": [cond, cond] }` 全部满足；
  - `{ "any": [cond, cond] }` 任一满足。
- 条件字段：`field`（被依赖的字段 id）、`op`（操作符，省略=`notEmpty`）、`value`（比较值）。
- `then` 可设置：`visible` / `disabled` / `readonly` / `required` / `value` / `options` / `text` / `error`。
- 多条规则按声明顺序执行，**后者覆盖前者**。
- 初始状态：`visible = node.visible !== false`，`disabled = !!node.disabled`，`required = !!node.required`。

操作符全集：

| op | 含义 |
| --- | --- |
| `eq` | 等于（`==` 语义） |
| `ne` | 不等于 |
| `in` | 值在数组内 |
| `nin` | 值不在数组内 |
| `contains` | 数组/字符串包含 value |
| `notContains` | 不包含 |
| `gt` / `gte` / `lt` / `lte` | 数值比较 |
| `empty` | 空（null/undefined/''/[]） |
| `notEmpty` | 非空 |
| `truthy` | 真值 |
| `falsy` | 假值 |
| `regex` | 正则匹配（`value` 为正则字符串） |

示例：单选控显隐 + 必填

```json
{
  "id": "sealName",
  "type": "input",
  "label": "结界名称",
  "visible": false,
  "deps": [
    { "when": { "field": "deployType", "op": "eq", "value": "seal" }, "then": { "visible": true, "required": true } }
  ]
}
```

示例：多选控禁用

```json
{
  "id": "priority",
  "type": "select",
  "label": "优先级",
  "options": [
    { "label": "常规", "value": "normal" },
    { "label": "紧急", "value": "urgent" }
  ],
  "deps": [
    { "when": { "field": "tags", "op": "contains", "value": "封印" }, "then": { "disabled": true } }
  ]
}
```

示例：数字阈值控提示

```json
{
  "id": "bulletCount",
  "type": "number",
  "label": "一之弹数量",
  "props": { "min": 1, "max": 12 },
  "deps": [
    { "when": { "field": "bulletCount", "op": "gte", "value": 10 }, "then": { "error": "数量过多，时间线可能崩坏（建议 ≤ 9）。" } },
    { "when": { "field": "bulletCount", "op": "lt", "value": 10 }, "then": { "error": "" } }
  ]
}
```

示例：日期控范围（选开始日期后解锁结束日期）

```json
{
  "id": "startDate",
  "type": "date",
  "label": "开始时间"
}
```

```json
{
  "id": "endDate",
  "type": "date",
  "label": "结束时间",
  "disabled": true,
  "deps": [
    { "when": { "field": "startDate", "op": "notEmpty" }, "then": { "disabled": false } },
    { "when": { "any": [ { "field": "startDate", "op": "empty" }, { "field": "endDate", "op": "empty" } ] }, "then": { "text": "请先选择开始时间" } }
  ]
}
```

#### 3.6.5 rules 校验规则

```json
"rules": [
  { "required": true, "message": "请填写结界名称" },
  { "min": 2, "max": 20, "message": "长度需在 2~20 之间" },
  { "min": 1, "max": 99, "type": "number", "message": "数值需在 1~99 之间" },
  { "pattern": "^[a-z0-9-]+$", "message": "只能是小写字母、数字与短横线" },
  { "type": "email", "message": "邮箱格式不正确" }
]
```

| 规则字段 | 说明 |
| --- | --- |
| `required` | 必填 |
| `min` / `max` | 长度（字符串/数组）或数值范围（`type:"number"`） |
| `pattern` | 正则字符串 |
| `type` | `email` / `url` / `phone` / `number` / `integer` / `date` / `array` |
| `message` | 错误文案；缺省走 `text.json` 的 `validate.*` |
| `validator` | 自定义函数（只能写在代码里）：`(value, data) => true \| '错误信息'` |

#### 3.6.6 实例 API

`el.__kuiInstance` / `KUI.form.create()` 返回值：

`el` / `getData()` / `setData(obj, {silent})` / `getValue(id)` / `setValue(id, val)` / `getField(id)` / `validate()` / `clearValidate(id?)` / `reset()` / `setVisible(id, bool)` / `setDisabled(id, bool)` / `setReadonly(id, bool)` / `setRequired(id, bool)` / `setOptions(id, options)` / `setError(id, msg)` / `clearError(id)` / `subscribe(fn)` / `destroy()`。

---

### 3.7 boot（加载层组件，v1.3.7 起）

启动层被实现为注册组件 `boot`（`category: "shell"`），既可被 `bootstrap.js` 自动接管，也可独立渲染：

```json
{ "type": "boot", "props": { "mode": "inline", "clock": { "mode": "progress" } } }
```

字段与 `app.json:boot` 完全一致（见 §1.8），另有两个运行时开关：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `props.auto` | boolean | 仅 `bootstrap` 使用：`false` 表示不自动隐藏（调试加载动画时用） |
| `props.progress` | number | 初值进度（0–100，缺省 0） |

**静态 API `KUI.bootLayer`**

| 方法 | 说明 |
| --- | --- |
| `create(host, props)` | 在 `host` 内从零渲染一个加载层，返回实例（`standalone/boot.html` 的内嵌预览用这个） |
| `attach(props, textCfg)` | 接管页面既有 `#kui-boot`（单例）；没有则新建并挂到 `body` |
| `configure(patch, textCfg)` | 合并配置到当前实例/默认值（不传实例时同时更新后续 `create` 的默认值） |
| `instance()` | 当前单例（没有则 `null`） |
| `handsAt(percent)` | 纯函数：返回 `{ percent, totalMinutes, hourAngle, minuteAngle, hour12, minute, clockText }` |
| `isReady()` | `boot.js` 是否已加载并注册（拆装探测用） |

**实例 API**：`setProgress(p)` / `setStep(n)` / `setText(t)` / `setMeta(app)` / `done()` / `error(msg, detail)` /
`reset()` / `show()` / `hide()` / `destroy()` / `getState()` / `setConfig(patch)` / `handsAt(p)` / `el` / `config`。

**事件**：`boot:progress`（`{ percent, step, clockText }`）、`boot:done`（`{}`）、`boot:error`（`{ message, detail }`）。

**拆装**：不引 `boot.js` 时 `bootstrap.js` 走 `legacy` 分支（只改 `index.html` 静态骨架的文案与进度条），
不抛错；`standalone/*.html` 若不需要加载层可以不引它。
## 4. 控件字段表（33 种）

> 值既可以写在 `props`，也可以写在节点顶层（等价）。`form` 内控件的值写在 `props.value` 或节点 `value`；`form` 外也可用 `value` 设初值。
>
> 所有控件都支持 §2.1 的通用字段（`id/class/style/attrs/visible/disabled/on/deps/…`），下表只列各自专有 props。

### 4.1 按钮

| type | props |
| --- | --- |
| `button` | `text` / `variant`（`default` `primary` `secondary` `ghost` `text` `danger` `success` `warning`）/ `size`（`sm` `md` `lg`）/ `icon` / `iconRight` / `block` / `round` / `iconOnly` / `loading` / `disabled` / `value` / `action` |

```json
{ "type": "button", "props": { "text": "落印", "variant": "primary", "icon": "check", "size": "md" }, "on": { "click": { "action": "toast.success", "params": { "message": "已落印" } } } }
```

### 4.2 输入类

| type | props |
| --- | --- |
| `input` | `type`（默认 `text`，也可 `password` 用 `password` 控件） / `value` / `placeholder` / `size` / `clearable` / `prefixIcon` / `suffixIcon` / `prefix` / `suffix` / `unit` / `maxlength` / `readonly` / `disabled` / `align` / `autofocus` / `showCount` |
| `password` | 同 `input`，另加 `toggleable`（显示/隐藏切换，默认 true） |
| `textarea` | `value` / `placeholder` / `rows`（默认 3） / `maxRows`（默认 8） / `autosize` / `resize`（默认 `vertical`） / `maxlength` / `showCount` / `readonly` / `disabled` |
| `number` | `value` / `min` / `max` / `step`（默认 1） / `precision` / `controls`（默认 true） / `placeholder` / `unit` / `thousands` / `align` / `wheel` / `readonly` / `disabled` |

```json
{ "id": "budget", "type": "number", "label": "灵装预算（金）", "props": { "min": 0, "max": 100000, "step": 100, "precision": 0, "thousands": true, "unit": "灵装金" } }
```

### 4.3 选择类

| type | props |
| --- | --- |
| `select` | `options`（`[{label,value,disabled}]`，支持分组 `{label, options:[…]}`）/ `value` / `placeholder` / `size` / `clearable`（默认 true） / `filterable` / `disabled` / `readonly` |
| `multiselect` | `options` / `value`（数组） / `placeholder` / `size` / `clearable` / `filterable`（默认 true） / `maxTagCount`（默认 3） / `collapseTags` / `showCheckAll` / `searchPlaceholder` / `disabled` / `readonly` |

```json
{ "id": "tags", "type": "multiselect", "label": "灵装标签", "options": [
  { "label": "演算", "value": "calc" },
  { "label": "观测", "value": "watch" },
  { "label": "封印", "value": "seal" }
] }
```

### 4.4 勾选类

| type | props |
| --- | --- |
| `checkbox` | `value` / `text` / `indeterminate` / `disabled` |
| `checkbox-group` | `options` / `value`（数组） / `direction`（`horizontal` 默认 / `vertical`） / `min` / `max` / `disabled` |
| `radio` | `value` / `text` / `disabled` |
| `radio-group` | `options` / `value` / `direction` / `button`（按钮组样式） / `size` / `disabled` |
| `switch` | `value` / `activeText` / `inactiveText` / `size` / `disabled` / `loading` |
| `slider` | `value` / `min` / `max` / `step` / `range` / `showStops` / `showTooltip` / `vertical` / `marks`（`{ "50": "半刻" }`） / `disabled` |

```json
{ "id": "deployType", "type": "radio-group", "label": "结界类型", "span": 2, "options": [
  { "label": "时间线", "value": "timeline" },
  { "label": "封印结界", "value": "seal" },
  { "label": "自定义", "value": "custom" }
] }
```

```json
{ "id": "level", "type": "slider", "label": "灵装同步率", "span": 2, "props": { "min": 0, "max": 100, "step": 5, "showStops": true, "marks": { "50": "半刻", "100": "全刻" } } }
```

### 4.5 日期时间类

| type | props |
| --- | --- |
| `date` | `value` / `format`（默认 `YYYY-MM-DD`） / `valueFormat` / `min` / `max` / `placeholder` / `clearable`（默认 true） / `weekStart`（默认 1=周一） / `shortcuts` / `disabled` / `readonly` |
| `daterange` | `value`（`[start,end]`） / `format` / `valueFormat` / `separator`（默认 `" ~ "`） / `startPlaceholder` / `endPlaceholder` / `min` / `max` / `clearable` / `shortcuts` / `disabled` / `readonly` |
| `time` | `value` / `format`（默认 `HH:mm:ss`） / `valueFormat` / `minTime` / `maxTime` / `hourStep` / `minuteStep` / `secondStep` / `showSeconds`（默认 true） / `placeholder` / `clearable` / `disabled` |
| `datetime` | `value` / `format`（默认 `YYYY-MM-DD HH:mm:ss`） / `valueFormat` / `min` / `max` / `showSeconds` / `placeholder` / `clearable` / `disabled` |
| `month` | `value` / `format`（默认 `YYYY-MM`） / `valueFormat` / `min` / `max` / `placeholder` / `clearable` / `disabled` |

```json
{ "id": "watchWindow", "type": "daterange", "label": "观测窗口", "props": { "startPlaceholder": "开始", "endPlaceholder": "结束", "separator": " → " } }
```

### 4.6 展示类

| type | props |
| --- | --- |
| `tag` | `text` / `type`（`default` `primary` `success` `warning` `danger` `info`） / `size` / `closable` / `round` / `effect`（`light` / `dark` / `plain`） |
| `badge` | `value` / `max`（默认 99） / `dot` / `hidden` / `type` |
| `divider` | `text` / `direction`（`horizontal` / `vertical`） / `dashed` / `position`（`left` `center` `right`） |
| `link` | `text` / `href` / `target`（默认 `_self`） / `type` / `underline`（默认 true） / `disabled` / `icon` |
| `icon` | `name` / `size` / `spin` |
| `text` | `text` / `type` / `size` / `strong` / `block` / `ellipsis` / `copyable` |
| `alert` | `type`（`info` `success` `warning` `danger`） / `title` / `message` / `closable`（默认 true） / `showIcon`（默认 true） / `border` |
| `progress` | `value` / `max` / `type`（`line` / `circle`） / `status` / `strokeWidth` / `textInside` / `showText` / `striped` / `animated` |
| `rating` | `value` / `max`（默认 5） / `allowHalf` / `readonly` / `disabled` / `showText` / `texts` / `size` / `clearable` |
| `color` | `value` / `preset` / `showAlpha` / `showInput` / `format`（`hex` 等） / `clearable` / `disabled` |

```json
{ "type": "alert", "props": { "type": "warning", "title": "结界提示", "message": "连续开启三次时间结界会留下时间刻痕。", "closable": true } }
```

### 4.7 数据类

| type | props |
| --- | --- |
| `table` | `columns`（`[{prop,label,width,align,type,format,ellipsis,fixed}]`，`type` 可为 `text` `number` `date` `tag` `badge` `switch` `link`） / `data` / `border` / `stripe`（默认 true） / `height` / `maxHeight` / `rowKey`（默认 `id`） / `emptyText` / `loading` / `size` / `showHeader` / `selectable` |
| `pagination` | `page`（默认 1） / `pageSize`（默认 10） / `total`（默认 0） / `sizes`（默认 `[10,20,50,100]`） / `layout`（默认 `"total, sizes, prev, pager, next, jumper"`） / `showTotal` / `simple` / `disabled` |
| `upload` | `accept` / `multiple`（默认 true） / `maxCount`（默认 0=不限） / `listType`（`text` 等） / `action` / `auto` / `dragger`（默认 true） / `tip` / `disabled` / `acceptText` |

```json
{
  "type": "table",
  "props": {
    "border": true,
    "stripe": true,
    "rowKey": "id",
    "columns": [
      { "prop": "name", "label": "结界名" },
      { "prop": "level", "label": "等级", "type": "tag", "width": 90 },
      { "prop": "created", "label": "刻印时间", "type": "date", "format": "YYYY-MM-DD HH:mm" }
    ],
    "data": [
      { "id": 1, "name": "第七结界", "level": "warning", "created": "2026-01-04 07:12" }
    ]
  }
}
```

### 4.8 布局与容器

| type | props |
| --- | --- |
| `field` | `label` / `help` / `unit` / `required` / `error` / `width` / `span` / `labelPosition` / `labelWidth` / `children`（子节点，也可写在 `props.children`） |
| `form` | 见 §3.6.1 |

`field` 是「标签 + 内容」的轻量容器，适合在非表单页面里摆放控件：

```json
{
  "type": "field",
  "props": {
    "label": "检索关键词",
    "help": "支持标题与路径",
    "children": [
      { "type": "input", "props": { "placeholder": "输入后回车", "clearable": true } }
    ]
  }
}
```

### 4.9 全部 type 清单

`button` `input` `password` `textarea` `number` `select` `multiselect` `checkbox` `checkbox-group` `radio` `radio-group` `switch` `slider` `date` `daterange` `time` `datetime` `month` `tag` `badge` `divider` `link` `icon` `text` `alert` `table` `pagination` `upload` `color` `rating` `progress` `field` `form`

> 控件清单以 `src/components/controls/` 实际注册为准；运行时可用 `KUI.registry.types()` 查看当前全部类型。

---

## 5. 动作（on）与事件

### 5.1 语法

```json
"on": {
  "click": { "action": "toast.success", "params": { "message": "完成" } }
}
```

| 写法 | 说明 |
| --- | --- |
| `{ "action": "name", "params": {} }` | 执行动作；params 也可写 `args` / `data` |
| `"name"` | 动作名字符串（简写） |
| `{ "actions": [a, b] }` / `{ "chain": [a, b] }` | 顺序执行多个动作 |
| `{ "emit": "event:name", "detail": {} }` | 派发 KUI 事件 |
| `{ "theme": "kurumi" }` / `{ "theme": { "id": "kurumi" } }` | 切主题 |
| `{ "tab": { …tab } }` | 打开标签 |
| `{ "toast": { …toast config } }` | 弹 toast |
| `{ "dialog": { "kind": "confirm", …config } }` | 弹窗 |

事件名常用：`click` / `dblclick` / `input` / `change` / `focus` / `blur` / `keydown` / `submit` / `open` / `close` / `mount` / `destroy` / `activate`，以及各组件自有事件（tabs 的 `open/close/activate/refresh/before-close` 等）。

### 5.2 内置动作

| 动作 | params | 说明 |
| --- | --- | --- |
| `dialog.alert` / `dialog.confirm` / `dialog.prompt` / `dialog.form` / `dialog.custom` | 同 §3.4 config（可嵌套在 `config` 键） | 弹窗 |
| `dialog.close` / `dialog.closeAll` | `{ id }` / — | 关闭 |
| `toast.show/info/success/warning/error/notify/clear` | 同 §3.5 | 提醒 |
| `theme.apply` | `{ id }` / 直接 id | 切换主题 |
| `theme.next` / `theme.prev` / `theme.cycle` / `theme.toggleScheme` | — | 主题轮换 |
| `theme.picker` | — | 打开主题选择弹窗（bootstrap 注册） |
| `tab.open` / `tab.close` / `tab.refresh` / `tab.closeAll` / `tab.closeOthers` / `tab.activate` | tab 对象 / `{ id }` | 标签操作 |
| `app.refresh` / `app.fullscreen` / `app.collapse` | — | 外壳操作 |
| `app.applyTheme` | `{ id, dialogId, closeDialog }` | 应用主题并可选关闭弹窗 |
| `app.themeRandom` / `app.info` / `app.about` | — / `{ message }` | 内置应用动作 |
| `search.toggle` / `notify.demo` / `settings.open` / `about.open` | — | 顶部导航演示能力 |
| `nav.open` | `{ id,title,url,icon,pinned }` | 打开标签 |
| `nav.close` / `nav.back` / `nav.forward` / `nav.refresh` / `nav.toggleCollapse` / `nav.fullscreen` | `{ id }` / — | 导航操作 |
| `menu.select` / `menu.toggle` | `{ id }` / — | 菜单操作 |
| `clipboard.copy` | `{ text }` | 复制文本 |

> 动作分两批注册：核心（`src/core/kui.js`）与 bootstrap（`src/app/bootstrap.js`）。JSON 里直接写动作名即可；未注册的动作会在控制台 warn 并且不抛错。

### 5.3 自定义动作（代码）

```js
KUI.actions.register('demo.trace', function (params, ctx, ev) {
  KUI.toast.info({ title: '时间轨迹', message: '参数：' + JSON.stringify(params || {}) });
});
```

注册后 JSON 里即可 `{ "action": "demo.trace", "params": { "x": 1 } }`。业务 iframe 内的自定义动作只在 iframe 内生效；弹窗内动作见 §3.4 的说明。

---

## 6. 图标

图标全部内联 SVG，零外部资源。JSON 里凡是 `icon` 字段都只能填下面 85 个名字之一；填错会 `console.warn` 并回退成 `question` 图标。

### 6.1 图标清单（85 个）

**通用与导航**：`home` `clock` `gear` `terminal` `chart` `folder` `file` `image` `code` `database` `link` `mail` `message` `share` `settings` `power` `sun` `moon` `wave` `feather` `cross` `shield` `target` `palette` `star` `heart` `pin` `lock` `unlock` `eye` `eye-off` `calendar` `timer` `clock-hand`

**状态**：`info` `success` `warning` `error` `question` `spinner` `check`

**方向**：`chevron-up` `chevron-down` `chevron-left` `chevron-right` `arrow-up` `arrow-down` `arrow-left` `arrow-right`

**操作**：`expand` `collapse` `plus` `minus` `close` `search` `refresh` `refresh-cw` `fullscreen` `exit-fullscreen` `more-h` `more-v` `grid` `list` `save` `download` `upload` `trash` `edit` `copy` `external-link` `drag` `filter` `sort` `menu` `play` `pause`

**对象与角色**：`user` `users` `bell` `book` `cube` `layers` `lightning` `crown` `key`

### 6.2 API

| API | 说明 |
| --- | --- |
| `KUI.icons.get(name, {size, class, spin})` | 返回 SVG 字符串 |
| `KUI.icons.create(name, {size, class, spin, style, title})` | 返回 SVGElement |
| `KUI.icons.into(host, name, opts)` | 清空 host 并放入图标 |
| `KUI.icons.has(name)` / `list()` | 判断/列出 |
| `KUI.icons.register(name, '<path …/>')` | 运行时新增图标 |

```json
{ "type": "button", "props": { "text": "刷新", "icon": "refresh", "variant": "ghost" } }
```

---

## 7. 主题

### 7.1 themes.json 结构

```json
{
  "default": "kurumi",
  "version": "1.0",
  "themes": [
    {
      "id": "kurumi",
      "name": "绯红刻刻帝",
      "desc": "暗夜绯红 × 鎏金",
      "scheme": "dark",
      "tokens": { "--kui-bg-0": "#08050a", "--kui-accent": "#c8102e" },
      "art": {
        "motif": "clock",
        "noise": true,
        "layers": [ { "kind": "glow" }, { "kind": "grid" }, { "kind": "clock" } ],
        "corner": true
      },
      "preview": { "bg": "#08050a", "accent": "#c8102e", "accent2": "#d4af37", "text": "#f4eef3" }
    }
  ]
}
```

| 字段 | 说明 |
| --- | --- |
| `id` | 唯一 id，`app.theme.default` 引用它 |
| `name` / `desc` | 选择器里的名称与说明 |
| `scheme` | `dark` / `light`，决定部分自动适配逻辑 |
| `tokens` | 64 个外观 token（契约 §10 共 94 个 token；`base.css :root` 另有派生/布局变量，合计 116 个），见 §7.2 |
| `art` | 装饰层：`motif`（主导图案）、`noise`、`layers[]`、`corner` |
| `preview` | 主题卡片预览色：`bg` / `accent` / `accent2` / `text` |

`art.layers[].kind` 可用 11 种：`glow` / `grid` / `rays` / `moon` / `clock` / `feather` / `scanline` / `noise` / `stars` / `sakura` / `vignette`。
每种 kind 的可用参数（`color` / `opacity` / `size` / `blend` / `count` 等）见 [04-theme.md](./04-theme.md) §5.3。

> `noise` 有两种写法，**不要叠加**：顶层 `art.noise: true|0.06` 是自动补一层 noise 的快捷写法；也可以显式写成
> `{ "kind": "noise", "size": 3, "blend": "overlay" }` 放进 `layers[]`。两者同时写时只按显式 layer 生效。

静态预览某个主题的 art（不切换全局主题）用 `KUI.themeArt.preview(theme, hostEl, { className: 'xxx' })`，
返回 `{ el, destroy }`；另有 `KUI.themeArt.render / clear / kinds / roman`。详见 04-theme.md §5.2。

### 7.2 token 全表（64 个外观 token）

| 分组 | token |
| --- | --- |
| 背景 | `--kui-bg-0` `--kui-bg-1` `--kui-bg-2` `--kui-bg-3` `--kui-bg-4` |
| 文字 | `--kui-text-1` `--kui-text-2` `--kui-text-3` `--kui-text-inverse` |
| 强调 | `--kui-accent` `--kui-accent-hover` `--kui-accent-soft` `--kui-accent-glow` `--kui-accent-2` `--kui-accent-2-soft` `--kui-accent-3` |
| 状态 | `--kui-success` `--kui-warning` `--kui-danger` `--kui-info` |
| 语义前景（压色块上的文字/图标） | `--kui-on-accent` `--kui-on-success` `--kui-on-warning` `--kui-on-danger` |
| 边框 | `--kui-border` `--kui-border-strong` `--kui-divider` |
| 遮罩/选区 | `--kui-mask` `--kui-mask-strong` `--kui-selection-bg` `--kui-selection-text` |
| 阴影/光效 | `--kui-shadow-1` `--kui-shadow-2` `--kui-shadow-3` `--kui-glow` `--kui-inner-glow` `--kui-highlight` |
| 控件 | `--kui-control-bg` `--kui-control-bg-hover` `--kui-control-bg-active` `--kui-control-bg-disabled` `--kui-control-border` `--kui-control-border-hover` `--kui-control-border-focus` `--kui-control-text` `--kui-control-text-placeholder` `--kui-control-text-disabled` `--kui-control-arrow-color` |
| 滚动条 | `--kui-scrollbar-thumb` `--kui-scrollbar-thumb-hover` `--kui-scrollbar-track` |
| 弹层 | `--kui-popup-bg` `--kui-popup-border` `--kui-popup-shadow` |
| 选项 | `--kui-option-hover-bg` `--kui-option-selected-bg` `--kui-option-selected-text` |
| 日历 | `--kui-calendar-bg` `--kui-calendar-head-bg` `--kui-calendar-today` |
| 玻璃拟态 | `--kui-glass-bg` `--kui-glass-bg-strong` `--kui-glass-border` `--kui-glass-blur` |

### 7.3 运行时 API

| API | 说明 |
| --- | --- |
| `KUI.theme.list()` | 主题列表（含 preview） |
| `KUI.theme.current()` / `currentId()` / `currentTokens()` | 当前主题 |
| `KUI.theme.apply(id)` | 切换并持久化 |
| `KUI.theme.applyTokens(tokens)` | 局部覆盖 token（不换主题） |
| `KUI.theme.next()` / `prev()` | 下一套/上一套 |
| `KUI.theme.onChange(fn)` | 主题变化订阅 |
| `KUI.theme.register(theme)` | 运行时注册主题 |

```js
KUI.theme.apply('starry');
KUI.theme.applyTokens({ '--kui-accent': '#4f7cff' });
```

---

## 8. 文案（text.json）

### 8.1 顶层分组

| 分组 | 覆盖内容 |
| --- | --- |
| `app` | 应用名、副标题、版权、加载文案、documentTitle |
| `common` | 通用按钮与状态：确定/取消/保存/提交/重置/删除/搜索/刷新/加载中/空/成功/失败… |
| `shell` / `menu` / `menunav` / `tabs` | 外壳、菜单、面包屑、标签栏文案 |
| `dialog` / `toast` | 弹窗按钮、提示标题 |
| `form` / `validate` | 表单按钮、占位、全套校验错误文案 |
| `input` / `textarea` / `number` / `select` / `multiselect` / `checkbox` / `radio` / `switch` / `slider` / `progress` | 各控件默认占位与提示 |
| `date` / `time` / `datetime` | 日期时间占位、星期、快捷项 |
| `tag` / `badge` / `table` / `pagination` / `upload` / `color` / `rating` / `alert` / `link` / `icon` / `picker` | 展示类控件文案（空数据、合计、上传提示等） |
| `frame` | 业务 iframe 相关（未保存提示等） |
| `theme` | 主题选择器 |
| `demo` / `page` / `msg` | 演示页与业务页文案 |

### 8.2 用法

```js
KUI.text('common.save');                              // 读取
KUI.text('common.save', '保存');                       // 带兜底
KUI.text('frame.dirtyTip', '', { title: '灵装表单' });  // {name} 变量替换
```

`config/text.json` 在 bootstrap 启动时注入 `KUI.i18n`；`app.json` 的 `text` 再覆盖一层。取不到键时依次回退 fallback、键名本身，不抛错。

### 8.3 常见键

```json
{
  "common": { "ok": "确定", "cancel": "取消", "save": "保存", "submit": "提交", "reset": "重置", "loading": "灵装回路运转中…" },
  "tabs": { "closeOthers": "关闭其他", "closeAll": "关闭全部", "refresh": "刷新结界", "dirtyTip": "该结界存在未保存的刻印，确定关闭？" },
  "validate": { "required": "此项为必填刻印", "email": "灵装邮箱格式不正确", "range": "数值需在 {min} ~ {max} 之间" },
  "msg": { "saveOk": "刻印已保存", "themeSwitched": "灵装已切换" }
}
```

---

## 9. 自检与常见错误

### 9.1 自检命令

```bash
node tools/check-assets.js      # 检查 HTML 引用的资源是否存在、是否重复、是否外链
node tools/check-compat.js      # 检查 Node 13.14 不兼容语法（?. ?? ||= 等）
node tools/build-config.js       # 重新生成 config/bundle.js
```

改完 JSON 后可先用 Node 解析一遍：

```bash
node -e "JSON.parse(require('fs').readFileSync('config/app.json','utf8')); console.log('ok')"
```

### 9.2 常见错误对照

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 页面空白、控制台 `unknown-type` | `type` 拼错或不在 §4 清单 | 对照 §4.9 / `KUI.registry.types()` |
| 图标变成问号 | `icon` 名不在 §6.1 清单 | 换成清单内名字 |
| 菜单点击无反应 | `target` 写成字符串或旧写法 | 改成 `{ "tab": { … } }` / `{ "action": … }` / `{ "menu": "id" }` |
| 二级菜单不展开 | 用了 `type: "submenu"` | 改成 `type: "item"` + `children` |
| 联动不生效 | `deps` 写在 `props` 里，或 `field` 写错 | `deps` 放节点顶层，`field` 用被依赖节点的 `id` |
| 必填校验提示英文 | `text.json` 缺对应 `validate.*` 键 | 补文案或用规则 `message` |
| `file://` 打开没有配置 | 没生成 `config/bundle.js` | 运行 `node tools/build-config.js` |
| 控制台语法错误 | 内联脚本用了 `?.` / `??` / `||=` | 改成 `&&` / `\|\|` 传统写法 |

### 9.3 只改 JSON 的典型需求

| 需求 | 改哪里 |
| --- | --- |
| 改应用名/副标题/版权 | `config/app.json` 的 `app.*` |
| 改默认主题 / 可见主题 | `app.theme.default` / `app.theme.visible` |
| 加一个菜单项 | `app.menu.props.items` 里加 `item` + `target` |
| 改菜单分组/徽标 | `item.badge` / `item.badgeType` / `group.label` |
| 加顶部按钮 | `app.menunav.props.actions` 加一项（`action` 写动作名） |
| 改启动时打开的标签 | `app.tabs.props.initial` |
| 改固定首页 | `app.tabs.props.home` 与 `app.app.home` |
| 改设置弹窗内容 | `app.dialogs.settings.nodes` |
| 改任意界面文案 | `config/text.json` 或 `app.json` 的 `text` 覆盖 |
| 演示页数据 | `config/demos/*.json` |

### 9.4 独立渲染页（standalone）的脚本清单与嵌入规则

| 页面需要什么 | 必须引入（顺序不可乱） |
| --- | --- |
| core（所有页） | `config/bundle.js`（file:// 兜底）→ `kui.js` → `icons.js` → `registry.js` → `config.js` → `theme.js` → `theme-art.js` |
| 渲染控件节点（button/text/alert/…） | 上面全部 + `src/components/controls/index.js` |
| 渲染表单 | 上面全部 + `src/components/form.js`（必须在 controls/index.js 之后） |
| 嵌入治理 | `standalone/embedded.js`（放在 bundle.js 之前、body 末尾） |

两条必须记住的规则（任务 8 修正）：

1. **`registry.js` 不能省**：`menu / menunav / tabs / dialog / toast` 等组件脚本都通过 `KUI.registry` 注册；漏了它页面不会抛错，但节点会被渲染成 `.kui-unknown` 占位并提示「未注册的元素类型」。
2. **JSON 里有控件节点就要引 `controls/index.js`**：例如 `menu` 的 `footer.actions`、`no-shell` 的 `demos/actions.json` 面板里的 `button` / `text`。只渲染组件本身（不渲染控件）的页面可以不引。

被主应用 iframe 嵌入时，`embedded.js` 会自动隐藏页内重复的互链导航与主题下拉，并补「已嵌入主应用」徽标；`no-shell.html` 还会跳过内层 menu/menunav/tabs 的挂载并显示 `#framedHint` 说明卡。判定条件：`window.parent !== window`（或 `KUI.frame.isFramed()`）。细节见 `docs/06-customization.md` §4.4。

### 9.5 原生控件升级器（dom-enhance）

页面里直接写的原生 `<select>` / `<textarea>` 会渲染成浏览器默认控件，弹出层与角标完全绕过主题。
v1.0.8 起由 `src/core/dom-enhance.js` 就地升级，**不改变原有 HTML 语义与表单行为**：

| 标记 | 升级为 | 说明 |
| --- | --- | --- |
| `<select data-kui-native ...>` | 框架 `select` 控件 | 原生元素隐藏但保留 `value`/`options`/`disabled`，选择后回写并触发 `input`/`change`；`MutationObserver` 跟随 option 变化 |
| `<textarea data-kui-grip ...>` | 追加主题化右下角角标 | 与框架 `textarea` 同材质（两条斜线 + `nwse-resize`），可拖动改高，`min-height` 兜底 |

接入方式：在业务页 core 脚本之后引入（路径按页面层级推导）：

```html
<script src="../src/core/dom-enhance.js"></script>
```

完整页面里通常无需手写 `data-kui-*` 标记——`tools/*.html` 与 `standalone/*` 已经统一标记；
如果你在配置 JSON 里渲染 `select` / `textarea` 控件（而非原生标签），走的本来就是框架控件，自带主题化弹层与角标。

自动化保障：`tools/smoke.js` 的 [12] 原生控件升级断言会检查「18 个 HTML 均已接入、13 个原生 select 已标记、弹窗多行分支使用 textarea + 自绘角标」。

---

## 10. 头像（avatar，v1.2.0 起）

头像可以出现在三个位置，参数完全一致：

1. `config/app.json` 顶层 `avatar`（全局，菜单品牌区使用）
2. `menu.props.brand.avatar`（只影响菜单品牌区，优先级高于顶层）
3. 任意节点：`{ "type": "avatar", "props": { … } }`（控件，可放进 demo / 表单 / 弹窗）

### 10.1 字段

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `url` | string | `''` | 头像地址（http/data URI 均可）；留空回退品牌图标 |
| `editable` | boolean | `false` | 渲染后是否可点击头像打开更换弹窗 |
| `persist` | boolean | `true` | 是否把用户选择写入 localStorage |
| `storageKey` | string | `kui-avatar` | localStorage 键名 |
| `size` | number | `44` | 头像直径（px），齿轮框随直径自动缩放 |
| `shape` | string | `circle` | `circle` 或 `square` |
| `alt` / `title` / `clickTitle` | string | — | 无障碍文案与悬浮提示 |
| `fallbackIcon` | string | `clock` | 未设置头像时使用的品牌图标 |
| `frame.enabled` | boolean | `false` | 是否绘制刻刻帝时间齿轮头像框 |
| `frame.style` | string | `clock-gear` | 目前支持 `clock-gear` |
| `frame.showTicks` / `showHands` / `animated` | boolean | `true` | 刻度 / 指针 / 是否旋转动画 |
| `frame.spinDuration` | number | `48` | 齿轮转一圈的秒数（v1.3.2 起）：数字越小转越快；`0` 停转；负数反向转；`animated:false` 等价于停转 |
| `picker.*` | object | — | 更换弹窗文案（`title / width / urlLabel / urlPlaceholder / urlTip / clearLabel / allowClear / presets / okText / cancelText`） |

### 10.2 主题联动

齿轮、刻度、指针的颜色分别取 `--kui-accent-2`、`--kui-accent`、`--kui-accent-glow`，因此**换主题时头像框自动变色**；头像图片不会随主题变化。

### 10.3 示例

```json
{
  "avatar": {
    "url": "",
    "editable": true,
    "size": 42,
    "frame": { "enabled": true, "style": "clock-gear" }
  }
}
```

### 10.4 更换方式（`picker.mode`，v1.3.1 起）

点击头像后打开什么，由 `avatar.picker.mode` 决定：

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `mode` | string | `"url"` | `"url"`：弹出地址输入框（可配合 `presets` 预设、`allowClear` 清除）；`"file"`：直接打开系统文件选择器，选中后本地读成 dataURL |
| `accept` | string | `"image/*"` | `mode: "file"` 时 `<input type=file>` 的 accept |
| `maxSizeMB` | number | `2` | `mode: "file"` 时单文件体积上限（MB） |
| `fileLabel` / `fileTip` | string | — | 文件模式提示文案 |
| `fileErrorType` / `fileErrorSize` / `fileErrorRead` | string | — | 文件模式的错误提示文案 |

```json
{
  "avatar": {
    "url": "",
    "editable": true,
    "picker": {
      "mode": "file",
      "accept": "image/png,image/jpeg,image/webp",
      "maxSizeMB": 1
    }
  }
}
```

运行时也可以强制指定方式：`KUI.avatar.create(...).pickFile({ mode: "file" })`。

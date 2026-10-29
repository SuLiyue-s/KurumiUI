# 09 · 主题系统

> 适用版本：KurumiUI v1.4.4 ｜ 前置章节：04 主题与皮肤、08 组件 ｜ 阅读时长：约 25 分钟

## 本章目标

- 掌握「Token → themes.json → KUI.theme → 装饰层」链路，知道改哪一层最省事。
- 用一张全表掌握 117 个 `--kui-*` 变量，能按区域定位该改哪个。
- 会切换主题（API / 动作 / URL / 存储 / iframe），理解首帧防闪烁原理。
- 能独立新增主题：写 JSON → 构建 → 验证 → 部署；掌握覆盖优先级。

## 1. 主题体系原理

### 1.1 三层结构

换肤只换变量、不换结构：组件 CSS 全部通过 `var(--kui-*)` 取值，主题只改写变量。

```
① base.css :root      117 个 token 默认值（kurumi 兜底）
② theme.apply()       在 <html style> 内联写入当前主题的 64 个 token（优先）
③ data-kui-theme / data-kui-scheme   标记身份 + 驱动装饰层
```

- **默认层**：`base.css:195-358` 定义全部 117 个；前 94 个是契约 token（`docs/04-theme.md` §4），后 23 个是扩展 token（图标、层级、装饰、玻璃）。
- **主题层**：`src/themes.json` 每套只给 64 个，其余 53 个（字体、字号、圆角、动效、布局、层级）沿用默认值——各主题共享尺度，只换颜色质感。
- **属性层**：`data-kui-theme` 供调试与主题微调；`data-kui-scheme` 驱动 `color-scheme`（`base.css:38-44` 只切浏览器原生控件明暗）。
- 组件级变量（如 `--kui-line-clamp`，`base.css:720-727` 多行截断）不属于设计 token，用内联样式局部覆盖。

### 1.2 themes.json 结构

`src/themes.json`（911 行）是唯一数据源，由 `tools/build-config.js:79` 打包进 `config/bundle.js` 的 `__KUI_BUNDLE__.themes`。

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `default` | string | `"kurumi"` | 是 | 无记录时的兜底 id，`resolveInitial()` 最后才用 |
| `version` | string | `"1.0"` | 否 | 版本号，仅标识 |
| `themes` | array | — | 是 | 顺序即 `next()/prev()` 循环顺序 |
| `themes[].id` | string | — | 是 | 唯一标识，写入 `data-kui-theme`、localStorage、URL |
| `themes[].name` | string | — | 是 | 卡片与 Toast 显示名 |
| `themes[].desc` | string | `""` | 否 | 一句话说明，卡片 `title` |
| `themes[].scheme` | `dark`/`light` | `"dark"` | 是 | 决定 `data-kui-scheme`，`toggleScheme()` 按它分组 |
| `themes[].tokens` | object | `{}` | 是 | `--kui-*` 名到值的映射，也可写 `kui-bg-0`（`theme.js:76` 补前缀） |
| `themes[].art` | object | `{}` | 否 | 装饰层配置，见 §5 |
| `themes[].preview` | object | `{}` | 否 | 预览色板 `bg/accent/accent2/text` |
| `themes[].meta` | object | — | 否 | 任意元信息，原样保留 |

```json
{ "default": "kurumi", "version": "1.0",
  "themes": [{ "id": "kurumi", "name": "绯红刻刻帝", "desc": "暗夜玻璃 × 绯红 × 金色刻刻帝。",
    "scheme": "dark", "tokens": { "--kui-bg-0": "#08050a", "--kui-accent": "#c8102e" },
    "art": { "motif": "clock", "corner": "cut", "noise": 0.022, "layers": [] },
    "preview": { "bg": "#08050a", "accent": "#c8102e", "accent2": "#d4af37", "text": "#f4eef3" } }] }
```

### 1.3 一次切换发生了什么

`KUI.theme.apply(id, opts)`（`theme.js:297-359`）：

1. 解析主题；找不到回退 `default` 并 `warnOnce('theme-missing:<id>')`。
2. 记录 `previousId`，更新内部 `currentId`。
3. `writeTokens()`：64 个 token 逐个 `documentElement.style.setProperty()`。
4. 写 `data-kui-theme` / `data-kui-scheme`。
5. `renderArt()`：清旧装饰层，按 `art.layers` 重建。
6. 持久化：`persist !== false && !silent` 时写 localStorage。
7. 过渡：`<html>` 挂 `.kui-theme-transition`，340ms 后摘掉（`base.css:1387`）。
8. 派发 `theme.on('change')`、`bus.emit('theme:change')`；非 `silent` 再派 DOM 事件 `kui:themechange` 并广播 iframe。

`silent` 同时关掉持久化、iframe 广播与 DOM 事件；iframe 内静默跟随父级用它最稳。

## 2. token 全表（117 个）

默认值取自 `src/styles/base.css:195-358`；标注「可覆盖」的 64 个会出现在 `themes.json`。

### 2.1 背景 / 文字 / 品牌语义 / 边框（31 个，可覆盖）

| 变量 | 默认值 | 作用 | 影响区域 |
| --- | --- | --- | --- |
| `--kui-bg-0` | `#08050a` | 最深底 | body、遮罩 |
| `--kui-bg-1` | `#0d080f` | 面板底 | 菜单、面板 |
| `--kui-bg-2` | `#130d17` | 卡片底 | 卡片、浮层 |
| `--kui-bg-3` | `#1a1220` | 悬浮底 | hover、页签 |
| `--kui-bg-4` | `#241a2c` | 强调底 | 选中块 |
| `--kui-text-1` | `#f4eef3` | 主文字 | 标题、正文 |
| `--kui-text-2` | `#bfaebd` | 次文字 | 说明 |
| `--kui-text-3` | `#85748a` | 弱文字 | 占位、时间 |
| `--kui-text-inverse` | `#0a060c` | 反色字 | 亮底文字 |
| `--kui-accent` | `#c8102e` | 品牌主色 | 主按钮、选中 |
| `--kui-accent-hover` | `#e22040` | 主色悬停 | 按钮 hover |
| `--kui-accent-soft` | `rgba(200,16,46,.16)` | 主色淡底 | 选中背景 |
| `--kui-accent-glow` | `rgba(200,16,46,.48)` | 主色辉光 | 焦点环 |
| `--kui-accent-2` | `#d4af37` | 辅色金 | 装饰线 |
| `--kui-accent-2-soft` | `rgba(212,175,55,.16)` | 辅色淡底 | 徽标底 |
| `--kui-accent-3` | `#a58fc7` | 第三色紫 | 次要图标 |
| `--kui-success` | `#57b98c` | 成功色 | 成功标签 |
| `--kui-warning` | `#e0a63c` | 警告色 | 警告标签 |
| `--kui-danger` | `#e33b4e` | 危险色 | 删除、错误 |
| `--kui-info` | `#7098c9` | 信息色 | 提示 |
| `--kui-on-accent` | `#f4eef3` | 主色上字 | 主按钮字 |
| `--kui-on-success` | `#0a060c` | 成功底字 | 成功标签字 |
| `--kui-on-warning` | `#0a060c` | 警告底字 | 警告标签字 |
| `--kui-on-danger` | `#0a060c` | 危险底字 | 危险按钮字 |
| `--kui-border` | `rgba(244,238,243,.10)` | 常规边框 | 卡片、面板 |
| `--kui-border-strong` | `rgba(244,238,243,.22)` | 强边框 | 输入框 |
| `--kui-divider` | `rgba(244,238,243,.07)` | 分割线 | divider、表格 |
| `--kui-mask` | `rgba(4,2,6,.74)` | 遮罩 | 弹窗、抽屉 |
| `--kui-mask-strong` | `rgba(4,2,6,.92)` | 深遮罩 | 全屏层 |
| `--kui-selection-bg` | `rgba(200,16,46,.38)` | 选中底 | `::selection` |
| `--kui-selection-text` | `#fff4f7` | 选中字 | `::selection` |

### 2.2 字体与排版（12 个，不可覆盖）

| 变量 | 默认值 | 作用 | 影响区域 |
| --- | --- | --- | --- |
| `--kui-font-family` | 微软雅黑等 8 级栈 | 正文字体 | 全局 |
| `--kui-font-display` | Georgia/Cambria 衬线栈 | 标题字体 | 标题 |
| `--kui-font-mono` | Cascadia/Consolas | 等宽 | 代码、终端 |
| `--kui-fs-xs` | `11px` | 最小字号 | 角标 |
| `--kui-fs-sm` | `12px` | 小字号 | 次要说明 |
| `--kui-fs-base` | `13px` | 基础字号 | 正文 |
| `--kui-fs-md` | `14px` | 中字号 | 表单、按钮 |
| `--kui-fs-lg` | `16px` | 大字号 | 小标题 |
| `--kui-fs-xl` | `20px` | 标题字号 | 区块标题 |
| `--kui-fs-2xl` | `26px` | 大标题 | 页面标题 |
| `--kui-lh` | `1.6` | 行高 | 全局 |
| `--kui-letter-spacing` | `0.01em` | 字距 | 全局 |

### 2.3 形状 / 阴影 / 动效（19 个，不可覆盖）

| 变量 | 默认值 | 作用 | 影响区域 |
| --- | --- | --- | --- |
| `--kui-radius-xs` | `2px` | 最小圆角 | 标签 |
| `--kui-radius-sm` | `4px` | 小圆角 | 按钮、输入框 |
| `--kui-radius-md` | `6px` | 中圆角 | 卡片、弹窗 |
| `--kui-radius-lg` | `10px` | 大圆角 | 面板 |
| `--kui-radius-xl` | `14px` | 超大圆角 | 大容器 |
| `--kui-radius-pill` | `999px` | 胶囊 | 圆按钮、徽标 |
| `--kui-border-width` | `1px` | 描边宽 | 全局 |
| `--kui-shadow-1` | `0 2px 8px rgba(0,0,0,.38)` | 一级阴影 | 卡片 |
| `--kui-shadow-2` | `0 10px 28px rgba(0,0,0,.5)` | 二级阴影 | 浮层 |
| `--kui-shadow-3` | `0 22px 56px rgba(0,0,0,.62)` | 三级阴影 | 弹窗 |
| `--kui-glow` | `0 0 14px rgba(200,16,46,.42)` | 主色辉光 | 强调元素 |
| `--kui-inner-glow` | inset 双色内辉光 | 内发光 | 玻璃面板 |
| `--kui-highlight` | `inset 0 1px 0 rgba(255,255,255,.06)` | 顶部高光 | 面板、卡片 |
| `--kui-duration-fast` | `120ms` | 快动效 | hover |
| `--kui-duration-base` | `200ms` | 基础动效 | 展开 |
| `--kui-duration-slow` | `320ms` | 慢动效 | 弹窗、换肤 |
| `--kui-ease` | `cubic-bezier(.4,0,.2,1)` | 标准缓动 | 全局 |
| `--kui-ease-out` | `cubic-bezier(.16,1,.3,1)` | 出场缓动 | 弹层出现 |
| `--kui-ease-bounce` | `cubic-bezier(.34,1.56,.64,1)` | 回弹缓动 | 开关 |

### 2.4 控件 / 滚动条 / 弹层 / 选项 / 日历（32 个，23 个可覆盖）

| 变量 | 默认值 | 作用 | 影响区域 |
| --- | --- | --- | --- |
| `--kui-control-h-sm` | `26px` | 小控件高 | size=sm |
| `--kui-control-h-md` | `32px` | 标准控件高 | size=md |
| `--kui-control-h-lg` | `38px` | 大控件高 | size=lg |
| `--kui-control-bg` | `rgba(19,13,23,.72)` | 控件底 | 输入、按钮 |
| `--kui-control-bg-hover` | `rgba(26,18,32,.88)` | 悬停底 | hover |
| `--kui-control-bg-active` | `rgba(36,26,44,.92)` | 按下底 | active |
| `--kui-control-bg-disabled` | `rgba(13,8,15,.55)` | 禁用底 | disabled |
| `--kui-control-border` | `rgba(244,238,243,.12)` | 控件边 | 输入、按钮 |
| `--kui-control-border-hover` | `rgba(212,175,55,.38)` | 悬停边 | hover |
| `--kui-control-border-focus` | `rgba(200,16,46,.72)` | 聚焦边 | focus |
| `--kui-control-text` | `#f4eef3` | 控件字 | 输入值 |
| `--kui-control-text-placeholder` | `#85748a` | 占位字 | placeholder |
| `--kui-control-text-disabled` | `#5f5265` | 禁用字 | disabled |
| `--kui-control-radius` | `var(--kui-radius-sm)` | 控件圆角 | 输入、按钮 |
| `--kui-control-px` | `10px` | 控件内距 | 输入、按钮 |
| `--kui-control-arrow-color` | `rgba(244,238,243,.55)` | 箭头色 | select、date |
| `--kui-control-arrow-size` | `12px` | 箭头尺寸 | select、date |
| `--kui-scrollbar-size` | `8px` | 滚动条宽 | 滚动条 |
| `--kui-scrollbar-thumb` | `rgba(244,238,243,.16)` | 滑块 | 滚动条 |
| `--kui-scrollbar-thumb-hover` | `rgba(200,16,46,.62)` | 滑块悬停 | 滚动条 hover |
| `--kui-scrollbar-track` | `rgba(8,5,10,.4)` | 轨道 | 滚动条 |
| `--kui-popup-bg` | `rgba(17,11,21,.97)` | 浮层底 | 下拉、弹窗 |
| `--kui-popup-border` | `rgba(212,175,55,.22)` | 浮层边 | 浮层 |
| `--kui-popup-shadow` | 双层阴影+描边 | 浮层影 | 浮层 |
| `--kui-popup-radius` | `var(--kui-radius-md)` | 浮层圆角 | 浮层 |
| `--kui-popup-z` | `1000` | 浮层层级 | 下拉、tooltip |
| `--kui-option-hover-bg` | `rgba(200,16,46,.14)` | 选项悬停 | 下拉项 |
| `--kui-option-selected-bg` | `rgba(200,16,46,.26)` | 选项选中 | 下拉项 |
| `--kui-option-selected-text` | `#ffeaf0` | 选项选中字 | 下拉项 |
| `--kui-calendar-bg` | `rgba(17,11,21,.97)` | 日历底 | 日期面板 |
| `--kui-calendar-head-bg` | `rgba(200,16,46,.1)` | 表头底 | 日期面板 |
| `--kui-calendar-today` | `#d4af37` | 今日高亮 | 日期面板 |

### 2.5 布局 / 层级 / 装饰 / 玻璃（23 个，不可覆盖）

| 变量 | 默认值 | 作用 | 影响区域 |
| --- | --- | --- | --- |
| `--kui-icon-size` | `16px` | 图标尺寸 | icon 及图标控件 |
| `--kui-focus-ring` | 实底环+主色环 | 焦点环 | `:focus-visible` |
| `--kui-menu-width` | `252px` | 侧栏宽 | app-shell |
| `--kui-menu-width-collapsed` | `68px` | 折叠侧栏宽 | 折叠菜单 |
| `--kui-header-height` | `56px` | 顶栏高 | 头部 |
| `--kui-tabbar-height` | `38px` | 标签栏高 | tabs |
| `--kui-frame-radius` | `6px` | 内嵌页圆角 | iframe 容器 |
| `--kui-app-gap` | `10px` | 布局间距 | app-shell |
| `--kui-z-art` | `0` | 装饰层层级 | art 宿主 |
| `--kui-z-content` | `1` | 内容层级 | 主内容 |
| `--kui-z-header` | `100` | 顶栏层级 | 头部 |
| `--kui-z-mask` | `1900` | 遮罩层级 | 弹窗遮罩 |
| `--kui-z-dialog` | `2000` | 弹窗层级 | 对话框 |
| `--kui-z-toast` | `3000` | 提示层级 | toast |
| `--kui-z-fullscreen` | `4000` | 全屏层级 | 全屏 |
| `--kui-z-popup` | `1500` | 主题化下拉层级 | 表格列筛选、每页条数（v1.4.2） |
| `--kui-corner-size` | `10px` | 切角尺寸 | `corner:"cut"` |
| `--kui-noise-opacity` | `0.035` | 噪点强度 | art noise |
| `--kui-vignette-opacity` | `0.55` | 暗角强度 | art vignette |
| `--kui-glass-bg` | `rgba(16,10,20,.66)` | 玻璃底 | 玻璃面板 |
| `--kui-glass-bg-strong` | `rgba(19,13,23,.86)` | 强玻璃底 | 弹窗、侧栏 |
| `--kui-glass-border` | `rgba(244,238,243,.08)` | 玻璃边 | 玻璃面板 |
| `--kui-glass-blur` | `16px` | 玻璃模糊 | 玻璃面板 |

> 主题只认这 64 个可覆盖 token；其余 53 个改 `base.css`（全局尺度）或在业务容器局部覆盖（§7）。

### 2.6 数据表格专用 token（10 个，组件级）

`datatable.css` 定义 10 个 `--kui-dt-*`，只作用于 `.kui-datatable` 组件树；它们不是 `:root` 设计 token（不占上面 117 个），主题切换通过 `var()` 引用设计 token 自动跟随（v1.4.2 起表格全面主题化）。

| 变量 | 默认值/来源 | 作用 |
| --- | --- | --- |
| `--kui-dt-row-h` | `42px` | 行高（`sm` 34px / `lg` 50px；`.is-compact` 34px） |
| `--kui-dt-cell-px` | `12px` | 单元格左右内边距 |
| `--kui-dt-border` | `var(--kui-border, …)` | 单元格与表头分隔线 |
| `--kui-dt-header-bg` | `var(--kui-bg-2, …)` | 表头底色 |
| `--kui-dt-header-fg` | `var(--kui-text-2, …)` | 表头文字 |
| `--kui-dt-hover` | `var(--kui-dt-hover-overlay, …)` | 普通行悬停叠色（v1.4.3） |
| `--kui-dt-active` | `var(--kui-accent-soft, …)` | 活动列/行强调 |
| `--kui-dt-selected` | `var(--kui-selection-bg, …)` | 选中行底色 |
| `--kui-dt-hover-overlay` | 暗 `rgba(255,255,255,.14)` / 亮 `rgba(0,0,0,.10)` | 悬停叠色来源（v1.4.3；`:root` 唯一保留的 dt 变量） |
| `--kui-dt-hover-selected` | `var(--kui-accent-soft, rgba(226,32,64,.16))` | 选中行悬停叠色（v1.4.4 起随主题变化） |

> v1.4.3 起行状态统一用 `background-color`、悬停统一用 `background-image`，选中行悬停因此能随主题切换；斑马纹规则排除 `.is-selected/.is-active`。字段与选择联动见 [08-components.md](08-components.md) §6.6。

## 3. 六套内置主题

| id | 名称 | scheme | motif | accent | accent-2 | 场景 |
| --- | --- | --- | --- | --- | --- | --- |
| `kurumi` | 绯红刻刻帝 | dark | `clock` | `#c8102e` | `#d4af37` | 默认、暗色控制台 |
| `kurumi-angel` | 白羽灵装 | light | `feather` | `#bd2138` | `#b08a2e` | 白天办公、打印 |
| `starry` | 星夜观测 | dark | `stars` | `#7b96e8` | `#6fc7c9` | 长读、数据观测 |
| `sakura` | 樱雾通灵 | dark | `sakura` | `#e07a9c` | `#d3a189` | 内容展示、柔和 |
| `abyss` | 深渊刻印 | dark | `clock` | `#6fbf8a` | `#b08d57` | 监控大屏、低饱和 |
| `dawn` | 黎明绯光 | light | `sun` | `#c33a2c` | `#c9963c` | 展会、暖色前台 |

六套均提供 64 个 token，装饰层数分别为 9/8/8/8/6/7。暗色四套 `text-1` 走亮色、`scheme:"dark"` 让原生控件也走暗色；浅色两套要保证 `on-accent` 与 `accent` 对比度 ≥ 4.5:1。`abyss` 示范了「主色不铺满」：毒绿只出现在细线与强调边。

## 4. 主题切换

### 4.1 KUI.theme API

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `load` / `register` | `(data)` / `(theme)` | 载入/运行时注册主题 |
| `list` | `()` | 清单（含 `preview/tokens`） |
| `ids`/`get`/`has`/`count`/`defaultId` | — | 基础查询 |
| `current`/`currentId`/`currentTokens`/`tokensOf` | `(id?)` | 当前或指定主题数据 |
| `apply` | `(id, opts?)` | 应用主题，返回生效主题对象 |
| `applyTokens` | `(tokens)` | 只写 token、不改身份（iframe 兜底） |
| `next`/`prev`/`toggleScheme` | `()` | 循环切换 / 深-浅切换 |
| `resolveInitial` | `(fallbackId?)` | 计算初始主题（§4.3） |
| `init` | `(data, opts)` | `load + resolveInitial + apply` |
| `setRoot`/`getRoot`、`setArtHost`/`getArtHost` | `(el)` | 根元素 / 装饰层宿主 |
| `setStorageKey`/`getStorageKey`、`setPersist`/`clearPersisted` | — | 存储键（默认 `kui-theme`）/ 持久化 |
| `refreshArt` / `broadcast` | `()` | 重建装饰层 / 推送 iframe |
| `on`/`once`/`off` | `(name, fn)` | 事件：`load`/`register`/`change` |

`apply` 选项（`theme.js:287-296`）：

| 选项 | 默认 | 作用 |
| --- | --- | --- |
| `silent` | `false` | 不持久化、不广播、不派 DOM 事件（内部事件仍触发） |
| `persist` | `true` | 是否写 localStorage |
| `broadcast` | `true` | 是否向 iframe 广播 |
| `transition` | `true` | 是否加 340ms 过渡类 |
| `artHost` | — | 本次装饰层宿主 |

### 4.2 内置动作

`bootstrap.js:208-331` 额外注册了 5 个主题相关动作（全仓共 28 个内置动作），可直接写进 `on.click`：

| 动作 | 参数 | 行为 |
| --- | --- | --- |
| `app.applyTheme` | `{id}`（或 `theme`/`value`） | 应用主题；传 `dialogId` 时关弹窗；成功弹 toast |
| `app.themeRandom` | — | 随机切到非当前主题 |
| `theme.cycle` | — | 等价 `theme.next()` |
| `theme.toggleScheme` | — | 深浅切换 |
| `theme.picker` | — | 打开内置选择弹窗（id=`theme-picker`；宽度/标题/说明/列数/预览/深浅按钮/遮罩关闭均读 `app.json.theme.picker`，默认宽 680、3 列） |

```json
{ "type": "button", "text": "换个主题", "on": { "click": { "action": "theme.cycle" } } }
```

内置选择器（`bootstrap.js:333-431`）用每套主题的 `bg/accent/accent2/text` 拼渐变缩略块，附「随机主题 / 深浅切换 / 主题展示页」。v1.3.8 起 `app.json` 的 `theme.picker` 全部生效：`openThemePicker`（`:416-431`）消费 `title/desc/width/maskClosable`，`buildThemePickerNodes`（`:333-414`）消费 `columns/showPreview/showScheme`（`columns` 夹在 1–6，默认 3）。`theme.visible` 同样从 v1.3.8 起生效：`filterVisibleThemes`（`:319-331`）按白名单过滤选择器卡片（不在白名单的主题既不展示也不参与选择器内的随机/切换）；`visible` 为空时回退全部主题。

### 4.3 URL、存储与初始优先级

- URL：`?kuiTheme=starry`（`readFromUrl()` 校验 id）。
- 存储键默认 `kui-theme`；`app.json` 的 `theme.storageKey` 由 `theme.init()` 传入（`bootstrap.js:1001-1009`）。
- `theme-boot.js` 支持 `<html data-kui-theme-key="my-key">` 自定义键（`theme-boot.js:45-49`）。
- 初始优先级（`theme.js:401-414`）：

```
__KUI_EARLY_THEME__ > ?kuiTheme= > localStorage > app.json default > themes.json default > 第一套
```

> **主题是“配置默认值 + 浏览器记忆”两层**：`src/themes.json` 与 `app.json.theme.default` 只定义默认值；用户点过主题后，浏览器把选择写进 `localStorage['kui-theme']`，**优先级高于配置默认值**。所以“改了 `theme.default` 却不生效”通常不是配置错，而是本机存了旧选择——先清 `kui-theme`（或开无痕窗口）再看。要让所有访问者首次打开就是新主题，改配置里的默认值并按 §4.3 的“生效”规则处理构建；要恢复某个人的默认，删它浏览器里的这个键。存储键、清除方法与“界面保存都不写 config JSON”的完整说明见 [04-config-app.md](04-config-app.md) §1.3.2～§1.3.3。

### 4.4 iframe 同步

- **父级广播**：`apply()` 末尾向所有 iframe `postMessage`：`{__kui:true, type:'theme:apply', payload:{id,name,desc,scheme,tokens,art,defaultId}}`（协议 `src/frame/kui-frame.js:19`）。
- **子页接收**（`kui-frame.js:253-296`）：校验 `event.source===parent` 且 `data.__kui===true` 后：本地注册过该主题则 `apply(id,{persist:false,broadcast:false,transition:false,silent:true})`；否则只 `applyTokens(tokens)` 并用 `art` 重建装饰层；最后补写 `data-kui-theme`/`data-kui-scheme` 并派发本地 `theme` 事件。

```js
KUI.frame.onTheme(function (t) { console.log('当前主题', t.id, t.scheme); });
```

子页加载完成后可 `KUI.frame.post('frame:theme', payload)`（`kui-frame.js:750`）主动索取。

### 4.5 FOUC 防护：theme-boot.js

`src/core/theme-boot.js`（89 行，同步脚本）在首绘前写好主题，防「先闪 kurumi 再变」：

1. 必须在 `<head>` 内、**第一个 `<link rel="stylesheet">` 之前**（`index.html:4-5`；`tools/audit-consistency.js:176-180`、`tools/smoke.js:693-706` 会检查顺序）。
2. 同源 iframe 直接读父页 `currentId()/currentTokens()` 并立刻写内联 token；独立页读 localStorage 的主题 id，先标记 `data-kui-theme`。
3. 结果存 `window.__KUI_EARLY_THEME__` / `__KUI_EARLY_TOKENS__`，`resolveInitial()` 优先采用，避免二次切换。
4. 全程 `try/catch` 静默降级：`file://` 父子不同源时跳过；零依赖、不阻塞渲染。

## 5. art 装饰层

### 5.1 渲染模型

`KUI.themeArt`（`src/core/theme-art.js`，591 行）把 `art.layers` 翻译为纯 DOM，零外部资源（CSS 渐变 / clip-path / box-shadow / 内联 SVG）：

| API | 签名 | 说明 |
| --- | --- | --- |
| `render` | `(art, hostEl?, opts?)` | 渲染并挂载，返回 `{el, destroy}`；`opts.inline` 加 `.kui-art--inline` |
| `preview` | `(theme, hostEl?, opts?)` | 容器内按主题 token+art 渲染缩略图，不切全局主题 |
| `clear` / `kinds` / `roman` | — | 清空宿主 / 支持的 kind（11 种）/ 12 个罗马数字 |

宿主默认 `#kui-art-host`（`theme.js` 创建，`ART_HOST_ID='kui-art-host'`），层级 `--kui-z-art:0`，`aria-hidden="true"` 且不参与交互；渲染前清旧层，未知 kind 或异常只 `warnOnce` 跳过。

| 顶层字段 | 类型 | 说明 |
| --- | --- | --- |
| `motif` | string | 母题标记，写入 `data-kui-motif`（`clock`/`stars`/`sakura`/`sun`） |
| `corner` | `"cut"` | 切角风格，用 `--kui-corner-size` |
| `noise` | number `0~1` | 全局噪点；数字会在 `vignette` 前自动合成一层 noise |
| `layers` | array | 装饰层，按下标叠放 |

层公共字段：`kind`（必填）、`color`（可引用 token，如 `var(--kui-accent)`）、`opacity`、`blend`、`x`/`y`（百分比）、`size`、`rotate`、`count`；缺省走 `theme-art.js:40-45` 的 FALLBACK（仅兜底）。

### 5.2 十一种 kind 与专属参数

| kind | 视觉 | 专属参数 |
| --- | --- | --- |
| `glow` | 柔光晕 | `size` |
| `grid` | 细网格 HUD | `size`、`flat` |
| `rays` | 放射线 | `count`、`rayWidth`、`rotate` |
| `scanline` | 扫描线 | `size`、`angle`、`speed` |
| `noise` | 噪点 | `size`、`blend` |
| `vignette` | 暗角 | `blend` |
| `moon` | 月轮 | `ring`、`size`、`glow` |
| `stars` | 星点 | `count`、`size`、`speed` |
| `sakura` | 樱瓣飘落 | `count`、`size`、`duration`、`wind` |
| `feather` | 羽毛飘落 | `count`、`size`、`drift`、`angle` |
| `clock` | 刻刻帝表盘 | `size`、`rotate`、`pulse`、`rings`、`ticks`、`minorTicks`、`numerals`、`gears`、`hands` |

FALLBACK 缺省：`stars{count:60,size:2,speed:'6s'}`、`sakura{count:12,size:10,duration:'16s',wind:40}`、`feather{count:3,size:110,drift:'20s',angle:0}`、`clock{size:560,ticks:12,minorTicks:60,pulse:'12s'}`。

```json
{ "motif": "clock", "noise": 0.022, "layers": [
  { "kind": "glow", "color": "var(--kui-accent)", "opacity": 0.2, "size": 520, "x": 72, "y": 18 },
  { "kind": "clock", "color": "var(--kui-accent-2)", "opacity": 0.14, "size": 560, "rotate": -12, "pulse": "12s" },
  { "kind": "vignette", "opacity": 0.55 } ] }
```

### 5.3 性能与可访问

层数建议 ≤ 9（内置 6~9 层），动画层（`scanline`/`stars`/`sakura`/`feather`）控制在 2 层内；大尺寸渐变 + `blur` 叠加吃 GPU。窗口 resize 已由 `bootstrap.js:1033-1040` 防抖 160ms 调 `refreshArt()`，业务侧别频繁调。装饰层 `pointer-events:none` + `aria-hidden`，不进读屏与 Tab 序、打印时被隐藏（`base.css` 第 13 节）。

## 6. 自定义主题完整步骤

### 6.1 步骤

1. 在 `src/themes.json` 的 `themes` 数组末尾追加主题（id 小写短横线、唯一）。
2. `tokens` 建议写全 64 个；只写部分也能跑，但漏的会落到 kurumi 默认值。
3. `art` 可省略或只给 `motif`+`noise`；不确定就复制相近主题的 `layers` 改颜色。
4. 构建：`npm run build`（`tools/build-config.js:79` 打包 `themes.json` 进 `config/bundle.js`；`tools/build-all.js` 生成 `src/core/kui-all.js`）。
5. 校验：`node -e "JSON.parse(require('fs').readFileSync('src/themes.json','utf8'))"`。
6. 验证：`index.html?kuiTheme=my-frost` → 选择器切换 → 刷新确认记忆 → iframe 同步。

### 6.2 一份完整可用的自定义主题

可直接粘进 `themes.json`（64 个 token 全给、浅色；`art` 省略即无装饰层，写法参考 §5）：

```json
{ "id": "my-frost", "name": "霜蓝晨雾", "scheme": "light",
  "desc": "自定义示例：浅蓝灰底 + 冰蓝主色，适合明亮办公环境。",
  "tokens": {
    "--kui-bg-0": "#eef3f8", "--kui-bg-1": "#f6f9fc", "--kui-bg-2": "#ffffff",
    "--kui-bg-3": "#e7eef6", "--kui-bg-4": "#dbe6f2",
    "--kui-text-1": "#1c2733", "--kui-text-2": "#4a5a6b", "--kui-text-3": "#7d8b9b",
    "--kui-text-inverse": "#f6f9fc",
    "--kui-accent": "#2f7fd1", "--kui-accent-hover": "#3f92e6",
    "--kui-accent-soft": "rgba(47,127,209,0.12)", "--kui-accent-glow": "rgba(47,127,209,0.40)",
    "--kui-accent-2": "#3fa9a0", "--kui-accent-2-soft": "rgba(63,169,160,0.14)", "--kui-accent-3": "#8a7fc7",
    "--kui-success": "#2f9e6b", "--kui-warning": "#c98a1e", "--kui-danger": "#cf3a4b", "--kui-info": "#4d84bd",
    "--kui-on-accent": "#ffffff", "--kui-on-success": "#ffffff", "--kui-on-warning": "#1c2733", "--kui-on-danger": "#ffffff",
    "--kui-border": "rgba(28,39,51,0.12)", "--kui-border-strong": "rgba(28,39,51,0.24)", "--kui-divider": "rgba(28,39,51,0.08)",
    "--kui-mask": "rgba(16,28,40,0.42)", "--kui-mask-strong": "rgba(16,28,40,0.62)",
    "--kui-selection-bg": "rgba(47,127,209,0.24)", "--kui-selection-text": "#10202e",
    "--kui-shadow-1": "0 2px 8px rgba(28,39,51,0.10)", "--kui-shadow-2": "0 10px 28px rgba(28,39,51,0.16)",
    "--kui-shadow-3": "0 22px 56px rgba(28,39,51,0.22)",
    "--kui-glow": "0 0 14px rgba(47,127,209,0.28)", "--kui-inner-glow": "inset 0 0 0 1px rgba(63,169,160,0.10)",
    "--kui-highlight": "inset 0 1px 0 rgba(255,255,255,0.65)",
    "--kui-control-bg": "rgba(255,255,255,0.86)", "--kui-control-bg-hover": "rgba(246,249,252,0.96)",
    "--kui-control-bg-active": "rgba(231,238,246,0.98)", "--kui-control-bg-disabled": "rgba(238,243,248,0.70)",
    "--kui-control-border": "rgba(28,39,51,0.16)", "--kui-control-border-hover": "rgba(63,169,160,0.45)",
    "--kui-control-border-focus": "rgba(47,127,209,0.70)",
    "--kui-control-text": "#1c2733", "--kui-control-text-placeholder": "#7d8b9b",
    "--kui-control-text-disabled": "#a6b2bf", "--kui-control-arrow-color": "rgba(28,39,51,0.55)",
    "--kui-scrollbar-thumb": "rgba(28,39,51,0.18)", "--kui-scrollbar-thumb-hover": "rgba(47,127,209,0.50)",
    "--kui-scrollbar-track": "rgba(231,238,246,0.60)",
    "--kui-popup-bg": "rgba(255,255,255,0.98)", "--kui-popup-border": "rgba(47,127,209,0.22)",
    "--kui-popup-shadow": "0 18px 48px rgba(28,39,51,0.18)",
    "--kui-option-hover-bg": "rgba(47,127,209,0.10)", "--kui-option-selected-bg": "rgba(47,127,209,0.18)",
    "--kui-option-selected-text": "#123a5e",
    "--kui-calendar-bg": "rgba(255,255,255,0.98)", "--kui-calendar-head-bg": "rgba(47,127,209,0.08)",
    "--kui-calendar-today": "#2f7fd1",
    "--kui-glass-bg": "rgba(255,255,255,0.66)", "--kui-glass-bg-strong": "rgba(255,255,255,0.86)",
    "--kui-glass-border": "rgba(28,39,51,0.10)", "--kui-glass-blur": "16px" },
  "preview": { "bg": "#eef3f8", "accent": "#2f7fd1", "accent2": "#3fa9a0", "text": "#1c2733" } }
```

### 6.3 部署与验证清单

- [ ] JSON 可解析、id 唯一；`npm run build` 后 `grep my-frost config/bundle.js` 命中。
- [ ] `?kuiTheme=my-frost` 生效，刷新后仍记住（localStorage `kui-theme`）。
- [ ] 选择器出现新卡片，`theme.next()` 能循环到它。
- [ ] iframe 内切换同步（`KUI.frame.onTheme` 有回调）；首屏无闪烁。
- [ ] 对比度：`text-1` vs `bg-0`、`on-accent` vs `accent` ≥ 4.5:1。
- [ ] 发布时给静态资源加版本号，避免浏览器沿用旧 `bundle.js`。

## 7. 样式覆盖规则与优先级

### 7.1 优先级链

1. 元素内联样式；2. 主题 token（写在 `<html>` 的内联 `--kui-*`，覆盖一切 `:root`）；3. `base.css` 的 `:root` 默认 token；4. 组件 CSS（`controls.css`、`components.css`，顺序见 `index.html:14-17`，只读变量）。

所以改主题色永远优先改 token；直接改组件规则会连带破坏其它主题。

### 7.2 只改某个组件的颜色

在业务容器上局部覆盖变量，让子组件自动继承：

```css
/* 只让这张卡片变青绿，不影响全局与其它组件 */
.my-card { --kui-accent: #3fa9a0; --kui-accent-hover: #4fbcb2; --kui-control-border-focus: rgba(63,169,160,0.7); }
```

不要按主题 id 写组件覆盖（契约 §13 禁止，新增主题会失效）：

```css
/* ✗ 错误 */
[data-kui-theme="starry"] .kui-button { background: blue; }
```

### 7.3 深色/浅色设计建议

- **背景阶梯**：暗色 `bg-0` 最深、`bg-4` 最亮（相邻差 4%~8% 亮度）；浅色 `bg-1` 比 `bg-0` 更亮。
- **文字层级**：`text-1` vs `bg-0` ≥ 7:1；`text-2` ≥ 4.5:1；`text-3` 只给非关键信息。
- **on-***：与对应底色成对设计；浅色主题里 `on-warning` 通常是深字。
- **玻璃**：`glass-bg` alpha 0.55~0.86、`glass-blur` ≤ 20px，否则低端机掉帧。
- **阴影/尺度**：暗色用黑阴影+主色辉光、浅色用低 alpha 黑阴影；`duration/ease/radius` 是全局尺度，主题不要单独改。

## 常见错误

| 现象 | 原因 | 修复 |
| --- | --- | --- |
| 改了 `themes.json` 不生效 | 用 `file://` 打开却没跑 `npm run build:config`（bundle 是旧的）；或静态部署只上传了旧的 `bundle.js` | http 模式刷新即生效；file:// / bundle-only 部署重新构建并强刷（判定见 [04-config-app.md](04-config-app.md) §1.3.1） |
| 只写部分 token，一半是绯红 | 缺失 token 落回 kurumi 默认值 | 补齐 64 个 |
| 刷新后回到默认主题 | `apply` 传了 `silent`/`persist=false`，或存储被清 | 用默认 `apply(id)`，检查 `storageKey` |
| iframe 里主题闪一下 | 没引 `theme-boot.js` 或排在样式表后 | 放到 `<head>` 首个样式表前 |
| iframe 不跟随父级 | 跨域（`file://`）或父级 `silent` 不广播 | 改 postMessage 协议或读 localStorage |
| 装饰层不出现 | `kind` 拼错 / 没给 `layers` | 对照 `KUI.themeArt.kinds()`，看控制台 warn |
| 局部改色变成全局改色 | 变量写在 `:root`/`<html>` 上 | 写到业务容器上，靠继承收窄 |
| `?kuiTheme=` 没反应 | id 不存在（回退默认）或被 early 抢占 | 核对 id，清 localStorage |

## 本章自检

```bash
# 1) JSON 可解析 + 主题清单
node -e "const d=JSON.parse(require('fs').readFileSync('src/themes.json','utf8'));console.log(d.themes.length,d.themes.map(t=>t.id).join(','))"
# 2) 每套是否给全 64 个 token（应输出 true）
node -e "const d=JSON.parse(require('fs').readFileSync('src/themes.json','utf8'));console.log(d.themes.every(t=>Object.keys(t.tokens).length===64))"
# 3) 构建产物包含新主题
grep -c "my-frost" config/bundle.js
```

浏览器再走：`?kuiTheme=starry` → 选择器切换 → 刷新 → iframe 同步 → 首屏无闪烁。

## 参考源码

- `src/styles/base.css:195-358`（117 token）、`:720-727`（`--kui-line-clamp`）、`:1387-1398`（过渡）、`:915-1280`（装饰层）
- `src/themes.json`（6 套主题、64 token/套、art）；`src/core/theme.js`（`apply`/`resolveInitial`/`init`/`broadcast`）
- `src/core/theme-art.js`（11 种装饰层）、`src/core/theme-boot.js`（防闪烁）、`src/frame/kui-frame.js:207-399`（iframe 同步）
- `src/app/bootstrap.js:208-331`（主题动作）、`:333-431`（内置选择器）、`:882-895`（初始化）；`config/app.json:178-198`
- `tools/build-config.js:79`；`docs/04-theme.md`（token 契约、自定义步骤、iframe 协议）

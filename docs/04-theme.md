# 04 · 主题与视觉体系（KurumiUI）

> 配套契约：[`docs/00-contract.md`](./00-contract.md)（§10 视觉 token、§13 主题 JSON、§16 视觉方向）。
> 本文既是**使用手册**（怎么切主题、怎么调 token），也是**维护手册**（怎么零改代码新增主题、art 装饰层怎么配）。
> 改 `themes.json` / `base.css` / `theme-art.js` 之前请先读完第 5、6、9 节。

## 1. 设计原则

KurumiUI 的「主题」不是一个 CSS 类，而是**一包数据**：

| 轨道 | 内容 | 载体 | 渲染者 |
| --- | --- | --- | --- |
| tokens | 颜色、阴影、发光、字体、圆角、动效时长…… | `src/themes.json` 的 `themes[].tokens` | `core/theme.js` 写成 `<html>` 上的 CSS 变量 |
| art | 装饰层描述（光晕/网格/时钟/血月/羽毛/樱瓣…） | `src/themes.json` 的 `themes[].art` | `core/theme-art.js` 翻译成 DOM |

由此得到四条硬规则：

1. **主题只能通过 tokens + art 表达。** 组件 CSS 只引用 `var(--kui-*)`，任何 CSS 里都不出现主题名。
   禁止写 `.theme-kurumi .kui-btn {…}`、`[data-kui-theme="sakura"] .kui-panel {…}` 这类分支——那会让「新增主题」退化成「改 CSS」。
2. **改 JSON 不改代码。** 新增第 7 套主题 = 在 `themes.json` 里加一个对象；只有引入**新的装饰层 kind** 时才需要改 CSS/JS（第 5.5 节）。
3. **零外部资源。** 装饰全部用 CSS 渐变 / `clip-path` / `box-shadow` / 内联 SVG 绘制，不加载任何图片、字体、CDN 或网络地址；字体栈只使用系统自带字体。
4. **克制优先。** 主题可以华丽（刻刻帝表盘、血月、羽落），但不能干扰阅读：装饰层 `pointer-events: none`、`aria-hidden="true"`、低透明度，并服从 `prefers-reduced-motion` 降级（第 8 节）。

## 2. 文件分工与加载顺序

| 文件 | 职责 | 维护者 |
| --- | --- | --- |
| `src/themes.json` | 6 套主题的 `tokens` + `art` + `preview`；**唯一的外观数据源** | 主题/视觉 |
| `src/styles/base.css` | 94 个契约 token 的 `:root` 默认值（kurumi 兜底）、reset、字体、装饰层 CSS、布局骨架、工具类 | 主题/视觉 |
| `src/core/theme.js` | 载入主题、把 token 写成 CSS 变量、装饰层生命周期、持久化、向 iframe 广播、切换过渡 | 核心 |
| `src/core/theme-art.js` | 按 `art.layers` 生成装饰 DOM（`render` / `destroy`） | 核心 |
| `src/styles/controls.css`、`src/styles/components.css` | 控件与组件样式：只引用 token，不含主题分支 | 控件/组件 |

CSS 加载顺序必须是 `base.css` → `controls.css` → `components.css`（`base.css` 里的 `:root` 兜底值必须最先可用）。
脚本推荐顺序：`core/kui.js` → `core/theme-art.js` → `core/theme.js` → 其它模块。
`theme.js` 在每次 `apply` 时按需调用 `KUI.themeArt.render`，因此**装饰层脚本必须在第一次 `theme.apply(...)` 之前载入**，否则首屏没有装饰层（之后 `refreshArt()` 可补渲染）。

`theme.js` 会自动创建装饰层宿主（不需要手写 HTML）：

```html
<body>
  <div id="kui-art-host" class="kui-art-host" aria-hidden="true">
    <div class="kui-art" data-kui-motif="clock">
      <div class="kui-art__layer kui-art__layer--glow"></div>
      <div class="kui-art__layer kui-art__layer--grid"></div>
      <!-- …按 art.layers 顺序叠加… -->
    </div>
  </div>
  <!-- 应用内容 -->
</body>
```

## 3. 六套主题

| id | 名称 | 明暗 | 背景 | 主色 | 点缀 | 文字 | 装饰母题 | 层数 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `kurumi`（默认） | 绯红刻刻帝 | 暗色 | `#08050a` | `#c8102e` | `#d4af37` | `#f4eef3` | `clock` | 9 |
| `kurumi-angel` | 白羽灵装 | 亮色 | `#f7f2ec` | `#bd2138` | `#b08a2e` | `#2c2429` | `feather` | 8 |
| `starry` | 星夜观测 | 暗色 | `#070a14` | `#7b96e8` | `#6fc7c9` | `#e8eefb` | `stars` | 8 |
| `sakura` | 樱雾通灵 | 暗色 | `#140e16` | `#e07a9c` | `#d3a189` | `#f6eef3` | `sakura` | 8 |
| `abyss` | 深渊刻印 | 暗色 | `#050b09` | `#6fbf8a` | `#b08d57` | `#e6f0e9` | `clock` | 6 |
| `dawn` | 黎明绯光 | 亮色 | `#faf3ea` | `#c33a2c` | `#c9963c` | `#3a2c26` | `sun` | 7 |

### 3.1 `kurumi` · 绯红刻刻帝（默认，dark）

- **定位**：项目默认主题，也是「科技未来 + 动漫（时崎狂三）」的基准表达：暗夜玻璃 + 绯红主色 + 金色刻刻帝。
- **色板**：背景 `#08050a` → `#0d080f` → `#130d17`；主色绯红 `#c8102e`；点缀金 `#d4af37`；第三色灰紫 `#a58fc7`；正文 `#f4eef3`。
- **装饰**：9 层。右上绯红光晕、左下金色余光、44px HUD 细网格、26 道金色放射光、380px 血月（带外环）、560px 刻刻帝表盘（罗马数字 + 60 刻度 + 指针 + 双齿轮，位于右下并旋转 −8°）、4 根飘落羽毛、3px 扫描线、55% 暗角。
- **使用建议**：默认 demo、演示首屏；`accent` 只用于焦点/选中/关键按钮，金色只做描边与时钟，避免两色等权抢戏。

### 3.2 `kurumi-angel` · 白羽灵装（light）

- **定位**：同一角色的「白羽灵装」形态。奶白与淡金为底，浅绯作点睛，洁净但保留一丝血色。
- **色板**：背景 `#f7f2ec`；主色浅绯 `#bd2138`；点缀淡金 `#b08a2e`；正文 `#2c2429`。
- **装饰**：8 层。金色大光晕、浅绯余光、轻网格、18 道金放射光、250px 金色月轮、两组白羽（7 + 3 根，反向角度）、16% 低暗角。
- **使用建议**：亮色主题的对比度主要靠文字色与描边，**暗角与扫描线必须压低**（本主题暗角 16%）；不要在其上放大面积发光。

### 3.3 `starry` · 星夜观测（dark）

- **定位**：深空蓝紫的观测穹顶。星点与星辉青交织，冷静、宽广，适合长时间阅读与数据观测。
- **色板**：背景 `#070a14`；主色蓝 `#7b96e8`；点缀星辉青 `#6fc7c9`；正文 `#e8eefb`。
- **装饰**：8 层。120 颗随机星点（闪烁 6s 基准）、蓝紫光晕、星辉青余光、细网格、24 道淡放射光、340px 月轮、扫描线、50% 暗角。`noise` 0.012。
- **使用建议**：适合「仪表盘/监控」类页面；星点由配置种子生成，每次切换布局稳定，不是随机闪烁位移。

### 3.4 `sakura` · 樱雾通灵（dark）

- **定位**：樱粉与灰紫的薄雾结界，玫瑰金作饰。柔和，但轮廓仍保留哥特感。
- **色板**：背景 `#140e16`；主色樱粉 `#e07a9c`；点缀玫瑰金 `#d3a189`；第三色灰紫（`--kui-accent-3`）；正文 `#f6eef3`。
- **装饰**：8 层。樱粉光晕、玫瑰金余光、细网格、300px 灰紫月轮、两组飘落樱瓣（18 片 + 7 片，风向相反）、3 根羽毛、46% 暗角。`noise` 0.016。
- **使用建议**：樱瓣层透明度较高（0.55），页面内容多时建议在业务侧再叠一层半透明面板（`.kui-glass`）保证可读性。

### 3.5 `abyss` · 深渊刻印（dark）

- **定位**：墨绿黑与青铜的「刻印空间」。毒绿只以细线出现，深渊感强但克制——**明确不是赛博朋克**。
- **色板**：背景 `#050b09`；主色毒绿 `#6fbf8a`；点缀青铜 `#b08d57`；正文 `#e6f0e9`。
- **装饰**：6 层。顶部绿光晕、青铜余光、40px 绿细网格、620px 刻刻帝（`numerals: false`，只留指针与刻度，位于左上）、扫描线、60% 暗角。`noise` 0.03。
- **使用建议**：绿色只做 1px 线、焦点环与小面积强调；禁止把毒绿用于大面积填充或文字发光。

### 3.6 `dawn` · 黎明绯光（light）

- **定位**：黎明暖白与暖金，绯红作地平线。像清晨第一道光，明亮而不刺眼。
- **色板**：背景 `#faf3ea`；主色绯红 `#c33a2c`；点缀暖金 `#c9963c`；正文 `#3a2c26`。
- **装饰**：7 层。右上 100vmax 金色大光晕、绯红余光、24 道放射光、46px 暖网格、240px 金色日轮、3 根羽毛、20% 低暗角。`noise` 0.012。
- **使用建议**：亮色主题可读性依赖 `text-1`（#3a2c26）；`accent` 用于按钮与选中的同时，注意与暖金区分层级。

> **风格红线（契约 §16）**：默认 kurumi 必须是「暗夜玻璃 + 绯红 + 金色刻刻帝」的科技未来/动漫哥特质感，**不得**滑向赛博朋克：禁止大面积荧光青紫、glitch/故障抖动、荧光绿粗霓虹、彩色扫描线铺满整屏。

## 4. Token 契约（94 个）

`base.css` 的 `:root` 定义了契约 §10 要求的**全部 90 个 token**，外加任务 task-9 增补的 **4 个 `--kui-on-*` 语义前景色**（填充色上的可读文字/图标色），共 94 个契约级 token；值取 kurumi 主题（默认主题的兜底值）。
`theme.js` 切换主题时只写 `themes[].tokens` 里给出的变量、并移除上一套主题写过而新主题没写的变量，因此：

- 任意 token 只要 `base.css` 有默认值，就一定不会在切主题后变成空值；
- **新增 token 必须先在 `base.css` 的 `:root` 补默认值**，再按需在 `themes.json` 覆盖（否则只有部分主题生效）；
- token 键有三种等价写法：`bg-0` / `kui-bg-0` / `--kui-bg-0`（`theme.js` 的 `tokenName()` 会规范化），推荐直接写 `--kui-` 前缀，自解释、便于 grep。

类型约定：**颜色** = 任何合法 CSS 颜色（推荐 hex / rgba）；**长度** = 带单位的 CSS 长度；**数值** = 无单位数字；**字体** = `font-family` 值；**阴影** = `box-shadow` 值；**时长** = `ms`/`s`；**缓动** = `cubic-bezier()` / 关键字。

**背景与容器**

| Token | 含义 | 类型 | 默认值（kurumi） |
| --- | --- | --- | --- |
| `--kui-bg-0` | 页面最底层背景（body 与装饰层之下的底色） | 颜色 | `#08050a` |
| `--kui-bg-1` | 一级容器背景（主区域、面板底） | 颜色 | `#0d080f` |
| `--kui-bg-2` | 二级容器背景（卡片、表头、输入区） | 颜色 | `#130d17` |
| `--kui-bg-3` | 三级容器背景（悬浮层内嵌块） | 颜色 | `#1a1220` |
| `--kui-bg-4` | 四级/强调背景（选中块、代码块、悬停加深） | 颜色 | `#241a2c` |

**文字**

| Token | 含义 | 类型 | 默认值（kurumi） |
| --- | --- | --- | --- |
| `--kui-text-1` | 正文主文字 | 颜色 | `#f4eef3` |
| `--kui-text-2` | 次要文字（说明、标签、辅助信息） | 颜色 | `#bfaebd` |
| `--kui-text-3` | 弱化文字（占位、时间戳、禁用提示） | 颜色 | `#85748a` |
| `--kui-text-inverse` | 反色文字（亮色块/强调色块上的文字） | 颜色 | `#0a060c` |

**主强调色**

| Token | 含义 | 类型 | 默认值（kurumi） |
| --- | --- | --- | --- |
| `--kui-accent` | 主强调色：焦点、选中、关键按钮 | 颜色 | `#c8102e` |
| `--kui-accent-hover` | 主强调色 hover 态 | 颜色 | `#e22040` |
| `--kui-accent-soft` | 主强调色低透明度底（选中行、标签底） | 颜色 | `rgba(200, 16, 46, 0.16)` |
| `--kui-accent-glow` | 主强调色发光（focus ring、外发光） | 颜色 | `rgba(200, 16, 46, 0.48)` |

**副强调色与第三色**

| Token | 含义 | 类型 | 默认值（kurumi） |
| --- | --- | --- | --- |
| `--kui-accent-2` | 副强调色（金）：刻刻帝、描边点缀、强调数字 | 颜色 | `#d4af37` |
| `--kui-accent-2-soft` | 副强调色低透明度底 | 颜色 | `rgba(212, 175, 55, 0.16)` |
| `--kui-accent-3` | 第三强调色（灰紫）：辅助提示、图表第三色 | 颜色 | `#a58fc7` |

**语义色**

| Token | 含义 | 类型 | 默认值（kurumi） |
| --- | --- | --- | --- |
| `--kui-success` | 成功态 | 颜色 | `#57b98c` |
| `--kui-warning` | 警告态 | 颜色 | `#e0a63c` |
| `--kui-danger` | 危险/错误态 | 颜色 | `#e33b4e` |
| `--kui-info` | 信息态 | 颜色 | `#7098c9` |
| `--kui-on-accent` | 强调色填充上的可读前景色（主按钮文字/图标） | 颜色 | `#f4eef3` |
| `--kui-on-success` | 成功色填充上的可读前景色 | 颜色 | `#0a060c` |
| `--kui-on-warning` | 警告色填充上的可读前景色 | 颜色 | `#0a060c` |
| `--kui-on-danger` | 危险/错误色填充上的可读前景色 | 颜色 | `#0a060c` |

> `--kui-on-*` 用于「实心语义按钮」等填充场景：控件应写 `var(--kui-on-success, var(--kui-text-inverse))` 这类带兜底的引用（即使某个自定义主题漏写，也有兜底且不至于是浅色压浅色）。6 套内置主题的取值均经 WCAG 对比度校验 ≥ 4.5:1，数据见附录 A。禁止用 `--kui-text-1` / `--kui-text-inverse` 直接配语义填充色——starry / sakura / abyss 等浅主色主题上会出现「文字与背景同色」。

**描边与遮罩**

| Token | 含义 | 类型 | 默认值（kurumi） |
| --- | --- | --- | --- |
| `--kui-border` | 常规描边 | 颜色 | `rgba(244, 238, 243, 0.1)` |
| `--kui-border-strong` | 强描边（分隔、hover 边框、选中块边界） | 颜色 | `rgba(244, 238, 243, 0.22)` |
| `--kui-divider` | 细分隔线 | 颜色 | `rgba(244, 238, 243, 0.07)` |
| `--kui-mask` | 遮罩层（弹窗背后的页面压暗） | 颜色 | `rgba(4, 2, 6, 0.74)` |
| `--kui-mask-strong` | 强遮罩（阻塞式弹窗、全屏 loading） | 颜色 | `rgba(4, 2, 6, 0.92)` |

**文字选中**

| Token | 含义 | 类型 | 默认值（kurumi） |
| --- | --- | --- | --- |
| `--kui-selection-bg` | 文字选中背景 | 颜色 | `rgba(200, 16, 46, 0.38)` |
| `--kui-selection-text` | 文字选中前景 | 颜色 | `#fff4f7` |

**字体**

| Token | 含义 | 类型 | 默认值（kurumi） |
| --- | --- | --- | --- |
| `--kui-font-family` | 基础字体栈（纯离线系统字体，中文优先） | 字体 | `"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", …` |
| `--kui-font-display` | 标题/数字展示字体栈（衬线，配表盘与大字） | 字体 | `"Georgia", "Cambria", "Times New Roman", …` |
| `--kui-font-mono` | 等宽字体栈（代码、ID、时钟数字） | 字体 | `"Cascadia Mono", "Cascadia Code", "Consolas", …` |

**字号与排版**

| Token | 含义 | 类型 | 默认值（kurumi） |
| --- | --- | --- | --- |
| `--kui-fs-xs` | 11px 极小字号（徽标、表格内注） | 长度 | `11px` |
| `--kui-fs-sm` | 12px 小字号（辅助信息、标签） | 长度 | `12px` |
| `--kui-fs-base` | 13px 基础字号（正文/控件默认） | 长度 | `13px` |
| `--kui-fs-md` | 14px 中等字号（表单正文强调） | 长度 | `14px` |
| `--kui-fs-lg` | 16px 小标题 | 长度 | `16px` |
| `--kui-fs-xl` | 20px 标题 | 长度 | `20px` |
| `--kui-fs-2xl` | 26px 大标题/关键数值 | 长度 | `26px` |
| `--kui-lh` | 基础行高倍数 | 数值 | `1.6` |
| `--kui-letter-spacing` | 基础字间距 | 长度 | `0.01em` |

**圆角与描边**

| Token | 含义 | 类型 | 默认值（kurumi） |
| --- | --- | --- | --- |
| `--kui-radius-xs` | 2px 微圆角（徽标、标签） | 长度 | `2px` |
| `--kui-radius-sm` | 4px 控件圆角 | 长度 | `4px` |
| `--kui-radius-md` | 6px 面板/弹层圆角 | 长度 | `6px` |
| `--kui-radius-lg` | 10px 大容器圆角 | 长度 | `10px` |
| `--kui-radius-xl` | 14px 特大容器圆角 | 长度 | `14px` |
| `--kui-radius-pill` | 胶囊圆角（999px） | 长度 | `999px` |
| `--kui-border-width` | 统一描边宽度 | 长度 | `1px` |

**阴影与发光**

| Token | 含义 | 类型 | 默认值（kurumi） |
| --- | --- | --- | --- |
| `--kui-shadow-1` | 低级阴影（卡片、控件悬浮） | 阴影 | `0 2px 8px rgba(0, 0, 0, 0.38)` |
| `--kui-shadow-2` | 中级阴影（下拉、浮层） | 阴影 | `0 10px 28px rgba(0, 0, 0, 0.5)` |
| `--kui-shadow-3` | 高级阴影（对话框、抽屉） | 阴影 | `0 22px 56px rgba(0, 0, 0, 0.62)` |
| `--kui-glow` | 主题外发光（强调按钮/选中块） | 阴影 | `0 0 14px rgba(200, 16, 46, 0.42)` |
| `--kui-inner-glow` | 内发光（面板内缘，暗夜玻璃质感） | 阴影 | `inset 0 0 0 1px rgba(212, 175, 55, 0.08), inset 0 0 18px rgba(200, 16, 46, 0.1)` |
| `--kui-highlight` | 顶部高光（玻璃上缘 1px 反光） | 阴影 | `inset 0 1px 0 rgba(255, 255, 255, 0.06)` |

**动效**

| Token | 含义 | 类型 | 默认值（kurumi） |
| --- | --- | --- | --- |
| `--kui-duration-fast` | 120ms 微交互 | 时长 | `120ms` |
| `--kui-duration-base` | 200ms 常规过渡 | 时长 | `200ms` |
| `--kui-duration-slow` | 320ms 展开/主题切换 | 时长 | `320ms` |
| `--kui-ease` | 标准缓动 | 缓动 | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `--kui-ease-out` | 出场缓动 | 缓动 | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `--kui-ease-bounce` | 回弹缓动（强调元素出现） | 缓动 | `cubic-bezier(0.34, 1.56, 0.64, 1)` |

**控件高度**

| Token | 含义 | 类型 | 默认值（kurumi） |
| --- | --- | --- | --- |
| `--kui-control-h-sm` | 小号控件高度 | 长度 | `26px` |
| `--kui-control-h-md` | 中号控件高度（默认） | 长度 | `32px` |
| `--kui-control-h-lg` | 大号控件高度 | 长度 | `38px` |

**控件底色**

| Token | 含义 | 类型 | 默认值（kurumi） |
| --- | --- | --- | --- |
| `--kui-control-bg` | 控件底色 | 颜色 | `rgba(19, 13, 23, 0.72)` |
| `--kui-control-bg-hover` | 控件 hover 底色 | 颜色 | `rgba(26, 18, 32, 0.88)` |
| `--kui-control-bg-active` | 控件按下/展开底色 | 颜色 | `rgba(36, 26, 44, 0.92)` |
| `--kui-control-bg-disabled` | 控件禁用底色 | 颜色 | `rgba(13, 8, 15, 0.55)` |

**控件描边**

| Token | 含义 | 类型 | 默认值（kurumi） |
| --- | --- | --- | --- |
| `--kui-control-border` | 控件描边 | 颜色 | `rgba(244, 238, 243, 0.12)` |
| `--kui-control-border-hover` | 控件 hover 描边（通常用点缀色） | 颜色 | `rgba(212, 175, 55, 0.38)` |
| `--kui-control-border-focus` | 控件聚焦描边（通常用主色） | 颜色 | `rgba(200, 16, 46, 0.72)` |

**控件文字**

| Token | 含义 | 类型 | 默认值（kurumi） |
| --- | --- | --- | --- |
| `--kui-control-text` | 控件文字 | 颜色 | `#f4eef3` |
| `--kui-control-text-placeholder` | 占位符文字 | 颜色 | `#85748a` |
| `--kui-control-text-disabled` | 禁用态文字 | 颜色 | `#5f5265` |

**控件形状**

| Token | 含义 | 类型 | 默认值（kurumi） |
| --- | --- | --- | --- |
| `--kui-control-radius` | 控件圆角（默认引用 radius-sm） | 长度 | `var(--kui-radius-sm)` |
| `--kui-control-px` | 控件横向内边距 | 长度 | `10px` |
| `--kui-control-arrow-color` | 下拉箭头颜色 | 颜色 | `rgba(244, 238, 243, 0.55)` |
| `--kui-control-arrow-size` | 下拉箭头尺寸 | 长度 | `12px` |

**滚动条**

| Token | 含义 | 类型 | 默认值（kurumi） |
| --- | --- | --- | --- |
| `--kui-scrollbar-size` | 滚动条粗细 | 长度 | `8px` |
| `--kui-scrollbar-thumb` | 滚动条滑块 | 颜色 | `rgba(244, 238, 243, 0.16)` |
| `--kui-scrollbar-thumb-hover` | 滑块 hover 色 | 颜色 | `rgba(200, 16, 46, 0.62)` |
| `--kui-scrollbar-track` | 滚动条轨道 | 颜色 | `rgba(8, 5, 10, 0.4)` |

**弹层**

| Token | 含义 | 类型 | 默认值（kurumi） |
| --- | --- | --- | --- |
| `--kui-popup-bg` | 下拉/弹层背景 | 颜色 | `rgba(17, 11, 21, 0.97)` |
| `--kui-popup-border` | 弹层描边 | 颜色 | `rgba(212, 175, 55, 0.22)` |
| `--kui-popup-shadow` | 弹层阴影 | 阴影 | `0 18px 48px rgba(0, 0, 0, 0.62), 0 0 0 1px rgba(200, 16, 46, 0.08)` |
| `--kui-popup-radius` | 弹层圆角 | 长度 | `var(--kui-radius-md)` |
| `--kui-popup-z` | 弹层层级（z-index） | 数值 | `1000` |

**选项**

| Token | 含义 | 类型 | 默认值（kurumi） |
| --- | --- | --- | --- |
| `--kui-option-hover-bg` | 选项 hover 背景 | 颜色 | `rgba(200, 16, 46, 0.14)` |
| `--kui-option-selected-bg` | 选项选中背景 | 颜色 | `rgba(200, 16, 46, 0.26)` |
| `--kui-option-selected-text` | 选项选中文字 | 颜色 | `#ffeaf0` |

**日历**

| Token | 含义 | 类型 | 默认值（kurumi） |
| --- | --- | --- | --- |
| `--kui-calendar-bg` | 日历弹层背景 | 颜色 | `rgba(17, 11, 21, 0.97)` |
| `--kui-calendar-head-bg` | 日历表头背景 | 颜色 | `rgba(200, 16, 46, 0.1)` |
| `--kui-calendar-today` | 日历「今天」标记色 | 颜色 | `#d4af37` |


### 4.1 base.css 扩展 token（非契约，供骨架/组件使用）

以下 22 个 token 由 `base.css` 额外提供（不属于契约 §10 的 90 个及其增补的 4 个 `--kui-on-*`），用于布局骨架、层级、玻璃质感与装饰层默认值；组件可以直接引用，主题 JSON 一般不覆盖它们。

**布局骨架**

| Token | 含义 | 类型 | 默认值 |
| --- | --- | --- | --- |
| `--kui-menu-width` | 左侧菜单展开宽度（骨架 .kui-app 使用） | 长度 | `252px` |
| `--kui-menu-width-collapsed` | 左侧菜单折叠宽度 | 长度 | `68px` |
| `--kui-header-height` | 顶部 Header 高度（56px） | 长度 | `56px` |
| `--kui-tabbar-height` | 标签栏高度（38px） | 长度 | `38px` |
| `--kui-frame-radius` | iframe 圆角（6px） | 长度 | `6px` |
| `--kui-app-gap` | 主区域与菜单/标签栏之间的间距 | 长度 | `10px` |

**层级**

| Token | 含义 | 类型 | 默认值 |
| --- | --- | --- | --- |
| `--kui-z-art` | 装饰层 z-index（0，位于内容之下） | 数值 | `0` |
| `--kui-z-content` | 内容层 z-index（≥1） | 数值 | `1` |
| `--kui-z-header` | Header 层级 | 数值 | `100` |
| `--kui-z-mask` | 遮罩层级 | 数值 | `1900` |
| `--kui-z-dialog` | 弹窗层级 | 数值 | `2000` |
| `--kui-z-toast` | 提醒层层级 | 数值 | `3000` |
| `--kui-z-fullscreen` | 全屏元素层级 | 数值 | `4000` |

**质感与装饰**

| Token | 含义 | 类型 | 默认值 |
| --- | --- | --- | --- |
| `--kui-corner-size` | 斜切角尺寸（.kui-corner-cut） | 长度 | `10px` |
| `--kui-noise-opacity` | 噪点质感层默认透明度 | 数值 | `0.035` |
| `--kui-vignette-opacity` | 暗角质感层默认透明度 | 数值 | `0.55` |
| `--kui-glass-bg` | 玻璃面板背景（.kui-glass / 菜单） | 颜色 | `rgba(16, 10, 20, 0.66)` |
| `--kui-glass-bg-strong` | 更实的玻璃背景（Header） | 颜色 | `rgba(19, 13, 23, 0.86)` |
| `--kui-glass-border` | 玻璃面板描边 | 颜色 | `rgba(244, 238, 243, 0.08)` |
| `--kui-glass-blur` | 玻璃背景模糊半径（backdrop-filter） | 长度 | `16px` |

**图标与焦点**

| Token | 含义 | 类型 | 默认值 |
| --- | --- | --- | --- |
| `--kui-icon-size` | 图标默认尺寸（.kui-icon） | 长度 | `16px` |
| `--kui-focus-ring` | 键盘焦点环（box-shadow 组合） | 阴影 | `0 0 0 1px var(--kui-bg-0), 0 0 0 3px var(--kui-accent-glow)` |


## 5. art 装饰层参考（`core/theme-art.js`）

### 5.1 顶层字段

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `motif` | string | — | 装饰母题标识（如 `clock` / `stars`），只写入 `data-kui-motif` 供调试、测试与截图命名，不参与绘制 |
| `noise` | number | — | 0~1。若为数字且 `layers` 中没有 noise 层，`theme-art.js` 会在 vignette 之前自动补一层噪点（`size: 160`、`blend: overlay`）；推荐 0.01~0.03 |
| `layers` | array | `[]` | 装饰层列表，**按数组顺序从下往上叠加**，建议最后一层放 `vignette` |
| `corner` | string | — | 预留标记：当前 6 套均为 `"cut"`，表示该主题适合斜切角质感。斜切角由组件类 `.kui-corner-cut` 绘制，不由该字段渲染 |

### 5.2 渲染模型与公共参数

`KUI.themeArt.render(art, hostEl, opts)` 在 `hostEl` 内生成 `.kui-art`，每个 `layers[i]` 生成一个 `div.kui-art__layer.kui-art__layer--<kind>`；所有参数都翻译成该层的内联 CSS 变量（`--art-*`），具体绘制由 `base.css` 第 9 节完成。

公共参数（所有 kind 都会写入，但只有部分 kind 使用）：

| 参数 | 类型 | 默认（CSS 兜底） | 说明 |
| --- | --- | --- | --- |
| `color` | 颜色 / `var(--kui-*)` | `var(--kui-accent)` | 层的绘制颜色；推荐引用 token，跟随主题自动变化 |
| `opacity` | number | `0.1` | 整层透明度（`--art-opacity`） |
| `blend` | string | `normal` | `mix-blend-mode`；发光/星/月常用 `screen`，噪点 `overlay`，暗角 `multiply` |
| `x` / `y` | 长度 / 百分比 | `50%` | 锚点位置；仅 `glow` / `moon` / `rays` 使用 |
| `size` | 长度 / number(px) | 各 kind 不同 | 尺寸语义随 kind 变化（直径 / 格子边长 / 花瓣基准大小…） |

渲染顺序即数组顺序（后者覆盖前者）。暗角建议最后、光晕建议最前；同一位置叠 3 层以上发光会发灰，需降 opacity。
`opts`：`{ inline: true }` 会额外加 `.kui-art--inline`（用于预览缩略图等「嵌在容器里」的场景）；省略时挂在 `hostEl` 内、按 `position: fixed` 铺满视口。
卸载：`var art = KUI.themeArt.render(...)`；`art.destroy()` 会移除本次生成的 DOM（幂等，可重复调用）。`KUI.themeArt.clear(hostEl)` 清理宿主内所有直接 `.kui-art` 子节点。

**宿主安全**：`hostEl` 可以是元素、`null`/`undefined`（回退 `document.body`，再回退 `document.documentElement`）。传入非元素（字符串/普通对象/已脱离文档的节点）时不会抛错，而是回退到可用祖先再挂载；页面无可用宿主时返回 `null` 并 `warnOnce`。`destroy` / `clear` 对非法入参同样安全（返回 `null`，不抛错）。因此主题卡、弹窗、iframe 页面里可以直接调用，不需要业务侧先判空。

`KUI.themeArt.kinds` 为支持的 kind 名称数组；`KUI.themeArt.roman` 为表盘罗马数字常量。

**静态预览（主题卡片 / 文档用）**：`KUI.themeArt.preview(theme, hostEl, opts)` 把某套主题的 `tokens` 写成包裹层上的**局部** CSS 变量，再内联渲染该主题的 `art`，返回 `{ el, destroy }`。它不切换全局主题、不改 `<html>` 上的 token，页面其它区域不受影响：

```js
// 卡片 / stage 需 position:relative; overflow:hidden；内容层 z-index 高于预览层
var pv = KUI.themeArt.preview(themes[i], card, { className: 'theme-card__art' });
// 卸载：pv.destroy()
```

`opts.inline: true` 时包裹层用 `position:relative`（尺寸由父级决定，适合缩略图）；默认 `position:absolute; inset:0` 铺满父容器（`z-index:0`），所以卡片内的文字节点需要 `position:relative; z-index:1` 才不会被子层压住。

### 5.3 各 kind 参数

#### glow · 径向光晕

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `size` | 长度 | `40vmax` | 光晕**直径**（CSS `--art-r`），推荐 `56vmax`~`100vmax` |
| `x` / `y` | 百分比 / 长度 | `50%` | 圆心位置 |
| `color` | 颜色 | `var(--kui-accent)` | 常用主色/点缀色 |
| `opacity` | number | `0.1` | 推荐 0.06~0.2 |
| `blend` | string | `normal` | 暗色主题推荐 `screen` |

示例：`{ "kind": "glow", "color": "var(--kui-accent)", "opacity": 0.16, "x": "84%", "y": "4%", "size": "78vmax", "blend": "screen" }`

#### grid · HUD 细网格

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `size` | number(px) / 长度 | `44` | 格子边长（`--art-size`），推荐 32~56 |
| `flat` | boolean | `false` | `true` 去掉边缘径向遮罩，网格铺满全屏（HUD 感更强） |
| `color` | 颜色 | `var(--kui-text-1)` | 推荐正文色或主色 |
| `opacity` | number | `0.1` | 推荐 0.025~0.06 |

#### rays · 放射光

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `count` | number | `12` | 光带数量，均分 360°（间距 = 360/count） |
| `rayWidth` | 长度 | 由 CSS 决定 | 单条光带宽度（`--art-ray-w`） |
| `rotate` | number(deg) / 长度 | `0` | 整体旋转角 |
| `x` / `y` | 百分比 | `50%` / `50%` | 放射中心 |
| `color` / `opacity` / `blend` | — | — | 推荐点缀色 + `blend: "screen"`，opacity ≤ 0.07 |

#### scanline · 扫描线

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `size` | number(px) / 长度 | `3` | 线距（`--art-size`） |
| `angle` | number(deg) | `0` | 线方向 |
| `speed` | 时长 | `7s` | 滚动一个周期用时；越大越慢 |
| `color` / `opacity` | — | — | 极淡（0.02~0.04），否则像故障风，违反风格红线 |

#### noise · 噪点

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `size` | number(px) / 长度 | `160` | 纹理平铺尺寸 |
| `blend` | string | `overlay` | 噪点通常用 overlay/soft-light |
| `opacity` | number | — | 推荐 0.01~0.035 |

#### vignette · 暗角

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `color` | 颜色 | `#000000` | 边缘颜色（通常纯黑） |
| `opacity` | number | `0.55` | 暗色主题 0.45~0.62；**亮色主题必须 ≤ 0.25** |
| `blend` | string | `multiply` | 暗角用 multiply 更自然 |

#### moon · 月轮 / 血月

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `size` | 长度 / number(px) | `380` | 月轮直径 |
| `glow` | 长度 / number(px) | — | 外发光半径（`--art-glow`） |
| `ring` | boolean | `false` | 是否绘制外环（`is-ring`），血月/灵装月轮建议 `true` |
| `x` / `y` | 百分比 | `50%` | 位置 |
| `color` / `opacity` / `blend` | — | — | 推荐 `var(--kui-accent)` + `screen`，opacity 0.12~0.35 |

#### stars · 星点

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `count` | number | `60` | 星点数量，建议 ≤ 150 |
| `size` | number(px) | `2` | 基准大小，单颗会随机缩放 0.45~1.35 倍 |
| `speed` | 时长 | `6s` | 闪烁基准周期，单颗随机 0.55~1.45 倍 |
| `color` / `opacity` | — | — | 推荐正文色/点缀色，opacity 0.6~0.9 |

#### sakura · 飘落樱瓣

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `count` | number | `12` | 花瓣数量，建议 ≤ 30 |
| `size` | number(px) | `10` | 花瓣基准大小（宽随机 0.7~1.35 倍、高 0.5~0.95 倍） |
| `duration` | 时长 | `16s` | 单片飘落基准时长（随机 0.75~1.35 倍） |
| `wind` | number(px) | `40` | 左右摆幅；负值反向 |
| `color` / `opacity` | — | — | 樱粉 + 玫瑰金组合，opacity 0.35~0.6 |

#### feather · 羽毛

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `count` | number | `3` | 数量，建议 ≤ 8 |
| `size` | number(px) | `110` | 羽毛**高度**；宽度自动取 `0.19 × height` |
| `drift` | 时长 | `20s` | 飘浮基准周期（随机 0.7~1.4 倍） |
| `angle` | number(deg) | `0` | 基准倾角，单根随机 ±12° |
| `color` / `opacity` | — | — | 白羽用 `var(--kui-text-1)`，金羽用 `var(--kui-accent-2)` |

#### clock · 刻刻帝表盘

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `size` | 长度 / number(px) | `560` | 表盘直径（`--art-size`） |
| `rotate` | number(deg) | `0` | 表盘整体旋转（kurumi 用 −8°） |
| `numerals` | boolean | `false` | 是否绘制 12 个罗马数字（XII、I…XI） |
| `ticks` | number | `12` | 主刻度数量 |
| `minorTicks` | number | `60` | 次刻度总数（与 `ticks` 对齐，超出部分自动跳过） |
| `hands` | object | — | `{ hour: 300, minute: 60, second: 180 }`，单位 deg，0° 指 12 点；秒针带 60s 旋转动画 |
| `gears` | `true` / array | — | `true` 用默认双齿轮；数组可自定义 `{ x, y, size, speed, reverse }` |
| `pulse` | 时长 | `12s` | 表盘呼吸动画周期 |
| `rings` | boolean | `true` | `false` 关闭三圈同心圆环 |
| `x` / `y` / `color` / `opacity` / `blend` | — | — | 表盘推荐点缀金 `var(--kui-accent-2)`，opacity 0.07~0.13 |

完整示例（`themes.json` 中 kurumi 的 `art`）：

```json
{
  "motif": "clock",
  "noise": 0.022,
  "corner": "cut",
  "layers": [
    { "kind": "glow", "color": "var(--kui-accent)", "opacity": 0.16, "x": "84%", "y": "4%", "size": "78vmax", "blend": "screen" },
    { "kind": "glow", "color": "var(--kui-accent-2)", "opacity": 0.1, "x": "8%", "y": "94%", "size": "56vmax", "blend": "screen" },
    { "kind": "grid", "color": "var(--kui-text-1)", "opacity": 0.05, "size": 44 },
    { "kind": "rays", "color": "var(--kui-accent-2)", "opacity": 0.045, "x": "50%", "y": "-10%", "count": 26, "rotate": 0, "blend": "screen" },
    { "kind": "moon", "color": "var(--kui-accent)", "opacity": 0.13, "x": "79%", "y": "17%", "size": 380, "glow": 180, "ring": true, "blend": "screen" },
    { "kind": "clock", "color": "var(--kui-accent-2)", "opacity": 0.1, "x": "91%", "y": "84%", "size": 560, "rotate": -8, "numerals": true, "ticks": 12, "minorTicks": 60, "hands": { "hour": 300, "minute": 60, "second": 180 }, "gears": true, "pulse": "12s" },
    { "kind": "feather", "color": "var(--kui-text-1)", "opacity": 0.2, "count": 4, "size": 118, "drift": "20s", "angle": -18 },
    { "kind": "scanline", "color": "var(--kui-text-1)", "opacity": 0.035, "size": 3, "angle": 0, "speed": "7s" },
    { "kind": "vignette", "color": "#000000", "opacity": 0.55 }
  ]
}
```

### 5.4 可访问性与性能约定

- 装饰层宿主带 `aria-hidden="true"`，且 `pointer-events: none`，不进入可访问性树、不拦截交互。
- `prefers-reduced-motion: reduce` 时，`base.css` 关闭装饰层与全局动画（保留静态构图），实现「装饰可见但不运动」。
- 层数建议 6~10；`stars` ≤ 150、`sakura` ≤ 30、`feather` ≤ 8、`clock` 每屏 1~2 个；过多会掉帧且视觉变脏。
- 装饰透明度必须让正文对比度达标：暗色主题 `text-1` 与 `bg-1` ≥ 4.5:1，主色与背景 ≥ 3:1（控件边框/焦点可见）。
- 装饰层布局由 `art` 配置哈希出的稳定伪随机种子生成：**同一配置每次渲染布局一致**，不会刷新就重排；切换主题会 `destroy` 旧层再 `render` 新层。

### 5.5 新增一种 kind 需要改什么

只有「现有 11 种 kind 不够用」时才需要改代码，且三处必须同步（缺一处主题不生效或文档失真）：

1. `src/styles/base.css` 第 9 节：新增 `.kui-art__layer--<kind>` 的绘制规则与 `--art-*` 变量消费；
2. `src/core/theme-art.js`：在 `builders` 注册 `<kind>` 构建函数；层工厂 `layerEl()` 已统一处理公共参数；
3. `docs/04-theme.md` 第 5.3 节：补参数表与示例。

数值与几何参数一律从 `layer` 读取，不要写死颜色/主题相关常量（结构性缺省只能放在 `FALLBACK`，并注明「不是主题值」）。

## 6. 如何新增 / 调整主题（只改 JSON）

### 6.1 步骤

1. 打开 `src/themes.json`，复制一套最接近的主题对象（例如新主题是暗色时钟风就复制 `kurumi`）。
2. 改 `id`（小写 kebab-case，唯一、稳定；**不要改名**，`localStorage` 持久化用它，改名会让老用户回退默认主题）、`name`、`desc`。
3. 定 `scheme`：`dark` 或 `light`；`theme.js` 会写到 `<html data-kui-scheme>`，`base.css` 据此设置 `color-scheme`（决定原生滚动条/表单控件配色）。
4. 调 `tokens`：**只写需要覆盖的**。推荐直接保留近邻主题的 64 个外观 token 再逐项替换；字体/尺寸/动效 token 与主题无关，一般不要覆盖。可以省略 `--kui-` 前缀但推荐保留。
5. 写 `art`：选 `motif`、可选 `noise`（0~1）、`corner`、`layers` 数组（第 5 节）；颜色用 `var(--kui-*)` 引用 token。
6. 写 `preview`：`{ bg, accent, accent2, text }` 四个色值，供主题选择器卡片显示。
7. 更新顶层 `default`（如需换默认主题）与 `version`。
8. 自测（第 6.3 节），改完**不需要动任何 CSS/JS**。

### 6.2 最小模板

```json
{
  "id": "my-theme",
  "name": "主题中文名",
  "desc": "一句话定位（会显示在主题选择器）",
  "scheme": "dark",
  "preview": { "bg": "#08050a", "accent": "#c8102e", "accent2": "#d4af37", "text": "#f4eef3" },
  "tokens": {
    "--kui-bg-0": "#08050a",
    "--kui-bg-1": "#0d080f",
    "--kui-bg-2": "#130d17",
    "--kui-accent": "#c8102e",
    "--kui-accent-2": "#d4af37",
    "--kui-text-1": "#f4eef3",
    "--kui-text-2": "#bfaebd"
  },
  "art": {
    "motif": "clock",
    "noise": 0.02,
    "corner": "cut",
    "layers": [
      { "kind": "glow", "color": "var(--kui-accent)", "opacity": 0.16, "x": "84%", "y": "4%", "size": "78vmax", "blend": "screen" },
      { "kind": "grid", "color": "var(--kui-text-1)", "opacity": 0.05, "size": 44 },
      { "kind": "vignette", "color": "#000000", "opacity": 0.55 }
    ]
  }
}
```

> 上例为了短只覆盖 7 个 token；正式主题建议至少补全 `bg-*`、`text-*`、`accent*`、`border*`、`control-*`、`popup-*`、`scrollbar-*`，否则会继承 kurumi 兜底值，出现「一半深一半浅」的违和感。

### 6.3 规则与自测

必须满足：

- `id` 唯一；6 套内置主题的 id 固定为 `kurumi`、`kurumi-angel`、`starry`、`sakura`、`abyss`、`dawn`，不要复用。
- `scheme` 与色板一致：亮色底必须 `light`，否则原生控件/滚动条配色会错。
- 颜色自洽：正文与背景对比 ≥ 4.5:1；`accent` 与背景 ≥ 3:1；`control-bg`、`control-border` 在背景上可见。
- 亮色主题：`vignette` opacity ≤ 0.25、`scanline` opacity ≤ 0.04、阴影更柔（参考 `dawn` / `kurumi-angel`）。
- `art.layers` 6~10 层，末尾放 `vignette`；色值优先引用 token。
- 每套主题的 `tokens` 键数保持一致（当前 6 套均为 64 个外观 token），便于维护与对比。

自测命令（项目根目录）：

```bash
# 1) JSON 可解析（Node 13.14）
node -e "JSON.parse(require('fs').readFileSync('src/themes.json','utf8')); console.log('ok')"

# 2) 零外链 / 兼容性检查（若脚本存在）
node tools/check-assets.js
node tools/check-compat.js

# 3) 截图核对（本机 Chrome / Edge）
node tools/screenshot.js --pages=index.html --theme=my-theme --size=1600x1000

# 4) 跑到 http 服务后，用 URL 参数快速预览
#    http://127.0.0.1:<port>/index.html?kuiTheme=my-theme
```

## 7. 主题切换 API（`KUI.theme`）

### 7.1 一行初始化

```js
// themesData 来自 src/themes.json（或 KUI.config 载入后的数据）
var theme = KUI.theme.init(themesData, { storageKey: 'kui-theme' });
theme.id;   // 实际生效的主题 id
```

`init(data, opts)` = `load(data)` + 解析初始主题 + `apply(...)`。初始主题解析优先级：**URL `?kuiTheme=` > `localStorage` > `opts.fallbackId` > 默认主题**。
`opts`：`id`（强制指定）、`fallbackId`、`storageKey`、`persist: false`（关闭持久化），其余字段透传给 `apply`（`transition` / `broadcast` / `silent` / `artHost`）。

### 7.2 `apply(id, opts)`

| opts | 默认 | 说明 |
| --- | --- | --- |
| `silent` | `false` | `true` 时：不写 `localStorage`、不向 iframe 广播、不派发 `<html>` 的 `kui:themechange` DOM 事件；`theme.on('change')` 与 `KUI.bus` 仍会触发（供页面内组件更新 UI）。用于 iframe 被父页驱动、避免「iframe 再持久化/再广播」回环 |
| `persist` | `true` | 是否写入 `localStorage`（`silent: true` 时一律不写） |
| `transition` | `true` | 是否给 `<html>` 加 `.kui-theme-transition`（340ms 颜色过渡，见 7.6）；截图/测试建议关掉 |
| `broadcast` | `true` | 是否向页面内所有 `iframe` 广播 `theme:apply` |
| `artHost` | `#kui-art-host` | 自定义装饰层宿主；`undefined` 时自动创建 |

- 返回实际生效的主题对象；`id` 不存在时回退默认主题并 `warnOnce`。
- 切换流程：写新 token → 移除旧主题多余 token → 设 `<html data-kui-theme/data-kui-scheme>` → `destroy` 旧装饰层并渲染新层 → 持久化 → 触发 change 事件 → 广播 iframe。

### 7.3 查询与遍历

| 方法 | 返回 / 行为 |
| --- | --- |
| `list()` | 轻量主题清单（`id/name/desc/scheme/preview/tokens`），给选择器渲染卡片 |
| `ids()` / `get(id)` / `has(id)` / `count()` | id 列表 / 主题对象 / 是否存在 / 数量 |
| `defaultId()` | 默认主题 id |
| `current()` / `currentId()` / `currentTokens()` | 当前主题对象 / id / tokens |
| `tokensOf(id)` | 指定 id 的 tokens **浅拷贝**（供 iframe / iframe 外的主应用回查）；id 省略取当前主题，找不到返回 `null` |
| `next()` / `prev()` / `toggleScheme()` | 按清单循环 / 在 dark↔light 之间切换 |
| `resolveInitial(fallbackId)` | 只解析初始 id，不应用（启动脚本可用） |

### 7.4 只写 token：`applyTokens(tokens)`

```js
// iframe 内收到父级消息后同步换肤；不切主题、不重建装饰层、不广播
KUI.theme.applyTokens(payload.tokens);
```

适合「父页换肤，业务 iframe 跟随」以及高频调色预览；它同样只接受 `--kui-*` 变量（键会自动规范化），并会移除上次写入但本次缺失的变量。

### 7.5 事件与 iframe 广播

```js
KUI.theme.on('change', function (detail) {
  // detail: { id, theme, tokens, scheme, previousId }
});
KUI.theme.once('load', function (detail) { /* detail: { count, defaultId } */ });

// 全局事件总线（与其它模块解耦）
KUI.bus.on('theme:change', function (detail) { /* … */ });

// DOM 事件（apply 默认触发，silent:true 可关）
document.documentElement.addEventListener('kui:themechange', function (ev) {
  // ev.detail 同上
});
```

父页 → iframe 的同步消息（`targetOrigin: '*'`，`theme.js` 自动发送给页面内所有 `iframe`）：

```json
{ "__kui": true, "type": "theme:apply", "payload": { "id": "starry", "name": "星夜观测", "desc": "…", "scheme": "dark", "tokens": { "…": "…" }, "art": { "…": "…" }, "defaultId": "kurumi" } }
```

- payload 里的 `tokens` 已合并该主题全部 64 个外观 token（可直接 `applyTokens`）；`id/name/desc/scheme/art/defaultId` 便于 iframe 侧完整重建主题状态（气泡里的主题名、卡片预览、`KUI.theme.load` 后查表）。
- 业务 iframe 内的 `src/frame/kui-frame.js` 监听该消息并调用 `KUI.theme.applyTokens(payload.tokens)`；需要连装饰层一起重建时改用 `KUI.theme.apply(payload.id, { silent: true, persist: false, broadcast: false, transition: false })`（前提是 iframe 内已各自 `load` 了主题数据）；
- **新 iframe 加载完成后**请调用 `KUI.theme.broadcast()` 补推一次当前主题（对话框/首次打开的标签页）；
- 主题切换时父页已自动广播（`silent: true` 除外），无需业务侧额外处理。

### 7.6 持久化、URL 与过渡

- `localStorage` key 默认 `kui-theme`；`setStorageKey()` / `setPersist(false)` / `clearPersisted()` 可配置。
- `?kuiTheme=<id>` 用于快速预览；若该 id 存在，`resolveInitial()` 优先采用，并在后续 `apply` 时按 `persist` 写入 `localStorage`（分享预览链接后请提示用户切换）。
- 切换主题时 `<html>` 会短暂挂 `.kui-theme-transition`（`theme.js` 340ms 后移除），`base.css` 第 11 节用 320ms 过渡颜色/背景/描边/阴影；`apply(id, { transition: false })` 可关闭（截图、自动化测试用）。
- 装饰层**不参与**过渡：切换时直接 `destroy` → `render`，避免大量 DOM 同时过渡造成卡顿。

### 7.7 错误与回退

| 情况 | 行为 |
| --- | --- |
| 尚未 `load` 任何主题 | `apply` 返回 `null` 并 `warnOnce` 提示先载入 |
| `id` 不存在 | 回退默认主题（或第一套），`warnOnce` 记录缺失 id |
| `art` 为空或 `KUI.themeArt` 未载入 | 跳过装饰层，仅切换 token（不报错） |
| 单个装饰层渲染失败 | 捕获异常并 `KUI.error`，其余层继续渲染 |
| `KUI.themeArt` 宿主非法 | 回退 `document.body` → `document.documentElement`；全不可用返回 `null` 并 `warnOnce`（不抛错） |

### 7.8 父页 ↔ iframe 主题同步协议

文档主应用与业务 iframe（标签页 / 弹窗）约定一套轻量消息协议：**主题状态只在父页持久化，iframe 只跟随**。

| 方向 | type | payload | 说明 |
| --- | --- | --- | --- |
| 父 → 子 | `theme:apply` | `{id,name,desc,scheme,tokens,art,defaultId}` | 主题切换时自动广播；`silent:true` 时不发 |
| 父 → 子 | `theme:change` | 同 `theme:apply` | 兼容旧版监听别名（`kui-frame.js` 两者都收） |
| 父 → 子 | `tab:init` / `dialog:init` | `{…, theme:{id,tokens}}` | iframe 就绪时父页补推当前主题 |
| 子 → 父 | `theme:request` / `dialog:theme-request` | `{}` | iframe 主动请求同步 |

- 统一信封 `{__kui:true,type,requestId,payload}`，`targetOrigin: '*'`（本地 UI 框架，端口可变）；
- iframe 收到后一般只调 `KUI.theme.applyTokens(payload.tokens)`；若 payload 带完整主题数据且 iframe 内已 `load` 过主题，也可 `KUI.theme.apply(id, { silent: true, persist: false, broadcast: false, transition: false })` 连装饰层一起重建；
- **iframe 不要**把父页主题写回自己的 `localStorage`（`silent:true` 已保证不写），`?kuiTheme=` 只用于父页预览；
- **iframe 内主题装饰层如何重绘**：装饰层 DOM 完全由 `themes.json` 里该主题的 `art` 配置生成，跨 iframe 不需要任何额外资源。iframe 需要（a）自己加载 `core/theme.js` + `core/theme-art.js` + `src/themes.json` 并 `theme.load(...)`，或（b）至少用 `applyTokens(payload.tokens)` 同步颜色；等父页把完整 `art` 一起广播过来后，iframe 执行 `KUI.theme.apply(payload.id, { silent: true, persist: false, broadcast: false, transition: false })` 即可在 iframe 的 `#kui-art-host` 里按同一份 `art` 重建装饰层（`theme.js` 会先 `destroy` 旧层再 `render`）。宿主缺失或非法时 `theme-art.js` 会安全回退/返回 `null`，不会中断父页主题流程；
- **新 iframe 就绪前**父页发的消息可能丢失：iframe `load` 后主动发 `theme:request`，父页收到后回一条 `theme:apply`。

## 8. 视觉验收与自测

```bash
# 逐套截图（输出 .shots/*.png；本机 Chrome/Edge 自动探测，可用 KUI_BROWSER 指定）
node tools/screenshot.js --pages=index.html --size=1600x1000
node tools/screenshot.js --pages=index.html --theme=kurumi-angel
node tools/screenshot.js --pages=index.html --theme=starry
node tools/screenshot.js --pages=index.html --theme=sakura
node tools/screenshot.js --pages=index.html --theme=abyss
node tools/screenshot.js --pages=index.html --theme=dawn
```

逐项检查清单：

1. **零外链**：Network 面板无图片/字体/CDN 请求；装饰层全部由 CSS/SVG 生成。
2. **铺底正确**：`.kui-art` 位于内容之下（`z-index` 0），内容层 `z-index ≥ 1`；页面无横向滚动条。
3. **token 生效**：切主题后 `getComputedStyle(document.documentElement).getPropertyValue('--kui-accent')` 变化；旧主题独有的 token 不残留。
4. **焦点与选中**：滚动条、`::selection`、`:focus-visible` 焦点环跟随主题主色。
5. **降级**：系统开启「减少动态效果」后装饰层不运动（保留静态构图）。
6. **可读性**：正文在装饰层上仍清晰；亮色主题暗角/扫描线不压暗正文。
7. **iframe 同步**：打开弹窗/业务页后切换主题，iframe 内颜色跟随（`kui-frame.js` 生效）。
8. **对比度**：正文 ≥ 4.5:1，主色与背景 ≥ 3:1。

### 8.1 本机人工核对（沙箱内无法启动 headless 时）

本仓库的开发沙箱可能禁止 Chromium 创建命名管道（表现为 crashpad `OpenProcess: 拒绝访问`、脚本退出码异常或截图为空），此时改用人工核对：

1. 仓库根目录执行 `npm start`，浏览器打开终端输出的地址（默认 `http://127.0.0.1:8080/`）；
2. 依次切到每一套主题（或直接访问下表地址），按上面 1~8 项清单逐条检查；
3. 重点看：主色是否落到焦点/选中/关键按钮，装饰层是否压住正文，亮色主题的暗角/扫描线是否过重。

| 主题 | 地址 | 该主题应看到的重点 |
| --- | --- | --- |
| `kurumi`（默认） | `/` | 暗夜玻璃、绯红主色、金色刻刻帝（罗马数字/60 刻度/指针/齿轮）、血月、HUD 细网格 |
| `kurumi-angel` | `/?kuiTheme=kurumi-angel` | 奶白底、淡金描边、白羽飘落；亮色正文对比度 |
| `starry` | `/?kuiTheme=starry` | 深蓝紫底、星点闪烁、冷色焦点环 |
| `sakura` | `/?kuiTheme=sakura` | 樱粉主色、花瓣飘落、灰紫第三色 |
| `abyss` | `/?kuiTheme=abyss` | 墨绿黑底、毒绿只做 1px 线、青铜刻刻帝（只留指针与刻度） |
| `dawn` | `/?kuiTheme=dawn` | 暖白底、暖金日轮/放射光、绯红主色 |

另外：`standalone/theme.html` 可一屏对比 6 套主题的 token 色块；`pages/theme.html` 是 iframe 内的切换演示。
切主题后刷新页面应记住选择（`localStorage['kui-theme']`）；`?kuiTheme=` 只用于预览，不写回存储（见 7.6）。

### 8.2 主题 token 完整性自检

每套主题的 `tokens` 当前固定为 **64 个外观 token**，构成如下：

| 分类 | 数量 | 说明 |
| --- | --- | --- |
| 契约 §10 外观类 | 56 | 背景/文字/主次强调/语义/描边遮罩/阴影发光/控件皮肤/滚动条/弹层/日历选项 |
| task-9 增补 · 语义前景色 | 4 | `--kui-on-accent` / `--kui-on-success` / `--kui-on-warning` / `--kui-on-danger` |
| base.css 扩展 · 玻璃质感 | 4 | `--kui-glass-bg` / `--kui-glass-bg-strong` / `--kui-glass-border` / `--kui-glass-blur` |

**不在 `themes.json` 中重复**的是跨主题统一的结构类 token，由 `base.css :root` 兜底：

- 契约内 34 个：字体栈/字号/行高/字距、圆角、边框宽度、动效时长与缓动、控件尺寸与内边距、滚动条尺寸、弹层圆角与层级；
- 22 个扩展 token 中 18 个：菜单/头部/标签栏/iframe 尺寸、z-index、斜切角尺寸、噪声/暗角透明度、图标尺寸、焦点环。

所以「缺 token」只可能发生在新增主题漏写外观 token 时：缺失项会自动 fallback 到 kurumi 的 `base.css` 默认值（不报错，但视觉会混入默认主题）。提交前在仓库根目录执行（node13 或系统 node 均可）：

```bash
node -e "var fs=require('fs');var b=fs.readFileSync('src/styles/base.css','utf8');var t=JSON.parse(fs.readFileSync('src/themes.json','utf8'));var head=/:root\s*\{([\s\S]*?)\n\}/.exec(b)[1];var keys=[];head.replace(/(--kui-[a-z0-9-]+)\s*:/g,function(m,n){if(keys.indexOf(n)<0)keys.push(n);return m});var req=Object.keys(t.themes[0].tokens);var bad=0;t.themes.forEach(function(th){var miss=req.filter(function(k){return !(k in th.tokens)});var unk=Object.keys(th.tokens).filter(function(k){return keys.indexOf(k)<0});if(miss.length||unk.length){bad++;console.log('FAIL',th.id,'missing:',miss.join(',')||'-','unknown:',unk.join(',')||'-')}});if(!bad)console.log('OK: '+t.themes.length+' themes, '+req.length+' tokens each');"
```

输出 `OK: 6 themes, 64 tokens each` 即通过；`FAIL` 行会列出缺失或拼错的 token 名。

另外两个探针（`.tools/` 下，node13 或系统 node 均可跑）：

```bash
# 6 套主题逐套 apply，打印 on-* 对比度（阈值 4.5:1）、tokensOf 数量、themeArt 宿主安全
node .tools/probe-on.js
# token 引用审计：三个 CSS 里所有 var(--kui-*) 引用 vs base.css :root 定义
node .tools/audit-tokens.js
```

`probe-on.js` 输出 `OK: 6 套主题 on-* 对比度 >= 4.5:1，tokensOf 返回 64 token，themeArt 宿主安全` 即通过。审计数据与修复记录见附录 A。

## 9. 维护铁律（Checklist）

- [ ] 组件样式只写 `var(--kui-*)`；**禁止** `.theme-*` / `[data-kui-theme] .component` 等主题分支选择器。
- [ ] 新增 token：先 `base.css` `:root` 补默认值，再按需在 `themes.json` 覆盖；同步契约 §10 与本文第 4 节 token 表。
- [ ] 改装饰层 DOM 契约（`base.css` 第 9 节 ↔ `theme-art.js`）必须双向同步，并补/改第 5.5 节。
- [ ] 改 `themes.json` 后：JSON 解析自测 + 六套主题截图核对（第 6.3 / 8 节）。
- [ ] 文案一律进 `config/text.json`（`KUI.text`），颜色一律进 `themes.json`；代码里不写死文案/主题色。
- [ ] `data-kui-theme` / `data-kui-scheme` 只用于调试、测试与 iframe 识别，**不用于样式**。
- [ ] 保持 `id` 稳定、`tokens` 键数一致（当前 64 个外观 token/套）、`art` 层数 6~10。

## 附录 A · token 引用审计与对比度验收（task-9）

### A.1 方法

脚本 `.tools/audit-tokens.js` 扫描 `src/styles/base.css`、`src/styles/controls.css`、`src/styles/components.css` 中**所有** `var(--kui-*)` 引用，与 `base.css :root` 全部定义（含任意位置的 `--kui-*` 定义）求差集；`.tools/probe-on.js` 逐套 apply 6 主题并计算 WCAG 对比度。

### A.2 引用统计

| 文件 | `var(--kui-*)` 引用数 | 涉及唯一 token | 引用但完全未定义且无 fallback |
| --- | --- | --- | --- |
| `base.css` | 239 | 96 | 0 |
| `controls.css` | 1140 | 97 | 0 |
| `components.css` | 483 | 73 | 0 |
| **合计** | **1862** | — | **0** |

结论：**不存在「引用了未定义、又没有 fallback」的 token**，用户看到的「按钮变黑 / 文字与背景同色 / 箭头看不见」根因不是 token 拼写，而是：① 语义填充色直接配 `--kui-text-1` / `--kui-text-inverse`（浅主色主题上对比不足）；② 控件 hover 的通用背景规则覆盖了 `--kui-btn--success/warning` 的实心底色；③ 部分局部变量（`--ctl-arrow` 等）作用域安全、无需处理。

差集其余两类（均为设计内）：

- **42 个**完全未定义但有 fallback：`--art-*`（由 `theme-art.js` 逐层内联注入）与组件局部参数（`--p-*` / `--s-*` / `--f-*` / `--rot` / `--kui-line-clamp` 等，由 JS/内联样式提供），CSS 里都写好了兜底；
- **2 个**仅局部定义、无 fallback：`--ctl-arrow`、`--ctl-arrow-size`，定义在 `controls.css:50-51` 的 `.kui-control` 作用域内，8 处引用（`controls.css` 761/769/770/951/952/953/962/963）全部位于控件根节点之内，安全。

### A.3 修复清单（task-9）

1. `src/styles/base.css` `:root` 新增 `--kui-on-accent/success/warning/danger`（kurumi 默认值 `#f4eef3` / `#0a060c` / `#0a060c` / `#0a060c`）；契约 token 90 → 94，`:root` 定义总数 112 → 116。
2. `src/themes.json` 6 套主题各补 4 个 `--kui-on-*`（外观 token 60 → 64），见 A.4 对比度表；未调整任何基础色板。
3. `src/core/theme.js`：`apply` 的 `silent:true` 扩展为「不持久化 / 不广播 / 不派发 `kui:themechange`」，`theme.on('change')` 与 `KUI.bus` 仍触发；`theme:apply` payload 增补 `name/desc/defaultId`；新增 `tokensOf(id)`（浅拷贝，供 iframe/主应用回查）。
4. `src/core/theme-art.js`：新增 `resolveHost()` 宿主回退与 `render/preview/clear` 的非法宿主安全处理；修复 `preview()` 内部 `render` 未定义的问题。
5. 控件侧（controls 已落地，本文件仅记录）：实心语义按钮/徽标改用 `var(--kui-on-*, var(--kui-text-inverse))`（现有 13 处 `--kui-on-*` 引用）；`--kui-btn--success/warning` 的 `:hover` / `:active` 已显式重设 `background` 与 `border-color`，不再被通用 `:hover` 背景覆盖。
6. 框架侧（shell 待改）：`kui-frame.js:217` 调用了不存在的 `KUI.theme.tokens()`，建议改为 `K.theme.currentTokens()` 或 `K.theme.tokensOf(id)`（theme.js 已提供，返回 tokens 浅拷贝）；`theme.tokens` 兜底对象当前为空，实际同步靠父页广播的 `theme:apply` payload（已含完整 tokens），不影响主流程但属死代码。

### A.4 6 套主题 on-* 对比度（WCAG，阈值 4.5:1）

| 主题 | on-accent | on-success | on-warning | on-danger |
| --- | --- | --- | --- | --- |
| `kurumi` | 5.15 | 8.35 | 9.28 | 4.79 |
| `kurumi-angel` | 5.87 | 4.81 | 5.29 | 5.45 |
| `starry` | 6.94 | 9.17 | 10.27 | 5.94 |
| `sakura` | 6.73 | 8.98 | 9.56 | 5.67 |
| `abyss` | 8.97 | 8.97 | 8.56 | 4.92 |
| `dawn` | 5.02 | 5.18 | 5.84 | 5.12 |

全部 ≥ 4.5:1（最低为 kurumi `--kui-on-danger` 4.79）；`probe-on.js` 复跑输出 `OK: 6 套主题 on-* 对比度 >= 4.5:1`。

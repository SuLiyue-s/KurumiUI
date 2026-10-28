# 04 · 配置总览 + app.json 全字段

> 适用版本：KurumiUI v1.3.8 ｜ 前置章节：[03-assembly.md](03-assembly.md) ｜ 阅读时长：约 40 分钟

## 本章目标

- 说清 `config/` 下 6 类配置的职责与「改完必须重建 `bundle.js`」的原因；
- 查得到 `config/app.json`（755 行、12 键）任意字段的类型、默认值、作用与生效时机；
- 会改 7 类常见配置并预判变化，识别「写了却不生效」的字段。

## 0. 一句话概念

**`config/app.json` 是应用外壳的唯一事实来源**：布局、菜单树、顶部导航、标签页、文案、默认主题、头像与设置弹窗都在这里；JS 只负责把 JSON 渲染成 DOM。

```text
config/app.json → build:config → config/bundle.js → KUI.config 缓存 → bootstrap → app-shell
```

---

## 1. 配置体系总览

### 1.1 config/ 下有什么

| 文件 | 职责 | 消费/生成方 |
| --- | --- | --- |
| `config/app.json` | 外壳全部配置（755 行、12 键） | `bootstrap.js:727-745`、`app-shell.js:141-146` |
| `config/text.json` | 全量文案字典（40 组，见 §7；含 v1.3.8 新增的 `boot` 组） | `bootstrap.js:767-769` → `KUI.i18n.set` |
| `src/themes.json` | 6 套主题 token（**不在 config/ 下**） | `theme.js:201` 载入、`:297` 应用 |
| `config/demos/*.json` | 11 份示例数据，页面数据源，外壳不加载 | `KUI.config.load('demos/xxx')`（`pages/form.html:195-197`） |
| `config/bundle.js` | 构建产物 `__KUI_BUNDLE__={app,text,themes,demos,meta}` | `config.js:82-96` 兜底读；勿手改 |
| `config/kui-modules.json` | 模块清单 + 装配 profile（28/27 文件） | `tools/build-all.js` → `kui-all.js` |

路径写死在 `config.js:25-31`；`config.js:73-77` 把 `demos/xxx` 映射到 `config/demos/xxx.json`。主题默认值在 `app.json.theme.default`，token 在 `src/themes.json`（见 [09-theme.md](09-theme.md)）。

### 1.2 KUI.config 读取管线

`load(name)`（`config.js:148-212`）依次：① 内存缓存（非 `force`）→ ② 同文件并发合并 → ③ 注入读取器 `setReader`（Node 测试）→ ④ 非浏览器直读 `__KUI_BUNDLE__` → ⑤ http(s) `fetch`（`cache:'no-cache'`，失败回退 bundle 并 `warnOnce('cfg-fallback:'+name)`，`config.js:175-194`）→ ⑥ file:// 先读 bundle 再试 fetch，失败报“请运行 `npm run build:config` 或使用 `npm start`”（`config.js:195-207`）。解析失败返回 `null` 并 `KUI.error`（`:98-106`）；只有 `app.json` 缺失才致命（`bootstrap.js:771-773`）。

### 1.3 改完必须重建：三步生效链

`① 改 app.json → ② npm run build:config → ③ 刷新`；② 展开为 `build-config.js && build-all.js`。`npm start` 启动时自动重建（`server.js:236-248`），所以本地常“改了刷新就生效”；但 **file:// 或 fetch 失败时读的是 `bundle.js` 快照**，不重建就是旧配置。bundle 头部含 `meta.generatedAt` 与“自动生成，请勿手工编辑”（`tools/build-config.js:94-97`），重建后约 114 KB。

### 1.4 点路径取值与文案读取

`KUI.config.get(dotPath, fallback)`（`config.js:252-271`）**只读缓存、不触发加载**：前缀表示文件（`app.`/`text.`/`themes.`），前缀后的路径相对**文件根**而非 `app` 节点，所以读标题要写 `get('app.app.title')`；无前缀时先 `app.json` 再 `text.json`；只有 `undefined/null` 才回退 `fallback`。

```js
KUI.config.get('app.app.title');           // → "刻刻帝终端"
KUI.config.get('app.ui.tooltip.maxWidth'); // → 340
KUI.config.get('menu.footerDefault');      // 无前缀 → "灵装回路 · 在线"
KUI.config.get('app.home', 'pages/home.html'); // ⚠️ 读 app.json 根（不存在）→ 兜底值
```

最后一行是最常踩的坑：`get('app.home')` 返回 fallback——`app-shell.handlers.js:96-98` 正这么写，恰好兜底值相同。读应用元信息请写 `get('app.app.home')`。

文案用 `KUI.text(key, fallback, vars)`（`kui.js:446-451`）：查 `text.json` 与 `app.json.text` 深合并后的字典，`undefined/null/''` 回退 `fallback`，仍空返回 key，最后做 `{name}`/`{0}` 替换（`kui.js:454-464`）。

### 1.5 schema 与版本契约

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `schema` | string | `"kurumi-app/1"` | 否 | 格式版本标记（`app.json:2`）。运行时**无读取/校验**，改它不改变行为；构建脚本只校验 `config/kui-modules.json` 的文件存在性。 |

### 1.6 app.json 顶层结构地图

- `app`（3-18）名称/标题/版本/首页/启动层 → `bootstrap.js:689-718`、`app-shell.js:237-268`
- `ui`（19-37）tooltip/toast/dialog 全局默认 → `bootstrap.js:727-745`
- `boot`（38-48）启动层（加载中页面）与时钟指针动画 → 设计由 `bootstrap.js` 启动流程消费，但 **v1.3.8 存在接线缺口（配置不生效）**，详见 §8.5 与 [16-boot.md](16-boot.md) §5.5
- `dialogs`（49-177）弹窗预设（只有 settings）→ `bootstrap.js:627-665`
- `theme`（178-198）默认主题/存储键/选择器 → `bootstrap.js:782-795`（picker 未消费，§6）
- `layout`（199-210）菜单/头部/标签栏/间距尺寸 → `app-shell.js:146-193`
- `menu`（211-616）左侧菜单（品牌/树/页脚）→ `app-shell.js:237-258` → `menu.js`
- `menunav`（617-669）顶部导航（面包屑/动作）→ `app-shell.js:260-271` → `menunav.js`
- `tabs`（670-704）标签页（初始/上限/保活）→ `app-shell.js:273-275,539-550` → `tabs.js`
- `text`（705-719）对 text.json 的增量覆盖 → `bootstrap.js:767-769`
- `avatar`（720-754）头像（URL/齿轮框/选择器）→ `app-shell.js:253-256` → `menu.js` → `avatar.js`

---

## 2. 节点通用字段（外壳三节点 + 菜单树）

KurumiUI 的“节点”没有强类型 schema，字段由渲染器按需读取；下表覆盖 `menu`/`menunav`/`tabs` 与菜单树 item 的常用字段。

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `type` | string | — | 是（渲染节点） | 渲染器类型（注册表 41 个；外壳用 `app-shell/menu/menunav/tabs`），菜单树内为 `item/group/divider`（`menu.js:282-293`） |
| `id` | string | 自动生成 | 否 | 节点/菜单项标识；tab id、表单字段 id、菜单激活 id 共用 |
| `props` | object | `{}` | 否 | 组件属性包；**外壳三节点只读它**（`app-shell.js:76-85`） |
| `label` | string | — | 否 | 菜单项/分组/表单项显示文字（`menu.js:300,326`） |
| `icon` | string | 子级 `chevron-right`、顶层 `list`（`menu.js:325`） | 否 | 图标 id（图标表见 06） |
| `children` | array | — | 否 | 子节点数组，结构同 `items`（`menu.js:302,344`） |
| `target` / `tab` | object | — | 否 | 点击后的统一动作；`{tab:{...}}` 是 `tab.open` 语法糖（`menu.js:560-565`）。优先级 `target.tab` > `tab` > `{id,label,url,icon,pinned}`（`menu.js:504-514`） |
| `url` | string | — | 否 | 仅 `target:'blank'` 且有 `url` 时新窗口打开（`menu.js:563-565`） |
| `on` | object | — | 否 | 事件→动作映射，如 `{"click":{"action":"theme.picker"}}`；完整语法见 [10-actions-handlers.md](10-actions-handlers.md) |
| `visible` / `disabled` | boolean | `true` / `false` | 否 | `visible` 只有部分渲染器读（`menunav.js:444`、表单项见 07），**外壳三节点不生效**；`disabled` 禁用菜单项/动作（`menu.js:315,323`、`menunav.js:468`） |
| `badge` / `badgeType` | string | — | 否 | 角标文字与配色变体（`menu.js:328-331`、`menunav.js:463-466`） |
| `class` / `style` | string / object | — | 否 | 节点级样式类/内联样式，由通用渲染器处理（`kui.js:477-495`） |

两个结构性约束：**外壳三节点只认 `type`+`props`**（`componentConfig` 只复制这两个字段，`id/on/visible/class` 丢弃；`mountWrapper` 也只传 `props` 给 `KUI[type].create`，`app-shell.js:76-85,565-570`）；平铺字段不写 `type/props` 时整份对象被当 `props`（`:84`）——能用但不推荐。

---

## 3. app.*：应用元信息

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `name` | string | `"KurumiUI"` | 否 | 应用名。启动层标题（`bootstrap.js:697-701`）、品牌区兜底（`app-shell.js:240-244`）、`app.info`（`app-shell.handlers.js:126-128`） |
| `title` | string | `"刻刻帝终端"` | 否 | 应用标题。品牌/顶部导航标题默认（`:268-269`）；渲染后**改写 `document.title`**（`:535-537`），优先于 `documentTitle`；启动层标题实际取 `name` |
| `subtitle` | string | `"灵装回路 · 时间结界控制台"` | 否 | 启动层副标题（`bootstrap.js:697-701`）、品牌/导航副标题默认（`:242,269`）；缺省回退 `text.app.subtitle` |
| `version` | string | `"1.0.5"` | 否 | **未消费**。版本展示请写 `menu.props.footer.version`（`app.json:596`） |
| `documentTitle` | string | `"刻刻帝终端 · KurumiUI"` | 否 | 浏览器标题兜底：仅 `title` 缺失时生效（`bootstrap.js:692-695`），实际被 `title` 覆盖 |
| `logoIcon` | string | `"clock"` | 否 | 仅 `menu` 节点**没有** `props.brand` 时兜底品牌区图标（`app-shell.js:239-244`）；也作头像 `fallbackIcon` 兜底（`menu.js:180`） |
| `logoText` | string | `"KUI"` | 否 | **未消费**（`text.json` 另有同名键）；品牌区只渲染 `logoIcon+title`，不显示文字 logo |
| `home` | string | `"pages/home.html"` | 否 | 首页地址。**注意**：`app.home` 动作读取点写成 `get('app.home')`（`app-shell.handlers.js:96-98`），因 §1.4 前缀规则永远取兜底值，改本字段不影响该动作；业务代码请读 `get('app.app.home')` |
| `copyright` | string | `"© KurumiUI · 刻刻帝终端"` | 否 | **未消费**。页脚版权写 `menu.props.footer`（`menu.js:733-749` 只渲染 `title/version/actions`，`footer.subtitle` 也不消费） |
| `loading` | object | `{"icon":"spinner","text":"灵装回路接通中…","delay":120}` | 否 | **全部未消费**：启动层文案由 `index.html` 静态 DOM + `KUI.text('boot.loading', 原文本)` 决定（`bootstrap.js:700-701`），属配置契约保留位 |

> “未消费”字段写入不报错、也不改界面（无运行时校验）；判断生效最快的方式是 `grep -n "字段名" src/`。

---

## 4. ui.*：组件级默认值

`bootstrap.js:727-745` 在创建外壳**之前**把 `ui.tooltip/toast/dialog` 分别传给 `KUI.tooltip.configure`、`KUI.toast.config`、`KUI.dialog.config`，改的是“全局默认值”（启动时生效），单个组件仍可覆盖；配置抛错只 `warnOnce`。

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `ui.tooltip.enabled` | boolean | `true` | 否 | 全局开关（`tooltip.js:36-46`）；`false` 后不再接管 `title`，浏览器原生提示生效 |
| `ui.tooltip.delay` / `hideDelay` | number(ms) | `140` / `60` | 否 | 显示延迟 / 移出后隐藏延迟（防抖动） |
| `ui.tooltip.offset` / `maxWidth` | number(px) | `10` / `340`（源码默认 300） | 否 | 气泡与目标距离 / 最大宽度 |
| `ui.tooltip.placement` | string | `"top"` | 否 | `top/bottom/left/right`；空间不足自动翻转 |
| `ui.toast.position` | string | `"top-right"` | 否 | 6 取值：`top-left/top-right/bottom-left/bottom-right/top-center/bottom-center`（`toast.js:142`） |
| `ui.toast.max` | number | `4`（源码默认 5） | 否 | 同位置最多并存条数，超出移除最旧（`toast.js:123-138`） |
| `ui.toast.duration` | number(ms) | `3200`（源码同） | 否 | 自动关闭时长；`0` 不自动消失（`toast.js:130`） |
| `ui.dialog.maskClosable` | boolean | `true` | 否 | 点遮罩关闭（`dialog.js:137,427`），可被单弹窗 `props.maskClosable` 覆盖 |
| `ui.dialog.escClosable` | boolean | `true` | 否 | **不生效**：框架读 `closeOnEsc`（`dialog.js:1055`）；`ui.dialog` 原样深合并（`:1147-1150`），全局关 ESC 写 `"closeOnEsc": false` |

## 5. layout.*：外壳尺寸与 CSS 变量

`app-shell.js:146-193` 读 `layout`，把数字转 px 写到根元素内联样式：`--kui-menu-width`、`--kui-menu-width-collapsed`、`--kui-header-height`、`--kui-tabbar-height`、`--kui-app-gap`；CSS 兜底值在 `base.css:330-335`，不一致时以内联样式为准。

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `gap` | number(px) | `10` | 否 | 外壳四周/区间距 → `--kui-app-gap`（`base.css:335`、`components.css:2509-2510`） |
| `layout.menu.width` / `collapsedWidth` | number(px) | `252` / `68` | 否 | 展开/折叠宽度 → `--kui-menu-width`、`--kui-menu-width-collapsed`（`base.css:768,838`、`components.css:134,770`） |
| `layout.menu.collapsed` | boolean | `false` | 否 | 初始折叠；优先级 `layout.menu.collapsed` > `layout.collapsed` > localStorage `kui-menu-collapsed` > `false`（`app-shell.js:157-163`） |
| `layout.header.height` | number(px) | `56` | 否 | 顶栏高度 → `--kui-header-height`（`base.css:815`、`components.css:189`） |
| `layout.tabbarHeight` | number(px) | `38` | 否 | 标签栏高度 → `--kui-tabbar-height`（`components.css:1386,1463`） |

易错点：值可写数字（自动补 `px`）或带单位字符串（`app-shell.js:43-47`）；`menu.props.width/collapsedWidth`（`app.json:222-223`）只写内部变量 `--kui-menu-w`（`menu.js:716-717`），样式表**未消费**——改宽度请改 `layout.menu.*`。

## 6. theme.*：主题入口

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `theme.default` | string | `"kurumi"` | 否 | 兜底主题 id（`bootstrap.js:787-792`）。生效优先级（`theme.js:402-415`）：`__KUI_EARLY_THEME__` > URL `?kuiTheme=` > localStorage[`storageKey`] > 本字段 > `themes.json` 的 default > 第一套 |
| `theme.storageKey` | string | `"kui-theme"` | 否 | 持久化键（`theme.js:20`、`bootstrap.js:789`）；换键 = 换一份记忆 |
| `theme.persist` | boolean | `true`（源码判断 `persist !== false`） | 否 | 是否写 localStorage（`bootstrap.js:790`）；关掉后每次刷新从 `default` 开始 |
| `theme.visible` | array | 6 个主题 id | 否 | **未消费**：选择器列出 `KUI.theme.list()` 全部（`bootstrap.js:275-346`） |
| `theme.picker` | object | `{title,desc,columns:3,showPreview:true,showScheme:true,position:"panel",maskClosable:true}` | 否 | **源码未消费**：选择弹窗在 `bootstrap.js:301-316` 硬编码 `id:"theme-picker"`、`width:680`、`maskClosable/closeOnEsc:true`、`footer:false`；节点由 `buildThemePickerNodes()`（`bootstrap.js:229`）生成，其中 `picker.columns` 无读取点、网格固定 3 列（`bootstrap.js:269`） |

> 想改主题选择器外观，当前版本只能改 `src/app/bootstrap.js` 的 `openThemePicker`/`buildThemePickerNodes`（框架代码，见 [12-extension.md](12-extension.md)）；`theme.visible/picker` 是预留位。

## 7. text.*：对 text.json 的增量覆盖

`bootstrap.js:767-769` 先 `KUI.i18n.set(res.text)`（整份 `text.json`）再 `KUI.i18n.set(appCfg.text)`；`i18n.set` 只有第二参 `deep===false` 才浅合并，缺省走 `deepMerge`（`kui.js:416-425`），所以 `app.json.text` 只写要改的叶子键即可。

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `text` | object | `{}` | 否 | 覆盖字典根；键路径与 `text.json` 一致 |
| `text.app` | object | `{}` | 否 | 应用层文案（`app.json:706-709`）：`subtitle` 作启动层副标题兜底、`copyright` 供业务页读取；其余键仍用 `text.json` |
| `text.menu` | object | `{}` | 否 | 菜单文案（`app.json:710-712`）：`footerDefault`、`collapse/expand` 等 |
| `text.shell` | object | `{}` | 否 | 外壳文案（`app.json:713-715`）：`searchPlaceholder`、`settings`、`theme` |
| `text.page` | object | `{}` | 否 | 页面文案（`app.json:716-718`）：本配置只覆盖 `page.home` |

`text.json` 顶层 40 组（`app/common/shell/menu/menunav/tabs/dialog/toast/form/boot/...`，完整键见文件），其中 v1.3.8 新增 `boot` 组（12 键，见 §8.5 与 [16-boot.md](16-boot.md) §5.4）；`KUI.text('boot.loading', 兜底)` 在主流程中会命中 `boot.loading`。

---

## 8. avatar.*：头像与刻刻帝齿轮框

顶层 `avatar`（`app.json:720-754`）由外壳透传：`app-shell.js:253-256` 把它塞进 `menu.props.brand.avatar`（menu 品牌区若已写 `brand.avatar`，以后者为准），再由 `menu.js:183-187` 调 `KUI.avatar.create(logo, cfg, ctx)`。**这是创建时一次性读取的配置**，运行时换头像用 `app.setAvatar(url)`（`app-shell.js:277-291`，API 见 [11-api-messaging.md](11-api-messaging.md)）。

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `avatar` | object | — | 否 | 总配置；不写则不渲染头像，品牌区保持纯图标 |
| `url` | string | `''`；本配置为 `data:image/svg+xml,…` | 否 | http(s)/相对路径/data URI；空则回退 `fallbackIcon`（URL 细节见 06） |
| `editable` | boolean | `false`；本配置 `true` | 否 | 点击换头像（`avatar.js:341-353`）；`false` 时 `openPicker` 直接返回（`:360`） |
| `persist` / `storageKey` | boolean / string | `false` / `"kui-avatar"` | 否 | 更换后写 `localStorage[storageKey]`（`:242-249,550-553`）；本配置 `persist:true` |
| `size` / `shape` | number(px) / string | `44`；本配置 `42` / `"circle"` | 否 | 直径；`circle`\|`square`（square 加类，`:256`）；回退图标约 `size*0.46`（`:269-272`） |
| `alt` / `title` / `clickTitle` | string | `"头像"` / `""` / `"更换头像"` | 否 | 无障碍名 / 悬停提示（空则用 `clickTitle`）/ `aria-label`（`:346-347`） |
| `fallbackIcon` / `fallbackText` | string | `"clock"` / `""` | 否 | 无 `url` 时的图标；无图标取 `fallbackText` 首字（`:269-278`）；menu 内被 `brand.logoIcon` 兜底（`menu.js:180`） |
| `frame` | object | 见下 | 否 | 齿轮框：`url` 非空且 `enabled!==false` 才绘制（`:329-333`）；`enabled`/`style` 默认 `true`/`"clock-gear"`（`style` 当前唯一值，`:105` 注释为预留） |
| `frame.showTicks` / `showRoman` / `showHands` | boolean | `true` / `false` / `true` | 否 | 外圈刻度 / 罗马数字（`:153`）/ 指针，独立开关 |
| `frame.animated` / `spinDuration` | boolean / number | `true` / `48` | 否 | 秒/圈：`>0` 正转、`<0` 反转、`0` 停（`:304-311`）；reduced-motion 下动画/过渡关闭（`src/styles/avatar.css:197-200`，`:109` 注释说明） |
| `picker` | object | 见下 | 否 | 点按后的更换弹窗 |
| `picker.title` / `width` | string / number(px) | `"更换头像"` / `520`；本配置 `560` | 否 | 标题 / 弹窗宽度（`:410`） |
| `picker.urlLabel` / `urlPlaceholder` / `urlTip` | string | 见源码 `:91-133` | 否 | 地址输入的 label / 占位 / 帮助文本 |
| `picker.clearLabel` / `allowClear` | string / boolean | `"清除自定义头像"` / `true` | 否 | 清除开关文案 / 是否显示（`:399-406`） |
| `picker.okText` / `cancelText` | string | `"应用"` / `"取消"` | 否 | 按钮文案 |
| `picker.mode` / `accept` / `maxSizeMB` | string / string / number | `"url"` / `"image/*"` / `2` | 否 | `mode:"file"` 才显示本地选图（`:359-364,431+`）；`accept` 过滤；超限用 `fileErrorSize`（`{n}`） |
| `picker.presets` | array \| null | `null` | 否 | 未写；`null`=内置 4 个、`[]`=不显示、数组=自定义 `{label,url}`（`:370-377`） |
| `picker.fileLabel` / `fileTip` | string | `"选择本地图片"` / … | 否 | 未写；`file` 模式按钮/提示文案 |

---

## 8.5 boot.*：加载层与时钟指针（v1.3.8 新增）

**作用**：控制「访问服务或刷新时」出现的加载中页面。它是注册组件 `boot`（`KUI.bootLayer`），
可被主应用自动接管，也可在任意容器里独立渲染。

> ✅ **v1.3.8 起完整生效**：`src/app/bootstrap.js` 的 `boot()` 会调用 `applyBootConfig(appCfg, res.text)`，把 `config/app.json` 的 `boot` 段交给组件（`configureBootLayer`），并处理 `boot.enabled === false`。历史背景与修复记录见 [16-boot.md](16-boot.md) §5.5。

**默认表现**：全屏深色遮罩 + 时钟图形（12 刻度、红时针、金分针）+ 进度条 + 阶段文案；
指针随进度从 12 点走到 12 点（0% ↔ 0 时，100% ↔ 12 时），25% 指向 3:00、50% 指向 6:00、75% 指向 9:00。

**字段表**（全部可选；改完 `npm run build:config` 即生效）：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `boot.enabled` | `true` | `false` 时不创建启动层（`bootstrap` 读取并销毁已创建实例，v1.3.8 起生效） |
| `boot.mode` | `"fullscreen"` | `fullscreen` 页面级遮罩 / `inline` 内嵌演示 |
| `boot.meta` | `true` | 底部「百分比 + 时钟读数」 |
| `boot.stages` | 4 段 | `[{ step, progress, text }]`，`progress` 为 0–100；主流程只调 `setStep(1..4)`，第五段起不会自动命中 |
| `boot.clock.mode` | `"progress"` | `progress` 跟进度 / `spin` 匀速自转 / `none` 无专门实现（视觉同 `progress`） |
| `boot.clock.size` | `74` | 钟面直径 px |
| `boot.clock.ticks` | `12` | 刻度数（写入 `--kui-boot-ticks`；CSS 的 12 格由 `repeating-conic-gradient` 固定，改此值只影响变量） |
| `boot.clock.smooth` | `true` | 指针过渡动画开关（写入 `data-boot-smooth`，`false` 时不走过渡；v1.3.8 起生效） |
| `boot.bar.mode` | `"progress"` | `progress` / `indeterminate`（不确定态） |

**改文案**：`config/text.json` 的 `boot` 组（12 键：`title / subtitle / loading / theme / shell / ready / text / errorTitle / errorTip / retry / noHost / noConfig`），
或在 `config/app.json` 的 `text` 里做增量覆盖。实际生效的是 `loading/theme/shell/errorTitle/errorTip/retry/noHost/noConfig`；
`title/subtitle/text` 因主流程 `attach()` 已用 `KUI.text` 兜底填充，只在 `configure(patch, textCfg)` 显式传 `textCfg` 且字段为空时生效（详见 [16-boot.md](16-boot.md) §5.4）。

**运行时调试**（控制台）：

```js
KUI.bootLayer.instance().setProgress(42);   // 指针指到 42% → 5:02 附近
KUI.bootLayer.handsAt(42);                   // { percent:42, hourAngle:151.2, minuteAngle:14.4, clockText:"05:02", … }
KUI.bootLayer.configure({ clock: { mode: "spin" } });
KUI.bootLayer.instance().error("配置损坏");   // 失败态卡片
```

**拆装**：不需要加载层时，从 `config/kui-modules.json` 的清单里去掉 `src/components/boot.js` 并重跑 `npm run build:all`，
`bootstrap.js` 会退回 `index.html` 静态骨架（`boot.enabled:false` **不能**关闭它——该字段无读取点，见上方提示）。

**观察效果**：打开 `standalone/boot.html`（独立页，内嵌预览 + 0→100 自动演示 + 按进度设置 + spin/错误态按钮）。

## 9. dialogs.settings：打开设置弹窗

`settings.open` 动作读取 `appCfg.dialogs.settings`（`bootstrap.js:627-665`），**只有 `title/width/okText/cancelText/nodes/data` 会传给 `KUI.dialog.form`**；提交后只处理 `theme/collapsed/motion` 三个 id（`:648-658`）。

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `dialogs.settings` | object | — | 否 | 设置弹窗预设；不写则用内置 3 节点（主题/折叠/动效，`bootstrap.js:597-626`） |
| `title` | string | `"终端设置"` | 否 | 标题；缺省 `KUI.text('settings.title','界面设置')` |
| `desc` | string | — | 否 | **未透传**（请求对象无 `desc`），不显示 |
| `width` | number(px) | `540`（兜底 560） | 否 | 弹窗宽度 |
| `okText` / `cancelText` | string | `"保存设置"` / `"取消"` | 否 | 按钮文案；缺省“确定/取消” |
| `draggable` | boolean | `true` | 否 | **未透传**：`formDialog` 用自身默认 `draggable:false`，不可拖 |
| `layout` | object | `{columns:1,gap:14,labelWidth:96,labelPosition:"left"}` | 否 | **未透传**：`formDialog` 默认 `layout:'vertical'` |
| `data` | object | 5 键初值 | 否 | 表单初值，按节点 id 取；随 `dialog.form` 的 `data` 传入 |
| `nodes` | array | 5 个节点 | 否 | 表单节点数组（结构见 07）；空/缺省回退内置节点 |

> 诚实提示：现有 5 个节点 id（`shellName/defaultTheme/startTab/remember/density`）提交后**不改任何状态**，只弹“设置已应用”——演示数据。要生效，节点 id 须用 `theme`/`collapsed`/`motion`，或自写 handler（[10-actions-handlers.md](10-actions-handlers.md)）。

最小可运行设置面板（替换 `app.json` 的 `dialogs.settings`）：

```json
{
  "dialogs": { "settings": {
    "title": "界面设置", "width": 520, "okText": "应用",
    "nodes": [
      { "id": "theme", "type": "select", "label": "主题",
        "options": [ { "label": "绯红刻刻帝", "value": "kurumi" }, { "label": "白羽灵装", "value": "kurumi-angel" } ] },
      { "id": "collapsed", "type": "switch", "label": "折叠左侧菜单" },
      { "id": "motion", "type": "switch", "label": "界面动效", "props": { "activeText": "开", "inactiveText": "关" } }
    ],
    "data": { "theme": "kurumi", "collapsed": false, "motion": true }
  } }
}
```

打开方式：`KUI.actions.run('settings.open')`，或顶部导航“设置”按钮（`app.json:653-659` 的 `action: "settings.open"`）。

---

## 10. menu / menunav / tabs：三个外壳节点

外壳只认这三个顶层键的 `{type,props}`（§2），`props` 与组件 `DEFAULTS` 深合并（`menu.js:138-153`、`menunav.js:144-159`、`tabs.js:171-181`）；字段全集见 [08-components.md](08-components.md)。

### 10.1 menu（左侧菜单，`app.json:211-616`）

根为 `{"type":"menu","props":{...}}`；`props.items` 是树，节点三种 `type`：`item`（`id/label/icon/badge/badgeType/tooltip/disabled/children/target`，有 `children` 可展开，`menu.js:333-355`）、`group`（`label+children`，`:298-304`）、`divider`（`:283-288`）。常用键 `brand/defaultActive/items/footer{title,version,actions}/accordion/flyout/tooltip/collapsible`。外壳覆盖：`brand` 缺省用 `app.*` 组装（`app-shell.js:239-244`）、`collapsed` 恒等于外壳折叠态（`:248`）、`avatar` 顶层注入（`:253-256`）；`menu.props.collapsed` **不决定初始折叠**（改 `layout.menu.collapsed`）。

```json
{ "menu": { "type": "menu", "props": {
  "brand": { "title": "我的应用", "subtitle": "副标题", "logoIcon": "clock" },
  "defaultActive": "home",
  "items": [
    { "type": "group", "label": "导航", "children": [
      { "type": "item", "id": "home", "label": "首页", "icon": "home", "badge": "主",
        "target": { "tab": { "id": "home", "title": "首页", "url": "pages/home.html", "icon": "home", "pinned": true } } },
      { "type": "divider" },
      { "type": "item", "id": "docs", "label": "文档", "icon": "list", "disabled": true }
    ] } ] } } }
```

### 10.2 menunav（顶部导航，`app.json:617-669`）

`{"type":"menunav","props":{...}}`；`breadcrumb{enabled,home,items,separator}`；`actions[]` 每项 `id/icon/label/title/badge/badgeType/action/disabled`（`menunav.js:444-488`），点击执行 `action || id`。`title/subtitle` 不写时用 `app.title/subtitle` 兜底（`app-shell.js:268-269`）。**面包屑折叠用顶层 `maxBreadcrumb`**（`menunav.js:135,370-377`，`0` 不裁剪）；`app.json:635` 的 `breadcrumb.max:4` 无读取点，**不生效**。

```json
{ "menunav": { "type": "menunav", "props": {
  "mode": "header", "showCollapse": true, "maxBreadcrumb": 3,
  "breadcrumb": { "enabled": true, "separator": "/", "home": { "label": "首页", "icon": "home" }, "items": [] },
  "actions": [ { "id": "search", "icon": "search", "label": "检索", "action": "search.toggle" },
               { "id": "settings", "icon": "settings", "label": "设置", "action": "settings.open" } ] } } }
```

### 10.3 tabs（标签页，`app.json:670-704`）

`{"type":"tabs","props":{...}}`。初始标签：先开 `props.home`（字符串或对象，`tabs.js:1342-1352`），再依次开 `props.initial`（`tabs.js:1353-1358`）；外壳创建后按 `opts.initialTabs → tabs.props.initial → tabs.props.tabs` 再补开一次（`app-shell.js:539-550`），同 id 复用/激活。每项 tab 为 `{id,title,url,icon,pinned,closable}`。`maxTabs` 超限拒绝并提示“最多只能打开 {max} 个标签”（`tabs.js:538-539`）；`drag` 源码默认 `true`（`tabs.js:149`），本配置设 `false`；`sandbox` 默认 `""` = 不给 iframe 设 `sandbox`（`tabs.js:153-155,406`）。

```json
{ "tabs": { "type": "tabs", "props": {
  "closable": true, "keepAlive": true, "maxTabs": 8,
  "home": { "id": "home", "title": "首页", "url": "pages/home.html", "icon": "home", "pinned": true },
  "initial": [ { "id": "docs", "title": "文档", "url": "pages/docs.html", "icon": "list" } ] } } }
```

---

## 11. 改配置看效果（7 组前后对比）

> 通用步骤：改 `config/app.json` → `npm run build:config`（或 `npm start`）→ 硬刷新。下文的“改前”即仓库当前值。

### 11.1 改应用标题

```diff
- "title": "刻刻帝终端"
+ "title": "时崎狂三控制台"
```

看到：标签页标题/启动层标题/顶栏标题一起变（`app-shell.js:535-537,268-269`）；品牌区标题来自 `brand.title`（`app.json:215`），要一致就同步改它和 `menunav.props.title`。

### 11.2 换品牌 logo

```diff
  "brand": { "title": "刻刻帝终端", "subtitle": "KurumiUI · 灵装回路",
-   "logoIcon": "clock",
+   "logoIcon": "star",
```

看到：品牌区圆形图标变化；`app.logoIcon`（`app.json:9`）仅在无 `menu.props.brand` 时兜底，本仓库改它无效。图标 id 见 [06-controls-display.md](06-controls-display.md)。

### 11.3 改默认主题

```diff
  "theme": {
-   "default": "kurumi",
+   "default": "abyss",
```

看到：首次访问（清存储后）使用“深渊刻印”；优先级低于 `?kuiTheme=` 与 localStorage（§6），验证前先清 `kui-theme`。

### 11.4 关闭 tooltip

```diff
  "ui": {
    "tooltip": {
-     "enabled": true,
+     "enabled": false,
```

看到：悬停改走浏览器原生 `title`（含折叠菜单，`menu.js:338-340`）；`false` 只是不接管，不删 `title` 属性。

### 11.5 改 tabs 上限

```diff
  "tabs": {
    "props": {
-     "maxTabs": 24,
+     "maxTabs": 2,
```

看到：第 3 个标签被拒绝并弹“最多只能打开 2 个标签”（`tabs.js:538-539`）；`home` 固定标签也占名额，已打开的不受影响。

### 11.6 自定义设置弹窗

把 §9 示例粘到 `dialogs.settings`，点顶栏“设置”；标题/宽度/节点按配置渲染，选主题保存会真正换肤（`values.theme`），`desc/draggable/layout` 不生效。

### 11.7 换头像

```diff
  "avatar": {
-   "url": "data:image/svg+xml,%3Csvg …",
+   "url": "assets/avatars/kurumi.png",
    "editable": true,
```

看到：齿轮框内换新头像，`url` 置空回退 `fallbackIcon`；`persist:true` 时以 `localStorage['kui-avatar']` 为准，验证前先清它；运行时用 `KUI.app.instance.setAvatar(url)`。

---

## 12. 常见错误与排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 改完 JSON 刷新没变化 | 没重建配置包：file:// / fetch 失败时读旧 `bundle.js` | `npm run build:config` 后硬刷新，或 `npm start`（启动自动重建，`server.js:236-248`） |
| 控制台报“配置 JSON 解析失败” | 语法错：尾逗号/注释/单引号 | 跑「本章自检」①；`config/*.json` 不能写注释 |
| 启动报“未找到 config/app.json” | `BASE` 推导与页面层级不符 | 入口放仓库根（`BASE=''`）或 `pages/`（`BASE='../'`），见 `config.js:37-58` |
| 字段写了完全没效果 | 该字段无源码消费点 | 查 §3/§6 的“未消费”标注，或 `grep` 读取点 |
| `ui.dialog.escClosable` 无效 | 内部字段名是 `closeOnEsc` | 改 `ui.dialog.closeOnEsc` 或单弹窗 `props.closeOnEsc` |
| 面包屑不折叠 | 写成了 `breadcrumb.max` | 改 `menunav.props.maxBreadcrumb`（§10.2） |
| 改 `menu.props.width` 没变宽 | 只写内部变量，无 CSS 消费 | 改 `layout.menu.width`（§5） |
| 初始标签不对 | `home` 先开、`initial` 后补开 | 调 `tabs.props.initial` 顺序或改 `home`（§10.3） |
| 改 `pages/*.html` 内联数据没反应 | 页面优先读 `config/demos/*.json` | 改 `config/demos/xxx.json`（`pages/form.html:195-197`） |
| 主题默认值不生效 | localStorage 有上次选择 / URL 带 `?kuiTheme=` | 清 `localStorage['kui-theme']` 再刷新（§6）；`theme.visible/picker` 未消费，只能改框架代码 |
| `KUI.config.get('app.title')` 返回 undefined | 前缀后路径相对文件根 | 写 `get('app.app.title')`（§1.4） |

---

## 本章自检（含 boot 自检）（含 boot 自检）

在仓库根目录用 `pwsh` 执行，四步全过即确认本章配置知识成立。

**① 校验三份 JSON 可解析**

```powershell
node -e "['config/app.json','config/text.json','src/themes.json'].forEach(function(f){JSON.parse(require('fs').readFileSync(f,'utf8'));console.log(f+' OK')});"
```

预期输出三行：`config/app.json OK`、`config/text.json OK`、`src/themes.json OK`。

**② 用 Node 加载器验证“读取语义”**

```powershell
node -e "var s=require('./test/dom-stub.js'),e=s.createEnvironment({root:process.cwd(),fileMode:true}),lk=require('./test/load-kui.js');lk.loadKui(e,{});var K=e.window.KUI;Promise.all([K.config.load('app'),K.config.load('text')]).then(function(r){K.i18n.set(r[1]);console.log('app.app.title =',K.config.get('app.app.title'));console.log('app.home =',K.config.get('app.home','(fallback)'));console.log('ui.toast =',JSON.stringify(K.config.get('app.ui.toast')));console.log('text.menu.footerDefault =',K.text('menu.footerDefault','(无)'));});"
```

预期（`app.home` 取不到正是 §1.4 的坑）：

```text
app.app.title = 刻刻帝终端
app.home = (fallback)
ui.toast = {"position":"top-right","max":4,"duration":3200}
text.menu.footerDefault = 灵装回路 · 在线
```

**③ 重建配置包并核对输出**（`demos` 应为 11 个）

```powershell
npm run build:config
```

```text
KurumiUI 配置打包完成
  大小: 约 114 KB
  app.json   : ✔
  text.json  : ✔
  themes.json: ✔
  demos      : 11 个
[build-all] 已生成 src/core/kui-all.js (… 字节)
[build-all] profiles: app=29, standalone=28
```

**④ 浏览器控制台抽查**

```js
KUI.config.get('app.app.title');        // "刻刻帝终端"
KUI.config.get('app.app.avatar.size');  // 42
KUI.config.get('app.ui.tooltip');       // {enabled:true, delay:140, …}
KUI.theme.currentId();                  // "kurumi"（或你上次选的）
```

---

## 参考源码

- `config/app.json`（744 行，行号唯一依据）；`config/text.json`、`src/themes.json`、`config/kui-modules.json`。
- `src/core/config.js:25-31,73-77,82-96,148-212,252-271` —— 路径表/读取管线/`get` 语义；`src/app/bootstrap.js:689-745`（元信息/UI 默认值）、`:747-840`（主流程）、`:597-665`（设置弹窗）、`:347-375`（主题选择器）。
- `src/components/app-shell.js:25-32,76-85,141-193,237-291,535-550,565-589` —— 布局、装配、标题与初始标签；`menu.js:118-153,211-260,276-383,504-574,716-717,733-782`、`menunav.js:121-159,341-423,444-488`、`tabs.js:143-181,406,538-539,1342-1361` —— 三节点消费。
- `src/core/theme.js:20,201-223,297,402-425`、`tooltip.js:36-46,64-86`、`toast.js:123-142`、`dialog.js:137,427,986-1014,1055,1087-1150`、`avatar.js:91-133,238-353,359-429,545-554,615`、`kui.js:413-464` —— 各字段默认值与读取；`tools/build-config.js:23-131`、`tools/build-all.js`。



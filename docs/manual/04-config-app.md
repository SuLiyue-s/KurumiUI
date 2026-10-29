# 04 · 配置总览 + app.json 全字段

> 适用版本：KurumiUI v1.4.2 ｜ 前置章节：[03-assembly.md](03-assembly.md) ｜ 阅读时长：约 40 分钟

## 本章目标

- 说清 `config/` 下 6 类配置的职责，能按 §1.3 的判定矩阵回答「哪些改完刷新即生效、哪些必须重建」；
- 说清界面里保存的标题名、皮肤、启动页、密度、头像存到哪（localStorage，不是配置 JSON），以及如何清除与“让所有访问者看到新默认”；
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
| `config/app.json` | 外壳全部配置（755 行、12 键） | `bootstrap.js:955-1054`（`boot()` 主流程）、`app-shell.js:141-146` |
| `config/text.json` | 全量文案字典（40 组，见 §7；含 v1.3.8 新增的 `boot` 组） | `bootstrap.js:975-977` → `KUI.i18n.set` |
| `src/themes.json` | 6 套主题 token（**不在 config/ 下**） | `theme.js:201` 载入、`:297` 应用 |
| `config/demos/*.json` | 11 份示例数据，页面数据源，外壳不加载 | `KUI.config.load('demos/xxx')`（`pages/form.html:195-197`） |
| `config/bundle.js` | 构建产物 `__KUI_BUNDLE__={app,text,themes,demos,meta}` | `config.js:82-96` 兜底读；勿手改 |
| `config/kui-modules.json` | 模块清单 + 装配 profile（30/29 文件） | `tools/build-all.js` → `kui-all.js` |

路径写死在 `config.js:25-31`；`config.js:73-77` 把 `demos/xxx` 映射到 `config/demos/xxx.json`。主题默认值在 `app.json.theme.default`，token 在 `src/themes.json`（见 [09-theme.md](09-theme.md)）。

> 上表每个文件「改完是否需要重建」不同：`bundle.js` 是配置产物、`kui-all.js` 是模块清单产物，二者都由构建生成；判定方法与误区见 §1.3。

### 1.2 KUI.config 读取管线

`load(name)`（`config.js:148-212`）依次：① 内存缓存（非 `force`）→ ② 同文件并发合并 → ③ 注入读取器 `setReader`（Node 测试）→ ④ 非浏览器直读 `__KUI_BUNDLE__` → ⑤ http(s) `fetch`（`cache:'no-cache'`，失败回退 bundle 并 `warnOnce('cfg-fallback:'+name)`，`config.js:175-194`）→ ⑥ file:// 先读 bundle 再试 fetch，失败报“请运行 `npm run build:config` 或使用 `npm start`”（`config.js:195-207`）。解析失败返回 `null` 并 `KUI.error`（`:98-106`）；只有 `app.json` 缺失才致命（`bootstrap.js:979-981`）。

### 1.3 生效判定：改 JSON 就要重建吗？界面里保存的又存在哪？

KurumiUI 有**两套配置来源**，判断任何改动是否生效，先确认它走哪一套：

| 来源 | 包含什么 | 什么时候被读取 | 改完之后 |
| --- | --- | --- | --- |
| **原始 JSON** | `config/app.json`、`config/text.json`、`src/themes.json`、`config/demos/*.json` | http(s) 下 `fetch`（`cache:'no-cache'`，`config.js:148-212`）；fetch 失败回退 bundle | **刷新页面即生效**，无需构建 |
| **构建产物** | `config/bundle.js`（`__KUI_BUNDLE__`）、`src/core/kui-all.js`（模块注入清单） | `file://` 双击、离线分发、fetch 失败兜底 | **必须重建**后才生效 |

#### 1.3.1 判定矩阵

| 你改的文件 | http(s) 打开（`npm start`/静态托管） | 双击 `index.html`（file://） | 静态部署但只上传了 `bundle.js` | 说明 |
| --- | --- | --- | --- | --- |
| `config/app.json` | 刷新即生效 | 先 `npm run build:config` | 必须重建并重传 | 外壳全部字段 |
| `config/text.json` | 刷新即生效 | 先 `npm run build:config` | 必须重建并重传 | 文案字典 |
| `src/themes.json` | 刷新即生效 | 先 `npm run build:config` | 必须重建并重传 | 主题 token |
| `config/demos/*.json` | 刷新对应页面即生效 | 先 `npm run build:config` | 必须重建并重传 | 业务页示例数据 |
| `config/kui-modules.json` | **★ 任何模式都必须重建**（`npm run build:config`，或 `npm run build:all` 只重建清单产物） | 同左 | 同左 | 它决定 `src/core/kui-all.js` 注入哪些脚本；`npm start` 启动时会自动重建一次（`server.js:236-248`），但改完清单后仍建议手动重建再刷新 |
| `index.html`、`src/styles/*.css`、`src/**/*.js` | 刷新即生效 | 刷新即生效 | 直接上传覆盖即可 | 不由配置包打包，浏览器直接加载 |
| `config/bundle.js`、`src/core/kui-all.js` | **产物，勿手改** | 产物，勿手改 | 产物，勿手改 | 由构建命令重新生成（bundle 头含 `meta.generatedAt` 与“自动生成，请勿手工编辑”，重建后约 114 KB） |

**三条结论**：

1. **只改配置 + 用 http 打开 → 保存后刷新即可，不必构建**；用 `file://` 双击、或部署时只给 `bundle.js` → 必须 `npm run build:config`（它等于 `build-config.js && build-all.js`）。
2. **改 `config/kui-modules.json` 永远要重建**：它不写进 bundle，而是生成 `kui-all.js` 的脚本清单；漏重建会出现“配置改对了、新页面/新组件却没加载”。
3. **没有热更新**：改完 JSON 必须手动刷新（必要时 `Ctrl + F5` 强制刷新）；`npm start` 的静态服务器不会监听文件变化自动刷新。

> 判定口诀：**“配置进 bundle，脚本进清单；http 可现改现刷，file:// 与离线必须重建。”** 构建细节与矩阵的另一视角见 [02-build.md](02-build.md) §2.5。

#### 1.3.2 运行时持久化：界面里「保存」的东西存在哪？

**结论先说：浏览器页面不能、也不会写 `config/*.json`。** 界面里所有“保存 / 记住 / 切换后下次还在”的状态，都写入**当前浏览器的 localStorage**（唯一例外是 iframe 自愈用的 sessionStorage）。`config/app.json`、`config/text.json`、`src/themes.json` 只提供**默认值**；已经保存到 localStorage 的值**优先级高于**配置默认值。因此会出现“配置文件里写 `kurumi`，打开却是上次选的 `starry`”。

| 存储键 | 由谁写入 | 保存的内容 | 读取时机 | 覆盖 / 优先级 |
| --- | --- | --- | --- | --- |
| `kui-theme`（可由 `theme.storageKey` 改名） | 主题选择弹窗、设置弹窗“默认主题”、`KUI.theme.apply()`、`theme.*` 动作 | 当前主题 id | 启动时 `theme.js:402-413` | `__KUI_EARLY_THEME__` > URL `?kuiTheme=` > **localStorage** > `theme.default` > `themes.json` 的 `default` > 第一套 |
| `kui-shell-name` | 设置弹窗保存 `shellName`（`KUI.boot.applySettings`） | 终端名称 | 启动收尾 `applyStoredPrefs`（`bootstrap.js:752-774`） | 覆盖 `app.title`/`app.name` 的**显示**（不写回 JSON） |
| `kui-start-tab` | 设置弹窗保存 `startTab` | 启动页 id | 启动收尾 | 与 `kui-last-tab` 竞争时显式 start-tab 优先 |
| `kui-remember-tab` | 设置弹窗 `remember` 开关 | `'1'` / `'0'` | 启动收尾 + 每次 `tab:activate` | `'0'` 时清空 `kui-last-tab` |
| `kui-last-tab` | 每次切换标签（remember=`'1'` 时） | 最后激活的标签 id | 启动收尾（remember 开启时） | 仅在 remember 开启时参与启动页决策 |
| `kui-density` | 设置弹窗 `density`（`applyDensity`） | `normal` / `compact` / `loose` | 启动收尾 + 保存时 | 写 `html[data-kui-density]`，覆盖 CSS 默认间距 |
| `kui-avatar` | 头像选择器保存（`avatar.persist:true` 时） | 头像 URL 或 dataURL | 头像挂载（`avatar.js:246`） | 覆盖 `avatar.url` |
| `kui-menu-collapsed` | 菜单折叠按钮（`app-shell.js:60,71`） | `'1'` / `'0'` | app-shell 挂载 | 覆盖 `layout.menu.collapsed` |
| `kui-debug` | 手动在控制台写 `localStorage['kui-debug']='1'` | 诊断面板开关 | 启动时（`diag.js:239`） | 等价于 URL `?kui_debug=1` |
| `sessionStorage: kui-self-heal:<版本>` | iframe 自愈（`kui-frame.js:86-93`） | 自愈标记 | iframe 版本不一致时 | 仅当前标签页会话内有效，不是用户设置 |

补充：

- **主题键可改**：改 `config/app.json` 的 `theme.storageKey` 或 `<html data-kui-theme-key="...">`；换键后旧键里的选择不再生效。
- **头像持久化可关**：`avatar.persist:false` 时运行期换头像不保存，刷新回到 `avatar.url`。
- **菜单折叠每次都会写**，属于“上次状态”，不是配置；想固定初始状态改 `layout.menu.collapsed` 并在浏览器里清掉 `kui-menu-collapsed`。

#### 1.3.3 清除浏览器记忆与「让所有访问者看到新默认」

| 目标 | 操作 |
| --- | --- |
| 把某一项恢复成配置默认值 | F12 → Application → Local Storage → 删除对应键后刷新；控制台等价写法 `localStorage.removeItem('kui-theme')` |
| 全部恢复默认 | `localStorage.clear()` 后刷新（会同时清掉主题、终端名、启动页、密度、头像、菜单折叠） |
| 只把主题恢复默认 | `KUI.theme.clearPersisted()`，或删 `kui-theme` |
| **修改默认值，让所有访问者首次打开就是新外观 / 新标题** | 改 `config/app.json`、`config/text.json`、`src/themes.json`（**不是**改 localStorage）；按 §1.3.1 判断是否需要重建；访问者若自己保存过 localStorage，仍以浏览器里的值为准 |
| 验证“默认主题”是否写对 | 先清掉自己的 `kui-theme`，或开一个无痕窗口，再看首次进入的主题 |

> 一句话：**配置 JSON 管“默认值”，localStorage 管“这个浏览器里的用户选择”。** 展示页（外壳/设置弹窗/头像/主题）里保存的标题名称、皮肤等，全部走 localStorage，不会回写 `config/*.json`。

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

- `app`（3-18）名称/标题/版本/首页/启动层 → `bootstrap.js:897-933`、`app-shell.js:237-268`
- `ui`（19-37）tooltip/toast/dialog 全局默认 → `bootstrap.js:935-953`
- `boot`（38-48）启动层（加载中页面）与时钟指针动画 → `bootstrap.js` 启动流程的 `applyBootConfig()`（v1.3.8 起生效，可用 `KUI.boot.appliedBootConfig` 观测），详见 §8.5 与 [16-boot.md](16-boot.md)
- `dialogs`（49-177）弹窗预设（只有 settings）→ `bootstrap.js:776-849`
- `theme`（178-198）默认主题/存储键/可见列表/选择器 → 主题初始化 + `openThemePicker`/`buildThemePickerNodes`（v1.3.8 起 `visible`/`picker` 全部生效，§6）
- `layout`（199-210）菜单/头部/标签栏/间距尺寸 → `app-shell.js:146-193`
- `menu`（211-616）左侧菜单（品牌/树/页脚）→ `app-shell.js:237-258` → `menu.js`
- `menunav`（617-669）顶部导航（面包屑/动作）→ `app-shell.js:260-271` → `menunav.js`
- `tabs`（670-704）标签页（初始/上限/保活）→ `app-shell.js:273-275,539-550` → `tabs.js`
- `text`（705-719）对 text.json 的增量覆盖 → `bootstrap.js:975-977`
- `avatar`（720-754）头像（URL/齿轮框/选择器）→ `app-shell.js:253-256` → `menu.js` → `avatar.js`

---

## 2. 节点通用字段（外壳三节点 + 菜单树）

KurumiUI 的“节点”没有强类型 schema，字段由渲染器按需读取；下表覆盖 `menu`/`menunav`/`tabs` 与菜单树 item 的常用字段。

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `type` | string | — | 是（渲染节点） | 渲染器类型（注册表 42 个；外壳用 `app-shell/menu/menunav/tabs`），菜单树内为 `item/group/divider`（`menu.js:282-293`） |
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
| `name` | string | `"KurumiUI"` | 否 | 应用名。启动层标题（`bootstrap.js:897-933`）、品牌区兜底（`app-shell.js:240-244`）、`app.info`（`app-shell.handlers.js:126-128`） |
| `title` | string | `"刻刻帝终端"` | 否 | 应用标题。品牌/顶部导航标题默认（`:268-269`）；渲染后**改写 `document.title`**（`:535-537`），优先于 `documentTitle`；启动层标题实际取 `name` |
| `subtitle` | string | `"灵装回路 · 时间结界控制台"` | 否 | 启动层副标题（`bootstrap.js:897-933`）、品牌/导航副标题默认（`:242,269`）；缺省回退 `text.app.subtitle` |
| `version` | string | `"1.4.1"` | 否 | 应用版本（演示应用版本，随发布更新）。v1.3.8 起注入 `menu.props.footer.version`（配置未写时补 `'v'+version`）；显式写 `menu.props.footer.version` 仍优先 |
| `documentTitle` | string | `"刻刻帝终端 · KurumiUI"` | 否 | 浏览器标题兜底：仅 `title` 缺失时生效（`bootstrap.js:897-933`），实际被 `title` 覆盖 |
| `logoIcon` | string | `"clock"` | 否 | 仅 `menu` 节点**没有** `props.brand` 时兜底品牌区图标（`app-shell.js:239-244`）；也作头像 `fallbackIcon` 兜底（`menu.js:180`） |
| `logoText` | string | `"KUI"` | 否 | 品牌区图标旁徽记文字。v1.3.8 起：`menu.props.brand.logoText` 未写时回落到本字段，由 `menu.js` 渲染 `.kui-menu__logo-text`（有 `avatar` 时不显示） |
| `home` | string | `"pages/home.html"` | 否 | 首页地址。**注意**：`app.home` 动作读取点写成 `get('app.home')`（`app-shell.handlers.js:96-98`），因 §1.4 前缀规则永远取兜底值，改本字段不影响该动作；业务代码请读 `get('app.app.home')` |
| `copyright` | string | `"© KurumiUI · 刻刻帝终端"` | 否 | 页脚版权。v1.3.8 起：`menu.props.footer.copyright` 未写时回落到本字段并渲染（页脚新增 `subtitle/copyright` 两行） |
| `loading` | object | `{"icon":"spinner","text":"灵装回路接通中…","delay":120}` | 否 | 启动层旧字段别名（v1.3.8 起接管）：`icon:spinner`→`clock.mode:'spin'`、`icon:none`→`clock.enabled:false`、`delay`→`hideDelay`、`text`→文案（`bootConfigOf` legacy 分支）；新配置请用顶层 `boot`（§8.5） |

> v1.3.8 起字段读取点由 `npm run audit:config`（`tools/audit-config.js`）静态核对；写字段前先跑一遍，确认有读取点。

---

## 4. ui.*：组件级默认值

`bootstrap.js:935-953` 在创建外壳**之前**把 `ui.tooltip/toast/dialog` 分别传给 `KUI.tooltip.configure`、`KUI.toast.config`、`KUI.dialog.config`，改的是“全局默认值”（启动时生效），单个组件仍可覆盖；配置抛错只 `warnOnce`。

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
| `ui.dialog.escClosable` | boolean | `true` | 否 | ESC 关闭开关。v1.3.8 起 `escClosable`（顶层或 `ui.dialog` 内）会归一为内部字段 `closeOnEsc`，两者等价；单弹窗仍可 `props.closeOnEsc` 覆盖 |

## 5. layout.*：外壳尺寸与 CSS 变量

`app-shell.js:146-193` 读 `layout`，把数字转 px 写到根元素内联样式：`--kui-menu-width`、`--kui-menu-width-collapsed`、`--kui-header-height`、`--kui-tabbar-height`、`--kui-app-gap`；CSS 兜底值在 `base.css:330-335`，不一致时以内联样式为准。

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `gap` | number(px) | `10` | 否 | 外壳四周/区间距 → `--kui-app-gap`（`base.css:335`、`components.css:2509-2510`） |
| `layout.menu.width` / `collapsedWidth` | number(px) | `252` / `68` | 否 | 展开/折叠宽度 → `--kui-menu-width`、`--kui-menu-width-collapsed`（`base.css:768,838`、`components.css:134,770`） |
| `layout.menu.collapsed` | boolean | `false` | 否 | 初始折叠；优先级 `layout.menu.collapsed` > `layout.collapsed` > localStorage `kui-menu-collapsed` > `false`（`app-shell.js:157-163`） |
| `layout.header.height` | number(px) | `56` | 否 | 顶栏高度 → `--kui-header-height`（`base.css:815`、`components.css:189`） |
| `layout.tabbarHeight` | number(px) | `38` | 否 | 标签栏高度 → `--kui-tabbar-height`（`components.css:1386,1463`） |

易错点：值可写数字（自动补 `px`）或带单位字符串（`app-shell.js:43-47`）；`menu.props.width/collapsedWidth` 自 **v1.3.9** 起真正生效（写入 `--kui-menu-width(-collapsed)`，`menu.js:720-727`；旧别名 `--kui-menu-w(-collapsed)` 仍同步写入），且优先级高于 `layout.menu.*`；旧写法 `layout.menu.width` 仍兼容。

## 6. theme.*：主题入口

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `theme.default` | string | `"kurumi"` | 否 | 兜底主题 id（`bootstrap.js:996-1009`）。生效优先级（`theme.js:402-415`）：`__KUI_EARLY_THEME__` > URL `?kuiTheme=` > localStorage[`storageKey`] > 本字段 > `themes.json` 的 default > 第一套 |
| `theme.storageKey` | string | `"kui-theme"` | 否 | 持久化键（`theme.js:20`、`bootstrap.js:1001-1006`）；换键 = 换一份记忆 |
| `theme.persist` | boolean | `true`（源码判断 `persist !== false`） | 否 | 是否写 localStorage（`bootstrap.js:1001-1006`）；关掉后每次刷新从 `default` 开始 |
| `theme.visible` | array | 6 个主题 id | 否 | 可见主题白名单（v1.3.8 起生效）：主题选择器卡片、`app.themeRandom`、`theme.cycle` 都按它过滤（`filterVisibleThemes`，`bootstrap.js:319-331`）；设置弹窗与 `?kuiTheme=` 不受此限 |
| `theme.picker` | object | `{title,desc,columns:3,width:680,showPreview:true,showScheme:true,maskClosable:true}` | 否 | 选择器外观（v1.3.8 起全部生效）：`openThemePicker` 消费 `title/desc/width/maskClosable`，`buildThemePickerNodes` 消费 `columns/showPreview/showScheme`；`showPreview:true` 时卡片用主题 token 绘制渐变块（非真实截图） |

> 想改主题选择器外观：优先调 `theme.picker`（v1.3.8 起生效）；需要结构性改动（自定义节点、额外行为）才改 `src/app/bootstrap.js` 的 `openThemePicker`/`buildThemePickerNodes`（见 [12-extension.md](12-extension.md)）。

## 7. text.*：对 text.json 的增量覆盖

`bootstrap.js:975-977` 先 `KUI.i18n.set(res.text)`（整份 `text.json`）再 `KUI.i18n.set(appCfg.text)`；`i18n.set` 只有第二参 `deep===false` 才浅合并，缺省走 `deepMerge`（`kui.js:416-425`），所以 `app.json.text` 只写要改的叶子键即可。

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

> **头像保存去向（重要）**：`avatar.persist:true`（本仓库默认）时，运行期通过头像弹窗换的图会写入 `localStorage['kui-avatar']`（`storageKey` 可改），**不会写回 `config/app.json`**；启动渲染时该值优先于 `avatar.url`。想恢复成配置文件里的图，删除该键（F12 → Application → Local Storage，或 `localStorage.removeItem('kui-avatar')`）再刷新；把 `persist` 设为 `false` 则运行期选择不再保存。完整持久化表见 §1.3.2。

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
或在 `config/app.json` 的 `text` 里做增量覆盖。实际稳定生效的是 `loading/theme/shell/errorTitle/errorTip/retry/noHost/noConfig`；
v1.3.8 起 `applyBootConfig` 会把 `text.json` 的 `boot` 组传给 `configure`，因此 `boot.subtitle` 可在 `app.subtitle` 为空时兜底显示；
但 `boot.title` 与 `boot.text` 仍会被 `app.name` / `boot.loading` 覆盖（`textCfg` 只填空字段，详见 [16-boot.md](16-boot.md) §5.4 与 §5.5）。

**运行时调试**（控制台）：

```js
KUI.bootLayer.instance().setProgress(42);   // 指针指到 42% → 5:02 附近
KUI.bootLayer.handsAt(42);                   // { percent:42, hourAngle:151.2, minuteAngle:14.4, clockText:"05:02", … }
KUI.bootLayer.configure({ clock: { mode: "spin" } });
KUI.bootLayer.instance().error("配置损坏");   // 失败态卡片
```

**拆装**：不需要加载层时，从 `config/kui-modules.json` 的清单里去掉 `src/components/boot.js` 并重跑 `npm run build:all`，
`bootstrap.js` 会退回 `index.html` 静态骨架；而 `boot.enabled:false` 从 v1.3.8 起**能**关闭加载层（销毁已创建实例、移除 `#kui-boot` 节点并标记 `html[data-kui-boot="off"]`，见下方 §8.5 与 [16-boot.md](16-boot.md) §5.5）。

**观察效果**：打开 `standalone/boot.html`（独立页，内嵌预览 + 0→100 自动演示 + 按进度设置 + spin/错误态按钮）。

## 9. dialogs.settings：打开设置弹窗

`settings.open` 动作读取 `appCfg.dialogs.settings`（`bootstrap.js:776-849`），**`title/desc/width/okText/cancelText/nodes/data/draggable/layout` 全部传给 `KUI.dialog.form`（v1.3.9 起补全）**；提交后由 **`KUI.boot.applySettings`** 统一应用：`shellName/defaultTheme/startTab/remember/density`，并兼容旧 `theme/collapsed/motion`（v1.3.9 起保存真正生效）。

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `dialogs.settings` | object | — | 否 | 设置弹窗预设；不写则用内置 3 节点（主题/折叠/动效，`bootstrap.js:668-696`） |
| `title` | string | `"终端设置"` | 否 | 标题；缺省 `KUI.text('settings.title','界面设置')` |
| `desc` | string | — | 否 | 弹窗副标题（v1.3.9 起透传） |
| `width` | number(px) | `540`（兜底 560） | 否 | 弹窗宽度 |
| `okText` / `cancelText` | string | `"保存设置"` / `"取消"` | 否 | 按钮文案；缺省“确定/取消” |
| `draggable` | boolean | `true` | 否 | 是否可拖拽（v1.3.9 起透传，实际生效） |
| `layout` | object | `{columns:1,gap:14,labelWidth:96,labelPosition:"left"}` | 否 | 字段布局（v1.3.9 起透传，覆盖默认 `vertical`） |
| `data` | object | 5 键初值 | 否 | 表单初值，按节点 id 取；随 `dialog.form` 的 `data` 传入 |
| `nodes` | array | 5 个节点 | 否 | 表单节点数组（结构见 07）；空/缺省回退内置节点 |

**v1.3.9 起 5 个内置节点的保存去向**（提交后立即应用，并写入当前浏览器）：

| 节点 id | 提交时调用的应用逻辑 | 界面效果 | 持久化键 |
| --- | --- | --- | --- |
| `shellName` | `applyShellName`（设置内 `KUI.boot.applySettings`） | 改终端名称：`document.title`、顶部标题、菜单品牌标题同步变 | `kui-shell-name` |
| `defaultTheme` | `KUI.theme.apply(id)` | 立即换肤（等价主题弹窗选择） | `kui-theme` |
| `startTab` | 写偏好 | 下次启动默认打开/激活该标签 | `kui-start-tab` |
| `remember` | 写偏好 | 关闭后不记忆上次标签 | `kui-remember-tab`（关闭时清 `kui-last-tab`） |
| `density` | `applyDensity` | 界面密度：`normal`/`compact`/`loose` | `kui-density` |

**这些保存都不写 `config/app.json`**：只存在当前浏览器的 localStorage（完整清单、优先级、清除方法见 §1.3.2 与 §1.3.3）；换浏览器、清缓存、无痕窗口都会回到 JSON 默认值。要改“默认值”本身，请改 `config/app.json` 的 `dialogs.settings.data` 与对应字段，并按 §1.3.1 判断是否需要重建。旧的 3 节点 id（`theme`/`collapsed`/`motion`）仍兼容，提交时分别映射到换肤、菜单折叠、界面动效。

最小可运行设置面板（替换 `app.json` 的 `dialogs.settings`）：

```json
{
  "dialogs": { "settings": {
    "title": "界面设置", "desc": "改完立即生效，保存在本浏览器", "width": 520, "okText": "应用",
    "nodes": [
      { "id": "shellName", "type": "input", "label": "终端名称", "required": true },
      { "id": "defaultTheme", "type": "select", "label": "默认主题",
        "options": [ { "label": "绯红刻刻帝", "value": "kurumi" }, { "label": "白羽灵装", "value": "kurumi-angel" } ] },
      { "id": "density", "type": "radio-group", "label": "界面密度",
        "options": [ { "label": "标准", "value": "normal" }, { "label": "紧凑", "value": "compact" } ] }
    ],
    "data": { "shellName": "刻刻帝终端", "defaultTheme": "kurumi", "density": "normal" }
  } }
}
```

打开方式：`KUI.actions.run('settings.open')`，或顶部导航“设置”按钮（`app.json:656-658` 的 `action: "settings.open"`）。

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

`{"type":"menunav","props":{...}}`；`breadcrumb{enabled,home,items,separator}`；`actions[]` 每项 `id/icon/label/title/badge/badgeType/action/disabled`（`menunav.js:444-488`），点击执行 `action || id`。`title/subtitle` 不写时用 `app.title/subtitle` 兜底（`app-shell.js:268-269`）。**面包屑折叠**：顶层 `maxBreadcrumb`（`menunav.js` 归一后读取）与 v1.3.9 起支持的 `breadcrumb.max` 等价，`0` 不裁剪；二者同时写时以 `maxBreadcrumb` 为准。

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

> 通用步骤：改 `config/app.json` → http(s) 模式下**刷新即生效**；用 `file://` 双击或离线分发的，先 `npm run build:config`（`npm start` 启动时会自动重建）→ 再硬刷新。是否需要重建的完整判定见 §1.3.1。下文的“改前”即仓库当前值。

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

把 §9 示例粘到 `dialogs.settings`，点顶栏“设置”；标题/宽度/节点按配置渲染，输入终端名并保存会改 `document.title` 与菜单品牌标题（`shellName`），选主题保存会真正换肤（`defaultTheme` → `KUI.theme.apply`），`desc` 作为副标题显示、`draggable` 可拖拽、`layout` 控制字段布局（v1.3.9 起全部生效）；保存结果写入 localStorage（§1.3.2），不改配置文件。

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
| 字段写了完全没效果 | 该字段无源码消费点 | 跑 `npm run audit:config` 看读取点，或 `grep -rn "字段名" src/` |
| `ui.dialog.escClosable` 无效 | v1.3.8 前内部字段名是 `closeOnEsc` | v1.3.8 起两种写法等价；旧版本请写 `ui.dialog.closeOnEsc` 或单弹窗 `props.closeOnEsc` |
| 面包屑不折叠 | `breadcrumb.max` 与 `maxBreadcrumb` 同时写且以 `maxBreadcrumb` 为准，或写了 0 | v1.3.9 起两种写法等价；检查是否被 `maxBreadcrumb` 覆盖，`0` 表示不裁剪（§10.2） |
| 改 `menu.props.width` 没变宽 | v1.3.7 及更早只写内部变量；v1.3.9 起 props 真正生效、优先级高于 `layout.menu.*` | 确认 `KUI.version` ≥ 1.3.9；两处都写时以 `menu.props.width/collapsedWidth` 为准，改完刷新（§5、§10.1） |
| 设置弹窗保存后好像没变 | 保存的是 localStorage；换浏览器/清缓存就回到 JSON 默认值；旧版本（<1.3.9）只弹提示不应用 | v1.3.9 起 5 个内置节点真正应用（§9）；验证用同一浏览器，或看 Application → Local Storage（§1.3.2） |
| 想让所有访问者看到新标题/新主题 | 只改了自己浏览器的 localStorage，或改了 JSON 但没重建 | 改 `config/app.json`/`src/themes.json` 默认值，按 §1.3.1 决定是否 `npm run build:config`；再清自己的 localStorage 验证 |
| 初始标签不对 | `home` 先开、`initial` 后补开 | 调 `tabs.props.initial` 顺序或改 `home`（§10.3） |
| 改 `pages/*.html` 内联数据没反应 | 页面优先读 `config/demos/*.json` | 改 `config/demos/xxx.json`（`pages/form.html:195-197`） |
| 主题默认值不生效 | localStorage 有上次选择 / URL 带 `?kuiTheme=` | 清 `localStorage['kui-theme']` 再刷新（§6、§1.3.2）；只想改“首次进入的默认值”就改 `theme.default`/`themes.json.default`（§1.3.3） |
| 改了 JSON 刷新还是旧内容 | 用 `file://` 打开但没 `npm run build:config`；或静态部署没上传/没更新 `config/*.json` | 按 §1.3.1 矩阵判断：http 刷新即生效；file:// 与 bundle-only 部署必须重建；服务端/CDN 还要刷缓存 |
| `KUI.config.get('app.title')` 返回 undefined | 前缀后路径相对文件根 | 写 `get('app.app.title')`（§1.4） |

---

## 本章自检（含 boot 自检）

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
[build-all] profiles: app=30, standalone=29
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

- `config/app.json`（755 行，行号唯一依据）；`config/text.json`、`src/themes.json`、`config/kui-modules.json`。
- `src/core/config.js:25-31,73-77,82-96,148-212,252-271` —— 路径表/读取管线/`get` 语义；`src/app/bootstrap.js:875-953`（元信息/UI 默认值）、`:955-1054`（主流程）、`:668-849`（设置弹窗）、`:333-445`（主题选择器）。
- `src/components/app-shell.js:25-32,76-85,141-193,237-291,535-550,565-589` —— 布局、装配、标题与初始标签；`menu.js:118-153,211-260,276-383,504-574,716-717,733-782`、`menunav.js:121-159,341-423,444-488`、`tabs.js:143-181,406,538-539,1342-1361` —— 三节点消费。
- `src/core/theme.js:20,201-223,297,402-425`、`tooltip.js:36-46,64-86`、`toast.js:123-142`、`dialog.js:137,427,986-1014,1055,1087-1150`、`avatar.js:91-133,238-353,359-429,545-554,615`、`kui.js:413-464` —— 各字段默认值与读取；`tools/build-config.js:23-131`、`tools/build-all.js`。



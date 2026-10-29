# KurumiUI 使用手册

> **适用版本：KurumiUI v1.4.4** ｜ 适用仓库：`SuLiyue-s/KurumiUI`（main 分支）｜ 手册语言：中文
> 本手册的所有字段、默认值、数量与行为，均以**仓库源码与运行时可枚举结果**为准；与 `docs/` 下旧文档或 `README.md` 冲突时，以源码为准（旧文档是设计档案，本手册是操作指南）。

---

## 0. 这是一本什么手册

KurumiUI 是一个**配置驱动、可拆解**的 UI 框架：界面由 JSON 配置 + 少量 HTML 骨架拼装而成，浏览器用传统 `<script>` 直接加载（零构建产物依赖打包器、零运行时依赖），`file://` 双击 `index.html` 也能打开。

本手册按一个真实使用者的路径组织，共 **六个部分、16 章**：

| 部分 | 章节 | 回答的问题 |
| --- | --- | --- |
| 一、快速上手 | 01、02 | 怎么装、怎么跑、怎么构建 |
| 二、组装与配置 | 03、04 | 页面由哪些零件组成、`app.json` 每个字段是干什么的 |
| 三、组件与交互 | 05–08、10、11、16 | 每个控件/组件/动作/API 怎么用；加载层怎么装配与拆走 |
| 四、主题与扩展 | 09、12 | 怎么换肤、怎么加自己的控件与页面 |
| 五、实战与部署 | 13、14 | 从零做一个页面、怎么部署与跨项目复用 |
| 六、维护 | 15 | 出问题怎么查、上线前怎么验收 |

**你可以只读需要的章节**：每章都是自包含的，开头有元信息行（适用版本 / 前置章节 / 阅读时长），结尾有「本章自检」和「参考源码」。

> 📌 **第一次接触命令行或前端？** 本手册偏「操作参考 + 字段级细节」，默认你能跑起项目。如果连 Node.js、终端、JSON 都还不熟，请先读 **[小白入门手册](../manual-beginner/README.md)**（10 章，从装环境讲到部署），再回来查字段。两份手册内容互补，可随时互跳。

---

## 1. 30 秒跑起来

```bash
# 1) 获取源码（仓库无子模块、无依赖，克隆即可用）
git clone git@github.com:SuLiyue-s/KurumiUI.git
cd KurumiUI

# 2) 启动（零依赖，不需要 npm install）
npm start
# 等价于：node server.js          → http://127.0.0.1:8080
# 端口被占用：node server.js --port 9000
```

或者**完全不启动服务器**：直接用浏览器打开仓库根目录的 `index.html`（`file://` 模式可用，配置从 `config/bundle.js` 兜底加载）。

改完 `config/*.json` 后：用 `npm start`（`http://`）时刷新页面即生效（页面直接 fetch 原始 JSON）；用 `file://` 双击打开、或要把产物打包分发时，**必须**重建配置包再刷新：

```bash
npm run build:config   # = node tools/build-config.js && node tools/build-all.js
```

**哪些改完刷新即可、哪些必须重建？** 记住两条边界：① 配置类（`app.json`/`text.json`/`themes.json`/`demos`）在 http(s) 下刷新即生效，`file://` 或“只部署了 bundle.js”时必须重建；② **`config/kui-modules.json` 任何模式都必须重建**（它生成 `kui-all.js` 的脚本清单）。完整判定矩阵见 [04-config-app.md](04-config-app.md) §1.3.1。

**界面里保存的标题名、皮肤等存在哪？** 全部存入**当前浏览器的 localStorage**（`kui-theme`、`kui-shell-name`、`kui-start-tab`、`kui-density`、`kui-avatar`、`kui-menu-collapsed` 等），**不会写 `config/*.json`**；配置 JSON 只提供默认值。因此换浏览器/清缓存会回到默认值；要让所有访问者看到新的默认标题/皮肤，请改配置 JSON 并按上面的规则决定是否重建。存储键全表、优先级与清除方法见 [04-config-app.md](04-config-app.md) §1.3.2～§1.3.3。

详细步骤见 [01-install.md](01-install.md)；构建原理见 [02-build.md](02-build.md)。

---

## 2. 手册怎么读（6 条路线）

| 路线 | 适合谁 | 阅读顺序 | 预计 |
| --- | --- | --- | --- |
| A. 第一次跑通 | 刚拿到仓库的人 | 01 → 03 → 13（案例 A） | 40 分钟 |
| B. 只改配置做界面 | 业务开发者（不写框架代码） | 04 → 08 → 05 / 06 → 07 → 10 | 3 小时 |
| C. 把组件搬进现有项目 | 已有站点、只想要某些组件 | 03 → 06 / 08（按需）→ 11 → 14 | 2 小时 |
| D. 扩展框架 | 框架开发者 | 12 → 08 / 09 → 10 / 11 | 半天 |
| E. 部署与维护 | 运维 / 负责人 | 14 → 02 → 15 | 1.5 小时 |
| F. 定制启动屏 / 加载动画 | 想改开屏体验的人 | 16 → 04（`boot` 段）→ 09（token 换色） | 1 小时 |

读之前建议先记住三个词：**节点（node）**、**配置（config）**、**装配（profile）**；它们的含义见第 4 节术语表。

---

## 3. 章节索引

| 章 | 文件 | 讲什么 | 前置 |
| --- | --- | --- | --- |
| 01 | [01-install.md](01-install.md) | 环境要求、获取源码、首次运行、验证安装、目录地图、卸载 | — |
| 02 | [02-build.md](02-build.md) | 构建原理：`build-config`（配置包）与 `build-all`（入口聚合）、产物格式、构建矩阵、工程化校验命令 | 01 |
| 03 | [03-assembly.md](03-assembly.md) | 组装：`index.html` 逐行解剖、加载顺序、启动时序、5 种装配配方、iframe 体系 | 01 |
| 04 | [04-config-app.md](04-config-app.md) | 配置总览 + `app.json` 全字段（`app`/`ui`/`layout`/`theme`/`avatar`/`text`/`dialogs`/`menu`/`menunav`/`tabs`）＋ **生效判定矩阵（改 JSON 即生效 vs 必须重建）** 与 **运行时持久化（界面保存的参数存 localStorage）** | 03 |
| 05 | [05-controls-input.md](05-controls-input.md) | 19 个表单控件（input、select、date、slider…）逐字段、事件、实例 API | 04 |
| 06 | [06-controls-display.md](06-controls-display.md) | 其余控件（按钮、图标、表格、分页、上传、头像、标签…）逐字段 | 04 |
| 07 | [07-form-engine.md](07-form-engine.md) | 表单引擎：布局、数据绑定、校验、依赖联动、实例 API、`dialog.form` | 05 |
| 08 | [08-components.md](08-components.md) | 七大组件：`menu`、`menunav`、`tabs`、`dialog`、`toast`、`app-shell`、`boot` 的 props / 事件 / API（`boot` 的完整配置与拆装见 [16-boot.md](16-boot.md)） | 04 |
| 09 | [09-theme.md](09-theme.md) | 主题系统：`themes.json` 结构、token 全表、装饰层、切换与自定义主题 | 04 |
| 10 | [10-actions-handlers.md](10-actions-handlers.md) | `on` 事件语法、28 个内置动作、7 个 scope 共 61 个业务函数 | 08 |
| 11 | [11-api-messaging.md](11-api-messaging.md) | `KUI.*` API 全表、`kui-frame` / `dialog-frame`、postMessage 协议 | 08 |
| 12 | [12-extension.md](12-extension.md) | 扩展：新控件、新组件、新主题、新动作、新函数、新页面、新 profile | 05–11 |
| 13 | [13-walkthrough.md](13-walkthrough.md) | 三个端到端实战（管理台 / 嵌入现有站点 / 离线工具页） | 03–12 |
| 14 | [14-deploy.md](14-deploy.md) | 部署与跨项目复用：静态托管、子路径、iframe、抽取复用、升级 | 02、03 |
| 15 | [15-troubleshooting.md](15-troubleshooting.md) | 排错手册、FAQ、诊断工具、上线验收清单 | 全部 |
| 16 | [16-boot.md](16-boot.md) | 加载层组件 `boot`：启动屏、时钟指针进度算法、结构化拆装、接入自有项目/跨项目复用 | 03、04、08 |

> 手册配套校验脚本：`node tools/check-manual.js`（检查 JSON 示例可解析、字段/类型/动作/链接/数量口径与运行时一致）。改动手册后建议跑一次；小白手册对应 `node tools/check-beginner-manual.js`。

---

## 4. 术语表

| 术语 | 含义 | 详见 |
| --- | --- | --- |
| KUI | 框架暴露在 `window.KUI` 上的全局命名空间（`KUI.registry`、`KUI.form` 等） | 11 |
| 节点 / node | 一个 JSON 对象 `{ "type": "...", "props": {...}, ... }`，是界面描述的最小单位 | 03、04 |
| type | 节点的类型名，决定用哪个注册器渲染（共 42 个，见附录 A） | 08 |
| props | 节点的属性包，字段由对应 type 的注册器定义 | 05–08 |
| profile | 模块清单。`config/kui-modules.json` 里定义「一个入口要加载哪些 JS」，如 `app`、`standalone` | 02、03 |
| 入口聚合文件 | `src/core/kui-all.js`，构建时按 profile 生成，浏览器只引它一个 | 02 |
| 配置包 | `config/bundle.js`，构建时把 `app.json` + `text.json` + `themes.json` + `demos/*.json` 打包成 `window.__KUI_BUNDLE__` | 02、04 |
| 配置读取优先级 | 注入 reader（测试/Node）→ HTTP `fetch` → `window.__KUI_BUNDLE__`（含父窗口）→ 报错 | 04 |
| 注册表 / registry | `KUI.registry.register(type, def)` 的登记处，`KUI.registry.list()` 可枚举全部类型 | 12 |
| 动作 / action | 字符串描述的可执行命令，如 `theme.next`、`tab.open`，写在节点的 `on` 字段里 | 10 |
| 业务函数 / handler | 按 scope 注册的函数，如 `app.openTab`、`dialog.confirm`、`form.validate`，可在 `on` 中被调用 | 10 |
| scope | 业务函数的分组：`app`、`dialog`、`form`、`menu`、`menunav`、`tabs`、`toast` | 10 |
| token | CSS 变量（`--kui-*`），主题通过覆盖 token 换肤 | 09 |
| 主题 / theme | `src/themes.json` 中的一套 token + 装饰配置，内置 6 套 | 09 |
| 装饰层 / art | 主题附带的背景装饰（齿轮、星轨等），由 `theme-art.js` 渲染 | 09 |
| 外壳 / app-shell | 整个应用的布局骨架：菜单 + 导航 + 标签栏 + 内容 iframe | 08 |
| menu / menunav / tabs | 侧边菜单 / 顶部导航（含面包屑）/ 多标签工作区 | 08 |
| dialog / toast | 对话框 / 轻提示，二者也是可 `type` 渲染的节点 | 08 |
| standalone | 不依赖 app-shell 的独立渲染页（`standalone/*.html`），用于演示或嵌入 | 03 |
| pages | 主应用 iframe 里加载的业务页（`pages/*.html`） | 03、13 |
| kui-frame | `src/frame/kui-frame.js`，父页面操作 iframe 内 KUI 的桥接层 | 11 |
| dialog-frame | `src/frame/dialog-frame.html/js`，iframe 内的弹窗宿主页 | 11 |
| postMessage | iframe 父子页通信机制，框架在此基础上定义了消息协议 | 11 |
| FOUC | 样式/主题闪烁。`theme-boot.js` 在首屏前恢复到上次主题以避免它 | 09 |
| demo | `config/demos/*.json`，各组件/控件的示例配置，构建进配置包 | 02、04 |
| schema | 配置文件里的版本标记（如 `"schema": "kurumi-app/1"`），约定字段结构版本 | 04 |

---

## 5. 版本与兼容矩阵

| 项目 | 值 | 说明 |
| --- | --- | --- |
| 框架版本 | **1.4.4** | 需四处一致：`src/core/kui.js`、`src/frame/kui-frame.js`、`src/core/dom-enhance.js`、`package.json`（`npm run audit` 的 E1 校验） |
| Node.js | **≥ 13.14.0** | `package.json` 的 `engines`；仓库用 `.tools/node-v13.14.0-win-x64` 实测，与 Node 24 双版本通过 |
| npm 依赖 | **0** | `package.json` 无 `dependencies` / `devDependencies`，克隆后无需 `npm install` |
| 构建方式 | 无打包器 | 两个自研 Node 脚本：`tools/build-config.js`、`tools/build-all.js` |
| 浏览器加载 | 传统 `<script>` | 无 ESM/打包要求；`src/core/kui-all.js` 负责按顺序注入模块 |
| 浏览器环境 | 支持传统 `<script>`、CSS 变量、`fetch`（可缺省）的现代浏览器 | `file://` 下 `fetch` 不可用时自动回退配置包 |
| 静态托管 | 任意静态服务器 | 必须带上构建产物 `config/bundle.js` 与 `src/core/kui-all.js` |
| 内置服务器 | `node server.js` | 开发/局域网演示用；默认 `127.0.0.1:8080`，端口占用自动 +1 |
| 授权 | MIT | 可商用、可私有化 |

---

## 6. 命令速查

`package.json` 中的脚本（全部零依赖）：

| 命令 | 实际执行 | 用途 |
| --- | --- | --- |
| `npm start` / `npm run serve` | `node server.js` | 启动内置静态服务器（启动时自动重建两个产物） |
| `npm run build` | `node tools/build-config.js && node tools/build-all.js` | 重建配置包 + 入口聚合 |
| `npm run build:config` | 同 `npm run build`（二者命令完全相同） | 只改配置时最常用 |
| `npm run build:all` | `node tools/build-all.js` | 只重建 `src/core/kui-all.js` |
| `npm test` | `node test/run.js` | 单元/集成测试（compat / config / server / render） |
| `npm run test:node13` | `.tools/node-v13.14.0-win-x64/node.exe test/run.js` | 用 Node 13.14 复跑，验证低版本兼容 |
| `npm run verify` | `smoke.js && verify-handlers-demo.js && verify-dialog-bridge.js` | 冒烟 + 动作演示 + 弹窗桥接验证 |
| `npm run smoke` | `node tools/smoke.js` | 浏览器端冒烟（支持 `--only=list` 列分节） |
| `npm run audit` | 一致性审计 + 组件拆装审计 | 版本号/清单/文档口径一致性、组件可拆装性 |
| `npm run check:assets` | `node tools/check-assets.js` | HTML 引用的 JS/CSS 是否齐全 |
| `npm run check:compat` | `node tools/check-compat.js` | Node 13.14 语法黑名单扫描 |
| `npm run shot` | `node tools/screenshot.js` | 页面截图 |
| `node tools/check-manual.js` | 本手册校验脚本 | 手册示例/字段/链接/数量口径校验 |

`server.js` 支持的参数（源码 `server.js:44-61`）：

```bash
node server.js [--port 8080] [--host 127.0.0.1] [--quiet]
# 也支持 --port=8080 / --host=0.0.0.0 写法；--help 打印用法
```

---

## 7. 字段表怎么读

手册中的字段表统一为 5 列：

| 列 | 含义 |
| --- | --- |
| 字段 | 配置键名，嵌套路径用 `props.xxx` 或 `a.b.c` 表示 |
| 类型 | `string` / `number` / `boolean` / `object` / `array` / `function` / `enum(...)` |
| 默认值 | 源码中的兜底值；写「源码未设默认」表示源码没有 `||` 兜底或默认表项 |
| 必填 | 「是」表示不写会渲染异常或行为不完整；「否」表示省略有默认行为 |
| 作用与取值 | 字段效果、取值枚举、生效时机、关联字段 |

约定：

- 源码引用格式 `src/components/tabs.js:120`，可据此直接跳转核对。
- 示例中 JSON 可直接复制到 `config/*.json` 或节点数组；`jsonc` 代码块仅用于展示注释，实际文件不能带注释。
- 「→ 见 08-components.md」表示该字段的完整说明在另一章，本章不重复。

---

## 8. 附录 A：42 个注册类型（按 category 分组）

运行时枚举命令见 `02-build.md`；分类来自 `KUI.registry.list()` 的 `category` 字段。

**action（2）**

| type | 说明 | 章节 |
| --- | --- | --- |
| `button` | 按钮：变体、图标、loading、块级、圆形 | 06 |
| `link` | 文字链接：href / target / 点击动作 | 06 |

**display（5）**

| type | 说明 | 章节 |
| --- | --- | --- |
| `avatar` | 头像：URL、形状、尺寸、时钟齿轮框、选图器 | 06 / 04 |
| `badge` | 徽标：文本、颜色、圆点、计数上限 | 06 |
| `icon` | 图标：内置图标集，支持颜色/尺寸/旋转 | 06 |
| `tag` | 标签：颜色、尺寸、可关闭 | 06 |
| `text` | 富文本片段：文本/HTML、字体、颜色 | 06 |

**control（19，表单类）**

| type | 说明 | 章节 |
| --- | --- | --- |
| `input` | 单行文本 | 05 |
| `password` | 密码（可切换可见） | 05 |
| `textarea` | 多行文本（可计数、可自适应） | 05 |
| `number` | 数字（步长、范围、精度） | 05 |
| `select` | 单选下拉 | 05 |
| `multiselect` | 多选下拉 | 05 |
| `checkbox` | 单个复选框 | 05 |
| `checkbox-group` | 复选框组 | 05 |
| `radio` | 单个单选框 | 05 |
| `radio-group` | 单选组 | 05 |
| `switch` | 开关 | 05 |
| `slider` | 滑块 | 05 |
| `rating` | 评分 | 05 |
| `color` | 颜色选择 | 05 |
| `date` | 日期 | 05 |
| `daterange` | 日期区间 | 05 |
| `month` | 月份 | 05 |
| `time` | 时间 | 05 |
| `datetime` | 日期时间 | 05 |

**feedback（2）**

| type | 说明 | 章节 |
| --- | --- | --- |
| `alert` | 内联提示条：类型、标题、描述、可关闭 | 06 |
| `progress` | 进度条：百分比、颜色、尺寸 | 06 |

**data（4）**

| type | 说明 | 章节 |
| --- | --- | --- |
| `table` | 表格：列定义、空态、行操作 | 06 |
| `pagination` | 分页：页码、总数、每页条数 | 06 |
| `upload` | 上传：选择按钮、多文件、类型/大小限制 | 06 |
| `datatable` | 数据表格（v1.4.0 起）：一体化配置、筛选/排序/分页/选择/工具栏/导出 | 08 §6.6 |

**layout（4）**

| type | 说明 | 章节 |
| --- | --- | --- |
| `divider` | 分割线：方向、文案、间距 | 06 |
| `field` | 字段行：标签 + 内容 + 提示的布局单元 | 06 |
| `form` | 表单容器：布局、数据、校验、联动 | 07 |
| `app-shell` | 应用外壳：菜单 + 导航 + 标签栏 + 内容区 | 08 |

**shell（6）**

| type | 说明 | 章节 |
| --- | --- | --- |
| `menu` | 侧边菜单：分组、徽标、折叠、flyout、搜索 | 08 |
| `menunav` | 顶部导航：折叠/历史/刷新/全屏、面包屑、动作按钮 | 08 |
| `tabs` | 标签工作区：关闭策略、keepAlive、右键菜单、拖拽 | 08 |
| `dialog` | 对话框：标题/内容/按钮、可拖拽、遮罩/ESC 策略 | 08 |
| `toast` | 轻提示：位置、停留时长、堆叠上限 | 08 |
| `boot` | 加载层：时钟指针随进度 0→12 时、阶段文案、进度条（v1.3.8 新增；完整用法见 [16-boot.md](16-boot.md)） | 08、16 |

---

## 9. 附录 B：28 个内置动作

`KUI.actions.list()` 可枚举；逐条参数与示例见 [10-actions-handlers.md](10-actions-handlers.md)。

```
app.collapse      app.fullscreen    app.refresh       clipboard.copy
dialog.alert      dialog.close      dialog.closeAll   dialog.confirm
dialog.custom     dialog.form       dialog.prompt     handlers.run
tab.activate      tab.close         tab.closeAll      tab.closeOthers
tab.open          tab.refresh       theme.apply       theme.next
theme.prev        toast.clear       toast.error       toast.info
toast.notify      toast.show        toast.success     toast.warning
```

## 10. 附录 C：业务函数 scope 概览

`KUI.handlers.list()` 共 **61** 个，按 scope 分组：

| scope | 数量 | 代表函数 |
| --- | --- | --- |
| `app` | 12 | `app.openTab`、`app.closeTab`、`app.openHome`、`app.setTheme` |
| `dialog` | 8 | `dialog.alert`、`dialog.confirm`、`dialog.form`、`dialog.close` |
| `form` | 11 | `form.getData`、`form.setData`、`form.validate`、`form.setValue` |
| `menu` | 8 | `menu.select`、`menu.collapse`、`menu.expand`、`menu.setBadge` |
| `menunav` | 7 | `menunav.back`、`menunav.forward`、`menunav.setTitle`、`menunav.setBreadcrumb` |
| `tabs` | 8 | `tabs.open`、`tabs.closeActive`、`tabs.closeOthers`、`tabs.refreshActive` |
| `toast` | 7 | `toast.show`、`toast.success`、`toast.error`、`toast.demo` |

> 各函数的签名、参数、返回值与示例见 [10-actions-handlers.md](10-actions-handlers.md)；调用方式（`on` 字段、`KUI.handlers.run`、`KUI.xxx` 实例方法）见同章与 [11-api-messaging.md](11-api-messaging.md)。

---

## 11. 手册的维护约定

- **改配置不用改手册**；改源码（新增 type / action / handler / theme / 字段）时，按第 3 节索引更新对应章节，并跑 `node tools/check-manual.js` 与 `node tools/check-beginner-manual.js`（后者校验小白手册）。
- 手册中的数量口径（42 / 19 / 28 / 61 / 6）由校验脚本与运行时枚举比对；历史口径需加「截至 v1.3.8」等限定语。
- 报告手册问题请附：章节文件 + 小节标题 + 复现步骤（命令/配置片段）+ 期望 vs 实际。

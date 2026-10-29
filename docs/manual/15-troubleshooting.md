# 15 · 排错手册、FAQ 与上线验收清单

> 适用版本：KurumiUI v1.4.0 ｜ 前置章节：[03-assembly.md](03-assembly.md)、[11-api-messaging.md](11-api-messaging.md) ｜ 阅读时长：约 20 分钟

## 本章目标

- 拿到一个「白屏 / 没反应 / 样式丢 / 部署后 404」的现场，能在 5 分钟内判断问题出在哪一层；
- 会打开并使用 KurumiUI 内置诊断面板，把现场信息完整取证；
- 能按「错误关键词 → 原因 → 处理」对照表直接修掉 90% 的常见问题；
- 上线前能按清单逐项验收，避免「本地能跑、线上不行」。

本章是**速查手册**，不是教程：每个条目都给「现象 → 原因 → 处理」。原理与字段细节请回看对应章节。

---

## 0. 五分钟分诊：问题在哪一层

先不要改代码。按现象查下表，直接跳到对应小节。

| 现象 | 最可能的层 | 先查什么 |
| --- | --- | --- |
| 整页全白，一个元素都没有 | 组装 / 加载 | 控制台 404、脚本顺序、`kui-all.js` 是否存在 |
| 浏览器连 `index.html` 都打不开 | 安装 / 服务器 | `npm start` 是否在跑、端口是否被占 |
| 有外壳（菜单/头部）但主区域空白 | 配置 / 页面 | `pages/*.html` 是否存在、菜单 `target.tab.url` 是否 404 |
| 某个控件显示成一块灰色占位 | 控件加载 | 该控件的 `<script>` 是否在 profile 里、type 拼写 |
| 按钮点了完全没反应 | 动作 / 业务函数 | 控制台 `未注册的动作` / `未注册的业务函数` |
| 点击后报错但页面不崩 | 动作 / 业务函数 | 控制台 `动作异常 [xxx]`、`业务函数异常 [xxx]` |
| 样式全丢（纯 HTML 外观） | 样式加载 | `base.css` 是否 404、CSS 引入顺序 |
| 打开瞬间白屏再变黑（或反过来） | 主题 / FOUC | `theme-boot.js` 是否是 `<head>` 第一段脚本 |
| 控制台大量 `配置读取失败` | 配置 / 构建 | `config/bundle.js` 是否存在、是否 `file://` 打开 |
| 弹窗里输入卡顿 / 点不动 | 弹窗桥 / 浏览器 | `?kui_debug=1` 看 longtask、消息计数 |
| iframe 页面整块空白 | 子页加载 | 子页是否按 `standalone` profile 引入脚本 |
| 端口被占 / 起不来 | 服务器 | `EADDRINUSE`，server.js 会自动 +1 端口 |
| `npm run build` 报错 | 构建 | 缺失 profile 文件、Node 版本过低 |
| 本地正常、部署后 404 | 部署 | 上传目录是否完整、路径大小写、MIME |
| 部署后还是旧版本 | 缓存 | 强制刷新、`?kui_v=`、托管缓存策略 |

---

## 1. 诊断工具箱（按优先级使用）

### 1.1 `KUI.info()`：一秒钟确认版本与加载量

在控制台执行：

```js
KUI.info()
// => { name: "KurumiUI", version: "1.3.9", controls: 41, themes: 6, env: {...} }
```

| 返回字段 | 含义 | 异常时的含义 |
| --- | --- | --- |
| `name` | 框架名，恒为 `KurumiUI` | 不是它 → 页面里跑的是别的库或被覆盖 |
| `version` | 当前运行时版本（源码 [src/core/kui.js:21](../../src/core/kui.js#L21)） | 与 `package.json` 不一致 → 加载了旧产物 |
| `controls` | `KUI.registry.list().length` | 远小于 40 → 有脚本没加载（见 1.3） |
| `themes` | `KUI.theme.list().length` | 为 0 → `themes.json` 没加载或 `theme.load()` 未执行 |
| `env` | `isBrowser / isNode / nodeVersion` | 在浏览器里 `isBrowser` 应为 true |

严格来说 `controls` 统计的是**所有注册类型**（含组件），v1.3.9 是 41 个，不是 19 个表单控件。实现见 [src/core/kui.js:1322-1330](../../src/core/kui.js#L1322-L1330)。

### 1.2 `?kui_debug=1` 诊断面板（推荐第一时间打开）

在地址后加参数即可启用（实现见 [src/core/diag.js](../../src/core/diag.js)）：

```text
http://127.0.0.1:8080/?kui_debug=1
```

启用后页面右下角出现可折叠面板，实时记录：

| 记录类别 | 面板前缀 | 能回答什么问题 |
| --- | --- | --- |
| 环境 | `env` | 版本、UA、视口、DPR、当前主题、是否在 iframe 内 |
| 全局异常 | `error` | `window.onerror`：哪个文件哪一行报了什么错 |
| Promise 异常 | `reject` | 未处理的 `unhandledrejection`（异步动作失败常静默在这里） |
| 长任务 | `longtask` | 主线程卡顿 >120ms 的时间点（点按钮「没反应」的元凶） |
| 焦点 | `focus` | `focusin` 进入哪个元素（排查弹窗抢焦点、输入框点不动） |
| 输入耗时 | `type` | keydown/input 事件序号、耗时、输入框长度 |
| 消息 | `msg` | `dialog:*` / `theme:*` / `frame:*` 的 postMessage 收发 |
| 启动 | `boot` | 诊断面板自身启用成功的提示 |

使用方式：

1. 复现问题；
2. 点面板右上角「复制」，把整段文本发给开发者（或贴进 issue）；
3. 只想临时关闭：去掉 URL 参数即可。

面板也可以不通过 URL 启用——在控制台执行 `localStorage.setItem('kui-debug', '1')` 后刷新；清除用 `localStorage.removeItem('kui-debug')`（判断逻辑见 [src/core/diag.js:235-241](../../src/core/diag.js#L235-L241)）。

> 面板自身有独立版本号（历史值为 `1.1.0`，与框架 1.3.9 无关），不要混淆。

### 1.3 控制台错误关键词对照表（源码原话 → 处理）

KurumiUI 的告警都带明确前缀，直接按关键词搜：

| 控制台关键词（原文） | 出处 | 含义 | 处理 |
| --- | --- | --- | --- |
| `未注册的元素类型 "xxx"，已渲染占位节点` | `src/core/kui.js:1009` | 配置里用了没注册的 `type` | 检查拼写；确认该控件脚本已加载（查 `config/kui-modules.json`）；自定义控件是否 `register` 成功 |
| `未注册的动作: xxx` | `src/core/kui.js:869` | `on.click` 里写了不存在的 action | 对照 [10-actions-handlers.md](10-actions-handlers.md) 的 28 个动作 |
| `无法识别的动作配置: xxx` | `src/core/kui.js:816` | 动作配置既不是字符串也不是合法对象 | 改成字符串 `"tab.open"` 或 `{ action: "..." }` 形状 |
| `动作配置缺少 action/emit/theme/tab/toast/dialog 字段` | `src/core/kui.js:857` | 动作对象没有任何可识别字段 | 至少给 `action` 字段 |
| `未注册的业务函数: xxx（请检查对应组件的 handlers 文件是否已加载）` | `src/core/handlers.js:131` | `handlers.run` 目标不存在 | 查 profile 是否漏了 `*.handlers.js`；看 [10-actions-handlers.md](10-actions-handlers.md) |
| `业务函数异常 [scope.name]` | `src/core/handlers.js:147` | 函数体抛错 | 展开控制台堆栈；检查参数是否传对 |
| `动作异常 [name]` / `动作执行异常 [name]` | `src/core/kui.js:875/879` | 动作执行抛错或 Promise reject | 同上，先看 `name` 是什么动作 |
| `配置读取失败（URL），且未找到 config/bundle.js 兜底。请运行 npm run build:config 或使用 npm start。` | `src/core/config.js:202` | 既拉不到 JSON 也没有内联 bundle | 跑 `npm run build:config`；或确认不是 `file://` 且路径正确 |
| `配置读取失败: name (...)` | `src/core/config.js:191` | 单个配置文件读取/解析失败 | 看括号里是 `app`/`text`/`themes` 哪个；检查 JSON 语法 |
| `配置 JSON 解析失败: name -> ...` | `src/core/config.js:103` | JSON 语法错误 | 用 `node -e "JSON.parse(require('fs').readFileSync('config/app.json','utf8'))"` 定位 |
| `图标不存在: name` | `src/core/icons.js:183` | `icon` 值不在图标表 | 查 [06-controls-display.md](06-controls-display.md) 的图标清单 |
| `主题不存在: id` | `src/core/theme.js:301` | `theme.apply` 传了未注册 id | `KUI.theme.ids()` 看可用 id |
| `尚未载入任何主题（请先 theme.load(themesJson)）` | `src/core/theme.js:305` | 主题数据没加载就切换 | 确认 `src/themes.json` 可访问、profile 有 `theme.js` |
| `弹窗消息发送失败（type）：payload 含不可克隆值` | `src/components/dialog.js:316` | postMessage 载荷里有函数/DOM/循环引用 | payload 只放可结构化克隆的纯数据 |
| `KUI.enhance 已存在，跳过重复加载` | `src/core/dom-enhance.js:320` | `dom-enhance.js` 被引入两次 | 查 HTML 是否重复 `<script>`；通常无害 |
| `tabs 组件未加载，无法打开标签页。` | `src/components/app-shell.js:412` | 用了 `tab.open` 但 profile 没有 tabs | 补齐模块或改用非标签页布局 |
| `动作需要先创建 app-shell（KUI.app.create）。` | `src/components/app-shell.js:605` | 用了依赖外壳的动作/接口 | 先按 [03-assembly.md](03-assembly.md) 创建 app-shell |

### 1.4 静态自检命令矩阵

以下命令都在仓库根目录执行，**任何一条失败都先修它，再排查业务问题**：

| 命令 | 检查什么 | 预期 | 失败通常意味着 |
| --- | --- | --- | --- |
| `npm test` | 兼容 / 配置 / 服务器 / 渲染等套件 34 项 | `34 通过 / 0 失败` | 运行时被改动、配置不合法 |
| `npm run verify` | 冒烟 + 两个运行时装配验证 | 全 PASS | 装配链路坏了 |
| `npm run audit` | 一致性 + 组件拆装 | 全 PASS | 文档/契约与源码不一致 |
| `node tools/check-compat.js` | Node 13.14 禁用语法 | `[PASS] 未发现禁用语法` | 用了 `?.`、`??`、`replaceAll` 等 |
| `node tools/check-assets.js` | HTML 引用资源是否存在 | 无缺失 | 路径写错/文件被删 |
| `node tools/audit-all-pages.js` | 所有页面可加载 | 全 PASS | 某个 demo 页面坏了 |
| `node tools/check-manual.js` | 本手册自身校验 | exit 0 | 手册里出现未注册类型/动作/链接 |

> 在受限沙箱里跑 `npm test`，server 套件可能提示「fork 不可用，已降级同进程 HTTP 服务（沙箱限制，非代码缺陷）」，这是环境限制，不是框架缺陷。

### 1.5 网络面板检查清单（F12 → Network）

按顺序看，一条不对就停：

1. `index.html` → `200`，`Content-Type: text/html`；
2. `src/core/theme-boot.js` → `200`，且是**最先**执行的脚本；
3. 4 个 CSS：`base.css` → `controls.css` → `components.css` → `tooltip.css`，全部 `200 text/css`；
4. `src/core/kui-all.js` → `200 application/javascript`；
5. 如果走 HTTP 拉配置：`config/app.json`、`config/text.json`、`src/themes.json` 全部 `200 application/json`；
6. 如果走 bundle 兜底：`config/bundle.js` → `200`，且内容以 `/*! KurumiUI 配置包` 开头；
7. 业务页（`pages/*.html`）与独立页（`standalone/*.html`）是否 `200`；
8. 有没有 `404` / `net::ERR_ABORTED` / `CORS` 红字。

### 1.6 构建产物自检

```bash
# 1) 产物是否存在、多大、什么时候生成的
node -e "var fs=require('fs');['config/bundle.js','src/core/kui-all.js'].forEach(function(f){try{var s=fs.statSync(f);console.log(f,s.size+'B',s.mtime.toISOString())}catch(e){console.log(f,'MISSING')}})"
```

判断标准（v1.3.9 参考值）：

| 文件 | 参考大小 | 内容特征 |
| --- | --- | --- |
| `config/bundle.js` | 约 110–120 KB | 首行 `/*! KurumiUI 配置包（自动生成，请勿手工编辑）`，内含 `__KUI_BUNDLE__` |
| `src/core/kui-all.js` | 约 3–5 KB | 内含 `var MODULES = {`，是模块清单而非框架代码 |

两个文件都被 `.gitignore` 排除，**新克隆的仓库里没有**——这是「配置读取失败」的最常见原因（见 4.1）。

---

## 2. 安装与环境类

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `node` / `npm` 不是内部或外部命令 | Node 未安装或 PATH 未生效 | 安装 Node ≥ 13.14（推荐 18/20 LTS），重开终端；国内可用镜像 |
| `npm start` 报 `Unexpected token '?'` / 语法错误 | Node 低于 13.14 或跑了很旧的运行时 | 升级 Node；也可用 `npm run test:node13` 对比（依赖 `.tools/`） |
| `npm install` 报错 / 等很久 | 本项目**零依赖**，无需安装 | 直接跳过；`npm install` 只会创建空的 `node_modules` |
| `git clone` 超时（SSH 22 被墙） | 网络限制 | 用 HTTPS clone，或按仓库 README 的 SSH 443 端口配置 |
| PowerShell 里 `npm` 提示「无法加载文件，因为在此系统上禁止运行脚本」 | 执行策略限制 | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`，或改用 `cmd` |
| `npm start` 后浏览器打不开 `127.0.0.1:8080` | 端口被占用，server 自动 +1 | 看终端输出的实际端口；或 `node server.js --port 8090` |
| `EADDRINUSE` 连续出现多次 | 一连串端口都被占 | 换大端口：`node server.js --port 18080` |
| 双击 `index.html` 后主题/配置不生效 | `file://` 下 `fetch` 被禁止，只能走 bundle 兜底 | 先 `npm run build:config` 生成 `config/bundle.js`；或改用 `npm start` |
| 双击打开时浏览器把页面当下载 | `.html` 关联被改 | 用 `npm start`，或右键「打开方式」选浏览器 |
| 杀毒软件拦截 `node server.js` | 监听本地端口被拦 | 放行 node，或换静态服务器 |
| 删除 `node_modules` 后项目照常运行 | 正常——零依赖 | 无需恢复 |

> 判断「是否需要安装依赖」只看一件事：`package.json` 里有没有 `dependencies`。v1.3.9 **一个都没有**，[package.json](../../package.json) 里只有 `engines.node >= 13.14.0` 这条环境声明。

---

## 3. 构建类

### 3.1 `npm run build` 到底做了什么

`package.json` 里 `build` 与 `build:config` 的命令字符串**完全相同**：

```text
node tools/build-config.js && node tools/build-all.js
```

所以「先跑 `build:config` 再跑 `build`」不会重复构建配置，两次执行结果一致——不存在嵌套或跑两遍的问题。见 [package.json:10](../../package.json#L10) 与 [package.json:24](../../package.json#L24)。

| 阶段 | 脚本 | 输入 | 输出 | 失败行为 |
| --- | --- | --- | --- | --- |
| 配置打包 | `tools/build-config.js` | `config/app.json`、`config/text.json`、`src/themes.json`、`config/demos/*.json` | `config/bundle.js`（`window.__KUI_BUNDLE__`） | 缺文件只 `warn`，退出码 0 |
| 模块聚合 | `tools/build-all.js` | `config/kui-modules.json` | `src/core/kui-all.js` | profile 引用文件不存在会 `throw`，退出码 1 |

### 3.2 构建问题对照

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `build:all` 抛 `profile xxx 引用的文件不存在` | `config/kui-modules.json` 里列了不存在的文件 | 按报错路径补文件或从 profile 删掉该项 |
| `build:config` 输出 `[warn] 缺少 xxx` 但退出码 0 | 缺配置文件不阻断 | 确认是有意省略（如无 demos）还是路径写错 |
| 构建成功，浏览器里配置却没变 | 浏览器缓存了旧的 `bundle.js` / JSON | 强刷（Ctrl+F5）；`npm start` 已带 `no-store`；或 URL 加 `?kui_v=1` |
| 改 `app.json` 后 `file://` 打开没变化 | `file://` 读的是 `bundle.js` 里的旧快照 | 重新 `npm run build:config` |
| 改 `app.json` 后 http 打开没变化 | 浏览器缓存；或本机 localStorage 覆盖了该项（主题/终端名/启动页/密度/头像/菜单折叠） | 强刷；清对应 localStorage 键（见 [04-config-app.md](04-config-app.md) §1.3.2～§1.3.3） |
| 部署后改服务器上的 `config/*.json`，线上没变化 | 只上传了 `bundle.js`（fetch 不到 JSON 走兜底）；或 CDN/浏览器缓存；或没上传这些 JSON | 按 [04-config-app.md](04-config-app.md) §1.3.1 判定：要么上传 JSON 并刷 CDN，要么本地重建后重传产物 |
| 改 `config/kui-modules.json` 后页面少脚本/多报错 | 只刷新没重建，`kui-all.js` 里还是旧清单 | `npm run build:config`（或 `npm run build:all`）后强刷（见 [02-build.md](02-build.md) §2.5） |
| 构建后 `kui-all.js` 还是旧模块清单 | 改的是 profile，但没跑 `build:all` | `npm run build:all` 或 `npm run build` |
| Windows 下中文输出乱码 | 终端编码不是 UTF-8 | `chcp 65001` 或改用 Windows Terminal |
| 构建脚本语法报错 | Node < 13.14 | 升级 Node；CI 上锁定 14+ |
| `npm run build` 找不到文件，但目录里明明有 | 路径大小写不一致（Linux 部署时暴露） | 统一小写引用，别依赖 Windows 大小写不敏感 |

### 3.3 构建后必须验证的三件事

```bash
# 1) 两个产物存在且非空
node -e "['config/bundle.js','src/core/kui-all.js'].forEach(f=>{const s=require('fs').statSync(f);if(s.size<100)throw new Error(f+' 太小');console.log(f,s.size)})"

# 2) bundle 内容可求值
node -e "global.window={};require('./config/bundle.js');var b=window.__KUI_BUNDLE__;console.log(Object.keys(b), b.meta && b.meta.tool)"

# 3) 模块清单与 profile 一致（数量）
node -e "var m=require('./src/core/kui-all.js');console.log('app',m.profiles.app.files.length,'standalone',m.profiles.standalone.files.length)"
```

预期：bundle 键含 `app,text,themes,demos,meta`；`app 29 / standalone 28`。

---

## 4. 配置类

### 4.1 控制台报「且未找到 config/bundle.js 兜底」

**完整现象**：

```text
配置读取失败（http://.../config/app.json），且未找到 config/bundle.js 兜底。
请运行 npm run build:config 或使用 npm start。
```

**根因**：`config/app.json` 拉不到（404、路径错、`file://`），而 `config/bundle.js` 又不存在。配置加载优先级是「HTTP fetch → `window.__KUI_BUNDLE__` → 报错」。

**处理三板斧**：

1. `npm run build:config` 生成 `config/bundle.js`；
2. 或 `npm start`（启动时会自动重建两个产物）；
3. 或修好路径：页面在子目录时，`config.js` 会把根路径算成 `../`（见 [02-build.md](02-build.md) 的 base 规则）。

### 4.2 配置类问题对照

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 改了 `app.json` 的标题，页面没变 | 没重建 bundle / 缓存 | `npm run build:config` + 强刷 |
| 改了 `app.json` 的 `boot` 段没反应 | v1.3.7 及更早版本的历史接线缺口（v1.3.8 已修复） | 升级到 v1.3.8+；仍无反应时按缓存/构建流程排查（见上一行） |
| 页面标题变成 `undefined` | 字段名拼错或层级放错 | 用 `node -e` 校验 JSON，并对照 [04-config-app.md](04-config-app.md) |
| 菜单项点了没反应 | `items[].target.tab` 缺 `id` 或 `url` | 补齐 `target.tab`，格式见 [08-components.md](08-components.md) |
| 主题变量改了没效果 | 写进了错误的层（`tokens` 里键名缺 `--kui-` 前缀等） | 对照 [09-theme.md](09-theme.md) 的 token 表 |
| `text.json` 改了但界面文案不变 | `app.json` 的 `text` 内联覆盖了 `text.json` | 二选一，别同时改；优先级见 [04-config-app.md](04-config-app.md) |
| 设置弹窗打不开 | `dialogs.settings.nodes` 里含未注册类型 | 控制台搜「未注册的元素类型」 |
| 配置里中文变乱码 | 文件保存成了 GBK | 统一 UTF-8（无 BOM） |
| 配置合法但页面结构缺一块 | `nodes` 被写成了对象而非数组 | `nodes` 必须是数组，每项含 `type` |

### 4.3 配置修改的安全流程

```bash
# 1) 改 JSON 前先确认它是合法 JSON
node -e "JSON.parse(require('fs').readFileSync('config/app.json','utf8'));console.log('app.json OK')"
# 2) 重建配置包
npm run build:config
# 3) 起服务看效果（不要用 file:// 验证配置改动）
npm start
```

---

## 5. 控件与表单类

### 5.1 控件不显示 / 显示成占位块

先确认三件事：

1. **type 拼写**：42 个已注册类型见 README 附录 A，19 个表单控件见 [05-controls-input.md](05-controls-input.md)；
2. **脚本是否加载**：`KUI.registry.has('input')` 返回 `true` 才算加载；`false` 说明 profile 里漏了对应文件，或 `kui-all.js` 是旧的；
3. **是否被 `visible:false` / `deps` 隐藏**：控制台执行 `KUI.registry.get('input')` 看 defaults 是否被覆盖。

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `未注册的元素类型 "input"` | 用的是 `standalone` profile 但没加载 `controls/index.js` | 按 [03-assembly.md](03-assembly.md) 补 profile 或改用 `app` |
| 控件显示为灰色方块 | 占位节点（未注册） | 同上，先修注册 |
| 控件渲染了但没样式 | `controls.css` 没引入或顺序错 | CSS 顺序：base → controls → components → tooltip |
| 自定义控件注册后不渲染 | `register` 时没给 `render` 函数 | `registry.register(type,{render}` 必填，见 [12-extension.md](12-extension.md) |
| 同名控件被覆盖 | 后注册的同名类型覆盖前者 | 正常行为；用 `KUI.registry.list()` 确认当前实现 |

### 5.2 表单类问题对照

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `form.getData()` 拿不到某个字段 | 节点没写 `name` | 每个可取值控件必须有唯一 `name` |
| 校验不触发 | 没调 `form.validate()` 或没配 `required` | 见 [07-form-engine.md](07-form-engine.md) |
| 必填校验永远失败 | 值类型与规则不匹配（数字给了字符串） | 用 `number` 控件或规则里放宽 |
| `requiredAny` 不生效 | 组内字段 `name` 拼写不一致 | 组内 name 必须与规则里列的一致 |
| `deps` 联动不触发 | 依赖字段没写 `name`，或条件运算符写错 | 条件表达式写法见 [07-form-engine.md](07-form-engine.md) |
| 重置后值没清空 | `reset` 只回到初始 `data` | 传 `data` 里给默认值，或手动 `setData({})` |
| select 多选取到的是字符串 | 多选控件值应为数组 | 用 `multiselect`；`select` 单选返回字符串 |
| 日期控件取值格式不符 | 不同浏览器 `input[type=date]` 值格式差异 | 统一用 `YYYY-MM-DD`，见 [05-controls-input.md](05-controls-input.md) |
| 上传控件没反应 | 需要自己接 `action`/回调 | 见 [06-controls-display.md](06-controls-display.md) 的 upload |

---

## 6. 组件类（menu / menunav / tabs / dialog / toast / app-shell / boot）

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 点菜单不打开 tab | `target.tab` 缺失或 `url` 404 | 菜单项必须带 `target.tab`；打开网络面板确认子页 200 |
| tab 打开后内容是空白 | 子页用了 `app` profile（会重复建壳） | 子页必须用 `standalone` profile，见 [03-assembly.md](03-assembly.md) |
| tab 切换后 iframe 重新加载 | 期望 keepAlive 但配置关闭 | `tabs.props.keepAlive: true`；确认 `maxTabs` 未触发淘汰 |
| tab 数量超限没提示 | `maxTabs` 达到上限后按策略关闭 | 见 [08-components.md](08-components.md) |
| 弹窗打开是空白 iframe | `dialog-frame.html` 路径 404 | 检查 `src/frame/dialog-frame.html` 是否随项目一起部署 |
| 弹窗按钮点了没反应 | 按钮 `on.click` 的动作未注册 | 控制台搜「未注册的动作」 |
| 弹窗关不掉 | `maskClosable/escClosable` 都关了且没关闭按钮 | 保留 `escClosable: true` 或提供关闭按钮 |
| toast 不出现 | toast 组件脚本没加载或容器被遮挡 | `KUI.toast && KUI.toast.show` 是否存在；检查 z-index |
| 面包屑不更新 | 打开 tab 方式绕过了 app-shell | 用 `KUI.app.openTab()` / `tab.open`，别直接改 iframe |
| 控制台提示「动作需要先创建 app-shell」 | 用了依赖外壳的动作 | 先创建 app-shell，或改用不依赖的动作 |
| 菜单折叠后图标错位 | 未设置 `collapsedWidth` | 配 `layout.menu.collapsedWidth`，见 [04-config-app.md](04-config-app.md) |
| 启动层不出现或一直不消失 | `boot.js` 未加载、配置缺失或启动失败 | 看控制台 `boot:error` 与 `KUI.boot.ready()`；见 [16-boot.md](16-boot.md) §6、§13 |

### 6.1 加载层 boot 专项（v1.3.9）

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 改 `app.json` 的 `boot` 段（stages/clock/bar）毫无变化 | 旧版本接线缺口（v1.3.8 已修复：`boot()` 调用 `applyBootConfig`） | 升级到 v1.3.8+；验证 `KUI.boot.appliedBootConfig` 是否等于 `app.json.boot` |
| 启动层只剩齿轮 logo、没有时钟 | `boot.js` 没进 profile 清单，`attach()` 未接管静态骨架 | 核对 `config/kui-modules.json` 两个 profile 均有 `src/components/boot.js`，重建 `kui-all.js` |
| `KUI.bootLayer.attach()` 返回 `null` | `document.body` 还不存在，或不在浏览器环境 | 在 `DOMContentLoaded` 后调用；Node 侧只有 dom-stub 能模拟 |
| `error()` 之后 `show()` 出来是空白 | `error()` 把 `__inner` 设为 `display:none`，`show()` 只改根节点状态 | 没有 `reset()`：`destroy()` 后重新 `create()`，见 [16-boot.md](16-boot.md) §9 |
| `setStep(9)` 文案不变 | 只精确匹配 `stages[].step`；不匹配时仅写 `data-boot-step` | 用 `setText()` 直接改文案，或把 9 加进 `stages` |
| 监听 `boot:progress` 拿不到 `step`/`clockText` | 真实载荷只有 `{percent, hands}`（`src/components/boot.js:285`） | 需要阶段号就自己读实例 `KUI.bootLayer.instance().getState()` |
| 改 `text.json` 的 `boot.title` 不生效 | `attach()` 已用 `KUI.text()` 兜底填了 title，`configure` 的 textCfg 只在字段为空时生效 | 写 `app.json` 的 `boot.title`（显式 patch），或 `configure({title:'…'})` |
| 启动层在子页出现两次 | 父页与 iframe 子页都 `attach` 了单例 | 子页用 `standalone` profile（无 bootstrap）或 `KUI.bootLayer.destroy()` |
| 只想某页显示启动层 | `app` profile 会自动接管 | 参考 `standalone/boot.html` 用 `KUI.bootLayer.create(host, props)` 手动创建 |

---

## 7. 主题类

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `KUI.theme.list()` 返回 `[]` | `themes.json` 没加载或 `theme.load` 未执行 | 确认 `src/themes.json` 可访问（HTTP 200）；`app` profile 会自动加载 |
| 切换主题无变化 | 目标 id 不存在，或 CSS 变量没挂在 `:root` | `KUI.theme.ids()` 确认 id；检查 `document.documentElement` 上的 `--kui-*` |
| 刷新后主题回到默认 | `storageKey` 未配置或被清 | 见 [09-theme.md](09-theme.md) 的持久化字段 |
| 打开瞬间闪白/闪黑 | `theme-boot.js` 不在 `<head>` 最前 | 必须第一段脚本，见 [index.html](../../index.html) 的 head 顺序 |
| 自定义主题 token 不生效 | token 名拼错或写在了错误的主题对象里 | 对照 token 全表；`KUI.theme.tokensOf(id)` 看解析结果 |
| 装饰层（art）不显示 | `art` 配置缺字段，或容器被 CSS 覆盖 | 见 [09-theme.md](09-theme.md) 的 art 字段表 |
| iframe 子页主题和父页不一致 | 子页没接收主题广播 | 用 `kui-frame.js` 桥接，见 [11-api-messaging.md](11-api-messaging.md) |
| `?kuiTheme=xxx` 无效 | id 不属于 6 套内置主题 | 用 `KUI.theme.ids()` 核对 |

---

## 8. 动作与业务函数类

### 8.1 三类「点了没反应」

| 控制台证据 | 根因 | 修复 |
| --- | --- | --- |
| 无任何报错，但无效果 | `on` 写在了不生效的节点上，或事件名错 | 事件名必须是 `click` 等 DOM 事件或组件自定义事件，见 [10-actions-handlers.md](10-actions-handlers.md) |
| `未注册的动作: tab.open` | 动作名错，或用了 `standalone` profile（部分动作依赖 app-shell） | 核对 28 个动作；补齐依赖组件 |
| `未注册的业务函数: form.validate` | 对应 `*.handlers.js` 没在 profile 里 | 检查 `config/kui-modules.json`，重新 `build:all` |
| `动作异常 [xxx]: TypeError...` | 参数结构不对（如缺少 `payload`） | 看动作参数表，补全字段 |
| `业务函数异常 [xxx]` | 函数内部逻辑抛错 | 展开堆栈定位；检查传入值类型 |
| Promise 静默失败 | 异步动作 reject 被日志吞掉 | 开 `?kui_debug=1` 看 `reject` 行 |

### 8.2 `on` 语法自查

```json
{
  "type": "button",
  "props": { "text": "打开设置" },
  "on": { "click": "dialog.form" }
}
```

四种常见写法（详见 [10-actions-handlers.md](10-actions-handlers.md)）：字符串动作名、`{ action: "xxx", payload: {...} }`、`{ emit: "自定义事件名" }`、数组表示多个监听。写错形状时控制台会给「无法识别的动作配置」或「动作配置缺少字段」。

---

## 9. API 与通信类

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 控制台 `KUI is not defined` | 脚本顺序错：业务脚本在 `kui-all.js` 之前执行 | 业务脚本放 `kui-all.js` 之后，或用 `KUI.ready()` |
| `KUI.config.get('app.title')` 返回 `undefined` | 配置还没加载完/点路径写错 | 在 `KUI.ready()` 回调里取；点路径对照字段层级 |
| `KUI.registry.get('xxx')` 为 `null` | 类型未注册 | 见 5.1 |
| 父页 `postMessage` 子页收不到 | 子页没监听、origin 不匹配、sandbox 缺权限 | 见 9.2 |
| 子页 `parent.KUI` 为空 | 跨域 iframe 无法访问父页全局 | 同源才可用；跨域只能走 postMessage 协议 |
| `payload 含不可克隆值` | 消息里传了函数/DOM/循环引用 | 只传纯 JSON 数据 |
| 自定义事件监听不到 | 事件名大小写不一致 / 在派发之后才监听 | 先 `on` 再触发；事件名全小写带冒号风格 |
| `KUI.avatar` 相关报错 | 未加载 dialog（头像编辑依赖弹窗） | 控制台会提示「更换头像需要加载 dialog」 |

### 9.1 iframe 嵌入检查顺序

1. iframe 的 `src` 是 `standalone/*.html`（不是 `index.html`）；
2. 子页加载的是 `standalone` profile（无外壳）；
3. 子页含 `src/frame/kui-frame.js`（桥接脚本）；
4. 父页创建 iframe 时给了 `name` 或可寻址的 id；
5. 跨域场景：父子页都监听 `message`，校验 `event.origin`，不使用 `parent.KUI`。

### 9.2 postMessage 三条铁律

| 铁律 | 说明 |
| --- | --- |
| 收发成对 | 发 `dialog:open` 必有 `dialog:ready`；只发不收会一直 pending |
| 数据可克隆 | `payload` 只能是 JSON 可序列化值 |
| 校验来源 | 生产环境必须校验 `event.origin`，不要无条件信任 `*` |

协议全表见 [11-api-messaging.md](11-api-messaging.md)。

---

## 10. 部署类

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 线上 404 `config/bundle.js` | 该文件被 `.gitignore`，没随部署包上传 | 先 `npm run build`，再把 `config/bundle.js` 一起上传 |
| 线上 404 `src/core/kui-all.js` | 同上，也是构建产物 | 同上 |
| 线上 404 `src/themes.json` | 只上传了 HTML | 上传完整目录（除 `node_modules`、`.tools`、`.shots`） |
| 部署到子路径后全 404 | 用了以 `/` 开头的绝对路径 | 用相对路径；`config.js` 会根据当前脚本位置推导 base |
| 页面能开但白屏 | 服务器把 `.js` 返回成 `text/plain` 且浏览器严格模式拒绝 | 配置 MIME：`application/javascript`、`text/css`、`application/json` |
| 样式部分丢失 | `.css` MIME 错（`text/plain`）被浏览器拒绝 | 同上 |
| 刷新 404（SPA 式路径） | 静态服务器没有目录回退 | 配 `try_files $uri $uri/ /index.html` 或用内置 `server.js` |
| 线上仍旧版本 | CDN/浏览器缓存 | 文件名带版本或 URL 加 `?kui_v=`；内置 server 默认 `no-store` |
| iframe 被拒（`X-Frame-Options`） | 托管方禁止被嵌 | 改响应头或部署到允许嵌入的域名 |
| HTTPS 页面嵌 HTTP iframe 被拦 | 混合内容 | 父子页统一 HTTPS |
| CSP 拦截内联样式/脚本 | 安全策略过严 | 放行 `'unsafe-inline'`（KurumiUI 有内联样式与启动层）或改 nonce 方案 |
| 打包体积过大 | 传了 `node_modules`、`.shots`、`.tools` | 参考 [14-deploy.md](14-deploy.md) 的最小文件清单 |
| GitHub Pages 404 | 没配 Pages 源分支/目录 | 仓库 Settings → Pages；本项目无现成 Pages 配置，需自行托管 |
| 中文文件名 404 | 服务器未做 URL 解码 | 避免中文资源名，或检查 `decodeURIComponent` |

### 10.1 部署最小文件清单（静态托管）

```text
index.html
pages/                 # 业务页（iframe 内）
standalone/            # 独立渲染页
config/                # app.json text.json demos/ bundle.js
src/                   # core/ components/ styles/ frame/ themes.json
```

必须包含：`index.html`、`config/bundle.js`（或整套 `config/*.json`）、`src/core/kui-all.js`、`src/styles/*.css`、`src/frame/*`。
可省略：`test/`、`tools/`、`docs/`、`node_modules/`、`.tools/`、`.shots/`、`server.js`（改用静态托管时）。

### 10.2 部署后 60 秒自检

```bash
# 1) 首页 200
curl -I https://your.site/index.html
# 2) 两个产物可访问
curl -I https://your.site/config/bundle.js
curl -I https://your.site/src/core/kui-all.js
# 3) 关键 JSON 可访问
curl -I https://your.site/src/themes.json
# 4) 控制台无红色 404/CORS（人工）
```

---

## 11. 性能与浏览器兼容类

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 首屏慢 | 脚本串行、iframe 多 | 用 `app` profile 一次注入；减少首屏 iframe |
| 点多标签页后内存涨 | 每个 tab 一个 iframe，`keepAlive` 常驻 | 限制 `maxTabs`，适时 `tab.closeAll` |
| 输入卡顿、点按钮延迟 | 主线程长任务 | `?kui_debug=1` 看 `longtask` 与 `type` 行 |
| 弹窗里输入法卡死 | 特定浏览器/输入法组合 | 用诊断面板取证（`focus`/`type`/`longtask`），带面板文本反馈 |
| IE / 旧 Edge 不支持 | 框架用 ES5 但 CSS 变量需现代浏览器 | 使用 Chrome/Edge/Firefox/Safari 新版本 |
| Node 13 语法检查失败 | 用了可选链等新语法 | 按 [02-build.md](02-build.md) 的兼容清单改写法 |
| 移动端布局错乱 | 未适配窄屏 | 检查 `layout` 断点与 CSS；框架面向桌面终端 |

---

## 12. 高频 FAQ（30 条）

1. **Q：这个框架要 `npm install` 吗？**
   A：不用。零依赖，克隆即用；`npm install` 只会生成空的 `node_modules`。

2. **Q：必须用 Node 吗？**
   A：运行时纯浏览器，Node 只用于本地服务器与构建；Node 版本 ≥ 13.14。

3. **Q：能直接双击 `index.html` 打开吗？**
   A：能，但配置走 `config/bundle.js` 兜底，改配置后必须重新构建。

4. **Q：`npm start` 打不开 8080？**
   A：端口被占，server 会自动 +1，看终端输出的实际地址。

5. **Q：为什么 `build` 和 `build:config` 看起来一样？**
   A：它们的命令字符串确实完全一样，是两条等价入口，不是嵌套构建。

6. **Q：构建产物为什么不在 git 里？**
   A：`.gitignore` 排除了它们，属于「本地/部署时生成」的文件。

7. **Q：新克隆的仓库打开就报配置读取失败？**
   A：先 `npm run build:config`（或 `npm start`）生成 `config/bundle.js`。

8. **Q：改了 `app.json` 为什么不生效？**
   A：分三层排查。① **运行方式**：`npm start`/http(s) 下改完刷新即生效；`file://` 双击或静态部署只传了 bundle 时必须 `npm run build:config`（判定表见 [04-config-app.md](04-config-app.md) §1.3.1）。② **运行态覆盖**：本机 localStorage 可能存了主题/终端名/启动页/密度/头像/菜单折叠等旧选择，优先级高于 JSON 默认值（键表见 [04-config-app.md](04-config-app.md) §1.3.2）——清对应键或开无痕窗口验证。③ **缓存**：`Ctrl + F5`；部署环境再刷 CDN（[04-config-app.md](04-config-app.md) §1.3.3 讲清除与“让所有访问者看到新默认”）。
   
   **补充：界面里保存的标题名称、皮肤存在哪？会写 `config/*.json` 吗？**
   A：**不会写配置文件**。浏览器页面没有写本地文件的权限；设置弹窗、主题弹窗、头像、菜单折叠保存的状态全部写入**当前浏览器的 localStorage**（如 `kui-shell-name`、`kui-theme`、`kui-avatar`、`kui-menu-collapsed`），`config/app.json`/`src/themes.json` 只是默认值。换浏览器、清缓存、无痕窗口都会回到配置默认值；想让所有访问者看到新的默认标题/皮肤，要改 `config/app.json`（或 `src/themes.json`）并按上面第①层决定是否重建。完整键表见 [04-config-app.md](04-config-app.md) §1.3.2。

9. **Q：如何换默认主题？**
   A：改 `app.json` 的 `theme.default`（6 套内置 id 见 [09-theme.md](09-theme.md)）。

10. **Q：如何加一个菜单项？**
    A：在 `app.json` 的 `menu.props.items` 里加 `{type:"item", ... target:{tab:{...}}}`，详见 [08-components.md](08-components.md)。

11. **Q：菜单点击没反应？**
    A：`target.tab` 缺 `url` 或页面 404，看网络面板。

12. **Q：如何新增一个业务页面？**
    A：在 `pages/` 下新建 HTML（`standalone` profile + kui-frame），再挂菜单；完整流程见 [13-walkthrough.md](13-walkthrough.md)。

13. **Q：页面里怎么拿到表单数据？**
    A：`KUI.form.getData(el.__kui || el)`，见 [07-form-engine.md](07-form-engine.md)。

14. **Q：控件值怎么绑定到配置的 `data`？**
    A：控件需有 `name`，`form` 的 `data` 用同名字段提供初值。

15. **Q：支持自定义控件吗？**
    A：支持，`KUI.registry.register(type, {...})`，完整模板见 [12-extension.md](12-extension.md)。

16. **Q：支持自定义主题吗？**
    A：支持，在 `src/themes.json` 里加一条并重建，见 [09-theme.md](09-theme.md)。

17. **Q：如何把某个组件单独嵌进我的网站？**
    A：引 `standalone` profile + 对应组件脚本 + CSS，示例见 [03-assembly.md](03-assembly.md)、[14-deploy.md](14-deploy.md)。

18. **Q：能嵌进 React/Vue 项目吗？**
    A：可以，用 iframe 或「容器 + 手动 `KUI.mount`」两种方式；注意不要重复引入框架脚本。

19. **Q：弹窗里的按钮怎么绑定动作？**
    A：用 `on` 或 dialog 的按钮配置；见 [08-components.md](08-components.md) 与 [10-actions-handlers.md](10-actions-handlers.md)。

20. **Q：为什么控制台提示「未注册的业务函数」？**
    A：对应的 `*.handlers.js` 没在 profile 里加载，检查 `config/kui-modules.json`。

21. **Q：动作和业务函数有什么区别？**
    A：动作是通用交互（28 个内置，如开 tab、切主题），业务函数是组件级 API（61 个，如 form.validate）。

22. **Q：如何调试 iframe 之间的通信？**
    A：`?kui_debug=1` 面板的 `msg` 行会打印 `dialog:*`/`theme:*`/`frame:*` 消息。

23. **Q：主题切换在 iframe 子页不生效？**
    A：子页要靠 `kui-frame.js` 接收主题广播，或独立加载主题。

24. **Q：能不能用 CDN 引入？**
    A：可以，但本项目是「源码即运行」，建议整目录部署；CDN 仅适合把 `src/` 当静态资源。

25. **Q：部署到子目录要注意什么？**
    A：全部用相对路径；不要硬编码 `/src/...`；`config.js` 自动推导 base。

26. **Q：怎么升级到新版本？**
    A：替换 `src/`、`config/`、`index.html` 等源码文件后重新构建；版本号四处一致见 [02-build.md](02-build.md)。

27. **Q：运行测试要多久？**
    A：`npm test` 约 2 秒（30 项）；`npm run verify` 与 `npm run audit` 各约数秒到十几秒。

28. **Q：测试失败会不会是环境问题？**
    A：沙箱里 server 套件可能降级同进程；以「34 通过/0 失败」为准，失败先看具体断言。

29. **Q：如何确认当前页面加载的是哪个版本？**
    A：控制台 `KUI.info().version`，应为 `1.3.9`。

30. **Q：出问题该提供什么信息？**
    A：`KUI.info()` 输出 + `?kui_debug=1` 面板全文 + 控制台截图 + 复现步骤。

---

## 13. 上线验收清单（20 项）

逐项打勾，全绿再发布：

- [ ] 1. `npm test` → 34 通过 / 0 失败
- [ ] 2. `npm run verify` 全 PASS
- [ ] 3. `npm run audit` 全 PASS
- [ ] 4. `node tools/check-compat.js` → 未发现禁用语法
- [ ] 5. `node tools/check-assets.js` → 无缺失资源
- [ ] 6. `config/bundle.js` 存在且非空、时间戳是本次构建
- [ ] 7. `src/core/kui-all.js` 存在且 profile 数量正确（app 29 / standalone 28）
- [ ] 8. 首页 200、无控制台红色错误
- [ ] 9. 控制台 `KUI.info()` → version `1.3.9`、controls 41、themes 6
- [ ] 10. 6 套主题逐一切换无闪烁、无样式丢失
- [ ] 11. 菜单每一项都能打开对应 tab，子页无 404
- [ ] 12. tab 关闭/刷新/保活行为符合预期
- [ ] 13. 设置弹窗能打开、能关闭、表单能提交
- [ ] 14. 表单必填校验、`deps` 联动、`requiredAny` 各测一遍
- [ ] 15. toast 四种类型（info/success/warning/error）都能弹出
- [ ] 16. iframe 子页主题/面包屑与父页同步
- [ ] 17. `?kui_debug=1` 面板无 `error`/`reject` 行
- [ ] 18. 生产环境无 `file://` 依赖、无本地绝对路径
- [ ] 19. 缓存策略确认（CDN 刷新或文件名版本化）
- [ ] 20. 移动端/窄屏至少能正常打开（不要求完整适配）

---

## 本章自检

```bash
# 1) 手册自身的校验（含字段/类型/动作/链接）
node tools/check-manual.js --json

# 2) 框架健康度三连
npm test
npm run verify
node tools/check-compat.js

# 3) 浏览器里打开诊断面板，确认面板出现
#    访问 http://127.0.0.1:8080/?kui_debug=1
# 4) 控制台确认版本与加载量
#    KUI.info()  // version 1.3.9, controls 41, themes 6
```

预期：自检脚本退出码 0；`npm test` 33 通过；面板右下角出现且 `env` 行版本为 1.3.9。

## 参考源码

- [src/core/diag.js](../../src/core/diag.js) —— 诊断面板：启用条件（235-241）、面板 UI（71-108）、异常/长任务/输入/消息采集（123-216）
- [src/core/kui.js:1322-1330](../../src/core/kui.js#L1322-L1330) —— `KUI.info()` 自检信息
- [src/core/kui.js:816-880](../../src/core/kui.js#L816-L880) —— 动作解析与执行错误日志
- [src/core/handlers.js:131-152](../../src/core/handlers.js#L131-L152) —— 业务函数缺失/异常日志
- [src/core/config.js:185-205](../../src/core/config.js#L185-L205) —— 配置读取失败与 bundle 兜底提示
- [src/core/kui.js:1009](../../src/core/kui.js#L1009) / [src/core/icons.js:183](../../src/core/icons.js#L183) —— 未注册类型与缺失图标
- [src/components/app-shell.js:586-605](../../src/components/app-shell.js#L586-L605) —— 组件缺失与 app-shell 依赖提示
- [src/core/theme.js:145,301,305](../../src/core/theme.js#L145) —— 主题加载/切换告警
- [package.json](../../package.json) —— scripts 与 engines（安装/构建/校验命令的唯一出处）
- [tools/check-compat.js](../../tools/check-compat.js) / [tools/check-assets.js](../../tools/check-assets.js) —— 兼容性与资源检查

# 02 · 构建与产物

> 适用版本：KurumiUI v1.3.8 ｜ 前置章节：01 · 安装与首次运行 ｜ 阅读时长：约 20 分钟

## 本章目标

- 说清「为什么需要构建」：file:// 读不到本地 JSON、页面不再手写十几行 `<script>`，以及构建在 http 模式下影响什么；
- 读懂 `config/kui-modules.json` 与两个构建脚本的输入、校验、输出、返回值与失败行为；
- 掌握两个产物的结构（`app / text / themes / demos / meta` 与 `MODULES`）及入口脚本的注入 / 加载逻辑；
- 会用构建矩阵判断「改什么要重建什么」，理解 `npm run build` 与 `npm run build:config` 的关系，会做构建后验证并接入 CI。

## 2.1 为什么需要构建

框架没有打包器，但**不是没有产物**。构建只解决两件事：

| 产物 | 源 | 解决的问题 | 使用方 |
| --- | --- | --- | --- |
| `config/bundle.js` | `config/app.json`、`config/text.json`、`src/themes.json`、`config/demos/*.json` | file:// 下浏览器禁止 `fetch` 本地 JSON（CORS），需要一份 JS 变量兜底；http 下 fetch 失败也用它兜底 | 浏览器 `window.__KUI_BUNDLE__` |
| `src/core/kui-all.js` | `config/kui-modules.json` | 页面只需引一行入口，不必手写 15~20 个 `<script>`；模块清单也导出给 Node 工具 | 浏览器（自动注入）、测试 / 审计（`require`） |

运行路径决定「要不要重建」：**http 模式**优先 `fetch` 原始 JSON（带 `no-cache`），改完刷新即生效，`bundle.js` 只作兜底；**file:// 模式**读不到原始 JSON，只能使用 `__KUI_BUNDLE__`，改任何配置都必须重建配置包；**静态部署 / 离线分发**必须把两个产物随源码一起带上。

`index.html:51` 只有一行入口 `<script src="src/core/kui-all.js" data-kui-profile="app"></script>`；`config/bundle.js` 不在页面里，它被入口清单列为第一个模块、由 `kui-all.js` 注入。

## 2.2 配置包：`tools/build-config.js`

### 输入与输出

| 输入文件 | 写入 bundle 的键 | 类型 | 缺失时 | 说明 |
| --- | --- | --- | --- | --- |
| `config/app.json` | `app` | object | 记 warning，值为 `null` | 主配置（节点树、布局、菜单等） |
| `config/text.json` | `text` | object | 同上 | 全部文案 |
| `src/themes.json` | `themes` | object | 同上 | 6 套主题及其 token |
| `config/demos/*.json` | `demos[文件名去掉 .json]` | object | 目录不存在则 `demos` 为空对象 `{}` | 演示配置，共 11 个 |
| —（产物） | 写入 `config/bundle.js` | JS 文件 | 目录不存在时递归创建 | 覆盖写，不增量 |

### 处理流程

1. `ROOT = path.resolve(__dirname, '..')` 定位项目根（`tools/build-config.js:21`），在任何目录执行都等价；
2. `readJson` 读取 UTF-8、剥掉 BOM 后 `JSON.parse`；`listJson` 用 `readdir` + `names.sort()` 按**文件名字典序**排序、只留 `.json`，保证 demo 顺序稳定（`tools/build-config.js:23-43`）；
3. `tryRead` 依次读三个固定 JSON（缺文件记 `缺少配置文件: <rel>`、解析失败记 `配置 JSON 解析失败: <rel> -> <错误>`，都只进 `warnings` 不抛异常），再遍历 `config/demos` 以文件名去 `.json` 为键（`tools/build-config.js:61-91`）；
4. 组装 `bundle = { app, text, themes, demos, meta }`（`meta` 含 `generatedAt` 与 `tool`，字面量见 `tools/build-config.js:50-59`）；`JSON.stringify(bundle, null, 0)` 生成紧凑单行 JSON，加 banner 与 IIFE 后写入（`tools/build-config.js:93-108`）。

产物的外围格式（`tools/build-config.js:99-103`，`g` 为 `window` 或 `this`）：

```js
;(function (g) {
  "use strict";
  var data = { /* bundle 的紧凑 JSON */ };
  g.__KUI_BUNDLE__ = data;
})(typeof window !== "undefined" ? window : this);
```

### 返回值（`build()` 的返回对象）

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `ok` | boolean | — | 是 | `warnings.length === 0` 才为 `true`；缺文件或解析失败为 `false` |
| `file` | string | — | 是 | 产物绝对路径 |
| `bytes` | number | — | 是 | 产物字节数 |
| `demoCount` | number | `0` | 是 | demo 键数量，正常 11 |
| `hasApp` / `hasText` / `hasThemes` | boolean | `false` | 是 | 三个固定配置是否写入；`hasThemes` 为**键级**判断 `!!(bundle.themes && bundle.themes.themes)`（`tools/build-config.js:117`），缺 `themes` 键时为 `false` |
| `warnings` | string[] | `[]` | 是 | 缺文件 / 解析失败原因 |

### CLI 行为

`node tools/build-config.js` 或 `npm run build:config` 执行时打印（`tools/build-config.js:121-133`）：

```text
KurumiUI 配置打包完成
  输出: D:\nodejs\ui框架\config\bundle.js
  大小: 111.6 KB
  app.json   : ✔
  text.json  : ✔
  themes.json: ✔
  demos      : 11 个
```

有 warning 时追加 `  警告:` 与逐条 `    - ...`。退出码语义（`tools/build-config.js:145-153`）：**缺少配置文件属于正常中间态、不阻断**，`if (!r.ok) process.exitCode = 0;` 保持 0，只有抛异常才设 1；因此「有警告」时命令仍返回成功，必须看 stdout 的 `✘` 与警告行。

## 2.3 入口清单：`tools/build-all.js`

### 输入与校验

输入只有 `config/kui-modules.json`（`schema` / `note` / `profiles.<名字>.desc` / `profiles.<名字>.files`，路径相对项目根、数组顺序即加载顺序）。`readManifest()` 做两层校验（`tools/build-all.js:23-37`）：

- 根对象必须有 `profiles` 且为对象，否则抛 `config/kui-modules.json 缺少 profiles`；
- **每个** profile 的**每个** `files` 项都必须真实存在，否则抛 `kui-modules.json 引用了不存在的文件: <相对路径>`。

校验失败直接抛异常，CLI 没有 `try/catch`，因此**退出码为 1** 并打印堆栈；这是与 `build-config` 最大的行为差异。

### 生成逻辑

1. `build()` 组装 `payload = { schema, note, profiles: { 名称: { desc, files } } }`（`tools/build-all.js:39-47`）；
2. 生成 banner + 一段 IIFE，写入 `src/core/kui-all.js`（覆盖写，`tools/build-all.js:49-106`）；
3. 返回值：`{ out, bytes, profiles, counts }`，其中 `counts` 形如 `app=29, standalone=28`；CLI 打印两行（`tools/build-all.js:115-119`）：

```text
[build-all] 已生成 src\core\kui-all.js (3982 字节)
[build-all] profiles: app=29, standalone=28
```

### 产物运行时逻辑（最重要的一段）

`kui-all.js` 在浏览器与 Node 下是两套行为：

| 序号 | 逻辑 | 说明 |
| --- | --- | --- |
| 1 | Node 分支 | `if (typeof module !== "undefined" && module.exports) { module.exports = MODULES; return; }` 在 `document` 检查之前，`require` 拿到纯 JSON 清单 |
| 2 | 取脚本自身 | `document.currentScript` 得到当前 `<script>` 并取 `src` |
| 3 | 推导根前缀 | `root = src.replace(/src\/core\/[^\/]*$/, "")`：把 `.../src/core/kui-all.js` 截成 `.../`，支持 `/`、`../`、`/kurumi/` |
| 4 | 选 profile | `data-kui-profile` 属性，缺省 `standalone`；未知名字回退 `standalone` |
| 5 | 解析期同步注入 | `document.readyState === "loading"` 时用 `document.write` 连续写 `<script src="root + 文件">`，保证脚本按清单顺序执行 |
| 6 | 非解析期异步加载 | 逐个 `createElement("script")` 串行 append，`onload` 与 **`onerror` 都继续下一个**（单个失败不中断、不报错） |
| 7 | 完成事件 | 全部结束后在 `document.body`（或 `documentElement`）派发冒泡事件 `kui:all-ready`（`bubbles=true`、`cancelable=false`） |

页面依赖「解析期已注入」时走同步分支；动态插入入口脚本（运行时再加载框架）才走异步分支，需监听 `kui:all-ready` 再继续。

### 返回值（`build()` 的返回对象）

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `out` | string | — | 是 | 产物相对路径 `src\core\kui-all.js` |
| `bytes` | number | — | 是 | 产物字节数，约 4 KB |
| `profiles` | string[] | — | 是 | `['app', 'standalone']` |
| `counts` | string | — | 是 | 如 `app=29, standalone=28` |

## 2.4 产物结构

### `config/bundle.js`

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `app` | object \| null | `null` | 是 | `config/app.json` 内容 |
| `text` | object \| null | `null` | 是 | `config/text.json` 内容 |
| `themes` | object \| null | `null` | 是 | `src/themes.json` 内容 |
| `demos` | object | `{}` | 是 | demo 名（去 `.json`）→ JSON 对象，正常 11 个 |
| `meta.generatedAt` | string | — | 是 | 生成时间（ISO 8601） |
| `meta.tool` | string | — | 是 | 固定 `tools/build-config.js` |

读取顺序由 `config.js` 决定：http 先 fetch 原始 JSON，失败才回退 bundle（`src/core/config.js:148-212`）；浏览器可用 `Object.keys(window.__KUI_BUNDLE__)` 核对五个键。

### `src/core/kui-all.js`

`MODULES` 的字段（`tools/build-all.js:39-47`）：

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `schema` | string | — | 是 | 固定 `kui-modules/1`，供工具识别清单版本 |
| `note` | string | — | 是 | 从清单原样带过来的维护提示（路径相对项目根、改完执行 `npm run build:config`） |
| `profiles` | object | — | 是 | 键为 profile 名 |
| `profiles.<名>.desc` | string | — | 是 | 该 profile 的用途说明 |
| `profiles.<名>.files` | string[] | — | 是 | 相对项目根的加载路径，**数组顺序即执行顺序** |

两个内置 profile 的差异：

| profile | 文件数 | 用途 | 含 app-shell / bootstrap |
| --- | --- | --- | --- |
| `app` | 29 | 主应用 `index.html`（末尾 `src/app/bootstrap.js`） | 是 |
| `standalone` | 28 | `standalone/*.html`、`pages/*.html`（末尾 `src/frame/kui-frame.js`） | 否 |

Node 侧验证（可供 CI 使用）：

```bash
node -e "var m = require('./src/core/kui-all.js'); console.log(m.schema, Object.keys(m.profiles)); console.log(m.profiles.app.files.length, m.profiles.standalone.files.length)"
```

```powershell
node -e "var m = require('./src/core/kui-all.js'); console.log(m.schema, Object.keys(m.profiles)); console.log(m.profiles.app.files.length, m.profiles.standalone.files.length)"
```

预期输出：`kui-modules/1 [ 'app', 'standalone' ]` 与 `29 28`。

## 2.5 构建矩阵

| 改动内容 | 重建？ | 命令 |
| --- | --- | --- |
| 改 `src/**` 已有文件（不增删） | 不需要 | —（浏览器直接加载） |
| 改 `config/*.json` 与 `demos/*.json` | http 不需要，file:// 需要 | `npm run build:config` |
| 增删模块文件、调整模块顺序 | 需要 | `npm run build`（先改清单 `files`） |
| 新增 profile | 需要 | `npm run build`（清单加 `profiles.<名字>`） |
| 只改 HTML / CSS | 不需要 | — |
| 改构建脚本本身 | 需要 | `npm run build` |
| 本地启动服务 | 自动一次 | `npm start`（启动前静默构建，非 watch） |
| 静态部署 / 离线分发 | 需要 | `npm run build`（产物不入库） |

关于 watch：`package.json` **没有** watch 脚本，`npm start` 只在启动时构建一次；需要边改边看时手动重跑 `npm run build`，或用外部循环（PowerShell `while ($true) { node tools/build-config.js; Start-Sleep 2 }`）触发。

## 2.6 npm scripts 关系（如实说明）

| script | 实际命令 | 重建什么 |
| --- | --- | --- |
| `npm start` / `npm run serve` | `node server.js` | 启动前静默重建两个产物 |
| `npm run build` | `node tools/build-config.js && node tools/build-all.js` | 两个产物全量重建 |
| `npm run build:config` | **与 `build` 完全相同**（`package.json:10` 与 `package.json:24` 命令字符串一致） | 两个产物全量重建 |
| `npm run build:all` | `node tools/build-all.js` | 只重建 `src/core/kui-all.js` |
| `npm test` | `node test/run.js` | 不构建；依赖产物已存在 |
| `verify`、`audit`、`check:*` | 见 2.7 | 不构建，多数会 `require` 产物 |

两个容易踩的误解：**`build:config` 名不副实**，它实际跑 `build-config.js` + `build-all.js`；`npm run build` 与 `npm run build:config` 是**等价命令**（非叠加），写成 `npm run build && npm run build:all` 会让 `build-all` 跑两次。

测试与审计工具会 `require` 入口清单，新克隆时**先构建再测试**。

## 2.7 构建后验证与工程化校验

| 命令 | 校验对象 | 通过判据（当前仓库实测） | 退出码 |
| --- | --- | --- | --- |
| `npm test` | compat / config / server / render 四套件共 30 条用例 | 末行 `=> PASS`；缺 `.tools/` 时 Node 13 用例 SKIP | 0 / 1 |
| `npm run verify` | 冒烟 94 项 + handlers 演示页 + 弹窗动作桥 | `94 通过 / 0 失败` 与两个 ✔ | 0 / 1（&&） |
| `npm run audit` | 一致性审计 17 项 + 组件拆装审计 17 项 | `通过 17 项 / 失败 0 项 / 警告 0 项` 与 `通过 17 项 / 失败 0 项` | 0 / 1（&&） |
| `node tools/check-compat.js` | 全项目 JS 与 HTML 内联脚本的禁用语法 / API，并用 Node 13.14 做语法校验 | `[PASS] 未发现禁用语法 / API`；`.tools/` 缺失时降级为当前运行时并打印 `[INFO]` | 0 / 1 |
| `node tools/check-assets.js` | 20 个 HTML 的 `link` / `script` 引用：存在、非空、外链、重复、ESM | 末行 `汇总: 20 个 HTML，错误 0 个，警告 0 个` | 0 / 1 |
| `node tools/audit-all-pages.js` | 18 个页面的注册表装配与 console.error | `18 / 18 页面通过，失败 0 项` | 0 / 1 |

`kui-all.js` 不在生成文件白名单（`tools/check-compat.js:42`），构建后应再跑一次兼容扫描；`bundle.js` 被跳过。产物不入库（`.gitignore:5-6`），部署时随源码带上即可。

Node 13 兼容：构建脚本与生成的 `kui-all.js` 只用 `var` / `function` 与 `fs` / `path` 等 13.14 能力，可直接在 Node 13.14 执行 `npm run build`。

## 2.8 CI 集成示例

仓库未内置 `.github/`，把下面内容保存为 `.github/workflows/verify.yml` 即生效：

```yaml
name: verify
on: [push, pull_request]
jobs:
  verify:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24.x
      - run: npm run build
      - run: node tools/check-compat.js
      - run: node tools/check-assets.js
      - run: npm test
      - run: npm run verify
      - run: npm run audit
      - run: node tools/audit-all-pages.js
```

要点：零依赖，**不需要 `npm install` / `npm ci`**（仓库无 lock 文件）；`npm run build` 必须排在测试之前，否则 test / verify / audit 找不到入口清单。需要最低版本矩阵时再加一个 `node-version: 13.14.0` 的 job。本地 pre-commit 建议：仓库未自带 hook，可自行在 `.git/hooks/pre-commit` 写 `npm run build && npm test && node tools/check-assets.js`。

## 2.9 常见错误与排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `config/kui-modules.json 缺少 profiles` | 清单根结构被改坏（`profiles` 被删或不是对象） | 恢复 `profiles` 对象后重跑 `npm run build` |
| `kui-modules.json 引用了不存在的文件: src/...` | `files` 里写了不存在的路径，或大小写与磁盘不一致 | 路径相对项目根、区分大小写；核对文件确实存在 |
| `配置 JSON 解析失败: config/app.json -> ...` | JSON 有语法错误（尾逗号、注释、未转义字符） | 修 JSON；注意 `build-config` 仍返回 0，必须看警告行 |
| 页面缺 app-shell（没有菜单 / 标签页） | 页面写了不存在的 `data-kui-profile`，回退到 `standalone` | 用 `app` 或先在清单里新增并重建 profile |

## 本章自检

```bash
# bash / macOS / Linux
node -p "require('./package.json').version"
npm run build
node -e "var m = require('./src/core/kui-all.js'); console.log(m.schema, Object.keys(m.profiles), m.profiles.app.files.length, m.profiles.standalone.files.length)"
node -e "var b = require('./config/bundle.js').__KUI_BUNDLE__; console.log(Object.keys(b).join(','), Object.keys(b.demos).length)"
node tools/check-compat.js
node tools/check-assets.js
npm test
```

> PowerShell 可直接执行同样命令（`node -e` 内层用单引号）。

预期输出（节选，数值以实际输出为准）：

```text
1.3.8
[build-all] 已生成 src\core\kui-all.js (3982 字节)
[build-all] profiles: app=29, standalone=28
kui-modules/1 [ 'app', 'standalone' ] 29 28
app,text,themes,demos,meta 11
[PASS] 未发现禁用语法 / API
汇总: 20 个 HTML，错误 0 个，警告 0 个
汇总: 33 通过 / 0 失败 / 0 跳过   总计 33   耗时 ...ms   => PASS
```

## 参考源码

- `config/kui-modules.json:2-3`（schema 与 note）、`config/kui-modules.json:5-38`（app profile 29 个文件）、`config/kui-modules.json:39-72`（standalone profile 28 个文件）
- `tools/build-config.js:21`（ROOT）、`tools/build-config.js:23-43`（readJson / listJson）、`tools/build-config.js:45-91`（build / tryRead / demos）、`tools/build-config.js:93-108`（序列化、banner、写文件）、`tools/build-config.js:110-133`（返回值与控制台输出）、`tools/build-config.js:145-153`（CLI 退出行为）
- `tools/build-all.js:19-21`（三个常量）、`tools/build-all.js:23-37`（readManifest 校验）、`tools/build-all.js:39-47`（payload）、`tools/build-all.js:49-104`（banner 与注入逻辑）、`tools/build-all.js:106-112`（写文件与返回值）、`tools/build-all.js:115-119`（CLI）
- `src/core/config.js:6-9`（读取优先级）、`src/core/config.js:148-212`（fetch → bundle 回退）
- `package.json:8-25`（scripts 全表）、`server.js:233-253`（启动时静默构建）
- `.gitignore:5-6`（两个产物忽略规则）、`index.html:51`（唯一入口脚本）
- `tools/check-compat.js:42`、`tools/check-compat.js:197-234`、`tools/check-assets.js:25-28`、`tools/check-assets.js:136-162`、`test/run.js:21`、`test/run.js:32-56`

# 01 · 安装与首次运行

> 适用版本：KurumiUI v1.4.4 ｜ 前置章节：无（本手册起点）｜ 阅读时长：约 14 分钟

## 本章目标

- 确认环境满足 Node.js ≥ 13.14.0 与现代浏览器，理解「零依赖 / 无打包器」的真实含义；
- 用 git clone、下载 zip、内网复制三种方式拿到源码，知道新克隆缺哪两个构建产物；
- 跑通 `npm start`、双击 `index.html`（file://）、任意静态服务器三条启动路径；
- 用官方命令与浏览器控制台确认安装成功，按目录地图定位源码，并能干净地重置或卸载项目。

手册总览见 [README.md](README.md)；构建原理见 [02-build.md](02-build.md)。

## 1.1 环境要求

| 项目 | 最低要求 | 说明与依据 |
| --- | --- | --- |
| 操作系统 | Windows / macOS / Linux | Node 脚本 + 纯前端资源；手册命令同时给 bash 与 PowerShell 写法 |
| Node.js | ≥ 13.14.0 | `package.json` 的 `engines.node`；框架避开可选链、空值合并、`replaceAll` 等新语法，可用 `node tools/check-compat.js` 复核 |
| npm | 随 Node 安装 | 只用于执行脚本；框架零依赖（见 1.3） |
| 浏览器 | 现代 Chrome / Edge / Firefox / Safari | 需传统 `<script>`、iframe、CSS 自定义属性、`document.currentScript`；无 polyfill，未适配 IE |
| 磁盘 | 约 3.7 MB（不含 `.tools/`） | 含 `.git` 约 0.9 MB；保留 Node 13 工具链时 `.tools/` 另占约 114 MB |

```bash
node -v   # 需 v13.14.0 或更高
```

```powershell
node -v   # 需 v13.14.0 或更高
```

Node 13 已 EOL，日常建议当前 LTS；`npm run test:node13` 用 `.tools/` 工具链验证最低版本（该目录不入库）。

## 1.2 获取源码

**方式 A：SSH clone**（需已配置 SSH key）：

```bash
git clone git@github.com:SuLiyue-s/KurumiUI.git
cd KurumiUI
```

```powershell
git clone git@github.com:SuLiyue-s/KurumiUI.git
Set-Location KurumiUI
```

22 端口被拦时，可让本仓库走 GitHub 的 443 通道：`git config core.sshCommand "ssh -o HostName=ssh.github.com -p 443"`。

**方式 B：HTTPS clone**（无需 key）：`git clone https://github.com/SuLiyue-s/KurumiUI.git`，然后 `cd KurumiUI`。

**方式 C：下载 zip / 内网复制**。Code → Download ZIP，解压后进入含 `package.json`、`server.js`、`index.html` 的目录。内网离线：目标机有 Node 时复制源码并执行一次 `npm run build`；没有 Node 时先在别的机器构建，再把整个目录**连同两个产物**一起拷贝。拿到源码后核对：

```bash
ls package.json server.js index.html config/kui-modules.json
```

```powershell
Get-Item package.json, server.js, index.html, config/kui-modules.json | Select-Object Name, Length
```

## 1.3 零依赖说明：`npm install` 做了什么

`package.json` 只有 `engines`，没有 `dependencies` / `devDependencies`；仓库内既无 `node_modules/` 也无 `package-lock.json`。

| 疑问 | 结论 |
| --- | --- |
| 需要先 `npm install` 吗 | **不需要**；所有工具只用 Node 内置模块（fs / path / http / child_process） |
| 需要 webpack / vite 吗 | 不需要；浏览器直接加载 `src/**`，`kui-all.js` 只按清单注入 `<script>` |
| 「零构建」等于永不构建吗 | 不等于：**无打包器 ≠ 无产物**；file:// 与静态托管依赖两个产物，改 JSON 后 file:// 模式必须重建配置包 |

## 1.4 首次运行：三条路径

### 路径 A：`npm start`（推荐）

```bash
npm start                    # 等价于 node server.js
npm start -- --port=9000     # 自定义端口；-- 分隔符不可少（漏写会失效）
```

```powershell
npm start
npm start -- --port=9000
```

启动时先**静默重建**两个产物（`server.js:233-253` 的 `start()`，构建在 `236-248` 的 try/catch 中执行，失败只打印 `[warn]`、不阻断 http 模式），再监听端口。默认 `http://127.0.0.1:8080/`，被占用会自动 `+1` 重试（日志：`端口 8080 已被占用，正在尝试 8081`）。监听成功后输出：

```text
  KurumiUI · 刻刻帝终端
  ────────────────────────────────────────────
  本地地址: http://127.0.0.1:8080/
  根目录  : D:\nodejs\ui框架
  Node    : v24.14.0
  停止服务: Ctrl + C
```

「根目录」固定为 `server.js` 所在目录（`server.js:18` 的 `ROOT = __dirname`），与当前工作目录无关。

### 路径 B：双击 `index.html`（file://）

前置条件是 `config/bundle.js` 已存在。file:// 下浏览器禁止 `fetch` 本地 JSON，`src/core/config.js` 会回退到 `window.__KUI_BUNDLE__`，因此：改完 `config/*.json` 必须执行 `npm run build:config` 再刷新；个别浏览器限制 file:// 子框架时 iframe 可能空白，改用路径 A 或 C。

### 路径 C：任意静态服务器

```bash
python -m http.server 8080      # Python 3，无需联网
npx serve -l 8080 .             # 首次运行需联网下载 serve 包
```

```powershell
python -m http.server 8080
npx serve -l 8080 .
```

用 IIS / nginx / 对象存储托管时以仓库根为站点根，保证两个产物随源码部署、MIME 正确（`.js` → `application/javascript`，`.json` → `application/json`），子路径部署见第 14 章。

## 1.5 启动参数与环境变量

内置服务器参数（`server.js:44-65`）：

| 参数 | 取值 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--port` / `-p` | `--port 9000` 或 `--port=9000` | `8080` | 监听端口，被占用自动 +1 |
| `--host` / `-h` | 主机名 / IP | `127.0.0.1` | 局域网访问可写 `--host=0.0.0.0`（横幅仍显示 127.0.0.1） |
| `--quiet` | 无 | 关闭 | 屏蔽请求日志与 404 日志，只留启动横幅 |
| `--help` | 无 | — | 打印用法后退出 |

`server.js` 与 `src/` 不读取任何环境变量；仓库唯一的 `process.env` 用法在 `tools/screenshot.js:31` 的 `KUI_BROWSER`（截图工具浏览器路径），与运行无关。

浏览器 URL 参数：

| 参数 | 作用 | 示例 |
| --- | --- | --- |
| `?kui_debug=1` | 打开诊断面板（`src/core/diag.js:237`） | `http://127.0.0.1:8080/?kui_debug=1` |
| `?kuiTheme=<id>` | 强制主题（`src/core/theme.js:166`） | `http://127.0.0.1:8080/?kuiTheme=starry` |
| `?kui_v=<版本>` | 由框架自动追加到 iframe 子页 URL 做缓存穿透，手加一般无意义 | `.../pages/home.html?kui_v=1.4.4` |

> `?demo=<name>` 只出现在菜单项的静态 URL（`config/app.json:608` 的 `standalone/menu.html?demo=menu`），框架层与 `standalone/*.html` 都不解析它，不要写进验收脚本。

## 1.6 验证安装

| 命令 | 校验内容 | 通过判据 |
| --- | --- | --- |
| `npm run build` | 重建配置包与入口清单 | 见下方预期输出 |
| `node tools/check-assets.js` | HTML 的 CSS / JS 引用存在性、空文件、外链、重复、ESM | 末行 `汇总: 22 个 HTML，错误 0 个，警告 0 个` |
| `node tools/check-compat.js` | 禁用语法 / API 与 Node 13.14 语法校验 | 出现 `[PASS] 未发现禁用语法 / API` |
| `npm test` | compat / config / server / render 四套件共 37 条用例 | 末行 `=> PASS` |
| `npm run verify` | 冒烟 125 项 + handlers 演示页 + 弹窗动作桥 + 产物一致性 | 四段均打印 ✔ / PASS |
| `npm run audit` | 一致性审计 17 项 + 组件拆装审计 19 项 | 两个脚本均 `失败 0 项` |

`npm run build` 预期输出（数值以实际输出为准）：

```text
KurumiUI 配置打包完成
  大小: 111.6 KB
  demos      : 11 个
[build-all] 已生成 src\core\kui-all.js (3982 字节)
[build-all] profiles: app=30, standalone=29
```

浏览器控制台检查（http 模式打开 `http://127.0.0.1:8080/`，F12 → Console）：

```js
KUI.version                  // '1.4.4'
KUI.env.isBrowser            // true
KUI.registry.list().length   // 42（其中 19 个是表单控件）
KUI.actions.list().length    // 28
KUI.handlers.list().length   // 61
KUI.config.isHttp()          // true；file:// 下为 false
typeof window.__KUI_BUNDLE__ // 'object'
```

可访问 URL 清单：

| URL | 内容 |
| --- | --- |
| `/` | 主应用（`index.html`，`data-kui-profile="app"`） |
| `/?kui_debug=1`、`/?kuiTheme=starry` | 主应用 + 诊断面板 / 强制主题 |
| `/pages/home.html` | 业务页：首页（同目录另有 dialogs、editor、form、notify、profile、theme，共 7 个） |
| `/standalone/controls.html` | 独立渲染页：控件总览（同目录另有 11 个页面，共 12 个） |
| `/standalone/boot.html` | v1.3.7 新增、v1.3.8 完善的加载层交互测试页（handsAt 映射、进度动画、拆装示例），见 [16-boot.md](16-boot.md) |

## 1.7 目录地图

| 路径 | 职责 | 关键文件 |
| --- | --- | --- |
| `/` | 入口与服务 | `index.html` 唯一入口；`server.js` 内置服务器（启动自动构建）；`package.json`；`CHANGELOG.md` |
| `config/` | 配置 | `app.json`；`text.json`；`kui-modules.json` 模块清单；`demos/` 11 个演示配置；`bundle.js` 产物 |
| `src/core/` | 内核 | `kui.js`（`KUI.version`）、`config.js` 配置读取、`registry.js` 注册表、`theme.js` + `theme-art.js` 主题、`icons.js`、`handlers.js` 业务函数、`diag.js` 诊断、`dom-enhance.js`、`theme-boot.js` 首帧防闪白、`kui-all.js` 产物 |
| `src/components/` | 组件层 | 七大组件 `menu` / `menunav` / `tabs` / `dialog` / `toast` / `app-shell` / `boot`（v1.3.8 新增加载层，见 [16-boot.md](16-boot.md)）；表单引擎 `form.js`；控件 `controls/`；组件业务函数 `handlers/` |
| `src/app/bootstrap.js` | 启动器 | 读配置、创建 app-shell、装配菜单与默认标签页 |
| `src/frame/` | 框架页 | `kui-frame.js` 内嵌页框架；`dialog-frame.html` + `dialog-frame.js` 弹窗页 |
| `src/styles/` | 样式 | `base.css` / `controls.css` / `components.css` / `tooltip.css` / `boot.css`（v1.3.8 起启动层独立样式）/ `avatar.css`，主题 token 在 `themes/` |
| `src/themes.json` | 主题数据 | 6 套主题（kurumi 默认、kurumi-angel、starry、sakura、abyss、dawn） |
| `pages/`、`standalone/` | 页面 | 7 个配置驱动业务页；13 个独立渲染页 + `embedded.js` |
| `test/`、`tools/` | 测试与工程工具 | `run.js` + 四个套件 + `dom-stub.js`；`tools/` 共 17 个 .js：构建 2 个（`build-config.js` / `build-all.js`），校验 / 审计 / 冒烟 / 覆盖率 14 个（含 `verify-build.js`、`audit-config.js`、`audit-unused.js`（v1.4.1 未消费资产审计）、`coverage.js`（v1.4.2 覆盖率）、两份手册的校验器 `check-manual.js` 与 `check-beginner-manual.js`，可用 `node tools/check-manual.js [--json] [--strict]` / `node tools/check-beginner-manual.js`），截图 1 个（`screenshot.js`） |

`index.html:51` 只引一行 `src/core/kui-all.js`，加载哪些模块由 `config/kui-modules.json` 的 `files` 数组决定，详见 [02-build.md](02-build.md) 与第 03 章。

## 1.8 卸载与重置

| 场景 | bash | PowerShell |
| --- | --- | --- |
| 只清构建产物 | `rm -f config/bundle.js src/core/kui-all.js` | `Remove-Item config/bundle.js, src/core/kui-all.js -ErrorAction SilentlyContinue` |
| 清工具链与截图 | `rm -rf .tools .shots` | `Remove-Item .tools, .shots -Recurse -Force -ErrorAction SilentlyContinue` |
| 完全重置工作区 | `git clean -xdn` 预览 → `git clean -xfd` | `git clean -xdn; git clean -xfd` |

`git clean -xfd` 会删除**所有未跟踪文件**（含产物、`.tools/`、`.shots/` 及新增未提交的页面）。彻底卸载即删除仓库目录。判据：`git status --porcelain` 为空，再 `npm run build` 仍能生成两个产物。

## 1.9 常见错误与排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 双击 `index.html` 只有启动动画 / 白屏 | 新克隆未构建，两个产物缺失 | `npm run build`（或 `npm start`）后刷新 |
| 控制台 404 `src/core/kui-all.js` | 入口清单未生成 | 同上；静态托管时确认产物已上传 |
| 启动层提示配置读取失败 | 配置包未生成或 JSON 语法错误 | `npm run build` 后看警告行并修 JSON |
| 改了 `config/app.json` 刷新无变化 | file:// 读旧 `bundle.js`，或 http 有缓存 | file:// 下 `npm run build:config`；http 加 `?kui_v=<新值>` |
| 打印「端口 8080 已被占用，正在尝试 8081」 | 端口被占用，属自动切换 | 使用新地址；固定端口 `npm start -- --port=9000` |
| `npm start --port=9000`（漏 `--`）不生效 | npm 把它当自己的参数，未透传给 `node server.js` | 补 `--`：`npm start -- --port=9000`，或 `node server.js --port=9000` |
| `Not allowed to load local resource` | file:// 浏览器策略限制 | 改用 `npm start` 或 Python / npx 静态服务器 |
| `npm test` / `npm run verify` 报找不到 `kui-all.js` | 测试与审计工具会 `require` 产物 | 先 `npm run build` |
| `check-compat` 只有 `[INFO] 无法 spawn Node13` | `.tools/` 不在仓库内，降级为当前 Node 校验 | 忽略；需要真实校验时放入 `.tools/node-v13.14.0-win-x64/node.exe` |
| 访问目录 403 / URL 400 | 目录无 `index.html`；URL 含 `..` 或非法编码 | 访问具体 `.html`；使用正常路径 |

## 本章自检

```bash
# bash / macOS / Linux
node -v
npm run build
node tools/check-assets.js
npm test
```

```powershell
# Windows PowerShell
node -v
npm run build
node tools/check-assets.js
npm test
```

预期输出（节选，数值以实际输出为准）：

```text
v24.14.0
KurumiUI 配置打包完成
[build-all] profiles: app=30, standalone=29
汇总: 22 个 HTML，错误 0 个，警告 0 个
汇总: 37 通过 / 0 失败 / 0 跳过   总计 37   耗时 ...ms   => PASS
```

最后 `npm start`，打开 `http://127.0.0.1:8080/`，在控制台执行 1.6 节检查，得到 `1.4.4 / true / 42 / 28 / 61 / true` 即安装完成。

## 参考源码

- `package.json:7-25`（scripts）、`package.json:26-28`（`engines.node`）
- `server.js:18-20`（默认端口 / 主机）、`server.js:44-65`（参数解析）、`server.js:203-231`（端口重试与启动横幅）、`server.js:233-253`（启动时静默构建）
- `index.html:51`（唯一入口脚本）
- `src/core/config.js:6-9`（读取优先级）、`src/core/config.js:148-212`（fetch → bundle 回退）
- `tools/build-config.js:94-108`（banner 与输出路径）、`tools/build-config.js:121-133`（控制台输出）
- `tools/build-all.js:57-104`（入口清单模板）、`tools/build-all.js:106-112`（写文件与返回值）
- `config/kui-modules.json:5-37`、`config/kui-modules.json:38-69`（两个 profile 的文件清单）
- `.gitignore:5-10`、`tools/check-assets.js:25-28`、`test/run.js:21`、`test/run.js:32-56`
- `src/core/diag.js:237`、`src/core/theme.js:166`、`src/core/kui.js:21`

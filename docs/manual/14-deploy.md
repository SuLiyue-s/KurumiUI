# 14 · 部署与跨项目复用

> 适用版本：KurumiUI v1.3.7 ｜ 前置章节：03-assembly.md ｜ 阅读时长：约 18 分钟

KurumiUI 是纯前端 + JSON 配置，部署就是把「源码 + 两个构建产物」放到任意静态服务器上。本章先讲内置 `server.js` 的边界，再覆盖静态托管、子路径、file://、iframe 嵌入，最后是整框架/单组件复用、升级、回滚与上线清单。

## 本章目标

- 说清 `server.js` 的参数、端口回退、缓存头与路径安全，知道它为什么不是生产服务器。
- 完成 nginx/Apache/GitHub Pages/对象存储四种静态托管，并理解产物必须随发布。
- 处理子路径 `/kurumi/` 部署，会检查 `app.json`、iframe 与存储键。
- 完成 file:// 离线包与 iframe 嵌入（sandbox / CSP / postMessage / 高度）。
- 会选整框架复制、单组件抽取、npm/submodule/vendored 三种复用方式。
- 执行升级、缓存穿透（`?kui_v=`）、回滚与 20 项上线检查。

## 1. 内置 server.js：开发/局域网演示服务器

`server.js`（267 行，零依赖，仅 `http/fs/path/url`）存在的理由写在文件头 `:1-10`：浏览器出于安全限制无法用 file:// 读取 JSON 配置（CORS），所以官方推荐 `node server.js` 后访问 http://127.0.0.1:8080 。

### 1.1 参数

| 参数 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `--port` / `-p` | number | `8080` | 否 | 监听端口，支持 `--port 8080` 与 `--port=8080`（`server.js:49-52`） |
| `--host` / `-h` | string | `127.0.0.1` | 否 | 监听地址，`0.0.0.0` 供局域网/容器访问（`:53-56`）；日志里 `0.0.0.0` 会显示成 `127.0.0.1`（`:216-228`） |
| `--quiet` | flag | `false` | 否 | 关闭请求日志（`:57-58`） |
| `--help` | flag | — | 否 | 打印用法后退出（`:59-62`） |

源码只支持以上四项（`server.js:44-61`）。README 里提到的 `--no-build` 与源码不符，以源码为准。

```bash
node server.js                      # 默认 127.0.0.1:8080
node server.js --port 9000 --quiet  # 自定义端口并静默
node server.js -h 0.0.0.0 -p 8081   # 局域网可访问
```

```powershell
# Windows PowerShell 等价写法（参数相同）
node server.js --port 9000 --quiet
node server.js -h 0.0.0.0 -p 8081
```

### 1.2 启动行为

- **自动重建产物**：`start()` 在监听前依次 `require('./tools/build-config.js')` 与 `./tools/build-all.js` 并 `build({silent:true, root: ROOT})`（`server.js:233-248`）。失败只 `console.warn`，不影响 http 模式。所以 `npm start` 永远看到最新配置，但会顺带改写 `config/bundle.js` 与 `src/core/kui-all.js`。
- **端口占用自动 +1**：`EADDRINUSE` 时打印提示、`port += 1`，60ms 后重试（`server.js:203-215`）。
- **只读/只服务**：只有 GET/HEAD，其它方法 405（`:182-192`）；目录带 `index.html` 才服务，否则 403 且不列目录（`:150-157`）。

### 1.3 响应头与路径安全

所有响应默认带（`server.js:98-101`）：

```
Cache-Control: no-store, no-cache, must-revalidate
X-Content-Type-Options: nosniff
```

`resolveSafe()` 是路径安全核心（`server.js:67-96`），依次做：去 query → `decodeURIComponent`（失败返回 null）→ 拒 NUL → 反斜杠转 `/` → 去协议/域名前缀 → **normalize 之前**逐段拒绝 `..` → normalize 后再查 `../` 前缀 → `path.resolve(ROOT, rel)` → 前缀必须落在 `ROOT + sep` 内。非法路径返回 400，不存在 404，内部异常 500。

MIME 白名单见 `server.js:22-42`：`.html/.htm`、`.css`、`.js/.mjs`、`.json/.map`、`.svg`、`.png/.jpg/.jpeg/.gif/.ico/.webp`、`.woff/.woff2/.ttf`、`.txt`、`.md`；其余一律 `application/octet-stream`。`.map` 请求不打印日志（`:170-172`）。

### 1.4 它不是生产服务器

没有 gzip/brotli、ETag/协商缓存、HTTPS、并发上限与安全头、目录索引；单进程，每次启动改写产物。生产请用 nginx/Apache/对象存储 + CDN。

## 2. 静态托管部署

### 2.1 先构建，再上传

```bash
npm run build   # = node tools/build-config.js && node tools/build-all.js
```

产物两个（都被 `.gitignore` 忽略，必须随发布）：`config/bundle.js`（114,290 B，file:// 与 fetch 失败兜底）、`src/core/kui-all.js`（3,982 B，页面唯一入口）。

### 2.2 最小文件清单

| 类别 | 路径 | 说明 |
| --- | --- | --- |
| 必须 | `index.html` | 主应用入口 |
| 必须 | `src/`（含 `src/core/kui-all.js`） | 框架与样式，`styles/` 5 个 CSS 全要 |
| 必须 | `config/app.json`、`config/text.json`、`config/kui-modules.json` | 应用/文案/模块清单 |
| 必须 | `config/bundle.js` | 配置兜底包，fetch 失败或 file:// 时用 |
| 必须 | `src/themes.json` | 6 套主题；缺失会 warn 并退回 base.css 默认色 |
| 业务 | `pages/` | 主应用标签 iframe 打开的业务页，7 个 |
| 可选 | `standalone/` | 独立演示页（11 个 HTML + `embedded.js`） |
| 可选 | `config/demos/` | 演示数据，11 个 JSON；业务页用到才需要 |
| 可选 | `docs/` | 文档静态文件，不影响运行 |
| 不需要 | `node_modules/`、`tools/`、`test/`、`.tools/`、`.shots/`、`server.js`、`package.json` | 构建/测试/本地服务用，线上可不传 |

### 2.3 nginx

```nginx
server {
  listen 80;
  server_name ui.example.com;
  root /var/www/kurumi;
  index index.html;

  location / { try_files $uri $uri/ /index.html; }

  location = /index.html {
    add_header Cache-Control "no-cache";
  }
  location ~* \.(?:css|js|json)$ {
    add_header Cache-Control "public, max-age=300";
  }
  add_header X-Content-Type-Options nosniff;
  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;
}
```

部署到子路径时用 `alias`（注意结尾斜杠，见 §3）：

```nginx
location /kurumi/ {
  alias /var/www/kurumi/;
  try_files $uri $uri/ /kurumi/index.html;
}
```

### 2.4 Apache

```apache
Options -Indexes
DirectoryIndex index.html
AddType application/javascript .js
AddType application/json .json
<IfModule mod_headers.c>
  Header set X-Content-Type-Options nosniff
  <FilesMatch "\.html$">Header set Cache-Control "no-cache"</FilesMatch>
  <FilesMatch "\.(css|js|json)$">Header set Cache-Control "public, max-age=300"</FilesMatch>
</IfModule>
```

Apache 默认已能按扩展名给 `.html/.css/.js/.json` 正确 Content-Type；若主机把 `.js` 配成 `text/plain`，上面的 `AddType` 可救回。

### 2.5 GitHub Pages

关键问题：Pages 直接发布仓库内容，但两个产物被 `.gitignore` 忽略，只推源码会 404 或白屏。两种修复：

**A. 发布分支强制加产物**

```bash
npm run build
git add -f src/core/kui-all.js config/bundle.js
git commit -m "chore: 加入构建产物供 Pages 使用"
git push origin main
# 仓库 Settings → Pages → Deploy from a branch → main / (root)
```

**B. GitHub Actions 构建后发布**（推荐，仓库保持干净）：workflow 里 `actions/checkout` → `actions/setup-node`（Node ≥ 13.14，建议 20）→ `npm run build` → `actions/upload-pages-artifact`（`path: .`）→ `actions/deploy-pages`。

Pages 项目站点根路径是 `https://<user>.github.io/<repo>/`，比域名深一层。KurumiUI 引用全为相对路径：`config.js:31-57` 用自身脚本地址推 BASE，`kui-all.js:16-19` 用 `currentScript` 推根前缀，所以**子目录可用**，无需改任何路径。`.nojekyll` 仅文件名带下划线时需要（本仓库无）。

### 2.6 对象存储 / OSS / CDN

步骤：本地 `npm run build` → 上传整个目录（至少 §2.2 的「必须」+ `pages/`）→ 配置静态网站首页 `index.html` → 为 HTML 设 `Cache-Control: no-cache`、JS/CSS/JSON 设短缓存 → 绑定 HTTPS 域名 → CDN 刷新。

注意 **Content-Type 必须强制指定**，对象存储按扩展名猜测时常把 `.js` 传成 `application/octet-stream` 或 `text/plain`，浏览器会拒绝执行（nosniff 场景直接报错）：

| 扩展名 | Content-Type |
| --- | --- |
| `.html` | `text/html; charset=utf-8` |
| `.css` | `text/css; charset=utf-8` |
| `.js` / `.mjs` | `application/javascript; charset=utf-8` |
| `.json` / `.map` | `application/json; charset=utf-8` |
| `.svg` | `image/svg+xml` |

## 3. 子路径部署（部署到 /kurumi/ 下）

为什么相对路径本身安全：`config.js` 从 `document.currentScript.src` 找 `/src/core/config.js` 并截出 BASE（`src/core/config.js:31-57`），`kui-all.js` 从自身 src 推根前缀（`src/core/kui-all.js:16-19`）。所以 `index.html` 放在 `/kurumi/index.html`、`pages/x.html` 放在 `/kurumi/pages/x.html`，全部引用自动落在 `/kurumi/` 下。

仍要检查的四类东西：

| 检查项 | 怎么查 | 说明 |
| --- | --- | --- |
| `app.json` 里的 url | `grep '"url"' config/app.json` | 必须写相对项目根的 `pages/home.html`，不能带 `/kurumi/` 或 `../`（`config/app.json:236`、`:370`） |
| tabs 的 `urlPrefix` | 搜 `urlPrefix` | 只有把 tabs 组件放到子目录页面（如 `standalone/no-shell.html:189` 的 `'../'`）才需要；主应用不要设置 |
| iframe / 弹窗文档路径 | 看 `src/frame/` 与各页 `iframe` | 全部是相对路径，部署后路径深度不变即可 |
| 绝对路径残留 | `grep -rn '"/src/\|"/config/' index.html src pages standalone` | 应为空；有则改成相对路径 |
| 主题与折叠状态 | 浏览器 Application → Local Storage | `kui-theme` 按 origin 存，不同 path 共享，无影响；但 http 与 https 是两个 origin，迁移后用户会回默认主题 |

nginx `alias` 的坑：`location /kurumi/ { alias /var/www/kurumi; }` 少结尾斜杠会拼错路径，标准写法是 `alias /var/www/kurumi/;` 且 location 也带斜杠。用 `root` 时目录要真的叫 `kurumi`。

## 4. file:// 部署（离线包/内网工具）

适用：内网 U 盘分发的工具页、单机演示。直接把整个目录打 zip 发给对方，解压后双击 `index.html`。

| 功能 | file:// 下表现 |
| --- | --- |
| 渲染、组件、主题 | 可用。主题来自 `config/bundle.js`（配置不 fetch） |
| 配置加载 | fetch 不可用 → 走 `__KUI_BUNDLE__`（`config.js:195-207`）；没有 bundle 时报「配置读取失败…请运行 npm run build:config 或使用 npm start」（`:202`） |
| 主应用外壳、标签 | 可用，但每个标签 iframe 里的 fetch 同样回退 bundle；Chrome 把 file:// 文档当不透明 origin，父级 `KUI` 读取会抛错并被 theme-boot 静默降级（`theme-boot.js:28-41`） |
| `postMessage` 页面桥 | 可用（父子都用 `targetOrigin='*'`，`kui-frame.js:104-115`）；但跨 file 文档的 `event.source` 校验与父级回执依赖具体浏览器实现，建议实测 |
| 剪贴板 API | 受限：`navigator.clipboard` 要求安全上下文（https 或 localhost），file:// 通常不可用，需要页面自己的降级方案 |
| 多文件跳转 | `pages/*.html` 同目录相对路径可跳；若用了 `frame.navigate` 而未被嵌入，会回退 `location.href`（`kui-frame.js` 对应 API） |

打包（先 `npm run build`）：

```bash
zip -r kurumi-offline.zip index.html src config pages standalone docs
```

```powershell
# Windows PowerShell
Compress-Archive -Path index.html,src,config,pages,standalone,docs -DestinationPath kurumi-offline.zip -Force
```

离线包务必先确认 `config/bundle.js` 与 `src/core/kui-all.js` 在包内——它们被 `.gitignore` 忽略，`git archive` 打出来的包默认没有。

## 5. iframe 嵌入自己的其他站点

把整个 KurumiUI 作为一个模块嵌入他站：

```html
<iframe src="https://ui.example.com/kurumi/index.html" title="KurumiUI 控制台"
  style="width:100%;height:760px;border:0;display:block" loading="lazy"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
  referrerpolicy="same-origin"></iframe>
```

| sandbox 令牌 | 是否建议 | 原因 |
| --- | --- | --- |
| `allow-scripts` | 必须 | 否则框架脚本不执行 |
| `allow-same-origin` | 建议 | 缺了 `localStorage` 直接抛异常，主题/折叠状态无法记忆（框架内有 try/catch，不崩但每次回默认） |
| `allow-forms` | 需要表单时加 | 业务页表单提交 |
| `allow-popups` / `allow-downloads` | 按需 | 弹窗与下载 |
| `allow-top-navigation` | 不要给 | 框架从不跳顶层 |

CSP 用响应头 `frame-ancestors` 限制谁能嵌：`Content-Security-Policy: frame-ancestors 'self' https://portal.example.com;`。注意 **`frame-ancestors` 只能通过 HTTP 头设置，写在 `<meta>` 里无效**；GitHub Pages 等无法自定义响应头的托管只能靠 iframe 使用方自律。

跨域时的通信：内层整应用没有对外 SDK，需自己加：

```js
// 内层（KurumiUI 页面里）
window.parent.postMessage({ kui: true, type: 'height', value: document.documentElement.scrollHeight }, '*');

// 外层（宿主站点）
window.addEventListener('message', function (e) {
  if (e.origin !== 'https://ui.example.com') return; // 必须校验 origin
  if (e.data && e.data.kui && e.data.type === 'height') {
    document.getElementById('kuiFrame').style.height = e.data.value + 'px';
  }
});
```

限制：内层收到的 `event.origin` 是宿主 origin，不要用 `'*'` 接收敏感指令；`KUI.frame` 面向的是 `pages/*` 与主应用之间的协议（`03-assembly.md` §5.1），不适用于「整应用 + 宿主」这层。高度自适应用上面这种「内层上报」的方式，或直接固定高度。

## 6. 跨项目复用

### 6.1 方式 A：整个框架复制

适合把 KurumiUI 当自家后台的技术底座。复制清单（按 v1.3.7 实测）：

| 路径 | 作用 | 必须 |
| --- | --- | --- |
| `index.html` | 主应用入口样板 | 是（可改名） |
| `src/` | core / styles / components / app / frame | 是 |
| `config/app.json`、`text.json`、`kui-modules.json` | 配置、文案、模块清单 | 是 |
| `src/themes.json` | 主题数据 | 是 |
| `tools/build-config.js`、`tools/build-all.js` | 生成两个产物 | 是 |
| `package.json` | `npm run build` 等脚本 | 是（保留 scripts） |
| `pages/` | 业务页样例 | 按需 |
| `standalone/`、`config/demos/` | 演示与示例数据 | 可删 |
| `server.js` | 本地静态服务 | 可选 |
| `test/`、`tools/smoke.js` 等、`.tools/`、`.shots/`、`docs/`、`CHANGELOG.md` | 测试/工具链/文档 | 可删 |
| `node_modules/`、构建产物 | 本地生成 | 不复制，目标项目 `npm run build` |

步骤：复制 → 删 `package.json` 里用不到的脚本（保留 `build`/`build:config`/`start`）→ `npm run build` → `npm start` 验证 → 清空 `config/app.json` 的演示菜单，换成自己的业务页。

### 6.2 方式 B：只抽取单组件/单页面

适合只要一个表单页、一个弹窗、一个主题页的项目。两种粒度：

- **最小单组件页**：照 `standalone/controls.html` 的结构，复制 `src/core/`、`src/styles/`、`src/components/controls/`、用到的组件文件（如 `dialog.js`、`toast.js`）与 `src/themes.json`，页面按 §4.3 的「手写 script 顺序」引用；体积主要来自 `controls.css`（102 KB）。
- **单业务页 + 页面桥**：复制一个 `pages/*.html` + `src/frame/kui-frame.js` + 上面那套 core/styles，页面桥让它在别的宿主 iframe 里工作；宿主需实现 `tab:init` 与各类 `frame:*` 回执（协议表见 `11-api-messaging.md`）。

### 6.3 方式 C：三种依赖引入方式

| 方式 | 优点 | 缺点 | 操作 |
| --- | --- | --- | --- |
| npm 私有包 | 版本语义清晰、CI 可复现 | 本仓库 `"private": true` 且无 `files`，`npm publish` 会被拒；消费方还要额外拷文件 | 改 `"private": false` 或配 `publishConfig`，补 `"files": ["src","config","tools","index.html"]`；`npm pack` 验证内容后发私有 registry，消费方 `npm i kurumi-ui -D` 并在构建脚本里把包内文件拷到静态目录再 `npm run build` |
| git submodule | 保留完整仓库历史，可锁定 commit | 子模块升级要单独提交；嵌套构建产物不随主仓库 | `git submodule add git@github.com:SuLiyue-s/KurumiUI.git vendor/kurumi` → 主项目构建脚本里 `cd vendor/kurumi && npm run build`，静态目录指向它；升级 `git -C vendor/kurumi pull` 后提交主仓库的指针 |
| vendored 目录 | 零工具链、最简单，离线可读 | 升级靠人工 diff；仓库体积变大 | 像 §6.1 一样复制到 `vendor/kurumi/`，在 `package.json` 记来源 commit；升级时对比上游 `CHANGELOG.md` 再覆盖 |

## 7. 升级、缓存穿透、回滚、上线检查

### 7.1 版本升级

1. 拉取新版，读 `CHANGELOG.md`（重大变更会写破坏性说明）。
2. `npm run build` 重建两个产物。
3. 比对 `config/kui-modules.json`（模块增删）、`src/themes.json`（token 改名）、`config/app.json` 的 schema（字段增删，见 `04-config-app.md`）。
4. 回归：`npm test`（30 项）、`npm run verify`（冒烟 94 项）、`npm run audit`（一致性 17 + 组件拆装 17）、`node tools/check-compat.js`、`node tools/check-assets.js`。
5. 替换前备份线上 `config/bundle.js` 与 `src/core/kui-all.js` 两个文件，回滚只需换回它们。

### 7.2 缓存穿透

- 标签 iframe 的 URL 由 tabs 自动追加 `kui_v=<KUI.version>`（`src/components/tabs.js:437-442`，仅 http(s) 且 URL 不是绝对地址时），发版换版本号即换 URL。若只改配置不改版本号，可手加 `?kui_v=20261027`。
- `index.html` 设 `no-cache`（每次校验），JS/CSS/JSON 设短缓存（如 300s）；无 hash 文件名，别设一年 immutable。
- 对象存储/CDN 发版后刷新 `index.html` 与 `config/*.json`，必要时整站 purge；`config/bundle.js` 也要刷，否则 file:// 用户与新页面不同步。
- 长会话用户可用 iframe 的版本自愈：新文档带 `kui_v` 替换旧缓存文档（`kui-frame.js:80-102`）。

### 7.3 回滚

- 推荐发布包按版本目录保存：`/var/www/kurumi-v1.3.5`、`/var/www/kurumi-v1.3.7`，用软链 `/var/www/kurumi -> kurumi-v1.3.7`，回滚只改软链并 reload nginx。
- 只换代码不换配置时，至少回滚两个产物；`config/app.json` 结构变化大的版本，回滚要连配置一起换。
- 回滚后清 CDN 与浏览器强缓存路径（HTML 已 no-cache，一般无需强刷）。

### 7.4 上线前 20 项检查

| # | 检查项 | 通过标准 |
| --- | --- | --- |
| 1 | 构建产物 | `kui-all.js`、`bundle.js` 在发布包内 |
| 2 | 首页 | 不白屏，启动层淡出 |
| 3 | 控制台 | 无报错、无 404 |
| 4 | 配置 | app/text/themes 三个 JSON 均 200 |
| 5 | 兜底 | 改坏 JSON 能回退 `bundle.js` |
| 6 | 外壳 | 菜单/导航/标签正常，首标签是首页 |
| 7 | 业务页 | `pages/*` 全可开、可切、保活 |
| 8 | 页面桥 | 标题/脏标记/提醒/弹窗正常；单独打开不报错 |
| 9 | 主题 | 6 套可切，首帧无 FOUC |
| 10 | 弹窗 | 主题正确、输入流畅 |
| 11 | MIME | js/css/json 非 octet-stream |
| 12 | 缓存 | HTML no-cache，静态短缓存 |
| 13 | HTTPS | 全站 https 并跳转 |
| 14 | 子路径 | `/xxx/` 下资源全 200，`app.json` url 无前缀 |
| 15 | 安全头 | nosniff；必要时 `frame-ancestors` |
| 16 | 嵌入 | 他站 iframe 可加载，sandbox/CSP 符合预期 |
| 17 | 兼容 | Chrome/Edge/Firefox 实测；构建机 Node ≥ 13.14 |
| 18 | 依赖 | 线上无 `node_modules/`、`test/`、`.tools/` |
| 19 | 敏感信息 | 无内网地址/token/绝对路径 |
| 20 | 回滚 | 上版包与软链可用，演练过 |

## 8. 本章自检

```bash
# 1. 参数解析：期望输出 {"port":9000,"host":"127.0.0.1","open":false,"quiet":true}
node -e "console.log(JSON.stringify(require('./server.js').parseArgs(['--port','9000','--quiet'])))"

# 2. 路径穿越必须被拒：期望 null
node -e "console.log(JSON.stringify(require('./server.js').resolveSafe('/../etc/passwd')))"

# 3. MIME 表：期望 application/json; charset=utf-8
node -e "console.log(require('./server.js').MIME['.json'])"

# 4. 发布前产物存在性：两个 true
node -e "var fs=require('fs');console.log(fs.existsSync('src/core/kui-all.js'),fs.existsSync('config/bundle.js'))"
```

```powershell
# Windows PowerShell 等价
node -e "console.log(JSON.stringify(require('./server.js').parseArgs(['--port','9000','--quiet'])))"
node -e "console.log(JSON.stringify(require('./server.js').resolveSafe('/../etc/passwd')))"
node -e "var fs=require('fs');console.log(fs.existsSync('src/core/kui-all.js'),fs.existsSync('config/bundle.js'))"
```

预期输出：

```
{"port":9000,"host":"127.0.0.1","open":false,"quiet":true}
null
application/json; charset=utf-8
true true
```

## 参考源码

- `server.js:1-10` —— 为什么需要本地服务器（file:// 不能 fetch JSON）。
- `server.js:22-42` —— MIME 白名单；`:44-65` 参数解析（无 `--no-build`）。
- `server.js:67-96` —— `resolveSafe()` 路径穿越防护的全部检查。
- `server.js:98-130` —— 默认缓存头、nosniff、流式响应、错误页。
- `server.js:132-201` —— 静态服务、目录 403、GET/HEAD 限制、`createServer`。
- `server.js:203-231` —— `EADDRINUSE` 自动 +1、启动横幅。
- `server.js:233-248` —— 启动时自动重建配置包与 kui-all.js（失败只 warn）。
- `src/core/config.js:25-57`、`:82-96`、`:147-212` —— `BASE` 探测、bundle 复用、fetch→bundle 回退与报错文案。
- `src/core/kui-all.js:16-31` —— 根前缀推导，决定子路径部署是否安全。
- `src/frame/kui-frame.js:80-102`、`:104-115` —— 版本自愈与 `postMessage` 约定。
- `src/components/tabs.js:422-444` —— iframe URL 的 `urlPrefix` 与 `kui_v` 版本戳。
- `.gitignore:1-16` —— 为什么两个产物必须单独加入发布包。
- `package.json:7-28` —— build 脚本、`private:true`、Node 版本下限。

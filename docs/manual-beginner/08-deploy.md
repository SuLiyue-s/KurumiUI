# 08 · 把界面部署到自己的网站或项目

> 适用版本：KurumiUI v1.4.1 ｜ 难度：⭐ 入门 ｜ 前置章节：[02-first-run.md](02-first-run.md)、[05-new-page.md](05-new-page.md) ｜ 阅读时长：约 20 分钟

## 本章目标

- 能说出「整站替换、独立页面、iframe 嵌入」三种用法各适合什么场景，并选出自己要用的那一种。
- 能照着清单挑出必须上传的文件，说明 `server.js`、`tools/`、`test/` 为什么不用上传。
- 能在本地依次跑通 `npm run build:config`、`npm start`、`npm run check:assets`、`npm run verify:build`，并看懂输出。
- 能独立完成一次发布：GitHub Pages、Netlify Drop 或自己的服务器（宝塔 / nginx），三选一即可。
- 部署后能用 10 项自检清单，快速定位白屏、404、样式丢失这类问题。

## 1. 先搞清楚：你要的是哪一种上线方式

开始之前，先认识四个词——后面每一步都会用到：

- **静态文件**：HTML、CSS、JS、JSON、图片这些「放在那里、浏览器直接拿」的文件。KurumiUI 全是静态文件，没有后端和数据库。
- **静态托管**：能通过网址访问静态文件的地方，比如 GitHub Pages、Netlify、自己服务器的 nginx。
- **根目录**：`index.html` 所在的那一层；访问网址时托管平台默认把它当首页。
- **MIME 类型**：服务器告诉浏览器「这是什么文件」。类型不对（比如把 `.js` 当纯文本）浏览器会拒绝执行，界面就白了。

三种用法只在「你把文件放到哪里、访问哪个网址」上不同，选一种就行：

| 用法 | 适合谁 | 你要做什么 | 上线后长什么样 |
| --- | --- | --- | --- |
| **A. 整站替换** | 想用一个独立网址当自己的工作台 / 后台 / 工具站 | 上传整包，让 `index.html` 成为首页 | 打开你的域名，直接看到「刻刻帝终端」完整界面（菜单 + 顶栏 + 标签页） |
| **B. 只做一个独立页面** | 已经有网站，只想加一个页面（比如一个表单页） | 把 `pages/` 或 `standalone/` 里的某一个 HTML，连同 `src/`、`config/` 一起放进现有网站的某个文件夹 | 访问 `你的网站/那个文件夹/pages/form.html`，看到单独的一页 |
| **C. 嵌入现有网站 iframe** | 已有网站，只想嵌一块 KurumiUI 进去 | 先用 A 把 KurumiUI 发布到某个网址，再在你自己的页面里放一个 `<iframe>` | 你的页面中间出现一块 KurumiUI，四周仍是你原来的网站 |

- **A 整站替换**：最常用，第 4~6 节讲的都是它。整包上传，`index.html` 放在根目录。
- **B 只做一个独立页面**：不能只复制一个 HTML 文件——页面里的样式和脚本用的是相对路径（`../src/styles/…`、`../src/core/kui-all.js`），所以 `src/`、`config/` 必须和它保持同样的上下级关系。最简单的做法：把整个项目按原结构上传到一个子文件夹（例如 `你的网站/kurumi/`），以后访问 `你的网站/kurumi/pages/home.html`。
- **C iframe 嵌入**：先用 A 得到一个能打开的网址，再在宿主页面里写一个 `<iframe>`（完整示例见第 6.4 节）。

> 一句话建议：第一次部署请直接选 A + Netlify Drop（第 5 节），最快；需要固定网址再考虑 GitHub Pages 或自己的服务器。

## 2. 上线要带哪些文件

### 2.1 必须上传的文件

| 类别 | 路径 | 说明 |
| --- | --- | --- |
| 入口页 | `index.html` | 打开网址时看到的主页面 |
| 框架与样式 | `src/`（整个文件夹） | 里面是 `core/`、`components/`、`styles/`、`frame/`、`app/`，一个都不能少 |
| 主配置 | `config/app.json` | 决定界面长什么样：标题、菜单、标签页、布局 |
| 文案配置 | `config/text.json` | 界面上的文字 |
| 配置兜底包 | `config/bundle.js` | **自动生成的文件**，配置读取失败时靠它兜底（上传前必须先跑一次打包） |
| 主题 | `src/themes.json` | 6 套配色；缺了会退回默认色 |
| 业务页面 | `pages/`（整个文件夹） | 7 个页面：home、profile、form、editor、dialogs、notify、theme |

### 2.2 建议一起带上（不影响打开，但以后有用）

| 路径 | 为什么建议带 |
| --- | --- |
| `config/kui-modules.json` | 框架的模块清单；以后想重新打包、核对文件时要用 |
| `config/demos/` | 11 个示例配置；`standalone/` 里的演示页会读取它们 |
| `standalone/` | 13 个单组件演示页；主配置的菜单里有一组演示条目指向这里 |

> 注意：默认菜单「灵装回路」一组指向 `standalone/…html`；不上传 `standalone/` 时点这些条目会 404，把 `menu.props.items` 里这一组删掉即可（见 [04-config-ui.md](04-config-ui.md)）。

### 2.3 不用上传的文件（留在自己电脑上就好）

| 路径 | 用途 | 为什么不用传 |
| --- | --- | --- |
| `server.js` | 本地预览服务器 | 只给本地 `npm start` 用，线上用托管平台的服务器 |
| `package.json` | 项目说明与命令清单 | 只有本地执行 `npm run …` 才需要 |
| `tools/`、`test/`、`.tools/`、`.shots/` | 打包、测试、校验脚本 | 开发用；线上只需要成品文件 |
| `docs/` | 文档 | 不影响运行 |
| `node_modules/` | 第三方依赖 | 本项目零依赖，本来就不会生成这个文件夹 |

### 2.4 上传后的目录应该长这样

关键点只有一个：**`index.html` 和 `src/`、`config/`、`pages/` 要在同一层**。框架里所有引用都是相对路径，目录层级一乱，页面就找不到样式和脚本。

```text
你的网站文件夹/
├─ index.html
├─ src/
│  ├─ core/          ← 框架内核，含唯一入口 kui-all.js
│  ├─ components/    ← 组件与 19 个表单控件
│  ├─ styles/        ← 样式文件（base / controls / components / tooltip / boot / avatar）
│  ├─ frame/         ← 标签页、弹窗用的页面外壳
│  ├─ app/           ← 启动脚本
│  └─ themes.json    ← 6 套主题
├─ config/
│  ├─ app.json       ← 主配置
│  ├─ text.json      ← 文案
│  ├─ kui-modules.json
│  ├─ bundle.js      ← 自动生成（必须上传）
│  └─ demos/         ← 可选：示例配置
├─ pages/            ← 7 个业务页面
└─ standalone/       ← 可选：13 个演示页
```

### 2.5 两个「自动生成」的文件要特别注意

`config/bundle.js` 和 `src/core/kui-all.js` 都是本地生成出来的，默认不会跟着源码一起提交（`.gitignore` 里忽略了它们）。所以：

- 上传前先跑 `npm run build:config`，确认两个文件都存在；
- 漏传 `config/bundle.js`：控制台会报「配置读取失败……且未找到 config/bundle.js 兜底」；
- 漏传 `src/core/kui-all.js`：页面加载不出框架，直接白屏。

**要不要连 `config/*.json` 一起上传？** 建议一起传。用 `http(s)` 访问时页面会直接读取这些原始 JSON，**部署后想在线微调标题/文案/默认主题，改服务器上的 JSON、刷新页面就生效，不用重新构建**。如果只传 `config/bundle.js`（把原始 JSON 留在本地），以后任何配置改动都必须本地 `npm run build:config` 后重新上传。注意 `config/kui-modules.json` 是例外：它决定 `kui-all.js` 的脚本清单，改它无论哪种方式都必须 `npm run build:all` 重建。

## 3. 上传前，先在本地跑一遍

这一步能挡掉大多数「传上去才发现坏了」的情况。打开命令行（Windows 搜索 PowerShell；Mac 打开「终端」），用 `cd` 进入项目文件夹。

### 3.1 重新生成配置包

```bash
npm run build:config
```

你会看到（路径会显示成你自己电脑上的位置）：

```text
KurumiUI 配置打包完成
  输出: <你的项目文件夹>\config\bundle.js
  大小: 112.5 KB
  app.json   : ✔
  text.json  : ✔
  themes.json: ✔
  demos      : 11 个
[build-all] 已生成 src\core\kui-all.js (4032 字节)
[build-all] profiles: app=29, standalone=28
```

看到最后两行 `[build-all]` 就说明两个产物都生成好了。**这一步每次改过 `config/*.json` 都要重新跑**。

### 3.2 本地预览一次

```bash
npm start
```

终端会打印一个「本地地址」：

```text
  KurumiUI · 刻刻帝终端
  ────────────────────────────────────────────
  本地地址: http://127.0.0.1:8080/
  根目录  : <你的项目文件夹>
  Node    : v24.14.0
  停止服务: Ctrl + C
```

- 端口不一定是 8080：被占用会自动换成 8081、8082……以终端实际打印的地址为准（实测有落到 8082 的情况）。
- `Node` 那一行只是本机 Node.js 版本，不影响使用。
- 复制「本地地址」到浏览器打开：先看到启动屏，几秒后进入主界面——左侧菜单、顶部导航、标签栏和首页内容都在。
- 停止服务：终端里按 `Ctrl + C`。

### 3.3 体检命令

```bash
npm run check:assets
```

最后一行应该是：

```text
汇总: 22 个 HTML，错误 0 个，警告 0 个
```

```bash
npm run verify:build
```

最后两行应该是：

```text
汇总：通过 6 项，失败 0 项
结果：源码与编译产物一致，版本号一致 ✔
```

### 3.4 这两条不过，就先别上传

`check:assets` 检查每个 HTML 引用的文件是否存在，`verify:build` 检查两个产物与源码是否一致。只要不是 0 错误，先把本地修好再上传，否则线上大概率白屏或没样式。

## 4. 手把手：发布到 GitHub Pages

适合：想要一个固定的免费网址，东西可以公开（GitHub Pages 的仓库和网站都是公开的）。**不需要装 Git、不需要会命令行**，网页上传就能完成。

1. 打开 [github.com](https://github.com)，注册并登录（已有账号直接登录）。
2. 右上角 `+` → **New repository**；`Repository name` 填一个名字（如 `my-kurumi`）；可见性选 **Public**；点 **Create repository**。
3. 新仓库页面里点 **uploading an existing file**（或 `Add file` → `Upload files`）。
4. 打开项目文件夹，把 `index.html`、`src`、`config`、`pages` 拖进上传区（想保留演示页再加 `standalone`）。**不要拖** `tools`、`test`、`.tools`、`docs`。
   - 先确认 `config/bundle.js` 和 `src/core/kui-all.js` 已存在（第 3.1 节生成过）。
   - 一次传不完就分几次：先 `index.html` + `config`，再 `src`，最后 `pages`；每次点 **Commit changes**。
5. 进入仓库的 **Settings**（设置）→ 左侧点 **Pages**。
6. **Source**（来源）选 **Deploy from a branch**（从分支部署）；**Branch**（分支）选 `main`，目录选 `/ (root)`；点 **Save**。
7. 等 1~2 分钟刷新这个页面，顶部会出现一行：`Your site is live at https://<你的用户名>.github.io/<仓库名>/`。
8. 打开这个网址——应该能看到完整界面。

**常见卡点**

- 打开是 404：检查仓库首页文件列表里，`index.html` 是不是直接在根目录（不是藏在某个子文件夹里）。
- 打开白屏、控制台说找不到 `config/bundle.js` 或 `src/core/kui-all.js`：回到第 3.1 节生成，再补传这两个文件。
- 更新后还是旧页面：`Ctrl + F5` 强制刷新（Mac 为 `Cmd + Shift + R`）。
- GitHub Pages 只能托管静态文件，不能运行 `npm start` 或 `node`。

## 5. 手把手：Netlify Drop 拖一下就上线

适合：想最快看到一个线上网址，不想建仓库、不想配置服务器。

1. 浏览器打开 [app.netlify.com/drop](https://app.netlify.com/drop)。
2. 把**项目文件夹**整个拖进页面中间的虚线框。注意：拖的是「里面直接有 `index.html`」的那个文件夹，不是它的上一层，也不是单独一个 `index.html`。
3. 等进度条走完，页面会给你一个随机网址（形如 `https://xxxx-yyyy.netlify.app`），点 **Open site** 就能看到界面。
4. 想长期保留、想改个好记的域名：注册一个免费账号，进入 **Sites** → 点你的站点 → **Site configuration** → **Change site name**。

**拖之前建议先清理一份「发布文件夹」**

在本地复制一份项目文件夹，删掉 `tools/`、`test/`、`.tools/`、`.shots/`、`docs/`、`server.js` 再拖。清理后仍要保证 `index.html`、`src/`、`config/`、`pages/` 在同一层。

## 6. 手把手：自己的服务器（宝塔面板 / nginx）

适合：已经有自己的服务器和域名，想完全自己控制（国内服务器 + 域名需要先完成 ICP 备案）。

### 6.1 宝塔面板（图形化，推荐新手）

1. 登录宝塔面板（安装方式见宝塔官网，地址形如 `http://服务器IP:8888`）。
2. **软件商店** 确认已装 **Nginx**（一般默认就有）。
3. **网站** → **添加站点**：填域名（没有可先填服务器 IP），记下根目录（如 `/www/wwwroot/kurumi`），PHP 版本选「**纯静态**」。
4. **文件** → 进入站点根目录 → **上传**：把本地项目压缩成 zip 上传，再右键 **解压**；确认根目录里直接看得到 `index.html`。
5. **网站** → 点站点右侧 **设置** → **默认文档**：确认 `index.html` 排在第一位。
6. 浏览器访问你的域名，看到界面就成功了；要 https 就在同一页面用「**SSL**」→「Let's Encrypt」一键申请证书，并开启「强制 HTTPS」。

### 6.2 纯 nginx（会一点命令行）

把文件上传到服务器目录（如 `/var/www/kurumi`，结构同第 2.4 节），然后新建配置 `/etc/nginx/conf.d/kurumi.conf`：

```nginx
server {
  listen 80;
  server_name ui.example.com;
  root /var/www/kurumi;
  index index.html;
  charset utf-8;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location ~* \.(css|js|json)$ {
    add_header Cache-Control "public, max-age=300";
  }
}
```

检查并生效：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 6.3 服务器上最容易忽略的两件事

- **MIME 类型**：如果浏览器控制台出现 `Refused to execute script ... MIME type ('text/plain')`，说明服务器把 `.js` 当成了纯文本。检查 nginx 主配置里有没有 `include mime.types;`（被注释掉就会这样），改完 reload 一次。
- **https**：主题记忆、剪贴板等依赖安全上下文；用域名时尽量配上证书。

### 6.4 嵌入到现有网站（iframe）

已经用 A 得到一个网址后，在宿主页面里放：

```html
<iframe src="https://你的域名/kurumi/index.html" title="KurumiUI 控制台"
  style="width:100%;height:760px;border:0;display:block"
  loading="lazy"></iframe>
```

- 高度先写死最简单（上面是 760px）；想做「随内容自动变高」需要自己写一小段脚本，原理见 [../manual/14-deploy.md](../manual/14-deploy.md) 第 5 节。
- 内层是 https 时，外层页面也必须是 https，否则浏览器会拦。
- 一般不需要加 `sandbox`；如果宿主站点有安全要求必须加，至少要包含 `allow-scripts`，再加上 `allow-same-origin`，不然主题和折叠状态记不住。

## 7. 部署后的 10 项自检

上传完成后，打开线上网址，按这张表逐项过一遍。全部通过，才算真的部署成功。

| # | 检查项 | 怎么看 | 期望 |
| --- | --- | --- | --- |
| 1 | 首页能打开 | 浏览器访问你的网址 | 先出现启动屏，几秒内进入「刻刻帝终端」主界面，不白屏 |
| 2 | 控制台干净 | 按 `F12` → Console，刷新页面 | 没有红色报错，没有 404 |
| 3 | 三份配置都在线 | `F12` → Network，筛选 `json` | `app.json`、`text.json`、`themes.json` 都返回 200 |
| 4 | 两个产物都在线 | 地址栏直接访问 `/config/bundle.js` 和 `/src/core/kui-all.js` | 都返回 200，不是 404 |
| 5 | 菜单完整 | 看左侧菜单 | 能看到分组（时间中枢 / 灵装回路 / 观测回廊）和条目，图标正常 |
| 6 | 标签页能开 | 点几个菜单条目 | 顶部新增标签，内容区显示对应页面 |
| 7 | 切换不丢状态 | 在已打开的标签之间来回点 | 页面不重新加载（默认开启保活） |
| 8 | 主题能换 | 点菜单底部的「切换灵装主题」 | 配色立刻变化，弹窗显示正常 |
| 9 | 样式没丢 | 看字体、圆角、间距 | 与本地 `npm start` 看到的一致，不是纯文字排版 |
| 10 | 刷新与直链 | 刷新首页；直接打开一个 `pages/` 页面 | 首页正常；页面能单独打开且无报错 |

## 8. 以后怎么更新线上界面

改完界面后，按这个顺序更新：

1. **在本地改文件**：改 `config/app.json`（标题、菜单等）、`config/text.json`（文案）或 `pages/` 里的页面。
2. **重新打包**：`npm run build:config`。改了 `config/*.json` 就必须跑；只改 `pages/` 里的 HTML 可跳过。
3. **上传变化的文件**：至少上传你改的配置文件和重新生成的 `config/bundle.js`；如果改了 `src/` 或 `pages/`，对应文件也要传。
4. **强制刷新**：`Ctrl + F5`（Mac 是 `Cmd + Shift + R`）。如果标签页里还是旧内容，在网址后面加一个版本号再打开一次，例如 `?kui_v=2`。
5. **抽查三项**：第 7 节的第 1、2、6 项。

两个提醒：

- 不要改线上服务器里的 `config/bundle.js`——它是生成物，下次打包会被覆盖；
- 只改线上的 `app.json`、不重新打包也能立刻生效，但离线兜底包会落后一步，换台电脑或缓存异常时就会看到新旧不一致，所以养成「改配置就重新打包」的习惯。

## 9. 部署失败了？对症下药

| 现象 | 最可能的原因 | 先做这三步检查 | 修复 |
| --- | --- | --- | --- |
| 打开是白屏 | 两个生成物没上传；或文件不在根目录 | ① 直接访问 `/src/core/kui-all.js` 看是不是 404 ② 看仓库根目录有没有 `index.html` ③ Console 有没有红字 | 本地跑 `npm run build:config`，把两个产物补传，并确认目录结构正确 |
| 控制台提示「配置读取失败……且未找到 config/bundle.js 兜底」 | `config/bundle.js` 漏传或路径不对 | ① 直接访问 `/config/bundle.js` ② 确认 `index.html` 同层有 `config/` | 本地生成后上传；保持目录层级不变 |
| 页面是纯文字，完全没有样式 | `src/styles/` 没传全，或目录层级被打乱 | ① Network 里 `base.css` 是否 200 ② 直接访问 `/src/styles/base.css` | 上传完整的 `src/` 文件夹，不要只传一部分 |
| 左侧菜单是空的 | `config/app.json` 没传，或 JSON 写坏了 | ① 直接访问 `/config/app.json` ② 用在线 JSON 校验器检查本地文件 | 修好 JSON（注意双引号、不能有注释和多余逗号）后重新上传 |
| 点菜单出现 404 或空白 | 对应页面没上传（`pages/` 或 `standalone/`） | ① 看 Network 里请求的 URL 是什么 ② 本地是否存在这个文件 | 上传对应文件夹，或把菜单里指向不存在页面的条目删掉 |
| GitHub Pages 打开 404 | 仓库根目录没有 `index.html`；或 Pages 没选分支 | ① 仓库文件列表第一层找 `index.html` ② Settings → Pages 是否显示 live 地址 | 把文件移到根目录；重新选 `main` + `/ (root)` 保存 |
| 上传了新版本，页面还是旧的 | 浏览器或 CDN 缓存 | ① 无痕窗口打开 ② 强刷 ③ 看 Network 里 `app.json` 是否为 200（不是 from cache） | 强刷；必要时清 CDN 缓存；网址加 `?kui_v=2` |
| 宝塔 / nginx 访问是 403 | 默认文档没配 `index.html`，或目录权限不对 | ① 网站设置里的默认文档 ② 文件所有者是否为 `www` | 把 `index.html` 加进默认文档；用面板「修复权限」 |
| 弹窗、提示框样式错乱 | 少传了 `tooltip.css` 或 `boot.css` | ① Network 筛 `css`，看哪个 404 ② 本地 `src/styles/` 是否齐全 | 把 `src/styles/` 整个文件夹补齐上传 |

## 动手练习

1. **换名字再上线**：把 `config/app.json` 里的 `app.title` 改成「我的工作台」，然后 `npm run build:config`，用 Netlify Drop 拖上去。验证：浏览器标签页标题和左侧品牌区都变成新名字。
2. **GitHub Pages 全流程**：按第 4 节建一个公开仓库并上传，记录你的网址；然后故意把 `config/bundle.js` 删掉再上传一次，观察页面和控制台的变化（提示：用第 9 节第一行对照）。
3. **更新演练**：改一句 `config/text.json` 里的文案，重新打包，只上传「变化的文件」，强刷验证。再想一想：如果这次忘了传 `config/bundle.js`，什么情况下会露馅？（提示：第 8 节最后两条提醒）

## 本章小结

- KurumiUI 是纯静态网站：部署 = 把文件放到一个能通过网址访问的静态托管上，不需要后端。
- 三种用法选一种：整站替换（A）、独立页面（B，要和 `src/`、`config/` 保持原目录结构）、iframe 嵌入（C，外层内层都要 https）。
- 必须上传：`index.html`、`src/`、`config/app.json`、`config/text.json`、`config/bundle.js`、`src/themes.json`、`pages/`；两个生成物要先本地 `npm run build:config`，`server.js`、`tools/`、`test/`、`docs/` 留在本地。
- 上传前的四条命令：`npm run build:config` → `npm start` → `npm run check:assets` → `npm run verify:build`，输出里错误与失败都要是 0。
- 托管三选一：GitHub Pages（免费固定网址）、Netlify Drop（最快，拖一下）、自己的服务器（宝塔图形化 / nginx）。
- 更新流程固定四步：改文件 → 重新打包 → 上传变化文件 → 强刷。
- 部署后按 10 项自检过一遍；白屏先查两个生成物，样式丢了先看 `src/styles/`，404 先看对应文件在不在。

## 延伸阅读

- 想深入：[../manual/14-deploy.md](../manual/14-deploy.md)（部署与跨项目复用的完整版：子路径、离线包、iframe 协议、回滚、上线检查）
- 想了解构建脚本：[../manual/02-build.md](../manual/02-build.md)（两个产物是怎么生成的）
- 环境还没装好：[../manual/01-install.md](../manual/01-install.md)（Node.js 安装与本地启动）
- 部署后遇到怪问题：[09-troubleshooting.md](09-troubleshooting.md)（常见问题急救包）
- 学完了，下一步：[10-next-steps.md](10-next-steps.md)（进阶路线与 7 天计划）

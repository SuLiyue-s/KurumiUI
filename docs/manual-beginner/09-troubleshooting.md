# 09 · 常见问题急救包

> 适用版本：KurumiUI v1.4.0 ｜ 难度：⭐ 入门 ｜ 前置章节：[02-first-run.md](02-first-run.md) ｜ 阅读时长：约 25 分钟

## 本章目标

- 遇到「打不开、白屏、没样式、点了没反应」时，能在 3 分钟内判断问题出在启动、界面、配置、主题还是部署；
- 会用浏览器 F12 的 Console（控制台）、Network（网络）、Elements（元素）三个面板找到真正的错误；
- 能对照 25 条以上高频问题表，自己把大部分毛病修好；
- 改坏配置后，能用「备份 / Git / 重新下载」三种办法恢复；
- 知道求助时要提供哪四样信息，不再只说「打不开」。

## 0. 急救三原则

改坏不可怕，乱改才可怕。先记住三句话：

1. **先看证据，再动手。** 按 F12 看 Console 有没有红字、Network 有没有 404，比猜十次快。
2. **先回到能跑的状态。** 能用 `npm start` 就不要双击 `index.html`；不确定哪里错了，先用备份恢复，再一点一点改。
3. **一次只改一处。** 每次只改一个字段，保存、刷新（`Ctrl + F5`）、确认「你会看到什么」，再改下一处。

## 1. 先分诊：问题大概在哪一层

| 你看到的现象 | 最可能在哪一层 | 直接跳到 |
| --- | --- | --- |
| 命令窗口报错、`npm` 用不了、服务器起不来 | 启动 | [第 2 节](#2-启动类命令跑不起来服务器怪怪的) |
| 页面能打开，但白屏、没样式、菜单空、标签没反应 | 界面 | [第 3 节](#3-界面类能打开但看着不对) |
| 改了 JSON 文件，界面没变化，或者干脆坏了 | 配置 | [第 4 节](#4-配置类改了-json-没反应--改坏了) |
| 完全没头绪 | 先学工具 | [第 7 节](#7-用-f12-看现场三个面板就够) |

## 2. 启动类：命令跑不起来、服务器怪怪的

| 现象 | 最可能原因 | 先做这三步检查 | 修复 |
| --- | --- | --- | --- |
| 输入 `npm` 提示「不是内部或外部命令，也不是可运行的程序」 | Node.js 没装好，或装完没有重开命令窗口 | ① 关掉命令窗口重新打开，输入 `node -v` 看有没有版本号；② 仍然提示说明没装或没装进 PATH；③ 去 Node.js 官网下载 LTS 安装包 | 重装 Node.js LTS → 重开命令窗口 → `node -v` 能看到版本号就正常 |
| `npm start` 一出就是一大堆红字或语法错误 | Node.js 版本太旧（低于 13.14） | ① `node -v` 看版本号；② 低于 v13.14 就升级（推荐 LTS）；③ 升级后重开命令窗口再试 | 安装 Node.js LTS（18/20/22 都可以），重新 `npm start` |
| `npm start` 提示端口被占用，地址变成 8081、8082 | 8080 被别的程序占用，服务器会自动换一个端口 | ① 看终端最后打印的「本地地址」是哪一号；② 浏览器打开那个地址；③ 想固定端口就手动指定 | 用终端实际显示的地址；或运行 `node server.js --port 9000` |
| 终端停住不动，一直显示「本地地址」 | 服务器已经启动，正在等你访问，这是正常状态 | ① 是否看到「本地地址: http://127.0.0.1:8080/」；② 浏览器能打开它吗；③ 想关掉服务器要按 `Ctrl + C` | 不用修；离开时按 `Ctrl + C` 停止服务器 |
| 双击 `index.html` 打开是白屏 | `file://` 模式必须先有 `config/bundle.js`，新下载的仓库里没有它 | ① 是否执行过 `npm run build:config`；② 文件夹里有没有 `config/bundle.js`；③ 按 F12 看 Console 是不是「配置读取失败」 | 先 `npm run build:config` 再双击；更推荐改用 `npm start` |
| 双击打开后，改了 `config/app.json` 却一点变化都没有 | `file://` 读的是 `config/bundle.js` 里的旧快照 | ① 确认地址栏是不是 `file://` 开头；② 改完是否重新构建过；③ 是否刷新了页面 | 每次改配置后 `npm run build:config`，再刷新；推荐改用 `npm start` |

## 3. 界面类：能打开，但看着不对

| 现象 | 最可能原因 | 先做这三步检查 | 修复 |
| --- | --- | --- | --- |
| 整页白屏，浏览器标签上有标题 | 脚本没加载出来，或配置读取失败 | ① F12 看 Console 的第一条红字；② Network 里 `src/core/kui-all.js` 是不是 404；③ 是不是双击打开（`file://`）且没有 `bundle.js` | 缺产物先 `npm run build:config`；文件 404 就检查是不是被删或移动了 |
| 有文字但完全没有样式，像很旧的网页 | 样式文件没加载，或 `index.html` 里的引入顺序被打乱 | ① Network 看 `base.css`、`controls.css`、`components.css`、`tooltip.css`、`boot.css` 是不是都 200；② 是否手动改过 `index.html` 的 `<head>`；③ Console 有没有 MIME 类型警告 | 恢复 `index.html` 里 `<link>` 的顺序；确认 `src/styles/` 文件夹在 |
| 菜单区是空的，但外壳还在 | `menu.props.items` 为空、层级写错，或 JSON 没解析成功 | ① Console 是否报 JSON 解析错误；② `config/app.json` 里 `menu.props.items` 是不是数组；③ 每一项有没有 `type`（`group`/`item`/`divider`） | 照已有条目恢复 `items`；改之前先备份 |
| 点菜单或标签页没反应 | 菜单项缺 `target.tab`，或子页面地址 404 | ① 点一下，Network 有没有发出新请求；② `target.tab` 里有没有 `id` 和 `url`；③ 对应的 `pages/xxx.html` 是否存在 | 补上 `target.tab`；让 `url` 指向真实存在的页面 |
| 标签页切走再切回来，填过的内容没了 | `keepAlive` 被设成 `false`，或标签数超过 `maxTabs` 被关掉 | ① 看 `config/app.json` 里 `tabs.props.keepAlive`；② 是否超过 `maxTabs`（示例配置是 24）；③ 改完是否刷新过 | 把 `keepAlive` 改回 `true`，或调大 `maxTabs`（写法见本节示例） |
| 启动屏一直转，进不了界面 | 启动屏后面的脚本没加载成功，最常见是 `kui-all.js` 404 或有 JS 报错 | ① F12 Console 的第一条红字；② Network 里 `src/core/kui-all.js` 是否 200；③ 地址加 `?kui_debug=1` 看有没有诊断面板出现 | 先修掉 404 和 JS 报错；产物缺失就重新 `npm run build:config` |

下面是一个可以照抄的「保留标签页」配置片段（只改 `config/app.json` 里对应的 `tabs` 段，不要整文件替换）：

```json
{
  "tabs": {
    "type": "tabs",
    "props": {
      "keepAlive": true,
      "maxTabs": 24
    }
  }
}
```

## 4. 配置类：改了 JSON 没反应 / 改坏了

| 现象 | 最可能原因 | 先做这三步检查 | 修复 |
| --- | --- | --- | --- |
| 改了 `app.json` 的标题，页面没变化 | `file://` 下没重建 `bundle.js`，或浏览器缓存 | ① 你用的是 `http://` 还是 `file://`；② `file://` 模式是否重新构建过；③ 按 `Ctrl + F5` 强制刷新 | `http://` 模式刷新即可；`file://` 要先 `npm run build:config` |
| 保存后页面直接坏掉，Console 报 `Unexpected token` | JSON 语法错：少引号、少括号、多了逗号 | ① 看报错里的文件名和行号；② 用第 8 节的 `JSON.parse` 命令验证；③ 和备份对比刚改了哪里 | 把 JSON 改到合法；改不动就先恢复备份 |
| 最后一项后面多了逗号，或出现中文引号/逗号（“ ” ，） | JSON 不允许尾逗号；从聊天软件、文档粘贴会把符号变全角 | ① 看报错行号附近有没有 `},` 紧跟 `]`/`}`；② 放大看引号是直的还是弯的；③ 搜索 `，` `：` 并替换成英文 | 删掉尾逗号、把标点换成英文；VS Code 里全角标点会标红 |
| 配置里的中文变成乱码或问号 | 文件被保存成了 GBK 等非 UTF-8 编码 | ① 看编辑器右下角的文件编码；② 文件开头有没有 BOM；③ 用 VS Code 的「通过编码保存」选 UTF-8 | 以 UTF-8（无 BOM）重新保存文件 |
| 改了 `config/text.json`，界面文案却不变 | `app.json` 里的 `text` 段覆盖了 `text.json` | ① 搜 `config/app.json` 有没有 `"text": {`；② 是不是两处都改了；③ 改完刷新了吗 | 二选一：删掉 `app.json` 里的 `text` 覆盖，或直接改 `app.json` 里的值 |
| 新加的菜单项或标签页不出现 | 结构写错：对象写成数组、缺 `type`、括号不配对 | ① 用第 8 节的命令校验 `app.json`；② 对照已有条目的结构；③ Console 有没有渲染报错 | 照已有条目复制再改；改前先备份 |
| 改了 `config/kui-modules.json`（脚本清单）后页面没变化 | 它不会进 `bundle.js`，而是生成 `src/core/kui-all.js`，必须重建 | ① 有没有跑 `npm run build:all`；② 看 `src/core/kui-all.js` 的修改时间；③ Console 有没有脚本加载错误 | 跑 `npm run build:all`（或 `npm run build`）后刷新 |
| 在设置里改的终端名称/主题，换台电脑或换浏览器就没了 | 界面保存的偏好写在本机浏览器 localStorage，不写配置文件 | ① F12 → Application → Local Storage 看有没有 `kui-shell-name`、`kui-theme`；② 换无痕窗口复现；③ 对比 `config/app.json` 的默认值 | 这是正常现象；想让所有人都看到新默认，请改 `config/app.json` 并按下表决定是否重建 |

## 5. 主题类：颜色不对、换主题没反应

| 现象 | 最可能原因 | 先做这三步检查 | 修复 |
| --- | --- | --- | --- |
| 换主题没反应，颜色一点没变 | 主题 id 写错，或主题数据没加载 | ① 用菜单里的「切换灵装主题」试一次；② F12 → Elements，点最上面 `<html>`，看有没有 `--kui-accent` 这类变量；③ 控制台执行 `KUI.info()`，看 `themes` 是不是 6 | 只用 6 个内置 id：`kurumi`、`kurumi-angel`、`starry`、`sakura`、`abyss`、`dawn` |
| 改了 `theme.default`，刷新后还是旧主题 | 浏览器记住了你上次切换的主题（`storageKey`） | ① 开一个无痕窗口打开试试；② 手动切到想要的主题再刷新；③ 清掉这个站点的浏览器数据 | 用无痕窗口验证；或手动切换一次；想彻底重置就清站点数据 |
| 主题选择弹窗里少了某个主题 | `theme.visible` 列表里没有包含它 | ① 看 `app.json` 的 `theme.visible` 数组；② 这个 id 在 `src/themes.json` 里是否存在；③ 刷新后再看 | 把 id 加进 `visible`，或删掉 `visible` 让全部主题显示 |
| 打开瞬间闪一下白或黑 | 主题恢复脚本没在 `<head>` 最前面执行 | ① Network 看 `src/core/theme-boot.js` 是否 200；② 它是否被挪到了 `<body>` 里；③ Console 有没有报错 | 把 `<script src="src/core/theme-boot.js"></script>` 放回 `<head>` 第一行 |
| 自己加的 `--kui-*` 颜色变量不生效 | 变量名拼错、没加 `--kui-` 前缀，或写错了主题对象 | ① 和已有变量的写法逐字对比；② 检查拼写；③ 清缓存后强制刷新 | 照抄已有变量的格式，写在对应主题的 `tokens` 里；字段见 [07-theme-basics.md](07-theme-basics.md) |

## 6. 部署类：本地能跑，线上不行

| 现象 | 最可能原因 | 先做这三步检查 | 修复 |
| --- | --- | --- | --- |
| 本地正常，传到网上后 404 或白屏 | 两个构建产物被 `.gitignore` 排除，没有上传 | ① 部署包里有没有 `config/bundle.js` 和 `src/core/kui-all.js`；② Network 里哪个文件 404；③ 上传的目录结构是否完整 | 先在本地 `npm run build:config`，再把这两个文件一起上传 |
| 页面能打开，但白屏 | 服务器把 `.js`、`.json` 当成纯文本返回，浏览器拒绝执行 | ① Network 点开报错请求看 `Content-Type`；② 是不是只有 HTML 能正常显示；③ 托管平台有没有 MIME 设置项 | 配置 MIME：`.js` 用 `application/javascript`，`.json` 用 `application/json`，`.css` 用 `text/css` |
| 传到子文件夹后全部 404 | 页面里用了以 `/` 开头的绝对路径 | ① Network 看请求的 URL 是不是少了子目录名；② 页面里有没有写死 `/src/...`；③ 换成相对路径试试 | 改成相对路径；不要手工写死以 `/` 开头的地址 |
| 线上还是旧版本，改的内容看不到 | 浏览器或 CDN 缓存了旧文件 | ① `Ctrl + F5` 强制刷新；② 无痕窗口打开；③ Network 里看是 200 还是 from cache | 强刷、等 CDN 刷新，或在地址后加 `?kui_v=2` 临时验证 |
| 把整个文件夹传到网盘，双击 `index.html` 还是白屏 | `file://` 模式只能从 `config/bundle.js` 读配置，网盘里可能没有它 | ① 同目录有没有 `config/bundle.js`；② Console 是不是「配置读取失败」；③ 换本地服务器打开试试 | 把 `bundle.js` 一起上传；更推荐按 [08-deploy.md](08-deploy.md) 用静态托管 |
| 嵌入自己网站时 iframe 空白或被拒绝 | 父子页协议/域名不一致，或对方服务器设置了禁止嵌入 | ① 两个地址是不是都是 `https`；② Console 有没有 `X-Frame-Options` 报错；③ 直接打开 iframe 里的地址能访问吗 | 统一用 HTTPS；改响应头，或把页面部署到允许嵌入的地方 |
| 部署后直接改了服务器上的 `config/*.json`，页面没变化 | 部署包里没上传原始 JSON（只有 `bundle.js`），或浏览器/CDN 缓存 | ① 访问 `你的站点/config/app.json` 看是不是 200；② Network 看页面加载的是 JSON 还是 bundle；③ `Ctrl + F5` 强刷 | 上传 `config/*.json` 后 http 下刷新即生效；只传 bundle 就必须本地 `npm run build:config` 再重传；`kui-modules.json` 永远要 `build:all` |
| 想让所有访问者看到的默认标题/皮肤变了，但自己本机没变 | 本机 localStorage 还记着你以前的偏好，优先级高于配置默认值 | ① F12 → Application 清 `kui-shell-name`/`kui-theme`；② 无痕窗口验证；③ 确认改的是 `config/app.json` 而不是只在界面上保存 | 清本机偏好后用无痕窗口验收；部署包按上一条决定是否重建 |

## 7. 用 F12 看现场：三个面板就够

### 7.1 怎么打开

Chrome / Edge 里按 **F12**（或 `Ctrl + Shift + I`、右键「检查」）。小技巧：**先开 F12 再刷新**，才能抓到启动时的错误。

### 7.2 Console（控制台）：把红字读成「改哪里」

- 打开 Console 后找**第一条**红字，它通常才是根因，后面的很多是连锁反应。
- 最常见的三种：
  - `404 (Not Found)`：某个文件没找到，看它后面的路径。
  - `Uncaught SyntaxError: ...`：JSON 或 JS 语法错，右边会显示文件名和行号。
  - `配置读取失败...`：配置没加载成功，多半是 `file://` 模式缺 `bundle.js`。
- 红字右边的文件名可以点击，会跳到出错的那一行；对照着去改你的 JSON。

### 7.3 Network（网络）：看「有没有把文件拿到」

- **刷新页面**后看请求列表：`200` 正常，`404` 找不到，红色表示失败。
- 首页至少要有：`index.html`、5 个样式文件、`src/core/theme-boot.js`、`src/core/kui-all.js`；`npm start` 时还有 `config/app.json`、`config/text.json`、`src/themes.json`。
- 看到 404 先把文件补上，再谈功能问题。

### 7.4 Elements（元素）：看「页面变成了什么」

- 点左上角小箭头，再点页面上某一小块，右侧 Styles 会显示它的样式。
- 点最上面的 `<html>`，Styles 里应能看到 `--kui-accent`、`--kui-bg-0` 这类颜色变量；**看不到就是主题没应用**。
- 展开 `<body>`，`#kui-app` 里应有内容；空的说明外壳没建起来（回 Console 看错误）。

### 7.5 更省事：`?kui_debug=1` 诊断面板（可选）

在地址后加 `?kui_debug=1` 回车，右下角出现诊断面板，实时记录报错、卡顿和消息。复现问题后点「复制」把整段文本发给别人，比截图有用。原理见 [15-troubleshooting.md](../manual/15-troubleshooting.md)。

## 8. 改坏了怎么办：三种恢复办法

### 8.1 有备份（最省事）

改之前，把 `config/app.json` 复制一份叫 `app.json.bak`。改坏后，把备份复制回来、改回原名、刷新页面，就恢复了。

### 8.2 项目是用 Git 下载的（文件夹里能看到 `.git`）

打开命令行，在项目文件夹里执行：

```bash
git status                          # 先看改了哪些文件
git checkout -- config/app.json     # 只撤销这一个文件
```

注意：`git checkout -- .` 会丢弃所有未提交的改动，**很危险**，不要随便用。

### 8.3 重置到全新副本（最稳）

从仓库重新下载一份压缩包，解压后只把 `config/app.json`、`config/text.json`、`src/themes.json` 这三个文件复制回原项目。`pages/` 里你自己新建的页面要保留，不要整目录覆盖。

### 8.4 只想确认 JSON 有没有写错

在项目文件夹里执行（Windows 的命令行窗口可以直接粘贴）：

```bash
node -e "JSON.parse(require('fs').readFileSync('config/app.json','utf8'));console.log('app.json 语法正确')"
```

输出「app.json 语法正确」就说明 JSON 没问题；如果报错，报错信息会指出大概位置。

## 9. 求助时给这四样信息

想让别人一次就帮上忙，请准备：

1. `node -v` 的输出，例如 `v20.11.1`；
2. 你敲的完整命令（从命令行窗口复制，不要手打省略）；
3. 完整报错：Console 红字截图或复制文本，有多条时从第一条开始；
4. 你刚做了什么：改了哪个文件、哪个字段，改前是什么、改后是什么。

套模板：「我用 `npm start` 启动，Node 是 v20.11.1；改了 `config/app.json` 的 `menu.props.items` 后刷新白屏，Console 报 `Unexpected token '}'`，截图如下。」如果能打开 `?kui_debug=1` 面板，把它复制出来的文本一起贴上，排错会快很多。

## 10. 什么时候去看高级手册

- 修不好或想知道「为什么会这样」：看 [15-troubleshooting.md](../manual/15-troubleshooting.md)，有完整的错误关键词对照和上线验收清单。
- 想一次看懂配置/控件/组件/主题的完整字段：从 [../manual/README.md](../manual/README.md) 的章节索引进入。
- 一句话：本手册教你把常见毛病修好，高级手册教你为什么。

## 动手练习

1. **制造错误再修好。** 在 `config/app.json` 的 `app.title` 那一行末尾多加一个逗号，保存并刷新，观察 Console 报什么错；然后删掉多余逗号，再刷新确认恢复。
2. **用 Network 数文件。** 打开 F12 → Network，刷新首页，找出 5 个样式文件各自的请求状态；再故意把 `index.html` 里一个样式路径改错，看 404 长什么样（记得改回来）。
3. **练一次恢复。** 把 `config/app.json` 备份成 `app.json.bak`，随便改坏一个字段，再用备份恢复，确认界面回到原样。

## 本章小结

- 出问题先按 F12 找证据，再动手改；一次只改一处。
- 启动类先确认三件事：Node 版本、`npm start` 是否在跑、用的是 `http://` 还是 `file://`。
- `file://` 模式下改配置必须 `npm run build:config`；`npm start` 模式刷新页面即可。
- 白屏优先查两处：Console 第一条红字、Network 里 `kui-all.js` 和样式文件是否 404。
- 配置报错大多是逗号、引号、括号的问题，用 `JSON.parse` 能快速定位。
- 主题没变化，先看主题 id 是否正确，再看浏览器记住的上次主题。
- 线上 404 先查两个构建产物：`config/bundle.js`、`src/core/kui-all.js`；改坏就恢复：备份 → Git → 重新下载副本。

## 延伸阅读

- 完整的排错与上线验收：[../manual/15-troubleshooting.md](../manual/15-troubleshooting.md)
- 第一次运行与验证：[02-first-run.md](02-first-run.md)
- 认识界面与开发者工具入门：[03-tour.md](03-tour.md)
- 部署到自己的网站：[08-deploy.md](08-deploy.md)
- 高级手册总目录：[../manual/README.md](../manual/README.md)

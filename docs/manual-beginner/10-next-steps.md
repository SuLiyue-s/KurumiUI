# 10 · 下一步：把 KurumiUI 真正用起来

> 适用版本：KurumiUI v1.4.3 ｜ 难度：⭐⭐ 入门进阶 ｜ 前置章节：[08-deploy.md](08-deploy.md) ｜ 阅读时长：约 20 分钟

## 本章目标

- 用一张清单确认自己已经掌握了哪些基础操作；
- 知道接下来该学什么，以及每一章高级手册能解决什么问题；
- 有一份可以直接照做的 7 天学习计划；
- 会把「小白说法」对应到「专业说法」，以后查资料不再看不懂；
- 遇到升级、跟进新版时，知道看哪里、按什么步骤做。

## 1. 先确认：你已经会了这 10 件事

如果你能独立完成下面每一条，说明入门部分你已经过关了：

1. 安装 Node.js，知道命令行（终端）是一个用文字输入命令的窗口；
2. 用 `npm start` 启动项目，在 `http://127.0.0.1:8080` 看到界面；也试过双击 `index.html`；
3. 认识界面分区：顶部导航、左侧菜单、标签栏、内容区、启动屏；
4. 认识项目文件夹里最重要的 6 个位置：`index.html`、`config/`、`src/`、`pages/`、`standalone/`、`server.js`；
5. 会改 `config/app.json` 的标题、菜单条目、默认标签页；
6. 会改 `config/text.json` 的界面文案；
7. 会新建一个页面并在菜单里加一项，点击能打开；
8. 会做一张简单表单（节点、`type`、`props`、`name` 这些词不再陌生）；
9. 会在 `config/app.json` 里换默认主题，或从菜单里切换主题；
10. 把项目部署到静态托管上，或者知道部署需要带哪些文件。

有哪条还不熟？回 [01-setup.md](01-setup.md) 到 [08-deploy.md](08-deploy.md) 的对应章节补 10 分钟。

## 2. 还没学的部分（每项一句话）

| 你可能会问 | 对应知识 | 一句话说明 |
| --- | --- | --- |
| 控件到底有哪些字段？ | 控件全字段 | 19 个表单控件和其余展示控件，每个都有完整的 `props` 字段表、事件和实例 API |
| 表单的校验、联动怎么做的？ | 表单引擎 | `required` 规则、`deps` 依赖联动、`requiredAny` 组校验、`dialog.form` 弹窗表单 |
| 菜单/导航/标签/弹窗/提醒这些组件怎么配？ | 七大组件 | `menu`、`menunav`、`tabs`、`dialog`、`toast`、`app-shell`、`boot` 的完整配置与事件 |
| 按钮怎么一点就开弹窗？ | 动作与业务函数 | `on` 字段语法、28 个内置动作、7 个分组共 61 个业务函数 |
| 页面之间怎么通信？ | API 与消息 | `KUI.*` 全局 API、iframe 通信协议、`dialog-frame` 的打开与返回值 |
| 主题颜色一共有哪些变量？ | 主题 token | `--kui-*` 变量全表、装饰层、自定义一套主题 |
| 我能加自己的控件/页面吗？ | 扩展 | 自定义控件、组件、主题、动作、函数、页面、模块清单（profile） |

## 3. 进阶路线：按这个顺序读高级手册

高级手册共 16 章，在 `docs/manual/`。下面是从「会用」到「会改」的最短路径：

| 顺序 | 读哪一章 | 学完能做什么 |
| --- | --- | --- |
| 1 | [04-config-app.md](../manual/04-config-app.md) | 看懂 `app.json` 全部字段：`app`、`ui`、`layout`、`theme`、`avatar`、`text`、`menu`、`tabs` 等 |
| 2 | [08-components.md](../manual/08-components.md) | 自己配出完整的菜单、导航、标签栏、弹窗、提醒和外壳 |
| 3 | [05-controls-input.md](../manual/05-controls-input.md) / [06-controls-display.md](../manual/06-controls-display.md) | 用对每个控件：输入类 19 个 + 按钮、图标、表格、头像等展示类 |
| 4 | [07-form-engine.md](../manual/07-form-engine.md) | 做带校验、联动、提交的正式表单 |
| 5 | [10-actions-handlers.md](../manual/10-actions-handlers.md) | 用 `on` 把按钮、菜单、表单接到动作和业务函数上 |
| 6 | [11-api-messaging.md](../manual/11-api-messaging.md) | 在控制台用 `KUI.*` 调试，理解父子页面通信 |
| 7 | [09-theme.md](../manual/09-theme.md) | 改 token 换主色，做自己的主题 |
| 8 | [12-extension.md](../manual/12-extension.md) | 加新控件、新组件、新动作、新页面 |
| 9 | [13-walkthrough.md](../manual/13-walkthrough.md) | 跟着三个端到端案例做一遍 |
| 10 | [14-deploy.md](../manual/14-deploy.md) | 部署到子目录、嵌入现有站点、跨项目复用 |
| 11 | [15-troubleshooting.md](../manual/15-troubleshooting.md) | 排错与上线验收（遇到问题时随时查，不必从头读） |
| 12 | [16-boot.md](../manual/16-boot.md) | 拆装启动屏，改时钟动画与加载进度 |

## 4. 7 天学习计划（每天约 1~1.5 小时）

| 天数 | 今天学什么 | 动手做什么 | 约用时 |
| --- | --- | --- | --- |
| 第 1 天 | 复盘入门：重读 [04-config-ui.md](04-config-ui.md)，读高级手册 [04-config-app.md](../manual/04-config-app.md) 的 `app` 段 | 把标题、副标题、版权、菜单改成本项目的样子 | 90 分钟 |
| 第 2 天 | [08-components.md](../manual/08-components.md) 的菜单与标签栏 | 加一个分组、两个菜单项、一个固定标签 | 90 分钟 |
| 第 3 天 | [05-controls-input.md](../manual/05-controls-input.md) | 用 input、select、switch、textarea 做一个个人资料表单 | 120 分钟 |
| 第 4 天 | [07-form-engine.md](../manual/07-form-engine.md) 的校验与联动 | 给表单加必填校验和一个 `deps` 联动 | 120 分钟 |
| 第 5 天 | [10-actions-handlers.md](../manual/10-actions-handlers.md) 的 `on` 与常用动作 | 给按钮加 `tab.open`、`dialog.alert`、`toast.success` | 90 分钟 |
| 第 6 天 | [11-api-messaging.md](../manual/11-api-messaging.md) 的 `KUI.*` 基础 | 在 Console 里用 `KUI.info()`、`KUI.theme` 调试 | 90 分钟 |
| 第 7 天 | [09-theme.md](../manual/09-theme.md) + [14-deploy.md](../manual/14-deploy.md) | 换一套主色，并按 08 章重新部署一次 | 120 分钟 |

计划可重排，但每天都要「读一段 + 动手改一处 + 刷新验证」，只看不练记不住。

## 5. 术语对照表：小白说法 → 专业说法

| 你以前的说法 | 以后的专业说法 | 一句话解释 |
| --- | --- | --- |
| 黑窗口、命令窗口 | 命令行（终端） | 用文字输入命令的窗口 |
| 那个 JSON 文件 | 配置文件 | 用 JSON 写的、决定界面长什么样的文件 |
| 主配置 | `app.json` | `config/app.json`，界面总开关 |
| 文案配置 | `text.json` | `config/text.json`，界面上的文字 |
| 主题配色 | `themes.json` | `src/themes.json`，6 套配色方案 |
| 一段界面描述 | 节点（node） | `{ "type": …, "props": … }` 这样一段 JSON |
| 左边那一列 | 菜单（menu） | 左侧导航栏 |
| 标签下面那块地方 | 内容区 | 标签页里显示页面的区域 |
| 主题颜色变量 | token | CSS 变量（`--kui-*`），换肤就是换它 |
| 按钮能干啥的配置 | 动作（action） | 字符串命令，如 `tab.open`、`theme.next` |
| 组件自带的小功能 | 业务函数（handler） | 按分组注册的函数，如 `app.openTab` |
| 网页里嵌的网页 | iframe | 一个网页里嵌入的另一个网页，标签页内容就是它 |

## 6. 命令速查表

在项目文件夹里执行。记不住就回来查这张表：

| 命令 | 做什么 | 什么时候用 |
| --- | --- | --- |
| `npm start` | 启动本地服务器，地址 `http://127.0.0.1:8080`（端口占用会自动 +1） | 日常开发第一件事 |
| `npm run build:config` | 重建 `config/bundle.js`（配置包）和 `src/core/kui-all.js` | 改完 JSON 配置、要打包给别人时 |
| `npm test` | 跑 35 项自动化测试 | 改完源码或想确认项目没坏 |
| `npm run smoke` | 跑冒烟测试，检查主要功能 | 大改后做一次快速体检 |
| `npm run check:assets` | 检查 22 个 HTML 引用的文件是否齐全 | 移动/删除文件之后 |
| `npm run verify:build` | 校验构建产物与源码是否一致 | 担心产物过期或改错产物 |
| `node tools/audit-config.js` | 审计 `app.json` 的字段有没有实际读取点 | 想确认某个配置是否真的生效 |
| `node tools/audit-unused.js` | 审计是否有「写了但没人读」的字段 / 样式 / 函数 / API（v1.4.2 新增） | 怀疑某个样式或配置没生效 |
| `npm run verify` | 冒烟 + 动作演示 + 弹窗桥接 + 构建校验 | 发布前完整自检 |

## 7. 常用文件路径速查

| 想改什么 | 改哪个文件 | 关键字段 |
| --- | --- | --- |
| 浏览器标签页标题 | `config/app.json` | `app.documentTitle` |
| 应用名、副标题 | `config/app.json` | `app.title`、`app.subtitle` |
| 菜单条目 | `config/app.json` | `menu.props.items` |
| 默认打开的标签页 | `config/app.json` | `tabs.props.initial`、`tabs.props.home` |
| 界面文案（按钮、提示等） | `config/text.json` | 按组：`app`、`menu`、`shell`、`dialog`、`toast`…… |
| 主题与颜色 | `src/themes.json` | `themes[].tokens` 下的 `--kui-*` |
| 启动屏文案与阶段 | `config/app.json` | `boot.stages`、`boot.clock`、`boot.bar` |
| 头像与齿轮框 | `config/app.json` | `avatar.url`、`avatar.frame` |
| 某个业务页面的内容 | `pages/xxx.html` | 直接改这个页面 |
| 本地服务器行为 | `server.js` | 端口、MIME 等（一般不用改） |
| 全部命令清单 | `package.json` | `scripts` 段 |

## 8. 如何跟进新版本

KurumiUI 的更新记录放在仓库根目录的 `CHANGELOG.md` 里：**最新版本在最上面**，当前是 `v1.3.8`；每个版本一段，写明「修了什么、加了什么、验证结果」。

升级时按这个顺序做：

1. **先备份**：把 `config/` 文件夹和 `src/themes.json` 复制一份（你的改动几乎都在这里）；
2. **替换源码**：用新版本替换 `index.html`、`src/`、`config/`、`package.json` 等，注意保留你改过的配置；
3. **重建产物**：在项目文件夹执行 `npm run build:config`；
4. **确认版本**：打开页面，按 F12 在 Console 执行 `KUI.info()`，`version` 应为 `1.3.8`；`package.json` 里的 `version` 也应一致；
5. **回归检查**：菜单能点开、标签能切换、弹窗能打开关闭、6 套主题都能切换，就说明升级成功。

看到 `CHANGELOG.md` 写「修复了某个配置不生效」时，说明这个字段以前可能不起作用，升级后值得再试。

## 9. 常用 API 速查（想用代码控制界面时看）

命令和配置文件能解决 90% 的问题；剩下 10% 要在浏览器控制台或自己的页面里调 API。下面这些是入门阶段最常用的（完整 API 表在 [../manual/11-api-messaging.md](../manual/11-api-messaging.md)）：

| 想做什么 | 一行代码 | 说明 |
| --- | --- | --- |
| 看当前版本 / 注册数量 | `KUI.info()` | 返回 `{name,version,controls,themes,env}` |
| 切换主题 | `KUI.theme.apply('starry')` | id 见 `src/themes.json`；立即生效并记到 `localStorage['kui-theme']` |
| 读当前主题 id | `KUI.theme.currentId()` | 返回字符串 |
| 弹一条成功提示 | `KUI.toast.success('已保存')` | 还有 `info/warning/error/notify`；`KUI.toast.clear()` 清空 |
| 确认框 | `KUI.dialog.confirm('确定删除？').then(function(ok){})` | 返回 `Promise<boolean>` |
| 打开一个标签页 | `KUI.app.openTab({id:'home',title:'总览',url:'pages/home.html'})` | 字段说明见高级 08 章 |
| 读文案 | `KUI.text('boot.loading')` | 读 `config/text.json`；第二个参数可当兜底 |
| 监听事件 | `KUI.bus.on('theme:change', fn)` | 解绑用 `KUI.bus.off(同一个 fn)` |
| 列出全部动作名 | `KUI.actions.list()` | 动作怎么配见高级 10 章 |
| 给表格换数据 | `var dt = KUI.datatable.get(); dt && dt.setData(rows)` | v1.4.0 新增；完整见高级 08 §6.6 |
| 页面里取表单对象 | `document.querySelector('[data-kui-type="form"]').__kuiControl.getValue()` | 包装 API 见高级 07 §7.2 |
| 清掉本机记住的主题 | `localStorage.removeItem('kui-theme')` | 其它键见 [04-config-ui.md](04-config-ui.md) §9.2 |

## 10. 结束语

到这里，你已经能独立启动、修改、扩展并部署一个 KurumiUI 项目了。真正的进步来自「改一点、看一眼、再改一点」：每读一章就找项目里一个地方动手改，改坏了有第 09 章兜底。慢慢你会发现，界面不再是别人给的模板，而是你可以随手捏成任何样子的东西。

## 动手练习

1. **写自己的计划。** 对照第 4 节的 7 天计划，按你的时间把 7 天改成 7 个具体日期，并把「动手做什么」换成你自己项目里真正想做的事。
2. **跑三条命令。** 依次执行 `npm test`、`npm run check:assets`、`npm run verify:build`，把每条的末行输出记下来（例如「汇总: 35 通过 / 0 失败 / 0 跳过」）。
3. **查一个字段。** 从第 7 节选一个你感兴趣的字段（比如 `boot.stages`），去 `config/app.json` 里找到它，改一处文案，刷新看效果。
4. **读一章高级手册。** 从第 3 节的路线里挑第 1 章（04-config-app）读 20 分钟，回来写一句「我以前不知道的是……」。

## 本章小结

- 入门 10 件事都完成，说明你已经能独立使用这个框架了。
- 接下来的顺序是：配置 → 组件 → 控件 → 表单 → 动作 → API → 主题 → 扩展 → 实战 → 部署 → 排错 → 启动屏。
- 7 天计划的核心是「每天读一段 + 动手改一处」，不是读完就算。
- 命令速查表里，最常用的只有 `npm start` 和 `npm run build:config`。
- 升级前先备份 `config/`，升级后用 `KUI.info()` 确认版本。
- 卡住了先回 [09-troubleshooting.md](09-troubleshooting.md)，再查 [../manual/15-troubleshooting.md](../manual/15-troubleshooting.md)。

## 延伸阅读

- 高级手册总目录（16 章索引与阅读路线）：[../manual/README.md](../manual/README.md)
- 配置字段大全：[../manual/04-config-app.md](../manual/04-config-app.md)
- 完整排错与上线验收：[../manual/15-troubleshooting.md](../manual/15-troubleshooting.md)
- 常见问题急救包：[09-troubleshooting.md](09-troubleshooting.md)

# KurumiUI · 刻刻帝终端

> 科技未来 + 动漫（时崎狂三主题）风格的**配置驱动 UI 框架**。
> 左侧菜单、顶部导航、子标签 + iframe 主体区、iframe 弹窗、提醒信息、25+ 元素控件、6 套可切换主题，
> 全部由 JSON 配置驱动；**只改 JSON 就能改文案、改结构、改颜色，不用动渲染代码**。
> 零运行时依赖、零构建，浏览器传统 `<script>` 直接跑，`file://` 双击可用；Node 端兼容 **13.14**。

---

## 一、快速开始

```bash
# 方式 1：内置静态服务器（推荐，会自动生成 config/bundle.js）
npm start                 # → http://127.0.0.1:8080
node server.js --port=9000

# 方式 2：直接双击 index.html（file:// 亦可运行，依赖 config/bundle.js）
#   修改 config/*.json 后需重新打包：
npm run build:config
```

> 改配置的两种生效路径：
> - `npm start` 起服务（http 协议）时，`config.js` 直接 `fetch` 原始 JSON，**改完刷新即生效**；
> - `file://` 打开时走 `config/bundle.js` 兜底，改完 JSON 需 `npm run build:config`。
> `tools/build-config.js` 会把 `config/app.json`、`config/text.json`、`src/themes.json`、`config/demos/*.json`
> 打包成 `config/bundle.js`（文件头带"请勿手工编辑"标记）。

要求：**Node ≥ 13.14**；没有 npm install 步骤（零依赖）。

---

## 一点五、构建与发布（源码 → 生产代码）

> 仓库**只追踪源码**：`config/bundle.js`、`src/core/kui-all.js` 是构建产物，已在 `.gitignore` 中排除。
> 新克隆仓库后先 `npm run build`，再启动或部署。

### 1）源码与产物对照

| 类型 | 路径 | 入库 | 说明 |
| --- | --- | --- | --- |
| 源码 | `src/**`、`config/**`（除 `bundle.js`）、`pages/**`、`standalone/**`、`test/**`、`tools/**`、`docs/**` | ✅ | 手写代码与配置，改这里 |
| 产物 | `config/bundle.js` | ❌ | 把 `config/*.json` + `src/themes.json` 打包，供 `file://` / 不支持 fetch 的环境兜底 |
| 产物 | `src/core/kui-all.js` | ❌ | 单入口脚本，按 `config/kui-modules.json` 的模块清单拼装（文件头带"请勿手工编辑"） |

### 2）环境要求

- Node ≥ **13.14**（`test:node13` 用仓库内 `.tools/node-v13.14.0` 实测，与 Node 24 双版本一致通过）；
- **无 npm install**：零运行时依赖、零构建链，不需要 webpack/vite。

### 3）一键构建

```bash
git clone git@github.com:SuLiyue-s/KurumiUI.git && cd KurumiUI
npm run build        # = build:config + build-all（先产物 JSON，再产物 kui-all.js）
npm start            # 起本地服务（启动时也会自动构建；含端口探测）
```

> 若本机 **22 端口被拦**（公司网络 / 代理环境常见），可改走 GitHub 的 SSH 443：
> `git config core.sshCommand "ssh -o HostName=ssh.github.com -p 443"`。
> 远程地址仍是 `git@github.com:SuLiyue-s/KurumiUI.git`，之后 `git push` 照常使用。

分步等价命令：

```bash
node tools/build-config.js   # 1) config/app.json + config/text.json + src/themes.json + config/demos/*.json → config/bundle.js
node tools/build-all.js      # 2) 按 config/kui-modules.json 的 app(28) / standalone(27) 清单 → src/core/kui-all.js
```

### 4）开发模式与生产模式

- **开发**：`npm start` → `http://127.0.0.1:8080`。http 协议下 `config.js` 直接 `fetch` 原始 JSON，**改完刷新即生效**，不必重新打包；
  `?kui_debug=1` 打开诊断面板；页面脚本/资源用 `?kui_v=<版本>` 做缓存穿透。
- **生产**：先 `npm run build`，然后三选一：
  1. **静态托管**：整个目录（须含 `config/bundle.js`、`src/core/kui-all.js`）当静态站点发布，无需 Node；
  2. **内置服务**：`node server.js`（零依赖，默认 8080，`--port=9000` 可改，`--no-build` 跳过启动构建）；
  3. **离线分发**：构建后 `file://` 双击 `index.html` 即可运行（依赖 `config/bundle.js`）。

发布前建议全绿再提交：

```bash
npm test                       # 30 项单元/集成用例（自带 DOM stub，零依赖）
                               # 新克隆仓库没有 .tools/ 里的 Node13 时：29 通过 / 1 跳过（可选用例）
npm run verify                 # 冒烟 94 项 + 业务函数演示页 + 弹窗动作桥
npm run audit                  # 一致性审计 17 项 + 组件拆装审计 17 项
node tools/check-compat.js     # Node 13.14 语法/API 兼容扫描
node tools/check-assets.js     # HTML 引用 JS/CSS 齐全性
```

### 5）改东西的正确姿势

- **改文案 / 颜色 / 结构 / 控件**：只改 `config/*.json` 与 `src/themes.json`。
  使用 `file://` 或生产部署时需 `npm run build:config` 重新生成 `config/bundle.js`（`npm start` 会自动做）。
- **加一个框架 JS 模块**：在 `config/kui-modules.json` 的 `profiles.*.files` 里加一行，再 `npm run build:all`；
  **不要手改 `src/core/kui-all.js`**。
- **升级版本号**：`src/core/kui.js`（`KUI.version`）、`src/frame/kui-frame.js`、`src/core/dom-enhance.js`、`package.json`
  四处需一致，`npm run audit` 的 E1 会校验。
- **加业务页**：新建 `pages/xxx.html` 引 `src/frame/kui-frame.js`，再在 `config/app.json` 菜单项 `target.tab.url` 指向它，不碰框架代码。

### 6）常见坑

- 改 JSON 不生效 → 用 `file://` 打开却没重新 `npm run build:config`（或浏览器缓存，加 `?kui_v=xxx`）。
- 新克隆打开空白 → 忘了 `npm run build`（`src/core/kui-all.js` 不在仓库里）。
- 页面出现「未注册的元素类型」→ HTML 少引 `src/core/kui-all.js` 或 profile 选错，先跑 `node tools/check-assets.js`。

---

## 一点六、使用手册（`docs/manual/`）

面向使用者的完整手册：**16 个文件 / 15 章 / 约 37 万字**，与源码、运行时同版本（v1.3.6 基线），入口 [`docs/manual/README.md`](docs/manual/README.md)。

- 按 **5 条阅读路线**组织：第一次跑通 / 只改配置做界面 / 把组件搬进现有项目 / 扩展框架 / 部署与维护；
- 每章开头有「适用版本 + 前置章节 + 阅读时长」元信息，结尾有「本章自检 + 参考源码」，**章节可单独阅读、可单独执行**；
- 手册配套校验脚本（零依赖、Node 13.14 可跑）：

```bash
npm run check:manual        # = node tools/check-manual.js
node tools/check-manual.js --json --quiet   # CI 用 JSON 报告
```

校验内容：每章元信息与必备小节、所有 `json` 代码块可解析、示例里的节点 `type` / `action` / `scope.name`业务函数 / `KUI.x.y` API 在运行时真实存在、章节内链、以及 **40 注册类型 / 19 表单控件 / 28 动作 / 61 业务函数 / 6 主题** 的数量口径是否与运行时可枚举结果一致。

---

## 二、它长什么样 / 能做什么

打开首页即可看到：

| 区域 | 说明 |
| --- | --- |
| 左侧菜单 | 分组 + 二级菜单 + 徽标 + 折叠（252px ↔ 68px）+ 折叠后悬浮飞出 |
| 顶部导航 | 面包屑、后退/前进、刷新、全屏、折叠、搜索、提醒、设置、主题 |
| 子标签 + 主体区 | 每个标签一个 **iframe**；**切走再切回不重载、不丢未保存数据** |
| 弹窗 | 提醒 / 确认 / 输入 / 表单 / 自定义，**每个弹窗都是独立 iframe** |
| 提醒信息 | toast + notification，四类语义色 + 图标 + 进度条 |
| 主题 | 6 套：绯红刻刻帝（默认）、白羽灵装、星夜观测、樱雾通灵、深渊刻印、黎明绯光 |

演示页面（都在菜单里）：

- `pages/home.html` 总览 · 刻刻帝终端
- `pages/profile.html` **未保存数据验证**（改表单 → 切标签 → 切回来数据还在）
- `pages/form.html` 灵装表单（**JSON 驱动的动态显隐/联动/校验**）
- `pages/editor.html` 文本编辑结界（textarea + 键盘快捷键 + 脏数据关闭确认）
- `pages/dialogs.html` 弹窗剧场（5 类弹窗 + 嵌套弹窗 + 返回值）
- `pages/notify.html` 提醒讯号（toast/notification 全姿势）
- `pages/theme.html` 主题灵装（6 套主题即时切换 + token 预览）

独立渲染（验收"每个组件都能单独拿出来用"）：

`standalone/menu.html`、`menunav.html`、`tabs.html`、`dialog.html`、`toast.html`、`form.html`、`controls.html`、`theme.html`、`no-shell.html`

---

## 三、这框架怎么分层

```
配置文件(JSON)  →  渲染代码(只负责渲染)  →  组件
config/app.json     src/core/*             menu / menunav / tabs / dialog / toast
config/text.json    src/components/*       controls/* / form
src/themes.json                            app-shell（可选）
```

- **配置文件**管：文案、颜色、哪个位置用什么控件、控件属性、显隐联动关系、动作绑定。
- **渲染代码**管：怎么把配置变成一个能用的控件/组件，**不含任何业务文案与色值**。
- 详细设计见 [`docs/01-architecture.md`](./docs/01-architecture.md)；
  配置字段手册见 [`docs/06-config-guide.md`](./docs/06-config-guide.md)；
  业务函数（JSON 只存函数名）见 [`docs/09-handlers.md`](./docs/09-handlers.md)；
  协作与验收契约见 [`docs/00-contract.md`](./docs/00-contract.md)。

---

## 四、配置驱动的三个层次

### 1）结构：`config/app.json`

```jsonc
{
  "layout": { "gap": 10, "menu": { "width": 252, "collapsedWidth": 68 }, "header": { "height": 56 } },
  "menu": { "type": "menu", "props": { "brand": {...}, "items": [
      { "type": "group", "id": "g-core", "label": "时间中枢", "icon": "clock", "children": [
        { "type": "item", "id": "home", "label": "总览", "icon": "home",
          "target": { "tab": { "id": "home", "title": "总览", "url": "pages/home.html", "pinned": true } } }
      ]}
  ]}},
  "tabs":    { "type": "tabs", "props": { "initial": [ ... ], "keepAlive": true } },
  "menunav": { "type": "menunav", "props": { "actions": [ { "icon": "search", "action": "search.toggle" } ] } }
}
```

改菜单 → 只改 `menu.props.items`；加一个顶部按钮 → 只往 `menunav.props.actions` 里塞一项；
换启动标签 → 改 `tabs.props.initial`。

### 2）文案：`config/text.json`

```json
{ "shell": { "searchPlaceholder": "检索时间线…" }, "form": { "submit": "提交灵装" } }
```

代码里统一 `KUI.text('shell.searchPlaceholder', '默认文案')`，**配置里没有就用默认值**，不会出现"改文案要改代码"。

### 3）外观：`src/themes.json`

```json
{
  "default": "kurumi",
  "themes": [
    { "id": "kurumi", "name": "绯红刻刻帝", "scheme": "dark",
      "tokens": { "accent": "#c8102e", "bg-0": "#08050a", "accent-2": "#d4af37" },
      "art": { "layers": [ { "kind": "clock", "opacity": 0.12 }, { "kind": "glow", "x": "80%", "y": "10%" } ] } }
  ]
}
```

- token 覆盖 `base.css` 的 CSS 变量（`accent` → `--kui-accent`）；
- 主题**不允许**写专属选择器改结构，只换 token + 装饰层，所以新增主题零代码；
- 尺寸/字体/动效 token 不随主题变，切换不会跳版。

---

## 五、组件都能单独用

每个组件都注册在 `KUI.registry` 里，统一形态：

```js
var inst = KUI.menu.create(hostEl, { items: [...] }, ctx);   // 创建
inst.on('select', function (payload) { ... });
inst.destroy();                                             // 销毁
```

不引 `app-shell` 也能用；没有加载的兄弟组件会优雅降级（显示占位，不抛错）。
`standalone/` 下每个 HTML 只引自己需要的脚本，就是"拆开来用"的证明。

### 常用 API 速查

```js
/* 菜单 */
KUI.menu.create(host, props, ctx)      // setActive/setCollapsed/setBadge/setItems…
/* 菜单导航 */
KUI.menunav.create(host, props, ctx)   // setBreadcrumb/setBackForward/setActions…
/* 标签 + 主体 iframe */
var tabs = KUI.tabs.create(host, props, ctx);
tabs.open({ id:'a', title:'A', url:'pages/a.html' });
tabs.activate('a'); tabs.close('a'); tabs.refresh('a');
/* 弹窗（每个都是一个 iframe） */
KUI.dialog.alert({ title:'提示', message:'…' });
KUI.dialog.confirm({ title:'确认', message:'…' }).then(ok => {});
KUI.dialog.prompt({ title:'重命名', label:'名称' }).then(v => {});
KUI.dialog.form({ title:'设置', nodes:[...], data:{} }).then(data => {});
/* 提醒 */
KUI.toast.success('已保存');  KUI.toast.error('失败', { duration: 6000 });
KUI.toast.notification({ title:'后台任务完成', message:'…' });
/* 表单 */
var form = KUI.form.create(host, { nodes: [...], data: {...}, layout: {...} });
form.getData(); form.setValue('a', 1); form.validate();
/* 主题 */
KUI.theme.apply('starry');  KUI.theme.next();  KUI.theme.ids();
/* 动作分发：JSON 里写 { "action": "theme.picker" } */
KUI.actions.run({ action:'theme.picker' }, ctx);
```

### 业务函数层（JSON 不能写函数？）

配置 JSON 是纯数据，存不了函数。KurumiUI 的做法是**每个框架组件配一个独立的业务函数文件**，
JSON 里只写「函数名 + 入参」，实现放在 `src/components/handlers/*.handlers.js`：

```json
{ "type": "button", "props": { "text": "保存成功" },
  "on": { "click": { "fn": "toast.success", "args": { "text": "已保存" } } } }
```

> `on` 是节点级字段（与 `type` / `props` 平级），别写进 `props`。

```json
{ "on": { "click": { "actions": [
  { "fn": "app.setTheme", "args": { "id": "sakura", "silent": true } },
  { "action": "dialog.close", "params": { "id": "theme-picker" } }
] } } }
```

（上面这段 `on` 片段粘到任意节点的 `type`/`props` 同级即可。）

| 文件 | scope | JSON 里可写 |
| --- | --- | --- |
| `handlers/menu.handlers.js` | `menu` | `menu.toggleCollapse` `menu.select` `menu.setBadge` `menu.cycleActive` … |
| `handlers/menunav.handlers.js` | `menunav` | `menunav.refresh` `menunav.fullscreen` `menunav.back` `menunav.setTitle` … |
| `handlers/tabs.handlers.js` | `tabs` | `tabs.open` `tabs.activateNext` `tabs.closeActive` `tabs.refreshActive` … |
| `handlers/dialog.handlers.js` | `dialog` | `dialog.alert/confirm/prompt/form/custom/close/closeAll` |
| `handlers/toast.handlers.js` | `toast` | `toast.show/success/error/warning/info/demo/clear` |
| `handlers/app-shell.handlers.js` | `app` | `app.setTheme` `app.randomTheme` `app.pickTheme` `app.toggleMenu` `app.openTab` … |
| `handlers/form.handlers.js` | `form` | `form.reset/validate/getData/setData/setVisible/…` |

- 也支持字符串简写 `"on": { "click": "toast.info" }`，以及 `{ "action": "handlers.run", "params": { "fn": "...", "args": {} } }`；
- 函数签名 `(ctx, args, info)`，可同步可 `Promise`，未注册/异常只 `warnOnce` 不崩页面；
- 弹窗（独立 iframe）里的节点级动作会自动经 `dialog:action` 转发父页执行，所以弹窗 JSON 也能直接写 `app.applyTheme`；
- 纯 JSON 演示：`config/demos/handlers.json` + `standalone/handlers.html`（主应用菜单「观测回廊 → JSON 业务函数」）；
- 完整说明见 [`docs/09-handlers.md`](./docs/09-handlers.md)。

---


## 五点五、悬浮提示（v1.0.5，JSON 可配）

框架自带 `KUI.tooltip`：全站 `title` / `data-kui-tip` 都会被接管，换成主题化浮层（玻璃底 + 主题色描边 + 箭头）。**不需要写任何 CSS**，外观跟随 `src/themes.json` 的 token，手感由 `config/app.json` 调整：

```json
"ui": {
  "tooltip": { "enabled": true, "delay": 140, "hideDelay": 60, "offset": 10, "maxWidth": 340, "placement": "top" }
}
```

- 文案就写在元素上：`<button title="刷新当前页面">` 或 `<button data-kui-tip="刷新当前页面">`；
- 单元素覆盖：`data-kui-tip-placement="bottom"` / `data-kui-tip-delay="240"` / `data-kui-tip-max-width="360"`；
- 保留浏览器原生提示：`data-kui-tip-disabled="true"`；
- JS 主动显示：`KUI.tooltip.show(el, "文字", { placement: "bottom" })`。

主应用、7 个 `pages/*.html`、10 个 `standalone/*.html`、弹窗 iframe 全部已接入；弹窗内的提示同样主题化。

### 表单必填（v1.3.0 起）

- 单字段：`"required": true`（星号只在必填时显示）。
- 多填一：`"requiredAny": ["a", "b"]` + 可选 `"requiredAnyMessage"`。
- 单选/复选/开关同样支持 `required`；`switch` 的 `false` 视为未填。
- 被联动隐藏的字段不参与必填校验。
- 弹层（下拉/多选/标签右键菜单）在点击外部、父级 UI、窗口失焦时自动关闭。

## 六、控件清单与"易忽略细节"

控件全部走同一套 token 与同一套装饰材质（内联 SVG symbol / `mask+currentColor`），所以：

| 容易做花的细节 | 本项目做法 |
| --- | --- |
| 数字框的 +/− 箭头 | 统一 SVG 三角，颜色 `--kui-control-arrow-color`，hover/disabled 与整体状态机同步 |
| 下拉选择弹层 | 统一 `control-base` 的 popup：同描边、同阴影、同动效、同关闭逻辑（Esc/外点/滚动） |
| 多选下拉 | 同上 + 选项勾选态用同一对勾图标，已选区用同一套 tag 样式 |
| textarea 右下角角标 | 统一"可缩放"角标（与滚动条同色系），禁用态不显示 |
| 日期面板 | 面板/表头/单元格/今天/选中/范围态全部 token 化，箭头与月份切换同材质 |
| 时/分/秒选择 | 三列滚轮共用同一套列样式与上下箭头，选中列高亮用 `--kui-accent-soft` |
| 全局滚动条 | `base.css` 用 `--kui-scrollbar-*` 统一 8px 细滚动条（含 WebKit 与 Firefox） |
| 其余 | 光标、focus ring、禁用/只读/错误态、空态、加载态、徽标、开关圆点、滑块导轨、评分星、颜色块…全部 token 化 |

控件类型（注册表共 **40 个类型**，实时可查 `KUI.registry.list()`）：

- 表单控件（19）：`input` `password` `textarea` `number` `select` `multiselect` `checkbox` `checkbox-group` `radio` `radio-group` `switch` `slider` `rating` `color` `date` `daterange` `time` `datetime` `month`
- 动作/展示（6）：`button` `link` `tag` `badge` `icon` `text`
- 反馈/数据（5）：`progress` `alert` `table` `pagination` `upload`
- 布局与容器（4）：`divider` `field` `form` `app-shell`
- 框架组件（5）：`menu` `menunav` `tabs` `dialog` `toast`

---

## 七、表单联动（配置即逻辑）

```jsonc
{
  "id": "notifyType", "type": "select", "label": "通知方式",
  "options": [ { "label": "邮件", "value": "mail" }, { "label": "短信", "value": "sms" } ]
},
{
  "id": "mailAddress", "type": "input", "label": "邮箱",
  "deps": [
    { "when": { "field": "notifyType", "op": "eq", "value": "mail" },
      "then": { "visible": true, "required": true } }
  ]
}
```

- 一个元素可被**多个**元素控制（`deps` 是数组，按顺序应用）；
- 支持 `{ all: [...] }` / `{ any: [...] }` 组合条件；
- 可控制：`visible` `disabled` `readonly` `required` `value` `options` `text` `error`；
- 运算符：`eq` `ne` `in` `nin` `contains` `notContains` `gt` `gte` `lt` `lte` `empty` `notEmpty` `truthy` `falsy` `regex`；
- 全部写在 JSON 里，渲染代码不知道"谁控制谁"。

---

## 八、iframe 保活（最硬的需求）

- 每个标签 = 一个 `pane` + 一个 `iframe`，**创建一次，永不重建**；
- 切换标签只改 `hidden` 与 `.is-active`，**不改 `src`、不 remove、不重载**；
- 首次点亮才赋 `src`；
- 关闭标签前可 `tab:before-close` 询问业务页是否有未保存数据（`pages/profile.html`、`pages/editor.html` 有演示）；
- 只有**用户主动点刷新**才会重设 `src`（按钮在顶部导航）。

业务页里只需引 `src/frame/kui-frame.js`，即可获得：

```js
KUI.frame.ready({ title: '页面标题' });
KUI.frame.setDirty(true);                 // 有未保存数据 → 关闭时弹确认
KUI.frame.toast('已保存');
KUI.frame.dialog.confirm({ message: '确定删除？' }).then(ok => {});
KUI.frame.onTheme(function (theme) { /* 主题切换回调 */ });
```

弹窗同样：每个弹窗一个 `<iframe src="src/frame/dialog-frame.html">`，父子 postMessage 通信，
弹窗内还能反向调用父级动作（例如打开主题选择器）。

---

### 菜单搜索（v1.3.6 起）

顶部导航「搜索」按钮（动作 `search.toggle`）支持模糊搜索菜单：

- **0 个结果** → 提醒未找到；
- **1 个结果** → 直接打开（保留快捷体验）；
- **多个结果** → 弹出「选择要打开的菜单」候选列表：按 6 档评分排序（精确 > 前缀 > 包含 > 子序列），每项显示 `父分组 / 子分组 / 菜单名` 全路径，最多列 10 项，超出会提示剩余数量；**点哪项开哪项**。

也可编程调用：

```js
KUI.search.menu("表单");              // → [{ id, label, path, score, tab, ... }]
KUI.search.open("form-lab");          // 按 id 打开指定菜单
KUI.search.picker("表单", matches);   // 弹出候选列表
```

冒烟分节执行（缩短反馈时间）：

```bash
node tools/smoke.js --only=list        # 列出 23 个分节
node tools/smoke.js --only=26          # 只跑「菜单搜索」断言（其余分节仍完成初始化）
```

## 九、测试与兼容

```bash
npm test                 # 当前 Node 跑全套（compat/config/server/render）
npm run test:node13      # 用仓库内 Node 13.14 跑同一套（真实兼容性验证）
npm run verify           # 冒烟 + 两个运行时装配验证（业务函数演示页 / 弹窗动作桥）
node tools/check-compat.js    # 只跑语法/API 兼容扫描（中文报告）
node tools/check-assets.js    # 检查 HTML 里引用的 JS/CSS 是否齐全
node tools/check-manual.js    # 校验 docs/manual 手册与运行时一致（= npm run check:manual）
```

- 零依赖测试：自带极简 DOM stub（`test/dom-stub.js`），不装 jsdom；
- 兼容扫描黑名单：`?.` `??` `||=` `&&=` `??=` `#private` `replaceAll` `Array.at` `Object.fromEntries` `structuredClone` 顶层 await 等；
- **Node 13.14 实测全绿**：`node test/run.js` 双版本各 **30 通过 / 0 失败 / 0 跳过**；集成冒烟 `tools/smoke.js` **94 / 0**（含 v1.0.1 的 pages 装配 / 主题双向同步 / 多级菜单回归，v1.0.2 的业务函数层与弹窗动作桥，v1.0.3 的图标 sprite 回归，v1.0.4 的版本戳/版本自愈，v1.0.5 的悬浮提示/UI 配置，v1.0.7 的主题预置防闪烁与实心按钮悬浮配色，v1.0.8 的原生控件升级器，v1.0.9 的单入口 kui-all，v1.1.0 的弹窗加固与诊断面板，v1.1.1 的消息乒乓防护，v1.1.2 的 form footer 与必填校验回归，v1.1.3 的菜单折叠联动整壳，v1.1.4 的弹窗表单必填校验归一化，v1.1.5 的模块级全局事件兼容层 / 菜单折叠按钮联动，v1.3.0 的必填组与弹层关闭，v1.3.1 的头像框裁切与更换方式，v1.3.3 的菜单 footer 两行布局，v1.3.4 的悬浮提示文案实时同步，v1.3.6 的菜单搜索多结果选择）；`tools/verify-handlers-demo.js` 真实渲染并点击 JSON 按钮出提醒；`tools/verify-dialog-bridge.js` 验证弹窗动作转发；资源检查 `tools/check-assets.js` **20 HTML / 0 错误 0 警告**；全页面审计 `tools/audit-all-pages.js` **18 / 18**。v1.3.5 起新增审计脚本（v1.3.6 补全控件类型清单项）：`tools/audit-consistency.js`（源码↔测试↔产物一致性，17 项）与 `tools/audit-components.js`（组件拆解/组装矩阵，17 项），可用 `npm run audit` 一键复跑；审计报告见 [`docs/10-audit-report.md`](docs/10-audit-report.md)。
- v1.0.3 修复的 8 个浏览器验收问题与逐条根因见 [`CHANGELOG.md`](CHANGELOG.md#v103--2026-10-26) 与 [`docs/08-acceptance.md`](docs/08-acceptance.md#6-版本修复记录)；v1.0.4 的版本缓存穿透加固见 [`CHANGELOG.md`](CHANGELOG.md#v104--2026-10-26)；v1.0.5–v1.1.2 的悬浮提示 / 弹窗修复 / 主题预置 / 原生控件升级 / 单入口 / 诊断面板见 [`CHANGELOG.md`](CHANGELOG.md)。
- 沙箱/CI 里若禁止子进程，server 用例会自动降级为同进程模式（打印 WARN），断言不变；请在自己的终端各跑一次 Node13 / Node24 以消除 WARN。
- 详细测试矩阵与验收对照见 [`docs/test-report.md`](docs/test-report.md) 与 [`docs/08-acceptance.md`](docs/08-acceptance.md)。

---

## 十、目录结构

```
config/          app.json text.json demos/（bundle.js 为构建产物）
src/core/        kui icons registry config theme theme-boot theme-art handlers tooltip dom-enhance avatar
src/components/  menu menunav tabs dialog toast app-shell form
                 controls/（index control-base inputs selects choices pickers misc）
                 handlers/（menu/menunav/tabs/dialog/toast/app-shell/form 业务函数）
src/styles/      base.css controls.css components.css tooltip.css avatar.css themes/
src/frame/       kui-frame.js  dialog-frame.html/.js
src/app/         bootstrap.js
pages/           业务页示例（iframe 内页面）
standalone/      组件独立渲染示例
test/ docs/ tools/（build-*.js smoke.js verify-*.js check-*.js audit-*.js screenshot.js）
                 docs/manual/（使用手册：README + 15 章，check-manual.js 校验）
                 config/bundle.js、src/core/kui-all.js 为构建产物（不入库）；.tools/ 为本机开发脚本（不入库）
```

---

## 十一、扩展指南

**加一个控件**：在 `src/components/controls/` 里 `KUI.registry.register('mytype', { render, api })`，
样式写在 `controls.css` 且只用 token → JSON 里就能用 `{ "type": "mytype" }`。

**加一个主题**：往 `src/themes.json` 的 `themes[]` 里加一项（id/name/tokens/art），无需改代码。

**加一个动作**：`KUI.actions.register('my.action', function (ctx, params, ev) { ... })`，
JSON 里 `{ "on": { "click": { "action": "my.action", "params": {...} } } }` 即可绑定。

**加一个业务函数**（JSON 只存函数名）：新建 `src/components/handlers/<scope>.handlers.js`，
`KUI.handlers.registerMany('<scope>', { fnName: function (ctx, args) { ... } })`，再在页面里引这个脚本；
JSON 里 `{ "on": { "click": { "fn": "<scope>.fnName", "args": {...} } } }` 即可。详见 [`docs/09-handlers.md`](./docs/09-handlers.md)。

**加一个业务页**：新建 `pages/xxx.html` 引 `src/frame/kui-frame.js`，然后在 `config/app.json`
的菜单项 `target.tab.url` 指向它。全程不碰框架代码。

---

## 十二、许可

MIT。主题名与灵感来自《Date A Live》时崎狂三，仅作风格致敬，不含任何官方素材；
所有图标、纹样、装饰层均由 SVG/CSS 现场绘制，无外部图片与在线字体。


### 单一入口（v1.0.9 起）

页面不再逐条引入框架脚本，只需一行：

```html
<script src="../src/core/kui-all.js" data-kui-profile="standalone"></script>
```

| 文件 | 作用 |
| --- | --- |
| `config/kui-modules.json` | 模块清单（`profiles.app` 28 个 / `profiles.standalone` 27 个），**加模块只改这里** |
| `tools/build-all.js` | 由清单生成 `src/core/kui-all.js`，`npm run build:config` 自动执行 |
| `src/core/kui-all.js` | 构建产物（浏览器 `document.write` 同步注入；Node 侧 `module.exports` 供测试/审计共用） |
## 诊断面板（v1.1.0 起）

遇到「弹窗按钮没反应 / 输入卡顿 / 主题没跟着换」这类只在特定浏览器出现的问题，
在地址后面加 `?kui_debug=1` 打开现场诊断面板：

```
http://127.0.0.1:8080/?kui_debug=1
# 也可以：localStorage.setItem('kui-debug', '1') 后刷新
```

面板会实时记录：版本 / UA / 视口、JS 异常与未捕获 Promise、longtask（>50ms 主线程卡顿）、
焦点事件、输入事件耗时、`dialog:` / `theme:` / `frame:` 消息链路。
复现问题后点面板上的「复制」，把整段文本贴回来即可定位。

> 未加参数时该模块零开销，不影响正常使用。源码：`src/core/diag.js`。

### 头像与刻刻帝齿轮框（v1.2.0 起）

配置 JSON 就能改头像，`editable` 决定渲染后能不能点头像更换；一旦设置了头像，边框会自动绘制「刻刻帝时间齿轮」头像框，**齿轮颜色全部来自主题 token**，换主题时头像框跟着变色，头像图片本身不变。

```jsonc
// config/app.json 顶层
{
  "avatar": {
    "url": "data:image/svg+xml;…",   // 留空用品牌图标
    "editable": true,                 // 渲染后能否点头像更换
    "persist": true,                  // 记住用户选择（localStorage）
    "size": 42,
    "frame": { "enabled": true, "style": "clock-gear", "showTicks": true, "showHands": true, "animated": true },
    "picker": { "title": "更换头像", "allowClear": true }
  }
}
```

- 也可写在 `menu.props.brand.avatar`，或作为控件：`{ "type": "avatar", "props": { "url": "…", "frame": { "enabled": true } } }`。
- JS 侧：`KUI.avatar.create(host, opts)`、`KUI.avatar.mount(host, node)`；`app.setAvatar(url)` / `app.openAvatarPicker()`。
- 独立测试页：**`standalone/avatar.html`**（菜单「观测回廊 → 头像与齿轮框」可直接打开）——里面有交互测试台、15 个 JSON 示例和字段表；点「读取齿轮框颜色」可验证主题联动。

> 头像样式在 `src/styles/avatar.css`，由 `base.css` 顶部 `@import` 引入，新增样式不需要动任何 HTML。


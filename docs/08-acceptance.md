# 08 · 验收报告（需求逐条对照）

> 本文把最初需求（9 条功能要求 + 6 条特殊要求）逐条对到**实现文件**、**自动验证**、**人工验证**三列，供验收时逐项打勾。
> 契约基线：[`docs/00-contract.md`](./00-contract.md)；架构说明：[`docs/01-architecture.md`](./01-architecture.md)。


### v1.4.4（选中行悬停叠色随主题）

| 验收项 | 方式 | 结果 |
| --- | --- | --- |
| 选中行悬停叠色不再写死 accent | `smoke [32.10]` 断言 `--kui-dt-hover-selected: var(--kui-accent-soft` 且 `rgba(226` 不存在 | 通过 |
| 切换主题后叠色变化 | 真实浏览器像素采样：kurumi 选中悬停 R=116 G=39 B=56（红主导）；starry 选中悬停 R=85 G=98 B=138（蓝主导）；页内主题下拉可直接切换 | 通过 |
| 普通行悬停仍可辨识 | 像素采样：未选中行悬停较条纹提亮 | 通过 |
| 无样式/接线回归 | test 37/0/0、smoke 125/0、check-assets、audit 系列、verify-build、两份手册校验 | 全绿 |

## 0. 怎么跑起来

```bash
# 方式 A：HTTP 服务（推荐，配置可热改）
npm start                  # 零依赖静态服务器，默认 http://127.0.0.1:8080
# 或
node server.js --port 8081

# 方式 B：直接双击 index.html（file://）
#   不依赖 fetch：配置从 config/bundle.js 读取（npm start / npm run build:config 生成）

# 配置改了要重新打包 bundle：
npm run build:config
```

> `config/bundle.js` 是**构建产物**（已 gitignore）。`npm start` 启动时会自动重新打包。

## 1. 功能要求 9 条

| # | 要求 | 实现位置 | 自动验证 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 科技未来 + 动漫（时崎狂三）风，**非赛博**；多套风格可选 | `src/styles/base.css`（设计基线）、`src/themes.json`（6 套）、`src/core/theme-art.js`（11 种装饰层）、`docs/07-style-choices.md` | 主题完整性自检（6 套 × 60 token）、切主题冒烟 | ✅ |
| 2 | 含菜单、菜单导航、弹窗、提醒、子标签、主体 iframe | `src/components/{menu,menunav,dialog,toast,tabs}.js`、`src/components/app-shell.js` | 冒烟 [2][3][4] | ✅ |
| 3 | 菜单栏在页面左侧 | `app-shell.js` 的 CSS Grid（`.kui-app__left`），`base.css` `.kui-app` 网格 | 冒烟 [2] DOM 骨架 | ✅ |
| 4 | 主体在子标签 iframe；未点亮且未关时**只隐藏不重建**，切换不丢未保存数据 | `src/components/tabs.js`（每个 tab 固定 pane+iframe，首次激活才赋 `src`；切换只切 `.is-active`/`hidden`；禁止 remove/重建/改 src） | 冒烟 [3]：3 次切换后 **iframe 引用一致**、**src 只设置一次**；`test/render.test.js` | ✅ |
| 5 | 每个弹窗也是 iframe | `src/components/dialog.js` + `src/frame/dialog-frame.html/js`（每个弹窗实例独立 iframe，栈式 z-index，Promise API） | 冒烟 [4]：`dialog.open` → iframe `src/frame/dialog-frame.html` | ✅ |
| 6 | 每个组件可独立渲染、可自由拆解组装 | `KUI.registry` + `KUI.renderNode/mount`；9 个 `standalone/*.html` 只引自身所需资源；`app-shell` 子组件缺失时降级占位 | `tools/check-assets.js`、`test/render.test.js`、standalone 页面手开 | ✅ |
| 7 | 配置 JSON + 渲染代码：文案、颜色、控件位置与属性全在 JSON | `config/app.json`（结构/菜单/布局/动作）、`config/text.json`（文案）、`src/themes.json`（颜色）、`config/demos/*.json`（示例） | `test/config.test.js`、`npm run build:config` | ✅ |
| 8 | 所有元素控件风格一致（数字框箭头、下拉/多选弹层、textarea 角标、日历、时分秒、滚动条…） | `src/styles/controls.css`（4350 行，统一 token 材质，全部 `var(--kui-*)`）+ `src/components/controls/*.js`（注册表 39 个类型：19 个表单控件 + 20 个布局/动作/展示/数据/框架组件） | `test/render.test.js` 注册表全量、人工核对清单 | ✅ |
| 9 | 表单控件显隐/状态可依**同表单其他控件值**动态控制，控制关系由 JSON 决定 | `src/components/form.js` 联动引擎 + `node.deps` JSON；契约 §7 | 冒烟 [5]「form.create 渲染 + 联动求值 联动正常」 | ✅ |

## 2. 特殊要求 6 条

| # | 要求 | 落实方式 | 状态 |
| --- | --- | --- | --- |
| 1 | 先做整个框架，再做主体风格；风格可自定义切换，默认狂三风 | 框架（core/components/app-shell）与视觉（tokens+art）彻底分离；`theme.default` 默认 `kurumi`；切换入口 3 处 + `?kuiTheme=` URL + `KUI.theme.apply()` | ✅ |
| 2 | 框架可自由拆解、组装 | 所有组件统一 `KUI.<x>.create(host, props, ctx)` 且互不假设对方存在；`app-shell` 可只挂其中几个；9 个 standalone 页演示"只拿一部分也正常" | ✅ |
| 3 | 调 UI 内容只改 JSON，不改代码 | 文案=`text.json`/`app.text`；颜色=`themes.json` token；控件/位置/属性=`app.json` 的 `nodes`；菜单=`app.json.menu.props.items`；表单联动=`deps`；新增主题=加一个 JSON 对象 | ✅ |
| 4 | 可用现有 UI 组件库，但只用其中的元素控件 | **本项目选择零依赖自研控件**（理由：Node13 兼容、离线可跑、风格必须 100% 统一、避免库的全局样式污染）。同时保留接入协议：任何第三方控件只要包成 `KUI.registry.register(type, {render, api})` 适配器即可无缝使用（见 `docs/06-customization.md`） | ✅（允许而非必须） |
| 5 | Node.js 的 JavaScript 语言 | 服务端/工具链 CommonJS（`require`），浏览器端传统 `<script>`（非 ESM、无构建） | ✅ |
| 6 | 兼容 Node 13.14 | 全部代码禁用 `?.`、`??`、`||=`、`?.()`、`String.replaceAll`、`Array.at`、`Object.fromEntries`、`structuredClone`、私有字段 `#x`、顶层 `await`；`test/compat.test.js` 全项目扫描 + 真实 `node-v13.14.0` 跑全部测试 | ✅ |

## 3. 自动验证

```bash
# 双版本跑全部测试
npm test                                  # 当前 Node（24）
npm run test:node13                       # 真实 Node 13.14.0（.tools/node-v13.14.0-win-x64/node.exe）

# 分项
node test/run.js                          # 兼容 + 配置 + 服务端 + 渲染
node tools/smoke.js                       # 集成冒烟（dom-stub 驱动，真脚本顺序）
node tools/check-assets.js                # HTML 引用完整性
```

最近一次结果（**Node 13.14 与 Node 24 双版本**各跑一次，结果一致）：

| 套件 | 结果 | 说明 |
| --- | --- | --- |
| compat（语法/禁用 API/ESM 扫描） | **7 / 7 PASS** | 全项目 36 JS + 18 HTML 内联脚本 + 13 JSON 均过，0 违规 |
| config（配置 schema/引用/图标名） | **4 / 4 PASS** | 12 个 JSON 全部可解析，节点类型/图标名合法 |
| server（HTTP/安全/MIME/全量文件） | **11 / 11 PASS** | 400/403/404/405/HEAD/全量 47 文件字节一致/目录穿越拦截 |
| render（组件/iframe 保活/联动/主题） | **8 / 8 PASS** | dom-stub 级：保活、弹窗 iframe、toast、主题清理、deps 联动 |
| **合计 `node test/run.js`** | **30 通过 / 0 失败 / 0 跳过** | Node13.14 实测 4797ms，Node24 1759ms |
| 集成冒烟 `tools/smoke.js` | **94 通过 / 0 失败** | 真脚本顺序加载：boot、菜单 20 项、3 标签保活、弹窗 iframe、6 主题、39 注册类型、form 联动、零 console.error；[5] 段含 v1.0.3 图标断言（sprite+symbol+href 可解析），[7] 段为 v1.0.1 回归（pages 必引 registry / 多级菜单展开 / 主题子→父通道），[8] 段为 v1.0.2 业务函数层（61 个 handlers、JSON `fn` 写法可执行、演示 JSON 全部函数已注册、动作桥就绪），[9] 段为 v1.0.4 版本自愈，[10] 段为 v1.0.5 悬浮提示/顶部留白/主题弹窗，[11] 段为 v1.0.7 主题预置防闪烁 + 实心按钮悬浮配色 |
| 资源完整性 `tools/check-assets.js` | **19 个 HTML，0 错误 0 警告** | 无外链、无重复、无缺失、无 ESM |

> 详细数字与覆盖率说明见 [`docs/test-report.md`](./test-report.md)（test 队友产出）。

## 4. 人工核对（浏览器）

建议 10 分钟走完：

1. `npm start` → 打开 `http://127.0.0.1:8080/`；
2. **左侧菜单**：点分组展开、点菜单项开标签、折叠按钮（252 ↔ 68px）、底部主题按钮；
3. **顶部导航**：面包屑随菜单变化、刷新/全屏/前进后退按钮；
4. **标签保活（核心验收点）**：打开 `未保存数据验证` 页（菜单 → 时间中枢 → 未保存数据验证）→ 改几个字段（不要保存）→ 切到别的标签再切回 → 字段值仍在、日志出现 `tab:activate`；再改一次后直接关闭该标签 → 应弹"未保存数据"确认；
5. **弹窗即 iframe**：顶部搜索按钮（输入框弹窗）、通知按钮（提醒）、设置按钮（表单弹窗）、主题按钮（卡片弹窗）——每个都是独立 iframe；打开多个弹窗可叠加，Esc 关闭；
6. **提醒**：四类语义色 toast 轮播 + 角落 notification；
7. **控件一致性**：打开 `完整控件` 页，逐个点数字框箭头、下拉、多选、日期、时间（时分秒三列）、颜色、滑块、评分、开关、textarea 右下角角标、各类滚动条——确认材质/描边/发光/箭头全部同一套；
8. **表单联动**：打开 `表单` 页，切换"账号类型/通知方式"等触发字段，观察被控制字段的显隐/必填/选项/文案变化（全部来自 JSON）；
9. **风格切换**：切 6 套主题（顶部主题按钮 / `?kuiTheme=starry` 等），确认无残留旧色、控件不跳动、亮色主题文字对比度足够；
10. **独立渲染**：直接打开 `standalone/menu.html`、`standalone/dialog.html`、`standalone/no-shell.html` 等，确认脱离主框架单独可用。

## 5. 已知限制（如实说明）

1. **沙箱环境禁止浏览器子进程**，因此本仓库 CI 级验证为「dom-stub 渲染级 + 静态资源级」，**像素级视觉**需在用户本机浏览器确认（`docs/04-theme.md` §8.1 给了 6 套主题的逐项核对步骤）；
2. `file://` 直开时依赖 `config/bundle.js`（构建产物），若删除了它请先 `npm run build:config`；HTTP 方式则永远读原始 JSON，无需打包；
3. 弹窗 iframe 的 `postMessage` 使用 `targetOrigin: '*'`（本地静态页面无固定 origin），已用 `event.source` 严格校验来源，生产部署到固定域名时建议改为具体 origin（`docs/05-messaging.md` 有说明）；
4. 控件样式为自研，未引入第三方 UI 库；如需接入 Element/Ant 等"只用其元素控件"，按其 API 写 `registry.register` 适配器即可，框架层无需改动。


### v1.0.9

| 用户反馈 | 根因 | 修复 | 验证 |
| --- | --- | --- | --- |
| 弹窗按钮点击无反应 / 输入卡死 | 底部按钮动作在 iframe 侧未落地；高度上报过于频繁 | `dialog:clicked` 可见反馈 + 高度上报节流去抖 + 遮罩性能优化 | 真机 REA 探针：点击→toast、输入无卡顿 |
| 内容区上方多出空白行 | `.kui-app` grid 把 header 排到第 2 行 | 改为单行 `"left main"` 网格，header 回到第 1 行 | 布局探针：header y=0，空白带消失 |
| 改 UI 必须动 HTML | 每页手写 15~25 个框架 `<script>` | 收敛为单一入口 `kui-all.js`（清单由 JSON 驱动） | 冒烟 [12] + 真机四页 console 干净 |
## 6. 版本修复记录

### v1.0.1（2026-10-25，首次浏览器验收反馈）

| 反馈 | 根因 | 修复 | 回归 |
| --- | --- | --- | --- |
| `pages/*.html` 控件全显示「未注册的元素类型」 | 页面漏引 `src/core/registry.js`；且子目录页面的相对配置路径被解析到 `/pages/config/...` | 7 个 pages 补 `registry.js`；`config.js` 增加站点根前缀探测 `BASE` + `config.resolveUrl()` | smoke [7]：7 个页面必须含 registry；`config.resolveUrl` 可用 |
| 标签 iframe 内切主题，左侧菜单/顶栏不跟随 | 主题只有父→子广播，缺子→父通道 | `kui-frame.js` 增 `KUI.frame.setTheme()/requestTheme()`；`tabs.js` 处理 `frame:theme` 后由 `KUI.theme` 广播全部 iframe；`standalone/theme.html`、`pages/theme.html` 的切换入口全部转发；9 个 `standalone/*.html` 统一补引 `kui-frame.js` 以接收父→子换肤 | smoke [7]：`frame:theme` 四端齐备 + standalone 全覆盖 + **运行时**模拟 iframe 请求 `sakura` 后父级真实切换 |
| 多级菜单点击父项无法展开 | JS 已加 `is-open`，`components.css` 缺展开/收起规则 | 补默认收起 + `.is-open` 展开 + 展开动画 + 三级缩进 + reduced-motion 降级（箭头沿用原 `rotate(90deg)`） | smoke [7]：`is-open` 生效 + CSS 规则存在 |

回归结果：`node test/run.js` Node13/24 各 **30/0/0**；`tools/smoke.js` **28/0**；`tools/check-compat.js` PASS；`tools/check-assets.js` 18 HTML 0 错误。详见 [`../CHANGELOG.md`](../CHANGELOG.md)。

### v1.0.2（2026-10-25，第二次浏览器验收反馈）

| 反馈 | 根因 | 修复 | 回归 |
| --- | --- | --- | --- |
| 菜单底部「切换主题」弹窗里点主题卡片没反应 | 弹窗是独立 iframe，此前只对 **footer 按钮**做「本地没有就转发父页」；主题卡片用的是**节点级** `on.click → app.applyTheme`，在 iframe 内找不到动作，被静默吞掉 | `dialog-frame.js` 新增 `installActionBridge()`：包装本地 `KUI.actions.run`，`app./theme./tab(s)./nav./menu./menunav./toast./dialog./handlers./form./frame.` 前缀统一走 `dialog:action` 交父页执行，回执解包；本地动作仍本地执行 | smoke [8]：`installActionBridge` + `COMPONENT_RE` + `dialog:action` 转发存在；任意弹窗节点动作均可由 JSON 指定 |
| 需求：JSON 不能存函数，希望每个框架组件一个独立业务函数 js，JSON 只存函数名与入参 | 配置必须保持纯数据，不能把函数塞进 JSON | 新增 `KUI.handlers` 注册表 + 7 个组件业务函数文件（menu/menunav/tabs/dialog/toast/app/form），JSON 支持 `{fn,args}` / 字符串 / 动作数组混写 / `handlers.run` 四种写法；新增 `config/demos/handlers.json` + `standalone/handlers.html` 纯 JSON 演示页；`docs/09-handlers.md` 成文 | smoke [8]：61 个业务函数、7 个 scope、JSON `fn` 写法真实执行、演示 JSON 中 30 处 fn 全部已注册、index.html 引全 8 个 handler 脚本 |

回归结果：`node test/run.js` Node13/24 各 **30/0/0**；`tools/smoke.js` **34/0**（Node13/24）；`tools/verify-handlers-demo.js` PASS（8 组 / 29 节点 / 27 按钮真实渲染 + 点击出提醒）；`tools/verify-dialog-bridge.js` PASS（`app.applyTheme` / `handlers.run` / 动作数组均转发父页且参数完整）；`tools/check-compat.js` PASS；`tools/check-assets.js` **20 HTML 0 错误 0 警告**。详见 [`../CHANGELOG.md`](../CHANGELOG.md)。

### v1.0.3（2026-10-26，第三次浏览器验收反馈，8 项）

| 反馈 | 根因 | 修复 | 回归 |
| --- | --- | --- | --- |
| 1 切主题后部分页面仍是原主题 | `tabs.js`/`dialog.js` 的 `currentTheme()` 调不存在的 `KUI.theme.tokens()` → 广播 `tokens` 恒为 `{}`；`kui-frame.js applyTheme()` 同死分支、且不重绘装饰层 | `currentTheme()` 改读 `KUI.theme.current()`（回退 `currentTokens()`）并补 `scheme`；`kui-frame` 优先 `K.theme.apply(...,{silent})`、回退 `applyTokens`、`themeArt` 重绘、同步 `data-kui-theme/-scheme`、新增 `themeId()` | smoke：六套主题 apply / 主题子→父通道 / 运行时 iframe 请求 `sakura` 后整壳跟随 |
| 2 无壳拼装出现未注册元素；iframe 外已有菜单时内部不应再有菜单 | `menu/menunav/tabs/toast` 缺 `registry.js`；`no-shell`/`menu` 缺控件脚本；standalone 自带 demo 导航与主题下拉，嵌入后重复 | 四页补 `registry.js`、两页补控件脚本；新增 `standalone/embedded.js` 内嵌检测（隐藏 demo 导航/主题下拉 + 徽标）；`no-shell` 嵌入时跳过内层壳并显示提示 | `.tools/no-shell-probe.js` **39/39**；smoke standalone 全覆盖断言 |
| 3 成功/警告按钮悬浮变黑 | 基础 `.kui-btn:hover` 深色底覆盖填充按钮，success/warning hover 未重声明 background | 三态全部显式 `background+border-color`，前景用 `--kui-on-*`；hover 内高光 + 语义色光晕 | `controls.css` 静态审计（0 硬编码颜色）+ `.tools/probe-pickers.js` |
| 4 日期范围无法正确选择 | daterange `onHover` 每次重建两侧 42 格 DOM，光标下节点被替换 → 点击丢失 | 抽出 `cellMeta/paint()`，hover 只重算 class（DOM 身份不变），选择后才 rebuild | `.tools/probe-pickers.js` **17/17**（跨月、同日、收窄、重置、清除） |
| 5 日历切月按钮看不到 | `control-base.js` icon 写死 `#kui-i-*`，sprite 从未注入 → 全站控件图标空白 | `iconEl` 走 `KUI.icons.create`、`iconHtml` 走 `icons.get`，降级统一 `#kui-icon-*` | smoke [5] 新增图标断言（sprite + symbol + 每个 `.kui-icon` 可解析） |
| 6 悬浮时文字与按钮背景同色 | 实心填充前景用 `--kui-text-1`；standalone 内联 `.demo-btn--primary:hover` 同问题 | 控件 26 处改 `--kui-on-*`；8 个 standalone 页与 `dialog-frame.html` 的三态前景统一 `var(--kui-on-*, var(--kui-text-inverse))` | 主题 6 套 `--kui-on-*` 对比度 ≥4.5:1（theme 探针） |
| 7 弹窗内没有文字、确认/记录/关闭无反应 | alert 只读 `props.text` 而配置写 `props.message`；动作桥「白名单才转发」丢弃页面级动作 | `normalizeNode()` 归一 `message→text`；动作桥改「本地优先，其余一律转发」，父页未注册回 `{ok:false}` + toast 提示 | `.tools/probe-dialog-frame.js` **12/12**（正文可见 + `dialog:action` 发出 + 回执不关闭） |
| 8 点「再开一层」无反应 | 同 7：`demo.nested` 是页面级动作，被白名单过滤 | 同 7（动作桥改造） | 同 7 |

回归结果：`node test/run.js` Node13/24 各 **30/0/0**；`tools/smoke.js` **35/0**（Node13/24，新增图标断言）；`tools/check-compat.js` PASS；`tools/check-assets.js` **20 HTML 0 错误 0 警告**；`tools/verify-handlers-demo.js` / `verify-dialog-bridge.js` PASS；探针：no-shell 39/39、pickers 17/17、dialog-frame 12/12。详见 [`../CHANGELOG.md`](../CHANGELOG.md)。

### v1.0.4（2026-10-26，第四次浏览器验收反馈）

| 反馈 | 排查结论 | 加固 | 回归 |
| --- | --- | --- | --- |
| 独立渲染页仍显示「未注册的元素类型」 | **不是当前代码问题**：真实 Chromium 实拍 `standalone/menunav.html` 顶层面、主应用内「菜单导航 · 独立渲染」「菜单 · 独立渲染」两个标签均完整渲染，且带 v1.0.3 新增的「已嵌入主应用」徽标；用户截图无该徽标 → iframe 装载的是旧版缓存文档 | `KUI.version` → `1.0.4`；`tabs.js` 在 http(s) 下给 iframe URL 追加 `?kui_v=<version>`（缓存穿透，`file://` 不追加）；`tab:init` 携带 `parentVersion`/`src`；`kui-frame.js` 新增 `selfHealVersion()`，版本不一致时带新版本号自动刷新一次（sessionStorage 防循环，独立页不自愈） | smoke **[9] 版本自愈** 3 项 → 总计 **38/0**；真实浏览器确认 4 个 iframe 的 `src` 均带 `?kui_v=1.0.4` 且渲染正常 |

回归结果：`node test/run.js` Node13/24 各 **30/0/0**；`tools/smoke.js` **38/0**（Node13/24）；`tools/check-compat.js` PASS；`tools/check-assets.js` **20 HTML 0 错误 0 警告**。详见 [`../CHANGELOG.md`](../CHANGELOG.md)。

### v1.0.5（2026-10-26，悬浮提示 / 主题弹窗复测 / 顶部空白 / 注册审计）

| 反馈 | 根因 | 修复 | 回归 |
| --- | --- | --- | --- |
| 1 鼠标悬浮提示仍是浏览器原生样式 | 全站大量使用原生 `title`，浏览器画的是系统提示（白底黑字） | 新增 `src/core/tooltip.js` + `tooltip.css`，事件委托接管 `title`/`data-kui-tip`，主题化浮层 + 箭头 + 动效；`config/app.json` 新增 `ui.tooltip`；19 个 HTML 与弹窗 iframe 全部接入 | smoke **[10]** 5 项（含 `ui.tooltip` 生效、19 HTML 引全资源、弹窗接管）；真实浏览器探针确认浮层主题化且移除原生 title |
| 2 菜单右下角「切换主题」仍无效 | 当前链路已通；用户侧是 v1.0.4 之前缓存的旧弹窗文档（缺 v1.0.2 动作桥） | v1.0.4 的 `kui_v` 版本戳 + 版本自愈已覆盖；本次补自动化回归防回退 | 真实浏览器全链路：点 footer 按钮 → 弹窗（带 `kui_v=1.0.5`）→ 点「星夜观测」→ `theme=starry`、`--kui-accent=#7b96e8`、弹窗关闭 |
| 3 右侧页面区上方多一行空白 | `pages/*.html` 的 `.page`/`.home` 顶部内边距 22px（旧版遗留） | 7 页顶部内边距统一 6px | smoke **[10]** 静态断言 7 页 `.page/.home` padding-top ≤ 10px；真实浏览器截图无空白带 |
| 4 检查是否还有其他未注册元素 | 无（v1.0.3/1.0.4 已修完页面装配问题） | 新增 `tools/audit-all-pages.js` 全页面审计探针 | **17 / 17 页面通过**（`.kui-unknown`=0、无「未注册」文本、无 console.error、tooltip 已加载） |

回归结果：`node test/run.js` Node13/24 各 **30/0/0**；`tools/smoke.js` **43/0**（双版本）；`check-compat` PASS；`check-assets` **20 HTML 0 错误 0 警告**；全页面审计 **17/17**。详见 [`../CHANGELOG.md`](../CHANGELOG.md)。

### v1.0.6（2026-10-26，第五次反馈：弹窗正文 / 按钮 / 嵌套 / 输入卡死）

| 反馈 | 根因 | 修复 | 回归 |
| --- | --- | --- | --- |
| 1 点「再开一层」仍无反应 | 嵌套弹窗配置根配置被 `type` 覆盖，弹窗 iframe 按 `info` 渲染、没有动作按钮的语义 | 工厂强制 `method` 权威类型并随 `dialog:init` 下发；`dialog-frame` 以 `method` 分流结构、`type` 只做配色语义 | 真实 Chromium 三层嵌套：点「再开一层」→ 新开「嵌套确认（第 2 层）」 |
| 2 弹窗内无对应内容（prompt 空正文） | 示例 JSON 的 `"type":"info"` 覆盖了 `type:'prompt'` | 同 1；prompt 正文 / 输入框 / 底部按钮恢复 | 真实 Chromium：`body="备注"`、`input=true`、按钮 `["取消","记录"]` |
| 3 除叉号外所有按钮点击无反应 | 同上：`info` 分支底部只剩一个按钮且无动作；关闭按钮语义丢失 | 同 1；footer 按钮继续走「本地可执行则执行，否则转父级」，关闭/取消/自定义动作全部恢复 | 真实 Chromium：点「记录」→ 关闭并 `resolve(null)`；`custom` 弹窗动作转发成功 |
| 4 点输入框后卡死 | 未复现（可能与 2/3 同源的旧文档/旧 JS 有关） | 无额外改动；已用真实 Chromium 测 `activeElement=INPUT`、焦点后 rAF 帧数正常 | 真实 Chromium：聚焦输入框前后 `rAF` 均正常（无长任务） |

回归结果：`tools/smoke.js` **44/0**（Node24 与 Node13.14 各一次，含 v1.0.6 新增的「method 不被 config.type 覆盖」断言）；`node test/run.js` Node24 **30/0/0**（1818ms）、Node13.14 **30/0/0**（4846ms）；`tools/check-assets.js` **20 HTML 0 错误 0 警告**。详见 [`../CHANGELOG.md`](../CHANGELOG.md)。

### v1.0.7（2026-10-26，第六次反馈：实心按钮悬浮配色 / 切换主题闪烁）

| 反馈 | 根因 | 修复 | 回归 |
| --- | --- | --- | --- |
| 1 部分按钮鼠标悬浮时文字与按钮背景同色，看不清 | ① 7 个 `pages/*.html` 的 `.btn--primary` 前景写死 `#fff`，`:hover` 只换背景、未重声明前景 → 浅色主题下白字看不清；② 框架 `.kui-btn--success / --warning / --danger` 悬浮只加发光、不改填充，看起来「没有反应」 | pages 统一渐变底 + `var(--kui-on-accent, var(--kui-text-inverse))`，并补 `.btn--primary:hover` 前景声明；`controls.css` 三个填充变体 `:hover` 增加 `filter: brightness(1.14) saturate(1.06)`（不改变色相、继续保持 `on-*` 对比度） | smoke **[11]**：7 页实心按钮悬浮前景不含 `#fff` 且消费 `on-accent` |
| 2 切换主题 / 切换菜单时 iframe 区域先闪烁另一个主题 | iframe 新文档先加载 `base.css`，`:root` 是 kurumi 暗红默认 token，要等业务脚本收到父级 `theme:apply` 才换色 → 首帧必闪 kurumi | 新增 `src/core/theme-boot.js`：在 `<head>` 最前、所有样式表之前同步读父级（`parent.KUI.theme.currentTokens()`）或 `localStorage` 主题，立即写内联 token + `data-kui-theme`；暴露 `__KUI_EARLY_THEME__` 供 `KUI.theme.resolveInitial()` 优先采用 | smoke **[11]**：19 个 HTML 均在首个样式表前引入；脚本含 parent / localStorage 分支；`theme.js` 优先早主题。真实 Chromium 探针：切换后新标签首帧采样 `accent=#bd2138`（白羽灵装）、`data-kui-theme=kurumi-angel`、内联 token 64 个 |

回归结果：`tools/smoke.js` **46/0**（Node24 与 Node13.14 各一次）；`node test/run.js` Node24 **30/0/0**（1566ms）、Node13.14 **30/0/0**（4677ms）；`tools/check-assets.js` **20 HTML 0 错误 0 警告**；`KUI.version` → `1.0.7`。详见 [`../CHANGELOG.md`](../CHANGELOG.md)。

### v1.0.8 · 2026-10-26

| # | 反馈 | 根因 | 修复 | 证据 |
| --- | --- | --- | --- | --- |
| 1 | 多行文本框右下角没有可调角标 | 弹窗多行输入用浏览器原生 resize 角标；业务页自写 textarea 未统一 | 新增 `src/core/dom-enhance.js` 的 `KUI.enhance.grip()`；`dialog-frame.js` 多行 `prompt` 改 `resize:none` + 自绘角标；7 pages + 10 standalone 标记升级 | 真实 Chromium：角标 16×16、`cursor:nwse-resize`、拖拽 76→116px；smoke [12] |
| 2 | 菜单右下角切换主题仍无效 | 旧缓存的弹窗 iframe 文档（旧版无动作桥） | 版本戳 `kui_v=1.0.8` 缓存穿透 + `kui-frame/dialog-frame` 版本自愈 + 非关闭型按钮点击回执提示 | 真实 Chromium：footer 按钮→弹窗→选「星夜观测」→整壳 + 3 个 iframe 全部变 starry + toast；smoke 缓存穿透断言 |
| 3 | 部分下拉框体风格与主题不一致 | 13 个页面原生 `<select>` 绕过主题 | `dom-enhance.js` 就地升级为框架 select（保留 value/事件/option 同步） | 真实 Chromium：13 个 select 全部升级，弹层为 `kui-select-popup`（token 着色）；smoke [12] |

回归：`smoke.js` **49/0**（双 Node）、`test/run.js` **30/0/0**（双 Node）、`check-assets.js` 20 HTML 0 错 0 警、`check-compat.js` PASS。

### v1.1.0（弹窗加固 + 诊断面板）

| 用户反馈 | 根因 / 处理 | 验证 |
| --- | --- | --- |
| 弹窗按钮点了没反应 | 焦点陷阱抢焦点 + 拖拽 is-dragging 残留可能导致整层 pointer-events:none；已移除持续焦点陷阱、加拖拽兜底、点击回传 toast「已点击：xxx」 | 三层嵌套真实 Chromium 点击取消/记录/再开一层均生效 |
| 弹窗输入导致浏览器卡死 | clip-path 裁剪层整层重绘 + 拼写检查/自动纠正逐字开销；已移除 clip-path、关闭 spellcheck/autocorrect、高度上报节流 | 输入 40 字符 8ms、无 longtask 堆积 |
| 复现反馈手段 | 新增 `?kui_debug=1` 诊断面板（错误 / longtask / 焦点 / 输入耗时 / 消息链路，可复制） | 真实 Chromium 面板可见、27 行日志、0 异常 |

回归：smoke **56/0**（双 Node）、test **30/0/0**（双 Node）、assets 20 HTML 0 错 0 警、compat PASS、全页面审计 18/18。

### v1.1.1（弹窗消息乒乓修复）

| 用户反馈 | 根因 | 修复 | 验证 |
| --- | --- | --- | --- |
| 弹窗按钮点了没反应 | `dialog:ready` ↔ `dialog:init` 无限乒乓（约 110 条消息/秒），主线程被消息与重渲染占满 | frame 侧 `render()` 不再回发 ready；父级 ready 只初始化一次 + 次数熔断；高度上报令牌桶熔断（>40 次/500ms） | 真实 Chromium：3 秒内消息 18 条（resize 3 / ready 1），点击关闭生效 |
| 弹窗输入导致浏览器卡死 | 同上（输入夹在消息风暴与重排之间） | 同上 | 同上；冒烟 56/0、test 30/0/0、审计 17/17 |
| 弹窗独立渲染页元素快速闪动 | 每轮 `dialog:resize` 改一次 iframe 高度 | 同上 | 同上 |

### v1.1.2（弹窗必填校验反向 + 表单弹窗缺按钮）

| 用户反馈 | 根因 | 修复 | 验证 |
| --- | --- | --- | --- |
| 1 必填输入框有文字反而保存不了，清空却能保存 | `normalizeRules()` 未展开键值对象规则 + `validateField()` 末尾无条件套用 `message`，语义正好反向 | 新增 `expandRule()` / `RULE_KEYS`、`failed` 标记、`minLength/maxLength` 别名 | 真实 Chromium：有值 → `resolved="一之弹·时之结界"`；空值 → 红字「结界必须有名字」并拦截 |
| 2 表单弹窗没有取消/提交按钮 | `KUI.form.create(host)` 返回 `el === host`，`host.appendChild(host)` 抛 `HierarchyRequestError`，render 中断、footer 未构建 | `created.el !== host` 守卫 + 正文 `try/catch` + footer `safe()` 组装 | 真实 Chromium：footer `["放弃修改","保存配置"]`、`footerDisplay:flex`、点取消关闭 |

回归：`smoke.js` **60/0**（双 Node，新增 `[15]`）、`test/run.js` **30/0/0**（双 Node）、`check-assets.js` 20 HTML 0 错 0 警、`check-compat.js` PASS、全页面审计 18/18。

### v1.1.3（菜单自带折叠按钮与整壳不同步）

| 用户反馈 | 根因 | 修复 | 验证 |
| --- | --- | --- | --- |
| 点菜单头像右侧折叠按钮，只有菜单收起、右侧页面区域不撑开；点顶部导航收起按钮则正常 | `menu.js setCollapsed()` 只发全局 `emit(menu:collapsed)`，未走实例 `fire(collapsed)`；而 `app-shell.js` 监听的是 `menuApi.on(collapsed)` → 收不到，grid 列宽不更新 | `menu.js` 改 `fire('collapsed')`（fire 内自动补发 `menu:collapsed`，menunav 图标同步不受影响） | 真实 Chromium 探针：left `252→68`、center `[252,56,1028]→[68,56,1212]`，再点顶栏恢复 `252/1028`；smoke [16] 3 项 |

回归：`smoke.js` **63/0**（双 Node，新增 `[16]`）、`test/run.js` **30/0/0**（双 Node）、`check-assets.js` 20 HTML 0 错 0 警、`check-compat.js` PASS、全页面审计 18/18。

### v1.1.4（弹窗表单必填项留空仍可保存）

| 用户反馈 | 根因 | 修复 | 验证 |
| --- | --- | --- | --- |
| 标星号的必填项，不填内容也能保存（所有弹窗表单） | `dialog-frame.js` 的 `validateForm()` 用 `!!valid` 判断，而 `form.validate()` 返回 `{ valid, errors, data }` 对象 → 恒真 | 新增 `isValidatePassed(res)` 归一化（`valid===false`/`ok===false`/`false` 判失败），同步与 Promise 两路都走它 | 真机：弹窗表单清空必填点保存 → 弹窗保持打开 + 2 个失败字段 + 错误文案；页面表单清空 8 项点提交 → 无二次确认弹窗 |

回归：`smoke.js` **66/0**（双 Node，新增 `[17] 表单必填校验`）、`test/run.js` **30/0/0**（双 Node）、`check-assets.js` 20 HTML 0 错 0 警、全页面审计 18/18。

### v1.1.5（菜单收起后顶部导航折叠按钮的提示文案/图标不切换）

| 用户反馈 | 根因 | 修复 | 验证 |
| --- | --- | --- | --- |
| 菜单收起后，顶部导航「展开按钮」的 tooltip 仍是「收起菜单」、图标也不变 | 三个隐性断点叠加：① `KUI.events` 只有 `create/createEmitter`，组件调用的 `KUI.events.emit / on` 全都不存在 → `menu:collapsed` 等模块级事件被静默丢弃；② `app-shell` 创建子组件时 `ctx.app` 恒为 `null`，menunav 的 `getMenu()` 取不到菜单实例；③ `createContext().emit()` 末尾误写 `ctx.app.on(name, detail)`（把 payload 当监听函数注册），事件一旦真正通了就报 `copy[i].apply is not a function` | ① `kui.js` 新增 `KUI.events.on/once/off/emit/has/count` 全部委托到 `KUI.bus`（同一份订阅表）；② `app-shell` 创建时 `ctx.app = app`，`menunav.getApp()` 增加 `KUI.app.instance` 兜底；③ `ctx.app.on(...)` → `ctx.app.emit(...)` | 真实 Chromium 探针 `.tools/probe-collapse2.html`：点菜单自带折叠按钮后 `navTitle 收起菜单 → 展开菜单`、`aria-expanded true → false`、`menuTitle 收起时间枢纽 → 展开时间枢纽`、`leftW 252 → 68`；再点恢复 |

回归：`smoke.js` **74/0**（双 Node，新增 `[18] 模块级全局事件兼容层` 4 项，含运行时「菜单收起后顶部导航按钮文案/aria 同步」）、`test/run.js` **30/0/0**（双 Node）、`check-assets.js` 20 HTML 0 错 0 警、`check-compat.js` PASS、全页面审计 18/18。

---

### v1.2.0 — 头像自定义 + 刻刻帝时间齿轮头像框

| 验收点 | 实现 | 验证 |
| --- | --- | --- |
| 配置 JSON 传入头像 URL，可配置是否允许点击更换 | `config/app.json` 顶层 `avatar`（`url / editable / persist / size / frame / picker`）；`src/core/avatar.js` + `src/components/menu.js` 品牌区 + `app-shell` 透传 | smoke **[19]**：kui-all 两 profile 含 avatar.js、app.json `avatar.editable`、菜单挂 `standalone/avatar.html`、运行时创建后出现齿轮 ring 且切主题后 `img.src` 不变 |
| 设置头像后绘制刻刻帝时间齿轮头像框，且颜色随主题变化、头像不变 | `buildRing()` 生成 SVG 齿轮/刻度/指针，颜色全部取 `--kui-accent-2 / --kui-accent / --kui-accent-glow`；`avatar.css` 由 `base.css` @import | 真实 Chromium 探针 `.tools/probe-avatar-theme2.html`：`stroke` rgb(212,175,55) → rgb(111,199,201) → 切回 rgb(212,175,55)，`accent2` 与 `data-kui-theme` 同步变化 |
| 提供可交互测试页 | `standalone/avatar.html`（交互测试台 + 15 个 JSON 示例 + 字段表）；菜单「观测回廊 → 头像与齿轮框」入口 | 真实 Chromium 加载：15 个头像 / 12 个齿轮框 / 按钮齐全；`config/demos/avatar.json` 11KB+ |

回归：`smoke.js` **74/0**（双 Node）、`test/run.js` **30/0/0**（双 Node）、`check-assets.js` **20 HTML 0 错 0 警**、`check-compat.js` PASS、全页面审计 **18/18**。

### v1.3.0 表单必填体系与弹层点外关闭

| 用户反馈 | 根因 | 修复 | 验证 |
| --- | --- | --- | --- |
| 未必填字段显示星号 | `controls.css` 缺星号显隐规则 | 默认隐藏 + `is-required:not(.is-required-optional)` 才显示 | smoke [20] 运行时：必填含星号 / 非必填不含；填组后成员转 `is-required-optional` |
| 多填一必填组 | 只有单字段 required | `requiredAny: [id...]` + 组校验（全空拦截 / 填一解除其余） | smoke [20] 运行时三段：空拦截 → 填一通过 → 清空再拦截 |
| 隐藏字段不应校验 | `validateField()` 不判隐藏 | 开头 `isInvisible` 跳过 + dialog-frame 同步 | smoke [20] 静态 + 运行时 |
| 单选/复选必填 | 默认 validate 可用但 switch false 视为非空 | `emptyValue(false)===true` + 四控件必填用例 | smoke [20] 运行时：radio/checkbox/switch 空值拦截 |
| 弹层点外部不关闭 | 仅 `document mousedown`，跨 iframe/父级 UI 收不到；select 有重开竞态 | `popup._lastClosed` 300ms 守卫 + `window blur` + `document focusout`；tabs 右键菜单补 `window blur` | 真实浏览器：下拉点空白/点父级 UI 均关闭；右键菜单点外/失焦关闭 |
| 菜单收起后折叠 tooltip 文案仍旧 | tooltip 缓存旧 `data-kui-tip`，忽略新 `title` | `textOf()` 以最新 `title` 为准并同步缓存 | 真实浏览器：收起后 tooltip = 「展开时间枢纽」 |

回归：`smoke.js` **76/0**（双 Node）、`test/run.js` **30/0/0**（双 Node）、`check-assets.js` **20 HTML 0 错 0 警**。

### v1.3.1

| # | 反馈 | 根因 | 修复 | 验证 |
| --- | --- | --- | --- | --- |
| 1 | 菜单头像与齿轮框被裁 | `.kui-menu__logo` 斜切 `clip-path` 未在 `--avatar` 变体重置 | `avatar.css` 加 `clip-path:none; overflow:visible` | 真机：`logoClip=none`、齿轮 rect 超出原 logo 矩形；截图确认完整圆环 |
| 2 | 更换方式需要可配置 | 此前只支持 URL | `avatar.picker.mode`（`url`/`file`）+ `accept`/`maxSizeMB`；新增 `pickFile()` | 真机：file 模式合成 change → dataURL 生效；url 模式弹窗正常；smoke [21] |

本轮回归：`smoke.js` **79/0**（双 Node）、`test/run.js` **30/0/0**（双 Node）、`check-assets.js` 20 HTML 0 错 0 警。

### v1.3.2

| # | 反馈 | 修复 | 验证 |
| --- | --- | --- | --- |
| 1 | 齿轮转速需要可配置 | `frame.spinDuration`（秒/圈；0 停转、负数反向）+ CSS 变量驱动 + `setSpinDuration()/getSpinDuration()` | 真机 `animationDuration` 6s/48s/12s 切换正确；smoke [22] |

本轮回归：`smoke.js` **82/0**（双 Node）、`test/run.js` **30/0/0**（双 Node）、`check-assets.js` 20 HTML 0 错 0 警、审计 18/18。

### v1.3.3

| 反馈 | 根因 | 修复 | 验证 |
| --- | --- | --- | --- |
| 菜单底部三个控件互相挤占、显示不全 | footer 单行 flex + `block:true` 的按钮 `width:100%` 撑爆；折叠态按钮仍带文字 | footer 允许换行、title 独占一行、version/actions 同行两端对齐；footer 按钮宽度覆盖为 auto + 省略号；折叠态只留 24×24 图标 | 真机探针：展开 250×65 两行、三元素无溢出（overflow=none）；折叠 67×44、按钮 24×24、文字隐藏；smoke [23] 3 项 |

回归：`test/run.js` Node13/24 各 **30/0/0**；`tools/smoke.js` **85/0**；`check-assets` 20 HTML 0 错 0 警；审计 18/18。
### v1.3.4

| 反馈 | 根因 | 修复 | 验证 |
| --- | --- | --- | --- |
| 菜单收起后，展开按钮图标变了但悬浮文案仍是「收起」；要求一并排查同类问题 | `tooltip.restore()` 保留旧 `data-kui-tip`，组件改 `title` 后旧值仍优先；提示显示期间无刷新机制 | `textOf` 以最新 `title` 优先；`restore` 清理临时 `data-kui-tip`；新增 `MutationObserver` 实时刷新 + `KUI.tooltip.update()` | 真机探针：折叠后悬浮显示「展开时间枢纽」；显示中改 title 立即变；导航折叠按钮同为「展开菜单」；smoke [24] 2 项 |

回归：`test/run.js` Node13/24 各 **30/0/0**；`tools/smoke.js` **87/0**（双 Node）；`check-assets` 20 HTML 0 错 0 警；审计 18/18。




### v1.3.5 · 源码↔测试一致性 + 组件可拆装

| 用户要求 | 结论 | 证据 |
| --- | --- | --- |
| 审计「源码」与「测试代码」是否一致 | 发现并修复测试加载清单手写漂移（20→28 文件 / 39→40 类型）；版本号四处统一；审计脚本自身期望清单更正 | `tools/audit-consistency.js` 16/0/0；`test/load-kui.js` 由 `config/kui-modules.json` 派生 |
| 检查组件能否随意拆卸 / 组装 | 7 个组件最小模块集独立渲染通过；34 个注册类型裸挂载通过；11 个 standalone 页可单开；5 个组件无顶层硬依赖 | `tools/audit-components.js` 17/0 |
| 修复检查出的问题 | P1–P4 全部修复（清单派生、版本统一、审计清单更正、冒烟断言去写死） | smoke [25] + 双 Node 回归 |

完整报告见 [`docs/10-audit-report.md`](10-audit-report.md)。

### v1.3.6

| # | 反馈 | 根因 | 修复 | 验证 |
| --- | --- | --- | --- | --- |
| 1 | 遗留建议中「需要修复的」 | `test/config.test.js` 控件类型写死、冒烟无分节过滤 | 控件类型改为注册表派生 + 审计 E4 静态扫描；冒烟支持 `--only=list` / `--only=N` | 一致性审计 17/0（E4 PASS）；`--only=26` 5/0 |
| 2 | 搜索多结果时直接打开首个 | `openSearch()` 命中即 `openTab(first)`，无候选 UI | `searchMenu()` 6 档评分 + `showSearchPicker()` 候选弹窗（最多 10 项，显示父路径），由用户点选 | 冒烟 [26] 4 项；真实 Chromium：2 个候选 → 点选后新增标签并关闭弹窗 |

### v1.3.8 · 配置接线修复 + 配置读取点审计

| # | 反馈 | 根因 | 修复 | 验证 |
| --- | --- | --- | --- | --- |
| 1 | `app.json` 的 `boot` 段运行时不生效 | `boot()` 只 `attachBootLayer(null)`，`configureBootLayer` 无调用点 | 新增 `applyBootConfig(appCfg, textCfg)` 并接线；`enabled:false` 销毁；`appliedBootConfig` 可核对 | 冒烟 [28.1] / [28.2]；真实浏览器核对表盘 size、阶段文案 |
| 2 | 是否还有「配置字段无读取点、配置不生效」 | 文档承诺了但源码未消费 | 修复 `app.*` 注入、`brand.logoText`、`footer.subtitle/copyright`、`theme.picker.*`、`ui.dialog.escClosable`、`boot.clock.smooth`、`tabs.props.keepAlive`、`dialog.config()` 写回 | `tools/audit-config.js` 0 缺口；冒烟 [28.3]/[28.4]/[28.5]；`test/render` / `test/config` 新用例 |
| 3 | 同类缺陷的持续防护 | 无自动检查 | 新增 `tools/audit-config.js`（叶子键读取点扫描，白名单 37 项），`npm run audit:config` | 首跑 431 待核对 / 0 缺口；缺口即退出码 1 |

回归：`tools/smoke.js` **104 / 0**；`test/run.js` **32 / 0 / 0**；`test/render` 9/0；`test/config` 5/0；`audit-consistency` 17/0；`audit-components` 19/0；`audit-all-pages` 19/19；`check-assets` 21/0/0；`check-manual` 0/0。

### v1.3.7 · 加载层组件化 + 时钟指针进度动画

| # | 反馈 | 根因 | 修复 | 验证 |
| --- | --- | --- | --- | --- |
| 1 | 加载中页面不能单独拆装 | 启动层是 `index.html` 内联样式 + 骨架，无注册组件、无 API | 新增 `src/components/boot.js`（注册 `type:"boot"` + `KUI.bootLayer`）+ `src/styles/boot.css`；`bootstrap.js` 委派并保留 legacy 降级 | 冒烟 [27.1]/[27.3]/[27.4]；`audit-components` boot 用例；拆掉 boot.js 后启动页仍显示 |
| 2 | 时钟图案要有时针/分针动画，进度 0%→100% 对应 0 时→12 时 | 原静态钟 `::before/::after` 固定角度，只做 5.2s 匀速转 | `handsAt()` 纯函数：`totalMinutes=p/100*720`、时针 `totalMinutes/720*360`、分针 `(totalMinutes%60)/60*360`；0%/100% 均为 12 点、25%→3:00、50%→6:00、75%→9:00 | 冒烟 [27.2] 6 个采样点（0/12.5/25/50/75/100）；`standalone/boot.html` 滑块逐格核对 |
| 3 | 需要一个单独测试页观察效果 | 无独立页 | 新增 `standalone/boot.html`：内嵌 `mode:inline` 预览、0→100 自动演示、阶段推进、平滑/跳变切换、spin 模式、错误态、JSON 驱动重渲染 | 冒烟 [27.5]；`check-assets` 21 HTML 0 错；导航 12 个独立页全部可达 |

回归：`tools/smoke.js` **99/0**（Node 13.14 / 24 双版本）；`test/run.js` **30/0/0**；`audit-consistency` 17/0；`audit-components` 19/0；`check-assets` 21 HTML / 0 错 0 警。
## v1.3.9 配置接线补强（2026-10-29）

| 用户反馈 | 根因 | 修复 | 验证 |
| --- | --- | --- | --- |
| `menu.props.width/collapsedWidth` 未消费 | 写的是 `--kui-menu-w`，CSS 读 `--kui-menu-width(-collapsed)` | menu 写正确变量；app-shell 优先 props | smoke [29.1] |
| `menunav.props.breadcrumb.max` 无读取点 | 只合并进 `breadcrumb` 对象 | `normalizeProps` 归一 `maxBreadcrumb`（双路径） | smoke [29.2] |
| 设置弹窗 `desc/draggable/layout` 未透传 | `openSettings` 白名单过窄 | 三个字段透传；`desc` → 弹窗副标题 | 真实浏览器截图 |
| 设置弹窗保存无效 | 节点 id 与 `openSettings` 应用值不匹配 | 新增 `KUI.boot.applySettings` + `applyStoredPrefs` + 密度 token | smoke [29.3]、`test/config` 用例；真实浏览器核对 5 字段渲染 |
| `boot.ready` 无读取点 | 主流程未使用 | 最后一步显示就绪文案 | 源码审阅 |
| select/multiselect `autofocus` 恒 false | `p(ctx,…)` 应传 node | 两处改 `p(node,…)` | smoke [29.4] |

回归：`test/run.js` **33/0/0**（Node 24 + Node 13.14）；`smoke` **108/0**；`check-assets` 21/0/0；`audit-consistency` 17/0；`audit-components` 19/0；`audit-all-pages` 19/19；`audit-config` 0 缺口；`check-manual` 0/0。

### v1.4.0：可拆卸数据表格（datatable）

| # | 需求（用户原话摘要） | 落点 | 验证 |
| --- | --- | --- | --- |
| 1 | 可拆卸的表格组件 | 单文件 `src/components/datatable.js` + 独立 `datatable.css`；拆掉后仅该 type 降级占位 | `tools/audit-components.js` 拆解矩阵；页面里删脚本后其余组件不受影响 |
| 2 | 一体化配置的组合功能 | 一个 `props` 收齐搜索/筛选/排序/选择/工具栏/列设置/密度/导出/分页 | `standalone/datatable.html` 面板 ①；smoke `[30.2]` |
| 3 | 筛选 | 全局 `search` + 列级 `filter`（text/select/range） | 面板 ①③；`test/render.test.js` datatable 用例 |
| 4 | 单选行 / 复选行 / 全选行 | `selection.mode = single / multi`，表头全选、`selectAllScope: page/all`、跨页保持 | `test/render.test.js`：选择跨页保持；smoke `[30.3]` |
| 5 | 排序 | 列 `sortable` + 表头点击（single/multi 模式、默认排序） | 面板 ①；smoke `[30.2]` 默认 desc 首行断言 |
| 6 | 每页多少行 / 分页 | `pagination.pageSize / pageSizes / showTotal / showSizer / showJumper` | 面板 ①③；`test/render.test.js` 分页与 pageCount |
| 7 | 行点击高亮 | `rowHighlight`（默认 true）+ `rowClickAction` | 面板 ①；真实浏览器点击验证 |
| 8 | 进阶功能（未点名） | 键盘操作（↑↓/空格/Enter）、列显隐、密度、刷新、CSV 导出、行动作列、空态/加载态、固定表头 | 面板 ①⑤；真实浏览器 |
| 9 | 现有框架不回归 | 注册类别 `data`，不占 19 个表单控件；样式全 token 化 | 六套主题下截图；闸门全绿 |

**回归数字**：`test/run.js` 34/0/0（Node24 & Node13.14）；`smoke.js` 111/0；`audit-consistency` 17/0；`audit-components` 19/0；`audit-all-pages` 20/20；`audit-config` 0 缺口；`check-assets` 22 HTML 0/0；`check-manual` 0/0；`check-beginner-manual` 0/0；`verify-build` 6/0。

## v1.4.1 未消费资产审计 + 头像持久化（2026-10-29）

| 用户反馈 | 根因 | 修复 | 验证 |
| --- | --- | --- | --- |
| 头像更换后刷新失效（疑似缓存未被消费） | `avatar.create()` 取 `options.url \|\| stored`，配置默认恒真 | 改为 `stored \|\| options.url`；`data-kui-avatar` 按生效值 | `test/render.test.js` 头像持久化用例；smoke `[31.3]`；真实浏览器刷新 |
| 同类问题：疑似存在先写后读链路 | — | 逐条核查 theme / 菜单折叠 / bootstrap 偏好键 / kui-frame 自愈 / diag 标记，读写对称 | 源码审阅 + smoke 既有 `[29.3]` 偏好持久化断言 |
| 未消费样式 | `dialog-frame.html` 使用不存在的 token 名 | 7 处改为真实 token（`--kui-control-bg-hover` / `--kui-control-bg-active` / `--kui-control-text`） | `tools/audit-unused.js` B 类 0 ERROR；弹窗真实浏览器核对 |
| 未消费函数 | 9 个函数声明后从未调用 | 删除（control-base / selects / datatable / form / avatar / theme / kui-frame） | `audit-unused` D 类 0 ERROR；`node --check` 全通过 |
| 需要长期防回归 | 无自动检查 | 新增 `tools/audit-unused.js` + npm scripts + smoke `[31]` | ERROR 0 / WARN 0；`npm run audit` 串联通过 |

**回归数字**：`test/run.js` **35/0/0**（Node24 & Node13.14）；`smoke.js` **115/0**；`audit-unused` ERROR 0 / WARN 0；`audit-consistency` 17/0；`audit-components` 19/0；`audit-all-pages` 20/20；`audit-config` 0 缺口；`check-assets` 22/0/0；`check-manual` 0/0；`check-beginner-manual` 0/0；`verify-build` 6/0。

## v1.4.2 表格控件主题化 + 原生控件清零（2026-10-29）

**需求来源**：用户第 34 轮反馈（原生 select / radio / checkbox 截图；选中高亮偶数行失效；选择框样式与表单不一致；测试页未进菜单；要查覆盖率），并要求修复后审计同类问题。

| # | 反馈 | 根因 | 修复 | 验证 |
| --- | --- | --- | --- | --- |
| 1 | 表格筛选 / 每页条数是浏览器原生样式 | `datatable.js` 直接 `el('select')`；`misc.js` 分页 sizer 同样 | 新增 `KUI.dropdown`（core），datatable `themedSelect()` 与分页 sizer 改用主题化下拉，缺内核时回退原生 | 浏览器：展开/选择/KB/点外关闭正常；快照无原生 `<select>` |
| 2 | 表单页 radio / checkbox 呈原生样式 | 6 个页面未引用 `controls.css`（`pages/notify.html`、`standalone/handlers|menu|menunav|tabs|toast.html`） | 补齐 `<link controls.css>` | `pages/notify.html` 下拉/复选主题化截图 |
| 3 | 表格选中高亮偶数行不生效 | 斑马纹 `:nth-child(even)` 优先级高于 `.is-selected`，悬停同理 | 条纹/悬停规则排除 `.is-selected`，选中规则提升特异度 | 选中第 1、2 行均高亮（截图为证） |
| 4 | 表格单选/复选样式应与表单一致 | datatable 自绘 `.kui-datatable__check*` | 改用 `.kui-checkbox` / `.kui-radio` 结构与样式，删除自绘 | 浏览器对比表单页外观一致 |
| 5 | 测试页未集成到菜单；检查覆盖率 | `standalone/boot.html`、`standalone/datatable.html` 未入菜单；无覆盖率工具 | 菜单「观测回廊」+2 项；新增 `tools/coverage.js` + `npm run coverage` | 菜单可见两项；覆盖率 38%（8233/21657） |
| 附 | 分页/工具栏文案显示 `{36}` 残片 | `KUI.fmt` 不认 `{{…}}`，兜底文案普遍双花括号 | `fmt` 同时兼容 `{{a.b}}` 与 `{a}` | 表格文案正常；`test/render.test.js` fmt 用例 |
| 附 | dropdown 锚点无文字 | `syncAnchor()` 首行 `if (!root) return;`，构建期 root 为 null | 改 `if (!anchor) return;` | 列筛选/每页条数按钮文案正常 |
| 6 | 点击行不勾选，且取消高亮后勾选仍在（第 35 轮） | 行点击只改 `activeKey`，勾选与高亮两套状态各自变化；`syncSelectionUi` 仍查旧类名，行/表头选择器不同步 | 有选择列时行点击=勾选切换，高亮统一由 `is-selected` 承担；重写 `syncSelectionUi` 按引用表同步行/表头/包装类 | 单测 4 组 + 浏览器：点击未选行选中、再点取消；表头随行变化三态 |
| 7 | 单选模式多行同时选中 | `syncSelectionUi` 未清其它行单选框与包装类，只有 `is-selected` 跟随 | 按 `rowInputRefs` 全量回写 `checked` 与 `is-checked`，单选取值互斥 | 单测断言同时只有一个 radio 选中；浏览器单选面板仅一行高亮 |
| 8 | 表头复选框与行不联动 | 同上（旧类名查询，表头三态从未更新） | 登记 `headSelectRef`，行变化即刷新全选/半选 | 单测 + 浏览器：全选后取消一行 → 表头半选 |
| 9 | 悬停色不覆盖选中/高亮行 | 悬停规则用 `:not(.is-selected):not(.is-active)` 排除 | 悬停改为 `background-image` 淡色叠加并置于最后，任何状态都生效 | CSS 断言（顺序 + 叠加色）|

**同类问题审计（第 34 轮要求）**：① 全仓 grep 原生 `createElement('select'|'input'|'textarea')` 在 `src/components/**` 的实例 → 结论：表单控件与 select 控件本就走主题化，其余为隐藏 file input（合规）；② 覆盖/特异性扫描所有 `:nth-child` 斑马纹规则 → 仅 datatable 一处；③ 复选框自绘样式扫描 → 仅 datatable 一处已删；④ 双花括号文案 grep → 15 处兜底文案全部经 `fmt` 修复生效；⑤ 页面样式引用完整性 → `check-assets` 新增校验（见 §14）；⑥ 菜单可达性 → 全部独立页/页均可达。

**回归数字**：`test/run.js` **37/0/0**（Node24 & Node13.14）；`smoke.js` **123/0**；`audit-consistency` 17/0；`audit-components` 19/0；`audit-all-pages` 20/20；`audit-config` 0 缺口；`audit-unused` ERROR 0 / WARN 0 / INFO 87；`check-assets` 22/0/0；`check-manual` 0/0；`check-beginner-manual` 0/0；`verify-build` 6/0；覆盖率 45.6%（9867/21657 行，38 文件）。

## v1.4.3 验收记录（表格行悬停与偶数行状态修复）

**反馈**：① 鼠标悬浮在偶数行不生效（旧问题复发）；② 悬停淡色太淡，与表格背景区分不开。

| 编号 | 反馈 | 根因 | 修复 | 验证 |
| --- | --- | --- | --- | --- |
| 1 | 偶数行悬停/选中状态异常 | 条纹规则特异度高于状态规则：偶数行选中底色被覆盖；状态与悬停混用 `background` 简写 | 条纹规则 `:not(.is-selected):not(.is-active)`；状态用 `background-color`、悬停用 `background-image` | `test/render.test.js` + `smoke [32.5]/[32.9]`；真实浏览器像素采样偶数选中行 `R=120`、奇数选中 `R=101` |
| 2 | 悬停色过淡 | 悬停叠色为不透明深灰，且亮色主题无对应叠色 | 新增 scheme 级 `--kui-dt-hover-overlay`（暗 0.14 白 / 亮 0.10 黑）与 `--kui-dt-hover-selected`（accent 0.16） | `smoke [32.10]` 断言 token 与 scheme；像素采样未选中行悬停提亮 |

**回归数字**：`test/run.js` 37/0/0（Node24 & Node13.14）；`smoke.js` 125/0；`check-assets` 22/0/0；`audit-consistency` 17/0；`audit-components` 19/0；`audit-all-pages` 20/20；`audit-config` 0 缺口；`audit-unused` ERROR 0 / WARN 0 / INFO 87；`verify-build` 6/0；`check-manual` 0/0；`check-beginner-manual` 0/0。


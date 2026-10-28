## v1.3.8 — 配置接线修复 + 配置读取点一致性审计

> 需求（用户）：「接线缺口：app.json 的 boot 段运行时完全不生效。是否有配置字段无读取点，配置也不生效的。
> 修复一下，修复完成后审计一下代码，查看是否有类似缺陷。」

### 一、boot 段接线（主修复）

| 项 | 实现 |
| --- | --- |
| 接线点 | `src/app/bootstrap.js` 新增 `applyBootConfig(appCfg, textCfg)`，在 `boot()` 的 `i18n.set` 之后调用 |
| 应用 | `configureBootLayer` → `KUI.bootLayer.configure(bootConfigOf(appCfg) \|\| {}, textCfg.boot)` |
| 关闭开关 | `boot.enabled === false`：不创建启动层，已有实例 `destroy()` |
| 可核对 | `KUI.boot.appliedBootConfig`（应用后的配置快照） |
| legacy | `app.app.loading` 映射到 `bootConfigOf` 的旧分支，仍兼容 v1.3.6 写法 |

### 二、同类「配置无读取点」缺陷（审计发现并修复）

| 字段 | 缺陷 | 修复 |
| --- | --- | --- |
| `app.app.version / logoIcon / logoText / copyright`、`menu.props.brand.logoText`、`menu.props.footer.subtitle / copyright` | 文档承诺可配，源码无渲染点 | `applyAppMeta` 注入默认值 + `menu.js` 渲染 `logoText` / `footer.subtitle` / `footer.copyright` + `components.css` 样式 |
| `theme.picker.title / desc / columns / maskClosable / showPreview / showScheme` | 选择器写死 `KUI.text` 与 3 列布局 | `openThemePicker` / `buildThemePickerNodes` 读取配置 |
| `ui.dialog.escClosable` | 只认 `closeOnEsc` | `dialog.config()` 别名映射 |
| `boot.clock.smooth` | 仅默认值，无消费 | 写 `data-boot-smooth`，CSS 控制指针过渡 |
| `tabs.props.keepAlive` | 声明但从未使用 | `false` 时切回重建 iframe |
| `dialog.config()` | 深合并结果未写回 DEFAULTS，`ui.dialog.*` 不生效 | 回写 |
| 容器节点 `class / style / attrs` | 无 `type` 的容器分支丢弃 style/attrs，`theme.picker.columns` 视觉无效 | `KUI.renderNode` 容器分支统一 `decorate()` |
| 弹窗 `subtitle` | `dialog-frame` 从未渲染，`theme.picker.desc` 恒定丢失 | 新增 `renderSubtitle()` 与 `.kui-dialog__subtitle` 样式 |

### 三、新增审计工具 `tools/audit-config.js`

- 静态核对 `config/app.json` 的 468 个叶子键在 `src/**/*.js` 是否有属性读取点；动态数据白名单 37 项，待核对 431 项；
- 命令：`node tools/audit-config.js`（`npm run audit:config`），有缺口时退出码 1；结果 **0 缺口**。

### 四、测试与验收

- `tools/smoke.js` 新增 `[28]` 五组断言（boot 应用 / enabled:false 销毁 / app.* 注入 / 菜单渲染 / keepAlive 行为），**104 / 0**；
- `test/render.test.js` 新增 keepAlive 用例（**9 / 0**）；`test/config.test.js` 新增用例 5（**5 / 0**）；
- `test/run.js` **32 / 0 / 0**；`audit-consistency` 17/0；`audit-components` 19/0；`audit-all-pages` 19/19；`check-assets` 21 HTML 0/0；`check-manual` 0 错 0 警。

### 五、文档与版本

- 契约 [`docs/00-contract.md`](docs/00-contract.md) 新增 §20.4「配置接通性修复」，并修正 §20 实例 API 列表；
- 配置参考 §1.8 / §3.6 / §3.5 补接线说明；设计与验收见 [`docs/08-acceptance.md`](docs/08-acceptance.md)；
- 手册 16 章 §5.5 改写为「历史缺陷 + v1.3.8 修复」，04/08/15 章同步；
- 版本四处统一 1.3.8：`package.json`、`src/core/kui.js`、`src/frame/kui-frame.js`、`src/core/dom-enhance.js`。

## v1.3.7 — 加载层组件化（boot）+ 时钟指针进度动画

> 需求（用户）："访问服务时或刷新时的 加载中 页面，也需要可以单独 自由拆卸、组装，且 时钟图案 增加一项 时钟指针动画，
> 加载进度 0% 至 100% 分别对应时钟的 0 时至 12 时，要注意时钟的时针和分针的指向位置。还需要一个单独的测试页面，观察效果。"

### 一、新增组件：`src/components/boot.js` + `src/styles/boot.css`

| 能力 | 实现 |
| --- | --- |
| 注册 | `type: "boot"`（`category: "shell"`），`KUI.mount("boot", host, node)` / `KUI.renderNode({type:"boot"})` 均可渲染 |
| 静态 API | `KUI.bootLayer`：`create` / `attach` / `configure` / `instance` / `handsAt` / `isReady` |
| 实例 API | `setProgress` / `setStep` / `setText` / `setMeta` / `done` / `error` / `reset` / `show` / `hide` / `destroy` / `getState` |
| 单例接管 | `attach()` 直接接管 `index.html` 既有 `#kui-boot`，只重建内部结构（不闪一下白屏） |
| 可拆装 | `boot.js` 缺失时 `bootstrap.js` 退回静态骨架 legacy 分支；`standalone/boot.html` 可内嵌 `mode:"inline"` 独立渲染 |

### 二、时钟指针动画（进度 ↔ 时刻）

- `handsAt(percent)` 纯函数：总分钟 `p/100*720`；时针 `总分钟/720*360`（连续走）；分针 `(总分钟%60)/60*360`；
- `0%` 与 `100%` 均为 12 点整（读数统一 `12:00`），`25% → 3:00`、`50% → 6:00`、`75% → 9:00`；
- 钟面 12 刻度 + 红时针 / 金分针，颜色全部走主题 token（随换肤变化）；
- `clock.mode` 支持 `progress`（默认）/ `spin`（匀速自转）/ `none`；`clock.smooth` 控制过渡动画。

### 三、配置与文案（纯 JSON，无代码）

- `config/app.json` 新增 `boot` 段：`enabled / mode / meta / text / stages / clock / bar`；
- `config/text.json` 新增 `boot` 段（加载层阶段文案，可由 app.json `text` 覆盖）；
- 默认 4 阶段：`8% 正在加载界面配置…` → `46% 正在应用界面风格…` → `78% 正在构建界面…` → `100% 结界已就绪`。

### 四、接线与构建

- `index.html`：内联启动层样式抽到 `src/styles/boot.css`，静态骨架 `#kui-boot` 保留作降级；
- `src/app/bootstrap.js`：`ensureBootLayer()` + `setBootText/setBootStep/hideBoot/showBootError` 委派组件；`applyAppMeta` 同步 `setMeta`；
- `config/kui-modules.json`：app / standalone 两个 profile 均加入 `boot.js`（app=29 / standalone=28）；
- 版本号四处统一 **1.3.7**：`src/core/kui.js`、`src/frame/kui-frame.js`、`src/core/dom-enhance.js`、`package.json`。

### 五、验证

- 冒烟新增 **[27] 加载层组件** 5 项（注册与静态 API / handsAt 六采样 / create 内嵌实例 / attach 接管与 legacy 降级 / 独立页）；
- `audit-components` 新增 boot 拆装用例（19 项通过）；`check-assets` 21 个 HTML 0 错 0 警；
- 全量：`tools/smoke.js` **99/0**、`test/run.js` **30/0/0**（Node 13.14 / 24）、`audit-consistency` 17/0；
- 真实 Chromium 截图核对 `standalone/boot.html` 的内嵌 / 全屏两种模式与 0→100 指针走位。

---

## 文档 — 用户手册 `docs/manual/`（v1.3.6 基线，2026-10-27）

> 需求（用户）："写项目用户手册"。产出面向使用者的完整手册，并附一个可自动校验的手册一致性脚本，防止文档与源码漂移。

### 一、手册本体（16 文件 / 15 章 / 约 37 万字）

| 部分 | 章节 | 内容 |
| --- | --- | --- |
| 一、快速上手 | `01-install` `02-build` | 克隆/启动/file:// 模式、构建链路（`build-config` → `bundle.js`、`build-all` → `kui-all.js`）、开发/生产模式 |
| 二、组装与配置 | `03-assembly` `04-config-app` | 页面零件与拆装、`app.json` 全字段（菜单/标签/导航/壳/动作/弹窗/提醒） |
| 三、组件与交互 | `05–08` `10` `11` | 输入控件、展示控件、表单引擎（`deps` 联动/校验/提交）、7 个组件、动作与业务函数、API 与消息 |
| 四、主题与扩展 | `09` `12` | 6 套主题与 token、换肤、加控件/加页面/加业务函数的扩展路径 |
| 五、实战与部署 | `13` `14` | 从零做一个业务页（案例）、静态部署与跨项目复用 |
| 六、维护 | `15` | 故障排查表、上线前验收清单 |

每章带元信息行（适用版本 / 前置章节 / 阅读时长）、「本章自检」与「参考源码」；`docs/manual/README.md` 提供 5 条阅读路线与索引。

### 二、手册校验脚本 `tools/check-manual.js`

零依赖、Node 13.14 可运行，`npm run check:manual` 调用；12 组校验：

1. 章节文件完整性与编号唯一；2. 元信息行与必备小节；3. 所有 `json` 代码块可 `JSON.parse`；4. 示例节点 `type` 属于运行时 40 个注册类型；5. 示例 `action` 属于 28 个内置动作；6. 反引号内 `scope.name` 业务函数存在；7. `KUI.x.y` 可在运行时对象解析；8. 章内链接目标存在；9. **数量口径**（40 类型 / 19 表单控件 / 28 动作 / 61 业务函数 / 6 主题）与运行时枚举一致；10. 版本号统一为 1.3.6；11. README 索引覆盖全部章节；12. 章节体量下限。

支持 `--json` / `--strict` / `--quiet` / `--help`；末次运行：**0 错误 / 0 警告**。

### 三、入口接线

- `package.json`：新增 `check:manual`；
- `README.md`：新增「一点六、使用手册」章节、「九、测试与兼容」补命令、「十、目录结构」补 `docs/manual/`。

---

## v1.3.6 — 菜单搜索多结果候选 + 遗留建议收口

> 反馈（用户）："1、把遗留建议中需要修复的先修复完成\n2、菜单搜索时，模糊搜索时可能会匹配多个菜单，目前是 回车打开首个匹配到的，应 调整为 先展示所有匹配到的菜单名称，然后 选择打开指定菜单"。

### 一、菜单搜索：多结果先展示、再选择（`src/app/bootstrap.js`）

| 能力 | 实现 |
| --- | --- |
| 全路径匹配 | 新增 `flattenMenuWithPath()`，候选显示为 `父分组 / 子分组 / 菜单名` |
| 6 档评分 | `scoreMenu()`：精确 100 / label 前缀 90 / 路径前缀 80 / label 包含 70 / 任意字段包含 55 / 子序列 30 |
| 排序 | `searchMenu()`：score 降序，同分按路径 `localeCompare` |
| 0/1/多 结果 | 0 → 提醒；1 → 直接打开（保留快捷）；**多 → 弹出候选列表**，由用户点选 |
| 候选弹窗 | `showSearchPicker()`：`KUI.dialog.custom({ id: 'search-picker', title: '选择要打开的菜单' })`，最多 10 项、超出提示剩余数量；按钮 = 完整父路径 |
| 编程接口 | 新动作 `app.openSearchById`；`KUI.search = { menu(kw), open(id), picker(kw, matches) }` |

### 二、遗留建议收口（docs/10 §7）

| # | 遗留项 | 处置 |
| --- | --- | --- |
| R1 | `test/config.test.js` 显式断言控件类型数量（历史值） | ✅ 改为「注册表派生 ↔ 常量清单双向比对」：`test/load-kui.js` 新增 `controlTypes()`，用例 4 用 `deepStrictEqual`；审计新增 E4 静态扫描（支持 `KUI.controls.define()` 封装与 `registry.register()` 两种写法） |
| R2 | 冒烟 90 项需分节执行 | ✅ `tools/smoke.js` 支持 `--only=list` / `--only=13,17`（断言级过滤，初始化仍完整执行）+ 汇总打印跳过数；新增 `[26] 菜单搜索` 4 项断言 |
| R3 | `dialog-frame.html` 为唯一显式脚本清单 | 保持（有意：弹窗是独立精简文档），审计 D2 已固定期望清单，加模块需同步 |
| R4 | 视觉类需真实浏览器确认 | 保持：本轮已用 REA Chromium 探针验证候选弹窗与点选链路 |

### 三、健壮性修复

- `src/components/dialog.js`：`lockBody()/unlockBody()` 的 `document.body` 访问加空值守卫 —— 关闭动画的 `setTimeout` 可能在宿主已销毁（测试 dom-stub / iframe 卸载）后触发，此前会在定时器里抛未捕获异常（`--only` 分节执行时暴露）。

### 四、验证

| 检查 | 结果 |
| --- | --- |
| 冒烟 `node tools/smoke.js` | **94 / 0**（Node 24 与 Node 13.14 各一次）；`--only=26` → 5 / 0 |
| 测试 `node test/run.js` | **30 / 0 / 0**（Node 24 2070ms、Node 13.14 5198ms） |
| 一致性审计 | **17 / 0 / 0**（E4 已转 PASS） |
| 组件拆装审计 | **17 / 0** |
| 全页面巡检 | **18 / 18** |
| 资源引用 | **20 HTML / 0 错 0 警** |
| 真实 Chromium（v1.3.6） | `A1 kw=表单 hits=2`（[90] 灵装回路/表单联动、[70] 时间中枢/业务结界/灵装表单）；`B4 title=选择要打开的菜单`、`B3` 候选按钮 2 个；点选后 `C1 tabs` 新增「表单联动」、`C2 active=form-lab`、`C3 pickerClosed=true` |

### 五、升级提示

无破坏性变更：搜索入口（顶部导航「搜索」/ `search.toggle` 动作）行为增强 —— 单结果仍直接打开，多结果改为候选选择。

### 六、仓库工程化（Git 初始化 / 只追踪源码 / README 构建流程）

| 项 | 结果 |
| --- | --- |
| 仓库初始化 | `git init -b main`，首次提交 **116 个文件 / 2.3 MB**；远端 `git@github.com:SuLiyue-s/KurumiUI.git` |
| 只追踪源码 | `config/bundle.js`、`src/core/kui-all.js` 入 `.gitignore`（由 `npm run build` 生成）；`.tools/`（本机 Node13 工具链、探针与一次性补丁脚本）与 `.shots/` 不入库 |
| 审计脚本迁移 | `.tools/audit-*.js` → `tools/audit-*.js`（否则会被 `.gitignore` 忽略），同步 `package.json` 的 `audit` 脚本与 README / docs 引用 |
| README 构建流程 | 新增「构建与发布（源码 → 生产代码）」：源码/产物对照、`npm run build` 一键构建、开发 vs 生产模式、三种部署方式、发布前验收命令、改配置/加模块/升版本的正确姿势、常见坑、SSH 443 说明 |
| 测试兼容 | `compat: Node 13.14 可执行文件存在` 改为可选用例：本地无 `.tools/` Node13 时跳过（新克隆 29 通过 / 0 失败 / 1 跳过；含工具链时仍 30 / 0 / 0） |
| 全新克隆验证 | clone → `npm run build` → 生成 `config/bundle.js`(112 KB) 与 `src/core/kui-all.js`(4 KB) → `test` 29/0/1、一致性审计 17/0/0 全绿 |
| 推送通道 | 本机 22 端口被拦，`core.sshCommand` 走 `ssh.github.com:443`（仅本地 `.git/config`，不入库；远程 URL 仍为用户给定的 SSH 地址） |
---

## v1.3.5 — 源码 ↔ 测试一致性审计 + 组件可拆装审计

> 反馈（用户）："审计检查源码和测试用的代码是否一致；检查各部件是否都可以随意拆卸、组装，是否符合项目要求；对最终检查的问题需要修复的修复，最后给我一份报告"。

### 发现并修复的 4 个问题

1. **测试加载清单手写、已与源码脱节（严重）**：`test/load-kui.js` 的 `CORE_FILES` / `COMPONENT_FILES` 是手写清单，
   只覆盖 6 个 core 文件，缺少 `tooltip.js` / `diag.js` / `handlers.js` / `dom-enhance.js` / `avatar.js`。
   → 测试跑的是「残缺运行时」，测试全绿不代表线上行为。
   **修复**：重写为**从 `config/kui-modules.json` 派生**（与线上下发的 `src/core/kui-all.js` 同一事实来源），
   控件子文件按 `KUI.controls.files` 串行加载；加载数 20 → **28**，注册表 39 → **40** 类型。
2. **版本号不一致**：`package.json` version 仍为 `1.0.0`，而 `KUI.version` 已到 1.3.4 → 同步为 **1.3.5**。
3. **审计脚本自身写错**：原期望 `dialog-frame.html` 引 `handlers.js`；实际弹窗是独立精简文档，
   只需 tooltip / dom-enhance / controls / form，业务函数由父页执行（弹窗侧只做动作转发）→ 已更正。
4. **冒烟断言写死版本号**：`[24.1]` 断言 `KUI.version === '1.3.4'`，每次升版都要改测试 → 改为格式断言，
   版本正确性交给新增的 `[25.1]`「四处版本一致」检查。

### 新增审计工具（入库，可一键复跑）

| 脚本 | 职责 | 结果 |
| --- | --- | --- |
| `.tools/audit-consistency.js` | 源码 ↔ 测试 ↔ 构建产物（清单 / kui-all / 版本 / HTML 单入口 / dialog-frame / 加载器 / 断言） | **16 / 0 / 0** |
| `.tools/audit-components.js` | 组件拆解（最小模块集）+ 组装（注册表裸挂载）+ 独立页 + 依赖边界 | **17 / 0** |

`package.json` 新增：`npm run audit` / `npm run audit:consistency` / `npm run audit:components`。

### 组件矩阵（审计结果）

- 拆解：menu / menunav / tabs / dialog / toast / form / app-shell **7 / 7** 可在最小模块集下独立渲染；
- 组装：注册表 **34 / 34** 类型可裸挂载；总计 **40 个类型 / 8 个分类**；
- 独立渲染页：**11 / 11** 可单独打开且不生成整壳；其中 8 页 JSON 驱动；
- 依赖边界：5 个组件文件在顶层不硬依赖 `KUI.app` / `KUI.boot`。

### 冒烟新增 [25]（3 项）

`[25.1]` 版本四处一致（KUI.version / package.json / kui-frame fallback / dom-enhance VERSION）；
`[25.2]` `kui-all.js` 由清单派生且覆盖 app profile 全部 28 个模块；
`[25.3]` 19 个 HTML 全部为单入口装配（含 kui-all + theme-boot）。

### 回归

- 冒烟 **90 / 0**（Node 24 与 Node 13.14 各一次）
- 测试 **30 / 0 / 0**（Node 24 2084ms / Node 13.14 5107ms）
- `check-assets.js` **20 HTML 0 错 0 警**；`audit-all-pages.js` **18 / 18**

### 报告

完整审计报告：`docs/10-audit-report.md`（含问题清单、一致性矩阵、拆装矩阵、修复清单、遗留建议）。

## v1.3.4 — 悬浮提示文案随状态实时更新

> 反馈（用户）："当菜单收起时，菜单区域的展开按钮的图标有变化了，但是提示文案仍然是 收起。检查其他区域是否也有此类问题，一并修复"。

### 根因（`src/core/tooltip.js` 两处）

1. `textOf()` 只在 `data-kui-tip-source === 'title'` 时才读最新 `title`；而 `hide()` → `restore()` 会把 `title` 写回并**删掉 source 标记、却保留旧的 `data-kui-tip`** —— 组件之后再次改写 `.title` 时，旧 `data-kui-tip` 依旧优先，文案永远停在旧值。
2. 提示**正在显示**时，组件改写 `title` 没有任何刷新机制（要等移开再悬浮一次）。

### 修复
- `KUI.setStyle` 支持驼峰键（`gridTemplateColumns` → `grid-template-columns`）：此前 `CSSStyleDeclaration.setProperty` 静默忽略驼峰键，容器内联样式失效（主题选择器 6 卡变 1 列、卡片边框色丢失）。

- `textOf()`：以「当前 `title`」为最高优先级，同步写入 `data-kui-tip` 后删除 `title`；
- `restore()`：还原 `title` 时一并清掉临时 `data-kui-tip`，杜绝残留旧文案；
- 新增 `watchTarget()/stopWatch()`：提示显示期间用 `MutationObserver`（`title`/`data-kui-tip`/`data-kui-tip-disabled`）监听变化，实时更新文字并重新定位；
- 对外新增 `KUI.tooltip.update(el)`：组件改完标签可立即刷新，不依赖下一次悬浮；
- `KUI.tooltip.version` 1.0.5 → **1.0.6**；`KUI.version` 1.3.3 → **1.3.4**。

### 覆盖范围（同一路径，自动全部生效）

经审计全部 `.title =` 赋值点：菜单折叠按钮（「收起/展开时间枢纽」）、顶部导航折叠按钮（「收起/展开菜单」）、全屏按钮（「全屏/退出全屏」）、菜单项标签、标签页标题 —— 都走「改 `title`」这一条路径，修 tooltip 即一次性覆盖。

### 验证（真实 Chromium 156.0.4314.42，探针 `.tools/probe-tooltip.html`）

| 场景 | 结果 |
| --- | --- |
| 展开态首次悬浮 | `收起时间枢纽`（visible） |
| 点击折叠后再次悬浮 | **`展开时间枢纽`** ✔（原 bug 复现点） |
| 提示显示中直接改 `title` | **`测试文案-实时刷新`** ✔（MutationObserver 生效） |
| 导航栏折叠按钮 | `展开菜单` ✔ |

### 回归

- `tools/smoke.js` **87/0**（Node 24 与 Node 13.14 各一次，新增 `[24]` 2 项）；
- `test/run.js` **30/0/0**（Node24 2178ms / Node13.14 5454ms）；
- `tools/check-assets.js` 20 个 HTML **0 错 0 警**；全页面注册审计 **18/18**。

### 升级提示

强刷（Ctrl+Shift+R）后：悬停菜单折叠按钮 → 点击收起 → 再悬停，提示应变为「展开时间枢纽」；顶部导航折叠按钮、全屏按钮同理。

## v1.3.3 — 菜单底部三控件挤占修复

> 反馈（用户）："如图，菜单区域下方的三个控件 互相挤占，导致显示不全，需要修复"。

### 根因

1. `.kui-menu__footer` 是**单行 flex（nowrap）**：`footer-title`（flex: 1 1 auto）、`footer-version`、`footer-actions`（margin-left: auto）三者抢同一条宽度；
2. `config/app.json` 的 footer 按钮用了 `block: true`，生成 `.kui-btn--block { width: 100% }`，在单行 flex 里直接撑爆，把 title / version 挤掉；
3. 折叠态（68px）下 footer 按钮仍显示文字，同样溢出。

### 修复（`src/styles/components.css`）

- `.kui-menu__footer`：`flex-wrap: wrap; row-gap: 6px;`；
- `.kui-menu__footer-title`：`order: 1; flex: 1 1 100%;`（独占第一行）；
- `.kui-menu__footer-version`：`order: 2;`；`.kui-menu__footer-actions`：`order: 3; max-width: 100%;`；
- 新增 footer 按钮覆盖块：`.kui-menu__footer-actions .kui-btn { display:inline-flex; flex:0 1 auto; width:auto; max-width:100%; min-width:0; height:24px; padding:0 8px; gap:4px; font-size: var(--kui-fs-xs); }`，文字 `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`，图标 14×14；
- 折叠态：按钮只剩 24×24 图标，`.kui-btn__text { display: none }`。

> 说明：`block: true` 类名保留（语义不变），由 footer 作用域内的 CSS 覆盖宽度，避免影响其它位置的「块级按钮」。

### 验证（真实 Chromium 156.0.4314.42，探针 `.tools/probe-footer3.html`）

| 状态 | footer | title | version | 按钮 | 溢出 |
| --- | --- | --- | --- | --- | --- |
| 展开（252px） | 250×65（两行） | 226×18「灵装回路」完整 | 67×22「KurumiUI」 | 103×24「切换灵装主题」 | none |
| 折叠（68px） | 67×44 | 隐藏 | 隐藏 | 24×24（仅图标） | none |

### 回归

- `tools/smoke.js` **85 / 0**（Node 24 与 Node 13.14），新增 `[23]` 3 项断言（两行布局 CSS、按钮宽度覆盖、运行期 footer 结构）；
- `test/run.js` **30 / 0 / 0**（Node 24 1989ms、Node 13.14 5096ms）；
- `tools/check-assets.js` 20 HTML 0 错 0 警；`.tools/audit-all-pages.js` 18/18；`check-compat` PASS。

### 升级提示

只改了 CSS（`src/styles/components.css`），无配置与 API 变化；强刷即可生效。版本号 1.3.2 → 1.3.3。

---

## v1.3.2（齿轮转速可配置）

### 一、用户反馈

头像的刻刻帝齿轮缓慢旋转，需要一项配置来控制速度。

### 二、修复

- `src/styles/avatar.css`：旋转动画改为 `animation: kui-avatar-spin var(--kui-avatar-spin-duration, 48s) linear infinite var(--kui-avatar-spin-direction, normal);`。
- `src/core/avatar.js`：
  - `frame.spinDuration`（秒/圈，默认 `48`）：数字越小越快；`0` 停转；负数反向；`animated:false` 仍可整段关闭动画。
  - 新增 `applySpin()`：按配置写入 CSS 变量并切换 `.kui-avatar--animated`；`renderRing()` 自动调用（主题切换、setUrl、refresh 后保持不变）。
  - 实例 API 新增 `setSpinDuration(sec)` / `getSpinDuration()`，可运行时调速。
  - 注册表默认值同步 `frame.spinDuration: 48`，JSON 直接 `{"type":"avatar","props":{"frame":{"spinDuration":12}}}` 生效。
- `config/app.json`：`avatar.frame.spinDuration: 48`。
- `config/demos/avatar.json`：新增「五、齿轮转速」分组（6 / 48 / 120 / 0 / -12 五档）。
- `standalone/avatar.html`：交互测试台新增「齿轮转快 / 48s / 转慢 / 暂停 / 读取齿轮转速」按钮。

### 三、验证

- `tools/smoke.js` 新增 `[22]` 3 项断言（CSS 变量、默认值/API/注册表、demo 与测试按钮）→ **82 / 0**（Node 24 与 Node 13.14 各一次）。
- `test/run.js` **30 / 0 / 0**（双 Node）；`check-assets.js` 20 HTML 0 错 0 警；全页面审计 18/18。
- 真实 Chromium：`spinDuration:6` 的齿轮 `animationDuration=6s`；`48` 为 `48s`；`0` 时无动画类；`setSpinDuration(12)` 即时变为 `12s`。

### 四、升级提示

1. 强刷后默认转速与之前一致（48 秒/圈）。
2. 想更快/更慢：改 `config/app.json → avatar.frame.spinDuration`（例如 `12`），或运行时 `KUI.avatar.create(...).setSpinDuration(12)`。

## v1.3.1（头像框裁切修复 + 头像更换方式可选）

### 一、用户反馈

1. 菜单左上角头像展示不全：头像被裁成方形，齿轮框只露出一角。
2. 需要新增配置项，控制「点击更换头像」时是**上传本地图片文件**还是**输入图片 URL**。

### 二、根因

1. `.kui-menu__logo` 自带斜切角 `clip-path: polygon(...)`（品牌图标的 HUD 造型）；
   `.kui-menu__logo--avatar` 只重置了背景/边框/阴影，**没有重置 `clip-path`**。
   而齿轮框比头像大 5px（`inset:-5px`）→ 外圈被父级斜切矩形裁掉。
2. 更换头像此前只有 URL 输入一种方式，没有配置项可切换。

### 三、修复

- `src/styles/avatar.css`：`.kui-menu__logo--avatar` 增加 `clip-path: none !important; overflow: visible;`。
- `src/core/avatar.js`：
  - `DEFAULTS.picker` 新增 `mode: 'url'`（`url` | `file`）、`accept: 'image/*'`、`maxSizeMB: 2` 与中英文案（`fileLabel / fileTip / fileErrorType / fileErrorSize / fileErrorRead`）。
  - `openPicker(override)` 按 `picker.mode` 分流：`file` 走新增的 `pickFile()`（隐藏 `<input type=file>` + MIME/体积校验 + `FileReader` 转 dataURL + 取消检测），其余走原“URL 输入 + 预设 + 清除”弹窗。
  - 实例 API 增加 `pickFile(override)`，可在运行时强制指定方式。
- `config/app.json`：`avatar.picker` 显式写入 `mode / accept / maxSizeMB`。
- `standalone/avatar.html`：新增两个测试按钮「更换头像（URL 弹窗 · mode=url）」与「更换头像（本地图片 · mode=file）」。

### 四、验证

- 真实 Chromium（REA Playwright，156.0.4314.42）：
  - 菜单品牌区 `clip-path: none`、`overflow: visible`；头像 42×42、齿轮框 rect 超出原 logo 矩形 → 不再被裁。
  - `mode=file` 端到端：合成 change 事件（175 字节 PNG）→ 应用为 dataURL → 齿轮框仍在 → Promise resolve 出 url。
  - `mode=url`：弹出 URL 弹窗，关闭后状态正确。
- `tools/smoke.js` 新增 `[21]` 3 项断言 → **79 / 0**（Node 24 与 Node 13.14 各一次）。
- `test/run.js` **30 / 0 / 0**（双 Node）；`check-assets.js` 20 HTML 0 错 0 警。

### 五、升级提示

1. 强刷（Ctrl+Shift+R）；菜单头像会重新渲染为完整圆形齿轮框。
2. 若要改成上传本地图片：把 `config/app.json` 的 `avatar.picker.mode` 改为 `"file"`（可用 `accept` 限制类型、`maxSizeMB` 限制体积）。
3. 本地文件方式会把图片转成 dataURL 写入 localStorage（默认键 `kui-avatar`），大图可能超出配额——超过 1MB 会有提示；需要长期保存建议改用 URL。

## v1.3.0 — 表单必填体系与弹层点外关闭

### 用户反馈

> 1、表单中，部分未设置必填的选项，却显示星号，需要修复
> 2、表单中，需要增加 多个输入框填写其中一个 的必填规则……
> 3、表单中，不显示的 输入框不应该校验必填规则，检查一下是否存在问题
> 4、表单中，单项选择，复选框，也 需要有必填校验规则
> 5、所有点击元素的弹出的框（例如下拉选择的列表框）、标签处右键弹出的框，此类的框 在点击到框外的区域时 应关闭
> 6、当菜单收起时，展开按钮的图标有变化了，但是提示文案仍然是 收起

### 修复

| # | 根因 | 修复 |
| --- | --- | --- |
| 1 | `createField()` 给所有带 label 的字段无条件插 `*`，`controls.css` 全项目没有「默认隐藏、required 才显示」规则 | CSS 规则：`.kui-field__required{display:none}` + `.kui-field.is-required:not(.is-required-optional) .kui-field__required{display:inline-block}`；`createField`/`setRequired` 维护 `is-required-optional` |
| 2 | form.js 只有单字段 required | 节点级 `requiredAny: [id...]` 必填组：组内全空 → 全部标记必填并报「请至少填写其中一项」；填任一 → 其余成员解除必填（星号同步消失），`requiredAnyMessage` 可自定义文案 |
| 3 | `validateField()` 不判隐藏；dialog-frame fallback 分支同样不判 | `validateField` 开头 `if (isInvisible(rec)) return {valid:true}`；dialog-frame 侧同步 |
| 4 | 单选/复选走默认校验可用，但 `switch` 的 `false` 被当成非空 → 必填失效 | `emptyValue(false) === true`；补 `radio/radio-group/checkbox/checkbox-group/switch` 必填回归用例 |
| 5 | 弹层只监听 `document mousedown`：点击父级 UI / 其它 iframe 时收不到；select 触发器「mousedown 关闭 → click 重开」竞态 | `popup._lastClosed`（300ms 同锚点守卫）+ `window blur` + `document focusout`（焦点离开文档）关闭；tabs 右键菜单补 `window blur`（原有 mousedown/Esc/focusin） |
| 6 | tooltip 首次悬浮把 `title` 搬到 `data-kui-tip` 并缓存；组件后续改 `.title` 时读到旧缓存 | `textOf()`：`data-kui-tip-source==="title"` 时以最新 `title` 为准并同步缓存；menu/menunav 改文案后 tooltip 立即更新（实测收起后显示「展开时间枢纽」） |

### 新增能力

- 表单：`requiredAny` 必填组（多填一）、隐藏字段跳过校验、单选/复选/开关必填；`docs/02-config-reference.md` 已补字段说明。
- 弹层：点外部（含父级 UI / 切 iframe / 窗口失焦 / 焦点离开文档）自动关闭；select 关闭后 300ms 内不会被同一次点击重新打开。
- tooltip：文案跟随 `title` 实时变化。

### 验证

- 新增 `tools/smoke.js` `[20]` 段：静态（星号 CSS、requiredAny、隐藏不校验、弹层守卫、tooltip 同步、版本号）+ 运行时（表单必填组/单选/复选/开关组合校验 6 个场景）。
- 新增 `.tools/probe-form3.js`（dom-stub）**6/6**；真实 Chromium（REA Playwright 156.0.4314.42）实测：下拉弹层打开 ✔ / iframe 内点空白关闭 ✔ / 点父级 UI（窗口失焦）关闭 ✔；标签右键菜单打开 ✔ / 点外关闭 ✔ / 窗口失焦关闭 ✔；菜单收起后 tooltip 文案 = **「展开时间枢纽」** ✔。
- 回归：`node tools/smoke.js` **76/0**（Node24 / Node13.14 各一次）、`node test/run.js` **30/0/0**（双版本）、`tools/check-assets.js` **20 HTML 0 错误 0 警告**。

### 升级提示

- 版本号 `KUI.version = "1.3.0"`；强刷（Ctrl+Shift+R）后生效。

## v1.2.1 — 修复「弹窗空白 / 底部按钮无反应 / 输入卡死」的真实根因

### 用户反馈

> 弹窗内的按钮按了仍无任何反应；弹窗中的输入框，点击后输入文字，仍会导致整个浏览器卡死

### 根因

`KUI.dialog.form({ onSubmit })` / `KUI.dialog.custom({ onSubmit })` 会把回调函数留在 config 中；
`src/components/dialog.js` 的 `sendInit()` 原先只 `delete` 了 5 个已知回调名，
其余函数随 `postMessage` 发送时抛 `DataCloneError`，被 `safe()` 静默吞掉 →
父页面永远发不出 `dialog:init` → 弹窗 iframe 每 700ms 重发一次 `dialog:ready`，
第 6 次触发熔断（控制台可见「dialog ready 次数异常（6 次），已停止重复初始化」）→
表现为**弹窗空白、底部按钮无反应、聚焦输入卡死**。这也是「换浏览器仍复现」的原因：与缓存无关。

### 修复

- `src/components/dialog.js`：新增 `sanitizeForPost(value, depth, seen)`，递归剔除函数 / symbol / undefined / bigint / DOM 节点 / 循环引用（深度上限 12，`Date` 原样保留）；`sendInit()` 改用 `sanitizeForPost(deepMerge({}, rec.config))`。
- `postTo()` 用 `safe()` 取返回值，失败时 `KUI.warnOnce('dialog-post-failed:' + type, …)` 明确告警，不再静默。
- `src/core/avatar.js`：头像更换弹窗改为 `KUI.dialog.form(...).then(data => …)` 应用结果（不再把 `onSubmit` 塞进 config）。
- 版本 `1.2.1`。

### 验证

- 真实 Chromium 探针：`standalone/dialog.html` 打开「时之低语」prompt → 弹窗正文、输入框、`取消/记录` 两按钮齐全；再打开「灵装回路配置」form → footer 两按钮渲染。
- 回归：`smoke.js` **74/0**、`test/run.js` **30/0/0**（双 Node）、`check-assets.js` 20 HTML 0 错 0 警。

## v1.2.0 — 头像自定义 + 刻刻帝时间齿轮头像框

### 新能力

- **配置 JSON 传入头像 URL**：`config/app.json` 顶层 `avatar`；也支持放在 `menu.props.brand.avatar`，或作为普通控件 `{ "type": "avatar", "props": { … } }`。
- **`editable` 控制渲染后能否点击头像更换**：点击弹出更换弹窗（URL 输入 + 内置预设 + 清除），关闭/取消不改动原头像。
- **设置头像后绘制「刻刻帝时间齿轮」头像框**：SVG 齿轮 + 12 道刻度（每 3 道主刻度）+ 时针/分针 + 中心指针，可选漫游动画。
- **头像框颜色全部来自主题 token**（`--kui-accent-2`、`--kui-accent`、`--kui-accent-glow`）：切换主题时头像框跟随变色；**头像图片本身不随主题变化**。
- 未设置头像时回退为品牌图标（`fallbackIcon`，默认 `clock`）。
- 持久化：`persist` + `storageKey`（localStorage，默认 `kui-avatar`）。
- 独立渲染：`KUI.avatar.create(host, options)` / `KUI.avatar.mount(host, node)` / 控件类型 `avatar`。

### 新增与修改

- 新增 `src/core/avatar.js`（`KUI.avatar`，含内置预设头像；并注册 `avatar` 控件类型）
- 新增 `src/styles/avatar.css`（由 `base.css` 顶部 `@import` 引入，**不需要改任何 HTML**）
- `src/components/menu.js`：品牌区支持头像，新增 `setAvatar / getAvatar / openAvatarPicker`
- `src/components/app-shell.js`：`app.avatar` 透传 + 实例代理同名方法
- 新增 `standalone/avatar.html`（交互测试台：按钮换头像 / 套用预设 / 清除 / 读取状态 / 读齿轮框颜色）+ `config/demos/avatar.json`（15 个示例 + 字段表）
- `config/app.json` 新增 `avatar` 配置与「头像与齿轮框」菜单项；`config/kui-modules.json` 两套清单加入 `src/core/avatar.js`
- 版本 `1.2.0`

### 验证

- 真实 Chromium：`/standalone/avatar.html` 渲染 15 个头像、12 个齿轮框；`KUI.theme.apply('starry')` 后齿轮 `stroke` 由 `rgb(212, 175, 55)`（绯红刻刻帝·金）变为 `rgb(111, 199, 201)`（星夜观测·青），切回 `kurumi` 恢复金色 → **主题联动确认**。
- 集成冒烟 **74/0**（新增 `[19] 头像与刻刻帝齿轮框` 4 项）；`test/run.js` 30/0/0；`check-assets.js` 20 HTML 0 错 0 警；全页面审计 18/18。

## v1.1.5 — 菜单收起后顶部导航折叠按钮的提示文案/图标不切换

### 用户反馈

> 如图，当菜单收起时，展开按钮的提示文案仍然是「收起菜单」，图标也没有变化

### 根因（三个隐性断点叠加）

1. **模块级事件被静默丢弃**：`src/core/kui.js` 里 `KUI.events = { create, createEmitter }`，只有工厂没有派发；但 menu / menunav / tabs / toast / dialog 都调用 `KUI.events.emit(...)` 发 `menu:collapsed`、`tabs:activate` 等模块级事件，`menunav` 又用 `KUI.events.on('menu:collapsed', ...)` 监听 → 发与收双双落空（都被 `safe()` 吞掉）。
2. **上下文里没有 app 实例**：`app-shell.js` 创建 menu/menunav 时传入的是 `KUI.createContext(null)`，`ctx.app` 恒为 `null`；`menunav.getMenu()` 走 `(ctx.app && ctx.app.menu) || (KUI.app && KUI.app.menu)` 两条路都取不到菜单实例 → `syncCollapseIcon()` 直接 return。
3. **`ctx.emit()` 误把 `on` 当派发**：`createContext().emit()` 末尾写成 `ctx.app.on(name, detail)`。`on` 是注册监听的方法，于是 payload 被当成监听函数塞进事件表；一旦第 1 条修好、事件真的开始流动，就会在控制台报 `事件处理异常 [ready]: TypeError: copy[i].apply is not a function`。

### 修复

- `src/core/kui.js`：新增 `KUI.events.on / once / off / emit / has / count`，全部委托到全局总线 `KUI.bus`（同一份订阅表），组件侧无需改动即可恢复；`createContext().emit()` 的 `ctx.app.on` 改为 `ctx.app.emit`。
- `src/components/app-shell.js`：`ctx.app = app`（子组件可通过上下文找到宿主应用实例）。
- `src/components/menunav.js`：`getApp()` 增加 `KUI.app.instance` 兜底，单独渲染 menunav 时也能自解析。
- 连带收益：`menunav` 的「后退 / 前进」历史按钮状态、`tabs:activate` 同步等此前同样失效的模块级事件一起恢复。

### 验证

- 真实 Chromium（REA Playwright 探针 `.tools/probe-collapse2.html`）：点菜单自带折叠按钮后 `navTitle：收起菜单 → 展开菜单`、`aria-expanded：true → false`、`menuTitle：收起时间枢纽 → 展开时间枢纽`、`leftW：252 → 68`；再点恢复原状。
- `tools/smoke.js` 新增 `[18] 模块级全局事件兼容层` 4 项（静态 2 项 + 运行时 `KUI.events.emit ↔ on` 互通 + 运行时菜单收起后顶部导航按钮文案 / aria 同步）→ **70 通过 / 0 失败**（Node24 与 Node13.14 各一次）。
- `node test/run.js` 双版本各 **30 通过 / 0 失败 / 0 跳过**；`tools/check-assets.js` **19 HTML 0 错误 0 警告**；`tools/check-compat.js` PASS；`.tools/audit-all-pages.js` **17/17**。
- 版本：`KUI.version` → `1.1.5`（`src/core/kui.js`、`src/frame/kui-frame.js`、`src/core/dom-enhance.js`）。

### 升级提示

- 静态服务器无缓存：**刷新页面（Ctrl+Shift+R）** 即可；已打开的标签页请关闭重开，让 iframe 重新加载新版本脚本。
- 如果你的业务代码里也用了 `KUI.events.emit / on`，现在会正常工作；新代码建议直接用 `KUI.bus`，语义更清晰。

## v1.1.4 · 2026-10-26

主题：**修复「表单里标了星号的必填项，不填内容也能保存」（影响所有弹窗表单）**。

### 用户反馈
表单中标星号的必填项，保存时没有填入内容也能保存；所有表单都是如此。

### 根因
`src/frame/dialog-frame.js` 的 `validateForm()` 把校验结果当成布尔值用：

```js
var valid = safe(function () { return state.formApi.validate(); }, false);
// …
return Promise.resolve(!!valid);   // ← valid 是对象，恒为真
```

而 `KUI.form.create(...).validate()` 返回的是**结果对象** `{ valid, errors, data }`（见 `src/components/form.js` 的 `validate(ids)`）。
对象转布尔恒为 `true`，于是弹窗表单的校验「永远通过」——必填项留空、字段报错都拦不住提交。
（页面自己调用 `form.validate()` 并判断 `res.valid === false` 的业务页是正常的，所以问题只出现在「弹窗表单」这条链路上。）

### 修复
1. `src/frame/dialog-frame.js` 新增 `isValidatePassed(res)` 归一化函数：
   - `res === false` → 失败；
   - `res` 为对象且 `res.valid === false` → 失败（兼容 `res.ok === false`）；
   - 其余视为通过（含 `undefined`/`true`）。
2. `validateForm()` 的同步分支改为 `Promise.resolve(isValidatePassed(result))`，Promise 分支改为 `result.then(isValidatePassed, function () { return false; })`。
3. 校验失败时保持弹窗打开并显示字段错误（沿用既有 `showError` / 字段错误渲染），不再静默关闭。

### 真机验证（REA Playwright / Chromium 156.0.4314.42）
- **弹窗表单**（`standalone/dialog.html` → 「灵装回路配置」）：清空 2 个必填输入框后点「保存配置」→ 弹窗保持打开、失败字段 2 个、错误文案 `结界名称*该项为必填`。
- **页面表单**（主应用 → 「完整表单页」）：清空 8 个控件后点「提交」→ 没有出现二次确认弹窗（被 `res.valid === false` 拦住）。

### 回归与版本
- 冒烟 `tools/smoke.js` **66 / 0**（Node 24 与 Node 13.14 各一次，新增 `[17] 表单必填校验` 3 项断言）；
- 测试 `node test/run.js` 双版本各 **30 / 0 / 0**；
- `tools/check-assets.js` **19 HTML / 0 错误 0 警告**；全页面审计 **17 / 17**；
- `KUI.version` → `1.1.4`（`kui.js` / `kui-frame.js` / `dom-enhance.js` 三处）。

### 升级提示
刷新页面即可生效（静态资源 no-store，无需重启服务）；如仍看到旧行为，请 `Ctrl+Shift+R` 强制刷新。

---

## v1.1.3 · 2026-10-26

主题：**修复「菜单头像右侧的折叠按钮收起菜单后，右侧页面区域没有同步撑开」**。

### 用户反馈
点击左侧菜单顶部（头像右侧）的折叠按钮，只有菜单自身收起，`页面框架区域` 列宽不变、右侧留出空白；
而点击顶部导航里的「收起菜单」按钮时，页面区域能正常撑开。

### 根因
`src/components/menu.js` 的 `setCollapsed()` 只调用了模块级 `emit('menu:collapsed', …)`（发到 `KUI.events` 全局总线），
却没有走实例的 `fire('collapsed', …)`；而 `src/components/app-shell.js` 是通过 `menuApi.on('collapsed', …)`
监听**实例**事件的 —— 于是菜单自己收起时 app-shell 完全不知情，`.kui-app` 的 grid 列宽仍是展开宽度，
左侧只剩 68px、右侧空出 184px。顶部导航按钮走的是 app-shell 自己的 `toggleCollapsed()`，所以能正常同步。

### 修复
`menu.js` 的折叠回调改为 `fire('collapsed', { collapsed })`：一次调用同时完成
「实例监听（app-shell）→ props.on.collapsed → node.on.collapsed → ctx.emit → 全局 menu:collapsed（menunav 图标同步）」；
`fire()` 内部本来就会补发 `emit('menu:' + name)`，所以原有的全局监听（menunav 折叠图标）不受影响。

### 验证（真实 Chromium 156，探针 `.tools/probe-collapse.html`）
| 步骤 | `.kui-app__left` | `.kui-app__center` | 根节点 class |
| --- | --- | --- | --- |
| 初始 | `[0,0,252,720]` | `[252,56,1028,664]` | `kui-app` |
| 点菜单自带折叠按钮 | `[0,0,68,720]` | `[68,56,1212,664]` ✔ 同步撑开 | `kui-app is-menu-collapsed kui-app--collapsed` |
| 点顶部导航收起按钮（恢复） | `[0,0,252,720]` | `[252,56,1028,664]` ✔ 恢复 | `kui-app` |

### 回归
`smoke.js` **63/0**（双 Node，新增 `[16]` 3 项）、`test/run.js` **30/0/0**（双 Node）、
`check-assets.js` 19 HTML 0 错 0 警、`check-compat.js` PASS、全页面注册审计 17/17。
版本号 `1.1.2` → `1.1.3`（`kui.js` / `kui-frame.js` / `dom-enhance.js`）。

### 升级提示
刷新页面（`Ctrl+Shift+R`）。折叠/展开按钮现在两个入口行为一致；偏好仍存 `localStorage.kui-menu-collapsed`。

## v1.1.2 · 2026-10-26

主题：**修复弹窗两处渲染缺陷 —— 必填校验反向、表单弹窗缺提交按钮**。

### 用户反馈
1. `prompt` 要求必填时，输入了文字反而保存不了（红字「结界必须有名字」），清空输入框却能保存。
2. `KUI.dialog.form` 表单弹窗没有「取消 / 提交」按钮。

### 根因
1. **校验反向**：`src/frame/dialog-frame.js` 的 `normalizeRules()` 对数组形式的 rules 直接原样返回，
   而 `validateField()` 只认 `{ type, value }` 形态；业务配置（契约 §7 允许）写的是键值对象
   `{ required: true, message }`、`{ min: 2, max: 20, message }`。这类规则被判成「无类型规则」，
   循环末尾 `if (rule.message) message = rule.message;` 会**无条件**报错；空值时前面 `if (isEmpty) return;`
   又提前放行 —— 语义正好反了。
2. **form 弹窗没有 footer**：`renderForm()` 里 `KUI.form.create(host, …)` 会把表单直接挂进 host，并返回
   `el === host` 的实例；代码随后 `host.appendChild(created.el)` → 抛
   `HierarchyRequestError: The new child element contains the parent`，异常中断 `render()`，
   末尾的 `buildFooter(config)` 永远执行不到，于是没有取消/提交按钮。

### 修复（`src/frame/dialog-frame.js`）
- `normalizeRules()` 新增 `expandRule()`：把 `{ required, min, max, pattern, len, minLength, maxLength, … }`
  键值对象展开为 `{ type, value, message }`（`RULE_KEYS` 维护键清单），同时保留字符串 / `{type,value}` 写法；
  节点 `required: true` 自动补一条 required。
- `validateField()` 改为「逐条规则先算 `failed`，只有失败时才写 message」，并支持 `minLength/maxLength/len` 别名。
- `renderForm()` 加守卫：`created.el !== host && created.el.parentNode !== host` 才 appendChild。
- `render()` 的正文渲染包进 `try/catch`（异常 `K.error('弹窗正文渲染失败：…')`），footer 构建改用
  `safe(function () { buildFooter(config); })` —— 正文异常不再吞掉按钮。

### 验证
- 真实 Chromium（REA Playwright + msedge headless，经 `standalone/dialog.html`）：
  - form「灵装回路配置」：footer 渲染 `["放弃修改","保存配置"]`、`footerDisplay: flex`、iframe 高 458px；
    点「放弃修改」→ 弹窗关闭（层数 0）。
  - prompt 有值：输入「一之弹·时之结界」→ 点「刻印」→ `Promise` 解析为该字符串，弹窗关闭。
  - prompt 空值：点「刻印」→ 红字「结界必须有名字」，弹窗保持打开（层数 1）。
- 回归：`smoke.js` **60/0**（Node 24 与 Node 13.14 各一次，新增 `[15]` 4 项）、`test/run.js` **30/0/0**（双 Node）、
  `check-assets.js` 19 HTML 0 错 0 警、`check-compat.js` PASS、全页面注册审计 **17/17**。
- 版本号 `1.1.1` → `1.1.2`（`kui.js` / `kui-frame.js` / `dom-enhance.js`）；`node tools/build-all.js` 已重建
  `src/core/kui-all.js`（app=27 / standalone=26 模块）。

### 升级提示
- 刷新页面（`Ctrl+Shift+R`）。`prompt` 的 `rules` 三种写法（字符串 / `{type,value}` / 键值对象）现在等价，
  `docs/03-controls.md` 有示例。
- 业务自定义校验函数（`validate`）返回 `{ ok, message }` 的写法不受影响。

## v1.1.1 · 2026-10-26

主题：**修复弹窗「ready ↔ init 无限乒乓」（按钮没反应 / 输入卡死的真正根因）**。

### 根因（由诊断面板日志直接命中）
用户开启 `?kui_debug=1` 后回传的日志显示，弹窗打开期间消息以 **约 15ms 一轮** 持续刷屏：

```
msg dialog:resize height=264 src=frame
msg dialog:ready  src=frame
…（2.4 秒内 200+ 组，约 110 条/秒，持续到弹窗关闭）
```

链路：`dialog-frame.js` 的 `render()` 末尾回发 `dialog:ready` → 父级 `dialog.js` 收到 ready 后
无条件 `sendInit()` → frame 收到 `dialog:init` 再次 `render()` → 又回发 ready → 无限循环。
主线程被消息传递 + 重渲染 + 改 iframe 高度占满，因此：

- 点击弹窗按钮「像没反应」（事件排队，响应被淹没）；
- 输入框打字越打越卡（每次输入都夹在一串消息/重排之间）；
- 「弹窗独立渲染」页里元素会**快速闪动**（每轮 `dialog:resize` 改一次高度）。

### 修复（三处，互为保险）
1. `src/frame/dialog-frame.js`：`render()` 内**不再** `post('dialog:ready')`；就绪只由 `sendReady()` 上报一次。
2. `src/components/dialog.js`：`dialog:ready` 只初始化一次（新增 `rec.inited` 守卫）；另加 ready 次数熔断（>5 次停止重复初始化并记录诊断）。
3. `src/components/dialog.js`：`handleResize()` 加令牌桶熔断——同一弹窗 500ms 内高度变更 >40 次直接忽略（并记录诊断），防止「改高 → 触发测量 → 再改高」自激。

### 验证
- **真实 Chromium 修复前后对比**（同一探针：打开菜单右下角主题弹窗后静置 3 秒）：
  - 修复前（用户日志）：约 **110 条消息/秒**，持续不断；
  - 修复后：3 秒内共 **18 条**消息，其中 `dialog:resize` 3 次、`dialog:ready` 1 次；
  - 点击弹窗内「关闭」→ `layersAfter=0`、`dialog:clicked` 回传 1 次；
- 集成冒烟：**56 通过 / 0 失败**（Node 24 与 Node 13.14 各一次；新增 [14] 弹窗消息循环防护 3 项）；
- 单元/集成测试：**30 通过 / 0 失败 / 0 跳过**（Node 24 1730ms / Node 13.14 4705ms）；
- `tools/check-assets.js`：19 个 HTML，0 错误 0 警告；`tools/check-compat.js`：PASS；全页面注册审计：**17 / 17**。

### 升级提示
- 无需改配置；`KUI.version` = `1.1.1`，iframe 会用版本戳自动穿透旧缓存。
- 之前 5 轮「弹窗加固」没治好，是因为真凶是这条消息乒乓（由更早的加固补丁引入），
  v1.1.1 已从源头断掉，并加了双保险熔断。

## v1.1.0 · 2026-10-26

主题：**弹窗「按钮没反应 / 输入卡死」专项加固 + 现场诊断面板**。

### 一、用户反馈
1. 弹窗内的按钮按了仍无任何反应；
2. 点击弹窗中的输入框后输入文字，仍会导致整个浏览器卡死（用户已更换浏览器，排除缓存）。

### 二、排查过程（真实 Chromium，headless Playwright）
- 三层嵌套（主应用 → 标签 iframe → 弹窗 iframe）复现：弹窗正文、取消/确认、自定义动作转发、关闭全部正常；
- 输入压力测试：textarea 聚焦正常，逐字输入 40 字符耗时 8ms，无 longtask（>50ms）堆积；
- 结论：在 Chromium 156 / Edge 156 上无法稳定复现「卡死」，但定位到 4 个**在某些浏览器 / 显卡 / 输入法组合下会放大成卡顿或失效**的工程隐患。

### 三、修复 / 加固
1. **移除 document 级焦点陷阱**（`src/components/dialog.js`）：此前每个 focusin 都会把焦点抢回弹窗 iframe，
   在部分浏览器 + 输入法组合下会让输入框拿不稳焦点（表现为点击无反应、打字卡顿）。改为「打开时聚焦一次」。
2. **弹窗去掉 `clip-path` 斜切裁剪层**（`src/frame/dialog-frame.html`）：裁剪会让整个弹窗成为独立图层，
   光标闪烁 / 逐字输入都触发整层重绘；改为圆角 + 描边。
3. **关闭弹窗输入的拼写检查与自动纠正**（`src/frame/dialog-frame.js`）：`spellcheck/autocorrect/autocomplete`
   在 Windows 输入法、自动填充场景下开销极大，是「打字越打越卡」的常见来源。
4. **拖拽卡死兜底**（`src/components/dialog.js`）：`is-dragging` 残留会让整个弹窗 `pointer-events: none`（点什么都没反应），
   增加 mouseup / pointerup / 窗口失焦 / visibilitychange 四路兜底 + 2.4s 超时清尾。
5. **点击必有反馈**：弹窗内所有 footer 按钮点击都会回传 `dialog:clicked`，父页面弹一条「已点击：xxx」提醒；
   动作桥执行失败会回传 `dialog:debug` 并在诊断面板记录。

### 四、新增：现场诊断面板（`src/core/diag.js`）
- 打开方式：`http://127.0.0.1:8080/?kui_debug=1`（或 `localStorage.setItem('kui-debug', '1')`）；
- 采集：版本 / UA / 视口、window error 与 unhandledrejection、longtask、焦点事件、输入事件耗时、
  dialog:/theme:/frame: 消息链路；右下角面板可「复制」整段日志；
- 未启用时零开销（只挂一个空 API）；已加入 `config/kui-modules.json` 两个 profile，单入口自动加载。

### 五、验证
- 集成冒烟：**53 通过 / 0 失败**（Node 24 与 Node 13.14 各一次；新增 [13] 诊断与弹窗加固 4 项）；
- 单元/集成测试：**30 通过 / 0 失败 / 0 跳过**（Node 24 1912ms / Node 13.14 4851ms）；
- `tools/check-assets.js`：19 个 HTML，0 错误 0 警告；`tools/check-compat.js`：PASS；
- 全页面注册审计：**17 / 17** 通过；
- 真实 Chromium：`?kui_debug=1` 面板出现、prompt 弹窗打开/输入/点击「记录」后关闭、诊断面板 27 行日志、0 异常。

### 六、升级提示
- 无需改配置；刷新页面即可（version 1.1.0 会顺带穿透旧缓存）。
- 若「卡死」仍复现：请打开 `?kui_debug=1` 复现一次，把右下角面板内容（或 F12 Console 截图）发回，
  面板里会直接显示是「主线程长任务」还是「消息未到达」。

# CHANGELOG

KurumiUI 变更记录（版本号遵循语义化：主版本 = 不兼容的配置/API 变更）。

## v1.0.9 — 单一入口 + 弹窗健壮性 + 布局空白带 + 审计闭环

### 用户反馈（4 项）

1. 弹窗内除关闭叉号外的按钮点了没有反应；2. 弹窗输入框点击输入会卡死浏览器；3. 内容区上方多出一行空白；4. 为什么每次改 UI 都要动 HTML（不是 JS 渲染 + CSS 控制吗）。

### 修复

- **弹窗按钮无反应 / 输入卡死（加固）**
  - `dialog-frame.js`：底部按钮点击先 `post("dialog:clicked")`，再执行动作；父级 `dialog.js` 收到后弹一条 `已点击：xxx` 轻提示（`config.clickFeedback === false` 可关）。
  - 高度上报：`scheduleResize()` 改为 90ms 节流；`MutationObserver` 只监听 `{childList:true,subtree:true}`（不再因每次按键触发「测量→上报→改高」）；父级 `handleResize()` 增加 `lastHeight` 去抖。
  - 弹层性能：`.kui-dialog-mask` 去掉 `backdrop-filter: blur(2px)`（多层 iframe 叠加模糊在真实 GPU 上开销大），改纯色遮罩；`.kui-dialog-wrap` 去掉 `will-change`。
  - 打开兜底：`open()` 后 700ms 再补一次 `is-enter/is-open`，避免首帧动画被节流吞掉后留下「透明遮罩」。
- **内容区上方空白行**：`.kui-app` 的 grid 原本是两行 `"left header" / "left main"`，而 `app-shell` 把 header 放在 `.kui-app__main` 内部，header 实际落在第 2 行、第 1 行右侧空出 56px。改为单行 `grid-template-rows: minmax(0, 1fr); grid-template-areas: "left main";`，`.kui-app__header` 回到第一行（`grid-area: auto; flex: 0 0 auto`）。真机量测：header y 从 56 → 0。
- **单一入口 kui-all.js（回答「为什么改 UI 要动 HTML」）**
  - 新增 `config/kui-modules.json`（`profiles.app` 26 个模块、`profiles.standalone` 25 个）与 `tools/build-all.js`，生成 `src/core/kui-all.js`。
  - 18 个 HTML 由「15~25 个框架 `<script>`」收敛为一行：`<script src="…/src/core/kui-all.js" data-kui-profile="app|standalone">`。以后加/换框架模块只改 JSON + `npm run build:config`，不再改 HTML。
  - 说明：**UI 样式一直是「JS 渲染 + CSS token 控制」**（`config/app.json` + `themes.json` 即可换文案/颜色/控件），这次动 HTML 是一次性的「装配收敛」，之后新增页面也只需这一行入口 + 自己的页面脚本。

### 审计闭环

- 全页面注册审计（dom-stub 探针，17 页：pages 7 + standalone 10）：`.kui-unknown` = 0、「未注册的元素类型」= 0、console.error = 0，**17/17 通过**。
- 真机（REA Playwright / Chromium 156）四页探针：`/`、`/standalone/menu.html`、`/pages/form.html`、`/standalone/dialog.html` 均 `unknown=0`，主应用 `menuItems=21`、`KUI.version=1.0.9`（升版后复测）。
- `check-compat`：[PASS]；`check-assets`：19 个 HTML，0 错 0 警。

### 回归

| 命令 | 结果 |
| --- | --- |
| `node tools/smoke.js` | 49 通过 / 0 失败 |
| `node13 tools/smoke.js` | 49 通过 / 0 失败 |
| `node test/run.js` | 30 通过 / 0 失败 / 0 跳过 |
| `node13 test/run.js` | 30 通过 / 0 失败 / 0 跳过 |
| `node tools/check-assets.js` | 19 个 HTML，0 错误 0 警告 |
| `.tools/audit-all-pages.js` | 17 / 17 页面通过 |

### 升级提示

- 破坏性：页面**不再需要**逐条引入框架脚本，请改用 `kui-all.js`（保留 `theme-boot.js` 在最前、样式表与 `config/bundle.js` 照旧）。
- 自定义页面：复制任意 `standalone/*.html` 的 `<head>` 作为模板即可。
- 版本号：`KUI.version = "1.0.9"`（iframe 缓存穿透与自愈仍按此版本号比较）。

---

## v1.0.8 · 2026-10-26

修复第七次反馈的三项问题（多行文本框没有可调角标、菜单右下角切换主题仍无效、部分下拉框体风格与主题不一致）。**配置 JSON、组件 API 全部向后兼容**；新增 1 个框架脚本（`src/core/dom-enhance.js`）与 1 个样式块，无需改调用方。

### ① 多行文本框右下角没有可调大小的角标

- 现状与根因分两层：
  1. **框架 `textarea` 控件**本身有主题化角标（`.kui-textarea__resize`，由 `props.resize` 控制，默认 `vertical`），但**弹窗多行输入**与**业务页自写 textarea** 用的是浏览器原生 `resize` 角标或干脆 `resize: none`，与主题材质不统一。
  2. **弹窗 `prompt` 的多行分支此前是坏的**：`input.type = 'textarea'` 赋给 `<input>` 会被浏览器退化成单行文本（已在 v1.0.6 修复为真正创建 `<textarea>`），但当时仍留着浏览器原生 resize 角标。
- 修复：新增 `src/core/dom-enhance.js`（原生控件升级器，零依赖），其中 `KUI.enhance.grip(textarea)` 给任意 `<textarea data-kui-grip>` 追加与框架控件**同材质**的右下角角标（两条斜线、`nwse-resize`、可拖动改高、`min-height` 兜底、卸载时清理）。
  - `src/frame/dialog-frame.js` 的多行 `prompt` 改为 `resize: none` + 调用 `KUI.enhance.grip()`；
  - 7 个 `pages/*.html` 与 10 个 `standalone/*.html` 的 textarea 统一标记 `data-kui-grip` 并自动升级。
- 真机验证（真实 Chromium）：弹窗 prompt「时之低语」正文渲染为 `<textarea rows=3>`，右下角角标 `16×16`、`display:block`、`position:absolute`、`cursor:nwse-resize`，拖拽后高度 `76 → 116px`。

### ② 菜单右下角「切换灵装主题」仍无效

- 用真实浏览器（Playwright + Chromium）对本版代码做了端到端复测：点击菜单 footer 按钮 → 弹窗打开 → 点击主题卡片「星夜观测」→ **父级整壳主题变为 starry、已打开的 3 个业务 iframe 全部跟随、弹窗自动关闭并提示 toast**，链路完整可用。
- 结论：用户环境命中的是**旧缓存的弹窗 iframe 文档**（旧版没有动作桥，节点级 `on.click` 不转发父级 → 看起来「点了没反应」）。本版同时做了三层加固：
  - `KUI.version` → `1.0.8`，`tabs` / `dialog` 的 iframe URL 全部追加 `?kui_v=1.0.8`（缓存穿透）；
  - `kui-frame.js` / `dialog-frame.js` 版本不一致时自愈刷新一次；
  - 弹窗 iframe 引入 `core/handlers.js` + `dom-enhance.js`，节点级动作一律交父级执行。
- 另外给弹窗底部按钮补了**可见反馈**：非关闭型按钮（`close: false` 且带 `action`）点击后先回传父级并弹一条「已点击「xx」」提示，避免用户误以为没生效。

### ③ 部分下拉选择框体风格与主题不一致

- 根因：`pages/editor.html`、`pages/notify.html` 以及 10 个 `standalone/*.html` 里共 **13 个原生 `<select>`**（页面顶栏的主题/位置/时长选择等）直接渲染浏览器原生下拉，弹出层完全绕过主题。
- 修复：`dom-enhance.js` 把 `select[data-kui-native]` 就地升级为框架 `select` 控件（保留原 `value`/`disabled`/选项文本，双向同步 `input`/`change` 事件，`MutationObserver` 跟随 `option` 变化），原生元素隐藏但继续作为数据源与表单提交载体；宿主 span 承担原行内位置（`.kui-native-select`）。
- 真机验证：13 个原生 select 全部升级；点击后弹出的 `.kui-select-popup` 使用主题化的 `kui-popup-layer`（token 着色、层级 `--kui-z-popup`），选择后回写原生 value 并触发 `change`。

### 装配与文档

- `src/frame/dialog-frame.html` 的 `<head>` 增加 `../core/dom-enhance.js`；7 个 pages 与 10 个 standalone 页面在 core 脚本后引入 `core/dom-enhance.js`（相对路径自动推导）。
- `tools/smoke.js` 新增 **[12] 原生控件升级** 3 项断言：18 个 HTML 均已接入 dom-enhance、13 个原生 select 全部标记 `data-kui-native`、弹窗多行分支使用 textarea + 自绘角标（`resize: none`）。
- `docs/02-config-reference.md` 新增 §9.5「原生控件升级器（dom-enhance）」；`docs/00-contract.md` 加载顺序补 `core/dom-enhance.js`（位于 `core/handlers.js` 之后、控件库之前）；`docs/08-acceptance.md` 新增 v1.0.8 验收表。

### 回归

- `tools/smoke.js` **49 通过 / 0 失败**（Node 24 与 Node 13.14 各一次）
- `test/run.js` 30 通过 / 0 失败 / 0 跳过（Node 24：1629ms；Node 13.14：4608ms）
- `tools/check-assets.js`：19 个 HTML，错误 0，警告 0
- `tools/check-compat.js`：PASS（无禁用语法 / API）
- `KUI.version` → `1.0.8`


## v1.0.7 · 2026-10-26

修复第六次反馈的两项问题（实心按钮悬浮前景看不清、切换主题/菜单时 iframe 区域先闪一下别的主题）。**配置 JSON、组件 API 全部向后兼容**；新增主题 token 为 0（复用既有 `--kui-on-*` 语义 token）。

### ① 实心按钮悬浮时文字仍与按钮底色同色

- 根因有两层：
  1. **pages 业务页**：7 个 `pages/*.html` 的示例按钮 `.btn--primary` 把前景写死为 `#fff`，而悬浮态 `:hover` 只改背景、未重声明前景 → 浅色主题（白羽灵装 / 黎明绯光）下背景变为浅色系，白字看不清。
  2. **框架控件**：`.kui-btn--success / --warning / --danger` 的悬浮态只加发光、不改变填充色，视觉上「悬浮没有反应」，用户会误以为按钮没生效。
- 修复：
  - 7 个 `pages/*.html` 统一改为 `background: linear-gradient(180deg, var(--kui-accent-hover), var(--kui-accent))` + `color: var(--kui-on-accent, var(--kui-text-inverse))`，并补 `.btn--primary:hover { color: var(--kui-on-accent, …); background: var(--kui-accent-hover); }`（`.tools/patch-page-buttons.js` 批量落地）。
  - `src/styles/controls.css`：成功/警告/危险三个填充变体的 `:hover` 增加 `filter: brightness(1.14) saturate(1.06)`，在保持 `on-*` 前景对比度的前提下给出明确的悬浮变色反馈。

### ② 切换主题 / 切换菜单时 iframe 区域先闪烁另一个主题

- 根因：iframe 新文档的 `<head>` 先加载 `base.css`（`:root` 里是 kurumi 暗红默认 token），要等业务脚本跑完、收到父级 `theme:apply` 消息后才换成当前主题 → **首帧必然闪一下 kurumi**。
- 修复：新增 `src/core/theme-boot.js`（同步小脚本，**放在每个 HTML 的 `<head>` 里、所有样式表之前**）：
  - 同源 iframe 内：直接读 `parent.KUI.theme.currentId()` / `currentTokens()`，把 token 写成 `<html>` 内联 style、并设置 `data-kui-theme` / `data-kui-scheme`；
  - 顶层页面：读 `localStorage` 里持久化的主题（键 `kui-theme`）；
  - 暴露 `window.__KUI_EARLY_THEME__` / `__KUI_EARLY_TOKENS__`，`KUI.theme.resolveInitial()` 会优先采用它（避免二次应用造成抖动）。
- 接入范围：全部 **19 个 HTML**（主应用、7 个 pages、10 个 standalone、弹窗 iframe）统一在 `<head>` 最前面引入（`index.html` 用 `src/`，子目录页面用 `../src/`）。
- 真机验证：`.tools/probe-themeflash.html`（iframe 主应用 + 切换主题后开新标签，轮询子文档 accent 色）在真实 Chromium 中首帧采样即 `accent = #bd2138`（白羽灵装主色）、`data-kui-theme = kurumi-angel`、内联 token 64 个 —— **未再出现暗红首帧**。

### 回归

- `tools/smoke.js` **46 通过 / 0 失败**（Node 24 与 Node 13.14 各一次；新增 [11] 主题预置断言 4 项：19 个 HTML 均在首个样式表前引入 theme-boot、脚本含 parent/localStorage 读取、`theme.js` 优先 `__KUI_EARLY_THEME__`、7 个 pages 实心按钮悬浮前景不使用 `#fff` 且消费 `on-accent`）
- `test/run.js` 30 通过 / 0 失败 / 0 跳过（Node 24：1566ms；Node 13.14：4677ms）
- `tools/check-assets.js`：19 个 HTML，错误 0，警告 0
- `KUI.version` → `1.0.7`（同时推动 iframe 的 `kui_v` 缓存穿透与版本自愈）


## v1.0.6 · 2026-10-26

修复第五次反馈的弹窗问题（正文空白、底部按钮无响应、嵌套弹窗无反应、点输入框卡死）。**配置 JSON、组件 API 全部向后兼容**。

### 根因：`config.type` 覆盖了弹窗工厂方法

- `KUI.dialog.prompt / confirm / alert / form / custom` 原先只把 `config.type` 直接透传：示例配置里用于「配色语义」的 `"type": "info"`（`config/demos/dialog.json` 的 prompt 项）会覆盖工厂强制写入的 `type: 'prompt'`，弹窗 iframe 于是按 `info` 渲染 → **正文空白、底部只剩一个按钮**；同时又因为没有 prompt 的输入节点，用户点空白区域看起来像「点击无反应」。嵌套弹窗（`demo.nested`）同理。
- 修复（`src/components/dialog.js`）：工厂先合并 `DEFAULTS`，再把 **method 作为权威类型** 写入 `cfg.type`，并把 `method` 一并放进 `dialog:init`；`src/frame/dialog-frame.js` 的 `render(config, method)` 以 `method` 优先、`type` 兼作配色语义，不再影响结构分支。

### 其余同步改进

- `dialog:init` 新增 `method` 字段（契约 §9 已补）；旧版父页面不带 `method` 时，`dialog-frame` 仍按 `type` 兜底，完全兼容。
- 真实 Chromium（Playwright，主应用 → 标签 iframe → 弹窗 iframe 三层嵌套）实测：prompt 正文/输入框/「取消」「记录」按钮正常；点「记录」返回 null 并关闭；「嵌套结界」点「再开一层」成功再开一层 confirm（第 2 层）；`activeElement` 为输入框、rAF 帧率正常（无卡死）。
- 新增调试探针 `.tools/probe-nested.html`（同源 iframe 主应用 + 结果面板），脚本化复现「主应用内弹窗」场景。

### 回归

- `tools/smoke.js` 44 通过 / 0 失败（Node 24 与 Node 13.14 各一次，含新增「method 不被 config.type 覆盖」断言）
- `test/run.js` 30 通过 / 0 失败 / 0 跳过（Node 24：1818ms；Node 13.14：4846ms）
- `tools/check-assets.js`：19 个 HTML，错误 0，警告 0

## v1.0.5 · 2026-10-26

针对第四次反馈的 3 个遗留项 + 1 处体验问题。**配置 JSON、组件 API 全部向后兼容**；主题 token 未新增（悬浮提示复用既有 token）。

### ① 悬浮提示不再使用浏览器原生样式（新增 `KUI.tooltip`）

- 新增 `src/core/tooltip.js`（约 560 行）+ `src/styles/tooltip.css`：事件委托接管全站 `title` 与 `data-kui-tip`，渲染主题化浮层（玻璃底 + 主题色描边 + 箭头 + 淡入/位移，`prefers-reduced-motion` 降级）。
- 无障碍友好：接管时把 `title` 搬到 `data-kui-tip` 并暂存来源，失焦/卸载时回填，读屏软件仍能读到名称；可用 `data-kui-tip-disabled="true"` 对个别元素保留原生行为。
- JSON 可配：`config/app.json` 新增 `ui.tooltip`（`enabled/delay/hideDelay/offset/maxWidth/placement`），`bootstrap` 启动时调用 `KUI.tooltip.configure()` 应用；单个元素也可用 `data-kui-tip-delay` / `data-kui-tip-placement` / `data-kui-tip-max-width` 覆盖。
- 全部 19 个 HTML（主应用 / 7 个 pages / 10 个 standalone / 弹窗 iframe）统一引入；`dialog-frame.js` 的 `boot()` 里也执行 `KUI.tooltip.init()`，弹窗内的提示同样统一。

### ② 菜单右下角「切换主题」无效（真实根因：旧版弹窗文档）

- 真实 Chromium（Playwright）全链路复测：点击菜单底部「切换灵装主题」→ 弹窗打开（`/src/frame/dialog-frame.html?kui_v=1.0.5`）→ 点击「星夜观测」→ 整壳切到 starry、`--kui-accent` 变为 `#7b96e8`、弹窗关闭。**当前代码链路是通的**。
- 用户侧无效来自 v1.0.4 之前缓存的旧弹窗文档（旧版没有 v1.0.2 的动作桥）；v1.0.4 起的 `kui_v` 版本戳 + 版本自愈已经消除该可能，本次仅补充自动化回归，防止再回退。

### ③ 右侧页面区域上方多出一行空白

- 根因：7 个 `pages/*.html` 的内联样式 `.page` / `.home` 顶部内边距为 `22px`（旧版遗留），叠在 `.kui-tabs__bar` 下方形成视觉空白带。
- 修复：7 页 `.page` / `.home` 上内边距统一改为 `6px`（与外壳间距 token 节奏一致），下方 40~44px 保持不变。

### ④ 全站「未注册元素」二次审计

- 新增 `.tools/audit-all-pages.js`（dom-stub 探针）：逐页加载 `pages/*.html` 与 `standalone/*.html` 的真实脚本 + 内联脚本，断言 `.kui-unknown` 为 0、正文无「未注册的元素类型」、无 `console.error`、`KUI.tooltip` 已加载。
- 结果：**17 / 17 页面通过**（主应用由 `tools/smoke.js` 覆盖）。

### 回归

- `tools/smoke.js` 新增 `[10] 悬浮提示与 UI 配置` 5 项（tooltip 就绪 / `ui.tooltip` 生效 / 19 个 HTML 引全资源 / 内容页顶距 ≤10px / 弹窗 iframe 接管提示）→ **43 通过 / 0 失败**（Node13.14 与 Node24 双跑）。
- `node test/run.js` 双版本 **30 / 0 / 0**；`tools/check-compat.js` PASS；`tools/check-assets.js` **19 HTML 0 错误 0 警告**。
- 真实浏览器：探针页 hover「收起菜单」→ 主题化浮层出现（移除原生 `title`、`bg=rgba(17,11,21,.97)`），移出后隐藏；截图 `.tools/shot-probe-visual.png`。

## v1.0.4 · 2026-10-26

针对第四次反馈「独立渲染页仍出现未注册的元素类型」的排查与加固。**配置 JSON、组件 API、主题 token 全部向后兼容**，无升级动作。

### 排查结论：不是当前代码的 bug

- 用真实 Chromium（Playwright，1280×720）实拍验证：
  - 直接打开 `standalone/menunav.html`：组件完整渲染，**无占位**；
  - 主应用内打开「菜单导航 · 独立渲染」「菜单 · 独立渲染」两个标签：均完整渲染，且右上角带 v1.0.3 新增的「已嵌入主应用」徽标。
- 用户截图中没有该徽标，说明 iframe 加载的是**旧版页面文档**（长会话/浏览器缓存里的旧 HTML），此前 `/pages`、`/standalone` 的脚本装配问题在 v1.0.3 已修复。

### 加固：版本戳 + 版本自愈（防止旧文档再次出现）

- `src/core/kui.js`：`KUI.version` 由 `1.0.0` 升到 `1.0.4`，作为全局版本锚点。
- `src/components/tabs.js`：
  - `buildSrc()` 在 **http(s) 环境**下给子页面 URL 追加 `?kui_v=<KUI.version>`（`file://` 不追加，避免本地双击路径异常）→ 每次发布 URL 必换，缓存必然穿透。
  - `tab:init` 额外携带 `parentVersion` 与 `src`。
- `src/frame/kui-frame.js`：
  - 新增 `selfHealVersion(parentVersion)`：`tab:init` 到达时若本页 `KUI.version` 与父级不一致，带 `kui_v=<父版本>` **自动 `location.replace` 刷新一次**；用 `sessionStorage` 记录一次自愈避免无限循环；直接打开的独立页不做自愈。
  - `KUI.frame.version` 改为跟随 `KUI.version`（不再写死 1.0.0）。

### 回归

- `tools/smoke.js` 新增 `[9] 版本自愈` 3 项断言（版本号统一 / `kui_v` 缓存穿透 / `selfHealVersion` 就位）→ **38 通过 / 0 失败**（Node13 & Node24）。
- `node test/run.js` 双版本 **30 / 0 / 0**；`check-compat` PASS；`check-assets` **19 HTML 0 错误 0 警告**。
- 真实浏览器实拍：主应用标签 iframe 的 `src` 已带 `?kui_v=1.0.4`（4 个并行标签均已验证），页面渲染正常。

### 升级提示

- 无需改任何配置文件。若你在自建页面里手动 `iframe.src = 'xxx.html'`，建议也附一个版本查询参数（如 `?kui_v=1.0.4`），可避免同样的旧缓存问题；通过 `tabs.open({ url })` 打开的标签已自动处理。

## v1.0.3 · 2026-10-26

针对第三次浏览器验收反馈的 **8 个问题**做修复；配置 JSON 与组件 API 全向后兼容（唯一注意点是自定义主题建议补 4 个 `--kui-on-*` token，见「升级提示」）。

### 修复：主题切换后部分页面不跟随（反馈 1）

- 根因：`tabs.js:249`、`dialog.js:113` 的 `currentTheme()` 调用不存在的 `KUI.theme.tokens()`（只有 `currentTokens()`/`current()`）→ 广播的 `theme:change`/`tab:init` 里 `tokens` 恒为 `{}`；`kui-frame.js` 的 `applyTheme()` 落在同一条死分支上，且收到 `{id,tokens:{}}` 时只设 `data-kui-theme`、不写 token、不重绘装饰层。
- 修复：`currentTheme()` 改从 `KUI.theme.current()` 取 `{id,name,scheme,tokens}`（回退 `currentTokens()`），三处广播补 `scheme`；`kui-frame.js` 改为「优先 `KUI.theme.apply(id,{persist:false,broadcast:false,transition:false,silent:true})` → 回退 `applyTokens(tokens)` → 回退手写 CSS 变量」，装饰层走 `themeArt.render/clear`，始终同步 `data-kui-theme`/`data-kui-scheme`，并新增 `KUI.frame.themeId()`；删除 `kui-frame.js:217` 的死分支。

### 修复：无壳拼装页出现未注册元素 / iframe 内重复壳（反馈 2）

- 根因：`standalone/menu|menunav|tabs|toast.html` 缺 `src/core/registry.js`（组件静默未注册 → 占位「未注册的元素类型」）；`no-shell.html`/`menu.html` 的动作演示区用了 `button/text` 但缺 `controls/index.js`+`form.js`；所有 standalone 页自带互链导航与主题下拉，嵌入主应用标签后与外层壳重复。
- 修复：四页补 `registry.js`，`no-shell`/`menu` 补控件脚本；新增 `standalone/embedded.js`（`window.parent !== window` 检测，隐藏 demo 导航与主题下拉、追加「已嵌入主应用」徽标）；`no-shell.html` 被嵌入时跳过内层 `menu/menunav/tabs` 挂载、显示提示卡，顶层打开仍完整演示。

### 修复：成功/警告按钮悬浮变黑（反馈 3）

- 根因：`.kui-btn:hover:not(...)` 统一把背景改成深色 `--kui-control-bg-hover`，而 `.kui-btn--success:hover`/`--warning:hover` 未重声明 `background` → 填充色被盖掉。
- 修复：`controls.css` 中 `danger/success/warning/primary` 的默认/hover/active 三态全部显式声明 `background+border-color`，前景统一 `var(--kui-on-*, var(--kui-text-inverse))`；hover 加内高光 + 语义色光晕，active 用 `--kui-inner-glow`。

### 修复：日期范围无法正确选择（反馈 4）

- 根因：`pickers.js` 的 daterange `onHover` 每次 `mouseenter` 都 `leftCal.rebuild()/rightCal.rebuild()` 重建两侧 42 格 DOM，真实浏览器里光标下的节点被替换 → 点击目标丢失、面板闪烁。
- 修复：`createCalendar` 抽出 `cellMeta/cellClass/paint()`，hover 仅重算 className 与 `aria-selected`（同一 DOM 节点身份不变），选择完成后才 rebuild；补跨月、同一天两次、区间收窄、早于开始日重置、清除等探针用例。

### 修复：日历切月按钮看不到（反馈 5）

- 根因：`control-base.js` 的 `iconEl/iconHtml` 写死 `<use href="#kui-i-<name>">`，而 `icons.js` 的 symbol 前缀是 `kui-icon-<name>`、sprite 只在 `icons.create()` 时注入 → 真实浏览器里**全站控件图标**（日历切月、时分秒列箭头、number 加减、select 箭头、tag 关闭、alert/upload/pagination/rating 星）全部空白；DOM 桩不解析 `<use>`，旧测试抓不到。
- 修复：`iconEl` 优先 `KUI.icons.create(name,{class})`（自动 `ensureSprite()`）、`iconHtml` 优先 `icons.get()`，降级路径统一 `#kui-icon-*`；冒烟新增永久断言（sprite 注入 + 关键 symbol + 每个 `.kui-icon` 的 sprite 引用/内联图形均可解析）。

### 修复：悬浮时文字与背景同色（反馈 6）

- 控件层：所有实心填充态（选中/激活/日历 range 起止/分页当前页/badge/填充按钮）的前景由 `--kui-text-1` 改为语义前景 `--kui-on-*`（共 26 处）。
- 页面层：8 个 standalone 页的 `.demo-btn--primary` 与 `:hover` 文字改 `var(--kui-on-accent, var(--kui-text-inverse))`；`dialog-frame.html` 弹窗底部 `.is-primary/.is-danger` 的 hover/active/disabled 前景一并补齐。

### 修复：弹窗内容空白 / 按钮无反应 / 「再开一层」无反应（反馈 7、8）

- 空白根因：`dialog-frame.js` 的 `renderNodes` 直接把节点交给 `renderNode`，而 `controls/misc.js` 的 alert 只读 `props.text`，演示配置里写的是 `props.message` → 正文空白。
- 无反应根因：`installActionBridge()` 的 dispatch 是「命中组件前缀白名单才转发，否则静默」，而 `demo.trace`/`demo.nested` 这类**页面级动作**既不在白名单也不在弹窗 iframe 本地 → 请求根本没发出。
- 修复：`normalizeNode()` 把 `props.message`（含顶层 message、alert 无 text 时用 title 兜底）归一为 `props.text`，空正文回退 `renderMessage`；动作桥改为「`remoteOnly` 强制转发 / 本地已注册本地执行 / 其余一律转发父页」，父页也未注册时回执 `{ok:false,error}` 并 `KUI.toast.warning` 可见提示（不再静默）。

### 主题体系增强（token 审计与语义前景色）

- 新增 4 个语义前景色 token：`--kui-on-accent`、`--kui-on-success`、`--kui-on-warning`、`--kui-on-danger`（`base.css :root` + 6 套主题全部给出，WCAG 对比度均 ≥ 4.5:1）。契约 token 90 → **94**，每套主题外观 token 60 → **64**，`:root` 定义 112 → **116**。
- 新增系统性 token 审计：三个 CSS 共 1862 处 `var(--kui-*)` 引用，**0 处「被引用、未定义、且无 fallback」**；42 处未定义但有 fallback（`--art-*` 由 theme-art.js 注入、局部参数）、2 处局部定义（`--ctl-arrow*` 在控件作用域内）安全。
- `src/core/theme.js`：`apply(id,{silent:true})` 语义明确为「不写 localStorage、不广播、不派发 `kui:themechange`（`theme.on('change')` 仍触发）」；广播 payload 扩为 `{id,name,desc,scheme,tokens,art,defaultId}`；新增 `KUI.theme.tokensOf(id)`。
- `src/core/theme-art.js`：宿主回退（hostEl→body→documentElement，非法返回 null 并 warnOnce）、`render/preview/clear` 对 `null`/`{}`/字符串/detached 均安全；修复 `preview()` 内 `render` 未定义。
- 文档：`docs/04-theme.md` 新增 §7.8「父页 ↔ iframe 主题同步协议」与附录 A「token 引用审计与对比度验收」。

### 装配与文档

- 新增 `standalone/embedded.js`；`docs/02-config-reference.md` 增 §9.4（standalone 脚本清单与嵌入规则）、`docs/06-customization.md` 增 §4.4（被 iframe 嵌入时的行为）。
- `docs/03-controls.md` 补 daterange `startPlaceholder/endPlaceholder/separator` 别名与「实心填充前景必须用 `--kui-on-*`」「图标走 `icons.create/get`」约定；`docs/02`/`docs/06`/`docs/07`/`themes/README` 的 token 计数同步为 94/64/116。

### 回归

- `tools/smoke.js` 新增 [5] 图标断言（v1.0.3 回归项），并把 `verify-handlers-demo.js` 的脚本路径改为相对 `standalone/` 解析（新增的 `embedded.js` 曾导致 ENOENT）。
- 探针（保留在 `.tools/`）：`probe-pickers.js` **17/17**、`probe-dialog-frame.js` **12/12**、`no-shell-probe.js` **39/39**、`audit-tokens.js`、`probe-on.js`。
- 最终：`test/run.js` 30/0/0（Node13 / Node24）、`smoke.js` **35/0**（Node13 / Node24）、`check-assets.js` **19 HTML** 0 错误 0 警告、`check-compat.js` PASS、`verify-handlers-demo.js` PASS、`verify-dialog-bridge.js` PASS。

### 升级提示

- 自定义主题（`src/themes.json`）建议补齐 4 个 `--kui-on-*`；缺省时会继承 `base.css :root` 的 kurumi 兜底值，不会报错但浅色主题下对比度可能不足。
- 弹窗内节点动作（含页面级自定义动作）现在都会转发父页执行；父页也未注册时会出现 toast 警告，不再「点了没反应」。
- 直接打开 `standalone/*.html` 时行为不变；被主应用标签嵌入时，演示导航/主题下拉与无壳页内层壳会自动隐藏。

## v1.0.2 · 2026-10-25

针对第二次验收反馈：**菜单底部「切换主题」弹窗点不动**，以及 **JSON 无法存函数**的业务需求。
配置 JSON 与既有组件 API 全向后兼容。

### 新增：业务函数层（JSON 只存函数名 + 入参）

- 新增注册表 `src/core/handlers.js`（`KUI.handlers`）：`register / registerMany / resolve / has / invoke / list / scopes / count / clear`。
  函数命名 `scope.name`（如 `toast.success`），签名 `(ctx, args, info)`，支持同步与 Promise；未注册 `warnOnce`，内部抛错由 `KUI.error` 记录且不中断渲染。
- 新增 7 个组件业务函数文件（**每个框架组件一个独立 js，可自由拆装**）：
  - `src/components/handlers/menu.handlers.js`（`menu.*`：折叠/选中/徽标/循环）
  - `src/components/handlers/menunav.handlers.js`（`menunav.*`：刷新/全屏/前进后退/标题/面包屑）
  - `src/components/handlers/tabs.handlers.js`（`tabs.*`：打开/切换/关闭/刷新/徽标）
  - `src/components/handlers/dialog.handlers.js`（`dialog.*`：alert/confirm/prompt/form/custom/close/closeAll）
  - `src/components/handlers/toast.handlers.js`（`toast.*`：show/success/error/warning/info/demo/clear）
  - `src/components/handlers/app-shell.handlers.js`（`app.*`：主题/折叠/开标签/提醒；独立页无 bootstrap 时内置主题选择弹窗兜底）
  - `src/components/handlers/form.handlers.js`（`form.*`：reset/validate/getData/setData/setValue/setVisible/setDisabled/setRequired/setError/clearError）
- `src/core/kui.js` 增加两种语法糖：
  - 节点/动作里写 `{ "fn": "toast.success", "args": {…} }` 或 `{ "handler": … }` 自动转 `handlers.run`；
  - `actions.invoke()` 在动作名未注册时回退到 `KUI.handlers.invoke`，因此 `"on": { "click": "toast.info" }` 这种字符串写法也可用。
- 新增演示：`config/demos/handlers.json`（**纯 JSON**，8 组、4 种写法）+ `standalone/handlers.html`（独立渲染，本页零业务逻辑）；主应用「观测回廊 → JSON 业务函数」可直接打开。
- 新增文档 `docs/09-handlers.md`（写法、注册、装配、错误与安全、扩展 checklist）；契约补 §18。

### 修复：主题选择弹窗内的卡片点击无反应

- 根因：菜单底部 `theme.picker` 能打开弹窗，但弹窗是独立 iframe；`bootstrap.js` 生成的主题卡片用的是**节点级** `on.click → app.applyTheme` 动作，而 `dialog-frame.js` 此前只对 **footer 按钮**做「本地没有就转发父页」，节点级动作走 core `KUI.actions.run` 时在 iframe 内找不到 `app.applyTheme` / `KUI.dialog`，于是静默失败。
- 修复：`src/frame/dialog-frame.js` 新增 `installActionBridge()`（`boot()` 第一行启用），包装本地 `KUI.actions.run`：
  - 组件级前缀 `app./theme./tab(s)./nav./menu./menunav./toast./dialog./handlers./form./frame.` 一律通过 `dialog:action` 交父页执行；
  - `actions / chain / fn / handler / action / emit / theme / tab / toast / dialog` 各类写法统一递归分派；
  - 父页回执 `{ok,result}` 会解包给调用方，父页也没有时静默降级；
  - 本地动作（如 `clipboard.copy`）保持 iframe 内直接执行。
- 因此主题弹窗 6 个卡片、随机主题、深浅切换、主题展示页等按钮全部恢复；任意自定义弹窗也能在 JSON 节点上直接写父级动作。

### 装配与文档

- `index.html` / 9 个 `standalone/*.html` / 7 个 `pages/*.html` 按需补引 `core/handlers.js` 与对应组件的 `*.handlers.js`。
- `config/app.json` 菜单新增「JSON 业务函数」项（观测回廊组）。
- 文档：`docs/09-handlers.md` 新增；契约 §4 加载顺序、§18 业务函数层、§17 弹窗动作转发补充；`README.md` 增加业务函数层与目录说明；`docs/08-acceptance.md` 增加 v1.0.2 修复记录行；`docs/05-messaging.md` 说明节点级动作也在转发范围内。

### 回归

- `tools/smoke.js` 新增 [8] 业务函数层断言：`KUI.handlers.count() >= 25`、scope 覆盖 `menu/menunav/tabs/dialog/toast/app/form`、`toast.success` 等函数可被 JSON 写法实际执行、`config/demos/handlers.json` 里出现的每个 `fn` 均已注册、`index.html` 引全 handlers 文件、`dialog-frame.js` 含 `installActionBridge` 与 `dialog:action`、`standalone/handlers.html` 存在且只引 JSON。
- 新增两个运行时验证脚本（`npm run verify` 一次跑完）：
  - `tools/verify-handlers-demo.js`：用 dom-stub 真实装配 `standalone/handlers.html` 的脚本，按 JSON 渲染 8 组 / 29 个节点，点按钮确认 `toast` 真的弹出；
  - `tools/verify-dialog-bridge.js`：在 dom-stub 里启动 `dialog-frame.html`，断言 `app.applyTheme` / `handlers.run` / 动作数组都被转成 `dialog:action` 且参数完整。
- 回归：`test/run.js` 30/0/0（Node13 / Node24）、`smoke.js` **34/0**（Node13 / Node24）、两个 verify 脚本 PASS、`check-compat.js` PASS、`check-assets.js` **19 HTML** 0 错误 0 警告。

### 升级提示

- 自定义弹窗如果需要在 iframe 内执行主应用动作，直接在节点 `on` 里写动作名即可（v1.0.2 起自动转发），无需再手写 `postMessage`。
- 想给 JSON 增加可执行能力：新建 `src/components/handlers/<scope>.handlers.js` 并 `registerMany`，再在需要的页面引入该文件；不要往 JSON 里塞字符串形式的 JS（框架从不 `eval`）。

## v1.0.1 · 2026-10-25

针对首次验收反馈的 3 个问题做修复，其余对外行为不变（配置 JSON、组件 API 均向后兼容）。

### 修复

1. **pages 页面控件全部显示「未注册的元素类型」**
   - 根因：`pages/*.html` 漏引 `src/core/registry.js`，`KUI.registry` 不存在时 `renderNode` 只能渲染占位节点。
   - 修复：7 个 `pages/*.html` 全部补上 `registry.js`（与 `index.html`、`dialog-frame.html`、`standalone/*` 保持一致）。
   - 顺带修复：`src/core/config.js` 新增站点根前缀探测 `BASE` 与 `config.resolveUrl()`。此前 `config/demos/form.json` 这类相对路径在 `/pages/*.html` 中会被解析成 `/pages/config/...` 而 404；现在子目录页面也能正确读到同一份 JSON。`config.base()` 可查询当前前缀。

2. **在标签 iframe 内切换主题时，左侧菜单 / 顶栏（整壳）不跟随**
   - 根因：主题广播只有「父 → 子」（`theme:apply`），没有「子 → 父」通道；iframe 内的 `KUI.theme.apply()` 只影响自己。
   - 修复：
     - `src/frame/kui-frame.js` 新增 `KUI.frame.setTheme(id)` / `requestTheme(id)`：内嵌时向父级发送 `frame:theme`，同时本地先行应用避免闪烁。
     - `src/components/tabs.js` 处理 `frame:theme`：父级 `KUI.theme.apply(id, {persist:true})`，由主题模块广播回**所有** iframe（含整壳、其他标签、已打开的弹窗）；同时支持 `frame:theme-request` 主动索取当前主题。
     - `standalone/theme.html`、`pages/theme.html` 的主题切换入口（卡片 / 下拉 / 上一套 / 下一套 / 随机）全部改为经 `KUI.frame.setTheme()` 转发；独立打开（非 iframe）时行为不变。
     - **9 个 `standalone/*.html` 统一补引 `src/frame/kui-frame.js`**：此前只有 `pages/*` 内嵌页能收到「父 → 子」的 `theme:apply`，`standalone/*` 作为标签打开时不会跟随整壳换肤；现在父级换肤会同步到所有已打开的标签（含 standalone 演示页）。
     - 附带修复 `tabs.js` 的全局事件绑定：`KUI.events.on` 并不存在，改为优先 `KUI.bus.on`，避免静默失效。

3. **多级菜单点击父项无法展开**
   - 根因：`menu.js` 的交互逻辑正常（会给 `li` 加 `is-open`），但 `components.css` 只有 `.kui-menu__sub` 的样式块，缺少「默认收起 / `.is-open` 展开」的规则。
   - 修复：补 `.kui-menu__item > .kui-menu__sub { display:none }`、`.kui-menu__item.is-open > .kui-menu__sub { display:flex + 展开动画 }`、`@keyframes kui-menu-sub-in`（淡入 + 轻微下移）、三级/四级缩进递进（`padding-left` 50px / 64px）、`prefers-reduced-motion` 降级；箭头沿用原有 `rotate(90deg)` 规则（未重复添加）。

### 回归

- `tools/smoke.js` 新增 [7] 回归段（冒烟总数 22 → 28，双版本全绿）：
  1. 所有 `pages/*.html` 必引 `core/registry.js`；
  2. 所有 `standalone/*.html` 必引 `src/frame/kui-frame.js`；
  3. `config.resolveUrl('config/demos/form.json')` 能拼出站点根路径；
  4. 多级父项展开后 `is-open` 生效 + `components.css` 展开规则存在；
  5. `frame:theme` 子→父通道在 `tabs.js` / `kui-frame.js` / `standalone/theme.html` / `pages/theme.html` 四端齐备；
  6. **运行时**：模拟 iframe 发送 `frame:theme`，断言父级 `KUI.theme.currentId()` 真的切到 `sakura`，再恢复原主题。
- 全部测试与兼容性校验重跑（Node 13.14 / Node 24 双版本）：`test/run.js` 30/0/0 ×2、`smoke.js` 28/0 ×2、`check-compat.js` PASS、`check-assets.js` 18 HTML 0 错误 0 警告。

### 升级提示

- 若是自建页面（未用 `pages/` 模板），务必按 `index.html` 的顺序引入 `src/core/registry.js`（`kui.js` 之后、`controls/index.js` 之前均可）。
- iframe 内切换主题请调用 `KUI.frame.setTheme(id)` 而不是只用 `KUI.theme.apply(id)`，否则仅当前 iframe 变色。
- 自定义业务页若要在标签内跟随整壳换肤，需引入 `src/frame/kui-frame.js`（它同时提供 `frame.ready/toast/dialog/height` 等握手能力）。

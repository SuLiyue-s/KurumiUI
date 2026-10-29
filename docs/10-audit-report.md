# KurumiUI · 源码 ↔ 测试一致性 & 组件可拆装审计报告

- 审计版本：**v1.3.5**
- 审计时间：2026-10-27
- 审计触发：用户要求「审计检查源码和测试用的代码是否一致；检查各部件是否都可以随意拆卸、组装，是否符合项目要求；对最终检查的问题需要修复的修复，最后给一份报告」
- 审计工具（均入库、可重复执行）：
  - `tools/audit-consistency.js` —— 源码 ↔ 测试 ↔ 构建产物一致性（17 项，v1.3.6 新增 E4 控件类型清单）
  - `tools/audit-components.js` —— 组件拆解 / 组装矩阵（17 项）
  - `tools/audit-all-pages.js` —— 18 个页面「未注册元素」巡检
  - `tools/smoke.js` [25] 段 —— 把关键一致性固化为冒烟断言（防回归）

---

## 一、结论摘要

| 维度 | 结果 |
| --- | --- |
| 源码 ↔ 测试 ↔ 构建产物一致性 | **17 / 17 通过**（v1.3.5 发现并修复 3 处真实漂移；v1.3.6 新增 E4 后仍全绿） |
| 组件可拆解（最小模块集独立渲染） | **7 / 7 通过**（menu / menunav / tabs / dialog / toast / form / app-shell） |
| 组件可组装（注册表裸挂载） | **34 / 34 通过**，注册表共 **40 个类型 / 8 个分类** |
| 独立渲染页（standalone） | **11 / 11 通过**（可单独打开、自带 profile、不生成整壳） |
| 页面级「未注册元素」巡检 | **18 / 18 通过** |
| 回归（双 Node） | smoke **90 / 0** ×2、test **30 / 0 / 0** ×2、check-assets **20 HTML 0 错 0 警** |

**结论：框架满足「由可拆解多组件组成」的要求；测试代码此前存在「跑的不是线上那份代码」的隐患，已从机制上根除。**

---

## 二、发现的问题（3 处真实漂移 + 1 处测试脆弱点）

### P1（严重）测试加载清单手写，已与源码脱节

- **现象**：`test/load-kui.js` 里的 `CORE_FILES` / `COMPONENT_FILES` 是**手写清单**，只覆盖 6 个 core 文件；
  而源码后来新增了 `tooltip.js`、`diag.js`、`handlers.js`、`dom-enhance.js`、`avatar.js` 等模块。
- **后果**：测试跑的是**残缺的运行时**——少了 tooltip / avatar / handlers / dom-enhance，
  于是「测试全绿」不能代表线上行为（例如 v1.3.4 的 tooltip 修复，测试环境里甚至没有 tooltip 模块）。
- **修复**：重写 `test/load-kui.js`，**所有清单从唯一事实来源 `config/kui-modules.json` 派生**
  （与线上下发的 `src/core/kui-all.js` 使用同一份清单），并保留旧导出名以兼容既有用例。
  同时把「控件子文件」改为读取 `KUI.controls.files` 后再串行加载，避免再次手写。
- **验证**：加载文件数 **20 → 28**；注册表 **39 → 40 个类型**（补回 avatar）；`test/run.js` 30/0/0。
- **回归保护**：审计项 E2 改为「语义等价」检查——`require('test/load-kui.js')` 的 `APP_FILES`
  必须与 `kui-modules.json` 的 app profile **完全一致**，且脚本必须从该 JSON 派生（防止有人再手写）。

### P2（中）发布版本号不一致

- **现象**：`package.json` 的 `version` 还停在 `1.0.0`，而 `KUI.version` 已是 `1.3.4`。
- **后果**：npm / CI / 版本自愈（`?kui_v=`）都会读到错误版本；「版本自愈」链路的日志也会误导排查。
- **修复**：`package.json` version 同步为 `1.3.5`（并纳入审计项 C：四处版本必须一致）。
- **回归保护**：smoke `[25.1]` 断言 `KUI.version === package.version === kui-frame fallback === dom-enhance VERSION`。

### P3（轻）审计脚本自身写错了 dialog-frame 的期望清单

- **现象**：一致性审计要求 `src/frame/dialog-frame.html` 引用 `src/core/handlers.js`。
- **事实**：dialog-frame 是**独立精简文档**，只需要 `theme-boot / kui / tooltip / icons / registry /
  config / theme / theme-art / dom-enhance / controls/index / form / dialog-frame.js`；
  业务函数（handlers）由**父页**执行，弹窗侧只做动作转发。
- **修复**：更正审计脚本的期望清单（同时保留「dialog-frame 不得引 kui-all」的反向断言）。

### P4（脆弱点）冒烟断言里写死版本号

- **现象**：`tools/smoke.js [24.1]` 断言 `KUI.version === '1.3.4'`，每次升版都要改测试。
- **修复**：改为**格式断言** `/^1\.\d+\.\d+$/`，版本正确性交给 `[25.1]` 的「四处一致」检查。

---

## 三、一致性矩阵（源码 ↔ 测试 ↔ 产物）

| # | 事实来源 | 检查项 | 判定方式 | 结果 |
| --- | --- | --- | --- | --- |
| A1 | `config/kui-modules.json` | JSON 可解析、schema 合法 | 解析 + schema 字段 | ✔ |
| A2 | 同上 | 清单内所有文件存在 | `fs.existsSync` 全量 | ✔ |
| A3 | 同上 | app / standalone 两 profile 差异符合预期 | 差异集合比对 | ✔ |
| A4 | 同上 | 关键加载顺序（core 先于组件、registry 先于组件、controls 先于 form…） | 顺序断言 13 条 | ✔ |
| B | `src/core/kui-all.js` | 是自动生成产物、覆盖 app profile 全部模块 | 标记 + 清单包含 | ✔ |
| C1 | 版本号 | `KUI.version` / `package.json` / `kui-frame.js` / `dom-enhance.js` 四处一致 | 字符串比对 | ✔（已修 P2） |
| C2 | 版本号 | `tooltip.js` 自身版本存在 | 正则 | ✔ |
| D1 | 19 个 HTML | 单入口：均引 `kui-all.js` + `theme-boot.js`，且带 `data-kui-profile` | 逐文件扫描 | ✔ |
| D2 | `dialog-frame.html` | 独立精简清单完整且**不使用** kui-all | 期望清单 + 反向断言 | ✔（已修 P3） |
| E1 | `test/load-kui.js` | 文件存在 | 存在性 | ✔ |
| E2 | 同上 | **与 `kui-modules.json` 语义等价**（由 JSON 派生） | `require` 后比对 `APP_FILES` | ✔（已修 P1） |
| F | smoke / test 脚本 | 不出现「过期版本号」断言 | 正则扫描 | ✔（已修 P4） |

---

## 四、组件可拆装矩阵

### 4.1 拆解：只加载「最少依赖」也能独立渲染

> 每个用例都新建独立沙箱，只注入下列模块（不含 app-shell / bootstrap / 其它组件），然后直接渲染。

| 组件 | 最小依赖模块 | 结果 |
| --- | --- | --- |
| `menu` | core(kui/icons/registry/config/tooltip/dom-enhance) + menu.js | ✔ 渲染出 `.kui-menu` |
| `menunav` | core + menunav.js | ✔ 渲染出 `.kui-menunav` |
| `tabs` | core + tabs.js | ✔ 渲染出 `.kui-tabs` |
| `dialog` | core + dialog.js | ✔ `KUI.dialog.alert()` 自建弹层 |
| `toast` | core + toast.js | ✔ `KUI.toast.show()` 自建提醒层 |
| `form` | core + controls/index + 控件子文件 + form.js | ✔ `KUI.form.create()` 渲染字段 |
| `app-shell` | core + 5 组件 + app-shell.js | ✔ `KUI.app.create()` 装配整壳 |

### 4.2 组装：注册表每个类型都能裸挂载

- 裸挂载（`KUI.mount` 到空 `div`）：**34 / 34 通过**（排除 5 个 shell 组件与 app-shell 本身，它们由 4.1 覆盖）。
- 注册表快照：**40 个类型 / 8 个分类**

| 分类 | 数量 | 类型 |
| --- | --- | --- |
| shell | 5 | menu, menunav, tabs, dialog, toast |
| layout | 4 | divider, field, form, app-shell |
| control | 19 | input, password, textarea, number, select, multiselect, checkbox, checkbox-group, radio, radio-group, switch, slider, rating, color, date, daterange, month, time, datetime |
| action | 2 | button, link |
| display | 5 | avatar, tag, badge, icon, text |
| data | 3 | table, pagination, upload |
| feedback | 2 | progress, alert |

### 4.3 独立渲染页（standalone）

- **11 / 11** 页面可单独打开：`menu / menunav / tabs / dialog / toast / form / controls / theme / no-shell / handlers / avatar`
- 每页均满足：引 `src/core/kui-all.js` + `data-kui-profile="standalone"` + `data-kui-auto="false"`，**不会**自动生成 `.kui-app` 整壳。
- 其中 8 页有对应 `config/demos/*.json`（JSON 驱动渲染）。

### 4.4 依赖边界

- `menu / menunav / tabs / dialog / toast` 五个组件文件**没有**在 IIFE 顶层硬依赖 `KUI.app` / `KUI.boot`
  （允许运行时存在性判断），因此可以被单独引入使用。

---

## 五、修复清单

| # | 文件 | 改动 | 影响 |
| --- | --- | --- | --- |
| 1 | `test/load-kui.js` | 重写为从 `config/kui-modules.json` 派生；控件子文件按 `KUI.controls.files` 加载；导出旧常量以兼容 | 测试从此与线上同源（28 文件 / 40 类型） |
| 2 | `package.json` | version 1.0.0 → 1.3.5；新增 `audit` / `audit:consistency` / `audit:components` 脚本 | 版本可自愈、审计可一键复跑 |
| 3 | `tools/audit-consistency.js` | 修正 dialog-frame 期望清单；E2 改为「语义等价」断言 | 审计本身正确，且能防手写清单回潮 |
| 4 | `tools/smoke.js` | [24.1] 版本号断言改为格式断言；新增 `[25] 源码与测试一致性` 3 项 | 冒烟 **90 / 0**，升版不再需要改测试 |
| 5 | `src/core/kui.js`、`src/frame/kui-frame.js`、`src/core/dom-enhance.js` | 版本 1.3.4 → 1.3.5 | 缓存穿透版本戳统一 |
| 6 | `docs/09-audit-report.md`（本文件） | 新增 | 审计结论留档 |

---

## 六、回归验证（修复后全量重跑）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 冒烟（Node 24） | `node tools/smoke.js` | **90 / 0** |
| 冒烟（Node 13.14） | `.tools/node-v13.14.0-win-x64/node.exe tools/smoke.js` | **90 / 0** |
| 测试（Node 24） | `node test/run.js` | **30 / 0 / 0**（2084ms） |
| 测试（Node 13.14） | `.tools/node-v13.14.0-win-x64/node.exe test/run.js` | **30 / 0 / 0**（5107ms） |
| 资源引用 | `node tools/check-assets.js` | 20 个 HTML，**0 错 0 警** |
| 一致性审计 | `node tools/audit-consistency.js` | **16 / 0 / 0** |
| 组件拆装审计 | `node tools/audit-components.js` | **17 / 0** |
| 全页面巡检 | `node tools/audit-all-pages.js` | **18 / 18** |

一键复跑：

```bash
npm run audit          # 一致性 + 可拆装
npm run smoke          # 冒烟
npm test               # 测试
```

---

## 七、遗留与建议

### 7.1 处置状态（v1.3.6）

| # | 遗留项 | 状态 | 说明 |
| --- | --- | --- | --- |
| R1 | `test/config.test.js` 控件类型写死 | ✅ 已修复 | `test/load-kui.js` 新增 `controlTypes()` 从注册表派生；用例 4 与 `EXPECTED_CONTROL_TYPES` 双向 `deepStrictEqual`；审计新增 **E4** 静态扫描（兼容 `KUI.controls.define()` 与 `registry.register()`） |
| R2 | 冒烟 90 项需分节执行 | ✅ 已修复 | `tools/smoke.js` 支持 `--only=list` / `--only=N[,M]`（断言级过滤 + 跳过计数）；新增 `[26]` 搜索断言 |
| R3 | `dialog-frame.html` 唯一显式清单 | 保持 | 有意设计（独立精简文档）；审计 D2 已固定期望清单，新增模块需同步 |
| R4 | 视觉类需真实浏览器 | 保持 | 本轮用 REA Chromium 探针覆盖候选弹窗与点选链路 |

### 7.2 原始建议
1. **`test/config.test.js` 仍显式断言 33 个控件类型**（历史值）；实际注册表为 40 类型 / 19 个 `control`。
   它当前用「至少包含」口径，不影响通过，但建议后续改为从注册表派生，与本次 load-kui 的思路一致。
2. `tools/smoke.js` 已 90 项，建议后续按「模块」拆成多段并支持 `--only=` 过滤，缩短反馈时间。
3. `dialog-frame.html` 仍是唯一「显式脚本清单」的文档（有意为之：它必须极简、且不能依赖
   kui-all 的 profile 机制）。若后续再加模块，需要同步 `tools/audit-consistency.js` D2 的期望清单。
4. 视觉类问题（颜色对比、动画细节）仍无法被 dom-stub 覆盖，建议保持「真实 Chromium 探针 + 截图」
   作为发布前人工确认项（本轮 v1.3.x 各修复均已如此验证）。

---

*本报告由 Lead 生成；所有数字均为 2026-10-27 在本机（Windows / Node v24.14.0 + v13.14.0）真实执行所得。*

---

## 8. v1.3.8 配置读取点审计（新增）

> 触发：用户 m07686 指出「`app.json` 的 `boot` 段运行时完全不生效」，要求一次同类缺陷的全面审计。

### 8.1 方法

1. **静态读取点扫描**：新增 `tools/audit-config.js`，读取 `config/app.json` 全部 468 个叶子键，在 `src/**/*.js` 中查找 `键名` / `键名:` / `["键名"]` / `'键名'` / `props.键名` 等读取形态；动态数据子树（`text.*` 字典、`dialogs.settings.data`、`menu.items`、`boot.stages`、`theme.picker.…` 等）进白名单（37 项）；
2. **运行时证据**：dom-stub 加载完整运行时，调用 `KUI.boot.appliedBootConfig`、`KUI.dialog.config()`、`KUI.registry` 核对；
3. **真实浏览器**：DSH 浏览器打开 `index.html` / `standalone/boot.html`，核对页脚版本/版权、品牌 `logoText`、主题选择器标题与列数、`boot.clock.size` 生效。

### 8.2 发现（4 类，全部修复）

| # | 问题 | 影响 | 修复 |
| --- | --- | --- | --- |
| P1 | `configureBootLayer` 有定义无调用 | `app.json.boot` 整段失效 | `applyBootConfig()` 接线（含 `enabled:false` 语义） |
| P2 | `app.*` / `brand.logoText` / `footer.subtitle|copyright` 无渲染点 | 文档承诺、配置无效 | `applyAppMeta` + `menu.js` + `components.css` |
| P3 | `theme.picker.*`、`ui.dialog.escClosable`、`boot.clock.smooth`、`tabs.props.keepAlive` 声明未消费 | 改配置无效果 / 语义误导 | 逐项接上读取点（见契约 §20.4） |
| P4 | `dialog.config()` 深合并未写回 `DEFAULTS` | `ui.dialog.*` 静默不生效（P3 的元凶） | 合并结果回写 |
| P5 | 无 `type` 容器节点丢弃 `style/attrs`；弹窗 `subtitle` 无渲染点 | `theme.picker.columns` / `.desc` 声明被静默忽略 | `renderNode` 容器走 `decorate()`；`dialog-frame` 新增 `renderSubtitle()` |
- **P6：`KUI.setStyle` 驼峰键被静默丢弃**（v1.3.8 修复）——`el.style.setProperty('gridTemplateColumns', ...)` 非法属性名被 CSSStyleDeclaration 忽略；现象为主题选择器 `columns:3` 不生效（6 卡竖排）、卡片 `borderColor`（theme.picker 卡片边框）不生效。修复：非自定义属性统一转 kebab 后写入。

### 8.3 残余（已知、不修或部分修）

- `boot.clock.mode: "none"`：CSS 只实现 `spin` 与 `progress`，`none` 视觉同 `progress`（用 `clock.enabled:false` 替代）；
- `text.json` 的 `boot.title/subtitle/text` 受「显式 patch 优先」影响，需保持 `app.json.boot` 同名字段为空；
- `ui.dialog` 下的深层样式键（如 `radius`）仍走 CSS token，不是 JSON 配置项（文档已注明）。

### 8.4 回归数字（本机 Node v24.14.0 + v13.14.0）

`tools/smoke.js` 108/0；`test/run.js` 33/0/0；`test/render` 10/0；`test/config` 5/0；`audit-consistency` 17/0；`audit-components` 19/0；`audit-all-pages` 19/19；`check-assets` 21 HTML 0/0；`audit-config` 0 缺口；`check-manual` 0/0。

## 9. 源码 ↔ 产物一致性核对（v1.3.8 补记）

针对「源码和编译后运行代码是否一致 + 版本是否一致」新增 `tools/verify-build.js`（`npm run verify:build`），检查项与结论：

| 检查 | 方法 | 结论 |
| --- | --- | --- |
| 模块清单 ↔ 构建脚本 | `config/kui-modules.json` 两个 profile 的文件必须存在于源码树 | 通过（app=29 / standalone=28） |
| 产物 ↔ 清单 | `src/core/kui-all.js` 内嵌的模块表与清单逐项相同 | 通过（确定性产物，哈希可复现） |
| 产物 ↔ 源码 | 重建后 `src/core/kui-all.js` 与仓库内文件逐字节相同 | 通过 |
| 版本一致性 | `package.json` / `src/core/kui.js` / `src/frame/kui-frame.js` / `src/core/dom-enhance.js` | 通过（均为当前版本） |
| HTML 引用 | 入口 HTML 引用的脚本与样式文件均存在 | 通过（21 HTML） |
| `config/bundle.js` | 内嵌模块版本/哈希与源码一致 | 通过（`meta.generatedAt` 为时间戳，不参与哈希断言） |

> 说明：`config/bundle.js` 是 git 忽略的本地运行产物，`meta.generatedAt` 每次重建都会变；判断是否过期看 `modules[].version`（模块内容哈希）而不是整文件哈希。

## 11. v1.3.9 接线缺陷审计（2026-10-29）

| # | 缺陷 | 类别 | 修复 |
| --- | --- | --- | --- |
| P1 | `menu.props.width/collapsedWidth` 写入无人消费的变量 | 变量名不一致 | menu 双写 + app-shell 优先级 |
| P2 | `menunav.props.breadcrumb.max` 只合并不读取 | 字段无读取点 | 归一 `maxBreadcrumb`（两条路径） |
| P3 | `dialogs.settings.desc/draggable/layout` 未透传 | 透传白名单遗漏 | openSettings 透传三字段 |
| P4 | 设置弹窗保存不生效 | 配置 id 与应用映射不一致 | `KUI.boot.applySettings` 映射 5 个 id + 旧字段兼容 |
| P5 | `boot.ready` 无读取点 | 字段无读取点 | 主流程末尾读取 |
| P6 | select/multiselect `autofocus` 恒 false | 参数对象错误 | `p(ctx,…)` → `p(node,…)` |

同类排查：`tools/audit-config.js` 复跑仍 0 缺口（468 叶子 / 431 受检）；新增 smoke [29] 作为回归闸门。

回归：`test/run.js` 33/0/0（双 Node）；`smoke` 108/0；`audit-config` 0；`check-manual` 0/0；`check-assets` 21/0/0；`audit-components` 19/0；`audit-all-pages` 19/19。

## 12. v1.4.0 数据表格组件（datatable）审计

**方法**：同 §3——源码为准、测试与文档为对照。对新增组件逐项核对：注册清单、模块清单、样式加载、初始化链路、测试覆盖、文档口径、拆装与降级路径。

**结论：0 处需修复的缺陷，1 处已修的自查项**。

### 12.1 一致性矩阵

| 维度 | 源码 | 测试/工具 | 文档 | 结果 |
| --- | --- | --- | --- | --- |
| 注册 | `datatable.js:1540` `registry.register('datatable', …)`，`category:'data'` | smoke `[30.1]`；`test/render.test.js` 契约清单（`data` 类不参与 19 控件比对） | 契约 §22、配置参考 §11、手册 08 §6.6 | ✅ |
| 模块清单 | `src/components/datatable.js` 进 `profiles.app.files`(30) / `profiles.standalone.files`(29) | `audit-consistency` A1–A3、`verify-build` | README/手册计数 | ✅ |
| 样式 | `src/styles/datatable.css`，`base.css` 起 `@import` | `check-assets` 22 HTML 0 错 0 警 | 手册 08 §6.6 | ✅ |
| 一体化 props | `DEFAULTS`（columns/data/search/filter/sort/selection/pagination/toolbar/…） | smoke `[30.2]` JSON 渲染 | 配置参考 §11 字段表 | ✅ |
| 实例 API | `createDatatable` 返回 30+ 方法；`KUI.datatable` 静态委托 | smoke `[30.3]`；`test/render.test.js` | 契约 §22、手册 08 §6.6.4 | ✅ |
| 事件 | `fire(name)` → `api.on` + `KUI.bus.emit('datatable:'+name)` | 手册/契约事件表 | ✅ |
| 列格式 | 12 种 `format`（text/number/date/boolean/tags/badge/dict/link/progress/code/ellipsis/actions） | `standalone/datatable.html` 面板 ① | README/手册 | ✅ |
| 拆装降级 | 移除 `datatable.js` 后 type 渲染为未注册占位 | `audit-components` 拆解矩阵 | 手册 08 §6.6.5 | ✅ |
| 测试页 | `standalone/datatable.html`（6 面板） | `audit-all-pages` 20/20（曾因页面文案含「未注册的元素类型」被探针误判，已把文案改为「未知类型占位块」） | 手册 08 §6.6 | ✅ 已修 |

### 12.2 自查中修复的项

- **页面文案触发审计探针**：`standalone/datatable.html` 原写「…该类型显示『未注册的元素类型』占位…」，被 `tools/audit-all-pages.js` 当作真实未知类型渲染。改为「未知类型占位块」，语义不变、探针恢复。
- **注册类别选择**：初版注册为 `category:'control'`，会破坏 `test/config.test.js` 对「19 个表单控件」的权威比对；改为 `'data'`（与 `table`/`pagination` 一致），表单控件数量保持 19。
- **原生 select 标记**：主题下拉最初缺 `data-kui-native`，被控件升级器接管后与页面脚本互相打架；已补标记（与其余 12 个 standalone 页一致）。

### 12.3 残余与说明

- 分页控件中的「更多页」按钮仍沿用基础 `table` 的 `more-horizontal` 图标名笔误（历史遗留，GitHub 图标集里只有 `more-h`），已在手册 06 记录；datatable 走同一 `kui-datatable__pager` 渲染，显示为占位问号的风险仍存在，列入下次图标别名修复项。
- 大数据量（>1 万行）仍建议服务端分页：当前 `data` 全量进内存，排序/筛选在客户端完成。

## 13. v1.4.1 未消费资产审计（字段 / 样式 / 函数 / API）

> 需求（用户）：「检查是否存在未消费的字段、样式、函数、api，如果有需要修复。展示页的头像缓存在浏览器了，但是刷新后失效，怀疑该缓存未被消费，需要检查是否存在同类问题。」

### 13.1 方法

先人工按「写入点 → 读取点」逐链路走查（storage / CSS token / data-* / 函数 / API），再把可自动化的判定沉淀为 `tools/audit-unused.js`，纳入 `npm run audit` 与 smoke `[31]` 长期门禁：

| 检查 | 判定方式 | 门禁 |
| --- | --- | --- |
| A storage 键 | 收集 `localStorage/sessionStorage` 的读写键，比较写集合与读集合 | 只写不读 = ERROR；只读不写 = WARN |
| B CSS 变量 | CSS 里 `--kui-*` 定义/`var()` 引用，并合并 `src/themes.json` 运行时 token 与 JS `setProperty` | 定义未引用 / 引用未定义 = ERROR |
| C `data-*` 属性 | JS `setAttribute`/`dataset` 写入 vs CSS/JS `getAttribute`/`hasAttribute`/`data-*` 读取 | 只写不读 = WARN |
| D 死函数 / 未引用样式类 | 顶层函数声明与调用计数；样式类在 js/html/json/md 中的出现 | 死函数 = ERROR；未引用类 = INFO（公共工具类豁免） |

### 13.2 发现与修复

| # | 发现 | 级别 | 处理 |
| --- | --- | --- | --- |
| P1 | 头像持久化：`create()` 取 `options.url \|\| stored`，配置默认图恒真 → 用户更换的头像刷新后被覆盖 | 功能缺陷 | 改 `stored \|\| options.url`；补 render 用例 + smoke `[31.3]`；真实浏览器刷新验证 |
| P2 | `dialog-frame.html` 引用 3 个不存在的 token（`--kui-control-hover` / `--kui-control-active` / `--kui-control-text-hover`），聚焦/悬浮配色落空 | 样式缺陷 | 7 处改为真实 token（见 `docs/02-config-reference.md` §18 token 表） |
| P3 | 9 个函数从未被调用（control-base / selects / datatable / form / avatar / theme / kui-frame） | 死代码 | 删除；`node --check` + 全量闸门通过 |
| P4 | 缺少「未消费资产」的自动检查，同类问题会反复出现 | 流程缺陷 | 新增 `tools/audit-unused.js`，接入 `npm run audit` / `audit:unused` / smoke `[31]` |
| P5（INFO） | 87 个样式类在 js/html/json/md 中未出现 | 公共工具类 | 人工复核后保留：`--kui-*` 工具类（flex/gap/anim/text/scroll/truncate/sr-only/glass 等）、状态类、以及 `base + '--' + modifier` 动态拼接类（尺寸/类型/badge 变体） |

### 13.3 同类链路核查（无缺陷，记录以防回归）

| 链路 | 写 | 读 | 结论 |
| --- | --- | --- | --- |
| 主题 | `theme.apply` → localStorage | `theme` 初始化 + `theme-boot.js` 首屏预置 | ✅ 对称 |
| 菜单折叠 | `app-shell` 写 `kui-menu-collapsed` | 初始化时读 | ✅ 对称 |
| 启动偏好 | `applySettings` 写 `kui-shell-name` / `kui-start-tab` / `kui-remember-tab` / `kui-last-tab` / `kui-density` | `applyStoredPrefs` 读 | ✅ 对称（smoke `[29.3]`） |
| 弹窗 frame 自愈标记 | `kui-frame` 写 sessionStorage | 同文件读 | ✅ 对称 |
| 诊断标记 | `?kui_debug=1` 只读 URL | 无写入 | ✅ 有意只读 |

### 13.4 残余与说明

- INFO 87 项不逐一列出（`node tools/audit-unused.js --json` 可导出）；判定为公共 CSS 钩子/状态类/动态拼接类，删除会破坏按 `class` 自定义样式的用户配置。
- 审计为静态扫描：通过字符串拼接、运行时算出名字的键/类仍可能漏检；新增「写入侧」代码时同步补读取点是维护约定（契约 §23）。

## §14 第 34 轮同类问题审计（v1.4.2）

**审计范围**：用户第 34 轮指出的「原生控件 / 选中高亮 / 选择框样式 / 菜单可达 / 覆盖率」五类问题，逐类做全仓同类扫描。

### 14.1 浏览器原生控件

- 扫描 `src/**` 中 `createElement('select'|'input'|'radio'|'checkbox'|'textarea')` 与模板字符串 `<select>`：
  - `src/components/datatable.js`：列筛选、每页条数 → **已改为 `KUI.dropdown`**（v1.4.2）；
  - `src/components/controls/misc.js`：pagination sizer → **已改为 `KUI.dropdown`**；
  - 其余命中均为合规：隐藏 `input[type=file]`（上传/头像选图）、控件自身构建（`control-base.js` 的 checkbox/radio 标记输出 `.kui-checkbox` 等框架类）。
- 页面级扫描：6 个页面缺 `controls.css` → 已补齐；`check-assets` 现对「页面引用控件但未加载控件样式」给出警告（见 §14.5）。

### 14.2 斑马纹 / 交互态覆盖

- 全仓 `:nth-child(even)`：仅 `datatable.css` 一处（已修）；`menu`、`tabs`、`table`（基础表格）列表类均使用无条纹或用 `:not(.is-selected)`。
- 结论：同一类缺陷仅 datatable；已补充 smoke `[32.3]` 静态断言防回归。

### 14.3 自绘选择框样式

- 全仓 `.…__check*` 自定义勾选样式：仅 datatable（已删除），改用 `.kui-checkbox` / `.kui-radio`；其他组件（toast/dialog/form）无自绘选择器。
- `smoke [32.4]` 断言 datatable 源码不得再出现 `kui-datatable__check` 类名。

### 14.4 文案占位符（双花括号）

- `grep` 兜底文案中 `{{` 的 15 处（分页、工具栏、空态、列设置等），全部经 `KUI.fmt` 渲染；修复 `fmt` 后统一生效，无需逐处改文案。
- 结论：这是「模板语法不一致」类系统缺陷，已用 `fmt` 兼容而非多点修补；`test/render.test.js` 增加 `{{a.b}}` 用例。

### 14.5 页面资源完整性（新增检查）

- `tools/check-assets.js` 扩展：页面若引用 `KUI.form`/`KUI.controls` 相关控件（源码含 `type: 'form'`、`radio-group`、`checkbox-group` 等）却未 `<link controls.css>`，输出 WARNING。
- 当前 22 个 HTML 全部 0 错误 0 警告。

### 14.6 菜单可达性

- `config/app.json` 菜单项由 19 → 21，新增 `boot-lab`（`standalone/boot.html`）与 `datatable-lab`（`standalone/datatable.html`），两页从此可从菜单直达；`smoke [32.5]` 断言菜单含这两项。
- `pages/*.html` 由首页快捷卡片与菜单共同覆盖；`audit-all-pages` 20/20（挂载未知类型 0）。

### 14.7 覆盖率

- 新增 `tools/coverage.js`；`npm run coverage` → 45.6%（9867/21657 行，38 文件）。未覆盖集中在 `controls/*`（表单控件细节分支）与 `frame/*`（iframe 协议回调），属预期；已在手册 02 说明「覆盖率不是门禁，仅用于定位盲区」。

### 14.8 残余风险

- `KUI.dropdown` 面板挂在 body：页面自身设置 `transform` 的容器内锚点，定位以 `getBoundingClientRect` 计算（已验证 scroll/resize 关闭），极端嵌套变换场景未覆盖。
- 覆盖率统计基于 V8 行区间，`document.write` 动态注入的页面级代码会被计入但不一定执行。

### 14.9 选择/高亮一致性（第 35 轮修复，v1.4.2 内）

- 缺陷：行点击只更新 `activeKey`（`is-active`），勾选状态本应同步却各自演化；`syncSelectionUi()` 仍按旧类名 `.kui-datatable__check-input` 查询，导致行选择器、单选互斥、表头三态全部失效。
- 修复：登记 `rowItemEls / rowInputRefs / headSelectRef` 引用表并重写 `syncSelectionUi()`；有选择列时行点击=勾选切换、高亮统一由 `.is-selected` 承担（无选择列才用 `is-active`）。
- 回归：`test/render.test.js` 新增 4 组断言（行点击联动 / 单选互斥 / 表头三态 / CSS 分层），`tools/smoke.js [32.5]` 改为断言 CSS 顺序（条纹 → 选中/高亮 → 悬停）与悬停叠加色。
- 同类扫描：全仓 `.is-active` 仅 datatable 行高亮与分页按钮、滤镜栏状态，语义各自独立，无需统一；行/表头选择器类名无其它组件复用。

## §15 v1.4.3 表格行状态样式审计（2026-10-30）

**范围**：`src/styles/datatable.css` 行状态（条纹 / 选中 / 高亮 / 悬停）与主题 scheme 叠色。

### P1 特异度竞争导致偶数行状态被覆盖（已修）
条纹规则 `.is-striped .kui-datatable__body .row:nth-child(even)` = (0,5,0)，高于 `.row.is-selected` (0,2,0) 与 `.is-hoverable .row:hover` (0,3,0)。偶数行选中底色被条纹盖掉，悬停叠色混入不同底色后观感不一致。修法：条纹规则排除 `.is-selected` / `.is-active`，状态与悬停各用独立属性，不再依赖书写顺序。

### P2 悬停叠色缺少亮色主题版本（已修）
v1.4.2 只用不透明深灰 `--kui-control-bg-hover`，在亮色皮肤上叠加后对比不足。修法：`--kui-dt-hover-overlay` 在 `:root[data-kui-scheme="light"]` 下切换为黑色低透明度；选中行悬停额外用 `--kui-dt-hover-selected`（accent）叠色。

### P3 同类问题扫描（结论）
- 其它组件（controls / form / menu / tabs / dropdown / dialog / toast）hover 均使用 `background-color` 或 token 变量，未发现「`background` 简写重置叠加层」的同型写法；
- `audit-unused.js` 复跑：ERROR 0 / WARN 0 / INFO 87，新增 token 均被引用；
- 回归防护：`smoke [32.9]/[32.10]` 与 `test/render.test.js` 覆盖「条纹排除状态行」「悬停使用 background-image」「scheme 叠色 token」。

## 16. v1.4.4 审计：悬停叠色主题化（P1）

- **P1 选中行悬停色未主题化**：`--kui-dt-hover-selected` 写死 `rgba(226,32,64,.16)`，与 `--kui-accent` 的六套主题色脱钩。修复：改由 `.kui-datatable` 从 `--kui-accent-soft` 派生；`:root` 仅保留 scheme 中性叠色。
- **同类扫描**：全库检索 `--kui-` 变量中直接写死 `rgba(` 且语义为 accent 的位置——`--kui-dt-hover-selected` 为唯一一处；其余 accent 类颜色均引用 `--kui-accent*` / `--kui-selection-*` token，未发现同类缺陷。
- 回归：`test/run.js` 37/0/0（Node24 & Node13.14）、`smoke.js` 126/0、`check-assets` 22/0/0、`audit-consistency` 17/0、`audit-components` 19/0、`audit-all-pages` 20/20、`audit-config` 0 缺口、`audit-unused` ERROR 0 / WARN 0、`verify-build` 6/0、`check-manual` 与 `check-beginner-manual` 0/0。

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

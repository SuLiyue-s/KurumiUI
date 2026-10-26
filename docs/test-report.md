# 09 · 测试与兼容性报告

> 产出方：test 队友（测试与兼容性负责人）。覆盖契约 §15 的 compat / config / server / render 四类自动验证。
> 基线：[`docs/00-contract.md`](./00-contract.md)（§2 技术约束、§5 渲染协议、§6 控件协议、§7 联动、§8 组件、§13 主题、§14 standalone、§15 测试要求）。
> 验收对照：[`docs/08-acceptance.md`](./08-acceptance.md)。

## 1. 运行方式

```bash
# 全部测试（当前 Node，本机为 v24.14.0）
node test/run.js

# 全部测试（真实 Node 13.14.0，兼容性硬门槛）
".tools/node-v13.14.0-win-x64/node.exe" test/run.js

# 只跑某一类（可逗号组合）
node test/run.js --only=compat
node test/run.js --only=config,server
node test/run.js --only=render --verbose

# 其他开关
node test/run.js --list          # 列出套件
node test/run.js --strict        # SKIP 也计为失败（验收收口时用）
```

测试零依赖（只用 Node 内置 `fs/path/vm/assert/http/net/child_process`），不联网、不写业务文件；服务端用例只在 `.tools/node-v13.14.0-win-x64/node.exe` 存在时做真实 Node13 语法校验。

## 2. 最近一次结果（双版本）

| 套件 | Node 13.14.0（真实） | Node 24.14.0（系统） | 用例数 |
| --- | --- | --- | --- |
| compat（禁用语法 / ESM / 真实 node13 语法校验） | 7 PASS / 0 FAIL / 0 SKIP | 7 PASS / 0 FAIL / 0 SKIP | 7 |
| config（JSON schema / 注册表 type / 主题完整性） | 4 PASS / 0 FAIL / 0 SKIP | 4 PASS / 0 FAIL / 0 SKIP | 4 |
| server（HTTP / MIME / 安全 / 全量静态文件） | 11 PASS / 0 FAIL / 0 SKIP | 11 PASS / 0 FAIL / 0 SKIP | 11 |
| render（注册表 / tabs 保活 / 弹窗 / toast / 主题 / 表单联动） | 8 PASS / 0 FAIL / 0 SKIP | 8 PASS / 0 FAIL / 0 SKIP | 8 |
| **合计** | **30 PASS / 0 FAIL / 0 SKIP** | **30 PASS / 0 FAIL / 0 SKIP** | 30 |

- Node13 全量耗时约 4.9s，Node24 约 1.8s；两版均 `=> PASS`，退出码 0。
- 最终复核时间：2026-10-25 22:49（Asia/Shanghai），`controls.css` 落盘后重跑（node13 4951ms / node24 1815ms）。
- `src/styles/controls.css` 交付后，server 的 pages/standalone 两个用例（此前因引用资源缺失 SKIP）已自动转 PASS，**当前无任何 SKIP**。
- 沙箱环境（本仓库开发所用 DSH 会话）禁止嵌套子进程：`child_process.fork` 会 `spawn EPERM`，server 用例自动降级为同进程 `createServer + listen(0)` 并打印 WARN；在普通终端（沙箱外）会优先真实 fork，验收时请用普通终端复核一次 node13 全量。

## 3. 用例清单与覆盖点

### 3.1 compat（`test/compat.test.js` + `tools/check-compat.js`）——7 例

| 用例 | 覆盖 |
| --- | --- |
| 黑名单命中 fixtures（行号精确） | 18 条禁用语法规则在 `test/fixtures/bad-syntax.js.txt` 的 `MARK_*` 定位；severity（error/warn）与 suggestion 齐全 |
| 字符串/注释/正则/模板不误报 | `maskCode` 状态机；模板 `${}` 内代码仍检查、字面量被遮蔽；`safe-syntax.js.txt` 零违规 |
| HTML 内联脚本提取 + type=module 检查 | `<script>` 提取、`baseLine` 偏移（文件行 = 开标签行 + 脚本内行 - 1）、`type="module"` 直接报 ESM 错误 |
| 全项目扫描零违规 | 实测：**36 个 JS + 18 个 HTML（含 16 段内联脚本）+ 13 个 JSON**，禁用语法 error=0、warn=0、JSON 解析错误=0 |
| Node 13.14 语法校验覆盖 | Node13 运行时用进程内 `vm.Script`（等价 `--check`，真实 v13.14.0 解析器）；普通终端逐文件 `spawn node13 --check`；受限沙箱降级当前运行时并 WARN；语法失败=0 |
| Node13 可执行文件存在 | `.tools/node-v13.14.0-win-x64/node.exe` 为 v13.14.0；node13 下断言 `process.execPath` 即该文件 |
| 规则表完整 & 不污染工作区 | 规则 id 齐全；根目录无 `kui-compat-*` 临时残留 |

禁用清单（error）：`?.`、`??`、`||=`、`&&=`、`??=`、`.replaceAll(`、`.at(`、`Object.fromEntries`、`structuredClone`、`Object.hasOwn`、`Array.prototype.flat/flatMap`、私有字段 `#x`、ESM `import/export` 语句与动态 `import()`、`Intl.RelativeTimeFormat`、顶层 `await`。注释与字符串里的同形文本不会误报。

### 3.2 config（`test/config.test.js`）——4 例

| 用例 | 覆盖 |
| --- | --- |
| JSON 全部可解析 | `config/**/*.json`（含 9 个 demos）+ `src/themes.json`；app/text/themes/menu/form 等关键文件必须存在 |
| app.json 必需字段 | `schema`、app 元信息、首页、loading 文案、`dialogs.settings.nodes`、`theme.default/storageKey/visible`、`layout`、`menu/menunav/tabs` 顶层 type、text 段 |
| themes.json 六套齐全 | kurumi / kurumi-angel / starry / sakura / abyss / dawn；default=kurumi；每套 ≥30 个 `--kui-*` token 且含 9 个核心 token；scheme/art.layers kind 合法；与 `config/demos/theme.json` 交叉校验一致 |
| 配置 node.type 均在注册表 | 用 dom-stub 加载 core+controls 后读 `KUI.registry`；共校验 **121 个节点类型引用**（app.json + 9 个 demo），39 个注册 type 全覆盖，无未知 type |

### 3.3 server（`test/server.test.js`）——11 例

覆盖：启动（优先 fork，受限沙箱同进程降级）、`/` 与 `/index.html` 200/Content-Type/Content-Length/字节与磁盘一致、HEAD 语义、**全量枚举静态文件逐个 GET 比对字节**、CSS/core JS/config JSON 的精确 MIME、pages 业务页（`kui-frame.js` 为最后一个业务脚本、无外链、引用可解析、不生成整壳）、standalone 九页（`data-kui-auto="false"`、不引 bootstrap/app-shell、无外链）、404、非法百分号编码 / 非法 UTF-8 / NUL → 400、**路径穿越**（HTTP 层任意 `..` 段 400 + `resolveSafe` 单元口径）、目录无 index.html → 403、非 GET/HEAD → 405、关闭后端口释放（无孤儿进程）。

### 3.4 render（`test/render.test.js`）——8 例

在 `test/dom-stub.js` 的 vm 沙箱按 index.html 顺序加载 20 个脚本（core 6 + controls 入口及子控件 + form + menu/menunav/tabs/dialog/toast/app-shell），逐项断言：

| 用例 | 关键断言（对应验收点） |
| --- | --- |
| 注册表完整性 | 39 个 type = 32 控件 + 7 组件；`date/daterange/month/time/datetime` 为 picker 权威命名；每个 def 有 render 与 category |
| **tabs 保活**（核心） | 同一 tab 连续切换 3 次以上：`iframe` **节点引用不变**、`__srcSetCount === 1`（src 只在首次 activate 设置一次）、未激活 pane 只 hidden；关闭 B 不重建 A |
| 弹窗即 iframe | `KUI.dialog.alert()` 返回 Promise，layer 内 `iframe[src*="dialog-frame.html"]`、src 只设一次；sendMessage resolve 后 240ms 动画结束移除 DOM、`dialog.count()===0` |
| toast | `KUI.toast.success()` 出现 `.kui-toast`；超时自动消失；`closeAll()` 后归零 |
| 主题 | `KUI.theme.apply('starry')` 后 `currentId`/`data-kui-theme`/`--kui-accent` 与主题 token 一致；**旧 token 清理**用临时注册主题（独有 token 切回 kurumi 后被 `removeProperty` 清除） |
| 表单联动 | `KUI.form.create` 渲染字段；`setValue('mode','sms')` 后 mail `is-hidden`+`is-disabled`+取消必填，phone 显示+必填；切回反向恢复；`setVisible/setDisabled` 编程接口生效；destroy 清理 class |
| standalone 拆解 | 只加载 `standalone/menu.html` 的外部脚本：不生成 `.kui-app` 整壳、body 不进入 `kui-ready`、不自动挂载菜单 DOM |
| 联动算子全量 | `evalWhen` 对 eq/ne/in/nin/contains/notContains/gt/gte/lt/lte/empty/notEmpty/truthy/falsy/regex 及 all/any 组合 20 组用例全绿 |

## 4. 本轮发现并已修复的问题

| # | 位置 | 现象 | 处理 |
| --- | --- | --- | --- |
| 1 | `server.js:153`（`send` + `fs.createReadStream`） | `res.end(ReadStream)` 在 Node13/24 抛 `ERR_INVALID_ARG_TYPE`，异常在 `fs.stat` 回调内未被捕获 → **任何静态 GET 都让 server 进程退出** | 已报 lead；改为 `body.pipe(res)` + error 监听 `res.destroy()`，复测通过（本套件覆盖） |
| 2 | `server.js` `resolveSafe` | 旧实现先 `path.posix.normalize`，`/..%2fpackage.json` 被钳回根内（200/404 而非拒绝） | 已报 lead；改为 decode 后逐段检查 `..` → 一律 400；本套件 HTTP + 单元双覆盖 |
| 3 | `src/components/form.js`（联动 `applyState`） | `is-disabled` 只同步到 `.kui-form__item`，未同步到 `.kui-field` 包装，消费方按 `.kui-field` 查询会漏状态 | 已报 lead 并修复（form.js:901-902 同时 toggle 两层），render 表单用例转 PASS |
| 4 | 测试侧口径（非产品 bug） | ① 注册表误用 `datepicker/timepicker`（权威命名是 `date/time`）② 误以为 starry 有 kurumi 未定义的 token（6 套主题 token 键集合相同是设计）③ `registry.list()` 是轻量视图（render 需用 `registry.get(type)`） | 均已修正，见 `test/render.test.js`、`test/load-kui.js` |

## 5. 已知限制与观察（如实说明）

1. **controls.css 已交付**（`src/styles/controls.css`，约 99.7KB）→ pages/standalone 用例已转 PASS，全部套件 0 SKIP。后续若页面新增引用资源而未落盘，server 用例会以「等待交付资源」SKIP 提示，而不是误报 404。
2. **沙箱内无法真实 fork**：server 用例自动同进程降级并打印 WARN；`tools/check-compat.js` 的语法校验也会自动切换模式（Node13 进程内 vm → 普通终端 spawn node13 → 受限沙箱降级当前运行时 + WARN）。最终验收建议在沙箱外普通终端跑一次 `node test/run.js`（node13 与 node24 各一次），可消除两类 WARN。
3. **Node24 的 `url.parse` 弃用告警**：server.js 用 `url.parse` 解析请求，Node24 会打印 `DEP0169 DeprecationWarning`（Node13 无）；不影响功能与断言。lead 决定**暂不修改**（改 WHATWG `URL` 存在 trailing slash / 编码等行为差异风险），作为后续优化项保留。
4. **compat 扫描的边界**：字符串/注释/正则里的同形文本不误报，但 JS 里拼接出来的现代 API 名字（如 `'replace' + 'All'`）无法静态识别；依赖真实 Node13 语法解析（`vm.Script`）兜底语法层，运行时 API 差异靠禁用清单约束。
5. **页面的「不生成整壳」属于 dom-stub 级验证**：本仓库沙箱不能起浏览器，像素级视觉与真实 iframe 内交互需按 `docs/08-acceptance.md` §4 人工走查。
6. **测试对工作区的副作用**：server 用例在普通终端优先 fork `server.js`，启动时 `tools/build-config.js` 会重建 `config/bundle.js`（gitignore 的构建产物，属预期行为）；其余用例只读文件，不写仓库。

## 6. 与其它文档的口径核对

- `docs/08-acceptance.md` 中的 config 套件数字（4 PASS / 0 SKIP）、30/30、39 type=32 控件+7 组件、smoke 28/0 已由 lead 同步更新，与本报告一致。
- 其中「集成冒烟 `tools/smoke.js` 26 / 0」为 lead 侧冒烟数字，不属于 `test/run.js` 套件，本报告未复核；v1.0.1 新增的 [7] 回归段（pages 必引 registry / 多级菜单展开 / 主题子→父通道）由 lead 在 Node 13.14 与 Node 24 下各跑一次确认。

## 7. 交接提示

- 测试文件：`test/run.js`（入口）、`test/dom-stub.js`（零依赖 DOM）、`test/load-kui.js`（按 index.html 顺序加载运行时）、`test/compat.test.js`、`test/config.test.js`、`test/server.test.js`、`test/render.test.js`、`test/fixtures/`、`tools/check-compat.js`。
- 新增/修改产物时：跑 `node test/run.js`；涉及语法/API 的改动同时跑 node13；新增控件记得补进 `test/load-kui.js` 的 `EXPECTED_CONTROL_TYPES`（若希望严格核对其注册）。
- 每次改动后请确认 `--only=compat` 仍然零违规（尤其新增 HTML 内联脚本与 `src/**/*.js`）。

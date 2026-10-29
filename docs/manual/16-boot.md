# 16 · 加载层组件 boot：启动屏、时钟指针进度与拆装指南

> 适用版本：KurumiUI v1.4.4 ｜ 前置章节：[03-assembly.md](03-assembly.md)、[04-config-app.md](04-config-app.md)、[08-components.md](08-components.md) ｜ 阅读时长：约 50 分钟

## 本章目标

- 说清 v1.3.8 的加载层改了什么：为什么从「`index.html` 里的一坨内联 HTML + 内联样式」变成「注册类型 `boot` + 独立 `boot.css` + 静态 API + 实例 API」。
- 能背出「0% → 100% 对应 0 时 → 12 时」的指针算法，手算任意百分比的时针 / 分针角度与时钟读数，并能解释 0% 与 100% 都显示 `12:00` 的原因。
- 能逐字段说出 `config/app.json` 的 `boot` 段与 `config/text.json` 的 `boot` 组每个键的含义、默认值与**真实消费状态**——历史：v1.3.7 曾有一处**接线缺口**，v1.3.8 已接通，本章用源码行号与实测结果证明。
- 会用 4 种装配方式（`type:"boot"` 节点渲染、`KUI.mount`、`KUI.bootLayer.create`、`KUI.bootLayer.attach`）与 14 个实例 API，并知道各自「坑」在哪里。
- 能自己搭一个「只用加载层」的页面，或把这套加载层原样搬进别的项目（含最小文件清单与 HTML 模板）。
- 能按排错表定位「加载层不出现 / 一直 `12:00` / 改成 `app.json` 不生效 / 关闭后仍显示」等问题，并跑完验收命令。

本章是**使用向**文档：讲清楚「它是什么、怎么配、怎么调、怎么拆、怎么搬」。加载层的产生背景与验收过程见仓库根目录的 [CHANGELOG.md](../../CHANGELOG.md) 的 `v1.3.8` 一节；组件语法与渲染管线见 [08-components.md](08-components.md)、[03-assembly.md](03-assembly.md)。

---

## 0. 先看结论：一张图认识 v1.3.8 加载层

```text
           ┌─────────────────────────────────────────────────────────────┐
           │ index.html 里保留的静态骨架 #kui-boot（首帧立即可见，防白屏）│
           │  logo（CSS 转齿轮） + title + sub + bar(0%) + text           │
           └───────────────────────────┬─────────────────────────────────┘
                                       │ boot.js 已随 kui-all.js 加载
                                       ▼
   bootstrap.js boot()  ──►  KUI.bootLayer.attach()  ──►  接管 #kui-boot，
                                       │                  清空并重建内部 DOM
                                       │                  （logo 换成时钟表盘）
                                       ▼
   四个阶段：setStep(1) ─► 读配置 ─► setStep(2) ─► 应用主题 ─► setStep(3)
              ─► 创建 app-shell ─► setStep(4) ─► done()（is-done → 360ms 后移除节点）
                                       │
                                       ▼
                        boot:done { app, cost }   // 启动完成
```

一句话定位：**加载层现在是一个普通注册组件（`type: "boot"`，`category: "shell"`），但仍然默认由 `bootstrap.js` 驱动**。你可以完全不动它（默认启动屏），也可以只把它拿去做别的页面（`create` / `attach`），还可以把整个组件从 profile 里删掉（退回静态骨架）。

相关源码与规模：

| 文件 | 规模 | 职责 |
| --- | --- | --- |
| `src/components/boot.js` | 533 行 | 组件本体：注册 `type:"boot"`、时钟数学、DOM 构建、实例 API、`KUI.bootLayer` 静态 API |
| `src/styles/boot.css` | 334 行 | 加载层全部样式：遮罩层、表盘、指针、进度条、读数、错误卡片、内嵌预览容器 |
| `standalone/boot.html` | 424 行 | 官方独立测试页：交互测试台、映射表、JSON 驱动渲染、API 表、拆装说明、日志 |
| `src/app/bootstrap.js` | 870 行 | 启动器：调用 `KUI.bootLayer.attach/configure/done/error`（**`configure` 的调用点在 v1.3.8 缺失**，见 §5.5） |

与 v1.3.6（历史版本）的差异：

| 维度 | v1.3.6 及以前 | v1.3.8 |
| --- | --- | --- |
| DOM 来源 | `index.html` 手写静态骨架，无 JS 渲染 | 组件 `buildNode()` 生成；静态骨架仅作降级 |
| 样式来源 | `index.html` 内联 `<style>` | 独立 `src/styles/boot.css` |
| 可注册 | 否 | 是：`type:"boot"`，可 `renderNode` / `mount` |
| 运行时控制 | 无（只有显示/隐藏） | `KUI.bootLayer` 静态 API + 14 个实例方法 |
| 进度表达 | 一条 CSS 进度条 | 进度条 + **表盘时分针随进度旋转** |
| 配置 | 仅 `app.app.loading`（旧） | `app.json` 的 `boot` 段 + `text.json` 的 `boot` 组 |
| 可拆装 | 不可 | 是：删掉 `boot.js` 自动退回静态骨架；也可单独页面使用 |

---

## 1. 加载层在整体架构中的位置

### 1.1 三个层次，别混淆

| 层次 | 名字 | 存在形式 | 何时生效 | 能否单独使用 |
| --- | --- | --- | --- | --- |
| ① 静态降级骨架 | `#kui-boot`（`index.html:28-36`） | 纯 HTML + `boot.css` | 首帧立刻显示；`boot.js` 缺失时一直保留 | 是（只引 CSS 即可看） |
| ② 注册组件 | `boot`（`src/components/boot.js`） | `KUI.registry` 里的类型 | 被 `renderNode` / `mount` / `create` / `attach` 触发 | 是（`standalone/boot.html`） |
| ③ 启动器 | `KUI.boot()`（`src/app/bootstrap.js:1071`） | 全局函数 | `index.html` 的 `#kui-app` 存在且 DOM 就绪时自动跑 | 是（`standalone` 页没有它） |

三者关系：③ 在启动时调用 ② 的 `attach()`；② 会把 ① 的 `#kui-boot` 节点「接管」并重建内部。② 不存在时，③ 退回操作 ①（legacy 分支，见 `bootstrap.js:25-126` 的 `bootNode()` / `setBootText()` / `hideBoot()`）。

### 1.2 加载顺序与 profile

`config/kui-modules.json` 定义两个 profile，`boot.js` 两个都加入：

| profile | 条目数（含 `config/bundle.js`） | `boot.js` 位置 | 典型入口 |
| --- | --- | --- | --- |
| `app` | 29 | 第 28 条（`config/kui-modules.json:28`） | `index.html`（`data-kui-profile="app"`） |
| `standalone` | 28 | 第 62 条（`config/kui-modules.json:62`） | `standalone/*.html`、`pages/*.html` |

加载顺序中 `boot.js` 位于 `toast.js` 之后、`bootstrap.js` 之前（app profile），所以当 `bootstrap.js` 执行 `KUI.bootLayer` 时组件一定已就绪；而 `standalone` profile 里没有 `bootstrap.js`，因此独立页要自己调 `attach`（见 §10.3）。

`boot.js` 的依赖只有核心层，**不依赖 app-shell / menu / tabs**：

- `KUI.registry`（注册类型）、`KUI.bus`（事件）、`KUI.text`（文案回退）、`KUI.h`（建 DOM 的底层会用到 `document`）；
- 样式依赖 `base.css` 的 `--kui-*` token，但没有 base.css 也能显示（`boot.css` 每个 `var()` 都带兜底色）。

### 1.3 与 `theme-boot.js` 的分工

两者名字都带 boot，但职责完全不同，别写错位置：

| 文件 | 目的 | 位置要求 | 时机 |
| --- | --- | --- | --- |
| `src/core/theme-boot.js` | 首帧前把当前主题 token 写进 `<html>`，**防 FOUC 闪色** | `index.html` 的 `<head>` **第一段脚本**（`index.html:5`） | 早于任何 CSS 渲染 |
| `src/components/boot.js` | 显示**加载中**画面、进度、指针动画、错误卡片 | 随 `kui-all.js` 在 `</body>` 前加载（`index.html:51`） | 页面骨架就绪后 |

### 1.4 可拆装的设计目标

CHANGELOG 记录的原始需求是：加载中页面要「可以单独自由拆卸、组装，且时钟图案增加一项时钟指针动画」。落到源码上就是四条硬约束：

1. **删得掉**：从 profile 删 `boot.js` 后，`bootstrap.js` 自动退回静态骨架，不能白屏、不能报错。
2. **单拿得走**：`standalone/boot.html` 证明它能在没有菜单/标签/外壳的页面里独立渲染。
3. **配置驱动**：阶段文案、时钟大小、刻度数等应来自 JSON，而不是写死在 JS 里。
4. **零依赖、无构建**：仍是 classic `<script>`，`file://` 双击可用。

> ⚠ 约束 3 在 v1.3.8 只完成了一半：字段定义齐了，但 `bootstrap.js` 忘记把 `appCfg.boot` 交给组件（详见 §5.5）。这是本章最重要的「坑」，先记住结论。

---

## 2. 60 秒看到效果

### 2.1 在主应用里看默认启动屏

```bash
# 任意 shell，在仓库根目录
npm start
# 等价于 node server.js；默认 http://127.0.0.1:8080
```

打开 `http://127.0.0.1:8080/index.html`，把网速调到「Slow 3G」（DevTools → Network → Throttling）后刷新，能清楚看到 4 个阶段依次出现：

| 阶段 | 进度 | 文案（来自 `text.json`） | 时钟读数 |
| --- | --- | --- | --- |
| `setStep(1)` | 8% | 正在加载界面配置… | `00:57` 左右（8% → 57.6 分钟） |
| `setStep(2)` | 46% | 正在应用界面风格… | `05:31` 左右（46% → 331.2 分钟） |
| `setStep(3)` | 78% | 正在构建界面… | `09:21` 左右（78% → 561.6 分钟） |
| `setStep(4)` | 100% | 结界已就绪 | `12:00` |

> 实测读数可用控制台验证：`KUI.bootLayer.handsAt(8).clockText` → `"00:57"`，`handsAt(46).clockText` → `"05:31"`，`handsAt(78).clockText` → `"09:21"`。

开发时也可以直接开诊断面板（URL 加 `?kui_debug=1`）观察启动耗时与错误，原理见 [15-troubleshooting.md](15-troubleshooting.md) §1。

### 2.2 用独立测试页看全部形态

```bash
npm start
# 浏览器打开：http://127.0.0.1:8080/standalone/boot.html
```

这一页是官方「加载层实验室」，共 6 个区块（行号对应 `standalone/boot.html`）：

| # | 区块标题 | 行 | 你能在里面做什么 |
| --- | --- | --- | --- |
| 一 | 交互测试台（内嵌预览 + 全屏演示） | 69 | 内嵌预览实例、全屏 `attach()`、常驻/关闭、Esc 收尾 |
| 二 | 进度 ↔ 指针映射（纯函数 `handsAt`） | 100 | 9 组采样对照表，看清 0/25/50/75/100 的指针落点 |
| 三 | JSON 驱动：只渲染加载层 | 113 | 三个 `{"type":"boot"}` 节点：最小配置 / 小表盘 / 43% 半程 |
| 四 | API 与配置字段 | 148 | 静态 API / 实例 API / 配置字段速查表 |
| 五 | 拆掉 / 单独用加载层 | 190 | 4 条拆装说明（整壳 / 仅页面 / 仅算法 / 仅样式） |
| 六 | 操作日志 | 201 | 每次 API 调用的返回与异常都打在这里 |

按钮区还能演示：`inline`（内嵌）、`fullscreen`（全屏带自动进度）、`fullscreen-hold`（常驻不自动关）、`stage`（按阶段走）、`anim`（0→100 循环）、`spin`（表盘自转）、`error`（错误卡片）、`state`（打印 `getState()`）、`reset`（重建预览——注意实例 API 本身**没有** `reset` 方法，页面里的「重置」是销毁后重新 `create`）、`percent`（任意百分比）。

### 2.3 `file://` 双击也能用

加载层不依赖网络请求（`boot.js` / `boot.css` 已内联进 `kui-all.js` 与静态文件），所以双击 `index.html` 也能看到启动屏。但配置 JSON 在 `file://` 下 `fetch` 不到，需要先构建兜底包：

```bash
npm run build:config   # 生成 config/bundle.js
# 然后直接双击 index.html
```

### 2.4 控制台三条探针

打开任意含 `boot.js` 的页面，在控制台执行：

```js
KUI.version;                       // "1.3.8"
KUI.bootLayer.version;             // `"1.0.0"` 组件自身版本号，与框架版本独立
KUI.bootLayer.handsAt(50);         // {percent:50,totalMinutes:360,hourAngle:180,minuteAngle:0,hour12:6,clockText:"06:00"}
```

---

## 3. 核心算法：进度 ↔ 时钟指针

### 3.1 需求翻译成数学

需求：「加载进度 0% 至 100% 分别对应时钟的 0 时至 12 时，要注意时针和分针的指向位置。」

拆成两个映射：

1. **进度 → 时间**：`0%` 是 0 时（12 点整），`100%` 是 12 时（又一个 12 点整），中间线性。因为表盘是 12 小时制，一整圈 = 720 分钟，所以 `总分钟 = percent / 100 × 720`。
2. **时间 → 角度**：
   - 时针 12 小时走 360°，所以 `时针角 = 总分钟 / 720 × 360`（每小时 30°，每分钟 0.5°）；
   - 分针 60 分钟走 360°，所以 `分针角 = (总分钟 mod 60) / 60 × 360`（每分钟 6°）。

### 3.2 公式表

| 量 | 公式 | 范围 | 备注 |
| --- | --- | --- | --- |
| 夹取后的进度 `p` | `clamp(percent, 0, 100)` | 0–100 | 非数字按 0 处理（`clampPercent`） |
| 总分钟 `totalMinutes` | `p / 100 * 720` | 0–720 | 保留 4 位小数 |
| 时针角 `hourAngle` | `totalMinutes / 720 * 360` | 0–360 | 连续走，不是「整点跳一格」 |
| 分针角 `minuteAngle` | `(totalMinutes % 60) / 60 * 360` | 0–360 | 每 60 分钟归零 |
| 整点小时 `hour12` | `totalMinutes / 60` | 0–12 | 小数形式，如 `4.5`；**0% 时为 0**（读数请看 `clockText`） |
| 读数 `clockText` | `pad2(floor(totalMinutes/60)) + ':' + pad2(floor(totalMinutes%60))`，0% 与 100% 特判为 `12:00` | `00:00`–`11:59` / `12:00` | 用 `Math.floor`，所以 99% 是 `11:52` 而不是四舍五入的 `11:53` |

### 3.3 `handsAt(percent)` 返回字段全表

定义在 `src/components/boot.js:101-122`。

| 字段 | 类型 | 含义 | 示例（percent=50） | 使用方 |
| --- | --- | --- | --- | --- |
| `percent` | number | 夹取后的进度 | `50` | `setProgress` 写 `--kui-boot-progress`、`data-boot-percent` |
| `totalMinutes` | number | 进度换算出的总分钟 | `360` | 仅供读数/调试 |
| `hourAngle` | number | 时针旋转角度（deg） | `180` | `refs.hourHand.style.transform` |
| `minuteAngle` | number | 分针旋转角度（deg） | `0` | `refs.minuteHand.style.transform` |
| `hour12` | number | 12 小时制的小时（小数） | `6` | 一般不用；0% 为 `0`，100% 为 `12` |
| `clockText` | string | 表盘读数 | `"06:00"` | `.kui-boot__meta-clock` 文本 |

> 注意返回对象里**没有 `minute` 字段**：分钟数只能从 `totalMinutes % 60` 或 `clockText` 推。`totalMinutes`、`hourAngle`、`minuteAngle`、`hour12` 都做了 `round(..., 4)`，但 `clockText` 用的是 `Math.floor`，两者可能差 1 分钟（例如 99.9% 的读数是 `11:59`，而角度早已接近 359.6°）。

### 3.4 采样映射表（可直接当验收基线）

| percent | totalMinutes | hourAngle | minuteAngle | clockText | 直观说法 |
| --- | --- | --- | --- | --- | --- |
| 0 | 0 | 0 | 0 | `12:00` | 12 点整（起点） |
| 1 | 7.2 | 3.6 | 43.2 | `00:07` | 时针在 12 与 1 之间，分针指向 7 分 |
| 12.5 | 90 | 45 | 180 | `01:30` | 1 点半 |
| 25 | 180 | 90 | 0 | `03:00` | 3 点整（表盘右上） |
| 37.5 | 270 | 135 | 180 | `04:30` | 4 点半 |
| 50 | 360 | 180 | 0 | `06:00` | 6 点整（正下方） |
| 62.5 | 450 | 225 | 180 | `07:30` | 7 点半 |
| 75 | 540 | 270 | 0 | `09:00` | 9 点整（正左方） |
| 87.5 | 630 | 315 | 180 | `10:30` | 10 点半 |
| 99 | 712.8 | 356.4 | 316.8 | `11:52` | 接近 12 点，但时针差 3.6° |
| 100 | 720 | 360 | 0 | `12:00` | 12 点整（终点） |

### 3.5 边界与反直觉点

1. **0% 与 100% 都显示 `12:00`**：代码用 `hourAngle≈360 → 360`、`minuteAngle≈360 → 0` 收口浮点噪音，并把 `totalMinutes >= 720 || < 1e-9` 的小时/分钟特判为 `12:00`（`src/components/boot.js:107-113`）。
2. **`hour12` 在 0% 是 0、在 100% 是 12**：因为它是 `totalMinutes/60`，不是读数。要做「0→12 连续」的数值展示时，请自己处理 0 特例，或用 `clockText`。
3. **99% 读数不是 `11:59`**：`Math.floor` 截断分钟，712.8 分钟 = 11 小时 52.8 分 → `11:52`。
4. **越界夹取**：`handsAt(-10)` 等价于 0%，`handsAt(150)` 等价于 100%，不会产生负角度或超过 360° 的指针。
5. **指针是连续动画，不是跳格**：CSS `.kui-boot__hand { transition: transform .5s cubic-bezier(.22,.68,.28,1) }`（`src/styles/boot.css:138-146`），所以 `setProgress` 从 8% 跳到 46% 时，指针会在 0.5 秒内平滑转过去；`prefers-reduced-motion: reduce` 下过渡被关闭（`boot.css:176-180`）。

### 3.6 手算与代码验证

```js
// 任意百分比 → 指针角度 + 读数
function myHandsAt(percent) {
  var p = Math.max(0, Math.min(100, Number(percent) || 0));
  var totalMinutes = p / 100 * 720;
  var hourAngle = totalMinutes / 720 * 360;
  var minuteAngle = (totalMinutes % 60) / 60 * 360;
  var h = Math.floor(totalMinutes / 60);
  var m = Math.floor(totalMinutes % 60);
  if (totalMinutes >= 720 || totalMinutes < 1e-9) { h = 12; m = 0; }
  return { percent: p, hourAngle: hourAngle, minuteAngle: minuteAngle, clockText: (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m) };
}

myHandsAt(0);    // { percent:0,   hourAngle:0,     minuteAngle:0,     clockText:'12:00' }
myHandsAt(25);   // { percent:25,  hourAngle:90,    minuteAngle:0,     clockText:'03:00' }
myHandsAt(62.5); // { percent:62.5,hourAngle:225,   minuteAngle:180,   clockText:'07:30' }
myHandsAt(100);  // { percent:100, hourAngle:360,   minuteAngle:0,     clockText:'12:00' }
```

> 不要在业务里重复实现它：`KUI.bootLayer.handsAt` 与实例方法 `inst.handsAt` 都是同一份实现，直接调用即可。

---

## 4. DOM、样式与主题定制

### 4.1 组件渲染出的 DOM 树

`buildNode()`（`src/components/boot.js:162-252`）生成如下结构（`mode: "inline"` 时根节点多一个 `kui-boot--inline` 类）：

```text
div.kui-boot[data-boot-layer="true"][data-boot-clock="on"][data-boot-clock-mode="progress"]
   │                [data-boot-bar="progress"][data-boot-percent="0"][style="--kui-boot-progress:0%"]
   │                [role="status"][aria-live="polite"]
   └─ div.kui-boot__inner
        ├─ div.kui-boot__clock[style="--kui-boot-size:74px"][aria-hidden="true"]
        │    ├─ div.kui-boot__dial[style="--kui-boot-ticks:12"]
        │    ├─ span.kui-boot__hand.kui-boot__hand--hour[style="transform:rotate(0deg)"]
        │    ├─ span.kui-boot__hand.kui-boot__hand--minute[style="transform:rotate(0deg)"]
        │    └─ span.kui-boot__pin
        ├─ div.kui-boot__title
        ├─ div.kui-boot__sub（无副标题时 hidden）
        ├─ div.kui-boot__bar
        │    └─ span（宽度由 --kui-boot-progress 控制）
        ├─ div.kui-boot__text[data-boot-text="true"]
        ├─ div.kui-boot__meta（cfg.meta=false 时 hidden）
        │    ├─ span.kui-boot__meta-percent[data-boot-percent="0%"]
        │    ├─ span.kui-boot__meta-sep（"·"）
        │    └─ span.kui-boot__meta-clock[data-boot-clock-text="12:00"]
        └─ div.kui-boot__error（默认 hidden，error() 时才填内容）
```

### 4.2 静态骨架与组件 DOM 的差异

`index.html:28-36` 的静态骨架**多一个 `div.kui-boot__logo`**（CSS 动画齿轮），组件 DOM **没有 logo**——`buildNode` 会清空静态骨架内部并重建，所以 `attach()` 之后 logo 消失、换成时钟表盘。这不是 bug，`boot.css:68` 的注释写明了：

> 静态降级：如果只用 index.html 的裸骨架（没有加载 boot.js 组件），显示一个会转的齿轮环，保证首屏仍然完整。组件接管后 `.kui-boot__logo` 会被替换。

实测（`test/dom-stub` 环境）：构造带 logo 的静态骨架 → `attach()` → 查询 `.kui-boot__logo` 返回 `false`，`.kui-boot__clock` 返回 `true`。

| 元素 | 静态骨架（legacy） | 组件渲染 |
| --- | --- | --- |
| logo 齿轮 | ✅ 有（`boot.css` 动画） | ❌ 无（换成时钟） |
| 进度条 | ✅ 有，但**停在 0%** | ✅ 有，`setProgress` 驱动 |
| 百分比 / 读数 | ❌ 无 | ✅ 有（`meta:false` 可隐藏） |
| 步骤文案 | ✅ 有 `[data-boot-text]`，`setBootText` 可改 | ✅ 有 |
| 错误卡片 | ❌ 无（走 `bootstrap` 的页面级错误块） | ✅ 有（`inst.error()`） |

### 4.3 类名表（样式钩子）

| 类名 | 出现在 | 作用 |
| --- | --- | --- |
| `kui-boot` | 根 | 全屏遮罩：`position:fixed; inset:0; z-index:99999; flex 居中` |
| `kui-boot--inline` | 根 | 内嵌模式：`position:absolute; inset:0`（容器需 `position:relative`） |
| `kui-boot.is-done` | 根 | 淡出：`opacity:0; visibility:hidden; pointer-events:none` |
| `kui-boot.is-error` | 根 | 错误态（`cursor:default`，内部内容被替换成错误卡片） |
| `kui-boot__inner` | 子 | 内容列：`width:min(360px,78vw)`，入场 `kui-boot-rise .42s` |
| `kui-boot__logo` | 静态骨架 | 降级齿轮，`kui-boot-logo-spin 5.2s linear infinite` |
| `kui-boot__clock` | 组件 | 表盘定位与尺寸（`--kui-boot-size`） |
| `kui-boot__dial` | 组件 | 12 刻度：`repeating-conic-gradient` + 径向遮罩，不产生 12 个 DOM 节点 |
| `kui-boot__hand` | 组件 | 指针基类：`transform-origin:50% 100%`、`transition .5s` |
| `kui-boot__hand--hour` | 组件 | 时针：宽 3px、长 26%、`--kui-accent` 红 |
| `kui-boot__hand--minute` | 组件 | 分针：宽 2px、长 38%、`--kui-accent-2` 金 |
| `kui-boot__pin` | 组件 | 中心轴点 |
| `kui-boot__title` / `__sub` | 组件 | 主标题 / 副标题 |
| `kui-boot__bar` / `__bar > span` | 组件 | 进度条轨道 / 填充（宽 `var(--kui-boot-progress,0%)`） |
| `kui-boot__text` | 组件 | 当前阶段文案 |
| `kui-boot__meta` / `__meta-percent` / `__meta-sep` / `__meta-clock` | 组件 | 底部「百分比 · 读数」 |
| `kui-boot__error` / `__error-title` / `__error-msg` / `__error-detail` / `__error-tip` / `button` | 组件 | 错误卡片各部件 |
| `kui-boot-preview` | 测试页 | 内嵌预览容器（`position:relative; min-height`） |

### 4.4 `data-*` 属性表

| 属性 | 取值 | 谁写 | 谁是消费者 |
| --- | --- | --- | --- |
| `data-boot-layer` | `"true"` | 组件 | 样式/调试定位 |
| `data-boot-clock` | `"on"` / `"off"` | `buildNode` / `configure` | CSS：`"off"` 时隐藏时钟（`boot.css:257`） |
| `data-boot-clock-mode` | `"progress"` / `"spin"` / `"off"` | 同上 | CSS：`"spin"` 时表盘整体旋转（`boot.css:183-187`） |
| `data-boot-bar` | `"progress"` / `"indeterminate"` / `"off"` | 同上 | CSS：不确定态循环 / `"off"` 隐藏进度条（`boot.css:224-232`、`258`） |
| `data-boot-percent` | 数字字符串（根）/ `"43%"`（读数节点） | `setProgress` | CSS 变量之外的调试入口 |
| `data-boot-step` | `"1"`–`"4"` | `setStep` | 调试 / 外部样式钩子 |
| `data-boot-clock-text` | `"12:00"` 等 | `setProgress`（非 silent） | 调试 |
| `data-boot-text` | `"true"` | `buildNode` | `bootstrap.setBootText` 的 legacy 查询选择器 |

### 4.5 CSS 变量与主题 token

| 变量 | 默认 | 写在 | 作用 |
| --- | --- | --- | --- |
| `--kui-boot-size` | `74px` | `.kui-boot__clock`（`buildNode` / `configure` 写内联） | 表盘直径，指针长度按百分比跟着缩放 |
| `--kui-boot-ticks` | `12` | `.kui-boot__dial`（内联） | 刻度数量（`repeating-conic-gradient` 的 30deg 间隔由 CSS 固定为 12 格，**改此变量只影响可读性/覆盖样式**，见 §13 排错） |
| `--kui-boot-progress` | `0%` | 根内联 | 进度条填充宽度 |
| `--kui-bg-0` | `#08050a` | 主题 | 遮罩底色 |
| `--kui-bg-1` | `#141018` | 主题 | 表盘内底色 |
| `--kui-border` | `rgba(200,16,46,.45)` | 主题 | 表盘边框 |
| `--kui-accent` | `#c8102e` | 主题 | 时针主色 |
| `--kui-accent-hover` | `#e01436` | 主题 | 时针渐变末端、错误按钮 hover |
| `--kui-accent-2` | `#d4af37` | 主题 | 分针、刻度、轴点 |
| `--kui-accent-2-soft` | `rgba(212,175,55,.65)` | 主题 | 分针渐变末端 |
| `--kui-text-1` | `#ece6ee` | 主题 | 标题/正文颜色 |

> 除 `--kui-boot-*` 外全部是主题 token，换肤时加载层自动跟着变——这就是 `standalone/boot.html` 里换主题后表盘颜色也会变的原因。主题 token 全表见 [09-theme.md](09-theme.md)。

### 4.6 动画清单

| 动画 | 定义 | 触发 | 说明 |
| --- | --- | --- | --- |
| 指针旋转 | `.kui-boot__hand { transition: transform .5s cubic-bezier(.22,.68,.28,1) }`（`boot.css:145`） | 每次 `setProgress` | 0.5 秒平滑转到位；`spin` 模式下被 `transition:none` 取消 |
| 内容入场 | `kui-boot-rise .42s ease-out both`（`boot.css:61-66`） | 实例创建 | 透明度 + 上移 10px |
| logo 齿轮 | `kui-boot-logo-spin 5.2s linear infinite`（`boot.css:77`） | 静态骨架可见时 | 组件接管后元素被移除 |
| 表盘自转 | `kui-boot-clock-spin 5.2s linear infinite`（`boot.css:183-187`） | `clock.mode="spin"` | 用于「不确定进度」装饰 |
| 进度条不确定 | `boot.css:224-232` | `bar.mode="indeterminate"` | 填充块循环滑动 |
| 淡出 | `transition: opacity .32s ease, visibility .32s ease`（`boot.css:41`） | `hide()` / `done()` | 加 `is-done` 后淡出 |
| 降低动画 | `@media (prefers-reduced-motion: reduce)`（`boot.css:176-180`） | 系统设置 | 关闭指针过渡、logo 与 inner 动画 |

### 4.7 定制的三种做法

**做法 A：只改变量（推荐，不动 CSS 文件）**

```html
<style>
  /* 全局放大表盘、把分针改成青色 */
  .kui-boot { --kui-boot-size: 96px; }
  .kui-boot__hand--minute { background: linear-gradient(to top, #34d1ff, rgba(52,209,255,.6)); }
</style>
```

**做法 B：改 `boot.css`（组件级定制，升级时注意 reapply）**

```css
/* src/styles/boot.css 末尾追加 */
.kui-boot__inner { width: min(420px, 82vw); }        /* 内容更宽 */
.kui-boot__bar { height: 6px; }                        /* 进度条更粗 */
.kui-boot__title { letter-spacing: .18em; }            /* 标题字距 */
```

**做法 C：给单实例加类名（不污染全局）**

```js
var inst = KUI.bootLayer.create(host, { mode: 'inline' }, null);
inst.el.classList.add('my-boot-theme');   // 再用 .my-boot-theme .kui-boot__bar { ... } 覆盖
```

> 注意：`create(host, props)` 只接受两个参数（第三个参数不存在），上例第三个 `null` 是多余的，写 `create(host, props)` 即可。

---

## 5. 配置全字段表

### 5.1 配置在哪、谁读

| 配置 | 路径 | 读取方 | 用途 |
| --- | --- | --- | --- |
| 启动层默认值 | `src/components/boot.js:126-150` 的 `DEFAULTS` | `normalizeConfig` | 所有字段的最终兜底 |
| 应用级配置 | `config/app.json` 的顶层 `boot` 段（`config/app.json:38-48`） | `bootstrap.js` 的 `applyBootConfig`（v1.3.8 起接线，`:72-90`）→ `configureBootLayer`（`:56-64`） | 阶段、时钟、进度条、meta |
| 文案字典 | `config/text.json` 的 `boot` 组（`config/text.json:76-89`） | `KUI.text('boot.*')` | 各阶段文案、错误卡片文案 |

`config/app.json` 里现在实际写的是：

```json
{
  "boot": {
    "clock": { "enabled": true, "mode": "progress", "size": 74, "ticks": 12, "smooth": true },
    "bar": { "enabled": true, "mode": "progress" },
    "meta": true,
    "stages": [
      { "step": 1, "text": "正在加载界面配置…", "progress": 8 },
      { "step": 2, "text": "正在应用界面风格…", "progress": 46 },
      { "step": 3, "text": "正在构建界面…", "progress": 78 },
      { "step": 4, "text": "结界已就绪", "progress": 100 }
    ]
  }
}
```

### 5.2 `app.json` → `boot` 全字段表

「默认值」列来自 `DEFAULTS`；「app.json 现值」列是仓库里 `config/app.json:38-48` 的真实内容；「消费状态」说明 v1.3.8 运行时到底读不读它。

| 字段 | 类型 | 默认值 | app.json 现值 | 作用与消费状态 |
| --- | --- | --- | --- | --- |
| `boot.enabled` | boolean | `true` | 未写 | 是否启用加载层；v1.3.8 起有读取点：`false` 时不创建新实例，已创建实例会被 `destroy()`，并移除 `#kui-boot`、标记 `html[data-kui-boot="off"]`（`bootstrap.js:73-90`；见 §5.5） |
| `boot.mode` | string | `"fullscreen"` | 未写 | `fullscreen` 遮罩整页 / `inline` 嵌入容器；v1.3.8 起 `app.json` 的值经 `applyBootConfig` 传入，`inline` 会给根节点加 `.kui-boot--inline`（`boot.js:166`/`:327`） |
| `boot.title` | string | `""` | 未写 | 主标题；`DEFAULTS` 为空时用 `KUI.text('boot.title','KurumiUI')` 回退 |
| `boot.subtitle` | string | `""` | 未写 | 副标题；为空则隐藏 `.kui-boot__sub` |
| `boot.text` | string | `""` | 未写 | 初始阶段文案；为空时回退 `KUI.text('boot.text','正在加载界面配置…')`。**注意是字符串，不是对象** |
| `boot.meta` | boolean | `true` | `true` | 是否显示底部「百分比 · 时钟读数」 |
| `boot.hideDelay` | number | `360`（`HIDE_DELAY`，`boot.js:153`） | 未写 | `done()` 后延迟多少毫秒移除节点 |
| `boot.clock.enabled` | boolean | `true` | `true` | 关闭后 `data-boot-clock="off"`，CSS 隐藏时钟 |
| `boot.clock.mode` | string | `"progress"` | `"progress"` | `progress` 指针随进度 / `spin` 表盘自转 / `none` 无专门实现（指针仍随进度） |
| `boot.clock.size` | number | `74` | `74` | 表盘直径 px，写入 `--kui-boot-size` |
| `boot.clock.ticks` | number | `12` | `12` | 刻度数，写入 `--kui-boot-ticks` |
| `boot.clock.smooth` | boolean | `true` | `true` | 指针是否平滑；v1.3.8 起有读取点：写入 `data-boot-smooth="on\|off"`（`boot.js:173`/`:330`），`false` 时不走过渡（含 `prefers-reduced-motion`，见 §5.5） |
| `boot.bar.enabled` | boolean | `true` | `true` | 关闭后 `data-boot-bar="off"`，CSS 隐藏进度条 |
| `boot.bar.mode` | string | `"progress"` | `"progress"` | `progress` 普通 / `indeterminate` 不确定态循环 |
| `boot.stages` | array | 4 段 | 4 段 | 阶段表，`setStep(n)` 按 `step` 匹配后同时改文案与进度 |

### 5.3 `stages` 逐字段表

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `step` | number | ✅ | 阶段编号，必须与代码里 `setStep(n)` 的 `n` 相等才会命中 |
| `text` | string | ❌ | 命中后写入 `.kui-boot__text`；空字符串表示「不改文案」 |
| `progress` | number | ❌ | 命中后调用 `setProgress(progress)`；不写则进度不变 |

匹配逻辑在 `setStep`（`boot.js:297-309`）：遍历 `cfg.stages`，`Number(stages[i].step) === step` 时执行 `setText` + `setProgress` 并 `break`。**没有匹配项时只写 `data-boot-step` 属性**，不报错、不改文案——这是「我的阶段文案没生效」的最常见原因。

### 5.4 `text.json` → `boot` 全 12 键表

`config/text.json:76-89`，注入 `KUI.i18n` 后由 `KUI.text('boot.xxx')` 读取。

| 键 | 默认文案 | 读取点 | 生效状态 |
| --- | --- | --- | --- |
| `boot.title` | `KurumiUI` | `normalizeConfig`（`boot.js:445`）→ `configure` 的 `textCfg` | 🟡 有兜底但不改可见标题：v1.3.8 起 `applyBootConfig` 会传 `textCfg`，但主流程 `applyAppMeta` 已把 `app.name` 写进 `cfg.title`（非空），`textCfg` 只填空字段 |
| `boot.subtitle` | `CONFIG-DRIVEN UI FRAMEWORK` | 同上（`:446`） | 🟡 可兜底：`app.subtitle` 为空时 `textCfg` 会填上（v1.3.8）；非空则不覆盖 |
| `boot.loading` | `正在加载界面配置…` | `bootstrap.js:897-933`（`applyAppMeta` 的 `setText`）、`:971` | ✅ 阶段 1 文案 + 启动层初始文案 |
| `boot.theme` | `正在应用界面风格…` | `bootstrap.js:997` | ✅ 阶段 2 |
| `boot.shell` | `正在构建界面…` | `bootstrap.js:1013` | ✅ 阶段 3 |
| `boot.ready` | `结界已就绪` | **v1.3.9 起读取**：主流程最后一步 `setBootText(KUI.text('boot.ready','准备就绪'))` | ✅ 生效（阶段 4 文案仍来自 `DEFAULTS.stages[3].text`） |
| `boot.text` | `正在加载界面配置…` | `normalizeConfig`（`:447`） | 🟡 v1.3.8 的 `textCfg` 同样传入，但 `boot.loading` 已把 `cfg.text` 填非空 → 实际不生效 |
| `boot.errorTitle` | `界面启动失败` | `error()`（`boot.js:376`） | ✅ 错误卡片标题 |
| `boot.errorTip` | 排查建议长句 | `error()`（`boot.js:387`） | ✅ 错误卡片建议 |
| `boot.retry` | `重新加载` | `error()`（`boot.js:391`） | ✅ 错误卡片按钮 |
| `boot.noHost` | `页面缺少挂载点：#kui-app` | `bootstrap.js:963` | ✅ 无 `#kui-app` 时的错误 |
| `boot.noConfig` | `未找到 config/app.json` | `bootstrap.js:980` | ✅ 配置缺失时的错误 |

### 5.5 历史缺陷与修复：`app.json` 的 `boot` 段（v1.3.7 不生效 → v1.3.8 已接通）

> **现状（v1.3.8 起）**：`src/app/bootstrap.js` 在启动流程里调用 `applyBootConfig(appCfg, res.text)`，
> 它内部先 `configureBootLayer(...)`（把 `appCfg.boot` 交给 `KUI.bootLayer.configure`），
> 再处理 `boot.enabled === false`：不新建实例，已创建的实例 `destroy()` 并移除 `#kui-boot` 节点、标记 `html[data-kui-boot="off"]`。
> 因此 `config/app.json` 的 `boot.clock / bar / meta / stages / mode / hideDelay` 与 `boot.subtitle` 兜底**已生效**；
> `text.json` 的 `boot.title`/`boot.text` 仍会被 `app.name` / `boot.loading` 优先填充（`textCfg` 只填空字段，见 §5.4）。
> 验证方法：控制台 `KUI.boot.appliedBootConfig` 应等于 `config/app.json` 的 `boot` 段；冒烟 `[28]` 已覆盖。

**历史背景（v1.3.7 及更早）**：

1. 把 `boot.clock.size` 改成 `96`，刷新后表盘仍是 74px；
2. 把 `boot.stages` 改成 6 段，刷新后仍只走 4 个阶段、文案不变；
3. 把 `boot.enabled` 改成 `false`，加载层照样出现；
4. 把 `boot.bar.mode` 改成 `indeterminate`，进度条仍是普通进度。

**历史根因（可 `git show` 复核）**：`configureBootLayer(appCfg, textCfg)` 函数定义正确，但 `boot()` 里只调用了
`attachBootLayer(null)`——传 `null` 时 `bootConfigOf(null)` 返回 `null`，`KUI.bootLayer.attach(null)` 用 `DEFAULTS` +
`KUI.text` 兜底创建实例；`appCfg.boot` 与 legacy 的 `appCfg.app.loading` 都没走到。冒烟当时只做静态检查
（断言 `app.json` 里有 `boot.stages` 且长度 4），不验证运行时是否应用，因此没抓到。

**v1.3.8 的修复（`src/app/bootstrap.js`）**：

```js
// boot() 内，text/themes/app 加载完成、i18n.set 之后：
applyBootConfig(appCfg, res.text);   // ① configureBootLayer(appCfg, textCfg) ② boot.enabled === false → destroy()
// 同时修好：menu 品牌/页脚注入、主题选择器字段、dialog 配置写回等同类「配置无读取点」缺陷（见 CHANGELOG v1.3.8）
```

**修复后的字段覆盖情况**：

| 字段 | v1.3.8 状态 | 说明 |
| --- | --- | --- |
| `boot.enabled` | ✅ 有读取点 | `false` 时销毁已创建实例、移除 `#kui-boot` 并标记 `html[data-kui-boot="off"]`（`bootstrap.js:73-90`），不新建实例 |
| `boot.clock.smooth` | ✅ 有读取点 | 写入 `data-boot-smooth`，`false` 时 `.kui-boot__hand` 关闭过渡（含 `prefers-reduced-motion`） |
| `boot.clock.mode: "none"` | ⚠ 仍受限 | CSS 只实现 `"spin"`；`"none"` 与 `"progress"` 视觉相同（要「不转」请用 `clock.enabled:false`） |
| `text.json` 的 `boot.title/subtitle/text` | ⚠ 部分生效 | v1.3.8 起 `applyBootConfig` 会传 `textCfg`：`subtitle` 可在 `app.subtitle` 为空时兜底；但 `title` 被 `app.name`、`text` 被 `boot.loading` 填为非空 → 二者仍不生效（`textCfg` 只填空字段） |

> 结论：v1.3.8 起加载层的行为由 `app.json.boot` 驱动，`text.json.boot` 仅在字段为空时兜底（`title`/`text` 实际被应用元信息覆盖）；等价的 API 写法（`KUI.bootLayer.configure`）仍然可用，适合在自己控制的渲染时机里动态改配置（见 §12）。

### 5.6 配置优先级

`normalizeConfig(patch, textCfg)`（`boot.js:440-454`）按以下顺序合并：

```text
DEFAULTS  ←  deepMerge  ←  patch（app.json.boot / create 的 props / configure 的 patch）
                              ↓
                    空字段再用 textCfg（text.json 的 boot 组）兜底
                              ↓
                    若 stages 为空则回退 DEFAULTS.stages
```

记住两点：

1. `patch` 是**深合并**，只写 `{clock:{size:96}}` 不会把 `clock.ticks` 冲掉；
2. `textCfg` 只对「合并后仍为空」的字段生效（所以主流程里它几乎不生效，见 §5.5 表）。

---

## 6. 启动时序：一帧一帧看

### 6.1 完整时序表（app profile）

| # | 发生了什么 | 源码 | 加载层状态 | 进度 |
| --- | --- | --- | --- | --- |
| 1 | 浏览器解析 HTML，`<head>` 第一段执行 `theme-boot.js`，写入主题 token | `index.html:5` | 静态骨架尚未显示（CSS 未到） | — |
| 2 | CSS 依次加载，最后 `boot.css` | `index.html:14-20` | `#kui-boot` 静态骨架可见（logo 转圈），`html[data-kui-boot="loading"]` | 0% |
| 3 | `kui-all.js`（app profile）同步注入 29 个脚本 | `index.html:51` | 骨架仍在；`boot.js` 注册 `type:"boot"` 与 `KUI.bootLayer` | 0% |
| 4 | `bootstrap.js` 定义 `KUI.boot` 启动器，DOM 就绪后 `autoBoot()` | `bootstrap.js:1071-1085`（API）、`:941-950`（autoBoot） | 同上 | 0% |
| 5 | `boot()` 校验挂载点 `#kui-app` | `bootstrap.js:955-966` | 缺失则错误卡片 | — |
| 6 | `attachBootLayer(null)` → `KUI.bootLayer.attach(null)` 接管静态骨架，清空重建内部（logo→时钟），标题写 `KurumiUI`、读数 `12:00` | `bootstrap.js:967`；`boot.js:458-470` | 组件实例就绪，`data-boot-layer="true"` | 0% |
| 7 | `setBootStep(1)` + `setBootText(KUI.text('boot.loading'))` | `bootstrap.js:970-971` | 阶段 1 文案 | 8% |
| 8 | `KUI.config.loadMany(['text','themes','app'])` 异步读三份配置 | `bootstrap.js:973` | 文案保持阶段 1 | 8% |
| 9 | 注入 i18n：`KUI.i18n.set(res.text)`，再叠加 `appCfg.text` | `bootstrap.js:975-977` | 文案字典就绪 | 8% |
| 10 | 缺 `app.json` → 抛错（`boot.noConfig`） | `bootstrap.js:979-981` | 错误卡片 | 8% |
| 11 | `applyAppMeta(appCfg)`：`document.title`、`setMeta({title,subtitle})`、`setText(boot.loading)` | `bootstrap.js:984`（定义 `:783-800`） | 标题/副标题来自 `app.json` 的 `app.*` | 8% |
| 12 | **`applyBootConfig(appCfg, res.text)`（v1.3.8 新增）**：`app.json` 的 `boot` 段在此生效；`boot.enabled:false` 则销毁实例、移除 `#kui-boot`、标 `data-kui-boot="off"` | `bootstrap.js:987`（定义 `:72-90`） | 阶段/时钟/进度条/meta 按配置重配 | 8% |
| 13 | `applyUiConfig(appCfg)`（tooltip/toast/dialog 的全局参数） | `bootstrap.js:990`（定义 `:821-838`） | 加载层不变 | 8% |
| 14 | **`applyAppMetaToConfig(appCfg)`（v1.3.8 新增）**：把 `app.*` 元信息注入菜单品牌/页脚与顶部导航 | `bootstrap.js:993`（定义 `:761-781`） | 加载层不变 | 8% |
| 15 | `setBootStep(2)` + 文案 `boot.theme`，`KUI.theme.init(...)` 应用主题 | `bootstrap.js:996-1009` | 阶段 2；表盘颜色切到当前主题 | 46% |
| 16 | `setBootStep(3)` + 文案 `boot.shell`，`KUI.app.create(host, appCfg)` 建外壳 | `bootstrap.js:1012-1014` | 阶段 3；遮罩后面开始出现菜单/标签 | 78% |
| 17 | `registerActions(app, appCfg)` 注册 app 扩展动作 | `bootstrap.js:1020` | 仍 78% | 78% |
| 18 | `setBootStep(4)`；`body.kui-ready`；`html[data-kui-boot="done"]` | `bootstrap.js:1023-1028` | 阶段 4，文案「结界已就绪」 | 100% |
| 19 | `hideBoot()` → `inst.done()`：`setProgress(100)` + 加 `is-done` + 360ms 后移除节点 | `bootstrap.js:1031`；`boot.js:356-368` | 淡出（0.32s），随后 `#kui-boot` 从 DOM 移除 | 100% |
| 20 | 派发 `boot:done` `{app, cost}`；`?debug` 时打日志 | `bootstrap.js:1041-1044` | 加载层已结束 | — |
| 21 | 任一步抛错 → `showBootError` + `boot:error` `{error}` | `bootstrap.js:1048-1052` | 错误卡片常驻 | 保持出错进度 |

### 6.2 视觉状态机

```text
 [静态骨架] --attach()--> [组件实例 0%] --setStep(1)--> 8%
      --setStep(2)--> 46% --setStep(3)--> 78% --setStep(4)--> 100%
      --done()--> [is-done 淡出] --360ms--> [节点移除]
                 ↘ error() --> [is-error + 错误卡片常驻]
```

### 6.3 失败路径

| 失败 | 触发点 | 用户看到 | 控制台 |
| --- | --- | --- | --- |
| 页面没有 `#kui-app` | `bootstrap.js:961-965` | 错误卡片：`页面缺少挂载点：#kui-app`（若连 `#kui-boot` 也没有，则生成页面级错误块，`bootstrap.js:125-154`） | `[boot] 页面缺少挂载点：#kui-app` |
| 配置读不到 | `bootstrap.js:979-981` | 错误卡片：`未找到 config/app.json` | `[boot] 未找到 config/app.json` |
| 主题/外壳初始化异常 | `bootstrap.js:1048-1052` | 错误卡片：异常 message + `errorTip` + 「重新加载」按钮 | `[boot] <message>` + 堆栈 |
| 组件 attach 抛错 | `bootstrap.js:46-54` | 回退静态骨架（`warnOnce`，不阻断） | `启动层组件 attach 失败：…` |

错误卡片的 DOM（`boot.js:370-395`）：`.kui-boot.is-error` 根 → `__inner` 被 `display:none` → `.kui-boot__error` 里依次是 `__error-title`、`__error-msg`、可选 `__error-detail`（`<pre>`）、`__error-tip`、重试 `button`。按钮点击执行 `location.reload()`。

### 6.4 为什么 `standalone` 子页面没有启动层

`standalone` profile 不含 `bootstrap.js`（见 `config/kui-modules.json` 的 `profiles.standalone.files`），所以：

- 子页面/iframe 页**不会自动**出现加载层，也不会有 `KUI.boot`；
- 但 `boot.js` 已在 profile 里，页面可以手动 `KUI.bootLayer.attach()` 或 `create()`；
- 如果希望子页面也有启动层，推荐在子页脚本里自己做（见 §10.3），不要期待 `bootstrap` 自动跑——多份 `bootstrap` 会导致 `#kui-app` 争抢与重复初始化。

### 6.5 自动启动与手动启动

`autoBoot()`（`bootstrap.js:1060-1069`）的执行条件：

| 条件 | 说明 |
| --- | --- |
| `bootDone === false` | 已启动过则直接返回（幂等） |
| `<body data-kui-auto="false">` 不成立 | 页面可显式关自动启动 |
| `KUI.boot.disabled !== true` | 控制台可临时关闭 |
| 存在 `#kui-app` 或 `[data-kui-app]` | 没有挂载点则静默跳过（不报错） |

需要自己控制启动时机时：

```html
<body data-kui-auto="false">
  <div id="kui-app" data-kui-app="true"></div>
  <script src="src/core/kui-all.js" data-kui-profile="app"></script>
  <script>
    // 例如等某个前置异步任务完成后再启动
    KUI.ready(function () {
      KUI.boot({ host: '#kui-app', initialTabs: ['home'], debug: true })
        .then(function (app) { console.log('启动完成', KUI.boot.ready()); })
        .catch(function (err) { console.error('启动失败', err); });
    });
  </script>
</body>
```

---

## 7. 四种装配方式

### 7.1 方式 A：作为注册类型渲染

`boot` 在注册表里的描述符见 `boot.js:505-511`：`category: "shell"`、`title: "启动层 / 加载中"`、`defaults: DEFAULTS`、`render`、`api`。渲染走 KuurumiUI 通用管线，**`renderNode` 默认把 `mode` 合并成 `"inline"`**（`boot.js:491-497`），避免「一挂载就铺满整页」：

```js
// 1) 只拿 DOM（不 append 到页面）
var node = KUI.renderNode({ type: 'boot', props: { mode: 'inline', meta: false } });
document.getElementById('preview').appendChild(node);

// 2) 挂载到宿主并拿实例（推荐）
var inst = KUI.mount('boot', document.getElementById('preview'), {
  props: { mode: 'inline', title: '预览', clock: { size: 64 } }
});

// 3) 一次渲染多块（数组/fragment）
KUI.renderTree([
  { type: 'boot', props: { mode: 'inline', meta: false } },
  { type: 'text', text: '下面还有内容' }
], document.getElementById('preview'));
```

要点：

- `KUI.mount` 的返回值是通用实例对象（`{type, el, node, ctx}`，`kui.js:1126-1134`），**组件的专属句柄在 `el.__kuiBootApi`**：
  ```js
  var inst = KUI.mount('boot', host, { props: { mode: 'inline' } });
  var boot = inst.el.__kuiBootApi;   // 真正的实例 API
  boot.setProgress(43);
  ```
- `renderNode` 返回的 DOM 上同样挂 `__kuiBootApi`；注册描述符的 `api(elm)` 就是取它（`boot.js:510`）。
- 节点上的 `type` 必须写 `"boot"`；写错类型不会报错，但会渲染成「未知节点」占位（见 [08-components.md](08-components.md) 的未知类型处理）。

### 7.2 方式 B：`KUI.bootLayer.create(host, props)`

手动创建**非单例**实例，适合演示页、内嵌预览、同一页多个加载层：

```js
var inst = KUI.bootLayer.create(document.getElementById('preview'), {
  mode: 'inline',          // 必须显式传，create 不会自动加 inline
  title: '正在连接…',
  meta: true,
  clock: { size: 64, ticks: 12 },
  bar: { mode: 'progress' }
});
inst.setProgress(43);      // 立即生效
inst.setStep(2);           // 若 props.stages 未定义，用的是 DEFAULTS 的 4 段
```

要点：

- `create` 不占 `#kui-boot` id、不进单例 `state.instance`，所以 `KUI.bootLayer.instance()` 仍返回 `null`；
- `host` 为 `null` 时节点不挂 DOM，可用 `inst.el` 自己塞；
- 每次 `create` 都是一个独立实例，**没有自动销毁**，不用了记得 `inst.destroy()`。

### 7.3 方式 C：`KUI.bootLayer.attach(props, textCfg)`

单例接管：优先找页面里的 `#kui-boot`（静态骨架）接管，找不到就在 `document.body` 上新建，并登记为全局单例：

```js
var inst = KUI.bootLayer.attach(
  { mode: 'fullscreen', title: '刻刻帝终端', meta: true },
  { boot: { loading: '正在加载…' } }   // 第二个参数是「文案包」，shape 见 §5.6
);
inst.setStep(1);
// …业务初始化…
inst.done();
```

要点：

- 已有 `#kui-boot` 且其 `__kuiBootApi` 存在时，**直接返回已有实例**（`boot.js:461-463`），不会重复建；
- 接管时保留 `#kui-boot` 节点本身（避免整层重建闪烁），只清空并重建内部（`boot.js:462-469`）；
- 无 `document.body`（如 Node 环境）返回 `null`；
- 这是 `bootstrap.js` 主流程用的方式（`attachBootLayer`，`:43-51`）。

### 7.4 方式 D：`bootstrap.js` 默认流程

不写任何代码，页面放 `#kui-app` + `kui-all.js` 即可（§6.1 的 21 步）。这是「主应用」的装法，也是唯一会自动读配置的路径（v1.3.8 起 §5.5 的接线缺口已修复）。

### 7.5 四种方式对比

| 维度 | A 节点渲染 | B `create` | C `attach` | D 默认启动 |
| --- | --- | --- | --- | --- |
| 默认 mode | `inline`（强制合并） | 传什么是什么（默认 fullscreen） | 传什么是什么 | fullscreen |
| 是否单例 | 否 | 否 | 是 | 是 |
| 是否占 `#kui-boot` | 否 | 否 | 是（接管或新建） | 是 |
| 返回 | DOM / 通用实例 | 实例 API | 实例 API | `Promise<app>` |
| 典型场景 | 页面里嵌一块预览 | 演示页、多个实例 | 自定义启动流程 | 主应用 |
| 自动读配置 | 否 | 否 | 否（可传 props） | 会（v1.3.8 起：`applyBootConfig` → `configureBootLayer`） |
| 结束后 | 需自己 `destroy` | 需自己 `destroy` | `done()` 自动移除 | 自动 |

---

## 8. `KUI.bootLayer` 静态 API 全表

定义在 `src/components/boot.js:513-528`，共 9 个成员：

| API | 签名 | 返回 | 行为与注意 |
| --- | --- | --- | --- |
| `KUI.bootLayer.version` | `"1.0.0"` | string | 组件自身版本，与框架版本（1.3.8）独立，升级判断别拿它比 |
| `KUI.bootLayer.DEFAULTS` | 对象 | `DEFAULTS` | 只读参考；**修改它不会影响已创建的实例**（实例各自 `normalizeConfig` 拷贝） |
| `KUI.bootLayer.handsAt` | `(percent) → object` | 见 §3.3 | 纯函数，不依赖 DOM，Node 里也能调 |
| `KUI.bootLayer.create` | `(host, props) → inst` | 实例 API | 非单例；`host` 可空；不写 id |
| `KUI.bootLayer.attach` | `(props, textCfg) → inst \| null` | 实例 API | 单例；接管 `#kui-boot`；无 `body` 返回 `null` |
| `KUI.bootLayer.configure` | `(patch, textCfg) → cfg \| null` | 合并后的配置对象 | 无实例时先 `attach({})` 再配置；**返回的是配置对象，不是实例** |
| `KUI.bootLayer.instance` | `() → inst \| null` | 当前单例 | `create` 的实例不会出现在这里 |
| `KUI.bootLayer.destroy` | `() → null` | `null` | 销毁单例**并移除 `#kui-boot` 节点**；重复调用安全 |
| `KUI.bootLayer.isReady` | `() → boolean` | `!!state.instance` | 只表示「有没有单例」，不表示「加载完了」 |

> 别和 `KUI.boot` 混淆：`KUI.boot` 是**启动器函数**（`bootstrap.js` 提供），`KUI.bootLayer` 是**组件静态 API**。两者在源码里有一段显式注释（`boot.js:517-518`）说明命名意图。

---

## 9. 实例 API 全表

实例对象由 `createInstance()` 返回（`boot.js:262-419`），同时挂在根节点的 `__kuiBootApi` 上。

### 9.1 状态属性

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `el` | HTMLElement | 根节点（`div.kui-boot`） |
| `config` | object | **当前**合并后的配置；`configure`/`setConfig` 会整体替换这个引用 |
| `progress` | number | 当前进度（0–100，已夹取） |
| `step` | number | 当前阶段号（`setStep` 写入） |
| `visible` | boolean | `true` 初始；`hide()`/`done()` 后 `false`，`show()` 恢复 |

### 9.2 14 个方法总表

| 方法 | 签名 | 返回 | 一句话 |
| --- | --- | --- | --- |
| `setProgress` | `(percent, {silent}?)` | 当前进度 number | 更新进度、指针、读数，并派发 `boot:progress` |
| `getProgress` | `()` | number | 读当前进度 |
| `setText` | `(value)` | `inst` | 只改阶段文案 |
| `setStep` | `(step)` | `inst` | 按 `config.stages` 命中阶段（文案 + 进度） |
| `setMeta` | `({title?, subtitle?})` | `inst` | 改标题/副标题（`undefined` 表示不动） |
| `configure` | `(patch, textCfg?)` | `inst` | 运行时改配置（表盘尺寸、模式、meta、文案…） |
| `setConfig` | 同 `configure` | `inst` | 别名 |
| `show` | `()` | `inst` | 显示（去 `is-done`/`is-error`） |
| `hide` | `()` | `inst` | 隐藏（加 `is-done`，节点保留） |
| `done` | `()` | `inst` | 进度 100 + 隐藏 + 延迟移除节点 |
| `error` | `(message, detail?)` | `inst` | 切换为错误卡片 |
| `handsAt` | `(percent)` | 同静态 | 实例上的便捷引用 |
| `getState` | `()` | object | 状态快照（含 `hands`） |
| `destroy` | `()` | `null` | 移除节点并清空单例登记 |

### 9.3 逐方法细节与坑

**`setProgress(percent, { silent })`**（`boot.js:270-288`）

- 写 `--kui-boot-progress`、`data-boot-percent`、两根指针的 `transform`；
- `silent: true` 只跳过「百分比文本 + 读数文本」更新，**仍会派发 `boot:progress` 事件**；
- 返回值是夹取后的 `progress`（不是实例），链式调用会踩坑：
  ```js
  inst.setProgress(10).setText('x');   // ❌ 报错：setProgress 返回 number
  inst.setProgress(10); inst.setText('x');   // ✅
  ```

**`setStep(step)`**（`boot.js:297-309`）

- 总是写 `data-boot-step`；
- 命中 `config.stages[i].step === step` 才 `setText` / `setProgress`，然后 `break`；
- **不匹配不报错**：常见于「配置里 stages 被替换成 6 段，但代码仍调 `setStep(7)`」或「step 写成字符串 `"2"`（`Number("2") === 2` 没问题，但 `"第2步"` 就永不命中）」；
- 调 `setStep` 前若想改文案，必须保证 `config.stages` 已更新（用 `configure`）。

**`setMeta({title, subtitle})`**（`boot.js:311-321`）

- `title: undefined` 表示不改；传 `''` 会把标题清空；
- `subtitle` 传空/假值会把 `.kui-boot__sub` 设为 `hidden`。

**`configure(patch, textCfg)`**（`boot.js:323-340`）

- 会重新 `normalizeConfig(deepMerge(cfg, patch), textCfg)`，然后重写类名、`data-boot-clock*`、`data-boot-bar`、`--kui-boot-size`、`--kui-boot-ticks`、`meta.hidden`、标题/副标题/文案；
- **不会重建 DOM**（时钟/进度条结构不变，只改变量与文本），所以反复调用开销很小；
- `api.config` 指向新对象：外部若缓存了旧的 `config` 引用，需要重新取；
- 不会把进度条动画重置（`--kui-boot-progress` 保持当前值）。

**`show()` / `hide()`**（`boot.js:342-354`）

- `show()` 去掉 `is-done`/`is-error` 并把 `root.hidden = false`；
- ⚠ **`error()` 会把 `__inner` 设成 `display:none`，`show()` 不会恢复它**——错误态之后要重新显示内容，必须自己 `inst.el.querySelector('.kui-boot__inner').style.display = ''`（或重建实例）。

**`done()`**（`boot.js:356-368`）

- `setProgress(100)`（会派发一次 `boot:progress`）→ `hide()` → `setTimeout` 在 `config.hideDelay`（缺省 360ms）后移除节点并清空单例；
- 移除后 `KUI.bootLayer.instance()` 返回 `null`，`isReady()` 变 `false`。

**`error(message, detail)`**（`boot.js:370-395`）

- 加 `is-error`、隐藏 `__inner`、构建错误卡片（标题/消息/可选 `<pre>` 堆栈/建议/重试按钮）；
- **不派发任何事件**（`boot:error` 是 `bootstrap.js` 在 catch 里发的，直接调实例方法不会有）；
- 重试按钮固定 `location.reload()`，不能换成自定义回调。

**`getState()`**（`boot.js:401-412`）

```js
inst.getState();
// { progress: 46, percent: 46, step: 2, visible: true,
//   mode: 'fullscreen', clock: {…}, bar: {…},
//   hands: { percent:46, totalMinutes:331.2, hourAngle:165.6, minuteAngle:198, … } }
```

**`destroy()` / 无 `reset()`**

- `destroy()` 移除节点、清空单例，返回 `null`；
- 实例**没有 `reset()`**。官方测试页的「重置」按钮实现是 `destroy()` 后重新 `create()`；CHANGELOG 里提到的 `reset` 属于文档笔误，以本章为准。

### 9.4 事件表

| 事件 | 载荷 | 派发点 | 说明 |
| --- | --- | --- | --- |
| `boot:progress` | `{ percent, hands }` | `setProgress`（`boot.js:284-286`） | 每次进度变化都发，包括 `silent`；`hands` 是 `handsAt` 返回对象 |
| `boot:done` | `{ app, cost }` | `bootstrap.js:1043` | 仅主流程启动完成时发；`cost` 毫秒 |
| `boot:error` | `{ error }` | `bootstrap.js:1051` | 仅主流程异常时发；`error` 是 Error 对象 |

```js
// 监听进度（注意：这是全局总线，不是实例上的 on）
KUI.bus.on('boot:progress', function (payload) {
  console.log('进度', payload.percent, '读数', payload.hands.clockText);
});
KUI.bus.once('boot:done', function (p) { console.log('启动完成，耗时', p.cost, 'ms'); });
KUI.bus.on('boot:error', function (p) { console.error('启动失败', p.error); });
```

### 9.5 `KUI.boot` 启动器 API（与加载层相关）

| 成员 | 签名 | 说明 |
| --- | --- | --- |
| `KUI.boot(opts)` | `({host?, initialTabs?, debug?}) → Promise<app>` | 手动启动；`host` 支持选择器或元素；`initialTabs` 首次打开的标签；`debug` 打印耗时 |
| `KUI.boot.boot` | 同 `KUI.boot` | 原始函数引用 |
| `KUI.boot.auto` | `() → void` | 手动触发 `autoBoot`（幂等） |
| `KUI.boot.error` | `(message, detail) → void` | 手动显示启动错误卡片 |
| `KUI.boot.ready` | `() → boolean` | 是否已完成一次启动 |
| `KUI.boot.disabled` | boolean，默认 `false` | 置 `true` 可阻止 `autoBoot`（对已启动的无效） |
| `KUI.boot.version` | `"1.0.0"` | 启动器版本 |

> `opts` 里没有 `force` 之类的重入参数（冒烟脚本里传的 `{force:true}` 不会被使用）；重复调用 `KUI.boot()` 会重新跑一遍流程，业务上应自己用 `KUI.boot.ready()` 防重。

---

## 10. 把加载层单独用起来（拆装）

### 10.1 场景 1：完整主应用（默认）

不改任何东西，按 §6.1 走。这是「开发时最省事」的方案；v1.3.8 前 `app.json` 的 boot 配置不生效（§5.5），v1.3.8 起正常读取。

### 10.2 场景 2：拆掉组件，退回静态骨架（legacy）

**步骤：**

1. 用编辑器打开 `config/kui-modules.json`，从 `profiles.app.files` 与 `profiles.standalone.files` 中各删掉 `"src/components/boot.js"` 一行（分别是第 28 行与第 62 行附近）；
2. 重新生成 `src/core/kui-all.js`：`npm run build:all`；
3. 刷新页面。

**现象（实测预期）：**

| 项 | 表现 |
| --- | --- |
| 首屏 | 静态骨架可见，`__logo` 齿轮在转（`boot.css:69-98`） |
| 进度 | 进度条**停在 0%**（没有 JS 更新 `--kui-boot-progress`） |
| 文案 | `bootstrap.setBootText` 的 legacy 分支能改 `[data-boot-text]`（`bootstrap.js:92-101`） |
| 阶段属性 | `setBootStep` 只写 `data-boot-step`，不改文案/进度（`bootstrap.js:102-110`） |
| 结束 | `hideBoot` 加 `is-done` 后 360ms 移除（`bootstrap.js:111-124`） |
| 错误 | `showBootError` 生成页面级错误块（`bootstrap.js:125-154`） |

限制：没有读数、没有时钟、进度条不动、错误卡片样式退化。**只建议在「打包尺寸极度敏感」或「临时排障」时使用。**

### 10.3 场景 3：只用加载层（不含 app-shell / 菜单 / 标签）

目标：一个「启动页 + 自己初始化业务」的页面，不引入整个应用外壳。

最小文件清单（都从仓库复制，路径可改）：

| 文件 | 必需 | 说明 |
| --- | --- | --- |
| `src/core/kui.js` | ✅ | 提供 `KUI.*` 命名空间、`h`、`bus`、`text`、`ready` 等 |
| `src/core/registry.js` | ✅ | `type:"boot"` 的注册表 |
| `src/components/boot.js` | ✅ | 组件本体 |
| `src/styles/base.css` | ✅ | 主题 token 兜底（不引也能看，但配色是兜底色） |
| `src/styles/boot.css` | ✅ | 加载层样式 |
| `src/core/theme.js` + `src/themes.json` | ❌ 可选 | 需要换肤/主题 token 时 |
| `src/core/config.js` + `config/*.json` | ❌ 可选 | 需要读配置时 |
| `src/core/theme-boot.js` | ❌ 可选 | 需要防 FOUC 时 |

HTML 模板：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>我的启动页</title>
  <link rel="stylesheet" href="src/styles/base.css">
  <link rel="stylesheet" href="src/styles/boot.css">
</head>
<body>
  <!-- 静态骨架：脚本没跑起来也有东西看 -->
  <div id="kui-boot" class="kui-boot" role="status" aria-live="polite">
    <div class="kui-boot__inner">
      <div class="kui-boot__logo" aria-hidden="true"></div>
      <div class="kui-boot__title">MY APP</div>
      <div class="kui-boot__sub">BOOTING</div>
      <div class="kui-boot__bar"><span></span></div>
      <div class="kui-boot__text" data-boot-text>正在准备…</div>
    </div>
  </div>

  <script src="src/core/kui.js"></script>
  <script src="src/core/registry.js"></script>
  <script src="src/components/boot.js"></script>
  <script>
    var inst = KUI.bootLayer.attach({ clock: { size: 84 }, meta: true });
    inst.setStep(1);                       // 使用默认 4 阶段：8%
    setTimeout(function () { inst.setProgress(35); inst.setText('正在校验登录态…'); }, 400);
    setTimeout(function () { inst.setProgress(70); inst.setText('正在加载数据…'); }, 900);
    setTimeout(function () { inst.setStep(4); inst.done(); }, 1500);   // 100% + 淡出 + 移除
  </script>
</body>
</html>
```

> 这个模板不依赖 `kui-all.js`，也不依赖 `bootstrap`；所有阶段由你手动推进。想要「进度条不确定态」就加 `bar: { mode: 'indeterminate' }`，想要「表盘自转」就加 `clock: { mode: 'spin' }`。

### 10.4 场景 4：只复用算法 `handsAt`

不想复制 DOM/CSS，只想在自己的表盘/进度环上用「0→12 点」的映射：

```js
// 前提：页面已加载含 boot.js 的入口（kui-all 或单独引 boot.js）
var h = KUI.bootLayer.handsAt(37.5);
// h.hourAngle=135, h.minuteAngle=180, h.clockText='04:30'

// 完全不带框架时，直接抄 §3.6 的 20 行实现即可（纯函数，无依赖）
```

### 10.5 拆装检查表

| 检查 | 方法 |
| --- | --- |
| 删 `boot.js` 后不报错 | 刷新页面，控制台无 `KUI.bootLayer is undefined` 类错误；`#kui-boot` 仍可见 |
| 重新加回后恢复 | `npm run build:all` → 刷新，`KUI.bootLayer.version` 有值 |
| 独立页不依赖外壳 | 页面只引 core + boot.js + 两份 CSS，Network 面板无 `app-shell.js` 请求 |
| 卸载干净 | `KUI.bootLayer.destroy()` 后 `document.getElementById('kui-boot') === null` |
| 多实例不冲突 | `create()` 两个实例，DOM 中只有一个 `id="kui-boot"`，两者 `__kuiBootApi` 不同 |

---

## 11. 接入自有项目 / 跨项目复用

### 11.1 三种集成粒度

| 粒度 | 你拿到什么 | 需要复制 | 适用 |
| --- | --- | --- | --- |
| 整框架 | 完整应用外壳（菜单/导航/标签/弹窗/提醒/加载层） | 仓库根目录除 `test/`、`tools/` 外的运行文件 | 要做后台/控制台 |
| 独立渲染页 | 单组件（菜单、对话框、加载层…） | `src/` + `config/` + 对应 `standalone/*.html` 参考 | 已有站点，只想嵌一块 |
| 单组件（本章） | 只有加载层 | `kui.js`、`registry.js`、`boot.js`、`base.css`、`boot.css`（§10.3） | 只想加一个启动屏 |

### 11.2 复制清单（单组件方案）

| 路径 | 必需 | 备注 |
| --- | --- | --- |
| `src/core/kui.js` | ✅ | 版本号在此；与 `boot.js` 的 API 兼容性以此为准 |
| `src/core/registry.js` | ✅ | `register/get/renderNode` 依赖 |
| `src/components/boot.js` | ✅ | 组件本体 |
| `src/styles/base.css` | ✅ | 提供 `--kui-*` token 与全局 reset |
| `src/styles/boot.css` | ✅ | 加载层样式 |
| `src/core/icons.js` | ❌ | 本组件不用图标 |
| `src/core/tooltip.js` / `dom-enhance.js` | ❌ | 本组件不依赖 |
| `src/core/config.js` + `config/*.json` | ❌ | 只有想「JSON 配置阶段文案」时才需要（当前 v1.3.8 缺接线，见 §5.5） |
| `src/core/theme.js` + `src/themes.json` | ❌ | 想要换肤时 |

### 11.3 目录与路径

- `kui-all.js` 通过自身 `script.src` 推导 root（`tools/build-all.js` 的 root 推导逻辑：`script.src.replace(/src\/core\/[^\/]*$/, "")`），所以**只要保持 `src/core/` 相对位置不变，整包放到任意子目录都能跑**；
- 单独引 `boot.js` 时没有 root 推导问题（它不读配置），路径写对即可；
- 部署在子路径（如 `https://example.com/app/`）时，HTML 里的 `src/styles/...` 用相对路径即可；
- 若放进 iframe 子页，注意 `file://` 下跨 iframe 的 `parent.__KUI_BUNDLE__` 兜底与 `?kui_v` 缓存穿透（见 [11-api-messaging.md](11-api-messaging.md)）。

### 11.4 三种可直接改的 HTML 模板

**模板 1：最简全屏加载页（等价于 index.html 的加载层部分）**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="src/styles/base.css">
  <link rel="stylesheet" href="src/styles/boot.css">
</head>
<body>
  <div id="kui-boot" class="kui-boot" role="status" aria-live="polite"></div>
  <script src="src/core/kui.js"></script>
  <script src="src/core/registry.js"></script>
  <script src="src/components/boot.js"></script>
  <script>
    var inst = KUI.bootLayer.attach({ clock: { size: 74 }, meta: true });
    inst.setProgress(0);
    inst.setStep(1);
  </script>
</body>
</html>
```

**模板 2：手动控制的进度（配合真实任务）**

```html
<script>
  var inst = KUI.bootLayer.attach({ clock: { size: 90, ticks: 12 }, bar: { mode: 'progress' } });
  var steps = [
    { at: 10,  text: '读取本地缓存…',             progress: 12 },
    { at: 800, text: '校验登录态…',               progress: 38 },
    { at: 1500,text: '同步远端配置…',             progress: 66 },
    { at: 2300,text: '渲染界面…',                 progress: 92 },
    { at: 3000,text: '就绪',                      progress: 100 }
  ];
  steps.forEach(function (s) {
    setTimeout(function () { inst.setText(s.text); inst.setProgress(s.progress); }, s.at);
  });
  setTimeout(function () { inst.done(); }, 3300);
</script>
```

**模板 3：静态骨架降级（不加载组件，只保留首屏）**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="src/styles/base.css">
  <link rel="stylesheet" href="src/styles/boot.css">
</head>
<body>
  <div id="kui-boot" class="kui-boot" role="status" aria-live="polite">
    <div class="kui-boot__inner">
      <div class="kui-boot__logo" aria-hidden="true"></div>
      <div class="kui-boot__title">MY APP</div>
      <div class="kui-boot__sub">LOADING</div>
      <div class="kui-boot__bar"><span></span></div>
      <div class="kui-boot__text" data-boot-text>正在加载…</div>
    </div>
  </div>
  <script>
    // 业务脚本加载完后手动收尾（不依赖 KUI）
    window.addEventListener('load', function () {
      var el = document.getElementById('kui-boot');
      if (!el) return;
      el.classList.add('is-done');
      setTimeout(function () { el.parentNode && el.parentNode.removeChild(el); }, 360);
    });
  </script>
</body>
</html>
```

### 11.5 静态托管 / `file://` 注意

| 事项 | 建议 |
| --- | --- |
| MIME | `.js` 必须是 `text/javascript`（`server.js` 已内置白名单；Nginx/Apache 通常默认正确） |
| 缓存 | `server.js` 返回 `Cache-Control: no-store, no-cache, must-revalidate`；生产静态托管若开了强缓存，升级后加 `?kui_v=1.3.8`（框架会把这个参数带到 iframe URL，见 11 章） |
| `file://` | 需要 `config/bundle.js`（`npm run build:config`）；加载层本身不依赖配置可以不带 |
| 路径大小写 | Linux 托管区分大小写，`src/` 与 `SRC/` 不能混 |
| CSP | 若站点开了 CSP，需允许 `style-src 'unsafe-inline'`（组件会写内联 `--kui-boot-size` 等变量）与 `script-src` 自身 |

### 11.6 与上游同步

只复制了单组件的项目，升级时按「文件对文件」替换即可（`boot.js` 对外 API 稳定，`version` 字段用于识别）。建议在项目里记一个「来源版本」常量，便于排查：

```js
console.log('boot component', KUI.bootLayer.version, 'framework', KUI.version);
```

---

## 12. 配置案例（可直接抄）

### 案例 1：零配置（默认）

**目标**：使用内置 4 阶段、74px 表盘、普通进度条。**做法**：不写任何配置，`index.html` 默认流程即是。**涉及**：`DEFAULTS`。

### 案例 2：6 阶段 + 大表盘（JSON 写法，需 §5.5 补丁）

**目标**：把默认 4 段换成 6 段、表盘 96px、60 刻度。**做法**：改 `config/app.json` 的 `boot` 段（补丁生效后）：

```json
{
  "boot": {
    "mode": "fullscreen",
    "meta": true,
    "title": "刻刻帝终端",
    "subtitle": "灵装回路 · 时间结界",
    "clock": { "enabled": true, "mode": "progress", "size": 96, "ticks": 60 },
    "bar": { "enabled": true, "mode": "progress" },
    "stages": [
      { "step": 1, "text": "唤醒刻刻帝…", "progress": 6 },
      { "step": 2, "text": "读取灵装回路…", "progress": 24 },
      { "step": 3, "text": "校准时间结界…", "progress": 48 },
      { "step": 4, "text": "构建终端界面…", "progress": 72 },
      { "step": 5, "text": "注入主题刻印…", "progress": 90 },
      { "step": 6, "text": "结界已就绪", "progress": 100 }
    ]
  }
}
```

> ⚠ 注意：源码里 `bootstrap.js` 只调到 `setStep(1..4)`（§6.1 的 13/14/16 行），**第 5、6 段不会被主流程自动触发**。想让 6 段全部走到，需要自己加 `KUI.boot` 包装或在业务里调 `KUI.bootLayer.instance().setStep(5/6)`——这也是「配置阶段数与代码阶段数不一致」的典型坑。

### 案例 3：极简加载层（无时钟、无读数）

**目标**：只要一句文案 + 一条进度条。

```js
var inst = KUI.bootLayer.attach({
  clock: { enabled: false },   // 隐藏表盘
  meta: false,                 // 隐藏百分比/读数
  bar: { enabled: true, mode: 'progress' },
  title: '正在启动',
  subtitle: '',
  text: '请稍候…'
});
inst.setProgress(20);
```

**效果**：`.kui-boot[data-boot-clock="off"]` 隐藏时钟；`meta.hidden` 隐藏读数；进度条仍在。

### 案例 4：不确定进度（表盘自转 + 循环条）

**目标**：不知道真实进度时，给「正在工作」的视觉反馈。

```js
var inst = KUI.bootLayer.attach({
  clock: { enabled: true, mode: 'spin' },   // 整个表盘缓慢自转
  bar: { enabled: true, mode: 'indeterminate' },
  meta: false,
  text: '正在建立连接…'
});
// 不需要 setProgress；done() 时进度会跳到 100% 再淡出
setTimeout(function () { inst.done(); }, 2500);
```

### 案例 5：独立页内嵌 43% 预览（同 `standalone/boot.html` 做法）

```html
<div id="preview" class="kui-boot-preview" style="position:relative;height:260px"></div>
<script>
  var inst = KUI.bootLayer.create(document.getElementById('preview'), { mode: 'inline', meta: true });
  inst.setProgress(43);           // 06% 之外的半程，指针约在 5 点方向
  inst.el.style.position = 'absolute';
</script>
```

**效果**：容器内出现加载层，`--kui-boot-size` 默认 74px；不改全局样式。

### 案例 6：启动失败卡片

**目标**：初始化失败时展示可读错误与重试。

```js
// 主流程里一般是 bootstrap 自动调用；手动场景：
KUI.boot.error('配置读取失败', 'TypeError: Failed to fetch config/app.json');
// 或实例方法（注意：不会派发 boot:error 事件）
KUI.bootLayer.instance().error('网络异常', 'HTTP 503');
```

---

## 13. 排错表

| 症状 | 可能原因 | 定位方法 | 处理 |
| --- | --- | --- | --- |
| 页面全白，加载层也没有 | `boot.css` 404 / `kui-all.js` 未加载 / HTML 骨架被删 | Network 面板；`document.getElementById('kui-boot')` | 检查 `index.html:20` 的 CSS 与 `:51` 的入口；恢复静态骨架 |
| 加载层一闪而过 | 启动太快（本地缓存） | `boot:done` 的 `cost` | 正常现象；想看清可用 Slow 3G 或在代码里加延迟（仅调试） |
| 加载层一直停着不动 | 启动抛错但未进 error 卡片 / 主流程卡在 `loadMany` | 控制台报错；`KUI.boot.ready()` | 看 §6.3；`?kui_debug=1` 看诊断面板 |
| 时钟读数一直 `12:00` | 没有调 `setProgress`，或 `setStep` 没命中 stages | `KUI.bootLayer.instance().getState()` | 确认 stages 的 `step` 与代码一致；手动 `inst.setProgress(50)` 验证 |
| 指针不动、只有数字变 | 指针元素被覆盖样式（`transform` 被 CSS `!important` 盖掉） | Elements 面板看 `.kui-boot__hand` 的 computed `transform` | 去掉覆盖；检查 `prefers-reduced-motion` 是否仅取消了过渡（不影响最终角度） |
| 表盘不转（`spin` 模式） | 传的是 `clock.mode` 到 `configure` 的旧对象 / CSS 被禁用动画 | `data-boot-clock-mode` 属性值 | 确认属性为 `spin`；关闭系统「减少动态效果」不影响 `spin`（只影响过渡） |
| 刻度数量改了没变化 | CSS 的 12 格是固定 `repeating-conic-gradient`；`--kui-boot-ticks` 只写变量 | 查看 `boot.css:121-135` | 要改刻度数需覆盖 `.kui-boot__dial` 的 background（自算角度） |
| 改成 `app.json` 的 `boot` 完全没反应 | 历史缺陷：v1.3.7 及更早版本的接线缺口（§5.5） | 确认 `KUI.version` 是否 ≥ 1.3.8，并看 `KUI.boot.appliedBootConfig` | 升级到 v1.3.8+，或改用 `KUI.bootLayer.configure()` 写法 |
| `boot.enabled: false` 关不掉 | 历史旧版 v1.3.7 及更早无读取点；v1.3.8 已修复 | 确认 `KUI.version` ≥ 1.3.8，看 `KUI.boot.appliedBootConfig` | 升级到 v1.3.8+；临时可自行 `KUI.bootLayer.destroy()` |
| 错误卡片出现后无法恢复内容 | `show()` 不恢复 `__inner`（§9.3） | 看 `.kui-boot__inner` 的 `display` | 手动 `style.display=''` 或销毁重建 |
| 出现多个加载层叠在一起 | 既 `attach()` 又 `create()`；或 `bootstrap` 跑了两次 | `document.querySelectorAll('#kui-boot').length` 与 `[data-boot-layer]` 数量 | 只保留一个 `attach`；多实例用 `create` 并挂在各自容器 |
| `done()` 后节点仍在 | `hideDelay` 太大 / 定时器被节流（后台标签页） | 等 1 秒再查；`inst.config.hideDelay` | 正常；需要立即移除用 `destroy()` |
| `file://` 下报 `KUI.bootLayer is undefined` | 没加载 `boot.js` / profile 里被删 | Elements 面板查脚本；控制台 `typeof KUI.bootLayer` | `npm run build:all` 重新生成 `kui-all.js` |
| 颜色和主题不搭 | 没加载 `base.css`/主题 token 缺省 | 看 computed 的 `--kui-accent` 是否为空 | 引 `base.css`；或自己定义主题 token（见 09 章） |

深度诊断三连：

```js
KUI.bootLayer.instance() && KUI.bootLayer.instance().getState();   // 当前状态快照
KUI.bootLayer.instance() && KUI.bootLayer.instance().config;       // 实际生效的配置
KUI.registry.get('boot');                                          // 注册描述符（defaults/render/api）
```

---

## 14. 升级、验收与回滚

### 14.1 从 v1.3.6 升级（历史版本）

1. `git pull` 拿到 v1.3.8 源码；
2. `npm run build:config`（重生成 `config/bundle.js`；`file://` 必做）；
3. `npm run build:all`（重生成 `src/core/kui-all.js`，把 `boot.js` 插进两个 profile）；
4. 清浏览器缓存/强刷，确认 `KUI.version === '1.3.8'`、`typeof KUI.bootLayer === 'object'`；
5. 观察首屏：应看到时钟表盘 + 4 阶段 + 最终 `12:00`。

### 14.2 验收命令表

| 命令 | 作用 | 期望 |
| --- | --- | --- |
| `npm start` | 起静态服务并自动构建 | 打印端口；`index.html` 正常 |
| `npm run build:config` | 生成 `config/bundle.js` | 无异常；文件更新 |
| `npm run build:all` | 生成 `src/core/kui-all.js` | Node 环境 `module.exports`；浏览器注入脚本 |
| `npm test` | 配置/服务/渲染/兼容套件 | `36 通过 / 0 失败` |
| `npm run smoke` | 全链路冒烟（含 `[27]` 加载层 5 项） | 全部 PASS，0 失败 |
| `npm run check:assets` | HTML 资源引用 | `22 个 HTML，错误 0，警告 0` |
| `npm run audit:components` | 组件拆装审查（含 boot 独立渲染） | 全部通过 |
| `npm run check:manual` | 本手册与运行时一致性 | `错误 0，警告 0` |
| `npm run verify` | smoke + 两类桥接验证 | 全绿 |

### 14.3 上线自检清单（10 项）

- [ ] 首屏无白屏：断网/慢网下静态骨架先出现；
- [ ] 慢网下能看到 4 个阶段依次变化，指针从 12 点顺时针走到 12 点；
- [ ] `boot:done` 后 `#kui-boot` 从 DOM 移除，页面可交互；
- [ ] 强制制造配置 404，看到错误卡片与「重新加载」按钮；
- [ ] 移动端竖屏下加载层不溢出（`min(360px,78vw)`）；
- [ ] 「减少动态效果」系统设置下无指针过渡动画，但读数正确；
- [ ] 主题切换后（如从设置里换肤）加载层颜色跟随；
- [ ] 控制台无 `KUI.bootLayer` 相关报错；
- [ ] 只加载加载层的独立页，Network 面板没有意外请求 `app-shell.js`；
- [ ] 版本核对：`KUI.version` 与 `KUI.bootLayer.version` 都符合预期。

### 14.4 回滚

1. 从 `config/kui-modules.json` 两个 profile 删除 `"src/components/boot.js"`；
2. `npm run build:all`；
3. 刷新 → 自动退回静态骨架（§10.2），功能降级但不失败；
4. 如需彻底移除，再删 `src/components/boot.js`、`src/styles/boot.css` 与 `index.html` 的 `boot.css` 引用。

### 14.5 已知差异（CHANGELOG / 配置参考与本组件源码不一致）

| 文档说法 | 源码实际 | 以谁为准 |
| --- | --- | --- |
| 实例 API 含 `reset` | 无 `reset` 方法（`boot.js:262-419`） | 本章 |
| `boot.enabled:false` 不渲染 | v1.3.7 及更早无读取点；v1.3.8 起销毁已创建实例并移除 `#kui-boot` | 本章 §5.5 |
| `boot.text` 是对象、按 `stages[].textKey` 覆盖 | `boot.text` 是字符串；`stages[]` 用 `text` 字段 | 本章 §5.2/5.3 |
| `boot:progress` 载荷 `{percent,step,clockText}` | 实际 `{percent, hands}` | 本章 §9.4 |
| `boot:error` 载荷 `{message,detail}` | 实际 `{error}`（Error 对象） | 本章 §9.4 |
| `clock.smooth` 控制指针平滑 | v1.3.7 及更早无读取点；v1.3.8 起写 `data-boot-smooth`，`false` 时关闭过渡 | 本章 §5.5 |
| `clock.mode: "none"` 不转 | 只实现 `spin`；`none` 与 `progress` 视觉相同 | 本章 §5.5 |

> 这些差异会随框架版本修正；升级后请以 `KUI.bootLayer.DEFAULTS` 与 `boot.js` 源码为准，并重跑 `npm run check:manual`。

---

## 本章自检

1. `handsAt(37.5)` 的 `hourAngle`、`minuteAngle`、`clockText` 分别是多少？为什么 0% 与 100% 都显示 `12:00`？
2. `boot.enabled` 设为 `false` 后加载层会消失吗？历史旧版 v1.3.7 与 v1.3.8 行为有何不同？
3. `app.json` 的 `boot.stages` 现在通过哪个函数生效？它被调用在 `boot()` 的哪一步？
4. `KUI.bootLayer.create` 与 `KUI.bootLayer.attach` 的三点区别是什么？
5. `inst.setProgress(50).setText('x')` 为什么会报错？应该怎么写？
6. 删掉 `config/kui-modules.json` 里的 `boot.js` 后，加载层会变成什么样？还有哪些能力保留？
7. `boot:progress`、`boot:done`、`boot:error` 三个事件的载荷分别是什么？由谁派发？
8. 把加载层搬进一个只有 `kui.js` + `registry.js` + `boot.js` + 两份 CSS 的项目，最小 HTML 骨架里 `#kui-boot` 必须保留哪些子元素？哪些可以不要？

> 自测答案都能在本章对应小节找到；建议边读边在控制台跑一遍 §2.4 的三条探针。

---

## 参考源码

| 文件 | 行号 | 内容 |
| --- | --- | --- |
| `src/components/boot.js` | 95-122 | `handsAt` 进度→角度/读数算法（含浮点收口与 0/100 特判） |
| `src/components/boot.js` | 124-150 | `DEFAULTS` 全字段与默认阶段表 |
| `src/components/boot.js` | 152-158 | `BOOT_ID` / `HIDE_DELAY=360` / 单例状态 |
| `src/components/boot.js` | 162-252 | `buildNode` 构建 DOM（含 data-* 与 CSS 变量） |
| `src/components/boot.js` | 256-419 | `createInstance` 与 14 个实例方法 |
| `src/components/boot.js` | 421-436 | `__kuiBootApi` 挂载、单例 id 策略、初始 12:00/0% |
| `src/components/boot.js` | 442-456 | `normalizeConfig` 合并顺序与文案回退 |
| `src/components/boot.js` | 458-487 | `attach` / `configure` / `destroy`（单例接管） |
| `src/components/boot.js` | 491-528 | `renderNode` 默认 inline、注册 `type:"boot"`、`KUI.bootLayer` 静态 API |
| `src/styles/boot.css` | 30-57 | `.kui-boot` 遮罩层与 `--inline` 内嵌 |
| `src/styles/boot.css` | 59-98 | 内容列入场动画、静态降级 logo 齿轮 |
| `src/styles/boot.css` | 100-187 | 表盘/刻度/时针/分针/轴点、`prefers-reduced-motion`、`spin` 自转 |
| `src/styles/boot.css` | 189-262 | 标题/副标题/进度条/文案/读数/meta 隐藏 |
| `src/styles/boot.css` | 264-324 | 错误卡片样式 |
| `src/styles/boot.css` | 326-334 | `.kui-boot-preview` 内嵌预览容器 |
| `src/app/bootstrap.js` | 19-54 | `BOOT_ID`、`bootNode`、`bootLayer`、`bootConfigOf`、`attachBootLayer` |
| `src/app/bootstrap.js` | 56-90 | `configureBootLayer`（`:56-64`）与 `applyBootConfig`（`:72-90`，v1.3.8 接线 + `boot.enabled` 处理） |
| `src/app/bootstrap.js` | 92-140 | `setBootText` / `setBootStep` / `hideBoot` / `showBootError` 的组件分支与 legacy 分支 |
| `src/app/bootstrap.js` | 761-800 | `applyAppMetaToConfig`（品牌/页脚/标题注入）与 `applyAppMeta`（含 `boot.loading` 文案） |
| `src/app/bootstrap.js` | 841-935 | `boot()` 主流程（含 `attachBootLayer(null)`、`applyBootConfig` 与 4 个阶段） |
| `src/app/bootstrap.js` | 941-963 | `autoBoot` 与 `KUI.boot` 启动器 API |
| `index.html` | 2 | `<html data-kui-boot="loading">` |
| `index.html` | 14-20 | 样式加载顺序（`boot.css` 最后） |
| `index.html` | 25-36 | `#kui-app` 挂载点与静态降级骨架 `#kui-boot` |
| `index.html` | 51 | 唯一入口 `kui-all.js`（`data-kui-profile="app"`） |
| `config/kui-modules.json` | 28 / 62 | app / standalone 两个 profile 中的 `boot.js` 条目 |
| `config/app.json` | 38-48 | 顶层 `boot` 段（v1.3.8 起由 `applyBootConfig` 接线，见 §5.5） |
| `config/text.json` | 76-89 | `boot` 文案组 12 键 |
| `standalone/boot.html` | 69 / 100 / 113 / 148 / 190 / 201 | 六个演示区块（交互测试台/映射表/JSON 渲染/API 表/拆装说明/日志） |
| `tools/smoke.js` | 1347-1507 | 冒烟 `[27]` 加载层 5 项（历史旧版 v1.3.7）与 `[28]` 配置接线 5 项（`boot.*` / 元信息 / `enabled:false` / 菜单页脚 / `keepAlive`） |
| `tools/audit-components.js` | 73 / 219-233 | boot 拆装审查用例与「完整装配下可创建 boot」检查 |
| `CHANGELOG.md` | `v1.3.8` 一节 | 需求原文、能力表、接线与验证记录（与本章 §14.5 的差异以本章为准） |

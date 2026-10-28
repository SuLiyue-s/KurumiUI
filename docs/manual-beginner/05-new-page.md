# 05 · 新建自己的页面

> 适用版本：KurumiUI v1.3.9 ｜ 难度：⭐ 入门 ｜ 前置章节：[04-config-ui.md](04-config-ui.md) ｜ 阅读时长：约 20 分钟

## 本章目标

- 能说清一个页面从「点菜单」到「显示出来」，中间经过哪三步
- 会复制 `pages/home.html` 得到自己的 `pages/mypage.html`，并改掉它的标题
- 会在 `config/app.json` 的菜单里加一条指向新页面的条目
- 会把新页面设为启动时自动打开的标签页
- 会在页面里放一个按钮，点一下就能改变页面内容

## 0. 先做个检查

本章每一步都要在「主应用」里验证。开始前先确认两件事：

1. 命令行里 `npm start` 还在运行，浏览器打开 <http://127.0.0.1:8080> 能看到左侧菜单和首页。
2. VS Code 打开的是**项目文件夹**（左侧文件列表里能看到 `config/`、`pages/`、`src/` 三个文件夹）。

如果第 1 步打不开，先回 [02-first-run.md](02-first-run.md) 把项目跑起来。

## 1. 页面是怎么显示出来的

主应用由三块组成：**左侧菜单**、**顶部标签栏**、**内容区**。内容区里每个标签页的背后都是一个 iframe，iframe 加载的正是 `pages/` 文件夹里的 HTML 文件。

点一个菜单条目，框架做了三件事：

1. 在 `config/app.json` 的 `menu.props.items` 里读到一条菜单项，它的 `target.tab` 写着「要打开哪个页面」。
2. 在顶部标签栏新建一个标签页（同一个 `id` 的标签已经打开时，直接切换过去，不会重复开）。
3. 内容区用 iframe 加载 `target.tab.url` 指向的页面文件，例如 `pages/home.html`。

所以「新建一个页面」就是两件事：**在 `pages/` 里放一个 HTML 文件**，再**在菜单里加一条指向它的条目**。

`pages/` 里现有 7 个业务页面，打开主应用就能逐个点开看：

| 页面文件 | 打开后看到什么 |
| --- | --- |
| `pages/home.html` | 首页（启动时固定打开的标签） |
| `pages/profile.html` | 未保存数据验证 |
| `pages/form.html` | 完整表单页（JSON 驱动的表单） |
| `pages/editor.html` | 编辑页保活（textarea 内容不丢） |
| `pages/dialogs.html` | 弹窗剧场（alert / confirm / form / custom） |
| `pages/notify.html` | 提醒讯号（四种 toast + 通知卡片） |
| `pages/theme.html` | 主题预览页（六套配色实时切换） |

> 小知识：`pages/` 里的页面其实也能单独打开，比如访问 <http://127.0.0.1:8080/pages/home.html>。单独打开时它就是一个普通网页，只是用不到「标签页」这些主应用能力。

## 2. 复制一个页面：`pages/mypage.html`

跟着做：

1. 在 VS Code 左侧的 `pages/` 文件夹上点右键，选「新建文件」，命名为 `mypage.html`。
2. 打开 `pages/home.html`，全选复制，粘贴进 `mypage.html`，保存。
3. 在 `mypage.html` 里改三处文字（都在文件里搜得到）：
   - 文件开头的网页标题：改前 `<title>首页 · 刻刻帝终端 | KurumiUI</title>`，改后 `<title>我的页面 · 刻刻帝终端 | KurumiUI</title>`
   - 页面里的大标题：改前 `<h1 class="hero__title">刻刻帝终端</h1>`，改后 `<h1 class="hero__title">我的第一个页面</h1>`
   - 文件底部脚本里的标签标题：改前 `frame.setTitle('刻刻帝终端 · 首页');`，改后 `frame.setTitle('我的第一个页面');`
4. 保存 `mypage.html`。

**你会看到**：界面上暂时没有任何变化——文件已经有了，但菜单里还没有入口。这是正常的，下一步就把它接进菜单。

`home.html` 里值得认识的几个部分（复制来的页面会一起带过来）：

| 部分 | 作用 |
| --- | --- |
| `<head>` 里的 4 个 `<link rel="stylesheet">` | 引入框架样式；删了页面就变白板 |
| `<title>` | 单独打开这个页面时，浏览器标签上显示的文字 |
| `<main class="home">` 里的 hero 区 | 页面顶部的大标题、副标题 |
| `<style>` 块 | 这个页面自己的样式，例如 `.btn` 按钮样式 |
| 底部的 `<script src="../src/core/kui-all.js">` | 引入框架本体；这一行不要改 |

> 复制页面时，`<head>` 里的 `theme-boot.js`、4 个样式表、`kui-all.js` 这 6 个引用都是**相对路径**（`../` 表示上一级），请保持原样，否则页面会白屏或样式全丢。

## 3. 把页面加进菜单

**改哪里**：`config/app.json` → `menu.props.items`。

`menu.props.items` 是一个数组，里面每一项是一块菜单内容，常用的有三种：

| `type` | 作用 |
| --- | --- |
| `group` | 一个可折叠的分组（有标题、图标、children） |
| `item` | 一条可以点击的菜单项 |
| `divider` | 一条分隔线 |

点击菜单项时打开什么页面，由 `item` 的 `target.tab` 决定：

| 字段 | 作用 |
| --- | --- |
| `target.tab.id` | 标签页的唯一编号；同一个 `id` 只会打开一个标签 |
| `target.tab.title` | 标签页上显示的文字 |
| `target.tab.url` | 要加载的页面文件，路径相对项目根目录，例如 `pages/mypage.html` |
| `target.tab.icon` | 标签页和菜单项旁的图标名，如 `home`、`list`、`feather` |
| `item.label` | 菜单上显示的文字 |
| `item.icon` | 菜单项前的图标名 |
| `item.badge` / `item.badgeType` | 可选的右上角小徽章，如 `"badge": "新"`、`"badgeType": "accent"` |
| `item.disabled` | 设为 `true` 后这条菜单变灰、不可点击 |

**改前**：在 `menu.props.items` 的「时间中枢」分组里，能找到下面这一条（菜单上叫「业务结界」下面第一个）：

```json
{
  "type": "item",
  "id": "profile",
  "label": "未保存数据验证",
  "icon": "shield",
  "badge": "验证",
  "badgeType": "success",
  "target": {
    "tab": {
      "id": "profile",
      "title": "未保存数据验证",
      "url": "pages/profile.html",
      "icon": "shield"
    }
  }
}
```

**改后**：在 profile 条目结尾的 `}` 后面补一个英文逗号 `,`，再粘贴下面这段（这就是本章要加的完整 14 行 JSON）；粘贴内容的结尾 `}` 后面**也要补一个逗号**，因为它后面还有别的条目：

```json
{
  "type": "item",
  "id": "mypage",
  "label": "我的第一个页面",
  "icon": "feather",
  "target": {
    "tab": {
      "id": "mypage",
      "title": "我的第一个页面",
      "url": "pages/mypage.html",
      "icon": "feather"
    }
  }
}
```

**怎么保存生效**：保存 `config/app.json` → 回到浏览器**刷新**（`npm start` 模式下刷新即可，不用重启）。

**你会看到**：左侧菜单「业务结界」分组里多出「我的第一个页面」；点它，顶部标签栏新建一个「我的第一个页面」，内容区显示你改好的大标题。

> 如果你用双击 `index.html`（`file://`）的方式打开，改完 JSON 需要先在命令行执行 `npm run build:config`，再刷新，否则读不到新配置。

## 4. 让页面启动就打开

**改哪里**：`config/app.json` → `tabs.props.initial`。这个数组里的每一项，是主应用启动时自动打开的标签页。

**改前**（`tabs.props.initial` 现在的值）：

```json
[
  {
    "id": "profile",
    "title": "未保存数据验证",
    "url": "pages/profile.html",
    "icon": "shield"
  },
  {
    "id": "theme-page",
    "title": "主题灵装",
    "url": "pages/theme.html",
    "icon": "palette"
  }
]
```

**改后**：把第二项换成你的页面（第一项保留，就能看到两个标签页一起打开）：

```json
[
  {
    "id": "profile",
    "title": "未保存数据验证",
    "url": "pages/profile.html",
    "icon": "shield"
  },
  {
    "id": "mypage",
    "title": "我的第一个页面",
    "url": "pages/mypage.html",
    "icon": "feather"
  }
]
```

**怎么保存生效**：保存 `config/app.json` → 刷新主应用。

**你会看到**：刷新后标签栏里已经有两个标签页：固定的「刻刻帝终端」首页，加上「我的第一个页面」，而且第二个是当前选中的。

> 注意：首页标签由 `tabs.props.home` 单独控制，固定存在、默认不可关闭，别去删它。`initial` 只负责「启动时额外打开哪些」。

## 5. 在页面里放一个按钮

**改哪里**：`pages/mypage.html`，两处——先在 hero 区下面加按钮，再在文件底部加一段内联脚本。

第一处，在 `<h1 class="hero__title">我的第一个页面</h1>` 所在的 `</section>` 后面，加一行按钮：

```html
<button class="btn btn--primary" id="helloBtn">点我一下</button>
```

第二处，在文件最底部的 `</script>` 之前（也就是页面脚本的末尾），加一个点击监听：

```html
<script>
  (function () {
    var n = 0;
    document.getElementById('helloBtn').addEventListener('click', function () {
      n += 1;
      document.querySelector('.hero__title').textContent = '你点了 ' + n + ' 次';
    });
  })();
</script>
```

**怎么保存生效**：保存 `mypage.html` → 切回主应用里这个标签页 → 点标签栏上的刷新按钮（或右键标签页选刷新）。

**你会看到**：页面顶部大标题下面多了一个紫色按钮「点我一下」；每点一次，大标题就变成「你点了 1 次」「你点了 2 次」……

> 按钮的 `class="btn btn--primary"` 来自 `home.html` 自带的 `<style>`，复制页面时已经一起带过来了，所以你不用额外引入任何东西。想换颜色可以把 `btn--primary` 改成 `btn`（普通按钮）或 `btn--danger`（红色危险按钮，样式以页面里的 `<style>` 为准）。

## 6. 常见错误与排查

| 现象 | 最可能的原因 | 先做这三步检查 | 修复 |
| --- | --- | --- | --- |
| 点菜单后内容区空白，或出现 404 | `target.tab.url` 写错、大小写不对，或用了 `/` 开头的绝对路径 | ① 确认 `pages/mypage.html` 文件真实存在且拼写一致；② 看 url 是不是 `pages/mypage.html`；③ 直接在浏览器地址栏输入 <http://127.0.0.1:8080/pages/mypage.html> 看能不能打开 | 把 `url` 改成相对项目根目录的 `pages/mypage.html` |
| 保存 `app.json` 后刷新，界面打不开或还是旧样子 | JSON 语法错误：多写了逗号、少了逗号、引号不是英文、括号层级错 | ① 看 VS Code 有没有红色波浪线；② 命令行执行 `node -e "JSON.parse(require('fs').readFileSync('config/app.json','utf8'));console.log('ok')"`；③ 看报错指出的行号 | 按报错修 JSON；新手最容易在数组最后一项后面多写逗号 |
| 菜单里看不到新条目 | 条目加错了位置（加到了 `menu` 外面，或加进了 `props` 之外） | ① 全文搜索 `"mypage"`，看它在哪一层；② 确认祖先里有 `menu` → `props` → `items`；③ 确认它前面一项用逗号隔开 | 把条目移进 `menu.props.items` 的数组里 |
| 页面打开了但白底、没有样式 | 复制时漏了 `<link rel="stylesheet">`，或样式路径被改坏 | ① 看页面里是否有 4 个 `<link rel="stylesheet">`；② 看路径是否都以 `../src/styles/` 开头；③ 按 F12 看「网络」面板有没有 404 | 重新从 `pages/home.html` 复制一份，再改文字 |
| 刷新后新页面没出现在启动标签里 | 改的是 `tabs.props.initial` 之外的地方，或 JSON 没保存成功 | ① 搜索 `"initial"` 确认在 `tabs.props` 下；② 看 `id` 是否和菜单里写的一致；③ 确认文件已保存（标题栏没有圆点） | 按上面第 4 节的改后片段对照修改 |
| 双击 `pages/mypage.html` 单独打开时，控制台一堆报错 | `file://` 下页面拿不到主应用的配置与桥接能力 | ① 换成 `npm start` 后访问 <http://127.0.0.1:8080>；② 或先 `npm run build:config` | 做页面一律用 `npm start` 打开 |
| 点了按钮没反应 | 脚本放在了按钮前面导致 `getElementById` 拿到空，或 `id` 拼错 | ① 按 F12 看控制台报错；② 核对按钮 `id="helloBtn"` 与脚本里 `getElementById('helloBtn')` 一字不差；③ 确认脚本在按钮之后 | 把 `<script>` 移到按钮后面，或改用 `DOMContentLoaded` |

## 动手练习

1. **再加一条菜单项**：在「业务结界」分组里再加一条，标题叫「第二页」，也指向 `pages/mypage.html`。
   改哪里：`config/app.json` → `menu.props.items` 的同一分组。
   怎么验证：刷新后菜单多一条；点开它，标签页标题是「第二页」，内容和大标题仍是「我的第一个页面」。
   提示：`item.id` 和 `target.tab.id` 要保持一致；两条菜单指向同一个 url 是允许的。

2. **给菜单项加徽章**：给「我的第一个页面」加一个红色小徽章「新」。
   改哪里：`config/app.json` → 你加的那条 item。
   怎么验证：菜单文字右侧出现小徽章。
   提示：试 `"badge": "新"`、`"badgeType": "accent"`，再换成 `"gold"` 看颜色变化。

3. **调整启动标签顺序**：让「我的第一个页面」排在启动标签的第一个。
   改哪里：`config/app.json` → `tabs.props.initial`。
   怎么验证：刷新后新页面标签排在最左（首页固定标签之后），并且是当前选中的。
   提示：把两个对象在数组里交换位置即可。

4. **按钮做点别的**：让按钮点击后，在页面顶部显示当前时间，而不是计数。
   改哪里：`pages/mypage.html` 里的内联脚本。
   怎么验证：点一次，标题变成类似「现在 14:05:32」。
   提示：`new Date().toLocaleTimeString()` 就能拿到当前时间字符串。

## 本章小结

- 页面显示的三步：菜单项 `target.tab` 描述页面 → 点开标签页 → 内容区 iframe 加载 `pages/*.html`。
- 新建页面 = 复制 `pages/home.html` 为 `pages/mypage.html`，改 `<title>`、`<h1>`、`frame.setTitle(...)` 三处。
- 加菜单项 = 在 `config/app.json` 的 `menu.props.items` 里加一条 `item`，关键是 `target.tab` 的 `id` / `title` / `url` / `icon`。
- 设为启动标签 = 在 `tabs.props.initial` 数组里加一项；首页标签由 `tabs.props.home` 单独控制。
- 页面里可以直接写普通 HTML 和 `<script>`，按钮样式可复用 `home.html` 自带的 `.btn` 类。
- 改配置后：`npm start` 模式刷新即可；`file://` 模式要先 `npm run build:config`。
- 排错顺序：先看控制台报错，再用 `node -e "JSON.parse(...)"` 验证 JSON，最后确认路径与 id。

## 延伸阅读

- 下一章：[06-form-basics.md](06-form-basics.md)——在页面里放表单和控件，做出真正能填、能提交的页面。
- 想深入看菜单/标签页的完整字段：[../manual/04-config-app.md](../manual/04-config-app.md)（`app.json` 全字段说明）。
- 想跟着完整案例走一遍：[../manual/13-walkthrough.md](../manual/13-walkthrough.md)（高级手册三个端到端实战）。

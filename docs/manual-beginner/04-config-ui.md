# 04 · 用配置把界面改成你的样子

> 适用版本：KurumiUI v1.4.3 ｜ 难度：⭐ 入门 ｜ 前置章节：[02-first-run.md](02-first-run.md) ｜ 阅读时长：约 25 分钟

## 本章目标

- 看懂 JSON 配置：对象、数组、字符串、数字、布尔、嵌套，以及「逗号、引号、不能写注释」。
- 找到并分清配置文件：`config/app.json`（界面主配置）、`config/text.json`（界面文案）、`src/themes.json`（主题颜色）、`config/demos/`（示例配置）。
- 亲手把标题、菜单、默认标签页、布局尺寸、界面文案和头像改掉，每改一处都在界面上看到变化。
- 遇到「改了没反应」时，能按四步排查：JSON 语法、字段层级、是否被覆盖、是否刷新或重建。

## 1. JSON 10 分钟：先看懂配置文件

KurumiUI 的界面几乎都由 JSON 描述。JSON 不写代码，只写数据，长得像这样：

```json
{
  "title": "刻刻帝终端",
  "version": "1.0.0",
  "debug": false,
  "tags": ["首页", "设置", "帮助"],
  "home": { "url": "pages/home.html", "pinned": true }
}
```

这段配置里有五种值，一眼分清就够了：

| 写法 | 名字 | 例子 | 什么时候用 |
| --- | --- | --- | --- |
| `"文字"` | 字符串 | `"刻刻帝终端"` | 标题、颜色、路径等一切文字 |
| `123`、`0.5` | 数字 | `252`、`3200` | 宽度、延迟、数量等数字 |
| `true` / `false` | 布尔 | `"pinned": true` | 开关类设置 |
| `["a", "b"]` | 数组 | `"tags": ["首页"]` | 一组同类值，有顺序 |
| `{ "键": 值 }` | 对象 | `"home": { "url": "..." }` | 一组有关联的设置 |

嵌套就是对象里再放对象，配置里到处都是：

```json
{
  "app": {
    "title": "刻刻帝终端",
    "loading": { "text": "灵装回路接通中…", "delay": 120 }
  },
  "layout": {
    "menu": { "width": 252 },
    "header": { "height": 56 }
  }
}
```

写 JSON 只有四条规矩：

1. 名字和文字值都用双引号 `"`，不能用单引号。
2. 两个设置之间用英文逗号 `,` 隔开；最后一项后面**不能**多写逗号。
3. 不能写注释。想记笔记，写到章节文档或单独的文件里。
4. `{` 配 `}`，`[` 配 `]`，成对出现。

下面这些是**错误**写法（不要照抄）：

```text
{
  "title": "刻刻帝终端",   // ← 不能写注释
  "subtitle": "控制台",     // ← 最后一项多了逗号
}
```

不要被吓到：用 VS Code、记事本写都行，VS Code 会用红色波浪线提示语法错。实在改乱了，就把这一段整体换回备份。

## 2. 配置文件地图：改哪个文件管什么

| 文件 | 管什么 | 新手第一次会改什么 |
| --- | --- | --- |
| `config/app.json` | 界面主配置：应用信息、布局、菜单、顶部导航、默认标签页、头像、启动屏等 | 标题、菜单项、默认标签、布局尺寸、头像 |
| `config/text.json` | 界面文案：按钮、提示、空状态等文字（40 组） | 标签页提示、菜单提示、启动屏文字 |
| `src/themes.json` | 6 个主题的颜色变量（主题配置） | 先不改，等看完 [07-theme-basics.md](07-theme-basics.md) 再动 |
| `config/demos/` | 11 个现成的示例配置（菜单、标签页、表单、弹窗等） | 只当参考资料，不要改 |

`config/app.json` 顶层有 12 个分节，按需查表即可：

| 分节 | 管什么 | 本章哪节用到 |
| --- | --- | --- |
| `schema` | 配置格式版本号，不用改 | — |
| `app` | 应用信息：标题、副标题、版本、版权、启动文字 | 第 3 节 |
| `ui` | 全局小部件默认值：悬浮提示、消息提示、对话框 | 暂不涉及 |
| `boot` | 启动屏：时钟动画、进度、阶段文字 | 第 7 节提一句 |
| `dialogs` | 设置弹窗等内置对话框的默认内容 | 不涉及 |
| `theme` | 默认主题、可选主题列表、主题选择弹窗 | 第 3 节提一句 |
| `layout` | 布局尺寸：菜单宽度、顶栏高度、标签栏高度、间距 | 第 6 节 |
| `menu` | 左侧菜单：品牌区、菜单项、底部页脚 | 第 3、4 节 |
| `menunav` | 顶部导航：标题、面包屑、工具按钮 | 第 3 节 |
| `tabs` | 标签页：首页、启动时打开哪些、最多几个 | 第 5 节 |
| `text` | 文案覆盖层：覆盖 `text.json` 里的同名文字 | 第 7 节 |
| `avatar` | 头像：图片地址、大小、形状、齿轮框 | 第 8 节 |

改完怎么生效：用 `npm start` 打开页面时，保存 JSON 后**刷新浏览器**即可看到变化；如果你习惯直接双击 `index.html`（`file://` 方式打开），需要先运行 `npm run build:config` 再刷新。如果刷新后仍是旧内容（浏览器缓存或 `file://` 方式），先执行一次 `npm run build:config` 再强制刷新页面。两种情况都建议改前先备份 `config/` 文件夹（或提交一次 git），改坏了能一键还原。

还有两个文件是自动生成的，**不要手改**：`config/bundle.js` 和 `src/core/kui-all.js`，它们由构建命令生成。

## 3. 改应用元信息：标题、副标题、Logo 与版权

先记住一个容易踩的坑：**「应用名」在界面上其实有三处**，分别由三个字段控制，改一处不会联动：

| 字段 | 位置 | 控制哪里 | 默认值 |
| --- | --- | --- | --- |
| `app.title` | `app` 段 | 浏览器标签页标题（加载完成后显示） | `"刻刻帝终端"` |
| `menu.props.brand.title` | `menu` 段 | 左侧菜单顶部的品牌名 | `"刻刻帝终端"` |
| `menunav.props.title` | `menunav` 段 | 顶部导航栏的标题 | `"刻刻帝终端"` |

所以示范时一次改三处最稳。下面按「改哪里 → 改前/改后 → 保存刷新 → 看到什么」来。

### 3.1 改浏览器标签页标题

改哪里：`config/app.json` 的 `app.title`。

```json
{
  "app": {
    "title": "刻刻帝终端"
  }
}
```

改成：

```json
{
  "app": {
    "title": "我的结界终端"
  }
}
```

保存 → 刷新浏览器 → 看浏览器标签页，标题变成「我的结界终端」。

顺带认识一个字段：`app.documentTitle`（默认 `刻刻帝终端 · KurumiUI`）只影响页面加载阶段显示的标题；加载完成后，浏览器标题以 `app.title` 为准。日常改标题，改 `app.title` 就够了。

### 3.2 一次改三处：品牌区、顶栏、浏览器标题

改哪里：`app.title`、`menu.props.brand.title`、`menunav.props.title` 三处。

```json
{
  "app": {
    "title": "我的结界终端"
  },
  "menu": {
    "props": {
      "brand": { "title": "我的结界终端" }
    }
  },
  "menunav": {
    "props": { "title": "我的结界终端" }
  }
}
```

注意这只是摘录：三处在文件里是分开的三段，分别改各自的字段即可，不要整段替换成上面的内容。

保存 → 刷新 → 左侧菜单顶部品牌名、顶部导航标题、浏览器标签页标题三处一起变成「我的结界终端」。

### 3.3 改副标题与版权

改哪里：`app.subtitle`（启动时显示的副标题）、`app.copyright`（菜单底部的版权行）。

```json
{
  "app": {
    "subtitle": "我的第一个配置文件",
    "copyright": "© 2026 我的结界"
  }
}
```

保存 → 刷新 → 页面加载的一瞬间，启动屏副标题显示「我的第一个配置文件」；加载完成后，左侧菜单底部的页脚显示新的版权文字。

补充：菜单品牌区的副标题（品牌名下面那行小字）由 `menu.props.brand.subtitle` 控制，默认是 `"KurumiUI · 灵装回路"`；想改这行，去 `menu` 段的 `brand.subtitle`。

### 3.4 换左上角 Logo（品牌区）

`app.logoIcon` 和 `app.logoText` 只是「兜底值」：只有当 `menu.props.brand` 里的 `logoIcon`、`logoText` 留空时才会用到它们。默认配置里品牌区已经写了自己的值，所以想换左上角图标，直接改 `menu` 段：

```json
{
  "menu": {
    "props": {
      "brand": {
        "logoIcon": "shield",
        "logoText": "MINE"
      }
    }
  }
}
```

保存 → 刷新 → 左上角图标从时钟（`clock`）换成盾牌（`shield`），图标下方的文字从 `KUI` 变成 `MINE`（v1.3.8 起 `logoText` 会真实显示）。

图标名写错会显示空白，新手先照抄已有项里的名字：`clock`、`home`、`list`、`palette`、`bell`、`shield`、`edit`、`message`、`folder`、`grid`、`terminal`、`lock`。

## 4. 改菜单：增删改左侧导航

左侧菜单的条目全部写在 `config/app.json` 的 `menu.props.items` 里，它是一个数组，从做到右依次对应菜单里从上到下的显示顺序。数组里只有三种节点：

- `type: "group"`：分组，可折叠，`children` 里放子项；
- `type: "item"`：可点击的菜单项，点击会打开标签页；
- `type: "divider"`：一条分隔线，不用写别的字段。

一个可点击菜单项的常用字段：

| 字段 | 类型 | 作用 | 取值 |
| --- | --- | --- | --- |
| `type` | 字符串 | 节点类型 | `"item"` |
| `id` | 字符串 | 唯一标识，不要和别的项重复 | 如 `"my-favorite"` |
| `label` | 字符串 | 菜单上显示的文字 | 如 `"我的收藏"` |
| `icon` | 字符串 | 图标名 | 见 3.4 的图标列表 |
| `badge` | 字符串 | 名字后面的小徽章文字，可省略 | 如 `"新"` |
| `badgeType` | 字符串 | 徽章颜色 | `"accent"`、`"gold"`、`"success"`、`"warning"`、`"danger"` |
| `tooltip` | 字符串 | 鼠标悬停提示，可省略 | 如 `"控制台首页"` |
| `target.tab` | 对象 | 点击后打开哪个标签页 | 见下 |
| `children` | 数组 | 分组里的子项 | 仅 `group` 用 |
| `disabled` | 布尔 | `true` 时置灰不可点 | 一般不用 |

`target.tab` 里最常用三个字段：`id`（标签页唯一标识）、`title`（标签页上显示的名字）、`url`（页面路径，如 `pages/home.html` 或 `standalone/xxx.html`）。

### 4.1 改一个菜单项的文字

改哪里：`menu.props.items` 里「时间中枢」分组下的 `home` 项。

改前：

```json
{
  "type": "item",
  "id": "home",
  "label": "总览·刻刻帝终端",
  "icon": "home",
  "target": { "tab": { "title": "刻刻帝终端" } }
}
```

改后：

```json
{
  "type": "item",
  "id": "home",
  "label": "总览·我的控制台",
  "icon": "home",
  "target": { "tab": { "title": "我的首页" } }
}
```

保存 → 刷新 → 左侧菜单第一项的文字变成「总览·我的控制台」，点开后标签页标题是「我的首页」。

### 4.2 新增一个菜单项

改哪里：在「时间中枢」分组里，`home` 项后面插入下面这段（注意把它前面的项结尾补上逗号）：

```json
{
  "type": "item",
  "id": "my-favorite",
  "label": "我的收藏",
  "icon": "folder",
  "badge": "新",
  "badgeType": "gold",
  "target": {
    "tab": {
      "id": "my-favorite",
      "title": "我的收藏",
      "url": "pages/profile.html",
      "icon": "folder"
    }
  }
}
```

保存 → 刷新 → 「时间中枢」分组里多出「我的收藏」一项，带金色「新」徽章；点击它，标签栏里打开一个新标签，显示 `pages/profile.html` 页面。

### 4.3 加分隔线与新分组

分隔线只要一个对象，放在你想分隔的两项之间：

```json
{ "type": "divider" }
```

新分组放在 `items` 数组末尾：

```json
{
  "type": "group",
  "id": "g-mine",
  "label": "我的空间",
  "icon": "grid",
  "children": [
    {
      "type": "item",
      "id": "my-page",
      "label": "我的页面",
      "icon": "folder",
      "target": {
        "tab": {
          "id": "my-page",
          "title": "我的页面",
          "url": "pages/profile.html",
          "icon": "folder"
        }
      }
    }
  ]
}
```

保存 → 刷新 → 菜单里出现「我的空间」分组和分隔线；点分组标题可以折叠、展开。

## 5. 改默认标签页：首页与启动时打开的页面

标签栏由 `config/app.json` 的 `tabs.props` 控制，三个常用字段：

| 字段 | 作用 | 默认值 |
| --- | --- | --- |
| `tabs.props.home` | 第一个固定标签（首页），点关闭关不掉 | 对象：`id`、`title`、`url`、`icon`、`pinned: true`、`closable: false` |
| `tabs.props.initial` | 启动时额外打开的标签页数组 | 两项：未保存数据验证、主题灵装 |
| `tabs.props.maxTabs` | 最多同时打开几个标签 | `24` |

### 5.1 改首页标签的名字

改哪里：`tabs.props.home.title`。

```json
{
  "tabs": {
    "props": {
      "home": {
        "id": "home",
        "title": "我的首页",
        "url": "pages/home.html",
        "icon": "home",
        "pinned": true,
        "closable": false
      }
    }
  }
}
```

保存 → 刷新 → 标签栏第一个标签的文字变成「我的首页」。

### 5.2 启动时多开一个标签

改哪里：`tabs.props.initial` 数组。

```json
{
  "tabs": {
    "props": {
      "initial": [
        { "id": "profile", "title": "未保存数据验证", "url": "pages/profile.html", "icon": "shield" },
        { "id": "docs", "title": "使用说明", "url": "pages/theme.html", "icon": "message" }
      ]
    }
  }
}
```

保存 → 刷新 → 启动后标签栏里依次出现首页、未保存数据验证、使用说明三个标签；想只留一个，把 `initial` 改成空数组 `[]`。

### 5.3 限制最多打开几个标签

改哪里：`tabs.props.maxTabs`，例如改成 3：

```json
{
  "tabs": {
    "props": { "maxTabs": 3 }
  }
}
```

保存 → 刷新 → 再从菜单连续打开页面，打开第 4 个时会弹出提示「最多同时打开 3 个标签，请先关闭部分页面」。验证完记得改回 `24`，不然以后自己用着会不方便。

## 6. 改布局尺寸：菜单宽度、顶栏高度、标签栏高度

布局尺寸在 `config/app.json` 的 `layout` 分节，数字不用写单位，框架会自动补 `px`：

| 字段 | 作用 | 默认值 | 改大了会怎样 |
| --- | --- | --- | --- |
| `layout.gap` | 内容区与菜单、页边的间距 | `10` | 内容区四周留白变多 |
| `layout.menu.width` | 左侧菜单展开时的宽度 | `252` | 菜单变宽，内容区变窄 |
| `layout.menu.collapsedWidth` | 菜单收起后的宽度 | `68` | 收起时只显示图标、更窄 |
| `layout.menu.collapsed` | 启动时是否收起菜单 | `false` | `true` 时菜单默认收起 |
| `layout.header.height` | 顶部导航栏高度 | `56` | 顶栏变高、内容区上移 |
| `layout.tabbarHeight` | 标签栏高度 | `38` | 标签栏变高 |

示例：菜单加宽到 300、顶栏加高到 64：

```json
{
  "layout": {
    "gap": 10,
    "menu": { "width": 300, "collapsedWidth": 68, "collapsed": false },
    "header": { "height": 64 },
    "tabbarHeight": 38
  }
}
```

保存 → 刷新 → 左侧菜单明显变宽，顶部导航栏变高。**调宽度优先改 `layout.menu.width`**；v1.3.9 起组件级的 `menu.props.width` / `menu.props.collapsedWidth` 也会生效（且优先于 `layout`），但小白阶段建议只用 `layout`，避免两处都写造成“改了没反应”的困惑。

## 7. 改文案：`text.json` 是默认值，`app.json` 的 `text` 是覆盖

界面上的文字统一放在 `config/text.json`，按组保存，共 40 组。新手最常改这几组：

| 组名 | 管什么 | 例子键 |
| --- | --- | --- |
| `app` | 应用名、版本、版权等 | `app.title` |
| `boot` | 启动屏文字 | `boot.loading`、`boot.ready` |
| `shell` | 顶栏、检索、菜单开关等通用文字 | `shell.search` |
| `menu` | 左侧菜单文字 | `menu.collapse`、`menu.empty` |
| `tabs` | 标签页文字 | `tabs.close`、`tabs.empty` |
| `page` | 给自定义页面预留的文案位 | `page.home.title` |

`config/app.json` 里还有一个 `text` 分节，它是**覆盖层**：写同名键会盖掉 `text.json` 里的默认值。例如 `config/app.json` 里已经覆盖了这几条：

```json
{
  "text": {
    "menu": { "footerDefault": "灵装回路" },
    "shell": { "searchPlaceholder": "检索时间线、结界与刻印…" },
    "page": { "home": "刻刻帝终端" }
  }
}
```

所以改文字没生效时，先去 `config/app.json` 的 `text` 段搜一下同名键——覆盖优先。

### 7.1 改标签页的关闭提示

改哪里：`config/text.json` 的 `tabs` 组。改前：

```json
{
  "tabs": {
    "close": "关闭标签",
    "empty": "暂无打开的灵装页面"
  }
}
```

改后：

```json
{
  "tabs": {
    "close": "关掉这个页面",
    "empty": "这里还空着"
  }
}
```

保存 →（`file://` 方式打开时先 `npm run build:config`）→ 刷新 → 把鼠标移到标签页的 × 按钮上，提示变成「关掉这个页面」；右键菜单里的「关闭标签」也同步变了。

### 7.2 改空标签栏的提示

改哪里：`config/text.json` 的 `tabs.empty`。上面已经把它改成「这里还空着」，刷新后把标签全部关掉，标签栏中央的提示会显示新文字。

两个提醒：`page` 组是给以后自己新建的页面预留的，内置页面暂时不读它；启动屏的文字除了 `text.json` 的 `boot` 组，`config/app.json` 的 `boot` 段里也配了分阶段文字（第 2 节表格里的 `boot` 分节），后者会在对应阶段生效。

## 8. 改头像：把左上角换成自己的图

头像在 `config/app.json` 的 `avatar` 段，显示在左侧菜单品牌区的左上角，默认是一个内嵌的 SVG 头像。常用字段：

| 字段 | 作用 | 默认值 |
| --- | --- | --- |
| `avatar.url` | 头像图片地址：网络地址、项目内相对路径或 `data:image/...` | 内嵌 SVG |
| `avatar.editable` | 是否允许点击头像换图（点击打开头像选择弹窗） | `true` |
| `avatar.persist` | 是否把用户选的头像记住（存在浏览器本地） | `true` |
| `avatar.size` | 头像大小，数字自动补 `px` | `42` |
| `avatar.shape` | 形状：`circle` 圆形、`square` 方形 | `"circle"` |
| `avatar.frame.enabled` | 是否显示外圈齿轮框 | `true` |

### 8.1 换成自己的图片

先把图片放进项目里，比如叫 `pages/avatar.png`，然后改 `avatar.url`：

```json
{
  "avatar": {
    "url": "pages/avatar.png",
    "editable": true,
    "persist": true,
    "size": 56,
    "shape": "circle",
    "frame": { "enabled": false }
  }
}
```

保存 → 刷新 → 左上角头像变成你的图片。`url` 写相对路径时，是相对 `index.html` 所在位置；也可以直接写 `"data:image/png;base64,..."`。

### 8.2 调整大小与齿轮框

上面那段示例同时把 `size` 从 `42` 改成 `56`（头像变大）、`frame.enabled` 改成 `false`（外圈齿轮消失）。只想要其中一个效果就只改对应字段。`shape` 改成 `"square"` 会变成圆角方形。

点击头像会打开「更换头像」弹窗（`editable: true` 时），可以填图片地址或选内置预设，也可以清除自定义头像恢复默认图标；选本地图片时大小受 `avatar.picker.maxSizeMB` 限制（默认 2MB）。

## 9. 改完怎么生效？界面保存的东西存在哪？

前面每节的最后都写「保存 → 刷新」。这一节把两个最容易踩的坑一次说清：**哪些改动刷新就好、哪些必须“重新生成配置包”**；以及**你在界面上点的保存，究竟存到了哪里**。

### 9.1 三种情况，对号入座

| 你改了什么 | `npm start`（`http://` 打开） | `file://` 双击打开 / 打包分发 |
| --- | --- | --- |
| `config/app.json`、`config/text.json`、`src/themes.json`、`config/demos/*.json` | 保存后**刷新页面即生效** | 必须先 `npm run build:config` 再刷新 |
| `config/kui-modules.json`（脚本清单/profile） | **必须** `npm run build:all`（或 `npm run build`）重建 `src/core/kui-all.js` | 同样必须重建 |
| `index.html`、`src/styles/*.css`、`src/**/*.js` | 直接改、刷新即生效（浏览器重新加载源码） | 不需要构建 |

记两句话：

- **配置进 bundle，脚本进清单。** 配置类 JSON 会被打包进 `config/bundle.js`；`http` 下页面优先直接读原始 JSON，bundle 只是兜底。`kui-modules.json` 决定 `kui-all.js` 里有哪些脚本，改了它就必须重建。
- **没有热更新，改完一律刷新页面**（`F5`；样式没变就用 `Ctrl+F5` 强制刷新）。

> 部署到服务器后同理：上传了 `config/*.json` 的站点，线上改这些 JSON 刷新即可；只上传了 `config/bundle.js` 的站点，必须本地重建后重新上传（详见 [08-deploy.md](08-deploy.md)）。

### 9.2 界面上点的“保存”，存到了浏览器里

点右上角「设置」、选主题、换头像、折叠菜单——这些操作**不会修改任何配置文件**，而是把偏好写进**当前浏览器的 localStorage**；`config/*.json` 只提供默认值。

| 你在界面上做了什么 | 浏览器存储键 | 下次打开还记得吗 |
| --- | --- | --- |
| 改终端名称 | `kui-shell-name` | 记得 |
| 选主题 | `kui-theme` | 记得 |
| 设启动页 | `kui-start-tab` | 记得 |
| 记住上次标签 | `kui-remember-tab`、`kui-last-tab` | 记得 |
| 改界面密度 | `kui-density` | 记得 |
| 换头像 | `kui-avatar`（`avatar.persist: true` 时） | 记得 |
| 折叠菜单 | `kui-menu-collapsed` | 记得 |
| 打开/关闭诊断面板 | `kui-debug` | 记得 |
| iframe 自愈标记 | `sessionStorage` 的 `kui-self-heal:<版本>` | 关标签即消失 |

两个直接后果：

1. **换浏览器、换电脑或清缓存，你保存的标题/皮肤就“没了”**——新浏览器里 localStorage 是空的，会回到 `config/app.json` 的默认值。
2. 主题优先级是：网址 `?kuiTheme=` > 本机已保存的主题 > `config/app.json` 的 `theme.default`。所以“我改了 `theme.default` 怎么没变”，往往是本机还记着上次选的主题。

### 9.3 清除偏好 / 让所有访问者看到新默认

- 清掉全部偏好：打开 F12 → Application（应用）→ Local Storage → 选中本站 → 删除对应键（或控制台执行 `localStorage.clear()`）。
- 只清主题：控制台执行 `KUI.theme.clearPersisted()`。
- 只想“看一次默认效果”：开一个无痕窗口访问。
- **想让所有访问者看到新标题、新默认皮肤**：改 `config/app.json`（`app.title`、`theme.default` 等），并按 9.1 的表格决定是否重建——不要只在自己的浏览器里点保存。

> 一句话总结：**配置文件管“所有人的默认值”，localStorage 管“这台浏览器的偏好”。**

## 动手练习

1. 把浏览器标签页标题改成「刻刻帝终端 · 我的版本」，同时把左侧品牌名和顶栏标题也改成同一个名字。提示：三处字段。
2. 在「时间中枢」分组里新增一项「我的收藏」，点击后打开 `pages/profile.html`。提示：往 `menu.props.items` 里插对象。
3. 让启动时只打开首页一个标签。提示：`tabs.props.initial`。
4. 把左侧菜单宽度改成 300、顶栏高度改成 64。提示：只改 `layout`。
5. 把标签页关闭提示改成「让这个页面消散」，并验证右键菜单里的文字也变了。提示：`text.json` 的 `tabs.close`。

## 本章小结

- 配置是 JSON：双引号、逗号分隔、不能写注释，对象和数组可以一层层嵌套。
- 界面主配置在 `config/app.json`（12 个分节），界面文案在 `config/text.json`，主题颜色在 `src/themes.json`。
- 「应用名」分三处：浏览器标题 `app.title`、品牌区 `menu.props.brand.title`、顶栏 `menunav.props.title`。
- 菜单项写在 `menu.props.items`，节点有 `group`、`item`、`divider` 三种，点击行为在 `target.tab`。
- 标签页的首页、启动时打开哪些、最多几个，都在 `tabs.props` 的 `home`、`initial`、`maxTabs`。
- 布局尺寸优先在 `layout` 里改；v1.3.9 起 `menu.props.width/collapsedWidth` 也生效（且优先于 `layout`）。
- **配置 JSON 是默认值，界面保存的偏好进 localStorage**：改配置文件并按 9.1 判断是否重建，才能让所有访问者看到新默认。

## 延伸阅读

- 下一章：[05-new-page.md](05-new-page.md)——新建一个页面并接进菜单。
- 认识界面组成：[03-tour.md](03-tour.md)。
- 主题与颜色：[07-theme-basics.md](07-theme-basics.md)。
- 想深入每个字段：[../manual/04-config-app.md](../manual/04-config-app.md)（高级手册：`app.json` 全字段详解）。

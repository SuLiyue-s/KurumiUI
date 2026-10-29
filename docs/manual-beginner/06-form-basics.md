# 06 · 表单与控件入门

> 适用版本：KurumiUI v1.4.4 ｜ 难度：⭐ 入门 ｜ 前置章节：[05-new-page.md](05-new-page.md) ｜ 阅读时长：约 25 分钟

## 本章目标

- 能看懂一个节点 `{ "type": …, "props": … }`，说出 `type` 和 `props` 各管什么
- 认识 8 个常用控件，会照着写出它们的最小 JSON
- 能把一个完整的「个人资料卡」表单放进自己的页面并看到效果
- 会用 3 行代码在浏览器控制台里取值、改值、校验
- 知道去哪里翻看剩下的所有控件和示例页

## 0. 先做个检查

打开任意一个业务页面（例如 <http://127.0.0.1:8080/pages/home.html>），按 <kbd>F12</kbd> 打开开发者工具，在「控制台」里输入下面这一行再回车：

```js
KUI.version
```

**你会看到**：控制台返回 `"1.3.8"`。这说明框架已经加载成功，本章所有小实验都可以这样做。

如果报错 `KUI is not defined`，说明页面没引入 `src/core/kui-all.js`，先回上一章检查页面底部的 `<script>` 标签。

## 1. 节点树：界面就是一棵 `{ type, props }` 树

KurumiUI 的界面不是一段段 HTML，而是一棵**节点树**。每个节点都是一个小对象：

```json
{ "type": "button", "props": { "text": "点我" } }
```

- `type`：这个东西**是什么**，例如 `button`（按钮）、`input`（输入框）、`form`（表单）。
- `props`：这个东西**长什么样、怎么表现**，例如按钮上的文字、输入框的占位提示、下拉框有哪些选项。

节点可以互相嵌套：表单节点把一堆控件节点放进自己的 `props.nodes` 里，就组成了一棵树。框架一共注册了 **42 种** `type`（其中 **19 种**是表单控件），新手先记住下面 8 个就够用了。

> 写节点时有两条硬规则：
> 1. `type` 必须拼对，且必须是框架注册过的类型；
> 2. JSON 必须严格合法——用英文双引号、不能写注释、最后一项后面不能多逗号。

## 2. 8 个常用控件小抄

先在 `config/demos/controls.json` 里找感觉：这个文件就是按分类陈列所有控件的示例配置。下面 8 个控件，每个都给出最小可用的 JSON、长什么样、最常用的几个属性。

### 2.1 button 按钮

```json
{ "type": "button", "props": { "text": "保存", "variant": "primary" } }
```

**长什么样**：一个按钮，`variant: "primary"` 是主色实心按钮；不写 `variant` 就是默认描边按钮。

| 常用属性 | 取值 | 作用 |
| --- | --- | --- |
| `text` | 字符串 | 按钮上的文字 |
| `variant` | `default` / `primary` / `secondary` / `ghost` / `text` / `danger` / `success` / `warning` | 按钮颜色风格 |
| `size` | `sm` / `md` / `lg` | 按钮大小 |
| `disabled` | `true` / `false` | 是否禁用（变灰、点不动） |
| `loading` | `true` / `false` | 是否显示加载转圈 |
| `icon` | 图标名，如 `plus`、`check` | 按钮左侧图标 |

### 2.2 input 单行输入框

```json
{ "type": "input", "props": { "placeholder": "请输入昵称" } }
```

**长什么样**：一行输入框，没输入时显示灰色的提示文字。

| 常用属性 | 取值 | 作用 |
| --- | --- | --- |
| `placeholder` | 字符串 | 空输入时的灰色提示 |
| `value` | 字符串 | 初始内容 |
| `clearable` | `true` / `false` | 有内容时右侧出现清空小按钮 |
| `maxlength` | 数字 | 最多能输入几个字符 |
| `disabled` | `true` / `false` | 禁用（变灰、不能输入） |

### 2.3 textarea 多行输入框

```json
{ "type": "textarea", "props": { "placeholder": "写点备注…", "rows": 3 } }
```

**长什么样**：一块多行文本区域，初始高度由 `rows` 决定。

| 常用属性 | 取值 | 作用 |
| --- | --- | --- |
| `rows` | 数字 | 初始显示几行高 |
| `maxlength` | 数字 | 最多能输入几个字符 |
| `showCount` | `true` / `false` | 是否在角落显示「已输入字数 / 上限」 |
| `autosize` | `true` / `false` | 是否随内容自动变高 |

### 2.4 select 下拉选择

```json
{
  "type": "select",
  "props": {
    "placeholder": "请选择身份",
    "options": [
      { "label": "学生", "value": "student" },
      { "label": "老师", "value": "teacher" }
    ]
  }
}
```

**长什么样**：一个选择框，点一下弹出下拉面板，选中后框里显示选项的 `label`。

| 常用属性 | 取值 | 作用 |
| --- | --- | --- |
| `options` | 数组，每项 `{ label, value }` | 可选项；`label` 给用户看，`value` 是真正存下来的值 |
| `placeholder` | 字符串 | 未选择时的提示 |
| `value` | 选项里的某个 `value` | 默认选中哪一项 |
| `clearable` | `true` / `false` | 是否显示清空按钮 |
| `filterable` | `true` / `false` | 选项很多时，是否支持输入文字筛选 |

> 注意：`options` 不能写成 `["学生", "老师"]` 这种字符串数组，必须是 `{ label, value }` 对象数组。

### 2.5 switch 开关

```json
{ "type": "switch", "props": { "activeText": "接收", "inactiveText": "免打扰" } }
```

**长什么样**：一个小开关，默认是关的；开着时显示 `activeText`，关着时显示 `inactiveText`。

| 常用属性 | 取值 | 作用 |
| --- | --- | --- |
| `value` | `true` / `false` | 初始是开还是关 |
| `activeText` | 字符串 | 打开状态下显示的文字 |
| `inactiveText` | 字符串 | 关闭状态下显示的文字 |
| `disabled` | `true` / `false` | 是否禁用 |

### 2.6 checkbox 复选框

```json
{ "type": "checkbox", "props": { "text": "我已阅读并同意" } }
```

**长什么样**：一个小方框加一行文字，点一下勾选/取消。

| 常用属性 | 取值 | 作用 |
| --- | --- | --- |
| `text` | 字符串 | 方框右边的文字 |
| `checked` | `true` / `false` | 初始是否勾选 |
| `disabled` | `true` / `false` | 是否禁用 |

### 2.7 date 日期选择

```json
{ "type": "date", "props": { "placeholder": "选择日期" } }
```

**长什么样**：带日历图标的输入框，点一下弹出月历，选中的日期显示在框里。

| 常用属性 | 取值 | 作用 |
| --- | --- | --- |
| `placeholder` | 字符串 | 未选择时的提示 |
| `format` | 如 `YYYY-MM-DD` | 显示格式 |
| `min` / `max` | 日期字符串 | 最早 / 最晚能选到哪天 |
| `clearable` | `true` / `false` | 是否显示清空按钮 |

### 2.8 table 表格

```json
{
  "type": "table",
  "props": {
    "columns": [
      { "prop": "name", "label": "名称" },
      { "prop": "score", "label": "稳定度" }
    ],
    "data": [
      { "name": "一之弹", "score": 98 }
    ]
  }
}
```

**长什么样**：一张带表头的表格；列由 `columns` 决定，行由 `data` 决定。

| 常用属性 | 取值 | 作用 |
| --- | --- | --- |
| `columns` | 数组，每项 `{ prop, label }` | 列定义；`prop` 对应 `data` 里的字段名，`label` 是表头文字 |
| `data` | 对象数组 | 每一行数据 |
| `stripe` | `true` / `false` | 是否隔行变色 |

> 想立刻看这 8 个控件长什么样：浏览器打开 <http://127.0.0.1:8080/standalone/controls.html>，那里按分类陈列了全部控件。

## 3. 把表单放进页面

表单也是一个节点，`type` 是 `form`。它和控件的关系是「容器和内容」：控件的节点数组放在表单的 `props.nodes` 里。

我们新建一个页面专门放它。在 `pages/` 文件夹里新建 `card.html`，把下面这段完整页面代码贴进去（结构照抄 `pages/home.html` 的头部，只保留需要的部分）：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <script src="../src/core/theme-boot.js"></script>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>个人资料卡 · 刻刻帝终端 | KurumiUI</title>
  <link rel="stylesheet" href="../src/styles/base.css">
  <link rel="stylesheet" href="../src/styles/controls.css">
  <link rel="stylesheet" href="../src/styles/components.css">
  <link rel="stylesheet" href="../src/styles/tooltip.css">
  <style>
    body { margin: 0; padding: 24px; }
    .card-title { margin: 0 0 16px; font-size: 20px; }
  </style>
</head>
<body>
  <h1 class="card-title">个人资料卡</h1>
  <div id="cardHost"></div>

  <script src="../src/core/kui-all.js" data-kui-profile="standalone"></script>
  <script type="application/json" id="cardConfig">
    {
      "type": "form",
      "props": {
        "layout": { "columns": 2, "gap": 16, "labelWidth": 96 },
        "data": { "nick": "", "role": "student", "notify": true },
        "nodes": [
          {
            "type": "input",
            "id": "nick",
            "label": "昵称",
            "required": true,
            "props": { "placeholder": "请输入昵称", "maxlength": 20 }
          },
          {
            "type": "select",
            "id": "role",
            "label": "身份",
            "options": [
              { "label": "学生", "value": "student" },
              { "label": "老师", "value": "teacher" }
            ]
          },
          {
            "type": "switch",
            "id": "notify",
            "label": "接收通知",
            "props": { "activeText": "接收", "inactiveText": "免打扰" }
          },
          {
            "type": "button",
            "props": { "text": "保存资料", "variant": "primary" }
          }
        ]
      }
    }
  </script>
  <script>
    (function () {
      var node = JSON.parse(document.getElementById('cardConfig').textContent);
      var cardForm = KUI.form.create(document.getElementById('cardHost'), node.props);
      window.cardForm = cardForm;

      document.querySelector('.kui-btn').addEventListener('click', function () {
        var result = cardForm.validate();
        if (result.valid) {
          console.log('校验通过，提交的数据：', cardForm.getData());
        } else {
          console.log('还有没填好的字段：', result.errors);
        }
      });
    })();
  </script>
</body>
</html>
```

**怎么看到它**：保存文件后，浏览器打开 <http://127.0.0.1:8080/pages/card.html>。

**你会看到**：页面上出现一张两列布局的表单：第一行左边是「昵称」输入框（标签旁有红色 `*`，表示必填），右边是「身份」下拉框，默认选中「学生」；第二行是「接收通知」开关，默认是开着的；下面一行是蓝色「保存资料」按钮。

> 如果想让这张卡片出现在主应用的菜单里，照上一章第 3 节的做法，把菜单项的 `url` 改成 `pages/card.html` 即可。

## 4. 逐块看懂这份「个人资料卡」JSON

第 3 节里最外层那个 JSON，其实就是一棵三层的节点树：

1. **最外层 `type: "form"`**：它是一个表单节点，会创建一块表单区域。
2. **`props.layout`**：布局规则。`columns: 2` 表示两列，`gap: 16` 表示字段之间留 16 像素，`labelWidth: 96` 表示左侧标签列宽 96 像素。
3. **`props.data`**：表单的**初始数据**。`{ "nick": "", "role": "student", "notify": true }` 表示：昵称留空、身份默认「学生」、通知开关默认打开。
4. **`props.nodes`**：表单里有哪些字段，一个数组。里面每个节点就是一个控件；控件上的 `id` 就是它在这份数据里的**键名**。

比如昵称节点里的 `"id": "nick"`，就对应 `data` 里的 `"nick"`。所以：

- `data.nick` 的初始值会出现在昵称输入框里；
- 用户改了昵称，`getData()` 里的 `nick` 也会跟着变；
- `label` 是显示在字段左侧的文字；`required: true` 表示这个字段必填。

最后那个按钮没有写 `id`，所以它只是表单里的一个「操作按钮」，不会变成数据字段。

## 5. 取值、改值、校验：3 行控制台代码

打开 `pages/card.html`，按 <kbd>F12</kbd> 打开控制台，依次输入这三行（每行回车一次）：

```js
cardForm.getData()
cardForm.validate()
cardForm.setValue("nick", "狂三")
```

**你会看到**：

```text
{ nick: "", role: "student", notify: true }
{ valid: false, errors: { nick: "该项为必填" }, data: { nick: "", role: "student", notify: true } }
```

第三行输入后回车时没有返回值，但页面上昵称输入框里的内容立刻变成了「狂三」。这时再执行一次 `cardForm.validate()`，就会得到 `{ valid: true, errors: {}, data: { nick: "狂三", … } }`。

这几个方法的含义：

| 方法 | 作用 |
| --- | --- |
| `getData()` | 一次性拿到表单里所有字段的当前值，返回一个对象 |
| `validate()` | 校验整个表单，返回 `{ valid, errors, data }`：`valid` 为 `true` 表示全部通过 |
| `setValue(id, 值)` | 按控件的 `id` 改值，例如 `cardForm.setValue("nick", "狂三")` |
| `reset()` | 把所有字段恢复成 `props.data` 里的初始值，并清掉错误提示 |

想反悔，就在控制台执行 `cardForm.reset()`：昵称会变回空、错误提示也一起消失。

**点按钮会发生什么**：页面脚本已经给「保存资料」按钮绑了点击逻辑——点一下就会执行 `validate()`；校验通过时控制台打印提交的数据，不通过时打印错误信息。

> 想看「提交」的完整写法（onSubmit 回调、表单事件、和弹窗表单配合），见高级手册 [../manual/07-form-engine.md](../manual/07-form-engine.md)。

## 6. 校验入门：必填和更细的规则

最简单的校验是节点上的 `required: true`——昵称为空时点保存，校验不通过，字段下方出现一行红字「该项为必填」，输入框边框也会变红。

想要自定义提示语、限制长度，用 `rules` 数组。把昵称节点改成这样：

```json
{
  "type": "input",
  "id": "nick",
  "label": "昵称",
  "rules": [
    { "required": true, "message": "昵称不能为空" },
    { "min": 2, "max": 20, "message": "昵称要 2 到 20 个字符" }
  ],
  "props": { "placeholder": "请输入昵称" }
}
```

- `required`：必填，空值不通过；
- `min` / `max`：字符串长度下限 / 上限；
- `message`：不通过时显示在字段下方的提示语。

**提示显示在哪里**：就在这个字段自己下方的错误行里（框架加在字段容器里），不会统一弹窗。输入正确后再次点保存或执行 `validate()`，错误会自动消失。

> 校验还有 `pattern`（正则）、`type`（`email` / `number` / `url` / `phone` / `integer`）、`len`（固定长度）、`validator`（自定义函数）等更细的写法，完整规则表见高级手册 [../manual/07-form-engine.md](../manual/07-form-engine.md)。

## 7. 去哪看所有控件和更多例子

`standalone/` 文件夹里有 13 个「单个组件演示页」，每个页面只演示一类东西，非常适合照着抄：

| 演示页 | 演示什么 |
| --- | --- |
| `standalone/controls.html` | 全部控件的陈列馆，按输入/选择/日期/数据等分类 |
| `standalone/form.html` | 表单：联动、校验、提交前确认 |
| `standalone/dialog.html` | 弹窗：alert / confirm / prompt / form / custom |
| `standalone/toast.html` | 四种提示消息 |
| `standalone/menu.html` | 菜单的各种写法 |
| `standalone/menunav.html` | 顶部导航栏 |
| `standalone/tabs.html` | 标签栏 |
| `standalone/theme.html` | 主题切换 |
| `standalone/avatar.html` | 头像 |
| `standalone/boot.html` | 启动屏 |
| `standalone/handlers.html` | 业务函数调用 |
| `standalone/no-shell.html` | 不用外壳、纯手拼页面 |

打开方式：主应用菜单里「独立渲染验证」分组下能点开一部分；也可以直接访问，例如 <http://127.0.0.1:8080/standalone/controls.html>。

## 8. 常见错误与排查

| 现象 | 最可能的原因 | 先做这三步检查 | 修复 |
| --- | --- | --- | --- |
| 控制台报 `KUI is not defined` | 页面没引 `kui-all.js`，或脚本路径/顺序不对 | ① 看页面底部有没有 `<script src="../src/core/kui-all.js" data-kui-profile="standalone">`；② 确认它在自己的页面脚本**之前**；③ 确认 `../src/core/kui-all.js` 真实存在 | 补上 `kui-all.js` 的引用，并放在最后 |
| `JSON.parse` 报错 | 内嵌的 JSON 里有注释、尾逗号、中文引号，或少了括号 | ① 按控制台报错的行号定位；② 检查最后一项后有无多余逗号；③ 把 JSON 复制到在线校验工具或 `node -e` 里验证 | 改成严格 JSON：英文双引号、无注释、无尾逗号 |
| 页面空白，什么都不显示 | `cardHost` 的 `id` 拼错，或表单创建时报错中断了脚本 | ① 看控制台第一条红色报错；② 核对 `id="cardHost"` 与 `getElementById('cardHost')` 一字不差；③ 确认 `card.html` 在 `pages/` 里 | 修正 id 或报错行，刷新 |
| 表单出来了，但输入后 `getData()` 里没有这个字段 | 控件节点没写 `id` | ① 检查那个控件有没有 `"id": "xxx"`；② 看 `getData()` 结果里有没有这个键；③ 确认没有两个控件用同一个 id | 给每个要存值的控件加唯一 `id` |
| 点「保存资料」没反应 | 页面脚本里绑定点击的那段被删了，或按钮选择器没找到元素 | ① 按 F12 看控制台有没有红字；② 确认脚本里 `document.querySelector('.kui-btn')` 那段还在；③ 确认页面上只有一个按钮 | 恢复点击绑定代码，或检查选择器 |
| 下拉框点开是空的 / 选项显示成字符 | `options` 写成了字符串数组 | ① 看 `options` 里是不是 `["学生"]` 这种写法；② 确认每项都有 `label` 和 `value` | 改成 `[{ "label": "学生", "value": "student" }]` 形式 |
| 必填字段没提示 | 校验不是自动触发的，需要点按钮或手动调用 | ① 确认该控件上有 `required: true` 或 `rules`；② 确认点了按钮或执行过 `validate()`；③ 看结果里 `errors` 有没有这个字段 | 在按钮点击里调用 `validate()`，或检查 required 写法 |
| 中文显示成乱码 | 文件保存编码不是 UTF-8 | ① 看 VS Code 右下角编码是不是 UTF-8；② 刷新页面看是否恢复 | 用 VS Code 把文件「通过编码重新打开 / 另存为 UTF-8」 |

## 动手练习

1. **改初始值**：让昵称一开始就填着「狂三」。
   改哪里：`pages/card.html` 里的 `props.data`。
   怎么验证：刷新页面，输入框里直接显示「狂三」；控制台 `cardForm.getData()` 里 `nick` 也是「狂三」。
   提示：改 `"nick": ""` 里的值。

2. **给身份加必填**：不选身份就不让通过校验。
   改哪里：`pages/card.html` 里 select 节点。
   怎么验证：点保存，身份字段下方出现红色提示；选一项后再点，提示消失。
   提示：在 select 节点上加 `"required": true`，需要自定义提示就再加 `rules`。

3. **加一个「个人简介」字段**：在开关后面加一个多行输入框，`id` 叫 `bio`。
   改哪里：`pages/card.html` 里 `props.nodes` 数组。
   怎么验证：页面多出一块多行输入区；点保存后控制台打印的数据里多了 `bio` 键。
   提示：照抄 textarea 的小抄，`label` 写「个人简介」。

4. **换按钮风格**：把「保存资料」改成红色危险按钮，再改成描边默认按钮，观察区别。
   改哪里：`pages/card.html` 里 button 节点的 `variant`。
   怎么验证：刷新后按钮颜色/样式变化。
   提示：试 `danger`、`default`、`ghost`、`text` 四个值。

5. **提交成功提示**：当校验通过时，在页面顶部显示一行「提交成功」。
   改哪里：`pages/card.html` 底部的点击处理函数。
   怎么验证：填好昵称后点保存，页面标题上方出现「提交成功」；昵称为空时点保存不出现。
   提示：在 `if (result.valid) { … }` 分支里，用 `document.createElement('p')` 加一行文字。

## 本章小结

- 界面是节点树：`type` 决定是什么，`props` 决定长什么样；`type` 必须用框架注册过的类型。
- 表单是 `form` 节点，控件节点放进它的 `props.nodes` 里；`props.layout` 管几列和间距。
- `props.data` 是表单的初始数据；控件的 `id` 就是数据里的键名。
- 8 个起步控件：button、input、textarea、select、switch、checkbox、date、table。
- 浏览器控制台常用方法：`getData()` 取值、`validate()` 校验、`setValue(id, 值)` 改值、`reset()` 恢复初始值。
- 校验靠 `required` 与 `rules`；错误提示显示在对应字段下方，改对后自动消失。
- 更多控件和示例：`standalone/controls.html`、`standalone/form.html`；字段细节查高级手册 05 / 07 章。

## 延伸阅读

- 下一章：[07-theme-basics.md](07-theme-basics.md)——用主题配置换配色、改主色。
- 表单引擎全貌（布局、校验规则、联动、实例 API）：[../manual/07-form-engine.md](../manual/07-form-engine.md)。
- 19 个表单控件逐字段说明：[../manual/05-controls-input.md](../manual/05-controls-input.md)。
- 按钮、表格、上传等展示类组件：[../manual/06-controls-display.md](../manual/06-controls-display.md)。

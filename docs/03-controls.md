# KurumiUI 控件库（03 · Controls）

> 维护者：控件库负责人（controls）。所有控件零依赖、无构建、传统 `<script>` 加载，
> 统一通过 `KUI.registry.register(type, { category, defaults, render, api })` 注册，
> 可被 `KUI.mount(type, host, node, ctx)` 单独挂载，也可放进 `KUI.form` 表单联动。
> 颜色/尺寸/圆角/动效一律走 `base.css` 的 `--kui-*` token，控件里不出现硬编码色值。

---

## 0. 交付物与加载顺序

```
src/core/kui.js            ← utils / events / text / icons / h / actions / mount ...
src/core/icons.js          ← sprite（<symbol id="kui-i-<name>">）
src/core/registry.js       ← KUI.registry
src/core/config.js
src/core/theme.js
src/components/controls/index.js      ← 只引这一个；内部按 KUI.controls.files 注入子文件
src/components/form.js                ← 必须在 controls 之后
```

`index.js` 在解析期（`document.readyState === 'loading'`）用 `document.write` 同步注入：

```
control-base.js → inputs.js → selects.js → choices.js → pickers.js → misc.js
```

所以页面里 **不要** 给 `controls/index.js` 加 `defer` / `async`，也不要单独去引子文件。
动态注入场景（`readyState !== 'loading'`）会自动改为串行 `<script>` 加载，完成后自动注册。

```html
<script src="src/core/kui.js"></script>
<script src="src/core/icons.js"></script>
<script src="src/core/registry.js"></script>
<script src="src/core/config.js"></script>
<script src="src/core/theme.js"></script>
<script src="src/components/controls/index.js"></script>
<script src="src/components/form.js"></script>
<script>
  // 等控件注册完成（解析期注入时 index.js 已同步返回，这里只是保险）
  KUI.controls.ready(function () {
    KUI.mount('input', document.getElementById('host'), {
      id: 'name', label: '昵称', props: { value: 'Kurumi', clearable: true }
    });
  });
</script>
```

公开命名空间：

| 名称 | 说明 |
| --- | --- |
| `KUI.controls.base` | 基础工具层（el / merge / getProps / createField / popup 等，见 §9） |
| `KUI.controls.popup` | 统一弹层（下拉 / 多选 / 日期 / 时间 / 颜色共用），见 §5 |
| `KUI.controls.files` | 子脚本清单，一加载即存在（测试会读它） |
| `KUI.controls.init()` | 幂等注册全部控件（`registerAll()` 同义） |
| `KUI.controls.ready(fn)` | 注册完成后执行回调 |
| `KUI.controls.load(done)` | 手动触发子脚本加载（幂等） |

---

## 1. 注册类型清单（共 39 个）

控件库 33 个（本文档覆盖）：

| 文件 | type | category | 说明 |
| --- | --- | --- | --- |
| inputs.js | `button` | action | 按钮（变体 / 尺寸 / loading / 图标） |
| inputs.js | `input` | control | 单行文本 |
| inputs.js | `password` | control | 密码（可见性切换） |
| inputs.js | `textarea` | control | 多行文本（计数器 / 自绘 resize 角标） |
| inputs.js | `number` | control | 数字（精度 / 千分位 / 长按连续加减） |
| selects.js | `select` | control | 单选下拉（可搜索） |
| selects.js | `multiselect` | control | 多选下拉（搜索 + 全选 + 清空 + 标签折叠） |
| choices.js | `checkbox` | control | 单个复选 |
| choices.js | `checkbox-group` | control | 复选组 |
| choices.js | `radio` | control | 单个单选 |
| choices.js | `radio-group` | control | 单选组 |
| choices.js | `switch` | control | 开关 |
| choices.js | `slider` | control | 滑块 |
| choices.js | `progress` | feedback | 进度条 |
| choices.js | `rating` | control | 评分星 |
| choices.js | `color` | control | 颜色选择（预设 + 原生取色器） |
| pickers.js | `date` | control | 日期选择 |
| pickers.js | `daterange` | control | 日期范围（双面板） |
| pickers.js | `month` | control | 月份选择 |
| pickers.js | `time` | control | 时间（时 / 分 / 秒三列滚动） |
| pickers.js | `datetime` | control | 日期 + 时间 |
| misc.js | `tag` | display | 标签 |
| misc.js | `badge` | display | 徽标 / 圆点 |
| misc.js | `divider` | layout | 分隔线 |
| misc.js | `link` | action | 链接 |
| misc.js | `icon` | display | 图标 |
| misc.js | `text` | display | 文本 / 代码片段 |
| misc.js | `alert` | feedback | 行内提示 |
| misc.js | `table` | data | 数据表格 |
| misc.js | `pagination` | data | 分页 |
| misc.js | `upload` | data | 上传（拖拽 + XHR 进度） |
| misc.js | `field` | layout | 字段包装器（label / help / error / 单位） |
| index.js | `form` | layout | 表单容器（`KUI.form.create` 的渲染壳） |

其他队友注册的 6 个组件：`app-shell`、`menu`、`menunav`、`tabs`、`dialog`、`toast`。

---

## 2. 节点（node）通用字段

```json
{
  "id": "email",
  "type": "input",
  "label": "邮箱",
  "required": true,
  "help": "公司邮箱",
  "unit": "@kurumi.dev",
  "rules": [{ "required": true, "message": "请输入邮箱" }],
  "props": { "value": "", "placeholder": "you@kurumi.dev", "clearable": true }
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 字段 id；表单内用于 `getData` / deps / `data-field-id` |
| `type` | string | 注册表中的 type（小写） |
| `props` | object | 控件属性（**值写 `props.value`**） |
| `label` | string | 标签，表单内由 field 包装器渲染（必填时自动加 `*`） |
| `help` / `hint` / `tip` | string | 帮助文案（三者别名） |
| `error` | string | 初始错误文案 |
| `unit` | string | 单位后缀（input 的 `props.unit` 也能达到同样效果） |
| `required` | bool | 是否必填（会影响 label 星号与联动默认态） |
| `rules` | array | 校验规则，见 §7.3 |
| `width` | string | field 宽度（如 `"220px"`、`"100%"`） |
| `span` / `colspan` | number | 表单栅格占几列 |
| `labelWidth` / `labelPosition` | number / string | 单个字段覆盖表单布局（`left/top/right`） |
| `visible` | bool | false 不渲染（表单内由联动控制显隐） |
| `disabled` / `readonly` | bool | 禁用 / 只读 |
| `options` | array | 选项数组（`props.options` 优先） |
| `class` / `style` / `attrs` | - | 透传到控件根元素 |
| `on` | object | 事件 → 动作，见 §2.1 |
| `deps` | array | 联动规则，见 §7 |
| `children` | array | 容器类控件（field / form）的子节点 |

### 2.1 事件与动作

`node.on` 的每个 key 是事件名，value 是动作（由 core `decorate` 绑定，调用 `KUI.actions.run(action, ctx, ev)`）。
控件内部语义事件也会派发同名动作：`change`、`focus`、`blur`、`click`、`action`、`close`、`rowClick`。

```json
{ "type": "button", "text": "保存", "on": { "click": "form.submit" } }
{ "type": "button", "text": "搜索", "on": { "click": { "emit": "demo:search", "detail": { "kw": "kurumi" } } } }
```

支持的写法：字符串动作名、`{ "action": "form.submit", "params": {} }`、`{ "emit": "...", "detail": {} }`、
`{ "actions": [ ... ] }`，以及 `{ "theme": "starry" }`、`{ "tab": "..." }`、`{ "toast": "..." }`、`{ "dialog": "..." }` 语法糖。

---

## 3. 统一 DOM 约定

- 每个控件根节点含 `kui-control kui-control--<type>`；表单内控件外层还有 `.kui-control__box`。
- 状态一律用 class（不是 inline style）：

| class | 含义 |
| --- | --- |
| `is-disabled` / `is-readonly` | 禁用 / 只读 |
| `is-error` | 校验失败（field 根与 `.kui-field__error` 同步） |
| `is-focus` | 聚焦（`:focus-visible` 另有焦点环） |
| `is-open` | 弹层/日历展开 |
| `is-empty` | 空值（占位文案态） |
| `is-active` / `is-checked` / `is-indeterminate` | 选中态（rating / slider / switch / checkbox） |
| `is-loading` | 加载中（button / table / switch / upload） |
| `is-hidden` | 联动隐藏 |
| `is-striped` / `is-animated` / `is-text-inside` | progress 修饰 |
| `is-range-start` / `is-range-end` / `is-in-range` | 日历范围态 |
| `is-today` / `is-weekend` / `is-outside` / `is-disabled` | 日历单元格态 |
| `is-dragover` | upload 拖拽悬停 |
| `is-plain` / `is-round` / `is-closable` / `is-closed` / `is-custom-color` | tag 修饰 |
| `is-banner` | alert 横幅 |
| `is-vertical` / `is-horizontal` / `is-dashed` | divider 修饰 |
| `is-simple` | pagination 极简模式 |
| `is-multiline` / `is-truncate` / `is-weight-<n>` / `is-spin` | text / icon 修饰 |

- 无障碍：可交互控件带 `role` / `aria-expanded` / `aria-checked` / `aria-selected` / `aria-disabled` / `aria-invalid`。

---

## 4. 实例 API：`el.__kuiControl`

每个控件渲染完成后，根元素（表单内为控件盒）都挂：

```js
var el = KUI.mount('number', host, { id: 'age', props: { value: 18 } }, ctx);
var c = el.__kuiControl;   // 或 el.__kuiInstance.control
c.getValue(); c.setValue(20);
```

| 方法 | 说明 |
| --- | --- |
| `getValue()` | 读取当前值（各控件类型见字段表） |
| `setValue(v, opts)` | 写值（`opts.silent === true` 不派发 change） |
| `validate()` | 返回 `{ valid, message, value }` |
| `setDisabled(bool)` / `setReadonly(bool)` | 状态切换（同时更新 `.kui-field`） |
| `setError(msg)` / `clearError()` | 错误态（field 才有的增强方法） |
| `focus()` / `blur()` | 聚焦 / 失焦 |
| `destroy()` | 解绑事件、关闭弹层 |
| `box` / `field` / `getBox()` | 控件盒 / `.kui-field` 包装器 |

此外控件还会派发：

- DOM（控件根元素上的 `CustomEvent`）：`kui-change` / `kui-focus` / `kui-blur` / `kui-action`，
  `detail = { id, value, node, el, control, type, ...extra }`（`extra` 通常含 `reason`）。
- 总线：`ctx.emit('control:change', payload)`，`control:focus` / `control:blur` / `control:action` 同理。
  `KUI.form` 就是订阅 `control:change` 来做联动重算的；独立挂载时也可以直接
  `KUI.bus.on('control:change', fn)`，或在节点上写 `"on": { "change": "动作" }`。

---

## 5. 统一弹层 `KUI.controls.popup`

下拉、多选、日期、时间、颜色全部复用同一个弹层实现（fixed 定位 + 自动翻转 + 点击外部关闭 + Esc）。

```js
var p = KUI.controls.popup.open(anchorEl, panelEl, {
  placement: 'bottom-start',   // bottom-start | bottom-end | top-start | top-end（空间不足自动上下翻转）
  width: 'anchor',             // 'anchor' | 'auto' | 数字(px) | CSS 长度字符串
  matchWidth: true,            // 等价 width:'anchor'，下拉/日期面板默认开
  minWidth: 0,                 // matchWidth 时的最小宽度
  offset: 6,                   // 与 anchor 的间距
  margin: 8,                   // 距视口边缘安全边距
  maxHeight: 'auto',           // 面板最大高度（按剩余空间计算，超出滚动）
  className: 'kui-select-popup',
  closeAnimation: true,        // 关闭时有 140ms 淡出
  ignoreOutside: function (target) { return box.contains(target); }, // 返回 true 表示这次外部点击忽略
  onPlace: function (layer, info) {},  // info = { vertical, horizontal, anchorRect }
  onOpen: function (state) {},         // state = { el, contentEl, anchorEl, opts, placement }
  onClose: function (state) {}
});
p.reposition(); p.setContent(nextEl); p.close();
KUI.controls.popup.closeAll();                 // 关闭全部
KUI.controls.popup.isOpen(anchorEl);           // 该 anchor 是否打开
KUI.controls.popup.top();                      // 栈顶弹层
```

行为要点：

- 同一 anchor 重复 `open` 会先关掉旧弹层；只有最上层弹层响应 Esc。
- `resize` / `scroll`（capture）自动重定位；内容比下方空间高时自动向上翻转。
- z-index 从 `--kui-popup-z`（缺省 3000）开始按栈递增，多层弹层不会互相覆盖。

---

## 6. 控件字段表

> 下面每张表都是 `props` 里的字段（默认值 = 不写时的行为）；值写 `props.value`。
> 所有控件都额外识别 `size: 'sm' | 'md' | 'lg'`（默认 `md`）。

### 6.1 button（action）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `text` | string | `''`（空则 `KUI.text('button.label','按钮')`） | 按钮文案 |
| `variant` | string | `'default'` | `default/primary/secondary/ghost/text/danger/success/warning` |
| `size` | string | `'md'` | `sm/md/lg` |
| `icon` / `iconRight` | string | `''` | 图标名（`KUI.icons` 中的名字） |
| `block` / `round` / `iconOnly` | bool | `false` | 通栏 / 圆角 / 纯图标 |
| `loading` / `disabled` | bool | `false` | 加载（显示 spinner）/ 禁用 |

```json
{ "type": "button", "text": "提交", "props": { "variant": "primary", "icon": "check", "loading": false } }
```

api 额外：`setLoading(bool)`、`setText(text)`。

### 6.2 input / password（control）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | string | `''` | 值 |
| `placeholder` | string | `''` | 占位 |
| `clearable` | bool | `false` | 有值时显示清空按钮 |
| `prefixIcon` / `suffixIcon` | string | `''` | 前后图标 |
| `prefix` / `suffix` | string | `''` | 前后文本 |
| `unit` | string | `''` | 单位后缀 |
| `maxlength` | number | `null` | 最大长度 |
| `showCount` | bool | `false` | 右下角计数 |
| `align` | string | `''` | `left/center/right` |
| `readonly` / `disabled` | bool | `false` | 只读 / 禁用 |
| `autofocus` | bool | `false` | 自动聚焦 |

`password` 额外字段：`toggleable`（默认 true，显示 eye / eye-off 切换）。

```json
{ "type": "input", "id": "user", "label": "用户名", "props": { "placeholder": "字母开头", "clearable": true, "prefixIcon": "user" } }
{ "type": "password", "id": "pwd", "label": "密码", "props": { "placeholder": "至少 8 位", "showCount": true } }
```

### 6.3 textarea（control）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | string | `''` | 值 |
| `rows` / `maxRows` | number | `3` / `8` | 行数 / autosize 上限 |
| `autosize` | bool | `false` | 随内容自动增高 |
| `resize` | string | `'vertical'` | `vertical/none/both`（右下角自绘角标） |
| `maxlength` / `showCount` | - | `null` / `false` | 计数 |
| `readonly` / `disabled` | bool | `false` | 状态 |

```json
{ "type": "textarea", "id": "bio", "label": "简介", "props": { "rows": 4, "maxlength": 200, "showCount": true, "resize": "vertical" } }
```

### 6.4 number（control）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | number | `null` | 值（api 返回 number / null） |
| `min` / `max` | number | `null` | 范围 |
| `step` | number | `1` | 步长；小数位自动推导精度 |
| `precision` | number | `null` | 覆盖精度 |
| `controls` | bool | `true` | 显示上下箭头 |
| `thousands` | bool | `false` | 千分位显示 |
| `unit` | string | `''` | 单位 |
| `align` | string | `'left'` | 对齐 |
| `wheel` | bool | `false` | 聚焦时滚轮调值 |
| `allowOutOfRange` | bool | `false` | 允许越界（默认 clamp） |

上下箭头支持**长按连加**（420ms 后每 90ms 一次，越界或禁用自动停），键盘 `↑/↓`、`PageUp/PageDown`（×10）、`Home/End`。

```json
{ "type": "number", "id": "qty", "label": "数量", "props": { "value": 12, "min": 0, "max": 99, "step": 1, "unit": "件" } }
```

### 6.5 select（control）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `options` | array | `[]` | `[{label,value,disabled,icon,desc}]` 或分组 `[{label,options:[...]}]` |
| `value` | any | `null` | 单值 |
| `placeholder` | string | `''`（空则「请选择」） | 占位 |
| `clearable` | bool | `true` | 清空 |
| `filterable` | bool | `false` | 弹层内搜索 |
| `disabled` / `readonly` | bool | `false` | 状态 |

```json
{ "type": "select", "id": "role", "label": "角色", "options": [
  { "label": "管理员", "value": "admin" },
  { "label": "访客", "value": "guest", "disabled": true }
], "props": { "value": "admin", "filterable": true } }
```

api 额外：`setOptions(list)`、`open()`、`close()`、`getSelectedOption()`。

### 6.6 multiselect（control）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `options` | array | `[]` | 同 select |
| `value` | array | `[]` | 多值 |
| `placeholder` | string | `''` | 占位 |
| `clearable` | bool | `true` | 清空 |
| `filterable` | bool | `true` | 搜索 |
| `maxTagCount` | number | `3` | 最多显示几个标签 |
| `collapseTags` | bool | `true` | 超出折叠为 `+N`，hover 显示全部 |
| `showCheckAll` | bool | `true` | 弹层底部「全选 / 清空」 |
| `searchPlaceholder` | string | `''` | 搜索占位 |
| `disabled` / `readonly` | bool | `false` | 状态 |

```json
{ "type": "multiselect", "id": "tags", "label": "标签", "options": [
  { "label": "前端", "value": "fe" }, { "label": "后端", "value": "be" }, { "label": "设计", "value": "ui" }
], "props": { "value": ["fe"], "maxTagCount": 2, "filterable": true } }
```

api 额外：`setOptions(list)`、`getSelectedOptions()`、`open()`、`close()`。

### 6.7 checkbox / radio（control）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `checked` | bool | `false` | 初始勾选 |
| `text` | string | `''` | 标签文案 |
| `trueValue` / `falseValue` | any | `undefined` | 值映射（配合 `props.value`） |
| `indeterminate` | bool | `false` | 半选（仅 checkbox） |
| `name` | string | `''` | 原生 name（仅 radio） |
| `disabled` / `readonly` | bool | `false` | 状态 |

```json
{ "type": "checkbox", "id": "agree", "props": { "text": "我已阅读并同意条款", "checked": true } }
{ "type": "radio", "id": "sex", "props": { "text": "保密", "name": "sex", "trueValue": "secret" } }
```

### 6.8 checkbox-group / radio-group（control）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `options` | array | `[]` | `[{label,value,disabled}]` |
| `value` | array / any | `[]` / `null` | 复选组是数组，单选组是单值 |
| `inline` | bool | `false` | 横向排列 |
| `name` | string | `''` | name 前缀（radio-group） |
| `disabled` / `readonly` | bool | `false` | 状态 |

```json
{ "type": "checkbox-group", "id": "skills", "label": "技能", "options": [
  { "label": "JS", "value": "js" }, { "label": "CSS", "value": "css" }
], "props": { "value": ["js"], "inline": true } }
{ "type": "radio-group", "id": "level", "label": "等级", "options": [
  { "label": "普通", "value": 1 }, { "label": "高级", "value": 2 }
], "props": { "value": 1 } }
```

### 6.9 switch（control）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | any | `false` | 当前值 |
| `activeText` / `inactiveText` | string | `''` | 两侧文案 |
| `activeValue` / `inactiveValue` | any | `undefined` | 值映射 |
| `loading` | bool | `false` | 加载中 |
| `disabled` / `readonly` | bool | `false` | 状态 |

```json
{ "type": "switch", "id": "notify", "label": "开启通知", "props": { "activeText": "开", "inactiveText": "关", "value": true } }
```

### 6.10 slider（control）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | number | `0` | 值 |
| `min` / `max` / `step` | number | `0/100/1` | 范围与步长 |
| `showValue` | bool | `true` | 右侧数值 |
| `tooltip` | bool | `true` | 拖动气泡 |
| `unit` | string | `''` | 单位 |
| `disabled` / `readonly` | bool | `false` | 状态 |

```json
{ "type": "slider", "id": "opacity", "label": "不透明度", "props": { "value": 60, "min": 0, "max": 100, "unit": "%" } }
```

api 额外：`setRange({ min, max, step })`。

### 6.11 progress（feedback）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | number | `0` | 百分比（0–100） |
| `status` | string | `''` | `success/warning/danger`（空 = accent） |
| `striped` / `animated` | bool | `false` | 条纹 / 动画 |
| `showText` | bool | `true` | 显示文本 |
| `textInside` | bool | `false` | 文本在条内 |

```json
{ "type": "progress", "props": { "value": 72, "striped": true, "animated": true } }
```

### 6.12 rating（control）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | number | `0` | 分值 |
| `count` | number | `5` | 星星总数 |
| `allowHalf` | bool | `false` | 半星 |
| `allowClear` | bool | `true` | 再点清零 |
| `showText` | bool | `false` | 右侧文案 |
| `texts` | array | `[]` | 每档文案 |
| `disabled` / `readonly` | bool | `false` | 状态 |

```json
{ "type": "rating", "id": "score", "label": "评分", "props": { "value": 3.5, "allowHalf": true, "showText": true, "texts": ["很差", "较差", "一般", "不错", "很好"] } }
```

### 6.13 color（control）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | string | `''` | 颜色（`#hex` / `var(--kui-*)` / token 名） |
| `presets` | array | 11 个 token 名 | 预设色板（token 名或色值） |
| `clearable` | bool | `true` | 清除按钮 |
| `disabled` / `readonly` | bool | `false` | 状态 |

```json
{ "type": "color", "id": "accentColor", "label": "主题色", "props": { "value": "accent" } }
```

### 6.14 date / daterange / month / time / datetime（control）

公共字段：

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | string/array | `''` / `[]` | 见下方格式 |
| `format` | string | 见下 | 显示/取值格式（`YYYY MM DD HH mm ss`） |
| `placeholder` | string | `''` | 占位（空则用字典默认） |
| `clearable` | bool | `true` | 清除 |
| `min` / `max` | string | `''` | 可选取值边界 |
| `weekStart` | number | `1` | 周起始（0=周日，1=周一） |
| `showToday` | bool | `true` | footer「今天」 |
| `disabled` / `readonly` | bool | `false` | 状态 |
| `size` | string | `'md'` | `sm/md/lg` |

各控件差异：

| type | value 格式 | format 默认 | 面板 |
| --- | --- | --- | --- |
| `date` | `'YYYY-MM-DD'` | `'YYYY-MM-DD'` | 单月日历 |
| `daterange` | `['YYYY-MM-DD','YYYY-MM-DD']` | `'YYYY-MM-DD'` | 双月日历（左右联动） |
| `month` | `'YYYY-MM'` | `'YYYY-MM'` | 12 月网格 |
| `time` | `'HH:mm:ss'` | `'HH:mm:ss'`（`showSeconds:false` 时 `'HH:mm'`） | 时/分/秒三列 |
| `datetime` | `'YYYY-MM-DD HH:mm:ss'` | `'YYYY-MM-DD HH:mm:ss'` | 日历 + 三列时间 |

`time` / `datetime` 额外：`showSeconds`(true)、`hourStep`/`minuteStep`/`secondStep`(1)。

`daterange` 额外（触发器三段文案的别名，均为空时走字典默认）：

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `startPlaceholder` | string | `''` | 未选开始时的占位（字典 `daterange.start`「开始日期」） |
| `endPlaceholder` | string | `''` | 未选结束时的占位（字典 `daterange.end`「结束日期」） |
| `separator` | string | `''` | 起止之间分隔符（字典 `daterange.sep`「至」） |

```json
{ "type": "date", "id": "birthday", "label": "生日", "props": { "value": "2001-06-10", "clearable": true } }
{ "type": "daterange", "id": "period", "label": "统计区间", "props": { "value": ["2026-01-01", "2026-01-31"] } }
{ "type": "daterange", "id": "period2", "label": "统计区间", "props": { "startPlaceholder": "开始日期", "endPlaceholder": "结束日期", "separator": "→" } }
{ "type": "month", "id": "month", "label": "月份", "props": { "value": "2026-10" } }
{ "type": "time", "id": "alarm", "label": "提醒", "props": { "value": "08:30:00" } }
{ "type": "datetime", "id": "startAt", "label": "开始时间", "props": { "value": "2026-10-25 20:00:00", "showSeconds": false } }
```

### 6.15 tag / badge（display）

| tag 字段 | 默认 | badge 字段 | 默认 |
| --- | --- | --- | --- |
| `text` | `''` | `text` | `''` |
| `type` | `'default'` | `type` | `'danger'` |
| `size` | `'md'` | `size` | `'md'` |
| `closable` | `false` | `count` | `0` |
| `round` / `plain` | `false` | `max` | `99` |
| `icon` | `''` | `dot` | `false` |
| `color` | `''`（token 名或色值） | `showZero` | `false` |

```json
{ "type": "tag", "props": { "text": "推荐", "type": "primary", "round": true, "closable": true } }
{ "type": "badge", "props": { "count": 120, "max": 99 } }
{ "type": "badge", "props": { "dot": true } }
```

### 6.16 divider / link / icon / text（display / action）

| divider | 默认 | 说明 |
| --- | --- | --- |
| `orientation` | `'horizontal'` | `horizontal/vertical` |
| `text` | `''` | 中间文字 |
| `textPosition` | `'center'` | `left/center/right` |
| `dashed` / `plain` | `false` | 虚线 / 细线 |

| link | 默认 | 说明 |
| --- | --- | --- |
| `text` | `''` | 文案 |
| `href` / `target` | `''` | 链接；`_blank` 自动补 `rel` |
| `type` | `'default'` | `default/primary/success/warning/danger/info/muted` |
| `underline` / `disabled` | `false` | 下划线 / 禁用 |
| `icon` / `iconPosition` | `''` / `'right'` | 图标位置 |

| icon | 默认 | 说明 |
| --- | --- | --- |
| `name` | `''` | sprite 图标名 |
| `size` | `'md'` | `sm/md/lg` 或 CSS 尺寸 |
| `color` | `''` | token 名或色值 |
| `rotate` | `0` | 旋转角度 |
| `spin` | `false` | 旋转动画 |

| text | 默认 | 说明 |
| --- | --- | --- |
| `text` | `''` | 内容 |
| `type` | `'default'` | `default/primary/success/warning/danger/info/secondary/muted` |
| `size` | `'md'` | `xs/sm/md/lg/xl/2xl` |
| `weight` | `''` | 字重 |
| `align` | `''` | 对齐 |
| `truncate` / `lines` | `false` / `0` | 单行省略 / 多行截断 |
| `block` / `tag` / `code` | `false` / `''` / `false` | 块级 / 自定义标签 / 代码样式 |

```json
{ "type": "divider", "props": { "text": "基础信息", "textPosition": "left" } }
{ "type": "link", "props": { "text": "查看文档", "href": "docs/00-contract.md", "icon": "external", "type": "primary" } }
{ "type": "icon", "props": { "name": "star", "color": "accent", "size": "lg" } }
{ "type": "text", "props": { "text": "暗夜玻璃拟态", "type": "secondary", "size": "sm" } }
```

### 6.17 alert（feedback）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `type` | string | `'info'` | `info/success/warning/danger` |
| `title` / `text` | string | `''` | 标题 / 描述 |
| `closable` | bool | `true` | 关闭按钮 |
| `showIcon` | bool | `true` | 类型图标 |
| `banner` | bool | `false` | 横幅模式 |

```json
{ "type": "alert", "props": { "type": "warning", "title": "注意", "text": "该操作不可撤销", "closable": true } }
```

### 6.18 table（data）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `columns` | array | `[]` | `[{key,title,width,align,formatter,render}]` |
| `data` / `rows` | array | `[]` | 行数据 |
| `bordered` / `striped` / `hoverable` | bool | `false/true/true` | 样式 |
| `loading` / `emptyText` | bool/string | `false`/`''` | 加载 / 空文案 |
| `showHeader` | bool | `true` | 表头 |
| `rowKey` | string | `'id'` | 行主键 |
| `maxHeight` | number | `0` | 滚动高度 |

`column.formatter(value, row, index)` 返回字符串；`column.render(value, row, index)` 返回 DOM/字符串。

```json
{ "type": "table", "props": {
  "columns": [{ "key": "name", "title": "名称" }, { "key": "size", "title": "大小", "align": "right" }],
  "data": [{ "id": 1, "name": "kurumi", "size": 12 }, { "id": 2, "name": "starry", "size": 9 }]
} }
```

api 额外：`setData(rows)`、`getData()`、`setColumns(cols)`、`setLoading(bool)`。

### 6.19 pagination（data）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `page` / `pageSize` / `total` | number | `1/10/0` | 分页状态 |
| `pageSizes` | array | `[10,20,50,100]` | 每页条数选项 |
| `simple` | bool | `false` | 极简模式 |
| `showTotal` / `showJumper` / `showSizer` | bool | `true/false/false` | 显示区 |
| `maxButtons` | number | `7` | 中间页码数量 |
| `prevText` / `nextText` | string | `''` | 自定义上一页/下一页文案 |

change 事件的载荷 `value = { page, pageSize, total }`（另有 `reason`）。

```json
{ "type": "pagination", "props": { "page": 2, "pageSize": 10, "total": 128, "showJumper": true, "showSizer": true } }
```

### 6.20 upload（data）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `accept` | string | `''` | 接受类型（`image/*,.pdf`） |
| `multiple` | bool | `false` | 多选 |
| `maxCount` / `maxSize` | number | `0/0` | 数量 / 单文件字节上限（0 不限） |
| `drag` | bool | `true` | 拖拽区 |
| `showTip` / `tip` | bool/string | `true/''` | 提示 |
| `action` / `method` / `name` | - | `''/'POST'/'file'` | 上传地址 / 方法 / 字段名 |
| `headers` / `data` | object | `{}` | 请求头 / 附加字段 |
| `autoUpload` | bool | `true` | 选择后立即上传 |
| `withCredentials` | bool | `false` | 携带 cookie |
| `triggerText` | string | `''` | 自定义触发文案 |
| `disabled` | bool | `false` | 禁用 |

值为元数据数组：`[{ uid, name, size, type, status, percent, url }]`，`status = ready/uploading/success/error`。
api 额外：`getFiles()`、`clear()`、`submit()`。

```json
{ "type": "upload", "id": "avatar", "label": "头像", "props": { "accept": "image/*", "maxSize": 2097152, "action": "/api/upload" } }
```

### 6.21 field（layout）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `label` / `help` / `error` / `unit` | string | `''` | 标签 / 帮助 / 错误 / 单位 |
| `required` | bool | `false` | 必填星号 |
| `width` | string | `null` | 字段宽度 |
| `span` | number | `null` | 栅格占列 |
| `labelWidth` / `labelPosition` | - | `null/''` | 局部布局覆盖 |
| `children` | array | `[]` | 子控件（也接受 `fields` / `props.children`） |

field 的 `getValue()` 返回按子控件 id 收集的对象，`validate()` 汇总子控件错误。

```json
{ "type": "field", "id": "profile", "label": "个人资料", "children": [
  { "type": "input", "id": "nick", "label": "昵称", "required": true },
  { "type": "date", "id": "birth", "label": "生日" }
] }
```

### 6.22 form（layout）

表单壳，内部调用 `KUI.form.create`。属性：

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `children` / `fields` | array | `[]` | 字段节点 |
| `data` | object | `{}` | 初始数据 |
| `layout` | object | `{}` | `{ columns, gap, labelWidth, labelPosition, labelAlign, submitAlign }` |
| `showSubmit` / `showReset` | bool | `false` | 底部按钮 |
| `submitText` / `resetText` | string | `''` | 按钮文案 |
| `validateOn` | string | `'submit'` | `submit/change/blur` |
| `bordered` | bool | `false` | 边框 |

```json
{ "type": "form", "props": {
  "layout": { "columns": 2, "labelWidth": 96, "labelPosition": "top" },
  "showSubmit": true,
  "children": [
    { "type": "input", "id": "name", "label": "姓名", "required": true },
    { "type": "select", "id": "role", "label": "角色", "options": [{ "label": "管理员", "value": "admin" }] }
  ]
} }
```

---

## 7. 表单与联动 `KUI.form`

### 7.1 创建

```js
var form = KUI.form.create(document.getElementById('form-host'), {
  nodes: [ /* 字段节点数组，等价于 fields */ ],
  data: { name: 'Kurumi' },
  layout: { columns: 2, gap: 16, labelWidth: 96, labelPosition: 'left', submitAlign: 'right' },
  validateOn: 'change',          // 'submit' | 'change' | 'blur'
  text: { 'form.submit': '保存' }, // 覆盖文案字典
  showSubmit: true, submitText: '保存', resetText: '重填',
  onChange: function (data, field) {},
  onSubmit: function (data) {},
  onInvalid: function (errors) {},
  onReady: function (instance) {}
});
```

### 7.2 实例 API

| 方法 | 说明 |
| --- | --- |
| `el` | 表单根元素 |
| `getData()` / `setData(obj, opts)` | 全量数据（拷贝） |
| `getValue(id)` / `setValue(id, v, opts)` | 单字段；`opts.silent` 不派发 change |
| `getField(id)` | `{ id, el, item, field, control, node, rendered, isVisible }` |
| `getFields()` | 全部字段 |
| `validate(ids?)` | `{ valid, errors, data }`，跳过不可见字段，聚焦首个错误 |
| `validateField(id)` | 单字段校验 |
| `clearValidate(ids?)` | 清错误 |
| `reset()` | 回到初始数据并清错误 |
| `submit()` | 校验 → `onSubmit` / `onInvalid`，并 `KUI.bus.emit('form:submit')` |
| `setVisible / setDisabled / setReadonly / setRequired (id, v)` | 手动状态 |
| `setOptions(id, options)` / `setLabelText(id, text)` | 动态选项 / 文案 |
| `setError(id, msg)` / `clearError(id)` | 错误态 |
| `getLinkageGraph()` | 联动关系快照（调试用） |
| `subscribe(fn)` | 订阅数据变化，返回取消函数 |
| `destroy()` | 销毁表单（解绑总线、销毁控件） |

### 7.3 校验规则

```json
{ "rules": [
  { "required": true, "message": "请输入邮箱" },
  { "type": "email", "message": "邮箱格式不正确" },
  { "min": 6, "max": 20, "message": "长度 6–20" },
  { "pattern": "^[a-z]+$", "message": "仅小写字母" },
  { "validator": "function (value, data) { return value === 'kurumi' || '必须是 kurumi'; }" }
] }
```

> `validator` 在 JS 里直接写函数（JSON 场景请用 `type`/`pattern`/`min`/`max`/`len`）。

### 7.4 联动 `node.deps`

```json
{
  "type": "select", "id": "type", "label": "类型",
  "options": [{ "label": "个人", "value": "person" }, { "label": "公司", "value": "company" }]
},
{
  "type": "input", "id": "companyName", "label": "公司名称",
  "deps": [
    { "when": { "field": "type", "op": "eq", "value": "company" }, "then": { "visible": true, "required": true } }
  ]
}
```

**求值顺序**（每次任意字段变化都会重算全部字段）：

1. **先恢复默认态**：`visible/disabled/readonly/required/options/text/error` 回到节点声明值（`rules.required` 也算 required 默认值）；
2. 按 `deps` **声明顺序**依次判断 `when`，命中的规则把 `then` 的值叠加进「本字段最终态」；
3. 再按固定顺序应用：`visible → disabled → readonly → required → value → options → text → error`。

因此规则之间不会残留上一次的副作用；后命中的规则覆盖先命中的规则。
`then.value` 只在命中时写入（`silent` 方式，不触发 change 回环），`then.options` 只在内容变化时重建。

#### `when` 结构

| 写法 | 说明 |
| --- | --- |
| `{ "field": "a", "value": 1 }` | 单条件，`op` 缺省 `eq` |
| `{ "field": "a", "op": "in", "value": [1,2] }` | 单条件 + 操作符 |
| `{ "all": [cond, cond] }` | 全部成立 |
| `{ "any": [cond, cond] }` | 任一成立 |
| `{ "field": "a", "op": "empty" }` | 无 `value` 的操作符 |

操作符（`op`）：

| op | 说明 | 示例 value |
| --- | --- | --- |
| `eq` / `ne` | 等于 / 不等于（宽松比较，`1` 与 `"1"` 相等） | `1` |
| `in` / `nin` | 值在 / 不在数组内 | `[1,2]` |
| `contains` / `notContains` | 数组/字符串包含 | `"a"` |
| `gt` / `gte` / `lt` / `lte` | 数值比较 | `10` |
| `empty` / `notEmpty` | 空 / 非空（`''`、`null`、`[]`、`{}` 视为空） | 无 |
| `truthy` / `falsy` | 真值 / 假值 | 无 |
| `regex` / `match` / `notMatch` | 正则匹配（value 可为字符串或 `RegExp`） | `"^a"` |

#### `then` 可用字段

| 字段 | 说明 |
| --- | --- |
| `visible` | 显隐（同时写 `hidden` / `is-hidden` / `aria-hidden`） |
| `disabled` / `readonly` / `required` | 状态 |
| `value` | 写入值（silent） |
| `options` | 替换选项（内容不变不重建） |
| `text` | 覆盖 label 文案 |
| `error` | 直接显示错误 |

#### ⚠ 默认隐藏规则（契约 §7 补充）

字段 **没有显式写 `visible`**，但它有 `deps` 且**任意一条规则含 `then.visible`** 时，该字段的
默认可见性是 **`false`**（先隐藏，等待规则命中后再显示）。

```json
{ "type": "input", "id": "mail", "label": "邮箱",
  "deps": [{ "when": { "field": "notify", "value": true }, "then": { "visible": true } }] }
```

- 上例中 `notify` 为 `true` 前，`mail` 不显示，不需要额外写 `visible:false`。
- 如果字段本来就应该一直显示、只是某条件下隐藏，请显式写 `"visible": true`。
- 没有任何 `then.visible` 的字段仍遵循契约默认 `visible: true`。

#### 联动示例：级联选项 + 动态必填 + 值重置

```json
{
  "type": "form",
  "props": {
    "layout": { "columns": 2 },
    "children": [
      { "type": "radio-group", "id": "kind", "label": "客户类型",
        "options": [{ "label": "个人", "value": "person" }, { "label": "企业", "value": "company" }],
        "props": { "value": "person" } },
      { "type": "select", "id": "cert", "label": "证件类型",
        "options": [{ "label": "身份证", "value": "id" }],
        "deps": [
          { "when": { "field": "kind", "op": "eq", "value": "company" },
            "then": { "options": [{ "label": "营业执照", "value": "biz" }], "value": "biz", "required": true } },
          { "when": { "field": "kind", "op": "eq", "value": "person" },
            "then": { "options": [{ "label": "身份证", "value": "id" }], "value": "id" } }
        ] },
      { "type": "input", "id": "bizCode", "label": "统一社会信用代码",
        "deps": [{ "when": { "all": [
          { "field": "kind", "value": "company" },
          { "field": "cert", "op": "notEmpty" }
        ] }, "then": { "visible": true, "required": true } }] },
      { "type": "alert", "id": "tip", "type": "info",
        "props": { "text": "企业客户需要补充凭证信息" },
        "deps": [{ "when": { "field": "kind", "value": "company" }, "then": { "visible": true } }] }
    ]
  }
}
```

---

## 8. 用户点名的「易忽略细节」清单（CSS 已实现，改样式时别破坏）

| 位置 | 细节 |
| --- | --- |
| number 加减箭头 | 与按钮同材质（同边框/底色/圆角），hover 转 accent、active 转 accent-soft、disabled 置灰；可长按连续加减；上下箭头用同一个 chevron symbol |
| input 清空按钮 | 只在 hover/focus 且有值时显示；`is-empty` 时隐藏 |
| select 下拉箭头 | `is-open` 时 180° 翻转并转 accent；禁用时置灰 |
| select 弹层 | 选项 hover=`--kui-option-hover-bg`，选中=`--kui-option-selected-bg/text` + 对勾；分组标题、空态、footer 全选/清空 |
| multiselect 弹层 | 标签用 `.kui-tag` 收窄版，超出 `maxTagCount` 显示 `+N`；面板底部全选/清空；Backspace 删除最后一项 |
| textarea resize 角标 | 自绘 `.kui-textarea__resize`（两层 L 形 currentColor 描边），与边框同色系；`resize:none` 时隐藏 |
| datepicker | 表头年月 + 双箭头（年/月），星期中文化，今天（金色 + 下圆点）、禁用（划线）、范围（`is-in-range` 无圆角连成一条） |
| daterange | 双面板中间用 `--kui-divider` 分隔；hover 预览只重算 class（paint）不重建 DOM，真实浏览器里点击不会因节点被替换而丢失 |
| timepicker | 时/分/秒三列滚动 + 每列内部上下箭头（与 number 箭头同一套材质与尺寸）；选中项 accent-soft + glow |
| 实心填充前景 | 所有实心语义底色（实心按钮 primary/danger/success/warning、日历/月份选中与范围起止、picker footer 主按钮、pagination 当前页、badge 各类型）前景必须用 `var(--kui-on-accent|on-danger|on-success|on-warning, var(--kui-text-inverse))`（共 26 处），**不要**配 `--kui-text-1`，否则浅主色主题会文字与背景同色 |
| 滚动条 | webkit（thumb/track/corner）+ firefox（`scrollbar-width/color`）统一；作用于弹层、选项列表、时间列、表格、textarea、上传列表、表单 |
| slider | 轨道 6px、fill 渐变 + glow、thumb hover/active 放大、tooltip 气泡 |
| switch | thumb 位移 + 弹跳曲线；sm/lg 尺寸 |
| checkbox/radio | 纯 CSS 自绘，tick 缩放弹入；支持 indeterminate |
| upload | 拖拽区 `is-dragover` 高亮 + dashed 描边 |
| rating | 星填充金色 + drop-shadow，half 半透明 |
| pagination | 当前页 accent 实心、省略号 more 图标、sizer/jumper/simple |
| table | sticky 表头、斑马线、hover 行高亮、空态、loading 遮罩 |
| progress | 条纹 + 动画、文本内置（`is-text-inside`） |
| 全部控件 | `is-*` 状态类齐全、`:focus-visible` 焦点环 `--kui-focus-ring`、`prefers-reduced-motion` 降级、打印样式 |

---

## 9. 基础工具层 `KUI.controls.base`（二次开发常用）

| 工具 | 说明 |
| --- | --- |
| `el(tag, attrs, children)` | 创建元素（`attrs.text` 写 textContent、`class`、`on`、`dataset`） |
| `frag(children)` / `clear(el)` / `remove(el)` | 片段 / 清空 / 移除 |
| `addClass / removeClass / toggleClass / hasClass` | class 工具 |
| `attr(el, k, v)` / `setAria(el, map)` | 属性 / aria |
| `on(target, type, fn, opts)` / `once` | 事件（opts 直传 addEventListener） |
| `iconEl(name, cls)` / `iconHtml(name)` | 优先走 `KUI.icons.create/get`（自动注入 sprite，`<use href="#kui-icon-name">`）；仅 core/icons 缺失时降级为同 symbol 命名的内联 `<use>` |
| `getProps(node)` / `merge({}, defaults, props)` | 取 props / 浅合并 |
| `normOptions(list)` / `flattenOptions(list)` / `isGroupOptions(list)` | 选项归一化 |
| `formatNumber(v, opts)` / `parseNumber(v)` | 数字格式化 / 解析 |
| `formatBytes(n)` | 文件大小 |
| `formatDate(date, fmt)` / `toDate(v)` / `parseDate(v)` | 日期 |
| `formatBytes` / `repeatPress` | 同上 / 长按连发 |
| `emitChange(el, ctx, node, value, reason)` | 派发控制台/DOM 事件 |
| `dispatchAction(action, ctx, ev)` | 调 `KUI.actions.run` |
| `makeApi(el, node, ctx, impl)` | 生成标准 `__kuiControl` |
| `createField(node, ctx, opts)` | 生成 `.kui-field` 包装器 |
| `finalize(node, ctx, type, box, impl, opts)` | 表单内返回控件盒；独立渲染且带 label 等元信息时自动包 field |
| `openPopup(anchor, content, opts)` | 等价 `KUI.controls.popup.open` |
| `token(name)` / `themeColor(name)` / `cssVar(name)` | token 引用 / 计算色值 |

---

## 10. 第三方控件接入

新增控件只要满足「render 返回 DOM + 注册 descriptor + 挂 `__kuiControl`」即可被表单与 mount 使用：

```js
(function () {
  var KUI = window.KUI;
  var base = KUI.controls.base;

  var DEFAULTS = { value: 0, step: 1, min: 0, max: 100, size: 'md', disabled: false };

  KUI.registry.register('stepper', {
    category: 'control',
    defaults: DEFAULTS,
    render: function (node, ctx) {
      var props = base.merge({}, DEFAULTS, base.getProps(node));
      var state = { value: Number(props.value) || 0 };

      var box = base.el('div', { 'class': 'kui-stepper' });
      base.addClass(box, 'kui-btn');                       // 复用按钮材质（可选）

      var minus = base.el('button', { type: 'button', 'class': 'kui-stepper__btn', text: '−' });
      var text = base.el('span', { 'class': 'kui-stepper__value' });
      var plus = base.el('button', { type: 'button', 'class': 'kui-stepper__btn', text: '+' });

      function setValue(v, reason) {
        v = base.clamp(Number(v) || 0, props.min, props.max);
        state.value = v;
        text.textContent = String(v);
        base.emitChange(box, ctx, node, v, { reason: reason || 'input' });
      }
      base.on(minus, 'click', function () { setValue(state.value - props.step); });
      base.on(plus, 'click', function () { setValue(state.value + props.step); });

      text.textContent = String(state.value);
      box.appendChild(minus); box.appendChild(text); box.appendChild(plus);

      var impl = {
        getValue: function () { return state.value; },
        setValue: function (v, opts) { state.value = base.clamp(Number(v) || 0, props.min, props.max); text.textContent = String(state.value); if (!(opts && opts.silent)) { base.emitChange(box, ctx, node, state.value, { reason: 'set' }); } },
        validate: function () { return { valid: true, value: state.value }; },
        setDisabled: function (v) { base.toggleClass(box, 'is-disabled', !!v); minus.disabled = !!v; plus.disabled = !!v; },
        setReadonly: function (v) { base.toggleClass(box, 'is-readonly', !!v); },
        focus: function () { plus.focus(); },
        destroy: function () { base.runDestroyers(box); }
      };
      // finalize 会：加 kui-control/kui-control--stepper、必要时套 .kui-field、生成并挂 __kuiControl
      var out = base.finalize(node, ctx, 'stepper', box, impl, { label: props.label });
      return out;
    },
    api: function (el) { return el.__kuiControl; }
  });
})();
```

要点：

1. `base.finalize` 负责根 class、字段包装、`__kuiControl`、`setDisabled/setReadonly` 与 field 联动，**推荐走它**；
2. 变化一律用 `base.emitChange(el, ctx, node, value, reason)`，表单联动/`on.change` 才能收到；
3. 需要弹层就用 `base.openPopup(anchor, content, { matchWidth: true })`，会自动处理翻转/外部点击/Esc；
4. 样式放 `src/styles/controls.css` 或自己的 css，只使用 `var(--kui-*)` token，状态用 `is-*` class；
5. 注册时机：必须在 `KUI.registry` 就绪后、渲染前；控件库场景可放进 `KUI.controls.ready()`。

---

## 11. 自测命令

```bash
# 语法（Node 13.14，禁止可选链/空值合并等新语法）
.tools/node-v13.14.0-win-x64/node.exe --check src/components/controls/control-base.js
.tools/node-v13.14.0-win-x64/node.exe --check src/components/controls/inputs.js
.tools/node-v13.14.0-win-x64/node.exe --check src/components/controls/selects.js
.tools/node-v13.14.0-win-x64/node.exe --check src/components/controls/choices.js
.tools/node-v13.14.0-win-x64/node.exe --check src/components/controls/pickers.js
.tools/node-v13.14.0-win-x64/node.exe --check src/components/controls/misc.js
.tools/node-v13.14.0-win-x64/node.exe --check src/components/controls/index.js
.tools/node-v13.14.0-win-x64/node.exe --check src/components/form.js

# 集成冒烟：控件注册表 / form 联动 / 启动与 console.error
node tools/smoke.js

# 静态资源引用（HTML 里引用的 js/css 是否存在）
node tools/check-assets.js
```

当前结果：语法检查全部通过；`tools/smoke.js` **28 通过 / 0 失败**（其中控件注册表 39 个类型、
form.create 联动正常、console.error 为 0）；`test/run.js` 在 Node 13.14 与当前 Node 下均 **30 通过 / 0 失败**。

---

## 12. 已知边界与遗留项

- 弹层使用 `position: fixed`，在 iframe（如 app-shell 的页面容器）内会被限制在 iframe 视口内，不会越出到主框架；需要在主框架层弹层请用 `KUI.dialog` / `KUI.toast`。
- `upload` 仅做单次 XHR 上传（带进度），不含分片、断点续传、重试；服务端字段名可用 `props.name` 配置。
- `daterange` 只处理日期；需要「日期 + 时间」的组合请用 `datetime` 或自行组合两个控件。
- 控件样式依赖 `src/styles/base.css` 的 `--kui-*` token；表单运行时会内联写 `--kui-form-columns / --kui-form-gap / --kui-field-label-width` 三个局部变量。
- `docs` 中的示例值（如 `/api/upload`）仅为占位，实际地址由业务传入。

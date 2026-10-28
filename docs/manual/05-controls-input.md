# 05 · 表单控件：19 个 control 类型

> 适用版本：KurumiUI v1.3.9 ｜ 前置章节：[04-config-app.md](04-config-app.md) ｜ 阅读时长：约 25 分钟

`KUI.registry.list()` 里 `category==='control'` 共 **19** 个。本章逐控件给：作用、最小 JSON、字段表、通用默认、事件/API、坑、表单内写法；默认值取自源码 `*_DEFAULTS`。

## 本章目标

- 核对 19 个表单控件与源码文件。
- 独立渲染控件并用 `el.__kuiControl` 调 API。
- 分清节点级字段（1.3）与控件通用 props（1.4），只查专属字段。
- 避开空值、禁用、格式化、时区类坑。

## 1. 通用规则

### 1.1 控件一览

| type | 作用 | 源码（`src/components/controls/`） |
| --- | --- | --- |
| `input` | 单行文本：前后缀/计数/清空 | inputs.js |
| `password` | 密码，可切明文 | inputs.js |
| `textarea` | 多行文本，自适应/拖拽 | inputs.js |
| `number` | 数字：步长/范围/精度 | inputs.js |
| `select` | 单选下拉，可搜索清空 | selects.js |
| `multiselect` | 多选下拉，折叠+全选 | selects.js |
| `checkbox` | 单个复选框，可半选 | choices.js |
| `checkbox-group` | 复选组，值为数组 | choices.js |
| `radio` | 单个单选框 | choices.js |
| `radio-group` | 单选组，值为单值 | choices.js |
| `switch` | 开关，布尔或自定义值 | choices.js |
| `slider` | 滑块 | choices.js |
| `rating` | 星级评分 | choices.js |
| `color` | 颜色：预设 token+取色器 | choices.js |
| `date` | 日期 | pickers.js |
| `daterange` | 日期区间，双日历 | pickers.js |
| `month` | 月份，固定 `YYYY-MM` | pickers.js |
| `time` | 时间，时/分/秒三列 | pickers.js |
| `datetime` | 日期时间 | pickers.js |

### 1.2 枚举注册表

```bash
node -e "var s=require('./test/dom-stub.js'),e=s.createEnvironment({root:process.cwd(),fileMode:true}),lk=require('./test/load-kui.js');lk.loadKui(e,{});var l=e.window.KUI.registry.list();console.log('total',l.length,'control',l.filter(function(x){return x.category==='control';}).length);"
# 预期：total 40 control 19
```

### 1.3 节点级字段（写在节点上，非 props）

由 `control-base.js` 与表单引擎读取（`control-base.js:397-428`、`:1040-1141`）。

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `id` | string | 源码未设默认（undefined） | 否 | 字段名：`data`/`getField` 的键，表单里建议必填 |
| `type` | string | — | 是 | 1.1 中的 19 个之一 |
| `label` | string | 源码未设默认（undefined） | 否 | 标签；独立渲染时自动包 `.kui-field` |
| `help`/`tip` | string | 源码未设默认（undefined） | 否 | 帮助文案；`help→hint→tip` 回退 |
| `required` | boolean | `false` | 否 | 必填标记并拦空值 |
| `rules` | array | `[]` | 否 | 校验规则，语法见 [07-form-engine.md](07-form-engine.md) |
| `unit` | string | 源码未设默认（undefined） | 否 | 单位；input/number/slider 画进控件 |
| `width` | number\|string | 源码未设默认（undefined） | 否 | 字段宽；数字按 px |
| `span` | number | 源码未设默认（undefined） | 否 | 跨列（别名 `colspan`） |
| `labelPosition` | left/top/right | 跟随 form layout，默认 `left` | 否 | 单字段标签位置 |
| `labelWidth` | number | 跟随 form layout，默认 `96` | 否 | 单字段标签宽（px） |
| `visible` | boolean | `true` | 否 | `false` 时 renderNode 返回 null |

### 1.4 控件通用 props

合并规则 `merge({}, DEFAULTS, getProps(node))`，优先级 `props.x` → 节点顶层 `x` → 默认表（`inputs.js:25-27`）。

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `value` | any | 见各节「默认」 | 否 | 初始值，类型随控件 |
| `placeholder` | string | `''` | 否 | 占位文案 |
| `size` | sm/md/lg | `'md'` | 否 | 尺寸；非 md 才加尺寸类 |
| `disabled` | boolean | `false` | 否 | 禁用 |
| `readonly` | boolean | `false` | 否 | 只读 |
| `options` | array | `[]` | 否 | 选项（select/multiselect/两个 group） |
| `clearable` | boolean | 见各节 | 否 | 清空能力（部分控件） |
| `autofocus` | boolean | `false` | 否 | 渲染后聚焦；select/multiselect 自 **v1.3.9** 起生效（见 3.1） |

### 1.5 统一事件

| 事件 | 监听 | 参数 | 时机 |
| --- | --- | --- | --- |
| `kui-change` | 元素 `addEventListener`（bubbles） | `detail={id,value,node,el,control,type,reason}` | 值变化 |
| `control:change` | `KUI.bus.on('control:change',fn)` | 同上 | 同时刻 |
| `kui-focus`/`kui-blur` | 控件根元素 | `detail={id,node,el,control}` | 聚焦/失焦 |
| `kui-action` | 控件根元素 | `detail={id,name,data}` | 控件内部动作 |

`reason` 常见值：`input`/`change`/`blur`/`clear`/`set`/`step`/`toggle`/`select`/`start`/`end`/`today`/`now`/`ok`/`checkAll`。节点级 `on.change`/`on.click` 见 [10-actions-handlers.md](10-actions-handlers.md)。

### 1.6 单独渲染、实例 API 与表单内写法

```js
var inst = KUI.mountNode({ id:'nick', type:'input', label:'昵称', props:{ clearable:true } }, host);
var api = inst.el.__kuiControl;      // 控件实例
api.setValue('刻刻帝'); api.getValue();
```

`el.__kuiControl` 成员（`control-base.js:895-1010`）：`getValue()`/`setValue(v,{silent})`、`validate()`→`{valid,message}`、`setDisabled(flag)`、`setReadonly(flag)`、`setError(msg)`、`clearError()`、`focus()`、`destroy()`，另有 `el`/`box`/`field`/`node`/`getBox()`。

表单内写法：节点放进 `form.props.nodes`，初始值放 `form.props.data`。

```json
{"type":"form","props":{"validateOn":"blur","layout":{"columns":2,"labelWidth":96},"data":{"nick":"刻刻帝"},"nodes":[{"id":"nick","type":"input","label":"昵称","required":true,"props":{"clearable":true}}]}}
```

下文「表单内」均指此写法，布局/联动/校验见 07。

## 2. 文本输入

### 2.1 input

```json
{"id":"nick","type":"input","label":"昵称","props":{"placeholder":"请输入昵称","clearable":true,"maxlength":20}}
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `type` | string | `'text'` | 否 | 内部 input 类型 |
| `prefixIcon`/`suffixIcon` | string | `''` | 否 | 前后图标名 |
| `prefix`/`suffix` | string | `''` | 否 | 前后文本 |
| `maxlength` | number | `null` | 否 | 最大长度 |
| `showCount` | boolean | `false` | 否 | 字数；仅 maxlength 非 null 渲染 |
| `align` | left/center/right | `''` | 否 | 文本对齐 |

默认：`value ''`、`placeholder ''`、`size 'md'`、`clearable false`、`autofocus false`、`unit ''`、`readonly/disabled false`。
事件：`input→'input'`、`change→'change'`、`props.trim` 失焦`→'blur'`、Esc 清空`→'clear'`，另发 `control:input`。
API 增补：`blur()`、`select()`、`getInput()`、`setPlaceholder(t)`。坑：`trim` 不在默认表，源码直读 `props.trim`；`setValue(null)` 归一 `''`。
表单内：`{"id":"nick","type":"input","required":true,"rules":[{"min":2}]}`。

### 2.2 password

```json
{"id":"pwd","type":"password","label":"密码","props":{"placeholder":"至少 6 位","maxlength":32}}
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `toggleable` | boolean | `true` | 否 | 是否显示明文切换眼睛 |

其余同 input，默认相同。点眼睛只切 `type`，不改值；`autocomplete` 强制 `off`；值仍是明文 string。
表单内：`rules:[{min:6,max:32}]`。

### 2.3 textarea

```json
{"id":"bio","type":"textarea","label":"简介","props":{"rows":3,"maxlength":200,"showCount":true,"autosize":true}}
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `rows` | number | `3` | 否 | 最小行数（下限 3） |
| `maxRows` | number | `8` | 否 | 自适应最大行数 |
| `autosize` | boolean | `false` | 否 | 随内容增高（20px/行） |
| `resize` | vertical/none | `'vertical'` | 否 | 拖拽把手；autosize 时不渲染 |
| `maxlength` | number | `null` | 否 | 最大长度 |
| `showCount` | boolean | `false` | 否 | 字数；无 maxlength 只显示当前长度 |

默认：`value ''`、`placeholder ''`、`size 'md'`、`readonly/disabled false`。
事件同 input；API 同 2.1（无 `select()`）。坑：`autosize` 与 `resize` 拖拽互斥；Enter 换行不提交。
表单内：常配 `span:2`。

### 2.4 number

```json
{"id":"power","type":"number","label":"强度","props":{"min":1,"max":10,"step":1,"unit":"级"}}
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `min`/`max` | number | `null` | 否 | 范围；null 不限 |
| `step` | number | `1` | 否 | 步长；`<=0` 修正 1，并定精度 |
| `precision` | number | `null` | 否 | 小数位；默认取 step，夹 0~10 |
| `controls` | boolean | `true` | 否 | 上下步进键，长按连发 |
| `allowOutOfRange` | boolean | `false` | 否 | 允许程序写越界（用户输入仍夹取） |
| `thousands` | boolean | `false` | 否 | 千分位显示 |
| `align` | left/center/right | `'left'` | 否 | 文本对齐 |
| `wheel` | boolean | `false` | 否 | 滚轮改值；true 或已聚焦生效 |

默认：`value null`、`placeholder ''`、`size 'md'`、`unit ''`、`readonly/disabled false`。
键盘：`↑/↓`±step、`PgUp/PgDn`±10step、`Home/End` 到边界、`Enter` 提交。API 增补：`stepUp()`、`stepDown()`、`getInput()`、`setPlaceholder(t)`。
坑：内部 `type="text"`；非法文本回滚；`getValue()` 返回 number 或 null。
表单内：`unit:'级'` 显示在框内，另配 `rules:[{type:'number'}]`。

## 3. 选择

### 3.1 select

```json
{"id":"theme","type":"select","label":"主题","options":[{"label":"绯红","value":"kurumi"},{"label":"星夜","value":"starry"}]}
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `options` | array | `[]` | 否 | 扁平 `{label,value,icon,desc,disabled}` 或分组 `{label,options}` |
| `filterable` | boolean | `false` | 否 | 面板搜索框，按 label/value 过滤 |

默认：`value null`、`placeholder ''`、`size 'md'`、`clearable true`、`readonly/disabled false`。
事件：选中`→'select'`、清空`→'clear'`（值 `null`）。键盘 `↑/↓`、`Enter`、`Esc`、`Home/End`。API 增补：`setOptions(list)`、`open()`、`close()`、`getSelectedOption()`。
坑：value 宽松比较（`'1'`≡`1`）；无匹配 label 显示原值；`autofocus` 自 **v1.3.9** 起修复（`selects.js` 改传 `node`，渲染后自动聚焦）；旧版本需自行 `el.focus()`。
表单内：`deps.then.options` 可换选项，见 07。

### 3.2 multiselect

```json
{"id":"tags","type":"multiselect","label":"标签","options":[{"label":"演算","value":"演算"}],"props":{"maxTagCount":2}}
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `options` | array | `[]` | 否 | 选项，同 select |
| `filterable` | boolean | `true` | 否 | 搜索框，默认开 |
| `maxTagCount` | number | `3` | 否 | 最多展示标签数，余为「+N」 |
| `collapseTags` | boolean | `true` | 否 | false 时全部平铺 |
| `showCheckAll` | boolean | `true` | 否 | 面板底部全选/清空 |
| `searchPlaceholder` | string | `''` | 否 | 搜索框占位 |

默认：`value []`、`placeholder ''`、`size 'md'`、`clearable true`（见坑）、`readonly/disabled false`。
交互：`Backspace` 删最后标签；全选写入全部非 disabled 值，已全选再点则清空（`'checkAll'`/`'clear'`）。API 增补：`setOptions`、`open`、`close`、`getSelectedOptions()`。
坑：触发器无独立清空按钮，清空入口在面板底部；`getValue()` 返回数组副本；`autofocus` 同样自 **v1.3.9** 起生效。
表单内：值必须为数组，`required` 拦 `[]`。

## 4. 勾选与开关

### 4.1 checkbox

```json
{"id":"privacy","type":"checkbox","required":true,"props":{"text":"我已阅读并同意","checked":false}}
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `checked` | boolean | `false` | 否 | 初始选中；`value` 未定义时生效 |
| `value` | any | 源码未设默认（undefined） | 否 | 优先于 checked；有 trueValue 时按相等判断 |
| `text` | string | `''` | 否 | 右侧文案 |
| `trueValue`/`falseValue` | any | 源码未设默认（undefined） | 否 | 自定义取值 |
| `indeterminate` | boolean | `false` | 否 | 半选视觉，点击后清除 |

默认：`size 'md'`、`readonly/disabled false`。事件 `'toggle'`/`'set'`。API 增补 `setIndeterminate(flag)`。
坑：`false` 算未填写，`required` 能拦；未定 trueValue 时 getValue 返回布尔。
表单内：`span:2`+`rules:[{required:true}]` 是「同意条款」标准写法。

### 4.2 checkbox-group

```json
{"id":"ways","type":"checkbox-group","label":"方式","options":[{"label":"自动","value":"auto"},{"label":"人工","value":"manual"}],"props":{"inline":true}}
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `options` | array | `[]` | 否 | `{label,value,disabled}` |
| `inline` | boolean | `false` | 否 | 横向排列 |

默认：`value []`（标量归一到 `[v]`）、`size 'md'`、`readonly/disabled false`。事件派发数组副本。API 增补 `setOptions(list)`。
坑：`direction` 不是源码字段，横向用 `inline`。表单内：值为数组，`required` 拦 `[]`。

### 4.3 radio

```json
{"id":"solo","type":"radio","name":"solo","props":{"text":"单选","checked":true}}
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `checked` | boolean | `false` | 否 | 初始选中 |
| `value` | any | 源码未设默认（undefined） | 否 | 优先于 checked |
| `text` | string | `''` | 否 | 右侧文案 |
| `trueValue`/`falseValue` | any | 源码未设默认（undefined） | 否 | 自定义取值 |

默认：`size 'md'`、`readonly/disabled false`。`name` 读节点顶层。坑：单 radio 只能选中不能取消。表单内：一般改用 radio-group。

### 4.4 radio-group

```json
{"id":"priority","type":"radio-group","label":"优先级","options":[{"label":"低","value":"low"},{"label":"高","value":"high"}],"props":{"inline":true}}
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `options` | array | `[]` | 否 | `{label,value,disabled}` |
| `inline` | boolean | `false` | 否 | 横向排列 |
| `name` | string | `''` | 否 | 原生 name；空则自动 `kui-radio-<uid>` |

默认：`value null`、`size 'md'`、`readonly/disabled false`。事件派发选中的 option.value。API 增补 `setOptions(list)`。
坑：`direction` 不是源码字段。表单内：`deps` 常按单选值控制显隐，见 07。

### 4.5 switch

```json
{"id":"notify","type":"switch","label":"通知","props":{"activeText":"开","inactiveText":"关","value":true}}
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `activeText`/`inactiveText` | string | `''` | 否 | 开关内文字 |
| `activeValue`/`inactiveValue` | any | 源码未设默认（undefined） | 否 | 自定义开/关值 |
| `loading` | boolean | `false` | 否 | 加载态，期间不可切换 |

默认：`value false`、`size 'md'`、`readonly/disabled false`。键盘 `←`关/`→`开。API 增补 `setLoading`、`setActiveText`、`setInactiveText`。
坑：`false` 算未填写，`required` 的 switch 必须打开才通过（v1.3.0 起）。表单内：`{"id":"remember","type":"switch","label":"记住我"}`。

## 5. 范围与评分

### 5.1 slider

```json
{"id":"budget","type":"slider","label":"预算","props":{"min":0,"max":100,"step":5,"value":40,"unit":"%"}}
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `min`/`max` | number | `0`/`100` | 否 | 范围；`max<=min` 修正为 `min+1` |
| `step` | number | `1` | 否 | 步长；`<=0` 修正 1，值 snap 到网格 |
| `showValue` | boolean | `true` | 否 | 右侧显示「值+unit」 |
| `tooltip` | boolean | `true` | 否 | 默认表声明，渲染未读取（见坑） |

默认：`value 0`（写入夹取）、`unit ''`、`size 'md'`、`readonly/disabled false`。键盘 `←/↓`减、`→/↑`加、`PgUp/PgDn`±10step、`Home/End` 到两端。API 增补 `setRange(min,max)`。
坑：`tooltip` 未被使用；demo 的 `showTooltip`/`showStops` 不是源码字段。表单内：常配 `span:2`。

### 5.2 rating

```json
{"id":"score","type":"rating","label":"评分","props":{"count":5,"allowHalf":true,"showText":true}}
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `count` | number | `5` | 否 | 星星数（下限 1） |
| `allowHalf` | boolean | `false` | 否 | 半星，取 n 或 n+0.5 |
| `allowClear` | boolean | `true` | 否 | 点同分归零 |
| `showText` | boolean | `false` | 否 | 右侧文案 |
| `texts` | array | `[]` | 否 | 按 `texts[ceil(value)-1]` 取 |

默认：`value 0`（夹 0~count）、`size 'md'`、`readonly/disabled false`。键盘 `←/→/↑/↓`±（0.5/1）、`Home`0、`End`count。
坑：字段是 `count` 不是 `max`；`0` 不算空，必填用 `rules:[{min:1}]`。表单内：同 1.6。

## 6. 颜色

### 6.1 color

```json
{"id":"themeColor","type":"color","label":"主题色","props":{"value":"#c8102e"}}
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `presets` | array | 11 个 token：`accent`/`accent-2`/`accent-3`/`success`/`warning`/`danger`/`info`/`text-1`/`text-2`/`bg-3`/`bg-4` | 否 | 字符串 token 或 `{value}`/`{color}`/`{token}` |

默认：`value ''`、`clearable true`、`size 'md'`、`readonly/disabled false`。面板宽 220：预设、`<input type="color">`、清除。API 增补 `open()`、`close()`。
坑：`format`/`showInput` 不是源码字段；`#hex`/`rgb`/`hsl`/`var(` 按字面量存，其余按 token 名存。表单内：`required` 拦 `''`。

## 7. 日期时间

> 5 个 picker 共用按钮触发器 + `openPopup`；值一律字符串，不返回 Date。

### 7.1 date

```json
{"id":"start","type":"date","label":"开始","props":{"format":"YYYY-MM-DD","min":"2024-01-01","clearable":true}}
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `format` | string | `'YYYY-MM-DD'` | 否 | 值格式 |
| `min`/`max` | string | `''` | 否 | 可选范围，超出格子禁用 |
| `weekStart` | number | `1` | 否 | 0 周日起 / 1 周一起 |
| `showToday` | boolean | `true` | 否 | 底部「今天」 |

默认：`value ''`、`placeholder ''`（空则「选择日期」）、`clearable true`、`size 'md'`、`readonly/disabled false`。
键盘：`←/→`±1 天、`↑/↓`±7 天、`Home/End` 周首末、`PgUp/PgDn`±1 月、`Enter` 选中。API 增补 `setMin`、`setMax`、`open`、`close`。
坑：`value` 必须符合 `format`；`valueFormat` 未实现。表单内：`min/max` 可配 `deps.then.value`。

### 7.2 daterange

```json
{"id":"window","type":"daterange","label":"区间","span":2,"props":{"separator":" ~ ","startPlaceholder":"开始","endPlaceholder":"结束"}}
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `format` | string | `'YYYY-MM-DD'` | 否 | 两端值格式 |
| `startPlaceholder`/`endPlaceholder` | string | `''` | 否 | 两端占位 |
| `separator` | string | `''` | 否 | 分隔符，空则「至」 |
| `min`/`max` | string | `''` | 否 | 区间范围 |
| `weekStart` | number | `1` | 否 | 一周起始 |
| `showToday` | boolean | `true` | 否 | 底部「今天」 |

默认：`value []`、`placeholder ''`（空则「选择日期范围」）、`clearable true`、`size 'md'`、`readonly/disabled false`。
交互：首点定开始（`'start'`），次点定结束并关闭（`'end'`）；早于开始则改设为新开始；双日历右月=左月+1。API 增补 `setMin`/`setMax`/`open`/`close`；`setValue` 接受数组或单值（单值→`[v,'']`）。
坑：`['2024-01-01','']` 不算空，`required` 不拦半开区间，需自定义 `validator`。表单内：常配 `span:2`。

### 7.3 month

```json
{"id":"month","type":"month","label":"月度","props":{"min":"2024-01","max":"2026-12"}}
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `min`/`max` | string | `''` | 否 | 可选月份范围 |

默认：`value ''`（固定 `YYYY-MM`）、`placeholder ''`、`clearable true`、`size 'md'`、`readonly/disabled false`。交互：12 格月份 + 年份 `‹ ›`，底部「今天」。API 增补 `setMin`/`setMax`/`open`/`close`。
坑：格式固定 `YYYY-MM`，源码不读 `format`。表单内：适合账期。

### 7.4 time

```json
{"id":"mark","type":"time","label":"时刻","props":{"showSeconds":true,"format":"HH:mm:ss","minuteStep":5}}
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `format` | string | `''` | 否 | 空则按 showSeconds 取 `HH:mm:ss`/`HH:mm` |
| `showSeconds` | boolean | `true` | 否 | 是否显示秒列 |
| `hourStep`/`minuteStep`/`secondStep` | number | `1` | 否 | 三列步长 |

默认：`value ''`、`placeholder ''`、`clearable true`、`size 'md'`、`readonly/disabled false`。交互：三列滚动+上下箭头（长按连发），底部「此刻/清除/确定」。API 增补 `open()`、`close()`。
坑：`setValue(null|'')` 才清空；值恒为字符串；未选时先显示当前时间，需点「确定」提交。表单内：初始值用与 format 一致串。

### 7.5 datetime

```json
{"id":"deadline","type":"datetime","label":"截止","props":{"format":"YYYY-MM-DD HH:mm:ss","showSeconds":true,"min":"2024-01-01 00:00:00"}}
```

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `format` | string | `'YYYY-MM-DD HH:mm:ss'` | 否 | 值格式 |
| `showSeconds` | boolean | `true` | 否 | 时间区是否含秒 |
| `hourStep`/`minuteStep`/`secondStep` | number | `1` | 否 | 时间列步长 |
| `min`/`max` | string | `''` | 否 | 可选范围 |
| `weekStart` | number | `1` | 否 | 一周起始 |
| `showToday` | boolean | `true` | 否 | 日历底部「今天」 |

默认：`value ''`、`placeholder ''`、`clearable true`、`size 'md'`、`readonly/disabled false`。
交互：先选日期（`'date'`）再调时间；未选日期时改时间不提交，「确定」一起写回（`'ok'`）。API：仅 `getValue`/`setValue`/`open`/`close`/`focus`（无 `setMin`/`setMax`）。
坑：`format` 与 `showSeconds` 需成对；`getValue()` 恒为格式化串。表单内：截止时间常配 `min`+`deps`。

## 8. 常见错误与排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 显示「未注册的元素类型」 | 控件未加载或 type 拼错 | 用 1.2 核对，检查 profile |
| 表单 `getData()` 无某字段 | 节点没写 `id` | 补 `id` |
| `showCount` 无数字 | `maxlength` 为 null | 同时设 maxlength |
| `showTooltip`/`showStops`/`valueFormat`/`dragger` 无效 | 非源码字段 | 按本章字段表改 |
| `required` 的 switch 不通过 | `false` 算未填写 | 让用户开启或改 rules |
| 日期值显示空 | value 与 format/min/max 不一致 | 统一模板格式 |
| 数字 `getValue()` 为 null | 非法输入被回滚 | 检查 min/max/step，用 number 初始化 |

## 本章自检

```bash
# 预期 total 40 control 19
node -e "var s=require('./test/dom-stub.js'),e=s.createEnvironment({root:process.cwd(),fileMode:true}),lk=require('./test/load-kui.js');lk.loadKui(e,{});var l=e.window.KUI.registry.list();console.log('total',l.length,'control',l.filter(function(x){return x.category==='control';}).length);"
```

## 参考源码

- `src/components/controls/control-base.js:397-428,689-786,895-1010` —— props 取值、事件分发、`__kuiControl` 与 `finalize`。
- `src/components/controls/inputs.js:189-206,573-830` —— input 与 number 默认表/渲染。
- `src/components/controls/selects.js:248-480,493-781` —— select/multiselect。
- `src/components/controls/choices.js:109-391,505-589,602-997,1010-1192` —— 勾选/开关/滑块/评分/颜色。
- `src/components/controls/pickers.js:384-535,548-1012,1175-1602` —— 5 个日期时间控件。
- `config/demos/form.json` —— 官方示例。

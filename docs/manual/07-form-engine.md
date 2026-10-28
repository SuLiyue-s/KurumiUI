# 07 · 表单引擎：布局、绑定、校验与联动

> 适用版本：KurumiUI v1.3.8 ｜ 前置章节：[05-controls-input.md](05-controls-input.md) ｜ 阅读时长：约 35 分钟

表单引擎即 `type:"form"` 背后的 `KUI.form`（`src/components/form.js`）：把 `props.nodes` 渲染成控件、按 `data` 回填、统一校验与 `deps` 联动，实例挂到 `hostEl.__kuiForm`。

## 本章目标

- 手写 `type:"form"` 节点并摆好 `layout` 栅格。
- 弄清 `data` 初始值、取值/赋值/重置/禁用的边界。
- 会写 `rules`、`requiredAny` 与 `validateOn`，知道错误如何展示与清除。
- 会写 `deps` 做显隐、禁用、动态选项；知道 `KUI.handlers.form` 的 11 个函数。

## 1. form 节点与字段

### 1.1 节点结构

```json
{
  "type": "form",
  "props": {
    "validateOn": "blur",
    "layout": { "columns": 2, "gap": 16, "labelWidth": 96, "labelPosition": "left", "submitAlign": "right" },
    "data": { "name": "刻刻帝" },
    "nodes": [ { "id": "name", "type": "input", "label": "名称", "required": true } ]
  }
}
```

`form` 由 `src/components/controls/index.js:79-157` 注册，`props` 几乎原样透传给 `KUI.form.create(host,opts)`，所以 `KUI.form.create` 的选项目录就是本表的字段。

### 1.2 props 字段表

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `nodes` | array | `[]` | 否 | 字段节点数组；缺省回退节点 `children`/`fields` |
| `data` | object | `{}` | 否 | 初始数据，按字段 `id` 回填 |
| `layout` | object | `{}` | 否 | 布局，见 1.3 |
| `validateOn` | submit/change/blur | `'submit'` | 否 | 自动校验时机 |
| `showSubmit` | boolean | `false` | 否 | 是否渲染底部提交/重置按钮 |
| `submitText` / `resetText` | string | `t('form.submit','提交')` / `t('form.reset','重置')` | 否 | 按钮文案 |
| `showReset` / `submitAlign` | boolean / left/center/right | `true` / `'right'` | 否 | 有底部时是否显示重置、按钮对齐 |
| `submitOnEnter` | boolean | 未设即为 `true` | 否 | 输入框 Enter 是否提交 |
| `bordered` | boolean | `false` | 否 | 表单边框样式类 |
| `columns` / `gap` | number | `1` / `16` | 否 | 栅格列数/间距（layout 缺省时回退到这里） |
| `labelWidth` / `labelPosition` | number / left/top/right | `96` / `'left'` | 否 | 同上，layout 缺省时生效 |
| `onChange(id,value,data,api)` | function | 源码未设默认（undefined） | 否 | 字段值变化回调 |
| `onSubmit(data,api)` / `onInvalid(errors,api)` / `onReady(api,getData)` | function | 源码未设默认（undefined） | 否 | 校验通过/失败、渲染完成回调 |

> 表单实例还带 `id`（节点 id → `data-kui-id`）。`on.*` 动作与 `KUI.handlers.form` 见 7.2 和 [10-actions-handlers.md](10-actions-handlers.md)。

### 1.3 layout 全字段

`layout` 归一化在 `form.js:406-424`；缺省时从节点顶层同名键补：

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `columns` | number | `1` | 否 | 栅格列数，最小 1；字段 `span` 可跨列 |
| `gap` | number | `16` | 否 | 行/列间距 px → `--kui-form-gap` |
| `labelWidth` | number | `96` | 否 | 标签宽 px → `--kui-field-label-width` |
| `labelPosition` | left/top/right | `'left'` | 否 | 标签位置，字段级可覆盖 |
| `labelAlign` | string | `''` | 否 | 标签对齐类 |
| `submitAlign` | left/center/right | `'right'` | 否 | 底部按钮对齐 |

字段节点上的 `span`/`colspan`/`width`/`labelPosition`/`labelWidth` 优先于 `layout`（`form.js:624-648`、`control-base.js:1016-1038`）。

## 2. 数据绑定

- `data` 只在创建时注入：`renderOne` 发现 `data[id] !== undefined` 且节点未写 `value` 时，把 `data[id]` 塞进 `props.value`（`form.js:592-600`）。
- 字段必须写 `id` 才会登记：`fields[id]` 有记录才算表单字段，`getData()` 才有它；渲染完成后源码会给无初始值字段补 `data[id] = control.getValue()`（`form.js:758-763`）。

```js
var form = document.querySelector('.kui-form-host').__kuiControl.instance; // 或 formApi
console.log(form.getData());      // { name:'刻刻帝', theme:null }
```

## 3. 取值、赋值、清零

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `getData()` | → object | 当前全量数据（副本） |
| `getValue(id)` | → any | 读单个控件值并回写 `data` |
| `setValue(id,value,opts)` | → api | 写字段；`opts.silent` 不派发 change；否则自动 `recalc()` |
| `setData(obj,{silent})` | → api | 批量写；逐字段 `setValue(id,v,{silent:true,reason:'setData'})` |
| `reset()` | → api | 全部回到 `initialData`（缺省 `null`），清错误，触发 `reset` 事件 |
| `setDisabled(id,flag)` / `setReadonly(id,flag)` | → api | 手动覆盖，之后仍会被 `deps` 重算修正 |
| `setVisible(id,flag)` | → api | 显隐；隐藏字段不参与 `validate()` |
| `setRequired(id,flag)` | → api | 必填标记 |
| `setOptions(id,list)` | → api | 换选项（select/multiselect 等） |
| `getField(id)` / `getFields()` | → rec / array | 字段记录/全部记录 |
| `clearValidate(ids?)` / `setError(id,msg)` / `clearError(id)` | → api | 错误清理/注入/清除 |
| `validate(ids?)` / `validateField(id)` | → `{valid,errors,data}` / `{valid,message}` | 见 §4 |
| `submit()` | → `{valid,errors,data}` | 校验通过才派发 `submit` |
| `getLinkageGraph()` | → array | 调试联动：每条 deps 命中与否 |
| `subscribe(fn)` | → fn | 订阅事件，返回退订函数 |
| `destroy()` | — | 销毁实例并清空宿主 |

> `setValue` 先同步 `data`/`props.value`，再用 `silent` 写控件并显式 `recalc()`，避免重复 change 事件（`form.js:1150-1170`）。

## 4. 校验体系

### 4.1 required 与 rules

`rules` 写节点级数组，逐条执行，空值且非必填直接通过（`control-base.js:831-886`）：

| 字段 | 类型 | 默认值 | 必填 | 作用与取值 |
| --- | --- | --- | --- | --- |
| `required` | boolean | `false` | 否 | 必填；空串/空数组/`false`/`null` 均算未填 |
| `type` | string | 源码未设默认（undefined） | 否 | `email`/`number`/`url`/`phone`/`integer` |
| `pattern` | string \| RegExp | 源码未设默认（undefined） | 否 | 正则；字符串会被编译 |
| `min` / `max` | number | 源码未设默认（undefined） | 否 | `type:'number'` 时比数值，否则比长度 |
| `len` | number | 源码未设默认（undefined） | 否 | 固定长度 |
| `validator` | function | 源码未设默认（undefined） | 否 | `(value,node) => false | '文案'`，返回假值或字符串即失败 |
| `message` | string | 源码未设默认（undefined） | 否 | 覆盖默认错误文案 |

```json
{ "id": "mail", "type": "input", "label": "邮箱", "rules": [ { "required": true, "message": "邮箱必填" }, { "type": "email" } ] }
```

默认文案（`i18n` 键）：`validate.required`「该项为必填」、`validate.type`/`validate.pattern`「格式不正确」、`validate.minLength`「至少 {{min}} 个字符」、`validate.maxLength`「最多 {{max}} 个字符」、`validate.len`「长度需为 {{len}}」、`validate.failed`「校验未通过」。

### 4.2 requiredAny：组内至少一项

```json
{ "id": "contact", "type": "checkbox-group", "label": "联系方式", "requiredAny": ["mail", "phone"] }
```

节点（或 `props`）的 `requiredAny` 是字段 id 数组，去重后成员 ≥2 才成组；组内全空时校验失败，文案取 `requiredAnyMessage` 或「请至少填写其中一项」（`form.js:765-810`）。成员自身仍按各自 `rules` 校验。

### 4.3 validateOn 与错误展示

- `'submit'`（默认）：只在 `submit()`/`validate()` 时校验。
- `'change'`：值变化后校验；`'blur'`：失焦后校验（`validateOn==='blur'` 时 bus 监听 `control:blur`，`form.js:542-560`）。
- 隐藏字段（`isInvisible`）跳过校验；`validate()` 返回 `{valid, errors:{id:message}, data}`，并聚焦首个错误字段。
- 错误展示：`field.setError(msg)` + `.kui-form__item.is-error` + `aria-invalid`；`clearValidate()` 清全部，`clearError(id)` 清单个。

## 5. deps 依赖联动

### 5.1 结构

```json
{
  "id": "mail", "type": "input", "label": "邮箱", "visible": false,
  "deps": [ { "when": { "field": "notifyWay", "op": "eq", "value": "mail" }, "then": { "visible": true, "required": true } } ]
}
```

每个字段的 `deps` 是数组（也可写在 `props.deps`），每条 `{when, then}`；`then` 可写 `visible`/`disabled`/`readonly`/`required`/`value`/`options`/`text`/`label`/`error`（`form.js:897-908`）。

### 5.2 when 语法与 op

`when` 可为：`true/false`、数组（AND）、`{field|id, op, value}`、`{all:[…]}`、`{any:[…]}`、`{not:…}`（`form.js:349-400`）。op 全集：`eq`、`ne`、`in`、`nin`、`contains`、`notContains`、`gt`、`gte`、`lt`、`lte`、`empty`、`notEmpty`、`truthy`、`falsy`、`regex`、`match`、`notMatch`。比较用宽松相等（`'1'`≡`1`）；`empty` 视 `false`/空串/空数组/空对象为空。

```json
{ "when": { "all": [ { "field": "startDate", "op": "notEmpty" }, { "field": "endDate", "op": "empty" } ] }, "then": { "visible": true } }
```

### 5.3 执行时机

每次字段变化 → `handleExternChange` → `recalc()`：先把每个字段重置为「默认态」（`raw.visible!==false`、`disabled/readonly` 取节点/属性合并、`required` 取属性或 `rules[i].required`），再按 `deps` **声明顺序**逐条求值，命中则覆盖；最后统一 `applyState`。后声明覆盖先声明；手动 `setDisabled/setVisible` 会被下一次 `recalc` 覆盖；未写 `visible` 但存在显隐类依赖时初始隐藏（`form.js:851-886`）。

## 6. 事件

`form.subscribe(fn)` 与页面实例收到的事件对象：

| 事件 | 触发 | 主要字段 |
| --- | --- | --- |
| `change` | 字段值变化 | `{type,id,value,prev,data,reason,node,el,detail}` |
| `data` | `setData()` | `{type:'data',data,reason}` |
| `invalid` | `submit()` 校验失败 | `{type,errors,data}` |
| `submit` | 校验通过提交 | `{type:'submit',data}` |
| `reset` | `reset()` | `{type:'reset',data}` |

另：`options.onChange/onSubmit/onInvalid` 对应上述回调；提交后还会 `KUI.bus.emit('form:submit',{el,data,form})`，节点级 `on` 动作见 [10-actions-handlers.md](10-actions-handlers.md)。

## 7. 实例 API 与业务函数

### 7.1 业务函数 `KUI.handlers.form` 11 个

`src/components/handlers/form.handlers.js`（115 行）注册在 `form` scope，`formOf(ctx)` 依次找 `ctx.form`→`ctx.formInstance`→`ctx.page.form`；`field` 可传 id 或 `name`：

| 函数 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `reset` | 无 | `true` | 重置后 toast「表单已重置」 |
| `validate` | 无 | `true` | ⚠️ 源码写成 `var ok = form.validate();`，对象恒真，永远返回 `true` 并 toast「校验通过」；要真结果请直接调实例 `validate().valid` |
| `getData` | 无 | `data` | 打印到 `KUI.log` 并 toast |
| `setData` | `data`/`values`/`formData` | `true` | `form.setData(data)` |
| `setValue` | `{field,value}` 或 `{field,text}` | `true` | 单字段赋值 |
| `getValue` | `{field}` | 值 | 单字段取值 |
| `setVisible` | `{field,visible}` | `true` | `visible!==false` 才显示 |
| `setDisabled` | `{field,disabled}` | `true` | `disabled!==false` 才禁用 |
| `setRequired` | `{field,required}` | `true` | `required!==false` 才必填 |
| `setError` | `{field,error}` 或 `{field,text}` | `true` | 默认文案「错误」 |
| `clearError` | `{field}` | `true` | 无 `field` 时清全部校验 |

业务函数总表与 `on` 语法见 [10-actions-handlers.md](10-actions-handlers.md)。页面里取实例：`host.__kuiForm` 或 `host.__kuiControl.instance`。

## 8. 与 dialog.form 的联动

`KUI.dialog.form(config)` 返回 Promise：提交校验通过后 resolve 表单数据并关闭，取消 resolve `null`（`src/components/dialog.js:986-1001`、`:661-693`）。

```js
KUI.dialog.form({ title:'编辑资料', width:520, layout:'vertical', data:{ name:'刻刻帝' },
  nodes:[ { id:'name', type:'input', label:'名称', required:true } ],
  submitApi: function (data, ctx) { return api.save(data).then(function(){ return true; }); } })
  .then(function (data) { if (data) KUI.toast.success('已保存'); });
```

- 弹窗内 nodes 由 `KUI.form` 渲染并校验；**校验不通过不关闭**（`src/frame/dialog-frame.js:983-1023`）。
- `submitApi` 返回 `false` / `Promise<false>` 保持打开；`Promise.reject(err)` 显示错误、保持打开；`remoteSubmit` 场景由父页面响应 `{close:false,message}` 保持打开并展示该 message。
- 关闭按钮/遮罩取消时 Promise resolve `null`，所以**必须判空**再操作。

## 9. upload 在表单中的处理

`upload` 属 `data` 类（见 [06-controls-display.md](06-controls-display.md)），表单里它只是一个普通字段：

- `getData()[id]` 是文件元数据数组 `[{uid,name,size,type,status,percent,url}]`，不是 `File`。
- `autoUpload:true`（默认）选完即由控件自己 XHR 上传，与 `submit()` 无耦合；`autoUpload:false` 时表单提交前需自行调 `upload.submit()`，否则数组里是 `status:'ready'` 的占位。
- 上传失败不会让 `validate()` 失败；要拦，请在 `onSubmit` 里检查 `data[id]` 的 `status`。

## 10. 动态增删字段

`formApi` **没有** `addField`/`removeField`，创建时的 `nodes` 决定字段集合。三种做法：① 预置字段 + `deps`/`setVisible` 显隐；② `destroy()` 后重新 `KUI.form.create`；③ 在表单外独立 `KUI.mountNode` 挂控件（不进入表单 data）。

```js
form.destroy();
form = KUI.form.create(host, { nodes: newNodes, data: formData, layout: { columns:2 } });
```

## 11. 完整示例

### 11.1 设置面板

```json
{"type":"form","props":{"validateOn":"blur","layout":{"columns":1,"gap":14,"labelWidth":96},"data":{"shellName":"刻刻帝终端","theme":"kurumi","remember":true},"submitText":"保存设置","nodes":[{"id":"shellName","type":"input","label":"终端名称","required":true,"props":{"placeholder":"显示在标题栏","clearable":true}},{"id":"theme","type":"select","label":"默认主题","options":[{"label":"绯红","value":"kurumi"},{"label":"星夜","value":"starry"},{"label":"樱","value":"sakura"}]},{"id":"remember","type":"switch","label":"记住上次标签","props":{"activeText":"记住","inactiveText":"不记住"}}]}}
```

### 11.2 用户资料（含校验与联动）

```json
{
  "type": "form",
  "props": {
    "validateOn": "blur",
    "layout": { "columns": 2, "gap": 16, "labelWidth": 96, "labelPosition": "left", "submitAlign": "right" },
    "data": { "deployType": "normal", "notifyWay": "mail" },
    "nodes": [
      { "id": "nick", "type": "input", "label": "昵称", "required": true, "rules": [ { "min": 2, "max": 20 } ] },
      { "id": "pwd", "type": "password", "label": "密码", "rules": [ { "required": true }, { "min": 6, "max": 32 } ] },
      { "id": "deployType", "type": "radio-group", "label": "部署方式", "span": 2, "options": [ { "label": "常规", "value": "normal" }, { "label": "封印", "value": "seal" } ], "props": { "inline": true } },
      { "id": "sealName", "type": "input", "label": "封印名", "visible": false,
        "deps": [ { "when": { "field": "deployType", "op": "eq", "value": "seal" }, "then": { "visible": true, "required": true } } ] },
      { "id": "notifyWay", "type": "select", "label": "通知方式", "options": [ { "label": "邮件", "value": "mail" }, { "label": "站内信", "value": "inbox" } ] },
      { "id": "mail", "type": "input", "label": "邮箱", "visible": false, "rules": [ { "type": "email" } ],
        "deps": [ { "when": { "field": "notifyWay", "op": "eq", "value": "mail" }, "then": { "visible": true, "required": true } } ] },
      { "id": "remark", "type": "textarea", "label": "备注", "span": 2, "props": { "rows": 3, "showCount": true, "maxlength": 200 } }
    ]
  }
}
```

页面侧接管提交：

```js
var form = host.__kuiForm;
form.subscribe(function (ev) { if (ev.type === 'invalid') KUI.toast.error('请检查表单'); });
host.__kuiControl.instance.submit();
```

## 12. 常见错误与排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 表单空白、控制台 `[KUI.form] 需要一个宿主 DOM 元素` | 把 form 节点挂到了非 DOM 上 | 传真实宿主元素 |
| `getData()` 少字段 | 节点没写 `id` | 补 `id` |
| 初始值不生效 | `data` 键名与 `id` 不一致，或节点自己写了 `value` | 对齐键名并删掉节点级 `value` |
| 联动不生效 | `deps` 层级/数组写错或 `field` 名错 | 用 `form.getLinkageGraph()` 看命中 |
| 显隐类依赖字段一上来就显示 | 未写 `visible:false` | 显式 `visible:false` |
| `validate()` 全过但空值 | 字段被 `deps` 隐藏 | 隐藏字段不校验；先修显隐 |
| `KUI.handlers.form.validate` 永远通过 | 源码 bug（见 7.1） | 直接调实例 `validate().valid` |
| dialog.form `.then` 拿到 `null` | 取消/关闭 | 先判空 |
| 手动 `setDisabled` 后失效 | 下次 `recalc` 被 `deps` 覆盖 | 改 `deps` 或在 `then` 里声明 |

## 本章自检

```bash
# 预期 11
node -e "var s=require('./test/dom-stub.js'),e=s.createEnvironment({root:process.cwd(),fileMode:true}),lk=require('./test/load-kui.js');lk.loadKui(e,{});var h=e.window.KUI.handlers.list().filter(function(x){return x.scope==='form';});console.log(h.length);"
```

再跑 `form.getLinkageGraph()` 与 `form.submit()` 验证联动与提交返回。

## 参考源码

- `src/components/form.js:238-400` —— `emptyValue`/`looseEq`/`testOp`/`evalWhen`。
- `src/components/form.js:765-810` —— `requiredAny`。
- `src/components/form.js:851-1011` —— `computeDefaults`/`recalc`/`applyState` 联动引擎。
- `src/components/form.js:1055-1170` —— 变化处理与 `setValue`/`setData`。
- `src/components/form.js:1186-1396` —— 校验、重置、提交。
- `src/components/handlers/form.handlers.js:1-115` —— 11 个业务函数。
- `src/components/dialog.js:661-693,986-1001` —— `dialog.form` 提交与 Promise。
- `src/frame/dialog-frame.js:983-1032` —— 弹窗提交校验与错误展示。

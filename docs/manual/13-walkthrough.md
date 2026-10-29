# 13 · 三个端到端实战

> 适用版本：KurumiUI v1.4.3 ｜ 前置章节：03 · 页面组装、04 · app.json、05–08 · 控件/表单/组件、10–12 · 动作、通信与扩展 ｜ 阅读时长：约 50 分钟

## 本章目标

- 从零搭一个内部管理台：菜单规划 → 2 个新页面 → 表单/表格/弹窗/通知 → 改默认主题 → 菜单与标签 → 构建 → 部署。
- 把 KurumiUI 的一个组件页嵌进现有站点：iframe + 自定义 postMessage 桥（父页面收事件、发命令）+ 样式隔离 + 版本升级。
- 做一个离线工具页：裁剪 profile、自建入口、`file://` 直接运行、打包 zip 分发。
- 每个案例都给「文件清单 → 每个文件完整内容 → 命令序列 → 验证步骤 → 失败点 → 部署」。

三个案例的公共前提：仓库已 `npm install`（本项目零运行时依赖，装的是开发工具）；命令在仓库根执行；本地预览 `npm start`（默认 `http://127.0.0.1:8080`，端口占用自动 +1，启动时会自动重建产物，见 [02-build.md](02-build.md)）。

## 13.1 案例 A：从零做一个内部管理台

### A1. 需求与菜单规划

3 组 6 项：「工作台」（首页、业务门户）、「工单」（我的工单、全部工单）、「实验室」（主题灵装、弹窗与提醒）。其中**业务门户**与**工单处理**是本案例新增的 2 个页面，后 4 项指向仓库已有页面，用来验证「一个菜单项 = 一个标签页」。

| 菜单项 | 目标 | 是否新建 |
| --- | --- | --- |
| 首页 | `pages/home.html` | 否 |
| 业务门户 | `pages/portal.html` | **是** |
| 我的工单 | `pages/tickets.html?scope=mine` | **是**（同一页面，靠 query 区分） |
| 全部工单 | `pages/tickets.html?scope=all` | 同上 |
| 主题灵装 | `pages/theme.html` | 否 |
| 弹窗与提醒 | `pages/dialogs.html` | 否 |

### A2. 文件清单

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `pages/portal.html` | 新建 | 统计卡片 + 表格 + 弹窗/通知演示 |
| `pages/tickets.html` | 新建 | 筛选表单 + 工单表格 + 提交确认弹窗 + toast |
| `config/app.json` | 改 3 处 | `menu.props.items`、`tabs.props.initial`、`theme.default` |
| `src/styles/*.css` | 不改 | 新页面只写少量内联样式，颜色全部走 `var(--kui-*)` |

### A3. 文件 1：`pages/portal.html`

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <script src="../src/core/theme-boot.js"></script>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>业务门户 · 内部管理台</title>
  <link rel="stylesheet" href="../src/styles/base.css" />
  <link rel="stylesheet" href="../src/styles/controls.css" />
  <link rel="stylesheet" href="../src/styles/components.css" />
  <link rel="stylesheet" href="../src/styles/tooltip.css" />
  <style>
    .portal { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
    .portal__head { display: flex; align-items: baseline; gap: 10px; }
    .portal__title { margin: 0; font-size: 16px; color: var(--kui-text-1, #ece6ee); }
    .portal__desc { margin: 0; font-size: 12px; color: var(--kui-text-2, #b9b1c4); }
    .portal__cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
    .portal__card { padding: 12px 14px; border: 1px solid var(--kui-border, #3a3444); border-radius: 10px;
      background: var(--kui-bg-1, #1a1721); }
    .portal__num { font-size: 22px; font-weight: 700; color: var(--kui-accent-2, #d4af37); }
    .portal__label { font-size: 12px; color: var(--kui-text-2, #b9b1c4); }
    .portal__ops { display: flex; gap: 8px; }
  </style>
</head>
<body>
  <div class="portal">
    <div class="portal__head">
      <h1 class="portal__title">业务门户</h1>
      <p class="portal__desc">pages/portal.html · standalone profile</p>
    </div>
    <div class="portal__cards" id="cards"></div>
    <div class="portal__ops" id="ops"></div>
    <div id="board"></div>
  </div>

  <script src="../src/core/kui-all.js" data-kui-profile="standalone"></script>
  <script>
    (function () {
      'use strict';
      var KUI = window.KUI || {};
      var frame = KUI.frame || null;

      function ready(fn) {
        if (frame && typeof frame.ready === 'function') {
          try { frame.ready(fn); return; } catch (e) { /* 单独打开时忽略 */ }
        }
        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', fn); }
        else { fn(); }
      }

      var STATS = [
        { label: '今日工单', num: 42 },
        { label: '待处理', num: 7 },
        { label: 'SLA 达标率', num: '98%' }
      ];

      function renderCards() {
        var host = document.getElementById('cards');
        STATS.forEach(function (s) {
          var card = document.createElement('div');
          card.className = 'portal__card';
          var num = document.createElement('div');
          num.className = 'portal__num';
          num.textContent = String(s.num);
          var label = document.createElement('div');
          label.className = 'portal__label';
          label.textContent = s.label;
          card.appendChild(num);
          card.appendChild(label);
          host.appendChild(card);
        });
      }

      function renderBoard() {
        KUI.renderTree([
          { type: 'table', props: {
              striped: true, hoverable: true,
              columns: [
                { key: 'id', title: '编号', width: 96 },
                { key: 'title', title: '标题' },
                { key: 'owner', title: '负责人', width: 120 },
                { key: 'status', title: '状态', width: 100 }
              ],
              data: [
                { id: 'T-1001', title: '登录页样式错位', owner: '刻刻帝', status: '处理中' },
                { id: 'T-1002', title: '导出接口超时', owner: '狂三', status: '待分派' }
              ]
          } }
        ], document.getElementById('board'));
      }

      function renderOps() {
        KUI.renderTree([
          { type: 'button', props: { text: '刷新数据', variant: 'primary' },
            on: { click: function () { KUI.toast.success('数据已刷新'); } } },
          { type: 'button', props: { text: '查看说明' },
            on: { click: { action: 'dialog.alert', params: {
              title: '业务门户', message: '这里演示：renderTree 挂载、表格控件、动作触发弹窗与 toast。'
            } } } }
        ], document.getElementById('ops'));
      }

      ready(function () {
        renderCards();
        renderOps();
        renderBoard();
        if (frame && typeof frame.setTitle === 'function') {
          try { frame.setTitle('业务门户'); } catch (e) { /* ignore */ }
        }
      });
    })();
  </script>
</body>
</html>
```

### A4. 文件 2：`pages/tickets.html`

筛选表单 + 表格 + 「提交」确认弹窗 + 成功 toast，并演示从 URL query 读参数（菜单里两个工单项共用同一页面）。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <script src="../src/core/theme-boot.js"></script>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>工单处理 · 内部管理台</title>
  <link rel="stylesheet" href="../src/styles/base.css" />
  <link rel="stylesheet" href="../src/styles/controls.css" />
  <link rel="stylesheet" href="../src/styles/components.css" />
  <link rel="stylesheet" href="../src/styles/tooltip.css" />
  <style>
    .tickets { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
    .tickets__title { margin: 0; font-size: 16px; color: var(--kui-text-1, #ece6ee); }
    .tickets__tip { margin: 0; font-size: 12px; color: var(--kui-text-2, #b9b1c4); }
    .tickets__form, .tickets__board { padding: 12px; border: 1px solid var(--kui-border, #3a3444);
      border-radius: 10px; background: var(--kui-bg-1, #1a1721); }
    .tickets__ops { display: flex; gap: 8px; }
  </style>
</head>
<body>
  <div class="tickets">
    <h1 class="tickets__title">工单处理</h1>
    <p class="tickets__tip" id="scopeTip"></p>
    <div class="tickets__form" id="formHost"></div>
    <div class="tickets__ops" id="ops"></div>
    <div class="tickets__board" id="board"></div>
  </div>

  <script src="../src/core/kui-all.js" data-kui-profile="standalone"></script>
  <script>
    (function () {
      'use strict';
      var KUI = window.KUI || {};
      var frame = KUI.frame || null;

      function ready(fn) {
        if (frame && typeof frame.ready === 'function') {
          try { frame.ready(fn); return; } catch (e) { /* ignore */ }
        }
        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', fn); }
        else { fn(); }
      }

      /* 参数来源：标签页初始化下发的 params 与 location.search 合并后由 frame 暴露 */
      function readParams() {
        if (frame && typeof frame.getParams === 'function') {
          try { return frame.getParams() || {}; } catch (e) { /* ignore */ }
        }
        var out = {};
        String(location.search || '').replace(/^\?/, '').split('&').forEach(function (pair) {
          if (!pair) { return; }
          var kv = pair.split('=');
          out[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
        });
        return out;
      }

      var ROWS = [
        { id: 'T-1001', title: '登录页样式错位', owner: '刻刻帝', level: 'high', status: '处理中' },
        { id: 'T-1002', title: '导出接口超时', owner: '狂三', level: 'low', status: '待分派' },
        { id: 'T-1003', title: '标签页不刷新', owner: '琴里', level: 'high', status: '已解决' }
      ];

      ready(function () {
        var params = readParams();
        var scope = params.scope === 'all' ? 'all' : 'mine';
        document.getElementById('scopeTip').textContent =
          scope === 'all' ? '视图：全部工单（来自菜单「全部工单」）' : '视图：我的工单（来自菜单「我的工单」）';

        var form = KUI.form.create(document.getElementById('formHost'), {
          layout: { columns: 3, gap: 12, labelWidth: 72, labelPosition: 'left' },
          data: { keyword: '', level: '', desc: '' },
          nodes: [
            { id: 'keyword', type: 'input', label: '关键词', props: { placeholder: '编号或标题' } },
            { id: 'level', type: 'select', label: '优先级', options: [
              { label: '全部', value: '' }, { label: '高', value: 'high' }, { label: '低', value: 'low' }
            ] },
            { id: 'desc', type: 'textarea', label: '处理说明', span: 1, props: { rows: 2, maxLength: 100 } }
          ],
          onSubmit: function (data) {
            KUI.dialog.confirm({
              title: '确认提交',
              message: '关键词「' + (data.keyword || '空') + '」，优先级「' + (data.level || '全部') + '」。确定提交吗？'
            }).then(function (yes) {
              if (!yes) { KUI.toast.info('已取消'); return; }
              KUI.toast.success('已提交：' + (data.desc || '无说明'));
            });
          }
        });

        KUI.renderTree([
          { type: 'button', props: { text: '查询', variant: 'primary' },
            on: { click: function () {
              var res = form.validate();
              if (!res.valid) { KUI.toast.warning('请先检查表单'); return; }
              KUI.toast.success('查询完成：' + ROWS.length + ' 条');
            } } },
          { type: 'button', props: { text: '重置' },
            on: { click: function () { form.reset(); KUI.toast.info('已重置'); } } }
        ], document.getElementById('ops'));

        var rows = scope === 'all' ? ROWS : ROWS.slice(0, 2);
        KUI.renderTree([
          { type: 'table', props: {
              striped: true, hoverable: true, rowKey: 'id',
              columns: [
                { key: 'id', title: '编号', width: 96 },
                { key: 'title', title: '标题' },
                { key: 'owner', title: '负责人', width: 100 },
                { key: 'status', title: '状态', width: 100 }
              ],
              data: rows
          } }
        ], document.getElementById('board'));

        if (frame && typeof frame.setTitle === 'function') {
          try { frame.setTitle('工单处理 · ' + (scope === 'all' ? '全部' : '我的')); } catch (e) { /* ignore */ }
        }
      });
    })();
  </script>
</body>
</html>
```

### A5. 文件 3：`config/app.json` 的三处修改

**① 菜单**：把 `menu.props.items` 整体替换为下面 3 组 6 项（保留 `props` 其它字段不变）：

```json
[
  {
    "type": "group",
    "id": "g-work",
    "label": "工作台",
    "icon": "home",
    "children": [
      { "type": "item", "id": "home", "label": "首页", "icon": "home",
        "target": { "tab": { "id": "home", "title": "刻刻帝终端", "url": "pages/home.html", "icon": "clock", "pinned": true, "closable": false } } },
      { "type": "item", "id": "portal", "label": "业务门户", "icon": "grid",
        "target": { "tab": { "id": "portal", "title": "业务门户", "url": "pages/portal.html", "icon": "grid" } } }
    ]
  },
  {
    "type": "group",
    "id": "g-ticket",
    "label": "工单",
    "icon": "edit",
    "children": [
      { "type": "item", "id": "ticket-mine", "label": "我的工单", "icon": "user", "badge": "7", "badgeType": "danger",
        "target": { "tab": { "id": "ticket-mine", "title": "我的工单", "url": "pages/tickets.html", "icon": "user", "query": { "scope": "mine" } } } },
      { "type": "item", "id": "ticket-all", "label": "全部工单", "icon": "list",
        "target": { "tab": { "id": "ticket-all", "title": "全部工单", "url": "pages/tickets.html", "icon": "list", "query": { "scope": "all" } } } }
    ]
  },
  {
    "type": "group",
    "id": "g-lab",
    "label": "实验室",
    "icon": "cube",
    "children": [
      { "type": "item", "id": "theme-page", "label": "主题灵装", "icon": "palette",
        "target": { "tab": { "id": "theme-page", "title": "主题灵装", "url": "pages/theme.html", "icon": "palette" } } },
      { "type": "item", "id": "dialogs-page", "label": "弹窗与提醒", "icon": "message",
        "target": { "tab": { "id": "dialogs-page", "title": "弹窗与提醒", "url": "pages/dialogs.html", "icon": "message" } } }
    ]
  }
]
```

**② 标签页**：把 `tabs.props.initial` 换成只留业务门户（首页由 `home` 自动打开）：

```json
[
  { "id": "portal", "title": "业务门户", "url": "pages/portal.html", "icon": "grid" }
]
```

**③ 默认主题**：把 `theme.default` 从 `"kurumi"` 改为 `"abyss"`（6 个内置主题之一；自定义配色见 [09-theme.md](09-theme.md)）：

```json
{ "default": "abyss" }
```

### A6. 命令序列

```powershell
npm run build      # build:config 重建 config/bundle.js + build:all 重建 src/core/kui-all.js
npm start          # 启动静态服务（默认 127.0.0.1:8080，端口占用自动 +1）
```

浏览器打开控制台输出的地址。

### A7. 验证步骤

1. 首屏默认主题是 `abyss`（深色），标签栏只有「刻刻帝终端」与「业务门户」；
2. 左侧菜单 3 组 6 项，图标与徽标正常；点「业务门户」→ 新标签打开 `pages/portal.html`；
3. 门户页：3 张统计卡、1 张表格、「查看说明」弹出 `dialog.alert`、「刷新数据」出现 toast；
4. 点「我的工单」与「全部工单」→ 两个标签，标题不同、`scopeTip` 分别显示「我的/全部」，表格行数 2/3；
5. 工单页填「处理说明」点「提交」→ 弹确认框 → 确定后 toast「已提交」；取消则 toast「已取消」；
6. 面包屑：点菜单后应显示「工单 / 我的工单」这样的菜单路径（`app-shell` 用 `findMenuPath` 生成，见 `src/components/app-shell.js:300-330`）；
7. 刷新页面，标签与主题不丢（主题存 `localStorage['kui-theme']`，标签由外壳按 `initial` 重建）；
8. `?kui_debug=1` 打开诊断面板，点菜单时能按序看到标签页/iframe 消息。

### A8. 常见失败点（案例 A）

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 菜单项点了空白 | `target.tab.url` 写成相对 `pages/` 的路径 | 改回相对项目根：`pages/tickets.html` |
| 新页面 404 | 页面没保存到 `pages/` 或文件名大小写不一致 | 核对路径与文件名（Windows 本地不区分大小写，部署到 Linux 会挂） |
| 两个工单项打开同一标签 | 两个菜单项共用了同一个 `target.tab.id` | `id` 必须唯一（`ticket-mine` / `ticket-all`） |
| query 没生效 | 把 query 拼进了 `url` | 用 `target.tab.query`，由 tabs 统一拼接（`src/components/tabs.js` 的 `buildSrc`） |
| 主题仍是旧色 | 只改了 `theme.default` 没重新构建，或浏览器缓存了 `config/bundle.js` | `npm run build` + 硬刷新 |
| 弹窗不出现 | `dialog.js` 未在 profile 里（自己裁剪过度） | 回退 standalone/app profile，或按 13.3 检查清单 |

### A9. 部署

本项目是**纯静态站点**：`index.html` + `src/` + `config/` + `pages/` + `assets/` 直接托管即可，不需要 Node 运行时；`server.js` 只是本地预览与自动构建。把整个仓库目录（可排除 `node_modules`、`test`、`tools`、`docs`）上传到 Nginx / 对象存储 / 任意静态托管，访问根路径即可。注意 `/config/*.json` 是运行时可能被请求的资源，必须一起部署；子路径部署（如 `/console/`）时所有相对路径都成立。反向代理与缓存头配置见 [14-deploy.md](14-deploy.md)。

## 13.2 案例 B：把 KurumiUI 嵌进现有站点

### B1. 方案

不接管现有站点框架，只把 KurumiUI 的**一个组件页**放进 iframe：父站点用普通 `<iframe>` 引入 `embed/kui-form.html`，双方用自定义信封 `{ __kuiEmbed: true, dir, type, payload }` 通信。父页面收事件（就绪、表单变化、toast 请求、高度），发命令（切主题、塞数据、弹提示）。KurumiUI 侧不写父级角色，也不需要 `pages/*.html` 的 frame 协议。

### B2. 文件清单

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `embed/kui-form.html` | 新建 | 被嵌入的 KurumiUI 页（standalone profile + 桥接脚本） |
| `host.html` | 新建（放现有站点目录） | 父页面：iframe + 收事件 + 发命令 |
| `src/`、`config/bundle.js` | 随站点部署 | 子页依赖的框架资源 |

### B3. 文件 1：`embed/kui-form.html`

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <script src="../src/core/theme-boot.js"></script>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>KurumiUI 嵌入式表单</title>
  <link rel="stylesheet" href="../src/styles/base.css" />
  <link rel="stylesheet" href="../src/styles/controls.css" />
  <link rel="stylesheet" href="../src/styles/components.css" />
  <style>
    body { margin: 0; padding: 12px; background: var(--kui-bg-0, #131018); }
    .embed-hint { margin: 0 0 10px; font-size: 12px; color: var(--kui-text-2, #b9b1c4); }
  </style>
</head>
<body>
  <p class="embed-hint">KurumiUI · 嵌入式表单（受父页面控制主题与数据）</p>
  <div id="formHost"></div>

  <script src="../src/core/kui-all.js" data-kui-profile="standalone"></script>
  <script>
    (function () {
      'use strict';
      var KUI = window.KUI;
      /* 生产环境改成父站点精确 origin，例如 'https://admin.example.com' */
      var PARENT_ORIGIN = '*';

      function send(type, payload) {
        window.parent.postMessage({ __kuiEmbed: true, dir: 'to-parent', type: type, payload: payload || {} }, PARENT_ORIGIN);
      }

      var form = KUI.form.create(document.getElementById('formHost'), {
        layout: { columns: 1, gap: 10, labelWidth: 64, labelPosition: 'left' },
        data: { name: '', dept: '', note: '' },
        nodes: [
          { id: 'name', type: 'input', label: '姓名', required: true, rules: [{ required: true, message: '姓名必填' }] },
          { id: 'dept', type: 'select', label: '部门', options: [
            { label: '研发', value: 'rd' }, { label: '运营', value: 'op' }, { label: '财务', value: 'fin' }
          ] },
          { id: 'note', type: 'textarea', label: '备注', props: { rows: 2, maxLength: 120 } },
          { type: 'button', props: { text: '提交到父页面', variant: 'primary', block: true },
            on: { click: function () {
              var res = form.validate();
              if (!res.valid) { send('toast', { type: 'warning', message: '请先补全必填项' }); return; }
              send('submit', { data: res.data });
            } } }
        ],
        onChange: function () { send('height', { height: document.documentElement.scrollHeight }); }
      });

      /* subscribe 回调收到单个事件对象：{ type, id, value, prev, data, reason }（form.js:38392-38420） */
      form.subscribe(function (evt) {
        if (!evt || evt.type !== 'change') { return; }
        send('change', { data: evt.data, field: evt.id });
      });

      window.addEventListener('message', function (ev) {
        if (PARENT_ORIGIN !== '*' && ev.origin !== PARENT_ORIGIN) { return; }   // 来源校验
        var msg = ev.data;
        if (!msg || msg.__kuiEmbed !== true || msg.dir !== 'to-child') { return; }
        switch (msg.type) {
          case 'theme':
            if (KUI.theme && msg.payload && msg.payload.id) { KUI.theme.apply(msg.payload.id); }
            break;
          case 'set-data':
            form.setData(msg.payload || {});
            break;
          case 'toast':
            KUI.toast.show(msg.payload || {});
            break;
          case 'resize':
            send('height', { height: document.documentElement.scrollHeight });
            break;
        }
      });

      function announce() {
        send('ready', { version: KUI.version, height: document.documentElement.scrollHeight });
      }
      if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', announce); }
      else { announce(); }
      window.addEventListener('resize', function () { send('height', { height: document.documentElement.scrollHeight }); });
    })();
  </script>
</body>
</html>
```

### B4. 文件 2：`host.html`（现有站点里的一个页面）

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>现有站点 · 嵌入 KurumiUI 表单</title>
  <style>
    body { margin: 0; padding: 24px; font-family: system-ui, sans-serif; background: #f6f5f8; color: #2b2833; }
    .wrap { max-width: 980px; margin: 0 auto; display: grid; grid-template-columns: 1fr 360px; gap: 16px; }
    .panel { background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 6px 24px rgba(0,0,0,.07); }
    .panel h2 { margin: 0 0 10px; font-size: 15px; }
    #kuiFrame { width: 100%; border: 0; height: 380px; border-radius: 10px; background: #fff; }
    .log { font: 12px/1.6 ui-monospace, monospace; white-space: pre-wrap; margin: 0; }
    .ops { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
    .ops button { padding: 5px 10px; border-radius: 8px; border: 1px solid #d9d5e0; background: #fff; cursor: pointer; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="panel">
      <h2>KurumiUI 表单（iframe 嵌入）</h2>
      <!-- CHILD_ORIGIN 与 kui-form.html 同源；跨域部署时改成子页面的 origin -->
      <iframe id="kuiFrame" src="embed/kui-form.html" title="KurumiUI 表单"></iframe>
    </div>
    <div class="panel">
      <h2>父页面控制台</h2>
      <div class="ops">
        <button data-cmd="theme" data-id="kurumi">主题 kurumi</button>
        <button data-cmd="theme" data-id="abyss">主题 abyss</button>
        <button data-cmd="fill">填充示例数据</button>
        <button data-cmd="toast">让子页弹提示</button>
      </div>
      <pre class="log" id="log"></pre>
    </div>
  </div>

  <script>
    (function () {
      'use strict';
      var CHILD_ORIGIN = location.origin;   // 生产环境写死子页面 origin
      var frameEl = document.getElementById('kuiFrame');
      var logEl = document.getElementById('log');

      function log(text) {
        logEl.textContent = '[' + new Date().toLocaleTimeString() + '] ' + text + '\n' + logEl.textContent;
      }
      function sendToChild(type, payload) {
        if (!frameEl.contentWindow) { return; }
        frameEl.contentWindow.postMessage({ __kuiEmbed: true, dir: 'to-child', type: type, payload: payload || {} }, CHILD_ORIGIN);
      }

      window.addEventListener('message', function (ev) {
        if (ev.origin !== CHILD_ORIGIN) { return; }                 // 只收子页消息
        var msg = ev.data;
        if (!msg || msg.__kuiEmbed !== true || msg.dir !== 'to-parent') { return; }
        switch (msg.type) {
          case 'ready':
            log('子页就绪，KurumiUI ' + (msg.payload.version || '?'));
            sendToChild('theme', { id: 'kurumi' });                  // 父级统一决定主题
            break;
          case 'height':
            frameEl.style.height = Math.max(260, msg.payload.height) + 'px';
            break;
          case 'change':
            log('表单变化：' + (msg.payload.field || '-') + ' → ' + JSON.stringify(msg.payload.data));
            break;
          case 'submit':
            log('收到提交：' + JSON.stringify(msg.payload.data));
            break;
          case 'toast':
            log('子页请求提示：' + (msg.payload && msg.payload.message));
            break;
        }
      });

      document.querySelectorAll('.ops button').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var cmd = btn.getAttribute('data-cmd');
          if (cmd === 'theme') { sendToChild('theme', { id: btn.getAttribute('data-id') }); }
          else if (cmd === 'fill') { sendToChild('set-data', { name: '时崎狂三', dept: 'rd', note: '父页面注入' }); }
          else if (cmd === 'toast') { sendToChild('toast', { type: 'success', title: '来自父页面', message: '子页收到命令后弹的提示' }); }
        });
      });
    })();
  </script>
</body>
</html>
```

### B5. 样式隔离与自适应

- **隔离**：iframe 天然隔离 CSS 与 JS，父站点样式不会污染子页，子页也不会改父站；KurumiUI 的颜色全部来自 `--kui-*` 变量，父级只需发 `theme` 命令，不必复制 token。
- **去壳**：子页如果是仓库自带的 `standalone/*.html`，它已内置 `standalone/embedded.js`，被 iframe 嵌入时会自动隐藏演示导航与主题下拉、补「已嵌入」徽标（`standalone/embedded.js:10-77`），不要重复写这类逻辑。
- **高度**：子页在 `ready` 与表单变化时上报 `height`，父页设置 iframe 高度，避免双层滚动条。
- **滚动条**：父页给 iframe 设固定 `height` 时，子页内部 `body` 会自然滚动；若父页希望「一次只滚一层」，就必须用高度上报方案。

### B6. 版本升级注意

1. 子页 URL / iframe `src` 升级时带上版本参数，例如 `embed/kui-form.html?kui_v=1.4.1`，避免 304 缓存拿到旧 HTML；
2. `src/core/kui-all.js` 注入的子脚本**不带**版本参数，所以升级要同时清 CDN/浏览器缓存（或给 `src/` 配置 `Cache-Control: no-cache`）；
3. 桥接协议是自定义的，与 KurumiUI 的 `frame` 协议（`tab:init`/`frame:ready` 等，见 [11-api-messaging.md](11-api-messaging.md)）互不干扰；升级框架版本时只需回归本案例的 4 个事件与 4 个命令；
4. `KUI.version` 会随子页 `ready` 事件发给父页，父页可做「最低版本」断言，防止旧页面与新协议混跑。

### B7. 验证步骤

1. 启动本地服务，打开 `host.html`：右侧日志出现「子页就绪，KurumiUI 1.4.1」；
2. 父页点「主题 abyss」→ 子页整体变色；点「填充示例数据」→ 子页表单出现「时崎狂三」；
3. 子页改任一字段 → 父页日志出现 `表单变化：name → {...}`；
4. 子页点「提交到父页面」→ 父页日志出现 `收到提交`；
5. 打开 DevTools，确认跨域消息两个方向都校验了 `origin`（把 `CHILD_ORIGIN` 故意写错，消息应被丢弃）；
6. 改变窗口宽度，iframe 高度随笔填写高变化，无双滚动条。

### B8. 常见失败点（案例 B）

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 子页样式错乱 | 把子页搬离仓库层级，`../src/...` 相对路径失效 | 保持 `embed/` 与 `src/` 同级，或改成绝对路径 |
| 收不到消息 | `origin` 校验写死错，或父页在子页加载前就发命令 | 命令在 `ready` 回调里发；`postMessage` 的 targetOrigin 与校验值成对一致 |
| 主题没跟随 | 子页没加载 `theme-boot.js` 或父页发的 id 不存在 | 主题 id 必须在 6 个内置值内，或先 `KUI.theme.register` |
| iframe 出现双滚动条 | 父页固定了过小高度 | 用 `height` 事件设置高度 |
| `file://` 下失效 | 跨域 `location.origin` 为 `null` | 用本地服务预览，不要双击打开案例 B |
| 生产环境 XSS 风险 | `targetOrigin` 用了 `'*'` | 两侧都改成精确 origin，并继续校验 `ev.origin` |

## 13.3 案例 C：做一个离线单文件工具页

### C1. 方案

「单文件」指**入口只有一个 HTML**，其余是同级目录的框架资源（真正把 400KB+ 的 CSS/JS 全部内联不现实）。做法：裁一个只含「表单 + 弹窗 + 提醒 + 主题」的 profile，写一个自包含的 `tool.html`，`file://` 双击即可用，最后连目录一起压成 zip 分发。

### C2. 文件清单

| 文件 | 动作 | 说明 |
| --- | --- | --- |
| `config/kui-modules.json` | 新增 `profiles.tool` | 只留必要模块，不含菜单/导航/标签/应用外壳 |
| `src/core/kui-all.js` | 重新生成 | `npm run build:all` |
| `tool.html` | 新建（仓库根） | 入口页：地址生成器，可离线运行 |
| `dist/kurumi-tool.zip` | 构建产物 | `Compress-Archive` 打包分发 |

### C3. 文件 1：`config/kui-modules.json` 增加 profile

在 `profiles` 对象里追加一个 `tool`（不要动 `app` / `standalone`）：

```json
{
  "profiles": {
    "tool": {
      "desc": "离线工具页：表单 + 弹窗 + 提醒，不含菜单/导航/标签",
      "files": [
        "config/bundle.js",
        "src/core/kui.js",
        "src/core/tooltip.js",
        "src/core/diag.js",
        "src/core/icons.js",
        "src/core/registry.js",
        "src/core/config.js",
        "src/core/theme.js",
        "src/core/theme-art.js",
        "src/core/handlers.js",
        "src/core/dom-enhance.js",
        "src/components/controls/index.js",
        "src/components/form.js",
        "src/components/handlers/form.handlers.js",
        "src/components/dialog.js",
        "src/components/handlers/dialog.handlers.js",
        "src/components/toast.js",
        "src/components/handlers/toast.handlers.js"
      ]
    }
  }
}
```

### C4. 文件 2：`tool.html`（仓库根，双击即用）

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <script src="src/core/theme-boot.js"></script>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>KurumiUI · 离线工具页</title>
  <link rel="stylesheet" href="src/styles/base.css" />
  <link rel="stylesheet" href="src/styles/controls.css" />
  <link rel="stylesheet" href="src/styles/components.css" />
  <style>
    body { margin: 0; padding: 24px; background: var(--kui-bg-0, #131018); }
    .tool { max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
    .tool__title { margin: 0; font-size: 18px; color: var(--kui-text-1, #ece6ee); }
    .tool__desc { margin: 0; font-size: 12px; color: var(--kui-text-2, #b9b1c4); }
    .tool__box { padding: 14px; border: 1px solid var(--kui-border, #3a3444); border-radius: 12px;
      background: var(--kui-bg-1, #1a1721); display: flex; flex-direction: column; gap: 10px; }
    .tool__out { display: flex; gap: 8px; }
    .tool__out input { flex: 1; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--kui-border, #3a3444);
      background: var(--kui-bg-2, #23202b); color: var(--kui-text-1, #ece6ee); font: inherit; }
  </style>
</head>
<body>
  <div class="tool">
    <h1 class="tool__title">离线工具页</h1>
    <p class="tool__desc">file:// 直接打开 · profile = tool · 数据全部本地处理</p>
    <div class="tool__box">
      <div id="formHost"></div>
      <div class="tool__out">
        <input id="result" readonly placeholder="生成结果会出现在这里" />
        <button type="button" id="copyBtn">复制</button>
      </div>
    </div>
  </div>

  <script src="src/core/kui-all.js" data-kui-profile="tool"></script>
  <script>
    (function () {
      'use strict';
      var KUI = window.KUI;

      var form = KUI.form.create(document.getElementById('formHost'), {
        layout: { columns: 2, gap: 10, labelWidth: 76, labelPosition: 'left' },
        data: { host: '', token: '', path: '' },
        nodes: [
          { id: 'host', type: 'input', label: '接口地址', span: 2, required: true,
            props: { placeholder: 'https://api.example.com' },
            rules: [{ required: true, message: '接口地址必填' }] },
          { id: 'token', type: 'input', label: 'Token', span: 1, props: { placeholder: '可留空' } },
          { id: 'path', type: 'select', label: '路径', span: 1, options: [
            { label: '/v1/orders', value: '/v1/orders' },
            { label: '/v1/users', value: '/v1/users' },
            { label: '/v1/reports', value: '/v1/reports' }
          ] },
          { type: 'button', props: { text: '生成调试地址', variant: 'primary', block: true },
            on: { click: function () {
              var res = form.validate();
              if (!res.valid) {
                KUI.toast.warning(res.errors[Object.keys(res.errors)[0]] || '请检查表单');
                return;
              }
              var url = String(res.data.host || '').replace(/\/+$/, '') +
                (res.data.path || '/v1/orders') +
                (res.data.token ? '?token=' + encodeURIComponent(res.data.token) : '');
              document.getElementById('result').value = url;
              KUI.toast.success('已生成');
            } } }
        ]
      });

      document.getElementById('copyBtn').addEventListener('click', function () {
        var value = document.getElementById('result').value;
        if (!value) { KUI.toast.info('还没有结果可复制'); return; }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(value).then(function () { KUI.toast.success('已复制'); },
            function () { KUI.toast.warning('复制失败，请手动选择'); });
        } else {
          var input = document.getElementById('result');
          input.removeAttribute('readonly');
          input.select();
          document.execCommand('copy');
          input.setAttribute('readonly', 'readonly');
          KUI.toast.success('已复制');
        }
      });
    })();
  </script>
</body>
</html>
```

### C5. 命令序列

```powershell
npm run build:all                     # 重新生成 src/core/kui-all.js（含 tool profile）
Start-Process .\tool.html             # 或直接双击，file:// 打开验证
```

### C6. 验证步骤

1. 双击 `tool.html`：地址栏是 `file://`，页面正常渲染、无 404、无控制台报错；
2. 不填「接口地址」直接点生成 → 顶部 toast 警告「接口地址必填」；
3. 填完整后生成 → 结果框出现拼接地址，toast「已生成」；点「复制」→ 剪贴板内容一致；
4. 控制台执行 `KUI.registry.has('menu')` 应为 `false`（菜单模块不在 tool profile 里）、`KUI.registry.has('form')` 为 `true`；
5. 关闭再打开：主题（如 `?kuiTheme=abyss` 或页面内切换后）随 `localStorage` 保留；
6. `file://` 下 `fetch` 不可用，但页面不依赖它：配置来自构建产物 `config/bundle.js`，若删掉该文件，页面应降级为默认文案而不是白屏。

### C7. 打包与分发

```powershell
New-Item -ItemType Directory -Force dist | Out-Null
Compress-Archive -Path tool.html, src, config -DestinationPath dist\kurumi-tool.zip -Force
# 校验：解压到临时目录后双击 tool.html 应同样可用
Expand-Archive -Path dist\kurumi-tool.zip -DestinationPath $env:TEMP\kurumi-tool -Force
Start-Process "$env:TEMP\kurumi-tool\tool.html"
```

zip 里必须包含：`tool.html`、`src/`（含 `styles/`、`assets/`、全部脚本）、`config/bundle.js`。`config/app.json` 等 JSON 可一并带上（运行时后备读取），但离线场景真正生效的是 `bundle.js`。

### C8. 常见失败点（案例 C）

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 双击白屏、控制台报「未注册的元素类型」 | profile 漏了 `controls/index.js` 或对应组件文件 | 用附录清单对齐，`npm run build:all` 后看 `kui-all.js` 里的 files |
| `file://` 下页面无样式 | CSS 用了绝对路径 `/src/...` | 全部改相对路径 |
| 提示 `fetch` 失败 | 页面自行调用了 `KUI.config.load` 而没走 bundle | 离线页只读 `bundle.js`（`config.js` 优先读注入数据） |
| 主题不生效 | `theme-boot.js` 不是 head 里第一个脚本 | 保持它最先加载 |
| zip 解压后打不开 | 打包时漏了 `src/assets` 或目录层级多套了一层 | 解压到临时目录实测；确认 `tool.html` 与 `src/` 同级 |
| 想真正单文件 | 全部内联会超过 800KB 且难升级 | 不建议；需要单文件时只内联业务脚本，框架资源仍目录分发 |

## 常见错误与排查（三案例通用）

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 改了 `config/app.json` 页面没变 | 没重新 `npm run build` 或浏览器缓存 | 重建 + 硬刷新；确认 `config/bundle.js` 时间戳更新 |
| 菜单/标签页显示旧数据 | 页面还是旧 iframe，`keepAlive` 保活 | 关掉标签重新打开，或 `tab.refresh`（`tabs.props.keepAlive:false` 可全局关闭） |
| 新页面在 iframe 里高度很小 | 页面没有适配容器高度/滚动 | 页面用 `frame.heightAuto()` 或让内容自然滚动 |
| 主题切换后局部颜色没变 | 自建样式写死了颜色 | 全部改 `var(--kui-*, fallback)` |
| 离线页在 Chrome 无 `localStorage` 报错 | 某些浏览器对 `file://` 限制存储 | 用 try/catch 包裹（`theme-boot.js` 已处理），不影响主流程 |
| `npm start` 端口不是 8080 | 端口占用自动 +1 | 看控制台实际地址 |

## 本章自检

```powershell
# 1) 手册自检（JSON 可解析、类型/动作/链接/数量口径）
node tools/check-manual.js

# 2) 案例 A/B 的页面与资源是否存在
Test-Path pages/portal.html, pages/tickets.html, embed/kui-form.html, tool.html

# 3) 构建产物与 profile 清单是否一致
Select-String -Path src/core/kui-all.js -Pattern 'tool|standalone|app'

# 4) 全仓审计（一致性 + 组件拆装 + 冒烟）
npm run audit
npm run verify
```

预期：`check-manual` 无 error；4 个新增文件都存在；`kui-all.js` 里能搜到 `tool` profile；审计与冒烟全过。

## 参考源码

- `config/app.json:211-616`（menu items 结构）、`617-669`（menunav 面包屑）、`670-704`（tabs 与 initial）
- `src/components/app-shell.js:300-330`（菜单→面包屑→开标签）、`406-410`（openTab）、`456-470`（selectMenu）
- `src/components/tabs.js`（`buildSrc` 拼接 query 与 `kui_v`、`sendInit` 下发 `tab:init`）
- `src/components/form.js:430-445`（create 与默认 validateOn）、`1379-1396`（submit 流程）、`1421`（subscribe）
- `src/components/dialog.js:1126-1155`（alert/confirm/prompt/form/custom 静态 API）
- `src/components/toast.js:456-494`（toast 静态 API）
- `src/core/kui-all.js`（loader：`data-kui-profile`、profile 回退、`document.write` 注入）
- `tools/build-all.js:30-35`（缺文件报错）、`57-101`（生成 kui-all.js 与 profile 回退）
- `standalone/embedded.js:10-77`（被嵌入检测与去壳）
- `src/core/theme-boot.js`（首帧主题预置，防 FOUC）
- `src/core/config.js`（`bundle.js` 注入数据优先于运行时 fetch）

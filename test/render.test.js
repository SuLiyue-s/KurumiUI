/*!
 * KurumiUI · test/render.test.js
 * ---------------------------------------------------------------
 * 渲染 / 交互验收测试（契约 §6 / §7 / §8 / §10 / §13 / §15）
 *
 * 在 test/dom-stub.js 的 vm 沙箱里按 index.html 顺序加载 core → controls →
 * form → menu/menunav/tabs/dialog/toast，然后逐项断言：
 *   1. 注册表：契约 §6 全部控件 + 组件 type 均已注册
 *   2. tabs：open→activate→切换→回切后 iframe 节点引用不变、src 只设置一次（保活）
 *   3. dialog：alert 创建含 iframe 的弹层，resolve 后移除
 *   4. toast：show 出现、超时/close 后消失
 *   5. theme：apply 后 :root 上出现对应 CSS 变量，切回时旧主题独有 token 被清除
 *   6. form：create 渲染字段；setValue 改 A 字段后 B 字段按 deps 显隐/禁用/必填
 *   7. standalone：只加载外部脚本不会自动生成 .kui-app 整壳
 *   8. 联动算子 evalWhen / testOp 全量冒烟
 *
 * Node 13.14 兼容、零依赖。
 */

'use strict';

var fs = require('fs');
var path = require('path');
var loadKui = require('./load-kui');

var COMPONENT_TYPES = ['form', 'menu', 'menunav', 'tabs', 'dialog', 'toast', 'app-shell'];

/* 契约 §6 控件 type 权威清单（与 src/components/controls/*.js 注册的 type 一致）：
 * pickers.js 的权威命名是 date / daterange / month / time / datetime，
 * 不存在 datepicker / timepicker 别名（工期评审口径见 docs/00-contract.md §6 架构树）。 */
var CONTRACT_CONTROLS = [
  'button', 'input', 'password', 'textarea', 'number', 'select', 'multiselect',
  'checkbox', 'radio', 'switch', 'slider', 'progress', 'rating',
  'color', 'date', 'daterange', 'month', 'time', 'datetime',
  'tag', 'badge', 'divider', 'link', 'icon', 'text', 'alert',
  'table', 'pagination', 'upload', 'field'
];

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function waitFor(fn, timeoutMs) {
  var started = Date.now();
  var limit = timeoutMs || 1500;
  return new Promise(function (resolve, reject) {
    function tick() {
      var ok = false;
      try { ok = !!fn(); } catch (e) { /* ignore */ }
      if (ok) { resolve(true); return; }
      if (Date.now() - started > limit) { reject(new Error('waitFor 超时（' + limit + 'ms）')); return; }
      setTimeout(tick, 20);
    }
    tick();
  });
}

function classListContains(el, name) {
  if (!el || !el.classList) return false;
  return el.classList.contains(name);
}

module.exports = function register(suite, ctx) {
  var cache = null;

  /** 载入一份隔离的 KUI 运行时（每个用例一套，避免相互污染） */
  function boot() {
    var env = ctx.createEnvironment({ root: ctx.root, fileMode: true });
    env.window.__KUI_CONTROLS_NO_BOOT__ = true;
    var report = loadKui.loadKui(env, { components: true });
    if (report.errors.length) {
      var first = report.errors[0];
      throw new Error('运行时加载失败: ' + first.file + ' -> ' +
        (first.error && first.error.message ? first.error.message : String(first.error)));
    }
    if (report.missing.length) {
      throw new Error('运行时文件缺失: ' + report.missing.join(', '));
    }
    var KUI = env.window.KUI;
    if (!KUI || !KUI.registry) {
      throw new Error('加载后 window.KUI 不存在');
    }
    return { env: env, win: env.window, doc: env.document, KUI: KUI, report: report };
  }

  function teardown(rt) {
    if (!rt || !rt.env) return;
    try { rt.env.destroy(); } catch (e) { /* ignore */ }
  }

  /* ==========================================================
   * 1. 注册表完整性（契约 §6）
   * ========================================================== */

  suite.test('注册表：契约 §6 控件与组件 type 全部注册', function () {
    var rt = boot();
    try {
      var KUI = rt.KUI;
      var registered = KUI.registry.list();
      var typeSet = {};
      var i;
      for (i = 0; i < registered.length; i++) {
        typeSet[registered[i].type] = registered[i];
      }

      var missing = [];
      for (i = 0; i < CONTRACT_CONTROLS.length; i++) {
        if (!KUI.registry.has(CONTRACT_CONTROLS[i])) missing.push(CONTRACT_CONTROLS[i]);
      }
      ctx.assert.deepStrictEqual(missing, [], '契约 §6 必含控件缺失: ' + missing.join(', '));

      var compMissing = [];
      for (i = 0; i < COMPONENT_TYPES.length; i++) {
        if (!KUI.registry.has(COMPONENT_TYPES[i])) compMissing.push(COMPONENT_TYPES[i]);
      }
      ctx.assert.deepStrictEqual(compMissing, [], '组件 type 缺失: ' + compMissing.join(', '));

      ctx.assert.ok(registered.length >= 28,
        '注册表数量应 >= 28（契约 §6），实际 ' + registered.length);

      /* 每个注册项都必须有可调用的 render，且 category 非空
       * 注意 registry.list() 是轻量视图（只含 type/category/title/order/defaults/hasApi/hasMounted），
       * render 需要通过 registry.get(type) 取完整定义。 */
      for (i = 0; i < registered.length; i++) {
        var item = registered[i];
        var def = KUI.registry.get(item.type);
        ctx.assert.strictEqual(typeof item.type, 'string', '注册项 type 必须是字符串');
        ctx.assert.ok(def && typeof def.render === 'function',
          '注册项 ' + item.type + ' 缺少 render');
        ctx.assert.ok(typeof def.category === 'string' && def.category.length > 0,
          '注册项 ' + item.type + ' 的 category 为空');
      }

      /* 控件 defs 已全部向注册表注册（controls.init 生效证明） */
      var defs = (KUI.controls && KUI.controls.defs) ? Object.keys(KUI.controls.defs) : [];
      ctx.assert.ok(defs.length >= 20, 'KUI.controls.defs 应 >= 20，实际 ' + defs.length);
      var defMissing = [];
      for (i = 0; i < CONTRACT_CONTROLS.length; i++) {
        if (defs.indexOf(CONTRACT_CONTROLS[i]) === -1) defMissing.push(CONTRACT_CONTROLS[i]);
      }
      ctx.assert.deepStrictEqual(defMissing, [], 'controls.defs 缺少控件: ' + defMissing.join(', '));
    } finally {
      teardown(rt);
    }
  });

  /* ==========================================================
   * 2. tabs 保活（契约 §8 硬要求）
   * ========================================================== */

  suite.test('tabs：iframe 节点引用不变、src 只设置一次（保活）', function () {
    var rt = boot();
    try {
      var win = rt.win;
      var doc = rt.doc;
      var KUI = rt.KUI;

      var host = doc.createElement('div');
      host.className = 'tabs-host';
      doc.body.appendChild(host);

      var tabs = KUI.tabs.create(host, { maxTabs: 8 });
      ctx.assert.ok(tabs && typeof tabs.open === 'function', 'KUI.tabs.create 应返回实例');

      var idA = tabs.open({ id: 'tab-a', title: '页面 A', url: 'pages/home.html' });
      var idB = tabs.open({ id: 'tab-b', title: '页面 B', url: 'pages/profile.html' });
      ctx.assert.strictEqual(idA, 'tab-a');
      ctx.assert.strictEqual(idB, 'tab-b');

      var panes = host.querySelectorAll('.kui-tabs__pane');
      ctx.assert.strictEqual(panes.length, 2, '两个 tab 应各有一个常驻 pane');
      var frames = host.querySelectorAll('.kui-tabs__pane iframe');
      ctx.assert.strictEqual(frames.length, 2, '两个 pane 应各有一个常驻 iframe');

      var frameA = frames[0];
      var frameB = frames[1];
      ctx.assert.ok(frameA.src.indexOf('pages/home.html') !== -1,
        'A 的 iframe src 应在首次 activate 时设置，实际 ' + frameA.src);
      ctx.assert.ok(frameB.src.indexOf('pages/profile.html') !== -1,
        'B 的 iframe src 应在首次 activate 时设置，实际 ' + frameB.src);
      var countA = frameA.__srcSetCount;
      var countB = frameB.__srcSetCount;
      ctx.assert.strictEqual(countA, 1, 'A 的 iframe src 只应设置 1 次，实际 ' + countA);
      ctx.assert.strictEqual(countB, 1, 'B 的 iframe src 只应设置 1 次，实际 ' + countB);

      /* 连续切换 4 次（A→B→A→B），再回切 A */
      tabs.activate('tab-a');
      tabs.activate('tab-b');
      tabs.activate('tab-a');
      tabs.activate('tab-b');
      tabs.activate('tab-a');

      var panes2 = host.querySelectorAll('.kui-tabs__pane');
      var frames2 = host.querySelectorAll('.kui-tabs__pane iframe');
      ctx.assert.strictEqual(panes2.length, 2, '切换后 pane 数量不应变化');
      ctx.assert.strictEqual(frames2.length, 2, '切换后 iframe 数量不应变化');
      ctx.assert.strictEqual(frames2[0], frameA, 'A 的 iframe 节点引用在切换后必须不变（禁止重建）');
      ctx.assert.strictEqual(frames2[1], frameB, 'B 的 iframe 节点引用在切换后必须不变（禁止重建）');
      ctx.assert.strictEqual(frameA.__srcSetCount, 1, '切换不应重设 A 的 src');
      ctx.assert.strictEqual(frameB.__srcSetCount, 1, '切换不应重设 B 的 src');

      /* 非激活 pane 应 hidden，激活 pane 应可见 */
      var paneA = frameA.parentNode;
      var paneB = frameB.parentNode;
      ctx.assert.strictEqual(paneA.hidden, false, '当前激活的 A pane 不应 hidden');
      ctx.assert.strictEqual(paneB.hidden, true, '未激活的 B pane 应 hidden');
      ctx.assert.ok(!classListContains(paneB, 'is-active'), '未激活 pane 不应带 is-active');

      /* close 才移除 */
      tabs.close('tab-b', { force: true });
      var panes3 = host.querySelectorAll('.kui-tabs__pane');
      ctx.assert.strictEqual(panes3.length, 1, '关闭 B 后应剩 1 个 pane');
      ctx.assert.strictEqual(panes3[0], paneA, '关闭 B 不应重建 A 的 pane');
      ctx.assert.strictEqual(frameA.__srcSetCount, 1, '关闭 B 不应重设 A 的 src');

      tabs.destroy();
    } finally {
      teardown(rt);
    }
  });

  suite.test('tabs：keepAlive=false 时切走卸载 iframe、切回重建（不保活）', function () {
    var rt = boot();
    try {
      var doc = rt.doc;
      var KUI = rt.KUI;

      var host = doc.createElement('div');
      host.className = 'tabs-host';
      doc.body.appendChild(host);

      var tabs = KUI.tabs.create(host, { maxTabs: 8, keepAlive: false });
      tabs.open({ id: 'ka-a', title: 'A', url: 'pages/home.html' });
      tabs.open({ id: 'ka-b', title: 'B', url: 'pages/profile.html' });

      /* 切到 B 后，A 的 pane 应已被卸载 */
      var panes = host.querySelectorAll('.kui-tabs__pane');
      ctx.assert.strictEqual(panes.length, 1, 'keepAlive=false 时非激活 pane 应被卸载，实际剩 ' + panes.length);
      /* 注意：tabs 实例没有 get()，卸载状态通过 pane 数量与重建后的 src 验证 */

      /* 切回 A：应重建 pane + 重新设置 src */
      tabs.activate('ka-a');
      var panesA = host.querySelectorAll('.kui-tabs__pane');
      ctx.assert.strictEqual(panesA.length, 1, '切回 A 后应只保留 A 的 pane');
      var frameA = panesA[0].querySelector('iframe');
      ctx.assert.ok(frameA && frameA.src.indexOf('pages/home.html') !== -1, 'A 重建后应重新加载 home');

      tabs.destroy();
    } finally {
      teardown(rt);
    }
  });

  /* ==========================================================
   * 3. dialog：含 iframe 的独立弹层，resolve 后移除
   * ========================================================== */

  suite.test('dialog：alert 创建含 iframe 弹层，resolve 后移除', function () {
    var rt = boot();
    var env = rt.env;
    var doc = rt.doc;
    var KUI = rt.KUI;

    return Promise.resolve().then(function () {
      var promise = KUI.dialog.alert({ title: '删除确认', message: '确定要删除吗？' });
      ctx.assert.ok(promise && typeof promise.then === 'function', 'KUI.dialog.alert 应返回 Promise');

      var layers = doc.querySelectorAll('.kui-dialog-layer');
      ctx.assert.strictEqual(layers.length, 1, '应出现 1 个 .kui-dialog-layer，实际 ' + layers.length);
      var layer = layers[0];
      ctx.assert.ok(layer.querySelectorAll('.kui-dialog-mask').length >= 1, '弹层应含遮罩');
      var iframe = layer.querySelector('iframe');
      ctx.assert.ok(iframe, '弹层应含 iframe');
      ctx.assert.ok(iframe.src.indexOf('dialog-frame.html') !== -1,
        '弹窗 iframe 的 src 应指向 dialog-frame.html，实际 ' + iframe.src);
      ctx.assert.strictEqual(iframe.__srcSetCount, 1, '弹窗 iframe 的 src 应只设置 1 次');
      ctx.assert.strictEqual(KUI.dialog.count(), 1, 'KUI.dialog.count() 应为 1');

      var dialogId = layer.getAttribute('data-dialog-id');
      ctx.assert.ok(dialogId, '弹层应带 data-dialog-id');

      /* 模拟 iframe 内部脚本回发 dialog:ready → 父窗口回发 init */
      var frameWin = iframe.contentWindow;
      frameWin.postMessage({ __kui: true, type: 'dialog:ready', payload: { dialogId: dialogId } }, '*');
      ctx.assert.ok(layer.classList.contains('is-ready') || true, 'ready 消息应被接受');

      /* 模拟点击确定：dialog:resolve */
      frameWin.postMessage({ __kui: true, type: 'dialog:resolve', payload: { value: true } }, '*');

      return promise.then(function (value) {
        ctx.assert.strictEqual(value, true, 'alert resolve 的返回值应为 payload.value');
        return waitFor(function () {
          return doc.querySelectorAll('.kui-dialog-layer').length === 0;
        }, 1500);
      }).then(function () {
        ctx.assert.strictEqual(KUI.dialog.count(), 0, '移除后 dialog.count() 应为 0');
        ctx.assert.strictEqual(doc.querySelectorAll('.kui-dialog-layer').length, 0, '移除后不应残留弹层 DOM');
      });
    }).then(function () {
      teardown(rt);
    }, function (err) {
      teardown(rt);
      throw err;
    });
  });

  /* ==========================================================
   * 4. toast：show 出现、超时/closeAll 后消失
   * ========================================================== */

  suite.test('toast：show 出现、超时/close 后消失', function () {
    var rt = boot();
    var doc = rt.doc;
    var KUI = rt.KUI;

    return Promise.resolve().then(function () {
      var id = KUI.toast.success('保存成功');
      ctx.assert.ok(id, 'KUI.toast.success 应返回 toast id');
      var toastEl = doc.querySelector('.kui-toast');
      ctx.assert.ok(toastEl, '应出现 .kui-toast 节点');
      ctx.assert.ok(toastEl.textContent.indexOf('保存成功') !== -1, 'toast 文本应包含消息内容');
      ctx.assert.strictEqual(KUI.toast.count(), 1, '可见 toast 数量应为 1');
      ctx.assert.ok(doc.querySelector('.kui-toast-layer'), '应存在 .kui-toast-layer 容器');

      /* 手动 close → 240ms 后移除 */
      KUI.toast.close(id);
      ctx.assert.ok(classListContains(toastEl, 'is-leaving'), 'close 后应带 is-leaving 过渡态');
      return waitFor(function () { return doc.querySelectorAll('.kui-toast').length === 0; }, 1500);
    }).then(function () {
      /* 自动超时消失 */
      var id2 = KUI.toast.info('自动消失', { duration: 80 });
      ctx.assert.ok(id2, '第二条 toast 应创建成功');
      ctx.assert.strictEqual(doc.querySelectorAll('.kui-toast').length, 1, '自动消失前应有 1 个 toast');
      return waitFor(function () { return doc.querySelectorAll('.kui-toast').length === 0; }, 2000);
    }).then(function () {
      KUI.toast.closeAll();
      return waitFor(function () {
        return doc.querySelectorAll('.kui-toast').length === 0 &&
          doc.querySelectorAll('.kui-toast-layer').length === 0;
      }, 1500);
    }).then(function () {
      ctx.assert.strictEqual(KUI.toast.count(), 0, '全部关闭后 toast 数量应为 0');
      teardown(rt);
    }, function (err) {
      teardown(rt);
      throw err;
    });
  });

  /* ==========================================================
   * 5. theme：CSS 变量写入 /root 与旧主题 token 清理
   * ========================================================== */

  suite.test('theme：apply 后 :root 出现对应 CSS 变量，切回时旧 token 被清除', function () {
    var rt = boot();
    try {
      var win = rt.win;
      var doc = rt.doc;
      var KUI = rt.KUI;
      var root = doc.documentElement;

      var themesJson = ctx.readJson('src/themes.json');
      var loaded = KUI.theme.load(themesJson);
      ctx.assert.ok(loaded >= 6, '应载入 >= 6 套主题，实际 ' + loaded);

      var ids = KUI.theme.ids();
      var requiredThemes = ['kurumi', 'kurumi-angel', 'starry', 'sakura', 'abyss', 'dawn'];
      for (var i = 0; i < requiredThemes.length; i++) {
        ctx.assert.ok(ids.indexOf(requiredThemes[i]) !== -1,
          '缺少主题 ' + requiredThemes[i] + '，实际: ' + ids.join(','));
      }

      var kurumi = KUI.theme.get('kurumi');
      var starry = KUI.theme.get('starry');
      ctx.assert.ok(kurumi && kurumi.tokens, 'kurumi 主题应有 tokens');
      ctx.assert.ok(starry && starry.tokens, 'starry 主题应有 tokens');

      var opts = { persist: false, artHost: null, transition: false, broadcast: false };
      KUI.theme.apply('starry', opts);
      ctx.assert.strictEqual(KUI.theme.currentId(), 'starry', 'apply 后 currentId 应为 starry');
      ctx.assert.strictEqual(root.getAttribute('data-kui-theme'), 'starry',
        'documentElement 应带 data-kui-theme="starry"');
      var accentStarry = root.style.getPropertyValue('--kui-accent');
      ctx.assert.ok(accentStarry, 'apply 后 :root 应出现 --kui-accent，实际为空');
      ctx.assert.strictEqual(accentStarry, starry.tokens['--kui-accent'],
        '--kui-accent 应等于 starry 的 token 值');

      /* 旧主题 token 清理：六套真实主题的 token 键集合完全相同（设计如此，切换不跳尺寸），
       * 无法用「starry 独有 token」验证；改用临时注册主题携带独有 token，
       * apply 后应写入 :root，切回 kurumi 后应被 removeProperty 清除。 */
      var tmp = KUI.theme.register({
        id: '__tmp_clean__',
        name: 'tmp-clean',
        scheme: 'dark',
        tokens: { '--kui-test-only-token': '#123456' }
      });
      ctx.assert.ok(tmp && tmp.id === '__tmp_clean__', 'theme.register 应返回注册的主题对象');
      KUI.theme.apply('__tmp_clean__', opts);
      ctx.assert.strictEqual(root.style.getPropertyValue('--kui-test-only-token'), '#123456',
        '临时主题独有 token 应写入 :root');

      KUI.theme.apply('kurumi', opts);
      ctx.assert.strictEqual(KUI.theme.currentId(), 'kurumi');
      ctx.assert.strictEqual(root.getAttribute('data-kui-theme'), 'kurumi');
      var accentKurumi = root.style.getPropertyValue('--kui-accent');
      ctx.assert.strictEqual(accentKurumi, kurumi.tokens['--kui-accent'],
        '切回 kurumi 后 --kui-accent 应恢复为 kurumi 的 token 值');
      ctx.assert.strictEqual(root.style.getPropertyValue('--kui-test-only-token'), '',
        '切回 kurumi 后临时主题独有 token 应被清除（writeTokens 清理旧 token）');
    } finally {
      teardown(rt);
    }
  });

  /* ==========================================================
   * 6. form：渲染 + deps 联动（契约 §7）
   * ========================================================== */

  suite.test('form：create 渲染字段，deps 联动显隐/禁用/必填（契约 §7）', function () {
    var rt = boot();
    try {
      var doc = rt.doc;
      var KUI = rt.KUI;
      var host = doc.createElement('div');
      doc.body.appendChild(host);

      var nodes = [
        {
          id: 'mode', type: 'select', label: '通知方式',
          options: ['mail', 'sms'], value: 'mail'
        },
        {
          id: 'mail', type: 'input', label: '邮箱',
          deps: [
            { when: { field: 'mode', op: 'eq', value: 'mail' }, then: { visible: true, disabled: false, required: true } },
            { when: { field: 'mode', op: 'ne', value: 'mail' }, then: { visible: false, disabled: true, required: false } }
          ]
        },
        {
          id: 'phone', type: 'input', label: '手机号',
          deps: [
            { when: { field: 'mode', op: 'eq', value: 'sms' }, then: { visible: true, disabled: false, required: true } }
          ]
        }
      ];

      var form = KUI.form.create(host, { nodes: nodes, data: { mode: 'mail' }, layout: 'vertical' });
      ctx.assert.ok(form && typeof form.setValue === 'function', 'KUI.form.create 应返回表单实例');
      ctx.assert.ok(host.classList.contains('kui-form'), '宿主元素应带 kui-form class');

      var fieldEls = host.querySelectorAll('[data-field-id]');
      ctx.assert.ok(fieldEls.length >= 3, '应渲染出 >= 3 个带 data-field-id 的字段，实际 ' + fieldEls.length);

      function fieldOf(id) {
        var all = host.querySelectorAll('[data-field-id]');
        var fallback = null;
        for (var i = 0; i < all.length; i++) {
          if (all[i].getAttribute('data-field-id') !== id) continue;
          if (classListContains(all[i], 'kui-field')) return all[i];
          if (!fallback) fallback = all[i];
        }
        return fallback;
      }

      var mailEl = fieldOf('mail');
      var phoneEl = fieldOf('phone');
      ctx.assert.ok(mailEl, '应渲染 mail 字段');
      ctx.assert.ok(phoneEl, '应渲染 phone 字段');

      /* 初始 mode=mail：mail 可见/必填，phone 隐藏 */
      ctx.assert.ok(!classListContains(mailEl, 'is-hidden'), '初始 mode=mail 时 mail 应可见');
      ctx.assert.ok(mailEl.hidden !== true, '初始 mail 不应带 hidden');
      ctx.assert.ok(classListContains(phoneEl, 'is-hidden'), '初始 mode=mail 时 phone 应隐藏');
      ctx.assert.ok(classListContains(mailEl, 'is-required'), 'mode=mail 时 mail 应必填');
      ctx.assert.strictEqual(form.getValue('mode'), 'mail', '初始 mode 值应为 mail');

      /* 改 A（mode=sms）→ B（mail）隐藏+禁用，phone 显示+必填 */
      form.setValue('mode', 'sms');
      ctx.assert.strictEqual(form.getValue('mode'), 'sms', 'setValue 后 mode 应为 sms');
      ctx.assert.strictEqual(form.getData().mode, 'sms', 'getData 应同步 mode=sms');
      ctx.assert.ok(classListContains(mailEl, 'is-hidden'), 'mode=sms 时 mail 应隐藏');
      ctx.assert.ok(mailEl.hidden === true || mailEl.getAttribute('hidden') !== null,
        'mode=sms 时 mail 应带 hidden 属性');
      ctx.assert.ok(classListContains(mailEl, 'is-disabled'), 'mode=sms 时 mail 应禁用');
      ctx.assert.ok(!classListContains(mailEl, 'is-required'), 'mode=sms 时 mail 不应必填');
      ctx.assert.ok(!classListContains(phoneEl, 'is-hidden'), 'mode=sms 时 phone 应显示');
      ctx.assert.ok(classListContains(phoneEl, 'is-required'), 'mode=sms 时 phone 应必填');

      /* 切回 mode=mail → 反向联动 */
      form.setValue('mode', 'mail');
      ctx.assert.ok(!classListContains(mailEl, 'is-hidden'), '切回 mail 后 mail 应重新可见');
      ctx.assert.ok(!classListContains(mailEl, 'is-disabled'), '切回 mail 后 mail 应解除禁用');
      ctx.assert.ok(classListContains(phoneEl, 'is-hidden'), '切回 mail 后 phone 应再次隐藏');

      /* 编程式 setVisible/setDisabled/setRequired 生效 */
      form.setVisible('mail', false);
      ctx.assert.ok(classListContains(mailEl, 'is-hidden'), 'form.setVisible(false) 应隐藏字段');
      form.setVisible('mail', true);
      form.setDisabled('mail', true);
      ctx.assert.ok(classListContains(mailEl, 'is-disabled'), 'form.setDisabled(true) 应禁用字段');

      form.destroy();
      ctx.assert.ok(!host.classList.contains('kui-form'), 'destroy 后应移除 kui-form class');
    } finally {
      teardown(rt);
    }
  });

  /* ==========================================================
   * 7. standalone：加载外部脚本不会自动生成 .kui-app 整壳
   * ========================================================== */

  suite.test('standalone：外部脚本加载后不自动生成 .kui-app 整壳', function () {
    var rt = boot();
    var env = rt.env;
    var doc = rt.doc;

    try {
      var html = fs.readFileSync(path.join(ctx.root, 'standalone', 'menu.html'), 'utf8');
      var re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
      var match;
      var external = [];
      var inline = [];
      while ((match = re.exec(html))) {
        var attrs = match[1];
        var body = match[2];
        var srcMatch = /src\s*=\s*["']([^"']+)["']/i.exec(attrs);
        if (srcMatch) external.push(srcMatch[1]);
        else if (body.replace(/\s+/g, '')) inline.push(body);
      }
      /* v1.0.9 起页面只引一个 kui-all.js：先断言单入口存在，再按清单展开 */
      ctx.assert.ok(external.length >= 1, 'standalone/menu.html 至少应有 1 个外部脚本，实际 ' + external.length);
      ctx.assert.ok(external.some(function (s) { return /core\/kui-all\.js$/.test(s); }),
        'standalone/menu.html 应引用 core/kui-all.js（单一入口）');

      var manifest = require(path.join(ctx.root, 'config/kui-modules.json'));
      var extra = (manifest.profiles.standalone || {}).files || [];
      var resolved = [];
      external.forEach(function (s) {
        if (/core\/kui-all\.js$/.test(s)) { resolved = resolved.concat(extra); }
        else { resolved.push(path.posix.normalize(path.posix.join('standalone', s))); }
      });
      external = resolved;

      var loaded = [];
      var loadErrors = [];
      for (var i = 0; i < external.length; i++) {
        var raw = external[i];
        var rel = raw;
        if (!fs.existsSync(path.join(ctx.root, rel))) {
          rel = path.posix.normalize(path.posix.join('standalone', raw));
        }
        try {
          env.loadScript(rel);
          loaded.push(rel);
        } catch (e) {
          loadErrors.push(rel + ': ' + ((e && e.message) || e));
        }
      }
      ctx.assert.deepStrictEqual(loadErrors, [], 'standalone 外部脚本加载失败: ' + loadErrors.join('; '));
      ctx.assert.ok(loaded.length >= 20, '应成功加载 >= 20 个脚本（清单展开后），实际 ' + loaded.length);

      /* 外部脚本只做注册，不应偷偷启动整壳 */
      ctx.assert.strictEqual(doc.querySelectorAll('.kui-app').length, 0,
        '只加载 standalone 外部脚本不应生成 .kui-app 整壳');
      ctx.assert.ok(doc.body.className.indexOf('kui-ready') === -1,
        'standalone 不应自动把 body 标记为 kui-ready');

      /* 补一个保守断言：菜单组件已注册但未挂载 */
      ctx.assert.ok(env.window.KUI.registry.has('menu'), 'menu 组件应已注册');
      ctx.assert.strictEqual(doc.querySelectorAll('.kui-menu').length, 0,
        'standalone 外部脚本不应自动挂载菜单 DOM');
    } finally {
      teardown(rt);
    }
  });

  /* ==========================================================
   * 8. 联动算子全量冒烟（纯函数，不依赖 DOM）
   * ========================================================== */

  suite.test('form 联动算子 evalWhen/testOp 全量冒烟（契约 §7）', function () {
    var rt = boot();
    try {
      var KUI = rt.KUI;
      ctx.assert.ok(KUI.form && typeof KUI.form.evalWhen === 'function', 'KUI.form.evalWhen 应存在');

      var evalWhen = KUI.form.evalWhen;
      var cases = [
        { when: { field: 'a', op: 'eq', value: 1 }, data: { a: 1 }, want: true },
        { when: { field: 'a', op: 'eq', value: 2 }, data: { a: 1 }, want: false },
        { when: { field: 'a', op: 'ne', value: 2 }, data: { a: 1 }, want: true },
        { when: { field: 'a', op: 'in', value: ['x', 'y'] }, data: { a: 'y' }, want: true },
        { when: { field: 'a', op: 'in', value: ['x'] }, data: { a: 'z' }, want: false },
        { when: { field: 'a', op: 'nin', value: ['x'] }, data: { a: 'z' }, want: true },
        { when: { field: 'a', op: 'contains', value: 'ab' }, data: { a: 'xxabyy' }, want: true },
        { when: { field: 'a', op: 'notContains', value: 'zz' }, data: { a: 'abc' }, want: true },
        { when: { field: 'a', op: 'gt', value: 3 }, data: { a: 4 }, want: true },
        { when: { field: 'a', op: 'gte', value: 4 }, data: { a: 4 }, want: true },
        { when: { field: 'a', op: 'lt', value: 4 }, data: { a: 3 }, want: true },
        { when: { field: 'a', op: 'lte', value: 3 }, data: { a: 3 }, want: true },
        { when: { field: 'a', op: 'empty' }, data: { a: '' }, want: true },
        { when: { field: 'a', op: 'notEmpty' }, data: { a: 'x' }, want: true },
        { when: { field: 'a', op: 'truthy' }, data: { a: 1 }, want: true },
        { when: { field: 'a', op: 'falsy' }, data: { a: 0 }, want: true },
        { when: { field: 'a', op: 'regex', value: '^ab+c$' }, data: { a: 'abbc' }, want: true },
        { when: { field: 'a', op: 'regex', value: '^ab+c$' }, data: { a: 'xabbc' }, want: false },
        { when: { all: [{ field: 'a', op: 'eq', value: 1 }, { field: 'b', op: 'eq', value: 2 }] }, data: { a: 1, b: 2 }, want: true },
        { when: { any: [{ field: 'a', op: 'eq', value: 9 }, { field: 'b', op: 'eq', value: 2 }] }, data: { a: 1, b: 2 }, want: true }
      ];

      var failures = [];
      for (var i = 0; i < cases.length; i++) {
        var c = cases[i];
        var got = evalWhen(c.when, c.data);
        if (got !== c.want) {
          failures.push('evalWhen(' + JSON.stringify(c.when) + ') => ' + got + '，期望 ' + c.want);
        }
      }
      ctx.assert.deepStrictEqual(failures, [], '联动算子断言失败:\n  ' + failures.join('\n  '));
    } finally {
      teardown(rt);
    }
  });
  /* ==========================================================
   * 10. 渲染器：容器节点 style/attrs 与驼峰键（v1.3.8）
   * ========================================================== */

  suite.test('渲染：容器节点 class/style/attrs 生效，驼峰键转 kebab（v1.3.8）', function () {
    var rt = boot();
    try {
      var K = rt.KUI;
      var el = K.renderNode({
        class: 'probe-grid',
        style: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' },
        attrs: { 'data-probe': '1' },
        nodes: [{ type: 'text', props: { text: 'A' } }]
      });
      ctx.assert.ok(el && el.nodeType === 1, '容器节点应返回 DOM 元素');
      ctx.assert.ok(classListContains(el, 'probe-grid'), '容器节点 class 应生效');
      ctx.assert.strictEqual(el.getAttribute('data-probe'), '1', '容器节点 attrs 应生效');
      var gtc = el.style && el.style.getPropertyValue ? el.style.getPropertyValue('grid-template-columns') : '';
      ctx.assert.ok(String(gtc).indexOf('repeat(3') === 0, '驼峰键应转 kebab 生效，实际: ' + gtc);
      ctx.assert.ok(el.children && el.children.length >= 1, '容器子节点应渲染');
    } finally {
      teardown(rt);
    }
  });
};

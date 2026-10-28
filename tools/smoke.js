#!/usr/bin/env node
/*!
 * KurumiUI · 集成冒烟（零依赖，兼容 Node 13.14）
 * -----------------------------------------------------------------------------
 * 用 test/dom-stub.js 提供的极简 DOM 环境，按 index.html 的真实脚本顺序加载框架，
 * 然后跑一遍「整页启动 + 菜单 → 标签 → iframe 保活 → 弹窗 → 提醒 → 主题」链路，
 * 输出中文报告。这是 Lead 的集成自检，比单元测试更接近真实浏览器行为。
 *
 * 用法：
 *   node tools/smoke.js            # 跑全部检查
 *   node tools/smoke.js --verbose  # 打印详细信息
 */

'use strict';

var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');

var stub = require(path.join(ROOT, 'test', 'dom-stub.js'));

var VERBOSE = process.argv.indexOf('--verbose') !== -1;

/* ---------------- v1.3.6：分节过滤（--only=list / --only=13,17） ----------------
 * 说明：smoke 的分节之间存在 Promise 链与共享 env，直接「跳过整节执行」会破坏初始化，
 * 因此 --only 作用于「断言级别」：未选中的分节仍会完成初始化，只是不输出/不统计其断言。
 */
var ONLY = [];
(function () {
  process.argv.slice(2).forEach(function (arg) {
    var m = /^--only=(.+)$/.exec(arg);
    if (m) {
      ONLY = m[1].split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    }
  });
})();
var currentSection = null;
var skippedChecks = 0;

function sectionList() {
  var out = [];
  var src = fs.readFileSync(__filename, 'utf8');
  var re = /console\.log\('\\n\[(\d+)\]\s*([^']*)'\)/g;
  var m;
  while ((m = re.exec(src))) out.push({ id: m[1], title: m[2] });
  return out;
}

if (ONLY.indexOf('list') >= 0) {
  console.log('KurumiUI 冒烟分节清单：');
  sectionList().forEach(function (s) { console.log('  [' + s.id + '] ' + s.title); });
  console.log('\n用法：node tools/smoke.js --only=list                  列出分节');
  console.log('      node tools/smoke.js --only=13,17               只执行指定分节的断言');
  console.log('      node tools/smoke.js --only=13,17 --verbose     同上并打印堆栈');
  console.log('说明：--only 只过滤断言（初始化仍完整执行，保证依赖齐全）。');
  process.exit(0);
}

var pass = 0;
var fail = 0;
var failures = [];

function ok(name, extra) {
  pass++;
  console.log('  ✔ ' + name + (extra ? '  ' + extra : ''));
}
function bad(name, err) {
  fail++;
  failures.push(name + ' → ' + (err && err.message ? err.message : err));
  console.log('  ✘ ' + name + '  ' + (err && err.message ? err.message : err));
  if (VERBOSE && err && err.stack) console.log(err.stack);
}
function check(name, fn) {
  if (ONLY.length && currentSection !== null && ONLY.indexOf(String(currentSection)) === -1) {
    skippedChecks++;
    return;
  }
  try {
    var r = fn();
    ok(name, typeof r === 'string' ? r : '');
  } catch (e) {
    bad(name, e);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || '断言失败');
}
function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

/* kui-all 单一入口清单（浏览器与测试共用同一份事实） */
var manifestFiles = (require('../src/core/kui-all.js').profiles.app || {}).files || [];
var manifestStandalone = (require('../src/core/kui-all.js').profiles.standalone || {}).files || [];

/* --------------------------------------------------- 从 index.html 提取脚本顺序 */

function readScriptOrder() {
  /* v1.0.9 起页面只引 kui-all.js：真实加载顺序改由「单一入口清单」提供，
     * 浏览器端 kui-all.js 用 document.write 注入同一份清单，测试端直接 require 它。 */
  var manifest = require('../src/core/kui-all.js');
  var files = (manifest.profiles.app && manifest.profiles.app.files) || [];
  var order = ['src/core/theme-boot.js'].concat(files);
  return order;
}

/* ------------------------------------------------------------------ 主流程 */

function main() {
  console.log('\n=== KurumiUI 集成冒烟 ===\n');

  var order = readScriptOrder();
  console.log('脚本顺序（来自 index.html，共 ' + order.length + ' 个）:');
  order.forEach(function (s, i) { console.log('  ' + (i + 1) + '. ' + s); });

  var env = stub.createEnvironment({ root: ROOT, fileMode: true });
  var win = env.window;
  var doc = env.document;

  // 控制台收集（框架错误/警告都算失败信号）
  var consoleErrors = [];
  var consoleWarns = [];
  win.console = {
    log: function () { if (VERBOSE) console.log.apply(console, ['[page]'].concat([].slice.call(arguments))); },
    info: function () { },
    warn: function () { consoleWarns.push([].slice.call(arguments).join(' ')); },
    error: function () { consoleErrors.push([].slice.call(arguments).join(' ')); },
    debug: function () { }
  };
  win.setTimeout = setTimeout;
  win.clearTimeout = clearTimeout;
  win.setInterval = setInterval;
  win.clearInterval = clearInterval;

  // 挂载点
  var appEl = doc.createElement('div');
  appEl.id = 'kui-app';
  appEl.setAttribute('data-kui-app', 'true');
  doc.body.appendChild(appEl);

  // 启动层（bootstrap 会去隐藏/移除）
  var bootEl = doc.createElement('div');
  bootEl.id = 'kui-boot';
  doc.body.appendChild(bootEl);

  // 1) 按真实顺序加载脚本
  currentSection = 1;   console.log('\n[1] 加载脚本');
  var loaded = 0;
  order.forEach(function (src) {
    var abs = path.resolve(ROOT, src.split('?')[0]);
    if (!fs.existsSync(abs)) {
      console.log('  ✘ 缺失脚本: ' + src);
      fail++;
      failures.push('缺失脚本: ' + src);
      return;
    }
    try {
      env.loadScript(abs);
      loaded++;
    } catch (e) {
      console.log('  ✘ 加载失败: ' + src + ' → ' + (e && e.message));
      fail++;
      failures.push('加载失败: ' + src + ' → ' + (e && e.message));
    }
  });
  ok('脚本全部加载', loaded + ' / ' + order.length);

  var KUI = win.KUI;

  // 1.1) 控件子脚本：浏览器里由 index.js 用 document.write 同步注入；
  //      dom-stub 不解析 document.write，这里按 KUI.controls.files 显式加载并 init。
  if (KUI && KUI.controls && KUI.controls.files) {
    KUI.controls.files.forEach(function (file) {
      var abs = path.resolve(ROOT, 'src/components/controls', file);
      if (!fs.existsSync(abs)) {
        console.log('  ! 控件脚本未交付（待补）: ' + file);
        return;
      }
      try {
        env.loadScript(abs);
      } catch (e) {
        console.log('  ✘ 控件脚本加载失败: ' + file + ' → ' + (e && e.message));
        fail++;
        failures.push('控件脚本加载失败: ' + file);
      }
    });
    try { KUI.controls.init(); } catch (e) {
      bad('控件注册初始化', e);
    }
  }

  check('命名空间 KUI 存在', function () {
    assert(KUI, 'window.KUI 未定义');
    return 'utils/registry/theme 版本 ' + (KUI.version || '-');
  });

  // 2) 配置读取器（Node 下同步读 JSON）
  KUI.config.setReader(function (name, relPath) {
    var abs = path.resolve(ROOT, relPath);
    if (!fs.existsSync(abs)) return null;
    return JSON.parse(fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, ''));
  });

  // 3) 启动
  currentSection = 2;   console.log('\n[2] 启动 boot()');
  return Promise.resolve()
    .then(function () { return KUI.boot({ force: true }); })
    .then(function () { return delay(60); })
    .then(function () {
      check('boot 完成（body.kui-ready）', function () {
        assert(/kui-ready/.test(doc.body.className), 'body 没有 .kui-ready：' + doc.body.className);
      });
      check('启动层已隐藏', function () {
        var b = doc.getElementById('kui-boot');
        assert(!b || b.getAttribute('hidden') !== null || /is-done|is-hidden/.test(b.className), '启动层未隐藏');
      });
      check('.kui-app 骨架', function () {
        var app = doc.querySelector('.kui-app');
        assert(app, '缺少 .kui-app');
        assert(app.querySelector('.kui-app__left'), '缺少 .kui-app__left（左侧菜单区）');
        assert(app.querySelector('.kui-app__main'), '缺少 .kui-app__main');
        assert(app.querySelector('.kui-app__center'), '缺少 .kui-app__center（主体区）');
        return app.className;
      });
      check('左侧菜单已渲染', function () {
        var items = doc.querySelectorAll('.kui-menu__item, .kui-menu-item');
        assert(items.length > 0, '菜单项数量为 0');
        return items.length + ' 个菜单项';
      });
      check('顶部导航已渲染', function () {
        assert(doc.querySelector('.kui-menunav'), '缺少 .kui-menunav');
        var actions = doc.querySelectorAll('.kui-menunav [data-action], .kui-menunav button');
        return (actions.length || 0) + ' 个导航操作';
      });
      check('标签栏已渲染', function () {
        assert(doc.querySelector('.kui-tabs'), '缺少 .kui-tabs');
      });
      check('主题已应用', function () {
        var root = doc.documentElement;
        assert(root.getAttribute('data-kui-theme'), '未设置 data-kui-theme');
        assert(KUI.theme.currentId(), 'KUI.theme.currentId() 为空');
        return '当前主题: ' + KUI.theme.currentId();
      });

      return delay(30);
    })
    .then(function () {
      currentSection = 3;   console.log('\n[3] 菜单 → 标签 → iframe 保活');
      var inst = KUI.app.instance;
      check('app 实例存在', function () {
        assert(inst, 'KUI.app.instance 为空');
        return '标签数 ' + inst.tabs.count();
      });

      // 打开两个标签
      var iframeA = null;
      var iframeB = null;
      check('openTab 创建 pane + iframe', function () {
        inst.openTab({ id: 'smoke-a', title: '冒烟A', url: 'pages/home.html' });
        inst.openTab({ id: 'smoke-b', title: '冒烟B', url: 'pages/form.html' });
        var panes = doc.querySelectorAll('.kui-tabs__pane');
        assert(panes.length >= 2, 'pane 数量 ' + panes.length);
        var frames = doc.querySelectorAll('.kui-tabs__pane iframe');
        assert(frames.length >= 2, 'iframe 数量 ' + frames.length);
        iframeA = frames[0];
        iframeB = frames[1];
      });

      check('切换标签不重建 iframe（引用不变）', function () {
        inst.tabs.activate('smoke-a');
        inst.tabs.activate('smoke-b');
        inst.tabs.activate('smoke-a');
        var frames = doc.querySelectorAll('.kui-tabs__pane iframe');
        assert(frames[0] === iframeA, 'iframe 节点被重建');
        assert(frames[1] === iframeB, 'iframe 节点被重建');
        return '3 次切换后引用一致';
      });

      check('同一标签 src 只设置一次', function () {
        var count = iframeA.__srcSetCount || 0;
        assert(count <= 1, 'smoke-a 的 src 被设置了 ' + count + ' 次');
        return 'src=' + (iframeA.getAttribute('src') || '(空)');
      });

      check('未激活标签的 pane 隐藏', function () {
        inst.tabs.activate('smoke-a');
        var panes = doc.querySelectorAll('.kui-tabs__pane');
        var hidden = 0;
        for (var i = 0; i < panes.length; i++) if (panes[i].hidden) hidden++;
        assert(hidden >= 1, '没有隐藏的 pane');
        return hidden + ' 个 pane 处于隐藏状态';
      });

      // 关闭
      check('closeTab 移除 pane', function () {
        var before = doc.querySelectorAll('.kui-tabs__pane').length;
        inst.tabs.close('smoke-b', { force: true });
        var after = doc.querySelectorAll('.kui-tabs__pane').length;
        assert(after === before - 1, '关闭前后 pane 数 ' + before + ' → ' + after);
      });
    })
    .then(function () {
      currentSection = 4;   console.log('\n[4] 弹窗 / 提醒 / 主题');
      check('dialog.open 创建 iframe', function () {
        var p = KUI.dialog.alert({ title: '冒烟', message: '这是一条冒烟提示' });
        assert(p && typeof p.then === 'function', '未返回 Promise');
        var dlg = doc.querySelector('.kui-dialog-layer') || doc.querySelector('.kui-dialog');
        assert(dlg, '没有弹窗层节点（.kui-dialog-layer / .kui-dialog）');
        var frame = dlg.querySelector('iframe');
        assert(frame, '弹窗内没有 iframe');
        var src = frame.getAttribute('src') || '';
        assert(src.indexOf('dialog-frame.html') >= 0, '弹窗 iframe src 不是 dialog-frame.html: ' + src);
        return src;
      });

      check('弹窗工厂 method 不被 config.type 覆盖（v1.0.6）', function () {
        // 配置里常见的 "type":"info" 只是配色语义，不能把 prompt/confirm/custom 的结构分支冲掉
        var js = fs.readFileSync(path.join(ROOT, 'src/components/dialog.js'), 'utf8');
        assert(/merged\.type\s*=\s*'(prompt|confirm|alert|form|custom)'/.test(js),
          'dialog.js 工厂未把权威 method 写回 merged.type');
        assert(/method\s*:\s*rec\.method/.test(js), 'dialog:init 未携带 method 字段');
        var fr = fs.readFileSync(path.join(ROOT, 'src/frame/dialog-frame.js'), 'utf8');
        assert(/function render\s*\(\s*config\s*,\s*method/.test(fr), 'dialog-frame render() 未接收 method');
        assert(/method\s*===|method\s*===|'prompt'/.test(fr), 'dialog-frame 未按 method 分流');
        return 'method 优先级已固化';
      });

      check('toast.success 渲染提醒信息', function () {
        KUI.toast.success('冒烟成功');
        var list = doc.querySelectorAll('.kui-toast');
        assert(list.length >= 1, '没有 .kui-toast');
        return list.length + ' 条提醒';
      });

      check('theme.apply 切换并写回 token', function () {
        var root = doc.documentElement;
        KUI.theme.apply('starry', { persist: false, broadcast: false });
        var id = KUI.theme.currentId();
        assert(id === 'starry', '当前主题不是 starry: ' + id);
        assert(root.getAttribute('data-kui-theme') === 'starry', 'data-kui-theme 未更新');
        var v = root.style.getPropertyValue('--kui-accent') || '';
        assert(v, '--kui-accent 未写入');
        KUI.theme.apply('kurumi', { persist: false, broadcast: false });
        return 'starry → kurumi ok';
      });

      check('六套主题齐备', function () {
        var ids = KUI.theme.ids();
        ['kurumi', 'kurumi-angel', 'starry', 'sakura', 'abyss', 'dawn'].forEach(function (id) {
          assert(ids.indexOf(id) !== -1, '缺少主题 ' + id);
        });
        return ids.length + ' 套';
      });
    })
    .then(function () {
      currentSection = 5;   console.log('\n[5] 控件 / 表单 / 注册表');
      check('控件注册表非空', function () {
        var list = KUI.registry.list();
        assert(list.length >= 25, '注册控件只有 ' + list.length + ' 个');
        return list.length + ' 个类型';
      });

      // v1.0.3 回归：控件图标原先写死 #kui-i-<name>，与 icons.js 的 kui-icon-<name> 不符，
      // 且 sprite 只在 icons.create() 时注入 —— 真实浏览器里所有控件图标（日历切月箭头、
      // 时分秒箭头、number 加减、select 箭头、tag 关闭…）全部空白，而 DOM 桩不解析 <use>
      // 所以旧测试抓不到。这里断言 sprite 已注入、关键 symbol 存在、每个 .kui-icon 的
      // <use href> 都能解析到真实 symbol。
      check('控件图标 sprite 注入 + 所有 href 可解析', function () {
        var sprite = doc.getElementById('kui-icon-sprite');
        assert(sprite, '未注入 #kui-icon-sprite（真实浏览器中控件图标会全部空白）');
        var must = ['chevron-left', 'chevron-right', 'chevron-up', 'chevron-down', 'close', 'calendar', 'star'];
        var miss = [];
        must.forEach(function (n) { if (!doc.getElementById('kui-icon-' + n)) miss.push(n); });
        assert(miss.length === 0, '图标 sprite 缺少 symbol: ' + miss.join(', '));

        var host = doc.createElement('div');
        doc.body.appendChild(host);
        KUI.form.create(host, {
          nodes: [
            { id: 'fx-n', type: 'number', label: '数量', value: 1 },
            { id: 'fx-s', type: 'select', label: '选择', options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] },
            { id: 'fx-t', type: 'tag', label: '标签', tagType: 'primary' },
            { id: 'fx-d', type: 'date', label: '日期' }
          ]
        });
        var nodes = doc.querySelectorAll('.kui-icon');
        assert(nodes.length > 0, '没有渲染出任何 .kui-icon');
        var bad = [];
        var inline = 0;
        var refs = 0;
        for (var i = 0; i < nodes.length; i++) {
          var use = nodes[i].querySelector('use');
          if (!use) {
            // 合法形态二：icons.get() 会把 symbol 内容内联成 <g>/<path>（不依赖 sprite），
            // 只要它有元素子节点就算正常绘制，不需要 href。
            if (nodes[i].childNodes && nodes[i].childNodes.length > 0) { inline++; continue; }
            bad.push('(无 use 也无内联图形)');
            continue;
          }
          var href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
          var id = href.charAt(0) === '#' ? href.slice(1) : href;
          if (!id || !doc.getElementById(id)) bad.push(href || '(空 href)');
          else refs++;
        }
        assert(bad.length === 0, '图标 href 无法解析: ' + bad.slice(0, 5).join(', '));
        return nodes.length + ' 个图标（' + refs + ' 个 sprite 引用 + ' + inline + ' 个内联）全部可用';
      });

      check('form.create 渲染 + 联动求值', function () {
        var host = doc.createElement('div');
        doc.body.appendChild(host);
        var form = KUI.form.create(host, {
          data: { mode: 'mail', mail: '', phone: '' },
          nodes: [
            { id: 'mode', type: 'select', label: '方式', options: [
              { label: '邮件', value: 'mail' }, { label: '短信', value: 'sms' }] },
            { id: 'mail', type: 'input', label: '邮箱',
              deps: [{ when: { field: 'mode', op: 'eq', value: 'mail' }, then: { visible: true, required: true } }] },
            { id: 'phone', type: 'input', label: '手机',
              deps: [{ when: { field: 'mode', op: 'eq', value: 'sms' }, then: { visible: true, required: true } }] }
          ]
        });
        assert(form, 'form.create 返回空');
        var mailNode = host.querySelector('[data-field-id="mail"], [data-kui-field="mail"]');
        var phoneNode = host.querySelector('[data-field-id="phone"], [data-kui-field="phone"]');
        assert(mailNode, '找不到 mail 字段');
        assert(phoneNode, '找不到 phone 字段');
        form.setValue('mode', 'sms');
        var mailHidden = mailNode.hidden || /is-hidden/.test(mailNode.className);
        var phoneVisible = !phoneNode.hidden && !/is-hidden/.test(phoneNode.className);
        assert(phoneVisible, '切到 sms 后 phone 仍隐藏');
        assert(mailHidden, '切到 sms 后 mail 未隐藏');
        form.setValue('mode', 'mail');
        return '联动正常';
      });
    })
    .then(function () {
      console.log('[7] 回归：pages 脚本装配 / 主题子→父通道 / 多级菜单');
      var pathx = path;

      check('所有 pages 页面都通过 kui-all 单入口引入（清单含 registry.js）', function () {
        var dir = pathx.join(ROOT, 'pages');
        var files = fs.readdirSync(dir).filter(function (f) { return /\.html$/.test(f); });
        assert(files.length >= 7, 'pages 页面数量异常: ' + files.length);
        var missing = [];
        files.forEach(function (f) {
          var html = fs.readFileSync(pathx.join(dir, f), 'utf8');
          if (html.indexOf('core/kui-all.js') === -1) { missing.push(f); return; }
          if (manifestFiles.indexOf('src/core/registry.js') === -1) missing.push(f + '（清单缺 registry）');
        });
        assert(missing.length === 0, '缺少 core/registry.js: ' + missing.join(', '));
        return files.length + ' 个页面';
      });

      check('所有 standalone 页面都通过 kui-all 单入口引入（清单含 kui-frame.js）', function () {
        var dir = pathx.join(ROOT, 'standalone');
        var files = fs.readdirSync(dir).filter(function (f) { return /\.html$/.test(f); });
        assert(files.length >= 9, 'standalone 页面数量异常: ' + files.length);
        var missing = [];
        files.forEach(function (f) {
          var html = fs.readFileSync(pathx.join(dir, f), 'utf8');
          if (html.indexOf('core/kui-all.js') === -1) { missing.push(f); return; }
          if (manifestStandalone.indexOf('src/frame/kui-frame.js') === -1) missing.push(f + '（清单缺 kui-frame）');
        });
        assert(missing.length === 0, '缺少 src/frame/kui-frame.js: ' + missing.join(', '));
        return files.length + ' 个页面';
      });

      check('config.resolveUrl 能拼出站点根路径', function () {
        assert(typeof KUI.config.resolveUrl === 'function', 'KUI.config.resolveUrl 不存在');
        var u = KUI.config.resolveUrl('config/demos/form.json');
        assert(/config\/demos\/form\.json$/.test(u), 'resolveUrl 结果异常: ' + u);
        return 'base="' + KUI.config.base() + '"  url=' + u;
      });

      check('多级菜单展开/收起规则（is-open + CSS）', function () {
        var inst2 = KUI.app.instance;
        var menu = (inst2 && inst2.menu) || null;
        var li = doc.querySelector('[data-menu-id="independent"]');
        assert(li, '找不到多级父项 data-menu-id="independent"');
        assert(doc.querySelector('[data-menu-id="independent"] .kui-menu__sub'), '父项下没有 .kui-menu__sub 子菜单');
        if (menu && typeof menu.expand === 'function') { menu.expand('independent'); }
        else { li.classList.add('is-open'); }
        assert(/is-open/.test(li.className || ''), '展开后未加 is-open: ' + li.className);
        var css = fs.readFileSync(pathx.join(ROOT, 'src/styles/components.css'), 'utf8');
        assert(/\.kui-menu__item\.is-open > \.kui-menu__sub/.test(css), 'components.css 缺少 .is-open > .kui-menu__sub 规则');
        assert(/\.kui-menu__item > \.kui-menu__sub\s*\{[^}]*display:\s*none/.test(css), 'components.css 缺少默认收起规则');
        if (menu && typeof menu.collapse === 'function') { menu.collapse('independent'); }
        return '展开/收起规则齐备';
      });

      check('iframe 内切换主题可同步整壳（frame:theme 通道）', function () {
        var tabsSrc = fs.readFileSync(pathx.join(ROOT, 'src/components/tabs.js'), 'utf8');
        assert(tabsSrc.indexOf('frame:theme') >= 0, 'tabs.js 未处理 frame:theme');
        var frameSrc = fs.readFileSync(pathx.join(ROOT, 'src/frame/kui-frame.js'), 'utf8');
        assert(/setTheme:\s*requestTheme/.test(frameSrc), 'kui-frame.js 未暴露 setTheme');
        var st = fs.readFileSync(pathx.join(ROOT, 'standalone/theme.html'), 'utf8');
        assert(st.indexOf('frame.setTheme') >= 0, 'standalone/theme.html 未转发父级主题');
        var pt = fs.readFileSync(pathx.join(ROOT, 'pages/theme.html'), 'utf8');
        assert(pt.indexOf('frame.setTheme') >= 0, 'pages/theme.html 未转发父级主题');
        return '子→父主题转发已接好';
      });

      check('iframe 内请求主题 → 父级整壳跟随切换（运行时）', function () {
        var inst7 = KUI.app.instance;
        var tabs7 = inst7 && inst7.tabs;
        assert(tabs7, '找不到 tabs 实例');
        var origin = KUI.theme.currentId();
        var tid = tabs7.open({ id: 'smoke-theme', title: '主题同步', url: 'pages/theme.html' });
        tabs7.activate(tid);
        var frames = doc.querySelectorAll('.kui-tabs__pane iframe');
        var frame = null;
        for (var fi = 0; fi < frames.length; fi++) {
          var src = frames[fi].getAttribute('src') || '';
          if (src.indexOf('theme.html') >= 0) { frame = frames[fi]; break; }
        }
        assert(frame, '找不到 theme.html 的 iframe');
        var childWin = frame.contentWindow;
        assert(childWin && typeof childWin.postMessage === 'function', 'iframe 缺少 contentWindow.postMessage');
        childWin.postMessage({ __kui: true, type: 'frame:theme', payload: { id: 'sakura', name: '樱雾通灵' } }, '*');
        var after = KUI.theme.currentId();
        assert(after === 'sakura', '父级主题未跟随切换（' + origin + ' → ' + after + '）');
        KUI.theme.apply(origin, { persist: false, broadcast: false });
        assert(KUI.theme.currentId() === origin, '恢复原主题失败');
        return origin + ' → sakura（整壳跟随）→ 已恢复';
      });
    })
    .then(function () {
      console.log('[8] 业务函数层（JSON 只存函数名 + 入参）');
      var pth = path;

      check('KUI.handlers 已注册各组件业务函数', function () {
        assert(KUI.handlers, 'KUI.handlers 不存在（core/handlers.js 未加载）');
        var scopes = KUI.handlers.scopes();
        var need = ['menu', 'menunav', 'tabs', 'dialog', 'toast', 'app', 'form'];
        for (var i = 0; i < need.length; i++) {
          assert(scopes.indexOf(need[i]) >= 0, '缺少 scope: ' + need[i]);
        }
        var count = KUI.handlers.count();
        assert(count >= 25, '业务函数太少: ' + count);
        return count + ' 个 / scope ' + scopes.join(',');
      });

      check('JSON 写法 {fn,args} 可直接执行', function () {
        assert(KUI.handlers.has('toast.info'), 'toast.info 未注册');
        var before = doc.querySelectorAll('.kui-toast').length;
        KUI.actions.run({ fn: 'toast.info', args: { text: '冒烟：JSON 函数名执行' } });
        var after = doc.querySelectorAll('.kui-toast').length;
        assert(after > before, 'toast.info 未产生提醒（' + before + ' → ' + after + '）');
        return 'toast.info 生效（' + before + ' → ' + after + '）';
      });

      check('demos/handlers.json 里的每个 fn 都已注册', function () {
        var file = pth.join(ROOT, 'config/demos/handlers.json');
        assert(fs.existsSync(file), '缺少 config/demos/handlers.json');
        var data = JSON.parse(fs.readFileSync(file, 'utf8'));
        var used = [];
        (function walk(node) {
          if (!node || typeof node !== 'object') { return; }
          if (Array.isArray(node)) { for (var i = 0; i < node.length; i++) { walk(node[i]); } return; }
          if (typeof node.fn === 'string') { used.push(node.fn); }
          for (var k in node) { if (Object.prototype.hasOwnProperty.call(node, k)) { walk(node[k]); } }
        })(data);
        assert(used.length >= 10, '演示 JSON 里 fn 数量异常: ' + used.length);
        var missing = used.filter(function (name) { return !KUI.handlers.has(name); });
        assert(missing.length === 0, '未注册: ' + missing.join(', '));
        return used.length + ' 处 fn 全部已注册';
      });

      check('kui-all 单入口清单含全部业务函数文件', function () {
        var need = ['src/core/handlers.js'];
        ['menu', 'menunav', 'tabs', 'dialog', 'toast', 'app-shell', 'form'].forEach(function (n) {
          need.push('src/components/handlers/' + n + '.handlers.js');
        });
        var missing = need.filter(function (src) { return manifestFiles.indexOf(src) === -1; });
        assert(missing.length === 0, 'kui-all 清单缺少: ' + missing.join(', '));
        return need.length + ' 个脚本在清单内';
      });

      check('弹窗 iframe 具备节点级动作桥', function () {
        var src = fs.readFileSync(pth.join(ROOT, 'src/frame/dialog-frame.js'), 'utf8');
        assert(src.indexOf('installActionBridge') >= 0, 'dialog-frame.js 缺少 installActionBridge');
        assert(src.indexOf('dialog:action') >= 0, 'dialog-frame.js 缺少 dialog:action 转发');
        assert(/COMPONENT_RE\s*=\s*\/\^\(app\|/.test(src), 'dialog-frame.js 缺少组件级前缀识别');
        var kuiSrc = fs.readFileSync(path.join(ROOT, 'src/core/kui.js'), 'utf8');
        assert(/action\.fn \|\| action\.handler/.test(kuiSrc), 'kui.js 缺少 fn 语法糖');
        assert(kuiSrc.indexOf('KUI.handlers.has') >= 0, 'kui.js 缺少 handlers 回退');
        return 'installActionBridge + fn 语法糖就绪';
      });

      check('standalone/handlers.html 存在且只用 JSON 配置', function () {
        var file = pth.join(ROOT, 'standalone/handlers.html');
        assert(fs.existsSync(file), '缺少 standalone/handlers.html');
        var html = fs.readFileSync(file, 'utf8');
        assert(html.indexOf('core/kui-all.js') >= 0, '页面缺少单一入口 core/kui-all.js');
        assert(manifestStandalone.indexOf('src/core/handlers.js') >= 0, 'kui-all 清单缺少 core/handlers.js');
        assert(manifestStandalone.indexOf('src/components/handlers/app-shell.handlers.js') >= 0, 'kui-all 清单缺少 app-shell.handlers.js');
        assert(html.indexOf("load('demos/handlers')") >= 0 || html.indexOf('load("demos/handlers")') >= 0, '页面未从 JSON 读取演示');
        assert(!/https?:\/\//.test(html.replace(/<!--[\s\S]*?-->/g, '')), '页面存在外链');
        var appJson = JSON.parse(fs.readFileSync(pth.join(ROOT, 'config/app.json'), 'utf8'));
        var raw = fs.readFileSync(pth.join(ROOT, 'config/app.json'), 'utf8');
        assert(raw.indexOf('standalone/handlers.html') >= 0, 'app.json 未挂载该演示页');
        assert(appJson.schema, 'app.json schema 缺失');
        return 'JSON 驱动页就绪';
      });
    })
    .then(function () {
      currentSection = 9;   console.log('\n[9] 版本自愈：iframe 缓存穿透 + 旧文档自动刷新');
      check('kui.js 版本号存在且可被 tabs/kui-frame 引用', function () {
        var kuiJs = fs.readFileSync(path.join(ROOT, 'src/core/kui.js'), 'utf8');
        var frameJs = fs.readFileSync(path.join(ROOT, 'src/frame/kui-frame.js'), 'utf8');
        assert(/KUI\.version\s*=\s*'[\d.]+'/.test(kuiJs), 'kui.js 缺少 KUI.version');
        assert(frameJs.indexOf('currentVersion()') >= 0, 'kui-frame.js 应使用 KUI.version 作为版本源');
        return '版本号统一';
      });
      check('tabs.js 给子页面 URL 追加 kui_v（缓存穿透）', function () {
        var tabsJs = fs.readFileSync(path.join(ROOT, 'src/components/tabs.js'), 'utf8');
        assert(tabsJs.indexOf('kui_v=') >= 0, 'tabs.js 未追加 kui_v 版本戳');
        assert(tabsJs.indexOf('isHttpPage()') >= 0, 'tabs.js 应仅在 http(s) 环境追加版本戳');
        assert(tabsJs.indexOf('parentVersion') >= 0, 'tab:init 应携带 parentVersion');
        return 'kui_v 缓存穿透';
      });
      check('kui-frame.js 版本不一致时自愈刷新一次', function () {
        var frameJs = fs.readFileSync(path.join(ROOT, 'src/frame/kui-frame.js'), 'utf8');
        assert(frameJs.indexOf('function selfHealVersion') >= 0, 'kui-frame.js 缺少 selfHealVersion');
        assert(frameJs.indexOf('kui-self-heal:') >= 0, '自愈需 sessionStorage 记账防止循环刷新');
        assert(/selfHealVersion\(payload\.parentVersion\)/.test(frameJs), 'tab:init 应触发版本自愈');
        return '旧文档自动刷新';
      });
    })
    .then(function () {
      currentSection = 10;   console.log('\n[10] 悬浮提示与 UI 配置（config/app.json 的 ui.*）');
      check('KUI.tooltip 已加载且接管 title', function () {
        assert(env.window.KUI.tooltip, 'KUI.tooltip 未加载');
        assert(typeof env.window.KUI.tooltip.init === 'function', 'tooltip.init 缺失');
        assert(typeof env.window.KUI.tooltip.configure === 'function', 'tooltip.configure 缺失');
        return 'tooltip 就绪';
      });
      check('app.json 的 ui.tooltip 生效（delay/placement/enabled）', function () {
        var conf = env.window.KUI.tooltip.config();
        assert(conf && conf.enabled === true, 'ui.tooltip.enabled 未生效');
        assert(Number(conf.delay) === 140, 'ui.tooltip.delay 未生效：' + conf.delay);
        assert(conf.placement === 'top', 'ui.tooltip.placement 未生效：' + conf.placement);
        return 'delay=' + conf.delay + ' placement=' + conf.placement;
      });
      check('所有页面都引入了 tooltip 资源（js + css）', function () {
        var targets = ['index.html', 'src/frame/dialog-frame.html'];
        ['pages', 'standalone'].forEach(function (dir) {
          fs.readdirSync(path.join(ROOT, dir)).filter(function (f) { return /\.html$/.test(f); }).forEach(function (f) {
            targets.push(dir + '/' + f);
          });
        });
        targets.forEach(function (rel) {
          var html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
          assert(html.indexOf('styles/tooltip.css') >= 0, rel + ' 未引 tooltip.css');
          if (rel === 'src/frame/dialog-frame.html') {
            assert(html.indexOf('core/tooltip.js') >= 0, rel + ' 未显式引 tooltip.js');
          } else {
            assert(html.indexOf('core/kui-all.js') >= 0, rel + ' 未引入单一入口 core/kui-all.js');
            var mf = rel === 'index.html' ? manifestFiles : manifestStandalone;
            assert(mf.indexOf('src/core/tooltip.js') >= 0, rel + ' 的 kui-all 清单缺少 core/tooltip.js');
          }
        });
        return targets.length + ' 个 HTML';
      });
      check('内容页顶部空白行已消除（.page 上内边距 ≤ 10px）', function () {
        var files = fs.readdirSync(path.join(ROOT, 'pages')).filter(function (f) { return /\.html$/.test(f); });
        files.forEach(function (f) {
          var html = fs.readFileSync(path.join(ROOT, 'pages', f), 'utf8');
          var m = /\.(?:page|home)\s*\{[^}]*padding:\s*(\d+)px/.exec(html);
          assert(m, 'pages/' + f + ' 缺少 .page/.home padding 规则');
          var top = parseInt(m[1], 10);
          assert(top <= 10, 'pages/' + f + ' 顶部内边距仍为 ' + top + 'px');
        });
        return files.length + ' 页';
      });
      check('dialog-frame.html 也接管了原生提示', function () {
        var html = fs.readFileSync(path.join(ROOT, 'src/frame/dialog-frame.html'), 'utf8');
        assert(html.indexOf('core/tooltip.js') >= 0, 'dialog-frame 未引 tooltip.js');
        var frameJs = fs.readFileSync(path.join(ROOT, 'src/frame/dialog-frame.js'), 'utf8');
        assert(/(?:KUI|K)\.tooltip/.test(frameJs), 'dialog-frame.js 未初始化 tooltip');
        return '弹窗内提示统一';
      });

      /* ---------------- [11] v1.0.7 主题预置防闪烁 + 页面按钮配色 ---------------- */
      check('全部 HTML 在 <head> 内首帧前预置主题（防 FOUC）', function () {
        var targets = ['index.html', 'src/frame/dialog-frame.html'];
        ['pages', 'standalone'].forEach(function (dir) {
          fs.readdirSync(path.join(ROOT, dir)).filter(function (f) { return /\.html$/.test(f); }).forEach(function (f) {
            targets.push(dir + '/' + f);
          });
        });
        var boot = fs.readFileSync(path.join(ROOT, 'src/core/theme-boot.js'), 'utf8');
        assert(boot.indexOf('parent.KUI') >= 0, 'theme-boot.js 未读取父级主题');
        assert(boot.indexOf('__KUI_EARLY_THEME__') >= 0, 'theme-boot.js 未导出 early 主题');
        assert(boot.indexOf('currentTokens') >= 0, 'theme-boot.js 未读取父级 tokens');
        var themeJs = fs.readFileSync(path.join(ROOT, 'src/core/theme.js'), 'utf8');
        assert(themeJs.indexOf('__KUI_EARLY_THEME__') >= 0, 'theme.js 未优先采用 early 主题');
        targets.forEach(function (rel) {
          var html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
          var at = html.indexOf('core/theme-boot.js');
          assert(at >= 0, rel + ' 未引入 core/theme-boot.js');
          var link = html.indexOf('<link');
          var head = html.search(/<head[^>]*>/i);
          assert(head >= 0 && at > head, rel + ' 的 theme-boot 不在 <head> 内');
          if (link > 0) { assert(at < link, rel + ' 的 theme-boot 排在首个样式表之后'); }
        });
        return targets.length + ' 个 HTML（首帧前预置）';
      });
      check('pages 实心按钮悬浮前景不再与背景同色', function () {
        var files = fs.readdirSync(path.join(ROOT, 'pages')).filter(function (f) { return /\.html$/.test(f); });
        files.forEach(function (f) {
          var html = fs.readFileSync(path.join(ROOT, 'pages', f), 'utf8');
          assert(html.indexOf('.btn--primary:hover') >= 0, 'pages/' + f + ' 缺少 .btn--primary:hover 规则');
          assert(html.indexOf('--kui-on-accent') >= 0, 'pages/' + f + ' 实心按钮未使用 --kui-on-accent');
        });
        return files.length + ' 页';
      });

      /* ---------------- [13] 诊断与弹窗加固 ---------------- */
      currentSection = 13;   console.log('\n[13] 诊断与弹窗加固（v1.1.0）');
      check('kui-all 清单含 core/diag.js（app 与 standalone）', function () {
        var manifest = require('../src/core/kui-all.js');
        var appFiles = (manifest.profiles && manifest.profiles.app && manifest.profiles.app.files) || [];
        var saFiles = (manifest.profiles && manifest.profiles.standalone && manifest.profiles.standalone.files) || [];
        assert(appFiles.indexOf('src/core/diag.js') >= 0, 'app 清单缺 core/diag.js');
        assert(saFiles.indexOf('src/core/diag.js') >= 0, 'standalone 清单缺 core/diag.js');
        return 'app=' + appFiles.length + ' standalone=' + saFiles.length;
      });
      check('诊断面板由 diag.js 提供（kui_debug / longtask / dialog:debug）', function () {
        var js = fs.readFileSync(path.join(ROOT, 'src/core/diag.js'), 'utf8');
        assert(js.indexOf('kui_debug') >= 0, '缺少 kui_debug 开关');
        assert(js.indexOf('longtask') >= 0, '缺少 longtask 采集');
        assert(js.indexOf('dialog:debug') >= 0, '缺少 dialog:debug 汇总');
        return '诊断面板就绪';
      });
      check('弹窗加固：拖拽兜底 / 诊断接收 / 点击反馈 / 关闭拼写检查', function () {
        var dlg = fs.readFileSync(path.join(ROOT, 'src/components/dialog.js'), 'utf8');
        var fr = fs.readFileSync(path.join(ROOT, 'src/frame/dialog-frame.js'), 'utf8');
        assert(dlg.indexOf('bindDragWatchdog') >= 0, 'dialog.js 缺拖拽看门狗');
        assert(dlg.indexOf('dialog:debug') >= 0, 'dialog.js 未接收 frame 诊断');
        assert(fr.indexOf('dialog:clicked') >= 0, 'dialog-frame.js 缺点击回执');
        assert(fr.indexOf('spellcheck') >= 0, 'dialog-frame 未关闭拼写检查');
        return '加固 4 项';
      });
      check('弹窗 iframe 不再使用 clip-path（输入重绘优化）', function () {
        var html = fs.readFileSync(path.join(ROOT, 'src/frame/dialog-frame.html'), 'utf8');
        assert(html.indexOf('clip-path: polygon') < 0, 'dialog-frame.html 仍在使用 clip-path');
        return '无裁剪层';
      });
/* ---------------- [12] v1.0.8 原生控件升级（select / textarea 角标） ---------------- */
      check('dom-enhance 升级器在各业务页与弹窗内均已接入', function () {
        var targets = ['src/frame/dialog-frame.html'];
        ['pages', 'standalone'].forEach(function (dir) {
          fs.readdirSync(path.join(ROOT, dir)).filter(function (f) { return /\.html$/.test(f); }).forEach(function (f) {
            targets.push(dir + '/' + f);
          });
        });
        var enh = fs.readFileSync(path.join(ROOT, 'src/core/dom-enhance.js'), 'utf8');
        assert(enh.indexOf('KUI.enhance') >= 0, 'dom-enhance.js 未注册 KUI.enhance');
        assert(enh.indexOf('var upgraded') >= 0, 'dom-enhance.js 缺少 upgraded 记录数组（回归保护）');
        assert(enh.indexOf('data-kui-native') >= 0, 'dom-enhance.js 缺少原生 select 选择器');
        assert(enh.indexOf('data-kui-grip') >= 0, 'dom-enhance.js 缺少 textarea 角标选择器');
        targets.forEach(function (rel) {
          var html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
          if (rel === 'src/frame/dialog-frame.html') {
            assert(html.indexOf('core/dom-enhance.js') >= 0, rel + ' 未显式引入 core/dom-enhance.js');
          } else {
            assert(html.indexOf('core/kui-all.js') >= 0, rel + ' 未引入单一入口 core/kui-all.js');
            var mf = (html.indexOf('standalone/') === 0 || html.indexOf('../src/core/kui-all.js') >= 0) ? manifestStandalone : manifestFiles;
            assert(mf.indexOf('src/core/dom-enhance.js') >= 0, rel + ' 的 kui-all 清单缺少 core/dom-enhance.js');
          }
        });
        return targets.length + ' 个 HTML';
      });
      check('页面里的原生 select / textarea 都已被标记升级', function () {
        var targets = [];
        ['pages', 'standalone'].forEach(function (dir) {
          fs.readdirSync(path.join(ROOT, dir)).filter(function (f) { return /\.html$/.test(f); }).forEach(function (f) {
            targets.push(dir + '/' + f);
          });
        });
        var selected = 0;
        targets.forEach(function (rel) {
          var html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
          var selectCount = (html.match(/<select\b/g) || []).length;
          if (selectCount > 0) {
            selected += selectCount;
            assert(html.indexOf('data-kui-native') >= 0, rel + ' 有 ' + selectCount + ' 个原生 select 但未标记 data-kui-native');
          }
          if (/<textarea\b[^>]*data-kui-grip/.test(html) === false && /<textarea\b/.test(html)) {
            assert(html.indexOf('data-kui-grip') >= 0, rel + ' 有 textarea 但未标记 data-kui-grip');
          }
        });
        assert(selected >= 2, '业务页未发现原生 select');
        return selected + ' 个原生 select';
      });
      check('弹窗多行输入使用 textarea 分支且带自绘角标', function () {
        var frameJs = fs.readFileSync(path.join(ROOT, 'src/frame/dialog-frame.js'), 'utf8');
        assert(frameJs.indexOf("=== 'textarea'") >= 0, 'dialog-frame.js 未区分 textarea 分支');
        assert(frameJs.indexOf("el(isArea ? 'textarea' : 'input'") >= 0, 'dialog-frame.js 未按类型创建 textarea');
        assert(frameJs.indexOf('K.enhance.grip(') >= 0, 'dialog-frame.js 未调用 KUI.enhance.grip 自绘角标');
        var html = fs.readFileSync(path.join(ROOT, 'src/frame/dialog-frame.html'), 'utf8');
        assert(/\.kui-dialog__textarea\s*\{[^}]*resize:\s*none/.test(html), 'dialog-frame.html 的 textarea 仍启用原生 resize');
        assert(html.indexOf('core/dom-enhance.js') >= 0, 'dialog-frame.html 未引入 dom-enhance（角标实现）');
        return '多行输入就绪';
      });
    })
    .then(function () {
      /* ---------------- [14] 弹窗消息循环防护（v1.1.1） ---------------- */
      currentSection = 14;   console.log('\n[14] 弹窗消息循环防护（v1.1.1）');
      check('dialog-frame 只在 sendReady 里上报 dialog:ready（render 不得重复上报）', function () {
        var code = fs.readFileSync(path.join(ROOT, 'src/frame/dialog-frame.js'), 'utf8');
        var readyPosts = (code.match(/post\('dialog:ready'/g) || []).length;
        assert(readyPosts === 1, '应只有 sendReady 一处 post dialog:ready，实际 ' + readyPosts + ' 处');
        var renderIdx = code.indexOf('function render(config, method)');
        var renderEnd = code.indexOf('function focusFirst()', renderIdx);
        var segment = code.slice(renderIdx, renderEnd);
        assert(segment.indexOf("post('dialog:ready'") < 0, 'render() 内不得回发 dialog:ready（会与父级 sendInit 形成无限乒乓）');
        return 'ready 上报单点化';
      });
      check('父级 dialog:ready 只初始化一次且带次数熔断', function () {
        var code = fs.readFileSync(path.join(ROOT, 'src/components/dialog.js'), 'utf8');
        assert(code.indexOf('rec.inited') >= 0, 'ready 处理需用 rec.inited 守卫，只 sendInit 一次');
        assert(code.indexOf('rec.readyCount') >= 0, 'ready 次数熔断缺失');
        assert(/if \(!rec\.inited\) \{/.test(code), '缺少 if (!rec.inited) 守卫');
        return 'ready 只 init 一次';
      });
      check('父级高度上报带令牌桶熔断', function () {
        var code = fs.readFileSync(path.join(ROOT, 'src/components/dialog.js'), 'utf8');
        assert(code.indexOf('rec.resizeBudget') >= 0, '缺少 resize 令牌桶熔断');
        assert(/resizeBudget > 40/.test(code), '阈值断言失败（应 >40 次/500ms 熔断）');
        return 'resize 熔断生效';
      });
      /* ---------------- [15] 弹窗渲染健壮性与必填校验（v1.1.2） ---------------- */
      currentSection = 15;   console.log('\n[15] 弹窗渲染健壮性与必填校验（v1.1.2）');
      check('form 弹窗的 KUI.form.create 返回值不会把 host 塞进自己', function () {
        var code = fs.readFileSync(path.join(ROOT, 'src/frame/dialog-frame.js'), 'utf8');
        assert(/created\.el !== host && created\.el\.parentNode !== host/.test(code),
          'renderForm 缺少 created.el !== host 守卫，会抛 HierarchyRequestError 导致 footer 不渲染');
        assert(code.indexOf('state.formApi = created') >= 0, 'renderForm 未记录 formApi');
        return 'form 挂载守卫就绪';
      });
      check('render 正文渲染有 try/catch，footer 构建不受正文异常影响', function () {
        var code = fs.readFileSync(path.join(ROOT, 'src/frame/dialog-frame.js'), 'utf8');
        assert(code.indexOf('弹窗正文渲染失败') >= 0, 'render 正文缺少异常捕获日志');
        assert(/safe\(function \(\) \{ buildFooter\(config\); \}\)/.test(code),
          'footer 未用 safe() 包裹，正文异常时会一起丢失按钮');
        var formIdx = code.indexOf('state.formApi = created');
        var footerIdx = code.lastIndexOf('buildFooter(config)');
        assert(formIdx >= 0 && footerIdx > formIdx, 'buildFooter 调用应位于正文渲染之后');
        return 'footer 独立于正文异常';
      });
      check('键值对象形式的 rules 能展开成类型规则（required/min/max）', function () {
        var code = fs.readFileSync(path.join(ROOT, 'src/frame/dialog-frame.js'), 'utf8');
        assert(code.indexOf('function expandRule') >= 0, '缺少 expandRule（键值对象规则展开）');
        assert(/RULE_KEYS/.test(code), '缺少 RULE_KEYS 规则键清单');
        assert(/var declared = rule\.type \|\| rule\.name/.test(code), 'expandRule 未识别 type/name 型规则');
        var docs = fs.readFileSync(path.join(ROOT, 'docs/03-controls.md'), 'utf8');
        assert(docs.indexOf('rules') >= 0, 'docs/03-controls.md 未记录 rules 写法');
        return 'rules 归一化就绪';
      });
      check('校验只在规则失败时应用 message（避免有值也报错）', function () {
        var code = fs.readFileSync(path.join(ROOT, 'src/frame/dialog-frame.js'), 'utf8');
        assert(/var failed = false;/.test(code), '缺少 failed 标记');
        assert(/if \(failed\) \{ message = rule\.message/.test(code), 'message 仍未受 failed 约束');
        assert(code.indexOf('minLength') >= 0, '缺少 minLength 别名支持');
        return '校验语义正确';
      });
      /* ---------------- [16] 菜单折叠联动整壳布局（v1.1.3） ---------------- */
      currentSection = 16;   console.log('\n[16] 菜单折叠联动整壳布局（v1.1.3）');
      check('菜单自带折叠按钮走 fire(collapsed)，同时保留全局 menu:collapsed', function () {
        var menu = fs.readFileSync(path.join(ROOT, 'src/components/menu.js'), 'utf8');
        assert(menu.indexOf("fire('collapsed'") >= 0, 'menu.js 折叠时未调用 fire(\'collapsed\')，app-shell 收不到');
        assert(!/emit\('menu:collapsed', \{ collapsed: state\.collapsed \}\);/.test(menu),
          'menu.js 仍在直接 emit(menu:collapsed)，实例监听不会触发');
        var fireIdx = menu.indexOf('function fire(name, payload)');
        var seg = menu.slice(fireIdx, fireIdx + 1200);
        assert(seg.indexOf("emit('menu:' + name") >= 0, 'fire() 内应继续向全局发 menu:xxx');
        return '折叠事件派发正确';
      });
      check('app-shell 监听菜单折叠并同步整壳 class / 列宽', function () {
        var shell = fs.readFileSync(path.join(ROOT, 'src/components/app-shell.js'), 'utf8');
        assert(shell.indexOf("menuApi.on('collapsed'") >= 0, 'app-shell 未监听 menu 实例的 collapsed 事件');
        assert(/applyCollapsed\(value, \{ silent: true, fromMenu: true \}\)/.test(shell),
          '菜单触发折叠时应走 applyCollapsed(silent, fromMenu) 避免来回 setCollapsed');
        assert(/toggleClass\(rootEl, 'is-menu-collapsed', next\)/.test(shell), '未切换 is-menu-collapsed');
        var css = fs.readFileSync(path.join(ROOT, 'src/styles/base.css'), 'utf8');
        assert(/\.kui-app\.is-menu-collapsed/.test(css), 'base.css 缺少 .kui-app.is-menu-collapsed 列宽规则');
        assert(css.indexOf('--kui-menu-width-collapsed') >= 0, 'base.css 未使用折叠列宽 token');
        return '整壳布局联动就绪';
      });
      check('折叠按钮与菜单尺寸 token 存在（252 / 68）', function () {
        var d = fs.readFileSync(path.join(ROOT, 'src/components/menu.js'), 'utf8');
        assert(d.indexOf('kui-menu__collapse') >= 0, 'menu.js 缺少折叠按钮');
        var cfg = fs.readFileSync(path.join(ROOT, 'config/app.json'), 'utf8');
        assert(/"collapsedWidth"\s*:\s*68/.test(cfg), 'app.json layout.menu.collapsedWidth 应为 68');
        return '折叠按钮与尺寸就绪';
      });
      /* ---------------- [17] 表单必填校验（v1.1.4） ---------------- */
      currentSection = 17;   console.log('\n[17] 表单必填校验（v1.1.4）');
      check('弹窗表单的 validateForm 会把 validate() 结果对象归一化', function () {
        var code = fs.readFileSync(path.join(ROOT, 'src/frame/dialog-frame.js'), 'utf8');
        assert(code.indexOf('function isValidatePassed') >= 0, 'dialog-frame.js 缺少 isValidatePassed 归一化');
        assert(/isValidatePassed\(result\)/.test(code), 'validateForm 未使用 isValidatePassed 处理同步结果');
        assert(/return result\.then\(isValidatePassed/.test(code), 'validateForm 未处理 Promise 结果');
        assert(/if \(res\.valid === false\) \{ return false; \}/.test(code),
          'isValidatePassed 未识别 { valid:false } 结果对象');
        assert(code.indexOf('Promise.resolve(!!valid)') < 0, '仍存在旧实现 Promise.resolve(!!valid)（对象恒真 → 永远通过）');
        return '弹窗表单校验归一化就绪';
      });
      check('KUI.form.validate() 对必填空值返回 valid:false', function () {
        var form = win.KUI.form.create(win.document.createElement('div'), {
          nodes: [
            { type: 'input', id: '__req_a', props: { label: '必填A', required: true } },
            { type: 'input', id: '__opt_b', props: { label: '可选B' } }
          ],
          data: {}
        });
        var res = form.validate();
        assert(res && res.valid === false, '必填项为空时 validate() 应返回 valid:false，实际 ' + JSON.stringify(res && res.valid));
        assert(res.errors && res.errors.__req_a, 'errors 应包含必填字段');
        form.destroy();
        return '空必填被拦截';
      });
      check('页面提交逻辑以 res.valid === false 拦截（pages/form.html / profile.html）', function () {
        ['pages/form.html', 'pages/profile.html'].forEach(function (rel) {
          var html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
          assert(html.indexOf('.validate()') >= 0, rel + ' 未调用 form.validate()');
          assert(/res\.valid === false/.test(html), rel + ' 提交前未判断 res.valid === false');
        });
        return '页面表单提交前已校验';
      });
      /* ---------------- [18] 模块级全局事件兼容层（v1.1.5） ---------------- */
      currentSection = 18;   console.log('\n[18] 模块级全局事件兼容层（v1.1.5）');
      check('kui.js 把 KUI.events.emit/on/off 委托到 KUI.bus', function () {
        var code = fs.readFileSync(path.join(ROOT, 'src/core/kui.js'), 'utf8');
        assert(/KUI\.events\.emit = function \(name, payload\) \{ return KUI\.bus\.emit\(name, payload\); \}/.test(code),
          'KUI.events.emit 未委托 KUI.bus（组件级全局事件会被静默丢弃）');
        assert(/KUI\.events\.on = function \(name, fn\) \{ return KUI\.bus\.on\(name, fn\); \}/.test(code),
          'KUI.events.on 未委托 KUI.bus');
        assert(/KUI\.events\.off = function \(name, fn\) \{ return KUI\.bus\.off\(name, fn\); \}/.test(code),
          'KUI.events.off 未委托 KUI.bus');
        return '事件兼容层就绪';
      });
      check('menunav 折叠同步链完整（全局监听 → 图标/文案/aria）', function () {
        var nav = fs.readFileSync(path.join(ROOT, 'src/components/menunav.js'), 'utf8');
        assert(nav.indexOf("bindGlobal('menu:collapsed'") >= 0, 'menunav 未监听全局 menu:collapsed');
        assert(nav.indexOf('function syncCollapseIcon()') >= 0, 'menunav 缺少 syncCollapseIcon');
        assert(nav.indexOf("state.collapsed ? 'expand' : 'collapse'") >= 0, '折叠图标未按状态切换 expand/collapse');
        assert(/txt\('menunav\.expand'/.test(nav) && /txt\('menunav\.collapse'/.test(nav),
          '折叠按钮文案未按状态切换（应使用 menunav.expand / menunav.collapse）');
        assert(nav.indexOf("setAttribute('aria-expanded'") >= 0, '缺少 aria-expanded 同步');
        return '折叠同步链完整';
      });
      check('运行时：KUI.events.emit 能到达 KUI.events.on 订阅者', function () {
        var got = null;
        var off = win.KUI.events.on('__smoke_compat_evt', function (p) { got = p; });
        win.KUI.events.emit('__smoke_compat_evt', { ok: 1 });
        if (typeof off === 'function') { off(); }
        assert(got && got.ok === 1, 'KUI.events.emit 与 KUI.events.on 未共享同一份订阅表');
        return 'Compatibility OK';
      });
      check('运行时：菜单收起后顶部导航折叠按钮文案/图标同步变化', function () {
        var appInst = win.KUI && win.KUI.app && win.KUI.app.instance;
        assert(appInst && appInst.menu, '未拿到 app 的菜单实例');
        var btn = win.document.querySelector('.kui-menunav__btn--collapse');
        assert(btn, '未找到顶部导航折叠按钮 .kui-menunav__btn--collapse');
        var titleBefore = btn.getAttribute('title') || '';
        appInst.menu.setCollapsed(true);
        var titleCollapsed = btn.getAttribute('title') || '';
        var ariaCollapsed = btn.getAttribute('aria-expanded');
        assert(titleCollapsed && titleCollapsed !== titleBefore,
          '菜单收起后折叠按钮文案未变化（仍为「' + titleBefore + '」）');
        assert(ariaCollapsed === 'false', '菜单收起后 aria-expanded 应为 false，实际 ' + ariaCollapsed);
        appInst.menu.setCollapsed(false);
        var titleExpanded = btn.getAttribute('title') || '';
        assert(titleExpanded === titleBefore, '菜单展开后文案未恢复为「' + titleBefore + '」，实际「' + titleExpanded + '」');
        assert(btn.getAttribute('aria-expanded') === 'true', '菜单展开后 aria-expanded 应为 true');
        return '折叠按钮联动正常';
      });
      currentSection = 19;   console.log('\n[19] 头像与刻刻帝齿轮框（v1.2.0）');
      check('静态：kui-all 清单含 avatar.js，且 avatar 页 / demo / 样式存在', function () {
        var manifests = require('../src/core/kui-all.js');
        ['app', 'standalone'].forEach(function (p) {
          assert(manifests.profiles[p].files.indexOf('src/core/avatar.js') >= 0,
            p + ' 清单缺少 src/core/avatar.js');
        });
        assert(fs.existsSync(path.join(ROOT, 'standalone/avatar.html')), '缺少 standalone/avatar.html');
        assert(fs.existsSync(path.join(ROOT, 'config/demos/avatar.json')), '缺少 config/demos/avatar.json');
        var css = fs.readFileSync(path.join(ROOT, 'src/styles/avatar.css'), 'utf8');
        assert(css.indexOf('--kui-accent-2') >= 0, 'avatar.css 未使用主题 token --kui-accent-2');
        var base = fs.readFileSync(path.join(ROOT, 'src/styles/base.css'), 'utf8');
        assert(base.indexOf('@import url("avatar.css")') >= 0, 'base.css 未 @import avatar.css');
        return '静态资产 OK';
      });
      check('静态：app.json 含 avatar 配置且菜单挂载头像测试页', function () {
        var appCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/app.json'), 'utf8'));
        assert(appCfg.avatar && typeof appCfg.avatar === 'object', 'app.json 缺少顶层 avatar');
        assert(appCfg.avatar.editable === true, 'avatar.editable 应为 true（可点击更换）');
        assert(appCfg.avatar.frame && appCfg.avatar.frame.style === 'clock-gear',
          'avatar.frame.style 应为 clock-gear');
        assert(JSON.stringify(appCfg.menu).indexOf('standalone/avatar.html') >= 0,
          '菜单未挂载 standalone/avatar.html');
        return '配置 OK';
      });
      check('运行时：头像创建 / 设置后出现齿轮框 / 切主题图片不变', function () {
        assert(KUI && KUI.avatar, 'KUI.avatar 未定义');
        assert(KUI.registry.has('avatar'), 'registry 未注册 avatar 类型');
        var host = win.document.createElement('div');
        win.document.body.appendChild(host);
        var av = KUI.avatar.create(host, { url: '', editable: true, size: 40, persist: false });
        assert(av && av.el, 'KUI.avatar.create 未返回元素');
        assert(host.querySelector('.kui-avatar'), '缺少 .kui-avatar 根节点');
        assert(!host.querySelector('.kui-avatar__ring'), '未设置头像时不应绘制齿轮框');
        av.setUrl(KUI.avatar.svgUrl('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#c8102e"/></svg>'), { persist: false });
        assert(host.querySelector('.kui-avatar__ring'), '设置头像后未绘制齿轮框');
        assert(host.querySelector('.kui-avatar__ring-gear'), '缺少齿轮主体 .kui-avatar__ring-gear');
        var img = host.querySelector('img.kui-avatar__img');
        assert(img, '缺少头像图片 img.kui-avatar__img');
        var srcBefore = img.getAttribute('src');
        var oldTheme = KUI.theme.currentId();
        KUI.theme.apply('starry', { persist: false, broadcast: false });
        var img2 = host.querySelector('img.kui-avatar__img');
        assert(img2 && img2.getAttribute('src') === srcBefore, '切换主题后头像图片不应变化');
        assert(host.querySelector('.kui-avatar__ring-gear'), '切换主题后齿轮框不应消失');
        KUI.theme.apply(oldTheme || 'kurumi', { persist: false, broadcast: false });
        av.destroy();
        if (host.parentNode) { host.parentNode.removeChild(host); }
        return '头像运行时 OK';
      });
      check('运行时：主应用菜单品牌区已接入头像并暴露 app API', function () {
        var appInst = KUI.app && KUI.app.instance;
        assert(appInst, '未拿到 app 实例');
        assert(win.document.querySelector('.kui-menu .kui-avatar'), '菜单品牌区未渲染 .kui-avatar');
        assert(typeof appInst.getAvatar === 'function', 'app.getAvatar 不可用');
        assert(typeof appInst.openAvatarPicker === 'function', 'app.openAvatarPicker 不可用');
        return '菜单头像 OK';
      });
      currentSection = 20;   console.log('\n[20] 表单必填 / 弹层关闭 / tooltip 文案（v1.3.0）');
      check('静态：星号规则 / 表单必填组 / 隐藏不校验 / 弹层关闭 / tooltip 同步', function () {
        var controlsCss = fs.readFileSync(path.join(ROOT, 'src/styles/controls.css'), 'utf8');
        assert(controlsCss.indexOf('.kui-field__required') >= 0, 'controls.css 缺少 .kui-field__required 规则');
        assert(controlsCss.indexOf('.is-required:not(.is-required-optional)') >= 0, 'controls.css 缺少星号按 is-required 显示规则');
        var formJs = fs.readFileSync(path.join(ROOT, 'src/components/form.js'), 'utf8');
        assert(formJs.indexOf('requiredAny') >= 0, 'form.js 缺少 requiredAny 必填组支持');
        assert(formJs.indexOf('isInvisible') >= 0, 'form.js 缺少 isInvisible 隐藏判断');
        var baseJs = fs.readFileSync(path.join(ROOT, 'src/components/controls/control-base.js'), 'utf8');
        assert(baseJs.indexOf('_lastClosed') >= 0, 'control-base.js 缺少弹层最近关闭守卫');
        assert(baseJs.indexOf('onWindowBlur') >= 0, 'control-base.js 缺少窗口失焦关闭弹层');
        var tipJs = fs.readFileSync(path.join(ROOT, 'src/core/tooltip.js'), 'utf8');
        assert(tipJs.indexOf('data-kui-tip-source') >= 0, 'tooltip.js 缺少 title 变更同步');
        var tabsJs = fs.readFileSync(path.join(ROOT, 'src/components/tabs.js'), 'utf8');
        assert(tabsJs.indexOf('hideContext') >= 0, 'tabs.js 缺少右键菜单关闭');
        var frameJs = fs.readFileSync(path.join(ROOT, 'src/frame/dialog-frame.js'), 'utf8');
        assert(frameJs.indexOf('isInvisible') >= 0 || frameJs.indexOf('skipHidden') >= 0 || frameJs.indexOf('validateForm') >= 0, 'dialog-frame.js 缺少校验逻辑');
        assert(/^\d+\.\d+\.\d+$/.test(KUI.version) && KUI.version !== '1.0.0', 'KUI.version 应为语义化版本（实际 ' + KUI.version + '）');
        return '静态 OK';
      });
      check('运行时：星号显隐 / 必填组 / 隐藏不校验 / 单选复选开关必填', function () {
        var host = win.document.createElement('div');
        win.document.body.appendChild(host);
        var form = KUI.form.create(host, {
          data: { a: '', b: '', radio: '', checkbox: [], sw: false, hiddenReq: '' },
          nodes: [
            { type: 'input', id: 'a', label: 'A', requiredAny: ['a', 'b'] },
            { type: 'input', id: 'b', label: 'B' },
            { type: 'radio-group', id: 'radio', label: '单选', required: true, options: [
              { value: 'x', label: 'X' }, { value: 'y', label: 'Y' }] },
            { type: 'checkbox-group', id: 'checkbox', label: '多选', required: true, options: [
              { value: 'p', label: 'P' }, { value: 'q', label: 'Q' }] },
            { type: 'switch', id: 'sw', label: '开关', required: true },
            { type: 'input', id: 'hiddenReq', label: '隐藏必填', required: true,
              deps: [{ when: { all: [] }, then: { visible: false } }] }
          ]
        });
        var rootA = host.querySelector('[data-kui-field-id="a"]');
        var rootB = host.querySelector('[data-kui-field-id="b"]');
        assert(rootA && rootA.className.indexOf('is-required') >= 0, '必填组成员 A 未标记 is-required');
        assert(rootB && rootB.className.indexOf('is-required') >= 0, '必填组成员 B 在组未填时也应标记 is-required');
        form.setValue('a', '值');
        form.validate();
        assert(rootB && rootB.className.indexOf('is-required-optional') >= 0, '必填组已填后 B 应转为 is-required-optional（星号消失）');
        var res = form.validate();
        assert(res && res.valid === false, '空表单应校验不通过');
        form.setValue('a', '值');
        res = form.validate();
        assert(res && res.valid === false, '仅填 A 时单选/复选/开关仍未通过，整体应不通过');
        form.setValue('radio', 'x');
        form.setValue('checkbox', ['p']);
        form.setValue('sw', true);
        res = form.validate();
        assert(res && res.valid === true, '填齐单选/复选/开关且必填组有值时应通过（实际 ' + JSON.stringify(res && res.errors) + '）');
        form.setValue('a', '');
        res = form.validate();
        assert(res && res.valid === false, '清空必填组后应重新不通过');
        form.destroy();
        if (host.parentNode) { host.parentNode.removeChild(host); }
        return '表单必填 OK';
      });
      currentSection = 21;   console.log('\n[21] 头像显示与更换方式（v1.3.1）');

  {
    var avatarCss = fs.readFileSync(path.join(ROOT, 'src/styles/avatar.css'), 'utf8');
    var avatarJs = fs.readFileSync(path.join(ROOT, 'src/core/avatar.js'), 'utf8');
    var appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/app.json'), 'utf8'));
    var avatarPage = fs.readFileSync(path.join(ROOT, 'standalone/avatar.html'), 'utf8');
    var logoAvatar = avatarCss.slice(avatarCss.indexOf('.kui-menu__logo--avatar'));
    logoAvatar = logoAvatar.slice(0, logoAvatar.indexOf('}'));
    check('菜单头像不再被 logo 斜切裁掉', function () {
      assert(logoAvatar.indexOf('clip-path: none') >= 0, 'logo--avatar 未去掉 clip-path');
      assert(logoAvatar.indexOf('overflow: visible') >= 0, 'logo--avatar 未放开 overflow');
      assert(avatarCss.indexOf('inset: -5px') >= 0, '齿轮框外扩规则丢失');
    });
    check('头像更换方式可配置（url / file）', function () {
      assert(avatarJs.indexOf("mode: 'url'") >= 0, 'avatar.js 缺少 picker.mode 默认值');
      assert(avatarJs.indexOf("pickerOptions.mode === 'file'") >= 0, 'openPicker 未按 mode 分流');
      assert(avatarJs.indexOf('function pickFile(') >= 0, 'avatar.js 缺少 pickFile()');
      assert(avatarJs.indexOf('FileReader') >= 0, 'pickFile 未读取本地文件');
      assert(avatarJs.indexOf('maxSizeMB') >= 0, '缺少图片大小上限');
      assert(avatarJs.indexOf("input.type = 'file'") >= 0, 'pickFile 未创建 file input');
      assert(appJson.avatar && appJson.avatar.picker && appJson.avatar.picker.mode, 'app.json 缺少 avatar.picker.mode');
      assert(/btnPickerFile/.test(avatarPage) && /mode: 'file'/.test(avatarPage), '测试页缺少 file 模式按钮');
      assert(/btnPickerUrl/.test(avatarPage), '测试页缺少 url 模式按钮');
    });
    var avatarApi = null;
    try {
      var avHost = win.document.createElement('div');
      win.document.body.appendChild(avHost);
      avatarApi = KUI.avatar.create(avHost, { editable: true, persist: false, url: '' });
    } catch (err) { avatarApi = null; }
    check('头像实例暴露 pickFile / openPicker(mode)', function () {
      assert(avatarApi, 'KUI.avatar.create 失败');
      assert(typeof avatarApi.pickFile === 'function', '实例缺少 pickFile');
      var p = null;
      try { p = avatarApi.pickFile({ mode: 'file', maxSizeMB: 2 }); } catch (err) { p = null; }
      assert(p && typeof p.then === 'function', 'pickFile 未返回 Promise');
      avatarApi.destroy && avatarApi.destroy();
    });
  }

      currentSection = 22;   console.log('\n[22] 齿轮转速可配置（v1.3.2）');

  {
    var avCss2 = fs.readFileSync(path.join(ROOT, 'src/styles/avatar.css'), 'utf8');
    var avJs2 = fs.readFileSync(path.join(ROOT, 'src/core/avatar.js'), 'utf8');
    var appJson2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/app.json'), 'utf8'));
    var demoAvatar = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/demos/avatar.json'), 'utf8'));
    var avPage2 = fs.readFileSync(path.join(ROOT, 'standalone/avatar.html'), 'utf8');
    check('齿轮转速配置已落到 CSS / JS / 配置 / 演示页', function () {
      assert(avCss2.indexOf('--kui-avatar-spin-duration, 48s') >= 0, 'CSS 未使用转速变量');
      assert(avCss2.indexOf('--kui-avatar-spin-direction, normal') >= 0, 'CSS 未支持方向变量');
      assert(avJs2.indexOf('function applySpin()') >= 0, 'avatar.js 缺少 applySpin()');
      assert(avJs2.indexOf('spinDuration: 48') >= 0, 'DEFAULTS/registry 缺少默认转速 48');
      assert(avJs2.indexOf('setSpinDuration') >= 0 && avJs2.indexOf('getSpinDuration') >= 0, '缺少转速 API');
      assert(appJson2.avatar && appJson2.avatar.frame && appJson2.avatar.frame.spinDuration === 48, 'app.json 缺少 avatar.frame.spinDuration=48');
      var spinGroup = (demoAvatar.groups || []).filter(function (g) { return g.id === 'spin'; })[0];
      assert(spinGroup && (spinGroup.items || []).length >= 5, 'demos/avatar.json 缺少转速分组（5 档）');
      assert(avPage2.indexOf('btnSpinFast') >= 0 && avPage2.indexOf('btnSpinStop') >= 0 && avPage2.indexOf('btnSpinRead') >= 0, '测试页缺少转速按钮');
    });
    var spinApi = null;
    var spinHost = null;
    try {
      spinHost = win.document.createElement('div');
      win.document.body.appendChild(spinHost);
      spinApi = KUI.avatar.create(spinHost, {
        editable: false, persist: false,
        url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>',
        frame: { spinDuration: 12 }
      });
    } catch (err) { spinApi = null; }
    check('运行时按 spinDuration 写 CSS 变量（含 0 停转 / 负数反向）', function () {
      assert(spinApi, 'avatar.create 失败');
      var el2 = spinApi.el;
      assert(el2.style.getPropertyValue('--kui-avatar-spin-duration') === '12s', '未写入 12s，实际=' + el2.style.getPropertyValue('--kui-avatar-spin-duration'));
      assert(el2.style.getPropertyValue('--kui-avatar-spin-direction') === 'normal', '方向应为 normal');
      assert(el2.classList.contains('kui-avatar--animated'), '12s 时应带 animated 类');
      spinApi.setSpinDuration(-6);
      assert(el2.style.getPropertyValue('--kui-avatar-spin-duration') === '6s', '负数取绝对值失败');
      assert(el2.style.getPropertyValue('--kui-avatar-spin-direction') === 'reverse', '负数应反向');
      spinApi.setSpinDuration(0);
      assert(!el2.classList.contains('kui-avatar--animated'), '0 时应移除 animated 类');
      assert(spinApi.getSpinDuration() === 0, 'getSpinDuration 应为 0');
    });
    check('默认转速 48s（未配置时）', function () {
      var host3 = win.document.createElement('div');
      win.document.body.appendChild(host3);
      var api3 = KUI.avatar.create(host3, { editable: false, persist: false });
      assert(api3.getSpinDuration() === 48, '默认应为 48，实际=' + api3.getSpinDuration());
      api3.destroy && api3.destroy();
    });
  }

  
  // ---------------------------------------------------------------- [23]
  currentSection = 23;   console.log('\n[23] 菜单 footer 布局（v1.3.3）');

  check('[23.1] components.css 已把 footer 改为可换行的两行布局', function () {
    var css = fs.readFileSync(path.join(ROOT, 'src/styles/components.css'), 'utf8');
    var m = css.match(/\.kui-menu__footer\s*\{([^}]*)\}/);
    assert(m, '.kui-menu__footer 规则缺失');
    assert(/flex-wrap\s*:\s*wrap/.test(m[1]), '.kui-menu__footer 缺少 flex-wrap: wrap');

    var t = css.match(/\.kui-menu__footer-title\s*\{([^}]*)\}/);
    assert(t, '.kui-menu__footer-title 规则缺失');
    assert(/order\s*:\s*1/.test(t[1]), 'footer-title 缺少 order: 1');
    assert(/flex\s*:\s*1\s+1\s+100%/.test(t[1]), 'footer-title 应独占一行（flex: 1 1 100%）');
    return 'two-row layout ok';
  });

  check('[23.2] footer 内按钮不再 100% 宽，折叠态只留图标', function () {
    var css = fs.readFileSync(path.join(ROOT, 'src/styles/components.css'), 'utf8');
    assert(css.indexOf('.kui-menu__footer-actions .kui-btn') !== -1, '缺少 footer 按钮覆盖规则');
    var m = css.match(/\.kui-menu__footer-actions \.kui-btn\s*\{([^}]*)\}/);
    assert(m, 'footer 按钮规则缺失');
    assert(/width\s*:\s*auto/.test(m[1]), 'footer 按钮应 width: auto（避免 block:true 撑爆）');
    assert(/flex\s*:\s*0\s+1\s+auto/.test(m[1]), 'footer 按钮应 flex: 0 1 auto');
    assert(/max-width\s*:\s*100%/.test(m[1]), 'footer 按钮应有 max-width: 100%');
    assert(css.indexOf('.kui-menu.is-collapsed .kui-menu__footer-actions .kui-btn__text') !== -1,
      '折叠态应隐藏按钮文字');
    return 'button override ok';
  });

  check('[23.3] 运行时：footer 三个子元素齐全且按钮走 registry 渲染', function () {
    var host = doc.createElement('div');
    doc.body.appendChild(host);
    var footer = {
      title: '灵装回路',
      version: 'KurumiUI',
      actions: [{ type: 'button', props: { text: '切换灵装主题', icon: 'palette', size: 'sm', variant: 'ghost', block: true } }]
    };
    var inst = KUI.menu.create(host, { items: [{ type: 'item', id: 'a', label: 'A' }], footer: footer });
    var footEl = host.querySelector('.kui-menu__footer');
    assert(footEl, 'footer 未渲染');
    assert(footEl.querySelector('.kui-menu__footer-title'), '缺少 title 元素');
    assert(footEl.querySelector('.kui-menu__footer-version'), '缺少 version 元素');
    var btn = footEl.querySelector('.kui-menu__footer-actions .kui-btn');
    assert(btn, 'footer 动作按钮未按 button 控件渲染（缺少 .kui-btn）');
    assert(btn.classList.contains('kui-btn--block'), 'block: true 应保留（由 CSS 覆盖为 auto，不删类）');
    inst.destroy();
    host.parentNode.removeChild(host);
    return 'footer structure ok';
  });


  currentSection = 24;   console.log('\n[24] 悬浮提示文案随状态更新（v1.3.4）');

  check('[24.1] tooltip 以最新 title 为准，并在还原时清掉临时 data-kui-tip', function () {
    var t = fs.readFileSync(path.join(ROOT, 'src/core/tooltip.js'), 'utf8');
    assert(t.indexOf('以「当前 title」为最高优先级') >= 0, 'tooltip.js 缺少 title 优先逻辑');
    assert(t.indexOf("el.removeAttribute('data-kui-tip')") >= 0, 'restore 未清理临时 data-kui-tip');
    assert(t.indexOf('function watchTarget') >= 0 && t.indexOf('MutationObserver') >= 0, '缺少 title 变化监听');
    assert(t.indexOf('update: function (el)') >= 0, '缺少 tooltip.update API');
    assert(t.indexOf("version: '1.0.6'") >= 0, 'tooltip 版本号未升到 1.0.6');
    assert(/^1\.\d+\.\d+$/.test(KUI.version), 'KUI.version 格式异常：' + KUI.version);
  });

  check('[24.2] 运行时：tooltip 版本与 update API 就绪（真实文案刷新由真机探针覆盖）', function () {
    assert(win.KUI.tooltip, 'KUI.tooltip 未加载');
    assert(win.KUI.tooltip.version === '1.0.6', 'tooltip 版本不是 1.0.6');
    assert(typeof win.KUI.tooltip.update === 'function', 'tooltip.update 缺失');
    assert(typeof win.KUI.tooltip.show === 'function' && typeof win.KUI.tooltip.hide === 'function', 'show/hide 缺失');
  });


  currentSection = 25;   console.log('\n[25] 源码与测试一致性（v1.3.5）');
  check('版本号四处一致', function () {
    var pkg = require('../package.json');
    var frameSrc = fs.readFileSync(path.join(ROOT, 'src/frame/kui-frame.js'), 'utf8');
    var domSrc = fs.readFileSync(path.join(ROOT, 'src/core/dom-enhance.js'), 'utf8');
    var m = domSrc.match(/var VERSION = '([0-9.]+)'/);
    assert(KUI.version === pkg.version, 'KUI.version=' + KUI.version + ' ≠ package=' + pkg.version);
    assert(frameSrc.indexOf("'" + KUI.version + "'") >= 0, 'kui-frame.js 的版本 fallback 未同步');
    assert(m && m[1] === KUI.version, 'dom-enhance.js VERSION 未同步');
    return 'v' + KUI.version;
  });
  check('kui-all 由模块清单派生', function () {
    var mods = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/kui-modules.json'), 'utf8'));
    var all = fs.readFileSync(path.join(ROOT, 'src/core/kui-all.js'), 'utf8');
    assert(/自动生成|AUTO-GENERATED/i.test(all), 'kui-all.js 缺自动生成标记');
    var app = (mods.profiles.app && mods.profiles.app.files) || [];
    var miss = app.filter(function (f) { return f !== 'config/bundle.js' && all.indexOf(f) < 0; });
    assert(!miss.length, 'kui-all 漏模块：' + miss.join(','));
    return app.length + ' 个模块';
  });
  check('20 个 HTML 均为单入口装配', function () {
    var files = ['index.html']
      .concat(fs.readdirSync(path.join(ROOT, 'pages')).filter(function (f) { return /\.html$/.test(f); }).map(function (f) { return 'pages/' + f; }))
      .concat(fs.readdirSync(path.join(ROOT, 'standalone')).filter(function (f) { return /\.html$/.test(f); }).map(function (f) { return 'standalone/' + f; }));
    var bad = [];
    files.forEach(function (rel) {
      var s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      if (s.indexOf('src/core/kui-all.js') < 0) { bad.push(rel + '(无 kui-all)'); }
      if (s.indexOf('src/core/theme-boot.js') < 0) { bad.push(rel + '(无 theme-boot)'); }
    });
    assert(!bad.length, bad.join(', '));
    return files.length + ' 个页面';
  });
currentSection = 26;   console.log('\n[26] 菜单搜索：多结果先展示再选择（v1.3.6）');
  check('搜索实现：评分排序 + 候选弹窗 + 父级动作', function () {
    var src = fs.readFileSync(path.join(ROOT, 'src/app/bootstrap.js'), 'utf8');
    ['flattenMenuWithPath', 'scoreMenu', 'searchMenu', 'showSearchPicker', 'openSearchById',
     'app.openSearchById', "id: 'search-picker'", 'KUI.search'].forEach(function (key) {
      assert(src.indexOf(key) >= 0, 'bootstrap.js 缺少：' + key);
    });
    return 'search pipeline ok';
  });
  check('KUI.search.menu：多匹配按评分降序', function () {
    assert(KUI.search && typeof KUI.search.menu === 'function', 'KUI.search.menu 未暴露');
    var hits = KUI.search.menu('表单');
    assert(hits.length >= 2, '「表单」应命中多个菜单，实际 ' + hits.length);
    for (var i = 1; i < hits.length; i++) {
      assert(hits[i - 1].score >= hits[i].score, '评分未降序：' + hits[i - 1].label + '/' + hits[i].label);
    }
    assert(hits[0].path && hits[0].path.indexOf('/') >= 0, '候选缺少父路径');
    return hits.length + ' 个候选，最高 ' + hits[0].label + '(' + hits[0].score + ')';
  });
  check('KUI.search.picker：弹出候选列表（最多 10 项）', function () {
    var hits = KUI.search.menu('表单');
    assert(hits.length >= 2, '候选数量不足');
    KUI.search.picker('表单', hits);
    /* dom-stub 下没有全局 document，统一用 env.document */
    var layers = ((typeof doc !== 'undefined' && doc) ? doc : env.document).querySelectorAll('.kui-dialog-layer');
    assert(layers.length >= 1, '候选弹窗未创建');
    var rec = KUI.dialog.get('search-picker');
    assert(rec, 'dialog.get(search-picker) 为空');
    var nodes = (rec.config && rec.config.nodes) || [];
    var buttons = nodes.filter(function (n) { return n && n.type === 'button'; });
    assert(buttons.length === Math.min(10, hits.length), '候选按钮数量应为 min(10,' + hits.length + ')，实际 ' + buttons.length);
    assert(buttons[0].on && buttons[0].on.click, '候选按钮未绑定点击动作');
    KUI.dialog.close('search-picker');
    return buttons.length + ' 个候选按钮';
  });
  check('KUI.search.open：按 id 打开指定菜单', function () {
    /* 未指定关键词时按「候选列表第一条」打开，验证 open(id) 真实可用 */
    var hits = KUI.search.menu('主题');
    assert(hits.length >= 1, '未命中「主题」相关菜单');
    var target = hits[0];
    var before = KUI.app.instance.tabs.count();
    KUI.search.open(target.id);
    var after = KUI.app.instance.tabs.count();
    assert(after >= before, '打开候选后标签数异常（' + before + '→' + after + '）');
    return 'opened ' + target.label;
  });


currentSection = 27;   console.log('\n[27] 加载层组件：可拆装 + 进度驱动时钟指针（v1.3.7）');
  check('[27.1] 注册与静态 API：type=boot 已注册，KUI.bootLayer 就绪', function () {
    var def = KUI.registry.get('boot');
    assert(def, 'registry 未注册 boot 类型');
    assert(def.category === 'shell', 'boot.category 应为 shell，实际 ' + def.category);
    assert(KUI.bootLayer, 'KUI.bootLayer 缺失');
    ['create', 'attach', 'configure', 'instance', 'handsAt', 'destroy'].forEach(function (k) {
      assert(typeof KUI.bootLayer[k] === 'function', 'KUI.bootLayer.' + k + ' 缺失');
    });
    return 'type boot · KUI.bootLayer v' + KUI.bootLayer.version;
  });

  check('[27.2] handsAt：0/12.5/25/50/75/100% 的读数与两针角度', function () {
    var cases = [
      [0, '12:00', 0, 0], [12.5, '01:30', 45, 180], [25, '03:00', 90, 0],
      [50, '06:00', 180, 0], [75, '09:00', 270, 0], [100, '12:00', 360, 0]
    ];
    cases.forEach(function (c) {
      var h = KUI.bootLayer.handsAt(c[0]);
      assert(h.clockText === c[1], c[0] + '% 读数应为 ' + c[1] + '，实际 ' + h.clockText);
      assert(Math.abs(h.hourAngle - c[2]) < 0.01, c[0] + '% 时针应为 ' + c[2] + '°，实际 ' + h.hourAngle);
      assert(Math.abs(h.minuteAngle - c[3]) < 0.01, c[0] + '% 分针应为 ' + c[3] + '°，实际 ' + h.minuteAngle);
    });
    /* 超范围入参要被夹到 0..100 */
    assert(KUI.bootLayer.handsAt(-10).percent === 0 && KUI.bootLayer.handsAt(180).percent === 100, 'handsAt 未夹取范围');
    return '6 个采样点 + 范围夹取';
  });

  check('[27.3] dom-stub：create() 内嵌实例的进度/指针/阶段文案/销毁', function () {
    var host = env.document.createElement('div');
    env.document.body.appendChild(host);
    var inst = KUI.bootLayer.create(host, {
      mode: 'inline', title: 'T',
      stages: [{ step: 1, text: '阶段一', progress: 10 }, { step: 2, text: '阶段二', progress: 50 }]
    });
    assert(inst && inst.el && inst.el.nodeType, 'create 未返回实例');
    assert(inst.el.className.indexOf('kui-boot--inline') >= 0, 'mode=inline 未生效');
    assert(!inst.el.id, 'create() 实例不应占用 #kui-boot id');
    inst.setProgress(25);
    assert(inst.getProgress() === 25, 'setProgress 未记录进度');
    assert(inst.el.getAttribute('data-boot-percent') === '25', 'data-boot-percent 未更新');
    var hour = inst.el.querySelector('.kui-boot__hand--hour');
    var minute = inst.el.querySelector('.kui-boot__hand--minute');
    assert(hour && /rotate\(90deg\)/.test(hour.style.transform), '时针未转到 90°，实际 ' + (hour && hour.style.transform));
    assert(minute && /rotate\(0deg\)/.test(minute.style.transform), '分针应为 0°，实际 ' + (minute && minute.style.transform));
    var text = inst.el.querySelector('[data-boot-text]');
    assert(text && text.textContent === '正在加载界面配置…', '初始文案应回退到默认值，实际 ' + (text && text.textContent));
    inst.setStep(2);
    assert(text.textContent === '阶段二', 'setStep 未应用阶段文案');
    assert(inst.getProgress() === 50, 'setStep 未应用阶段进度');
    var st = inst.getState();
    assert(st.mode === 'inline' && st.step === 2 && st.hands.clockText === '06:00', 'getState 结果异常');
    inst.destroy();
    assert(!host.childNodes.length, 'destroy 未移除节点');
    return '25%→03:00/90°/0°；阶段 2→50%';
  });

  check('[27.4] 可拆装：attach() 接管静态骨架，bootstrap 缺组件时走 legacy', function () {
    /* 先清掉启动流程可能残留的单例，确保测的是「接管」这条路径 */
    KUI.bootLayer.destroy();
    var shell = env.document.createElement('div');
    shell.setAttribute('id', 'kui-boot');
    shell.className = 'kui-boot';
    env.document.body.appendChild(shell);
    var inst = KUI.bootLayer.attach(null);
    assert(inst && inst.el === shell, 'attach 未接管既有 #kui-boot 节点');
    assert(KUI.bootLayer.instance() === inst, 'attach 后 instance() 未指向单例');
    assert(KUI.bootLayer.attach(null) === inst, '重复 attach 不应新建实例');
    inst.destroy();

    var bs = fs.readFileSync(path.join(ROOT, 'src/app/bootstrap.js'), 'utf8');
    ['attachBootLayer', 'configureBootLayer', 'bootConfigOf', 'KUI.bootLayer.attach'].forEach(function (k) {
      assert(bs.indexOf(k) >= 0, 'bootstrap.js 缺少 ' + k);
    });
    ['querySelector(\'[data-boot-text]\')', 'kui-boot__error'].forEach(function (k) {
      assert(bs.indexOf(k) >= 0, 'bootstrap.js 缺少 legacy 分支标记：' + k);
    });
    var app = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/app.json'), 'utf8'));
    assert(app.boot && Array.isArray(app.boot.stages) && app.boot.stages.length === 4, 'app.json 的 boot.stages 应为 4 段');
    var text = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/text.json'), 'utf8'));
    assert(text.boot && text.boot.loading, 'text.json 缺少 boot.loading');
    var mods = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/kui-modules.json'), 'utf8'));
    ['app', 'standalone'].forEach(function (p) {
      assert(mods.profiles[p].files.indexOf('src/components/boot.js') >= 0, p + ' profile 缺少 boot.js');
    });
    return '静态骨架接管 + 委派标记 + 配置齐备';
  });

  check('[27.5] 独立测试页 standalone/boot.html：单入口 + 导航 + JSON 渲染示例', function () {
    var rel = 'standalone/boot.html';
    assert(fs.existsSync(path.join(ROOT, rel)), '缺少 ' + rel);
    var html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    ['src/core/kui-all.js', 'data-kui-profile="standalone"', 'data-kui-auto="false"',
     'src/styles/boot.css', 'handsAt', 'KUI.bootLayer.create', "renderNode({ type: 'boot'", "'boot'"].forEach(function (k) {
      assert(html.indexOf(k) >= 0, 'boot.html 缺少：' + k);
    });
    /* 所有独立页导航都收录 boot */
    fs.readdirSync(path.join(ROOT, 'standalone')).filter(function (f) { return /\.html$/.test(f); }).forEach(function (f) {
      var s = fs.readFileSync(path.join(ROOT, 'standalone/' + f), 'utf8');
      assert(s.indexOf("'boot'") >= 0 || s.indexOf('"boot"') >= 0, 'standalone/' + f + ' 导航未收录 boot');
    });
    return 'boot.html + 12 页导航';
  });

currentSection = 28;  console.log('\n[28] 配置接线：app.json 的 boot 段 / app.* 元信息（v1.3.8）');

  check('[28.1] bootstrap 把 app.json 的 boot 段真正应用到启动层', function () {
    KUI.bootLayer.destroy();
    var shell = env.document.createElement('div');
    shell.setAttribute('id', 'kui-boot');
    shell.className = 'kui-boot';
    env.document.body.appendChild(shell);
    KUI.bootLayer.attach(null);
    var cfg = { boot: { clock: { enabled: true, mode: 'spin', size: 96, ticks: 8 }, bar: { enabled: true, mode: 'progress' }, meta: false, stages: [{ step: 1, text: '阶段一', progress: 10 }, { step: 2, text: '阶段二', progress: 55 }] } };
    KUI.boot.applyBootConfig(cfg, { boot: { loading: '接线测试' } });
    var inst = KUI.bootLayer.instance();
    assert(!!inst, 'applyBootConfig 未返回实例');
    var applied = KUI.boot.appliedBootConfig;
    assert(applied && applied.clock && applied.clock.size === 96, 'appliedBootConfig.clock.size 应为 96，实际 ' + JSON.stringify(applied && applied.clock));
    assert(applied.clock.mode === 'spin', 'clock.mode 未应用');
    assert(applied.meta === false, 'meta=false 未应用');
    assert(inst && inst.config && inst.config.stages.length === 2, 'stages 未被替换');
    inst.setStep(2);
    assert(inst.getProgress() === 55, 'setStep 未命中新阶段进度，实际 ' + inst.getProgress());
    assert(env.document.documentElement.getAttribute('data-kui-boot') !== 'off', 'enabled 未关闭时不应标记 off');
    return 'clock.size=96/spin/meta=false/stages=2' ;
  });

  check('[28.2] boot.enabled=false 时销毁实例并移除静态骨架', function () {
    var out = KUI.boot.applyBootConfig({ boot: { enabled: false } }, null);
    assert(out === null, 'enabled=false 应返回 null');
    assert(KUI.boot.appliedBootConfig && KUI.boot.appliedBootConfig.enabled === false, 'appliedBootConfig 未记录 enabled=false');
    assert(!env.document.getElementById('kui-boot'), '静态骨架未被移除');
    assert(env.document.documentElement.getAttribute('data-kui-boot') === 'off', '未标记 data-kui-boot=off');
    KUI.bootLayer.destroy();
    return '销毁 + 移除 + data-kui-boot=off';
  });

  check('[28.3] app.* 元信息注入菜单品牌/页脚/顶部导航（v1.3.8 新增读取点）', function () {
    var appCfg = {
      app: { title: '测试终端', subtitle: '副标题', version: '9.9.9', logoIcon: 'clock', logoText: 'ZZ', copyright: '© 测试' },
      menu: { props: { brand: {}, footer: { title: '页脚标题' } } },
      menunav: { props: {} }
    };
    KUI.boot.applyAppMetaToConfig(appCfg);
    var b = appCfg.menu.props.brand;
    var f = appCfg.menu.props.footer;
    assert(b.title === '测试终端', 'brand.title 未注入');
    assert(b.subtitle === '副标题', 'brand.subtitle 未注入');
    assert(b.logoIcon === 'clock', 'brand.logoIcon 未注入');
    assert(b.logoText === 'ZZ', 'brand.logoText 未注入');
    assert(f.version === 'v9.9.9', 'footer.version 未注入，实际 ' + f.version);
    assert(f.copyright === '© 测试', 'footer.copyright 未注入');
    assert(appCfg.menunav.props.title === '测试终端', 'menunav.title 未注入');
    /* 已显式配置的字段不能被覆盖 */
    var appCfg2 = { app: { title: 'T', logoText: 'KUI' }, menu: { props: { brand: { title: '已有标题' }, footer: { version: 'v自定义' } } } };
    KUI.boot.applyAppMetaToConfig(appCfg2);
    assert(appCfg2.menu.props.brand.title === '已有标题', '显式 brand.title 被覆盖');
    assert(appCfg2.menu.props.footer.version === 'v自定义', '显式 footer.version 被覆盖');
    return '7 个字段注入 + 显式值优先';
  });

  check('[28.4] 菜单组件渲染 brand.logoText 徽记与页脚副标题/版权', function () {
    var host = env.document.createElement('div');
    env.document.body.appendChild(host);
    var m = KUI.menu.create(host, {
      brand: { title: '品牌', subtitle: '子标题', logoIcon: 'clock', logoText: 'KUI' },
      items: [{ id: 'a', label: '甲' }],
      footer: { title: '页脚', subtitle: '页脚副标题', version: 'v1.2.3', copyright: '© 作者' }
    });
    var badge = host.querySelector('.kui-menu__logo-text');
    assert(badge && badge.textContent === 'KUI', 'brand.logoText 未渲染');
    var sub = host.querySelector('.kui-menu__footer-subtitle');
    assert(sub && sub.textContent === '页脚副标题', 'footer.subtitle 未渲染');
    var cp = host.querySelector('.kui-menu__footer-copyright');
    assert(cp && cp.textContent === '© 作者', 'footer.copyright 未渲染');
    var ver = host.querySelector('.kui-menu__footer-version');
    assert(ver && ver.textContent === 'v1.2.3', 'footer.version 未渲染');
    m.destroy();
    return 'logoText + footer.subtitle + copyright';
  });

  check('[28.5] 3 个曾「无读取点」的配置字段现已生效（escClosable / clock.smooth / keepAlive）', function () {
    /* ① dialog.escClosable → closeOnEsc */
    var before = KUI.dialog.config().closeOnEsc;
    KUI.dialog.config({ escClosable: false });
    assert(KUI.dialog.config().closeOnEsc === false, 'escClosable=false 未映射到 closeOnEsc');
    KUI.dialog.config({ closeOnEsc: before });

    /* ② boot.clock.smooth → data-boot-smooth */
    KUI.bootLayer.destroy();
    var host = env.document.createElement('div');
    env.document.body.appendChild(host);
    var inst = KUI.bootLayer.create(host, { mode: 'inline', clock: { smooth: false } });
    assert(inst && inst.el, 'bootLayer.create 未返回实例');
    assert(inst.el.getAttribute('data-boot-smooth') === 'off', 'smooth=false 未写入 data-boot-smooth');
    inst.configure({ clock: { smooth: true } });
    assert(inst.el.getAttribute('data-boot-smooth') === 'on', 'configure 后 data-boot-smooth 未更新');
    inst.destroy();

    /* ③ tabs.keepAlive=false → 切走卸载（DOM stub 只做结构校验） */
    var tabsHost = env.document.createElement('div');
    env.document.body.appendChild(tabsHost);
    var tabs = KUI.tabs.create(tabsHost, { maxTabs: 4, keepAlive: false });
    tabs.open({ id: 'sm-ka-a', title: 'A', url: 'pages/home.html' });
    tabs.open({ id: 'sm-ka-b', title: 'B', url: 'pages/profile.html' });
    assert(tabsHost.querySelectorAll('.kui-tabs__pane').length === 1,
      'keepAlive=false 时切走后 pane 应只剩 1 个');
    tabs.activate('sm-ka-a');
    assert(tabsHost.querySelectorAll('.kui-tabs__pane').length === 1, '切回后应重建 pane');
    tabs.destroy();
    return 'escClosable + smooth + keepAlive';
  });

currentSection = 29;  console.log('\n[29] 配置接线：v1.3.9 五类缺陷修复');

  check('[29.1] menu.props.width / collapsedWidth 注入正确的 CSS 变量（v1.3.9）', function () {
    var host = env.document.createElement('div');
    env.document.body.appendChild(host);
    var inst = KUI.menu.create(host, {
      width: 320, collapsedWidth: 88,
      brand: { title: 'T', subtitle: 'S' },
      items: [{ id: 'a', label: '甲' }]
    });
    var root = host.querySelector('.kui-menu');
    assert(root, '菜单根节点未渲染');
    var w = root.style.getPropertyValue('--kui-menu-width');
    var cw = root.style.getPropertyValue('--kui-menu-width-collapsed');
    var legacy = root.style.getPropertyValue('--kui-menu-w');
    assert(w === '320px', '--kui-menu-width 应为 320px，实际 ' + JSON.stringify(w));
    assert(cw === '88px', '--kui-menu-width-collapsed 应为 88px，实际 ' + JSON.stringify(cw));
    assert(legacy === '320px', '兼容变量 --kui-menu-w 应为 320px，实际 ' + JSON.stringify(legacy));
    inst.destroy();
    return 'width=320px/collapsedWidth=88px/legacy 同步';
  });

  check('[29.2] menunav.props.breadcrumb.max 有读取点（v1.3.9）', function () {
    function countEllipsis(props) {
      var host = env.document.createElement('div');
      env.document.body.appendChild(host);
      var inst = KUI.menunav.create(host, props);
      var n = host.querySelectorAll('.kui-menunav__crumb-ellipsis').length;
      inst.destroy();
      return n;
    }
    var items = [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }, { label: 'E' }];
    var n1 = countEllipsis({ title: 'T', breadcrumb: { enabled: true, max: 3, home: { label: '首页' }, items: items } });
    assert(n1 === 1, 'breadcrumb.max=3 时应折叠出 1 个省略号，实际 ' + n1);
    var n2 = countEllipsis({ title: 'T', maxBreadcrumb: 3, breadcrumb: { enabled: true, home: { label: '首页' }, items: items } });
    assert(n2 === 1, '旧写法 maxBreadcrumb=3 仍应生效，实际 ' + n2);
    var n3 = countEllipsis({ title: 'T', breadcrumb: { enabled: true, home: { label: '首页' }, items: items } });
    assert(n3 === 0, '未配置 max 时不应折叠，实际 ' + n3);
    return 'breadcrumb.max / maxBreadcrumb 双写法生效';
  });

  check('[29.3] 设置弹窗返回值真正应用（shellName / density / startTab / remember）', function () {
    var applied = { title: null };
    var appStub = { setTitle: function (t) { applied.title = t; }, setCollapsed: function () {} };
    KUI.boot.applySettings(appStub, { shellName: '结界终端', density: 'compact', startTab: 'home', remember: false });
    assert(applied.title === '结界终端', 'shellName 未应用到 app.setTitle，实际 ' + JSON.stringify(applied.title));
    var root = env.document.documentElement;
    var ls = env.window && env.window.localStorage;
    assert(root.getAttribute('data-kui-density') === 'compact', 'density 未写入 data-kui-density');
    assert(ls && ls.getItem('kui-start-tab') === 'home', 'startTab 未持久化');
    assert(ls && ls.getItem('kui-remember-tab') === '0', 'remember 未持久化');
    assert(ls && ls.getItem('kui-last-tab') === null, 'remember=false 时应清空 lastTab');
    KUI.boot.applySettings(appStub, { collapsed: true });
    return 'shellName/density/startTab/remember + 旧字段兼容';
  });

  check('[29.4] select 的 autofocus 真正生效（v1.3.9）', function () {
    if (!KUI.registry.get('select')) { return 'SKIP: select 未注册（standalone profile）'; }
    var host = env.document.createElement('div');
    env.document.body.appendChild(host);
    var node = KUI.renderNode({ type: 'select', props: { options: [{ value: 'd', label: '默认' }, { value: 'a', label: 'A' }], model: 'a', autofocus: true } });
    host.appendChild(node.el || node);
    var active = env.document.activeElement;
    assert(active && active !== env.document.body, 'autofocus:true 时未聚焦任何元素');
    try { active.blur(); } catch (e) { /* ignore */ }
    return 'activeElement=' + (active.className || active.tagName);
  });

currentSection = 6;   console.log('\n[6] 控制台与错误汇总');
      check('加载与启动期无 console.error', function () {
        assert(consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
      });
      if (consoleWarns.length) {
        console.log('  ! 警告 ' + consoleWarns.length + ' 条:');
        consoleWarns.slice(0, 6).forEach(function (w) { console.log('      ' + w.slice(0, 160)); });
      }
    })
    .catch(function (e) {
      bad('冒烟流程异常', e);
    })
    .then(function () {
      try { env.destroy(); } catch (e) { /* ignore */ }
      console.log('\n=== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 ===');
      if (skippedChecks) {
        console.log('（--only=' + ONLY.join(',') + ' 生效：跳过 ' + skippedChecks + ' 项断言；未列出的分节也需关注时请去掉 --only）');
      }
      if (failures.length) {
        console.log('\n失败项:');
        failures.forEach(function (f) { console.log('  - ' + f); });
      }
      process.exitCode = fail ? 1 : 0;
    });
}

if (require.main === module) main();

module.exports = { main: main, readScriptOrder: readScriptOrder };

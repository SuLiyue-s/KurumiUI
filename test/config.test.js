/*!
 * KurumiUI · test/config.test.js
 * ---------------------------------------------------------------
 * 配置与主题一致性测试（契约 §13 / §15）：
 *   1. 所有 config/**\/*.json + src/themes.json 可被 JSON.parse；
 *   2. app.json 必需字段、结构、跨文件主题引用；
 *   3. themes.json 六套主题齐全、default 有效、tokens 以 --kui- 开头、
 *      art.layers.kind 合法；demos/theme.json 与 themes.json 对齐；
 *   4. 配置里作为「渲染节点」出现的所有 node.type 都能在
 *      KUI.registry（dom-stub 中加载 core + controls + 组件后）查到。
 *
 * Node 13.14 兼容，零外部依赖。
 */

'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');
var loader = require('./load-kui');

var REQUIRED_THEMES = ['kurumi', 'kurumi-angel', 'starry', 'sakura', 'abyss', 'dawn'];

/* theme-art.js 文档声明的合法层 kind（契约 §13） */
var ART_LAYER_KINDS = [
  'glow', 'grid', 'rays', 'scanline', 'noise', 'vignette',
  'moon', 'stars', 'sakura', 'feather', 'clock'
];

/* 每套主题都必须覆盖的最小 token 集合（base.css 默认值之上的核心变量） */
var CORE_TOKENS = [
  '--kui-bg-0', '--kui-bg-1', '--kui-text-1', '--kui-text-2',
  '--kui-accent', '--kui-border', '--kui-control-bg',
  '--kui-popup-bg', '--kui-shadow-1'
];

var NODE_TYPE_RE = /^[a-z][a-z0-9-]*$/;

module.exports = function register(suite, ctx) {
  var root = ctx.root;
  var jsonCache = Object.create(null);

  function readJson(rel) {
    if (jsonCache[rel] === undefined) {
      jsonCache[rel] = loader.readJsonFile(root, rel);
    }
    return jsonCache[rel];
  }

  function listJsonFiles(relDir) {
    var dir = path.join(root, relDir);
    var out = [];
    function walk(absDir) {
      var names;
      try {
        names = fs.readdirSync(absDir);
      } catch (e) {
        return;
      }
      names.sort();
      for (var i = 0; i < names.length; i++) {
        var name = names[i];
        if (name.charAt(0) === '.') continue;
        var abs = path.join(absDir, name);
        var st;
        try {
          st = fs.statSync(abs);
        } catch (e2) {
          continue;
        }
        if (st.isDirectory()) {
          walk(abs);
        } else if (/\.json$/i.test(name)) {
          out.push(path.relative(root, abs).split(path.sep).join('/'));
        }
      }
    }
    walk(dir);
    return out;
  }

  function demoFiles() {
    return loader.listDemos(root).map(function (name) {
      return 'config/demos/' + name;
    });
  }

  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  /**
   * 收集配置中的「渲染节点」。
   * 判定规则（避免把 props.type / 动作描述符误当成节点类型）：
   *   - 位于 nodes 数组中的对象（强制视为节点）；
   *   - 或自身带 type 字符串且带 props 对象的对象（如 demo 顶层的 form/menu 节点）。
   * 只递归节点的 props.children / children / props.nodes，不扫其它 props。
   */
  function collectNodes(value, file, trail, out, forceNode) {
    var i;
    if (Array.isArray(value)) {
      for (i = 0; i < value.length; i++) {
        collectNodes(value[i], file, trail + '[' + i + ']', out, forceNode);
      }
      return;
    }
    if (!isPlainObject(value)) return;

    var isNode = forceNode === true ||
      (typeof value.type === 'string' && isPlainObject(value.props));
    if (isNode) {
      out.push({
        type: typeof value.type === 'string' ? value.type : null,
        file: file,
        trail: trail,
        display: file + (trail ? ':' + trail.replace(/^\./, '') : '')
      });
      if (isPlainObject(value.props)) {
        if (Array.isArray(value.props.children)) {
          collectNodes(value.props.children, file, trail + '.props.children', out, true);
        }
        if (Array.isArray(value.props.nodes)) {
          collectNodes(value.props.nodes, file, trail + '.props.nodes', out, true);
        }
      }
      if (Array.isArray(value.children)) {
        collectNodes(value.children, file, trail + '.children', out, true);
      }
      return;
    }

    var keys = Object.keys(value);
    for (i = 0; i < keys.length; i++) {
      var key = keys[i];
      var child = value[key];
      if (key === 'nodes' && Array.isArray(child)) {
        collectNodes(child, file, trail + '.nodes', out, true);
      } else if (child && typeof child === 'object') {
        collectNodes(child, file, trail + '.' + key, out, false);
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * 用例 1：JSON 可解析
   * ------------------------------------------------------------------ */
  suite.test('配置 JSON 全部可解析（config/**/*.json + src/themes.json）', function () {
    var files = ['src/themes.json'].concat(listJsonFiles('config'));
    var mustExist = ['config/app.json', 'config/text.json', 'src/themes.json',
      'config/demos/menu.json', 'config/demos/form.json'];
    var missing = [];
    for (var m = 0; m < mustExist.length; m++) {
      if (!ctx.exists(mustExist[m])) missing.push(mustExist[m]);
    }
    assert.deepStrictEqual(missing, [], '缺少必需的配置文件: ' + missing.join(', '));

    var failures = [];
    for (var i = 0; i < files.length; i++) {
      var rel = files[i];
      try {
        var data = readJson(rel);
        if (!isPlainObject(data) && !Array.isArray(data)) {
          failures.push(rel + ': 顶层不是对象/数组');
        }
      } catch (e) {
        failures.push(rel + ': ' + (e && e.message ? e.message : String(e)));
      }
    }
    assert.deepStrictEqual(failures, [], '以下 JSON 无法解析：\n' + failures.join('\n'));
    assert.ok(files.length >= 9,
      '配置文件数量异常（期望 >= 9，实际 ' + files.length + '）：' + files.join(', '));
  });

  /* ------------------------------------------------------------------ *
   * 用例 2：app.json 必需字段与跨文件引用
   * ------------------------------------------------------------------ */
  suite.test('app.json 必需字段完整、主题/布局/菜单结构有效', function () {
    var app = readJson('config/app.json');
    var themes = readJson('src/themes.json');
    var themeIds = themes.themes.map(function (t) { return t.id; });

    assert.strictEqual(app.schema, 'kurumi-app/1', 'app.schema 必须为 "kurumi-app/1"');

    /* app 信息 */
    assert.ok(isPlainObject(app.app), 'app.app 必须是对象');
    var strFields = ['name', 'title', 'version', 'documentTitle', 'logoIcon', 'home'];
    for (var i = 0; i < strFields.length; i++) {
      var key = strFields[i];
      assert.strictEqual(typeof app.app[key], 'string', 'app.app.' + key + ' 必须是字符串');
      assert.ok(app.app[key].length > 0, 'app.app.' + key + ' 不能为空');
    }
    assert.ok(/^[0-9]+\.[0-9]+\.[0-9]+$/.test(app.app.version),
      'app.app.version 应为 x.y.z 语义版本，实际: ' + app.app.version);
    assert.ok(/\.html$/i.test(app.app.home),
      'app.app.home 应指向 html 页面，实际: ' + app.app.home);
    assert.ok(isPlainObject(app.app.loading), 'app.app.loading 必须是对象');
    assert.strictEqual(typeof app.app.loading.text, 'string', 'app.app.loading.text 必须是字符串');

    /* 设置弹窗表单 */
    assert.ok(isPlainObject(app.dialogs), 'app.dialogs 必须是对象');
    assert.ok(isPlainObject(app.dialogs.settings), 'app.dialogs.settings 必须是对象');
    var dlg = app.dialogs.settings;
    assert.ok(Array.isArray(dlg.nodes) && dlg.nodes.length > 0,
      'dialogs.settings.nodes 必须是非空数组');
    var seenIds = Object.create(null);
    for (var n = 0; n < dlg.nodes.length; n++) {
      var node = dlg.nodes[n];
      assert.ok(isPlainObject(node), 'dialogs.settings.nodes[' + n + '] 必须是对象');
      assert.strictEqual(typeof node.id, 'string', 'dialogs.settings.nodes[' + n + '].id 必须是字符串');
      assert.ok(node.id.length > 0, 'dialogs.settings.nodes[' + n + '].id 不能为空');
      assert.strictEqual(typeof node.type, 'string', 'dialogs.settings.nodes[' + n + '].type 必须是字符串');
      assert.ok(!seenIds[node.id], 'dialogs.settings.nodes 存在重复 id: ' + node.id);
      seenIds[node.id] = true;
    }

    /* 主题配置（跨文件） */
    assert.ok(isPlainObject(app.theme), 'app.theme 必须是对象');
    assert.strictEqual(typeof app.theme.default, 'string', 'app.theme.default 必须是字符串');
    assert.strictEqual(typeof app.theme.storageKey, 'string', 'app.theme.storageKey 必须是字符串');
    assert.ok(Array.isArray(app.theme.visible), 'app.theme.visible 必须是数组');
    assert.deepStrictEqual(app.theme.visible.slice().sort(), REQUIRED_THEMES.slice().sort(),
      'app.theme.visible 必须恰好包含契约要求的六套主题');
    for (var v = 0; v < app.theme.visible.length; v++) {
      assert.ok(themeIds.indexOf(app.theme.visible[v]) >= 0,
        'app.theme.visible 引用了不存在的主题: ' + app.theme.visible[v]);
    }
    assert.ok(themeIds.indexOf(app.theme.default) >= 0,
      'app.theme.default 引用了不存在的主题: ' + app.theme.default);

    /* 布局数值 */
    assert.ok(isPlainObject(app.layout), 'app.layout 必须是对象');
    assert.strictEqual(typeof app.layout.gap, 'number', 'app.layout.gap 必须是数字');
    assert.ok(isPlainObject(app.layout.menu), 'app.layout.menu 必须是对象');
    assert.ok(app.layout.menu.width > 0, 'app.layout.menu.width 必须为正数');
    assert.ok(app.layout.menu.collapsedWidth > 0, 'app.layout.menu.collapsedWidth 必须为正数');
    assert.ok(isPlainObject(app.layout.header), 'app.layout.header 必须是对象');
    assert.ok(app.layout.header.height > 0, 'app.layout.header.height 必须为正数');
    assert.ok(app.layout.tabbarHeight > 0, 'app.layout.tabbarHeight 必须为正数');

    /* 组件配置块 */
    assert.ok(isPlainObject(app.menu), 'app.menu 必须是对象');
    assert.strictEqual(app.menu.type, 'menu', 'app.menu.type 必须为 "menu"');
    assert.ok(isPlainObject(app.menu.props), 'app.menu.props 必须是对象');
    assert.ok(Array.isArray(app.menu.props.items) && app.menu.props.items.length > 0,
      'app.menu.props.items 必须是非空数组');

    assert.ok(isPlainObject(app.menunav), 'app.menunav 必须是对象');
    assert.strictEqual(app.menunav.type, 'menunav', 'app.menunav.type 必须为 "menunav"');
    assert.ok(isPlainObject(app.tabs), 'app.tabs 必须是对象');
    assert.strictEqual(app.tabs.type, 'tabs', 'app.tabs.type 必须为 "tabs"');

    /* 文案块 */
    assert.ok(isPlainObject(app.text), 'app.text 必须是对象');
    assert.ok(isPlainObject(app.text.app), 'app.text.app 必须是对象');
    assert.ok(isPlainObject(app.text.menu), 'app.text.menu 必须是对象');
  });

  /* ------------------------------------------------------------------ *
   * 用例 3：主题齐全 / token / art
   * ------------------------------------------------------------------ */
  suite.test('themes.json 六套主题齐全、tokens 与 art 合法', function () {
    var data = readJson('src/themes.json');
    var i;
    assert.ok(isPlainObject(data), 'themes.json 顶层必须是对象');
    assert.strictEqual(typeof data.default, 'string', 'themes.json.default 必须是字符串');
    assert.ok(Array.isArray(data.themes), 'themes.json.themes 必须是数组');
    assert.ok(data.themes.length >= 6,
      '至少需要六套主题，实际: ' + data.themes.length);

    var ids = [];
    for (i = 0; i < data.themes.length; i++) {
      assert.ok(isPlainObject(data.themes[i]), 'themes[' + i + '] 必须是对象');
      assert.strictEqual(typeof data.themes[i].id, 'string', 'themes[' + i + '].id 必须是字符串');
      ids.push(data.themes[i].id);
    }
    for (var r = 0; r < REQUIRED_THEMES.length; r++) {
      assert.ok(ids.indexOf(REQUIRED_THEMES[r]) >= 0,
        '缺少契约要求的主题: ' + REQUIRED_THEMES[r] + '（现有: ' + ids.join(', ') + '）');
    }
    var unique = [];
    for (i = 0; i < ids.length; i++) {
      assert.ok(unique.indexOf(ids[i]) < 0, '主题 id 重复: ' + ids[i]);
      unique.push(ids[i]);
    }
    assert.strictEqual(data.default, 'kurumi', 'themes.json.default 必须为 "kurumi"');
    assert.ok(ids.indexOf(data.default) >= 0, 'themes.json.default 必须是已存在的主题');

    for (i = 0; i < data.themes.length; i++) {
      var theme = data.themes[i];
      var where = '主题 ' + theme.id;
      assert.strictEqual(typeof theme.name, 'string', where + '.name 必须是字符串');
      assert.ok(theme.name.length > 0, where + '.name 不能为空');
      assert.ok(theme.scheme === 'light' || theme.scheme === 'dark',
        where + '.scheme 必须为 light|dark，实际: ' + theme.scheme);

      assert.ok(isPlainObject(theme.tokens), where + '.tokens 必须是对象');
      var tokenNames = Object.keys(theme.tokens);
      assert.ok(tokenNames.length >= 30,
        where + '.tokens 数量过少（' + tokenNames.length + '），主题应覆盖完整 token 集');
      for (var t = 0; t < tokenNames.length; t++) {
        var name = tokenNames[t];
        assert.ok(/^--kui-[a-z0-9-]+$/.test(name),
          where + ' 存在不合规 token 名: ' + name + '（必须以 --kui- 开头）');
        var value = theme.tokens[name];
        assert.ok(value !== null && value !== undefined && String(value).length > 0,
          where + ' token ' + name + ' 的值不能为空');
      }
      for (var c = 0; c < CORE_TOKENS.length; c++) {
        assert.ok(tokenNames.indexOf(CORE_TOKENS[c]) >= 0,
          where + ' 缺少核心 token: ' + CORE_TOKENS[c]);
      }

      assert.ok(isPlainObject(theme.art), where + '.art 必须是对象');
      assert.strictEqual(typeof theme.art.motif, 'string', where + '.art.motif 必须是字符串');
      assert.ok(Array.isArray(theme.art.layers), where + '.art.layers 必须是数组');
      assert.ok(theme.art.layers.length > 0, where + '.art.layers 不能为空');
      for (var l = 0; l < theme.art.layers.length; l++) {
        var layer = theme.art.layers[l];
        assert.ok(isPlainObject(layer), where + '.art.layers[' + l + '] 必须是对象');
        assert.strictEqual(typeof layer.kind, 'string',
          where + '.art.layers[' + l + '].kind 必须是字符串');
        assert.ok(ART_LAYER_KINDS.indexOf(layer.kind) >= 0,
          where + '.art.layers[' + l + '].kind 非法: ' + layer.kind +
          '（允许: ' + ART_LAYER_KINDS.join(', ') + '）');
        if (layer.opacity !== undefined) {
          assert.strictEqual(typeof layer.opacity, 'number',
            where + '.art.layers[' + l + '].opacity 必须是数字');
          assert.ok(layer.opacity >= 0 && layer.opacity <= 1,
            where + '.art.layers[' + l + '].opacity 必须在 0~1 之间，实际: ' + layer.opacity);
        }
      }
    }

    /* demos/theme.json 必须与 themes.json 对齐（条目可以是 id 字符串或带 id 的对象） */
    var demo = readJson('config/demos/theme.json');
    assert.strictEqual(demo.default, data.default,
      'config/demos/theme.json 的 default 与 src/themes.json 不一致');
    assert.ok(Array.isArray(demo.themes), 'demos/theme.json.themes 必须是数组');
    var demoIds = demo.themes.map(function (entry) {
      if (typeof entry === 'string') return entry;
      assert.ok(isPlainObject(entry), 'demos/theme.json.themes 条目必须是字符串或对象');
      return entry.id;
    });
    assert.deepStrictEqual(demoIds.slice().sort(), ids.slice().sort(),
      'demos/theme.json 的主题清单必须与 src/themes.json 完全一致（实际: ' +
      demoIds.join(', ') + '）');
    var byId = Object.create(null);
    for (i = 0; i < data.themes.length; i++) byId[data.themes[i].id] = data.themes[i];
    for (i = 0; i < demo.themes.length; i++) {
      var entry = demo.themes[i];
      if (!isPlainObject(entry)) continue;
      var srcTheme = byId[entry.id];
      assert.ok(srcTheme, 'demos/theme.json 引用了不存在的主题: ' + entry.id);
      assert.strictEqual(entry.name, srcTheme.name,
        'demos/theme.json 中主题 ' + entry.id + ' 的 name 与 themes.json 不一致');
      assert.strictEqual(entry.scheme, srcTheme.scheme,
        'demos/theme.json 中主题 ' + entry.id + ' 的 scheme 与 themes.json 不一致');
      if (entry.action && entry.action.action === 'theme.apply') {
        assert.strictEqual(entry.action.params && entry.action.params.id, entry.id,
          'demos/theme.json 中主题 ' + entry.id + ' 的 action.params.id 必须与自身 id 一致');
      }
    }
  });

  /* ------------------------------------------------------------------ *
   * 用例 4：node.type 全部注册（依赖 core/controls/组件就绪）
   * ------------------------------------------------------------------ */
  suite.test('配置中所有渲染节点 node.type 均已在注册表注册', function () {
    assert.ok(typeof ctx.createEnvironment === 'function',
      'test/dom-stub.js 未提供 createEnvironment，无法加载 KUI 运行时');

    var env = null;
    try {
      env = ctx.createEnvironment({ root: root });
      var report = loader.loadKui(env, {});
      if (report.errors.length > 0) {
        var errLines = report.errors.map(function (item) {
          return '  ' + item.file + (item.phase ? ' [' + item.phase + ']' : '') + ': ' +
            (item.error && item.error.message ? item.error.message : String(item.error));
        });
        assert.fail('加载 KUI 运行时出错：\n' + errLines.join('\n'));
      }
      if (report.missing.length > 0) {
        ctx.warn('以下源文件尚未交付，注册表不完整: ' + report.missing.join(', '));
        ctx.skip('等待交付: ' + report.missing.join(', ') + '（注册表不完整，node.type 校验暂跳过）');
        return;
      }

      var types = report.registryTypes;
      assert.ok(types.length >= 20,
        '注册表控件数量异常（' + types.length + '），期望 >= 20');
      var typeSet = Object.create(null);
      for (var i = 0; i < types.length; i++) typeSet[types[i]] = true;

      /* v1.3.6：category=control 的注册类型必须与 test/load-kui.js 的权威命名一致，
       * 防止「手写清单/数量」再次漂移（历史问题 P1/P2 的回归闸门）。
       * 注意：report.controlTypes 来自 vm 沙箱（不同 realm），必须先用宿主 Array.prototype
       * 归一化，否则 deepStrictEqual 会因原型不同而误报。 */
      var expectedControl = [].slice.call(loader.EXPECTED_CONTROL_TYPES || []).sort();
      var actualControl = [].slice.call(report.controlTypes || []).sort();
      assert.deepStrictEqual(actualControl, expectedControl,
        '注册表 category=control 与 test/load-kui.js EXPECTED_CONTROL_TYPES 不一致：\n' +
        '  实际 = ' + actualControl.join(',') + '\n  期望 = ' + expectedControl.join(','));

      var nodes = [];
      var files = ['config/app.json'].concat(demoFiles());
      var topTypeFailures = [];
      for (var f = 0; f < files.length; f++) {
        var rel = files[f];
        var data = readJson(rel);
        if (typeof data.type === 'string' && !typeSet[data.type]) {
          topTypeFailures.push(rel + ': 顶层 type "' + data.type + '" 未注册');
        }
        collectNodes(data, rel, '', nodes, false);
      }
      assert.ok(nodes.length >= 30,
        '从配置中收集到的渲染节点过少（' + nodes.length + '），收集逻辑可能失效');

      var missingByType = Object.create(null);
      var badNodes = [];
      for (var n = 0; n < nodes.length; n++) {
        var item = nodes[n];
        if (!item.type) {
          badNodes.push(item.display + ' 缺少字符串 type');
          continue;
        }
        if (!NODE_TYPE_RE.test(item.type)) {
          badNodes.push(item.display + ' 的 type 不合规: "' + item.type + '"');
          continue;
        }
        if (!typeSet[item.type]) {
          if (!missingByType[item.type]) missingByType[item.type] = [];
          missingByType[item.type].push(item.display);
        }
      }

      var missingTypes = Object.keys(missingByType).sort();
      var lines = [];
      for (var m = 0; m < missingTypes.length; m++) {
        var mt = missingTypes[m];
        var samples = missingByType[mt].slice(0, 3);
        lines.push('  ' + mt + ' ← ' + samples.join(' , ') +
          (missingByType[mt].length > samples.length ? ' 等 ' + missingByType[mt].length + ' 处' : ''));
      }
      var allFailures = badNodes.concat(topTypeFailures).concat(lines);
      assert.deepStrictEqual(allFailures, [],
        '以下节点类型未注册或节点非法（已注册 ' + types.length + ' 种：' + types.join(', ') + '）：\n' +
        allFailures.join('\n'));
    } finally {
      if (env && typeof env.destroy === 'function') env.destroy();
    }
  });
};

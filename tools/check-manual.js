#!/usr/bin/env node
/*!
 * KurumiUI 使用手册 · 自动校验脚本
 * ---------------------------------------------------------------
 * 用途：对 docs/manual/ 下的 Markdown 手册做机器可校验的一致性检查，
 *       把「字段/类型/动作/业务函数/内链/版本/数量口径」等易漂移点抓出来。
 *
 * 用法：
 *   node tools/check-manual.js            # 人类可读报告
 *   node tools/check-manual.js --json     # JSON 报告（CI 用）
 *   node tools/check-manual.js --strict   # 警告也视为失败
 *   node tools/check-manual.js --quiet    # 只输出汇总与错误
 *   node tools/check-manual.js --help
 *
 * 退出码：0 通过；1 有错误（或 --strict 下有警告）；2 脚本自身无法初始化运行时。
 *
 * 校验项：
 *   [1] 章节文件完整性（README + NN-*.md）与编号唯一
 *   [2] 每章元信息行「> 适用版本：KurumiUI v1.3.7」与必备小节
 *       「## 本章目标 / ## 本章自检 / ## 参考源码」
 *   [3] 所有 ```json 代码块可 JSON.parse；```jsonc 括号配对
 *   [4] 代码示例中的节点 type 属于运行时 40 个注册类型（变体值有白名单）
 *   [5] 代码示例中的 action 名属于运行时 28 个内置动作
 *   [6] 反引号里的 `scope.name`（业务函数/动作）存在于运行时清单
 *   [7] 反引号里的 `KUI.x.y` 在运行时对象上可解析（或源码中可检索到）
 *   [8] 章节内部链接目标文件存在
 *   [9] 数量口径（40 类型 / 19 表单控件 / 28 动作 / 61 业务函数 / 主题数）
 *      与运行时枚举一致（带「截至/历史」限定语的行豁免）
 *   [10] 版本号统一为 1.3.7（带「历史/旧版」限定语的行豁免）
 *   [11] README 索引覆盖所有章节
 *   [12] 章节体量下限（防止空壳章节）
 *
 * 设计约束：零依赖、Node 13.14 可运行（不用 ?. ?? replaceAll Object.fromEntries 等）。
 */

'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var MANUAL = path.join(ROOT, 'docs', 'manual');

var argv = process.argv.slice(2);
var FLAG = {
  json: argv.indexOf('--json') >= 0,
  strict: argv.indexOf('--strict') >= 0,
  quiet: argv.indexOf('--quiet') >= 0,
  help: argv.indexOf('--help') >= 0 || argv.indexOf('-h') >= 0
};

if (FLAG.help) {
  console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
  process.exit(0);
}

var errors = [];
var warnings = [];
var stats = { files: 0, chapters: 0, codeBlocks: 0, jsonBlocks: 0, links: 0, backticks: 0 };

function locate(text, index) {
  return text.slice(0, index).split('\n').length;
}

function addError(file, line, code, message) {
  errors.push({ file: file, line: line, code: code, message: message });
}

function addWarning(file, line, code, message) {
  warnings.push({ file: file, line: line, code: code, message: message });
}

/* ------------------------------------------------------------------ *
 * 运行时事实：加载 KUI 取注册表 / 动作 / 业务函数，读取主题清单
 * ------------------------------------------------------------------ */

var runtime = null;

function bootRuntime() {
  try {
    var stub = require(path.join(ROOT, 'test', 'dom-stub.js'));
    var env = stub.createEnvironment({ root: ROOT, fileMode: true, quiet: true });
    var loader = require(path.join(ROOT, 'test', 'load-kui.js'));
    loader.loadKui(env, {});
    var KUI = env.window.KUI;
    if (!KUI || !KUI.registry) { throw new Error('KUI 运行时未注册'); }

    var types = KUI.registry.list().map(function (item) { return item.type; }).sort();
    var controls = KUI.registry.list().filter(function (item) {
      return item.category === 'control';
    }).map(function (item) { return item.type; }).sort();
    var actions = (typeof KUI.actions.list === 'function' ? KUI.actions.list() : []).slice();
    var handlers = (typeof KUI.handlers.list === 'function' ? KUI.handlers.list() : []).slice();

    // 主应用（app profile）在 src/app/bootstrap.js 里注册的扩展动作，不属于 28 个核心动作，
    // 但在 index.html 的菜单/导航配置中被合法引用，示例校验时需要放行。
    var appActions = [];
    try {
      var bootSrc = fs.readFileSync(path.join(ROOT, 'src', 'app', 'bootstrap.js'), 'utf8');
      var bootRe = /\breg\(\s*'([^']+)'/g;
      var bm;
      while ((bm = bootRe.exec(bootSrc))) { if (appActions.indexOf(bm[1]) < 0) { appActions.push(bm[1]); } }
    } catch (e2) { /* ignore */ }

    // config/app.json 的所有对象键：`app.name`、`tabs.maxTabs` 这类写法是配置路径，
    // 不是业务函数，反引号校验时放行。
    var configKeys = {};
    try {
      var cfgRaw = fs.readFileSync(path.join(ROOT, 'config', 'app.json'), 'utf8');
      (function walk(v) {
        if (!v || typeof v !== 'object') { return; }
        Object.keys(v).forEach(function (k) {
          configKeys[k] = true;
          walk(v[k]);
        });
      })(JSON.parse(cfgRaw));
    } catch (e3) { /* ignore */ }
    var handlerNames = handlers.map(function (item) { return item.full; }).sort();
    var scopes = {};
    handlers.forEach(function (item) { scopes[item.scope] = true; });

    var themeIds = [];
    try {
      var themesJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'themes.json'), 'utf8'));
      var list = themesJson.themes || themesJson.list || themesJson;
      if (Array.isArray(list)) {
        themeIds = list.map(function (t) { return t && t.id; }).filter(Boolean);
      }
    } catch (e) { /* ignore */ }

    return {
      KUI: KUI,
      types: types,
      typeSet: toSet(types),
      controls: controls,
      controlSet: toSet(controls),
      actions: actions,
      actionSet: toSet(actions),
      appActions: appActions,
      appActionSet: toSet(appActions),
      configKeys: configKeys,
      handlers: handlers,
      handlerSet: toSet(handlerNames),
      scopes: scopes,
      themeIds: themeIds
    };
  } catch (e) {
    console.error('[check-manual] 无法初始化 KUI 运行时：' + (e && e.stack ? e.stack : e));
    process.exit(2);
  }
}

function toSet(list) {
  var out = {};
  for (var i = 0; i < list.length; i++) { out[list[i]] = true; }
  return out;
}

/* ------------------------------------------------------------------ *
 * 源码词表：用于「运行时对象上不存在但源码里可能定义」的二次检索
 * ------------------------------------------------------------------ */

var sourceText = null;

function loadSourceText() {
  if (sourceText !== null) { return sourceText; }
  var buf = [];
  var dirs = ['src', 'tools', 'test', 'config'];
  dirs.forEach(function (dir) {
    walk(path.join(ROOT, dir), function (file) {
      if (!/\.(js|json|css|html)$/.test(file)) { return; }
      try {
        var text = fs.readFileSync(file, 'utf8');
        if (text.length > 400000) { text = text.slice(0, 400000); }
        buf.push(text);
      } catch (e) { /* ignore */ }
    });
  });
  sourceText = buf.join('\n');
  return sourceText;
}

function walk(dir, visit) {
  var names;
  try { names = fs.readdirSync(dir); } catch (e) { return; }
  for (var i = 0; i < names.length; i++) {
    var full = path.join(dir, names[i]);
    var st;
    try { st = fs.statSync(full); } catch (e2) { continue; }
    if (st.isDirectory()) { walk(full, visit); } else { visit(full); }
  }
}

function sourceHas(word) {
  if (!word) { return false; }
  var text = loadSourceText();
  return text.indexOf(word) >= 0;
}

/* ------------------------------------------------------------------ *
 * Markdown 结构解析
 * ------------------------------------------------------------------ */

function splitLines(text) {
  return text.split(/\r?\n/);
}

var FENCE_RE = /```([A-Za-z0-9_+.\-]*)[ \t]*\r?\n([\s\S]*?)```/g;

function extractCodeBlocks(text) {
  var blocks = [];
  FENCE_RE.lastIndex = 0;
  var m;
  while ((m = FENCE_RE.exec(text))) {
    blocks.push({
      lang: (m[1] || '').toLowerCase(),
      body: m[2],
      line: locate(text, m.index) + 1
    });
  }
  return blocks;
}

/** jsonc 括号配对检查（忽略字符串内容） */
function balanceOk(src) {
  var depthCurly = 0, depthBracket = 0;
  var inStr = false, quote = '', esc = false;
  for (var i = 0; i < src.length; i++) {
    var ch = src.charAt(i);
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === quote) { inStr = false; }
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = true; quote = ch; continue; }
    if (ch === '{') { depthCurly++; }
    else if (ch === '}') { depthCurly--; }
    else if (ch === '[') { depthBracket++; }
    else if (ch === ']') { depthBracket--; }
    if (depthCurly < 0 || depthBracket < 0) { return false; }
  }
  return depthCurly === 0 && depthBracket === 0;
}

/* ------------------------------------------------------------------ *
 * 白名单：type 字段的「非节点类型」取值（组件变体、菜单项类型等）
 * ------------------------------------------------------------------ */

var NON_NODE_TYPES = toSet([
  'default', 'primary', 'secondary', 'success', 'info', 'warning', 'danger',
  'error', 'ghost', 'text', 'plain', 'outline', 'soft', 'solid', 'link',
  'group', 'item', 'divider', 'header', 'footer', 'tab', 'card', 'panel',
  'string', 'number', 'boolean', 'object', 'array', 'function', 'null',
  'get', 'post', 'put', 'delete', 'json', 'html', 'css', 'js', 'module',
  'radio', 'checkbox' /* 在 JSON 示例中偶尔作为 input 原生 type 出现 */,
  /* 表单规则（rules[].type）的合法取值，不是节点类型 */
  'email', 'url', 'phone', 'tel', 'integer', 'pattern', 'idcard',
  /* postMessage 信封的 type 取值，不是节点类型 */
  'dialog', 'theme:apply', 'height', 'width', 'ready', 'resize', 'submit', 'cancel'
]);

/* 带历史/概览语境的豁免词 */
var EXEMPT_LINE = /(截至|历史|旧版|此前|以前|v1\.3\.5|1\.3\.5|from|旧文档|过期|变更|升级前|旧口径|v1\.\d+\.\d+\s*起|`"1\.\d+\.\d+"`|version\s*:\s*['"]1\.\d+\.\d+['"])/;

/* ------------------------------------------------------------------ *
 * 校验规则实现
 * ------------------------------------------------------------------ */

function checkMeta(file, text, lines) {
  if (file === 'README.md') { return; }
  if (!/^>\s*适用版本[:：]\s*KurumiUI v1\.3\.7/m.test(text)) {
    addError(file, 1, 'META', '缺少元信息行「> 适用版本：KurumiUI v1.3.7 ｜ 前置章节：… ｜ 阅读时长：…」');
  }
  var required = [
    { re: /^##\s+(?:\d+\.\s*)?本章目标/m, name: '## 本章目标' },
    { re: /^##\s+(?:\d+\.\s*)?本章自检/m, name: '## 本章自检' },
    { re: /^##\s+(?:\d+\.\s*)?参考源码/m, name: '## 参考源码' }
  ];
  required.forEach(function (item) {
    if (!item.re.test(text)) {
      addError(file, 1, 'SECTION', '缺少必备小节「' + item.name + '」');
    }
  });
  // H1 编号与文件名编号一致
  var h1 = /^#\s+(.+)$/m.exec(text);
  if (!h1) {
    addError(file, 1, 'H1', '缺少一级标题');
  } else {
    var fileNo = /^(\d\d)-/.exec(file);
    var titleNo = /^(\d+)/.exec(h1[1]);
    if (fileNo && (!titleNo || titleNo[1].replace(/^0/, '') !== fileNo[1].replace(/^0/, ''))) {
      addWarning(file, locate(text, h1.index), 'H1', '一级标题编号与文件名不一致：' + h1[1]);
    }
  }
}

function checkCodeBlocks(file, text) {
  var blocks = extractCodeBlocks(text);
  blocks.forEach(function (block) {
    stats.codeBlocks++;
    if (block.lang === 'json') {
      stats.jsonBlocks++;
      var body = block.body.replace(/^\uFEFF/, '').trim();
      if (!body) { return; }
      try {
        JSON.parse(body);
      } catch (e) {
        addError(file, block.line, 'JSON', '```json 代码块无法 JSON.parse：' + e.message);
      }
    } else if (block.lang === 'jsonc' || block.lang === 'json5') {
      if (!balanceOk(block.body)) {
        addError(file, block.line, 'JSONC', '```' + block.lang + ' 代码块括号不配对');
      }
    }
  });
  return blocks;
}

function checkTypes(file, blocks, text) {
  var seen = {};
  // 扩展章节会现场注册自定义类型（registry.register('scorebar', ...)），这些名字在本文件内合法
  var localTypes = {};
  var localReg = /(?:registry\.register|define)\(\s*['"]([A-Za-z][\w-]*)['"]/g;
  var lm;
  while ((lm = localReg.exec(text || ''))) { localTypes[lm[1]] = true; }
  blocks.forEach(function (block) {
    if (block.lang !== 'json' && block.lang !== 'jsonc' && block.lang !== 'js' && block.lang !== '') { return; }
    var patterns = [
      /"type"\s*:\s*"([A-Za-z][A-Za-z0-9_-]*)"/g,
      /\btype\s*:\s*"([A-Za-z][A-Za-z0-9_-]*)"/g,
      /\btype\s*:\s*'([A-Za-z][A-Za-z0-9_-]*)'/g
    ];
    patterns.forEach(function (re) {
      var m;
      re.lastIndex = 0;
      while ((m = re.exec(block.body))) {
        var value = m[1];
        if (runtime.typeSet[value] || NON_NODE_TYPES[value] || localTypes[value]) { continue; }
        var key = value;
        if (seen[key]) { continue; }
        seen[key] = true;
        var line = block.line + (block.body.slice(0, m.index).split('\n').length - 1);
        addWarning(file, line, 'TYPE', '示例中使用了未注册的 type：「' + value + '」（运行时注册类型见 docs/manual/README.md 附录）');
      }
    });
  });
}

function checkActions(file, blocks, text) {
  var seen = {};
  // 扩展章节会现场注册自定义动作（actions.register('tickets.save', ...)），这些名字在本文件内合法
  var localActions = {};
  var localReg = /(?:actions\.register|reg)\(\s*['"]([\w.:-]+)['"]/g;
  var lm;
  while ((lm = localReg.exec(text || ''))) { localActions[lm[1]] = true; }
  var patterns = [
    /action\s*[:=]\s*["']([a-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*)["']/g,
    /action\s*:\s*([a-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*)/g,
    /actions\.run\(\s*["']([^"']+)["']/g
  ];
  var scanned = blocks.map(function (b) { return b; });
  scanned.push({ lang: 'md', body: text, line: 1 });
  scanned.forEach(function (block) {
    patterns.forEach(function (re) {
      var m;
      re.lastIndex = 0;
      while ((m = re.exec(block.body))) {
        var name = m[1];
        if (runtime.actionSet[name] || runtime.appActionSet[name] || localActions[name]) { continue; }
        if (seen[name]) { continue; }
        seen[name] = true;
        var line = block.line + (block.body.slice(0, m.index).split('\n').length - 1);
        addWarning(file, line, 'ACTION', '示例中使用了未注册的 action：「' + name + '」（运行时内置动作见 10-actions-handlers.md）');
      }
    });
  });
}

function checkBackticks(file, text) {
  // `scope.name` 形式：业务函数或动作
  var re = /`([a-z][a-zA-Z]*)\.([A-Za-z][A-Za-z0-9_]*)`/g;
  var m;
  var fileExt = /\.(json|js|css|html|md|ts|map|jsonc|txt|svg|png)$/;
  while ((m = re.exec(text))) {
    stats.backticks++;
    var scope = m[1];
    var name = m[2];
    if (fileExt.test('.' + name)) { continue; }
    if (!runtime.scopes[scope]) { continue; }
    var full = scope + '.' + name;
    if (runtime.handlerSet[full] || runtime.actionSet[full] || runtime.appActionSet[full]) { continue; }
    if (runtime.configKeys && runtime.configKeys[name]) { continue; }
    // 配置逃生口等源码中存在、但不在 handlers/actions 清单里的点号路径（如 dialog.frameUrl）
    if (sourceHas(name)) { continue; }
    addWarning(file, locate(text, m.index), 'API', '反引号中的「' + full + '」不是运行时已注册的业务函数或动作');
  }

  // `KUI.x.y` 形式：核心 API
  var re2 = /`(KUI(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+)`/g;
  while ((m = re2.exec(text))) {
    var api = m[1];
    if (kuiPathExists(api)) { continue; }
    var last = api.split('.').pop();
    if (sourceHas(last)) { continue; }
    // 本文件自定义的命名空间（如扩展章节里 KUI.drawer = {...}）
    var root = api.split('.')[1];
    if (root && new RegExp('KUI\\.' + root + '\\s*=').test(text)) { continue; }
    addWarning(file, locate(text, m.index), 'KUI', '反引号中的「' + api + '」在运行时对象上不存在，源码中也未检索到「' + last + '」');
  }
}

function kuiPathExists(api) {
  var parts = api.split('.');
  var cur = runtime.KUI;
  for (var i = 1; i < parts.length; i++) {
    if (cur === null || cur === undefined) { return false; }
    cur = cur[parts[i]];
  }
  return cur !== undefined;
}

function checkLinks(file, text) {
  var re = /\]\(([^)\s]+)\)/g;
  var m;
  while ((m = re.exec(text))) {
    var target = m[1];
    if (/^(https?:|mailto:|tel:|#|\/\/)/.test(target)) { continue; }
    stats.links++;
    var clean = target.split('#')[0];
    if (!clean) { continue; }
    var resolved = path.resolve(path.dirname(file === 'README.md' ? path.join(MANUAL, 'README.md') : path.join(MANUAL, file)), clean);
    if (!fs.existsSync(resolved)) {
      addWarning(file, locate(text, m.index), 'LINK', '内部链接目标不存在：' + clean);
    }
  }
}

function checkNumbers(file, text, lines) {
  var rules = [
    { re: /(\d+)\s*(?:个|种)\s*(?:已注册)?(?:的)?(?:节点|注册)?类型/g, expect: runtime.types.length, tag: '类型数' },
    { re: /(\d+)\s*(?:个|种)\s*(?:表单)?控件/g, expect: runtime.controls.length, tag: '表单控件数', alt: runtime.types.length },
    { re: /(\d+)\s*个\s*(?:内置)?动作/g, expect: runtime.actions.length, tag: '动作数' },
    { re: /(\d+)\s*个\s*(?:业务函数|处理函数|handlers)/g, expect: runtime.handlers.length, tag: '业务函数数' },
    { re: /(\d+)\s*套\s*(?:内置)?主题/g, expect: runtime.themeIds.length, tag: '主题数' }
  ];
  lines.forEach(function (line, idx) {
    if (!line) { return; }
    var exempt = EXEMPT_LINE.test(line);
    // 单个 scope 的函数数（如 form 作用域 11 个）不是全量口径，不参与总数校验
    var scoped = /KUI\.handlers\.|(?:app|dialog|form|menu|menunav|tabs|toast)\.handlers|作用域|scope/i.test(line);
    rules.forEach(function (rule) {
      rule.re.lastIndex = 0;
      var m;
      while ((m = rule.re.exec(line))) {
        var num = parseInt(m[1], 10);
        if (num === rule.expect) { continue; }
        if (rule.alt && num === rule.alt) { continue; }
        if (exempt || scoped) { continue; }
        addWarning(file, idx + 1, 'COUNT', '数量口径可能不一致：' + rule.tag + '写为 ' + num + '，运行时为 ' + rule.expect + '（如为历史口径请加「截至 v1.3.7」等限定语）');
      }
    });
  });
}

function checkVersions(file, lines) {
  lines.forEach(function (line, idx) {
    if (!line || EXEMPT_LINE.test(line)) { return; }
    var re = /v?(1\.\d+\.\d+)/g;
    var m;
    while ((m = re.exec(line))) {
      if (m[1] === '1.3.7') { continue; }
      addWarning(file, idx + 1, 'VERSION', '出现非 1.3.7 的版本号：' + m[1] + '（历史说明请加「历史/旧版」限定语）');
    }
  });
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

function main() {
  runtime = bootRuntime();

  var files = [];
  var names = [];
  try { names = fs.readdirSync(MANUAL); } catch (e) {
    console.error('[check-manual] 手册目录不存在：' + MANUAL);
    process.exit(1);
  }
  names = names.filter(function (n) {
    return /^(README|\d\d-[A-Za-z0-9._-]+)\.md$/.test(n);
  }).sort();

  var chapters = names.filter(function (n) { return /^\d\d-/.test(n); });

  // [1] 文件完整性
  if (names.indexOf('README.md') < 0) {
    addError('docs/manual', 1, 'MISSING', '缺少手册总览 docs/manual/README.md');
  }
  if (!chapters.length) {
    addError('docs/manual', 1, 'MISSING', '尚未找到任何章节文件（NN-*.md）');
  }
  var noSet = {};
  chapters.forEach(function (n) {
    var no = n.slice(0, 2);
    if (noSet[no]) {
      addError('docs/manual', 1, 'DUP', '章节编号重复：' + no + '（' + noSet[no] + ' 与 ' + n + '）');
    }
    noSet[no] = n;
  });

  var readmeText = '';
  var chapterContents = {};

  names.forEach(function (name) {
    var full = path.join(MANUAL, name);
    var text;
    try { text = fs.readFileSync(full, 'utf8'); } catch (e) {
      addError(name, 1, 'READ', '无法读取：' + e.message);
      return;
    }
    stats.files++;
    if (/^\d\d-/.test(name)) { stats.chapters++; }
    var lines = splitLines(text);

    if (name === 'README.md') {
      readmeText = text;
    } else {
      chapterContents[name] = text;
      checkMeta(name, text, lines);
      // [12] 体量下限
      if (text.length < 6000) {
        addWarning(name, 1, 'SIZE', '章节体量偏小（' + text.length + ' 字符，目标至少 6000）');
      }
    }

    var blocks = checkCodeBlocks(name, text);
    checkTypes(name, blocks, text);
    checkActions(name, blocks, text);
    checkBackticks(name, text);
    checkLinks(name, text);
    checkNumbers(name, text, lines);
    checkVersions(name, lines);
  });

  // [11] README 索引覆盖
  if (readmeText) {
    chapters.forEach(function (n) {
      if (readmeText.indexOf(n) < 0) {
        addWarning('README.md', 1, 'TOC', 'README 未索引章节：' + n);
      }
    });
  }

  /* ---- 输出 ---- */
  var ok = errors.length === 0 && (!FLAG.strict || warnings.length === 0);

  if (FLAG.json) {
    console.log(JSON.stringify({
      ok: ok,
      generatedAt: new Date().toISOString(),
      runtime: {
        types: runtime.types.length,
        controls: runtime.controls.length,
        actions: runtime.actions.length,
        handlers: runtime.handlers.length,
        themes: runtime.themeIds.length
      },
      stats: {
        files: stats.files,
        chapters: stats.chapters,
        codeBlocks: stats.codeBlocks,
        jsonBlocks: stats.jsonBlocks,
        links: stats.links,
        backticks: stats.backticks,
        errors: errors.length,
        warnings: warnings.length
      },
      errors: errors,
      warnings: warnings
    }, null, 2));
  } else {
    if (!FLAG.quiet) {
      console.log('KurumiUI 使用手册校验');
      console.log('  手册目录：' + path.relative(ROOT, MANUAL));
      console.log('  运行时基线：注册类型 ' + runtime.types.length +
        ' / 表单控件 ' + runtime.controls.length +
        ' / 动作 ' + runtime.actions.length +
        ' / 业务函数 ' + runtime.handlers.length +
        ' / 主题 ' + runtime.themeIds.length);
      console.log('  扫描：文件 ' + stats.files + '，章节 ' + stats.chapters +
        '，代码块 ' + stats.codeBlocks + '（JSON ' + stats.jsonBlocks + '）' +
        '，内部链接 ' + stats.links);
      console.log('');
    }

    function printGroup(list, title) {
      if (!list.length) { return; }
      console.log(title + '（' + list.length + '）：');
      list.forEach(function (item) {
        console.log('  ' + item.file + ':' + item.line + '  [' + item.code + '] ' + item.message);
      });
      console.log('');
    }
    printGroup(errors, '错误');
    printGroup(warnings, '警告');

    console.log('汇总：错误 ' + errors.length + '，警告 ' + warnings.length +
      '，结果：' + (ok ? '通过' : '未通过'));
  }

  process.exit(ok ? 0 : 1);
}

main();

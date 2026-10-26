/**
 * KurumiUI —— 兼容性扫描工具（Node 13.14 / 旧浏览器语法检查）
 * ---------------------------------------------------------------
 * 职责（docs/00-contract.md §2 / §15）：
 *   1. 扫描项目全部 JS（src/**、server.js、test/**、tools/**、config/*.js）
 *   2. 扫描 HTML 内联 <script>（index.html、pages/**、standalone/** 等）
 *   3. 禁用语法/API 黑名单匹配，输出精确 `文件:行号:列号`
 *   4. 调用真实 Node 13.14 的 `node --check <file>` 逐个校验语法
 *
 * 设计要点：
 *   - 匹配前先对源码做「字符串/注释/正则字面量」遮蔽，避免文案里的 `?.`
 *     等字样造成误报；模板字符串只遮蔽字面量部分，`${...}` 内仍是代码。
 *   - 黑名单正则本身用字符串拼接构造，保证本文件被自己扫描时不会误报。
 *   - 零依赖（fs / path / os / child_process / vm 均为内置）。
 *
 * 用法：
 *   node tools/check-compat.js            # 打印报告，有 error 时退出码 1
 *   node tools/check-compat.js --json     # 机器可读
 *   作为模块：var compat = require('./tools/check-compat');
 *             var result = compat.runScan({ root: process.cwd() });
 */
'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');
var vm = require('vm');
var childProcess = require('child_process');

var DEFAULT_NODE13 = path.join('.tools', 'node-v13.14.0-win-x64', 'node.exe');

var SKIP_DIRS = {
  '.git': true,
  '.tools': true,
  '.svn': true,
  'node_modules': true,
  '.cache': true,
  '.tmp': true
};

// 生成文件（由 tools/build-config.js 产出），内容来自 JSON，不做语法扫描
var GENERATED_JS = ['config/bundle.js', 'config/app.config.js', 'src/themes.js', 'src/themes.json.js'];

/* =============================================================
 *  1. 源码遮蔽器：字符串 / 注释 / 正则字面量 -> 空格（保留换行）
 *     模板字符串：字面量遮蔽，`${...}` 表达式内部保留为代码
 * ============================================================= */
var REGEX_KEYWORDS = {
  'return': true, 'typeof': true, 'case': true, 'in': true, 'of': true,
  'new': true, 'delete': true, 'void': true, 'instanceof': true, 'do': true,
  'else': true, 'yield': true, 'await': true, 'throw': true
};

function isRegexStart(lastSignificant, lastWord) {
  if (lastWord && REGEX_KEYWORDS[lastWord]) return true;
  if (!lastSignificant) return true;
  return '(,=:[!&|?{};+-*%<>~^'.indexOf(lastSignificant) !== -1;
}

function maskCode(code) {
  var len = code.length;
  var out = new Array(len);
  var k;
  for (k = 0; k < len; k++) {
    var ch = code.charAt(k);
    out[k] = (ch === '\n' || ch === '\r') ? ch : ' ';
  }
  var i = 0;
  var state = 'code';
  var tplDepth = 0;        // >0 表示处于模板 ${ 表达式中
  var braceDepth = 0;
  var lastSignificant = '';
  var lastWord = '';

  function raw(idx) { out[idx] = code.charAt(idx); }
  function blank(idx) { out[idx] = ' '; }

  while (i < len) {
    var c = code.charAt(i);
    var n = code.charAt(i + 1);

    if (state === 'code') {
      // 行注释
      if (c === '/' && n === '/') {
        var le = code.indexOf('\n', i);
        i = le === -1 ? len : le;
        continue;
      }
      // 块注释
      if (c === '/' && n === '*') {
        var be = code.indexOf('*/', i + 2);
        i = be === -1 ? len : be + 2;
        continue;
      }
      // 普通字符串
      if (c === '"' || c === "'") {
        raw(i);
        var quote = c;
        i++;
        while (i < len) {
          var sc = code.charAt(i);
          if (sc === '\\') { i += 2; continue; }
          if (sc === quote) { raw(i); i++; break; }
          if (sc === '\n') { i++; break; }
          i++;
        }
        lastSignificant = quote;
        lastWord = '';
        continue;
      }
      // 模板字符串
      if (c === '`') {
        raw(i);
        state = 'template';
        i++;
        continue;
      }
      // 正则字面量
      if (c === '/' && isRegexStart(lastSignificant, lastWord)) {
        raw(i);
        i++;
        var inClass = false;
        while (i < len) {
          var rc = code.charAt(i);
          if (rc === '\\') { i += 2; continue; }
          if (rc === '\n') break;
          if (rc === '[') inClass = true;
          else if (rc === ']') inClass = false;
          else if (rc === '/' && !inClass) { raw(i); i++; break; }
          i++;
        }
        while (i < len && /[a-zA-Z]/.test(code.charAt(i))) { raw(i); i++; }
        lastSignificant = '/';
        lastWord = '';
        continue;
      }
      // 模板表达式结束
      if (c === '}' && tplDepth > 0 && braceDepth === 0) {
        tplDepth -= 1;
        state = 'template';
        i++;
        continue;
      }
      if (c === '{') braceDepth += 1;
      else if (c === '}' && braceDepth > 0) braceDepth -= 1;

      raw(i);
      if (c === '/') {
        raw(i);
      }
      if (!/\s/.test(c)) {
        if (/[A-Za-z0-9_$]/.test(c)) {
          lastWord += c;
        } else {
          lastSignificant = c;
          lastWord = '';
        }
      }
      i++;
      continue;
    }

    if (state === 'template') {
      var tc = code.charAt(i);
      if (tc === '\\') { i += 2; continue; }
      if (tc === '`') { raw(i); i++; state = 'code'; continue; }
      if (tc === '$' && code.charAt(i + 1) === '{') {
        raw(i);
        raw(i + 1);
        tplDepth += 1;
        braceDepth = 0;
        state = 'code';
        i += 2;
        continue;
      }
      i++;
      continue;
    }
  }
  return out.join('');
}

/* =============================================================
 *  2. 禁用语法/API 规则
 * ============================================================= */
function rule(id, label, severity, source, message, suggestion) {
  return {
    id: id,
    label: label,
    severity: severity,
    regex: new RegExp(source, 'g'),
    message: message,
    suggestion: suggestion
  };
}

var RULES = [
  rule('optional-chaining', '禁止可选链', 'error', '\\?\\.',
    '使用了可选链 ?.（Node 13.14 与旧浏览器不支持）', '改成 a && a.b 显式判断'),
  rule('nullish', '禁止空值合并 ??', 'error', '\\?\\?(?!=)',
    '使用了空值合并运算符 ??', '改用 a === undefined || a === null ? b : a'),
  rule('logical-assign-or', '禁止 ||=', 'error', '\\|\\|=',
    '使用了逻辑或赋值 ||=', '改写为 a = a || b'),
  rule('logical-assign-and', '禁止 &&=', 'error', '&&=',
    '使用了逻辑与赋值 &&=', '改写为 a = a && b'),
  rule('nullish-assign', '禁止 ??=', 'error', '\\?\\?=',
    '使用了空值合并赋值 ??=', '改写为显式判断'),
  rule('replace-all', '禁止 String.replaceAll', 'error', '\\.replace' + 'All\\s*\\(',
    '使用了 String.prototype.replaceAll（Node 13 无此 API）', '改用 split().join() 或 replace(/x/g)'),
  rule('array-at', '禁止 Array.prototype.at', 'error', '\\.at\\s*\\(',
    '使用了 .at()（Node 13 / 旧浏览器不支持）', '改用 arr[arr.length - 1] 或 arr.slice(-1)[0]'),
  rule('object-from-entries', '禁止 Object.fromEntries', 'error', '\\bObject\\.from' + 'Entries\\b',
    '使用了 Object.fromEntries（Node 13 不支持）', '改用循环手动构造对象'),
  rule('structured-clone', '禁止 structuredClone', 'error', '\\bstructured' + 'Clone\\b',
    '使用了 structuredClone（Node 13 / 旧浏览器不支持）', '改用 JSON 深拷贝或手写 clone'),
  rule('private-field', '禁止私有字段 #x', 'error', '#[A-Za-z_$]',
    '使用了 class 私有字段 #x（Node 13.14 不支持）', '改用 WeakMap 或普通属性 + 约定命名'),
  rule('intl-relative-time', '禁止 Intl.RelativeTimeFormat', 'error', '\\bIntl\\.Relative' + 'TimeFormat\\b',
    '使用了 Intl.RelativeTimeFormat（兼容性不足）', '手写相对时间文案'),
  rule('esm-import-stmt', '禁止 ESM import 语句', 'error', '(^|\\n)[ \\t]*import[ \\t]+[\\w{*$]',
    '出现 ESM import 语句（浏览器传统 script / Node CJS 不支持）', '改用 window.KUI 挂载或 require（Node 侧）'),
  rule('esm-export-stmt', '禁止 ESM export 语句', 'error', '(^|\\n)[ \\t]*export[ \\t]+(default|const|let|var|function|class|\\{|\\*)',
    '出现 ESM export 语句', '删除 export，改用挂载到 window.KUI'),
  rule('esm-dynamic-import', '禁止动态 import()', 'error', '\\bimport\\s*\\(',
    '出现动态 import()', '改用传统 script 加载'),
  rule('object-has-own', '禁止 Object.hasOwn', 'warn', '\\bObject\\.has' + 'Own\\b',
    '使用了 Object.hasOwn（Node 16.9+ 才有）', '改用 Object.prototype.hasOwnProperty.call'),
  rule('array-flat', '禁止 Array.prototype.flat', 'warn', '\\.flat\\s*\\(',
    '使用了 Array.prototype.flat（旧浏览器不支持）', '改用 reduce 展平'),
  rule('array-flat-map', '禁止 Array.prototype.flatMap', 'warn', '\\.flatMap\\s*\\(',
    '使用了 Array.prototype.flatMap（旧浏览器不支持）', '改用 map + reduce'),
  rule('top-level-await', '疑似顶层 await', 'warn', '\\bawait\\b',
    '疑似顶层 await（Node 13.14 不支持）', '包进 async 函数内执行')
];

var RULE_BY_ID = {};
(function () {
  for (var i = 0; i < RULES.length; i++) RULE_BY_ID[RULES[i].id] = RULES[i];
})();

/** 计算 1 基行号 / 0 基列号 */
function lineColumnAt(text, index) {
  var line = 1;
  var last = -1;
  for (var i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      last = i;
    }
  }
  return { line: line, column: index - last - 1 };
}

function snippetAt(text, index, maxLen) {
  var start = index;
  while (start > 0 && text.charCodeAt(start - 1) !== 10 && index - start < 80) start -= 1;
  var end = index;
  var limit = maxLen || 160;
  while (end < text.length && text.charCodeAt(end) !== 10 && end - start < limit) end += 1;
  return text.slice(start, end).replace(/\r$/, '');
}

function pushViolation(list, file, code, masked, ruleDef, index, baseLine) {
  // 以 "\n" 开头的规则（如语句行首匹配）需要把匹配起点右移到下一行行首
  if (masked.charAt(index) === '\n') index += 1;
  var lc = lineColumnAt(masked, index);
  list.push({
    file: file,
    line: (baseLine || 1) + lc.line - 1,
    column: lc.column + 1,
    rule: ruleDef.id,
    label: ruleDef.label,
    severity: ruleDef.severity,
    message: ruleDef.message,
    suggestion: ruleDef.suggestion,
    snippet: snippetAt(code, index).trim()
  });
}

/**
 * 扫描一段 JS 源码（已去 BOM）。返回违规列表。
 * @param {string} code 源码
 * @param {string} file 展示用文件名
 * @param {object} opts { baseLine: 起始行号, maxPerRule: 单规则单文件上限, rules: 规则子集 }
 */
function scanCode(code, file, opts) {
  opts = opts || {};
  var violations = [];
  if (code === null || code === undefined) return violations;
  var masked = maskCode(String(code));
  var baseLine = opts.baseLine || 1;
  var maxPerRule = opts.maxPerRule || 40;
  var rules = opts.rules || RULES;
  for (var r = 0; r < rules.length; r++) {
    var def = rules[r];
    var re = new RegExp(def.regex.source, 'g');
    var match;
    var count = 0;
    while ((match = re.exec(masked))) {
      if (match[0] === '') { re.lastIndex += 1; continue; }
      // 顶层 await 启发式：仅在花括号深度为 0 时报告（仍可能误报，故为 warn）
      if (def.id === 'top-level-await') {
        var depth = 0;
        for (var d = 0; d < match.index; d++) {
          var ch = masked.charAt(d);
          if (ch === '{') depth += 1;
          else if (ch === '}' && depth > 0) depth -= 1;
        }
        if (depth > 0) continue;
      }
      pushViolation(violations, file, String(code), masked, def, match.index, baseLine);
      count += 1;
      if (count >= maxPerRule) break;
    }
  }
  violations.sort(function (a, b) {
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });
  return violations;
}

/* =============================================================
 *  3. 文件枚举
 * ============================================================= */
function posixRel(root, abs) {
  return path.relative(root, abs).split(path.sep).join('/');
}

function walk(root, dirAbs, result) {
  var names;
  try {
    names = fs.readdirSync(dirAbs);
  } catch (e) {
    return;
  }
  names.sort();
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var abs = path.join(dirAbs, name);
    var stat;
    try { stat = fs.statSync(abs); } catch (e) { continue; }
    if (stat.isDirectory()) {
      if (SKIP_DIRS[name]) continue;
      if (name.charAt(0) === '.' && name !== '.') continue;
      walk(root, abs, result);
    } else if (stat.isFile()) {
      result.push(abs);
    }
  }
}

function classify(root, abs) {
  var rel = posixRel(root, abs);
  var ext = path.extname(rel).toLowerCase();
  if (rel.indexOf('test/fixtures/') === 0) return null;             // fixtures 含故意错误样本
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    if (GENERATED_JS.indexOf(rel) !== -1) return null;              // 生成文件不扫
    return 'js';
  }
  if (ext === '.html' || ext === '.htm') return 'html';
  if (ext === '.json') {
    if (rel.indexOf('config/') === 0 || rel === 'src/themes.json' || rel === 'package.json') return 'json';
    return null;
  }
  return null;
}

function discover(root) {
  var all = [];
  walk(root, root, all);
  var js = [];
  var html = [];
  var json = [];
  for (var i = 0; i < all.length; i++) {
    var kind = classify(root, all[i]);
    if (kind === 'js') js.push(all[i]);
    else if (kind === 'html') html.push(all[i]);
    else if (kind === 'json') json.push(all[i]);
  }
  js.sort();
  html.sort();
  json.sort();
  return { js: js, html: html, json: json };
}

/* =============================================================
 *  4. Node 13.14 语法校验（真实调用 node --check）
 * ============================================================= */
function findNode13(root, override) {
  var candidates = [];
  if (override) candidates.push(override);
  candidates.push(path.resolve(root, DEFAULT_NODE13));
  var i;
  for (i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch (e) { /* ignore */ }
  }
  return null;
}

function parseCheckError(stderr) {
  var text = String(stderr || '');
  var lines = text.split(/\r?\n/);
  var line = null;
  var message = '';
  for (var i = 0; i < lines.length; i++) {
    var lineText = lines[i];
    if (!lineText) continue;
    if (line === null) {
      var m = lineText.match(/:(\d+)\s*$/);
      if (m) { line = parseInt(m[1], 10); continue; }
    }
    if (lineText.indexOf('SyntaxError') !== -1 || lineText.indexOf('Error') !== -1) {
      if (!message) message = lineText.trim();
    }
  }
  if (!message) {
    for (var j = 0; j < lines.length; j++) {
      if (lines[j].trim()) { message = lines[j].trim(); break; }
    }
  }
  return { line: line, message: message, raw: text };
}

/**
 * 进程内语法校验：使用当前运行时的 V8 解析器（vm.Script）。
 * 当测试进程本身就是 Node 13.14 时，这与 `node --check` 等价，
 * 且不受「沙箱禁止嵌套子进程」限制。
 * @returns {null|object} null 表示通过
 */
function checkSyntaxInProcess(code, displayName) {
  try {
    // 包一层函数体以便顶层 return 等 CJS 语义与 --check 一致
    new vm.Script(String(code).replace(/^\uFEFF/, ''), { filename: displayName });
    return null;
  } catch (e) {
    var line = null;
    var stack = String(e && e.stack ? e.stack : '');
    var m = stack.match(/:(\d+)\s*\n/) || stack.match(/:(\d+)\)/);
    if (m) line = parseInt(m[1], 10);
    return {
      file: displayName,
      line: line,
      message: String(e && e.name ? e.name : 'SyntaxError') + ': ' + String(e && e.message ? e.message : e),
      raw: stack
    };
  }
}

function checkFileInProcess(absPath, displayName) {
  var code;
  try {
    code = fs.readFileSync(absPath, 'utf8');
  } catch (e) {
    return { file: displayName, line: null, message: '读取失败: ' + (e && e.message ? e.message : e), raw: '' };
  }
  return checkSyntaxInProcess(code, displayName);
}

/** 探测能否 spawn 子进程（Windows 沙箱可能返回 EPERM） */
function canSpawn(nodeExe) {
  var res = childProcess.spawnSync(nodeExe, ['--version'], {
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true
  });
  if (res.error) return { ok: false, error: res.error };
  return { ok: true, version: String(res.stdout || '').trim() };
}

/**
 * 用 Node 13 对单文件执行 `--check` 语法校验。
 * @returns {null|object} null 表示通过；否则返回 {file,line,message,raw}
 */
function checkSyntaxWithNode(nodeExe, absPath, displayName) {
  var res = childProcess.spawnSync(nodeExe, ['--check', absPath], {
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true
  });
  if (res.error) {
    return {
      file: displayName || absPath,
      line: null,
      message: '无法执行 node --check: ' + (res.error.message || String(res.error)),
      raw: String(res.error && res.error.stack ? res.error.stack : res.error)
    };
  }
  if (res.status !== 0) {
    var parsed = parseCheckError(res.stderr || '');
    return {
      file: displayName || absPath,
      line: parsed.line,
      message: parsed.message || '语法错误',
      raw: parsed.raw
    };
  }
  return null;
}

/* =============================================================
 *  5. HTML 内联脚本提取
 * ============================================================= */
function extractInlineScripts(html) {
  var out = [];
  var re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  var match;
  while ((match = re.exec(html))) {
    var attrs = match[1] || '';
    var body = match[2] || '';
    var bodyStart = match.index + match[0].indexOf('>') + 1;
    var prefix = html.slice(0, bodyStart);
    var baseLine = prefix.split('\n').length;
    var hasSrc = /\bsrc\s*=/i.test(attrs);
    var isModule = /\btype\s*=\s*["']?module/i.test(attrs);
    out.push({
      attrs: attrs,
      body: body,
      baseLine: baseLine,
      hasSrc: hasSrc,
      isModule: isModule,
      index: match.index
    });
  }
  return out;
}

/* =============================================================
 *  6. 主扫描
 * ============================================================= */
function getTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kui-compat-'));
}

function cleanupTempDir(dir) {
  if (!dir) return;
  try {
    var names = fs.readdirSync(dir);
    for (var i = 0; i < names.length; i++) {
      try { fs.unlinkSync(path.join(dir, names[i])); } catch (e) { /* ignore */ }
    }
    fs.rmdirSync(dir);
  } catch (e) { /* ignore */ }
}

/**
 * 扫描整个项目。
 * @param {object} options
 *   root      项目根目录（默认 process.cwd()）
 *   node13    Node13 可执行文件路径（可选）
 *   syntax    是否执行 --check（默认 true）
 *   files     只扫描指定相对路径列表（可选，测试/调试用）
 * @returns {object} 扫描结果
 */
function runScan(options) {
  options = options || {};
  var root = path.resolve(options.root || process.cwd());
  var result = {
    root: root,
    node13: { path: null, available: false, version: null },
    files: { js: [], html: [], json: [] },
    violations: [],
    syntaxFailures: [],
    jsonErrors: [],
    inlineScripts: 0,
    checked: 0,
    skipped: [],
    warnings: [],
    stats: {}
  };

  var node13 = findNode13(root, options.node13);
  result.node13.path = node13;
  result.node13.available = !!node13;
  result.runtime = process.version;

  // 语法校验模式（三重降级，保证「沙箱禁止嵌套进程」时仍能真实校验）：
  //   in-process-node13 : 测试进程本身是 Node 13.14 -> vm.Script 即 Node13 解析器
  //   spawn-node13      : 普通终端环境 -> 逐文件 spawn node13 --check
  //   current-runtime   : 沙箱等无法 spawn 时的兜底（仅能发现解析错误）
  var major = parseInt(process.version.replace(/^v/, '').split('.')[0], 10);
  var spawnProbe = null;
  var syntaxMode = 'disabled';
  if (options.syntax !== false) {
    if (major === 13) {
      syntaxMode = 'in-process-node13';
      result.node13.version = process.version;
      result.warnings.push('当前进程即 ' + process.version + '，使用进程内 vm.Script 做 Node13 语法校验（等价于 node --check）');
    } else if (node13) {
      spawnProbe = canSpawn(node13);
      if (spawnProbe.ok) {
        syntaxMode = 'spawn-node13';
        result.node13.version = spawnProbe.version;
      } else {
        syntaxMode = 'current-runtime';
        result.warnings.push('无法 spawn Node13（' + (spawnProbe.error && spawnProbe.error.code ? spawnProbe.error.code : '未知错误') +
          '，常见于受限沙箱）；降级为当前运行时 ' + process.version + ' 解析校验。' +
          '请再用 Node 13.14 执行一次 test/run.js 以获得真实 Node13 语法校验。');
      }
    } else {
      syntaxMode = 'current-runtime';
      result.warnings.push('未找到 Node 13.14（期望路径: ' + path.resolve(root, DEFAULT_NODE13) +
        '），降级为当前运行时 ' + process.version + ' 解析校验');
    }
  }
  result.syntaxMode = syntaxMode;

  var discovered = discover(root);
  if (options.files && options.files.length) {
    var allowed = {};
    for (var a = 0; a < options.files.length; a++) allowed[options.files[a]] = true;
    discovered.js = discovered.js.filter(function (abs) { return allowed[posixRel(root, abs)]; });
    discovered.html = discovered.html.filter(function (abs) { return allowed[posixRel(root, abs)]; });
    discovered.json = discovered.json.filter(function (abs) { return allowed[posixRel(root, abs)]; });
  }

  result.files.js = discovered.js.map(function (abs) { return posixRel(root, abs); });
  result.files.html = discovered.html.map(function (abs) { return posixRel(root, abs); });
  result.files.json = discovered.json.map(function (abs) { return posixRel(root, abs); });

  var doSyntax = syntaxMode !== 'disabled';
  var tempDir = null;
  var tempSeq = 0;

  /** 统一的单文件语法校验入口（自动按模式选择实现） */
  function syntaxCheckFile(absPath, rel) {
    if (syntaxMode === 'spawn-node13') return checkSyntaxWithNode(node13, absPath, rel);
    return checkFileInProcess(absPath, rel);
  }

  /** 统一的内联代码语法校验入口 */
  function syntaxCheckCode(code, displayName) {
    if (syntaxMode === 'spawn-node13') {
      var tmp = tempFileFor(code);
      return checkSyntaxWithNode(node13, tmp, displayName);
    }
    return checkSyntaxInProcess(code, displayName);
  }

  function tempFileFor(content) {
    if (!tempDir) tempDir = getTempDir();
    tempSeq += 1;
    var file = path.join(tempDir, 'inline-' + tempSeq + '.js');
    fs.writeFileSync(file, content, 'utf8');
    return file;
  }

  try {
    // ---- JS 文件 ----
    for (var i = 0; i < discovered.js.length; i++) {
      var abs = discovered.js[i];
      var rel = posixRel(root, abs);
      var code;
      try {
        code = fs.readFileSync(abs, 'utf8');
      } catch (e) {
        result.warnings.push('读取失败: ' + rel + ' -> ' + (e && e.message ? e.message : e));
        continue;
      }
      if (code.charCodeAt(0) === 0xfeff) code = code.slice(1);
      var hits = scanCode(code, rel);
      for (var h = 0; h < hits.length; h++) result.violations.push(hits[h]);

      if (doSyntax) {
        var fail = syntaxCheckFile(abs, rel);
        result.checked += 1;
        if (fail) result.syntaxFailures.push(fail);
      }
    }

    // ---- HTML 内联脚本 ----
    for (var t = 0; t < discovered.html.length; t++) {
      var htmlAbs = discovered.html[t];
      var htmlRel = posixRel(root, htmlAbs);
      var html;
      try {
        html = fs.readFileSync(htmlAbs, 'utf8');
      } catch (e) {
        result.warnings.push('读取失败: ' + htmlRel);
        continue;
      }
      var scripts = extractInlineScripts(html);
      for (var s = 0; s < scripts.length; s++) {
        var item = scripts[s];
        if (item.isModule) {
          var tagLine = html.slice(0, item.index).split('\n').length;
          result.violations.push({
            file: htmlRel,
            line: tagLine,
            column: item.index - html.lastIndexOf('\n', item.index),
            rule: 'esm-module-script',
            label: '禁止 type=module',
            severity: 'error',
            message: 'HTML 中出现 <script type="module">（要求传统 script）',
            suggestion: '改为普通 <script> 并挂到 window.KUI',
            snippet: html.slice(item.index, item.index + 80).split('\n')[0]
          });
        }
        if (item.hasSrc || !item.body.trim()) continue;
        result.inlineScripts += 1;
        var inlineHits = scanCode(item.body, htmlRel + ' [inline:' + item.baseLine + ']', { baseLine: item.baseLine });
        for (var ih = 0; ih < inlineHits.length; ih++) result.violations.push(inlineHits[ih]);
        if (doSyntax) {
          try {
            var inlineDisplay = htmlRel + ' [inline:' + item.baseLine + ']';
            var inlineFail = syntaxCheckCode(item.body, inlineDisplay);
            result.checked += 1;
            if (inlineFail) {
              if (inlineFail.line !== null) inlineFail.line = item.baseLine + inlineFail.line - 1;
              result.syntaxFailures.push(inlineFail);
            }
          } catch (e2) {
            result.warnings.push('内联脚本语法校验失败: ' + htmlRel + ' -> ' + (e2 && e2.message ? e2.message : e2));
          }
        }
      }
    }

    // ---- JSON 可解析性 ----
    for (var j = 0; j < discovered.json.length; j++) {
      var jsonAbs = discovered.json[j];
      var jsonRel = posixRel(root, jsonAbs);
      try {
        JSON.parse(fs.readFileSync(jsonAbs, 'utf8').replace(/^\uFEFF/, ''));
      } catch (e3) {
        result.jsonErrors.push({
          file: jsonRel,
          message: e3 && e3.message ? e3.message : String(e3)
        });
      }
    }
  } finally {
    cleanupTempDir(tempDir);
  }

  var errors = 0;
  var warns = 0;
  var byRule = {};
  for (var v = 0; v < result.violations.length; v++) {
    var viol = result.violations[v];
    byRule[viol.rule] = (byRule[viol.rule] || 0) + 1;
    if (viol.severity === 'error') errors += 1;
    else warns += 1;
  }
  result.stats = {
    jsFiles: result.files.js.length,
    htmlFiles: result.files.html.length,
    jsonFiles: result.files.json.length,
    inlineScripts: result.inlineScripts,
    checkedFiles: result.checked,
    syntaxMode: syntaxMode,
    syntaxCheckedBy: syntaxMode === 'spawn-node13' ? 'node13 --check' : 'vm.Script(' + process.version + ')',
    bannedErrors: errors,
    bannedWarns: warns,
    syntaxFailures: result.syntaxFailures.length,
    jsonErrors: result.jsonErrors.length,
    violationsByRule: byRule
  };
  return result;
}

/** 汇总所有 error 级问题为统一列表（便于测试断言） */
function collectErrors(result) {
  var errors = [];
  var i;
  for (i = 0; i < result.violations.length; i++) {
    if (result.violations[i].severity === 'error') errors.push(result.violations[i]);
  }
  for (i = 0; i < result.syntaxFailures.length; i++) {
    errors.push({
      file: result.syntaxFailures[i].file,
      line: result.syntaxFailures[i].line,
      column: null,
      rule: 'node13-syntax',
      label: 'Node 13 语法校验',
      severity: 'error',
      message: result.syntaxFailures[i].message,
      suggestion: '按 Node 13.14 语法改写',
      snippet: ''
    });
  }
  for (i = 0; i < result.jsonErrors.length; i++) {
    errors.push({
      file: result.jsonErrors[i].file,
      line: null,
      column: null,
      rule: 'json-parse',
      label: 'JSON 解析',
      severity: 'error',
      message: result.jsonErrors[i].message,
      suggestion: '修正 JSON 语法',
      snippet: ''
    });
  }
  return errors;
}

/* =============================================================
 *  7. CLI
 * ============================================================= */
function formatLocation(item) {
  var loc = item.file;
  if (item.line !== null && item.line !== undefined) {
    loc += ':' + item.line;
    if (item.column !== null && item.column !== undefined) loc += ':' + item.column;
  }
  return loc;
}

function printReport(result) {
  var lines = [];
  lines.push('KurumiUI 兼容性扫描报告');
  lines.push('  根目录 : ' + result.root);
  lines.push('  Node13 : ' + (result.node13.available
    ? (result.node13.path + '  (' + (result.node13.version || '?') + ')')
    : '未找到（跳过 --check）'));
  lines.push('  文件   : JS ' + result.stats.jsFiles + ' / HTML ' + result.stats.htmlFiles +
    ' / JSON ' + result.stats.jsonFiles + ' / 内联脚本 ' + result.stats.inlineScripts);
  lines.push('  语法校验: ' + result.stats.checkedFiles + ' 个文件  [' + (result.stats.syntaxMode || '?') + ']');
  lines.push('');

  var errors = collectErrors(result);
  if (!errors.length) {
    lines.push('[PASS] 未发现禁用语法 / API');
  } else {
    lines.push('[FAIL] 共 ' + errors.length + ' 个错误：');
    var i;
    for (i = 0; i < errors.length; i++) {
      var e = errors[i];
      lines.push('  ' + formatLocation(e) + '  [' + e.rule + '] ' + e.message);
      if (e.snippet) lines.push('      > ' + e.snippet);
      if (e.suggestion) lines.push('      建议: ' + e.suggestion);
    }
  }

  var warnings = [];
  var j;
  for (j = 0; j < result.violations.length; j++) {
    if (result.violations[j].severity !== 'error') warnings.push(result.violations[j]);
  }
  if (warnings.length) {
    lines.push('');
    lines.push('[WARN] 共 ' + warnings.length + ' 个警告：');
    for (j = 0; j < warnings.length; j++) {
      var w = warnings[j];
      lines.push('  ' + formatLocation(w) + '  [' + w.rule + '] ' + w.message);
    }
  }
  if (result.warnings.length) {
    lines.push('');
    lines.push('[INFO]');
    for (var k = 0; k < result.warnings.length; k++) lines.push('  - ' + result.warnings[k]);
  }
  var text = lines.join('\n');
  console.log(text);
  return errors.length === 0;
}

module.exports = {
  RULES: RULES,
  runScan: runScan,
  scanCode: scanCode,
  maskCode: maskCode,
  collectErrors: collectErrors,
  extractInlineScripts: extractInlineScripts,
  discover: discover,
  formatLocation: formatLocation,
  checkSyntaxInProcess: checkSyntaxInProcess,
  checkFileInProcess: checkFileInProcess,
  canSpawn: canSpawn,
  DEFAULT_NODE13: DEFAULT_NODE13
};

if (require.main === module) {
  var args = process.argv.slice(2);
  var opts = { root: process.cwd() };
  var jsonMode = false;
  for (var i = 0; i < args.length; i++) {
    var a = args[i];
    if (a === '--json') jsonMode = true;
    else if (a.indexOf('--root=') === 0) opts.root = a.slice(7);
    else if (a === '--no-syntax') opts.syntax = false;
    else if (a.indexOf('--node13=') === 0) opts.node13 = a.slice(9);
  }
  try {
    var result = runScan(opts);
    if (jsonMode) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printReport(result);
    }
    process.exitCode = collectErrors(result).length ? 1 : 0;
  } catch (e) {
    console.error('兼容性扫描失败: ' + (e && e.stack ? e.stack : e));
    process.exitCode = 1;
  }
}

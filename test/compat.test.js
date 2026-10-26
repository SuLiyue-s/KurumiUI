/**
 * test/compat.test.js —— 兼容性与语法测试
 * 契约依据：docs/00-contract.md §2（禁用语法/API）、§15（测试要求）
 *
 * 覆盖：
 *   1. 禁用语法黑名单能命中 fixture，且行号精确
 *   2. 字符串 / 注释 / 正则 / 模板字符串中的「伪禁用语法」不误报
 *   3. HTML 内联脚本提取、type=module 检查、行号偏移
 *   4. 全项目扫描（src/**、server.js、test/**、tools/**、config/**、HTML）零违规
 *   5. Node 13.14 真实语法校验覆盖每个 JS 与每段内联脚本
 */
'use strict';

module.exports = function register(suite, ctx) {
  var fs = require('fs');
  var path = require('path');
  var assert = require('assert');
  var compat = require('../tools/check-compat');

  var fixtureDir = path.join(ctx.root, 'test', 'fixtures');
  var cachedScan = null;

  function readFixture(name) {
    return fs.readFileSync(path.join(fixtureDir, name), 'utf8');
  }

  /** 行号定位：返回 content 中包含 marker 的 1 基行号 */
  function lineOf(content, marker) {
    var lines = content.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf(marker) !== -1) return i + 1;
    }
    throw new Error('fixture 中未找到标记 ' + marker);
  }

  function formatIssue(item) {
    return compat.formatLocation(item) + '  [' + item.rule + '] ' + (item.message || '');
  }

  function firstIssues(errors, max) {
    var out = [];
    for (var i = 0; i < errors.length && i < (max || 15); i++) out.push('    ' + formatIssue(errors[i]));
    if (errors.length > (max || 15)) out.push('    ... 其余 ' + (errors.length - (max || 15)) + ' 条省略');
    return out.join('\n');
  }

  /* ---------------------------------------------------------
   * 用例 1：黑名单命中 fixtures + 精确行号
   * ------------------------------------------------------- */
  suite.test('compat: 禁用语法黑名单命中 fixtures（行号精确）', function () {
    var content = readFixture('bad-syntax.js.txt');
    var hits = compat.scanCode(content, 'test/fixtures/bad-syntax.js.txt');

    var expectations = [
      { rule: 'optional-chaining', marker: 'MARK_OPT' },
      { rule: 'nullish', marker: 'MARK_NULLISH' },
      { rule: 'logical-assign-or', marker: 'MARK_OR_ASSIGN' },
      { rule: 'logical-assign-and', marker: 'MARK_AND_ASSIGN' },
      { rule: 'nullish-assign', marker: 'MARK_NULLISH_ASSIGN' },
      { rule: 'replace-all', marker: 'MARK_REPLACE_ALL' },
      { rule: 'array-at', marker: 'MARK_AT' },
      { rule: 'object-from-entries', marker: 'MARK_FROM_ENTRIES' },
      { rule: 'structured-clone', marker: 'MARK_STRUCTURED_CLONE' },
      { rule: 'private-field', marker: 'MARK_PRIVATE_FIELD' },
      { rule: 'array-flat', marker: 'MARK_FLAT' },
      { rule: 'array-flat-map', marker: 'MARK_FLAT_MAP' },
      { rule: 'object-has-own', marker: 'MARK_HAS_OWN' },
      { rule: 'intl-relative-time', marker: 'MARK_RTF' },
      { rule: 'esm-import-stmt', marker: 'MARK_IMPORT' },
      { rule: 'esm-export-stmt', marker: 'MARK_EXPORT' },
      { rule: 'esm-dynamic-import', marker: 'MARK_DYNAMIC_IMPORT' },
      { rule: 'top-level-await', marker: 'MARK_TOP_LEVEL_AWAIT' }
    ];

    var missing = [];
    var wrongLine = [];
    for (var i = 0; i < expectations.length; i++) {
      var exp = expectations[i];
      var expectedLine = lineOf(content, exp.marker);
      var matched = null;
      for (var j = 0; j < hits.length; j++) {
        if (hits[j].rule === exp.rule) { matched = hits[j]; break; }
      }
      if (!matched) {
        missing.push(exp.rule + '（期望行 ' + expectedLine + '）');
      } else if (matched.line !== expectedLine) {
        wrongLine.push(exp.rule + ' 期望行 ' + expectedLine + '，实际 ' + matched.line);
      }
    }
    assert.strictEqual(missing.length, 0, '以下规则未命中 fixture：\n  ' + missing.join('\n  '));
    assert.strictEqual(wrongLine.length, 0, '以下规则行号不准确：\n  ' + wrongLine.join('\n  '));

    // 严重级别与建议文案
    var byRule = {};
    for (var k = 0; k < hits.length; k++) byRule[hits[k].rule] = hits[k];
    assert.strictEqual(byRule['optional-chaining'].severity, 'error');
    assert.strictEqual(byRule['private-field'].severity, 'error');
    assert.strictEqual(byRule['array-flat'].severity, 'warn');
    assert.ok(byRule['optional-chaining'].suggestion.length > 0, '违规项应带修复建议');
  });

  /* ---------------------------------------------------------
   * 用例 2：遮蔽器正确性（字符串/注释/正则/模板不误报）
   * ------------------------------------------------------- */
  suite.test('compat: 字符串/注释/正则/模板字面量不误报', function () {
    var content = readFixture('safe-syntax.js.txt');
    var hits = compat.scanCode(content, 'test/fixtures/safe-syntax.js.txt');
    var msg = [];
    for (var i = 0; i < hits.length; i++) msg.push(formatIssue(hits[i]));
    assert.strictEqual(hits.length, 0, '干净样本被误报：\n    ' + msg.join('\n    '));

    // 遮蔽器本身：字符串内容必须被遮蔽，代码必须保留
    var masked = compat.maskCode('var a = "x?.y"; var b = c?.d; // e?.f');
    assert.strictEqual(masked.indexOf('x?.y'), -1, '字符串内容应被遮蔽');
    assert.notStrictEqual(masked.indexOf('c?.d'), -1, '真实代码应保留');
    assert.strictEqual(masked.indexOf('e?.f'), -1, '行注释内容应被遮蔽');

    // 模板字符串：字面量遮蔽、${} 表达式内仍是代码
    var maskedTpl = compat.maskCode('var s = `ab?.cd ${v?.w} ef`;');
    assert.strictEqual(maskedTpl.indexOf('ab?.cd'), -1, '模板字面量应被遮蔽');
    assert.notStrictEqual(maskedTpl.indexOf('v?.w'), -1, '${} 内表达式应保留');

    // 正则字面量中的引号不能把状态机带偏
    var maskedRe = compat.maskCode('var re = /["\'`]/g; var z = q?.r;');
    assert.notStrictEqual(maskedRe.indexOf('q?.r'), -1, '正则后的代码应继续被识别');
  });

  /* ---------------------------------------------------------
   * 用例 3：HTML 内联脚本提取与行号偏移
   * ------------------------------------------------------- */
  suite.test('compat: HTML 内联脚本提取 + type=module 检查', function () {
    var html = readFixture('bad-inline.html.txt');
    var scripts = compat.extractInlineScripts(html);
    assert.strictEqual(scripts.length, 4, '应提取到 4 个 script 标签');
    assert.strictEqual(scripts[0].hasSrc, false);
    assert.strictEqual(scripts[1].hasSrc, true, '外链 script 应被标记 hasSrc');
    assert.strictEqual(scripts[2].isModule, true, 'module script 应被标记 isModule');
    assert.strictEqual(scripts[3].hasSrc, false);

    // 行号偏移：内联脚本违规行号应换算成 HTML 文件行号
    var expectedLine = lineOf(html, 'window.data?.value');
    var hits = compat.scanCode(scripts[0].body, 'bad-inline.html', { baseLine: scripts[0].baseLine });
    var optHit = null;
    for (var i = 0; i < hits.length; i++) {
      if (hits[i].rule === 'optional-chaining') { optHit = hits[i]; break; }
    }
    assert.ok(optHit, '内联脚本应命中 optional-chaining');
    assert.strictEqual(optHit.line, expectedLine, '内联脚本行号必须换算为 HTML 文件行号');
    // baseLine 记录 <script> 开标签所在行，body 第 1 行即该行 '>' 之后
    var scriptTagLine = lineOf(html, '<script>');
    assert.strictEqual(scripts[0].baseLine, scriptTagLine, '内联脚本 baseLine 应为 <script> 开标签行号');
  });

  /* ---------------------------------------------------------
   * 用例 4：全项目扫描零违规
   * ------------------------------------------------------- */
  suite.test('compat: 全项目扫描（src/server/test/tools/config/HTML）零违规', function () {
    var scan = compat.runScan({ root: ctx.root });
    cachedScan = scan;
    ctx.compatScan = scan;

    var errors = compat.collectErrors(scan);
    assert.strictEqual(errors.length, 0,
      '发现 ' + errors.length + ' 个兼容性错误：\n' + firstIssues(errors));

    // 覆盖范围抽查
    var needJs = ['server.js', 'src/core/kui.js', 'test/dom-stub.js', 'tools/check-compat.js', 'tools/build-config.js'];
    var jsSet = {};
    for (var i = 0; i < scan.files.js.length; i++) jsSet[scan.files.js[i]] = true;
    var missing = [];
    for (var j = 0; j < needJs.length; j++) {
      if (!jsSet[needJs[j]]) missing.push(needJs[j]);
    }
    assert.strictEqual(missing.length, 0, '扫描遗漏 JS 文件：' + missing.join(', '));

    var jsonSet = {};
    for (var k = 0; k < scan.files.json.length; k++) jsonSet[scan.files.json[k]] = true;
    assert.ok(jsonSet['config/app.json'], '应扫描 config/app.json');
    assert.ok(jsonSet['package.json'], '应扫描 package.json');

    // 生成文件不应被误报（被显式排除）
    assert.strictEqual(scan.stats.jsonErrors, 0, 'JSON 解析错误: ' + JSON.stringify(scan.jsonErrors));

    // index.html 存在时必须被扫描（HTML 内联脚本覆盖）
    var indexExists = fs.existsSync(path.join(ctx.root, 'index.html'));
    if (indexExists) {
      var htmlSet = {};
      for (var h = 0; h < scan.files.html.length; h++) htmlSet[scan.files.html[h]] = true;
      assert.ok(htmlSet['index.html'], 'index.html 应纳入 HTML 扫描');
    } else {
      ctx.warn('index.html 尚未创建，HTML 内联脚本扫描暂时为空');
    }
  });

  /* ---------------------------------------------------------
   * 用例 5：Node 13.14 真实语法校验覆盖全部文件
   * ------------------------------------------------------- */
  suite.test('compat: Node 13.14 语法校验覆盖全部 JS 与内联脚本', function () {
    var scan = cachedScan || compat.runScan({ root: ctx.root });
    cachedScan = scan;

    var mode = scan.syntaxMode;
    var isNode13 = /^v13\./.test(process.version);
    var allowed = ['in-process-node13', 'spawn-node13', 'current-runtime'];
    assert.notStrictEqual(allowed.indexOf(mode), -1, '未知语法校验模式: ' + mode);

    if (isNode13) {
      assert.strictEqual(mode, 'in-process-node13', 'Node13 运行时应使用进程内真实 Node13 解析校验');
      assert.strictEqual(process.version, 'v13.14.0', 'Node13 运行时版本应为 v13.14.0，实际 ' + process.version);
    } else if (mode === 'current-runtime') {
      ctx.warn('当前环境无法 spawn Node13（受限沙箱），语法校验降级为 ' + process.version +
        ' 解析；请用 .tools/node-v13.14.0-win-x64/node.exe test/run.js 跑一次真实 Node13 校验');
    } else {
      assert.strictEqual(mode, 'spawn-node13', '非 Node13 运行时应通过 spawn node13 --check 校验');
    }

    assert.strictEqual(scan.syntaxFailures.length, 0,
      'Node13 语法校验失败：\n' + firstIssues(scan.syntaxFailures));
    var expectedChecked = scan.files.js.length + scan.inlineScripts;
    assert.strictEqual(scan.stats.checkedFiles, expectedChecked,
      '应校验 ' + expectedChecked + ' 个文件，实际 ' + scan.stats.checkedFiles);
    assert.ok(scan.files.js.length >= 10, '扫描到的 JS 文件数量异常: ' + scan.files.js.length);
  });

  /* ---------------------------------------------------------
   * 用例 6：Node13 工具链存在性
   * ------------------------------------------------------- */
  suite.test('compat: Node 13.14 可执行文件存在', function () {
    assert.ok(fs.existsSync(ctx.node13Path), 'Node13 不存在: ' + ctx.node13Path);
    var stat = fs.statSync(ctx.node13Path);
    assert.ok(stat.isFile(), 'Node13 路径不是文件');
    if (/^v13\./.test(process.version)) {
      assert.strictEqual(process.execPath, ctx.node13Path, 'Node13 运行时应由 Node13 可执行文件启动');
    }
  });

  /* ---------------------------------------------------------
   * 用例 7：规则表完整性 + 扫描不留临时文件
   * ------------------------------------------------------- */
  suite.test('compat: 规则表完整 & 扫描不污染工作区', function () {
    var required = ['optional-chaining', 'nullish', 'logical-assign-or', 'logical-assign-and',
      'nullish-assign', 'replace-all', 'array-at', 'object-from-entries', 'structured-clone',
      'private-field', 'intl-relative-time', 'esm-import-stmt', 'esm-export-stmt',
      'esm-dynamic-import', 'object-has-own', 'array-flat', 'array-flat-map'];
    var ids = {};
    for (var i = 0; i < compat.RULES.length; i++) ids[compat.RULES[i].id] = compat.RULES[i];
    var missing = [];
    for (var j = 0; j < required.length; j++) {
      if (!ids[required[j]]) missing.push(required[j]);
    }
    assert.strictEqual(missing.length, 0, '规则表缺失: ' + missing.join(', '));

    var names = fs.readdirSync(ctx.root);
    for (var k = 0; k < names.length; k++) {
      assert.strictEqual(names[k].indexOf('kui-compat-'), -1, '扫描器残留临时目录: ' + names[k]);
    }
  });
};

#!/usr/bin/env node
/**
 * check-beginner-manual.js — KurumiUI 小白入门手册一致性校验
 *
 * 零依赖、Node.js >= 13.14 可跑（与 package.json engines 保持一致）。
 *
 * 用法:
 *   node tools/check-beginner-manual.js            # 人读报告
 *   node tools/check-beginner-manual.js --json     # 机器可读（CI）
 *   node tools/check-beginner-manual.js --strict   # 警告也视为失败
 *   node tools/check-beginner-manual.js --quiet    # 只打印汇总与错误
 *   node tools/check-beginner-manual.js --help
 *
 * 校验项:
 *   1. 目录存在、章节文件齐全且编号连续（01..10）
 *   2. README 索引每一章，且链接到高级手册
 *   3. 每章 H1（# NN · 标题）编号与文件名一致
 *   4. 每章元信息行：> 适用版本：KurumiUI v1.4.2 ｜ 难度 ｜ 前置章节 ｜ 阅读时长
 *   5. 必备小节：## 本章目标 / ## 本章小结 / ## 延伸阅读
 *   6. 所有 ```json 代码块可被 JSON.parse
 *   7. json 里的节点 type ∈ 运行时 41 个注册类型（action 同理）
 *   8. 相对内链目标存在；禁止源码行号 / 绝对路径 / TODO·待核实
 *   9. 数量口径与运行时一致（注册类型 / 表单控件 / 内置动作 / 业务函数 / 主题）
 *  10. 章节体量下限（章 ≥ 6000 字符、README ≥ 4000 字符）
 *
 * 退出码: 0 通过 / 1 有错误 / 2 无法运行（目录缺失、运行时加载失败等）
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var DIR = path.join(ROOT, 'docs', 'manual-beginner');

var EXPECTED = [
  '01-setup',
  '02-first-run',
  '03-tour',
  '04-config-ui',
  '05-new-page',
  '06-form-basics',
  '07-theme-basics',
  '08-deploy',
  '09-troubleshooting',
  '10-next-steps'
];

var VER = '1.4.2';
var MIN_CHAPTER_CHARS = 6000;
var MIN_README_CHARS = 4000;

// 不是节点 type、但会出现在示例 JSON 里的「信封/规则」值
var NON_NODE_TYPES = {
  email: 1, url: 1, phone: 1, tel: 1, integer: 1, pattern: 1, idcard: 1,
  dialog: 1, 'theme:apply': 1, height: 1, width: 1, ready: 1, resize: 1,
  submit: 1, cancel: 1,
  // 配置节点（菜单项 / 分组 / 分隔线）不是渲染节点，但会出现在 JSON 示例里
  item: 1, group: 1, divider: 1, 'tab': 1, page: 1
};

var argv = process.argv.slice(2);
var OPT = { json: false, strict: false, quiet: false };
for (var i = 0; i < argv.length; i++) {
  var a = argv[i];
  if (a === '--json') OPT.json = true;
  else if (a === '--strict') OPT.strict = true;
  else if (a === '--quiet') OPT.quiet = true;
  else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
  else {
    console.error('未知参数: ' + a + '（用 --help 查看用法）');
    process.exit(2);
  }
}

var errors = [];
var warnings = [];
var stats = {
  files: 0,
  chapters: 0,
  jsonBlocks: 0,
  links: 0,
  chars: 0
};

function printHelp() {
  console.log('用法: node tools/check-beginner-manual.js [--json] [--strict] [--quiet] [--help]');
  console.log('');
  console.log('校验 docs/manual-beginner/ 小白手册：章节完整性、元信息、必备小节、');
  console.log('JSON 可解析、示例 type/action 合法、内部链接、数量口径与体量。');
}

function err(file, line, code, message) {
  errors.push({ file: file, line: line || 0, code: code, message: message });
}
function warn(file, line, code, message) {
  warnings.push({ file: file, line: line || 0, code: code, message: message });
}
function lineOf(text, idx) {
  return text.slice(0, idx).split('\n').length;
}
function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}
function exists(p) {
  try { fs.statSync(p); return true; } catch (e) { return false; }
}
function read(p) {
  return fs.readFileSync(p, 'utf8');
}

/* =============================================================
 *  0. 运行时基线（与高级手册校验器同一口径）
 * ============================================================= */
function loadRuntime() {
  var rt = {
    types: 41, controls: 19, actions: 28, handlers: 61, themes: 6,
    typeSet: Object.create(null), actionSet: Object.create(null), live: false
  };
  try {
    var stub = require(path.join(ROOT, 'test', 'dom-stub.js'));
    var env = stub.createEnvironment({ root: ROOT, fileMode: true });
    var lk = require(path.join(ROOT, 'test', 'load-kui.js'));
    lk.loadKui(env, {});
    var KUI = env.window.KUI;
    var list = KUI.registry.list();
    rt.types = list.length;
    rt.controls = list.filter(function (x) { return x.category === 'control'; }).length;
    list.forEach(function (x) { rt.typeSet[x.type] = 1; });
    var acts = KUI.actions.list();
    rt.actions = acts.length;
    acts.forEach(function (x) { rt.actionSet[x] = 1; });
    rt.handlers = KUI.handlers.list().length;
    var themes = JSON.parse(read(path.join(ROOT, 'src', 'themes.json')));
    var arr = (themes && themes.themes) || themes || [];
    rt.themes = arr.length;
    rt.live = true;
  } catch (e) {
    warn('(runtime)', 0, 'RUNTIME', '加载运行时失败，type/数量校验将使用静态基线：' + (e && e.message ? e.message : e));
  }
  return rt;
}

/* =============================================================
 *  1. 收集章节文件
 * ============================================================= */
function collectChapters() {
  var names;
  try {
    names = fs.readdirSync(DIR);
  } catch (e) {
    err('docs/manual-beginner', 0, 'DIR', '目录不存在或不可读：docs/manual-beginner/');
    return [];
  }
  var chapters = [];
  names.sort().forEach(function (name) {
    if (!/\.md$/.test(name)) return;
    if (name.charAt(0) === '_') return;          // 内部约定文件不校验
    if (name === 'README.md') return;
    var m = /^(\d\d)-[A-Za-z0-9._-]+\.md$/.exec(name);
    if (!m) {
      warn('docs/manual-beginner/' + name, 0, 'NAME', '文件名不符合「NN-英文名.md」格式');
      return;
    }
    chapters.push({ num: m[1], name: name.replace(/\.md$/, ''), file: 'docs/manual-beginner/' + name });
  });
  return chapters;
}

/* =============================================================
 *  2. 章节清单校验
 * ============================================================= */
function checkChapterList(chapters) {
  var seen = Object.create(null);
  chapters.forEach(function (c) { seen[c.name] = 1; });
  EXPECTED.forEach(function (name, idx) {
    var num = ('0' + (idx + 1)).slice(-2);
    if (!seen[name]) {
      err('docs/manual-beginner/' + name + '.md', 0, 'MISSING', '缺少章节文件（应为 ' + name + '.md）');
    }
    delete seen[name];
  });
  Object.keys(seen).forEach(function (name) {
    err('docs/manual-beginner/' + name + '.md', 0, 'EXTRA', '不在预期清单中的章节文件');
  });
  // 编号连续
  var nums = chapters.map(function (c) { return c.num; }).sort();
  nums.forEach(function (n, idx) {
    var want = ('0' + (idx + 1)).slice(-2);
    if (n !== want) {
      warn('docs/manual-beginner', 0, 'NUMBER', '章节编号不连续：期望 ' + want + '，实际 ' + n);
    }
  });
}

/* =============================================================
 *  3. 通用：JSON 代码块 / 链接 / 类型
 * ============================================================= */
function walkJson(value, fn) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(function (v) { walkJson(v, fn); });
    return;
  }
  fn(value);
  Object.keys(value).forEach(function (k) { walkJson(value[k], fn); });
}

function checkJsonBlocks(file, text, rt) {
  var re = /```json[^\n]*\n([\s\S]*?)```/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    var body = m[1];
    var line = lineOf(text, m.index);
    var data;
    try {
      data = JSON.parse(body);
    } catch (e) {
      err(file, line, 'JSON', 'json 代码块无法解析：' + e.message);
      continue;
    }
    stats.jsonBlocks++;
    walkJson(data, function (obj) {
      var t = obj.type;
      if (typeof t === 'string' && !rt.typeSet[t] && !NON_NODE_TYPES[t]) {
        err(file, line, 'TYPE', '示例里的 type "' + t + '" 不是注册类型（共 ' + rt.types + ' 个；不确定就别写具体 type）');
      }
      var act = obj.action;
      if (typeof act === 'string' && rt.live && !rt.actionSet[act]) {
        warn(file, line, 'ACTION', '示例里的 action "' + act + '" 不在内置动作清单中（共 ' + rt.actions + ' 个）');
      }
    });
  }
}

function checkLinks(file, text, baseDir) {
  var re = /!?\[[^\]]*\]\(([^)\s]+)\)/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    var target = m[1];
    if (/^(https?:|mailto:|tel:|#|data:)/i.test(target)) continue;
    if (target.charAt(0) === '<' && target.charAt(target.length - 1) === '>') {
      target = target.slice(1, -1);
    }
    var clean = target.split('#')[0];
    if (!clean) continue;
    stats.links++;
    var abs = path.resolve(baseDir, clean);
    if (!exists(abs)) {
      err(file, lineOf(text, m.index), 'LINK', '内部链接目标不存在：' + target);
    }
  }
}

function checkForbidden(file, text) {
  var m;
  var reSource = /src\/[A-Za-z0-9._\/-]+\.js:\d+/g;
  while ((m = reSource.exec(text)) !== null) {
    err(file, lineOf(text, m.index), 'SOURCE', '出现源码行号引用（小白手册禁止）：' + m[0]);
  }
  var reAbs = /[A-Za-z]:\\\\[^\s`"')]+/g;
  while ((m = reAbs.exec(text)) !== null) {
    warn(file, lineOf(text, m.index), 'ABS', '出现 Windows 绝对路径：' + m[0]);
  }
  var reTodo = /待核实|TODO|FIXME|待补充/g;
  while ((m = reTodo.exec(text)) !== null) {
    err(file, lineOf(text, m.index), 'TODO', '出现未完成标记：' + m[0]);
  }
}

/* =============================================================
 *  4. 单章校验
 * ============================================================= */
function checkChapter(chapter, rt) {
  var file = chapter.file;
  var abs = path.join(ROOT, file);
  if (!exists(abs)) return;
  var text = read(abs);
  stats.files++;
  stats.chapters++;
  stats.chars += text.length;

  if (text.length < MIN_CHAPTER_CHARS) {
    warn(file, 0, 'SIZE', '章节体量过小（' + text.length + ' 字符 < ' + MIN_CHAPTER_CHARS + '）');
  }

  // H1
  var h1 = /^#\s+(\d\d)\s*·\s*(.+)$/m.exec(text);
  if (!h1) {
    err(file, 1, 'H1', '第一行应为「# NN · 中文标题」');
  } else if (h1[1] !== chapter.num) {
    err(file, 1, 'H1', 'H1 编号 ' + h1[1] + ' 与文件名编号 ' + chapter.num + ' 不一致');
  }

  // 元信息行
  var metaLine = null;
  var metaIdx = -1;
  var lines = text.split('\n');
  for (var i = 0; i < lines.length; i++) {
    if (/^>\s*适用版本[:：]/.test(lines[i])) { metaLine = lines[i]; metaIdx = i + 1; break; }
  }
  if (!metaLine) {
    err(file, 1, 'META', '缺少元信息行「> 适用版本：KurumiUI v' + VER + ' ｜ 难度：⭐ 入门 ｜ 前置章节：… ｜ 阅读时长：约 N 分钟」');
  } else {
    if (metaLine.indexOf('v' + VER) === -1) {
      err(file, metaIdx, 'META', '元信息行版本应为 v' + VER + '：' + metaLine.trim());
    }
    if (metaLine.indexOf('难度') === -1) warn(file, metaIdx, 'META', '元信息行缺少「难度」');
    if (metaLine.indexOf('前置章节') === -1) warn(file, metaIdx, 'META', '元信息行缺少「前置章节」');
    if (metaLine.indexOf('阅读时长') === -1) warn(file, metaIdx, 'META', '元信息行缺少「阅读时长」');
  }

  // 必备小节
  [
    { re: /^##\s+(?:\d+\.\s*)?本章目标/m, name: '## 本章目标' },
    { re: /^##\s+(?:\d+\.\s*)?本章小结/m, name: '## 本章小结' },
    { re: /^##\s+(?:\d+\.\s*)?延伸阅读/m, name: '## 延伸阅读' }
  ].forEach(function (item) {
    if (!item.re.test(text)) err(file, 1, 'SECTION', '缺少必备小节「' + item.name + '」');
  });

  // 内容规则
  checkJsonBlocks(file, text, rt);
  checkLinks(file, text, path.dirname(abs));
  checkForbidden(file, text);
}

/* =============================================================
 *  5. README 校验
 * ============================================================= */
function checkReadme(chapters, rt) {
  var file = 'docs/manual-beginner/README.md';
  var abs = path.join(ROOT, file);
  if (!exists(abs)) {
    err(file, 0, 'README', '缺少 README.md');
    return;
  }
  var text = read(abs);
  stats.files++;
  stats.chars += text.length;
  if (text.length < MIN_README_CHARS) {
    warn(file, 0, 'SIZE', 'README 体量过小（' + text.length + ' 字符 < ' + MIN_README_CHARS + '）');
  }
  var metaFound = false;
  text.split('\n').forEach(function (ln) {
    if (/^>\s*适用版本[:：]/.test(ln) && ln.indexOf('v' + VER) !== -1) metaFound = true;
  });
  if (!metaFound) err(file, 1, 'META', 'README 缺少元信息行或版本不是 v' + VER);

  // 索引每一章
  chapters.forEach(function (c) {
    if (text.indexOf('(' + c.name + '.md)') === -1) {
      err(file, 0, 'TOC', 'README 未索引章节：' + c.name + '.md');
    }
  });
  // 必须链接高级手册
  if (text.indexOf('../manual/README.md') === -1) {
    warn(file, 0, 'TOC', 'README 未链接高级手册 ../manual/README.md（两份手册应互相链接）');
  }
  checkJsonBlocks(file, text, rt);
  checkLinks(file, text, DIR);
  checkForbidden(file, text);
}

/* =============================================================
 *  6. 数量口径一致性（所有文件）
 * ============================================================= */
function checkCounts(filesText, rt) {
  var rules = [
    { re: /(\d+)\s*个?\s*注册类型/g, expect: rt.types, label: '注册类型' },
    { re: /(\d+)\s*个?\s*表单控件/g, expect: rt.controls, label: '表单控件' },
    { re: /(\d+)\s*个?\s*内置动作/g, expect: rt.actions, label: '内置动作' },
    { re: /(\d+)\s*个?\s*业务函数/g, expect: rt.handlers, label: '业务函数' },
    { re: /(\d+)\s*套?\s*主题/g, expect: rt.themes, label: '主题' }
  ];
  filesText.forEach(function (item) {
    rules.forEach(function (rule) {
      var m;
      var re = new RegExp(rule.re.source, 'g');
      while ((m = re.exec(item.text)) !== null) {
        var n = parseInt(m[1], 10);
        if (n !== rule.expect) {
          warn(item.file, lineOf(item.text, m.index), 'COUNT',
            rule.label + '数量口径写的是 ' + n + '，运行时为 ' + rule.expect + '（截至本次校验）');
        }
      }
    });
  });
}

/* =============================================================
 *  7. 主流程
 * ============================================================= */
function main() {
  if (!exists(DIR)) {
    console.error('❌ 目录不存在：docs/manual-beginner/');
    process.exit(2);
  }
  var rt = loadRuntime();
  var chapters = collectChapters();
  checkChapterList(chapters);
  var texts = [];
  chapters.forEach(function (c) {
    checkChapter(c, rt);
    if (exists(path.join(ROOT, c.file))) texts.push({ file: c.file, text: read(path.join(ROOT, c.file)) });
  });
  checkReadme(chapters, rt);
  var readmeAbs = path.join(DIR, 'README.md');
  if (exists(readmeAbs)) texts.push({ file: 'docs/manual-beginner/README.md', text: read(readmeAbs) });
  checkCounts(texts, rt);

  var ok = errors.length === 0 && (!OPT.strict || warnings.length === 0);
  var report = {
    ok: ok,
    checkedAt: new Date().toISOString(),
    scanned: {
      files: stats.files,
      chapters: stats.chapters,
      jsonBlocks: stats.jsonBlocks,
      links: stats.links,
      chars: stats.chars
    },
    runtime: {
      types: rt.types,
      controls: rt.controls,
      actions: rt.actions,
      handlers: rt.handlers,
      themes: rt.themes,
      live: rt.live
    },
    strict: OPT.strict,
    errors: errors,
    warnings: warnings
  };

  if (OPT.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    if (!OPT.quiet) {
      console.log('小白手册校验（docs/manual-beginner/）');
      console.log('  版本基线      v' + VER);
      console.log('  扫描文件      ' + stats.files + '（章节 ' + stats.chapters + '）');
      console.log('  JSON 代码块   ' + stats.jsonBlocks);
      console.log('  内部链接      ' + stats.links);
      console.log('  总字符        ' + stats.chars);
      console.log('  运行时基线    类型 ' + rt.types + ' / 控件 ' + rt.controls + ' / 动作 ' + rt.actions + ' / 业务函数 ' + rt.handlers + ' / 主题 ' + rt.themes + (rt.live ? '' : '（静态兜底）'));
      console.log('');
    }
    errors.forEach(function (e) {
      report.lines = true;
      console.log('  ✗ [' + e.code + '] ' + e.file + (e.line ? ':' + e.line : '') + '  ' + e.message);
    });
    if (!OPT.quiet) {
      warnings.forEach(function (w) {
        console.log('  ! [' + w.code + '] ' + w.file + (w.line ? ':' + w.line : '') + '  ' + w.message);
      });
    }
    var v = errors.length === 0 ? (warnings.length === 0 ? '✅ 通过' : '⚠️ 通过（有 ' + warnings.length + ' 条警告）') : '❌ 失败';
    console.log((OPT.quiet ? '' : '') + '汇总：错误 ' + errors.length + '，警告 ' + warnings.length + '，结果：' + v);
  }

  process.exit(ok ? 0 : 1);
}

main();

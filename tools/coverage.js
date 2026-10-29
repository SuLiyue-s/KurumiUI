#!/usr/bin/env node
/*
 * KurumiUI · tools/coverage.js
 * ---------------------------------------------------------------
 * 代码覆盖率（零依赖，Node ≥ 13.14）：
 *   用 NODE_V8_COVERAGE 采集 test/run.js（或指定脚本）的 V8 覆盖率，
 *   统计 src/ 下各文件的行覆盖率，输出明细 + 汇总（JSON 落盘 .coverage/）。
 *
 * 用法：
 *   node tools/coverage.js                     # 跑 test/run.js
 *   node tools/coverage.js test/run.js         # 指定测试入口
 *   node tools/coverage.js --min=60            # 低于阈值时退出码 1
 *   node tools/coverage.js --json              # 仅输出 JSON
 *   node tools/coverage.js --quiet             # 只输出汇总
 *
 * 说明：V8 覆盖率按「函数 + 区间」记录执行次数；本工具取「行首偏移落入的
 * 最内层区间」的次数作为该行执行次数，因此同一行被多个分支共享时按已覆盖计。
 */
'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var SRC_DIR = path.join(ROOT, 'src') + path.sep;
var args = process.argv.slice(2);

var jsonOnly = false;
var quiet = false;
var minCoverage = null;
var withAll = false;
var entries = [];
for (var i = 0; i < args.length; i++) {
  var a = args[i];
  if (a === '--json') { jsonOnly = true; }
  else if (a === '--quiet') { quiet = true; }
  else if (a === '--all') { withAll = true; }
  else if (a.indexOf('--min=') === 0) { minCoverage = parseFloat(a.slice(6)); }
  else if (a.charAt(0) !== '-') { entries.push(a); }
}
if (!entries.length) {
  entries = ['test/run.js'];
  if (withAll) { entries.push('tools/smoke.js'); }
}

/* ---------- 1. 采集 ---------- */
var outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kui-coverage-'));
var env = {};
for (var k in process.env) { if (Object.prototype.hasOwnProperty.call(process.env, k)) { env[k] = process.env[k]; } }
env.NODE_V8_COVERAGE = outDir;

var failed = false;
for (var ei = 0; ei < entries.length; ei++) {
  var entry = entries[ei];
  if (!jsonOnly) { console.log('[coverage] 运行 ' + entry + '（NODE_V8_COVERAGE）…'); }
  var run = cp.spawnSync(process.execPath, [entry], {
    cwd: ROOT,
    env: env,
    stdio: jsonOnly ? 'pipe' : 'inherit'
  });
  if (run.status !== 0) {
    failed = true;
    if (run.stdout) { process.stdout.write(run.stdout); }
    if (run.stderr) { process.stderr.write(run.stderr); }
  }
}

/* ---------- 2. 汇总 V8 覆盖率 ---------- */
var coverFiles = [];
try { coverFiles = fs.readdirSync(outDir); } catch (e) { coverFiles = []; }

function fileUrlToPath(url) {
  if (!url || url.indexOf('file://') !== 0) { return null; }
  var p = decodeURIComponent(url.slice(7));
  if (process.platform === 'win32') { p = p.replace(/^\//, '').replace(/\//g, '\\'); }
  return p;
}

var scripts = {}; // absPath -> { source, ranges: [{start,end,count}] }

for (var fi = 0; fi < coverFiles.length; fi++) {
  if (!/\.json$/.test(coverFiles[fi])) { continue; }
  var raw;
  try { raw = JSON.parse(fs.readFileSync(path.join(outDir, coverFiles[fi]), 'utf8')); } catch (e) { continue; }
  var arr = (raw && raw.result) || [];
  for (var ri = 0; ri < arr.length; ri++) {
    var abs = fileUrlToPath(arr[ri].url);
    if (!abs || abs.indexOf(SRC_DIR) !== 0 || !/\.js$/.test(abs) || !fs.existsSync(abs)) { continue; }
    var src;
    try { src = fs.readFileSync(abs, 'utf8'); } catch (e) { continue; }
    var rec = scripts[abs] || (scripts[abs] = { source: src, ranges: [] });
    var fns = arr[ri].functions || [];
    for (var f = 0; f < fns.length; f++) {
      var ranges = fns[f].ranges || [];
      for (var r = 0; r < ranges.length; r++) {
        var rg = ranges[r];
        if (typeof rg.startOffset === 'number' && typeof rg.endOffset === 'number' && rg.endOffset > rg.startOffset) {
          rec.ranges.push({ start: rg.startOffset, end: rg.endOffset, count: rg.count || 0 });
        }
      }
    }
  }
}

/* ---------- 3. 行覆盖率计算 ---------- */
function countAt(ranges, offset) {
  /* 最内层区间 = start 最大且包含 offset 的区间 */
  var best = null;
  for (var i = 0; i < ranges.length; i++) {
    var rg = ranges[i];
    if (rg.start <= offset && rg.end > offset) {
      if (!best || rg.start >= best.start) { best = rg; }
    }
  }
  return best ? best.count : null;
}

function lineStarts(source) {
  var starts = [0];
  for (var i = 0; i < source.length; i++) { if (source.charAt(i) === '\n') { starts.push(i + 1); } }
  return starts;
}

var report = [];
var totalLines = 0;
var coveredLines = 0;

Object.keys(scripts).sort().forEach(function (abs) {
  var rec = scripts[abs];
  var starts = lineStarts(rec.source);
  var lineCount = starts.length;
  var fileTotal = 0;
  var fileCovered = 0;
  var uncovered = [];

  for (var l = 0; l < lineCount; l++) {
    var lineEnd = l + 1 < lineCount ? starts[l + 1] : rec.source.length;
    var text = rec.source.slice(starts[l], lineEnd);
    var trimmed = text.replace(/^\s+/, '');
    if (!trimmed) { continue; }                       // 空行
    if (/^\/[/*]/.test(trimmed) || /^\*/.test(trimmed) || /^\/\//.test(trimmed)) { continue; } // 注释行
    var offset = starts[l] + (text.length - trimmed.length);
    var c = countAt(rec.ranges, offset);
    if (c === null) { continue; }                    // 不在任何函数区间（理论上不存在）
    fileTotal++;
    if (c > 0) { fileCovered++; }
    else if (uncovered.length < 50) { uncovered.push(l + 1); }
  }

  var pct = fileTotal ? (fileCovered / fileTotal * 100) : 100;
  report.push({
    file: path.relative(ROOT, abs).replace(/\\/g, '/'),
    lines: fileTotal,
    covered: fileCovered,
    percent: Math.round(pct * 10) / 10,
    uncovered: uncovered
  });
  totalLines += fileTotal;
  coveredLines += fileCovered;
});

var summary = {
  entries: entries,
  files: report.length,
  lines: totalLines,
  covered: coveredLines,
  percent: totalLines ? Math.round(coveredLines / totalLines * 1000) / 10 : 100,
  generatedAt: new Date().toISOString()
};

/* ---------- 4. 输出 ---------- */
if (jsonOnly) {
  console.log(JSON.stringify({ summary: summary, files: report }, null, 2));
} else {
  if (!quiet) {
    console.log('');
    console.log('文件                                       行数  已覆盖   覆盖率  未覆盖行号');
    console.log('-------------------------------------------------------------------------------');
    report.forEach(function (r) {
      var name = r.file.length > 40 ? '…' + r.file.slice(-39) : r.file;
      var pad = name + new Array(Math.max(1, 42 - name.length)).join(' ');
      var unc = r.uncovered.slice(0, 14).join(',') + (r.uncovered.length > 14 ? '…' : '');
      console.log(pad + String(r.lines).padStart(6) + String(r.covered).padStart(8) + (String(r.percent) + '%').padStart(9) + '  ' + unc);
    });
    console.log('-------------------------------------------------------------------------------');
  }
  console.log('[coverage] src/ 行覆盖率 ' + summary.percent + '%（' + summary.covered + '/' + summary.lines + ' 行，' + summary.files + ' 个文件）');
}

/* 报告落盘（.coverage/ 已被 git 忽略） */
try {
  var outFile = path.join(ROOT, '.coverage', 'report.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ summary: summary, files: report }, null, 2));
  if (!jsonOnly) { console.log('[coverage] 报告已写入 .coverage/report.json'); }
} catch (e) { /* 落盘失败不影响退出码 */ }

if (failed) { console.error('[coverage] 被测脚本存在失败退出，覆盖率仅供定位使用'); }
if (minCoverage != null && summary.percent < minCoverage) {
  console.error('[coverage] 未达到阈值 ' + minCoverage + '%');
  process.exit(1);
}

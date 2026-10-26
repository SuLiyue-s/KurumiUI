/**
 * test/run.js —— KurumiUI 测试总入口
 * ---------------------------------------------------------------
 * 用法：
 *   node test/run.js
 *   node test/run.js --only=compat
 *   node test/run.js --only=compat,config
 *   node test/run.js --verbose          # 失败时打印完整堆栈
 *   node test/run.js --strict           # 把 SKIP 也视为失败（最终验收用）
 *
 * 兼容 Node 13.14（零依赖，仅使用 fs / path / 内置 assert）。
 * 任一用例失败 -> 退出码 1。
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var NODE13_PATH = path.join(ROOT, '.tools', 'node-v13.14.0-win-x64', 'node.exe');
var SUITES = ['compat', 'config', 'server', 'render'];
var SUITE_FILES = {
  compat: 'compat.test.js',
  config: 'config.test.js',
  server: 'server.test.js',
  render: 'render.test.js'
};

/* ---------------------------------------------------------
 * 参数解析
 * ------------------------------------------------------- */
function parseArgs(argv) {
  var opts = { only: null, verbose: false, strict: false, list: false, help: false };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a === '--verbose' || a === '-v') opts.verbose = true;
    else if (a === '--strict') opts.strict = true;
    else if (a === '--list') opts.list = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a.indexOf('--only=') === 0) {
      opts.only = [];
      var parts = a.slice(7).split(',');
      for (var j = 0; j < parts.length; j++) {
        var name = parts[j].trim();
        if (name) opts.only.push(name);
      }
    } else if (a === '--only' && argv[i + 1]) {
      opts.only = String(argv[i + 1]).split(',');
      i += 1;
    } else {
      opts.unknown = opts.unknown || [];
      opts.unknown.push(a);
    }
  }
  return opts;
}

function usage() {
  console.log('KurumiUI 测试入口');
  console.log('');
  console.log('  node test/run.js                 运行全部用例');
  console.log('  node test/run.js --only=compat   只运行兼容性用例');
  console.log('  node test/run.js --only=compat,config');
  console.log('  node test/run.js --verbose       失败时输出完整堆栈');
  console.log('  node test/run.js --strict        SKIP 也视为失败');
  console.log('  node test/run.js --list          仅列出用例');
  console.log('');
  console.log('可用套件: ' + SUITES.join(' / '));
  console.log('');
  console.log('Node13 版: ".tools/node-v13.14.0-win-x64/node.exe" test/run.js');
}

/* ---------------------------------------------------------
 * 极简异步串行执行器
 * ------------------------------------------------------- */
function sequence(tasks) {
  var i = 0;
  function step() {
    if (i >= tasks.length) return Promise.resolve();
    var task = tasks[i];
    i += 1;
    return Promise.resolve()
      .then(function () { return task(); })
      .then(function () { return step(); });
  }
  return step();
}

function makeSkipError(reason) {
  var e = new Error(reason || 'skip');
  e.__skip = true;
  e.reason = reason || 'skip';
  return e;
}

/* ---------------------------------------------------------
 * 主流程
 * ------------------------------------------------------- */
function main() {
  var opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return Promise.resolve(0);
  }
  var suiteNames = SUITES;
  if (opts.only && opts.only.length) {
    var bad = [];
    for (var i = 0; i < opts.only.length; i++) {
      if (SUITES.indexOf(opts.only[i]) === -1) bad.push(opts.only[i]);
    }
    if (bad.length) {
      console.error('未知套件: ' + bad.join(', ') + '（可用: ' + SUITES.join(' / ') + '）');
      return Promise.resolve(1);
    }
    suiteNames = opts.only;
  }

  var records = [];
  var currentSuite = null;
  var suiteApi = {
    test: function (name, fn) {
      records.push({ suite: currentSuite, name: name, fn: fn, status: 'PENDING', duration: 0 });
    }
  };

  var dom = null;
  try {
    dom = require('./dom-stub');
  } catch (e) {
    console.error('[WARN] 加载 test/dom-stub.js 失败: ' + (e && e.message ? e.message : e));
  }

  var ctx = {
    root: ROOT,
    node13Path: NODE13_PATH,
    node13: { path: NODE13_PATH, exists: fs.existsSync(NODE13_PATH), version: process.version },
    dom: dom,
    assert: require('assert'),
    warn: function (message) {
      console.log('    [WARN] ' + message);
    },
    skip: function (reason) {
      throw makeSkipError(reason);
    },
    exists: function (rel) {
      return fs.existsSync(path.join(ROOT, rel));
    },
    readJson: function (rel) {
      return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^\uFEFF/, ''));
    },
    createEnvironment: dom ? dom.createEnvironment : null
  };

  // 注册所选套件
  for (var s = 0; s < suiteNames.length; s++) {
    var suiteName = suiteNames[s];
    var relFile = 'test/' + SUITE_FILES[suiteName];
    currentSuite = suiteName;
    var absFile = path.join(ROOT, 'test', SUITE_FILES[suiteName]);
    if (!fs.existsSync(absFile)) {
      (function (name, rel) {
        suiteApi.test(name + ' 套件（测试文件缺失）', function () {
          ctx.skip('等待交付: ' + rel);
        });
      })(suiteName, relFile);
      continue;
    }
    try {
      var register = require(absFile);
      if (typeof register !== 'function') {
        throw new Error(relFile + ' 应导出 register(suite, ctx) 函数');
      }
      register(suiteApi, ctx);
    } catch (e) {
      (function (suite, err) {
        suiteApi.test(suite + ' 套件加载失败', function () {
          throw err;
        });
      })(suiteName, e);
    }
  }

  if (opts.list) {
    console.log('用例列表（共 ' + records.length + ' 条）:');
    for (var l = 0; l < records.length; l++) {
      console.log('  [' + records[l].suite + '] ' + records[l].name);
    }
    return Promise.resolve(0);
  }

  var startedAt = Date.now();
  var counters = { pass: 0, fail: 0, skip: 0 };
  var failures = [];
  var lastSuite = null;

  console.log('');
  console.log('KurumiUI 测试套件   Node ' + process.version + '   ' + ROOT);
  console.log('────────────────────────────────────────────────────────────');

  var tasks = [];
  for (var r = 0; r < records.length; r++) {
    (function (record) {
      tasks.push(function () {
        if (record.suite !== lastSuite) {
          lastSuite = record.suite;
          console.log('');
          console.log('◆ ' + record.suite + '  测试');
        }
        var start = Date.now();
        var runIt;
        if (record.status === 'PENDING' && typeof record.fn === 'function') {
          runIt = Promise.resolve().then(function () { return record.fn(); });
        } else {
          runIt = Promise.reject(new Error('用例未正确注册'));
        }
        return runIt.then(function () {
          record.status = 'PASS';
          counters.pass += 1;
          console.log('  [PASS] ' + record.name + '  (' + (Date.now() - start) + 'ms)');
        }, function (err) {
          record.duration = Date.now() - start;
          if (err && err.__skip) {
            record.status = 'SKIP';
            record.reason = err.reason || String(err);
            counters.skip += 1;
            console.log('  [SKIP] ' + record.name + '  —— ' + record.reason);
            return;
          }
          record.status = 'FAIL';
          record.error = err;
          counters.fail += 1;
          failures.push(record);
          var message = err && err.message ? err.message : String(err);
          console.log('  [FAIL] ' + record.name + '  (' + (Date.now() - start) + 'ms)');
          console.log('         ' + message.split('\n').join('\n         '));
        });
      });
    })(records[r]);
  }

  return sequence(tasks).then(function () {
    var total = Date.now() - startedAt;
    console.log('');
    console.log('────────────────────────────────────────────────────────────');
    if (failures.length) {
      console.log('失败用例:');
      for (var f = 0; f < failures.length; f++) {
        var msg = failures[f].error && failures[f].error.message ? failures[f].error.message : String(failures[f].error);
        console.log('  - [' + failures[f].suite + '] ' + failures[f].name + ': ' + msg.split('\n')[0]);
        if (opts.verbose && failures[f].error && failures[f].error.stack) {
          console.log(failures[f].error.stack);
        }
      }
      console.log('');
    }
    var failCount = counters.fail + (opts.strict ? counters.skip : 0);
    var verdict = failCount === 0 ? 'PASS' : 'FAIL';
    console.log('汇总: ' + counters.pass + ' 通过 / ' + counters.fail + ' 失败 / ' + counters.skip +
      ' 跳过   总计 ' + records.length + '   耗时 ' + total + 'ms   => ' + verdict +
      (opts.strict && counters.skip ? '（strict 模式：SKIP 计为失败）' : ''));
    if (!/^v13\./.test(process.version) && fs.existsSync(NODE13_PATH)) {
      console.log('提示: 请再用 Node 13.14 运行一次 —— ".tools/node-v13.14.0-win-x64/node.exe" test/run.js');
    }
    console.log('');
    return failCount === 0 ? 0 : 1;
  });
}

if (require.main !== module) {
  module.exports = { main: main, parseArgs: parseArgs, SUITES: SUITES };
} else {
  main().then(function (code) {
    process.exitCode = code;
  }, function (err) {
    console.error('测试运行器异常: ' + (err && err.stack ? err.stack : err));
    process.exitCode = 1;
  });
}

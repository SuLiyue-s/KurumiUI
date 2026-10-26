/*
 * tools/build-all.js —— 生成 src/core/kui-all.js（单一入口装载器）
 *
 * 为什么需要它：
 *   以前每个页面都要手动列 15~20 个 <script>，框架加一个模块就要改 18 个 HTML——这既不优雅也容易漏。
 *   现在只维护 config/kui-modules.json 一份清单，本脚本把它编译成 src/core/kui-all.js；
 *   所有页面只引一行 <script src=".../src/core/kui-all.js" data-kui-profile="app|standalone">。
 *
 *   kui-all.js 在浏览器里用 document.write 同步注入（解析期执行，保证 classic script 顺序），
 *   在 Node 里（测试/审计脚本）则导出同一份 MODULES 清单，做到「浏览器和测试读同一份事实」。
 *
 * 用法：node tools/build-all.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var MANIFEST = path.join(ROOT, 'config', 'kui-modules.json');
var OUT = path.join(ROOT, 'src', 'core', 'kui-all.js');

function readManifest() {
  var data = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (!data || !data.profiles || typeof data.profiles !== 'object') {
    throw new Error('config/kui-modules.json 缺少 profiles');
  }
  Object.keys(data.profiles).forEach(function (name) {
    var p = data.profiles[name];
    p.files.forEach(function (rel) {
      if (!fs.existsSync(path.join(ROOT, rel))) {
        throw new Error('kui-modules.json 引用了不存在的文件: ' + rel);
      }
    });
  });
  return data;
}

function build() {
  var data = readManifest();
  var payload = { schema: data.schema, note: data.note, profiles: {} };
  Object.keys(data.profiles).forEach(function (name) {
    payload.profiles[name] = {
      desc: data.profiles[name].desc,
      files: data.profiles[name].files.slice()
    };
  });

  var banner = [
    '/*!',
    ' * KurumiUI 单一入口装载器（自动生成，请勿手工编辑）',
    ' * 来源: config/kui-modules.json + tools/build-all.js',
    ' * 重新生成: npm run build:config',
    ' */'
  ].join('\n');

  var body = [
    ';(function (g) {',
    '  "use strict";',
    '  var MODULES = ' + JSON.stringify(payload) + ';',
    '',
    '  /* Node 侧（test/audit 脚本）直接拿到清单，保证浏览器与测试同源同事实 */',
    '  if (typeof module !== "undefined" && module.exports) { module.exports = MODULES; return; }',
    '',
    '  var doc = g.document;',
    '  if (!doc) { return; }',
    '',
    '  var scriptEl = doc.currentScript || null;',
    '  var src = (scriptEl && scriptEl.src) || "";',
    '  /* 由 .../src/core/kui-all.js 推出项目根前缀，例如 "/" 或 "../" */',
    '  var root = src ? src.replace(/src\\/core\\/[^\\/]*$/, "") : "";',
    '  var profile = (scriptEl && scriptEl.getAttribute("data-kui-profile")) || "standalone";',
    '  var bucket = MODULES.profiles[profile] || MODULES.profiles.standalone;',
    '  var files = (bucket && bucket.files) || [];',
    '',
    '  /* 解析期：document.write 同步注入，保证与手写 <script> 完全相同的执行顺序 */',
    '  if (doc.readyState === "loading") {',
    '    var html = "";',
    '    for (var i = 0; i < files.length; i++) {',
    '      html += "<script src=\\"" + root + files[i] + "\\"><\\/script>\\n";',
    '    }',
    '    doc.write(html);',
    '    return;',
    '  }',
    '',
    '  /* 兜底：非解析期（极少数动态插入场景）改为串行加载，加载完发起 kui:all-ready 事件 */',
    '  var idx = 0;',
    '  function next() {',
    '    if (idx >= files.length) {',
    '      var ev = doc.createEvent("Event");',
    '      ev.initEvent("kui:all-ready", true, false);',
    '      (doc.body || doc.documentElement).dispatchEvent(ev);',
    '      return;',
    '    }',
    '    var el = doc.createElement("script");',
    '    el.src = root + files[idx++];',
    '    el.onload = next;',
    '    el.onerror = next;',
    '    (doc.head || doc.documentElement).appendChild(el);',
    '  }',
    '  next();',
    '})(typeof globalThis !== "undefined" ? globalThis : this);',
    ''
  ].join('\n');

  fs.writeFileSync(OUT, banner + '\n' + body, 'utf8');
  return {
    out: path.relative(ROOT, OUT),
    bytes: Buffer.byteLength(banner + '\n' + body, 'utf8'),
    profiles: Object.keys(payload.profiles),
    counts: Object.keys(payload.profiles).map(function (n) { return n + '=' + payload.profiles[n].files.length; }).join(', ')
  };
}

if (require.main === module) {
  var r = build();
  console.log('[build-all] 已生成 ' + r.out + ' (' + r.bytes + ' 字节)');
  console.log('[build-all] profiles: ' + r.counts);
}

module.exports = { build: build, readManifest: readManifest, ROOT: ROOT, OUT: OUT };

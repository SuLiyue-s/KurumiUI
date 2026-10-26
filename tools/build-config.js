/**
 * KurumiUI —— 配置打包工具
 * ---------------------------------------------------------------
 * 背景：浏览器通过 file:// 打开页面时，无法 XHR/fetch 本地 JSON（CORS），
 * 而本框架要求「一切内容由配置 JSON 决定」。为了兼容双击直开，
 * 本工具把 config/*.json 与 src/themes.json 打包成一份 JS 变量，
 * 由 index.html 在核心脚本之前以普通 <script> 加载：
 *
 *     config/bundle.js  ->  window.__KUI_BUNDLE__ = { app, text, themes, demos }
 *
 * http 模式下渲染器优先使用 fetch 读取原始 JSON（改完刷新即生效），
 * bundle 仅作为 file:// 与失败时的兜底。server.js 启动时会自动重建它。
 *
 * 兼容 Node 13.14：仅使用 fs / path 内置模块与 ES5 语法。
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');

function readJson(absPath) {
  var raw = fs.readFileSync(absPath, 'utf8');
  raw = raw.replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function listJson(dir) {
  var out = [];
  var names;
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    return out;
  }
  names.sort();
  for (var i = 0; i < names.length; i++) {
    var n = names[i];
    if (/\.json$/i.test(n)) out.push(n);
  }
  return out;
}

function build(options) {
  options = options || {};
  var root = options.root || ROOT;
  var silent = !!options.silent;
  var warnings = [];
  var bundle = {
    app: null,
    text: null,
    themes: null,
    demos: {},
    meta: {
      generatedAt: new Date().toISOString(),
      tool: 'tools/build-config.js'
    }
  };

  function tryRead(rel, key) {
    var abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      warnings.push('缺少配置文件: ' + rel);
      return null;
    }
    try {
      var data = readJson(abs);
      if (key) bundle[key] = data;
      return data;
    } catch (e) {
      warnings.push('配置 JSON 解析失败: ' + rel + ' -> ' + (e && e.message ? e.message : e));
      return null;
    }
  }

  tryRead('config/app.json', 'app');
  tryRead('config/text.json', 'text');
  tryRead('src/themes.json', 'themes');

  var demoDir = path.join(root, 'config', 'demos');
  var demoNames = listJson(demoDir);
  for (var i = 0; i < demoNames.length; i++) {
    var name = demoNames[i].replace(/\.json$/i, '');
    var abs = path.join(demoDir, demoNames[i]);
    try {
      bundle.demos[name] = readJson(abs);
    } catch (e) {
      warnings.push('demo JSON 解析失败: config/demos/' + demoNames[i] + ' -> ' + (e && e.message ? e.message : e));
    }
  }

  var json = JSON.stringify(bundle, null, 0);
  var banner = '/*! KurumiUI 配置包（自动生成，请勿手工编辑）\n' +
    ' * 生成时间: ' + bundle.meta.generatedAt + '\n' +
    ' * 来源: config/app.json, config/text.json, config/demos/*.json, src/themes.json\n' +
    ' * 重新生成: npm run build:config\n' +
    ' */\n';
  var content = banner + ';(function (g) {\n' +
    '  "use strict";\n' +
    '  var data = ' + json + ';\n' +
    '  g.__KUI_BUNDLE__ = data;\n' +
    '})(typeof window !== "undefined" ? window : this);\n';

  var outDir = path.join(root, 'config');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  var outFile = path.join(outDir, 'bundle.js');
  fs.writeFileSync(outFile, content, 'utf8');

  var result = {
    ok: warnings.length === 0,
    file: outFile,
    bytes: Buffer.byteLength(content, 'utf8'),
    demoCount: Object.keys(bundle.demos).length,
    hasApp: !!bundle.app,
    hasText: !!bundle.text,
    hasThemes: !!(bundle.themes && bundle.themes.themes),
    warnings: warnings
  };

  if (!silent) {
    console.log('KurumiUI 配置打包完成');
    console.log('  输出: ' + outFile);
    console.log('  大小: ' + (result.bytes / 1024).toFixed(1) + ' KB');
    console.log('  app.json   : ' + (result.hasApp ? '✔' : '✘'));
    console.log('  text.json  : ' + (result.hasText ? '✔' : '✘'));
    console.log('  themes.json: ' + (result.hasThemes ? '✔' : '✘'));
    console.log('  demos      : ' + result.demoCount + ' 个');
    if (warnings.length) {
      console.log('  警告:');
      for (var w = 0; w < warnings.length; w++) console.log('    - ' + warnings[w]);
    }
  }

  return result;
}

module.exports = {
  build: build,
  readJson: readJson,
  listJson: listJson,
  ROOT: ROOT
};

if (require.main === module) {
  try {
    var r = build({});
    if (!r.ok) process.exitCode = 0; // 缺少配置文件属于正常中间态，不阻断
  } catch (e) {
    console.error('配置打包失败: ' + (e && e.stack ? e.stack : e));
    process.exitCode = 1;
  }
}

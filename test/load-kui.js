/*!
 * KurumiUI · test/load-kui.js
 * ---------------------------------------------------------------
 * 测试辅助：在 test/dom-stub.js 提供的 vm 沙箱里加载 KUI 运行时。
 *
 * 【v1.3.5 起：清单不再手写】
 * 以前这里硬编码了 CORE_FILES / COMPONENT_FILES，源码加了模块（tooltip、diag、
 * handlers、dom-enhance、avatar…）后测试清单没跟上，导致「测试跑的代码 ≠ 线上跑的
 * 代码」——这正是审计发现的漂移点。
 *
 * 现在改为**从唯一事实来源 `config/kui-modules.json` 派生**，与线上下发的
 * `src/core/kui-all.js` 使用同一份清单，因此源码新增模块时测试自动跟上。
 *
 * 设计要点（Node 13.14 兼容，零依赖）：
 *   - 设置 window.__KUI_CONTROLS_NO_BOOT__ = true，阻止 controls/index.js 在加载时
 *     自动走 <script> 动态加载（dom-stub 不会真的 fetch/执行），改由本模块按清单串行加载；
 *   - 注入 window.__KUI_BUNDLE__（等价于 config/bundle.js），让 config.js 的
 *     file:// 兜底路径可用，不依赖 fetch；
 *   - 默认不加载 src/app/bootstrap.js（避免自动启动 app 干扰单元测试），可用 { app: true } 打开；
 *   - 缺失文件不抛错，记录到 report.missing，由调用方决定 skip / fail。
 */

'use strict';

var fs = require('fs');
var path = require('path');

var MANIFEST_REL = 'config/kui-modules.json';
var BUNDLE_REL = 'config/bundle.js';
var CONTROLS_ENTRY = 'src/components/controls/index.js';
var BOOTSTRAP_REL = 'src/app/bootstrap.js';

/* ---------------- 从模块清单派生加载列表 ---------------- */

function readJson(root, rel) {
  var raw = fs.readFileSync(path.join(root, rel), 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) { raw = raw.slice(1); }
  return JSON.parse(raw);
}

function profileFiles(root, profile) {
  var m = readJson(root, MANIFEST_REL);
  var p = (m && m.profiles && m.profiles[profile]) || null;
  if (!p || !Array.isArray(p.files)) {
    throw new Error('config/kui-modules.json 缺少 profiles.' + profile + '.files');
  }
  return p.files.filter(function (f) { return f !== BUNDLE_REL; });
}

var DEFAULT_ROOT = path.resolve(__dirname, '..');
var APP_FILES = profileFiles(DEFAULT_ROOT, 'app');

function pick(list, re) { return list.filter(function (f) { return re.test(f); }); }

var CORE_FILES = pick(APP_FILES, /^src\/core\//);
var CONTROL_FILES = pick(APP_FILES, /^src\/components\/controls\/(?!index\.js$).+\.js$/);
var COMPONENT_FILES = APP_FILES.filter(function (f) {
  if (/^src\/core\//.test(f)) { return false; }
  if (/^src\/components\/controls\//.test(f)) { return false; }
  if (f === BOOTSTRAP_REL) { return false; }
  return true;
});
var APP_ONLY_FILES = [BOOTSTRAP_REL];

/* 控件 type 的权威命名（与源码 registry 分类 category=control 一致，不含 button/link） */
var EXPECTED_CONTROL_TYPES = [
  'input', 'password', 'textarea', 'number', 'select', 'multiselect',
  'checkbox', 'checkbox-group', 'radio', 'radio-group', 'switch',
  'slider', 'rating', 'color',
  'date', 'daterange', 'month', 'time', 'datetime'
];

/* ---------------- bundle 构造（等价 tools/build-config.js） ---------------- */

function readTextFile(root, rel) {
  var raw = fs.readFileSync(path.join(root, rel), 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) { raw = raw.slice(1); }
  return raw;
}

function readJsonFile(root, rel) {
  return JSON.parse(readTextFile(root, rel));
}

function listDemos(root) {
  var dir = path.join(root, 'config', 'demos');
  var names;
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    return [];
  }
  var out = [];
  for (var i = 0; i < names.length; i++) {
    if (/\.json$/i.test(names[i])) out.push(names[i]);
  }
  out.sort();
  return out;
}

/** 构造与 tools/build-config.js 等价的 bundle 对象（不写盘、不依赖网络） */
function buildBundle(root) {
  root = root || DEFAULT_ROOT;
  var bundle = {
    app: readJsonFile(root, 'config/app.json'),
    text: readJsonFile(root, 'config/text.json'),
    themes: readJsonFile(root, 'src/themes.json'),
    demos: {},
    meta: { source: 'test/load-kui.js', generatedAt: new Date().toISOString() }
  };
  var demos = listDemos(root);
  for (var i = 0; i < demos.length; i++) {
    var name = demos[i].replace(/\.json$/i, '');
    bundle.demos[name] = readJsonFile(root, 'config/demos/' + demos[i]);
  }
  return bundle;
}

/** 把 bundle 注入沙箱（等价于加载 config/bundle.js） */
function injectBundle(env, root) {
  var bundle = buildBundle(root || env.root);
  env.window.__KUI_BUNDLE__ = bundle;
  env.window.KUI_BUNDLE = bundle;
  return bundle;
}

/* ---------------- 加载 ---------------- */

function loadList(env, report, files) {
  for (var i = 0; i < files.length; i++) {
    var rel = files[i];
    if (!env.exists(rel)) {
      report.missing.push(rel);
      continue;
    }
    try {
      env.loadScript(rel);
      report.loaded.push(rel);
    } catch (e) {
      report.errors.push({ file: rel, phase: 'load', error: e });
    }
  }
}

/** 控件子文件：以 controls/index.js 暴露的 files 为准，并保证 control-base.js 最先 */
function controlChildren(KUI) {
  var files = null;
  if (KUI && KUI.controls && Array.isArray(KUI.controls.files) && KUI.controls.files.length) {
    files = KUI.controls.files.slice();
  }
  var ordered = [];
  if (files) {
    for (var i = 0; i < files.length; i++) {
      if (files[i] === 'control-base.js') { ordered.push('src/components/controls/' + files[i]); }
    }
    if (!ordered.length) { ordered.push('src/components/controls/control-base.js'); }
    for (var j = 0; j < files.length; j++) {
      if (files[j] !== 'control-base.js') { ordered.push('src/components/controls/' + files[j]); }
    }
    return ordered;
  }
  return CONTROL_FILES.slice();
}

function registryEntries(KUI) {
  if (!KUI || !KUI.registry || typeof KUI.registry.list !== 'function') return [];
  try { return KUI.registry.list() || []; } catch (e) { return []; }
}

/* v1.3.6：category=control 的真实注册类型（用于与 EXPECTED_CONTROL_TYPES 双向比对） */
function controlTypes(KUI) {
  return registryEntries(KUI).filter(function (item) {
    return item && item.category === 'control';
  }).map(function (item) { return item.type; }).sort();
}

function registryTypes(KUI) {
  if (!KUI || !KUI.registry) return [];
  try {
    if (typeof KUI.registry.types === 'function') return KUI.registry.types().slice();
    if (typeof KUI.registry.list === 'function') {
      return KUI.registry.list().map(function (i) { return i.type; });
    }
  } catch (e) { /* ignore */ }
  return [];
}

/**
 * 在沙箱中加载 KUI。
 * @param {Object} env      test/dom-stub.js 创建的沙箱（需 exists/loadScript/window）
 * @param {Object} options  { controls:boolean, components:boolean, app:boolean, bundle:boolean,
 *                            extraFiles:string[], throwOnError:boolean }
 */
function loadKui(env, options) {
  options = options || {};
  var root = env.root || DEFAULT_ROOT;
  var report = {
    loaded: [],
    missing: [],
    errors: [],
    registryTypes: [],
    controlTypes: [],
    controlDefs: [],
    bundleInjected: false,
    files: []
  };

  /* 阻止 controls/index.js 自动 <script> 加载，由本模块显式装配 */
  try { env.window.__KUI_CONTROLS_NO_BOOT__ = true; } catch (e) { /* ignore */ }

  if (options.bundle !== false) {
    try {
      injectBundle(env, root);
      report.bundleInjected = true;
    } catch (e) {
      report.errors.push({ file: 'config/bundle', phase: 'bundle', error: e });
    }
  }

  /* 清单随 root 变化（支持在临时目录上跑），因此这里重新派生一次 */
  var appFiles = profileFiles(root, 'app');
  var core = pick(appFiles, /^src\/core\//);
  var rest = appFiles.filter(function (f) {
    if (/^src\/core\//.test(f)) { return false; }
    return true;
  });

  loadList(env, report, core);

  if (options.controls !== false) {
    loadList(env, report, [CONTROLS_ENTRY]);
    var KUI0 = env.window.KUI;
    loadList(env, report, controlChildren(KUI0));
    var KUI1 = env.window.KUI;
    if (KUI1 && KUI1.controls && typeof KUI1.controls.init === 'function') {
      try { KUI1.controls.init(); } catch (e2) {
        report.errors.push({ file: CONTROLS_ENTRY, phase: 'init', error: e2 });
      }
    }
  }

  if (options.components !== false) {
    var components = rest.filter(function (f) {
      if (f === CONTROLS_ENTRY) { return false; }
      if (/^src\/components\/controls\//.test(f)) { return false; }
      if (f === BOOTSTRAP_REL) { return false; }
      return true;
    });
    if (options.app === true) { components = components.concat(APP_ONLY_FILES); }
    loadList(env, report, components);
  }

  if (options.extraFiles && options.extraFiles.length) {
    loadList(env, report, options.extraFiles);
  }

  report.files = appFiles.slice();
  var KUI = env.window.KUI;
  report.registryTypes = registryTypes(KUI);
  report.controlTypes = controlTypes(KUI);
  if (KUI && KUI.controls && KUI.controls.defs) {
    report.controlDefs = Object.keys(KUI.controls.defs).sort();
  }

  if (options.throwOnError && report.errors.length) {
    var first = report.errors[0];
    var err = new Error('加载失败: ' + first.file + ' -> ' +
      (first.error && first.error.message ? first.error.message : first.error));
    err.report = report;
    throw err;
  }

  return report;
}

module.exports = {
  /* 从 config/kui-modules.json 派生的清单（v1.3.5 起唯一事实来源） */
  MANIFEST_REL: MANIFEST_REL,
  APP_FILES: APP_FILES,
  CORE_FILES: CORE_FILES,
  CONTROLS_ENTRY: CONTROLS_ENTRY,
  CONTROL_FILES: CONTROL_FILES,
  COMPONENT_FILES: COMPONENT_FILES,
  EXPECTED_CONTROL_TYPES: EXPECTED_CONTROL_TYPES,
  /* 工具 */
  profileFiles: profileFiles,
  buildBundle: buildBundle,
  injectBundle: injectBundle,
  loadKui: loadKui,
  listDemos: listDemos,
  readJsonFile: readJsonFile,
  readTextFile: readTextFile
};

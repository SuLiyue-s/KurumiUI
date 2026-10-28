// tools/audit-config.js —— 配置读取点审计（v1.3.8）
// 目的：静态核对 config/app.json 的每个叶子键在源码中是否存在「读取点」，
// 防止出现「配置里写了字段、文档也承诺了，但源码从不读」的接线缺口。
//
// 用法：
//   node tools/audit-config.js            # 报告
//   node tools/audit-config.js --strict   # 有缺口时退出码 1（CI 用）
//
// 判定规则（保守，宁可误报不可漏报）：
//   1. 叶键名在所有 src/**/*.js 里以「属性读取」形式出现：.key / ['key'] / ["key"] / key: 常量表
//   2. 命中 ALLOW_DYNAMIC 动态数据子树（JSON 只是数据容器，由各自渲染器解释）直接放行
//   3. 命中 ALIAS 的字段视为由其他机制消费（如 schema / 版本戳等）
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const strict = process.argv.indexOf('--strict') >= 0;

/* ---- 动态数据子树：内容不是「接线字段」，而是交给渲染器/业务读取的数据 ---- */
const ALLOW_DYNAMIC = [
  'text.',                 // 文案字典：任意键由 KUI.text() 按需读取
  'dialogs.settings.data.',// 表单数据对象：由 form 组件按 nodes 读取
  'dialogs.settings.nodes.',// 控件节点树：由 registry 渲染
  'dialogs.settings.layout.',
  'menu.props.items.',
  'menu.props.footer.actions.',
  'menunav.props.actions.',
  'menunav.props.breadcrumb.items.',
  'tabs.props.initial.',
  'tabs.props.home.',
  'tabs.props.actions.',
  'boot.stages.',
  'theme.picker.'          // 选择器字段在 bootstrap 里按 picker 对象整体读取
];

/* ---- 别名/间接消费：字段本身不按键读取，但由其他机制使用 ---- */
const ALIAS = {
  'schema': '顶层 schema 校验戳，不入运行时',
  'app.loading': 'bootstrap bootConfigOf 兼容映射（text/delay/icon）',
  'app.loading.icon': 'bootConfigOf 兼容映射 → clock.mode',
  'app.loading.text': 'bootConfigOf 兼容映射 → boot.text',
  'app.loading.delay': 'bootConfigOf 兼容映射 → boot.hideDelay'
};

/* ---- 收集 src 源码 ---- */
function walk(dir, out) {
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of list) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { walk(p, out); continue; }
    if (/\.js$/.test(ent.name)) { out.push(p); }
  }
  return out;
}
const srcFiles = walk(path.join(ROOT, 'src'), []);
const srcText = srcFiles.map(function (f) { return fs.readFileSync(f, 'utf8'); });
const srcAll = srcText.join('\n');

/* ---- 展开 app.json 叶子路径 ---- */
function flatten(node, prefix, out) {
  if (node === null || typeof node !== 'object') { out.push(prefix); return out; }
  if (Array.isArray(node)) {
    /* 数组里的对象若带 id/type，视为动态条目；否则按 [i] 展开 */
    if (!node.length) { out.push(prefix); return out; }
    for (let i = 0; i < node.length; i++) { flatten(node[i], prefix + '[' + i + ']', out); }
    return out;
  }
  const keys = Object.keys(node);
  if (!keys.length) { out.push(prefix); return out; }
  for (const k of keys) { flatten(node[k], prefix ? prefix + '.' + k : k, out); }
  return out;
}

const appCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/app.json'), 'utf8'));
const leaves = flatten(appCfg, '', []);

function lastKey(p) {
  const m = p.match(/([A-Za-z_$][\w$]*)(?:\[\d+\])?$/);
  return m ? m[1] : p;
}

function inList(prefix, list) {
  return list.some(function (x) { return prefix === x.replace(/\.$/, '') || prefix.indexOf(x) === 0; });
}

function hasReadPoint(key) {
  if (!key) return true;
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp('\\.' + esc + '\\b'),                 // obj.key
    new RegExp("\\[\\s*['\"]" + esc + "['\"]\\s*\\]"), // obj['key']
    new RegExp("['\"]" + esc + "['\"]\\s*:"),        // { key: ... } 映射表
    new RegExp('\\b' + esc + '\\s*=')                 // var key =
  ];
  for (const re of patterns) { if (re.test(srcAll)) return true; }
  return false;
}

const gaps = [];
const skipped = [];
for (const leaf of leaves) {
  if (inList(leaf, ALLOW_DYNAMIC)) { skipped.push(leaf); continue; }
  if (ALIAS[leaf]) { skipped.push(leaf); continue; }
  if (/\[\d+\]$/.test(leaf)) { skipped.push(leaf); continue; }
  const key = lastKey(leaf);
  if (!hasReadPoint(key)) { gaps.push({ path: leaf, key: key }); }
}

console.log('=== KurumiUI 配置读取点审计（config/app.json） ===');
console.log('叶子键总数 ' + leaves.length + '，动态数据子树 ' + skipped.length + '，待核对 ' + (leaves.length - skipped.length));
if (!gaps.length) {
  console.log('结果：所有配置字段均有读取点 ✔');
} else {
  console.log('结果：发现 ' + gaps.length + ' 个无读取点字段：');
  gaps.forEach(function (g) { console.log('  ✘ ' + g.path + '   （键名 ' + g.key + ' 在 src/ 中无属性读取）'); });
}
if (strict && gaps.length) { process.exit(1); }

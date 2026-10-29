/*!
 * KurumiUI · control · datatable.js
 * 数据表格（可拆卸 / 配置驱动 / 一体化工具栏）
 * ---------------------------------------------------------------
 * 契约：docs/00-contract.md §22「数据表格组件（datatable，v1.4.0）」
 * 注册：type = datatable，category = control
 * 实例 API：KUI.datatable（create / get + 全部实例方法代理）
 *
 * 能力（全部由 JSON 配置驱动，无需写代码）：
 *   1. 一体化工具栏：标题 / 副标题 / 全局搜索 / 列筛选 / 自定义动作按钮 /
 *      列显隐 / 行密度 / 刷新 / 导出 CSV / 已选数量；
 *   2. 筛选：全局关键字 + 每列筛选（text 包含 / select 等值 / range 数值区间），
 *      可配置是否启用、筛选字段与占位文案；
 *   3. 选择：单选行（radio）/ 复选行（checkbox）/ 全选（表头，支持跨页保持），
 *      行点击可选（selectOnRowClick），已选数量提示；
 *   4. 排序：列级 sortable，单列/多列（shift 点击），三种状态循环 asc→desc→none，
 *      默认排序 sort.default；
 *   5. 分页：每页条数切换、总条数、页码、跳页，全部客户端计算；
 *   6. 行高亮：点击行高亮（is-active），键盘 ↑↓ 移动、空格选择、Enter 触发行动作；
 *   7. 列格式：text / number / date / boolean / tags / badge / dict / link /
 *      progress / code / ellipsis，以及行内动作列（type:'actions'）与序号列；
 *   8. 事件：row:click / selection:change / sort:change / filter:change /
 *      page:change / refresh / action；
 *   9. 拆装：不加载本文件时 datatable 显示「未知类型」占位，其余组件不受影响；
 *      也可在任意页面单独挂载（KUI.datatable.create(host, props)）。
 *
 * 事件与动作：JSON 用 props.on.<event>（{ fn, args } 动作规格）或 props.rowClickAction。
 */
(function (KUI) {
  'use strict';

  if (!KUI) { KUI = window.KUI = window.KUI || {}; }

  var hasOwn = Object.prototype.hasOwnProperty;
  var slice = Array.prototype.slice;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* ================= 防御式工具（core 缺失时仍可用） ================= */

  function safe(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
  }

  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function isArr(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function isStr(v) { return typeof v === 'string'; }
  function isNum(v) { return typeof v === 'number' && !isNaN(v); }
  function isFn(v) { return typeof v === 'function'; }
  function str(v) { return v === undefined || v === null ? '' : String(v); }
  function num(v, d) {
    var n = parseFloat(v);
    return isNum(n) ? n : (d === undefined ? 0 : d);
  }

  function deepMerge(base, patch) {
    var out = {}, key;
    for (key in base) { if (hasOwn.call(base, key)) { out[key] = base[key]; } }
    if (patch) {
      for (key in patch) {
        if (!hasOwn.call(patch, key)) { continue; }
        var pv = patch[key], bv = out[key];
        if (isObj(pv) && isObj(bv)) { out[key] = deepMerge(bv, pv); }
        else { out[key] = pv; }
      }
    }
    return out;
  }

  function txt(key, fallback, vars) {
    var value = safe(function () { return KUI.text(key, fallback, vars); }, fallback);
    if (value === undefined || value === null || value === '') { return fallback; }
    return value;
  }

  function tpl(text, vars) {
    return String(text).replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, function (m, k) {
      return vars && vars[k] !== undefined ? String(vars[k]) : m;
    });
  }

  function el(tag, cls, text) {
    var box = document.createElement(tag);
    if (cls) { box.className = cls; }
    /* 兼容第三参写法：el('span', 'cls', '文本') —— 37 处调用依赖（表头/单元格/分页/工具栏） */
    if (text !== undefined && text !== null && text !== '') {
      box.appendChild(document.createTextNode(String(text)));
    }
    return box;
  }


  /* 主题化下拉（v1.4.2）：优先 KUI.dropdown；内核缺失时回退原生 select，保证可拆卸 */
  function themedSelect(btnCls, items, value, ariaLabel, onChange) {
    if (KUI.dropdown) {
      var btn = el('button', btnCls);
      btn.type = 'button';
      btn.setAttribute('aria-label', ariaLabel || '');
      var dd = KUI.dropdown(btn, items, {
        value: value,
        ariaLabel: ariaLabel || '',
        onSelect: function (v) { onChange(v); }
      });
      on(btn, 'click', function (ev) {
        if (ev && ev.preventDefault) { ev.preventDefault(); }
        if (ev && ev.stopPropagation) { ev.stopPropagation(); }
        if (dd) { dd.toggle(); }
      });
      return btn;
    }
    var sel = el('select', btnCls);
    sel.setAttribute('aria-label', ariaLabel || '');
    for (var i = 0; i < items.length; i++) {
      var o = el('option', '', items[i].label);
      o.value = String(items[i].value);
      if (String(items[i].value) === String(value)) { o.selected = true; }
      sel.appendChild(o);
    }
    on(sel, 'change', function () { onChange(sel.value); });
    return sel;
  }

  function addClass(node, cls) {
    if (!node || !cls) { return node; }
    var list = String(cls).split(/\s+/);
    for (var i = 0; i < list.length; i++) {
      if (!list[i]) { continue; }
      if (node.classList) { node.classList.add(list[i]); }
      else if (node.className.indexOf(list[i]) === -1) { node.className += ' ' + list[i]; }
    }
    return node;
  }

  function toggleClass(node, cls, on) {
    if (!node || !cls) { return node; }
    if (node.classList) {
      if (on) { node.classList.add(cls); } else { node.classList.remove(cls); }
    }
    return node;
  }

  function clearNode(node) {
    if (!node) { return; }
    while (node.firstChild) { node.removeChild(node.firstChild); }
  }

  function on(node, type, fn) {
    if (!node || !type || !isFn(fn)) { return node; }
    if (node.addEventListener) { node.addEventListener(type, fn); }
    return node;
  }

  function iconEl(name, cls, size) {
    var node = safe(function () {
      return (KUI.icons && isFn(KUI.icons.create)) ? KUI.icons.create(name, { size: size || 14, 'class': cls || 'kui-icon' }) : null;
    }, null);
    if (node) { return node; }
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', cls || 'kui-icon');
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#kui-icon-' + String(name || '').replace(/[^A-Za-z0-9_-]/g, ''));
    svg.appendChild(use);
    return svg;
  }

  function deepGet(obj, path) {
    if (!obj) { return undefined; }
    if (path === undefined || path === null || path === '') { return obj; }
    if (!isStr(path)) { return undefined; }
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) { return undefined; }
      cur = cur[parts[i]];
    }
    return cur;
  }

  function keyOf(row, rowKey) {
    if (row === null || row === undefined) { return ''; }
    if (rowKey && isObj(row) && row[rowKey] !== undefined) { return String(row[rowKey]); }
    return String(row);
  }

  function displayText(v) {
    if (v === null || v === undefined) { return ''; }
    if (isArr(v)) { return v.map(displayText).join('、'); }
    if (isObj(v)) { return safe(function () { return JSON.stringify(v); }, ''); }
    return String(v);
  }

  /* ================= 默认配置 ================= */

  var DEFAULTS = {
    columns: [],
    data: [],
    rows: [],
    rowKey: 'id',
    size: 'md',                 // sm | md | lg
    bordered: false,
    striped: true,
    hoverable: true,
    compact: false,
    height: 0,                  // 固定表体高度（滚动 + 表头吸附），0 = 自动
    maxHeight: 0,
    emptyText: '',
    loading: false,
    showIndex: false,           // 序号列
    search: { enabled: true, placeholder: '', width: 240, keys: [] },
    filter: { enabled: true, columns: true, clearable: true },
    sort: { enabled: true, mode: 'single', default: [] },
    selection: {
      mode: 'none',             // none | single | multi
      showSelectAll: true,
      selectOnRowClick: true,
      keepAcrossPages: true,
      selectAllScope: 'page'    // page | all
    },
    pagination: {
      enabled: true,
      pageSize: 10,
      pageSizes: [10, 20, 50, 100],
      showTotal: true,
      showSizer: true,
      showJumper: true,
      maxButtons: 7
    },
    rowHighlight: true,
    rowClickAction: null,
    toolbar: { enabled: true, title: '', subtitle: '', actions: [], actionsAlign: 'right' },
    columnsToggle: true,
    densityToggle: true,
    refresh: false,
    export: false,
    exportFileName: 'datatable.csv',
    selectionInfo: true,
    keyboard: true,
    text: {},                   // 文案覆盖：{ empty, loading, selected, ... }
    on: {}
  };

  var COLUMN_DEFAULTS = {
    key: '',
    title: '',
    width: '',
    minWidth: '',
    align: '',
    sortable: false,
    filter: null,               // { type:'text'|'select'|'range', options, placeholder }
    format: 'text',
    formatOptions: {},
    dict: null,                 // { value: label }
    hidden: false,
    headerTip: '',
    className: ''
  };

  /* ================= 列归一化 ================= */

  function normColumn(raw, index) {
    if (isStr(raw) || isNum(raw)) {
      return deepMerge(COLUMN_DEFAULTS, { key: str(raw), title: str(raw) });
    }
    if (!isObj(raw)) {
      return deepMerge(COLUMN_DEFAULTS, { key: '__col' + index, title: '' });
    }
    var key = raw.key !== undefined ? raw.key : (raw.prop !== undefined ? raw.prop : raw.dataIndex);
    var title = raw.title !== undefined ? raw.title : (raw.label !== undefined ? raw.label : key);
    var col = deepMerge(COLUMN_DEFAULTS, raw);
    col.key = key === undefined || key === null ? '__col' + index : key;
    col.title = title === undefined || title === null ? '' : str(title);
    if (raw.type) { col.type = raw.type; }
    if (col.filter !== false && col.filter !== null) {
      if (col.filter === true) { col.filter = { type: 'text' }; }
      if (isStr(col.filter)) { col.filter = { type: col.filter }; }
      if (isObj(col.filter) && !col.filter.type) { col.filter.type = 'text'; }
    } else {
      col.filter = null;
    }
    if (col.sortable === undefined) { col.sortable = false; }
    return col;
  }

  function normColumns(list) {
    var out = [];
    var src = isArr(list) ? list : [];
    for (var i = 0; i < src.length; i++) {
      out.push(normColumn(src[i], i));
    }
    return out;
  }

  /* ================= 取值与格式化 ================= */

  function cellValue(row, col) {
    if (row === null || row === undefined) { return ''; }
    if (col.key === undefined || col.key === null || col.key === '') { return ''; }
    var v = deepGet(row, col.key);
    return v === undefined ? '' : v;
  }

  function fmtNumber(v, opts) {
    var n = num(v, NaN);
    if (isNaN(n)) { return displayText(v); }
    var digits = opts && opts.digits !== undefined ? Math.max(0, Math.min(10, num(opts.digits, 0))) : 0;
    var fixed = n.toFixed(digits);
    var parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, opts && opts.thousandSeparator ? opts.thousandSeparator : ',');
    var out = parts.join('.');
    if (opts && opts.prefix) { out = opts.prefix + out; }
    if (opts && opts.suffix) { out = out + opts.suffix; }
    return out;
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function fmtDate(v, opts) {
    var d = null;
    if (Object.prototype.toString.call(v) === '[object Date]') { d = v; }
    else if (isNum(v) || /^\d+$/.test(str(v))) { d = new Date(num(v, 0)); }
    else if (isStr(v)) { d = new Date(v.replace(/-/g, '/')); }
    if (!d || isNaN(d.getTime())) { return displayText(v); }
    var pattern = (opts && opts.pattern) || 'YYYY-MM-DD HH:mm';
    return pattern
      .replace(/YYYY/g, d.getFullYear())
      .replace(/MM/g, pad2(d.getMonth() + 1))
      .replace(/DD/g, pad2(d.getDate()))
      .replace(/HH/g, pad2(d.getHours()))
      .replace(/mm/g, pad2(d.getMinutes()))
      .replace(/ss/g, pad2(d.getSeconds()));
  }

  function buildCell(row, col, index) {
    var td = el('td', 'kui-datatable__td');
    if (col.align) { addClass(td, 'is-' + col.align); }
    if (col.className) { addClass(td, col.className); }
    if (col.type === 'actions') { return buildActionsCell(td, row, col, index); }
    var v = cellValue(row, col);
    var fmt = col.format || 'text';
    var opts = col.formatOptions || {};

    if (fmt === 'dict' || col.dict) {
      var dictVal = v;
      var label = col.dict && col.dict[String(dictVal)] !== undefined ? col.dict[String(dictVal)] : v;
      if (isObj(label)) { label = label.label !== undefined ? label.label : label.text; }
      var dictText = el('span', 'kui-datatable__text', displayText(label));
      td.appendChild(dictText);
      applyDictBadge(td, col, v);
      return td;
    }
    if (fmt === 'number') {
      td.appendChild(el('span', 'kui-datatable__num', fmtNumber(v, opts)));
      return td;
    }
    if (fmt === 'date') {
      td.appendChild(el('span', 'kui-datatable__date', fmtDate(v, opts)));
      return td;
    }
    if (fmt === 'boolean') {
      var truthy = v === true || v === 1 || v === '1' || v === 'true' || v === '是';
      var mark = el('span', 'kui-datatable__bool ' + (truthy ? 'is-true' : 'is-false'));
      mark.appendChild(iconEl(truthy ? 'success' : 'close', 'kui-datatable__bool-icon', 13));
      mark.appendChild(el('span', '', (truthy ? (opts.trueText || '是') : (opts.falseText || '否'))));
      td.appendChild(mark);
      return td;
    }
    if (fmt === 'tags') {
      var list = isArr(v) ? v : (v === '' || v === null || v === undefined ? [] : String(v).split(/[,，\s]+/));
      var wrap = el('span', 'kui-datatable__tags');
      for (var t = 0; t < list.length; t++) {
        if (list[t] === '') { continue; }
        var tag = el('span', 'kui-tag kui-tag--sm', displayText(list[t]));
        wrap.appendChild(tag);
      }
      if (!list.length) { wrap.appendChild(el('span', 'kui-datatable__muted', opts.empty || '—')); }
      td.appendChild(wrap);
      return td;
    }
    if (fmt === 'badge') {
      var badge = el('span', 'kui-datatable__badge');
      var dot = el('span', 'kui-datatable__badge-dot');
      var color = null;
      if (opts.colors && opts.colors[String(v)]) { color = opts.colors[String(v)]; }
      if (color) { dot.style.background = color; }
      badge.appendChild(dot);
      badge.appendChild(el('span', 'kui-datatable__badge-text', displayText(v)));
      td.appendChild(badge);
      return td;
    }
    if (fmt === 'link') {
      var href = opts.hrefField ? deepGet(row, opts.hrefField) : v;
      var a = el('a', 'kui-datatable__link', displayText(opts.text !== undefined ? opts.text : v));
      a.setAttribute('href', str(href || 'javascript:;'));
      if (opts.target) { a.setAttribute('target', opts.target); }
      if (opts.target === '_blank') { a.setAttribute('rel', 'noopener'); }
      td.appendChild(a);
      return td;
    }
    if (fmt === 'progress') {
      var p = Math.max(0, Math.min(100, num(v, 0)));
      var bar = el('span', 'kui-datatable__progress');
      var fill = el('span', 'kui-datatable__progress-bar');
      fill.style.width = p + '%';
      bar.appendChild(fill);
      bar.appendChild(el('span', 'kui-datatable__progress-text', Math.round(p) + '%'));
      td.appendChild(bar);
      return td;
    }
    if (fmt === 'code') {
      td.appendChild(el('code', 'kui-datatable__code', displayText(v)));
      return td;
    }
    if (fmt === 'ellipsis') {
      var span = el('span', 'kui-datatable__ellipsis', displayText(v));
      span.setAttribute('title', displayText(v));
      td.appendChild(span);
      return td;
    }
    td.appendChild(el('span', 'kui-datatable__text', displayText(v)));
    return td;
  }

  function applyDictBadge(td, col, value) {
    if (!col.dict) { return; }
    var meta = col.dict[String(value)];
    if (!isObj(meta)) { return; }
    if (meta.color) {
      var dot = el('span', 'kui-datatable__badge-dot');
      dot.style.background = meta.color;
      td.insertBefore(dot, td.firstChild);
      addClass(td, 'has-dict-dot');
    }
  }

  function buildActionsCell(td, row, col, index) {
    var wrap = el('span', 'kui-datatable__row-actions');
    var buttons = isArr(col.buttons) ? col.buttons : [];
    for (var i = 0; i < buttons.length; i++) {
      (function (spec) {
        if (!isObj(spec)) { return; }
        var btn = el('button', 'kui-datatable__cell-btn' + (spec.variant ? ' is-' + spec.variant : ''));
        btn.setAttribute('type', 'button');
        if (spec.icon) { btn.appendChild(iconEl(spec.icon, 'kui-datatable__cell-icon', 13)); }
        btn.appendChild(el('span', '', str(spec.label || spec.text || '操作')));
        if (spec.title) { btn.setAttribute('title', str(spec.title)); }
        on(btn, 'click', function (ev) {
          if (ev && ev.stopPropagation) { ev.stopPropagation(); }
          fireRowAction(spec, row, index, btn);
        });
        wrap.appendChild(btn);
      })(buttons[i]);
    }
    if (!wrap.firstChild) { wrap.appendChild(el('span', 'kui-datatable__muted', '—')); }
    td.appendChild(wrap);
    return td;
  }

  /* ================= 值比较 / 排序 / 筛选 ================= */

  function compareValues(a, b) {
    if (a === b) { return 0; }
    if (a === null || a === undefined || a === '') { return 1; }
    if (b === null || b === undefined || b === '') { return -1; }
    if (isNum(a) && isNum(b)) { return a - b; }
    var na = Number(a), nb = Number(b);
    if (a !== '' && b !== '' && !isNaN(na) && !isNaN(nb)) { return na - nb; }
    var sa = displayText(a).toLowerCase(), sb = displayText(b).toLowerCase();
    if (sa === sb) { return 0; }
    return sa < sb ? -1 : 1;
  }

  function sortRows(rows, columns, sorts) {
    if (!sorts || !sorts.length) { return rows.slice(); }
    var colMap = {};
    for (var c = 0; c < columns.length; c++) { colMap[columns[c].key] = columns[c]; }
    var copy = rows.slice();
    copy.sort(function (ra, rb) {
      for (var i = 0; i < sorts.length; i++) {
        var s = sorts[i];
        var col = colMap[s.key];
        if (!col) { continue; }
        var va = cellValue(ra, col), vb = cellValue(rb, col);
        var cmp = compareValues(va, vb);
        if (cmp !== 0) { return s.order === 'desc' ? -cmp : cmp; }
      }
      return 0;
    });
    return copy;
  }

  function normFilterValue(v) {
    if (v === null || v === undefined) { return ''; }
    return String(v).trim();
  }

  function filterRows(rows, columns, keyword, colFilters, searchKeys) {
    var kw = String(keyword || '').trim().toLowerCase();
    var activeCols = [];
    for (var c = 0; c < columns.length; c++) {
      var f = colFilters[columns[c].key];
      if (!f) { continue; }
      if (f.type === 'range') {
        if (f.min !== '' || f.max !== '') { activeCols.push(columns[c]); }
      } else if (normFilterValue(f.value) !== '') {
        activeCols.push(columns[c]);
      }
    }
    if (!kw && !activeCols.length) { return rows.slice(); }
    var keys = isArr(searchKeys) && searchKeys.length ? searchKeys : null;
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var matched = true;
      if (kw) {
        var hay = '';
        if (keys) {
          for (var k = 0; k < keys.length; k++) { hay += ' ' + displayText(cellValue(row, { key: keys[k] })); }
        } else {
          for (var c2 = 0; c2 < columns.length; c2++) {
            if (columns[c2].type === 'actions') { continue; }
            hay += ' ' + displayText(cellValue(row, columns[c2]));
          }
        }
        if (hay.toLowerCase().indexOf(kw) === -1) { matched = false; }
      }
      if (matched) {
        for (var j = 0; j < activeCols.length; j++) {
          var col = activeCols[j];
          var fv = colFilters[col.key];
          var v = cellValue(row, col);
          if (fv.type === 'range') {
            var n = num(v, NaN);
            if (isNaN(n)) { matched = false; break; }
            if (fv.min !== '' && n < num(fv.min, -Infinity)) { matched = false; break; }
            if (fv.max !== '' && n > num(fv.max, Infinity)) { matched = false; break; }
          } else if (fv.type === 'select') {
            if (displayText(v) !== String(fv.value)) { matched = false; break; }
          } else {
            if (displayText(v).toLowerCase().indexOf(normFilterValue(fv.value).toLowerCase()) === -1) {
              matched = false; break;
            }
          }
        }
      }
      if (matched) { out.push(row); }
    }
    return out;
  }

  /* ================= 实例 ================= */

  function createDatatable(host, rawProps, ctx, node) {
    var props = rawProps && rawProps.__resolved ? rawProps : deepMerge(DEFAULTS, rawProps || {});
    /* 深合并多个嵌套对象，保证 JSON 只写想改的字段 */
    props.columns = rawProps && rawProps.columns ? rawProps.columns : (props.columns || []);
    props.data = isArr(rawProps && rawProps.data) ? rawProps.data
      : (isArr(rawProps && rawProps.rows) ? rawProps.rows
        : (isArr(props.data) && props.data.length ? props.data : (isArr(props.rows) ? props.rows : [])));

    var handlers = {};
    var state = {
      raw: props.data.slice(),
      columns: normColumns(props.columns),
      keyword: '',
      colFilters: {},
      sort: isArr(props.sort && props.sort.default) ? props.sort.default.slice() : [],
      page: 1,
      pageSize: Math.max(1, num(props.pagination && props.pagination.pageSize, 10) || 10),
      selected: {},          // rowKey -> true
      activeKey: '',         // 行高亮
      hiddenCols: {},
      density: props.compact ? 'compact' : (props.size === 'sm' ? 'compact' : 'default'),
      loading: !!props.loading,
      destroyed: false,
      filtersOpen: false
    };
    var filteredRows = [];
    var pageRows = [];
    var api;

    /* ---------- 构建骨架 ---------- */
    var root = el('div', 'kui-datatable');
    root.setAttribute('role', 'table');
    var toolbarEl = null;
    var searchInput = null;
    var filterBar = null;
    var filterCountEl = null;
    var selectionInfoEl = null;
    var scrollEl = el('div', 'kui-datatable__scroll');
    var tableEl = el('table', 'kui-datatable__table');
    var thead = el('thead', 'kui-datatable__head');
    var headRow = el('tr', 'kui-datatable__head-row');
    var tbody = el('tbody', 'kui-datatable__body');
    var rowItemEls = {};      /* key -> tr（v1.4.2：选择联动） */
    var rowInputRefs = {};    /* key -> { input, wrap } */
    var headSelectRef = null; /* { input, wrap } */
    var colMenuEl = null;
    var loadingEl = el('div', 'kui-datatable__loading');
    var footerEl = el('div', 'kui-datatable__footer');

    thead.appendChild(headRow);
    tableEl.appendChild(thead);
    tableEl.appendChild(tbody);
    scrollEl.appendChild(tableEl);
    loadingEl.appendChild(iconEl('refresh', 'kui-datatable__spinner', 16));
    loadingEl.appendChild(el('span', 'kui-datatable__loading-text', text('loading', '加载中…')));
    if (props.toolbar && props.toolbar.enabled !== false) {
      toolbarEl = buildToolbar();
      root.appendChild(toolbarEl);
    }
    if (props.filter && props.filter.enabled !== false) {
      filterBar = buildFilterBar();
      root.appendChild(filterBar);
    }
    root.appendChild(scrollEl);
    root.appendChild(loadingEl);
    root.appendChild(footerEl);
    applyRootClasses();

    function text(key, fallback, vars) {
      var custom = props.text && props.text[key];
      var out = custom !== undefined && custom !== null ? custom : txt('datatable.' + key, fallback, vars);
      return tpl(out, vars);
    }

    function applyRootClasses() {
      toggleClass(root, 'kui-datatable--sm', props.size === 'sm' || state.density === 'compact');
      toggleClass(root, 'kui-datatable--lg', props.size === 'lg');
      toggleClass(root, 'is-bordered', !!props.bordered);
      toggleClass(root, 'is-striped', !!props.striped);
      toggleClass(root, 'is-hoverable', !!props.hoverable);
      toggleClass(root, 'is-compact', state.density === 'compact');
      toggleClass(root, 'is-loading', !!state.loading);
      var h = num(props.height, 0) || num(props.maxHeight, 0);
      scrollEl.style.maxHeight = h > 0 ? h + 'px' : '';
    }

    /* ---------- 工具栏 ---------- */
    function buildToolbar() {
      var bar = el('div', 'kui-datatable__toolbar');
      var left = el('div', 'kui-datatable__toolbar-left');
      var cfg = props.toolbar || {};
      if (cfg.title) { left.appendChild(el('strong', 'kui-datatable__title', str(cfg.title))); }
      if (cfg.subtitle) { left.appendChild(el('span', 'kui-datatable__subtitle', str(cfg.subtitle))); }
      if (props.search && props.search.enabled !== false) {
        var searchWrap = el('div', 'kui-datatable__search');
        searchWrap.appendChild(iconEl('search', 'kui-datatable__search-icon', 14));
        searchInput = el('input', 'kui-datatable__search-input');
        searchInput.setAttribute('type', 'search');
        searchInput.setAttribute('placeholder', str((props.search && props.search.placeholder) || text('searchPlaceholder', '搜索…')));
        if (props.search && props.search.width) { searchWrap.style.width = num(props.search.width, 240) + 'px'; }
        on(searchInput, 'input', function () {
          state.keyword = searchInput.value;
          state.page = 1;
          render();
          fire('filter', { keyword: state.keyword, columns: state.colFilters, reason: 'keyword' });
        });
        searchWrap.appendChild(searchInput);
        left.appendChild(searchWrap);
      }
      if (selectionInfoEl === null) {
        selectionInfoEl = el('span', 'kui-datatable__selected-info');
        selectionInfoEl.style.display = 'none';
        left.appendChild(selectionInfoEl);
      }
      bar.appendChild(left);

      var right = el('div', 'kui-datatable__toolbar-right');
      var actions = isArr(cfg.actions) ? cfg.actions : [];
      for (var i = 0; i < actions.length; i++) {
        (function (spec) {
          if (!isObj(spec)) { return; }
          var btn = el('button', 'kui-datatable__tool-btn' + (spec.variant ? ' is-' + spec.variant : ''));
          btn.setAttribute('type', 'button');
          if (spec.icon) { btn.appendChild(iconEl(spec.icon, 'kui-datatable__tool-icon', 14)); }
          if (spec.label) { btn.appendChild(el('span', '', str(spec.label))); }
          if (spec.title) { btn.setAttribute('title', str(spec.title)); }
          on(btn, 'click', function (ev) {
            fire('action', { action: spec, button: btn, event: ev });
            runAction(spec.action || spec, { action: spec.id || null, button: spec });
          });
          right.appendChild(btn);
        })(actions[i]);
      }
      if (props.refresh) {
        var refreshBtn = iconButton('refresh', text('refresh', '刷新'), function () {
          render();
          fire('refresh', {});
          runAction(props.refreshAction || null, {});
        });
        right.appendChild(refreshBtn);
      }
      if (props.columnsToggle) {
        var colBtn = iconButton('eye', text('columns', '列设置'), function () { toggleColumnMenu(colBtn); });
        colBtn.setAttribute('data-role', 'columns-toggle');
        right.appendChild(colBtn);
      }
      if (props.densityToggle) {
        var densBtn = iconButton('expand', text('density', '行密度'), function () {
          state.density = state.density === 'compact' ? 'default' : 'compact';
          applyRootClasses();
          render();
          fire('action', { action: 'density', density: state.density });
        });
        right.appendChild(densBtn);
      }
      if (props.export) {
        right.appendChild(iconButton('arrow-down', text('export', '导出 CSV'), exportCsv));
      }
      bar.appendChild(right);
      return bar;
    }

    function iconButton(icon, label, fn) {
      var btn = el('button', 'kui-datatable__tool-btn');
      btn.setAttribute('type', 'button');
      btn.appendChild(iconEl(icon, 'kui-datatable__tool-icon', 14));
      btn.appendChild(el('span', '', label));
      on(btn, 'click', fn);
      return btn;
    }

    function toggleColumnMenu(anchor) {
      if (colMenuEl && colMenuEl.parentNode) {
        colMenuEl.parentNode.removeChild(colMenuEl);
        colMenuEl = null;
        return;
      }
      colMenuEl = el('div', 'kui-datatable__col-menu');
      var title = el('div', 'kui-datatable__col-menu-title', text('columns', '列设置'));
      colMenuEl.appendChild(title);
      for (var i = 0; i < state.columns.length; i++) {
        (function (col) {
          if (col.type === 'actions') { return; }
          var row = el('label', 'kui-datatable__col-menu-item kui-checkbox');
          var box = el('input', 'kui-checkbox__input kui-datatable__col-menu-input');
          box.setAttribute('type', 'checkbox');
          box.checked = !state.hiddenCols[col.key];
          var vis = el('span', 'kui-checkbox__box');
          vis.appendChild(iconEl('check', 'kui-checkbox__tick', 12));
          if (box.checked) { addClass(row, 'is-checked'); }
          on(box, 'change', function () {
            toggleClass(row, 'is-checked', box.checked);
            if (box.checked) { delete state.hiddenCols[col.key]; }
            else { state.hiddenCols[col.key] = true; }
            render();
          });
          row.appendChild(box);
          row.appendChild(vis);
          row.appendChild(el('span', '', col.title || col.key));
          colMenuEl.appendChild(row);
        })(state.columns[i]);
      }
      root.appendChild(colMenuEl);
      var closer = function (ev) {
        if (colMenuEl && ev && ev.target && colMenuEl.contains && colMenuEl.contains(ev.target)) { return; }
        if (anchor && ev && ev.target === anchor) { return; }
        document.removeEventListener('click', closer, true);
        if (colMenuEl && colMenuEl.parentNode) { colMenuEl.parentNode.removeChild(colMenuEl); }
        colMenuEl = null;
      };
      setTimeout(function () { document.addEventListener('click', closer, true); }, 0);
    }

    /* ---------- 筛选栏 ---------- */
    function buildFilterBar() {
      var bar = el('div', 'kui-datatable__filters');
      var label = el('span', 'kui-datatable__filters-label');
      label.appendChild(iconEl('search', 'kui-datatable__filters-icon', 13));
      label.appendChild(el('span', '', text('filter', '筛选')));
      bar.appendChild(label);
      if (props.filter && props.filter.columns !== false) {
        for (var i = 0; i < state.columns.length; i++) {
          (function (col) {
            if (!col.filter || col.type === 'actions' || state.hiddenCols[col.key]) { return; }
            var field = el('span', 'kui-datatable__filter');
            field.appendChild(el('span', 'kui-datatable__filter-label', (col.title || col.key)));
            var type = col.filter.type || 'text';
            var fstate = state.colFilters[col.key] || null;
            if (type === 'select') {
              var selItems = [{ value: '', label: text('filterAll', '全部') }];
              var opts = isArr(col.filter.options) ? col.filter.options : [];
              var seen = {};
              for (var o = 0; o < opts.length; o++) {
                var op = isObj(opts[o]) ? opts[o] : { value: opts[o], label: opts[o] };
                var oval = str(op.value);
                if (seen[oval]) { continue; }
                seen[oval] = true;
                selItems.push({ value: oval, label: displayText(op.label !== undefined ? op.label : op.value) });
              }
              if (col.dict) {
                for (var dk in col.dict) {
                  if (!hasOwn.call(col.dict, dk) || seen[dk]) { continue; }
                  seen[dk] = true;
                  var dmeta = col.dict[dk];
                  var dlabel = isObj(dmeta) ? (dmeta.label !== undefined ? dmeta.label : dmeta.text) : dmeta;
                  selItems.push({ value: String(dk), label: displayText(dlabel) });
                }
              }
              var selValue = fstate && fstate.value !== undefined ? String(fstate.value) : '';
              field.appendChild(themedSelect('kui-datatable__filter-select', selItems, selValue, (col.title || col.key), function (v) {
                if (v === '') { delete state.colFilters[col.key]; }
                else { state.colFilters[col.key] = { type: 'select', value: v }; }
                state.page = 1;
                render();
                fire('filter', { keyword: state.keyword, columns: state.colFilters, reason: 'column' });
              }));
            } else if (type === 'range') {
              var rw = el('span', 'kui-datatable__filter-range');
              var minIn = el('input', 'kui-datatable__filter-input kui-datatable__filter-input--num');
              minIn.setAttribute('type', 'text');
              minIn.setAttribute('inputmode', 'decimal');
              minIn.setAttribute('placeholder', (col.filter.placeholderMin || '最小'));
              var maxIn = el('input', 'kui-datatable__filter-input kui-datatable__filter-input--num');
              maxIn.setAttribute('type', 'text');
              maxIn.setAttribute('inputmode', 'decimal');
              maxIn.setAttribute('placeholder', (col.filter.placeholderMax || '最大'));
              if (fstate) {
                minIn.value = fstate.min !== undefined ? fstate.min : '';
                maxIn.value = fstate.max !== undefined ? fstate.max : '';
              }
              var applyRange = function () {
                var min = minIn.value.trim();
                var max = maxIn.value.trim();
                if (min === '' && max === '') { delete state.colFilters[col.key]; }
                else { state.colFilters[col.key] = { type: 'range', min: min, max: max }; }
                state.page = 1;
                render();
                fire('filter', { keyword: state.keyword, columns: state.colFilters, reason: 'column' });
              };
              on(minIn, 'change', applyRange);
              on(maxIn, 'change', applyRange);
              rw.appendChild(minIn);
              rw.appendChild(el('span', 'kui-datatable__filter-sep', '~'));
              rw.appendChild(maxIn);
              field.appendChild(rw);
            } else {
              var input = el('input', 'kui-datatable__filter-input');
              input.setAttribute('type', 'text');
              input.setAttribute('placeholder', str((col.filter && col.filter.placeholder) || text('filterPlaceholder', '筛选…')));
              if (fstate && fstate.value !== undefined) { input.value = fstate.value; }
              on(input, 'change', function () {
                if (input.value.trim() === '') { delete state.colFilters[col.key]; }
                else { state.colFilters[col.key] = { type: 'text', value: input.value }; }
                state.page = 1;
                render();
                fire('filter', { keyword: state.keyword, columns: state.colFilters, reason: 'column' });
              });
              field.appendChild(input);
            }
            bar.appendChild(field);
          })(state.columns[i]);
        }
      }
      filterCountEl = el('span', 'kui-datatable__filter-active');
      bar.appendChild(filterCountEl);
      if (props.filter && props.filter.clearable !== false) {
        var reset = el('button', 'kui-datatable__filter-reset');
        reset.setAttribute('type', 'button');
        reset.appendChild(iconEl('close', 'kui-datatable__filter-icon', 12));
        reset.appendChild(el('span', '', text('clearFilters', '清除筛选')));
        on(reset, 'click', function () {
          state.keyword = '';
          state.colFilters = {};
          if (searchInput) { searchInput.value = ''; }
          state.page = 1;
          render();
          fire('filter', { keyword: '', columns: {}, reason: 'reset' });
        });
        bar.appendChild(reset);
      }
      return bar;
    }

    /* ---------- 表头 ---------- */
    function visibleColumns() {
      var out = [];
      for (var i = 0; i < state.columns.length; i++) {
        if (!state.hiddenCols[state.columns[i].key]) { out.push(state.columns[i]); }
      }
      return out;
    }

    function sortOf(key) {
      for (var i = 0; i < state.sort.length; i++) {
        if (state.sort[i].key === key) { return state.sort[i]; }
      }
      return null;
    }

    function toggleSort(col, shiftKey) {
      if (!props.sort || props.sort.enabled === false) { return; }
      if (!col.sortable) { return; }
      var mode = (props.sort && props.sort.mode) || 'single';
      var cur = sortOf(col.key);
      var next;
      if (!cur) { next = { key: col.key, order: 'asc' }; }
      else if (cur.order === 'asc') { next = { key: col.key, order: 'desc' }; }
      else { next = null; }
      if (mode === 'multi' && shiftKey) {
        var kept = [];
        for (var i = 0; i < state.sort.length; i++) {
          if (state.sort[i].key !== col.key) { kept.push(state.sort[i]); }
        }
        state.sort = next ? kept.concat([next]) : kept;
      } else {
        state.sort = next ? [next] : [];
      }
      state.page = 1;
      render();
      fire('sort', { sort: state.sort.slice(), key: col.key, order: next ? next.order : null });
    }

    function buildHead() {
      headSelectRef = null;
      clearNode(headRow);
      if (props.selection && (props.selection.mode === 'multi' || props.selection.mode === 'single')) {
        var thSel = el('th', 'kui-datatable__th kui-datatable__th--selection');
        if (props.selection.mode === 'multi' && props.selection.showSelectAll !== false) {
          var wrap = el('label', 'kui-checkbox kui-datatable__select-all');
          var input = el('input', 'kui-checkbox__input');
          input.setAttribute('type', 'checkbox');
          var box = el('span', 'kui-checkbox__box');
          box.appendChild(iconEl('check', 'kui-checkbox__tick', 12));
          input.checked = allPageSelected();
          input.indeterminate = !input.checked && somePageSelected();
          if (input.checked) { addClass(wrap, 'is-checked'); }
          if (input.indeterminate) { addClass(wrap, 'is-indeterminate'); }
          headSelectRef = { input: input, wrap: wrap };
          on(input, 'change', function () {
            toggleSelectAll(input.checked);
            toggleClass(wrap, 'is-checked', input.checked);
            toggleClass(wrap, 'is-indeterminate', false);
            input.indeterminate = false;
          });
          wrap.appendChild(input);
          wrap.appendChild(box);
          thSel.appendChild(wrap);
        } else {
          thSel.setAttribute('aria-label', text('select', '选择'));
        }
        headRow.appendChild(thSel);
      }
      if (props.showIndex) {
        headRow.appendChild(el('th', 'kui-datatable__th kui-datatable__th--index', text('index', '序号')));
      }
      var cols = visibleColumns();
      for (var i = 0; i < cols.length; i++) {
        (function (col) {
          var th = el('th', 'kui-datatable__th');
          th.setAttribute('scope', 'col');
          if (col.width) { th.style.width = isNum(col.width) ? col.width + 'px' : String(col.width); }
          if (col.minWidth) { th.style.minWidth = isNum(col.minWidth) ? col.minWidth + 'px' : String(col.minWidth); }
          if (col.align) { addClass(th, 'is-' + col.align); }
          if (col.sortable) {
            addClass(th, 'is-sortable');
            var s = sortOf(col.key);
            if (s) { addClass(th, 'is-sorted'); addClass(th, s.order === 'desc' ? 'is-desc' : 'is-asc'); }
          }
          var inner = el('span', 'kui-datatable__th-inner');
          inner.appendChild(el('span', 'kui-datatable__th-text', col.title || col.key));
          if (col.sortable) {
            var icon = el('span', 'kui-datatable__sort-icon');
            var s2 = sortOf(col.key);
            icon.appendChild(iconEl(s2 ? (s2.order === 'desc' ? 'chevron-down' : 'chevron-up') : 'more-v', 'kui-datatable__sort-glyph', 12));
            inner.appendChild(icon);
          }
          if (col.headerTip) { th.setAttribute('title', str(col.headerTip)); }
          th.appendChild(inner);
          if (col.sortable) {
            on(th, 'click', function (ev) { toggleSort(col, !!(ev && ev.shiftKey)); });
            th.setAttribute('role', 'columnheader');
            var cs = sortOf(col.key);
            th.setAttribute('aria-sort', cs ? (cs.order === 'desc' ? 'descending' : 'ascending') : 'none');
          }
          headRow.appendChild(th);
        })(cols[i]);
      }
      if (colMenuEl) { /* 列菜单已渲染，保持打开 */ }
    }

    /* ---------- 行 ---------- */
    function buildRow(row, index) {
      var tr = el('tr', 'kui-datatable__row');
      var key = keyOf(row, props.rowKey);
      tr.setAttribute('data-row-key', key);
      tr.setAttribute('tabindex', '0');
      rowItemEls[key] = tr;
      var rowHasSelection = !!(props.selection && props.selection.mode !== 'none');
      if (!rowHasSelection && state.activeKey && state.activeKey === key) { addClass(tr, 'is-active'); }
      if (state.selected[key]) { addClass(tr, 'is-selected'); }
      if (props.selection && props.selection.mode !== 'none') {
        var tdSel = el('td', 'kui-datatable__td kui-datatable__td--selection');
        var singleMode = props.selection.mode === 'single';
        var wrap = el('label', singleMode ? 'kui-radio' : 'kui-checkbox');
        var input = el('input', singleMode ? 'kui-radio__input' : 'kui-checkbox__input');
        input.setAttribute('type', singleMode ? 'radio' : 'checkbox');
        if (singleMode) { input.setAttribute('name', 'kui-datatable-radio-' + (root.id || 'dt')); }
        var box = el('span', singleMode ? 'kui-radio__box' : 'kui-checkbox__box');
        if (singleMode) { box.appendChild(el('span', 'kui-radio__dot')); }
        else { box.appendChild(iconEl('check', 'kui-checkbox__tick', 12)); }
        input.checked = !!state.selected[key];
        if (input.checked) { addClass(wrap, 'is-checked'); }
        on(input, 'change', function (ev) {
          if (ev && ev.stopPropagation) { ev.stopPropagation(); }
          toggleClass(wrap, 'is-checked', input.checked);
          setRowSelected(row, key, input.checked, 'checkbox');
        });
        rowInputRefs[key] = { input: input, wrap: wrap };
        wrap.appendChild(input);
        wrap.appendChild(box);
        tdSel.appendChild(wrap);
        tr.appendChild(tdSel);
      }
      if (props.showIndex) {
        tdSel = el('td', 'kui-datatable__td kui-datatable__td--index');
        tdSel.appendChild(el('span', 'kui-datatable__index-num', String((state.page - 1) * state.pageSize + index + 1)));
        tr.appendChild(tdSel);
      }
      var cols = visibleColumns();
      for (var i = 0; i < cols.length; i++) {
        tr.appendChild(buildCell(row, cols[i], index));
      }
      on(tr, 'click', function (ev) {
        var target = ev && ev.target;
        if (target && target.closest && (target.closest('.kui-radio') || target.closest('.kui-checkbox') ||
            target.closest('.kui-datatable__check') || target.closest('.kui-datatable__cell-btn'))) { return; }
        var selCfg = props.selection;
        var selectable = !!(selCfg && selCfg.mode !== 'none' && selCfg.selectOnRowClick !== false);
        if (selectable) {
          /* v1.4.2：有选择列时，行点击 = 勾选/取消勾选；高亮由 is-selected 承担，不再单独切换 is-active */
          setRowSelected(row, key, !state.selected[key], 'row');
        } else {
          state.activeKey = key;
          if (props.rowHighlight !== false) { syncActiveRow(); }
        }
        fire('row:click', { row: row, key: key, index: index, event: ev });
        runAction(props.rowClickAction || null, { row: row, key: key, index: index, event: ev });
      });
      if (props.keyboard !== false) {
        on(tr, 'keydown', function (ev) {
          if (!ev) { return; }
          if (ev.key === ' ' || ev.key === 'Spacebar') {
            ev.preventDefault();
            if (props.selection && props.selection.mode !== 'none') {
              setRowSelected(row, key, !state.selected[key], 'keyboard');
            }
          } else if (ev.key === 'Enter') {
            ev.preventDefault();
            fire('row:click', { row: row, key: key, index: index, event: ev, keyboard: true });
            runAction(props.rowClickAction || null, { row: row, key: key, index: index, event: ev, keyboard: true });
          }
        });
      }
      return tr;
    }

    /* ---------- 选择 ---------- */
    function selectedKeys() {
      var out = [];
      for (var k in state.selected) { if (hasOwn.call(state.selected, k)) { out.push(k); } }
      return out;
    }

    function selectedRows() {
      var keys = selectedKeys();
      var map = {};
      var out = [];
      for (var i = 0; i < filteredRows.length; i++) { map[keyOf(filteredRows[i], props.rowKey)] = filteredRows[i]; }
      for (var j = 0; j < state.raw.length; j++) { map[keyOf(state.raw[j], props.rowKey)] = state.raw[j]; }
      for (var k = 0; k < keys.length; k++) { if (map[keys[k]]) { out.push(map[keys[k]]); } }
      return out;
    }

    function allPageSelected() {
      if (!pageRows.length) { return false; }
      for (var i = 0; i < pageRows.length; i++) {
        if (!state.selected[keyOf(pageRows[i], props.rowKey)]) { return false; }
      }
      return true;
    }

    function somePageSelected() {
      for (var i = 0; i < pageRows.length; i++) {
        if (state.selected[keyOf(pageRows[i], props.rowKey)]) { return true; }
      }
      return false;
    }

    function setRowSelected(row, key, onFlag, reason) {
      var mode = (props.selection && props.selection.mode) || 'none';
      if (mode === 'none') { return; }
      if (mode === 'single') {
        state.selected = onFlag ? (function () { var m = {}; m[key] = true; return m; })() : {};
      } else if (onFlag) {
        state.selected[key] = true;
      } else {
        delete state.selected[key];
      }
      syncSelectionUi();
      fire('selection:change', { keys: selectedKeys(), rows: selectedRows(), row: row, reason: reason || 'toggle' });
    }

    function toggleSelectAll(onFlag) {
      var scope = (props.selection && props.selection.selectAllScope) || 'page';
      var list = scope === 'all' ? filteredRows : pageRows;
      for (var i = 0; i < list.length; i++) {
        var k = keyOf(list[i], props.rowKey);
        if (onFlag) { state.selected[k] = true; } else { delete state.selected[k]; }
      }
      render();
      fire('selection:change', { keys: selectedKeys(), rows: selectedRows(), reason: 'all' });
    }

    function syncSelectionUi() {
      if (!props.selection || props.selection.mode === 'none') { return; }
      var key;
      /* 行内选择器：单选模式下未选中的行会被自动取消（互斥） */
      for (key in rowInputRefs) {
        if (!hasOwn.call(rowInputRefs, key)) { continue; }
        var ref = rowInputRefs[key];
        var onFlag = !!state.selected[key];
        ref.input.checked = onFlag;
        toggleClass(ref.wrap, 'is-checked', onFlag);
      }
      /* 行高亮与勾选同步：有选择列时只保留 is-selected */
      for (key in rowItemEls) {
        if (!hasOwn.call(rowItemEls, key)) { continue; }
        toggleClass(rowItemEls[key], 'is-selected', !!state.selected[key]);
        toggleClass(rowItemEls[key], 'is-active', false);
      }
      /* 表头全选：勾选 / 半选 / 未勾选 三态联动 */
      if (headSelectRef) {
        var all = allPageSelected();
        var some = somePageSelected();
        headSelectRef.input.checked = all;
        headSelectRef.input.indeterminate = !all && some;
        toggleClass(headSelectRef.wrap, 'is-checked', all);
        toggleClass(headSelectRef.wrap, 'is-indeterminate', !all && some);
      }
      syncSelectionInfo();
    }

    function syncSelectionInfo() {
      if (!selectionInfoEl) { return; }
      var n = selectedKeys().length;
      if (!props.selectionInfo || n === 0) {
        selectionInfoEl.style.display = 'none';
        selectionInfoEl.textContent = '';
        return;
      }
      selectionInfoEl.style.display = '';
      selectionInfoEl.textContent = text('selected', '已选 {{count}} 项', { count: n });
    }

    function syncActiveRow() {
      for (var i = 0; i < tbody.children.length; i++) {
        var tr = tbody.children[i];
        var key = tr && tr.getAttribute ? tr.getAttribute('data-row-key') : '';
        toggleClass(tr, 'is-active', !!key && key === state.activeKey);
      }
    }

    /* ---------- 分页 ---------- */
    function pageCount() {
      return Math.max(1, Math.ceil(filteredRows.length / state.pageSize));
    }

    function buildPageList(current, count, max) {
      var out = [];
      if (count <= 0) { return out; }
      if (max < 5) { max = 5; }
      if (count <= max) { for (var i = 1; i <= count; i++) { out.push(i); } return out; }
      var side = Math.floor((max - 3) / 2);
      var start, end;
      if (current <= max - 3) { start = 2; end = max - 2; }
      else if (current >= count - (max - 4)) { start = count - (max - 3); end = count - 1; }
      else { start = current - side; end = current + side; }
      if (start < 2) { start = 2; }
      if (end > count - 1) { end = count - 1; }
      out.push(1);
      if (start > 2) { out.push('...'); }
      for (var j = start; j <= end; j++) { out.push(j); }
      if (end < count - 1) { out.push('...'); }
      out.push(count);
      return out;
    }

    function goPage(page, reason) {
      var count = pageCount();
      var target = Math.max(1, Math.min(count, Math.round(num(page, 1))));
      if (target === state.page) { return; }
      state.page = target;
      if (props.selection && props.selection.keepAcrossPages === false) { state.selected = {}; }
      render();
      fire('page', { page: state.page, pageSize: state.pageSize, total: filteredRows.length, reason: reason || 'page' });
    }

    function buildFooter() {
      clearNode(footerEl);
      var pg = props.pagination || {};
      if (pg.enabled === false) { footerEl.style.display = 'none'; return; }
      footerEl.style.display = '';
      var count = pageCount();
      var pager = el('nav', 'kui-pagination kui-datatable__pager');
      pager.setAttribute('aria-label', text('pagination', '分页'));
      if (pg.showTotal !== false) {
        pager.appendChild(el('span', 'kui-pagination__total', text('total', '共 {{total}} 条', { total: filteredRows.length })));
      }
      var prev = el('button', 'kui-pagination__btn kui-pagination__prev');
      prev.setAttribute('type', 'button');
      prev.setAttribute('aria-label', text('prev', '上一页'));
      prev.appendChild(iconEl('chevron-left', 'kui-pagination__arrow', 13));
      prev.disabled = state.page <= 1;
      toggleClass(prev, 'is-disabled', prev.disabled);
      on(prev, 'click', function () { goPage(state.page - 1, 'prev'); });
      pager.appendChild(prev);
      var pagesEl = el('span', 'kui-pagination__pages');
      var list = buildPageList(state.page, count, Math.max(5, num(pg.maxButtons, 7)));
      for (var i = 0; i < list.length; i++) {
        (function (item) {
          if (item === '...') {
            var more = el('span', 'kui-pagination__ellipsis');
            more.appendChild(iconEl('more-h', 'kui-pagination__more-icon', 13));
            pagesEl.appendChild(more);
            return;
          }
          var btn = el('button', 'kui-pagination__item', String(item));
          btn.setAttribute('type', 'button');
          if (item === state.page) { btn.setAttribute('aria-current', 'page'); addClass(btn, 'is-active'); }
          on(btn, 'click', function () { goPage(item, 'page'); });
          pagesEl.appendChild(btn);
        })(list[i]);
      }
      pager.appendChild(pagesEl);
      var next = el('button', 'kui-pagination__btn kui-pagination__next');
      next.setAttribute('type', 'button');
      next.setAttribute('aria-label', text('next', '下一页'));
      next.appendChild(iconEl('chevron-right', 'kui-pagination__arrow', 13));
      next.disabled = state.page >= count;
      toggleClass(next, 'is-disabled', next.disabled);
      on(next, 'click', function () { goPage(state.page + 1, 'next'); });
      pager.appendChild(next);
      if (pg.showSizer !== false && isArr(pg.pageSizes) && pg.pageSizes.length) {
        var sizeItems = [];
        for (var s = 0; s < pg.pageSizes.length; s++) {
          var size = num(pg.pageSizes[s], 0);
          if (!size) { continue; }
          sizeItems.push({ value: String(size), label: text('pageSizeOption', '{{size}} 条/页', { size: size }) });
        }
        pager.appendChild(themedSelect('kui-pagination__sizer', sizeItems, String(state.pageSize), text('pageSize', '每页条数'), function (v) {
          state.pageSize = Math.max(1, num(v, state.pageSize));
          state.page = 1;
          render();
          fire('page', { page: state.page, pageSize: state.pageSize, total: filteredRows.length, reason: 'pageSize' });
        }));
      }
      if (pg.showJumper !== false) {
        var jumper = el('span', 'kui-pagination__jumper');
        jumper.appendChild(el('span', 'kui-pagination__jumper-text', text('jump', '前往')));
        var input = el('input', 'kui-pagination__input');
        input.setAttribute('type', 'text');
        input.setAttribute('inputmode', 'numeric');
        input.setAttribute('aria-label', text('jumpInput', '页码'));
        on(input, 'keydown', function (ev) {
          if (ev.key !== 'Enter') { return; }
          ev.preventDefault();
          goPage(input.value, 'jump');
          input.value = '';
        });
        on(input, 'blur', function () {
          if (input.value === '') { return; }
          goPage(input.value, 'jump');
          input.value = '';
        });
        jumper.appendChild(input);
        jumper.appendChild(el('span', 'kui-pagination__jumper-text', text('pageUnit', '页')));
        pager.appendChild(jumper);
      }
      footerEl.appendChild(pager);
    }

    /* ---------- 渲染流水线 ---------- */
    function render() {
      if (state.destroyed) { return; }
      var cols = state.columns;
      filteredRows = filterRows(state.raw, cols, state.keyword, state.colFilters,
        (props.search && props.search.keys) || []);
      filteredRows = sortRows(filteredRows, cols, state.sort);
      var count = Math.max(1, Math.ceil(filteredRows.length / state.pageSize));
      if (state.page > count) { state.page = count; }
      if (state.page < 1) { state.page = 1; }
      var start = (state.page - 1) * state.pageSize;
      pageRows = filteredRows.slice(start, start + state.pageSize);

      toggleClass(root, 'is-loading', !!state.loading);
      toggleClass(root, 'is-empty', filteredRows.length === 0);
      loadingEl.style.display = state.loading ? '' : 'none';

      rowItemEls = {};
      rowInputRefs = {};
      buildHead();
      clearNode(tbody);
      if (!pageRows.length) {
        var tr = el('tr', 'kui-datatable__empty-row');
        var td = el('td', 'kui-datatable__empty');
        td.setAttribute('colspan', String(Math.max(1, visibleColumns().length + (props.showIndex ? 1 : 0) + (props.selection && props.selection.mode !== 'none' ? 1 : 0))));
        var box = el('div', 'kui-datatable__empty-box');
        box.appendChild(iconEl('database', 'kui-datatable__empty-icon', 26));
        var hasFilter = !!state.keyword || Object.keys(state.colFilters).length > 0;
        box.appendChild(el('div', 'kui-datatable__empty-title',
          hasFilter ? text('noMatch', '没有匹配的数据') : (props.emptyText || text('empty', '暂无数据'))));
        box.appendChild(el('div', 'kui-datatable__empty-desc', text('emptyDesc', '调整筛选条件或稍后重试')));
        td.appendChild(box);
        tr.appendChild(td);
        tbody.appendChild(tr);
      } else {
        for (var i = 0; i < pageRows.length; i++) {
          tbody.appendChild(buildRow(pageRows[i], i));
        }
      }
      buildFooter();
      syncSelectionInfo();
      syncFilterState();
    }

    function syncFilterState() {
      if (!filterBar) { return; }
      var n = 0;
      if (state.keyword) { n++; }
      for (var k in state.colFilters) { if (hasOwn.call(state.colFilters, k)) { n++; } }
      if (filterCountEl) {
        filterCountEl.textContent = n ? text('filterCount', '{{count}} 个筛选生效', { count: n }) : '';
      }
      toggleClass(filterBar, 'is-active', n > 0);
    }

    /* ---------- 事件 / 动作 ---------- */
    function fire(name, payload) {
      var list = handlers[name];
      if (list) {
        for (var i = 0; i < list.length; i++) {
          (function (fn) { safe(function () { fn.call(api, payload); }); })(list[i]);
        }
      }
      if (props.on && isFn(props.on[name])) { safe(function () { props.on[name](payload); }); }
      var camel = 'on' + name.charAt(0).toUpperCase() + name.slice(1).replace(/[^A-Za-z0-9]/g, '');
      if (isFn(props[camel])) { safe(function () { props[camel](payload); }); }
      if (node && node.on && isFn(node.on[name])) { safe(function () { node.on[name](payload); }); }
      safe(function () { if (KUI.bus && isFn(KUI.bus.emit)) { KUI.bus.emit('datatable:' + name, payload); } });
    }

    function runAction(spec, payload) {
      if (!spec) { return null; }
      var ev = {
        id: node ? node.id : undefined,
        payload: payload || {},
        node: node,
        el: root,
        ctx: ctx
      };
      ev.value = payload && payload.row !== undefined ? payload.row : (payload && payload.keys);
      if (KUI.actions && isFn(KUI.actions.run)) {
        return safe(function () { return KUI.actions.run(spec, ctx, ev); }, null);
      }
      return null;
    }

    function fireRowAction(spec, row, index, btn) {
      var payload = { row: row, key: keyOf(row, props.rowKey), index: index, button: btn };
      fire('action', { action: spec, row: row });
      if (spec && spec.action) { runAction(spec.action, payload); }
      else if (spec && (spec.fn || spec.emit || spec.theme || spec.tab || spec.toast || spec.dialog || spec.actions || spec.handler)) {
        runAction(spec, payload);
      }
    }

    /* ---------- 导出 ---------- */
    function exportCsv() {
      var cols = visibleColumns();
      var names = [];
      for (var c = 0; c < cols.length; c++) { if (cols[c].type !== 'actions') { names.push(cols[c].title || cols[c].key); } }
      var lines = [names.map(csvCell).join(',')];
      for (var i = 0; i < filteredRows.length; i++) {
        var row = filteredRows[i];
        var cells = [];
        for (var j = 0; j < cols.length; j++) {
          if (cols[j].type === 'actions') { continue; }
          cells.push(csvCell(displayText(cellValue(row, cols[j]))));
        }
        lines.push(cells.join(','));
      }
      var content = '\ufeff' + lines.join('\r\n');
      var blob = null;
      try { blob = new Blob([content], { type: 'text/csv;charset=utf-8' }); } catch (e) { blob = null; }
      if (!blob || !window.URL || !URL.createObjectURL) {
        fire('action', { action: 'export', csv: content, supported: false });
        return;
      }
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = props.exportFileName || 'datatable.csv';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(function () {
        URL.revokeObjectURL(link.href);
        if (link.parentNode) { link.parentNode.removeChild(link); }
      }, 0);
      fire('action', { action: 'export', csv: content, supported: true });
    }

    function csvCell(v) {
      var s = String(v === undefined || v === null ? '' : v);
      if (/[",\r\n]/.test(s)) { s = '"' + s.replace(/"/g, '""') + '"'; }
      return s;
    }

    /* ---------- 实例 API ---------- */
    api = {
      el: root,
      node: node,
      getConfig: function () { return props; },
      getState: function () {
        return {
          page: state.page,
          pageSize: state.pageSize,
          total: filteredRows.length,
          pageCount: pageCount(),
          keyword: state.keyword,
          filters: state.colFilters,
          sort: state.sort.slice(),
          selected: selectedKeys(),
          activeKey: state.activeKey,
          density: state.density,
          loading: state.loading
        };
      },
      setData: function (rows) {
        state.raw = isArr(rows) ? rows.slice() : [];
        state.page = 1;
        state.activeKey = '';
        if (props.selection && props.selection.keepAcrossPages === false) { state.selected = {}; }
        render();
        return api;
      },
      getData: function () { return state.raw.slice(); },
      getRows: function () { return pageRows.slice(); },
      getFilteredRows: function () { return filteredRows.slice(); },
      setColumns: function (columns) {
        state.columns = normColumns(columns);
        render();
        return api;
      },
      getColumns: function () { return state.columns.slice(); },
      setColumnVisible: function (key, visible) {
        if (visible) { delete state.hiddenCols[key]; } else { state.hiddenCols[key] = true; }
        render();
        return api;
      },
      setKeyword: function (kw) {
        state.keyword = str(kw);
        if (searchInput) { searchInput.value = state.keyword; }
        state.page = 1;
        render();
        return api;
      },
      setFilter: function (key, value) {
        if (value === null || value === undefined || value === '') { delete state.colFilters[key]; }
        else { state.colFilters[key] = { type: 'text', value: String(value) }; }
        state.page = 1;
        render();
        return api;
      },
      getFilter: function () { return deepMerge({}, state.colFilters); },
      clearFilters: function () {
        state.keyword = '';
        state.colFilters = {};
        if (searchInput) { searchInput.value = ''; }
        state.page = 1;
        render();
        return api;
      },
      setSort: function (sorts) {
        state.sort = isArr(sorts) ? sorts.slice() : [];
        state.page = 1;
        render();
        return api;
      },
      getSort: function () { return state.sort.slice(); },
      setPage: function (page) { goPage(page, 'api'); return api; },
      getPage: function () { return state.page; },
      setPageSize: function (size) {
        state.pageSize = Math.max(1, num(size, state.pageSize) || 1);
        state.page = 1;
        render();
        return api;
      },
      getPageSize: function () { return state.pageSize; },
      getSelection: function () { return { keys: selectedKeys(), rows: selectedRows() }; },
      getSelectedKeys: function () { return selectedKeys(); },
      getSelectedRows: function () { return selectedRows(); },
      setSelection: function (keys) {
        state.selected = {};
        if (isArr(keys)) {
          for (var i = 0; i < keys.length; i++) { state.selected[String(keys[i])] = true; }
        }
        render();
        fire('selection:change', { keys: selectedKeys(), rows: selectedRows(), reason: 'api' });
        return api;
      },
      clearSelection: function () {
        state.selected = {};
        render();
        fire('selection:change', { keys: [], rows: [], reason: 'api' });
        return api;
      },
      selectAll: function () { toggleSelectAll(true); return api; },
      clearAllSelection: function () { toggleSelectAll(false); return api; },
      setActive: function (key) {
        state.activeKey = key === null || key === undefined ? '' : String(key);
        syncActiveRow();
        return api;
      },
      getActive: function () { return state.activeKey; },
      setLoading: function (flag) {
        state.loading = !!flag;
        toggleClass(root, 'is-loading', !!flag);
        loadingEl.style.display = flag ? '' : 'none';
        return api;
      },
      setDensity: function (density) {
        state.density = density === 'compact' ? 'compact' : 'default';
        applyRootClasses();
        render();
        return api;
      },
      getDensity: function () { return state.density; },
      setToolbarTitle: function (title, subtitle) {
        var t = safe(function () { return root.querySelector('.kui-datatable__title'); }, null);
        if (t) { t.textContent = str(title); }
        if (subtitle !== undefined) {
          var s = safe(function () { return root.querySelector('.kui-datatable__subtitle'); }, null);
          if (s) { s.textContent = str(subtitle); }
        }
        return api;
      },
      refresh: function () { render(); fire('refresh', {}); return api; },
      exportCsv: function () { exportCsv(); return api; },
      on: function (name, fn) {
        if (!isFn(fn)) { return api; }
        name = str(name);
        if (!handlers[name]) { handlers[name] = []; }
        handlers[name].push(fn);
        return api;
      },
      off: function (name, fn) {
        if (!handlers[name]) { return api; }
        if (!fn) { delete handlers[name]; return api; }
        handlers[name] = handlers[name].filter(function (f) { return f !== fn; });
        return api;
      },
      destroy: function () {
        state.destroyed = true;
        if (root.parentNode) { root.parentNode.removeChild(root); }
        api.el = null;
        if (currentInstance === api) { currentInstance = null; }
        fire('destroy', {});
      }
    };

    render();
    fire('ready', { el: root });

    if (host && host.appendChild) { host.appendChild(root); }
    return api;
  }

  /* ================= 组件注册（契约 §22） ================= */

  var component = {
    category: 'data',
    defaults: DEFAULTS,
    render: function (node, ctx) {
      var props = (node && node.props) ? node.props : {};
      var inst = createDatatable(null, props, ctx, node);
      inst.el.__kuiDatatable = inst;
      currentInstance = inst;
      return inst.el;
    },
    api: function (elm) {
      return elm && elm.__kuiDatatable ? elm.__kuiDatatable : {};
    }
  };

  var registered = safe(function () {
    return KUI.registry && isFn(KUI.registry.register) ? KUI.registry.register('datatable', component) : false;
  }, false);
  if (registered === false) {
    safe(function () {
      KUI.warn('datatable: registry 未就绪，挂到 KUI.__pendingComponents 等待 core 加载');
      KUI.__pendingComponents = KUI.__pendingComponents || [];
      KUI.__pendingComponents.push(['datatable', component]);
    });
  }

  /* ================= 静态入口（KUI.datatable.*） ================= */

  var currentInstance = null;

  KUI.datatable = {
    version: '1.0.0',
    defaults: DEFAULTS,
    create: function (host, props, ctx) {
      var merged = deepMerge(DEFAULTS, props || {});
      var inst = createDatatable(host, merged, ctx || null, null);
      currentInstance = inst;
      return inst;
    },
    get: function () { return currentInstance; }
  };

  var DELEGATED = ['setData', 'getData', 'getRows', 'getFilteredRows', 'setColumns', 'getColumns',
    'setColumnVisible', 'setKeyword', 'setFilter', 'getFilter', 'clearFilters', 'setSort', 'getSort',
    'setPage', 'getPage', 'setPageSize', 'getPageSize', 'getSelection', 'getSelectedKeys',
    'getSelectedRows', 'setSelection', 'clearSelection', 'selectAll', 'clearAllSelection',
    'setActive', 'getActive', 'setLoading', 'setDensity', 'getDensity', 'setToolbarTitle',
    'refresh', 'exportCsv', 'getState', 'getConfig', 'on', 'off', 'destroy'];

  function delegate(name) {
    return function () {
      var inst = currentInstance;
      if (!inst || !isFn(inst[name])) { return undefined; }
      return inst[name].apply(inst, slice.call(arguments));
    };
  }

  for (var di = 0; di < DELEGATED.length; di++) {
    KUI.datatable[DELEGATED[di]] = delegate(DELEGATED[di]);
  }

})(window.KUI);

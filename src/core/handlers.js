/*!
 * KurumiUI · core/handlers.js
 * ---------------------------------------------------------------
 * 「业务函数注册表」：解决 JSON 不能存函数的问题。
 *
 * 设计约定：
 *   1. 每个框架组件自带一个独立的业务函数文件（src/components/handlers/<组件>.handlers.js），
 *      把该组件的业务函数注册进本注册表；
 *   2. 配置 JSON 里只写「函数名 + 入参」，例如：
 *        { "fn": "toast.success", "args": { "text": "已保存" } }
 *        { "action": "handlers.run", "params": { "fn": "menu.toggleCollapse" } }
 *        "click": "tabs.activateNext"        // 字符串简写直接当函数名
 *   3. 渲染代码只负责把 JSON 里的动作交给 KUI.actions / KUI.handlers 执行，
 *      业务差异全部由「配置 + 对应组件的 handlers 文件」决定，不改框架代码。
 *
 * 函数命名：<scope>.<name>，scope 默认为注册时传入的组件名（menu、tabs、toast…）。
 * 函数签名：(ctx, args, extra) -> any | Promise
 *   ctx   —— 触发时的上下文（含 app / form / tab / dialog / data / path 等）
 *   args  —— JSON 里给的入参对象
 *   extra —— { KUI, scope, name, meta }
 */
(function (global) {
  'use strict';

  var KUI = global.KUI = global.KUI || {};
  var hasOwn = Object.prototype.hasOwnProperty;

  /** 全名字符串 -> 记录 */
  var flat = Object.create(null);
  /** scope -> { name -> 记录 } */
  var byScope = Object.create(null);

  function trimDots(s) {
    return String(s === null || s === undefined ? '' : s).replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');
  }

  function normalizeScope(scope) {
    return trimDots(scope) || 'app';
  }

  function normalizeName(name) {
    return trimDots(name);
  }

  function normalizeMeta(meta) {
    meta = meta || {};
    return {
      title: meta.title || '',
      desc: meta.desc || '',
      args: Array.isArray(meta.args) ? meta.args : (meta.params || []),
      returns: meta.returns || '',
      example: meta.example || ''
    };
  }

  /**
   * 注册一个业务函数。
   * @param {string} scope 组件名，如 'menu'
   * @param {string} name  函数名，如 'toggleCollapse'
   * @param {Function} fn (ctx, args, extra) => any
   * @param {Object} [meta] { title, desc, args:[{name,type,desc,default}], returns, example }
   */
  function register(scope, name, fn, meta) {
    var s = normalizeScope(scope);
    var n = normalizeName(name);
    if (!n || typeof fn !== 'function') {
      if (KUI.warn) { KUI.warn('KUI.handlers.register 参数非法：scope=' + s + ' name=' + n); }
      return null;
    }
    var full = s + '.' + n;
    var rec = {
      scope: s,
      name: n,
      full: full,
      fn: fn,
      meta: normalizeMeta(meta)
    };
    flat[full] = rec;
    if (!byScope[s]) { byScope[s] = Object.create(null); }
    byScope[s][n] = rec;
    return rec;
  }

  /**
   * 批量注册：registerMany('menu', { toggleCollapse: fn1, select: { fn: fn2, title: '…' } })
   */
  function registerMany(scope, map, meta) {
    if (!map || typeof map !== 'object') { return 0; }
    var count = 0;
    var s = normalizeScope(scope);
    for (var key in map) {
      if (!hasOwn.call(map, key)) { continue; }
      var item = map[key];
      var fn = item;
      var itemMeta = meta;
      if (item && typeof item === 'object' && typeof item.fn === 'function') {
        fn = item.fn;
        itemMeta = item;
      }
      if (typeof fn === 'function') {
        register(s, key, fn, itemMeta || item || {});
        count += 1;
      }
    }
    return count;
  }

  /** 取一条记录：支持全名（menu.select）与无点简写（需 ctx.type 推断 scope） */
  function resolve(name, ctx) {
    var n = normalizeName(name);
    if (!n) { return null; }
    if (flat[n]) { return flat[n]; }
    if (n.indexOf('.') === -1) {
      var scope = (ctx && (ctx.type || (ctx.scope && ctx.scope !== 'dialog' ? ctx.scope : ''))) || '';
      if (scope && byScope[normalizeScope(scope)] && byScope[normalizeScope(scope)][n]) {
        return byScope[normalizeScope(scope)][n];
      }
    }
    return null;
  }

  function has(name, ctx) {
    return !!resolve(name, ctx);
  }

  /** 执行一个业务函数 */
  function invoke(name, ctx, args, extra) {
    var rec = resolve(name, ctx);
    if (!rec) {
      if (KUI.warnOnce) {
        KUI.warnOnce('handler-missing:' + name, '未注册的业务函数: ' + name + '（请检查对应组件的 handlers 文件是否已加载）');
      }
      return undefined;
    }
    var params = args && typeof args === 'object' ? args : {};
    try {
      var info = {
        KUI: KUI,
        scope: rec.scope,
        name: rec.name,
        full: rec.full,
        meta: rec.meta
      };
      var ret = rec.fn(ctx || {}, params, info, extra);
      if (ret && typeof ret.then === 'function' && typeof ret['catch'] === 'function') {
        ret['catch'](function (e) {
          if (KUI.error) { KUI.error('业务函数异常 [' + rec.full + ']:', e); }
        });
      }
      return ret;
    } catch (e) {
      if (KUI.error) { KUI.error('业务函数执行异常 [' + rec.full + ']:', e); }
      return undefined;
    }
  }

  /** 列出（可按 scope 过滤），用于文档面板 / 调试 */
  function list(scope) {
    var out = [];
    var s = scope ? normalizeScope(scope) : '';
    for (var full in flat) {
      if (!hasOwn.call(flat, full)) { continue; }
      if (s && flat[full].scope !== s) { continue; }
      out.push({
        full: full,
        scope: flat[full].scope,
        name: flat[full].name,
        title: flat[full].meta.title,
        desc: flat[full].meta.desc,
        args: flat[full].meta.args,
        returns: flat[full].meta.returns,
        example: flat[full].meta.example
      });
    }
    out.sort(function (a, b) { return a.full < b.full ? -1 : (a.full > b.full ? 1 : 0); });
    return out;
  }

  function scopes() {
    return Object.keys(byScope).sort();
  }

  function count(scope) {
    return list(scope).length;
  }

  /** 测试 / 热重载用：清空某个 scope（不传则全部清空） */
  function clear(scope) {
    var s = scope ? normalizeScope(scope) : '';
    for (var full in flat) {
      if (!hasOwn.call(flat, full)) { continue; }
      if (!s || flat[full].scope === s) { delete flat[full]; }
    }
    if (s) { delete byScope[s]; } else { byScope = Object.create(null); }
    return true;
  }

  KUI.handlers = {
    register: register,
    registerMany: registerMany,
    resolve: resolve,
    get: resolve,
    has: has,
    invoke: invoke,
    call: invoke,
    list: list,
    scopes: scopes,
    count: count,
    clear: clear
  };

  /* ------------------------------------------------------------------ */
  /* 内置动作：handlers.run                                              */
  /*   JSON: { "action": "handlers.run", "params": { "fn": "…", "args": {} } } */
  /* ------------------------------------------------------------------ */
  if (KUI.actions && typeof KUI.actions.register === 'function') {
    KUI.actions.register('handlers.run', function (ctx, p) {
      var payload = p || {};
      var name = payload.fn || payload.name || payload.handler || payload.function;
      var args = payload.args || payload.params || payload.data || {};
      return invoke(name, ctx, args);
    });
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

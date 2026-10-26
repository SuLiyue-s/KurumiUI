/*!
 * KurumiUI · core/registry.js
 * ---------------------------------------------------------------
 * 元素控件注册中心。框架内「一切可渲染的东西」都是注册项：
 * 菜单、菜单导航、子标签、弹窗、提醒信息，以及按钮/输入框/下拉框等。
 *
 * 注册协议（契约 §5）：
 *   KUI.registry.register('button', {
 *     category: 'control' | 'component' | 'layout',   // 可选，默认 control
 *     title: '按钮',                                   // 可选，文档用
 *     defaults: { ... },                               // 可选，节点默认属性
 *     render: function (node, ctx) { return el; },     // 必填，返回 DOM 元素
 *     api:    function (el, node, ctx) { return {...}; }, // 可选，返回实例方法
 *     mounted:function (el, node, ctx, inst) {}        // 可选，挂载后回调
 *   });
 *
 * 渲染时核心会为根元素加上：
 *   class="kui-control kui-control--<type>"
 * 并把实例挂到 el.__kuiInstance，供上层拿 API。
 */
(function (global) {
  'use strict';

  var KUI = global.KUI = global.KUI || {};

  var map = Object.create(null);
  var order = 0;
  var version = 0;               // 每次注册/注销自增，便于缓存失效
  var listeners = [];

  function normalize(type, def) {
    var out = {};
    out.type = type;
    out.category = def.category || 'control';
    out.title = def.title || type;
    out.defaults = def.defaults || null;
    out.render = def.render;
    out.api = def.api || null;
    out.mounted = def.mounted || null;
    out.destroy = def.destroy || null;
    out.order = order++;
    out.version = version;
    // 允许组件自带额外元信息
    for (var k in def) {
      if (!Object.prototype.hasOwnProperty.call(def, k)) continue;
      if (out[k] === undefined) out[k] = def[k];
    }
    return out;
  }

  var registry = {
    /**
     * 注册元素类型。返回规范化后的定义；失败返回 null。
     * 同名重复注册会覆盖旧定义（后加载的控件优先）。
     */
    register: function (type, def) {
      if (!type || typeof type !== 'string') {
        KUI.warn('registry.register: 类型名必须是非空字符串');
        return null;
      }
      if (!def || typeof def.render !== 'function') {
        KUI.warn('registry.register("' + type + '"): 缺少 render(node, ctx) 函数，注册已忽略');
        return null;
      }
      var normalized = normalize(type, def);
      map[type] = normalized;
      version++;
      emitChange('register', type);
      return normalized;
    },

    /** 批量注册：registerMany({ input: {...}, number: {...} }) */
    registerMany: function (defs) {
      var out = [];
      if (!defs) return out;
      for (var type in defs) {
        if (!Object.prototype.hasOwnProperty.call(defs, type)) continue;
        var d = registry.register(type, defs[type]);
        if (d) out.push(d);
      }
      return out;
    },

    unregister: function (type) {
      if (!map[type]) return false;
      delete map[type];
      version++;
      emitChange('unregister', type);
      return true;
    },

    get: function (type) {
      return map[type] || null;
    },

    has: function (type) {
      return !!map[type];
    },

    /** 全部类型描述（不含函数），供文档/编辑器/校验使用 */
    list: function () {
      var out = [];
      for (var type in map) {
        if (!Object.prototype.hasOwnProperty.call(map, type)) continue;
        var d = map[type];
        out.push({
          type: d.type,
          category: d.category,
          title: d.title,
          order: d.order,
          defaults: d.defaults,
          hasApi: typeof d.api === 'function',
          hasMounted: typeof d.mounted === 'function'
        });
      }
      out.sort(function (a, b) { return a.order - b.order; });
      return out;
    },

    /** 只取类型名数组 */
    types: function () {
      var out = [];
      for (var type in map) {
        if (Object.prototype.hasOwnProperty.call(map, type)) out.push(type);
      }
      return out.sort();
    },

    byCategory: function () {
      var groups = {};
      var all = registry.list();
      for (var i = 0; i < all.length; i++) {
        var c = all[i].category || 'control';
        if (!groups[c]) groups[c] = [];
        groups[c].push(all[i]);
      }
      return groups;
    },

    /** 监听注册表变化（用于运行时热插拔组件） */
    onChange: function (fn) {
      if (typeof fn !== 'function') return function () { };
      listeners.push(fn);
      return function off() {
        var i = listeners.indexOf(fn);
        if (i !== -1) listeners.splice(i, 1);
      };
    },

    count: function () {
      var n = 0;
      for (var type in map) {
        if (Object.prototype.hasOwnProperty.call(map, type)) n++;
      }
      return n;
    },

    version: function () { return version; },

    /** 测试/热重载用：清空全部注册 */
    reset: function () {
      map = Object.create(null);
      version++;
      order = 0;
      emitChange('reset', null);
      return registry;
    }
  };

  function emitChange(kind, type) {
    if (!listeners.length) return;
    var copy = listeners.slice();
    for (var i = 0; i < copy.length; i++) {
      try {
        copy[i](type, kind, registry);
      } catch (e) {
        KUI.error('registry.onChange 回调异常:', e);
      }
    }
  }

  KUI.registry = registry;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));

/*!
 * KurumiUI · 主题预置脚本（防闪烁 FOUC）
 * ---------------------------------------------------------------------
 * 作用：在页面首次绘制之前，就把「当前主题」的内联 CSS 变量写到 <html> 上。
 *
 * 为什么需要它：
 *   主框架换肤后，标签 iframe / 弹窗 iframe 是「新开的文档」，base.css 的
 *   :root 默认值是 kurumi（暗夜绯红）。等页面脚本跑完、收到父级 theme:apply
 *   才切换时，用户会看到「先闪一下别的主题，再变成当前主题」。
 *
 * 解决方式：本文件是**同步脚本**，必须放在 <head> 里、且位于第一个
 *   <link rel="stylesheet"> 之前。它会：
 *     1. 同源且被 iframe 嵌入时：直接读父页面 `KUI.theme.currentId()` /
 *        `currentTokens()`，立刻把 token 写成内联变量；
 *     2. 独立打开时：读 localStorage 里记住的主题 id，先标记主题 id（token 由
 *        后续 theme.js 应用，独立页没有父级可借，闪烁窗口极小）；
 *     3. 把取到的 id 存到 `window.__KUI_EARLY_THEME__`，供 core/theme.js 的
 *        resolveInitial() 优先采用，避免二次切换。
 *
 * 本文件零依赖、无副作用、可安全重复引入；任何异常都静默降级，不影响页面。
 */
(function (window, document) {
  'use strict';

  var root = document.documentElement;
  var early = { id: '', tokens: null };

  function readParentTheme() {
    try {
      if (!window.parent || window.parent === window) { return null; }
      var K = window.parent.KUI;
      if (!K || !K.theme) { return null; }
      var id = typeof K.theme.currentId === 'function' ? K.theme.currentId() : '';
      var tokens = typeof K.theme.currentTokens === 'function' ? K.theme.currentTokens() : null;
      if (!id) { return null; }
      return { id: id, tokens: tokens || null };
    } catch (e) {
      // file:// 父子文档可能不同源，静默降级
      return null;
    }
  }

  function readStoredId() {
    try {
      var key = (document.documentElement.getAttribute('data-kui-theme-key')) || '';
      var id = '';
      if (key) { id = window.localStorage.getItem(key) || ''; }
      if (!id) { id = window.localStorage.getItem('kui-theme') || ''; }
      return id || '';
    } catch (e) { return ''; }
  }

  function writeTokens(tokens, id) {
    if (!tokens || typeof tokens !== 'object') { return 0; }
    var count = 0;
    for (var key in tokens) {
      if (!Object.prototype.hasOwnProperty.call(tokens, key)) { continue; }
      var name = String(key);
      if (name.indexOf('--') !== 0) { name = '--kui-' + name.replace(/^kui-/, ''); }
      var value = tokens[key];
      if (value === null || typeof value === 'undefined') { continue; }
      root.style.setProperty(name, String(value));
      count++;
    }
    if (id) { root.setAttribute('data-kui-theme', id); }
    return count;
  }

  var fromParent = readParentTheme();
  if (fromParent) {
    early.id = fromParent.id;
    early.tokens = fromParent.tokens;
    if (early.tokens && early.tokens.scheme) {
      root.setAttribute('data-kui-scheme', String(early.tokens.scheme));
    } else if (fromParent.tokens && fromParent.tokens['--kui-scheme']) {
      root.setAttribute('data-kui-scheme', String(fromParent.tokens['--kui-scheme']));
    }
  } else {
    early.id = readStoredId();
  }

  if (early.id) { root.setAttribute('data-kui-theme', early.id); }
  if (early.tokens) { writeTokens(early.tokens, early.id); }

  try {
    window.__KUI_EARLY_THEME__ = early.id || '';
    window.__KUI_EARLY_TOKENS__ = early.tokens || null;
  } catch (e) { /* 忽略 */ }
})(window, document);

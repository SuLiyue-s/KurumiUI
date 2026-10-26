/* 独立渲染页的「被嵌入」检测（零依赖）
 *
 * 这些 standalone 页既可以双击 / 直接访问单独演示，也会被主应用以
 * <iframe src="standalone/xxx.html"> 的方式嵌进标签页。被嵌入时：
 *   1) 外层已经有菜单 / 导航 / 标签 / 主题选择器，内层再来一套就是重复壳；
 *   2) 主题由主框架 index.html 统一下发（含 theme:change），页内再放主题下拉会互相打架。
 * 所以这里统一：隐藏演示页导航与主题下拉，补一枚说明徽标，并给探针留 data-kui-embedded 标记。
 * 页面自身的演示内容（组件 + 操作台 + 日志）保持不变。
 */
(function (g, d) {
  'use strict';

  var framed = false;
  try {
    framed = !!(g.parent && g.parent !== g);
  } catch (e) {
    framed = true; /* 跨域访问 parent 抛错，也按「被嵌入」处理 */
  }
  if (!framed) return;

  var CSS = [
    '.demo-embedded-badge{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 10px;',
    'border:1px solid var(--kui-border);border-radius:999px;background:var(--kui-bg-2);',
    'color:var(--kui-accent-2);font-size:11px;letter-spacing:.04em;white-space:nowrap;',
    'box-shadow:var(--kui-highlight);opacity:.92}',
    '.demo-embedded-badge::before{content:"";width:6px;height:6px;border-radius:50%;',
    'background:var(--kui-success);box-shadow:0 0 6px var(--kui-success)}',
    'body.is-embedded .demo-nav{display:none!important}',
    'body.is-embedded .demo-bar__ops label{display:none!important}',
    'body.is-embedded .demo-bar__ops .demo-theme-label{display:none!important}'
  ].join('');

  function ready(fn) {
    if (d.readyState === 'loading') {
      d.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  ready(function () {
    var body = d.body;
    var root = d.documentElement;
    if (root) root.setAttribute('data-kui-embedded', 'true');
    if (!body) return;
    body.className = (body.className ? body.className + ' ' : '') + 'is-embedded';

    var style = d.createElement('style');
    style.type = 'text/css';
    if (style.appendChild) style.appendChild(d.createTextNode(CSS));
    (d.head || body).appendChild(style);

    /* 演示页导航：外层已有菜单，内层不再显示 */
    var navs = d.querySelectorAll ? d.querySelectorAll('.demo-nav') : [];
    for (var i = 0; i < navs.length; i++) navs[i].style.display = 'none';

    /* 主题下拉：主框架统一下发主题，内层选择器隐藏（有的页面外面套了 label） */
    var sel = d.getElementById ? d.getElementById('kuiThemeSwitch') : null;
    if (sel) {
      var label = sel.parentNode;
      while (label && label.nodeName && label.nodeName.toUpperCase() !== 'LABEL') label = label.parentNode;
      if (label && label.style) label.style.display = 'none';
      else if (sel.style) sel.style.display = 'none';
    }

    /* 说明徽标：让验收者一眼看出「这里被嵌入所以少了一套壳」 */
    var ops = d.querySelector ? d.querySelector('.demo-bar__ops') : null;
    if (ops && !d.getElementById('kuiEmbeddedBadge')) {
      var badge = d.createElement('span');
      badge.id = 'kuiEmbeddedBadge';
      badge.className = 'demo-embedded-badge';
      badge.textContent = '已嵌入主应用 · 菜单/主题由外层接管';
      badge.title = '本页被主应用标签 iframe 嵌入，重复的外层壳已隐藏；单独打开可看完整演示。';
      ops.appendChild(badge);
    }
  });
})(window, document);

/*!
 * KurumiUI · shell · menu.js
 * 左侧菜单：品牌区 / 一级 + 二级树 / 分组 / 分隔线 / 徽标 / 图标 / 选中光条 /
 *          折叠态（68px，带 tooltip 与 hover flyout 子菜单）
 * 契约：docs/00-contract.md §8.1、§10、§11、§12、§16
 *
 * 注册 type：menu
 * node.props 见契约 §8.1；实例 API：
 *   el / props / setActive(id) / getActive() / toggle() / setCollapsed(b) /
 *   expand(id?) / collapse(id?) / setBadge(id, text) / setItems(items) /
 *   getItems() / setCollapsible(b) / destroy()
 * 事件：props.on.select(payload) / node.on.select(payload) / ctx.emit('select') /
 *       KUI.events.emit('menu:select', payload)
 */
(function (KUI) {
  'use strict';

  if (!KUI) { KUI = window.KUI = window.KUI || {}; }

  var hasOwn = Object.prototype.hasOwnProperty;

  /* ================= 防御式工具（core 缺失时仍可用） ================= */

  function safe(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
  }

  function deepMerge(base, patch) {
    var out = {}, key;
    for (key in base) {
      if (hasOwn.call(base, key)) { out[key] = base[key]; }
    }
    if (patch) {
      for (key in patch) {
        if (!hasOwn.call(patch, key)) { continue; }
        var pv = patch[key], bv = out[key];
        if (pv && typeof pv === 'object' && !Array.isArray(pv) &&
            bv && typeof bv === 'object' && !Array.isArray(bv)) {
          out[key] = deepMerge(bv, pv);
        } else {
          out[key] = pv;
        }
      }
    }
    return out;
  }

  function txt(key, fallback, vars) {
    var value = safe(function () { return KUI.text(key, fallback, vars); }, fallback);
    if (value === undefined || value === null || value === '') { return fallback; }
    return value;
  }

  function iconHtml(name, cls) {
    if (!name) { return ''; }
    var klass = cls || 'kui-icon';
    var html = safe(function () {
      // core/icons 提供 icons.get(name, opts) 返回完整 svg 标记；create 返回 DOM
      if (KUI.icons && typeof KUI.icons.get === 'function') {
        return KUI.icons.get(name, { 'class': klass, size: 16 });
      }
      return '';
    }, '');
    if (html && typeof html === 'string') { return html; }
    // 降级：图标系统尚未加载时直接引用 sprite symbol（core/icons 的 id 前缀为 kui-icon-）
    return '<svg class="' + klass + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<use href="#kui-icon-' + String(name).replace(/[^A-Za-z0-9_-]/g, '') + '"></use></svg>';
  }

  function el(tag, cls) {
    var node = document.createElement(tag);
    if (cls) { node.className = cls; }
    return node;
  }

  function elText(tag, cls, value) {
    var node = el(tag, cls);
    node.textContent = (value === undefined || value === null) ? '' : String(value);
    return node;
  }

  function iconBox(name, cls) {
    var box = el('span', cls || 'kui-menu__icon');
    var html = iconHtml(name);
    if (html) { box.innerHTML = html; }
    box.setAttribute('aria-hidden', 'true');
    return box;
  }

  function on(target, type, fn, opts) {
    if (target && typeof target.addEventListener === 'function') {
      target.addEventListener(type, fn, opts || false);
    }
  }

  function emit(name, payload) {
    safe(function () {
      if (KUI.events && typeof KUI.events.emit === 'function') { KUI.events.emit(name, payload); }
    });
  }

  function register(type, descriptor) {
    if (KUI.registry && typeof KUI.registry.register === 'function') {
      KUI.registry.register(type, descriptor);
      return;
    }
    // registry 尚未加载时暂存（正常情况下 core/registry.js 先于本文件加载）
    var pending = KUI.__pendingComponents || (KUI.__pendingComponents = []);
    pending.push({ type: type, descriptor: descriptor });
  }

  function hasChildren(item) {
    return !!(item && item.children && item.children.length);
  }

  /* ================= 默认配置（契约 §8.1） ================= */

  var DEFAULTS = {
    brand: { title: '', subtitle: '', logoIcon: 'clock', href: '' },
    collapsed: false,
    collapsible: true,
    width: 252,
    collapsedWidth: 68,
    defaultActive: '',
    items: [],
    footer: null,
    accordion: true,      // 一级菜单互斥展开
    flyout: true,         // 折叠态 hover 浮层
    tooltip: true,        // 折叠态原生 tooltip
    onSelect: null,
    on: null
  };

  // app-shell 会在挂载前把 props 合并进节点（Lead 约定），因此扁平字段与 node.props 都要读
  var FLAT_KEYS = ['brand', 'collapsed', 'collapsible', 'width', 'collapsedWidth',
    'defaultActive', 'items', 'footer', 'accordion', 'flyout', 'tooltip', 'onSelect'];

  function resolveProps(node) {
    var nodeProps = (node && node.props) || {};
    var merged = deepMerge(DEFAULTS, nodeProps);
    if (!node) { return merged; }
    var i, key;
    for (i = 0; i < FLAT_KEYS.length; i++) {
      key = FLAT_KEYS[i];
      if (node[key] === undefined) { continue; }
      if ((key === 'brand' || key === 'footer') && merged[key] && typeof merged[key] === 'object') {
        merged[key] = deepMerge(merged[key], node[key]);
      } else {
        merged[key] = node[key];
      }
    }
    return merged;
  }

  /* ================= 菜单实例 ================= */

  function createMenu(root, props, node, ctx) {
    var state = {
      active: props.defaultActive || '',
      collapsed: !!props.collapsed,
      items: props.items || [],
      itemData: {},
      itemEls: {},
      flyout: null,
      flyoutTimer: null,
      openMap: {},
      destroyed: false
    };

    var brandEl, textEl, collapseBtn, scrollEl, listHost, footerEl;
    var avatarApi = null;

    /* v1.2.0：品牌头像配置合并（未显式给的字段用品牌图标兜底） */
    function mergeAvatarCfg(avatarCfg) {
      var cfg = {};
      var key;
      for (key in avatarCfg) {
        if (hasOwn.call(avatarCfg, key)) { cfg[key] = avatarCfg[key]; }
      }
      if (cfg.fallbackIcon === undefined) { cfg.fallbackIcon = props.brand.logoIcon || 'clock'; }
      if (cfg.alt === undefined) { cfg.alt = props.brand.title || txt('app.title', 'KurumiUI'); }
      return cfg;
    }
    var scrollTop = 0;
    var handlers = {};

    /* ---------- 事件派发：实例 on / props.on / node.on / ctx.emit / 全局总线 ---------- */
    function fire(name, payload) {
      var list = handlers[name];
      if (list) {
        for (var i = 0; i < list.length; i++) {
          (function (fn) {
            safe(function () { fn.call(api, payload); });
          })(list[i]);
        }
      }
      if (props.on && typeof props.on[name] === 'function') {
        safe(function () { props.on[name](payload); });
      }
      var nodeOn = node && node.on;
      if (nodeOn && typeof nodeOn[name] === 'function') {
        safe(function () { nodeOn[name](payload); });
      }
      if (ctx && typeof ctx.emit === 'function') {
        safe(function () { ctx.emit(name, payload); });
      }
      emit('menu:' + name, payload);
    }

    /* ---------- 品牌区 ---------- */
    function buildBrand() {
      var brand = el('div', 'kui-menu__brand');
      var logo = el('div', 'kui-menu__logo');

      /* v1.2.0：头像支持（配置驱动）。
       *   brand.avatar 存在时用 KUI.avatar 渲染头像：
       *     - avatar.url 为空 → 回退品牌图标（不画齿轮框）
       *     - avatar.url 有值 → 显示自定义头像 + 刻刻帝时间齿轮框（颜色随主题 token）
       *     - avatar.editable 为 true → 运行时可点击更换头像
       *   未配置 brand.avatar 时保持旧行为（纯图标），确保向后兼容。 */
      var avatarCfg = props.brand && props.brand.avatar;
      if (avatarCfg && KUI.avatar && typeof KUI.avatar.create === 'function') {
        logo.classList.add('kui-menu__logo--avatar');
        avatarApi = KUI.avatar.create(logo, mergeAvatarCfg(avatarCfg), ctx);
      } else {
        logo.appendChild(iconBox(props.brand.logoIcon || 'clock', 'kui-menu__logo-icon'));
        /* v1.3.8：brand.logoText 的真实读取点（图标下的文字徽记，折叠态隐藏） */
        if (props.brand.logoText) {
          logo.appendChild(elText('span', 'kui-menu__logo-text', props.brand.logoText));
        }
      }
      brand.appendChild(logo);

      textEl = el('div', 'kui-menu__brand-text');
      var title = elText('div', 'kui-menu__brand-title', props.brand.title || txt('app.title', 'KurumiUI'));
      textEl.appendChild(title);
      if (props.brand.subtitle) {
        textEl.appendChild(elText('div', 'kui-menu__brand-subtitle', props.brand.subtitle));
      }
      if (props.brand.href) {
        on(title, 'click', function () { window.location.href = props.brand.href; });
        title.classList.add('is-link');
      }
      brand.appendChild(textEl);

      if (props.collapsible) {
        collapseBtn = el('button', 'kui-menu__collapse');
        collapseBtn.setAttribute('type', 'button');
        collapseBtn.setAttribute('aria-expanded', state.collapsed ? 'false' : 'true');
        collapseBtn.title = state.collapsed
          ? txt('menu.expand', '展开菜单')
          : txt('menu.collapse', '折叠菜单');
        var icon = el('span', 'kui-menu__collapse-icon');
        icon.innerHTML = iconHtml(state.collapsed ? 'expand' : 'collapse');
        collapseBtn.appendChild(icon);
        on(collapseBtn, 'click', function (ev) {
          if (ev && ev.preventDefault) { ev.preventDefault(); }
          toggle();
        });
        brand.appendChild(collapseBtn);
      }

      brandEl = brand;
      return brand;
    }

    /* ---------- 折叠按钮图标刷新 ---------- */
    function refreshCollapseButton() {
      if (!collapseBtn) { return; }
      var icon = collapseBtn.querySelector ? collapseBtn.querySelector('.kui-menu__collapse-icon') : null;
      var html = iconHtml(state.collapsed ? 'expand' : 'collapse');
      if (icon) { icon.innerHTML = html; }
      collapseBtn.title = state.collapsed
        ? txt('menu.expand', '展开菜单')
        : txt('menu.collapse', '折叠菜单');
      collapseBtn.setAttribute('aria-expanded', state.collapsed ? 'false' : 'true');
    }

    /* ---------- 菜单树 ---------- */
    function renderList(items, sub) {
      var ul = el('ul', sub ? 'kui-menu__sub' : 'kui-menu__list');
      ul.setAttribute('role', sub ? 'menu' : 'menubar');
      var i;
      for (i = 0; i < items.length; i++) {
        var item = items[i] || {};
        var type = item.type || 'item';
        if (type === 'divider') {
          var divider = el('li', 'kui-menu__divider');
          divider.setAttribute('role', 'separator');
          ul.appendChild(divider);
          continue;
        }
        if (type === 'group') {
          ul.appendChild(renderGroup(item, sub));
          continue;
        }
        ul.appendChild(renderItem(item, sub));
      }
      return ul;
    }

    function renderGroup(item, sub) {
      var li = el('li', 'kui-menu__group');
      var head = elText('div', 'kui-menu__group-title', item.label || '');
      li.appendChild(head);
      li.appendChild(renderList(item.children || [], true));
      return li;
    }

    function renderItem(item, sub) {
      var id = item.id || ('menu-item-' + Math.random().toString(36).slice(2, 8));
      item.id = id;

      var li = el('li', 'kui-menu__item');
      li.setAttribute('data-menu-id', id);
      li.setAttribute('role', 'none');
      li.__kuiItem = item;
      if (sub) { li.classList.add('is-sub-item'); }
      if (item.disabled) { li.classList.add('is-disabled'); }
      if (item.id && state.active === item.id) { li.classList.add('is-active'); }
      if (hasChildren(item)) { li.classList.add('has-children'); }

      var link = el('a', 'kui-menu__link');
      link.setAttribute('role', 'menuitem');
      link.setAttribute('tabindex', '0');
      link.setAttribute('aria-disabled', item.disabled ? 'true' : 'false');
      if (item.disabled) { link.classList.add('is-disabled'); }

      link.appendChild(iconBox(item.icon || (sub ? 'chevron-right' : 'list'), 'kui-menu__icon'));
      link.appendChild(elText('span', 'kui-menu__label', item.label || ''));

      if (item.badge !== undefined && item.badge !== null && item.badge !== '') {
        var badgeEl = elText('span', 'kui-menu__badge', item.badge);
        if (item.badgeType) { badgeEl.classList.add('kui-menu__badge--' + item.badgeType); }
        link.appendChild(badgeEl);
      }
      if (hasChildren(item)) {
        var arrow = el('span', 'kui-menu__arrow');
        arrow.innerHTML = iconHtml('chevron-down');
        link.appendChild(arrow);
      }
      if (state.collapsed && props.tooltip) {
        link.title = item.tooltip || item.label || '';
      }

      li.appendChild(link);

      if (hasChildren(item)) {
        var subUl = renderList(item.children, true);
        subUl.setAttribute('role', 'menu');
        // 建立父链，供 expand / active 展开父级使用
        var subItems = subUl.children || [];
        var si;
        for (si = 0; si < subItems.length; si++) {
          if (subItems[si] && subItems[si].__kuiItem) {
            subItems[si].__kuiParentLi = li;
          }
        }
        li.appendChild(subUl);
      }

      on(link, 'click', function (ev) {
        if (ev && ev.preventDefault) { ev.preventDefault(); }
        activateItem(item, li);
      });
      on(link, 'keydown', function (ev) {
        var key = ev && ev.key;
        if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
          if (ev.preventDefault) { ev.preventDefault(); }
          activateItem(item, li);
        } else if (key === 'ArrowRight' && hasChildren(item) && !state.collapsed) {
          if (ev.preventDefault) { ev.preventDefault(); }
          openSub(li, item);
        } else if (key === 'ArrowLeft' && hasChildren(item)) {
          if (ev.preventDefault) { ev.preventDefault(); }
          closeSub(li);
        } else if (key === 'ArrowDown' || key === 'ArrowUp') {
          if (ev.preventDefault) { ev.preventDefault(); }
          moveFocus(link, key === 'ArrowDown' ? 1 : -1);
        }
      });

      // 折叠态 hover flyout 统一在 rebuildList() 之后由 bindFlyoutOnHover() 绑定，避免重复监听
      state.itemData[id] = item;
      state.itemEls[id] = li;
      return li;
    }

    function moveFocus(currentLink, dir) {
      var links = scrollEl && scrollEl.querySelectorAll ? scrollEl.querySelectorAll('.kui-menu__link') : [];
      var i, index = -1;
      for (i = 0; i < links.length; i++) {
        if (links[i] === currentLink) { index = i; break; }
      }
      if (index < 0) { return; }
      var next = links[index + dir];
      if (next && typeof next.focus === 'function') { next.focus(); }
    }

    /* ---------- 子菜单展开 / 收起 ---------- */
    function openSub(li, item) {
      if (!li) { return; }
      if (props.accordion && li.parentNode && li.parentNode.children) {
        var siblings = li.parentNode.children;
        var i;
        for (i = 0; i < siblings.length; i++) {
          if (siblings[i] !== li && siblings[i].classList) {
            siblings[i].classList.remove('is-open');
          }
        }
      }
      li.classList.add('is-open');
      state.openMap[item.id] = true;
    }

    function closeSub(li) {
      if (!li) { return; }
      li.classList.remove('is-open');
      var item = li.__kuiItem;
      if (item) { state.openMap[item.id] = false; }
    }

    function toggleSub(li, item) {
      if (li.classList.contains('is-open')) { closeSub(li); }
      else { openSub(li, item); }
    }

    /* ---------- 折叠态 flyout ---------- */
    function hideFlyoutNow() {
      if (state.flyoutTimer) {
        clearTimeout(state.flyoutTimer);
        state.flyoutTimer = null;
      }
      if (state.flyout && state.flyout.parentNode) {
        state.flyout.parentNode.removeChild(state.flyout);
      }
      state.flyout = null;
    }

    function scheduleHideFlyout() {
      if (state.flyoutTimer) { clearTimeout(state.flyoutTimer); }
      state.flyoutTimer = setTimeout(hideFlyoutNow, 180);
    }

    function cancelHideFlyout() {
      if (state.flyoutTimer) {
        clearTimeout(state.flyoutTimer);
        state.flyoutTimer = null;
      }
    }

    function showFlyout(li, item) {
      if (!props.flyout || !hasChildren(item)) { return; }
      cancelHideFlyout();
      if (state.flyout && state.flyout.__kuiFor === item.id) { return; }
      hideFlyoutNow();

      var box = el('div', 'kui-menu__flyout');
      box.setAttribute('role', 'menu');
      box.__kuiFor = item.id;
      box.appendChild(elText('div', 'kui-menu__flyout-title', item.label || ''));

      var list = el('ul', 'kui-menu__flyout-list');
      var children = item.children || [];
      var i;
      for (i = 0; i < children.length; i++) {
        (function (child) {
          if ((child.type || 'item') === 'divider') {
            list.appendChild(el('li', 'kui-menu__flyout-divider'));
            return;
          }
          var row = el('li', 'kui-menu__flyout-item');
          if (child.disabled) { row.classList.add('is-disabled'); }
          if (child.id && child.id === state.active) { row.classList.add('is-active'); }
          row.appendChild(iconBox(child.icon || 'chevron-right', 'kui-menu__flyout-icon'));
          row.appendChild(elText('span', 'kui-menu__flyout-label', child.label || ''));
          if (child.badge !== undefined && child.badge !== null && child.badge !== '') {
            var childBadge = elText('span', 'kui-menu__badge', child.badge);
            if (child.badgeType) { childBadge.classList.add('kui-menu__badge--' + child.badgeType); }
            row.appendChild(childBadge);
          }
          on(row, 'click', function (ev) {
            if (ev && ev.stopPropagation) { ev.stopPropagation(); }
            activateItem(child, null);
            hideFlyoutNow();
          });
          list.appendChild(row);
        })(children[i]);
      }
      box.appendChild(list);

      // 定位：相对 root 的垂直位置
      var top = 0;
      var rect = safe(function () { return li.getBoundingClientRect(); }, null);
      var rootRect = safe(function () { return root.getBoundingClientRect(); }, null);
      if (rect && rootRect) {
        top = (rect.top - rootRect.top) + scrollTop;
      }
      box.style.top = Math.max(0, top) + 'px';
      root.appendChild(box);
      state.flyout = box;

      on(box, 'mouseenter', cancelHideFlyout);
      on(box, 'mouseleave', scheduleHideFlyout);
    }

    /* ---------- 激活 / 选中 ---------- */
    function resolveTab(item) {
      var target = item.target;
      if (target && typeof target === 'object' && target.tab) { return target.tab; }
      if (item.tab) { return item.tab; }
      return {
        id: item.id,
        title: item.label || '',
        url: item.url || '',
        icon: item.icon || '',
        pinned: !!item.pinned
      };
    }

    // core 统一动作分发（Lead 约定：ctx.action / KUI.actions.run）
    function runAction(action, ev) {
      if (!action) { return false; }
      if (ctx && typeof ctx.action === 'function') {
        var ran = safe(function () { ctx.action(action, ctx, ev); return true; }, false);
        if (ran) { return true; }
      }
      if (KUI.actions && typeof KUI.actions.run === 'function') {
        var ran2 = safe(function () { KUI.actions.run(action, ctx, ev); return true; }, false);
        if (ran2) { return true; }
      }
      emit('action', { action: action, ctx: ctx });
      return false;
    }

    function activateItem(item, li) {
      if (!item || item.disabled || state.destroyed) { return; }
      if (hasChildren(item)) {
        if (state.collapsed) {
          showFlyout(li || state.itemEls[item.id], item);
          return;
        }
        toggleSub(li || state.itemEls[item.id], item);
        return;
      }
      setActive(item.id);
      var tab = resolveTab(item);

      // 1) onSelect：Lead 约定回调签名为 onSelect(item, ctx)，同时兼容 props.on.select / node.on.select
      var selectCb = (node && node.onSelect) || props.onSelect;
      if (typeof selectCb === 'function') { safe(function () { selectCb(item, ctx); }); }
      if (props.on && typeof props.on.select === 'function') {
        safe(function () { props.on.select(item, ctx); });
      }
      var nodeOn = node && node.on;
      if (nodeOn && typeof nodeOn.select === 'function') {
        safe(function () { nodeOn.select(item, ctx); });
      }
      if (ctx && typeof ctx.emit === 'function') {
        safe(function () { ctx.emit('select', item); });
      }

      // 2) 统一动作分发：{tab:{...}} 由 core 动作语法糖转成 tab.open
      var target = item.target;
      if (target && typeof target === 'object') {
        runAction(target);
      } else if (target === 'blank' && item.url && typeof window.open === 'function') {
        safe(function () { window.open(item.url, '_blank'); });
      }

      emit('menu:select', {
        id: item.id,
        item: item,
        tab: tab,
        url: item.url || tab.url || '',
        target: target
      });
    }

    function setActive(id) {
      state.active = id || '';
      applyActive();
      emit('menu:active', { id: state.active });
      return api;
    }

    function getActive() { return state.active; }

    function applyActive() {
      var id;
      for (id in state.itemEls) {
        if (hasOwn.call(state.itemEls, id) && state.itemEls[id]) {
          state.itemEls[id].classList.remove('is-active');
        }
      }
      if (!state.active) { return; }
      var activeEl = state.itemEls[state.active];
      if (!activeEl) { return; }
      activeEl.classList.add('is-active');
      // 展开父级链
      var parent = activeEl.__kuiParentLi;
      var guard = 0;
      while (parent && guard < 8) {
        parent.classList.add('is-open');
        parent = parent.__kuiParentLi;
        guard++;
      }
    }

    /* ---------- 折叠 ---------- */
    function setCollapsed(flag) {
      state.collapsed = !!flag;
      if (state.collapsed) {
        if (root.classList) { root.classList.add('is-collapsed'); }
      } else {
        if (root.classList) { root.classList.remove('is-collapsed'); }
        hideFlyoutNow();
      }
      refreshCollapseButton();
      // 折叠态刷新 tooltip / flyout 绑定：重建列表最省事
      rebuildList();
      // v1.1.3：必须走 fire()（实例监听 handlers / props.on / ctx.emit / 全局 menu:collapsed 一次全发），
      // 否则 app-shell 通过 menuApi.on('collapsed') 注册的监听收不到 → 菜单收起但整壳 grid 列宽不变，
      // 表现即「只有左侧菜单收起，右侧页面区域没有同步撑开」。
      fire('collapsed', { collapsed: state.collapsed });
      return api;
    }

    function toggle() {
      return setCollapsed(!state.collapsed);
    }

    /* ---------- 徽标 ---------- */
    var BADGE_TYPES = ['accent', 'gold', 'success', 'warning', 'danger'];

    function setBadge(id, value, badgeType) {
      var item = state.itemData[id];
      if (item) {
        item.badge = value;
        if (badgeType !== undefined) { item.badgeType = badgeType; }
      }
      var li = state.itemEls[id];
      if (!li) { return api; }
      var link = li.querySelector ? li.querySelector('.kui-menu__link') : null;
      if (!link) { return api; }
      var badge = link.querySelector ? link.querySelector('.kui-menu__badge') : null;
      var empty = value === undefined || value === null || value === '';
      if (!badge) {
        if (empty) { return api; }
        badge = el('span', 'kui-menu__badge');
        var arrow = link.querySelector ? link.querySelector('.kui-menu__arrow') : null;
        if (arrow && link.insertBefore) { link.insertBefore(badge, arrow); }
        else { link.appendChild(badge); }
      }
      badge.textContent = empty ? '' : String(value);
      if (empty) { badge.classList.add('is-empty'); }
      else { badge.classList.remove('is-empty'); }
      // 同步徽标类型 class（Lead 约定 badgeType: accent|gold|success|warning|danger）
      var i;
      for (i = 0; i < BADGE_TYPES.length; i++) {
        badge.classList.remove('kui-menu__badge--' + BADGE_TYPES[i]);
      }
      var type = badgeType !== undefined ? badgeType : (item && item.badgeType) || '';
      if (type) { badge.classList.add('kui-menu__badge--' + type); }
      return api;
    }

    /* ---------- 重建 ---------- */
    function rebuildList() {
      state.itemEls = {};
      state.itemData = {};
      var host = listHost;
      while (host.firstChild) { host.removeChild(host.firstChild); }
      host.appendChild(renderList(state.items, false));
      bindFlyoutOnHover();
      applyActive();
    }

    function bindFlyoutOnHover() {
      if (!state.collapsed || !props.flyout) { return; }
      var id;
      for (id in state.itemEls) {
        if (!hasOwn.call(state.itemEls, id)) { continue; }
        (function (li, item) {
          if (!hasChildren(item)) { return; }
          on(li, 'mouseenter', function () { showFlyout(li, item); });
          on(li, 'mouseleave', function () { scheduleHideFlyout(); });
          var link = li.querySelector ? li.querySelector('.kui-menu__link') : null;
          if (link && props.tooltip) { link.title = item.tooltip || item.label || ''; }
        })(state.itemEls[id], state.itemData[id]);
      }
    }

    function setItems(items) {
      state.items = items || [];
      rebuildList();
      emit('menu:items', { items: state.items });
      return api;
    }

    function getItems() { return state.items; }

    function setCollapsible(flag) {
      props.collapsible = !!flag;
      if (collapseBtn && collapseBtn.parentNode) {
        collapseBtn.parentNode.removeChild(collapseBtn);
        collapseBtn = null;
      }
      if (!props.collapsible) {
        state.collapsed = false;
        if (root.classList) { root.classList.remove('is-collapsed'); }
      }
      return api;
    }

    /* ---------- 组装 ---------- */
    function build() {
      root.setAttribute('data-kui-menu', '');
      root.setAttribute('role', 'navigation');
      root.style.setProperty('--kui-menu-w', props.width + 'px');
      root.style.setProperty('--kui-menu-w-collapsed', props.collapsedWidth + 'px');
      if (state.collapsed && root.classList) { root.classList.add('is-collapsed'); }

      root.appendChild(buildBrand());

      scrollEl = el('div', 'kui-menu__scroll');
      listHost = el('div', 'kui-menu__list-host');
      scrollEl.appendChild(listHost);
      root.appendChild(scrollEl);
      on(scrollEl, 'scroll', function () {
        scrollTop = scrollEl.scrollTop || 0;
        hideFlyoutNow();
      });

      rebuildList();

      if (props.footer) {
        footerEl = el('div', 'kui-menu__footer');
        if (props.footer.title) {
          footerEl.appendChild(elText('div', 'kui-menu__footer-title', props.footer.title));
        }
        if (props.footer.subtitle) {
          footerEl.appendChild(elText('div', 'kui-menu__footer-subtitle', props.footer.subtitle));
        }
        if (props.footer.version) {
          footerEl.appendChild(elText('div', 'kui-menu__footer-version', props.footer.version));
        }
        if (props.footer.copyright) {
          footerEl.appendChild(elText('div', 'kui-menu__footer-copyright', props.footer.copyright));
        }
        if (props.footer.actions && props.footer.actions.length) {
          var actions = el('div', 'kui-menu__footer-actions');
          var i;
          for (i = 0; i < props.footer.actions.length; i++) {
            actions.appendChild(renderFooterAction(props.footer.actions[i]));
          }
          footerEl.appendChild(actions);
        }
        root.appendChild(footerEl);
      }

      // 折叠态点击外部关闭 flyout
      on(document, 'mousedown', function (ev) {
        if (!state.flyout) { return; }
        var target = ev && ev.target;
        if (state.flyout === target) { return; }
        if (safe(function () { return state.flyout.contains(target); }, false)) { return; }
        if (safe(function () { return root.contains(target); }, false)) { return; }
        hideFlyoutNow();
      });
      on(window, 'resize', hideFlyoutNow);
    }

    function renderFooterAction(action) {
      if (action === undefined || action === null) { return el('span'); }
      if (typeof KUI.renderNode === 'function') {
        var rendered = safe(function () { return KUI.renderNode(action, ctx); }, null);
        if (rendered) { return rendered; }
      }
      if (typeof action === 'string') {
        return elText('button', 'kui-menu__footer-action', action);
      }
      var btn = el('button', 'kui-menu__footer-action');
      btn.setAttribute('type', 'button');
      var name = action.text || action.label || '';
      if (action.icon) { btn.appendChild(iconBox(action.icon, 'kui-menu__footer-action-icon')); }
      if (name) { btn.appendChild(document.createTextNode(name)); }
      if (action.on && action.on.click && typeof action.on.click === 'function') {
        on(btn, 'click', function () { action.on.click({ action: action, instance: api }); });
      }
      return btn;
    }

    var api = {
      el: root,
      node: node,
      ctx: ctx,
      type: 'menu',
      props: props,
      on: function (name, fn) {
        if (typeof fn === 'function') {
          if (!handlers[name]) { handlers[name] = []; }
          handlers[name].push(fn);
        }
        return api;
      },
      off: function (name, fn) {
        var list = handlers[name];
        if (!list) { return api; }
        if (!fn) { handlers[name] = []; return api; }
        for (var i = list.length - 1; i >= 0; i--) {
          if (list[i] === fn) { list.splice(i, 1); }
        }
        return api;
      },
      emit: function (name, payload) { fire(name, payload); return api; },
      setActive: setActive,
      getActive: getActive,
      toggle: toggle,
      setCollapsed: setCollapsed,
      expand: function (id) {
        if (id === undefined || id === null) { return setCollapsed(false); }
        var item = state.itemData[id];
        var li = state.itemEls[id];
        if (item && li) { openSub(li, item); }
        return api;
      },
      collapse: function (id) {
        if (id === undefined || id === null) { return setCollapsed(true); }
        var li = state.itemEls[id];
        if (li) { closeSub(li); }
        return api;
      },
      setBadge: setBadge,
      setItems: setItems,
      getItems: getItems,
      setCollapsible: setCollapsible,
      isCollapsed: function () { return state.collapsed; },
      /* v1.2.0：品牌头像控制（配置驱动 + 运行时切换） */
      setAvatar: function (url, extra) {
        if (avatarApi && typeof avatarApi.setUrl === 'function') {
          avatarApi.setUrl(url, extra || {});
        } else if (props.brand) {
          props.brand.avatar = props.brand.avatar || {};
          props.brand.avatar.url = url;
          if (brandEl && brandEl.parentNode) {
            // 之前没有头像配置：重建品牌区以接入头像
            var next = buildBrand();
            brandEl.parentNode.replaceChild(next, brandEl);
          }
        }
        return api;
      },
      getAvatar: function () {
        return avatarApi ? avatarApi.getUrl() : ((props.brand && props.brand.avatar && props.brand.avatar.url) || '');
      },
      /** 打开换头像弹窗（即便当前 editable 未开，也可由 API 主动触发） */
      openAvatarPicker: function () {
        if (avatarApi && typeof avatarApi.openPicker === 'function') { return avatarApi.openPicker(); }
        return null;
      },
      destroy: function () {
        state.destroyed = true;
        hideFlyoutNow();
        if (root.parentNode) { root.parentNode.removeChild(root); }
        emit('menu:destroy', { el: root });
      }
    };

    build();
    fire('ready', { el: root });
    return api;
  }

  /* ================= 组件注册（契约 §6） ================= */

  register('menu', {
    category: 'shell',
    defaults: DEFAULTS,
    render: function (node, ctx) {
      var props = resolveProps(node);
      var root = el('aside', 'kui-menu');
      var inst = createMenu(root, props, node, ctx);
      root.__kuiMenu = inst;
      return root;
    },
    api: function (elm) {
      return elm && elm.__kuiMenu ? elm.__kuiMenu : {};
    }
  });

  /* ================= 静态入口（app-shell 用：KUI.menu.create） ================= */

  KUI.menu = {
    create: function (host, props, ctx) {
      var merged = deepMerge(DEFAULTS, props || {});
      var root = el('aside', 'kui-menu');
      var inst = createMenu(root, merged, null, ctx);
      root.__kuiMenu = inst;
      if (host && typeof host.appendChild === 'function') { host.appendChild(root); }
      return inst;
    },
    defaults: DEFAULTS
  };

})(window.KUI);

# src/styles/themes/ · 主题目录说明

本目录目前**没有**主题 CSS 文件，这是设计而不是遗漏。

## 为什么没有「每套主题一个 css」

契约 §13 规定：**主题只能由 tokens + art 配置表达**。一套主题的全部外观差异都在
[`src/themes.json`](../../themes.json) 里：

- `themes[].tokens` → `core/theme.js` 写成 `<html>` 上的 `--kui-*` CSS 变量；
- `themes[].art` → `core/theme-art.js` 渲染成装饰层 DOM；
- 所有控件/组件样式只引用 `var(--kui-*)`，不认识任何主题名。

因此新增/调整主题**不需要也不允许**在本目录新增主题专属样式：

```css
/* ❌ 禁止：新增主题必须改 CSS，违反「改 JSON 不改代码」 */
.theme-sakura .kui-btn { … }
[data-kui-theme="abyss"] .kui-panel { … }
```

## 这个目录可以放什么

- 本文档（维护说明）；
- 与主题数据无关、也不属于基础 reset 的**结构性补充 CSS**（例如未来若需要独立的
  装饰层片段文件，可拆分自 `base.css` 第 9 节，但必须保持「只画 kind、不认识主题」）；
- 任何文件都不得引入图片、字体文件、CDN 或网络地址（零外部资源约束）。

新增的补充 CSS 需要同时被 `index.html`（或其他页面）在 `base.css` 之后引入，
并遵守加载顺序：`base.css` → 本目录补充 → `controls.css` → `components.css`。

## 相关文档与入口

| 内容 | 位置 |
| --- | --- |
| 6 套主题定位、94 个契约 token 全表（含 `--kui-on-*`）、art 每种 layer 参数 | [`docs/04-theme.md`](../../docs/04-theme.md) |
| token 默认值（kurumi 兜底）与装饰层 CSS | [`src/styles/base.css`](../base.css) |
| 主题数据 | [`src/themes.json`](../../themes.json) |
| 主题管理器 API（`KUI.theme`） | `src/core/theme.js` |
| 装饰层渲染器（`KUI.themeArt`） | `src/core/theme-art.js` |

新增主题的完整步骤见 `docs/04-theme.md` 第 6 节；改完 `themes.json` 后按第 6.3 / 8 节自测（JSON 解析、
`tools/check-assets.js`、`tools/screenshot.js` 六套主题截图）。

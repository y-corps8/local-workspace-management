# `public/styles.css`

Design tokens and layout for the dashboard. No preprocessor. Theme is `html[data-theme="light"]` or the default dark `:root` — not `prefers-color-scheme`.

## Imports / used by

**Used by:** [index.html](index.md). [app.js](app.md) sets `document.documentElement.dataset.theme` and `--console-height` on `.layout`.

## Exports

None (CSS custom properties).

## How it works

`:root` defines `--bg`, `--surface`, `--accent` (`#d4a054`), `--done` / `--fail`, `--console`, `--console-height` (default `36vh`), and fonts.

Light theme overrides page chrome only. `.log-section` re-declares dark `--accent` / `--console` so the dock stays a terminal in both themes. `html[data-theme="light"] .log-section` keeps that dark chrome.

Form controls use `--accent` (not the OS default blue). Checkboxes and running buttons follow the same token.

`.layout` is a column: topbar, `.workspace-main` (scroll), console dock. Console height is `flex: 0 0 var(--console-height)`. `.log-section.is-collapsed` hides tabs / log / toolbar; the resize handle is disabled while collapsed.

Cards: max three per row, `is-running` left accent, `is-missing-path` banner. Drag outline uses `--accent`.

## Tests

None.

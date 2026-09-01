# `public/styles.css`

Design tokens and layout for the dashboard. No preprocessor. Theme is `html[data-theme="light"]` or the default dark `:root` — not `prefers-color-scheme`.

## Imports / used by

**Used by:** [index.html](index.md). [app.js](app.md) sets `document.documentElement.dataset.theme` and `--console-height` on `.layout`.

## Exports

None (CSS custom properties).

## How it works

`:root` defines `--bg`, `--surface`, `--accent` (`#d4a054`), `--done` / `--fail` / `--pending`, `--console`, `--console-height` (default `36vh`), and fonts.

Light theme overrides page chrome only. `.log-section` re-declares dark `--accent` / `--console` so the dock stays a terminal in both themes. `html[data-theme="light"] .log-section` keeps that dark chrome.

Form controls use `--accent` (not the OS default blue). Checkboxes, radios, and running buttons follow the same token.

`.layout` is a column: topbar, `.workspace-main` (scroll), console dock. Console height is `flex: 0 0 var(--console-height)`. `.log-section.is-collapsed` hides tabs / log / toolbar / filter / **Stop all**; the resize handle is disabled while collapsed. `#log-summary` is muted ellipsis text on the collapsed title row. `.log-section.has-running .log-live` stays `--pending`. `.log-panel` / log lines are `user-select: text`; `.log-time` is `user-select: none`.

Cards: three columns (two below 1100px, one below 800px). Leftover cells do not stretch. `is-running` left gold inset, `is-missing-path` banner. Drag outline and health `is-flash` use `--accent`. `.project-git` is a muted mono line under the title. `.chip-idle` is outline + muted (not fail red). Health dots: `.dot-running` gold, `.dot-port` green, `.dot-idle` muted.

Settings is `#setup-panel.setup-page` in `.workspace-main`. `.layout.is-settings` hides the topbar, Console, last-test section, and project cards so Settings is the only page.

Health pills wrap in the top bar. `.health-pill` is a reset `<button>` (not `.btn`). Command groups use a static `.cmd-group-label` plus a `.cmd-row` of every button.

`:focus-visible` on buttons, icon buttons, health pills, card menus, drag handles, and job tab labels uses a 2px `--accent` ring. `.hover-tip` shows on `:hover` and `:focus-within`. The last-test donut is a solid `background: var(--ring)` with a radial mask; the running spinner is still a conic gradient. `prefers-reduced-motion: reduce` disables the last-test ring spin and refresh spinner.

## Tests

None.

# `public/index.html`

Single-page shell. No bundler — loads `./styles.css`, classic `./theme-boot.js` in `<head>`, then `<script type="module" src="./app.js">` at the end of `<body>`. Theme boot is **not** `type="module"` so CSP can stay `script-src 'self'` with no `unsafe-inline`.

Served as `/` by [overview-http.mjs](../src/http/overview-http.md) (`STATIC_ROOT`). How to use the dashboard: [User guide](../../user-guide.md).

## Imports / used by

**Loads:** [theme-boot.js](theme-boot.md), [styles.css](styles.md), [app.js](app.md) (which loads [js/](js/argv.md)), [manifest.webmanifest](manifest.md), [assets](assets.md)

**Used by:** the browser / native WebView. [dom.js](js/dom.md) binds by element id.

## Exports

None (HTML).

## How it works

DOM regions map 1:1 to `els` in [dom.js](js/dom.md):

| Region | Ids |
|--------|-----|
| Top bar | `#health-strip`, `#health-checked`, `#edit-setup`, `#health-refresh` |
| Last tests | `#test-overview`, `#test-grid` (hidden unless `showTestOverview`) |
| Projects | `#project-grid`, `#projects-empty`, `#add-project`, `#add-project-empty` |
| Console | `#log-resize`, `#log-filter`, `#job-tabs`, `#log-panel`, `#log-prompt-overlay`, `#log-toolbar` |
| Confirm | `#confirm-modal` — destructive commands (`window.confirm` is not used) |
| Settings sheet | `#setup-panel` — list + add/edit form |

The console section starts with `is-collapsed` in markup; [console.js](js/console.md) applies the stored preference after status loads.

`#setup-test-kind-field` is in the HTML but hidden — Probe still sets `testKind` internally. Do not show that select on the form.

## Tests

None for the HTML shell.

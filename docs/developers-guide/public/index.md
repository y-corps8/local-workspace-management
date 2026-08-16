# `public/index.html`

Single-page shell. No bundler — loads `./styles.css` and `./app.js` from `public/`. An inline script in `<head>` reads `localStorage` key `overview.theme` before paint so the first frame matches Light / Dark.

Served as `/` by [server.mjs](../src/server.md) (`STATIC_ROOT`). How to use the dashboard: [User guide](../../user-guide.md).

## Imports / used by

**Loads:** [styles.css](styles.md), [app.js](app.md), [manifest.webmanifest](manifest.md), [assets](assets.md)

**Used by:** the browser / native WebView. [app.js](app.md) binds by element id.

## Exports

None (HTML).

## How it works

DOM regions map 1:1 to `app.js` refs:

| Region | Ids |
|--------|-----|
| Top bar | `#health-strip`, `#health-checked`, `#edit-setup`, `#health-refresh` |
| Last tests | `#test-overview`, `#test-grid` (hidden unless `showTestOverview`) |
| Projects | `#project-grid`, `#projects-empty`, `#add-project`, `#add-project-empty` |
| Console | `#log-resize`, `#log-filter`, `#job-tabs`, `#log-panel`, `#log-prompt-overlay`, `#log-toolbar` |
| Confirm | `#confirm-modal` — destructive commands (`window.confirm` is not used) |
| Settings sheet | `#setup-panel` — list + add/edit form |

The console section starts with `is-collapsed` in markup; `app.js` applies the stored preference after status loads.

`#setup-test-kind-field` is in the HTML but hidden — Probe still sets `testKind` internally. Do not show that select on the form.

## Tests

None for the HTML shell.

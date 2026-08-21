# `public/app.js`

ESM orchestrator for the dashboard. No bundler, no framework. The browser POSTs command **ids** only — never a shell string.

Loaded as `<script type="module" src="./app.js">` after the DOM. Classic [theme-boot.js](theme-boot.md) in `<head>` applies Light / Dark before first paint.

How to use the dashboard: [User guide](../../user-guide.md). HTTP/SSE contract: [overview-http.md](../src/http/overview-http.md).

## Imports / used by

**Imports:** [js/api.js](js/api.md), [js/console.js](js/console.md), [js/dom.js](js/dom.md), [js/hooks.js](js/hooks.md), [js/render.js](js/render.md), [js/setup.js](js/setup.md), [js/state.js](js/state.md), [js/theme.js](js/theme.md), [js/util.js](js/util.md)

**Used by:** the dashboard page. Registers [sw.js](sw.md) on load.

## Exports

None (side-effect module). Fills [hooks.js](js/hooks.md) after load so other modules can call `fetchStatus` / `runCommand` without import cycles.

## How it works

Assigns `hooks.*`, `applyTheme(readStoredTheme())`, `bindConsole()`, `bindSetup()`, then:

1. `fetchStatus()` → `render()`
2. If a job is still running, select the newest and `loadLogs`
3. `connectEvents()` — `EventSource("/api/events")`

Also owns: confirm modal, card ⋯ menu, dashboard drag-reorder (`PATCH /api/workspace/order`), Escape, health refresh, 15s `renderHealthChecked` timer (must not call `/api/status`).

| Event | Client |
|-------|--------|
| `status` | Replace `statusData`, `render()` (skipped while dragging) |
| `job` | Patch that job; refresh pills + chrome; `renderProjects` only if that repo’s running set changed |
| `health` | Patch `statusData.health` |
| `log` | Append if it is the selected, non-dismissed job (`lines` array or a single line). Skip when Console is collapsed |

`EventSource` reconnects on error.

## Tests

None for `app.js`. Argv identity: [argv.test.mjs](../../../test/config/argv.test.mjs). HTTP: [http.test.mjs](../../../test/http/http.test.mjs).

# `public/app.js`

All client logic. One file, no bundler, no framework. The browser POSTs command **ids** only — never a shell string.

How to use the dashboard: [User guide](../../user-guide.md). HTTP/SSE contract: [server.md](../src/server.md).

## Imports / used by

**Imports:** none (plain script after the DOM in [index.html](index.md))

**Used by:** the dashboard page. Registers [sw.js](sw.md) on load.

## Exports

None (browser globals inside the file).

## How it works

### Persistence (`localStorage`)

| Key | Meaning |
|-----|---------|
| `overview.theme` | `light` or `dark` — not in `workspace.json`. Default dark. Do not follow `prefers-color-scheme`. |
| `overview.consoleHeight` | Console height in px |
| `overview.consoleCollapsed` | Console collapsed |

First visit with no stored collapse starts collapsed when there are no jobs.

### Render

`render()` calls `renderHealth`, `renderHealthChecked`, optional `renderTests`, `renderProjects`, then `updateLogChrome`. Hidden projects (`hidden: true`) are omitted from cards, pills, and last-test cards via `dashboardRepos()`.

A 15s timer only rewrites the “Checked … ago” string from `generatedAt`. It must not call `/api/status`. Refresh is the icon next to Settings.

### Console

Job tabs, log stream (`replace` / `live` for progress), prompt overlay (`job.prompt`) with parsed buttons (`POST /api/stdin`), Expo actions (`POST /api/interact`). Resize: drag `#log-resize` or ArrowUp / ArrowDown. Filter is only on the title row while expanded.

### API helpers

| Function | Calls |
|----------|--------|
| `fetchStatus` | `GET /api/status` |
| `loadLogs` | `GET /api/logs/:id` |
| `runCommand` / `stopCommand` | `POST /api/run` / `/api/stop` `{ id }` |
| Restart / clear | `POST /api/restart`, `/api/logs/clear` |
| `sendJobStdin` | `POST /api/stdin` `{ id, text }` |
| `interactCommand` | `POST /api/interact` `{ id, action }` |
| `persistWorkspace` | `PUT /api/workspace` |
| Reorder | `PATCH /api/workspace/order` `{ ids }` |
| Browse / Probe | `POST /api/workspace/browse`, `/api/workspace/probe` |

`GET /api/health` and `PATCH /api/workspace/project` exist on the server; this file does not use them.

### Settings / Probe

`openSetup` loads `GET /api/workspace`. Probe merges discovered scripts with saved commands. `jestJson` always comes from the Probe row (same rule as [merge-command.mjs](../src/merge-command.md)). Custom argv uses local `parseArgvLine` / `formatArgvLine` — keep those in sync with [argv.mjs](../src/argv.md).

`SUGGESTED_GROUPS` is display order only. Any slug is valid.

### SSE / boot

1. `fetchStatus()` → `render()`
2. If a job is still running, select the newest and `loadLogs`
3. `connectEvents()` — `EventSource("/api/events")`

| Event | Client |
|-------|--------|
| `status` | Replace `statusData`, `render()` (skipped while dragging) |
| `job` | Patch that job; refresh pills + chrome |
| `health` | Patch `statusData.health` |
| `log` | Append if it is the selected job |

`EventSource` reconnects on error. Failed POSTs append a stderr-looking line unless `{ quiet: true }` (Expo actions).

## Tests

None for `public/app.js`. Server helpers it mirrors are covered under [test.md](../test.md).

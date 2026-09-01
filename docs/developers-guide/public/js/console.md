# `public/js/console.js`

Job tabs, log stream (`replace` / `live` for progress, including batched `{ lines }`), prompt overlay (`job.prompt`) with parsed buttons (`POST /api/stdin`), Expo actions (`POST /api/interact`). Resize: press `#log-resize`, drag, release to lock height; ArrowUp / ArrowDown on the focused handle. Filter is only on the title row while expanded; value is `overview.logFilter` (restored on load; clear the field to drop it). Collapsed Console skips log paints; expand calls `loadLogs`. While collapsed, `#log-summary` shows the newest running job (`Project · command`), `+ N more`, and ` · waiting` if any running job has a prompt. **Stop all** is hidden while collapsed. Log lines are applied in one animation frame. Dismissed jobs and a null selected tab do not auto-select from `log` events. **Copy all** (`#log-copy-all`) writes visible line `data-log-text` (filter-aware, no timestamps) via `navigator.clipboard.writeText` with an `execCommand("copy")` fallback; the button label flashes **Copied**. A `copy` listener on `#log-panel` (and `document`, when the selection is inside the panel) maps the range through log lines so `Ctrl` / `⌘` + `C` copies bodies without `.log-time`.

## Imports / used by

**Imports:** [api.js](api.md), [dom.js](dom.md), [hooks.js](hooks.md), [state.js](state.md), [util.js](util.md)

**Used by:** [app.js](../app.md) (`bindConsole`, `loadLogs`, `expandOutput`, …)

## Persistence (`localStorage`)

| Key | Meaning |
|-----|---------|
| `overview.consoleHeight` | Console height in px |
| `overview.consoleCollapsed` | Console collapsed |
| `overview.logFilter` | Log filter text |

First visit with no stored collapse starts collapsed when there are no jobs.

## Tests

None.

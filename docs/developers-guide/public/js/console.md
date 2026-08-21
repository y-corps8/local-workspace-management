# `public/js/console.js`

Job tabs, log stream (`replace` / `live` for progress, including batched `{ lines }`), prompt overlay (`job.prompt`) with parsed buttons (`POST /api/stdin`), Expo actions (`POST /api/interact`). Resize: press `#log-resize`, drag, release to lock height; ArrowUp / ArrowDown on the focused handle. Filter is only on the title row while expanded. Collapsed Console skips log paints; expand calls `loadLogs`. Log lines are applied in one animation frame. Dismissed jobs and a null selected tab do not auto-select from `log` events.

## Imports / used by

**Imports:** [api.js](api.md), [dom.js](dom.md), [hooks.js](hooks.md), [state.js](state.md), [util.js](util.md)

**Used by:** [app.js](../app.md) (`bindConsole`, `loadLogs`, `expandOutput`, …)

## Persistence (`localStorage`)

| Key | Meaning |
|-----|---------|
| `overview.consoleHeight` | Console height in px |
| `overview.consoleCollapsed` | Console collapsed |

First visit with no stored collapse starts collapsed when there are no jobs.

## Tests

None.

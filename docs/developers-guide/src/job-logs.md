# `src/job-logs.mjs`

Split stdout/stderr chunks into completed log lines. Handles `\n`, `\r\n`, and bare `\r` (in-place progress). Caps the incomplete buffer so Metro `\r` spam cannot grow without bound.

## Imports / used by

**Imports:** none from `src/`

**Used by:** [server.mjs](server.md) `appendLog()`

## Exports

| Name | Role |
|------|------|
| `MAX_PARTIAL` | `8192` |
| `splitLogChunk(partial, chunk)` | `{ events, partial }` — each event is `{ text, replace }` |

## How it works

A trailing `\r` stays in `partial` so a following `\n` can form `\r\n`. Bare `\r` with text emits `{ replace: true }`. If the buffer exceeds `2 × MAX_PARTIAL`, it is trimmed to the last `MAX_PARTIAL` characters.

The server broadcasts `replace` / `live` on SSE `log` so the UI can overwrite a progress row.

## Tests

[`test/job-logs.test.mjs`](../../../test/job-logs.test.mjs)

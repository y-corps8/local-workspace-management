# `src/jobs/job-logs.mjs`

Split stdout/stderr chunks into completed log lines, keep per-stream unfinished buffers, and coalesce SSE `log` frames so two chatty jobs cannot flood the UI.

## Imports / used by

**Imports:** none from `src/`

**Used by:** [jobs.mjs](jobs.md) `appendLog()`, live partials, and job finalize / clear / shutdown

## Exports

| Name | Role |
|------|------|
| `MAX_PARTIAL` | `8192` |
| `LOG_FLUSH_MS` | `80` — default batcher interval |
| `LIVE_PARTIAL_MIN_MS` | `100` — live `\r` rows coalesce in the queue; flush still sends at most one trailing live row |
| `splitLogChunk(partial, chunk)` | `{ events, partial }` — each event is `{ text, replace }` |
| `emptyStreamPartials()` | `{ stdout: "", stderr: "" }` |
| `applyStreamChunk(partials, stream, chunk)` | Split one stream without mixing stdout/stderr |
| `streamPartialText(partials)` | Combined unfinished text for prompt / Metro scans and `GET /api/logs` |
| `compactLogBatch(entries)` | One trailing live row; consecutive `replace` rows merge |
| `createLogBatcher({ intervalMs, liveMinMs, onFlush, now })` | `enqueue` / `flush` / `flushAll` / `clear` per job id |

## How it works

A trailing `\r` stays in `partial` so a following `\n` can form `\r\n`. Bare `\r` with text emits `{ replace: true }`. If the buffer exceeds `2 × MAX_PARTIAL`, it is trimmed to the last `MAX_PARTIAL` characters.

Stdout and stderr each have their own incomplete buffer. The batcher queues lines per job and flushes `{ id, lines }` about every 80ms (or immediately via `flush`). Tests call `enqueue` then `flush` with `intervalMs: 0` so no timers run.

## Tests

[`test/job-logs.test.mjs`](../../../../test/jobs/job-logs.test.mjs)

# `src/jobs/jobs.mjs`

In-memory jobs: start / stop / restart / stdin / logs / Expo interact. One running copy per command id. Spawn is `detached: true` so `kill(-pid)` stops npm / Maven grandchildren.

HTTP calls this via [overview-http.md](../http/overview-http.md). The CLI shutdown calls `runtime.shutdownJobs()`.

## Imports / used by

**Imports:** [commands.mjs](../config/commands.md), [env-file.mjs](env-file.md), [job-logs.mjs](job-logs.md), [metro-actions.mjs](metro-actions.md), [prompt.mjs](prompt.md), [test-results.mjs](test-results.md)

**Used by:** [overview-http.mjs](../http/overview-http.md), [jobs.test.mjs](../../../../test/jobs/jobs.test.mjs)

## Exports

| Name | Role |
|------|------|
| `MAX_LOG_LINES` / `MAX_FINISHED_JOBS` | 4000 lines, 50 finished jobs |
| `MAX_STDIN_CHARS` | 200 — matches `publicPrompt` option cap |
| `publicJob` | Client-safe job (no argv, pid, Metro internals) |
| `jobPartialText` | Unfinished stdout/stderr for prompt detection |
| `spawnEnv` | PATH extras then [applyEnvFile](env-file.md) |
| `killProcessGroup` / `forceKill` | SIGTERM group / SIGKILL (Windows `taskkill`) |
| `createJobRuntime({ onBroadcast, onStatusLight })` | Jobs `Map` + start/stop/restart/stdin/interact/shutdown |

## How it works

```
POST /api/run { id }
  → COMMAND_BY_ID + commandAvailability
  → resolveArgv → spawn in repo.root with spawnEnv()
  → stdout/stderr → applyStreamChunk → job.logs + log batcher → SSE `log` `{ id, lines }`
  → noteMetroPort / refreshJobPrompt
  → close → finalizeJob
       → kind === "test": snapshot + saveTestSnapshot
       → pruneJobs (running + last 50 finished)
       → SSE job + light onStatusLight
       → restartAfterStop → startJob again (no second status rebuild)
```

| Action | Behavior |
|--------|----------|
| Stop | SIGTERM the process group; 4s later SIGKILL. Clear the kill timer on finalize. |
| Restart | If running, set `restartAfterStop` and stop; else `startJob`. |
| Stdin | `{ id, text }` to that child — not a new shell. Reject `> 200` chars (`stdin_too_long`). If `job.prompt` is set, accept only `prompt.options[].value` (including `""` for Enter); else `no_prompt`. Clears `job.prompt`. Overlay buttons are the only UI path. |
| Interact | Running job + `findInteraction`; Metro / simctl / adb / editor via [metro-actions.md](metro-actions.md). |

`spawnEnv` prepends Homebrew / `/usr/local/bin` / `~/.local/bin` to PATH, then applyEnvFile so a project `.env` **appends** PATH and skips the denylist.

Prompt debounce is 300ms. Log SSE batches ~80ms.

## Tests

[`test/jobs.test.mjs`](../../../../test/jobs/jobs.test.mjs) — temp cwd, `node -e` hold process: already_running, stdin `no_prompt` / allowlist / too long, stop. Does not `PUT /api/workspace`.

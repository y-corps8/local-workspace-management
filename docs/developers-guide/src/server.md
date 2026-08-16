# `src/server.mjs`

Entry point. Serves the UI from `public/`, exposes `/api/*`, runs allowlisted commands as child jobs, and streams logs over SSE. Binds **`127.0.0.1:4174` only**. No exports — importing this file starts the process.

`--window` / `--open` opens a native WebView via [app-window.mjs](app-window.md). `--browser` may open the loopback URL in the default browser. Bare `npm start` only prints the URL.

## Imports / used by

**Imports:** [commands.mjs](commands.md), [env-file.mjs](env-file.md), [job-logs.mjs](job-logs.md), [metro.mjs](metro.md), [prompt.mjs](prompt.md), [open-external.mjs](open-external.md), [origin.mjs](origin.md), [sse.mjs](sse.md), [test-results.mjs](test-results.md), [app-window.mjs](app-window.md)

**Used by:** `package.json` start scripts. Nothing in `src/` imports this file.

## Exports

None (side-effect entry module).

## How it works

### Bind and static files

`STATIC_ROOT` is `public/` under `APP_ROOT`. `safeStaticPath` blocks path traversal, dotfiles, and `public/.cache`. `src/` and `docs/` are not served. Non-GET/HEAD on non-API paths is 405.

### Security

- `/api/*` goes through `isLocalOrigin` first — foreign `Origin` is 403. See [origin.md](origin.md).
- `POST /api/run` accepts `{ id }` only. Argv is resolved server-side with `resolveArgv`.
- `publicJob` omits argv, pid, and Metro internals. `publicCommand` (from commands) omits argv and Metro `kind` / `method` / `params`.
- Metro WebSocket and inspector calls go to `127.0.0.1` only.

### Status

`buildStatus()` is the snapshot for `GET /api/status` and the SSE `status` event. Health is not polled. A pill is up if that project has a running long-running job, otherwise a one-shot TCP probe.

- **Full:** git (8s cache), `package.json` state, health, jobs, public commands, optional last-test rows.
- **Light** (`{ light: true }`): reuses `lastFullStatus` git / pkg / commands; refreshes health, jobs, and last tests. Job start/stop uses light so restart finalize does not double-rebuild.

`readAllLastTestRuns` runs only when `showTestOverview` is on. Test-job finalize still writes a snapshot.

### Jobs

In-memory `Map` keyed by command id (one running copy per id). Spawn is `detached: true` so `kill(-pid)` stops npm / Maven grandchildren.

```
POST /api/run { id }
  → COMMAND_BY_ID + commandAvailability
  → resolveArgv → spawn in repo.root with spawnEnv()
  → stdout/stderr → splitLogChunk → SSE log
  → noteMetroPort / refreshJobPrompt
  → close → finalizeJob
       → kind === "test": snapshot + saveTestSnapshot
       → pruneJobs (running + last 50 finished)
       → SSE job + light broadcastStatus
       → restartAfterStop → startJob again (no second status rebuild)
```

| Action | Behavior |
|--------|----------|
| Stop | SIGTERM the process group; 4s later SIGKILL. Clear the kill timer on finalize. |
| Restart | If running, set `restartAfterStop` and stop; else `startJob`. |
| Stdin | `{ id, text }` to that child — not a new shell. Clears `job.prompt`. |
| Interact | Running job + `findInteraction`; Metro / simctl / adb / editor. |

`spawnEnv` prepends Homebrew / `/usr/local/bin` / `~/.local/bin` to PATH, then [applyEnvFile](env-file.md) so a project `.env` **appends** PATH instead of replacing it.

Limits: 4000 log lines, 50 finished jobs, 300ms prompt debounce, 64 KiB JSON body (256 KiB for `PUT /api/workspace`).

### HTTP routes

All `/api/*` pass `isLocalOrigin` first.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/status` | Full status snapshot |
| GET | `/api/health` | Health snapshot (running long-running job or TCP); also SSE `health` |
| GET | `/api/events` | SSE (initial `status` + heartbeat every 20s) |
| GET | `/api/logs/:id` | Job logs + partial + prompt |
| POST | `/api/run` | `{ id }` → `startJob` |
| POST | `/api/stop` | `{ id }` — allowlisted or still-running job |
| POST | `/api/restart` | `{ id }` |
| POST | `/api/stdin` | `{ id, text }` |
| POST | `/api/logs/clear` | `{ id }` |
| POST | `/api/interact` | `{ id, action }` |
| GET | `/api/workspace` | Clean workspace JSON |
| POST | `/api/workspace/browse` | Native folder picker |
| POST | `/api/workspace/probe` | `{ path }` |
| PUT | `/api/workspace` | Replace workspace; broadcast status |
| PATCH | `/api/workspace/order` | `{ ids }` |
| PATCH | `/api/workspace/project` | `{ id, path }` |

The UI uses full `PUT` for path edits, not the project PATCH. `GET /api/health` exists; the refresh icon calls `GET /api/status`.

### SSE

Clients live in `sseClients`. Events: `status`, `job`, `log` (may include `replace` / `live`), `health`. A dead client is dropped without failing others — [sse.md](sse.md).

### Startup / shutdown

On listen: log the URL, `setWorkspaceChangeListener` → `broadcastStatus`, `startWorkspaceWatcher`, then window or browser if flagged.

`shutdown` (SIGINT / SIGTERM / window `onClosed`): `closeAppWindow`, SIGTERM running groups, 400ms later SIGKILL, `server.close` (1.5s exit fallback).

## Tests

No direct HTTP / `server.mjs` tests. Helpers it calls are covered under [test.md](../test.md).

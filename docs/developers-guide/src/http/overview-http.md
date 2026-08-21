# `src/http/overview-http.mjs`

HTTP app: static `public/`, `/api/*`, SSE. **`createOverviewApp({ host, port })` does not listen** and must not start the process as a side effect. The CLI in [server.md](../server.md) calls `listen`. Origin/Host checks use the **bound** port (`server.address().port` after listen, including port `0` in tests).

How to use the dashboard: [User guide](../../../user-guide.md).

## Imports / used by

**Imports:** [commands.mjs](../config/commands.md), [browse.mjs](browse.md), [git-info.mjs](../jobs/git-info.md), [jobs.mjs](../jobs/jobs.md), [origin.mjs](origin.md), [sse.mjs](sse.md), [test-results.mjs](../jobs/test-results.md)

**Used by:** [server.mjs](../server.md), [http.test.mjs](../../../../test/http/http.test.mjs)

## Exports

| Name | Role |
|------|------|
| `safeStaticPath` | Resolve a URL under `public/`; reject traversal, dotfiles, `public/.cache` |
| `createOverviewApp({ host, port })` | `{ server, runtime, broadcastStatus, buildStatus, getPort }` — no listen |

## How it works

### Bind and static files

`STATIC_ROOT` is `public/` under `APP_ROOT`. `src/` and `docs/` are not served. Non-GET/HEAD on non-API paths is 405. HEAD writes headers and no body.

Every response (JSON, static, SSE, 405) includes [securityHeaders](origin.md).

### Security

- Present `Host` must be loopback (`127.0.0.1:port` / `localhost:port`) for **API and static** — else 403 `forbidden_host`.
- `/api/*` also goes through `isLocalOrigin` — foreign `Origin` is 403 `forbidden_origin`. Missing Host/Origin allowed (curl).
- `POST /api/run` accepts `{ id }` only. Argv is resolved server-side.
- `publicJob` omits argv, pid, and Metro internals. `publicCommand` omits argv and Metro `kind` / `method` / `params`.

### Status

`buildStatus()` is the snapshot for `GET /api/status` and the SSE `status` event. Health is not polled. A pill is up if that project has a running long-running job, otherwise a one-shot TCP probe.

- **Full:** git (8s cache via [git-info.md](../jobs/git-info.md)), `package.json` state, health, jobs, public commands, optional last-test rows.
- **Light** (`{ light: true }`): reuses `lastFullStatus` git / pkg / commands; refreshes health, jobs, and last tests. Job start/stop uses light so restart finalize does not double-rebuild.

`readAllLastTestRuns` runs only when `showTestOverview` is on. Test-job finalize still writes a snapshot.

### HTTP routes

Host check runs first. All `/api/*` then pass `isLocalOrigin`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/status` | Full status snapshot |
| GET | `/api/health` | Health snapshot; also SSE `health` |
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

The UI uses full `PUT` for path edits, not the project PATCH. Tests must **not** `PUT /api/workspace` against the clone’s file. `GET /api/health` exists; the refresh icon calls `GET /api/status`. JSON body limit 64 KiB (256 KiB for `PUT /api/workspace`).

### SSE

Clients live in `sseClients`. Events: `status`, `job`, `log` (`{ id, lines }` where each line may include `replace` / `live`; a single `{ id, stream, text }` payload is still accepted by the UI), `health`. A dead client is dropped without failing others — [sse.md](sse.md). Logs are queued in [job-logs.md](../jobs/job-logs.md) and flushed about every 80ms, on job finalize, on log clear, and on shutdown.

## Tests

[`test/http.test.mjs`](../../../../test/http/http.test.mjs) — ephemeral `listen(0, 127.0.0.1)`: foreign Origin/Host 403, loopback status empty, static `../` 404, security headers, HEAD `/` empty body, unknown run id 400.

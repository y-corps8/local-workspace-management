# `src/server.mjs`

Start entry (`#!/usr/bin/env node`). `package.json` `bin.locws` and the npm start scripts both run this file. Does **not** implement HTTP routes or jobs. Importing this file starts the process (`--help` / `upgrade` / missing `start` exit before `listen`).

A **git clone** is not the locws CLI: `--help` lists `npm start` / `start:browser` / `start:window`; `upgrade` errors with `git pull` / `npm start`; no registry check. **Packaged** installs (`npx` / global latest or beta) get locws `--help`, `locws upgrade`, and the update notice.

`locws start --window` / `--open` opens a native WebView via [app-window.mjs](window/app-window.md). `locws start --browser` may open the loopback URL in the default browser. `locws start` only prints the URL. Bare `locws` prints usage and exits 1.

Binds **`127.0.0.1` only**. Port is `4174` unless `OVERVIEW_PORT` is set ([commands.md](config/commands.md) `parseOverviewPort`).

## Imports / used by

**Imports:** [commands.mjs](config/commands.md), [paths.mjs](config/paths.md) (`PACKAGED_INSTALL`), [app-window.mjs](window/app-window.md), [open-external.mjs](cli/open-external.md), [overview-http.mjs](http/overview-http.md), [update-check.mjs](cli/update-check.md)

**Used by:** `package.json` `bin.locws` and start scripts. Nothing in `src/` imports this file.

## Exports

None (side-effect entry module).

## How it works

1. `parseLocwsArgv` — `--help` / `upgrade` exit here (clone help vs locws help from `PACKAGED_INSTALL`). Missing or unknown command prints help and exits 1. `start` continues to listen.
2. `checkForUpdate` (packaged only) then `server.listen(PORT, HOST)`.
3. On listen: print URL + workspace path, `setWorkspaceChangeListener` → `broadcastStatus`, `startWorkspaceWatcher`, then window or browser if flagged.
4. `shutdown` (SIGINT / SIGTERM / window `onClosed`): `runtime.shutdownJobs()`, `closeAppWindow`, `server.close` (1.5s exit fallback).

`EADDRINUSE` prints the busy port and exits 1.

## Tests

No direct `server.mjs` tests. HTTP is [http.test.mjs](../../../test/http/http.test.mjs) against `createOverviewApp`. CLI helpers: [update-check.test.mjs](../../../test/cli/update-check.test.mjs).

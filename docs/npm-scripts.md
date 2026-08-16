# npm scripts

Defined in [`package.json`](../package.json). Start scripts run `node src/server.mjs`. `--window` / `--open` opens a dedicated native WebView window and **stops the server when that window closes**. `--browser` opens the dashboard in the default browser. Bare `npm start` only prints the URL. `npm test` runs the built-in Node test runner (no extra packages).

## `npm start`

```bash
node src/server.mjs
```

Starts the overview dashboard and prints `http://127.0.0.1:4174`. It does **not** open a browser or the Workspace Overview window. Copy the URL from the terminal.

The process stays up until Ctrl+C.

```
Overview dashboard  http://127.0.0.1:4174
Bound to 127.0.0.1 — command runner is local-only.
```

## `npm run start:browser`

```bash
node src/server.mjs --browser
```

Same server as `npm start`, then opens `http://127.0.0.1:4174` in the **default browser** (macOS `open`, Linux `xdg-open`, Windows `cmd /c start`; no `-n`, no `-a`). If Chrome or Safari is already running, that is a new tab in the existing window — not a second Dock app.

The process stays up until Ctrl+C. Closing the browser tab does **not** stop the server.

```
Overview dashboard  http://127.0.0.1:4174
Bound to 127.0.0.1 — command runner is local-only.
Opened default browser (existing window if one is running).
```

## `npm run start:window`

```bash
node src/server.mjs --window
```

`--open` is accepted as an alias of `--window`. Does **not** open the default browser. Instead [`src/app-window.mjs`](../src/app-window.mjs) opens a native WebView: macOS Swift `WKWebView` `.app` (`open -W` without `-n`), Linux WebKitGTK, Windows WebView2. It does **not** spawn Chrome. On macOS, Dock clicks focus the existing window.

Closing the Workspace Overview window (or quitting that app) stops this npm process: `shutdown()` kills running jobs, then the server exits.

Needs the OS WebView toolchain (macOS `swiftc`, Linux WebKitGTK/PyGObject, Windows WebView2 + `csc`). If it is missing, the server logs an install hint and keeps listening (no window, so it does not auto-exit).

## What actually starts

[`src/server.mjs`](../src/server.mjs) binds **`127.0.0.1:4174` only** (`HOST` / `PORT` from [`src/commands.mjs`](../src/commands.mjs)). It is not reachable on other interfaces unless you change that code.

On listen it:

1. Serves the UI from `public/`
2. Reloads `workspace.json` (already applied when `commands.mjs` is imported)
3. Accepts `/api/*` for status, run/stop/restart/stdin, Expo actions, and setup
4. Watches `workspace.json` for external edits
5. If `--window` or `--open`, opens the native WebView app window and exits when that window closes
6. Else if `--browser`, `open`s the loopback URL in the default browser
7. Else (`npm start`) prints the URL and does not open anything

SIGINT / SIGTERM (and window close in `--window` mode) stop child process groups with SIGTERM then SIGKILL so Expo / Spring / Next / the wrapper do not outlive this process.

## `npm test`

```bash
node --import ./test/preload.mjs --test test/*.test.mjs
```

Built-in `node:test` only (no extra packages). `test/preload.mjs` sets `OVERVIEW_SKIP_WORKSPACE_LOAD=1` so tests never read or write your `workspace.json`.

Configured **project** scripts live in gitignored `workspace.json`, not here. Those are allowlisted command ids (`projectId:script`) documented in [workspace-config.md](workspace-config.md).

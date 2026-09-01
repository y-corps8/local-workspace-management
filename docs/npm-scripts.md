# npm scripts and the locws CLI

Defined in [`package.json`](../package.json). The published binary is **`locws`** (`src/server.mjs`). A **git clone** starts with `npm start` / `start:browser` / `start:window` only — `--help` lists those scripts, not `locws`. The **locws CLI** (`locws start`, `--help`, `--version`, `upgrade`, update notice) is for packaged installs (`npx @y-corps/locws`, `npx @y-corps/locws@beta`, `npm install -g @y-corps/locws` / `@y-corps/locws@beta`). Bare `locws` prints usage and exits 1. `--window` / `--open` opens a dedicated native WebView window and **stops the server when that window closes**. `--browser` opens the dashboard in the default browser. `locws start` only prints the URL. `npm test` runs the built-in Node test runner (no extra packages).

## Users (`locws`)

After `npm install -g @y-corps/locws` (or via `npx @y-corps/locws start`). Testers of a GitHub pre-release use `npx @y-corps/locws@beta start` or `npm install -g @y-corps/locws@beta` (npm dist-tag **`beta`**). `npx @y-corps/locws` and `locws upgrade` stay on **`latest`**. The install name is **`@y-corps/locws`**; the command after install is **`locws`**. `npm i -g locws` is a different (blocked) name and will not install this package.

| Command | Same as | What it does |
|---------|---------|----------------|
| `locws start` | `npm start` | Server only, prints `http://127.0.0.1:4174` (or `OVERVIEW_PORT`) |
| `locws start --browser` | `npm run start:browser` | Same server, opens the default browser |
| `locws start --window` | `npm run start:window` | Same server, native WebView; closing the window stops the process |
| `locws upgrade` | *(CLI only)* | `npm install -g @y-corps/locws@latest --prefer-online` (npm next to this Node). Copies missing `workspace.json` / `last-test-runs.json` into packaged user dirs. Does **not** start the dashboard, does **not** clear `~/.cache/locws`. Not an npm script. Pin with `npm install -g @y-corps/locws@<version>`. |
| `locws --version` / `-v` | `node src/server.mjs --version` | Prints `package.json` `version` and exits. Also `locws version`. Does **not** start the dashboard. |
| `locws --help` | `node src/server.mjs --help` | Flags, upgrade, `OVERVIEW_PORT`, and the resolved `workspace.json` path. Also `locws help`. |

`--open` is an alias of `--window`.

A packaged start (`npx` / global, not a git clone) checks `https://registry.npmjs.org/@y-corps%2Flocws/latest` (short timeout). That is the **`latest`** dist-tag, so a `beta` publish does not nag stable installs. If a newer `x.y.z` exists (including the same `x.y.z` when the installed copy is a prerelease), stderr prints:

```
New version available: 0.2.0 (current 0.1.0)
Run: locws upgrade
```

Then the server starts as usual. Offline or timeout: no notice. The dashboard UI does not show an update modal. The browser never runs `npm install`; only `locws upgrade` does, with a hardcoded argv (`npm install -g @y-corps/locws@latest --prefer-online`).

`workspace.json` for packaged installs: `~/.config/locws/workspace.json` (Windows `%APPDATA%\locws\workspace.json`). See [workspace-config.md](workspace-config.md).

## `npm start`

```bash
node src/server.mjs start
```

Starts the overview dashboard and prints `http://127.0.0.1:4174`. It does **not** open a browser or the Workspace Overview window. Copy the URL from the terminal. If 4174 is already in use, set `OVERVIEW_PORT` to another integer from 1–65535 (still `127.0.0.1` only). An invalid value prints an error and exits before listen.

The process stays up until Ctrl+C.

```
Overview dashboard  http://127.0.0.1:4174
Bound to 127.0.0.1 — command runner is local-only.
Workspace file  …/workspace.json
```

A git clone does **not** check npm for updates. `node src/server.mjs upgrade` errors (`git pull` / `npm start`). A global or `npm link` `locws` bin may run `locws upgrade`. `--help` from a clone lists these npm scripts and `node src/server.mjs --version`, not the locws CLI. `npm start -- --version` (or `-v`) prints the version and does not listen.

## `npm run start:browser`

```bash
node src/server.mjs start --browser
```

Same server as `npm start`, then opens `http://127.0.0.1:4174` (or the `OVERVIEW_PORT` URL) in the **default browser** (macOS `open`, Linux `xdg-open`, Windows `explorer` with the URL as argv — not `cmd /c start`; no `-n`, no `-a`). If Chrome or Safari is already running, that is a new tab in the existing window — not a second Dock app.

The process stays up until Ctrl+C. Closing the browser tab does **not** stop the server.

```
Overview dashboard  http://127.0.0.1:4174
Bound to 127.0.0.1 — command runner is local-only.
Opened default browser (existing window if one is running).
```

## `npm run start:window`

```bash
node src/server.mjs start --window
```

`--open` is accepted as an alias of `--window`. Does **not** open the default browser. Instead [`src/window/app-window.mjs`](../src/window/app-window.mjs) opens a native WebView: macOS Swift `WKWebView` `.app` (`open -W` without `-n`), Linux WebKitGTK, Windows WebView2. It does **not** spawn Chrome. On macOS, Dock clicks focus the existing window.

Closing the Workspace Overview window (or quitting that app) stops this npm process: `shutdown()` kills running jobs, then the server exits.

Optional OS WebView toolchain (the server compiles a helper into `.cache/` on first run). If it is missing, stderr prints the same install hint as [`installHint()`](../src/window/app-window-shared.mjs) and the server keeps listening (no window, so it does not auto-exit). `locws start` / `--browser` do not need this.

- **macOS** — `swiftc`. Install Xcode Command Line Tools: `xcode-select --install`
- **Linux** — WebKitGTK. Debian/Ubuntu: `sudo apt install python3-gi gir1.2-webkit2-4.1` or `sudo apt install build-essential pkg-config libwebkit2gtk-4.1-dev`. Fedora: `sudo dnf install python3-gobject webkit2gtk4.1`. Arch: `sudo pacman -S python-gobject webkit2gtk`. A display is required (WSL needs WSLg or X11).
- **Windows** — [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) and the C# compiler (`csc`). `csc`: .NET Framework 4.x (included on Windows) or Visual Studio Build Tools.

## What actually starts

[`src/server.mjs`](../src/server.mjs) binds **`127.0.0.1` only** (`HOST` / `PORT` from [`src/config/commands.mjs`](../src/config/commands.mjs); `PORT` is 4174 unless `OVERVIEW_PORT` is set). It is not reachable on other interfaces unless you change that code. HTTP lives in [`src/http/overview-http.mjs`](../src/http/overview-http.mjs) (`createOverviewApp`). On a clone it parses `start` then `--browser` / `--window` and `listen`s. Packaged installs also parse locws `--help` / `--version` / `upgrade`; a missing or unknown command prints usage and exits 1. `--version` / `-v` / `version` print `package.json` `version` and exit before listen. A packaged `start` may print an update notice.

On listen it:

1. Serves the UI from `public/`
2. Reloads `workspace.json` (already applied when `commands.mjs` is imported)
3. Accepts `/api/*` for status, run/stop/restart/stdin, Expo actions, and setup
4. Watches `workspace.json` for external edits
5. If `--window` or `--open`, opens the native WebView app window and exits when that window closes
6. Else if `--browser`, `open`s the loopback URL in the default browser
7. Else (`npm start` / `locws start`) prints the URL and does not open anything

SIGINT / SIGTERM (and window close in `--window` mode) stop child process groups with SIGTERM then SIGKILL so Expo / Spring / Next / the wrapper do not outlive this process.

## `npm test`

```bash
node --import ./test/preload.mjs --test test/*/*.test.mjs
```

Built-in `node:test` only (no extra packages). `test/preload.mjs` sets `OVERVIEW_SKIP_WORKSPACE_LOAD=1` so tests never read or write your `workspace.json` and never call the npm registry.

Configured **project** scripts live in gitignored `workspace.json`, not here. Those are allowlisted command ids (`projectId:script`) documented in [workspace-config.md](workspace-config.md).

# `src/window/app-window-shared.mjs`

Shared paths, install hints, and process tracking for `--window`. Platform backends import this; they do not share a child process with each other.

## Imports / used by

**Imports:** [commands.mjs](../config/commands.md) (`APP_ROOT`, `CACHE_DIR`, `OVERVIEW_URL`)

**Used by:** [app-window.mjs](app-window.md), [app-window-darwin.mjs](app-window-darwin.md), [app-window-linux.mjs](app-window-linux.md), [app-window-win32.mjs](app-window-win32.md)

## Exports

| Name | Role |
|------|------|
| `APP_NAME` | `"Workspace Overview"` |
| `APP_WINDOW_DIR`, `WRAPPER_APP`, `LINUX_BINARY`, `WIN32_EXE`, `WIN32_ICO`, `WINDOW_PID_PATH` | `.cache/` artifact paths |
| `OVERVIEW_WINDOW_PY` / `_C` / `_CS` | Native sources under `src/window/` |
| `windowPlatform` | `darwin` / `linux` / `win32` or `null` |
| `helperArgv` | `[url, title, icon]` for the native helper |
| `installHint` | Missing-toolchain message per OS |
| `killWindowArgs` / `leftoverPatterns` / `pkillPatterns` / `killPidFile` | Stop leftovers (native helpers, not Chrome) |
| `hasDisplay` | `WAYLAND_DISPLAY` or `DISPLAY` |
| `nativeArch` | `x86` / `arm64` / `x64` for `csc` |
| `sourcePng` | `public/assets/icon-512.png` if present |
| `whichBin` | `which` / `where` |
| `writePngIco` | Embed PNG in a one-image ICO |
| `spawnTrackedWindow` / `closeTrackedWindow` | One tracked child; PID in `.cache/overview-window.pid` |
| `webView2RegQueryArgs` | Registry query for WebView2 |

## How it works

`spawnTrackedWindow` closes any previous child, writes the PID file, and calls `onClosed` only if the process actually started (`spawn` fired). `closeTrackedWindow` kills that pid and the pid file.

Linux leftover patterns are the Python script and compiled binary. Darwin leftovers include the `.app` path and a stale `user-data-dir` (legacy Chrome) so an old helper can be cleared without spawning Chrome.

## Tests

Covered by [`test/app-window.test.mjs`](../../../../test/window/app-window.test.mjs).

# `src/window/app-window-win32.mjs`

Windows `--window` backend. Compiles [overview-window.cs](overview-window.md) with `csc` + WebView2. No NuGet. No Edge `--app` mode.

## Imports / used by

**Imports:** [commands.mjs](../config/commands.md), [app-window-shared.mjs](app-window-shared.md)

**Used by:** [app-window.mjs](app-window.md)

## Exports

| Name | Role |
|------|------|
| `findCsc` | Framework `csc.exe` under `%WINDIR%`, else `where csc` |
| `webView2Installed` | `reg query` HKLM/HKCU for the WebView2 GUID |
| `openAppWindow({ onClosed })` | Compile if stamp stale, then spawn `.cache/Overview.exe` |
| `closeAppWindow()` | `closeTrackedWindow` |

## How it works

Requires WebView2 runtime and a C# compiler. Stamp is version + arch + source hash. Icon: PNG → ICO via `writePngIco` when possible (`/win32icon`).

Missing toolchain logs `installHint` and returns; the Node server keeps listening.

## Tests

Covered by [`test/app-window.test.mjs`](../../../../test/window/app-window.test.mjs) (`findCsc`, `webView2RegQueryArgs`, `writePngIco`, `nativeArch`).

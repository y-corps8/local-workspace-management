# `src/app-window.mjs`

Facade for `npm run start:window` / `--window` / `--open`. Picks the platform backend and re-exports shared helpers. Does not spawn Chrome. Does not open the default browser.

Closing the window calls `onClosed` — [server.mjs](server.md) uses that to shut down.

## Imports / used by

**Imports:** [app-window-shared.mjs](app-window-shared.md), [app-window-darwin.mjs](app-window-darwin.md), [app-window-linux.mjs](app-window-linux.md), [app-window-win32.mjs](app-window-win32.md)

**Used by:** [server.mjs](server.md)

## Exports

| Name | Role |
|------|------|
| `openAppWindow({ onClosed })` | Dispatch to darwin / linux / win32. Unsupported OS logs `installHint` and returns |
| `closeAppWindow()` | Dispatch close |
| Re-exports | Shared constants/helpers from `app-window-shared.mjs`; `findCsc` from win32 |

## How it works

`windowPlatform` accepts `darwin`, `linux`, `win32` only. Each backend compiles or launches a native WebView that loads `OVERVIEW_URL`. Artifacts land under `.cache/`. Native sources: [overview-window.md](overview-window.md).

If the toolchain is missing, the server keeps listening (no window, so it does not auto-exit).

## Tests

[`test/app-window.test.mjs`](../../../test/app-window.test.mjs) — platform dispatch, kill args, leftovers (not Chrome), install hints, ICO / WebView2 helpers.

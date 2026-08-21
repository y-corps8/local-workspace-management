# `src/window/app-window-darwin.mjs`

macOS `--window` backend. Compiles a Swift `WKWebView` into `.cache/Workspace Overview.app` with a Dock icon from `public/assets/`. Opens with `open -W` (no `-n`) so a Dock click focuses the existing window.

Does not spawn Chrome.

## Imports / used by

**Imports:** [commands.mjs](../config/commands.md), [app-window-shared.mjs](app-window-shared.md)

**Used by:** [app-window.mjs](app-window.md)

## Exports

| Name | Role |
|------|------|
| `openAppWindow({ onClosed })` | Rebuild if stamp/URL changed, then `open -W` |
| `closeAppWindow()` | `pkill` the wrapper (and leftover Chrome user-data-dir) |

## How it works

Needs `swiftc` (Xcode CLT). Stamp file `.cache/workspace-overview.stamp` is `webview-1` plus `OVERVIEW_URL` — a URL or version change rebuilds the bundle.

The generated app sets `NSAllowsLocalNetworking` for loopback and is ad-hoc codesigned. Icon: `icon-512.png`, or `qlmanage` from `icon.svg` if the PNG is missing.

`onClosed` fires when `open -W` exits (user quit the app).

## Tests

Covered by [`test/app-window.test.mjs`](../../../../test/window/app-window.test.mjs) (`windowPlatform`, leftovers, install hint).

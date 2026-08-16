# `src/app-window-linux.mjs`

Linux `--window` backend. Prefers Python + WebKitGTK ([overview-window.py](overview-window.md) `--check`). Falls back to compiling [overview-window.c](overview-window.md) with `pkg-config` (`webkit2gtk-4.1` then `4.0`).

Does not call `xdg-open`. Does not spawn Chrome. Needs a display (WSLg or X11).

## Imports / used by

**Imports:** [commands.mjs](commands.md), [app-window-shared.mjs](app-window-shared.md)

**Used by:** [app-window.mjs](app-window.md)

## Exports

| Name | Role |
|------|------|
| `openAppWindow({ onClosed })` | Python GI, else compiled C helper |
| `closeAppWindow()` | `closeTrackedWindow` + leftover pkill |

## How it works

Kills leftover Python / binary processes first. Helper argv is `[url, title, icon]`. The C binary is stamped with package name + source hash so a source change rebuilds `.cache/overview-window`.

Missing display or toolchain logs `installHint` and returns; the Node server keeps listening.

## Tests

Covered by [`test/app-window.test.mjs`](../../../test/app-window.test.mjs) (`hasDisplay`, leftovers, install hint).

# Native window sources

Compile targets for `--window`. Not imported as JS. Node backends write or spawn them; artifacts land under `.cache/`.

Helper argv is always `[url, title, icon]` (`helperArgv` in [app-window-shared.mjs](app-window-shared.md)).

## `src/window/overview-window.py`

Linux first choice. Python GI + WebKitGTK (WebKit2 4.1 / 4.0, or WebKit 6). `--check` exits 0 if a GI namespace loads — [app-window-linux.mjs](app-window-linux.md) uses that before spawning.

Loads `OVERVIEW_URL` in a GTK window. Icon path is optional.

## `src/window/overview-window.c`

Linux fallback. GTK3 + WebKit2. Compiled to `.cache/overview-window` with `cc` / `gcc` / `clang` and `pkg-config`. Default size 1440×900, min 800×600.

## `src/window/overview-window.cs`

Windows host. C# 5, Framework `csc`, COM WebView2 — no NuGet. Compiled to `.cache/Overview.exe` (`/t:winexe`). [app-window-win32.mjs](app-window-win32.md) embeds an ICO when it can.

## Used by

[app-window-linux.mjs](app-window-linux.md), [app-window-win32.mjs](app-window-win32.md). Darwin generates Swift at compile time instead of checking in a `.swift` file.

## Tests

No direct tests of the native sources. Dispatch and toolchain helpers: [`test/app-window.test.mjs`](../../../../test/window/app-window.test.mjs).

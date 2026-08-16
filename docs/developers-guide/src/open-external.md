# `src/open-external.mjs`

Platform `{ file, args }` for opening a URL or folder with the OS default handler. No extra packages.

Not used for `--window` (that is a native WebView — [app-window.md](app-window.md)).

## Imports / used by

**Imports:** none from `src/`

**Used by:** [server.mjs](server.md) — `--browser`, Metro web URL, editor fallback (`openPathArgs` when Cursor / VS Code / Codium are missing)

## Exports

| Name | Role |
|------|------|
| `openUrlArgs` | macOS `open`, Windows `cmd /c start ""`, else `xdg-open` |
| `openPathArgs` | macOS `open`, Windows `explorer`, else `xdg-open` |

## How it works

Returns spawn specs only. The server `spawn`s them detached. `start` gets an empty title argument so Windows does not treat the URL as a window title.

## Tests

[`test/open-external.test.mjs`](../../../test/open-external.test.mjs)

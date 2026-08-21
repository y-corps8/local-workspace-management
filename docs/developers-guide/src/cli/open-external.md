# `src/cli/open-external.mjs`

Platform `{ file, args }` for opening a URL or folder with the OS default handler. No extra packages.

Not used for `--window` (that is a native WebView — [app-window.md](../window/app-window.md)).

## Imports / used by

**Imports:** none from `src/`

**Used by:** [server.mjs](../server.md) — `--browser`; [metro-actions.mjs](../jobs/metro-actions.md) — Metro web URL, editor fallback (`openPathArgs` when Cursor / VS Code / Codium are missing)

## Exports

| Name | Role |
|------|------|
| `assertOpenUrl` | Require `http:` / `https:`; reject `& \| ^ < > %` and whitespace |
| `openUrlArgs` | macOS `open`, Windows `explorer` + URL argv, else `xdg-open` |
| `openPathArgs` | macOS `open`, Windows `explorer`, else `xdg-open` |

## How it works

Returns spawn specs only. The caller `spawn`s them detached. Windows URLs use `explorer` (same pattern as folders) — not `cmd /c start`, so metacharacters in a URL cannot reach `cmd`.

## Tests

[`test/open-external.test.mjs`](../../../../test/cli/open-external.test.mjs)

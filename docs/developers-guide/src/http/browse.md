# `src/http/browse.mjs`

Native folder picker for Settings **Browse**. macOS `osascript` + Finder, Linux `zenity` / `kdialog`, Windows PowerShell `FolderBrowserDialog`. 5 minute timeout.

## Imports / used by

**Imports:** none from `src/`

**Used by:** [overview-http.mjs](overview-http.md) `POST /api/workspace/browse`, [metro-actions.mjs](../jobs/metro-actions.md) (`whichBin` for Cursor / VS Code / Codium)

## Exports

| Name | Role |
|------|------|
| `whichBin(name)` | `which` / `where` status 0 |
| `browseFolder()` | Absolute folder path, or throw with `code` `cancelled` / `browse_failed` / `unsupported` |

## How it works

Cancel is mapped from osascript `-128`, “User canceled”, Linux zenity/kdialog status 1 with empty stderr, Windows dialog status 1. Linux with neither zenity nor kdialog throws `unsupported` so the user can paste a path.

## Tests

None (needs a GUI picker).

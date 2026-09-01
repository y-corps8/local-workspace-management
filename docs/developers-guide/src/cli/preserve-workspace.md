# `src/cli/preserve-workspace.mjs`

Copy `workspace.json` and `last-test-runs.json` into packaged user dirs when those dest files are **missing**. Used only by [`runUpgrade`](update-check.md) (`locws upgrade`). Never deletes config or cache. No npm `preuninstall` / `postinstall`.

## Imports / used by

**Imports:** [paths.mjs](../config/paths.md) (`userConfigDir`, `userCacheDir`, `APP_ROOT`, `CACHE_DIR`, `WORKSPACE_CONFIG_PATH`)

**Used by:** [update-check.mjs](update-check.md)

## Exports

| Name | Role |
|------|------|
| `LAST_TEST_RUNS_FILE` | `last-test-runs.json` |
| `tryReadValidJsonText` | Read file; `null` if missing or not JSON |
| `uniqueResolvedPaths` | Dedupe path list |
| `copyJsonIfDestMissing` | Atomic copy (temp next to dest, rename) if dest absent |
| `preservePackagedUserData` | Copy workspace + last-test snapshot into `userConfigDir` / `userCacheDir` |

## How it works

Skips when `OVERVIEW_DATA_DIR` is set (config and cache already share that root). Dest already present → no write. Invalid JSON sources skipped. Copy errors go to stderr; callers must not fail the upgrade. Compiled `--window` helpers are not copied.

## Tests

[`test/cli/preserve-workspace.test.mjs`](../../../../test/cli/preserve-workspace.test.mjs) — dest exists (no overwrite), dest missing (copy), invalid JSON skipped, last-test copy, dest cache dir kept, `OVERVIEW_DATA_DIR` skip. Uses temp dirs, not the real home config.

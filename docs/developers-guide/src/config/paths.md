# `src/config/paths.mjs`

Package root vs user data. `APP_ROOT` is always the directory that contains `package.json` (walk up from this module). `workspace.json` and `.cache/` follow dual-mode rules so npx / global installs do not write inside `node_modules`.

Field meanings for operators: [workspace-config.md](../../../workspace-config.md).

## Imports / used by

**Imports:** none from `src/`

**Used by:** [commands.mjs](commands.md) (re-exports path constants), [update-check.mjs](../cli/update-check.md)

## Exports

| Name | Role |
|------|------|
| `CLI_NAME` | `locws` (config/cache dir and CLI bin) |
| `NPM_PACKAGE_NAME` | `@y-corps/locws` |
| `appRootFrom` / `APP_ROOT` | Directory of `package.json` |
| `isPackagedInstall` | `node_modules` path segment in `APP_ROOT` |
| `userConfigDir` / `userCacheDir` | XDG or Windows AppData dirs named `locws` |
| `resolveDataPaths` | Clone vs packaged vs `OVERVIEW_DATA_DIR` |
| `CACHE_DIR` | Clone: `<APP_ROOT>/.cache`. Packaged: `~/.cache/locws` (Windows `%LOCALAPPDATA%\locws`) |
| `WORKSPACE_CONFIG_PATH` | Clone: `<APP_ROOT>/workspace.json`. Packaged: `~/.config/locws/workspace.json` |
| `WORKSPACE_DIR` | Directory containing `workspace.json` (atomic tmp + `fs.watch`) |
| `PATH_BASE` | Leftover relative project paths: `APP_ROOT` (clone) or homedir (packaged) |
| `PACKAGED_INSTALL` | `isPackagedInstall(APP_ROOT)` |

## How it works

If `OVERVIEW_DATA_DIR` is set, `workspace.json` and `.cache/` live under that folder (tests / power users). Otherwise a git checkout (no `node_modules` in `APP_ROOT`) keeps data at the repo root. Any install under `node_modules` (npx cache, `npm i -g`) uses the user config/cache dirs.

Windows tests pass `platform: "win32"` so joins use `path.win32`. Runtime uses the real OS.

## Tests

[`test/paths.test.mjs`](../../../../test/config/paths.test.mjs) — clone, packaged unix/XDG, `OVERVIEW_DATA_DIR`, Windows `APPDATA`, `node_modules-backup` is not packaged.

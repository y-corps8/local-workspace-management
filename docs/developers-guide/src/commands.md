# `src/commands.mjs`

Config hub. Defines repo paths and the loopback URL, loads and watches `workspace.json`, and builds the in-memory allowlist (`REPOS`, `COMMANDS`, `COMMAND_BY_ID`, `HEALTH_CHECKS`). The browser never sends a shell string — only an id from this list.

Field meanings for operators: [workspace-config.md](../../workspace-config.md).

## Imports / used by

**Imports:** [package-manager.mjs](package-manager.md)

**Used by:** [server.mjs](server.md), [test-results.mjs](test-results.md), [app-window-shared.mjs](app-window-shared.md), [app-window-darwin.mjs](app-window-darwin.md), [app-window-linux.mjs](app-window-linux.md), [app-window-win32.mjs](app-window-win32.md)

## Exports

| Name | Role |
|------|------|
| `APP_ROOT` | Repo root (`src/` parent) |
| `CACHE_DIR` | `.cache/` under `APP_ROOT` |
| `LAST_TEST_RUNS_PATH` | `.cache/last-test-runs.json` |
| `WORKSPACE_CONFIG_PATH` | `workspace.json` at repo root |
| `PORT` / `HOST` / `OVERVIEW_URL` | `4174` / `127.0.0.1` / `http://127.0.0.1:4174` |
| `EXPO_INTERACTIONS` | Preset live actions (`reload`, `openIos`, …). `kind` / `method` / `params` stay server-side |
| `REPOS`, `REPO_ORDER`, `HEALTH_CHECKS`, `COMMANDS`, `COMMAND_BY_ID` | Mutable in-memory allowlist |
| `SHOW_TEST_OVERVIEW` | From `workspace.json` |
| `COMMAND_GROUPS` | Suggested group ids — not a closed allowlist |
| `sanitizeRawWorkspace` | Validate + drop legacy fields (`role` → `description`, `tooling` → `tools`) |
| `readRawWorkspace` / `readCleanWorkspace` | File vs last-good in memory |
| `reloadWorkspace` / `writeRawWorkspace` | Load / atomic save |
| `shouldReloadWorkspaceWatch` | Ignore null filenames and `.workspace.*.tmp` |
| `setWorkspaceChangeListener` / `startWorkspaceWatcher` | External edits |
| `updateProjectPath` / `reorderProjects` | Targeted writes |
| `repoPackageState` / `commandAvailability` | Folder + `package.json` scripts |
| `probeProject` | Discover scripts, package manager, Expo scheme, Maven |
| `publicCommand` | Client-safe command (no argv, no Metro internals) |
| `findInteraction` | Look up an Expo action by id |
| `resolveArgv` | Server-side spawn argv (package manager or custom) |

## How it works

On import, unless `OVERVIEW_SKIP_WORKSPACE_LOAD=1`, `reloadWorkspace()` fills the exported maps. Corrupt JSON keeps the last-good in-memory copy.

`writeRawWorkspace` sanitizes, writes a temp file under `.cache/` (`.workspace.<pid>.tmp`), then renames onto `workspace.json`. The watcher ignores those temps and directory events with a null filename.

Command id is `projectId:script`. `resolveArgv` uses the project’s detected package manager unless `argv` is set; `jestJson` appends `-- --json --outputFile=coverage/jest-results.json`. Windows bins are rewritten in [package-manager.mjs](package-manager.md).

`publicCommand` is the only command shape the UI should see. Workspace JSON may set `"interactions": "expo"` — raw Metro config is rejected.

`probeProject` guesses groups (`run`, `database`, `seed`, `test`, `tools`) but the UI accepts any slug. Expo scheme comes from `app.json` / `app.config.*` (`expo.scheme`, default `app`).

## Tests

[`test/commands.test.mjs`](../../../test/commands.test.mjs) — sanitize, availability, watch filter.

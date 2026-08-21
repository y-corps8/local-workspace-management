# `src/config/commands.mjs`

Config hub. Loads and watches `workspace.json`, and builds the in-memory allowlist (`REPOS`, `COMMANDS`, `COMMAND_BY_ID`, `HEALTH_CHECKS`). Path constants come from [paths.mjs](paths.md). The browser never sends a shell string — only an id from this list.

Field meanings for operators: [workspace-config.md](../../../workspace-config.md).

## Imports / used by

**Imports:** [package-manager.mjs](package-manager.md), [paths.mjs](paths.md)

**Used by:** [server.mjs](../server.md), [overview-http.mjs](../http/overview-http.md), [jobs.mjs](../jobs/jobs.md), [metro-actions.mjs](../jobs/metro-actions.md), [test-results.mjs](../jobs/test-results.md), [app-window-shared.mjs](../window/app-window-shared.md), [app-window-darwin.mjs](../window/app-window-darwin.md), [app-window-linux.mjs](../window/app-window-linux.md), [app-window-win32.mjs](../window/app-window-win32.md)

## Exports

| Name | Role |
|------|------|
| `APP_ROOT` | Re-export from [paths.mjs](paths.md) — package/repo root (`package.json` directory) |
| `CACHE_DIR` | Re-export — clone `.cache/` or packaged user cache |
| `PATH_BASE` | Leftover relative project paths |
| `WORKSPACE_DIR` | Directory of `workspace.json` |
| `LAST_TEST_RUNS_PATH` | `last-test-runs.json` under `CACHE_DIR` |
| `WORKSPACE_CONFIG_PATH` | Dual-mode `workspace.json` |
| `PORT` / `HOST` / `OVERVIEW_URL` | Bind port / `127.0.0.1` / `http://127.0.0.1:<port>` |
| `DEFAULT_PORT` / `parseOverviewPort` | Default `4174`; integer 1–65535. Empty → fallback. Invalid throws (CLI exits before listen) |
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

`writeRawWorkspace` sanitizes, writes a temp file next to `workspace.json` (`.workspace.<pid>.tmp`), then renames onto `workspace.json`. The watcher watches `WORKSPACE_DIR` (not `APP_ROOT`), ignores those temps, and ignores directory events with a null filename.

Command id is `projectId:script`. `resolveArgv` uses the project’s detected package manager unless `argv` is set; `jestJson` appends `-- --json --outputFile=coverage/jest-results.json`. Windows bins are rewritten in [package-manager.mjs](package-manager.md).

`publicCommand` is the only command shape the UI should see. Workspace JSON may set `"interactions": "expo"` — raw Metro config is rejected.

`probeProject({ path, platform })` guesses groups (`run`, `database`, `seed`, `test`, `tools`) but the UI accepts any slug. Expo scheme comes from `app.json` / `app.config.*` (`expo.scheme`, default `app`). Maven wrapper suggestion is `mvnw.cmd` on win32, `./mvnw` otherwise.

## Tests

[`test/commands.test.mjs`](../../../../test/config/commands.test.mjs) — sanitize, availability, watch filter, `parseOverviewPort`.

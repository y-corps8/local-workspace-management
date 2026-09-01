# `src/cli/update-check.mjs`

Packaged CLI update check and `locws upgrade`. Notices go to **stderr**, not the dashboard. The browser never sends a shell string — upgrade argv is hardcoded `npm install -g @y-corps/locws@latest --prefer-online` (npm next to this Node when that file exists). A git clone uses `cloneHelpText` / `cloneUpgradeMessage` instead of locws usage. `npm link` `locws upgrade` is allowed (`isLocwsBinInvocation`).

User-facing flags: [npm-scripts.md](../../../npm-scripts.md).

## Imports / used by

**Imports:** [paths.mjs](../config/paths.md) (`isLocwsBinInvocation`, `PACKAGED_INSTALL`, names), [preserve-workspace.mjs](preserve-workspace.md)

**Used by:** [server.mjs](../server.md)

## Exports

| Name | Role |
|------|------|
| `parseLocwsArgv` | `--help` / `-h` / `help`, `--version` / `-v` / `version`, first positional `start` or `upgrade`, `--browser`, `--window` / `--open` |
| `cloneHelpText` | Clone `--help`: `npm start` / `start:browser` / `start:window` and `node src/server.mjs --version` (no `locws upgrade`) |
| `helpText` | Packaged: `locws start` / `start --browser` / `start --window` / `upgrade` / `--version`. Clone (`packaged: false`): `cloneHelpText` |
| `cloneUpgradeMessage` | Clone `upgrade`: `git pull` and `npm start` |
| `parseSemver` / `isNewerVersion` | Numeric `x.y.z` (prerelease suffix ignored for the numbers). Same `x.y.z`: prerelease current is older than a stable latest |
| `updateNoticeText` | `New version available…` / `Run: locws upgrade` |
| `readInstalledVersion` | `APP_ROOT/package.json` `version` |
| `fetchLatestVersion` | `GET https://registry.npmjs.org/@y-corps%2Flocws/latest` (~3s timeout; `/` in the name is encoded). Failures return `""` |
| `checkForUpdate` | Skip clone, `OVERVIEW_SKIP_WORKSPACE_LOAD=1`, or when latest is not newer |
| `npmCliPath` | `<node-dir>/npm` or `npm.cmd` when that file exists, else `npm` / `npm.cmd` |
| `shouldRunUpgrade` | Packaged install **or** `locws` bin next to this Node |
| `upgradeArgv` | That npm + `install -g @y-corps/locws@latest --prefer-online` |
| `upgradeSpawnOptions` | `stdio: inherit`; Windows also `shell: true` and `windowsHide: true` |
| `runUpgrade` | Clone `node src/server.mjs`: error + exit 1. Packaged / npm-link bin: preserve user files if dest missing, spawn npm, preserve again on exit 0 |

## How it works

`checkForUpdate` is awaited before `listen` logs so a notice sits next to the loopback URL (packaged only). It is not a UI health poll. `locws upgrade` does not bind the dashboard port. Before (and after a successful) npm spawn it copies `workspace.json` / `last-test-runs.json` into `~/.config/locws` and `~/.cache/locws` only when those dest files are missing — it does not clear cache. An npx run that then upgrades installs the **global** copy. Both help strings mention `OVERVIEW_PORT`.

## Tests

[`test/cli/update-check.test.mjs`](../../../../test/cli/update-check.test.mjs) — semver, argv (including `-v` / `--version` / `version` / `help`), skip/clone, clone vs packaged help, clone upgrade copy, installed version, prerelease vs same `x.y.z` latest, notice text, npm-next-to-Node argv, npm-link spawn, Windows shell, preserve before/after spawn (injected; no real global install, no live registry), scoped registry path encoding.

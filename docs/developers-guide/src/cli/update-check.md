# `src/cli/update-check.mjs`

Packaged CLI update check and `locws upgrade`. Notices go to **stderr**, not the dashboard. The browser never sends a shell string — upgrade argv is hardcoded `npm install -g locws@latest`. A git clone uses `cloneHelpText` / `cloneUpgradeMessage` instead of locws usage.

User-facing flags: [npm-scripts.md](../../../npm-scripts.md).

## Imports / used by

**Imports:** [package-manager.mjs](../config/package-manager.md) (`resolveSpawnArgv`), [paths.mjs](../config/paths.md)

**Used by:** [server.mjs](../server.md)

## Exports

| Name | Role |
|------|------|
| `parseLocwsArgv` | `--help` / `-h`, first positional `start` or `upgrade`, `--browser`, `--window` / `--open` |
| `cloneHelpText` | Clone `--help`: `npm start` / `start:browser` / `start:window` (no `locws upgrade`) |
| `helpText` | Packaged: `locws start` / `start --browser` / `start --window` / `upgrade`. Clone (`packaged: false`): `cloneHelpText` |
| `cloneUpgradeMessage` | Clone `upgrade`: `git pull` and `npm start` |
| `parseSemver` / `isNewerVersion` | Numeric `x.y.z` (prerelease suffix ignored for the numbers). Same `x.y.z`: prerelease current is older than a stable latest |
| `updateNoticeText` | `New version available…` / `Run: locws upgrade` |
| `readInstalledVersion` | `APP_ROOT/package.json` `version` |
| `fetchLatestVersion` | `GET https://registry.npmjs.org/locws/latest` (~3s timeout). Failures return `""` |
| `checkForUpdate` | Skip clone, `OVERVIEW_SKIP_WORKSPACE_LOAD=1`, or when latest is not newer |
| `upgradeArgv` | `npm` / `npm.cmd` + `install -g locws@latest` |
| `runUpgrade` | Clone: error + exit 1. Packaged: spawn npm, `stdio: inherit` |

## How it works

`checkForUpdate` is awaited before `listen` logs so a notice sits next to the loopback URL (packaged only). It is not a UI health poll. `locws upgrade` does not bind the dashboard port. An npx run that then upgrades installs the **global** copy. Both help strings mention `OVERVIEW_PORT`.

## Tests

[`test/cli/update-check.test.mjs`](../../../../test/cli/update-check.test.mjs) — semver, argv, skip/clone, clone vs packaged help, clone upgrade copy, prerelease vs same `x.y.z` latest, notice text, upgrade spawn (injected; no real global install, no live registry).

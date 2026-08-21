# `src/config/package-manager.mjs`

Detect npm / pnpm / yarn / bun and build spawn argv. Windows spawn without a shell needs `.cmd` / `bun.exe`. Maven wrapper `./mvnw` / `mvnw` becomes `mvnw.cmd` on win32. Also guesses when Jest `--json` is safe during probe.

## Imports / used by

**Imports:** none from `src/`

**Used by:** [commands.mjs](commands.md) (`detectPackageManager`, `packageManagerArgv`, `resolveSpawnArgv`, `guessJestJson`, `isPackageManagerBin`)

## Exports

| Name | Role |
|------|------|
| `PACKAGE_MANAGERS` | `["npm", "pnpm", "yarn", "bun"]` |
| `isPackageManagerBin` | First argv token is a known manager |
| `detectPackageManager` | `packageManager` field, then lockfiles, else npm |
| `packageManagerArgv` | `yarn run`, `pnpm`/`npm` lifecycle without `run` for `start`/`test`, `bun run` |
| `spawnFileForBin` | Windows: `npm.cmd`, `pnpm.cmd`, `yarn.cmd`, `bun.exe`, `mvnw.cmd` |
| `resolveSpawnArgv` | Rewrite `argv[0]` via `spawnFileForBin` |
| `guessJestJson` | True only for likely Jest in group `test` — never Maven / Vitest / Playwright / Mocha / Ava / pytest |

## How it works

`packageManager` field is split on `@` (`pnpm@9` → `pnpm`). Lockfile order: `pnpm-lock.yaml`, `yarn.lock`, `bun.lock` / `bun.lockb`.

`guessJestJson` is a probe heuristic. Runtime `jestJson` on a saved command still comes from workspace / Probe merge — [merge-command.md](merge-command.md).

`probeProject({ path, platform })` in [commands.md](commands.md) suggests `mvnw.cmd` on win32 so new rows match `resolveSpawnArgv`. Existing `./mvnw` rows still rewrite at spawn.

## Tests

[`test/package-manager.test.mjs`](../../../../test/config/package-manager.test.mjs) — field vs lockfiles; argv per manager; `guessJestJson`; Windows `.cmd` / `bun.exe` / `mvnw.cmd`.

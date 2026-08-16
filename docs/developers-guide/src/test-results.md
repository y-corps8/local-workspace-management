# `src/test-results.mjs`

Last-run summaries for the optional dashboard test cards. Reads artifacts **inside each project folder** and merges with `.cache/last-test-runs.json` written after a test job from this UI. Prefer the newer `finishedAt`. Does not modify project files.

Artifact paths and merge rules for operators: [docs/test-results.md](../../test-results.md).

## Imports / used by

**Imports:** [commands.mjs](commands.md) (`CACHE_DIR`, `LAST_TEST_RUNS_PATH`, `REPOS`)

**Used by:** [server.mjs](server.md) — `buildStatus` calls `readAllLastTestRuns` only when `showTestOverview` is on; `finalizeJob` for `kind === "test"` still calls `readTestArtifact` + `snapshotFromJob` + `saveTestSnapshot`

## Exports

| Name | Role |
|------|------|
| `emptyReport` | `status: "no_report"` row |
| `statusFromCounts` | `pass` / `fail` from `success`, `exitCode`, or `failed` |
| `saveTestSnapshot` | Write one project id into `.cache/last-test-runs.json` |
| `readTestArtifact` | Jest JSON or Maven Surefire/Failsafe + coverage |
| `mergeReport` | Newer `finishedAt` wins; keep artifact coverage if the snapshot has none |
| `readLastTestRun` / `readAllLastTestRuns` | Merge per repo |
| `snapshotFromJob` | Cache row after an overview-launched test job |

## How it works

`testKind` on the project is `jest` (default) or `maven`. Jest reads `coverage/jest-results.json` plus Istanbul summaries. Maven reads Surefire/Failsafe XML and JaCoCo CSV. Failed names are capped at 8.

`jestJson` on a command is what makes the server append Jest `--json` and create `coverage/` before spawn — this module only reads the files.

## Tests

[`test/test-results.test.mjs`](../../../test/test-results.test.mjs) — `statusFromCounts`, `mergeReport`

# `src/test-results.mjs`

Last-run summaries for the dashboard test cards. Reads artifacts **inside each project folder** and merges with snapshots written after a test job from this UI. Prefer the newer `finishedAt`. Does not modify project files.

Used by [`src/server.mjs`](../src/server.mjs): `buildStatus()` calls `readAllLastTestRuns()` only when `showTestOverview` is on; `finalizeJob` for `kind === "test"` still calls `readTestArtifact` + `snapshotFromJob` + `saveTestSnapshot`.

## Artifact paths (per project `path`)

Chosen by `testKind` on the project (`jest` default, or `maven`).

### Jest (`testKind: "jest"`)

| File | Use |
|------|-----|
| `<path>/coverage/jest-results.json` | Pass/fail/skip counts, duration, failed names (`source: "jest-results"`) |
| `<path>/coverage/coverage-summary.json` | Istanbul `total.lines.pct` |
| `<path>/coverage/schema-coverage-summary.json` | Fallback `summary.coverage_pct` |
| `<path>/coverage/behavioral-coverage-summary.json` | Second fallback `summary.coverage_pct` |

`jestJson` on a command makes the server append `-- --json --outputFile=coverage/jest-results.json` and create `coverage/` before spawn. Plain `npm test` does not write that file on its own.

### Maven (`testKind: "maven"`)

| Location | Use |
|----------|-----|
| `<path>/target/surefire-reports` | Preferred Surefire `TEST-*.xml` |
| `<path>/target/failsafe-reports` | Failsafe XML if present |
| `<path>/coverage/surefire-reports` | Fallback if `target/` reports are gone |
| `<path>/coverage/failsafe-reports` | Failsafe fallback |
| `<path>/coverage/jacoco.csv` | Line coverage (preferred) |
| `<path>/target/site/jacoco/jacoco.csv` | JaCoCo fallback |

XML parser reads `<testsuite>` counts and failed `<testcase>` names (cap 8). `source: "surefire"`.

## Cache snapshots

Path: `.cache/last-test-runs.json` under the **repo root** (`LAST_TEST_RUNS_PATH` from [`src/commands.mjs`](../src/commands.mjs)). Gitignored.

After an overview-launched test job exits, the server writes one row per project id via `saveTestSnapshot`. `snapshotFromJob` copies counts from the artifact (if any), job timestamps, `commandId` / `commandLabel`, and `exitCode`. `source: "snapshot"`.

## Merge rules (`mergeReport`)

1. No artifact and no snapshot → empty report (`status: "no_report"`, zeros)
2. Snapshot only → snapshot fields
3. Artifact newer or equal (or no snapshot `finishedAt`) → artifact, but keep snapshot `commandId` / `commandLabel` if present
4. Snapshot `finishedAt` **newer** than artifact → snapshot wins; keep artifact `coveragePct` if the snapshot has none; keep artifact `failedNames` if the snapshot has none

`readLastTestRun(repoId)` / `readAllLastTestRuns()` apply this for status payloads.

## Shared report shape

```
status        pass | fail | no_report
passed, failed, skipped, total
durationMs, finishedAt
coveragePct
commandId, commandLabel
failedNames   up to 8 strings
source        jest-results | surefire | snapshot | null
```

`statusFromCounts`: explicit `success` boolean, else `exitCode === 0` and no failures, else `failed > 0` → fail.

Code map (exports, callers): [developers-guide/src/test-results.md](developers-guide/src/test-results.md).

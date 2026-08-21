# `src/jobs/git-info.mjs`

Git branch + dirty flag for status. 8s cache per repo root. Timeout 2s per `git` spawn.

## Imports / used by

**Imports:** none from `src/`

**Used by:** [overview-http.mjs](../http/overview-http.md) `buildStatus` (full rebuild only)

## Exports

| Name | Role |
|------|------|
| `spawnGit(args, cwd)` | `{ status, stdout, stderr }` — never throws |
| `gitInfo(repoRoot)` | `{ branch, dirty }` |

## How it works

Missing `.git` → `{ branch: "unknown", dirty: false }`. Otherwise `rev-parse --abbrev-ref HEAD` plus `status --porcelain`. Failed branch command → unknown / not dirty.

## Tests

None directly. Full status in [http.test.mjs](../../../../test/http/http.test.mjs) uses an empty workspace (no git calls).

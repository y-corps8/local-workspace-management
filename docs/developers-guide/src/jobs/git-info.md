# `src/jobs/git-info.mjs`

Git branch + dirty flag for status. 8s cache per repo root unless `skipCache` is set. Timeout 2s per `git` spawn.

## Imports / used by

**Imports:** none from `src/`

**Used by:** [overview-http.mjs](../http/overview-http.md) `buildStatus` (full rebuild only)

## Exports

| Name | Role |
|------|------|
| `spawnGit(args, cwd)` | `{ status, stdout, stderr }` — never throws |
| `gitInfo(repoRoot, { skipCache }?)` | `{ branch, dirty }`. `skipCache: true` ignores the 8s map (Refresh / `GET /api/status`) |

## How it works

Missing `.git` → `{ branch: "unknown", dirty: false }`. Otherwise `rev-parse --abbrev-ref HEAD` plus `status --porcelain`. Failed branch command → unknown / not dirty. A successful read always writes the cache, including after `skipCache`.

## Tests

[`test/jobs/git-info.test.mjs`](../../../../test/jobs/git-info.test.mjs) — cached read stays clean; `skipCache: true` sees a dirty tree.

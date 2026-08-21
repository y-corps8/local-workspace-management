# `test/`

Built-in `node:test` only. No extra packages. Wired in [`package.json`](../../package.json):

```bash
node --import ./test/preload.mjs --test test/*/*.test.mjs
```

## `test/preload.mjs`

Sets `OVERVIEW_SKIP_WORKSPACE_LOAD=1` before any test file imports [`src/config/commands.mjs`](src/config/commands.md). Tests never read or write your `workspace.json` and never call the npm registry. Do **not** `PUT /api/workspace` in HTTP tests — that would write the clone’s file.

## Catalog

| File | Module | Asserts |
|------|--------|---------|
| [`config/commands.test.mjs`](../../test/config/commands.test.mjs) | [commands.mjs](src/config/commands.md) | Duplicate project/command ids rejected; unique scripts accepted; custom `argv` available without `package.json`; package-manager commands need the script key; watch ignores null filename and `.workspace.*.tmp`; `parseOverviewPort` |
| [`config/paths.test.mjs`](../../test/config/paths.test.mjs) | [paths.mjs](src/config/paths.md) | Clone vs `node_modules` vs `OVERVIEW_DATA_DIR`; Windows `APPDATA`; `appRootFrom` walks up to `package.json` |
| [`cli/update-check.test.mjs`](../../test/cli/update-check.test.mjs) | [update-check.mjs](src/cli/update-check.md) | Semver, prerelease vs same `x.y.z` latest, CLI flags, skip clone, clone vs packaged help, clone upgrade copy, upgrade argv/spawn (no live registry, no global install) |
| [`config/package-manager.test.mjs`](../../test/config/package-manager.test.mjs) | [package-manager.mjs](src/config/package-manager.md) | `packageManager` field vs lockfiles; argv per manager; `guessJestJson`; Windows `.cmd` / `bun.exe` / `mvnw.cmd` |
| [`jobs/env-file.test.mjs`](../../test/jobs/env-file.test.mjs) | [env-file.mjs](src/jobs/env-file.md) | Comments, `export`, quotes, inline comments; PATH append; denylist |
| [`jobs/job-logs.test.mjs`](../../test/jobs/job-logs.test.mjs) | [job-logs.mjs](src/jobs/job-logs.md) | Newlines, partial buffer, CR replace vs CRLF, `MAX_PARTIAL`, per-stream buffers, `compactLogBatch`, `createLogBatcher` flush/clear |
| [`jobs/metro.test.mjs`](../../test/jobs/metro.test.mjs) | [metro.mjs](src/jobs/metro.md) | Localhost URL, `exp://`, busy-port; ignores stack-trace URLs |
| [`jobs/prompt.test.mjs`](../../test/jobs/prompt.test.mjs) | [prompt.mjs](src/jobs/prompt.md) | Prisma/npm/inquirer/numbered lists; ANSI; ignores Expo help, free-text, and npm/Gradle `>` logs; `publicPrompt` caps |
| [`http/origin.test.mjs`](../../test/http/origin.test.mjs) | [origin.mjs](src/http/origin.md) | Missing Origin/Host and loopback `:4174` allowed; other hosts/ports rejected; `securityHeaders` |
| [`cli/open-external.test.mjs`](../../test/cli/open-external.test.mjs) | [open-external.mjs](src/cli/open-external.md) | `open` / `xdg-open` / `explorer`; URL reject non-http and cmd metacharacters |
| [`http/sse.test.mjs`](../../test/http/sse.test.mjs) | [sse.mjs](src/http/sse.md) | Frame format; dead clients dropped |
| [`jobs/test-results.test.mjs`](../../test/jobs/test-results.test.mjs) | [test-results.mjs](src/jobs/test-results.md) | `statusFromCounts` precedence; `mergeReport` newer-wins + coverage keep |
| [`config/merge-command.test.mjs`](../../test/config/merge-command.test.mjs) | [merge-command.mjs](src/config/merge-command.md) | Probe `jestJson` overwrites or turns on |
| [`config/argv.test.mjs`](../../test/config/argv.test.mjs) | [argv.mjs](src/config/argv.md) + [argv.js](public/js/argv.md) | Quoting, escapes, unclosed quote, round-trip, Node vs UI identity |
| [`window/app-window.test.mjs`](../../test/window/app-window.test.mjs) | [app-window.mjs](src/window/app-window.md) | Platform, helper argv, kill args, leftovers (not Chrome), install hints, display/arch, `findCsc`, WebView2 reg, ICO |
| [`http/http.test.mjs`](../../test/http/http.test.mjs) | [overview-http.mjs](src/http/overview-http.md) | Ephemeral port: foreign Origin/Host 403, loopback status, static traversal 404, security headers, HEAD empty body, unknown run id |
| [`jobs/jobs.test.mjs`](../../test/jobs/jobs.test.mjs) | [jobs.mjs](src/jobs/jobs.md) | Temp cwd `node -e`: already_running, stdin `no_prompt` / allowlist / too long, stop |

## Gap

No tests for [`public/app.js`](public/app.md) itself. Dashboard behavior still needs a manual `npm start` (Settings/Probe, custom argv round-trip, headers).

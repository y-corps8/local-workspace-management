# `test/`

Built-in `node:test` only. No extra packages. Wired in [`package.json`](../../package.json):

```bash
node --import ./test/preload.mjs --test test/*.test.mjs
```

## `test/preload.mjs`

Sets `OVERVIEW_SKIP_WORKSPACE_LOAD=1` before any test file imports [`src/commands.mjs`](src/commands.md). Tests never read or write your `workspace.json`.

## Catalog

| File | Module | Asserts |
|------|--------|---------|
| [`commands.test.mjs`](../../test/commands.test.mjs) | [commands.mjs](src/commands.md) | Duplicate project/command ids rejected; unique scripts accepted; custom `argv` available without `package.json`; package-manager commands need the script key; watch ignores null filename and `.workspace.*.tmp` |
| [`package-manager.test.mjs`](../../test/package-manager.test.mjs) | [package-manager.mjs](src/package-manager.md) | `packageManager` field vs lockfiles; argv per manager; `guessJestJson`; Windows `.cmd` / `bun.exe` |
| [`env-file.test.mjs`](../../test/env-file.test.mjs) | [env-file.mjs](src/env-file.md) | Comments, `export`, quotes, inline comments; PATH append |
| [`job-logs.test.mjs`](../../test/job-logs.test.mjs) | [job-logs.mjs](src/job-logs.md) | Newlines, partial buffer, CR replace vs CRLF, `MAX_PARTIAL`, per-stream buffers, `compactLogBatch`, `createLogBatcher` flush/clear |
| [`metro.test.mjs`](../../test/metro.test.mjs) | [metro.mjs](src/metro.md) | Localhost URL, `exp://`, busy-port; ignores stack-trace URLs |
| [`prompt.test.mjs`](../../test/prompt.test.mjs) | [prompt.mjs](src/prompt.md) | Prisma/npm/inquirer/numbered lists; ANSI; ignores Expo help, free-text, and npm/Gradle `>` logs; `publicPrompt` caps |
| [`origin.test.mjs`](../../test/origin.test.mjs) | [origin.mjs](src/origin.md) | Missing origin and loopback `:4174` allowed; other hosts/ports rejected |
| [`open-external.test.mjs`](../../test/open-external.test.mjs) | [open-external.mjs](src/open-external.md) | `open` / `xdg-open` / `explorer` / `cmd start` |
| [`sse.test.mjs`](../../test/sse.test.mjs) | [sse.mjs](src/sse.md) | Frame format; dead clients dropped |
| [`test-results.test.mjs`](../../test/test-results.test.mjs) | [test-results.mjs](src/test-results.md) | `statusFromCounts` precedence; `mergeReport` newer-wins + coverage keep |
| [`merge-command.test.mjs`](../../test/merge-command.test.mjs) | [merge-command.mjs](src/merge-command.md) | Probe `jestJson` overwrites or turns on |
| [`argv.test.mjs`](../../test/argv.test.mjs) | [argv.mjs](src/argv.md) | Quoting, escapes, unclosed quote, round-trip |
| [`app-window.test.mjs`](../../test/app-window.test.mjs) | [app-window.mjs](src/app-window.md) | Platform, helper argv, kill args, leftovers (not Chrome), install hints, display/arch, `findCsc`, WebView2 reg, ICO |

## Gap

No HTTP tests for [`src/server.mjs`](src/server.md) and no tests for [`public/app.js`](public/app.md). Changes there rely on helper coverage plus manual `npm start`.

# `public/js/argv.js`

Browser copy of [argv.mjs](../../src/config/argv.md). `parseArgvLine` / `formatArgvLine` only. Setup uses this file; Node tests import it next to `src/config/argv.mjs` and assert identical results.

Do not duplicate these functions in `app.js`. Do not serve `src/` as static.

## Imports / used by

**Imports:** none

**Used by:** [setup.js](setup.md)

## Exports

| Name | Role |
|------|------|
| `parseArgvLine` | Split on whitespace; unclosed quote throws |
| `formatArgvLine` | Quote parts that need quoting |

## Tests

[`test/argv.test.mjs`](../../../../test/config/argv.test.mjs)

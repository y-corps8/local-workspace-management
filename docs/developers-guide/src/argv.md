# `src/argv.mjs`

Parse / format a single command line into an argv array. Supports `'...'` and `"..."`. No shell expansion, globs, or `$VARS`.

Used for custom `argv` in setup forms — not for runtime execution from browser input. The server still only runs allowlisted ids.

## Imports / used by

**Imports:** none from `src/`

**Used by:** nothing in `src/` at runtime. [`public/app.js`](../public/app.md) has a matching `parseArgvLine` / `formatArgvLine`. This module is the unit-tested copy.

## Exports

| Name | Role |
|------|------|
| `parseArgvLine` | Split on whitespace; unclosed quote throws |
| `formatArgvLine` | Quote parts that are empty or contain whitespace / quotes / backslash |

## How it works

Double quotes honor `\"` and `\\`. Single quotes are literal. Keep the `app.js` copies in sync when you change quoting.

## Tests

[`test/argv.test.mjs`](../../../test/argv.test.mjs)

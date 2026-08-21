# `src/config/argv.mjs`

Parse / format a single command line into an argv array. Supports `'...'` and `"..."`. No shell expansion, globs, or `$VARS`.

Used for custom `argv` in setup forms — not for runtime execution from browser input. The server still only runs allowlisted ids.

The UI copy is [`public/js/argv.js`](../../public/js/argv.md). Tests import **both** and assert identical results. Do not serve `src/` as static.

## Imports / used by

**Imports:** none from `src/`

**Used by:** nothing in `src/` at runtime. Setup uses the public copy.

## Exports

| Name | Role |
|------|------|
| `parseArgvLine` | Split on whitespace; unclosed quote throws |
| `formatArgvLine` | Quote parts that are empty or contain whitespace / quotes / backslash |

## How it works

Double quotes honor `\"` and `\\`. Single quotes are literal. Keep the two files in sync when you change quoting.

## Tests

[`test/argv.test.mjs`](../../../../test/config/argv.test.mjs) — quoting, escapes, unclosed quote, round-trip, Node vs UI identity.

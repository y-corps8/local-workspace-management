# `src/merge-command.mjs`

Merge a Probe-discovered command with one already saved on the project. Probe’s `jestJson` wins so a Vitest / Playwright project does not keep a stale Jest flag.

## Imports / used by

**Imports:** none from `src/`

**Used by:** nothing in `src/` at runtime. [`public/app.js`](../public/app.md) inlines the same rule when Probe returns. This module exists so the merge is unit-tested.

## Exports

| Name | Role |
|------|------|
| `mergeDiscoveredCommand(discovered, existing)` | Spread discovered, then existing; `argv` prefers existing; `jestJson` always from discovered |

## How it works

```js
{ ...discovered, ...existing, argv: existing.argv || discovered.argv, jestJson: discovered.jestJson }
```

Keep this in sync with the Probe merge in `app.js` (comment there: “jestJson from Probe so Vitest/Playwright do not keep a stale Jest flag”).

## Tests

[`test/merge-command.test.mjs`](../../../test/merge-command.test.mjs)

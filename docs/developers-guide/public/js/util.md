# `public/js/util.js`

Shared helpers: groups, HTML escape, `localStorage` keys for console/theme, drag helpers, last-test chip/ring math.

## Exports

`SUGGESTED_GROUPS`, `GROUP_LABELS`, storage keys, `slugifyId`, `groupLabel`, `normalizeGroup`, `lowercaseCommandLabel`, `escapeHtml`, time/duration formatters, availability copy, `orderGroups`, `dashboardRepos`, `moveItem`, `weaveVisibleIds`, `clearDragStyles`, console height/collapse + theme read/write, chip/ring helpers.

Theme default is **dark**. Do not follow `prefers-color-scheme`.

## Tests

None (group/argv rules are covered on the server and in [argv.test.mjs](../../../../test/config/argv.test.mjs)).

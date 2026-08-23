# `public/js/util.js`

Shared helpers: groups, HTML escape, `localStorage` keys for console/theme/log filter, drag helpers, last-test chip/ring math, `isTypingTarget`, `projectFilterHit`.

## Exports

`SUGGESTED_GROUPS`, `GROUP_LABELS`, storage keys, `slugifyId`, `groupLabel`, `normalizeGroup`, `lowercaseCommandLabel`, `escapeHtml`, time/duration formatters, availability copy, `orderGroups`, `dashboardRepos`, `moveItem`, `weaveVisibleIds`, `clearDragStyles`, console height/collapse + theme read/write, log-filter read/write, `isTypingTarget`, `projectFilterHit`, chip/ring helpers.

Theme default is **dark**. Do not follow `prefers-color-scheme`.

## Tests

None (group/argv rules are covered on the server and in [argv.test.mjs](../../../../test/config/argv.test.mjs)).

# `public/js/render.js`

Health pills, last-test cards, project cards, and `render()`. Hidden projects (`hidden: true`) are omitted from cards, pills, and last-test cards via `dashboardRepos()`.

## Imports / used by

**Imports:** [dom.js](dom.md), [state.js](state.md), [hooks.js](hooks.md), [util.js](util.md)

**Used by:** [app.js](../app.md)

## Exports

`renderHealth`, `formatCheckedAgo`, `renderHealthChecked`, `renderTests`, `renderProjects`, `render`.

`render()` ends with `hooks.updateLogChrome()`. A 15s timer in `app.js` only rewrites the “Checked … ago” string from `generatedAt`.

## Tests

None.

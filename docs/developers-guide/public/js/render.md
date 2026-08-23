# `public/js/render.js`

Health pills, last-test cards, project cards, and `render()`. Hidden projects (`hidden: true`) are omitted from cards, pills, and last-test cards via `dashboardRepos()`.

## Imports / used by

**Imports:** [dom.js](dom.md), [state.js](state.md), [hooks.js](hooks.md), [util.js](util.md)

**Used by:** [app.js](../app.md)

## Exports

`renderHealth`, `formatCheckedAgo`, `renderHealthChecked`, `renderTests`, `renderProjects`, `render`.

`render()` ends with `hooks.updateLogChrome()`. A 15s timer in `app.js` only rewrites the “Checked … ago” string from `generatedAt`.

`renderTests` omits hidden projects. With no dashboard repos it keeps the unhide / add copy. When every visible project has `no_report` and no running test, it is one `.test-empty` line (no donut, no **pass** caption). Cards exist only for a running test or a real last-test status (`data-test-repo`). The donut is a solid status ring (`--done` pass, `--fail` fail, muted when empty); the center number is pass rate, not the arc. Caption is **none** when empty, **pass** / **fail** from status, **pass** while a run is in progress. Pass/coverage sentences sit in `.visually-hidden` next to the chip; the hover tip stays for the pointer.

`renderProjects` empty panel: no projects shows **No projects yet** plus **Add project**; all hidden uses the unhide copy; a non-empty filter with no hits shows **No projects match** without Add. `#project-filter` hides when none configured or none visible. `state.projectFilter` is client-only.

Cards show `repo.git` under the title (`branch` or `branch · dirty`) when the folder is a git repo. `unknown` and `missing` omit the line. Git is whatever the last **full** status stored — start/stop light status does not refresh it. Chip copy is **Running** / `N running` / **Idle**.

Health pills are `<button class="health-pill" data-health-repo>` with a short label (first word, max 18 characters). `reason` maps to `.dot-running` / `.dot-port` / `.dot-idle` and **Running** / **Port open** / **Idle**. Click scrolls the matching card into view and applies `is-flash` for 1.2s (`state.healthFlashRepoId` so a live `job` re-render keeps the outline).

When any command on that card has `primary`, only that button is `btn-primary`. `#start-primaries` shows when a visible idle primary exists.

Command groups always show a static `.cmd-group-label` plus a `.cmd-row` of every button in that group. Do not collapse or hide command buttons.

## Tests

None.

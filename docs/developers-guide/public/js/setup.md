# `public/js/setup.js`

Settings sheet, Probe, add/edit forms. `openSetup` loads `GET /api/workspace`. Probe merges discovered scripts with saved commands. `jestJson` always comes from the Probe row (same rule as [merge-command.mjs](../../src/config/merge-command.md)). Custom argv uses [argv.js](argv.md).

`SUGGESTED_GROUPS` in [util.js](util.md) is display order only. Any slug is valid.

## Imports / used by

**Imports:** [api.js](api.md), [argv.js](argv.md), [dom.js](dom.md), [hooks.js](hooks.md), [state.js](state.md), [theme.js](theme.md), [util.js](util.md)

**Used by:** [app.js](../app.md)

## Exports

`cloneWorkspace`, `closeSetup`, `openProjectForm`, `persistWorkspace` (`PUT /api/workspace`), `openSetup`, `persistSetupOrder`, `bindSetup`.

Remove uses `hooks.openConfirm`. Theme toggles call `applyTheme(..., true)` — theme is not in `workspace.json`.

## Tests

None.

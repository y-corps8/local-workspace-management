# `public/js/setup.js`

Settings page, Probe, add/edit forms. `openSetup` loads `GET /api/workspace`. Probe merges discovered scripts with saved commands. `jestJson` always comes from the Probe row (same rule as [merge-command.mjs](../../src/config/merge-command.md)). Custom argv uses [argv.js](argv.md).

`SUGGESTED_GROUPS` in [util.js](util.md) is display order only. Any slug is valid.

## Imports / used by

**Imports:** [api.js](api.md), [argv.js](argv.md), [dom.js](dom.md), [hooks.js](hooks.md), [state.js](state.md), [theme.js](theme.md), [util.js](util.md)

**Used by:** [app.js](../app.md)

## Exports

`cloneWorkspace`, `closeSetup`, `openProjectForm`, `persistWorkspace` (`PUT /api/workspace`), `openSetup`, `persistSetupOrder`, `bindSetup`.

Add-form lead and edit-form lead differ. The add commit button is **Add project**; the page title stays **Add a project**. **Id** lives in `#setup-advanced`. Description length is `#setup-description-count` (`n / 50`). Settings list **Add project** is hidden while the form is open. `setupFromDashboard` is set for dashboard **Add project** and card **⋯ → Edit**; **Cancel** / **Update project** then call `closeSetup()`. Edit from the Settings list leaves the flag false and returns to the list.

Selected command rows stay in `#setup-scripts`. Unchecked rows go in `#setup-scripts-available` as **Available (N)** (`<details>` closed). **Add custom command** sits between them. **How this works** is a closed `<details>` that lists each command-row control (show checkbox, Once | Long-running, Safe | Destructive, Primary, Group, custom delete) plus cwd and allowlisted ids. Each command is a two-line card: lead column (drag handle + show checkbox) then identity and flags, Group on a right rail (`align-self: center`). Selected rows drag via `data-script-drag` on `#setup-scripts` only; drop onto another row updates Group and `moveItem`s `setupScriptRows`. Save walks selected rows once (probe and custom in list order). The flags row is Once | Long-running (`data-script-runtime`), Safe | Destructive (`data-script-safety`), and Primary (`data-script-primary`). Primary is always in the flags row; disabled when the row is unselected or destructive. Disabled Primary shows a hover tip (`Destructive commands can’t be primary` or `Select this command to make it primary`). Custom rows add a muted-red delete icon (`btn-icon-danger`, `data-script-remove`, `aria-label="Delete custom command"`) beside Group. Probe/import keep a still-valid `primaryScript`; otherwise no Primary is selected. `row.hint` is a muted line on the Settings command row.

List view: `#setup-panel` is an in-page region in `.workspace-main`. `setSettingsOpen` toggles `.layout.is-settings`, which hides the topbar, Console, and dashboard sections. **Export workspace** / **Import workspace** live in `#setup-workspace-io` (hidden on add/edit with the rest of `#setup-step-root`). Import confirms **Replace** then `PUT /api/workspace`.

Remove uses `hooks.openConfirm`. Theme toggles call `applyTheme(..., true)` — theme is not in `workspace.json`.

## Tests

None.

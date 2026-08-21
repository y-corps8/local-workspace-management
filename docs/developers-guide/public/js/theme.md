# `public/js/theme.js`

Apply Light / Dark after modules load, and keep Settings Appearance buttons in sync. Persistence is [util.js](util.md) (`overview.theme`). FOUC is handled by [theme-boot.js](../theme-boot.md).

## Exports

`syncThemeButtons`, `applyTheme(theme, persist)`.

Default dark. Do not follow `prefers-color-scheme`. Do not write theme to `workspace.json`.

## Tests

None.

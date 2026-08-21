# `public/theme-boot.js`

Apply stored Light / Dark before first paint. Classic (non-module) `<script src>` in `<head>` so CSP does not need `unsafe-inline`.

Default remains dark when the key is missing. Does not follow `prefers-color-scheme`.

## Imports / used by

**Imports:** none

**Used by:** [index.html](index.md) in `<head>` before CSS. [theme.js](js/theme.md) reapplies after modules load (and on Settings toggles).

## Exports

None (classic script).

## How it works

Reads `localStorage` key `overview.theme`. If `light` or `dark`, sets `document.documentElement.dataset.theme` and `colorScheme`. Light also updates `<meta name="theme-color">` to `#f6f3eb`. Errors (private mode) are swallowed.

## Tests

None.

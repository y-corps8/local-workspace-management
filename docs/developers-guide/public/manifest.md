# `public/manifest.webmanifest`

Web app manifest so a normal browser can “Add to Home Screen”. The dedicated desktop window is `npm run start:window` (native WebView), not this file.

## Imports / used by

**Used by:** [index.html](index.md) (`rel="manifest"`). Icons: [assets.md](assets.md).

## Exports

None (JSON).

## How it works

| Field | Value |
|-------|--------|
| `name` / `short_name` | Workspace overview / Overview |
| `start_url` / `scope` | `/` |
| `display` | `standalone` |
| `background_color` / `theme_color` | `#0c0c0a` |
| `icons` | `/assets/icon-192.png`, `/assets/icon-512.png` (`any` + `maskable`) |

The service worker does not cache these assets — [sw.md](sw.md).

## Tests

None.

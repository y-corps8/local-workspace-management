# `public/assets/`

Icons for the HTML shell, PWA manifest, and native `--window` wrappers.

## Files

| File | Used by |
|------|---------|
| `icon.svg` | Favicon in [index.html](index.md); README |
| `icon-192.png` | [manifest.webmanifest](manifest.md) |
| `icon-512.png` | Manifest (`any` + `maskable`); macOS / Linux / Windows window icon (`sourcePng` in [app-window-shared.mjs](../src/window/app-window-shared.md)) |
| `apple-touch-icon.png` | iOS home-screen link in `index.html` |

## How it works

Served from `/assets/…` because `STATIC_ROOT` is `public/`. Darwin can fall back to `qlmanage` on `icon.svg` if the 512 PNG is missing. Windows may wrap the 512 PNG in an ICO via `writePngIco`.

Do not add a second icon set for the native window — reuse these files.

## Tests

None. ICO wrapping is covered in [`test/app-window.test.mjs`](../../../test/window/app-window.test.mjs).

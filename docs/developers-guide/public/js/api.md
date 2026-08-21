# `public/js/api.js`

`fetch` helpers. Failed POSTs append a stderr-looking line unless `{ quiet: true }` (Expo actions).

## Imports / used by

**Imports:** [hooks.js](hooks.md) (`appendLogLine`)

**Used by:** [app.js](../app.md), [console.js](console.md), [setup.js](setup.md)

## Exports

| Name | Role |
|------|------|
| `postJson` | `POST` JSON; `null` on error |
| `requestJson` | Any method; `{ ok, data, message, status }` |
| `browseFolder` / `browseIntoInput` | `POST /api/workspace/browse` |

## Tests

None (HTTP covered in [http.test.mjs](../../../../test/http/http.test.mjs)).

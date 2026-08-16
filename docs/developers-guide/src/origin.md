# `src/origin.mjs`

CSRF-style gate for `/api/*`. Missing `Origin` (curl, same-origin some clients) is allowed. A present `Origin` must be this process’s overview URL.

## Imports / used by

**Imports:** none from `src/`

**Used by:** [server.mjs](server.md) `handleApi` — first check, 403 `forbidden_origin`

## Exports

| Name | Role |
|------|------|
| `isLocalOrigin(origin, { host, port })` | `true` if missing/empty or in the allow set |

## How it works

Allowed when present: `http://<host>:<port>`, `http://127.0.0.1:<port>`, `http://localhost:<port>` (defaults `127.0.0.1` / `4174`). Not a token scheme — loopback bind is the other half of the model.

## Tests

[`test/origin.test.mjs`](../../../test/origin.test.mjs)

# `public/sw.js`

Service worker for installability only. No `fetch` handler and no Cache Storage — UI, `/api/*`, and SSE always hit the network.

## Imports / used by

**Used by:** [app.js](app.md) registers `/sw.js` once on load (errors swallowed).

## Exports

None.

## How it works

`install` → `skipWaiting()`. `activate` → `clients.claim()`. That is the whole file.

Do not add a fetch listener that caches `/api/*` or EventSource. Offline support is out of scope.

## Tests

None.

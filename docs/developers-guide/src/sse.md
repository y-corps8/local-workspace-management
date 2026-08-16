# `src/sse.mjs`

Minimal Server-Sent Events helpers. A dead client must not take down the rest of the dashboard.

## Imports / used by

**Imports:** none from `src/`

**Used by:** [server.mjs](server.md) — `broadcast` and the initial `/api/events` `status` frame

## Exports

| Name | Role |
|------|------|
| `writeSseEvent(res, event, data)` | `event:` + JSON `data:` + blank line |
| `broadcastSse(clients, event, data)` | Write to every client; delete on throw |

## How it works

`clients` is a `Set` of HTTP responses. The server adds on `GET /api/events` and removes on `close`. Event names and when they fire live on [server.md](server.md).

## Tests

[`test/sse.test.mjs`](../../../test/sse.test.mjs)

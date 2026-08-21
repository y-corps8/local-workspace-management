# `src/jobs/metro-actions.mjs`

Expo / Metro live actions while a long-running command is up. `kind` / `method` / `params` stay server-side — [publicCommand](../config/commands.md) strips them.

Port parsing lives in [metro.md](metro.md). This module talks to Metro / simctl / adb / the editor.

## Imports / used by

**Imports:** [commands.mjs](../config/commands.md), [job-logs.mjs](job-logs.md), [metro.mjs](metro.md), [open-external.mjs](../cli/open-external.md), [browse.mjs](../http/browse.md) (`whichBin`)

**Used by:** [jobs.mjs](jobs.md) `noteMetroPort` / `interactJob`

## Exports

| Name | Role |
|------|------|
| `jobHasExpoInteractions` | Command has Expo live actions |
| `noteMetroPort` / `scanJobMetroPort` | Parse port from a log line or the job’s logs |
| `dispatchInteraction` | Metro WS, iOS `simctl`, Android `adb`, web URL, debugger, editor |

## How it works

Live actions prefer the port parsed from that job’s logs; leftover `metroPort` on the project is a fallback until logs print a URL. Scheme comes from `expoDevClientScheme` (default `app`). Metro WebSocket and inspector calls go to `127.0.0.1` only. Metro message socket requires `version: 2`.

## Tests

Port parsing: [`test/metro.test.mjs`](../../../../test/jobs/metro.test.mjs). No live Metro / simctl tests.

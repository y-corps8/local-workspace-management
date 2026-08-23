# `src/jobs/metro.mjs`

Parse an Expo / Metro dev-server port from a log line. Used so live Reload / iOS / Android do not need a setup field.

## Imports / used by

**Imports:** none from `src/`

**Used by:** [metro-actions.mjs](metro-actions.md) `noteMetroPort` / `scanJobMetroPort`

## Exports

| Name | Role |
|------|------|
| `parseMetroPortFromText` | Port or `null` |

## How it works

Matches, in order:

1. `port N is busy, using M`
2. `metro waiting on` / `web is waiting on` / `waiting on` plus an `http(s)` or `exp(s)://` URL
3. `exp://` / `exps://` links (last match with a valid port wins)

Ignores arbitrary `http://` in stack traces. The file does not store `metroPort`; [metro-actions.md](metro-actions.md) `metroSettings` uses the job’s parsed port, then in-memory `8081`.

## Tests

[`test/metro.test.mjs`](../../../../test/jobs/metro.test.mjs)

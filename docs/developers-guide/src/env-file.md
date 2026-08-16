# `src/env-file.mjs`

Parse a project `.env` and merge it onto the child spawn env. No interpolation or command expansion.

## Imports / used by

**Imports:** none from `src/`

**Used by:** [server.mjs](server.md) `spawnEnv()`

## Exports

| Name | Role |
|------|------|
| `parseEnvFile` | `KEY=VALUE`, `#` comments, optional `export`, single/double quotes |
| `applyEnvFile` | Copy keys onto env; **append** `PATH`, never replace it |

## How it works

`server.mjs` already prepends Homebrew / `/usr/local/bin` / `~/.local/bin` to PATH. A project `.env` `PATH` is appended so those extras stay. Unquoted values may strip an inline ` #` comment.

## Tests

[`test/env-file.test.mjs`](../../../test/env-file.test.mjs)

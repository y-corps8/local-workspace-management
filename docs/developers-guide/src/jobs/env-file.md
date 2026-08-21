# `src/jobs/env-file.mjs`

Parse a project `.env` and merge it onto the child spawn env. No interpolation or command expansion.

## Imports / used by

**Imports:** none from `src/`

**Used by:** [jobs.mjs](jobs.md) `spawnEnv()`

## Exports

| Name | Role |
|------|------|
| `parseEnvFile` | `KEY=VALUE`, `#` comments, optional `export`, single/double quotes |
| `applyEnvFile` | Copy keys onto env; **append** `PATH`, never replace it; skip the denylist |

## How it works

`spawnEnv` already prepends Homebrew / `/usr/local/bin` / `~/.local/bin` to PATH. A project `.env` `PATH` is appended so those extras stay. Unquoted values may strip an inline ` #` comment.

Skipped keys (loader injection / interpreter flags): `NODE_OPTIONS`, `NODE_PATH`, `LD_PRELOAD`, `DYLD_*`, `PYTHONPATH`, `JAVA_TOOL_OPTIONS`, `DOTNET_STARTUP_HOOKS`, `BASH_ENV`, `ENV`, `PERL5OPT`, `RUBYOPT`.

## Tests

[`test/env-file.test.mjs`](../../../../test/jobs/env-file.test.mjs) — comments, quotes, PATH append, denylist.

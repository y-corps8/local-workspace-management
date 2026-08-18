# `src/prompt.mjs`

Detect blocking choice / confirm / press-enter prompts from recent job log text. Free-text questions return `null` — Console has overlay buttons only, no stdin line and no toolbar Yes / No / Enter.

## Imports / used by

**Imports:** none from `src/`

**Used by:** [server.mjs](server.md) (`detectPrompt`, `publicPrompt`, `promptsEqual`) after each log chunk (300ms debounce)

## Exports

| Name | Role |
|------|------|
| `stripAnsi` | Remove CSI / OSC sequences |
| `detectPrompt` | `{ kind: "confirm" \| "choice" \| "enter", question, options }` or `null` |
| `publicPrompt` | Cap question (400), options (12), labels/values |
| `promptsEqual` | JSON equality so unchanged prompts do not rebroadcast |

## How it works

Scans the last completed lines plus unfinished stdout/stderr (`job.partials`). Recognizes Inquirer-style lists, numbered menus, y/n tails, and “Press Enter / Return / any key” waits. Ignores Expo “press r” help and stack frames. Idle servers with no matching log line are not treated as waiting.

`publicPrompt` is what goes on `publicJob`. The UI POSTs `option.value` via `/api/stdin` from the Console overlay only.

## Tests

[`test/prompt.test.mjs`](../../../test/prompt.test.mjs)

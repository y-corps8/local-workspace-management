# `public/js/hooks.js`

Late-bound callbacks so [console.js](console.md) / [setup.js](setup.md) / [render.js](render.md) / [api.js](api.md) can call orchestrator functions without import cycles. [app.js](../app.md) `Object.assign`s real implementations after modules load.

## Exports

`hooks` object: `render`, `fetchStatus`, `loadLogs`, `appendLogLine`, `appendLogLines`, `updateLogChrome`, `selectJob`, `runCommand`, `stopCommand`, `interactCommand`, `sendJobStdin`, `openSetup`, `openProjectForm`, `persistSetupOrder`, `expandOutput`, `openConfirm`.

## Tests

None.

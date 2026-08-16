# Documentation

Local workspace management is a loopback-only dashboard. The browser never sends a shell string — only a command id from the allowlist built from `workspace.json`.

## How the pieces connect

```
browser / native WebView window   →  public/ (UI)  →  src/server.mjs (HTTP + jobs)
                                                     ├─ src/commands.mjs   (allowlist, workspace.json)
                                                     ├─ src/package-manager.mjs
                                                     ├─ src/app-window.mjs (--window wrapper)
                                                     ├─ src/prompt.mjs     (choice / confirm from logs)
                                                     └─ src/test-results.mjs (.cache + project artifacts)
```

1. [`npm start`](npm-scripts.md) launches [`src/server.mjs`](../src/server.mjs) on `127.0.0.1:4174` and prints the URL (does not open a browser). [`start:browser`](npm-scripts.md) also opens the URL in the default browser. `start:window` runs [`src/app-window.mjs`](../src/app-window.mjs); closing that window stops the server.
2. The server serves [`public/`](developers-guide/public/index.md) and exposes `/api/*`.
3. [`src/commands.mjs`](../src/commands.mjs) loads [`workspace.json`](workspace-config.md) and builds the command allowlist.
4. [`src/test-results.mjs`](../src/test-results.mjs) fills the last-run cards from Jest/Maven artifacts plus `.cache/last-test-runs.json`.
5. [`src/prompt.mjs`](../src/prompt.mjs) reads a running job’s unfinished log line for Yes/No, choice, and press-enter prompts (overlay buttons only).

## Pages

| Page | What it covers |
|------|----------------|
| [user-guide.md](user-guide.md) | How to use the dashboard (click-through) |
| [npm-scripts.md](npm-scripts.md) | `npm start`, `start:browser`, `start:window`, `npm test` |
| [workspace-config.md](workspace-config.md) | `workspace.json` fields, command groups, security model |
| [test-results.md](test-results.md) | Jest/Maven paths, snapshot merge |
| [developers-guide/](developers-guide/README.md) | Code map — what each `src/` and `public/` file does |

The root [README](../README.md) is the short getting-started guide.

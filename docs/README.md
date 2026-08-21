# Documentation

Local workspace management is a loopback-only dashboard. The browser never sends a shell string — only a command id from the allowlist built from `workspace.json`.

## How the pieces connect

```
browser / native WebView window   →  public/ (UI)  →  src/server.mjs (CLI + listen)
                                                     ├─ src/http/     (static + /api/*)
                                                     ├─ src/jobs/     (spawn / stdin / logs)
                                                     ├─ src/config/   (allowlist, paths)
                                                     ├─ src/cli/      (upgrade, OS open)
                                                     └─ src/window/   (--window WebView)
```

1. [`npx @y-corps/locws start`](npm-scripts.md) / [`npm start`](npm-scripts.md) launches [`src/server.mjs`](../src/server.mjs) on `127.0.0.1:4174` (or `OVERVIEW_PORT`) and prints the URL (does not open a browser). [`start:browser`](npm-scripts.md) / `locws start --browser` also opens the URL in the default browser. `start:window` / `locws start --window` runs [`src/window/app-window.mjs`](../src/window/app-window.mjs); closing that window stops the server. `locws upgrade` does not start the server.
2. [`src/http/overview-http.mjs`](../src/http/overview-http.mjs) serves [`public/`](developers-guide/public/index.md) and exposes `/api/*`. Jobs live in [`src/jobs/jobs.mjs`](../src/jobs/jobs.mjs).
3. [`src/config/commands.mjs`](../src/config/commands.mjs) loads [`workspace.json`](workspace-config.md) (clone: repo root; packaged: `~/.config/locws/`) and builds the command allowlist.
4. [`src/jobs/test-results.mjs`](../src/jobs/test-results.mjs) fills the last-run cards from Jest/Maven artifacts plus last-test snapshots under `CACHE_DIR`.
5. [`src/jobs/prompt.mjs`](../src/jobs/prompt.mjs) reads a running job’s unfinished log line for Yes/No, choice, and press-enter prompts (overlay buttons only).

## Pages

| Page | What it covers |
|------|----------------|
| [user-guide.md](user-guide.md) | How to use the dashboard (click-through) |
| [npm-scripts.md](npm-scripts.md) | `locws start`, `npm start`, `start:browser`, `start:window`, `locws upgrade`, `npm test` |
| [workspace-config.md](workspace-config.md) | `workspace.json` fields, command groups, security model |
| [test-results.md](test-results.md) | Jest/Maven paths, snapshot merge |
| [developers-guide/](developers-guide/README.md) | Code map — what each `src/` and `public/` file does |

The root [README](../README.md) is the short getting-started guide.

# Contributing

Thanks for considering a contribution. **Bugs, features, and pull requests** go in public GitHub issues and PRs. Report **vulnerabilities** privately — see [SECURITY.md](SECURITY.md).

## Requirements

- **Node.js 20.6+** (`npm test` uses `node --import`)
- No extra npm packages, bundler, or Electron. Do not add a client-side build step unless the project explicitly needs one.

## Setup

```bash
git clone https://github.com/y-corps8/local-workspace-management.git
cd local-workspace-management
npm start
```

Copy `http://127.0.0.1:4174` into a browser. Ctrl+C stops the server. Other start modes: [docs/npm-scripts.md](docs/npm-scripts.md).

Do not commit `workspace.json` or `.cache/`. Copy [workspace.example.json](workspace.example.json) if you need a sample config locally.

## Tests

```bash
npm test
```

That is `node --test` with [test/preload.mjs](test/preload.mjs) (`OVERVIEW_SKIP_WORKSPACE_LOAD=1`) so tests never read or write your `workspace.json`.

## Layout

New server code goes in `src/`. New UI assets go in `public/` (icons in `public/assets/`). Do not flatten that split.

The code map is [docs/developers-guide/README.md](docs/developers-guide/README.md) — one page per source file. If you add or rename a `src/` or `public/` file, add or update the matching page there.

AIs working in this repo should follow [AGENTS.md](AGENTS.md).

## Pull requests

- Run `npm test` before you open a PR.
- If user-facing behavior changed, update an existing page under `docs/` (or the root [README.md](README.md)). Do not add a new user-facing markdown page for a small `src/` helper.
- Do not include `workspace.json`, `.cache/`, or personal project paths.
- Keep the dashboard bound to loopback (`127.0.0.1`). The browser must send allowlisted command **ids** only — never a shell string.

## Issues

Use the bug or feature templates when they fit. Do not paste your live `workspace.json` (it has local paths). Describe the setup in words, or redact paths.

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

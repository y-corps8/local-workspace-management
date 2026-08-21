# Contributing

Thanks for considering a contribution. **Bugs, features, and pull requests** go in public GitHub issues and PRs. Report **vulnerabilities** privately — see [SECURITY.md](SECURITY.md).

## Requirements

- **Node.js 20.6+** (`npm test` uses `node --import`)
- No extra npm packages, bundler, or Electron. Do not add a client-side build step unless the project explicitly needs one.

## Setup

To run the dashboard locally (you do not need a fork for this):

```bash
git clone https://github.com/y-corps8/local-workspace-management.git
cd local-workspace-management
npm start
```

Copy `http://127.0.0.1:4174` into a browser. Ctrl+C stops the server. Other start modes: [docs/npm-scripts.md](docs/npm-scripts.md). Users who are not contributing can `npx locws start` or `npm install -g locws` then `locws start` instead.

A clone stores `workspace.json` at the **repo root** (gitignored), not under `~/.config/locws/`. Do not commit `workspace.json` or `.cache/`. Copy [workspace.example.json](workspace.example.json) if you need a sample config locally.

To send a change, fork and open a pull request — see [How to contribute](#how-to-contribute).

## Tests

```bash
npm test
```

That is `node --test` with [test/preload.mjs](test/preload.mjs) (`OVERVIEW_SKIP_WORKSPACE_LOAD=1`) so tests never read or write your `workspace.json`.

## Layout

New server code goes in `src/<domain>/` (`http`, `jobs`, `config`, `window`, or `cli`). Keep `src/server.mjs` as the bin entry. New UI assets go in `public/` (icons in `public/assets/`). Do not flatten that split.

The code map is [docs/developers-guide/README.md](docs/developers-guide/README.md) — one page per source file. If you add or rename a `src/` or `public/` file, add or update the matching page there.

AIs working in this repo should follow [AGENTS.md](AGENTS.md).

## How to contribute

1. **Prefer an issue first.** Use the bug or feature templates when they fit. Comment on an existing issue, or open one, before a large change. Report vulnerabilities privately — see [SECURITY.md](SECURITY.md).
2. **Fork** [y-corps8/local-workspace-management](https://github.com/y-corps8/local-workspace-management) on GitHub, then clone **your fork** (not a push to the org `main`):

   ```bash
   git clone https://github.com/<your-username>/local-workspace-management.git
   cd local-workspace-management
   ```

3. **Branch** off `main`:

   ```bash
   git checkout -b your-change
   ```

4. **Run** the app (`npm start`) and tests (`npm test`) as in [Setup](#setup) and [Tests](#tests).
5. **Push** the branch to your fork and **open a pull request** against `y-corps8/local-workspace-management` `main`.

## Pull requests

- Run `npm test` before you open a PR.
- If user-facing behavior changed, update an existing page under `docs/` (or the root [README.md](README.md)). Do not add a new user-facing markdown page for a small `src/` helper.
- Do not include `workspace.json`, `.cache/`, or personal project paths.
- Keep the dashboard bound to loopback (`127.0.0.1`). The browser must send allowlisted command **ids** only — never a shell string.

## Issues

Use the bug or feature templates when they fit. Do not paste your live `workspace.json` (it has local paths). Describe the setup in words, or redact paths.

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Releases

Once a pull request is **approved and merged to `main`**, those changes ship in the **next released version** of `locws` on npm. Only [CODEOWNERS](.github/CODEOWNERS) publish. GitHub Releases trigger [publish.yml](.github/workflows/publish.yml): the tag must be `v` plus `package.json` `version`.

- **Pre-release** (tag like `v0.1.1-beta.1`, version contains `-`) → npm dist-tag **`beta`**. Testers: `npx locws@beta` or `npm install -g locws@beta`.
- **Full release** (tag like `v0.1.1`, version is `x.y.z` only) → npm **`latest`**. `npx locws` / `locws upgrade` stay on this tag (`npm install -g locws@latest`).

A GitHub pre-release with a stable version, or a full release with a prerelease version, fails the job. `locws upgrade` never installs `beta`.

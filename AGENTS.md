# Agent instructions

Loopback dashboard at `127.0.0.1:4174`. The browser POSTs command **ids** only — never a shell string. How the pieces connect: [docs/README.md](docs/README.md).

## Layout (do not flatten)

```
src/                    Node server — server.mjs, commands.mjs, test-results.mjs, app-window.mjs, prompt.mjs, plus small helpers
public/                 UI only — index.html, app.js, styles.css; icons in assets/
docs/                   User-facing understanding docs (not one page per module)
docs/developers-guide/  Code map for contributors (one page per source file)
.github/                Issue/PR templates and CI
workspace.json          gitignored runtime config (template: workspace.example.json)
.cache/                 gitignored last-run snapshots and native window helpers
test/                   node:test fixtures (preload skips workspace.json)
```

Community files stay at the repo root (`CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `LICENSE`).

- New server code → `src/`
- New UI assets → `public/` (icons → `public/assets/`)

## Path roots

- [`src/commands.mjs`](src/commands.mjs) `APP_ROOT` is the **repo root** (`src/` parent). Do not reset it to `src/`.
- [`src/server.mjs`](src/server.mjs) `STATIC_ROOT` is `public/` so `src/` and `docs/` are not served.
- `workspace.json` and `.cache/` stay at the repo root.
- Project `path` is per project: absolute or `~/...`. There is no user-chosen workspace folder. Leftover relative paths resolve against `APP_ROOT`.

## npm

`start` / `start:browser` / `start:window` run `node src/server.mjs`. `start` prints the loopback URL and does **not** `open` it. `start:browser` (`--browser`) may `open` the loopback URL in the default browser (no `-n`, no `-a`) so an already-open Chrome/Safari gets a tab. `--window` / `--open` (`start:window`) opens a native WebView via [`src/app-window.mjs`](src/app-window.mjs): macOS Swift WKWebView `.app` (`open -W` without `-n`, Dock icon from `public/assets/`), Linux WebKitGTK (Python GI or `cc` + GTK), Windows `csc` + WebView2. Closing that window stops the Node process. Do not spawn Chrome for the dashboard window. Do not `open` the URL in the default browser from window mode or from bare `start`. `npm test` is `node --test` with `test/preload.mjs` (`OVERVIEW_SKIP_WORKSPACE_LOAD=1`). No extra npm packages, no bundler, no Electron. Do not add a client-side build step unless the project explicitly needs one.

## Security

- Keep the bind on loopback (`127.0.0.1`). Do not listen on `0.0.0.0` or another interface.
- Do not add a client-supplied argv or shell path. Run accepts an allowlisted `id` only. Stop / stdin / restart / interact accept that id or a still-running job. Stdin is `{ id, text }` to that process, not a new shell.
- Reject `/api/*` when `Origin` is present and not this loopback URL.
- `publicCommand` must not leak `argv` or Metro `kind` / `method` / `params`.

## Docs

User-facing pages live under `docs/*.md` (not one page per module). Do not add a user-facing markdown page when adding a small `src/` helper. Keep the root [README.md](README.md) as the short getting-started guide. Only extend an existing kept page under `docs/` if the user-facing behavior changed.

The code map is [docs/developers-guide/](docs/developers-guide/README.md) — one page per source file. When you add or rename a `src/` or `public/` file, add or update the matching page there. Contributor rules stay in this file.

## Test overview

Last test runs is **opt-in**, default off (`showTestOverview: false`). Do not show it in first-run setup or on add/edit forms. Users can enable it later from the **Settings** list; the checkbox persists immediately. Test command buttons on project cards stay as part of project setup. Keep [`src/test-results.mjs`](src/test-results.mjs); skip `readAllLastTestRuns` in status when the flag is off.

## Command groups

Suggested examples: `run`, `database`, `seed`, `test`, `tools`. Do not hardcode that list as the only groups in the UI. Cards and setup must accept any slug (`lint`, `deploy`). Setup groups commands under section headings; each row has a Group text input (any slug). Probe may still guess the suggested five. Old `tooling` slugs load as `tools`.

## package.json

Managed Node projects need `<path>/package.json` `scripts` for probe and package-manager buttons (npm, pnpm, yarn, or bun — detected at run time). Disable those commands that are missing from that file (or if the folder / package.json is missing). Custom `argv` is exempt. Setup recommends a `package.json` (create one or Browse a Node project) but still allows a custom command name + command from the form after Probe, with or without package.json. Path is edited in **Settings** (Add/Edit form; **Browse** is `POST /api/workspace/browse`). Display **name** is free text; **id** stays a slug. This repo’s `package.json` is `npm start` / `start:browser` / `start:window` / `npm test` (no extra packages).

## Expo Metro

Metro port is read from the running job’s logs (not a setup field). Expo dev-client scheme comes from Probe (`app.json` `expo.scheme`, default `app`) and is stored on the project (`expoDevClientScheme`). Live Reload / iOS / Android use that job’s detected port and the project’s scheme. Legacy `metroPort` in `workspace.json` is only a fallback until logs print a URL.

## UI

- Do not auto-open setup on an empty dashboard. Show the empty panel; **Add project** opens the portal.
- One **Add project** control at a time: empty panel when there are no repos, header button when cards exist. Do not show setup **Add a project** while the project form is open.
- **Add Project** writes `workspace.json` and returns to the dashboard. Do not show the setup project list on the Add project form. There is no **Save setup**.
- Do not show a save-empty-setup page. **Cancel** on an Add project form opened from the dashboard closes to the dashboard. **Cancel** on an Add form opened from Settings returns to the Settings list (including when there are still no projects).
- **Settings** gear is always visible (tooltip **Settings**), including the empty dashboard. The sheet title is **Settings** on the list, **Add a project** on the add form, and **Edit {name}** on the edit form. **Appearance** (Light / Dark) is on that list only (hidden on add/edit), including when there are no projects, and persists immediately in `localStorage` (`overview.theme`). Do not put theme in `workspace.json`. Default is dark. Do not follow `prefers-color-scheme`.
- The Settings list always includes the project list area and **Add a project** (including zero projects; empty-state copy when none). Hidden on add/edit. **Show last test runs** is on the Settings list only when there is at least one project (including hidden). Hidden on add/edit. The test-overview checkbox saves on toggle. **Show on dashboard** hides a project without deleting it (`hidden: true` in `workspace.json`). **Update project** persists and returns to the list. Confirmed **Remove** persists immediately; if no projects remain, stay on Settings with the empty list and **Add a project**. Path is not edited on the card.
- Card **⋯** (beside the running chip) opens Edit (Settings form) or Delete (same confirm as Remove). Drag handle does not change color on hover. Project **description** is omitted on the card when blank.
- Dashboard card order is the `projects` array order. Drag a handle on Settings rows or dashboard cards; the new order saves on drop. Hidden projects stay in the array (and in Settings) but are omitted from cards, health pills, and last-test cards. If every project is hidden, keep **Settings** and do not treat that as first-run.
- Project **description** (max 50) is the card subtitle when set; omit the line when blank. Legacy `role` is copied into `description` on load and dropped on save.
- Form controls (checkboxes) use `--accent`. Do not leave the OS default blue.
- Setup lists custom `argv` as editable rows (multiple, including after save): name, command, group, long-running, destructive. **Add custom command** after Probe. Do not collapse back to a single add-only field. Keep `script` stable when the button label changes. Project command **label** is lowercase (`start`, `test`). Do not show a hover tip on card command buttons. Settings, refresh, health pills, and Expo toolbar tips stay.
- Console has no stdin line. Do not add one unless product asks again. Choice / confirm / press-enter prompts use a blur overlay on that tab (parsed buttons) via `POST /api/stdin`. Do not put **Yes** / **No** / **Enter** on the toolbar. Free-text prompts are out of scope. Do not treat npm/Gradle ASCII `>` log prefixes as choice prompts; Inquirer menus use `❯`.
- Console height is user-resizable (drag the handle above the console, or ArrowUp / ArrowDown on that handle) and persisted in `localStorage` (`overview.consoleHeight`). Height changes only while the pointer is held; it locks on release. Collapse is persisted the same way (`overview.consoleCollapsed`). Collapsing Console pauses log painting; expand reloads the current job. Theme is persisted the same way (`overview.theme`, `light` or `dark`). The Console dock stays dark in both themes (terminal chrome and logs); Appearance only changes the page around it. Filter logs is only on the title row while the console is expanded. First visit with no stored preference starts collapsed when there are no jobs, and uses the dark theme. Do not add a health poll.
- PWA assets live in `public/` (`manifest.webmanifest`, `sw.js`) and `public/assets/` (icons). The service worker must not cache `/api/*` or SSE. Do not add Electron, Playwright, or a bundler for a standalone window. `start:window` opens a native WebView (macOS WKWebView `.app` + `open -W` without `-n`, Linux WebKitGTK, Windows WebView2) with the `public/assets/` icon. Closing that window stops the server. Do not spawn Chrome for that window. Do not `open` the URL in the default browser from window mode or from bare `start`.

## Health pills

Green if that project has a **long-running** job started from this dashboard, or if TCP `127.0.0.1:port` is open on the last `buildStatus()` / **refresh** (`GET /api/status`). Starting or stopping a long-running command already rebuilds light status, so the pill follows that job — do not add a watch, retry loop, or health poll interval. Refresh is the icon to the right of Settings (when projects exist), for a check you did not trigger from a command. A **Checked … ago** label next to refresh is relative time from `generatedAt` (or the last status/health payload). A short client timer may rewrite that string only — it must not call `/api/status`.

## Jobs and workspace

Stop/stdin/restart by live job id if the allowlist dropped that command. After each log chunk, detect choice prompts from `job.partials` (see [`src/prompt.mjs`](src/prompt.mjs)) and put `prompt` on the public job. Batch log SSE (~80ms) so two running commands do not flood the UI. Clear the SIGKILL timer on finalize. Shutdown SIGTERM then SIGKILL. Atomic `workspace.json` writes (temp under `.cache/`, then rename); keep last-good in memory on corrupt JSON; watch the file for external edits (ignore directory events with a null filename and `.workspace.*.tmp`). Yarn/pnpm/bun at `resolveArgv`; on Windows spawn `npm.cmd` / `pnpm.cmd` / `yarn.cmd` / `bun.exe`. `jestJson` only for Jest. Child `.env` must not replace dashboard PATH extras (append project PATH entries). Job start/stop broadcasts light status (skip git); restart finalize must not double-rebuild.

## Git

Do not commit, amend, or push until the user has validated the work **and** explicitly asks to commit. Checking out or creating a branch is not a commit request. A plan that says "land with a PR" is not permission to commit on its own.

## Adding rules

Append new bullets here, or add a headed section below. Do not create a second agent file; later AIs should keep reading this one.

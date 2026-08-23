# Workspace config (`workspace.json`)

Runtime config for projects and command buttons. **Either** setup path is valid; both only write this one file:

1. **Portal** — first-run / **Settings** in the dashboard. Add, Update, confirmed Remove, **Show on dashboard**, drag-to-reorder, and the Settings **Show last test runs** checkbox write `workspace.json` and reload in memory (no process restart). **Export workspace** / **Import workspace** on the Settings list download or replace this file (`PUT /api/workspace` after **Replace workspace?**). Light / Dark is a browser preference (`localStorage`), not this file. There is no **Save setup**.
2. **JSON** — copy [`workspace.example.json`](../workspace.example.json) (filled sample for checking the UI) to the live path below, or hand-edit. Restart after a manual edit.

There is no second config format. Portal setup does not store anything else.

## Where the file lives

| How you run | Live `workspace.json` |
|-------------|------------------------|
| Git clone (`npm start`) | `<repo>/workspace.json` (gitignored) |
| `npx @y-corps/locws` / `npm install -g @y-corps/locws` | `~/.config/locws/workspace.json` (Windows `%APPDATA%\locws\workspace.json`; `$XDG_CONFIG_HOME/locws/workspace.json` if set) |

Startup prints `Workspace file  …` so you can see which path this process is using. Clone and packaged installs do **not** share a file. Copy the JSON yourself if you switch from a checkout to `npx`.

Override both config and cache: `OVERVIEW_DATA_DIR=/some/folder` → `workspace.json` and `.cache/` under that folder.

```bash
cp workspace.example.json workspace.json
npm start
```

- **Sample:** [`workspace.example.json`](../workspace.example.json)
- **Loader:** [`src/config/commands.mjs`](../src/config/commands.mjs) (`readRawWorkspace` / `readCleanWorkspace` / `writeRawWorkspace`)
- **Path rules:** [`src/config/paths.mjs`](../src/config/paths.mjs)

## Top-level fields

| Field | Meaning |
|-------|---------|
| `showTestOverview` | Optional last-run cards. Default `false`. Not shown in first-run or add/edit; enable on the **Settings** list (saves immediately) |
| `projects` | Array of project objects. Array order is dashboard card order |

Empty shape (the example file also has dummy projects you can copy to preview the UI):

```json
{
  "showTestOverview": false,
  "projects": []
}
```

Older files may still have `workspaceRoot`, top-level `metroPort` / `expoDevClientScheme`, per-project `metroPort`, or per-project `role`. Those keys are read once and stripped on save. Relative paths are rewritten to absolute against `workspaceRoot`. `role` is copied into `description` (max 50 characters) when `description` is missing. Top-level `expoDevClientScheme` is copied onto Expo projects that omit it. A leftover `metroPort` is used in memory for that process (then `8081`) until Metro logs print a URL; it is not written back.

## Each project

| Field | Meaning |
|-------|---------|
| `id` | Stable id: letters, numbers, hyphens, underscores. Used in command ids. Setup auto-slugs from **name** if id is empty |
| `name` | Card title (free text; spaces and punctuation allowed). Defaults to `id` |
| `description` | Short subtitle on the card (max 50 characters). Setup field **Description** |
| `hidden` | If `true`, omit from dashboard cards, health pills, and last-test cards. Still in Settings. Omit or `false` means shown |
| `path` | Absolute or `~/...`. Leftover relative paths: clone resolves against the repo root; packaged installs resolve against the home directory. Editable in Settings |
| `ports` | Optional number list (stored with the project; not shown on the card) |
| `testKind` | `jest` (default) or `maven` — which artifacts [test-results.md](test-results.md) reads. Probe may set this; the project form does not show a Tests select |
| `expoDevClientScheme` | Native URL scheme for iOS/Android open. Probe reads `expo.scheme` from `app.json` / `app.config.json` (default `app`) |
| `health` | Optional `{ "stack": "…", "port": 3000 }` for the health strip. Gold **Running** while a long-running command from the dashboard is running for that project, green **Port open** if the port is open on refresh / status rebuild with no such job, muted **Idle** otherwise. Not polled. |
| `primaryScript` | Optional. Must match a **non-destructive** command `script` on this project; otherwise dropped. That button is gold on the card. **Start primaries** runs idle visible primaries. |
| `commands` | Buttons on that card |

Duplicate `id`s are rejected.

## Each command

The allowlist id is **`projectId:script`**. The browser POSTs that id only — never a shell string.

Default argv is `npm run <script>`, except lifecycle scripts `npm start` / `npm test` (no `run`). Override with `argv` for Maven or anything else, e.g. `["./mvnw", "spring-boot:run"]`.

| Field | Purpose |
|-------|---------|
| `script` | Id suffix and default npm script name. Required unless `argv` is set |
| `group` | Section on the card. Any slug (`^[a-zA-Z0-9][a-zA-Z0-9_-]*$`). Empty or legacy `tooling` → `tools`. Examples below; type your own (`lint`, `deploy`) |
| `label` | Lowercase button text. Omit to use `script` |
| `hint` | Optional; muted line on the Settings command row. Not shown on the card (no hover tip on card buttons). Do not put argv here. |
| `longRunning` | Setup **Once | Long-running**. Once (omit / false) waits for exit. Long-running (`true`) treats it as a server: Stop, gold Running pill |
| `destructive` + `confirmTitle` / `confirmMessage` | In-page confirm before run |
| `jestJson` | Append Jest `--json --outputFile=coverage/jest-results.json` |
| `interactions` | `"expo"` for live Reload / Menu / iOS / …; omit otherwise |
| `argv` | Optional explicit command array (server-side allowlist only) |

`argv` must be a non-empty array of non-empty strings. Custom `interactions` arrays are invalid — use `"expo"` or omit.

### Groups

Not a closed list. Setup shows only groups that have scripts; each row has a Group text input (any slug). Cards build sections from the groups actually used (suggested order first, then custom).

| Example `group` | Section label |
|-----------------|---------------|
| `run` | Run (gold when no `primaryScript` is set) |
| `database` | Database |
| `seed` | Seed |
| `test` | Tests (`kind` becomes `test` so last-run snapshots persist) |
| `tools` | Tools (default; old `tooling` is rewritten to this) |
| `lint`, `deploy`, … | Title-cased slug (Lint, Deploy) |

## package.json

Node projects need `<path>/package.json` with a `scripts` object:

- Probe lists those keys as candidate buttons.
- Package-manager commands (`npm` / `pnpm` / `yarn` / `bun`) are **disabled** if the folder is missing, `package.json` is missing, or `script` is not a key in `scripts`. The card shows a short warning. The manager is detected from `packageManager` then lockfiles at **run** time.
- Commands with explicit `argv` (Maven `./mvnw`, `echo`, …) do not need that script key; they only need the folder to exist.

This dashboard’s own `package.json` is the **`locws`** CLI (`npm start` / `start:browser` / `start:window` / `npm test` for contributors; no extra packages).

## Security model

1. Server binds **loopback only** (`127.0.0.1`, port 4174 or `OVERVIEW_PORT`).
2. After setup, the server builds `COMMAND_BY_ID` from this file.
3. `/api/run` accepts `{ id }` from the allowlist. `/api/stop`, `/api/stdin`, `/api/restart`, `/api/interact` accept that id **or** a still-running job after the command was removed. Stdin is `{ id, text }` to that process, not a shell — Console sends it from overlay buttons, not a typed line. When a prompt is showing, only that prompt’s option values are accepted (max 200 characters); with no prompt the server returns `no_prompt`.
4. `/api/*` with a non-loopback `Origin` is `403`. A present `Host` that is not this loopback is `403` for **API and static**. Missing Origin/Host is allowed (curl). Responses send framing-deny headers and a CSP with `script-src 'self'` (no inline scripts).
5. `argv` and Metro method names stay on the server (`publicCommand` strips them).

Do not expose the dashboard port on a network interface. Anyone who can reach the port can start/stop whatever you allowlisted.

How to add and probe a project in the UI: [User guide](user-guide.md).

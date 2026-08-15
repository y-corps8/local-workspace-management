# Local workspace management

Localhost dashboard to run allowlisted commands across project folders on your machine. Bound to `127.0.0.1:4174` only — the browser never sends a shell string, only a command id.

You only need **this repo** open in the editor. Other apps are launched by filesystem path — adding them to the editor is optional and can slow the machine down.

## How to use it

```bash
cd path/to/local-workspace-management
npm run start:open
```

Opens [http://127.0.0.1:4174](http://127.0.0.1:4174). Use `npm start` if you do not want the browser opened.

**First run** (no projects yet) opens a setup flow: workspace folder, then add each project (paste path → Probe → pick command buttons). **Edit setup** in the top bar reopens the same flow so you can add, change path or commands, or remove. Save writes the config and reloads the dashboard in memory — no process restart.

- **Health pills** — TCP probes for whatever health ports you configured
- **Last test runs** — pass rate and coverage from the latest Jest/Maven artifacts
- **Projects** — one card per repo with grouped command buttons (Run, Database, Seed, Tests, Tooling)
- **Output** — live logs for the selected job; **Stop** / **Clear**; while an Expo run command is live, an action strip (Reload, Menu, iOS, Android, Web, Debugger, Editor, Inspect, Perf) matching the terminal help

Missing folders still show a card with the resolved path.

## Wiring a workspace

1. Set the workspace folder (relative to this repo, absolute, or `~/...`). Check folder, then Continue.
2. Paste a project path, Probe, check the commands to show, optionally set Expo live actions and a health port.
3. Add another project, or Save setup.

JSON is optional and advanced. The UI writes `workspace.json` (gitignored; see [workspace.example.json](workspace.example.json)). Hand-editing that file still works; restart the process afterward (in-app Save does not need a restart).

| Field | Meaning |
|-------|---------|
| `workspaceRoot` | Optional. Relative to **this repo**, or absolute / `~/...`. Default `.` |
| `projects[].path` | Relative to `workspaceRoot`, or absolute / `~/...` |
| `metroPort` | Expo Metro port for live actions (default `8081`) |
| `expoDevClientScheme` | Native URL scheme (default `app`) |

Each project:

1. **`id`**, **`name`**, **`role`**, **`path`**
2. **`ports`**, **`testKind`** (`jest` or `maven`)
3. **`health`** — optional TCP probe (`stack`, `port`)
4. **`commands`** — buttons on that card. The id is `projectId:script`. Default argv is `npm run <script>` (`npm start` / `npm test` without `run`). Override with `argv` for Maven or anything else (`["./mvnw", "spring-boot:run"]`)

Command fields:

| Field | Purpose |
|-------|---------|
| `group` | `run` \| `database` \| `seed` \| `test` \| `tooling` |
| `label`, `hint` | Button text and hover tip |
| `longRunning` | Treat as a server (Stop instead of waiting for exit) |
| `destructive` + `confirmTitle` / `confirmMessage` | In-page confirm |
| `jestJson` | Append Jest `--json --outputFile=coverage/jest-results.json` |
| `interactions` | `"expo"` for live Reload / Menu / iOS / …; omit otherwise |
| `argv` | Optional explicit command array (server-side allowlist) |

The browser never sends a shell string — only a command id from the allowlist the server builds after setup.

## Test report paths (last-run cards)

[`test-results.mjs`](test-results.mjs) reads artifacts **inside each project path**:

- Jest (`testKind: "jest"`): `<path>/coverage/jest-results.json`
- Maven (`testKind: "maven"`): `<path>/target/surefire-reports` (fallback `<path>/coverage/surefire-reports`)

Snapshots from this UI are written to `.cache/last-test-runs.json` (gitignored).

## Live Expo actions

Commands with `"interactions": "expo"` show Reload / Menu / iOS / Android / Web / Debugger / Editor / Inspect / Perf on the Output bar while they are running. Reload also sits next to **Stop** on the project card.

Adjust `metroPort` / `expoDevClientScheme` if Metro is not on `8081` or the scheme is not `app`.

## Security

Binds to loopback only. It can start, stop, seed, and send Metro actions for whatever you configured in setup — do not expose `:4174` on a network interface.

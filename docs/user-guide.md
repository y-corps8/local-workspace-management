# User guide

This page is how to use **Workspace overview**: start it, add your projects, run commands, and read the console. Setup stays on your computer. For one section per feature, see [Features](features.md).

## 1. Start

Install and run the CLI:

```bash
npx @y-corps/locws start
# or: npm install -g @y-corps/locws && locws start
```

Copy the address it prints (`http://127.0.0.1:4174`) into a browser. If that port is busy, start with `OVERVIEW_PORT` set to another port.

- Same app in a new browser tab: `locws start --browser`
- Its own window: `locws start --window` — closing that window stops the app
- Upgrade a global install: `locws upgrade`

From a git clone of this repo, `npm start` / `start:browser` / `start:window` are the same server. Details: [npm scripts](npm-scripts.md).

In the terminal, Ctrl+C stops it.

## 2. Empty dashboard

The first time, you see **No projects yet** and a primary **Add project** button. The gear in the header is **Settings**. **Console** stays collapsed at the bottom. The add form does not open by itself.

![Empty dashboard with No projects yet and Add project](images/empty-dashboard.png)

## 3. Add a project

Click **Add project** (on the empty panel, or **Add project** in the header once you already have cards).

1. Set **Path**: **Browse** or paste a folder (`~/Projects/my-app` or a full path). Commands start in that folder.
2. Click **Probe**. That lists commands it finds in that folder.
3. Fill **Name**. **Id** is under **Advanced** (leave it closed to generate from the name). **Description** is optional (short line on the card, counter at 50).
4. Tick the commands you want on the card. Unchecked Probe rows sit under **Available (N)** (closed). Drag a selected row to change order; drop onto another group to update **Group**. On each row, set **Once | Long-running**, **Safe | Destructive**, **Primary**, and **Group**. **How this works** (closed) explains every control.
5. Optional: pick **Primary** on a selected **Safe** command — that button is gold on the card. Primary stays unset until you pick one (not auto-selected on Probe or import). The radio stays on every row and is off when **Destructive** is selected or the command is unchecked. A still-valid saved primary is kept.
6. Optional: **Add custom command** for something Probe did not list (below Selected, above Available).
7. Optional: a **Health port** if you want a pill for that project at the top of the page.
8. Click **Add project**.

**Cancel** closes without adding.

### Command row

Each selected command is a two-line card. **How this works** on the form lists the same meanings:

- **Drag handle** (selected rows only) — reorder commands. Drop onto a row in another heading to change **Group**.
- **Checkbox** (left column) — show this command on the project card. Uncheck moves it to **Available**. Flags sit to the right of this column, not under it.
- **Once | Long-running** — Once finishes and the console shows the result (tests, seed, lint). Long-running stays up — use **Stop**; the health pill can show **Running**.
- **Safe | Destructive** — Destructive asks for confirm before run and cannot be Primary.
- **Primary** — gold button on the card and **Start primaries**. Off when Destructive or unchecked.
- **Group** — section heading on the card (`run`, `test`, `lint`, or any slug).
- **Trash** (custom commands only) — remove that custom command. Probe rows have no delete.

![Add a project form before Probe](images/add-project-form.png)

![Add a project form after Probe, with command rows](images/add-project-probed.png)

## 4. Your projects

Cards show the commands you picked, in groups. Each card has an **Idle**, **Running**, or **N running** chip. Drag the handle to change order. A blank description is not shown on the card. When the folder is a git repo, the current branch (and **dirty** if the tree has uncommitted changes) sits under the title — it updates when you load the page or click refresh, not when a command starts.

The gold button is the **Primary** command when you set one; otherwise the Run group stays gold. **Start primaries** in the Projects heading starts every visible idle primary (skips hidden and already running).

Type in **Filter projects** to match name, id, description, command, or branch. Escape in the field clears it. `/` focuses the filter. Zero matches: **No projects match** (no Add button there). Every command group on a card shows all of its buttons.

![Dashboard with project cards](images/dashboard.png)

The **⋯** menu on a card is **Edit** or **Delete**. **Cancel** or **Update project** on that Edit form returns to the dashboard.

![Project card menu with Edit and Delete](images/project-card-menu.png)

## 5. Run and stop

Click a command on a card. While it is running, that button stays highlighted; click it again to show that job in **Console**. Use **Stop**, **Restart**, or **Stop all** (when more than one command is running).

Red buttons ask you to confirm first: **Cancel** or **Run**.

Red buttons ask you to confirm first: **Cancel** or **Run**.

![Confirm before running a destructive command](images/confirm-destructive.png)

![A running command and the expanded Console](images/running-console.png)

## 6. Console

Click the Console chevron to expand it (`Ctrl` or `⌘` + `J`). Drag the handle above Console to resize — height follows only while you hold the pointer; it stays put when you release. While it is open, **Filter logs** is on the title row (kept in this browser until you clear it). Collapsing Console pauses painting (commands keep running); expand reloads the current job’s log. While collapsed, the title row shows which command is running (`Project · command`, plus **+ N more** and **waiting** if a prompt is up). **Stop all** stays hidden until you expand.

Each run gets a tab (`Project · command`). Switch tabs to change which log you are reading. **Clear** clears the current log. Close a tab with **×**.

If a command asks a question (Yes / No, a choice, or Press Enter), answer on the overlay over the log. Those buttons are not on the toolbar. There is no box to type into.

![Console waiting for a Yes or No choice](images/console-prompt.png)

## 7. Health

The colored pills next to **Overview** are gold **Running** while a long-running command for that project from this dashboard is running, green **Port open** if only that port was open on the last check, and muted **Idle** otherwise (not a failure). They are not a live port poll. Click a pill to scroll to that project card. Click refresh when you want a TCP check you did not just start or stop. **Checked … ago** is when that last snapshot ran. The card chip stays **Idle** when only the port is open.

## 8. Settings

Open the gear (`Ctrl` or `⌘` + `,` toggles the list; ignored while an add/edit form is open). The page title is **Settings**. Settings is its own page — the dashboard header, cards, and Console are hidden. Close, Escape, or `Ctrl`/`⌘` + `,` returns to the dashboard.

Keyboard: `/` focuses the project filter (ignored on Settings); `Ctrl` or `⌘` + `J` shows or hides Console (ignored on Settings); `Ctrl` or `⌘` + `,` opens or closes this list. Do not use `Ctrl`/`⌘` + `F`.

- **Appearance** — **Light** or **Dark** (default is Dark).
- **Show last test runs** — only listed when you have at least one project.
- **Export workspace** / **Import workspace** — download `workspace.json`, or replace this dashboard from a file (**Replace workspace?**). Invalid JSON keeps the current file.
- Project rows — drag to reorder, **Show on dashboard** to hide a project without deleting it, **Edit**, **Remove**.
- **Add project** next to **Projects**.

![Settings list with appearance, last test runs, and projects](images/settings.png)

**Edit** opens the same kind of form as add, with **Update project** instead of **Add project**. The lead on edit is about changing the folder or commands, not adding a repo. **Id** stays under **Advanced**. **Cancel** or **Update project** from Settings Edit stays on the Settings list.

![Edit project form with Update project](images/settings-edit.png)

## 9. Last test runs

In Settings, turn on **Show last test runs** if you want pass/fail cards above **Projects**. Until a test finishes, that section is one empty line — not a row of rings. Run a test command from a card; the overview updates when that run finishes. A passed run is a full green ring; a failed run is a full red ring. The number in the middle is the pass rate. Projects with no report yet are omitted from the grid. Click a last-test card to open that test job in Console if it is still listed, or to run the first Tests command on that project.

![Last test runs above the project cards](images/last-test-runs.png)

## 10. Expo

If you start an Expo app from a card, extra buttons appear on the Console toolbar while that job is running: **Reload**, **Menu**, **iOS**, **Android**, **Web**, **Debugger**, **Editor**, **Inspect**, **Perf**.

![Console toolbar with Expo actions](images/expo-actions.png)

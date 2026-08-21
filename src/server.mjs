#!/usr/bin/env node
/**
 * Start entry (npm start / locws start) and locws bin. Binds 127.0.0.1 (OVERVIEW_PORT, default 4174).
 * HTTP lives in http/overview-http.mjs. locws CLI help/upgrade/update are packaged-only.
 * Packaged `locws` needs a subcommand (`start`, `upgrade`, or `--help`).
 */
import { spawn } from "node:child_process";
import {
  HOST,
  OVERVIEW_URL,
  PORT,
  WORKSPACE_CONFIG_PATH,
  setWorkspaceChangeListener,
  startWorkspaceWatcher,
} from "./config/commands.mjs";
import { PACKAGED_INSTALL } from "./config/paths.mjs";
import { closeAppWindow, openAppWindow } from "./window/app-window.mjs";
import { openUrlArgs } from "./cli/open-external.mjs";
import { createOverviewApp } from "./http/overview-http.mjs";
import { checkForUpdate, helpText, parseLocwsArgv, runUpgrade, updateNoticeText } from "./cli/update-check.mjs";

const { server, runtime, broadcastStatus } = createOverviewApp({ host: HOST, port: PORT });

let shuttingDown = false;

/** Stop child process groups so Expo / Spring / Next do not outlive this server. */
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  runtime.shutdownJobs();
  closeAppWindow();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function openDefaultBrowser() {
  const { file, args } = openUrlArgs(OVERVIEW_URL);
  const child = spawn(file, args, { detached: true, stdio: "ignore" });
  child.on("error", (error) => {
    console.error("Failed to open default browser:", error.message);
  });
  child.unref();
  console.log("Opened default browser (existing window if one is running).");
}

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the other overview process, then try again.`);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});

async function main() {
  const cli = parseLocwsArgv();
  const usage = helpText({
    url: OVERVIEW_URL,
    workspacePath: WORKSPACE_CONFIG_PATH,
    packaged: PACKAGED_INSTALL,
  });
  if (cli.help) {
    console.log(usage);
    process.exit(0);
  }
  if (cli.upgrade) {
    const code = await runUpgrade();
    process.exit(code);
  }
  if (!cli.start) {
    console.log(usage);
    process.exit(1);
  }

  const notice = PACKAGED_INSTALL ? await checkForUpdate() : null;

  server.listen(PORT, HOST, () => {
    if (notice) console.error(updateNoticeText(notice));
    console.log(`Overview dashboard  ${OVERVIEW_URL}`);
    console.log("Bound to 127.0.0.1 — command runner is local-only.");
    console.log(`Workspace file  ${WORKSPACE_CONFIG_PATH}`);
    setWorkspaceChangeListener(() => {
      broadcastStatus();
    });
    startWorkspaceWatcher();
    if (cli.window) {
      openAppWindow({ onClosed: shutdown });
    } else if (cli.browser) {
      openDefaultBrowser();
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

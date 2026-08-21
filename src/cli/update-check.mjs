/**
 * Packaged CLI update check and `locws upgrade`.
 *
 * Notices print to stderr. The browser never sends a shell string — upgrade
 * argv is hardcoded npm install -g locws@latest.
 */
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { spawn } from "node:child_process";
import { resolveSpawnArgv } from "../config/package-manager.mjs";
import {
  APP_ROOT,
  CLI_NAME,
  NPM_PACKAGE_NAME,
  PACKAGED_INSTALL,
  WORKSPACE_CONFIG_PATH,
} from "../config/paths.mjs";

const REGISTRY_HOST = "registry.npmjs.org";
const FETCH_TIMEOUT_MS = 3000;

export function parseLocwsArgv(argv = process.argv.slice(2)) {
  const args = Array.isArray(argv) ? argv : [];
  const positionals = args.filter((part) => !String(part).startsWith("-"));
  const command = positionals[0] ?? "";
  return {
    help: args.includes("--help") || args.includes("-h"),
    start: command === "start",
    upgrade: command === "upgrade",
    browser: args.includes("--browser"),
    window: args.includes("--window") || args.includes("--open"),
  };
}

export function cloneHelpText({ url, workspacePath } = {}) {
  return [
    "Workspace overview — git clone",
    "",
    "Usage:",
    `  npm start                 Start and print ${url}`,
    "  npm run start:browser     Same, open the default browser",
    "  npm run start:window      Same, native WebView (closing the window stops the server)",
    "",
    `The ${CLI_NAME} CLI is for npm installs (npx ${NPM_PACKAGE_NAME}, npm install -g ${NPM_PACKAGE_NAME}).`,
    "Port: 4174, or OVERVIEW_PORT (integer 1–65535). Still binds 127.0.0.1 only.",
    `Workspace file: ${workspacePath ?? WORKSPACE_CONFIG_PATH}`,
  ].join("\n");
}

export function helpText({ url, workspacePath, packaged = PACKAGED_INSTALL } = {}) {
  if (!packaged) return cloneHelpText({ url, workspacePath });
  return [
    `${CLI_NAME} — localhost dashboard for allowlisted commands`,
    "",
    "Usage:",
    `  ${CLI_NAME} start              Start and print ${url}`,
    `  ${CLI_NAME} start --browser    Same, open the default browser`,
    `  ${CLI_NAME} start --window     Same, native WebView (closing the window stops the server)`,
    `  ${CLI_NAME} upgrade            Install the latest ${CLI_NAME} from npm (global)`,
    `  ${CLI_NAME} --help`,
    "",
    "Port: 4174, or OVERVIEW_PORT (integer 1–65535). Still binds 127.0.0.1 only.",
    `Workspace file: ${workspacePath ?? WORKSPACE_CONFIG_PATH}`,
  ].join("\n");
}

export function parseSemver(value) {
  const match = String(value ?? "").trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isPrerelease(value) {
  return /^\d+\.\d+\.\d+-/.test(String(value ?? "").trim());
}

/** True when latest is a higher x.y.z than current, or the same x.y.z while current is a prerelease. */
export function isNewerVersion(latest, current) {
  const next = parseSemver(latest);
  const prev = parseSemver(current);
  if (!next || !prev) return false;
  for (let i = 0; i < 3; i += 1) {
    if (next[i] > prev[i]) return true;
    if (next[i] < prev[i]) return false;
  }
  return isPrerelease(current) && !isPrerelease(latest);
}

export function updateNoticeText({ current, latest }) {
  return `New version available: ${latest} (current ${current})\nRun: ${CLI_NAME} upgrade`;
}

export function readInstalledVersion(appRoot = APP_ROOT) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"), "utf8"));
    return String(pkg.version || "").trim();
  } catch {
    return "";
  }
}

export function fetchLatestVersion({
  timeoutMs = FETCH_TIMEOUT_MS,
  packageName = NPM_PACKAGE_NAME,
  request = https.get,
} = {}) {
  return new Promise((resolve) => {
    const req = request(
      {
        hostname: REGISTRY_HOST,
        path: `/${String(packageName).replaceAll("/", "%2F")}/latest`,
        method: "GET",
        headers: { Accept: "application/json" },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
          if (body.length > 1_000_000) {
            req.destroy();
            resolve("");
          }
        });
        res.on("end", () => {
          try {
            const json = JSON.parse(body);
            resolve(String(json.version || "").trim());
          } catch {
            resolve("");
          }
        });
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve("");
    });
    req.on("error", () => resolve(""));
  });
}

export async function checkForUpdate({
  packaged = PACKAGED_INSTALL,
  skip = process.env.OVERVIEW_SKIP_WORKSPACE_LOAD === "1",
  appRoot = APP_ROOT,
  fetchLatest = fetchLatestVersion,
  currentVersion,
} = {}) {
  if (skip || !packaged) return null;
  const current = currentVersion ?? readInstalledVersion(appRoot);
  if (!current) return null;
  const latest = await fetchLatest();
  if (!latest || !isNewerVersion(latest, current)) return null;
  return { current, latest };
}

export function upgradeArgv(platform = process.platform) {
  return resolveSpawnArgv(["npm", "install", "-g", `${NPM_PACKAGE_NAME}@latest`], platform);
}

export function cloneUpgradeMessage() {
  return `This is a git clone, not an npm install. Use git pull and npm start. The ${CLI_NAME} CLI is for npm installs (npx ${NPM_PACKAGE_NAME}, npm install -g ${NPM_PACKAGE_NAME}).`;
}

export function upgradeSuccessMessage() {
  return `${CLI_NAME} is up to date. Start it with: ${CLI_NAME} start`;
}

export function runUpgrade({
  packaged = PACKAGED_INSTALL,
  spawnFn = spawn,
  platform = process.platform,
  log = console,
} = {}) {
  return new Promise((resolve) => {
    if (!packaged) {
      log.error(cloneUpgradeMessage());
      resolve(1);
      return;
    }
    const argv = upgradeArgv(platform);
    const child = spawnFn(argv[0], argv.slice(1), { stdio: "inherit" });
    child.on("error", (error) => {
      log.error(error.message || error);
      resolve(1);
    });
    child.on("exit", (code) => {
      if (code === 0) log.log(upgradeSuccessMessage());
      resolve(code ?? 1);
    });
  });
}

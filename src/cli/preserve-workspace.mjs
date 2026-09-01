/**
 * Copy clone/link workspace.json and last-test-runs.json into packaged user
 * dirs when those dest files are missing. Used only by locws upgrade.
 * Does not delete cache or config. Does not run on uninstall.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  APP_ROOT,
  CACHE_DIR,
  WORKSPACE_CONFIG_PATH,
  userCacheDir,
  userConfigDir,
} from "../config/paths.mjs";

export const LAST_TEST_RUNS_FILE = "last-test-runs.json";

function ioFrom(options) {
  return {
    existsSync: options.existsSync ?? fs.existsSync,
    readFileSync: options.readFileSync ?? fs.readFileSync,
    writeFileSync: options.writeFileSync ?? fs.writeFileSync,
    renameSync: options.renameSync ?? fs.renameSync,
    mkdirSync: options.mkdirSync ?? fs.mkdirSync,
  };
}

export function tryReadValidJsonText(filePath, io = ioFrom({})) {
  if (!filePath || !io.existsSync(filePath)) return null;
  try {
    const text = io.readFileSync(filePath, "utf8");
    JSON.parse(text);
    return text.endsWith("\n") ? text : `${text}\n`;
  } catch {
    return null;
  }
}

export function uniqueResolvedPaths(paths) {
  const seen = new Set();
  const out = [];
  for (const raw of paths) {
    const value = String(raw || "").trim();
    if (!value) continue;
    const key = path.resolve(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function copyJsonIfDestMissing({ dest, candidates = [], io = ioFrom({}), log = console, label = "file" } = {}) {
  if (!dest) return "missing";
  if (io.existsSync(dest)) return "exists";
  const destKey = path.resolve(dest);
  for (const src of uniqueResolvedPaths(candidates)) {
    if (path.resolve(src) === destKey) continue;
    const text = tryReadValidJsonText(src, io);
    if (!text) continue;
    try {
      io.mkdirSync(path.dirname(dest), { recursive: true });
      const tmp = path.join(path.dirname(dest), `.${path.basename(dest)}.${process.pid}.upgrade.tmp`);
      io.writeFileSync(tmp, text);
      io.renameSync(tmp, dest);
      return "copied";
    } catch (error) {
      log.error(`Could not preserve ${label}:`, error.message || error);
      return "error";
    }
  }
  return "missing";
}

/**
 * Copy into ~/.config/locws and ~/.cache/locws when dest files are absent.
 * Skips when OVERVIEW_DATA_DIR is set (config and cache already share that root).
 */
export function preservePackagedUserData({
  platform = process.platform,
  env = process.env,
  homedir = os.homedir(),
  appRoot = APP_ROOT,
  workspaceConfigPath = WORKSPACE_CONFIG_PATH,
  cacheDir = CACHE_DIR,
  log = console,
  existsSync = fs.existsSync,
  readFileSync = fs.readFileSync,
  writeFileSync = fs.writeFileSync,
  renameSync = fs.renameSync,
  mkdirSync = fs.mkdirSync,
} = {}) {
  if (String(env.OVERVIEW_DATA_DIR || "").trim()) {
    return { workspace: "skipped", lastTest: "skipped" };
  }
  const io = { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync };
  const destWorkspace = path.join(userConfigDir({ platform, env, homedir }), "workspace.json");
  const destLastTest = path.join(userCacheDir({ platform, env, homedir }), LAST_TEST_RUNS_FILE);
  const workspace = copyJsonIfDestMissing({
    dest: destWorkspace,
    candidates: [workspaceConfigPath, path.join(appRoot, "workspace.json")],
    io,
    log,
    label: "workspace.json",
  });
  const lastTest = copyJsonIfDestMissing({
    dest: destLastTest,
    candidates: [path.join(cacheDir, LAST_TEST_RUNS_FILE), path.join(appRoot, ".cache", LAST_TEST_RUNS_FILE)],
    io,
    log,
    label: LAST_TEST_RUNS_FILE,
  });
  return { workspace, lastTest };
}

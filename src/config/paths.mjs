/**
 * Package root vs user data (workspace.json and .cache).
 *
 * APP_ROOT is always the package/repo root (the directory that contains
 * package.json). Packaged installs (npx / npm -g) store config under the user
 * config dir, not inside node_modules.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CLI_NAME = "locws";
export const NPM_PACKAGE_NAME = "@y-corps/locws";

function pathApi(platform = process.platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

/** Directory that contains package.json, walking up from this module. */
export function appRootFrom(metaUrl) {
  let dir = path.dirname(fileURLToPath(metaUrl));
  while (true) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error("package.json not found");
    }
    dir = parent;
  }
}

export const APP_ROOT = appRootFrom(import.meta.url);

/** True when this install lives under a node_modules directory (npx, global, local npm). */
export function isPackagedInstall(appRoot, platform = process.platform) {
  const p = pathApi(platform);
  return p.normalize(String(appRoot || "")).split(p.sep).includes("node_modules");
}

export function userConfigDir({ platform = process.platform, env = process.env, homedir = os.homedir() } = {}) {
  const p = pathApi(platform);
  if (platform === "win32") {
    const roaming = env.APPDATA || p.join(homedir, "AppData", "Roaming");
    return p.join(roaming, CLI_NAME);
  }
  const xdg = String(env.XDG_CONFIG_HOME || "").trim();
  if (xdg) return p.join(xdg, CLI_NAME);
  return p.join(homedir, ".config", CLI_NAME);
}

export function userCacheDir({ platform = process.platform, env = process.env, homedir = os.homedir() } = {}) {
  const p = pathApi(platform);
  if (platform === "win32") {
    const local = env.LOCALAPPDATA || p.join(homedir, "AppData", "Local");
    return p.join(local, CLI_NAME);
  }
  const xdg = String(env.XDG_CACHE_HOME || "").trim();
  if (xdg) return p.join(xdg, CLI_NAME);
  return p.join(homedir, ".cache", CLI_NAME);
}

/**
 * Resolve cache + workspace.json locations.
 * OVERVIEW_DATA_DIR wins (tests / power users) and skips clone vs packaged dual-mode.
 */
export function resolveDataPaths({
  appRoot = APP_ROOT,
  platform = process.platform,
  env = process.env,
  homedir = os.homedir(),
} = {}) {
  const p = pathApi(platform);
  const override = String(env.OVERVIEW_DATA_DIR || "").trim();
  const packaged = isPackagedInstall(appRoot, platform);
  if (override) {
    const root = p.resolve(override);
    return {
      cacheDir: p.join(root, ".cache"),
      workspaceConfigPath: p.join(root, "workspace.json"),
      workspaceDir: root,
      packaged,
      relativePathBase: packaged ? homedir : appRoot,
    };
  }
  if (!packaged) {
    return {
      cacheDir: p.join(appRoot, ".cache"),
      workspaceConfigPath: p.join(appRoot, "workspace.json"),
      workspaceDir: appRoot,
      packaged: false,
      relativePathBase: appRoot,
    };
  }
  const configDir = userConfigDir({ platform, env, homedir });
  return {
    cacheDir: userCacheDir({ platform, env, homedir }),
    workspaceConfigPath: p.join(configDir, "workspace.json"),
    workspaceDir: configDir,
    packaged: true,
    relativePathBase: homedir,
  };
}

const resolved = resolveDataPaths({ appRoot: APP_ROOT });

export const CACHE_DIR = resolved.cacheDir;
export const WORKSPACE_CONFIG_PATH = resolved.workspaceConfigPath;
export const WORKSPACE_DIR = resolved.workspaceDir;
export const PATH_BASE = resolved.relativePathBase;
export const PACKAGED_INSTALL = resolved.packaged;

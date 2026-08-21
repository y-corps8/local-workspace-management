import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { APP_ROOT, appRootFrom, isPackagedInstall, resolveDataPaths } from "../../src/config/paths.mjs";

test("clone APP_ROOT keeps workspace.json and .cache at the repo root", () => {
  const appRoot = "/Users/me/Projects/local-workspace-management";
  assert.equal(isPackagedInstall(appRoot, "darwin"), false);
  const result = resolveDataPaths({
    appRoot,
    platform: "darwin",
    env: {},
    homedir: "/Users/me",
  });
  assert.equal(result.packaged, false);
  assert.equal(result.workspaceConfigPath, `${appRoot}/workspace.json`);
  assert.equal(result.cacheDir, `${appRoot}/.cache`);
  assert.equal(result.workspaceDir, appRoot);
  assert.equal(result.relativePathBase, appRoot);
});

test("packaged install under node_modules uses ~/.config/locws", () => {
  const appRoot = "/Users/me/.npm/_npx/abc/node_modules/locws";
  assert.equal(isPackagedInstall(appRoot, "darwin"), true);
  const result = resolveDataPaths({
    appRoot,
    platform: "darwin",
    env: {},
    homedir: "/Users/me",
  });
  assert.equal(result.packaged, true);
  assert.equal(result.workspaceConfigPath, "/Users/me/.config/locws/workspace.json");
  assert.equal(result.cacheDir, "/Users/me/.cache/locws");
  assert.equal(result.relativePathBase, "/Users/me");
});

test("XDG_CONFIG_HOME and XDG_CACHE_HOME override packaged unix dirs", () => {
  const result = resolveDataPaths({
    appRoot: "/opt/node_modules/locws",
    platform: "linux",
    env: { XDG_CONFIG_HOME: "/xdg/config", XDG_CACHE_HOME: "/xdg/cache" },
    homedir: "/home/me",
  });
  assert.equal(result.workspaceConfigPath, "/xdg/config/locws/workspace.json");
  assert.equal(result.cacheDir, "/xdg/cache/locws");
});

test("OVERVIEW_DATA_DIR wins over clone and packaged dual-mode", () => {
  const result = resolveDataPaths({
    appRoot: "/Users/me/.npm/_npx/abc/node_modules/locws",
    platform: "darwin",
    env: { OVERVIEW_DATA_DIR: "/tmp/locws-data" },
    homedir: "/Users/me",
  });
  assert.equal(result.workspaceConfigPath, "/tmp/locws-data/workspace.json");
  assert.equal(result.cacheDir, "/tmp/locws-data/.cache");
  assert.equal(result.workspaceDir, "/tmp/locws-data");
  assert.equal(result.relativePathBase, "/Users/me");
});

test("packaged Windows uses APPDATA and LOCALAPPDATA", () => {
  const appRoot = "C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\locws";
  assert.equal(isPackagedInstall(appRoot, "win32"), true);
  const result = resolveDataPaths({
    appRoot,
    platform: "win32",
    env: {
      APPDATA: "C:\\Users\\me\\AppData\\Roaming",
      LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local",
    },
    homedir: "C:\\Users\\me",
  });
  assert.equal(result.workspaceConfigPath, path.win32.join("C:\\Users\\me\\AppData\\Roaming", "locws", "workspace.json"));
  assert.equal(result.cacheDir, path.win32.join("C:\\Users\\me\\AppData\\Local", "locws"));
  assert.equal(result.relativePathBase, "C:\\Users\\me");
});

test("folder named node_modules-backup is not a packaged install", () => {
  assert.equal(isPackagedInstall("/Users/me/node_modules-backup/locws", "darwin"), false);
});

test("appRootFrom walks up until package.json", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  assert.equal(APP_ROOT, repoRoot);
  const nested = pathToFileURL(path.join(repoRoot, "src", "window", "app-window.mjs")).href;
  assert.equal(appRootFrom(nested), repoRoot);
});

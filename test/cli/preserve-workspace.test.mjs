import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  LAST_TEST_RUNS_FILE,
  copyJsonIfDestMissing,
  preservePackagedUserData,
  tryReadValidJsonText,
  uniqueResolvedPaths,
} from "../../src/cli/preserve-workspace.mjs";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "locws-preserve-"));
}

test("tryReadValidJsonText returns null for missing or invalid JSON", () => {
  const root = makeTempRoot();
  assert.equal(tryReadValidJsonText(path.join(root, "missing.json")), null);
  const bad = path.join(root, "bad.json");
  fs.writeFileSync(bad, "{nope");
  assert.equal(tryReadValidJsonText(bad), null);
});

test("uniqueResolvedPaths drops duplicates and empty values", () => {
  const a = path.join(os.tmpdir(), "locws-a", "workspace.json");
  assert.deepEqual(uniqueResolvedPaths(["", a, a, "  "]), [a]);
});

test("copyJsonIfDestMissing does not overwrite an existing dest", () => {
  const root = makeTempRoot();
  const dest = path.join(root, "dest", "workspace.json");
  const src = path.join(root, "src", "workspace.json");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.mkdirSync(path.dirname(src), { recursive: true });
  fs.writeFileSync(dest, '{"projects":[{"id":"keep"}]}\n');
  fs.writeFileSync(src, '{"projects":[{"id":"new"}]}\n');
  assert.equal(copyJsonIfDestMissing({ dest, candidates: [src] }), "exists");
  assert.equal(fs.readFileSync(dest, "utf8"), '{"projects":[{"id":"keep"}]}\n');
});

test("copyJsonIfDestMissing copies clone file when dest is missing", () => {
  const root = makeTempRoot();
  const dest = path.join(root, "config", "workspace.json");
  const src = path.join(root, "clone", "workspace.json");
  fs.mkdirSync(path.dirname(src), { recursive: true });
  fs.writeFileSync(src, '{"projects":[{"id":"api"}]}\n');
  assert.equal(copyJsonIfDestMissing({ dest, candidates: [src] }), "copied");
  assert.equal(fs.readFileSync(dest, "utf8"), '{"projects":[{"id":"api"}]}\n');
  assert.ok(fs.existsSync(src));
});

test("copyJsonIfDestMissing skips invalid JSON and uses the next candidate", () => {
  const root = makeTempRoot();
  const dest = path.join(root, "config", "workspace.json");
  const bad = path.join(root, "bad.json");
  const good = path.join(root, "good.json");
  fs.writeFileSync(bad, "not json");
  fs.writeFileSync(good, '{"showTestOverview":false,"projects":[]}\n');
  assert.equal(copyJsonIfDestMissing({ dest, candidates: [bad, good] }), "copied");
  assert.equal(fs.readFileSync(dest, "utf8"), '{"showTestOverview":false,"projects":[]}\n');
});

test("preservePackagedUserData copies last-test-runs.json when dest cache file is missing", () => {
  const root = makeTempRoot();
  const homedir = path.join(root, "home");
  const appRoot = path.join(root, "clone");
  fs.mkdirSync(path.join(appRoot, ".cache"), { recursive: true });
  fs.writeFileSync(path.join(appRoot, "workspace.json"), '{"projects":[]}\n');
  fs.writeFileSync(path.join(appRoot, ".cache", LAST_TEST_RUNS_FILE), '{"api":{"status":"success"}}\n');
  const result = preservePackagedUserData({
    platform: "darwin",
    env: {},
    homedir,
    appRoot,
    workspaceConfigPath: path.join(appRoot, "workspace.json"),
    cacheDir: path.join(appRoot, ".cache"),
  });
  assert.equal(result.workspace, "copied");
  assert.equal(result.lastTest, "copied");
  const destCache = path.join(homedir, ".cache", "locws", LAST_TEST_RUNS_FILE);
  assert.equal(fs.readFileSync(destCache, "utf8"), '{"api":{"status":"success"}}\n');
  assert.ok(fs.existsSync(path.join(appRoot, ".cache", LAST_TEST_RUNS_FILE)));
  assert.ok(fs.statSync(path.join(homedir, ".cache", "locws")).isDirectory());
});

test("preservePackagedUserData never removes the dest cache directory", () => {
  const root = makeTempRoot();
  const homedir = path.join(root, "home");
  const destDir = path.join(homedir, ".cache", "locws");
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(path.join(destDir, "Workspace Overview.app"), "helper");
  fs.writeFileSync(path.join(destDir, LAST_TEST_RUNS_FILE), '{"kept":true}\n');
  const appRoot = path.join(root, "clone");
  fs.mkdirSync(path.join(appRoot, ".cache"), { recursive: true });
  fs.writeFileSync(path.join(appRoot, ".cache", LAST_TEST_RUNS_FILE), '{"other":true}\n');
  const result = preservePackagedUserData({
    platform: "darwin",
    env: {},
    homedir,
    appRoot,
    workspaceConfigPath: path.join(appRoot, "workspace.json"),
    cacheDir: path.join(appRoot, ".cache"),
  });
  assert.equal(result.lastTest, "exists");
  assert.equal(fs.readFileSync(path.join(destDir, LAST_TEST_RUNS_FILE), "utf8"), '{"kept":true}\n');
  assert.equal(fs.readFileSync(path.join(destDir, "Workspace Overview.app"), "utf8"), "helper");
});

test("preservePackagedUserData skips when OVERVIEW_DATA_DIR is set", () => {
  const result = preservePackagedUserData({
    env: { OVERVIEW_DATA_DIR: "/tmp/locws-data" },
    homedir: "/tmp/unused",
    appRoot: "/tmp/clone",
    workspaceConfigPath: "/tmp/clone/workspace.json",
    cacheDir: "/tmp/clone/.cache",
  });
  assert.deepEqual(result, { workspace: "skipped", lastTest: "skipped" });
});

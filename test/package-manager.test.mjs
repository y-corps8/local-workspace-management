import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  detectPackageManager,
  guessJestJson,
  isPackageManagerBin,
  packageManagerArgv,
  resolveSpawnArgv,
  spawnFileForBin,
} from "../src/package-manager.mjs";

test("packageManager field wins", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pm-"));
  fs.writeFileSync(path.join(root, "yarn.lock"), "");
  assert.equal(detectPackageManager(root, { packageManager: "pnpm@9" }), "pnpm");
});

test("lockfiles detect yarn and pnpm", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pm-"));
  fs.writeFileSync(path.join(root, "yarn.lock"), "");
  assert.equal(detectPackageManager(root, {}), "yarn");
  fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "");
  assert.equal(detectPackageManager(root, {}), "pnpm");
});

test("argv for each manager", () => {
  assert.deepEqual(packageManagerArgv("npm", "lint"), ["npm", "run", "lint"]);
  assert.deepEqual(packageManagerArgv("npm", "test"), ["npm", "test"]);
  assert.deepEqual(packageManagerArgv("pnpm", "start"), ["pnpm", "start"]);
  assert.deepEqual(packageManagerArgv("yarn", "lint"), ["yarn", "run", "lint"]);
  assert.deepEqual(packageManagerArgv("bun", "dev"), ["bun", "run", "dev"]);
});

test("isPackageManagerBin", () => {
  assert.equal(isPackageManagerBin("npm"), true);
  assert.equal(isPackageManagerBin("./mvnw"), false);
});

test("jestJson only for jest runners", () => {
  assert.equal(guessJestJson({ group: "test", scriptBody: "jest", hasMaven: false }), true);
  assert.equal(guessJestJson({ group: "test", scriptBody: "vitest", deps: { jest: "1" }, hasMaven: false }), false);
  assert.equal(guessJestJson({ group: "test", scriptBody: "playwright test", hasMaven: false }), false);
  assert.equal(guessJestJson({ group: "test", script: "test", deps: { jest: "1" }, hasMaven: false }), true);
  assert.equal(guessJestJson({ group: "test", scriptBody: "jest", hasMaven: true }), false);
  assert.equal(guessJestJson({ group: "tools", scriptBody: "jest", hasMaven: false }), false);
});

test("Windows package-manager bins use .cmd / bun.exe", () => {
  assert.equal(spawnFileForBin("npm", "win32"), "npm.cmd");
  assert.equal(spawnFileForBin("pnpm", "win32"), "pnpm.cmd");
  assert.equal(spawnFileForBin("yarn", "win32"), "yarn.cmd");
  assert.equal(spawnFileForBin("bun", "win32"), "bun.exe");
  assert.equal(spawnFileForBin("npm", "darwin"), "npm");
  assert.deepEqual(resolveSpawnArgv(["npm", "test"], "win32"), ["npm.cmd", "test"]);
  assert.deepEqual(resolveSpawnArgv(["./mvnw", "test"], "win32"), ["./mvnw", "test"]);
});

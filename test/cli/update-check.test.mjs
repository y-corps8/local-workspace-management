import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import {
  checkForUpdate,
  cloneHelpText,
  cloneUpgradeMessage,
  fetchLatestVersion,
  helpText,
  isNewerVersion,
  parseLocwsArgv,
  parseSemver,
  runUpgrade,
  updateNoticeText,
  upgradeArgv,
  upgradeSuccessMessage,
} from "../../src/cli/update-check.mjs";

test("parseSemver reads x.y.z and ignores prerelease suffix after patch", () => {
  assert.deepEqual(parseSemver("1.2.3"), [1, 2, 3]);
  assert.deepEqual(parseSemver(" 0.1.0 "), [0, 1, 0]);
  assert.deepEqual(parseSemver("0.1.1-beta.1"), [0, 1, 1]);
  assert.equal(parseSemver("nope"), null);
});

test("isNewerVersion compares numeric semver", () => {
  assert.equal(isNewerVersion("0.2.0", "0.1.0"), true);
  assert.equal(isNewerVersion("0.1.0", "0.1.0"), false);
  assert.equal(isNewerVersion("0.1.0", "0.2.0"), false);
  assert.equal(isNewerVersion("1.0.0", "0.9.9"), true);
  assert.equal(isNewerVersion("bad", "0.1.0"), false);
});

test("isNewerVersion treats a prerelease current as older than the same x.y.z latest", () => {
  assert.equal(isNewerVersion("0.1.1", "0.1.1-beta.1"), true);
  assert.equal(isNewerVersion("0.1.0", "0.1.1-beta.1"), false);
  assert.equal(isNewerVersion("0.1.1-beta.1", "0.1.1"), false);
  assert.equal(isNewerVersion("0.1.1-beta.1", "0.1.1-beta.1"), false);
});

test("updateNoticeText tells the user to run locws upgrade", () => {
  assert.equal(
    updateNoticeText({ current: "0.1.0", latest: "0.2.0" }),
    "New version available: 0.2.0 (current 0.1.0)\nRun: locws upgrade"
  );
});

test("parseLocwsArgv reads help, upgrade, and start flags", () => {
  assert.deepEqual(parseLocwsArgv([]), {
    help: false,
    start: false,
    upgrade: false,
    browser: false,
    window: false,
  });
  assert.deepEqual(parseLocwsArgv(["--help"]), {
    help: true,
    start: false,
    upgrade: false,
    browser: false,
    window: false,
  });
  assert.deepEqual(parseLocwsArgv(["-h"]), {
    help: true,
    start: false,
    upgrade: false,
    browser: false,
    window: false,
  });
  assert.deepEqual(parseLocwsArgv(["upgrade"]), {
    help: false,
    start: false,
    upgrade: true,
    browser: false,
    window: false,
  });
  assert.deepEqual(parseLocwsArgv(["--browser"]), {
    help: false,
    start: false,
    upgrade: false,
    browser: true,
    window: false,
  });
  assert.deepEqual(parseLocwsArgv(["start"]), {
    help: false,
    start: true,
    upgrade: false,
    browser: false,
    window: false,
  });
  assert.deepEqual(parseLocwsArgv(["start", "--browser"]), {
    help: false,
    start: true,
    upgrade: false,
    browser: true,
    window: false,
  });
  assert.deepEqual(parseLocwsArgv(["start", "--window"]), {
    help: false,
    start: true,
    upgrade: false,
    browser: false,
    window: true,
  });
  assert.deepEqual(parseLocwsArgv(["start", "--open"]), {
    help: false,
    start: true,
    upgrade: false,
    browser: false,
    window: true,
  });
});

test("helpText lists locws upgrade and the workspace path when packaged", () => {
  const text = helpText({
    url: "http://127.0.0.1:4174",
    workspacePath: "/tmp/workspace.json",
    packaged: true,
  });
  assert.match(text, /locws start\s+Start and print/);
  assert.match(text, /locws start --browser/);
  assert.match(text, /locws start --window/);
  assert.match(text, /locws upgrade/);
  assert.match(text, /OVERVIEW_PORT/);
  assert.match(text, /\/tmp\/workspace\.json/);
  assert.doesNotMatch(text, /^ {2}locws {2,}/m);
  assert.doesNotMatch(text, /npm start/);
});

test("helpText on a clone lists npm start scripts and not locws upgrade", () => {
  const text = helpText({
    url: "http://127.0.0.1:4174",
    workspacePath: "/tmp/workspace.json",
    packaged: false,
  });
  assert.equal(
    text,
    cloneHelpText({ url: "http://127.0.0.1:4174", workspacePath: "/tmp/workspace.json" })
  );
  assert.match(text, /npm start/);
  assert.match(text, /npm run start:browser/);
  assert.match(text, /npm run start:window/);
  assert.match(text, /OVERVIEW_PORT/);
  assert.match(text, /\/tmp\/workspace\.json/);
  assert.match(text, /npx @y-corps\/locws/);
  assert.doesNotMatch(text, /locws upgrade/);
});

test("cloneUpgradeMessage points at git pull and npm start", () => {
  const text = cloneUpgradeMessage();
  assert.match(text, /git pull/);
  assert.match(text, /npm start/);
  assert.match(text, /npx @y-corps\/locws/);
});

test("checkForUpdate skips git clone and OVERVIEW_SKIP_WORKSPACE_LOAD", async () => {
  const fetchLatest = async () => "9.9.9";
  assert.equal(await checkForUpdate({ packaged: false, skip: false, fetchLatest, currentVersion: "0.1.0" }), null);
  assert.equal(await checkForUpdate({ packaged: true, skip: true, fetchLatest, currentVersion: "0.1.0" }), null);
});

test("checkForUpdate returns latest when registry is newer", async () => {
  const found = await checkForUpdate({
    packaged: true,
    skip: false,
    currentVersion: "0.1.0",
    fetchLatest: async () => "0.2.0",
  });
  assert.deepEqual(found, { current: "0.1.0", latest: "0.2.0" });
});

test("checkForUpdate is silent when latest is missing or not newer", async () => {
  assert.equal(
    await checkForUpdate({ packaged: true, skip: false, currentVersion: "0.1.0", fetchLatest: async () => "" }),
    null
  );
  assert.equal(
    await checkForUpdate({ packaged: true, skip: false, currentVersion: "0.2.0", fetchLatest: async () => "0.2.0" }),
    null
  );
  assert.equal(
    await checkForUpdate({
      packaged: true,
      skip: false,
      currentVersion: "0.1.1-beta.1",
      fetchLatest: async () => "0.1.0",
    }),
    null
  );
});

test("checkForUpdate notifies when latest is the same x.y.z as a prerelease current", async () => {
  const found = await checkForUpdate({
    packaged: true,
    skip: false,
    currentVersion: "0.1.1-beta.1",
    fetchLatest: async () => "0.1.1",
  });
  assert.deepEqual(found, { current: "0.1.1-beta.1", latest: "0.1.1" });
});

test("upgradeArgv is hardcoded npm install -g @y-corps/locws@latest", () => {
  assert.deepEqual(upgradeArgv("darwin"), ["npm", "install", "-g", "@y-corps/locws@latest"]);
  assert.deepEqual(upgradeArgv("win32"), ["npm.cmd", "install", "-g", "@y-corps/locws@latest"]);
});

test("runUpgrade from a clone refuses without spawning npm", async () => {
  const log = { error: [], log: [] };
  let spawned = false;
  const code = await runUpgrade({
    packaged: false,
    spawnFn() {
      spawned = true;
      throw new Error("should not spawn");
    },
    log: {
      error: (message) => log.error.push(message),
      log: (message) => log.log.push(message),
    },
  });
  assert.equal(code, 1);
  assert.equal(spawned, false);
  assert.equal(log.error[0], cloneUpgradeMessage());
});

test("upgradeSuccessMessage tells the user to run locws start", () => {
  assert.match(upgradeSuccessMessage(), /locws start/);
});

test("runUpgrade spawns npm and prints success on exit 0", async () => {
  const messages = [];
  const code = await runUpgrade({
    packaged: true,
    platform: "darwin",
    spawnFn(file, args, options) {
      assert.equal(file, "npm");
      assert.deepEqual(args, ["install", "-g", "@y-corps/locws@latest"]);
      assert.equal(options.stdio, "inherit");
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("exit", 0));
      return child;
    },
    log: {
      error: () => {},
      log: (message) => messages.push(message),
    },
  });
  assert.equal(code, 0);
  assert.equal(messages[0], upgradeSuccessMessage());
});

test("fetchLatestVersion encodes a scoped package name in the registry path", async () => {
  const version = await fetchLatestVersion({
    request(options, onResponse) {
      assert.equal(options.hostname, "registry.npmjs.org");
      assert.equal(options.method, "GET");
      assert.equal(options.path, "/@y-corps%2Flocws/latest");
      const res = new EventEmitter();
      queueMicrotask(() => {
        onResponse(res);
        res.emit("data", '{"version":"0.2.0"}');
        res.emit("end");
      });
      return {
        setTimeout() {},
        on() {},
        destroy() {},
      };
    },
  });
  assert.equal(version, "0.2.0");
});

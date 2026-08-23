import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { commandAvailability, parseOverviewPort, publicCommand, sanitizeRawWorkspace, shouldReloadWorkspaceWatch } from "../../src/config/commands.mjs";

test("sanitize rejects duplicate project ids", () => {
  assert.throws(
    () =>
      sanitizeRawWorkspace({
        projects: [
          { id: "app", path: "/tmp/a", commands: [] },
          { id: "app", path: "/tmp/b", commands: [] },
        ],
      }),
    /Duplicate project id/
  );
});

test("sanitize rejects duplicate command scripts", () => {
  assert.throws(
    () =>
      sanitizeRawWorkspace({
        projects: [
          {
            id: "app",
            path: "/tmp/a",
            commands: [
              { script: "test", argv: ["echo", "a"] },
              { script: "test", argv: ["echo", "b"] },
            ],
          },
        ],
      }),
    /Duplicate command/
  );
});

test("sanitize lowercases command labels", () => {
  const clean = sanitizeRawWorkspace({
    projects: [
      {
        id: "app",
        path: "/tmp/a",
        commands: [{ script: "start", label: "Start", argv: ["echo", "start"] }],
      },
    ],
  });
  assert.equal(clean.projects[0].commands[0].label, "start");
});

test("sanitize accepts unique scripts", () => {
  const clean = sanitizeRawWorkspace({
    projects: [
      {
        id: "app",
        path: "/tmp/a",
        commands: [
          { script: "echo", argv: ["echo", "hi"] },
          { script: "lint", argv: ["echo", "lint"] },
        ],
      },
    ],
  });
  assert.equal(clean.projects[0].commands.length, 2);
});

test("custom argv is available without package.json scripts", () => {
  const command = { customArgv: true, argv: ["./mvnw", "test"], script: "test" };
  const result = commandAvailability(command, { exists: true, hasPackageJson: false, scripts: [] });
  assert.equal(result.available, true);
});

test("package manager commands need the script key", () => {
  const command = { customArgv: false, argv: ["npm", "test"], script: "test" };
  const missing = commandAvailability(command, { exists: true, hasPackageJson: true, scripts: ["lint"] });
  assert.equal(missing.available, false);
  assert.equal(missing.unavailableReason, "missing_script");
  const ok = commandAvailability(command, { exists: true, hasPackageJson: true, scripts: ["test"] });
  assert.equal(ok.available, true);
});

test("directory watch ignores null filename and tmp files", () => {
  assert.equal(shouldReloadWorkspaceWatch(null, { fromDirectory: true }), false);
  assert.equal(shouldReloadWorkspaceWatch("", { fromDirectory: true }), false);
  assert.equal(shouldReloadWorkspaceWatch(".workspace.123.tmp", { fromDirectory: true }), false);
  assert.equal(shouldReloadWorkspaceWatch("workspace.json", { fromDirectory: true }), true);
  assert.equal(shouldReloadWorkspaceWatch("README.md", { fromDirectory: true }), false);
  assert.equal(shouldReloadWorkspaceWatch("workspace.json", { fromDirectory: false }), true);
});

test("sanitize keeps a non-destructive primaryScript and drops the rest", () => {
  const keep = sanitizeRawWorkspace({
    projects: [
      {
        id: "app",
        path: "/tmp/a",
        primaryScript: "start",
        commands: [
          { script: "start", group: "run", argv: ["echo", "start"] },
          { script: "reset", group: "tools", destructive: true, argv: ["echo", "reset"] },
        ],
      },
    ],
  });
  assert.equal(keep.projects[0].primaryScript, "start");
  const unknown = sanitizeRawWorkspace({
    projects: [
      {
        id: "app",
        path: "/tmp/a",
        primaryScript: "missing",
        commands: [{ script: "start", argv: ["echo", "start"] }],
      },
    ],
  });
  assert.equal(unknown.projects[0].primaryScript, undefined);
  const destructive = sanitizeRawWorkspace({
    projects: [
      {
        id: "app",
        path: "/tmp/a",
        primaryScript: "reset",
        commands: [{ script: "reset", destructive: true, argv: ["echo", "reset"] }],
      },
    ],
  });
  assert.equal(destructive.projects[0].primaryScript, undefined);
});

test("sanitize migrates leftover fields and drops them", () => {
  const clean = sanitizeRawWorkspace({
    workspaceRoot: "/tmp/ws",
    metroPort: 19000,
    expoDevClientScheme: "myapp",
    projects: [
      {
        id: "app",
        path: "my-api",
        role: "backend",
        metroPort: 8082,
        commands: [{ script: "start", group: "tooling", argv: ["echo", "start"] }],
      },
    ],
  });
  assert.equal(clean.workspaceRoot, undefined);
  assert.equal(clean.metroPort, undefined);
  assert.equal(clean.projects[0].role, undefined);
  assert.equal(clean.projects[0].metroPort, undefined);
  assert.equal(clean.projects[0].description, "backend");
  assert.equal(clean.projects[0].commands[0].group, "tools");
  assert.equal(path.isAbsolute(clean.projects[0].path), true);
  assert.equal(clean.projects[0].path, path.resolve("/tmp/ws", "my-api"));
});

test("sanitize drops leftover accent fields", () => {
  const leftover = sanitizeRawWorkspace({
    projects: [{ id: "app", path: "/tmp/a", accent: "blue", commands: [] }],
  });
  assert.equal(leftover.projects[0].accent, undefined);
  const hex = sanitizeRawWorkspace({
    projects: [{ id: "app", path: "/tmp/a", accent: "#fff", commands: [] }],
  });
  assert.equal(hex.projects[0].accent, undefined);
});

test("publicCommand exposes primary and omits argv", () => {
  const pub = publicCommand({
    id: "app:start",
    repo: "app",
    script: "start",
    label: "start",
    group: "run",
    longRunning: true,
    destructive: false,
    argv: ["npm", "start"],
    primary: true,
    interactions: [],
  });
  assert.equal(pub.primary, true);
  assert.equal(pub.argv, undefined);
});

test("parseOverviewPort defaults and validates", () => {
  assert.equal(parseOverviewPort(""), 4174);
  assert.equal(parseOverviewPort(undefined), 4174);
  assert.equal(parseOverviewPort("8080"), 8080);
  assert.throws(() => parseOverviewPort("0"), /1–65535/);
  assert.throws(() => parseOverviewPort("99999"), /1–65535/);
  assert.throws(() => parseOverviewPort("abc"), /1–65535/);
});

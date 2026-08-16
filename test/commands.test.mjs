import assert from "node:assert/strict";
import { test } from "node:test";
import { commandAvailability, sanitizeRawWorkspace, shouldReloadWorkspaceWatch } from "../src/commands.mjs";

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

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { gitInfo } from "../../src/jobs/git-info.mjs";

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `git ${args.join(" ")} failed`).trim());
  }
}

test("gitInfo skipCache sees dirty after a cached clean read", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "locws-git-"));
  try {
    git(root, ["init"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "Test"]);
    fs.writeFileSync(path.join(root, "a.txt"), "one\n");
    git(root, ["add", "a.txt"]);
    git(root, ["commit", "-m", "init"]);

    const first = await gitInfo(root);
    assert.equal(first.dirty, false);
    assert.notEqual(first.branch, "unknown");

    fs.writeFileSync(path.join(root, "a.txt"), "two\n");
    const cached = await gitInfo(root);
    assert.equal(cached.dirty, false);

    const fresh = await gitInfo(root, { skipCache: true });
    assert.equal(fresh.dirty, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

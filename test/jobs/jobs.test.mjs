import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { REPOS } from "../../src/config/commands.mjs";
import { createJobRuntime } from "../../src/jobs/jobs.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "locws-job-"));
const repoId = "jobtest";

function holdCommand() {
  return {
    id: `${repoId}:hold`,
    repo: repoId,
    script: "hold",
    label: "hold",
    kind: "command",
    longRunning: true,
    customArgv: true,
    argv: [
      process.execPath,
      "-e",
      "process.stdin.resume(); process.stdin.on('data', (d) => { if (String(d).includes('y')) process.exit(0); });",
    ],
  };
}

function waitUntil(predicate, timeoutMs = 4000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error("timeout"));
        return;
      }
      setTimeout(tick, 25);
    };
    tick();
  });
}

before(() => {
  REPOS[repoId] = { id: repoId, root, path: root, name: "jobtest" };
});

after(() => {
  delete REPOS[repoId];
  fs.rmSync(root, { recursive: true, force: true });
});

test("startJob already_running, stdin no_prompt / allowlist, stop", async () => {
  const runtime = createJobRuntime();
  const command = holdCommand();
  const first = runtime.startJob(command);
  assert.equal(first.error, undefined);
  assert.equal(first.job.status, "running");

  const second = runtime.startJob(command);
  assert.equal(second.error, "already_running");

  const noPrompt = runtime.writeJobStdin(command.id, "y");
  assert.equal(noPrompt.error, "no_prompt");

  const job = runtime.jobs.get(command.id);
  job.prompt = {
    kind: "confirm",
    question: "Continue?",
    options: [
      { id: "yes", label: "Yes", value: "y" },
      { id: "no", label: "No", value: "n" },
    ],
  };
  const denied = runtime.writeJobStdin(command.id, "rm -rf /");
  assert.equal(denied.error, "stdin_not_allowed");
  const tooLong = runtime.writeJobStdin(command.id, "y".repeat(201));
  assert.equal(tooLong.error, "stdin_too_long");

  const ok = runtime.writeJobStdin(command.id, "y");
  assert.equal(ok.ok, true);
  await waitUntil(() => runtime.jobs.get(command.id)?.status !== "running");

  const again = runtime.startJob(command);
  assert.equal(again.error, undefined);
  const stopped = runtime.stopJob(command.id);
  assert.equal(stopped.error, undefined);
  await waitUntil(() => runtime.jobs.get(command.id)?.status !== "running");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyReport, mergeReport, statusFromCounts } from "../src/test-results.mjs";

test("statusFromCounts uses success then exitCode then failed", () => {
  assert.equal(statusFromCounts({ success: true, failed: 0 }), "pass");
  assert.equal(statusFromCounts({ success: false, failed: 0 }), "fail");
  assert.equal(statusFromCounts({ exitCode: 0, failed: 0 }), "pass");
  assert.equal(statusFromCounts({ failed: 2 }), "fail");
});

test("mergeReport prefers newer snapshot and keeps artifact coverage", () => {
  const artifact = {
    ...emptyReport(),
    status: "pass",
    passed: 3,
    total: 3,
    finishedAt: "2020-01-01T00:00:00.000Z",
    coveragePct: 80,
    failedNames: [],
    source: "jest-results",
  };
  const snapshot = {
    ...emptyReport(),
    status: "fail",
    passed: 2,
    failed: 1,
    total: 3,
    finishedAt: "2020-01-02T00:00:00.000Z",
    coveragePct: null,
    failedNames: [],
    source: "snapshot",
  };
  const merged = mergeReport(artifact, snapshot);
  assert.equal(merged.status, "fail");
  assert.equal(merged.source, "snapshot");
  assert.equal(merged.coveragePct, 80);
});

test("mergeReport keeps artifact when it is newer", () => {
  const artifact = {
    ...emptyReport(),
    status: "pass",
    finishedAt: "2020-02-01T00:00:00.000Z",
    commandId: null,
    source: "jest-results",
  };
  const snapshot = {
    ...emptyReport(),
    status: "fail",
    finishedAt: "2020-01-01T00:00:00.000Z",
    commandId: "app:test",
    commandLabel: "Test",
  };
  const merged = mergeReport(artifact, snapshot);
  assert.equal(merged.status, "pass");
  assert.equal(merged.commandId, "app:test");
});

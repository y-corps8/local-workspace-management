import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeDiscoveredCommand } from "../../src/config/merge-command.mjs";

test("probe jestJson replaces a stale workspace flag", () => {
  const merged = mergeDiscoveredCommand(
    { script: "test", group: "test", jestJson: false, argv: ["npm", "test"] },
    { script: "test", group: "test", jestJson: true, label: "Tests", selected: true }
  );
  assert.equal(merged.jestJson, false);
  assert.equal(merged.label, "Tests");
  assert.equal(merged.selected, true);
});

test("probe jestJson can turn Jest flags on", () => {
  const merged = mergeDiscoveredCommand(
    { script: "test", jestJson: true },
    { script: "test", jestJson: false, group: "test" }
  );
  assert.equal(merged.jestJson, true);
  assert.equal(merged.group, "test");
});

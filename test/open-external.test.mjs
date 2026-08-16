import assert from "node:assert/strict";
import { test } from "node:test";
import { openPathArgs, openUrlArgs } from "../src/open-external.mjs";

test("openUrlArgs uses the OS default handler", () => {
  assert.deepEqual(openUrlArgs("http://127.0.0.1:4174", "darwin"), {
    file: "open",
    args: ["http://127.0.0.1:4174"],
  });
  assert.deepEqual(openUrlArgs("http://127.0.0.1:4174", "linux"), {
    file: "xdg-open",
    args: ["http://127.0.0.1:4174"],
  });
  assert.deepEqual(openUrlArgs("http://127.0.0.1:4174", "win32"), {
    file: "cmd",
    args: ["/c", "start", "", "http://127.0.0.1:4174"],
  });
});

test("openPathArgs uses Finder, Explorer, or xdg-open", () => {
  assert.equal(openPathArgs("/tmp", "darwin").file, "open");
  assert.equal(openPathArgs("C:\\proj", "win32").file, "explorer");
  assert.equal(openPathArgs("/tmp", "linux").file, "xdg-open");
});

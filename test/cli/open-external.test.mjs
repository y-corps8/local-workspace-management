import assert from "node:assert/strict";
import { test } from "node:test";
import { openPathArgs, openUrlArgs } from "../../src/cli/open-external.mjs";

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
    file: "explorer",
    args: ["http://127.0.0.1:4174"],
  });
});

test("openUrlArgs rejects non-http URLs and cmd metacharacters", () => {
  assert.throws(() => openUrlArgs("file:///tmp/x"), /invalid_url/);
  assert.throws(() => openUrlArgs("http://127.0.0.1:4174/x&calc.exe"), /invalid_url/);
  assert.throws(() => openUrlArgs("http://127.0.0.1:4174/x|whoami"), /invalid_url/);
});

test("openPathArgs uses Finder, Explorer, or xdg-open", () => {
  assert.equal(openPathArgs("/tmp", "darwin").file, "open");
  assert.equal(openPathArgs("C:\\proj", "win32").file, "explorer");
  assert.equal(openPathArgs("/tmp", "linux").file, "xdg-open");
});

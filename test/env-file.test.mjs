import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEnvFile, parseEnvFile } from "../src/env-file.mjs";

test("parses KEY=VALUE and skips comments", () => {
  const env = parseEnvFile("# hi\nFOO=bar\n# skip\nBAZ=qux\n");
  assert.deepEqual(env, { FOO: "bar", BAZ: "qux" });
});

test("supports export and quotes", () => {
  const env = parseEnvFile(`export TOKEN="ab c"\nNAME='x'\n`);
  assert.equal(env.TOKEN, "ab c");
  assert.equal(env.NAME, "x");
});

test("strips inline comments on unquoted values", () => {
  assert.equal(parseEnvFile("PORT=3000 # local\n").PORT, "3000");
});

test("applyEnvFile does not replace dashboard PATH extras", () => {
  const env = applyEnvFile(
    { PATH: "/opt/homebrew/bin:/usr/bin", KEEP: "yes" },
    { PATH: "/project/bin", FOO: "bar", KEEP: "no" }
  );
  assert.equal(env.FOO, "bar");
  assert.equal(env.KEEP, "no");
  assert.match(env.PATH, /\/opt\/homebrew\/bin/);
  assert.match(env.PATH, /\/project\/bin/);
  assert.ok(env.PATH.indexOf("/opt/homebrew/bin") < env.PATH.indexOf("/project/bin"));
});

test("applyEnvFile without PATH leaves extras alone", () => {
  const env = applyEnvFile({ PATH: "/opt/homebrew/bin:/usr/bin" }, { TOKEN: "x" });
  assert.equal(env.PATH, "/opt/homebrew/bin:/usr/bin");
  assert.equal(env.TOKEN, "x");
});

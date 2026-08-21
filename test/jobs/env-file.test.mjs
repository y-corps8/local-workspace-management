import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEnvFile, parseEnvFile } from "../../src/jobs/env-file.mjs";

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

test("applyEnvFile skips loader-injection keys", () => {
  const env = applyEnvFile(
    { PATH: "/usr/bin", KEEP: "yes", NODE_OPTIONS: "safe" },
    {
      FOO: "bar",
      NODE_OPTIONS: "--require ./evil.js",
      NODE_PATH: "/tmp/evil",
      LD_PRELOAD: "evil.so",
      DYLD_INSERT_LIBRARIES: "evil.dylib",
      PYTHONPATH: "/tmp/evil",
      JAVA_TOOL_OPTIONS: "-javaagent:evil",
      DOTNET_STARTUP_HOOKS: "evil",
      BASH_ENV: "/tmp/evil",
      ENV: "/tmp/evil",
      PERL5OPT: "-Mevil",
      RUBYOPT: "-revil",
    }
  );
  assert.equal(env.FOO, "bar");
  assert.equal(env.KEEP, "yes");
  assert.equal(env.NODE_OPTIONS, "safe");
  assert.equal(env.NODE_PATH, undefined);
  assert.equal(env.LD_PRELOAD, undefined);
  assert.equal(env.DYLD_INSERT_LIBRARIES, undefined);
  assert.equal(env.PYTHONPATH, undefined);
  assert.equal(env.JAVA_TOOL_OPTIONS, undefined);
  assert.equal(env.DOTNET_STARTUP_HOOKS, undefined);
  assert.equal(env.BASH_ENV, undefined);
  assert.equal(env.ENV, undefined);
  assert.equal(env.PERL5OPT, undefined);
  assert.equal(env.RUBYOPT, undefined);
});

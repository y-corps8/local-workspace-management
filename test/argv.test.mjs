import assert from "node:assert/strict";
import { test } from "node:test";
import { formatArgvLine, parseArgvLine } from "../src/argv.mjs";

test("splits on whitespace", () => {
  assert.deepEqual(parseArgvLine("echo hello"), ["echo", "hello"]);
});

test("keeps double-quoted words together", () => {
  assert.deepEqual(parseArgvLine('echo "hello world"'), ["echo", "hello world"]);
});

test("keeps single-quoted words together", () => {
  assert.deepEqual(parseArgvLine("echo 'hello world'"), ["echo", "hello world"]);
});

test("strips escaped quotes inside double quotes", () => {
  assert.deepEqual(parseArgvLine(String.raw`echo "say \"hi\""`), ["echo", 'say "hi"']);
});

test("throws on unclosed quote", () => {
  assert.throws(() => parseArgvLine('echo "hello'), /Unclosed quote/);
});

test("formatArgvLine joins plain words", () => {
  assert.equal(formatArgvLine(["echo", "hello"]), "echo hello");
});

test("formatArgvLine quotes whitespace", () => {
  assert.equal(formatArgvLine(["echo", "hello world"]), 'echo "hello world"');
});

test("formatArgvLine quotes empty parts", () => {
  assert.equal(formatArgvLine([""]), '""');
});

test("formatArgvLine round-trips quoted words", () => {
  const argv = ["echo", "hello world", 'say "hi"'];
  assert.deepEqual(parseArgvLine(formatArgvLine(argv)), argv);
});

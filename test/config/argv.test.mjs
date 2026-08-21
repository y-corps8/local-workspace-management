import assert from "node:assert/strict";
import { test } from "node:test";
import { formatArgvLine, parseArgvLine } from "../../src/config/argv.mjs";
import {
  formatArgvLine as formatArgvLineUi,
  parseArgvLine as parseArgvLineUi,
} from "../../public/js/argv.js";

const cases = [
  ["echo hello", ["echo", "hello"]],
  ['echo "hello world"', ["echo", "hello world"]],
  ["echo 'hello world'", ["echo", "hello world"]],
  [String.raw`echo "say \"hi\""`, ["echo", 'say "hi"']],
];

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

test("public/js/argv.js matches src/config/argv.mjs", () => {
  for (const [input, expected] of cases) {
    assert.deepEqual(parseArgvLine(input), parseArgvLineUi(input));
    assert.deepEqual(parseArgvLine(input), expected);
  }
  assert.throws(() => parseArgvLineUi('echo "hello'), /Unclosed quote/);
  const argv = ["echo", "hello world", 'say "hi"'];
  assert.equal(formatArgvLine(argv), formatArgvLineUi(argv));
  assert.deepEqual(parseArgvLineUi(formatArgvLineUi(argv)), argv);
});

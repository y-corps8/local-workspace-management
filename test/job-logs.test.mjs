import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_PARTIAL, splitLogChunk } from "../src/job-logs.mjs";

test("splits on newlines", () => {
  const { events, partial } = splitLogChunk("", "a\nb\n");
  assert.deepEqual(events, [
    { text: "a", replace: false },
    { text: "b", replace: false },
  ]);
  assert.equal(partial, "");
});

test("keeps incomplete line as partial", () => {
  const { events, partial } = splitLogChunk("", "hello");
  assert.deepEqual(events, []);
  assert.equal(partial, "hello");
});

test("bare CR emits replace", () => {
  const { events, partial } = splitLogChunk("", "one\rtwo\r");
  assert.deepEqual(events, [{ text: "one", replace: true }]);
  assert.equal(partial, "two\r");
});

test("CRLF is a new line not replace", () => {
  const { events, partial } = splitLogChunk("hi\r", "\nnext\n");
  assert.deepEqual(events, [
    { text: "hi", replace: false },
    { text: "next", replace: false },
  ]);
  assert.equal(partial, "");
});

test("caps oversized partial", () => {
  const huge = "x".repeat(MAX_PARTIAL * 3);
  const { partial } = splitLogChunk("", huge);
  assert.ok(partial.length <= MAX_PARTIAL);
});

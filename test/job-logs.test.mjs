import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_PARTIAL,
  applyStreamChunk,
  compactLogBatch,
  createLogBatcher,
  emptyStreamPartials,
  splitLogChunk,
  streamPartialText,
} from "../src/job-logs.mjs";

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

test("stdout and stderr keep separate partials", () => {
  let state = emptyStreamPartials();
  let result = applyStreamChunk(state, "stdout", "hel");
  state = result.partials;
  assert.deepEqual(result.events, []);
  result = applyStreamChunk(state, "stderr", "err\n");
  state = result.partials;
  assert.deepEqual(result.events, [{ text: "err", replace: false }]);
  assert.equal(state.stdout, "hel");
  assert.equal(state.stderr, "");
  result = applyStreamChunk(state, "stdout", "lo\n");
  assert.deepEqual(result.events, [{ text: "hello", replace: false }]);
  assert.equal(result.partials.stdout, "");
});

test("streamPartialText joins unfinished streams", () => {
  assert.equal(streamPartialText({ stdout: "ab\r", stderr: "cd" }), "ab\ncd");
  assert.equal(streamPartialText({ stdout: "only\r", stderr: "" }), "only");
});

test("compactLogBatch keeps one trailing live row", () => {
  const lines = compactLogBatch([
    { stream: "stdout", text: "a", live: false },
    { stream: "stdout", text: "p1", replace: true, live: true },
    { stream: "stdout", text: "p2", replace: true, live: true },
  ]);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, "a");
  assert.equal(lines[1].text, "p2");
  assert.equal(lines[1].live, true);
});

test("compactLogBatch drops live when a completed line follows", () => {
  const lines = compactLogBatch([
    { stream: "stdout", text: "spin", live: true, replace: true },
    { stream: "stdout", text: "done", live: false },
  ]);
  assert.deepEqual(
    lines.map((line) => line.text),
    ["done"]
  );
});

test("compactLogBatch merges consecutive replace rows", () => {
  const lines = compactLogBatch([
    { stream: "stdout", text: "1%", replace: true },
    { stream: "stdout", text: "2%", replace: true },
  ]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].text, "2%");
});

test("createLogBatcher flushes coalesced lines on demand", () => {
  const flushed = [];
  const batcher = createLogBatcher({
    intervalMs: 0,
    onFlush: (id, lines) => flushed.push({ id, lines }),
  });
  batcher.enqueue("job-a", { stream: "stdout", text: "one" });
  batcher.enqueue("job-a", { stream: "stdout", text: "two" });
  batcher.enqueue("job-b", { stream: "stderr", text: "err" });
  assert.equal(flushed.length, 0);
  batcher.flush("job-a");
  assert.equal(flushed.length, 1);
  assert.equal(flushed[0].id, "job-a");
  assert.deepEqual(
    flushed[0].lines.map((line) => line.text),
    ["one", "two"]
  );
  batcher.flushAll();
  assert.equal(flushed.length, 2);
  assert.equal(flushed[1].id, "job-b");
});

test("createLogBatcher coalesces live rows before flush", () => {
  const flushed = [];
  const batcher = createLogBatcher({
    intervalMs: 0,
    onFlush: (id, lines) => flushed.push({ id, lines }),
  });
  batcher.enqueue("metro", { stream: "stdout", text: "10%", live: true, replace: true });
  batcher.enqueue("metro", { stream: "stdout", text: "20%", live: true, replace: true });
  batcher.enqueue("metro", { stream: "stdout", text: "30%", live: true, replace: true });
  batcher.flush("metro");
  assert.equal(flushed[0].lines.length, 1);
  assert.equal(flushed[0].lines[0].text, "30%");
  assert.equal(flushed[0].lines[0].live, true);
});

test("createLogBatcher clear drops a pending job", () => {
  const flushed = [];
  const batcher = createLogBatcher({
    intervalMs: 0,
    onFlush: (id, lines) => flushed.push({ id, lines }),
  });
  batcher.enqueue("gone", { stream: "stdout", text: "nope" });
  batcher.clear("gone");
  batcher.flush("gone");
  batcher.flushAll();
  assert.equal(flushed.length, 0);
});

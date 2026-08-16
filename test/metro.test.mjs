import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMetroPortFromText } from "../src/metro.mjs";

test("reads waiting on localhost URL", () => {
  assert.equal(parseMetroPortFromText("Waiting on http://localhost:8081"), 8081);
});

test("reads exp URL", () => {
  assert.equal(parseMetroPortFromText("exp://127.0.0.1:8082"), 8082);
});

test("reads busy-port fallback", () => {
  assert.equal(parseMetroPortFromText("Port 8081 is busy, using 8083"), 8083);
});

test("ignores arbitrary http in stack traces", () => {
  assert.equal(parseMetroPortFromText("See http://example.com:9999/docs"), null);
});

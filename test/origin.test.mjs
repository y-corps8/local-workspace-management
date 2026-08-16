import assert from "node:assert/strict";
import { test } from "node:test";
import { isLocalOrigin } from "../src/origin.mjs";

test("allows missing origin", () => {
  assert.equal(isLocalOrigin(undefined), true);
  assert.equal(isLocalOrigin(""), true);
});

test("allows loopback overview origin", () => {
  assert.equal(isLocalOrigin("http://127.0.0.1:4174"), true);
  assert.equal(isLocalOrigin("http://localhost:4174"), true);
});

test("rejects other origins", () => {
  assert.equal(isLocalOrigin("http://evil.example"), false);
  assert.equal(isLocalOrigin("http://127.0.0.1:3000"), false);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { isLocalHost, isLocalOrigin, securityHeaders } from "../../src/http/origin.mjs";

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

test("allows missing host", () => {
  assert.equal(isLocalHost(undefined), true);
  assert.equal(isLocalHost(""), true);
});

test("allows loopback host headers", () => {
  assert.equal(isLocalHost("127.0.0.1:4174"), true);
  assert.equal(isLocalHost("localhost:4174"), true);
  assert.equal(isLocalHost("LOCALHOST:4174"), true);
});

test("rejects other hosts", () => {
  assert.equal(isLocalHost("evil.example"), false);
  assert.equal(isLocalHost("127.0.0.1:3000"), false);
  assert.equal(isLocalHost("example.com:4174"), false);
});

test("securityHeaders deny framing and pin CSP to self", () => {
  const headers = securityHeaders();
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.match(headers["Content-Security-Policy"], /frame-ancestors 'none'/);
  assert.match(headers["Content-Security-Policy"], /script-src 'self'/);
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["Referrer-Policy"], "no-referrer");
});

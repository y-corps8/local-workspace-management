import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { createOverviewApp } from "../../src/http/overview-http.mjs";

function request(port, { method = "GET", urlPath = "/", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, method, path: urlPath, headers },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function withServer(fn) {
  const { server } = createOverviewApp({ host: "127.0.0.1", port: 0 });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  try {
    await fn(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("foreign Origin is 403", async () => {
  await withServer(async (port) => {
    const res = await request(port, {
      urlPath: "/api/status",
      headers: { Origin: "http://evil.example" },
    });
    assert.equal(res.status, 403);
    assert.match(res.body, /forbidden_origin/);
  });
});

test("foreign Host is 403", async () => {
  await withServer(async (port) => {
    const res = await request(port, {
      urlPath: "/api/status",
      headers: { Host: "evil.example:4174" },
    });
    assert.equal(res.status, 403);
    assert.match(res.body, /forbidden_host/);
  });
});

test("loopback Origin can read empty status", async () => {
  await withServer(async (port) => {
    const res = await request(port, {
      urlPath: "/api/status",
      headers: { Origin: `http://127.0.0.1:${port}` },
    });
    assert.equal(res.status, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.needsSetup, true);
    assert.deepEqual(json.repos, []);
    assert.equal(res.headers["x-frame-options"], "DENY");
    assert.match(res.headers["content-security-policy"], /frame-ancestors 'none'/);
  });
});

test("static traversal is 404", async () => {
  await withServer(async (port) => {
    const res = await request(port, { urlPath: "/../package.json" });
    assert.equal(res.status, 404);
  });
});

test("GET / includes security headers", async () => {
  await withServer(async (port) => {
    const res = await request(port, { urlPath: "/" });
    assert.equal(res.status, 200);
    assert.equal(res.headers["x-frame-options"], "DENY");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(res.headers["referrer-policy"], "no-referrer");
    assert.match(res.headers["content-security-policy"], /script-src 'self'/);
  });
});

test("HEAD / has no body", async () => {
  await withServer(async (port) => {
    const res = await request(port, { method: "HEAD", urlPath: "/" });
    assert.equal(res.status, 200);
    assert.equal(res.body, "");
  });
});

test("POST /api/run unknown id is 400", async () => {
  await withServer(async (port) => {
    const res = await request(port, {
      method: "POST",
      urlPath: "/api/run",
      headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` },
      body: JSON.stringify({ id: "nope:start" }),
    });
    assert.equal(res.status, 400);
    assert.match(res.body, /unknown_command/);
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { broadcastSse, writeSseEvent } from "../../src/http/sse.mjs";

test("writeSseEvent frames event and JSON data", () => {
  const chunks = [];
  writeSseEvent({ write: (chunk) => chunks.push(chunk) }, "job", { id: "a" });
  assert.equal(chunks[0], "event: job\n");
  assert.equal(chunks[1], "data: {\"id\":\"a\"}\n\n");
});

test("broadcastSse drops clients that throw on write", () => {
  const clients = new Set();
  const dead = {
    write() {
      throw new Error("gone");
    },
  };
  let liveCount = 0;
  const live = {
    write() {
      liveCount += 1;
    },
  };
  clients.add(dead);
  clients.add(live);
  broadcastSse(clients, "health", [{ up: true }]);
  assert.equal(clients.has(dead), false);
  assert.equal(clients.has(live), true);
  assert.equal(liveCount, 2);
});

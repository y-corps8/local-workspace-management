/**
 * SSE frames. A dead client must not take down the rest of the dashboard.
 */

export function writeSseEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function broadcastSse(clients, event, data) {
  for (const client of [...clients]) {
    try {
      writeSseEvent(client, event, data);
    } catch {
      clients.delete(client);
    }
  }
}

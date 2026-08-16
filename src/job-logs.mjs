/** Incomplete-line cap so Metro `\r` progress cannot grow without bound. */
export const MAX_PARTIAL = 8192;

/**
 * Split a stdout/stderr chunk into completed lines.
 * `\n` / `\r\n` emit a new line; bare `\r` emits `{ replace: true }` (progress).
 * A trailing `\r` stays in `partial` so a following `\n` can form `\r\n`.
 */
export function splitLogChunk(partial, chunk) {
  let buf = `${partial || ""}${chunk == null ? "" : String(chunk)}`;
  if (buf.length > MAX_PARTIAL * 2) {
    buf = buf.slice(-MAX_PARTIAL);
  }
  const events = [];
  let i = 0;
  while (i < buf.length) {
    const cr = buf.indexOf("\r", i);
    const lf = buf.indexOf("\n", i);
    if (cr < 0 && lf < 0) break;
    if (lf >= 0 && (cr < 0 || lf < cr)) {
      events.push({ text: buf.slice(i, lf), replace: false });
      i = lf + 1;
      continue;
    }
    if (cr === buf.length - 1) break;
    if (buf[cr + 1] === "\n") {
      events.push({ text: buf.slice(i, cr), replace: false });
      i = cr + 2;
      continue;
    }
    const text = buf.slice(i, cr);
    if (text) events.push({ text, replace: true });
    i = cr + 1;
  }
  let nextPartial = buf.slice(i);
  if (nextPartial.length > MAX_PARTIAL) {
    nextPartial = nextPartial.slice(-MAX_PARTIAL);
  }
  return { events, partial: nextPartial };
}

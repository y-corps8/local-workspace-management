/** Incomplete-line cap so Metro `\r` progress cannot grow without bound. */
export const MAX_PARTIAL = 8192;

/** Coalesce SSE `log` frames so two chatty jobs cannot flood the UI. */
export const LOG_FLUSH_MS = 80;

/** Metro `\r` live rows — send at most this often per job (flush still coalesces). */
export const LIVE_PARTIAL_MIN_MS = 100;

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

export function emptyStreamPartials() {
  return { stdout: "", stderr: "" };
}

function streamKey(stream) {
  return stream === "stderr" ? "stderr" : "stdout";
}

/** Apply a chunk to one stream so stdout/stderr do not share a line buffer. */
export function applyStreamChunk(partials, stream, chunk) {
  const current = partials && typeof partials === "object" ? partials : emptyStreamPartials();
  const key = streamKey(stream);
  const { events, partial } = splitLogChunk(current[key] || "", chunk);
  return {
    events,
    partials: {
      stdout: key === "stdout" ? partial : current.stdout || "",
      stderr: key === "stderr" ? partial : current.stderr || "",
    },
  };
}

/** Combined unfinished text for prompt / Metro scans and GET /api/logs. */
export function streamPartialText(partials) {
  const stdout = String(partials?.stdout || "").replace(/\r$/, "");
  const stderr = String(partials?.stderr || "").replace(/\r$/, "");
  if (stdout && stderr) return `${stdout}\n${stderr}`;
  return stdout || stderr;
}

function normalizeLogEntry(raw) {
  if (!raw || raw.text == null) return null;
  return {
    stream: raw.stream === "stderr" ? "stderr" : "stdout",
    text: String(raw.text),
    at: raw.at,
    replace: Boolean(raw.replace),
    live: Boolean(raw.live),
  };
}

/** Collapse a queued flush: one trailing live row; consecutive replace rows merge. */
export function compactLogBatch(entries) {
  const out = [];
  for (const raw of entries || []) {
    const entry = normalizeLogEntry(raw);
    if (!entry) continue;
    if (entry.live) {
      if (out.length && out[out.length - 1].live) {
        out[out.length - 1] = entry;
      } else {
        out.push(entry);
      }
      continue;
    }
    if (out.length && out[out.length - 1].live) {
      out.pop();
    }
    if (entry.replace && out.length && out[out.length - 1].replace) {
      out[out.length - 1] = entry;
      continue;
    }
    out.push(entry);
  }
  return out;
}

/**
 * Queue log SSE payloads per job. Call `flush` / `flushAll` from tests (no timers)
 * or let `intervalMs` fire. `now` is injectable for live-partial throttle tests.
 */
export function createLogBatcher({
  intervalMs = LOG_FLUSH_MS,
  liveMinMs = LIVE_PARTIAL_MIN_MS,
  onFlush,
  now = () => Date.now(),
} = {}) {
  const queues = new Map();
  const timers = new Map();
  const lastLiveAt = new Map();

  function schedule(jobId) {
    if (intervalMs <= 0 || timers.has(jobId)) return;
    const timer = setTimeout(() => {
      timers.delete(jobId);
      flush(jobId);
    }, intervalMs);
    timers.set(jobId, timer);
  }

  function queueOf(jobId) {
    let q = queues.get(jobId);
    if (!q) {
      q = [];
      queues.set(jobId, q);
    }
    return q;
  }

  function enqueue(jobId, entry) {
    const normalized = normalizeLogEntry(entry);
    if (!jobId || !normalized) return;
    const q = queueOf(jobId);
    if (normalized.live) {
      lastLiveAt.set(jobId, now());
      if (q.length && q[q.length - 1].live) {
        q[q.length - 1] = normalized;
      } else {
        q.push(normalized);
      }
    } else {
      q.push(normalized);
    }
    schedule(jobId);
  }

  function flush(jobId) {
    const timer = timers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      timers.delete(jobId);
    }
    const q = queues.get(jobId);
    queues.delete(jobId);
    if (!q?.length) return;
    const lines = compactLogBatch(q);
    if (!lines.length) return;
    onFlush?.(jobId, lines);
  }

  function flushAll() {
    const ids = new Set([...queues.keys(), ...timers.keys()]);
    for (const id of ids) flush(id);
  }

  function clear(jobId) {
    const timer = timers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      timers.delete(jobId);
    }
    queues.delete(jobId);
    lastLiveAt.delete(jobId);
  }

  return { enqueue, flush, flushAll, clear };
}

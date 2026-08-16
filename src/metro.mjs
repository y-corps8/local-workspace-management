function asMetroPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return port;
}

function portFromMetroUrl(raw) {
  const trimmed = String(raw || "").replace(/[.,;]+$/, "");
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.replace(/^exps?:\/\//i, "http://"));
    if (url.port) return asMetroPort(url.port);
  } catch {
    // fall through
  }
  const match = trimmed.match(/:(\d{2,5})(?:[/?#]|$)/);
  return match ? asMetroPort(match[1]) : null;
}

/** Expo/Metro lines only — not arbitrary http:// in stack traces. */
export function parseMetroPortFromText(text) {
  const line = String(text || "");
  if (!line.trim()) return null;
  const busy = line.match(/port\s+\d{2,5}\s+is\s+busy,\s+using\s+(\d{2,5})/i);
  if (busy) return asMetroPort(busy[1]);
  const waiting = line.match(
    /(?:metro\s+waiting\s+on|web\s+is\s+waiting\s+on|waiting\s+on)\s+((?:https?|exps?):\/\/\S+)/i
  );
  if (waiting) {
    const port = portFromMetroUrl(waiting[1]);
    if (port) return port;
  }
  const exp = line.match(/\bexps?:\/\/[^\s"'<>]+/gi);
  if (exp) {
    for (let i = exp.length - 1; i >= 0; i -= 1) {
      const port = portFromMetroUrl(exp[i]);
      if (port) return port;
    }
  }
  return null;
}

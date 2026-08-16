/**
 * Loopback dashboard Origin check. Missing Origin (curl) is allowed.
 * A present Origin must be this process’s overview URL (127.0.0.1 or localhost).
 */
export function isLocalOrigin(origin, { host = "127.0.0.1", port = 4174 } = {}) {
  if (origin == null || origin === "") return true;
  const allowed = new Set([
    `http://${host}:${port}`,
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ]);
  return allowed.has(String(origin));
}

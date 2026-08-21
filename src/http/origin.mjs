/**
 * Loopback dashboard Origin / Host checks and response security headers.
 * Missing Origin or Host (curl) is allowed. A present value must be this
 * process’s overview URL (127.0.0.1 or localhost).
 */

const CSP =
  "default-src 'self'; frame-ancestors 'none'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'self'; form-action 'self'";

export function securityHeaders() {
  return {
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}

function loopbackHttpUrls(host, port) {
  return new Set([
    `http://${host}:${port}`,
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ]);
}

function loopbackHosts(host, port) {
  return new Set(
    [`${host}:${port}`, `127.0.0.1:${port}`, `localhost:${port}`].map((value) => value.toLowerCase())
  );
}

export function isLocalOrigin(origin, { host = "127.0.0.1", port = 4174 } = {}) {
  if (origin == null || origin === "") return true;
  return loopbackHttpUrls(host, port).has(String(origin));
}

export function isLocalHost(hostHeader, { host = "127.0.0.1", port = 4174 } = {}) {
  if (hostHeader == null || hostHeader === "") return true;
  return loopbackHosts(host, port).has(String(hostHeader).trim().toLowerCase());
}

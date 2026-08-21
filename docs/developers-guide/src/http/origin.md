# `src/http/origin.mjs`

Loopback Origin / Host checks and response security headers. Missing Origin or Host (curl) is allowed. A present value must be this process’s overview URL (`127.0.0.1` or `localhost` plus the **bound** port).

## Imports / used by

**Imports:** none from `src/`

**Used by:** [overview-http.mjs](overview-http.md) — Host on every request; Origin on `/api/*`

## Exports

| Name | Role |
|------|------|
| `securityHeaders()` | `X-Frame-Options: DENY`, CSP (`default-src 'self'; frame-ancestors 'none'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'self'; form-action 'self'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` |
| `isLocalOrigin(origin, { host, port })` | `true` if missing/empty or in the allow set |
| `isLocalHost(hostHeader, { host, port })` | Same allow set as Origin, compared case-insensitively as `host:port` |

## How it works

Allowed Origin when present: `http://<host>:<port>`, `http://127.0.0.1:<port>`, `http://localhost:<port>` (defaults `127.0.0.1` / `4174`). Host allow set is the same hosts without the scheme. Not a token scheme — loopback bind is the other half of the model. CSP has no `unsafe-inline`; theme FOUC uses [theme-boot.js](../../public/theme-boot.md).

## Tests

[`test/origin.test.mjs`](../../../../test/http/origin.test.mjs) — Origin, Host, `securityHeaders`.

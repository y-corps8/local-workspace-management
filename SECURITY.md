# Security policy

## Reporting a vulnerability

Report security issues **privately**. Do not open a public GitHub issue.

- Email: **mohityadavv1108@gmail.com**
- Or use **GitHub Security Advisories** on this repository (Security tab → Report a vulnerability)

Please include enough detail to reproduce the problem (OS, Node version, steps). Do not attach a live `workspace.json` with real project paths; redact or describe the setup instead.

You should hear back within **7 days**. If the report is accepted, we aim to ship a fix and disclose it within **90 days** of the report (sooner when we can).

## What this project is

A loopback dashboard that starts, stops, and watches **allowlisted** commands from `workspace.json` on your machine. The browser sends a command **id** only — never a shell string. The server binds to `127.0.0.1` (port **4174**, or `OVERVIEW_PORT`). Responses include `X-Frame-Options: DENY` and a CSP that forbids framing. A present `Host` (and `Origin` on `/api/*`) must be this loopback URL. The CLI command `locws upgrade` runs a hardcoded `npm install -g locws@latest` in the Node process the user launched — not from the browser.

## In scope

Please report privately if you find a way to:

- Bind or reach the dashboard on a non-loopback interface without changing the source
- Run a command that is not on the allowlist (including a client-supplied argv or shell string)
- Bypass Origin or Host checks (foreign `Origin` / `Host` must be 403; missing values may be allowed for curl)
- Embed the dashboard in a third-party frame (headers must deny framing)
- Leak allowlisted `argv`, or Metro `kind` / `method` / `params`, through the public API
- Otherwise execute or exfiltrate more than the operator already configured

## Out of scope

By design, this tool **runs the commands you configured** (start, test, seed, custom `argv`, Expo live actions) on your machine. That is not a vulnerability.

Also out of scope:

- Exposing the dashboard port yourself (port forward, reverse proxy, `0.0.0.0`)
- Commands you added that are destructive or that read secrets from a project folder
- Issues that require a local attacker who already uses the same machine and browser as you

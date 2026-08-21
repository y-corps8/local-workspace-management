import path from "node:path";

/**
 * Parse a dotenv file. KEY=VALUE, # comments, optional export, single/double quotes.
 * No interpolation or command expansion.
 */
export function parseEnvFile(text) {
  const env = {};
  const source = String(text ?? "");
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const body = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = body.indexOf("=");
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = body.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
        (value.startsWith("'") && value.endsWith("'") && value.length >= 2)) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') {
        value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      }
    } else {
      const hash = value.indexOf(" #");
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    env[key] = value;
  }
  return env;
}

const BLOCKED_ENV_KEYS = new Set([
  "NODE_OPTIONS",
  "NODE_PATH",
  "LD_PRELOAD",
  "PYTHONPATH",
  "JAVA_TOOL_OPTIONS",
  "DOTNET_STARTUP_HOOKS",
  "BASH_ENV",
  "ENV",
  "PERL5OPT",
  "RUBYOPT",
]);

function isBlockedEnvKey(key) {
  if (BLOCKED_ENV_KEYS.has(key)) return true;
  if (key.startsWith("DYLD_")) return true;
  return false;
}

/**
 * Copy parsed .env onto spawn env. PATH from the file is appended, never replaced,
 * so Homebrew / ~/.local/bin extras stay. Loader-injection keys are skipped.
 */
export function applyEnvFile(env, parsed) {
  const next = { ...env };
  const extraPath = parsed?.PATH;
  for (const [key, value] of Object.entries(parsed || {})) {
    if (key === "PATH") continue;
    if (isBlockedEnvKey(key)) continue;
    next[key] = value;
  }
  if (extraPath) {
    const delim = path.delimiter;
    const parts = String(next.PATH || "")
      .split(delim)
      .filter(Boolean);
    for (const part of String(extraPath).split(/[:;]/).filter(Boolean)) {
      if (!parts.includes(part)) parts.push(part);
    }
    next.PATH = parts.join(delim);
  }
  return next;
}

import fs from "node:fs";
import path from "node:path";

export const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"];

export function isPackageManagerBin(bin) {
  return PACKAGE_MANAGERS.includes(String(bin || ""));
}

function packageManagerFromField(value) {
  const name = String(value || "").split("@")[0].trim().toLowerCase();
  return PACKAGE_MANAGERS.includes(name) ? name : "";
}

export function detectPackageManager(root, pkg = null) {
  const fromField = packageManagerFromField(pkg?.packageManager);
  if (fromField) return fromField;
  if (!root) return "npm";
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(root, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(root, "bun.lock")) || fs.existsSync(path.join(root, "bun.lockb"))) {
    return "bun";
  }
  return "npm";
}

export function packageManagerArgv(pm, script) {
  const name = String(script || "");
  if (pm === "yarn") return ["yarn", "run", name];
  if (pm === "pnpm") {
    if (name === "start" || name === "test") return ["pnpm", name];
    return ["pnpm", "run", name];
  }
  if (pm === "bun") return ["bun", "run", name];
  if (name === "start" || name === "test") return ["npm", name];
  return ["npm", "run", name];
}

/** Windows spawn without shell: npm/pnpm/yarn are .cmd; bun is bun.exe. */
export function spawnFileForBin(bin, platform = process.platform) {
  const name = String(bin || "");
  if (platform !== "win32") return name;
  if (name === "npm") return "npm.cmd";
  if (name === "pnpm") return "pnpm.cmd";
  if (name === "yarn") return "yarn.cmd";
  if (name === "bun") return "bun.exe";
  return name;
}

export function resolveSpawnArgv(argv, platform = process.platform) {
  if (!Array.isArray(argv) || !argv.length) return argv;
  const next = [...argv];
  next[0] = spawnFileForBin(next[0], platform);
  return next;
}

/** Jest --json only when the runner is Jest, never Maven / Vitest / Playwright / Mocha. */
export function guessJestJson({ script, scriptBody, deps = {}, hasMaven, group } = {}) {
  if (hasMaven) return false;
  if (group !== "test") return false;
  const body = String(scriptBody || script || "");
  if (/\b(vitest|playwright|mocha|ava|pytest)\b/i.test(body)) return false;
  if (/\bjest\b/i.test(body)) return true;
  if (deps.jest && !deps.vitest) return true;
  return false;
}

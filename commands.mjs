/**
 * Allowlist and workspace paths for the overview dashboard.
 *
 * Projects and commands come from workspace.json. The browser never sends a
 * shell string — only a command id from COMMANDS.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Paths ──────────────────────────────────────────────────────────────────

export const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = path.join(APP_ROOT, ".cache");
export const LAST_TEST_RUNS_PATH = path.join(CACHE_DIR, "last-test-runs.json");
export const WORKSPACE_CONFIG_PATH = path.join(APP_ROOT, "workspace.json");

// Bound to loopback only — see server.mjs listen().
export const PORT = 4174;
export const HOST = "127.0.0.1";
export const OVERVIEW_URL = `http://${HOST}:${PORT}`;

/**
 * Live actions shown while an Expo Metro command is running.
 * Matches the compact terminal help (r / m / i / a / w / j / o + More tools).
 * kind / method / params stay server-side — see publicCommand().
 * Attach with `"interactions": "expo"` in workspace.json.
 */
export const EXPO_INTERACTIONS = [
  { id: "reload", label: "Reload", hint: "Reload the app (same as r).", kind: "metro", method: "reload" },
  { id: "devMenu", label: "Menu", hint: "Toggle the developer menu (same as m).", kind: "metro", method: "devMenu" },
  { id: "openIos", label: "iOS", hint: "Open on the iOS simulator (same as i).", kind: "openIos" },
  { id: "openAndroid", label: "Android", hint: "Open on Android (same as a).", kind: "openAndroid" },
  { id: "openWeb", label: "Web", hint: "Open in the browser (same as w).", kind: "openWeb" },
  { id: "debugger", label: "Debugger", hint: "Open React Native DevTools (same as j).", kind: "debugger" },
  { id: "editor", label: "Editor", hint: "Open the project in the editor (same as o).", kind: "editor" },
  {
    id: "inspect",
    label: "Inspect",
    hint: "Toggle element inspector (More tools).",
    kind: "metro",
    method: "sendDevCommand",
    params: { name: "toggleElementInspector" },
  },
  {
    id: "perf",
    label: "Perf",
    hint: "Toggle performance monitor (More tools).",
    kind: "metro",
    method: "sendDevCommand",
    params: { name: "togglePerformanceMonitor" },
  },
];

const INTERACTION_PRESETS = {
  expo: EXPO_INTERACTIONS,
};

// ── Command factory ────────────────────────────────────────────────────────

function npmScript(script) {
  // `npm start` / `npm test` are lifecycle scripts — no `run`.
  if (script === "start" || script === "test") {
    return ["npm", script];
  }
  return ["npm", "run", script];
}

function cmd(repo, script, options = {}) {
  const {
    argv,
    label,
    group,
    longRunning,
    destructive,
    jestJson,
    kind,
    confirmTitle,
    confirmMessage,
    hint,
    interactions,
  } = options;
  return {
    id: `${repo}:${script}`,
    repo,
    script,
    label: label ?? script,
    group: group ?? "tooling",
    argv: argv ?? npmScript(script),
    longRunning: Boolean(longRunning),
    destructive: Boolean(destructive),
    // When true, resolveArgv appends Jest --json so last-run cards stay current.
    jestJson: Boolean(jestJson),
    kind: kind ?? (group === "test" ? "test" : "command"),
    confirmTitle: confirmTitle ?? null,
    confirmMessage: confirmMessage ?? null,
    hint: hint ?? null,
    interactions: interactions ?? [],
  };
}

function expandHome(value) {
  const text = String(value ?? "").trim();
  if (!text) return text;
  if (text === "~") return os.homedir();
  if (text.startsWith("~/") || text.startsWith("~\\")) {
    return path.join(os.homedir(), text.slice(2));
  }
  return text;
}

function resolveUserPath(value, baseDir) {
  const expanded = expandHome(value);
  if (!expanded) {
    throw new Error("path is empty");
  }
  if (path.isAbsolute(expanded)) {
    return path.resolve(expanded);
  }
  return path.resolve(baseDir, expanded);
}

function resolveInteractions(value) {
  if (value == null || value === "") return [];
  if (typeof value === "string") {
    const preset = INTERACTION_PRESETS[value];
    if (!preset) {
      throw new Error(`Unknown interactions preset "${value}" (use "expo" or omit)`);
    }
    return preset;
  }
  if (Array.isArray(value)) {
    throw new Error('Put Metro action details in code — use "interactions": "expo" in workspace.json');
  }
  throw new Error('interactions must be "expo" or omitted');
}

function emptyRawWorkspace() {
  return {
    workspaceRoot: ".",
    metroPort: 8081,
    expoDevClientScheme: "app",
    projects: [],
  };
}

function assertId(value, label) {
  const id = String(value ?? "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) {
    throw new Error(`${label} must be letters, numbers, hyphens, or underscores`);
  }
  return id;
}

function assertArgv(argv, projectId, script) {
  if (argv == null) return undefined;
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((part) => typeof part !== "string" || !part.trim())) {
    throw new Error(`Command "${projectId}:${script}" argv must be a non-empty array of strings`);
  }
  return argv.map((part) => part.trim());
}

function sanitizeRawWorkspace(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Workspace config must be a JSON object");
  }
  const projects = Array.isArray(raw.projects) ? raw.projects : [];
  const seenIds = new Set();
  const cleanProjects = projects.map((project) => {
    if (!project?.id || !project?.path) {
      throw new Error("Each project needs an id and path");
    }
    const id = assertId(project.id, "Project id");
    if (seenIds.has(id)) {
      throw new Error(`Duplicate project id "${id}"`);
    }
    seenIds.add(id);
    const commands = (project.commands ?? []).map((entry) => {
      const argv = assertArgv(entry.argv, id, entry?.script || "command");
      if (!entry?.script && !argv) {
        throw new Error(`Project "${id}" has a command without a script or argv`);
      }
      const script = String(entry.script || argv[argv.length - 1]).trim();
      const command = {
        script,
        group: entry.group || "tooling",
      };
      if (entry.label) command.label = String(entry.label);
      if (entry.hint) command.hint = String(entry.hint);
      if (entry.longRunning) command.longRunning = true;
      if (entry.destructive) command.destructive = true;
      if (entry.jestJson) command.jestJson = true;
      if (entry.confirmTitle) command.confirmTitle = String(entry.confirmTitle);
      if (entry.confirmMessage) command.confirmMessage = String(entry.confirmMessage);
      if (entry.interactions === "expo") command.interactions = "expo";
      if (argv) command.argv = argv;
      return command;
    });
    const next = {
      id,
      name: String(project.name || id),
      role: String(project.role || ""),
      path: String(project.path).trim(),
      ports: Array.isArray(project.ports) ? project.ports.filter((port) => Number.isFinite(Number(port))).map(Number) : [],
      testKind: project.testKind === "maven" ? "maven" : "jest",
      commands,
    };
    if (project.health && Number.isFinite(Number(project.health.port))) {
      next.health = {
        stack: String(project.health.stack || next.name),
        port: Number(project.health.port),
      };
    }
    return next;
  });

  return {
    workspaceRoot: String(raw.workspaceRoot || ".").trim() || ".",
    metroPort: Number(raw.metroPort) || 8081,
    expoDevClientScheme: String(raw.expoDevClientScheme || "app").trim() || "app",
    projects: cleanProjects,
  };
}

function parseWorkspace(raw) {
  const clean = sanitizeRawWorkspace(raw);
  const workspaceRoot = resolveUserPath(clean.workspaceRoot, APP_ROOT);
  const repos = {};
  const repoOrder = [];
  const healthChecks = [];
  const commands = [];

  for (const project of clean.projects) {
    const root = resolveUserPath(project.path, workspaceRoot);
    repos[project.id] = {
      id: project.id,
      name: project.name,
      role: project.role,
      root,
      ports: project.ports,
      testKind: project.testKind,
    };
    repoOrder.push(project.id);
    if (project.health) {
      healthChecks.push({
        id: project.id,
        repo: project.id,
        label: project.name,
        stack: project.health.stack,
        port: project.health.port,
      });
    }
    for (const entry of project.commands) {
      commands.push(
        cmd(project.id, entry.script, {
          argv: entry.argv,
          label: entry.label,
          group: entry.group,
          longRunning: entry.longRunning,
          destructive: entry.destructive,
          jestJson: entry.jestJson,
          confirmTitle: entry.confirmTitle,
          confirmMessage: entry.confirmMessage,
          hint: entry.hint,
          interactions: resolveInteractions(entry.interactions),
        })
      );
    }
  }

  return {
    workspaceRoot,
    metroPort: clean.metroPort,
    expoDevClientScheme: clean.expoDevClientScheme,
    repos,
    repoOrder,
    healthChecks,
    commands,
    raw: clean,
  };
}

export const REPOS = {};
export const REPO_ORDER = [];
export const HEALTH_CHECKS = [];
export const COMMANDS = [];
export const COMMAND_BY_ID = new Map();
export let WORKSPACE_ROOT = APP_ROOT;
export let METRO_PORT = 8081;
export let EXPO_DEV_CLIENT_SCHEME = "app";

function applyWorkspace(parsed) {
  for (const key of Object.keys(REPOS)) delete REPOS[key];
  Object.assign(REPOS, parsed.repos);
  REPO_ORDER.splice(0, REPO_ORDER.length, ...parsed.repoOrder);
  HEALTH_CHECKS.splice(0, HEALTH_CHECKS.length, ...parsed.healthChecks);
  COMMANDS.splice(0, COMMANDS.length, ...parsed.commands);
  COMMAND_BY_ID.clear();
  for (const command of COMMANDS) {
    COMMAND_BY_ID.set(command.id, command);
  }
  WORKSPACE_ROOT = parsed.workspaceRoot;
  METRO_PORT = parsed.metroPort;
  EXPO_DEV_CLIENT_SCHEME = parsed.expoDevClientScheme;
}

export function readRawWorkspace() {
  if (!fs.existsSync(WORKSPACE_CONFIG_PATH)) {
    return emptyRawWorkspace();
  }
  try {
    const raw = JSON.parse(fs.readFileSync(WORKSPACE_CONFIG_PATH, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return emptyRawWorkspace();
    }
    if (!Array.isArray(raw.projects)) raw.projects = [];
    return raw;
  } catch {
    return emptyRawWorkspace();
  }
}

export function reloadWorkspace() {
  applyWorkspace(parseWorkspace(readRawWorkspace()));
}

export function writeRawWorkspace(data) {
  const parsed = parseWorkspace(data);
  fs.writeFileSync(WORKSPACE_CONFIG_PATH, `${JSON.stringify(parsed.raw, null, 2)}\n`);
  applyWorkspace(parsed);
  return parsed.raw;
}

function guessGroup(script) {
  if (/^(start|dev|ios|android|web)(:|$)/.test(script) || script === "spring-boot:run") return "run";
  if (/^test/.test(script)) return "test";
  if (/^seed/.test(script)) return "seed";
  if (/^(db:|migrate)/.test(script)) return "database";
  return "tooling";
}

export function probeProject({ workspaceRoot, path: projectPath }) {
  const rootInput = String(workspaceRoot || ".").trim() || ".";
  const pathInput = String(projectPath ?? "").trim();
  if (!pathInput) {
    throw new Error("path is required");
  }
  const base = resolveUserPath(rootInput, APP_ROOT);
  const resolved = resolveUserPath(pathInput, base);
  const exists = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory();
  const name = path.basename(resolved);
  if (!exists) {
    return { exists: false, resolved, name, scripts: [], hasMaven: false, hasExpo: false };
  }
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(resolved, "package.json"), "utf8"));
  } catch {
    pkg = null;
  }
  const scriptNames = pkg?.scripts && typeof pkg.scripts === "object" ? Object.keys(pkg.scripts) : [];
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const hasExpo = Boolean(deps.expo) || scriptNames.some((script) => /\bexpo\b/.test(String(pkg.scripts[script] || "")));
  const hasMaven = fs.existsSync(path.join(resolved, "mvnw")) || fs.existsSync(path.join(resolved, "pom.xml"));
  const scripts = scriptNames.map((script) => {
    const group = guessGroup(script);
    return {
      script,
      group,
      longRunning: group === "run",
      jestJson: group === "test" && !hasMaven,
      interactions: hasExpo && group === "run" ? "expo" : "",
    };
  });
  if (hasMaven && !scripts.some((item) => item.script === "spring-boot:run")) {
    scripts.unshift({
      script: "spring-boot:run",
      group: "run",
      longRunning: true,
      jestJson: false,
      interactions: "",
      argv: ["./mvnw", "spring-boot:run"],
    });
  }
  return { exists: true, resolved, name, scripts, hasMaven, hasExpo };
}

reloadWorkspace();

export const COMMAND_GROUPS = [
  { id: "run", label: "Run" },
  { id: "database", label: "Database" },
  { id: "seed", label: "Seed" },
  { id: "test", label: "Tests" },
  { id: "tooling", label: "Tooling" },
];

/** Fields the browser may see — argv, kind, and Metro details stay server-side. */
export function publicCommand(command) {
  return {
    id: command.id,
    repo: command.repo,
    script: command.script,
    label: command.label,
    group: command.group,
    longRunning: command.longRunning,
    destructive: command.destructive,
    confirmTitle: command.confirmTitle,
    confirmMessage: command.confirmMessage,
    hint: command.hint,
    interactions: (command.interactions ?? []).map((item) => ({
      id: item.id,
      label: item.label,
      hint: item.hint,
    })),
  };
}

export function findInteraction(command, actionId) {
  return (command.interactions ?? []).find((item) => item.id === actionId) ?? null;
}

/** Extra Jest flags: plain `npm test` does not write coverage/jest-results.json. */
export function resolveArgv(command) {
  const argv = [...command.argv];
  if (command.jestJson) {
    argv.push("--", "--json", "--outputFile=coverage/jest-results.json");
  }
  return argv;
}

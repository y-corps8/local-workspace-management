/**
 * Allowlist and workspace paths for the overview dashboard.
 *
 * Projects and commands come from workspace.json. The browser never sends a
 * shell string — only a command id from COMMANDS.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  detectPackageManager,
  guessJestJson,
  isPackageManagerBin,
  packageManagerArgv,
  resolveSpawnArgv,
} from "./package-manager.mjs";
import {
  APP_ROOT,
  CACHE_DIR,
  PATH_BASE,
  WORKSPACE_CONFIG_PATH,
  WORKSPACE_DIR,
} from "./paths.mjs";

export { APP_ROOT, CACHE_DIR, PATH_BASE, WORKSPACE_CONFIG_PATH, WORKSPACE_DIR };

export const LAST_TEST_RUNS_PATH = path.join(CACHE_DIR, "last-test-runs.json");

export const DEFAULT_PORT = 4174;

/** Integer 1–65535. Empty / unset → fallback. Invalid throws. */
export function parseOverviewPort(raw, fallback = DEFAULT_PORT) {
  const text = String(raw ?? "").trim();
  if (!text) return fallback;
  if (!/^\d+$/.test(text)) {
    throw new Error(`OVERVIEW_PORT must be an integer 1–65535 (got ${JSON.stringify(text)})`);
  }
  const n = Number(text);
  if (n < 1 || n > 65535) {
    throw new Error(`OVERVIEW_PORT must be an integer 1–65535 (got ${JSON.stringify(text)})`);
  }
  return n;
}

function portFromProcessEnv() {
  try {
    return parseOverviewPort(process.env.OVERVIEW_PORT);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
    return DEFAULT_PORT;
  }
}

// Bound to loopback only — see server.mjs listen(). OVERVIEW_PORT overrides 4174.
export const PORT = portFromProcessEnv();
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
  const customArgv = Array.isArray(argv);
  return {
    id: `${repo}:${script}`,
    repo,
    script,
    label: String(label ?? script).trim().toLowerCase() || String(script),
    group: group ?? "tools",
    argv: customArgv ? argv : packageManagerArgv("npm", script),
    customArgv,
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

function clipDescription(value) {
  return String(value ?? "").trim().slice(0, 50);
}

function emptyRawWorkspace() {
  return {
    showTestOverview: false,
    projects: [],
  };
}

function isRelativeUserPath(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (text === "~" || text.startsWith("~/") || text.startsWith("~\\")) return false;
  return !path.isAbsolute(text);
}

function assertId(value, label) {
  const id = String(value ?? "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) {
    throw new Error(`${label} must be letters, numbers, hyphens, or underscores`);
  }
  return id;
}

function assertGroup(value, projectId, script) {
  const text = String(value ?? "").trim();
  if (!text || text === "tooling") return "tools";
  return assertId(text, `Command "${projectId}:${script}" group`);
}

function assertArgv(argv, projectId, script) {
  if (argv == null) return undefined;
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((part) => typeof part !== "string" || !part.trim())) {
    throw new Error(`Command "${projectId}:${script}" argv must be a non-empty array of strings`);
  }
  return argv.map((part) => part.trim());
}

export function sanitizeRawWorkspace(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Workspace config must be a JSON object");
  }
  const legacyScheme = String(raw.expoDevClientScheme || "app").trim() || "app";
  const legacyRoot = String(raw.workspaceRoot ?? "").trim();
  const legacyBase = legacyRoot ? resolveUserPath(legacyRoot, PATH_BASE) : null;
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
    const seenScripts = new Set();
    const commands = (project.commands ?? []).map((entry) => {
      const argv = assertArgv(entry.argv, id, entry?.script || "command");
      if (!entry?.script && !argv) {
        throw new Error(`Project "${id}" has a command without a script or argv`);
      }
      const script = String(entry.script || argv[argv.length - 1]).trim();
      if (seenScripts.has(script)) {
        throw new Error(`Duplicate command "${id}:${script}"`);
      }
      seenScripts.add(script);
      const command = {
        script,
        group: assertGroup(entry.group, id, script),
      };
      if (entry.label) {
        const label = String(entry.label).trim().toLowerCase();
        if (label) command.label = label;
      }
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
    const hasExpo = commands.some((entry) => entry.interactions === "expo");
    let projectPath = String(project.path).trim();
    if (legacyBase && isRelativeUserPath(projectPath)) {
      projectPath = resolveUserPath(projectPath, legacyBase);
    }
    const next = {
      id,
      name: String(project.name || id),
      path: projectPath,
      ports: Array.isArray(project.ports) ? project.ports.filter((port) => Number.isFinite(Number(port))).map(Number) : [],
      testKind: project.testKind === "maven" ? "maven" : "jest",
      commands,
    };
    const description = clipDescription(project.description || project.role || "");
    if (description) next.description = description;
    if (hasExpo || project.expoDevClientScheme) {
      next.expoDevClientScheme = String(project.expoDevClientScheme || legacyScheme).trim() || "app";
    }
    const explicitPort = Number(project.metroPort);
    if (Number.isFinite(explicitPort) && explicitPort > 0) {
      next.metroPort = explicitPort;
    } else if ((hasExpo || project.expoDevClientScheme) && raw.metroPort != null) {
      const fromLegacy = Number(raw.metroPort);
      if (Number.isFinite(fromLegacy) && fromLegacy > 0) next.metroPort = fromLegacy;
    }
    if (project.health && Number.isFinite(Number(project.health.port))) {
      next.health = {
        stack: String(project.health.stack || next.name),
        port: Number(project.health.port),
      };
    }
    if (project.hidden) next.hidden = true;
    return next;
  });

  return {
    showTestOverview: Boolean(raw.showTestOverview),
    projects: cleanProjects,
  };
}

function parseWorkspace(raw) {
  const clean = sanitizeRawWorkspace(raw);
  const repos = {};
  const repoOrder = [];
  const healthChecks = [];
  const commands = [];

  for (const project of clean.projects) {
    const root = resolveUserPath(project.path, PATH_BASE);
    repos[project.id] = {
      id: project.id,
      name: project.name,
      description: project.description,
      path: project.path,
      root,
      ports: project.ports,
      testKind: project.testKind,
      metroPort: Number(project.metroPort) || 8081,
      expoDevClientScheme: String(project.expoDevClientScheme || "app").trim() || "app",
      hidden: Boolean(project.hidden),
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
    showTestOverview: clean.showTestOverview,
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
export let SHOW_TEST_OVERVIEW = false;

let loadedRaw = emptyRawWorkspace();
let workspaceLoadedOnce = false;
let ignoreWatchUntil = 0;
let workspaceChangeListener = null;
let workspaceWatcherStarted = false;

function cloneRaw(raw) {
  return JSON.parse(JSON.stringify(raw));
}

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
  SHOW_TEST_OVERVIEW = Boolean(parsed.showTestOverview);
  loadedRaw = parsed.raw;
  workspaceLoadedOnce = true;
}

function readWorkspaceFile() {
  if (!fs.existsSync(WORKSPACE_CONFIG_PATH)) {
    return { missing: true, raw: emptyRawWorkspace() };
  }
  const raw = JSON.parse(fs.readFileSync(WORKSPACE_CONFIG_PATH, "utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Workspace config must be a JSON object");
  }
  if (!Array.isArray(raw.projects)) raw.projects = [];
  return { missing: false, raw };
}

export function readRawWorkspace() {
  try {
    return readWorkspaceFile().raw;
  } catch (error) {
    console.error("workspace.json:", error.message || error);
    return cloneRaw(loadedRaw);
  }
}

export function readCleanWorkspace() {
  try {
    return sanitizeRawWorkspace(cloneRaw(loadedRaw));
  } catch {
    return cloneRaw(loadedRaw);
  }
}

export function reloadWorkspace({ fromWatch = false } = {}) {
  try {
    const { missing, raw } = readWorkspaceFile();
    if (missing) {
      if (!fromWatch && !workspaceLoadedOnce) {
        applyWorkspace(parseWorkspace(emptyRawWorkspace()));
      }
      return { ok: true, missing: true };
    }
    applyWorkspace(parseWorkspace(raw));
    return { ok: true };
  } catch (error) {
    console.error("workspace.json:", error.message || error);
    if (!workspaceLoadedOnce) {
      applyWorkspace(parseWorkspace(emptyRawWorkspace()));
    }
    return { ok: false, error };
  }
}

function atomicWriteWorkspace(raw) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  const tmp = path.join(WORKSPACE_DIR, `.workspace.${process.pid}.tmp`);
  ignoreWatchUntil = Date.now() + 500;
  fs.writeFileSync(tmp, `${JSON.stringify(raw, null, 2)}\n`);
  fs.renameSync(tmp, WORKSPACE_CONFIG_PATH);
}

/** Directory `fs.watch` can fire with a null filename; those events are noise. */
export function shouldReloadWorkspaceWatch(filename, { fromDirectory = false } = {}) {
  if (fromDirectory && (filename == null || filename === "")) return false;
  const name = path.basename(String(filename || ""));
  if (!name) return !fromDirectory;
  if (name.startsWith(".workspace.") && name.endsWith(".tmp")) return false;
  if (name === "workspace.json") return true;
  if (name.startsWith(".workspace.")) return true;
  return false;
}

export function writeRawWorkspace(data) {
  const parsed = parseWorkspace(data);
  atomicWriteWorkspace(parsed.raw);
  applyWorkspace(parsed);
  return parsed.raw;
}

export function setWorkspaceChangeListener(fn) {
  workspaceChangeListener = typeof fn === "function" ? fn : null;
}

export function startWorkspaceWatcher() {
  if (workspaceWatcherStarted || process.env.OVERVIEW_SKIP_WORKSPACE_LOAD === "1") return;
  workspaceWatcherStarted = true;
  let timer = null;
  const kick = () => {
    if (Date.now() < ignoreWatchUntil) return;
    const result = reloadWorkspace({ fromWatch: true });
    if (result.ok && !result.missing) workspaceChangeListener?.();
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(kick, 200);
  };
  try {
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
    if (fs.existsSync(WORKSPACE_CONFIG_PATH)) {
      fs.watch(WORKSPACE_CONFIG_PATH, () => schedule());
    }
    fs.watch(WORKSPACE_DIR, (_event, filename) => {
      if (!shouldReloadWorkspaceWatch(filename, { fromDirectory: true })) return;
      schedule();
    });
  } catch (error) {
    console.error("Could not watch workspace.json:", error.message || error);
  }
}

export function updateProjectPath(projectId, projectPath) {
  const id = String(projectId ?? "").trim();
  const pathInput = String(projectPath ?? "").trim();
  if (!id) throw new Error("id is required");
  if (!pathInput) throw new Error("path is required");
  const raw = cloneRaw(loadedRaw);
  const project = (raw.projects || []).find((item) => item.id === id);
  if (!project) throw new Error(`Unknown project "${id}"`);
  project.path = pathInput;
  return writeRawWorkspace(raw);
}

export function reorderProjects(ids) {
  const list = Array.isArray(ids) ? ids.map((id) => String(id ?? "").trim()).filter(Boolean) : [];
  const raw = cloneRaw(loadedRaw);
  const projects = raw.projects || [];
  if (list.length !== projects.length) {
    throw new Error("ids must include every project once");
  }
  const byId = new Map(projects.map((project) => [project.id, project]));
  const seen = new Set();
  const next = [];
  for (const id of list) {
    if (seen.has(id) || !byId.has(id)) {
      throw new Error(`Unknown or duplicate id "${id}"`);
    }
    seen.add(id);
    next.push(byId.get(id));
  }
  raw.projects = next;
  return writeRawWorkspace(raw);
}

/** package.json scripts in a project folder — used for npm button availability. */
export function repoPackageState(repoRoot) {
  if (!repoRoot || !fs.existsSync(repoRoot) || !fs.statSync(repoRoot).isDirectory()) {
    return { exists: false, hasPackageJson: false, scripts: [] };
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
    const scripts = pkg?.scripts && typeof pkg.scripts === "object" ? Object.keys(pkg.scripts) : [];
    return { exists: true, hasPackageJson: true, scripts, pkg };
  } catch {
    return { exists: true, hasPackageJson: false, scripts: [] };
  }
}

/** Package-manager argv is checked against package.json; custom argv only needs the folder. */
export function commandAvailability(command, pkgState) {
  const exists = Boolean(pkgState?.exists);
  const isPm = !command.customArgv || isPackageManagerBin(command.argv?.[0]);
  if (!exists) {
    return { available: false, unavailableReason: "missing_folder" };
  }
  if (!isPm) {
    return { available: true, unavailableReason: null };
  }
  if (!pkgState.hasPackageJson) {
    return { available: false, unavailableReason: "missing_package_json" };
  }
  if (!(pkgState.scripts || []).includes(command.script)) {
    return { available: false, unavailableReason: "missing_script" };
  }
  return { available: true, unavailableReason: null };
}

function guessGroup(script) {
  if (/^(start|dev|ios|android|web)(:|$)/.test(script) || script === "spring-boot:run") return "run";
  if (/^test/.test(script)) return "test";
  if (/^seed/.test(script)) return "seed";
  if (/^(db:|migrate)/.test(script)) return "database";
  return "tools";
}

function firstScheme(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = String(item || "").trim();
      if (text) return text;
    }
    return "";
  }
  return String(value || "").trim();
}

function schemeFromExpoConfig(data) {
  if (!data || typeof data !== "object") return "";
  return firstScheme(data.expo?.scheme) || firstScheme(data.scheme);
}

function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

const EXPO_SCHEME_RE = /(?:^|[,\s{])scheme\s*:\s*["']([A-Za-z][A-Za-z0-9+.-]*)["']/;

function schemeFromConfigSource(text) {
  const match = String(text || "").match(EXPO_SCHEME_RE);
  return match ? match[1] : "";
}

function readExpoDevClientScheme(root) {
  for (const name of ["app.json", "app.config.json"]) {
    const scheme = schemeFromExpoConfig(readJsonIfPresent(path.join(root, name)));
    if (scheme) return scheme;
  }
  for (const name of ["app.config.js", "app.config.ts"]) {
    try {
      const scheme = schemeFromConfigSource(fs.readFileSync(path.join(root, name), "utf8"));
      if (scheme) return scheme;
    } catch {
      // missing or unreadable
    }
  }
  return "app";
}

export function probeProject({ path: projectPath, platform = process.platform }) {
  const pathInput = String(projectPath ?? "").trim();
  if (!pathInput) {
    throw new Error("path is required");
  }
  const resolved = resolveUserPath(pathInput, PATH_BASE);
  const exists = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory();
  const name = path.basename(resolved);
  if (!exists) {
    return { exists: false, resolved, name, scripts: [], hasMaven: false, hasExpo: false, hasPackageJson: false };
  }
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(resolved, "package.json"), "utf8"));
  } catch {
    pkg = null;
  }
  const hasPackageJson = Boolean(pkg);
  const scriptNames = pkg?.scripts && typeof pkg.scripts === "object" ? Object.keys(pkg.scripts) : [];
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const hasExpo = Boolean(deps.expo) || scriptNames.some((script) => /\bexpo\b/.test(String(pkg.scripts[script] || "")));
  const hasMaven = fs.existsSync(path.join(resolved, "mvnw")) || fs.existsSync(path.join(resolved, "pom.xml"));
  const scripts = scriptNames.map((script) => {
    const group = guessGroup(script);
    const scriptBody = String(pkg.scripts[script] || "");
    return {
      script,
      group,
      longRunning: group === "run",
      jestJson: guessJestJson({ script, scriptBody, deps, hasMaven, group }),
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
      argv: [platform === "win32" ? "mvnw.cmd" : "./mvnw", "spring-boot:run"],
    });
  }
  const result = {
    exists: true,
    resolved,
    name,
    scripts,
    hasMaven,
    hasExpo,
    hasPackageJson,
    packageManager: detectPackageManager(resolved, pkg),
  };
  if (hasExpo) result.expoDevClientScheme = readExpoDevClientScheme(resolved);
  return result;
}

if (process.env.OVERVIEW_SKIP_WORKSPACE_LOAD === "1") {
  applyWorkspace(parseWorkspace(emptyRawWorkspace()));
} else {
  reloadWorkspace();
}

/** Suggested group ids for probe defaults and docs — not a closed allowlist. */
export const COMMAND_GROUPS = [
  { id: "run", label: "Run" },
  { id: "database", label: "Database" },
  { id: "seed", label: "Seed" },
  { id: "test", label: "Tests" },
  { id: "tools", label: "Tools" },
];

/** Fields the browser may see — argv, kind, and Metro details stay server-side. */
export function publicCommand(command, availability = null) {
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
    available: availability ? Boolean(availability.available) : true,
    unavailableReason: availability?.unavailableReason ?? null,
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
  let argv;
  if (command.customArgv) {
    argv = [...command.argv];
  } else {
    const root = REPOS[command.repo]?.root;
    const pm = detectPackageManager(root);
    argv = packageManagerArgv(pm, command.script);
  }
  if (command.jestJson) {
    argv.push("--", "--json", "--outputFile=coverage/jest-results.json");
  }
  return resolveSpawnArgv(argv);
}

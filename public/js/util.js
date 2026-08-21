export const SUGGESTED_GROUPS = ["run", "database", "seed", "test", "tools"];
export const GROUP_LABELS = {
  run: "Run",
  database: "Database",
  seed: "Seed",
  test: "Tests",
  tools: "Tools",
  tooling: "Tools",
};

export const CONSOLE_HEIGHT_KEY = "overview.consoleHeight";
export const CONSOLE_COLLAPSED_KEY = "overview.consoleCollapsed";
export const THEME_KEY = "overview.theme";
export const THEME_COLORS = { dark: "#0c0c0a", light: "#f6f3eb" };
export const CONSOLE_MIN_PX = 160;

export function slugifyId(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "project";
}

export function groupLabel(group) {
  const id = String(group || "tools");
  if (GROUP_LABELS[id]) return GROUP_LABELS[id];
  return id.replace(/[-_]+/g, " ").replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

export function normalizeGroup(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "tooling") return "tools";
  if (/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(text)) return text;
  const slug = slugifyId(text);
  if (slug === "tooling") return "tools";
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(slug) ? slug : "tools";
}

export function lowercaseCommandLabel(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${(seconds / 60).toFixed(1)} min`;
}

export function unavailableHint(reason, command) {
  if (reason === "missing_folder") return "Folder not found.";
  if (reason === "missing_package_json") return "No package.json — npm script unavailable.";
  if (reason === "missing_script") return `“${command?.script || "script"}” is not in package.json.`;
  return "Unavailable.";
}

export function cardAvailabilityWarning(repo, repoCommands) {
  if (repo.exists === false) return "Folder not found — edit the path in Settings.";
  const reasons = repoCommands.map((command) => command.unavailableReason).filter(Boolean);
  if (reasons.includes("missing_folder")) return "Folder not found — edit the path in Settings.";
  if (reasons.includes("missing_package_json")) return "package.json not found — npm buttons disabled.";
  const missing = reasons.filter((reason) => reason === "missing_script").length;
  if (missing === 1) return "1 command is not in package.json.";
  if (missing > 1) return `${missing} commands are not in package.json.`;
  return "";
}

export function orderGroups(commands) {
  const seen = [];
  const present = new Set();
  for (const command of commands) {
    const group = normalizeGroup(command.group);
    if (present.has(group)) continue;
    present.add(group);
    seen.push(group);
  }
  const suggested = SUGGESTED_GROUPS.filter((group) => present.has(group));
  const custom = seen.filter((group) => !SUGGESTED_GROUPS.includes(group));
  return [...suggested, ...custom];
}

export function dashboardRepos(repos) {
  return (repos ?? []).filter((repo) => !repo.hidden);
}

export function moveItem(list, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return list;
  const next = list.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function weaveVisibleIds(allRepos, visibleIds) {
  const queue = visibleIds.slice();
  return allRepos.map((repo) => (repo.hidden ? repo.id : queue.shift()));
}

export function clearDragStyles(root) {
  root?.querySelectorAll(".is-dragging, .is-drag-over").forEach((el) => {
    el.classList.remove("is-dragging", "is-drag-over");
  });
}

export function readStoredConsoleHeight() {
  try {
    const value = Number(localStorage.getItem(CONSOLE_HEIGHT_KEY));
    if (Number.isFinite(value) && value > 0) return value;
  } catch {
    // private mode / blocked storage
  }
  return null;
}

export function readStoredCollapsed() {
  try {
    const raw = localStorage.getItem(CONSOLE_COLLAPSED_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    // private mode / blocked storage
  }
  return null;
}

export function persistConsoleHeight(px) {
  try {
    localStorage.setItem(CONSOLE_HEIGHT_KEY, String(px));
  } catch {
    // private mode / blocked storage
  }
}

export function persistConsoleCollapsed(collapsed) {
  try {
    localStorage.setItem(CONSOLE_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // private mode / blocked storage
  }
}

export function readStoredTheme() {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === "light" || raw === "dark") return raw;
  } catch {
    // private mode / blocked storage
  }
  return "dark";
}

export function persistTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // private mode / blocked storage
  }
}

export function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function chipClass(status) {
  if (status === "pass") return "chip chip-pass";
  if (status === "fail") return "chip chip-fail";
  if (status === "running") return "chip chip-run";
  return "chip chip-idle";
}

export function chipLabel(status) {
  if (status === "pass") return "Pass";
  if (status === "fail") return "Fail";
  if (status === "running") return "Running";
  return "No report";
}

export function clampPct(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Math.max(0, Math.min(100, Number(value)));
}

export function passRate(report) {
  const total = Number(report.total || 0);
  if (!total) return null;
  return (Number(report.passed || 0) / total) * 100;
}

export function ringTone(status) {
  if (status === "pass") return "pass";
  if (status === "fail") return "fail";
  if (status === "running") return "run";
  return "idle";
}

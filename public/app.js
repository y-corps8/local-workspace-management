/**
 * Overview dashboard UI.
 *
 * Loads GET /api/status, then stays current via EventSource /api/events
 * (status, job, log, health). Buttons POST only a command id to /api/run or /api/stop,
 * or { id, action } to /api/interact for live Expo keys. Prompt replies use
 * POST /api/stdin { id, text } from the log overlay — there is no typed stdin line.
 */
const SUGGESTED_GROUPS = ["run", "database", "seed", "test", "tools"];
const GROUP_LABELS = {
  run: "Run",
  database: "Database",
  seed: "Seed",
  test: "Tests",
  tools: "Tools",
  tooling: "Tools",
};

function groupLabel(group) {
  const id = String(group || "tools");
  if (GROUP_LABELS[id]) return GROUP_LABELS[id];
  return id.replace(/[-_]+/g, " ").replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

function normalizeGroup(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "tooling") return "tools";
  if (/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(text)) return text;
  const slug = slugifyId(text);
  if (slug === "tooling") return "tools";
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(slug) ? slug : "tools";
}

function lowercaseCommandLabel(value) {
  return String(value ?? "").trim().toLowerCase();
}

function unavailableHint(reason, command) {
  if (reason === "missing_folder") return "Folder not found.";
  if (reason === "missing_package_json") return "No package.json — npm script unavailable.";
  if (reason === "missing_script") return `“${command?.script || "script"}” is not in package.json.`;
  return "Unavailable.";
}

function cardAvailabilityWarning(repo, repoCommands) {
  if (repo.exists === false) return "Folder not found — edit the path in Settings.";
  const reasons = repoCommands.map((command) => command.unavailableReason).filter(Boolean);
  if (reasons.includes("missing_folder")) return "Folder not found — edit the path in Settings.";
  if (reasons.includes("missing_package_json")) return "package.json not found — npm buttons disabled.";
  const missing = reasons.filter((reason) => reason === "missing_script").length;
  if (missing === 1) return "1 command is not in package.json.";
  if (missing > 1) return `${missing} commands are not in package.json.`;
  return "";
}

function orderGroups(commands) {
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

let statusData = null;
let selectedJobId = null;
/** Tabs the user closed; a new run of the same id shows the tab again. */
const dismissedJobIds = new Set();
let confirmAction = null;
/** Follow new log lines unless the user scrolled up in the output panel. */
let stickToBottom = true;
/** Skip full redraw while a drag is in progress (including persist). */
let isDragging = false;
let persistDrag = false;
const CONSOLE_HEIGHT_KEY = "overview.consoleHeight";
const CONSOLE_COLLAPSED_KEY = "overview.consoleCollapsed";
const THEME_KEY = "overview.theme";
const THEME_COLORS = { dark: "#0c0c0a", light: "#f6f3eb" };
const CONSOLE_MIN_PX = 160;

function readStoredConsoleHeight() {
  try {
    const value = Number(localStorage.getItem(CONSOLE_HEIGHT_KEY));
    if (Number.isFinite(value) && value > 0) return value;
  } catch {
    // private mode / blocked storage
  }
  return null;
}

function readStoredCollapsed() {
  try {
    const raw = localStorage.getItem(CONSOLE_COLLAPSED_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    // private mode / blocked storage
  }
  return null;
}

function persistConsoleHeight(px) {
  try {
    localStorage.setItem(CONSOLE_HEIGHT_KEY, String(px));
  } catch {
    // private mode / blocked storage
  }
}

function persistConsoleCollapsed(collapsed) {
  try {
    localStorage.setItem(CONSOLE_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // private mode / blocked storage
  }
}

function readStoredTheme() {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === "light" || raw === "dark") return raw;
  } catch {
    // private mode / blocked storage
  }
  return "dark";
}

function persistTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // private mode / blocked storage
  }
}

function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function syncThemeButtons() {
  const theme = currentTheme();
  if (setupThemeLight) setupThemeLight.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
  if (setupThemeDark) setupThemeDark.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
}

function applyTheme(theme, persist = false) {
  const next = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLORS[next];
  syncThemeButtons();
  if (persist) persistTheme(next);
}

function consoleMaxPx() {
  return Math.max(CONSOLE_MIN_PX, Math.round(window.innerHeight * 0.7));
}

function applyConsoleHeight(px, persist = false) {
  const clamped = Math.max(CONSOLE_MIN_PX, Math.min(consoleMaxPx(), Math.round(px)));
  layoutEl?.style.setProperty("--console-height", `${clamped}px`);
  if (persist) persistConsoleHeight(clamped);
  return clamped;
}

const storedCollapsedPref = readStoredCollapsed();
/** Hide the Output terminal only; jobs keep running and logging. */
let outputCollapsed = storedCollapsedPref ?? true;
let consoleDefaultApplied = storedCollapsedPref !== null;

function dashboardRepos(repos = statusData?.repos) {
  return (repos ?? []).filter((repo) => !repo.hidden);
}

function moveItem(list, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return list;
  const next = list.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function weaveVisibleIds(allRepos, visibleIds) {
  const queue = visibleIds.slice();
  return allRepos.map((repo) => (repo.hidden ? repo.id : queue.shift()));
}

function clearDragStyles(root) {
  root?.querySelectorAll(".is-dragging, .is-drag-over").forEach((el) => {
    el.classList.remove("is-dragging", "is-drag-over");
  });
}

const layoutEl = document.querySelector(".layout");
const healthEl = document.getElementById("health-strip");
const healthCheckedEl = document.getElementById("health-checked");
const healthRefresh = document.getElementById("health-refresh");
const healthRefreshWrap = document.getElementById("health-refresh-wrap");
const logResize = document.getElementById("log-resize");
const testOverviewEl = document.getElementById("test-overview");
const testEl = document.getElementById("test-grid");
const projectEl = document.getElementById("project-grid");
const projectsEmptyEl = document.getElementById("projects-empty");
const projectsEmptyTitle = document.getElementById("projects-empty-title");
const projectsEmptyCopy = document.getElementById("projects-empty-copy");
const addProjectBtn = document.getElementById("add-project");
const addProjectEmptyBtn = document.getElementById("add-project-empty");
const jobTabsEl = document.getElementById("job-tabs");
const logSection = document.querySelector(".log-section");
const logOutput = document.getElementById("log-output");
const logPanel = document.getElementById("log-panel");
const logPromptOverlay = document.getElementById("log-prompt-overlay");
const logPromptQuestion = document.getElementById("log-prompt-question");
const logPromptActions = document.getElementById("log-prompt-actions");
const logStop = document.getElementById("log-stop");
const logStopAll = document.getElementById("log-stop-all");
const logRestart = document.getElementById("log-restart");
const logCollapse = document.getElementById("log-collapse");
const logClear = document.getElementById("log-clear");
const logToolbar = document.getElementById("log-toolbar");
const logInteractions = document.getElementById("log-interactions");
const logFilter = document.getElementById("log-filter");
const confirmModal = document.getElementById("confirm-modal");
const confirmTitle = document.getElementById("confirm-title");
const confirmMessage = document.getElementById("confirm-message");
const confirmOk = document.getElementById("confirm-ok");
const confirmCancel = document.getElementById("confirm-cancel");
const editSetupBtn = document.getElementById("edit-setup");
const setupPanel = document.getElementById("setup-panel");
const setupClose = document.getElementById("setup-close");
const setupError = document.getElementById("setup-error");
const setupTitle = document.getElementById("setup-title");
const setupLead = document.getElementById("setup-lead");
const setupStepProjects = document.getElementById("setup-step-projects");
const setupStepRoot = document.getElementById("setup-step-root");
const setupAppearanceRow = document.getElementById("setup-appearance-row");
const setupThemeLight = document.getElementById("setup-theme-light");
const setupThemeDark = document.getElementById("setup-theme-dark");
const setupTestOverviewRow = document.getElementById("setup-test-overview-row");
const setupShowTestOverview = document.getElementById("setup-show-test-overview");
const setupProjectList = document.getElementById("setup-project-list");
const setupProjectsRest = document.getElementById("setup-projects-rest");
const setupAddProject = document.getElementById("setup-add-project");
const setupProjectForm = document.getElementById("setup-project-form");
const setupFormTitle = document.getElementById("setup-form-title");
const setupPath = document.getElementById("setup-path");
const setupBrowsePath = document.getElementById("setup-browse-path");
const setupProbe = document.getElementById("setup-probe");
const setupPathStatus = document.getElementById("setup-path-status");
const setupId = document.getElementById("setup-id");
const setupName = document.getElementById("setup-name");
const setupDescription = document.getElementById("setup-description");
const setupHealthPort = document.getElementById("setup-health-port");
const setupTestKindField = document.getElementById("setup-test-kind-field");
const setupTestKind = document.getElementById("setup-test-kind");
const setupScripts = document.getElementById("setup-scripts");
const setupNoPkg = document.getElementById("setup-no-pkg");
const setupAddCustomWrap = document.getElementById("setup-add-custom-wrap");
const setupAddCustom = document.getElementById("setup-add-custom");
const setupCancelForm = document.getElementById("setup-cancel-form");
const setupCommitProject = document.getElementById("setup-commit-project");

applyTheme(readStoredTheme());

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${(seconds / 60).toFixed(1)} min`;
}

function commandById(id) {
  return statusData?.commands?.find((command) => command.id === id) ?? null;
}

function jobById(id) {
  return statusData?.jobs?.find((job) => job.id === id) ?? null;
}

function syncRepoRunningFromJobs() {
  const repos = statusData?.repos ?? [];
  const jobs = statusData?.jobs ?? [];
  for (const repo of repos) {
    repo.running = jobs.filter((job) => job.repo === repo.id && job.status === "running");
  }
}

function chipClass(status) {
  if (status === "pass") return "chip chip-pass";
  if (status === "fail") return "chip chip-fail";
  if (status === "running") return "chip chip-run";
  return "chip chip-idle";
}

function chipLabel(status) {
  if (status === "pass") return "Pass";
  if (status === "fail") return "Fail";
  if (status === "running") return "Running";
  return "No report";
}

function clampPct(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Math.max(0, Math.min(100, Number(value)));
}

function passRate(report) {
  const total = Number(report.total || 0);
  if (!total) return null;
  return (Number(report.passed || 0) / total) * 100;
}

function ringTone(status) {
  if (status === "pass") return "pass";
  if (status === "fail") return "fail";
  if (status === "running") return "run";
  return "idle";
}

function renderProgressRing({ passPct, coveragePct, status, passed, total }) {
  const running = status === "running";
  const empty = status === "no_report" || passPct == null;
  const tone = running ? "run" : empty ? "idle" : ringTone(status);
  const pct = running || empty ? 0 : clampPct(passPct) ?? 0;
  const center = running ? "…" : empty ? "—" : `${Math.round(passPct)}%`;
  const passText =
    status === "no_report" || passPct == null
      ? "No test run yet."
      : `${Math.round(passPct)}% — ${passed ?? 0} of ${total ?? 0} tests passed.`;
  const coverText =
    coveragePct == null
      ? "Line coverage is not in this report."
      : `${coveragePct.toFixed(1)}% of source lines covered.`;
  return `
    <div class="ring-wrap ring-${tone} ${status === "running" ? "is-running" : ""}" style="--pct: ${pct}">
      <div class="ring-donut" aria-hidden="true"></div>
      <div class="ring-center">
        <span class="ring-pct">${center}</span>
        <span class="ring-caption">pass</span>
      </div>
      <div class="hover-tip" role="tooltip">
        <p><strong>Pass rate</strong> (this ring) — ${escapeHtml(passText)}</p>
        <p><strong>Coverage</strong> (bar below) — ${escapeHtml(coverText)}</p>
      </div>
    </div>`;
}

function renderCoverageBar(coveragePct) {
  if (coveragePct == null) {
    return `<div class="coverage-row"><span>Coverage</span><span class="coverage-none">—</span></div>`;
  }
  return `
    <div class="coverage-row">
      <span>Coverage</span>
      <div class="coverage-track" aria-hidden="true">
        <div class="coverage-fill" style="width: ${coveragePct}%"></div>
      </div>
      <span class="coverage-pct">${coveragePct.toFixed(1)}%</span>
    </div>`;
}

// ── Render ─────────────────────────────────────────────────────────────────

function renderHealth() {
  const hidden = new Set((statusData.repos ?? []).filter((repo) => repo.hidden).map((repo) => repo.id));
  const items = (statusData.health ?? []).filter((item) => !hidden.has(item.repo || item.id));
  if (!items.length) {
    healthEl.innerHTML = "";
    return;
  }
  healthEl.innerHTML = items
    .map((item) => {
      const name = item.label || item.stack || item.repo || item.id;
      const up = Boolean(item.up);
      const detail = up
        ? "Up — a long-running command from this dashboard is running, or the port was open on the last check."
        : "Down — no long-running command from this dashboard, and the port was closed on the last check. Refresh, save setup, or reload for a new TCP check.";
      return `
      <article class="health-pill">
        <span class="dot ${up ? "up" : "down"}" aria-hidden="true"></span>
        <span class="label">${escapeHtml(name)}</span>
        <div class="hover-tip" role="tooltip">
          ${escapeHtml(item.stack || name)} · :${item.port} · ${up ? "Up" : "Down"} · ${escapeHtml(detail)}
        </div>
      </article>`;
    })
    .join("");
}

function formatCheckedAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 15) return "Checked just now";
  if (seconds < 60) return `Checked ${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Checked ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `Checked ${hours}h ago`;
}

function renderHealthChecked() {
  if (!healthCheckedEl) return;
  const hasProjects = (statusData?.repos ?? []).length > 0;
  const label = formatCheckedAgo(statusData?.generatedAt);
  healthCheckedEl.hidden = !hasProjects || !label;
  healthCheckedEl.textContent = hasProjects ? label : "";
}

let healthRefreshBusy = false;
healthRefresh?.addEventListener("click", async () => {
  if (healthRefreshBusy || !statusData) return;
  healthRefreshBusy = true;
  healthRefresh.classList.add("is-busy");
  try {
    await fetchStatus();
  } catch {
    // fetchStatus already throws on a failed GET /api/status
  } finally {
    healthRefreshBusy = false;
    healthRefresh.classList.remove("is-busy");
  }
});

function renderTests() {
  const repos = dashboardRepos();
  if (!repos.length) {
    testEl.innerHTML = `<p class="test-empty">${
      (statusData.repos ?? []).length
        ? "Unhide a project in Settings to see last test runs."
        : "Add a project to get started"
    }</p>`;
    return;
  }
  testEl.innerHTML = repos
    .map((repo) => {
      const runningTest = (repo.running ?? []).some((job) => commandById(job.id)?.group === "test");
      const report = repo.lastTest ?? {};
      const status = runningTest ? "running" : report.status || "no_report";
      const coveragePct = clampPct(report.coveragePct);
      const ring = renderProgressRing({
        passPct: passRate(report),
        coveragePct,
        status,
        passed: report.passed,
        total: report.total,
      });
      if (status === "no_report") {
        return `
          <article class="test-card">
            ${ring}
            <div class="test-card-copy">
              <div class="test-card-head">
                <h3>${escapeHtml(repo.name)}</h3>
                <span class="${chipClass(status)}">${chipLabel(status)}</span>
              </div>
              <p class="test-empty">No report yet — run Test from this dashboard.</p>
              ${renderCoverageBar(null)}
            </div>
          </article>`;
      }
      const failed = (report.failedNames ?? [])
        .slice(0, 8)
        .map((name) => `<li>${escapeHtml(name)}</li>`)
        .join("");
      return `
        <article class="test-card">
          ${ring}
          <div class="test-card-copy">
            <div class="test-card-head">
              <h3>${escapeHtml(repo.name)}</h3>
              <span class="${chipClass(status)}">${chipLabel(status)}</span>
            </div>
            <div class="test-counts">
              ${report.passed ?? 0} passed · ${report.failed ?? 0} failed · ${report.skipped ?? 0} skipped
            </div>
            ${renderCoverageBar(coveragePct)}
            <div class="test-meta">
              ${escapeHtml(report.commandLabel || report.commandId || "last run")}
              · ${formatDuration(report.durationMs)}
              · ${formatTime(report.finishedAt)}
            </div>
            ${
              failed
                ? `<details class="failed-details"><summary>Failed tests</summary><ul class="failed-list">${failed}</ul></details>`
                : ""
            }
          </div>
        </article>`;
    })
    .join("");
}

function renderProjects() {
  const commands = statusData.commands ?? [];
  const allRepos = statusData.repos ?? [];
  const repos = dashboardRepos(allRepos);
  const noneConfigured = !allRepos.length;
  const noneVisible = !repos.length;
  projectEl.hidden = noneVisible;
  projectsEmptyEl.hidden = !noneVisible;
  addProjectBtn.hidden = noneConfigured;
  addProjectEmptyBtn.hidden = !noneConfigured;
  if (noneVisible) {
    projectEl.innerHTML = "";
    if (noneConfigured) {
      projectsEmptyTitle.textContent = "No projects yet";
      projectsEmptyCopy.textContent = "Add a repo to run allowlisted commands from this dashboard.";
    } else {
      projectsEmptyTitle.textContent = "No projects on the dashboard";
      projectsEmptyCopy.textContent = "Unhide a project in Settings to show it here.";
    }
    return;
  }
  projectEl.innerHTML = repos
    .map((repo) => {
      const repoCommands = commands.filter((command) => command.repo === repo.id);
      const groups = orderGroups(repoCommands)
        .map((group) => ({
          group,
          label: groupLabel(group),
          items: repoCommands.filter((command) => command.group === group),
        }))
        .filter((entry) => entry.items.length);
      const runningIds = new Set((repo.running ?? []).map((job) => job.id));
      const groupHtml = groups
        .map((entry) => {
          const buttons = entry.items
            .map((command) => {
              const running = runningIds.has(command.id);
              const blocked = !running && command.available === false;
              const cls = [
                "btn",
                "cmd-btn",
                entry.group === "run" && !command.destructive && !running && !blocked ? "btn-primary" : "",
                command.destructive ? "btn-danger" : "",
                running ? "btn-running" : "",
              ]
                .filter(Boolean)
                .join(" ");
              const action = running ? "select" : "run";
              const aria = blocked
                ? ` aria-label="${escapeHtml(`${command.label}. ${unavailableHint(command.unavailableReason, command)}`)}"`
                : "";
              return `<button type="button" class="${cls}" data-action="${action}" data-id="${escapeHtml(command.id)}" ${blocked ? "disabled" : ""}${aria}>${escapeHtml(command.label)}</button>`;
            })
            .join("");
          return `
            <div class="cmd-group">
              <div class="cmd-group-label">${escapeHtml(entry.label)}</div>
              <div class="cmd-row">${buttons}</div>
            </div>`;
        })
        .join("");
      const busy = (repo.running ?? []).length > 0;
      const missingPath = repo.exists === false;
      const warning = cardAvailabilityWarning(repo, repoCommands);
      const description = String(repo.description || "").trim();

      return `
        <article class="project-card${missingPath ? " is-missing-path" : ""}${busy ? " is-running" : ""}" data-repo="${escapeHtml(repo.id)}">
          <div class="project-head">
            <div class="project-head-title">
              <span class="drag-handle" data-card-drag="${escapeHtml(repo.id)}" draggable="true" role="button" tabindex="0" aria-label="Reorder ${escapeHtml(repo.name)}"></span>
              <h3>${escapeHtml(repo.name)}</h3>
            </div>
            <div class="project-head-end">
              <span class="${busy ? "chip chip-run" : "chip chip-idle"}">${busy ? `${repo.running.length} running` : "idle"}</span>
              <div class="card-menu">
                <button type="button" class="card-menu-btn" data-card-menu="${escapeHtml(repo.id)}" aria-label="Project actions for ${escapeHtml(repo.name)}" aria-expanded="false" aria-haspopup="true">⋯</button>
                <div class="card-menu-pop" hidden>
                  <button type="button" data-card-edit="${escapeHtml(repo.id)}">Edit</button>
                  <button type="button" class="is-danger" data-card-delete="${escapeHtml(repo.id)}">Delete</button>
                </div>
              </div>
            </div>
          </div>
          ${description ? `<p class="description">${escapeHtml(description)}</p>` : ""}
          ${warning ? `<p class="project-warn">${escapeHtml(warning)}</p>` : ""}
          ${groupHtml}
        </article>`;
    })
    .join("");
}

function jobTabLabel(job) {
  if (job.status === "running") return "running";
  if (job.status === "stopped") return "stopped";
  if (job.exitCode != null) return `exit ${job.exitCode}`;
  return job.status;
}

function jobTabName(job) {
  const repo = (statusData?.repos ?? []).find((item) => item.id === job.repo);
  return `${repo?.name || job.repo} · ${job.label}`;
}

function runningJobs() {
  return [...(statusData?.jobs ?? [])]
    .filter((job) => job.status === "running")
    .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
}

function visibleJobs() {
  return [...(statusData?.jobs ?? [])]
    .filter((job) => !dismissedJobIds.has(job.id))
    .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
}

function renderJobTabs() {
  const jobs = visibleJobs();
  if (!jobs.length) {
    jobTabsEl.innerHTML = `<p class="job-tabs-empty">No command yet</p>`;
    return;
  }
  jobTabsEl.innerHTML = jobs
    .map((job) => {
      const active = job.id === selectedJobId ? " is-active" : "";
      const done = job.status !== "running" ? " is-done" : "";
      const waiting = job.status === "running" && job.prompt ? " is-waiting" : "";
      const name = jobTabName(job);
      const waitLabel = waiting ? " (waiting for input)" : "";
      return `<div class="job-tab${active}${done}${waiting}" role="tab" aria-selected="${
        job.id === selectedJobId
      }">
        <button type="button" class="job-tab-label" data-job-id="${escapeHtml(job.id)}" aria-label="${escapeHtml(name + waitLabel)}">${escapeHtml(name)}</button>
        <button type="button" class="job-tab-close" data-job-close="${escapeHtml(job.id)}" aria-label="Close ${escapeHtml(name)}">×</button>
      </div>`;
    })
    .join("");
}

function dismissJobTab(id) {
  dismissedJobIds.add(id);
  if (selectedJobId !== id) {
    renderJobTabs();
    return;
  }
  const next = visibleJobs()[0];
  if (next) {
    selectJob(next.id);
    return;
  }
  selectedJobId = null;
  logPanel.replaceChildren();
  lastInteractionKey = "";
  lastPromptKey = "";
  updateLogChrome();
}

let lastInteractionKey = "";
let lastPromptKey = "";

function selectedJobPrompt() {
  const job = selectedJobId ? jobById(selectedJobId) : null;
  if (!job || job.status !== "running") return null;
  return job.prompt ?? null;
}

function renderLogPrompt() {
  const prompt = selectedJobPrompt();
  const key = prompt
    ? `${selectedJobId}:${prompt.kind}:${prompt.question}:${(prompt.options || []).map((item) => item.id).join(",")}`
    : "";
  if (key === lastPromptKey) return;
  lastPromptKey = key;
  if (!logPromptOverlay) return;
  if (!prompt) {
    logPromptOverlay.hidden = true;
    logOutput?.classList.remove("has-prompt");
    if (logPromptQuestion) logPromptQuestion.textContent = "";
    logPromptActions?.replaceChildren();
    return;
  }
  logOutput?.classList.add("has-prompt");
  logPromptOverlay.hidden = false;
  if (logPromptQuestion) logPromptQuestion.textContent = prompt.question || "Waiting for a choice";
  if (logPromptActions) {
    logPromptActions.innerHTML = (prompt.options || [])
      .map(
        (item) =>
          `<button type="button" class="btn btn-compact" data-stdin="${escapeHtml(item.value)}">${escapeHtml(item.label)}</button>`
      )
      .join("");
  }
}

function renderLogInteractions() {
  const job = selectedJobId ? jobById(selectedJobId) : null;
  const command = job && job.status === "running" ? commandById(job.id) : null;
  const items = command?.interactions ?? [];
  const key = items.length ? `${command.id}:${items.map((item) => item.id).join(",")}` : "";
  if (key === lastInteractionKey) return;
  lastInteractionKey = key;
  if (!items.length) {
    logInteractions.hidden = true;
    logInteractions.replaceChildren();
    return;
  }
  logInteractions.hidden = false;
  logInteractions.innerHTML = items
    .map(
      (item) => `<span class="cmd-wrap">
        <button type="button" class="btn btn-compact btn-action" data-action="interact" data-id="${escapeHtml(command.id)}" data-interact="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>
        <div class="hover-tip" role="tooltip">${escapeHtml(item.hint || item.label)}</div>
      </span>`
    )
    .join("");
}

function updateLogChrome() {
  const running = runningJobs();
  if (selectedJobId && (dismissedJobIds.has(selectedJobId) || !jobById(selectedJobId))) {
    const next = visibleJobs()[0];
    if (next) {
      selectedJobId = next.id;
      stickToBottom = true;
      loadLogs(next.id);
    } else {
      selectedJobId = null;
      logPanel.replaceChildren();
      lastInteractionKey = "";
      lastPromptKey = "";
    }
  }
  const job = selectedJobId ? jobById(selectedJobId) : null;
  logToolbar.hidden = !job;
  logStop.hidden = !(job && job.status === "running");
  if (logRestart) logRestart.hidden = !(job && job.status === "running");
  logStopAll.hidden = running.length < 2;
  logSection?.classList.toggle("has-running", running.length > 0);
  applyOutputCollapsed();
  renderJobTabs();
  renderLogInteractions();
  renderLogPrompt();
}

function applyOutputCollapsed() {
  logSection?.classList.toggle("is-collapsed", outputCollapsed);
  if (!logCollapse) return;
  logCollapse.setAttribute("aria-expanded", outputCollapsed ? "false" : "true");
  logCollapse.setAttribute("aria-label", outputCollapsed ? "Show console" : "Minimize console");
}

function toggleOutputCollapsed() {
  outputCollapsed = !outputCollapsed;
  persistConsoleCollapsed(outputCollapsed);
  consoleDefaultApplied = true;
  applyOutputCollapsed();
}

function syncConsoleCollapsedDefault() {
  if (consoleDefaultApplied) return;
  consoleDefaultApplied = true;
  const hasJobs = visibleJobs().length > 0;
  outputCollapsed = !hasJobs;
  applyOutputCollapsed();
}

function expandOutput() {
  if (!outputCollapsed) return;
  outputCollapsed = false;
  applyOutputCollapsed();
}

async function stopAllCommands() {
  await Promise.all(runningJobs().map((job) => stopCommand(job.id)));
}

async function selectJob(id) {
  dismissedJobIds.delete(id);
  selectedJobId = id;
  stickToBottom = true;
  expandOutput();
  updateLogChrome();
  await loadLogs(id);
}

function formatLogTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString();
}

function logLineMatchesFilter(text) {
  const query = String(logFilter?.value || "").trim().toLowerCase();
  if (!query) return true;
  return String(text).toLowerCase().includes(query);
}

function applyLogFilter() {
  const query = String(logFilter?.value || "").trim().toLowerCase();
  logPanel.querySelectorAll("[data-log-text]").forEach((line) => {
    const text = line.getAttribute("data-log-text") || "";
    line.hidden = Boolean(query) && !text.toLowerCase().includes(query);
  });
}

function logLineClass(stream, text) {
  if (stream === "stderr") return "log-line-error";
  const line = String(text);
  if (/\b(error|exception|failed|failure|fatal)\b/i.test(line) || /\bFAIL\b/.test(line)) {
    return "log-line-error";
  }
  if (/\b(warn|warning)\b/i.test(line) || /\bWARN\b/.test(line)) {
    return "log-line-warn";
  }
  if (
    /\b(passed|success|successful)\b/i.test(line) ||
    /\bPASS\b/.test(line) ||
    /BUILD SUCCESS/.test(line)
  ) {
    return "log-line-ok";
  }
  return "log-line";
}

function appendLogLine(stream, text, { at, replace, live } = {}) {
  const last = logPanel.lastElementChild;
  if (last?.dataset.live === "1") {
    last.remove();
  }
  if (replace && !live && logPanel.lastElementChild) {
    logPanel.lastElementChild.remove();
  }
  const line = document.createElement("div");
  line.className = logLineClass(stream, text);
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  line.dataset.logText = body;
  line.hidden = !logLineMatchesFilter(body);
  const time = formatLogTime(at);
  if (time) {
    const stamp = document.createElement("span");
    stamp.className = "log-time";
    stamp.textContent = time;
    line.append(stamp, document.createTextNode(` ${body}\n`));
  } else {
    line.textContent = `${body}\n`;
  }
  if (live) line.dataset.live = "1";
  logPanel.appendChild(line);
  if (stickToBottom) {
    logPanel.scrollTop = logPanel.scrollHeight;
  }
}

function render() {
  if (!statusData) return;
  renderHealth();
  renderHealthChecked();
  const showTests = Boolean(statusData.showTestOverview);
  testOverviewEl.hidden = !showTests;
  if (showTests) renderTests();
  else testEl.replaceChildren();
  renderProjects();
  const hasProjects = (statusData.repos ?? []).length > 0;
  if (healthRefreshWrap) healthRefreshWrap.hidden = !hasProjects;
  updateLogChrome();
}

// ── API ────────────────────────────────────────────────────────────────────

async function fetchStatus() {
  const res = await fetch("/api/status");
  if (!res.ok) throw new Error(`status ${res.status}`);
  statusData = await res.json();
  render();
}

async function loadLogs(id) {
  const res = await fetch(`/api/logs/${encodeURIComponent(id)}`);
  if (!res.ok) return;
  const data = await res.json();
  logPanel.replaceChildren();
  for (const entry of data.logs ?? []) {
    appendLogLine(entry.stream, entry.text, { at: entry.at, replace: entry.replace });
  }
  if (data.partial) {
    appendLogLine("stdout", data.partial, { live: true });
  }
  if (data.prompt && selectedJobId) {
    const job = jobById(selectedJobId);
    if (job) job.prompt = data.prompt;
  }
  lastPromptKey = "";
  renderLogPrompt();
  stickToBottom = true;
  logPanel.scrollTop = logPanel.scrollHeight;
}

async function postJson(url, body, options = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (!options.quiet) {
      appendLogLine("stderr", data.message || data.error || `Request failed (${res.status})`);
    }
    return null;
  }
  return data;
}

async function requestJson(url, { method = "GET", body, quiet } = {}) {
  const res = await fetch(url, {
    method,
    headers: body != null ? { "Content-Type": "application/json" } : undefined,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.message || data.error || `Request failed (${res.status})`;
    if (!quiet) appendLogLine("stderr", message);
    return { ok: false, status: res.status, data, message };
  }
  return { ok: true, data };
}

async function browseFolder() {
  const result = await requestJson("/api/workspace/browse", { method: "POST", quiet: true, body: {} });
  if (!result.ok) {
    if (result.data?.error === "cancelled") return null;
    if (result.status === 404 || result.data?.error === "not_found") {
      return { error: "Restart the dashboard (npm start) so Browse can open the folder picker." };
    }
    return { error: result.message || "Could not open folder picker" };
  }
  return { path: String(result.data.path || "").trim() };
}

async function browseIntoInput(input, { after } = {}) {
  const picked = await browseFolder();
  if (!picked) return;
  if (picked.error) {
    if (typeof after === "function") after({ error: picked.error });
    else appendLogLine("stderr", picked.error);
    return;
  }
  if (!picked.path) return;
  input.value = picked.path;
  if (typeof after === "function") after({ path: picked.path });
}

async function runCommand(id) {
  const command = commandById(id);
  if (command?.available === false) return;
  dismissedJobIds.delete(id);
  const existing = jobById(id);
  if (existing?.status === "running") {
    await selectJob(id);
    return;
  }
  selectedJobId = id;
  logPanel.replaceChildren();
  stickToBottom = true;
  expandOutput();
  updateLogChrome();
  const result = await postJson("/api/run", { id });
  if (result?.job) {
    selectedJobId = result.job.id;
    updateLogChrome();
  }
}

async function stopCommand(id) {
  await postJson("/api/stop", { id });
}

async function interactCommand(id, action) {
  if (id !== selectedJobId) {
    await selectJob(id);
  }
  await postJson("/api/interact", { id, action }, { quiet: true });
}

async function sendJobStdin(id, text) {
  await postJson("/api/stdin", { id, text });
}

// ── Actions (in-page confirm — no window.confirm) ──────────────────────────

function openConfirm({ title, message, okLabel = "Run", onConfirm }) {
  confirmAction = onConfirm;
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmOk.textContent = okLabel;
  confirmModal.hidden = false;
  confirmOk.focus();
}

function closeConfirm() {
  confirmAction = null;
  confirmModal.hidden = true;
  confirmOk.textContent = "Run";
}

function closeCardMenu() {
  projectEl.querySelectorAll(".card-menu-pop").forEach((pop) => {
    pop.hidden = true;
  });
  projectEl.querySelectorAll("[data-card-menu]").forEach((btn) => {
    btn.setAttribute("aria-expanded", "false");
  });
}

function toggleCardMenu(button) {
  const wrap = button.closest(".card-menu");
  const pop = wrap?.querySelector(".card-menu-pop");
  if (!pop) return;
  const open = pop.hidden;
  closeCardMenu();
  if (open) {
    pop.hidden = false;
    button.setAttribute("aria-expanded", "true");
  }
}

async function editProjectFromCard(repoId) {
  closeCardMenu();
  await openSetup();
  const index = (setupDraft?.projects ?? []).findIndex((project) => project.id === repoId);
  if (index >= 0) openProjectForm(index);
}

async function deleteProjectFromCard(repoId) {
  closeCardMenu();
  const repo = (statusData?.repos ?? []).find((item) => item.id === repoId);
  const name = repo?.name || repoId;
  openConfirm({
    title: "Remove project?",
    message: `Remove ${name} from overview? This does not delete the folder.`,
    okLabel: "Remove",
    onConfirm: async () => {
      if (!setupDraft) {
        const result = await requestJson("/api/workspace", { quiet: true });
        if (!result.ok) {
          appendLogLine("stderr", result.message || "Could not load workspace");
          return;
        }
        setupDraft = cloneWorkspace(result.data);
        setupIsFirstRun = false;
        setupAddMode = false;
        setupShowTestOverview.checked = Boolean(setupDraft.showTestOverview);
      }
      const index = setupDraft.projects.findIndex((project) => project.id === repoId);
      if (index < 0) return;
      const [removed] = setupDraft.projects.splice(index, 1);
      const ok = await persistWorkspace({ close: true });
      if (!ok) {
        setupDraft.projects.splice(index, 0, removed);
        appendLogLine("stderr", setupError.textContent || "Could not remove project");
      }
    },
  });
}

projectEl.addEventListener("click", (event) => {
  const menuBtn = event.target.closest("[data-card-menu]");
  if (menuBtn) {
    event.stopPropagation();
    toggleCardMenu(menuBtn);
    return;
  }
  const edit = event.target.closest("[data-card-edit]");
  if (edit) {
    event.stopPropagation();
    editProjectFromCard(edit.dataset.cardEdit);
    return;
  }
  const remove = event.target.closest("[data-card-delete]");
  if (remove) {
    event.stopPropagation();
    deleteProjectFromCard(remove.dataset.cardDelete);
    return;
  }
  if (!event.target.closest(".card-menu")) closeCardMenu();
  const button = event.target.closest("button[data-id]");
  if (!button || button.disabled) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  const command = commandById(id);
  if (!command) return;
  if (action === "interact") {
    interactCommand(id, button.dataset.interact);
    return;
  }
  if (action === "select") {
    selectJob(id);
    return;
  }
  if (command.available === false) return;
  if (command.destructive) {
    openConfirm({
      title: command.confirmTitle || "Run this command?",
      message: command.confirmMessage || `Run ${command.label}?`,
      okLabel: "Run",
      onConfirm: () => runCommand(command.id),
    });
    return;
  }
  runCommand(id);
});

let cardDragId = null;

async function persistCardOrder(fromId, toId) {
  if (!fromId || fromId === toId) return;
  const all = statusData.repos ?? [];
  const visibleIds = dashboardRepos(all).map((repo) => repo.id);
  const nextVisible = moveItem(visibleIds, visibleIds.indexOf(fromId), visibleIds.indexOf(toId));
  const ids = weaveVisibleIds(all, nextVisible);
  const byId = new Map(all.map((repo) => [repo.id, repo]));
  const previous = all.slice();
  statusData.repos = ids.map((id) => byId.get(id)).filter(Boolean);
  renderProjects();
  persistDrag = true;
  const result = await requestJson("/api/workspace/order", {
    method: "PATCH",
    quiet: true,
    body: { ids },
  });
  persistDrag = false;
  isDragging = false;
  if (!result.ok) {
    statusData.repos = previous;
    renderProjects();
    appendLogLine("stderr", result.message || "Could not save order");
    return;
  }
  await fetchStatus();
}

projectEl.addEventListener("dragstart", (event) => {
  const handle = event.target.closest("[data-card-drag]");
  if (!handle) return;
  cardDragId = handle.dataset.cardDrag;
  isDragging = true;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", cardDragId);
  const card = handle.closest(".project-card");
  card?.classList.add("is-dragging");
  if (card) event.dataTransfer.setDragImage(card, 24, 24);
});

projectEl.addEventListener("dragover", (event) => {
  const card = event.target.closest(".project-card");
  if (!card || !cardDragId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  projectEl.querySelectorAll(".is-drag-over").forEach((el) => el.classList.remove("is-drag-over"));
  if (card.dataset.repo !== cardDragId) card.classList.add("is-drag-over");
});

projectEl.addEventListener("drop", async (event) => {
  const card = event.target.closest(".project-card");
  if (!card || !cardDragId) return;
  event.preventDefault();
  const fromId = cardDragId;
  const toId = card.dataset.repo;
  persistDrag = true;
  clearDragStyles(projectEl);
  cardDragId = null;
  if (fromId === toId) {
    persistDrag = false;
    isDragging = false;
    return;
  }
  await persistCardOrder(fromId, toId);
});

projectEl.addEventListener("dragend", () => {
  clearDragStyles(projectEl);
  cardDragId = null;
  if (!persistDrag) isDragging = false;
});

jobTabsEl.addEventListener("click", (event) => {
  const close = event.target.closest("[data-job-close]");
  if (close) {
    dismissJobTab(close.dataset.jobClose);
    return;
  }
  const tab = event.target.closest("[data-job-id]");
  if (!tab) return;
  selectJob(tab.dataset.jobId);
});

logStop.addEventListener("click", () => {
  if (selectedJobId) stopCommand(selectedJobId);
});

logRestart?.addEventListener("click", () => {
  if (selectedJobId) postJson("/api/restart", { id: selectedJobId });
});

logStopAll.addEventListener("click", () => {
  stopAllCommands();
});

logCollapse.addEventListener("click", () => {
  toggleOutputCollapsed();
});

function bindConsoleResize() {
  if (!logResize || !logSection || !layoutEl) return;
  const storedHeight = readStoredConsoleHeight();
  if (storedHeight) applyConsoleHeight(storedHeight);

  let dragging = false;

  const onMove = (event) => {
    if (!dragging) return;
    applyConsoleHeight(logSection.getBoundingClientRect().bottom - event.clientY);
  };

  const onUp = (event) => {
    if (!dragging) return;
    dragging = false;
    layoutEl.classList.remove("is-resizing-console");
    try {
      logResize.releasePointerCapture(event.pointerId);
    } catch {
      // capture already released
    }
    const height = Number.parseFloat(layoutEl.style.getPropertyValue("--console-height"));
    if (Number.isFinite(height)) persistConsoleHeight(height);
  };

  logResize.addEventListener("pointerdown", (event) => {
    if (outputCollapsed || event.button !== 0) return;
    dragging = true;
    layoutEl.classList.add("is-resizing-console");
    logResize.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  logResize.addEventListener("pointermove", onMove);
  logResize.addEventListener("pointerup", onUp);
  logResize.addEventListener("pointercancel", onUp);
  logResize.addEventListener("keydown", (event) => {
    if (outputCollapsed) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const current =
      Number.parseFloat(layoutEl.style.getPropertyValue("--console-height")) ||
      logSection.getBoundingClientRect().height;
    applyConsoleHeight(current + (event.key === "ArrowUp" ? 24 : -24), true);
  });

  window.addEventListener("resize", () => {
    if (outputCollapsed) return;
    const current = Number.parseFloat(layoutEl.style.getPropertyValue("--console-height"));
    if (Number.isFinite(current)) applyConsoleHeight(current);
  });
}

bindConsoleResize();
applyOutputCollapsed();

logInteractions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-interact]");
  if (!button) return;
  interactCommand(button.dataset.id, button.dataset.interact);
});

function handleStdinClick(event) {
  const button = event.target.closest("button[data-stdin]");
  if (!button || !selectedJobId) return;
  sendJobStdin(selectedJobId, button.dataset.stdin ?? "");
}

logPromptActions?.addEventListener("click", handleStdinClick);

logClear.addEventListener("click", async () => {
  logPanel.replaceChildren();
  if (selectedJobId) {
    await postJson("/api/logs/clear", { id: selectedJobId }, { quiet: true });
  }
});

logFilter?.addEventListener("input", () => {
  applyLogFilter();
});

logPanel.addEventListener("scroll", () => {
  const distance = logPanel.scrollHeight - logPanel.scrollTop - logPanel.clientHeight;
  stickToBottom = distance < 24;
});

confirmCancel.addEventListener("click", closeConfirm);
confirmModal.addEventListener("click", (event) => {
  if (event.target === confirmModal) closeConfirm();
});
confirmOk.addEventListener("click", () => {
  const action = confirmAction;
  closeConfirm();
  if (action) action();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".card-menu")) closeCardMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    const cardHandle = event.target.closest?.("[data-card-drag]");
    if (cardHandle && projectEl.contains(cardHandle)) {
      event.preventDefault();
      const visible = [...projectEl.querySelectorAll(".project-card")];
      const fromId = cardHandle.dataset.cardDrag;
      const index = visible.findIndex((card) => card.dataset.repo === fromId);
      const next = event.key === "ArrowUp" ? index - 1 : index + 1;
      if (index < 0 || next < 0 || next >= visible.length) return;
      persistCardOrder(fromId, visible[next].dataset.repo);
      return;
    }
    const setupHandle = event.target.closest?.("[data-setup-drag]");
    if (setupHandle && setupDraft) {
      event.preventDefault();
      const from = Number(setupHandle.dataset.setupDrag);
      const to = event.key === "ArrowUp" ? from - 1 : from + 1;
      if (from < 0 || to < 0 || to >= setupDraft.projects.length) return;
      persistSetupOrder(from, to);
      return;
    }
  }
  if (event.key !== "Escape") return;
  if (!confirmModal.hidden) {
    closeConfirm();
    return;
  }
  const openMenu = projectEl.querySelector(".card-menu-pop:not([hidden])");
  if (openMenu) {
    closeCardMenu();
    return;
  }
  if (!setupPanel.hidden) closeSetup();
});

// ── Setup wizard (first run + Settings) ─────────────────────────────────────

let setupDraft = null;
let setupEditingIndex = null;
let setupScriptRows = [];
/** Scheme from Probe (app.json); used when saving Expo projects. */
let setupProbedScheme = "";
/** Opened from dashboard Add project — save writes and returns to the cards. */
let setupAddMode = false;
/** First-run sheet: hide test overview opt-in even after projects are added to the draft. */
let setupIsFirstRun = false;
/** Last probe found the current path as a folder. */
let setupProbeOk = false;

function slugifyId(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "project";
}

function cloneWorkspace(raw) {
  const legacyScheme = String(raw.expoDevClientScheme || "app").trim() || "app";
  return {
    showTestOverview: Boolean(raw.showTestOverview),
    projects: (raw.projects || []).map((project) => {
      const next = {
        ...project,
        description: String(project.description || project.role || "")
          .trim()
          .slice(0, 50),
        commands: (project.commands || []).map((command) => ({ ...command })),
        ports: Array.isArray(project.ports) ? [...project.ports] : [],
        health: project.health ? { ...project.health } : undefined,
      };
      delete next.role;
      const hasExpo = (next.commands || []).some((command) => command.interactions === "expo");
      if (hasExpo || project.expoDevClientScheme) {
        next.expoDevClientScheme = String(project.expoDevClientScheme || legacyScheme).trim() || legacyScheme;
      }
      if (project.metroPort != null && Number(project.metroPort) > 0) {
        next.metroPort = Number(project.metroPort);
      }
      if (project.hidden) next.hidden = true;
      else delete next.hidden;
      return next;
    }),
  };
}

function setSetupError(message) {
  if (!message) {
    setupError.hidden = true;
    setupError.textContent = "";
    return;
  }
  setupError.hidden = false;
  setupError.textContent = message;
}

function setProbeStatus(el, ok, text) {
  el.hidden = !text;
  el.classList.toggle("is-error", !ok);
  el.textContent = text || "";
}

function closeSetup() {
  setupPanel.hidden = true;
  setupDraft = null;
  setupEditingIndex = null;
  setupScriptRows = [];
  setupProbedScheme = "";
  setupAddMode = false;
  setupIsFirstRun = false;
  setupProjectForm.hidden = true;
  setupStepProjects.classList.remove("is-form-open");
  if (setupStepRoot) setupStepRoot.hidden = false;
  setSetupError("");
}

function renderSetupList() {
  const projects = setupDraft?.projects ?? [];
  if (!projects.length) {
    setupProjectList.innerHTML = `<div class="setup-project-list-empty">
      <p class="setup-project-list-empty-title">No projects yet</p>
      <p class="setup-project-list-empty-copy">Repos you add will show here so you can hide, edit, or reorder them. Use <strong>Add a project</strong> below to browse a folder and pick commands.</p>
    </div>`;
    syncSetupAddButton();
    return;
  }
  setupProjectList.innerHTML = projects
    .map((project, index) => {
      const count = (project.commands || []).length;
      const hidden = Boolean(project.hidden);
      return `<article class="setup-project-row${hidden ? " is-hidden" : ""}" data-setup-index="${index}">
        <span class="drag-handle" data-setup-drag="${index}" draggable="true" role="button" tabindex="0" aria-label="Reorder ${escapeHtml(project.name || project.id)}"></span>
        <div class="setup-project-row-copy">
          <strong>${escapeHtml(project.name || project.id)}</strong>
          <span>${escapeHtml(project.path)} · ${count} command${count === 1 ? "" : "s"}</span>
        </div>
        <label class="setup-check setup-project-visible">
          <input type="checkbox" data-setup-visible="${index}" ${hidden ? "" : "checked"} />
          Show on dashboard
        </label>
        <div class="setup-project-row-actions">
          <button type="button" class="btn btn-compact" data-setup-edit="${index}">Edit</button>
          <button type="button" class="btn btn-compact btn-danger" data-setup-remove="${index}">Remove</button>
        </div>
      </article>`;
    })
    .join("");
  syncSetupAddButton();
}

function rowGroup(row) {
  return normalizeGroup(row.group);
}

function applyRowGroup(row, group) {
  const next = normalizeGroup(group);
  if (row.group === "test" && next !== "test") row.jestJson = false;
  row.group = next;
}

function isCustomRow(row) {
  return Boolean(row?.custom) || Array.isArray(row?.argv);
}

function uniqueScriptId(base, used) {
  let script = slugifyId(base);
  if (!used.has(script)) return script;
  let n = 2;
  while (used.has(`${script}-${n}`)) n += 1;
  return `${script}-${n}`;
}

function emptyCustomRow() {
  return {
    script: "",
    label: "",
    argv: [],
    argvLine: "",
    group: "tools",
    longRunning: false,
    destructive: false,
    selected: true,
    custom: true,
  };
}

function renderSetupScriptFlags(row, index) {
  return `<label class="setup-script-group-field">
            <span>Group</span>
            <input type="text" data-script-group="${index}" value="${escapeHtml(rowGroup(row))}" spellcheck="false" aria-label="Group for ${escapeHtml(row.label || row.script || "command")}" placeholder="run, lint, …" />
          </label>
          <label><input type="checkbox" data-script-long="${index}" ${row.longRunning ? "checked" : ""} /> Long-running</label>
          <label><input type="checkbox" data-script-destructive="${index}" ${row.destructive ? "checked" : ""} /> Destructive</label>`;
}

function renderSetupScriptRow(row, index) {
  if (isCustomRow(row)) {
    const name = row.label || "custom command";
    return `<div class="setup-script is-custom">
        <div class="setup-script-main">
          <input type="checkbox" data-script-check="${index}" ${row.selected ? "checked" : ""} aria-label="Show ${escapeHtml(name)}" />
          <div class="setup-script-custom-body">
            <div class="setup-script-custom-fields">
              <label class="setup-script-group-field">
                <span>Command name</span>
                <input type="text" data-script-label="${index}" value="${escapeHtml(row.label || "")}" placeholder="run" aria-label="Command name" />
              </label>
              <label class="setup-script-group-field">
                <span>Command</span>
                <input type="text" data-script-argv="${index}" value="${escapeHtml(row.argvLine || "")}" spellcheck="false" placeholder="echo hello" aria-label="Command" />
              </label>
            </div>
            <div class="setup-script-custom-meta">
              ${renderSetupScriptFlags(row, index)}
              <button type="button" class="btn btn-compact" data-script-remove="${index}">Remove</button>
            </div>
          </div>
        </div>
      </div>`;
  }
  return `<div class="setup-script">
        <div class="setup-script-main">
          <input type="checkbox" data-script-check="${index}" ${row.selected ? "checked" : ""} aria-label="Show ${escapeHtml(row.script)}" />
          <code title="${escapeHtml(row.script)}">${escapeHtml(row.script)}</code>
          ${renderSetupScriptFlags(row, index)}
        </div>
      </div>`;
}

function renderSetupScripts() {
  if (!setupScriptRows.length) {
    setupScripts.innerHTML = "";
    return;
  }
  setupScripts.innerHTML = orderGroups(setupScriptRows)
    .map((group) => {
      const items = setupScriptRows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => rowGroup(row) === group);
      if (!items.length) return "";
      const body = items.map(({ row, index }) => renderSetupScriptRow(row, index)).join("");
      return `<div class="setup-script-group">
        <div class="setup-script-group-label">${escapeHtml(groupLabel(group))}</div>
        ${body}
      </div>`;
    })
    .join("");
}

function commandToRow(command, selected) {
  const argv = Array.isArray(command.argv) ? command.argv : undefined;
  const custom = Boolean(command.custom) || Array.isArray(argv);
  return {
    script: command.script || "",
    group: normalizeGroup(command.group),
    longRunning: Boolean(command.longRunning),
    jestJson: Boolean(command.jestJson),
    interactions: command.interactions === "expo" ? "expo" : "",
    argv: custom ? argv || [] : undefined,
    argvLine: custom ? String(command.argvLine ?? formatArgvLine(argv || [])) : "",
    custom,
    label: lowercaseCommandLabel(command.label) || command.label,
    hint: command.hint,
    destructive: Boolean(command.destructive),
    confirmTitle: command.confirmTitle,
    confirmMessage: command.confirmMessage,
    selected,
  };
}

function mergeScriptRows(discovered, existingCommands) {
  const leftover = new Map();
  const untitled = [];
  for (const command of existingCommands || []) {
    const script = String(command.script || "");
    if (script) leftover.set(script, command);
    else untitled.push(command);
  }
  const rows = discovered.map((item) => {
    const existing = leftover.get(item.script);
    if (existing) {
      leftover.delete(item.script);
      const selected = existing.selected != null ? Boolean(existing.selected) : true;
      // jestJson from Probe so Vitest/Playwright do not keep a stale Jest flag.
      return commandToRow(
        {
          ...item,
          ...existing,
          argv: existing.argv || item.argv,
          jestJson: item.jestJson,
        },
        selected
      );
    }
    return commandToRow(item, ["run", "database", "seed", "test"].includes(item.group));
  });
  for (const existing of leftover.values()) {
    rows.unshift(commandToRow(existing, existing.selected != null ? Boolean(existing.selected) : true));
  }
  for (const extra of untitled) {
    rows.push(commandToRow(extra, extra.selected != null ? Boolean(extra.selected) : true));
  }
  return rows;
}

function formUsesExpo() {
  return setupScriptRows.some((row) => row.selected && row.interactions === "expo");
}

function parseArgvLine(value) {
  const input = String(value ?? "");
  const parts = [];
  let current = "";
  let quote = "";
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) {
        quote = "";
        continue;
      }
      if (ch === "\\" && quote === '"' && i + 1 < input.length) {
        current += input[i + 1];
        i += 1;
        continue;
      }
      current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (quote) {
    throw new Error("Unclosed quote in command");
  }
  if (current) parts.push(current);
  return parts;
}

function formatArgvLine(parts) {
  return (Array.isArray(parts) ? parts : [])
    .map((part) => {
      const text = String(part ?? "");
      if (text && !/[\s'"\\]/.test(text)) return text;
      return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    })
    .join(" ");
}

function customRowState(row) {
  const label = lowercaseCommandLabel(row.label);
  let argv;
  try {
    argv = parseArgvLine(row.argvLine ?? "");
  } catch (error) {
    return { incomplete: true, error: error.message };
  }
  if (!label && !argv.length) return { empty: true };
  if (!label || !argv.length) return { incomplete: true };
  return { label, argv };
}

function syncNoPkgUi(hasPackageJson) {
  const showWarning = setupProbeOk && !hasPackageJson;
  setupNoPkg.hidden = !showWarning;
  setupAddCustomWrap.hidden = !setupProbeOk;
}

function hasCompleteCommand() {
  let complete = false;
  for (const row of setupScriptRows) {
    if (isCustomRow(row)) {
      const state = customRowState(row);
      if (state.incomplete) return false;
      if (row.selected && !state.empty) complete = true;
    } else if (row.selected) {
      complete = true;
    }
  }
  return complete;
}

function syncCommitButton() {
  const hasName = Boolean(setupName.value.trim() || setupId.value.trim());
  setupCommitProject.disabled = !(setupProbeOk && hasName && hasCompleteCommand());
}

function syncAppearanceFields() {
  const formOpen = !setupProjectForm.hidden;
  if (setupAppearanceRow) setupAppearanceRow.hidden = formOpen;
  syncThemeButtons();
}

function syncSetupChrome() {
  const formOpen = !setupProjectForm.hidden;
  const formLead =
    "Add a repo by folder path, then Probe. You do not need that folder open in the editor.";
  if (!formOpen) {
    setupTitle.textContent = "Settings";
    setupLead.textContent =
      "Choose light or dark. Add, hide, or reorder projects. Theme stays in this browser; project changes save immediately.";
    return;
  }
  if (setupEditingIndex != null) {
    const project = setupDraft?.projects?.[setupEditingIndex];
    setupTitle.textContent = `Edit ${project?.name || project?.id || ""}`.trim();
    setupLead.textContent = formLead;
    return;
  }
  setupTitle.textContent = "Add a project";
  setupLead.textContent = formLead;
}

function syncSetupAddButton() {
  const formOpen = !setupProjectForm.hidden;
  setupProjectsRest.hidden = formOpen;
  setupAddProject.hidden = formOpen;
  setupClose.hidden = formOpen;
  if (setupStepRoot) setupStepRoot.hidden = formOpen;
  setupStepProjects.hidden = false;
  setupStepProjects.classList.toggle("is-form-open", formOpen);
  syncAppearanceFields();
  syncTestOverviewFields();
  syncSetupChrome();
}

function resetProjectForm() {
  setupEditingIndex = null;
  setupScriptRows = [];
  setupProbedScheme = "";
  setupProbeOk = false;
  setupFormTitle.textContent = "Add a project";
  setupCommitProject.textContent = "Add Project";
  setupPath.value = "";
  setupId.value = "";
  setupName.value = "";
  setupDescription.value = "";
  setupHealthPort.value = "";
  setupTestKind.value = "jest";
  setupPath.classList.remove("is-error");
  setProbeStatus(setupPathStatus, true, "");
  renderSetupScripts();
  syncTestOverviewFields();
  syncNoPkgUi(true);
  syncCommitButton();
}

function openProjectForm(index = null) {
  if (index == null) {
    setupProjectForm.hidden = false;
    resetProjectForm();
    syncSetupAddButton();
    setupPath.focus();
    return;
  }
  const project = setupDraft.projects[index];
  setupEditingIndex = index;
  setupProjectForm.hidden = false;
  setupFormTitle.textContent = `Edit ${project.name || project.id}`;
  setupCommitProject.textContent = "Update project";
  setupPath.value = project.path || "";
  setupId.value = project.id || "";
  setupName.value = project.name || "";
  setupDescription.value = project.description || "";
  setupHealthPort.value = project.health?.port ?? "";
  setupTestKind.value = project.testKind === "maven" ? "maven" : "jest";
  setupScriptRows = (project.commands || []).map((command) => commandToRow(command, true));
  setupProbedScheme = String(project.expoDevClientScheme || "app").trim() || "app";
  setupProbeOk = false;
  setProbeStatus(setupPathStatus, true, "");
  renderSetupScripts();
  syncTestOverviewFields();
  syncCommitButton();
  syncSetupAddButton();
  if (setupPath.value.trim()) probeCurrentPath();
}

function collectProjectFromForm() {
  const projectPath = setupPath.value.trim();
  let id = setupId.value.trim();
  const name = setupName.value.trim();
  if (!projectPath || !setupProbeOk) throw new Error("Choose a project path, then Probe.");
  if (!name && !id) throw new Error("Name is required.");
  if (!id) {
    id = slugifyId(name);
    setupId.value = id;
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) {
    throw new Error("Project id must be letters, numbers, hyphens, or underscores.");
  }
  const displayName = name || id;
  for (const row of setupScriptRows) {
    if (!isCustomRow(row)) continue;
    const state = customRowState(row);
    if (state.empty) continue;
    if (state.incomplete) throw new Error(state.error || "Enter a command name and the command to run.");
  }
  const commands = [];
  const used = new Set();
  for (const row of setupScriptRows) {
    if (isCustomRow(row) || !row.selected) continue;
    if (used.has(row.script)) continue;
    used.add(row.script);
    const command = {
      script: row.script,
      group: normalizeGroup(row.group),
    };
    if (row.label) command.label = lowercaseCommandLabel(row.label);
    if (row.hint) command.hint = row.hint;
    if (row.longRunning) command.longRunning = true;
    if (row.destructive) command.destructive = true;
    if (row.jestJson) command.jestJson = true;
    if (row.confirmTitle) command.confirmTitle = row.confirmTitle;
    if (row.confirmMessage) command.confirmMessage = row.confirmMessage;
    if (row.interactions === "expo") command.interactions = "expo";
    commands.push(command);
  }
  for (const row of setupScriptRows) {
    if (!isCustomRow(row) || !row.selected) continue;
    const state = customRowState(row);
    if (state.empty) continue;
    let script = String(row.script || "").trim();
    if (!script || used.has(script)) script = uniqueScriptId(state.label, used);
    used.add(script);
    const command = {
      script,
      label: lowercaseCommandLabel(state.label) || state.label,
      group: normalizeGroup(row.group),
      argv: state.argv,
    };
    if (row.hint) command.hint = row.hint;
    if (row.longRunning) command.longRunning = true;
    if (row.destructive) command.destructive = true;
    if (row.confirmTitle) command.confirmTitle = row.confirmTitle;
    if (row.confirmMessage) command.confirmMessage = row.confirmMessage;
    if (row.interactions === "expo") command.interactions = "expo";
    commands.push(command);
  }
  if (!commands.length) throw new Error("Check at least one command to show on the dashboard.");
  const healthPort = Number(setupHealthPort.value);
  const existing = setupEditingIndex != null ? setupDraft.projects[setupEditingIndex] : null;
  const oldHealth = Number(existing?.health?.port);
  let ports = Array.isArray(existing?.ports)
    ? existing.ports.filter((port) => Number.isFinite(Number(port))).map(Number)
    : [];
  if (Number.isFinite(oldHealth) && oldHealth > 0 && oldHealth !== healthPort) {
    ports = ports.filter((port) => port !== oldHealth);
  }
  if (Number.isFinite(healthPort) && healthPort > 0 && !ports.includes(healthPort)) {
    ports.push(healthPort);
  }
  const project = {
    id,
    name: displayName,
    path: projectPath,
    ports,
    testKind: setupTestKind.value === "maven" ? "maven" : "jest",
    commands,
  };
  const description = setupDescription.value.trim().slice(0, 50);
  if (description) project.description = description;
  if (existing?.hidden) project.hidden = true;
  if (formUsesExpo()) {
    project.expoDevClientScheme = setupProbedScheme || existing?.expoDevClientScheme || "app";
  }
  if (Number.isFinite(healthPort) && healthPort > 0) {
    project.health = { stack: existing?.health?.stack || displayName, port: healthPort };
  }
  return project;
}

function commitProjectForm() {
  const project = collectProjectFromForm();
  const duplicate = setupDraft.projects.some(
    (item, index) => item.id === project.id && index !== setupEditingIndex
  );
  if (duplicate) throw new Error(`A project with id "${project.id}" already exists.`);
  const wasAdding = setupEditingIndex == null;
  if (wasAdding) setupDraft.projects.push(project);
  else setupDraft.projects[setupEditingIndex] = project;
  renderSetupList();
  return { wasAdding };
}

async function probeCurrentPath() {
  const projectPath = setupPath.value.trim();
  if (!projectPath) {
    setupPath.classList.add("is-error");
    setProbeStatus(setupPathStatus, false, "Choose a path first.");
    setupProbeOk = false;
    syncNoPkgUi(true);
    syncCommitButton();
    return;
  }
  const result = await requestJson("/api/workspace/probe", {
    method: "POST",
    quiet: true,
    body: { path: projectPath },
  });
  if (!result.ok) {
    setupPath.classList.add("is-error");
    setProbeStatus(setupPathStatus, false, result.message);
    setupProbeOk = false;
    syncNoPkgUi(true);
    syncCommitButton();
    return;
  }
  const probe = result.data;
  if (!probe.exists) {
    setProbeStatus(setupPathStatus, false, `Folder not found: ${probe.resolved}`);
    setupPath.classList.add("is-error");
    setupProbeOk = false;
    syncNoPkgUi(true);
    syncCommitButton();
    return;
  }
  setupPath.classList.remove("is-error");
  setupProbeOk = true;
  const bits = [`Found ${probe.resolved}`];
  if (probe.hasExpo) bits.push("Expo");
  if (probe.hasMaven) bits.push("Maven");
  if (!probe.hasPackageJson) bits.push("no package.json");
  setProbeStatus(setupPathStatus, true, bits.join(" · "));
  if (!setupName.value.trim()) setupName.value = probe.name;
  if (!setupId.value.trim()) setupId.value = slugifyId(setupName.value.trim() || probe.name);
  if (probe.hasMaven) setupTestKind.value = "maven";
  else if (probe.hasExpo) setupTestKind.value = "jest";
  if (!setupHealthPort.value) {
    if (probe.hasExpo) setupHealthPort.value = "8081";
    else if (probe.hasMaven) setupHealthPort.value = "8080";
    else if ((probe.scripts || []).some((item) => item.script === "dev")) setupHealthPort.value = "3000";
  }
  const existing = setupScriptRows.length
    ? setupScriptRows
    : setupEditingIndex != null
      ? (setupDraft.projects[setupEditingIndex]?.commands || []).map((command) => commandToRow(command, true))
      : [];
  setupScriptRows = mergeScriptRows(probe.scripts || [], existing);
  if (probe.hasExpo) {
    setupProbedScheme = String(probe.expoDevClientScheme || "app").trim() || "app";
  }
  renderSetupScripts();
  syncNoPkgUi(Boolean(probe.hasPackageJson));
  syncCommitButton();
}

function applyDraftRootFields() {
  if (setupIsFirstRun) setupDraft.showTestOverview = false;
  else if (!setupAddMode) setupDraft.showTestOverview = setupShowTestOverview.checked;
  delete setupDraft.workspaceRoot;
  delete setupDraft.metroPort;
  delete setupDraft.expoDevClientScheme;
}

function syncTestOverviewFields() {
  const formOpen = !setupProjectForm.hidden;
  const hideOverview = setupIsFirstRun || setupAddMode || formOpen;
  setupTestOverviewRow.hidden = hideOverview;
  setupTestKindField.hidden = true;
  if (hideOverview) {
    if (setupIsFirstRun) setupShowTestOverview.checked = false;
    return;
  }
  setupShowTestOverview.checked = Boolean(setupDraft?.showTestOverview);
}

async function persistWorkspace({ close = false } = {}) {
  if (!setupDraft) return false;
  setSetupError("");
  applyDraftRootFields();
  const result = await requestJson("/api/workspace", {
    method: "PUT",
    quiet: true,
    body: setupDraft,
  });
  if (!result.ok) {
    setSetupError(result.message);
    return false;
  }
  if (close) closeSetup();
  await fetchStatus();
  return true;
}

async function openSetup({ addProject = false } = {}) {
  setSetupError("");
  const result = await requestJson("/api/workspace", { quiet: true });
  if (!result.ok) {
    setSetupError(result.message);
    setupPanel.hidden = false;
    return;
  }
  const raw = result.data;
  setupDraft = cloneWorkspace(raw);
  const empty = (setupDraft.projects || []).length === 0;
  setupIsFirstRun = empty;
  setupAddMode = Boolean(addProject);
  setupProjectForm.hidden = true;
  resetProjectForm();
  renderSetupList();
  setupPanel.hidden = false;
  if (addProject) {
    openProjectForm();
    return;
  }
  syncSetupAddButton();
}

editSetupBtn.addEventListener("click", () => {
  openSetup();
});
setupThemeLight?.addEventListener("click", () => {
  applyTheme("light", true);
});
setupThemeDark?.addEventListener("click", () => {
  applyTheme("dark", true);
});
addProjectBtn.addEventListener("click", () => {
  openSetup({ addProject: true });
});
addProjectEmptyBtn.addEventListener("click", () => {
  openSetup({ addProject: true });
});
setupShowTestOverview.addEventListener("change", async () => {
  if (!setupDraft || setupIsFirstRun || setupAddMode) return;
  const previous = Boolean(setupDraft.showTestOverview);
  setupDraft.showTestOverview = setupShowTestOverview.checked;
  const ok = await persistWorkspace({ close: false });
  if (!ok) {
    setupDraft.showTestOverview = previous;
    setupShowTestOverview.checked = previous;
  }
});
setupClose.addEventListener("click", closeSetup);
setupBrowsePath.addEventListener("click", async () => {
  setSetupError("");
  await browseIntoInput(setupPath, {
    after: ({ error }) => {
      if (error) {
        setupPath.classList.add("is-error");
        setProbeStatus(setupPathStatus, false, error);
        setupProbeOk = false;
        syncNoPkgUi(true);
        syncCommitButton();
      } else {
        setupPath.classList.remove("is-error");
        probeCurrentPath();
      }
    },
  });
});
setupAddProject.addEventListener("click", () => {
  setSetupError("");
  openProjectForm();
});
setupProbe.addEventListener("click", async () => {
  setSetupError("");
  await probeCurrentPath();
});
setupPath.addEventListener("input", () => {
  setupPath.classList.remove("is-error");
  setupProbeOk = false;
  syncNoPkgUi(true);
  syncCommitButton();
});
setupName.addEventListener("input", () => {
  syncCommitButton();
});
setupId.addEventListener("input", () => {
  syncCommitButton();
});
setupAddCustom.addEventListener("click", () => {
  setSetupError("");
  setupScriptRows.push(emptyCustomRow());
  renderSetupScripts();
  syncCommitButton();
  const index = setupScriptRows.length - 1;
  setupScripts.querySelector(`[data-script-label="${index}"]`)?.focus();
});
setupCancelForm.addEventListener("click", () => {
  if (setupAddMode) {
    closeSetup();
    return;
  }
  setupProjectForm.hidden = true;
  resetProjectForm();
  syncSetupAddButton();
});
setupCommitProject.addEventListener("click", async () => {
  setSetupError("");
  const previous = setupDraft ? cloneWorkspace(setupDraft) : null;
  const editingIndex = setupEditingIndex;
  const probeOk = setupProbeOk;
  try {
    const { wasAdding } = commitProjectForm();
    const ok = await persistWorkspace({ close: wasAdding });
    if (!ok) {
      if (previous) setupDraft = previous;
      renderSetupList();
      setupEditingIndex = editingIndex;
      setupProbeOk = probeOk;
      syncSetupChrome();
      return;
    }
    if (!wasAdding) {
      setupProjectForm.hidden = true;
      resetProjectForm();
      syncSetupAddButton();
    }
  } catch (error) {
    if (previous) setupDraft = previous;
    setSetupError(error.message);
    setupEditingIndex = editingIndex;
    setupProbeOk = probeOk;
    renderSetupList();
    syncSetupChrome();
  }
});
setupProjectList.addEventListener("click", (event) => {
  const edit = event.target.closest("[data-setup-edit]");
  if (edit) {
    setSetupError("");
    openProjectForm(Number(edit.dataset.setupEdit));
    return;
  }
  const remove = event.target.closest("[data-setup-remove]");
  if (!remove) return;
  const index = Number(remove.dataset.setupRemove);
  const project = setupDraft.projects[index];
  openConfirm({
    title: "Remove project?",
    message: `Remove ${project.name || project.id} from overview? This does not delete the folder.`,
    okLabel: "Remove",
    onConfirm: async () => {
      const [removed] = setupDraft.projects.splice(index, 1);
      if (setupEditingIndex === index) {
        setupProjectForm.hidden = true;
        resetProjectForm();
        syncSetupAddButton();
      } else if (setupEditingIndex > index) {
        setupEditingIndex -= 1;
      }
      const ok = await persistWorkspace({ close: false });
      if (!ok) {
        setupDraft.projects.splice(index, 0, removed);
        renderSetupList();
        syncSetupAddButton();
        return;
      }
      renderSetupList();
      syncSetupAddButton();
    },
  });
});
setupProjectList.addEventListener("change", async (event) => {
  const toggle = event.target.closest("[data-setup-visible]");
  if (!toggle || !setupDraft) return;
  const index = Number(toggle.dataset.setupVisible);
  const project = setupDraft.projects[index];
  if (!project) return;
  const previous = Boolean(project.hidden);
  if (toggle.checked) delete project.hidden;
  else project.hidden = true;
  renderSetupList();
  const ok = await persistWorkspace({ close: false });
  if (!ok) {
    if (previous) project.hidden = true;
    else delete project.hidden;
    renderSetupList();
  }
});

let setupDragIndex = null;

async function persistSetupOrder(from, to) {
  if (!setupDraft || from === to || from < 0 || to < 0) return;
  const previous = setupDraft.projects.slice();
  setupDraft.projects = moveItem(setupDraft.projects, from, to);
  if (setupEditingIndex === from) setupEditingIndex = to;
  else if (setupEditingIndex != null) {
    if (from < setupEditingIndex && to >= setupEditingIndex) setupEditingIndex -= 1;
    else if (from > setupEditingIndex && to <= setupEditingIndex) setupEditingIndex += 1;
  }
  renderSetupList();
  persistDrag = true;
  const ok = await persistWorkspace({ close: false });
  persistDrag = false;
  isDragging = false;
  if (!ok) {
    setupDraft.projects = previous;
    renderSetupList();
  }
}

setupProjectList.addEventListener("dragstart", (event) => {
  const handle = event.target.closest("[data-setup-drag]");
  if (!handle) return;
  setupDragIndex = Number(handle.dataset.setupDrag);
  isDragging = true;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", String(setupDragIndex));
  const row = handle.closest(".setup-project-row");
  row?.classList.add("is-dragging");
  if (row) event.dataTransfer.setDragImage(row, 24, 24);
});

setupProjectList.addEventListener("dragover", (event) => {
  const row = event.target.closest(".setup-project-row");
  if (!row || setupDragIndex == null) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  setupProjectList.querySelectorAll(".is-drag-over").forEach((el) => el.classList.remove("is-drag-over"));
  if (Number(row.dataset.setupIndex) !== setupDragIndex) row.classList.add("is-drag-over");
});

setupProjectList.addEventListener("drop", async (event) => {
  const row = event.target.closest(".setup-project-row");
  if (!row || setupDragIndex == null || !setupDraft) return;
  event.preventDefault();
  const from = setupDragIndex;
  const to = Number(row.dataset.setupIndex);
  persistDrag = true;
  clearDragStyles(setupProjectList);
  setupDragIndex = null;
  if (from === to) {
    persistDrag = false;
    isDragging = false;
    return;
  }
  await persistSetupOrder(from, to);
});

setupProjectList.addEventListener("dragend", () => {
  clearDragStyles(setupProjectList);
  setupDragIndex = null;
  if (!persistDrag) isDragging = false;
});
setupScripts.addEventListener("input", (event) => {
  const label = event.target.closest("[data-script-label]");
  if (label) {
    const row = setupScriptRows[Number(label.dataset.scriptLabel)];
    const start = label.selectionStart;
    const end = label.selectionEnd;
    const next = label.value.toLowerCase();
    if (label.value !== next) {
      label.value = next;
      if (typeof start === "number" && typeof end === "number") {
        label.setSelectionRange(start, end);
      }
    }
    if (row) row.label = next;
    syncCommitButton();
    return;
  }
  const argv = event.target.closest("[data-script-argv]");
  if (!argv) return;
  const row = setupScriptRows[Number(argv.dataset.scriptArgv)];
  if (row) row.argvLine = argv.value;
  syncCommitButton();
});
setupScripts.addEventListener("click", (event) => {
  const remove = event.target.closest("[data-script-remove]");
  if (!remove) return;
  const index = Number(remove.dataset.scriptRemove);
  if (!Number.isInteger(index) || index < 0) return;
  setupScriptRows.splice(index, 1);
  renderSetupScripts();
  syncCommitButton();
});
setupScripts.addEventListener("change", (event) => {
  const check = event.target.closest("[data-script-check]");
  if (check) {
    setupScriptRows[Number(check.dataset.scriptCheck)].selected = check.checked;
    syncCommitButton();
    return;
  }
  const group = event.target.closest("[data-script-group]");
  if (group) {
    const row = setupScriptRows[Number(group.dataset.scriptGroup)];
    applyRowGroup(row, group.value);
    renderSetupScripts();
    return;
  }
  const longRunning = event.target.closest("[data-script-long]");
  if (longRunning) {
    setupScriptRows[Number(longRunning.dataset.scriptLong)].longRunning = longRunning.checked;
    return;
  }
  const destructive = event.target.closest("[data-script-destructive]");
  if (destructive) {
    setupScriptRows[Number(destructive.dataset.scriptDestructive)].destructive = destructive.checked;
  }
});

/** SSE: `status` redraws the page, `job` updates chrome, `log` appends output, `health` is refresh. */
function connectEvents() {
  const source = new EventSource("/api/events");
  source.addEventListener("status", (event) => {
    statusData = JSON.parse(event.data);
    if (isDragging) return;
    render();
  });
  source.addEventListener("job", (event) => {
    const job = JSON.parse(event.data);
    if (!statusData) return;
    const jobs = statusData.jobs ?? [];
    const index = jobs.findIndex((item) => item.id === job.id);
    if (index >= 0) jobs[index] = job;
    else jobs.push(job);
    statusData.jobs = jobs;
    syncRepoRunningFromJobs();
    renderHealth();
    if (!isDragging) renderProjects();
    updateLogChrome();
  });
  source.addEventListener("health", (event) => {
    if (!statusData) return;
    statusData.health = JSON.parse(event.data);
    statusData.generatedAt = new Date().toISOString();
    renderHealth();
    renderHealthChecked();
  });
  source.addEventListener("log", (event) => {
    const entry = JSON.parse(event.data);
    if (entry.id !== selectedJobId) {
      const incoming = jobById(entry.id);
      if (!selectedJobId && incoming?.status === "running") {
        selectedJobId = entry.id;
        updateLogChrome();
      } else return;
    }
    if (selectedJobId === entry.id) {
      appendLogLine(entry.stream, entry.text, { at: entry.at, replace: entry.replace, live: entry.live });
    }
  });
  source.onerror = () => {
    // EventSource reconnects automatically
  };
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

fetchStatus()
  .then(async () => {
    syncConsoleCollapsedDefault();
    // After refresh, resume the most recently started still-running job.
    const running = (statusData.jobs ?? [])
      .filter((job) => job.status === "running")
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    if (running[0]) {
      selectedJobId = running[0].id;
      await loadLogs(selectedJobId);
      if (storedCollapsedPref === null) expandOutput();
      updateLogChrome();
    }
    connectEvents();
  })
  .catch((error) => {
    logPanel.textContent = `Failed to load overview status: ${error.message}`;
  });

setInterval(() => {
  renderHealthChecked();
}, 15000);

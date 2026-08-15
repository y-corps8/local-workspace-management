/**
 * Overview dashboard UI.
 *
 * Loads GET /api/status, then stays current via EventSource /api/events
 * (status, job, log). Buttons POST only a command id to /api/run or /api/stop,
 * or { id, action } to /api/interact for live Expo keys.
 */
const GROUP_LABELS = {
  run: "Run",
  database: "Database",
  seed: "Seed",
  test: "Tests",
  tooling: "Tooling",
};

let statusData = null;
let selectedJobId = null;
let confirmAction = null;
/** Follow new log lines unless the user scrolled up in the output panel. */
let stickToBottom = true;

const healthEl = document.getElementById("health-strip");
const testEl = document.getElementById("test-grid");
const projectEl = document.getElementById("project-grid");
const generatedEl = document.getElementById("generated-at");
const jobTabsEl = document.getElementById("job-tabs");
const logSection = document.querySelector(".log-section");
const logPanel = document.getElementById("log-panel");
const logLabel = document.getElementById("log-job-label");
const logStop = document.getElementById("log-stop");
const logClear = document.getElementById("log-clear");
const logInteractions = document.getElementById("log-interactions");
const confirmModal = document.getElementById("confirm-modal");
const confirmTitle = document.getElementById("confirm-title");
const confirmMessage = document.getElementById("confirm-message");
const confirmOk = document.getElementById("confirm-ok");
const confirmCancel = document.getElementById("confirm-cancel");
const editSetupBtn = document.getElementById("edit-setup");
const setupPanel = document.getElementById("setup-panel");
const setupClose = document.getElementById("setup-close");
const setupError = document.getElementById("setup-error");
const setupEyebrow = document.getElementById("setup-eyebrow");
const setupTitle = document.getElementById("setup-title");
const setupLead = document.getElementById("setup-lead");
const setupStepRoot = document.getElementById("setup-step-root");
const setupStepProjects = document.getElementById("setup-step-projects");
const setupWorkspaceRoot = document.getElementById("setup-workspace-root");
const setupMetroPort = document.getElementById("setup-metro-port");
const setupExpoScheme = document.getElementById("setup-expo-scheme");
const setupRootStatus = document.getElementById("setup-root-status");
const setupCheckRoot = document.getElementById("setup-check-root");
const setupContinue = document.getElementById("setup-continue");
const setupProjectList = document.getElementById("setup-project-list");
const setupAddProject = document.getElementById("setup-add-project");
const setupBackRoot = document.getElementById("setup-back-root");
const setupSave = document.getElementById("setup-save");
const setupProjectForm = document.getElementById("setup-project-form");
const setupFormTitle = document.getElementById("setup-form-title");
const setupPath = document.getElementById("setup-path");
const setupProbe = document.getElementById("setup-probe");
const setupPathStatus = document.getElementById("setup-path-status");
const setupId = document.getElementById("setup-id");
const setupName = document.getElementById("setup-name");
const setupRole = document.getElementById("setup-role");
const setupHealthPort = document.getElementById("setup-health-port");
const setupTestKind = document.getElementById("setup-test-kind");
const setupScripts = document.getElementById("setup-scripts");
const setupCancelForm = document.getElementById("setup-cancel-form");
const setupCommitProject = document.getElementById("setup-commit-project");

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
  healthEl.innerHTML = (statusData.health ?? [])
    .map((item) => {
      const name = item.repo || item.label;
      const stack = item.stack || item.label;
      return `
      <article class="health-pill">
        <span class="dot ${item.up ? "up" : "down"}" aria-hidden="true"></span>
        <span class="label">${escapeHtml(name)}</span>
        <div class="hover-tip" role="tooltip">
          ${escapeHtml(stack)} · :${item.port}
        </div>
      </article>`;
    })
    .join("");
}

function renderTests() {
  const repos = statusData.repos ?? [];
  if (!repos.length) {
    testEl.innerHTML = `<p class="test-empty">Add a project to get started</p>`;
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
  const repos = statusData.repos ?? [];
  if (!repos.length) {
    projectEl.innerHTML = `<p class="test-empty">Add a project to get started</p>`;
    return;
  }
  projectEl.innerHTML = repos
    .map((repo) => {
      const repoCommands = commands.filter((command) => command.repo === repo.id);
      const groups = Object.keys(GROUP_LABELS)
        .map((group) => ({
          group,
          label: GROUP_LABELS[group],
          items: repoCommands.filter((command) => command.group === group),
        }))
        .filter((entry) => entry.items.length);
      const runningIds = new Set((repo.running ?? []).map((job) => job.id));
      const git = repo.git ?? {};
      const groupHtml = groups
        .map((entry) => {
          const buttons = entry.items
            .map((command) => {
              const running = runningIds.has(command.id);
              const cls = [
                "btn",
                "cmd-btn",
                entry.group === "run" && !command.destructive && !running ? "btn-primary" : "",
                command.destructive ? "btn-danger" : "",
                running ? "btn-running" : "",
              ]
                .filter(Boolean)
                .join(" ");
              // Same button: run when idle, stop when this command id is live.
              const label = running ? `Stop ${command.label}` : command.label;
              const action = running ? "stop" : "run";
              const hint = running
                ? `Stop this process. ${command.hint || ""}`.trim()
                : command.hint || `Run ${command.label}.`;
              const reload = running
                ? (command.interactions ?? []).find((item) => item.id === "reload")
                : null;
              const reloadBtn = reload
                ? `<span class="cmd-wrap">
                <button type="button" class="btn cmd-btn btn-action" data-action="interact" data-id="${escapeHtml(command.id)}" data-interact="${escapeHtml(reload.id)}">${escapeHtml(reload.label)}</button>
                <div class="hover-tip" role="tooltip">${escapeHtml(reload.hint || "Reload the app.")}</div>
              </span>`
                : "";
              return `${reloadBtn}<span class="cmd-wrap">
                <button type="button" class="${cls}" data-action="${action}" data-id="${escapeHtml(command.id)}">${escapeHtml(label)}</button>
                <div class="hover-tip" role="tooltip">${escapeHtml(hint)}</div>
              </span>`;
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

      return `
        <article class="project-card">
          <div class="project-head">
            <h3>${escapeHtml(repo.name)}</h3>
            <span class="${busy ? "chip chip-run" : "chip chip-idle"}">${busy ? `${repo.running.length} running` : "idle"}</span>
          </div>
          <p class="role">${escapeHtml(repo.role)}</p>
          <div class="project-meta">
            <span>${escapeHtml(git.branch || "unknown")}${git.dirty ? " · dirty" : ""}</span>
            <span>${repo.ports?.length ? repo.ports.map((port) => `:${port}`).join(" ") : "no server port"}</span>
          </div>
          ${repo.exists ? groupHtml : `<p class="test-empty">Repo folder not found at ${escapeHtml(repo.root || "unknown path")}.</p>`}
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

function runningJobs() {
  return [...(statusData?.jobs ?? [])]
    .filter((job) => job.status === "running")
    .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
}

function renderJobTabs() {
  const jobs = runningJobs();
  if (!jobs.length) {
    jobTabsEl.innerHTML = `<p class="job-tabs-empty">No running commands</p>`;
    return;
  }
  jobTabsEl.innerHTML = jobs
    .map((job) => {
      const active = job.id === selectedJobId ? " is-active" : "";
      return `<button type="button" class="job-tab${active}" role="tab" aria-selected="${
        job.id === selectedJobId
      }" data-job-id="${escapeHtml(job.id)}">${escapeHtml(job.repo)} · ${escapeHtml(job.label)}</button>`;
    })
    .join("");
}

let lastInteractionKey = "";

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
  const job = selectedJobId ? jobById(selectedJobId) : null;
  logLabel.textContent = job
    ? `${job.repo} · ${job.label} · ${jobTabLabel(job)}`
    : "No command yet";
  logStop.hidden = !(job && job.status === "running");
  logSection?.classList.toggle("has-running", runningJobs().length > 0);
  renderJobTabs();
  renderLogInteractions();
}

async function selectJob(id) {
  selectedJobId = id;
  stickToBottom = true;
  updateLogChrome();
  await loadLogs(id);
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

function appendLogLine(stream, text) {
  const line = document.createElement("div");
  line.className = logLineClass(stream, text);
  line.textContent = text.endsWith("\n") ? text : `${text}\n`;
  logPanel.appendChild(line);
  if (stickToBottom) {
    logPanel.scrollTop = logPanel.scrollHeight;
  }
}

function render() {
  if (!statusData) return;
  generatedEl.textContent = formatTime(statusData.generatedAt);
  renderHealth();
  renderTests();
  renderProjects();
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
    appendLogLine(entry.stream, entry.text);
  }
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

async function runCommand(id) {
  selectedJobId = id;
  logPanel.replaceChildren();
  stickToBottom = true;
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

projectEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-id]");
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  const command = commandById(id);
  if (!command) return;
  if (action === "interact") {
    interactCommand(id, button.dataset.interact);
    return;
  }
  if (action === "stop") {
    selectJob(id);
    stopCommand(id);
    return;
  }
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

jobTabsEl.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-job-id]");
  if (!tab) return;
  selectJob(tab.dataset.jobId);
});

logStop.addEventListener("click", () => {
  if (selectedJobId) stopCommand(selectedJobId);
});

logInteractions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-interact]");
  if (!button) return;
  interactCommand(button.dataset.id, button.dataset.interact);
});

logClear.addEventListener("click", () => {
  logPanel.replaceChildren();
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
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!confirmModal.hidden) {
    closeConfirm();
    return;
  }
  if (!setupPanel.hidden) closeSetup();
});

// ── Setup wizard (first run + Edit setup) ───────────────────────────────────

const SETUP_GROUPS = ["run", "database", "seed", "test", "tooling"];
let setupDraft = null;
let setupEditingIndex = null;
let setupScriptRows = [];

function slugifyId(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "project";
}

function cloneWorkspace(raw) {
  return {
    workspaceRoot: raw.workspaceRoot || ".",
    metroPort: Number(raw.metroPort) || 8081,
    expoDevClientScheme: raw.expoDevClientScheme || "app",
    projects: (raw.projects || []).map((project) => ({
      ...project,
      commands: (project.commands || []).map((command) => ({ ...command })),
      ports: Array.isArray(project.ports) ? [...project.ports] : [],
      health: project.health ? { ...project.health } : undefined,
    })),
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

function showSetupStep(step) {
  setupStepRoot.hidden = step !== "root";
  setupStepProjects.hidden = step !== "projects";
}

function closeSetup() {
  setupPanel.hidden = true;
  setupDraft = null;
  setupEditingIndex = null;
  setupScriptRows = [];
  setSetupError("");
}

function renderSetupList() {
  const projects = setupDraft?.projects ?? [];
  if (!projects.length) {
    setupProjectList.innerHTML = `<p class="setup-empty">No projects yet. Add one below, or save an empty setup and come back later.</p>`;
    return;
  }
  setupProjectList.innerHTML = projects
    .map((project, index) => {
      const count = (project.commands || []).length;
      return `<article class="setup-project-row">
        <div>
          <strong>${escapeHtml(project.name || project.id)}</strong>
          <span>${escapeHtml(project.path)} · ${count} command${count === 1 ? "" : "s"}</span>
        </div>
        <div class="setup-project-row-actions">
          <button type="button" class="btn btn-compact" data-setup-edit="${index}">Edit</button>
          <button type="button" class="btn btn-compact btn-danger" data-setup-remove="${index}">Remove</button>
        </div>
      </article>`;
    })
    .join("");
}

function renderSetupScripts() {
  if (!setupScriptRows.length) {
    setupScripts.innerHTML = "";
    return;
  }
  setupScripts.innerHTML = setupScriptRows
    .map((row, index) => {
      const groups = SETUP_GROUPS.map(
        (group) =>
          `<option value="${group}" ${row.group === group ? "selected" : ""}>${GROUP_LABELS[group]}</option>`
      ).join("");
      return `<div class="setup-script">
        <input type="checkbox" data-script-check="${index}" ${row.selected ? "checked" : ""} aria-label="Show ${escapeHtml(row.script)}" />
        <code title="${escapeHtml(row.script)}">${escapeHtml(row.script)}</code>
        <select data-script-group="${index}" aria-label="Group for ${escapeHtml(row.script)}">${groups}</select>
        <label><input type="checkbox" data-script-long="${index}" ${row.longRunning ? "checked" : ""} /> Long-running</label>
        <label><input type="checkbox" data-script-expo="${index}" ${row.interactions === "expo" ? "checked" : ""} /> Expo live</label>
      </div>`;
    })
    .join("");
}

function commandToRow(command, selected) {
  return {
    script: command.script,
    group: command.group || "tooling",
    longRunning: Boolean(command.longRunning),
    jestJson: Boolean(command.jestJson),
    interactions: command.interactions === "expo" ? "expo" : "",
    argv: Array.isArray(command.argv) ? command.argv : undefined,
    label: command.label,
    hint: command.hint,
    destructive: Boolean(command.destructive),
    confirmTitle: command.confirmTitle,
    confirmMessage: command.confirmMessage,
    selected,
  };
}

function mergeScriptRows(discovered, existingCommands) {
  const leftover = new Map((existingCommands || []).map((command) => [command.script, command]));
  const rows = discovered.map((item) => {
    const existing = leftover.get(item.script);
    if (existing) {
      leftover.delete(item.script);
      const selected = existing.selected != null ? Boolean(existing.selected) : true;
      return commandToRow(
        {
          ...item,
          ...existing,
          argv: existing.argv || item.argv,
        },
        selected
      );
    }
    return commandToRow(item, ["run", "database", "seed", "test"].includes(item.group));
  });
  for (const existing of leftover.values()) {
    rows.unshift(commandToRow(existing, existing.selected != null ? Boolean(existing.selected) : true));
  }
  return rows;
}

function resetProjectForm() {
  setupEditingIndex = null;
  setupScriptRows = [];
  setupFormTitle.textContent = "Add a project";
  setupCommitProject.textContent = "Add to list";
  setupPath.value = "";
  setupId.value = "";
  setupName.value = "";
  setupRole.value = "";
  setupHealthPort.value = "";
  setupTestKind.value = "jest";
  setProbeStatus(setupPathStatus, true, "");
  renderSetupScripts();
}

function openProjectForm(index = null) {
  setupProjectForm.hidden = false;
  if (index == null) {
    resetProjectForm();
    setupPath.focus();
    return;
  }
  const project = setupDraft.projects[index];
  setupEditingIndex = index;
  setupFormTitle.textContent = `Edit ${project.name || project.id}`;
  setupCommitProject.textContent = "Update project";
  setupPath.value = project.path || "";
  setupId.value = project.id || "";
  setupName.value = project.name || "";
  setupRole.value = project.role || "";
  setupHealthPort.value = project.health?.port ?? "";
  setupTestKind.value = project.testKind === "maven" ? "maven" : "jest";
  setupScriptRows = (project.commands || []).map((command) => commandToRow(command, true));
  setProbeStatus(setupPathStatus, true, "");
  renderSetupScripts();
  if (setupPath.value.trim()) probeCurrentPath();
}

function collectProjectFromForm() {
  const projectPath = setupPath.value.trim();
  const id = setupId.value.trim();
  const name = setupName.value.trim() || id;
  if (!projectPath) throw new Error("Paste a project path, then Probe.");
  if (!id) throw new Error("Project id is required.");
  const commands = setupScriptRows
    .filter((row) => row.selected)
    .map((row) => {
      const command = {
        script: row.script,
        group: row.group || "tooling",
      };
      if (row.label) command.label = row.label;
      if (row.hint) command.hint = row.hint;
      if (row.longRunning) command.longRunning = true;
      if (row.destructive) command.destructive = true;
      if (row.jestJson) command.jestJson = true;
      if (row.confirmTitle) command.confirmTitle = row.confirmTitle;
      if (row.confirmMessage) command.confirmMessage = row.confirmMessage;
      if (row.interactions === "expo") command.interactions = "expo";
      if (row.argv) command.argv = row.argv;
      return command;
    });
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
    name,
    role: setupRole.value.trim(),
    path: projectPath,
    ports,
    testKind: setupTestKind.value === "maven" ? "maven" : "jest",
    commands,
  };
  if (Number.isFinite(healthPort) && healthPort > 0) {
    project.health = { stack: existing?.health?.stack || name, port: healthPort };
  }
  return project;
}

function commitProjectForm({ reopen = true } = {}) {
  const project = collectProjectFromForm();
  const duplicate = setupDraft.projects.some(
    (item, index) => item.id === project.id && index !== setupEditingIndex
  );
  if (duplicate) throw new Error(`A project with id "${project.id}" already exists.`);
  const wasAdding = setupEditingIndex == null;
  if (wasAdding) setupDraft.projects.push(project);
  else setupDraft.projects[setupEditingIndex] = project;
  renderSetupList();
  if (wasAdding && reopen) openProjectForm();
  else {
    setupProjectForm.hidden = true;
    resetProjectForm();
  }
}

async function probeWorkspaceRoot() {
  const workspaceRoot = setupWorkspaceRoot.value.trim() || ".";
  const result = await requestJson("/api/workspace/probe", {
    method: "POST",
    quiet: true,
    body: { workspaceRoot, path: "." },
  });
  if (!result.ok) {
    setProbeStatus(setupRootStatus, false, result.message);
    return false;
  }
  if (!result.data.exists) {
    setProbeStatus(setupRootStatus, false, `Folder not found: ${result.data.resolved}`);
    return false;
  }
  setProbeStatus(setupRootStatus, true, `Found ${result.data.resolved}`);
  return true;
}

async function probeCurrentPath() {
  const projectPath = setupPath.value.trim();
  if (!projectPath) {
    setProbeStatus(setupPathStatus, false, "Paste a path first.");
    return;
  }
  const result = await requestJson("/api/workspace/probe", {
    method: "POST",
    quiet: true,
    body: { workspaceRoot: setupWorkspaceRoot.value.trim() || ".", path: projectPath },
  });
  if (!result.ok) {
    setProbeStatus(setupPathStatus, false, result.message);
    return;
  }
  const probe = result.data;
  if (!probe.exists) {
    setProbeStatus(setupPathStatus, false, `Folder not found: ${probe.resolved}`);
    return;
  }
  const bits = [`Found ${probe.resolved}`];
  if (probe.hasExpo) bits.push("Expo");
  if (probe.hasMaven) bits.push("Maven");
  setProbeStatus(setupPathStatus, true, bits.join(" · "));
  if (!setupName.value.trim()) setupName.value = probe.name;
  if (!setupId.value.trim()) setupId.value = slugifyId(probe.name);
  if (probe.hasMaven) setupTestKind.value = "maven";
  else if (probe.hasExpo) setupTestKind.value = "jest";
  if (!setupHealthPort.value) {
    if (probe.hasExpo) setupHealthPort.value = String(setupMetroPort.value || 8081);
    else if (probe.hasMaven) setupHealthPort.value = "8080";
    else if ((probe.scripts || []).some((item) => item.script === "dev")) setupHealthPort.value = "3000";
  }
  const existing = setupScriptRows.length
    ? setupScriptRows
    : setupEditingIndex != null
      ? (setupDraft.projects[setupEditingIndex]?.commands || []).map((command) => commandToRow(command, true))
      : [];
  setupScriptRows = mergeScriptRows(probe.scripts || [], existing);
  renderSetupScripts();
}

function applyDraftRootFields() {
  setupDraft.workspaceRoot = setupWorkspaceRoot.value.trim() || ".";
  setupDraft.metroPort = Number(setupMetroPort.value) || 8081;
  setupDraft.expoDevClientScheme = setupExpoScheme.value.trim() || "app";
}

async function openSetup() {
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
  setupEyebrow.textContent = empty ? "First run" : "Workspace";
  setupTitle.textContent = empty ? "Set up overview" : "Edit setup";
  setupLead.textContent = empty
    ? "Point at the folder that holds your projects, then add each repo. You do not need those folders open in the editor."
    : "Change the workspace folder, add or remove projects, or pick different command buttons. Save reloads the dashboard without restarting.";
  setupWorkspaceRoot.value = setupDraft.workspaceRoot || ".";
  setupMetroPort.value = String(setupDraft.metroPort || 8081);
  setupExpoScheme.value = setupDraft.expoDevClientScheme || "app";
  setProbeStatus(setupRootStatus, true, "");
  setupProjectForm.hidden = true;
  resetProjectForm();
  renderSetupList();
  showSetupStep("root");
  setupPanel.hidden = false;
  setupWorkspaceRoot.focus();
}

async function saveSetup() {
  if (!setupDraft) return;
  setSetupError("");
  applyDraftRootFields();
  if (!setupProjectForm.hidden && setupPath.value.trim()) {
    try {
      commitProjectForm({ reopen: false });
    } catch (error) {
      setSetupError(error.message);
      return;
    }
  }
  const result = await requestJson("/api/workspace", {
    method: "PUT",
    quiet: true,
    body: setupDraft,
  });
  if (!result.ok) {
    setSetupError(result.message);
    return;
  }
  closeSetup();
  await fetchStatus();
}

editSetupBtn.addEventListener("click", () => {
  openSetup();
});
setupClose.addEventListener("click", closeSetup);
setupCheckRoot.addEventListener("click", async () => {
  setSetupError("");
  await probeWorkspaceRoot();
});
setupContinue.addEventListener("click", async () => {
  setSetupError("");
  applyDraftRootFields();
  const ok = await probeWorkspaceRoot();
  if (!ok) return;
  renderSetupList();
  showSetupStep("projects");
  if (!setupDraft.projects.length) openProjectForm();
});
setupBackRoot.addEventListener("click", () => {
  setSetupError("");
  showSetupStep("root");
});
setupAddProject.addEventListener("click", () => {
  setSetupError("");
  openProjectForm();
});
setupProbe.addEventListener("click", async () => {
  setSetupError("");
  await probeCurrentPath();
});
setupCancelForm.addEventListener("click", () => {
  setupProjectForm.hidden = true;
  resetProjectForm();
});
setupCommitProject.addEventListener("click", () => {
  setSetupError("");
  try {
    commitProjectForm();
  } catch (error) {
    setSetupError(error.message);
  }
});
setupSave.addEventListener("click", () => {
  saveSetup();
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
    onConfirm: () => {
      setupDraft.projects.splice(index, 1);
      if (setupEditingIndex === index) {
        setupProjectForm.hidden = true;
        resetProjectForm();
      } else if (setupEditingIndex > index) {
        setupEditingIndex -= 1;
      }
      renderSetupList();
    },
  });
});
setupScripts.addEventListener("change", (event) => {
  const check = event.target.closest("[data-script-check]");
  if (check) {
    setupScriptRows[Number(check.dataset.scriptCheck)].selected = check.checked;
    return;
  }
  const group = event.target.closest("[data-script-group]");
  if (group) {
    const row = setupScriptRows[Number(group.dataset.scriptGroup)];
    row.group = group.value;
    row.jestJson = group.value === "test";
    return;
  }
  const longRunning = event.target.closest("[data-script-long]");
  if (longRunning) {
    setupScriptRows[Number(longRunning.dataset.scriptLong)].longRunning = longRunning.checked;
    return;
  }
  const expo = event.target.closest("[data-script-expo]");
  if (expo) {
    setupScriptRows[Number(expo.dataset.scriptExpo)].interactions = expo.checked ? "expo" : "";
  }
});

/** SSE: `status` redraws the page, `job` updates chrome, `log` appends output. */
function connectEvents() {
  const source = new EventSource("/api/events");
  source.addEventListener("status", (event) => {
    statusData = JSON.parse(event.data);
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
    updateLogChrome();
  });
  source.addEventListener("log", (event) => {
    const entry = JSON.parse(event.data);
    // Only follow the selected job; if none is selected, attach to the first log.
    if (entry.id !== selectedJobId) {
      if (!selectedJobId) selectedJobId = entry.id;
      else return;
    }
    if (selectedJobId === entry.id) {
      appendLogLine(entry.stream, entry.text);
      updateLogChrome();
    }
  });
  source.onerror = () => {
    // EventSource reconnects automatically
  };
}

fetchStatus()
  .then(async () => {
    // After refresh, resume the most recently started still-running job.
    const running = (statusData.jobs ?? [])
      .filter((job) => job.status === "running")
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    if (running[0]) {
      selectedJobId = running[0].id;
      await loadLogs(selectedJobId);
      updateLogChrome();
    }
    connectEvents();
    if (statusData.needsSetup) await openSetup();
  })
  .catch((error) => {
    logPanel.textContent = `Failed to load overview status: ${error.message}`;
  });

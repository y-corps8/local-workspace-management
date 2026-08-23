import { els } from "./dom.js";
import { commandById, state } from "./state.js";
import { hooks } from "./hooks.js";
import {
  cardAvailabilityWarning,
  chipClass,
  chipLabel,
  clampPct,
  dashboardRepos,
  escapeHtml,
  formatDuration,
  formatTime,
  groupLabel,
  orderGroups,
  passRate,
  projectFilterHit,
  ringTone,
  unavailableHint,
} from "./util.js";

function testRingCopy({ passPct, coveragePct, status, passed, total }) {
  const passText =
    status === "no_report" || passPct == null
      ? "No test run yet."
      : `${Math.round(passPct)}% — ${passed ?? 0} of ${total ?? 0} tests passed.`;
  const coverText =
    coveragePct == null
      ? "Line coverage is not in this report."
      : `${coveragePct.toFixed(1)}% of source lines covered.`;
  return { passText, coverText };
}

function renderProgressRing({ passPct, coveragePct, status, passed, total }) {
  const running = status === "running";
  const noReport = status === "no_report";
  const tone = running ? "run" : noReport ? "idle" : ringTone(status);
  const center = running ? "…" : passPct == null ? "—" : `${Math.round(passPct)}%`;
  const caption = running ? "pass" : noReport ? "none" : ringTone(status);
  const { passText, coverText } = testRingCopy({ passPct, coveragePct, status, passed, total });
  return `
    <div class="ring-wrap ring-${tone} ${status === "running" ? "is-running" : ""}">
      <div class="ring-donut" aria-hidden="true"></div>
      <div class="ring-center">
        <span class="ring-pct">${center}</span>
        <span class="ring-caption">${caption}</span>
      </div>
      <div class="hover-tip" role="tooltip">
        <p><strong>Pass rate</strong> (the number) — ${escapeHtml(passText)}</p>
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

function shortHealthLabel(name) {
  const first = String(name || "")
    .trim()
    .split(/\s+/)[0] || "";
  if (first.length <= 18) return first;
  return `${first.slice(0, 18)}…`;
}

function gitLine(repo) {
  const branch = String(repo.git?.branch || "").trim();
  if (!branch || branch === "unknown" || branch === "missing") return "";
  const text = repo.git?.dirty ? `${branch} · dirty` : branch;
  return `<p class="project-git">${escapeHtml(text)}</p>`;
}

export function renderHealth() {
  const hidden = new Set((state.statusData.repos ?? []).filter((repo) => repo.hidden).map((repo) => repo.id));
  const items = (state.statusData.health ?? []).filter((item) => !hidden.has(item.repo || item.id));
  if (!items.length) {
    els.healthEl.innerHTML = "";
    return;
  }
  els.healthEl.innerHTML = items
    .map((item) => {
      const name = item.label || item.stack || item.repo || item.id;
      const repoId = item.repo || item.id;
      const reason = item.reason || (item.up ? "port" : "down");
      const statusWord = reason === "job" ? "Running" : reason === "port" ? "Port open" : "Idle";
      const dotClass = reason === "job" ? "dot-running" : reason === "port" ? "dot-port" : "dot-idle";
      const detail =
        reason === "job"
          ? "Running — a long-running command from this dashboard is running."
          : reason === "port"
            ? "Port open — the port was open on the last check, with no long-running command from this dashboard."
            : "Idle — no long-running command from this dashboard, and the port was closed on the last check. Refresh, save setup, or reload for a new TCP check.";
      return `
      <button type="button" class="health-pill" data-health-repo="${escapeHtml(repoId)}" aria-label="${escapeHtml(`${name}, ${statusWord}`)}">
        <span class="dot ${dotClass}" aria-hidden="true"></span>
        <span class="label">${escapeHtml(shortHealthLabel(name))}</span>
        <span class="hover-tip" role="tooltip">
          ${escapeHtml(item.stack || name)} · :${item.port} · ${statusWord} · ${escapeHtml(detail)}
        </span>
      </button>`;
    })
    .join("");
}

export function formatCheckedAgo(iso) {
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

export function renderHealthChecked() {
  if (!els.healthCheckedEl) return;
  const hasProjects = (state.statusData?.repos ?? []).length > 0;
  const label = formatCheckedAgo(state.statusData?.generatedAt);
  els.healthCheckedEl.hidden = !hasProjects || !label;
  els.healthCheckedEl.textContent = hasProjects ? label : "";
}

function testHasSignal(repo) {
  const runningTest = (repo.running ?? []).some((job) => commandById(job.id)?.group === "test");
  if (runningTest) return true;
  const status = repo.lastTest?.status;
  return Boolean(status) && status !== "no_report";
}

export function renderTests() {
  const repos = dashboardRepos(state.statusData?.repos);
  if (!repos.length) {
    els.testEl.innerHTML = `<p class="test-empty">${
      (state.statusData.repos ?? []).length
        ? "Unhide a project in Settings to see last test runs."
        : "Add a project to get started"
    }</p>`;
    return;
  }
  const signaled = repos.filter(testHasSignal);
  if (!signaled.length) {
    els.testEl.innerHTML = `<p class="test-empty">No report yet — run a test command from a project card.</p>`;
    return;
  }
  els.testEl.innerHTML = signaled
    .map((repo) => {
      const runningTest = (repo.running ?? []).some((job) => commandById(job.id)?.group === "test");
      const report = repo.lastTest ?? {};
      const status = runningTest ? "running" : report.status || "no_report";
      const coveragePct = clampPct(report.coveragePct);
      const ringArgs = {
        passPct: passRate(report),
        coveragePct,
        status,
        passed: report.passed,
        total: report.total,
      };
      const ring = renderProgressRing(ringArgs);
      const { passText, coverText } = testRingCopy(ringArgs);
      const hiddenCopy = `<span class="visually-hidden">${escapeHtml(passText)} ${escapeHtml(coverText)}</span>`;
      const failed = (report.failedNames ?? [])
        .slice(0, 8)
        .map((name) => `<li>${escapeHtml(name)}</li>`)
        .join("");
      return `
        <article class="test-card" data-test-repo="${escapeHtml(repo.id)}">
          ${ring}
          <div class="test-card-copy">
            <div class="test-card-head">
              <h3>${escapeHtml(repo.name)}</h3>
              <span class="${chipClass(status)}">${chipLabel(status)}</span>
              ${hiddenCopy}
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

export function renderProjects() {
  const commands = state.statusData.commands ?? [];
  const allRepos = state.statusData.repos ?? [];
  const repos = dashboardRepos(allRepos);
  const noneConfigured = !allRepos.length;
  const noneVisible = !repos.length;
  const query = state.projectFilter || "";
  const hits = repos.map((repo) => {
    const repoCommands = commands.filter((command) => command.repo === repo.id);
    return { repo, repoCommands, match: projectFilterHit(repo, repoCommands, query) };
  });
  const matched = query ? hits.filter((item) => item.match.card) : hits;
  const noFilterMatch = Boolean(query) && !noneVisible && !matched.length;
  if (els.projectFilter) {
    els.projectFilter.hidden = noneConfigured || noneVisible;
    if (els.projectFilterWrap) els.projectFilterWrap.hidden = noneConfigured || noneVisible;
  }
  els.addProjectBtn.hidden = noneConfigured;
  els.addProjectEmptyBtn.hidden = !noneConfigured || noFilterMatch;
  if (noneVisible || noFilterMatch) {
    els.projectEl.hidden = true;
    els.projectsEmptyEl.hidden = false;
    els.projectEl.innerHTML = "";
    if (noFilterMatch) {
      els.projectsEmptyTitle.textContent = "No projects match";
      els.projectsEmptyCopy.textContent = "Clear the filter to see every card again.";
    } else if (noneConfigured) {
      els.projectsEmptyTitle.textContent = "No projects yet";
      els.projectsEmptyCopy.textContent = "Add a repo to run commands from this dashboard.";
    } else {
      els.projectsEmptyTitle.textContent = "No projects on the dashboard";
      els.projectsEmptyCopy.textContent = "Unhide a project in Settings to show it here.";
    }
    return;
  }
  els.projectEl.hidden = false;
  els.projectsEmptyEl.hidden = true;
  els.projectEl.innerHTML = matched
    .map(({ repo, repoCommands, match }) => {
      const groups = orderGroups(repoCommands)
        .map((group) => ({
          group,
          label: groupLabel(group),
          items: repoCommands.filter((command) => command.group === group),
        }))
        .filter((entry) => entry.items.length);
      const runningIds = new Set((repo.running ?? []).map((job) => job.id));
      const repoHasPrimary = repoCommands.some((command) => command.primary);
      const groupHtml = groups
        .map((entry) => {
          const buttons = entry.items
            .map((command) => {
              const running = runningIds.has(command.id);
              const blocked = !running && command.available === false;
              const gold = repoHasPrimary ? Boolean(command.primary) : entry.group === "run";
              const cls = [
                "btn",
                "cmd-btn",
                gold && !command.destructive && !running && !blocked ? "btn-primary" : "",
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
      const runningCount = (repo.running ?? []).length;
      const chipText = runningCount > 1 ? `${runningCount} running` : runningCount === 1 ? "Running" : "Idle";
      const missingPath = repo.exists === false;
      const warning = cardAvailabilityWarning(repo, repoCommands);
      const description = String(repo.description || "").trim();
      const flash = state.healthFlashRepoId === repo.id ? " is-flash" : "";

      return `
        <article class="project-card${missingPath ? " is-missing-path" : ""}${busy ? " is-running" : ""}${flash}" data-repo="${escapeHtml(repo.id)}">
          <div class="project-head">
            <div class="project-head-title">
              <span class="drag-handle" data-card-drag="${escapeHtml(repo.id)}" draggable="true" role="button" tabindex="0" aria-label="Reorder ${escapeHtml(repo.name)}"></span>
              <h3>${escapeHtml(repo.name)}</h3>
            </div>
            <div class="project-head-end">
              <span class="${busy ? "chip chip-run" : "chip chip-idle"}">${chipText}</span>
              <div class="card-menu">
                <button type="button" class="card-menu-btn" data-card-menu="${escapeHtml(repo.id)}" aria-label="Project actions for ${escapeHtml(repo.name)}" aria-expanded="false" aria-haspopup="true">⋯</button>
                <div class="card-menu-pop" hidden>
                  <button type="button" data-card-edit="${escapeHtml(repo.id)}">Edit</button>
                  <button type="button" class="is-danger" data-card-delete="${escapeHtml(repo.id)}">Delete</button>
                </div>
              </div>
            </div>
          </div>
          ${gitLine(repo)}
          ${description ? `<p class="description">${escapeHtml(description)}</p>` : ""}
          ${warning ? `<p class="project-warn">${escapeHtml(warning)}</p>` : ""}
          ${groupHtml}
        </article>`;
    })
    .join("");
}

function syncStartPrimaries() {
  if (!els.startPrimaries) return;
  const commands = state.statusData?.commands ?? [];
  const visible = new Set(dashboardRepos(state.statusData?.repos).map((repo) => repo.id));
  const running = new Set(
    (state.statusData?.jobs ?? []).filter((job) => job.status === "running").map((job) => job.id)
  );
  const idle = commands.filter(
    (command) => command.primary && visible.has(command.repo) && !running.has(command.id) && command.available !== false
  );
  els.startPrimaries.hidden = idle.length === 0;
}

export function render() {
  if (!state.statusData) return;
  renderHealth();
  renderHealthChecked();
  const showTests = Boolean(state.statusData.showTestOverview);
  els.testOverviewEl.hidden = !showTests;
  if (showTests) renderTests();
  else els.testEl.replaceChildren();
  renderProjects();
  syncStartPrimaries();
  const hasProjects = (state.statusData.repos ?? []).length > 0;
  if (els.healthRefreshWrap) els.healthRefreshWrap.hidden = !hasProjects;
  hooks.updateLogChrome();
}

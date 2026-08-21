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
  ringTone,
  unavailableHint,
} from "./util.js";

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
  els.testEl.innerHTML = repos
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

export function renderProjects() {
  const commands = state.statusData.commands ?? [];
  const allRepos = state.statusData.repos ?? [];
  const repos = dashboardRepos(allRepos);
  const noneConfigured = !allRepos.length;
  const noneVisible = !repos.length;
  els.projectEl.hidden = noneVisible;
  els.projectsEmptyEl.hidden = !noneVisible;
  els.addProjectBtn.hidden = noneConfigured;
  els.addProjectEmptyBtn.hidden = !noneConfigured;
  if (noneVisible) {
    els.projectEl.innerHTML = "";
    if (noneConfigured) {
      els.projectsEmptyTitle.textContent = "No projects yet";
      els.projectsEmptyCopy.textContent = "Add a repo to run allowlisted commands from this dashboard.";
    } else {
      els.projectsEmptyTitle.textContent = "No projects on the dashboard";
      els.projectsEmptyCopy.textContent = "Unhide a project in Settings to show it here.";
    }
    return;
  }
  els.projectEl.innerHTML = repos
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

export function render() {
  if (!state.statusData) return;
  renderHealth();
  renderHealthChecked();
  const showTests = Boolean(state.statusData.showTestOverview);
  els.testOverviewEl.hidden = !showTests;
  if (showTests) renderTests();
  else els.testEl.replaceChildren();
  renderProjects();
  const hasProjects = (state.statusData.repos ?? []).length > 0;
  if (els.healthRefreshWrap) els.healthRefreshWrap.hidden = !hasProjects;
  hooks.updateLogChrome();
}

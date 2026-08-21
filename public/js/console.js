import { postJson } from "./api.js";
import { els } from "./dom.js";
import { hooks } from "./hooks.js";
import { commandById, jobById, runningJobs, state, visibleJobs } from "./state.js";
import {
  CONSOLE_MIN_PX,
  escapeHtml,
  persistConsoleCollapsed,
  persistConsoleHeight,
  readStoredConsoleHeight,
} from "./util.js";

function jobTabName(job) {
  const repo = (state.statusData?.repos ?? []).find((item) => item.id === job.repo);
  return `${repo?.name || job.repo} · ${job.label}`;
}

export function renderJobTabs() {
  const jobs = visibleJobs();
  if (!jobs.length) {
    els.jobTabsEl.innerHTML = `<p class="job-tabs-empty">No command yet</p>`;
    return;
  }
  els.jobTabsEl.innerHTML = jobs
    .map((job) => {
      const active = job.id === state.selectedJobId ? " is-active" : "";
      const done = job.status !== "running" ? " is-done" : "";
      const waiting = job.status === "running" && job.prompt ? " is-waiting" : "";
      const name = jobTabName(job);
      const waitLabel = waiting ? " (waiting for input)" : "";
      return `<div class="job-tab${active}${done}${waiting}" role="tab" aria-selected="${
        job.id === state.selectedJobId
      }">
        <button type="button" class="job-tab-label" data-job-id="${escapeHtml(job.id)}" aria-label="${escapeHtml(name + waitLabel)}">${escapeHtml(name)}</button>
        <button type="button" class="job-tab-close" data-job-close="${escapeHtml(job.id)}" aria-label="Close ${escapeHtml(name)}">×</button>
      </div>`;
    })
    .join("");
}

export function dismissJobTab(id) {
  state.dismissedJobIds.add(id);
  if (state.selectedJobId !== id) {
    renderJobTabs();
    return;
  }
  const next = visibleJobs()[0];
  if (next) {
    hooks.selectJob(next.id);
    return;
  }
  state.selectedJobId = null;
  state.pendingLogEntries.length = 0;
  els.logPanel.replaceChildren();
  state.lastInteractionKey = "";
  state.lastPromptKey = "";
  updateLogChrome();
}

function selectedJobPrompt() {
  const job = state.selectedJobId ? jobById(state.selectedJobId) : null;
  if (!job || job.status !== "running") return null;
  return job.prompt ?? null;
}

export function renderLogPrompt() {
  const prompt = selectedJobPrompt();
  const key = prompt
    ? `${state.selectedJobId}:${prompt.kind}:${prompt.question}:${(prompt.options || []).map((item) => item.id).join(",")}`
    : "";
  if (key === state.lastPromptKey) return;
  state.lastPromptKey = key;
  if (!els.logPromptOverlay) return;
  if (!prompt) {
    els.logPromptOverlay.hidden = true;
    els.logOutput?.classList.remove("has-prompt");
    if (els.logPromptQuestion) els.logPromptQuestion.textContent = "";
    els.logPromptActions?.replaceChildren();
    return;
  }
  els.logOutput?.classList.add("has-prompt");
  els.logPromptOverlay.hidden = false;
  if (els.logPromptQuestion) els.logPromptQuestion.textContent = prompt.question || "Waiting for a choice";
  if (els.logPromptActions) {
    els.logPromptActions.innerHTML = (prompt.options || [])
      .map(
        (item) =>
          `<button type="button" class="btn btn-compact" data-stdin="${escapeHtml(item.value)}">${escapeHtml(item.label)}</button>`
      )
      .join("");
  }
}

export function renderLogInteractions() {
  const job = state.selectedJobId ? jobById(state.selectedJobId) : null;
  const command = job && job.status === "running" ? commandById(job.id) : null;
  const items = command?.interactions ?? [];
  const key = items.length ? `${command.id}:${items.map((item) => item.id).join(",")}` : "";
  if (key === state.lastInteractionKey) return;
  state.lastInteractionKey = key;
  if (!items.length) {
    els.logInteractions.hidden = true;
    els.logInteractions.replaceChildren();
    return;
  }
  els.logInteractions.hidden = false;
  els.logInteractions.innerHTML = items
    .map(
      (item) => `<span class="cmd-wrap">
        <button type="button" class="btn btn-compact btn-action" data-action="interact" data-id="${escapeHtml(command.id)}" data-interact="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>
        <div class="hover-tip" role="tooltip">${escapeHtml(item.hint || item.label)}</div>
      </span>`
    )
    .join("");
}

export function applyOutputCollapsed() {
  els.logSection?.classList.toggle("is-collapsed", state.outputCollapsed);
  if (!els.logCollapse) return;
  els.logCollapse.setAttribute("aria-expanded", state.outputCollapsed ? "false" : "true");
  els.logCollapse.setAttribute("aria-label", state.outputCollapsed ? "Show console" : "Minimize console");
}

export function updateLogChrome() {
  const running = runningJobs();
  if (state.selectedJobId && (state.dismissedJobIds.has(state.selectedJobId) || !jobById(state.selectedJobId))) {
    const next = visibleJobs()[0];
    if (next) {
      state.selectedJobId = next.id;
      state.stickToBottom = true;
      hooks.loadLogs(next.id);
    } else {
      state.selectedJobId = null;
      state.pendingLogEntries.length = 0;
      els.logPanel.replaceChildren();
      state.lastInteractionKey = "";
      state.lastPromptKey = "";
    }
  }
  const job = state.selectedJobId ? jobById(state.selectedJobId) : null;
  els.logToolbar.hidden = !job;
  els.logStop.hidden = !(job && job.status === "running");
  if (els.logRestart) els.logRestart.hidden = !(job && job.status === "running");
  els.logStopAll.hidden = running.length < 2;
  els.logSection?.classList.toggle("has-running", running.length > 0);
  applyOutputCollapsed();
  renderJobTabs();
  renderLogInteractions();
  renderLogPrompt();
}

export function toggleOutputCollapsed() {
  state.outputCollapsed = !state.outputCollapsed;
  persistConsoleCollapsed(state.outputCollapsed);
  state.consoleDefaultApplied = true;
  applyOutputCollapsed();
  if (!state.outputCollapsed && state.selectedJobId) hooks.loadLogs(state.selectedJobId);
}

export function syncConsoleCollapsedDefault() {
  if (state.consoleDefaultApplied) return;
  state.consoleDefaultApplied = true;
  const hasJobs = visibleJobs().length > 0;
  state.outputCollapsed = !hasJobs;
  applyOutputCollapsed();
}

export function expandOutput() {
  if (!state.outputCollapsed) return;
  state.outputCollapsed = false;
  applyOutputCollapsed();
}

export async function stopAllCommands() {
  await Promise.all(runningJobs().map((job) => hooks.stopCommand(job.id)));
}

export async function selectJob(id) {
  state.dismissedJobIds.delete(id);
  state.selectedJobId = id;
  state.stickToBottom = true;
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
  const query = String(els.logFilter?.value || "").trim().toLowerCase();
  if (!query) return true;
  return String(text).toLowerCase().includes(query);
}

export function applyLogFilter() {
  const query = String(els.logFilter?.value || "").trim().toLowerCase();
  els.logPanel.querySelectorAll("[data-log-text]").forEach((line) => {
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

function createLogLineEl(stream, text, { at, live } = {}) {
  const line = document.createElement("div");
  line.className = logLineClass(stream, text);
  const body = String(text).endsWith("\n") ? String(text).slice(0, -1) : String(text);
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
  return line;
}

function scheduleLogPaint() {
  if (state.logPaintFrame) return;
  state.logPaintFrame = requestAnimationFrame(flushLogPaint);
}

export function flushLogPaint() {
  state.logPaintFrame = 0;
  if (state.outputCollapsed) {
    state.pendingLogEntries.length = 0;
    return;
  }
  if (!state.pendingLogEntries.length || !els.logPanel) return;
  const batch = state.pendingLogEntries.splice(0);
  const fragment = document.createDocumentFragment();
  let last = els.logPanel.lastElementChild;

  function dropLast() {
    if (last && last.parentNode === fragment) {
      fragment.removeChild(last);
      last = fragment.lastElementChild || els.logPanel.lastElementChild;
      return;
    }
    if (last && last.parentNode === els.logPanel) {
      last.remove();
      last = els.logPanel.lastElementChild;
    }
  }

  for (const entry of batch) {
    if (entry?.text == null) continue;
    if (last?.dataset?.live === "1") dropLast();
    if (entry.replace && !entry.live && last) dropLast();
    const line = createLogLineEl(entry.stream, entry.text, entry);
    fragment.appendChild(line);
    last = line;
  }
  if (fragment.childNodes.length) els.logPanel.appendChild(fragment);
  if (state.stickToBottom) els.logPanel.scrollTop = els.logPanel.scrollHeight;
}

export function appendLogLine(stream, text, { at, replace, live } = {}) {
  if (state.outputCollapsed) return;
  state.pendingLogEntries.push({ stream, text, at, replace, live });
  scheduleLogPaint();
}

export function appendLogLines(items) {
  if (state.outputCollapsed || !items?.length) return;
  for (const item of items) {
    if (item?.text == null) continue;
    state.pendingLogEntries.push(item);
  }
  scheduleLogPaint();
}

export function logItemsFromPayload(entry) {
  if (Array.isArray(entry.lines) && entry.lines.length) return entry.lines;
  if (entry.text != null) return [entry];
  return [];
}

export async function loadLogs(id) {
  const res = await fetch(`/api/logs/${encodeURIComponent(id)}`);
  if (!res.ok) return;
  const data = await res.json();
  state.pendingLogEntries.length = 0;
  if (state.logPaintFrame) {
    cancelAnimationFrame(state.logPaintFrame);
    state.logPaintFrame = 0;
  }
  els.logPanel.replaceChildren();
  const items = [...(data.logs ?? [])];
  if (data.partial) {
    items.push({ stream: "stdout", text: data.partial, live: true });
  }
  appendLogLines(items);
  flushLogPaint();
  if (data.prompt && state.selectedJobId) {
    const job = jobById(state.selectedJobId);
    if (job) job.prompt = data.prompt;
  }
  state.lastPromptKey = "";
  renderLogPrompt();
  state.stickToBottom = true;
  els.logPanel.scrollTop = els.logPanel.scrollHeight;
}

function consoleMaxPx() {
  return Math.max(CONSOLE_MIN_PX, Math.round(window.innerHeight * 0.7));
}

export function applyConsoleHeight(px, persist = false) {
  const clamped = Math.max(CONSOLE_MIN_PX, Math.min(consoleMaxPx(), Math.round(px)));
  els.layoutEl?.style.setProperty("--console-height", `${clamped}px`);
  if (persist) persistConsoleHeight(clamped);
  return clamped;
}

export function bindConsoleResize() {
  if (!els.logResize || !els.logSection || !els.layoutEl) return;
  const storedHeight = readStoredConsoleHeight();
  if (storedHeight) applyConsoleHeight(storedHeight);

  let dragging = false;
  let startY = 0;
  let startHeight = 0;

  const currentHeight = () =>
    Number.parseFloat(els.layoutEl.style.getPropertyValue("--console-height")) ||
    els.logSection.getBoundingClientRect().height;

  const stopResize = (event) => {
    if (!dragging) return;
    dragging = false;
    els.layoutEl.classList.remove("is-resizing-console");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    if (event?.pointerId != null) {
      try {
        els.logResize.releasePointerCapture(event.pointerId);
      } catch {
        // capture already released
      }
    }
    const height = Number.parseFloat(els.layoutEl.style.getPropertyValue("--console-height"));
    if (Number.isFinite(height)) persistConsoleHeight(height);
  };

  const onMove = (event) => {
    if (!dragging) return;
    if (event.buttons !== 1) {
      stopResize(event);
      return;
    }
    applyConsoleHeight(startHeight + (startY - event.clientY));
  };

  const onUp = (event) => {
    stopResize(event);
  };

  els.logResize.addEventListener("pointerdown", (event) => {
    if (state.outputCollapsed || event.button !== 0) return;
    dragging = true;
    startY = event.clientY;
    startHeight = currentHeight();
    els.layoutEl.classList.add("is-resizing-console");
    try {
      els.logResize.setPointerCapture(event.pointerId);
    } catch {
      // WebView may omit capture; window listeners still end the drag
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    event.preventDefault();
  });
  els.logResize.addEventListener("lostpointercapture", onUp);
  els.logResize.addEventListener("keydown", (event) => {
    if (state.outputCollapsed) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    applyConsoleHeight(currentHeight() + (event.key === "ArrowUp" ? 24 : -24), true);
  });

  window.addEventListener("resize", () => {
    if (state.outputCollapsed) return;
    const current = Number.parseFloat(els.layoutEl.style.getPropertyValue("--console-height"));
    if (Number.isFinite(current)) applyConsoleHeight(current);
  });
}

export function bindConsole() {
  bindConsoleResize();
  applyOutputCollapsed();

  els.jobTabsEl.addEventListener("click", (event) => {
    const close = event.target.closest("[data-job-close]");
    if (close) {
      dismissJobTab(close.dataset.jobClose);
      return;
    }
    const tab = event.target.closest("[data-job-id]");
    if (!tab) return;
    selectJob(tab.dataset.jobId);
  });

  els.logStop.addEventListener("click", () => {
    if (state.selectedJobId) hooks.stopCommand(state.selectedJobId);
  });

  els.logRestart?.addEventListener("click", () => {
    if (state.selectedJobId) postJson("/api/restart", { id: state.selectedJobId });
  });

  els.logStopAll.addEventListener("click", () => {
    stopAllCommands();
  });

  els.logCollapse.addEventListener("click", () => {
    toggleOutputCollapsed();
  });

  els.logInteractions.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-interact]");
    if (!button) return;
    hooks.interactCommand(button.dataset.id, button.dataset.interact);
  });

  els.logPromptActions?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-stdin]");
    if (!button || !state.selectedJobId) return;
    hooks.sendJobStdin(state.selectedJobId, button.dataset.stdin ?? "");
  });

  els.logClear.addEventListener("click", async () => {
    state.pendingLogEntries.length = 0;
    els.logPanel.replaceChildren();
    if (state.selectedJobId) {
      await postJson("/api/logs/clear", { id: state.selectedJobId }, { quiet: true });
    }
  });

  els.logFilter?.addEventListener("input", () => {
    applyLogFilter();
  });

  els.logPanel.addEventListener("scroll", () => {
    const distance = els.logPanel.scrollHeight - els.logPanel.scrollTop - els.logPanel.clientHeight;
    state.stickToBottom = distance < 24;
  });
}

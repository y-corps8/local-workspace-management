/**
 * Overview dashboard UI.
 *
 * Loads GET /api/status, then stays current via EventSource /api/events
 * (status, job, log, health). Buttons POST only a command id to /api/run or /api/stop,
 * or { id, action } to /api/interact for live Expo keys. Prompt replies use
 * POST /api/stdin { id, text } from the log overlay — there is no typed stdin line.
 */
import { postJson, requestJson } from "./js/api.js";
import {
  appendLogLine,
  appendLogLines,
  bindConsole,
  expandOutput,
  loadLogs,
  logItemsFromPayload,
  selectJob,
  syncConsoleCollapsedDefault,
  updateLogChrome,
} from "./js/console.js";
import { els } from "./js/dom.js";
import { hooks } from "./js/hooks.js";
import { render, renderHealth, renderHealthChecked, renderProjects } from "./js/render.js";
import {
  cloneWorkspace,
  closeSetup,
  openProjectForm,
  openSetup,
  persistSetupOrder,
  persistWorkspace,
  bindSetup,
} from "./js/setup.js";
import {
  commandById,
  jobById,
  runningIdsKey,
  state,
  storedCollapsedPrefValue,
  syncRepoRunningFromJobs,
} from "./js/state.js";
import { applyTheme } from "./js/theme.js";
import {
  clearDragStyles,
  dashboardRepos,
  moveItem,
  readStoredTheme,
  weaveVisibleIds,
} from "./js/util.js";

applyTheme(readStoredTheme());

Object.assign(hooks, {
  render,
  fetchStatus,
  loadLogs,
  appendLogLine,
  appendLogLines,
  updateLogChrome,
  selectJob,
  runCommand,
  stopCommand,
  interactCommand,
  sendJobStdin,
  openSetup,
  openProjectForm,
  persistSetupOrder,
  expandOutput,
  openConfirm,
});

async function fetchStatus() {
  const res = await fetch("/api/status");
  if (!res.ok) throw new Error(`status ${res.status}`);
  state.statusData = await res.json();
  render();
}

async function runCommand(id) {
  const command = commandById(id);
  if (command?.available === false) return;
  state.dismissedJobIds.delete(id);
  const existing = jobById(id);
  if (existing?.status === "running") {
    await selectJob(id);
    return;
  }
  state.selectedJobId = id;
  state.pendingLogEntries.length = 0;
  els.logPanel.replaceChildren();
  state.stickToBottom = true;
  expandOutput();
  updateLogChrome();
  const result = await postJson("/api/run", { id });
  if (result?.job) {
    state.selectedJobId = result.job.id;
    updateLogChrome();
  }
}

async function stopCommand(id) {
  await postJson("/api/stop", { id });
}

async function interactCommand(id, action) {
  if (id !== state.selectedJobId) {
    await selectJob(id);
  }
  await postJson("/api/interact", { id, action }, { quiet: true });
}

async function sendJobStdin(id, text) {
  await postJson("/api/stdin", { id, text });
}

function openConfirm({ title, message, okLabel = "Run", onConfirm }) {
  state.confirmAction = onConfirm;
  els.confirmTitle.textContent = title;
  els.confirmMessage.textContent = message;
  els.confirmOk.textContent = okLabel;
  els.confirmModal.hidden = false;
  els.confirmOk.focus();
}

function closeConfirm() {
  state.confirmAction = null;
  els.confirmModal.hidden = true;
  els.confirmOk.textContent = "Run";
}

function closeCardMenu() {
  els.projectEl.querySelectorAll(".card-menu-pop").forEach((pop) => {
    pop.hidden = true;
  });
  els.projectEl.querySelectorAll("[data-card-menu]").forEach((btn) => {
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
  const index = (state.setupDraft?.projects ?? []).findIndex((project) => project.id === repoId);
  if (index >= 0) openProjectForm(index);
}

async function deleteProjectFromCard(repoId) {
  closeCardMenu();
  const repo = (state.statusData?.repos ?? []).find((item) => item.id === repoId);
  const name = repo?.name || repoId;
  openConfirm({
    title: "Remove project?",
    message: `Remove ${name} from overview? This does not delete the folder.`,
    okLabel: "Remove",
    onConfirm: async () => {
      if (!state.setupDraft) {
        const result = await requestJson("/api/workspace", { quiet: true });
        if (!result.ok) {
          appendLogLine("stderr", result.message || "Could not load workspace");
          return;
        }
        state.setupDraft = cloneWorkspace(result.data);
        state.setupIsFirstRun = false;
        state.setupAddMode = false;
        els.setupShowTestOverview.checked = Boolean(state.setupDraft.showTestOverview);
      }
      const index = state.setupDraft.projects.findIndex((project) => project.id === repoId);
      if (index < 0) return;
      const [removed] = state.setupDraft.projects.splice(index, 1);
      const ok = await persistWorkspace({ close: true });
      if (!ok) {
        state.setupDraft.projects.splice(index, 0, removed);
        appendLogLine("stderr", els.setupError.textContent || "Could not remove project");
      }
    },
  });
}

async function persistCardOrder(fromId, toId) {
  if (!fromId || fromId === toId) return;
  const all = state.statusData.repos ?? [];
  const visibleIds = dashboardRepos(all).map((repo) => repo.id);
  const nextVisible = moveItem(visibleIds, visibleIds.indexOf(fromId), visibleIds.indexOf(toId));
  const ids = weaveVisibleIds(all, nextVisible);
  const byId = new Map(all.map((repo) => [repo.id, repo]));
  const previous = all.slice();
  state.statusData.repos = ids.map((id) => byId.get(id)).filter(Boolean);
  renderProjects();
  state.persistDrag = true;
  const result = await requestJson("/api/workspace/order", {
    method: "PATCH",
    quiet: true,
    body: { ids },
  });
  state.persistDrag = false;
  state.isDragging = false;
  if (!result.ok) {
    state.statusData.repos = previous;
    renderProjects();
    appendLogLine("stderr", result.message || "Could not save order");
    return;
  }
  await fetchStatus();
}

function connectEvents() {
  const source = new EventSource("/api/events");
  source.addEventListener("status", (event) => {
    state.statusData = JSON.parse(event.data);
    if (state.isDragging) return;
    render();
  });
  source.addEventListener("job", (event) => {
    const job = JSON.parse(event.data);
    if (!state.statusData) return;
    const prevRunning = runningIdsKey(job.repo);
    const jobs = state.statusData.jobs ?? [];
    const index = jobs.findIndex((item) => item.id === job.id);
    if (index >= 0) jobs[index] = job;
    else jobs.push(job);
    state.statusData.jobs = jobs;
    syncRepoRunningFromJobs();
    renderHealth();
    if (!state.isDragging && prevRunning !== runningIdsKey(job.repo)) renderProjects();
    updateLogChrome();
  });
  source.addEventListener("health", (event) => {
    if (!state.statusData) return;
    state.statusData.health = JSON.parse(event.data);
    state.statusData.generatedAt = new Date().toISOString();
    renderHealth();
    renderHealthChecked();
  });
  source.addEventListener("log", (event) => {
    const entry = JSON.parse(event.data);
    if (!entry?.id) return;
    if (state.dismissedJobIds.has(entry.id)) return;
    if (entry.id !== state.selectedJobId) return;
    appendLogLines(logItemsFromPayload(entry));
  });
  source.onerror = () => {
    // EventSource reconnects automatically
  };
}

els.healthRefresh?.addEventListener("click", async () => {
  if (state.healthRefreshBusy || !state.statusData) return;
  state.healthRefreshBusy = true;
  els.healthRefresh.classList.add("is-busy");
  try {
    await fetchStatus();
  } catch {
    // fetchStatus already throws on a failed GET /api/status
  } finally {
    state.healthRefreshBusy = false;
    els.healthRefresh.classList.remove("is-busy");
  }
});

els.projectEl.addEventListener("click", (event) => {
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

els.projectEl.addEventListener("dragstart", (event) => {
  const handle = event.target.closest("[data-card-drag]");
  if (!handle) return;
  state.cardDragId = handle.dataset.cardDrag;
  state.isDragging = true;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", state.cardDragId);
  const card = handle.closest(".project-card");
  card?.classList.add("is-dragging");
  if (card) event.dataTransfer.setDragImage(card, 24, 24);
});

els.projectEl.addEventListener("dragover", (event) => {
  const card = event.target.closest(".project-card");
  if (!card || !state.cardDragId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  els.projectEl.querySelectorAll(".is-drag-over").forEach((el) => el.classList.remove("is-drag-over"));
  if (card.dataset.repo !== state.cardDragId) card.classList.add("is-drag-over");
});

els.projectEl.addEventListener("drop", async (event) => {
  const card = event.target.closest(".project-card");
  if (!card || !state.cardDragId) return;
  event.preventDefault();
  const fromId = state.cardDragId;
  const toId = card.dataset.repo;
  state.persistDrag = true;
  clearDragStyles(els.projectEl);
  state.cardDragId = null;
  if (fromId === toId) {
    state.persistDrag = false;
    state.isDragging = false;
    return;
  }
  await persistCardOrder(fromId, toId);
});

els.projectEl.addEventListener("dragend", () => {
  clearDragStyles(els.projectEl);
  state.cardDragId = null;
  if (!state.persistDrag) state.isDragging = false;
});

els.confirmCancel.addEventListener("click", closeConfirm);
els.confirmModal.addEventListener("click", (event) => {
  if (event.target === els.confirmModal) closeConfirm();
});
els.confirmOk.addEventListener("click", () => {
  const action = state.confirmAction;
  closeConfirm();
  if (action) action();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".card-menu")) closeCardMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    const cardHandle = event.target.closest?.("[data-card-drag]");
    if (cardHandle && els.projectEl.contains(cardHandle)) {
      event.preventDefault();
      const visible = [...els.projectEl.querySelectorAll(".project-card")];
      const fromId = cardHandle.dataset.cardDrag;
      const index = visible.findIndex((card) => card.dataset.repo === fromId);
      const next = event.key === "ArrowUp" ? index - 1 : index + 1;
      if (index < 0 || next < 0 || next >= visible.length) return;
      persistCardOrder(fromId, visible[next].dataset.repo);
      return;
    }
    const setupHandle = event.target.closest?.("[data-setup-drag]");
    if (setupHandle && state.setupDraft) {
      event.preventDefault();
      const from = Number(setupHandle.dataset.setupDrag);
      const to = event.key === "ArrowUp" ? from - 1 : from + 1;
      if (from < 0 || to < 0 || to >= state.setupDraft.projects.length) return;
      persistSetupOrder(from, to);
      return;
    }
  }
  if (event.key !== "Escape") return;
  if (!els.confirmModal.hidden) {
    closeConfirm();
    return;
  }
  const openMenu = els.projectEl.querySelector(".card-menu-pop:not([hidden])");
  if (openMenu) {
    closeCardMenu();
    return;
  }
  if (!els.setupPanel.hidden) closeSetup();
});

bindConsole();
bindSetup();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

fetchStatus()
  .then(async () => {
    syncConsoleCollapsedDefault();
    const running = (state.statusData.jobs ?? [])
      .filter((job) => job.status === "running")
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    if (running[0]) {
      state.selectedJobId = running[0].id;
      await loadLogs(state.selectedJobId);
      if (storedCollapsedPrefValue === null) expandOutput();
      updateLogChrome();
    }
    connectEvents();
  })
  .catch((error) => {
    els.logPanel.textContent = `Failed to load overview status: ${error.message}`;
  });

setInterval(() => {
  renderHealthChecked();
}, 15000);

import { readStoredCollapsed } from "./util.js";

const storedCollapsedPref = readStoredCollapsed();

export const storedCollapsedPrefValue = storedCollapsedPref;

export const state = {
  statusData: null,
  selectedJobId: null,
  dismissedJobIds: new Set(),
  confirmAction: null,
  stickToBottom: true,
  isDragging: false,
  persistDrag: false,
  pendingLogEntries: [],
  logPaintFrame: 0,
  outputCollapsed: storedCollapsedPref ?? true,
  consoleDefaultApplied: storedCollapsedPref !== null,
  lastInteractionKey: "",
  lastPromptKey: "",
  healthRefreshBusy: false,
  cardDragId: null,
  setupDraft: null,
  setupEditingIndex: null,
  setupScriptRows: [],
  setupProbedScheme: "",
  setupAddMode: false,
  setupIsFirstRun: false,
  setupProbeOk: false,
  setupDragIndex: null,
};

export function commandById(id) {
  return state.statusData?.commands?.find((command) => command.id === id) ?? null;
}

export function jobById(id) {
  return state.statusData?.jobs?.find((job) => job.id === id) ?? null;
}

export function runningIdsKey(repoId) {
  return (state.statusData?.jobs ?? [])
    .filter((job) => job.repo === repoId && job.status === "running")
    .map((job) => job.id)
    .sort()
    .join("\n");
}

export function syncRepoRunningFromJobs() {
  const repos = state.statusData?.repos ?? [];
  const jobs = state.statusData?.jobs ?? [];
  for (const repo of repos) {
    repo.running = jobs.filter((job) => job.repo === repo.id && job.status === "running");
  }
}

export function runningJobs() {
  return [...(state.statusData?.jobs ?? [])]
    .filter((job) => job.status === "running")
    .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
}

export function visibleJobs() {
  return [...(state.statusData?.jobs ?? [])]
    .filter((job) => !state.dismissedJobIds.has(job.id))
    .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
}

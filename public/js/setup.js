import { browseIntoInput, requestJson } from "./api.js";
import { formatArgvLine, parseArgvLine } from "./argv.js";
import { els } from "./dom.js";
import { hooks } from "./hooks.js";
import { state } from "./state.js";
import { applyTheme, syncThemeButtons } from "./theme.js";
import {
  clearDragStyles,
  escapeHtml,
  groupLabel,
  lowercaseCommandLabel,
  moveItem,
  normalizeGroup,
  orderGroups,
  slugifyId,
} from "./util.js";

export function cloneWorkspace(raw) {
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
    els.setupError.hidden = true;
    els.setupError.textContent = "";
    return;
  }
  els.setupError.hidden = false;
  els.setupError.textContent = message;
}

function setProbeStatus(el, ok, text) {
  el.hidden = !text;
  el.classList.toggle("is-error", !ok);
  el.textContent = text || "";
}

export function closeSetup() {
  els.setupPanel.hidden = true;
  state.setupDraft = null;
  state.setupEditingIndex = null;
  state.setupScriptRows = [];
  state.setupProbedScheme = "";
  state.setupAddMode = false;
  state.setupIsFirstRun = false;
  els.setupProjectForm.hidden = true;
  els.setupStepProjects.classList.remove("is-form-open");
  if (els.setupStepRoot) els.setupStepRoot.hidden = false;
  setSetupError("");
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
  if (!state.setupScriptRows.length) {
    els.setupScripts.innerHTML = "";
    return;
  }
  els.setupScripts.innerHTML = orderGroups(state.setupScriptRows)
    .map((group) => {
      const items = state.setupScriptRows
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
  return state.setupScriptRows.some((row) => row.selected && row.interactions === "expo");
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
  const showWarning = state.setupProbeOk && !hasPackageJson;
  els.setupNoPkg.hidden = !showWarning;
  els.setupAddCustomWrap.hidden = !state.setupProbeOk;
}

function hasCompleteCommand() {
  let complete = false;
  for (const row of state.setupScriptRows) {
    if (isCustomRow(row)) {
      const rowState = customRowState(row);
      if (rowState.incomplete) return false;
      if (row.selected && !rowState.empty) complete = true;
    } else if (row.selected) {
      complete = true;
    }
  }
  return complete;
}

function syncCommitButton() {
  const hasName = Boolean(els.setupName.value.trim() || els.setupId.value.trim());
  els.setupCommitProject.disabled = !(state.setupProbeOk && hasName && hasCompleteCommand());
}

function syncAppearanceFields() {
  const formOpen = !els.setupProjectForm.hidden;
  if (els.setupAppearanceRow) els.setupAppearanceRow.hidden = formOpen;
  syncThemeButtons();
}

function syncSetupChrome() {
  const formOpen = !els.setupProjectForm.hidden;
  const formLead =
    "Add a repo by folder path, then Probe. You do not need that folder open in the editor.";
  if (!formOpen) {
    els.setupTitle.textContent = "Settings";
    els.setupLead.textContent =
      "Choose light or dark. Add, hide, or reorder projects. Theme stays in this browser; project changes save immediately.";
    return;
  }
  if (state.setupEditingIndex != null) {
    const project = state.setupDraft?.projects?.[state.setupEditingIndex];
    els.setupTitle.textContent = `Edit ${project?.name || project?.id || ""}`.trim();
    els.setupLead.textContent = formLead;
    return;
  }
  els.setupTitle.textContent = "Add a project";
  els.setupLead.textContent = formLead;
}

function syncTestOverviewFields() {
  const formOpen = !els.setupProjectForm.hidden;
  const hideOverview = state.setupIsFirstRun || state.setupAddMode || formOpen;
  els.setupTestOverviewRow.hidden = hideOverview;
  els.setupTestKindField.hidden = true;
  if (hideOverview) {
    if (state.setupIsFirstRun) els.setupShowTestOverview.checked = false;
    return;
  }
  els.setupShowTestOverview.checked = Boolean(state.setupDraft?.showTestOverview);
}

function syncSetupAddButton() {
  const formOpen = !els.setupProjectForm.hidden;
  els.setupProjectsRest.hidden = formOpen;
  els.setupAddProject.hidden = formOpen;
  els.setupClose.hidden = formOpen;
  if (els.setupStepRoot) els.setupStepRoot.hidden = formOpen;
  els.setupStepProjects.hidden = false;
  els.setupStepProjects.classList.toggle("is-form-open", formOpen);
  syncAppearanceFields();
  syncTestOverviewFields();
  syncSetupChrome();
}

function renderSetupList() {
  const projects = state.setupDraft?.projects ?? [];
  if (!projects.length) {
    els.setupProjectList.innerHTML = `<div class="setup-project-list-empty">
      <p class="setup-project-list-empty-title">No projects yet</p>
      <p class="setup-project-list-empty-copy">Repos you add will show here so you can hide, edit, or reorder them. Use <strong>Add a project</strong> below to browse a folder and pick commands.</p>
    </div>`;
    syncSetupAddButton();
    return;
  }
  els.setupProjectList.innerHTML = projects
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

function resetProjectForm() {
  state.setupEditingIndex = null;
  state.setupScriptRows = [];
  state.setupProbedScheme = "";
  state.setupProbeOk = false;
  els.setupFormTitle.textContent = "Add a project";
  els.setupCommitProject.textContent = "Add Project";
  els.setupPath.value = "";
  els.setupId.value = "";
  els.setupName.value = "";
  els.setupDescription.value = "";
  els.setupHealthPort.value = "";
  els.setupTestKind.value = "jest";
  els.setupPath.classList.remove("is-error");
  setProbeStatus(els.setupPathStatus, true, "");
  renderSetupScripts();
  syncTestOverviewFields();
  syncNoPkgUi(true);
  syncCommitButton();
}

export function openProjectForm(index = null) {
  if (index == null) {
    els.setupProjectForm.hidden = false;
    resetProjectForm();
    syncSetupAddButton();
    els.setupPath.focus();
    return;
  }
  const project = state.setupDraft.projects[index];
  state.setupEditingIndex = index;
  els.setupProjectForm.hidden = false;
  els.setupFormTitle.textContent = `Edit ${project.name || project.id}`;
  els.setupCommitProject.textContent = "Update project";
  els.setupPath.value = project.path || "";
  els.setupId.value = project.id || "";
  els.setupName.value = project.name || "";
  els.setupDescription.value = project.description || "";
  els.setupHealthPort.value = project.health?.port ?? "";
  els.setupTestKind.value = project.testKind === "maven" ? "maven" : "jest";
  state.setupScriptRows = (project.commands || []).map((command) => commandToRow(command, true));
  state.setupProbedScheme = String(project.expoDevClientScheme || "app").trim() || "app";
  state.setupProbeOk = false;
  setProbeStatus(els.setupPathStatus, true, "");
  renderSetupScripts();
  syncTestOverviewFields();
  syncCommitButton();
  syncSetupAddButton();
  if (els.setupPath.value.trim()) probeCurrentPath();
}

function collectProjectFromForm() {
  const projectPath = els.setupPath.value.trim();
  let id = els.setupId.value.trim();
  const name = els.setupName.value.trim();
  if (!projectPath || !state.setupProbeOk) throw new Error("Choose a project path, then Probe.");
  if (!name && !id) throw new Error("Name is required.");
  if (!id) {
    id = slugifyId(name);
    els.setupId.value = id;
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) {
    throw new Error("Project id must be letters, numbers, hyphens, or underscores.");
  }
  const displayName = name || id;
  for (const row of state.setupScriptRows) {
    if (!isCustomRow(row)) continue;
    const rowState = customRowState(row);
    if (rowState.empty) continue;
    if (rowState.incomplete) throw new Error(rowState.error || "Enter a command name and the command to run.");
  }
  const commands = [];
  const used = new Set();
  for (const row of state.setupScriptRows) {
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
  for (const row of state.setupScriptRows) {
    if (!isCustomRow(row) || !row.selected) continue;
    const rowState = customRowState(row);
    if (rowState.empty) continue;
    let script = String(row.script || "").trim();
    if (!script || used.has(script)) script = uniqueScriptId(rowState.label, used);
    used.add(script);
    const command = {
      script,
      label: lowercaseCommandLabel(rowState.label) || rowState.label,
      group: normalizeGroup(row.group),
      argv: rowState.argv,
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
  const healthPort = Number(els.setupHealthPort.value);
  const existing = state.setupEditingIndex != null ? state.setupDraft.projects[state.setupEditingIndex] : null;
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
    testKind: els.setupTestKind.value === "maven" ? "maven" : "jest",
    commands,
  };
  const description = els.setupDescription.value.trim().slice(0, 50);
  if (description) project.description = description;
  if (existing?.hidden) project.hidden = true;
  if (formUsesExpo()) {
    project.expoDevClientScheme = state.setupProbedScheme || existing?.expoDevClientScheme || "app";
  }
  if (Number.isFinite(healthPort) && healthPort > 0) {
    project.health = { stack: existing?.health?.stack || displayName, port: healthPort };
  }
  return project;
}

function commitProjectForm() {
  const project = collectProjectFromForm();
  const duplicate = state.setupDraft.projects.some(
    (item, index) => item.id === project.id && index !== state.setupEditingIndex
  );
  if (duplicate) throw new Error(`A project with id "${project.id}" already exists.`);
  const wasAdding = state.setupEditingIndex == null;
  if (wasAdding) state.setupDraft.projects.push(project);
  else state.setupDraft.projects[state.setupEditingIndex] = project;
  renderSetupList();
  return { wasAdding };
}

async function probeCurrentPath() {
  const projectPath = els.setupPath.value.trim();
  if (!projectPath) {
    els.setupPath.classList.add("is-error");
    setProbeStatus(els.setupPathStatus, false, "Choose a path first.");
    state.setupProbeOk = false;
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
    els.setupPath.classList.add("is-error");
    setProbeStatus(els.setupPathStatus, false, result.message);
    state.setupProbeOk = false;
    syncNoPkgUi(true);
    syncCommitButton();
    return;
  }
  const probe = result.data;
  if (!probe.exists) {
    setProbeStatus(els.setupPathStatus, false, `Folder not found: ${probe.resolved}`);
    els.setupPath.classList.add("is-error");
    state.setupProbeOk = false;
    syncNoPkgUi(true);
    syncCommitButton();
    return;
  }
  els.setupPath.classList.remove("is-error");
  state.setupProbeOk = true;
  const bits = [`Found ${probe.resolved}`];
  if (probe.hasExpo) bits.push("Expo");
  if (probe.hasMaven) bits.push("Maven");
  if (!probe.hasPackageJson) bits.push("no package.json");
  setProbeStatus(els.setupPathStatus, true, bits.join(" · "));
  if (!els.setupName.value.trim()) els.setupName.value = probe.name;
  if (!els.setupId.value.trim()) els.setupId.value = slugifyId(els.setupName.value.trim() || probe.name);
  if (probe.hasMaven) els.setupTestKind.value = "maven";
  else if (probe.hasExpo) els.setupTestKind.value = "jest";
  if (!els.setupHealthPort.value) {
    if (probe.hasExpo) els.setupHealthPort.value = "8081";
    else if (probe.hasMaven) els.setupHealthPort.value = "8080";
    else if ((probe.scripts || []).some((item) => item.script === "dev")) els.setupHealthPort.value = "3000";
  }
  const existing = state.setupScriptRows.length
    ? state.setupScriptRows
    : state.setupEditingIndex != null
      ? (state.setupDraft.projects[state.setupEditingIndex]?.commands || []).map((command) => commandToRow(command, true))
      : [];
  state.setupScriptRows = mergeScriptRows(probe.scripts || [], existing);
  if (probe.hasExpo) {
    state.setupProbedScheme = String(probe.expoDevClientScheme || "app").trim() || "app";
  }
  renderSetupScripts();
  syncNoPkgUi(Boolean(probe.hasPackageJson));
  syncCommitButton();
}

function applyDraftRootFields() {
  if (state.setupIsFirstRun) state.setupDraft.showTestOverview = false;
  else if (!state.setupAddMode) state.setupDraft.showTestOverview = els.setupShowTestOverview.checked;
  delete state.setupDraft.workspaceRoot;
  delete state.setupDraft.metroPort;
  delete state.setupDraft.expoDevClientScheme;
}

export async function persistWorkspace({ close = false } = {}) {
  if (!state.setupDraft) return false;
  setSetupError("");
  applyDraftRootFields();
  const result = await requestJson("/api/workspace", {
    method: "PUT",
    quiet: true,
    body: state.setupDraft,
  });
  if (!result.ok) {
    setSetupError(result.message);
    return false;
  }
  if (close) closeSetup();
  await hooks.fetchStatus();
  return true;
}

export async function openSetup({ addProject = false } = {}) {
  setSetupError("");
  const result = await requestJson("/api/workspace", { quiet: true });
  if (!result.ok) {
    setSetupError(result.message);
    els.setupPanel.hidden = false;
    return;
  }
  const raw = result.data;
  state.setupDraft = cloneWorkspace(raw);
  const empty = (state.setupDraft.projects || []).length === 0;
  state.setupIsFirstRun = empty;
  state.setupAddMode = Boolean(addProject);
  els.setupProjectForm.hidden = true;
  resetProjectForm();
  renderSetupList();
  els.setupPanel.hidden = false;
  if (addProject) {
    openProjectForm();
    return;
  }
  syncSetupAddButton();
}

export async function persistSetupOrder(from, to) {
  if (!state.setupDraft || from === to || from < 0 || to < 0) return;
  const previous = state.setupDraft.projects.slice();
  state.setupDraft.projects = moveItem(state.setupDraft.projects, from, to);
  if (state.setupEditingIndex === from) state.setupEditingIndex = to;
  else if (state.setupEditingIndex != null) {
    if (from < state.setupEditingIndex && to >= state.setupEditingIndex) state.setupEditingIndex -= 1;
    else if (from > state.setupEditingIndex && to <= state.setupEditingIndex) state.setupEditingIndex += 1;
  }
  renderSetupList();
  state.persistDrag = true;
  const ok = await persistWorkspace({ close: false });
  state.persistDrag = false;
  state.isDragging = false;
  if (!ok) {
    state.setupDraft.projects = previous;
    renderSetupList();
  }
}

export function bindSetup() {
  els.editSetupBtn.addEventListener("click", () => {
    openSetup();
  });
  els.setupThemeLight?.addEventListener("click", () => {
    applyTheme("light", true);
  });
  els.setupThemeDark?.addEventListener("click", () => {
    applyTheme("dark", true);
  });
  els.addProjectBtn.addEventListener("click", () => {
    openSetup({ addProject: true });
  });
  els.addProjectEmptyBtn.addEventListener("click", () => {
    openSetup({ addProject: true });
  });
  els.setupShowTestOverview.addEventListener("change", async () => {
    if (!state.setupDraft || state.setupIsFirstRun || state.setupAddMode) return;
    const previous = Boolean(state.setupDraft.showTestOverview);
    state.setupDraft.showTestOverview = els.setupShowTestOverview.checked;
    const ok = await persistWorkspace({ close: false });
    if (!ok) {
      state.setupDraft.showTestOverview = previous;
      els.setupShowTestOverview.checked = previous;
    }
  });
  els.setupClose.addEventListener("click", closeSetup);
  els.setupBrowsePath.addEventListener("click", async () => {
    setSetupError("");
    await browseIntoInput(els.setupPath, {
      after: ({ error }) => {
        if (error) {
          els.setupPath.classList.add("is-error");
          setProbeStatus(els.setupPathStatus, false, error);
          state.setupProbeOk = false;
          syncNoPkgUi(true);
          syncCommitButton();
        } else {
          els.setupPath.classList.remove("is-error");
          probeCurrentPath();
        }
      },
    });
  });
  els.setupAddProject.addEventListener("click", () => {
    setSetupError("");
    openProjectForm();
  });
  els.setupProbe.addEventListener("click", async () => {
    setSetupError("");
    await probeCurrentPath();
  });
  els.setupPath.addEventListener("input", () => {
    els.setupPath.classList.remove("is-error");
    state.setupProbeOk = false;
    syncNoPkgUi(true);
    syncCommitButton();
  });
  els.setupName.addEventListener("input", () => {
    syncCommitButton();
  });
  els.setupId.addEventListener("input", () => {
    syncCommitButton();
  });
  els.setupAddCustom.addEventListener("click", () => {
    setSetupError("");
    state.setupScriptRows.push(emptyCustomRow());
    renderSetupScripts();
    syncCommitButton();
    const index = state.setupScriptRows.length - 1;
    els.setupScripts.querySelector(`[data-script-label="${index}"]`)?.focus();
  });
  els.setupCancelForm.addEventListener("click", () => {
    if (state.setupAddMode) {
      closeSetup();
      return;
    }
    els.setupProjectForm.hidden = true;
    resetProjectForm();
    syncSetupAddButton();
  });
  els.setupCommitProject.addEventListener("click", async () => {
    setSetupError("");
    const previous = state.setupDraft ? cloneWorkspace(state.setupDraft) : null;
    const editingIndex = state.setupEditingIndex;
    const probeOk = state.setupProbeOk;
    try {
      const { wasAdding } = commitProjectForm();
      const ok = await persistWorkspace({ close: wasAdding });
      if (!ok) {
        if (previous) state.setupDraft = previous;
        renderSetupList();
        state.setupEditingIndex = editingIndex;
        state.setupProbeOk = probeOk;
        syncSetupChrome();
        return;
      }
      if (!wasAdding) {
        els.setupProjectForm.hidden = true;
        resetProjectForm();
        syncSetupAddButton();
      }
    } catch (error) {
      if (previous) state.setupDraft = previous;
      setSetupError(error.message);
      state.setupEditingIndex = editingIndex;
      state.setupProbeOk = probeOk;
      renderSetupList();
      syncSetupChrome();
    }
  });
  els.setupProjectList.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-setup-edit]");
    if (edit) {
      setSetupError("");
      openProjectForm(Number(edit.dataset.setupEdit));
      return;
    }
    const remove = event.target.closest("[data-setup-remove]");
    if (!remove) return;
    const index = Number(remove.dataset.setupRemove);
    const project = state.setupDraft.projects[index];
    hooks.openConfirm({
      title: "Remove project?",
      message: `Remove ${project.name || project.id} from overview? This does not delete the folder.`,
      okLabel: "Remove",
      onConfirm: async () => {
        const [removed] = state.setupDraft.projects.splice(index, 1);
        if (state.setupEditingIndex === index) {
          els.setupProjectForm.hidden = true;
          resetProjectForm();
          syncSetupAddButton();
        } else if (state.setupEditingIndex > index) {
          state.setupEditingIndex -= 1;
        }
        const ok = await persistWorkspace({ close: false });
        if (!ok) {
          state.setupDraft.projects.splice(index, 0, removed);
          renderSetupList();
          syncSetupAddButton();
          return;
        }
        renderSetupList();
        syncSetupAddButton();
      },
    });
  });
  els.setupProjectList.addEventListener("change", async (event) => {
    const toggle = event.target.closest("[data-setup-visible]");
    if (!toggle || !state.setupDraft) return;
    const index = Number(toggle.dataset.setupVisible);
    const project = state.setupDraft.projects[index];
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

  els.setupProjectList.addEventListener("dragstart", (event) => {
    const handle = event.target.closest("[data-setup-drag]");
    if (!handle) return;
    state.setupDragIndex = Number(handle.dataset.setupDrag);
    state.isDragging = true;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(state.setupDragIndex));
    const row = handle.closest(".setup-project-row");
    row?.classList.add("is-dragging");
    if (row) event.dataTransfer.setDragImage(row, 24, 24);
  });

  els.setupProjectList.addEventListener("dragover", (event) => {
    const row = event.target.closest(".setup-project-row");
    if (!row || state.setupDragIndex == null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    els.setupProjectList.querySelectorAll(".is-drag-over").forEach((el) => el.classList.remove("is-drag-over"));
    if (Number(row.dataset.setupIndex) !== state.setupDragIndex) row.classList.add("is-drag-over");
  });

  els.setupProjectList.addEventListener("drop", async (event) => {
    const row = event.target.closest(".setup-project-row");
    if (!row || state.setupDragIndex == null || !state.setupDraft) return;
    event.preventDefault();
    const from = state.setupDragIndex;
    const to = Number(row.dataset.setupIndex);
    state.persistDrag = true;
    clearDragStyles(els.setupProjectList);
    state.setupDragIndex = null;
    if (from === to) {
      state.persistDrag = false;
      state.isDragging = false;
      return;
    }
    await persistSetupOrder(from, to);
  });

  els.setupProjectList.addEventListener("dragend", () => {
    clearDragStyles(els.setupProjectList);
    state.setupDragIndex = null;
    if (!state.persistDrag) state.isDragging = false;
  });
  els.setupScripts.addEventListener("input", (event) => {
    const label = event.target.closest("[data-script-label]");
    if (label) {
      const row = state.setupScriptRows[Number(label.dataset.scriptLabel)];
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
    const row = state.setupScriptRows[Number(argv.dataset.scriptArgv)];
    if (row) row.argvLine = argv.value;
    syncCommitButton();
  });
  els.setupScripts.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-script-remove]");
    if (!remove) return;
    const index = Number(remove.dataset.scriptRemove);
    if (!Number.isInteger(index) || index < 0) return;
    state.setupScriptRows.splice(index, 1);
    renderSetupScripts();
    syncCommitButton();
  });
  els.setupScripts.addEventListener("change", (event) => {
    const check = event.target.closest("[data-script-check]");
    if (check) {
      state.setupScriptRows[Number(check.dataset.scriptCheck)].selected = check.checked;
      syncCommitButton();
      return;
    }
    const group = event.target.closest("[data-script-group]");
    if (group) {
      const row = state.setupScriptRows[Number(group.dataset.scriptGroup)];
      applyRowGroup(row, group.value);
      renderSetupScripts();
      return;
    }
    const longRunning = event.target.closest("[data-script-long]");
    if (longRunning) {
      state.setupScriptRows[Number(longRunning.dataset.scriptLong)].longRunning = longRunning.checked;
      return;
    }
    const destructive = event.target.closest("[data-script-destructive]");
    if (destructive) {
      state.setupScriptRows[Number(destructive.dataset.scriptDestructive)].destructive = destructive.checked;
    }
  });
}

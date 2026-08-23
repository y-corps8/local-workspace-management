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
      delete next.metroPort;
      const hasExpo = (next.commands || []).some((command) => command.interactions === "expo");
      if (hasExpo || project.expoDevClientScheme) {
        next.expoDevClientScheme = String(project.expoDevClientScheme || legacyScheme).trim() || legacyScheme;
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

function setSettingsOpen(open) {
  els.setupPanel.hidden = !open;
  els.layoutEl?.classList.toggle("is-settings", open);
  if (open && els.workspaceMain) els.workspaceMain.scrollTop = 0;
}

export function closeSetup() {
  setSettingsOpen(false);
  els.setupPanel.classList.remove("is-form");
  state.setupDraft = null;
  state.setupEditingIndex = null;
  state.setupScriptRows = [];
  state.setupPrimaryScript = "";
  state.setupPrimaryIndex = null;
  state.setupScriptDragIndex = null;
  state.setupProbedScheme = "";
  state.setupAddMode = false;
  state.setupFromDashboard = false;
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

/** Probe succeeded, or Edit with the saved path still in the field. */
function formPathReady() {
  if (state.setupProbeOk) return true;
  if (state.setupEditingIndex == null) return false;
  const saved = state.setupDraft?.projects?.[state.setupEditingIndex];
  if (!saved) return false;
  const current = String(els.setupPath?.value || "").trim();
  return Boolean(current) && current === String(saved.path || "").trim();
}

function ensureSetupPrimary() {
  const eligible = state.setupScriptRows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.selected && !row.destructive);
  if (!eligible.length) {
    state.setupPrimaryScript = "";
    state.setupPrimaryIndex = null;
    return;
  }
  const byScript = eligible.find(({ row }) => row.script && row.script === state.setupPrimaryScript);
  if (byScript) {
    state.setupPrimaryIndex = byScript.index;
    return;
  }
  const byIndex = eligible.find(({ index }) => index === state.setupPrimaryIndex);
  if (byIndex) {
    if (byIndex.row.script) state.setupPrimaryScript = byIndex.row.script;
    return;
  }
  state.setupPrimaryScript = "";
  state.setupPrimaryIndex = null;
}

function rowIsPrimary(row, index) {
  if (!row.selected || row.destructive) return false;
  if (state.setupPrimaryIndex === index) return true;
  return Boolean(row.script) && row.script === state.setupPrimaryScript && state.setupPrimaryIndex == null;
}

function renderSetupScriptGroup(row, index) {
  return `<label class="setup-script-group-field">
            <span>Group</span>
            <input type="text" data-script-group="${index}" value="${escapeHtml(rowGroup(row))}" spellcheck="false" aria-label="Group for ${escapeHtml(row.label || row.script || "command")}" placeholder="run, lint, …" />
          </label>`;
}

function renderSetupScriptPrimary(row, index) {
  const eligible = row.selected && !row.destructive;
  const radio = `<label class="setup-script-primary${eligible ? "" : " is-disabled"}">
            <input type="radio" name="setup-primary" data-script-primary="${index}" ${rowIsPrimary(row, index) ? "checked" : ""} ${eligible ? "" : "disabled"} /> Primary
          </label>`;
  if (eligible) return radio;
  const tip = !row.selected
    ? "Select this command to make it primary"
    : "Destructive commands can’t be primary";
  return `<span class="cmd-wrap setup-script-primary-wrap">
            ${radio}
            <div class="hover-tip" role="tooltip">${escapeHtml(tip)}</div>
          </span>`;
}

function renderSetupScriptRuntime(row, index) {
  return `<div class="setup-script-seg" role="radiogroup" aria-label="How it runs">
            <label class="setup-script-seg-opt${!row.longRunning ? " is-on" : ""}">
              <input type="radio" name="setup-runtime-${index}" data-script-runtime="${index}" value="once" ${row.longRunning ? "" : "checked"} />
              Once
            </label>
            <label class="setup-script-seg-opt is-long${row.longRunning ? " is-on" : ""}">
              <input type="radio" name="setup-runtime-${index}" data-script-runtime="${index}" value="long" ${row.longRunning ? "checked" : ""} />
              Long-running
            </label>
          </div>`;
}

function renderSetupScriptSafety(row, index) {
  return `<div class="setup-script-seg" role="radiogroup" aria-label="Safety">
            <label class="setup-script-seg-opt${!row.destructive ? " is-on" : ""}">
              <input type="radio" name="setup-safety-${index}" data-script-safety="${index}" value="safe" ${row.destructive ? "" : "checked"} />
              Safe
            </label>
            <label class="setup-script-seg-opt is-danger${row.destructive ? " is-on" : ""}">
              <input type="radio" name="setup-safety-${index}" data-script-safety="${index}" value="destructive" ${row.destructive ? "checked" : ""} />
              Destructive
            </label>
          </div>`;
}

function renderSetupScriptFlags(row, index) {
  return `${renderSetupScriptRuntime(row, index)}
          ${renderSetupScriptSafety(row, index)}
          ${renderSetupScriptPrimary(row, index)}`;
}

function renderSetupScriptDelete(index) {
  return `<button type="button" class="btn btn-icon btn-icon-danger" data-script-remove="${index}" aria-label="Delete custom command" title="Delete custom command">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>`;
}

function renderSetupScriptRail(row, index, custom) {
  return `<div class="setup-script-rail">
            ${renderSetupScriptGroup(row, index)}
            ${custom ? renderSetupScriptDelete(index) : ""}
          </div>`;
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

function renderSetupScriptLead(row, index, drag) {
  const name = row.label || row.script || "command";
  const handle = drag
    ? `<span class="drag-handle" data-script-drag="${index}" draggable="true" role="button" tabindex="0" aria-label="Reorder ${escapeHtml(name)}"></span>`
    : "";
  return `<div class="setup-script-lead">
        ${handle}
        <input type="checkbox" data-script-check="${index}" ${row.selected ? "checked" : ""} aria-label="Show ${escapeHtml(name)}" />
      </div>`;
}

function renderSetupScriptRow(row, index, drag) {
  const hint = row.hint ? `<p class="setup-script-hint">${escapeHtml(row.hint)}</p>` : "";
  if (isCustomRow(row)) {
    return `<div class="setup-script is-custom" data-script-index="${index}">
        ${renderSetupScriptLead(row, index, drag)}
        <div class="setup-script-body">
          <div class="setup-script-identity">
            <label class="setup-script-group-field">
              <span>Command name</span>
              <input type="text" data-script-label="${index}" value="${escapeHtml(row.label || "")}" placeholder="run" aria-label="Command name" />
            </label>
            <label class="setup-script-group-field">
              <span>Command</span>
              <input type="text" data-script-argv="${index}" value="${escapeHtml(row.argvLine || "")}" spellcheck="false" placeholder="echo hello" aria-label="Command" />
            </label>
          </div>
          <div class="setup-script-flags">
            ${renderSetupScriptFlags(row, index)}
          </div>
        </div>
        ${renderSetupScriptRail(row, index, true)}
        ${hint}
      </div>`;
  }
  return `<div class="setup-script" data-script-index="${index}">
        ${renderSetupScriptLead(row, index, drag)}
        <div class="setup-script-body">
          <div class="setup-script-identity">
            <code title="${escapeHtml(row.script)}">${escapeHtml(row.script)}</code>
          </div>
          <div class="setup-script-flags">
            ${renderSetupScriptFlags(row, index)}
          </div>
        </div>
        ${renderSetupScriptRail(row, index, false)}
        ${hint}
      </div>`;
}

function renderGroupedScriptRows(items, drag) {
  return orderGroups(items.map(({ row }) => row))
    .map((group) => {
      const groupItems = items.filter(({ row }) => rowGroup(row) === group);
      if (!groupItems.length) return "";
      const body = groupItems.map(({ row, index }) => renderSetupScriptRow(row, index, drag)).join("");
      return `<div class="setup-script-group">
        <div class="setup-script-group-label">${escapeHtml(groupLabel(group))}</div>
        ${body}
      </div>`;
    })
    .join("");
}

function renderSetupScripts() {
  ensureSetupPrimary();
  const indexed = state.setupScriptRows.map((row, index) => ({ row, index }));
  const selected = indexed.filter(({ row }) => row.selected);
  const available = indexed.filter(({ row }) => !row.selected);
  if (!els.setupScripts) return;
  els.setupScripts.innerHTML = selected.length ? renderGroupedScriptRows(selected, true) : "";
  if (!els.setupScriptsAvailable) return;
  if (!available.length) {
    els.setupScriptsAvailable.innerHTML = "";
    els.setupScriptsAvailable.hidden = true;
    return;
  }
  els.setupScriptsAvailable.hidden = false;
  els.setupScriptsAvailable.innerHTML = `<details class="setup-available">
      <summary>Available (${available.length})</summary>
      <div class="setup-scripts">${renderGroupedScriptRows(available, false)}</div>
    </details>`;
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
  els.setupAddCustomWrap.hidden = !formPathReady();
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
  els.setupCommitProject.disabled = !(formPathReady() && hasName && hasCompleteCommand());
}

function syncAppearanceFields() {
  const formOpen = !els.setupProjectForm.hidden;
  if (els.setupAppearanceRow) els.setupAppearanceRow.hidden = formOpen;
  syncThemeButtons();
}

function syncSetupChrome() {
  const formOpen = !els.setupProjectForm.hidden;
  if (!formOpen) {
    els.setupTitle.textContent = "Settings";
    els.setupLead.textContent =
      "Choose light or dark. Add, hide, or reorder projects. Theme stays in this browser; project changes save immediately.";
    return;
  }
  if (state.setupEditingIndex != null) {
    const project = state.setupDraft?.projects?.[state.setupEditingIndex];
    els.setupTitle.textContent = `Edit ${project?.name || project?.id || ""}`.trim();
    els.setupLead.textContent =
      "Change the folder, commands, or name. Probe again if the path or scripts changed.";
    return;
  }
  els.setupTitle.textContent = "Add a project";
  els.setupLead.textContent = "Browse or paste a folder, then Probe. Commands start in that folder.";
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
  els.setupPanel.classList.toggle("is-form", formOpen);
  syncAppearanceFields();
  syncTestOverviewFields();
  syncSetupChrome();
}

function renderSetupList() {
  const projects = state.setupDraft?.projects ?? [];
  if (!projects.length) {
    els.setupProjectList.innerHTML = `<div class="setup-project-list-empty">
      <p class="setup-project-list-empty-title">No projects yet</p>
      <p class="setup-project-list-empty-copy">Repos you add will show here so you can hide, edit, or reorder them. Use <strong>Add project</strong> below to browse a folder and pick commands.</p>
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
          <strong class="setup-project-row-title">${escapeHtml(project.name || project.id)}</strong>
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

function syncDescriptionCount() {
  if (!els.setupDescriptionCount) return;
  const length = String(els.setupDescription.value || "").length;
  els.setupDescriptionCount.textContent = `${length} / 50`;
}

function resetProjectForm() {
  state.setupEditingIndex = null;
  state.setupScriptRows = [];
  state.setupPrimaryScript = "";
  state.setupPrimaryIndex = null;
  state.setupScriptDragIndex = null;
  state.setupProbedScheme = "";
  state.setupProbeOk = false;
  els.setupFormTitle.textContent = "Add a project";
  els.setupCommitProject.textContent = "Add project";
  els.setupPath.value = "";
  els.setupId.value = "";
  els.setupName.value = "";
  els.setupDescription.value = "";
  if (els.setupAdvanced) els.setupAdvanced.open = false;
  els.setupHealthPort.value = "";
  els.setupTestKind.value = "jest";
  els.setupPath.classList.remove("is-error");
  setProbeStatus(els.setupPathStatus, true, "");
  renderSetupScripts();
  syncTestOverviewFields();
  syncNoPkgUi(true);
  syncCommitButton();
  syncDescriptionCount();
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
  if (els.setupAdvanced) els.setupAdvanced.open = true;
  els.setupHealthPort.value = project.health?.port ?? "";
  els.setupTestKind.value = project.testKind === "maven" ? "maven" : "jest";
  state.setupScriptRows = (project.commands || []).map((command) => commandToRow(command, true));
  state.setupPrimaryScript = String(project.primaryScript || "").trim();
  state.setupPrimaryIndex = state.setupScriptRows.findIndex((row) => row.script === state.setupPrimaryScript);
  if (state.setupPrimaryIndex < 0) state.setupPrimaryIndex = null;
  state.setupProbedScheme = String(project.expoDevClientScheme || "app").trim() || "app";
  state.setupProbeOk = false;
  setProbeStatus(els.setupPathStatus, true, "");
  renderSetupScripts();
  syncTestOverviewFields();
  syncNoPkgUi(true);
  syncCommitButton();
  syncDescriptionCount();
  syncSetupAddButton();
  if (els.setupPath.value.trim()) probeCurrentPath();
}

function collectProjectFromForm() {
  const projectPath = els.setupPath.value.trim();
  let id = els.setupId.value.trim();
  const name = els.setupName.value.trim();
  if (!projectPath || !formPathReady()) throw new Error("Choose a project path, then Probe.");
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
  const scriptByIndex = new Map();
  state.setupScriptRows.forEach((row, index) => {
    if (!row.selected) return;
    if (isCustomRow(row)) {
      const rowState = customRowState(row);
      if (rowState.empty) return;
      let script = String(row.script || "").trim();
      if (!script || used.has(script)) script = uniqueScriptId(rowState.label, used);
      used.add(script);
      scriptByIndex.set(index, script);
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
      return;
    }
    if (used.has(row.script)) return;
    used.add(row.script);
    scriptByIndex.set(index, row.script);
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
  });
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
  const primaryIndex = state.setupPrimaryIndex;
  const primaryScript =
    (primaryIndex != null && scriptByIndex.get(primaryIndex)) ||
    state.setupPrimaryScript ||
    "";
  if (primaryScript && commands.some((command) => command.script === primaryScript && !command.destructive)) {
    project.primaryScript = primaryScript;
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
    setSettingsOpen(true);
    return;
  }
  const raw = result.data;
  state.setupDraft = cloneWorkspace(raw);
  const empty = (state.setupDraft.projects || []).length === 0;
  state.setupIsFirstRun = empty;
  state.setupAddMode = Boolean(addProject);
  state.setupFromDashboard = Boolean(addProject);
  els.setupProjectForm.hidden = true;
  resetProjectForm();
  renderSetupList();
  setSettingsOpen(true);
  if (addProject) {
    openProjectForm();
    return;
  }
  syncSetupAddButton();
}

function adjustSetupIndex(current, from, to) {
  if (current == null) return current;
  if (current === from) return to;
  if (from < current && to >= current) return current - 1;
  if (from > current && to <= current) return current + 1;
  return current;
}

function moveSetupScriptRow(from, to) {
  if (from === to || from < 0 || to < 0) return;
  const fromRow = state.setupScriptRows[from];
  const toRow = state.setupScriptRows[to];
  if (!fromRow?.selected || !toRow?.selected) return;
  applyRowGroup(fromRow, rowGroup(toRow));
  state.setupScriptRows = moveItem(state.setupScriptRows, from, to);
  state.setupPrimaryIndex = adjustSetupIndex(state.setupPrimaryIndex, from, to);
  renderSetupScripts();
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
  els.setupDescription.addEventListener("input", () => {
    syncDescriptionCount();
  });
  els.setupAddCustom.addEventListener("click", () => {
    setSetupError("");
    state.setupScriptRows.push(emptyCustomRow());
    renderSetupScripts();
    syncCommitButton();
    const index = state.setupScriptRows.length - 1;
    els.setupCommandsBlock?.querySelector(`[data-script-label="${index}"]`)?.focus();
  });
  els.setupCancelForm.addEventListener("click", () => {
    if (state.setupFromDashboard) {
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
      const fromDashboard = state.setupFromDashboard;
      const ok = await persistWorkspace({ close: wasAdding || fromDashboard });
      if (!ok) {
        if (previous) state.setupDraft = previous;
        renderSetupList();
        state.setupEditingIndex = editingIndex;
        state.setupProbeOk = probeOk;
        syncSetupChrome();
        return;
      }
      if (!wasAdding && !fromDashboard) {
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

  els.setupExport?.addEventListener("click", async () => {
    setSetupError("");
    const result = await requestJson("/api/workspace", { quiet: true });
    if (!result.ok) {
      setSetupError(result.message || "Could not export workspace");
      return;
    }
    const payload = { ...result.data };
    delete payload.needsSetup;
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "workspace.json";
    link.click();
    URL.revokeObjectURL(url);
  });

  els.setupImport?.addEventListener("click", () => {
    setSetupError("");
    els.setupImportFile?.click();
  });

  els.setupImportFile?.addEventListener("change", () => {
    const file = els.setupImportFile.files?.[0];
    els.setupImportFile.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(String(reader.result || ""));
      } catch {
        setSetupError("Invalid JSON.");
        return;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setSetupError("Invalid workspace file.");
        return;
      }
      hooks.openConfirm({
        title: "Replace workspace?",
        message: "This replaces every project in this dashboard with the imported file.",
        okLabel: "Replace",
        onConfirm: async () => {
          delete parsed.needsSetup;
          const result = await requestJson("/api/workspace", {
            method: "PUT",
            quiet: true,
            body: parsed,
          });
          if (!result.ok) {
            setSetupError(result.message || "invalid_workspace");
            return;
          }
          state.setupDraft = cloneWorkspace(result.data);
          state.setupIsFirstRun = (state.setupDraft.projects || []).length === 0;
          state.setupAddMode = false;
          renderSetupList();
          syncSetupAddButton();
          await hooks.fetchStatus();
        },
      });
    };
    reader.readAsText(file);
  });

  if (els.setupScripts) {
    els.setupScripts.addEventListener("dragstart", (event) => {
      const handle = event.target.closest("[data-script-drag]");
      if (!handle || !els.setupScripts.contains(handle)) return;
      state.setupScriptDragIndex = Number(handle.dataset.scriptDrag);
      state.isDragging = true;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(state.setupScriptDragIndex));
      const row = handle.closest(".setup-script");
      row?.classList.add("is-dragging");
      if (row) event.dataTransfer.setDragImage(row, 24, 24);
    });
    els.setupScripts.addEventListener("dragover", (event) => {
      const row = event.target.closest(".setup-script");
      if (!row || !els.setupScripts.contains(row) || state.setupScriptDragIndex == null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      els.setupScripts.querySelectorAll(".is-drag-over").forEach((el) => el.classList.remove("is-drag-over"));
      if (Number(row.dataset.scriptIndex) !== state.setupScriptDragIndex) row.classList.add("is-drag-over");
    });
    els.setupScripts.addEventListener("drop", (event) => {
      const row = event.target.closest(".setup-script");
      if (!row || !els.setupScripts.contains(row) || state.setupScriptDragIndex == null) return;
      event.preventDefault();
      const from = state.setupScriptDragIndex;
      const to = Number(row.dataset.scriptIndex);
      clearDragStyles(els.setupScripts);
      state.setupScriptDragIndex = null;
      state.isDragging = false;
      moveSetupScriptRow(from, to);
    });
    els.setupScripts.addEventListener("dragend", () => {
      clearDragStyles(els.setupScripts);
      state.setupScriptDragIndex = null;
      state.isDragging = false;
    });
  }

  const scriptRoot = els.setupCommandsBlock || els.setupScripts;
  scriptRoot.addEventListener("input", (event) => {
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
  scriptRoot.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-script-remove]");
    if (!remove) return;
    const index = Number(remove.dataset.scriptRemove);
    if (!Number.isInteger(index) || index < 0) return;
    state.setupScriptRows.splice(index, 1);
    if (state.setupPrimaryIndex === index) {
      state.setupPrimaryIndex = null;
      state.setupPrimaryScript = "";
    } else if (state.setupPrimaryIndex > index) {
      state.setupPrimaryIndex -= 1;
    }
    renderSetupScripts();
    syncCommitButton();
  });
  scriptRoot.addEventListener("change", (event) => {
    const primary = event.target.closest("[data-script-primary]");
    if (primary) {
      const index = Number(primary.dataset.scriptPrimary);
      const row = state.setupScriptRows[index];
      state.setupPrimaryIndex = index;
      state.setupPrimaryScript = row?.script || "";
      return;
    }
    const check = event.target.closest("[data-script-check]");
    if (check) {
      state.setupScriptRows[Number(check.dataset.scriptCheck)].selected = check.checked;
      renderSetupScripts();
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
    const runtime = event.target.closest("[data-script-runtime]");
    if (runtime) {
      const row = state.setupScriptRows[Number(runtime.dataset.scriptRuntime)];
      if (row) row.longRunning = runtime.value === "long";
      renderSetupScripts();
      return;
    }
    const safety = event.target.closest("[data-script-safety]");
    if (safety) {
      const row = state.setupScriptRows[Number(safety.dataset.scriptSafety)];
      if (row) row.destructive = safety.value === "destructive";
      renderSetupScripts();
    }
  });
}

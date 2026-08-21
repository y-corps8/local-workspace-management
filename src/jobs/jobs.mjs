/**
 * In-memory jobs: start / stop / restart / stdin / logs.
 * One running copy per command id. Spawn is detached so kill(-pid) stops grandchildren.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import {
  COMMAND_BY_ID,
  REPOS,
  commandAvailability,
  findInteraction,
  repoPackageState,
  resolveArgv,
} from "../config/commands.mjs";
import { parseEnvFile, applyEnvFile } from "./env-file.mjs";
import {
  applyStreamChunk,
  createLogBatcher,
  emptyStreamPartials,
  LOG_FLUSH_MS,
  LIVE_PARTIAL_MIN_MS,
  streamPartialText,
} from "./job-logs.mjs";
import { dispatchInteraction, noteMetroPort } from "./metro-actions.mjs";
import { detectPrompt, promptsEqual, publicPrompt } from "./prompt.mjs";
import { readTestArtifact, saveTestSnapshot, snapshotFromJob } from "./test-results.mjs";

export const MAX_LOG_LINES = 4000;
export const MAX_FINISHED_JOBS = 50;
export const MAX_STDIN_CHARS = 200;
const PROMPT_DEBOUNCE_MS = 300;

export function publicJob(job) {
  return {
    id: job.id,
    repo: job.repo,
    label: job.label,
    longRunning: job.longRunning,
    status: job.status,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    exitCode: job.exitCode,
    prompt: job.status === "running" ? job.prompt ?? null : null,
  };
}

export function jobPartialText(job) {
  return streamPartialText(job?.partials);
}

export function spawnEnv(repoRoot) {
  const env = { ...process.env };
  const extras = ["/opt/homebrew/bin", "/usr/local/bin", path.join(os.homedir(), ".local/bin")];
  const parts = String(env.PATH || "").split(path.delimiter).filter(Boolean);
  env.PATH = [...extras.filter((dir) => !parts.includes(dir)), ...parts].join(path.delimiter);
  try {
    const envPath = path.join(repoRoot, ".env");
    if (fs.existsSync(envPath) && fs.statSync(envPath).isFile()) {
      return applyEnvFile(env, parseEnvFile(fs.readFileSync(envPath, "utf8")));
    }
  } catch {
    // unreadable .env
  }
  return env;
}

export function killProcessGroup(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
    return;
  } catch {
    // fall through
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // already gone
  }
}

export function forceKill(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
}

export function createJobRuntime({ onBroadcast, onStatusLight } = {}) {
  const jobs = new Map();

  const logBatcher = createLogBatcher({
    intervalMs: LOG_FLUSH_MS,
    liveMinMs: LIVE_PARTIAL_MIN_MS,
    onFlush(jobId, lines) {
      onBroadcast?.("log", { id: jobId, lines });
    },
  });

  function broadcast(event, data) {
    onBroadcast?.(event, data);
  }

  function promptScanText(job) {
    const recent = (job.logs || []).slice(-8).map((entry) => String(entry?.text || ""));
    const partial = jobPartialText(job);
    if (partial) recent.push(partial);
    return recent.join("\n");
  }

  function setJobPrompt(job, prompt) {
    const next = publicPrompt(prompt);
    if (promptsEqual(job.prompt ?? null, next)) return false;
    job.prompt = next;
    broadcast("job", publicJob(job));
    return true;
  }

  function clearPromptTimer(job) {
    if (job?.promptTimer) {
      clearTimeout(job.promptTimer);
      job.promptTimer = null;
    }
  }

  function refreshJobPrompt(job, { immediate = false } = {}) {
    if (!job) return;
    clearPromptTimer(job);
    if (job.status !== "running") {
      setJobPrompt(job, null);
      return;
    }
    const partial = jobPartialText(job);
    const detected = detectPrompt(promptScanText(job));
    if (partial && detected) {
      setJobPrompt(job, detected);
      return;
    }
    if (!detected) {
      setJobPrompt(job, null);
      return;
    }
    if (immediate) {
      setJobPrompt(job, detected);
      return;
    }
    job.promptTimer = setTimeout(() => {
      job.promptTimer = null;
      refreshJobPrompt(job, { immediate: true });
    }, PROMPT_DEBOUNCE_MS);
  }

  function publishLivePartial(job, stream) {
    const key = stream === "stderr" ? "stderr" : "stdout";
    const text = String(job.partials?.[key] || "").replace(/\r$/, "");
    if (!text) {
      job.livePartial = false;
      return;
    }
    const at = new Date().toISOString();
    job.livePartial = true;
    logBatcher.enqueue(job.id, { stream: key, text, at, replace: true, live: true });
  }

  function repoHasRunningLongJob(repoId) {
    return [...jobs.values()].some(
      (job) => job.repo === repoId && job.status === "running" && job.longRunning
    );
  }

  function pushLogLine(job, stream, text, replace) {
    const at = new Date().toISOString();
    if (replace && job.logs.length) {
      job.logs[job.logs.length - 1] = { stream, text, at, replace: true };
    } else {
      job.logs.push({ stream, text, at });
    }
    if (job.logs.length > MAX_LOG_LINES) {
      job.logs.splice(0, job.logs.length - MAX_LOG_LINES);
    }
    noteMetroPort(job, text);
    logBatcher.enqueue(job.id, { stream, text, at, replace: Boolean(replace) });
  }

  function appendLog(job, stream, chunk) {
    const { events, partials } = applyStreamChunk(job.partials, stream, chunk.toString("utf8"));
    job.partials = partials;
    for (const event of events) {
      pushLogLine(job, stream, event.text, event.replace);
    }
    publishLivePartial(job, stream);
    refreshJobPrompt(job);
  }

  function flushPartialLog(job, { refresh = true } = {}) {
    for (const stream of ["stdout", "stderr"]) {
      const text = String(job.partials?.[stream] || "").replace(/\r$/, "");
      if (text) pushLogLine(job, stream, text, false);
    }
    job.partials = emptyStreamPartials();
    job.livePartial = false;
    logBatcher.flush(job.id);
    if (refresh) refreshJobPrompt(job);
  }

  function pruneJobs(keepId) {
    const running = [...jobs.values()].filter((job) => job.status === "running");
    const finished = [...jobs.values()]
      .filter((job) => job.status !== "running")
      .sort((a, b) => String(b.finishedAt || "").localeCompare(String(a.finishedAt || "")));
    const keep = new Set(running.map((job) => job.id));
    if (keepId) keep.add(keepId);
    for (const job of finished.slice(0, MAX_FINISHED_JOBS)) keep.add(job.id);
    for (const [id, job] of jobs) {
      if (keep.has(id)) continue;
      job.logs = [];
      logBatcher.clear(id);
      jobs.delete(id);
    }
  }

  function closeJobStdin(job) {
    try {
      job.child?.stdin?.end();
    } catch {
      // already closed
    }
  }

  function appendJobNote(job, stream, text) {
    pushLogLine(job, stream, String(text).replace(/\n+$/, ""), false);
  }

  function finalizeJob(job, exitCode, signal) {
    if (job.status !== "running") return;
    if (job.killTimer) {
      clearTimeout(job.killTimer);
      job.killTimer = null;
    }
    closeJobStdin(job);
    flushPartialLog(job, { refresh: false });
    clearPromptTimer(job);
    job.prompt = null;
    job.status = exitCode === 0 ? "exited" : "failed";
    if (signal === "SIGTERM" || signal === "SIGKILL") {
      job.status = "stopped";
    }
    job.exitCode = exitCode;
    job.finishedAt = new Date().toISOString();
    job.child = null;

    if (job.kind === "test") {
      const artifact = readTestArtifact(job.repo);
      const snapshot = snapshotFromJob({
        repoId: job.repo,
        commandId: job.id,
        commandLabel: job.label,
        exitCode: job.exitCode ?? 1,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        artifact,
      });
      saveTestSnapshot(job.repo, snapshot);
    }

    const restart = Boolean(job.restartAfterStop);
    job.restartAfterStop = false;
    pruneJobs(job.id);
    broadcast("job", publicJob(job));
    if (restart) {
      const command = COMMAND_BY_ID.get(job.id);
      if (command) {
        startJob(command);
        return;
      }
    }
    onStatusLight?.();
  }

  function startJob(command) {
    const existing = jobs.get(command.id);
    if (existing?.status === "running") {
      return { error: "already_running", job: publicJob(existing) };
    }

    const repo = REPOS[command.repo];
    const availability = commandAvailability(command, repoPackageState(repo?.root));
    if (!availability.available) {
      return { error: availability.unavailableReason };
    }

    if (command.jestJson) {
      fs.mkdirSync(path.join(repo.root, "coverage"), { recursive: true });
    }

    const argv = resolveArgv(command);
    const [file, ...args] = argv;
    const child = spawn(file, args, {
      cwd: repo.root,
      env: spawnEnv(repo.root),
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const job = {
      id: command.id,
      repo: command.repo,
      label: command.label,
      kind: command.kind,
      longRunning: command.longRunning,
      status: "running",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      exitCode: null,
      logs: [],
      partials: emptyStreamPartials(),
      prompt: null,
      livePartial: false,
      pid: child.pid,
      child,
    };
    jobs.set(command.id, job);

    child.stdout.on("data", (chunk) => appendLog(job, "stdout", chunk));
    child.stderr.on("data", (chunk) => appendLog(job, "stderr", chunk));
    child.on("error", (error) => {
      appendLog(job, "stderr", Buffer.from(`${error.message}\n`));
      finalizeJob(job, 1, null);
    });
    child.on("close", (code, signal) => {
      finalizeJob(job, code ?? 1, signal);
    });

    broadcast("job", publicJob(job));
    onStatusLight?.();
    return { job: publicJob(job) };
  }

  function stopJob(commandId) {
    const job = jobs.get(commandId);
    if (!job || job.status !== "running" || !job.pid) {
      return { error: "not_running" };
    }
    killProcessGroup(job.pid);
    if (job.killTimer) clearTimeout(job.killTimer);
    job.killTimer = setTimeout(() => {
      if (job.status === "running" && job.pid) forceKill(job.pid);
    }, 4000);
    return { job: publicJob(job) };
  }

  function restartJob(commandId) {
    const job = jobs.get(commandId);
    const command = COMMAND_BY_ID.get(commandId);
    if (job?.status === "running") {
      job.restartAfterStop = true;
      return stopJob(commandId);
    }
    if (!command) {
      return { error: job ? "unknown_command" : "not_running" };
    }
    return startJob(command);
  }

  function writeJobStdin(commandId, text) {
    const job = jobs.get(commandId);
    if (!job || job.status !== "running" || !job.child?.stdin) {
      return { error: "not_running" };
    }
    const line = String(text ?? "");
    if (line.length > MAX_STDIN_CHARS) {
      return { error: "stdin_too_long" };
    }
    const prompt = job.prompt;
    if (!prompt || !Array.isArray(prompt.options) || !prompt.options.length) {
      return { error: "no_prompt" };
    }
    const allowed = new Set(prompt.options.map((option) => String(option.value ?? "")));
    if (!allowed.has(line)) {
      return { error: "stdin_not_allowed" };
    }
    const payload = line.endsWith("\n") ? line : `${line}\n`;
    try {
      job.child.stdin.write(payload);
    } catch (error) {
      return { error: "stdin_failed", message: error.message };
    }
    appendJobNote(job, "stdout", `← ${line.replace(/\n+$/, "")}`);
    clearPromptTimer(job);
    setJobPrompt(job, null);
    return { ok: true, job: publicJob(job) };
  }

  function clearJobLogs(commandId) {
    const job = jobs.get(commandId);
    if (!job) {
      return { error: "unknown_job" };
    }
    job.logs = [];
    job.partials = emptyStreamPartials();
    job.livePartial = false;
    logBatcher.clear(commandId);
    clearPromptTimer(job);
    setJobPrompt(job, null);
    return { ok: true, id: commandId, logs: [], partial: "", prompt: null };
  }

  function liveJob(commandId) {
    const job = jobs.get(commandId);
    if (job && job.status === "running") return job;
    return null;
  }

  async function interactJob(commandId, actionId) {
    const job = liveJob(commandId);
    if (!job) {
      return { error: "not_running" };
    }
    const command = COMMAND_BY_ID.get(commandId);
    if (!command) {
      return { error: "unknown_command" };
    }
    const interaction = findInteraction(command, actionId);
    if (!interaction) {
      return { error: "unknown_action" };
    }
    try {
      await dispatchInteraction(command, interaction, job);
      appendJobNote(job, "stdout", `Triggered ${interaction.label}`);
      return { ok: true, action: interaction.id, job: publicJob(job) };
    } catch (error) {
      const message = error?.message || String(error);
      appendJobNote(job, "stderr", `${interaction.label} failed: ${message}`);
      return { error: "interact_failed", message };
    }
  }

  function requireLiveOrAllowlisted(id) {
    const command = COMMAND_BY_ID.get(id);
    const job = jobs.get(id);
    if (command || job) return { command, job };
    return { error: "unknown_command" };
  }

  function shutdownJobs() {
    logBatcher.flushAll();
    const pids = [...jobs.values()].filter((job) => job.status === "running" && job.pid).map((job) => job.pid);
    for (const pid of pids) killProcessGroup(pid);
    setTimeout(() => {
      for (const pid of pids) forceKill(pid);
    }, 400).unref();
    return pids;
  }

  return {
    jobs,
    publicJob,
    jobPartialText,
    startJob,
    stopJob,
    restartJob,
    writeJobStdin,
    clearJobLogs,
    interactJob,
    liveJob,
    repoHasRunningLongJob,
    requireLiveOrAllowlisted,
    shutdownJobs,
    flushLogs: () => logBatcher.flushAll(),
  };
}

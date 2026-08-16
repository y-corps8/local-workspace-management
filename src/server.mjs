/**
 * Local overview dashboard server.
 *
 * Serves the static UI from public/ and runs allowlisted commands in
 * configured project folders. Bound to 127.0.0.1 only. The browser POSTs a command id —
 * never a shell string. Live logs go out as SSE (status / job / log). Choice prompts set job.prompt.
 */
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import {
  COMMAND_BY_ID,
  COMMANDS,
  HEALTH_CHECKS,
  HOST,
  APP_ROOT,
  OVERVIEW_URL,
  PORT,
  REPO_ORDER,
  REPOS,
  SHOW_TEST_OVERVIEW,
  findInteraction,
  probeProject,
  publicCommand,
  readCleanWorkspace,
  commandAvailability,
  repoPackageState,
  resolveArgv,
  reorderProjects,
  setWorkspaceChangeListener,
  startWorkspaceWatcher,
  updateProjectPath,
  writeRawWorkspace,
} from "./commands.mjs";
import { parseEnvFile, applyEnvFile } from "./env-file.mjs";
import { splitLogChunk } from "./job-logs.mjs";
import { parseMetroPortFromText } from "./metro.mjs";
import { detectPrompt, promptsEqual, publicPrompt } from "./prompt.mjs";
import { openPathArgs, openUrlArgs } from "./open-external.mjs";
import { isLocalOrigin } from "./origin.mjs";
import { broadcastSse, writeSseEvent } from "./sse.mjs";
import { readAllLastTestRuns, readTestArtifact, saveTestSnapshot, snapshotFromJob } from "./test-results.mjs";
import { closeAppWindow, openAppWindow } from "./app-window.mjs";

const MAX_LOG_LINES = 4000;
const MAX_FINISHED_JOBS = 50;
const PROMPT_DEBOUNCE_MS = 300;
const GIT_CACHE_MS = 8000;
const STATIC_ROOT = path.join(APP_ROOT, "public");
const BLOCKED_PREFIXES = [path.join(STATIC_ROOT, ".cache")];

/** commandId → in-memory job (one running copy per id). */
const jobs = new Map();
const sseClients = new Set();
const gitCache = new Map();
/** Last full status snapshot; light rebuilds reuse git / pkg / commands from here. */
let lastFullStatus = null;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJsonBody(req, res, limit) {
  try {
    return JSON.parse((await readBody(req, limit)) || "{}");
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return null;
  }
}

// ── Status probes ──────────────────────────────────────────────────────────

function probePort(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const finish = (up) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(up);
    };
    socket.setTimeout(400);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function spawnGit(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // already gone
      }
      resolve({ status: 1, stdout: "", stderr: "timeout" });
    }, 2000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ status: 1, stdout: "", stderr: "error" });
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status: status ?? 1, stdout, stderr });
    });
  });
}

/** Current branch + whether the working tree has uncommitted changes. */
async function gitInfo(repoRoot) {
  if (!repoRoot) return { branch: "unknown", dirty: false };
  try {
    if (!fs.existsSync(path.join(repoRoot, ".git"))) {
      return { branch: "unknown", dirty: false };
    }
  } catch {
    return { branch: "unknown", dirty: false };
  }
  const cached = gitCache.get(repoRoot);
  if (cached && Date.now() - cached.at < GIT_CACHE_MS) return cached.info;
  const [branch, porcelain] = await Promise.all([
    spawnGit(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot),
    spawnGit(["status", "--porcelain"], repoRoot),
  ]);
  const info =
    branch.status !== 0
      ? { branch: "unknown", dirty: false }
      : {
          branch: (branch.stdout || "").trim() || "unknown",
          dirty: Boolean((porcelain.stdout || "").trim()),
        };
  gitCache.set(repoRoot, { at: Date.now(), info });
  return info;
}

function publicJob(job) {
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

function jobPartialText(job) {
  return String(job?.partial || "").replace(/\r$/, "");
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
  const text = jobPartialText(job);
  if (!text) {
    if (job.livePartial) {
      job.livePartial = false;
    }
    return;
  }
  const at = new Date().toISOString();
  job.livePartial = true;
  broadcast("log", { id: job.id, stream, text, at, replace: true, live: true });
}

function repoHasRunningLongJob(repoId) {
  return [...jobs.values()].some(
    (job) => job.repo === repoId && job.status === "running" && job.longRunning
  );
}

async function collectHealth() {
  return Promise.all(
    HEALTH_CHECKS.filter((check) => !REPOS[check.repo]?.hidden).map(async (check) => ({
      ...check,
      up: repoHasRunningLongJob(check.repo) || (await probePort(check.port)),
    }))
  );
}

/** Snapshot for GET /api/status and the SSE `status` event. Health is not polled. */
async function buildStatus({ light = false } = {}) {
  if (light && lastFullStatus) {
    const health = await collectHealth();
    const jobsPublic = [...jobs.values()].map(publicJob);
    const lastTests = SHOW_TEST_OVERVIEW ? readAllLastTestRuns() : null;
    const repos = lastFullStatus.repos.map((repo) => {
      const row = {
        ...repo,
        running: jobsPublic.filter((job) => job.repo === repo.id && job.status === "running"),
      };
      if (SHOW_TEST_OVERVIEW && lastTests) row.lastTest = lastTests[repo.id];
      return row;
    });
    const status = {
      ...lastFullStatus,
      generatedAt: new Date().toISOString(),
      health,
      jobs: jobsPublic,
      repos,
    };
    lastFullStatus = status;
    return status;
  }

  const health = await collectHealth();
  const lastTests = SHOW_TEST_OVERVIEW ? readAllLastTestRuns() : {};
  const pkgByRepo = {};
  for (const repoId of REPO_ORDER) {
    pkgByRepo[repoId] = repoPackageState(REPOS[repoId]?.root);
  }
  const gitByRepo = {};
  await Promise.all(
    REPO_ORDER.map(async (repoId) => {
      const repo = REPOS[repoId];
      const pkg = pkgByRepo[repoId];
      gitByRepo[repoId] = pkg.exists ? await gitInfo(repo.root) : { branch: "missing", dirty: false };
    })
  );
  const repos = REPO_ORDER.map((repoId) => {
    const repo = REPOS[repoId];
    const pkg = pkgByRepo[repoId];
    const row = {
      id: repo.id,
      name: repo.name,
      description: repo.description,
      exists: pkg.exists,
      hasPackageJson: pkg.hasPackageJson,
      path: repo.path,
      root: repo.root,
      ports: repo.ports,
      hidden: Boolean(repo.hidden),
      git: gitByRepo[repoId],
      running: [...jobs.values()]
        .filter((job) => job.repo === repoId && job.status === "running")
        .map(publicJob),
    };
    if (SHOW_TEST_OVERVIEW) row.lastTest = lastTests[repoId];
    return row;
  });

  const status = {
    generatedAt: new Date().toISOString(),
    needsSetup: REPO_ORDER.length === 0,
    showTestOverview: SHOW_TEST_OVERVIEW,
    health,
    repos,
    jobs: [...jobs.values()].map(publicJob),
    commands: COMMANDS.map((command) => publicCommand(command, commandAvailability(command, pkgByRepo[command.repo]))),
  };
  lastFullStatus = status;
  return status;
}

// ── SSE ────────────────────────────────────────────────────────────────────
// Events: `status` (full payload), `job` (one job), `log` (stdout/stderr chunk), `health` (Recheck).

function broadcast(event, data) {
  broadcastSse(sseClients, event, data);
}

async function broadcastStatus({ light = false } = {}) {
  const status = await buildStatus({ light });
  broadcast("status", status);
  return status;
}

function jobHasExpoInteractions(job) {
  const command = COMMAND_BY_ID.get(job?.id);
  return Boolean((command?.interactions ?? []).length);
}

function noteMetroPort(job, line) {
  if (!jobHasExpoInteractions(job)) return;
  const port = parseMetroPortFromText(line);
  if (port) job.metroPort = port;
}

function scanJobMetroPort(job) {
  if (!job) return null;
  if (Number.isInteger(job.metroPort) && job.metroPort > 0) return job.metroPort;
  if (!jobHasExpoInteractions(job)) return null;
  let found = null;
  for (const entry of job.logs || []) {
    const port = parseMetroPortFromText(entry?.text);
    if (port) found = port;
  }
  const partial = parseMetroPortFromText(job.partial);
  if (partial) found = partial;
  if (found) job.metroPort = found;
  return found;
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
  broadcast("log", { id: job.id, stream, text, at, replace: Boolean(replace) });
}

/** Buffer incomplete lines; broadcast each completed line as `log`. */
function appendLog(job, stream, chunk) {
  const { events, partial } = splitLogChunk(job.partial, chunk.toString("utf8"));
  job.partial = partial;
  for (const event of events) {
    pushLogLine(job, stream, event.text, event.replace);
  }
  publishLivePartial(job, stream);
  refreshJobPrompt(job);
}

function flushPartialLog(job, { refresh = true } = {}) {
  if (job.partial) {
    const text = job.partial.replace(/\r$/, "");
    job.partial = "";
    job.livePartial = false;
    if (text) pushLogLine(job, "stdout", text, false);
  }
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
    jobs.delete(id);
  }
}

function spawnEnv(repoRoot) {
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

// ── Job lifecycle ──────────────────────────────────────────────────────────
// spawn({ detached: true }) makes the child a process-group leader so
// kill(-pid) stops npm / Maven grandchildren, not just the wrapper.

function killProcessGroup(pid) {
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

function forceKill(pid) {
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

function closeJobStdin(job) {
  try {
    job.child?.stdin?.end();
  } catch {
    // already closed
  }
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
  broadcastStatus({ light: true });
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
    partial: "",
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
  broadcastStatus({ light: true });
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
  job.partial = "";
  job.livePartial = false;
  clearPromptTimer(job);
  setJobPrompt(job, null);
  return { ok: true, id: commandId, logs: [], partial: "", prompt: null };
}

function appendJobNote(job, stream, text) {
  pushLogLine(job, stream, String(text).replace(/\n+$/, ""), false);
}

function whichBin(name) {
  const finder = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(finder, [name], { encoding: "utf8" });
  return result.status === 0 && Boolean((result.stdout || "").trim());
}

function openInEditor(root) {
  for (const bin of ["cursor", "code", "codium"]) {
    if (whichBin(bin)) {
      runDetached(bin, [root]);
      return;
    }
  }
  const { file, args } = openPathArgs(root);
  runDetached(file, args);
}

function openUrl(url) {
  const { file, args } = openUrlArgs(url);
  runDetached(file, args);
}

const BROWSE_SCRIPT = `tell application "Finder"
  activate
  POSIX path of (choose folder with prompt "Select a folder")
end tell`;

function isBrowseCancel(stderr, status) {
  const text = String(stderr || "");
  if (text.includes("-128") || /User cancel+ed/i.test(text)) return true;
  if (process.platform === "linux" && status === 1 && !text.trim()) return true;
  return false;
}

function spawnCapture(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, options);
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      const error = new Error("Folder picker timed out");
      error.code = "browse_failed";
      finish(error);
    }, 300000);
    if (child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
    }
    if (child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }
    child.on("error", (error) => finish(error));
    child.on("close", (status) => finish(null, { status, stdout, stderr }));
  });
}

async function browseFolder() {
  if (process.platform === "darwin") {
    try {
      const { status, stdout, stderr } = await spawnCapture("osascript", ["-e", BROWSE_SCRIPT]);
      if (status !== 0) {
        const error = new Error(isBrowseCancel(stderr, status) ? "cancelled" : (stderr || stdout || `osascript exited ${status}`).trim());
        error.code = isBrowseCancel(stderr, status) ? "cancelled" : "browse_failed";
        throw error;
      }
      return String(stdout || "").trim().replace(/\/+$/, "");
    } catch (error) {
      if (error.code === "cancelled" || error.code === "browse_failed") throw error;
      error.code = "browse_failed";
      throw error;
    }
  }

  if (process.platform === "linux") {
    for (const [file, args] of [
      ["zenity", ["--file-selection", "--directory", "--title=Select a folder"]],
      ["kdialog", ["--getexistingdirectory", os.homedir(), "Select a folder"]],
    ]) {
      if (!whichBin(file)) continue;
      const { status, stdout, stderr } = await spawnCapture(file, args);
      if (status !== 0) {
        const error = new Error(isBrowseCancel(stderr, status) ? "cancelled" : (stderr || stdout || `${file} exited ${status}`).trim());
        error.code = isBrowseCancel(stderr, status) ? "cancelled" : "browse_failed";
        throw error;
      }
      return String(stdout || "").trim().replace(/\/+$/, "");
    }
    const error = new Error("Install zenity or kdialog to browse folders, or paste a path");
    error.code = "unsupported";
    throw error;
  }

  if (process.platform === "win32") {
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$d = New-Object System.Windows.Forms.FolderBrowserDialog",
      "$d.Description = 'Select a folder'",
      "$d.ShowNewFolderButton = $true",
      "if ($d.ShowDialog() -ne 'OK') { exit 1 }",
      "[Console]::Out.Write($d.SelectedPath)",
    ].join("; ");
    const { status, stdout, stderr } = await spawnCapture("powershell", [
      "-STA",
      "-NoProfile",
      "-Command",
      script,
    ]);
    if (status !== 0) {
      const error = new Error(status === 1 ? "cancelled" : (stderr || stdout || `powershell exited ${status}`).trim());
      error.code = status === 1 ? "cancelled" : "browse_failed";
      throw error;
    }
    return String(stdout || "").trim().replace(/[\\/]+$/, "");
  }

  const error = new Error("Folder browse is not available on this platform");
  error.code = "unsupported";
  throw error;
}

function metroSettings(repo, job) {
  return {
    port: scanJobMetroPort(job) || Number(repo?.metroPort) || 8081,
    scheme: String(repo?.expoDevClientScheme || "app").trim() || "app",
  };
}

function metroDevClientUrl(repo, job) {
  const { port, scheme } = metroSettings(repo, job);
  return `${scheme}://expo-development-client/?url=http://127.0.0.1:${port}`;
}

function metroWebUrl(repo, job) {
  return `http://127.0.0.1:${metroSettings(repo, job).port}`;
}

function runDetached(file, args) {
  spawn(file, args, { detached: true, stdio: "ignore" }).unref();
}

function runChecked(file, args, timeout = 8000) {
  const result = spawnSync(file, args, { encoding: "utf8", timeout });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(detail || `${file} exited ${result.status}`);
  }
  return result;
}

/** Expo message socket requires version: 2 or the payload is ignored. */
function metroBroadcast(repo, method, params, job) {
  return new Promise((resolve, reject) => {
    if (typeof WebSocket === "undefined") {
      reject(new Error("WebSocket is not available in this Node version"));
      return;
    }
    const { port } = metroSettings(repo, job);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/message`);
    let settled = false;
    let timer = null;
    let poll = null;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (poll) clearInterval(poll);
      try {
        ws.close();
      } catch {
        // already closed
      }
      if (error) reject(error);
      else resolve();
    };
    timer = setTimeout(() => {
      finish(new Error(`Metro on :${port} did not accept the connection`));
    }, 2000);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ version: 2, method, params }));
      const flushDeadline = Date.now() + 50;
      poll = setInterval(() => {
        if (ws.bufferedAmount === 0 || Date.now() >= flushDeadline) finish(null);
      }, 10);
    });
    ws.addEventListener("error", () => {
      finish(new Error(`Could not reach Metro on :${port}`));
    });
  });
}

async function openDebugger(repo, job) {
  const { port } = metroSettings(repo, job);
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!res.ok) {
    throw new Error(`Metro inspector list returned ${res.status}`);
  }
  const apps = await res.json();
  const list = Array.isArray(apps) ? apps : [];
  const target = list.find((app) => app.devtoolsFrontendUrl || app.webSocketDebuggerUrl) ?? list[0];
  if (!target) {
    throw new Error("No compatible apps connected");
  }
  const frontend = target.devtoolsFrontendUrl;
  if (frontend) {
    const url = frontend.startsWith("http") ? frontend : `http://127.0.0.1:${port}${frontend}`;
    openUrl(url);
    return;
  }
  throw new Error("Connected app has no DevTools URL");
}

async function dispatchInteraction(command, interaction, job) {
  const repo = REPOS[command.repo];
  switch (interaction.kind) {
    case "metro":
      await metroBroadcast(repo, interaction.method, interaction.params, job);
      return;
    case "openIos":
      runChecked("xcrun", ["simctl", "openurl", "booted", metroDevClientUrl(repo, job)]);
      return;
    case "openAndroid":
      runChecked("adb", [
        "shell",
        "am",
        "start",
        "-a",
        "android.intent.action.VIEW",
        "-d",
        metroDevClientUrl(repo, job),
      ]);
      return;
    case "openWeb":
      openUrl(metroWebUrl(repo, job));
      return;
    case "debugger":
      await openDebugger(repo, job);
      return;
    case "editor":
      if (!repo?.root) {
        throw new Error("Repo folder not found");
      }
      openInEditor(repo.root);
      return;
    default:
      throw new Error("unknown_action");
  }
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

// ── Static files + HTTP API ────────────────────────────────────────────────

function safeStaticPath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent((urlPath || "/").split("?")[0]);
  } catch {
    return null;
  }
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const resolved = path.resolve(STATIC_ROOT, relative);
  if (!resolved.startsWith(STATIC_ROOT + path.sep) && resolved !== STATIC_ROOT) {
    return null;
  }
  for (const blocked of BLOCKED_PREFIXES) {
    if (resolved === blocked || resolved.startsWith(blocked + path.sep)) {
      return null;
    }
  }
  if (path.basename(resolved).startsWith(".")) return null;
  return resolved;
}

function serveStatic(req, res) {
  const filePath = safeStaticPath(req.url || "/");
  if (!filePath) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const type = MIME[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    fs.createReadStream(filePath).pipe(res);
  });
}

function requireLiveOrAllowlisted(id) {
  const command = COMMAND_BY_ID.get(id);
  const job = jobs.get(id);
  if (command || job) return { command, job };
  return { error: "unknown_command" };
}

async function handleApi(req, res, url) {
  if (!isLocalOrigin(req.headers.origin, { host: HOST, port: PORT })) {
    sendJson(res, 403, { error: "forbidden_origin" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/status") {
    sendJson(res, 200, await buildStatus());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    const health = await collectHealth();
    if (lastFullStatus) lastFullStatus = { ...lastFullStatus, health };
    broadcast("health", health);
    sendJson(res, 200, { health });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    try {
      res.write(":\n\n");
    } catch {
      return;
    }
    sseClients.add(res);
    try {
      writeSseEvent(res, "status", await buildStatus());
    } catch {
      sseClients.delete(res);
      return;
    }
    const heartbeat = setInterval(() => {
      try {
        res.write(":\n\n");
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 20000);
    req.on("close", () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/logs/")) {
    const id = decodeURIComponent(url.pathname.slice("/api/logs/".length));
    const job = jobs.get(id);
    if (!job) {
      sendJson(res, 404, { error: "unknown_job" });
      return;
    }
    sendJson(res, 200, {
      id,
      logs: job.logs,
      partial: jobPartialText(job),
      prompt: job.prompt ?? null,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/run") {
    const body = await readJsonBody(req, res);
    if (!body) return;
    const command = COMMAND_BY_ID.get(body.id);
    if (!command) {
      sendJson(res, 400, { error: "unknown_command" });
      return;
    }
    const result = startJob(command);
    sendJson(res, result.error ? 409 : 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/stop") {
    const body = await readJsonBody(req, res);
    if (!body) return;
    const found = requireLiveOrAllowlisted(body.id);
    if (found.error) {
      sendJson(res, 400, { error: found.error });
      return;
    }
    const result = stopJob(body.id);
    sendJson(res, result.error ? 409 : 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/restart") {
    const body = await readJsonBody(req, res);
    if (!body) return;
    const found = requireLiveOrAllowlisted(body.id);
    if (found.error) {
      sendJson(res, 400, { error: found.error });
      return;
    }
    const result = restartJob(body.id);
    sendJson(res, result.error ? 409 : 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/stdin") {
    const body = await readJsonBody(req, res);
    if (!body) return;
    const found = requireLiveOrAllowlisted(body.id);
    if (found.error) {
      sendJson(res, 400, { error: found.error });
      return;
    }
    const result = writeJobStdin(body.id, body.text);
    sendJson(res, result.error ? 409 : 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/logs/clear") {
    const body = await readJsonBody(req, res);
    if (!body) return;
    const result = clearJobLogs(body.id);
    sendJson(res, result.error ? 404 : 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/interact") {
    const body = await readJsonBody(req, res);
    if (!body) return;
    const found = requireLiveOrAllowlisted(body.id);
    if (found.error) {
      sendJson(res, 400, { error: found.error });
      return;
    }
    const result = await interactJob(body.id, body.action);
    sendJson(res, result.error ? 409 : 200, result);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/workspace") {
    const raw = readCleanWorkspace();
    sendJson(res, 200, { ...raw, needsSetup: (raw.projects ?? []).length === 0 });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/workspace/browse") {
    try {
      await readBody(req);
    } catch {
      sendJson(res, 400, { error: "invalid_json" });
      return;
    }
    try {
      const folder = await browseFolder();
      if (!folder) {
        sendJson(res, 400, { error: "cancelled" });
        return;
      }
      sendJson(res, 200, { path: folder });
    } catch (error) {
      const code = error.code === "cancelled" || error.code === "unsupported" ? error.code : "browse_failed";
      sendJson(res, 400, { error: code, message: error.message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/workspace/probe") {
    const body = await readJsonBody(req, res);
    if (!body) return;
    try {
      sendJson(res, 200, probeProject({ path: body.path }));
    } catch (error) {
      sendJson(res, 400, { error: "probe_failed", message: error.message });
    }
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/workspace") {
    const body = await readJsonBody(req, res, 256 * 1024);
    if (!body) return;
    try {
      const raw = writeRawWorkspace(body);
      await broadcastStatus();
      sendJson(res, 200, { ...raw, needsSetup: (raw.projects ?? []).length === 0 });
    } catch (error) {
      sendJson(res, 400, { error: "invalid_workspace", message: error.message });
    }
    return;
  }

  if (req.method === "PATCH" && url.pathname === "/api/workspace/order") {
    const body = await readJsonBody(req, res);
    if (!body) return;
    try {
      const raw = reorderProjects(body.ids);
      await broadcastStatus();
      sendJson(res, 200, { ...raw, needsSetup: (raw.projects ?? []).length === 0 });
    } catch (error) {
      sendJson(res, 400, { error: "invalid_workspace", message: error.message });
    }
    return;
  }

  if (req.method === "PATCH" && url.pathname === "/api/workspace/project") {
    const body = await readJsonBody(req, res);
    if (!body) return;
    try {
      const raw = updateProjectPath(body.id, body.path);
      await broadcastStatus();
      sendJson(res, 200, { ...raw, needsSetup: (raw.projects ?? []).length === 0 });
    } catch (error) {
      sendJson(res, 400, { error: "invalid_workspace", message: error.message });
    }
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || `${HOST}:${PORT}`;
  const url = new URL(req.url || "/", `http://${host}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end("Method not allowed");
      return;
    }
    serveStatic(req, res);
  } catch (error) {
    if (!res.headersSent) {
      sendJson(res, 500, { error: "server_error", message: String(error.message || error) });
    }
  }
});

let shuttingDown = false;

/** Stop child process groups so Expo / Spring / Next do not outlive this server. */
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  closeAppWindow();
  const pids = [...jobs.values()].filter((job) => job.status === "running" && job.pid).map((job) => job.pid);
  for (const pid of pids) killProcessGroup(pid);
  setTimeout(() => {
    for (const pid of pids) forceKill(pid);
  }, 400).unref();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function openDefaultBrowser() {
  const { file, args } = openUrlArgs(OVERVIEW_URL);
  const child = spawn(file, args, { detached: true, stdio: "ignore" });
  child.on("error", (error) => {
    console.error("Failed to open default browser:", error.message);
  });
  child.unref();
  console.log("Opened default browser (existing window if one is running).");
}

const windowMode = process.argv.includes("--window") || process.argv.includes("--open");

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the other overview process, then try again.`);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Overview dashboard  ${OVERVIEW_URL}`);
  console.log("Bound to 127.0.0.1 — command runner is local-only.");
  setWorkspaceChangeListener(() => {
    broadcastStatus();
  });
  startWorkspaceWatcher();
  if (windowMode) {
    openAppWindow({ onClosed: shutdown });
  } else if (process.argv.includes("--browser")) {
    openDefaultBrowser();
  }
});

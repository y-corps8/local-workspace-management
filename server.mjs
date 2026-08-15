/**
 * Local overview dashboard server.
 *
 * Serves the static UI from this folder and runs allowlisted commands in
 * configured project folders. Bound to 127.0.0.1 only. The browser POSTs a command id —
 * never a shell string. Live logs go out as SSE (status / job / log).
 */
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import {
  COMMAND_BY_ID,
  COMMANDS,
  EXPO_DEV_CLIENT_SCHEME,
  HEALTH_CHECKS,
  HOST,
  METRO_PORT,
  APP_ROOT,
  OVERVIEW_URL,
  PORT,
  REPO_ORDER,
  REPOS,
  findInteraction,
  probeProject,
  publicCommand,
  readRawWorkspace,
  resolveArgv,
  writeRawWorkspace,
} from "./commands.mjs";
import { readAllLastTestRuns, readTestArtifact, saveTestSnapshot, snapshotFromJob } from "./test-results.mjs";

const MAX_LOG_LINES = 4000;
const STATIC_ROOT = APP_ROOT;
const BLOCKED_PREFIXES = [path.join(STATIC_ROOT, ".cache")];

/** commandId → in-memory job (one running copy per id). */
const jobs = new Map();
const sseClients = new Set();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
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

/** Current branch + whether the working tree has uncommitted changes. */
function gitInfo(repoRoot) {
  try {
    const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 2000,
    });
    const porcelain = spawnSync("git", ["status", "--porcelain"], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 2000,
    });
    if (branch.status !== 0) {
      return { branch: "unknown", dirty: false };
    }
    return {
      branch: (branch.stdout || "").trim() || "unknown",
      dirty: Boolean((porcelain.stdout || "").trim()),
    };
  } catch {
    return { branch: "unknown", dirty: false };
  }
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
  };
}

/** Snapshot for GET /api/status and the SSE `status` event. */
async function buildStatus() {
  const health = await Promise.all(
    HEALTH_CHECKS.map(async (check) => ({
      ...check,
      up: await probePort(check.port),
    }))
  );

  const lastTests = readAllLastTestRuns();
  const repos = REPO_ORDER.map((repoId) => {
    const repo = REPOS[repoId];
    const exists = fs.existsSync(repo.root);
    return {
      id: repo.id,
      name: repo.name,
      role: repo.role,
      exists,
      root: repo.root,
      ports: repo.ports,
      git: exists ? gitInfo(repo.root) : { branch: "missing", dirty: false },
      lastTest: lastTests[repoId],
      running: [...jobs.values()]
        .filter((job) => job.repo === repoId && job.status === "running")
        .map(publicJob),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    needsSetup: REPO_ORDER.length === 0,
    health,
    repos,
    jobs: [...jobs.values()].map(publicJob),
    commands: COMMANDS.map(publicCommand),
  };
}

// ── SSE ────────────────────────────────────────────────────────────────────
// Events: `status` (full payload), `job` (one job), `log` (stdout/stderr chunk).

function sseWrite(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event, data) {
  for (const client of sseClients) {
    sseWrite(client, event, data);
  }
}

async function broadcastStatus() {
  const status = await buildStatus();
  broadcast("status", status);
  return status;
}

/** Buffer incomplete lines; broadcast each completed line as `log`. */
function appendLog(job, stream, chunk) {
  const text = chunk.toString("utf8");
  job.partial = (job.partial || "") + text;
  const parts = job.partial.split(/\r?\n/);
  job.partial = parts.pop() ?? "";
  for (const line of parts) {
    job.logs.push({ stream, text: line, at: new Date().toISOString() });
  }
  if (job.logs.length > MAX_LOG_LINES) {
    job.logs.splice(0, job.logs.length - MAX_LOG_LINES);
  }
  broadcast("log", { id: job.id, stream, text });
}

function flushPartialLog(job) {
  if (job.partial) {
    job.logs.push({ stream: "stdout", text: job.partial, at: new Date().toISOString() });
    broadcast("log", { id: job.id, stream: "stdout", text: job.partial });
    job.partial = "";
  }
}

// ── Job lifecycle ──────────────────────────────────────────────────────────
// spawn({ detached: true }) makes the child a process-group leader so
// kill(-pid) stops npm / Maven grandchildren, not just the wrapper.

function killProcessGroup(pid) {
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

function finalizeJob(job, exitCode, signal) {
  if (job.status !== "running") return;
  flushPartialLog(job);
  job.status = exitCode === 0 ? "exited" : "failed";
  if (signal === "SIGTERM" || signal === "SIGKILL") {
    job.status = "stopped";
  }
  job.exitCode = exitCode;
  job.finishedAt = new Date().toISOString();
  job.child = null;

  // Persist last-run counts so the test cards update after this job.
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

  broadcast("job", publicJob(job));
  broadcastStatus();
}

function startJob(command) {
  const existing = jobs.get(command.id);
  if (existing?.status === "running") {
    return { error: "already_running", job: publicJob(existing) };
  }

  const repo = REPOS[command.repo];
  if (!repo || !fs.existsSync(repo.root)) {
    return { error: "repo_missing" };
  }

  if (command.jestJson) {
    // Jest --outputFile fails if coverage/ does not exist yet.
    fs.mkdirSync(path.join(repo.root, "coverage"), { recursive: true });
  }

  const argv = resolveArgv(command);
  const [file, ...args] = argv;
  const child = spawn(file, args, {
    cwd: repo.root,
    env: process.env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
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
  broadcastStatus();
  return { job: publicJob(job) };
}

function stopJob(commandId) {
  const job = jobs.get(commandId);
  if (!job || job.status !== "running" || !job.pid) {
    return { error: "not_running" };
  }
  killProcessGroup(job.pid);
  job.killTimer = setTimeout(() => {
    if (job.status === "running" && job.pid) forceKill(job.pid);
  }, 4000);
  return { job: publicJob(job) };
}

function appendJobNote(job, stream, text) {
  const line = String(text).replace(/\n+$/, "");
  job.logs.push({ stream, text: line, at: new Date().toISOString() });
  if (job.logs.length > MAX_LOG_LINES) {
    job.logs.splice(0, job.logs.length - MAX_LOG_LINES);
  }
  broadcast("log", { id: job.id, stream, text: line });
}

function metroDevClientUrl() {
  return `${EXPO_DEV_CLIENT_SCHEME}://expo-development-client/?url=http://127.0.0.1:${METRO_PORT}`;
}

function metroWebUrl() {
  return `http://127.0.0.1:${METRO_PORT}`;
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
function metroBroadcast(method, params) {
  return new Promise((resolve, reject) => {
    if (typeof WebSocket === "undefined") {
      reject(new Error("WebSocket is not available in this Node version"));
      return;
    }
    const ws = new WebSocket(`ws://127.0.0.1:${METRO_PORT}/message`);
    let settled = false;
    let timer = null;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // already closed
      }
      if (error) reject(error);
      else resolve();
    };
    timer = setTimeout(() => {
      finish(new Error(`Metro on :${METRO_PORT} did not accept the connection`));
    }, 2000);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ version: 2, method, params }));
      finish(null);
    });
    ws.addEventListener("error", () => {
      finish(new Error(`Could not reach Metro on :${METRO_PORT}`));
    });
  });
}

async function openDebugger() {
  const res = await fetch(`http://127.0.0.1:${METRO_PORT}/json/list`);
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
    const url = frontend.startsWith("http") ? frontend : `http://127.0.0.1:${METRO_PORT}${frontend}`;
    runDetached("open", [url]);
    return;
  }
  throw new Error("Connected app has no DevTools URL");
}

async function dispatchInteraction(command, interaction) {
  const repo = REPOS[command.repo];
  switch (interaction.kind) {
    case "metro":
      await metroBroadcast(interaction.method, interaction.params);
      return;
    case "openIos":
      runChecked("xcrun", ["simctl", "openurl", "booted", metroDevClientUrl()]);
      return;
    case "openAndroid":
      runChecked("adb", [
        "shell",
        "am",
        "start",
        "-a",
        "android.intent.action.VIEW",
        "-d",
        metroDevClientUrl(),
      ]);
      return;
    case "openWeb":
      runDetached("open", [metroWebUrl()]);
      return;
    case "debugger":
      await openDebugger();
      return;
    case "editor":
      if (!repo?.root) {
        throw new Error("Repo folder not found");
      }
      runDetached("open", [repo.root]);
      return;
    default:
      throw new Error("unknown_action");
  }
}

async function interactJob(commandId, actionId) {
  const command = COMMAND_BY_ID.get(commandId);
  if (!command) {
    return { error: "unknown_command" };
  }
  const interaction = findInteraction(command, actionId);
  if (!interaction) {
    return { error: "unknown_action" };
  }
  const job = jobs.get(commandId);
  if (!job || job.status !== "running") {
    return { error: "not_running" };
  }
  try {
    await dispatchInteraction(command, interaction);
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
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
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

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/status") {
    sendJson(res, 200, await buildStatus());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(":\n\n");
    sseClients.add(res);
    sseWrite(res, "status", await buildStatus());
    // Comment frames keep proxies from closing an idle stream.
    const heartbeat = setInterval(() => {
      res.write(":\n\n");
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
    sendJson(res, 200, { id, logs: job.logs });
    return;
  }

  // body.id must match COMMAND_BY_ID — no argv or shell from the client.
  if (req.method === "POST" && url.pathname === "/api/run") {
    let body;
    try {
      body = JSON.parse((await readBody(req)) || "{}");
    } catch {
      sendJson(res, 400, { error: "invalid_json" });
      return;
    }
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
    let body;
    try {
      body = JSON.parse((await readBody(req)) || "{}");
    } catch {
      sendJson(res, 400, { error: "invalid_json" });
      return;
    }
    if (!COMMAND_BY_ID.has(body.id)) {
      sendJson(res, 400, { error: "unknown_command" });
      return;
    }
    const result = stopJob(body.id);
    sendJson(res, result.error ? 409 : 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/interact") {
    let body;
    try {
      body = JSON.parse((await readBody(req)) || "{}");
    } catch {
      sendJson(res, 400, { error: "invalid_json" });
      return;
    }
    if (!COMMAND_BY_ID.has(body.id)) {
      sendJson(res, 400, { error: "unknown_command" });
      return;
    }
    const result = await interactJob(body.id, body.action);
    sendJson(res, result.error ? 409 : 200, result);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/workspace") {
    const raw = readRawWorkspace();
    sendJson(res, 200, { ...raw, needsSetup: (raw.projects ?? []).length === 0 });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/workspace/probe") {
    let body;
    try {
      body = JSON.parse((await readBody(req)) || "{}");
    } catch {
      sendJson(res, 400, { error: "invalid_json" });
      return;
    }
    try {
      sendJson(res, 200, probeProject({ workspaceRoot: body.workspaceRoot, path: body.path }));
    } catch (error) {
      sendJson(res, 400, { error: "probe_failed", message: error.message });
    }
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/workspace") {
    let body;
    try {
      body = JSON.parse((await readBody(req, 256 * 1024)) || "{}");
    } catch {
      sendJson(res, 400, { error: "invalid_json" });
      return;
    }
    try {
      const raw = writeRawWorkspace(body);
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

/** Stop child process groups so Expo / Spring / Next do not outlive this server. */
function shutdown() {
  for (const job of jobs.values()) {
    if (job.status === "running" && job.pid) {
      killProcessGroup(job.pid);
    }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(PORT, HOST, () => {
  console.log(`Overview dashboard  ${OVERVIEW_URL}`);
  console.log("Bound to 127.0.0.1 — command runner is local-only.");
  if (process.argv.includes("--open")) {
    spawn("open", [OVERVIEW_URL], { detached: true, stdio: "ignore" }).unref();
  }
});

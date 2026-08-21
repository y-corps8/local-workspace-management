/**
 * HTTP app: static public/, /api/*, SSE. Does not listen — the CLI in src/server.mjs does.
 */
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import {
  APP_ROOT,
  COMMAND_BY_ID,
  COMMANDS,
  HEALTH_CHECKS,
  HOST,
  PORT,
  REPO_ORDER,
  REPOS,
  SHOW_TEST_OVERVIEW,
  commandAvailability,
  probeProject,
  publicCommand,
  readCleanWorkspace,
  reorderProjects,
  repoPackageState,
  updateProjectPath,
  writeRawWorkspace,
} from "../config/commands.mjs";
import { browseFolder } from "./browse.mjs";
import { gitInfo } from "../jobs/git-info.mjs";
import { createJobRuntime, jobPartialText, publicJob } from "../jobs/jobs.mjs";
import { isLocalHost, isLocalOrigin, securityHeaders } from "./origin.mjs";
import { broadcastSse, writeSseEvent } from "./sse.mjs";
import { readAllLastTestRuns } from "../jobs/test-results.mjs";

const STATIC_ROOT = path.join(APP_ROOT, "public");

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
    ...securityHeaders(),
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

export function safeStaticPath(urlPath, staticRoot = STATIC_ROOT) {
  let decoded;
  try {
    decoded = decodeURIComponent((urlPath || "/").split("?")[0]);
  } catch {
    return null;
  }
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const resolved = path.resolve(staticRoot, relative);
  if (!resolved.startsWith(staticRoot + path.sep) && resolved !== staticRoot) {
    return null;
  }
  const blocked = path.join(staticRoot, ".cache");
  if (resolved === blocked || resolved.startsWith(blocked + path.sep)) {
    return null;
  }
  if (path.basename(resolved).startsWith(".")) return null;
  return resolved;
}

function serveStatic(req, res) {
  const filePath = safeStaticPath(req.url || "/");
  if (!filePath) {
    res.writeHead(404, securityHeaders());
    res.end("Not found");
    return;
  }
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      res.writeHead(404, securityHeaders());
      res.end("Not found");
      return;
    }
    const type = MIME[path.extname(filePath)] || "application/octet-stream";
    const headers = { ...securityHeaders(), "Content-Type": type, "Cache-Control": "no-store" };
    if (req.method === "HEAD") {
      res.writeHead(200, headers);
      res.end();
      return;
    }
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

/**
 * Create the dashboard HTTP server without listening.
 * Origin/Host checks use the bound port after listen (including port 0).
 */
export function createOverviewApp({ host = HOST, port = PORT } = {}) {
  const bindHost = host;
  let boundPort = port;
  const sseClients = new Set();
  let lastFullStatus = null;

  function broadcast(event, data) {
    broadcastSse(sseClients, event, data);
  }

  const runtime = createJobRuntime({
    onBroadcast: broadcast,
    onStatusLight: () => {
      broadcastStatus({ light: true });
    },
  });
  const { jobs } = runtime;

  function originOpts() {
    return { host: bindHost, port: boundPort || port };
  }

  async function collectHealth() {
    return Promise.all(
      HEALTH_CHECKS.filter((check) => !REPOS[check.repo]?.hidden).map(async (check) => ({
        ...check,
        up: runtime.repoHasRunningLongJob(check.repo) || (await probePort(check.port)),
      }))
    );
  }

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

  async function broadcastStatus({ light = false } = {}) {
    const status = await buildStatus({ light });
    broadcast("status", status);
    return status;
  }

  async function handleApi(req, res, url) {
    if (!isLocalOrigin(req.headers.origin, originOpts())) {
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
        ...securityHeaders(),
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
      const result = runtime.startJob(command);
      sendJson(res, result.error ? 409 : 200, result);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/stop") {
      const body = await readJsonBody(req, res);
      if (!body) return;
      const found = runtime.requireLiveOrAllowlisted(body.id);
      if (found.error) {
        sendJson(res, 400, { error: found.error });
        return;
      }
      const result = runtime.stopJob(body.id);
      sendJson(res, result.error ? 409 : 200, result);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/restart") {
      const body = await readJsonBody(req, res);
      if (!body) return;
      const found = runtime.requireLiveOrAllowlisted(body.id);
      if (found.error) {
        sendJson(res, 400, { error: found.error });
        return;
      }
      const result = runtime.restartJob(body.id);
      sendJson(res, result.error ? 409 : 200, result);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/stdin") {
      const body = await readJsonBody(req, res);
      if (!body) return;
      const found = runtime.requireLiveOrAllowlisted(body.id);
      if (found.error) {
        sendJson(res, 400, { error: found.error });
        return;
      }
      const result = runtime.writeJobStdin(body.id, body.text);
      sendJson(res, result.error ? 409 : 200, result);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/logs/clear") {
      const body = await readJsonBody(req, res);
      if (!body) return;
      const result = runtime.clearJobLogs(body.id);
      sendJson(res, result.error ? 404 : 200, result);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/interact") {
      const body = await readJsonBody(req, res);
      if (!body) return;
      const found = runtime.requireLiveOrAllowlisted(body.id);
      if (found.error) {
        sendJson(res, 400, { error: found.error });
        return;
      }
      const result = await runtime.interactJob(body.id, body.action);
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
    const requestHost = req.headers.host || `${bindHost}:${boundPort || port}`;
    const url = new URL(req.url || "/", `http://${requestHost}`);

    try {
      if (!isLocalHost(req.headers.host, originOpts())) {
        sendJson(res, 403, { error: "forbidden_host" });
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url);
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, securityHeaders());
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

  server.on("listening", () => {
    const addr = server.address();
    if (addr && typeof addr === "object") boundPort = addr.port;
  });

  return {
    server,
    runtime,
    broadcastStatus,
    buildStatus,
    getPort: () => boundPort,
  };
}

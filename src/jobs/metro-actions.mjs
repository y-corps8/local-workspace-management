/**
 * Expo / Metro live actions while a long-running command is up.
 * kind / method / params stay server-side.
 */
import { spawn, spawnSync } from "node:child_process";
import { COMMAND_BY_ID, REPOS } from "../config/commands.mjs";
import { streamPartialText } from "./job-logs.mjs";
import { parseMetroPortFromText } from "./metro.mjs";
import { openPathArgs, openUrlArgs } from "../cli/open-external.mjs";
import { whichBin } from "../http/browse.mjs";

function jobPartialText(job) {
  return streamPartialText(job?.partials);
}

export function jobHasExpoInteractions(job) {
  const command = COMMAND_BY_ID.get(job?.id);
  return Boolean((command?.interactions ?? []).length);
}

export function noteMetroPort(job, line) {
  if (!jobHasExpoInteractions(job)) return;
  const port = parseMetroPortFromText(line);
  if (port) job.metroPort = port;
}

export function scanJobMetroPort(job) {
  if (!job) return null;
  if (Number.isInteger(job.metroPort) && job.metroPort > 0) return job.metroPort;
  if (!jobHasExpoInteractions(job)) return null;
  let found = null;
  for (const entry of job.logs || []) {
    const port = parseMetroPortFromText(entry?.text);
    if (port) found = port;
  }
  const partial = parseMetroPortFromText(jobPartialText(job));
  if (partial) found = partial;
  if (found) job.metroPort = found;
  return found;
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

export async function dispatchInteraction(command, interaction, job) {
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

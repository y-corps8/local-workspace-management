import { hooks } from "./hooks.js";

export async function postJson(url, body, options = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (!options.quiet) {
      hooks.appendLogLine("stderr", data.message || data.error || `Request failed (${res.status})`);
    }
    return null;
  }
  return data;
}

export async function requestJson(url, { method = "GET", body, quiet } = {}) {
  const res = await fetch(url, {
    method,
    headers: body != null ? { "Content-Type": "application/json" } : undefined,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.message || data.error || `Request failed (${res.status})`;
    if (!quiet) hooks.appendLogLine("stderr", message);
    return { ok: false, status: res.status, data, message };
  }
  return { ok: true, data };
}

export async function browseFolder() {
  const result = await requestJson("/api/workspace/browse", { method: "POST", quiet: true, body: {} });
  if (!result.ok) {
    if (result.data?.error === "cancelled") return null;
    if (result.status === 404 || result.data?.error === "not_found") {
      return { error: "Restart the dashboard (npm start) so Browse can open the folder picker." };
    }
    return { error: result.message || "Could not open folder picker" };
  }
  return { path: String(result.data.path || "").trim() };
}

export async function browseIntoInput(input, { after } = {}) {
  const picked = await browseFolder();
  if (!picked) return;
  if (picked.error) {
    if (typeof after === "function") after({ error: picked.error });
    else hooks.appendLogLine("stderr", picked.error);
    return;
  }
  if (!picked.path) return;
  input.value = picked.path;
  if (typeof after === "function") after({ path: picked.path });
}

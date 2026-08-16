/**
 * Shared constants and helpers for the --window native WebView.
 * Platform backends live in app-window-darwin/linux/win32.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { APP_ROOT, CACHE_DIR, OVERVIEW_URL } from "./commands.mjs";

export const APP_NAME = "Workspace Overview";

export const APP_WINDOW_DIR = path.join(CACHE_DIR, "app-window");
export const WRAPPER_APP = path.join(CACHE_DIR, "Workspace Overview.app");
export const LINUX_BINARY = path.join(CACHE_DIR, "overview-window");
export const WIN32_EXE = path.join(CACHE_DIR, "Overview.exe");
export const WIN32_ICO = path.join(CACHE_DIR, "overview.ico");
export const WINDOW_PID_PATH = path.join(CACHE_DIR, "overview-window.pid");
export const OVERVIEW_WINDOW_PY = path.join(APP_ROOT, "src/overview-window.py");
export const OVERVIEW_WINDOW_C = path.join(APP_ROOT, "src/overview-window.c");
export const OVERVIEW_WINDOW_CS = path.join(APP_ROOT, "src/overview-window.cs");

const WEBVIEW2_GUID = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

let trackedChild = null;

export function windowPlatform(platform = process.platform) {
  if (platform === "darwin" || platform === "linux" || platform === "win32") return platform;
  return null;
}

export function helperArgv({ url = OVERVIEW_URL, title = APP_NAME, icon = "" } = {}) {
  return [String(url), String(title), String(icon || "")];
}

export function installHint(platform = process.platform) {
  if (platform === "darwin") {
    return "swiftc not found. Install Xcode Command Line Tools: xcode-select --install";
  }
  if (platform === "linux") {
    return [
      "App window needs a native WebView (WebKitGTK).",
      "Debian/Ubuntu: sudo apt install python3-gi gir1.2-webkit2-4.1",
      "  or: sudo apt install build-essential pkg-config libwebkit2gtk-4.1-dev",
      "Fedora: sudo dnf install python3-gobject webkit2gtk4.1",
      "Arch: sudo pacman -S python-gobject webkit2gtk",
      "A display is required (WSL needs WSLg or X11).",
    ].join("\n");
  }
  if (platform === "win32") {
    return [
      "App window needs WebView2 and the C# compiler (csc).",
      "WebView2: https://developer.microsoft.com/en-us/microsoft-edge/webview2/",
      "csc: install .NET Framework 4.x (included on Windows) or Visual Studio Build Tools.",
    ].join("\n");
  }
  return "start:window supports macOS, Linux, and Windows. Use npm start and open the printed URL.";
}

export function killWindowArgs(platform, { pid, pattern } = {}) {
  if (platform === "win32") {
    if (pid == null) return null;
    return { file: "taskkill", args: ["/pid", String(pid), "/t", "/f"] };
  }
  if (pattern) return { file: "pkill", args: ["-f", String(pattern)] };
  if (pid != null) return { file: "kill", args: ["-TERM", String(pid)] };
  return null;
}

export function leftoverPatterns(platform) {
  if (platform === "darwin") {
    return [WRAPPER_APP, `user-data-dir=${APP_WINDOW_DIR}`, `${WRAPPER_APP}/Contents/MacOS/applet`];
  }
  if (platform === "linux") {
    return [OVERVIEW_WINDOW_PY, LINUX_BINARY];
  }
  return [];
}

export function hasDisplay(env = process.env) {
  return Boolean(env.WAYLAND_DISPLAY || env.DISPLAY);
}

export function nativeArch(arch = process.arch) {
  if (arch === "ia32") return "x86";
  if (arch === "arm64") return "arm64";
  return "x64";
}

export function sourcePng() {
  const png = path.join(APP_ROOT, "public/assets/icon-512.png");
  return fs.existsSync(png) ? png : "";
}

export function whichBin(name, platform = process.platform) {
  const finder = platform === "win32" ? "where" : "which";
  const found = spawnSync(finder, [name], { encoding: "utf8" });
  if (found.status === 0 && found.stdout.trim()) {
    return found.stdout.trim().split(/\r?\n/)[0].trim();
  }
  return null;
}

export function writePngIco(pngPath, icoPath) {
  const png = fs.readFileSync(pngPath);
  const headerSize = 6;
  const entrySize = 16;
  const imageOffset = headerSize + entrySize;
  const buf = Buffer.alloc(imageOffset + png.length);
  buf.writeUInt16LE(0, 0);
  buf.writeUInt16LE(1, 2);
  buf.writeUInt16LE(1, 4);
  buf.writeUInt8(0, 6);
  buf.writeUInt8(0, 7);
  buf.writeUInt8(0, 8);
  buf.writeUInt8(0, 9);
  buf.writeUInt16LE(1, 10);
  buf.writeUInt16LE(32, 12);
  buf.writeUInt32LE(png.length, 14);
  buf.writeUInt32LE(imageOffset, 18);
  png.copy(buf, imageOffset);
  fs.mkdirSync(path.dirname(icoPath), { recursive: true });
  fs.writeFileSync(icoPath, buf);
  return icoPath;
}

function writePid(pid) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(WINDOW_PID_PATH, String(pid));
}

function readPidFile() {
  if (!fs.existsSync(WINDOW_PID_PATH)) return null;
  const pid = Number(fs.readFileSync(WINDOW_PID_PATH, "utf8").trim());
  return pid || null;
}

export function killPidFile(platform = process.platform) {
  const pid = readPidFile();
  fs.rmSync(WINDOW_PID_PATH, { force: true });
  if (!pid) return;
  const spec = killWindowArgs(platform, { pid });
  if (!spec) return;
  spawnSync(spec.file, spec.args, { stdio: "ignore" });
}

export function pkillPatterns(platform, patterns = leftoverPatterns(platform)) {
  for (const pattern of patterns) {
    const spec = killWindowArgs(platform, { pattern });
    if (!spec) continue;
    spawnSync(spec.file, spec.args, { stdio: "ignore" });
  }
}

export function spawnTrackedWindow(file, args, { onClosed, platform = process.platform } = {}) {
  closeTrackedWindow(platform);
  const child = spawn(file, args, { stdio: "ignore" });
  trackedChild = child;
  if (child.pid) writePid(child.pid);
  let started = false;
  child.on("spawn", () => {
    started = true;
  });
  child.on("error", (error) => {
    console.error("Failed to open app window:", error.message);
  });
  child.on("exit", () => {
    if (trackedChild === child) trackedChild = null;
    if (readPidFile() === child.pid) fs.rmSync(WINDOW_PID_PATH, { force: true });
    if (started) onClosed?.();
  });
  return child;
}

export function closeTrackedWindow(platform = process.platform) {
  const child = trackedChild;
  trackedChild = null;
  if (child?.pid) {
    const spec = killWindowArgs(platform, { pid: child.pid });
    if (spec) spawnSync(spec.file, spec.args, { stdio: "ignore" });
  }
  killPidFile(platform);
}

export function webView2RegQueryArgs(hive = "HKLM") {
  return [
    "query",
    `${hive}\\SOFTWARE\\Microsoft\\EdgeUpdate\\ClientState\\${WEBVIEW2_GUID}`,
    "/v",
    "EBWebView",
    "/reg:32",
  ];
}

/**
 * Linux --window backend: Python WebKitGTK, else a small GTK C helper.
 * Does not call xdg-open or spawn Chrome.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { CACHE_DIR, OVERVIEW_URL } from "./commands.mjs";
import {
  APP_NAME,
  LINUX_BINARY,
  OVERVIEW_WINDOW_C,
  OVERVIEW_WINDOW_PY,
  closeTrackedWindow,
  hasDisplay,
  helperArgv,
  installHint,
  leftoverPatterns,
  pkillPatterns,
  sourcePng,
  spawnTrackedWindow,
  whichBin,
} from "./app-window-shared.mjs";

const STAMP_PATH = `${LINUX_BINARY}.stamp`;
const STAMP_VERSION = "webview-linux-1";
const WEBKIT_PKGS = ["webkit2gtk-4.1", "webkit2gtk-4.0"];

function findPython() {
  for (const name of ["python3", "python"]) {
    if (whichBin(name)) return name;
  }
  return null;
}

function pythonHasWebKit(python) {
  const result = spawnSync(python, [OVERVIEW_WINDOW_PY, "--check"], {
    encoding: "utf8",
    timeout: 15000,
  });
  return result.status === 0;
}

function findCc() {
  for (const name of ["cc", "gcc", "clang"]) {
    if (whichBin(name)) return name;
  }
  return null;
}

function pkgConfigFlags(pkg) {
  const result = spawnSync("pkg-config", ["--cflags", "--libs", pkg], { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout.trim()) return null;
  return result.stdout.trim().split(/\s+/).filter(Boolean);
}

function cStamp(pkg) {
  const hash = crypto.createHash("sha1").update(fs.readFileSync(OVERVIEW_WINDOW_C)).digest("hex").slice(0, 12);
  return `${STAMP_VERSION}\n${pkg}\n${hash}\n`;
}

function linuxBinaryIsCurrent(pkg) {
  return (
    fs.existsSync(LINUX_BINARY) &&
    fs.existsSync(STAMP_PATH) &&
    fs.readFileSync(STAMP_PATH, "utf8") === cStamp(pkg)
  );
}

function compileCHelper(cc, pkg, flags) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const compiled = spawnSync(cc, ["-O2", "-o", LINUX_BINARY, OVERVIEW_WINDOW_C, ...flags], {
    encoding: "utf8",
  });
  if (compiled.status !== 0 || !fs.existsSync(LINUX_BINARY)) {
    throw new Error((compiled.stderr || compiled.stdout || `${cc} failed (${pkg})`).trim());
  }
  fs.chmodSync(LINUX_BINARY, 0o755);
  fs.writeFileSync(STAMP_PATH, cStamp(pkg));
}

function tryCompileC() {
  const cc = findCc();
  if (!cc || !whichBin("pkg-config")) return false;
  for (const pkg of WEBKIT_PKGS) {
    const flags = pkgConfigFlags(pkg);
    if (!flags) continue;
    if (!linuxBinaryIsCurrent(pkg)) compileCHelper(cc, pkg, flags);
    return fs.existsSync(LINUX_BINARY);
  }
  return false;
}

export function openAppWindow({ onClosed } = {}) {
  if (!hasDisplay()) {
    console.error("A display is required (WSL needs WSLg or X11).");
    console.error(installHint("linux"));
    return;
  }
  pkillPatterns("linux", leftoverPatterns("linux"));
  const icon = sourcePng();
  const args = helperArgv({ url: OVERVIEW_URL, title: APP_NAME, icon });
  try {
    const python = findPython();
    if (python && pythonHasWebKit(python)) {
      spawnTrackedWindow(python, [OVERVIEW_WINDOW_PY, ...args], { onClosed, platform: "linux" });
      console.log(`App window (${APP_NAME})  ${OVERVIEW_URL}`);
      return;
    }
    if (tryCompileC()) {
      spawnTrackedWindow(LINUX_BINARY, args, { onClosed, platform: "linux" });
      console.log(`App window (${APP_NAME})  ${OVERVIEW_URL}`);
      return;
    }
  } catch (error) {
    console.error("Failed to open app window:", error.message || error);
    return;
  }
  console.error(installHint("linux"));
}

export function closeAppWindow() {
  closeTrackedWindow("linux");
  pkillPatterns("linux", leftoverPatterns("linux"));
}

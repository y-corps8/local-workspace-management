/**
 * Windows --window backend: csc + WebView2 (no NuGet, no Edge --app).
 */
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CACHE_DIR, OVERVIEW_URL } from "../config/commands.mjs";
import {
  APP_NAME,
  OVERVIEW_WINDOW_CS,
  WIN32_EXE,
  WIN32_ICO,
  closeTrackedWindow,
  helperArgv,
  installHint,
  killPidFile,
  nativeArch,
  sourcePng,
  spawnTrackedWindow,
  webView2RegQueryArgs,
  whichBin,
  writePngIco,
} from "./app-window-shared.mjs";

const STAMP_PATH = `${WIN32_EXE}.stamp`;
const STAMP_VERSION = "webview-win32-1";

export function findCsc(env = process.env, platform = process.platform) {
  const windir = env.WINDIR || env.SystemRoot || "C:\\Windows";
  const candidates = [
    path.join(windir, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
    path.join(windir, "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return whichBin("csc", platform);
}

export function webView2Installed() {
  for (const hive of ["HKLM", "HKCU"]) {
    const result = spawnSync("reg", webView2RegQueryArgs(hive), { encoding: "utf8" });
    if (result.status === 0 && /EBWebView/i.test(result.stdout || "")) return true;
  }
  return false;
}

function csStamp(arch) {
  const hash = crypto.createHash("sha1").update(fs.readFileSync(OVERVIEW_WINDOW_CS)).digest("hex").slice(0, 12);
  return `${STAMP_VERSION}\n${arch}\n${hash}\n`;
}

function exeIsCurrent(arch) {
  return fs.existsSync(WIN32_EXE) && fs.existsSync(STAMP_PATH) && fs.readFileSync(STAMP_PATH, "utf8") === csStamp(arch);
}

function compileExe(csc, arch) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const png = sourcePng();
  const cscArgs = [
    "/nologo",
    "/t:winexe",
    `/platform:${arch}`,
    `/out:${WIN32_EXE}`,
    "/r:System.Windows.Forms.dll",
    "/r:System.Drawing.dll",
  ];
  if (png) {
    try {
      writePngIco(png, WIN32_ICO);
      cscArgs.push(`/win32icon:${WIN32_ICO}`);
    } catch {
      // window still opens without an exe icon
    }
  }
  cscArgs.push(OVERVIEW_WINDOW_CS);
  const compiled = spawnSync(csc, cscArgs, { encoding: "utf8" });
  if (compiled.status !== 0 || !fs.existsSync(WIN32_EXE)) {
    throw new Error((compiled.stderr || compiled.stdout || "csc failed").trim());
  }
  fs.writeFileSync(STAMP_PATH, csStamp(arch));
}

export function openAppWindow({ onClosed } = {}) {
  const csc = findCsc();
  if (!csc) {
    console.error(installHint("win32"));
    return;
  }
  if (!webView2Installed()) {
    console.error(installHint("win32"));
    return;
  }
  const arch = nativeArch();
  try {
    if (!exeIsCurrent(arch)) compileExe(csc, arch);
  } catch (error) {
    console.error("Failed to open app window:", error.message || error);
    return;
  }
  killPidFile("win32");
  const icon = fs.existsSync(WIN32_ICO) ? WIN32_ICO : sourcePng();
  const args = helperArgv({ url: OVERVIEW_URL, title: APP_NAME, icon });
  spawnTrackedWindow(WIN32_EXE, args, { onClosed, platform: "win32" });
  console.log(`App window (${APP_NAME})  ${OVERVIEW_URL}`);
}

export function closeAppWindow() {
  closeTrackedWindow("win32");
}

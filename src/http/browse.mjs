/**
 * Native folder picker for Settings Browse. macOS osascript, Linux zenity/kdialog,
 * Windows PowerShell FolderBrowserDialog.
 */
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";

const BROWSE_SCRIPT = `tell application "Finder"
  activate
  POSIX path of (choose folder with prompt "Select a folder")
end tell`;

export function whichBin(name) {
  const finder = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(finder, [name], { encoding: "utf8" });
  return result.status === 0 && Boolean((result.stdout || "").trim());
}

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

export async function browseFolder() {
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

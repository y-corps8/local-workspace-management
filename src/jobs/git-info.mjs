/**
 * Git branch + dirty flag for status. 8s cache per repo root.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const GIT_CACHE_MS = 8000;
const gitCache = new Map();

export function spawnGit(args, cwd) {
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
export async function gitInfo(repoRoot) {
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

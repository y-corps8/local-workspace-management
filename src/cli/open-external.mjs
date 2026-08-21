/**
 * Open a URL or folder with the OS default handler. No extra packages.
 * macOS: open · Linux: xdg-open · Windows: explorer (no cmd /c start).
 */

const UNSAFE_URL_RE = /[&|^<>%\s]/;

export function assertOpenUrl(url) {
  const target = String(url || "");
  if (!/^https?:\/\//i.test(target) || UNSAFE_URL_RE.test(target)) {
    throw new Error("invalid_url");
  }
  return target;
}

export function openUrlArgs(url, platform = process.platform) {
  const target = assertOpenUrl(url);
  if (platform === "darwin") return { file: "open", args: [target] };
  if (platform === "win32") return { file: "explorer", args: [target] };
  return { file: "xdg-open", args: [target] };
}

export function openPathArgs(dir, platform = process.platform) {
  const target = String(dir || "");
  if (platform === "darwin") return { file: "open", args: [target] };
  if (platform === "win32") return { file: "explorer", args: [target] };
  return { file: "xdg-open", args: [target] };
}

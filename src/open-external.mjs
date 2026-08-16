/**
 * Open a URL or folder with the OS default handler. No extra packages.
 * macOS: open · Linux: xdg-open · Windows: cmd /c start ""
 */

export function openUrlArgs(url, platform = process.platform) {
  const target = String(url || "");
  if (platform === "darwin") return { file: "open", args: [target] };
  if (platform === "win32") return { file: "cmd", args: ["/c", "start", "", target] };
  return { file: "xdg-open", args: [target] };
}

export function openPathArgs(dir, platform = process.platform) {
  const target = String(dir || "");
  if (platform === "darwin") return { file: "open", args: [target] };
  if (platform === "win32") return { file: "explorer", args: [target] };
  return { file: "xdg-open", args: [target] };
}

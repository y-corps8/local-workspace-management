/**
 * Dedicated dashboard window for --window / --open.
 *
 * Native WebView per OS (macOS WKWebView, Linux WebKitGTK, Windows WebView2).
 * Does not spawn Chrome. Does not open the default browser. Closing the window
 * stops the server via onClosed.
 */
import { installHint, windowPlatform } from "./app-window-shared.mjs";
import * as darwin from "./app-window-darwin.mjs";
import * as linux from "./app-window-linux.mjs";
import * as win32 from "./app-window-win32.mjs";

export {
  APP_NAME,
  APP_WINDOW_DIR,
  WRAPPER_APP,
  LINUX_BINARY,
  WIN32_EXE,
  OVERVIEW_WINDOW_PY,
  OVERVIEW_WINDOW_C,
  OVERVIEW_WINDOW_CS,
  helperArgv,
  hasDisplay,
  installHint,
  killWindowArgs,
  leftoverPatterns,
  nativeArch,
  sourcePng,
  webView2RegQueryArgs,
  windowPlatform,
  writePngIco,
} from "./app-window-shared.mjs";

export { findCsc } from "./app-window-win32.mjs";

export function openAppWindow({ onClosed } = {}, platform = process.platform) {
  const os = windowPlatform(platform);
  if (!os) {
    console.error(installHint(platform));
    return;
  }
  if (os === "darwin") return darwin.openAppWindow({ onClosed });
  if (os === "linux") return linux.openAppWindow({ onClosed });
  return win32.openAppWindow({ onClosed });
}

export function closeAppWindow(platform = process.platform) {
  const os = windowPlatform(platform);
  if (os === "darwin") return darwin.closeAppWindow();
  if (os === "linux") return linux.closeAppWindow();
  if (os === "win32") return win32.closeAppWindow();
}

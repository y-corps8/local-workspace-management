/**
 * macOS --window backend: Swift WKWebView .app with Dock icon from public/assets/.
 * Does not spawn Chrome. `open -W` waits until the app quits.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { APP_ROOT, CACHE_DIR, OVERVIEW_URL } from "./commands.mjs";
import { APP_NAME, APP_WINDOW_DIR, WRAPPER_APP } from "./app-window-shared.mjs";

const BUNDLE_ID = "com.local-workspace-management.overview";
const EXECUTABLE = "Overview";
const STAMP_PATH = path.join(CACHE_DIR, "workspace-overview.stamp");
const SWIFT_PATH = path.join(CACHE_DIR, "Overview.swift");
const STAMP_VERSION = "webview-1";

function findSwiftc() {
  const found = spawnSync("which", ["swiftc"], { encoding: "utf8" });
  if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  if (fs.existsSync("/usr/bin/swiftc")) return "/usr/bin/swiftc";
  return null;
}

function sourcePng() {
  const png = path.join(APP_ROOT, "public/assets/icon-512.png");
  if (fs.existsSync(png)) return png;
  const fallback = path.join(CACHE_DIR, "icon-512.png");
  const svg = path.join(APP_ROOT, "public/assets/icon.svg");
  if (!fs.existsSync(svg)) return null;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  spawnSync("qlmanage", ["-t", "-s", "512", "-o", CACHE_DIR, svg], { stdio: "ignore" });
  const generated = path.join(CACHE_DIR, "icon.svg.png");
  if (fs.existsSync(generated)) {
    fs.copyFileSync(generated, fallback);
    return fallback;
  }
  return null;
}

function writeIcns(destIcns) {
  const src = sourcePng();
  if (!src) return false;
  const iconset = path.join(CACHE_DIR, "app-window-icon.iconset");
  fs.rmSync(iconset, { recursive: true, force: true });
  fs.mkdirSync(iconset, { recursive: true });
  const sizes = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"],
  ];
  for (const [px, name] of sizes) {
    spawnSync("sips", ["-z", String(px), String(px), src, "--out", path.join(iconset, name)], {
      stdio: "ignore",
    });
  }
  const result = spawnSync("iconutil", ["-c", "icns", iconset, "-o", destIcns], { stdio: "ignore" });
  fs.rmSync(iconset, { recursive: true, force: true });
  return result.status === 0 && fs.existsSync(destIcns);
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function wrapperStamp() {
  return `${STAMP_VERSION}\n${OVERVIEW_URL}\n`;
}

function wrapperIsCurrent() {
  const icns = path.join(WRAPPER_APP, "Contents/Resources/AppIcon.icns");
  const binary = path.join(WRAPPER_APP, "Contents/MacOS", EXECUTABLE);
  const plist = path.join(WRAPPER_APP, "Contents/Info.plist");
  if (!fs.existsSync(icns) || !fs.existsSync(binary) || !fs.existsSync(plist)) return false;
  const body = fs.readFileSync(plist, "utf8");
  if (!body.includes(BUNDLE_ID) || !body.includes("AppIcon") || body.includes("applet")) return false;
  return fs.existsSync(STAMP_PATH) && fs.readFileSync(STAMP_PATH, "utf8") === wrapperStamp();
}

function swiftSource() {
  const url = JSON.stringify(OVERVIEW_URL);
  const title = JSON.stringify(APP_NAME);
  return `import Cocoa
import WebKit

let overviewURL = ${url}
let windowTitle = ${title}

final class AppDelegate: NSObject, NSApplicationDelegate {
  var window: NSWindow!

  func applicationDidFinishLaunching(_ notification: Notification) {
    let rect = NSRect(x: 0, y: 0, width: 1440, height: 900)
    window = NSWindow(
      contentRect: rect,
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false
    )
    window.title = windowTitle
    window.minSize = NSSize(width: 800, height: 600)
    window.center()
    window.setFrameAutosaveName("WorkspaceOverview")

    let webView = WKWebView(frame: window.contentView!.bounds)
    webView.autoresizingMask = [.width, .height]
    if let url = URL(string: overviewURL) {
      webView.load(URLRequest(url: url))
    }
    window.contentView = webView
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    return true
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    true
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
`;
}

function writeInfoPlist() {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>en</string>
	<key>CFBundleExecutable</key>
	<string>${EXECUTABLE}</string>
	<key>CFBundleIconFile</key>
	<string>AppIcon</string>
	<key>CFBundleIdentifier</key>
	<string>${xmlEscape(BUNDLE_ID)}</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>${xmlEscape(APP_NAME)}</string>
	<key>CFBundleDisplayName</key>
	<string>${xmlEscape(APP_NAME)}</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>1.0</string>
	<key>CFBundleVersion</key>
	<string>1</string>
	<key>LSMinimumSystemVersion</key>
	<string>12.0</string>
	<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSAllowsLocalNetworking</key>
		<true/>
	</dict>
	<key>NSHighResolutionCapable</key>
	<true/>
	<key>NSPrincipalClass</key>
	<string>NSApplication</string>
</dict>
</plist>
`;
  fs.writeFileSync(path.join(WRAPPER_APP, "Contents/Info.plist"), plist);
}

function writeWrapper(swiftc) {
  fs.rmSync(WRAPPER_APP, { recursive: true, force: true });
  const macos = path.join(WRAPPER_APP, "Contents/MacOS");
  const resources = path.join(WRAPPER_APP, "Contents/Resources");
  fs.mkdirSync(macos, { recursive: true });
  fs.mkdirSync(resources, { recursive: true });
  fs.writeFileSync(path.join(WRAPPER_APP, "Contents/PkgInfo"), "APPL????");
  writeInfoPlist();
  const icns = path.join(resources, "AppIcon.icns");
  if (!writeIcns(icns)) {
    console.error("Could not build AppIcon.icns from public/assets/icon-512.png or public/assets/icon.svg.");
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(SWIFT_PATH, swiftSource());
  const binary = path.join(macos, EXECUTABLE);
  const compiled = spawnSync(
    swiftc,
    ["-O", "-o", binary, SWIFT_PATH, "-framework", "Cocoa", "-framework", "WebKit"],
    { encoding: "utf8" }
  );
  if (compiled.status !== 0 || !fs.existsSync(binary)) {
    throw new Error((compiled.stderr || compiled.stdout || "swiftc failed").trim());
  }
  fs.chmodSync(binary, 0o755);
  spawnSync("codesign", ["--force", "--sign", "-", "--deep", WRAPPER_APP], { stdio: "ignore" });
  fs.writeFileSync(STAMP_PATH, wrapperStamp());
}

function killLeftoverChrome() {
  spawn("pkill", ["-f", `user-data-dir=${APP_WINDOW_DIR}`], { stdio: "ignore" });
}

function killStaleApplet() {
  spawn("pkill", ["-f", `${WRAPPER_APP}/Contents/MacOS/applet`], { stdio: "ignore" });
}

function killWrapper() {
  spawn("pkill", ["-f", WRAPPER_APP], { stdio: "ignore" });
}

function openWrapper(onClosed) {
  const child = spawn("open", ["-W", WRAPPER_APP], { stdio: "ignore" });
  child.on("error", (error) => {
    console.error("Failed to open app window:", error.message);
  });
  child.on("exit", () => {
    onClosed?.();
  });
}

export function openAppWindow({ onClosed } = {}) {
  const swiftc = findSwiftc();
  if (!swiftc) {
    console.error("swiftc not found. Install Xcode Command Line Tools: xcode-select --install");
    return;
  }
  try {
    const rebuild = !wrapperIsCurrent();
    if (rebuild) {
      killWrapper();
      writeWrapper(swiftc);
    }
    killStaleApplet();
    killLeftoverChrome();
    setTimeout(() => {
      openWrapper(onClosed);
      console.log(`App window (${APP_NAME})  ${OVERVIEW_URL}`);
    }, 400).unref();
  } catch (error) {
    console.error("Failed to open app window:", error.message || error);
  }
}

export function closeAppWindow() {
  killWrapper();
  killLeftoverChrome();
}

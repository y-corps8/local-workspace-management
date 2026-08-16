import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  APP_NAME,
  OVERVIEW_WINDOW_PY,
  findCsc,
  hasDisplay,
  helperArgv,
  installHint,
  killWindowArgs,
  leftoverPatterns,
  nativeArch,
  openAppWindow,
  webView2RegQueryArgs,
  windowPlatform,
  writePngIco,
} from "../src/app-window.mjs";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

test("windowPlatform allows darwin, linux, and win32", () => {
  assert.equal(windowPlatform("darwin"), "darwin");
  assert.equal(windowPlatform("linux"), "linux");
  assert.equal(windowPlatform("win32"), "win32");
  assert.equal(windowPlatform("freebsd"), null);
});

test("openAppWindow on an unsupported OS logs and does not throw", () => {
  const errors = [];
  const orig = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try {
    openAppWindow({}, "freebsd");
  } finally {
    console.error = orig;
  }
  assert.match(errors.join("\n"), /macOS, Linux, and Windows/);
});

test("helperArgv is url, title, icon", () => {
  assert.deepEqual(
    helperArgv({
      url: "http://127.0.0.1:4174",
      title: "Workspace Overview",
      icon: "/tmp/icon.png",
    }),
    ["http://127.0.0.1:4174", "Workspace Overview", "/tmp/icon.png"]
  );
  assert.equal(helperArgv().length, 3);
  assert.equal(helperArgv()[0], "http://127.0.0.1:4174");
  assert.equal(helperArgv()[1], APP_NAME);
  assert.equal(helperArgv({ icon: "" })[2], "");
});

test("killWindowArgs uses taskkill on win32 and pkill/kill on unix", () => {
  assert.deepEqual(killWindowArgs("win32", { pid: 42 }), {
    file: "taskkill",
    args: ["/pid", "42", "/t", "/f"],
  });
  assert.deepEqual(killWindowArgs("linux", { pattern: OVERVIEW_WINDOW_PY }), {
    file: "pkill",
    args: ["-f", OVERVIEW_WINDOW_PY],
  });
  assert.deepEqual(killWindowArgs("darwin", { pattern: "/tmp/Workspace Overview.app" }), {
    file: "pkill",
    args: ["-f", "/tmp/Workspace Overview.app"],
  });
  assert.deepEqual(killWindowArgs("linux", { pid: 9 }), {
    file: "kill",
    args: ["-TERM", "9"],
  });
  assert.equal(killWindowArgs("win32", {}), null);
});

test("leftoverPatterns are native helper paths, not a browser", () => {
  const linux = leftoverPatterns("linux");
  assert.ok(linux.some((p) => p.endsWith("overview-window.py")));
  assert.ok(linux.some((p) => p.endsWith("overview-window")));
  const darwin = leftoverPatterns("darwin");
  assert.ok(darwin.some((p) => p.includes("Workspace Overview.app")));
  assert.ok(darwin.some((p) => p.includes("user-data-dir=")));
  assert.deepEqual(leftoverPatterns("win32"), []);
});

test("installHint names the OS WebView toolchain", () => {
  assert.match(installHint("darwin"), /swiftc/);
  assert.match(installHint("linux"), /WebKitGTK/);
  assert.match(installHint("linux"), /python3-gi/);
  assert.match(installHint("win32"), /WebView2/);
  assert.match(installHint("win32"), /csc/);
  assert.match(installHint("freebsd"), /macOS, Linux, and Windows/);
});

test("hasDisplay reads DISPLAY or WAYLAND_DISPLAY", () => {
  assert.equal(hasDisplay({}), false);
  assert.equal(hasDisplay({ DISPLAY: ":0" }), true);
  assert.equal(hasDisplay({ WAYLAND_DISPLAY: "wayland-0" }), true);
});

test("nativeArch maps Node process.arch", () => {
  assert.equal(nativeArch("x64"), "x64");
  assert.equal(nativeArch("ia32"), "x86");
  assert.equal(nativeArch("arm64"), "arm64");
});

test("findCsc prefers Framework64 csc.exe", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "csc-"));
  const csc = path.join(root, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
  fs.mkdirSync(path.dirname(csc), { recursive: true });
  fs.writeFileSync(csc, "");
  assert.equal(findCsc({ WINDIR: root }, "linux"), csc);
});

test("webView2RegQueryArgs uses the 32-bit ClientState key", () => {
  assert.deepEqual(webView2RegQueryArgs("HKLM"), [
    "query",
    "HKLM\\SOFTWARE\\Microsoft\\EdgeUpdate\\ClientState\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "/v",
    "EBWebView",
    "/reg:32",
  ]);
  assert.equal(webView2RegQueryArgs("HKCU")[1].startsWith("HKCU\\"), true);
});

test("writePngIco wraps a PNG in an ICO header", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ico-"));
  const png = path.join(dir, "icon.png");
  const ico = path.join(dir, "icon.ico");
  fs.writeFileSync(png, PNG_1X1);
  writePngIco(png, ico);
  const buf = fs.readFileSync(ico);
  assert.equal(buf.readUInt16LE(0), 0);
  assert.equal(buf.readUInt16LE(2), 1);
  assert.equal(buf.readUInt16LE(4), 1);
  assert.equal(buf.readUInt32LE(14), PNG_1X1.length);
  assert.equal(buf.readUInt32LE(18), 22);
  assert.ok(buf.slice(22).equals(PNG_1X1));
});

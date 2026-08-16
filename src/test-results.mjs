/**
 * Last test-run summaries for configured projects.
 *
 * Reads local artifacts (gitignored coverage/ and Maven XML) and merges with
 * .cache/last-test-runs.json written after a test job from this UI.
 * Prefer the newer finishedAt. No project files are modified here.
 */
import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR, LAST_TEST_RUNS_PATH, REPOS } from "./commands.mjs";

const FAILED_NAME_CAP = 8;

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function fileMtimeIso(filePath) {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return null;
  }
}

function newestMtime(filePaths) {
  let newest = 0;
  let iso = null;
  for (const filePath of filePaths) {
    try {
      const mtime = fs.statSync(filePath).mtimeMs;
      if (mtime > newest) {
        newest = mtime;
        iso = new Date(mtime).toISOString();
      }
    } catch {
      // skip missing
    }
  }
  return iso;
}

function listFiles(dir, predicate) {
  try {
    return fs.readdirSync(dir).filter(predicate).map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

// ── Shared report shape ────────────────────────────────────────────────────

export function emptyReport() {
  return {
    status: "no_report",
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
    durationMs: null,
    finishedAt: null,
    coveragePct: null,
    commandId: null,
    commandLabel: null,
    failedNames: [],
    source: null,
  };
}

export function statusFromCounts({ failed, exitCode, success }) {
  if (typeof success === "boolean") {
    return success && (failed ?? 0) === 0 ? "pass" : "fail";
  }
  if (typeof exitCode === "number") {
    return exitCode === 0 && (failed ?? 0) === 0 ? "pass" : "fail";
  }
  return (failed ?? 0) > 0 ? "fail" : "pass";
}

// ── Jest ──────────────────────────────────────────────────────────────────

function parseJestFailedNames(data) {
  const names = [];
  for (const suite of data.testResults ?? []) {
    for (const assertion of suite.assertionResults ?? []) {
      if (assertion.status !== "failed") continue;
      names.push(assertion.fullName || assertion.title || "failed test");
      if (names.length >= FAILED_NAME_CAP) return names;
    }
  }
  return names;
}

function parseJestResults(repoRoot) {
  const jestPath = path.join(repoRoot, "coverage", "jest-results.json");
  const data = readJson(jestPath);
  if (!data) return null;

  const passed = Number(data.numPassedTests ?? 0);
  const failed = Number(data.numFailedTests ?? 0);
  const skipped = Number(data.numPendingTests ?? 0);
  const total = Number(data.numTotalTests ?? passed + failed + skipped);

  const suiteEnds = (data.testResults ?? [])
    .map((suite) => Number(suite.endTime || 0))
    .filter((value) => value > 0);
  const start = Number(data.startTime || 0);
  const end = suiteEnds.length ? Math.max(...suiteEnds) : start;
  const durationMs = start && end && end >= start ? end - start : null;
  const finishedAt =
    end > 0 ? new Date(end).toISOString() : start > 0 ? new Date(start).toISOString() : fileMtimeIso(jestPath);

  return {
    status: statusFromCounts({ failed, success: data.success }),
    passed,
    failed,
    skipped,
    total,
    durationMs,
    finishedAt,
    coveragePct: null,
    commandId: null,
    commandLabel: null,
    failedNames: parseJestFailedNames(data),
    source: "jest-results",
  };
}

/** Istanbul line % first; then optional schema/behavioral coverage summaries. */
function parseCoverageSummary(repoRoot) {
  const summary = readJson(path.join(repoRoot, "coverage", "coverage-summary.json"));
  const lines = summary?.total?.lines;
  if (lines && typeof lines.pct === "number") return lines.pct;

  const schema = readJson(path.join(repoRoot, "coverage", "schema-coverage-summary.json"));
  if (typeof schema?.summary?.coverage_pct === "number") return schema.summary.coverage_pct;

  const behavioral = readJson(path.join(repoRoot, "coverage", "behavioral-coverage-summary.json"));
  if (typeof behavioral?.summary?.coverage_pct === "number") return behavioral.summary.coverage_pct;

  return null;
}

// ── Maven Surefire / Failsafe ─────────────────────────────────────────────

function parseAttrs(attrText) {
  const attrs = {};
  const re = /([:\w-]+)="([^"]*)"/g;
  let match;
  while ((match = re.exec(attrText))) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function parseSurefireFile(xml) {
  const suiteMatch = xml.match(/<testsuite\b([^>]*)>/);
  if (!suiteMatch) return null;
  const attrs = parseAttrs(suiteMatch[1]);
  const tests = Number(attrs.tests ?? 0);
  const failures = Number(attrs.failures ?? 0);
  const errors = Number(attrs.errors ?? 0);
  const skipped = Number(attrs.skipped ?? 0);
  const timeSec = Number(attrs.time ?? 0);
  const failedNames = [];

  const caseRe = /<testcase\b([^>]*)>([\s\S]*?)<\/testcase>|<testcase\b([^>]*)\/>/g;
  let match;
  while ((match = caseRe.exec(xml))) {
    const caseAttrs = parseAttrs(match[1] || match[3] || "");
    const body = match[2] || "";
    if (/<(failure|error)\b/.test(body)) {
      const name = [caseAttrs.classname, caseAttrs.name].filter(Boolean).join(".");
      if (name) failedNames.push(name);
    }
  }

  return {
    tests,
    failures,
    errors,
    skipped,
    passed: Math.max(0, tests - failures - errors - skipped),
    durationMs: Number.isFinite(timeSec) ? Math.round(timeSec * 1000) : 0,
    failedNames,
  };
}

/** Prefer target/ reports; use coverage/ copies only when target/ is gone. */
function collectSurefireDirs(repoRoot) {
  const targetSurefire = path.join(repoRoot, "target", "surefire-reports");
  const targetFailsafe = path.join(repoRoot, "target", "failsafe-reports");
  const coverageFailsafe = path.join(repoRoot, "coverage", "failsafe-reports");
  const coverageSurefire = path.join(repoRoot, "coverage", "surefire-reports");
  const dirs = [];
  if (hasTestXml(targetSurefire)) dirs.push(targetSurefire);
  else if (hasTestXml(coverageSurefire)) dirs.push(coverageSurefire);
  if (hasTestXml(targetFailsafe)) dirs.push(targetFailsafe);
  else if (hasTestXml(coverageFailsafe)) dirs.push(coverageFailsafe);
  return dirs;
}

function hasTestXml(dir) {
  return listFiles(dir, (name) => name.startsWith("TEST-") && name.endsWith(".xml")).length > 0;
}

function parseMavenResults(repoRoot) {
  const xmlFiles = collectSurefireDirs(repoRoot).flatMap((dir) =>
    listFiles(dir, (name) => name.startsWith("TEST-") && name.endsWith(".xml"))
  );
  if (!xmlFiles.length) return null;

  let tests = 0;
  let failures = 0;
  let errors = 0;
  let skipped = 0;
  let durationMs = 0;
  const failedNames = [];

  for (const filePath of xmlFiles) {
    let xml;
    try {
      xml = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    const parsed = parseSurefireFile(xml);
    if (!parsed) continue;
    tests += parsed.tests;
    failures += parsed.failures;
    errors += parsed.errors;
    skipped += parsed.skipped;
    durationMs += parsed.durationMs;
    for (const name of parsed.failedNames) {
      if (failedNames.length < FAILED_NAME_CAP) failedNames.push(name);
    }
  }

  const failed = failures + errors;
  return {
    status: statusFromCounts({ failed }),
    passed: Math.max(0, tests - failed - skipped),
    failed,
    skipped,
    total: tests,
    durationMs: durationMs || null,
    finishedAt: newestMtime(xmlFiles),
    coveragePct: null,
    commandId: null,
    commandLabel: null,
    failedNames,
    source: "surefire",
  };
}

// ── Coverage % ─────────────────────────────────────────────────────────────

function parseJacocoCsv(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const header = lines[0].split(",");
  const missedIdx = header.indexOf("LINE_MISSED");
  const coveredIdx = header.indexOf("LINE_COVERED");
  if (missedIdx < 0 || coveredIdx < 0) return null;

  let missed = 0;
  let covered = 0;
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    missed += Number(cols[missedIdx] || 0);
    covered += Number(cols[coveredIdx] || 0);
  }
  const total = missed + covered;
  return total ? Math.round((1000 * covered) / total) / 10 : 0;
}

function parseMavenCoverage(repoRoot) {
  const candidates = [
    path.join(repoRoot, "coverage", "jacoco.csv"),
    path.join(repoRoot, "target", "site", "jacoco", "jacoco.csv"),
  ];
  for (const filePath of candidates) {
    const pct = parseJacocoCsv(filePath);
    if (pct != null) return pct;
  }
  return null;
}

// ── Snapshot merge ─────────────────────────────────────────────────────────
// After an overview-launched test job, server.mjs writes a snapshot. If that
// finishedAt is newer than the artifact, the snapshot wins (and keeps coverage
// from the artifact when the snapshot has none).

function loadSnapshots() {
  return readJson(LAST_TEST_RUNS_PATH) ?? {};
}

export function saveTestSnapshot(repoId, snapshot) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const all = loadSnapshots();
  all[repoId] = snapshot;
  fs.writeFileSync(LAST_TEST_RUNS_PATH, JSON.stringify(all, null, 2));
}

function artifactForRepo(repo) {
  if (repo.testKind === "maven") {
    const report = parseMavenResults(repo.root);
    if (!report) return null;
    report.coveragePct = parseMavenCoverage(repo.root);
    return report;
  }
  const report = parseJestResults(repo.root);
  if (!report) return null;
  report.coveragePct = parseCoverageSummary(repo.root);
  return report;
}

export function readTestArtifact(repoId) {
  const repo = REPOS[repoId];
  if (!repo) return null;
  return artifactForRepo(repo);
}

function newerIso(a, b) {
  if (!a) return false;
  if (!b) return true;
  return Date.parse(a) > Date.parse(b);
}

export function mergeReport(artifact, snapshot) {
  if (!artifact && !snapshot) return emptyReport();
  if (!artifact) {
    return {
      ...emptyReport(),
      ...snapshot,
      status: snapshot.status ?? statusFromCounts(snapshot),
      source: snapshot.source ?? "snapshot",
    };
  }
  if (!snapshot || !newerIso(snapshot.finishedAt, artifact.finishedAt)) {
    return {
      ...emptyReport(),
      ...artifact,
      commandId: snapshot?.commandId ?? artifact.commandId,
      commandLabel: snapshot?.commandLabel ?? artifact.commandLabel,
    };
  }
  return {
    ...emptyReport(),
    ...artifact,
    ...snapshot,
    coveragePct: snapshot.coveragePct ?? artifact.coveragePct,
    failedNames: snapshot.failedNames?.length ? snapshot.failedNames : artifact.failedNames,
    status: snapshot.status ?? statusFromCounts(snapshot),
    source: "snapshot",
  };
}

export function readLastTestRun(repoId) {
  const repo = REPOS[repoId];
  if (!repo) return emptyReport();
  const snapshots = loadSnapshots();
  const artifact = artifactForRepo(repo);
  const snapshot = snapshots[repoId] ?? null;
  return mergeReport(artifact, snapshot);
}

export function readAllLastTestRuns() {
  const snapshots = loadSnapshots();
  const result = {};
  for (const repoId of Object.keys(REPOS)) {
    const repo = REPOS[repoId];
    if (!repo) continue;
    result[repoId] = mergeReport(artifactForRepo(repo), snapshots[repoId] ?? null);
  }
  return result;
}

/** Build the cache row written when an overview test job exits. */
export function snapshotFromJob({ repoId, commandId, commandLabel, exitCode, startedAt, finishedAt, artifact }) {
  const counts = artifact ?? {};
  return {
    status: statusFromCounts({
      failed: counts.failed,
      exitCode,
      success: exitCode === 0 && (counts.failed ?? 0) === 0,
    }),
    passed: counts.passed ?? 0,
    failed: counts.failed ?? 0,
    skipped: counts.skipped ?? 0,
    total: counts.total ?? 0,
    durationMs: startedAt && finishedAt ? Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)) : counts.durationMs ?? null,
    finishedAt,
    coveragePct: counts.coveragePct ?? null,
    commandId,
    commandLabel,
    failedNames: counts.failedNames ?? [],
    source: "snapshot",
    exitCode,
  };
}

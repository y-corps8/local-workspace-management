/**
 * Merge a Probe-discovered command with one already on the project.
 * Probe's jestJson wins so Vitest/Playwright do not keep a stale Jest flag.
 */
export function mergeDiscoveredCommand(discovered, existing) {
  return {
    ...discovered,
    ...existing,
    argv: existing.argv || discovered.argv,
    jestJson: discovered.jestJson,
  };
}

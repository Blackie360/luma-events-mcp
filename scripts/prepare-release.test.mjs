import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  compareVersions,
  incrementPatch,
  parseStableVersion,
  selectNextVersion,
  syncVersion
} from "./prepare-release.mjs";

test("stable version helpers compare and increment semantic versions", () => {
  assert.deepEqual(parseStableVersion("0.7.0"), [0, 7, 0]);
  assert.equal(compareVersions("0.7.0", "0.6.9"), 1);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.equal(incrementPatch("1.2.9"), "1.2.10");
  assert.throws(() => parseStableVersion("1.2.3-beta.1"), /stable semantic version/);
});

test("version selection publishes an unpublished forward version, then advances patches", () => {
  assert.equal(selectNextVersion("0.7.0", ["0.5.1", "0.5.2"]), "0.7.0");
  assert.equal(selectNextVersion("0.7.0", ["0.5.2", "0.7.0"]), "0.7.1");
  assert.equal(selectNextVersion("0.7.0", ["0.7.0", "0.8.0"]), "0.8.1");
  assert.equal(selectNextVersion("0.7.0", []), "0.7.0");
});

test("version synchronization updates package, plugin, and runtime metadata", () => {
  const root = mkdtempSync(join(tmpdir(), "luma-release-version-"));
  cpSync("package.json", join(root, "package.json"));
  cpSync(".cursor-plugin", join(root, ".cursor-plugin"), { recursive: true });
  cpSync(".codex-plugin", join(root, ".codex-plugin"), { recursive: true });
  cpSync("src", join(root, "src"), { recursive: true });
  syncVersion("1.2.3", new Date("2026-07-29T08:00:00Z"), root);

  assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version, "1.2.3");
  assert.equal(
    JSON.parse(readFileSync(join(root, ".cursor-plugin", "plugin.json"), "utf8")).version,
    "1.2.3"
  );
  assert.equal(
    JSON.parse(readFileSync(join(root, ".codex-plugin", "plugin.json"), "utf8")).version,
    "1.2.3+codex.20260729"
  );
  assert.equal(
    readFileSync(join(root, "src", "version.ts"), "utf8"),
    'export const VERSION = "1.2.3";\n'
  );
});

import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseStableVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) {
    throw new Error(`Expected a stable semantic version, received "${value}".`);
  }
  return match.slice(1).map(Number);
}

export function compareVersions(left, right) {
  const leftParts = parseStableVersion(left);
  const rightParts = parseStableVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function incrementPatch(version) {
  const [major, minor, patch] = parseStableVersion(version);
  return `${major}.${minor}.${patch + 1}`;
}

export function selectNextVersion(currentVersion, publishedVersions) {
  parseStableVersion(currentVersion);
  const stablePublished = publishedVersions.filter((version) => {
    try {
      parseStableVersion(version);
      return true;
    } catch {
      return false;
    }
  });
  const highestPublished = stablePublished.sort(compareVersions).at(-1);
  const currentIsPublished = stablePublished.includes(currentVersion);

  if (!highestPublished) return currentVersion;
  if (!currentIsPublished && compareVersions(currentVersion, highestPublished) > 0) {
    return currentVersion;
  }
  const baseline = compareVersions(currentVersion, highestPublished) > 0
    ? currentVersion
    : highestPublished;
  return incrementPatch(baseline);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function syncVersion(version, date = new Date(), root = repositoryRoot) {
  parseStableVersion(version);
  const packagePath = resolve(root, "package.json");
  const cursorManifestPath = resolve(root, ".cursor-plugin", "plugin.json");
  const codexManifestPath = resolve(root, ".codex-plugin", "plugin.json");
  const sourceVersionPath = resolve(root, "src", "version.ts");

  const packageJson = readJson(packagePath);
  const cursorManifest = readJson(cursorManifestPath);
  const codexManifest = readJson(codexManifestPath);
  const sourceVersion = readFileSync(sourceVersionPath, "utf8");
  if (!/export const VERSION = "\d+\.\d+\.\d+";/.test(sourceVersion)) {
    throw new Error("Could not find the VERSION constant in src/version.ts.");
  }

  packageJson.version = version;
  cursorManifest.version = version;
  const dateSuffix = date.toISOString().slice(0, 10).replaceAll("-", "");
  codexManifest.version = `${version}+codex.${dateSuffix}`;

  writeJson(packagePath, packageJson);
  writeJson(cursorManifestPath, cursorManifest);
  writeJson(codexManifestPath, codexManifest);
  writeFileSync(
    sourceVersionPath,
    sourceVersion.replace(
      /export const VERSION = "\d+\.\d+\.\d+";/,
      `export const VERSION = "${version}";`
    )
  );
}

export function queryPublishedVersions(packageName) {
  try {
    const output = execFileSync(
      "npm",
      ["view", packageName, "versions", "--json", "--fetch-timeout=10000"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error
      ? String(error.stderr)
      : "";
    if (/E404|not found/i.test(stderr)) return [];
    throw error;
  }
}

export function isMainModule(entryPath = process.argv[1], moduleUrl = import.meta.url) {
  if (!entryPath) return false;
  try {
    return realpathSync(entryPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const packageJson = readJson(resolve(repositoryRoot, "package.json"));
  const publishedVersions = queryPublishedVersions(packageJson.name);
  const nextVersion = selectNextVersion(packageJson.version, publishedVersions);
  syncVersion(nextVersion);
  process.stdout.write(`${nextVersion}\n`);
}

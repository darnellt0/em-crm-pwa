import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const increment = process.argv[2] ?? "patch";
const allowedIncrements = new Set(["major", "minor", "patch"]);

if (!allowedIncrements.has(increment)) {
  throw new Error("Version increment must be major, minor, or patch.");
}

const packagePath = resolve(mobileRoot, "package.json");
const lockPath = resolve(mobileRoot, "package-lock.json");
const releaseVersionPath = resolve(mobileRoot, "release-version.json");
const mobilePackage = JSON.parse(await readFile(packagePath, "utf8"));
const packageLock = JSON.parse(await readFile(lockPath, "utf8"));
const releaseVersion = JSON.parse(await readFile(releaseVersionPath, "utf8"));
const versionMatch = /^(\d+)\.(\d+)\.(\d+)$/.exec(mobilePackage.version);

if (!versionMatch) {
  throw new Error("package.json version must use numeric major.minor.patch format.");
}
if (!Number.isInteger(releaseVersion.versionCode) || releaseVersion.versionCode < 1) {
  throw new Error("release-version.json versionCode must be a positive integer.");
}

let [major, minor, patch] = versionMatch.slice(1).map(Number);
if (increment === "major") {
  major += 1;
  minor = 0;
  patch = 0;
} else if (increment === "minor") {
  minor += 1;
  patch = 0;
} else {
  patch += 1;
}

const nextVersion = `${major}.${minor}.${patch}`;
mobilePackage.version = nextVersion;
packageLock.version = nextVersion;
packageLock.packages[""].version = nextVersion;
releaseVersion.versionCode += 1;

await Promise.all([
  writeFile(packagePath, `${JSON.stringify(mobilePackage, null, 2)}\n`, "utf8"),
  writeFile(lockPath, `${JSON.stringify(packageLock, null, 2)}\n`, "utf8"),
  writeFile(
    releaseVersionPath,
    `${JSON.stringify(releaseVersion, null, 2)}\n`,
    "utf8"
  ),
]);

execFileSync(
  process.execPath,
  [resolve(mobileRoot, "scripts", "sync-native-versions.mjs")],
  { stdio: "inherit" }
);
console.log(`Bumped mobile release to ${nextVersion} (${releaseVersion.versionCode}).`);

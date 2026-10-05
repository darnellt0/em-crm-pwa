import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = resolve(mobileRoot, "package.json");
const releaseVersionPath = resolve(mobileRoot, "release-version.json");
const xcodeProjectPath = resolve(
  mobileRoot,
  "ios",
  "App",
  "App.xcodeproj",
  "project.pbxproj"
);

const mobilePackage = JSON.parse(await readFile(packagePath, "utf8"));
const releaseVersion = JSON.parse(await readFile(releaseVersionPath, "utf8"));

if (!/^\d+\.\d+\.\d+$/.test(mobilePackage.version)) {
  throw new Error("package.json version must use numeric major.minor.patch format.");
}
if (!Number.isInteger(releaseVersion.versionCode) || releaseVersion.versionCode < 1) {
  throw new Error("release-version.json versionCode must be a positive integer.");
}

const originalProject = await readFile(xcodeProjectPath, "utf8");
const buildVersionPattern = /CURRENT_PROJECT_VERSION = [^;]+;/g;
const marketingVersionPattern = /MARKETING_VERSION = [^;]+;/g;
const buildVersionMatches = originalProject.match(buildVersionPattern) ?? [];
const marketingVersionMatches = originalProject.match(marketingVersionPattern) ?? [];

if (buildVersionMatches.length !== 2 || marketingVersionMatches.length !== 2) {
  throw new Error(
    "Expected exactly two iOS build-version and marketing-version settings."
  );
}

const updatedProject = originalProject
  .replaceAll(
    buildVersionPattern,
    `CURRENT_PROJECT_VERSION = ${releaseVersion.versionCode};`
  )
  .replaceAll(
    marketingVersionPattern,
    `MARKETING_VERSION = ${mobilePackage.version};`
  );

if (updatedProject !== originalProject) {
  await writeFile(xcodeProjectPath, updatedProject, "utf8");
  console.log(
    `Synced iOS to ${mobilePackage.version} (${releaseVersion.versionCode}).`
  );
} else {
  console.log(
    `Native versions already match ${mobilePackage.version} (${releaseVersion.versionCode}).`
  );
}

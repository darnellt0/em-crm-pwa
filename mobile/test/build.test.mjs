import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("build stamps the service-worker cache with shell content", async () => {
  execFileSync(process.execPath, [resolve(mobileRoot, "scripts", "build.mjs")], {
    cwd: mobileRoot,
    stdio: "pipe",
  });

  const serviceWorker = await readFile(resolve(mobileRoot, "www", "sw.js"), "utf8");
  assert.doesNotMatch(serviceWorker, /__CACHE_VERSION__/);
  assert.match(serviceWorker, /em-crm-mobile-shell-[a-f0-9]{16}/);
});

test("Android and iOS release versions match the mobile package", async () => {
  const mobilePackage = JSON.parse(
    await readFile(resolve(mobileRoot, "package.json"), "utf8")
  );
  const releaseVersion = JSON.parse(
    await readFile(resolve(mobileRoot, "release-version.json"), "utf8")
  );
  const xcodeProject = await readFile(
    resolve(mobileRoot, "ios", "App", "App.xcodeproj", "project.pbxproj"),
    "utf8"
  );

  assert.equal(
    (xcodeProject.match(
      new RegExp(`MARKETING_VERSION = ${mobilePackage.version.replaceAll(".", "\\.")};`, "g")
    ) ?? []).length,
    2
  );
  assert.equal(
    (xcodeProject.match(
      new RegExp(`CURRENT_PROJECT_VERSION = ${releaseVersion.versionCode};`, "g")
    ) ?? []).length,
    2
  );
});

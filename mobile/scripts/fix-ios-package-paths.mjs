import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageFile = resolve(projectRoot, "ios", "App", "CapApp-SPM", "Package.swift");

try {
  const contents = await readFile(packageFile, "utf8");
  const normalized = contents.replaceAll("\\", "/");
  if (normalized !== contents) {
    await writeFile(packageFile, normalized, "utf8");
    console.log("Normalized iOS Swift package paths for macOS.");
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

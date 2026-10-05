import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = resolve(projectRoot, "src");
const outputDir = resolve(projectRoot, "www");
const staticFiles = ["index.html", "styles.css"];
const cacheVersionPlaceholder = "__CACHE_VERSION__";

await Promise.all(
  ["app.js", "links.js", "sw.js", ...staticFiles].map((file) =>
    readFile(resolve(sourceDir, file), "utf8")
  )
);

await rm(outputDir, { force: true, recursive: true });
await mkdir(outputDir, { recursive: true });

await Promise.all(
  staticFiles.map((file) =>
    cp(resolve(sourceDir, file), resolve(outputDir, file))
  )
);

await build({
  entryPoints: [resolve(sourceDir, "app.js")],
  bundle: true,
  format: "esm",
  minify: true,
  outfile: resolve(outputDir, "app.js"),
  sourcemap: false,
  target: ["chrome120", "safari17"],
});

const shellContents = await Promise.all(
  ["index.html", "app.js", "styles.css"].map((file) =>
    readFile(resolve(outputDir, file))
  )
);
const cacheVersion = createHash("sha256")
  .update(Buffer.concat(shellContents))
  .digest("hex")
  .slice(0, 16);
const serviceWorkerTemplate = await readFile(resolve(sourceDir, "sw.js"), "utf8");
if (!serviceWorkerTemplate.includes(cacheVersionPlaceholder)) {
  throw new Error(`src/sw.js must contain ${cacheVersionPlaceholder}`);
}
await writeFile(
  resolve(outputDir, "sw.js"),
  serviceWorkerTemplate.replaceAll(cacheVersionPlaceholder, cacheVersion),
  "utf8"
);

console.log(`Built the EM CRM mobile shell in mobile/www (cache ${cacheVersion}).`);

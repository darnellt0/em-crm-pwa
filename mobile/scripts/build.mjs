import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = resolve(projectRoot, "src");
const outputDir = resolve(projectRoot, "www");
const staticFiles = ["index.html", "styles.css", "sw.js"];

await Promise.all(
  ["app.js", "links.js", ...staticFiles].map((file) =>
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

console.log("Built the EM CRM mobile shell in mobile/www.");

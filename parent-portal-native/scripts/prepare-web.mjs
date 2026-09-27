import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const nativeRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(nativeRoot, "..");
const sourceRoot = resolve(repositoryRoot, "parent-portal");
const outputRoot = resolve(nativeRoot, "www");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await cp(sourceRoot, outputRoot, { recursive: true });

let indexHtml = await readFile(resolve(outputRoot, "index.html"), "utf8");
indexHtml = indexHtml
  .replaceAll('href="../privacy-policy/"', 'href="legal/privacy/index.html"')
  .replaceAll('href="../terms-and-conditions/"', 'href="legal/terms/index.html"')
  .replaceAll('href="../teacher-portal/director-dashboard/assets/apple-touch-icon.png"', 'href="assets/app-icon-512.png"')
  .replaceAll('href="/"', 'href="index.html"');
await writeFile(resolve(outputRoot, "index.html"), indexHtml);

await mkdir(resolve(outputRoot, "legal/privacy"), { recursive: true });
await mkdir(resolve(outputRoot, "legal/terms"), { recursive: true });
await cp(resolve(repositoryRoot, "privacy-policy/index.html"), resolve(outputRoot, "legal/privacy/index.html"));
await cp(resolve(repositoryRoot, "terms-and-conditions/index.html"), resolve(outputRoot, "legal/terms/index.html"));
await cp(resolve(repositoryRoot, "assets/app-icon-512.png"), resolve(outputRoot, "assets/app-icon-512.png"));

const manifestPath = resolve(outputRoot, "manifest.webmanifest");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.start_url = "./index.html";
manifest.icons = [{
  src: "assets/app-icon-512.png",
  sizes: "512x512",
  type: "image/png",
  purpose: "any maskable"
}];
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Prepared Parent Portal web bundle at ${outputRoot}`);

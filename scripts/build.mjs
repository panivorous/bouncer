// bouncer — bundle step.
//
// Turns the `src/` tree into a loadable, unpacked extension in `dist/`:
//   1. clean dist/
//   2. compile src/background.ts -> dist/background.js (esbuild)
//   3. copy static assets (manifest.json, icons/, rules/) into dist/
//
// Packaging dist/ into per-browser .zip artifacts is done separately by the
// `build:chrome` / `build:firefox` npm scripts (web-ext). Run everything with
// `npm run build`.

import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = resolve(root, "src");
const distDir = resolve(root, "dist");

// 1. Clean.
await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

// 2. Compile TypeScript -> JavaScript. Bundling means future imports (e.g. the
//    webextension-polyfill) get inlined into the single service-worker file.
await build({
  entryPoints: [resolve(srcDir, "background.ts")],
  outfile: resolve(distDir, "background.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  logLevel: "info",
});

// 3. Copy static assets verbatim. `rules/` holds the static declarativeNetRequest
//    rulesets referenced by manifest.json (paths there are relative to the
//    extension root, so the files must exist at dist/rules/).
await cp(resolve(srcDir, "manifest.json"), resolve(distDir, "manifest.json"));
await cp(resolve(srcDir, "icons"), resolve(distDir, "icons"), { recursive: true });
await cp(resolve(srcDir, "rules"), resolve(distDir, "rules"), { recursive: true });

console.log("Bundled extension into dist/");

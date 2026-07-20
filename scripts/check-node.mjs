// Fail fast if the running Node/npm don't match the versions pinned in
// package.json "engines".
//
// `.npmrc engine-strict=true` already enforces the pin at `npm install` /
// `npm ci` time, but npm does NOT re-check engines for `npm run <script>`.
// This guard closes that gap: it runs as a `pre` hook before the build so a
// stale toolchain is caught before any script does real work — not just on a
// fresh install.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { engines = {} } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

const runningNode = process.versions.node;
// When invoked through an npm script, npm advertises its own version here,
// e.g. "npm/11.17.0 node/v26.5.0 ...". Absent if run via bare `node`.
const runningNpm = (process.env.npm_config_user_agent ?? "").match(/npm\/(\S+)/)?.[1];

const problems = [];
if (engines.node && engines.node !== runningNode) {
  problems.push(`Node ${engines.node} required, but running ${runningNode}.`);
}
if (engines.npm && runningNpm && engines.npm !== runningNpm) {
  problems.push(`npm ${engines.npm} required, but running ${runningNpm}.`);
}

if (problems.length > 0) {
  console.error("✗ Toolchain mismatch — refusing to build:");
  for (const p of problems) console.error(`    ${p}`);
  console.error("  Run `fnm use` (reads .node-version) to switch, then `npm ci`.");
  process.exit(1);
}

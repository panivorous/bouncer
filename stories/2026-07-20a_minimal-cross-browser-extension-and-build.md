# Bootstrap a minimal cross-browser extension + build pipeline

- **Status:** Ready to implement (not started)

---

## Background

`bouncer` is a **personal, all-in-one browser extension** whose purpose is to
fix the owner's day-to-day browsing annoyances (see `README.md`). It is used
**mainly in Firefox, sometimes in Chrome**, so it must run on both.

The repo is currently a near-empty skeleton: just `README.md`, `LICENSE` (MIT),
and this `stories/` directory (the "stories" name refers to the Extreme
Programming practice — each file here is a small unit of work).

This is the **first** story. It intentionally builds no real feature; it only
establishes the project scaffold so future annoyance-fixing features have
somewhere to live and a way to ship.

## Goal

Stand up the minimal foundation of the extension and its packaging, so the
owner can install it in both browsers and iterate from there.

## Scope — three deliverables

1. **A minimal, installable extension for both Firefox and Chrome.**
   - No real behaviour is required. **"It installs and loads without error" is
     the whole bar.** A placeholder (e.g. an empty background/service worker, or
     nothing but the manifest + icons) is fine.
   - One shared source that produces something loadable in both browsers.

2. **A build process** that turns source code into installable extension
   **artifacts** (the packaged, distributable files — a `.zip` for Chrome and a
   `.zip`/`.xpi` for Firefox). Driven by an `npm` script so it's one command.

3. **`.gitignore` rules** covering:
   - **Git worktrees created by Claude.** Claude Code's worktree-isolation
     creates worktrees under **`.claude/worktrees/`** inside the repo (confirmed
     from the `EnterWorktree` tool contract). Because they live inside the main
     working tree, git would otherwise show them as untracked, so the rule is
     needed: ignore `.claude/worktrees/`.
   - **Built files** (the compiled output and packaged artifacts), plus the
     usual `node_modules/`.

## Decisions already made (confirmed with the owner)

- **Build approach: minimal, no framework.** Hand-written manifest + plain
  source assembled and zipped by an npm script. No WXT / Plasmo / Vite+CRXJS.
  Rationale: fewest moving parts, easiest to fully understand and maintain for a
  personal project.
- **Language: TypeScript.** For typed `chrome.*` / `browser.*` APIs,
  autocomplete, and safe refactors as the extension grows. Consequence: the
  "minimal build" is **compile + zip**, not just copy + zip.

## Recommended technical approach (guidance, not gospel)

The implementing agent may adjust details, but should honour the two decisions
above and the acceptance criteria below.

### Manifest & cross-browser strategy
- Use **Manifest V3** (Chrome effectively mandates it; Firefox supports it).
- For the no-behaviour first step, a **single `manifest.json`** can serve both
  browsers: `manifest_version: 3`, `name`, `version`, `description`, `icons`,
  and `browser_specific_settings.gecko.id` (Firefox requires a gecko id;
  Chrome ignores this key). Omitting background/content scripts entirely keeps
  the two browsers' requirements from diverging at this stage.
- API namespace for *future* features: standardize on the promise-based
  `browser.*` namespace via `webextension-polyfill` (works on Chrome too). Not
  needed yet since there's no behaviour — but decide it early. Types available
  via `@types/chrome` and/or `@types/webextension-polyfill`.

### Build
- Compile TS → JS with a **tiny bundler** (`esbuild` recommended — single fast
  dev dependency; `tsc` alone is acceptable for this trivial step but esbuild
  will pay off once content scripts / npm deps like the polyfill appear).
- Assemble: compiled JS + copied static assets (`manifest.json`, `icons/`, any
  HTML) into a build directory.
- Package: produce per-browser artifacts. Use **`web-ext build`** for the
  Firefox artifact (`bouncer-firefox.zip`; it also validates), and a zip
  (`web-ext build`, or a small Node zip script) for `bouncer-chrome.zip`.
- Suggested npm scripts: `build`, `build:chrome`, `build:firefox`,
  `lint` (`web-ext lint`), and a `dev`/`start` (`web-ext run`, which can target
  Firefox and Chromium for live loading).

### Placeholder assets
- Include simple placeholder icons (16 / 48 / 128 px) so `web-ext lint` is clean
  and the toolbar entry renders.

### Tooling & prerequisites (self-contained — no global installs)
- **All build tooling must be local `devDependencies`**, never global binaries:
  `typescript`, `esbuild`, `web-ext`, and the type packages (`@types/chrome` /
  `@types/webextension-polyfill`). Invoke them through `package.json` scripts —
  npm puts `node_modules/.bin` on `PATH`, so scripts resolve the local versions
  without `npx` or anything installed globally.
- **A fresh `npm install` must be the only setup step.** The build must not
  depend on anything the developer happened to install on their machine, so the
  project works identically on any checkout (important — this repo is public).
- **Only prerequisite:** a Node.js + npm toolchain (everything else is a local
  devDependency). Use **npm** (not `pnpm`).

### Pinning Node + npm to this repository (settled)
Decisions: **use Node 26**, managed with **fnm**, Node version declared in
**`.node-version`**. Pin **exactly** — install Node 26, then record the exact
resulting Node patch *and* its bundled npm version and freeze both. (The exact
numbers can't be written here in advance; capture them at scaffold time.)

Scaffold procedure for the implementing agent:
1. `fnm install 26 && fnm use 26` — installs the latest Node 26.x.
2. Capture the exact versions: `node -v` → `26.x.y`; `npm -v` → `<bundled>`.
   These two values are what get pinned below.
3. Write the committed pin files:
   - **`.node-version`** — the exact Node version (`26.x.y`). fnm reads this and,
     with `--use-on-cd`, auto-switches on entering the repo — natively in fish
     (`fnm env --use-on-cd | source` in `config.fish`), unlike nvm.
   - **`package.json` `engines`** — `{ "node": "26.x.y", "npm": "<bundled>" }`,
     both exact, from step 2.
   - **`.npmrc` with `engine-strict=true`** — makes npm **refuse** to install or
     run scripts when the running Node/npm don't satisfy `engines`. This is the
     guardrail that enforces the pin regardless of which manager (or none) is in
     use.

Why fnm (not nvm): the owner uses the **fish** shell; nvm's auto-switch hook is
bash/zsh only and nvm doesn't manage npm at all. fnm switches natively in fish
and reads `.node-version`. The npm version is simply whatever ships bundled with
the pinned Node 26 — frozen via `engines` + `engine-strict`, so no separate npm
tooling (e.g. Corepack) is needed.

### Reproducible installs
- **Commit `package-lock.json`.** Use `npm ci` for installs so the exact locked
  versions of every dependency (`web-ext`, `typescript`, `esbuild`, the type
  packages, …) are reproduced on any clone — "latest" is resolved once at
  scaffold time, then frozen. (`package-lock.json` must stay tracked — it is not
  covered by the build-output ignore rules.)

## Acceptance criteria

- [ ] `npm install` then a single `npm run build` produces installable
      artifacts for **both** Chrome and Firefox in a (gitignored) output dir.
- [ ] **Chrome:** the build loads via `chrome://extensions` → Developer mode →
      *Load unpacked* (or by dropping the zip) with no errors.
- [ ] **Firefox:** the build loads via `about:debugging#/runtime/this-firefox` →
      *Load Temporary Add-on* with no errors, and `web-ext lint` passes.
- [ ] `.gitignore` excludes `node_modules/`, the compiled build dir, and the
      packaged artifacts (`*.zip`, `*.xpi`, `web-ext-artifacts/`, `dist/`…), and
      excludes Claude-created worktrees.
- [ ] **Node/npm are pinned:** `.node-version` (exact Node 26 patch), `engines`
      (exact node + bundled npm), and `.npmrc` (`engine-strict=true`) are
      present, and an npm script run under a mismatched Node/npm fails fast
      rather than proceeding.
- [ ] **`package-lock.json` is committed** and `npm ci` reproduces the build on a
      clean clone.
- [ ] A short note (README section or comment) states how to build and how to
      load the extension in each browser.

## Non-goals / out of scope

- Any actual annoyance-fixing behaviour or UI.
- **Firefox signing / permanent installation.** Temporary loading is fine for
  now. (Permanent unsigned install needs `web-ext sign` + AMO, Developer
  Edition with `xpinstall.signatures.required=false`, or self-distribution —
  defer to a later story.)
- Chrome Web Store / AMO publishing, CI, and automated tests.

## Resolved decisions (previously open questions)

1. **Claude worktree path — RESOLVED.** Claude Code's worktree-isolation
   creates worktrees under **`.claude/worktrees/`** inside the repo (per the
   `EnterWorktree` tool contract). `.gitignore` ignores `.claude/worktrees/`
   specifically — *not* all of `.claude/` — so any project-level Claude settings
   can still be tracked if desired. Only the main checkout exists today
   (`git worktree list` shows a single entry — the repo root).
2. **One artifact vs. two — RESOLVED: two.** Emit two separately-named
   artifacts, **`bouncer-chrome.zip`** and **`bouncer-firefox.zip`**. For this
   no-behaviour step their contents are effectively identical, but separate
   names leave room for future per-browser divergence.

## Recommended `.gitignore`

```gitignore
# Dependencies
node_modules/

# Build output & packaged artifacts
dist/
build/
web-ext-artifacts/
*.zip
*.xpi

# Claude Code worktree isolation
.claude/worktrees/
```

# bouncer

My personal all-in-one browser extension that fixes my browsing annoyances.

Runs on **Firefox** (mainly) and **Chrome**. Manifest V3, TypeScript, no
framework — a hand-written manifest plus plain source, compiled and zipped by a
small npm script.

> **Status:** scaffold only. No behaviour yet — this repo currently just
> installs and loads cleanly in both browsers so future features have a home.

## Prerequisites

- **Node.js 26** + npm. The exact versions are pinned (`.node-version` and
  `package.json` `engines`); [fnm](https://github.com/Schniz/fnm) reads
  `.node-version` and auto-switches on entering the repo. With fish:

  ```fish
  # one-time, in ~/.config/fish/config.fish
  fnm env --use-on-cd | source
  ```

  Then `fnm install` (installs the pinned Node) once per machine. `.npmrc` sets
  `engine-strict=true`, so npm **refuses** to install under the wrong
  Node/npm — nothing else is required globally.

## Install

```sh
npm ci      # reproducible install from package-lock.json
```

(Use `npm install` only when intentionally changing dependencies.)

## Build

```sh
npm run build
```

This compiles `src/` into `dist/` (unpacked extension) and packages two
artifacts into `web-ext-artifacts/`:

- `bouncer-chrome.zip`
- `bouncer-firefox.zip`

Both are gitignored. For their no-behaviour first version the two zips are
identical; they're named separately to leave room for future per-browser
divergence.

## Load the extension

### Chrome

1. Go to `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. **Load unpacked** → select the `dist/` directory (run `npm run build` first),
   or drag `web-ext-artifacts/bouncer-chrome.zip` onto the page.

Chrome runs the MV3 **service worker** and ignores the Firefox-only
`background.scripts` fallback.

### Firefox

1. Go to `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on** → pick `dist/manifest.json`, or
   `web-ext-artifacts/bouncer-firefox.zip`.

Temporary add-ons are removed when Firefox restarts (signing / permanent
install is deferred to a later story). Firefox uses `background.scripts` and
ignores the Chrome-only `service_worker` key — `web-ext lint` notes this as an
informational warning; it is expected and not an error.

## Other scripts

| Command             | What it does                                             |
| ------------------- | -------------------------------------------------------- |
| `npm run bundle`    | Compile + assemble into `dist/` only (no zipping)        |
| `npm run lint`      | `web-ext lint` (validates the built extension)           |
| `npm run typecheck` | `tsc --noEmit` type-check                                |
| `npm run start`     | `web-ext run` — live-reloading dev browser               |
| `npm run icons`     | Regenerate the placeholder icons                         |

## Layout

```
src/
  manifest.json      # single MV3 manifest for both browsers
  background.ts      # placeholder service worker (no behaviour yet)
  icons/             # generated placeholder icons (16/48/128)
scripts/
  build.mjs          # esbuild compile + copy assets -> dist/
  check-node.mjs     # fail fast if Node/npm don't match the pin
  make-icons.mjs     # regenerates src/icons/*.png
```

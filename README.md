# bouncer

My personal all-in-one browser extension that fixes my browsing annoyances.

Runs on **Firefox** (mainly) and **Chrome**. Manifest V3, TypeScript, no
framework — a hand-written manifest plus plain source, compiled and zipped by a
small npm script.

> **Status:** two features shipped. Blocks the filmarks.com ad-gate popup and
> Shutto Translation's browser-language auto-translation (see
> [Features](#features)). Still loads cleanly in both browsers.

## Features

### Remove the filmarks.com ad-gate popup

filmarks.com throws up a full-page **「引き続き利用いただくには」** ("To keep
using this site") modal that scroll-locks the page until you watch an ad. That
wall is Geniee's "Overlay Wall", built by ad scripts served from
`cpt.geniee.jp`. bouncer blocks those scripts at the network layer with a static
[`declarativeNetRequest`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest)
rule (`src/rules/filmarks-geniee.json`), so the wall is never built — no flash,
no cleanup, and the rest of the site keeps working. This is declarative config,
not code: no content script, no background logic.

The rule is scoped to filmarks by `initiatorDomains: ["filmarks.com"]`, so
Geniee is untouched on every other site. The same Geniee wall appears on other
sites that embed it — **to generalise, widen `initiatorDomains`** (add more
domains) or drop the `initiatorDomains` condition to block Geniee everywhere.

### Stop Shutto Translation's browser-language auto-translation

Many Japanese sites embed **Shutto Translation** (シャトル翻訳,
`d.shutto-translation.com`), a JS widget that reads the visitor's browser
language priority and **auto-translates the page** client-side. With English
ranked above Japanese in the browser, it silently rewrites native Japanese sites
into English (the page renders in Japanese, then flashes to English within ~1s).
bouncer blocks the Shutto loader script at the network layer with a static
[`declarativeNetRequest`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest)
rule (`src/rules/shutto.json`), so the widget never runs and each page stays in
its server-rendered original language — no flash, no cleanup. Declarative config,
not code: no content script, no background logic.

Unlike the filmarks rule, this one is **global** — it has **no**
`initiatorDomains`, so Shutto is blocked on every site. That's deliberate: the
annoyance is the mechanism, not one domain. Scope is tuned via `initiatorDomains`
— **add it to narrow** the block to specific sites, **omit it to keep global**.
(Consequence of global: a non-Japanese site that uses Shutto to translate *into*
Japanese will show its original language instead.)

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
  rules/             # static declarativeNetRequest rulesets (network blocks)
scripts/
  build.mjs          # esbuild compile + copy assets -> dist/
  check-node.mjs     # fail fast if Node/npm don't match the pin
  make-icons.mjs     # regenerates src/icons/*.png
```

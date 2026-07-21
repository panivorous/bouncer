# bouncer

My personal all-in-one browser extension that fixes my browsing annoyances.

Runs on **Firefox** (mainly) and **Chrome**. Manifest V3, TypeScript, no
framework — a hand-written manifest plus plain source, compiled and zipped by a
small npm script.

> **Status:** four features shipped. Blocks the filmarks.com ad-gate popup,
> Shutto Translation's browser-language auto-translation, and WOVN.io's
> browser-language auto-translation, and forces Japanese `navigator.language`
> on every `.jp` site (see [Features](#features)). Still loads cleanly in both
> browsers.

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

### Stop WOVN.io's browser-language auto-translation

Many Japanese sites also embed **WOVN.io** (`wovn.io`), a second, independent
Japanese localization SaaS with the same client-side auto-translation
behaviour as Shutto: it reads the visitor's browser language priority and, on
a cookieless first visit, auto-switches the page away from its server-rendered
original language. bouncer blocks the WOVN loader script at the network layer
with a static
[`declarativeNetRequest`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest)
rule (`src/rules/wovn.json`), so the widget never runs and each page stays in
its server-rendered original language — no flash, no cleanup. Declarative
config, not code: no content script, no background logic.

Like the Shutto rule, this one is **global** — no `initiatorDomains`, so WOVN
is blocked on every site. Scope is tuned via `initiatorDomains` — **add it to
narrow** the block to specific sites, **omit it to keep global**. (Consequence
of global: a non-Japanese site that uses WOVN to translate *into* Japanese will
show its original language instead.) Sites with a genuine server-side
translated route (e.g. `/en/…`) are unaffected — the block only stops the
*automatic* switch, not explicit navigation to that route.

### Force Japanese `navigator.language` on every `.jp` site

Some Japanese sites sniff the browser's self-reported language **in
first-party page JavaScript** and redirect away from Japanese when English
outranks it. The motivating case, `monokakido.jp`, ships an inline script on
its own homepage that reads `navigator.language` and does
`location.replace("./en/")` unless it starts with `"ja"`. Unlike Shutto/WOVN
there's **no third-party script to block** and **no HTTP-level redirect to
intercept**, so the `declarativeNetRequest` approach doesn't apply here.

Instead, bouncer ships a tiny content script (`src/lang-override.ts`) that
overrides `navigator.language` **and** `navigator.languages` to report Japanese
on every `*.jp` site. Any site that trusts the browser's self-reported language
(this one included) then sees Japanese and leaves the page alone — no per-site
rule needed, and it pre-empts any other `.jp` site doing the same kind of
sniffing. Like the Shutto/WOVN blocks it's **global by design**: it applies to
*every* `.jp` site, so if you ever wanted English on a `.jp` site on purpose,
this overrides that too (no opt-out in this version — deferred to a later story
if it bites).

The override runs at `document_start` in the page's **main world** (so it's in
place before the page's own scripts read `navigator`). The two browsers reach
that main world differently, which is where a real asymmetry shows up:

- **Chrome** injects it via a static `content_scripts` manifest entry with
  `"world": "MAIN"`. It's on the moment the extension loads — **nothing to
  click**.
- **Firefox** has no static "world" key, so the main-world injection must go
  through the `userScripts` API, whose permission Firefox only grants
  *optionally, at runtime, from a user gesture*. So bouncer has a **one-click
  popup** (its first-ever UI, `src/popup.html`): click the toolbar button once
  after install/update to grant the permission and turn the feature on. Until
  you click it, `.jp` sites in Firefox behave completely normally — that's
  expected, not a bug.

**Known limitation:** this only affects **client-side JS** language detection.
It does *not* change the `Accept-Language` HTTP request header, so a site that
switches language **server-side** based on that header is unaffected.
(`monokakido.jp` ignores `Accept-Language` entirely, so it's fully covered; the
gap is only hypothetical `.jp` sites that negotiate language server-side.)

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
3. **One-time, for the `.jp` language feature:** click bouncer's toolbar button
   and press **Force Japanese on .jp sites** to grant the `userScripts`
   permission. See
   [Force Japanese `navigator.language`](#force-japanese-navigatorlanguage-on-every-jp-site)
   for why this manual step exists on Firefox but not Chrome. The network-block
   features (filmarks/Shutto/WOVN) work with no click.

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
  background.ts      # service worker; registers the Firefox .jp userScript
  lang-override.ts   # main-world payload: forces navigator.language = ja on .jp
  popup.html         # action popup (Firefox "click to enable" UI)
  popup.ts           # popup logic: request userScripts permission on Firefox
  icons/             # generated placeholder icons (16/48/128)
  rules/             # static declarativeNetRequest rulesets (network blocks)
scripts/
  build.mjs          # esbuild compile + copy assets -> dist/
  check-node.mjs     # fail fast if Node/npm don't match the pin
  make-icons.mjs     # regenerates src/icons/*.png
```

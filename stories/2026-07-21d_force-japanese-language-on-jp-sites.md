# Force Japanese `navigator.language`/`navigator.languages` on every `.jp` site

## Summary

`https://www.monokakido.jp` (a Japanese dictionary-app maker) auto-redirects
away from Japanese for the owner: its bare-root page reads
`navigator.language` client-side and does `location.replace("./en/")` when it
doesn't start with `"ja"`. This is a **different mechanism** from the two
previously-fixed sites (Shutto, WOVN) — it's **first-party inline JS on the
site's own homepage, not a blockable third-party network resource** — so the
`declarativeNetRequest` block-a-script pattern used for those doesn't apply
here. Rather than a narrow, monokakido-specific fix, the owner chose a
deliberately broader solution: **a content script that overrides
`navigator.language` and `navigator.languages` to report Japanese on every
`*.jp` site**, so any site (this one included) that trusts the browser's
self-reported language sees Japanese and behaves accordingly on its own.

This is bouncer's **fourth** feature, and its first non-declarative one — the
first content script, and (on Firefox) the first UI. Both were deliberately
chosen by the owner over simpler alternatives; read Decisions below for why.

## Status

**Not started.** Problem reproduced and root-caused live; approach, scope, and
injection technique decided with the owner across an extended back-and-forth
(see Decisions — several early framings were corrected mid-conversation as
new technical facts surfaced, e.g. Firefox's permission model). No code
written yet.

## Context

- **bouncer** is the owner's personal MV3 extension (Firefox-main + Chrome,
  TypeScript, no framework), currently at v0.4.0. Its three shipped features
  are all static `declarativeNetRequest` rulesets — a filmarks ad-gate block
  (site-scoped) and two global translation-widget blocks (Shutto, WOVN). All
  three need **zero UI, zero content scripts, and zero `host_permissions`** —
  `background.ts` is a genuine no-op placeholder and there is no `action`/popup
  key in the manifest at all.
- The owner asked to fix the same *class* of annoyance (browser-language
  auto-translation) on `monokakido.jp`, uncertain whether the Shutto/WOVN
  approach would transfer. It does not — see the mechanism comparison below.
  The owner then proposed generalizing the fix to all of `.jp` rather than
  patching monokakido.jp specifically.

**Provenance — everything tagged _verified live_ was fetched/observed this
session (2026-07-21)**, with the owner's real `navigator.languages =
["en-GB","en-US","ja","en"]` (English on top). Anything tagged _assumed_ is a
documented-but-unconfirmed-in-this-session fact the implementer should verify.

### The monokakido.jp mechanism (verified live)

- `curl` with different `Accept-Language` headers against
  `https://www.monokakido.jp/` returns **byte-identical** responses
  (`content-length: 9865` every time) — the server never looks at language.
  There is **no HTTP-level redirect** either (`200`, not `301`/`302`).
- The raw HTML of that same bare-root response contains an inline
  `<script>` (no `src`, first-party, shipped as part of the page itself):
  ```js
  function browserLanguage() {
    try {
      return (navigator.browserLanguage || navigator.language || navigator.userLanguage).substr(0,2)
    } catch(e) { return undefined; }
  }
  if (browserLanguage().indexOf("ja") != -1) { location.replace("./ja/"); }
  else if (browserLanguage().indexOf("en") != -1) { location.replace("./en/"); }
  else { ocation.replace("./ja/"); }  // [sic] typo, dead branch, irrelevant to the fix
  ```
  Live in Chrome with the owner's languages, this fires `location.replace("./en/")`
  — a full second top-level navigation (confirmed via network-request capture:
  request #1 is `GET /`, request #11 is a fresh `GET /en/`, not a redirect of #1).
- **No cookie is ever set** by any of `/`, `/ja/`, or `/en/` (checked
  `Set-Cookie` on all three) — unlike WOVN, this fires on *every single visit*
  to the bare root, not just a cookieless first one. Reproduction is simple
  and doesn't need a private window.
- **None of the three pages (`/`, `/ja/`, `/en/`) declare a language through
  any standard mechanism** — no `<html lang="...">`, no `<meta
  http-equiv="content-language">`, no `og:locale`, no `hreflang` alternates.
  (This was checked in response to the owner's first proposed approach —
  "if a site declares Japanese, spoof `navigator.language`" — and the answer
  is monokakido.jp declares nothing, on any of its pages, so that specific
  heuristic has no signal to key off here. This is *why* the conversation
  moved to the broader `.jp`-wide proposal instead.)
- **Why the Shutto/WOVN pattern doesn't transfer:** those fixes worked by
  blocking a **third-party script** (`d.shutto-translation.com`, `wovn.io`) —
  the site's own server-rendered Japanese was already correct, and blocking
  the vendor's widget just let that stand. Here there is no third party and
  no "true default" to fall back to: the bare-root document's *only* job is
  to sniff-and-redirect. Blocking the root document would break the homepage
  entirely; blocking/redirecting requests to `/en/` at the network layer would
  also break the site's own **legitimate, explicit** English link (`/en/` is
  the same URL the sniffer redirects to *and* the URL a real English-preferring
  visitor, or the owner clicking the page's own "English" switcher, would
  request — DNR can't tell those apart).

### Chosen alternative and its own trade-offs (decided, not open)

- A **DNR redirect rule** (intercept the exact bare-root URL, redirect
  straight to `/ja/`, skipping the sniffer) was considered and is technically
  viable, but was **not chosen** — the owner's own broader `*.jp` proposal
  superseded it before a final call was needed. Recorded here so it isn't
  independently rediscovered: DNR `redirect` actions (unlike the `block`
  actions the three shipped rules use) **require `host_permissions`**
  (verified against Chrome's and MDN's `declarativeNetRequest` docs — `block`
  needs none, `redirect`/`modifyHeaders` do). It would also have been an
  unconditional, hardcoded "always send to `/ja/`" — since DNR has no access
  to `navigator.language`, it can't actually condition on browser language at
  all, only bypass the site's own check outright.

## Decisions & constraints

- **Scope: force Japanese on every `*.jp` site, not just monokakido.jp.**
  Owner's explicit choice, made knowingly ("something wild"). Rationale: more
  general and durable than a per-site rule — it also pre-empts any other `.jp`
  site doing the same kind of first-party browser-language sniffing, present
  or future, without needing a new story each time. *Accepted consequence*
  (explicitly confirmed, no opt-out — see below): this affects **every** `.jp`
  site's view of the browser's language, not just ones with a translation
  mechanism, including hypothetically wanting English on a `.jp` site on
  purpose. Same category of trade-off the owner already accepted for Shutto/
  WOVN's global scope, deliberately taken further here.
- **Mechanism: override `navigator.language` AND `navigator.languages`**, not
  just the singular property the owner first mentioned. Rationale (decided
  after discussion): monokakido.jp itself only reads `navigator.language`, but
  the already-shipped WOVN fix's target explicitly reads the **plural**
  `navigator.languages` array — overriding only the singular would leave the
  two properties inconsistent (`language` says `ja`, `languages[0]` still says
  `en-GB`) and wouldn't fool array-reading detection. Override both, kept
  mutually consistent, via a persistent getter (not a one-time value patch) so
  it holds for the whole page lifetime, not just the first read.
- **No opt-out / allowlist in this first version.** Explicit decision,
  consistent with the precedent set by both shipped global rules (Shutto,
  WOVN): ship the blanket behavior; defer any exceptions mechanism to a later
  story if it turns out to bite in practice.
- **Injection technique: native per-browser APIs, not the classic
  "inject a `<script>` tag" trick.** This was **re-decided mid-conversation**:
  first framed as a two-way choice, the owner initially leaned toward the
  simpler universal technique, then explicitly chose to keep native APIs
  **after** being told the concrete cost (below). Record both the choice and
  why, so an implementer doesn't second-guess it:
  - **Chrome:** a static `content_scripts` entry with `"world": "MAIN"`
    (Chrome's own term for what's colloquially "the page's main world," as
    opposed to the default `"ISOLATED"` content-script sandbox) — a plain
    declarative manifest key, no runtime permission dance, no popup needed on
    this browser. *(Minimum Chrome version for static-manifest `world: "MAIN"`
    is assumed ~111+ from general documentation, not verified this session —
    confirm on implementation and check it isn't older than whatever floor
    bouncer already targets.)*
  - **Firefox:** has **no equivalent static "world" key** for MV3
    `content_scripts` — verified via search that Firefox deliberately does not
    implement it (their Xray Vision security model). The alternative is the
    `browser.userScripts` API, registered at **runtime** (not declarable in
    the manifest) via `browser.userScripts.register({..., world: "MAIN"})`,
    typically called from the background script.
  - **The real cost, and why it was accepted anyway:** Firefox's `userScripts`
    permission is **optional-only** — verified via MDN and a second
    independent search — it cannot be granted at install time, full stop; it
    must be requested at runtime via `browser.permissions.request()`, which
    needs a user gesture (a click). **bouncer has no UI at all today** (no
    `action`/popup key in the manifest). So this choice concretely means
    **building bouncer's first-ever UI** — at minimum a small popup with a
    button the owner clicks once, after install/update, to grant the
    permission and trigger registration. The owner was told this plainly and
    chose to keep native APIs anyway over the no-UI alternative (an
    ISOLATED-world content script injecting a plain `<script>` tag into the
    page — universal, no popup, but vulnerable to a site's `Content-Security-
    Policy` blocking the injected tag). *Rules out* that simpler alternative
    for this story.
  - **A real, accepted asymmetry:** Chrome gets this feature silently on
    install; Firefox needs one manual click first. Until that click happens,
    `.jp` sites in Firefox behave completely normally (unmodified) — this is
    expected, not a bug, and should be reflected in the acceptance criteria
    (test the "before clicking" state too, not just "after").
- **Existing Shutto/WOVN/filmarks rules are untouched — this is additive, not
  a replacement.** Those vendor scripts can appear on **non**-`.jp` domains
  too (Shutto/WOVN are used well beyond Japan-only sites), so the DNR blocks
  still earn their keep there. This `.jp` content script is a second,
  independent, broader layer that happens to also cover monokakido.jp.
- **Known, accepted limitation: this only fixes *client-side* JS-based
  language detection, not server-side content negotiation.** Overriding
  `navigator.language`/`navigator.languages` has **no effect on the
  `Accept-Language` HTTP request header** — that's a separate, browser-level
  setting this story does not touch. monokakido.jp itself is confirmed
  unaffected by this gap (verified: its server ignores `Accept-Language`
  entirely), but a hypothetical `.jp` site that language-switches
  *server-side* based on that header would not be fixed by this feature. Not
  pursued further since it wasn't the trigger case; noted for the future.

## Approach (guidance, not gospel)

Four touch points, roughly:

1. **Content-script payload** (new file, e.g. `src/lang-override.ts`) — the
   actual override logic, shared by both injection paths where practical:
   ```js
   const JA_LANGUAGES = ["ja", "ja-JP"]; // exact values negotiable
   Object.defineProperty(Navigator.prototype, "language", { get: () => JA_LANGUAGES[0], configurable: true });
   Object.defineProperty(Navigator.prototype, "languages", { get: () => JA_LANGUAGES, configurable: true });
   ```
   Override the **prototype** getters (not just the `navigator` instance) so
   the spoof holds regardless of how a page reads them. Must run at
   `document_start`, in the page's own (`MAIN`) world, before any of the
   target page's own `<head>` scripts execute.

2. **Chrome: static manifest registration** — add to `src/manifest.json`:
   ```jsonc
   "content_scripts": [{
     "matches": ["*://*.jp/*"],
     "js": ["lang-override.js"],
     "run_at": "document_start",
     "world": "MAIN",
     "all_frames": true
   }]
   ```
   `all_frames: true` so embedded iframes on `.jp` sites are covered too
   (negotiable). Verify whether Chrome needs this pattern duplicated under
   `host_permissions` or whether the `matches` entry alone suffices — this
   session's research suggests static content-script `matches` do **not**
   need a separate `host_permissions` grant (unlike programmatic
   `chrome.scripting.executeScript`), but confirm on implementation since it
   wasn't tested against a real build.

3. **Firefox: runtime registration behind a popup click** — needs:
   - `"optional_permissions": ["userScripts"]` (and matching
     `optional_host_permissions` for `*://*.jp/*`) in the manifest.
   - A minimal `action` popup (bouncer's first) with a button that calls
     `browser.permissions.request(...)` and, on success, calls
     `browser.userScripts.register({ matches: ["*://*.jp/*"], js: [{file:
     "lang-override.js"}], runAt: "document_start", world: "MAIN", allFrames:
     true })`.
   - On `runtime.onStartup`/`onInstalled`, check whether the permission is
     already granted and re-register if so (verify whether
     `userScripts.register()` persists registrations across browser restarts
     on its own, or needs re-establishing every session — treat as unverified
     until checked against a real build).
   - Keep the popup itself minimal — a button plus a one-line status
     ("enabled" / "click to enable"), not a settings page.

4. **Build** — `scripts/build.mjs` currently has a single hardcoded esbuild
   `entryPoints: [background.ts]`; add the new content-script file (and any
   popup script) as additional entry points, and copy the popup HTML into
   `dist/` alongside the existing manifest/icons/rules copies.

Then `npm run build`, load in both browsers, and verify against the criteria
below — remembering the Firefox popup-click step is a precondition for half
of them.

## Acceptance criteria

Phrased against observable behaviour so they hold even if implementation
details differ.

- [ ] **Chrome, no manual step needed:** with bouncer loaded, visiting
      `https://www.monokakido.jp` (or the bare apex `https://monokakido.jp`)
      lands on `/ja/` and **stays Japanese** — no flash to `/en/`.
- [ ] **Firefox, before clicking the popup button:** `.jp` sites (including
      monokakido.jp) behave exactly as they do with bouncer absent — this is
      expected, confirming the feature is truly opt-in-by-click on this
      browser, not silently broken.
- [ ] **Firefox, after clicking the popup button once:** the same
      monokakido.jp behaviour as the Chrome criterion above, without needing
      to reload the extension or restart the browser.
- [ ] In DevTools console on any `.jp` site with bouncer active:
      `navigator.language` and `navigator.languages` both report Japanese
      values.
- [ ] **Generality confirmed:** spot-check a second, unrelated `.jp` site
      (ideally one with its own browser-language-based behaviour) and confirm
      the override applies there too, without a new rule/config change.
- [ ] **Scope confirmed both ways:** on a **non**-`.jp` site, `navigator.language`
      / `navigator.languages` remain the owner's real, unmodified values
      (`en-GB` first) — the override must not leak outside `.jp`.
- [ ] **No regression:** the three existing DNR rules (filmarks, Shutto, WOVN)
      still function unchanged; a Shutto or WOVN site on a **non**-`.jp` domain
      is still fixed by its existing block rule.
- [ ] No errors from bouncer in `chrome://extensions` / `about:debugging`.
- [ ] `npm run build`, `npm run typecheck`, and `npm run lint` all still pass
      with the new content-script and popup code included.
- [ ] A README note documents: the new global `.jp` language-forcing feature,
      the one-time Firefox "click to enable" step and why it exists, and the
      known limitation that it doesn't affect server-side
      `Accept-Language`-based content negotiation.

## Out of scope / non-goals

- **Per-site opt-out / allowlist for the `.jp` override** — explicitly
  deferred; ship blanket, revisit only if it causes a real problem.
- **Forcing the `Accept-Language` HTTP header** to fix hypothetical
  server-side `.jp` language negotiation — a different, unrequested mechanism;
  not pursued now (see the limitation noted in Decisions).
- **Any settings/options page beyond the minimal one-button Firefox popup** —
  no general preferences UI.
- **Applying similar language-forcing to any other TLD** — this story is
  `.jp`-only, per the owner's explicit ask.
- **The rejected DNR-redirect-to-`/ja/` approach** — considered, documented
  above for context, not built.
- **Removing dead language-switcher UI elements** on affected sites — same
  cosmetic non-goal called out in the Shutto/WOVN stories.

## Open questions & risks

- **Firefox permission persistence** *(unverified)*: does a granted
  `userScripts` optional permission, and a `userScripts.register()` call,
  survive a browser restart and an extension update on their own, or does the
  background script need to re-request/re-register each session? Confirm
  against a real build; if registrations don't persist, `onStartup` handling
  becomes load-bearing, not optional.
- **Static content-script `matches` vs. `host_permissions` on Chrome**
  *(unverified)*: this session's documentation research suggests no separate
  `host_permissions` entry is needed for `*://*.jp/*` when it's only used
  inside `content_scripts.matches`, but this wasn't confirmed against an
  actual loaded build — verify there's no permission-warning or silent
  failure on install.
- **`*://*.jp/*` match-pattern coverage** *(assumed standard)*: should match
  any hostname ending in `.jp` at any subdomain depth (`monokakido.jp`,
  `www.monokakido.jp`, `foo.co.jp`, …) per standard WebExtension match-pattern
  semantics — not independently tested against a live loaded extension this
  session.
- **Detection surfaces this doesn't cover**: some sites might infer language
  via `Intl.DateTimeFormat().resolvedOptions().locale`, legacy
  `navigator.userLanguage`/`navigator.browserLanguage` (IE-only, but some
  sites still check them defensively — monokakido.jp's own script does, though
  it falls through to `navigator.language` in every real browser), or a
  server-side `Accept-Language` check. None of these are touched by this
  fix. Not a blocker for the motivating case (monokakido.jp only checks
  `navigator.language`, confirmed live) but worth knowing as a ceiling on
  "how general" this really is.
- **CSP is a non-issue for the *chosen* technique** (native per-browser APIs
  sidestep it), but if a future implementer ever falls back to the classic
  `<script>`-tag-injection technique for either browser, note that some `.jp`
  sites may have a strict CSP that would block it — monokakido.jp itself does
  not (verified: no `Content-Security-Policy` header or meta tag on any of
  its three relevant pages), so it isn't a concern for the trigger case
  specifically.

## Appendix — reproduction & raw findings

Reproduced live, 2026-07-21, `navigator.languages =
["en-GB","en-US","ja","en"]`:

- **Live navigation capture (Chrome, via extension network-request tool):**
  request #1 `GET https://www.monokakido.jp/` → `200`; request #11 (after 9
  asset loads) `GET https://www.monokakido.jp/en/` → `200`. Confirms the hop
  is a *second, distinct top-level navigation* triggered by `location.replace`,
  not an HTTP redirect of request #1.
- **`curl` content-negotiation check** (bare root, three different
  `Accept-Language` headers: `en-US`, `ja`, and none): all three return
  identical `200`, `content-length: 9865`, same `etag`. Confirms zero
  server-side language logic.
- **`Set-Cookie` check** on `/`, `/ja/`, `/en/`: none set any cookie on any of
  the three responses.
- **Language-declaration audit** (the check that ruled out the owner's first
  proposed heuristic): grepped `/`, `/ja/`, `/en/` raw HTML for `<html lang`,
  `content-language`, `og:locale`, `hreflang` — zero matches across all three
  pages. Only informal signal: `<meta property="og:url"
  content="https://www.monokakido.jp/ja/">` on the bare root (a canonical-URL
  hint, not a language declaration) and the fact the visible text is Japanese.
- **CSP check**: no `Content-Security-Policy` response header and no CSP
  `<meta>` tag on the bare-root page.
- **The exact sniffer script** (bare-root page, inline, no external `src`):
  see Context above for the full snippet, including the `else{ ocation...}`
  typo (dead code, irrelevant to the fix since the owner's spoofed language
  always hits the first `if` branch).
- **Header markup confirms explicit switcher links bypass the sniffer
  entirely** — `/en/`'s header links directly to `../ja/index.html` and
  `/ja/`'s links directly to `../en/index.html` (not through the bare root),
  which is *why* a hypothetical DNR redirect scoped to just the bare-root URL
  would not have broken explicit switching, had that approach been chosen.

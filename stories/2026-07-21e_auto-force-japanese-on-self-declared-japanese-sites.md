# Auto-force Japanese `navigator.language` on any site that declares itself Japanese

## Summary

`https://tamachi-tower.com/` is a Japanese site (a Tokyo office building) that
**auto-switches itself to English** for the owner. It's a Nuxt SPA using
**nuxt-i18n**, whose `detectBrowserLanguage` reads `navigator.languages`, sees
the owner's English-first list, and renders the page in English instead of its
`defaultLocale: "ja"`. This is the **exact same class** of annoyance as the
shipped `.jp` `navigator.language` override (story `2026-07-21d`, v0.5.0) — and
the fix is the same override — **except the site is a `.com`, which the current
`*://*.jp/*` content-script match does not reach.**

Rather than add `tamachi-tower.com` to an allowlist, the owner chose to
**auto-detect**: run the override detector on **every** site and force Japanese
whenever a page **declares its own language as Japanese** (a self-referential
`hreflang="ja"`, or `<html lang="ja">`). The existing unconditional `*.jp`
override stays as-is, as a separate layer, because it also covers sites that
declare *nothing* (e.g. `monokakido.jp`), which auto-detect can't catch.

## Status

**Not started.** Problem reproduced and root-caused live in Chrome on
2026-07-21; mechanism, scope, signal, and timing technique all decided with the
owner and verified live (see Context + Appendix). This is bouncer's **fifth**
feature and an evolution of the fourth — the next minor version (suggest
v0.6.0).

## Context

- **bouncer** is the owner's personal MV3 extension (Firefox-main + Chrome,
  TypeScript, no framework), currently **v0.5.0**. Shipped features: three
  static `declarativeNetRequest` blocks (filmarks ad-gate; Shutto and WOVN
  translation widgets) and one content script — the **`.jp` language override**
  (`src/lang-override.ts`) that forces `navigator.language`/`navigator.languages`
  to Japanese on `*://*.jp/*`, injected in the page's MAIN world at
  `document_start` (Chrome: static `content_scripts` with `"world":"MAIN"`;
  Firefox: `userScripts.register` at runtime, behind a one-click permission
  popup). **Read story `2026-07-21d` and `README.md` first** — this story reuses
  that feature's machinery wholesale and only broadens *where* and *whether* it
  fires.
- The owner hit `tamachi-tower.com`, another browser-language auto-translation
  case, and asked to handle it in the same spirit as the previous ones.

**Provenance — everything tagged _verified live_ was observed in Chrome on
2026-07-21** (live DOM/JS inspection + raw HTML fetched from the origin +
static inspection of the site's JS bundles + a streaming-parse probe), with the
owner's real `navigator.languages = ["en-GB","en-US","ja","en"]` (English on
top). Facts tagged _assumed_ / _unverified_ were **not** confirmed this session.

### The tamachi-tower.com mechanism (verified live)

- **_Verified live._** The site is a **Nuxt.js SPA** whose language logic is
  **nuxt-i18n**, bundled into the first-party app JS (`/_nuxt/1c3c28a.js`). Its
  config (read out of the bundle): `defaultLocale:"ja"`, locales
  `[{code:"en",file:"en.json"},{code:"ja",file:"ja.json"}]`,
  **`strategy:"no_prefix"`** (locale swaps **in place** on the same URL — there
  is **no** `/en/` route), and
  `detectBrowserLanguage:{ useCookie:true, cookieKey:"i18n_redirected",
  alwaysRedirect:false, onlyOnRoot:false, ... }`.
- **_Verified live._** The detector is literally
  `navigator.languages ? matchLocale(normalizedLocales, navigator.languages) : …`
  — it matches the browser's language list against the `en`/`ja` locale codes,
  in order. With the owner's English-first list it picks **`en`**.
- **_Verified live._** On a plain load of `https://tamachi-tower.com/` the app
  reported `$nuxt.$i18n.locale === "en"` and the visible UI was **English**
  ("Life with satisfaction, living with Tamachi", "Office Floors", "Services and
  Facilities"…), even though the server default is Japanese.
- **_Verified live._** Forcing the locale the way a Japanese-first browser would
  — `$nuxt.$i18n.setLocale("ja")` — re-rendered the page in the desired
  **Japanese** ("田町という街と、豊かに共存する", "オフィスフロア", "物件概要"…) **on
  the same URL** (`no_prefix` confirmed: the URL never changed). So a
  Japanese-first `navigator.languages` yields exactly the outcome we want.
- **_Verified live._** The switch is **cookie-masked** after the first visit
  (like WOVN): nuxt-i18n persists the chosen locale in the `i18n_redirected`
  cookie, so revisits honour whatever was last recorded. **Reproduce/verify in a
  fresh profile / private window (no `i18n_redirected` cookie)**, or the site
  will already be in one language for an unrelated reason. (Helpful corollary:
  once our override makes it pick `ja`, nuxt-i18n writes `i18n_redirected=ja`, so
  the choice self-persists.)

### Why this needs the override, not a network block

There is **no third-party translation script to block.** The detection lives in
the first-party Nuxt bundle, which *is* the site — blocking it would break the
whole SPA, not just the auto-switch. So the `declarativeNetRequest`
block-a-vendor-script pattern (Shutto/WOVN) does not apply. This is the same
situation the `.jp` override was built for: client-side, first-party language
sniffing. The **only** difference here is the domain is `.com`, so the existing
`*://*.jp/*` match doesn't cover it.

### The self-declaration signal (verified live)

- **_Verified live._** The served `<head>` contains exactly **one** language
  self-declaration: `<link rel="alternate" hreflang="ja"
  href="https://tamachi-tower.com/">` — **self-referential** (its `href` equals
  the page's own URL). This is the reliable early signal.
- **_Verified live._** The served `<html>` tag has **no `lang` attribute** (the
  `lang="ja"` you see at runtime is set later by the app — and, notably, it stays
  `"ja"` even while the app is showing English, so it's not a trustworthy
  live-state signal). There is no `content-language` meta and no `og:locale`. So
  for *this* site the usable signal is the **hreflang link**, not `<html lang>`.

### The timing — can we override before the site's own detector runs? (verified live)

Yes, with a `document_start` + `MutationObserver` technique. Key facts:

- **_Verified live._** The nuxt-i18n detection bundle is the **last
  parser-blocking `<script>` at the end of `<body>`** (`async:false`). So the
  entire `<head>` — hreflang link included — is parsed **before** the detector
  runs.
- **_Verified live_ (streaming-parse probe).** A script at the very top of
  `<head>` sees `document.readyState==="loading"`, the `<html>` element **with
  its attributes already readable**, but the hreflang link (declared *below* it)
  **not yet in the DOM**. A `MutationObserver` on `document.documentElement`
  installed at that earliest moment logged nodes in parse order:
  `LINK[hreflang=ja] → META → SCRIPT → BODY → H1` — i.e. it **caught the hreflang
  declaration as the parser streamed it in, before `<body>`.** A real
  `document_start` content script runs *even earlier* than that top-of-head
  script, so it sees at most this much (often just `<html>`, possibly before
  `<head>` exists).
- **Conclusion:** there is **no clean lifecycle event** meaning "header just
  finished" that fires before the app scripts — `DOMContentLoaded` /
  `document_end` / `document_idle` all fire *after* the end-of-body detector has
  already run. The workable approach is **`document_start` in the MAIN world**,
  observing `document.documentElement`, applying the override the instant the
  self-declaration appears.
- **The one gap (drives a decision below):** this only beats a detector that
  runs *after* the page's own self-declaration is parsed. A site sniffing
  **inline in `<head>` above** its own `hreflang`/`lang` — the `monokakido.jp`
  shape — would slip through. That's exactly why the `.jp` layer stays
  unconditional (below).

## Decisions & constraints

- **Approach: extend the existing client-side `navigator.language` override —
  not DNR.** Settled. The trigger is first-party bundled JS with no third-party
  script to block; DNR can only `block` whole resources and would break the SPA.
  Reuse the shipped override payload and both browsers' injection paths; this
  story changes *scope and gating*, not the override mechanism.
- **Auto-detect, no per-domain allowlist.** Owner's explicit choice (chosen over
  "just add `tamachi-tower.com` to a list"). The detector runs on **every** site
  and the override **activates only** where the page declares its own language
  Japanese. Rationale: generalises to any current/future non-`.jp` Japanese
  site that self-declares, with no new config per site.
- **Accepted consequence — the detector runs on `<all_urls>`.** To inspect every
  page's header with no allowlist, the content script must inject at
  `document_start` on `<all_urls>`. **Owner accepted this**, including the
  Firefox cost: the enable-click now requests **`<all_urls>` host access** (a
  broad "access all sites" permission prompt) instead of today's `.jp`-only
  request. On Chrome the static match just widens (the install warning becomes
  "read and change all your data on all websites"). The override itself still
  only *mutates* `navigator` on pages that self-declare Japanese — the
  everywhere part is only the tiny detector.
- **Signal = self-referential `hreflang="ja"` OR `<html lang="ja">`.** Owner
  confirmed the **self-referential** requirement. A page "declares itself
  Japanese" iff **either**:
  1. `document.documentElement.lang` starts with `ja` (case-insensitive), **or**
  2. there is a `<link rel="alternate" hreflang="ja…">` whose resolved `href`
     equals the **current document URL** (normalised — see Approach).
  - *Rules out* the naive "page has **any** `hreflang="ja"` alternate": a
    primarily-English site that merely *offers* a Japanese version also lists an
    `hreflang="ja"` alternate, and we must **not** force Japanese on it. Self-
    reference ("*this* page is the Japanese one") avoids that false positive.
    Match `ja` as a prefix so `ja-JP` counts.
- **Keep the `*.jp` override unconditional, as its own layer.** Auto-detect only
  catches sites that self-declare; `monokakido.jp` (the original `.jp` case)
  declares **no** language at all **and** sniffs inline in `<head>` — the
  observer could neither find a signal nor beat it. So `.jp` must stay
  **immediate + unconditional**. Net rule: **on `*.jp` hosts, override
  synchronously at `document_start` (as today); on every other host, override
  only if the page self-declares Japanese.** One payload, branch on hostname.
- **Reuse the exact override primitive.** Keep overriding **both**
  `navigator.language` and `navigator.languages` via persistent getters on
  `Navigator.prototype` (values `"ja"` / `["ja","ja-JP"]`), unchanged from
  `2026-07-21d`. Only the *decision to install them* becomes conditional on the
  non-`.jp` path.
- **Both browsers, mirroring the existing injection.** Chrome: static
  `content_scripts` (`"world":"MAIN"`, `document_start`), match widened to
  `<all_urls>`. Firefox: `userScripts.register` at runtime behind the popup,
  matches widened to `<all_urls>`, `optional_host_permissions` widened to
  `<all_urls>`. No change to the Firefox click-to-enable model — only the scope
  it grants.
- **Known ceiling (unchanged): client-side only.** Overriding `navigator`
  doesn't touch the `Accept-Language` HTTP header, so a site that negotiates
  language **server-side** is unaffected. `tamachi-tower.com` is client-side
  (verified), so it's covered; the gap stays hypothetical.
- **DNR rules and the `.jp` behaviour are untouched.** This is additive.

## Approach (guidance, not gospel)

Evolve the shipped `.jp` override; five touch points.

1. **`src/lang-override.ts`** — gate the override behind the two-layer rule. The
   existing top-level `Object.defineProperty` calls become an `applyOverride()`
   function called conditionally:

   ```ts
   const isJpHost = location.hostname === "jp" || location.hostname.endsWith(".jp");

   function applyOverride(): void {
     // existing prototype-getter overrides for language + languages
   }

   function declaresJapanese(): boolean {
     const htmlLang = document.documentElement.getAttribute("lang") || "";
     if (htmlLang.toLowerCase().startsWith("ja")) return true;
     for (const link of document.querySelectorAll<HTMLLinkElement>(
       'link[rel~="alternate"][hreflang^="ja" i]',
     )) {
       // self-referential: this page IS the ja version
       if (new URL(link.href, location.href).href.replace(/#.*$/, "") ===
           location.href.replace(/#.*$/, "")) return true;
     }
     return false;
   }

   if (isJpHost) {
     applyOverride();                      // unconditional, as today
   } else {
     if (declaresJapanese()) applyOverride();
     else {
       const obs = new MutationObserver(() => {
         if (declaresJapanese()) { applyOverride(); obs.disconnect(); }
       });
       obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
       // stop watching once the server-rendered document is parsed; don't
       // react to runtime SPA mutations (which arrive too late to matter and
       // can be circular — e.g. the app setting <html lang="ja"> while showing English).
       document.addEventListener("DOMContentLoaded", () => obs.disconnect(), { once: true });
     }
   }
   ```
   Notes: observe `document.documentElement` (always present at
   `document_start`), **not** `document.head` (may not exist yet). Include
   `attributes:true` so a late-but-still-server-parsed `<html lang>` is caught as
   a fallback to the synchronous check. URL-normalisation for the self-reference
   test is deliberately simple (strip hash); trailing-slash handling and other
   edge cases are negotiable — tune against real pages.

2. **`src/manifest.json`** — widen the two `.jp` patterns to `<all_urls>`:
   - `content_scripts[0].matches`: `["*://*.jp/*"]` → `["<all_urls>"]`
   - `optional_host_permissions`: `["*://*.jp/*"]` → `["<all_urls>"]`
   Leave `"world":"MAIN"`, `"run_at":"document_start"`, `"all_frames":true`
   as-is.

3. **`src/background.ts`** — the Firefox userScript registration matches widen:
   `JP_MATCHES = ["*://*.jp/*"]` → `["<all_urls>"]` (rename to something like
   `OVERRIDE_MATCHES`). Everything else (idempotent register, lifecycle
   re-registration) is unchanged.

4. **`src/popup.ts` / `src/popup.html`** — the Firefox permission request and
   the copy:
   - `REQUIRED_PERMISSIONS.origins`: `["*://*.jp/*"]` → `["<all_urls>"]`.
   - Update button/status text away from ".jp sites" to reflect the broadened
     behaviour (e.g. "Force Japanese on Japanese-language sites").

5. **`README.md`** — update the "Force Japanese `navigator.language`" feature
   section: it now also auto-forces Japanese on **non-`.jp`** sites that
   *declare themselves Japanese* (self-referential `hreflang="ja"` /
   `<html lang="ja">`); note the `<all_urls>` scope, the broadened Firefox
   permission, and that `.jp` remains unconditional (covering sites that declare
   nothing).

No build-script change expected — `lang-override.ts` is already an esbuild
entry point and the manifest/popup are already copied to `dist/`. Then
`npm run build`, `npm run typecheck`, `npm run lint`, load in both browsers, and
verify.

## Acceptance criteria

Phrased against observable behaviour so they survive a different implementation.
**Test the first-visit criteria in a fresh profile / private window** (no
`i18n_redirected` cookie), else tamachi-tower is already one language for an
unrelated reason.

- [ ] **The trigger case:** with bouncer loaded, a cookieless visit to
      `https://tamachi-tower.com/` displays in **Japanese** and **never flips to
      English** — no flash; the URL is unchanged (it's `no_prefix`, so there's no
      `/en/` to watch, only the in-place swap).
- [ ] On that page, DevTools shows `navigator.language` / `navigator.languages`
      reporting Japanese, and `window.$nuxt.$i18n.locale === "ja"`.
- [ ] **`.jp` layer intact:** `monokakido.jp` still lands on Japanese and never
      flashes to `/en/` (Chrome automatically; Firefox after the one-time popup
      click) — auto-detect did not regress the unconditional `.jp` behaviour.
- [ ] **No over-firing (the important negative):** on a plain **English** `.com`
      that declares itself English (no self-referential `hreflang="ja"`),
      `navigator.language` / `navigator.languages` remain the owner's **real**
      `en-GB`-first values — the override does **not** activate.
- [ ] **Self-reference respected:** on an English-primary site that merely
      *offers* a Japanese version (has an `hreflang="ja"` alternate pointing to a
      *different* URL, not the current page), the override does **not** fire.
- [ ] **Both browsers.** Firefox: before granting the permission, **all** sites
      behave normally (feature is click-to-enable); after granting `<all_urls>` +
      `userScripts` via the popup, tamachi-tower and `.jp` sites behave as above —
      without reloading the extension.
- [ ] The three DNR rules (filmarks, Shutto, WOVN) still function unchanged.
- [ ] No errors from bouncer in `chrome://extensions` / `about:debugging`.
- [ ] `npm run build`, `npm run typecheck`, `npm run lint` all still pass (lint's
      pre-existing `service_worker`-on-Firefox informational warning is expected).
- [ ] README + popup copy updated to describe the broadened, auto-detecting
      behaviour, the `<all_urls>` scope, and the broadened Firefox permission.

## Out of scope / non-goals

- **A per-domain allowlist** for non-`.jp` Japanese sites — explicitly superseded
  by auto-detect.
- **Forcing the `Accept-Language` HTTP header** / server-side negotiation — same
  unaddressed ceiling as the `.jp` feature; not pursued.
- **Catching inline-`<head>` sniffers that fire above their own self-declaration**
  — a real gap of auto-detect; the `.jp` glob covers the one known such case
  (`monokakido.jp`). Not solved generally here.
- **Removing dead JP/EN switcher UI** on affected sites — cosmetic, needs a
  content script mutation; not worth it (same call as prior stories).
- **A settings/allowlist/opt-out UI** — ship blanket auto-detect; revisit only if
  it bites (consistent with every prior global feature).
- **Firefox signing / permanent install** — still a separate later story.

## Open questions & risks

- **Sub-page / deep-link coverage** *(unverified)*: only the **homepage** was
  confirmed to carry the self-referential `hreflang="ja"`. If a sub-page's served
  HTML lacks it (e.g. the alternate always points to root, or `seo:false` means
  no per-page hreflang), a **direct, cookieless** deep-link to that sub-page might
  not trigger the override and could switch to English. *Mitigation already in
  place:* once the homepage triggers `ja`, nuxt-i18n writes `i18n_redirected=ja`
  and later navigations stay Japanese via the cookie. **Verify:** fetch a
  sub-page's raw HTML and check for a self-referential `hreflang`/`lang`; if
  absent, decide whether the cookie mitigation is enough or the signal set needs
  widening.
- **Cookie masking:** the switch only shows on a cookieless first visit — anyone
  verifying (or later doubting) the fix must use a fresh profile / private window.
- **Over-firing in the wild** *(watch)*: self-reference was chosen to avoid
  forcing Japanese on English sites that offer a `ja` version. Real-world sites
  vary; if a genuinely-English page ever self-declares `ja` in error, it'd be
  forced. No opt-out this version (deliberate) — revisit if it bites.
- **`document_start` synchronous `<html lang>` readability** *(minor race)*: the
  probe showed `<html>` attributes readable at the earliest script, but a true
  `document_start` content script may run a hair before they're populated —
  hence the `attributes:true` observer fallback. Confirm on a real loaded build.
- **`<all_urls>` footprint**: a MAIN-world script now runs at `document_start` on
  every page, plus a short-lived `MutationObserver` on non-`.jp` pages. Keep it
  tiny and **disconnect at `DOMContentLoaded`** so nothing lingers for the page
  lifetime.
- **Rule/heuristic drift**: if a target site stops self-declaring, or moves its
  detection inline into `<head>`, coverage regresses. Primary maintenance
  surface; the fallback is always the explicit `.jp` glob (for `.jp`) or, if
  ever needed, re-adding a per-domain match.

## Appendix — reproduction & raw findings

Reproduced live in Chrome, 2026-07-21, `navigator.languages =
["en-GB","en-US","ja","en"]`.

- **Auto-switch (live JS):** on `https://tamachi-tower.com/`,
  `$nuxt.$i18n.locale` → `"en"`; visible UI English. `setLocale("ja")` →
  Japanese UI, URL unchanged (confirms `no_prefix` in-place swap and that `ja`
  is the desired end state a Japanese-first browser would land on).
- **nuxt-i18n config (from `/_nuxt/1c3c28a.js`):** `defaultLocale:"ja"`;
  `strategy:"no_prefix"`; locales `en.json` / `ja.json`;
  `detectBrowserLanguage:{ alwaysRedirect:false, useCookie:true,
  cookieKey:"i18n_redirected", onlyOnRoot:false, onlyOnNoPrefix:false }`;
  detector body `navigator.languages ? match(normalizedLocales,
  navigator.languages) : accept-language fallback`.
- **Server HTML (`curl https://tamachi-tower.com/`, 3498 bytes):** Nuxt SPA
  shell; `<html>` with **no `lang`**; one head self-declaration `<link
  rel="alternate" hreflang="ja" href="https://tamachi-tower.com/">`; app
  bundles `/_nuxt/{02b6e22,a926cb6,1c3c28a,72f23fb}.js` as the last,
  parser-blocking scripts at end of `<body>`. No Shutto / WOVN / other
  third-party translation script present.
- **Head language signals (live):** exactly one `hreflang` alternate, `ja`,
  href = the page URL (self-referential); `metaContentLanguage: null`;
  `ogLocale: null`.
- **Streaming-parse probe (via `document.write` of a crafted document):**
  - First-in-`<head>` script sees `readyState:"loading"`, `<html>` attributes
    readable, hreflang link **not yet** visible.
  - After the hreflang `<link>` parses, it **is** visible, still before
    `<body>`.
  - A `MutationObserver` on `document.documentElement` installed by that first
    script logged `["LINK[hreflang=ja]","META","SCRIPT","BODY","H1"]` — proof the
    observer catches the self-declaration as it streams in, before app scripts.
  - Fidelity note: `document.write` reproduces parse *ordering*, not the exact
    `document_start` injection instant (which is strictly earlier). The
    conclusion — hreflang not synchronously readable at `document_start`,
    observer required, and it lands before the end-of-body detector — holds.
- **Cross-reference:** mechanism/injection machinery is identical to story
  `2026-07-21d` (`.jp` override, shipped v0.5.0); read it for the MAIN-world
  injection, the Firefox `userScripts` + popup model, and the `Navigator.prototype`
  getter technique this story reuses.

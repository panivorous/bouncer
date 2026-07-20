# Block Shutto Translation's browser-language auto-translation

**Summary.** Some Japanese sites embed **Shutto Translation** (シャトル翻訳,
`d.shutto-translation.com`), a third-party JS widget that reads the visitor's
browser language priority and *auto-translates the page* — for the owner (OS in
English, browser languages `en-GB, en-US, ja, en`) it silently rewrites native
Japanese sites into English. The owner is a Japanese speaker and wants the
original Japanese. **Add a static `declarativeNetRequest` rule that blocks the
Shutto script on every site**, so the widget never runs and each page stays in
its server-rendered original language. Status: **not started** — problem
reproduced and root-caused live; approach and scope decided with the owner.

This is bouncer's second network-block feature and a near-exact parallel to the
existing filmarks-geniee rule (`stories/2026-07-21a`). Read that story and
`README.md` for the established pattern; this one reuses it with one deliberate
difference: **the block is global, not site-scoped.**

## Context

- **bouncer** is the owner's personal MV3 extension (Firefox-main + Chrome,
  TypeScript, no framework). Its one shipped feature blocks an ad-gate popup on
  filmarks via a static DNR ruleset — no content script, no background logic.
- The annoyance was first hit on **`https://mf.workstyling.jp`** (Mitsui Fudosan
  "WORKSTYLING"), but the owner's real target is the **mechanism**: Shutto's
  browser-language auto-translation, wherever it appears (see Decisions → scope).

**Provenance — all facts below verified live in Chrome on 2026-07-21** (raw
markup fetched from the server + live DOM inspection), unless tagged *(assumed)*:

- The server renders **Japanese**: raw HTML has `<html lang="ja">`, title
  「ワークスタイリング | 三井不動産の法人向けレンタルオフィス・シェアオフィス」,
  ~9,250 Japanese characters.
- The raw HTML includes, server-side:
  `<script src="https://d.shutto-translation.com/trans.js?id=1539"></script>`.
  Shutto then loads `d.shutto-translation.com/scripts/<ver>/main.js` and defines
  a single global, **`window.__stt`**.
- With the owner's `navigator.languages = ["en-GB","en-US","ja","en"]` (English
  above Japanese), Shutto auto-translates the DOM to English client-side: the
  live `document.documentElement.lang` flips from `ja` to **`en`**. The owner
  sees the page render in Japanese and **flash to English within ~1s** — that
  flash is Shutto running.
- Shutto is the **only** translation layer on the page (single vendor, one
  origin, one global). There is no server-side language negotiation and no
  `/en/` URL variant — the URL is identical for both languages.

## Decisions & constraints

- **Approach: block the Shutto script at the network layer (DNR).** Chosen by
  the owner. Because the server already sends Japanese and Shutto only mutates it
  afterwards, blocking the script means the page simply **stays Japanese with no
  flash at all** (strictly better than the filmarks case, where a wall had to be
  prevented). This is declarative config, not code — a static ruleset + a
  manifest entry, **no content script and no change to `background.ts`.**
  - *Rules out:* the "pin Shutto's default to Japanese but keep it loaded so the
    EN toggle still works" alternative — it needs Shutto-specific cookie/script
    logic, is more fragile, and the owner explicitly does not want to translate
    these sites to English at all.
- **Scope: GLOBAL — block `d.shutto-translation.com` on every site**, i.e. **no
  `initiatorDomains`.** Chosen by the owner. The annoyance is the mechanism, not
  one domain, so any site using Shutto should fall back to its original language.
  - *This intentionally diverges from filmarks*, which scoped the block to one
    site via `initiatorDomains`. Here we omit that condition on purpose.
  - *Accepted consequence:* if the owner ever visits a **non-Japanese** site that
    uses Shutto to translate *into* Japanese, that site will now show its
    original (non-Japanese) language. The owner accepted this when choosing
    global. Narrowing later is a one-line change (add `initiatorDomains`).
- **Match only `script` resources.** Shutto is bootstrapped by `trans.js` (a
  `<script>`); blocking the loader stops the whole widget, so no API/translation
  requests ever fire. If a future Shutto version survives a script-only block,
  broaden `resourceTypes`. *(script-only sufficiency: assumed from "loader script
  gates everything" — confirm on implementation.)*
- **No `host_permissions` needed.** The shipped filmarks rule uses plain
  `"permissions": ["declarativeNetRequest"]` with **no** host permissions and its
  story records it **verified in both Chrome and Firefox**. That settles the
  open question the filmarks story flagged: a static *block* rule needs no host
  access on either browser. Reuse that exact setup; do **not** add
  `host_permissions` or `declarativeNetRequestWithHostAccess`.
- **The site's own JP/EN toggle is collateral, and that's fine.** The
  `<button data-stt-changelang="ja|en" data-stt-ignore>` buttons are
  server-rendered but wired up by Shutto; with Shutto blocked they remain in the
  DOM as **dead buttons**. We are *not* removing them (that would need a content
  script). Harmless leftover, noted so the implementer doesn't chase it.

## Approach (guidance, not gospel)

Mirror the filmarks feature. Three touch points:

1. **New ruleset** — `src/rules/shutto.json` (name negotiable):

   ```jsonc
   [
     {
       "id": 1,
       "priority": 1,
       "action": { "type": "block" },
       "condition": {
         "urlFilter": "||d.shutto-translation.com/",
         "resourceTypes": ["script"]
         // no initiatorDomains → global (owner's choice)
       }
     }
   ]
   ```
   `id` need only be unique *within this file*, so `1` is fine even though the
   filmarks ruleset also uses `1` (rule IDs are per-ruleset). `urlFilter`
   `||d.shutto-translation.com/` matches the Shutto CDN origin at any path
   (covers `trans.js`, `scripts/**/main.js`, and any same-host API call).

2. **Register it in `src/manifest.json`** — add a second entry to
   `declarative_net_request.rule_resources`:

   ```jsonc
   { "id": "shutto", "enabled": true, "path": "rules/shutto.json" }
   ```
   `permissions` already contains `declarativeNetRequest`; leave it unchanged.

3. **Build** — `scripts/build.mjs` already copies `src/rules/` → `dist/rules/`
   wholesale (added for filmarks), so a new JSON in that directory should be
   picked up with **no build change**. Verify the copy is directory-level (not a
   hard-coded filename); adjust only if it names files individually.

Then `npm run build`, load in both browsers, and verify against the criteria.

## Acceptance criteria

Phrased against observable behaviour, so they hold even if the implementation
differs:

- [ ] With bouncer loaded, `https://mf.workstyling.jp/` displays in **Japanese**
      and **never flips to English** — no flash.
- [ ] In DevTools on that page: requests to `d.shutto-translation.com` are
      **blocked**, `window.__stt` is `undefined`, and
      `document.documentElement.lang` stays `"ja"`.
- [ ] **Global scope confirmed:** on a *second, unrelated* site that embeds
      Shutto, the Shutto script is likewise blocked and the site shows its
      original language. (Find one via the appendix note; a quick spot-check.)
- [ ] **No collateral:** on a site that does **not** use Shutto, nothing bouncer
      added blocks any request and the page behaves normally.
- [ ] Works in **both** Chrome and Firefox (temporary load is fine for Firefox);
      no `host_permissions` were added.
- [ ] No errors from bouncer in `chrome://extensions` / `about:debugging`.
- [ ] `npm run build` still produces both artifacts in one command; `web-ext
      lint` is clean/acceptable.
- [ ] A short README note records that bouncer blocks Shutto
      (`d.shutto-translation.com`) **globally** to stop browser-language
      auto-translation, and that scope is tuned via `initiatorDomains` (add to
      narrow; omit to keep global).

## Out of scope / non-goals

- **Pinning Shutto to Japanese / preserving the EN toggle** — the rejected
  alternative approach.
- **Removing the now-dead JP/EN toggle buttons** — cosmetic DOM leftover; not
  worth a content script.
- **Other translation tech** — browser built-in "Translate this page", Google
  Website Translator, WOVN, etc. are different mechanisms; if any annoys the
  owner later, it's a separate rule/story.
- **Per-site opt-outs / an allowlist** for Shutto sites the owner *does* want
  translated — not needed now (global chosen deliberately); revisit only if the
  accepted consequence below bites.
- **Firefox signing / permanent install** — still a separate later story;
  Firefox loads bouncer as a Temporary Add-on for now (per the scaffold story).

## Open questions & risks

- **Global-scope trade-off (the main one):** a non-Japanese site using Shutto to
  translate *into* Japanese will now show its original language for the owner.
  Accepted; the escape hatch is adding `initiatorDomains` to re-scope.
- **Rule drift:** if Shutto changes its CDN host, or a site self-hosts / uses a
  vanity script domain, translation could return. Fix = update/extend
  `urlFilter`. This is the primary maintenance surface. *(The `?id=1539` on
  workstyling's tag is that site's Shutto account id — irrelevant to a
  host-based block; recorded only as evidence.)*
- **Script-only sufficiency** *(assumed)* — verify blocking `resourceTypes:
  ["script"]` alone fully suppresses translation; broaden if a future Shutto
  build injects via other resource types.
- **Rule-ID uniqueness across rulesets** *(assumed fine)* — Chrome/Firefox scope
  rule IDs per ruleset; confirm the loader accepts `id: 1` in both files without
  complaint.

## Appendix — reproduction & raw findings

Reproduced live in Chrome, 2026-07-21, at `https://mf.workstyling.jp/`:

- **Browser languages** (drives the auto-translation):
  `navigator.languages = ["en-GB","en-US","ja","en"]` — English above Japanese.
- **Server markup vs. live DOM:**
  - Raw HTML (server): `<html lang="ja">`, Japanese `<title>`, ~9,250 JP chars.
  - Live DOM (after Shutto): `<html lang="en">`, English content.
- **Shutto footprint:**
  - Server-rendered tag: `<script src="https://d.shutto-translation.com/trans.js?id=1539"></script>`
  - Also loaded: `d.shutto-translation.com/scripts/2.6.65/main.js`
  - Global: `window.__stt` (with `init/get/set/cookie/notification/…`).
  - Toggle markup (server-rendered):
    `<li><button data-stt-changelang="ja" data-stt-ignore>JP</button></li>`
    and the matching `en` button carries `data-stt-active`.
- **How to find a second Shutto site for the global spot-check:** search the web
  for pages embedding `d.shutto-translation.com/trans.js`, or note that Shutto
  (shutto-translation.com) is a widely used Japanese SaaS — any such site works.

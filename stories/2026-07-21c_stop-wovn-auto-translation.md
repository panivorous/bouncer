# Block WOVN.io's browser-language auto-translation

**Summary.** `skylark.co.jp` (Gusto menu and siblings) embeds **WOVN.io**
(`j.wovn.io`), a third-party JS localization widget that reads the visitor's
browser-language priority and **auto-switches the page out of Japanese**. For the
owner (browser languages `en-GB, en-US, ja, en`, English above Japanese) a first
visit to `https://www.skylark.co.jp/gusto/menu/` flips to English on its own. The
owner is a Japanese speaker and wants the original Japanese. **Add a static
`declarativeNetRequest` rule that blocks the WOVN loader script on every site**,
so the widget never runs and each page stays in its server-rendered original
language. Status: **not started** — problem reproduced and root-caused live;
approach and global scope decided with the owner.

This is bouncer's **third** network-block feature and a near-exact parallel to
the existing Shutto rule (`stories/2026-07-21b`, shipped). Read that story and
`README.md` for the established pattern — this one reuses it wholesale, just for a
different translation vendor, and (like Shutto, by the owner's choice) **global,
not site-scoped.** The couple of ways WOVN differs from Shutto are called out
explicitly below; none of them change the fix.

## Context

- **bouncer** is the owner's personal MV3 extension (Firefox-main + Chrome,
  TypeScript, no framework). Its shipped features are two static DNR rulesets —
  a filmarks ad-gate block (site-scoped) and a Shutto translation block
  (global). No content script, no background logic; `background.ts` is an empty
  placeholder.
- The owner already met, root-caused, and shipped a fix for the **identical
  class of annoyance** via Shutto (`d.shutto-translation.com`). WOVN is a second,
  independent Japanese localization SaaS doing the same browser-language
  auto-translation — the owner wants it treated the same way.

**Provenance — everything below tagged _verified live_ was observed in Chrome on
2026-07-21** (live DOM inspection + raw HTML fetched from the origin), with the
owner's `navigator.languages = ["en-GB","en-US","ja","en"]`. Facts tagged
_owner-reported_ or _assumed_ were **not** independently re-reproduced this
session and the implementer should treat them accordingly.

- **_Verified live._** The bare menu URL is server-rendered **Japanese**:
  `fetch("https://www.skylark.co.jp/gusto/menu/")` returns `<html lang="ja">`,
  Japanese `<title>` (「ガストのメニュー …」), status `200`, **not** redirected —
  the server does not language-negotiate on `Accept-Language`.
- **_Verified live._** The page loads the WOVN client widget server-side:
  `<script src="https://j.wovn.io/1" data-wovnio="…" async>`. It defines a full
  client-side translation API at **`window.WOVN.io`** (`changeLang`,
  `getCurrentLang`, `swap`, `translateTexts`, `changeLang`, …). On load
  `WOVN.io.getCurrentLang()` was `ja`.
- **_Verified live._** WOVN translates this exact page: calling
  `WOVN.io.changeLang("en")` navigated the tab to
  `https://www.skylark.co.jp/en/gusto/menu/` with `<html lang="en">` and an
  English title. `changeLang("ja")` returned it to the bare Japanese URL.
- **_Verified live._ WOVN here runs in _path mode_ with genuine server-side
  English routes.** `fetch("https://www.skylark.co.jp/en/gusto/menu/")` returns
  `<html lang="en">`, English title, status `200`, `redirected:false`, ~855
  residual JP chars (brand names like ガスト). So `/en/…` is a real, pre-translated
  **server** route — not a client-only illusion. (It still includes the WOVN
  script, for the in-page switcher.)
- **_Owner-reported_ (consistent with WOVN, not re-reproduced this session
  because of the cookie below):** a **cookieless first visit** (e.g. a private
  window) to the bare URL auto-switches to English; **revisiting stays
  Japanese.** This matches WOVN's "auto-redirect by browser language" feature:
  with no `wovn_selected_lang` cookie, the client widget reads
  `navigator.languages`, sees English on top, and switches to English (in path
  mode: navigates to `/en/…`); the choice is then persisted in a
  `wovn_selected_lang` cookie, so later visits honour whatever it last recorded.
  The owner's normal profile currently holds a `ja` preference, which is why the
  page was Japanese during this session — **the auto-translation only surfaces
  with a cleared cookie / fresh profile.**

**Net mechanism:** the bare Japanese URL is fine on the server; the *client* WOVN
script is what detects the English browser and switches away. Kill the script and
the switch never happens — the page stays server-rendered Japanese. Exactly the
Shutto shape.

## Decisions & constraints

- **Approach: block the WOVN loader script at the network layer (DNR).** Settled
  — direct parallel to the shipped Shutto rule, and the same reasoning holds:
  the server already sends Japanese and only the client widget mutates it, so
  blocking the script means the bare URL **stays Japanese with no flash and no
  redirect.** Declarative config, not code — a static ruleset + one manifest
  entry, **no content script, no change to `background.ts`.**
  - *Rules out* the "pin WOVN's default language to Japanese via cookie but keep
    it loaded so the EN switcher still works" alternative — it needs
    WOVN-specific cookie logic, is fragile, and the owner explicitly does not
    want these sites auto-translated to English at all. (Same rejection the
    Shutto story recorded.)
- **Scope: GLOBAL — block `wovn.io` on every site**, i.e. **no
  `initiatorDomains`.** Chosen by the owner this session (offered global vs.
  `skylark.co.jp`-only; picked global). The annoyance is the *mechanism*, not one
  domain, mirroring the Shutto decision.
  - *Accepted consequence* (owner accepted it for Shutto and again here): a
    **non-Japanese** site that uses WOVN to translate *into* Japanese will now
    show its original (non-Japanese) language for the owner. Narrowing later is a
    one-line change — add `initiatorDomains`.
- **Match only `script` resources.** WOVN is bootstrapped by the
  `<script src="https://j.wovn.io/1">` loader; blocking that stops the whole
  widget before it can read the browser language, so no translation/redirect
  fires. *(Script-only sufficiency: assumed from "loader script gates
  everything," as with Shutto — confirm on implementation.)*
- **Recommended `urlFilter`: `||wovn.io/`** (the whole vendor origin, any
  subdomain), not just `||j.wovn.io/`. Rationale: matches the Shutto rule's
  "block the vendor origin" spirit and is robust if WOVN serves the loader or
  follow-up assets from another `wovn.io` host. `j.wovn.io/1` is the specific
  loader observed live; `||wovn.io/` is a superset of it. Negotiable — narrow to
  `||j.wovn.io/` if a reason appears.
- **`/en/…` server routes are intentionally left working, and that's correct.**
  Because `/en/…` is genuine server-side content, blocking the *client* script
  does **not** break it: if the owner ever explicitly wants English, navigating
  to `/en/…` still serves English. We are only killing the *automatic*
  browser-language switch on the bare URL. This is a genuine difference from
  Shutto (which had no URL variant) and it's a feature, not a gap — do not try to
  also block `/en/` pages.
- **No `host_permissions` needed.** The shipped filmarks and Shutto rules use
  plain `"permissions": ["declarativeNetRequest"]` with **no** host permissions,
  verified in both Chrome and Firefox. Reuse that exact setup; do **not** add
  `host_permissions` or switch to `declarativeNetRequestWithHostAccess`.
- **The site's own JP/EN switcher is collateral, and that's fine.** WOVN renders
  a language switcher wired up by the widget; with the script blocked it becomes
  dead controls in the DOM. We are *not* removing them (that would need a content
  script). Harmless leftover — noted so the implementer doesn't chase it. (Same
  call as Shutto's dead toggle.)

## Approach (guidance, not gospel)

Mirror the shipped Shutto feature. Three touch points:

1. **New ruleset** — `src/rules/wovn.json` (name negotiable):

   ```jsonc
   [
     {
       "id": 1,
       "priority": 1,
       "action": { "type": "block" },
       "condition": {
         "urlFilter": "||wovn.io/",
         "resourceTypes": ["script"]
         // no initiatorDomains → global (owner's choice)
       }
     }
   ]
   ```
   `id` need only be unique *within this file*, so `1` is fine even though the
   filmarks and Shutto rulesets also use `1` (rule IDs are per-ruleset).
   `urlFilter` `||wovn.io/` matches the WOVN CDN origin at any subdomain/path
   (covers `j.wovn.io/1` and any sibling host).

2. **Register it in `src/manifest.json`** — add a **third** entry to
   `declarative_net_request.rule_resources` (filmarks + shutto are already
   there):

   ```jsonc
   { "id": "wovn", "enabled": true, "path": "rules/wovn.json" }
   ```
   `permissions` already contains `declarativeNetRequest`; leave it unchanged.

3. **Build** — no build change needed. `scripts/build.mjs` copies the whole
   `src/rules/` directory into `dist/rules/` (verified this session:
   `await cp(resolve(srcDir, "rules"), resolve(distDir, "rules"), { recursive:
   true })`), so a new JSON in that directory is picked up automatically.

Then `npm run build`, load in both browsers, and verify against the criteria.

## Acceptance criteria

Phrased against observable behaviour, so they hold even if the implementation
differs. **Note the cookie caveat:** the auto-translation only appears with no
`wovn_selected_lang` cookie — test the first-visit criteria in a **fresh profile
/ private window**, or the site will "already be Japanese" and prove nothing.

- [ ] With bouncer loaded, in a **fresh profile / private window** (no WOVN
      cookie), visiting `https://www.skylark.co.jp/gusto/menu/` displays in
      **Japanese** and **never switches to English / never redirects to
      `/en/…`** — no flash.
- [ ] In DevTools on that page: requests to `wovn.io` (`j.wovn.io`) are
      **blocked**, `window.WOVN` is `undefined`, the URL stays `/gusto/menu/`,
      and `document.documentElement.lang` stays `"ja"`.
- [ ] **Explicit English still works:** directly navigating to
      `https://www.skylark.co.jp/en/gusto/menu/` still shows the server-rendered
      English page (the block only kills the *automatic* switch, not the
      server-side `/en/` route).
- [ ] **Global scope confirmed:** on a *second, unrelated* site that embeds the
      WOVN client widget, the WOVN script is likewise blocked and the site shows
      its original server-rendered language.
- [ ] **No collateral:** on a site that does **not** use WOVN, nothing bouncer
      added blocks any request and the page behaves normally.
- [ ] Works in **both** Chrome and Firefox (temporary load is fine for Firefox);
      no `host_permissions` were added.
- [ ] No errors from bouncer in `chrome://extensions` / `about:debugging`, with
      **three** rulesets (filmarks, shutto, wovn) all loaded.
- [ ] `npm run build` still produces both artifacts in one command; `web-ext
      lint` is clean/acceptable.
- [ ] A short README note records that bouncer blocks WOVN (`wovn.io`)
      **globally** to stop browser-language auto-translation, and that scope is
      tuned via `initiatorDomains` (add to narrow; omit to keep global).

## Out of scope / non-goals

- **Pinning WOVN to Japanese / preserving the in-page switcher** — the rejected
  alternative approach.
- **Blocking / altering the `/en/…` server routes** — they're genuine
  server-side content and left working on purpose; explicit English stays
  reachable. We only stop the automatic switch.
- **Removing the now-dead WOVN language switcher** — cosmetic DOM leftover; not
  worth a content script.
- **WOVN "server-side proxy" deployments** — some sites run WOVN entirely at a
  proxy with no client `wovn.io` script; a network block of the client loader
  can't touch those. Not applicable to skylark (verified client-widget mode) and
  out of scope.
- **Other translation tech** — Shutto is already handled; browser built-in
  "Translate this page", Google Website Translator, etc. are separate mechanisms
  for separate stories.
- **Per-site opt-outs / allowlist** for WOVN sites the owner *does* want
  translated — not needed now (global chosen deliberately).
- **Firefox signing / permanent install** — still a separate later story.

## Open questions & risks

- **Global-scope trade-off (the main one):** a non-Japanese site using WOVN to
  translate *into* Japanese will now show its original language for the owner.
  Accepted; escape hatch is adding `initiatorDomains`.
- **Cookie-masked reproduction:** the auto-translation is gated by the
  `wovn_selected_lang` cookie, so it only shows on a cookieless first visit.
  Anyone verifying (or later doubting) the fix must use a fresh profile/private
  window, else the site is already Japanese for an unrelated reason.
- **Rule drift:** if WOVN changes its CDN host, or a site self-hosts / uses a
  vanity script domain, translation could return. Fix = update/extend
  `urlFilter`. Primary maintenance surface.
- **Script-only sufficiency** *(assumed)* — verify blocking `resourceTypes:
  ["script"]` alone fully suppresses the widget; broaden if a future WOVN build
  injects via other resource types.
- **Three-ruleset loading** *(assumed fine)* — confirm Chrome/Firefox happily
  load all three static rulesets and that per-ruleset `id: 1` collisions across
  files are a non-issue (they are — IDs are per-ruleset).

## Appendix — reproduction & raw findings

Reproduced live in Chrome, 2026-07-21, at `https://www.skylark.co.jp/gusto/menu/`
with `navigator.languages = ["en-GB","en-US","ja","en"]`:

- **WOVN footprint (verified):**
  - Loader tag (server-rendered): `<script src="https://j.wovn.io/1"
    data-wovnio="…" async></script>` (the `data-wovnio` value carries the site's
    WOVN token/config — irrelevant to a host-based block).
  - Client global: `window.WOVN.io` with methods `changeLang`, `getCurrentLang`,
    `swap`, `translateTexts`, `getWovnUrl`, `manualStart`, `optOut`, … .
  - `WOVN.io.getCurrentLang()` → `"ja"` on load.
- **Server vs. live language:**
  - Bare URL raw HTML (server): `<html lang="ja">`, Japanese title, status 200,
    `redirected:false`.
  - `WOVN.io.changeLang("en")` → tab navigates to `/en/gusto/menu/`, live
    `<html lang="en">`, English title. `changeLang("ja")` restores the bare
    Japanese URL. (Both round-trips left the profile back on `ja`.)
  - `/en/gusto/menu/` raw HTML (server): `<html lang="en">`, English title,
    status 200, `redirected:false`, ~855 residual JP chars → genuine server-side
    path-mode English route.
- **How to find a second WOVN site for the global spot-check:** WOVN.io
  (`wovn.io`, by Minimal Technologies / WOVN, Inc.) is a widely used Japanese
  localization SaaS; search the web for pages embedding `j.wovn.io/1`, or look
  for other Skylark-group brand sites, which share the integration.
- **Storage seen (context only, not part of the fix):** localStorage held
  analytics keys (`__sptrk*`, `_gcl_ls`, `__pp_uid`), no translation state; the
  language memory lives in the `wovn_selected_lang` cookie.

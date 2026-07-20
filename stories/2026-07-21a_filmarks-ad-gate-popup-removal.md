# Remove the filmarks.com "引き続き利用いただくには" ad-gate popup

- **Status:** Done — shipped in v0.2.0. Implemented as a static
  `declarativeNetRequest` block rule (`src/rules/filmarks-geniee.json`); verified
  in Chrome and Firefox.

---

## Background

`bouncer` is the owner's personal all-in-one browser extension for fixing
day-to-day browsing annoyances (see `README.md`). The scaffold story
(`2026-07-20a`) stood up an installable, no-behaviour MV3 extension that loads
in both Firefox (main browser) and Chrome. **This is the first real feature.**

On **filmarks.com** (a Japanese movie-review site), opening a page such as
`https://filmarks.com/movies/123599/reviews/220851182` pops up a modal titled
**「引き続き利用いただくには」** ("To keep using this site") that **blocks the
whole page**: it darkens the screen, disables scrolling, and the only way
forward it offers is a **「短い広告を見る」** ("Watch a short ad") button. Until
you watch the ad, the site is unusable.

The owner wants this popup **gone permanently** — every visit, no interaction
required.

**This problem was reproduced and analysed live in Chrome during handover;** the
facts and the chosen approach below are verified, not guessed.

## Goal

Prevent the ad-gate popup from ever appearing on filmarks.com by **blocking the
scripts that build it at the network layer** — so the modal is never created,
the page never scroll-locks, and there is nothing to flash or clean up. The rest
of the site keeps working.

## Chosen approach: block the injector scripts (declarativeNetRequest)

**The popup is Geniee's "Overlay Wall."** Confirmed live: every id/class of the
gate is prefixed **`gn-ow`** / **`gn_ow_`** (`gn` = Geniee), and page globals
like `gn_wrapper_executed`, `gn_wrapper_queue`, `gnpb` are Geniee's
header-bidding wrapper. The wall is built by Geniee's ad scripts, **all served
from one origin, `cpt.geniee.jp`:**

```
cpt.geniee.jp/hb/v1/213737/468/wrapper.min.js
cpt.geniee.jp/hb/v1/lib/prebid-v10.29.0-791897d4.js
cpt.geniee.jp/hb/v1/lib/gnshbrequest-v5.19.0.js
cpt.geniee.jp/hb/v1/213737/468/instbody.min.js
```

There is **no dedicated "overlay-wall.js"** — the wall is bundled inside this ad
stack, so we cannot block *only* the popup. The plan is therefore: **block
Geniee (`cpt.geniee.jp`) scripts while on filmarks.** If those scripts never
run, the wall is never built and the page is never locked.

**Why this is safe for the site:** filmarks' own application code is served
separately (its app bundle comes from `d2ueuvlup6lbue.cloudfront.net/assets/…`),
and the page's content (review text, poster, navigation) rendered fully
independent of Geniee during testing. Geniee is a pure ad/monetisation layer, so
blocking it removes the ads **and** the wall without touching site
functionality.

**Mechanism — `declarativeNetRequest` (DNR).** An MV3 *content script cannot
block network requests*, so this feature is **declarative config, not code**: a
static DNR ruleset plus a manifest entry. No content script and no change to the
placeholder `background.ts` are needed.

### The rule

A static ruleset file (e.g. `src/rules/filmarks-geniee.json`):

```jsonc
[
  {
    "id": 1,
    "priority": 1,
    "action": { "type": "block" },
    "condition": {
      "urlFilter": "||cpt.geniee.jp/",
      "resourceTypes": ["script"],
      "initiatorDomains": ["filmarks.com"]   // scope to filmarks only
    }
  }
]
```

- `urlFilter: "||cpt.geniee.jp/"` matches the Geniee origin (any path).
- `resourceTypes: ["script"]` targets the injector JS. If the wall ever survives
  a script-only block, broaden to include `sub_frame`/`xmlhttprequest`.
- `initiatorDomains: ["filmarks.com"]` keeps the block scoped to filmarks per the
  site-scope decision — Geniee on any other site is untouched.

### Manifest changes (`src/manifest.json`)

```jsonc
"permissions": ["declarativeNetRequest"],
"declarative_net_request": {
  "rule_resources": [
    { "id": "filmarks_geniee", "enabled": true, "path": "rules/filmarks-geniee.json" }
  ]
}
```

Plain `declarativeNetRequest` lets static block rules act **without** host
permissions on Chrome — simplest for our case. (`declarativeNetRequestWithHostAccess`
would require host permissions to both request and initiator, i.e. *more*
permissions, so don't use it here.) The `path` is relative to the extension
root, so the rules file must land in `dist/` (see build changes).

### Build-pipeline changes (`scripts/build.mjs`)

`build.mjs` currently esbuild-compiles `background.ts` and copies
`manifest.json` + `icons/` into `dist/`. Add **one copy step**: copy the rules
JSON (e.g. `src/rules/` → `dist/rules/`) verbatim so the path referenced by the
manifest exists in the built extension. No new TypeScript to compile. Keep the
single-command `npm run build` and a clean `npm run lint` (`web-ext lint`).

### Cross-browser notes (verify on both)

DNR is supported in **both** Chrome and Firefox MV3, but parity has sharp edges —
confirm on Firefox (the owner's main browser) specifically:

- **Host permissions:** Firefox's DNR generally requires `host_permissions`
  matching the request/initiator for rules to take effect, whereas plain
  `declarativeNetRequest` on Chrome does not. Likely need to add
  `host_permissions: ["*://*.filmarks.com/*", "*://cpt.geniee.jp/*"]` for
  Firefox. Verify and add if so.
- **`initiatorDomains`:** confirm the current Firefox supports the
  `initiatorDomains` condition key (older DNR used `domains`).
- **Temporary add-on:** confirm static rulesets load and apply when Firefox loads
  bouncer as a Temporary Add-on.
- Check `web-ext lint` accepts the `declarative_net_request` key (warnings vs.
  errors).

## Decisions already made (confirmed with the owner)

- **Approach: network-blocking only.** Block Geniee's scripts via DNR. The
  DOM-removal / CSS-unlock "safety net" is **intentionally deferred** — add it
  later only if Geniee changes how the wall is delivered and the block stops
  working. Do **not** build it now.
- **Site scope: all of `filmarks.com`** (`initiatorDomains: ["filmarks.com"]`),
  because the gate blocks more than just review pages. Not narrowed to
  `/reviews/`.
- **Generalisation: note it, don't build it.** The same Geniee wall appears on
  other sites that embed Geniee. Widening is cheap later — add more entries to
  `initiatorDomains`, or drop the initiator scope to block Geniee everywhere —
  but the owner wants **filmarks only for now**.
- **Persistence is out of scope.** "Permanently" here means *the popup is gone on
  every visit*, not *the extension survives a Firefox restart*. Firefox still
  loads bouncer as a Temporary Add-on (dropped on restart) per the scaffold
  story's deferred signing decision; making the install permanent
  (`web-ext sign` / AMO / self-distribution) remains a **separate later story**.

## Reference: what the popup is (for verification, not manipulation)

We are **not** touching the DOM — these facts are recorded so you can *verify the
block worked* (none of them should ever appear once Geniee is blocked):

- Overlay root: `#gn-ow-container` (DIV, direct child of `<body>`,
  `position: fixed`, `z-index: 1000001000`), containing `#gn-ow-dialog` with
  `#gn-ow-title`, `#gn-ow-description`, `#gn-ow-button`, etc.
- Scroll-lock: the class **`gn_ow_scroll_cancel`** added to `<body>`, backed by an
  inline rule `body.gn_ow_scroll_cancel { overflow: hidden !important; }`.
- The wall self-suppresses for ~6h after an ad view via
  `localStorage['gn_ow_ui_vc']` (irrelevant once the scripts are blocked).
- Timing: with Geniee **allowed**, the wall injects within ~1s of load. With it
  **blocked**, `#gn-ow-container` must never be created and
  `gn_ow_scroll_cancel` must never be added to `<body>`.

## Acceptance criteria

- [ ] With bouncer loaded, visiting `https://filmarks.com/movies/123599/reviews/220851182`
      shows **no** 「引き続き利用いただくには」 popup, and the page scrolls — with
      no flash, because the wall is never built.
- [ ] DevTools ▸ Network shows requests to `cpt.geniee.jp/…` **blocked**, and in
      the console `document.getElementById('gn-ow-container')` is `null` and
      `document.body.classList.contains('gn_ow_scroll_cancel')` is `false`.
- [ ] The same holds on at least one **non-review** filmarks page (the gate is
      site-wide), confirming the `filmarks.com` scope.
- [ ] Geniee is **not** blocked on non-filmarks sites (spot-check the block is
      scoped by initiator).
- [ ] Normal filmarks behaviour is intact: navigation works, content renders, no
      site functionality broken.
- [ ] No errors from bouncer in `chrome://extensions` / `about:debugging`.
- [ ] Works in **both** Chrome and Firefox (temporary load is fine for Firefox;
      add `host_permissions` if Firefox DNR needs them — see cross-browser notes).
- [ ] `npm run build` still produces both artifacts in one command; `web-ext
      lint` is clean/acceptable.
- [ ] A short note (README and/or a comment) records that the rule targets
      Geniee (`cpt.geniee.jp`) on filmarks and generalises by widening
      `initiatorDomains`.

## Non-goals / out of scope

- The DOM-removal / CSS-unlock safety net (deferred; add only if the block ever
  stops working).
- Generalising to other sites now (documented as a trivial widening).
- Blocking non-Geniee ads on filmarks — only the Geniee stack (which carries the
  wall) is blocked.
- Firefox signing / permanent install (separate later story).

## Open questions

- **Firefox DNR parity:** confirm whether `host_permissions` are required, that
  `initiatorDomains` is supported, and that static rulesets apply for a Temporary
  Add-on. (Chrome path is straightforward.)
- **Narrower block (optional):** blocking just `cpt.geniee.jp/hb/v1/.../instbody.min.js`
  *might* kill the wall while leaving header bidding intact. Unverified — the
  origin-wide block is the reliable default; only pursue the narrow rule if
  there's a reason to preserve the rest of Geniee (there isn't, for this owner).
- **Rule drift:** if Geniee moves CDN/origin or filmarks swaps ad vendors, the
  wall could return; the fix is then to update `urlFilter`. (This is the main
  maintenance surface of the network-block approach.)

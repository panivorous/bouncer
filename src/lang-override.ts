// bouncer — "language override" payload (runs in the page's MAIN world).
//
// Some Japanese sites sniff the browser's self-reported language client-side
// and redirect away from Japanese when English outranks it. The original
// case, monokakido.jp, ships an inline first-party script on its homepage that
// reads `navigator.language` and does `location.replace("./en/")` unless it
// starts with "ja" — there's no third-party script to block and no HTTP-level
// redirect to intercept, so the declarativeNetRequest approach used for
// Shutto/WOVN doesn't apply here.
//
// We fix this by making `navigator.language` and `navigator.languages` report
// Japanese, so any site that trusts the browser's self-reported language
// behaves as if the visitor prefers Japanese and leaves the page alone. But we
// don't want that override active *everywhere* — only where Japanese is the
// right answer. This payload therefore runs on every site (Chrome/Firefox
// inject it on `<all_urls>`) but decides, per page, whether to install the
// override, using a two-layer rule:
//
//   - On `*.jp` hosts: install unconditionally, synchronously, as the original
//     feature did. `.jp` covers sites like monokakido.jp that declare *no*
//     language at all AND sniff inline in <head> above any self-declaration —
//     auto-detect (below) could neither find a signal nor beat the sniff, so
//     the host glob stays the immediate, unconditional layer.
//   - On every other host: install only if the page *declares itself Japanese*
//     — a self-referential `<link rel="alternate" hreflang="ja">` (its href is
//     this very page) or `<html lang="ja">`. This auto-detects non-`.jp`
//     Japanese sites (e.g. tamachi-tower.com, a .com Nuxt/nuxt-i18n site) with
//     no per-domain allowlist. "Self-referential" is required: a primarily
//     English site that merely *offers* a Japanese version also lists an
//     `hreflang="ja"` alternate, and we must not force Japanese on it.
//
// This file is the shared payload for both browsers' injection paths:
//   - Chrome:  a static `content_scripts` entry with `"world": "MAIN"`.
//   - Firefox: registered at runtime via the userScripts API (see background.ts).
//
// It must run at document_start — before the target page's own <head> scripts
// — and in the page's MAIN world, so it patches the navigator the page reads.
// We override the getters on `Navigator.prototype` (not just the `navigator`
// instance) so the spoof holds however a page reads them, install them as
// persistent getters (not one-time value patches) so they hold for the whole
// page lifetime, and keep `language` and `languages` mutually consistent.
//
// Known ceiling: this only affects client-side JS language detection. It does
// NOT change the `Accept-Language` HTTP request header, so a site that
// negotiates language server-side is unaffected. (monokakido.jp is confirmed
// to ignore `Accept-Language` entirely, so it's fully covered.)

const JA_LANGUAGE = "ja";
const JA_LANGUAGES: readonly string[] = ["ja", "ja-JP"];

// Install the persistent `navigator.language` / `navigator.languages` override.
// Idempotent enough for our use: the two layers below are mutually exclusive,
// so this runs at most once per document, but re-defining a configurable getter
// is harmless anyway.
function applyOverride(): void {
  Object.defineProperty(Navigator.prototype, "language", {
    configurable: true,
    enumerable: true,
    get: () => JA_LANGUAGE,
  });

  Object.defineProperty(Navigator.prototype, "languages", {
    configurable: true,
    enumerable: true,
    // Return a fresh copy each read so callers can't mutate the shared array
    // (the real property is a read-only, frozen array).
    get: () => [...JA_LANGUAGES],
  });
}

// Strip the fragment from a URL so the self-reference test ignores in-page
// anchors (`#section`), which never change which document you're on.
function withoutHash(url: string): string {
  return url.replace(/#.*$/, "");
}

// Does the page declare *itself* to be Japanese? True iff either
//   1. <html lang> starts with "ja" (so "ja", "ja-JP", … all count), or
//   2. there's a `<link rel="alternate" hreflang="ja…">` whose resolved href is
//      this very page — i.e. the page says "*this* URL is the Japanese one",
//      not merely "a Japanese version exists elsewhere".
function declaresJapanese(): boolean {
  const htmlLang = document.documentElement.getAttribute("lang") ?? "";
  if (htmlLang.toLowerCase().startsWith("ja")) return true;

  const here = withoutHash(location.href);
  for (const link of document.querySelectorAll<HTMLLinkElement>(
    'link[rel~="alternate"][hreflang^="ja" i]',
  )) {
    if (withoutHash(new URL(link.href, location.href).href) === here) return true;
  }
  return false;
}

const isJpHost = location.hostname === "jp" || location.hostname.endsWith(".jp");

if (isJpHost) {
  // Layer 1: `.jp` hosts always get the override, immediately — no signal
  // needed and no waiting (some `.jp` sniffers run inline in <head> above any
  // self-declaration, so we can't afford to observe-then-apply here).
  applyOverride();
} else if (declaresJapanese()) {
  // Layer 2, fast path: the self-declaration is already in the DOM at
  // document_start (e.g. an <html lang="ja"> present on the very first tag).
  applyOverride();
} else {
  // Layer 2, streaming path: at document_start a self-referential hreflang link
  // declared lower in <head> hasn't been parsed yet. Watch the document as the
  // parser streams nodes in and apply the override the instant the declaration
  // appears — this lands before the site's own end-of-<body> language detector.
  const observer = new MutationObserver(() => {
    if (declaresJapanese()) {
      applyOverride();
      observer.disconnect();
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
  });

  // Stop once the server-rendered document is fully parsed. We only care about
  // the served HTML's self-declaration; reacting to later runtime SPA mutations
  // would be both too late to matter and potentially circular (an app can set
  // <html lang="ja"> while it's actually showing English).
  document.addEventListener(
    "DOMContentLoaded",
    () => observer.disconnect(),
    { once: true },
  );
}

export {};

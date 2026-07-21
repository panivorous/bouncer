// bouncer — ".jp language override" payload (runs in the page's MAIN world).
//
// Some Japanese sites sniff the browser's self-reported language client-side
// and redirect away from Japanese when English outranks it. The motivating
// case, monokakido.jp, ships an inline first-party script on its homepage that
// reads `navigator.language` and does `location.replace("./en/")` unless it
// starts with "ja" — there's no third-party script to block and no HTTP-level
// redirect to intercept, so the declarativeNetRequest approach used for
// Shutto/WOVN doesn't apply here.
//
// Instead we make `navigator.language` and `navigator.languages` report
// Japanese on every *.jp site, so any site that trusts the browser's
// self-reported language (this one included) behaves as if the visitor prefers
// Japanese and leaves the page alone.
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

export {};

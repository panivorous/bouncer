// bouncer — background service worker (placeholder).
//
// This first story ships no real behaviour; this file exists only to exercise
// the TypeScript build pipeline and give future annoyance-fixing features a
// home. When features arrive, wire them up from here.
//
// The `chrome.*` namespace is available in both Chrome and Firefox, so this
// stays cross-browser. (Future features will likely move to the promise-based
// `browser.*` namespace via webextension-polyfill.)

chrome.runtime.onInstalled.addListener(() => {
  console.log("bouncer installed — no behaviour yet.");
});

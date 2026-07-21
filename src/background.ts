// bouncer — background service worker.
//
// Most of bouncer's behaviour is declarative and needs nothing here: the three
// network blocks are static declarativeNetRequest rulesets, and on Chrome the
// ".jp language override" ships as a static `content_scripts` entry
// (`"world": "MAIN"`) in the manifest. So on Chrome this file is effectively a
// no-op.
//
// The one piece of real runtime logic is the *Firefox* half of the language
// override. Firefox has no static "world" key for content scripts, so a
// MAIN-world script can only be registered at runtime via the `userScripts`
// API — and that API is gated behind the `userScripts` permission, which
// Firefox only allows as an *optional* (runtime-requested) permission. bouncer
// therefore ships the permission opt-in behind a one-click popup (popup.html);
// once the user grants it, we register the user script here. Until then, sites
// in Firefox behave completely normally — that's expected, not a bug.
//
// The script matches `<all_urls>` (not just `*.jp`): the payload itself decides
// per page whether to actually install the override — always on `.jp`, and on
// other hosts only when the page declares itself Japanese (see lang-override.ts).

const USER_SCRIPT_ID = "jp-lang-override";
const OVERRIDE_MATCHES = ["<all_urls>"];

// Firefox reports "Firefox" in its UA; Chrome does not. We only take the
// userScripts path on Firefox — Chrome's static content script already covers
// the same ground, and Chrome's own userScripts API has a different access
// model we deliberately don't touch here.
function isFirefox(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("Firefox");
}

// Register the MAIN-world language override as a user script. Safe to call
// repeatedly and at any time: it no-ops when the `userScripts` API is
// unavailable (permission not yet granted) or the script is already registered.
async function registerLangOverride(): Promise<void> {
  // `chrome.userScripts` is only defined on Firefox once the optional
  // `userScripts` permission has actually been granted, so treat it as
  // possibly-undefined regardless of what the ambient types claim.
  const userScripts = chrome.userScripts as typeof chrome.userScripts | undefined;
  if (!userScripts) return;

  try {
    const existing = await userScripts.getScripts({ ids: [USER_SCRIPT_ID] });
    if (existing.length > 0) return;

    await userScripts.register([
      {
        id: USER_SCRIPT_ID,
        matches: OVERRIDE_MATCHES,
        js: [{ file: "lang-override.js" }],
        runAt: "document_start",
        world: "MAIN",
        allFrames: true,
      },
    ]);
  } catch (error) {
    console.error("bouncer: failed to register language override", error);
  }
}

if (isFirefox()) {
  // Re-establish the registration whenever the background context spins up:
  // userScripts registrations are not guaranteed to survive a restart/update,
  // and re-registering is cheap and idempotent (guarded by getScripts above).
  chrome.runtime.onStartup.addListener(() => {
    void registerLangOverride();
  });
  chrome.runtime.onInstalled.addListener(() => {
    void registerLangOverride();
  });

  // The popup grants the permission via `permissions.request`; react to that
  // grant here so the feature turns on without the user reloading anything.
  chrome.permissions.onAdded.addListener(() => {
    void registerLangOverride();
  });

  // Also attempt immediately, covering the temporary-add-on reload case where
  // neither lifecycle event fires in the current session but the permission is
  // already granted.
  void registerLangOverride();
}

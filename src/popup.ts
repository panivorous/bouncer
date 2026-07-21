// bouncer — popup (the extension's first-ever UI).
//
// It exists for one reason: on Firefox the ".jp language override" needs the
// `userScripts` permission, which Firefox only allows as an optional permission
// requested at runtime from a user gesture (a click). This popup is that
// gesture — a single button that requests the permission; the background script
// registers the user script once it's granted (see background.ts).
//
// On Chrome the feature ships as a static content script and needs no opt-in,
// so the popup just reports that it's already on.

const REQUIRED_PERMISSIONS: chrome.permissions.Permissions = {
  permissions: ["userScripts"],
  origins: ["*://*.jp/*"],
};

const statusEl = document.getElementById("status") as HTMLParagraphElement;
const enableButton = document.getElementById("enable") as HTMLButtonElement;

function isFirefox(): boolean {
  return navigator.userAgent.includes("Firefox");
}

function showEnabled(): void {
  statusEl.textContent = "Forcing Japanese on .jp sites: on.";
  enableButton.hidden = true;
}

async function refresh(): Promise<void> {
  if (!isFirefox()) {
    // Chrome enables the override via a static content script — no opt-in step.
    statusEl.textContent = "Forcing Japanese on .jp sites: on automatically.";
    enableButton.hidden = true;
    return;
  }

  if (await chrome.permissions.contains(REQUIRED_PERMISSIONS)) {
    showEnabled();
    return;
  }

  statusEl.textContent = "Off. Click below to force Japanese on .jp sites.";
  enableButton.hidden = false;
}

enableButton.addEventListener("click", async () => {
  enableButton.disabled = true;
  try {
    if (await chrome.permissions.request(REQUIRED_PERMISSIONS)) {
      // The background script's permissions.onAdded listener registers the
      // user script; nothing else to do here but reflect the new state.
      showEnabled();
    } else {
      statusEl.textContent = "Permission denied — .jp sites are unchanged.";
    }
  } finally {
    enableButton.disabled = false;
  }
});

void refresh();

export {};

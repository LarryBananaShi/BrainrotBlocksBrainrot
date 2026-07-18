// Rot Blocker — background service worker.

console.log("[Rot Blocker] service worker started.");

const DEFAULT_BLOCKLIST = ["youtube.com", "reddit.com", "twitter.com", "x.com"];
const DEFAULT_PERSONA = "goggins";

// Seed defaults on install so the popup and content script have something to read.
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(["blocklist", "activePersona"]);
  const patch = {};
  if (!current.blocklist) patch.blocklist = DEFAULT_BLOCKLIST;
  if (!current.activePersona) patch.activePersona = DEFAULT_PERSONA;
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  console.log("[Rot Blocker] installed — defaults ensured.");
});

// The overlay's "Fine, take me back" fallback asks us to redirect its tab.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "giveup" && sender.tab) {
    chrome.tabs.update(sender.tab.id, {
      url: chrome.runtime.getURL("blocked.html"),
    });
  }
});

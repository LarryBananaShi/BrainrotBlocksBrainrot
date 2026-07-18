// Rot Blocker — background service worker
// Step 3: overlay handles blocking; background just handles "give up" redirects.

console.log("[Rot Blocker] service worker started.");

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Rot Blocker] installed — service worker is running.");
});

// The overlay's "Fine, take me back" button asks us to redirect its tab.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "giveup" && sender.tab) {
    chrome.tabs.update(sender.tab.id, {
      url: chrome.runtime.getURL("blocked.html"),
    });
  }
});

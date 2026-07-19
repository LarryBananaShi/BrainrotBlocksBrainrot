// Rot Blocker — background service worker.

console.log("[Rot Blocker] service worker started.");

// Where the argue requests go. Swap to your Vercel URL for the demo:
//   const CHAT_ENDPOINT = "https://your-project.vercel.app/api/chat";
const CHAT_ENDPOINT = "http://localhost:3000/api/chat";

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // "Fine, take me back" with nowhere to go back to: close the tab entirely.
  if (message?.type === "closeTab" && sender.tab) {
    chrome.tabs.remove(sender.tab.id);
    return; // synchronous
  }

  // Legacy fallback: redirect the tab to the productive page.
  if (message?.type === "giveup" && sender.tab) {
    chrome.tabs.update(sender.tab.id, {
      url: chrome.runtime.getURL("blocked.html"),
    });
    return; // synchronous
  }

  // Argue turn: relay to the server (keeps CORS + the API key out of the page).
  if (message?.type === "chat") {
    (async () => {
      try {
        const resp = await fetch(CHAT_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            persona: message.persona,
            history: message.history,
            domain: message.domain,
          }),
        });
        if (!resp.ok) {
          const detail = await resp.text();
          sendResponse({ error: `server ${resp.status}`, detail });
          return;
        }
        sendResponse(await resp.json());
      } catch (e) {
        sendResponse({ error: String(e) });
      }
    })();
    return true; // keep the channel open for the async sendResponse
  }
});

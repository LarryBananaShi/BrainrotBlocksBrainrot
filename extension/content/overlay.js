// Rot Blocker — overlay content script
// Step 3: inject a full-screen character overlay on blocked sites.
// (Static single persona for now; chat + full roster come in later steps.)

(function () {
  const OVERLAY_ID = "rot-blocker-overlay";
  if (document.getElementById(OVERLAY_ID)) return; // avoid double-inject

  const persona = {
    name: "David Goggins",
    emoji: "😤",
    line:
      "Where do you think you're going? You really about to throw away your day scrolling? Not on my watch. Talk to me — why should I let you through?",
  };

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `
    <div class="rb-card">
      <div class="rb-avatar">${persona.emoji}</div>
      <div class="rb-name">${persona.name}</div>
      <div class="rb-line">${persona.line}</div>
      <button class="rb-giveup" type="button">Fine, take me back</button>
    </div>
  `;

  function mount() {
    (document.documentElement || document.body).appendChild(overlay);
    overlay.querySelector(".rb-giveup").addEventListener("click", () => {
      // Prefer returning to the page they came from; fall back to the
      // "get back to work" page when there's no history to go back to
      // (e.g. youtube was opened in a fresh tab).
      if (window.history.length > 1) {
        window.history.back();
      } else {
        chrome.runtime.sendMessage({ type: "giveup" });
      }
    });
  }

  if (document.documentElement) {
    mount();
  } else {
    document.addEventListener("DOMContentLoaded", mount);
  }
})();

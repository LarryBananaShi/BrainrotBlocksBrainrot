// Rot Blocker — overlay content script
// Step 5: timed pass per domain.
// On "allow" we store a pass (now + duration) in chrome.storage.local.
// On load, a valid pass skips the overlay and shows a countdown badge instead.

(function () {
  const OVERLAY_ID = "rot-blocker-overlay";
  const TIMER_ID = "rot-blocker-timer";
  if (document.getElementById(OVERLAY_ID) || document.getElementById(TIMER_ID)) {
    return; // avoid double-inject
  }

  // Hardcoded for now; becomes storage-backed in Step 6.
  const BLOCKLIST = ["youtube.com", "reddit.com", "twitter.com", "x.com"];
  const PASS_DURATION_MS = 10 * 1000; // 10 min (lower this to test expiry)

  const persona = {
    name: "David Goggins",
    emoji: "😤",
    opening:
      "Where do you think you're going? You really about to throw away your day scrolling? Talk to me — why should I let you through?",
  };

  const history = [{ role: "assistant", content: persona.opening }];

  // Which blocked domain does the current host belong to? (root key for passes)
  function getBlockedDomain(hostname) {
    return (
      BLOCKLIST.find((d) => hostname === d || hostname.endsWith("." + d)) || null
    );
  }
  const domain = getBlockedDomain(location.hostname);

  // ---- pass storage -------------------------------------------------------
  async function getValidPassExpiry(dom) {
    const { passes = {} } = await chrome.storage.local.get("passes");
    const expiry = passes[dom];
    if (expiry && expiry > Date.now()) return expiry;
    if (expiry) {
      // clean up an expired pass
      delete passes[dom];
      await chrome.storage.local.set({ passes });
    }
    return null;
  }

  async function grantPass(dom) {
    const { passes = {} } = await chrome.storage.local.get("passes");
    passes[dom] = Date.now() + PASS_DURATION_MS;
    await chrome.storage.local.set({ passes });
    return passes[dom];
  }
  // -------------------------------------------------------------------------

  // ---- MOCK backend (unchanged from Step 4) -------------------------------
  function getCharacterResponse(userMessage) {
    const looksLikeWork =
      /\b(work|deadline|research|study|studying|assignment|project|interview|class|exam)\b/i.test(
        userMessage
      );
    const pushbacks = [
      "Weak. That's the same excuse everybody gives. Try harder.",
      "Nah. You don't actually believe that. Give me a real reason.",
      "That's your comfort zone talking. What do you ACTUALLY need in there?",
    ];
    let response;
    if (looksLikeWork) {
      response = {
        reply:
          "Alright. That's a real reason. Get in, do the work, don't waste it. I'm watching you.",
        verdict: "allow",
        reason: "gave a concrete work-related justification",
      };
    } else {
      const turn = history.filter((m) => m.role === "user").length;
      response = {
        reply: pushbacks[Math.min(turn, pushbacks.length - 1)],
        verdict: "continue",
        reason: "excuse not convincing",
      };
    }
    return new Promise((resolve) => setTimeout(() => resolve(response), 400));
  }
  // -------------------------------------------------------------------------

  // ---- countdown badge ----------------------------------------------------
  function showTimer(expiry) {
    if (document.getElementById(TIMER_ID)) return;
    const badge = document.createElement("div");
    badge.id = TIMER_ID;

    const render = () => {
      const ms = expiry - Date.now();
      if (ms <= 0) {
        clearInterval(iv);
        badge.remove();
        location.reload(); // pass expired -> overlay returns on reload
        return;
      }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      badge.textContent = `⏳ ${domain} · ${m}:${String(s).padStart(2, "0")}`;
    };

    (document.body || document.documentElement).appendChild(badge);
    render();
    const iv = setInterval(render, 1000);
  }
  // -------------------------------------------------------------------------

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.innerHTML = `
    <div class="rb-card">
      <div class="rb-header">
        <div class="rb-avatar">${persona.emoji}</div>
        <div class="rb-name">${persona.name}</div>
      </div>
      <div class="rb-messages" id="rb-messages"></div>
      <form class="rb-input-row" id="rb-form">
        <input class="rb-input" id="rb-input" type="text" autocomplete="off"
               placeholder="Make your case..." />
        <button class="rb-send" type="submit">Send</button>
      </form>
      <button class="rb-giveup" type="button">Fine, take me back</button>
    </div>
  `;

  function addMessage(role, text) {
    const el = document.createElement("div");
    el.className = "rb-msg rb-msg-" + role;
    el.textContent = text;
    const list = overlay.querySelector("#rb-messages");
    list.appendChild(el);
    list.scrollTop = list.scrollHeight;
  }

  async function allowThrough() {
    const expiry = await grantPass(domain);
    overlay.remove();
    showTimer(expiry);
  }

  function giveUp() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      chrome.runtime.sendMessage({ type: "giveup" });
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    const input = overlay.querySelector("#rb-input");
    const text = input.value.trim();
    if (!text) return;

    addMessage("user", text);
    history.push({ role: "user", content: text });
    input.value = "";
    input.disabled = true;

    const { reply, verdict } = await getCharacterResponse(text);
    addMessage("bot", reply);
    history.push({ role: "assistant", content: reply });

    if (verdict === "allow") {
      setTimeout(allowThrough, 700); // let them read the parting line
    } else {
      input.disabled = false;
      input.focus();
    }
  }

  function mountOverlay() {
    (document.documentElement || document.body).appendChild(overlay);
    addMessage("bot", persona.opening);
    overlay.querySelector("#rb-form").addEventListener("submit", handleSend);
    overlay.querySelector(".rb-giveup").addEventListener("click", giveUp);
    overlay.querySelector("#rb-input").focus();
  }

  // ---- init: valid pass -> timer only; otherwise -> overlay ---------------
  async function init() {
    if (!domain) return; // safety; content script only runs on blocked domains
    const expiry = await getValidPassExpiry(domain);
    if (expiry) {
      showTimer(expiry);
    } else {
      mountOverlay();
    }
  }

  init();
})();

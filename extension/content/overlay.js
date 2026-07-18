// Rot Blocker — overlay content script
// Step 6: blocklist + active persona come from storage; personas from personas.js.
// Runs on all pages now, so it exits immediately when the host isn't blocked.

(function () {
  const OVERLAY_ID = "rot-blocker-overlay";
  const TIMER_ID = "rot-blocker-timer";
  if (document.getElementById(OVERLAY_ID) || document.getElementById(TIMER_ID)) {
    return; // avoid double-inject
  }

  const PASS_DURATION_MS = 10 * 60 * 1000; // 10 min (lower this to test expiry)

  function getBlockedDomain(hostname, blocklist) {
    return (
      blocklist.find((d) => hostname === d || hostname.endsWith("." + d)) || null
    );
  }

  // ---- pass storage -------------------------------------------------------
  async function getValidPassExpiry(domain) {
    const { passes = {} } = await chrome.storage.local.get("passes");
    const expiry = passes[domain];
    if (expiry && expiry > Date.now()) return expiry;
    if (expiry) {
      delete passes[domain];
      await chrome.storage.local.set({ passes });
    }
    return null;
  }

  async function grantPass(domain) {
    const { passes = {} } = await chrome.storage.local.get("passes");
    passes[domain] = Date.now() + PASS_DURATION_MS;
    await chrome.storage.local.set({ passes });
    return passes[domain];
  }
  // -------------------------------------------------------------------------

  // ---- MOCK backend (persona-aware; swapped for /chat in Step 7) ----------
  function getCharacterResponse(userMessage, persona, history) {
    const looksLikeWork =
      /\b(work|deadline|research|study|studying|assignment|project|interview|class|exam)\b/i.test(
        userMessage
      );
    let response;
    if (looksLikeWork) {
      response = {
        reply: persona.mock.allowLine,
        verdict: "allow",
        reason: "gave a concrete work-related justification",
      };
    } else {
      const turn = history.filter((m) => m.role === "user").length;
      const pushbacks = persona.mock.pushbacks;
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
  function showTimer(expiry, domain) {
    if (document.getElementById(TIMER_ID)) return;
    const badge = document.createElement("div");
    badge.id = TIMER_ID;

    const render = () => {
      const ms = expiry - Date.now();
      if (ms <= 0) {
        clearInterval(iv);
        badge.remove();
        location.reload();
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

  function mountOverlay(persona, domain) {
    const history = [{ role: "assistant", content: persona.opening }];

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
      showTimer(expiry, domain);
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

      const { reply, verdict } = await getCharacterResponse(text, persona, history);
      addMessage("bot", reply);
      history.push({ role: "assistant", content: reply });

      if (verdict === "allow") {
        setTimeout(allowThrough, 700);
      } else {
        input.disabled = false;
        input.focus();
      }
    }

    (document.documentElement || document.body).appendChild(overlay);
    addMessage("bot", persona.opening);
    overlay.querySelector("#rb-form").addEventListener("submit", handleSend);
    overlay.querySelector(".rb-giveup").addEventListener("click", giveUp);
    overlay.querySelector("#rb-input").focus();
  }

  // ---- init ---------------------------------------------------------------
  async function init() {
    const { blocklist = ROT_DEFAULT_BLOCKLIST, activePersona = ROT_DEFAULT_PERSONA } =
      await chrome.storage.local.get(["blocklist", "activePersona"]);

    const domain = getBlockedDomain(location.hostname, blocklist);
    if (!domain) return; // not a blocked site — do nothing

    const persona = ROT_PERSONAS[activePersona] || ROT_PERSONAS[ROT_DEFAULT_PERSONA];

    const expiry = await getValidPassExpiry(domain);
    if (expiry) {
      showTimer(expiry, domain);
    } else {
      mountOverlay(persona, domain);
    }
  }

  init();
})();

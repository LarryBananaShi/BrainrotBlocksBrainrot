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

  // ---- tunable knobs (grows as features land) -----------------------------
  const CONFIG = {
    characterSizePct: 0.38, // sprite height as a fraction of viewport height
  };
  // -------------------------------------------------------------------------

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

  // ---- backend: relay the argue turn through the background worker -------
  // (Background does the fetch so we sidestep page CORS.)
  function getCharacterResponse(userMessage, persona, history) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "chat", persona: persona.id, history },
        (response) => {
          if (chrome.runtime.lastError || !response || response.error) {
            resolve({
              reply:
                "(The gatekeeper isn't responding — is the server running?)",
              verdict: "continue",
              reason: "server error",
            });
            return;
          }
          const verdict = ["allow", "deny", "continue"].includes(response.verdict)
            ? response.verdict
            : "continue";
          resolve({
            reply: response.reply || "...",
            verdict,
            reason: response.reason || "",
          });
        }
      );
    });
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

  // Resolve the idle (mouth-closed / standalone) sprite for a persona.
  function spriteIdleSrc(persona) {
    const s = persona.sprite;
    return chrome.runtime.getURL(s.type === "flip" ? s.image : s.base);
  }

  function mountOverlay(persona, domain) {
    const history = [{ role: "assistant", content: persona.opening }];

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `
      <div class="rb-stage">
        <div class="rb-character" id="rb-character">
          <div class="rb-bubble" id="rb-bubble"></div>
          <img class="rb-sprite" id="rb-sprite" alt="" draggable="false" />
        </div>
      </div>
      <form class="rb-bottom" id="rb-form">
        <div class="rb-input-row">
          <input class="rb-input" id="rb-input" type="text" autocomplete="off"
                 placeholder="Make your case..." />
          <button class="rb-send" type="submit">Send</button>
        </div>
        <button class="rb-giveup" type="button">Fine, take me back</button>
      </form>
    `;

    const sprite = overlay.querySelector("#rb-sprite");
    const bubble = overlay.querySelector("#rb-bubble");
    const characterEl = overlay.querySelector("#rb-character");

    sprite.src = spriteIdleSrc(persona);
    sprite.style.height = CONFIG.characterSizePct * 100 + "vh";

    function setBubble(text) {
      bubble.textContent = text;
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

      history.push({ role: "user", content: text });
      input.value = "";
      input.disabled = true;

      const { reply, verdict } = await getCharacterResponse(text, persona, history);
      setBubble(reply);
      history.push({ role: "assistant", content: reply });

      if (verdict === "allow") {
        setTimeout(allowThrough, 700);
      } else {
        input.disabled = false;
        input.focus();
      }
    }

    (document.documentElement || document.body).appendChild(overlay);
    setBubble(persona.opening);
    overlay.querySelector("#rb-form").addEventListener("submit", handleSend);
    overlay.querySelector(".rb-giveup").addEventListener("click", giveUp);
    void characterEl; // reserved for crawl-in animation (Step 3)
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

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
    characterSizePct: 0.55, // sprite height as a fraction of viewport height
    crawlInDurationMs: 4000, // how long the creep-in takes
    centerNoise: 0.05, // rest offset from center, as a fraction of min(vw, vh)
    bobFrequencyHz: 3, // walking bob speed (bounces per second) while moving
    bobAmplitudePx: 16, // how far the sprite bobs up/down while walking
    introShake: { intensity: 82, durationMs: 1050, intervalMs: 40, scaleBuffer: 1.12 }, // big shake on entrance
    talkSwitchRange: { minMs: 90, maxMs: 200 }, // base<->talk swap while speaking
    tungFlipRange: { minMs: 400, maxMs: 900 }, // horizontal flip cadence for Tung
    messageShake: { intensity: 22, durationMs: 350, intervalMs: 40, scaleBuffer: 1.03 }, // smaller shake per reply
    spriteNudge: { intensity: 8, durationMs: 300 }, // little bump on the sprite per reply
  };
  // -------------------------------------------------------------------------

  // Pick a random off-screen start point and a slightly-off-center rest point.
  // Offsets are relative to the viewport center (the element's CSS anchor).
  function computeEntryPosition(vw, vh, centerNoise) {
    const restAngle = Math.random() * Math.PI * 2;
    const restMag = centerNoise * Math.min(vw, vh) * Math.random();
    const restX = Math.cos(restAngle) * restMag;
    const restY = Math.sin(restAngle) * restMag;

    const startAngle = Math.random() * Math.PI * 2;
    const startDist = Math.hypot(vw, vh) * 0.75; // well outside the viewport
    const startX = Math.cos(startAngle) * startDist;
    const startY = Math.sin(startAngle) * startDist;

    return { startX, startY, restX, restY };
  }

  // Random value within a {minMs, maxMs} range.
  function randInRange(r) {
    return r.minMs + Math.random() * (r.maxMs - r.minMs);
  }

  // Jitter an element on a fixed, uniform cadence (`intervalMs`) with decaying
  // intensity, then clear the transform.
  // `scaleBuffer` > 1 slightly enlarges the target so translating it never
  // exposes gaps at the viewport edges (used when shaking the full overlay).
  function shake(target, intensity, durationMs, scaleBuffer = 1, intervalMs = 40) {
    const start = performance.now();
    const scalePart = scaleBuffer !== 1 ? ` scale(${scaleBuffer})` : "";
    // Apply the scale once up front so the first step is just a translate
    // (avoids a compositing hitch on the opening frame).
    target.style.transform = `translate(0px, 0px)${scalePart}`;
    const iv = setInterval(() => {
      const elapsed = performance.now() - start;
      if (elapsed >= durationMs) {
        clearInterval(iv);
        target.style.transform = "";
        return;
      }
      const decay = 1 - elapsed / durationMs; // ease the shake out over its life
      const dx = (Math.random() * 2 - 1) * intensity * decay;
      const dy = (Math.random() * 2 - 1) * intensity * decay;
      target.style.transform = `translate(${dx}px, ${dy}px)${scalePart}`;
    }, intervalMs);
  }

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

    // ---- sprite animation: mouth-flap (swap) or horizontal flip (Tung) ------
    const spriteDesc = persona.sprite;
    let talkTimer = null;
    let talkStopTimer = null;
    let talkFrame = false;
    let flipped = false;

    function startTalking() {
      if (talkTimer) clearTimeout(talkTimer);
      const loop = () => {
        if (spriteDesc.type === "swap") {
          talkFrame = !talkFrame;
          sprite.src = chrome.runtime.getURL(
            talkFrame ? spriteDesc.talk : spriteDesc.base
          );
          talkTimer = setTimeout(loop, randInRange(CONFIG.talkSwitchRange));
        } else {
          flipped = !flipped;
          sprite.style.transform = flipped ? "scaleX(-1)" : "scaleX(1)";
          talkTimer = setTimeout(loop, randInRange(CONFIG.tungFlipRange));
        }
      };
      loop();
    }

    function stopTalking() {
      if (talkTimer) {
        clearTimeout(talkTimer);
        talkTimer = null;
      }
      if (talkStopTimer) {
        clearTimeout(talkStopTimer);
        talkStopTimer = null;
      }
      if (spriteDesc.type === "swap") {
        sprite.src = chrome.runtime.getURL(spriteDesc.base); // back to idle
      }
    }

    // Show a line and animate the character for a length-based duration.
    function speak(text) {
      bubble.classList.remove("rb-bubble--thinking");
      setBubble(text);
      if (talkStopTimer) clearTimeout(talkStopTimer);
      startTalking();
      const dur = Math.min(6000, Math.max(1500, text.length * 55));
      talkStopTimer = setTimeout(stopTalking, dur);
    }

    // While waiting on the server: character goes idle and the bubble shows "…".
    function showThinking() {
      stopTalking();
      setBubble("…");
      bubble.classList.add("rb-bubble--thinking");
    }

    // The user's submitted line floats up from the input and fades out.
    function spawnUserBubble(text) {
      const b = document.createElement("div");
      b.className = "rb-user-bubble";
      b.textContent = text;
      overlay.appendChild(b);
      b.addEventListener("animationend", () => b.remove(), { once: true });
    }

    // A small jitter on the character itself (kept relative to its rest spot).
    function nudgeCharacter(intensity, durationMs) {
      const start = performance.now();
      const iv = setInterval(() => {
        const elapsed = performance.now() - start;
        if (elapsed >= durationMs) {
          clearInterval(iv);
          characterEl.style.transform = restTransform;
          return;
        }
        const decay = 1 - elapsed / durationMs;
        const dx = (Math.random() * 2 - 1) * intensity * decay;
        const dy = (Math.random() * 2 - 1) * intensity * decay;
        characterEl.style.transform = `${restTransform} translate(${dx}px, ${dy}px)`;
      }, 30);
    }
    // -------------------------------------------------------------------------

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

      spawnUserBubble(text);
      history.push({ role: "user", content: text });
      input.value = "";
      input.disabled = true;
      showThinking();

      const { reply, verdict } = await getCharacterResponse(text, persona, history);
      speak(reply);
      shake(
        overlay,
        CONFIG.messageShake.intensity,
        CONFIG.messageShake.durationMs,
        CONFIG.messageShake.scaleBuffer,
        CONFIG.messageShake.intervalMs
      );
      nudgeCharacter(CONFIG.spriteNudge.intensity, CONFIG.spriteNudge.durationMs);
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

    // ---- crawl-in: start off-screen, glide to a slightly-off-center rest ----
    const form = overlay.querySelector("#rb-form");
    const pos = computeEntryPosition(
      window.innerWidth,
      window.innerHeight,
      CONFIG.centerNoise
    );
    const restTransform =
      `translate(-50%, -50%) translate(${pos.restX}px, ${pos.restY}px)`;

    bubble.style.opacity = "0";
    form.style.opacity = "0";
    characterEl.style.transition = "none";
    characterEl.style.transform =
      `translate(-50%, -50%) translate(${pos.startX}px, ${pos.startY}px)`;

    // Walking bob: oscillate the sprite vertically while it moves.
    sprite.style.setProperty("--rb-bob-amp", CONFIG.bobAmplitudePx + "px");
    sprite.style.animation =
      `rb-bob ${1000 / CONFIG.bobFrequencyHz}ms linear infinite`;

    // Two rAFs so the browser commits the start transform before we transition.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        characterEl.style.transition =
          `transform ${CONFIG.crawlInDurationMs}ms linear`;
        characterEl.style.transform = restTransform;
      });
    });

    // Fire once when the walk finishes: stop the bob and reveal the UI.
    let arrived = false;
    function onArrival() {
      if (arrived) return;
      arrived = true;
      sprite.style.animation = "none"; // stop walking bob on arrival
      characterEl.style.transition = "none"; // nudges should be instant, not glide
      bubble.style.opacity = "1";
      form.style.opacity = "1";
      overlay.querySelector("#rb-input").focus();
      shake(overlay, CONFIG.introShake.intensity, CONFIG.introShake.durationMs, CONFIG.introShake.scaleBuffer, CONFIG.introShake.intervalMs);
      speak(persona.opening); // "WHAT ARE YOU DOING" — with mouth flap / flip
    }
    characterEl.addEventListener("transitionend", onArrival, { once: true });
    // Fallback in case transitionend doesn't fire (e.g. tab backgrounded).
    setTimeout(onArrival, CONFIG.crawlInDurationMs + 100);
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

// Rot Blocker — overlay content script
// Step 4: argue chat UI with MOCKED responses.
// getCharacterResponse() is shaped like the future /chat call
// ({ reply, verdict, reason }) so it can be swapped for a real fetch later.

(function () {
  const OVERLAY_ID = "rot-blocker-overlay";
  if (document.getElementById(OVERLAY_ID)) return; // avoid double-inject

  const persona = {
    name: "David Goggins",
    emoji: "😤",
    opening:
      "Where do you think you're going? You really about to throw away your day scrolling? Talk to me — why should I let you through?",
  };

  // Conversation history (roles mirror what the LLM API will expect later).
  const history = [{ role: "assistant", content: persona.opening }];

  // ---- MOCK backend -------------------------------------------------------
  // Deterministic so both paths are testable: a message that sounds like real
  // work earns an "allow"; anything else gets pushback ("continue").
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

    // Simulate network latency so the UI flow matches the real thing.
    return new Promise((resolve) => setTimeout(() => resolve(response), 400));
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

  function allowThrough() {
    // Remove the overlay so the real page is usable.
    // (Timed pass so it doesn't re-trigger on reload comes in Step 5.)
    overlay.remove();
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

  function mount() {
    (document.documentElement || document.body).appendChild(overlay);
    addMessage("bot", persona.opening);
    overlay.querySelector("#rb-form").addEventListener("submit", handleSend);
    overlay.querySelector(".rb-giveup").addEventListener("click", giveUp);
    overlay.querySelector("#rb-input").focus();
  }

  if (document.documentElement) {
    mount();
  } else {
    document.addEventListener("DOMContentLoaded", mount);
  }
})();

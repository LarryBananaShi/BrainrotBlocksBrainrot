// Rot Blocker — popup logic.

function normalizeDomain(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

// Persona avatar art, bundled under extension/assets/ (popup-relative paths).
const PERSONA_IMG = {
  goggins: "../assets/GOGGINS_BASE.png",
  obama: "../assets/OBAMA_BASE.png",
  tungtung: "../assets/TUNG.png",
};

// Rallying quote shown under each persona's name.
const PERSONA_QUOTE = {
  obama: "Electing me means no more time lost to distractions!",
  tungtung: "Triple T will make you distraction FREE",
  goggins: "Staying off reels is hard but I'm HARDER!",
};

// ---- persona carousel -----------------------------------------------------
// A "wheel" of stacked cards: the active persona sits front-and-center with the
// others peeking behind. Cards persist across renders so CSS transitions give a
// smooth clockwise rotation. Selecting still just writes activePersona.
const personaOrder = Object.values(ROT_PERSONAS);
let activeIndex = 0;
let personaCards = [];

function buildCarousel() {
  const stack = document.getElementById("persona-stack");
  stack.innerHTML = "";
  personaCards = personaOrder.map((p, i) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    card.title = p.name;
    const img = document.createElement("img");
    img.src = PERSONA_IMG[p.id] || "";
    img.alt = p.name;
    card.appendChild(img);
    card.addEventListener("click", () => selectPersona(i));
    stack.appendChild(card);
    return card;
  });
}

function renderCarousel() {
  const n = personaOrder.length;
  personaCards.forEach((card, i) => {
    const offset = (i - activeIndex + n) % n;
    card.className = "card pos-" + offset;
  });
  const active = personaOrder[activeIndex];
  document.getElementById("persona-name").textContent = active ? active.name : "—";
  document.getElementById("persona-quote").textContent = active
    ? PERSONA_QUOTE[active.id] || ""
    : "";
  // Theme the popup background/shapes to the selected persona.
  if (active) document.body.dataset.persona = active.id;
}

async function selectPersona(index) {
  const n = personaOrder.length;
  activeIndex = ((index % n) + n) % n;
  renderCarousel();
  const active = personaOrder[activeIndex];
  if (active) await chrome.storage.local.set({ activePersona: active.id });
}

// ---- blocklist ------------------------------------------------------------
function faviconUrl(domain) {
  return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`;
}

function renderBlocklist(blocklist) {
  const ul = document.getElementById("blocklist");
  ul.innerHTML = "";
  if (!blocklist.length) {
    ul.innerHTML = '<li class="empty">no sites blocked</li>';
    return;
  }
  blocklist.forEach((domain) => {
    const li = document.createElement("li");
    li.className = "site";

    const name = document.createElement("span");
    name.className = "site-name";
    name.textContent = domain;

    const right = document.createElement("span");
    right.className = "site-right";

    const remove = document.createElement("button");
    remove.className = "remove";
    remove.type = "button";
    remove.textContent = "✕";
    remove.title = "Remove";
    remove.addEventListener("click", async () => {
      const next = blocklist.filter((d) => d !== domain);
      await chrome.storage.local.set({ blocklist: next });
      renderBlocklist(next);
    });

    const favicon = document.createElement("img");
    favicon.className = "favicon";
    favicon.src = faviconUrl(domain);
    favicon.alt = "";
    favicon.addEventListener("error", () => {
      favicon.style.display = "none";
    });

    right.appendChild(remove);
    right.appendChild(favicon);
    li.appendChild(name);
    li.appendChild(right);
    ul.appendChild(li);
  });
}

// ---- active passes (live) -------------------------------------------------
function renderPasses(passes) {
  const ul = document.getElementById("passes");
  ul.innerHTML = "";
  const now = Date.now();
  const active = Object.entries(passes || {}).filter(([, exp]) => exp > now);
  if (!active.length) {
    ul.innerHTML = '<li class="empty">none</li>';
    return;
  }
  active.forEach(([domain, exp]) => {
    const ms = exp - now;
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);

    const li = document.createElement("li");

    const label = document.createElement("span");
    label.className = "pass-name";
    label.textContent = domain;

    const right = document.createElement("span");
    right.className = "pass-right";

    const time = document.createElement("span");
    time.className = "time";
    time.textContent = `${m}:${String(s).padStart(2, "0")}`;

    const remove = document.createElement("button");
    remove.className = "remove";
    remove.type = "button";
    remove.textContent = "✕";
    remove.title = "End this pass";
    remove.addEventListener("click", async () => {
      const { passes = {} } = await chrome.storage.local.get("passes");
      delete passes[domain];
      await chrome.storage.local.set({ passes });
      renderPasses(passes);
    });

    right.appendChild(time);
    right.appendChild(remove);
    li.appendChild(label);
    li.appendChild(right);
    ul.appendChild(li);
  });
}

// ---- init -----------------------------------------------------------------
async function init() {
  const {
    activePersona = ROT_DEFAULT_PERSONA,
    blocklist = ROT_DEFAULT_BLOCKLIST,
    passes = {},
  } = await chrome.storage.local.get(["activePersona", "blocklist", "passes"]);

  buildCarousel();
  const startIndex = personaOrder.findIndex((p) => p.id === activePersona);
  activeIndex = startIndex >= 0 ? startIndex : 0;
  renderCarousel();

  document
    .getElementById("persona-next")
    .addEventListener("click", () => selectPersona(activeIndex + 1));
  document
    .getElementById("persona-prev")
    .addEventListener("click", () => selectPersona(activeIndex - 1));

  renderBlocklist(blocklist);
  renderPasses(passes);

  document.getElementById("add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("add-input");
    const domain = normalizeDomain(input.value);
    input.value = "";
    if (!domain) return;
    const { blocklist = [] } = await chrome.storage.local.get("blocklist");
    if (!blocklist.includes(domain)) {
      blocklist.push(domain);
      await chrome.storage.local.set({ blocklist });
      renderBlocklist(blocklist);
    }
  });

  setupPageAnimations();

  // Keep the pass timers ticking while the popup is open.
  setInterval(async () => {
    const { passes = {} } = await chrome.storage.local.get("passes");
    renderPasses(passes);
  }, 1000);
}

// ---- full-window page slide animation -------------------------------------
function setupPageAnimations() {
  const pages = document.getElementById("pages");
  const sections = Array.from(document.querySelectorAll(".page"));

  // First page visible immediately.
  sections[0]?.classList.add("is-active");

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle("is-active", entry.intersectionRatio >= 0.55);
      });
    },
    { root: pages, threshold: [0, 0.55, 1] }
  );

  sections.forEach((section) => observer.observe(section));
}

init();

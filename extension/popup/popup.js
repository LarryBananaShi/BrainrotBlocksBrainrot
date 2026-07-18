// Rot Blocker — popup logic.

function normalizeDomain(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

// ---- persona picker -------------------------------------------------------
function renderPersonas(active) {
  const list = document.getElementById("persona-list");
  list.innerHTML = "";
  Object.values(ROT_PERSONAS).forEach((p) => {
    const btn = document.createElement("button");
    btn.className = "persona" + (p.id === active ? " active" : "");
    btn.innerHTML = `<span class="emoji">${p.emoji}</span><span class="pname">${p.name}</span>`;
    btn.addEventListener("click", async () => {
      await chrome.storage.local.set({ activePersona: p.id });
      renderPersonas(p.id);
    });
    list.appendChild(btn);
  });
}

// ---- blocklist ------------------------------------------------------------
function renderBlocklist(blocklist) {
  const ul = document.getElementById("blocklist");
  ul.innerHTML = "";
  if (!blocklist.length) {
    ul.innerHTML = '<li class="empty">No sites blocked</li>';
    return;
  }
  blocklist.forEach((domain) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = domain;
    const remove = document.createElement("button");
    remove.className = "remove";
    remove.textContent = "✕";
    remove.title = "Remove";
    remove.addEventListener("click", async () => {
      const next = blocklist.filter((d) => d !== domain);
      await chrome.storage.local.set({ blocklist: next });
      renderBlocklist(next);
    });
    li.appendChild(label);
    li.appendChild(remove);
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
    ul.innerHTML = '<li class="empty">None</li>';
    return;
  }
  active.forEach(([domain, exp]) => {
    const ms = exp - now;
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = domain;
    const time = document.createElement("span");
    time.className = "time";
    time.textContent = `${m}:${String(s).padStart(2, "0")}`;
    li.appendChild(label);
    li.appendChild(time);
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

  renderPersonas(activePersona);
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

  // Keep the pass timers ticking while the popup is open.
  setInterval(async () => {
    const { passes = {} } = await chrome.storage.local.get("passes");
    renderPasses(passes);
  }, 1000);
}

init();

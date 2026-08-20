const CATEGORY_LABELS = {
  aaa: "AAA / Major Studio",
  indie: "Indie / Small Studio",
  design: "Game Design",
  "game-tech": "Game-Tech / XR / Tools",
  "first-year": "First-Year Program",
  "general-swe": "General SWE",
  research: "Research / REU",
};

const GAME_CATEGORIES = new Set(["aaa", "indie", "design"]);

const state = {
  all: [],
  category: "all",
  gameOnly: true,
  openOnly: false,
  query: "",
};

async function init() {
  const res = await fetch("data/internships.json", { cache: "no-store" });
  const data = await res.json();
  state.all = data.internships;

  document.getElementById("updated-at").textContent =
    "Last checked: " + new Date(data.updatedAt).toLocaleString();
  document.getElementById("total-count").textContent =
    data.internships.length + " tracked";

  renderCategoryFilters();
  attachControls();
  render();
}

function renderCategoryFilters() {
  const el = document.getElementById("category-filters");
  const cats = ["all", ...Object.keys(CATEGORY_LABELS)];
  el.innerHTML = cats
    .map((c) => {
      const label = c === "all" ? "All" : CATEGORY_LABELS[c];
      return `<button class="chip${c === "all" ? " active" : ""}" data-cat="${c}">${label}</button>`;
    })
    .join("");
  el.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.category = btn.dataset.cat;
      el.querySelectorAll(".chip").forEach((b) => b.classList.toggle("active", b === btn));
      render();
    });
  });
}

function attachControls() {
  document.getElementById("search").addEventListener("input", (e) => {
    state.query = e.target.value.trim().toLowerCase();
    render();
  });
  document.getElementById("game-only").addEventListener("change", (e) => {
    state.gameOnly = e.target.checked;
    render();
  });
  document.getElementById("open-only").addEventListener("change", (e) => {
    state.openOnly = e.target.checked;
    render();
  });
}

function matches(item) {
  if (state.category !== "all" && item.category !== state.category) return false;
  if (state.gameOnly && state.category === "all" && !GAME_CATEGORIES.has(item.category)) return false;
  if (state.openOnly && item.trackingStatus !== "open") return false;
  if (state.query) {
    const haystack = [item.program, item.company, item.focus, item.fit]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(state.query)) return false;
  }
  return true;
}

function render() {
  const list = state.all
    .filter(matches)
    .sort((a, b) => {
      if (a.trackingStatus !== b.trackingStatus) return a.trackingStatus === "open" ? -1 : 1;
      return a.program.localeCompare(b.program);
    });

  const cardsEl = document.getElementById("cards");
  const emptyEl = document.getElementById("empty-state");

  if (list.length === 0) {
    cardsEl.innerHTML = "";
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  cardsEl.innerHTML = list.map(renderCard).join("");
}

function renderCard(item) {
  const isOpen = item.trackingStatus === "open";
  const links = (item.links || [])
    .slice(0, 3)
    .map((url, i) => `<a href="${url}" target="_blank" rel="noopener">${i === 0 ? "Apply / Info" : "Link " + (i + 1)}</a>`)
    .join("");

  const details = [
    item.focus && `<p><span class="field-label">Focus:</span> ${escapeHtml(item.focus)}</p>`,
    item.eligibility && `<p><span class="field-label">Eligibility:</span> ${escapeHtml(item.eligibility)}</p>`,
    item.postingWindow && `<p><span class="field-label">Posting window:</span> ${escapeHtml(item.postingWindow)}</p>`,
    item.statusNote && `<p><span class="field-label">Status:</span> ${escapeHtml(item.statusNote)}</p>`,
    item.fit && `<p><span class="field-label">Fit:</span> ${escapeHtml(item.fit)}</p>`,
  ]
    .filter(Boolean)
    .join("");

  const lastChecked = item.lastChecked
    ? "Checked " + new Date(item.lastChecked).toLocaleDateString()
    : "Not yet checked";

  return `
    <div class="card">
      <div class="card-top">
        <div>
          <div class="tag">${escapeHtml(CATEGORY_LABELS[item.category] || item.category)}</div>
          <h3>${escapeHtml(item.program)}</h3>
        </div>
        <span class="badge ${isOpen ? "open" : "watching"}">${isOpen ? "Open" : "Watching"}</span>
      </div>
      ${details}
      <div class="card-links">${links}</div>
      <div class="card-footer">${item.target || ""} · ${lastChecked}</div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

init();

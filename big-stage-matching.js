(() => {
  const root = document.getElementById("big-stage-app");
  if (!root) return;

  const matches = [
    {
      label: "Same teacher",
      teacher: "Miss Lexi",
      classes: [
        ["Ballet & Tap · Pre-K", "Primrose School of Wylie", 7],
        ["Ballet & Tap · Preschool", "Primrose School of North", 5]
      ]
    },
    {
      label: "Two teachers",
      teacher: "Miss Liv + Miss Megan",
      classes: [
        ["Ballet · Preschool", "Wylie Montessori Academy · Sachse", 6],
        ["Ballet · Pre-K", "Primrose School of Rowlett", 6]
      ]
    }
  ];

  const escapeText = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[character]));

  const toggle = (active) => {
    const nav = document.createElement("div");
    nav.className = "big-stage-view-toggle";
    nav.setAttribute("role", "tablist");
    nav.setAttribute("aria-label", "Big Stage views");
    nav.innerHTML = `
      <button type="button" role="tab" aria-selected="${active === "shows"}" data-stage-view="shows">Shows</button>
      <button type="button" role="tab" aria-selected="${active === "matching"}" data-stage-view="matching">Matching Classes</button>`;
    return nav;
  };

  const renderMatching = () => {
    root.dataset.stageView = "matching";
    root.innerHTML = `
      <div class="big-stage-shell big-stage-matching-view">
        <div class="big-stage-toolbar">
          <div><h4>Matching Classes</h4><p>Classes that could work together as one recital performance.</p></div>
          <button class="primary" type="button" data-stage-new>+ Add Show</button>
        </div>
        <div class="big-stage-matching-grid">
          ${matches.map((match) => {
            const total = match.classes.reduce((sum, item) => sum + item[2], 0);
            return `<article class="big-stage-match-card">
              <header><span class="big-stage-pill">${escapeText(match.label)}</span><h4>${escapeText(match.teacher)}</h4><strong>${total} dancers total</strong></header>
              <div class="big-stage-match-classes">${match.classes.map(([name, school, dancers]) => `
                <div><strong>${escapeText(name)}</strong><span>${escapeText(school)}</span><small>${dancers} dancers</small></div>`).join("")}</div>
              <button class="secondary" type="button" data-stage-new>Plan in a Show</button>
            </article>`;
          }).join("")}
        </div>
      </div>`;
    root.querySelector(".big-stage-shell")?.prepend(toggle("matching"));
  };

  const removePreviewShows = () => {
    const grid = root.querySelector(".big-stage-show-grid");
    if (!grid) return;
    grid.querySelectorAll("[data-stage-show]").forEach((card) => card.remove());
    let empty = grid.querySelector(".big-stage-empty-shows");
    const hasPlannedShows = Boolean(grid.querySelector("[data-planned-show]"));
    if (hasPlannedShows) {
      empty?.remove();
      return;
    }
    if (!empty) {
      empty = document.createElement("div");
      empty.className = "big-stage-empty-shows";
      empty.innerHTML = "<strong>No shows planned yet.</strong><span>Choose + Add Show to begin with the show-planning wizard.</span>";
      grid.appendChild(empty);
    }
  };

  const addToggle = () => {
    if (root.dataset.stageView === "matching") return;
    removePreviewShows();
    if (root.querySelector(".big-stage-view-toggle")) return;
    const shell = root.querySelector(":scope > .big-stage-shell");
    if (shell) shell.prepend(toggle("shows"));
  };

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-stage-view]");
    if (!button) return;
    if (button.dataset.stageView === "matching") renderMatching();
    else {
      root.dataset.stageView = "shows";
      window.renderBigStage?.();
      addToggle();
    }
  });

  new MutationObserver(addToggle).observe(root, { childList: true, subtree: true });
  addToggle();
})();

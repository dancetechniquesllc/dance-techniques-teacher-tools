(() => {
  const root = document.getElementById("big-stage-app");
  if (!root) return;

  const escapeText = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[character]));

  const liveClasses = () => {
    if (typeof window.getBigStageRosterClasses !== "function") return [];
    return window.getBigStageRosterClasses().filter((classInfo) => (
      classInfo?.id && classInfo?.teacherId && Number(classInfo?.enrolledCount) > 0
    ));
  };

  const classSignature = (classInfo) => String(classInfo?.name || "")
    .toLowerCase()
    .replace(/\bpre[\s-]?k\b/g, "preschool")
    .replace(/\b(?:all students|all dancers)\b/g, "all")
    .replace(/\bages?\b/g, "")
    .replace(/\b(beginner|beginners|class|dance|level)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const schoolSignature = (classInfo) => String(classInfo?.schoolName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const buildMatches = () => {
    const classes = liveClasses();
    const suggestions = [];

    // A recital combination is a pair of compatible classes from different schools.
    // Keeping suggestions as pairs prevents one teacher's entire schedule from being
    // collapsed into a single performance and makes each proposed combination clear.
    classes.forEach((firstClass, firstIndex) => {
      classes.slice(firstIndex + 1).forEach((secondClass) => {
        if (!schoolSignature(firstClass) || schoolSignature(firstClass) === schoolSignature(secondClass)) return;
        if (!classSignature(firstClass) || classSignature(firstClass) !== classSignature(secondClass)) return;
        const sameTeacher = String(firstClass.teacherId) === String(secondClass.teacherId);
        suggestions.push({
          label: sameTeacher ? "Same teacher" : "Two teachers",
          teacher: sameTeacher
            ? (firstClass.teacherName || "Assigned teacher")
            : [...new Set([firstClass.teacherName, secondClass.teacherName].filter(Boolean))].join(" + "),
          classes: [firstClass, secondClass]
        });
      });
    });

    return suggestions.sort((left, right) => (
      left.label.localeCompare(right.label)
      || left.teacher.localeCompare(right.teacher)
      || String(left.classes[0]?.name || "").localeCompare(String(right.classes[0]?.name || ""), undefined, { numeric: true })
    ));
  };

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
    const matches = buildMatches();
    root.dataset.stageView = "matching";
    root.innerHTML = `
      <div class="big-stage-shell big-stage-matching-view">
        <div class="big-stage-toolbar">
          <div><h4>Matching Classes</h4><p>Classes that could work together as one recital performance.</p></div>
          <button class="primary" type="button" data-stage-new>+ Add Show</button>
        </div>
        <div class="big-stage-matching-grid">
          ${matches.length ? matches.map((match) => {
            const total = match.classes.reduce((sum, item) => sum + Number(item.enrolledCount || 0), 0);
            return `<article class="big-stage-match-card">
              <header><span class="big-stage-pill">${escapeText(match.label)}</span><h4>${escapeText(match.teacher)}</h4><strong>${total} dancers total</strong></header>
              <div class="big-stage-match-classes">${match.classes.map((classInfo) => `
                <div><strong>${escapeText(classInfo.name)}</strong><span>${escapeText(classInfo.schoolName)}</span><small>${Number(classInfo.enrolledCount || 0)} dancers</small></div>`).join("")}</div>
              <button class="secondary" type="button" data-stage-new>Combine Classes</button>
            </article>`;
          }).join("") : `<div class="big-stage-empty-shows"><strong>No matching classes yet.</strong><span>Suggestions appear for compatible live classes at different schools.</span></div>`}
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

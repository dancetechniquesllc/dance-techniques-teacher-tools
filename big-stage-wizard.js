(() => {
  const root = document.getElementById("big-stage-app");
  if (!root) return;

  const STORAGE_KEY = "dt-big-stage-planned-shows:v1";
  const RECITAL_DATE_KEY = "dt-big-stage-recital-date:v1";
  const liveSchools = () => {
    const classes = typeof window.getBigStageRosterClasses === "function" ? window.getBigStageRosterClasses() : [];
    const grouped = new Map();
    classes.forEach((rosterClass) => {
      const schoolName = rosterClass.schoolName || "Partner School";
      if (!grouped.has(schoolName)) grouped.set(schoolName, []);
      grouped.get(schoolName).push({ id: rosterClass.id, name: rosterClass.name, enrolledCount: rosterClass.enrolledCount || 0 });
    });
    return [...grouped].map(([name, schoolClasses]) => ({ name, classes: schoolClasses }));
  };
  const sampleAssignments = new Map([
    ["Primrose School of Wylie|Ballet & Tap · Pre-K", "9:00 AM"],
    ["Wylie Montessori Academy · Sachse|Ballet · Preschool", "9:00 AM"],
    ["Primrose School of Rowlett|Hip Hop · School Age", "9:00 AM"],
    ["Kids 'R' Kids Learning Academy|Ballet & Tap · Preschool", "11:30 AM"]
  ]);
  const combinedClasses = new Set([
    "Primrose School of Wylie|Ballet & Tap · Pre-K",
    "Primrose School of Wylie|Ballet & Tap · Preschool"
  ]);
  let state = null;
  const isTestMode = new URLSearchParams(window.location.search).has("show-wizard-test");

  const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
  const readShows = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } };
  const saveShows = (shows) => localStorage.setItem(STORAGE_KEY, JSON.stringify(shows));
  const nextName = () => `Show ${String.fromCharCode(65 + readShows().length)}`;
  const defaultDate = () => localStorage.getItem(RECITAL_DATE_KEY) || "2027-05-22";
  const selectionKey = (school, className) => `${school}|${className}`;
  const selectedClasses = () => Object.entries(state.selections).flatMap(([school, selection]) => {
    const available = liveSchools().find((item) => item.name === school)?.classes || [];
    const selected = selection.whole ? available : available.filter((item) => selection.classes.has(item.id));
    return selected.map((item) => ({ school, classId: item.id, className: item.name }));
  });
  const close = () => document.getElementById("big-stage-show-wizard")?.remove();

  function openWizard() {
    close();
    state = { step: 1, name: nextName(), date: defaultDate(), time: "", selections: {}, conflictOverrides: new Set(), combinedChoices: {}, transfer: { song: true, costume: true, props: true, positions: true } };
    const overlay = document.createElement("div");
    overlay.id = "big-stage-show-wizard";
    overlay.className = "big-stage-wizard-overlay";
    overlay.innerHTML = `<section class="big-stage-wizard" role="dialog" aria-modal="true" aria-label="Plan a show"><button class="big-stage-wizard-close" type="button" aria-label="Close show planner">×</button><div data-wizard-content></div></section>`;
    document.body.appendChild(overlay);
    overlay.querySelector(".big-stage-wizard-close").addEventListener("click", close);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    render();
  }

  const shell = (title, copy, body, back = true, nextLabel = "Continue") => `
    <header class="big-stage-wizard-head"><span class="big-stage-wizard-kicker">Plan ${safe(state.name)}</span><h2>${title}</h2><p>${copy}</p></header>
    <div class="big-stage-wizard-steps" aria-label="Step ${state.step} of 5">${[1,2,3,4,5].map((step) => `<span class="${step === state.step ? "active" : step < state.step ? "done" : ""}">${step}</span>`).join("")}</div>
    <div class="big-stage-wizard-body">${body}</div>
    <footer class="big-stage-wizard-actions">${back ? '<button class="secondary" type="button" data-wizard-back>Back</button>' : '<span></span>'}<button class="primary" type="button" data-wizard-next>${nextLabel}</button></footer>`;

  function render() {
    const content = document.querySelector("#big-stage-show-wizard [data-wizard-content]");
    if (!content) return;
    if (state.step === 1) renderBasics(content);
    if (state.step === 2) renderSchools(content);
    if (state.step === 3) renderConflicts(content);
    if (state.step === 4) renderCombined(content);
    if (state.step === 5) renderReview(content);
    content.querySelector("[data-wizard-back]")?.addEventListener("click", () => { state.step -= 1; render(); });
  }

  function renderBasics(content) {
    content.innerHTML = shell("Start the show", "Begin with a letter name. You can add the exact show time closer to recital day.", `
      <div class="big-stage-wizard-grid">
        <label>Show name<input data-wizard-name value="${safe(state.name)}" placeholder="Show A"></label>
        <label>Recital date<input data-wizard-date type="date" value="${safe(state.date)}"></label>
        <label class="wide">Show time <span class="optional">Optional for now</span><input data-wizard-time type="time" value="${safe(state.time)}"></label>
      </div>
      <div class="big-stage-wizard-note"><strong>One recital date for every show.</strong> Changing this date updates the recital date used when planning the next show.</div>
    `, false);
    content.querySelector("[data-wizard-next]").addEventListener("click", () => {
      state.name = content.querySelector("[data-wizard-name]").value.trim() || nextName();
      state.date = content.querySelector("[data-wizard-date]").value;
      state.time = content.querySelector("[data-wizard-time]").value;
      if (!state.date) return content.querySelector("[data-wizard-date]").focus();
      localStorage.setItem(RECITAL_DATE_KEY, state.date);
      const existingShows = readShows();
      if (existingShows.length) saveShows(existingShows.map((show) => ({ ...show, date: state.date })));
      state.step = 2; render();
    });
  }

  function renderSchools(content) {
    const schools = liveSchools();
    content.innerHTML = shell("Add schools", "Choose schools now, or skip this step and assign them after the show is created.", `
      <div class="big-stage-wizard-note"><strong>This step is optional.</strong> You can create an empty show and add schools or individual classes later.</div>
      <div class="big-stage-school-picker">${schools.length ? schools.map((school) => {
        const selection = state.selections[school.name];
        return `<article class="big-stage-school-choice ${selection ? "selected" : ""}" data-school-card="${safe(school.name)}">
          <label class="big-stage-school-check"><input type="checkbox" data-school-toggle="${safe(school.name)}" ${selection ? "checked" : ""}><span><strong>${safe(school.name)}</strong><small>${school.classes.length} classes</small></span></label>
          <div class="big-stage-school-options" ${selection ? "" : "hidden"}>
            <fieldset><legend>Whole school on the same show?</legend><label><input type="radio" name="whole-${safe(school.name)}" value="yes" ${!selection || selection.whole ? "checked" : ""}> Yes</label><label><input type="radio" name="whole-${safe(school.name)}" value="no" ${selection && !selection.whole ? "checked" : ""}> No, choose classes</label></fieldset>
            <div class="big-stage-class-checks" ${selection && !selection.whole ? "" : "hidden"}>${school.classes.map((classInfo) => `<label><input type="checkbox" data-class-toggle="${safe(classInfo.id)}" ${selection?.classes?.has(classInfo.id) ? "checked" : ""}> <span>${safe(classInfo.name)}<small>${classInfo.enrolledCount} dancers</small></span></label>`).join("")}</div>
          </div>
        </article>`;
      }).join("") : '<div class="big-stage-wizard-empty"><strong>No live classes are available yet.</strong><span>You can continue and assign classes later.</span></div>'}</div>
    `);
    content.querySelectorAll("[data-school-toggle]").forEach((toggle) => toggle.addEventListener("change", () => {
      const school = toggle.dataset.schoolToggle;
      if (toggle.checked) state.selections[school] = { whole: true, classes: new Set() }; else delete state.selections[school];
      renderSchools(content);
    }));
    content.querySelectorAll(".big-stage-school-choice").forEach((card) => {
      card.querySelectorAll('input[type="radio"]').forEach((radio) => radio.addEventListener("change", () => {
        const selection = state.selections[card.dataset.schoolCard];
        selection.whole = radio.value === "yes";
        renderSchools(content);
      }));
      card.querySelectorAll("[data-class-toggle]").forEach((toggle) => toggle.addEventListener("change", () => {
        const classes = state.selections[card.dataset.schoolCard].classes;
        toggle.checked ? classes.add(toggle.dataset.classToggle) : classes.delete(toggle.dataset.classToggle);
      }));
    });
    content.querySelector("[data-wizard-next]").addEventListener("click", () => {
      state.step = 3; render();
    });
  }

  function renderConflicts(content) {
    const choices = selectedClasses();
    content.innerHTML = shell("Check class placement", "Classes already assigned to another show stay selectable, but require confirmation.", `
      <div class="big-stage-wizard-list">${choices.map(({ school, className }) => {
        const key = selectionKey(school, className), assigned = sampleAssignments.get(key), approved = state.conflictOverrides.has(key);
        return `<article class="big-stage-wizard-class-row ${assigned ? "has-conflict" : ""}"><div><strong>${safe(className)}</strong><small>${safe(school)}</small>${assigned ? `<span class="big-stage-already-ribbon">Already on ${safe(assigned)} Show</span>` : ""}</div>${assigned ? `<label class="big-stage-warning-check"><input type="checkbox" data-conflict-key="${safe(key)}" ${approved ? "checked" : ""}> Keep selected</label>` : '<span class="big-stage-ready-pill">Ready</span>'}</article>`;
      }).join("")}</div>
      <div class="big-stage-wizard-note warning"><strong>Already assigned?</strong> Keeping one selected will move it to ${safe(state.name)}. You’ll choose what performance information comes with it.</div>
    `);
    content.querySelectorAll("[data-conflict-key]").forEach((checkbox) => checkbox.addEventListener("change", () => checkbox.checked ? state.conflictOverrides.add(checkbox.dataset.conflictKey) : state.conflictOverrides.delete(checkbox.dataset.conflictKey)));
    content.querySelector("[data-wizard-next]").addEventListener("click", () => {
      const unconfirmed = choices.filter(({ school, className }) => sampleAssignments.has(selectionKey(school, className)) && !state.conflictOverrides.has(selectionKey(school, className)));
      if (unconfirmed.length) return content.querySelector(".big-stage-wizard-note.warning").classList.add("attention");
      state.step = 4; render();
    });
  }

  function renderCombined(content) {
    const combined = selectedClasses().filter(({ school, className }) => combinedClasses.has(selectionKey(school, className)));
    const conflicts = selectedClasses().filter(({ school, className }) => sampleAssignments.has(selectionKey(school, className)));
    content.innerHTML = shell("Handle connected details", "Decide how combined classes should move and what should transfer with reassigned classes.", `
      ${combined.length ? `<section class="big-stage-combined-question"><h3>Combined class found</h3><p>${combined.map((item) => `<strong>${safe(item.className)}</strong>`).join(" + ")}</p><div class="big-stage-choice-buttons"><label><input type="radio" name="combined-choice" value="move" ${state.combinedChoices.main !== "split" ? "checked" : ""}><span><strong>Move Combined Class</strong><small>Keep the performance together.</small></span></label><label><input type="radio" name="combined-choice" value="split" ${state.combinedChoices.main === "split" ? "checked" : ""}><span><strong>Split Combined Class</strong><small>Place only the selected class here.</small></span></label></div></section>` : '<div class="big-stage-wizard-empty"><strong>No combined classes need a decision.</strong><span>You can continue to the final review.</span></div>'}
      ${conflicts.length ? `<section class="big-stage-transfer-question"><h3>Transfer from the current show</h3><p>Select the information that should move with the class.</p><div class="big-stage-transfer-checks">${[["song","Song"],["costume","Costume"],["props","Props"],["positions","Beginning position & special sections"]].map(([key,label]) => `<label><input type="checkbox" data-transfer="${key}" ${state.transfer[key] ? "checked" : ""}> ${label}</label>`).join("")}</div></section>` : ""}
    `);
    content.querySelectorAll('[name="combined-choice"]').forEach((radio) => radio.addEventListener("change", () => { state.combinedChoices.main = radio.value; }));
    content.querySelectorAll("[data-transfer]").forEach((checkbox) => checkbox.addEventListener("change", () => { state.transfer[checkbox.dataset.transfer] = checkbox.checked; }));
    content.querySelector("[data-wizard-next]").addEventListener("click", () => { state.step = 5; render(); });
  }

  function renderReview(content) {
    const choices = selectedClasses();
    const bySchool = new Map();
    choices.forEach(({ school, className }) => { if (!bySchool.has(school)) bySchool.set(school, []); bySchool.get(school).push(className); });
    const date = new Date(`${state.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    content.innerHTML = shell("Review the show", "Everything looks ready. You can open the show after creating it and arrange the performance order.", `
      <div class="big-stage-review-card"><div><span>Show</span><strong>${safe(state.name)}</strong></div><div><span>Date</span><strong>${safe(date)}</strong></div><div><span>Time</span><strong>${state.time ? safe(state.time) : "Assign later"}</strong></div><div><span>Dancers</span><strong>${choices.length * 12} estimated</strong></div></div>
      <div class="big-stage-review-schools">${[...bySchool].map(([school, classes]) => `<section><h3>${safe(school)}</h3>${classes.map((className) => `<p>${safe(className)}</p>`).join("")}</section>`).join("")}</div>
    `, true, "Create Show");
    content.querySelector("[data-wizard-next]").addEventListener("click", createShow);
  }

  function createShow() {
    const shows = readShows();
    const classes = selectedClasses();
    shows.push({ id: `planned-${Date.now()}`, name: state.name, date: state.date, time: state.time, classes, combinedChoice: state.combinedChoices.main || "move", transfer: state.transfer, createdAt: new Date().toISOString() });
    saveShows(shows);
    close();
    addPlannedCards();
    const notice = document.createElement("div");
    notice.className = "big-stage-wizard-toast";
    notice.textContent = `${state.name} was created with ${classes.length} classes.`;
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 3600);
  }

  function addPlannedCards() {
    const grid = root.querySelector(".big-stage-show-grid");
    if (!grid) return;
    const shows = readShows();
    const signature = shows.map((show) => `${show.id}:${show.classes.length}`).join("|");
    if (grid.dataset.plannedShowsSignature === signature) return;
    grid.dataset.plannedShowsSignature = signature;
    grid.querySelectorAll("[data-planned-show]").forEach((item) => item.remove());
    shows.forEach((show) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "big-stage-show-card big-stage-planned-show";
      card.dataset.plannedShow = show.id;
      const date = new Date(`${show.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
      card.innerHTML = `<div class="big-stage-show-top"><div><div class="big-stage-show-time">${safe(show.name)}</div><div class="big-stage-show-date">${safe(date)} · ${show.time ? safe(show.time) : "Time not assigned"}</div></div><span class="big-stage-pill">Planning</span></div><div><strong>${new Set(show.classes.map((item) => item.school)).size} Schools</strong><br><small>${show.classes.length} classes selected</small></div><div class="big-stage-progress"><span style="width:20%"></span></div>`;
      grid.appendChild(card);
    });
  }

  function bindAddShowButton() {
    const button = root.querySelector("[data-stage-new]");
    if (!button || button.dataset.showWizardBound === "true") return;
    button.dataset.showWizardBound = "true";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      openWizard();
    });
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-stage-new]")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openWizard();
  }, true);
  new MutationObserver(() => { addPlannedCards(); bindAddShowButton(); }).observe(root, { childList: true, subtree: true });
  addPlannedCards();
  bindAddShowButton();
  window.openBigStageShowWizard = openWizard;
  if (isTestMode) {
    localStorage.removeItem(STORAGE_KEY);
    openWizard();
  }
})();

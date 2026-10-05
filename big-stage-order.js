(() => {
  const root = document.getElementById("big-stage-app");
  if (!root) return;
  let editing = false;
  let draggedRow = null;
  let enhancing = false;
  const recitalPlaylistName = "Hottest Ticket in Town";
  let recitalSongs = ["A Dream Is a Wish", "The Best Day Ever", "Better When I'm Dancin'", "You Are My Sunshine", "When I Grow Up", "Dream Together"];
  let recitalPlaylistLoaded = false;
  const teacherColors = { tiffany: "#dba8df", lexi: "#a9d9b8", judy: "#aacfe5", makayla: "#ead17e", erika: "#e7b493", kara: "#cbb7df", liv: "#d9c7a7", megan: "#deb1b8", maddie: "#b9d6d1", brynlee: "#dbc6e2" };
  const costumeImages = {
    "Blush Tutu · CC-104": "Costume Images/Screenshot 2025-01-27 at 1.12.58 PM-184.png",
    "Berry Sequin Set · CC-218": "Costume Images/La Vie En Rose-268.png",
    "Golden Tutu · CC-172": "Costume Images/Screenshot 2026-01-13 at 6.43.12 PM-461.png"
  };
  const costumeSizeLabels = { XXSC: "XXS", XSC: "XS", SC: "S", IC: "I", MC: "M", LC: "L" };
  const previewCostumeDancers = [
    ["Ava Martinez", "XS"], ["Charlotte Reynolds", "S"], ["Ella Sullivan", "S"], ["Lily Johnson", "S"], ["Adeline Brooks", "XS"],
    ["Harper Davis", "S"], ["Maesyn Clark", "I"], ["Riley Thompson", "S"], ["Emma Wilson", "XS"], ["Mia Anderson", "S"],
    ["Sophia Carter", "I"], ["Olivia Lewis", "S"], ["Isabella Walker", "XS"], ["Amelia Hall", "S"], ["Evelyn Young", "I"],
    ["Abigail King", "S"], ["Emily Wright", "XS"], ["Elizabeth Scott", "S"], ["Camila Green", "I"], ["Luna Baker", "S"],
    ["Sofia Adams", "XS"], ["Avery Nelson", "S"], ["Mila Hill", "I"], ["Aria Campbell", "S"], ["Scarlett Mitchell", "XS"]
  ].map(([name, size], index) => ({ id: `preview-costume-${index}`, name, size, photo: "" }));
  const safe = (value) => String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
  const teacherColor = (row) => {
    const teacher = String(row.querySelector('[data-stage-column="teacher"]')?.textContent || row.children[2]?.textContent || "").toLowerCase().replace(/^(miss|ms\.?|mrs\.?)\s+/, "").split(/\s+/)[0];
    return teacherColors[teacher] || "#dba9a1";
  };
  const costumeDancersForRow = (row, costumeName) => {
    const classNames = [...row.querySelectorAll(".big-stage-class strong")].map((item) => item.textContent.trim());
    try {
      const selections = JSON.parse(localStorage.getItem("dt-costume-selections-v1") || "{}");
      const appData = JSON.parse(localStorage.getItem("dt-teacher-tools-prototype-v1") || "null");
      const classes = Array.isArray(appData?.rosterClasses) ? appData.rosterClasses.filter((classInfo) => classNames.includes(String(classInfo.name || "").trim())) : [];
      const dancers = classes.flatMap((classInfo) => {
        const selection = selections[String(classInfo.id)] || classInfo.costumeSelection;
        if (!selection || selection.costumeName !== costumeName) return [];
        return (selection.assignments || []).map((assignment) => {
          const student = (classInfo.students || []).find((item) => String(item.id) === String(assignment.studentId));
          return { id: assignment.studentId, name: assignment.name || [student?.firstName, student?.lastName].filter(Boolean).join(" ") || "Dancer", size: costumeSizeLabels[assignment.size] || assignment.size || "Size pending", photo: student?.photo || student?.photoUrl || "" };
        });
      });
      if (dancers.length) return dancers;
      const matching = Object.values(selections).filter((selection) => selection?.costumeName === costumeName).flatMap((selection) => selection.assignments || []).map((assignment) => ({ id: assignment.studentId, name: assignment.name || "Dancer", size: costumeSizeLabels[assignment.size] || assignment.size || "Size pending", photo: "" }));
      if (matching.length) return matching;
    } catch (error) {}
    const total = Number.parseInt(row.querySelector('[data-stage-column="students"] strong')?.textContent || "", 10) || 4;
    return previewCostumeDancers.slice(0, Math.min(total, previewCostumeDancers.length));
  };
  const costumeDancerMarkup = (dancer) => {
    const nameParts = String(dancer.name || "Dancer").trim().split(/\s+/).filter(Boolean);
    const initials = nameParts.map((part) => part[0]).join("").slice(0, 2).toUpperCase();
    const shortName = nameParts.length > 1 ? `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}.` : nameParts[0];
    return `<article class="big-stage-costume-dancer"><span class="big-stage-costume-dancer-avatar">${dancer.photo ? `<img src="${safe(dancer.photo)}" alt="">` : safe(initials)}</span><div><strong>${safe(shortName)}</strong><small>${safe(dancer.size)}</small></div></article>`;
  };
  const showKey = () => `dt-big-stage-order:${root.querySelector(".big-stage-view-title h4")?.textContent?.trim() || "show"}`;
  const performanceKey = () => `${showKey()}:performing`;
  const songKey = () => `${showKey()}:songs`;
  const propsKey = () => `${showKey()}:props`;
  const combinedDecisionKey = () => `${showKey()}:combined-decisions`;
  const rowKey = (row) => row.querySelector(".big-stage-class")?.textContent?.trim().replace(/\s+/g, " ") || "";
  const performanceRows = () => [...root.querySelectorAll(".big-stage-table tbody tr")].filter((row) => row.querySelector(".big-stage-class"));
  const renumber = () => performanceRows().forEach((row, index) => { const number = row.querySelector(".big-stage-order"); if (number) number.textContent = String(index + 1); });
  const savedOrder = () => { try { return JSON.parse(localStorage.getItem(showKey()) || "[]"); } catch { return []; } };
  const savedPerformances = () => { try { return JSON.parse(localStorage.getItem(performanceKey()) || "{}"); } catch { return {}; } };
  const savedSongs = () => { try { return JSON.parse(localStorage.getItem(songKey()) || "{}"); } catch { return {}; } };
  const savedProps = () => { try { return JSON.parse(localStorage.getItem(propsKey()) || "{}"); } catch { return {}; } };
  const savedCombinedDecisions = () => { try { return JSON.parse(localStorage.getItem(combinedDecisionKey()) || "{}"); } catch { return {}; } };
  const applySavedOrder = () => {
    const order = savedOrder();
    const body = root.querySelector(".big-stage-table tbody");
    if (!body || !order.length) return;
    const byKey = new Map(performanceRows().map((row) => [rowKey(row), row]));
    order.forEach((key) => { const row = byKey.get(key); if (row) body.appendChild(row); });
    renumber();
  };
  const performingType = (className) => {
    const value = String(className || "").toLowerCase();
    if (value.includes("tap") && !value.includes("ballet")) return "Tap";
    if (value.includes("ballet") && !value.includes("tap")) return "Ballet";
    return "Either";
  };
  const ageRangeFor = (className) => {
    const value = String(className || "").toLowerCase();
    if (value.includes("school age")) return "5Y 0M - 8Y 0M";
    if (value.includes("pre-k")) return "4Y 0M - 5Y 0M";
    if (value.includes("preschool")) return "3Y 0M - 4Y 0M";
    return "Age range not entered";
  };
  const combinedLine = (content, color, detail = "") => `<div class="big-stage-combined-line" style="--combined-teacher-color:${color}">${content}${detail ? `<small>${detail}</small>` : ""}</div>`;
  const combinedBand = ({ teacher, school, className, age, dancers, boys, color, hideDancers = false }) => `<div class="big-stage-combined-band${hideDancers ? " without-dancers" : ""}" style="--combined-teacher-color:${color}"><div data-stage-column="teacher">${teacher}</div><div data-stage-column="school">${school}</div><div class="big-stage-class" data-stage-column="class">${className}${age ? `<small>${age}</small>` : ""}</div>${hideDancers ? "" : `<div data-stage-column="students"><strong>${dancers}</strong>${boys ? `<span class="big-stage-boys-pill">${boys}</span>` : ""}</div>`}</div>`;
  const addCombinedSamples = (table) => {
    if (!new URLSearchParams(window.location.search).has("big-stage-preview") || table.dataset.combinedSamplesReady === "true") return;
    const body = table.querySelector("tbody");
    if (!body) return;
    const sampleRows = [
      {
        kind: "Same Teacher Combination",
        type: "Either",
        bands: combinedBand({ teacher: "<strong>Miss Lexi</strong><small>2 of her classes</small>", school: "<span>Primrose School of Wylie</span><span>Primrose School of North</span>", className: "<strong>Ballet &amp; Tap · Pre-K</strong><strong>Ballet &amp; Tap · Preschool</strong>", age: "4Y 0M - 5Y 0M · 3Y 0M - 4Y 0M", color: teacherColors.lexi, hideDancers: true }),
        dancerSummary: `<div class="big-stage-combined-dancer-summary" data-stage-column="students" style="background:color-mix(in srgb, ${teacherColors.lexi} 14%, white)"><strong>25 Dancers</strong><small>Pre-K: 14</small><small>Preschool: 11</small><span class="big-stage-boys-pill">2 boys</span></div>`,
        song: "When I Grow Up", costume: "Blush Tutu · CC-104", props: "Stars · 25", instructions: "Both classes enter together; younger class begins in front."
      },
      {
        kind: "Two Teacher Combination",
        type: "Ballet",
        bands: combinedBand({ teacher: "<strong>Miss Liv</strong>", school: "Wylie Montessori Academy · Sachse", className: "<strong>Ballet · Preschool</strong>", age: "3Y 0M - 4Y 0M", color: teacherColors.liv, hideDancers: true }) + combinedBand({ teacher: "<strong>Miss Megan</strong>", school: "Primrose School of Rowlett", className: "<strong>Ballet · Pre-K</strong>", age: "4Y 0M - 5Y 0M", color: teacherColors.megan, hideDancers: true }),
        dancerSummary: `<div class="big-stage-combined-dancer-summary" data-stage-column="students"><strong>23 Dancers</strong><small>Miss Liv: 11</small><small>Miss Megan: 12</small><span class="big-stage-boys-pill">1 boy</span></div>`,
        song: "Dream Together", costume: "Golden Tutu · CC-172", props: "None", instructions: "Miss Liv enters stage left; Miss Megan enters stage right."
      }
    ];
    sampleRows.forEach((sample) => {
      const row = document.createElement("tr");
      const performanceClass = sample.type.toLowerCase();
      const options = ["Tap", "Ballet", "Either"].map((option) => `<option${option === sample.type ? " selected" : ""}>${option}</option>`).join("");
      row.className = "big-stage-combined-row";
      row.dataset.combinedSample = sample.kind;
      const combinedArea = sample.dancerSummary ? `<div class="big-stage-combined-content"><div class="big-stage-combined-pair-layout"><div class="big-stage-combined-stack">${sample.bands}</div>${sample.dancerSummary}</div></div>` : `<div class="big-stage-combined-stack">${sample.bands}</div>`;
      row.innerHTML = `<td data-stage-column="order"><span class="big-stage-order is-${performanceClass}">1</span><select class="big-stage-order-type" data-stage-performance aria-label="Performance type for ${sample.kind}">${options}</select><span class="big-stage-combined-badge">Combined</span></td><td class="big-stage-combined-area" colspan="4">${combinedArea}</td><td data-stage-column="song">${sample.song}</td><td class="big-stage-costume" data-stage-column="costume"><strong>${sample.costume}</strong><small>Catalog item</small></td><td data-stage-column="props">${sample.props}</td><td data-stage-column="instructions">${sample.instructions}</td>`;
      body.appendChild(row);
    });
    table.dataset.combinedSamplesReady = "true";
  };
  const renderSongDropdowns = () => {
    performanceRows().forEach((row) => {
      const cell = row.querySelector('[data-stage-column="song"]');
      if (!cell || cell.querySelector("[data-stage-song]")) return;
      const className = row.querySelector(".big-stage-class strong")?.textContent?.trim() || row.dataset.combinedSample || "Performance";
      const initial = cell.textContent.trim() || "Song not selected";
      const selected = savedSongs()[className] || initial;
      const options = [...new Set([selected, ...recitalSongs].filter(Boolean))];
      cell.innerHTML = `<select class="big-stage-song-select" data-stage-song aria-label="Song for ${safe(className)}">${options.map((song) => `<option${song === selected ? " selected" : ""}>${safe(song)}</option>`).join("")}</select><small class="big-stage-song-source">${safe(recitalPlaylistName)}</small>`;
    });
  };
  const renderPropsInputs = () => {
    performanceRows().forEach((row) => {
      const cell = row.querySelector('[data-stage-column="props"]');
      if (!cell || cell.querySelector("[data-stage-props]")) return;
      const className = row.querySelector(".big-stage-class strong")?.textContent?.trim() || row.dataset.combinedSample || "Performance";
      const initial = cell.textContent.trim() || "None";
      const value = savedProps()[className] || initial;
      cell.innerHTML = `<input class="big-stage-props-input" data-stage-props value="${safe(value)}" aria-label="Props for ${safe(className)}" placeholder="None">`;
    });
  };
  const refreshSongOptions = () => {
    root.querySelectorAll("[data-stage-song]").forEach((select) => {
      const row = select.closest("tr");
      const className = row?.querySelector(".big-stage-class strong")?.textContent?.trim() || row?.dataset.combinedSample || "Performance";
      const selected = savedSongs()[className] || select.value;
      const options = [...new Set([selected, ...recitalSongs].filter(Boolean))];
      select.innerHTML = options.map((song) => `<option${song === selected ? " selected" : ""}>${safe(song)}</option>`).join("");
    });
  };
  const loadRecitalPlaylist = async (attempt = 0) => {
    if (recitalPlaylistLoaded) return;
    const client = window.dtSupabase;
    if (!client) {
      if (attempt < 12) window.setTimeout(() => loadRecitalPlaylist(attempt + 1), 500);
      return;
    }
    try {
      const playlistResult = await client.from("music_playlists").select("id,name").eq("name", recitalPlaylistName).eq("active", true).maybeSingle();
      if (playlistResult.error || !playlistResult.data?.id) return;
      const linkResult = await client.from("music_playlist_tracks").select("position,music_tracks(title)").eq("playlist_id", playlistResult.data.id).order("position");
      if (linkResult.error) return;
      const liveSongs = (linkResult.data || []).map((link) => link.music_tracks?.title).filter(Boolean);
      if (liveSongs.length) recitalSongs = liveSongs;
      recitalPlaylistLoaded = true;
      refreshSongOptions();
    } catch (error) {
      console.warn("Hottest Ticket in Town playlist could not load", error);
    }
  };
  const reshapeTable = () => {
    const table = root.querySelector(".big-stage-table");
    if (!table || table.dataset.stageLayoutReady === "true") return;
    const heading = table.querySelector("thead tr");
    if (heading) heading.innerHTML = "<th>Order</th><th>Teacher</th><th>School</th><th>Class</th><th>Dancers</th><th>Song</th><th>Costume</th><th>Props</th><th>Beginning Position &amp; Special Sections</th>";
    performanceRows().forEach((row) => {
      const cells = [...row.children];
      const className = cells[1]?.querySelector("strong")?.textContent?.trim() || "Class not entered";
      const school = cells[1]?.querySelector("small")?.textContent?.trim() || "School not entered";
      const teacher = cells[2]?.textContent?.trim() || "Teacher not assigned";
      const roster = cells[3]?.querySelector("strong")?.textContent?.trim() || "0";
      const students = roster.includes("/") ? roster.split("/").pop() : roster;
      const boys = [...(cells[3]?.querySelectorAll("small") || [])].map((item) => item.textContent.trim()).find((value) => /boy/i.test(value)) || "0 boys";
      const song = cells[4]?.textContent?.trim() || "Song not entered";
      const costume = cells[5]?.innerHTML || "";
      const props = cells[6]?.textContent?.trim() || "None";
      const instructions = cells[7]?.textContent?.trim() || "No special sections entered";
      const sharedPerformance = typeof window.getSharedRecitalPerformance === "function" ? window.getSharedRecitalPerformance({ className, schoolName: school }) : "";
      const performance = sharedPerformance ? `${sharedPerformance[0].toUpperCase()}${sharedPerformance.slice(1)}` : savedPerformances()[className] || performingType(className);
      const performanceClass = performance.toLowerCase();
      const ageRange = row.dataset.ageRange || ageRangeFor(className);
      const boysPill = /^0\s+boys?$/i.test(boys) ? "" : `<span class="big-stage-boys-pill">${safe(boys)}</span>`;
      const performanceOptions = ["Tap", "Ballet", "Either"].map((option) => `<option${option === performance ? " selected" : ""}>${option}</option>`).join("");
      row.innerHTML = `<td data-stage-column="order"><span class="big-stage-order is-${performanceClass}">1</span><select class="big-stage-order-type" data-stage-performance aria-label="Performance type for ${safe(className)}">${performanceOptions}</select></td><td data-stage-column="teacher"><strong>${safe(teacher)}</strong></td><td data-stage-column="school">${safe(school)}</td><td class="big-stage-class" data-stage-column="class"><strong>${safe(className)}</strong><small class="big-stage-age-range">${safe(ageRange)}</small></td><td data-stage-column="students"><strong>${safe(students)} Dancers</strong>${boysPill}</td><td data-stage-column="song">${safe(song)}</td><td class="big-stage-costume" data-stage-column="costume">${costume}</td><td data-stage-column="props">${safe(props)}</td><td data-stage-column="instructions">${safe(instructions)}</td>`;
    });
    addCombinedSamples(table);
    renderSongDropdowns();
    renderPropsInputs();
    table.dataset.stageLayoutReady = "true";
    renumber();
  };
  const syncCombinedCapacityAlerts = () => {
    root.querySelectorAll(".big-stage-combined-content").forEach((content) => {
      const row = content.closest("tr");
      const decisionId = row?.dataset.combinedSample || rowKey(row);
      const separationTestMode = new URLSearchParams(window.location.search).has("combined-separation-test");
      if (separationTestMode && root.dataset.combinedSeparationTestCleaned !== "true") {
        localStorage.removeItem(combinedDecisionKey());
        root.dataset.combinedSeparationTestCleaned = "true";
      }
      const decision = savedCombinedDecisions()[decisionId];
      const totalText = content.querySelector(".big-stage-combined-dancer-summary > strong")?.textContent || "";
      const total = Number.parseInt(totalText, 10) || 0;
      let alert = content.querySelector(".big-stage-combined-capacity-alert");
      if (total <= 12) { alert?.remove(); return; }
      if (!alert) {
        alert = document.createElement("button");
        alert.type = "button";
        alert.className = "big-stage-combined-capacity-alert";
        alert.dataset.stageCombinedCapacity = "true";
        alert.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          openCombinedCapacityPlanner(alert.closest("tr"));
        });
        content.appendChild(alert);
      }
      alert.classList.toggle("is-resolved", Boolean(decision));
      const movedClass = decision?.movedClass || "The other class";
      const destination = decision?.action === "current" ? "will receive its own spot in this show" : decision?.action === "other" ? `will move to ${decision.destination}` : "will be temporarily unassigned from all recitals";
      const markup = decision
        ? `<span aria-hidden="true">✓</span><div><strong>Separation planned</strong><small>${safe(movedClass)} ${safe(destination)}. Click to change this plan.</small></div>`
        : `<span aria-hidden="true">!</span><div><strong>Combined class is over the 12-dancer limit</strong><small>${total} dancers total · Click to separate these classes.</small></div>`;
      if (alert.innerHTML !== markup) alert.innerHTML = markup;
      if (separationTestMode && root.dataset.combinedSeparationTestOpened !== "true") {
        root.dataset.combinedSeparationTestOpened = "true";
        window.requestAnimationFrame(() => openCombinedCapacityPlanner(row));
      }
    });
  };
  const showChoices = () => {
    let planned = [];
    try { planned = JSON.parse(localStorage.getItem("dt-big-stage-planned-shows:v1") || "[]").map((show) => show.name); } catch { planned = []; }
    return [...new Set(["11:30 AM Show", "2:30 PM Show", "4:45 PM Show", ...planned])];
  };
  const openCombinedCapacityPlanner = (row) => {
    const decisionId = row.dataset.combinedSample || rowKey(row);
    const classes = [...row.querySelectorAll(".big-stage-combined-band .big-stage-class strong")].map((item) => item.textContent.trim()).filter(Boolean);
    if (classes.length < 2) return;
    const existing = savedCombinedDecisions()[decisionId] || {};
    const keepClass = existing.keepClass || classes[0];
    const action = existing.action || "current";
    const destination = existing.destination || showChoices()[0];
    document.getElementById("big-stage-combined-capacity-modal")?.remove();
    const modal = document.createElement("div");
    modal.id = "big-stage-combined-capacity-modal";
    modal.className = "big-stage-combined-capacity-modal";
    modal.innerHTML = `<section class="big-stage-combined-capacity-dialog" role="dialog" aria-modal="true" aria-labelledby="combined-capacity-title">
      <button class="big-stage-combined-capacity-close" type="button" aria-label="Close separation planner">×</button>
      <span class="big-stage-combined-capacity-kicker">Combined class limit</span>
      <h3 id="combined-capacity-title">Separate these classes</h3>
      <p>Choose which class keeps this performance assignment. Then decide where the other class should go.</p>
      <fieldset class="big-stage-combined-keep"><legend>Keep the current assignment for</legend>${classes.map((className) => `<label><input type="radio" name="combined-keep" value="${safe(className)}" ${className === keepClass ? "checked" : ""}><span><strong>${safe(className)}</strong><small>Stays in this performance spot</small></span></label>`).join("")}</fieldset>
      <fieldset class="big-stage-combined-move"><legend>Move the other class</legend>
        <label><input type="radio" name="combined-action" value="current" ${action === "current" ? "checked" : ""}><span><strong>Own spot on this recital</strong><small>Create a separate performance in the current show.</small></span></label>
        <label><input type="radio" name="combined-action" value="other" ${action === "other" ? "checked" : ""}><span><strong>Move to another recital</strong><small>Choose an existing or newly planned show.</small></span></label>
        <label><input type="radio" name="combined-action" value="unassign" ${action === "unassign" ? "checked" : ""}><span><strong>Temporarily unassign</strong><small>Remove it from every recital until a decision is made.</small></span></label>
      </fieldset>
      <label class="big-stage-combined-destination" ${action === "other" ? "" : "hidden"}>Choose recital<select>${showChoices().map((show) => `<option${show === destination ? " selected" : ""}>${safe(show)}</option>`).join("")}</select></label>
      <div class="big-stage-combined-capacity-actions"><button class="secondary" type="button" data-combined-cancel>Cancel</button><button class="primary" type="button" data-combined-apply>Save Separation Plan</button></div>
    </section>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    const destinationField = modal.querySelector(".big-stage-combined-destination");
    modal.querySelectorAll('[name="combined-action"]').forEach((radio) => radio.addEventListener("change", () => { destinationField.hidden = radio.value !== "other"; }));
    modal.querySelector(".big-stage-combined-capacity-close").addEventListener("click", close);
    modal.querySelector("[data-combined-cancel]").addEventListener("click", close);
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
    modal.querySelector("[data-combined-apply]").addEventListener("click", () => {
      const chosenKeep = modal.querySelector('[name="combined-keep"]:checked')?.value || classes[0];
      const chosenAction = modal.querySelector('[name="combined-action"]:checked')?.value || "current";
      const movedClass = classes.find((className) => className !== chosenKeep) || classes[1];
      const decisions = savedCombinedDecisions();
      decisions[decisionId] = { keepClass: chosenKeep, movedClass, action: chosenAction, destination: chosenAction === "other" ? modal.querySelector("select").value : "", updatedAt: new Date().toISOString() };
      localStorage.setItem(combinedDecisionKey(), JSON.stringify(decisions));
      close();
      syncCombinedCapacityAlerts();
    });
  };
  const setEditing = (active) => {
    editing = active;
    root.classList.toggle("is-editing-show-order", active);
    const button = root.querySelector("[data-stage-edit-order]");
    if (button) { button.textContent = active ? "Done Editing" : "Edit Order"; button.classList.toggle("primary", active); button.classList.toggle("secondary", !active); }
    performanceRows().forEach((row) => { row.draggable = active; row.classList.toggle("is-order-editable", active); });
    if (!active) localStorage.setItem(showKey(), JSON.stringify(performanceRows().map(rowKey)));
  };
  const enhance = () => {
    if (enhancing || !root.querySelector("[data-stage-back]") || !root.querySelector(".big-stage-table")) return;
    if (root.querySelector("[data-stage-edit-order]")) return;
    enhancing = true;
    const actions = root.querySelector(".big-stage-toolbar .big-stage-actions");
    if (actions && !actions.querySelector("[data-stage-edit-order]")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.dataset.stageEditOrder = "true";
      button.textContent = "Edit Order";
      actions.prepend(button);
    }
    reshapeTable();
    syncCombinedCapacityAlerts();
    applySavedOrder();
    performanceRows().forEach((row) => {
      row.style.setProperty("--stage-teacher-color", teacherColor(row));
      const costumeCell = row.querySelector(".big-stage-costume");
      const costumeName = costumeCell?.querySelector("strong")?.textContent?.trim() || "";
      if (costumeCell && costumeName && !costumeCell.querySelector("[data-stage-costume-preview]")) {
        costumeCell.innerHTML = `<button class="big-stage-costume-preview" type="button" data-stage-costume-preview data-stage-costume-name="${safe(costumeName)}" aria-label="Open ${safe(costumeName)} costume details"><img src="${costumeImages[costumeName] || costumeImages["Blush Tutu · CC-104"]}" alt="${safe(costumeName)}"></button>`;
      }
      const orderCell = row.firstElementChild;
      if (orderCell && !orderCell.querySelector(".big-stage-drag-handle")) {
        const handle = document.createElement("span");
        handle.className = "big-stage-drag-handle";
        handle.setAttribute("aria-hidden", "true");
        handle.textContent = "⋮⋮";
        orderCell.prepend(handle);
      }
    });
    setEditing(false);
    if (new URLSearchParams(window.location.search).has("costume-detail-test") && root.dataset.costumeDetailTestOpened !== "true") {
      root.dataset.costumeDetailTestOpened = "true";
      window.requestAnimationFrame(() => root.querySelector("[data-stage-costume-preview]")?.click());
    }
    enhancing = false;
  };
  root.addEventListener("click", (event) => {
    const capacityAlert = event.target.closest("[data-stage-combined-capacity]");
    if (capacityAlert) {
      openCombinedCapacityPlanner(capacityAlert.closest("tr"));
      return;
    }
    const costume = event.target.closest("[data-stage-costume-preview]");
    if (costume) {
      const row = costume.closest("tr");
      const costumeName = costume.dataset.stageCostumeName || "Assigned Costume";
      const className = [...(row?.querySelectorAll(".big-stage-class strong") || [])].map((item) => item.textContent.trim()).join(" + ") || "Class";
      const schoolCells = row?.matches(".big-stage-combined-row") ? row.querySelectorAll('.big-stage-combined-band [data-stage-column="school"]') : row?.querySelectorAll(':scope > [data-stage-column="school"]');
      const teacherCells = row?.matches(".big-stage-combined-row") ? row.querySelectorAll('.big-stage-combined-band [data-stage-column="teacher"] strong') : row?.querySelectorAll(':scope > [data-stage-column="teacher"] strong');
      const schoolParts = [...(schoolCells || [])].flatMap((item) => {
        const parts = [...item.querySelectorAll("span")].map((part) => part.textContent.trim().replace(/\s+/g, " ")).filter(Boolean);
        return parts.length ? parts : [item.textContent.trim().replace(/\s+/g, " ")];
      }).filter(Boolean);
      const school = schoolParts.join(" · ") || "School not entered";
      const teacherParts = [...new Set([...(teacherCells || [])].map((item) => item.textContent.trim()).filter(Boolean))];
      const teacher = teacherParts.join(" · ") || "Teacher not assigned";
      const roster = row?.querySelector('[data-stage-column="students"] strong')?.textContent?.trim() || "Roster not entered";
      const song = row?.querySelector('[data-stage-song]')?.value || row?.querySelector('[data-stage-column="song"]')?.textContent?.trim() || "Song not entered";
      const image = costume.querySelector("img")?.src || "";
      const dancers = costumeDancersForRow(row, costumeName);
      const sizeOrder = ["XXS", "XS", "S", "I", "M", "L", "XL", "Size pending"];
      const sizeCounts = dancers.reduce((counts, dancer) => { counts[dancer.size] = (counts[dancer.size] || 0) + 1; return counts; }, {});
      const costumesNeeded = dancers.length || Number.parseInt(roster, 10) || 0;
      const sizeBreakdown = Object.entries(sizeCounts).sort(([a], [b]) => {
        const aIndex = sizeOrder.indexOf(a), bIndex = sizeOrder.indexOf(b);
        return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex);
      }).map(([size, count]) => `${safe(size)} - ${count}`).join(" · ") || "Sizes pending";
      document.getElementById("big-stage-costume-detail-modal")?.remove();
      const modal = document.createElement("div");
      modal.id = "big-stage-costume-detail-modal";
      modal.className = "big-stage-costume-detail-modal";
      modal.innerHTML = `<section class="big-stage-costume-detail-dialog" role="dialog" aria-modal="true" aria-label="${costumeName} details"><button class="big-stage-costume-detail-close" type="button" aria-label="Close costume details">×</button><div class="big-stage-costume-detail-visual"><img class="big-stage-costume-detail-image" src="${image}" alt="${costumeName}"><section class="big-stage-costume-roster"><h4>Dancer Sizes</h4><div>${dancers.map(costumeDancerMarkup).join("")}</div></section></div><div class="big-stage-costume-detail-copy"><span class="big-stage-costume-detail-label">Assigned Costume</span><h3>${costumeName}</h3><dl><div><dt>Class</dt><dd>${className}</dd></div><div><dt>School</dt><dd class="big-stage-costume-schools">${(schoolParts.length ? schoolParts : [school]).map((name) => `<span>${safe(name)}</span>`).join("")}</dd></div><div><dt>Teacher</dt><dd class="big-stage-costume-teachers">${(teacherParts.length ? teacherParts : [teacher]).map((name) => `<span>${safe(name)}</span>`).join("")}</dd></div><div><dt>Song</dt><dd>${safe(song)}</dd></div><div><dt>Costumes Needed</dt><dd class="big-stage-costume-needed"><strong>${costumesNeeded}</strong><small>${sizeBreakdown}</small></dd></div></dl><button class="primary" type="button" data-stage-costume-detail-done>Done</button></div></section>`;
      document.body.appendChild(modal);
      const close = () => modal.remove();
      modal.querySelector(".big-stage-costume-detail-close").addEventListener("click", close);
      modal.querySelector("[data-stage-costume-detail-done]").addEventListener("click", close);
      modal.addEventListener("click", (clickEvent) => { if (clickEvent.target === modal) close(); });
      return;
    }
    const button = event.target.closest("[data-stage-edit-order]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    setEditing(!editing);
  });
  root.addEventListener("change", (event) => {
    const propsInput = event.target.closest("[data-stage-props]");
    if (propsInput) {
      const row = propsInput.closest("tr");
      const className = row?.querySelector(".big-stage-class strong")?.textContent?.trim() || row?.dataset.combinedSample || "Performance";
      const choices = savedProps();
      choices[className] = propsInput.value.trim() || "None";
      propsInput.value = choices[className];
      localStorage.setItem(propsKey(), JSON.stringify(choices));
      return;
    }
    const songSelect = event.target.closest("[data-stage-song]");
    if (songSelect) {
      const row = songSelect.closest("tr");
      const className = row?.querySelector(".big-stage-class strong")?.textContent?.trim() || row?.dataset.combinedSample || "Performance";
      const choices = savedSongs();
      choices[className] = songSelect.value;
      localStorage.setItem(songKey(), JSON.stringify(choices));
      return;
    }
    const select = event.target.closest("[data-stage-performance]");
    if (!select) return;
    const row = select.closest("tr");
    const circle = row?.querySelector(".big-stage-order");
    const className = row?.querySelector(".big-stage-class strong")?.textContent?.trim() || "Class";
    const schoolName = row?.querySelector('[data-stage-column="school"]')?.textContent?.trim() || "School";
    const performance = select.value;
    if (circle) {
      circle.classList.remove("is-tap", "is-ballet", "is-either");
      circle.classList.add(`is-${performance.toLowerCase()}`);
    }
    const choices = savedPerformances();
    choices[className] = performance;
    localStorage.setItem(performanceKey(), JSON.stringify(choices));
    if (typeof window.updateSharedRecitalPerformance === "function") window.updateSharedRecitalPerformance({ className, schoolName, performanceType: performance });
    performanceRows().forEach((otherRow) => {
      if (otherRow === row) return;
      const sameClass = otherRow.querySelector(".big-stage-class strong")?.textContent?.trim() === className;
      const sameSchool = otherRow.querySelector('[data-stage-column="school"]')?.textContent?.trim() === schoolName;
      if (!sameClass || !sameSchool) return;
      const otherSelect = otherRow.querySelector("[data-stage-performance]");
      const otherCircle = otherRow.querySelector(".big-stage-order");
      if (otherSelect) otherSelect.value = performance;
      if (otherCircle) {
        otherCircle.classList.remove("is-tap", "is-ballet", "is-either");
        otherCircle.classList.add(`is-${performance.toLowerCase()}`);
      }
    });
  });
  root.addEventListener("dragstart", (event) => {
    const row = event.target.closest("tr.is-order-editable");
    if (!editing || !row) return;
    draggedRow = row;
    row.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", rowKey(row));
  });
  root.addEventListener("dragover", (event) => {
    if (!editing || !draggedRow) return;
    const target = event.target.closest("tr.is-order-editable");
    if (!target || target === draggedRow || target.parentElement !== draggedRow.parentElement) return;
    event.preventDefault();
    const box = target.getBoundingClientRect();
    target.parentElement.insertBefore(draggedRow, event.clientY > box.top + box.height / 2 ? target.nextSibling : target);
    renumber();
  });
  root.addEventListener("drop", (event) => { if (!draggedRow) return; event.preventDefault(); draggedRow.classList.remove("is-dragging"); draggedRow = null; renumber(); });
  root.addEventListener("dragend", () => { draggedRow?.classList.remove("is-dragging"); draggedRow = null; });
  new MutationObserver(() => window.requestAnimationFrame(() => { enhance(); syncCombinedCapacityAlerts(); })).observe(root, { childList: true, subtree: true, characterData: true });
  enhance();
  loadRecitalPlaylist();
})();

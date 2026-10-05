(() => {
  const root = document.getElementById("big-stage-app");
  if (!root) return;
  let editing = false;
  let draggedRow = null;
  let enhancing = false;
  const teacherColors = { tiffany: "#dba8df", lexi: "#a9d9b8", judy: "#aacfe5", makayla: "#ead17e", erika: "#e7b493", kara: "#cbb7df", liv: "#d9c7a7", megan: "#deb1b8", maddie: "#b9d6d1", brynlee: "#dbc6e2" };
  const costumeImages = {
    "Blush Tutu · CC-104": "Costume Images/Screenshot 2025-01-27 at 1.12.58 PM-184.png",
    "Berry Sequin Set · CC-218": "Costume Images/La Vie En Rose-268.png",
    "Golden Tutu · CC-172": "Costume Images/Screenshot 2026-01-13 at 6.43.12 PM-461.png"
  };
  const safe = (value) => String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
  const teacherColor = (row) => {
    const teacher = String(row.querySelector('[data-stage-column="teacher"]')?.textContent || row.children[2]?.textContent || "").toLowerCase().replace(/^(miss|ms\.?|mrs\.?)\s+/, "").split(/\s+/)[0];
    return teacherColors[teacher] || "#dba9a1";
  };
  const showKey = () => `dt-big-stage-order:${root.querySelector(".big-stage-view-title h4")?.textContent?.trim() || "show"}`;
  const rowKey = (row) => row.querySelector(".big-stage-class")?.textContent?.trim().replace(/\s+/g, " ") || "";
  const performanceRows = () => [...root.querySelectorAll(".big-stage-table tbody tr")].filter((row) => row.querySelector(".big-stage-class"));
  const renumber = () => performanceRows().forEach((row, index) => { const number = row.querySelector(".big-stage-order"); if (number) number.textContent = String(index + 1); });
  const savedOrder = () => { try { return JSON.parse(localStorage.getItem(showKey()) || "[]"); } catch { return []; } };
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
  const reshapeTable = () => {
    const table = root.querySelector(".big-stage-table");
    if (!table || table.dataset.stageLayoutReady === "true") return;
    const heading = table.querySelector("thead tr");
    if (heading) heading.innerHTML = "<th>Order</th><th>Teacher</th><th>Performing</th><th>School</th><th>Class</th><th>Students</th><th>Song</th><th>Costume</th><th>Props</th><th>Beginning Position &amp; Special Sections</th>";
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
      const performance = performingType(className);
      const performanceClass = performance.toLowerCase();
      const ageRange = row.dataset.ageRange || ageRangeFor(className);
      row.innerHTML = `<td data-stage-column="order"><span class="big-stage-order is-${performanceClass}">1</span></td><td data-stage-column="teacher"><strong>${safe(teacher)}</strong></td><td data-stage-column="performing"><span class="big-stage-performing-pill is-${performanceClass}">${performance}</span></td><td data-stage-column="school">${safe(school)}</td><td class="big-stage-class" data-stage-column="class"><strong>${safe(className)}</strong><small class="big-stage-age-range">${safe(ageRange)}</small></td><td data-stage-column="students"><strong>${safe(students)} Students</strong><span class="big-stage-boys-pill">${safe(boys)}</span></td><td data-stage-column="song">${safe(song)}</td><td class="big-stage-costume" data-stage-column="costume">${costume}</td><td data-stage-column="props">${safe(props)}</td><td data-stage-column="instructions">${safe(instructions)}</td>`;
    });
    table.dataset.stageLayoutReady = "true";
    renumber();
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
    applySavedOrder();
    performanceRows().forEach((row) => {
      row.style.setProperty("--stage-teacher-color", teacherColor(row));
      const costumeCell = row.querySelector(".big-stage-costume");
      const costumeName = costumeCell?.querySelector("strong")?.textContent?.trim() || "";
      if (costumeCell && costumeName && !costumeCell.querySelector("[data-stage-costume-preview]")) {
        costumeCell.innerHTML = `<button class="big-stage-costume-preview" type="button" data-stage-costume-preview aria-label="Open ${costumeName} costume details"><img src="${costumeImages[costumeName] || costumeImages["Blush Tutu · CC-104"]}" alt="${costumeName}"><span><strong>${costumeName}</strong><small>View full costume details</small></span></button>`;
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
    enhancing = false;
  };
  root.addEventListener("click", (event) => {
    const costume = event.target.closest("[data-stage-costume-preview]");
    if (costume) {
      const row = costume.closest("tr");
      const costumeName = costume.querySelector("strong")?.textContent?.trim() || "Assigned Costume";
      const className = row?.querySelector(".big-stage-class strong")?.textContent?.trim() || "Class";
      const school = row?.querySelector('[data-stage-column="school"]')?.textContent?.trim() || "School not entered";
      const teacher = row?.querySelector('[data-stage-column="teacher"]')?.textContent?.trim() || "Teacher not assigned";
      const roster = row?.querySelector('[data-stage-column="students"] strong')?.textContent?.trim() || "Roster not entered";
      const song = row?.querySelector('[data-stage-column="song"]')?.textContent?.trim() || "Song not entered";
      const image = costume.querySelector("img")?.src || "";
      document.getElementById("big-stage-costume-detail-modal")?.remove();
      const modal = document.createElement("div");
      modal.id = "big-stage-costume-detail-modal";
      modal.className = "big-stage-costume-detail-modal";
      modal.innerHTML = `<section class="big-stage-costume-detail-dialog" role="dialog" aria-modal="true" aria-label="${costumeName} details"><button class="big-stage-costume-detail-close" type="button" aria-label="Close costume details">×</button><img class="big-stage-costume-detail-image" src="${image}" alt="${costumeName}"><div class="big-stage-costume-detail-copy"><span class="big-stage-costume-detail-label">Assigned Costume</span><h3>${costumeName}</h3><dl><div><dt>Class</dt><dd>${className}</dd></div><div><dt>School</dt><dd>${school}</dd></div><div><dt>Teacher</dt><dd>${teacher}</dd></div><div><dt>Song</dt><dd>${song}</dd></div><div><dt>Participating</dt><dd>${roster}</dd></div></dl><button class="primary" type="button" data-stage-costume-detail-done>Done</button></div></section>`;
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
  new MutationObserver(() => window.requestAnimationFrame(enhance)).observe(root, { childList: true, subtree: true });
  enhance();
})();

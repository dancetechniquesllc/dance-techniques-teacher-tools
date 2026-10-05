(() => {
  const root = document.getElementById("big-stage-app");
  if (!root) return;
  let editing = false;
  let draggedRow = null;
  let enhancing = false;
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
    applySavedOrder();
    performanceRows().forEach((row) => {
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

(() => {
  const KEY = "dt-director-duet-identity";
  const names = { lexi: "Lexi", tiffany: "Ms. Tiffany" };
  let messages = [], reads = [], channel = null, ready = false, opened = false, pendingTaskMessage = null;
  const tasked = new Set();
  const $ = (selector) => document.querySelector(selector);
  const tour = () => document.body.dataset.tourMode === "true" || new URLSearchParams(location.search).get("tour") === "1";
  const who = () => localStorage.getItem(KEY) || "tiffany";
  const other = () => who() === "lexi" ? "tiffany" : "lexi";
  const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
  const readByOther = (message) => reads.some((read) => read.message_id === message.id && read.reader_key === other());
  const unread = () => messages.filter((message) => message.sender_key !== who() && !reads.some((read) => read.message_id === message.id && read.reader_key === who())).length;

  function build() {
    const host = $("#tulle-root");
    if (!host) return false;
    const existing = $("#director-duet");
    if (existing) { if (existing.parentElement !== host) host.appendChild(existing); return true; }
    const root = document.createElement("div");
    root.id = "director-duet";
    root.className = "director-duet-root";
    root.dataset.unsavedIgnore = "true";
    root.innerHTML = `<button class="director-duet-launcher" type="button" aria-label="Open Admin Chat" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5 4v-4.7A2.5 2.5 0 0 1 4 13.5z"></path><path d="M8 8h8M8 12h5"></path></svg><span class="director-duet-badge" hidden></span></button><section class="director-duet" role="dialog" aria-modal="false" aria-labelledby="director-duet-title" hidden><div class="director-duet-head"><h3 id="director-duet-title">Admin Chat</h3><button class="director-duet-close" type="button" aria-label="Close Admin Chat">×</button></div><div class="director-duet-messages" id="director-duet-messages" aria-live="polite"><p class="director-duet-empty">Connecting…</p></div><form class="director-duet-composer" id="director-duet-form"><textarea id="director-duet-draft" maxlength="2000" aria-label="Admin Chat message" required></textarea><button class="primary" type="submit">Send</button></form><label class="director-duet-identity">This device is <select id="director-duet-identity"><option value="lexi">Lexi</option><option value="tiffany">Ms. Tiffany</option></select></label></section><dialog class="director-duet-task-dialog" id="director-duet-task-dialog"><form class="director-duet-task-card" id="director-duet-task-form"><div class="director-duet-task-head"><div><small>Admin Chat</small><h3>Add to Tasks</h3></div><button type="button" data-close-admin-chat-task aria-label="Close">×</button></div><label>Task<textarea id="director-duet-task-text" maxlength="2000" required></textarea></label><label>Assign to<select id="director-duet-task-assignee"><option value="lexi">Ms. Lexi</option><option value="tiffany">Ms. Tiffany</option></select></label><div class="director-duet-task-actions"><button class="secondary" type="button" data-close-admin-chat-task>Cancel</button><button class="primary" type="submit">Add Task</button></div></form></dialog>`;
    host.appendChild(root);
    root.querySelector(".director-duet-launcher").onclick = () => toggle(true);
    root.querySelector(".director-duet-close").onclick = () => toggle(false);
    root.querySelector("#director-duet-identity").onchange = (event) => {
      const value = event.target.value === "lexi" ? "lexi" : "tiffany";
      localStorage.setItem(KEY, value); render(); status(`This device now sends as ${names[value]}.`);
      if (opened) void markRead();
    };
    root.querySelector("#director-duet-form").onsubmit = submit;
    root.querySelector("#director-duet-messages").onclick = (event) => {
      const button = event.target.closest("[data-admin-chat-task]");
      if (!button) return;
      const message = messages.find((item) => item.id === button.dataset.adminChatTask);
      if (!message) return;
      openTaskEditor(message);
    };
    root.querySelectorAll("[data-close-admin-chat-task]").forEach((button) => button.onclick = () => root.querySelector("#director-duet-task-dialog").close());
    root.querySelector("#director-duet-task-form").onsubmit = addReviewedTask;
    return true;
  }
  function openTaskEditor(message) {
    pendingTaskMessage = message;
    $("#director-duet-task-text").value = message.body;
    $("#director-duet-task-assignee").value = who();
    const dialog = $("#director-duet-task-dialog");
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => $("#director-duet-task-text")?.focus());
  }
  function addReviewedTask(event) {
    event.preventDefault();
    if (!pendingTaskMessage) return;
    const detail = { message: pendingTaskMessage, taskText: $("#director-duet-task-text").value.trim(), assigneeKey: $("#director-duet-task-assignee").value, viewerKey: who(), added: false };
    if (!detail.taskText) return;
    window.dispatchEvent(new CustomEvent("dt-admin-chat-add-task", { detail }));
    if (detail.added) { tasked.add(pendingTaskMessage.id); $("#director-duet-task-dialog").close(); render(); pendingTaskMessage = null; }
  }
  function toggle(open) {
    const panel = $("#director-duet .director-duet"), button = $("#director-duet .director-duet-launcher");
    if (!panel || !button) return;
    opened = open; panel.hidden = !open; button.setAttribute("aria-expanded", String(open));
    if (open) { render(); void markRead(); $("#director-duet-draft")?.focus(); }
  }
  function render() {
    const list = $("#director-duet-messages"), select = $("#director-duet-identity"), draft = $("#director-duet-draft"), badge = $(".director-duet-badge"), launcher = $(".director-duet-launcher");
    if (!list || !select) return;
    select.value = who(); if (draft) draft.placeholder = `Message ${names[other()]}`;
    list.innerHTML = messages.length ? messages.map((message) => `<article class="director-duet-message-wrap ${message.sender_key === who() ? "mine" : ""}"><div class="director-duet-line"><div class="director-duet-message sender-${safe(message.sender_key)}"><strong>${safe(message.sender_name)}</strong><span>${safe(message.body)}</span></div><button class="director-duet-task ${tasked.has(message.id) ? "is-added" : ""}" type="button" data-admin-chat-task="${safe(message.id)}" aria-label="${tasked.has(message.id) ? "Added to Tasks" : `Add message from ${safe(message.sender_name)} to Tasks`}" title="${tasked.has(message.id) ? "Added to Tasks" : "Add to Tasks"}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"></rect><path d="m8 12 2.5 2.5L16 9"></path></svg></button></div><small class="director-duet-meta"><time>${safe(new Date(message.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}</time>${message.sender_key === who() && readByOther(message) ? '<span aria-label="Read by the other director">✓ Read</span>' : ""}</small></article>`).join("") : '<p class="director-duet-empty">No messages yet. Say hello!</p>';
    const count = unread(); if (badge) { badge.hidden = !count; badge.textContent = count > 9 ? "9+" : String(count); } launcher?.classList.toggle("has-unread", count > 0);
    requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  }
  function status() {}
  async function load() {
    if (tour()) { ready = true; render(); status("Preview chat · messages are not saved in tour mode."); return; }
    if (!window.dtSupabase || !window.dtCurrentProfile) return;
    const [{ data, error }, { data: readRows, error: readError }] = await Promise.all([
      window.dtSupabase.from("director_device_chat_messages").select("id, sender_key, sender_name, body, created_at").order("created_at", { ascending: true }).limit(500),
      window.dtSupabase.from("director_device_chat_reads").select("message_id, reader_key, read_at").limit(1000)
    ]);
    if (error || readError) { ready = false; status("Admin Chat could not connect. Refresh and try again."); console.error("Admin Chat could not load", error || readError); return; }
    messages = data || []; reads = readRows || []; ready = true; status("Live · messages update automatically on both computers."); render();
  }
  async function markRead() {
    const ids = messages.filter((message) => message.sender_key !== who() && !reads.some((read) => read.message_id === message.id && read.reader_key === who())).map((message) => message.id);
    if (!ids.length) return;
    if (tour()) { reads.push(...ids.map((message_id) => ({ message_id, reader_key: who(), read_at: new Date().toISOString() }))); render(); return; }
    const { error } = await window.dtSupabase.rpc("mark_director_device_chat_read", { device_reader_key: who(), target_message_ids: ids });
    if (!error) await load(); else console.error("Admin Chat read receipt could not save", error);
  }
  function subscribe() {
    if (tour() || channel || !window.dtSupabase || !window.dtCurrentProfile) return;
    channel = window.dtSupabase.channel("director-device-chat")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "director_device_chat_messages" }, async () => { await load(); if (opened) await markRead(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "director_device_chat_reads" }, () => load()).subscribe();
  }
  async function send(body) {
    if (tour()) { messages.push({ id: crypto.randomUUID(), sender_key: who(), sender_name: names[who()], body, created_at: new Date().toISOString() }); render(); return true; }
    if (!ready || !window.dtSupabase) { status("Admin Chat is reconnecting. Refresh and try again."); return false; }
    const { error } = await window.dtSupabase.rpc("post_director_device_chat_message", { device_sender_key: who(), message_body: body });
    if (error) { console.error("Admin Chat message could not send", error); status("That message did not send. Please try again."); return false; }
    await load(); return true;
  }
  async function submit(event) { event.preventDefault(); const draft = $("#director-duet-draft"), text = draft?.value.trim() || "", button = event.currentTarget.querySelector("button"); if (!text) return; button.disabled = true; const sent = await send(text); button.disabled = false; if (sent && draft) draft.value = ""; }
  function init(profile = window.dtCurrentProfile) { if (!build()) { setTimeout(() => init(profile), 50); return; } const root = $("#director-duet"); if (!tour() && !["admin", "director"].includes(profile?.role)) { root.hidden = true; return; } root.hidden = false; if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, "tiffany"); render(); void load(); subscribe(); }
  window.addEventListener("dt-auth-ready", (event) => init(event.detail?.profile)); init();
})();

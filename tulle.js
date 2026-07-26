(() => {
  "use strict";

  const TULLE_VERSION = 1;
  const TULLE_UI_KEY = "dt-tulle-ui-v1";
  const TULLE_CONTEXT_KEY = "dt-tulle-context-v1";
  const DIRECTOR_ROLE = "director";
  const SAFE_MARGIN = 12;
  const rootId = "tulle-root";
  const modelProvider = Object.freeze({ enabled: false, ask: async () => null });
  const opportunityProvider = Object.freeze({ enabled: false, list: async () => [] });
  const quickActions = [
    ["newsletter", "Send a newsletter"],
    ["find-dancer", "Find a dancer"],
    ["unpaid", "View unpaid tuition"],
    ["create-class", "Create a class"],
    ["today", "Open today’s schedule"],
    ["birthdays", "View birthdays this week"]
  ];

  const personality = Object.freeze({
    welcome: "bonjour! i’m TULLE. the ultimate little link to everything. tell me what you need, and i’ll help you get there.",
    found: "I found it!",
    route: "Absolutely—I can help with that.",
    review: "Ready for your review.",
    none: "I’m not quite sure where that is yet, but I can help you look in a nearby section.",
    unavailable: "That information isn’t available in the dashboard right now. I can take you to the best place to check.",
    unsupported: "I’m not quite sure about that yet, but I can take you to a helpful place to look together.",
    newsletter: "I’ll open Newsletter Studio so you can choose the recipients and review everything. I won’t send or replace a draft.",
    asleep: "TULLE is resting quietly.",
    awake: "I’m right here when you need me."
  });

  const sectionAliases = Object.freeze({
    "newsletter studio": "newsletter-studio",
    newsletter: "newsletter-studio",
    newsletters: "newsletter-studio",
    "student library": "student-library",
    students: "student-library",
    enrollments: "student-library",
    enrollment: "student-library",
    "classes and rosters": "classes-rosters",
    "classes & rosters": "classes-rosters",
    classes: "classes-rosters",
    rosters: "classes-rosters",
    "teacher profiles": "teacher-profiles",
    teachers: "teacher-profiles",
    "teaching team": "teacher-profiles",
    "school library": "school-library",
    schools: "school-library",
    "partner schools": "school-library",
    finance: "finance-folio",
    payroll: "finance-folio",
    balances: "finance-folio",
    "today's schedule": "master-my-day",
    "todays schedule": "master-my-day",
    "my day": "master-my-day",
    schedule: "master-my-day",
    "schedule changes": "reschedule-tracker",
    messages: "messages",
    "class progress": "curriculum-progress",
    curriculum: "curriculum",
    boutique: "boutique-backend"
  });

  const state = {
    profileId: "",
    asleep: false,
    reduceMotion: false,
    panelOpen: false,
    dragging: false,
    moved: false,
    dragStartX: 0,
    dragStartY: 0,
    dragOffsetX: 0,
    dragOffsetY: 0,
    position: null,
    recognition: null,
    listening: false,
    choices: new Map(),
    context: {
      lastIntent: "",
      lastEntityType: "",
      lastEntityId: "",
      currentSection: ""
    }
  };

  const safe = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const normalize = (value = "") => String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(ms|miss|mrs|mr|teacher|dancer|student|class|school)\.?\b/g, " ")
    .replace(/[^a-z0-9@]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  const isTourDemo = () => document.body.dataset.tourMode === "true"
    && ["127.0.0.1", "localhost"].includes(location.hostname);

  const currentRole = () => String(window.dtCurrentProfile?.role || document.body.dataset.userRole || "").toLowerCase();
  const isAuthorized = () => isTourDemo() || (document.body.dataset.authenticated === "true" && currentRole() === DIRECTOR_ROLE);
  const storageSuffix = () => state.profileId || (isTourDemo() ? "tour" : "device");
  const uiStorageKey = () => `${TULLE_UI_KEY}:${storageSuffix()}`;
  const contextStorageKey = () => `${TULLE_CONTEXT_KEY}:${storageSuffix()}`;

  const loadJson = (storage, key) => {
    try { return JSON.parse(storage.getItem(key) || "null"); }
    catch (_) { return null; }
  };

  const saveUi = () => {
    try {
      localStorage.setItem(uiStorageKey(), JSON.stringify({
        version: TULLE_VERSION,
        asleep: state.asleep,
        reduceMotion: state.reduceMotion,
        position: state.position
      }));
    } catch (_) {}
  };

  const saveContext = () => {
    try {
      sessionStorage.setItem(contextStorageKey(), JSON.stringify({
        version: TULLE_VERSION,
        context: state.context
      }));
    } catch (_) {}
  };

  const clearContext = () => {
    state.context = { lastIntent: "", lastEntityType: "", lastEntityId: "", currentSection: "" };
    try { sessionStorage.removeItem(contextStorageKey()); } catch (_) {}
  };

  const loadState = () => {
    state.profileId = String(window.dtCurrentProfile?.id || "");
    const ui = loadJson(localStorage, uiStorageKey()) || {};
    const savedContext = loadJson(sessionStorage, contextStorageKey()) || {};
    state.asleep = Boolean(ui.asleep);
    state.reduceMotion = Boolean(ui.reduceMotion);
    state.position = ui.position && Number.isFinite(ui.position.left) && Number.isFinite(ui.position.top)
      ? { left: ui.position.left, top: ui.position.top }
      : null;
    if (savedContext.context && typeof savedContext.context === "object") {
      state.context = { ...state.context, ...savedContext.context };
    }
  };

  const buildShell = () => {
    if (document.getElementById(rootId)) return document.getElementById(rootId);
    const root = document.createElement("div");
    root.id = rootId;
    root.className = "tulle-root";
    root.dataset.unsavedIgnore = "true";
    root.innerHTML = `
      <button class="tulle-launcher" type="button" aria-label="Open TULLE, your Director Dashboard assistant" aria-expanded="false">
        <img src="assets/tulle-solo.png" alt="">
        <span class="tulle-state-orb" aria-hidden="true">☀</span>
      </button>
      <section class="tulle-panel" role="dialog" aria-modal="false" aria-label="TULLE assistant" hidden>
        <header class="tulle-panel-head">
          <img class="tulle-panel-portrait" src="assets/tulle-solo.png" alt="TULLE, the Dance Techniques ballet shoe assistant">
          <div class="tulle-panel-title"><strong>T.U.L.L.E.</strong><span>The Ultimate Little Link to Everything</span></div>
          <div class="tulle-head-actions">
            <button class="tulle-icon-button" type="button" data-tulle-sleep aria-label="Put TULLE to sleep" title="Sleep">☀</button>
            <button class="tulle-icon-button" type="button" data-tulle-minimize aria-label="Minimize TULLE" title="Minimize">−</button>
            <button class="tulle-icon-button" type="button" data-tulle-close aria-label="Close TULLE and clear this conversation" title="Close">×</button>
          </div>
        </header>
        <div class="tulle-panel-body">
          <p class="tulle-welcome">${personality.welcome}</p>
          <div class="tulle-response" aria-live="polite" hidden></div>
          <div class="tulle-choice-list" hidden></div>
          <div class="tulle-review" hidden></div>
          <div class="tulle-quick-actions" aria-label="TULLE quick actions">
            ${quickActions.map(([key, label]) => `<button class="tulle-quick-action" type="button" data-tulle-quick="${key}">${label}</button>`).join("")}
          </div>
        </div>
        <div class="tulle-listening" hidden>
          <span>TULLE is listening…</span>
          <div class="tulle-listening-actions">
            <button type="button" data-tulle-stop>Edit</button>
            <button type="button" data-tulle-send-now>Send Now</button>
          </div>
        </div>
        <div class="tulle-input-row">
          <textarea data-tulle-input rows="1" aria-label="Tell TULLE what you need" placeholder="Tell me what you need…"></textarea>
          <button class="tulle-icon-button" type="button" data-tulle-mic aria-label="Dictate a request" title="Microphone">●</button>
          <button class="tulle-send" type="button" data-tulle-send>Send</button>
        </div>
        <div class="tulle-settings">
          <label><input type="checkbox" data-tulle-reduce-motion> Reduce motion on this device</label>
        </div>
        <p class="tulle-tagline" aria-label="a sweet little shoe keeping you one step ahead"><span aria-hidden="true">✦</span><span>a sweet little shoe keeping you one step ahead</span><span aria-hidden="true">✦</span></p>
      </section>`;
    document.body.appendChild(root);
    return root;
  };

  const elements = () => {
    const root = document.getElementById(rootId);
    return {
      root,
      launcher: root?.querySelector(".tulle-launcher"),
      panel: root?.querySelector(".tulle-panel"),
      response: root?.querySelector(".tulle-response"),
      choices: root?.querySelector(".tulle-choice-list"),
      review: root?.querySelector(".tulle-review"),
      input: root?.querySelector("[data-tulle-input]"),
      mic: root?.querySelector("[data-tulle-mic]"),
      listening: root?.querySelector(".tulle-listening"),
      stateOrb: root?.querySelector(".tulle-state-orb"),
      sleep: root?.querySelector("[data-tulle-sleep]"),
      reduceMotion: root?.querySelector("[data-tulle-reduce-motion]")
    };
  };

  const clampPosition = (left, top) => {
    const { root } = elements();
    const width = root?.offsetWidth || 82;
    const height = root?.offsetHeight || 96;
    return {
      left: Math.max(SAFE_MARGIN, Math.min(window.innerWidth - width - SAFE_MARGIN, left)),
      top: Math.max(SAFE_MARGIN, Math.min(window.innerHeight - height - SAFE_MARGIN, top))
    };
  };

  const applyPosition = () => {
    const { root } = elements();
    if (!root || !state.position || window.innerWidth <= 640) {
      if (root) {
        root.style.removeProperty("left");
        root.style.removeProperty("top");
        root.style.removeProperty("bottom");
      }
      return;
    }
    state.position = clampPosition(state.position.left, state.position.top);
    root.style.left = `${state.position.left}px`;
    root.style.top = `${state.position.top}px`;
    root.style.bottom = "auto";
  };

  const updateUiState = () => {
    const { root, launcher, panel, stateOrb, sleep, reduceMotion } = elements();
    if (!root) return;
    root.hidden = !isAuthorized();
    root.classList.toggle("is-asleep", state.asleep);
    root.classList.toggle("is-reduced-motion", state.reduceMotion);
    if (stateOrb) stateOrb.textContent = state.asleep ? "☾" : "☀";
    if (sleep) {
      sleep.textContent = state.asleep ? "☾" : "☀";
      sleep.setAttribute("aria-label", state.asleep ? "Wake TULLE" : "Put TULLE to sleep");
      sleep.title = state.asleep ? "Wake" : "Sleep";
    }
    if (reduceMotion) reduceMotion.checked = state.reduceMotion;
    if (panel) panel.hidden = !state.panelOpen || state.asleep;
    if (launcher) launcher.setAttribute("aria-expanded", String(state.panelOpen && !state.asleep));
  };

  const openPanel = ({ focus = true } = {}) => {
    if (state.asleep) {
      state.asleep = false;
      saveUi();
    }
    state.panelOpen = true;
    updateUiState();
    if (focus) window.setTimeout(() => elements().input?.focus(), 30);
  };

  const minimizePanel = () => {
    state.panelOpen = false;
    stopListening();
    updateUiState();
    elements().launcher?.focus();
  };

  const closePanel = () => {
    minimizePanel();
    clearContext();
    clearOutput();
    const { input } = elements();
    if (input) input.value = "";
  };

  const toggleSleep = () => {
    state.asleep = !state.asleep;
    if (state.asleep) {
      state.panelOpen = false;
      stopListening();
    } else {
      state.panelOpen = true;
    }
    saveUi();
    updateUiState();
    if (!state.asleep) {
      respond(personality.awake);
      window.setTimeout(() => elements().input?.focus(), 30);
    }
  };

  const clearOutput = () => {
    const { response, choices, review } = elements();
    if (response) { response.hidden = true; response.innerHTML = ""; }
    if (choices) { choices.hidden = true; choices.innerHTML = ""; }
    if (review) { review.hidden = true; review.innerHTML = ""; }
    state.choices.clear();
  };

  const respond = (warmLead, facts = [], nextStep = "") => {
    const { response } = elements();
    if (!response) return;
    const factMarkup = facts.filter(Boolean).map((fact) => `<strong>${safe(fact)}</strong>`).join("<br>");
    response.innerHTML = `${safe(warmLead)}${factMarkup ? `<br>${factMarkup}` : ""}${nextStep ? `<br>${safe(nextStep)}` : ""}`;
    response.hidden = false;
  };

  const showChoices = (warmLead, records) => {
    const { choices } = elements();
    respond(warmLead, [], "Choose the one you mean.");
    if (!choices) return;
    state.choices.clear();
    choices.innerHTML = records.map((record, index) => {
      const key = `choice-${Date.now()}-${index}`;
      state.choices.set(key, record);
      return `<button class="tulle-choice-card" type="button" data-tulle-choice="${key}"><strong>${safe(record.title)}</strong><small>${safe(record.subtitle || "")}</small></button>`;
    }).join("");
    choices.hidden = false;
  };

  const showReview = (title, copy, actionLabel, action) => {
    const { review } = elements();
    if (!review) return;
    const key = `review-${Date.now()}`;
    state.choices.set(key, { run: action });
    review.innerHTML = `<strong>${safe(title)}</strong><small>${safe(copy)}</small><button type="button" data-tulle-review="${key}">${safe(actionLabel)}</button>`;
    review.hidden = false;
  };

  const currentRecords = () => {
    const classRecords = Array.isArray(rosterClasses) ? rosterClasses.filter((item) => item.sourceActive !== false) : [];
    const studentRecords = classRecords.flatMap((rosterClass) => (rosterClass.students || []).map((student) => ({
      kind: "student",
      id: String(student.id || ""),
      student,
      rosterClass,
      title: typeof rosterStudentFullName === "function" ? rosterStudentFullName(student) : `${student.firstName || ""} ${student.lastName || ""}`.trim(),
      subtitle: `${typeof rosterSchoolNickname === "function" ? rosterSchoolNickname(rosterClass.schoolName) : rosterClass.schoolName || "School not assigned"} · ${rosterClass.name || "Class not assigned"}`
    })));
    const teacherRecords = (Array.isArray(teachers) ? teachers : []).filter((teacher) => teacher.status !== "inactive").map((teacher) => ({
      kind: "teacher",
      id: String(teacher.id || ""),
      teacher,
      title: teacher.displayName || `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim(),
      subtitle: `${(teacher.schools || []).length} partner school${(teacher.schools || []).length === 1 ? "" : "s"}`
    }));
    const schoolRecords = (Array.isArray(schoolLibrary) ? schoolLibrary : []).map((school) => ({
      kind: "school",
      id: String(school.id || school.name || ""),
      school,
      title: school.nickname || school.name,
      subtitle: `${school.dayOfWeek || school.day || "Dance day not set"} · ${school.timeBlock || "Time not set"}`
    }));
    const classChoices = classRecords.map((rosterClass) => ({
      kind: "class",
      id: String(rosterClass.id || ""),
      rosterClass,
      title: rosterClass.name || "Dance class",
      subtitle: `${typeof rosterSchoolNickname === "function" ? rosterSchoolNickname(rosterClass.schoolName) : rosterClass.schoolName || "School not assigned"} · ${typeof rosterTeacherName === "function" ? rosterTeacherName(rosterClass.teacherId) : "Teacher not assigned"}`
    }));
    const enrollmentRecords = (Array.isArray(enrollmentIntakeQueue) ? enrollmentIntakeQueue : []).map((enrollment) => ({
      kind: "enrollment",
      id: String(enrollment.id || ""),
      enrollment,
      title: `${enrollment.student_preferred_name || enrollment.student_first_name || "New"} ${enrollment.student_last_name || "Dancer"}`.trim(),
      subtitle: `${enrollment.requested_school_name || "School not matched"} · New enrollment`
    }));
    return { classRecords, studentRecords, teacherRecords, schoolRecords, classChoices, enrollmentRecords };
  };

  const scoreRecord = (record, query) => {
    const needle = normalize(query);
    const title = normalize(record.title);
    const subtitle = normalize(record.subtitle);
    if (!needle) return 0;
    if (title === needle) return 100;
    if (title.startsWith(needle)) return 80;
    if (title.includes(needle)) return 65;
    if (`${title} ${subtitle}`.includes(needle)) return 45;
    return 0;
  };

  const resolve = (records, query) => records
    .map((record) => ({ record, score: scoreRecord(record, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title));

  const openRecord = (record) => {
    if (!record) return;
    state.context.lastEntityType = record.kind;
    state.context.lastEntityId = record.id;
    saveContext();
    if (record.kind === "student" && typeof openRosterStudentEditor === "function") {
      openRosterStudentEditor(record.rosterClass, record.student);
      respond(personality.found, [record.title, record.subtitle]);
      return;
    }
    if (record.kind === "teacher" && typeof openTeacherProfile === "function") {
      openTeacherProfile(record.id);
      respond(personality.found, [record.title]);
      return;
    }
    if (record.kind === "school") {
      openAdminSection("school-library");
      window.setTimeout(() => {
        const card = [...document.querySelectorAll("[data-school-library-id], [data-school-id]")].find((item) => (
          item.dataset.schoolLibraryId === record.id || item.dataset.schoolId === record.id
        ));
        card?.scrollIntoView({ block: "center", behavior: state.reduceMotion ? "auto" : "smooth" });
      }, 80);
      respond(personality.found, [record.title, record.subtitle]);
      return;
    }
    if (record.kind === "class") {
      openAdminSection("classes-rosters");
      rosterSearchTerm = record.rosterClass.name || "";
      const search = document.getElementById("roster-search");
      if (search) search.value = rosterSearchTerm;
      renderClassesAndRosters();
      respond(personality.found, [record.title, record.subtitle]);
      return;
    }
    if (record.kind === "enrollment") {
      openAdminSection("student-library");
      selectedEnrollmentIntakeId = record.id;
      enrollmentReviewOpen = true;
      renderEnrollmentQueue();
      respond(personality.found, [record.title, record.subtitle]);
    }
  };

  const routeTo = (section, label) => {
    if (typeof openAdminSection !== "function") return respond(personality.unavailable);
    openAdminSection(section);
    state.context.currentSection = section;
    saveContext();
    respond(personality.route, [label], "I’ll take you there.");
  };

  const birthdaysThisWeek = () => {
    const records = currentRecords().studentRecords.filter(({ student }) => (
      typeof birthdayFallsThisWeek === "function" && birthdayFallsThisWeek(student.birthdate)
    ));
    routeTo("student-library", "Dancer Directory");
    if (!records.length) return respond("I checked the dancers currently loaded.", ["No dancer birthdays are listed for this week."]);
    const names = records.slice(0, 8).map((record) => record.title);
    respond("I found this week’s birthdays.", [`${records.length} dancer${records.length === 1 ? "" : "s"}`, names.join(" · ")]);
  };

  const localDateKey = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const scheduleSnapshotForToday = (teacherId = "") => {
    const day = new Date().toLocaleDateString("en-US", { weekday: "long" });
    const dateKey = localDateKey();
    const records = currentRecords();
    const relevantTeachers = records.teacherRecords
      .filter((record) => !teacherId || record.id === teacherId)
      .map((record) => record.teacher);
    const changes = relevantTeachers.flatMap((teacher) => (teacher.reschedules || []).map((item) => ({ teacher, item })));
    const regular = records.classRecords.filter((item) => (
      item.day === day
      && (!teacherId || item.teacherId === teacherId)
      && !changes.some(({ item: change }) => (
        change.originalDate === dateKey
        && ["cancelled", "rescheduled", "date_tbd"].includes(change.status)
        && (!change.schoolName || normalize(change.schoolName) === normalize(item.schoolName)
          || normalize(change.schoolName) === normalize(typeof rosterSchoolNickname === "function" ? rosterSchoolNickname(item.schoolName) : item.schoolName))
      ))
    ));
    const makeups = changes.filter(({ item }) => item.status === "rescheduled" && item.newDate === dateKey);
    const removed = changes.filter(({ item }) => item.originalDate === dateKey && ["cancelled", "rescheduled", "date_tbd"].includes(item.status));
    return { day, dateKey, regular, makeups, removed };
  };

  const outstandingBalances = () => {
    const { studentRecords } = currentRecords();
    const outstanding = studentRecords.filter(({ student }) => (
      payrollState?.outstandingStudents?.[student.id]?.selected
      && !payrollState?.clearedBalances?.[student.id]
    )).map((record) => ({
      ...record,
      amount: Number(payrollState.outstandingStudents[record.student.id]?.amount || 0)
    }));
    routeTo("finance-folio", "Finance Folio");
    if (!outstanding.length) {
      return respond("I checked the current Finance Folio.", ["No authoritative unpaid tuition balances are marked in the loaded records."]);
    }
    const total = outstanding.reduce((sum, item) => sum + item.amount, 0);
    respond("I found the balances currently marked outstanding.", [
      `${outstanding.length} dancer${outstanding.length === 1 ? "" : "s"}`,
      `$${total.toFixed(2)} total recorded`
    ], "Finance Folio is open for your review.");
  };

  const todaySchedule = () => {
    const { day, regular: classes, makeups, removed } = scheduleSnapshotForToday();
    routeTo("master-my-day", "Today’s Schedule");
    if (!classes.length && !makeups.length && !removed.length) return respond("I checked today’s loaded schedule.", [`No regular classes are listed for ${day}.`]);
    const classFacts = classes.slice(0, 7).map((item) => `${item.time || "Time not set"} · ${typeof rosterSchoolNickname === "function" ? rosterSchoolNickname(item.schoolName) : item.schoolName} · ${typeof rosterTeacherName === "function" ? rosterTeacherName(item.teacherId) : "Teacher not assigned"}`);
    const makeupFacts = makeups.map(({ teacher, item }) => `Make-up · ${item.schoolName || "School not listed"} · ${teacher.displayName || fullName(teacher)}`);
    respond("Here’s what is currently listed for today.", [
      `${classes.length} regular class${classes.length === 1 ? "" : "es"}`,
      ...classFacts,
      ...makeupFacts
    ], removed.length ? `${removed.length} regular class change${removed.length === 1 ? "" : "s"} was accounted for.` : "");
  };

  const teacherSchedule = (record) => {
    const teacher = record.teacher;
    const { day, regular: todayClasses, makeups, removed } = scheduleSnapshotForToday(teacher.id);
    if (!todayClasses.length && !makeups.length) {
      respond(personality.found, [record.title, `No active classes are listed for ${day}.`], removed.length ? `${removed.length} schedule exception${removed.length === 1 ? " is" : "s are"} already accounted for.` : "");
      return;
    }
    respond(personality.found, [
      record.title,
      ...todayClasses.map((item) => `${item.time || "Time not set"} · ${typeof rosterSchoolNickname === "function" ? rosterSchoolNickname(item.schoolName) : item.schoolName} · ${item.name}`),
      ...makeups.map(({ item }) => `Make-up · ${item.schoolName || "School not listed"}`)
    ], removed.length ? `${removed.length} regular schedule exception${removed.length === 1 ? " is" : "s are"} already accounted for.` : "");
  };

  const classFacts = (record) => {
    const enrolled = (record.rosterClass.students || []).filter((student) => student.status === "enrolled").length;
    respond(personality.found, [
      record.title,
      record.subtitle,
      `${enrolled} enrolled · ${record.rosterClass.capacity || "No"} capacity`
    ]);
  };

  const studentFacts = (record) => {
    const teacher = typeof rosterTeacherName === "function" ? rosterTeacherName(record.rosterClass.teacherId) : "Teacher not assigned";
    respond(personality.found, [record.title, record.subtitle, teacher]);
  };

  const parentMatches = (query) => {
    const needle = normalize(query);
    const records = currentRecords().studentRecords.filter(({ student }) => {
      const parentName = normalize(`${student.parentFirstName || ""} ${student.parentLastName || ""}`);
      const email = normalize(student.parentEmail || "");
      const phone = normalize(student.parentPhone || "");
      return needle && (parentName.includes(needle) || email.includes(needle) || phone.includes(needle));
    });
    const grouped = new Map();
    records.forEach((record) => {
      const student = record.student;
      const key = normalize(student.parentEmail || student.parentPhone || `${student.parentFirstName || ""} ${student.parentLastName || ""}`);
      if (!key) return;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(record);
    });
    return [...grouped.values()];
  };

  const findEntity = (kind, query, { answerOnly = false } = {}) => {
    const records = currentRecords();
    const source = kind === "student" ? records.studentRecords
      : kind === "teacher" ? records.teacherRecords
      : kind === "school" ? records.schoolRecords
      : kind === "class" ? records.classChoices
      : records.enrollmentRecords;
    const matches = resolve(source, query);
    if (!matches.length) return respond("I didn’t find a clear match in the records currently loaded.", [], "Try a full name, school nickname, or class name.");
    const strongest = matches[0].score;
    const closeMatches = matches.filter((item) => item.score >= Math.max(45, strongest - 15)).map((item) => item.record);
    if (closeMatches.length > 1 || strongest < 65) return showChoices("I found a few possibilities.", closeMatches.slice(0, 8));
    const record = matches[0].record;
    if (answerOnly && kind === "student") return studentFacts(record);
    if (answerOnly && kind === "teacher") return teacherSchedule(record);
    if (answerOnly && kind === "class") return classFacts(record);
    openRecord(record);
  };

  const findParent = (query) => {
    const groups = parentMatches(query);
    if (!groups.length) return respond("I didn’t find a parent match using the current contact records.", [], "Try the parent’s full name, email, or phone number.");
    if (groups.length > 1) {
      const choices = groups.map((children, index) => ({
        kind: "parent-group",
        id: `parent-${index}`,
        title: `${children[0].student.parentFirstName || ""} ${children[0].student.parentLastName || ""}`.trim() || "Parent",
        subtitle: children.map((record) => record.title).join(" · "),
        children
      }));
      return showChoices("I found a few parent records.", choices);
    }
    const children = groups[0];
    respond(personality.found, [
      `${children[0].student.parentFirstName || ""} ${children[0].student.parentLastName || ""}`.trim() || "Parent",
      children.map((record) => record.title).join(" · ")
    ]);
  };

  const openNewsletterSafely = () => {
    routeTo("newsletter-studio", "Newsletter Studio");
    respond(personality.newsletter, [], personality.review);
  };

  const applyDashboardFilter = (target, query) => {
    const records = currentRecords();
    const teacherMatch = resolve(records.teacherRecords, query)[0]?.record;
    const schoolMatch = resolve(records.schoolRecords, query)[0]?.record;
    if (target === "classes") {
      openAdminSection("classes-rosters");
      if (teacherMatch) {
        rosterTeacherFilter = teacherMatch.id;
        rosterSchoolFilter = "all";
        rosterSearchTerm = "";
        renderClassesAndRosters();
        return respond(personality.found, [`Classes for ${teacherMatch.title}`]);
      }
      if (schoolMatch) {
        const schoolClassName = records.classRecords.find((item) => normalize(item.schoolName) === normalize(schoolMatch.school.name)
          || normalize(item.schoolName) === normalize(schoolMatch.school.nickname))?.schoolName || schoolMatch.school.name;
        rosterSchoolFilter = schoolClassName;
        rosterTeacherFilter = "all";
        rosterSearchTerm = "";
        renderClassesAndRosters();
        return respond(personality.found, [`Classes at ${schoolMatch.title}`]);
      }
    }
    if (target === "students") {
      openAdminSection("student-library");
      if (teacherMatch || schoolMatch) {
        window.setTimeout(() => {
          const control = teacherMatch
            ? document.getElementById("student-library-teacher")
            : document.getElementById("student-library-school");
          if (!control) return;
          const wanted = teacherMatch
            ? teacherMatch.id
            : [...control.options].find((option) => normalize(option.value) === normalize(schoolMatch.school.name)
              || normalize(option.value) === normalize(schoolMatch.school.nickname))?.value;
          if (wanted) {
            control.value = wanted;
            renderStudentLibrary();
          }
        }, 40);
        return respond(personality.found, [teacherMatch ? `Dancers for ${teacherMatch.title}` : `Dancers at ${schoolMatch.title}`]);
      }
    }
    if (target === "enrollments") {
      openAdminSection("student-library");
      if (teacherMatch) enrollmentTeacherFilter = teacherMatch.id;
      else if (schoolMatch) enrollmentSchoolFilter = schoolMatch.school.name || schoolMatch.school.nickname;
      else return respond("I didn’t find a clear teacher or school match for that filter.");
      renderEnrollmentQueue();
      return respond(personality.found, [teacherMatch ? `Enrollments for ${teacherMatch.title}` : `Enrollments at ${schoolMatch.title}`]);
    }
    if (target === "schools" && teacherMatch) {
      openAdminSection("school-library");
      schoolLibraryFilters.teacher = teacherMatch.id;
      renderSchoolLibrary();
      return respond(personality.found, [`Partner schools for ${teacherMatch.title}`]);
    }
    if (target === "balances" && teacherMatch) {
      openAdminSection("finance-folio");
      payrollState.filters ||= {};
      payrollState.filters.outstanding = { ...(payrollState.filters.outstanding || {}), teacher: teacherMatch.id };
      renderPayrollLanding();
      return respond(personality.found, [`Outstanding balances for ${teacherMatch.title}`], "Finance Folio is open for your review.");
    }
    respond("I didn’t find a clear match for that filter.", [], "Try the full teacher name or school nickname.");
  };

  const openCreateClassReview = () => {
    routeTo("classes-rosters", "Classes & Rosters");
    showReview("Create a class", "I’ll open the existing class form. Nothing will be saved until you review and choose Create Class in that form.", "Open class form", () => {
      if (typeof openRosterClassCreator === "function") openRosterClassCreator();
      else document.getElementById("add-roster-class")?.click();
      const opened = document.getElementById("roster-class-create-overlay")?.classList.contains("active");
      if (opened) respond(personality.review, ["Class form opened"], "No class has been created yet.");
      else respond("The class form isn’t available with the teacher records currently loaded.", [], "Classes & Rosters is open so you can check the teacher’s live profile.");
    });
  };

  const parseIntent = (raw) => {
    const text = String(raw || "").trim();
    const normalized = normalize(text);
    if (!normalized) return { kind: "empty" };
    if (/\b(send|email|newsletter)\b/.test(normalized)) return { kind: "newsletter" };
    if (/\b(create|add|new)\b.*\bclass\b/.test(normalized)) return { kind: "create-class", risk: "review" };
    if (/\b(unpaid|outstanding|tuition balance|balances)\b/.test(normalized)) return { kind: "unpaid" };
    if (/\bbirthday/.test(normalized)) return { kind: "birthdays" };
    if (/\b(today|todays)\b.*\b(schedule|classes|class)\b|\bopen today/.test(normalized)) return { kind: "today" };
    const filterMatch = text.match(/(?:show|view|filter)\s+(dancers|students|classes|enrollments|schools|balances)\s+(?:at|for|by)\s+(.+)/i);
    if (filterMatch) {
      return {
        kind: "filter",
        target: ["dancers", "students"].includes(filterMatch[1].toLowerCase()) ? "students" : filterMatch[1].toLowerCase(),
        query: filterMatch[2]
      };
    }
    const parent = text.match(/(?:find|show|open|children of|dancers for)\s+(?:parent\s+)?(.+?)(?:\s+parent)?$/i);
    if (/\bparent\b|\bchildren of\b/.test(normalized) && parent?.[1]) return { kind: "find-parent", query: parent[1] };
    const typed = [
      ["student", /(?:find|show|open|where is|what school is)\s+(?:a\s+)?(?:dancer|student)\s+(.+)/i],
      ["teacher", /(?:find|show|open|where is|schedule for|classes for)\s+(?:a\s+)?teacher\s+(.+)/i],
      ["school", /(?:find|show|open)\s+(?:a\s+)?school\s+(.+)/i],
      ["class", /(?:find|show|open|how many (?:dancers|students) (?:are )?in)\s+(?:a\s+)?class\s+(.+)/i],
      ["enrollment", /(?:find|show|open)\s+(?:an?\s+)?enrollment\s+(.+)/i]
    ];
    for (const [entity, pattern] of typed) {
      const match = text.match(pattern);
      if (match?.[1]) return { kind: "find", entity, query: match[1], answerOnly: /\b(where|schedule|classes for|how many|what school)\b/i.test(text) };
    }
    if (/\b(where is|schedule for|classes for)\b/.test(normalized)) {
      return {
        kind: "find",
        entity: "teacher",
        query: text.replace(/.*?(?:where is|schedule for|classes for)\s+/i, "").replace(/\s+(?:today|right now|now)\??$/i, ""),
        answerOnly: true
      };
    }
    const route = Object.entries(sectionAliases).sort((a, b) => b[0].length - a[0].length)
      .find(([alias]) => normalized.includes(normalize(alias)));
    if (route && /\b(open|go|take|show|view)\b/.test(normalized)) return { kind: "route", section: route[1], label: route[0] };
    if (/\b(delete|remove|publish|pay|mark paid|cancel|reschedule|change|assign)\b/.test(normalized)) return { kind: "mutation", risk: "review" };
    return { kind: "unsupported" };
  };

  const runIntent = (intent) => {
    state.context.lastIntent = intent.kind;
    saveContext();
    clearOutput();
    switch (intent.kind) {
      case "empty":
        return respond("Tell me what you’d like to find or open.");
      case "newsletter":
        return openNewsletterSafely();
      case "create-class":
        return openCreateClassReview();
      case "unpaid":
        return outstandingBalances();
      case "birthdays":
        return birthdaysThisWeek();
      case "today":
        return todaySchedule();
      case "filter":
        return applyDashboardFilter(intent.target, intent.query);
      case "find-parent":
        return findParent(intent.query);
      case "find":
        return findEntity(intent.entity, intent.query, { answerOnly: intent.answerOnly });
      case "route":
        return routeTo(intent.section, intent.label.replace(/\b\w/g, (char) => char.toUpperCase()));
      case "mutation":
        respond("I can help you get this ready.", [], "Changes need your review in the dashboard before anything is saved.");
        return showReview("Review required", "I won’t make this change silently. Open the related dashboard section and review it there.", "Open Director Dashboard", () => openAdminToolsHome());
      default:
        respond(personality.unsupported, [], "Try asking me to find a dancer, teacher, school, class, or open a dashboard section.");
    }
  };

  const sendCurrentInput = () => {
    const { input } = elements();
    const value = input?.value || "";
    if (input) input.value = "";
    runIntent(parseIntent(value));
  };

  const speechConstructor = () => window.SpeechRecognition || window.webkitSpeechRecognition;

  const stopListening = ({ send = false } = {}) => {
    if (state.recognition) {
      try { state.recognition.stop(); } catch (_) {}
    }
    state.listening = false;
    const { listening, mic, input } = elements();
    if (listening) listening.hidden = true;
    if (mic) mic.setAttribute("aria-pressed", "false");
    if (send) sendCurrentInput();
    else input?.focus();
  };

  const startListening = () => {
    const SpeechRecognition = speechConstructor();
    if (!SpeechRecognition) {
      respond("Your browser doesn’t offer dictation here yet.", [], "You can type your request in the box below.");
      return;
    }
    stopListening();
    const recognition = new SpeechRecognition();
    state.recognition = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    let finalTranscript = "";
    recognition.onstart = () => {
      state.listening = true;
      const { listening, mic } = elements();
      if (listening) listening.hidden = false;
      if (mic) mic.setAttribute("aria-pressed", "true");
    };
    recognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript || "";
        if (event.results[index].isFinal) finalTranscript += `${transcript} `;
        else interim += transcript;
      }
      const { input } = elements();
      if (input) input.value = `${finalTranscript}${interim}`.trim();
    };
    recognition.onerror = (event) => {
      stopListening();
      const denied = ["not-allowed", "service-not-allowed"].includes(event.error);
      respond(denied ? "Microphone access wasn’t allowed." : "Dictation paused before I caught that.", [], "You can keep typing your request below.");
    };
    recognition.onend = () => {
      state.listening = false;
      const { listening, mic } = elements();
      if (listening) listening.hidden = true;
      if (mic) mic.setAttribute("aria-pressed", "false");
    };
    try { recognition.start(); }
    catch (_) { respond("Dictation is already listening.", [], "Speak when you’re ready."); }
  };

  const stopTulleEvent = (event) => event.stopPropagation();

  const bindEvents = () => {
    const { root, launcher, panel } = elements();
    if (!root || root.dataset.bound === "true") return;
    root.dataset.bound = "true";
    ["input", "change", "click", "drop"].forEach((name) => root.addEventListener(name, stopTulleEvent));

    launcher?.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || window.innerWidth <= 640) return;
      const rect = root.getBoundingClientRect();
      state.dragging = true;
      state.moved = false;
      state.dragStartX = rect.left;
      state.dragStartY = rect.top;
      state.dragOffsetX = event.clientX - rect.left;
      state.dragOffsetY = event.clientY - rect.top;
      launcher.setPointerCapture(event.pointerId);
    });
    launcher?.addEventListener("pointermove", (event) => {
      if (!state.dragging) return;
      const next = clampPosition(event.clientX - state.dragOffsetX, event.clientY - state.dragOffsetY);
      state.moved = state.moved || Math.abs(state.dragStartX - next.left) > 3 || Math.abs(state.dragStartY - next.top) > 3;
      state.position = next;
      applyPosition();
      if (state.moved) saveUi();
    });
    launcher?.addEventListener("pointerup", (event) => {
      if (!state.dragging) return;
      state.dragging = false;
      launcher.releasePointerCapture(event.pointerId);
      if (state.moved) saveUi();
    });
    launcher?.addEventListener("click", () => {
      if (state.moved) { state.moved = false; return; }
      if (state.asleep) toggleSleep();
      else if (state.panelOpen) minimizePanel();
      else openPanel();
    });
    launcher?.addEventListener("keydown", (event) => {
      if (!event.altKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const rect = root.getBoundingClientRect();
      const delta = event.shiftKey ? 10 : 2;
      const left = rect.left + (event.key === "ArrowLeft" ? -delta : event.key === "ArrowRight" ? delta : 0);
      const top = rect.top + (event.key === "ArrowUp" ? -delta : event.key === "ArrowDown" ? delta : 0);
      state.position = clampPosition(left, top);
      applyPosition();
      saveUi();
    });

    root.querySelector("[data-tulle-sleep]")?.addEventListener("click", toggleSleep);
    root.querySelector("[data-tulle-minimize]")?.addEventListener("click", minimizePanel);
    root.querySelector("[data-tulle-close]")?.addEventListener("click", closePanel);
    root.querySelector("[data-tulle-send]")?.addEventListener("click", sendCurrentInput);
    root.querySelector("[data-tulle-mic]")?.addEventListener("click", startListening);
    root.querySelector("[data-tulle-stop]")?.addEventListener("click", () => stopListening());
    root.querySelector("[data-tulle-send-now]")?.addEventListener("click", () => stopListening({ send: true }));
    root.querySelector("[data-tulle-input]")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendCurrentInput();
      }
    });
    root.querySelector("[data-tulle-reduce-motion]")?.addEventListener("change", (event) => {
      state.reduceMotion = event.target.checked;
      saveUi();
      updateUiState();
    });
    root.addEventListener("click", (event) => {
      const quick = event.target.closest("[data-tulle-quick]");
      if (quick) {
        const actions = {
          newsletter: { kind: "newsletter" },
          "find-dancer": { kind: "empty" },
          unpaid: { kind: "unpaid" },
          "create-class": { kind: "create-class", risk: "review" },
          today: { kind: "today" },
          birthdays: { kind: "birthdays" }
        };
        if (quick.dataset.tulleQuick === "find-dancer") {
          respond("Absolutely—I can help with that.", [], "Type the dancer’s name below.");
          elements().input?.focus();
        } else runIntent(actions[quick.dataset.tulleQuick] || { kind: "unsupported" });
      }
      const choiceButton = event.target.closest("[data-tulle-choice]");
      if (choiceButton) {
        const record = state.choices.get(choiceButton.dataset.tulleChoice);
        if (record?.kind === "parent-group") respond(personality.found, [record.title, record.children.map((item) => item.title).join(" · ")]);
        else openRecord(record);
        elements().choices.hidden = true;
      }
      const reviewButton = event.target.closest("[data-tulle-review]");
      if (reviewButton) {
        const action = state.choices.get(reviewButton.dataset.tulleReview);
        if (typeof action?.run === "function") action.run();
        elements().review.hidden = true;
      }
    });
    panel?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        minimizePanel();
      }
    });
    window.addEventListener("resize", applyPosition);
  };

  const initialize = () => {
    buildShell();
    loadState();
    bindEvents();
    applyPosition();
    updateUiState();
  };

  document.addEventListener("dt-auth-ready", initialize);
  const authObserver = new MutationObserver(() => updateUiState());
  authObserver.observe(document.body, { attributes: true, attributeFilter: ["data-authenticated", "data-user-role", "data-tour-mode", "data-mode"] });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();

  window.dtTulle = Object.freeze({
    version: TULLE_VERSION,
    parseIntent,
    runIntent,
    open: openPanel,
    close: closePanel,
    isAuthorized,
    modelProvider,
    opportunityProvider
  });
})();

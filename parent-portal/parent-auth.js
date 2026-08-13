(function () {
  "use strict";

  const projectUrl = "https://pgagpvfiplizahsnmvxf.supabase.co";
  const publishableKey = "sb_publishable_ZypHy48w_5CFqkjpuRYCbA_802_MDed";
  const gate = document.getElementById("pp-auth-gate");
  const app = document.getElementById("pp-app");
  const views = {
    checking: document.getElementById("pp-auth-checking"),
    login: document.getElementById("pp-auth-login"),
    setup: document.getElementById("pp-auth-setup"),
    stopped: document.getElementById("pp-auth-stopped")
  };
  const setupRequested = new URLSearchParams(window.location.search).get("account-setup") === "1";
  let client = null;
  let openingSession = false;
  let activeSetupAccessToken = "";

  const showView = (name) => {
    Object.entries(views).forEach(([key, view]) => { if (view) view.hidden = key !== name; });
    document.documentElement.classList.remove("pp-family-open");
    gate.style.removeProperty("display");
    gate.hidden = false;
    app.hidden = true;
    app.setAttribute("aria-hidden", "true");
  };

  const revealFamilyPortal = () => {
    document.documentElement.classList.add("pp-family-open");
    gate.hidden = true;
    gate.setAttribute("aria-hidden", "true");
    gate.style.setProperty("display", "none", "important");
    app.hidden = false;
    app.setAttribute("aria-hidden", "false");
  };

  const stopSession = async (message) => {
    document.getElementById("pp-stopped-message").textContent = message || "This login is not linked to an active Parent Portal family.";
    showView("stopped");
  };

  const settleWithin = (promise, milliseconds, label) => Promise.race([
    promise,
    new Promise((_, reject) => window.setTimeout(() => reject(new Error(`${label} timed out`)), milliseconds))
  ]);

  const initials = (firstName, lastName) => `${String(firstName || "").trim().charAt(0)}${String(lastName || "").trim().charAt(0)}`.toUpperCase() || "DT";
  const dancerName = (student) => String(student?.preferred_name || student?.first_name || "Dancer").trim();
  const photoDialog = document.getElementById("dancer-photo-dialog");
  const photoInput = document.getElementById("dancer-photo-input");
  const photoImage = document.getElementById("dancer-photo-crop-image");
  const photoZoom = document.getElementById("dancer-photo-zoom");
  const photoStatus = document.getElementById("dancer-photo-status");
  let activePhotoStudent = null;
  let activePhotoObjectUrl = "";

  const closePhotoDialog = () => {
    photoDialog?.close();
    photoStatus.textContent = "";
    photoInput.value = "";
    if (activePhotoObjectUrl) URL.revokeObjectURL(activePhotoObjectUrl);
    activePhotoObjectUrl = "";
    activePhotoStudent = null;
  };

  const chooseDancerPhoto = (student) => {
    activePhotoStudent = student;
    photoInput.click();
  };

  const makeCroppedPhoto = () => new Promise((resolve, reject) => {
    if (!photoImage.naturalWidth || !photoImage.naturalHeight) return reject(new Error("Choose a photo first."));
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const zoom = Number(photoZoom.value || 100) / 100;
    const sourceSize = Math.min(photoImage.naturalWidth, photoImage.naturalHeight) / zoom;
    const sourceX = (photoImage.naturalWidth - sourceSize) / 2;
    const sourceY = (photoImage.naturalHeight - sourceSize) / 2;
    canvas.getContext("2d").drawImage(photoImage, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 512, 512);
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The photo could not be prepared.")), "image/jpeg", 0.9);
  });

  const updateCropPreview = () => {
    if (!photoImage.naturalWidth) return;
    const stage = document.getElementById("dancer-photo-stage");
    const size = stage.clientWidth;
    const baseScale = Math.max(size / photoImage.naturalWidth, size / photoImage.naturalHeight);
    const scale = baseScale * (Number(photoZoom.value || 100) / 100);
    photoImage.style.width = `${photoImage.naturalWidth * scale}px`;
    photoImage.style.height = `${photoImage.naturalHeight * scale}px`;
    photoImage.style.left = `${(size - photoImage.naturalWidth * scale) / 2}px`;
    photoImage.style.top = `${(size - photoImage.naturalHeight * scale) / 2}px`;
  };

  photoInput?.addEventListener("change", () => {
    const file = photoInput.files?.[0];
    if (!file || !activePhotoStudent) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type) || file.size > 5 * 1024 * 1024) {
      photoStatus.textContent = "Choose a JPG, PNG, or WebP photo smaller than 5 MB.";
      photoDialog.showModal();
      return;
    }
    activePhotoObjectUrl = URL.createObjectURL(file);
    photoImage.onload = () => { photoZoom.value = "100"; updateCropPreview(); };
    photoImage.src = activePhotoObjectUrl;
    photoDialog.showModal();
  });
  photoZoom?.addEventListener("input", updateCropPreview);
  document.getElementById("dancer-photo-cancel")?.addEventListener("click", closePhotoDialog);
  document.getElementById("dancer-photo-save")?.addEventListener("click", async () => {
    if (!client || !activePhotoStudent) return;
    const save = document.getElementById("dancer-photo-save");
    save.disabled = true;
    photoStatus.textContent = "Saving this sweet smile securely…";
    try {
      const blob = await makeCroppedPhoto();
      const path = `${activePhotoStudent.id}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await client.storage.from("student-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;
      const { error: linkError } = await client.rpc("set_parent_dancer_photo", { target_student_id: activePhotoStudent.id, target_photo_path: path });
      if (linkError) throw linkError;
      const { data } = await client.storage.from("student-photos").createSignedUrl(path, 3600);
      document.querySelectorAll(`[data-photo-student-id="${CSS.escape(activePhotoStudent.id)}"]`).forEach((bubble) => {
        const image = document.createElement("img");
        image.src = data?.signedUrl || activePhotoObjectUrl;
        image.alt = dancerName(activePhotoStudent);
        bubble.replaceChildren(image);
      });
      closePhotoDialog();
    } catch (error) {
      photoStatus.textContent = "That photo could not be saved. Please keep this window open and try once more.";
    } finally {
      save.disabled = false;
    }
  });

  const installInstructions = {
    iphone: {
      title: "Save on iPhone",
      steps: [
        "Open this Parent Portal page in Safari.",
        "Tap the Share button — the square with an upward arrow.",
        "Scroll down and tap Add to Home Screen.",
        "Tap Add. The Parent Portal will appear with your other apps."
      ],
      note: "If you opened the invitation inside Mail or another app, choose Open in Safari first."
    },
    android: {
      title: "Save on Android",
      steps: [
        "Open this Parent Portal page in Chrome.",
        "Tap the three-dot menu in the top-right corner.",
        "Tap Add to Home screen or Install app.",
        "Tap Install or Add to place the Parent Portal on your home screen."
      ],
      note: "The wording may be Add to Home screen or Install app, depending on your phone."
    }
  };

  const ensureInstallGuide = () => {
    let dialog = document.getElementById("pp-install-guide");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "pp-install-guide";
    dialog.className = "install-guide-dialog";
    dialog.setAttribute("aria-labelledby", "pp-install-guide-title");
    dialog.innerHTML = `
      <div class="install-guide-card">
        <div class="install-guide-mark" aria-hidden="true">🎀</div>
        <h2 id="pp-install-guide-title">Save Your Parent Portal</h2>
        <p class="install-guide-intro">Keep Dance Techniques one tap away. Which kind of phone are you using?</p>
        <div class="install-device-choices" role="group" aria-label="Choose your phone type">
          <button class="install-device-choice" type="button" data-install-device="iphone"><span aria-hidden="true">◉</span>iPhone</button>
          <button class="install-device-choice" type="button" data-install-device="android"><span aria-hidden="true">◆</span>Android</button>
        </div>
        <section class="install-instructions" id="pp-install-instructions" aria-live="polite" hidden>
          <h3></h3><ol class="install-steps"></ol><p class="install-guide-note"></p>
        </section>
        <div class="install-guide-actions">
          <button class="soft-button" type="button" data-install-later>Maybe Later</button>
          <button class="berry-button" type="button" data-install-done hidden>I Added It</button>
        </div>
      </div>`;
    document.body.append(dialog);
    dialog.querySelectorAll("[data-install-device]").forEach((button) => button.addEventListener("click", () => {
      const guide = installInstructions[button.dataset.installDevice];
      dialog.querySelectorAll("[data-install-device]").forEach((choice) => choice.setAttribute("aria-pressed", String(choice === button)));
      const instructions = dialog.querySelector("#pp-install-instructions");
      instructions.querySelector("h3").textContent = guide.title;
      instructions.querySelector(".install-steps").replaceChildren(...guide.steps.map((step) => {
        const item = document.createElement("li");
        item.textContent = step;
        return item;
      }));
      instructions.querySelector(".install-guide-note").textContent = guide.note;
      instructions.hidden = false;
      dialog.querySelector("[data-install-done]").hidden = false;
      instructions.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }));
    dialog.querySelector("[data-install-later]").addEventListener("click", () => dialog.close("later"));
    dialog.querySelector("[data-install-done]").addEventListener("click", () => dialog.close("done"));
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close("later"); });
    return dialog;
  };

  const showFirstLoginInstallGuide = () => {
    const dialog = ensureInstallGuide();
    dialog.querySelector("#pp-install-instructions").hidden = true;
    dialog.querySelector("[data-install-done]").hidden = true;
    dialog.querySelectorAll("[data-install-device]").forEach((choice) => choice.setAttribute("aria-pressed", "false"));
    dialog.showModal();
    window.setTimeout(() => dialog.querySelector("[data-install-device='iphone']")?.focus(), 0);
  };

  const loadClassPosts = async () => {
    const { data, error } = await client.functions.invoke("parent-portal-class-feed", { body: {} });
    if (error || !data?.ok) throw error || new Error(data?.message || "Class feed unavailable");
    return Array.isArray(data.posts) ? data.posts : [];
  };

  const loadNewsletters = async () => {
    const { data, error } = await client
      .from("parent_portal_newsletters")
      .select("id,subject,body,sent_at,source,read_at")
      .order("sent_at", { ascending: false });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  };

  const renderNewsletterArchive = (newsletters) => {
    const panel = document.getElementById("archive");
    const archiveTab = document.querySelector('[data-message-tab="archive"]');
    panel.replaceChildren();
    archiveTab?.querySelector(".newsletter-unread-dot")?.remove();
    if (!newsletters.length) {
      panel.innerHTML = '<p class="payment-empty">No newsletters are available for this family yet.</p>';
      return;
    }
    const refreshUnreadCount = () => {
      const unreadCount = newsletters.filter((newsletter) => !newsletter.read_at).length;
      let dot = archiveTab?.querySelector(".newsletter-unread-dot");
      if (!unreadCount) {
        dot?.remove();
        return;
      }
      if (!dot && archiveTab) {
        dot = document.createElement("span");
        dot.className = "unread newsletter-unread-dot";
        archiveTab.append(dot);
      }
      dot.textContent = String(unreadCount);
      dot.setAttribute("aria-label", `${unreadCount} unread newsletter${unreadCount === 1 ? "" : "s"}`);
    };
    refreshUnreadCount();
    newsletters.forEach((newsletter) => {
      const details = document.createElement("details");
      details.className = `newsletter-card${newsletter.read_at ? "" : " is-unread"}`;
      const summary = document.createElement("summary");
      const subject = document.createElement("strong");
      subject.textContent = newsletter.subject;
      const sent = document.createElement("span");
      sent.className = "date";
      sent.textContent = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(newsletter.sent_at));
      summary.append(subject);
      if (!newsletter.read_at) {
        const unread = document.createElement("span");
        unread.className = "unread newsletter-unread-indicator";
        unread.textContent = "1";
        unread.setAttribute("aria-label", "Unread newsletter");
        summary.append(unread);
      }
      summary.append(sent);
      const body = document.createElement("div");
      body.className = "newsletter-archive-copy";
      String(newsletter.body || "").split(/\n{2,}/).filter(Boolean).forEach((paragraph) => {
        const copy = document.createElement("p");
        copy.textContent = paragraph;
        body.append(copy);
      });
      details.append(summary, body);
      details.addEventListener("toggle", async () => {
        if (!details.open || newsletter.read_at || !client) return;
        const { data, error } = await client.rpc("mark_parent_portal_newsletter_read", { target_newsletter_id: newsletter.id });
        if (error || data !== true) return;
        newsletter.read_at = new Date().toISOString();
        details.classList.remove("is-unread");
        details.querySelector(".newsletter-unread-indicator")?.remove();
        refreshUnreadCount();
      });
      panel.append(details);
    });
  };

  const appendPostInlineFormatting = (element, text) => {
    const value = String(text || "");
    const pattern = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;
    let cursor = 0;
    for (const match of value.matchAll(pattern)) {
      if (match.index > cursor) element.append(document.createTextNode(value.slice(cursor, match.index)));
      const token = match[0];
      const formatted = document.createElement(token.startsWith("**") ? "strong" : "em");
      formatted.textContent = token.startsWith("**") ? token.slice(2, -2) : token.slice(1, -1);
      element.append(formatted);
      cursor = match.index + token.length;
    }
    if (cursor < value.length) element.append(document.createTextNode(value.slice(cursor)));
  };

  const appendPostBody = (container, value) => {
    String(value || "").replace(/\r\n?/g, "\n").split(/\n{2,}/).filter((block) => block.trim()).forEach((block) => {
      const lines = block.split("\n");
      if (lines.every((line) => /^\s*-\s+/.test(line))) {
        const list = document.createElement("ul");
        lines.forEach((line) => {
          const item = document.createElement("li");
          appendPostInlineFormatting(item, line.replace(/^\s*-\s+/, ""));
          list.append(item);
        });
        container.append(list);
      } else {
        const paragraph = document.createElement("p");
        lines.forEach((line, index) => {
          if (index) paragraph.append(document.createElement("br"));
          appendPostInlineFormatting(paragraph, line);
        });
        container.append(paragraph);
      }
    });
  };

  const renderClassFeed = (posts, selectedStudentId) => {
    const feed = document.querySelector(".feed");
    const visiblePosts = posts.filter((post) => Array.isArray(post.studentIds) && post.studentIds.includes(selectedStudentId));
    feed.replaceChildren();
    if (!visiblePosts.length) {
      feed.innerHTML = '<img class="family-updates-empty" src="assets/feed/family-updates-empty.png?v=4" alt="The magic will appear here. Photos, class moments, celebrations, and special updates from your dancer’s day will appear here.">';
      return;
    }
    visiblePosts.forEach((post) => {
      const article = document.createElement("article");
      article.className = "post class-feed-post";
      const head = document.createElement("div");
      head.className = "post-head";
      const avatar = document.createElement("span");
      avatar.className = "class-post-avatar";
      avatar.style.backgroundColor = post.teacherColor || "#DBA9A1";
      avatar.textContent = initials(post.teacherName, "").slice(0, 2);
      const heading = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = post.title || "Dance Class Update";
      const audience = document.createElement("small");
      audience.textContent = `${post.className || "Dance Class"} · Class Feed`;
      heading.append(title, audience);
      const time = document.createElement("time");
      time.dateTime = post.publishedAt || "";
      time.textContent = post.publishedAt ? new Date(post.publishedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
      head.append(avatar, heading, time);
      const image = document.createElement("img");
      image.className = "class-post-image";
      image.src = post.imageUrl;
      image.alt = `Class update from ${post.teacherName || "Dance Techniques"}`;
      article.append(head, image);
      if (post.caption) {
        const copy = document.createElement("div");
        copy.className = "post-copy";
        appendPostBody(copy, post.caption);
        article.append(copy);
      }
      feed.append(article);
    });
  };

  const renderTruthfulEmptyStates = (context, classPosts = [], newsletters = []) => {
    const guardian = context.guardian;
    const students = context.students;
    const guardianInitials = initials(guardian.first_name, guardian.last_name);
    const firstStudent = students[0];
    const firstName = dancerName(firstStudent);

    document.querySelectorAll(".preview").forEach((node) => node.remove());
    document.querySelector(".profile-button .mini-avatar").textContent = guardianInitials;
    const homeWelcome = document.querySelector("#home > .welcome, .dancer-feedback-row > .welcome");
    homeWelcome.querySelector("h1").textContent = `Bonjour, ${guardian.first_name || guardian.full_name || "Dance Family"}!`;
    homeWelcome.querySelector("p").textContent = students.length === 1
      ? `Stay in Step with ${firstName}’s Dance Day`
      : `Here is ${firstName}’s Dance Techniques home.`;

    const switcher = document.getElementById("dancer-switcher");
    switcher.replaceChildren(...students.map((student, index) => {
      const button = document.createElement("button");
      const name = dancerName(student);
      button.className = "dancer-choice";
      button.type = "button";
      button.dataset.dancer = name;
      button.dataset.dancerId = student.id;
      button.setAttribute("aria-pressed", String(index === 0));
      const avatar = document.createElement("span");
      avatar.className = "dancer-avatar";
      avatar.textContent = initials(student.first_name, student.last_name);
      const label = document.createElement("strong");
      label.textContent = name;
      button.append(avatar, label);
      button.addEventListener("click", () => {
        switcher.querySelectorAll(".dancer-choice").forEach((choice) => choice.setAttribute("aria-pressed", String(choice === button)));
        document.querySelector(".welcome p").textContent = `Here is ${name}’s Dance Techniques home.`;
        renderClassFeed(classPosts, student.id);
      });
      return button;
    }));
    switcher.hidden = students.length < 2;

    const dancerFeedbackRow = document.querySelector(".dancer-feedback-row");
    const welcomeAnchor = document.getElementById("home-welcome-anchor");
    dancerFeedbackRow.classList.toggle("single-dancer", students.length === 1);
    if (students.length === 1) dancerFeedbackRow.append(homeWelcome);
    else welcomeAnchor.after(homeWelcome);

    const today = document.querySelector(".today");
    today.innerHTML = '<span class="eyebrow">Family schedule</span><h2>Schedule Connection in Progress</h2><p>No class schedule is displayed until its authorized Parent Portal data source is connected.</p>';
    renderClassFeed(classPosts, firstStudent.id);
    const feedFirstName = String(firstStudent.first_name || firstName).trim();
    const feedTitle = document.querySelector(".section-head h2");
    feedTitle.classList.add("dancer-feed-title");
    feedTitle.textContent = `✦ ${feedFirstName} ✦`;
    document.querySelector(".section-head button")?.remove();

    ["alerts", "threads", "forms"].forEach((id) => {
      const panel = document.getElementById(id);
      if (panel) panel.innerHTML = `<p class="payment-empty">No ${id === "archive" ? "newsletters" : id} are available for this family yet.</p>`;
    });
    renderNewsletterArchive(newsletters);
    const calendar = document.getElementById("monthly-calendar");
    calendar.innerHTML = '<p class="payment-empty">No authorized class schedule is available yet.</p>';
    document.getElementById("calendar-page-title").textContent = `${firstName}’s Dance Days`;

    const paymentsGrid = document.querySelector(".payments-grid");
    paymentsGrid.innerHTML = '<article class="payment-card wide"><small>Family tuition</small><h2>No Tuition Account Connected Yet</h2><p class="payment-empty">Only verified charges, credits, payment-method status, and receipts for this family will appear here after secure billing is connected.</p></article>';

    const profileCard = document.querySelector("#profile .profile-card");
    profileCard.innerHTML = `
      <span class="avatar">${guardianInitials}</span>
      <h2></h2>
      <p></p>
      <section class="family-dancers" aria-labelledby="family-dancers-title">
        <h3 id="family-dancers-title">My Dancers</h3>
        <div class="family-dancer-grid"></div>
      </section>
      <div class="profile-list"><button type="button" id="pp-sign-out">Sign Out <span>›</span></button></div>`;
    profileCard.querySelector("h2").textContent = guardian.full_name || [guardian.first_name, guardian.last_name].filter(Boolean).join(" ") || "Parent Portal Family";
    profileCard.querySelector("p").textContent = `Authorized family access for ${students.map(dancerName).join(" and ")}.`;
    const dancerGrid = profileCard.querySelector(".family-dancer-grid");
    students.forEach((student) => {
      const card = document.createElement("article");
      const name = dancerName(student);
      card.className = "family-dancer-card";
      card.innerHTML = `<button class="family-dancer-bubble" type="button" aria-label="Add or change dancer profile photo"></button><strong></strong><small>Tap the photo to add or change it</small>`;
      const bubble = card.querySelector(".family-dancer-bubble");
      bubble.dataset.photoStudentId = student.id;
      if (student.photoUrl) {
        const image = document.createElement("img");
        image.src = student.photoUrl;
        image.alt = name;
        bubble.append(image);
      } else bubble.textContent = initials(student.first_name, student.last_name);
      bubble.addEventListener("click", () => chooseDancerPhoto(student));
      card.querySelector("strong").textContent = name;
      dancerGrid.append(card);
    });
    document.getElementById("pp-sign-out").addEventListener("click", async () => {
      await client.auth.signOut();
      window.location.assign("/parent-portal/");
    });
  };

  const openFamilyPortal = async ({ activate = false } = {}) => {
    if (openingSession) return;
    openingSession = true;
    const rpcName = activate ? "activate_parent_portal_account" : "parent_portal_account_context";
    let context = null;
    let error = null;
    try {
      const result = await settleWithin(client.rpc(rpcName), 12000, "Family account check");
      context = result.data;
      error = result.error;
    } catch (requestError) {
      error = requestError;
    }
    openingSession = false;
    if (error || !context?.guardian || !Array.isArray(context.students) || !context.students.length) {
      const timedOut = String(error?.message || "").includes("timed out");
      if (!timedOut) await client.auth.signOut();
      await stopSession(timedOut
        ? "Your family account is connected, but it took too long to open. Check your connection and tap Return to Log In to try again."
        : "This login is not linked to an active dancer and adult profile. No other family information was opened. Please contact Dance Techniques.");
      return;
    }
    // Open the authorized family shell immediately. Optional content must never
    // hold navigation on the "Opening" screen.
    renderTruthfulEmptyStates(context, [], []);
    history.replaceState({}, "", "/parent-portal/");
    revealFamilyPortal();
    if (activate) showFirstLoginInstallGuide();
    const loadDancerPhotos = Promise.allSettled((context.students || []).map(async (student) => {
      if (!student.photo_path) return;
      const { data } = await settleWithin(client.storage.from("student-photos").createSignedUrl(student.photo_path, 3600), 5000, "Dancer photo");
      student.photoUrl = data?.signedUrl || "";
    }));
    Promise.allSettled([
      settleWithin(loadClassPosts(), 8000, "Class feed"),
      settleWithin(loadNewsletters(), 8000, "Newsletter archive"),
      loadDancerPhotos
    ]).then((results) => {
      const classPosts = results[0].status === "fulfilled" ? results[0].value : [];
      const newsletters = results[1].status === "fulfilled" ? results[1].value : [];
      if (results[0].status === "rejected") console.warn("Class feed is temporarily unavailable.");
      if (results[1].status === "rejected") console.warn("Newsletters are temporarily unavailable.");
      renderTruthfulEmptyStates(context, classPosts, newsletters);
    });
  };

  const friendlyLoginError = (error) => {
    const copy = String(error?.message || "").toLowerCase();
    if (copy.includes("invalid login credentials")) return "That email or password doesn’t match an invited Parent Portal account.";
    if (copy.includes("email not confirmed")) return "Open the secure invitation from Dance Techniques before logging in.";
    if (copy.includes("failed to fetch")) return "We couldn’t reach the secure portal. Check your connection and try again.";
    return "The Parent Portal couldn’t sign in. Please try again or contact Dance Techniques for a new secure invitation.";
  };

  const initialize = async () => {
    const familyPreview = new URLSearchParams(window.location.search).get("family-preview");
    if (familyPreview === "elena") {
      const previewCurriculumStyle = /tap/i.test(new URLSearchParams(window.location.search).get("curriculum") || "") ? "Tap" : "Ballet";
      const previewCurriculumIcon = previewCurriculumStyle === "Tap" ? "tap-day.png" : "ballet-day.png";
      renderTruthfulEmptyStates({
        guardian: { first_name: "Erik", last_name: "Mancol-Bilbo", full_name: "Erik Mancol-Bilbo" },
        students: [{ id: "elena-preview", first_name: "Elena Eden", last_name: "Mancol-Bilbo" }]
      }, [], []);
      const classSummary = document.querySelector(".today");
      classSummary.classList.add("class-summary");
      classSummary.innerHTML = `
        <img class="class-summary-art" src="assets/curriculum/${previewCurriculumIcon}" alt="${previewCurriculumStyle} Day">
        <div class="class-summary-copy">
          <span class="eyebrow">Elena’s class</span>
          <h2>Thursday <span class="class-time-dot">•</span> Morning</h2>
          <p>Primrose Rowlett · ${previewCurriculumStyle} with Ms. Lexi</p>
          <button class="class-summary-link" type="button" data-page="calendar"><img src="assets/navigation/calendar.png" alt=""><strong>View full schedule</strong><span aria-hidden="true">›</span></button>
        </div>`;
      document.getElementById("monthly-calendar").innerHTML = `
        <article class="calendar-card">
          <div class="calendar-title"><h2>Regular Dance Day</h2><span class="tag">Thursday</span></div>
          <h3>Primrose Rowlett · Class 5</h3>
          <p>Morning class with Ms. Lexi</p>
        </article>`;
      revealFamilyPortal();
      return;
    }
    if (!window.supabase?.createClient) {
      await stopSession("The secure sign-in service didn’t load. Refresh when you have a reliable connection.");
      return;
    }
    client = window.supabase.createClient(projectUrl, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    window.dtParentSupabase = client;
    const { data: { session } = {} } = await client.auth.getSession();
    if (session?.user && setupRequested) {
      activeSetupAccessToken = session.access_token || "";
      showView("setup");
    }
    else if (session?.user) await openFamilyPortal();
    else if (setupRequested) await stopSession("This secure invitation has expired, was already used, or did not finish opening. Ask Dance Techniques to send a new setup link.");
    else showView("login");
  };

  document.getElementById("pp-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = document.getElementById("pp-login-submit");
    const message = document.getElementById("pp-login-message");
    submit.disabled = true;
    submit.textContent = "Opening…";
    message.textContent = "";
    const { data, error } = await client.auth.signInWithPassword({
      email: document.getElementById("pp-login-email").value.trim(),
      password: document.getElementById("pp-login-password").value
    });
    submit.disabled = false;
    submit.textContent = "Log In";
    if (error || !data.session) {
      message.textContent = friendlyLoginError(error);
      return;
    }
    await openFamilyPortal();
  });

  document.getElementById("pp-setup-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.getElementById("pp-setup-password").value;
    const confirm = document.getElementById("pp-setup-confirm").value;
    const message = document.getElementById("pp-setup-message");
    if (password.length < 8) {
      message.textContent = "Choose a password with at least 8 characters.";
      return;
    }
    if (password !== confirm) {
      message.textContent = "Those passwords do not match.";
      return;
    }
    const submit = document.getElementById("pp-setup-submit");
    submit.disabled = true;
    submit.textContent = "Creating Password…";
    message.textContent = "Securely saving your password. Keep this page open.";
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    let passwordError = null;
    try {
      if (!activeSetupAccessToken) throw new Error("The secure invitation session is no longer available.");
      const response = await fetch(`${projectUrl}/auth/v1/user`, {
        method: "PUT",
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${activeSetupAccessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ password }),
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        // A repeated tap after a successful password save returns 422/same_password.
        // The password is already valid, so continue into the family-link activation
        // instead of trapping the parent on the setup screen.
        const rejectionCode = payload?.code || payload?.error_code || "";
        if (response.status !== 422 || rejectionCode !== "same_password") {
          const rejected = new Error(payload?.msg || payload?.message || "The password service did not accept this request.");
          rejected.code = rejectionCode || "password_update_failed";
          throw rejected;
        }
      }
    } catch (error) {
      passwordError = error;
    } finally {
      window.clearTimeout(timeout);
    }
    if (passwordError) {
      submit.disabled = false;
      submit.textContent = "Create Password & Open My Portal";
      message.textContent = passwordError?.name === "AbortError"
        ? "This browser took too long to save your password. Nothing was submitted twice. Tap the button once to try again."
        : "Your password could not be saved. Keep this page open and tap the button once to try again.";
      return;
    }
    message.textContent = "Password created. Opening your family portal…";
    await openFamilyPortal({ activate: true });
  });

  document.getElementById("pp-stopped-signout").addEventListener("click", async () => {
    await client?.auth.signOut();
    history.replaceState({}, "", "/parent-portal/");
    showView("login");
  });

  initialize();
})();

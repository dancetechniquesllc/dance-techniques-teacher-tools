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
  let activePhotoGuardian = null;
  let activePhotoObjectUrl = "";
  let photoOffsetX = 0;
  let photoOffsetY = 0;

  const closePhotoDialog = () => {
    photoDialog?.close();
    photoStatus.textContent = "";
    photoInput.value = "";
    if (activePhotoObjectUrl) URL.revokeObjectURL(activePhotoObjectUrl);
    activePhotoObjectUrl = "";
    activePhotoStudent = null;
    activePhotoGuardian = null;
    photoOffsetX = 0;
    photoOffsetY = 0;
  };

  const chooseDancerPhoto = (student) => {
    activePhotoStudent = student;
    activePhotoGuardian = null;
    document.getElementById("dancer-photo-title").textContent = "📸 Picture Perfect!";
    document.getElementById("dancer-photo-guidance").innerHTML = "Please fill the frame with <strong>just your dancer’s face</strong>—nice and close!<br><br>A clear profile photo helps their Dance Techniques teachers quickly recognize your dancer and makes <strong>class check-in easy-peasy</strong>. ✨<br><br><strong>One sweet smile. One easy check-in.</strong>";
    photoInput.click();
  };

  const chooseGuardianPhoto = (guardian) => {
    activePhotoGuardian = guardian;
    activePhotoStudent = null;
    document.getElementById("dancer-photo-title").textContent = "📸 Picture Perfect!";
    document.getElementById("dancer-photo-guidance").innerHTML = "Fill the frame with <strong>your face</strong>—nice and close!<br><br>Your photo helps your dancer’s teachers quickly recognize who they’re speaking with in the Parent Portal.<br><br><strong>One friendly face. One connected dance family.</strong> ✨";
    photoInput.click();
  };

  const makeCroppedPhoto = () => new Promise((resolve, reject) => {
    if (!photoImage.naturalWidth || !photoImage.naturalHeight) return reject(new Error("Choose a photo first."));
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const zoom = Number(photoZoom.value || 100) / 100;
    const sourceSize = Math.min(photoImage.naturalWidth, photoImage.naturalHeight) / zoom;
    const stageSize = document.getElementById("dancer-photo-stage").clientWidth || 310;
    const renderedScale = stageSize / sourceSize;
    const sourceX = Math.max(0, Math.min(photoImage.naturalWidth - sourceSize, (photoImage.naturalWidth - sourceSize) / 2 - photoOffsetX / renderedScale));
    const sourceY = Math.max(0, Math.min(photoImage.naturalHeight - sourceSize, (photoImage.naturalHeight - sourceSize) / 2 - photoOffsetY / renderedScale));
    canvas.getContext("2d").drawImage(photoImage, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 512, 512);
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The photo could not be prepared.")), "image/jpeg", 0.9);
  });

  const updateCropPreview = () => {
    if (!photoImage.naturalWidth) return;
    const stage = document.getElementById("dancer-photo-stage");
    const size = stage.clientWidth;
    const baseScale = Math.max(size / photoImage.naturalWidth, size / photoImage.naturalHeight);
    const scale = baseScale * (Number(photoZoom.value || 100) / 100);
    const width = photoImage.naturalWidth * scale;
    const height = photoImage.naturalHeight * scale;
    const maxX = Math.max(0, (width - size) / 2);
    const maxY = Math.max(0, (height - size) / 2);
    photoOffsetX = Math.max(-maxX, Math.min(maxX, photoOffsetX));
    photoOffsetY = Math.max(-maxY, Math.min(maxY, photoOffsetY));
    photoImage.style.width = `${width}px`;
    photoImage.style.height = `${height}px`;
    photoImage.style.left = `${(size - width) / 2 + photoOffsetX}px`;
    photoImage.style.top = `${(size - height) / 2 + photoOffsetY}px`;
  };

  photoInput?.addEventListener("change", () => {
    const file = photoInput.files?.[0];
    if (!file || (!activePhotoStudent && !activePhotoGuardian)) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type) || file.size > 5 * 1024 * 1024) {
      photoStatus.textContent = "Choose a JPG, PNG, or WebP photo smaller than 5 MB.";
      photoDialog.showModal();
      return;
    }
    activePhotoObjectUrl = URL.createObjectURL(file);
    photoImage.onload = () => { photoZoom.value = "100"; photoOffsetX = 0; photoOffsetY = 0; updateCropPreview(); };
    photoImage.src = activePhotoObjectUrl;
    photoDialog.showModal();
  });
  photoZoom?.addEventListener("input", updateCropPreview);
  const photoStage = document.getElementById("dancer-photo-stage");
  let photoDrag = null;
  photoStage?.addEventListener("pointerdown", (event) => {
    if (!photoImage.naturalWidth) return;
    photoDrag = { x: event.clientX, y: event.clientY, offsetX: photoOffsetX, offsetY: photoOffsetY };
    photoStage.setPointerCapture(event.pointerId);
  });
  photoStage?.addEventListener("pointermove", (event) => {
    if (!photoDrag) return;
    photoOffsetX = photoDrag.offsetX + event.clientX - photoDrag.x;
    photoOffsetY = photoDrag.offsetY + event.clientY - photoDrag.y;
    updateCropPreview();
  });
  ["pointerup", "pointercancel"].forEach((name) => photoStage?.addEventListener(name, () => { photoDrag = null; }));
  document.getElementById("dancer-photo-cancel")?.addEventListener("click", closePhotoDialog);
  document.getElementById("dancer-photo-save")?.addEventListener("click", async () => {
    if (!client || (!activePhotoStudent && !activePhotoGuardian)) return;
    const save = document.getElementById("dancer-photo-save");
    save.disabled = true;
    photoStatus.textContent = "Saving this sweet smile securely…";
    try {
      const blob = await makeCroppedPhoto();
      const isGuardian = Boolean(activePhotoGuardian);
      const record = activePhotoGuardian || activePhotoStudent;
      const bucket = isGuardian ? "guardian-photos" : "student-photos";
      const path = `${record.id}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await client.storage.from(bucket).upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;
      const { error: linkError } = isGuardian
        ? await client.rpc("set_parent_guardian_photo", { target_photo_path: path })
        : await client.rpc("set_parent_dancer_photo", { target_student_id: activePhotoStudent.id, target_photo_path: path });
      if (linkError) throw linkError;
      const { data } = await client.storage.from(bucket).createSignedUrl(path, 3600);
      const selector = isGuardian ? `[data-photo-guardian-id="${CSS.escape(record.id)}"]` : `[data-photo-student-id="${CSS.escape(record.id)}"]`;
      document.querySelectorAll(selector).forEach((bubble) => {
        const image = document.createElement("img");
        image.src = data?.signedUrl || activePhotoObjectUrl;
        image.alt = isGuardian ? (record.full_name || "Parent profile") : dancerName(record);
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
        <h2 id="pp-install-guide-title">Keep Dance Techniques<br><span>One Tap Away</span></h2>
        <p class="install-guide-intro"><em>Add the Parent Portal to your Home Screen for quick, easy access.</em></p>
        <div class="install-device-choices" role="group" aria-label="Choose your phone type">
          <button class="install-device-choice" type="button" data-install-device="iphone">iPhone</button>
          <button class="install-device-choice" type="button" data-install-device="android">Android</button>
        </div>
        <section class="install-instructions" id="pp-install-instructions" aria-live="polite" hidden>
          <ol class="install-steps"></ol><p class="install-guide-note"></p>
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
    const posts = Array.isArray(data.posts) ? data.posts : [];
    const postIds = [...new Set(posts.map((post) => post.sourcePostId).filter(Boolean))];
    if (!postIds.length) return posts;
    const { data: hearts, error: heartError } = await client
      .from("parent_portal_class_post_hearts")
      .select("post_id")
      .in("post_id", postIds);
    if (heartError) throw heartError;
    const heartedPostIds = new Set((hearts || []).map((heart) => String(heart.post_id)));
    return posts.map((post) => ({ ...post, hearted: heartedPostIds.has(String(post.sourcePostId)) }));
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
      feed.innerHTML = '<div class="family-updates-empty-card"><img class="family-updates-empty" src="assets/feed/family-updates-empty.png?v=4" alt="The magic will appear here. Photos, class moments, celebrations, and special updates from your dancer’s day will appear here."><button class="heart family-updates-empty-heart" type="button" aria-label="Heart this welcome card" aria-pressed="false" title="Heart">♡</button></div>';
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
      const actions = document.createElement("div");
      actions.className = "post-actions";
      const heart = document.createElement("button");
      heart.type = "button";
      heart.className = `heart${post.hearted ? " liked" : ""}`;
      heart.textContent = post.hearted ? "♥" : "♡";
      heart.setAttribute("aria-pressed", String(Boolean(post.hearted)));
      heart.setAttribute("aria-label", post.hearted ? "Remove heart from this post" : "Heart this post");
      heart.title = post.hearted ? "Remove heart" : "Heart";
      heart.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!client || heart.disabled) return;
        heart.disabled = true;
        try {
          const { data: liked, error } = await client.rpc("toggle_parent_portal_post_heart", {
            target_post_id: post.sourcePostId
          });
          if (error) throw error;
          post.hearted = liked === true;
          heart.classList.toggle("liked", post.hearted);
          heart.textContent = post.hearted ? "♥" : "♡";
          heart.setAttribute("aria-pressed", String(post.hearted));
          heart.setAttribute("aria-label", post.hearted ? "Remove heart from this post" : "Heart this post");
          heart.title = post.hearted ? "Remove heart" : "Heart";
          window.dispatchEvent(new CustomEvent("parent-portal:post-heart-changed", {
            detail: { postId: post.sourcePostId, hearted: post.hearted }
          }));
        } catch (error) {
          console.warn("The post heart could not be saved.");
        } finally {
          heart.disabled = false;
        }
      });
      actions.append(heart);
      article.append(actions);
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
    const headerAvatar = document.querySelector(".profile-button .mini-avatar");
    headerAvatar.dataset.photoGuardianId = guardian.id;
    if (guardian.photoUrl) {
      const image = document.createElement("img");
      image.src = guardian.photoUrl;
      image.alt = guardian.full_name || "Parent profile";
      headerAvatar.replaceChildren(image);
    } else headerAvatar.textContent = guardianInitials;
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

    const tuitionPlanCard = document.getElementById("parent-tuition-plan");
    if (tuitionPlanCard) {
      tuitionPlanCard.querySelector("strong").textContent = "Not Assigned";
      tuitionPlanCard.querySelector("span").textContent = "Waiting for Dance Techniques";
    }

    const profileCard = document.querySelector("#profile .profile-card");
    profileCard.innerHTML = `
      <button class="avatar family-dancer-bubble" type="button" data-photo-guardian-id="${guardian.id}" aria-label="Add or change your profile photo">${guardian.photoUrl ? `<img src="${guardian.photoUrl}" alt="${guardian.full_name || "Parent profile"}">` : guardianInitials}</button>
      <h2></h2>
      <p></p>
      <section class="family-dancers" aria-labelledby="family-dancers-title">
        <h3 id="family-dancers-title">My Dancers</h3>
        <div class="family-dancer-grid"></div>
      </section>
      <div class="profile-list"><button type="button" id="open-withdrawal-request">Request Withdrawal <span>›</span></button><button type="button" id="pp-sign-out">Sign Out <span>›</span></button></div>`;
    profileCard.querySelector("h2").textContent = guardian.full_name || [guardian.first_name, guardian.last_name].filter(Boolean).join(" ") || "Parent Portal Family";
    profileCard.querySelector("p").textContent = `Authorized family access for ${students.map(dancerName).join(" and ")}.`;
    profileCard.querySelector("[data-photo-guardian-id]").addEventListener("click", () => chooseGuardianPhoto(guardian));
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

  const loadDirectorElenaPreview = async () => {
    const { data: students, error: studentError } = await client
      .from("students")
      .select("id,first_name,last_name,preferred_name,status,photo_path")
      .ilike("first_name", "Elena Eden")
      .ilike("last_name", "Mancol-Bilbo")
      .eq("status", "enrolled");
    if (studentError) throw studentError;
    const candidates = Array.isArray(students) ? students : [];
    if (!candidates.length) throw new Error("Elena’s enrolled dancer record was not found.");

    const candidateIds = candidates.map((student) => student.id);
    const { data: enrollmentRows, error: enrollmentError } = await client
      .from("class_enrollments")
      .select("student_id,dance_class_id,status,enrolled_date,dance_classes(id,name,start_time,classroom,teacher_school_assignment_id)")
      .in("student_id", candidateIds)
      .eq("status", "enrolled");
    if (enrollmentError) throw enrollmentError;
    const classRows = (enrollmentRows || []).map((row) => ({
      ...row,
      danceClass: Array.isArray(row.dance_classes) ? row.dance_classes[0] : row.dance_classes
    })).filter((row) => row.danceClass);
    const assignmentIds = [...new Set(classRows.map((row) => row.danceClass.teacher_school_assignment_id).filter(Boolean))];
    const { data: assignments, error: assignmentError } = assignmentIds.length
      ? await client.from("teacher_school_assignments")
        .select("id,teacher_id,partner_school_id,profiles(id,full_name,color),partner_schools(name,nickname,dance_day,time_of_day)")
        .in("id", assignmentIds)
      : { data: [], error: null };
    if (assignmentError) throw assignmentError;
    const teacherIds = [...new Set((assignments || []).map((assignment) => assignment.teacher_id).filter(Boolean))];
    const { data: teacherStates } = teacherIds.length
      ? await client.from("teacher_portal_state").select("teacher_id,payload").in("teacher_id", teacherIds)
      : { data: [] };
    const teacherStateById = new Map((teacherStates || []).map((state) => [String(state.teacher_id), state.payload || {}]));
    const teacherPhotoById = new Map((teacherStates || []).map((state) => [String(state.teacher_id), state.payload?.teacher?.photo || ""]));
    const assignmentById = new Map((assignments || []).map((assignment) => [String(assignment.id), assignment]));
    const enrichedRows = classRows.map((row) => {
      const assignment = assignmentById.get(String(row.danceClass.teacher_school_assignment_id));
      const school = Array.isArray(assignment?.partner_schools) ? assignment.partner_schools[0] : assignment?.partner_schools;
      const teacherRecord = Array.isArray(assignment?.profiles) ? assignment.profiles[0] : assignment?.profiles;
      const teacher = teacherRecord ? { ...teacherRecord, photo: teacherPhotoById.get(String(assignment?.teacher_id)) || "" } : teacherRecord;
      return { ...row, assignment, school, teacher, teacherState: teacherStateById.get(String(assignment?.teacher_id)) || {} };
    });
    const preferredRow = enrichedRows.find((row) => /primrose rowlett/i.test(`${row.school?.nickname || ""} ${row.school?.name || ""}`) && /class\s*5/i.test(row.danceClass.name || "")) || enrichedRows[0];
    const student = candidates.find((candidate) => candidate.id === preferredRow?.student_id) || candidates[0];

    const { data: guardianLinks, error: guardianError } = await client
      .from("student_guardians")
      .select("relationship,is_primary,guardians(id,first_name,last_name,full_name,email,phone)")
      .eq("student_id", student.id)
      .order("is_primary", { ascending: false });
    if (guardianError) throw guardianError;
    const guardianLink = guardianLinks?.[0];
    const guardian = Array.isArray(guardianLink?.guardians) ? guardianLink.guardians[0] : guardianLink?.guardians;
    if (!guardian) throw new Error("Elena’s linked adult record was not found.");

    if (student.photo_path) {
      const { data } = await client.storage.from("student-photos").createSignedUrl(student.photo_path, 3600);
      student.photoUrl = data?.signedUrl || "";
    }

    const classIds = enrichedRows.filter((row) => row.student_id === student.id).map((row) => row.danceClass.id);
    const { data: postRows, error: postError } = classIds.length
      ? await client.from("parent_portal_class_posts")
        .select("id,dance_class_id,teacher_id,title,caption,media_path,published_at,audience_mode,deleted_at,parent_portal_class_post_recipients(student_id)")
        .in("dance_class_id", classIds)
        .is("deleted_at", null)
        .lte("published_at", new Date().toISOString())
        .order("published_at", { ascending: false })
      : { data: [], error: null };
    if (postError) throw postError;
    const classById = new Map(enrichedRows.map((row) => [String(row.danceClass.id), row]));
    const visiblePostRows = (postRows || []).filter((post) => post.audience_mode !== "private"
      || (post.parent_portal_class_post_recipients || []).some((recipient) => String(recipient.student_id) === String(student.id)));
    const classPosts = await Promise.all(visiblePostRows.map(async (post) => {
      const row = classById.get(String(post.dance_class_id));
      const signed = post.media_path
        ? await client.storage.from("parent-portal-class-media").createSignedUrl(post.media_path, 3600)
        : { data: null };
      return {
        sourcePostId: post.id,
        studentIds: [student.id],
        title: post.title || "Dance Class Update",
        caption: post.caption || "",
        imageUrl: signed.data?.signedUrl || "",
        publishedAt: post.published_at,
        className: row?.danceClass?.name || "Dance Class",
        teacherName: row?.teacher?.full_name || "Dance Techniques",
        teacherColor: row?.teacher?.color || "#DBA9A1"
      };
    }));
    return { context: { guardian, students: [student] }, scheduleRows: enrichedRows.filter((row) => row.student_id === student.id), classPosts };
  };

  const renderParentInvoiceTimeline = (invoiceRows = []) => {
    const upcomingPanel = document.getElementById("parent-scheduled-invoices");
    const historyPanel = document.getElementById("parent-payment-history");
    const money = (value) => `$${Number(value || 0).toFixed(2)}`;
    const dateLabel = (value) => {
      const date = value ? new Date(value) : null;
      return date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : "Date unavailable";
    };
    const paidStatuses = new Set(["paid", "successful", "completed"]);
    const paid = invoiceRows.filter((invoice) => paidStatuses.has(String(invoice.status || "").toLowerCase()));
    const upcoming = invoiceRows.filter((invoice) => !paidStatuses.has(String(invoice.status || "").toLowerCase()));
    if (upcomingPanel) {
      upcomingPanel.innerHTML = upcoming.length ? upcoming.map((invoice) => `<div><span><strong>${invoice.title}</strong><br><small>Invoice appears ${dateLabel(invoice.invoiceDate)} · Drafts ${dateLabel(invoice.dueDate)}</small></span><strong>${money(invoice.amount)}</strong></div>`).join("") : '<div><span>No upcoming invoices.</span><strong>—</strong></div>';
    }
    if (historyPanel) {
      historyPanel.innerHTML = paid.length ? paid.map((invoice) => `<div><span><strong>${invoice.title}</strong><br><small>Paid ${dateLabel(invoice.paidAt)} · Card ending in ${invoice.cardLastFour || "—"} · ${invoice.payerName || "Payer unavailable"}</small></span><strong>${money(invoice.amount)}</strong></div>`).join("") : '<div><span>No completed payments yet.</span><strong>—</strong></div>';
    }
  };
  window.renderParentInvoiceTimeline = renderParentInvoiceTimeline;

  const loadAuthorizedFamilySchedule = async (students = []) => {
    const studentIds = students.map((student) => student.id).filter(Boolean);
    if (!studentIds.length) return [];
    const { data: enrollments, error } = await client.from("class_enrollments").select("student_id,dance_class_id,status,dance_classes(id,name,start_time,teacher_school_assignment_id)").in("student_id", studentIds).eq("status", "enrolled");
    if (error) throw error;
    const rows = (enrollments || []).map((row) => ({ ...row, danceClass: Array.isArray(row.dance_classes) ? row.dance_classes[0] : row.dance_classes })).filter((row) => row.danceClass);
    const assignmentIds = [...new Set(rows.map((row) => row.danceClass.teacher_school_assignment_id).filter(Boolean))];
    const { data: assignments } = assignmentIds.length ? await client.from("teacher_school_assignments").select("id,teacher_id,partner_school_id,profiles(id,full_name,color),partner_schools(name,nickname,dance_day,time_of_day)").in("id", assignmentIds) : { data: [] };
    const teacherIds = [...new Set((assignments || []).map((assignment) => assignment.teacher_id).filter(Boolean))];
    const { data: teacherStates } = teacherIds.length ? await client.from("teacher_portal_state").select("teacher_id,payload").in("teacher_id", teacherIds) : { data: [] };
    const assignmentById = new Map((assignments || []).map((assignment) => [String(assignment.id), assignment]));
    const stateByTeacher = new Map((teacherStates || []).map((state) => [String(state.teacher_id), state.payload || {}]));
    return rows.map((row) => { const assignment = assignmentById.get(String(row.danceClass.teacher_school_assignment_id)); return { ...row, assignment, school: Array.isArray(assignment?.partner_schools) ? assignment.partner_schools[0] : assignment?.partner_schools, teacher: Array.isArray(assignment?.profiles) ? assignment.profiles[0] : assignment?.profiles, teacherState: stateByTeacher.get(String(assignment?.teacher_id)) || {} }; }).filter((row) => row.school);
  };

  const renderAuthorizedFamilyCalendar = (scheduleRows = [], student = {}) => {
    const first = scheduleRows.find((row) => String(row.student_id) === String(student.id)) || scheduleRows[0];
    const calendar = document.getElementById("monthly-calendar");
    if (!first?.school || !calendar) return;
    const danceDay = Number.isInteger(first.school.dance_day) ? first.school.dance_day : 4;
    const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const firstFour = (year, month) => { const date = new Date(year, month, 1, 12); date.setDate(1 + ((danceDay - date.getDay() + 7) % 7)); return Array.from({ length: 4 }, (_, index) => new Date(year, month, date.getDate() + index * 7, 12)); };
    const datesForMonth = (year, month) => year === 2026 && month === 7 ? (danceDay === 1 ? [new Date(2026, 7, 31, 12)] : []) : firstFour(year, month);
    const normalize = (value) => String(value || "").trim().toLowerCase();
    const schoolNames = [first.school.name, first.school.nickname].map(normalize).filter(Boolean);
    const changes = (first.teacherState?.teacher?.reschedules || first.teacherState?.reschedules || []).filter((change) => !change?.schoolName || schoolNames.includes(normalize(change.schoolName)));
    const changeByDate = new Map(changes.filter((change) => change.originalDate).map((change) => [String(change.originalDate).slice(0, 10), change]));
    const months = Array.from({ length: 10 }, (_, index) => { const date = new Date(2026, 7 + index, 1, 12); return { year: date.getFullYear(), month: date.getMonth() }; });
    const day = new Intl.DateTimeFormat(undefined, { weekday: "short" });
    const month = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
    const dancer = String(student.preferred_name || student.first_name || "Your dancer").trim();
    document.getElementById("calendar-page-title").textContent = `${dancer}’s Upcoming Dance Days`;
    calendar.innerHTML = months.filter(({ year, month: monthIndex }) => datesForMonth(year, monthIndex).length).map(({ year, month: monthIndex }, index) => { const cards = datesForMonth(year, monthIndex).map((date, week) => { const change = changeByDate.get(iso(date)); const canceled = change?.status === "cancelled"; const curriculum = week % 2 === 0 ? "Ballet" : "Tap"; return `<article class="calendar-week-card ${canceled ? "holiday" : "scheduled"}"><time datetime="${iso(date)}">${date.getDate()}<span class="calendar-date-sparkle" aria-hidden="true">✦</span><small>${day.format(date)}</small></time>${canceled ? `<strong>No Class${change.reason ? `: ${change.reason}` : ""}</strong>` : `<img class="calendar-curriculum-icon" src="assets/curriculum/upcoming-${curriculum.toLowerCase()}-day.png" alt="${curriculum} day"><strong>${curriculum} Day</strong><button type="button" data-open-attendance="${iso(date)}">Can’t Make It?</button>`}</article>`; }).join(""); return `<details class="calendar-month"${index === 0 ? " open" : ""}><summary>${month.format(new Date(year, monthIndex, 1))}</summary><div class="calendar-week-grid">${cards}</div></details>`; }).join("");
  };

  const renderDirectorElenaPreview = ({ context, scheduleRows, classPosts }) => {
    renderTruthfulEmptyStates(context, classPosts, []);
    const overview = document.getElementById("parent-financial-overview");
    if (overview) overview.innerHTML = '<article class="parent-financial-metric"><small>Enrollment Fee</small><strong>Paid</strong><span>Enrollment date not recorded</span></article><article class="parent-financial-metric" id="parent-tuition-plan" data-monthly-tuition-card><small>Monthly Tuition</small><strong>$55.00</strong><span>Drafts September 1–May 1</span></article><button class="parent-financial-metric" type="button" data-open-billing-setup><small>Automatic Payments</small><strong>Setup</strong><span>Card and approval needed</span></button><article class="parent-financial-metric"><small>Credit Available</small><strong>$0.00</strong><span>No family credits</span></article>';
    renderParentInvoiceTimeline(Array.from({ length: 9 }, (_, index) => {
      const due = new Date(2026, 8 + index, 1, 12);
      const issued = new Date(due);
      issued.setDate(issued.getDate() - 3);
      return { title: `${due.toLocaleDateString("en-US", { month: "long", year: "numeric" })} Dance Tuition`, amount: 55, invoiceDate: issued, dueDate: due, status: "scheduled" };
    }));
    const first = scheduleRows[0];
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const schoolName = first?.school?.nickname || first?.school?.name || "School not assigned";
    const dayName = Number.isInteger(first?.school?.dance_day) ? dayNames[first.school.dance_day] : "Dance Day";
    const timeBlock = first?.school?.time_of_day || "";
    const teacherName = first?.teacher?.full_name || "Dance Techniques Teacher";
    const teacherPhoto = first?.teacher?.photo || (/lexi/i.test(first?.teacher?.full_name || "") ? "assets/people/ms-lexi-profile.png" : "");
    const teacherLabel = /^Ms\./i.test(teacherName) ? teacherName : `Ms. ${teacherName.split(" ")[0]}`;
    const nextClassDate = new Date();
    nextClassDate.setHours(12, 0, 0, 0);
    if (Number.isInteger(first?.school?.dance_day)) nextClassDate.setDate(nextClassDate.getDate() + ((first.school.dance_day - nextClassDate.getDay() + 7) % 7));
    const curriculumAnchor = new Date(nextClassDate.getFullYear(), 8, 1, 12, 0, 0, 0);
    if (Number.isInteger(first?.school?.dance_day)) curriculumAnchor.setDate(curriculumAnchor.getDate() + ((first.school.dance_day - curriculumAnchor.getDay() + 7) % 7));
    const curriculumWeekOffset = Math.round((nextClassDate.getTime() - curriculumAnchor.getTime()) / (7 * 24 * 60 * 60 * 1000));
    const curriculumStyle = Math.abs(curriculumWeekOffset) % 2 === 0 ? "Ballet" : "Tap";
    const classSummary = document.querySelector(".today");
    classSummary.classList.add("class-summary");
    classSummary.innerHTML = `<img class="class-summary-art" src="assets/curriculum/${curriculumStyle.toLowerCase()}-day.png" alt="${curriculumStyle} shoes"><div class="class-summary-copy"><span class="eyebrow">Elena Eden’s class</span><h2>${dayName}${timeBlock ? ` <span class="class-time-dot">•</span> ${timeBlock === "AM" ? "Morning" : "Afternoon"}` : ""}</h2><p>${schoolName} · ${curriculumStyle} with ${teacherLabel}</p><button class="class-summary-link" type="button" data-page="calendar"><img src="assets/navigation/calendar.png" alt=""><strong>View full schedule</strong><span aria-hidden="true">›</span></button></div>`;
    const calendar = document.getElementById("monthly-calendar");
    document.getElementById("calendar-page-title").textContent = "Elena Eden’s Upcoming Dance Days";
    document.querySelector("#calendar .eyebrow").textContent = "Weekly schedule";
    calendar.setAttribute("aria-label", "Elena Eden’s upcoming class calendar");
    const isoDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const dateAtNoon = (value) => {
      const date = new Date(`${String(value || "").slice(0, 10)}T12:00:00`);
      return Number.isNaN(date.getTime()) ? null : date;
    };
    const firstFourWeekdays = (year, month, weekday) => {
      const date = new Date(year, month, 1, 12, 0, 0, 0);
      date.setDate(1 + ((weekday - date.getDay() + 7) % 7));
      return Array.from({ length: 4 }, (_, index) => new Date(year, month, date.getDate() + (index * 7), 12, 0, 0, 0));
    };
    const curriculumForDate = (date, danceDay) => {
      const anchor = new Date(2026, 8, 1, 12, 0, 0, 0);
      anchor.setDate(anchor.getDate() + ((danceDay - anchor.getDay() + 7) % 7));
      const weekOffset = Math.round((date.getTime() - anchor.getTime()) / (7 * 24 * 60 * 60 * 1000));
      return Math.abs(weekOffset) % 2 === 0 ? "Ballet" : "Tap";
    };
    const previewClosures = new Map([
      ["2026-11-26", "Thanksgiving Break"],
      ["2026-12-24", "Winter Break"],
      ["2027-03-18", "Spring Break"]
    ]);
    const normalize = (value) => String(value || "").trim().toLowerCase();
    const schoolAliases = [first?.school?.name, first?.school?.nickname, schoolName].map(normalize).filter(Boolean);
    const savedReschedules = (first?.teacherState?.teacher?.reschedules || first?.teacherState?.reschedules || []).filter((change) => {
      const changedSchool = normalize(change?.schoolName);
      return !changedSchool || schoolAliases.includes(changedSchool);
    });
    const changesByOriginalDate = new Map(savedReschedules.filter((change) => change?.originalDate).map((change) => [String(change.originalDate).slice(0, 10), change]));
    const danceDay = Number.isInteger(first?.school?.dance_day) ? first.school.dance_day : 4;
    const monthRange = Array.from({ length: 10 }, (_, index) => {
      const date = new Date(2026, 7 + index, 1, 12, 0, 0, 0);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
    const datesForMonth = (year, month) => year === 2026 && month === 7 ? (danceDay === 1 ? [new Date(2026, 7, 31, 12)] : []) : firstFourWeekdays(year, month, danceDay);
    const monthEntries = new Map(monthRange.map(({ year, month }) => [`${year}-${month}`, datesForMonth(year, month).map((date) => {
      const iso = isoDate(date);
      const closure = previewClosures.get(iso);
      const change = changesByOriginalDate.get(iso);
      const curriculum = curriculumForDate(date, danceDay);
      if (closure) return { date, type: "holiday", title: `No Class: ${closure}` };
      if (change?.status === "cancelled") return { date, type: "holiday", title: change.reason ? `No Class: ${change.reason}` : "No Class: Cancelled" };
      if (change?.status === "date_tbd") return { date, type: "rescheduled", title: "New class date needed", badge: "↻" };
      if (change?.status === "rescheduled") {
        const movedDate = dateAtNoon(change.newDate);
        return { date, type: "rescheduled", title: movedDate ? `Moved to ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(movedDate)}` : "Class rescheduled", badge: "↻" };
      }
      return { date, type: "scheduled", title: `${curriculum} Day`, curriculum };
    })]));
    savedReschedules.filter((change) => change?.status === "rescheduled" && change?.newDate).forEach((change) => {
      const date = dateAtNoon(change.newDate);
      if (!date) return;
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      if (!monthEntries.has(key)) return;
      monthEntries.get(key).push({ date, type: "makeup", title: `${change.curriculum || curriculumForDate(date, danceDay)} Makeup Class`, badge: "↻", curriculum: change.curriculum || curriculumForDate(date, danceDay) });
      monthEntries.get(key).sort((left, right) => left.date - right.date);
    });
    const monthFormatter = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
    const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short" });
    const today = new Date();
    calendar.innerHTML = monthRange.filter(({ year, month }) => (monthEntries.get(`${year}-${month}`) || []).length).map(({ year, month }, index) => {
      const entries = monthEntries.get(`${year}-${month}`) || [];
      const open = index === 0 || (today.getFullYear() === year && today.getMonth() === month);
      const cards = entries.map((entry) => {
        const icon = entry.curriculum ? `<img class="calendar-curriculum-icon" src="assets/curriculum/upcoming-${entry.curriculum.toLowerCase()}-day.png" alt="${entry.curriculum} day">` : "";
        const attendance = entry.type === "scheduled" ? `<button type="button" data-open-attendance="${isoDate(entry.date)}">Can’t Make It?</button>` : "";
        const badge = entry.badge ? `<span class="calendar-state-badge" aria-hidden="true">${entry.badge}</span>` : "";
        return `<article class="calendar-week-card ${entry.type}">${badge}<time datetime="${isoDate(entry.date)}">${entry.date.getDate()}<span class="calendar-date-sparkle" aria-hidden="true">✦</span><small>${dayFormatter.format(entry.date)}</small></time>${icon}<strong>${entry.title}</strong>${attendance}</article>`;
      }).join("");
      return `<details class="calendar-month"${open ? " open" : ""}><summary>${monthFormatter.format(new Date(year, month, 1))}</summary><div class="calendar-week-grid">${cards}</div></details>`;
    }).join("");
    document.getElementById("threads").innerHTML = `<button class="conversation-card teacher" type="button" data-conversation="teacher" aria-label="Open message thread with ${teacherLabel}"><span class="conversation-avatar teacher${teacherPhoto ? " has-photo" : ""}">${teacherPhoto ? `<img class="teacher-profile-photo" src="${teacherPhoto}" alt="${teacherLabel}">` : initials(teacherName, "")}</span><h3>${teacherLabel}</h3><p class="conversation-role">Elena Eden’s personal teacher</p></button><button class="conversation-card admin" type="button" data-conversation="admin" aria-label="Open message thread with Dance Techniques Admin"><span class="conversation-avatar admin"><img src="assets/brand/dance-techniques-logo.png" alt="Dance Techniques"></span><h3>Dance Techniques Admin</h3><p class="conversation-role">Questions about accounts, tuition, or enrollment</p></button>`;
    revealFamilyPortal();
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
      await stopSession(timedOut
        ? "Your family account is connected, but it took too long to open. Check your connection and tap Return to Log In to try again."
        : error
          ? "Your family account is still signed in, but its information could not be loaded. Check your connection and try again."
          : "This login is signed in but is not linked to an active dancer and adult profile. No other family information was opened. Please contact Dance Techniques.");
      return;
    }
    // Open the authorized family shell immediately. Optional content must never
    // hold navigation on the "Opening" screen.
    renderTruthfulEmptyStates(context, [], []);
    history.replaceState({}, "", "/parent-portal/");
    revealFamilyPortal();
    if (context.guardian?.id) {
      client.from("family_billing_accounts").select("id,card_brand,card_last_four,payment_method_status").eq("guardian_id", context.guardian.id).limit(1).maybeSingle().then(async ({ data }) => {
        if (data?.payment_method_status === "verified" && data.card_brand && data.card_last_four) window.renderParentAutomaticPayments?.(data.card_brand, data.card_last_four);
        if (!data?.id) return;
        const { data: cycle } = await client.from("family_billing_cycles").select("id,cycle_month,subtotal_cents,late_fee_cents,total_cents,status").eq("billing_account_id", data.id).order("cycle_month", { ascending: false }).limit(1).maybeSingle();
        if (!cycle?.id || cycle.status === "paid") return;
        const { data: attempts } = await client.from("family_billing_attempts").select("attempt_stage,status,scheduled_for,amount_cents").eq("cycle_id", cycle.id).order("scheduled_for", { ascending: true });
        const declined = (attempts || []).filter((attempt) => ["declined", "failed"].includes(attempt.status));
        const fifthFailed = declined.some((attempt) => attempt.attempt_stage === "fifth");
        const firstFailed = declined.some((attempt) => attempt.attempt_stage === "first");
        const nextAttempt = fifthFailed ? "tenth" : firstFailed ? "fifth" : "";
        if (!nextAttempt) return;
        const scheduled = (attempts || []).find((attempt) => attempt.attempt_stage === nextAttempt);
        const month = new Date(`${cycle.cycle_month}T12:00:00`).toLocaleDateString("en-US", { month: "long" });
        const amount = nextAttempt === "tenth" ? Number(scheduled?.amount_cents || cycle.total_cents || 0) / 100 : Number(scheduled?.amount_cents || cycle.subtotal_cents || 0) / 100;
        window.renderParentMonthlyTuition?.({ amount, nextAttempt, month });
      });
    }
    window.dispatchEvent(new CustomEvent("dt-parent-context", { detail: context }));
    if (activate) showFirstLoginInstallGuide();
    const loadDancerPhotos = Promise.allSettled((context.students || []).map(async (student) => {
      if (!student.photo_path) return;
      const { data } = await settleWithin(client.storage.from("student-photos").createSignedUrl(student.photo_path, 3600), 5000, "Dancer photo");
      student.photoUrl = data?.signedUrl || "";
    }));
    const loadGuardianPhoto = (async () => {
      if (!context.guardian.photo_path) return;
      const { data } = await settleWithin(client.storage.from("guardian-photos").createSignedUrl(context.guardian.photo_path, 3600), 5000, "Parent photo");
      context.guardian.photoUrl = data?.signedUrl || "";
    })();
    Promise.allSettled([
      settleWithin(loadClassPosts(), 8000, "Class feed"),
      settleWithin(loadNewsletters(), 8000, "Newsletter archive"),
      loadDancerPhotos,
      loadGuardianPhoto,
      settleWithin(loadAuthorizedFamilySchedule(context.students), 8000, "Family schedule")
    ]).then((results) => {
      const classPosts = results[0].status === "fulfilled" ? results[0].value : [];
      const newsletters = results[1].status === "fulfilled" ? results[1].value : [];
      const scheduleRows = results[4].status === "fulfilled" ? results[4].value : [];
      if (results[0].status === "rejected") console.warn("Class feed is temporarily unavailable.");
      if (results[1].status === "rejected") console.warn("Newsletters are temporarily unavailable.");
      renderTruthfulEmptyStates(context, classPosts, newsletters);
      if (scheduleRows.length) renderAuthorizedFamilyCalendar(scheduleRows, context.students[0]);
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
      if (window.supabase?.createClient) {
        client = window.supabase.createClient(projectUrl, publishableKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        window.dtParentSupabase = client;
        const { data: { session } = {} } = await client.auth.getSession();
        if (session?.user) {
          try {
            renderDirectorElenaPreview(await loadDirectorElenaPreview());
            return;
          } catch (error) {
            console.warn("Elena’s live preview records could not be loaded.", error);
          }
        }
      }
      renderDirectorElenaPreview({
        context: {
          guardian: { first_name: "Erik", last_name: "Mancol-Bilbo", full_name: "Erik Mancol-Bilbo" },
          students: [{ id: "elena-preview", first_name: "Elena Eden", last_name: "Mancol-Bilbo" }]
        },
        scheduleRows: [{
          student_id: "elena-preview",
          danceClass: { id: "rowlett-class-5-preview", name: "Class 5" },
          school: { name: "Primrose Rowlett", nickname: "Primrose Rowlett", dance_day: 4, time_of_day: "AM" },
          teacher: { full_name: "Ms. Lexi", color: "#E8679B", photo: "assets/people/ms-lexi-profile.png" }
        }],
        classPosts: []
      });
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

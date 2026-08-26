(function () {
  "use strict";

  const projectUrl = "https://pgagpvfiplizahsnmvxf.supabase.co";
  const publishableKey = "sb_publishable_ZypHy48w_5CFqkjpuRYCbA_802_MDed";
  window.DT_VAPID_PUBLIC_KEY = "BFgsYSQnkEQ8aUqbeweRXsPaaccqTz5hFGjzh3ybTOTxybs8ZLfHuQcPhQhMEpq7tCekPQjubaEFWsuasMgK5yI";
  const gate = document.getElementById("auth-gate");
  const form = document.getElementById("auth-form");
  const emailInput = document.getElementById("auth-email");
  const passwordInput = document.getElementById("auth-password");
  const submitButton = document.getElementById("auth-submit");
  const message = document.getElementById("auth-message");
  const sessionName = document.getElementById("session-name");
  const app = document.querySelector(".app");
  const resetEmailInput = document.getElementById("auth-reset-email");
  const resetMessage = document.getElementById("auth-reset-message");
  const resetSubmit = document.getElementById("auth-reset-submit");
  const passwordMessage = document.getElementById("auth-password-message");
  const authQuery = new URLSearchParams(window.location.search);
  const authHash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  let passwordRecoveryMode = authQuery.get("password-recovery") === "1"
    || authQuery.has("code")
    || ["invite", "recovery"].includes(authQuery.get("type"))
    || ["invite", "recovery"].includes(authHash.get("type"));
  let authCallbackInitializing = passwordRecoveryMode;
  const isLocalTour = ["127.0.0.1", "localhost"].includes(window.location.hostname)
    && new URLSearchParams(window.location.search).get("tour") === "1";

  const setGateState = (state) => {
    gate.dataset.state = state;
    gate.hidden = state === "ready";
    document.body.classList.toggle("auth-checking", state === "checking");
    document.body.dataset.authenticated = state === "ready" ? "true" : "false";
    app?.setAttribute("aria-hidden", state === "ready" ? "false" : "true");
  };

  const friendlyAuthError = (error) => {
    const copy = String(error?.message || "").toLowerCase();
    if (copy.includes("invalid login credentials")) return "That email or password doesn’t match. Please try again.";
    if (copy.includes("email not confirmed")) return "Please confirm your email before signing in.";
    if (copy.includes("failed to fetch")) return "We couldn’t reach the portal. Check your connection and try again.";
    if (copy.includes("auth session missing") || copy.includes("session not found")) return "This secure password link is no longer active. Please request a new invitation or password link.";
    if (copy.includes("otp") || copy.includes("expired") || copy.includes("code verifier") || copy.includes("invalid request")) return "This secure password link has expired or was already used. Please request a new one.";
    return error?.message || "Sign-in didn’t finish. Please try again.";
  };

  // Keep the teaching screen awake while Teacher Tools / Director Dashboard
  // remains visible. Browsers automatically release this when the phone locks
  // or the user navigates away; request it again when the app becomes visible.
  let screenWakeLock = null;
  const requestScreenWakeLock = async () => {
    if (!navigator.wakeLock?.request || document.visibilityState !== "visible" || screenWakeLock) return;
    try {
      screenWakeLock = await navigator.wakeLock.request("screen");
      screenWakeLock.addEventListener("release", () => { screenWakeLock = null; }, { once: true });
    } catch (error) {
      // Some browsers require the first tap before granting a wake lock. The
      // pointer handler below retries without interrupting the teacher.
      screenWakeLock = null;
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") requestScreenWakeLock();
  });
  document.addEventListener("pointerdown", requestScreenWakeLock, { passive: true });
  window.addEventListener("pageshow", requestScreenWakeLock);
  requestScreenWakeLock();

  if (isLocalTour) {
    sessionName.textContent = "Sample App Tour";
    document.body.dataset.userRole = "admin";
    document.body.dataset.tourMode = "true";
    setGateState("ready");
    return;
  }

  if (!window.supabase?.createClient) {
    setGateState("login");
    message.textContent = "The secure sign-in service didn’t load. Check your connection and refresh.";
    return;
  }

  // Teacher Tools keeps a recoverable local history of dashboard snapshots.
  // On long-running installed PWAs that history can fill the browser's storage
  // and prevent Supabase from persisting a freshly refreshed sign-in session.
  // Remove only that disposable history when storage is full; current app data
  // and all authentication data remain untouched.
  try {
    const storageProbeKey = "dt-auth-storage-probe";
    window.localStorage?.setItem(storageProbeKey, "1");
    window.localStorage?.removeItem(storageProbeKey);
  } catch (error) {
    try {
      window.localStorage?.removeItem("dt-teacher-tools-prototype-v1:history");
      console.info("Cleared the recoverable Teacher Tools history so sign-in can finish.");
    } catch (cleanupError) {
      console.warn("Teacher Tools could not free storage for sign-in.", cleanupError);
    }
  }

  const client = window.supabase.createClient(projectUrl, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.dtSupabase = client;
  let teacherProfileResolutionTimer = 0;

  const waitForProfileRetry = (delay) => new Promise((resolve) => window.setTimeout(resolve, delay));
  const loadSignedInProfile = async (userId) => {
    let lastError = null;
    let ordinaryAttempts = 0;
    const deadline = Date.now() + 65000;
    while (Date.now() < deadline) {
      const result = await client
        .from("profiles")
        .select("id, full_name, role, active")
        .eq("id", userId)
        .maybeSingle();
      if (!result.error || result.data) return result;
      lastError = result.error;
      const futureJwt = result.error?.code === "PGRST303"
        && /JWT issued at future/i.test(result.error?.message || "");
      if (futureJwt) {
        message.textContent = "Finishing secure sign-in…";
        await waitForProfileRetry(5000);
        continue;
      }
      ordinaryAttempts += 1;
      if (ordinaryAttempts >= 4) break;
      await waitForProfileRetry(500 * ordinaryAttempts);
    }
    return { data: null, error: lastError };
  };

  const stopUnresolvedTeacherSession = async (copy) => {
    window.clearTimeout(teacherProfileResolutionTimer);
    teacherProfileResolutionTimer = 0;
    window.dtCurrentProfile = null;
    delete document.body.dataset.currentTeacherId;
    await client.auth.signOut();
    message.textContent = copy || "We couldn’t open the Teacher Tools profile linked to this account. No sample or another teacher’s profile was opened. Please contact Dance Techniques.";
    setGateState("login");
  };

  window.dtCompleteTeacherProfileResolution = async ({ profileId = "", ready = false } = {}) => {
    const expectedProfile = window.dtCurrentProfile;
    if (expectedProfile?.role !== "teacher" || expectedProfile.id !== profileId) return false;
    const { data: { session } = {} } = await client.auth.getSession();
    if (!session?.user || session.user.id !== profileId || !ready) {
      await stopUnresolvedTeacherSession();
      return false;
    }
    window.clearTimeout(teacherProfileResolutionTimer);
    teacherProfileResolutionTimer = 0;
    document.body.dataset.currentTeacherId = profileId;
    setGateState("ready");
    return true;
  };

  const showSession = async (session) => {
    if (passwordRecoveryMode && session?.user) {
      setGateState("setup");
      return;
    }
    if (passwordRecoveryMode && !session?.user) {
      passwordRecoveryMode = false;
      message.textContent = "This secure invitation or password link has expired, was already used, or did not finish opening. Please request a new link.";
      setGateState("login");
      return;
    }
    if (!session?.user) {
      setGateState("landing");
      return;
    }

    setGateState("checking");
    const { data: profile, error } = await loadSignedInProfile(session.user.id);

    if (error || !profile) {
      if (error) {
        console.error("Shared profile lookup failed: " + JSON.stringify({
          code: error.code || "profile_lookup_failed",
          message: error.message || "Profile lookup failed.",
          details: error.details || "",
          hint: error.hint || ""
        }));
      }
      message.textContent = error
        ? "You’re still signed in, but we couldn’t load this account. Check your connection and try again."
        : "This signed-in account does not have an active Dance Techniques profile. Please contact Dance Techniques.";
      setGateState("login");
      return;
    }

    if (!profile.active) {
      setGateState("pending");
      return;
    }

    sessionName.textContent = profile.full_name ? `${profile.full_name} · ${profile.role}` : `Signed in · ${profile.role}`;
    profile.email = session.user.email || "";
    document.body.dataset.userRole = profile.role;
    const landingMode = profile.role === "teacher" ? "teacher" : "admin";
    document.body.dataset.mode = landingMode;
    document.querySelectorAll("[data-mode-btn]").forEach((button) => {
      button.classList.toggle("active", button.dataset.modeBtn === landingMode);
    });
    window.dtCurrentProfile = profile;
    if (profile.role === "teacher") {
      setGateState("checking");
      window.clearTimeout(teacherProfileResolutionTimer);
      teacherProfileResolutionTimer = window.setTimeout(() => {
        stopUnresolvedTeacherSession("Teacher Tools could not finish opening this profile. No sample or another teacher’s profile was opened. Please sign in again or contact Dance Techniques.");
      }, 90000);
    } else {
      setGateState("ready");
    }
    window.dispatchEvent(new CustomEvent("dt-auth-ready", { detail: { profile } }));
  };

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.classList.remove("auth-success");
    message.textContent = "";
    submitButton.disabled = true;
    submitButton.textContent = "Signing In…";
    const { data, error } = await client.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value
    });
    submitButton.disabled = false;
    submitButton.textContent = "Sign In";
    if (error) {
      message.textContent = friendlyAuthError(error);
      return;
    }
    message.textContent = "Opening your Teacher Tools profile…";
  });

  const signOut = async (event) => {
    event?.preventDefault();
    await client.auth.signOut();
    passwordInput.value = "";
    message.textContent = "";
    setGateState("landing");
  };

  document.getElementById("auth-sign-out")?.addEventListener("click", signOut);
  document.getElementById("auth-pending-form")?.addEventListener("submit", signOut);

  document.getElementById("open-teacher-login")?.addEventListener("click", () => {
    setGateState("login");
    window.setTimeout(() => emailInput.focus(), 0);
  });

  document.getElementById("auth-back-home")?.addEventListener("click", () => {
    message.textContent = "";
    setGateState("landing");
  });

  document.getElementById("auth-password-toggle")?.addEventListener("click", (event) => {
    const button = event.currentTarget;
    const showing = passwordInput.type === "text";
    passwordInput.type = showing ? "password" : "text";
    button.setAttribute("aria-pressed", showing ? "false" : "true");
    button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    passwordInput.focus({ preventScroll: true });
  });

  document.getElementById("auth-forgot")?.addEventListener("click", () => {
    resetEmailInput.value = emailInput.value.trim();
    resetMessage.textContent = "";
    setGateState("forgot");
    resetEmailInput.focus();
  });

  document.getElementById("auth-reset-cancel")?.addEventListener("click", () => {
    message.textContent = "";
    setGateState("login");
    emailInput.focus();
  });

  document.getElementById("auth-reset-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    resetMessage.classList.remove("auth-success");
    resetMessage.textContent = "";
    resetSubmit.disabled = true;
    resetSubmit.textContent = "Sending…";
    const redirectTo = `${window.location.origin}${window.location.pathname}?password-recovery=1`;
    const { error } = await client.auth.resetPasswordForEmail(resetEmailInput.value.trim(), { redirectTo });
    resetSubmit.disabled = false;
    resetSubmit.textContent = "Send Reset Link";
    if (error) {
      resetMessage.textContent = friendlyAuthError(error);
      return;
    }
    resetMessage.classList.add("auth-success");
    resetMessage.textContent = "Check your email for your secure password link.";
  });

  document.getElementById("auth-password-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nextPassword = document.getElementById("auth-new-password").value;
    const confirmation = document.getElementById("auth-confirm-password").value;
    passwordMessage.textContent = "";
    if (nextPassword !== confirmation) {
      passwordMessage.textContent = "Those passwords don’t match yet.";
      return;
    }
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError || !sessionData.session?.user) {
      passwordMessage.textContent = friendlyAuthError(sessionError || new Error("Auth session missing"));
      return;
    }
    const passwordSubmit = document.getElementById("auth-password-submit");
    passwordSubmit.disabled = true;
    passwordSubmit.textContent = "Saving…";
    const { error } = await client.auth.updateUser({ password: nextPassword });
    passwordSubmit.disabled = false;
    passwordSubmit.textContent = "Save Password";
    if (error) {
      passwordMessage.textContent = friendlyAuthError(error);
      return;
    }
    passwordRecoveryMode = false;
    await client.auth.signOut();
    message.textContent = "Password saved. You can sign in now.";
    message.classList.add("auth-success");
    setGateState("login");
  });

  document.querySelectorAll(".account-password-form").forEach((accountForm) => {
    accountForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const nextPassword = accountForm.querySelector("[data-account-new-password]").value;
      const confirmation = accountForm.querySelector("[data-account-confirm-password]").value;
      const accountMessage = accountForm.querySelector("[data-account-password-message]");
      const accountSubmit = accountForm.querySelector("[data-account-password-submit]");
      accountMessage.classList.remove("auth-success");
      accountMessage.textContent = "";
      if (nextPassword !== confirmation) {
        accountMessage.textContent = "Those passwords don’t match yet.";
        return;
      }
      accountSubmit.disabled = true;
      accountSubmit.textContent = "Saving…";
      const { error } = await client.auth.updateUser({ password: nextPassword });
      accountSubmit.disabled = false;
      accountSubmit.textContent = "Change My Password";
      if (error) {
        accountMessage.textContent = friendlyAuthError(error);
        return;
      }
      accountForm.reset();
      accountMessage.classList.add("auth-success");
      accountMessage.textContent = "Your password has been changed.";
    });
  });

  client.auth.onAuthStateChange((event, session) => {
    if (authCallbackInitializing) return;
    if (event === "PASSWORD_RECOVERY") {
      passwordRecoveryMode = true;
      setGateState("setup");
      return;
    }
    window.setTimeout(() => showSession(session), 0);
  });

  const establishCallbackSession = async () => {
    const code = authQuery.get("code");
    if (code) {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error) throw error;
      return data.session;
    }

    const tokenHash = authQuery.get("token_hash");
    const callbackType = authQuery.get("type");
    if (tokenHash && ["invite", "recovery"].includes(callbackType)) {
      const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: callbackType });
      if (error) throw error;
      return data.session;
    }

    const accessToken = authHash.get("access_token");
    const refreshToken = authHash.get("refresh_token");
    if (accessToken && refreshToken && ["invite", "recovery"].includes(authHash.get("type"))) {
      const { data, error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error) throw error;
      return data.session;
    }

    const { data: current, error: currentError } = await client.auth.getSession();
    if (currentError) throw currentError;
    if (current.session?.user) return current.session;
    return null;
  };

  establishCallbackSession()
    .then((session) => {
      authCallbackInitializing = false;
      return showSession(session);
    })
    .catch((error) => {
      console.warn("Secure auth callback did not finish", error);
      authCallbackInitializing = false;
      passwordRecoveryMode = false;
      message.textContent = friendlyAuthError(error);
      setGateState("login");
    });

  if ("serviceWorker" in navigator) {
    let refreshingForAppUpdate = false;
    const checkForPublishedAppUpdate = async () => {
      try {
        const response = await fetch(`./index.html?app-update-check=${Date.now()}`, {
          method: "HEAD",
          cache: "no-store"
        });
        const publishedVersion = response.headers.get("etag") || response.headers.get("last-modified") || "";
        if (!publishedVersion) return;
        const savedVersion = window.localStorage?.getItem("dt-published-app-version") || "";
        window.localStorage?.setItem("dt-published-app-version", publishedVersion);
        if (savedVersion && savedVersion !== publishedVersion) window.location.reload();
      } catch (error) {
        console.warn("The latest app version could not be checked", error);
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshingForAppUpdate) return;
      // Do not reload while iOS is creating and saving a PushManager
      // subscription. Interrupting that flow leaves permission granted but no
      // phone attached to the signed-in teacher.
      if (window.dtPushSetupInProgress) return;
      refreshingForAppUpdate = true;
      window.location.reload();
    });
    window.addEventListener("load", async () => {
      let registration = await navigator.serviceWorker.getRegistration("./");
      if (!registration) registration = await navigator.serviceWorker.register("./service-worker.js", { updateViaCache: "none" });
      // A forced update on every launch can continuously replace the worker on
      // iPhone. Limit explicit checks; normal service-worker registration still
      // handles published updates.
      const lastWorkerCheck = Number(window.localStorage?.getItem("dt-worker-update-check-at") || 0);
      if (Date.now() - lastWorkerCheck > 6 * 60 * 60 * 1000) {
        window.localStorage?.setItem("dt-worker-update-check-at", String(Date.now()));
        registration.update().catch((error) => console.warn("App update check did not finish", error));
      }
      checkForPublishedAppUpdate();
    });
  }
})();

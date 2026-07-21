(function () {
  "use strict";

  const projectUrl = "https://pgagpvfiplizahsnmvxf.supabase.co";
  const publishableKey = "sb_publishable_ZypHy48w_5CFqkjpuRYCbA_802_MDed";
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
    return error?.message || "Sign-in didn’t finish. Please try again.";
  };

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

  const client = window.supabase.createClient(projectUrl, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.dtSupabase = client;

  const showSession = async (session) => {
    if (passwordRecoveryMode) {
      setGateState("setup");
      return;
    }
    if (!session?.user) {
      setGateState("landing");
      return;
    }

    setGateState("checking");
    const { data: profile, error } = await client
      .from("profiles")
      .select("id, full_name, role, active")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error || !profile) {
      await client.auth.signOut();
      message.textContent = "We couldn’t verify this account. Please contact Dance Techniques.";
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
    setGateState("ready");
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
    await showSession(data.session);
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
    if (event === "PASSWORD_RECOVERY") {
      passwordRecoveryMode = true;
      setGateState("setup");
      return;
    }
    window.setTimeout(() => showSession(session), 0);
  });

  client.auth.getSession().then(({ data }) => showSession(data.session));

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
  }
})();

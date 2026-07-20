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
    if (!session?.user) {
      setGateState("login");
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
    document.body.dataset.userRole = profile.role;
    window.dtCurrentProfile = profile;
    setGateState("ready");
  };

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
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
    setGateState("login");
    emailInput.focus();
  };

  document.getElementById("auth-sign-out")?.addEventListener("click", signOut);
  document.getElementById("auth-pending-form")?.addEventListener("submit", signOut);

  client.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => showSession(session), 0);
  });

  client.auth.getSession().then(({ data }) => showSession(data.session));
})();

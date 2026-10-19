(() => {
  "use strict";
  const MH = window.MH;
  const $ = (selector) => document.querySelector(selector);
  const nameStep = $("#name-step");
  const passwordStep = $("#password-step");
  const changeStep = $("#change-step");
  const message = $("#login-message");
  const params = new URLSearchParams(location.search);
  let chosen = null;      // { id, name, role }
  let currentPassword = "";

  const REASONS = {
    idle: "You were signed out after 15 minutes without activity. Please sign in again.",
    expired: "Your session has ended. Please sign in again.",
    changed: "Your account details were changed (for example a new password or role), so you have been signed out. Please sign in again.",
    disabled: "This account has been disabled. Please speak to the system administrator.",
    ended: "You have been signed out. Please sign in again."
  };

  function showMessage(text, kind = "info") {
    message.textContent = text;
    message.className = `login-message message-${kind}`;
    message.hidden = !text;
  }

  function setError(input, errorEl, text) {
    errorEl.textContent = text;
    if (text) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  function showStep(step) {
    [nameStep, passwordStep, changeStep].forEach((form) => { form.hidden = form !== step; });
    const first = step.querySelector("input");
    if (first) first.focus();
  }

  function tick() {
    const now = new Date();
    $("#clock-time").textContent = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(now);
    $("#clock-date").textContent = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(now);
  }
  tick();
  setInterval(tick, 15000);

  if (REASONS[params.get("reason")]) showMessage(REASONS[params.get("reason")], "warning");

  // Already signed in on this tab? Go straight to the right page.
  const existing = MH.currentUser();
  if (existing) {
    location.replace(MH.HOME[existing.role]);
    return;
  }

  // Return to the page that sent the user here. Only a room name (from a QR code) is carried over.
  function destination(me) {
    const [page, query] = String(params.get("next") || "").split("?");
    if (!page || !MH.pageAllowed(page, me.roles)) return MH.HOME[me.role];
    const room = new URLSearchParams(query || "").get("location");
    return room ? `${page}?location=${encodeURIComponent(room.slice(0, 80))}` : page;
  }

  async function finishSignIn() {
    if (!MH.startSession(chosen.id)) {
      showMessage("Sign-in could not be saved in this browser. Check that site storage is allowed.", "error");
      return;
    }
    const me = MH.currentUser();
    showMessage(`Welcome, ${me.name}. Opening the ${MH.ROLES[me.role]} page…`, "success");
    location.href = destination(me);
  }

  const nameInput = $("#staff-name");
  const nameError = $("#staff-name-error");
  nameInput.addEventListener("input", () => setError(nameInput, nameError, ""));
  nameStep.addEventListener("submit", async (event) => {
    event.preventDefault();
    showMessage("");
    const name = nameInput.value.trim();
    if (!name) {
      setError(nameInput, nameError, "Enter your full name or email address to continue.");
      nameInput.focus();
      return;
    }
    await MH.ensureUsers();
    const user = MH.findUser(name);
    if (!user) {
      setError(nameInput, nameError, "We couldn't find an account with that name or email. Check the spelling, or ask the system administrator to set up your account.");
      nameInput.focus();
      return;
    }
    chosen = { id: user.id, name: user.name, email: user.email, role: user.role };
    $("#user-initials").textContent = user.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
    $("#user-name").textContent = user.name;
    $("#user-role").textContent = MH.ROLES[user.role];
    $("#password").value = "";
    setError($("#password"), $("#password-error"), "");
    showStep(passwordStep);
  });

  const passwordInput = $("#password");
  const passwordError = $("#password-error");
  passwordInput.addEventListener("input", () => setError(passwordInput, passwordError, ""));
  $("#toggle-password").addEventListener("click", (event) => {
    const show = passwordInput.type === "password";
    passwordInput.type = show ? "text" : "password";
    event.currentTarget.textContent = show ? "Hide" : "Show";
    event.currentTarget.setAttribute("aria-pressed", String(show));
  });
  $("#switch-user").addEventListener("click", () => {
    chosen = null;
    showMessage("");
    showStep(nameStep);
  });

  passwordStep.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!passwordInput.value) {
      setError(passwordInput, passwordError, "Enter your password.");
      passwordInput.focus();
      return;
    }
    const signIn = $("#sign-in-button");
    signIn.disabled = true;
    signIn.textContent = "Checking…";
    const result = await MH.verifyPassword(chosen.id, passwordInput.value);
    signIn.disabled = false;
    signIn.textContent = "Sign in";
    if (!result.ok) {
      const lockedText = result.lockedUntil
        ? `until ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(result.lockedUntil))}`
        : "";
      const text = result.reason === "locked"
        ? `${result.justLocked ? "Too many wrong passwords. " : ""}This account is locked ${lockedText} to keep it safe. The system administrator can unlock it sooner.`
        : result.reason === "disabled"
          ? "This account has been disabled. Please speak to the system administrator."
          : `That password is not correct. ${MH.plural(result.attemptsLeft, "attempt")} left before the account is locked.`;
      setError(passwordInput, passwordError, text);
      passwordInput.value = "";
      passwordInput.focus();
      return;
    }
    if (result.mustChange) {
      currentPassword = passwordInput.value;
      passwordInput.value = "";
      showStep(changeStep);
      return;
    }
    passwordInput.value = "";
    finishSignIn();
  });

  const newPassword = $("#new-password");
  const confirmPassword = $("#confirm-password");
  newPassword.addEventListener("input", () => setError(newPassword, $("#new-password-error"), ""));
  confirmPassword.addEventListener("input", () => setError(confirmPassword, $("#confirm-password-error"), ""));
  changeStep.addEventListener("submit", async (event) => {
    event.preventDefault();
    const problem = MH.passwordProblem(newPassword.value, chosen);
    if (problem) {
      setError(newPassword, $("#new-password-error"), problem);
      newPassword.focus();
      return;
    }
    if (newPassword.value !== confirmPassword.value) {
      setError(confirmPassword, $("#confirm-password-error"), "The two passwords do not match.");
      confirmPassword.focus();
      return;
    }
    const result = await MH.changeOwnPassword(chosen.id, currentPassword, newPassword.value);
    if (!result.ok) {
      setError(newPassword, $("#new-password-error"), result.error);
      newPassword.focus();
      return;
    }
    currentPassword = "";
    newPassword.value = "";
    confirmPassword.value = "";
    finishSignIn();
  });

  MH.ensureUsers();
  nameInput.focus();
})();

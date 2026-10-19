// Core data, identity & access management (IAM) and business rules for Meadow House.
// Loaded as a classic script (not a module) so the app also works when opened from file://.
//
// DEPLOYMENT NOTE: this build runs entirely in the browser. Everything lives in this browser's local
// storage, so the checks below raise the bar (hashed passwords, lockout, least privilege,
// per-tab sessions, idle timeout, audit log) but cannot stop someone with full control of
// the browser. A real deployment must enforce the same rules on a server.
window.MH = window.MH || {};
(() => {
  "use strict";
  const MH = window.MH;

  const KEYS = {
    jobs: "meadow-house-repair-jobs-v1",
    tasks: "meadow-house-planned-maintenance-v1",
    users: "meadow-house-users-v2",
    sessions: "meadow-house-sessions-v1",
    announcements: "meadow-house-announcements-v1",
    audit: "meadow-house-audit-v1",
    settings: "meadow-house-settings-v1",
    alerts: "meadow-house-alerts-v1"
  };
  const TAB_TOKEN_KEY = "meadow-house-tab-session"; // sessionStorage: a session never leaks into another tab
  const HOUSE_NAME = "Meadow House";
  const STATUSES = ["New", "Scheduled", "In Progress", "Completed"];
  const ROLES = { staff: "Care staff", maintenance: "Maintenance team", manager: "Home manager", admin: "System administrator" };
  const HOME = { staff: "index.html", maintenance: "maintenance.html", manager: "manager.html", admin: "admin.html" };

  // Least privilege: each page lists the only roles that may open it.
  const PAGE_ACCESS = {
    "index.html": ["staff", "manager"],
    "announcements.html": ["staff", "maintenance", "manager"],
    "maintenance.html": ["maintenance"],
    "manager.html": ["manager"],
    "overview.html": ["maintenance", "manager"],
    "admin.html": ["admin"]
  };

  // Every action that changes data is checked against this table at the moment it runs.
  const PERMISSIONS = {
    "job.report": ["staff", "manager"],
    "job.request": ["manager"],
    "job.assign": ["maintenance", "manager"],
    "job.book": ["maintenance"],
    "job.approve": ["manager"],
    "job.work": ["maintenance"],
    "job.confirm": ["staff", "manager"],
    "task.assign": ["maintenance", "manager"],
    "task.book": ["maintenance"],
    "task.approve": ["manager"],
    "task.record": ["maintenance"],
    "announce.create": ["manager"],
    "announce.read": ["staff", "maintenance", "manager"],
    "users.manage": ["admin"],
    "users.elevate": ["admin"],
    "audit.view": ["admin"],
    "system.maintain": ["admin"],
    "directory.view": ["manager"],
    "reports.view": ["maintenance", "manager"],
    "data.sample": ["admin"],
    "locations.manage": ["manager", "admin"],
    "alerts.email": ["manager", "admin"],
    "evidence.export": ["manager"],
    "certificates.view": ["maintenance", "manager"]
  };

  const IDLE_LIMIT_MS = 15 * 60 * 1000;
  const MAX_SESSION_MS = 12 * 60 * 60 * 1000;
  const MAX_FAILED_ATTEMPTS = 5;
  const LOCK_MS = 15 * 60 * 1000;
  const PBKDF2_ITERATIONS = 600000; // OWASP 2023 guidance for PBKDF2-HMAC-SHA256
  const MAX_ELEVATION_DAYS = 14;
  // Initial accounts. Only salted PBKDF2-SHA-256 hashes are stored – never the password itself.
  // Every account must choose its own password at first sign-in (mustChange).
  const SEED_USERS = [
    { id: "u-isha-gaikwad", name: "Isha Gaikwad", email: "sgigaikw@liverpool.ac.uk", role: "staff", salt: "cXhEl1lxyXpJu6546jNNnQ==", hash: "jr0ybk+39sAgjHiktUg8Ci8541PCZpmnJska9SqPCx0=", iterations: 600000 },
    { id: "u-jamie-o-brien", name: "Jamie O'Brien", email: "sgjobri6@liverpool.ac.uk", role: "manager", salt: "UM1tIs3U03cHZMmRi7Kpsw==", hash: "V6Y3QfK6asivTntmkxFPcnRFswQPmm4sUZ97pSQgEO0=", iterations: 600000 },
    { id: "u-alya-almslem", name: "Alya Almslem", email: "sgaalmsl@liverpool.ac.uk", role: "staff", salt: "dl/Whfk3rF3SsU3ZQqbg+A==", hash: "kpe3UA+xayd48VvBmxadPABOqXNPw18hCPIBtZ6v+AA=", iterations: 600000 },
    { id: "u-testimony-gwendolyne", name: "Testimony Gwendolyne", email: "testimonygwendolyne@gmail.com", role: "maintenance", salt: "G8gGLeFj9B6tpytQBLTYlw==", hash: "g3NBkvNH4ypEzLpTREfK+Pu8ON0k4TXN/zSljmSrj+c=", iterations: 600000 },
    { id: "u-felix-bonsu", name: "Felix Bonsu", email: "sgfbonsu@liverpool.ac.uk", role: "admin", salt: "+Nv8Hwmwt0K6XMmda6qZsg==", hash: "lSOqxXEyNWVyNCGk0DP8rcwzLiwle0JE5E09zsuued0=", iterations: 600000 },
    { id: "u-ethan-morton", name: "Ethan Morton", email: "sgemort2@liverpool.ac.uk", role: "maintenance", salt: "DH2FDNnChEfJr/Jeqp3EaA==", hash: "4+DZx1n3AHInDXBjMmQpB8By5N8iYbm7Q0rAACmMMm4=", iterations: 600000 }
  ];
  // Example names used only inside the optional training data.
  const SAMPLE_REPORTERS = ["Alex Morgan", "Sam Patel", "Jo Lee"];

  let storageErrorHandler = (message) => console.error(message);
  const onStorageError = (handler) => { storageErrorHandler = handler; };

  /* ---------- Generic helpers ---------- */

  const pad = (n) => String(n).padStart(2, "0");
  const nowIso = () => new Date().toISOString();
  const plural = (n, word, many) => `${n} ${n === 1 ? word : (many || `${word}s`)}`;
  const normaliseName = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();

  function toInputDate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseInputDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.getMonth() === Number(match[2]) - 1 ? date : null;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function daysBetween(from, to) {
    return Math.round((startOfDay(to) - startOfDay(from)) / 86400000);
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Date unavailable";
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).format(date);
  }

  function formatDate(value) {
    if (value === null || value === undefined || value === "") return "Not recorded";
    const date = value instanceof Date ? value : (parseInputDate(value) || new Date(value));
    if (Number.isNaN(date.getTime())) return "Date unavailable";
    return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(date);
  }

  function formatAppointment(appointment) {
    if (!appointment || !appointment.date) return "";
    return `${formatDate(appointment.date)}${appointment.time ? ` at ${appointment.time}` : ""}`;
  }

  function randomHex(bytes) {
    const array = crypto.getRandomValues(new Uint8Array(bytes));
    return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (error) {
      console.error(`Unable to read ${key}.`, error);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Unable to save ${key}.`, error);
      storageErrorHandler("Your changes could not be saved in this browser. Check available storage and try again.");
      return false;
    }
  }

  /* ---------- Passwords ---------- */

  const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
  const fromB64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

  async function hashPassword(password, saltB64, iterations = PBKDF2_ITERATIONS) {
    const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
    return { salt: toB64(salt), hash: toB64(new Uint8Array(bits)), iterations };
  }

  function sameHash(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  const COMMON_PASSWORDS = ["password", "qwerty", "letmein", "welcome", "meadow", "carehome", "123456", "abc123", "iloveyou", "admin"];

  // Returns a problem message, or "" when the password meets the policy.
  function passwordProblem(password, user) {
    if (password.length < 12) return "Use at least 12 characters. A short phrase of three or four words works well.";
    if (!/[a-z]/i.test(password) || !/\d/.test(password)) return "Include at least one letter and one number.";
    const lower = password.toLowerCase();
    const nameParts = normaliseName(user && user.name).split(/[^a-z]+/).filter((part) => part.length >= 3);
    const emailPart = String((user && user.email) || "").toLowerCase().split("@")[0];
    if (nameParts.some((part) => lower.includes(part)) || (emailPart.length >= 3 && lower.includes(emailPart))) {
      return "Do not include your name or email in the password.";
    }
    if (COMMON_PASSWORDS.some((word) => lower.includes(word)) || /(.)\1{3,}/.test(password)) {
      return "That password is too easy to guess. Avoid common words and repeated characters.";
    }
    return "";
  }

  // Random temporary password for new or reset accounts (shown once to the admin).
  function generateTempPassword() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(15));
    const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
    let text = `${chars.slice(0, 5).join("")}-${chars.slice(5, 10).join("")}-${chars.slice(10).join("")}`;
    if (!/\d/.test(text)) text = `${text.slice(0, -1)}7`;
    return text;
  }

  /* ---------- Accounts ---------- */

  const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));

  function isValidUser(user) {
    return user && typeof user.id === "string" && typeof user.name === "string" && ROLES[user.role]
      && typeof user.hash === "string" && typeof user.salt === "string";
  }

  function loadUsers() {
    const users = read(KEYS.users, []);
    return Array.isArray(users) ? users.filter(isValidUser) : [];
  }

  async function ensureUsers() {
    if (loadUsers().length) return;
    const createdAt = nowIso();
    write(KEYS.users, SEED_USERS.map((seed) => ({
      ...seed, mustChange: true, failed: 0, lockedUntil: null, disabled: false, sessionVersion: 1,
      elevation: null, createdAt, lastSignIn: null
    })));
  }

  // Staff can sign in with their full name or their email address.
  function findUser(identifier) {
    const wanted = normaliseName(identifier);
    if (!wanted) return null;
    return loadUsers().find((user) => normaliseName(user.name) === wanted || normaliseName(user.email) === wanted) || null;
  }

  function activeElevation(user) {
    const e = user && user.elevation;
    if (!e || !ROLES[e.role]) return null;
    const now = Date.now();
    return Date.parse(e.from || 0) <= now && Date.parse(e.until) > now ? e : null;
  }

  // A person's own role plus any temporary cover (elevation) granted by the admin.
  function effectiveRoles(user) {
    const elevation = activeElevation(user);
    return elevation && elevation.role !== user.role ? [user.role, elevation.role] : [user.role];
  }

  function publicUser(user) {
    if (!user) return null;
    const elevation = activeElevation(user);
    return { id: user.id, name: user.name, role: user.role, roles: effectiveRoles(user), elevation: elevation ? { role: elevation.role, until: elevation.until } : null };
  }

  function roleText(user) {
    const pub = user && user.roles ? user : publicUser(user);
    if (!pub) return "";
    return pub.elevation ? `${ROLES[pub.role]} · covering as ${ROLES[pub.elevation.role]}` : ROLES[pub.role];
  }

  function updateUser(id, mutator) {
    const users = loadUsers();
    const user = users.find((item) => item.id === id);
    if (!user) return null;
    mutator(user);
    return write(KEYS.users, users) ? user : null;
  }

  function maintenanceTeam() {
    return loadUsers().filter((user) => user.role === "maintenance" && !user.disabled).map(publicUser);
  }

  // Names and roles only (no emails) – used by the manager for announcement read receipts.
  function staffDirectory() {
    authorize("directory.view");
    return loadUsers().filter((user) => !user.disabled).map((user) => ({ id: user.id, name: user.name, role: user.role }));
  }

  async function verifyPassword(userId, password) {
    const user = loadUsers().find((item) => item.id === userId);
    if (!user) return { ok: false, reason: "unknown" };
    if (user.disabled) {
      audit("Sign-in refused", "Account is disabled", "blocked", user);
      return { ok: false, reason: "disabled" };
    }
    if (user.lockedUntil && Date.parse(user.lockedUntil) > Date.now()) {
      audit("Sign-in refused", "Account is locked", "blocked", user);
      return { ok: false, reason: "locked", lockedUntil: user.lockedUntil };
    }
    const attempt = await hashPassword(password, user.salt, user.iterations);
    if (!sameHash(attempt.hash, user.hash)) {
      let result = { ok: false, reason: "wrong" };
      updateUser(user.id, (fresh) => {
        fresh.failed = (fresh.failed || 0) + 1;
        if (fresh.failed >= MAX_FAILED_ATTEMPTS) {
          fresh.failed = 0;
          fresh.lockedUntil = new Date(Date.now() + LOCK_MS).toISOString();
          result = { ok: false, reason: "locked", lockedUntil: fresh.lockedUntil, justLocked: true };
        } else {
          result.attemptsLeft = MAX_FAILED_ATTEMPTS - fresh.failed;
        }
      });
      audit(result.justLocked ? "Account locked" : "Failed sign-in", result.justLocked
        ? `Locked for ${LOCK_MS / 60000} minutes after ${MAX_FAILED_ATTEMPTS} wrong passwords` : "Wrong password", "blocked", user);
      return result;
    }
    updateUser(user.id, (fresh) => { fresh.failed = 0; fresh.lockedUntil = null; });
    return { ok: true, mustChange: Boolean(user.mustChange), user: publicUser(user) };
  }

  async function changeOwnPassword(userId, currentPassword, newPassword) {
    const user = loadUsers().find((item) => item.id === userId);
    if (!user) return { ok: false, error: "Account not found." };
    const check = await hashPassword(currentPassword, user.salt, user.iterations);
    if (!sameHash(check.hash, user.hash)) return { ok: false, error: "Your current password was not recognised." };
    const problem = passwordProblem(newPassword, user);
    if (problem) return { ok: false, error: problem };
    if (newPassword === currentPassword) return { ok: false, error: "Choose a new password – not the temporary one." };
    const hashed = await hashPassword(newPassword);
    updateUser(user.id, (fresh) => {
      Object.assign(fresh, hashed);
      fresh.mustChange = false;
      fresh.sessionVersion = (fresh.sessionVersion || 1) + 1; // ends any other open sessions
    });
    audit("Password changed", "Changed by the account holder", "ok", user);
    return { ok: true };
  }

  /* ---------- Sessions ---------- */

  function loadSessions() {
    const sessions = read(KEYS.sessions, {});
    return sessions && typeof sessions === "object" ? sessions : {};
  }

  function startSession(userId) {
    const user = loadUsers().find((item) => item.id === userId);
    if (!user) return false;
    const token = randomHex(32);
    const sessions = loadSessions();
    const now = Date.now();
    Object.keys(sessions).forEach((key) => {
      const s = sessions[key];
      if (now - Date.parse(s.lastActive) > IDLE_LIMIT_MS || now - Date.parse(s.createdAt) > MAX_SESSION_MS) delete sessions[key];
    });
    sessions[token] = { userId, createdAt: nowIso(), lastActive: nowIso(), sessionVersion: user.sessionVersion || 1 };
    if (!write(KEYS.sessions, sessions)) return false;
    try { sessionStorage.setItem(TAB_TOKEN_KEY, token); } catch (error) { return false; }
    updateUser(user.id, (fresh) => { fresh.lastSignIn = nowIso(); });
    audit("Signed in", `Signed in as ${roleText(user)}`, "ok", user);
    return true;
  }

  function tabToken() {
    try { return sessionStorage.getItem(TAB_TOKEN_KEY); } catch (error) { return null; }
  }

  // Role and name always come from the account store, never from the session record,
  // so a role change or disabled account takes effect immediately.
  function checkSession() {
    const token = tabToken();
    if (!token) return { ok: false, reason: "signed-out" };
    const session = loadSessions()[token];
    if (!session) return { ok: false, reason: "ended" };
    const user = loadUsers().find((item) => item.id === session.userId);
    if (!user || user.disabled) return { ok: false, reason: "disabled" };
    if ((user.sessionVersion || 1) !== session.sessionVersion) return { ok: false, reason: "changed" };
    const now = Date.now();
    if (now - Date.parse(session.lastActive) > IDLE_LIMIT_MS) return { ok: false, reason: "idle" };
    if (now - Date.parse(session.createdAt) > MAX_SESSION_MS) return { ok: false, reason: "expired" };
    return { ok: true, user: publicUser(user), token };
  }

  function currentUser() {
    const result = checkSession();
    return result.ok ? result.user : null;
  }

  let lastTouch = 0;
  function touchSession() {
    if (Date.now() - lastTouch < 30000) return;
    const token = tabToken();
    const sessions = loadSessions();
    if (!token || !sessions[token]) return;
    lastTouch = Date.now();
    sessions[token].lastActive = nowIso();
    write(KEYS.sessions, sessions);
  }

  function endSession(reason) {
    const token = tabToken();
    const user = currentUser();
    if (token) {
      const sessions = loadSessions();
      delete sessions[token];
      write(KEYS.sessions, sessions);
    }
    try { sessionStorage.removeItem(TAB_TOKEN_KEY); } catch (error) { /* ignore */ }
    if (user) audit("Signed out", reason === "manual" ? "Signed out" : `Session ended (${reason})`, "ok", user);
  }

  function signOut(reason = "manual") {
    endSession(reason);
    location.href = `login.html${reason === "manual" ? "" : `?reason=${encodeURIComponent(reason)}`}`;
  }

  function currentPage() {
    return decodeURIComponent(location.pathname.split("/").pop() || "index.html");
  }

  // roles may be one role or a list (own role plus any temporary cover).
  function pageAllowed(page, roles) {
    const list = Array.isArray(roles) ? roles : [roles];
    return Boolean(PAGE_ACCESS[page] && list.some((role) => PAGE_ACCESS[page].includes(role)));
  }

  // Runs synchronously in <head> before any page content is drawn.
  function guardPage() {
    const page = currentPage();
    const result = checkSession();
    if (!result.ok) {
      if (result.reason !== "signed-out") endSession(result.reason);
      location.replace(`login.html?next=${encodeURIComponent(page + location.search)}${result.reason === "signed-out" ? "" : `&reason=${result.reason}`}`);
      return null;
    }
    if (!pageAllowed(page, result.user.roles)) {
      audit("Access denied", `Tried to open ${page}`, "blocked", result.user);
      location.replace(`${HOME[result.user.role]}?denied=${encodeURIComponent(page)}`);
      return null;
    }
    touchSession();
    return result.user;
  }

  const allowed = (user, action) => Boolean(user && PERMISSIONS[action] && user.roles.some((role) => PERMISSIONS[action].includes(role)));

  function can(action) {
    return allowed(currentUser(), action);
  }

  // Throws if the signed-in user may not perform the action; the attempt is logged.
  function authorize(action, detail) {
    const user = currentUser();
    if (!allowed(user, action)) {
      audit("Action blocked", `${action}${detail ? ` · ${detail}` : ""}`, "blocked", user);
      throw new Error("You do not have permission to do this.");
    }
    touchSession();
    return user;
  }

  /* ---------- Audit log ---------- */

  function audit(action, detail, outcome = "ok", actor) {
    const who = actor || (() => {
      const token = tabToken();
      const session = token && loadSessions()[token];
      return session ? loadUsers().find((u) => u.id === session.userId) : null;
    })();
    const entries = read(KEYS.audit, []);
    const list = Array.isArray(entries) ? entries : [];
    list.push({ at: nowIso(), actor: who ? who.name : "Unknown", role: who ? roleText(who) : "", action, detail: detail || "", outcome });
    if (list.length > 1000) list.splice(0, list.length - 1000);
    write(KEYS.audit, list);
  }

  function loadAudit() {
    authorize("audit.view");
    const entries = read(KEYS.audit, []);
    return Array.isArray(entries) ? entries.slice().reverse() : [];
  }

  /* ---------- Administration (system administrator only) ---------- */

  const activeAdmins = (users) => users.filter((user) => user.role === "admin" && !user.disabled).length;
  const cleanName = (name) => String(name || "").trim().replace(/\s+/g, " ");

  async function adminAddUser(name, email, role) {
    const actor = authorize("users.manage", "add account");
    const clean = cleanName(name);
    const mail = String(email || "").trim().toLowerCase();
    if (!clean) return { ok: false, field: "name", error: "Enter the person's full name." };
    if (!isEmail(mail)) return { ok: false, field: "email", error: "Enter a valid email address, for example name@example.com." };
    if (!ROLES[role]) return { ok: false, field: "role", error: "Choose a role." };
    if (findUser(clean)) return { ok: false, field: "name", error: "An account with this name already exists." };
    if (findUser(mail)) return { ok: false, field: "email", error: "An account with this email already exists." };
    const tempPassword = generateTempPassword();
    const hashed = await hashPassword(tempPassword);
    const users = loadUsers();
    users.push({
      id: `u-${randomHex(6)}`, name: clean, email: mail, role, ...hashed, mustChange: true, failed: 0, lockedUntil: null,
      disabled: false, sessionVersion: 1, elevation: null, createdAt: nowIso(), lastSignIn: null
    });
    if (!write(KEYS.users, users)) return { ok: false, error: "The account could not be saved." };
    audit("Account created", `${clean} · ${mail} · ${ROLES[role]}`, "ok", actor);
    return { ok: true, tempPassword };
  }

  async function adminResetPassword(userId) {
    const actor = authorize("users.manage", "reset password");
    const target = loadUsers().find((user) => user.id === userId);
    if (!target) return { ok: false, error: "Account not found." };
    const tempPassword = generateTempPassword();
    const hashed = await hashPassword(tempPassword);
    updateUser(userId, (fresh) => {
      Object.assign(fresh, hashed);
      fresh.mustChange = true;
      fresh.failed = 0;
      fresh.lockedUntil = null;
      fresh.sessionVersion = (fresh.sessionVersion || 1) + 1;
    });
    audit("Password reset", `${target.name} must choose a new password at next sign-in`, "ok", actor);
    return { ok: true, tempPassword };
  }

  function adminRemoveUser(userId) {
    const actor = authorize("users.manage", "remove account");
    const users = loadUsers();
    const target = users.find((user) => user.id === userId);
    if (!target) return { ok: false, error: "Account not found." };
    if (target.id === actor.id) return { ok: false, error: "You cannot remove your own account." };
    if (target.role === "admin" && activeAdmins(users) <= 1) return { ok: false, error: "At least one administrator account must remain." };
    if (!write(KEYS.users, users.filter((user) => user.id !== userId))) return { ok: false, error: "The change could not be saved." };
    audit("Account removed", `${target.name} · ${target.email || ""} · ${ROLES[target.role]} (their past records are kept)`, "ok", actor);
    return { ok: true };
  }

  function adminSetDisabled(userId, disabled) {
    const actor = authorize("users.manage", disabled ? "disable account" : "enable account");
    const users = loadUsers();
    const target = users.find((user) => user.id === userId);
    if (!target) return { ok: false, error: "Account not found." };
    if (target.id === actor.id) return { ok: false, error: "You cannot disable your own account." };
    if (disabled && target.role === "admin" && activeAdmins(users) <= 1) return { ok: false, error: "At least one administrator account must stay active." };
    updateUser(userId, (fresh) => {
      fresh.disabled = disabled;
      fresh.sessionVersion = (fresh.sessionVersion || 1) + 1;
    });
    audit(disabled ? "Account disabled" : "Account enabled", target.name, "ok", actor);
    return { ok: true };
  }

  function adminUnlock(userId) {
    const actor = authorize("users.manage", "unlock account");
    const target = updateUser(userId, (fresh) => { fresh.lockedUntil = null; fresh.failed = 0; });
    if (!target) return { ok: false, error: "Account not found." };
    audit("Account unlocked", target.name, "ok", actor);
    return { ok: true };
  }

  function adminChangeRole(userId, role) {
    const actor = authorize("users.manage", "change role");
    const users = loadUsers();
    const target = users.find((user) => user.id === userId);
    if (!target || !ROLES[role]) return { ok: false, error: "Account not found." };
    if (target.id === actor.id) return { ok: false, error: "You cannot change your own role." };
    if (target.role === "admin" && role !== "admin" && activeAdmins(users) <= 1) return { ok: false, error: "At least one administrator account must remain." };
    updateUser(userId, (fresh) => {
      fresh.role = role;
      fresh.elevation = null;
      fresh.sessionVersion = (fresh.sessionVersion || 1) + 1; // signs them out everywhere
    });
    audit("Role changed", `${target.name}: ${ROLES[target.role]} → ${ROLES[role]}`, "ok", actor);
    return { ok: true };
  }

  // Elevation: a care worker or maintenance member covers for the manager for a set time.
  function adminGrantElevation(userId, untilIso, reason) {
    const actor = authorize("users.elevate", "grant cover");
    const target = loadUsers().find((user) => user.id === userId);
    if (!target) return { ok: false, field: "person", error: "Choose a person." };
    if (target.disabled) return { ok: false, field: "person", error: "This account is disabled." };
    if (target.role === "manager" || target.role === "admin") return { ok: false, field: "person", error: "Only care staff or maintenance team members can cover for the manager." };
    const until = Date.parse(untilIso);
    if (!(until > Date.now())) return { ok: false, field: "date", error: "The end of the cover must be in the future." };
    if (until - Date.now() > MAX_ELEVATION_DAYS * 86400000) return { ok: false, field: "date", error: `Cover can last up to ${MAX_ELEVATION_DAYS} days. Grant it again if more is needed.` };
    if (!String(reason || "").trim()) return { ok: false, field: "reason", error: "Give a reason, for example: Manager on annual leave." };
    updateUser(userId, (fresh) => {
      fresh.elevation = { role: "manager", from: nowIso(), until: new Date(until).toISOString(), reason: reason.trim(), grantedBy: actor.name, grantedAt: nowIso() };
    });
    audit("Cover granted", `${target.name} covers as Home manager until ${formatDateTime(until)} · ${reason.trim()}`, "ok", actor);
    return { ok: true };
  }

  function adminEndElevation(userId) {
    const actor = authorize("users.elevate", "end cover");
    const target = loadUsers().find((user) => user.id === userId);
    if (!target || !target.elevation) return { ok: false, error: "There is no cover to end." };
    updateUser(userId, (fresh) => { fresh.elevation = { ...fresh.elevation, until: nowIso(), endedBy: actor.name }; });
    audit("Cover ended", `${target.name} no longer covers as Home manager`, "ok", actor);
    return { ok: true };
  }

  function adminListUsers() {
    authorize("users.manage", "view accounts");
    return loadUsers().map((user) => ({
      id: user.id, name: user.name, email: user.email || "", role: user.role, disabled: Boolean(user.disabled),
      locked: Boolean(user.lockedUntil && Date.parse(user.lockedUntil) > Date.now()),
      mustChange: Boolean(user.mustChange), lastSignIn: user.lastSignIn, createdAt: user.createdAt,
      elevation: user.elevation || null, elevationActive: Boolean(activeElevation(user))
    }));
  }

  /* ---------- System maintenance (administrator) ---------- */

  function systemReport() {
    authorize("system.maintain");
    const sizes = {};
    let total = 0;
    Object.entries(KEYS).forEach(([name, key]) => {
      const raw = localStorage.getItem(key) || "";
      sizes[name] = raw.length * 2;
      total += raw.length * 2;
    });
    const sessions = loadSessions();
    const now = Date.now();
    const activeSessions = Object.values(sessions).filter((s) => now - Date.parse(s.lastActive) <= IDLE_LIMIT_MS).length;
    const auditList = read(KEYS.audit, []);
    return {
      sizes, total, activeSessions,
      counts: {
        users: loadUsers().length, jobs: loadJobs().length, announcements: loadAnnouncements().length,
        audit: Array.isArray(auditList) ? auditList.length : 0, sampleJobs: loadJobs().filter((job) => job.sample).length
      }
    };
  }

  // Backups hold operational records only – never accounts or password hashes.
  function exportBackup() {
    const actor = authorize("system.maintain", "export backup");
    audit("Backup downloaded", "Jobs, safety checks, announcements and security log", "ok", actor);
    return {
      app: "meadow-house-repairs", version: 1, exportedAt: nowIso(), exportedBy: actor.name,
      jobs: loadJobs(), tasks: loadTaskRecords(), announcements: loadAnnouncements(), settings: read(KEYS.settings, {}), audit: read(KEYS.audit, [])
    };
  }

  function importBackup(data) {
    const actor = authorize("system.maintain", "restore backup");
    if (!data || data.app !== "meadow-house-repairs" || !Array.isArray(data.jobs) || !Array.isArray(data.announcements) || !data.tasks || typeof data.tasks !== "object") {
      return { ok: false, error: "This file is not a Meadow House backup." };
    }
    const jobs = data.jobs.filter(isValidJob);
    if (jobs.length !== data.jobs.length) return { ok: false, error: "Some repair records in the backup are damaged, so nothing was restored." };
    write(KEYS.jobs, jobs);
    write(KEYS.tasks, data.tasks);
    write(KEYS.announcements, data.announcements.filter((a) => a && typeof a.id === "string" && typeof a.title === "string"));
    if (data.settings && typeof data.settings === "object") write(KEYS.settings, data.settings);
    audit("Backup restored", `${jobs.length} jobs from a backup made ${data.exportedAt ? formatDateTime(data.exportedAt) : "on an unknown date"}`, "ok", actor);
    return { ok: true, jobs: jobs.length };
  }

  function signOutEveryoneElse() {
    const actor = authorize("system.maintain", "sign everyone out");
    const token = tabToken();
    const sessions = loadSessions();
    const kept = token && sessions[token] ? { [token]: sessions[token] } : {};
    const removed = Object.keys(sessions).length - Object.keys(kept).length;
    write(KEYS.sessions, kept);
    audit("Everyone signed out", `${plural(removed, "session")} ended by the administrator`, "ok", actor);
    return { ok: true, removed };
  }

  /* ---------- Repair jobs ---------- */

  const CATEGORIES = [
    "Plumbing & water", "Electrical & lighting", "Heating", "Doors, windows & locks",
    "Furniture & fittings", "Kitchen equipment", "Garden & outside", "Other"
  ];

  function isValidJob(job) {
    return job !== null
      && typeof job === "object"
      && typeof job.id === "string"
      && typeof job.description === "string"
      && typeof job.reporter === "string"
      && (job.priority === "Normal" || job.priority === "Urgent")
      && STATUSES.includes(job.status)
      && typeof job.createdAt === "string"
      && Array.isArray(job.history)
      && job.history.every((entry) => entry && typeof entry.event === "string" && typeof entry.timestamp === "string");
  }

  function loadJobs() {
    try {
      const stored = localStorage.getItem(KEYS.jobs);
      if (stored === null) return [];
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) throw new Error("Saved repair data is not a list.");
      return parsed.filter(isValidJob).map((job) => ({ ...job, house: job.house || HOUSE_NAME }));
    } catch (error) {
      console.error("Unable to load repair jobs from browser storage.", error);
      storageErrorHandler("Saved repair jobs could not be read. Existing browser data has been left untouched.");
      return [];
    }
  }

  const saveJobs = (jobs) => write(KEYS.jobs, jobs);

  function newJobId(jobs) {
    let id;
    do {
      id = `MH-${toInputDate(new Date()).replaceAll("-", "")}-${randomHex(4).toUpperCase()}`;
    } while (jobs.some((job) => job.id === id));
    return id;
  }

  function historyEntry(event, status, user, extra) {
    return { event, status, note: null, by: user ? user.name : undefined, role: user ? roleText(user) : undefined, timestamp: nowIso(), ...extra };
  }

  function addJob({ description, reporter, priority, location, category, safety, photos }) {
    const user = authorize("job.report");
    const jobs = loadJobs();
    const createdAt = nowIso();
    const job = {
      id: newJobId(jobs), house: HOUSE_NAME, description, reporter, priority,
      location: location || "", category: CATEGORIES.includes(category) ? category : "Other",
      source: "Staff report", status: "New", createdAt, safety: Boolean(safety),
      assignedTo: null, appointment: null, attendedAt: null, completedAt: null, confirmation: null,
      photos: photoMeta(photos, "report", user),
      history: [{ ...historyEntry("Repair reported", "New", user), by: reporter, timestamp: createdAt, detail: safety ? "Affects resident safety" : undefined }]
    };
    jobs.push(job);
    if (!saveJobs(jobs)) return null;
    audit("Repair reported", `${job.id} · ${priority}${safety ? " · resident safety" : ""}`, "ok", user);
    const urgent = safety || priority === "Urgent";
    createAlert({
      level: urgent ? "urgent" : "info",
      title: safety ? "Resident safety repair reported" : urgent ? "Urgent repair reported" : "New repair reported",
      body: `${description}${location ? ` – ${location}` : ""} (${job.id}), reported by ${reporter}.`,
      link: "maintenance.html", roles: urgent ? ["maintenance", "manager"] : ["maintenance"]
    });
    return job;
  }

  function photoMeta(photos, kind, user) {
    return (photos || []).map((p) => ({ id: p.id, name: p.name || "", kind, by: user ? user.name : undefined, at: nowIso() }));
  }

  // Always re-reads storage first so a change made in another tab is never overwritten.
  function changeJob(id, permission, mutator) {
    const user = authorize(permission, id);
    const jobs = loadJobs();
    const job = jobs.find((item) => item.id === id);
    if (!job) return { ok: false, error: "This job no longer exists." };
    const problem = mutator(job, user);
    if (problem) return { ok: false, error: problem };
    if (!saveJobs(jobs)) return { ok: false, error: "The change could not be saved." };
    return { ok: true, job, user };
  }

  function assignJob(id, userId) {
    const assignee = maintenanceTeam().find((member) => member.id === userId);
    if (!assignee) return { ok: false, error: "Choose a member of the maintenance team." };
    return changeJob(id, "job.assign", (job, user) => {
      if (job.status === "Completed") return "This job is already completed.";
      job.assignedTo = assignee;
      job.history.push(historyEntry(`Assigned to ${assignee.name}`, job.status, user));
      audit("Job assigned", `${id} → ${assignee.name}`, "ok", user);
      if (assignee.id !== user.id) createAlert({ title: "Job assigned to you", body: `${job.description} (${job.id})${job.location ? ` – ${job.location}` : ""}.`, link: "maintenance.html", userIds: [assignee.id] });
      return "";
    });
  }

  function bookVisit(id, date, time, note) {
    return changeJob(id, "job.book", (job, user) => {
      if (job.status === "Completed" || job.status === "In Progress") return "A visit can only be booked before work starts.";
      const rebook = Boolean(job.appointment);
      job.appointment = { date, time: time || "", status: "Awaiting manager approval", proposedBy: user.name, proposedAt: nowIso() };
      job.status = "Scheduled";
      if (!job.assignedTo) job.assignedTo = publicUser(loadUsers().find((u) => u.id === user.id));
      job.history.push(historyEntry(rebook ? "Visit rebooked" : "Visit booked", "Scheduled", user, {
        note: note || null, detail: `Visit: ${formatAppointment(job.appointment)} · awaiting manager approval`
      }));
      createAlert({ level: "warning", title: "Visit date to approve", body: `${job.description} (${job.id}) – ${formatAppointment(job.appointment)}, booked by ${user.name}.`, link: "manager.html", roles: ["manager"] });
      return "";
    });
  }

  function decideVisit(id, decision, date, time, reason) {
    return changeJob(id, "job.approve", (job, user) => {
      if (!job.appointment || job.status !== "Scheduled") return "There is no booked visit to review.";
      if (decision === "accept") {
        job.appointment = { ...job.appointment, status: "Accepted", decidedBy: user.name, decidedAt: nowIso() };
        job.history.push(historyEntry("Visit accepted by manager", "Scheduled", user, { detail: `Visit: ${formatAppointment(job.appointment)}` }));
      } else {
        const before = formatAppointment(job.appointment);
        job.appointment = { ...job.appointment, date, time: time || "", status: "Changed by manager", decidedBy: user.name, decidedAt: nowIso(), reason };
        job.history.push(historyEntry("Visit date changed by manager", "Scheduled", user, {
          note: reason, detail: `Was ${before} · now ${formatAppointment(job.appointment)}`
        }));
      }
      audit(decision === "accept" ? "Visit accepted" : "Visit date changed", `${id} · ${formatAppointment(job.appointment)}`, "ok", user);
      createAlert({
        level: decision === "accept" ? "info" : "warning",
        title: decision === "accept" ? "Visit date accepted" : "Visit date changed by the manager",
        body: `${job.description} (${job.id}) – ${formatAppointment(job.appointment)}${decision === "accept" ? "" : `. Reason: ${reason}`}.`,
        link: "maintenance.html", userIds: [job.assignedTo && job.assignedTo.id, userIdByName(job.reporter)]
      });
      return "";
    });
  }

  function startWork(id, note, photos) {
    return changeJob(id, "job.work", (job, user) => {
      if (job.status === "Completed") return "This job is already completed.";
      job.photos = [...(job.photos || []), ...photoMeta(photos, job.attendedAt ? "progress" : "before", user)];
      if (!job.attendedAt) job.attendedAt = nowIso();
      if (!job.assignedTo) job.assignedTo = publicUser(loadUsers().find((u) => u.id === user.id));
      job.history.push(historyEntry(job.status === "In Progress" ? "Progress note added" : "Team attended – work started", "In Progress", user, { note }));
      job.status = "In Progress";
      return "";
    });
  }

  function completeJob(id, note, costs, photos) {
    const parts = parseMoney(costs && costs.parts);
    const labour = parseMoney(costs && costs.labour);
    if (Number.isNaN(parts)) return { ok: false, field: "parts", error: "Enter the parts cost in pounds, for example 12.50." };
    if (Number.isNaN(labour)) return { ok: false, field: "labour", error: "Enter the labour cost in pounds, for example 40." };
    return changeJob(id, "job.work", (job, user) => {
      if (job.status === "Completed") return "This job is already completed.";
      if (!job.attendedAt) job.attendedAt = nowIso();
      job.completedAt = nowIso();
      job.status = "Completed";
      job.confirmation = { status: "Awaiting staff confirmation" };
      job.costs = { parts, labour, contractor: String((costs && costs.contractor) || "").trim() };
      job.photos = [...(job.photos || []), ...photoMeta(photos, "after", user)];
      const total = parts + labour;
      job.history.push(historyEntry("Marked Completed", "Completed", user, { note, detail: total || job.costs.contractor ? `Cost: ${formatMoney(total)}${job.costs.contractor ? ` · contractor: ${job.costs.contractor}` : ""}` : undefined }));
      audit("Job completed", id, "ok", user);
      const reporterId = userIdByName(job.reporter);
      createAlert({ title: "Please check a completed repair", body: `${job.description} (${job.id}) has been completed by ${user.name}. Please confirm it is fixed.`, link: "index.html", userIds: [reporterId], roles: reporterId ? [] : ["staff"] });
      return "";
    });
  }

  function confirmJob(id, fixed, note) {
    return changeJob(id, "job.confirm", (job, user) => {
      if (job.status !== "Completed") return "Only completed jobs can be confirmed.";
      if (job.confirmation && job.confirmation.status === "Confirmed") return "This job has already been confirmed.";
      if (fixed) {
        job.confirmation = { status: "Confirmed", by: user.name, role: roleText(user), at: nowIso(), note: note || null };
        job.history.push(historyEntry("Completion confirmed by staff", "Completed", user, { note: note || null }));
      } else {
        job.status = "In Progress";
        job.completedAt = null;
        job.confirmation = null;
        job.reopenCount = (job.reopenCount || 0) + 1;
        job.history.push(historyEntry("Reported as not fixed – reopened", "In Progress", user, { note }));
        createAlert({ level: "urgent", title: "Repair reopened – not fixed", body: `${job.description} (${job.id}): ${note}`, link: "maintenance.html", roles: ["manager"], userIds: [job.assignedTo && job.assignedTo.id] });
      }
      audit(fixed ? "Completion confirmed" : "Job reopened", id, "ok", user);
      return "";
    });
  }

  function jobTimes(job) {
    const find = (test) => job.history.find(test);
    const attended = job.attendedAt || (find((e) => e.status === "In Progress") || {}).timestamp || null;
    let completed = job.completedAt;
    if (!completed && job.status === "Completed") {
      const last = [...job.history].reverse().find((e) => e.status === "Completed" && /complete/i.test(e.event));
      completed = last ? last.timestamp : null;
    }
    return { attended, completed };
  }

  function turnaround(job) {
    const { completed } = jobTimes(job);
    if (!completed) return null;
    const days = daysBetween(new Date(job.createdAt), new Date(completed));
    if (days <= 0) return { key: "same-day", label: "Completed the same day", short: "Same day", days: 0 };
    if (days <= 2) return { key: "within-2", label: `Completed within ${plural(days, "day")}`, short: `${plural(days, "day")}`, days };
    return { key: "longer", label: `Took ${days} days to complete`, short: `${days} days`, days };
  }

  /* ---------- Recurring issues ---------- */

  const STOP_WORDS = new Set("the and for with from that this there have has was were are not but its it's into onto out off very again still keep keeps kept been being near next room area floor side left right broken damaged needs need not working".split(" "));

  function keyWords(job) {
    return new Set(`${job.description} ${job.location || ""}`.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
      .map((word) => word.replace(/(ing|es|s)$/, "")));
  }

  // Groups jobs reported within 120 days of each other that share a place + type of issue,
  // or at least two key words. Returns Map(jobId -> { size, label, ids }).
  function findRecurring(jobs) {
    const parent = jobs.map((_, i) => i);
    const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
    const words = jobs.map(keyWords);
    for (let i = 0; i < jobs.length; i += 1) {
      for (let j = i + 1; j < jobs.length; j += 1) {
        const a = jobs[i], b = jobs[j];
        if (Math.abs(Date.parse(a.createdAt) - Date.parse(b.createdAt)) > 120 * 86400000) continue;
        const samePlace = a.location && b.location && normaliseName(a.location) === normaliseName(b.location);
        const sameType = a.category && a.category === b.category && a.category !== "Other";
        let shared = 0;
        words[i].forEach((word) => { if (words[j].has(word)) shared += 1; });
        if ((samePlace && sameType) || shared >= 2) parent[root(i)] = root(j);
      }
    }
    const groups = new Map();
    jobs.forEach((job, i) => {
      const r = root(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(job);
    });
    const result = new Map();
    groups.forEach((group) => {
      if (group.length < 2) return;
      const sorted = group.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const latest = sorted[sorted.length - 1];
      const label = latest.location ? `${latest.location}${latest.category && latest.category !== "Other" ? ` · ${latest.category}` : ""}` : latest.description.slice(0, 60);
      const info = { size: group.length, label, ids: sorted.map((job) => job.id), jobs: sorted };
      group.forEach((job) => result.set(job.id, info));
    });
    return result;
  }

  /* ---------- Planned maintenance (care home compliance checks) ---------- */

  // Typical intervals for a UK care home. Nothing is assumed: a check has no "last done" date until one is recorded.
  // seedOffset is only used by the optional training data.
  const TASK_TEMPLATES = [
    { id: "fire-alarm-weekly", name: "Fire alarm call-point test", category: "Fire safety", every: 7, unit: "day", seedOffset: -5, guidance: "Test a different call point each week and log the result." },
    { id: "fire-alarm-service", name: "Fire alarm system service", category: "Fire safety", every: 6, unit: "month", seedOffset: -170, guidance: "Inspection and service by a competent fire alarm engineer." },
    { id: "emergency-lighting-monthly", name: "Emergency lighting flick test", category: "Fire safety", every: 1, unit: "month", seedOffset: -27, guidance: "Brief functional test of every emergency light fitting." },
    { id: "emergency-lighting-annual", name: "Emergency lighting full-duration test", category: "Fire safety", every: 12, unit: "month", seedOffset: -300, guidance: "Full rated-duration discharge test, normally 3 hours." },
    { id: "fire-extinguishers", name: "Fire extinguisher service", category: "Fire safety", every: 12, unit: "month", seedOffset: -200, guidance: "Annual service of all extinguishers and fire blankets." },
    { id: "fire-doors", name: "Fire door inspection", category: "Fire safety", every: 6, unit: "month", seedOffset: -190, guidance: "Check closers, seals, hinges, gaps and hold-open devices." },
    { id: "fire-drill", name: "Fire drill and evacuation practice", category: "Fire safety", every: 6, unit: "month", seedOffset: -120, guidance: "Include day and night staffing levels; record who attended." },
    { id: "fire-risk-assessment", name: "Fire risk assessment review", category: "Fire safety", every: 12, unit: "month", seedOffset: -330, guidance: "Review the assessment and resident evacuation plans (PEEPs)." },
    { id: "gas-safety", name: "Gas safety inspection (Gas Safe engineer)", category: "Gas & heating", every: 12, unit: "month", seedOffset: -350, guidance: "Annual check of all gas appliances, flues and pipework." },
    { id: "boiler-service", name: "Boiler service", category: "Gas & heating", every: 12, unit: "month", seedOffset: -345, guidance: "Service heating plant and check safety controls." },
    { id: "eicr", name: "Fixed electrical installation test (EICR)", category: "Electrical", every: 60, unit: "month", seedOffset: -900, guidance: "Periodic inspection of the fixed wiring by a qualified electrician." },
    { id: "pat", name: "Portable appliance testing (PAT)", category: "Electrical", every: 12, unit: "month", seedOffset: -380, guidance: "Test portable electrical equipment and label each item." },
    { id: "nurse-call", name: "Nurse call system service", category: "Electrical", every: 12, unit: "month", seedOffset: -100, guidance: "Service call points, pendants and displays." },
    { id: "water-temps", name: "Water temperature checks (Legionella)", category: "Water safety", every: 1, unit: "month", seedOffset: -20, guidance: "Record hot and cold outlet temperatures at sentinel points." },
    { id: "shower-descale", name: "Shower head descale and disinfect", category: "Water safety", every: 3, unit: "month", seedOffset: -80, guidance: "Clean, descale and disinfect shower heads and hoses." },
    { id: "tmv-service", name: "Thermostatic mixing valve (TMV) service", category: "Water safety", every: 12, unit: "month", seedOffset: -250, guidance: "Check and service valves that prevent scalding." },
    { id: "legionella-ra", name: "Legionella risk assessment review", category: "Water safety", every: 24, unit: "month", seedOffset: -400, guidance: "Review the written water safety risk assessment." },
    { id: "lift-loler", name: "Passenger lift thorough examination (LOLER)", category: "Lifting equipment", every: 6, unit: "month", seedOffset: -160, guidance: "Six-monthly thorough examination by a competent person." },
    { id: "hoist-loler", name: "Hoists and slings examination (LOLER)", category: "Lifting equipment", every: 6, unit: "month", seedOffset: -176, guidance: "Six-monthly examination of resident hoists and slings." },
    { id: "bed-rails", name: "Bed rail and profiling bed checks", category: "Resident safety", every: 1, unit: "month", seedOffset: -15, guidance: "Check fit, gaps and condition of bed rails and bed functions." },
    { id: "window-restrictors", name: "Window restrictor checks", category: "Resident safety", every: 1, unit: "month", seedOffset: -33, guidance: "Confirm restrictors are fitted, secure and limit opening." },
    { id: "asbestos", name: "Asbestos register review", category: "Building", every: 12, unit: "month", seedOffset: -60, guidance: "Review the asbestos register and condition of any known materials." },
    { id: "kitchen-extract", name: "Kitchen extract and ductwork clean", category: "Building", every: 12, unit: "month", seedOffset: -280, guidance: "Specialist clean to reduce fire risk from grease build-up." }
  ];

  function frequencyLabel(task) {
    if (task.unit === "day") return task.every === 7 ? "Weekly" : `Every ${plural(task.every, "day")}`;
    if (task.every === 1) return "Monthly";
    if (task.every === 12) return "Annually";
    if (task.every % 12 === 0) return `Every ${task.every / 12} years`;
    return `Every ${task.every} months`;
  }

  function addInterval(date, every, unit) {
    if (unit === "day") return new Date(date.getFullYear(), date.getMonth(), date.getDate() + every);
    const target = new Date(date.getFullYear(), date.getMonth() + every, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(date.getDate(), lastDay));
    return target;
  }

  function loadTaskRecords() {
    const stored = read(KEYS.tasks, null);
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  }

  const emptyRecord = () => ({ lastDone: null, log: [], assignedTo: null, appointment: null, certificates: [] });

  function loadTasks() {
    const records = loadTaskRecords();
    return TASK_TEMPLATES.map((template) => {
      const record = records[template.id] || emptyRecord();
      return {
        ...template, certType: CERT_TYPES[template.id] || null,
        certificates: Array.isArray(record.certificates) ? record.certificates : [],
        lastDone: parseInputDate(record.lastDone) ? record.lastDone : null,
        log: Array.isArray(record.log) ? record.log : [],
        assignedTo: record.assignedTo || null, appointment: record.appointment || null
      };
    });
  }

  function taskState(task) {
    if (!task.lastDone) return { key: "missing", label: "Not recorded", detail: "Record the last check to start the schedule", due: null, days: -100000 };
    const due = addInterval(parseInputDate(task.lastDone), task.every, task.unit);
    const days = daysBetween(new Date(), due);
    const soonWindow = task.unit === "day" ? 2 : task.every <= 1 ? 7 : 30;
    if (days < 0) return { key: "overdue", label: "Overdue", detail: `Overdue by ${plural(-days, "day")}`, due, days };
    if (days === 0) return { key: "soon", label: "Due today", detail: "Due today", due, days };
    if (days <= soonWindow) return { key: "soon", label: "Due soon", detail: `Due in ${plural(days, "day")}`, due, days };
    return { key: "ok", label: "Up to date", detail: `Due in ${plural(days, "day")}`, due, days };
  }

  function changeTask(id, permission, mutator) {
    const user = authorize(permission, id);
    if (!TASK_TEMPLATES.some((t) => t.id === id)) return { ok: false, error: "Check not found." };
    const records = loadTaskRecords();
    const record = records[id] || (records[id] = emptyRecord());
    const problem = mutator(record, user);
    if (problem) return { ok: false, error: problem };
    if (!write(KEYS.tasks, records)) return { ok: false, error: "The check could not be saved." };
    return { ok: true, user };
  }

  function assignTask(id, userId) {
    const assignee = maintenanceTeam().find((member) => member.id === userId);
    if (!assignee) return { ok: false, error: "Choose a member of the maintenance team." };
    return changeTask(id, "task.assign", (record, user) => {
      record.assignedTo = assignee;
      audit("Check assigned", `${id} → ${assignee.name}`, "ok", user);
      return "";
    });
  }

  function bookTask(id, date, time) {
    return changeTask(id, "task.book", (record, user) => {
      record.appointment = { date, time: time || "", status: "Awaiting manager approval", proposedBy: user.name, proposedAt: nowIso() };
      if (!record.assignedTo) record.assignedTo = publicUser(loadUsers().find((u) => u.id === user.id));
      audit("Check booked", `${id} · ${formatAppointment(record.appointment)}`, "ok", user);
      createAlert({ level: "warning", title: "Safety check date to approve", body: `${(TASK_TEMPLATES.find((t) => t.id === id) || {}).name} – ${formatAppointment(record.appointment)}, booked by ${user.name}.`, link: "manager.html", roles: ["manager"] });
      return "";
    });
  }

  function decideTask(id, decision, date, time, reason) {
    return changeTask(id, "task.approve", (record, user) => {
      if (!record.appointment) return "There is no booked date to review.";
      if (decision === "accept") {
        record.appointment = { ...record.appointment, status: "Accepted", decidedBy: user.name, decidedAt: nowIso() };
      } else {
        record.appointment = { ...record.appointment, date, time: time || "", status: "Changed by manager", decidedBy: user.name, decidedAt: nowIso(), reason };
      }
      audit(decision === "accept" ? "Check date accepted" : "Check date changed", `${id} · ${formatAppointment(record.appointment)}`, "ok", user);
      return "";
    });
  }

  function recordTask(id, date, note, cert) {
    const hasCert = cert && Object.values(cert).some((v) => v);
    if (hasCert) {
      if (!String(cert.reference || "").trim()) return { ok: false, field: "reference", error: "Enter the certificate or report number." };
      if (!parseInputDate(cert.expires)) return { ok: false, field: "expires", error: "Enter the date the certificate expires." };
      if (cert.expires <= date) return { ok: false, field: "expires", error: "The expiry date must be after the date of the check." };
    }
    return changeTask(id, "task.record", (record, user) => {
      if (parseInputDate(record.lastDone) && date < record.lastDone) return "This date is earlier than the last recorded check.";
      record.lastDone = date;
      delete record.sampleLastDone;
      record.appointment = null;
      record.log = [...(record.log || []), { date, by: user.name, note: note || null, recordedAt: nowIso() }];
      if (hasCert) {
        record.certificates = [...(record.certificates || []), {
          id: `C-${randomHex(4).toUpperCase()}`, type: CERT_TYPES[id] || "Certificate", reference: cert.reference.trim(), issued: date, expires: cert.expires,
          contractor: String(cert.contractor || "").trim(), registration: String(cert.registration || "").trim(),
          fileId: cert.fileId || null, fileName: cert.fileName || "", recordedBy: user.name, recordedAt: nowIso()
        }];
      }
      audit("Check recorded", `${id} · ${date}${hasCert ? ` · certificate ${cert.reference.trim()}` : ""}`, "ok", user);
      return "";
    });
  }

  /* ---------- Announcements (maintenance requested by the manager) ---------- */

  function loadAnnouncements() {
    const list = read(KEYS.announcements, []);
    return Array.isArray(list) ? list.filter((a) => a && typeof a.id === "string" && typeof a.title === "string") : [];
  }

  // A manager's maintenance request creates a scheduled, assigned job plus a staff announcement.
  function requestMaintenance({ title, message, location, date, time, assigneeId, priority }) {
    const user = authorize("announce.create");
    authorize("job.request");
    const assignee = maintenanceTeam().find((member) => member.id === assigneeId) || null;
    const jobs = loadJobs();
    const createdAt = nowIso();
    const appointment = { date, time: time || "", status: "Accepted", proposedBy: user.name, proposedAt: createdAt, decidedBy: user.name, decidedAt: createdAt };
    const job = {
      id: newJobId(jobs), house: HOUSE_NAME, description: title, reporter: user.name, priority: priority === "Urgent" ? "Urgent" : "Normal",
      location: location || "", category: "Other", source: "Manager request", status: "Scheduled", createdAt,
      assignedTo: assignee, appointment, attendedAt: null, completedAt: null, confirmation: null,
      history: [
        historyEntry("Maintenance requested by manager", "New", user, { timestamp: createdAt }),
        historyEntry("Visit scheduled by manager", "Scheduled", user, { detail: `Visit: ${formatAppointment(appointment)}${assignee ? ` · assigned to ${assignee.name}` : ""}`, timestamp: createdAt })
      ]
    };
    jobs.push(job);
    if (!saveJobs(jobs)) return { ok: false, error: "The request could not be saved." };
    const list = loadAnnouncements();
    const announcement = { id: `A-${randomHex(4).toUpperCase()}`, title, message, location: location || "", date, time: time || "", jobId: job.id, createdBy: user.name, createdAt, readBy: {} };
    list.push(announcement);
    if (!write(KEYS.announcements, list)) return { ok: false, error: "The announcement could not be saved." };
    audit("Maintenance requested", `${job.id} · announcement ${announcement.id}`, "ok", user);
    createAlert({ title: "New announcement", body: `${title} – ${formatAppointment(announcement)}${location ? ` · ${location}` : ""}.`, link: "announcements.html", roles: ["staff", "maintenance"] });
    if (assignee) createAlert({ title: "Job assigned to you", body: `${title} (${job.id}) on ${formatAppointment(appointment)}.`, link: "maintenance.html", userIds: [assignee.id] });
    return { ok: true, job, announcement };
  }

  function markAnnouncementRead(id) {
    const user = authorize("announce.read");
    const list = loadAnnouncements();
    const item = list.find((a) => a.id === id);
    if (!item) return { ok: false, error: "Announcement not found." };
    item.readBy = item.readBy || {};
    if (!item.readBy[user.id]) item.readBy[user.id] = { name: user.name, at: nowIso() };
    return write(KEYS.announcements, list) ? { ok: true } : { ok: false, error: "Could not be saved." };
  }

  function unreadAnnouncements(user) {
    return loadAnnouncements().filter((a) => !(a.readBy && a.readBy[user.id])).length;
  }

  /* ---------- Training data (administrator only) ---------- */

  function loadSampleHistory() {
    const user = authorize("data.sample");
    const team = maintenanceTeam();
    const pick = (i) => team.length ? team[i % team.length] : null;
    const samples = [
      ["Kitchen tap dripping constantly", "Kitchen", "Plumbing & water", "Normal", 170, 0, 1, "Replaced tap washer."],
      ["Lounge ceiling light flickering", "Lounge", "Electrical & lighting", "Normal", 160, 1, 2, "Replaced faulty starter and tube."],
      ["Room 12 window will not close fully", "Room 12", "Doors, windows & locks", "Urgent", 150, 0, 0, "Adjusted hinge and restrictor."],
      ["Radiator cold in dining room", "Dining room", "Heating", "Normal", 138, 1, 3, "Bled radiator and balanced system."],
      ["Kitchen tap leaking under sink", "Kitchen", "Plumbing & water", "Normal", 120, 0, 1, "Tightened compression joint."],
      ["Garden gate latch loose", "Garden", "Garden & outside", "Normal", 112, 2, 5, "Fitted new latch."],
      ["Bathroom 2 extractor fan noisy", "Bathroom 2", "Electrical & lighting", "Normal", 98, 1, 2, "Cleaned and lubricated fan."],
      ["Room 12 window draughty and sticking", "Room 12", "Doors, windows & locks", "Normal", 90, 1, 2, "Replaced seal; frame needs review."],
      ["Wardrobe door off hinge in Room 4", "Room 4", "Furniture & fittings", "Normal", 75, 3, 6, "Replaced hinge."],
      ["Dishwasher not draining", "Kitchen", "Kitchen equipment", "Urgent", 66, 0, 0, "Cleared blocked filter."],
      ["Kitchen tap dripping again", "Kitchen", "Plumbing & water", "Normal", 52, 0, 1, "Replaced whole tap cartridge."],
      ["Hallway light out by stairs", "Hallway", "Electrical & lighting", "Urgent", 41, 0, 0, "Replaced bulb; checked circuit."],
      ["Shower over-temperature in Bathroom 1", "Bathroom 1", "Plumbing & water", "Urgent", 30, 0, 0, "Serviced TMV and retested."],
      ["Room 12 window restrictor loose", "Room 12", "Doors, windows & locks", "Urgent", 21, 0, 1, "Refitted restrictor with security screws."],
      ["Lounge radiator valve leaking", "Lounge", "Heating", "Normal", 12, 1, 4, "Replaced valve head."],
      ["Garden bench broken slat", "Garden", "Garden & outside", "Normal", 6, 2, 3, "Replaced slat."]
    ];
    const jobs = loadJobs().filter((job) => !job.sample);
    const day = 86400000;
    samples.forEach(([description, location, category, priority, ago, attendDays, completeDays, note], index) => {
      const created = new Date(Date.now() - ago * day);
      created.setHours(9 + (index % 5), 10 + index, 0, 0);
      const attended = new Date(created.getTime() + attendDays * day + 2 * 3600000);
      const completed = new Date(created.getTime() + completeDays * day + 5 * 3600000);
      const who = pick(index);
      const reporter = SAMPLE_REPORTERS[index % SAMPLE_REPORTERS.length];
      const iso = (d) => d.toISOString();
      jobs.push({
        id: `MH-${toInputDate(created).replaceAll("-", "")}-S${String(index + 1).padStart(3, "0")}`, house: HOUSE_NAME,
        description, reporter, priority, location, category, source: "Staff report", status: "Completed", sample: true,
        createdAt: iso(created), assignedTo: who, appointment: null, attendedAt: iso(attended), completedAt: iso(completed),
        confirmation: { status: "Confirmed", by: reporter, role: ROLES.staff, at: iso(new Date(completed.getTime() + 3600000)), note: null },
        history: [
          { event: "Repair reported", status: "New", note: null, by: reporter, timestamp: iso(created) },
          { event: `Assigned to ${who ? who.name : "maintenance"}`, status: "New", note: null, by: who ? who.name : undefined, timestamp: iso(new Date(created.getTime() + 1800000)) },
          { event: "Team attended – work started", status: "In Progress", note: "Inspected and started repair.", by: who ? who.name : undefined, timestamp: iso(attended) },
          { event: "Marked Completed", status: "Completed", note, by: who ? who.name : undefined, timestamp: iso(completed) },
          { event: "Completion confirmed by staff", status: "Completed", note: null, by: reporter, timestamp: iso(new Date(completed.getTime() + 3600000)) }
        ]
      });
    });
    saveJobs(jobs);

    // Example safety check history, so trainees can see the schedule, chart and reminders working.
    const records = loadTaskRecords();
    TASK_TEMPLATES.forEach((template) => {
      const record = records[template.id] || (records[template.id] = emptyRecord());
      if (!parseInputDate(record.lastDone)) {
        record.lastDone = toInputDate(new Date(Date.now() + template.seedOffset * day));
        record.sampleLastDone = true;
        record.log = [...(record.log || []), { date: record.lastDone, by: "Training data", note: null, recordedAt: null, sample: true }];
      }
    });
    TASK_TEMPLATES.filter((t) => t.unit === "day" || t.every <= 3).forEach((template) => {
      const record = records[template.id];
      const step = template.unit === "day" ? template.every : template.every * 30;
      const existing = new Set((record.log || []).map((entry) => entry.date));
      for (let ago = 180; ago > Math.abs(template.seedOffset); ago -= step) {
        const date = toInputDate(new Date(Date.now() - ago * day));
        if (!existing.has(date)) record.log.push({ date, by: pick(ago)?.name || "Maintenance team", note: null, recordedAt: null, sample: true });
      }
      record.log.sort((a, b) => a.date.localeCompare(b.date));
    });
    write(KEYS.tasks, records);
    audit("Training data added", `${samples.length} example repairs and safety check history`, "ok", user);
    return { ok: true, count: samples.length };
  }

  function removeSampleHistory() {
    const user = authorize("data.sample");
    saveJobs(loadJobs().filter((job) => !job.sample));
    const records = loadTaskRecords();
    Object.values(records).forEach((record) => {
      record.log = (record.log || []).filter((entry) => !entry.sample);
      if (record.sampleLastDone) {
        const real = record.log[record.log.length - 1];
        record.lastDone = real ? real.date : null;
        delete record.sampleLastDone;
      }
    });
    write(KEYS.tasks, records);
    audit("Training data removed", "", "ok", user);
    return { ok: true };
  }

  /* ---------- Settings: rooms, response targets, system web address ---------- */

  const DEFAULT_LOCATIONS = [
    "Kitchen", "Lounge", "Dining room", "Hallway", "Laundry", "Garden", "Office", "Bathroom 1", "Bathroom 2",
    ...Array.from({ length: 12 }, (_, i) => `Room ${i + 1}`)
  ];
  // Hours from the report to attending and to completing, by type of repair.
  const DEFAULT_TARGETS = {
    safety: { attend: 4, complete: 24 },
    urgent: { attend: 24, complete: 72 },
    normal: { attend: 72, complete: 336 }
  };
  const TARGET_LABELS = { safety: "Resident safety", urgent: "Urgent", normal: "Normal" };

  function loadSettings() {
    const stored = read(KEYS.settings, {}) || {};
    const targets = {};
    Object.keys(DEFAULT_TARGETS).forEach((key) => {
      const s = stored.targets && stored.targets[key];
      targets[key] = {
        attend: s && Number(s.attend) > 0 ? Number(s.attend) : DEFAULT_TARGETS[key].attend,
        complete: s && Number(s.complete) > 0 ? Number(s.complete) : DEFAULT_TARGETS[key].complete
      };
    });
    const locations = Array.isArray(stored.locations) ? stored.locations.filter((l) => typeof l === "string" && l.trim()) : DEFAULT_LOCATIONS.slice();
    return { appUrl: typeof stored.appUrl === "string" ? stored.appUrl : "", targets, locations };
  }

  function saveSettings(settings) {
    return write(KEYS.settings, settings);
  }

  // The web address printed in room QR codes. Defaults to where the system is being used.
  function systemUrl() {
    const configured = loadSettings().appUrl;
    if (configured) return configured.endsWith("/") ? configured : `${configured}/`;
    if (/^https?:$/.test(location.protocol)) return location.href.replace(/[^/]*([?#].*)?$/, "");
    return "";
  }

  function setSystemUrl(url) {
    const actor = authorize("system.maintain", "set web address");
    const clean = String(url || "").trim();
    if (clean && !/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(clean)) return { ok: false, field: "url", error: "Enter the full secure web address, starting with https://" };
    const settings = loadSettings();
    settings.appUrl = clean;
    if (!saveSettings(settings)) return { ok: false, error: "The setting could not be saved." };
    audit("Web address set", clean || "Cleared", "ok", actor);
    return { ok: true };
  }

  function setTargets(targets) {
    const actor = authorize("system.maintain", "change response targets");
    const settings = loadSettings();
    for (const key of Object.keys(DEFAULT_TARGETS)) {
      const t = targets[key];
      if (!t || !(t.attend > 0) || !(t.complete > 0) || t.attend > 2000 || t.complete > 4000) return { ok: false, field: `${key}-attend`, error: "Enter hours greater than 0." };
      if (t.complete < t.attend) return { ok: false, field: `${key}-complete`, error: "The time to complete cannot be shorter than the time to attend." };
      settings.targets[key] = { attend: Number(t.attend), complete: Number(t.complete) };
    }
    if (!saveSettings(settings)) return { ok: false, error: "The targets could not be saved." };
    audit("Response targets changed", Object.entries(settings.targets).map(([k, t]) => `${TARGET_LABELS[k]}: ${t.attend}h / ${t.complete}h`).join(" · "), "ok", actor);
    return { ok: true };
  }

  function addLocation(name) {
    const actor = authorize("locations.manage", "add room");
    const clean = String(name || "").trim().replace(/\s+/g, " ");
    if (!clean) return { ok: false, field: "name", error: "Enter the room or area name." };
    if (clean.length > 60) return { ok: false, field: "name", error: "Keep the name under 60 characters." };
    const settings = loadSettings();
    if (settings.locations.some((l) => l.toLowerCase() === clean.toLowerCase())) return { ok: false, field: "name", error: "That room is already on the list." };
    settings.locations.push(clean);
    if (!saveSettings(settings)) return { ok: false, error: "The room could not be saved." };
    audit("Room added", clean, "ok", actor);
    return { ok: true };
  }

  function removeLocation(name) {
    const actor = authorize("locations.manage", "remove room");
    const settings = loadSettings();
    settings.locations = settings.locations.filter((l) => l !== name);
    if (!saveSettings(settings)) return { ok: false, error: "The change could not be saved." };
    audit("Room removed", name, "ok", actor);
    return { ok: true };
  }

  /* ---------- Response targets ---------- */

  const jobClass = (job) => (job.safety ? "safety" : job.priority === "Urgent" ? "urgent" : "normal");

  function hoursText(hours) {
    if (hours < 24) return plural(hours, "hour");
    if (hours % 168 === 0) return plural(hours / 168, "week");
    if (hours % 24 === 0) return plural(hours / 24, "day");
    return plural(hours, "hour");
  }

  function responseTargets(job) {
    const cls = jobClass(job);
    const target = loadSettings().targets[cls];
    const created = Date.parse(job.createdAt);
    const attendBy = created + target.attend * 3600000;
    const completeBy = created + target.complete * 3600000;
    const { attended, completed } = jobTimes(job);
    const state = (doneAt, by) => (doneAt ? (Date.parse(doneAt) <= by ? "met" : "missed") : (Date.now() > by ? "overdue" : "due"));
    return {
      cls, label: TARGET_LABELS[cls], attendText: hoursText(target.attend), completeText: hoursText(target.complete),
      attendBy, completeBy, attend: state(attended, attendBy), complete: state(completed, completeBy)
    };
  }

  /* ---------- Costs ---------- */

  function parseMoney(value) {
    if (value === undefined || value === null || String(value).trim() === "") return 0;
    const n = Number(String(value).replace(/[£,\s]/g, ""));
    return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n * 100) / 100 : NaN;
  }

  const formatMoney = (n) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n || 0);
  const jobCost = (job) => (job.costs ? (job.costs.parts || 0) + (job.costs.labour || 0) : 0);

  /* ---------- Alerts ---------- */

  function loadAlerts() {
    const list = read(KEYS.alerts, []);
    return Array.isArray(list) ? list.filter((a) => a && typeof a.id === "string") : [];
  }

  const userIdByName = (name) => (loadUsers().find((u) => normaliseName(u.name) === normaliseName(name)) || {}).id;

  // audience: roles and/or userIds. key prevents the same alert being raised twice.
  function createAlert({ level = "info", title, body, link, roles = [], userIds = [], key }) {
    const list = loadAlerts();
    if (key && list.some((a) => a.key === key)) return;
    list.push({ id: `N-${randomHex(5)}`, at: nowIso(), level, title, body, link, roles, userIds: userIds.filter(Boolean), key: key || null, readBy: {} });
    if (list.length > 400) list.splice(0, list.length - 400);
    write(KEYS.alerts, list);
  }

  function alertsFor(user) {
    if (!user) return [];
    return loadAlerts().filter((a) => a.userIds.includes(user.id) || a.roles.some((r) => user.roles.includes(r)))
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  function markAlertsRead(ids) {
    const user = currentUser();
    if (!user) return;
    const list = loadAlerts();
    list.forEach((a) => { if (ids.includes(a.id) && !a.readBy[user.id]) a.readBy[user.id] = nowIso(); });
    write(KEYS.alerts, list);
  }

  // Email addresses of everyone an alert is meant for (managers and admins only).
  function alertRecipients(alert) {
    authorize("alerts.email");
    return loadUsers().filter((u) => !u.disabled && u.email && (alert.userIds.includes(u.id) || alert.roles.some((r) => effectiveRoles(u).includes(r))))
      .map((u) => u.email);
  }

  // Raised whenever a page opens: safety checks due, certificates expiring, repairs past target.
  function runScheduledChecks() {
    const last = Number(sessionStorage.getItem("mh-last-scan") || 0);
    if (Date.now() - last < 10 * 60000) return;
    try { sessionStorage.setItem("mh-last-scan", String(Date.now())); } catch (error) { /* ignore */ }
    loadTasks().forEach((task) => {
      const s = taskState(task);
      if (s.key === "missing") {
        // nothing to remind about until a first date is recorded
      } else if (s.key === "overdue") {
        createAlert({ level: "urgent", title: "Safety check overdue", body: `${task.name} was due ${formatDate(s.due)}.`, link: "maintenance.html", roles: ["maintenance", "manager"], key: `task-overdue:${task.id}:${task.lastDone}` });
      } else if (s.days <= 7) {
        createAlert({ level: "warning", title: "Safety check due soon", body: `${task.name} is due ${formatDate(s.due)}.`, link: "maintenance.html", roles: ["maintenance", "manager"], key: `task-soon:${task.id}:${task.lastDone}` });
      }
      const cert = task.certificates[task.certificates.length - 1];
      if (cert) {
        const c = certificateState(cert);
        if (c.key !== "valid") {
          createAlert({ level: c.key === "expired" ? "urgent" : "warning", title: c.key === "expired" ? "Certificate expired" : "Certificate expiring soon", body: `${cert.type} (${cert.reference}) ${c.key === "expired" ? "expired" : "expires"} ${formatDate(cert.expires)}.`, link: "manager.html", roles: ["maintenance", "manager"], key: `cert:${cert.id}:${c.key}` });
        }
      }
    });
    loadJobs().filter((job) => job.status !== "Completed").forEach((job) => {
      const t = responseTargets(job);
      ["attend", "complete"].forEach((stage) => {
        if (t[stage] === "overdue") {
          createAlert({ level: "urgent", title: `Repair past its ${stage === "attend" ? "attendance" : "completion"} target`, body: `${job.description} (${job.id}) – ${t.label} target: ${stage === "attend" ? `attend within ${t.attendText}` : `complete within ${t.completeText}`}.`, link: "maintenance.html", roles: ["manager"], userIds: [job.assignedTo && job.assignedTo.id], key: `target:${job.id}:${stage}` });
        }
      });
    });
  }

  /* ---------- Certificates ---------- */

  const CERT_TYPES = {
    "gas-safety": "Gas Safety Record (CP12)", "boiler-service": "Boiler service record", eicr: "Electrical Installation Condition Report (EICR)",
    pat: "PAT test certificate", "nurse-call": "Nurse call service record", "fire-alarm-service": "Fire alarm service certificate",
    "emergency-lighting-annual": "Emergency lighting test certificate", "fire-extinguishers": "Fire extinguisher service certificate",
    "fire-risk-assessment": "Fire risk assessment", "legionella-ra": "Legionella risk assessment", "tmv-service": "TMV service record",
    "lift-loler": "LOLER thorough examination report", "hoist-loler": "LOLER thorough examination report",
    asbestos: "Asbestos management survey / register", "kitchen-extract": "Ductwork cleaning certificate (TR19)"
  };

  function certificateState(cert) {
    const expires = parseInputDate(cert.expires);
    const days = expires ? daysBetween(new Date(), expires) : -1;
    if (days < 0) return { key: "expired", label: "Expired", detail: `Expired ${plural(-days, "day")} ago`, days };
    if (days <= 30) return { key: "expiring", label: "Expires soon", detail: `Expires in ${plural(days, "day")}`, days };
    return { key: "valid", label: "Valid", detail: `Valid for ${plural(days, "day")}`, days };
  }

  function listCertificates() {
    authorize("certificates.view");
    const rows = [];
    loadTasks().forEach((task) => {
      task.certificates.forEach((cert, index) => rows.push({ ...cert, taskId: task.id, taskName: task.name, category: task.category, current: index === task.certificates.length - 1 }));
    });
    return rows;
  }

  /* ---------- Inspection evidence ---------- */

  function evidenceData(sinceIso) {
    const actor = authorize("evidence.export");
    audit("Evidence pack downloaded", sinceIso ? `From ${formatDate(sinceIso)}` : "All records", "ok", actor);
    const since = sinceIso ? Date.parse(sinceIso) : 0;
    const jobs = loadJobs().filter((job) => Date.parse(job.createdAt) >= since);
    return { jobs, allJobs: loadJobs(), tasks: loadTasks(), certificates: listCertificates(), announcements: loadAnnouncements(), settings: loadSettings() };
  }

  /* ---------- Live updates between open tabs ---------- */

  function onExternalChange(handler) {
    window.addEventListener("storage", (event) => {
      if (event.key === KEYS.sessions || event.key === KEYS.users || event.key === null) {
        const result = checkSession();
        if (!result.ok && currentPage() !== "login.html") { signOut(result.reason); return; }
      }
      if ([KEYS.jobs, KEYS.tasks, KEYS.announcements, KEYS.settings, null].includes(event.key)) handler(event.key);
    });
  }

  Object.assign(MH, {
    KEYS, HOUSE_NAME, STATUSES, ROLES, HOME, PAGE_ACCESS, CATEGORIES, IDLE_LIMIT_MS, MAX_FAILED_ATTEMPTS, MAX_ELEVATION_DAYS,
    plural, toInputDate, parseInputDate, daysBetween, formatDate, formatDateTime, formatAppointment, onStorageError,
    ensureUsers, findUser, roleText, isEmail, verifyPassword, changeOwnPassword, passwordProblem, startSession, checkSession,
    currentUser, touchSession, signOut, guardPage, pageAllowed, can, audit, loadAudit, maintenanceTeam,
    adminAddUser, adminResetPassword, adminRemoveUser, adminSetDisabled, adminUnlock, adminChangeRole, adminListUsers,
    adminGrantElevation, adminEndElevation, staffDirectory, systemReport, exportBackup, importBackup, signOutEveryoneElse,
    loadJobs, addJob, assignJob, bookVisit, decideVisit, startWork, completeJob, confirmJob, jobTimes, turnaround, findRecurring,
    loadTasks, taskState, frequencyLabel, assignTask, bookTask, decideTask, recordTask,
    loadAnnouncements, requestMaintenance, markAnnouncementRead, unreadAnnouncements,
    loadSampleHistory, removeSampleHistory, onExternalChange,
    loadSettings, systemUrl, setSystemUrl, setTargets, addLocation, removeLocation, TARGET_LABELS, responseTargets, hoursText,
    parseMoney, formatMoney, jobCost, alertsFor, markAlertsRead, alertRecipients, runScheduledChecks,
    certificateState, listCertificates, evidenceData
  });

  // Pages other than the sign-in page check access before anything is drawn.
  if (currentPage() !== "login.html") MH.user = guardPage();
})();

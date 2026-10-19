// System administrator page: people & passwords, cover for the manager, security log, system & data.
(() => {
  "use strict";
  const MH = window.MH;
  const user = MH.user;
  if (!user || !MH.ui) return;
  const { el, button } = MH.ui;
  const $ = (selector) => document.querySelector(selector);

  /* ---------- Tabs ---------- */
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function selectTab(tab, focus) {
    tabs.forEach((t) => {
      const selected = t === tab;
      t.setAttribute("aria-selected", String(selected));
      t.tabIndex = selected ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !selected;
    });
    if (focus) tab.focus();
    renderAll();
    try { sessionStorage.setItem("mh-admin-tab", tab.id); } catch (error) { /* ignore */ }
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab, false));
    tab.addEventListener("keydown", (event) => {
      const move = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (move) selectTab(tabs[(index + move + tabs.length) % tabs.length], true);
      if (event.key === "Home") selectTab(tabs[0], true);
      if (event.key === "End") selectTab(tabs[tabs.length - 1], true);
    });
  });

  const roleOptions = Object.entries(MH.ROLES).map(([value, label]) => ({ value, label }));

  function say(target, text, ok = true) {
    const box = $(target);
    box.className = `form-feedback ${ok ? "is-success" : "is-error"}`;
    box.textContent = text;
    MH.ui.announce(text);
  }

  /* ---------- At a glance ---------- */
  function renderStats() {
    const people = MH.adminListUsers();
    const report = MH.systemReport();
    const items = [
      ["People", people.length, ""],
      ["Must set a password", people.filter((p) => p.mustChange).length, ""],
      ["Locked accounts", people.filter((p) => p.locked).length, "stat-overdue"],
      ["Covering for manager", people.filter((p) => p.elevationActive).length, ""],
      ["Signed in now", report.activeSessions, ""],
      ["Blocked events today", MH.loadAudit().filter((e) => e.outcome !== "ok" && MH.daysBetween(new Date(e.at), new Date()) === 0).length, "stat-urgent"]
    ];
    $("#stats").replaceChildren(...items.map(([label, value, cls]) => {
      const li = el("li", `stat ${value > 0 ? cls : ""}`);
      li.append(el("span", "stat-value", String(value)), el("span", "stat-label", label));
      return li;
    }));
  }

  /* ---------- People & passwords ---------- */
  function showTempPassword(name, password) {
    $("#temp-password-for").textContent = `For ${name}. They will be asked to choose their own password when they sign in.`;
    $("#temp-password-value").textContent = password;
    $("#temp-password").hidden = false;
    $("#copy-password").focus();
  }
  function hideTempPassword() {
    $("#temp-password-value").textContent = "";
    $("#temp-password").hidden = true;
  }
  $("#hide-password").addEventListener("click", () => { hideTempPassword(); $("#add-account").focus(); });
  $("#copy-password").addEventListener("click", async () => {
    const text = $("#temp-password-value").textContent;
    try {
      await navigator.clipboard.writeText(text);
      say("#account-feedback", "Temporary password copied. Paste it somewhere private only.");
    } catch (error) {
      const range = document.createRange();
      range.selectNodeContents($("#temp-password-value"));
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      say("#account-feedback", "The password is selected. Press Ctrl+C (or Cmd+C) to copy it.");
    }
  });

  function accountForm(kind, account) {
    hideTempPassword();
    const slot = $("#account-form-slot");
    slot.replaceChildren();
    const specs = {
      add: {
        ariaLabel: "Add a person", submitText: "Create account",
        intro: "A temporary password will be created and shown once.",
        fields: [
          { name: "name", label: "Full name", required: true, maxLength: 120, autocomplete: "off" },
          { name: "email", type: "email", label: "Email address", required: true, maxLength: 160, autocomplete: "off" },
          { name: "role", type: "select", label: "Role", required: true, optional: false, options: roleOptions, value: "staff" }
        ],
        onSubmit: async (v) => {
          const result = await MH.adminAddUser(v.name, v.email, v.role);
          if (result.ok) {
            slot.replaceChildren();
            renderAll();
            say("#account-feedback", `Account created for ${v.name} (${MH.ROLES[v.role]}).`);
            showTempPassword(v.name, result.tempPassword);
          }
          return result;
        }
      },
      role: {
        ariaLabel: `Change role for ${account?.name}`, submitText: "Save role",
        intro: `${account?.name} will be signed out so the new access applies straight away. For short-term manager cover, use the Cover for manager tab instead.`,
        fields: [{ name: "role", type: "select", label: "Role", required: true, optional: false, options: roleOptions, value: account?.role }],
        onSubmit: (v) => {
          const result = MH.adminChangeRole(account.id, v.role);
          if (result.ok) { slot.replaceChildren(); renderAll(); say("#account-feedback", `${account.name} is now ${MH.ROLES[v.role]}.`); }
          return result;
        }
      }
    };
    const form = MH.ui.inlineForm({ ...specs[kind], onCancel: () => $("#add-account").focus() });
    slot.append(form);
    form.focusFirst();
  }
  $("#add-account").addEventListener("click", () => accountForm("add"));

  function confirmRemove(cell, account) {
    cell.replaceChildren();
    const box = el("div", "confirm-inline");
    box.append(el("p", "", `Remove ${account.name}? They will no longer be able to sign in. Their past reports and notes are kept.`));
    const yes = button(`Yes, remove ${account.name}`, "primary button-small", () => {
      const r = MH.adminRemoveUser(account.id);
      renderAll();
      say("#account-feedback", r.ok ? `${account.name} has been removed.` : r.error, r.ok);
      $("#add-account").focus();
    });
    const no = button("Keep", "secondary button-small", () => renderAll());
    box.append(yes, no);
    cell.append(box);
    no.focus();
  }

  function renderAccounts() {
    const tbody = $("#accounts-table tbody");
    tbody.replaceChildren(...MH.adminListUsers().sort((a, b) => a.name.localeCompare(b.name)).map((account) => {
      const tr = el("tr");
      const status = account.disabled ? "Disabled" : account.locked ? "Locked" : account.mustChange ? "Must set a password" : "Active";
      const roleLabel = `${MH.ROLES[account.role]}${account.elevationActive ? " (covering as manager)" : ""}`;
      [["Name", account.name], ["Email", account.email || "–"], ["Role", roleLabel], ["Status", status], ["Last sign-in", account.lastSignIn ? MH.formatDateTime(account.lastSignIn) : "Never"]]
        .forEach(([label, value], index) => {
          const cell = el(index === 0 ? "th" : "td", index === 3 ? `status-cell status-${status.toLowerCase().replace(/\s+/g, "-")}` : "", value);
          if (index === 0) cell.scope = "row";
          cell.dataset.label = label;
          tr.append(cell);
        });
      const actions = el("td", "row-actions");
      actions.dataset.label = "Actions";
      const self = account.id === user.id;
      if (account.locked) {
        actions.append(button("Unlock", "secondary button-small", () => {
          const r = MH.adminUnlock(account.id);
          renderAll();
          say("#account-feedback", r.ok ? `${account.name} has been unlocked.` : r.error, r.ok);
        }));
      }
      actions.append(button("Reset password", "secondary button-small", async () => {
        const r = await MH.adminResetPassword(account.id);
        renderAll();
        if (r.ok) {
          say("#account-feedback", `Password reset for ${account.name}. They have been signed out.`);
          showTempPassword(account.name, r.tempPassword);
        } else {
          say("#account-feedback", r.error, false);
        }
      }));
      if (!self) {
        actions.append(button("Change role", "secondary button-small", () => accountForm("role", account)));
        actions.append(button(account.disabled ? "Enable" : "Disable", "secondary button-small", () => {
          const r = MH.adminSetDisabled(account.id, !account.disabled);
          renderAll();
          say("#account-feedback", r.ok ? `${account.name} has been ${account.disabled ? "enabled" : "disabled and signed out"}.` : r.error, r.ok);
        }));
        actions.append(button("Remove", "secondary button-small button-danger", () => confirmRemove(actions, account)));
      } else {
        actions.append(el("span", "field-hint", "This is you"));
      }
      actions.querySelectorAll("button").forEach((b) => b.setAttribute("aria-label", `${b.textContent}: ${account.name}`));
      tr.append(actions);
      return tr;
    }));
  }

  /* ---------- Cover for manager ---------- */
  function coverForm() {
    const candidates = MH.adminListUsers().filter((p) => !p.disabled && (p.role === "staff" || p.role === "maintenance"));
    const tomorrow = new Date(Date.now() + 86400000);
    const form = MH.ui.inlineForm({
      ariaLabel: "Arrange cover for the manager", submitText: "Give manager access",
      fields: [
        { name: "person", type: "select", label: "Who will cover", required: true, optional: false,
          options: [{ value: "", label: "Choose a person" }, ...candidates.map((p) => ({ value: p.id, label: `${p.name} (${MH.ROLES[p.role]})` }))],
          blankMessage: "Choose who will cover for the manager." },
        { name: "date", type: "date", label: "Cover ends on", required: true, notPast: true, min: MH.toInputDate(new Date()), max: MH.toInputDate(new Date(Date.now() + MH.MAX_ELEVATION_DAYS * 86400000)), value: MH.toInputDate(tomorrow) },
        { name: "time", type: "time", label: "Cover ends at", required: true, optional: false, value: "17:00" },
        { name: "reason", type: "textarea", label: "Reason", required: true, rows: 2, hint: "For example: Jamie on annual leave.", blankMessage: "Give a reason so the cover can be checked later." }
      ],
      onSubmit: (v) => {
        const until = MH.parseInputDate(v.date);
        const [h, m] = v.time.split(":").map(Number);
        until.setHours(h || 0, m || 0, 0, 0);
        const result = MH.adminGrantElevation(v.person, until.toISOString(), v.reason);
        if (result.ok) {
          coverForm();
          renderAll();
          const person = candidates.find((p) => p.id === v.person);
          MH.ui.showBanner(`${person.name} can now use the manager pages until ${MH.formatDateTime(until)}. They may need to sign in again to see them.`, "success");
          MH.ui.announce(`Cover granted to ${person.name}.`);
        }
        return result;
      },
      onCancel: () => coverForm()
    });
    $("#cover-form-slot").replaceChildren(form);
  }

  function renderCover() {
    const people = MH.adminListUsers().filter((p) => p.elevation);
    const tbody = $("#cover-table tbody");
    tbody.replaceChildren(...people.sort((a, b) => (b.elevation.grantedAt || "").localeCompare(a.elevation.grantedAt || "")).map((p) => {
      const tr = el("tr", p.elevationActive ? "row-active" : "");
      const e = p.elevation;
      [["Person", p.name], ["Usual role", MH.ROLES[p.role]], ["Covering until", MH.formatDateTime(e.until)], ["Reason", e.reason || ""], ["Granted by", `${e.grantedBy || ""} · ${e.grantedAt ? MH.formatDateTime(e.grantedAt) : ""}`], ["Status", p.elevationActive ? "Active" : e.endedBy ? `Ended early by ${e.endedBy}` : "Ended"]]
        .forEach(([label, value], i) => { const cell = el(i ? "td" : "th", "", value); if (!i) cell.scope = "row"; cell.dataset.label = label; tr.append(cell); });
      const action = el("td", "row-actions");
      action.dataset.label = "Action";
      if (p.elevationActive) {
        const b = button("End cover now", "secondary button-small", () => {
          const r = MH.adminEndElevation(p.id);
          renderAll();
          MH.ui.showBanner(r.ok ? `${p.name} no longer has manager access.` : r.error, r.ok ? "success" : "error");
        });
        b.setAttribute("aria-label", `End cover now: ${p.name}`);
        action.append(b);
      } else {
        action.append("–");
      }
      tr.append(action);
      return tr;
    }));
    if (!people.length) {
      const tr = el("tr");
      const td = el("td", "", "No one has covered for the manager yet.");
      td.colSpan = 7;
      tr.append(td);
      tbody.append(tr);
    }
  }

  /* ---------- Security log ---------- */
  const ACCOUNT_EVENTS = /Sign|sign|Password|Account|Role|Cover|locked/;
  function auditRows() {
    const filter = $("#audit-filter").value;
    return MH.loadAudit().filter((e) => filter === "all" || (filter === "blocked" && e.outcome !== "ok") || (filter === "accounts" && ACCOUNT_EVENTS.test(e.action)));
  }
  function renderAudit() {
    const entries = auditRows().slice(0, 300);
    const tbody = $("#audit-table tbody");
    tbody.replaceChildren(...entries.map((entry) => {
      const tr = el("tr", entry.outcome === "ok" ? "" : "row-blocked");
      [["When", MH.formatDateTime(entry.at)], ["Who", `${entry.actor}${entry.role ? ` (${entry.role})` : ""}`], ["What", entry.action], ["Details", entry.detail], ["Result", entry.outcome === "ok" ? "OK" : "Blocked / failed"]]
        .forEach(([label, value]) => { const td = el("td", "", value); td.dataset.label = label; tr.append(td); });
      return tr;
    }));
    if (!entries.length) {
      const tr = el("tr");
      const td = el("td", "", "No events to show.");
      td.colSpan = 5;
      tr.append(td);
      tbody.append(tr);
    }
  }
  $("#audit-filter").addEventListener("change", renderAudit);
  $("#audit-csv").addEventListener("click", () => {
    const rows = [["When", "Who", "Role", "What", "Details", "Result"], ...auditRows().map((e) => [MH.formatDateTime(e.at), e.actor, e.role, e.action, e.detail, e.outcome])];
    MH.reports.downloadCsv(rows, `meadow-house-security-log-${MH.toInputDate(new Date())}.csv`);
    MH.audit("Security log downloaded", $("#audit-filter").selectedOptions[0].textContent);
    MH.ui.announce("Security log downloaded.");
  });

  /* ---------- System & data ---------- */
  function renderSystem() {
    const report = MH.systemReport();
    const facts = [
      ["People with accounts", report.counts.users],
      ["Repair jobs", `${report.counts.jobs}${report.counts.sampleJobs ? ` (${report.counts.sampleJobs} training)` : ""}`],
      ["Announcements", report.counts.announcements],
      ["Security log entries", report.counts.audit],
      ["People signed in now", report.activeSessions],
      ["Storage used", `${Math.max(1, Math.round(report.total / 1024))} KB of about 5,000 KB available in this browser`]
    ];
    $("#system-facts").replaceChildren(...facts.map(([label, value]) => {
      const wrap = el("div", "detail");
      wrap.append(el("dt", "", label), el("dd", "", String(value)));
      return wrap;
    }));
    if (MH.media) {
      MH.media.usage().then((u) => {
        const wrap = el("div", "detail");
        wrap.append(el("dt", "", "Photos and certificate files"), el("dd", "", `${u.count} (${Math.round(u.bytes / 1024)} KB)`));
        $("#system-facts").append(wrap);
      }).catch(() => {});
    }
  }

  $("#backup").addEventListener("click", () => {
    const data = MH.exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `meadow-house-backup-${MH.toInputDate(new Date())}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    say("#system-feedback", `Backup downloaded: ${a.download}. Keep it somewhere safe – it contains care home records.`);
  });

  let pendingRestore = null;
  $("#restore-file").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { say("#system-feedback", "That file is too large to be a Meadow House backup.", false); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        pendingRestore = JSON.parse(reader.result);
      } catch (error) {
        pendingRestore = null;
        say("#system-feedback", "That file could not be read as a backup.", false);
        return;
      }
      const jobs = Array.isArray(pendingRestore.jobs) ? pendingRestore.jobs.length : 0;
      $("#restore-summary").textContent = `This backup was made ${pendingRestore.exportedAt ? MH.formatDateTime(pendingRestore.exportedAt) : "on an unknown date"}${pendingRestore.exportedBy ? ` by ${pendingRestore.exportedBy}` : ""} and contains ${MH.plural(jobs, "repair job")}. Restoring replaces the current repairs, checks and announcements.`;
      $("#restore-confirm").hidden = false;
      $("#restore-no").focus();
    };
    reader.readAsText(file);
  });
  $("#restore-no").addEventListener("click", () => {
    pendingRestore = null;
    $("#restore-confirm").hidden = true;
    $("#restore-file").value = "";
    $("#restore-file").focus();
  });
  $("#restore-yes").addEventListener("click", () => {
    const result = MH.importBackup(pendingRestore);
    pendingRestore = null;
    $("#restore-confirm").hidden = true;
    $("#restore-file").value = "";
    renderAll();
    say("#system-feedback", result.ok ? `Backup restored: ${MH.plural(result.jobs, "repair job")}.` : result.error, result.ok);
  });

  $("#sign-out-all").addEventListener("click", () => {
    const r = MH.signOutEveryoneElse();
    renderAll();
    say("#system-feedback", `${MH.plural(r.removed, "other session")} signed out.`);
  });
  $("#load-sample").addEventListener("click", () => {
    const r = MH.loadSampleHistory();
    renderAll();
    say("#system-feedback", `Training data added: ${r.count} example repairs and six months of safety checks. Remove it before going live.`);
  });
  $("#remove-sample").addEventListener("click", () => {
    MH.removeSampleHistory();
    renderAll();
    say("#system-feedback", "Training data removed. Real records were not changed.");
  });

  /* ---------- Settings: web address and response targets ---------- */
  function settingsForms() {
    const settings = MH.loadSettings();
    const urlForm = MH.ui.inlineForm({
      ariaLabel: "System web address", submitText: "Save web address",
      fields: [{ name: "url", type: "url", label: "Web address", maxLength: 300, value: settings.appUrl, autocomplete: "url", hint: MH.systemUrl() ? `QR codes currently use: ${MH.systemUrl()}` : "Not set yet – room QR codes can't be printed until it is." }],
      onSubmit: (v) => {
        const r = MH.setSystemUrl(v.url);
        if (r.ok) { settingsForms(); say("#system-feedback", v.url ? `Web address saved: ${v.url}` : "Web address cleared."); }
        return r;
      },
      onCancel: () => settingsForms()
    });
    $("#url-form-slot").replaceChildren(urlForm);

    const fields = [];
    Object.entries(MH.TARGET_LABELS).forEach(([key, label]) => {
      fields.push({ name: `${key}-attend`, type: "number", label: `${label}: attend within (hours)`, required: true, optional: false, value: String(settings.targets[key].attend), min: "1", max: "2000", section: label });
      fields.push({ name: `${key}-complete`, type: "number", label: `${label}: complete within (hours)`, required: true, optional: false, value: String(settings.targets[key].complete), min: "1", max: "4000" });
    });
    const targetsForm = MH.ui.inlineForm({
      ariaLabel: "Response targets", submitText: "Save targets", fields,
      onSubmit: (v) => {
        const targets = {};
        Object.keys(MH.TARGET_LABELS).forEach((key) => { targets[key] = { attend: Number(v[`${key}-attend`]), complete: Number(v[`${key}-complete`]) }; });
        const r = MH.setTargets(targets);
        if (r.ok) { settingsForms(); say("#system-feedback", "Response targets saved. They apply to all open and new repairs."); }
        return r;
      },
      onCancel: () => settingsForms()
    });
    $("#targets-form-slot").replaceChildren(targetsForm);
  }

  function renderAll() {
    renderStats();
    renderAccounts();
    renderCover();
    renderAudit();
    renderSystem();
  }

  MH.onExternalChange(() => renderAll());
  window.addEventListener("storage", (event) => {
    if (event.key === MH.KEYS.users || event.key === MH.KEYS.audit || event.key === MH.KEYS.sessions) renderAll();
  });

  coverForm();
  settingsForms();
  let start = tabs[0];
  try { start = document.getElementById(sessionStorage.getItem("mh-admin-tab")) || tabs[0]; } catch (error) { /* ignore */ }
  selectTab(start, false);
})();

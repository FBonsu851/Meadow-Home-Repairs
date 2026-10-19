// Shared page furniture: header, inline forms, job cards and planned-check rows.
// All user-entered text is rendered with textContent, never as HTML.
(() => {
  "use strict";
  const MH = window.MH;
  if (!MH.user) return;

  const NAV = [
    ["index.html", "Repairs"],
    ["maintenance.html", "Maintenance"],
    ["manager.html", "Manager"],
    ["announcements.html", "Announcements"],
    ["overview.html", "Overview & reports"],
    ["admin.html", "Admin"]
  ];

  function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = text;
    return element;
  }

  function button(label, variant, onClick) {
    const b = el("button", `button button-${variant || "secondary"}`, label);
    b.type = "button";
    if (onClick) b.addEventListener("click", onClick);
    return b;
  }

  function announce(message) {
    const region = document.querySelector("#announcer");
    if (!region) return;
    region.textContent = "";
    setTimeout(() => { region.textContent = message; }, 50);
  }

  function showBanner(message, kind = "info") {
    const holder = document.querySelector("#page-banner");
    if (!holder) return;
    holder.className = `page-banner banner-${kind}`;
    holder.textContent = message;
    holder.hidden = false;
  }

  /* ---------- Header, navigation and session upkeep ---------- */

  function renderHeader() {
    const header = document.querySelector("#site-header");
    const user = MH.user;
    const page = decodeURIComponent(location.pathname.split("/").pop() || "index.html");
    const inner = el("div", "header-inner");
    const brand = el("a", "brand");
    brand.href = MH.HOME[user.role];
    const logo = el("img", "brand-logo");
    logo.src = "images/logo.png";
    logo.alt = "";
    brand.append(logo, el("span", "brand-text", "Meadow House"));
    brand.setAttribute("aria-label", "Meadow House home");

    const nav = el("nav", "main-nav");
    nav.setAttribute("aria-label", "Main");
    NAV.filter(([href]) => MH.pageAllowed(href, user.roles)).forEach(([href, label]) => {
      const link = el("a", "nav-link", label);
      link.href = href;
      if (href === page) link.setAttribute("aria-current", "page");
      if (href === "announcements.html") {
        const unread = MH.unreadAnnouncements(user);
        if (unread) {
          const badge = el("span", "nav-badge", String(unread));
          badge.setAttribute("aria-label", `${unread} unread`);
          link.append(" ", badge);
        }
      }
      nav.append(link);
    });

    const account = el("div", "account");
    const who = el("p", "signed-in");
    who.append(el("strong", "", user.name), el("span", "role-label", user.elevation ? `${MH.ROLES[user.role]} · covering as manager until ${MH.formatDateTime(user.elevation.until)}` : MH.ROLES[user.role]));
    account.append(who, button("Sign out", "secondary button-small", () => MH.signOut("manual")));
    inner.append(brand, nav, account);
    header.replaceChildren(inner);

    const denied = new URLSearchParams(location.search).get("denied");
    if (denied) showBanner(`You do not have access to that page, so you have been brought to your own page. This attempt has been recorded.`, "warning");
  }

  function keepSessionAlive() {
    ["click", "keydown", "touchstart"].forEach((type) => document.addEventListener(type, () => MH.touchSession(), { passive: true }));
    setInterval(() => {
      const result = MH.checkSession();
      if (!result.ok) { MH.signOut(result.reason); return; }
      // Temporary cover for the manager ends automatically: leave pages that are no longer allowed.
      const page = decodeURIComponent(location.pathname.split("/").pop() || "index.html");
      if (!MH.pageAllowed(page, result.user.roles)) location.replace(`${MH.HOME[result.user.role]}?denied=${encodeURIComponent(page)}`);
    }, 20000);
  }

  /* ---------- Inline forms ---------- */

  let formCount = 0;

  // fields: [{ name, type, label, required, hint, value, min, max, options, maxLength }]
  // onSubmit(values) returns { ok } or { field, error } / { error }.
  function inlineForm({ ariaLabel, fields, submitText, intro, onSubmit, onCancel, dataset }) {
    formCount += 1;
    const base = `f${formCount}`;
    const form = el("form", "inline-form");
    form.noValidate = true;
    form.setAttribute("aria-label", ariaLabel);
    Object.assign(form.dataset, dataset || {});
    if (intro) form.append(el("p", "update-hint", intro));
    const inputs = {};
    const errors = {};
    fields.forEach((field) => {
      const id = `${base}-${field.name}`;
      const wrap = el("div", "form-row");
      const label = el("label", "", field.label);
      label.htmlFor = id;
      if (field.required) label.append(el("span", "req", " (required)"));
      else if (field.optional !== false) label.append(el("span", "req", " (optional)"));
      let input;
      if (field.type === "textarea") {
        input = el("textarea");
        input.rows = field.rows || 3;
        input.maxLength = field.maxLength || 2000;
      } else if (field.type === "select") {
        input = el("select");
        field.options.forEach(({ value, label: text }) => {
          const option = el("option", "", text);
          option.value = value;
          input.append(option);
        });
      } else {
        input = el("input");
        input.type = field.type || "text";
        if (field.maxLength) input.maxLength = field.maxLength;
        if (field.autocomplete) input.autocomplete = field.autocomplete;
      }
      input.id = id;
      input.name = field.name;
      if (field.min) input.min = field.min;
      if (field.max) input.max = field.max;
      if (field.value !== undefined) input.value = field.value;
      if (field.required) input.setAttribute("aria-required", "true");
      const describedBy = [];
      wrap.append(label);
      if (field.hint) {
        const hint = el("p", "update-hint", field.hint);
        hint.id = `${id}-hint`;
        describedBy.push(hint.id);
        wrap.append(hint);
      }
      const error = el("p", "update-error");
      error.id = `${id}-error`;
      describedBy.push(error.id);
      input.setAttribute("aria-describedby", describedBy.join(" "));
      input.addEventListener("input", () => { error.textContent = ""; input.removeAttribute("aria-invalid"); });
      wrap.append(input, error);
      form.append(wrap);
      inputs[field.name] = input;
      errors[field.name] = error;
    });
    const general = el("p", "update-error form-general-error");
    general.setAttribute("role", "alert");
    const footer = el("div", "update-form-footer");
    const cancel = button("Cancel", "secondary");
    const submit = el("button", "button button-primary", submitText);
    submit.type = "submit";
    footer.append(cancel, submit);
    form.append(general, footer);

    const close = () => { form.remove(); if (onCancel) onCancel(); };
    cancel.addEventListener("click", close);
    form.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      general.textContent = "";
      const values = {};
      let firstBad = null;
      fields.forEach((field) => {
        const raw = inputs[field.name].value;
        values[field.name] = field.type === "password" ? raw : raw.trim();
        if (field.required && !values[field.name]) {
          errors[field.name].textContent = field.blankMessage || `${field.label} cannot be blank.`;
          inputs[field.name].setAttribute("aria-invalid", "true");
          firstBad = firstBad || field.name;
        } else if (field.type === "date" && values[field.name] && !MH.parseInputDate(values[field.name])) {
          errors[field.name].textContent = "Enter a valid date.";
          inputs[field.name].setAttribute("aria-invalid", "true");
          firstBad = firstBad || field.name;
        } else if (field.type === "date" && values[field.name] && field.notPast && MH.daysBetween(new Date(), MH.parseInputDate(values[field.name])) < 0) {
          errors[field.name].textContent = "The date cannot be in the past.";
          inputs[field.name].setAttribute("aria-invalid", "true");
          firstBad = firstBad || field.name;
        } else if (field.type === "date" && values[field.name] && field.notFuture && MH.daysBetween(new Date(), MH.parseInputDate(values[field.name])) > 0) {
          errors[field.name].textContent = "The date cannot be in the future.";
          inputs[field.name].setAttribute("aria-invalid", "true");
          firstBad = firstBad || field.name;
        }
      });
      if (firstBad) {
        inputs[firstBad].focus();
        announce(errors[firstBad].textContent);
        return;
      }
      submit.disabled = true;
      let result;
      try {
        result = await onSubmit(values);
      } catch (error) {
        result = { error: error.message || "Something went wrong." };
      }
      submit.disabled = false;
      if (!result || result.ok) return;
      const target = result.field && errors[result.field] ? result.field : null;
      if (target) {
        errors[target].textContent = result.error;
        inputs[target].setAttribute("aria-invalid", "true");
        inputs[target].focus();
      } else {
        general.textContent = result.error;
      }
      announce(result.error);
    });

    form.focusFirst = () => inputs[fields[0].name].focus();
    form.inputs = inputs;
    return form;
  }

  function captureOpenForm(root) {
    const form = root.querySelector(".inline-form[data-owner]");
    if (!form) return null;
    const values = {};
    form.querySelectorAll("input, textarea, select").forEach((input) => { values[input.name] = input.value; });
    return { owner: form.dataset.owner, action: form.dataset.action, values, focused: form.contains(document.activeElement) ? document.activeElement.name : null };
  }

  function restoreOpenForm(root, state) {
    if (!state) return;
    const owner = root.querySelector(`[data-owner-id="${CSS.escape(state.owner)}"]`);
    const trigger = owner && owner.querySelector(`[data-action="${state.action}"]`);
    if (!trigger) return;
    trigger.click();
    const form = owner.querySelector(".inline-form");
    if (!form) return;
    Object.entries(state.values).forEach(([name, value]) => { if (form.inputs[name]) form.inputs[name].value = value; });
    if (state.focused && form.inputs[state.focused]) form.inputs[state.focused].focus();
    else document.activeElement?.blur?.();
  }

  function showSaved(root, ownerId, message) {
    const owner = root.querySelector(`[data-owner-id="${CSS.escape(ownerId)}"]`);
    if (!owner) {
      // The item moved out of this list (for example an accepted visit); show the result at the top.
      showBanner(message, "success");
      document.querySelector("#page-banner")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      announce(message);
      return;
    }
    owner.querySelectorAll("details.history").forEach((details) => { details.open = true; });
    const note = el("p", "update-success", message);
    note.tabIndex = -1;
    (owner.querySelector(".card-body") || owner).prepend(note);
    owner.scrollIntoView({ behavior: "smooth", block: "nearest" });
    note.focus({ preventScroll: true });
    announce(message);
  }

  /* ---------- Job cards ---------- */

  const STATUS_CLASS = { "New": "status-new", "Scheduled": "status-scheduled", "In Progress": "status-progress", "Completed": "status-completed" };

  function badge(text, className) {
    return el("span", `badge ${className}`, text);
  }

  function addDetail(list, label, value) {
    if (!value) return;
    const wrap = el("div", "detail");
    wrap.append(el("dt", "", label), el("dd", "", value));
    list.append(wrap);
  }

  function latest(job, test) {
    for (let i = job.history.length - 1; i >= 0; i -= 1) if (test(job.history[i])) return job.history[i];
    return null;
  }

  function renderHistory(job) {
    const list = el("ol", "history-list");
    job.history.forEach((entry) => {
      const item = el("li", "history-item");
      item.append(el("span", "history-marker"));
      const content = el("div", "history-content");
      const heading = el("span", "history-event", entry.event);
      if (entry.status) heading.append(el("span", "history-status", ` · Status: ${entry.status}`));
      content.append(heading);
      if (entry.scheduledFor) content.append(el("span", "history-note", `Visit date: ${MH.formatDate(entry.scheduledFor)}`));
      if (entry.detail) content.append(el("span", "history-note", entry.detail));
      if (entry.note) content.append(el("span", "history-note history-quote", entry.note));
      const time = el("time", "history-time", `${MH.formatDateTime(entry.timestamp)}${entry.by ? ` · by ${entry.by}` : ""}`);
      time.dateTime = entry.timestamp;
      content.append(time);
      item.append(content);
      list.append(item);
    });
    return list;
  }

  function jobActions(job) {
    const can = MH.can;
    const actions = [];
    const confirmed = job.confirmation && job.confirmation.status === "Confirmed";
    if (can("job.work") && job.status !== "Completed") {
      actions.push(["assign", job.assignedTo ? "Reassign" : "Assign", "secondary"]);
      if (job.status !== "In Progress") actions.push(["book", job.appointment ? "Rebook visit" : "Book visit", "secondary"]);
      actions.push(["start", job.status === "In Progress" ? "Add progress note" : "Arrived – start work", "secondary"]);
      actions.push(["complete", "Complete job", "primary"]);
    }
    if (can("job.approve") && job.status === "Scheduled" && job.appointment) {
      if (job.appointment.status === "Awaiting manager approval") actions.push(["accept", "Accept visit", "primary"]);
      actions.push(["change", "Change visit date", "secondary"]);
    }
    if (can("job.confirm") && job.status === "Completed" && !confirmed) {
      actions.push(["confirm", "Confirm it's fixed", "primary"]);
      actions.push(["notfixed", "Not fixed", "secondary"]);
    }
    if (can("reports.view") && MH.reports) actions.push(["pdf", "Download job report (PDF)", "link"]);
    return actions;
  }

  function jobForm(job, action, ctx) {
    const today = MH.toInputDate(new Date());
    const done = (result, message) => {
      if (!result.ok) return result;
      ctx.onDone(job.id, message);
      return result;
    };
    const specs = {
      assign: () => ({
        ariaLabel: `Assign job ${job.id}`, submitText: "Save assignment",
        fields: [{ name: "assignee", type: "select", label: "Maintenance team member", required: true, optional: false,
          value: job.assignedTo ? job.assignedTo.id : MH.user.id,
          options: MH.maintenanceTeam().map((m) => ({ value: m.id, label: m.id === MH.user.id ? `${m.name} (me)` : m.name })) }],
        onSubmit: (v) => done(MH.assignJob(job.id, v.assignee), `Saved: ${job.id} is assigned to ${MH.maintenanceTeam().find((m) => m.id === v.assignee)?.name}.`)
      }),
      book: () => ({
        ariaLabel: `Book a visit for ${job.id}`, submitText: "Send for manager approval",
        intro: "The home manager will accept or change this date. Staff can see the booked date.",
        fields: [
          { name: "date", type: "date", label: "Visit date", required: true, min: today, notPast: true, value: job.appointment ? job.appointment.date : "" },
          { name: "time", type: "time", label: "Time", value: job.appointment ? job.appointment.time : "" },
          { name: "note", type: "textarea", label: "Note for the manager and staff", rows: 2 }
        ],
        onSubmit: (v) => done(MH.bookVisit(job.id, v.date, v.time, v.note), `Saved: visit for ${job.id} booked for ${MH.formatAppointment({ date: v.date, time: v.time })}. It is now Scheduled and waiting for manager approval.`)
      }),
      start: () => ({
        ariaLabel: `${job.status === "In Progress" ? "Add progress note to" : "Start work on"} ${job.id}`, submitText: "Save progress note",
        intro: job.status === "In Progress" ? "" : "Saving records the time you attended and moves the job to In Progress.",
        fields: [{ name: "note", type: "textarea", label: "Progress note", required: true, optional: false,
          blankMessage: "Progress note cannot be blank. Describe the work done or the next step, then save." }],
        onSubmit: (v) => done(MH.startWork(job.id, v.note), `Saved: ${job.id} is now In Progress. Your note was added to the history at ${MH.formatDateTime(new Date())}.`)
      }),
      complete: () => ({
        ariaLabel: `Complete job ${job.id}`, submitText: "Confirm completion",
        intro: "Explain what was done. Saving marks this job Completed and asks staff to confirm the repair.",
        fields: [{ name: "note", type: "textarea", label: "Completion note", required: true, optional: false,
          blankMessage: "Completion note cannot be blank. Explain what was done to fix the repair. The job has not been completed." }],
        onSubmit: (v) => done(MH.completeJob(job.id, v.note), `Saved: ${job.id} is now Completed. The completion note was added to the history at ${MH.formatDateTime(new Date())}.`)
      }),
      change: () => ({
        ariaLabel: `Change the visit date for ${job.id}`, submitText: "Save new date",
        fields: [
          { name: "date", type: "date", label: "New visit date", required: true, min: today, notPast: true, value: job.appointment ? job.appointment.date : "" },
          { name: "time", type: "time", label: "Time", value: job.appointment ? job.appointment.time : "" },
          { name: "reason", type: "textarea", label: "Reason for the change", required: true, rows: 2, blankMessage: "Give a reason so the maintenance team knows why the date changed." }
        ],
        onSubmit: (v) => done(MH.decideVisit(job.id, "change", v.date, v.time, v.reason), `Saved: the visit for ${job.id} is now ${MH.formatAppointment({ date: v.date, time: v.time })}.`)
      }),
      confirm: () => ({
        ariaLabel: `Confirm job ${job.id} is fixed`, submitText: "Yes, it's fixed",
        intro: "Check the repair yourself before confirming. Your name and the time are recorded.",
        fields: [{ name: "note", type: "textarea", label: "Comment", rows: 2 }],
        onSubmit: (v) => done(MH.confirmJob(job.id, true, v.note), `Thank you. You confirmed ${job.id} is fixed.`)
      }),
      notfixed: () => ({
        ariaLabel: `Report job ${job.id} as not fixed`, submitText: "Reopen job",
        fields: [{ name: "note", type: "textarea", label: "What is still wrong?", required: true, blankMessage: "Describe what is still wrong so the team can return." }],
        onSubmit: (v) => done(MH.confirmJob(job.id, false, v.note), `Saved: ${job.id} has been reopened and the maintenance team can see your note.`)
      })
    };
    return inlineForm({ ...specs[action](), dataset: { owner: job.id, action } });
  }

  // ctx: { compact, recurring: Map, onDone(jobId, message) }
  function renderJobCard(job, ctx) {
    const card = el("article", "job-card");
    card.dataset.ownerId = job.id;
    card.dataset.jobId = job.id;
    const titleId = `${job.id}-title`;
    card.setAttribute("aria-labelledby", titleId);
    if (ctx.compact) card.classList.add("is-compact");
    if (job.priority === "Urgent") card.classList.add("is-urgent");
    if (job.status === "Completed") card.classList.add("is-completed");

    const body = el("div", "job-main card-body");
    const top = el("div", "job-topline");
    const title = el(ctx.compact ? "h4" : "h3", "job-id", `Job ${job.id}`);
    title.id = titleId;
    top.append(title);
    const badges = el("div", "job-badges");
    badges.append(badge(`Status: ${job.status}`, STATUS_CLASS[job.status]));
    badges.append(badge(job.priority === "Urgent" ? "⚠ Urgent priority" : "Normal priority", job.priority === "Urgent" ? "priority-urgent" : "priority-normal"));
    const recurring = ctx.recurring && ctx.recurring.get(job.id);
    if (recurring) badges.append(badge(`↻ Recurring issue · ${recurring.size} reports`, "badge-recurring"));
    if (job.source === "Manager request") badges.append(badge("Requested by manager", "badge-request"));
    if (job.status === "Completed" && job.confirmation) {
      badges.append(job.confirmation.status === "Confirmed"
        ? badge("✓ Confirmed by staff", "badge-confirmed")
        : badge("Awaiting staff confirmation", "badge-awaiting"));
    }
    top.append(badges);
    body.append(top, el("p", "job-description", job.description));

    const times = MH.jobTimes(job);
    const speed = MH.turnaround(job);
    const details = el("dl", "job-meta");
    addDetail(details, "Where", job.location);
    addDetail(details, "Type", job.category && job.category !== "Other" ? job.category : "");
    addDetail(details, "Reported by", job.reporter);
    addDetail(details, "Reported on", MH.formatDateTime(job.createdAt));
    addDetail(details, "House", job.house);
    addDetail(details, "Priority", job.priority);
    addDetail(details, "Assigned to", job.assignedTo ? job.assignedTo.name : "Not assigned yet");
    if (job.appointment && job.status !== "Completed") {
      addDetail(details, "Visit", `${MH.formatAppointment(job.appointment)} · ${job.appointment.status}`);
    }
    addDetail(details, "Team attended", times.attended ? MH.formatDateTime(times.attended) : "");
    if (times.completed) addDetail(details, "Completed", `${MH.formatDateTime(times.completed)}${speed ? ` · ${speed.label}` : ""}`);
    if (job.confirmation && job.confirmation.status === "Confirmed") {
      addDetail(details, "Confirmed by", `${job.confirmation.by} · ${MH.formatDateTime(job.confirmation.at)}`);
    }
    body.append(details);

    const completion = latest(job, (e) => e.event === "Marked Completed" || e.event === "Completed");
    const latestNote = latest(job, (e) => e.note && e !== completion);
    if (job.status === "Completed" && completion) {
      const summary = el("div", "note-summary completion-summary");
      summary.append(el("strong", "", "✓ Completed — completion note"), el("span", "summary-text", completion.note));
      body.append(summary);
    } else if (latestNote) {
      const summary = el("div", "note-summary progress-summary");
      summary.append(el("strong", "", job.status === "In Progress" ? "Latest progress note" : "Latest note"), el("span", "summary-text", latestNote.note));
      body.append(summary);
    }
    if (recurring) {
      const warn = el("p", "recurring-note", `This looks like a repeat problem (${recurring.label}): ${recurring.size} similar reports. Consider a longer-term fix.`);
      body.append(warn);
    }

    const lower = el("div", "job-lower");
    const historyLabel = `History (${MH.plural(job.history.length, "entry", "entries")})`;
    if (ctx.compact) {
      const history = el("details", "history");
      history.append(el("summary", "", historyLabel), renderHistory(job));
      lower.append(history);
    } else {
      const history = el("div", "history");
      history.append(el("h4", "", historyLabel), renderHistory(job));
      lower.append(history);
    }

    const actions = jobActions(job);
    if (actions.length) {
      const bar = el("div", "job-actions");
      actions.forEach(([action, label, variant]) => {
        const b = button(label, variant === "link" ? "link" : variant);
        b.dataset.action = action;
        b.setAttribute("aria-label", `${label} – job ${job.id}`);
        b.addEventListener("click", async () => {
          if (action === "accept") {
            let result;
            try { result = MH.decideVisit(job.id, "accept"); } catch (error) { result = { error: error.message }; }
            if (result.ok) ctx.onDone(job.id, `Saved: the visit for ${job.id} on ${MH.formatAppointment(job.appointment)} is accepted.`);
            else announce(result.error);
            return;
          }
          if (action === "pdf") {
            const fresh = MH.loadJobs().find((item) => item.id === job.id) || job;
            await MH.reports.downloadJobReport(fresh, recurring);
            announce(`Job report for ${job.id} downloaded.`);
            return;
          }
          document.querySelectorAll(".inline-form[data-owner]").forEach((form) => form.remove());
          const form = jobForm(job, action, ctx);
          lower.append(form);
          form.focusFirst();
        });
        bar.append(b);
      });
      lower.append(bar);
    }
    card.append(body, lower);
    return card;
  }

  /* ---------- Planned check rows ---------- */

  function taskActions(task) {
    const can = MH.can;
    const actions = [];
    if (can("task.record")) {
      actions.push(["task-assign", task.assignedTo ? "Reassign" : "Assign", "secondary"]);
      actions.push(["task-book", task.appointment ? "Rebook date" : "Book a date", "secondary"]);
      actions.push(["task-record", "Record check done", "primary"]);
    }
    if (can("task.approve") && task.appointment) {
      if (task.appointment.status === "Awaiting manager approval") actions.push(["task-accept", "Accept date", "primary"]);
      actions.push(["task-change", "Change date", "secondary"]);
    }
    if (can("task.assign") && !can("task.record") && !task.appointment) actions.push(["task-assign", task.assignedTo ? "Reassign" : "Assign", "secondary"]);
    return actions;
  }

  function taskForm(task, action, ctx) {
    const today = MH.toInputDate(new Date());
    const done = (result, message) => { if (result.ok) ctx.onDone(task.id, message); return result; };
    const specs = {
      "task-assign": () => ({
        ariaLabel: `Assign ${task.name}`, submitText: "Save assignment",
        fields: [{ name: "assignee", type: "select", label: "Maintenance team member", required: true, optional: false,
          value: task.assignedTo ? task.assignedTo.id : (MH.user.roles.includes("maintenance") ? MH.user.id : ""),
          options: MH.maintenanceTeam().map((m) => ({ value: m.id, label: m.id === MH.user.id ? `${m.name} (me)` : m.name })) }],
        onSubmit: (v) => done(MH.assignTask(task.id, v.assignee), `Saved: ${task.name} is assigned to ${MH.maintenanceTeam().find((m) => m.id === v.assignee)?.name}.`)
      }),
      "task-book": () => ({
        ariaLabel: `Book a date for ${task.name}`, submitText: "Send for manager approval",
        intro: "The home manager will accept or change this date.",
        fields: [
          { name: "date", type: "date", label: "Date", required: true, min: today, notPast: true, value: task.appointment ? task.appointment.date : "" },
          { name: "time", type: "time", label: "Time", value: task.appointment ? task.appointment.time : "" }
        ],
        onSubmit: (v) => done(MH.bookTask(task.id, v.date, v.time), `Saved: ${task.name} booked for ${MH.formatAppointment({ date: v.date, time: v.time })}, waiting for manager approval.`)
      }),
      "task-change": () => ({
        ariaLabel: `Change the date for ${task.name}`, submitText: "Save new date",
        fields: [
          { name: "date", type: "date", label: "New date", required: true, min: today, notPast: true, value: task.appointment ? task.appointment.date : "" },
          { name: "time", type: "time", label: "Time", value: task.appointment ? task.appointment.time : "" },
          { name: "reason", type: "textarea", label: "Reason for the change", required: true, rows: 2 }
        ],
        onSubmit: (v) => done(MH.decideTask(task.id, "change", v.date, v.time, v.reason), `Saved: ${task.name} is now booked for ${MH.formatAppointment({ date: v.date, time: v.time })}.`)
      }),
      "task-record": () => ({
        ariaLabel: `Record ${task.name} as done`, submitText: "Save check",
        fields: [
          { name: "date", type: "date", label: "Date the check was done", required: true, value: today, max: today, min: task.lastDone, notFuture: true },
          { name: "note", type: "textarea", label: "Result or certificate reference", rows: 2, maxLength: 500 }
        ],
        onSubmit: (v) => {
          const result = MH.recordTask(task.id, v.date, v.note);
          if (!result.ok) return { field: "date", error: result.error };
          const updated = MH.loadTasks().find((t) => t.id === task.id);
          return done(result, `Saved: ${task.name} recorded on ${MH.formatDate(v.date)}. Next due ${MH.formatDate(MH.taskState(updated).due)}.`);
        }
      })
    };
    return inlineForm({ ...specs[action](), dataset: { owner: task.id, action } });
  }

  function renderTaskRow(task, ctx) {
    const state = MH.taskState(task);
    const row = el("li", `task-row state-${state.key}`);
    row.dataset.ownerId = task.id;
    const info = el("div", "task-info card-body");
    info.append(el("h4", "task-name", task.name), el("p", "task-guidance", task.guidance));
    const dates = el("dl", "task-dates");
    const last = task.log[task.log.length - 1];
    addDetail(dates, "How often", MH.frequencyLabel(task));
    addDetail(dates, "Last done", `${MH.formatDate(task.lastDone)}${last && last.by ? ` (${last.by})` : ""}`);
    addDetail(dates, "Next due", MH.formatDate(state.due));
    addDetail(dates, "Assigned to", task.assignedTo ? task.assignedTo.name : "Not assigned yet");
    if (task.appointment) addDetail(dates, "Booked for", `${MH.formatAppointment(task.appointment)} · ${task.appointment.status}`);
    if (last && last.note) addDetail(dates, "Last result", last.note);
    const status = el("div", "task-status");
    status.append(el("span", `task-badge task-${state.key}`, state.label), el("span", "task-detail", state.detail));
    const actions = taskActions(task);
    const lower = el("div", "task-actions");
    actions.forEach(([action, label, variant]) => {
      const b = button(label, `${variant} button-small`);
      b.dataset.action = action;
      b.setAttribute("aria-label", `${label}: ${task.name}`);
      b.addEventListener("click", () => {
        if (action === "task-accept") {
          let result;
          try { result = MH.decideTask(task.id, "accept"); } catch (error) { result = { error: error.message }; }
          if (result.ok) ctx.onDone(task.id, `Saved: ${task.name} on ${MH.formatAppointment(task.appointment)} is accepted.`);
          else announce(result.error);
          return;
        }
        document.querySelectorAll(".inline-form[data-owner]").forEach((form) => form.remove());
        const form = taskForm(task, action, ctx);
        row.append(form);
        form.focusFirst();
      });
      lower.append(b);
    });
    status.append(lower);
    row.append(info, dates, status);
    return row;
  }

  MH.ui = { el, button, announce, showBanner, renderHeader, keepSessionAlive, inlineForm, captureOpenForm, restoreOpenForm, showSaved, renderJobCard, renderTaskRow, badge };

  renderHeader();
  keepSessionAlive();
  MH.onStorageError((message) => showBanner(message, "error"));
})();

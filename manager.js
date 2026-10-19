// Home manager page: approve or change visit dates and oversee safety checks.
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
    try { sessionStorage.setItem("mh-manager-tab", tab.id); } catch (error) { /* ignore */ }
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
  try {
    const saved = document.getElementById(sessionStorage.getItem("mh-manager-tab"));
    if (saved) selectTab(saved, false);
  } catch (error) { /* ignore */ }

  /* ---------- At a glance ---------- */
  function renderStats() {
    const jobs = MH.loadJobs();
    const tasks = MH.loadTasks();
    const open = jobs.filter((job) => job.status !== "Completed");
    const recurring = new Set([...MH.findRecurring(jobs).values()].map((group) => group.ids.join()));
    const pending = open.filter((j) => j.appointment && j.appointment.status === "Awaiting manager approval").length
      + tasks.filter((t) => t.appointment && t.appointment.status === "Awaiting manager approval").length;
    const items = [
      ["Dates to approve", pending, "stat-urgent"],
      ["Open repairs", open.length, ""],
      ["Urgent and open", open.filter((job) => job.priority === "Urgent").length, "stat-urgent"],
      ["Waiting for staff to confirm", jobs.filter((j) => j.status === "Completed" && j.confirmation && j.confirmation.status !== "Confirmed").length, ""],
      ["Recurring issues", recurring.size, "stat-overdue"],
      ["Safety checks overdue", tasks.filter((t) => MH.taskState(t).key === "overdue").length, "stat-overdue"]
    ];
    $("#stats").replaceChildren(...items.map(([label, value, cls]) => {
      const li = el("li", `stat ${value > 0 ? cls : ""}`);
      li.append(el("span", "stat-value", String(value)), el("span", "stat-label", label));
      return li;
    }));
  }

  /* ---------- Visit dates ---------- */
  function renderAppointments(keepForm = true) {
    const holder = $("#pending-list");
    const openForm = keepForm ? MH.ui.captureOpenForm(holder) : null;
    const jobs = MH.loadJobs();
    const recurring = MH.findRecurring(jobs);
    const tasks = MH.loadTasks();
    const done = (root) => (id, message) => { refresh(false); MH.ui.showSaved(root(), id, message); };
    const pendingJobs = jobs.filter((j) => j.status === "Scheduled" && j.appointment && j.appointment.status === "Awaiting manager approval");
    const pendingTasks = tasks.filter((t) => t.appointment && t.appointment.status === "Awaiting manager approval");
    holder.replaceChildren();
    if (!pendingJobs.length && !pendingTasks.length) {
      holder.append(el("p", "empty-state compact-empty", "Nothing is waiting for you. New bookings from the maintenance team will appear here."));
    }
    if (pendingJobs.length) {
      const ol = el("ol", "jobs-list");
      pendingJobs.forEach((job) => {
        const li = el("li");
        li.append(MH.ui.renderJobCard(job, { compact: true, recurring, onDone: done(() => $("#pending-list")) }));
        ol.append(li);
      });
      holder.append(el("h3", "subheading", "Repair visits"), ol);
    }
    if (pendingTasks.length) {
      const ul = el("ul", "task-list");
      pendingTasks.forEach((task) => ul.append(MH.ui.renderTaskRow(task, { onDone: done(() => $("#pending-list")) })));
      holder.append(el("h3", "subheading", "Safety check dates"), ul);
    }
    MH.ui.restoreOpenForm(holder, openForm);

    const agenda = [];
    jobs.filter((j) => j.status === "Scheduled" && j.appointment && j.appointment.status !== "Awaiting manager approval")
      .forEach((j) => agenda.push({ date: j.appointment.date, time: j.appointment.time, title: j.description, kind: `Repair ${j.id}`, who: j.assignedTo?.name, state: j.appointment.status }));
    tasks.filter((t) => t.appointment && t.appointment.status !== "Awaiting manager approval")
      .forEach((t) => agenda.push({ date: t.appointment.date, time: t.appointment.time, title: t.name, kind: "Safety check", who: t.assignedTo?.name, state: t.appointment.status }));
    const soon = agenda.filter((a) => { const d = MH.daysBetween(new Date(), MH.parseInputDate(a.date)); return d >= 0 && d <= 30; })
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    const list = $("#agreed-list");
    list.replaceChildren(...(soon.length ? soon.map((a) => {
      const li = el("li", "agenda-item");
      li.append(el("span", "agenda-date", MH.formatAppointment(a)));
      const body = el("span", "agenda-body");
      body.append(el("strong", "", a.title), el("span", "agenda-meta", `${a.kind} · ${a.who ? `with ${a.who}` : "not assigned"} · ${a.state}`));
      li.append(body);
      return li;
    }) : [el("li", "upcoming-empty", "No agreed visits in the next 30 days.")]));
  }

  /* ---------- Safety checks ---------- */
  function renderChecks(keepForm = true) {
    const holder = $("#task-groups");
    const openForm = keepForm ? MH.ui.captureOpenForm(holder) : null;
    const tasks = MH.loadTasks();
    const filter = $("#task-filter").value;
    const visible = tasks.filter((t) => filter === "all" || (filter === "attention" && MH.taskState(t).key !== "ok") || (filter === "booked" && t.appointment))
      .sort((a, b) => MH.taskState(a).days - MH.taskState(b).days);
    const ctx = { onDone: (id, message) => { refresh(false); MH.ui.showSaved($("#task-groups"), id, message); } };
    holder.replaceChildren();
    [...new Set(tasks.map((t) => t.category))].forEach((category) => {
      const inGroup = visible.filter((t) => t.category === category);
      if (!inGroup.length) return;
      const group = el("section", "task-group");
      const id = `mgr-group-${category.toLowerCase().replace(/[^a-z]+/g, "-")}`;
      group.setAttribute("aria-labelledby", id);
      const heading = el("h3", "task-group-title", category);
      heading.id = id;
      const ul = el("ul", "task-list");
      inGroup.forEach((task) => ul.append(MH.ui.renderTaskRow(task, ctx)));
      group.append(heading, ul);
      holder.append(group);
    });
    if (!holder.children.length) holder.append(el("p", "empty-state compact-empty", "No checks match this choice."));
    MH.ui.restoreOpenForm(holder, openForm);
  }

  $("#task-filter").addEventListener("change", () => renderChecks(true));

  function refresh(keepForm = true) {
    renderStats();
    renderAppointments(keepForm);
    renderChecks(keepForm);
  }

  MH.onExternalChange(() => {
    refresh(true);
    MH.ui.renderHeader();
    MH.ui.announce("The manager overview was updated with the latest changes.");
  });
  refresh(false);
})();

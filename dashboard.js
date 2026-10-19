// Maintenance team dashboard: job board and planned safety checks.
(() => {
  "use strict";
  const MH = window.MH;
  const user = MH.user;
  if (!user || !MH.ui) return;
  const { el } = MH.ui;
  const board = document.querySelector("#board");
  const taskGroups = document.querySelector("#task-groups");
  const scope = document.querySelector("#job-scope");
  const taskFilter = document.querySelector("#task-filter");

  const COLUMN_HELP = {
    "New": "Reported, not yet booked.",
    "Scheduled": "Visit booked. Manager approves the date.",
    "In Progress": "The team has attended and started.",
    "Completed": "Finished. Staff confirm the repair."
  };

  function renderStats(jobs, tasks) {
    const open = jobs.filter((job) => job.status !== "Completed");
    const items = [
      ["Open jobs", open.length, ""],
      ["Urgent and open", open.filter((job) => job.priority === "Urgent").length, "stat-urgent"],
      ["Assigned to me", open.filter((job) => job.assignedTo && job.assignedTo.id === user.id).length, ""],
      ["Visits awaiting approval", open.filter((job) => job.appointment && job.appointment.status === "Awaiting manager approval").length, ""],
      ["Checks overdue", tasks.filter((t) => MH.taskState(t).key === "overdue").length, "stat-overdue"],
      ["Checks due soon", tasks.filter((t) => MH.taskState(t).key === "soon").length, ""]
    ];
    document.querySelector("#stats").replaceChildren(...items.map(([label, value, cls]) => {
      const item = el("li", `stat ${value > 0 ? cls : ""}`);
      item.append(el("span", "stat-value", String(value)), el("span", "stat-label", label));
      return item;
    }));
  }

  const urgentFirst = (a, b) => (a.priority === b.priority ? 0 : a.priority === "Urgent" ? -1 : 1);

  function renderBoard(keepForm = true) {
    const openForm = keepForm ? MH.ui.captureOpenForm(board) : null;
    const all = MH.loadJobs();
    const recurring = MH.findRecurring(all);
    const jobs = all.filter((job) => scope.value === "all"
      || (scope.value === "mine" && job.assignedTo && job.assignedTo.id === user.id)
      || (scope.value === "unassigned" && !job.assignedTo));
    const ctx = { compact: true, recurring, onDone: (id, message) => { renderBoard(false); renderStats(MH.loadJobs(), MH.loadTasks()); MH.ui.showSaved(board, id, message); } };
    board.replaceChildren(...MH.STATUSES.map((status) => {
      let list = jobs.filter((job) => job.status === status);
      if (status === "Completed") {
        list = list.sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || "")).slice(0, 5);
      } else if (status === "Scheduled") {
        list = list.sort((a, b) => urgentFirst(a, b) || `${a.appointment?.date}${a.appointment?.time}`.localeCompare(`${b.appointment?.date}${b.appointment?.time}`));
      } else {
        list = list.sort((a, b) => urgentFirst(a, b) || a.createdAt.localeCompare(b.createdAt));
      }
      const slug = status.toLowerCase().replace(" ", "-");
      const column = el("section", `board-column column-${slug}`);
      column.setAttribute("aria-labelledby", `column-${slug}`);
      const heading = el("h3", "column-title");
      heading.id = `column-${slug}`;
      heading.append(status, el("span", "job-count", String(jobs.filter((job) => job.status === status).length)));
      column.append(heading, el("p", "column-help", status === "Completed" ? `${COLUMN_HELP[status]} Latest 5 shown; see Overview & reports for all.` : COLUMN_HELP[status]));
      const ol = el("ol", "column-list");
      list.forEach((job) => { const li = el("li"); li.append(MH.ui.renderJobCard(job, ctx)); ol.append(li); });
      if (!list.length) ol.append(el("li", "column-empty", "No jobs here."));
      column.append(ol);
      return column;
    }));
    MH.ui.restoreOpenForm(board, openForm);
  }

  function renderTasks(keepForm = true) {
    const openForm = keepForm ? MH.ui.captureOpenForm(taskGroups) : null;
    const tasks = MH.loadTasks();
    const filter = taskFilter.value;
    const visible = tasks
      .filter((task) => filter === "all"
        || (filter === "attention" && (MH.taskState(task).key !== "ok" || task.appointment))
        || (filter === "mine" && task.assignedTo && task.assignedTo.id === user.id))
      .sort((a, b) => MH.taskState(a).days - MH.taskState(b).days);
    const ctx = { onDone: (id, message) => { renderTasks(false); renderStats(MH.loadJobs(), MH.loadTasks()); MH.ui.showSaved(taskGroups, id, message); } };
    taskGroups.replaceChildren();
    [...new Set(tasks.map((task) => task.category))].forEach((category) => {
      const inGroup = visible.filter((task) => task.category === category);
      if (!inGroup.length) return;
      const group = el("section", "task-group");
      const id = `group-${category.toLowerCase().replace(/[^a-z]+/g, "-")}`;
      group.setAttribute("aria-labelledby", id);
      const heading = el("h3", "task-group-title", category);
      heading.id = id;
      const ul = el("ul", "task-list");
      inGroup.forEach((task) => ul.append(MH.ui.renderTaskRow(task, ctx)));
      group.append(heading, ul);
      taskGroups.append(group);
    });
    if (!taskGroups.children.length) taskGroups.append(el("p", "empty-state compact-empty", "No checks match this choice."));
    MH.ui.restoreOpenForm(taskGroups, openForm);
  }

  scope.addEventListener("change", () => renderBoard(true));
  taskFilter.addEventListener("change", () => renderTasks(true));

  MH.onExternalChange((key) => {
    if (key === MH.KEYS.jobs || key === null) renderBoard(true);
    if (key === MH.KEYS.tasks || key === null) renderTasks(true);
    if (key === MH.KEYS.announcements) MH.ui.renderHeader();
    renderStats(MH.loadJobs(), MH.loadTasks());
    MH.ui.announce("The dashboard was updated with the latest changes.");
  });

  renderBoard(false);
  renderTasks(false);
  renderStats(MH.loadJobs(), MH.loadTasks());
})();

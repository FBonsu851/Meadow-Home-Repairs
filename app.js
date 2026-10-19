// Repairs page for care staff (and the home manager): report, follow and confirm repairs.
(() => {
  "use strict";
  const MH = window.MH;
  const user = MH.user;
  if (!user || !MH.ui) return;
  const { el } = MH.ui;
  const $ = (selector) => document.querySelector(selector);

  const reportForm = $("#report-form");
  const descriptionInput = $("#description");
  const reporterInput = $("#reporter");
  const locationInput = $("#location");
  const categoryInput = $("#category");
  const descriptionError = $("#description-error");
  const reporterError = $("#reporter-error");
  const reportFeedback = $("#report-feedback");
  const jobsList = $("#jobs-list");
  const confirmList = $("#confirm-list");
  const statusFilter = $("#status-filter");

  $("#greeting-name").textContent = user.name;
  reporterInput.value = user.name;
  MH.CATEGORIES.forEach((category) => {
    const option = el("option", "", category === "Other" ? "Not sure / other" : category);
    option.value = category;
    categoryInput.append(option);
  });
  categoryInput.value = "Other";

  function onDone(jobId, message) {
    renderAll(false);
    const root = confirmList.querySelector(`[data-owner-id="${CSS.escape(jobId)}"]`) ? confirmList : jobsList;
    MH.ui.showSaved(root, jobId, message);
  }

  // "Open & recent" keeps the list short: open jobs plus anything completed in the last 14 days.
  function matches(job, filter) {
    if (filter === "All") return true;
    if (filter === "Recent") {
      const { completed } = MH.jobTimes(job);
      return job.status !== "Completed" || !completed || Date.now() - Date.parse(completed) < 14 * 86400000;
    }
    return job.status === filter;
  }

  function renderSummary(jobs) {
    const holder = $("#status-summary");
    holder.replaceChildren();
    ["Recent", "All", ...MH.STATUSES].forEach((status) => {
      const count = jobs.filter((job) => matches(job, status)).length;
      const chip = el("button", "summary-chip");
      chip.type = "button";
      chip.setAttribute("aria-pressed", String(statusFilter.value === status));
      chip.append(el("span", "chip-count", String(count)), el("span", "chip-label", status === "All" ? "All jobs" : status === "Recent" ? "Open & recent" : status));
      chip.addEventListener("click", () => { statusFilter.value = status; renderAll(true); });
      holder.append(chip);
    });
  }

  function renderUpcoming(jobs) {
    const list = $("#upcoming-list");
    const items = [];
    jobs.filter((job) => job.status === "Scheduled" && job.appointment).forEach((job) => {
      items.push({ date: job.appointment.date, time: job.appointment.time, title: job.description, where: job.location, state: job.appointment.status, who: job.assignedTo?.name });
    });
    MH.loadTasks().filter((task) => task.appointment).forEach((task) => {
      items.push({ date: task.appointment.date, time: task.appointment.time, title: task.name, where: "", state: task.appointment.status, who: task.assignedTo?.name });
    });
    const soon = items
      .filter((item) => { const d = MH.daysBetween(new Date(), MH.parseInputDate(item.date)); return d >= 0 && d <= 14; })
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    list.replaceChildren();
    if (!soon.length) {
      list.append(el("li", "upcoming-empty", "Nothing booked in the next 14 days."));
      return;
    }
    soon.forEach((item) => {
      const li = el("li", `upcoming-item ${item.state === "Awaiting manager approval" ? "state-soon" : "state-ok"}`);
      li.append(el("span", "upcoming-name", item.title));
      li.append(el("span", "upcoming-meta", `${MH.formatAppointment(item)}${item.where ? ` · ${item.where}` : ""}`));
      li.append(el("span", "upcoming-meta", `${item.who ? `With ${item.who} · ` : ""}${item.state === "Awaiting manager approval" ? "Date not yet agreed" : "Date agreed"}`));
      list.append(li);
    });
  }

  function renderAll(keepForm = true) {
    const openForm = keepForm ? (MH.ui.captureOpenForm(jobsList) || MH.ui.captureOpenForm(confirmList)) : null;
    const jobs = MH.loadJobs();
    const recurring = MH.findRecurring(jobs);
    const ctx = { compact: false, recurring, onDone };

    // Jobs waiting for a staff member to confirm the repair.
    const toConfirm = jobs.filter((job) => job.status === "Completed" && job.confirmation && job.confirmation.status !== "Confirmed")
      .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
    $("#confirm-section").hidden = toConfirm.length === 0;
    confirmList.replaceChildren(...toConfirm.map((job) => {
      const li = el("li");
      li.append(MH.ui.renderJobCard(job, { ...ctx, compact: true }));
      return li;
    }));

    const filter = statusFilter.value;
    const visible = jobs.filter((job) => matches(job, filter))
      .filter((job) => !toConfirm.includes(job) || (filter !== "All" && filter !== "Recent"))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    jobsList.replaceChildren(...visible.map((job) => {
      const li = el("li");
      li.append(MH.ui.renderJobCard(job, { ...ctx, compact: true }));
      return li;
    }));
    $("#job-count").textContent = String(jobs.length);
    $("#empty-state").hidden = jobs.length > 0;
    $("#no-filter-results").hidden = jobs.length === 0 || visible.length > 0 || toConfirm.length > 0;
    renderSummary(jobs);
    renderUpcoming(jobs);

    const unread = MH.unreadAnnouncements(user);
    const link = $("#announcement-link");
    link.hidden = unread === 0;
    link.textContent = `📣 ${MH.plural(unread, "new announcement")} from the manager`;

    if (openForm) {
      MH.ui.restoreOpenForm(jobsList, openForm);
      if (!document.querySelector(".inline-form[data-owner]")) MH.ui.restoreOpenForm(confirmList, openForm);
    }
  }

  function clearFieldError(input, errorEl) {
    errorEl.textContent = "";
    input.removeAttribute("aria-invalid");
  }
  descriptionInput.addEventListener("input", () => clearFieldError(descriptionInput, descriptionError));
  reporterInput.addEventListener("input", () => clearFieldError(reporterInput, reporterError));

  reportForm.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFieldError(descriptionInput, descriptionError);
    clearFieldError(reporterInput, reporterError);
    reportFeedback.textContent = "";
    reportFeedback.className = "form-feedback";

    const description = descriptionInput.value.trim();
    const reporter = reporterInput.value.trim();
    const problems = [];
    if (!description) {
      descriptionError.textContent = descriptionInput.value.length
        ? "Description cannot be only spaces. Describe what needs repairing."
        : "Description is required. Describe what needs repairing.";
      descriptionInput.setAttribute("aria-invalid", "true");
      problems.push("description");
    }
    if (!reporter) {
      reporterError.textContent = reporterInput.value.length
        ? "Reporter name cannot be only spaces. Enter your name."
        : "Reporter name is required. Enter your name.";
      reporterInput.setAttribute("aria-invalid", "true");
      problems.push("reporter name");
    }
    if (problems.length) {
      reportFeedback.className = "form-feedback is-error";
      reportFeedback.textContent = `Repair not submitted. Please fix the ${problems.join(" and ")} above.`;
      (description ? reporterInput : descriptionInput).focus();
      return;
    }

    let job;
    try {
      job = MH.addJob({
        description, reporter,
        priority: reportForm.querySelector('input[name="priority"]:checked').value,
        location: locationInput.value.trim(),
        category: categoryInput.value
      });
    } catch (error) {
      reportFeedback.className = "form-feedback is-error";
      reportFeedback.textContent = error.message;
      return;
    }
    if (!job) return;
    reportForm.reset();
    reporterInput.value = user.name;
    categoryInput.value = "Other";
    statusFilter.value = "Recent";
    renderAll(false);
    reportFeedback.className = "form-feedback is-success";
    reportFeedback.textContent = `Repair reported. Job ${job.id} was created with status New and ${job.priority} priority. The maintenance team can now see it.`;
    MH.ui.showSaved(jobsList, job.id, `New job created: ${job.id} (${job.priority} priority).`);
  });

  statusFilter.addEventListener("change", () => renderAll(true));

  MH.onExternalChange(() => {
    renderAll(true);
    MH.ui.renderHeader();
    MH.ui.announce("The repair list was updated with the latest changes.");
  });

  renderAll(false);
})();

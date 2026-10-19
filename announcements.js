// Announcements: maintenance requested by the manager, with read receipts and staff confirmation.
(() => {
  "use strict";
  const MH = window.MH;
  const user = MH.user;
  if (!user || !MH.ui) return;
  const { el, button } = MH.ui;
  const list = document.querySelector("#announcement-list");

  function requestForm() {
    const slot = document.querySelector("#request-form-slot");
    const team = MH.maintenanceTeam();
    const form = MH.ui.inlineForm({
      ariaLabel: "Request maintenance and tell staff",
      submitText: "Book work and post announcement",
      fields: [
        { name: "title", label: "What needs doing", required: true, maxLength: 200, blankMessage: "Describe the work, for example: Annual gas safety inspection." },
        { name: "location", label: "Where in the home", maxLength: 80 },
        { name: "date", type: "date", label: "Date", required: true, min: MH.toInputDate(new Date()), notPast: true },
        { name: "time", type: "time", label: "Time" },
        { name: "assignee", type: "select", label: "Maintenance team member", required: true, optional: false,
          options: [{ value: "", label: "Choose a person" }, ...team.map((m) => ({ value: m.id, label: m.name }))] },
        { name: "priority", type: "select", label: "Priority", required: true, optional: false, value: "Normal",
          options: [{ value: "Normal", label: "Normal" }, { value: "Urgent", label: "Urgent" }] },
        { name: "message", type: "textarea", label: "Message for staff", required: true, rows: 3,
          hint: "What should staff expect? For example: water will be off 10am–12pm; residents in Room 3 will need to move to the lounge.",
          blankMessage: "Tell staff what to expect so they can prepare residents." }
      ],
      onSubmit: (v) => {
        const result = MH.requestMaintenance({ title: v.title, message: v.message, location: v.location, date: v.date, time: v.time, assigneeId: v.assignee, priority: v.priority });
        if (!result.ok) return { field: result.error.includes("maintenance") ? "assignee" : undefined, error: result.error };
        requestForm();
        render();
        MH.ui.showSaved(list, result.announcement.id, `Posted: "${v.title}" is booked for ${MH.formatAppointment({ date: v.date, time: v.time })} as job ${result.job.id}, and all staff can now see this announcement.`);
        return result;
      },
      onCancel: () => requestForm()
    });
    slot.replaceChildren(form);
  }

  function render() {
    const openForm = MH.ui.captureOpenForm(list);
    const jobs = MH.loadJobs();
    const recurring = MH.findRecurring(jobs);
    const items = MH.loadAnnouncements().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const canSeeReaders = MH.can("directory.view");
    const careStaff = canSeeReaders ? MH.staffDirectory().filter((u) => u.role === "staff") : [];
    list.replaceChildren();
    if (!items.length) {
      list.append(el("li", "empty-state compact-empty", "No announcements yet. When the manager books work in the home, it will appear here."));
      return;
    }
    items.forEach((item) => {
      const read = item.readBy && item.readBy[user.id];
      const li = el("li", `announcement ${read ? "is-read" : "is-unread"}`);
      li.dataset.ownerId = item.id;
      const article = el("article", "card-body");
      const titleId = `ann-${item.id}`;
      article.setAttribute("aria-labelledby", titleId);
      const top = el("div", "job-topline");
      const h = el("h3", "announcement-title", item.title);
      h.id = titleId;
      top.append(h);
      if (!read) top.append(el("span", "badge badge-awaiting", "New"));
      article.append(top);
      const when = el("p", "announcement-when", `📅 ${MH.formatAppointment(item)}${item.location ? ` · 📍 ${item.location}` : ""}`);
      article.append(when, el("p", "announcement-message", item.message));
      article.append(el("p", "announcement-meta", `Requested by ${item.createdBy} on ${MH.formatDateTime(item.createdAt)}`));

      const job = jobs.find((j) => j.id === item.jobId);
      if (job) {
        const details = el("details", "linked-job");
        details.open = job.status === "Completed" && job.confirmation && job.confirmation.status !== "Confirmed" && MH.can("job.confirm");
        details.append(el("summary", "", `Progress of this work: ${job.status}${job.status === "Completed" && job.confirmation ? ` · ${job.confirmation.status}` : ""}`));
        details.append(MH.ui.renderJobCard(job, { compact: true, recurring, onDone: (id, message) => { render(); MH.ui.showSaved(list, item.id, message); } }));
        article.append(details);
      }

      const footer = el("div", "announcement-footer");
      if (read) {
        footer.append(el("p", "read-receipt", `✓ You read this on ${MH.formatDateTime(read.at)}`));
      } else {
        const b = button("I've read this", "primary", () => {
          const result = MH.markAnnouncementRead(item.id);
          if (!result.ok) { MH.ui.announce(result.error); return; }
          render();
          MH.ui.renderHeader();
          MH.ui.showSaved(list, item.id, `Thank you. The manager can see you read "${item.title}".`);
        });
        b.setAttribute("aria-label", `I've read this: ${item.title}`);
        footer.append(b);
      }
      if (canSeeReaders) {
        const readers = careStaff.filter((s) => item.readBy && item.readBy[s.id]);
        const waiting = careStaff.filter((s) => !(item.readBy && item.readBy[s.id]));
        footer.append(el("p", "read-receipt", `Read by ${readers.length} of ${careStaff.length} care staff${readers.length ? `: ${readers.map((s) => s.name).join(", ")}` : ""}.${waiting.length ? ` Not yet read: ${waiting.map((s) => s.name).join(", ")}.` : ""}`));
      }
      article.append(footer);
      li.append(article);
      list.append(li);
    });
    MH.ui.restoreOpenForm(list, openForm);
  }

  if (MH.can("announce.create")) {
    document.querySelector("#request-section").hidden = false;
    requestForm();
  }

  MH.onExternalChange(() => {
    render();
    MH.ui.renderHeader();
  });
  render();
})();

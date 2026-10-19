// Overview & reports: charts, recurring issues, repair history and downloads.
(() => {
  "use strict";
  const MH = window.MH;
  const user = MH.user;
  if (!user || !MH.ui || !MH.reports) return;
  const { el } = MH.ui;
  const $ = (selector) => document.querySelector(selector);
  let chartSvg = null;

  function periodJobs(jobs) {
    const value = $("#period").value;
    if (value === "all") return jobs;
    const since = Date.now() - Number(value) * 86400000;
    return jobs.filter((job) => Date.parse(job.createdAt) >= since || (MH.jobTimes(job).completed && Date.parse(MH.jobTimes(job).completed) >= since));
  }

  const periodLabel = () => $("#period").selectedOptions[0].textContent;

  function render() {
    const allJobs = MH.loadJobs();
    const tasks = MH.loadTasks();
    const jobs = periodJobs(allJobs);
    const recurring = MH.findRecurring(allJobs);
    const inPeriod = new Set(jobs.map((j) => j.id));
    const groups = [...new Map([...recurring.values()].map((g) => [g.ids.join(), g])).values()]
      .filter((g) => g.ids.some((id) => inPeriod.has(id)))
      .sort((a, b) => b.size - a.size);
    const completed = jobs.filter((j) => j.status === "Completed");
    const speed = MH.reports.turnaroundSummary(completed);

    const kpis = [
      ["Repairs reported", jobs.filter((j) => Date.parse(j.createdAt) >= ($("#period").value === "all" ? 0 : Date.now() - Number($("#period").value) * 86400000)).length, ""],
      ["Repairs completed", completed.length, ""],
      ["Completed within 2 days", `${speed.quickShare}%`, ""],
      ["Still open", allJobs.filter((j) => j.status !== "Completed").length, ""],
      ["Recurring issues", groups.length, groups.length ? "stat-overdue" : ""],
      ["Safety checks overdue", tasks.filter((t) => MH.taskState(t).key === "overdue").length, "stat-overdue"]
    ];
    $("#kpis").replaceChildren(...kpis.map(([label, value, cls]) => {
      const li = el("li", `stat ${value && value !== "0%" ? cls : ""}`);
      li.append(el("span", "stat-value", String(value)), el("span", "stat-label", label));
      return li;
    }));

    chartSvg = MH.reports.renderMonthlyChart($("#monthly-chart"), MH.reports.monthlyActivity(allJobs, tasks, 6));
    MH.reports.renderTurnaround($("#turnaround-chart"), speed);
    $("#speed-summary").textContent = speed.total
      ? `${speed.quickShare}% of ${MH.plural(speed.total, "completed repair")} were finished within two days of being reported.`
      : "No repairs were completed in this period yet.";

    const recurringList = $("#recurring-list");
    recurringList.replaceChildren(...(groups.length ? groups.map((g) => {
      const li = el("li", "recurring-item");
      const head = el("p", "recurring-head");
      head.append(el("strong", "", g.label), el("span", "badge badge-recurring", `↻ ${g.size} reports`));
      li.append(head);
      const ul = el("ul", "recurring-jobs");
      g.jobs.forEach((job) => ul.append(el("li", "", `${MH.formatDate(job.createdAt)} – ${job.description} (${job.status})`)));
      li.append(ul);
      return li;
    }) : [el("li", "upcoming-empty", "No recurring issues found in this period.")]));

    const filter = $("#history-status").value;
    const rows = jobs.filter((j) => filter === "all" || (filter === "open" ? j.status !== "Completed" : j.status === filter))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const tbody = $("#history-table tbody");
    tbody.replaceChildren(...rows.map((job) => {
      const r = MH.reports.jobRow(job, recurring);
      const tr = el("tr", recurring.get(job.id) ? "row-recurring" : "");
      const cells = [
        ["Job", job.id], ["What and where", r.issue], ["Reported", r.reported], ["Assigned to", r.assigned], ["Team attended", r.attended || "–"],
        ["Completed", r.completed || "–"], ["Time taken", r.turnaround || "–"], ["Status", r.status], ["Latest note", r.notes || "–"]
      ];
      cells.forEach(([label, value], i) => {
        const cell = el(i === 0 ? "th" : "td", "", value);
        if (i === 0) cell.scope = "row";
        cell.dataset.label = label;
        if (i === 1 && recurring.get(job.id)) cell.append(el("span", "badge badge-recurring inline-badge", "↻ Recurring"));
        tr.append(cell);
      });
      return tr;
    }));
    if (!rows.length) {
      const tr = el("tr");
      const td = el("td", "", "No repairs in this period.");
      td.colSpan = 9;
      tr.append(td);
      tbody.append(tr);
    }
    return { allJobs, jobs, tasks, recurring };
  }

  const feedback = $("#download-feedback");
  function say(text, ok = true) {
    feedback.className = `form-feedback ${ok ? "is-success" : "is-error"}`;
    feedback.textContent = text;
  }

  $("#download-pdf").addEventListener("click", async (event) => {
    const b = event.currentTarget;
    b.disabled = true;
    b.textContent = "Preparing PDF…";
    try {
      const data = render();
      await MH.reports.downloadOverviewReport({ periodLabel: periodLabel(), ...data, chartSvg });
      say(`Report downloaded: meadow-house-maintenance-report-${MH.toInputDate(new Date())}.pdf (${periodLabel()}).`);
    } catch (error) {
      console.error(error);
      say("The PDF could not be created. Please try again.", false);
    }
    b.disabled = false;
    b.textContent = "Download report (PDF)";
  });

  $("#download-csv").addEventListener("click", () => {
    const { jobs, recurring } = render();
    MH.reports.downloadCsv(MH.reports.historyCsvRows(jobs, recurring), `meadow-house-repair-history-${MH.toInputDate(new Date())}.csv`);
    MH.audit("Report downloaded", `Repair history CSV · ${periodLabel()}`);
    say(`Spreadsheet downloaded: ${MH.plural(jobs.length, "repair")} for ${periodLabel().toLowerCase()}.`);
  });

  if (MH.can("data.sample")) {
    $("#sample-section").hidden = false;
    $("#load-sample").addEventListener("click", () => {
      const result = MH.loadSampleHistory();
      render();
      MH.ui.showBanner(`Loaded ${result.count} fictional completed repairs and six months of safety checks.`, "success");
    });
    $("#remove-sample").addEventListener("click", () => {
      MH.removeSampleHistory();
      render();
      MH.ui.showBanner("Sample history removed. Real records were not changed.", "success");
    });
  }

  $("#period").addEventListener("change", render);
  $("#history-status").addEventListener("change", render);
  MH.onExternalChange(() => { render(); MH.ui.renderHeader(); });
  render();
})();

// Charts and downloadable reports (PDF with the Meadow House logo, and CSV).
// jsPDF is bundled in /vendor and only loaded when a PDF is requested.
(() => {
  "use strict";
  const MH = window.MH;
  if (!MH.user) return;
  const SVG_NS = "http://www.w3.org/2000/svg";
  // Validated with the dataviz palette checker (light surface): green = repairs, amber = safety checks.
  const COLORS = { repairs: "#2f7a4a", checks: "#c98a2e", grid: "#e6dfcf", axis: "#4f5d55", ink: "#23302a" };

  /* ---------- Data ---------- */

  function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function monthlyActivity(jobs, tasks, months = 6) {
    const now = new Date();
    const buckets = [];
    for (let i = months - 1; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: monthKey(d),
        label: new Intl.DateTimeFormat("en-GB", { month: "short" }).format(d),
        long: new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(d),
        repairs: 0, checks: 0
      });
    }
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    jobs.forEach((job) => {
      const { completed } = MH.jobTimes(job);
      if (job.status === "Completed" && completed) {
        const bucket = byKey.get(monthKey(new Date(completed)));
        if (bucket) bucket.repairs += 1;
      }
    });
    tasks.forEach((task) => (task.log || []).forEach((entry) => {
      const date = MH.parseInputDate(entry.date);
      const bucket = date && byKey.get(monthKey(date));
      if (bucket) bucket.checks += 1;
    }));
    return buckets;
  }

  function turnaroundSummary(jobs) {
    const counts = { "same-day": 0, "within-2": 0, longer: 0 };
    jobs.forEach((job) => { const t = MH.turnaround(job); if (t) counts[t.key] += 1; });
    const total = counts["same-day"] + counts["within-2"] + counts.longer;
    return { counts, total, quickShare: total ? Math.round(((counts["same-day"] + counts["within-2"]) / total) * 100) : 0 };
  }

  /* ---------- SVG helpers ---------- */

  function svgEl(tag, attrs, text) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, String(v)));
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Rectangle with rounded top corners only (data end), square at the baseline.
  function topRoundedPath(x, y, w, h, r) {
    const rr = Math.min(r, h, w / 2);
    return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
  }

  function niceMax(value) {
    if (value <= 4) return 4;
    const step = Math.pow(10, Math.floor(Math.log10(value)));
    const n = value / step;
    return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * step;
  }

  // Stacked monthly bars: repairs completed (bottom) + safety checks recorded (top).
  function monthlyChartSvg(data, { interactive = true } = {}) {
    const W = 640, H = 280, left = 40, right = 12, top = 28, bottom = 36;
    const plotW = W - left - right, plotH = H - top - bottom;
    const max = niceMax(Math.max(1, ...data.map((d) => d.repairs + d.checks)));
    const y = (v) => top + plotH - (v / max) * plotH;
    const band = plotW / data.length;
    const barW = Math.min(56, band * 0.56);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "font-family": "Arial, Helvetica, sans-serif" });
    svg.append(svgEl("title", {}, "Maintenance done each month: repairs completed and safety checks recorded"));
    svg.append(svgEl("rect", { x: 0, y: 0, width: W, height: H, fill: "#ffffff" }));
    for (let i = 0; i <= 4; i += 1) {
      const v = (max / 4) * i;
      svg.append(svgEl("line", { x1: left, x2: W - right, y1: y(v), y2: y(v), stroke: i === 0 ? COLORS.axis : COLORS.grid, "stroke-width": 1 }));
      svg.append(svgEl("text", { x: left - 8, y: y(v) + 4, "text-anchor": "end", "font-size": 12, fill: COLORS.axis }, String(Math.round(v))));
    }
    data.forEach((d, i) => {
      const cx = left + band * i + band / 2;
      const x = cx - barW / 2;
      const group = svgEl("g", { class: "chart-bar" });
      const total = d.repairs + d.checks;
      const hRepairs = (d.repairs / max) * plotH;
      const hChecks = (d.checks / max) * plotH;
      const gap = d.repairs && d.checks ? 2 : 0;
      if (d.repairs) {
        const yR = top + plotH - hRepairs;
        group.append(d.checks
          ? svgEl("rect", { x, y: yR, width: barW, height: hRepairs, fill: COLORS.repairs })
          : svgEl("path", { d: topRoundedPath(x, yR, barW, hRepairs, 4), fill: COLORS.repairs }));
      }
      if (d.checks) {
        const yC = top + plotH - hRepairs - gap - hChecks;
        group.append(svgEl("path", { d: topRoundedPath(x, yC, barW, Math.max(0, hChecks), 4), fill: COLORS.checks }));
      }
      // Direct total label above each bar (text in ink, not series colour).
      svg.append(svgEl("text", { x: cx, y: y(total) - gap - 6, "text-anchor": "middle", "font-size": 13, "font-weight": 700, fill: COLORS.ink }, String(total)));
      svg.append(svgEl("text", { x: cx, y: H - bottom + 20, "text-anchor": "middle", "font-size": 13, fill: COLORS.axis }, d.label));
      if (interactive) {
        const hit = svgEl("rect", { x: left + band * i, y: top, width: band, height: plotH, fill: "transparent" });
        group.append(hit);
        group.setAttribute("tabindex", "0");
        group.setAttribute("role", "img");
        group.setAttribute("aria-label", `${d.long}: ${MH.plural(d.repairs, "repair")} completed, ${MH.plural(d.checks, "safety check")} recorded, ${total} in total`);
        group.dataset.index = String(i);
      }
      svg.append(group);
    });
    return svg;
  }

  function renderMonthlyChart(container, data) {
    container.replaceChildren();
    const legend = document.createElement("ul");
    legend.className = "chart-legend";
    [["repairs", "Repairs completed"], ["checks", "Safety checks recorded"]].forEach(([key, label]) => {
      const li = document.createElement("li");
      const swatch = document.createElement("span");
      swatch.className = `legend-swatch swatch-${key}`;
      li.append(swatch, label);
      legend.append(li);
    });
    const frame = document.createElement("div");
    frame.className = "chart-frame";
    const svg = monthlyChartSvg(data);
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.setAttribute("aria-label", "Bar chart of maintenance done in the last six months. Use Tab to hear each month, or open the table below.");
    const tip = document.createElement("div");
    tip.className = "chart-tooltip";
    tip.hidden = true;
    frame.append(svg, tip);

    const show = (group) => {
      const d = data[Number(group.dataset.index)];
      tip.replaceChildren();
      const title = document.createElement("strong");
      title.textContent = d.long;
      const rows = [["repairs", "Repairs completed", d.repairs], ["checks", "Safety checks recorded", d.checks]];
      tip.append(title);
      rows.forEach(([key, label, value]) => {
        const row = document.createElement("span");
        row.className = "tip-row";
        const sw = document.createElement("span");
        sw.className = `legend-swatch swatch-${key}`;
        row.append(sw, `${label}: ${value}`);
        tip.append(row);
      });
      const total = document.createElement("span");
      total.className = "tip-row tip-total";
      total.textContent = `Total: ${d.repairs + d.checks}`;
      tip.append(total);
      const box = frame.getBoundingClientRect();
      const g = group.getBoundingClientRect();
      tip.hidden = false;
      const left = Math.min(Math.max(8, g.left - box.left + g.width / 2 - tip.offsetWidth / 2), box.width - tip.offsetWidth - 8);
      tip.style.left = `${left}px`;
      tip.style.top = "8px";
      svg.querySelectorAll(".chart-bar").forEach((other) => other.classList.toggle("is-dim", other !== group));
    };
    const hide = () => {
      tip.hidden = true;
      svg.querySelectorAll(".chart-bar").forEach((other) => other.classList.remove("is-dim"));
    };
    svg.querySelectorAll(".chart-bar").forEach((group) => {
      group.addEventListener("mouseenter", () => show(group));
      group.addEventListener("focus", () => show(group));
      group.addEventListener("mouseleave", hide);
      group.addEventListener("blur", hide);
    });

    const details = document.createElement("details");
    details.className = "chart-table";
    const summary = document.createElement("summary");
    summary.textContent = "Show these numbers as a table";
    const table = document.createElement("table");
    table.className = "data-table";
    const head = document.createElement("tr");
    ["Month", "Repairs completed", "Safety checks recorded", "Total"].forEach((text) => { const th = document.createElement("th"); th.scope = "col"; th.textContent = text; head.append(th); });
    const thead = document.createElement("thead");
    thead.append(head);
    const tbody = document.createElement("tbody");
    data.forEach((d) => {
      const tr = document.createElement("tr");
      [d.long, d.repairs, d.checks, d.repairs + d.checks].forEach((v, i) => { const cell = document.createElement(i ? "td" : "th"); if (!i) cell.scope = "row"; cell.textContent = String(v); tr.append(cell); });
      tbody.append(tr);
    });
    table.append(thead, tbody);
    details.append(summary, table);
    container.append(legend, frame, details);
    return svg;
  }

  function renderTurnaround(container, summary) {
    container.replaceChildren();
    const rows = [["same-day", "Same day"], ["within-2", "1–2 days"], ["longer", "Longer than 2 days"]];
    const max = Math.max(1, ...Object.values(summary.counts));
    rows.forEach(([key, label]) => {
      const count = summary.counts[key];
      const row = document.createElement("div");
      row.className = "hbar-row";
      const name = document.createElement("span");
      name.className = "hbar-label";
      name.textContent = label;
      const track = document.createElement("span");
      track.className = "hbar-track";
      const bar = document.createElement("span");
      bar.className = `hbar hbar-${key}`;
      bar.style.width = `${(count / max) * 100}%`;
      track.append(bar);
      const value = document.createElement("span");
      value.className = "hbar-value";
      value.textContent = `${count}${summary.total ? ` (${Math.round((count / summary.total) * 100)}%)` : ""}`;
      row.append(name, track, value);
      row.setAttribute("role", "listitem");
      container.append(row);
    });
    container.setAttribute("role", "list");
  }

  async function svgToPng(svg, width, height) {
    const clone = svg.cloneNode(true);
    clone.setAttribute("width", width);
    clone.setAttribute("height", height);
    clone.querySelectorAll("[tabindex]").forEach((n) => n.removeAttribute("tabindex"));
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  }

  /* ---------- Downloads ---------- */

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // Cells that start with = + - @ could run as formulas in a spreadsheet; prefix them.
  function csvCell(value) {
    let text = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function downloadCsv(rows, filename) {
    const text = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    saveBlob(new Blob([`﻿${text}`], { type: "text/csv;charset=utf-8" }), filename);
  }

  let pdfLoading = null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.append(s);
    });
  }
  function loadPdf() {
    if (!pdfLoading) {
      pdfLoading = loadScript("vendor/jspdf.umd.min.js").then(() => loadScript("vendor/jspdf.plugin.autotable.min.js")).then(() => window.jspdf.jsPDF);
    }
    return pdfLoading;
  }

  const stamp = () => MH.formatDateTime(new Date());
  const fileDate = () => MH.toInputDate(new Date());

  function pdfHeader(doc, title, subtitle) {
    const pageW = doc.internal.pageSize.getWidth();
    if (window.MH_LOGO) {
      const w = 30, h = w * (window.MH_LOGO.height / window.MH_LOGO.width);
      doc.addImage(window.MH_LOGO.dataUrl, "PNG", 12, 7, w, h, "mh-logo");
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(110, 31, 45);
    doc.text(title, 48, 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 70, 64);
    doc.text(subtitle, 48, 23);
    doc.text(`Generated ${stamp()} by ${MH.user.name} (${MH.ROLES[MH.user.role]})`, 48, 29);
    doc.setDrawColor(185, 169, 138);
    doc.setLineWidth(0.6);
    doc.line(12, 36, pageW - 12, 36);
  }

  function pdfFooters(doc, label) {
    const pages = doc.getNumberOfPages();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= pages; i += 1) {
      doc.setPage(i);
      if (i > 1 && window.MH_LOGO) {
        const w = 14, h = w * (window.MH_LOGO.height / window.MH_LOGO.width);
        doc.addImage(window.MH_LOGO.dataUrl, "PNG", pageW - 12 - w, 4, w, h, "mh-logo");
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(79, 93, 85);
      doc.text(`Meadow House Repairs & Maintenance · ${label} · Confidential`, 12, pageH - 7);
      doc.text(`Page ${i} of ${pages}`, pageW - 12, pageH - 7, { align: "right" });
    }
  }

  // The built-in PDF fonts only cover Western European characters; drop anything else (emoji, arrows).
  const pdfSafe = (text) => String(text ?? "").replace(/→/g, "->").replace(/[^\x00-\xFF–—‘’“”•…€]/g, "");

  const TABLE_STYLE = {
    didParseCell: (data) => { data.cell.text = data.cell.text.map(pdfSafe); },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.8, overflow: "linebreak", textColor: [35, 48, 42], lineColor: [221, 213, 196], lineWidth: 0.1 },
    headStyles: { fillColor: [39, 104, 71], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 247, 240] },
    margin: { left: 12, right: 12, top: 22, bottom: 14 }
  };

  function latestNote(job) {
    for (let i = job.history.length - 1; i >= 0; i -= 1) if (job.history[i].note) return job.history[i].note;
    return "";
  }

  function targetText(job) {
    const t = MH.responseTargets(job);
    const word = { met: "met", missed: "missed", overdue: "overdue", due: "on track" };
    return `${t.label}: attend ${word[t.attend]}, complete ${word[t.complete]}`;
  }

  // Share of jobs that met each target (only jobs where the outcome is known).
  function targetSummary(jobs) {
    const result = {};
    Object.keys(MH.TARGET_LABELS).forEach((cls) => { result[cls] = { jobs: 0, attendMet: 0, attendKnown: 0, completeMet: 0, completeKnown: 0 }; });
    let met = 0, known = 0;
    jobs.forEach((job) => {
      const t = MH.responseTargets(job);
      const r = result[t.cls];
      r.jobs += 1;
      if (t.attend === "met" || t.attend === "missed" || t.attend === "overdue") { r.attendKnown += 1; if (t.attend === "met") r.attendMet += 1; }
      if (t.complete === "met" || t.complete === "missed" || t.complete === "overdue") {
        r.completeKnown += 1; known += 1;
        if (t.complete === "met") { r.completeMet += 1; met += 1; }
      }
    });
    return { byClass: result, share: known ? Math.round((met / known) * 100) : null, known };
  }

  function spendSummary(jobs) {
    const byType = new Map();
    let total = 0;
    jobs.forEach((job) => {
      const cost = MH.jobCost(job);
      if (!cost) return;
      total += cost;
      const key = job.category || "Other";
      byType.set(key, (byType.get(key) || 0) + cost);
    });
    return { total, byType: [...byType.entries()].sort((a, b) => b[1] - a[1]) };
  }

  function jobRow(job, recurring) {
    const times = MH.jobTimes(job);
    const speed = MH.turnaround(job);
    return {
      id: job.id,
      issue: `${job.description}${job.location ? ` (${job.location})` : ""}`,
      type: job.category || "Other",
      priority: job.priority,
      reported: `${MH.formatDateTime(job.createdAt)} by ${job.reporter}`,
      assigned: job.assignedTo ? job.assignedTo.name : "Not assigned",
      attended: times.attended ? MH.formatDateTime(times.attended) : "",
      completed: times.completed ? MH.formatDateTime(times.completed) : "",
      turnaround: speed ? speed.short : job.status === "Completed" ? "" : "Open",
      status: `${job.status}${job.confirmation ? ` · ${job.confirmation.status}${job.confirmation.by ? ` (${job.confirmation.by})` : ""}` : ""}`,
      recurring: recurring && recurring.get(job.id) ? `Yes – ${recurring.get(job.id).size} similar` : "",
      notes: latestNote(job),
      safety: job.safety ? "Yes" : "",
      cost: job.costs ? MH.formatMoney(MH.jobCost(job)) : "",
      target: targetText(job)
    };
  }

  async function downloadOverviewReport({ periodLabel, jobs, allJobs, tasks, chartSvg, recurring }) {
    const JsPDF = await loadPdf();
    const doc = new JsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
    const pageW = doc.internal.pageSize.getWidth();
    pdfHeader(doc, "Meadow House – Maintenance report", `Period: ${periodLabel}`);

    const completed = jobs.filter((j) => j.status === "Completed");
    const speed = turnaroundSummary(jobs);
    const overdue = tasks.filter((t) => MH.taskState(t).key === "overdue").length;
    const groups = [...new Map([...recurring.values()].map((g) => [g.ids.join(), g])).values()];
    const kpis = [
      ["Repairs reported", jobs.length], ["Repairs completed", completed.length],
      ["Completed within 2 days", `${speed.quickShare}%`], ["Waiting for staff confirmation", completed.filter((j) => j.confirmation && j.confirmation.status !== "Confirmed").length],
      ["Recurring issues", groups.length], ["Repair spend", MH.formatMoney(spendSummary(jobs).total)]
    ];
    const boxW = (pageW - 24 - 5 * 4) / 6;
    kpis.forEach(([label, value], i) => {
      const x = 12 + i * (boxW + 4);
      doc.setDrawColor(221, 213, 196);
      doc.setFillColor(255, 253, 248);
      doc.roundedRect(x, 41, boxW, 20, 2, 2, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(35, 48, 42);
      doc.text(String(value), x + 4, 50);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(79, 93, 85);
      doc.text(label, x + 4, 57);
    });

    const png = await svgToPng(chartSvg, 640, 280);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(35, 48, 42);
    doc.text("Maintenance done in the last six months", 12, 70);
    doc.addImage(png, "PNG", 12, 73, 160, 70);
    doc.setFillColor(47, 122, 74); doc.rect(14, 147, 4, 4, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text("Repairs completed", 20, 150.5);
    doc.setFillColor(201, 138, 46); doc.rect(56, 147, 4, 4, "F");
    doc.text("Safety checks recorded", 62, 150.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("How quickly repairs were completed", 182, 70);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    [["Same day", speed.counts["same-day"]], ["1–2 days", speed.counts["within-2"]], ["Longer than 2 days", speed.counts.longer]].forEach(([label, n], i) => {
      doc.text(`${label}: ${n}${speed.total ? ` (${Math.round((n / speed.total) * 100)}%)` : ""}`, 182, 80 + i * 7);
    });
    doc.setFont("helvetica", "bold");
    doc.text("Recurring issues", 182, 108);
    doc.setFont("helvetica", "normal");
    (groups.length ? groups.slice(0, 6) : [null]).forEach((g, i) => {
      doc.text(g ? doc.splitTextToSize(pdfSafe(`• ${g.label}: ${g.size} reports`), 100) : "None found in this period.", 182, 116 + i * 7);
    });

    if (groups.length) {
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(110, 31, 45);
      doc.text("Recurring issues – consider a longer-term fix", 12, 18);
      doc.autoTable({
        ...TABLE_STYLE, startY: 22,
        head: [["Where / type", "Reports", "Job IDs", "First reported", "Latest reported", "Latest status"]],
        body: groups.map((g) => [g.label, g.size, g.ids.join(", "), MH.formatDate(g.jobs[0].createdAt), MH.formatDate(g.jobs[g.jobs.length - 1].createdAt), g.jobs[g.jobs.length - 1].status])
      });
    }

    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(110, 31, 45);
    doc.text("Repair history", 12, 18);
    const columns = [
      ["id", "Job"], ["issue", "What and where"], ["priority", "Priority"], ["reported", "Reported"], ["assigned", "Assigned to"],
      ["attended", "Team attended"], ["completed", "Completed"], ["turnaround", "Time taken"], ["status", "Status / confirmation"], ["recurring", "Recurring"], ["notes", "Latest note"]
    ];
    doc.autoTable({
      ...TABLE_STYLE, startY: 22,
      head: [columns.map(([, label]) => label)],
      body: jobs.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((job) => { const r = jobRow(job, recurring); return columns.map(([key]) => r[key]); }),
      columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 42 }, 10: { cellWidth: 40 } }
    });

    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(110, 31, 45);
    doc.text("Planned safety checks", 12, 18);
    doc.autoTable({
      ...TABLE_STYLE, startY: 22,
      head: [["Check", "Category", "How often", "Last done", "Next due", "Status", "Assigned to", "Booked date"]],
      body: tasks.slice().sort((a, b) => MH.taskState(a).days - MH.taskState(b).days).map((t) => {
        const s = MH.taskState(t);
        return [t.name, t.category, MH.frequencyLabel(t), MH.formatDate(t.lastDone), MH.formatDate(s.due), s.detail, t.assignedTo ? t.assignedTo.name : "", t.appointment ? `${MH.formatAppointment(t.appointment)} (${t.appointment.status})` : ""];
      })
    });

    pdfFooters(doc, "Maintenance report");
    doc.save(`meadow-house-maintenance-report-${fileDate()}.pdf`);
    MH.audit("Report downloaded", `Maintenance report PDF · ${periodLabel}`);
  }

  async function downloadJobReport(job, recurringInfo) {
    const JsPDF = await loadPdf();
    const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    pdfHeader(doc, `Job report ${job.id}`, pdfSafe(`${job.house} · ${job.status} · ${job.priority} priority`));
    const r = jobRow(job, recurringInfo ? new Map([[job.id, recurringInfo]]) : null);
    doc.autoTable({
      ...TABLE_STYLE, startY: 42, theme: "grid",
      styles: { ...TABLE_STYLE.styles, fontSize: 10 },
      columnStyles: { 0: { cellWidth: 45, fontStyle: "bold", fillColor: [246, 241, 230] } },
      body: [
        ["What needs doing", job.description], ["Where", job.location || "Not given"], ["Type", job.category || "Other"],
        ["Reported", r.reported], ["Source", job.source || "Staff report"], ["Assigned to", r.assigned],
        ["Visit", job.appointment ? `${MH.formatAppointment(job.appointment)} · ${job.appointment.status}` : "Not booked"],
        ["Team attended", r.attended || "Not yet"], ["Completed", r.completed || "Not yet"], ["Time taken", r.turnaround || ""],
        ["Staff confirmation", job.confirmation ? `${job.confirmation.status}${job.confirmation.by ? ` by ${job.confirmation.by} on ${MH.formatDateTime(job.confirmation.at)}` : ""}` : "Not applicable yet"],
        ["Recurring issue", recurringInfo ? `Yes – ${recurringInfo.size} similar reports (${recurringInfo.label}): ${recurringInfo.ids.join(", ")}` : "No similar reports found"],
        ["Resident safety", job.safety ? "Yes – affects resident safety" : "No"],
        ["Response target", r.target],
        ["Cost", job.costs ? `${MH.formatMoney(MH.jobCost(job))} (parts ${MH.formatMoney(job.costs.parts)}, labour ${MH.formatMoney(job.costs.labour)})${job.costs.contractor ? ` · ${job.costs.contractor}` : ""}` : "Not recorded"]
      ]
    });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(110, 31, 45);
    doc.text("History", 12, doc.lastAutoTable.finalY + 10);
    doc.autoTable({
      ...TABLE_STYLE, startY: doc.lastAutoTable.finalY + 13,
      head: [["When", "What happened", "Status", "By", "Note / detail"]],
      body: job.history.map((e) => [MH.formatDateTime(e.timestamp), e.event, e.status || "", e.by || "", [e.detail, e.note].filter(Boolean).join(" — ")]),
      columnStyles: { 0: { cellWidth: 34 }, 4: { cellWidth: 60 } }
    });
    if (job.photos && job.photos.length && MH.media) {
      let y = doc.lastAutoTable.finalY + 10;
      const pageH = doc.internal.pageSize.getHeight();
      if (y > pageH - 80) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(110, 31, 45);
      doc.text("Photos", 12, y);
      y += 4;
      let x = 12;
      for (const photo of job.photos.slice(0, 8)) {
        const file = await MH.media.fileDataUrl(photo.id);
        if (!file || !/^image\//.test(file.type)) continue;
        const img = new Image();
        await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; img.src = file.dataUrl; });
        const w = 44, h = img.naturalWidth ? Math.min(44, w * (img.naturalHeight / img.naturalWidth)) : 33;
        if (x + w > 198) { x = 12; y += 52; }
        if (y + h + 8 > pageH - 14) { doc.addPage(); y = 20; x = 12; }
        doc.addImage(file.dataUrl, "JPEG", x, y, w, h);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(79, 93, 85);
        doc.text(pdfSafe(MH.media.KIND_LABEL[photo.kind] || "Photo"), x, y + h + 4);
        x += w + 4;
      }
    }
    pdfFooters(doc, `Job report ${job.id}`);
    doc.save(`meadow-house-job-${job.id}.pdf`);
    MH.audit("Report downloaded", `Job report PDF · ${job.id}`);
  }

  function historyCsvRows(jobs, recurring) {
    const header = ["Job ID", "What needs doing", "Where", "Type", "Priority", "Resident safety", "Reported on", "Reported by", "Source", "Assigned to", "Visit", "Team attended", "Completed", "Time taken", "Response target", "Cost (GBP)", "Status", "Staff confirmation", "Recurring", "Latest note"];
    return [header, ...jobs.map((job) => {
      const r = jobRow(job, recurring);
      return [job.id, job.description, job.location || "", job.category || "Other", job.priority, r.safety, MH.formatDateTime(job.createdAt), job.reporter, job.source || "Staff report",
        r.assigned, job.appointment ? MH.formatAppointment(job.appointment) : "", r.attended, r.completed, r.turnaround, r.target, job.costs ? MH.jobCost(job).toFixed(2) : "", job.status,
        job.confirmation ? job.confirmation.status : "", r.recurring, r.notes];
    })];
  }

  async function downloadEvidencePack({ sinceIso, periodLabel, chartSvg }) {
    const data = MH.evidenceData(sinceIso);
    const JsPDF = await loadPdf();
    const doc = new JsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
    const pageW = doc.internal.pageSize.getWidth();
    const recurring = MH.findRecurring(data.allJobs);
    const jobs = data.jobs;
    const heading = (text) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(110, 31, 45);
      doc.text(text, 12, 18);
    };

    // Cover page
    if (window.MH_LOGO) doc.addImage(window.MH_LOGO.dataUrl, "PNG", pageW / 2 - 30, 22, 60, 60 * (window.MH_LOGO.height / window.MH_LOGO.width), "mh-logo");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(110, 31, 45);
    doc.text("Premises safety and maintenance evidence", pageW / 2, 100, { align: "center" });
    doc.setFontSize(14);
    doc.setTextColor(35, 48, 42);
    doc.text("Meadow House", pageW / 2, 110, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Period: ${periodLabel}`, pageW / 2, 122, { align: "center" });
    doc.text(`Prepared ${stamp()} by ${MH.user.name} (${MH.ROLES[MH.user.role]})`, pageW / 2, 129, { align: "center" });
    const contents = ["1. Summary", "2. Safety checks and testing", "3. Certificate register", "4. Repairs, response times and costs", "5. Recurring issues and actions", "6. Planned works notified to staff"];
    doc.setFontSize(11);
    contents.forEach((line, i) => doc.text(line, pageW / 2 - 45, 145 + i * 7));

    // 1. Summary
    doc.addPage();
    heading("1. Summary");
    const completed = jobs.filter((j) => j.status === "Completed");
    const speed = turnaroundSummary(completed);
    const targets = targetSummary(jobs);
    const spend = spendSummary(jobs);
    const certRows = MH.registers ? MH.registers.certificateRows() : [];
    const certCount = (key) => certRows.filter((r) => r.state.key === key).length;
    const taskStates = data.tasks.map((t) => MH.taskState(t));
    doc.autoTable({
      ...TABLE_STYLE, startY: 24, theme: "grid",
      columnStyles: { 0: { cellWidth: 110, fontStyle: "bold", fillColor: [246, 241, 230] } },
      body: [
        ["Repairs reported in the period", String(jobs.length)],
        ["Repairs completed", String(completed.length)],
        ["Completed within 2 days of report", `${speed.quickShare}%`],
        ["Completed within the response target", targets.share === null ? "No completed repairs yet" : `${targets.share}% of ${targets.known}`],
        ["Resident safety repairs reported", String(jobs.filter((j) => j.safety).length)],
        ["Completed repairs confirmed by staff", String(completed.filter((j) => j.confirmation && j.confirmation.status === "Confirmed").length)],
        ["Repair spend recorded", MH.formatMoney(spend.total)],
        ["Safety checks up to date", `${taskStates.filter((s) => s.key === "ok" || s.key === "soon").length} of ${data.tasks.length}`],
        ["Safety checks overdue", String(taskStates.filter((s) => s.key === "overdue").length)],
        ["Safety checks with no record yet", String(taskStates.filter((s) => s.key === "missing").length)],
        ["Certificates valid / expiring / expired or missing", `${certCount("valid")} / ${certCount("expiring")} / ${certCount("expired") + certCount("missing")}`]
      ]
    });
    if (chartSvg) {
      const png = await svgToPng(chartSvg, 640, 280);
      doc.addImage(png, "PNG", 160, 26, 125, 55);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(79, 93, 85);
      doc.text("Maintenance done in the last six months (green: repairs, amber: safety checks)", 160, 86);
    }

    // 2. Safety checks
    doc.addPage();
    heading("2. Safety checks and testing");
    doc.autoTable({
      ...TABLE_STYLE, startY: 22,
      head: [["Check", "Category", "How often", "Last done", "Done by", "Next due", "Status", "Booked date"]],
      body: data.tasks.slice().sort((a, b) => MH.taskState(a).days - MH.taskState(b).days).map((t) => {
        const s = MH.taskState(t);
        const last = t.log[t.log.length - 1];
        return [t.name, t.category, MH.frequencyLabel(t), MH.formatDate(t.lastDone), last && last.by ? last.by : "", MH.formatDate(s.due), s.detail, t.appointment ? `${MH.formatAppointment(t.appointment)} (${t.appointment.status})` : ""];
      })
    });

    // 3. Certificates
    doc.addPage();
    heading("3. Certificate register");
    doc.autoTable({
      ...TABLE_STYLE, startY: 22,
      head: [["Check", "Certificate", "Number", "Issued", "Expires", "Status", "Engineer / company", "Registration"]],
      body: certRows.map(({ task, cert, state }) => [task.name, task.certType, cert ? cert.reference : "", cert ? MH.formatDate(cert.issued) : "", cert ? MH.formatDate(cert.expires) : "", `${state.label}${cert ? ` – ${state.detail}` : ""}`, cert ? cert.contractor : "", cert ? cert.registration : ""])
    });

    // 4. Repairs
    doc.addPage();
    heading("4. Repairs, response times and costs");
    const tRows = Object.entries(targets.byClass).map(([cls, r]) => {
      const t = data.settings.targets[cls];
      return [MH.TARGET_LABELS[cls], `${MH.hoursText(t.attend)} / ${MH.hoursText(t.complete)}`, String(r.jobs),
        r.attendKnown ? `${Math.round((r.attendMet / r.attendKnown) * 100)}% (${r.attendMet}/${r.attendKnown})` : "–",
        r.completeKnown ? `${Math.round((r.completeMet / r.completeKnown) * 100)}% (${r.completeMet}/${r.completeKnown})` : "–"];
    });
    doc.autoTable({ ...TABLE_STYLE, startY: 22, head: [["Type of repair", "Target: attend / complete", "Repairs", "Attended on time", "Completed on time"]], body: tRows });
    const columns = [["id", "Job"], ["issue", "What and where"], ["priority", "Priority"], ["safety", "Safety"], ["reported", "Reported"], ["attended", "Attended"], ["completed", "Completed"], ["target", "Response target"], ["cost", "Cost"], ["status", "Status / confirmation"], ["notes", "Latest note"]];
    doc.autoTable({
      ...TABLE_STYLE, startY: doc.lastAutoTable.finalY + 6,
      head: [columns.map(([, label]) => label)],
      body: jobs.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((job) => { const r = jobRow(job, recurring); return columns.map(([key]) => r[key]); }),
      columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 40 }, 10: { cellWidth: 38 } }
    });

    // 5. Recurring issues
    doc.addPage();
    heading("5. Recurring issues and actions");
    const inPeriod = new Set(jobs.map((j) => j.id));
    const groups = [...new Map([...recurring.values()].map((g) => [g.ids.join(), g])).values()].filter((g) => g.ids.some((id) => inPeriod.has(id)));
    doc.autoTable({
      ...TABLE_STYLE, startY: 22,
      head: [["Where / type", "Reports", "Job IDs", "First reported", "Latest reported", "Latest status", "Spend"]],
      body: groups.length ? groups.map((g) => [g.label, g.size, g.ids.join(", "), MH.formatDate(g.jobs[0].createdAt), MH.formatDate(g.jobs[g.jobs.length - 1].createdAt), g.jobs[g.jobs.length - 1].status, MH.formatMoney(g.jobs.reduce((sum, j) => sum + MH.jobCost(j), 0))])
        : [["No recurring issues in this period", "", "", "", "", "", ""]]
    });

    // 6. Planned works
    doc.addPage();
    heading("6. Planned works notified to staff");
    const since = sinceIso ? Date.parse(sinceIso) : 0;
    const notices = data.announcements.filter((a) => Date.parse(a.createdAt) >= since).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    doc.autoTable({
      ...TABLE_STYLE, startY: 22,
      head: [["Posted", "Work", "When", "Where", "Message to staff", "Read by"]],
      body: notices.length ? notices.map((a) => [MH.formatDateTime(a.createdAt), a.title, MH.formatAppointment(a), a.location || "", a.message, String(Object.keys(a.readBy || {}).length)])
        : [["No planned works were notified in this period", "", "", "", "", ""]]
    });

    pdfFooters(doc, "Premises safety and maintenance evidence");
    doc.save(`meadow-house-evidence-pack-${fileDate()}.pdf`);
  }

  MH.reports = { loadPdf, pdfSafe, targetSummary, spendSummary, downloadEvidencePack, monthlyActivity, turnaroundSummary, renderMonthlyChart, renderTurnaround, downloadOverviewReport, downloadJobReport, downloadCsv, historyCsvRows, jobRow };
})();

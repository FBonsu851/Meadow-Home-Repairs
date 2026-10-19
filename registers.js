// Certificate register and room QR codes.
(() => {
  "use strict";
  const MH = window.MH;
  if (!MH.user || !MH.ui) return;
  const { el, button } = MH.ui;

  /* ---------- Certificate register ---------- */

  const ORDER = { expired: 0, missing: 1, expiring: 2, valid: 3 };

  function certificateRows() {
    return MH.loadTasks().filter((task) => task.certType).map((task) => {
      const cert = task.certificates[task.certificates.length - 1] || null;
      const state = cert ? MH.certificateState(cert) : { key: "missing", label: "Not recorded", detail: "No certificate on file" };
      return { task, cert, state };
    }).sort((a, b) => ORDER[a.state.key] - ORDER[b.state.key] || (a.state.days || 0) - (b.state.days || 0));
  }

  function renderCertificates(container) {
    const rows = certificateRows();
    const counts = rows.reduce((acc, r) => { acc[r.state.key] = (acc[r.state.key] || 0) + 1; return acc; }, {});
    const summary = el("p", "section-copy cert-summary");
    summary.append(
      el("span", "task-badge task-ok", `${counts.valid || 0} valid`), " ",
      el("span", "task-badge task-soon", `${counts.expiring || 0} expiring within 30 days`), " ",
      el("span", "task-badge task-overdue", `${(counts.expired || 0) + (counts.missing || 0)} expired or missing`)
    );
    const wrap = el("div", "table-wrap");
    const table = el("table", "data-table");
    const caption = el("caption", "visually-hidden", "Certificate register");
    const thead = el("thead");
    const head = el("tr");
    ["Check", "Certificate", "Number", "Issued", "Expires", "Status", "Engineer / company", "File"].forEach((t) => { const th = el("th", "", t); th.scope = "col"; head.append(th); });
    thead.append(head);
    const tbody = el("tbody");
    rows.forEach(({ task, cert, state }) => {
      const tr = el("tr", `cert-row cert-${state.key}`);
      const cells = [
        ["Check", task.name], ["Certificate", task.certType], ["Number", cert ? cert.reference : "–"],
        ["Issued", cert ? MH.formatDate(cert.issued) : "–"], ["Expires", cert ? MH.formatDate(cert.expires) : "–"]
      ];
      cells.forEach(([label, value], i) => { const c = el(i ? "td" : "th", "", value); if (!i) c.scope = "row"; c.dataset.label = label; tr.append(c); });
      const status = el("td");
      status.dataset.label = "Status";
      status.append(el("span", `task-badge task-${state.key === "valid" ? "ok" : state.key === "expiring" ? "soon" : "overdue"}`, state.label), " ", el("span", "task-detail", state.detail));
      tr.append(status);
      const who = el("td", "", cert ? [cert.contractor, cert.registration && `Reg. ${cert.registration}`].filter(Boolean).join(" · ") || "–" : "–");
      who.dataset.label = "Engineer / company";
      tr.append(who);
      const file = el("td");
      file.dataset.label = "File";
      if (cert && cert.fileId && MH.media) {
        const b = button("View", "secondary button-small", () => MH.media.openFile(cert.fileId));
        b.setAttribute("aria-label", `View certificate ${cert.reference}`);
        file.append(b);
      } else {
        file.append("–");
      }
      tr.append(file);
      tbody.append(tr);
    });
    table.append(caption, thead, tbody);
    wrap.append(table);
    container.replaceChildren(summary, wrap);
  }

  /* ---------- Room QR codes ---------- */

  function qrCanvas(text, size) {
    const qr = window.qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    const quiet = 4;
    const cell = Math.max(1, Math.floor(size / (count + quiet * 2)));
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = cell * (count + quiet * 2);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000000";
    for (let r = 0; r < count; r += 1) {
      for (let c = 0; c < count; c += 1) {
        if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
      }
    }
    return canvas;
  }

  const roomUrl = (base, room) => `${base}index.html?location=${encodeURIComponent(room)}`;

  function renderRooms(container, onChange) {
    const settings = MH.loadSettings();
    const base = MH.systemUrl();
    const parts = [];
    if (!base) {
      parts.push(el("p", "page-banner banner-warning", "Room QR codes need the system's web address. Ask the system administrator to add it under Admin → System & data."));
    }
    const formSlot = el("div", "room-form");
    const form = MH.ui.inlineForm({
      ariaLabel: "Add a room or area", submitText: "Add room",
      fields: [{ name: "name", label: "Room or area name", required: true, maxLength: 60, hint: "For example: Room 14, Sensory room, Staff kitchen." }],
      onSubmit: (v) => {
        const r = MH.addLocation(v.name);
        if (!r.ok) return r;
        onChange(`${v.name} added.`);
        return r;
      },
      onCancel: () => onChange("")
    });
    formSlot.append(form);
    parts.push(formSlot);

    const toolbar = el("div", "toolbar-actions qr-toolbar");
    const download = button("Download QR code sheet (PDF)", "primary", async () => {
      download.disabled = true;
      try {
        await downloadQrSheet(settings.locations, base);
        MH.ui.announce("QR code sheet downloaded.");
      } finally {
        download.disabled = false;
      }
    });
    download.disabled = !base || !settings.locations.length;
    toolbar.append(download);
    parts.push(toolbar);

    const list = el("ul", "room-list");
    settings.locations.forEach((room) => {
      const li = el("li", "room-card");
      if (base) {
        const canvas = qrCanvas(roomUrl(base, room), 120);
        canvas.className = "room-qr";
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `QR code for reporting a repair in ${room}`);
        li.append(canvas);
      }
      li.append(el("span", "room-name", room));
      const remove = button("Remove", "secondary button-small", () => {
        const r = MH.removeLocation(room);
        onChange(r.ok ? `${room} removed.` : r.error);
      });
      remove.setAttribute("aria-label", `Remove ${room}`);
      li.append(remove);
      list.append(li);
    });
    parts.push(list);
    container.replaceChildren(...parts);
  }

  async function downloadQrSheet(rooms, base) {
    const JsPDF = await MH.reports.loadPdf();
    const doc = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const pageW = 210, pageH = 297, cols = 2, rowsPerPage = 3;
    const cellW = (pageW - 20) / cols, cellH = (pageH - 20) / rowsPerPage;
    rooms.forEach((room, i) => {
      const slot = i % (cols * rowsPerPage);
      if (i > 0 && slot === 0) doc.addPage();
      const x = 10 + (slot % cols) * cellW;
      const y = 10 + Math.floor(slot / cols) * cellH;
      doc.setDrawColor(185, 169, 138);
      doc.setLineDashPattern([2, 2], 0);
      doc.rect(x + 2, y + 2, cellW - 4, cellH - 4);
      doc.setLineDashPattern([], 0);
      if (window.MH_LOGO) doc.addImage(window.MH_LOGO.dataUrl, "PNG", x + 6, y + 6, 18, 18 * (window.MH_LOGO.height / window.MH_LOGO.width), "mh-logo");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(110, 31, 45);
      doc.text("Report a repair", x + 27, y + 12);
      doc.setFontSize(17);
      doc.setTextColor(35, 48, 42);
      doc.text(MH.reports.pdfSafe(room), x + 27, y + 20, { maxWidth: cellW - 33 });
      const png = qrCanvas(roomUrl(base, room), 600).toDataURL("image/png");
      const size = Math.min(cellW - 30, cellH - 45);
      doc.addImage(png, "PNG", x + (cellW - size) / 2, y + 27, size, size);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(79, 93, 85);
      doc.text("Scan with your phone or tablet camera, sign in,", x + cellW / 2, y + cellH - 12, { align: "center" });
      doc.text("then describe the problem. The room is filled in for you.", x + cellW / 2, y + cellH - 7.5, { align: "center" });
    });
    doc.save(`meadow-house-room-qr-codes-${MH.toInputDate(new Date())}.pdf`);
    MH.audit("QR code sheet downloaded", `${MH.plural(rooms.length, "room")}`);
  }

  MH.registers = { renderCertificates, certificateRows, renderRooms, qrCanvas };
})();

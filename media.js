// Photos and certificate files. Stored in the browser's IndexedDB (much larger than local storage);
// repair records keep only a reference to each file.
(() => {
  "use strict";
  const MH = window.MH;
  if (!MH.user) return;
  const DB_NAME = "meadow-house-files";
  const STORE = "files";
  const MAX_PHOTOS = 4;
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  let dbPromise = null;
  const urlCache = new Map();

  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return dbPromise;
  }

  async function tx(mode, fn) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const t = database.transaction(STORE, mode);
      const result = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(result && "result" in result ? result.result : undefined);
      t.onerror = () => reject(t.error);
    });
  }

  const newId = () => `F-${Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("")}`;

  // Shrink photos to at most 1600px and re-encode as JPEG (also strips location metadata).
  async function compressImage(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close && bitmap.close();
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  }

  function checkFiles(files, { images = true, max = MAX_PHOTOS } = {}) {
    if (files.length > max) return `Choose up to ${MH.plural(max, "file")}.`;
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES * 3) return `${file.name} is too large. Choose a file under 24 MB.`;
      if (images && !/^image\//.test(file.type)) return `${file.name} is not a photo. Choose a JPG, PNG or HEIC image.`;
      if (!images && !/^image\/|^application\/pdf$/.test(file.type)) return `${file.name} must be a PDF or a photo of the certificate.`;
    }
    return "";
  }

  async function saveFile(file, meta) {
    const isImage = /^image\//.test(file.type);
    const blob = isImage ? await compressImage(file) : file;
    if (!blob) throw new Error("This photo could not be read. Try a JPG or PNG.");
    if (blob.size > MAX_FILE_BYTES) throw new Error(`${file.name} is too large after compression.`);
    const id = newId();
    await tx("readwrite", (store) => store.put({ id, blob, type: blob.type || file.type, name: file.name, size: blob.size, at: new Date().toISOString(), ...meta }));
    return { id, name: file.name };
  }

  async function saveFiles(files, meta) {
    const saved = [];
    for (const file of files) saved.push(await saveFile(file, meta));
    return saved;
  }

  async function getFile(id) {
    return tx("readonly", (store) => store.get(id));
  }

  async function fileUrl(id) {
    if (urlCache.has(id)) return urlCache.get(id);
    const record = await getFile(id);
    if (!record) return null;
    const url = URL.createObjectURL(record.blob);
    urlCache.set(id, url);
    return url;
  }

  async function fileDataUrl(id) {
    const record = await getFile(id);
    if (!record) return null;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ dataUrl: reader.result, type: record.type, name: record.name });
      reader.readAsDataURL(record.blob);
    });
  }

  async function usage() {
    const all = await tx("readonly", (store) => store.getAll());
    return { count: all.length, bytes: all.reduce((sum, f) => sum + (f.size || 0), 0) };
  }

  /* ---------- Viewer ---------- */

  let dialog = null;
  function viewer() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "photo-viewer";
    dialog.setAttribute("aria-label", "Photo");
    const img = document.createElement("img");
    const caption = document.createElement("p");
    caption.className = "photo-caption";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "button button-secondary";
    close.textContent = "Close";
    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
    dialog.append(img, caption, close);
    document.body.append(dialog);
    return dialog;
  }

  async function openPhoto(id, label) {
    const d = viewer();
    const url = await fileUrl(id);
    if (!url) return;
    d.querySelector("img").src = url;
    d.querySelector("img").alt = label;
    d.querySelector(".photo-caption").textContent = label;
    d.showModal();
    d.querySelector("button").focus();
  }

  const KIND_LABEL = { report: "When reported", before: "Before work", progress: "During work", after: "After work" };

  // Thumbnails for a job's photos; each opens the large view.
  function gallery(photos, jobId) {
    const wrap = document.createElement("div");
    wrap.className = "photo-gallery";
    const heading = document.createElement("p");
    heading.className = "gallery-title";
    heading.textContent = `Photos (${photos.length})`;
    const list = document.createElement("ul");
    list.className = "photo-list";
    photos.forEach((photo, index) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "photo-thumb";
      const label = `${KIND_LABEL[photo.kind] || "Photo"} – job ${jobId}${photo.by ? `, by ${photo.by}` : ""}`;
      button.setAttribute("aria-label", `Open photo ${index + 1}: ${label}`);
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      fileUrl(photo.id).then((url) => { if (url) img.src = url; else button.classList.add("is-missing"); });
      const tag = document.createElement("span");
      tag.className = "photo-tag";
      tag.textContent = KIND_LABEL[photo.kind] || "Photo";
      button.append(img, tag);
      button.addEventListener("click", () => openPhoto(photo.id, label));
      li.append(button);
      list.append(li);
    });
    wrap.append(heading, list);
    return wrap;
  }

  async function openFile(id) {
    const record = await getFile(id);
    if (!record) return;
    if (/^image\//.test(record.type)) { openPhoto(id, record.name || "Certificate"); return; }
    const url = await fileUrl(id);
    const a = document.createElement("a");
    a.href = url;
    a.download = record.name || "certificate.pdf";
    document.body.append(a);
    a.click();
    a.remove();
  }

  MH.media = { MAX_PHOTOS, checkFiles, saveFiles, saveFile, getFile, fileUrl, fileDataUrl, gallery, openPhoto, openFile, usage, KIND_LABEL };
})();

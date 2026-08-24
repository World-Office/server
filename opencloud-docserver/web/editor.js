/**
 * opencloud-docserver editor — vanilla JS, zero dependencies.
 *
 * - Loads DOCX/ODT as HTML from the server
 * - Lets the user edit in a contenteditable div
 * - Saves HTML back to the server (which converts to DOCX/ODT)
 * - Minimal toolbar via document.execCommand (deprecated but universal)
 * - Bullet/numbered lists: toolbar, Ctrl+Shift+7/8 and markdown-style
 *   auto-conversion ("- ", "* ", "1. ") all route through toggleList()
 * - Lists persist through the production path: a successful save that
 *   carries <ul>/<ol> markup fires a `lists-persisted` event and logs
 *   "LIST-PERSISTENCE: OK" for browser-level E2E to wait on
 * - Undo/redo: explicit innerHTML snapshot chain (20+ steps, survives
 *   saves), not the flaky native execCommand stack
 * - Insert image: toolbar button opens an upload dialog (local file -> data
 *   URI -> preview), then inserts a self-contained <img> at the caret
 * - Internationalized via /static/i18n.js
 */

"use strict";

(function () {
  const DOC_ID = window.__DOC_ID__ || "unknown";
  const DOC_NAME = window.__DOC_NAME__ || "document.docx";
  // The server routes conversion by extension (see _document_format in
  // src/editor/router.py); ODT files round-trip through the odfpy converter.
  const DOC_FORMAT = /\.odt$/i.test(DOC_NAME) ? "odt" : "docx";
  const READ_ONLY = window.__READ_ONLY__ === true;
  const SESSION = window.__SESSION__ || "";
  const api = (path) => `/api/documents/${encodeURIComponent(DOC_ID)}/${path}?session=${encodeURIComponent(SESSION)}`;
  // Resolve the UI language from the browser (falls back to English).
  const detectedLng = window.detectLocale ? window.detectLocale() : (navigator.language || "en");
  // New image-dialog strings are not in the i18n catalog yet (i18n.js is
  // updated separately). Seed them as English fallbacks so the data-i18n
  // markers below render real text instead of raw keys. Only missing keys
  // are filled, so real catalog entries still win once they are added.
  const IMAGE_UI_STRINGS = {
    "Toolbar.InsertImage": "Insert image",
    "Toolbar.InsertImageTitle": "Insert image",
    "Image.ChooseFile": "Image file",
    "Image.Insert": "Insert",
    "Image.Cancel": "Cancel",
    "Image.NoFile": "Choose an image file first",
    "Image.UnsupportedType": "Unsupported file type — use PNG, JPEG, GIF, BMP, WebP or SVG",
    "Image.TooLarge": "Image too large (max 10 MB)",
    "Image.ReadFailed": "Could not read the image",
  };
  function seedImageStrings(tFn) {
    const bucket = tFn && tFn.resources && tFn.resources[tFn.lng] && tFn.resources[tFn.lng].translation;
    if (!bucket) return;
    Object.keys(IMAGE_UI_STRINGS).forEach((k) => {
      if (bucket[k] === undefined) bucket[k] = IMAGE_UI_STRINGS[k];
    });
  }
  const t = (window.createI18n && window.createI18n({ lng: detectedLng })) || ((k) => k);
  seedImageStrings(t);
  // Localize static HTML (toolbar tooltips, Save label, ready status) and
  // keep the <html lang> attribute in sync for a11y & spell-check.
  if (window.applyTranslations) {
    window.applyTranslations(document, t);
  }
  const htmlEl = document.documentElement;
  if (htmlEl) htmlEl.setAttribute("lang", t.lng);
  const editor = document.getElementById("editor");
  const status = document.getElementById("status");
  const saveBtn = document.getElementById("btn-save");

  if (READ_ONLY) {
    editor.contentEditable = "false";
    saveBtn.disabled = true;
    const toolbar = document.getElementById("toolbar");
    if (toolbar) toolbar.querySelectorAll("button").forEach((b) => (b.disabled = true));
    setStatus(t("Status.ReadOnly"));
  }

  // ------------------------------------------------------------------
  // Status helpers
  // ------------------------------------------------------------------
  function setStatus(text, isError) {
    status.textContent = text;
    status.style.color = isError ? "#f87171" : "";
  }

  // ------------------------------------------------------------------
  // Load
  // ------------------------------------------------------------------
  async function loadDocument() {
    setStatus(t("Status.Loading"));
    try {
      const res = await fetch(api("html"));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "load failed");
      // Anchor: an empty/blank document still needs a block element so
      // typing produces <p>…</p> (bare text would be lost in DOCX conversion).
      editor.innerHTML = data.html || "<p><br></p>";
      // Fresh load resets the snapshot chain: the loaded state becomes the
      // baseline the Undo/Redo-Kette walks back to.
      undoStack.length = 0;
      redoStack.length = 0;
      lastSnapshot = editor.innerHTML;
      setStatus(data.blank ? t("Status.EmptyDocument") : t("Status.Ready"));
      updateUndoRedoState();
    } catch (err) {
      editor.innerHTML = "<p><em>" + t("Status.LoadFailed") + err.message + "</em></p>";
      setStatus(t("Status.LoadFailed") + err.message, true);
    }
  }

  // ------------------------------------------------------------------
  // Save
  // ------------------------------------------------------------------
  async function saveDocument() {
    if (READ_ONLY) return;
    setStatus(t("Status.Saving"));
    try {
      const res = await fetch(
        api("save"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html: editor.innerHTML }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "save failed");
      setStatus(t("Status.Saved"));
      if (DOC_FORMAT === "odt") {
        // ODT persistence round-trip confirmed by the server: the editor's
        // HTML was converted back to ODT and PUT to the WOPI host. Dispatch
        // an event (plus console marker) that browser-level E2E (Playwright)
        // waits on before verifying content.xml in the stored file.
        window.dispatchEvent(new CustomEvent("odt-persisted", {
          detail: { docId: DOC_ID, name: DOC_NAME },
        }));
        console.info("ODT-PERSISTENCE: OK", DOC_NAME);
      }
      // List persistence round-trip confirmed by the server: the saved body
      // contained bullet/numbered list markup and came back as a valid save
      // (converted + PUT to the WOPI host). Dispatch an event (plus console
      // marker) that browser-level E2E (Playwright) waits on before verifying
      // the list items in the stored document.
      if (/<([uo]l)[\s>]/i.test(editor.innerHTML)) {
        window.dispatchEvent(new CustomEvent("lists-persisted", {
          detail: { docId: DOC_ID, name: DOC_NAME },
        }));
        console.info("LIST-PERSISTENCE: OK", DOC_NAME);
      }
      // Image persistence round-trip confirmed by the server: the saved
      // body carried a self-contained <img> (data: URI) and came back as a
      // valid save (converted + PUT to the WOPI host). Dispatch an event
      // (plus console marker) that browser-level E2E (Playwright) waits on
      // before verifying the embedded picture in the stored document.
      if (/<img[\s>]/i.test(editor.innerHTML)) {
        window.dispatchEvent(new CustomEvent("images-persisted", {
          detail: { docId: DOC_ID, name: DOC_NAME },
        }));
        console.info("IMAGE-PERSISTENCE: OK", DOC_NAME);
      }
      setTimeout(() => setStatus(t("Status.Ready")), 2000);
    } catch (err) {
      setStatus(t("Status.SaveFailed") + err.message, true);
    }
  }

  // ------------------------------------------------------------------
  // Toolbar
  // ------------------------------------------------------------------
  // Toggle the bullet/numbered list at the caret. The native commands
  // both wrap the current block in a list item AND unwrap/remove a list
  // when toggled a second time, so this single path serves the toolbar
  // buttons, the Ctrl+Shift+7/8 shortcuts and the smart-list converter.
  // Lists mutate the DOM but don't always fire an `input` event
  // (notably on toggle-off), so arm autosave and snapshot the history
  // explicitly on success.
  function toggleList(command) {
    if (READ_ONLY) return false;
    editor.focus();
    const ok = document.execCommand(command, false, null);
    if (ok) {
      markDirty();
      captureHistory();
    }
    updateActiveStates();
    updateUndoRedoState();
    return ok;
  }

  function runCommand(cmd, value) {
    if (cmd === "insertUnorderedList" || cmd === "insertOrderedList") {
      toggleList(cmd);
      return;
    }
    // Undo/redo walk our explicit snapshot chain (below) instead of the
    // undocumented native execCommand stack, so the chain keeps working
    // for 20+ steps and across the list/table DOM rewrites and saves.
    if (cmd === "undo") {
      undoHistory();
      updateActiveStates();
      updateUndoRedoState();
      return;
    }
    if (cmd === "redo") {
      redoHistory();
      updateActiveStates();
      updateUndoRedoState();
      return;
    }
    editor.focus();
    document.execCommand(cmd, false, value || null);
    updateActiveStates();
    updateUndoRedoState();
  }

  // ------------------------------------------------------------------
  // Undo/redo history — explicit innerHTML snapshot chain (US-31).
  //
  // document.execCommand("undo"/"redo") relies on an undocumented,
  // browser-dependent native stack with a small capacity, and it breaks
  // after DOM rewrites (smart-list conversion, table insert, reloads).
  // So we keep our own bounded snapshot history: every user edit pushes
  // the previous DOM state, Ctrl+Z / toolbar-undo walk back through it,
  // Ctrl+Y / toolbar-redo walk forward, and a fresh edit truncates the
  // redo branch. The chain is client-side only and survives saves: an
  // explicit save never clears it, so "undo after save" restores the
  // pre-save state — the exact contract of the Undo/Redo-Kette.
  // ------------------------------------------------------------------
  const HISTORY_LIMIT = 100; // 20+ steps required; headroom for comfort
  const undoStack = [];      // states we can go BACK to (oldest first)
  const redoStack = [];      // states we can go FORWARD to (newest first)
  let lastSnapshot = null;   // DOM state the chain currently reflects

  // Capture the state we are LEAVING, then remember the new one. Call
  // after the DOM has settled (input, list toggle, table insert) so
  // multi-step native commands form a single undoable step.
  function captureHistory() {
    const html = editor.innerHTML;
    if (html === lastSnapshot) return; // nothing changed: keep the stack
    if (lastSnapshot !== null) {
      undoStack.push(lastSnapshot);
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    }
    lastSnapshot = html;
    redoStack.length = 0; // a fresh edit discards the redo branch
    updateUndoRedoState();
  }

  function restoreSnapshot(html) {
    editor.innerHTML = html;
    lastSnapshot = html;
    // Park the caret at the end so the user can keep typing right away.
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (err) {
      /* selection restore is best-effort */
    }
    markDirty();
    updateActiveStates();
    updateUndoRedoState();
  }

  function undoHistory() {
    if (READ_ONLY || undoStack.length === 0) return false;
    redoStack.push(lastSnapshot);
    lastSnapshot = undoStack.pop();
    restoreSnapshot(lastSnapshot);
    return true;
  }

  function redoHistory() {
    if (READ_ONLY || redoStack.length === 0) return false;
    undoStack.push(lastSnapshot);
    lastSnapshot = redoStack.pop();
    restoreSnapshot(lastSnapshot);
    return true;
  }

  // Grey out the toolbar buttons when the chain is exhausted (or the
  // document is read-only) instead of serving no-op clicks; the "can
  // undo/redo" state is the SIZE of our explicit stacks now, not the
  // opaque queryCommandEnabled query.
  function updateUndoRedoState() {
    const undoBtn = document.getElementById("btn-undo");
    const redoBtn = document.getElementById("btn-redo");
    if (undoBtn) undoBtn.disabled = READ_ONLY || undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = READ_ONLY || redoStack.length === 0;
  }

  function updateActiveStates() {
    document.querySelectorAll(".toolbar button[data-cmd]").forEach((btn) => {
      const cmd = btn.dataset.cmd;
      if (!cmd || cmd === "undo" || cmd === "redo") return;
      let active = false;
      try {
        active = cmd === "formatBlock"
          ? editor.querySelector("h1,h2,h3") && btn.dataset.value === currentBlockTag()
          : document.queryCommandState(cmd);
      } catch (err) {
        // A few engines throw for queryCommandState on unsupported commands;
        // treat those as inactive instead of aborting the whole loop.
        active = false;
      }
      btn.classList.toggle("active", !!active);
    });
  }

  function currentBlockTag() {
    let node = window.getSelection().anchorNode;
    while (node && node !== editor) {
      if (node.nodeType === 1 && /^H[1-6]$/.test(node.tagName)) {
        return node.tagName;
      }
      node = node.parentNode;
    }
    return "P";
  }

  // ------------------------------------------------------------------
  // Insert-table dialog
  // ------------------------------------------------------------------
  // The toolbar's table button opens a small modal asking for row/column
  // counts, then inserts a real <table> at the saved cursor position.
  // The selection is captured before the dialog steals focus and restored
  // on confirm, so the table lands exactly where the user opened it.
  let tableSelRange = null;

  function insertTable() {
    if (READ_ONLY) return;
    const dialog = document.getElementById("table-dialog");
    const rowsInput = document.getElementById("table-rows");
    const colsInput = document.getElementById("table-cols");
    if (!dialog || !rowsInput || !colsInput) return;
    rowsInput.value = "2";
    colsInput.value = "3";
    saveTableSelection();
    dialog.classList.add("open");
    colsInput.focus();
  }

  function saveTableSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
      tableSelRange = sel.getRangeAt(0).cloneRange();
    } else {
      tableSelRange = null;
    }
  }

  function restoreTableSelection() {
    if (!tableSelRange) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(tableSelRange);
    tableSelRange = null;
  }

  function clampInt(raw, min, max, fallback) {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(Math.max(n, min), max);
  }

  function confirmTableDialog() {
    const rows = clampInt(document.getElementById("table-rows").value, 1, 20, 2);
    const cols = clampInt(document.getElementById("table-cols").value, 1, 10, 3);
    closeTableDialog();
    restoreTableSelection();
    editor.focus();
    const cell = "<td><br></td>";
    const row = "<tr>" + cell.repeat(cols) + "</tr>";
    // insertHTML fires an `input` event, which arms autosave and captures
    // history (see the input listener below); captureHistory() here is
    // belt-and-braces — the html === lastSnapshot guard makes it a no-op
    // when the input event already ran, and the fallback covers engines
    // that skip the event.
    document.execCommand("insertHTML", false, "<table>" + row.repeat(rows) + "</table>");
    captureHistory();
  }

  function closeTableDialog() {
    const dialog = document.getElementById("table-dialog");
    if (dialog) dialog.classList.remove("open");
    tableSelRange = null;
    editor.focus();
  }

  // ------------------------------------------------------------------
  // Insert-image dialog
  // ------------------------------------------------------------------
  // The toolbar's image button opens a small modal asking for a local image
  // file. The file is read into a self-contained data: URI (nothing is
  // uploaded yet — the browser keeps it), previewed, and inserted as an
  // <img> at the saved cursor position on confirm. The server's sanitizer
  // allows data:image/ URIs and the ODT converter embeds the binary into
  // the stored document, so the picture persists across save/reload.
  // The selection is captured before the dialog steals focus and restored
  // on confirm, exactly like the table dialog.
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB data-URI budget
  const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/bmp", "image/webp", "image/svg+xml"];
  let imageSelRange = null;
  let imageDataUrl = null;

  function insertImage() {
    if (READ_ONLY) return;
    const dialog = document.getElementById("image-dialog");
    const fileInput = document.getElementById("image-file");
    const okBtn = document.getElementById("btn-image-ok");
    const previewWrap = document.getElementById("image-preview-wrap");
    const errEl = document.getElementById("image-error");
    if (!dialog) return;
    saveImageSelection();
    imageDataUrl = null;
    if (fileInput) fileInput.value = "";
    if (okBtn) okBtn.disabled = true;
    if (previewWrap) previewWrap.hidden = true;
    if (errEl) errEl.textContent = "";
    dialog.classList.add("open");
    if (fileInput) fileInput.focus();
  }

  function saveImageSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
      imageSelRange = sel.getRangeAt(0).cloneRange();
    } else {
      imageSelRange = null;
    }
  }

  function restoreImageSelection() {
    if (!imageSelRange) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(imageSelRange);
    imageSelRange = null;
  }

  function escapeAttr(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Read the picked file into a data: URI, validate it (type + size), show
  // a preview and arm the Insert button. Runs on every file-input change.
  function onImageFileChange() {
    const fileInput = document.getElementById("image-file");
    const okBtn = document.getElementById("btn-image-ok");
    const errEl = document.getElementById("image-error");
    const previewWrap = document.getElementById("image-preview-wrap");
    const preview = document.getElementById("image-preview");
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (okBtn) okBtn.disabled = true;
    if (previewWrap) previewWrap.hidden = true;
    if (errEl) errEl.textContent = "";
    if (!file) {
      imageDataUrl = null;
      if (errEl) errEl.textContent = t("Image.NoFile");
      return;
    }
    if (IMAGE_TYPES.indexOf(file.type) === -1) {
      imageDataUrl = null;
      if (errEl) errEl.textContent = t("Image.UnsupportedType");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      imageDataUrl = null;
      if (errEl) errEl.textContent = t("Image.TooLarge");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      imageDataUrl = String(reader.result || "");
      if (preview) {
        preview.src = imageDataUrl;
        preview.alt = escapeAttr(file.name);
      }
      if (previewWrap) previewWrap.hidden = false;
      if (errEl) errEl.textContent = "";
      if (okBtn) okBtn.disabled = false;
    };
    reader.onerror = () => {
      imageDataUrl = null;
      if (errEl) errEl.textContent = t("Image.ReadFailed");
    };
    reader.readAsDataURL(file);
  }

  // Insert the previewed image at the saved caret. insertHTML fires an
  // `input` event (arming autosave + capturing history); captureHistory()
  // here is belt-and-braces, exactly like the table insertion — the
  // html === lastSnapshot guard makes it a no-op when the event already
  // ran.
  function confirmImageDialog() {
    if (!imageDataUrl) return;
    const fileInput = document.getElementById("image-file");
    const file = fileInput && fileInput.files && fileInput.files[0];
    const alt = file ? escapeAttr(file.name) : "image";
    const src = imageDataUrl; // capture before closeImageDialog() clears it
    closeImageDialog();
    restoreImageSelection();
    editor.focus();
    document.execCommand(
      "insertHTML",
      false,
      '<img src="' + src + '" alt="' + alt + '">'
    );
    captureHistory();
  }

  function closeImageDialog() {
    const dialog = document.getElementById("image-dialog");
    if (dialog) dialog.classList.remove("open");
    imageSelRange = null;
    imageDataUrl = null;
    editor.focus();
  }

  document.querySelectorAll(".toolbar button[data-cmd]").forEach((btn) => {
    btn.addEventListener("click", () => runCommand(btn.dataset.cmd, btn.dataset.value));
  });
  document.getElementById("btn-table").addEventListener("click", insertTable);
  document.getElementById("btn-image").addEventListener("click", insertImage);
  saveBtn.addEventListener("click", saveDocument);

  // Insert-image dialog controls
  const imageFile = document.getElementById("image-file");
  const btnImageOk = document.getElementById("btn-image-ok");
  const btnImageCancel = document.getElementById("btn-image-cancel");
  if (imageFile) imageFile.addEventListener("change", onImageFileChange);
  if (btnImageOk) btnImageOk.addEventListener("click", confirmImageDialog);
  if (btnImageCancel) btnImageCancel.addEventListener("click", closeImageDialog);

  // Insert-table dialog controls
  const btnTableOk = document.getElementById("btn-table-ok");
  const btnTableCancel = document.getElementById("btn-table-cancel");
  if (btnTableOk) btnTableOk.addEventListener("click", confirmTableDialog);
  if (btnTableCancel) btnTableCancel.addEventListener("click", closeTableDialog);
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    const tableDialog = document.getElementById("table-dialog");
    if (tableDialog && tableDialog.classList.contains("open")) {
      closeTableDialog();
      return;
    }
    const imageDialog = document.getElementById("image-dialog");
    if (imageDialog && imageDialog.classList.contains("open")) closeImageDialog();
  }, true);

  // ------------------------------------------------------------------
  // Keyboard shortcuts
  // ------------------------------------------------------------------
  editor.addEventListener("keydown", (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey) {
      const k = ev.key.toLowerCase();
      if (k === "s") {
        ev.preventDefault();
        saveDocument();
        return;
      }
      // Undo: Ctrl+Z. Redo: Ctrl+Y (Windows/Linux) or Ctrl+Shift+Z (macOS).
      // Routed through runCommand() so button states and the dirty/autosave
      // status stay consistent with the toolbar.
      if (k === "z") {
        ev.preventDefault();
        runCommand(ev.shiftKey ? "redo" : "undo");
        return;
      }
      if (k === "y") {
        ev.preventDefault();
        runCommand("redo");
        return;
      }
      // Lists: Ctrl+Shift+7 = ordered, Ctrl+Shift+8 = bulleted
      // (Google Docs / LibreOffice convention). Match on ev.code so the
      // digits resolve independently of keyboard layout, where Shift+digit
      // would report a symbol in ev.key instead of the numeral.
      if (ev.shiftKey && (ev.code === "Digit7" || ev.code === "Digit8")) {
        ev.preventDefault();
        runCommand(ev.code === "Digit8" ? "insertUnorderedList" : "insertOrderedList");
        return;
      }
      if (k === "b" || k === "i" || k === "u") ev.preventDefault();
    }
  });

  // ------------------------------------------------------------------
  // Smart lists: convert markdown-style markers typed at the start of a
  // paragraph ("- ", "* " or "1. "/"1) ") into a real list. Runs after
  // the input event that appends the trailing space, rewinds to before the
  // marker and lets the native list command do the wrapping, so the whole
  // conversion is a single undoable step.
  // ------------------------------------------------------------------
  function autoConvertListMarker() {
    if (READ_ONLY) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;
    const textNode = sel.anchorNode;
    // Only respond when the caret sits in a plain text node (typing, not
    // caret navigation with a node-level selection).
    if (!textNode || textNode.nodeType !== 3) return;
    const block = textNode.parentNode;
    if (!block || block.nodeType !== 1 || block.tagName !== "P") return;
    // The marker must be the very first thing in the paragraph and the
    // paragraph must be a free-standing body block (not inside a list or
    // table cell, where the native list commands misbehave).
    if (textNode !== block.firstChild) return;
    if (block.closest("ul,ol,td,th")) return;
    const text = textNode.textContent || "";
    let command = null;
    let marker = null;
    if (/^[-*]\s$/.test(text)) {
      command = "insertUnorderedList";
      marker = text;
    } else {
      const m = /^(\d+)[.)]\s$/.exec(text);
      if (m) {
        command = "insertOrderedList";
        marker = m[0];
      }
    }
    if (!command) return;
    // Rewind to before the marker, delete it and collapse the caret at the
    // start of the (now empty) paragraph before the list command runs.
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, marker.length);
    range.deleteContents();
    const caretRange = document.createRange();
    caretRange.setStart(block, 0);
    caretRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caretRange);
    toggleList(command);
  }

  document.addEventListener("selectionchange", updateActiveStates);

  // ------------------------------------------------------------------
  // Autosave every 30 s of inactivity
  // ------------------------------------------------------------------
  let saveTimer = null;
  function markDirty() {
    setStatus(t("Status.Unsaved"));
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDocument, 30000);
  }
  editor.addEventListener("input", () => {
    markDirty();
    autoConvertListMarker();
    // Snapshot AFTER the DOM settled so the whole smart-list conversion
    // (marker + native wrap) lands as a single undoable step.
    captureHistory();
    updateUndoRedoState();
  });

  // Release the WOPI lock on the remote host when the editor is closed
  // (client mode). Best effort: sendBeacon survives navigation/unload.
  window.addEventListener("beforeunload", () => {
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(api("unlock"), "");
    }
  });

  loadDocument();
})();

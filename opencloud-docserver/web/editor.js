/**
 * opencloud-docserver editor — vanilla JS, zero dependencies.
 *
 * - Loads DOCX as HTML from the server
 * - Lets the user edit in a contenteditable div
 * - Saves HTML back to the server (which converts to DOCX)
 * - Minimal toolbar via document.execCommand (deprecated but universal)
 * - Internationalized via /static/i18n.js
 */

"use strict";

(function () {
  const DOC_ID = window.__DOC_ID__ || "unknown";
  const DOC_NAME = window.__DOC_NAME__ || "document.docx";
  const READ_ONLY = window.__READ_ONLY__ === true;
  const SESSION = window.__SESSION__ || "";
  const api = (path) => `/api/documents/${encodeURIComponent(DOC_ID)}/${path}?session=${encodeURIComponent(SESSION)}`;
  // Resolve the UI language from the browser (falls back to English).
  const detectedLng = window.detectLocale ? window.detectLocale() : (navigator.language || "en");
  const t = (window.createI18n && window.createI18n({ lng: detectedLng })) || ((k) => k);
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
      setStatus(data.blank ? t("Status.EmptyDocument") : t("Status.Ready"));
      // Fresh load resets the native undo stack: reflect that in the toolbar.
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
      setTimeout(() => setStatus(t("Status.Ready")), 2000);
    } catch (err) {
      setStatus(t("Status.SaveFailed") + err.message, true);
    }
  }

  // ------------------------------------------------------------------
  // Toolbar
  // ------------------------------------------------------------------
  function runCommand(cmd, value) {
    editor.focus();
    const ok = document.execCommand(cmd, false, value || null);
    // Undo/redo mutate the document without always firing an `input` event,
    // so mark the doc dirty explicitly to keep autosave armed and the
    // status bar accurate.
    if ((cmd === "undo" || cmd === "redo") && ok) markDirty();
    updateActiveStates();
    updateUndoRedoState();
  }

  // The legacy execCommand undo stack can be queried via queryCommandEnabled;
  // use it to grey out the toolbar buttons when there is nothing to undo or
  // redo (fresh document, or stack exhausted), instead of no-op clicks.
  function updateUndoRedoState() {
    if (typeof document.queryCommandEnabled !== "function") return;
    const undoBtn = document.getElementById("btn-undo");
    const redoBtn = document.getElementById("btn-redo");
    if (undoBtn) undoBtn.disabled = READ_ONLY || !document.queryCommandEnabled("undo");
    if (redoBtn) redoBtn.disabled = READ_ONLY || !document.queryCommandEnabled("redo");
  }

  function updateActiveStates() {
    document.querySelectorAll(".toolbar button[data-cmd]").forEach((btn) => {
      const cmd = btn.dataset.cmd;
      if (!cmd || cmd === "undo" || cmd === "redo") return;
      const active = cmd === "formatBlock"
        ? editor.querySelector("h1,h2,h3") && btn.dataset.value === currentBlockTag()
        : document.queryCommandState(cmd);
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

  function insertTable() {
    const cols = prompt(t("Prompt.TableColumns"), "3");
    const rows = prompt(t("Prompt.TableRows"), "2");
    if (!cols || !rows) return;
    const c = Math.min(parseInt(cols, 10) || 3, 10);
    const r = Math.min(parseInt(rows, 10) || 2, 20);
    const cell = "<td><br></td>";
    const row = "<tr>" + cell.repeat(c) + "</tr>";
    editor.focus();
    document.execCommand("insertHTML", false, "<table>" + row.repeat(r) + "</table>");
  }

  document.querySelectorAll(".toolbar button[data-cmd]").forEach((btn) => {
    btn.addEventListener("click", () => runCommand(btn.dataset.cmd, btn.dataset.value));
  });
  document.getElementById("btn-table").addEventListener("click", insertTable);
  saveBtn.addEventListener("click", saveDocument);

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
      if (k === "b" || k === "i" || k === "u") ev.preventDefault();
    }
  });

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

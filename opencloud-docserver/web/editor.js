/**
 * opencloud-docserver editor — vanilla JS, zero dependencies.
 *
 * - Loads DOCX as HTML from the server
 * - Lets the user edit in a contenteditable div
 * - Saves HTML back to the server (which converts to DOCX)
 * - Minimal toolbar via document.execCommand (deprecated but universal)
 * - Bullet/numbered lists: toolbar, Ctrl+Shift+7/8 and markdown-style
 *   auto-conversion ("- ", "* ", "1. ") all route through toggleList()
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
  // Toggle the bullet/numbered list at the caret. The native commands
  // both wrap the current block in a list item AND unwrap/remove a list
  // when toggled a second time, so this single path serves the toolbar
  // buttons, the Ctrl+Shift+7/8 shortcuts and the smart-list converter.
  // Lists mutate the DOM but don't always fire an `input` event
  // (notably on toggle-off), so arm autosave explicitly on success.
  function toggleList(command) {
    if (READ_ONLY) return false;
    editor.focus();
    const ok = document.execCommand(command, false, null);
    if (ok) markDirty();
    updateActiveStates();
    updateUndoRedoState();
    return ok;
  }

  function runCommand(cmd, value) {
    if (cmd === "insertUnorderedList" || cmd === "insertOrderedList") {
      toggleList(cmd);
      return;
    }
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

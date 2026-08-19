/**
 * opencloud-docserver editor — vanilla JS, zero dependencies.
 *
 * - Loads DOCX as HTML from the server
 * - Lets the user edit in a contenteditable div
 * - Saves HTML back to the server (which converts to DOCX)
 * - Minimal toolbar via document.execCommand (deprecated but universal)
 */

"use strict";

(function () {
  const DOC_ID = window.__DOC_ID__ || "unknown";
  const DOC_NAME = window.__DOC_NAME__ || "document.docx";
  const editor = document.getElementById("editor");
  const status = document.getElementById("status");
  const saveBtn = document.getElementById("btn-save");

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
    setStatus("Loading…");
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(DOC_ID)}/html`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "load failed");
      editor.innerHTML = data.html;
      setStatus("Ready");
    } catch (err) {
      editor.innerHTML = "<p><em>Could not load document.</em></p>";
      setStatus("Load failed: " + err.message, true);
    }
  }

  // ------------------------------------------------------------------
  // Save
  // ------------------------------------------------------------------
  async function saveDocument() {
    setStatus("Saving…");
    try {
      const res = await fetch(
        `/api/documents/${encodeURIComponent(DOC_ID)}/save`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html: editor.innerHTML }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "save failed");
      setStatus("Saved ✓");
      setTimeout(() => setStatus("Ready"), 2000);
    } catch (err) {
      setStatus("Save failed: " + err.message, true);
    }
  }

  // ------------------------------------------------------------------
  // Toolbar
  // ------------------------------------------------------------------
  function runCommand(cmd, value) {
    editor.focus();
    document.execCommand(cmd, false, value || null);
    updateActiveStates();
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
    const cols = prompt("Columns:", "3");
    const rows = prompt("Rows:", "2");
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
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey) {
      const k = ev.key.toLowerCase();
      if (k === "s") {
        ev.preventDefault();
        saveDocument();
      }
      if (k === "b") ev.preventDefault();
      if (k === "i") ev.preventDefault();
      if (k === "u") ev.preventDefault();
    }
  });

  document.addEventListener("selectionchange", updateActiveStates);

  // ------------------------------------------------------------------
  // Autosave every 30 s of inactivity
  // ------------------------------------------------------------------
  let saveTimer = null;
  editor.addEventListener("input", () => {
    setStatus("Unsaved changes…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDocument, 30000);
  });

  loadDocument();
})();

/**
 * WO-3-text-fromfile: divergent-behavior (insert tab, interact)
 * OnlyOffice parity (slugs:text-fromfile).
 *
 * Verifies that the 'Text from File' button opens a file selection modal
 * with options for insertion, not just a direct insertion.
 *
 * Node.js built-in test runner (node:assert, zero dependencies).
 * Run with: node text-fromfile.test.mjs
 * Success: prints "text-fromfile-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-3 text-fromfile tests...\n")

// ── Dialog HTML in index.html ───────────────────────────────────────

// The dialog overlay must exist
assert.ok(
  htmlSrc.includes('id="textfromfile-dialog"'),
  "textfromfile-dialog must exist in index.html",
)

// The dialog must have proper structure (dialog-overlay, aria-modal, etc.)
assert.ok(
  htmlSrc.includes('id="textfromfile-dialog" class="dialog-overlay"'),
  "textfromfile-dialog must have dialog-overlay class",
)

assert.ok(
  htmlSrc.includes('aria-labelledby="textfromfile-dialog-title"'),
  "textfromfile-dialog must have aria-labelledby",
)

// The dialog must have a title element
assert.ok(
  htmlSrc.includes('id="textfromfile-dialog-title"'),
  "textfromfile-dialog-title must exist in index.html",
)

// The dialog must have a file input
assert.ok(
  htmlSrc.includes('id="textfromfile-input"'),
  "textfromfile-input must exist in index.html",
)

// File input must accept the right file types
assert.ok(
  htmlSrc.includes('accept=".txt,.md,.html,.htm,.csv,.docx"'),
  "textfromfile-input must accept .txt,.md,.html,.htm,.csv,.docx",
)

// The dialog must have insertion mode select
assert.ok(
  htmlSrc.includes('id="textfromfile-mode"'),
  "textfromfile-mode select must exist in index.html",
)

// The dialog must have format select
assert.ok(
  htmlSrc.includes('id="textfromfile-format"'),
  "textfromfile-format select must exist in index.html",
)

// The dialog must have Insert button
assert.ok(
  htmlSrc.includes('id="btn-textfromfile-insert"'),
  "btn-textfromfile-insert button must exist in index.html",
)

// The dialog must have Cancel button
assert.ok(
  htmlSrc.includes('id="btn-textfromfile-cancel"'),
  "btn-textfromfile-cancel button must exist in index.html",
)

// The dialog must have proper i18n data attributes
assert.ok(
  htmlSrc.includes('data-i18n="Dialog.TextFromFileTitle"'),
  "dialog title must have i18n data attribute",
)

assert.ok(
  htmlSrc.includes('data-i18n="Dialog.ChooseFile"'),
  "file input label must have i18n data attribute",
)

assert.ok(
  htmlSrc.includes('data-i18n="Dialog.InsertFile"'),
  "insert button must have i18n data attribute",
)

// ── i18n strings ─────────────────────────────────────────────────────

// English strings must exist
assert.ok(
  i18nSrc.includes('"Dialog.TextFromFileTitle": "Insert text from file"'),
  "English Dialog.TextFromFileTitle must exist",
)

assert.ok(
  i18nSrc.includes('"Dialog.ChooseFile": "Choose file…"'),
  "English Dialog.ChooseFile must exist",
)

assert.ok(
  i18nSrc.includes('"Dialog.InsertMode.Insert": "Insert"'),
  "English Dialog.InsertMode.Insert must exist",
)

assert.ok(
  i18nSrc.includes('"Dialog.InsertMode.Replace": "Replace selection"'),
  "English Dialog.InsertMode.Replace must exist",
)

assert.ok(
  i18nSrc.includes('"Dialog.FormatMode.PlainText": "Plain text"'),
  "English Dialog.FormatMode.PlainText must exist",
)

assert.ok(
  i18nSrc.includes('"Dialog.FormatMode.HTML": "Keep formatting (HTML)"'),
  "English Dialog.FormatMode.HTML must exist",
)

assert.ok(i18nSrc.includes('"Dialog.InsertFile": "Insert"'), "English Dialog.InsertFile must exist")

// German translations must exist
assert.ok(
  i18nSrc.includes('"Dialog.TextFromFileTitle": "Text aus Datei einfügen"'),
  "German Dialog.TextFromFileTitle must exist",
)

assert.ok(
  i18nSrc.includes('"Dialog.ChooseFile": "Datei auswählen…"'),
  "German Dialog.ChooseFile must exist",
)

assert.ok(
  i18nSrc.includes('"Dialog.InsertMode.Insert": "Einfügen"'),
  "German Dialog.InsertMode.Insert must exist",
)

assert.ok(
  i18nSrc.includes('"Dialog.InsertMode.Replace": "Auswahl ersetzen"'),
  "German Dialog.InsertMode.Replace must exist",
)

console.log("All WO-3 text-fromfile HTML and i18n tests passed!\n")

// ── editor.js wiring ─────────────────────────────────────────────────

// The btn-textfile click handler must open the dialog, not directly click file input
assert.ok(
  editorSrc.includes('btnTextFile.addEventListener("click", () => openDlg("textfromfile-dialog"))'),
  "btn-textfile must open textfromfile-dialog via openDlg",
)

// The dialog must have JavaScript handlers
assert.ok(
  editorSrc.includes("textFromFileDlg"),
  "textFromFileDlg element reference must exist in editor.js",
)

assert.ok(
  editorSrc.includes("textFromFileInput"),
  "textFromFileInput element reference must exist in editor.js",
)

assert.ok(
  editorSrc.includes("btnTextFromFileInsert"),
  "btnTextFromFileInsert element reference must exist in editor.js",
)

assert.ok(
  editorSrc.includes("btnTextFromFileCancel"),
  "btnTextFromFileCancel element reference must exist in editor.js",
)

// The insert button must have a click handler
assert.ok(
  editorSrc.includes("btnTextFromFileInsert.addEventListener"),
  "btnTextFromFileInsert must have click handler",
)

// The cancel button must have a click handler
assert.ok(
  editorSrc.includes("btnTextFromFileCancel.addEventListener"),
  "btnTextFromFileCancel must have click handler",
)

// The insert handler must support different modes (insert/replace)
assert.ok(
  editorSrc.includes("textFromFileMode"),
  "textFromFileMode element reference must exist in editor.js",
)

// The insert handler must support different formats (plain/HTML)
assert.ok(
  editorSrc.includes("textFromFileFormat"),
  "textFromFileFormat element reference must exist in editor.js",
)

// The insert handler must process files (check for .docx handling)
assert.ok(
  editorSrc.includes('ext === "docx"') || editorSrc.includes("ext === 'docx'"),
  "insert handler must handle .docx files",
)

// The insert handler must respect format option for HTML files
assert.ok(
  editorSrc.includes('format === "plain"') || editorSrc.includes("format === 'plain'"),
  "insert handler must respect plain text format option",
)

console.log("All WO-3 text-fromfile editor.js tests passed!\n")
console.log("text-fromfile-PASS")

/**
 * WO-2-mailmerge: Mail Merge multi-step wizard
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the Mail Merge button opens a modal dialog/wizard for
 * configuring mail merge, including data source selection and field mapping.
 *
 * Run with: node mailmerge.test.mjs
 * Success: prints "mailmerge-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-2-mailmerge tests...\n")

// ── Editor: mailMerge command must open the dialog, not just file picker ──

// The mailMerge command handler must exist in editor.js
assert.ok(
  editorSrc.includes('cmd === "mailMerge"'),
  "mailMerge command handler must exist in editor.js",
)

// The mailMerge command must open the mailmerge-dialog (wizard), not just click file input
// It should close menus and open the dialog
const mailMergeHandlerMatch = editorSrc.match(/if \(cmd === "mailMerge"\)\s*\{[^}]+\}/s)
assert.ok(
  mailMergeHandlerMatch?.[0].includes('openDlg("mailmerge-dialog")') ||
    mailMergeHandlerMatch?.[0].includes('openOverlayDialog("mailmerge-dialog")'),
  "mailMerge command handler must open mailmerge-dialog (not just click file input)",
)

// ── HTML: mailmerge-dialog must exist as a modal dialog ──

assert.ok(htmlSrc.includes('id="mailmerge-dialog"'), "mailmerge-dialog must exist in index.html")

assert.ok(
  htmlSrc.includes('class="dialog-overlay"') &&
    htmlSrc.match(/id="mailmerge-dialog".*class="[^"]*dialog-overlay[^"]*"/s),
  "mailmerge-dialog must be a dialog-overlay (modal)",
)

// ── HTML: dialog must have data source selection (CSV file input) ──

assert.ok(
  htmlSrc.includes('id="mailmerge-csv"'),
  "mailmerge-csv file input must exist in index.html",
)

assert.ok(
  htmlSrc.includes('accept=".csv') || htmlSrc.includes('accept="text/csv'),
  "mailmerge-csv input must accept CSV files",
)

// ── HTML: dialog must have field mapping selection ──

assert.ok(
  htmlSrc.includes('id="mailmerge-fields"'),
  "mailmerge-fields select must exist in index.html",
)

// ── HTML: collaboration tab must have Mail Merge button ──

assert.ok(
  htmlSrc.includes('data-cmd="mailMerge"'),
  'Collaboration tab must have Mail Merge button with data-cmd="mailMerge"',
)

// ── HTML: Insert menu must have Mail Merge button (btn-mailmerge) ──

assert.ok(htmlSrc.includes('id="btn-mailmerge"'), "Insert menu must have btn-mailmerge button")

// ── Editor: mailmerge dialog must handle CSV file selection ──

assert.ok(
  editorSrc.includes("mailmerge-csv") && editorSrc.includes("change"),
  "mailmerge-csv must have change event handler",
)

// ── Editor: mailmerge dialog must handle field insertion ──

assert.ok(
  editorSrc.includes("btn-mailmerge-field") && editorSrc.includes("insertText"),
  "btn-mailmerge-field must insert merge field markers into document",
)

// ── Editor: mailmerge dialog must handle preview ──

assert.ok(
  editorSrc.includes("btn-mailmerge-preview"),
  "btn-mailmerge-preview must exist in editor.js",
)

// ── Editor: btn-mailmerge in Insert menu should also open dialog ──

// The Insert menu button should trigger the dialog, not just file picker
assert.ok(
  editorSrc.includes("btn-mailmerge") &&
    (editorSrc.includes('openDlg("mailmerge-dialog")') ||
      editorSrc.includes('openOverlayDialog("mailmerge-dialog")')),
  "Insert menu btn-mailmerge should open mailmerge-dialog",
)

// ── i18n: must have Mail Merge strings ──

assert.ok(
  i18nSrc.includes('"Collab.MailMerge"') || i18nSrc.includes("'Collab.MailMerge'"),
  "i18n must have Collab.MailMerge string",
)

assert.ok(
  i18nSrc.includes('"Backstage.MailMerge"') || i18nSrc.includes("'Backstage.MailMerge'"),
  "i18n must have Backstage.MailMerge string",
)

console.log("All WO-2-mailmerge tests passed!\n")
console.log("mailmerge-PASS")

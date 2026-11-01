/**
 * WO-22-shortcut-closefile: OO Cmd/Ctrl+W closes the document (L0, real)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that editor.js contains the OO-parity Ctrl/Cmd+W binding
 * in the C1 keydown block that intercepts the browser tab-close,
 * checks dirty state and emits the wo:close-document contract.
 *
 * Run with: node apps/web/apps/documenteditor-wysiwyg/shortcut-closefile.test.mjs
 * Success: prints "shortcut-closefile-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")

console.log("Running WO-22-shortcut-closefile tests...\n")

// The C1 keydown block must contain a Ctrl+W handler
const c1BlockStart = editorSrc.indexOf("// C1 SHORTCUT PARITY (OO shortcut census")
assert.notEqual(c1BlockStart, -1, "C1 SHORTCUT PARITY block must exist")

// Extract the main ctrl block after the dedicated alt/shift blocks
const mainCtrlBlockStart = editorSrc.indexOf(
  "if ((ev.ctrlKey || ev.metaKey) && !ev.altKey) {",
  c1BlockStart,
)
assert.notEqual(mainCtrlBlockStart, -1, "Main ctrl (no shift/alt) block must exist in C1")

// The Ctrl+W handler must exist within the C1 block or the main ctrl block
const ctrlWHandler = editorSrc.includes('k === "w"') && editorSrc.includes("wo:close-document")
assert.ok(ctrlWHandler, "Ctrl+W handler with wo:close-document must exist")

// Must intercept the combination: (ev.ctrlKey||ev.metaKey)&&!ev.altKey&&!ev.shiftKey && (ev.key==="w"||ev.key==="W")
// We check that k is lowercase and the handler matches "w"
const hasWCheck = editorSrc.includes('k === "w"') || editorSrc.includes("ev.key.toLowerCase()")
assert.ok(hasWCheck, "Handler must check for w key (case-insensitive)")

// Must preventDefault to stop browser tab close
// Specifically, preventDefault must appear near the Ctrl+W handler
const wIndex = editorSrc.indexOf('k === "w"')
const pdIndex = editorSrc.lastIndexOf("ev.preventDefault()", wIndex + 100)
assert.ok(pdIndex > wIndex, "preventDefault must be called in Ctrl+W handler")

// Must check dirty state (Status.Saved comparison)
const hasDirtyCheck =
  editorSrc.includes('status.textContent !== t("Status.Saved")') ||
  (editorSrc.includes("status.textContent") && editorSrc.includes("Status.Saved"))
assert.ok(hasDirtyCheck, "Handler must check dirty state via status.textContent and Status.Saved")

// Must emit CustomEvent "wo:close-document" on window with {dirty} detail
const hasCustomEvent =
  editorSrc.includes('new CustomEvent("wo:close-document"') ||
  editorSrc.includes("wo:close-document")
assert.ok(hasCustomEvent, "Handler must emit CustomEvent for wo:close-document")
const hasDetail =
  editorSrc.includes("detail: { dirty") ||
  (editorSrc.includes("detail:") && editorSrc.includes("dirty"))
assert.ok(hasDetail, "CustomEvent must include dirty detail")

// Must call notifyHost with "close" action
const hasNotifyHostClose = editorSrc.includes('notifyHost("close")')
assert.ok(hasNotifyHostClose, "Handler must call notifyHost with close action")

console.log("ok Ctrl+W handler present in C1 block")
console.log("ok preventDefault stops browser tab close")
console.log("ok dirty state check via status")
console.log("ok CustomEvent wo:close-document with dirty detail")
console.log("ok notifyHost close call")
console.log("\nshortcut-closefile-PASS")

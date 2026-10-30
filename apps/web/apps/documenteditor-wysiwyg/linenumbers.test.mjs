/**
 * WO-3-linenumbers: Line Numbers modal dialog
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the Line Numbers command opens a modal dialog with
 * options for line numbering (continuous, restart each page, suppression).
 *
 * Run with: node linenumbers.test.mjs
 * Success: prints "linenumbers-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")

console.log("Running WO-3-linenumbers tests...\n")

// The toggleLineNumbers command must be wired to openLineNumbersDialog
assert.ok(
  editorSrc.includes('cmd === "toggleLineNumbers"') &&
    editorSrc.includes("openLineNumbersDialog()"),
  "toggleLineNumbers command must call openLineNumbersDialog",
)

// The openLineNumbersDialog function must exist
assert.ok(
  editorSrc.includes("function openLineNumbersDialog()"),
  "openLineNumbersDialog function must exist",
)

// The dialog overlay must exist in HTML
assert.ok(htmlSrc.includes('id="linenumbers-dialog"'), "linenumbers-dialog must exist in HTML")

// The dialog must have a title
assert.ok(
  htmlSrc.includes('id="linenumbers-dialog-title"') && htmlSrc.includes("Line Numbers"),
  "Line Numbers dialog must have a title",
)

// The dialog must have a select for line number mode
assert.ok(htmlSrc.includes('id="ln-mode"'), "Line Numbers dialog must have ln-mode select")

// The dialog must have options for: none, continuous, restart each page, restart each section
assert.ok(
  htmlSrc.includes('value="none"') &&
    htmlSrc.includes("No line numbers") &&
    htmlSrc.includes('value="continuous"') &&
    htmlSrc.includes("Continuous") &&
    htmlSrc.includes('value="restart-each-page"') &&
    htmlSrc.includes("Restart each page") &&
    htmlSrc.includes('value="restart-each-section"') &&
    htmlSrc.includes("Restart each section"),
  "Line Numbers dialog must have all required options",
)

// The dialog must have OK and Cancel buttons
assert.ok(
  htmlSrc.includes('id="btn-linenumbers-ok"') && htmlSrc.includes('id="btn-linenumbers-close"'),
  "Line Numbers dialog must have OK and Cancel buttons",
)

// The confirmLineNumbersDialog function must exist
assert.ok(
  editorSrc.includes("function confirmLineNumbersDialog()"),
  "confirmLineNumbersDialog function must exist",
)

// The confirm function must handle the different modes
assert.ok(
  editorSrc.includes('mode === "none"') &&
    editorSrc.includes('mode === "continuous"') &&
    editorSrc.includes('mode === "restart-each-section"'),
  "confirmLineNumbersDialog must handle all modes",
)

// The dialog must be wired in ROUND2
assert.ok(
  editorSrc.includes('["linenumbers", confirmLineNumbersDialog]'),
  "Line Numbers dialog must be wired in ROUND2",
)

// The toolbar button must exist
assert.ok(
  htmlSrc.includes('data-cmd="toggleLineNumbers"'),
  "Toggle Line Numbers button must exist in toolbar",
)

console.log("linenumbers-PASS")

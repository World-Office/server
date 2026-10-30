/**
 * WO-3-dropcap: divergent-behavior (insert tab, interact) — OnlyOffice parity
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the "DropCap" command (toggleDropcap) opens a modal dialog
 * with options for drop cap styling (position, lines to drop, distance from text)
 * rather than performing a direct toggle.
 *
 * Run with: node dropcap.test.mjs
 * Success: prints "DROPCAP-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")

console.log("Running WO-3-dropcap tests...\n")

// -- Command wiring: toggleDropcap must open the dialog --

// The dropcap button must exist with data-cmd="toggleDropcap"
assert.ok(
  htmlSrc.includes('data-cmd="toggleDropcap"'),
  "toggleDropcap button must exist in index.html",
)

// The dropcap i18n key must exist
assert.ok(
  htmlSrc.includes('data-i18n="Insert.DropCap"'),
  "Insert.DropCap i18n key must be used in index.html",
)

// The command handler must route toggleDropcap to openDropcapDialog
assert.ok(
  editorSrc.includes('cmd === "toggleDropcap"') && editorSrc.includes("openDropcapDialog()"),
  "toggleDropcap command must call openDropcapDialog in editor.js",
)

// The openDropcapDialog function must exist
assert.ok(
  editorSrc.includes("function openDropcapDialog()"),
  "openDropcapDialog function must exist in editor.js",
)

// openDropcapDialog must open the dropcap-dialog overlay
assert.ok(
  editorSrc.includes('openOverlayDialog("dropcap-dialog")'),
  "openDropcapDialog must open the dropcap-dialog overlay",
)

// The toggleDropcap function itself must also open the dialog (not a direct toggle)
assert.ok(
  editorSrc.includes("function toggleDropcap()") && editorSrc.includes("openDropcapDialog()"),
  "toggleDropcap function must call openDropcapDialog, not perform direct toggle",
)

// -- Dialog structure: must have styling options --

// The dialog must exist
assert.ok(htmlSrc.includes('id="dropcap-dialog"'), "dropcap-dialog must exist in index.html")

// The dialog must have a title
assert.ok(
  htmlSrc.includes('id="dropcap-dialog-title"'),
  "dropcap-dialog-title must exist in index.html",
)

// Position selector
assert.ok(
  htmlSrc.includes('id="dropcap-position"'),
  "dropcap-position select element must exist in index.html",
)
assert.ok(
  htmlSrc.includes('value="none"') &&
    htmlSrc.includes('value="dropped"') &&
    htmlSrc.includes('value="in-margin"'),
  "dropcap-position must have None, Dropped, and In margin options",
)

// Lines to drop input
assert.ok(htmlSrc.includes('id="dropcap-lines"'), "dropcap-lines input must exist in index.html")
assert.ok(
  htmlSrc.includes('type="number"') && htmlSrc.includes('min="2"') && htmlSrc.includes('max="5"'),
  "dropcap-lines must be a number input with min=2 and max=5",
)

// Distance from text input
assert.ok(
  htmlSrc.includes('id="dropcap-distance"'),
  "dropcap-distance input must exist in index.html",
)
assert.ok(
  htmlSrc.includes('min="0"') && htmlSrc.includes('max="50"'),
  "dropcap-distance must have min=0 and max=50",
)

// Dialog actions (OK and Cancel buttons)
assert.ok(htmlSrc.includes('id="btn-dropcap-ok"'), "btn-dropcap-ok button must exist in index.html")
assert.ok(
  htmlSrc.includes('id="btn-dropcap-close"'),
  "btn-dropcap-close button must exist in index.html",
)

// OK button must be i18n-ized
assert.ok(
  htmlSrc.includes('id="btn-dropcap-ok"') && htmlSrc.includes('data-i18n="Dialog.OK"'),
  "btn-dropcap-ok must have Dialog.OK i18n key",
)

// Cancel button must be i18n-ized
assert.ok(
  htmlSrc.includes('id="btn-dropcap-close"') && htmlSrc.includes('data-i18n="Dialog.Cancel"'),
  "btn-dropcap-close must have Dialog.Cancel i18n key",
)

// -- Confirmation handler: must apply options --

// confirmDropcapDialog must exist
assert.ok(
  editorSrc.includes("function confirmDropcapDialog()"),
  "confirmDropcapDialog function must exist in editor.js",
)

// confirmDropcapDialog must read dropcap-position
assert.ok(
  editorSrc.includes("dropcap-position") &&
    editorSrc.includes("value") &&
    editorSrc.includes("none") &&
    editorSrc.includes("dropped") &&
    editorSrc.includes("in-margin"),
  "confirmDropcapDialog must read dropcap-position value",
)

// confirmDropcapDialog must read dropcap-lines
assert.ok(
  editorSrc.includes("dropcap-lines") && editorSrc.includes("parseInt"),
  "confirmDropcapDialog must read and parse dropcap-lines value",
)

// confirmDropcapDialog must read dropcap-distance
assert.ok(
  editorSrc.includes("dropcap-distance") && editorSrc.includes("parseFloat"),
  "confirmDropcapDialog must read and parse dropcap-distance value",
)

// confirmDropcapDialog must call applyDropcap with options
assert.ok(
  editorSrc.includes("applyDropcap({") &&
    editorSrc.includes("inMargin") &&
    editorSrc.includes("lines") &&
    editorSrc.includes("distance"),
  "confirmDropcapDialog must call applyDropcap with inMargin, lines, and distance options",
)

// applyDropcap must exist and accept options
assert.ok(
  editorSrc.includes("function applyDropcap(opts)") || editorSrc.includes("function applyDropcap("),
  "applyDropcap function must exist in editor.js",
)

// applyDropcap must use the options to style the dropcap span
assert.ok(
  editorSrc.includes('span.className = "dropcap"') ||
    editorSrc.includes('className = "dropcap" + (opts.inMargin ? " in-margin" : "")'),
  "applyDropcap must create dropcap span with optional in-margin class",
)

// applyDropcap must set --drop-lines and --drop-distance CSS variables
assert.ok(
  editorSrc.includes("--drop-lines") && editorSrc.includes("--drop-distance"),
  "applyDropcap must set CSS variables for lines and distance",
)

// Dialog must be wired in ROUND2
assert.ok(
  editorSrc.includes('["dropcap", confirmDropcapDialog]'),
  "dropcap must be wired to confirmDropcapDialog in ROUND2",
)

console.log("All WO-3-dropcap tests passed!\n")
console.log("DROPCAP-PASS")

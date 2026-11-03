/**
 * parity-plus wave 2: line-spacing shortcuts (Ctrl+1/2/5), F7 spellcheck
 * toggle, and table banded rows (OO Table Design parity).
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Run with: node apps/web/apps/documenteditor-wysiwyg/parity-plus2.test.mjs
 * Success: prints "parity-plus2-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorSrc = readFileSync(new URL("./editor.js", import.meta.url), "utf-8")
const htmlSrc = readFileSync(new URL("./index.html", import.meta.url), "utf-8")
const i18nSrc = readFileSync(new URL("./i18n.js", import.meta.url), "utf-8")
const cssSrc = readFileSync(new URL("./style.css", import.meta.url), "utf-8")

console.log("Running parity-plus wave 2 tests...\n")

// --- Ctrl+1 / Ctrl+2 / Ctrl+5 line spacing (Word/OO convention) -------
const ctrlGroupIdx = editorSrc.indexOf(
  "if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey) {",
  editorSrc.indexOf("C1 SHORTCUT PARITY"),
)
assert.ok(ctrlGroupIdx !== -1, "C1 plain-ctrl group must exist")
const ctrlGroup = editorSrc.slice(ctrlGroupIdx, ctrlGroupIdx + 1200)

assert.ok(
  ctrlGroup.includes('ev.code === "Digit1"') &&
    ctrlGroup.includes('ev.code === "Digit2"') &&
    ctrlGroup.includes('ev.code === "Digit5"'),
  "Ctrl+1/2/5 must bind via ev.code Digit1/Digit2/Digit5 (layout-independent)",
)
assert.ok(
  ctrlGroup.includes('emitCommand("lineHeight"'),
  "Ctrl+1/2/5 must emitCommand(\"lineHeight\", ...) — existing command",
)
assert.ok(
  ctrlGroup.includes('ev.code === "Digit1" ? "1" : ev.code === "Digit2" ? "2" : "1.5"'),
  "Ctrl+1 → single (1), Ctrl+2 → double (2), Ctrl+5 → 1.5",
)

// lineHeight must be a real command with a runCommand arm
assert.ok(
  editorSrc.includes('if (cmd === "lineHeight") {'),
  "runCommand lineHeight arm must exist",
)

// --- F7 spellcheck toggle (Word/OO convention) -------------------------
assert.ok(
  editorSrc.includes('ev.key === "F7"'),
  "plain F7 binding must exist in the editor keydown handler",
)
const f7Idx = editorSrc.indexOf('ev.key === "F7"')
const f7Block = editorSrc.slice(f7Idx, f7Idx + 400)
assert.ok(f7Block.includes("toggleSpellcheck(!spellState.enabled)"), "F7 toggles spellState")
assert.ok(
  f7Block.includes("ev.preventDefault()"),
  "F7 must preventDefault (browser default F7 varies)",
)
// modifier-free: F7 without ctrl/meta/alt/shift
assert.ok(
  f7Block.includes("!ev.ctrlKey && !ev.metaKey && !ev.altKey && !ev.shiftKey"),
  "F7 must be modifier-free",
)

// --- Table banded rows (OO Table Design parity) ------------------------
// index.html: checkbox wired in the table section
assert.ok(htmlSrc.includes('id="rp-table-banded"'), "rp-table-banded checkbox must exist")
assert.ok(
  htmlSrc.includes('data-i18n="RightPanel.BandedRows"'),
  "checkbox label must use RightPanel.BandedRows i18n key",
)

// i18n: both catalogs
const bandedCount = i18nSrc.split('"RightPanel.BandedRows"').length - 1
assert.ok(bandedCount === 2, "RightPanel.BandedRows must be in BOTH en and de catalogs")

// CSS: nth-child(even) shading on the table-banded class
assert.ok(
  cssSrc.includes("table.table-banded") &&
    cssSrc.includes("tr:nth-child(even)") &&
    cssSrc.includes("background-color: #f2f2f2"),
  "style.css must shade even rows under table.table-banded",
)

// editor.js: apply function + listener + panel sync
assert.ok(
  editorSrc.includes("function applyTableBanded(on)"),
  "applyTableBanded must exist",
)
const bandedFnIdx = editorSrc.indexOf("function applyTableBanded(on)")
const bandedFn = editorSrc.slice(bandedFnIdx, bandedFnIdx + 500)
assert.ok(
  bandedFn.includes('classList.toggle("table-banded"'),
  "applyTableBanded toggles the table-banded class",
)
assert.ok(bandedFn.includes("markObjectMutation()"), "applyTableBanded marks the doc dirty")
assert.ok(
  editorSrc.includes('document.getElementById("rp-table-banded")'),
  "rp-table-banded change listener must exist",
)
assert.ok(
  editorSrc.includes('bandedIn.checked = table.classList.contains("table-banded")'),
  "syncTablePanelControls must sync the banded checkbox state",
)

// --- Macro dialog (OO View>Macros parity, real markup in index.html) ----
// The audit-i18n gate rejects dead getElementById wiring; this pins the
// dialog markup itself + its open path from the ribbon menu.
assert.ok(
  htmlSrc.includes('id="macro-dialog"') && htmlSrc.includes('class="dialog-overlay"'),
  "macro-dialog must be real markup in index.html (dialog-overlay)",
)
assert.ok(
  editorSrc.includes('openDlg("macro-dialog")'),
  "btn-macro-manager must open the macro dialog",
)
assert.ok(
  editorSrc.includes('"macro-dialog"') &&
    editorSrc.indexOf('"macro-dialog"', editorSrc.indexOf('const DIALOG_IDS')) <
      editorSrc.indexOf('const DIALOG_IDS') + 3000,
  "macro-dialog must be registered in DIALOG_IDS (Escape/Tab trap coverage)",
)

console.log("ok Ctrl+1/2/5 bind Digit1/Digit2/Digit5 → lineHeight 1/2/1.5")
console.log("ok lineHeight is a real command (runCommand arm)")
console.log("ok plain F7 toggles spellcheck with preventDefault")
console.log("ok rp-table-banded checkbox in index.html with i18n key")
console.log("ok RightPanel.BandedRows in both en + de catalogs")
console.log("ok table-banded nth-child(even) CSS shading present")
console.log("ok applyTableBanded + listener + panel sync wired")
console.log("ok macro-dialog is real index.html markup + DIALOG_IDS + ribbon open path")
console.log("\nparity-plus2-PASS")

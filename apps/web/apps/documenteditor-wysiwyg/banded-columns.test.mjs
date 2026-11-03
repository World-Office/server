/**
 * Banded columns (OO tableStylerColumns parity): right-panel toggle like
 * the existing banded rows (rp-table-banded). Static includes() pins —
 * no regex (project convention).
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Run with: node apps/web/apps/documenteditor-wysiwyg/banded-columns.test.mjs
 * Success: prints "banded-columns-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorSrc = readFileSync(new URL("./editor.js", import.meta.url), "utf-8")
const htmlSrc = readFileSync(new URL("./index.html", import.meta.url), "utf-8")
const i18nSrc = readFileSync(new URL("./i18n.js", import.meta.url), "utf-8")
const cssSrc = readFileSync(new URL("./style.css", import.meta.url), "utf-8")

console.log("Running banded-columns tests...\n")

// --- index.html: sibling checkbox in the right-panel table section -----
assert.ok(
  htmlSrc.includes('id="rp-table-banded-cols"'),
  "rp-table-banded-cols checkbox must exist",
)
assert.ok(
  htmlSrc.includes('data-i18n="RightPanel.BandedColumns"'),
  "checkbox label must use RightPanel.BandedColumns i18n key",
)

// --- i18n: BOTH en and de catalogs --------------------------------------
const bandedColsCount = i18nSrc.split('"RightPanel.BandedColumns"').length - 1
assert.ok(
  bandedColsCount === 2,
  "RightPanel.BandedColumns must be in BOTH en and de catalogs",
)
assert.ok(
  i18nSrc.includes('"RightPanel.BandedColumns": "Banded columns"'),
  "en catalog must translate RightPanel.BandedColumns as 'Banded columns'",
)
assert.ok(
  i18nSrc.includes('"RightPanel.BandedColumns": "Spaltenstreifen"'),
  "de catalog must translate RightPanel.BandedColumns as 'Spaltenstreifen'",
)

// --- style.css: nth-child(even) shading on the table-banded-cols class --
assert.ok(
  cssSrc.includes("#editor table.table-banded-cols td:nth-child(even)") &&
    cssSrc.includes("background-color: #f2f2f2"),
  "style.css must shade even columns under table.table-banded-cols",
)

// --- editor.js: apply function toggles the class -------------------------
assert.ok(
  editorSrc.includes("function applyTableBandedCols(on)"),
  "applyTableBandedCols must exist",
)
const bandedColsFnIdx = editorSrc.indexOf("function applyTableBandedCols(on)")
const bandedColsFn = editorSrc.slice(bandedColsFnIdx, bandedColsFnIdx + 500)
assert.ok(
  bandedColsFn.includes('classList.toggle("table-banded-cols"'),
  "applyTableBandedCols toggles the table-banded-cols class",
)
assert.ok(
  bandedColsFn.includes("markObjectMutation()"),
  "applyTableBandedCols marks the doc dirty",
)

// --- editor.js: panel sync mirrors the banded rows sync ------------------
assert.ok(
  editorSrc.includes(
    'bandedColsIn.checked = table.classList.contains("table-banded-cols")',
  ),
  "syncTablePanelControls must sync the banded-cols checkbox state",
)

// --- editor.js: change listener with READ_ONLY guard ---------------------
// lastIndexOf: the wiring block sits after syncTablePanelControls, whose
// getElementById call would otherwise be the first match.
const listenerIdx = editorSrc.lastIndexOf(
  'document.getElementById("rp-table-banded-cols")',
)
assert.ok(
  listenerIdx !== -1,
  "rp-table-banded-cols change listener must exist",
)
const listenerBlock = editorSrc.slice(listenerIdx, listenerIdx + 400)
assert.ok(
  listenerBlock.includes("if (READ_ONLY) return;"),
  "rp-table-banded-cols change listener must guard READ_ONLY",
)
assert.ok(
  listenerBlock.includes("applyTableBandedCols(rpTableBandedCols.checked)"),
  "rp-table-banded-cols change listener must call applyTableBandedCols",
)

console.log("ok rp-table-banded-cols checkbox in index.html with i18n key")
console.log("ok RightPanel.BandedColumns in both en + de catalogs")
console.log("ok table-banded-cols nth-child(even) CSS shading present")
console.log("ok applyTableBandedCols toggles table-banded-cols + marks dirty")
console.log("ok syncTablePanelControls syncs the cols checkbox")
console.log("ok change listener with READ_ONLY guard wired")
console.log("\nbanded-columns-PASS")

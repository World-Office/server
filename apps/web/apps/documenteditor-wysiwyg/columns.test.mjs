/**
 * WO-15-columns: census-artifact (layout tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-columns is included in the interact census with
 * wo_id=btn-columns, wo_cmd=btn-columns, and opens_wo='modal',
 * matching OnlyOffice parity (slugs:columns).
 *
 * Run with: node columns.test.mjs
 * Success: prints "columns-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-15-columns interact census tests...\n")

// The btn-columns button must exist in the layout tab
assert.ok(htmlSrc.includes('id="btn-columns"'), "btn-columns button must exist in index.html")
console.log("ok 1 btn-columns button exists")

// The btn-columns must be wrapped in a span with data-wo-id and data-wo-cmd
const btnColumnsMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-columns"[^>]*data-wo-cmd="btn-columns"[^>]*>.*?id="btn-columns"/s,
)
assert.ok(
  btnColumnsMatch,
  'btn-columns must be inside a span with data-wo-id="btn-columns" and data-wo-cmd="btn-columns"',
)
console.log("ok 2 btn-columns is in interact census with wo_id=btn-columns and wo_cmd=btn-columns")

// The btn-columns span must also have data-wo-interact="opens:modal"
const btnColumnsInteractMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-columns"[^>]*data-wo-cmd="btn-columns"[^>]*data-wo-interact="opens:modal"[^>]*>.*?id="btn-columns"/s,
)
assert.ok(btnColumnsInteractMatch, 'btn-columns span must have data-wo-interact="opens:modal"')
console.log('ok 3 btn-columns span has data-wo-interact="opens:modal"')

// The btn-columns must be in the layout tab section
const layoutTabMatch = htmlSrc.match(
  /<div class="ribbon-page"[^>]*data-tab="layout"[^>]*>.*?id="btn-columns".*?<\/div>/s,
)
assert.ok(layoutTabMatch, "btn-columns must be in the layout tab")
console.log("ok 4 btn-columns is in the layout tab")

// The columns dialog must exist (modal overlay)
assert.ok(htmlSrc.includes('id="columns-dialog"'), "columns-dialog must exist in index.html")
console.log("ok 5 columns-dialog exists")

// The columns-dialog must be a modal (dialog-overlay with aria-modal="true")
const columnsDialogMatch = htmlSrc.match(
  /id="columns-dialog"[^>]*class="dialog-overlay"[^>]*aria-modal="true"/,
)
assert.ok(columnsDialogMatch, "columns-dialog must be a modal overlay with aria-modal=true")
console.log("ok 6 columns-dialog is a modal overlay")

// editor.js must have btn-columns element access
assert.ok(
  editorSrc.includes('getElementById("btn-columns")'),
  "btn-columns element must be accessed in editor.js",
)
console.log("ok 7 btn-columns element is accessed in editor.js")

// editor.js must wire btn-columns click to open columns-dialog
assert.ok(
  editorSrc.includes("columns-dialog") &&
    editorSrc.includes('getElementById("btn-columns")') &&
    editorSrc.includes('addEventListener("click"') &&
    editorSrc.includes("openColumnsDialog"),
  "btn-columns must have click handler to open columns-dialog",
)
console.log("ok 8 btn-columns click handler opens columns-dialog")

// i18n must have Layout.Columns key
assert.ok(i18nSrc.includes('"Layout.Columns"'), "Layout.Columns i18n key must exist")
console.log("ok 9 Layout.Columns i18n key exists")

console.log("\nAll WO-15-columns interact census tests passed!\n")
console.log("columns-PASS")

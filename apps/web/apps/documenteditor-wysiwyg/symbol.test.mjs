/**
 * WO-13-symbol: census-artifact (insert tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-symbol is included in the interact census with
 * wo_id=btn-symbol and wo_cmd=btn-symbol, matching OnlyOffice parity (slugs:symbol).
 *
 * Run with: node symbol.test.mjs
 * Success: prints "symbol-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-13-symbol interact census tests...\n")

// The btn-symbol button must exist in the insert tab
assert.ok(htmlSrc.includes('id="btn-symbol"'), "btn-symbol button must exist in index.html")
console.log("ok 1 btn-symbol button exists")

// The btn-symbol must be wrapped in a span with data-wo-id and data-wo-cmd for btn-symbol
const btnSymbolMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-symbol"[^>]*data-wo-cmd="btn-symbol"[^>]*>.*?id="btn-symbol"/s,
)
assert.ok(
  btnSymbolMatch,
  'btn-symbol must be inside a span with data-wo-id="btn-symbol" and data-wo-cmd="btn-symbol"',
)
console.log("ok 2 btn-symbol is in interact census with wo_id=btn-symbol and wo_cmd=btn-symbol")

// The btn-symbol span must also have data-wo-interact="opens:modal"
const btnSymbolInteractMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-symbol"[^>]*data-wo-cmd="btn-symbol"[^>]*data-wo-interact="opens:modal"[^>]*>.*?id="btn-symbol"/s,
)
assert.ok(btnSymbolInteractMatch, 'btn-symbol span must have data-wo-interact="opens:modal"')
console.log('ok 3 btn-symbol span has data-wo-interact="opens:modal"')

// The btn-symbol must be in the insert tab section
const insertTabMatch = htmlSrc.match(
  /<div class="ribbon-page"[^>]*data-tab="insert"[^>]*>.*?id="btn-symbol".*?<\/div>/s,
)
assert.ok(insertTabMatch, "btn-symbol must be in the insert tab")
console.log("ok 4 btn-symbol is in the insert tab")

// The symbol dialog must exist (modal overlay)
assert.ok(htmlSrc.includes('id="symbol-dialog"'), "symbol-dialog must exist in index.html")
console.log("ok 5 symbol-dialog exists")

// The symbol dialog must be a modal (dialog-overlay with aria-modal="true")
const symbolDialogMatch = htmlSrc.match(
  /id="symbol-dialog"[^>]*class="dialog-overlay"[^>]*aria-modal="true"/,
)
assert.ok(symbolDialogMatch, "symbol-dialog must be a modal overlay with aria-modal=true")
console.log("ok 6 symbol-dialog is a modal overlay")

// The symbol dialog must have a grid for symbols
assert.ok(htmlSrc.includes('id="symbol-grid"'), "symbol-dialog must have symbol grid")
console.log("ok 7 symbol-dialog has symbol grid")

// The symbol dialog must have a close button
assert.ok(htmlSrc.includes('id="btn-symbol-close"'), "symbol-dialog must have close button")
console.log("ok 8 symbol-dialog has close button")

// editor.js must have symbolBtn wiring
assert.ok(
  editorSrc.includes('getElementById("btn-symbol")'),
  "btn-symbol element must be accessed in editor.js",
)
console.log("ok 9 btn-symbol element is accessed in editor.js")

// editor.js must wire btn-symbol click to open symbol dialog
assert.ok(
  editorSrc.includes("symbolBtn") && editorSrc.includes("openSymbolDialog"),
  "btn-symbol must open symbol dialog via openSymbolDialog",
)
console.log("ok 10 btn-symbol click handler opens symbol-dialog")

// i18n must have Toolbar.SymbolTitle key
assert.ok(i18nSrc.includes('"Toolbar.SymbolTitle"'), "Toolbar.SymbolTitle i18n key must exist")
console.log("ok 11 Toolbar.SymbolTitle i18n key exists")

console.log("\nAll WO-13-symbol interact census tests passed!\n")
console.log("symbol-PASS")

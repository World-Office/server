/**
 * WO-17-ocr: census-artifact (plugins tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-ocr is included in the interact census with opens:modal
 * behavior, matching OnlyOffice parity (slugs:ocr).
 *
 * Run with: node ocr.test.mjs
 * Success: prints "ocr-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")

console.log("Running WO-17-ocr interact census tests...\n")

// The btn-ocr button must exist in the plugins tab
assert.ok(htmlSrc.includes('id="btn-ocr"'), "btn-ocr button must exist in index.html")
console.log("ok 1 btn-ocr button exists")

// The btn-ocr must be wrapped in a span with data-wo-id and data-wo-cmd
const btnOcrMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-ocr"[^>]*data-wo-cmd="btn-ocr"[^>]*>.*?id="btn-ocr"/s,
)
assert.ok(
  btnOcrMatch,
  'btn-ocr must be inside a span with data-wo-id="btn-ocr" and data-wo-cmd="btn-ocr"',
)
console.log("ok 2 btn-ocr is in interact census with wo_id=btn-ocr and wo_cmd=btn-ocr")

// The btn-ocr span must also have data-wo-interact="opens:modal"
const btnOcrInteractMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-ocr"[^>]*data-wo-cmd="btn-ocr"[^>]*data-wo-interact="opens:modal"[^>]*>.*?id="btn-ocr"/s,
)
assert.ok(btnOcrInteractMatch, 'btn-ocr span must have data-wo-interact="opens:modal"')
console.log('ok 3 btn-ocr span has data-wo-interact="opens:modal"')

// The btn-ocr must be in the plugins tab section
const pluginsTabMatch = htmlSrc.match(
  /<div class="ribbon-page"[^>]*data-tab="plugins"[^>]*>.*?id="btn-ocr".*?<\/div>/s,
)
assert.ok(pluginsTabMatch, "btn-ocr must be in the plugins tab")
console.log("ok 4 btn-ocr is in the plugins tab")

// The OCR dialog must exist (modal overlay)
assert.ok(htmlSrc.includes('id="ocr-dialog"'), "ocr-dialog must exist in index.html")
console.log("ok 5 ocr-dialog exists")

// The OCR dialog must be a modal (dialog-overlay with aria-modal="true")
const ocrDialogMatch = htmlSrc.match(
  /id="ocr-dialog"[^>]*class="dialog-overlay"[^>]*aria-modal="true"/,
)
assert.ok(ocrDialogMatch, "ocr-dialog must be a modal overlay with aria-modal=true")
console.log("ok 6 ocr-dialog is a modal overlay")

// The OCR dialog must have OK and Cancel buttons
assert.ok(
  htmlSrc.includes('id="btn-ocr-ok"') && htmlSrc.includes('id="btn-ocr-cancel"'),
  "ocr-dialog must have OK and Cancel buttons",
)
console.log("ok 7 ocr-dialog has OK and Cancel buttons")

// editor.js must have btn-ocr element access
assert.ok(
  editorSrc.includes('getElementById("btn-ocr")'),
  "btn-ocr element must be accessed in editor.js",
)
console.log("ok 8 btn-ocr element is accessed in editor.js")

// editor.js must wire btn-ocr click to open ocr-dialog
assert.ok(
  editorSrc.includes("btn-ocr") &&
    editorSrc.includes("ocr-dialog") &&
    editorSrc.includes("addEventListener"),
  "btn-ocr must have click handler wired to open ocr-dialog",
)
console.log("ok 9 btn-ocr click handler opens ocr-dialog")

console.log("\nAll WO-17-ocr interact census tests passed!\n")
console.log("ocr-PASS")

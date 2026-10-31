/**
 * WO-12-insertfield: census-artifact (insert tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-field is included in the interact census with
 * wo_id=btn-field and wo_cmd=btn-field, matching OnlyOffice parity (slugs:insertfield).
 *
 * Run with: node insertfield.test.mjs
 * Success: prints "insertfield-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-12-insertfield interact census tests...\n")

// The btn-field button must exist in the insert tab
assert.ok(htmlSrc.includes('id="btn-field"'), "btn-field button must exist in index.html")
console.log("ok 1 btn-field button exists")

// The btn-field must be wrapped in a span with data-wo-id and data-wo-cmd for btn-field
const btnFieldMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-field"[^>]*data-wo-cmd="btn-field"[^>]*>.*?id="btn-field"/s,
)
assert.ok(
  btnFieldMatch,
  'btn-field must be inside a span with data-wo-id="btn-field" and data-wo-cmd="btn-field"',
)
console.log("ok 2 btn-field is in interact census with wo_id=btn-field and wo_cmd=btn-field")

// The btn-field span must also have data-wo-interact="opens:modal"
const btnFieldInteractMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-field"[^>]*data-wo-cmd="btn-field"[^>]*data-wo-interact="opens:modal"[^>]*>.*?id="btn-field"/s,
)
assert.ok(btnFieldInteractMatch, 'btn-field span must have data-wo-interact="opens:modal"')
console.log('ok 3 btn-field span has data-wo-interact="opens:modal"')

// The btn-field must be in the insert tab section
const insertTabMatch = htmlSrc.match(
  /<div class="ribbon-page"[^>]*data-tab="insert"[^>]*>.*?id="btn-field".*?<\/div>/s,
)
assert.ok(insertTabMatch, "btn-field must be in the insert tab")
console.log("ok 4 btn-field is in the insert tab")

// The field dialog must exist (modal overlay)
assert.ok(htmlSrc.includes('id="field-dialog"'), "field-dialog must exist in index.html")
console.log("ok 5 field-dialog exists")

// The field dialog must be a modal (dialog-overlay with aria-modal="true")
const fieldDialogMatch = htmlSrc.match(
  /id="field-dialog"[^>]*class="dialog-overlay"[^>]*aria-modal="true"/,
)
assert.ok(fieldDialogMatch, "field-dialog must be a modal overlay with aria-modal=true")
console.log("ok 6 field-dialog is a modal overlay")

// The field dialog must have type select
assert.ok(
  htmlSrc.includes('id="field-type"') && htmlSrc.includes('<select id="field-type"'),
  "field-dialog must have field type select",
)
console.log("ok 7 field-dialog has field type select")

// The field dialog must have Insert and Cancel buttons
assert.ok(
  htmlSrc.includes('id="btn-field-ok"') && htmlSrc.includes('id="btn-field-cancel"'),
  "field-dialog must have Insert and Cancel buttons",
)
console.log("ok 8 field-dialog has Insert and Cancel buttons")

// editor.js must have btnField wiring
assert.ok(
  editorSrc.includes('getElementById("btn-field")'),
  "btn-field element must be accessed in editor.js",
)
console.log("ok 9 btn-field element is accessed in editor.js")

// editor.js must wire btn-field click to open field dialog
assert.ok(
  editorSrc.includes("btn-field") && editorSrc.includes('openDlg("field-dialog")'),
  "btn-field must open field-dialog via openDlg",
)
console.log("ok 10 btn-field click handler opens field-dialog")

// i18n must have Insert.Field key
assert.ok(i18nSrc.includes('"Insert.Field"'), "Insert.Field i18n key must exist")
console.log("ok 11 Insert.Field i18n key exists")

console.log("\nAll WO-12-insertfield interact census tests passed!\n")
console.log("insertfield-PASS")

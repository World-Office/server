/**
 * WO-12-textbox: census-artifact (insert tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-textbox is included in the interact census with
 * wo_id=insertObject and wo_cmd=insertObject, matching OnlyOffice parity (slugs:textbox).
 *
 * Run with: node textbox.test.mjs
 * Success: prints "textbox-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-12-textbox interact census tests...\n")

// The btn-textbox button must exist in the insert tab
assert.ok(htmlSrc.includes('id="btn-textbox"'), "btn-textbox button must exist in index.html")
console.log("ok 1 btn-textbox button exists")

// The btn-textbox must be wrapped in a span with data-wo-id and data-wo-cmd for insertObject
const btnTextboxMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="insertObject"[^>]*data-wo-cmd="insertObject"[^>]*>.*?id="btn-textbox"/s,
)
assert.ok(
  btnTextboxMatch,
  'btn-textbox must be inside a span with data-wo-id="insertObject" and data-wo-cmd="insertObject"',
)
console.log(
  "ok 2 btn-textbox is in interact census with wo_id=insertObject and wo_cmd=insertObject",
)

// The btn-textbox span must also have data-wo-interact="opens:modal"
const btnTextboxInteractMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="insertObject"[^>]*data-wo-cmd="insertObject"[^>]*data-wo-interact="opens:modal"[^>]*>.*?id="btn-textbox"/s,
)
assert.ok(btnTextboxInteractMatch, 'btn-textbox span must have data-wo-interact="opens:modal"')
console.log('ok 3 btn-textbox span has data-wo-interact="opens:modal"')

// The btn-textbox must be in the insert tab section
const insertTabMatch = htmlSrc.match(
  /<div class="ribbon-page"[^>]*data-tab="insert"[^>]*>.*?id="btn-textbox".*?<\/div>/s,
)
assert.ok(insertTabMatch, "btn-textbox must be in the insert tab")
console.log("ok 4 btn-textbox is in the insert tab")

// The object dialog must exist (modal overlay) - this is the insertObject surface
assert.ok(htmlSrc.includes('id="object-dialog"'), "object-dialog must exist in index.html")
console.log("ok 5 object-dialog exists")

// The object dialog must be a modal
const objectDialogMatch = htmlSrc.match(
  /id="object-dialog"[^>]*class="dialog-overlay"[^>]*aria-modal="true"/,
)
assert.ok(objectDialogMatch, "object-dialog must be a modal overlay with aria-modal=true")
console.log("ok 6 object-dialog is a modal overlay")

// The object dialog must have textbox option in the type select
assert.ok(
  htmlSrc.includes('<option value="textbox">Text box</option>'),
  "object-dialog must have textbox option in the type select",
)
console.log("ok 7 object-dialog has textbox option")

// editor.js must have insertTextbox command handler
assert.ok(
  editorSrc.includes('cmd === "insertTextbox"') &&
    editorSrc.includes('openObjectDialog("textbox")'),
  "insertTextbox command must exist and call openObjectDialog with 'textbox'",
)
console.log("ok 8 insertTextbox command exists in editor.js")

// editor.js must have openObjectDialog function
assert.ok(
  editorSrc.includes("function openObjectDialog("),
  "openObjectDialog function must exist in editor.js",
)
console.log("ok 9 openObjectDialog function exists in editor.js")

// i18n must have Insert.TextBox key for the textbox button
assert.ok(i18nSrc.includes('"Insert.TextBox"'), "Insert.TextBox i18n key must exist")
console.log("ok 10 Insert.TextBox i18n key exists")

console.log("\nAll WO-12-textbox interact census tests passed!\n")
console.log("textbox-PASS")

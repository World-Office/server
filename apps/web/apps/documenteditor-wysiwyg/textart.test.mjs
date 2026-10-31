/**
 * WO-12-textart: census-artifact (insert tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-textart is included in the interact census with
 * wo_id=insertObject and wo_cmd=insertObject, matching OnlyOffice parity (slugs:textart).
 *
 * Run with: node textart.test.mjs
 * Success: prints "textart-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-12-textart interact census tests...\n")

// The btn-textart button must exist in the insert tab
assert.ok(htmlSrc.includes('id="btn-textart"'), "btn-textart button must exist in index.html")
console.log("ok 1 btn-textart button exists")

// The btn-textart must be wrapped in a span with data-wo-id and data-wo-cmd for insertObject
const btnTextartMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="insertObject"[^>]*data-wo-cmd="insertObject"[^>]*>.*?id="btn-textart"/s,
)
assert.ok(
  btnTextartMatch,
  'btn-textart must be inside a span with data-wo-id="insertObject" and data-wo-cmd="insertObject"',
)
console.log(
  "ok 2 btn-textart is in interact census with wo_id=insertObject and wo_cmd=insertObject",
)

// The btn-textart span must also have data-wo-interact="opens:modal"
const btnTextartInteractMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="insertObject"[^>]*data-wo-cmd="insertObject"[^>]*data-wo-interact="opens:modal"[^>]*>.*?id="btn-textart"/s,
)
assert.ok(btnTextartInteractMatch, 'btn-textart span must have data-wo-interact="opens:modal"')
console.log('ok 3 btn-textart span has data-wo-interact="opens:modal"')

// The btn-textart must be in the insert tab section
const insertTabMatch = htmlSrc.match(
  /<div class="ribbon-page"[^>]*data-tab="insert"[^>]*>.*?id="btn-textart".*?<\/div>/s,
)
assert.ok(insertTabMatch, "btn-textart must be in the insert tab")
console.log("ok 4 btn-textart is in the insert tab")

// The object dialog must exist (modal overlay) - this is the insertObject surface
assert.ok(htmlSrc.includes('id="object-dialog"'), "object-dialog must exist in index.html")
console.log("ok 5 object-dialog exists")

// The object dialog must be a modal
const objectDialogMatch = htmlSrc.match(
  /id="object-dialog"[^>]*class="dialog-overlay"[^>]*aria-modal="true"/,
)
assert.ok(objectDialogMatch, "object-dialog must be a modal overlay with aria-modal=true")
console.log("ok 6 object-dialog is a modal overlay")

// The object dialog must have textart option in the type select
assert.ok(
  htmlSrc.includes('<option value="textart">Text art</option>'),
  "object-dialog must have textart option in the type select",
)
console.log("ok 7 object-dialog has textart option")

// editor.js must have insertTextart command handler
assert.ok(
  editorSrc.includes('cmd === "insertTextart"') &&
    editorSrc.includes('openObjectDialog("textart")'),
  "insertTextart command must exist and call openObjectDialog with 'textart'",
)
console.log("ok 8 insertTextart command exists in editor.js")

// editor.js must have openObjectDialog function
assert.ok(
  editorSrc.includes("function openObjectDialog("),
  "openObjectDialog function must exist in editor.js",
)
console.log("ok 9 openObjectDialog function exists in editor.js")

// i18n must have Insert.TextArt key for the textart button
assert.ok(i18nSrc.includes('"Insert.TextArt"'), "Insert.TextArt i18n key must exist")
console.log("ok 10 Insert.TextArt i18n key exists")

console.log("\nAll WO-12-textart interact census tests passed!\n")
console.log("textart-PASS")

/**
 * WO-13-contentcontrols: census-artifact (insert tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-contentcontrol is included in the interact census with
 * wo_id=btn-contentcontrol and wo_cmd=btn-contentcontrol, matching OnlyOffice parity (slugs:contentcontrols).
 *
 * Run with: node contentcontrols.test.mjs
 * Success: prints "contentcontrols-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-13-contentcontrols interact census tests...\n")

// The btn-contentcontrol button must exist in the insert tab
assert.ok(
  htmlSrc.includes('id="btn-contentcontrol"'),
  "btn-contentcontrol button must exist in index.html",
)
console.log("ok 1 btn-contentcontrol button exists")

// The btn-contentcontrol must be wrapped in a span with data-wo-id and data-wo-cmd for btn-contentcontrol
const btnContentControlMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-contentcontrol"[^>]*data-wo-cmd="btn-contentcontrol"[^>]*>.*?id="btn-contentcontrol"/s,
)
assert.ok(
  btnContentControlMatch,
  'btn-contentcontrol must be inside a span with data-wo-id="btn-contentcontrol" and data-wo-cmd="btn-contentcontrol"',
)
console.log(
  "ok 2 btn-contentcontrol is in interact census with wo_id=btn-contentcontrol and wo_cmd=btn-contentcontrol",
)

// The btn-contentcontrol span must also have data-wo-interact="opens:modal"
const btnContentControlInteractMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-contentcontrol"[^>]*data-wo-cmd="btn-contentcontrol"[^>]*data-wo-interact="opens:modal"[^>]*>.*?id="btn-contentcontrol"/s,
)
assert.ok(
  btnContentControlInteractMatch,
  'btn-contentcontrol span must have data-wo-interact="opens:modal"',
)
console.log('ok 3 btn-contentcontrol span has data-wo-interact="opens:modal"')

// The btn-contentcontrol must be in the insert tab section
const insertTabMatch = htmlSrc.match(
  /<div class="ribbon-page"[^>]*data-tab="insert"[^>]*>.*?id="btn-contentcontrol".*?<\/div>/s,
)
assert.ok(insertTabMatch, "btn-contentcontrol must be in the insert tab")
console.log("ok 4 btn-contentcontrol is in the insert tab")

// The content control dialog must exist (modal overlay)
assert.ok(htmlSrc.includes('id="cc-dialog"'), "cc-dialog must exist in index.html")
console.log("ok 5 cc-dialog exists")

// The cc-dialog must be a modal (dialog-overlay with aria-modal="true")
const ccDialogMatch = htmlSrc.match(
  /id="cc-dialog"[^>]*class="dialog-overlay"[^>]*aria-modal="true"/,
)
assert.ok(ccDialogMatch, "cc-dialog must be a modal overlay with aria-modal=true")
console.log("ok 6 cc-dialog is a modal overlay")

// The cc-dialog must have a type select for content controls
assert.ok(
  htmlSrc.includes('id="cc-type"') && htmlSrc.includes('<select id="cc-type"'),
  "cc-dialog must have content control type select",
)
console.log("ok 7 cc-dialog has content control type select")

// The cc-dialog must have title input
assert.ok(htmlSrc.includes('id="cc-title"'), "cc-dialog must have title input")
console.log("ok 8 cc-dialog has title input")

// The cc-dialog must have Insert and Cancel buttons
assert.ok(
  htmlSrc.includes('id="btn-cc-ok"') && htmlSrc.includes('id="btn-cc-cancel"'),
  "cc-dialog must have Insert and Cancel buttons",
)
console.log("ok 9 cc-dialog has Insert and Cancel buttons")

// editor.js must have btnCc wiring
assert.ok(
  editorSrc.includes('getElementById("btn-contentcontrol")'),
  "btn-contentcontrol element must be accessed in editor.js",
)
console.log("ok 10 btn-contentcontrol element is accessed in editor.js")

// editor.js must wire btn-contentcontrol click to open cc-dialog
assert.ok(
  editorSrc.includes("btnCc") && editorSrc.includes('openDlg("cc-dialog")'),
  "btn-contentcontrol must open cc-dialog via openDlg",
)
console.log("ok 11 btn-contentcontrol click handler opens cc-dialog")

// i18n must have Insert.ContentControl key
assert.ok(i18nSrc.includes('"Insert.ContentControl"'), "Insert.ContentControl i18n key must exist")
console.log("ok 12 Insert.ContentControl i18n key exists")

// i18n must have Backstage.CCTitle key
assert.ok(i18nSrc.includes('"Backstage.CCTitle"'), "Backstage.CCTitle i18n key must exist")
console.log("ok 13 Backstage.CCTitle i18n key exists")

console.log("\nAll WO-13-contentcontrols interact census tests passed!\n")
console.log("contentcontrols-PASS")

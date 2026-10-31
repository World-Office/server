/**
 * WO-13-equation: census-artifact (insert tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-equation is included in the interact census with
 * wo_id=btn-equation and wo_cmd=btn-equation, matching OnlyOffice parity (slugs:equation).
 *
 * Run with: node equation.test.mjs
 * Success: prints "equation-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-13-equation interact census tests...\n")

// The btn-equation button must exist in the insert tab
assert.ok(htmlSrc.includes('id="btn-equation"'), "btn-equation button must exist in index.html")
console.log("ok 1 btn-equation button exists")

// The btn-equation must be wrapped in a span with data-wo-id and data-wo-cmd for btn-equation
const btnEquationMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-equation"[^>]*data-wo-cmd="btn-equation"[^>]*>.*?id="btn-equation"/s,
)
assert.ok(
  btnEquationMatch,
  'btn-equation must be inside a span with data-wo-id="btn-equation" and data-wo-cmd="btn-equation"',
)
console.log(
  "ok 2 btn-equation is in interact census with wo_id=btn-equation and wo_cmd=btn-equation",
)

// The btn-equation span must also have data-wo-interact="opens:modal"
const btnEquationInteractMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-equation"[^>]*data-wo-cmd="btn-equation"[^>]*data-wo-interact="opens:modal"[^>]*>.*?id="btn-equation"/s,
)
assert.ok(btnEquationInteractMatch, 'btn-equation span must have data-wo-interact="opens:modal"')
console.log('ok 3 btn-equation span has data-wo-interact="opens:modal"')

// The btn-equation must be in the insert tab section
const insertTabMatch = htmlSrc.match(
  /<div class="ribbon-page"[^>]*data-tab="insert"[^>]*>.*?id="btn-equation".*?<\/div>/s,
)
assert.ok(insertTabMatch, "btn-equation must be in the insert tab")
console.log("ok 4 btn-equation is in the insert tab")

// The equation dialog must exist (modal overlay)
assert.ok(htmlSrc.includes('id="equation-dialog"'), "equation-dialog must exist in index.html")
console.log("ok 5 equation-dialog exists")

// The equation dialog must be a modal (dialog-overlay with aria-modal="true")
const equationDialogMatch = htmlSrc.match(
  /id="equation-dialog"[^>]*class="dialog-overlay"[^>]*aria-modal="true"/,
)
assert.ok(equationDialogMatch, "equation-dialog must be a modal overlay with aria-modal=true")
console.log("ok 6 equation-dialog is a modal overlay")

// The equation dialog must have input textarea
assert.ok(
  htmlSrc.includes('id="equation-input"') && htmlSrc.includes('<textarea id="equation-input"'),
  "equation-dialog must have equation input textarea",
)
console.log("ok 7 equation-dialog has equation input textarea")

// The equation dialog must have preview div
assert.ok(
  htmlSrc.includes('id="equation-preview"'),
  "equation-dialog must have equation preview div",
)
console.log("ok 8 equation-dialog has equation preview div")

// The equation dialog must have Insert and Cancel buttons
assert.ok(
  htmlSrc.includes('id="btn-equation-ok"') && htmlSrc.includes('id="btn-equation-cancel"'),
  "equation-dialog must have Insert and Cancel buttons",
)
console.log("ok 9 equation-dialog has Insert and Cancel buttons")

// editor.js must have btnEquation wiring
assert.ok(
  editorSrc.includes('getElementById("btn-equation")'),
  "btn-equation element must be accessed in editor.js",
)
console.log("ok 10 btn-equation element is accessed in editor.js")

// editor.js must wire btn-equation click to open equation dialog
assert.ok(
  editorSrc.includes("btn-equation") && editorSrc.includes('openDlg("equation-dialog")'),
  "btn-equation must open equation-dialog via openDlg",
)
console.log("ok 11 btn-equation click handler opens equation-dialog")

// i18n must have Insert.Equation key
assert.ok(i18nSrc.includes('"Insert.Equation"'), "Insert.Equation i18n key must exist")
console.log("ok 12 Insert.Equation i18n key exists")

// i18n must have Backstage.EquationTitle key
assert.ok(
  i18nSrc.includes('"Backstage.EquationTitle"'),
  "Backstage.EquationTitle i18n key must exist",
)
console.log("ok 13 Backstage.EquationTitle i18n key exists")

// i18n must have Dialog.InsertEquation key
assert.ok(i18nSrc.includes('"Dialog.InsertEquation"'), "Dialog.InsertEquation i18n key must exist")
console.log("ok 14 Dialog.InsertEquation i18n key exists")

console.log("\nAll WO-13-equation interact census tests passed!\n")
console.log("equation-PASS")

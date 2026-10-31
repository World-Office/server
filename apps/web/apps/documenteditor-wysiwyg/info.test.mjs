/**
 * WO-19-info: census-artifact (backstage tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the btn-fileinfo control is in the interact census with
 * its panel open behavior (OnlyOffice parity, slugs:info).
 *
 * Run with: node info.test.mjs
 * Success: prints "info-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")

console.log("Running WO-19-info census-artifact tests...\n")

// btn-fileinfo button exists in the backstage info panel
console.log("Checking btn-fileinfo button in backstage info panel...")
assert.ok(htmlSrc.includes('id="btn-fileinfo"'), "btn-fileinfo button must exist in index.html")
assert.ok(
  htmlSrc.includes('class="backstage-primary"'),
  "btn-fileinfo must have backstage-primary class",
)
console.log("btn-fileinfo button ok\n")

// btn-fileinfo must be wrapped in an interact census span
console.log("Checking interact census attributes for btn-fileinfo...")
assert.ok(
  htmlSrc.includes('data-wo-id="btn-fileinfo"'),
  "btn-fileinfo must have data-wo-id attribute in index.html",
)
assert.ok(
  htmlSrc.includes('data-wo-cmd="btn-fileinfo"'),
  "btn-fileinfo must have data-wo-cmd attribute in index.html",
)
assert.ok(
  htmlSrc.includes('data-wo-interact="opens:panel"'),
  'btn-fileinfo must have data-wo-interact="opens:panel" for OnlyOffice parity',
)
console.log("Interact census attributes ok\n")

// The interact census comment must be present
console.log("Checking census comment...")
assert.ok(htmlSrc.includes("Interact census row"), "Interact census comment must exist")
assert.ok(htmlSrc.includes("backstage/info"), "Census comment must reference backstage/info")
assert.ok(htmlSrc.includes("Document info"), "Census comment must reference Document info control")
assert.ok(
  htmlSrc.includes("parity token is opens:panel"),
  "Census comment must state opens:panel parity token",
)
console.log("Census comment ok\n")

// btn-fileinfo wiring in editor.js
console.log("Checking btn-fileinfo wiring in editor.js...")
assert.ok(
  editorSrc.includes('const btnFileInfo = document.getElementById("btn-fileinfo")'),
  "btnFileInfo lookup must exist in editor.js",
)
assert.ok(
  editorSrc.includes('btnFileInfo.addEventListener("click"'),
  "btnFileInfo click handler must exist in editor.js",
)
// The handler opens the info-dialog with docStats
assert.ok(editorSrc.includes('openDlg("info-dialog")'), "btnFileInfo handler must open info-dialog")
assert.ok(editorSrc.includes("docStats()"), "btnFileInfo handler must call docStats")
console.log("Editor wiring ok\n")

// info-dialog must exist in index.html
console.log("Checking info-dialog existence...")
assert.ok(htmlSrc.includes('id="info-dialog"'), "info-dialog must exist in index.html")
assert.ok(htmlSrc.includes('class="dialog-overlay"'), "info-dialog must be a dialog-overlay")
console.log("info-dialog ok\n")

console.log("All WO-19-info census-artifact tests passed!\n")
console.log("info-PASS")

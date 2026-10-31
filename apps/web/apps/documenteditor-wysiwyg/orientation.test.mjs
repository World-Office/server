/**
 * WO-14-orientation: census-artifact (layout tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-page-setup is included in the interact census with
 * wo_id=btn-page-setup, wo_cmd=btn-page-setup, and opens_wo='modal',
 * matching OnlyOffice parity (slugs:orientation).
 *
 * Run with: node orientation.test.mjs
 * Success: prints "orientation-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-14-orientation interact census tests...\n")

// The btn-page-setup button must exist in the layout tab
assert.ok(htmlSrc.includes('id="btn-page-setup"'), "btn-page-setup button must exist in index.html")
console.log("ok 1 btn-page-setup button exists")

// The btn-page-setup must be wrapped in a span with data-wo-id and data-wo-cmd
const btnPageSetupMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-page-setup"[^>]*data-wo-cmd="btn-page-setup"[^>]*>.*?id="btn-page-setup"/s,
)
assert.ok(
  btnPageSetupMatch,
  'btn-page-setup must be inside a span with data-wo-id="btn-page-setup" and data-wo-cmd="btn-page-setup"',
)
console.log(
  "ok 2 btn-page-setup is in interact census with wo_id=btn-page-setup and wo_cmd=btn-page-setup",
)

// The btn-page-setup span must also have data-wo-interact="opens:modal"
const btnPageSetupInteractMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-page-setup"[^>]*data-wo-cmd="btn-page-setup"[^>]*data-wo-interact="opens:modal"[^>]*>.*?id="btn-page-setup"/s,
)
assert.ok(btnPageSetupInteractMatch, 'btn-page-setup span must have data-wo-interact="opens:modal"')
console.log('ok 3 btn-page-setup span has data-wo-interact="opens:modal"')

// The btn-page-setup must be in the layout tab section
const layoutTabMatch = htmlSrc.match(
  /<div class="ribbon-page"[^>]*data-tab="layout"[^>]*>.*?id="btn-page-setup".*?<\/div>/s,
)
assert.ok(layoutTabMatch, "btn-page-setup must be in the layout tab")
console.log("ok 4 btn-page-setup is in the layout tab")

// The page setup dialog must exist (modal overlay)
assert.ok(htmlSrc.includes('id="page-setup-dialog"'), "page-setup-dialog must exist in index.html")
console.log("ok 5 page-setup-dialog exists")

// The page-setup-dialog must be a modal (dialog-overlay with aria-modal="true")
const pageSetupDialogMatch = htmlSrc.match(
  /id="page-setup-dialog"[^>]*class="dialog-overlay"[^>]*aria-modal="true"/,
)
assert.ok(pageSetupDialogMatch, "page-setup-dialog must be a modal overlay with aria-modal=true")
console.log("ok 6 page-setup-dialog is a modal overlay")

// editor.js must have btn-page-setup element access
assert.ok(
  editorSrc.includes('getElementById("btn-page-setup")'),
  "btn-page-setup element must be accessed in editor.js",
)
console.log("ok 7 btn-page-setup element is accessed in editor.js")

// editor.js must wire btn-page-setup click to open page-setup-dialog
assert.ok(
  editorSrc.includes("page-setup-dialog") &&
    editorSrc.includes('getElementById("btn-page-setup")') &&
    editorSrc.includes('.addEventListener("click"'),
  "btn-page-setup must have click handler to open page-setup-dialog",
)
console.log("ok 8 btn-page-setup click handler opens page-setup-dialog")

// i18n must have Layout.PageSetup key
assert.ok(i18nSrc.includes('"Layout.PageSetup"'), "Layout.PageSetup i18n key must exist")
console.log("ok 9 Layout.PageSetup i18n key exists")

// Verify the page setup dialog contains orientation controls
assert.ok(
  htmlSrc.includes('id="ps-orient-portrait"') || htmlSrc.includes('name="ps-orient"'),
  "page-setup-dialog must contain orientation controls",
)
console.log("ok 10 page-setup-dialog contains orientation controls")

console.log("\nAll WO-14-orientation interact census tests passed!\n")
console.log("orientation-PASS")

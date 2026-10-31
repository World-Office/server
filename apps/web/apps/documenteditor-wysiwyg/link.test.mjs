/**
 * WO-11-link: census-artifact (insert tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-link is included in the interact census with opens:modal
 * behavior, matching OnlyOffice parity (slugs:link).
 *
 * Run with: node link.test.mjs
 * Success: prints "link-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-11-link interact census tests...\n")

// The btn-link button must exist in the insert tab
assert.ok(htmlSrc.includes('id="btn-link"'), "btn-link button must exist in index.html")
console.log("ok 1 btn-link button exists")

// The btn-link must be wrapped in a span with data-wo-interact="opens:modal"
const btnLinkMatch = htmlSrc.match(
  /<span[^>]*data-wo-interact="opens:modal"[^>]*>.*?id="btn-link"/s,
)
assert.ok(btnLinkMatch, 'btn-link must be inside a span with data-wo-interact="opens:modal"')
console.log("ok 2 btn-link is in interact census with opens:modal")

// The btn-link must be in the insert tab section
const insertTabMatch = htmlSrc.match(
  /<div class="ribbon-page"[^>]*data-tab="insert"[^>]*>.*?id="btn-link".*?<\/div>/s,
)
assert.ok(insertTabMatch, "btn-link must be in the insert tab")
console.log("ok 3 btn-link is in the insert tab")

// The link dialog must exist (modal overlay)
assert.ok(htmlSrc.includes('id="link-dialog"'), "link-dialog must exist in index.html")
console.log("ok 4 link-dialog exists")

// The link dialog must be a modal (dialog-overlay with aria-modal="true")
const linkDialogMatch = htmlSrc.match(
  /id="link-dialog"[^>]*class="dialog-overlay"[^>]*aria-modal="true"/,
)
assert.ok(linkDialogMatch, "link-dialog must be a modal overlay with aria-modal=true")
console.log("ok 5 link-dialog is a modal overlay")

// The link dialog must have URL input
assert.ok(
  htmlSrc.includes('id="link-url"') && htmlSrc.includes('type="url"'),
  "link-dialog must have URL input field",
)
console.log("ok 6 link-dialog has URL input field")

// The link dialog must have Insert and Cancel buttons
assert.ok(
  htmlSrc.includes('id="btn-link-ok"') && htmlSrc.includes('id="btn-link-cancel"'),
  "link-dialog must have Insert and Cancel buttons",
)
console.log("ok 7 link-dialog has Insert and Cancel buttons")

// editor.js must have insertLink function that opens the dialog
assert.ok(
  editorSrc.includes("function insertLink()"),
  "insertLink function must exist in editor.js",
)
console.log("ok 8 insertLink function exists in editor.js")

// editor.js must wire btn-link click to insertLink
assert.ok(
  editorSrc.includes('getElementById("btn-link")') &&
    editorSrc.includes('addEventListener("click", insertLink)'),
  "btn-link must have click handler wired to insertLink",
)
console.log("ok 9 btn-link click handler is wired to insertLink")

// i18n must have InsertLinkTitle key
assert.ok(
  i18nSrc.includes('"Toolbar.InsertLinkTitle"'),
  "Toolbar.InsertLinkTitle i18n key must exist",
)
console.log("ok 10 Toolbar.InsertLinkTitle i18n key exists")

console.log("\nAll WO-11-link interact census tests passed!\n")
console.log("link-PASS")

/**
 * WO-15-footnote: census-artifact (references tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-footnote is included in the interact census with opens:modal
 * behavior, matching OnlyOffice parity (slugs:footnote).
 *
 * Run with: node footnote.test.mjs
 * Success: prints "footnote-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-15-footnote interact census tests...\n")

// The btn-footnote button must exist in the references tab
assert.ok(htmlSrc.includes('id="btn-footnote"'), "btn-footnote button must exist in index.html")
console.log("ok 1 btn-footnote button exists")

// The btn-footnote must be wrapped in a span with data-wo-interact="opens:modal"
const btnFootnoteMatch = htmlSrc.match(
  /<span[^>]*data-wo-interact="opens:modal"[^>]*>.*?id="btn-footnote"/s,
)
assert.ok(
  btnFootnoteMatch,
  'btn-footnote must be inside a span with data-wo-interact="opens:modal"',
)
console.log("ok 2 btn-footnote is in interact census with opens:modal")

// The btn-footnote must be in the references tab section
const referencesTabMatch = htmlSrc.match(
  /<div class="ribbon-page"[^>]*data-tab="references"[^>]*>.*?id="btn-footnote".*?<\/div>/s,
)
assert.ok(referencesTabMatch, "btn-footnote must be in the references tab")
console.log("ok 3 btn-footnote is in the references tab")

// The notes dialog must exist (modal overlay)
assert.ok(htmlSrc.includes('id="notes-dialog"'), "notes-dialog must exist in index.html")
console.log("ok 4 notes-dialog exists")

// The notes dialog must be a modal (dialog-overlay with aria-modal="true")
const notesDialogMatch = htmlSrc.match(
  /id="notes-dialog"[^>]*class="dialog-overlay"[^>]*aria-modal="true"/,
)
assert.ok(notesDialogMatch, "notes-dialog must be a modal overlay with aria-modal=true")
console.log("ok 5 notes-dialog is a modal overlay")

// The btn-footnote must be wired to open the notes-dialog in editor.js
assert.ok(
  editorSrc.includes("btn-footnote") &&
    editorSrc.includes("notes-dialog") &&
    editorSrc.includes("openOverlayDialog"),
  "btn-footnote must be wired to open notes-dialog",
)
console.log("ok 6 btn-footnote is wired to open notes-dialog")

// The notes dialog must have footnote type selection
assert.ok(htmlSrc.includes('id="notes-type"'), "notes-dialog must have type selection")
console.log("ok 7 notes-dialog has type selection")

// i18n must have FootnoteTitle key
assert.ok(i18nSrc.includes('"Toolbar.FootnoteTitle"'), "Toolbar.FootnoteTitle i18n key must exist")
console.log("ok 8 Toolbar.FootnoteTitle i18n key exists")

console.log("\nAll WO-15-footnote interact census tests passed!\n")
console.log("footnote-PASS")

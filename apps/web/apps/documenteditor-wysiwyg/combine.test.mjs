/**
 * WO-17-combine: missing-feature (collaboration tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the document combining feature is implemented:
 * - Combine dialog exists in index.html with proper structure
 * - i18n strings are present in i18n.js
 * - Editor has combine functions (openCombineDialog, combineDocuments, etc.)
 * - wo-bridge has the combine endpoint
 *
 * Run with: node combine.test.mjs
 * Success: prints "combine-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const bridgePath = new URL("./wo-bridge.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")
const bridgeSrc = readFileSync(bridgePath, "utf-8")

console.log("Running WO-17-combine tests...\n")

// ── HTML: combine dialog structure ──────────────────────────────────

// The combine dialog must exist
assert.ok(htmlSrc.includes('id="combine-dialog"'), "Combine dialog must exist in index.html")
console.log("ok 1 combine-dialog element exists")

// The combine dialog must be a modal overlay
assert.ok(
  htmlSrc.includes('id="combine-dialog"') &&
    htmlSrc.includes('class="dialog-overlay"', htmlSrc.indexOf('id="combine-dialog"')),
  "Combine dialog must have dialog-overlay class",
)
console.log("ok 2 combine-dialog has dialog-overlay class")

// The combine dialog must have a title element
assert.ok(htmlSrc.includes('id="combine-dialog-title"'), "Combine dialog must have title element")
console.log("ok 3 combine-dialog-title element exists")

// The combine dialog must have a title with data-i18n
assert.ok(
  htmlSrc.includes('id="combine-dialog-title"') &&
    htmlSrc.includes('data-i18n="Combine.Title"', htmlSrc.indexOf('id="combine-dialog-title"')),
  "Combine dialog title must have i18n attribute",
)
console.log("ok 4 combine-dialog-title has i18n attribute")

// The combine dialog must have a document select dropdown (multiple selection)
assert.ok(
  htmlSrc.includes('id="combine-document-select"'),
  "Combine dialog must have document select element",
)
console.log("ok 5 combine-document-select element exists")

// The combine dialog must have a multiple select
assert.ok(
  htmlSrc.includes('id="combine-document-select"') &&
    htmlSrc.includes("multiple", htmlSrc.indexOf('id="combine-document-select"')),
  "Combine dialog select must support multiple selection",
)
console.log("ok 6 combine-document-select has multiple attribute")

// The combine dialog must have a label for the select
assert.ok(
  htmlSrc.includes('for="combine-document-select"'),
  "Combine dialog must have label for document select",
)
console.log("ok 7 document select has label")

// The combine dialog must have a Cancel button
assert.ok(htmlSrc.includes('id="btn-combine-cancel"'), "Combine dialog must have Cancel button")
console.log("ok 8 btn-combine-cancel exists")

// The combine dialog must have an Apply/Combine button
assert.ok(htmlSrc.includes('id="btn-combine-apply"'), "Combine dialog must have Apply button")
console.log("ok 9 btn-combine-apply exists")

// The combine dialog must have an error element
assert.ok(htmlSrc.includes('id="combine-error"'), "Combine dialog must have error element")
console.log("ok 10 combine-error element exists")

// The collaboration tab must have a Combine button
assert.ok(
  htmlSrc.includes('data-cmd="combineRevisions"') && htmlSrc.includes('data-i18n="Collab.Combine"'),
  "Collaboration tab must have Combine button",
)
console.log("ok 11 collaboration tab Combine button exists")

// ── i18n: translation strings ───────────────────────────────────────

// Combine i18n strings must exist
const combineStrings = [
  "Combine.Title",
  "Combine.SelectDocuments",
  "Combine.SelectOption",
  "Combine.Apply",
  "Combine.LoadError",
  "Combine.NoDocumentSelected",
  "Combine.Combining",
  "Combine.Complete",
  "Combine.NoDiff",
  "Combine.Error",
]

for (const str of combineStrings) {
  assert.ok(i18nSrc.includes(`"${str}":`), `i18n must include "${str}" string`)
}
console.log("ok 12 all Combine i18n strings exist")

// German translations must exist
const combineStringsDe = [
  "Dokumente kombinieren",
  "Dokumente zum Kombinieren auswählen",
  "Kombinieren",
]

for (const str of combineStringsDe) {
  assert.ok(i18nSrc.includes(`"${str}"`), `i18n must include German translation: "${str}"`)
}
console.log("ok 13 German Combine i18n strings exist")

// ── Editor.js: combine functions ──────────────────────────────────

// combineDialog variable must exist
assert.ok(
  editorSrc.includes('combineDialog = document.getElementById("combine-dialog")'),
  "Editor must have combineDialog variable",
)
console.log("ok 14 combineDialog variable exists")

// combineDocumentSelect variable must exist
assert.ok(
  editorSrc.includes('combineDocumentSelect = document.getElementById("combine-document-select")'),
  "Editor must have combineDocumentSelect variable",
)
console.log("ok 15 combineDocumentSelect variable exists")

// openCombineDialog function must exist
assert.ok(
  editorSrc.includes("function openCombineDialog(") || editorSrc.includes("openCombineDialog()"),
  "Editor must have openCombineDialog function",
)
console.log("ok 16 openCombineDialog function exists")

// closeCombineDialog function must exist
assert.ok(
  editorSrc.includes("function closeCombineDialog(") || editorSrc.includes("closeCombineDialog()"),
  "Editor must have closeCombineDialog function",
)
console.log("ok 17 closeCombineDialog function exists")

// combineDocuments function must exist
assert.ok(
  editorSrc.includes("function combineDocuments(") ||
    editorSrc.includes("async function combineDocuments("),
  "Editor must have combineDocuments function",
)
console.log("ok 18 combineDocuments function exists")

// combineDocuments must call the combine API endpoint
assert.ok(editorSrc.includes('api("combine'), "Editor must call combine API endpoint")
console.log("ok 19 combine API endpoint is called")

// combineDocuments must use getAll or selectedOptions for multiple selection
assert.ok(
  editorSrc.includes("selectedOptions") && editorSrc.includes("map"),
  "Editor must handle multiple selected documents",
)
console.log("ok 20 multiple document selection is handled")

// combineDocuments must use loadDocumentHTML
assert.ok(editorSrc.includes("loadDocumentHTML"), "Editor must have loadDocumentHTML function")
console.log("ok 21 loadDocumentHTML function exists")

// loadDocumentHTML must accept isCompare parameter
assert.ok(
  editorSrc.includes("loadDocumentHTML(html, true") ||
    editorSrc.includes("loadDocumentHTML(data.html, true") ||
    editorSrc.match(/loadDocumentHTML\([^,)]+,\s*true\)/),
  "Editor must call loadDocumentHTML with isCompare parameter",
)
console.log("ok 22 loadDocumentHTML called with isCompare flag")

// openCombineView function must exist
assert.ok(
  editorSrc.includes("function openCombineView(") || editorSrc.includes("openCombineView()"),
  "Editor must have openCombineView function",
)
console.log("ok 23 openCombineView function exists")

// openCombineView must call openCombineDialog
assert.ok(
  editorSrc.includes("openCombineDialog") &&
    editorSrc.includes("openCombineView") &&
    editorSrc.indexOf("openCombineDialog") > editorSrc.indexOf("openCombineView") - 200,
  "openCombineView must call openCombineDialog",
)
console.log("ok 24 openCombineView calls openCombineDialog")

// combine-dialog must be in DIALOG_IDS
assert.ok(editorSrc.includes('"combine-dialog"'), "combine-dialog must be in DIALOG_IDS")
console.log("ok 25 combine-dialog in DIALOG_IDS")

// closeCombineDialog must be in DIALOG_CLOSE mapping
assert.ok(
  editorSrc.includes('"combine-dialog": closeCombineDialog'),
  "closeCombineDialog must be in DIALOG_CLOSE mapping",
)
console.log("ok 26 closeCombineDialog in DIALOG_CLOSE")

// Event listeners for combine dialog buttons must be registered
assert.ok(
  editorSrc.includes("btnCombineCancel") &&
    editorSrc.includes("addEventListener") &&
    editorSrc.includes("closeCombineDialog"),
  "Event listener for Cancel button must be registered",
)
console.log("ok 27 Cancel button event listener registered")

assert.ok(
  editorSrc.includes("btnCombineApply") &&
    editorSrc.includes("addEventListener") &&
    editorSrc.includes("combineDocuments"),
  "Event listener for Apply button must be registered",
)
console.log("ok 28 Apply button event listener registered")

// combineRevisions command must call openCombineView
assert.ok(
  editorSrc.includes('cmd === "combineRevisions"') && editorSrc.includes("openCombineView()"),
  "combineRevisions command must call openCombineView",
)
console.log("ok 29 combineRevisions command calls openCombineView")

// ── wo-bridge.js: combine endpoint ────────────────────────────────

// The combine endpoint must be handled in wo-bridge
assert.ok(bridgeSrc.includes('ep === "combine"'), "wo-bridge must handle combine endpoint")
console.log("ok 30 combine endpoint handled in wo-bridge")

// The combine endpoint must extract the docs parameter
assert.ok(bridgeSrc.includes('getAll("docs")'), "wo-bridge combine must extract docs parameter")
console.log("ok 31 combine endpoint extracts docs parameter")

// The combine endpoint must validate docs parameter
assert.ok(
  bridgeSrc.includes("if (!docIds || docIds.length === 0)") &&
    bridgeSrc.includes('ep === "combine"'),
  "wo-bridge combine must validate docs parameter",
)
console.log("ok 32 combine endpoint validates docs parameter")

// The combine endpoint must return HTML (check in the combine block)
const combineBlockStart = bridgeSrc.indexOf('ep === "combine"')
const combineBlockEnd =
  bridgeSrc.indexOf("// collab/* passes through", combineBlockStart) ||
  bridgeSrc.indexOf("if (ep.indexOf", combineBlockStart)
const combineBlock = bridgeSrc.slice(combineBlockStart, combineBlockEnd)
assert.ok(
  combineBlock.includes("html:") && combineBlock.includes("return jres("),
  "wo-bridge combine must return HTML",
)
console.log("ok 33 combine endpoint returns HTML")

// The combine endpoint must return tracked changes (ins/del)
assert.ok(
  bridgeSrc.includes("track-insert") && bridgeSrc.includes("track-delete"),
  "wo-bridge combine must return tracked changes",
)
console.log("ok 34 combine endpoint returns tracked changes")

console.log("\nAll WO-17-combine tests passed!\ncombine-PASS")

/**
 * WO-11-compare: missing-feature (collaboration tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the document comparison feature is implemented:
 * - Compare dialog exists in index.html with proper structure
 * - i18n strings are present in i18n.js
 * - Editor has compare functions (openCompareDialog, compareDocuments, etc.)
 * - wo-bridge has the compare endpoint
 *
 * Run with: node compare.test.mjs
 * Success: prints "compare-PASS" and exits 0.
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

console.log("Running WO-11-compare tests...\n")

// ── HTML: compare dialog structure ──────────────────────────────────

// The compare dialog must exist
assert.ok(htmlSrc.includes('id="compare-dialog"'), "Compare dialog must exist in index.html")
console.log("ok 1 compare-dialog element exists")

// The compare dialog must be a modal overlay
assert.ok(
  htmlSrc.includes('id="compare-dialog"') &&
    htmlSrc.includes('class="dialog-overlay"', htmlSrc.indexOf('id="compare-dialog"')),
  "Compare dialog must have dialog-overlay class",
)
console.log("ok 2 compare-dialog has dialog-overlay class")

// The compare dialog must have a title element
assert.ok(htmlSrc.includes('id="compare-dialog-title"'), "Compare dialog must have title element")
console.log("ok 3 compare-dialog-title element exists")

// The compare dialog must have a title with data-i18n
assert.ok(
  htmlSrc.includes('id="compare-dialog-title"') &&
    htmlSrc.includes('data-i18n="Compare.Title"', htmlSrc.indexOf('id="compare-dialog-title"')),
  "Compare dialog title must have i18n attribute",
)
console.log("ok 4 compare-dialog-title has i18n attribute")

// The compare dialog must have a document select dropdown
assert.ok(
  htmlSrc.includes('id="compare-document-select"'),
  "Compare dialog must have document select element",
)
console.log("ok 5 compare-document-select element exists")

// The compare dialog must have a label for the select
assert.ok(
  htmlSrc.includes('for="compare-document-select"'),
  "Compare dialog must have label for document select",
)
console.log("ok 6 document select has label")

// The compare dialog must have a Cancel button
assert.ok(htmlSrc.includes('id="btn-compare-cancel"'), "Compare dialog must have Cancel button")
console.log("ok 7 btn-compare-cancel exists")

// The compare dialog must have an Apply/Compare button
assert.ok(htmlSrc.includes('id="btn-compare-apply"'), "Compare dialog must have Apply button")
console.log("ok 8 btn-compare-apply exists")

// The compare dialog must have an error element
assert.ok(htmlSrc.includes('id="compare-error"'), "Compare dialog must have error element")
console.log("ok 9 compare-error element exists")

// The collaboration tab must have a Compare button
assert.ok(
  htmlSrc.includes('data-cmd="compareVersion"') && htmlSrc.includes('data-i18n="Collab.Compare"'),
  "Collaboration tab must have Compare button",
)
console.log("ok 10 collaboration tab Compare button exists")

// ── i18n: translation strings ───────────────────────────────────────

// Compare i18n strings must exist
const compareStrings = [
  "Compare.Title",
  "Compare.SelectDocument",
  "Compare.SelectOption",
  "Compare.Apply",
  "Compare.LoadError",
  "Compare.NoDocumentSelected",
  "Compare.Comparing",
  "Compare.Complete",
  "Compare.NoDiff",
  "Compare.Error",
]

for (const str of compareStrings) {
  assert.ok(i18nSrc.includes(`"${str}":`), `i18n must include "${str}" string`)
}
console.log("ok 11 all Compare i18n strings exist")

// ── Editor.js: compare functions ────────────────────────────────────

// compareDialog variable must exist
assert.ok(
  editorSrc.includes('compareDialog = document.getElementById("compare-dialog")'),
  "Editor must have compareDialog variable",
)
console.log("ok 12 compareDialog variable exists")

// compareDocumentSelect variable must exist
assert.ok(
  editorSrc.includes('compareDocumentSelect = document.getElementById("compare-document-select")'),
  "Editor must have compareDocumentSelect variable",
)
console.log("ok 13 compareDocumentSelect variable exists")

// openCompareDialog function must exist
assert.ok(
  editorSrc.includes("function openCompareDialog(") || editorSrc.includes("openCompareDialog()"),
  "Editor must have openCompareDialog function",
)
console.log("ok 14 openCompareDialog function exists")

// closeCompareDialog function must exist
assert.ok(
  editorSrc.includes("function closeCompareDialog(") || editorSrc.includes("closeCompareDialog()"),
  "Editor must have closeCompareDialog function",
)
console.log("ok 15 closeCompareDialog function exists")

// compareDocuments function must exist
assert.ok(
  editorSrc.includes("function compareDocuments(") ||
    editorSrc.includes("async function compareDocuments("),
  "Editor must have compareDocuments function",
)
console.log("ok 16 compareDocuments function exists")

// compareDocuments must call the compare API endpoint
assert.ok(editorSrc.includes('api("compare'), "Editor must call compare API endpoint")
console.log("ok 17 compare API endpoint is called")

// compareDocuments must use loadDocumentHTML
assert.ok(editorSrc.includes("loadDocumentHTML"), "Editor must have loadDocumentHTML function")
console.log("ok 18 loadDocumentHTML function exists")

// loadDocumentHTML must accept isCompare parameter
assert.ok(
  editorSrc.includes("loadDocumentHTML(html, isCompare") ||
    editorSrc.includes("loadDocumentHTML(data.html, true") ||
    editorSrc.match(/loadDocumentHTML\([^,)]+,\s*true\)/),
  "Editor must call loadDocumentHTML with isCompare parameter",
)
console.log("ok 19 loadDocumentHTML called with isCompare flag")

// compare-dialog must be in DIALOG_IDS
assert.ok(editorSrc.includes('"compare-dialog"'), "compare-dialog must be in DIALOG_IDS")
console.log("ok 20 compare-dialog in DIALOG_IDS")

// closeCompareDialog must be in DIALOG_CLOSE
assert.ok(
  editorSrc.includes('"compare-dialog": closeCompareDialog'),
  "closeCompareDialog must be in DIALOG_CLOSE mapping",
)
console.log("ok 21 closeCompareDialog in DIALOG_CLOSE")

// Event listeners for compare dialog buttons must be registered
assert.ok(
  editorSrc.includes("btnCompareCancel") &&
    editorSrc.includes("addEventListener") &&
    editorSrc.includes("closeCompareDialog"),
  "Event listener for Cancel button must be registered",
)
console.log("ok 22 Cancel button event listener registered")

assert.ok(
  editorSrc.includes("btnCompareApply") &&
    editorSrc.includes("addEventListener") &&
    editorSrc.includes("compareDocuments"),
  "Event listener for Apply button must be registered",
)
console.log("ok 23 Apply button event listener registered")

// ── wo-bridge.js: compare endpoint ──────────────────────────────────

// The compare endpoint must be handled in wo-bridge
assert.ok(bridgeSrc.includes('ep === "compare"'), "wo-bridge must handle compare endpoint")
console.log("ok 24 compare endpoint handled in wo-bridge")

// The compare endpoint must extract the other parameter
assert.ok(bridgeSrc.includes('other")'), "wo-bridge compare must extract other parameter")
console.log("ok 25 compare endpoint extracts other parameter")

// The compare endpoint must return HTML (check in the compare block)
const compareBlockStart = bridgeSrc.indexOf('ep === "compare"')
const compareBlockEnd =
  bridgeSrc.indexOf("// collab/* passes through", compareBlockStart) ||
  bridgeSrc.indexOf("if (ep.indexOf", compareBlockStart)
const compareBlock = bridgeSrc.slice(compareBlockStart, compareBlockEnd)
assert.ok(
  compareBlock.includes("html:") && compareBlock.includes("return jres("),
  "wo-bridge compare must return HTML",
)
console.log("ok 26 compare endpoint returns HTML")

// The compare endpoint must return tracked changes (ins/del)
assert.ok(
  bridgeSrc.includes("track-insert") || bridgeSrc.includes("<ins") || bridgeSrc.includes("<del"),
  "wo-bridge compare must return tracked changes",
)
console.log("ok 27 compare endpoint returns tracked changes")

console.log("\nAll WO-11-compare tests passed!\ncompare-PASS")

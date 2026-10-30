/**
 * WO-5: Update Table command opens a modal with options
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the Update Table command (in the References tab) opens
 * a modal dialog with options to update the entire table or only page
 * numbers, matching OnlyOffice parity.
 *
 * Run with: node update-table.test.mjs
 * Success: prints "UPDATE-TABLE-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")

console.log("Running WO-5 update-table tests...\n")

// Update Table button exists in References tab
assert.ok(
  htmlSrc.includes('data-cmd="updateToc"') && htmlSrc.includes('data-i18n="Ref.UpdateTable"'),
  "WO-5: Update table button must exist in index.html with correct command and i18n key",
)

// Update Table command handler
assert.ok(
  editorSrc.includes('cmd === "updateToc"'),
  "WO-5: updateToc command handler must exist in editor.js",
)
assert.ok(
  editorSrc.includes("openUpdateTocDialog()"),
  "WO-5: updateToc handler must call openUpdateTocDialog()",
)

// Modal dialog definition
assert.ok(
  editorSrc.includes("function openUpdateTocDialog()"),
  "WO-5: openUpdateTocDialog function must be defined",
)
assert.ok(
  editorSrc.includes('openOverlayDialog("updatetoc-dialog")'),
  "WO-5: openUpdateTocDialog must open the updatetoc-dialog overlay",
)

// Modal dialog HTML
assert.ok(
  htmlSrc.includes('id="updatetoc-dialog"'),
  "WO-5: updatetoc-dialog must exist in index.html",
)
assert.ok(
  htmlSrc.includes('id="toc-update"'),
  "WO-5: toc-update select element must exist in the dialog",
)

// Dialog options
assert.ok(
  htmlSrc.includes('value="entire"') && htmlSrc.includes("Update entire table"),
  "WO-5: Dialog must have option to update entire table",
)
assert.ok(
  htmlSrc.includes('value="pages"') && htmlSrc.includes("Update page numbers only"),
  "WO-5: Dialog must have option to update page numbers only",
)

// Dialog buttons
assert.ok(
  htmlSrc.includes('id="btn-updatetoc-ok"'),
  "WO-5: Confirm button (btn-updatetoc-ok) must exist",
)
assert.ok(
  htmlSrc.includes('id="btn-updatetoc-close"'),
  "WO-5: Cancel button (btn-updatetoc-close) must exist",
)

// Confirm handler
assert.ok(
  editorSrc.includes("function confirmUpdateTocDialog()"),
  "WO-5: confirmUpdateTocDialog function must be defined",
)
assert.ok(
  editorSrc.includes('document.getElementById("toc-update")') && editorSrc.includes(".value"),
  "WO-5: confirm handler must read the selected option value",
)
assert.ok(editorSrc.includes("refreshToc()"), "WO-5: confirm handler must call refreshToc()")

// Choice affects behavior
assert.ok(
  editorSrc.includes('choice === "pages"') &&
    editorSrc.includes("Page numbers updated") &&
    editorSrc.includes("TOC updated"),
  "WO-5: confirm handler must set different status messages for pages vs entire",
)

// Dialog wiring
assert.ok(
  editorSrc.includes('["updatetoc", confirmUpdateTocDialog]'),
  "WO-5: updatetoc dialog must be wired in ROUND2 loop with confirm handler",
)

console.log("All WO-5 update-table tests passed!\n")
console.log("UPDATE-TABLE-PASS")

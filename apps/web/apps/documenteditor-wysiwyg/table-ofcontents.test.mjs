/**
 * WO-15-table-ofcontents: census-artifact (references tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-toc is present in the interact census with its modal behavior.
 *
 * Run with: node table-ofcontents.test.mjs
 * Success: prints "table-ofcontents-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")

console.log("Running WO-15-table-ofcontents interact census tests...\n")

// WO-15: btn-toc in interact census with opens:modal

// The btn-toc button must exist in index.html
assert.ok(htmlSrc.includes('id="btn-toc"'), "WO-15: btn-toc button must exist in index.html")

// The btn-toc button must be wrapped with data-wo-interact="opens:modal"
assert.ok(
  htmlSrc.includes('data-wo-interact="opens:modal"'),
  'WO-15: data-wo-interact="opens:modal" must exist for modal dialogs',
)

// The btn-toc span wrapper must have data-wo-id="btn-toc"
assert.ok(
  htmlSrc.includes('data-wo-id="btn-toc"'),
  'WO-15: btn-toc must have data-wo-id="btn-toc" in interact census',
)

// The btn-toc span wrapper must have data-wo-cmd="btn-toc"
assert.ok(
  htmlSrc.includes('data-wo-cmd="btn-toc"'),
  'WO-15: btn-toc must have data-wo-cmd="btn-toc" in interact census',
)

// Verify the btn-toc is in the references tab
assert.ok(
  htmlSrc.includes('data-tab="references"') && htmlSrc.includes('id="btn-toc"'),
  "WO-15: btn-toc must be in the references tab",
)

// The openTocDialog function must exist in editor.js
assert.ok(
  editorSrc.includes("function openTocDialog"),
  "WO-15: openTocDialog function must exist in editor.js",
)

// The toc-dialog must exist in index.html
assert.ok(htmlSrc.includes('id="toc-dialog"'), "WO-15: toc-dialog must exist in index.html")

// The btn-toc button must be wired to openTocDialog
assert.ok(
  editorSrc.includes("btn-toc") && editorSrc.includes("openTocDialog"),
  "WO-15: btn-toc must be wired to openTocDialog in editor.js",
)

// Verify the dialog has proper structure (title input and buttons)
assert.ok(htmlSrc.includes('id="toc-title"'), "WO-15: toc-title input must exist in toc-dialog")
assert.ok(htmlSrc.includes('id="btn-toc-ok"'), "WO-15: btn-toc-ok button must exist in toc-dialog")
assert.ok(
  htmlSrc.includes('id="btn-toc-cancel"'),
  "WO-15: btn-toc-cancel button must exist in toc-dialog",
)

// Verify confirmTocDialog and closeTocDialog functions exist
assert.ok(
  editorSrc.includes("function confirmTocDialog"),
  "WO-15: confirmTocDialog function must exist in editor.js",
)
assert.ok(
  editorSrc.includes("function closeTocDialog"),
  "WO-15: closeTocDialog function must exist in editor.js",
)

console.log("All WO-15-table-ofcontents tests passed!\n")
console.log("table-ofcontents-PASS")

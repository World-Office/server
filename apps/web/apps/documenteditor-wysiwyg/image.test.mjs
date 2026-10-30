/**
 * WO-7-image: divergent-behavior (header-footer tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the Header/Footer Image button opens the comprehensive
 * image insertion modal (parity with OnlyOffice).
 *
 * Run with: node image.test.mjs
 * Success: prints "IMAGE-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")

console.log("Running WO-7-image header/footer image modal tests...\n")

// The Header/Footer ribbon tab must exist
assert.ok(
  htmlSrc.includes('data-tab="header-footer"'),
  "Header/Footer ribbon tab must exist in index.html",
)

// The btn-hf-image button must exist in the header-footer ribbon
assert.ok(htmlSrc.includes('id="btn-hf-image"'), "btn-hf-image button must exist in index.html")

// The btn-hf-image button must have the Image label
assert.ok(htmlSrc.includes('data-i18n="HF.Image"'), "btn-hf-image must have HF.Image i18n label")

// The image insertion modal (image-dialog) must exist
assert.ok(htmlSrc.includes('id="image-dialog"'), "image-dialog modal must exist in index.html")

// The image-dialog must support file selection
assert.ok(htmlSrc.includes('id="image-file"'), "image-file input must exist in the image-dialog")

// The image-dialog must support sizing options
assert.ok(htmlSrc.includes('id="image-width"'), "image-width input must exist in the image-dialog")
assert.ok(
  htmlSrc.includes('id="image-height"'),
  "image-height input must exist in the image-dialog",
)

// The image-dialog must have preview capability
assert.ok(
  htmlSrc.includes('id="image-preview"'),
  "image-preview element must exist in the image-dialog",
)

// The insertImage function must exist in editor.js
assert.ok(
  editorSrc.includes("function insertImage()"),
  "insertImage function must exist in editor.js",
)

// The insertImage function must open the image-dialog
assert.ok(
  editorSrc.includes('document.getElementById("image-dialog")') &&
    editorSrc.includes('classList.add("open")'),
  "insertImage must open the image-dialog modal",
)

// The btn-hf-image must be wired to insertImage (not just a marker event)
assert.ok(
  editorSrc.includes("btn-hf-image") &&
    editorSrc.includes('addEventListener("click", insertImage)'),
  "btn-hf-image must be wired to insertImage function",
)

// The old marker-only pattern should NOT exist for hfImage
assert.ok(
  !editorSrc.includes('"wo:header-image"'),
  "Old marker-only wo:header-image event should be removed",
)

// Verify that insertImage handles READ_ONLY check
const insertImageStart = editorSrc.indexOf("function insertImage()")
assert.ok(
  editorSrc.substring(insertImageStart, insertImageStart + 200).includes("READ_ONLY"),
  "insertImage must check READ_ONLY mode",
)

console.log("All WO-7-image tests passed!\n")
console.log("IMAGE-PASS")

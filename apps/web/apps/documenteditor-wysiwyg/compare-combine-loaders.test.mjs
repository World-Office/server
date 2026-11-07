/**
 * L2M-02: compare/combine document loaders accept the array shape
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * GET /api/documents answers a TOP-LEVEL array of {id,name,size} objects
 * (wo-docserver store.list / document_list). The Compare and Combine dialog
 * loaders used to parse data.documents only, so the selects stayed empty on
 * the real backend and the apply buttons took the no-document-selected error
 * path. Verifies both loaders tolerate the array shape (and keep the wrapped
 * {documents:[…]} shape working for older hosts).
 *
 * Run with: node compare-combine-loaders.test.mjs
 * Success: prints "compare-combine-loaders-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")

console.log("Running L2M-02 compare/combine loader shape tests...\n")

// Both loaders must exist
assert.ok(
  editorSrc.includes("async function loadCompareDocuments()"),
  "loadCompareDocuments must exist in editor.js",
)
assert.ok(
  editorSrc.includes("async function loadCombineDocuments()"),
  "loadCombineDocuments must exist in editor.js",
)
console.log("ok 1 compare/combine loaders exist")

// Both loaders must accept the array shape (Array.isArray(data) ? data : …)
const arrayTolerant =
  /const docs = Array\.isArray\(data\) \? data : \(data\.documents \|\| \[\]\)/g
const hits = editorSrc.match(arrayTolerant) || []
assert.ok(
  hits.length === 2,
  `both loaders must parse Array.isArray(data) first (found ${hits.length})`,
)
console.log("ok 2 both loaders accept the top-level array shape")

// The wrapped {documents:[…]} fallback stays available for older hosts
assert.ok(
  editorSrc.includes("(data.documents || [])"),
  "loaders must keep the wrapped data.documents fallback",
)
console.log("ok 3 wrapped {documents:[…]} shape still tolerated")

// Loaders fetch the shared document list endpoint
assert.ok(
  (editorSrc.match(/await fetch\("\/api\/documents"\)/g) || []).length >= 2,
  "compare and combine loaders must both fetch /api/documents",
)
console.log("ok 4 loaders fetch /api/documents")

console.log("\nAll L2M-02 compare/combine loader shape tests passed!\n")
console.log("compare-combine-loaders-PASS")

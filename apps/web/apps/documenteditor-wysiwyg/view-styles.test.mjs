/**
 * F-111, F-113, F-052: Fit page width, Rulers/guides, Style gallery
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that editor.js and index.html contain the required wiring for
 * three view/styles features.
 *
 * Run with: node view-styles.test.mjs
 * Success: prints "VIEW-STYLES-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")

console.log("Running F-111/F-113/F-052 view-styles tests...\n")

// ── F-111: Fit page / fit width ─────────────────────────────────────

// The fit button must exist in index.html
assert.ok(
  htmlSrc.includes('id="btn-zoom-fit"'),
  "F-111: btn-zoom-fit button must exist in index.html",
)

// The fit handler must exist in editor.js and calculate zoom to fit page width
assert.ok(editorSrc.includes("btn-zoom-fit"), "F-111: btn-zoom-fit handler must exist in editor.js")
assert.ok(
  editorSrc.includes("zoomLevel = Math.min(2, Math.max(0.5, avail / 830))"),
  "F-111: fit page width zoom calculation must exist in editor.js",
)

// ── F-113: Rulers / guides ──────────────────────────────────────────

// The ruler toggle button must exist in index.html
assert.ok(
  htmlSrc.includes('id="btn-ruler-toggle"'),
  "F-113: btn-ruler-toggle button must exist in index.html",
)

// The ruler element must exist in index.html
assert.ok(htmlSrc.includes('class="ruler"'), "F-113: .ruler element must exist in index.html")

// The ruler toggle handler must exist in editor.js
assert.ok(
  editorSrc.includes("btn-ruler-toggle"),
  "F-113: ruler toggle handler must exist in editor.js",
)
assert.ok(
  editorSrc.includes("ruler.style.display"),
  "F-113: ruler display toggle must exist in editor.js",
)

// Ruler CSS must exist
// (checked in style.css, but we verify the ruler SVG track exists in index.html)
assert.ok(htmlSrc.includes("ruler-track"), "F-113: ruler-track element must exist in index.html")

// ── F-052: Style gallery (named styles) ─────────────────────────────

// The styles dropdown trigger must exist
assert.ok(
  htmlSrc.includes('class="styles-trigger"'),
  "F-052: styles-trigger dropdown must exist in index.html",
)
assert.ok(
  htmlSrc.includes('data-i18n="Home.Styles"'),
  "F-052: Home.Styles i18n label must exist in index.html",
)

// The dropdown must contain named style options (Normal, Title, Subtitle, H1-H3, Quote)
assert.ok(
  htmlSrc.includes('data-cmd="formatBlock" data-value="P"'),
  "F-052: Normal text (P) style must exist in the gallery",
)
assert.ok(
  htmlSrc.includes('data-cmd="formatBlock" data-value="H4"'),
  "F-052: Title (H4) style must exist in the gallery",
)
assert.ok(
  htmlSrc.includes('data-cmd="formatBlock" data-value="H5"'),
  "F-052: Subtitle (H5) style must exist in the gallery",
)
assert.ok(
  htmlSrc.includes('data-cmd="formatBlock" data-value="H1"'),
  "F-052: Heading 1 (H1) style must exist in the gallery",
)
assert.ok(
  htmlSrc.includes('data-cmd="formatBlock" data-value="BLOCKQUOTE"'),
  "F-052: Quote (BLOCKQUOTE) style must exist in the gallery",
)

// The converter (Rust) maps heading levels to named OOXML styles
// (Heading{level} → w:pStyle). This is verified by F-050's converter
// tests (test_docx_to_html_heading); F-052 is about the gallery surface.
const convertersPath = new URL("../../../../core/crates/wo-x2t/src/converters.rs", import.meta.url)
const convertersSrc = readFileSync(convertersPath, "utf-8")
assert.ok(
  convertersSrc.includes("Heading{"),
  "F-052: converter must map headings to Heading{n} named styles",
)

console.log("All F-111/F-113/F-052 tests passed!\n")
console.log("VIEW-STYLES-PASS")

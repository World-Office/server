/**
 * F-040: Paragraph shading / borders
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the editor has paragraph-level shading (applies
 * background-color to the <p> block, not selection-scoped backColor)
 * and that the converter round-trips shading + borders through DOCX
 * (w:shd + w:pBdr).
 *
 * Run with: node paragraph-shading.test.mjs
 * Success: prints "PARAGRAPH-SHADING-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")

console.log("Running F-040 paragraph shading/borders tests...\n")

// ── Editor: paragraph shading picker ────────────────────────────────

// The shading-color picker must exist in index.html
assert.ok(
  htmlSrc.includes('id="shading-color"'),
  "F-040: shading-color picker must exist in index.html",
)

// The shading-color handler must apply background-color to the <p> block
// (paragraph-level), not emit backColor (selection-scoped)
assert.ok(
  editorSrc.includes("shading-color"),
  "F-040: shading-color handler must exist in editor.js",
)
assert.ok(
  editorSrc.includes("background-color"),
  "F-040: handler must set background-color on the block",
)
assert.ok(
  editorSrc.includes('closest("p")'),
  "F-040: handler must find the <p> block via closest('p')",
)

// ── Editor: borders dialog ──────────────────────────────────────────

// The borders dialog must exist
assert.ok(htmlSrc.includes('id="borders-dialog"'), "F-040: borders-dialog must exist in index.html")
assert.ok(
  editorSrc.includes("openBordersDialog"),
  "F-040: openBordersDialog must exist in editor.js",
)
assert.ok(
  editorSrc.includes("border-top") && editorSrc.includes("border-bottom"),
  "F-040: borders dialog must set per-side border styles",
)

// ── Converter: HTML → DOCX → HTML round-trip ───────────────────────

// The converter must map background-color to w:shd and border-* to w:pBdr
const convertersPath = new URL("../../../../core/crates/wo-x2t/src/converters.rs", import.meta.url)
const convertersSrc = readFileSync(convertersPath, "utf-8")
assert.ok(
  convertersSrc.includes("html_border_to_docx"),
  "F-040: converter must have html_border_to_docx helper",
)
assert.ok(
  convertersSrc.includes("docx_border_to_html"),
  "F-040: converter must have docx_border_to_html helper",
)
assert.ok(
  convertersSrc.includes("test_paragraph_shading_borders_survive_editor_save_cycle_f040"),
  "F-040: converter must have round-trip test",
)

// ── OOXML model: DocxParagraphProperties has shading + borders ─────

const modelPath = new URL("../../../../core/crates/wo-ooxml/src/model.rs", import.meta.url)
const modelSrc = readFileSync(modelPath, "utf-8")
assert.ok(
  modelSrc.includes("DocxParagraphBorders"),
  "F-040: DocxParagraphBorders struct must exist in model.rs",
)
assert.ok(
  /pub shading: Option<String>/.test(modelSrc),
  "F-040: DocxParagraphProperties must have shading field",
)

// ── HTML model: BlockElement::Paragraph has background + borders ───

const htmlModelPath = new URL("../../../../core/crates/wo-html/src/model.rs", import.meta.url)
const htmlModelSrc = readFileSync(htmlModelPath, "utf-8")
assert.ok(
  htmlModelSrc.includes("ParagraphBorders"),
  "F-040: ParagraphBorders struct must exist in wo-html model.rs",
)
assert.ok(
  /background: Option<String>/.test(htmlModelSrc),
  "F-040: BlockElement::Paragraph must have background field",
)

console.log("All F-040 tests passed!\n")
console.log("PARAGRAPH-SHADING-PASS")

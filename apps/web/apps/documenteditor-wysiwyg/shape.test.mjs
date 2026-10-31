/**
 * WO-10-shape: missing-feature (insert tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the shape picker dialog and insertShape command exist
 * for inserting drawing shapes (e.g., rectangle) via wo-command.
 *
 * Run with: node shape.test.mjs
 * Success: prints "shape-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")

console.log("Running WO-10-shape shape picker tests...\n")

// The shape picker dialog must exist in index.html
assert.ok(htmlSrc.includes('id="shape-dialog"'), "shape-dialog must exist in index.html")

// The shape dialog must have a title
assert.ok(
  htmlSrc.includes('id="shape-dialog-title"'),
  "shape-dialog-title must exist in index.html",
)

// The shape dialog must have shape options (rectangle, circle, etc.)
assert.ok(
  htmlSrc.includes('data-shape-type="rectangle"') ||
    (htmlSrc.includes('value="rectangle"') && htmlSrc.includes('id="shape-dialog"')),
  "shape dialog must have rectangle shape option",
)

// Shape picker cancel button must exist
assert.ok(
  htmlSrc.includes('id="btn-shape-cancel"'),
  "btn-shape-cancel button must exist in index.html",
)

// Shape picker insert/ok button must exist
assert.ok(htmlSrc.includes('id="btn-shape-ok"'), "btn-shape-ok button must exist in index.html")

// The openShapePicker function must exist in editor.js
assert.ok(
  editorSrc.includes("function openShapePicker") ||
    (editorSrc.includes("openShapePicker") && editorSrc.includes("shape-dialog")),
  "openShapePicker function must exist in editor.js",
)

// The insertShape command handler must exist in runCommand
assert.ok(
  editorSrc.includes('cmd === "insertShape"'),
  "insertShape command handler must exist in runCommand",
)

// The shape dialog OK button must be wired to confirmShapePicker or similar
assert.ok(
  editorSrc.includes("btn-shape-ok") && editorSrc.includes("addEventListener"),
  "btn-shape-ok must have an event listener",
)

// The shape dialog cancel button must be wired to closeShapePicker or similar
assert.ok(
  editorSrc.includes("btn-shape-cancel") && editorSrc.includes("addEventListener"),
  "btn-shape-cancel must have an event listener",
)

// Verify shapes are inserted as drawing objects (SVG or similar)
// Look for SVG insertion or shape div with DrawingML/logic
assert.ok(
  editorSrc.includes("insertShape") &&
    (editorSrc.includes("svg") ||
      editorSrc.includes("DrawingML") ||
      editorSrc.includes('data-type="shape"')),
  "Shape insertion must create a drawing object",
)

console.log("All WO-10-shape tests passed!\n")
console.log("shape-PASS")

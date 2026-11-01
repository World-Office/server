/**
 * WO-21-ctx-convert-to-shape: OO "Convert to shape" on a drawing object
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the context menu contains a "Convert to shape" option that
 * opens the shape picker dialog, and that selecting a shape converts the
 * selected object into a shape placeholder div matching insertShape output.
 *
 * Run with: node ctx-convert-to-shape.test.mjs
 * Success: prints "ctx-convert-to-shape-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-21-ctx-convert-to-shape tests...\n")

// ━━━━━━━━━━━━━ i18n strings ━━━━━━━━━━━━━

// Ctx.ConvertToShape must exist in i18n.js (English)
assert.ok(
  i18nSrc.includes('"Ctx.ConvertToShape": "Convert to shape"'),
  "i18n: Ctx.ConvertToShape English string must exist",
)

// Ctx.ConvertToShape must have German translation
assert.ok(
  i18nSrc.includes('"Ctx.ConvertToShape": "In Form umwandeln"'),
  "i18n: Ctx.ConvertToShape German translation must exist",
)

// ━━━━━━━━━━━━━ index.html context menu row ━━━━━━━━━━

// The context menu must have a ConvertToShape button with data-ctx and data-showif
assert.ok(
  htmlSrc.includes('data-ctx="ConvertToShape"'),
  "index.html: ConvertToShape context menu item must exist with data-ctx",
)

// The ConvertToShape row must be shown only for objects
assert.ok(
  htmlSrc.includes('data-ctx="ConvertToShape"') && htmlSrc.includes('data-showif="object"'),
  'index.html: ConvertToShape must have data-showif="object"',
)

// The ConvertToShape row must reference the i18n key
assert.ok(
  htmlSrc.includes('data-ctx="ConvertToShape"') &&
    htmlSrc.includes('data-i18n="Ctx.ConvertToShape"'),
  'index.html: ConvertToShape must have data-i18n="Ctx.ConvertToShape"',
)

// ━━━━━━━━━━━━━ editor.js convert machinery ━━━━━━━━━

// shapeConvertTarget variable must exist to track the object being converted
assert.ok(
  editorSrc.includes("shapeConvertTarget"),
  "editor.js: shapeConvertTarget variable must exist",
)

// openShapePicker must accept a target parameter
assert.ok(
  editorSrc.includes("function openShapePicker(target)") ||
    (editorSrc.includes("openShapePicker") && editorSrc.includes("shapeConvertTarget = target")),
  "editor.js: openShapePicker must accept a target parameter for conversion",
)

// The ConvertToShape action handler must exist in ctx menu click
assert.ok(
  editorSrc.includes('action === "ConvertToShape"'),
  "editor.js: ConvertToShape ctx menu handler must exist",
)

// The ConvertToShape handler must open the shape picker with the selected object
assert.ok(
  editorSrc.includes('action === "ConvertToShape"') && editorSrc.includes("openShapePicker(obj)"),
  "editor.js: ConvertToShape handler must call openShapePicker with selected object",
)

// confirmShapePicker must handle the conversion path (shapeConvertTarget check)
assert.ok(
  editorSrc.includes("shapeConvertTarget") &&
    editorSrc.includes("confirmShapePicker") &&
    editorSrc.includes("editor.contains(shapeConvertTarget)"),
  "editor.js: confirmShapePicker must check for shapeConvertTarget",
)

// When converting, the new shape must be created with the correct structure
assert.ok(
  editorSrc.includes("shapeConvertTarget") &&
    editorSrc.includes('newShape.className = "object drawing-shape"') &&
    editorSrc.includes('newShape.setAttribute("data-type", "shape")'),
  'editor.js: Conversion must create div.object.drawing-shape with data-type="shape"',
)

// When converting, position must be preserved
assert.ok(
  editorSrc.includes("shapeConvertTarget") &&
    (editorSrc.includes("shapeConvertTarget.style.position") ||
      editorSrc.includes("newShape.style.position")),
  "editor.js: Conversion must preserve position styling",
)

// confirmShapePicker must call the required lifecycle methods
assert.ok(
  editorSrc.includes("confirmShapePicker") &&
    editorSrc.includes("captureHistory()") &&
    editorSrc.includes("markDirty()") &&
    editorSrc.includes("scheduleCollabSync()") &&
    editorSrc.includes('notifyHost("editing")'),
  "editor.js: confirmShapePicker must call captureHistory, markDirty, scheduleCollabSync, notifyHost",
)

// closeShapePicker must clear shapeConvertTarget
assert.ok(
  editorSrc.includes("closeShapePicker") && editorSrc.includes("shapeConvertTarget = null"),
  "editor.js: closeShapePicker must clear shapeConvertTarget",
)

// ━━━━━━━━━ Insert mode compatibility ━━━━━━━━━

// insertShape command must pass null to openShapePicker (insert mode, not convert)
assert.ok(
  editorSrc.includes('cmd === "insertShape"') && editorSrc.includes("openShapePicker(null)"),
  "editor.js: insertShape must call openShapePicker with null (insert mode)",
)

console.log("All WO-21-ctx-convert-to-shape tests passed!\n")
console.log("ctx-convert-to-shape-PASS")

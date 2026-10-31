/**
 * WO-9-chart: missing-feature (insert tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the editor implements chart insertion:
 *   - chart-dialog exists with chart type picker
 *   - insertChart wo-command opens the chart type picker dialog
 *   - dialog uses existing drawing infrastructure (insertVectorObject)
 *   - default data is present in the dialog
 *
 * Run with: node chart.test.mjs
 * Success: prints "chart-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")

console.log("Running WO-9-chart insert tests...\n")

// --- Chart type picker dialog exists -----------------------------------

// The chart-dialog must exist in index.html
assert.ok(htmlSrc.includes('id="chart-dialog"'), "WO-9: chart-dialog must exist in index.html")

// The chart-dialog must have a chart type picker (select element)
assert.ok(
  htmlSrc.includes('id="chart-type-select"'),
  "WO-9: chart-type-select must exist in chart-dialog",
)

// The chart type select must have chart type options
const chartTypes = ["bar", "line", "pie", "area"]
for (const type of chartTypes) {
  assert.ok(
    htmlSrc.includes(`<option value="${type}">`),
    `WO-9: chart type option "${type}" must exist in chart-type-select`,
  )
}

// The chart-dialog must have default data inputs (4 rows of label+value)
assert.ok(
  htmlSrc.includes('id="chart-data"'),
  "WO-9: chart-data container must exist in chart-dialog",
)
assert.ok(htmlSrc.includes('placeholder="Label"'), "WO-9: chart-data must have label inputs")
assert.ok(htmlSrc.includes('placeholder="Value"'), "WO-9: chart-data must have value inputs")

// The chart-dialog must have Insert chart button
assert.ok(htmlSrc.includes('id="btn-chart-ok"'), "WO-9: btn-chart-ok must exist in chart-dialog")

// --- insertChart wo-command in editor.js ---------------------------------

// Extract the runCommand function body
function extractFunction(src, name) {
  const marker = `function ${name}(`
  const start = src.indexOf(marker)
  assert.notEqual(start, -1, `${name} must exist in editor.js`)
  let depth = 0
  let i = src.indexOf("{", start)
  const bodyStart = i
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}") {
      depth--
      if (depth === 0) break
    }
  }
  return src.slice(start, i + 1)
}

const runCommandBody = extractFunction(editorSrc, "runCommand")

// The insertChart command must be dispatched in runCommand
assert.ok(
  runCommandBody.includes('cmd === "insertChart"'),
  "WO-9: insertChart command must be dispatched in runCommand",
)

// The insertChart handler must open the chart-dialog
assert.ok(
  runCommandBody.includes('openDlg("chart-dialog")'),
  "WO-9: insertChart must open chart-dialog",
)

// The insertChart handler must render chart preview
assert.ok(
  runCommandBody.includes("renderChartPreview()"),
  "WO-9: insertChart must call renderChartPreview()",
)

// The insertChart handler must check READ_ONLY
assert.ok(
  runCommandBody.includes("if (READ_ONLY) return"),
  "WO-9: insertChart must check READ_ONLY",
)

// --- Drawing infrastructure ----------------------------------------------

// insertVectorObject must exist (drawing infrastructure)
assert.ok(
  editorSrc.includes("function insertVectorObject"),
  "WO-9: insertVectorObject must exist in editor.js",
)

// chartSVG must exist (drawing infrastructure for charts)
assert.ok(editorSrc.includes("function chartSVG"), "WO-9: chartSVG must exist in editor.js")

// The chart-dialog OK button must call insertVectorObject
assert.ok(
  editorSrc.includes("insertVectorObject(chartSVG("),
  "WO-9: chart-dialog OK must call insertVectorObject with chartSVG",
)

// The insertVectorObject must set data-kind attribute for charts
assert.ok(
  editorSrc.includes('setAttribute("data-kind", kind)'),
  "WO-9: insertVectorObject must set data-kind attribute",
)

// --- Button wiring --------------------------------------------------------

// The btn-chart button must exist and open the chart-dialog
assert.ok(htmlSrc.includes('id="btn-chart"'), "WO-9: btn-chart button must exist in index.html")

// The btn-chart button must have an event listener in editor.js
assert.ok(
  editorSrc.includes("btn-chart") && editorSrc.includes("addEventListener"),
  "WO-9: btn-chart must have an event listener",
)

console.log("All WO-9-chart insert tests passed!\n")
console.log("chart-PASS")

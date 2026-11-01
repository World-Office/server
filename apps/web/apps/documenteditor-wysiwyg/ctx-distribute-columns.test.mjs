/**
 * WO-21-ctx-distribute-columns: OO table context menu "Distribute columns
 * equally" / "Distribute rows equally" (slugs:ctx-distribute-columns).
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Asserts the onlyoffice parity contract:
 *   (1) index.html has DistributeColumns + DistributeRows ctx menu rows,
 *       both gated on data-showif="table"
 *   (2) i18n.js defines Ctx.DistributeColumns + Ctx.DistributeRows in BOTH
 *       the English and German catalogs
 *   (3) editor.js dispatches both actions to real table-layout ops
 *   (4) the ops equalize column widths / row heights through the exact
 *       per-cell channel the table size controls use (cell.style.width /
 *       tr.style.height), preserve the table's total width, and finalize
 *       through captureHistory/markDirty/scheduleCollabSync/notifyHost
 *
 * Run with: node ctx-distribute-columns.test.mjs
 * Success: prints "ctx-distribute-columns-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-21-ctx-distribute-columns tests...\n")

// Test (1): the two ctx menu rows exist and are gated on a table.
for (const ctx of ["DistributeColumns", "DistributeRows"]) {
  const row = htmlSrc.match(new RegExp(`data-ctx="${ctx}"[^>]*data-showif="table"`))
  assert.ok(row, `index.html must have a data-ctx="${ctx}" row gated on data-showif="table"`)
  console.log(`ok 1 row data-ctx="${ctx}" exists with data-showif="table"`)
}

// Test (2): i18n keys exist in English and German.
for (const key of ["DistributeColumns", "DistributeRows"]) {
  assert.ok(i18nSrc.includes(`"Ctx.${key}"`), `English i18n must define Ctx.${key}`)
  console.log(`ok 2 i18n key Ctx.${key} exists`)
  const deStart = i18nSrc.indexOf("const LOCALE_DE = {")
  const deSection = i18nSrc.slice(deStart)
  assert.ok(deSection.includes(`"Ctx.${key}"`), `German i18n must define Ctx.${key}`)
  console.log(`ok 2b i18n key Ctx.${key} exists in German`)
}

// Test (3): editor.js dispatches both actions to real helpers.
for (const action of ["DistributeColumns", "DistributeRows"]) {
  assert.ok(
    editorSrc.includes(`action === "${action}"`),
    `editor.js dispatcher must handle action "${action}"`,
  )
  console.log(`ok 3 dispatcher handles "${action}"`)
}

// Extract a function body (from "function name(" to its matching close brace).
function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `function ${name} must exist`)
  const open = src.indexOf("{", start)
  assert.notEqual(open, -1, `function ${name} must have a body`)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}") {
      depth--
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  assert.fail(`function ${name} must have balanced braces`)
}

// Test (4): DistributeColumns is a real layout op, not a stub. It must
// compute an equal width from the target columns' total rendered width and
// write it through cell.style.width (the column-width channel), then
// finalize through the standard table-change funnel.
assert.ok(
  editorSrc.includes("function distributeTableColumns()"),
  "editor.js must implement distributeTableColumns()",
)
assert.ok(
  editorSrc.includes("function columnRenderedWidth(") &&
    editorSrc.includes("cell.getBoundingClientRect().width") &&
    editorSrc.includes("function distributeTargetColumns(") &&
    editorSrc.includes('cell.style.width = each + "px"'),
  "distributeTableColumns must read rendered widths and write equal widths via cell.style.width",
)
const columnsBody = extractFunction(editorSrc, "distributeTableColumns")
assert.ok(
  columnsBody.includes("Math.round(total / cols.length)") &&
    columnsBody.includes("finalizeTableChange()"),
  "distributeTableColumns must average the total width and finalize the table change",
)
assert.ok(
  !columnsBody.includes("requestAnimationFrame(") && !columnsBody.includes("setTimeout("),
  "distributeTableColumns must apply instantly (no animation scheduling)",
)
// Test (4b): on colgroup'd tables the equal width must also reach the
// <col> elements (the colgroup/table-width machinery the editor uses for
// column layout), so the operation stays visibly equal even though <col>
// widths would otherwise override the per-cell styles.
assert.ok(
  editorSrc.includes("function applyEqualColgroupWidths(") &&
    editorSrc.includes('colgroup.querySelectorAll("col")') &&
    editorSrc.includes('col.setAttribute("width", String(widthPx))'),
  "distributeTableColumns must equalize explicit colgroup <col> widths too",
)
assert.ok(
  columnsBody.includes("applyEqualColgroupWidths(table, cols, each)"),
  "distributeTableColumns must drive the colgroup equalizer with the equal width",
)
console.log("ok 4b colgroup <col> widths are equalized alongside the cells")
console.log("ok 4 distributeTableColumns is a real equal-width op")

// Test (5): DistributeRows is a real layout op through tr.style.height.
assert.ok(
  editorSrc.includes("function distributeTableRows()"),
  "editor.js must implement distributeTableRows()",
)
assert.ok(
  editorSrc.includes("function rowRenderedHeight(") &&
    editorSrc.includes("tr.getBoundingClientRect().height") &&
    editorSrc.includes('tr.style.height = each + "px"'),
  "distributeTableRows must read rendered heights and write equal heights via tr.style.height",
)
const rowsBody = extractFunction(editorSrc, "distributeTableRows")
assert.ok(
  rowsBody.includes("Math.round(total / rows.length)") &&
    rowsBody.includes("finalizeTableChange()"),
  "distributeTableRows must average the total height and finalize the table change",
)
assert.ok(
  !rowsBody.includes("requestAnimationFrame(") && !rowsBody.includes("setTimeout("),
  "distributeTableRows must apply instantly (no animation scheduling)",
)
console.log("ok 5 distributeTableRows is a real equal-height op")

// Test (6): the shared plumbing resolves the caret/selection table and the
// ops are read-only gated (they must do nothing when no table is selected).
assert.ok(
  editorSrc.includes("function tableTarget()") && editorSrc.includes('cell.closest("table")'),
  "editor.js must resolve the table under the caret/selection",
)
assert.ok(
  editorSrc.includes("if (!table || READ_ONLY) return"),
  "distribute ops must be inert when no table is selected or the file is read-only",
)
console.log("ok 6 ops are instant, read-only gated table ops")

console.log("\nAll WO-21-ctx-distribute-columns tests passed!\n")
console.log("ctx-distribute-columns-PASS")

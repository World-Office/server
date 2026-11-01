/**
 * WO-21-ctx-distribute-rows: OO table context menu "Distribute rows
 * equally" (slugs:ctx-distribute-rows). Node test runner (node:assert,
 * zero dependencies).
 *
 * Asserts the OnlyOffice parity contract:
 *   (1) index.html has a DistributeRows ctx menu row gated on
 *       data-showif="table" and localized via Ctx.DistributeRows
 *   (2) i18n.js defines Ctx.DistributeRows in the English and German
 *       catalogs
 *   (3) editor.js dispatches the ctx action to closeCtx() +
 *       distributeTableRows() — a real op, not a stub
 *   (4) distributeTableRows equalizes the heights of the selected rows
 *       (or all rows when the caret is merely in the table) through
 *       tr.style.height — the same row-height channel the right-panel
 *       "row height" input (applyTableRowHeight) already uses — and
 *       preserves the total height; it compensates the editor zoom when
 *       reading rendered heights and is inert outside a table / in
 *       read-only mode
 *   (5) the op applies instantly and finalizes through
 *       finalizeTableChange() -> captureHistory/markDirty/
 *       scheduleCollabSync/notifyHost("editing")
 *
 * Run with: node apps/web/apps/documenteditor-wysiwyg/ctx-distribute-rows.test.mjs
 * Success: prints "ctx-distribute-rows-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlSrc = readFileSync(new URL("./index.html", import.meta.url), "utf-8")
const editorSrc = readFileSync(new URL("./editor.js", import.meta.url), "utf-8")
const i18nSrc = readFileSync(new URL("./i18n.js", import.meta.url), "utf-8")

console.log("Running WO-21-ctx-distribute-rows tests...\n")

// --- (1) ctx menu row -------------------------------------------------
const ctxRow = htmlSrc.match(/<button[^>]*data-ctx="DistributeRows"[^>]*>/)
assert.ok(ctxRow, 'index.html must have a data-ctx="DistributeRows" menu row')
assert.ok(
  /data-showif="table"/.test(ctxRow[0]),
  'the DistributeRows row must be gated on data-showif="table"',
)
assert.ok(
  /data-i18n="Ctx\.DistributeRows"/.test(ctxRow[0]),
  'the DistributeRows row must be localized via data-i18n="Ctx.DistributeRows"',
)
assert.ok(/role="menuitem"/.test(ctxRow[0]), "the DistributeRows row must be a menuitem")
console.log('ok 1 ctx row data-ctx="DistributeRows" (table-gated, localized)')

// --- (2) i18n catalogs (EN + DE) ---------------------------------------
assert.ok(i18nSrc.includes('"Ctx.DistributeRows"'), "English i18n must define Ctx.DistributeRows")
const deSection = i18nSrc.slice(i18nSrc.indexOf("const LOCALE_DE = {"))
assert.ok(deSection.includes('"Ctx.DistributeRows"'), "German i18n must define Ctx.DistributeRows")
console.log("ok 2 i18n key Ctx.DistributeRows exists in EN + DE")

// --- (3) ctx dispatch arm ----------------------------------------------
const dispatchArm = editorSrc.match(
  /action === "DistributeRows"\) \{\s*closeCtx\(\);\s*distributeTableRows\(\);/,
)
assert.ok(
  dispatchArm,
  'editor.js dispatch must handle action "DistributeRows" via closeCtx() + distributeTableRows()',
)
console.log('ok 3 dispatcher routes "DistributeRows" to distributeTableRows()')

// --- helpers to lift functions out of editor.js -------------------------
function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `function ${name} must exist in editor.js`)
  const open = src.indexOf("{", start)
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

for (const name of [
  "tableZoomFactor",
  "distributeTargetRows",
  "rowRenderedHeight",
  "distributeTableRows",
]) {
  extractFunction(editorSrc, name)
}
console.log("ok 4 row-distribution helpers exist in editor.js")

// --- (4) behavioral harness: run the real op against a mock table -------
// Build distributeTableRows with its module-scope dependencies injected so
// the actual editor.js source (not a re-implementation) is under test.
const makeDistributeRows = new Function(
  "editor",
  "READ_ONLY",
  "tableTarget",
  "selectedCells",
  "finalizeTableChange",
  "setStatus",
  [
    extractFunction(editorSrc, "tableZoomFactor"),
    extractFunction(editorSrc, "distributeTargetRows"),
    extractFunction(editorSrc, "rowRenderedHeight"),
    extractFunction(editorSrc, "distributeTableRows"),
    "return distributeTableRows;",
  ].join("\n"),
)

// Minimal tr/table mocks: style.height is the persisted row-height channel.
function makeRow(height) {
  return {
    style: {},
    getBoundingClientRect: () => ({ height }),
  }
}
function makeTable(heights) {
  const trs = heights.map(makeRow)
  return { rows: trs }
}
function runDistributeRows(heights, opts) {
  const options = opts || {}
  const table = makeTable(heights)
  const calls = { finalize: 0, status: [] }
  const selection = options.selectedRows || []
  const op = makeDistributeRows(
    { style: { zoom: options.zoom || "" } },
    !!options.readOnly,
    () => (options.noTable ? null : table),
    (tbl) =>
      selection.map((r) => ({
        closest: (sel) => (sel === "tr" ? tbl.rows[r] : null),
      })),
    () => {
      calls.finalize++
    },
    (msg) => calls.status.push(msg),
  )
  op()
  return { table, calls }
}

// (4a) caret-in-table: ALL rows equalize, total height is preserved.
{
  const { table, calls } = runDistributeRows([30, 60, 90])
  assert.equal(calls.finalize, 1, "must finalize exactly one table change")
  assert.equal(calls.status.length, 1, "must report the applied height")
  for (const tr of table.rows) {
    assert.equal(tr.style.height, "60px", "every row must get the average height 60px")
  }
  assert.equal(table.rows.length, 3, "row count must not change")
  console.log("ok 5 caret case: all rows equalized to the average (60px)")
}

// (4b) multi-row selection: only the SELECTED rows equalize.
{
  const { table, calls } = runDistributeRows([30, 60, 90], { selectedRows: [1, 2] })
  assert.equal(calls.finalize, 1, "must finalize the selection-scoped change")
  assert.equal(table.rows[0].style.height, undefined, "unselected row must be untouched")
  assert.equal(table.rows[1].style.height, "75px", "selected row 1 must get 75px")
  assert.equal(table.rows[2].style.height, "75px", "selected row 2 must get 75px")
  console.log("ok 6 selection case: rows 1-2 equalized to 75px, row 0 untouched")
}

// (4c) zoom compensation: rendered (zoomed) heights are divided by the
// editor zoom, so the written height stays in unzoomed document px.
{
  const { table } = runDistributeRows([120, 240], { zoom: "2" })
  assert.equal(table.rows[0].style.height, "90px", "zoomed table must still equalize in doc px")
  assert.equal(table.rows[1].style.height, "90px", "zoomed table must still equalize in doc px")
  console.log("ok 7 zoom: rendered heights normalized before averaging")
}

// (4d) guards: inert with no table or in read-only mode.
{
  const noTable = runDistributeRows([30, 60], { noTable: true })
  assert.equal(noTable.calls.finalize, 0, "no table -> no change, no finalize")
  const readOnly = runDistributeRows([30, 60], { readOnly: true })
  assert.equal(readOnly.calls.finalize, 0, "read-only -> no change, no finalize")
  assert.equal(
    readOnly.table.rows[0].style.height,
    undefined,
    "read-only must not touch row heights",
  )
  console.log("ok 8 guards: inert without a table / in read-only mode")
}

// (4e) the row-height channel is the one the table machinery already
// uses: the right-panel row-height input (applyTableRowHeight) writes
// tr.style.height = px + "px", exactly like distributeTableRows.
const rowHeightChannel = extractFunction(editorSrc, "applyTableRowHeight")
assert.ok(
  rowHeightChannel.includes('tr.style.height = px + "px"'),
  "applyTableRowHeight must keep writing tr.style.height (shared channel)",
)
const rowsBody = extractFunction(editorSrc, "distributeTableRows")
assert.ok(
  rowsBody.includes('tr.style.height = each + "px"'),
  "distributeTableRows must write through tr.style.height",
)
console.log("ok 9 row heights written via the existing tr.style.height channel")

// --- (5) instant + finalize funnel ---------------------------------------
assert.ok(
  !rowsBody.includes("requestAnimationFrame(") && !rowsBody.includes("setTimeout("),
  "distributeTableRows must apply instantly (no animation scheduling)",
)
const finalizeBody = extractFunction(editorSrc, "finalizeTableChange")
for (const step of [
  "captureHistory()",
  "markDirty()",
  "scheduleCollabSync()",
  'notifyHost("editing")',
]) {
  assert.ok(finalizeBody.includes(step), `finalizeTableChange must call ${step}`)
}
assert.ok(
  rowsBody.includes("finalizeTableChange()"),
  "distributeTableRows must finalize through finalizeTableChange()",
)
console.log("ok 10 instant apply + captureHistory/markDirty/sync/notify funnel")

console.log("\nAll WO-21-ctx-distribute-rows tests passed!\n")
console.log("ctx-distribute-rows-PASS")

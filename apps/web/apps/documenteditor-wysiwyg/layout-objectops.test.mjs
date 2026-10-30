/**
 * AF4-LAYOUT-COMPLETE: Layout tab OO parity tests
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Static-analysis contract (mirrors ctx-menu.test.mjs / layout-menus.test.mjs):
 *   (a) Columns menu exists with 5 preset rows + Custom columns
 *   (b) Breaks menu has 3 rows (page / column / section)
 *   (c) Object-op controls exist and every data-cmd value is dispatched
 *       in editor.js (applyColumns, insertColumnBreak, objectOp,
 *       openColumnsDialog, openPageSetup)
 *   (d) Every new data-i18n key in the layout tab exists in BOTH en and de
 *   (e) Size menu has >= 13 preset rows
 *   (f) No new handler body is a bare console.log stub
 *
 * Run: node apps/web/apps/documenteditor-wysiwyg/layout-objectops.test.mjs
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlSrc = readFileSync(new URL("./index.html", import.meta.url), "utf-8")
const editorSrc = readFileSync(new URL("./editor.js", import.meta.url), "utf-8")
const i18nSrc = readFileSync(new URL("./i18n.js", import.meta.url), "utf-8")

console.log("Running AF4-LAYOUT-COMPLETE tests...\n")

// Extract the layout ribbon tab (no nested <div> inside the tab, so the
// non-greedy match to the first </div> covers the whole tab — same
// extraction contract as layout-menus.test.mjs).
const layoutTabMatch = htmlSrc.match(/<div class="ribbon-page" data-tab="layout"[^>]*>.*?<\/div>/s)
assert.ok(layoutTabMatch, "Layout ribbon tab must exist in index.html")
const layoutHtml = layoutTabMatch[0]

// Extract the runCommand dispatcher body from editor.js (the single funnel
// every data-cmd routes through).
function extractFunction(src, name) {
  const marker = `function ${name}(`
  const start = src.indexOf(marker)
  assert.notEqual(start, -1, `${name} must exist in editor.js`)
  let depth = 0
  let i = src.indexOf("{", start)
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

// --- (a) Columns menu: 5 preset rows + custom -------------------------
const columnsRows = layoutHtml.match(/data-cmd="applyColumns" data-value="([^"]+)"/g) || []
const columnValues = columnsRows.map((m) => m.match(/data-value="([^"]+)"/)[1])
console.log(`Columns rows: ${columnValues.join(", ")}`)
assert.deepEqual(
  columnValues.sort(),
  ["left", "one", "right", "three", "two"],
  "Columns menu must have exactly the 5 OO preset rows",
)
assert.ok(
  layoutHtml.includes('data-cmd="openColumnsDialog"'),
  "Columns menu must have a Custom columns row opening the columns dialog",
)
assert.ok(
  editorSrc.includes("function applyColumnsPreset"),
  "editor.js must implement applyColumnsPreset",
)
assert.ok(
  runCommandBody.includes('cmd === "applyColumns"'),
  "runCommand must dispatch applyColumns",
)
for (const v of ["one", "two", "three", "left", "right"]) {
  assert.ok(
    editorSrc.includes(`${v}: { cols:`),
    `applyColumnsPreset must map column preset "${v}"`,
  )
}

// --- (b) Breaks menu: 3 rows ------------------------------------------
const breaksMatch = layoutHtml.match(/<ul class="menu-list"[^>]*>((?:(?!<\/ul>)[\s\S])*?data-cmd="insertColumnBreak"(?:(?!<\/ul>)[\s\S])*?)<\/ul>/)
assert.ok(breaksMatch, "Breaks menu-list containing insertColumnBreak must exist")
const breaksHtml = breaksMatch[1]
assert.ok(
  breaksHtml.includes('data-cmd="insertPageBreak"'),
  "Breaks menu must contain the page break row",
)
assert.ok(
  breaksHtml.includes('data-cmd="insertColumnBreak"'),
  "Breaks menu must contain the column break row",
)
assert.ok(
  breaksHtml.includes('data-cmd="insertSectionBreak"'),
  "Breaks menu must contain the section break row",
)
const breakRowCount = (breaksHtml.match(/data-cmd="insert/g) || []).length
assert.equal(breakRowCount, 3, `Breaks menu must have exactly 3 rows, got ${breakRowCount}`)
assert.ok(
  runCommandBody.includes('cmd === "insertColumnBreak"'),
  "runCommand must dispatch insertColumnBreak",
)
assert.ok(
  runCommandBody.includes('class="column-break"'),
  "insertColumnBreak must insert the column-break marker",
)
assert.ok(
  editorSrc.includes(".page-break, .column-break, .section-break"),
  "moveCaretPastStructuralMarkers must treat .column-break as a structural marker",
)
const styleSrc = readFileSync(new URL("./style.css", import.meta.url), "utf-8")
assert.ok(
  styleSrc.includes(".column-break"),
  "The column-break marker must have a CSS affordance",
)

// --- (c) Object-op controls + dispatch --------------------------------
const objectOpRows = layoutHtml.match(/data-cmd="objectOp" data-value="([^"]+)"/g) || []
const objectOpValues = objectOpRows.map((m) => m.match(/data-value="([^"]+)"/)[1])
console.log(`Object-op rows: ${objectOpValues.join(", ")}`)
const requiredObjectOps = [
  "wrap-inline", "wrap-square", "wrap-behind",
  "bring-forward", "send-backward",
  "align-left", "align-center", "align-right", "align-top", "align-middle", "align-bottom",
  "group", "merge-union", "merge-subtract", "merge-intersect",
]
// T-002 object-parity additions (2026-10-29): foreground/background stacking
// ends + ungroup.
const extraObjectOps = [
  "bring-to-foreground", "send-to-background", "ungroup",
]
for (const op of requiredObjectOps.concat(extraObjectOps)) {
  assert.ok(
    objectOpValues.includes(op),
    `Object-op control for "${op}" must exist in the layout tab`,
  )
}
assert.ok(
  // stacking-ends + ungroup have real handlers in applyObjectOp
  editorSrc.includes("value === \"bring-to-foreground\" || value === \"send-to-background\"") &&
    editorSrc.includes("ungroupSelectedObjects(obj)") &&
    editorSrc.includes("actual-size") &&
    editorSrc.includes("replace-image") &&
    editorSrc.includes("save-as-picture"),
  "applyObjectOp must implement foreground/background/ungroup/actual-size/replace-image/save-as-picture",
)
assert.ok(
  layoutHtml.includes('data-i18n="Layout.Wrapping"'),
  "Wrapping menu trigger must exist",
)
assert.ok(
  layoutHtml.includes('data-i18n="Layout.Align"'),
  "Align menu trigger must exist",
)
assert.ok(
  layoutHtml.includes('data-i18n="Layout.MergeShapes"'),
  "Merge Shapes menu trigger must exist",
)
assert.ok(
  runCommandBody.includes('cmd === "objectOp"'),
  "runCommand must dispatch objectOp",
)
const applyObjectOpBody = extractFunction(editorSrc, "applyObjectOp")
assert.ok(
  applyObjectOpBody.includes('"wo:object-op"'),
  "applyObjectOp must fire the observable wo:object-op event",
)
for (const op of requiredObjectOps) {
  // Align ops route through the /^align-/ prefix branch and match the
  // direction literal (value.slice(6)); all other ops match literally.
  const handled = op.startsWith("align-")
    ? applyObjectOpBody.includes("^align-") && applyObjectOpBody.includes(`"${op.slice(6)}"`)
    : applyObjectOpBody.includes(`"${op}"`)
  assert.ok(handled, `applyObjectOp must handle op "${op}"`)
}
assert.ok(
  editorSrc.includes("function groupSelectedObjects"),
  "applyObjectOp must implement real grouping (groupSelectedObjects)",
)

// --- (c-cont.) Every data-cmd in the layout tab is dispatched ----------
const allCmds = [...new Set(
  [...layoutHtml.matchAll(/data-cmd="([^"]+)"/g)].map((m) => m[1])
)]
console.log(`Layout tab data-cmd values: ${allCmds.join(", ")}`)
for (const cmd of allCmds) {
  const isBrowserCommand = ["bold", "italic", "underline"].includes(cmd)
  assert.ok(
    isBrowserCommand || runCommandBody.includes(`cmd === "${cmd}"`),
    `data-cmd="${cmd}" must be dispatched in the editor.js runCommand dispatcher`,
  )
}

// --- (d) Every data-i18n key in the layout tab exists in en AND de -----
function extractLocaleSection(src, constName) {
  const start = src.indexOf(`const ${constName} = {`)
  assert.notEqual(start, -1, `${constName} must exist in i18n.js`)
  let depth = 0
  let end = start
  let opened = false
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") { depth++; opened = true }
    else if (src[i] === "}") {
      depth--
      if (opened && depth === 0) { end = i; break }
    }
  }
  return src.slice(start, end + 1)
}
const deSection = extractLocaleSection(i18nSrc, "LOCALE_DE")
// English strings live in the default catalog (no LOCALE_EN const) — the
// ctx-menu test checks English against the whole source the same way.
const enSection = i18nSrc
const layoutKeys = [...new Set(
  [...layoutHtml.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1])
)]
console.log(`Layout tab i18n keys: ${layoutKeys.length}`)
for (const key of layoutKeys) {
  assert.ok(
    enSection.includes(`"${key}":`),
    `Layout key "${key}" missing in English i18n`,
  )
  assert.ok(
    deSection.includes(`"${key}":`),
    `Layout key "${key}" missing in German i18n`,
  )
}
const newKeys = [
  "Layout.Margins.Custom", "Layout.Size.Custom",
  "Layout.Columns", "Layout.Columns.One", "Layout.Columns.Two",
  "Layout.Columns.Three", "Layout.Columns.Left", "Layout.Columns.Right",
  "Layout.Columns.Custom",
  "Layout.Breaks", "Layout.Breaks.Page", "Layout.Breaks.Column", "Layout.Breaks.Section",
  "Layout.Wrapping", "Layout.Wrapping.Inline", "Layout.Wrapping.Square", "Layout.Wrapping.Behind",
  "Layout.Object.BringForward", "Layout.Object.SendBackward", "Layout.Object.Group",
  "Layout.Align", "Layout.Align.Left", "Layout.Align.Center", "Layout.Align.Right",
  "Layout.Align.Top", "Layout.Align.Middle", "Layout.Align.Bottom",
  "Layout.MergeShapes", "Layout.Merge.Union", "Layout.Merge.Subtract", "Layout.Merge.Intersect",
]
for (const key of newKeys) {
  assert.ok(
    layoutKeys.includes(key),
    `New key "${key}" must be referenced from the layout tab HTML`,
  )
  assert.ok(
    enSection.includes(`"${key}":`) && deSection.includes(`"${key}":`),
    `New key "${key}" must exist in BOTH locales`,
  )
}

// --- (e) Size menu: full OO preset list --------------------------------
const sizeRows = (layoutHtml.match(/data-cmd="applyPageSize"/g) || []).length
console.log(`Size preset rows: ${sizeRows}`)
assert.ok(sizeRows >= 13, `Size menu must have >= 13 preset rows, got ${sizeRows}`)
const requiredSizes = ["Letter", "Legal", "A4", "A5", "B5", "Env10", "EnvDL",
  "Tabloid", "A3", "TabloidOversize", "ROC16K", "EnvChoukei3", "SuperB"]
for (const size of requiredSizes) {
  assert.ok(
    layoutHtml.includes(`data-value="${size}"`),
    `Size menu must have the "${size}" preset row`,
  )
  assert.ok(
    editorSrc.includes(`${size}: [`),
    `PS_SIZES must define the "${size}" preset`,
  )
}
assert.ok(
  layoutHtml.includes('data-i18n="Layout.Size.Custom"'),
  "Size menu must have a Custom page size row",
)

// --- (f) No bare console.log stubs in the new handlers -----------------
const newHandlers = [
  extractFunction(editorSrc, "applyColumnsPreset"),
  applyObjectOpBody,
  extractFunction(editorSrc, "groupSelectedObjects"),
  extractFunction(editorSrc, "openColumnsDialog"),
]
// Slice the insertColumnBreak / applyColumns / objectOp / openPageSetup /
// openPageSetup handler bodies out of runCommand and check them too.
for (const cmd of ["insertColumnBreak", "applyColumns", "objectOp", "openColumnsDialog", "openPageSetup"]) {
  const at = runCommandBody.indexOf(`cmd === "${cmd}"`)
  assert.notEqual(at, -1, `runCommand must dispatch ${cmd}`)
  const next = runCommandBody.indexOf("if (cmd ===", at + 1)
  const body = runCommandBody.slice(at, next === -1 ? runCommandBody.length : next)
  const hasConsoleLog = body.includes("console.log(")
  const hasRealAction =
    body.includes("document.execCommand(") ||
    body.includes("applyColumnsPreset(") ||
    body.includes("applyObjectOp(") ||
    body.includes("openColumnsDialog(") ||
    body.includes("psBtn.click(") ||
    body.includes("moveCaretPastStructuralMarkers(")
  assert.ok(!hasConsoleLog, `${cmd} handler must not use console.log`)
  assert.ok(hasRealAction, `${cmd} handler must perform a real action`)
}
for (const body of newHandlers) {
  assert.ok(!body.includes("console.log("), "Handler must not be a bare console.log stub")
}

console.log("\nAll AF4-LAYOUT-COMPLETE tests passed!")
console.log("LAYOUT-OBJECTOPS-PASS")

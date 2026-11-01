/**
 * WO-21-ctx-resize-to-cell Context Menu Tests
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the "Resize to cell" context menu row exists and is wired:
 *   (a) Context menu row exists with data-ctx="ResizeToCell" and data-showif="object"
 *   (b) i18n strings exist in both en and de for Ctx.ResizeToCell
 *   (c) i18n status strings exist for ResizeToCellNoTable and ObjectResizedToCell
 *   (d) Dispatcher branch handles ResizeToCell action
 *   (e) Handler finds nearest td, computes content box, sets object dimensions
 *       preserving aspect ratio when available via naturalWidth/Height or data-ratio
 *   (f) Handler calls captureHistory(), markDirty(), scheduleCollabSync(), notifyHost("editing")
 *   (g) Handler sets appropriate status message
 *
 * Run: node apps/web/apps/documenteditor-wysiwyg/ctx-resize-to-cell.test.mjs
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8")
const js = readFileSync(new URL("./editor.js", import.meta.url), "utf8")
const i18n = readFileSync(new URL("./i18n.js", import.meta.url), "utf8")

// --- (a) Context menu row exists with proper attributes --------------------
const resizeToCellIdx = html.indexOf('data-ctx="ResizeToCell"')
assert.notEqual(resizeToCellIdx, -1, 'Context menu row with data-ctx="ResizeToCell" must exist')

const resizeToCellSlice = html.slice(resizeToCellIdx, resizeToCellIdx + 200)
assert.ok(
  resizeToCellSlice.includes('data-showif="object"'),
  'ResizeToCell row must have data-showif="object"',
)
assert.ok(
  resizeToCellSlice.includes('data-i18n="Ctx.ResizeToCell"'),
  'ResizeToCell row must have data-i18n="Ctx.ResizeToCell"',
)

// --- (b) i18n strings exist for Ctx.ResizeToCell in both en and de ----------
const deStart = i18n.indexOf("const LOCALE_DE = {")
assert.notEqual(deStart, -1, "LOCALE_DE must exist in i18n.js")
const enSection = i18n.slice(0, deStart)
const deSection = i18n.slice(deStart)

assert.ok(
  enSection.includes('"Ctx.ResizeToCell": "Resize to cell"'),
  "Ctx.ResizeToCell must exist in English i18n",
)
assert.ok(
  deSection.includes('"Ctx.ResizeToCell": "An Zelle anpassen"'),
  "Ctx.ResizeToCell must exist in German i18n",
)

// --- (c) Status strings exist in both en and de ------------------------------
assert.ok(
  enSection.includes('"Status.ResizeToCellNoTable": "Object is not inside a table cell"'),
  "Status.ResizeToCellNoTable must exist in English i18n",
)
assert.ok(
  enSection.includes('"Status.ObjectResizedToCell": "Object resized to cell"'),
  "Status.ObjectResizedToCell must exist in English i18n",
)
assert.ok(
  deSection.includes(
    '"Status.ResizeToCellNoTable": "Objekt befindet sich nicht in einer Tabellenzelle"',
  ),
  "Status.ResizeToCellNoTable must exist in German i18n",
)
assert.ok(
  deSection.includes('"Status.ObjectResizedToCell": "Objekt an Zelle angepasst"'),
  "Status.ObjectResizedToCell must exist in German i18n",
)

// --- (d) Dispatcher branch handles ResizeToCell action ------------------------
const dispatcher = js.slice(
  js.indexOf('ctxMenu.addEventListener("click"'),
  js.indexOf('document.addEventListener("mousedown"'),
)
assert.ok(
  dispatcher.includes('action === "ResizeToCell"'),
  "Dispatcher must handle ResizeToCell action",
)

// --- (e) Handler implementation: find td, compute content box, set dimensions --
const handlerBlock = js.slice(
  js.indexOf('} else if (action === "ResizeToCell")'),
  js.indexOf('} else if (action === "DistributeHorizontally")'),
)
assert.ok(handlerBlock.includes("closeCtx()"), "Handler must close context menu")
assert.ok(handlerBlock.includes("selectedObject()"), "Handler must get selected object")
assert.ok(handlerBlock.includes('closest("td")'), "Handler must find nearest td ancestor")
assert.ok(
  handlerBlock.includes("clientWidth") && handlerBlock.includes("clientHeight"),
  "Handler must use clientWidth and clientHeight",
)
assert.ok(
  handlerBlock.includes("paddingLeft") &&
    handlerBlock.includes("paddingRight") &&
    handlerBlock.includes("paddingTop") &&
    handlerBlock.includes("paddingBottom"),
  "Handler must subtract padding from cell dimensions",
)
assert.ok(
  handlerBlock.includes("naturalWidth") && handlerBlock.includes("naturalHeight"),
  "Handler must check for intrinsic aspect ratio via naturalWidth/Height",
)
assert.ok(
  handlerBlock.includes('getAttribute("data-ratio")'),
  "Handler must check for data-ratio attribute",
)
assert.ok(
  handlerBlock.includes("style.width") && handlerBlock.includes("style.height"),
  "Handler must set object style.width and style.height",
)
assert.ok(
  handlerBlock.includes('setAttribute("width"') && handlerBlock.includes('setAttribute("height"'),
  "Handler must set img width and height attributes",
)

// --- (f) Handler calls the required mutation chain ----------------------------
assert.ok(handlerBlock.includes("captureHistory()"), "Handler must call captureHistory()")
assert.ok(handlerBlock.includes("markDirty()"), "Handler must call markDirty()")
assert.ok(handlerBlock.includes("scheduleCollabSync()"), "Handler must call scheduleCollabSync()")
assert.ok(handlerBlock.includes('notifyHost("editing")'), 'Handler must call notifyHost("editing")')

// --- (g) Handler sets appropriate status message ------------------------------
assert.ok(
  handlerBlock.includes('setStatus(t("Status.ResizeToCellNoTable"))') ||
    handlerBlock.includes('setStatus(t("Status.ResizeToCellNoTable"))'),
  "Handler must set no-table status message",
)
assert.ok(
  handlerBlock.includes('setStatus(t("Status.ObjectResizedToCell"))') ||
    handlerBlock.includes('setStatus(t("Status.ObjectResizedToCell"))'),
  "Handler must set resized status message",
)

console.log("ctx-resize-to-cell-PASS")

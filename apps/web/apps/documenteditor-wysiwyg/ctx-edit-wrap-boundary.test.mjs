/**
 * WO-22-ctx-edit-wrap-boundary: OO context menu "Edit wrap boundary…" — the
 * vector contour editor for the wrap polygon around a wrapped object
 * (slugs:ctx-edit-wrap-boundary), registered as a LOUD-LIMITED divergence.
 * Node built-in test runner (node:assert, zero dependencies).
 *
 * OO's "Edit wrap boundary" edits the wrap-polygon contour around an object.
 * WO has no vector contour model (objects are rectangular placeholders), so
 * the deliverable mirrors the ctx-edit-points absence instead of faking an
 * editor. Asserts the honest contract:
 *   (1) index.html has an "Edit wrap boundary…" ctx row gated on
 *       data-showif="object" inside the wrap block, localized through
 *       Ctx.EditWrapBoundary, with the park reason documented in a comment
 *   (2) i18n.js defines Ctx.EditWrapBoundary in BOTH the English and German
 *       catalogs
 *   (3) editor.js routes action "EditWrapBoundary" to the real helper
 *       reportEditWrapBoundaryUnavailable() (no console.log-only stub)
 *   (4) the helper emits the passive wo:edit-wrap-boundary CustomEvent
 *       marker (source "ctx-menu", available:false, onObject flag) and
 *       reports unavailability via setStatus(t("Status.NotAvailable") + …)
 *   (5) the unavailable path mutates NOTHING (no history/dirty/collab sinks)
 *
 * Run with: node apps/web/apps/documenteditor-wysiwyg/ctx-edit-wrap-boundary.test.mjs
 * Success: prints "ctx-edit-wrap-boundary-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-22-ctx-edit-wrap-boundary tests...\n")

// --- helpers ---------------------------------------------------------------

// Extract a top-level-in-closure function body (name + balanced braces).
function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `function ${name} must exist in editor.js`)
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

const deStart = i18nSrc.indexOf("const LOCALE_DE = {")
assert.notEqual(deStart, -1, "i18n.js must define LOCALE_DE")
const deSection = i18nSrc.slice(deStart)

// --- (1) the ctx row exists, is object-scoped and documents the park -------

const wrapRow = htmlSrc.match(/<button[^>]*data-ctx="EditWrapBoundary"[^>]*>[^<]*<\/button>/)
assert.ok(wrapRow, 'index.html must have a data-ctx="EditWrapBoundary" row')
assert.ok(
  /data-showif="object"/.test(wrapRow[0]),
  'the EditWrapBoundary row must carry data-showif="object"',
)
assert.ok(
  /data-i18n="Ctx\.EditWrapBoundary"/.test(wrapRow[0]),
  'the EditWrapBoundary row must be localized via data-i18n="Ctx.EditWrapBoundary"',
)
assert.ok(
  />Edit wrap boundary…<\/button>/.test(wrapRow[0]),
  'the EditWrapBoundary row must be labeled "Edit wrap boundary…" (OO wording, ellipsis)',
)
// It belongs to the wrap block: after every wrap entry, before Edit object.
// REALIGNED (L2O-06): the old check measured a fixed 900-char window after
// WrapThrough; L2M-03 inserted the TopAndBottom wrap row between them, so the
// window went stale while the row never left the block. The block is now
// derived from the row geometry itself (first wrap row → EditObject), so new
// wrap rows cannot silently re-stale this gate.
const wrapBlockStart = htmlSrc.indexOf('data-ctx="WrapInline"')
const wrapBlockEnd = htmlSrc.indexOf('data-ctx="EditObject"')
assert.ok(wrapBlockStart !== -1 && wrapBlockEnd !== -1,
  "index.html: the ctx wrap block (WrapInline … EditObject) must exist")
const wrapBlock = htmlSrc.slice(wrapBlockStart, wrapBlockEnd)
const boundaryAt = wrapBlock.indexOf('data-ctx="EditWrapBoundary"')
assert.ok(boundaryAt !== -1,
  "index.html: EditWrapBoundary row must sit inside the ctx wrap block")
for (const wrapRow of [
  "WrapInline", "WrapSquare", "WrapTight", "WrapBehind",
  "WrapFront", "WrapThrough", "TopAndBottom",
]) {
  const wrapAt = wrapBlock.indexOf(`data-ctx="${wrapRow}"`)
  assert.ok(wrapAt !== -1 && wrapAt < boundaryAt,
    `index.html: EditWrapBoundary row must sit after the ${wrapRow} wrap row`)
}
assert.ok(
  /data-ctx="EditWrapBoundary"[\s\S]{0,900}?data-ctx="EditObject"/.test(htmlSrc),
  "index.html: EditWrapBoundary row must sit before the Edit object row",
)
// The park reason must be documented in the markup next to the row.
const parkHtml = htmlSrc.slice(
  htmlSrc.lastIndexOf("<!--", htmlSrc.indexOf('data-ctx="EditWrapBoundary"')),
  htmlSrc.indexOf('data-ctx="EditWrapBoundary"'),
)
assert.ok(
  /WO-22-ctx-edit-wrap-boundary/.test(parkHtml),
  "index.html: the row's comment must reference the WO-22-ctx-edit-wrap-boundary park",
)
assert.ok(
  /no vector contour/i.test(parkHtml),
  "index.html: the park reason (no vector contour model) must be documented",
)
assert.ok(
  /unavailab/i.test(parkHtml),
  "index.html: the comment must state that the row reports unavailability",
)
console.log('ok 1 ctx row data-ctx="EditWrapBoundary" (data-showif="object") + park comment')

// --- (2) i18n parity (en + de) ---------------------------------------------

for (const [key, value, section, label] of [
  ["Ctx.EditWrapBoundary", "Edit wrap boundary…", i18nSrc, "English"],
  ["Ctx.EditWrapBoundary", "Umbruchsgrenze bearbeiten…", deSection, "German"],
]) {
  assert.ok(
    section.includes(`"${key}": "${value}"`),
    `${label} i18n must define ${key} = "${value}"`,
  )
}
console.log("ok 2 i18n key Ctx.EditWrapBoundary exists in en + de")

// --- (3) dispatcher arm routes to the real helper ---------------------------

const dispatcherStart = editorSrc.indexOf('ctxMenu.addEventListener("click", (e) => {')
assert.notEqual(dispatcherStart, -1, "the ctx-menu click dispatcher must exist")
const dispatcherSrc = editorSrc.slice(dispatcherStart, dispatcherStart + 40000)
assert.ok(
  dispatcherSrc.includes('action === "EditWrapBoundary"'),
  'the ctx dispatcher must handle action "EditWrapBoundary"',
)
const boundaryArm = dispatcherSrc.slice(
  dispatcherSrc.indexOf('action === "EditWrapBoundary"'),
  dispatcherSrc.indexOf("} else if", dispatcherSrc.indexOf('action === "EditWrapBoundary"') + 1),
)
assert.ok(
  boundaryArm.includes("closeCtx()"),
  "the EditWrapBoundary arm must close the context menu",
)
assert.ok(
  boundaryArm.includes("reportEditWrapBoundaryUnavailable()"),
  "the EditWrapBoundary arm must call the real helper reportEditWrapBoundaryUnavailable()",
)
assert.ok(
  !/\bconsole\.log\(/.test(boundaryArm),
  "the EditWrapBoundary arm must not be a console.log stub",
)
assert.ok(
  !/TODO|FIXME|not implemented|noop/i.test(boundaryArm),
  "the EditWrapBoundary arm must not be a TODO/no-op placeholder",
)
console.log('ok 3 dispatcher routes "EditWrapBoundary" to reportEditWrapBoundaryUnavailable()')

// --- (4) the helper: passive marker + loud NotAvailable feedback ------------

const helperFn = extractFunction(editorSrc, "reportEditWrapBoundaryUnavailable")
assert.ok(
  helperFn.includes('new CustomEvent("wo:edit-wrap-boundary"'),
  "the helper must dispatch the passive wo:edit-wrap-boundary CustomEvent marker",
)
assert.ok(
  helperFn.includes('source: "ctx-menu"'),
  'the marker detail must carry source: "ctx-menu"',
)
assert.ok(
  helperFn.includes("available: false"),
  "the marker detail must announce available: false (loud-limited divergence)",
)
assert.ok(
  helperFn.includes("onObject: !!obj"),
  "the marker detail must carry the onObject flag from selectedObject()",
)
assert.ok(
  helperFn.includes('setStatus(t("Status.NotAvailable") + " editWrapBoundary")'),
  'the helper must report unavailability via setStatus(t("Status.NotAvailable") + " editWrapBoundary")',
)
// The park reason must be documented in the editor code as well (comment
// block immediately above the helper).
const fnAt = editorSrc.indexOf("function reportEditWrapBoundaryUnavailable")
const helperPark = editorSrc.slice(Math.max(0, fnAt - 1600), fnAt)
assert.ok(
  /WO-22-ctx-edit-wrap-boundary/.test(helperPark),
  "editor.js: the helper's comment must reference the WO-22-ctx-edit-wrap-boundary park",
)
assert.ok(
  /no vector contour|NO vector contour/i.test(helperPark),
  "editor.js: the park reason (no vector contour model) must be documented",
)
console.log("ok 4 helper emits wo:edit-wrap-boundary marker + Status.NotAvailable feedback")

// --- (5) unavailable path mutates NOTHING -----------------------------------

for (const sink of [
  "captureHistory()",
  "markDirty()",
  "scheduleCollabSync()",
  "notifyHost(",
  "document.execCommand(",
  "insertAdjacentHTML",
  "classList.add",
  "setAttribute",
]) {
  assert.ok(
    !helperFn.includes(sink),
    `the unavailable path must not mutate the document (${sink} is forbidden)`,
  )
}
console.log("ok 5 the unavailable path performs no document mutation")

// --- (5b) functional check of the helper (real code, tiny fakes) ------------

class MarkerEvent {
  constructor(type, init) {
    this.type = type
    this.detail = init ? init.detail : null
  }
}
const runHelper = new Function(
  "selectedObject",
  "window",
  "console",
  "setStatus",
  "t",
  "CustomEvent",
  helperFn.slice(helperFn.indexOf("{") + 1, helperFn.lastIndexOf("}")),
)
const t = (key) => `[${key}]`

// with a selected object: marker fires with onObject:true + loud status
const seen = []
const statusCalls = []
const fakeWindow = { dispatchEvent: (ev) => seen.push(ev) }
runHelper(
  () => ({ tagName: "IMG", classList: { contains: () => false } }),
  fakeWindow,
  { info: () => {} },
  (msg) => statusCalls.push(msg),
  t,
  MarkerEvent,
)
assert.equal(seen.length, 1, "the helper must dispatch exactly one marker event")
assert.equal(
  seen[0].type,
  "wo:edit-wrap-boundary",
  "the marker event type must be wo:edit-wrap-boundary",
)
assert.equal(seen[0].detail.source, "ctx-menu", "the marker must announce its ctx-menu origin")
assert.equal(seen[0].detail.available, false, "the marker must announce available:false")
assert.equal(seen[0].detail.onObject, true, "onObject must be true when an object is selected")
assert.equal(
  statusCalls.length,
  1,
  "the helper must report unavailability exactly once via setStatus",
)
assert.equal(
  statusCalls[0],
  "[Status.NotAvailable] editWrapBoundary",
  "the status feedback must be the NotAvailable channel naming editWrapBoundary",
)

// without a selection: still loud (marker onObject:false + status), no throw
seen.length = 0
statusCalls.length = 0
runHelper(
  () => null,
  fakeWindow,
  { info: () => {} },
  (msg) => statusCalls.push(msg),
  t,
  MarkerEvent,
)
assert.equal(seen[0].detail.onObject, false, "onObject must be false with no selection")
assert.equal(statusCalls[0], "[Status.NotAvailable] editWrapBoundary")
console.log("ok 5b unavailable behavior verified against the real helper body")

console.log("\nAll WO-22-ctx-edit-wrap-boundary tests passed!\n")
console.log("ctx-edit-wrap-boundary-PASS")

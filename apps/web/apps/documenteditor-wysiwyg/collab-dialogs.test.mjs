/**
 * COLLAB-DIALOGS Tests (AF10)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Asserts the AF10-COLLAB-DIALOGS contract:
 *   (a) new collaboration ribbon buttons exist + their data-cmds are dispatched
 *   (b) new ctx-menu advanced-settings rows exist + are wired in the dispatcher
 *   (c) removeComment helper exists and is called by the Delete button handler
 *   (d) references ribbon buttons (update table, table of figures) wired
 *   (e) every new label has i18n keys in BOTH en and de
 *   (f) no bare console.log stubs in editor.js / i18n.js
 *
 * Run: node apps/web/apps/documenteditor-wysiwyg/collab-dialogs.test.mjs
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const html = readFileSync("index.html", "utf8")
const js = readFileSync("editor.js", "utf8")
const i18n = readFileSync("i18n.js", "utf8")

let n = 0
const ok = (msg) => console.log(`ok ${++n} ${msg}`)

// ---------------------------------------------------------------- (a)
// Collaboration ribbon: resolve/delete comments, combine, co-edit mode.
for (const cmd of ["resolveComment", "deleteComment", "combineRevisions"]) {
  assert.ok(html.includes(`data-cmd="${cmd}"`), `index.html must have data-cmd="${cmd}"`)
  assert.ok(js.includes(`cmd === "${cmd}"`), `editor.js runCommand must dispatch ${cmd}`)
}
ok("collab ribbon buttons (resolve/delete/combine) exist and dispatch")

const coeditSel = html.includes('id="coedit-mode"')
assert.ok(coeditSel, "index.html must have the coedit-mode select")
assert.ok(html.includes('value="fast"'), "coedit-mode must offer fast")
assert.ok(html.includes('value="strict"'), "coedit-mode must offer strict")
assert.ok(js.includes('getElementById("coedit-mode")'), "editor.js must wire the coedit-mode select")
assert.ok(js.includes('"wo:coedit-mode"'), "editor.js must dispatch wo:coedit-mode")
assert.ok(js.includes('console.info("wo: coedit-mode:"'), "coedit-mode change must emit a marker")
ok("co-editing mode select wired + wo:coedit-mode marker")

// ---------------------------------------------------------------- (b)
// Ctx-menu advanced-settings rows: exist in HTML, wired in dispatcher.
const ctxRows = [
  "DropcapSettings",
  "FrameSettings",
  "EquationSettings",
  "ContentControlSettings",
  "RemoveContentControl",
]
for (const row of ctxRows) {
  assert.ok(html.includes(`data-ctx="${row}"`), `index.html must have data-ctx="${row}"`)
  assert.ok(js.includes(`action === "${row}"`), `editor.js ctx dispatcher must handle ${row}`)
}
assert.ok(js.includes("openDropcapDialog();"), "DropcapSettings must open the dropcap dialog")
assert.ok(js.includes('"wo:frame-settings"'), "FrameSettings must emit wo:frame-settings")
assert.ok(js.includes('openVectorEditor("equation", spec, img)'), "EquationSettings must open the vector editor for equation objects")
assert.ok(js.includes('"wo:equation-settings"'), "EquationSettings must emit wo:equation-settings off-object")
assert.ok(js.includes('"wo:content-control-settings"'), "ContentControlSettings must emit wo:content-control-settings")
assert.ok(js.includes("contentControlAtSelection()"), "content-control rows must probe span.content-control at the caret")
ok("ctx advanced-settings rows exist and are wired")

// ---------------------------------------------------------------- (c)
// removeComment helper: exists, exported, called by Delete paths.
assert.ok(js.includes("function removeComment(span)"), "editor.js must define removeComment(span)")
assert.ok(js.includes("window.removeComment = removeComment"), "removeComment must be exported for tests/hosts")
assert.ok(/cmd === "deleteComment"[\s\S]{0,600}?removeComment\(span\)/.test(js), "ribbon Delete handler must call removeComment")
assert.ok(/function deleteComment\(el\) \{[\s\S]{0,400}?removeComment\(el\)/.test(js), "panel deleteComment must delegate to removeComment")
assert.ok(/function removeComment\(span\) \{[\s\S]{0,400}?parent\.removeChild\(span\)/.test(js), "removeComment must unwrap the span (keep its text)")
ok("removeComment helper exists and is called by Delete handlers")

// ---------------------------------------------------------------- (d)
// References ribbon: update table + table of figures.
assert.ok(html.includes('data-cmd="updateToc" data-i18n="Ref.UpdateTable"'), "references ribbon must have an update-table button")
assert.ok(html.includes('data-cmd="insertTableOfFigures" data-i18n="Ref.TableOfFigures"'), "references ribbon must have a table-of-figures button")
assert.ok(js.includes('cmd === "insertTableOfFigures") { insertTableOfFiguresCommand(); return; }'), "insertToF must dispatch to insertToFCommand")
assert.ok(js.includes('cmd === "updateToc"'), "updateToc must be dispatched")
assert.ok(js.includes('data-kind="figures"'), "figures TOC nav must exist in the insert path")
ok("references buttons (update table / table of figures) wired")

// ---------------------------------------------------------------- (e)
// i18n: every new label key present in BOTH the en base and the de catalog.
const newKeys = [
  "Collab.Resolve",
  "Collab.Delete",
  "Collab.Combine",
  "Collab.CoEditMode",
  "Collab.CoEditFast",
  "Collab.CoEditStrict",
  "Ref.UpdateTable",
  "Ref.TableOfFigures",
  "Ctx.DropcapSettings",
  "Ctx.FrameSettings",
  "Ctx.EquationSettings",
  "Ctx.ContentControlSettings",
  "Ctx.RemoveContentControl",
  "Status.NoCommentAtCaret",
  "Status.NoContentControl",
]
const deStart = i18n.indexOf("LOCALE_DE")
assert.notEqual(deStart, -1, "LOCALE_DE catalog must exist")
const enCatalog = i18n.slice(0, deStart)
const deCatalog = i18n.slice(deStart)
for (const key of newKeys) {
  assert.ok(enCatalog.includes(`"${key}"`), `i18n en must define ${key}`)
  assert.ok(deCatalog.includes(`"${key}"`), `i18n de must define ${key}`)
}
ok(`i18n keys present in both locales (${newKeys.length} keys)`)

// ---------------------------------------------------------------- (f)
// No bare console.log stubs anywhere (markers are console.info).
assert.ok(!js.includes("console.log("), "editor.js must not contain console.log stubs")
assert.ok(!i18n.includes("console.log("), "i18n.js must not contain console.log stubs")
ok("no bare console.log stubs")

console.log(`PASS collab-dialogs: ${n} checks`)

/**
 * WO-21-insert-spreadsheet: OnlyOffice parity — Insert > Table > Spreadsheet.
 *
 * OO's Insert tab > Table group dropdown has a "Spreadsheet" item that inserts
 * an OLE embedded spreadsheet object at the caret. This gate statically pins
 * the WO equivalent end to end:
 *
 *   1. the #btn-insert-more "Insert tools" dropdown gains a Spreadsheet
 *      menuitem wired with data-cmd="insertObject" data-value="spreadsheet"
 *      (the delegated .menu-list button[data-cmd] handler dispatches it),
 *   2. the Insert object dialog's #object-type select gains the spreadsheet
 *      preset, so openObjectDialog("spreadsheet") can preselect it,
 *   3. editor.js routes every non-shape preset — spreadsheet included — through
 *      openObjectDialog()/confirmObjectDialog(), which really inserts the
 *      anchored <div class="object" data-type="spreadsheet"> OLE placeholder
 *      (no stub, no silent no-op),
 *   4. Insert.Spreadsheet exists in BOTH the en and de catalogs.
 *
 * Run with: node insert-spreadsheet.test.mjs
 * Success: prints "insert-spreadsheet-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import vm from "node:vm"

const htmlSrc = readFileSync(new URL("./index.html", import.meta.url), "utf-8")
const editorSrc = readFileSync(new URL("./editor.js", import.meta.url), "utf-8")
const i18nSrc = readFileSync(new URL("./i18n.js", import.meta.url), "utf-8")

console.log("Running WO-21 insert-spreadsheet tests...\n")

// ── 1. Insert tools dropdown menu item ─────────────────────────────

const menuStart = htmlSrc.indexOf('id="btn-insert-more"')
assert.ok(
  menuStart !== -1,
  "WO-21: #btn-insert-more Insert tools dropdown must exist in index.html",
)
const menuBlock = htmlSrc.slice(menuStart, htmlSrc.indexOf("</ul>", menuStart) + 5)
assert.ok(menuBlock.includes("</ul>"), "WO-21: #btn-insert-more menu list must be extractable")

// The menuitem must be a real role="menuitem" button under the dropdown
const itemMatch = menuBlock.match(/<li role="none"><button[^>]*id="btn-spreadsheet".*?<\/li>/)
assert.ok(
  itemMatch,
  "WO-21: Spreadsheet menu item (btn-spreadsheet) must live in the insert dropdown",
)
const item = itemMatch[0]
assert.ok(
  item.includes('role="menuitem"'),
  "WO-21: the Spreadsheet menu item must be a role=menuitem button",
)
// The command wiring the delegated menu handler dispatches
assert.ok(
  item.includes('data-cmd="insertObject"') && item.includes('data-value="spreadsheet"'),
  "WO-21: the Spreadsheet menu item must emit insertObject with value spreadsheet",
)
assert.ok(
  item.includes('data-i18n="Insert.Spreadsheet"') && item.includes(">Spreadsheet</button>"),
  "WO-21: the Spreadsheet menu item must carry the Insert.Spreadsheet i18n key",
)
// It must NOT be a loud stub: stubs carry data-stub="<ref>"
assert.ok(!item.includes("data-stub="), "WO-21: the Spreadsheet menu item must not be a stub")

// ── 2. #object-type select gains the spreadsheet preset ────────────

const selectStart = htmlSrc.indexOf('<select id="object-type">')
assert.ok(selectStart !== -1, "WO-21: #object-type select must exist in the Insert object dialog")
const selectEnd = htmlSrc.indexOf("</select>", selectStart)
const selectBlock = htmlSrc.slice(selectStart, selectEnd)
const presets = [...selectBlock.matchAll(/<option value="([^"]+)">/g)].map((m) => m[1])
assert.ok(
  presets.includes("spreadsheet"),
  `WO-21: #object-type must offer a spreadsheet option (got: ${presets.join(", ")})`,
)
// The other object types must survive (the dialog stays generic)
for (const preset of ["shape", "textbox", "chart", "equation", "textart"]) {
  assert.ok(presets.includes(preset), `WO-21: #object-type must still offer ${preset}`)
}

// ── 3. editor.js: real routing + real insert, no no-op ─────────────

// runCommand handles insertObject and dispatches non-shape presets to the dialog
const insertObjMatch = editorSrc.match(/if \(cmd === "insertObject"\) \{[\s\S]*?\n {4}\}/)
assert.ok(insertObjMatch, "WO-21: editor.js must handle the insertObject command")
assert.ok(
  insertObjMatch[0].includes('objType === "shape"') &&
    insertObjMatch[0].includes("openObjectDialog(objType)"),
  "WO-21: insertObject must route non-shape presets (spreadsheet) through openObjectDialog",
)
// No dedicated spreadsheet branch silently short-circuits the generic path
assert.ok(
  !/cmd === "insertSpreadsheet"/.test(editorSrc),
  "WO-21: no divergent insertSpreadsheet command that bypasses the object machinery",
)

// openObjectDialog preselects the preset when #object-type offers it
const openDialogMatch = editorSrc.match(/function openObjectDialog\(preset\) \{[\s\S]*?\n {2}\}/)
assert.ok(openDialogMatch, "WO-21: openObjectDialog must exist in editor.js")
assert.ok(
  openDialogMatch[0].includes("presets.includes(preset)") &&
    openDialogMatch[0].includes("type.value = preset"),
  "WO-21: openObjectDialog must preselect the spreadsheet preset from #object-type",
)

// confirmObjectDialog generically inserts the anchored object placeholder
const confirmMatch = editorSrc.match(/function confirmObjectDialog\(\) \{[\s\S]*?\n {2}\}/)
assert.ok(confirmMatch, "WO-21: confirmObjectDialog must exist in editor.js")
assert.ok(
  confirmMatch[0].includes("'<div class=\"object\" data-type=\"' + escapeAttr(typ) + '\"'"),
  "WO-21: confirmObjectDialog must insert the object placeholder via data-type",
)
assert.ok(
  confirmMatch[0].includes('document.execCommand("insertHTML", false, html)') &&
    confirmMatch[0].includes("captureHistory()") &&
    confirmMatch[0].includes("markDirty()"),
  "WO-21: confirmObjectDialog must really insert (execCommand + history + dirty)",
)

// ── 4. i18n: Insert.Spreadsheet in BOTH en and de ──────────────────

// Load the real catalogs (CommonJS sandbox — same trick as chrome-gate.test.mjs)
const sandbox = { module: { exports: {} }, console }
vm.runInNewContext(i18nSrc, sandbox, { filename: "i18n.js" })
const {
  DEFAULT_TRANSLATIONS: en,
  LOCALE_CATALOGS: { de },
} = sandbox.module.exports
assert.ok(
  Object.hasOwn(en, "Insert.Spreadsheet"),
  "WO-21: en catalog must define Insert.Spreadsheet",
)
assert.ok(
  Object.hasOwn(de, "Insert.Spreadsheet"),
  "WO-21: de catalog must define Insert.Spreadsheet",
)
assert.ok(
  typeof en["Insert.Spreadsheet"] === "string" && en["Insert.Spreadsheet"].trim().length > 0,
  "WO-21: en Insert.Spreadsheet must be a non-empty label",
)
assert.ok(
  typeof de["Insert.Spreadsheet"] === "string" && de["Insert.Spreadsheet"].trim().length > 0,
  "WO-21: de Insert.Spreadsheet must be a non-empty label",
)

console.log("All WO-21 insert-spreadsheet tests passed!\n")
console.log("insert-spreadsheet-PASS")

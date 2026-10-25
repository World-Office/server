/**
 * INSERT-CTX-CLEANUP Tests
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Asserts the AF8-INSERT-CTX-CLEANUP contract:
 *   (1) Insert ribbon page carries the 5 residual controls:
 *       Blank page, Text box, Text art, Comment + Breaks dropdown
 *       — and every data-cmd is dispatched in editor.js runCommand
 *   (2) the 16 new ctx-menu completion rows exist as data-ctx AND are
 *       handled in the editor.js ctx dispatcher
 *   (3) every new label has an i18n key in BOTH en and de
 *   (4) no bare console.log stubs anywhere in editor.js (loud-stub
 *       doctrine: contracts use console.info + wo: events)
 *   (5) the ctx menu grew to >= 40 data-ctx rows
 *
 * Run: node apps/web/apps/documenteditor-wysiwyg/insert-ctx-cleanup.test.mjs
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

// Brace-match from a marker and return the source slice up to the
// matching closing brace (inclusive). Same technique ctx-menu.test.mjs uses.
function braceMatch(src, startMarker) {
  const start = src.indexOf(startMarker)
  assert.notEqual(start, -1, `marker must exist: ${startMarker}`)
  let depth = 0
  let i = start
  let foundOpen = false
  for (; i < src.length; i++) {
    if (src[i] === "{") {
      depth++
      foundOpen = true
      break
    }
  }
  assert.ok(foundOpen, `marker must have opening brace: ${startMarker}`)
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}") {
      depth--
      if (depth === 0) break
    }
  }
  assert.equal(depth, 0, `marker must have balanced braces: ${startMarker}`)
  return src.slice(start, i + 1)
}

function sliceBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker)
  assert.notEqual(start, -1, `start marker must exist: ${startMarker}`)
  const end = src.indexOf(endMarker, start + 1)
  assert.notEqual(end, -1, `end marker must exist after start: ${endMarker}`)
  return src.slice(start, end)
}

// Read files
const html = readFileSync(new URL("./index.html", import.meta.url), "utf8")
const js = readFileSync(new URL("./editor.js", import.meta.url), "utf8")
const i18n = readFileSync(new URL("./i18n.js", import.meta.url), "utf8")
const css = readFileSync(new URL("./style.css", import.meta.url), "utf8")

// --- Slices ---
const insertPage = sliceBetween(
  html,
  '<div class="ribbon-page" data-tab="insert"',
  '<div class="ribbon-page" data-tab="draw"',
)
const ctxMenuBlock = sliceBetween(html, '<div id="ctx-menu"', '<div id="table-dialog"')
const runCommandFn = braceMatch(js, "function runCommand(cmd, value) {")
const ctxDispatcher = braceMatch(js, 'ctxMenu.addEventListener("click", (e) => {')

// German locale catalog (brace-matched slice)
const deSection = braceMatch(i18n, "const LOCALE_DE = {")

// --- Test (1): insert ribbon residual controls + runCommand dispatch ---
const INSERT_CMDS = [
  "insertBlankPage",
  "insertTextbox",
  "insertTextart",
  "insertComment",
]
for (const cmd of INSERT_CMDS) {
  assert.notEqual(
    insertPage.indexOf(`data-cmd="${cmd}"`),
    -1,
    `insert ribbon page must carry data-cmd="${cmd}"`,
  )
  assert.notEqual(
    runCommandFn.indexOf(`cmd === "${cmd}"`),
    -1,
    `runCommand must dispatch "${cmd}"`,
  )
}

// Text box / text art reuse the object-insert machinery; Comment reuses
// the AddComment dialog — assert the wiring targets, not just the branch.
assert.notEqual(
  runCommandFn.indexOf('cmd === "insertTextbox") { openObjectDialog("textbox")'),
  -1,
  "insertTextbox must open the object dialog with textbox preset",
)
assert.notEqual(
  runCommandFn.indexOf('cmd === "insertTextart") { openObjectDialog("textart")'),
  -1,
  "insertTextart must open the object dialog with textart preset",
)
assert.notEqual(
  runCommandFn.indexOf('cmd === "insertComment") { openCommentDialog()'),
  -1,
  "insertComment must reuse openCommentDialog",
)

// Blank page shares the page-break contract branch (OO parity).
assert.notEqual(
  runCommandFn.indexOf(
    'cmd === "insertHR" || cmd === "insertPageBreak" || cmd === "insertBlankPage"',
  ),
  -1,
  "insertBlankPage must share the insertHR/insertPageBreak contract branch",
)

// Breaks dropdown: menu trigger + the 3 break rows, all dispatched.
assert.notEqual(
  insertPage.indexOf('data-i18n="Layout.Breaks"'),
  -1,
  "insert ribbon page must carry the Breaks dropdown trigger",
)
for (const cmd of ["insertPageBreak", "insertColumnBreak", "insertSectionBreak"]) {
  assert.notEqual(
    insertPage.indexOf(`data-cmd="${cmd}"`),
    -1,
    `Breaks dropdown must carry data-cmd="${cmd}"`,
  )
  assert.notEqual(
    runCommandFn.indexOf(`cmd === "${cmd}"`),
    -1,
    `runCommand must dispatch "${cmd}"`,
  )
}

// toggleKeepLines + printSelection are real runCommand implementations.
assert.notEqual(runCommandFn.indexOf('cmd === "toggleKeepLines"'), -1,
  "runCommand must implement toggleKeepLines")
assert.notEqual(runCommandFn.indexOf('cmd === "printSelection"'), -1,
  "runCommand must implement printSelection")

console.log(`(1) insert ribbon: ${INSERT_CMDS.length} new controls + Breaks dropdown wired`)

// --- Test (2): 16 new ctx actions exist AND are handled ---
const NEW_CTX_ACTIONS = [
  "EditLink",
  "RemoveLink",
  "KeepLines",
  "StartNewList",
  "ContinueNumbering",
  "SetNumberingValue",
  "AdjustListIndents",
  "FormattingAsStyle",
  "PrintSelection",
  "AcceptChange",
  "RejectChange",
  "ParagraphSettings",
  "TocSettings",
  "UpdateField",
  "EditField",
  "ToggleFieldCodes",
]
for (const action of NEW_CTX_ACTIONS) {
  assert.notEqual(
    ctxMenuBlock.indexOf(`data-ctx="${action}"`),
    -1,
    `ctx menu must carry data-ctx="${action}"`,
  )
  assert.notEqual(
    ctxDispatcher.indexOf(`action === "${action}"`),
    -1,
    `ctx dispatcher must handle "${action}"`,
  )
}

// Link edit/remove reuse the link-dialog machinery via named helpers.
for (const fn of [
  "editLinkAtSelection",
  "removeLinkAtSelection",
  "trackedChangeAtSelection",
  "fieldOpAtSelection",
  "anchorAtSelection",
]) {
  assert.notEqual(js.indexOf(`function ${fn}(`), -1, `editor.js must define ${fn}()`)
}
assert.notEqual(js.indexOf("let editingAnchor = null;"), -1,
  "editor.js must declare the editingAnchor dialog-mode flag")

// keep-lines has both a DOM class and a pagination rule.
assert.notEqual(css.indexOf("#editor .keep-lines"), -1,
  "style.css must carry the .keep-lines pagination rule")
assert.notEqual(runCommandFn.indexOf('classList.toggle("keep-lines"'), -1,
  "toggleKeepLines must toggle the keep-lines class")
assert.notEqual(runCommandFn.indexOf('new CustomEvent("wo:keep-lines"'), -1,
  "toggleKeepLines must emit the wo:keep-lines contract event")
assert.notEqual(runCommandFn.indexOf('new CustomEvent("wo:print-selection"'), -1,
  "printSelection must emit the wo:print-selection contract event")

console.log(`(2) ctx menu: ${NEW_CTX_ACTIONS.length} new actions wired + helpers defined`)

// --- Test (3): i18n keys in BOTH en and de ---
for (const action of NEW_CTX_ACTIONS) {
  const key = `"Ctx.${action}":`
  assert.notEqual(i18n.indexOf(key), -1, `missing English key ${key}`)
  assert.notEqual(deSection.indexOf(key), -1, `missing German key ${key}`)
}
assert.notEqual(i18n.indexOf('"Insert.BlankPage": "Blank page",'), -1,
  "English Insert.BlankPage label")
assert.notEqual(i18n.indexOf('"Insert.Comment": "Comment",'), -1,
  "English Insert.Comment label")
assert.notEqual(deSection.indexOf('"Insert.BlankPage": "Leere Seite",'), -1,
  "German Insert.BlankPage label")
assert.notEqual(deSection.indexOf('"Insert.Comment": "Kommentar",'), -1,
  "German Insert.Comment label")
// Spot-check German values are actually translated (not key-echoed).
for (const [key, value] of [
  ['"Ctx.EditLink"', '"Link bearbeiten"'],
  ['"Ctx.AcceptChange"', '"Änderung annehmen"'],
  ['"Ctx.FormattingAsStyle"', '"Formatierung als Formatvorlage"'],
]) {
  const line = deSection.split("\n").find((l) => l.includes(`${key}`))
  assert.ok(line && line.includes(value), `German ${key} must translate to ${value}`)
}

console.log("(3) i18n: all new keys present in en + de")

// --- Test (4): no bare console.log stubs in editor.js ---
assert.equal(js.includes("console.log("), false,
  "editor.js must not contain bare console.log (loud-stub doctrine: use console.info)")
assert.equal(ctxDispatcher.includes("console.log("), false,
  "ctx dispatcher must not contain bare console.log")
console.log("(4) no bare console.log stubs in editor.js")

// --- Test (5): ctx menu grew to >= 40 rows ---
const ctxRows = (ctxMenuBlock.match(/data-ctx="[^"]+"/g) || []).length
console.log(`Found ${ctxRows} data-ctx rows in the ctx menu`)
assert.ok(ctxRows >= 40, `ctx menu must have >=40 data-ctx rows, found ${ctxRows}`)

console.log("INSERT-CTX-CLEANUP-PASS")

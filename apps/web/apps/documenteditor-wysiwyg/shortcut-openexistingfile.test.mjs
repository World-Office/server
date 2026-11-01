/**
 * WO-22-shortcut-openexistingfile: OO Cmd/Ctrl+O opens an existing file (L0, real)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that editor.js binds Cmd/Ctrl+O (no Shift, no Alt) in the C1
 * keydown parity block to openBackstage("open") — the OO Open flow: the
 * backstage overlay landing on the Open/Recent pane — instead of the
 * browser's native file-open dialog. Also verifies that the target pane
 * really exists (index.html rows/views) so the handler is not a stub.
 *
 * Run with: node apps/web/apps/documenteditor-wysiwyg/shortcut-openexistingfile.test.mjs
 * Success: prints "shortcut-openexistingfile-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorSrc = readFileSync(new URL("./editor.js", import.meta.url), "utf-8")
const htmlSrc = readFileSync(new URL("./index.html", import.meta.url), "utf-8")

console.log("Running WO-22-shortcut-openexistingfile tests...\n")

// --- The C1 shortcut parity block must exist ---------------------------
const c1Start = editorSrc.indexOf("// C1 SHORTCUT PARITY (OO shortcut census")
assert.notEqual(c1Start, -1, "C1 SHORTCUT PARITY block must exist in editor.js")
const c1End = editorSrc.indexOf("// Function keys (no ctrl required)", c1Start)
assert.ok(c1End > c1Start, "C1 block boundaries must be locatable")
const c1 = editorSrc.slice(c1Start, c1End)

// --- The dedicated no-shift/no-alt sub-block ---------------------------
// OO binds plain Cmd/Ctrl+O, so the guard must exclude Shift and Alt.
const modGuard = c1.indexOf("if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey) {")
assert.notEqual(modGuard, -1, "C1 must contain a (ctrl||meta) && !shift && !alt block")

// --- The Cmd/Ctrl+O binding itself -------------------------------------
const oIdx = c1.indexOf('ev.key === "o" || ev.key === "O"', modGuard)
assert.ok(oIdx > modGuard, 'Cmd/Ctrl+O must match key "o"/"O" inside the no-shift/no-alt block')

const lineEnd = c1.indexOf("\n", oIdx)
const bindingLine = c1.slice(oIdx, lineEnd === -1 ? c1.length : lineEnd)
assert.ok(
  bindingLine.includes("ev.preventDefault()"),
  "Cmd/Ctrl+O must preventDefault() so the browser file-open dialog is suppressed",
)
assert.ok(
  bindingLine.includes('openBackstage("open")'),
  'Cmd/Ctrl+O must call openBackstage("open")',
)
assert.ok(
  c1.slice(oIdx, oIdx + 120).includes("return"),
  "Cmd/Ctrl+O handler must return after handling so no later rule claims the combo",
)

// Uppercase O (Caps Lock) must be covered by the case-insensitive match.
assert.ok(
  editorSrc.includes('ev.key === "o" || ev.key === "O"'),
  "binding must match both lowercase and uppercase o",
)

// No conflicting handler elsewhere in the main ctrl block.
const mainCtrlIdx = editorSrc.indexOf("if ((ev.ctrlKey || ev.metaKey) && !ev.altKey) {", c1Start)
if (mainCtrlIdx !== -1 && mainCtrlIdx < c1End) {
  assert.ok(
    editorSrc.slice(mainCtrlIdx, c1End).indexOf('k === "o"') === -1,
    "no second Ctrl+O handler may shadow the C1 binding",
  )
}

// --- openBackstage("open") must be a real, existing opener -------------
assert.ok(
  editorSrc.includes("function openBackstage(pane) {"),
  "openBackstage must be an existing function",
)
const fnStart = editorSrc.indexOf("function openBackstage(pane) {")
const fnBody = editorSrc.slice(fnStart, editorSrc.indexOf("function closeAllMenus()", fnStart))
assert.ok(
  fnBody.includes('const target = pane || "open"'),
  "openBackstage defaults to the open pane",
)
assert.ok(fnBody.includes("showBackstagePane(target)"), "openBackstage shows the requested pane")
assert.ok(fnBody.includes("bsHydratePanes()"), "openBackstage hydrates pane content")

// --- The "open" pane must really exist in the markup -------------------
assert.ok(
  htmlSrc.includes('data-pane="open"'),
  'index.html must contain the backstage row data-pane="open"',
)
assert.ok(
  htmlSrc.includes('data-pane-view="open"'),
  'index.html must contain the backstage view data-pane-view="open"',
)

console.log("ok C1 block has (ctrl||meta) && !shift && !alt guard")
console.log('ok Cmd/Ctrl+O matches key "o"/"O" with preventDefault()')
console.log('ok handler calls openBackstage("open") and returns')
console.log("ok openBackstage is a real opener (showBackstagePane + hydration)")
console.log('ok backstage "open" pane exists in index.html')
console.log("\nshortcut-openexistingfile-PASS")

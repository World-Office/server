/**
 * WO-22-shortcut-openfilepanel: OO Ctrl+Alt+F focuses the file/navigation panel (L0, real)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that editor.js contains the OO-parity Ctrl+Alt+F binding
 * that opens the backstage with the "open" pane and focuses the recent-files
 * list container.
 *
 * Run with: node apps/web/apps/documenteditor-wysiwyg/shortcut-openfilepanel.test.mjs
 * Success: prints "shortcut-openfilepanel-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")

console.log("Running WO-22-shortcut-openfilepanel tests...\n")

// The C1 keydown block must exist
const c1BlockStart = editorSrc.indexOf("// C1 SHORTCUT PARITY (OO shortcut census")
assert.notEqual(c1BlockStart, -1, "C1 SHORTCUT PARITY block must exist")

// The Ctrl+Alt block must exist
const ctrlAltBlockStart = editorSrc.indexOf(
  "if ((ev.ctrlKey || ev.metaKey) && ev.altKey) {",
  c1BlockStart,
)
assert.notEqual(ctrlAltBlockStart, -1, "Ctrl+Alt block must exist in C1")

// The handler must check for key "f" within the Ctrl+Alt block
const ctrlAltSection = editorSrc.slice(ctrlAltBlockStart)
const fCheckIndex = ctrlAltSection.indexOf('k === "f"')
assert.notEqual(fCheckIndex, -1, "Ctrl+Alt+F handler must check for key f")

// The handler must check for !ev.shiftKey
const handlerStart = ctrlAltBlockStart + ctrlAltSection.indexOf('k === "f"')
const handlerEnd = editorSrc.indexOf("return;", handlerStart) + 7
const handlerText = editorSrc.slice(handlerStart, handlerEnd)
assert.ok(handlerText.includes("!ev.shiftKey"), "Handler must check for !ev.shiftKey")

// The handler must call openBackstage("open")
const hasOpenBackstageOpen = editorSrc.includes('openBackstage("open")')
assert.ok(hasOpenBackstageOpen, "Handler must call openBackstage with open pane")

// The handler must focus the backstage-recent element
const hasBackstageRecentFocus =
  editorSrc.includes('getElementById("backstage-recent")') && editorSrc.includes("rec.focus()")
assert.ok(hasBackstageRecentFocus, "Handler must focus backstage-recent element")

// The handler must call preventDefault
const openBackstageIndex = editorSrc.indexOf('openBackstage("open")')
const pdBefore = editorSrc.lastIndexOf("ev.preventDefault()", openBackstageIndex)
assert.ok(pdBefore !== -1, "Handler must call preventDefault before openBackstage")

// The handler must have a return statement
const returnIndex = editorSrc.indexOf("return;", openBackstageIndex)
assert.notEqual(returnIndex, -1, "Handler must return after processing")

// The handler must check the key is f in lowercase (case-insensitive)
const hasLowercaseF = editorSrc.includes('k === "f"')
assert.ok(hasLowercaseF, "Handler must check for lowercase f")

// index.html must have the backstage-recent element
assert.ok(htmlSrc.includes('id="backstage-recent"'), "HTML must have backstage-recent element")

// openBackstage function must exist
assert.ok(editorSrc.includes("function openBackstage(pane)"), "openBackstage function must exist")

// The handler code must be present as a single statement chain
const handlerFull = editorSrc.includes('ev.preventDefault(); openBackstage("open");')
assert.ok(handlerFull, "Handler must chain preventDefault and openBackstage calls")

console.log("ok C1 SHORTCUT PARITY block exists")
console.log("ok Ctrl+Alt+F handler present in Ctrl+Alt block")
console.log("ok Handler checks for !ev.shiftKey")
console.log("ok Handler calls openBackstage with open pane")
console.log("ok Handler focuses backstage-recent element")
console.log("ok Handler calls preventDefault")
console.log("ok Handler has return statement")
console.log("ok Handler checks for lowercase f")
console.log("ok backstage-recent element exists in HTML")
console.log("ok openBackstage function exists")
console.log("ok Handler chains commands correctly")
console.log("\nshortcut-openfilepanel-PASS")

/**
 * WO-22-shortcut-strikeout: OO Shift+Meta+X toggles strikethrough (L0, real)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that editor.js binds Ctrl/Cmd+Shift+X (OO convention — Shift+Meta+X
 * on Mac, Ctrl+Shift+X PC variant; one binding covers both) in the C1 keydown
 * parity shift-group to emitCommand("strikeThrough") — the existing, verified
 * strikethrough command already used by the toolbar button and the ctx-menu
 * StrikeThrough arm. Also verifies the binding is case-insensitive (x/X),
 * excludes Alt combos, is conflict-free in the C1 block, and that the toolbar
 * button advertises the combo via aria-keyshortcuts with matching i18n
 * tooltips in both locale catalogs.
 *
 * Run with: node apps/web/apps/documenteditor-wysiwyg/shortcut-strikeout.test.mjs
 * Success: prints "shortcut-strikeout-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorSrc = readFileSync(new URL("./editor.js", import.meta.url), "utf-8")
const htmlSrc = readFileSync(new URL("./index.html", import.meta.url), "utf-8")
const i18nSrc = readFileSync(new URL("./i18n.js", import.meta.url), "utf-8")

console.log("Running WO-22-shortcut-strikeout tests...\n")

// --- The C1 shortcut parity block must exist ---------------------------
const c1Start = editorSrc.indexOf("// C1 SHORTCUT PARITY (OO shortcut census")
assert.notEqual(c1Start, -1, "C1 SHORTCUT PARITY block must exist in editor.js")
const c1End = editorSrc.indexOf("// Function keys (no ctrl required)", c1Start)
assert.ok(c1End > c1Start, "C1 block boundaries must be locatable")
const c1 = editorSrc.slice(c1Start, c1End)

// --- The shift-group block must exist inside C1 ------------------------
// OO's Ctrl/Cmd+Shift+combos live in the (ctrl||meta)&&shift&&!alt
// sub-block, which runs before the guarded ctrl/!altKey handler below.
const shiftGroupHeader = "if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && !ev.altKey) {"
const shiftStart = c1.indexOf(shiftGroupHeader)
assert.ok(shiftStart !== -1, "C1 must contain the (ctrl||meta) && shift && !alt shift-group block")
assert.ok(
  shiftGroupHeader.includes("!ev.altKey"),
  "shift-group must exclude Alt so Alt-combos stay free",
)
const shiftEnd = c1.indexOf("\n    }\n", shiftStart)
assert.ok(shiftEnd > shiftStart, "shift-group block boundaries must be locatable")
const shiftGroup = c1.slice(shiftStart, shiftEnd)

// --- The Ctrl/Cmd+Shift+X binding itself -------------------------------
const xIdx = shiftGroup.indexOf('k === "x"')
assert.ok(xIdx !== -1, 'shift-group must bind k === "x" for Ctrl/Cmd+Shift+X')

const lineEnd = shiftGroup.indexOf("\n", xIdx)
const xBinding = shiftGroup.slice(xIdx, lineEnd === -1 ? shiftGroup.length : lineEnd)
assert.ok(xBinding.includes("ev.preventDefault()"), "Ctrl/Cmd+Shift+X must preventDefault()")
assert.ok(
  xBinding.includes('emitCommand("strikeThrough")'),
  'Ctrl/Cmd+Shift+X must emitCommand("strikeThrough")',
)
assert.ok(xBinding.includes("return"), "Ctrl/Cmd+Shift+X handler must return after handling")

// Case-insensitive: the block lower-cases ev.key so both x and X match —
// Shift+Meta+X reports "X" in ev.key on Mac and most layouts.
assert.ok(
  shiftGroup.includes("const k = ev.key.toLowerCase()"),
  "shift-group must lower-case the key so both x and X are covered",
)

// Exactly one "x" key handler lives in the SHIFT group (no duplicates that
// could shadow or conflict with the strikeout binding). The C1 block also
// carries an Alt+X handler for unicode-escape replacement in the alt block —
// a different modifier set, so count within the shift slice only.
const xCount = (shiftGroup.match(/k === "x"/g) || []).length
assert.ok(xCount === 1, "exactly one x binding in the C1 shift block (no conflicting duplicates)")

// --- strikeThrough must be a real, existing command --------------------
// The ctx-menu arm routes the same command, and runCommand arms
// dirty/history for it (native execCommand path — not a stub).
const ctxArmIdx = editorSrc.indexOf('} else if (action === "StrikeThrough") {')
assert.ok(ctxArmIdx !== -1, "ctx-menu StrikeThrough arm must exist")
const ctxArm = editorSrc.slice(ctxArmIdx, ctxArmIdx + 120)
assert.ok(ctxArm.includes('emitCommand("strikeThrough")'), "ctx-menu arm emits the same command")
assert.ok(
  editorSrc.includes('cmd === "strikeThrough" ||'),
  "runCommand must arm dirty/history for strikeThrough (real command path)",
)

// --- Toolbar button + a11y advertisement -------------------------------
const strikeBtn = htmlSrc.match(/<button[^>]*data-cmd="strikeThrough"[^>]*>/)
assert.ok(strikeBtn, 'toolbar button with data-cmd="strikeThrough" must exist')
assert.ok(
  strikeBtn[0].includes('aria-keyshortcuts="Control+Shift+X Meta+Shift+X"'),
  "toolbar button must advertise Control+Shift+X and Meta+Shift+X via aria-keyshortcuts",
)

// --- i18n: tooltip present in both catalogs with the combo -------------
const titleCount = i18nSrc.split('"Toolbar.StrikethroughTitle"').length - 1
assert.ok(titleCount >= 2, "Toolbar.StrikethroughTitle must be present in both en and de catalogs")
assert.ok(
  i18nSrc.includes('"Toolbar.StrikethroughTitle": "Strikethrough (Ctrl+Shift+X)"'),
  "English tooltip must advertise Ctrl+Shift+X",
)
assert.ok(
  i18nSrc.includes('"Toolbar.StrikethroughTitle": "Durchgestrichen (Strg+Shift+X)"'),
  "German tooltip must advertise Strg+Shift+X",
)

console.log("ok C1 shift-group block present (ctrl||meta && shift && !alt)")
console.log('ok Ctrl/Cmd+Shift+X binds k === "x" with preventDefault()')
console.log('ok handler calls emitCommand("strikeThrough") and returns')
console.log("ok binding is case-insensitive (x/X) and Alt-combo free")
console.log("ok strikeThrough is a real command (ctx arm + runCommand history arming)")
console.log("ok toolbar button advertises Control+Shift+X Meta+Shift+X")
console.log("ok Toolbar.StrikethroughTitle i18n present in both locales")
console.log("\nshortcut-strikeout-PASS")

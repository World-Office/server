/**
 * WO-22-shortcut-replaceunicodetosymbol: OO Alt+Meta+X replaces a unicode
 * escape with its symbol (L0, real)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that editor.js binds Alt+Meta+X (Mac Opt+Cmd+X) / Ctrl+Alt+X (PC)
 * inside the C1 SHORTCUT PARITY block to replaceUnicodeEscape(), that the
 * helper ships the /\\(u\{[0-9a-fA-F]{1,6}\}|u[0-9a-fA-F]{4})/ scanner plus
 * the String.fromCodePoint replacement (guarding >0x10FFFF as a no-op), and
 * that the i18n status strings exist so the handler is not a stub. The exact
 * regex literals are extracted from editor.js and exercised on real inputs.
 *
 * Run with: node apps/web/apps/documenteditor-wysiwyg/shortcut-replaceunicodetosymbol.test.mjs
 * Success: prints "shortcut-replaceunicodetosymbol-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorSrc = readFileSync(new URL("./editor.js", import.meta.url), "utf-8")
const i18nSrc = readFileSync(new URL("./i18n.js", import.meta.url), "utf-8")

console.log("Running WO-22-shortcut-replaceunicodetosymbol tests...\n")

// --- The C1 shortcut parity block must exist ---------------------------
const c1Start = editorSrc.indexOf("// C1 SHORTCUT PARITY")
assert.notEqual(c1Start, -1, "C1 SHORTCUT PARITY block must exist in editor.js")
const c1End = editorSrc.indexOf("// Function keys", c1Start)
assert.ok(c1End > c1Start, "C1 block boundaries must be locatable")
const c1 = editorSrc.slice(c1Start, c1End)

// --- The Alt-combo sub-block (em-dash/currency) must exist -------------
const altCombo = c1.indexOf("if ((ev.ctrlKey || ev.metaKey) && ev.altKey) {")
assert.notEqual(altCombo, -1, "C1 must contain the (ctrl||meta) && alt block")

// --- The Alt+Meta+X / Ctrl+Alt+X binding -------------------------------
const xIdx = c1.indexOf('k === "x"', altCombo)
assert.ok(xIdx > altCombo, 'Alt+X must match key "x" (lowercased, covers x/X) inside the alt block')
const xLineEnd = c1.indexOf("\n", xIdx)
const xLine = c1.slice(xIdx, xLineEnd === -1 ? c1.length : xLineEnd)
assert.ok(xLine.includes("ev.preventDefault()"), "Alt+X handler must preventDefault()")
assert.ok(
  xLine.includes("replaceUnicodeEscape()"),
  "Alt+X handler must call replaceUnicodeEscape()",
)
assert.ok(xLine.includes("return"), "Alt+X handler must return so no later rule claims the combo")

// No conflicting second Alt+X handler in the same block: strikeout's x lives
// in the ctrl+shift block, this one in the alt block — count within the alt
// slice only (the scoped xIdx above already located it), not the whole C1.
const altSlice = c1.slice(altCombo)
assert.ok(
  (altSlice.match(/k === "x"/g) || []).length === 1,
  "exactly one Alt+X handler may exist in the C1 alt block",
)

// --- The helper wiring must exist (real command, not a stub) -----------
const helperIdx = editorSrc.indexOf("function replaceUnicodeEscape()")
assert.notEqual(helperIdx, -1, "replaceUnicodeEscape() must be defined")
const helperTail = editorSrc.indexOf("function replaceUnicodeToken(", helperIdx)
assert.ok(helperTail > helperIdx, "replaceUnicodeToken() must follow the entry point")
const replaceTail = editorSrc.indexOf("function replaceUnicodeToken(sel, startNode,", helperTail)
assert.ok(replaceTail === helperTail, "replaceUnicodeToken must carry the selection args")
const tokenBody = editorSrc.slice(
  helperTail,
  editorSrc.indexOf("function spellReplaceAtSelection", helperTail) - 1,
)
for (const wire of [
  "markDirty()",
  "captureHistory()",
  "scheduleCollabSync()",
  'notifyHost("editing")',
  "String.fromCodePoint(",
  "deleteContents()",
  "insertNode(",
  "> 0x10ffff",
]) {
  assert.ok(tokenBody.includes(wire), `replacement wiring must include ${wire}`)
}

// --- Extract the real regex literals from the source -------------------
/** Pull a `/.../ ` regex literal assigned via `= /.../;` out of the source. */
function extractRegex(src, anchor) {
  const idx = src.indexOf(anchor)
  assert.notEqual(idx, -1, `regex literal assignment must exist: ${anchor}`)
  const lineEnd = src.indexOf("\n", idx)
  const line = src.slice(idx, lineEnd === -1 ? src.length : lineEnd)
  const m = /=\s*\/(.*)\/(;)?$/.exec(line)
  assert.ok(m, `regex literal must be parseable on line: ${line}`)
  return new RegExp(m[1])
}

const escapeLeft = extractRegex(editorSrc, "UNICODE_ESCAPE_LEFT =")
const escapeAny = extractRegex(editorSrc, "UNICODE_ESCAPE_ANY =")

// --- Exercise the caret-left scan + conversion -------------------------
// \uXXXX form directly left of the caret -> en dash (U+2013).
const dashBefore = "text" + "\\u2013"
const mDash = escapeLeft.exec(dashBefore)
assert.ok(mDash, "\\u2013 left of the caret must match")
assert.equal(mDash[1], undefined, "four-hex form fills group 2, not group 1")
assert.equal(Number.parseInt(mDash[2], 16), 0x2013, "hex digits parse to U+2013")
assert.equal(
  String.fromCodePoint(Number.parseInt(mDash[2], 16)),
  "–",
  "\\u2013 converts to en dash",
)

// \u{...} form -> astral emoji (U+1F600).
const emojiBefore = "x" + "\\u{1F600}"
const mEmoji = escapeLeft.exec(emojiBefore)
assert.ok(mEmoji, "\\u{1F600} left of the caret must match")
assert.equal(mEmoji[1], "1F600", "brace form fills group 1")
assert.equal(
  String.fromCodePoint(Number.parseInt(mEmoji[1], 16)),
  "😀",
  "\\u{1F600} converts to 😀",
)

// The full-token matcher (selection covers exactly one escape).
assert.ok(escapeAny.test("\\u2013"), "full-token matcher accepts \\u2013")
assert.ok(escapeAny.test("\\u{1F600}"), "full-token matcher accepts \\u{1F600}")
assert.ok(!escapeAny.test("x\\u2013"), "full-token matcher rejects surrounding text")

// Range guard: >0x10FFFF must be rejected as a no-op.
assert.ok(0x110000 > 0x10ffff, "U+110000 is out of the astral range")
assert.ok(editorSrc.includes("cp > 0x10ffff"), "helper must guard codepoints above 0x10FFFF")

// Tokens must be adjacent to the caret: a trailing char breaks the match.
assert.equal(escapeLeft.exec("\\u2013 "), null, "token not ending at the caret must not match")
assert.equal(escapeLeft.exec("\\u{1F600x}"), null, "malformed brace token must not match")

// --- i18n status strings must exist (EN + DE) --------------------------
assert.ok(i18nSrc.includes('"Status.NoUnicodeEscape"'), "EN Status.NoUnicodeEscape key must exist")
assert.ok(
  i18nSrc.includes('"Status.UnicodeEscapeInserted"'),
  "EN Status.UnicodeEscapeInserted key must exist",
)
assert.ok(
  i18nSrc.includes('"Status.UnicodeEscapeInvalid"'),
  "EN Status.UnicodeEscapeInvalid key must exist",
)
assert.ok(
  i18nSrc.includes('"Status.NoUnicodeEscape": "Kein Unicode-Escape'),
  "DE Status.NoUnicodeEscape key must exist",
)

console.log("ok C1 block has the (ctrl||meta) && alt sub-block")
console.log('ok Alt+Meta+X / Ctrl+Alt+X matches key "x"/"X" with preventDefault()')
console.log("ok handler calls replaceUnicodeEscape() and returns")
console.log("ok replacement wiring: markDirty/captureHistory/scheduleCollabSync/notifyHost")
console.log('ok \\u2013 -> "–" and \\u{1F600} -> "😀" via the extracted regex')
console.log("ok >0x10FFFF guarded; caret-adjacency enforced")
console.log("ok i18n status strings exist (EN + DE)")
console.log("\nshortcut-replaceunicodetosymbol-PASS")

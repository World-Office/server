/**
 * WO-21-nonbreaking-hyphen: OnlyOffice parity — Ctrl+Shift+Minus inserts a
 * NON-BREAKING HYPHEN (U+2011), while En dash moves to Ctrl+Minus and Em dash
 * stays on Ctrl+Alt+Minus.
 *
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Asserts that editor.js contains BOTH a \u2011 emit bound under
 * ctrl&&shift&&Minus (non-breaking hyphen) AND a \u2013 emit under
 * ctrl&&!shift&&Minus (en dash) — i.e. the two branches coexist.
 *
 * Run: node apps/web/apps/documenteditor-wysiwyg/nonbreaking-hyphen.test.mjs
 * Success: prints "NONBREAKING-HYPHEN-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const src = readFileSync(new URL("./editor.js", import.meta.url), "utf8")

// The keydown C1 shortcut-parity block (runs before the ctrl/!altKey guard so
// plain-Ctrl and Alt combos reach it). Locate it by the leading comment.
const blockStart = src.indexOf("// C1 SHORTCUT PARITY")
assert.notStrictEqual(blockStart, -1, "C1 SHORTCUT PARITY block must exist in editor.js")
const block = src.slice(blockStart)

// 1. Non-breaking hyphen: Ctrl+Shift+Minus -> \u2011 (OO convention).
const nbhShift = "(ev.ctrlKey || ev.metaKey) && ev.shiftKey && !ev.altKey) {"
const shiftIdx = block.indexOf(nbhShift)
assert.notStrictEqual(shiftIdx, -1, "ctrl+shift&&!alt dedicated block must exist")
const shiftBlock = block.slice(shiftIdx)
const shiftMinus = shiftBlock.match(
  /if \(ev\.code === "Minus"\) \{\s*ev\.preventDefault\(\);\s*emitCommand\("insertSymbol", "\\u2011"\);\s*return;\s*\}/,
)
assert.ok(shiftMinus, "Ctrl+Shift+Minus must emit a non-breaking hyphen (\\u2011)")
assert.ok(
  src.includes('emitCommand("insertSymbol", "\\u2011")'),
  "non-breaking hyphen (\u2011) emit must be present in editor.js",
)

// 2. En dash: Ctrl+Minus (no Shift) -> \u2013 (OO convention; prevented).
const enDashNoShift =
  "(ev.ctrlKey || ev.metaKey) && !ev.shiftKey && !ev.altKey) {\n" +
  "      // En dash: Ctrl+Minus (OO convention; takes precedence over browser zoom-out).\n" +
  '      if (ev.code === "Minus") { ev.preventDefault(); emitCommand("insertSymbol", "\\u2013"); return; }'
assert.ok(
  src.includes(enDashNoShift),
  "Ctrl+Minus (no Shift) must emit an en dash (\\u2013) with preventDefault",
)

// 3. The dedicated shift block must bind Minus to \u2011 (non-breaking hyphen),
//    not to the en dash it used to bind. The shift block spans from its guard
//    up to the following dedicated ctrl+alt block.
const altGuard = "(ev.ctrlKey || ev.metaKey) && ev.altKey) {"
const altIdx = block.indexOf(altGuard, shiftIdx)
assert.notStrictEqual(altIdx, -1, "dedicated ctrl+alt block must exist after shift block")
const shiftOnly = block.slice(shiftIdx, altIdx)
assert.ok(
  shiftOnly.includes("\\u2011"),
  "ctrl+shift block must bind Minus to the non-breaking hyphen",
)
assert.ok(!shiftOnly.includes("\\u2013"), "ctrl+shift block must not bind Minus to the en dash")

// 4. Both branches coexist (the two emits are both present and distinct).
const nbCount = (src.match(/emitCommand\("insertSymbol", "\\u2011"\)/g) || []).length
const enCount = (src.match(/emitCommand\("insertSymbol", "\\u2013"\)/g) || []).length
assert.ok(nbCount >= 1, `expected >=1 \\u2011 emit, found ${nbCount}`)
assert.ok(enCount >= 1, `expected >=1 \\u2013 emit, found ${enCount}`)
const nbInShift = shiftOnly.indexOf("\\u2011") !== -1
const enInShift = shiftOnly.indexOf("\\u2013") !== -1
assert.ok(nbInShift, "non-breaking-hyphen emit must live in the ctrl+shift block")
assert.ok(!enInShift, "en-dash emit must NOT live in the ctrl+shift block")
assert.ok(
  block.includes('("insertSymbol", "\\u2013")'),
  "en-dash emit must live in the plain ctrl block",
)

// 5. Em dash stays on Ctrl+Alt+Minus (untouched).
assert.ok(
  src.includes('emitCommand("insertSymbol", "\\u2014")'),
  "em dash (\\u2014) must remain bound",
)

console.log("NONBREAKING-HYPHEN-PASS")

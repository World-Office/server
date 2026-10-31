/**
 * WO-19-allow-edit-ranges: OnlyOffice parity (slugs: allow-edit-ranges)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies the document-level editable range protection:
 *   - a wo-command "allowEditRange" arms/clears a single {start,end} window
 *   - the input path (onBeforeInput) blocks edits outside editableRanges[0]
 *   - the controls live inside the existing protect dialog (verified opener)
 *   - the parse/normalization and containment helpers behave as specified
 *
 * Run with: node allow-edit-ranges.test.mjs
 * Success: prints "allow-edit-ranges-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

function extractFunction(src, name) {
  const marker = `function ${name}(`
  const start = src.indexOf(marker)
  assert.notEqual(start, -1, `${name} must exist in editor.js`)
  let depth = 0
  let i = src.indexOf("{", start)
  assert.notEqual(i, -1, `${name} must have an opening brace`)
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}") {
      depth--
      if (depth === 0) break
    }
  }
  assert.equal(depth, 0, `${name} must have balanced braces`)
  return src.slice(start, i + 1)
}

const parseEditableRangeValue = new Function(
  `${extractFunction(editorSrc, "parseEditableRangeValue")} return parseEditableRangeValue`,
)()
const spanInsideEditableRange = new Function(
  `${extractFunction(editorSrc, "spanInsideEditableRange")} return spanInsideEditableRange`,
)()

console.log("Running WO-19 allow-edit-ranges tests...\n")

// ── 1. parseEditableRangeValue: value contract ──────────────────────

// clear forms drop the range (whole document editable again)
for (const clear of [null, undefined, "", "clear", "none", "remove"]) {
  assert.equal(parseEditableRangeValue(clear), null, `"${clear}" must clear the range`)
}
console.log("ok 1 clear forms return null (whole document editable)")

// JSON object form
assert.deepEqual(
  parseEditableRangeValue('{"start":8,"end":24}'),
  { start: 8, end: 24 },
  "JSON object form must parse",
)
console.log("ok 2 JSON object form parses")

// terse forms: dash / dot-dot / comma, whitespace tolerant
assert.deepEqual(parseEditableRangeValue("8-24"), { start: 8, end: 24 }, "dash form must parse")
assert.deepEqual(parseEditableRangeValue("8..24"), { start: 8, end: 24 }, "dot-dot form must parse")
assert.deepEqual(
  parseEditableRangeValue(" 24,8 "),
  { start: 8, end: 24 },
  "comma form must normalize ascending",
)
console.log("ok 3 terse numeric forms parse and normalize ascending")

// reversed input is normalized, negatives clamped at 0, floats floored
assert.deepEqual(
  parseEditableRangeValue('{"start":24,"end":8}'),
  { start: 8, end: 24 },
  "reversed JSON must normalize",
)
assert.deepEqual(
  parseEditableRangeValue('{"start":-5,"end":3}'),
  { start: 0, end: 3 },
  "negative start must clamp to 0",
)
assert.deepEqual(
  parseEditableRangeValue('{"start":2.9,"end":7.1}'),
  { start: 2, end: 7 },
  "floats must floor to integers",
)
console.log("ok 4 edges normalize (reversed / negative / floats)")

// invalid values are rejected (loudly, never silently)
assert.equal(parseEditableRangeValue("abc"), undefined, "non-numeric must be undefined")
assert.equal(parseEditableRangeValue('{"start":0}'), undefined, "missing end must be undefined")
assert.equal(
  parseEditableRangeValue('{"start":"x","end":5}'),
  undefined,
  "non-number start must be undefined",
)
console.log("ok 5 invalid values return undefined")

// ── 2. spanInsideEditableRange: containment contract ────────────────

// no range armed -> everything is editable
assert.equal(
  spanInsideEditableRange({ start: 100, end: 200 }, null),
  true,
  "no range must allow everything",
)
// armed range -> no span is not editable
assert.equal(
  spanInsideEditableRange(null, { start: 8, end: 24 }),
  false,
  "missing span must be blocked",
)
console.log("ok 6 containment base cases (no range / no span)")

const range = { start: 8, end: 24 }
assert.equal(
  spanInsideEditableRange({ start: 10, end: 20 }, range),
  true,
  "span inside must be editable",
)
assert.equal(
  spanInsideEditableRange({ start: 8, end: 24 }, range),
  true,
  "exact window must be editable",
)
assert.equal(
  spanInsideEditableRange({ start: 5, end: 20 }, range),
  false,
  "overflowing start must be blocked",
)
assert.equal(
  spanInsideEditableRange({ start: 10, end: 30 }, range),
  false,
  "overflowing end must be blocked",
)
assert.equal(
  spanInsideEditableRange({ start: 25, end: 26 }, range),
  false,
  "outside span must be blocked",
)
assert.equal(
  spanInsideEditableRange({ start: 24, end: 24 }, range),
  true,
  "caret at end boundary must be editable",
)
console.log("ok 7 containment holds inside the armed window only")

// ── 3. enforcement + command wiring in editor.js ────────────────────

assert.ok(
  editorSrc.includes('cmd === "allowEditRange"'),
  "runCommand must dispatch the allowEditRange wo-command",
)
console.log("ok 8 allowEditRange wo-command is dispatched")

assert.ok(
  editorSrc.includes("editableRanges.length") &&
    editorSrc.includes("!inputInsideEditableRange(e)") &&
    editorSrc.includes("e.preventDefault()"),
  "onBeforeInput must block edits outside the editable range",
)
console.log("ok 9 onBeforeInput enforces the editable range")

// single range per document: only the first entry is enforced
assert.ok(
  editorSrc.includes("editableRanges.length ? editableRanges[0] : null"),
  "only editableRanges[0] is enforced (single range per document)",
)
console.log("ok 10 only the first range is enforced")

assert.ok(
  editorSrc.includes("function applyEditableRangeCommand(") &&
    editorSrc.includes("editableRanges = parsed ? [parsed] : []"),
  "applyEditableRangeCommand must arm/clear the range array",
)
console.log("ok 11 applyEditableRangeCommand arms/clears the range")

assert.ok(
  editorSrc.includes("function selectionWithinEditableRange(") &&
    editorSrc.includes("spanInsideEditableRange(selectionSpan(), activeEditableRange())"),
  "selection containment helper must exist",
)
assert.ok(
  editorSrc.includes("activeEditableRange() && !selectionWithinEditableRange()"),
  "command paths that bypass beforeinput must respect the armed range",
)
console.log("ok 12 command-path edits outside the window are blocked")

assert.ok(
  editorSrc.includes('editor.setAttribute("data-editable-ranges"'),
  "armed range must be surfaced via data-editable-ranges",
)
assert.ok(
  editorSrc.includes("!activeEditableRange()") && editorSrc.includes("applyProtectionView"),
  "whole-surface read-only must stand down while the window is armed",
)
console.log("ok 13 range state is surfaced and protection view defers to the window")

// ── 4. UI wiring inside the existing protect dialog ─────────────────

for (const id of [
  "editable-ranges-field",
  "editable-ranges-state",
  "editable-range-start",
  "editable-range-end",
  "btn-editable-range-apply",
  "btn-editable-range-remove",
]) {
  assert.ok(htmlSrc.includes(`id="${id}"`), `${id} must exist in index.html`)
}
console.log("ok 14 range controls exist in index.html")

assert.ok(
  htmlSrc.includes('id="editable-ranges-field"') && htmlSrc.split("protect-dialog").length >= 3,
  "range controls must live inside the existing protect dialog",
)
console.log("ok 15 controls are wired to the existing protect dialog opener")

// ── 5. i18n keys (EN + DE) ──────────────────────────────────────────

for (const key of [
  "Prot.EditRangesTitle",
  "Prot.EditRangeStart",
  "Prot.EditRangeEnd",
  "Prot.EditRangeApply",
  "Prot.EditRangeRemove",
  "Prot.OutsideRange",
  "Prot.RangeInvalid",
  "Prot.RangeArmed",
  "Prot.RangeCleared",
]) {
  assert.ok(i18nSrc.includes(`"${key}"`), `${key} must exist in i18n.js`)
}
console.log("ok 16 i18n keys exist")

console.log("\nAll WO-19 allow-edit-ranges tests passed!\n")
console.log("allow-edit-ranges-PASS")

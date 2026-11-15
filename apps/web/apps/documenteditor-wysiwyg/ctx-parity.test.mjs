/**
 * CAP-2: OO-parity plain-text gating test.
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Asserts:
 *   (1) formatting/list/insert rows have data-showif="text"
 *   (2) TOC rows have data-showif="toc"
 *   (3) field rows have data-showif="field"
 *   (4) accept/reject rows have data-showif="trackedchange"
 *   (5) editor.js has the corresponding gating logic for these new conditions
 *
 * Run: node ctx-parity.test.mjs
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const jsPath = new URL("./editor.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf8")
const jsSrc = readFileSync(jsPath, "utf8")

console.log("Running CAP-2 OO-parity plain-text gating tests...\n")

// Test (1): Formatting rows have data-showif="text"
const formattingRows = [
  "Bold", "Italic", "Underline", "StrikeThrough",
  "RemoveFormat", "KeepLines", "ParagraphSettings", "FormattingAsStyle"
]
console.log("Checking formatting rows have data-showif=\"text\"...")
for (const row of formattingRows) {
  const regex = new RegExp(`data-ctx="${row}"[^>]*data-showif="text"`)
  assert.ok(
    regex.test(htmlSrc),
    `Formatting row ${row} must have data-showif="text"`
  )
  console.log(`  ✓ ${row}`)
}

// Test (2): List rows have data-showif="text"
const listRows = [
  "BulletList", "NumberedList", "StartNewList", "ContinueNumbering",
  "SetNumberingValue", "AdjustListIndents", "BulletsAndNumbering"
]
console.log("\nChecking list rows have data-showif=\"text\"...")
for (const row of listRows) {
  const regex = new RegExp(`data-ctx="${row}"[^>]*data-showif="text"`)
  assert.ok(
    regex.test(htmlSrc),
    `List row ${row} must have data-showif="text"`
  )
  console.log(`  ✓ ${row}`)
}

// Test (3): Insert rows have data-showif="text"
const insertRows = [
  "HorizontalRule", "HorizontalLineSettings", "Caption",
  "Footnote", "Endnote", "Symbol", "Date", "PageNumber"
]
console.log("\nChecking insert rows have data-showif=\"text\"...")
for (const row of insertRows) {
  const regex = new RegExp(`data-ctx="${row}"[^>]*data-showif="text"`)
  assert.ok(
    regex.test(htmlSrc),
    `Insert row ${row} must have data-showif="text"`
  )
  console.log(`  ✓ ${row}`)
}

// Test (4): TOC rows have data-showif="toc"
const tocRows = ["UpdateTOC", "TocSettings"]
console.log("\nChecking TOC rows have data-showif=\"toc\"...")
for (const row of tocRows) {
  const regex = new RegExp(`data-ctx="${row}"[^>]*data-showif="toc"`)
  assert.ok(
    regex.test(htmlSrc),
    `TOC row ${row} must have data-showif="toc"`
  )
  console.log(`  ✓ ${row}`)
}

// Test (5): Field rows have data-showif="field"
const fieldRows = ["UpdateField", "EditField", "ToggleFieldCodes"]
console.log("\nChecking field rows have data-showif=\"field\"...")
for (const row of fieldRows) {
  const regex = new RegExp(`data-ctx="${row}"[^>]*data-showif="field"`)
  assert.ok(
    regex.test(htmlSrc),
    `Field row ${row} must have data-showif="field"`
  )
  console.log(`  ✓ ${row}`)
}

// Test (6): Accept/Reject rows have data-showif="trackedchange"
const acceptRows = ["AcceptChange", "RejectChange"]
console.log("\nChecking accept/reject rows have data-showif=\"trackedchange\"...")
for (const row of acceptRows) {
  const regex = new RegExp(`data-ctx="${row}"[^>]*data-showif="trackedchange"`)
  assert.ok(
    regex.test(htmlSrc),
    `Accept row ${row} must have data-showif="trackedchange"`
  )
  console.log(`  ✓ ${row}`)
}

// Test (7): editor.js has gating logic for text condition
console.log("\nChecking editor.js has gating logic for text condition...")
assert.ok(
  jsSrc.includes("[data-showif='text']"),
  "editor.js must query [data-showif='text']"
)
assert.ok(
  jsSrc.includes("isText = !hasObjectSel && !hasImageSel"),
  "editor.js must define isText condition"
)
console.log("  ✓ text gating logic found")

// Test (8): editor.js has gating logic for toc condition
console.log("\nChecking editor.js has gating logic for toc condition...")
assert.ok(
  jsSrc.includes("[data-showif='toc']"),
  "editor.js must query [data-showif='toc']"
)
assert.ok(
  jsSrc.includes("atToc") && jsSrc.includes("div.toc"),
  "editor.js must check for div.toc"
)
console.log("  ✓ toc gating logic found")

// Test (9): editor.js has gating logic for trackedchange condition
console.log("\nChecking editor.js has gating logic for trackedchange condition...")
assert.ok(
  jsSrc.includes("[data-showif='trackedchange']"),
  "editor.js must query [data-showif='trackedchange']"
)
assert.ok(
  jsSrc.includes("atTrackedChange") && 
  jsSrc.includes("ins.track-insert") && 
  jsSrc.includes("del.track-delete"),
  "editor.js must check for ins.track-insert, del.track-delete"
)
console.log("  ✓ trackedchange gating logic found")

// Test (10): Verify row order is maintained (OO parity)
console.log("\nChecking OO row order is maintained...")
const allRows = [
  ...formattingRows,
  ...listRows,
  ...insertRows
]

let lastPos = -1
for (const row of allRows) {
  const pos = htmlSrc.indexOf(`data-ctx="${row}"`)
  assert.ok(pos > lastPos, `Row ${row} must appear after previous row in OO order`)
  lastPos = pos
}
console.log("  ✓ OO row order maintained for text rows")

console.log("\n✅ All CAP-2 OO-parity plain-text gating tests passed!")

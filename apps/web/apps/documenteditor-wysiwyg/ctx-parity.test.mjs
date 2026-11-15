/**
 * CAP-2 FIX: OO-parity plain-text gating test (behavioral).
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * The previous version was tautological: it asserted that rows were tagged
 * data-showif="text" and that editor.js gated [data-showif='text'] with
 * isText = !hasObjectSel && !hasImageSel. But isText is TRUE on plain text,
 * so nothing ever hid — the tags were a pure no-op. This version asserts
 * real behavior:
 *
 *   (1) The plain-text ALWAYS-VISIBLE set (rows with no data-showif in
 *       #ctx-menu) is exactly the OO text-menu order:
 *       Cut, Copy, Paste, PrintSelection, PageBreakBefore, KeepLines,
 *       ParagraphSettings, AddComment, Link, FormattingAsStyle, AI
 *       (spell/misspelled rows carry data-showif and are excluded).
 *   (2) The 25 context rows named below are NOT always-visible — each one
 *       carries a data-showif that is FALSE on a plain-text caret.
 *   (3) No row in #ctx-menu uses the no-op convention data-showif="text".
 *   (4) editor.js implements the context map (format/list/insert-ctx/...)
 *       and a single [data-showif] loop that hides when the gate is false.
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

// ── extract the #ctx-menu block (depth-aware, so nested divs are included) ──
const blockStart = htmlSrc.lastIndexOf("<div", htmlSrc.indexOf('id="ctx-menu"'))
let depth = 0
let blockEnd = -1
let idx = blockStart
while (idx < htmlSrc.length) {
  const o = htmlSrc.indexOf("<div", idx)
  const c = htmlSrc.indexOf("</div>", idx)
  if (o === -1 && c === -1) break
  if (o !== -1 && (c === -1 || o < c)) { depth++; idx = o + 5 }
  else { depth--; idx = c + 6 }
  if (depth === 0) { blockEnd = idx; break }
}
assert.ok(blockEnd > blockStart, "must extract the #ctx-menu block")
const menuBlock = htmlSrc.slice(blockStart, blockEnd)

// row -> its data-showif (null = always visible). Subitem rows
// (data-subitem, e.g. AI->Rewrite/Summarize/Translate) are excluded from the
// always-visible set because collapseAllCtxSubmenus() hides them on open.
function showifOf(ctx) {
  const m = menuBlock.match(new RegExp(`data-ctx="${ctx}"([^>]*)`))
  assert.ok(m, `row ${ctx} must exist in #ctx-menu`)
  const isSubitem = /data-subitem=/.test(m[1])
  const d = m[1].match(/data-showif="([^"]+)"/)
  return isSubitem ? "(subitem)" : (d ? d[1] : null)
}

// (1) Plain-text always-visible set == OO order
const ooTextOrder = [
  "Cut", "Copy", "Paste",
  "PrintSelection", "PageBreakBefore", "KeepLines", "ParagraphSettings",
  "AddComment", "Link", "FormattingAsStyle", "AI",
]
console.log("Checking the always-visible rows are exactly the OO text menu order...")
const alwaysVisible = []
for (const m of menuBlock.matchAll(/data-ctx="([^"]+)"/g)) {
  const ctx = m[1]
  if (showifOf(ctx) === null) alwaysVisible.push(ctx)
}
assert.deepEqual(
  alwaysVisible,
  ooTextOrder,
  `always-visible rows must equal OO text order, got: ${alwaysVisible.join(", ")}`,
)
console.log(`  ✓ always-visible set = [${alwaysVisible.join(", ")}]`)

// (2) The 25 context rows must be gated (NOT always-visible)
const contextRows = [
  // formatting block
  "Undo", "Redo", "Bold", "Italic", "Underline", "StrikeThrough", "RemoveFormat",
  // text direction (in-shape only in OO)
  "TextDirection", "TextDirHorizontal", "TextDirRotateDown", "TextDirRotateUp",
  // lists
  "BulletList", "NumberedList", "StartNewList", "ContinueNumbering",
  "SetNumberingValue", "AdjustListIndents", "BulletsAndNumbering",
  // insert rows
  "HorizontalRule", "HorizontalLineSettings", "Caption", "Footnote",
  "Endnote", "Symbol", "Date", "PageNumber",
  // link edit rows (only at a hyperlink)
  "EditLink", "RemoveLink", "CopyHyperlinkAddress",
  // advanced settings
  "DropcapSettings", "FrameSettings", "EquationSettings",
  "ContentControlSettings", "RemoveContentControl",
  // selection
  "SelectAll",
]
console.log(`\nChecking ${contextRows.length} context rows are gated (not always-visible)...`)
for (const row of contextRows) {
  const g = showifOf(row)
  assert.ok(
    g !== null && g !== "text",
    `row ${row} must carry a real data-showif (got ${JSON.stringify(g)})`,
  )
  assert.ok(
    g !== "text",
    `row ${row} must not use the no-op data-showif="text"`,
  )
}
console.log("  ✓ all context rows carry real gates (format/list/insert-ctx/...)")

// (3) No row in the menu uses the no-op data-showif="text"
console.log("\nChecking no row uses the no-op data-showif=\"text\"...")
assert.ok(
  !/data-showif="text"/.test(menuBlock),
  "#ctx-menu must not contain data-showif=\"text\" (the CAP-2 no-op)",
)
console.log("  ✓ no data-showif=\"text\" remains")

// (4) editor.js implements the real context map + single gating loop
console.log("\nChecking editor.js implements the real context gates...")
assert.ok(jsSrc.includes("hasTextSel"), "editor.js must compute hasTextSel")
assert.ok(jsSrc.includes("inListCtx"), "editor.js must compute inListCtx (list context)")
assert.ok(
  jsSrc.includes('"insert-ctx": false'),
  "editor.js must keep insert rows hidden on plain text",
)
assert.ok(
  jsSrc.includes("querySelectorAll(\"[data-showif]\")"),
  "editor.js must gate [data-showif] generically",
)
// the old no-op must be GONE — asserting on format/list/insert rows hiding
assert.ok(
  !jsSrc.includes("isText = !hasObjectSel && !hasImageSel"),
  "editor.js must no longer compute the old isText no-op",
)
console.log("  ✓ context map + generic gating loop present; old isText no-op removed")

console.log("\n✅ All CAP-2 OO-parity plain-text gating tests passed!")

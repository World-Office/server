#!/usr/bin/env node
// shift-enter-behavior.test.mjs — behavioral gate: Shift+Enter keeps text on
// the page sheet (BHV-001).
//
// Expected behavior: Shift+Enter inserts a line break (<br>) INSIDE the same
// paragraph, and the new line lands on a .wo-page sheet — never in the gray
// editor backdrop outside any page (the gray-void bug class).
//
// Chain this gate protects (static pins, zero dependencies — see
// grayvoid-gate.test.mjs for the sibling incident gate):
//   1. editor.js never hijacks plain Shift+Enter — the browser's native
//      insertLineBreak puts the <br> in the same block. The ONLY Enter
//      bindings in the editor keydown handler are the Ctrl variants
//      (Ctrl+Enter = page break, Ctrl+Shift+Enter = column break).
//   2. The inserted line is a DOM mutation -> MutationObserver ->
//      scheduleReflow -> paginateView re-snaps blocks into .wo-page sheets
//      (debounced 600ms so typing isn't churned).
//   3. A paragraph that outgrows its sheet splits at a LINE boundary with
//      widow/orphan control (trySplitLines): every Shift+Enter line lands
//      inside a sheet; the tail continues on the next sheet as .wo-cont.
//   4. A wiped/empty document still renders ONE page sheet (gray-void
//      guard) so an empty editor can never receive typing in the gray area.
//   5. The view-layer split merges back before serialization (mergeSplits
//      in flatHtml) so the saved flow keeps ONE paragraph with the <br>.
//
// Run with: node shift-enter-behavior.test.mjs
// Success: prints shift-enter-behavior-PASS and exits 0.
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, "editor.js"), "utf8")

console.log("Running shift-enter-behavior tests...\n")

// ── 1. Plain Shift+Enter stays native (line break, not a command) ───
// Nothing prevents/replaces the browser's insertLineBreak.
assert.ok(
  !src.includes("insertLineBreak"),
  "editor.js must not hijack insertLineBreak — Shift+Enter inserts the native <br>",
)

// The editor keydown handler is the slice between its registration and the
// next function after the handler body.
const kdStart = src.indexOf('editor.addEventListener("keydown"')
const kdEnd = src.indexOf("function autoConvertListMarker", kdStart)
assert.ok(kdStart >= 0 && kdEnd > kdStart, "editor keydown handler found")
const keydownBody = src.slice(kdStart, kdEnd)
const enterBranches = keydownBody.match(/"[eE]nter"/g) || []
assert.ok(enterBranches.length > 0,
  "editor keydown binds the Ctrl+Enter variants (page/column break)")
for (const m of keydownBody.matchAll(/k === "enter"/g)) {
  // every Enter binding must be the ctrl-gated `k` form (k = ev.key
  // lowercased inside a (ctrl||meta) block), never a raw ev.key === "Enter"
  assert.ok(m[0] === 'k === "enter"',
    "Enter bindings in the editor keydown must be ctrl-gated (k === \"enter\")")
}
assert.ok(
  !keydownBody.includes('ev.key === "Enter"'),
  "plain Enter/Shift+Enter must NOT be intercepted by the editor keydown handler",
)
assert.ok(
  keydownBody.includes('k === "enter") { ev.preventDefault(); emitCommand("insertColumnBreak")'),
  "Ctrl+Shift+Enter = column break (the only shift+enter combo binding)",
)

// ── 2. Mutation-driven repagination keeps lines on sheets ────────────
const obsStart = src.indexOf("new MutationObserver")
assert.ok(obsStart >= 0, "MutationObserver drives re-pagination on edit")
const reflowSlice = src.slice(obsStart, obsStart + 400)
assert.ok(
  reflowSlice.includes("scheduleReflow()"),
  "editor mutations schedule the reflow that re-snaps pages",
)
assert.ok(
  /function scheduleReflow[\s\S]{0,500}paginateQuiet\(\)/.test(src),
  "scheduleReflow re-paginates (paginateQuiet) after the typing debounce",
)
assert.ok(
  /function paginateQuiet[\s\S]{0,200}paginateView\(\)/.test(src),
  "paginateQuiet runs paginateView",
)

// ── 3. Overflow splits at LINE boundaries (Shift+Enter lines count) ──
const splitLines = src.slice(
  src.indexOf("function trySplitLines"),
  src.indexOf("function paginateView"),
)
assert.ok(splitLines.length > 10, "trySplitLines found")
assert.ok(
  splitLines.includes("getClientRects()"),
  "line detection via Range.getClientRects — <br> line breaks are line boxes of the SAME block, so Shift+Enter lines split together with wrapped lines",
)
assert.ok(
  /orphan control/.test(splitLines) && /widow control/.test(splitLines),
  "widow/orphan control keeps split lines honest",
)
assert.ok(
  splitLines.includes('classList.add("wo-cont")'),
  "the split tail becomes a .wo-cont continuation on the next sheet",
)

// ── 4. Empty document still renders one page sheet (no gray void) ────
assert.ok(
  /blocks\.length === 0\) \{\s*\n\s*openPage\(\);\s*\n\s*return;/.test(src),
  "paginateView emits an empty .wo-page when there are no blocks",
)

// ── 5. Serialization keeps the Shift+Enter paragraph intact ──────────
const flatBody = src.slice(
  src.indexOf("function flatHtml()"),
  src.indexOf("function stripMisspellMarkers(root)"),
)
assert.ok(
  flatBody.includes("mergeSplits(tmp)"),
  "flatHtml folds pagination splits back — the saved flow keeps ONE paragraph with its <br>",
)

console.log("All shift-enter-behavior tests passed!")
console.log("shift-enter-behavior-PASS")

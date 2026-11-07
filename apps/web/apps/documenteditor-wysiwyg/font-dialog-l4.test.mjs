/**
 * L2N-04 font-dialog-l4: Font dialog shell + launcher parity
 * (ledger row dialog.font-dialog.l4 — OO tab:home font group, 11 fields).
 *
 * The OO Home > Font group's corner launcher opens the Font dialog with the
 * whole character-format family. WO now ships that shell (#font-dialog) plus
 * its launcher (#btn-font-dialog) in the home Font group; this file pins the
 * field set, the seeding/apply wiring and the promoted parity contract.
 *
 * Node.js built-in test runner (node:assert, zero dependencies).
 * Run with: node --test font-dialog-l4.test.mjs
 * Success: prints "FONT-DIALOG-L4-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const here = (p) => new URL(p, import.meta.url)
const htmlSrc = readFileSync(here("./index.html"), "utf-8")
const editorSrc = readFileSync(here("./editor.js"), "utf-8")
const i18nSrc = readFileSync(here("./i18n.js"), "utf-8")
const paritySrc = readFileSync(
  here("../../../../tests/parity/overrides-dropins/format-controls.json"),
  "utf-8",
)

console.log("Running L2N-04 font-dialog-l4 tests...\n")

function sliceBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker)
  assert.ok(start !== -1, `start marker must exist: ${startMarker}`)
  const end = src.indexOf(endMarker, start + startMarker.length)
  assert.ok(end !== -1, `end marker must exist: ${endMarker}`)
  return src.slice(start, end)
}

// ── (1) Launcher: home Font group, OO corner-launcher shape ───────────
console.log("Checking the font-group launcher...")
const homePage = sliceBetween(
  htmlSrc,
  '<div class="ribbon-page active" data-tab="home"',
  '<div class="ribbon-page" data-tab="',
)
const fontGroup = sliceBetween(homePage, 'aria-label="Font"', 'aria-label="Paragraph"')
assert.ok(fontGroup.includes('id="btn-font-dialog"'),
  "the home Font group must carry the #btn-font-dialog launcher")
assert.ok(fontGroup.includes('aria-haspopup="dialog"'),
  "the launcher declares it opens a dialog")
assert.ok(fontGroup.includes('data-i18n-title="Home.FontDialogTitle"') &&
  fontGroup.includes('data-i18n-aria-label="Home.FontDialogTitle"'),
  "the launcher localizes title + aria-label")
// The quick path (family/size pickers, Inc/Dec, case) stays in the group.
for (const id of ["font-family", "font-size"]) {
  assert.ok(fontGroup.includes(`id="${id}"`), `home picker #${id} stays in the font group`)
}
for (const cmd of ["fontSizeInc", "fontSizeDec"]) {
  assert.ok(fontGroup.includes(`data-cmd="${cmd}"`), `home button data-cmd="${cmd}" stays`)
}
console.log("Font-group launcher present\n")

// ── (2) Dialog shell: the 10 OO font-group fields, all inside it ──────
console.log("Checking the dialog field set...")
assert.ok(htmlSrc.includes('id="font-dialog"'), "#font-dialog overlay must exist")
const dlg = sliceBetween(htmlSrc, 'id="font-dialog"', "</div>\n  </div>")
assert.ok(dlg.includes('class="dialog-overlay" role="dialog" aria-modal="true"'),
  "#font-dialog is a modal dialog overlay")
// OO fields (minus the group surface itself): family, size, inc, dec,
// bold, italic, underline, strikethrough, highlight color, font color.
const OO_FIELDS = [
  ["font family", "#font-dialog-family"],
  ["font size", "#font-dialog-size"],
  ["increment font size", "#font-dialog-inc"],
  ["decrement font size", "#font-dialog-dec"],
  ["bold", "#font-dialog-bold"],
  ["italic", "#font-dialog-italic"],
  ["underline", "#font-dialog-underline"],
  ["strikethrough", "#font-dialog-strike"],
  ["highlight color", "#font-dialog-highlight"],
  ["font color", "#font-dialog-color"],
]
for (const [name, sel] of OO_FIELDS) {
  assert.ok(dlg.includes(`id="${sel.slice(1)}"`), `OO field "${name}" (${sel}) in #font-dialog`)
}
assert.ok(dlg.includes('id="font-dialog-preview"'), "live preview box must exist")
assert.ok(dlg.includes('id="btn-font-close"') && dlg.includes('id="btn-font-ok"'),
  "Cancel/OK buttons must exist")
// Same option lists as the home pickers (dialog and picker never drift).
for (const opt of ["Arial", "Courier New", "Georgia", "Times New Roman", "Verdana"]) {
  assert.ok(dlg.includes(`value="${opt}"`), `family list keeps ${opt}`)
}
for (const step of ["1", "2", "3", "4", "5", "6", "7"]) {
  assert.ok(dlg.includes(`<option value="${step}">`), `size ladder keeps step ${step}`)
}
console.log("All 10 OO font-group fields present in the shell\n")

// ── (3) Wiring: open seeds from the selection, OK applies on the bus ──
console.log("Checking editor.js wiring...")
assert.ok(editorSrc.includes('"font-dialog"'),
  "font-dialog must be registered in DIALOG_IDS (modal Tab trap + Esc close)")
assert.ok(editorSrc.includes('["font", confirmFontDialog]'),
  "font OK must route through the ROUND2 confirm wiring")
assert.ok(editorSrc.includes('fontDialogBtn.addEventListener("click", openFontDialog)'),
  "#btn-font-dialog must open the dialog")
const openFn = sliceBetween(editorSrc, "const FONT_DIALOG_STYLES = [", "function confirmFontDialog() {")
assert.ok(openFn.includes('queryCommandValue("fontName"') && openFn.includes('queryCommandValue("fontSize"'),
  "open seeds family + size from the selection")
for (const cmd of ["bold", "italic", "underline", "strikeThrough"]) {
  assert.ok(openFn.includes(`"${cmd}"`), `open seeds the ${cmd} state`)
}
assert.ok(openFn.includes("cssColorToHex(cs.color)") && openFn.includes("cssColorToHex(cs.backgroundColor)"),
  "open seeds font + highlight color from the selection's computed style")
assert.ok(openFn.includes("updateFontDialogPreview()"),
  "open refreshes the preview box")
const confirmFn = sliceBetween(editorSrc, "function confirmFontDialog() {", "const fontDialogBtn")
for (const cmd of ["fontName", "fontSize", "foreColor", "hiliteColor"]) {
  assert.ok(confirmFn.includes(`emitCommand("${cmd}"`), `OK applies ${cmd} on the wo-command bus`)
}
assert.ok(confirmFn.includes("emitCommand(cmd)"),
  "OK applies the flipped B/I/U/S toggles on the same bus")
// Only what changed is re-applied: untouched colors must not repaint text.
assert.ok(confirmFn.includes("fontDialogSeed.color") && confirmFn.includes("fontDialogSeed.highlight"),
  "OK compares colors against the seed snapshot")
assert.ok(editorSrc.includes("el.dataset.wasChecked"),
  "style toggles remember the seeded state")
const stepsFn = sliceBetween(editorSrc, 'const fontInc = document.getElementById("font-dialog-inc")', "const fontDec")
assert.ok(stepsFn.includes("Math.min(7,") && editorSrc.includes("Math.max(1,"),
  "the dialog's Inc/Dec step the same 1..7 ladder as the ribbon buttons")
console.log("Seeding, apply path and size steps wired\n")

// ── (4) Labels localized in BOTH catalogs ─────────────────────────────
console.log("Checking i18n keys...")
for (const key of ["Home.FontDialogTitle", "Dialog.Font.Title", "Dialog.Font.Family",
  "Dialog.Font.Size", "Dialog.Font.Style", "Dialog.Font.Bold", "Dialog.Font.Italic",
  "Dialog.Font.Underline", "Dialog.Font.Strikethrough", "Dialog.Font.Colors",
  "Dialog.Font.FontColor", "Dialog.Font.Highlight", "Dialog.Font.SizeSteps",
  "Dialog.Font.Preview"]) {
  const hits = (i18nSrc.match(new RegExp(`"${key}":`, "g")) || []).length
  assert.ok(hits >= 2, `${key} must exist in en AND de catalogs`)
}
console.log("Dialog labels localized (en + de)\n")

// ── (5) The parity row is promoted (no xfail, contract drives the shell) ─
console.log("Checking the promoted parity row...")
const row = sliceBetween(paritySrc, '"dialog.font-dialog.l4": {', "\n    }")
assert.ok(!row.includes('"xfail"'), "dialog.font-dialog.l4 must no longer be a known gap")
assert.ok(row.includes('"selector": "#btn-font-dialog"'),
  "the contract triggers the launcher")
assert.ok(row.includes('"dialogSelector": "#font-dialog"'),
  "the contract asserts #font-dialog becomes visible")
for (const [, sel] of OO_FIELDS) {
  assert.ok(row.includes(`"selector": "${sel}"`),
    `subFeature contract covers ${sel}`)
}
console.log("dialog.font-dialog.l4 promoted with all 10 field subFeatures\n")

console.log("All L2N-04 font-dialog-l4 tests passed!\n")
console.log("FONT-DIALOG-L4-PASS")

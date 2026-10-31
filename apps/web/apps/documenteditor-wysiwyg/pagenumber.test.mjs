/**
 * WO-10-pagenumber: missing-feature (insert tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the page number dialog and insertPageNumber command are
 * properly wired in index.html and editor.js, with position and format options.
 *
 * Run with: node pagenumber.test.mjs
 * Success: prints "PAGENUMBER-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-10-pagenumber tests...\n")

// ── Page number dialog exists and has fields ─────────────────────────

// The pagenumber dialog must exist
assert.ok(htmlSrc.includes('id="pagenumber-dialog"'), "pagenumber-dialog must exist in index.html")

// The dialog must have a title
assert.ok(
  htmlSrc.includes('id="pagenumber-dialog-title"'),
  "pagenumber-dialog-title must exist in index.html",
)

// The dialog title must use i18n
assert.ok(
  htmlSrc.includes('data-i18n="Dialog.PageNumberTitle"'),
  "pagenumber-dialog-title must have i18n key Dialog.PageNumberTitle",
)

// The dialog must have a position select
assert.ok(
  htmlSrc.includes('id="pagenumber-position"'),
  "pagenumber-position select must exist in index.html",
)

// The position select must have options for top, body, bottom
assert.ok(
  htmlSrc.includes('value="top"') &&
    htmlSrc.includes('value="body"') &&
    htmlSrc.includes('value="bottom"'),
  "pagenumber-position must have top, body, bottom options",
)

// The dialog must have a format select
assert.ok(
  htmlSrc.includes('id="pagenumber-format"'),
  "pagenumber-format select must exist in index.html",
)

// The format select must have multiple format options
assert.ok(
  htmlSrc.includes('value="decimal"') &&
    htmlSrc.includes('value="decimalZero"') &&
    htmlSrc.includes('value="upperRoman"') &&
    htmlSrc.includes('value="lowerRoman"') &&
    htmlSrc.includes('value="upperLetter"') &&
    htmlSrc.includes('value="lowerLetter"'),
  "pagenumber-format must have decimal, decimalZero, upperRoman, lowerRoman, upperLetter, lowerLetter options",
)

// The dialog must have an alignment select
assert.ok(
  htmlSrc.includes('id="pagenumber-align"'),
  "pagenumber-align select must exist in index.html",
)

// The dialog must have OK and Cancel buttons
assert.ok(
  htmlSrc.includes('id="btn-pagenumber-ok"') && htmlSrc.includes('id="btn-pagenumber-close"'),
  "pagenumber dialog must have OK and Cancel buttons",
)

// ── insertPageNumber command wiring ─────────────────────────────────

// The insertPageNumber command must be handled in runCommand
assert.ok(
  editorSrc.includes('cmd === "insertPageNumber"'),
  "insertPageNumber command handler must exist in editor.js",
)

// The handler must create a page-number span
assert.ok(
  editorSrc.includes('class="page-number"') || editorSrc.includes('className = "page-number"'),
  "insertPageNumber must create span.page-number",
)

// ── Dialog OK handler reads position, format, alignment ──────────────

// The OK button handler must read the position value
assert.ok(
  editorSrc.includes("pagenumber-position") && editorSrc.includes(".value"),
  "btn-pagenumber-ok handler must read pagenumber-position value",
)

// The OK button handler must read the format value
assert.ok(
  editorSrc.includes("pagenumber-format") && editorSrc.includes(".value"),
  "btn-pagenumber-ok handler must read pagenumber-format value",
)

// The OK button handler must read the alignment value
assert.ok(
  editorSrc.includes("pagenumber-align") && editorSrc.includes(".value"),
  "btn-pagenumber-ok handler must read pagenumber-align value",
)

// The handler must set data-format attribute on the page number span
assert.ok(
  editorSrc.includes('setAttribute("data-format"') ||
    editorSrc.includes("setAttribute('data-format'"),
  "handler must set data-format attribute on page number span",
)

// The dialog OK handler must handle top/bottom positions by creating header/footer
assert.ok(
  editorSrc.includes('pos === "top"') &&
    editorSrc.includes('pos === "bottom"') &&
    editorSrc.includes("insertHeader") &&
    editorSrc.includes("insertFooter"),
  "handler must emit insertHeader/insertFooter for top/bottom positions",
)

// ── Header/footer context ────────────────────────────────────────

// The hf-pagenumber button must exist in the header/footer ribbon
assert.ok(
  htmlSrc.includes('id="btn-hf-pagenumber"'),
  "btn-hf-pagenumber button must exist in index.html",
)

// The hf-pagenumber button must open the pagenumber dialog
assert.ok(
  editorSrc.includes("btn-hf-pagenumber") &&
    editorSrc.includes('openOverlayDialog("pagenumber-dialog")'),
  "btn-hf-pagenumber must open pagenumber-dialog",
)

// The hf-pagenumber button must mark header/footer as having unsaved changes
assert.ok(
  editorSrc.includes("hfHasUnsavedChanges = true") && editorSrc.includes("btn-hf-pagenumber"),
  "btn-hf-pagenumber must set hfHasUnsavedChanges = true",
)

// ── Main toolbar button ───────────────────────────────────────────

// The main pagenumber toolbar button must exist
assert.ok(htmlSrc.includes('id="btn-pagenumber"'), "btn-pagenumber button must exist in index.html")

// The main pagenumber button must be wired to open the dialog
assert.ok(
  htmlSrc.includes('id="btn-pagenumber"') &&
    editorSrc.includes('["btn-pagenumber", "pagenumber-dialog"]'),
  "btn-pagenumber must be wired to open pagenumber-dialog",
)

// ── i18n translations ──────────────────────────────────────────────

// English translations for dialog
assert.ok(
  i18nSrc.includes('"Dialog.PageNumberTitle": "Page Number"'),
  "Dialog.PageNumberTitle English translation must exist",
)
assert.ok(
  i18nSrc.includes('"Dialog.Position": "Position"'),
  "Dialog.Position English translation must exist",
)
assert.ok(
  i18nSrc.includes('"Dialog.Format": "Format"'),
  "Dialog.Format English translation must exist",
)
assert.ok(
  i18nSrc.includes('"Dialog.Alignment": "Alignment"'),
  "Dialog.Alignment English translation must exist",
)

// English translations for format options
assert.ok(
  i18nSrc.includes('"PageNumber.Format.Decimal": "1, 2, 3"'),
  "PageNumber.Format.Decimal English translation must exist",
)
assert.ok(
  i18nSrc.includes('"PageNumber.Format.UpperRoman": "I, II, III"'),
  "PageNumber.Format.UpperRoman English translation must exist",
)
assert.ok(
  i18nSrc.includes('"PageNumber.Format.LowerRoman": "i, ii, iii"'),
  "PageNumber.Format.LowerRoman English translation must exist",
)

// German translations for dialog
assert.ok(
  i18nSrc.includes('"Dialog.PageNumberTitle": "Seitenzahl"'),
  "Dialog.PageNumberTitle German translation must exist",
)
assert.ok(
  i18nSrc.includes('"Dialog.Position": "Position"'),
  "Dialog.Position German translation must exist",
)
assert.ok(
  i18nSrc.includes('"Dialog.Format": "Format"'),
  "Dialog.Format German translation must exist",
)
assert.ok(
  i18nSrc.includes('"Dialog.Alignment": "Ausrichtung"'),
  "Dialog.Alignment German translation must exist",
)

// German translations for format options
assert.ok(
  i18nSrc.includes('"PageNumber.Format.Decimal": "1, 2, 3"'),
  "PageNumber.Format.Decimal German translation must exist",
)

// ── WO-command event bus ───────────────────────────────────────────

// emitCommand must dispatch wo-command events
assert.ok(
  editorSrc.includes('window.dispatchEvent(new CustomEvent("wo-command"'),
  "wo-command event dispatch must exist in editor.js",
)

// The wo-command listener must call runCommand
assert.ok(
  editorSrc.includes('window.addEventListener("wo-command"'),
  "wo-command listener must exist in editor.js",
)

console.log("All WO-10-pagenumber tests passed!\n")
console.log("PAGENUMBER-PASS")

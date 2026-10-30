/**
 * WO-2-content-controls: Content Controls Parity Tests
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies full support for OOXML content controls including:
 * - All content control types (plain, rich, dropdown, checkbox, date, combo, picture)
 * - Keyboard navigation via tabindex
 * - Interactive handlers (checkbox toggle, picture -> image dialog, dropdown -> dialog)
 * - i18n strings in both locales
 *
 * Run with: node content-controls.test.mjs
 * Success: prints "CONTENT-CONTROLS-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-2-content-controls tests...\n")

// ── All content control types must be in the dialog ────────────────

for (const opt of ["plain", "rich", "dropdown", "checkbox", "date", "combo", "picture"]) {
  assert.ok(htmlSrc.includes(`value="${opt}"`), `cc-type option missing: ${opt}`)
  console.log(`ok cc-dialog has ${opt} option`)
}

// ── All content control types must have insertion logic ────────────

assert.ok(editorSrc.includes('data-cc="checkbox"'), "checkbox content control insertion missing")
console.log("ok checkbox insertion logic exists")

assert.ok(editorSrc.includes('data-cc="date"'), "date content control insertion missing")
console.log("ok date insertion logic exists")

assert.ok(editorSrc.includes('data-cc="combo"'), "combo content control insertion missing")
console.log("ok combo insertion logic exists")

assert.ok(editorSrc.includes('data-cc="picture"'), "picture content control insertion missing")
console.log("ok picture insertion logic exists")

assert.ok(
  editorSrc.includes('data-cc="dropdown"') && editorSrc.includes("dropdown"),
  "dropdown content control insertion missing",
)
console.log("ok dropdown insertion logic exists")

// ── All content controls must have tabindex for keyboard navigation ────

assert.ok(
  editorSrc.includes('data-cc="checkbox"') &&
    editorSrc.includes('tabindex="0"', editorSrc.indexOf('data-cc="checkbox"')),
  "checkbox content control must have tabindex",
)
console.log("ok checkbox has tabindex")

assert.ok(
  editorSrc.includes('data-cc="date"') &&
    editorSrc.includes('tabindex="0"', editorSrc.indexOf('data-cc="date"')),
  "date content control must have tabindex",
)
console.log("ok date has tabindex")

assert.ok(
  editorSrc.includes('data-cc="combo"') &&
    editorSrc.includes('tabindex="0"', editorSrc.indexOf('data-cc="combo"')),
  "combo content control must have tabindex",
)
console.log("ok combo has tabindex")

assert.ok(
  editorSrc.includes('data-cc="picture"') &&
    editorSrc.includes('tabindex="0"', editorSrc.indexOf('data-cc="picture"')),
  "picture content control must have tabindex",
)
console.log("ok picture has tabindex")

assert.ok(
  editorSrc.includes('data-cc="dropdown"') &&
    editorSrc.includes('tabindex="0"', editorSrc.indexOf('data-cc="dropdown"')),
  "dropdown content control must have tabindex",
)
console.log("ok dropdown has tabindex")

// ── Interactive handlers must exist ────────────────────────────────

// Checkbox toggle
assert.ok(
  editorSrc.includes(".cc-checkbox") &&
    editorSrc.includes("aria-checked") &&
    editorSrc.includes("☑") &&
    editorSrc.includes("☐"),
  "checkbox toggle handler must exist",
)
console.log("ok checkbox toggle handler exists")

// Picture opens image dialog
assert.ok(
  editorSrc.includes(".cc-picture") && editorSrc.includes("insertImage()"),
  "picture click handler must open image dialog",
)
console.log("ok picture handler opens image dialog")

// Dropdown opens a dialog (existing dialog opener)
assert.ok(
  editorSrc.includes(".cc-dropdown") &&
    (editorSrc.includes("openDlg") || editorSrc.includes("openDialog")),
  "dropdown click handler must open a dialog",
)
console.log("ok dropdown handler opens dialog")

// ── i18n strings must exist in both locales ─────────────────────────

// Find where LOCALE_DE starts
const deStart = i18nSrc.indexOf("const LOCALE_DE")
const enSrc = i18nSrc.slice(0, deStart)
const deSrc = i18nSrc.slice(deStart)

// Checkbox
assert.ok(enSrc.includes('"Insert.CCCheckbox"'), "en missing Insert.CCCheckbox")
assert.ok(deSrc.includes('"Insert.CCCheckbox"'), "de missing Insert.CCCheckbox")
console.log("ok CCCheckbox i18n exists in both locales")

// Date picker
assert.ok(enSrc.includes('"Insert.CCDate"'), "en missing Insert.CCDate")
assert.ok(deSrc.includes('"Insert.CCDate"'), "de missing Insert.CCDate")
console.log("ok CCDate i18n exists in both locales")

// Combo box
assert.ok(enSrc.includes('"Insert.CCCombo"'), "en missing Insert.CCCombo")
assert.ok(deSrc.includes('"Insert.CCCombo"'), "de missing Insert.CCCombo")
console.log("ok CCCombo i18n exists in both locales")

// Picture
assert.ok(enSrc.includes('"Insert.CCPicture"'), "en missing Insert.CCPicture")
assert.ok(deSrc.includes('"Insert.CCPicture"'), "de missing Insert.CCPicture")
console.log("ok CCPicture i18n exists in both locales")

// Dropdown - NEW i18n strings
assert.ok(enSrc.includes('"Insert.CCDropdown"'), "en missing Insert.CCDropdown")
assert.ok(deSrc.includes('"Insert.CCDropdown"'), "de missing Insert.CCDropdown")
console.log("ok CCDropdown i18n exists in both locales")

// Plain text content control type label
assert.ok(
  enSrc.includes('"CCPlainText"') || htmlSrc.includes("Plain text"),
  "en missing plain text label",
)
console.log("ok plain text label exists")

// Rich text content control type label
assert.ok(
  enSrc.includes('"CCRichText"') || htmlSrc.includes("Rich text"),
  "en missing rich text label",
)
console.log("ok rich text label exists")

console.log("\nAll WO-2-content-controls tests passed!\n")
console.log("CONTENT-CONTROLS-PASS")

/**
 * WO-5-add-text: divergent-behavior (references tab, interact)
 * OnlyOffice parity (slugs:add-text)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the Add Text button in References opens a modal for adding
 * text to the table of contents, with level options.
 *
 * Run with: node add-text.test.mjs
 * Success: prints add-text-PASS and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-5-add-text tests...\n")

// References tab: Add Text button
assert.ok(
  htmlSrc.includes('data-cmd="addText"'),
  'WO-5: Add Text button with data-cmd="addText" must exist in References tab',
)

assert.ok(
  htmlSrc.includes('data-i18n="Ref.AddText"'),
  'WO-5: Add Text button must have data-i18n="Ref.AddText"',
)

assert.ok(
  i18nSrc.includes('"Ref.AddText": "Add Text"'),
  "WO-5: Ref.AddText i18n key must exist in English",
)

assert.ok(
  i18nSrc.includes('"Ref.AddText": "Text hinzufügen"'),
  "WO-5: Ref.AddText i18n key must exist in German",
)

// Dialog: addtext-dialog
assert.ok(htmlSrc.includes('id="addtext-dialog"'), "WO-5: addtext-dialog must exist in index.html")

assert.ok(
  htmlSrc.includes('id="addtext-dialog" class="dialog-overlay" role="dialog"'),
  "WO-5: addtext-dialog must be a modal dialog with proper ARIA roles",
)

assert.ok(
  htmlSrc.includes('id="addtext-dialog-title"'),
  "WO-5: addtext-dialog must have a title element",
)

// Dialog: level selector
assert.ok(
  htmlSrc.includes('id="addtext-level"'),
  "WO-5: addtext-level selector must exist in the dialog",
)

assert.ok(
  htmlSrc.includes('<option value="body">Body text</option>'),
  "WO-5: level selector must have Body text option",
)

assert.ok(
  htmlSrc.includes('<option value="1">Level 1</option>'),
  "WO-5: level selector must have Level 1 option",
)

assert.ok(
  htmlSrc.includes('<option value="6">Level 6</option>'),
  "WO-5: level selector must have Level 6 option",
)

// Dialog: action buttons
assert.ok(htmlSrc.includes('id="btn-addtext-ok"'), "WO-5: btn-addtext-ok button must exist")

assert.ok(htmlSrc.includes('id="btn-addtext-close"'), "WO-5: btn-addtext-close button must exist")

// Wiring: command handler
assert.ok(
  editorSrc.includes('cmd === "addText"') &&
    editorSrc.includes('openOverlayDialog("addtext-dialog")'),
  "WO-5: addText command handler must exist and open the addtext-dialog",
)

// Wiring: dialog button handlers
assert.ok(
  editorSrc.includes("btn-addtext-ok") &&
    editorSrc.includes('closeOverlayDialog("addtext-dialog")') &&
    editorSrc.includes("confirmAddTextDialog"),
  "WO-5: btn-addtext-ok must have a click handler that closes dialog and confirms",
)

assert.ok(
  editorSrc.includes("btn-addtext-close") &&
    editorSrc.includes('closeOverlayDialog("addtext-dialog")'),
  "WO-5: btn-addtext-close must have a click handler that closes the dialog",
)

// Wiring: toolbar button
assert.ok(htmlSrc.includes('id="btn-addtext"'), "WO-5: btn-addtext toolbar button must exist")

assert.ok(
  editorSrc.includes("btn-addtext") && editorSrc.includes('openOverlayDialog("addtext-dialog")'),
  "WO-5: btn-addtext toolbar button must open the addtext-dialog",
)

// Confirmation logic
assert.ok(
  editorSrc.includes("function confirmAddTextDialog") &&
    editorSrc.includes('getElementById("addtext-level")'),
  "WO-5: confirmAddTextDialog must exist and read the level selector",
)

assert.ok(
  editorSrc.includes('className = "add-text-mask"') &&
    editorSrc.includes('setAttribute("data-addtext", "1")') &&
    editorSrc.includes('setAttribute("data-level", level)'),
  "WO-5: confirmAddTextDialog must create add-text-mask span with level attribute",
)

console.log("All WO-5-add-text tests passed!\n")
console.log("add-text-PASS")

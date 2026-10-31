/**
 * WO-9-header-footer: missing-feature (insert tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the header/footer dialog and insertHeaderFooter command are
 * properly wired in index.html and editor.js.
 *
 * Run with: node header-footer.test.mjs
 * Success: prints "HEADER-FOOTER-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-9-header-footer tests...\n")

// ── Dialog exists and has type selection ──────────────────────────

// The header/footer dialog must exist
assert.ok(
  htmlSrc.includes('id="headerfooter-dialog"'),
  "headerfooter-dialog must exist in index.html",
)

// The dialog must have a type selection fieldset
assert.ok(htmlSrc.includes('id="hf-type"'), "hf-type fieldset must exist in index.html")

// The dialog must have radio buttons for header, footer, and both
assert.ok(
  htmlSrc.includes('id="hf-type-header"') &&
    htmlSrc.includes('value="header"') &&
    htmlSrc.includes('name="hf-type"'),
  "header type radio button must exist in index.html",
)
assert.ok(
  htmlSrc.includes('id="hf-type-footer"') &&
    htmlSrc.includes('value="footer"') &&
    htmlSrc.includes('name="hf-type"'),
  "footer type radio button must exist in index.html",
)
assert.ok(
  htmlSrc.includes('id="hf-type-both"') &&
    htmlSrc.includes('value="both"') &&
    htmlSrc.includes('name="hf-type"'),
  "both type radio button must exist in index.html",
)

// The dialog must have an OK button
assert.ok(
  htmlSrc.includes('id="btn-headerfooter-ok"'),
  "btn-headerfooter-ok button must exist in index.html",
)

// ── insertHeaderFooter command wiring ──────────────────────────────

// The command must be handled in runCommand
assert.ok(
  editorSrc.includes('cmd === "insertHeaderFooter"'),
  "insertHeaderFooter command handler must exist in editor.js",
)

// The command must open the dialog
assert.ok(
  editorSrc.includes('openOverlayDialog("headerfooter-dialog")'),
  "insertHeaderFooter must open headerfooter-dialog",
)

// The insertHeaderFooter command must be active via data-cmd
assert.ok(
  htmlSrc.includes('data-cmd="insertHeaderFooter"'),
  "insertHeaderFooter data-cmd must exist in index.html",
)

// A button must trigger the insertHeaderFooter command
assert.ok(
  htmlSrc.includes('id="btn-headerfooter-combined"'),
  "btn-headerfooter-combined button must exist in index.html",
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
assert.ok(
  editorSrc.includes("runCommand(detail.command, detail.value"),
  "wo-command listener must call runCommand",
)

// ── Dialog handler reads type selection ────────────────────────────

// The OK button handler must read the selected type
assert.ok(
  editorSrc.includes("querySelector(\"input[name='hf-type']:checked\")"),
  "btn-headerfooter-ok handler must read hf-type selection",
)

// The handler must respect the type selection (not always insert both)
assert.ok(
  editorSrc.includes("hfType") && editorSrc.includes("types"),
  "btn-headerfooter-ok handler must use hfType variable",
)

// ── insertHeader and insertFooter commands ────────────────────────

// insertHeader and insertFooter commands must exist (emitted by dialog OK)
assert.ok(
  editorSrc.includes('cmd === "insertHeader"') && editorSrc.includes('cmd === "insertFooter"'),
  "insertHeader and insertFooter command handlers must exist in editor.js",
)

// insertHeader and insertFooter must create elements with page- class
// The code uses: el.className = "page-" + tag;
assert.ok(
  /className = "page-" \+ tag/.test(editorSrc),
  "insertHeader/insertFooter must set className with page- prefix",
)

// ── i18n translations ───────────────────────────────────────────────

// English translations for type selection
assert.ok(i18nSrc.includes('"HF.Type": "Type"'), "HF.Type English translation must exist")
assert.ok(i18nSrc.includes('"HF.Header": "Header"'), "HF.Header English translation must exist")
assert.ok(i18nSrc.includes('"HF.Footer": "Footer"'), "HF.Footer English translation must exist")
assert.ok(i18nSrc.includes('"HF.Both": "Both"'), "HF.Both English translation must exist")

// German translations for type selection
assert.ok(i18nSrc.includes('"HF.Type": "Typ"'), "HF.Type German translation must exist")
assert.ok(i18nSrc.includes('"HF.Header": "Kopfzeile"'), "HF.Header German translation must exist")
assert.ok(i18nSrc.includes('"HF.Footer": "Fußzeile"'), "HF.Footer German translation must exist")
assert.ok(i18nSrc.includes('"HF.Both": "Beide"'), "HF.Both German translation must exist")

// Existing HF translations must still be present
assert.ok(
  i18nSrc.includes('"HF.Close": "Close Header & Footer"') &&
    i18nSrc.includes('"HF.PageNumber": "Page number"'),
  "Existing HF translations must still exist",
)

console.log("All WO-9-header-footer tests passed!\n")
console.log("HEADER-FOOTER-PASS")

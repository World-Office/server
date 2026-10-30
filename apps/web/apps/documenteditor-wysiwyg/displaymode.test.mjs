/**
 * WO-6-displaymode: divergent-behavior (collaboration tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the Display Mode command opens a modal with OnlyOffice-parity
 * options (View, Comment, Review, Edit) instead of track-changes modes.
 *
 * Run with: node displaymode.test.mjs
 * Success: prints "displaymode-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-6-displaymode tests...\n")

// ── Display Mode dialog exists in HTML ──────────────────────────────

assert.ok(
  htmlSrc.includes('id="displaymode-dialog"'),
  "displaymode-dialog must exist in index.html",
)

// ── Dialog has OnlyOffice-style mode options (not markup/original/final) ──

assert.ok(
  htmlSrc.includes('id="displaymode-mode"'),
  "displaymode-mode select must exist in the dialog",
)

// Check for OnlyOffice display modes (View, Comment, Review, Edit)
assert.ok(htmlSrc.includes('value="view"'), "View mode option must exist in displaymode dialog")
assert.ok(
  htmlSrc.includes('value="comment"'),
  "Comment mode option must exist in displaymode dialog",
)
assert.ok(htmlSrc.includes('value="review"'), "Review mode option must exist in displaymode dialog")
assert.ok(htmlSrc.includes('value="edit"'), "Edit mode option must exist in displaymode dialog")

// Ensure old track-changes modes are NOT in the displaymode dialog
const displaymodeStart = htmlSrc.indexOf('id="displaymode-dialog"')
const displaymodeEnd = htmlSrc.indexOf("</div>", displaymodeStart) + 6
const displaymodeSection = htmlSrc.substring(displaymodeStart, displaymodeEnd)
assert.ok(
  !displaymodeSection.includes("markup"),
  "markup option should not be in displaymode dialog (belongs in trackchanges)",
)

// ── Editor JS wires displayMode command to dialog ───────────────────

assert.ok(
  editorSrc.includes('cmd === "displayMode"'),
  "displayMode command handler must exist in editor.js",
)
assert.ok(
  editorSrc.includes("openDisplayModeDialog"),
  "openDisplayModeDialog function must exist in editor.js",
)
assert.ok(
  editorSrc.includes("function openDisplayModeDialog"),
  "openDisplayModeDialog function definition must exist",
)

// Verify it references the correct select element
assert.ok(
  editorSrc.includes('"displaymode-mode"'),
  "openDisplayModeDialog must reference displaymode-mode select",
)

// Verify it uses displayMode dataset property (not viewMode)
assert.ok(
  editorSrc.includes("editor.dataset.displayMode"),
  "displayMode should be stored in editor.dataset.displayMode",
)

// Verify confirm function exists and uses correct values
assert.ok(
  editorSrc.includes("function confirmDisplayModeDialog"),
  "confirmDisplayModeDialog function must exist",
)
assert.ok(
  editorSrc.includes('"displaymode-mode"') && editorSrc.includes("editor.dataset.displayMode"),
  "confirmDisplayModeDialog uses displaymode-mode and dataset.displayMode",
)

// ── i18n translations for Display Mode ───────────────────────────────

// English translations
assert.ok(
  i18nSrc.includes('"DisplayMode.Title": "Display Mode"'),
  "DisplayMode.Title English translation must exist",
)
assert.ok(
  i18nSrc.includes('"DisplayMode.Mode": "Mode"'),
  "DisplayMode.Mode English translation must exist",
)
assert.ok(
  i18nSrc.includes('"DisplayMode.View": "View"'),
  "DisplayMode.View English translation must exist",
)
assert.ok(
  i18nSrc.includes('"DisplayMode.Comment": "Comment"'),
  "DisplayMode.Comment English translation must exist",
)
assert.ok(
  i18nSrc.includes('"DisplayMode.Review": "Review"'),
  "DisplayMode.Review English translation must exist",
)
assert.ok(
  i18nSrc.includes('"DisplayMode.Edit": "Edit"'),
  "DisplayMode.Edit English translation must exist",
)

// German translations
assert.ok(
  i18nSrc.includes('"DisplayMode.Title": "Anzeigemodus"'),
  "DisplayMode.Title German translation must exist",
)
assert.ok(
  i18nSrc.includes('"DisplayMode.Mode": "Modus"'),
  "DisplayMode.Mode German translation must exist",
)
assert.ok(
  i18nSrc.includes('"DisplayMode.View": "Anzeigen"'),
  "DisplayMode.View German translation must exist",
)
assert.ok(
  i18nSrc.includes('"DisplayMode.Comment": "Kommentieren"'),
  "DisplayMode.Comment German translation must exist",
)
assert.ok(
  i18nSrc.includes('"DisplayMode.Review": "Überprüfen"'),
  "DisplayMode.Review German translation must exist",
)
assert.ok(
  i18nSrc.includes('"DisplayMode.Edit": "Bearbeiten"'),
  "DisplayMode.Edit German translation must exist",
)

// ── Dialog has proper i18n data attributes ─────────────────────────

assert.ok(
  htmlSrc.includes('data-i18n="DisplayMode.Title"'),
  "Dialog title has DisplayMode.Title i18n attribute",
)
assert.ok(
  htmlSrc.includes('data-i18n="DisplayMode.Mode"'),
  "Mode label has DisplayMode.Mode i18n attribute",
)
assert.ok(
  htmlSrc.includes('data-i18n="DisplayMode.View"'),
  "View option has DisplayMode.View i18n attribute",
)
assert.ok(
  htmlSrc.includes('data-i18n="DisplayMode.Comment"'),
  "Comment option has DisplayMode.Comment i18n attribute",
)
assert.ok(
  htmlSrc.includes('data-i18n="DisplayMode.Review"'),
  "Review option has DisplayMode.Review i18n attribute",
)
assert.ok(
  htmlSrc.includes('data-i18n="DisplayMode.Edit"'),
  "Edit option has DisplayMode.Edit i18n attribute",
)

// ── Dialog is properly structured as a modal ────────────────────────

assert.ok(
  htmlSrc.includes('class="dialog-overlay"') && htmlSrc.includes('id="displaymode-dialog"'),
  "displaymode-dialog has dialog-overlay class",
)

assert.ok(
  htmlSrc.includes('role="dialog"') &&
    htmlSrc
      .substring(0, htmlSrc.indexOf('id="displaymode-dialog"') + 100)
      .includes('role="dialog"'),
  "displaymode-dialog has role=dialog",
)

// Dialog buttons
assert.ok(htmlSrc.includes('id="btn-displaymode-ok"'), "OK button exists in displaymode dialog")
assert.ok(
  htmlSrc.includes('id="btn-displaymode-close"'),
  "Cancel/Close button exists in displaymode dialog",
)

console.log("All WO-6-displaymode tests passed!\n")
console.log("displaymode-PASS")

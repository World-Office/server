/**
 * WO-5-colors: divergent-behavior (layout tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the Colors button opens a comprehensive theme color customization
 * modal with advanced options (HEX input, RGB controls, swatches for paper and ink).
 *
 * Run with: node colors.test.mjs
 * Success: prints "colors-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-5-colors tests...\n")

// WO-5: Theme Colors must open a comprehensive modal

// The themecolors ribbon control must exist
assert.ok(
  htmlSrc.includes('id="themecolors"'),
  "WO-5: themecolors control must exist in index.html",
)

// The ribbon control must have Colors i18n
assert.ok(
  htmlSrc.includes('data-i18n-title="Layout.Colors"'),
  "WO-5: themecolors must have Layout.Colors i18n title",
)
assert.ok(
  htmlSrc.includes('data-i18n-aria-label="Layout.Colors"'),
  "WO-5: themecolors must have Layout.Colors i18n aria-label",
)
assert.ok(
  i18nSrc.includes('"Layout.Colors": "Colors"'),
  "WO-5: Layout.Colors English i18n must exist",
)

// German translation must exist
assert.ok(
  i18nSrc.includes('"Layout.Colors": "Farbschema"'),
  "WO-5: Layout.Colors German i18n must exist",
)

// The colors dialog must exist
assert.ok(htmlSrc.includes('id="colors-dialog"'), "WO-5: colors-dialog must exist in index.html")

// The dialog must have a title
assert.ok(htmlSrc.includes('id="colors-dialog-title"'), "WO-5: colors-dialog-title must exist")

// The dialog must have scheme selector
assert.ok(htmlSrc.includes('id="cs-scheme"'), "WO-5: cs-scheme select must exist")

// The dialog must have Default scheme option
assert.ok(
  htmlSrc.includes('value="default"') && htmlSrc.includes('data-i18n="Layout.Colors.Default"'),
  "WO-5: Default scheme option must exist with i18n",
)

// The dialog must have predefined scheme options
assert.ok(
  htmlSrc.includes('value="gold"') &&
    htmlSrc.includes('value="grayscale"') &&
    htmlSrc.includes('value="blue-warm"') &&
    htmlSrc.includes('value="green-yellow"'),
  "WO-5: All predefined color schemes must exist",
)

// The dialog must have paper color swatches container
assert.ok(
  htmlSrc.includes('id="colors-paper-swatches"'),
  "WO-5: colors-paper-swatches must exist for paper color selection",
)

// The dialog must have multiple paper swatch buttons with data-color attributes
assert.ok(
  htmlSrc.includes('id="colors-paper-swatches"') && htmlSrc.match(/data-color="#/g)?.length >= 6,
  "WO-5: colors-paper-swatches must contain color-swatch buttons with data-color",
)

// The dialog must have ink color swatches container
assert.ok(
  htmlSrc.includes('id="colors-ink-swatches"'),
  "WO-5: colors-ink-swatches must exist for ink color selection",
)

// The dialog must have multiple ink swatch buttons with data-color attributes
assert.ok(
  htmlSrc.includes('id="colors-ink-swatches"') && htmlSrc.match(/data-color="#/g)?.length >= 6,
  "WO-5: colors-ink-swatches must contain color-swatch buttons with data-color",
)

// The dialog must have a custom paper color picker (native)
assert.ok(
  htmlSrc.includes('id="colors-paper-custom"') && htmlSrc.includes('type="color"'),
  "WO-5: colors-paper-custom native color input must exist",
)

// The dialog must have a custom ink color picker (native)
assert.ok(
  htmlSrc.includes('id="colors-ink-custom"') && htmlSrc.includes('type="color"'),
  "WO-5: colors-ink-custom native color input must exist",
)

// The dialog must have HEX input fields for paper and ink
assert.ok(
  htmlSrc.includes('id="colors-paper-hex"'),
  "WO-5: colors dialog must have a paper HEX input field",
)
assert.ok(
  htmlSrc.includes('id="colors-ink-hex"'),
  "WO-5: colors dialog must have an ink HEX input field",
)

// The dialog must have RGB input fields for paper and ink
assert.ok(
  htmlSrc.includes('id="colors-paper-red"') &&
    htmlSrc.includes('id="colors-paper-green"') &&
    htmlSrc.includes('id="colors-paper-blue"'),
  "WO-5: colors dialog must have paper RGB input fields",
)
assert.ok(
  htmlSrc.includes('id="colors-ink-red"') &&
    htmlSrc.includes('id="colors-ink-green"') &&
    htmlSrc.includes('id="colors-ink-blue"'),
  "WO-5: colors dialog must have ink RGB input fields",
)

// The dialog must have OK and Cancel buttons
assert.ok(
  htmlSrc.includes('id="btn-colors-ok"') && htmlSrc.includes('id="btn-colors-close"'),
  "WO-5: colors dialog must have OK and Cancel buttons",
)

// The dialog buttons must have i18n
assert.ok(
  htmlSrc.includes('data-i18n="Dialog.OK"') && htmlSrc.includes('data-i18n="Dialog.Cancel"'),
  "WO-5: dialog buttons must have i18n attributes",
)

// The colors dialog must be registered in DIALOG_IDS
assert.ok(editorSrc.includes('"colors-dialog"'), "WO-5: colors-dialog must be in DIALOG_IDS array")

// editor.js must have openColorsDialog function
assert.ok(
  editorSrc.includes("function openColorsDialog"),
  "WO-5: openColorsDialog function must exist in editor.js",
)

// editor.js must have confirmColorsDialog function
assert.ok(
  editorSrc.includes("function confirmColorsDialog"),
  "WO-5: confirmColorsDialog function must exist in editor.js",
)

// editor.js must wire the themecolors ribbon control to open the dialog on click
assert.ok(
  editorSrc.includes('themeColorsSel.addEventListener("click"') &&
    editorSrc.includes("openColorsDialog"),
  "WO-5: themecolors click must openColorsDialog",
)

// editor.js must apply CSS --paper and --ink variables
assert.ok(
  editorSrc.includes('setProperty("--paper"') && editorSrc.includes('setProperty("--ink"'),
  "WO-5: editor must apply paper and ink colors via CSS variables",
)

// editor.js must have paper color helper functions
assert.ok(
  editorSrc.includes("function updatePaperColorFromHex") &&
    editorSrc.includes("function updatePaperColorFromRgb") &&
    editorSrc.includes("function setPaperColorInputs"),
  "WO-5: editor must have paper color helper functions",
)

// editor.js must have ink color helper functions
assert.ok(
  editorSrc.includes("function updateInkColorFromHex") &&
    editorSrc.includes("function updateInkColorFromRgb") &&
    editorSrc.includes("function setInkColorInputs"),
  "WO-5: editor must have ink color helper functions",
)

// editor.js must track paper and ink color picks
assert.ok(
  editorSrc.includes("paperColorPicked") && editorSrc.includes("inkColorPicked"),
  "WO-5: editor must track paper and ink color picks",
)

// editor.js must handle HEX input validation (reusing parseHexColor)
assert.ok(
  editorSrc.includes("parseHexColor") && editorSrc.includes("rgbToHex"),
  "WO-5: editor must have color parsing helper functions",
)

// editor.js must wire paper swatches
assert.ok(
  editorSrc.includes("colors-paper-swatches") &&
    editorSrc.includes("addEventListener") &&
    editorSrc.includes("paperColorPicked"),
  "WO-5: editor must wire paper swatches event listeners",
)

// editor.js must wire ink swatches
assert.ok(
  editorSrc.includes("colors-ink-swatches") &&
    editorSrc.includes("addEventListener") &&
    editorSrc.includes("inkColorPicked"),
  "WO-5: editor must wire ink swatches event listeners",
)

// editor.js must wire paper HEX/RGB inputs
assert.ok(
  editorSrc.includes("colors-paper-hex") &&
    editorSrc.includes("colors-paper-red") &&
    editorSrc.includes("colors-paper-green") &&
    editorSrc.includes("colors-paper-blue") &&
    editorSrc.includes("addEventListener"),
  "WO-5: editor must wire paper HEX and RGB inputs",
)

// editor.js must wire ink HEX/RGB inputs
assert.ok(
  editorSrc.includes("colors-ink-hex") &&
    editorSrc.includes("colors-ink-red") &&
    editorSrc.includes("colors-ink-green") &&
    editorSrc.includes("colors-ink-blue") &&
    editorSrc.includes("addEventListener"),
  "WO-5: editor must wire ink HEX and RGB inputs",
)

// The colors dialog OK button must be wired via ROUND2
assert.ok(
  editorSrc.includes('["colors", confirmColorsDialog]'),
  "WO-5: colors must be registered in ROUND2 array with confirmColorsDialog",
)

console.log("All WO-5-colors tests passed!\n")
console.log("colors-PASS")

/**
 * WO-4: Page color — divergent-behavior (layout tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the Page Color button opens a comprehensive color picker
 * modal with advanced options (HEX input, RGB controls, extended swatches).
 *
 * Run with: node pagecolor.test.mjs
 * Success: prints "pagecolor-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-4 pagecolor tests...\n")

// WO-4: Page Color must open a comprehensive modal

// The Page Color ribbon control must exist
assert.ok(htmlSrc.includes('id="pagecolor"'), "WO-4: pagecolor control must exist in index.html")
// The ribbon control must have PageColor i18n
assert.ok(
  htmlSrc.includes('data-i18n-title="Layout.PageColor"'),
  "WO-4: pagecolor must have Layout.PageColor i18n title",
)
assert.ok(
  i18nSrc.includes('"Layout.PageColor": "Page color"'),
  "WO-4: Layout.PageColor English i18n must exist",
)

// The pagecolor dialog must exist
assert.ok(
  htmlSrc.includes('id="pagecolor-dialog"'),
  "WO-4: pagecolor-dialog must exist in index.html",
)

// The dialog must have a title
assert.ok(
  htmlSrc.includes('id="pagecolor-dialog-title"'),
  "WO-4: pagecolor-dialog-title must exist",
)

// The dialog must have swatches container
assert.ok(
  htmlSrc.includes('id="pagecolor-swatches"'),
  "WO-4: pagecolor-swatches must exist for swatch selection",
)

// The dialog must have multiple swatch buttons with data-color attributes
assert.ok(
  htmlSrc.includes('class="color-swatch"') &&
    htmlSrc.includes('data-color="#ffffff"') &&
    htmlSrc.includes('data-color="#'),
  "WO-4: pagecolor-swatches must contain color-swatch buttons with data-color",
)

// The dialog must have a custom color picker (native)
assert.ok(
  htmlSrc.includes('id="pagecolor-custom"') && htmlSrc.includes('type="color"'),
  "WO-4: pagecolor-custom native color input must exist",
)

// Advanced: The dialog must have a HEX input field
assert.ok(
  htmlSrc.includes('id="pagecolor-hex"'),
  "WO-4: pagecolor dialog must have a HEX input field",
)

// Advanced: The dialog must have RGB input fields
assert.ok(
  htmlSrc.includes('id="pagecolor-red"') &&
    htmlSrc.includes('id="pagecolor-green"') &&
    htmlSrc.includes('id="pagecolor-blue"'),
  "WO-4: pagecolor dialog must have RGB input fields",
)

// The dialog must have OK and Cancel buttons
assert.ok(
  htmlSrc.includes('id="btn-pagecolor-ok"') && htmlSrc.includes('id="btn-pagecolor-close"'),
  "WO-4: pagecolor dialog must have OK and Cancel buttons",
)

// The dialog buttons must have i18n
assert.ok(
  htmlSrc.includes('data-i18n="Dialog.OK"') && htmlSrc.includes('data-i18n="Dialog.Cancel"'),
  "WO-4: dialog buttons must have i18n attributes",
)

// editor.js must have openPageColorDialog function
assert.ok(
  editorSrc.includes("function openPageColorDialog"),
  "WO-4: openPageColorDialog function must exist in editor.js",
)

// editor.js must have confirmPageColorDialog function
assert.ok(
  editorSrc.includes("function confirmPageColorDialog"),
  "WO-4: confirmPageColorDialog function must exist in editor.js",
)

// editor.js must wire the pagecolor ribbon control to open the dialog on click
assert.ok(
  editorSrc.includes('pageColor.addEventListener("click"') &&
    editorSrc.includes("openPageColorDialog"),
  "WO-4: pagecolor click must openPageColorDialog",
)

// editor.js must track selection from swatches and custom picker
assert.ok(
  editorSrc.includes("pagecolor-custom") && editorSrc.includes("pageColorPicked"),
  "WO-4: editor must track pageColorPicked from swatches and custom picker",
)

// editor.js must apply the page color via CSS --paper variable
assert.ok(
  editorSrc.includes('setProperty("--paper"') && editorSrc.includes("pageColor"),
  "WO-4: editor must apply page color via --paper CSS variable",
)

// Advanced: editor.js must handle HEX input
assert.ok(
  editorSrc.includes("pagecolor-hex") &&
    editorSrc.includes("toUpperCase") &&
    editorSrc.includes("match(/^#[0-9A-F]{6}$/i)"),
  "WO-4: editor must validate and process HEX input",
)

// Advanced: editor.js must handle RGB inputs
assert.ok(
  editorSrc.includes("pagecolor-red") &&
    editorSrc.includes("pagecolor-green") &&
    editorSrc.includes("pagecolor-blue"),
  "WO-4: editor must handle RGB input fields",
)

// Advanced: editor.js must sync HEX and RGB values
assert.ok(
  editorSrc.includes("updatePageColorFromHex") &&
    editorSrc.includes("updatePageColorFromRgb") &&
    editorSrc.includes("setPageColorInputs"),
  "WO-4: editor must have helper functions for color format conversion",
)

// Swatches must include at least 12 colors
const swatchCount = (htmlSrc.match(/data-color="#/g) || []).length
assert.ok(
  swatchCount >= 12,
  `WO-4: pagecolor-swatches must have at least 12 colors (found ${swatchCount})`,
)

// The pagecolor dialog must be registered in DIALOG_IDS
assert.ok(
  editorSrc.includes('"pagecolor-dialog"'),
  "WO-4: pagecolor-dialog must be in DIALOG_IDS array",
)

console.log("All WO-4 pagecolor tests passed!\n")
console.log("pagecolor-PASS")

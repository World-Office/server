/**
 * SCHUTZ-X: fehlende OO-Controls: Schutz btn-add-password (Kennwort) + Startseite paracolor (Absatzhintergrund)
 * Node.js built-in test runner (node:assert, zero dependencies).
 * Verifies that btn-add-password and paracolor controls exist with proper census tracking.
 * 
 * Run with: node protect-tab.test.mjs
 * Success: prints "SCHUTZ-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const cssPath = new URL("./style.css", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")
const cssSrc = readFileSync(cssPath, "utf-8")

console.log("Running SCHUTZ-X census tests...\n")

// btn-add-password: Schutz (Protection) button for adding password
// Must exist in backstage protect pane with census tracking
assert.ok(
  htmlSrc.includes('id="btn-add-password"'),
  "btn-add-password button must exist in index.html",
)
console.log("ok 1 btn-add-password button exists")

// btn-add-password must be wrapped in census span with proper attributes
const btnAddPasswordMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-add-password"[^>]*data-wo-cmd="[^"]*"[^>]*data-wo-interact="[^"]*"[^>]*>.*?id="btn-add-password"/s,
)
assert.ok(
  btnAddPasswordMatch,
  'btn-add-password must be inside a span with data-wo-id="btn-add-password", data-wo-cmd and data-wo-interact',
)
console.log("ok 2 btn-add-password is in interact census")

// btn-add-password must be in the backstage protect view
const protectViewMatch = htmlSrc.match(
  /<div[^>]*data-pane-view="protect"[^>]*>.*?id="btn-add-password".*?<\/div>/s,
)
assert.ok(
  protectViewMatch,
  "btn-add-password must be in the protect pane view",
)
console.log("ok 3 btn-add-password is in the protect pane view")

// btn-add-password must be wired in editor.js
assert.ok(
  editorSrc.includes('getElementById("btn-add-password")'),
  "btn-add-password must have a getElementById call in editor.js",
)
console.log("ok 4 btn-add-password has editor.js wiring")

// paracolor: Startseite (Home) paragraph background color control
// The shading-color input must have census tracking
assert.ok(
  htmlSrc.includes('id="shading-color"'),
  "shading-color input must exist in index.html",
)
console.log("ok 5 shading-color input exists")

// shading-color or its parent must have census span for paracolor
const paracolorMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="paracolor"[^>]*data-wo-cmd="[^"]*"[^>]*data-wo-interact="[^"]*"[^>]*>.*?(?:id="shading-color"|class="color-btn")/s,
)
assert.ok(
  paracolorMatch,
  'paracolor (shading-color) must be inside a census span with data-wo-id="paracolor"',
)
console.log("ok 6 paracolor (shading-color) is in interact census")

// paracolor must be in the Home ribbon
// Check that paracolor exists after the home ribbon starts and before the next ribbon tab
const homeRibbonStart = htmlSrc.indexOf('<div class="ribbon-page active" data-tab="home"');
const paracolorIndex = htmlSrc.indexOf('data-wo-id="paracolor"');
const nextRibbonTab = htmlSrc.indexOf('<div class="ribbon-page"', homeRibbonStart + 1);
assert.ok(
  homeRibbonStart >= 0 && paracolorIndex > homeRibbonStart && (nextRibbonTab === -1 || paracolorIndex < nextRibbonTab),
  "paracolor must be in the Home ribbon page",
)
console.log("ok 7 paracolor is in the Home ribbon")

// The shading-color must be wired in editor.js
assert.ok(
  editorSrc.includes('shadingColor') && editorSrc.includes('applyParagraphShading'),
  "shading-color must have wiring in editor.js",
)
console.log("ok 8 paracolor (shading-color) has editor.js wiring")

// i18n: btn-add-password label must exist
assert.ok(
  i18nSrc.includes('"Menu.AddPassword"'),
  "Menu.AddPassword i18n key must exist",
)
console.log("ok 9 Menu.AddPassword i18n key exists")

// i18n: paracolor/shading label must exist (already exists as Home.Shading)
assert.ok(
  i18nSrc.includes('"Home.Shading"'),
  "Home.Shading i18n key must exist",
)
console.log("ok 10 Home.Shading i18n key exists")

// CSS: shading-color must have styling
assert.ok(
  cssSrc.includes("#shading-color") || cssSrc.includes(".color-btn"),
  "shading-color must have CSS styling",
)
console.log("ok 11 paracolor (shading-color) has CSS styling")

console.log("\nAll SCHUTZ-X tests passed!\n")
console.log("SCHUTZ-PASS")

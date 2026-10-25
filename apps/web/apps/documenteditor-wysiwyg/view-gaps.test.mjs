/**
 * AF6-VIEW-GAPS: OO 9.4 View-tab parity — Fit page/width, Zoom 100%,
 * Headings, Multiple pages, Interface theme, Dark document, Macros.
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Run with: node view-gaps.test.mjs
 * Success: prints "VIEW-GAPS-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const cssPath = new URL("./style.css", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")
const cssSrc = readFileSync(cssPath, "utf-8")

console.log("Running AF6-VIEW-GAPS tests...\n")

// ── 1. New controls exist as direct children of the view ribbon-page ──
console.log("Checking View-tab controls in index.html...")
const viewStart = htmlSrc.indexOf('<div class="ribbon-page" data-tab="view"')
assert.ok(viewStart !== -1, "View ribbon-page must exist in index.html")
const viewEnd = htmlSrc.indexOf('<div class="ribbon-page"', viewStart + 10)
assert.ok(viewEnd !== -1, "View ribbon-page must be terminated by the next ribbon-page")
const viewBlock = htmlSrc.slice(viewStart, viewEnd)
// Strip caret-menu sublists: their items are NOT direct children.
const viewTop = viewBlock.replace(/<ul class="menu-list"[\s\S]*?<\/ul>/g, "")

const newControls = [
  "btn-view-fit-width",
  "btn-view-zoom100",
  "btn-view-headings",
  "btn-view-multipages",
  "view-theme-select",
  "btn-view-darkdoc",
  "btn-macro-menu",
]
for (const id of newControls) {
  assert.ok(viewTop.includes(`id="${id}"`),
    `New View-tab control ${id} must be a direct child of the view ribbon-page`)
}
assert.ok(viewTop.includes('id="btn-view-fit"'),
  "Existing Fit page control must remain on the view ribbon-page")
console.log("All new View-tab controls are direct children\n")

// Every new control carries its label through i18n markers.
const labelMarkers = {
  "btn-view-fit-width": 'data-i18n="View.FitWidth"',
  "btn-view-zoom100": 'data-i18n="View.Zoom100"',
  "btn-view-headings": 'data-i18n="View.Headings"',
  "btn-view-multipages": 'data-i18n="View.MultiplePages"',
  "view-theme-select": 'data-i18n-aria-label="View.InterfaceTheme"',
  "btn-view-darkdoc": 'data-i18n="View.DarkDocument"',
  "btn-macro-menu": 'data-i18n="View.RecordMacro"',
}
for (const [id, marker] of Object.entries(labelMarkers)) {
  assert.ok(viewTop.includes(marker),
    `Control ${id} must carry the i18n marker ${marker}`)
}
// AF12-LABEL-PARITY: the Macros caret-menu keeps its three rows in the
// (not stripped) menu-list of the view block.
for (const rowId of ["btn-macro-record", "btn-macro-pause", "btn-macro-manager"]) {
  assert.ok(viewBlock.includes(`id="${rowId}"`),
    `Macros menu row ${rowId} must exist in the view ribbon-page`)
}
assert.ok(viewBlock.includes('data-i18n="View.MacroRecord"') &&
  viewBlock.includes('data-i18n="View.MacroPause"') &&
  viewBlock.includes('data-i18n="View.MacroManager"'),
  "Macros menu rows must carry their i18n markers")
console.log("All View-tab controls carry i18n markers\n")

// ── 2. Every data-cmd on the view page is dispatched in editor.js ──
console.log("Checking data-cmd dispatch...")
const cmds = [...viewBlock.matchAll(/data-cmd="([^"]+)"/g)].map((m) => m[1])
assert.ok(cmds.length > 0, "View ribbon-page should carry data-cmd controls")
for (const cmd of cmds) {
  assert.ok(editorSrc.includes(`"${cmd}"`),
    `data-cmd "${cmd}" on the view ribbon-page must be dispatched in editor.js`)
}
console.log(`All ${cmds.length} view data-cmds dispatched in editor.js\n`)

// ── 3. i18n keys exist in BOTH locales (en + de) ──
console.log("Checking i18n keys for en and de...")
const newKeys = [
  "View.FitWidth",
  "View.Zoom100",
  "View.Headings",
  "View.MultiplePages",
  "View.InterfaceTheme",
  "View.ThemeLight",
  "View.ThemeDark",
  "View.DarkDocument",
  "View.RecordMacro",
  "View.MacroRecord",
  "View.MacroPause",
  "View.MacroManager",
]
for (const key of newKeys) {
  const occurrences = (i18nSrc.match(new RegExp(`"${key}":`, "g")) || []).length
  assert.ok(occurrences >= 2, `i18n key ${key} must exist in en AND de (found ${occurrences})`)
}
const germanValues = {
  "View.FitWidth": "Breite einpassen",
  "View.Zoom100": "Zoom auf 100%",
  "View.Headings": "Überschriften",
  "View.MultiplePages": "Mehrere Seiten",
  "View.InterfaceTheme": "Oberflächendesign",
  "View.ThemeLight": "Hell",
  "View.ThemeDark": "Dunkel",
  "View.DarkDocument": "Dunkles Dokument",
  "View.RecordMacro": "Makros",
  "View.MacroRecord": "Makro aufzeichnen",
  "View.MacroPause": "Aufzeichnung pausieren",
  "View.MacroManager": "Makro-Manager",
}
for (const [key, value] of Object.entries(germanValues)) {
  assert.ok(i18nSrc.includes(`"${key}": "${value}"`),
    `German translation ${key} must be "${value}"`)
}
console.log("All i18n keys present in both locales\n")

// ── 4. Zoom controls route through the ONE zoom application function ──
console.log("Checking single zoom path...")
assert.equal((editorSrc.match(/function applyZoom\b/g) || []).length, 1,
  "editor.js must have exactly ONE zoom application function (applyZoom)")
assert.equal((editorSrc.match(/style\.zoom\s*=[^=]/g) || []).length, 1,
  "Only applyZoom may WRITE style.zoom — no second zoom application path")
// Fit width / Zoom 100% relay to the statusbar zoom machinery...
assert.ok(/btn-view-fit-width[\s\S]{0,200}btn-zoom-fit/.test(editorSrc),
  "Fit width must reuse the statusbar fit control (btn-zoom-fit)")
assert.ok(/btn-view-zoom100[\s\S]{0,200}btn-zoom-reset/.test(editorSrc),
  "Zoom 100% must reuse the statusbar reset control (btn-zoom-reset)")
// ...and Fit page computes through the same zoomLevel + applyZoom state.
const viewFitHandler =
  /const viewFit = document\.getElementById\("btn-view-fit"\);[\s\S]*?applyZoom\(\);/
assert.ok(viewFitHandler.test(editorSrc),
  "Fit page must apply zoom through applyZoom (the single application function)")
assert.ok(editorSrc.includes("Math.min(availW / 830, availH / 1159)"),
  "Fit page must fit BOTH axes (whole page in viewport)")
console.log("All zoom controls route through the single zoom state\n")

// ── 5. Reuse of the existing single-source machinery ──
console.log("Checking reuse wiring...")
assert.ok(/btn-view-headings[\s\S]{0,200}btn-nav-toggle/.test(editorSrc),
  "Headings must reuse the navigation/heading-outline toggle")
assert.ok(/btn-view-multipages[\s\S]{0,200}btn-multipage/.test(editorSrc),
  "Multiple pages must reuse the statusbar multi-page gutter toggle")
assert.ok(/view-theme-select[\s\S]{0,300}applyTheme/.test(editorSrc),
  "Interface theme must reuse the existing theme application (applyTheme)")
assert.ok(editorSrc.includes('"wo-theme"'),
  "Interface theme must persist through the existing wo-theme storage key")
assert.ok(/btn-view-darkdoc[\s\S]{0,200}dark-document/.test(editorSrc),
  "Dark document must toggle the document-area dark class")
assert.ok(cssSrc.includes("main.dark-document"),
  "style.css must style the dark-document view state")
console.log("All reuse wiring present\n")

// ── 6. Macro markers: honest events, NO bare console.log stubs ──
console.log("Checking macro event markers...")
assert.ok(editorSrc.includes('CustomEvent("wo:macro"'),
  "Macro controls must dispatch the wo:macro CustomEvent")
assert.ok(editorSrc.includes("wo:macro"),
  "Macro markers must be observable")
assert.ok(/emitMacroMarker\("record"\)/.test(editorSrc),
  "Record macro must emit the record marker")
assert.ok(/emitMacroMarker\("pause"\)/.test(editorSrc),
  "Pause recording must emit the pause marker")
assert.ok(!editorSrc.includes("console.log("),
  "editor.js must not contain bare console.log stubs")
assert.ok((editorSrc.match(/console\.info\("wo:macro/g) || []).length >= 1,
  "Macro markers must use console.info per the established marker pattern")
console.log("Macro markers are honest events (no console.log)\n")

console.log("All AF6-VIEW-GAPS tests passed!\n")
console.log("VIEW-GAPS-PASS")

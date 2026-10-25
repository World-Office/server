/**
 * AF12-LABEL-PARITY: OO label parity — renamed WO labels to OO wording,
 * promoted hidden Insert-tools controls to top-level, placement buttons
 * (References/Collaboration), Header-footer Field/Image, Macros caret-menu,
 * chart Width/Height inputs.
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Run with: node label-parity.test.mjs
 * Success: prints "LABEL-PARITY-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running AF12-LABEL-PARITY tests...\n")

function sliceBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker)
  assert.ok(start !== -1, `start marker must exist: ${startMarker}`)
  const end = src.indexOf(endMarker, start + startMarker.length)
  assert.ok(end !== -1, `end marker must exist: ${endMarker}`)
  return src.slice(start, end)
}

// ── (a) Renamed labels exist in en AND de ────────────────────────────
console.log("Checking renamed i18n labels (en + de)...")
const renamedLabels = {
  "Home.FontInc": ["Increment font size", "Schriftgröße erhöhen"],
  "Home.FontDec": ["Decrement font size", "Schriftgröße verkleinern"],
  "Ctx.RemoveFormat": ["Clear style", "Formatierung zurücksetzen"],
  "Prot.Password": ["Encrypt", "Verschlüsseln"],
  "Prot.Restrict": ["Protect Document", "Dokument schützen"],
  "Insert.TextArt": ["TextArt", "TextArt"],
  "AI.Summarize": ["Summarization", "Zusammenfassung"],
  "AI.Translate": ["Translation", "Übersetzung"],
  "AI.Assistant": ["Chatbot", "Chatbot"],
  "View.RecordMacro": ["Macros", "Makros"],
  "Insert.TextFromFile": ["Text from File", "Text aus Datei"],
  "Insert.Field": ["Field", "Feld"],
  "Insert.ContentControl": ["Content Controls", "Inhaltssteuerelemente"],
  "Insert.Equation": ["Equation", "Formel"],
  "Insert.SmartArt": ["SmartArt", "SmartArt"],
}
for (const [key, [en, de]] of Object.entries(renamedLabels)) {
  assert.ok(i18nSrc.includes(`"${key}": "${en}"`),
    `${key}: en label must be "${en}"`)
  assert.ok(i18nSrc.includes(`"${key}": "${de}"`),
    `${key}: de label must be "${de}"`)
}
// The superseded key must be gone from both catalogs.
assert.ok(!i18nSrc.includes('"View.PauseRecording"'),
  "View.PauseRecording must be removed (superseded by View.MacroPause)")
// New companion keys.
const newKeys = {
  "View.MacroRecord": ["Record macro", "Makro aufzeichnen"],
  "View.MacroPause": ["Pause recording", "Aufzeichnung pausieren"],
  "View.MacroManager": ["Macro manager", "Makro-Manager"],
  "HF.Field": ["Field", "Feld"],
  "HF.Image": ["Image", "Bild"],
  "Ref.Link": ["Link", "Link"],
  "Ref.Bookmark": ["Bookmark", "Lesezeichen"],
  "Ref.AddText": ["Add Text", "Text hinzufügen"],
  "Collab.Accept": ["Accept", "Annehmen"],
  "Collab.Reject": ["Reject", "Ablehnen"],
  "Collab.MailMerge": ["Mail Merge", "Seriendruck"],
  "Toolbar.DateTimeTitle": ["Date & Time", "Datum und Uhrzeit"],
  "Menu.Export": ["Download As", "Herunterladen als"],
}
for (const [key, [en, de]] of Object.entries(newKeys)) {
  assert.ok(i18nSrc.includes(`"${key}": "${en}"`),
    `${key}: en label must be "${en}"`)
  assert.ok(i18nSrc.includes(`"${key}": "${de}"`),
    `${key}: de label must be "${de}"`)
}
for (const fmt of ["Pdf", "Odt", "Html", "Docx"]) {
  const occurrences = (i18nSrc.match(new RegExp(`"Menu.Export${fmt}":`, "g")) || []).length
  assert.ok(occurrences >= 2, `Menu.Export${fmt} must exist in en AND de`)
}
// Untouched keys stay pinned (regression guard for the renames).
assert.ok(i18nSrc.includes('"Home.FontColor": "Font color"'),
  "Home.FontColor keeps its existing label")
assert.ok(i18nSrc.includes('"Toolbar.HeaderTitle": "Insert page header"'),
  "Toolbar.HeaderTitle keeps its existing label")
assert.ok(i18nSrc.includes('"Toolbar.FooterTitle": "Insert page footer"'),
  "Toolbar.FooterTitle keeps its existing label")
console.log("All renamed labels present in en and de\n")

// ── (b) Promoted Insert-tools buttons: top-level + dispatched ────────
console.log("Checking promoted Insert-tools buttons...")
const insertPage = sliceBetween(
  htmlSrc,
  '<div class="ribbon-page" data-tab="insert"',
  '<div class="ribbon-page" data-tab="draw"',
)
const insertMoreList = sliceBetween(
  insertPage,
  'id="btn-insert-more"',
  "</span>",
)
const promoted = [
  ["btn-textfile", "Insert.TextFromFile"],
  ["btn-addtext", "Insert.AddText"],
  ["btn-field", "Insert.Field"],
  ["btn-contentcontrol", "Insert.ContentControl"],
  ["btn-equation", "Insert.Equation"],
  ["btn-smartart", "Insert.SmartArt"],
]
for (const [id, marker] of promoted) {
  const btn = `<button type="button" id="${id}" data-i18n="${marker}">`
  assert.ok(insertPage.includes(btn),
    `${id} must be a top-level button on the insert ribbon-page`)
  assert.ok(!insertMoreList.includes(`id="${id}"`),
    `${id} must NOT remain inside the Insert tools dropdown`)
  assert.ok(editorSrc.includes(`getElementById("${id}")`),
    `${id} must be wired in editor.js`)
}
// Dropdown keeps its two remaining entries.
assert.ok(insertMoreList.includes('id="btn-mailmerge"'),
  "Insert tools dropdown keeps mail merge")
assert.ok(insertMoreList.includes('id="btn-chart"'),
  "Insert tools dropdown keeps chart editor")
// The datetime button localizes its title/aria now.
assert.ok(insertPage.includes('data-i18n-title="Toolbar.DateTimeTitle"') &&
  insertPage.includes('data-i18n-aria-label="Toolbar.DateTimeTitle"'),
  "btn-datetime must localize title and aria-label")
console.log("All promoted buttons are top-level and wired\n")

// ── (c) Placement buttons: References + Collaboration, dispatched ────
console.log("Checking placement buttons...")
const referencesPage = sliceBetween(
  htmlSrc,
  '<div class="ribbon-page" data-tab="references"',
  '<div class="ribbon-page" data-tab="collaboration"',
)
for (const [cmd, marker] of [
  ["link", "Ref.Link"],
  ["bookmark", "Ref.Bookmark"],
  ["addText", "Ref.AddText"],
]) {
  assert.ok(referencesPage.includes(`data-cmd="${cmd}" data-i18n="${marker}"`),
    `References page must carry the ${cmd} placement button`)
  assert.ok(editorSrc.includes(`cmd === "${cmd}"`),
    `${cmd} must be dispatched in runCommand`)
}
const collabPage = sliceBetween(
  htmlSrc,
  '<div class="ribbon-page" data-tab="collaboration"',
  '<div class="ribbon-page" data-tab="protection"',
)
for (const [cmd, marker] of [
  ["acceptTrackedChange", "Collab.Accept"],
  ["rejectTrackedChange", "Collab.Reject"],
  ["mailMerge", "Collab.MailMerge"],
]) {
  assert.ok(collabPage.includes(`data-cmd="${cmd}" data-i18n="${marker}"`),
    `Collaboration page must carry the ${cmd} placement button`)
  assert.ok(editorSrc.includes(`cmd === "${cmd}"`),
    `${cmd} must be dispatched in runCommand`)
}
assert.ok(editorSrc.includes('trackedChangeAtSelection("accept")'),
  "acceptTrackedChange must route through trackedChangeAtSelection")
assert.ok(editorSrc.includes('trackedChangeAtSelection("reject")'),
  "rejectTrackedChange must route through trackedChangeAtSelection")
console.log("All placement buttons exist and are dispatched\n")

// ── (d) Header-footer Field/Image buttons wired ──────────────────────
console.log("Checking header-footer Field/Image buttons...")
const hfPage = sliceBetween(
  htmlSrc,
  '<div class="ribbon-page" data-tab="header-footer"',
  '<div class="ruler"',
)
assert.ok(hfPage.includes('id="btn-hf-field"'), "Header-footer page must have the Field button")
assert.ok(hfPage.includes('id="btn-hf-image"'), "Header-footer page must have the Image button")
assert.ok(hfPage.includes('data-i18n="HF.Field"'), "Field button must carry the HF.Field marker")
assert.ok(hfPage.includes('data-i18n="HF.Image"'), "Image button must carry the HF.Image marker")
assert.ok(editorSrc.includes('getElementById("btn-hf-field")'),
  "btn-hf-field must be wired in editor.js")
assert.ok(editorSrc.includes('getElementById("btn-hf-image")'),
  "btn-hf-image must be wired in editor.js")
assert.ok(editorSrc.includes('CustomEvent("wo:header-field"'),
  "btn-hf-field must dispatch the wo:header-field marker event")
assert.ok(editorSrc.includes('CustomEvent("wo:header-image"'),
  "btn-hf-image must dispatch the wo:header-image marker event")
assert.ok(editorSrc.includes('console.info("wo:header-field'),
  "btn-hf-field must log the established console.info marker")
assert.ok(editorSrc.includes('console.info("wo:header-image'),
  "btn-hf-image must log the established console.info marker")
console.log("Header-footer Field/Image wired\n")

// ── (e) Macros caret-menu with three rows ────────────────────────────
console.log("Checking Macros caret-menu...")
const viewPage = sliceBetween(
  htmlSrc,
  '<div class="ribbon-page" data-tab="view"',
  '<div class="ribbon-page" data-tab="plugins"',
)
const macroMenu = sliceBetween(viewPage, 'id="btn-macro-menu"', "</span>")
assert.ok(macroMenu.includes('aria-haspopup="true"'),
  "Macros menu trigger must be a caret menu")
for (const rowId of ["btn-macro-record", "btn-macro-pause", "btn-macro-manager"]) {
  assert.ok(macroMenu.includes(`id="${rowId}"`),
    `Macros menu must contain row ${rowId}`)
}
assert.ok(macroMenu.includes('data-i18n="View.MacroRecord"'), "Record macro row marker")
assert.ok(macroMenu.includes('data-i18n="View.MacroPause"'), "Pause recording row marker")
assert.ok(macroMenu.includes('data-i18n="View.MacroManager"'), "Macro manager row marker")
assert.ok(editorSrc.includes('getElementById("btn-macro-manager")'),
  "btn-macro-manager must be wired in editor.js")
assert.ok(editorSrc.includes('CustomEvent("wo:macro-manager"'),
  "btn-macro-manager must dispatch the wo:macro-manager marker event")
assert.ok(editorSrc.includes('console.info("wo:macro-manager'),
  "btn-macro-manager must log the established console.info marker")
console.log("Macros caret-menu complete\n")

// ── (f) Chart-design Width/Height inputs ─────────────────────────────
console.log("Checking chart Width/Height inputs...")
const chartPage = sliceBetween(
  htmlSrc,
  '<div class="ribbon-page" data-tab="chart-design"',
  '<div class="ribbon-page"',
)
assert.ok(chartPage.includes('id="chart-width-input"'), "Chart width input must exist")
assert.ok(chartPage.includes('id="chart-height-input"'), "Chart height input must exist")
assert.ok(chartPage.includes('data-cmd="chartSize"'), "Apply-size button must exist")
assert.ok(editorSrc.includes('getElementById("chart-width-input")'),
  "chart-width-input must be read in editor.js")
assert.ok(editorSrc.includes('getElementById("chart-height-input")'),
  "chart-height-input must be read in editor.js")
console.log("Chart Width/Height inputs present and wired\n")

// ── (g) No bare console.log anywhere in editor.js ────────────────────
console.log("Checking console.log ban...")
assert.ok(!editorSrc.includes("console.log("),
  "editor.js must not contain bare console.log (use console.info + wo: markers)")
console.log("No bare console.log in editor.js\n")

console.log("All AF12-LABEL-PARITY tests passed!\n")
console.log("LABEL-PARITY-PASS")

/**
 * WO-19-download: census-artifact (backstage tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-export is included in the interact census with
 * wo_id=btn-export, wo_cmd=btn-export, and opens_wo='menu', matching
 * OnlyOffice parity (slugs:download).
 *
 * Run with: node download.test.mjs
 * Success: prints "download-PASS" and exits 0.
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

console.log("Running WO-19-download interact census tests...\n")

// The btn-export button must exist
assert.ok(htmlSrc.includes('id="btn-export"'), "btn-export button must exist in index.html")
console.log("ok 1 btn-export button exists")

// The btn-export must be wrapped in a span with the census attributes; the OO
// reference (interact census, token "download") discloses the export format
// list (a menu), so the parity kind is menu, not modal or panel.
const btnExportMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-export"[^>]*data-wo-cmd="btn-export"[^>]*data-wo-interact="opens:menu"[^>]*>.*?id="btn-export"/s,
)
assert.ok(
  btnExportMatch,
  'btn-export must be inside a span with data-wo-id/data-wo-cmd="btn-export" and data-wo-interact="opens:menu"',
)
console.log("ok 2 btn-export is in interact census with opens:menu")

// No stale/mis-typed census row: the span immediately wrapping btn-export must
// carry the menu token, never the modal/panel token.
const wrappingSpan = htmlSrc.match(/<span([^>]*)>\s*<button[^>]*id="btn-export"/)
assert.ok(wrappingSpan, "btn-export must be directly wrapped by a census span")
assert.ok(
  wrappingSpan[1].includes('data-wo-interact="opens:menu"'),
  "the census span wrapping btn-export must declare opens:menu",
)
assert.ok(
  !wrappingSpan[1].includes('data-wo-interact="opens:modal"') &&
    !wrappingSpan[1].includes('data-wo-interact="opens:panel"'),
  "the census span wrapping btn-export must not declare opens:modal or opens:panel",
)
console.log("ok 3 btn-export census row is not mis-declared as modal/panel")

// The btn-export must be inside the backstage overlay
const backstageMatch = htmlSrc.match(
  /<div id="backstage-overlay"[^>]*>.*?id="btn-export".*?<\/div>/s,
)
assert.ok(backstageMatch, "btn-export must be inside the backstage overlay")
console.log("ok 4 btn-export is in the backstage overlay")

// The btn-export must live in the export pane view (the Download As panel)
const exportPaneMatch = htmlSrc.match(
  /<div[^>]*data-pane-view="export"[^>]*>.*?id="btn-export".*?<\/div>/s,
)
assert.ok(exportPaneMatch, "btn-export must be in the export pane view")
console.log("ok 5 btn-export is in the export pane view")

// The menu the census token promises is real: the export pane discloses the
// format sublist (PDF/ODT/HTML/DOCX) that drives the actual downloads.
assert.ok(htmlSrc.includes('id="export-sub"'), "export-sub menu host must exist")
for (const format of ["pdf", "odt", "html", "docx"]) {
  assert.ok(
    htmlSrc.includes(`data-export="${format}"`),
    `export-sub must offer the ${format} format`,
  )
}
console.log("ok 6 export pane hosts the export format submenu")

// editor.js must have the real (non-stub) doExport handler that downloads a
// generated copy through the document export endpoint.
assert.ok(
  editorSrc.includes("function doExport(format)"),
  "doExport function must exist in editor.js",
)
assert.ok(
  editorSrc.includes("/api/documents/${encodeURIComponent(DOC_ID)}/export?format="),
  "doExport must call the document export endpoint",
)
assert.ok(
  editorSrc.includes('a.download = DOC_NAME.replace(/\\.[^.]+$/, "") + "." + format;'),
  "doExport must name the downloaded file from the document name",
)
console.log("ok 7 doExport downloads a copy through the export endpoint")

// editor.js must wire btn-export click to disclose the export submenu
assert.ok(
  editorSrc.includes('const exportTrigger = document.getElementById("btn-export");') &&
    editorSrc.includes('exportTrigger.addEventListener("click", (ev) => {') &&
    editorSrc.includes("setMenu(exportSub, exportTrigger, exportSub.hidden);"),
  "btn-export must have click handler wiring to the export submenu",
)
console.log("ok 8 btn-export click handler is wired to the export submenu")

// Each export submenu item must run the real doExport command
assert.ok(
  editorSrc.includes('exportSub.querySelectorAll("button[data-export]").forEach((b) => {') &&
    editorSrc.includes("doExport(b.dataset.export);"),
  "export submenu items must be wired to doExport",
)
console.log("ok 9 export submenu items are wired to doExport")

// The export submenu must be styled (menu-sublist) in the stylesheet
assert.ok(cssSrc.includes(".menu-sublist"), "export submenu styles must exist")
console.log("ok 10 export submenu is styled")

// i18n: Export labels/copy must exist in BOTH locales
for (const key of [
  "Menu.Export",
  "Menu.ExportPdf",
  "Menu.ExportOdt",
  "Menu.ExportHtml",
  "Menu.ExportDocx",
  "FileScreen.TitleExport",
  "FileScreen.DescExport",
  "FileMenu.Exporting",
]) {
  const count = i18nSrc.split(`"${key}"`).length - 1
  assert.ok(count >= 2, `${key} must be present in both en and de catalogs (found ${count})`)
}
console.log("ok 11 Export i18n keys exist in both locales")

console.log("\nAll WO-19-download interact census tests passed!\n")
console.log("download-PASS")

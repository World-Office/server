/**
 * CHROME3-BACKSTAGE-STATUSBAR gate: static structure pins for the OO
 * backstage overlay (File screen) + statusbar cluster layout.
 * Node.js built-in test runner (node:assert, zero dependencies).
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

console.log("Running CHROME3-BACKSTAGE-STATUSBAR tests...\n")

// 1. Backstage overlay: modal dialog contract
console.log("Checking backstage overlay dialog contract...")
assert.ok(htmlSrc.includes('id="backstage-overlay"'), "backstage overlay must exist in index.html")
assert.ok(
  htmlSrc.match(/id="backstage-overlay"[^>]*role="dialog"/),
  "backstage overlay must have role=dialog",
)
assert.ok(
  htmlSrc.match(/id="backstage-overlay"[^>]*aria-modal="true"/),
  "backstage overlay must be aria-modal",
)
assert.ok(
  htmlSrc.match(/id="backstage-overlay"[^>]*aria-labelledby="backstage-title"/),
  "backstage overlay must label via backstage-title",
)
assert.ok(htmlSrc.includes('id="backstage-title"'), "backstage-title anchor must exist")
assert.ok(!htmlSrc.includes('id="file-menu"'), "old #file-menu dropdown must be gone")
console.log("Dialog contract ok\n")

// 2. File trigger wires to the overlay
console.log("Checking File trigger wiring...")
assert.ok(
  htmlSrc.match(/id="btn-file"[^>]*aria-controls="backstage-overlay"/),
  "btn-file must point at the overlay via aria-controls",
)
assert.ok(
  htmlSrc.match(/id="btn-file"[^>]*aria-haspopup="dialog"/),
  "btn-file must declare aria-haspopup=dialog",
)
console.log("File trigger ok\n")

// 3. Every legacy file-menu affordance survives inside the overlay
console.log("Checking legacy ids/data-cmds preserved...")
for (const id of [
  "btn-new",
  "btn-open",
  "btn-export",
  "btn-print",
  "btn-history",
  "btn-ai-review",
  "btn-fileinfo",
  "btn-fileprotect",
  "btn-filesettings",
  "btn-filehelp",
  "btn-filesuggest",
]) {
  assert.ok(htmlSrc.includes(`id="${id}"`), `legacy id ${id} must still exist`)
}
assert.ok(htmlSrc.includes('data-cmd="closeFileMenu"'), "Back row must keep data-cmd=closeFileMenu")
assert.ok(htmlSrc.includes('data-cmd="saveDocument"'), "Save pane button must keep data-cmd=saveDocument")
assert.ok(htmlSrc.includes('id="export-sub"'), "export-sub list must exist in the export pane")
for (const fmt of ["pdf", "odt", "html", "docx"]) {
  assert.ok(htmlSrc.includes(`data-export="${fmt}"`), `export format ${fmt} must exist`)
}
console.log("Legacy affordances ok\n")

// 4. Statusbar OO cluster order: page+word left, language/view/zoom right
console.log("Checking statusbar cluster order...")
assert.ok(htmlSrc.includes('id="sb-lang"'), "sb-lang language indicator must exist")
const sbStart = htmlSrc.indexOf('<footer class="statusbar">')
const sbEnd = htmlSrc.indexOf("</footer>", sbStart)
assert.ok(sbStart !== -1 && sbEnd > sbStart, "statusbar footer must exist")
const sb = htmlSrc.slice(sbStart, sbEnd)
const idxOf = (needle) => sb.indexOf(needle)
assert.ok(idxOf('id="sb-page-count"') < idxOf('id="sb-word-count"'), "page count must precede word count (left cluster)")
assert.ok(idxOf('id="sb-word-count"') < idxOf('class="spacer"'), "left cluster must precede the spacer")
assert.ok(idxOf('class="spacer"') < idxOf('id="sb-lang"'), "right cluster must follow the spacer")
assert.ok(idxOf('id="sb-lang"') < idxOf('id="btn-zoom-out"'), "language indicator must precede the zoom cluster")
assert.ok(idxOf('id="btn-multipage"') < idxOf('id="btn-zoom-out"'), "view toggles must precede the zoom cluster")
assert.ok(idxOf('id="sb-track-changes"') < idxOf('id="btn-zoom-out"'), "track changes must precede the zoom cluster")
console.log("Cluster order ok\n")

// 5. editor.js backstage machinery
console.log("Checking editor.js backstage wiring...")
assert.ok(
  editorSrc.match(/const DIALOG_IDS = \[[^\]]*"backstage-overlay"/),
  "backstage-overlay must be registered in DIALOG_IDS (Esc + Tab trap)",
)
assert.ok(
  editorSrc.match(/"backstage-overlay":\s*closeBackstage/),
  "DIALOG_CLOSE must route backstage-overlay to closeBackstage",
)
assert.ok(editorSrc.includes("function closeBackstage("), "closeBackstage must be defined")
assert.ok(editorSrc.includes("function hideBackstage("), "hideBackstage must be defined")
assert.ok(editorSrc.includes("function openBackstage("), "openBackstage must be defined")
assert.ok(editorSrc.includes("function showBackstagePane("), "showBackstagePane must be defined")
assert.ok(editorSrc.includes("function isBackstageOpen("), "isBackstageOpen must be defined")
assert.ok(
  !editorSrc.includes('getElementById("file-menu")'),
  "fileMenu lookup must be gone",
)
assert.ok(
  editorSrc.includes('getElementById("export-sub")'),
  "exportSub must resolve export-sub directly",
)
const closeAllMatch = editorSrc.match(/function closeAllMenus\(\) \{[\s\S]*?\n  \}/)
assert.ok(closeAllMatch, "closeAllMenus must exist")
assert.ok(closeAllMatch[0].includes("hideBackstage()"), "closeAllMenus must hide the backstage overlay")
console.log("Backstage wiring ok\n")

// 6. Language indicator sync
console.log("Checking statusbar language sync...")
assert.ok(editorSrc.includes("function syncStatusbarLang("), "syncStatusbarLang must be defined")
const syncCalls = editorSrc.split("syncStatusbarLang()").length - 1
assert.ok(syncCalls >= 3, `syncStatusbarLang must be called from boot, locale change and lang change (got ${syncCalls})`)
console.log("Language sync ok\n")

// 7. i18n: FileScreen namespace present in BOTH catalogs
console.log("Checking FileScreen i18n keys...")
for (const key of [
  "FileScreen.GroupDoc",
  "FileScreen.GroupInfo",
  "FileScreen.GroupPrint",
  "FileScreen.GroupHelp",
  "FileScreen.NavInfo",
  "FileScreen.NavHistory",
  "FileScreen.NavAI",
  "FileScreen.NavSettings",
  "FileScreen.NavProtect",
  "FileScreen.NavHelp",
  "FileScreen.NavSuggest",
  "FileScreen.TitleInfo",
  "FileScreen.DescInfo",
  "FileScreen.LangTitle",
  "FileScreen.LangAria",
]) {
  const occurrences = i18nSrc.split(`"${key}":`).length - 1
  assert.ok(occurrences >= 2, `i18n key ${key} must exist in en AND de catalogs (got ${occurrences})`)
}
for (const pane of ["New", "Open", "Save", "Export", "Info", "History", "AI", "Print", "Settings", "Protect", "Help", "Suggest"]) {
  for (const kind of ["Title", "Desc"]) {
    const key = `FileScreen.${kind}${pane}`
    const occurrences = i18nSrc.split(`"${key}":`).length - 1
    assert.ok(occurrences >= 2, `i18n key ${key} must exist in en AND de catalogs (got ${occurrences})`)
  }
}
console.log("FileScreen keys ok\n")

// 8. Styles
console.log("Checking backstage styles...")
assert.ok(cssSrc.includes(".backstage-overlay"), "backstage overlay styles must exist")
assert.ok(cssSrc.includes(".backstage-rail"), "backstage rail styles must exist")
assert.ok(cssSrc.includes("--backstage-rail"), "backstage rail theme variable must exist")
assert.ok(cssSrc.match(/\.backstage-overlay\.open/), "backstage open state must be styled")
assert.ok(cssSrc.includes(".sb-cluster"), "statusbar cluster styles must exist")
assert.ok(
  cssSrc.match(/html\.light \.statusbar \{ background: #f3f2f1/),
  "light statusbar must use the OO light-gray tone",
)
console.log("Styles ok\n")

console.log("All CHROME3-BACKSTAGE-STATUSBAR tests passed!\n")
console.log("CHROME3-BACKSTAGE-STATUSBAR-PASS")

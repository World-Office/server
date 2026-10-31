/**
 * WO-19-recent: census-artifact (backstage tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-open is included in the interact census with
 * wo_id=btn-open, wo_cmd=btn-open, and opens_wo='panel',
 * matching OnlyOffice parity (slugs:recent).
 *
 * Run with: node recent.test.mjs
 * Success: prints "recent-PASS" and exits 0.
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

console.log("Running WO-19-recent interact census tests...\n")

// The btn-open button must exist
assert.ok(htmlSrc.includes('id="btn-open"'), "btn-open button must exist in index.html")
console.log("ok 1 btn-open button exists")

// The btn-open must be wrapped in a span with the census attributes; the OO
// reference (interact ledger, token "recent") opens a backstage panel, so the
// parity kind is panel, not modal.
const btnOpenMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-open"[^>]*data-wo-cmd="btn-open"[^>]*data-wo-interact="opens:panel"[^>]*>.*?id="btn-open"/s,
)
assert.ok(
  btnOpenMatch,
  'btn-open must be inside a span with data-wo-id/data-wo-cmd="btn-open" and data-wo-interact="opens:panel"',
)
console.log("ok 2 btn-open is in interact census with opens:panel")

// No stale/mis-typed census row: the span immediately wrapping btn-open must
// carry the panel token, never the modal token.
const wrappingSpan = htmlSrc.match(/<span([^>]*)>\s*<button[^>]*id="btn-open"/)
assert.ok(wrappingSpan, "btn-open must be directly wrapped by a census span")
assert.ok(
  wrappingSpan[1].includes('data-wo-interact="opens:panel"'),
  "the census span wrapping btn-open must declare opens:panel",
)
assert.ok(
  !wrappingSpan[1].includes('data-wo-interact="opens:modal"'),
  'the census span wrapping btn-open must not declare data-wo-interact="opens:modal"',
)
console.log("ok 3 btn-open census row is not mis-declared as opens:modal")

// The btn-open must be inside the backstage overlay
const backstageMatch = htmlSrc.match(/<div id="backstage-overlay"[^>]*>.*?id="btn-open".*?<\/div>/s)
assert.ok(backstageMatch, "btn-open must be inside the backstage overlay")
console.log("ok 4 btn-open is in the backstage overlay")

// The btn-open must live in the open pane view (the Recent/Open panel)
const openPaneMatch = htmlSrc.match(
  /<div[^>]*data-pane-view="open"[^>]*>.*?id="btn-open".*?<\/div>/s,
)
assert.ok(openPaneMatch, "btn-open must be in the open pane view")
console.log("ok 5 btn-open is in the open pane view")

// The panel the census token promises is real: the open pane hosts the
// recent-files list fed by GET /api/documents (bsLoadRecent/bsRenderRecent).
assert.ok(htmlSrc.includes('id="backstage-recent"'), "backstage-recent panel host must exist")
console.log("ok 6 backstage open pane hosts the recent-files panel")

// editor.js must have the real (non-stub) doOpen handler
assert.ok(editorSrc.includes("function doOpen()"), "doOpen function must exist in editor.js")
assert.ok(
  editorSrc.includes('new CustomEvent("wo-open-file"'),
  "doOpen must delegate to the host via the wo-open-file event",
)
console.log("ok 7 doOpen delegates to the host open surface")

// editor.js must wire btn-open click to doOpen
assert.ok(
  editorSrc.includes('getElementById("btn-open")') &&
    editorSrc.includes('btnOpen.addEventListener("click", () => { closeAllMenus(); doOpen(); })'),
  "btn-open must have click handler wired to doOpen",
)
console.log("ok 8 btn-open click handler is wired to doOpen")

// The backstage panel itself is a real dialog surface (Esc-closable overlay)
assert.ok(
  htmlSrc.includes('id="backstage-overlay"') && htmlSrc.includes('aria-modal="true"'),
  "backstage overlay must be a modal dialog surface",
)
assert.ok(
  editorSrc.includes('const target = pane || "open";'),
  "openBackstage must land on the open pane",
)
console.log("ok 9 backstage panel opens on the open pane")

// Recent panel rows must navigate to the clicked document (real behavior)
assert.ok(editorSrc.includes("bsLoadRecent"), "recent loader must exist")
assert.ok(editorSrc.includes("bsRenderRecent"), "recent renderer must exist")
assert.ok(cssSrc.includes(".backstage-recent"), "recent panel styles must exist")
console.log("ok 10 recent panel rows are wired and styled")

// i18n: Open labels/pane copy must exist in BOTH locales
for (const key of [
  "Menu.Open",
  "FileScreen.TitleOpen",
  "FileScreen.DescOpen",
  "FileScreen.NoDocuments",
]) {
  const count = i18nSrc.split(`"${key}"`).length - 1
  assert.ok(count >= 2, `${key} must be present in both en and de catalogs (found ${count})`)
}
console.log("ok 11 Open i18n keys exist in both locales")

console.log("\nAll WO-19-recent interact census tests passed!\n")
console.log("recent-PASS")

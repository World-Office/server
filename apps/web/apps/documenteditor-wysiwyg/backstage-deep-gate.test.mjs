/**
 * CHROME4-BACKSTAGE-DEEP gate: static structure pins for the real backstage
 * pane content — Recent/Open list (GET /api/documents), Info meta grid +
 * counters, Print pane CTA, Help shortcut table. Node.js built-in test
 * runner (node:assert, zero dependencies).
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

console.log("Running CHROME4-BACKSTAGE-DEEP tests...\n")

// 1. Default landing pane is Recent/Open
console.log("Checking default backstage pane...")
assert.ok(editorSrc.includes('const target = pane || "open";'), 'openBackstage must default to the "open" pane')
assert.ok(
  htmlSrc.includes('<div class="backstage-view" data-pane-view="open"'),
  "open pane view must exist in index.html",
)
assert.ok(
  htmlSrc.includes('<div class="backstage-view" data-pane-view="info"'),
  "info pane view must exist in index.html",
)
console.log("Default pane ok\n")

// 2. Recent/Open pane wiring
console.log("Checking Recent/Open pane wiring...")
assert.ok(htmlSrc.includes('id="backstage-recent"'), "#backstage-recent host must exist")
assert.ok(editorSrc.includes('BS_DOCS_LIST_URL = "/api/documents"'), "document list URL pin")
assert.ok(editorSrc.includes("BS_FETCH_TIMEOUT = 4000"), "fetch timeout guard pin")
assert.ok(editorSrc.includes("AbortSignal.timeout(BS_FETCH_TIMEOUT)"), "fetch must be aborted on timeout")
assert.ok(editorSrc.includes("bsLoadRecent"), "recent loader pin")
assert.ok(editorSrc.includes("bsRenderRecent"), "recent renderer pin")
assert.ok(editorSrc.includes("bsHydratePanes()"), "openBackstage must hydrate panes")
assert.ok(editorSrc.includes("window.location.assign(url)"), "recent rows must navigate via location.assign")
assert.ok(
  editorSrc.includes('bsEditorUrlFor(doc && doc.id)'),
  "recent rows must resolve the editor URL per document id",
)
assert.ok(
  editorSrc.includes("/^(.*\\/editors\\/document\\/)([^/]*)$/"),
  "editor URL routing must key off the /editors/document/ path",
)
console.log("Recent pane ok\n")

// 3. Info pane: meta grid + counters
console.log("Checking Info pane wiring...")
assert.ok(htmlSrc.includes('id="backstage-info-meta"'), "#backstage-info-meta host must exist")
assert.ok(htmlSrc.includes('id="bs-info-words"'), "#bs-info-words counter must exist")
assert.ok(htmlSrc.includes('id="bs-info-chars"'), "#bs-info-chars counter must exist")
assert.ok(editorSrc.includes('"/api/documents/" + encodeURIComponent(DOC_ID)'), "document meta URL pin")
assert.ok(editorSrc.includes("bsLoadInfoMeta"), "meta loader pin")
assert.ok(editorSrc.includes("bsRenderInfoMeta"), "meta renderer pin")
assert.ok(
  editorSrc.includes('document.getElementById("bs-info-words")') &&
    editorSrc.includes('document.getElementById("bs-info-chars")'),
  "updateCounts must mirror into the backstage counters",
)
console.log("Info pane ok\n")

// 4. Help pane: shortcut table pins (real editor.js bindings only)
console.log("Checking Help pane shortcut pins...")
assert.ok(htmlSrc.includes('id="backstage-shortcuts"'), "#backstage-shortcuts host must exist")
assert.ok(htmlSrc.includes('id="backstage-about"'), "#backstage-about line must exist")
for (const key of ["s", "z", "b", "f", "h"]) {
  assert.ok(htmlSrc.includes(`data-key="${key}"`), `shortcut row data-key="${key}" must exist in index.html`)
  assert.ok(editorSrc.includes(`k === "${key}"`), `binding k === "${key}" must exist in editor.js`)
}
assert.ok(htmlSrc.includes('data-key="wheel"'), 'shortcut row data-key="wheel" must exist')
assert.ok(
  editorSrc.includes('editor.addEventListener("wheel"'),
  "Ctrl+wheel zoom binding must exist in editor.js",
)
// kbd rows advertise y/i/u as secondary keys — those bindings must really exist
for (const key of ["y", "i", "u"]) {
  assert.ok(editorSrc.includes(`k === "${key}"`), `binding k === "${key}" must exist in editor.js`)
}
console.log("Help pane ok\n")

// 5. Print pane: existing print path stays wired
console.log("Checking Print pane wiring...")
assert.ok(htmlSrc.includes('id="btn-print"'), "#btn-print must exist")
assert.ok(editorSrc.includes("function doPrint()"), "doPrint must exist")
assert.ok(editorSrc.includes("window.print()"), "doPrint must trigger the browser print path")
console.log("Print pane ok\n")

// 6. Standalone degradation affordances
console.log("Checking standalone degradation pins...")
assert.ok(editorSrc.includes("backstage-recent-empty"), "empty-state renderer pin")
assert.ok(editorSrc.includes('row.disabled = true'), "standalone rows must be disabled")
assert.ok(editorSrc.includes('setAttribute("aria-disabled", "true")'), "disabled rows need aria-disabled")
console.log("Degradation ok\n")

// 7. i18n: every new FileScreen key exists in BOTH locales
console.log("Checking i18n parity for CHROME4 keys...")
const chrome4Keys = [
  "FileScreen.NoDocuments",
  "FileScreen.StandaloneHint",
  "FileScreen.MetaName",
  "FileScreen.MetaFormat",
  "FileScreen.MetaSize",
  "FileScreen.MetaUpdated",
  "FileScreen.CountersTitle",
  "FileScreen.CounterWords",
  "FileScreen.CounterChars",
  "FileScreen.ShortcutSave",
  "FileScreen.ShortcutUndoRedo",
  "FileScreen.ShortcutFormat",
  "FileScreen.ShortcutFind",
  "FileScreen.ShortcutReplace",
  "FileScreen.ShortcutZoom",
  "FileScreen.About",
]
for (const key of chrome4Keys) {
  const count = i18nSrc.split(`"${key}"`).length - 1
  assert.ok(count >= 2, `${key} must be present in both en and de catalogs (found ${count})`)
}
console.log("i18n parity ok\n")

// 8. CSS: pane content styles exist (light + dark share row vars)
console.log("Checking CHROME4 css pins...")
for (const cls of [".backstage-recent-row", ".backstage-meta", ".backstage-shortcuts", ".bs-doc-name"]) {
  assert.ok(cssSrc.includes(cls), `${cls} style must exist in style.css`)
}
assert.ok(cssSrc.includes("--bs-row-border"), "row border var must exist")
assert.ok(cssSrc.includes("html.light"), "light theme overrides must exist")
console.log("css ok\n")

console.log("CHROME4-BACKSTAGE-DEEP-PASS")

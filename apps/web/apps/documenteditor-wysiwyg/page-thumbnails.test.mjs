// PTS-T2 gate: PageThumbnails rail — thumbnail strip over the docserver
// page-render API (PTS-T1: GET /api/documents/{id}/pages/{n}.png +
// GET …/pages/count), current-page highlight, click-to-scroll, i18n en+de,
// ledger flip (PageThumbnails controller+view, Pages model -> hosted).
//
// Run: /usr/bin/node page-thumbnails.test.mjs   (from this directory)
import { readFileSync } from "node:fs"
import assert from "node:assert/strict"

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8")
const js = readFileSync(new URL("./editor.js", import.meta.url), "utf8")
const css = readFileSync(new URL("./style.css", import.meta.url), "utf8")
const i18n = readFileSync(new URL("./i18n.js", import.meta.url), "utf8")
const ledger = JSON.parse(
  readFileSync(new URL("../../../../plan/oo-port/ui-webapp.json", import.meta.url), "utf8")
)

// 1. Rail DOM: aside + strip + View-tab toggle (mirrors btn-right-panel-toggle)
assert.ok(html.includes('id="thumbnails-rail"'), "thumbnails-rail aside missing")
assert.ok(html.includes('id="thumbnails-strip"'), "thumbnails-strip missing")
assert.ok(html.includes('id="btn-thumbnails-toggle"'), "btn-thumbnails-toggle missing")
assert.ok(/id="btn-thumbnails-toggle"[^>]*data-cmd="toggleThumbnails"/.test(html),
  "toggle button not wired via data-cmd")
assert.ok(/id="btn-thumbnails-toggle"[^>]*aria-pressed="false"/.test(html),
  "toggle button lacks aria-pressed state")
assert.ok(/id="btn-thumbnails-toggle"[^>]*data-i18n="View\.PageThumbnails"/.test(html),
  "toggle button label is not i18n'd")

// 2. editor.js: toggle + count fetch + per-page img strip
for (const fn of ["toggleThumbnails", "openThumbnails", "highlightCurrentThumbnail",
                  "scrollToThumbnailPage"]) {
  assert.ok(js.includes(`function ${fn}`), `${fn} missing`)
}
assert.ok(js.includes('getElementById("btn-thumbnails-toggle")'), "toggle button not referenced in editor.js")
assert.ok(js.includes('api("pages/count")'), "page-count fetch missing (docserver /pages/count)")
assert.ok(js.includes('api("pages/" + n + ".png")'), "per-page png fetch missing (docserver /pages/{n}.png)")
assert.ok(js.includes("data-page"), "thumbs must carry data-page=N")
assert.ok(js.includes('img.className = "thumbnail"'), "thumb img element missing")
assert.ok(js.includes('"lazy"'), "lazy loading for tall documents missing")
assert.ok(js.includes("THUMBNAILS_EAGER_MAX"), "eager-load cap missing")
assert.ok(/THUMBNAILS_EAGER_MAX = 50/.test(js), "eager cap must be 50 pages")

// 3. Current-page highlight + click-to-scroll + command ledger
assert.ok(js.includes('classList.toggle("current"'), ".current highlight missing")
assert.ok(js.includes("scrollHeight - "), "scroll-fraction math missing")
assert.ok(js.includes('emitCommand("view.page-thumbnails"'), "thumb click not emitted as a wo-command")
assert.ok(js.includes('cmd === "view.page-thumbnails"'), "runCommand does not dispatch view.page-thumbnails")
assert.ok(js.includes('cmd === "toggleThumbnails"'), "runCommand does not dispatch toggleThumbnails")
assert.ok(js.includes('editor.addEventListener("scroll"'), "editor scroll tracking missing")

// 4. style.css: 140px rail, bordered thumbs, .current highlight, collapsed hidden
assert.ok(css.includes("#thumbnails-rail"), "rail styles missing")
assert.ok(/#thumbnails-rail\s*\{[^}]*width:\s*140px/.test(css), "rail must be 140px wide")
assert.ok(css.includes("#thumbnails-strip img.thumbnail"), "thumb styles missing")
assert.ok(/border:\s*1px solid/.test(css.slice(css.indexOf("#thumbnails-strip img.thumbnail"))),
  "thumbs must be bordered")
assert.ok(css.includes("img.thumbnail.current"), ".current highlight style missing")
assert.ok(css.includes("#thumbnails-rail[hidden]"), "collapsed state must be display:none")

// 5. i18n en+de: View.PageThumbnails, Thumbnails.Title, Thumbnails.Page
const deCut = i18n.slice(i18n.indexOf("const LOCALE_DE"))
for (const k of ["View.PageThumbnails", "Thumbnails.Title", "Thumbnails.Page",
                 "Status.ThumbnailsOpen", "Status.ThumbnailsClosed"]) {
  assert.ok(i18n.includes(`"${k}"`), `en missing ${k}`)
  assert.ok(deCut.includes(`"${k}"`), `de missing ${k}`)
}
assert.ok(i18n.includes('"Thumbnails.Page": "Page {n}"'), "en Thumbnails.Page must be 'Page {n}'")
assert.ok(i18n.includes('"Thumbnails.Page": "Seite {n}"'), "de Thumbnails.Page must be 'Seite {n}'")

// 6. Ledger flip: PageThumbnails (controller+view) + Pages model -> hosted
assert.ok(Array.isArray(ledger) && ledger.length === 217, "ledger must keep 217 rows")
const stillBlocked = ledger.filter(
  (r) => r.wo_status === "blocked" && /PageThumbnails|^Pages$/.test(r.oo_component)
)
assert.equal(stillBlocked.length, 0, "PageThumbnails/Pages rows must not stay blocked")
for (const r of ledger) {
  if (/PageThumbnails|^Pages$/.test(r.oo_component)) {
    assert.equal(r.wo_status, "hosted", `${r.oo_component}/${r.oo_type} must be hosted`)
    assert.ok(r.notes.includes("PTS: thumbnails rail"),
      `${r.oo_component}/${r.oo_type} note must record the PTS flip`)
  }
}

console.log("THUMBNAILS-PASS")

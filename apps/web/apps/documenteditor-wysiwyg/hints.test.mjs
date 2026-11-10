// PTS-T3 gate: WoHints hint/toast service — #hint-toast host in index.html,
// showHint/hintToast/dismissHints service in editor.js (boot tour +
// first-table-selection hint + save toast), Hints.* i18n en+de, ledger flip
// (HintManager controller: blocked -> partial, OO's letter-hint overlay
// declared out of scope).
//
// Run: /usr/bin/node hints.test.mjs   (from this directory)
import { readFileSync } from "node:fs"
import assert from "node:assert/strict"

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8")
const js = readFileSync(new URL("./editor.js", import.meta.url), "utf8")
const css = readFileSync(new URL("./style.css", import.meta.url), "utf8")
const i18n = readFileSync(new URL("./i18n.js", import.meta.url), "utf8")
const ledger = JSON.parse(
  readFileSync(new URL("../../../../plan/oo-port/ui-webapp.json", import.meta.url), "utf8")
)

// 1. Toast host DOM: #hint-toast stack, polite live region, i18n'd label.
assert.ok(html.includes('id="hint-toast"'), "hint-toast host missing")
assert.ok(/id="hint-toast"[^>]*aria-live="polite"/.test(html),
  "hint-toast host is not an aria-live=polite region")
assert.ok(/id="hint-toast"[^>]*data-i18n-aria-label="Hints\.Title"/.test(html),
  "hint-toast host label is not i18n'd")
assert.ok(/id="hint-toast"[^>]*hidden/.test(html), "hint-toast host must start collapsed")

// 2. editor.js: the WoHints service surface.
assert.ok(js.includes("const WoHints"), "WoHints service missing")
assert.ok(js.includes("window.WoHints = WoHints"), "WoHints not exposed on window")
for (const fn of ["showHint", "hintToast", "dismissHint", "dismissHints"]) {
  assert.ok(js.includes(`function ${fn}`), `${fn} missing`)
}
for (const key of ["welcome", "find", "thumbnails", "table"]) {
  assert.ok(js.includes(`${key}: { title: "Hints.`), `hint ${key} not registered`)
}

// 3. First hints wired: staggered boot tour + event triggers.
assert.ok(js.includes("setTimeout(() => showHint(id), HINTS[id].delay)"),
  "boot tour not staggered via per-hint delay")
assert.ok(js.includes('addEventListener("selectionchange"'),
  "table-selection event hint not wired")
assert.ok(js.includes("currentTableCell()"), "table hint not gated on a real cell selection")
assert.ok(js.includes("window.WoHints.hintToast("), "save toast not wired through the service")
assert.ok(js.includes('ev.key === "Escape" && stack.length'), "Escape dismiss missing")
assert.ok(js.includes('close.addEventListener("click"'), "per-card ✕ dismiss missing")
assert.ok(js.includes("seen.has(id)"), "hints are not once-per-session deduped")

// 4. style.css: fixed bottom-right stack, bordered cards, collapsed host.
assert.ok(css.includes("#hint-toast"), "hint-toast styles missing")
assert.ok(/#hint-toast\s*\{[^}]*position:\s*fixed/.test(css), "hint host must be position:fixed")
assert.ok(/#hint-toast\s*\{[^}]*bottom:\s*40px/.test(css), "hint host must anchor bottom-right")
assert.ok(css.includes(".hint-toast-item"), "card styles missing")
assert.ok(/border:\s*1px solid/.test(css.slice(css.indexOf(".hint-toast-item"))),
  "cards must be bordered")
assert.ok(css.includes(".hint-toast-title"), "card title style missing")
assert.ok(css.includes(".hint-toast-text"), "card text style missing")
assert.ok(css.includes(".hint-toast-close"), "card close-button style missing")
assert.ok(css.includes("#hint-toast[hidden]"), "collapsed host must be display:none")

// 5. i18n en+de: Hints.Title, the tour keys, the table hint, toast + dismiss.
const deCut = i18n.slice(i18n.indexOf("const LOCALE_DE"))
for (const k of ["Hints.Title", "Hints.WelcomeTitle", "Hints.WelcomeText",
                 "Hints.FindTitle", "Hints.FindText", "Hints.ThumbnailsTitle",
                 "Hints.ThumbnailsText", "Hints.TableTitle", "Hints.TableText",
                 "Hints.SavedText", "Hints.Dismiss"]) {
  assert.ok(i18n.includes(`"${k}"`), `en missing ${k}`)
  assert.ok(deCut.includes(`"${k}"`), `de missing ${k}`)
}
assert.ok(i18n.includes('"Hints.FindText": "Tip: Press Ctrl+F to search the document."'),
  "en Hints.FindText must name the real Ctrl+F binding")
assert.ok(i18n.includes('"Hints.SavedText": "Dokument gespeichert"'),
  "de Hints.SavedText must be localized")

// 6. Ledger flip: HintManager controller blocked -> partial (PTS-T3).
assert.ok(Array.isArray(ledger) && ledger.length === 217, "ledger must keep 217 rows")
const stillBlocked = ledger.filter(
  (r) => r.wo_status === "blocked" && r.oo_component === "HintManager"
)
assert.equal(stillBlocked.length, 0, "HintManager must not stay blocked")
const hintRow = ledger.find((r) => r.oo_component === "HintManager")
assert.ok(hintRow, "HintManager row present")
assert.equal(hintRow.wo_status, "partial", "HintManager must flip to partial")
assert.ok(hintRow.wo_anchor.includes("WoHints"), "anchor must name the WoHints service")
assert.ok(hintRow.wo_anchor.includes("#hint-toast"), "anchor must name the toast host")
assert.ok(hintRow.notes.includes("PTS: hint/toast service"),
  "note must record the PTS-T3 flip")
assert.ok(/letter-hint overlay/.test(hintRow.notes),
  "note must declare the OO letter-hint overlay out of scope")

// 7. ui-webapp.md scoreboard total row still matches the JSON.
const md = readFileSync(
  new URL("../../../../plan/oo-port/ui-webapp.md", import.meta.url), "utf8"
)
const totalLine = md.split("\n").find((l) => l.startsWith("| **total**"))
assert.ok(totalLine, "ui-webapp.md has a scoreboard total row")
const cells = [...totalLine.matchAll(/\*\*(\d+)\*\*/g)].map((m) => Number(m[1]))
const count = (s) => ledger.filter((r) => r.wo_status === s).length
const expected = [
  ledger.length, count("full"), count("partial"), count("hosted"),
  count("merged-into-editor.js"), count("blocked"), count("missing"),
]
assert.deepEqual(cells, expected,
  `md scoreboard total ${JSON.stringify(cells)} matches JSON ${JSON.stringify(expected)}`)

console.log("HINTS-PASS")

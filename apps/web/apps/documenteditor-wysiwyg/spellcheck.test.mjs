/**
 * AF11-SPELLCHECK-CLOSEOUT Tests
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Asserts the spellcheck slice contract:
 *   (a) dictionaries/en-US.dic + de-DE.dic copied and non-empty (>10k lines)
 *   (b) .wo-misspelled class styled in style.css
 *   (c) ctx spell rows exist + dispatcher-wired + i18n in BOTH locales
 *   (d) save serialization strips .wo-misspelled wrappers
 *   (e) statusbar word count span + i18n (en+de)
 *   (f) aiSettings + saveDocument cmds present in HTML and dispatched
 *   (g) no bare console.log in editor.js
 *
 * Run: node apps/web/apps/documenteditor-wysiwyg/spellcheck.test.mjs
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8")
const js = readFileSync(new URL("./editor.js", import.meta.url), "utf8")
const css = readFileSync(new URL("./style.css", import.meta.url), "utf8")
const i18n = readFileSync(new URL("./i18n.js", import.meta.url), "utf8")

// (a) Dictionaries copied into the served static dir, >10k lines each.
for (const [file, min] of [["en-US.dic", 10000], ["de-DE.dic", 10000]]) {
  const lines = readFileSync(new URL(`./dictionaries/${file}`, import.meta.url), "utf8")
    .split(/\r?\n/).length
  assert.ok(lines > min, `${file} must have >${min} lines, has ${lines}`)
  console.log(`${file}: ${lines} lines`)
}

// (b) wo-misspelled marker styled (underline) in style.css.
assert.ok(css.includes(".wo-misspelled"), "style.css must style .wo-misspelled")
const misspellCss = css.slice(css.indexOf(".wo-misspelled"))
assert.ok(/text-decoration\s*:\s*underline/.test(misspellCss.slice(0, 300)),
  ".wo-misspelled must apply an underline")

// (c) Ctx spell rows: markup, conditional visibility, dispatch, i18n en+de.
for (const action of ["Ignore", "IgnoreAll", "AddToDictionary", "SelectLanguage"]) {
  const rowRe = new RegExp(`data-ctx="${action}"[^>]*data-showif="misspelled"`)
  assert.ok(rowRe.test(html), `ctx row data-ctx="${action}" with data-showif="misspelled" must exist`)
  assert.ok(js.includes(`action === "${action}"`),
    `editor.js ctx dispatcher must handle ${action}`)
}
assert.ok(js.includes("misspellAtSelection") && js.includes("data-showif='misspelled'"),
  "editor.js must implement data-showif=misspelled visibility handling")

// i18n: split at the de catalog so both locale blocks are checked separately.
const deStart = i18n.indexOf("const LOCALE_DE")
assert.notEqual(deStart, -1, "LOCALE_DE catalog must exist")
const i18nEn = i18n.slice(0, deStart)
const i18nDe = i18n.slice(deStart)
for (const key of ["Ctx.Ignore", "Ctx.IgnoreAll", "Ctx.AddToDictionary",
                   "Ctx.SelectLanguage", "AI.Settings", "Menu.Save",
                   "Statusbar.WordsCount"]) {
  assert.ok(i18nEn.includes(`"${key}"`), `i18n en must define ${key}`)
  assert.ok(i18nDe.includes(`"${key}"`), `i18n de must define ${key}`)
}

// (d) Save path strips misspell markers: flatHtml (the single save/export
// serialization point) must call the unwrap helper.
assert.ok(js.includes("function stripMisspellMarkers"),
  "editor.js must define stripMisspellMarkers")
assert.ok(js.includes("stripMisspellMarkers(tmp)"),
  "flatHtml() save serialization must strip misspell markers")
assert.ok(js.includes("span.wo-misspelled"),
  "unwrap helper must target span.wo-misspelled markers")
assert.ok(js.includes("function unwrapMisspellMarkers"),
  "editor.js must define unwrapMisspellMarkers")

// (e) Statusbar word count button + i18n-driven text (opens document info).
assert.ok(/<button[^>]*id="sb-word-count"[^>]*data-cmd="showWordCount"/.test(html),
  "statusbar word count must be a button dispatching showWordCount")
assert.ok(js.includes("Statusbar.WordsCount"),
  "updateCounts must use the Statusbar.WordsCount i18n template")

// (f) aiSettings + saveDocument commands present and dispatched.
assert.ok(html.includes('data-cmd="aiSettings"'), "AI tab needs a Settings button")
assert.ok(html.includes('data-cmd="saveDocument"'), "backstage needs a Save row")
assert.ok(js.includes('cmd === "aiSettings"'), "runCommand must dispatch aiSettings")
assert.ok(js.includes('cmd === "saveDocument"'), "runCommand must dispatch saveDocument")
assert.ok(js.includes('openOverlayDialog("settings-dialog")'),
  "aiSettings must open the existing settings dialog")
assert.ok(js.includes("saveDocument();"), "saveDocument cmd must reuse the save path")

// Engine wiring: checkbox + language select drive the SpellCheck module.
for (const fn of ["toggleSpellcheck", "setSpellcheckLang", "spellKnowsWord",
                  "ensureSpellDictionary", "scheduleSpellCheck"]) {
  assert.ok(js.includes(`function ${fn}`), `editor.js must define ${fn}`)
}
assert.ok(js.includes('toggleSpellcheck(spell.checked)'),
  "settings-spellcheck checkbox must drive toggleSpellcheck")
assert.ok(js.includes("setSpellcheckLang(docLang.value)"),
  "document-language select must drive setSpellcheckLang")
assert.ok(js.includes('"wo-user-dict"'), "user dictionary persists under wo-user-dict")
assert.ok(js.includes("dictionaries/en-US.dic") && js.includes("dictionaries/de-DE.dic"),
  "dictionaries must be fetched lazily from the static dir")

// (g) No bare console.log in editor.js (wo: markers use console.info).
assert.ok(!js.includes("console.log("), "editor.js must not contain bare console.log")

console.log("spellcheck: all checks passed")

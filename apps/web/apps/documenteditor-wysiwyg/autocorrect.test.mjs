// C7-1 gate: autocorrect — replace-as-you-type engine, smart quotes, auto
// lists, options dialog. Asserts the wiring statically (typing behavior is
// covered by the live Playwright probe).
import { readFileSync } from "node:fs"
import assert from "node:assert/strict"

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8")
const js = readFileSync(new URL("./editor.js", import.meta.url), "utf8")
const i18n = readFileSync(new URL("./i18n.js", import.meta.url), "utf8")

// (1) dialog + settings entry exist
assert.ok(html.includes('id="autocorrect-dialog"'), "autocorrect-dialog missing")
assert.ok(html.includes('id="btn-settings-autocorrect"'), "settings entry missing")
for (const id of ["ac-replace", "ac-quotes", "ac-dashes", "ac-bullets", "ac-numbers", "ac-table"]) {
  assert.ok(html.includes(`id="${id}"`), `autocorrect control missing: ${id}`)
}
// registered in DIALOG_IDS (audit gate)
assert.ok(js.includes('"autocorrect-dialog"'), "autocorrect-dialog not in DIALOG_IDS")

// (2) engine: default table, beforeinput/input hooks, helpers
assert.ok(js.includes("AC_DEFAULT_TABLE"), "default replace table missing")
assert.ok(js.includes('"(c)": "©"') && js.includes('"---": "—"') && js.includes('"->": "→"'), "table entries missing")
assert.ok(js.includes('editor.addEventListener("beforeinput"'), "beforeinput hook missing")
assert.ok(js.includes('editor.addEventListener("input"'), "input hook missing")
assert.ok(js.includes("function acApplyReplace") && js.includes("function acAutoList") && js.includes("function acSmartQuotes"), "engine helpers missing")
assert.ok(js.includes("acInsertAtCaret") && js.includes("acTextBeforeCaret"), "caret helpers missing")
assert.ok(js.includes("openAutocorrectDialog") && js.includes("confirmAutocorrectDialog"), "dialog wiring missing")

// (3) i18n both locales
const deCut = i18n.slice(i18n.indexOf("const LOCALE_DE"))
for (const k of ["Settings.AutoCorrectOptions", "Autocorrect.Title", "Autocorrect.ReplaceAsYouType",
                 "Autocorrect.SmartQuotes", "Autocorrect.Dashes", "Autocorrect.AutoBullets",
                 "Autocorrect.AutoNumbers", "Autocorrect.ReplaceTable"]) {
  assert.ok(i18n.includes(`"${k}"`), `en missing ${k}`)
  assert.ok(deCut.includes(`"${k}"`), `de missing ${k}`)
}

console.log("AUTOCORRECT-PASS")

// C6-1/C6-2 gate: content-control types — checkbox, date picker, combo box,
// picture — must be wired in the cc dialog (index.html), inserted natively
// (editor.js branches), kept interactive (click delegation), and i18n'd in
// both locales.
import { readFileSync } from "node:fs"
import assert from "node:assert/strict"

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8")
const js = readFileSync(new URL("./editor.js", import.meta.url), "utf8")
const i18n = readFileSync(new URL("./i18n.js", import.meta.url), "utf8")

// (1) All four C6 types are offered by the cc dialog.
for (const opt of ["checkbox", "date", "combo", "picture"]) {
  assert.ok(html.includes(`value="${opt}"`), `cc-type option missing: ${opt}`)
}

// (2) editor.js inserts each type natively with the right markup.
assert.ok(js.includes('data-cc="checkbox"') && js.includes('class="cc-box"'), "checkbox cc missing")
assert.ok(js.includes('type="date"') && js.includes("cc-date-input"), "date-picker cc missing")
assert.ok(js.includes('data-cc="combo"') && js.includes("cc-combo"), "combo cc missing")
assert.ok(js.includes('data-cc="picture"') && js.includes("cc-picture"), "picture cc missing")

// (3) Interactivity: checkbox toggles aria-checked + glyph; picture opens image dialog.
assert.ok(js.includes('.closest(".cc-checkbox")') && js.includes('"☑"') && js.includes('"☐"'), "checkbox toggle missing")
assert.ok(js.includes('.closest(".cc-picture")') && js.includes("insertImage();"), "picture trigger missing")

// (4) i18n keys present in BOTH locales (en + de).
for (const k of ["Insert.CCCheckbox", "Insert.CCDate", "Insert.CCCombo", "Insert.CCPicture"]) {
  let d;
  try {
    const cut = i18n.slice(i18n.indexOf("const LOCALE_DE"))
    const en = i18n.slice(0, i18n.indexOf("const LOCALE_DE"))
    assert.ok(en.includes(`"${k}"`), `en missing ${k}`)
    assert.ok(cut.includes(`"${k}"`), `de missing ${k}`)
    d = null
  } catch (e) { d = e.message }
  assert.equal(d, null)
}

console.log("CC-TYPES-PASS")

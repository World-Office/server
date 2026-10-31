// C4-2 gate: Tabs dialog — button in paragraph settings, stops row editor,
// data-tabstops + tab-size application, i18n in en+de.
import { readFileSync } from "node:fs"
import assert from "node:assert/strict"

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8")
const js = readFileSync(new URL("./editor.js", import.meta.url), "utf8")
const i18n = readFileSync(new URL("./i18n.js", import.meta.url), "utf8")

assert.ok(html.includes('id="tabs-dialog"'), "tabs-dialog missing")
assert.ok(html.includes('id="btn-ps-tabs"'), "Tabs… button missing from paragraph settings")
for (const id of ["tabs-default", "tabs-list", "btn-tabs-add", "btn-tabs-ok", "btn-tabs-cancel"]) {
  assert.ok(html.includes(`id="${id}"`), `tabs control missing: ${id}`)
}
assert.ok(js.includes('"tabs-dialog"'), "tabs-dialog not in DIALOG_IDS")
for (const fn of ["openTabsDialog", "confirmTabsDialog", "addTabRow"]) {
  assert.ok(js.includes(fn), `${fn} missing`)
}
assert.ok(js.includes("data-tabstops"), "data-tabstops channel missing")
assert.ok(js.includes("p.style.tabSize"), "tab-size application missing")
assert.ok(js.includes('btnPsTabs.addEventListener("click", openTabsDialog)'), "Tabs… button not wired")

const deCut = i18n.slice(i18n.indexOf("const LOCALE_DE"))
for (const k of ["ParagraphSettings.Tabs", "Tabs.Title", "Tabs.DefaultWidth", "Tabs.Positions",
                 "Tabs.Alignment", "Tabs.Leader", "Tabs.Add", "Tabs.Remove",
                 "Tabs.Align.Left", "Tabs.Align.Decimal", "Tabs.Leader.Dots"]) {
  assert.ok(i18n.includes(`"${k}"`), `en missing ${k}`)
  assert.ok(deCut.includes(`"${k}"`), `de missing ${k}`)
}
console.log("TABS-PASS")

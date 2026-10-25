/**
 * AF5-HOME-DIRECT: Home tab promotes OO direct controls that WO previously
 * hid in menus (or lacked): font size +/- shortcuts, subscript, shading,
 * borders, nonprinting characters, replace, select all.
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * For each promoted control: (a) a DIRECT control exists on the home
 * ribbon-page (outside any menu-list), (b) the data-cmd/id is wired in
 * editor.js, (c) i18n keys exist in en AND de.
 *
 * Run with: node home-direct.test.mjs
 * Success: prints "HOME-DIRECT-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorSrc = readFileSync(new URL("./editor.js", import.meta.url), "utf-8")
const htmlSrc = readFileSync(new URL("./index.html", import.meta.url), "utf-8")
const i18nSrc = readFileSync(new URL("./i18n.js", import.meta.url), "utf-8")

const homeStart = htmlSrc.indexOf('<div class="ribbon-page active" data-tab="home"')
const insertStart = htmlSrc.indexOf('<div class="ribbon-page" data-tab="insert"')
assert.ok(homeStart !== -1, "home ribbon-page must exist in index.html")
assert.ok(insertStart !== -1 && insertStart > homeStart, "insert ribbon-page must follow home")
const home = htmlSrc.slice(homeStart, insertStart)

// Direct ribbon controls live on their own lines as `<button class="rb" ...>`;
// menu-list rows are wrapped in `<li role="none"><button type="button" role="menuitem">`.
// Asserting on the bare `<button` prefix proves a DIRECT control, not a menu row.
function assertDirectHomeButton(marker, label) {
  assert.ok(home.includes(marker), `${label}: direct control must exist on the home ribbon (${marker})`)
}

function assertI18n(key, en, de) {
  assert.ok(i18nSrc.includes(`"${key}": "${en}"`), `${key}: en i18n key must exist`)
  assert.ok(i18nSrc.includes(`"${key}": "${de}"`), `${key}: de i18n key must exist`)
}

console.log("Running AF5-HOME-DIRECT home-direct tests...\n")

// ── Font size +/- (already direct; now advertise + wire OO shortcuts) ──

assertDirectHomeButton('<button class="rb" data-cmd="fontSizeInc"', "font size +")
assertDirectHomeButton('<button class="rb" data-cmd="fontSizeDec"', "font size -")
assert.ok(
  home.includes('aria-keyshortcuts="Control+]"') && home.includes('aria-keyshortcuts="Control+["'),
  "font size +/- must advertise Ctrl+]/Ctrl+[" ,
)
assert.ok(
  editorSrc.includes('ev.code === "BracketRight"') && editorSrc.includes('ev.code === "BracketLeft"'),
  "editor.js must wire Ctrl+]/Ctrl+[ to fontSizeInc/fontSizeDec",
)
assertI18n("Home.FontIncTitle", "Increase font size (Ctrl+])", "Schrift vergrößern (Strg+])")
assertI18n("Home.FontDecTitle", "Decrease font size (Ctrl+[)", "Schrift verkleinern (Strg+[)")

// ── Subscript (promoted from the Script options caret menu) ──

assertDirectHomeButton('<button class="rb" data-cmd="subscript"', "subscript")
assert.ok(home.includes('aria-keyshortcuts="Control+."'), "subscript must advertise Ctrl+.")
assert.ok(editorSrc.includes('k === "."'), "editor.js must wire Ctrl+. to subscript")
// updateActiveStates covers button[data-cmd] generically; the runCommand
// tail routes subscript through the native execCommand + history path.
assert.ok(
  editorSrc.includes('cmd === "subscript"'),
  "editor.js runCommand must handle subscript (history/active states)",
)
assertI18n("Toolbar.SubscriptTitle", "Subscript", "Tiefgestellt")
assertI18n("Toolbar.Subscript", "Subscript", "Tiefgestellt")

// ── Shading (promoted from the More-formatting menu's hidden picker) ──

assert.ok(
  home.includes('<label class="color-btn rb" title="Shading"') &&
  home.includes('<input type="color" id="shading-color"'),
  "shading must be a direct visible color button on the home ribbon",
)
assert.ok(
  !/id="shading-color"[^>]*\bhidden\b/.test(htmlSrc),
  "shading input must no longer be hidden",
)
assert.ok(editorSrc.includes('"shading-color"'), "editor.js must keep the shading-color change handler")
assertI18n("Home.Shading", "Shading", "Schattierung")

// ── Borders (promoted from the More-formatting menu) ──

assertDirectHomeButton('<button class="rb" data-cmd="openBorders"', "borders")
assert.ok(editorSrc.includes('cmd === "openBorders"'), "editor.js must dispatch openBorders")
assertI18n("Home.Borders", "Borders", "Rahmen")

// ── Nonprinting characters (promoted from the View tab) ──

assertDirectHomeButton('<button id="btn-home-formatmarks"', "nonprinting characters")
assert.ok(
  editorSrc.includes('btn-home-formatmarks') && editorSrc.includes("setFormatMarks"),
  "editor.js must wire the home format-marks button through the shared toggle",
)
assert.ok(editorSrc.includes("btn-view-formatmarks"), "View-tab toggle must stay wired")
assertI18n("Home.NonPrinting", "Nonprinting characters", "Nicht druckende Zeichen")

// ── Replace (promoted from inside the find dialog) ──

assertDirectHomeButton('<button id="btn-replace"', "replace")
assert.ok(
  editorSrc.includes('document.getElementById("btn-replace")'),
  "editor.js must wire btn-replace",
)
assert.ok(
  editorSrc.includes("openFindDialog(true)") && editorSrc.includes('function openFindDialog(focusReplace)'),
  "editor.js must open the find dialog focused on the replace field",
)
assert.ok(editorSrc.includes('k === "h"'), "editor.js must wire Ctrl+H to replace")
assert.ok(home.includes('aria-keyshortcuts="Control+H"'), "replace must advertise Ctrl+H")
assertI18n("Home.Replace", "Replace", "Ersetzen")
assertI18n("Home.ReplaceTitle", "Replace (Ctrl+H)", "Ersetzen (Strg+H)")

// ── Select all (promoted from the context menu) ──

assertDirectHomeButton('<button id="btn-select-all"', "select all")
assert.ok(
  home.includes('data-cmd="selectAll"'),
  "select-all button must dispatch the selectAll command",
)
assert.ok(home.includes('aria-keyshortcuts="Control+A"'), "select-all must advertise Ctrl+A")
// selectAll is a standard execCommand served by the runCommand generic path.
assert.ok(
  editorSrc.includes("document.execCommand(cmd, false,"),
  "runCommand generic execCommand path must exist for selectAll",
)
assertI18n("Home.SelectAll", "Select all", "Alles auswählen")
assertI18n("Home.SelectAllTitle", "Select all (Ctrl+A)", "Alles auswählen (Strg+A)")

// ── Menu rows that sourced the promotions must stay ──

assert.ok(
  home.includes('data-picker="shading-color"'),
  "More-formatting shading menu row must stay",
)
assert.ok(
  home.includes('data-cmd="openBorders" data-i18n="Home.Borders"'),
  "More-formatting borders menu row must stay",
)
assert.ok(
  home.includes('role="menuitem" data-cmd="subscript"'),
  "Script options subscript menu row must stay",
)

console.log("All AF5-HOME-DIRECT tests passed!\n")
console.log("HOME-DIRECT-PASS")

/**
 * WO-19-settings: census-artifact (backstage tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-filesettings is included in the interact census with
 * wo_id=btn-filesettings, wo_cmd=btn-filesettings, and opens_wo='panel',
 * matching OnlyOffice parity (slugs:settings). The button is already wired
 * in editor.js to the existing openDlg("settings-dialog") dialog opener,
 * so no editor change is needed.
 *
 * Run with: node settings.test.mjs
 * Success: prints "settings-PASS" and exits 0.
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

console.log("Running WO-19-settings interact census tests...\n")

// The btn-filesettings button must exist
assert.ok(
  htmlSrc.includes('id="btn-filesettings"'),
  "btn-filesettings button must exist in index.html",
)
console.log("ok 1 btn-filesettings button exists")

// The btn-filesettings must be wrapped in a census span with the panel open
// behavior (settings parity token maps to an opened panel, not a modal/menu).
const btnFileSettingsMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-filesettings"[^>]*data-wo-cmd="btn-filesettings"[^>]*data-wo-interact="opens:panel"[^>]*>.*?id="btn-filesettings"/s,
)
assert.ok(
  btnFileSettingsMatch,
  'btn-filesettings must be inside a span with data-wo-id/data-wo-cmd="btn-filesettings" and data-wo-interact="opens:panel"',
)
console.log("ok 2 btn-filesettings is in interact census with opens:panel")

// No stale/mis-typed census row: the span immediately wrapping btn-filesettings
// must carry the panel token, never the modal or menu token.
const wrappingSpan = htmlSrc.match(/<span([^>]*)>\s*<button[^>]*id="btn-filesettings"/)
assert.ok(wrappingSpan, "btn-filesettings must be directly wrapped by a census span")
assert.ok(
  wrappingSpan[1].includes('data-wo-interact="opens:panel"'),
  "the census span wrapping btn-filesettings must declare opens:panel",
)
assert.ok(
  !wrappingSpan[1].includes('data-wo-interact="opens:modal"') &&
    !wrappingSpan[1].includes('data-wo-interact="opens:menu"'),
  "the census span wrapping btn-filesettings must not declare opens:modal or opens:menu",
)
console.log("ok 3 btn-filesettings census row is not mis-declared as modal/menu")

// The btn-filesettings must be inside the backstage overlay
const backstageMatch = htmlSrc.match(
  /<div id="backstage-overlay"[^>]*>.*?id="btn-filesettings".*?<\/div>/s,
)
assert.ok(backstageMatch, "btn-filesettings must be inside the backstage overlay")
console.log("ok 4 btn-filesettings is in the backstage overlay")

// The btn-filesettings must live in the settings pane view
const settingsPaneMatch = htmlSrc.match(
  /<div[^>]*data-pane-view="settings"[^>]*>.*?id="btn-filesettings".*?<\/div>/s,
)
assert.ok(settingsPaneMatch, "btn-filesettings must be in the settings pane view")
console.log("ok 5 btn-filesettings is in the settings pane view")

// The nav row that lands on that pane must exist (OO fm-btn-settings parity)
assert.ok(
  htmlSrc.includes('class="backstage-row" data-pane="settings"'),
  "the backstage nav row for the settings pane must exist",
)
console.log("ok 6 backstage nav exposes the settings pane")

// The dialog the control opens is real: #settings-dialog is a modal overlay
// hosting every settings sub-feature (theme, language, spellcheck, zoom,
// autocorrect, apply/cancel).
const settingsDialogMatch = htmlSrc.match(
  /<div id="settings-dialog" class="dialog-overlay" role="dialog" aria-modal="true"/,
)
assert.ok(settingsDialogMatch, "#settings-dialog must be a modal dialog overlay")
for (const sub of [
  "settings-spellcheck",
  "settings-theme",
  "settings-lang",
  "settings-zoom",
  "btn-settings-ok",
  "btn-settings-cancel",
]) {
  assert.ok(htmlSrc.includes(`id="${sub}"`), `#settings-dialog must host #${sub}`)
}
console.log("ok 7 settings dialog exists with theme/language/spellcheck/zoom/apply/cancel")

// editor.js must hold a real (non-stub) dialog opener for settings
assert.ok(
  editorSrc.includes('const btnFileSettings = document.getElementById("btn-filesettings")'),
  "btnFileSettings lookup must exist in editor.js",
)
assert.ok(
  editorSrc.includes('btnFileSettings.addEventListener("click", () => {'),
  "btnFileSettings click handler must exist in editor.js",
)
assert.ok(
  editorSrc.includes('openDlg("settings-dialog")'),
  "btnFileSettings handler must open the settings-dialog via openDlg",
)
assert.ok(
  editorSrc.includes("function syncSettingsDialog()"),
  "syncSettingsDialog must exist in editor.js",
)
console.log("ok 8 btn-filesettings click handler is wired to the settings dialog opener")

// The census wo_cmd must be an EXISTING control: "btn-filesettings" is both
// the census id and the button resolved/wired in editor.js (no stub).
assert.ok(
  editorSrc.includes('getElementById("btn-filesettings")'),
  'wo_cmd "btn-filesettings" must resolve to a real element in editor.js',
)
console.log("ok 9 wo_cmd btn-filesettings resolves to a real control")

// The dialog really opens/closes: classList "open" + .dialog-overlay.open CSS
assert.ok(
  editorSrc.includes('openDlg("settings-dialog")') &&
    editorSrc.includes('closeDlg("settings-dialog")'),
  "settings dialog must have real open/close plumbing",
)
assert.ok(cssSrc.includes(".dialog-overlay.open"), "dialog-overlay open styles must exist")
console.log("ok 10 settings dialog open/close is real and styled")

// i18n: Settings labels/pane/dialog copy must exist in BOTH locales
for (const key of [
  "Menu.Settings",
  "FileScreen.NavSettings",
  "FileScreen.TitleSettings",
  "FileScreen.DescSettings",
  "Backstage.Settings",
  "Settings.Theme",
  "Settings.Language",
  "Settings.Spellchecking",
  "Dialog.Apply",
  "Dialog.Cancel",
]) {
  const count = i18nSrc.split(`"${key}"`).length - 1
  assert.ok(count >= 2, `${key} must be present in both en and de catalogs (found ${count})`)
}
console.log("ok 11 Settings i18n keys exist in both locales")

console.log("\nAll WO-19-settings interact census tests passed!\n")
console.log("settings-PASS")

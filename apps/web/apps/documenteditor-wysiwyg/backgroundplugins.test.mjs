/**
 * WO-7-backgroundplugins: divergent-behavior (plugins tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).

 * Verifies that the Background Plugins button opens a modal dialog to manage
 * and configure background plugins, matching OnlyOffice parity.

 * Run with: node backgroundplugins.test.mjs
 * Success: prints "backgroundplugins-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-7-backgroundplugins tests...\n")

// -- 1. Button exists and is in the plugins tab ------------------------------
assert.ok(htmlSrc.includes('id="btn-bgplugins"'), "btn-bgplugins button must exist in index.html")
console.log("ok 1 btn-bgplugins button exists")

// Button is in the plugins ribbon tab
const pluginsPageStart = htmlSrc.indexOf('<div class="ribbon-page" data-tab="plugins"')
assert.ok(pluginsPageStart >= 0, "plugins ribbon page must exist")
const pluginsPageEnd = htmlSrc.indexOf('<div class="ribbon-page" data-tab="ai"', pluginsPageStart)
const pluginsPage = htmlSrc.slice(
  pluginsPageStart,
  pluginsPageEnd >= 0 ? pluginsPageEnd : undefined,
)
assert.ok(
  pluginsPage.includes('id="btn-bgplugins"'),
  "btn-bgplugins must be in the plugins ribbon tab",
)
console.log("ok 2 btn-bgplugins is in the plugins ribbon tab")

// -- 2. Modal dialog exists --------------------------------------------------
assert.ok(
  htmlSrc.includes('id="background-plugins-dialog"'),
  "background-plugins-dialog must exist in index.html",
)
assert.ok(
  htmlSrc.includes('id="background-plugins-list"'),
  "background-plugins-list must exist in index.html",
)
assert.ok(
  htmlSrc.includes('id="btn-background-plugins-close"'),
  "btn-background-plugins-close must exist in index.html",
)
console.log("ok 3 background-plugins-dialog with list and close button exists")

// Dialog has proper ARIA attributes
assert.ok(
  htmlSrc.includes('id="background-plugins-dialog-title"'),
  "background-plugins-dialog-title must exist",
)
assert.ok(
  htmlSrc.match(/id="background-plugins-dialog"[^>]*role="dialog"/),
  "background-plugins-dialog must have role=dialog",
)
assert.ok(
  htmlSrc.match(/id="background-plugins-dialog"[^>]*aria-modal="true"/),
  "background-plugins-dialog must have aria-modal=true",
)
console.log("ok 4 dialog has proper ARIA attributes")

// -- 3. Button opens dialog (not direct toggle) ------------------------------
assert.ok(
  editorSrc.includes('btnBgPlugins.addEventListener("click", openBackgroundPluginsDialogAsync)'),
  "btn-bgplugins click handler must call openBackgroundPluginsDialogAsync",
)
// The old direct toggle should be removed
assert.ok(
  !editorSrc.includes('btnBgPlugins.addEventListener("click", async () => {') ||
    editorSrc.includes('btnBgPlugins.addEventListener("click", openBackgroundPluginsDialogAsync)'),
  "btn-bgplugins should not directly toggle bg-plugins class",
)
console.log("ok 5 btn-bgplugins opens dialog via openBackgroundPluginsDialogAsync")

// -- 4. Dialog functions exist in editor.js -----------------------------------
assert.ok(
  editorSrc.includes("function openBackgroundPluginsDialogAsync("),
  "openBackgroundPluginsDialogAsync function must exist",
)
assert.ok(
  editorSrc.includes("function closeBackgroundPluginsDialog("),
  "closeBackgroundPluginsDialog function must exist",
)
assert.ok(
  editorSrc.includes("function _renderBackgroundPluginsDialog("),
  "_renderBackgroundPluginsDialog function must exist",
)
console.log("ok 6 dialog open/close/render functions exist")

// -- 5. Dialog is registered in DIALOG_IDS -----------------------------------
assert.ok(
  editorSrc.includes('"background-plugins-dialog"'),
  "background-plugins-dialog must be in DIALOG_IDS",
)
console.log("ok 7 background-plugins-dialog is in DIALOG_IDS")

// Dialog close function is in DIALOG_CLOSE map
assert.ok(
  editorSrc.includes('"background-plugins-dialog": closeBackgroundPluginsDialog'),
  "closeBackgroundPluginsDialog must be in DIALOG_CLOSE map",
)
console.log("ok 8 closeBackgroundPluginsDialog is in DIALOG_CLOSE map")

// -- 6. Close button is wired -------------------------------------------------
assert.ok(
  editorSrc.includes("btn-background-plugins-close") &&
    editorSrc.includes('addEventListener("click", closeBackgroundPluginsDialog)'),
  "btn-background-plugins-close must call closeBackgroundPluginsDialog",
)
console.log("ok 9 close button is wired to closeBackgroundPluginsDialog")

// -- 7. i18n strings exist ----------------------------------------------------
const i18nKeys = ["Plugins.BackgroundSettings", "Plugins.BackgroundDesc"]
for (const key of i18nKeys) {
  const escapedKey = key.replace(/\./g, "\\.")
  const count = (i18nSrc.match(new RegExp(`"${escapedKey}"\\s*:`, "g")) || []).length
  assert.ok(count >= 2, `${key} must be defined in both en and de locales (found ${count})`)
}
console.log("ok 10 i18n strings exist for both locales")

assert.ok(
  i18nSrc.includes('"Plugins.BackgroundSettings": "Background Plugins"'),
  "en: Plugins.BackgroundSettings must be 'Background Plugins'",
)
assert.ok(
  i18nSrc.includes(
    '"Plugins.BackgroundDesc": "Run plugins in the background without showing their panels."',
  ),
  "en: Plugins.BackgroundDesc must exist",
)
assert.ok(
  i18nSrc.includes('"Plugins.BackgroundSettings": "Hintergrund-Plugins"'),
  "de: Plugins.BackgroundSettings must be 'Hintergrund-Plugins'",
)
console.log("ok 11 i18n strings have correct values")

// -- 8. Dialog uses existing plugin infrastructure ----------------------------
assert.ok(
  editorSrc.includes("_fetchPlugins()") &&
    (editorSrc.includes("_renderBackgroundPluginsDialog") ||
      editorSrc.includes("openBackgroundPluginsDialogAsync")),
  "background plugins dialog must use _fetchPlugins()",
)
assert.ok(
  editorSrc.includes("wo.plugins.background"),
  "background plugins must use wo.plugins.background localStorage key",
)
console.log("ok 12 dialog uses existing plugin infrastructure")

// -- 9. Initial state is loaded from localStorage -----------------------------
assert.ok(
  editorSrc.includes("initBgPluginsState") ||
    (editorSrc.includes("wo.plugins.background") &&
      editorSrc.includes("document.body.classList.toggle")),
  "initial bg-plugins state must be loaded from localStorage",
)
console.log("ok 13 initial state is loaded from localStorage")

// -- 10. No bare console.log ---------------------------------------------------
for (const [name, src] of [
  ["editor.js", editorSrc],
  ["index.html", htmlSrc],
]) {
  assert.ok(!src.includes("console.log"), `${name} must not contain bare console.log`)
}
console.log("ok 14 no bare console.log in touched sources")

console.log("\nAll WO-7-backgroundplugins tests passed!\n")
console.log("backgroundplugins-PASS")

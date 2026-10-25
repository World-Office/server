/**
 * AF13-PLUGIN-GALLERY: plugins-tab parity — Plugin Manager + gallery cards.
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies the plugins ribbon page gained the OO-style gallery:
 * - Plugin Manager button (managePlugins handler reuse) + 8 plugin cards
 * - Real-wired cards dispatch existing commands (aiTranslate, readAloud,
 *   dictate, aiRewrite prompt override, code)
 * - Third-party cards without a backend (YouTube/Mendeley/Zotero) share the
 *   wo:plugin-unavailable marker and open the honest info dialog
 * - i18n (en + de) covers every card label and the dialog text
 * - no bare console.log in the touched sources
 *
 * Run with: node plugin-gallery.test.mjs
 * Success: prints "PLUGIN-GALLERY-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorSrc = readFileSync(new URL("./editor.js", import.meta.url), "utf-8")
const htmlSrc = readFileSync(new URL("./index.html", import.meta.url), "utf-8")
const i18nSrc = readFileSync(new URL("./i18n.js", import.meta.url), "utf-8")

console.log("Running AF13-PLUGIN-GALLERY plugin gallery tests...\n")

// Extract the plugins ribbon page section (from its opening tag to the next
// ribbon page) so card assertions are scoped to the plugins tab.
const pageStart = htmlSrc.indexOf('<div class="ribbon-page" data-tab="plugins"')
assert.ok(pageStart >= 0, "plugins ribbon page must exist")
const pageEnd = htmlSrc.indexOf('<div class="ribbon-page" data-tab="ai"', pageStart)
assert.ok(pageEnd > pageStart, "plugins ribbon page must be terminated by the ai page")
const pluginsPage = htmlSrc.slice(pageStart, pageEnd)

// ── (a) Plugin Manager + 8 cards exist ─────────────────────────────
assert.ok(pluginsPage.includes('data-cmd="managePlugins"'), "Plugin Manager button (managePlugins) must exist")
console.log("ok 1 Plugin Manager button exists")

assert.ok(editorSrc.includes("function managePlugins("), "managePlugins handler must exist")
console.log("ok 2 managePlugins handler exists")

const cardCount = (pluginsPage.match(/class="plugin-card"/g) || []).length
assert.equal(cardCount, 8, "plugins tab must have exactly 8 gallery cards")
console.log("ok 3 8 gallery cards exist")

const cardLabels = [
  "Plugins.YouTube", "Plugins.Translator", "Plugins.Mendeley", "Plugins.Thesaurus",
  "Plugins.HighlightCode", "Plugins.Zotero", "Plugins.Speech", "Plugins.SpeechInput",
]
for (const label of cardLabels) {
  assert.ok(pluginsPage.includes(`data-i18n="${label}"`), `card label ${label} must exist`)
}
console.log("ok 4 all 8 card labels present")

// ── (b) real-wired cards dispatch existing cmds ────────────────────
const realWired = [
  ['data-cmd="aiTranslate"', "if (cmd === \"aiTranslate\")"],
  ['data-cmd="readAloud"', "if (cmd === \"readAloud\")"],
  ['data-cmd="dictate"', "if (cmd === \"dictate\")"],
  ['data-cmd="aiRewrite"', "if (cmd === \"aiRewrite\")"],
]
for (const [cardAttr, handler] of realWired) {
  assert.ok(pluginsPage.includes(cardAttr), `${cardAttr} card must exist`)
  assert.ok(editorSrc.includes(handler), `handler ${handler} must exist in editor.js`)
}
console.log("ok 5 Translator/Speech/Speech-input/Thesaurus cards dispatch existing cmds")

assert.ok(pluginsPage.includes('data-cmd="code"'), "Highlight code card must exist")
assert.ok(editorSrc.includes('cmd === "code"'), "code cmd handler must exist in editor.js")
console.log("ok 6 Highlight code card dispatches the code cmd")

// Thesaurus passes its synonyms prompt through the aiRewrite value override.
assert.ok(
  pluginsPage.includes('data-value="Find synonyms for the selection."'),
  "Thesaurus card must carry the synonyms prompt",
)
assert.ok(
  editorSrc.includes("String(value || \"Rewrite the document"),
  "aiRewrite handler must honor the value prompt override",
)
console.log("ok 7 Thesaurus prompt override wired through aiRewrite")

// ── (c) info-dialog cards share the marker ─────────────────────────
const unavailableCount = (pluginsPage.match(/data-cmd="pluginUnavailable"/g) || []).length
assert.equal(unavailableCount, 3, "exactly 3 cards must be honest unavailable stubs")
for (const plugin of ["YouTube", "Mendeley", "Zotero"]) {
  assert.ok(
    pluginsPage.includes(`data-plugin="${plugin}"`),
    `${plugin} card must be marked unavailable via data-plugin`,
  )
}
assert.ok(editorSrc.includes("wo:plugin-unavailable"), "editor.js must carry the wo:plugin-unavailable marker")
assert.ok(htmlSrc.includes('data-marker="wo:plugin-unavailable"'), "info dialog must carry the wo:plugin-unavailable marker")
assert.ok(editorSrc.includes("function openPluginUnavailable("), "openPluginUnavailable handler must exist")
assert.ok(htmlSrc.includes('id="plugin-unavailable-dialog"'), "plugin-unavailable-dialog must exist")
console.log("ok 8 YouTube/Mendeley/Zotero share the wo:plugin-unavailable marker + info dialog")

// ── (d) i18n both locales ──────────────────────────────────────────
const i18nKeys = [
  "Plugins.YouTube", "Plugins.Translator", "Plugins.Mendeley", "Plugins.Thesaurus",
  "Plugins.HighlightCode", "Plugins.Zotero", "Plugins.Speech", "Plugins.SpeechInput",
  "Plugins.UnavailableTitle", "Plugins.UnavailableText",
]
for (const key of i18nKeys) {
  const count = (i18nSrc.match(new RegExp(`"${key.replace(/\./g, "\\.")}"\\s*:`, "g")) || []).length
  assert.ok(count >= 2, `${key} must be defined in both en and de locales (found ${count})`)
}
assert.ok(i18nSrc.includes('"Plugins.UnavailableText": "Drittanbieter-Plugin'), "de locale must translate the unavailable text")
console.log("ok 9 i18n en+de for all card labels + dialog text")

// ── (e) no bare console.log ────────────────────────────────────────
for (const [name, src] of [["editor.js", editorSrc], ["index.html", htmlSrc], ["i18n.js", i18nSrc]]) {
  assert.ok(!src.includes("console.log"), `${name} must not contain bare console.log`)
}
console.log("ok 10 no bare console.log in touched sources")

console.log("\nAll AF13-PLUGIN-GALLERY tests passed!\n")
console.log("PLUGIN-GALLERY-PASS")

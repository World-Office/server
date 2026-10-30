/**
 * WO-6-speechinput: divergent-behavior (plugins tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the "Speech Input" button opens a modal with dictation settings
 * (language selection, microphone options) instead of directly starting dictation.
 *
 * Run with: node speechinput.test.mjs
 * Success: prints "speechinput-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-6-speechinput tests...\n")

// ── Dialog exists in HTML ────────────────────────────────────────────

assert.ok(
  htmlSrc.includes('id="speechinput-dialog"'),
  "speechinput-dialog must exist in index.html",
)

assert.ok(
  htmlSrc.includes('id="speechinput-dialog-title"'),
  "speechinput-dialog must have a title element",
)

// ── Dialog has settings controls ─────────────────────────────────────

assert.ok(
  htmlSrc.includes('id="speechinput-lang"'),
  "speechinput-dialog must have a language select element",
)

assert.ok(
  htmlSrc.includes('id="speechinput-interim"'),
  "speechinput-dialog must have an interim results checkbox",
)

// ── Dialog has action buttons ────────────────────────────────────────

assert.ok(
  htmlSrc.includes('id="btn-speechinput-ok"') && htmlSrc.includes('id="btn-speechinput-cancel"'),
  "speechinput-dialog must have OK and Cancel buttons",
)

// ── Dialog is registered in DIALOG_IDS ───────────────────────────────

assert.ok(
  editorSrc.includes('"speechinput-dialog"'),
  "speechinput-dialog must be in DIALOG_IDS array",
)

// ── dictate() opens the dialog, not direct dictation ──────────────────

assert.ok(
  editorSrc.includes("function openSpeechInputDialog()"),
  "openSpeechInputDialog function must exist",
)

assert.ok(
  editorSrc.includes("function confirmSpeechInputDialog()"),
  "confirmSpeechInputDialog function must exist",
)

assert.ok(
  editorSrc.includes("function dictate() {") && editorSrc.includes("openSpeechInputDialog()"),
  "dictate() must call openSpeechInputDialog()",
)

assert.ok(
  editorSrc.includes("function confirmSpeechInputDialog()") && editorSrc.includes("rec.start()"),
  "confirmSpeechInputDialog must contain SpeechRecognition start logic",
)

// ── speechinput is in ROUND2 for button wiring ───────────────────────

assert.ok(
  editorSrc.includes('["speechinput", confirmSpeechInputDialog]'),
  "speechinput must be in ROUND2 array for button wiring",
)

// ── i18n strings exist ────────────────────────────────────────────────

const requiredKeys = [
  "SpeechInput.Title",
  "SpeechInput.Language",
  "SpeechInput.InterimResults",
  "SpeechInput.LangEnglishUS",
  "SpeechInput.LangEnglishGB",
  "SpeechInput.LangGerman",
  "SpeechInput.LangFrench",
  "SpeechInput.LangSpanish",
]

for (const key of requiredKeys) {
  assert.ok(i18nSrc.includes(`"${key}":`), `i18n must include key "${key}"`)
}

// German translations must exist
assert.ok(
  i18nSrc.includes('"SpeechInput.Title": "Spracheingabe-Einstellungen"'),
  "German SpeechInput.Title translation must exist",
)

assert.ok(
  i18nSrc.includes('"SpeechInput.Language": "Sprache"'),
  "German SpeechInput.Language translation must exist",
)

// ── HTML uses i18n keys ───────────────────────────────────────────────

assert.ok(
  htmlSrc.includes('data-i18n="SpeechInput.Title"'),
  "Dialog title must use SpeechInput.Title i18n key",
)

assert.ok(
  htmlSrc.includes('data-i18n="SpeechInput.Language"'),
  "Language label must use SpeechInput.Language i18n key",
)

assert.ok(
  htmlSrc.includes('data-i18n="SpeechInput.InterimResults"'),
  "Interim results label must use SpeechInput.InterimResults i18n key",
)

// ── Buttons use standard Dialog i18n keys ─────────────────────────────

assert.ok(
  htmlSrc.includes('id="btn-speechinput-ok"') && htmlSrc.includes('data-i18n="Dialog.OK"'),
  "OK button must use Dialog.OK i18n key",
)

assert.ok(
  htmlSrc.includes('id="btn-speechinput-cancel"') && htmlSrc.includes('data-i18n="Dialog.Cancel"'),
  "Cancel button must use Dialog.Cancel i18n key",
)

console.log("All WO-6-speechinput tests passed!\n")
console.log("speechinput-PASS")

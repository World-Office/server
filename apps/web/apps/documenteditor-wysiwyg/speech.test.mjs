/**
 * WO-6-speech: divergent-behavior (plugins tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the Speech button opens a modal with speech settings
 * (voice selection, speed, pitch) instead of directly toggling read-aloud.
 * OnlyOffice parity for the Speech feature.
 *
 * Run with: node speech.test.mjs
 * Success: prints "speech-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-6-speech tests...\n")

// ── HTML: speech dialog must exist ────────────────────────────────

assert.ok(htmlSrc.includes('id="speech-dialog"'), "WO-6: speech-dialog must exist in index.html")

assert.ok(
  htmlSrc.includes('class="dialog-overlay"') && htmlSrc.includes('id="speech-dialog"'),
  "WO-6: speech-dialog must have dialog-overlay class",
)

assert.ok(
  htmlSrc.includes('aria-labelledby="speech-dialog-title"'),
  "WO-6: speech-dialog must have aria-labelledby",
)

// ── HTML: speech dialog must have voice, rate, pitch controls ──────

assert.ok(
  htmlSrc.includes('id="speech-voice"'),
  "WO-6: speech-voice select must exist in speech dialog",
)

assert.ok(
  htmlSrc.includes('id="speech-rate"'),
  "WO-6: speech-rate input must exist in speech dialog",
)

assert.ok(
  htmlSrc.includes('id="speech-pitch"'),
  "WO-6: speech-pitch input must exist in speech dialog",
)

// Rate and pitch should be range inputs with appropriate min/max
assert.ok(
  htmlSrc.includes('type="range"') && htmlSrc.includes('id="speech-rate"'),
  "WO-6: speech-rate must be a range input",
)

assert.ok(
  htmlSrc.includes('type="range"') && htmlSrc.includes('id="speech-pitch"'),
  "WO-6: speech-pitch must be a range input",
)

// Display values for rate and pitch
assert.ok(htmlSrc.includes('id="speech-rate-value"'), "WO-6: speech-rate-value display must exist")

assert.ok(
  htmlSrc.includes('id="speech-pitch-value"'),
  "WO-6: speech-pitch-value display must exist",
)

// Dialog must have OK and Cancel buttons
assert.ok(htmlSrc.includes('id="btn-speech-ok"'), "WO-6: btn-speech-ok button must exist")

assert.ok(htmlSrc.includes('id="btn-speech-close"'), "WO-6: btn-speech-close button must exist")

// ── HTML: btn-readaloud must trigger the dialog ───────────────────

assert.ok(htmlSrc.includes('id="btn-readaloud"'), "WO-6: btn-readaloud button must exist")

assert.ok(
  htmlSrc.includes('data-cmd="readAloud"'),
  'WO-6: btn-readaloud must have data-cmd="readAloud"',
)

// ── Editor: readAloud must open the speech dialog ─────────────────

// readAloud function should exist and call openSpeechDialog
assert.ok(
  editorSrc.includes("function readAloud()"),
  "WO-6: readAloud function must exist in editor.js",
)

assert.ok(editorSrc.includes("openSpeechDialog()"), "WO-6: readAloud must call openSpeechDialog")

// openSpeechDialog function must exist
assert.ok(
  editorSrc.includes("function openSpeechDialog()"),
  "WO-6: openSpeechDialog function must exist in editor.js",
)

// openSpeechDialog must call openOverlayDialog with speech-dialog
assert.ok(
  editorSrc.includes('openOverlayDialog("speech-dialog")'),
  "WO-6: openSpeechDialog must call openOverlayDialog with speech-dialog",
)

// ━ Editor: confirmSpeechDialog must apply speech settings ─────────

assert.ok(
  editorSrc.includes("function confirmSpeechDialog()"),
  "WO-6: confirmSpeechDialog function must exist in editor.js",
)

// confirmSpeechDialog should use SpeechSynthesisUtterance
assert.ok(
  editorSrc.includes("SpeechSynthesisUtterance") && editorSrc.includes("confirmSpeechDialog"),
  "WO-6: confirmSpeechDialog must use SpeechSynthesisUtterance",
)

// confirmSpeechDialog should support voice selection
assert.ok(
  editorSrc.includes("speech-voice") && editorSrc.includes("getVoices()"),
  "WO-6: confirmSpeechDialog must support voice selection via getVoices()",
)

// confirmSpeechDialog should support rate and pitch
assert.ok(
  editorSrc.includes("speech-rate") && editorSrc.includes("u.rate"),
  "WO-6: confirmSpeechDialog must support rate setting",
)

assert.ok(
  editorSrc.includes("speech-pitch") && editorSrc.includes("u.pitch"),
  "WO-6: confirmSpeechDialog must support pitch setting",
)

// speech dialog must be in DIALOG_IDS
assert.ok(editorSrc.includes('"speech-dialog"'), "WO-6: speech-dialog must be in DIALOG_IDS array")

// speech dialog must be registered in ROUND2
assert.ok(
  editorSrc.includes('["speech", confirmSpeechDialog]'),
  "WO-6: speech dialog must be registered in ROUND2 with confirmSpeechDialog",
)

// Event listeners for rate and pitch sliders
assert.ok(
  editorSrc.includes("speech-rate-value") && editorSrc.includes("addEventListener"),
  "WO-6: speech rate slider must update its display value",
)

assert.ok(
  editorSrc.includes("speech-pitch-value") && editorSrc.includes("addEventListener"),
  "WO-6: speech pitch slider must update its display value",
)

// ── i18n: speech settings strings must exist ──────────────────────

// English strings
assert.ok(
  i18nSrc.includes('"View.SpeechSettings": "Speech Settings"'),
  "WO-6: English View.SpeechSettings i18n key must exist",
)

assert.ok(
  i18nSrc.includes('"View.SpeechVoice": "Voice"'),
  "WO-6: English View.SpeechVoice i18n key must exist",
)

assert.ok(
  i18nSrc.includes('"View.SpeechRate": "Speed"'),
  "WO-6: English View.SpeechRate i18n key must exist",
)

assert.ok(
  i18nSrc.includes('"View.SpeechPitch": "Pitch"'),
  "WO-6: English View.SpeechPitch i18n key must exist",
)

assert.ok(
  i18nSrc.includes('"View.SpeechDefaultVoice": "Default"'),
  "WO-6: English View.SpeechDefaultVoice i18n key must exist",
)

// German translations
assert.ok(
  i18nSrc.includes('"View.SpeechSettings": "Spracheinstellungen"'),
  "WO-6: German View.SpeechSettings translation must exist",
)

assert.ok(
  i18nSrc.includes('"View.SpeechVoice": "Stimme"'),
  "WO-6: German View.SpeechVoice translation must exist",
)

assert.ok(
  i18nSrc.includes('"View.SpeechRate": "Geschwindigkeit"'),
  "WO-6: German View.SpeechRate translation must exist",
)

assert.ok(
  i18nSrc.includes('"View.SpeechPitch": "Tonhöhe"'),
  "WO-6: German View.SpeechPitch translation must exist",
)

assert.ok(
  i18nSrc.includes('"View.SpeechDefaultVoice": "Standard"'),
  "WO-6: German View.SpeechDefaultVoice translation must exist",
)

console.log("All WO-6-speech tests passed!\n")
console.log("speech-PASS")

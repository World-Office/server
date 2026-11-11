/**
 * CHROME-C: Header and Footer spin steppers
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that spin steppers for 'Kopfzeile oberhalb'/'Fußzeile von unten'
 * are wired to header/footer offset settings.
 *
 * Run with: node header-footer-spin.test.mjs
 * Success: prints "HF-SPIN-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running CHROME-C header-footer spin tests...\n")

// ── Spin stepper input elements exist ──────────────────────────────

// Header from top spin stepper input
assert.ok(
  htmlSrc.includes('id="hf-header-offset"') &&
  htmlSrc.includes('type="number"'),
  "hf-header-offset number input must exist in index.html"
)

// Footer from bottom spin stepper input
assert.ok(
  htmlSrc.includes('id="hf-footer-offset"') &&
  htmlSrc.includes('type="number"'),
  "hf-footer-offset number input must exist in index.html"
)

// ── Labels with i18n ───────────────────────────────────────────────

// Header from top label with i18n
assert.ok(
  htmlSrc.includes('data-i18n="HF.HeaderFromTop"'),
  "HF.HeaderFromTop i18n label must exist for header offset"
)

// Footer from bottom label with i18n
assert.ok(
  htmlSrc.includes('data-i18n="HF.FooterFromBottom"'),
  "HF.FooterFromBottom i18n label must exist for footer offset"
)

// ── Translations in i18n.js ────────────────────────────────────────

// English translations
assert.ok(
  i18nSrc.includes('"HF.HeaderFromTop": "Header from Top"'),
  "HF.HeaderFromTop English translation must exist"
)
assert.ok(
  i18nSrc.includes('"HF.FooterFromBottom": "Footer from Bottom"'),
  "HF.FooterFromBottom English translation must exist"
)

// German translations
assert.ok(
  i18nSrc.includes('"HF.HeaderFromTop": "Kopfzeile von oben"'),
  "HF.HeaderFromTop German translation must exist"
)
assert.ok(
  i18nSrc.includes('"HF.FooterFromBottom": "Fußzeile von unten"'),
  "HF.FooterFromBottom German translation must exist"
)

// ── Handler reads the offset values ────────────────────────────────

// The OK button handler must read header offset value
assert.ok(
  editorSrc.includes('getElementById("hf-header-offset")'),
  "btn-headerfooter-ok handler must read hf-header-offset value"
)

// The OK button handler must read footer offset value
assert.ok(
  editorSrc.includes('getElementById("hf-footer-offset")'),
  "btn-headerfooter-ok handler must read hf-footer-offset value"
)

// ── Handler applies the offset values to header/footer ─────────────

// The handler must apply header offset to paddingTop
// and footer offset to paddingBottom on the respective elements
assert.ok(
  editorSrc.includes('paddingTop') && editorSrc.includes('paddingBottom') &&
  editorSrc.includes('hf-header-offset') && editorSrc.includes('hf-footer-offset'),
  "Handler must apply header offset to paddingTop and footer offset to paddingBottom"
)

// Allow separate header and footer distances (not just the old single hf-distance)
assert.ok(
  editorSrc.includes('headerOffset') || editorSrc.includes('hf-header-offset'),
  "Handler must use separate header offset variable"
)
assert.ok(
  editorSrc.includes('footerOffset') || editorSrc.includes('hf-footer-offset'),
  "Handler must use separate footer offset variable"
)

console.log("All CHROME-C header-footer spin tests passed!\n")
console.log("HF-SPIN-PASS")

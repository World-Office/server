/**
 * F-023, F-024, F-053: Clear formatting, Grow/shrink font, Title/Subtitle styles
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that editor.js and index.html contain the required toolbar/command
 * wiring for three home.font/home.styles features.
 *
 * Run with: node font-style.test.mjs
 * Success: prints "FONT-STYLE-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running F-023/F-024/F-053 font-style tests...\n")

// ── F-023: Clear formatting (removeFormat) ──────────────────────────

// The toolbar button must exist with data-cmd="removeFormat"
assert.ok(
  htmlSrc.includes('data-cmd="removeFormat"'),
  "F-023: removeFormat button must exist in index.html",
)

// removeFormat is a standard execCommand; the generic fallthrough in
// runCommand handles it (document.queryCommandSupported + execCommand).
// Verify the generic execCommand path exists.
assert.ok(
  editorSrc.includes("document.execCommand(cmd, false,"),
  "F-023: generic execCommand fallthrough must exist in runCommand",
)

// ── F-024: Grow / shrink font (fontSizeInc / fontSizeDec) ───────────

// The menu items must exist in index.html
assert.ok(
  htmlSrc.includes('data-cmd="fontSizeInc"'),
  "F-024: fontSizeInc menu item must exist in index.html",
)
assert.ok(
  htmlSrc.includes('data-cmd="fontSizeDec"'),
  "F-024: fontSizeDec menu item must exist in index.html",
)

// The handler must exist in editor.js
assert.ok(
  editorSrc.includes('cmd === "fontSizeInc"') && editorSrc.includes('cmd === "fontSizeDec"'),
  "F-024: fontSizeInc/fontSizeDec handler must exist in editor.js",
)

// The handler must step along the 1..7 HTML size ladder
assert.ok(
  editorSrc.includes("Math.min(7, Math.max(1, step +"),
  "F-024: font size step logic must clamp to 1..7 ladder",
)

// ── F-053: Title / Subtitle styles (formatBlock H4 / H5) ────────────

// Title (H4) must exist in the formatBlock menu
assert.ok(
  htmlSrc.includes('data-cmd="formatBlock" data-value="H4"'),
  "F-053: Title (H4) formatBlock option must exist in index.html",
)

// Subtitle (H5) must exist in the formatBlock menu
assert.ok(
  htmlSrc.includes('data-cmd="formatBlock" data-value="H5"'),
  "F-053: Subtitle (H5) formatBlock option must exist in index.html",
)

// The formatBlock regex must accept H5
assert.ok(/H\[1-6\]\|P\|BLOCKQUOTE/.test(editorSrc), "F-053: formatBlock regex must accept H[1-6]")

// i18n keys for Title and Subtitle must exist
assert.ok(
  i18nSrc.includes('"Home.StyleTitle": "Title"'),
  "F-053: Home.StyleTitle i18n key must exist",
)
assert.ok(
  i18nSrc.includes('"Home.StyleSubtitle": "Subtitle"'),
  "F-053: Home.StyleSubtitle i18n key must exist",
)

// German translations must exist
assert.ok(
  i18nSrc.includes('"Home.StyleSubtitle": "Untertitel"'),
  "F-053: German Home.StyleSubtitle translation must exist",
)

console.log("All F-023/F-024/F-053 tests passed!\n")
console.log("FONT-STYLE-PASS")

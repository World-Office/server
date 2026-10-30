/**
 * WO-4-hyphenation: Hyphenation command should open a modal dialog
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the Hyphenation command opens a modal dialog with options
 * for automatic hyphenation settings, rather than providing direct toggle
 * options in the ribbon menu.
 *
 * Run with: node hyphenation.test.mjs
 * Success: prints "HYPHENATION-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")

console.log("Running WO-4-hyphenation tests...\n")

// ── Hyphenation command opens modal, not direct toggle ──────────────

// The Hyphenation button must exist with data-cmd="toggleHyphenation"
// (not hyphenationSet which was a direct toggle)
assert.ok(
  htmlSrc.includes('data-cmd="toggleHyphenation"'),
  "WO-4: Hyphenation button must use toggleHyphenation command, not hyphenationSet",
)

// The Hyphenation button must have the Layout.Hyphenation i18n key
assert.ok(
  htmlSrc.includes('data-i18n="Layout.Hyphenation"'),
  "WO-4: Hyphenation button must have Layout.Hyphenation i18n key",
)

// The old direct toggle menu items (hyphenationSet) must be removed
assert.ok(
  !htmlSrc.includes('data-cmd="hyphenationSet"'),
  "WO-4: Direct hyphenationSet menu items must be removed (use modal instead)",
)

// The toggleHyphenation command handler must exist in editor.js
assert.ok(
  editorSrc.includes('cmd === "toggleHyphenation"'),
  "WO-4: toggleHyphenation command handler must exist in editor.js",
)

// The toggleHyphenation handler must call openHyphenationDialog
assert.ok(
  editorSrc.includes("toggleHyphenation") && editorSrc.includes("openHyphenationDialog"),
  "WO-4: toggleHyphenation must open the hyphenation dialog",
)

// The hyphenation dialog must exist in HTML
assert.ok(
  htmlSrc.includes('id="hyphenation-dialog"'),
  "WO-4: hyphenation-dialog must exist in index.html",
)

// The hyphenation dialog must have a title
assert.ok(
  htmlSrc.includes('id="hyphenation-dialog-title"'),
  "WO-4: hyphenation dialog must have a title element",
)

// The hyphenation dialog must have options for hyphenation mode
assert.ok(
  htmlSrc.includes('id="hy-mode"'),
  "WO-4: hyphenation dialog must have mode selector (hy-mode)",
)

// The hyphenation dialog must have None and Automatic options
assert.ok(
  htmlSrc.includes('<option value="none">') && htmlSrc.includes('<option value="auto"'),
  "WO-4: hyphenation dialog must have None and Automatic options",
)

// The confirmHyphenationDialog function must exist in editor.js
assert.ok(
  editorSrc.includes("function confirmHyphenationDialog"),
  "WO-4: confirmHyphenationDialog function must exist in editor.js",
)

// The openHyphenationDialog function must exist and open the overlay
assert.ok(
  editorSrc.includes("function openHyphenationDialog") &&
    editorSrc.includes('openOverlayDialog("hyphenation-dialog")'),
  "WO-4: openHyphenationDialog must open the overlay dialog",
)

// The old hyphenationSet handler must be removed from editor.js
assert.ok(
  !editorSrc.includes('cmd === "hyphenationSet"'),
  "WO-4: Direct hyphenationSet command handler must be removed from editor.js",
)

console.log("All WO-4-hyphenation tests passed!\n")
console.log("HYPHENATION-PASS")

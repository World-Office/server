/**
 * WO-4-watermark: Watermark command should open a modal dialog
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the Watermark command opens a modal dialog with options
 * for customizing or removing watermarks, not just a direct toggle.
 *
 * Run with: node watermark.test.mjs
 * Success: prints "WATERMARK-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")

console.log("Running WO-4-watermark tests...\n")

// поддержку Watermark command opens modal, not direct toggle ──────────

// The Watermark button must exist with data-cmd="toggleWatermark"
assert.ok(
  htmlSrc.includes('data-cmd="toggleWatermark"'),
  "WO-4: Watermark button must use toggleWatermark command",
)

// The Watermark button must have the Layout.Watermark i18n key
assert.ok(
  htmlSrc.includes('data-i18n="Layout.Watermark"'),
  "WO-4: Watermark button must have Layout.Watermark i18n key",
)

// The toggleWatermark command handler must exist in editor.js
assert.ok(
  editorSrc.includes('cmd === "toggleWatermark"'),
  "WO-4: toggleWatermark command handler must exist in editor.js",
)

// The toggleWatermark handler must call openWatermarkDialog
assert.ok(
  editorSrc.includes("toggleWatermark") && editorSrc.includes("openWatermarkDialog"),
  "WO-4: toggleWatermark must open the watermark dialog",
)

// The watermark dialog must exist in HTML
assert.ok(
  htmlSrc.includes('id="watermark-dialog"'),
  "WO-4: watermark-dialog must exist in index.html",
)

// The watermark dialog must have a title
assert.ok(
  htmlSrc.includes('id="watermark-dialog-title"'),
  "WO-4: watermark dialog must have a title element",
)

// The watermark dialog must have options for watermark mode
assert.ok(
  htmlSrc.includes('id="wm-mode"'),
  "WO-4: watermark dialog must have mode selector (wm-mode)",
)

// The watermark dialog must have No watermark option
assert.ok(
  htmlSrc.includes('<option value="none">No watermark</option>'),
  "WO-4: watermark dialog must have No watermark option for removal",
)

// The watermark dialog must have predefined options like DRAFT and CONFIDENTIAL
assert.ok(
  htmlSrc.includes('<option value="draft"') && htmlSrc.includes('<option value="confidential"'),
  "WO-4: watermark dialog must have predefined watermark options (draft, confidential)",
)

// The watermark dialog must have a custom text option
assert.ok(
  htmlSrc.includes('<option value="custom">'),
  "WO-4: watermark dialog must have custom text option",
)

// The watermark dialog must have a custom text input field
assert.ok(
  htmlSrc.includes('id="wm-text"') && htmlSrc.includes('type="text"'),
  "WO-4: watermark dialog must have custom text input field",
)

// The watermark dialog must have color selection
assert.ok(
  htmlSrc.includes('id="wm-color"'),
  "WO-4: watermark dialog must have color selector (wm-color)",
)

// The confirmWatermarkDialog function must exist in editor.js
assert.ok(
  editorSrc.includes("function confirmWatermarkDialog"),
  "WO-4: confirmWatermarkDialog function must exist in editor.js",
)

// The openWatermarkDialog function must exist and open the overlay
assert.ok(
  editorSrc.includes("function openWatermarkDialog") &&
    editorSrc.includes('openOverlayDialog("watermark-dialog")'),
  "WO-4: openWatermarkDialog must open the overlay dialog",
)

// The watermark dialog must have OK and Cancel buttons
assert.ok(
  htmlSrc.includes('id="btn-watermark-ok"') && htmlSrc.includes('id="btn-watermark-close"'),
  "WO-4: watermark dialog must have OK and Cancel buttons",
)

// The confirmWatermarkDialog must handle removal (mode === "none")
assert.ok(
  editorSrc.includes('if (mode === "none")') &&
    editorSrc.includes('removeSectionMarker("watermark")'),
  "WO-4: confirmWatermarkDialog must handle removing watermark (mode === none)",
)

// The confirmWatermarkDialog must handle custom text watermarks
assert.ok(
  editorSrc.includes('mode === "custom"') &&
    editorSrc.includes('document.getElementById("wm-text")'),
  "WO-4: confirmWatermarkDialog must handle custom text watermarks",
)

// The confirmWatermarkDialog must apply the watermark with text and color
assert.ok(
  editorSrc.includes('setSectionMarker("watermark"') &&
    editorSrc.includes("data-text=") &&
    editorSrc.includes("data-color="),
  "WO-4: confirmWatermarkDialog must apply watermark with text and color",
)

// i18n: Watermark label must exist
assert.ok(
  htmlSrc.includes('for="wm-mode"') && htmlSrc.includes(">Watermark</label>"),
  "WO-4: watermark dialog must have Watermark label for mode selector",
)

console.log("All WO-4-watermark tests passed!\n")
console.log("WATERMARK-PASS")

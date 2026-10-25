/**
 * AF7-RIGHT-PANEL: Right settings panel (icon rail + collapsible body +
 * live Paragraph settings section).
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies the panel markup in index.html, the command wiring in editor.js,
 * the styles in style.css, and the i18n keys (en + de).
 *
 * Run with: node right-panel.test.mjs
 * Success: prints "RIGHT-PANEL-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const cssPath = new URL("./style.css", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const cssSrc = readFileSync(cssPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running AF7 right-panel tests...\n")

// ── (a) Markup: aside, icon rail with 5 sections, Paragraph controls ─

assert.ok(
  htmlSrc.includes('<aside id="right-panel" hidden'),
  "AF7: right-panel aside must exist in index.html",
)
assert.ok(
  htmlSrc.includes('<nav id="right-rail"'),
  "AF7: right-rail icon nav must exist in index.html",
)
for (const section of ["paragraph", "table", "image", "chart", "mailmerge"]) {
  assert.ok(
    htmlSrc.includes(`data-panel="${section}"`),
    `AF7: rail button data-panel="${section}" must exist in index.html`,
  )
  assert.ok(
    htmlSrc.includes(`data-section="${section}"`),
    `AF7: body section data-section="${section}" must exist in index.html`,
  )
}
for (const id of [
  "rp-line-spacing",
  "rp-spacing-before",
  "rp-spacing-after",
  "rp-indent-left",
  "rp-indent-right",
  "rp-shading",
  "rp-advanced",
]) {
  assert.ok(
    htmlSrc.includes(`id="${id}"`),
    `AF7: panel control #${id} must exist in index.html`,
  )
}

// ── (b) Commands: runCommand wiring + apply helpers in editor.js ─────

assert.ok(
  editorSrc.includes('if (cmd === "toggleRightPanel") { toggleRightPanel(); return; }'),
  "AF7: toggleRightPanel must be dispatched in runCommand",
)
assert.ok(
  editorSrc.includes('cmd === "spacingBefore"') && editorSrc.includes('cmd === "spacingAfter"'),
  "AF7: spacingBefore/spacingAfter handlers must exist in runCommand",
)
assert.ok(
  editorSrc.includes('cmd === "indentLeft"') && editorSrc.includes('cmd === "indentRight"'),
  "AF7: indentLeft/indentRight handlers must exist in runCommand",
)
assert.ok(
  editorSrc.includes('cmd === "paragraphBackColor"'),
  "AF7: paragraphBackColor handler must exist in runCommand",
)
assert.ok(
  editorSrc.includes("function applyParagraphSpacing"),
  "AF7: applyParagraphSpacing must exist in editor.js",
)
assert.ok(
  editorSrc.includes("function applyParagraphIndent"),
  "AF7: applyParagraphIndent must exist in editor.js",
)
assert.ok(
  editorSrc.includes("function applyParagraphShading"),
  "AF7: applyParagraphShading must exist in editor.js",
)
// F-040 refactor: the ribbon shading picker delegates to the shared helper.
assert.ok(
  editorSrc.includes("applyParagraphShading(shadingColor.value)"),
  "AF7: #shading-color listener must delegate to applyParagraphShading",
)
assert.ok(
  editorSrc.includes("function toggleRightPanel") &&
    editorSrc.includes("function openRightPanelSection") &&
    editorSrc.includes("function syncRightPanelControls"),
  "AF7: panel toggle/switch/sync functions must exist in editor.js",
)
// Ctrl+Shift+P keybinding.
assert.ok(
  editorSrc.includes('k === "p" && ev.shiftKey'),
  "AF7: Ctrl+Shift+P keybinding must exist in editor.js",
)
// Advanced-settings marker event.
assert.ok(
  editorSrc.includes("wo:open-paragraph-settings"),
  "AF7: rp-advanced must fire the wo:open-paragraph-settings marker event",
)
// No bare console.log in editor.js (repo convention: console.info markers only).
assert.ok(
  !editorSrc.includes("console.log("),
  "AF7: editor.js must not contain bare console.log",
)

// ── (c) Styles: panel + rail + canvas shrink in style.css ────────────

assert.ok(
  cssSrc.includes("#right-panel {") && cssSrc.includes("#right-rail {"),
  "AF7: #right-panel/#right-rail styles must exist in style.css",
)
assert.ok(
  cssSrc.includes("width: 280px"),
  "AF7: panel body must be 280px wide in style.css",
)
assert.ok(
  cssSrc.includes("main.rp-open"),
  "AF7: main.rp-open canvas-shrink rule must exist in style.css",
)

// ── (d) ARIA contract: pressed states wired both sides ───────────────

assert.ok(
  htmlSrc.includes('data-cmd="toggleRightPanel" data-i18n="View.RightPanel" aria-pressed="false"'),
  "AF7: View-tab toggle button must carry aria-pressed=false",
)
assert.ok(
  editorSrc.includes('rightPanelToggleBtn.setAttribute("aria-pressed"'),
  "AF7: toggleRightPanel must mirror aria-pressed on the View-tab button",
)
assert.ok(
  editorSrc.includes('btn.setAttribute("aria-pressed", opening && btn.dataset.panel === rightPanelSection ? "true" : "false")'),
  "AF7: rail buttons must reflect the active section via aria-pressed",
)

// ── (e) i18n: English + German catalogs ──────────────────────────────

assert.ok(
  i18nSrc.includes('"View.RightPanel": "Settings panel"'),
  "AF7: View.RightPanel i18n key must exist",
)
assert.ok(
  i18nSrc.includes('"View.RightPanel": "Einstellungs-Leiste"'),
  "AF7: German View.RightPanel translation must exist",
)
assert.ok(
  i18nSrc.includes('"RightPanel.LineSpacing": "Line spacing"') &&
    i18nSrc.includes('"RightPanel.Advanced": "Show advanced settings"'),
  "AF7: English RightPanel.* keys must exist",
)
assert.ok(
  i18nSrc.includes('"RightPanel.LineSpacing": "Zeilenabstand"') &&
    i18nSrc.includes('"RightPanel.Advanced": "Erweiterte Einstellungen anzeigen"'),
  "AF7: German RightPanel.* translations must exist",
)

console.log("All AF7 right-panel tests passed!\n")
console.log("RIGHT-PANEL-PASS")

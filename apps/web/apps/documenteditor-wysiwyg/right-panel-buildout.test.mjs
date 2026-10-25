/**
 * AF15-RIGHT-PANEL-BUILDOUT: Real Table / Image / Chart / Mail Merge right
 * panel sections replacing the AF7 placeholders.
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies: (a) placeholder markup is gone, (b) the new controls exist and
 * are wired in editor.js, (c) selection gating logic exists, (d) i18n keys
 * exist in both en + de catalogs, (e) no bare console.log in editor.js.
 *
 * Run with: node right-panel-buildout.test.mjs
 * Success: prints "RIGHT-PANEL-BUILDOUT-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running AF15 right-panel-buildout tests...\n")

// ── (a) Placeholders are gone ────────────────────────────────────────

assert.ok(
  !htmlSrc.includes("rp-empty"),
  "AF15: .rp-empty placeholder divs must be removed from index.html",
)
for (const key of ["NoTable", "NoImage", "NoChart", "NoMailMerge"]) {
  assert.ok(
    !htmlSrc.includes(`RightPanel.${key}`),
    `AF15: placeholder i18n reference RightPanel.${key} must be gone from index.html`,
  )
  assert.ok(
    !i18nSrc.includes(`"RightPanel.${key}":`),
    `AF15: placeholder i18n key RightPanel.${key} must be removed from i18n.js`,
  )
}
assert.ok(
  !htmlSrc.includes("No table selected") && !htmlSrc.includes("No image selected"),
  "AF15: placeholder hint texts must be gone from index.html",
)

// ── (b) Controls exist in index.html and are wired in editor.js ──────

for (const id of [
  // Table section
  "rp-table-border-style",
  "rp-table-border-color",
  "rp-table-background",
  "rp-table-row-height",
  "rp-table-col-width",
  "rp-table-advanced",
  // Image/Shape section
  "rp-image-width",
  "rp-image-height",
  "rp-image-opacity",
  "rp-image-rotate",
  "rp-image-flip-h",
  "rp-image-flip-v",
  "rp-image-wrap",
  "rp-image-fill",
  "rp-image-line-color",
  "rp-image-line-size",
  "rp-image-advanced",
  // Chart section
  "rp-chart-width",
  "rp-chart-height",
  "rp-chart-wrap",
  "rp-chart-advanced",
  // Mail merge section
  "rp-mm-recipients",
  "rp-mm-fields",
  "rp-mm-merge-to",
]) {
  assert.ok(
    htmlSrc.includes(`id="${id}"`),
    `AF15: panel control #${id} must exist in index.html`,
  )
}

// Wrapping dropdowns must expose the objectOp wrap values.
for (const value of ["wrap-inline", "wrap-square", "wrap-behind"]) {
  assert.ok(
    htmlSrc.includes(`value="${value}"`),
    `AF15: wrapping dropdown option value="${value}" must exist in index.html`,
  )
}

// Control wiring in editor.js (getElementById lookups).
for (const id of [
  "rp-table-border-style",
  "rp-table-border-color",
  "rp-table-background",
  "rp-table-row-height",
  "rp-table-col-width",
  "rp-table-advanced",
  "rp-image-width",
  "rp-image-height",
  "rp-image-opacity",
  "rp-image-rotate",
  "rp-image-flip-h",
  "rp-image-flip-v",
  "rp-image-wrap",
  "rp-image-fill",
  "rp-image-line-color",
  "rp-image-line-size",
  "rp-image-advanced",
  "rp-chart-width",
  "rp-chart-height",
  "rp-chart-wrap",
  "rp-chart-advanced",
  "rp-mm-recipients",
  "rp-mm-fields",
  "rp-mm-merge-to",
]) {
  assert.ok(
    editorSrc.includes(`getElementById("${id}")`),
    `AF15: #${id} must be looked up and wired in editor.js`,
  )
}

// Table apply helpers + advanced dialog reuse.
assert.ok(
  editorSrc.includes("function applyTableBorder") &&
    editorSrc.includes("function applyTableBackground") &&
    editorSrc.includes("function applyTableRowHeight") &&
    editorSrc.includes("function applyTableColWidth"),
  "AF15: table apply helpers must exist in editor.js",
)
assert.ok(
  editorSrc.includes('emitCommand("openBorders")'),
  "AF15: table Advanced must reuse the existing borders/table dialog (openBorders)",
)

// Image/Shape apply helpers + wrapping via applyObjectOp.
assert.ok(
  editorSrc.includes("function applyImageSize") &&
    editorSrc.includes("function applyImageOpacity") &&
    editorSrc.includes("function applyImageRotate90") &&
    editorSrc.includes("function applyImageFlip") &&
    editorSrc.includes("function applyImageWrap") &&
    editorSrc.includes("function applyImageFill") &&
    editorSrc.includes("function applyImageLine") &&
    editorSrc.includes("function applyImageTransform"),
  "AF15: image/shape apply helpers must exist in editor.js",
)
assert.ok(
  editorSrc.includes("applyObjectOp(value)"),
  "AF15: image wrapping must delegate to the existing applyObjectOp",
)
// Gradient/advanced fill is unsupported in the canvas model → marker event.
assert.ok(
  editorSrc.includes("wo:open-image-settings"),
  "AF15: image Advanced/fill extras must fire the wo:open-image-settings marker event",
)

// Chart sizing reuses the AF9 applyChartSize path; Advanced reuses chartSettings.
assert.ok(
  editorSrc.includes("function applyChartPanelSize") &&
    editorSrc.includes("applyChartSize("),
  "AF15: chart panel sizing must reuse applyChartSize",
)
assert.ok(
  editorSrc.includes('emitCommand("chartSettings")'),
  "AF15: chart Advanced must reuse the chartSettings handler (wo:chart-settings)",
)

// Mail merge buttons reuse the existing dialog paths.
assert.ok(
  editorSrc.includes('getElementById("btn-mailmerge")') &&
    editorSrc.includes('openDlg("mailmerge-dialog")') &&
    editorSrc.includes('getElementById("btn-mailmerge-preview")'),
  "AF15: mail merge section must reuse the existing btn-mailmerge dialog paths",
)

// ── (c) Selection gating logic ───────────────────────────────────────

assert.ok(
  editorSrc.includes("function selectedTable") &&
    editorSrc.includes("function selectedImageObject") &&
    editorSrc.includes("function syncChartPanelControls"),
  "AF15: section selection helpers must exist in editor.js",
)
assert.ok(
  editorSrc.includes("function setRpSectionEnabled"),
  "AF15: per-section enable/disable gating must exist in editor.js",
)
assert.ok(
  editorSrc.includes("syncTablePanelControls();") &&
    editorSrc.includes("syncImagePanelControls();") &&
    editorSrc.includes("syncChartPanelControls();"),
  "AF15: syncRightPanelControls must drive the new section syncs",
)

// ── (d) i18n: English + German catalogs ──────────────────────────────

const enKeys = {
  BorderStyle: "Border style",
  BorderSolid: "Solid",
  BorderDashed: "Dashed",
  BorderDotted: "Dotted",
  BorderDouble: "Double",
  BorderNone: "None",
  BorderColor: "Border color",
  BackgroundColor: "Background",
  RowHeight: "Row height (pt)",
  ColWidth: "Column width (pt)",
  Width: "Width (px)",
  Height: "Height (px)",
  Opacity: "Opacity (%)",
  Rotate90: "Rotate 90°",
  FlipH: "Flip horizontal",
  FlipV: "Flip vertical",
  Wrapping: "Wrapping style",
  WrapInline: "Inline",
  WrapSquare: "Square",
  WrapBehind: "Behind text",
  Fill: "Fill",
  LineColor: "Line color",
  LineSize: "Line size (pt)",
  Recipients: "Recipients…",
  MergeFields: "Merge fields…",
  MergeTo: "Merge to (preview)",
}
const deKeys = {
  BorderStyle: "Rahmenstil",
  BorderSolid: "Durchgezogen",
  BorderDashed: "Gestrichelt",
  BorderDotted: "Gepunktet",
  BorderDouble: "Doppelt",
  BorderNone: "Keine",
  BorderColor: "Rahmenfarbe",
  BackgroundColor: "Hintergrund",
  RowHeight: "Zeilenhöhe (pt)",
  ColWidth: "Spaltenbreite (pt)",
  Width: "Breite (px)",
  Height: "Höhe (px)",
  Opacity: "Deckkraft (%)",
  Rotate90: "Um 90° drehen",
  FlipH: "Horizontal spiegeln",
  FlipV: "Vertikal spiegeln",
  Wrapping: "Textumbruch",
  WrapInline: "Inline",
  WrapSquare: "Rechteckig",
  WrapBehind: "Hinter dem Text",
  Fill: "Füllung",
  LineColor: "Linienfarbe",
  LineSize: "Linienstärke (pt)",
  Recipients: "Empfänger…",
  MergeFields: "Seriendruckfelder…",
  MergeTo: "Seriendruck (Vorschau)",
}
for (const [key, value] of Object.entries(enKeys)) {
  assert.ok(
    i18nSrc.includes(`"RightPanel.${key}": "${value}"`),
    `AF15: English RightPanel.${key} key must exist in i18n.js`,
  )
}
for (const [key, value] of Object.entries(deKeys)) {
  assert.ok(
    i18nSrc.includes(`"RightPanel.${key}": "${value}"`),
    `AF15: German RightPanel.${key} translation must exist in i18n.js`,
  )
}

// ── (e) No bare console.log in editor.js ─────────────────────────────

assert.ok(
  !editorSrc.includes("console.log("),
  "AF15: editor.js must not contain bare console.log (console.info markers only)",
)

console.log("All AF15 right-panel-buildout tests passed!\n")
console.log("RIGHT-PANEL-BUILDOUT-PASS")

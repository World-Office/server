/**
 * WO-17-photoeditor: missing-feature (plugins tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies the photo editor modal can be opened from the plugins tab
 * via the editPhoto wo-command, providing basic image adjustments
 * (crop, brightness, contrast) that apply to the image in the document.
 *
 * Run with: node photoeditor.test.mjs
 * Success: prints "photoeditor-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-17-photoeditor tests...\n")

// editPhoto command exists and opens the photo editor dialog
assert.ok(
  editorSrc.includes('cmd === "editPhoto"'),
  "editPhoto command handler must exist in editor.js",
)
console.log("ok 1 editPhoto command handler exists")

assert.ok(
  editorSrc.includes("openPhotoEditorDialog"),
  "openPhotoEditorDialog function must exist in editor.js",
)
console.log("ok 2 openPhotoEditorDialog function exists")

assert.ok(
  editorSrc.includes('if (cmd === "editPhoto") { openPhotoEditorDialog(); return; }'),
  "editPhoto command must call openPhotoEditorDialog()",
)
console.log("ok 3 editPhoto command calls openPhotoEditorDialog")

// photo editor dialog exists in HTML
assert.ok(
  htmlSrc.includes('id="photo-editor-dialog"'),
  "photo-editor-dialog must exist in index.html",
)
console.log("ok 4 photo-editor-dialog exists")

assert.ok(
  htmlSrc.includes('id="photo-editor-canvas"'),
  "photo-editor-canvas must exist in index.html",
)
console.log("ok 5 photo-editor-canvas exists")

// photo editor has crop, brightness, contrast controls
assert.ok(htmlSrc.includes('id="photo-editor-brightness"'), "brightness control must exist")
console.log("ok 6 brightness control exists")

assert.ok(htmlSrc.includes('id="photo-editor-contrast"'), "contrast control must exist")
console.log("ok 7 contrast control exists")

assert.ok(htmlSrc.includes('id="btn-photo-editor-crop"'), "crop button must exist")
console.log("ok 8 crop button exists")

// photo editor dialog connects to handlers in editor.js
assert.ok(
  editorSrc.includes("photoEditorBrightness"),
  "photoEditorBrightness reference must exist in editor.js",
)
console.log("ok 9 photoEditorBrightness reference exists")

assert.ok(
  editorSrc.includes("photoEditorContrast"),
  "photoEditorContrast reference must exist in editor.js",
)
console.log("ok 10 photoEditorContrast reference exists")

assert.ok(
  editorSrc.includes("photoEditorApply"),
  "photoEditorApply function must exist in editor.js",
)
console.log("ok 11 photoEditorApply function exists")

// i18n strings for photo editor exist in both locales
const photoEditorKeys = [
  "Plugins.PhotoEditor",
  "PhotoEditor.ChooseFile",
  "PhotoEditor.Empty",
  "PhotoEditor.Crop",
  "PhotoEditor.Apply",
  "PhotoEditor.Brightness",
  "PhotoEditor.Contrast",
  "PhotoEditor.Reset",
  "PhotoEditor.Close",
]
for (const key of photoEditorKeys) {
  const count = (i18nSrc.match(new RegExp(`"${key.replace(/\./g, "\\.")}"\\s*:`, "g")) || []).length
  assert.ok(count >= 2, `${key} must be defined in both en and de locales (found ${count})`)
}
console.log("ok 12 i18n strings exist in both locales")

// plugins tab has Photo editor button with data-cmd
assert.ok(htmlSrc.includes('data-cmd="photoEditor"'), "plugins tab must have photoEditor button")
console.log("ok 13 plugins tab has photoEditor button")

assert.ok(
  htmlSrc.includes('data-i18n="Plugins.PhotoEditor"'),
  "plugins tab must have PhotoEditor i18n label",
)
console.log("ok 14 plugins tab has PhotoEditor i18n label")

// photo editor dialog has apply/close controls
assert.ok(htmlSrc.includes('id="btn-photo-editor-apply"'), "photo-editor-apply button must exist")
console.log("ok 15 photo-editor-apply button exists")

assert.ok(htmlSrc.includes('id="btn-photo-editor-cancel"'), "photo-editor-cancel button must exist")
console.log("ok 16 photo-editor-cancel button exists")

// event listeners are wired
assert.ok(
  editorSrc.includes("photoEditorFile.addEventListener"),
  "photoEditorFile must have event listener",
)
console.log("ok 17 photoEditorFile event listener exists")

assert.ok(
  editorSrc.includes("photoApplyBtn.addEventListener"),
  "photoApplyBtn must have event listener",
)
console.log("ok 18 photoApplyBtn event listener exists")

console.log("\nAll WO-17-photoeditor tests passed!\n")
console.log("photoeditor-PASS")

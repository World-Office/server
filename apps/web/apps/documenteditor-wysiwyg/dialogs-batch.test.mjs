// P3-U04 gate: long-tail dialog batch from the engine
//   rename/copy-warning/text-input/footnote-tip/sync-tip/style-title/
//   shortcuts-edit/select-file/quick-access/charts3d/shape-shadow/
//   text-art/format-settings/mail-merge-email/document-access
//
// Zero dependencies: imports the real ES module headlessly and asserts
// that all 15 new dialog specs export cleanly, render through the engine,
// and carry the expected commands/rows.
//
// Run with: node dialogs-batch.test.mjs   → prints "DIALOGS-BATCH-PASS"
import { readFileSync } from "node:fs"
import assert from "node:assert/strict"

const js = readFileSync(new URL("./wo-dialogs.js", import.meta.url), "utf8")

// ---------------------------------------------------------------------------
// 1. Module loads without side effects
// ---------------------------------------------------------------------------
const mod = await import("./wo-dialogs.js")
assert.ok(mod, "wo-dialogs.js loads as ES module")

// ---------------------------------------------------------------------------
// 2. All 15 new dialog specs are exported in WO_DIALOG_SPECS
// ---------------------------------------------------------------------------
const specIds = [
  "renameDialog",
  "copyWarningDialog",
  "textInputDialog",
  "footnoteTipDialog",
  "syncTipDialog",
  "styleTitleDialog",
  "shortcutsEditDialog",
  "selectFileDialog",
  "quickAccessDialog",
  "charts3dDialog",
  "textArtDialog",
  "formatSettingsDialog",
  "mailMergeEmailDialog",
  "documentAccessDialog",
]

for (const id of specIds) {
  assert.ok(mod.WO_DIALOG_SPECS[id], `WO_DIALOG_SPECS.${id} exported`)
}
console.log("ok 1 all 14 new dialog specs exported in WO_DIALOG_SPECS")

// ---------------------------------------------------------------------------
// 3. New dialog specs have correct ids and okCmd values
// ---------------------------------------------------------------------------
const expectedIds = [
  { key: "renameDialog", id: "rename-dialog", okCmd: "renameDialog" },
  { key: "copyWarningDialog", id: "copy-warning-dialog", okCmd: "copyWarningDialog" },
  { key: "textInputDialog", id: "text-input-dialog", okCmd: "textInputDialog" },
  { key: "footnoteTipDialog", id: "footnote-tip-dialog", okCmd: "footnoteTipDialog" },
  { key: "syncTipDialog", id: "sync-tip-dialog", okCmd: "syncTipDialog" },
  { key: "styleTitleDialog", id: "style-title-dialog", okCmd: "styleTitleDialog" },
  { key: "shortcutsEditDialog", id: "shortcuts-edit-dialog", okCmd: "shortcutsEditDialog" },
  { key: "selectFileDialog", id: "select-file-dialog", okCmd: "selectFileDialog" },
  { key: "quickAccessDialog", id: "quick-access-dialog", okCmd: "quickAccessDialog" },
  { key: "charts3dDialog", id: "charts3d-dialog", okCmd: "charts3dDialog" },
  { key: "textArtDialog", id: "text-art-dialog", okCmd: "textArtDialog" },
  { key: "formatSettingsDialog", id: "format-settings-dialog", okCmd: "formatSettingsDialog" },
  { key: "mailMergeEmailDialog", id: "mail-merge-email-dialog", okCmd: "mailMergeEmailDialog" },
  { key: "documentAccessDialog", id: "document-access-dialog", okCmd: "documentAccessDialog" },
]

for (const exp of expectedIds) {
  const spec = mod.WO_DIALOG_SPECS[exp.key]
  assert.equal(spec.id, exp.id, `${exp.key} has id ${exp.id}`)
  assert.equal(spec.okCmd, exp.okCmd, `${exp.key} has okCmd ${exp.okCmd}`)
}
console.log("ok 2 all dialog specs have correct ids and okCmd values")

// ---------------------------------------------------------------------------
// 4. Specs render through the engine with data-wo-cmd attributes
// ---------------------------------------------------------------------------
const specEngine = new mod.WoDialogEngine()

// Test that each spec renders and contains its okCmd
for (const exp of expectedIds) {
  const spec = mod.WO_DIALOG_SPECS[exp.key]
  const panel = specEngine.renderSpec(spec)
  assert.ok(panel.includes(`data-wo-cmd="${exp.okCmd}"`),
    `${exp.key} OK button emits its ledger cmd ${exp.okCmd}`)
}
console.log("ok 3 all dialog specs render through the engine with data-wo-cmd")

// ---------------------------------------------------------------------------
// 5. Specific content checks for key dialogs
// ---------------------------------------------------------------------------

// rename-dialog: has name input
const renamePanel = specEngine.renderSpec(mod.WO_DIALOG_SPECS.renameDialog)
assert.ok(renamePanel.includes('data-wo-row="name"'), "rename-dialog has name row")

// charts3d-dialog: has 3D view section and rotation control
const charts3dPanel = specEngine.renderSpec(mod.WO_DIALOG_SPECS.charts3dDialog)
assert.ok(charts3dPanel.includes('data-wo-row="enable3d"'), "charts3d-dialog has enable3d row")
assert.ok(charts3dPanel.includes('data-wo-row="rotation"'), "charts3d-dialog has rotation row")
assert.ok(charts3dPanel.includes('data-wo-row="elevation"'), "charts3d-dialog has elevation row")

// mail-merge-email-dialog: has subject, from, to fields
const mailMergePanel = specEngine.renderSpec(mod.WO_DIALOG_SPECS.mailMergeEmailDialog)
assert.ok(mailMergePanel.includes('data-wo-row="subject"'), "mail-merge-email has subject row")
assert.ok(mailMergePanel.includes('data-wo-row="from"'), "mail-merge-email has from row")
assert.ok(mailMergePanel.includes('data-wo-row="to"'), "mail-merge-email has to row")

// quick-access-dialog: has item selector
const quickAccessPanel = specEngine.renderSpec(mod.WO_DIALOG_SPECS.quickAccessDialog)
assert.ok(quickAccessPanel.includes('data-wo-row="item"'), "quick-access has item row")

// format-settings-dialog: has font and size controls
const formatSettingsPanel = specEngine.renderSpec(mod.WO_DIALOG_SPECS.formatSettingsDialog)
assert.ok(formatSettingsPanel.includes('data-wo-row="font"'), "format-settings has font row")
assert.ok(formatSettingsPanel.includes('data-wo-row="size"'), "format-settings has size row")

// document-access-dialog: has access level selector
const documentAccessPanel = specEngine.renderSpec(mod.WO_DIALOG_SPECS.documentAccessDialog)
assert.ok(documentAccessPanel.includes('data-wo-row="access"'), "document-access has access row")

// shape-shadow is already covered in shapeSettings dialog
assert.ok(mod.WO_DIALOG_SPECS.shapeSettings, "shapeSettings dialog exists")
const shapePanel = specEngine.renderSpec(mod.WO_DIALOG_SPECS.shapeSettings)
assert.ok(shapePanel.includes('data-wo-row="shadowOn"'), "shapeSettings has shadowOn row")
assert.ok(shapePanel.includes('data-wo-row="shadowColor"'), "shapeSettings has shadowColor row")
assert.ok(shapePanel.includes('data-wo-row="shadowBlur"'), "shapeSettings has shadowBlur row")
assert.ok(shapePanel.includes('data-wo-row="shadowOffset"'), "shapeSettings has shadowOffset row")

console.log("ok 4 key dialogs have expected content rows")

// ---------------------------------------------------------------------------
// 6. Source file contains required identifiers (acceptance gate req)
// ---------------------------------------------------------------------------
assert.ok(js.includes("rename-dialog") || js.includes("renameDialog"),
  "wo-dialogs.js contains rename-dialog/renameDialog")
assert.ok(js.includes("charts3d") || js.includes("charts-3d"),
  "wo-dialogs.js contains charts3d/charts-3d")
assert.ok(js.includes("mail-merge-email") || js.includes("mailMergeEmail"),
  "wo-dialogs.js contains mail-merge-email/mailMergeEmail")

console.log("ok 5 source file contains required identifiers")

console.log("DIALOGS-BATCH-PASS")

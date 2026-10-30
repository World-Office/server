/**
 * WO-2-smartart: SmartArt button opens a menu (insert-pop) instead of a modal dialog.
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that:
 * - The SmartArt button (btn-smartart) exists in index.html
 * - The smartart-dialog is an insert-pop (non-modal) instead of dialog-overlay
 * - The smartart-dialog has aria-modal="false"
 * - editor.js no longer lists smartart-dialog in DIALOG_IDS
 * - The btn-smartart click handler calls anchorInsertPop instead of openDlg
 * - smartart-dialog is not in the list of modal dialogs in DIALOG_IDS
 *
 * Run with: node apps/web/apps/documenteditor-wysiwyg/smartart.test.mjs
 * Success: prints "smartart-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")

console.log("Running WO-2-smartart tests...\n")

// 1. SmartArt button exists
assert.ok(htmlSrc.includes('id="btn-smartart"'), "btn-smartart button must exist in index.html")

// 2. smartart-dialog uses insert-pop class (not dialog-overlay)
assert.ok(
  htmlSrc.includes('id="smartart-dialog" class="insert-pop"'),
  "smartart-dialog must have class insert-pop",
)

// 3. smartart-dialog has aria-modal="false"
assert.ok(
  htmlSrc.includes('id="smartart-dialog"') && htmlSrc.includes('aria-modal="false"'),
  'smartart-dialog must have aria-modal="false"',
)

// 4. smartart-dialog does NOT use dialog-overlay class
const smartartDialogMatch = htmlSrc.match(/id="smartart-dialog"[^>]*class="([^"]*)"/)
if (smartartDialogMatch) {
  const classes = smartartDialogMatch[1]
  assert.ok(
    !classes.includes("dialog-overlay"),
    "smartart-dialog must NOT have dialog-overlay class",
  )
}

// 5. DIALOG_IDS in editor.js does not include smartart-dialog
const dialogIdsMatch = editorSrc.match(/const DIALOG_IDS = \[(.*?)\]/s)
assert.ok(dialogIdsMatch, "DIALOG_IDS must exist in editor.js")
const dialogIdsContent = dialogIdsMatch[1]
assert.ok(
  !dialogIdsContent.includes("smartart-dialog"),
  "smartart-dialog must NOT be in DIALOG_IDS",
)

// 6. btn-smartart click handler calls anchorInsertPop
assert.ok(
  editorSrc.includes('btnSmartArt.addEventListener("click"') &&
    editorSrc.includes('anchorInsertPop("smartart-dialog", "btn-smartart")'),
  "btn-smartart click handler must call anchorInsertPop",
)

// 7. btn-smartart click handler does NOT call openDlg for smartart-dialog
const btnSmartArtSection = editorSrc.substring(
  editorSrc.indexOf("btnSmartArt.addEventListener"),
  editorSrc.indexOf("btnSmartArt.addEventListener") + 500,
)
assert.ok(
  !btnSmartArtSection.includes('openDlg("smartart-dialog")'),
  "btn-smartart click handler must NOT call openDlg with smartart-dialog",
)

// 8. Handler includes saveTableSelection and rememberFocus (like table insert)
assert.ok(
  btnSmartArtSection.includes("saveTableSelection()") &&
    btnSmartArtSection.includes("rememberFocus()"),
  "btn-smartart handler must call saveTableSelection and rememberFocus",
)

console.log("All WO-2-smartart assertions passed")
console.log("smartart-PASS")

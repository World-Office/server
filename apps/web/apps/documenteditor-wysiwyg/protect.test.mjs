/**
 * WO-19-protect: census-artifact (backstage tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-fileprotect is included in the interact census with
 * wo_id=btn-fileprotect, wo_cmd=protectDialog, and opens_wo='modal',
 * matching OnlyOffice parity (slugs:protect). The parity contract pins
 * token 'protect' (OO fm-btn-protect) to WO btn-fileprotect with a
 * dialog-visible assertion on #protect-dialog, so the census token is
 * opens:modal (not panel/menu).
 *
 * Run with: node protect.test.mjs
 * Success: prints "protect-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const cssPath = new URL("./style.css", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")
const cssSrc = readFileSync(cssPath, "utf-8")

console.log("Running WO-19-protect interact census tests...\n")

// The btn-fileprotect button must exist
assert.ok(
  htmlSrc.includes('id="btn-fileprotect"'),
  "btn-fileprotect button must exist in index.html",
)
console.log("ok 1 btn-fileprotect button exists")

// The btn-fileprotect must be wrapped in a census span; the parity contract
// (word-parity-contracts.json, token "protect") pins a dialog-visible
// assertion on #protect-dialog, so the interact kind is modal.
const btnFileProtectMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-fileprotect"[^>]*data-wo-cmd="protectDialog"[^>]*data-wo-interact="opens:modal"[^>]*>.*?id="btn-fileprotect"/s,
)
assert.ok(
  btnFileProtectMatch,
  'btn-fileprotect must be inside a span with data-wo-id="btn-fileprotect", data-wo-cmd="protectDialog" and data-wo-interact="opens:modal"',
)
console.log("ok 2 btn-fileprotect is in interact census with opens:modal")

// No stale/mis-typed census row: the span immediately wrapping btn-fileprotect
// must carry the modal token, never the panel or menu token.
const wrappingSpan = htmlSrc.match(/<span([^>]*)>\s*<button[^>]*id="btn-fileprotect"/)
assert.ok(wrappingSpan, "btn-fileprotect must be directly wrapped by a census span")
assert.ok(
  wrappingSpan[1].includes('data-wo-interact="opens:modal"'),
  "the census span wrapping btn-fileprotect must declare opens:modal",
)
assert.ok(
  !wrappingSpan[1].includes('data-wo-interact="opens:panel"') &&
    !wrappingSpan[1].includes('data-wo-interact="opens:menu"'),
  "the census span wrapping btn-fileprotect must not declare panel/menu",
)
console.log("ok 3 btn-fileprotect census row is not mis-declared as panel/menu")

// The btn-fileprotect must be inside the backstage overlay
const backstageMatch = htmlSrc.match(
  /<div id="backstage-overlay"[^>]*>.*?id="btn-fileprotect".*?<\/div>/s,
)
assert.ok(backstageMatch, "btn-fileprotect must be inside the backstage overlay")
console.log("ok 4 btn-fileprotect is in the backstage overlay")

// The btn-fileprotect must live in the protect pane view
const protectPaneMatch = htmlSrc.match(
  /<div[^>]*data-pane-view="protect"[^>]*>.*?id="btn-fileprotect".*?<\/div>/s,
)
assert.ok(protectPaneMatch, "btn-fileprotect must be in the protect pane view")
console.log("ok 5 btn-fileprotect is in the protect pane view")

// The nav row that lands on that pane must exist (OO fm-btn-protect parity)
assert.ok(
  htmlSrc.includes('class="backstage-row" data-pane="protect"'),
  "the backstage nav row for the protect pane must exist",
)
console.log("ok 6 backstage nav exposes the protect pane")

// The dialog the census token promises is real: #protect-dialog is a modal
// overlay hosting every sub-feature the contract pins.
const protectDialogMatch = htmlSrc.match(
  /<div id="protect-dialog" class="dialog-overlay" role="dialog" aria-modal="true"/,
)
assert.ok(protectDialogMatch, "#protect-dialog must be a modal dialog overlay")
for (const sub of ["protect-check-restrict", "protect-new-password", "btn-protect-apply"]) {
  assert.ok(htmlSrc.includes(`id="${sub}"`), `#protect-dialog must host #${sub}`)
}
console.log("ok 7 protect dialog exists with restrict/password/apply sub-features")

// editor.js must have the real (non-stub) dialog opener
assert.ok(
  editorSrc.includes("function protectDialog()"),
  "protectDialog function must exist in editor.js",
)
assert.ok(editorSrc.includes("closeProtectDialog"), "closeProtectDialog must exist in editor.js")
assert.ok(
  editorSrc.includes("confirmProtectDialog"),
  "confirmProtectDialog must exist in editor.js",
)
console.log("ok 8 protectDialog opener/closer/confirm exist in editor.js")

// The census wo_cmd must be an EXISTING verified command: "protectDialog" is
// dispatched by the same command bus the Protection ribbon uses.
assert.ok(
  editorSrc.includes('if (cmd === "protectDialog") { protectDialog(); return; }'),
  'the wo_cmd "protectDialog" must be dispatched by the command bus',
)
console.log("ok 9 wo_cmd protectDialog resolves to a real command")

// editor.js must wire btn-fileprotect click to protectDialog
assert.ok(
  editorSrc.includes('getElementById("btn-fileprotect")') &&
    editorSrc.includes(
      'fileProtectBtn.addEventListener("click", () => { closeAllMenus(); protectDialog(); })',
    ),
  "btn-fileprotect must have a click handler wired to protectDialog",
)
console.log("ok 10 btn-fileprotect click handler is wired to protectDialog")

// The dialog really opens/closes: classList "open" + .dialog-overlay.open CSS
assert.ok(
  editorSrc.includes('protectDialogEl.classList.add("open")') &&
    editorSrc.includes('protectDialogEl.classList.remove("open")'),
  "protectDialog must toggle the dialog-overlay open class",
)
assert.ok(cssSrc.includes(".dialog-overlay.open"), "dialog-overlay open styles must exist")
assert.ok(cssSrc.includes("#protect-dialog"), "protect dialog styles must exist")
console.log("ok 11 dialog open/close is real and styled")

// Apply/Cancel are wired; Esc closes the dialog (a11y parity for modals)
assert.ok(
  editorSrc.includes('getElementById("btn-protect-apply")') &&
    editorSrc.includes('btnProtectApply.addEventListener("click", confirmProtectDialog)'),
  "btn-protect-apply must call confirmProtectDialog",
)
assert.ok(
  editorSrc.includes('getElementById("btn-protect-cancel")') &&
    editorSrc.includes('btnProtectCancel.addEventListener("click", closeProtectDialog)'),
  "btn-protect-cancel must call closeProtectDialog",
)
assert.ok(
  /if \(ev\.key === "Escape" && protectDialogEl && protectDialogEl\.classList\.contains\("open"\)\)/.test(
    editorSrc,
  ),
  "Escape must close the protect dialog",
)
console.log("ok 12 apply/cancel/Esc are wired")

// The dialog is the UX for the real server-side gate (POST /api/documents/...)
assert.ok(
  editorSrc.includes('fetch(api("protect"), {') && editorSrc.includes("restrict_editing:"),
  "protectDialog apply must POST to the protect endpoint",
)
console.log("ok 13 protect dialog delegates to the server-side gate")

// i18n: Protect labels/pane/dialog copy must exist in BOTH locales
for (const key of [
  "Menu.Protect",
  "FileScreen.NavProtect",
  "FileScreen.TitleProtect",
  "FileScreen.DescProtect",
  "Prot.Title",
  "Prot.RestrictLabel",
  "Prot.NewPassword",
  "Prot.Apply",
]) {
  const count = i18nSrc.split(`"${key}"`).length - 1
  assert.ok(count >= 2, `${key} must be present in both en and de catalogs (found ${count})`)
}
console.log("ok 14 Protect i18n keys exist in both locales")

console.log("\nAll WO-19-protect interact census tests passed!\n")
console.log("protect-PASS")

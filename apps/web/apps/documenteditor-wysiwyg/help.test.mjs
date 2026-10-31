/**
 * WO-19-help: census-artifact (backstage tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-filehelp is included in the interact census with
 * wo_id=btn-filehelp, wo_cmd=btn-filehelp, and opens_wo='modal',
 * matching OnlyOffice parity (slugs:help). OO's Help & about control opens
 * the help-and-about modal overlay, so the census token is opens:modal
 * (not panel/menu); the wo_cmd is the existing btn-filehelp opener that
 * shows #help-dialog — no editor behavior change was needed.
 *
 * Run with: node help.test.mjs
 * Success: prints "help-PASS" and exits 0.
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

console.log("Running WO-19-help interact census tests...\n")

// The btn-filehelp button must exist (and only once — a duplicate id would
// break getElementById and silently drop the census row's control).
// The pattern is anchored with a leading space so the census span's
// data-wo-id="btn-filehelp" attribute is not counted as a second button.
const helpButtons = htmlSrc.split(' id="btn-filehelp"').length - 1
assert.ok(helpButtons >= 1, "btn-filehelp button must exist in index.html")
assert.ok(helpButtons === 1, `btn-filehelp id must be unique (found ${helpButtons})`)
console.log("ok 1 btn-filehelp button exists exactly once")

// The btn-filehelp must be wrapped in a census span; OO's Help & about
// control opens the help-and-about modal, so the interact kind is modal.
const btnFileHelpMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-filehelp"[^>]*data-wo-cmd="btn-filehelp"[^>]*data-wo-interact="opens:modal"[^>]*>.*?id="btn-filehelp"/s,
)
assert.ok(
  btnFileHelpMatch,
  'btn-filehelp must be inside a span with data-wo-id/data-wo-cmd="btn-filehelp" and data-wo-interact="opens:modal"',
)
console.log("ok 2 btn-filehelp is in interact census with opens:modal")

// No stale/mis-typed census row: the span immediately wrapping btn-filehelp
// must carry the modal token, never the panel or menu token.
const wrappingSpan = htmlSrc.match(/<span([^>]*)>\s*<button[^>]*id="btn-filehelp"/)
assert.ok(wrappingSpan, "btn-filehelp must be directly wrapped by a census span")
assert.ok(
  wrappingSpan[1].includes('data-wo-interact="opens:modal"'),
  "the census span wrapping btn-filehelp must declare opens:modal",
)
assert.ok(
  !wrappingSpan[1].includes('data-wo-interact="opens:panel"') &&
    !wrappingSpan[1].includes('data-wo-interact="opens:menu"'),
  "the census span wrapping btn-filehelp must not declare opens:panel or opens:menu",
)
console.log("ok 3 btn-filehelp census row is not mis-declared as panel/menu")

// The census row must be declared exactly once (no duplicate row either).
const censusRows = htmlSrc.split('data-wo-id="btn-filehelp"').length - 1
assert.ok(censusRows === 1, `exactly one census row for btn-filehelp (found ${censusRows})`)
console.log("ok 4 btn-filehelp census row is unique")

// The btn-filehelp must be inside the backstage overlay
const backstageMatch = htmlSrc.match(
  /<div id="backstage-overlay"[^>]*>.*?id="btn-filehelp".*?<\/div>/s,
)
assert.ok(backstageMatch, "btn-filehelp must be inside the backstage overlay")
console.log("ok 5 btn-filehelp is in the backstage overlay")

// The btn-filehelp must live in the help pane view (the Help & about panel)
const helpPaneMatch = htmlSrc.match(
  /<div[^>]*data-pane-view="help"[^>]*>.*?id="btn-filehelp".*?<\/div>/s,
)
assert.ok(helpPaneMatch, "btn-filehelp must be in the help pane view")
console.log("ok 6 btn-filehelp is in the help pane view")

// The nav row that lands on that pane must exist (OO fm-btn-help parity)
assert.ok(
  htmlSrc.includes('class="backstage-row" data-pane="help"'),
  "the backstage nav row for the help pane must exist",
)
console.log("ok 7 backstage nav exposes the help pane")

// The modal the census token promises is real: #help-dialog is a modal
// overlay (dialog-overlay + role=dialog + aria-modal) and hosts the about
// copy plus its Close control.
const helpDialogMatch = htmlSrc.match(
  /<div id="help-dialog" class="dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="help-dialog-title">/,
)
assert.ok(helpDialogMatch, "#help-dialog must be a modal dialog overlay")
assert.ok(
  htmlSrc.includes('id="help-dialog-title"'),
  "#help-dialog must be labelled by #help-dialog-title",
)
assert.ok(
  htmlSrc.includes('id="btn-help-close"'),
  "#help-dialog must host the #btn-help-close control",
)
assert.ok(
  htmlSrc.includes('data-i18n="Backstage.About"'),
  "#help-dialog must carry the Backstage.About about copy",
)
console.log("ok 8 help dialog exists as a modal with about copy and close")

// editor.js must wire btn-filehelp click to the existing openDlg opener
// (an existing verified dialog opener, not a stub).
assert.ok(
  editorSrc.includes('const btnFileHelp = document.getElementById("btn-filehelp");'),
  "btnFileHelp lookup must exist in editor.js",
)
assert.ok(
  editorSrc.includes(
    'if (btnFileHelp) btnFileHelp.addEventListener("click", () => { closeAllMenus(); openDlg("help-dialog"); });',
  ),
  'btn-filehelp click handler must be wired to openDlg("help-dialog")',
)
console.log("ok 9 btn-filehelp click handler is wired to the real opener")

// The opener/closer pair is real: openDlg/closeDlg toggle the .open class
// that .dialog-overlay.open actually styles.
assert.ok(
  editorSrc.includes(
    'function openDlg(id) { const d = document.getElementById(id); if (d) d.classList.add("open"); }',
  ),
  "openDlg must add the open class to the dialog element",
)
assert.ok(
  editorSrc.includes(
    'function closeDlg(id) { const d = document.getElementById(id); if (d) d.classList.remove("open"); restoreFocus(); }',
  ),
  "closeDlg must remove the open class and restore focus",
)
assert.ok(cssSrc.includes(".dialog-overlay.open"), "dialog-overlay open styles must exist")
console.log("ok 10 dialog open/close is real and styled")

// btn-help-close must be wired to the same closer
assert.ok(
  editorSrc.includes('const btnHelpClose = document.getElementById("btn-help-close");'),
  "btnHelpClose lookup must exist in editor.js",
)
assert.ok(
  editorSrc.includes(
    'if (btnHelpClose) btnHelpClose.addEventListener("click", () => closeDlg("help-dialog"));',
  ),
  'btn-help-close must be wired to closeDlg("help-dialog")',
)
console.log("ok 11 btn-help-close is wired to closeDlg")

// A11y parity for modals: help-dialog is registered in DIALOG_IDS so the
// generic Esc handler (DIALOG_CLOSE fallback -> closeDlg) and the modal Tab
// trap see it.
assert.ok(
  /const DIALOG_IDS = \[[^\]]*"(?:[a-z-]+", )*"help-dialog"/.test(editorSrc),
  "help-dialog must be listed in DIALOG_IDS",
)
assert.ok(
  editorSrc.includes("if (closer) closer();") && editorSrc.includes("else closeDlg(dialog.id);"),
  "the generic Esc handler must fall back to closeDlg for help-dialog",
)
assert.ok(
  editorSrc.includes('if (ev.key !== "Tab") return;'),
  "the modal Tab trap must exist for open dialogs",
)
console.log("ok 12 help-dialog participates in Esc + Tab modal handling")

// The help pane itself hosts the real content the census row sits beside:
// the shortcut table (mirroring editor.js bindings) and the about line.
for (const key of ["s", "z", "b", "f", "h", "wheel"]) {
  assert.ok(
    new RegExp(`data-key="${key}"`).test(htmlSrc),
    `the backstage shortcut table must pin the "${key}" binding`,
  )
}
assert.ok(
  htmlSrc.includes('id="backstage-shortcuts"') && htmlSrc.includes('id="backstage-about"'),
  "the help pane must host the shortcut table and about line",
)
console.log("ok 13 help pane hosts the shortcut table and about line")

// i18n: Help labels/pane/dialog copy must exist in BOTH locales
for (const key of [
  "Menu.Help",
  "FileScreen.NavHelp",
  "FileScreen.TitleHelp",
  "FileScreen.DescHelp",
  "FileScreen.About",
  "Backstage.Help",
  "Backstage.About",
  "Dialog.Close",
]) {
  const count = i18nSrc.split(`"${key}"`).length - 1
  assert.ok(count >= 2, `${key} must be present in both en and de catalogs (found ${count})`)
}
console.log("ok 14 Help i18n keys exist in both locales")

console.log("\nAll WO-19-help interact census tests passed!\n")
console.log("help-PASS")

/**
 * WO-22-shortcut-opencommentfield: OO Alt+Meta+A opens the comment field (L0, real)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that editor.js binds Alt+Meta+A (Mac: Opt+Cmd+A) in the C1
 * keydown parity Alt-combo section to openCommentDialog() — the existing
 * comment-field/insert-comment dialog opener (real, not a stub). Also
 * verifies the binding excludes Ctrl, covers a/A case-insensitively, and
 * that the backstage Help shortcut surface advertises the combo with a
 * matching i18n key in both locale catalogs.
 *
 * Run with: node apps/web/apps/documenteditor-wysiwyg/shortcut-opencommentfield.test.mjs
 * Success: prints "shortcut-opencommentfield-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorSrc = readFileSync(new URL("./editor.js", import.meta.url), "utf-8")
const htmlSrc = readFileSync(new URL("./index.html", import.meta.url), "utf-8")
const i18nSrc = readFileSync(new URL("./i18n.js", import.meta.url), "utf-8")

console.log("Running WO-22-shortcut-opencommentfield tests...\n")

// --- The C1 shortcut parity block must exist ---------------------------
const c1Start = editorSrc.indexOf("// C1 SHORTCUT PARITY (OO shortcut census")
assert.notEqual(c1Start, -1, "C1 SHORTCUT PARITY block must exist in editor.js")
const c1End = editorSrc.indexOf("// Function keys (no ctrl required)", c1Start)
assert.ok(c1End > c1Start, "C1 block boundaries must be locatable")
const c1 = editorSrc.slice(c1Start, c1End)

// --- The Alt-combo section (before the !altKey guard) must exist -------
// OO's Alt+Meta combos live in the (ctrl||meta)&&alt sub-block, which runs
// before the guarded ctrl/!altKey handler that would swallow Alt-combos.
const altBlock = c1.indexOf("if ((ev.ctrlKey || ev.metaKey) && ev.altKey) {")
assert.ok(altBlock !== -1, "C1 must contain the (ctrl||meta) && alt Alt-combo block")

// --- The Alt+Meta+A binding itself -------------------------------------
const aIdx = c1.indexOf('!ev.ctrlKey && k === "a"', altBlock)
assert.ok(
  aIdx > altBlock,
  'Alt+Meta+A must be bound as !ev.ctrlKey && k === "a" inside the Alt-combo block',
)
assert.ok(
  editorSrc.includes("const k = ev.key.toLowerCase()"),
  "binding must lower-case the key so both a and A are covered",
)

const aLineEnd = c1.indexOf("\n", aIdx)
const aBinding = c1.slice(aIdx, aLineEnd === -1 ? c1.length : aLineEnd)
assert.ok(aBinding.includes("ev.preventDefault()"), "Alt+Meta+A must preventDefault()")
assert.ok(aBinding.includes("openCommentDialog()"), "Alt+Meta+A must call openCommentDialog()")
assert.ok(aBinding.includes("return"), "Alt+Meta+A handler must return after handling")

// The combo is Meta+Alt only: the !ev.ctrlKey guard must sit in the same
// Alt-combo block (which already requires ctrl||meta && alt), so the
// effective condition is meta && alt && !ctrl.
assert.ok(
  c1.includes("!ev.ctrlKey"),
  "binding must exclude Ctrl so only Meta (Cmd/Opt) + Alt matches",
)

// --- openCommentDialog must be a real, existing dialog opener ----------
assert.ok(
  editorSrc.includes("function openCommentDialog() {"),
  "openCommentDialog must be an existing function (not a stub)",
)
const dialogFnStart = editorSrc.indexOf("function openCommentDialog() {")
const dialogFn = editorSrc.slice(dialogFnStart, dialogFnStart + 500)
assert.ok(
  dialogFn.includes('getElementById("comment-dialog")'),
  "opener targets the comment-dialog",
)
assert.ok(dialogFn.includes('classList.add("open")'), "opener really opens the dialog")
assert.ok(dialogFn.includes("READ_ONLY"), "opener honors read-only mode")

// The insert-comment command reuses the same opener, wiring the command
// bus to the dialog (no separate stub path).
assert.ok(
  editorSrc.includes('if (cmd === "insertComment") { openCommentDialog(); return; }'),
  "insertComment command must route to openCommentDialog()",
)

// --- The help surface advertises the combo with i18n -------------------
assert.ok(htmlSrc.includes('id="backstage-shortcuts"'), "#backstage-shortcuts help row exists")
assert.ok(
  htmlSrc.includes('data-key="a"') &&
    htmlSrc.includes("<kbd>Alt</kbd>+<kbd>Meta</kbd>+<kbd>A</kbd>"),
  "backstage Help must list the Alt+Meta+A combo",
)
assert.ok(
  htmlSrc.includes("FileScreen.ShortcutComment"),
  "help row must use the FileScreen.ShortcutComment i18n key",
)
const i18nCount = i18nSrc.split('"FileScreen.ShortcutComment"').length - 1
assert.ok(i18nCount >= 2, "FileScreen.ShortcutComment must be present in both en and de catalogs")

console.log("ok C1 Alt-combo block present before the !altKey guard")
console.log('ok Alt+Meta+A binds !ev.ctrlKey && k === "a" with preventDefault()')
console.log("ok handler calls openCommentDialog() and returns")
console.log("ok openCommentDialog is a real dialog opener (comment-dialog, READ_ONLY-aware)")
console.log("ok insertComment command routes to the same opener")
console.log("ok backstage Help lists Alt+Meta+A with FileScreen.ShortcutComment in both locales")
console.log("\nshortcut-opencommentfield-PASS")

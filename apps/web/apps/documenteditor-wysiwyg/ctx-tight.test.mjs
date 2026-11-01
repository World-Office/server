/**
 * WO-21-ctx-tight: OO wrap "Optimal / Tight" (L0, real).
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * OO "Optimal (tight)" wraps text closely around the shape contour. WO
 * placeholder objects are rectangular (no vector contour) and OO itself
 * aliases tight to square for rectangles, so the honest web equivalent IS
 * the existing obj-square flow — recorded through data-wrap="tight".
 *
 * Asserts the parity contract:
 *   (1) the ctx menu gains a real "Tight" row: data-ctx="WrapTight" with
 *       data-showif="object", localized via Ctx.WrapTight, sitting beside
 *       the sibling wrap rows,
 *   (2) the ctx dispatcher wires the row to the EXISTING applyObjectOp
 *       command (no stub / no no-op handler) and re-syncs the right panel,
 *   (3) applyObjectOp accepts "wrap-tight", applies the obj-square class
 *       (tight==square for rectangular placeholders) and records the
 *       explicit user choice through data-wrap="tight", while the align
 *       branch drops the marker so it can never lie about the wrap,
 *   (4) every wrap-enumerating surface offers the value: Layout > Wrapping
 *       menu, chart Wrapping menu, right-panel image/chart wrap selects,
 *       object-layout popup,
 *   (5) the right-panel sync reads the data-wrap marker FIRST so an
 *       explicit tight choice round-trips back as "wrap-tight",
 *   (6) the aliasing is documented in a code comment (tight==square until
 *       a real vector contour exists),
 *   (7) i18n catalogs (en + de) carry the new labels.
 *
 * Run with: node apps/web/apps/documenteditor-wysiwyg/ctx-tight.test.mjs
 * Success: prints "ctx-tight-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorSrc = readFileSync(new URL("./editor.js", import.meta.url), "utf-8")
const htmlSrc = readFileSync(new URL("./index.html", import.meta.url), "utf-8")
const i18nSrc = readFileSync(new URL("./i18n.js", import.meta.url), "utf-8")

console.log("Running WO-21-ctx-tight tests...\n")

// ━━━━━━━━━━━━━ (1) context menu row ━━━━━━━━━━━━━

const tightRow = htmlSrc.match(/<button[^>]*data-ctx="WrapTight"[^>]*>/)
assert.ok(tightRow, 'index.html: a data-ctx="WrapTight" row must exist')
assert.ok(
  /data-showif="object"/.test(tightRow[0]),
  'index.html: the WrapTight row must carry data-showif="object"',
)
assert.ok(
  /data-i18n="Ctx\.WrapTight"/.test(tightRow[0]),
  'index.html: the WrapTight row must be localized via data-i18n="Ctx.WrapTight"',
)
assert.ok(
  /data-ctx="WrapSquare"[\s\S]{0,600}?data-ctx="WrapTight"[\s\S]{0,200}?data-ctx="WrapBehind"/.test(
    htmlSrc,
  ),
  "index.html: the WrapTight row must sit in the OO wrap order (square → tight → behind)",
)
console.log('ok 1 ctx row data-ctx="WrapTight" (data-showif="object") exists')

// ━━━━━━━━━━━━━ (2) dispatcher arm — real command, no stub ━━━━━━━━━━━━━

const dispatcherStart = editorSrc.indexOf('ctxMenu.addEventListener("click", (e) => {')
assert.notEqual(dispatcherStart, -1, "editor.js: the ctx-menu click dispatcher must exist")
const dispatcherSrc = editorSrc.slice(dispatcherStart, dispatcherStart + 40000)
assert.ok(
  dispatcherSrc.includes('action === "WrapTight"'),
  'editor.js: the ctx dispatcher must handle action "WrapTight"',
)
const tightArm = dispatcherSrc.slice(
  dispatcherSrc.indexOf('action === "WrapTight"'),
  dispatcherSrc.indexOf("} else if", dispatcherSrc.indexOf('action === "WrapTight"') + 1),
)
assert.ok(
  /action === "WrapTight"\)\s*\{\s*closeCtx\(\);\s*applyObjectOp\("wrap-tight"\);\s*syncRightPanelControls\(\);/.test(
    tightArm,
  ),
  'editor.js: WrapTight must close the menu and run the existing applyObjectOp("wrap-tight")',
)
assert.ok(
  !/\bconsole\.log\(/.test(tightArm),
  "editor.js: the WrapTight arm must not be a console.log stub",
)
assert.ok(
  !/TODO|FIXME|not implemented/i.test(tightArm),
  "editor.js: the WrapTight arm must not be a TODO/no-op placeholder",
)
console.log('ok 2 dispatcher routes "WrapTight" to applyObjectOp("wrap-tight")')

// ━━━━━━━━━━━━━ (3) applyObjectOp: obj-square + data-wrap="tight" ━━━━━━━

const wrapBranchStart = editorSrc.indexOf('value === "wrap-inline" || value === "wrap-square"')
assert.notEqual(wrapBranchStart, -1, "editor.js: the applyObjectOp wrap branch must exist")
const wrapBranch = editorSrc.slice(wrapBranchStart, wrapBranchStart + 1400)
assert.ok(
  wrapBranch.includes('value === "wrap-tight"'),
  'editor.js: the wrap branch must accept the "wrap-tight" value',
)
// tight maps onto the obj-square class (same branch as wrap-square)
assert.ok(
  /value === "wrap-square" \|\| value === "wrap-tight" \? "obj-square"/.test(wrapBranch),
  "editor.js: wrap-tight must apply the obj-square class",
)
// the explicit user choice is recorded as data-wrap="tight"
assert.ok(
  wrapBranch.includes('obj.setAttribute("data-wrap", value.slice(5))'),
  'editor.js: the wrap branch must set the data-wrap marker (value.slice(5) => "tight")',
)
// sibling layout classes are still stripped first
assert.ok(
  wrapBranch.includes("OBJ_LAYOUT_CLASSES.forEach((c) => obj.classList.remove(c))"),
  "editor.js: the wrap branch must strip sibling layout classes",
)
// a later align switch must not leave a stale tight marker behind
const alignBranch = editorSrc.slice(
  editorSrc.indexOf("/^align-/"),
  editorSrc.indexOf('value === "group"'),
)
assert.ok(alignBranch, "editor.js: the align branch must exist")
assert.ok(
  alignBranch.includes('obj.removeAttribute("data-wrap")'),
  "editor.js: the align branch must drop the data-wrap marker",
)
// mutating ops finalize through the verified dirty chain
const applyObjectOpSrc = editorSrc.slice(
  editorSrc.indexOf("function applyObjectOp("),
  editorSrc.indexOf(
    "// --- insert table of contents",
    editorSrc.indexOf("function applyObjectOp("),
  ),
)
for (const sink of [
  "captureHistory()",
  "markDirty()",
  "scheduleCollabSync()",
  'notifyHost("editing")',
]) {
  assert.ok(
    applyObjectOpSrc.includes(sink),
    `editor.js: applyObjectOp must finalize through ${sink}`,
  )
}
console.log('ok 3 applyObjectOp("wrap-tight") => obj-square + data-wrap="tight" + dirty chain')

// ━━━━━━━━━━━━━ (4) wrap-enumerating surfaces ━━━━━━━━━━━━━

const menuTightRows = htmlSrc.match(/data-cmd="objectOp" data-value="wrap-tight"/g) || []
assert.ok(
  menuTightRows.length >= 2,
  `index.html: both wrapping menus (Layout + chart) must offer wrap-tight (found ${menuTightRows.length})`,
)
assert.ok(
  htmlSrc.includes('data-value="wrap-tight" data-i18n="Layout.Wrapping.Tight"'),
  "index.html: menu rows must use the Layout.Wrapping.Tight label key",
)
for (const selId of ["rp-image-wrap", "rp-chart-wrap"]) {
  const sel = htmlSrc.match(new RegExp(`<select id="${selId}">[\\s\\S]*?</select>`))
  assert.ok(sel, `index.html: ${selId} select must exist`)
  assert.ok(
    sel[0].includes('value="wrap-tight"'),
    `index.html: ${selId} must offer a wrap-tight option`,
  )
}
assert.ok(
  htmlSrc.includes('id="btn-wrap-tight"') && htmlSrc.includes('data-objwrap="tight"'),
  "index.html: object-layout popup must have a Tight wrap button",
)
console.log("ok 4 ctx + Layout menu + chart menu + right panel + popup offer Tight")

// ━━━━━━━━━━━━━ (5) right-panel round-trip reads the marker first ━━━━━━━

for (const [selId, subject] of [
  ["rp-image-wrap", "obj"],
  ["rp-chart-wrap", "img"],
]) {
  const syncAt = editorSrc.indexOf(`document.getElementById("${selId}")`)
  assert.notEqual(syncAt, -1, `editor.js: the ${selId} sync must exist`)
  const syncBody = editorSrc.slice(syncAt, syncAt + 700)
  assert.ok(
    syncBody.includes(`${subject}.getAttribute("data-wrap") === "tight" ? "wrap-tight"`) &&
      syncBody.indexOf('getAttribute("data-wrap")') <
        syncBody.indexOf(`${subject}.classList.contains("obj-square")`),
    `editor.js: ${selId} must check the data-wrap marker BEFORE the obj-square class`,
  )
}
console.log("ok 5 right-panel selects round-trip data-wrap=tight as wrap-tight")

// ━━━━━━━━━━━━━ (6) honest aliasing is documented ━━━━━━━━━━━━━

assert.ok(
  /WO-21-ctx-tight[\s\S]{0,600}tight==square[\s\S]{0,300}vector contour/i.test(editorSrc),
  "editor.js: the tight==square aliasing must be documented until a real vector contour exists",
)
assert.ok(
  /WO-21-ctx-tight[\s\S]{0,300}no vector contour[\s\S]{0,200}aliases tight to square/i.test(
    htmlSrc,
  ),
  "index.html: the ctx row must document the tight==square aliasing",
)
console.log("ok 6 tight==square documented (no vector contour yet)")

// ━━━━━━━━━━━━━ (7) i18n (en + de) ━━━━━━━━━━━━━

const i18nExpect = {
  "Ctx.WrapTight": ["Tight", "Eng"],
  "RightPanel.WrapTight": ["Tight", "Eng"],
  "Layout.Wrapping.Tight": ["Tight", "Eng"],
}
for (const [key, [en, de]] of Object.entries(i18nExpect)) {
  assert.ok(i18nSrc.includes(`"${key}": "${en}"`), `i18n: ${key} English string must exist`)
  assert.ok(i18nSrc.includes(`"${key}": "${de}"`), `i18n: ${key} German translation must exist`)
}
console.log("ok 7 i18n keys exist in en + de")

console.log("All WO-21-ctx-tight tests passed!\n")
console.log("ctx-tight-PASS")

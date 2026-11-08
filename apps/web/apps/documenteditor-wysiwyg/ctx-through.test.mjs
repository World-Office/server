/**
 * WO-21-ctx-through: OO wrap "Through" (L0, real).
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the wrap set gains a real "Through" entry:
 *   - ctx row data-ctx="WrapThrough" (shown for objects, i18n-backed,
 *     wired to the existing applyObjectOp("wrap-through") command — no
 *     stub/no-op handler),
 *   - OBJ_LAYOUT_CLASSES gains "obj-through" and the wrap branch maps the
 *     new wrap-through value onto it (clearing sibling layout classes),
 *   - every surface that enumerates wrap values (Layout > Wrapping menu,
 *     chart Wrapping menu, right-panel image/chart wrapping selects,
 *     object-layout popup) offers the new value,
 *   - style.css layers obj-through ABOVE the text (same absolute layering
 *     as obj-front: float:none + z-index) but keeps the box background
 *     transparent so the text visually crosses an unfilled shape,
 *   - honest caveat: web text cannot flow "through" a box — OO's Through
 *     is approximated as an above-text transparent layer,
 *   - i18n catalogs (en + de) carry the new labels.
 *
 * Run with: node apps/web/apps/documenteditor-wysiwyg/ctx-through.test.mjs
 * Success: prints "ctx-through-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorSrc = readFileSync(new URL("./editor.js", import.meta.url), "utf-8")
const htmlSrc = readFileSync(new URL("./index.html", import.meta.url), "utf-8")
const cssSrc = readFileSync(new URL("./style.css", import.meta.url), "utf-8")
const i18nSrc = readFileSync(new URL("./i18n.js", import.meta.url), "utf-8")

console.log("Running WO-21-ctx-through tests...\n")

// ━━━━━━━━━━━━━ context menu row ━━━━━━━━━━━━━

// The ctx menu must have a WrapThrough row beside WrapFront
assert.ok(
  htmlSrc.includes('data-ctx="WrapThrough"'),
  'index.html: WrapThrough context menu row must exist with data-ctx="WrapThrough"',
)
assert.ok(
  /data-ctx="WrapFront"[\s\S]{0,500}?data-ctx="WrapThrough"/.test(htmlSrc),
  "index.html: WrapThrough row must sit beside the WrapFront row",
)
// Row shows only for objects (same visibility rule as the sibling wrap rows)
assert.ok(
  htmlSrc.includes('data-ctx="WrapThrough" data-showif="object"'),
  'index.html: WrapThrough must carry data-showif="object"',
)
// Row is localized like its siblings
assert.ok(
  htmlSrc.includes('data-ctx="WrapThrough"') && htmlSrc.includes('data-i18n="Ctx.WrapThrough"'),
  'index.html: WrapThrough must reference data-i18n="Ctx.WrapThrough"',
)

// ━━━━━━━━━━━━━ editor.js wrap machinery ━━━━━━━━━━━━━

// OBJ_LAYOUT_CLASSES must include the new obj-through entry so every
// wrap/align switch strips it like the other layout classes
assert.ok(
  editorSrc.includes(
    'const OBJ_LAYOUT_CLASSES = ["obj-inline", "obj-square", "obj-right", "obj-behind", "obj-front", "obj-through", "obj-center"];',
  ),
  'editor.js: OBJ_LAYOUT_CLASSES must include "obj-through"',
)

// The applyObjectOp wrap branch must accept the wrap-through value.
// REALIGNED (L2O-06): the old gate matched the branch tail verbatim
// (`… "wrap-front" || value === "wrap-through")`); L2M-03 appended the
// wrap-top-and-bottom entry after wrap-through, so the literal went stale while
// the accepted-value set only grew. Assert the value inside the real wrap
// branch (head of branch → its closing `} else if`) instead.
const throughBranchStart = editorSrc.indexOf('value === "wrap-inline" || value === "wrap-square"')
assert.notEqual(throughBranchStart, -1, "editor.js: the applyObjectOp wrap branch must exist")
const throughBranch = editorSrc.slice(throughBranchStart, editorSrc.indexOf("} else if", throughBranchStart))
assert.ok(throughBranch.length > 0, "editor.js: the applyObjectOp wrap branch must be closed")
assert.ok(
  /value === "wrap-through"/.test(throughBranch),
  'editor.js: applyObjectOp wrap branch must accept "wrap-through"',
)
// ...and map it onto the obj-through class (via the same classList.add chain)
assert.ok(
  /value === "wrap-through" \? "obj-through"/.test(throughBranch),
  'editor.js: wrap-through must add the "obj-through" layout class',
)
// sibling layout classes are still stripped first
assert.ok(
  editorSrc.includes("OBJ_LAYOUT_CLASSES.forEach((c) => obj.classList.remove(c))"),
  "editor.js: the wrap branch must strip sibling layout classes",
)

// The ctx action must be wired to the existing applyObjectOp command (no stub)
assert.ok(
  editorSrc.includes('action === "WrapThrough"'),
  "editor.js: WrapThrough ctx menu handler must exist",
)
assert.ok(
  /action === "WrapThrough"\)\s*\{\s*closeCtx\(\);\s*applyObjectOp\("wrap-through"\);\s*syncRightPanelControls\(\);/.test(
    editorSrc,
  ),
  'editor.js: WrapThrough handler must close the menu and run applyObjectOp("wrap-through")',
)
const throughArm = editorSrc.slice(
  editorSrc.indexOf('action === "WrapThrough"'),
  editorSrc.indexOf("} else if", editorSrc.indexOf('action === "WrapThrough"') + 1),
)
assert.ok(
  !/\bconsole\.log\(/.test(throughArm),
  "editor.js: the WrapThrough arm must not be a console.log stub",
)
assert.ok(
  !/TODO|FIXME|not implemented|no-op/i.test(throughArm),
  "editor.js: the WrapThrough arm must not be a TODO/no-op placeholder",
)

// Right-panel wrap selects must round-trip the new class back to wrap-through
assert.ok(
  editorSrc.includes('obj.classList.contains("obj-through") ? "wrap-through"'),
  "editor.js: image panel sync must map obj-through back to wrap-through",
)
assert.ok(
  editorSrc.includes('img.classList.contains("obj-through") ? "wrap-through"'),
  "editor.js: chart panel sync must map obj-through back to wrap-through",
)

// Object-layout popup (Insert tools): the wrap row must handle "through"
assert.ok(
  editorSrc.includes('else if (value === "through") floatImg.classList.add("obj-through");'),
  'editor.js: applyObjLayout must map the popup "through" value to obj-through',
)
assert.ok(
  editorSrc.includes(
    'floatImg.classList.remove("obj-inline", "obj-square", "obj-right", "obj-behind", "obj-front", "obj-through", "obj-center");',
  ),
  "editor.js: applyObjLayout must strip obj-through when switching wrap/align",
)

// ━━━━━━━━━━━━━ wrap-enumerating surfaces ━━━━━━━━━━━━━

// Layout > Wrapping menu and the chart Wrapping menu route through objectOp
const menuThroughRows = htmlSrc.match(/data-cmd="objectOp" data-value="wrap-through"/g) || []
assert.ok(
  menuThroughRows.length >= 2,
  `index.html: both wrapping menus must offer wrap-through (found ${menuThroughRows.length})`,
)
assert.ok(
  htmlSrc.includes('data-value="wrap-through" data-i18n="Layout.Wrapping.Through"'),
  "index.html: menu rows must use the Layout.Wrapping.Through label key",
)
// Right-panel image + chart wrapping selects must expose the option
assert.ok(
  /<select id="rp-image-wrap">[\s\S]*?value="wrap-through"/.test(htmlSrc),
  "index.html: rp-image-wrap select must offer wrap-through",
)
assert.ok(
  /<select id="rp-chart-wrap">[\s\S]*?value="wrap-through"/.test(htmlSrc),
  "index.html: rp-chart-wrap select must offer wrap-through",
)
assert.ok(
  htmlSrc.includes('id="btn-wrap-through"') && htmlSrc.includes('data-objwrap="through"'),
  "index.html: object-layout popup must have a Through wrap button",
)

// ━━━━━━━━━━━━━ honest rendering (CSS) ━━━━━━━━━━━━━

// obj-through must detach from the text flow and layer ABOVE the text —
// exactly like obj-front (float:none, z-index above the page text), but
// with a transparent box so the text visually crosses the unfilled shape.
assert.ok(cssSrc.includes("#editor img.obj-through"), "style.css: obj-through rule must exist")
const throughRule = cssSrc.match(
  /#editor img\.obj-through,\s*#editor div\.object\.obj-through \{[^}]*\}/,
)
assert.ok(throughRule, "style.css: obj-through rule must be parseable")
assert.ok(
  throughRule[0].includes("float: none"),
  "style.css: obj-through must not float (text does not reflow around it)",
)
assert.ok(
  throughRule[0].includes("z-index: 1"),
  "style.css: obj-through must stack above the page text (z-index: 1)",
)
assert.ok(
  throughRule[0].includes("background: transparent"),
  "style.css: obj-through must keep a transparent box so the text crosses it",
)
assert.ok(
  /#editor img\.obj-front \{[^}]*z-index: 1/.test(cssSrc),
  "style.css: obj-front must keep the same above-text stacking (layering parity)",
)
// The honest-behavior comment must be documented in the sources
assert.ok(
  /WO-21-ctx-through[\s\S]{0,600}web text cannot flow "through"|WO-21-ctx-through[\s\S]{0,600}above-text transparent layer/i.test(
    cssSrc,
  ),
  "style.css: honest rendering behavior must be documented in a comment",
)
assert.ok(
  /WO-21-ctx-through[\s\S]{0,600}web text cannot flow "through"|WO-21-ctx-through[\s\S]{0,600}above-text transparent layer/i.test(
    editorSrc,
  ),
  "editor.js: honest rendering behavior must be documented in a comment",
)

// ━━━━━━━━━━━━━ i18n (en + de) ━━━━━━━━━━━━━

const i18nExpect = {
  "Ctx.WrapThrough": ["Through", "Durchgehend"],
  "RightPanel.WrapThrough": ["Through", "Durchgehend"],
  "Layout.Wrapping.Through": ["Through", "Durchgehend"],
}
for (const [key, [en, de]] of Object.entries(i18nExpect)) {
  assert.ok(i18nSrc.includes(`"${key}": "${en}"`), `i18n: ${key} English string must exist`)
  assert.ok(i18nSrc.includes(`"${key}": "${de}"`), `i18n: ${key} German translation must exist`)
}

console.log("All WO-21-ctx-through tests passed!\n")
console.log("ctx-through-PASS")

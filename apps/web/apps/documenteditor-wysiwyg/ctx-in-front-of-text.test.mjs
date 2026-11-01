/**
 * WO-21-ctx-in-front-of-text: OO wrap "In front of text" (L0, real).
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the wrap set gains a real "In front of text" entry:
 *   - ctx row data-ctx="WrapFront" (shown for objects, i18n-backed, wired
 *     to the existing applyObjectOp("wrap-front") command — no stub),
 *   - OBJ_LAYOUT_CLASSES gains "obj-front" and the wrap branch maps the
 *     new wrap-front value onto it (clearing sibling layout classes),
 *   - every surface that enumerates wrap values (Layout > Wrapping menu,
 *     chart Wrapping menu, right-panel image/chart wrapping selects,
 *     object-layout popup) offers the new value,
 *   - style.css layers obj-front ABOVE the text by z-index (honest
 *     rendering: web text does not reflow around it — same detachment as
 *     obj-behind, opposite stacking direction),
 *   - i18n catalogs (en + de) carry the new labels.
 *
 * Run with: node ctx-in-front-of-text.test.mjs
 * Success: prints "ctx-in-front-of-text-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorSrc = readFileSync(new URL("./editor.js", import.meta.url), "utf-8")
const htmlSrc = readFileSync(new URL("./index.html", import.meta.url), "utf-8")
const cssSrc = readFileSync(new URL("./style.css", import.meta.url), "utf-8")
const i18nSrc = readFileSync(new URL("./i18n.js", import.meta.url), "utf-8")

console.log("Running WO-21-ctx-in-front-of-text tests...\n")

// ━━━━━━━━━━━━━ context menu row ━━━━━━━━━━━━━

// The ctx menu must have a WrapFront row beside WrapInline/WrapSquare/WrapBehind
assert.ok(
  htmlSrc.includes('data-ctx="WrapFront"'),
  'index.html: WrapFront context menu row must exist with data-ctx="WrapFront"',
)
assert.ok(
  /data-ctx="WrapBehind"[^\n]*\n[^\n]*data-ctx="WrapFront"/.test(htmlSrc),
  "index.html: WrapFront row must sit beside the WrapBehind row",
)
// Row shows only for objects (same visibility rule as the sibling wrap rows)
assert.ok(
  htmlSrc.includes('data-ctx="WrapFront" data-showif="object"'),
  'index.html: WrapFront must carry data-showif="object"',
)
// Row is localized like its siblings
assert.ok(
  htmlSrc.includes('data-ctx="WrapFront"') && htmlSrc.includes('data-i18n="Ctx.WrapFront"'),
  'index.html: WrapFront must reference data-i18n="Ctx.WrapFront"',
)

// ━━━━━━━━━━━━━ editor.js wrap machinery ━━━━━━━━━━━━━

// OBJ_LAYOUT_CLASSES must include the new obj-front entry so every wrap/align
// switch strips it like the other layout classes. (Parallel merges may add
// further layout classes such as obj-through, so pin the line by prefix and
// require obj-front within it rather than an exact whole-line match.)
const layoutLine = editorSrc
  .split("\n")
  .find((l) => l.includes("const OBJ_LAYOUT_CLASSES ="))
assert.ok(
  !!layoutLine && layoutLine.includes('"obj-front"'),
  'editor.js: OBJ_LAYOUT_CLASSES must include "obj-front"',
)

// The applyObjectOp wrap branch must accept the wrap-front value
// (siblings wrap-tight/wrap-through may reorder the OR chain — pin by line
// and require wrap-front, not an exact whole-branch match).
const wrapBranchLine = editorSrc
  .split("\n")
  .find((l) => l.includes("wrap-front") && l.includes("||"))
assert.ok(
  !!wrapBranchLine && wrapBranchLine.includes('value === "wrap-front"'),
  'editor.js: applyObjectOp wrap branch must accept "wrap-front"',
)
// ...and map it onto the obj-front class (via the same classList.add chain);
// the ternary grew wrap-tight/wrap-through siblings — pin this mapping line
// by prefix and require the front arm rather than an exact whole-line match.
assert.ok(
  editorSrc
    .split("\n")
    .some((l) => l.trim().startsWith(': value === "wrap-front"') && l.includes('"obj-front"')),
  'editor.js: wrap-front must add the "obj-front" layout class',
)

// The ctx action must be wired to the existing applyObjectOp command (no stub)
assert.ok(
  editorSrc.includes('action === "WrapFront"'),
  "editor.js: WrapFront ctx menu handler must exist",
)
assert.ok(
  /action === "WrapFront"\)\s*\{\s*closeCtx\(\);\s*applyObjectOp\("wrap-front"\);/.test(editorSrc),
  'editor.js: WrapFront handler must close the menu and run applyObjectOp("wrap-front")',
)
assert.ok(
  /action === "WrapFront"\)\s*\{\s*closeCtx\(\);\s*applyObjectOp\("wrap-front"\);\s*syncRightPanelControls\(\);/.test(
    editorSrc,
  ),
  "editor.js: WrapFront handler must re-sync the right-panel wrap select",
)

// Right-panel wrap selects must round-trip the new class back to wrap-front
assert.ok(
  editorSrc.includes('obj.classList.contains("obj-front") ? "wrap-front"'),
  "editor.js: image panel sync must map obj-front back to wrap-front",
)
assert.ok(
  editorSrc.includes('img.classList.contains("obj-front") ? "wrap-front"'),
  "editor.js: chart panel sync must map obj-front back to wrap-front",
)

// Object-layout popup (Insert tools): the wrap row must handle "front"
assert.ok(
  editorSrc.includes('else if (value === "front") floatImg.classList.add("obj-front");'),
  'editor.js: applyObjLayout must map the popup "front" value to obj-front',
)
// The remove call also gained obj-through (parallel wrap merges) — pin the
// layout-strip line by prefix and require obj-front among the removed classes.
const stripLine = editorSrc
  .split("\n")
  .find((l) => l.includes('floatImg.classList.remove("obj-inline"'))
assert.ok(
  !!stripLine && stripLine.includes('"obj-front"'),
  "editor.js: applyObjLayout must strip obj-front when switching wrap/align",
)

// ━━━━━━━━━━━━━ wrap-enumerating surfaces ━━━━━━━━━━━━━

// Layout > Wrapping menu and the chart Wrapping menu route through objectOp
const menuFrontRows = htmlSrc.match(/data-cmd="objectOp" data-value="wrap-front"/g) || []
assert.ok(
  menuFrontRows.length >= 2,
  `index.html: both wrapping menus must offer wrap-front (found ${menuFrontRows.length})`,
)
assert.ok(
  htmlSrc.includes('data-value="wrap-front" data-i18n="Layout.Wrapping.Front"'),
  "index.html: menu rows must use the Layout.Wrapping.Front label key",
)
// Right-panel image + chart wrapping selects must expose the option
assert.ok(
  /<select id="rp-image-wrap">[\s\S]*?value="wrap-front"/.test(htmlSrc),
  "index.html: rp-image-wrap select must offer wrap-front",
)
assert.ok(
  /<select id="rp-chart-wrap">[\s\S]*?value="wrap-front"/.test(htmlSrc),
  "index.html: rp-chart-wrap select must offer wrap-front",
)
assert.ok(
  htmlSrc.includes('id="btn-wrap-front"') && htmlSrc.includes('data-objwrap="front"'),
  "index.html: object-layout popup must have a front wrap button",
)

// ━━━━━━━━━━━━━ honest rendering (CSS) ━━━━━━━━━━━━━

// obj-front must detach from the text flow and layer ABOVE the text:
// no float, positive z-index — the mirror of obj-behind (z-index: -1).
assert.ok(cssSrc.includes("#editor img.obj-front"), "style.css: obj-front rule must exist")
const frontRule = cssSrc.match(/#editor img\.obj-front \{[^}]*\}/)
assert.ok(frontRule, "style.css: obj-front rule must be parseable")
assert.ok(
  frontRule[0].includes("float: none"),
  "style.css: obj-front must not float (text does not reflow around it)",
)
assert.ok(
  frontRule[0].includes("z-index: 1"),
  "style.css: obj-front must stack above the page text (z-index: 1)",
)
assert.ok(
  /#editor img\.obj-behind \{[^}]*z-index: -1/.test(cssSrc),
  "style.css: obj-behind must remain below the text (mirror of obj-front)",
)
// The honest-behavior comment must be documented in the sources
assert.ok(
  /obj-front[\s\S]{0,600}does NOT reflow around the object|WO-21-ctx-in-front-of-text[\s\S]{0,600}does not reflow around the object/i.test(
    cssSrc,
  ),
  "style.css: honest rendering behavior must be documented in a comment",
)
assert.ok(
  /WO-21-ctx-in-front-of-text[\s\S]{0,600}web text does not reflow around the object/i.test(
    editorSrc,
  ),
  "editor.js: honest rendering behavior must be documented in a comment",
)

// ━━━━━━━━━━━━━ i18n (en + de) ━━━━━━━━━━━━━

const i18nExpect = {
  "Ctx.WrapFront": ["In front of text", "Vor dem Text"],
  "RightPanel.WrapFront": ["In front of text", "Vor dem Text"],
  "Layout.Wrapping.Front": ["In front of text", "Vor dem Text"],
}
for (const [key, [en, de]] of Object.entries(i18nExpect)) {
  assert.ok(i18nSrc.includes(`"${key}": "${en}"`), `i18n: ${key} English string must exist`)
  assert.ok(i18nSrc.includes(`"${key}": "${de}"`), `i18n: ${key} German translation must exist`)
}

console.log("All WO-21-ctx-in-front-of-text tests passed!\n")
console.log("ctx-in-front-of-text-PASS")

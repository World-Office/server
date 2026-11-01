/**
 * WO-22-ctx-edit-points: OO "Edit points" shape-contour editor (L0, divergence)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * The web editor has NO vector path/contour model — shapes are CSS/SVG
 * placeholders with no editable geometry — so a real bezier-point editor is a
 * new subsystem (out of scope). This is the loud-limited pattern: the ctx row
 * exists for objects, and its dispatch arm reports unavailability via
 * setStatus (t("Status.NotAvailable")) and emits a passive wo:edit-points
 * CustomEvent marker. NO silent no-op, NO fake editor.
 *
 * Verifies that:
 *   - Ctx.EditPoints i18n key exists (EN + DE)
 *   - the context menu row exists with data-ctx="EditPoints",
 *     data-showif="object" and data-i18n="Ctx.EditPoints"
 *   - editor.js has an `action === "EditPoints"` dispatch arm
 *   - the handler reports unavailability through Status.NotAvailable
 *   - the handler dispatches the passive wo:edit-points CustomEvent marker
 *   - the handler is NOT a fake editor (no geometry/point mutation surface)
 *
 * Run with: node ctx-edit-points.test.mjs
 * Success: prints "ctx-edit-points-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-22-ctx-edit-points tests...\n")

// ━━━━━━━━━━━━━ i18n strings ━━━━━━━━━━━━━

// Ctx.EditPoints must exist in i18n.js (English)
assert.ok(
  i18nSrc.includes('"Ctx.EditPoints": "Edit points…"'),
  "i18n: Ctx.EditPoints English string must exist",
)

// Ctx.EditPoints must have a German translation
assert.ok(
  i18nSrc.includes('"Ctx.EditPoints": "Bearbeitungspunkte…"'),
  "i18n: Ctx.EditPoints German translation must exist",
)

// ━━━━━━━━━━━━━ index.html context menu row ━━━━━━━━━━

// The context menu must have an EditPoints button with data-ctx
assert.ok(
  htmlSrc.includes('data-ctx="EditPoints"'),
  "index.html: EditPoints context menu item must exist with data-ctx",
)

// The EditPoints row must be shown only for objects
assert.ok(
  htmlSrc.includes('data-ctx="EditPoints"') && htmlSrc.includes('data-showif="object"'),
  'index.html: EditPoints must have data-showif="object"',
)

// The EditPoints row must reference the i18n key
assert.ok(
  htmlSrc.includes('data-ctx="EditPoints"') && htmlSrc.includes('data-i18n="Ctx.EditPoints"'),
  'index.html: EditPoints must have data-i18n="Ctx.EditPoints"',
)

// ━━━━━━━━━━━━━ editor.js dispatch arm (loud-limited) ━━━━━━━━━

// The EditPoints action handler must exist in the ctx menu click dispatch
assert.ok(
  editorSrc.includes('action === "EditPoints"'),
  "editor.js: EditPoints ctx menu handler must exist",
)

// The handler must report unavailability through Status.NotAvailable
assert.ok(
  editorSrc.includes('action === "EditPoints"') && editorSrc.includes('t("Status.NotAvailable")'),
  "editor.js: EditPoints handler must report Status.NotAvailable",
)

// The handler must spell out the divergence feedback
assert.ok(
  editorSrc.includes('action === "EditPoints"') &&
    editorSrc.includes("shape contour editing is not available in the web editor"),
  "editor.js: EditPoints handler must state shape contour editing is unavailable",
)

// The handler must dispatch the passive wo:edit-points CustomEvent marker
assert.ok(
  editorSrc.includes('action === "EditPoints"') &&
    editorSrc.includes('new CustomEvent("wo:edit-points"'),
  "editor.js: EditPoints handler must dispatch the wo:edit-points CustomEvent",
)

// NO fake editor: the handler must not open a point/contour editing surface.
// The dispatch arm stays within the EditPoints block; no editor function such
// as openShapePicker / editSelectedObject is wired to this action.
const editPointsArm = editorSrc.slice(
  editorSrc.indexOf('action === "EditPoints"'),
  editorSrc.indexOf('action === "EditPoints"') + 1200,
)
assert.ok(
  !editPointsArm.includes("openShapePicker(") &&
    !editPointsArm.includes("editSelectedObject(") &&
    !editPointsArm.includes("openPointEditor("),
  "editor.js: EditPoints handler must not wire a fake point/contour editor",
)

console.log("All WO-22-ctx-edit-points tests passed!\n")
console.log("ctx-edit-points-PASS")

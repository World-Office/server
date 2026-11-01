/**
 * WO-21-ctx-edit-object: OO context menu "Edit object" on an OLE/drawing
 * object placeholder (slugs:ctx-edit-object). Node built-in test runner
 * (node:assert, zero dependencies).
 *
 * Asserts the onlyoffice parity contract:
 *   (1) index.html has an "Edit object" ctx row gated on data-showif="object"
 *       and localized through Ctx.EditObject
 *   (2) i18n.js defines the new keys in BOTH the English and German catalogs
 *   (3) editor.js dispatches the ctx row to a real helper that resolves the
 *       selected object and runs ONLY for div.object placeholders (never img)
 *   (4) openObjectDialog(preset, target) reopens the SAME insert-object dialog
 *       PRE-FILLED from the placeholder's data-type / data-label / content and
 *       preselects the object's current type
 *   (5) confirmObjectDialog() UPDATES THE EXISTING placeholder in place (no
 *       insertHTML / no new element) and finalizes through
 *       captureHistory / markDirty / scheduleCollabSync / notifyHost("editing")
 *   (6) Cancel (closeObjectDialog) drops the edit target, so a later Insert
 *       inserts instead of rewriting the old selection
 *
 * Run with: node apps/web/apps/documenteditor-wysiwyg/ctx-edit-object.test.mjs
 * Success: prints "ctx-edit-object-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-21-ctx-edit-object tests...\n")

// --- helpers ---------------------------------------------------------------

// Extract a top-level-in-closure function body (name + balanced braces).
function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `function ${name} must exist in editor.js`)
  const open = src.indexOf("{", start)
  assert.notEqual(open, -1, `function ${name} must have a body`)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}") {
      depth--
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  assert.fail(`function ${name} must have balanced braces`)
}

const deStart = i18nSrc.indexOf("const LOCALE_DE = {")
assert.notEqual(deStart, -1, "i18n.js must define LOCALE_DE")
const deSection = i18nSrc.slice(deStart)

// --- (1) the ctx row exists and is an object-scoped row --------------------

const editRow = htmlSrc.match(/<button[^>]*data-ctx="EditObject"[^>]*>/)
assert.ok(editRow, 'index.html must have a data-ctx="EditObject" row')
assert.ok(
  /data-showif="object"/.test(editRow[0]),
  'the EditObject row must carry data-showif="object"',
)
assert.ok(
  /data-i18n="Ctx\.EditObject"/.test(editRow[0]),
  'the EditObject row must be localized via data-i18n="Ctx.EditObject"',
)
console.log('ok 1 ctx row data-ctx="EditObject" (data-showif="object") exists')

// --- (2) i18n parity (en + de) ---------------------------------------------

for (const key of [
  "Ctx.EditObject",
  "Dialog.EditObjectTitle",
  "Dialog.InsertObjectTitle",
  "Status.ObjectUpdated",
]) {
  assert.ok(i18nSrc.includes(`"${key}"`), `English i18n must define ${key}`)
  assert.ok(deSection.includes(`"${key}"`), `German i18n must define ${key}`)
  console.log(`ok 2 i18n key ${key} exists in en + de`)
}

// --- (3) dispatcher arm + object-only guard --------------------------------

const dispatcherStart = editorSrc.indexOf('ctxMenu.addEventListener("click", (e) => {')
assert.notEqual(dispatcherStart, -1, "the ctx-menu click dispatcher must exist")
const dispatcherSrc = editorSrc.slice(dispatcherStart, dispatcherStart + 40000)
assert.ok(
  dispatcherSrc.includes('action === "EditObject"'),
  'the ctx dispatcher must handle action "EditObject"',
)
const editArm = dispatcherSrc.slice(
  dispatcherSrc.indexOf('action === "EditObject"'),
  dispatcherSrc.indexOf("} else if", dispatcherSrc.indexOf('action === "EditObject"') + 1),
)
assert.ok(
  editArm.includes("editSelectedObject()"),
  "the EditObject arm must call the real helper editSelectedObject()",
)
assert.ok(!/\bconsole\.log\(/.test(editArm), "the EditObject arm must not be a console.log stub")
console.log('ok 3 dispatcher routes "EditObject" to editSelectedObject()')

const editFn = extractFunction(editorSrc, "editSelectedObject")
assert.ok(
  editFn.includes("selectedObject()") && editFn.includes("openObjectDialog(null, obj)"),
  "editSelectedObject must resolve the selected object and reopen the object dialog on it",
)
assert.ok(
  editFn.includes("isEditableObject(obj)"),
  "editSelectedObject must be gated on the div.object placeholder check",
)
const isEditable = extractFunction(editorSrc, "isEditableObject")
assert.ok(
  isEditable.includes('matches("div.object")'),
  "isEditableObject must accept ONLY div.object placeholders",
)
assert.ok(
  !isEditable.includes('matches("img")') && !/\bimg\b/.test(isEditable),
  "isEditableObject must never accept plain images",
)
assert.ok(
  isEditable.includes("editor.contains(el)"),
  "isEditableObject must reject nodes outside the editing surface",
)
console.log("ok 3b the arm runs only for div.object placeholders (not img)")

// The context menu must keep the row hidden for plain images: the showif
// gating alone would show it for any selected object (imgs included).
const ctxGate = editorSrc.indexOf('button[data-ctx="EditObject"]')
assert.ok(ctxGate !== -1, "the contextmenu handler must know the EditObject row")
const gateBody = editorSrc.slice(ctxGate - 200, ctxGate + 400)
assert.ok(
  gateBody.includes("isEditableObject(ctxImageSel)"),
  "the ctx gating must hide EditObject unless the selection is a div.object",
)
console.log("ok 3c ctx gating hides EditObject for non-object selections")

// --- (4) the SAME dialog opens pre-filled in edit mode ---------------------

const openFn = extractFunction(editorSrc, "openObjectDialog")
assert.ok(
  /function openObjectDialog\(preset,\s*target\)/.test(openFn),
  "openObjectDialog must accept the optional target element (editing mode)",
)
assert.ok(
  openFn.includes("objectEditTarget = editing ? target : null"),
  "openObjectDialog must capture the editing target",
)
assert.ok(
  openFn.includes('target.getAttribute("data-type")'),
  "the dialog type select must be preselected from the object's current data-type",
)
assert.ok(
  openFn.includes("objectPlaceholderLabel(target)") &&
    openFn.includes("objectPlaceholderContent(target)"),
  "label + content inputs must be pre-filled from the placeholder",
)
assert.ok(
  openFn.includes('classList.add("open")'),
  "openObjectDialog still opens the SAME #object-dialog",
)
assert.ok(openFn.includes("READ_ONLY"), "the edit path stays read-only guarded")
const readLabel = extractFunction(editorSrc, "objectPlaceholderLabel")
const readContent = extractFunction(editorSrc, "objectPlaceholderContent")
assert.ok(
  readLabel.includes('getAttribute("data-label")'),
  "the label is read back from data-label",
)
assert.ok(
  readContent.includes('getAttribute("data-content")') && readContent.includes("textContent"),
  "the content is read from data-content when present, else the inner text",
)
console.log("ok 4 openObjectDialog(prefills type/label/content from the target)")

// --- (5) confirm updates the EXISTING placeholder in place -----------------

const confirmFn = extractFunction(editorSrc, "confirmObjectDialog")
const editBranch = confirmFn.slice(0, confirmFn.indexOf("let html ="))
assert.ok(
  editBranch.includes("isEditableObject(objectEditTarget)"),
  "confirmObjectDialog must detect the editing target",
)
assert.ok(
  editBranch.includes("applyObjectToPlaceholder(target, typ, lbl, c)"),
  "confirmObjectDialog must rewrite the existing placeholder",
)
assert.ok(
  !editBranch.includes("document.execCommand("),
  "the edit branch must NOT insert new content via execCommand",
)
for (const sink of [
  "captureHistory()",
  "markDirty()",
  "scheduleCollabSync()",
  'notifyHost("editing")',
]) {
  assert.ok(editBranch.includes(sink), `the edit branch must finalize through ${sink}`)
}
console.log("ok 5 confirmObjectDialog updates the placeholder in place")

// The in-place writer: the element is kept, only attributes + inner content
// change (a data-type change swaps the object's rendering).
const applyFn = extractFunction(editorSrc, "applyObjectToPlaceholder")
assert.ok(
  applyFn.includes('setAttribute("data-type", typ)'),
  "applyObjectToPlaceholder must write the new data-type",
)
assert.ok(
  applyFn.includes('setAttribute("data-label", lbl)') &&
    applyFn.includes('removeAttribute("data-label")'),
  "applyObjectToPlaceholder must set/clear data-label",
)
assert.ok(
  applyFn.includes("el.textContent = safe"),
  "applyObjectToPlaceholder must replace the placeholder's inner content",
)
for (const destructive of [
  "removeChild",
  "replaceChild",
  "insertAdjacentElement",
  "remove()",
  "insertHTML",
]) {
  assert.ok(
    !applyFn.includes(destructive),
    `applyObjectToPlaceholder must keep the element (${destructive} would drop it)`,
  )
}
console.log("ok 5b applyObjectToPlaceholder keeps the element, swaps payload")

// --- (5c) functional check of the in-place writer (real code, tiny DOM) ----

class FakeClassList {
  constructor() {
    this.set = new Set()
  }
  add(c) {
    this.set.add(c)
  }
  remove(c) {
    this.set.delete(c)
  }
  contains(c) {
    return this.set.has(c)
  }
}
class FakeElement {
  constructor(tag, attrs = {}) {
    this.tagName = tag.toUpperCase()
    this.attributes = new Map(Object.entries(attrs))
    this.classList = new FakeClassList()
    for (const cls of String(attrs.class || "")
      .split(/\s+/)
      .filter(Boolean))
      this.classList.add(cls)
    this.textContent = ""
  }
  getAttribute(n) {
    return this.attributes.has(n) ? this.attributes.get(n) : null
  }
  setAttribute(n, v) {
    this.attributes.set(n, String(v))
  }
  removeAttribute(n) {
    this.attributes.delete(n)
  }
  hasAttribute(n) {
    return this.attributes.has(n)
  }
}
// Evaluate the REAL applyObjectToPlaceholder body in a sandbox with the
// fake element — proves the node identity survives and the payload swaps.
const body = applyFn.slice(applyFn.indexOf("{") + 1, applyFn.lastIndexOf("}"))
const applyReal = new Function("el", "typ", "lbl", "c", body)

// same node, type swapped chart -> equation, new label + content
const obj = new FakeElement("div", { class: "object", "data-type": "chart", "data-label": "Q3" })
obj.textContent = "old chart payload"
const returned = applyReal(obj, "equation", "Revenue", "E = mc^2 <b>raw</b>")
assert.strictEqual(returned, obj, "the SAME element instance must be returned/kept")
assert.equal(obj.getAttribute("data-type"), "equation")
assert.equal(obj.getAttribute("data-label"), "Revenue")
assert.equal(obj.textContent, "E = mc^2 <b>raw</b>", "inner content is text, not HTML injection")
assert.ok(!obj.hasAttribute("data-shape"), "a non-shape object must not carry data-shape")

// clearing the label removes the attribute (insert path omits it when empty)
applyReal(obj, "textbox", "", "typed text")
assert.ok(!obj.hasAttribute("data-label"), "an empty label must drop data-label")
assert.equal(obj.textContent, "typed text")

// a placeholder that carries data-content keeps the attribute in sync
const withContent = new FakeElement("div", {
  class: "object",
  "data-type": "textbox",
  "data-content": "stale",
})
applyReal(withContent, "textbox", "Note", "fresh")
assert.equal(withContent.getAttribute("data-content"), "fresh", "data-content must not go stale")
console.log("ok 5c in-place rewrite verified against the real function body")

// --- (6) cancel drops the edit target --------------------------------------

const closeFn = extractFunction(editorSrc, "closeObjectDialog")
assert.ok(
  closeFn.includes("objectEditTarget = null"),
  "closeObjectDialog (cancel/Esc) must drop the edit target",
)
assert.ok(
  closeFn.includes('classList.remove("open")'),
  "closeObjectDialog still closes the dialog overlay",
)
// and the dialog announces its mode so Insert vs Edit cannot be confused
const modeFn = extractFunction(editorSrc, "syncObjectDialogMode")
assert.ok(
  modeFn.includes('"data-mode"') && modeFn.includes('"edit"') && modeFn.includes('"insert"'),
  "the object dialog must switch its data-mode between edit and insert",
)
console.log("ok 6 cancel clears the edit target; dialog switches insert/edit mode")

console.log("\nAll WO-21-ctx-edit-object tests passed!\n")
console.log("ctx-edit-object-PASS")

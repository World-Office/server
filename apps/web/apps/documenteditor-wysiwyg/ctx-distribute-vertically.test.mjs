/**
 * WO-21-ctx-distribute-vertically: OO multi-object "Distribute vertically" Tests
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Static-analysis contract (vertical counterpart of the horizontal task):
 *   (a) Multi-object selection infrastructure exists (selectedObjects array,
 *       clearMultiSelection, addToMultiSelection, removeFromMultiSelection)
 *   (b) Shift+click handler exists in mousedown listener
 *   (c) CSS class .obj-selected exists in style.css
 *   (d) distributeObjectsVertically function exists with real logic
 *   (e) DistributeVertically context menu item exists in index.html next to
 *       the horizontal one and shares the multi-select machinery
 *   (f) data-ctx="DistributeVertically" handler exists in editor.js
 *   (g) i18n keys exist for Ctx.DistributeVertically in both en and de
 *   (h) Status messages exist in both en and de
 *   (i) No bare console.log in new code
 *
 * Run: node apps/web/apps/documenteditor-wysiwyg/ctx-distribute-vertically.test.mjs
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const cssPath = new URL("./style.css", import.meta.url)

const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")
const cssSrc = readFileSync(cssPath, "utf-8")

console.log("Running WO-21-ctx-distribute-vertically tests...\n")

// --- (a) Multi-object selection infrastructure ----------------------
assert.ok(editorSrc.includes("let selectedObjects = []"), "(a) selectedObjects array must exist")
assert.ok(
  editorSrc.includes("function clearMultiSelection()"),
  "(a) clearMultiSelection function must exist",
)
assert.ok(
  editorSrc.includes("function addToMultiSelection(obj)"),
  "(a) addToMultiSelection function must exist",
)
assert.ok(
  editorSrc.includes("function removeFromMultiSelection(obj)"),
  "(a) removeFromMultiSelection function must exist",
)

// Verify clearMultiSelection removes obj-selected class
const clearMultiSelectionBody = extractFunction(editorSrc, "clearMultiSelection")
assert.ok(
  clearMultiSelectionBody.includes('classList.remove("obj-selected")'),
  "(a) clearMultiSelection must remove obj-selected class",
)
assert.ok(
  clearMultiSelectionBody.includes("selectedObjects = []"),
  "(a) clearMultiSelection must clear selectedObjects array",
)

// Verify addToMultiSelection adds obj-selected class
const addToMultiSelectionBody = extractFunction(editorSrc, "addToMultiSelection")
assert.ok(
  addToMultiSelectionBody.includes('classList.add("obj-selected")'),
  "(a) addToMultiSelection must add obj-selected class",
)
assert.ok(
  addToMultiSelectionBody.includes("selectedObjects.push(obj)"),
  "(a) addToMultiSelection must push to selectedObjects array",
)

// --- (b) Shift+click handler in mousedown -----------------------------
const mousedownHandler = extractEventListener(editorSrc, "editor.addEventListener", "mousedown")
assert.ok(mousedownHandler.includes("ev.shiftKey"), "(b) mousedown handler must check shiftKey")
assert.ok(
  mousedownHandler.includes("addToMultiSelection") ||
    mousedownHandler.includes("removeFromMultiSelection"),
  "(b) mousedown handler must call addToMultiSelection or removeFromMultiSelection",
)
assert.ok(
  mousedownHandler.includes("clearMultiSelection()"),
  "(b) mousedown handler must clear multi-selection on regular click",
)

// --- (c) CSS class .obj-selected exists -------------------------------
assert.ok(cssSrc.includes(".obj-selected"), "(c) .obj-selected CSS class must exist in style.css")
assert.ok(
  cssSrc.includes("outline") && cssSrc.slice(cssSrc.indexOf(".obj-selected")).includes("outline"),
  "(c) .obj-selected must have outline styling",
)

// --- (d) distributeObjectsVertically function -------------------------
assert.ok(
  editorSrc.includes("function distributeObjectsVertically()"),
  "(d) distributeObjectsVertically function must exist",
)
const distributeBody = extractFunction(editorSrc, "distributeObjectsVertically")
assert.ok(
  distributeBody.includes("selectedObjects.length < 2"),
  "(d) distributeObjectsVertically must check for at least 2 objects",
)
assert.ok(
  distributeBody.includes("getBoundingClientRect()"),
  "(d) distributeObjectsVertically must use getBoundingClientRect",
)
assert.ok(
  distributeBody.includes("style.top"),
  "(d) distributeObjectsVertically must set style.top",
)
assert.ok(
  distributeBody.includes("captureHistory()"),
  "(d) distributeObjectsVertically must call captureHistory",
)
assert.ok(
  distributeBody.includes("markDirty()"),
  "(d) distributeObjectsVertically must call markDirty",
)
assert.ok(
  distributeBody.includes("scheduleCollabSync()"),
  "(d) distributeObjectsVertically must call scheduleCollabSync",
)
assert.ok(
  distributeBody.includes('notifyHost("editing")'),
  "(d) distributeObjectsVertically must call notifyHost",
)
assert.ok(
  distributeBody.includes("clearMultiSelection()"),
  "(d) distributeObjectsVertically must clear multi-selection after applying",
)

// --- (e) DistributeVertically context menu item -----------------------
assert.ok(
  htmlSrc.includes('data-ctx="DistributeVertically"'),
  "(e) DistributeVertically context menu button must exist",
)
assert.ok(
  htmlSrc.includes('data-showif="object"') &&
    htmlSrc.indexOf('data-ctx="DistributeVertically"') <
      htmlSrc.lastIndexOf('data-showif="object"'),
  "(e) DistributeVertically must have data-showif='object'",
)
// Check it's gated on object
const distributeBtnMatch = htmlSrc.match(/data-ctx="DistributeVertically"[^>]*>/)
assert.ok(
  distributeBtnMatch?.[0].includes('data-showif="object"'),
  "(e) DistributeVertically button must have data-showif='object'",
)
// Spec: place the vertical row next to the horizontal one
assert.ok(
  htmlSrc.indexOf('data-ctx="DistributeVertically"') >
    htmlSrc.indexOf('data-ctx="DistributeHorizontally"'),
  "(e) DistributeVertically must sit next to (after) DistributeHorizontally",
)

// --- (f) Context menu handler for DistributeVertically ----------------
const ctxHandler = extractEventListener(editorSrc, "ctxMenu.addEventListener", "click")
assert.ok(
  ctxHandler.includes('action === "DistributeVertically"'),
  "(f) ctx menu click handler must handle DistributeVertically",
)
assert.ok(
  ctxHandler.includes("distributeObjectsVertically()"),
  "(f) ctx menu click handler must call distributeObjectsVertically()",
)

// --- (g) i18n keys for Ctx.DistributeVertically ------------------------
// English
const enSection = i18nSrc.slice(0, i18nSrc.indexOf("const LOCALE_DE"))
assert.ok(
  enSection.includes('"Ctx.DistributeVertically": "Distribute vertically"'),
  "(g) Ctx.DistributeVertically must exist in English i18n",
)
// German
const deStart = i18nSrc.indexOf("const LOCALE_DE")
const deSection = i18nSrc.slice(deStart)
assert.ok(
  deSection.includes('"Ctx.DistributeVertically":'),
  "(g) Ctx.DistributeVertically must exist in German i18n",
)

// --- (h) Status messages in both locales ------------------------------
const statusKeys = [
  "Status.DistributeNeedsTwoObjects",
  "Status.DistributedVertically",
  "Status.SelectAnotherObject",
  "Status.NoObjectsSelected",
]
for (const key of statusKeys) {
  assert.ok(enSection.includes(`"${key}":`), `(h) ${key} must exist in English i18n`)
  assert.ok(deSection.includes(`"${key}":`), `(h) ${key} must exist in German i18n`)
}

// --- (i) No bare console.log in new functions --------------------------
assert.ok(
  !distributeBody.includes("console.log("),
  "(i) distributeObjectsVertically must not use console.log",
)
assert.ok(
  !clearMultiSelectionBody.includes("console.log("),
  "(i) clearMultiSelection must not use console.log",
)
assert.ok(
  !addToMultiSelectionBody.includes("console.log("),
  "(i) addToMultiSelection must not use console.log",
)
assert.ok(
  !extractFunction(editorSrc, "removeFromMultiSelection").includes("console.log("),
  "(i) removeFromMultiSelection must not use console.log",
)

// --- Helper functions for extraction -----------------------------------
function extractFunction(src, name) {
  const marker = `function ${name}(`
  const start = src.indexOf(marker)
  assert.notEqual(start, -1, `${name} must exist in editor.js`)
  let depth = 0
  let i = src.indexOf("{", start)
  const bodyStart = i
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}") {
      depth--
      if (depth === 0) break
    }
  }
  return src.slice(start, i + 1)
}

function extractEventListener(src, prefix, eventName) {
  const marker = `${prefix}("${eventName}"`
  const start = src.indexOf(marker)
  assert.notEqual(start, -1, `Event listener for ${eventName} must exist`)
  // Find the opening brace of the arrow function or anonymous function
  let i = start
  while (i < src.length && src[i] !== "{") i++
  if (i >= src.length) {
    assert.fail(`Could not find opening brace for ${eventName} listener`)
  }
  const bodyStart = i
  let depth = 1
  i++
  while (i < src.length && depth > 0) {
    if (src[i] === "{") depth++
    else if (src[i] === "}") depth--
    i++
  }
  return src.slice(bodyStart, i)
}

console.log("(a) Multi-object selection infrastructure")
console.log("(b) Shift+click handler in mousedown")
console.log("(c) CSS class .obj-selected")
console.log("(d) distributeObjectsVertically function with real DOM logic")
console.log("(e) DistributeVertically context menu item")
console.log("(f) Context menu click handler")
console.log("(g) i18n keys in en + de")
console.log("(h) Status messages in en + de")
console.log("(i) No bare console.log")
console.log("CTX-DISTRIBUTE-VERTICALLY-PASS")

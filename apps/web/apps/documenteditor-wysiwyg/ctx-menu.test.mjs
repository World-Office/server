/**
 * CTX-MENU Context Menu Tests
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Asserts the AF1-CTX-MENU contract:
 *   (1) index.html has >= 20 buttons with data-ctx
 *   (2) every data-ctx value in HTML has a Ctx.* i18n key in BOTH en and de
 *   (3) every data-ctx value is handled in the editor.js dispatcher
 *   (4) no data-ctx handler body contains a bare console.log stub
 *
 * Run: node apps/web/apps/documenteditor-wysiwyg/ctx-menu.test.mjs
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

// Extract the ctx-menu click dispatcher from editor.js
function extractCtxMenuDispatcher(src) {
  const startMarker = 'ctxMenu.addEventListener("click", (e) => {'
  const start = src.indexOf(startMarker)
  assert.notEqual(start, -1, "ctxMenu click dispatcher must exist in editor.js")

  // Find the matching closing brace for the event listener
  let depth = 0
  let i = start
  let foundStartBrace = false

  // Find the opening brace of the function
  for (; i < src.length; i++) {
    if (src[i] === "{") {
      depth++
      foundStartBrace = true
      break
    }
  }
  assert.ok(foundStartBrace, "ctxMenu click dispatcher must have opening brace")

  // Find the matching closing brace
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}") {
      depth--
      if (depth === 0) break
    }
  }
  assert.equal(depth, 0, "ctxMenu click dispatcher must have balanced braces")

  return src.slice(start, i + 1)
}

// Parse all data-ctx values from index.html
function extractCtxActions(html) {
  const matches = html.match(/data-ctx="([^"]+)"/g)
  if (!matches) return []
  return matches.map((m) => m.replace(/data-ctx="([^"]+)"/, "$1"))
}

// Extract all Ctx.* keys from i18n.js
function extractCtxKeys(i18n) {
  const matches = i18n.match(/"Ctx\.([^"]+)":/g)
  if (!matches) return []
  return matches.map((m) => m.replace(/"Ctx\.([^"]+)":/, "$1"))
}

// Read files
const html = readFileSync(new URL("./index.html", import.meta.url), "utf8")
const js = readFileSync(new URL("./editor.js", import.meta.url), "utf8")
const i18n = readFileSync(new URL("./i18n.js", import.meta.url), "utf8")

// Test (1): index.html has >= 20 buttons with data-ctx
const ctxActions = extractCtxActions(html)
console.log(`Found ${ctxActions.length} data-ctx buttons in index.html`)
assert.ok(ctxActions.length >= 20, `Need >=20 data-ctx rows, found ${ctxActions.length}`)

// Test (2): every data-ctx value has Ctx.* i18n key in BOTH en and de
const enCtxKeys = extractCtxKeys(i18n)
console.log(`Found ${enCtxKeys.length} Ctx.* keys in i18n.js`)

for (const action of ctxActions) {
  assert.ok(
    enCtxKeys.includes(action),
    `data-ctx="${action}" missing Ctx.${action} in English i18n`,
  )
}

// Extract German locale catalog
const deStart = i18n.indexOf("const LOCALE_DE = {")
assert.notEqual(deStart, -1, "LOCALE_DE must exist in i18n.js")
// Find the matching closing brace for LOCALE_DE
let deDepth = 0
let deEndMarker = deStart
let foundDeOpen = false
for (let i = deStart; i < i18n.length; i++) {
  if (i18n[i] === '{') {
    deDepth++
    foundDeOpen = true
  } else if (i18n[i] === '}') {
    deDepth--
    if (foundDeOpen && deDepth === 0) {
      deEndMarker = i
      break
    }
  }
}
assert.notEqual(deEndMarker, -1, "LOCALE_DE must have closing }")
assert.notEqual(deEndMarker, deStart, "LOCALE_DE closing brace must be after opening")
const deSection = i18n.slice(deStart, deEndMarker + 1)
const deCtxKeys = extractCtxKeys(deSection)
console.log(`Found ${deCtxKeys.length} Ctx.* keys in German locale`)

for (const action of ctxActions) {
  assert.ok(deCtxKeys.includes(action), `data-ctx="${action}" missing Ctx.${action} in German i18n`)
}

// Test (3): every data-ctx value is handled in the editor.js dispatcher
const dispatcher = extractCtxMenuDispatcher(js)
console.log("Extracted ctx-menu dispatcher")

for (const action of ctxActions) {
  assert.notEqual(
    dispatcher.indexOf(`action === "${action}"`),
    -1,
    `data-ctx="${action}" not handled in dispatcher`,
  )
}

// Test (4): no data-ctx handler body contains a bare console.log stub
for (const action of ctxActions) {
  // Find the handler for this action
  const actionCheckStart = dispatcher.indexOf(`action === "${action}"`)
  assert.notEqual(actionCheckStart, -1, `Action ${action} should be in dispatcher`)

  // Find the next else if or closing brace to get the handler body
  const nextElseIf = dispatcher.indexOf("} else if (action ===", actionCheckStart + 1)
  const nextElse = dispatcher.indexOf("} else {", actionCheckStart + 1)
  const closing = dispatcher.indexOf("}", actionCheckStart + 1)

  let handlerEnd = closing
  if (nextElseIf !== -1 && nextElseIf < closing) handlerEnd = nextElseIf
  if (nextElse !== -1 && nextElse < handlerEnd) handlerEnd = nextElse

  const handlerBody = dispatcher.slice(actionCheckStart, handlerEnd)

  // Check that the handler doesn't contain bare console.log
  // Allow console.log in nested functions but not as the only action
  const hasConsoleLog = handlerBody.includes("console.log(")
  const hasRealAction =
    handlerBody.includes("document.execCommand(") ||
    handlerBody.includes("emitCommand(") ||
    handlerBody.includes("openCommentDialog(") ||
    handlerBody.includes("insertLink(") ||
    handlerBody.includes("openSymbolDialog(") ||
    handlerBody.includes("openOverlayDialog(") ||
    handlerBody.includes("openUpdateTocDialog(") ||
    handlerBody.includes("editorEl.focus(") ||
    handlerBody.includes("richPaste(")

  assert.ok(
    !hasConsoleLog || hasRealAction,
    `Handler for action "${action}" should not be a bare console.log stub`,
  )
}

console.log("CTX-MENU-PASS")

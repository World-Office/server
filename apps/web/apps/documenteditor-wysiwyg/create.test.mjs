/**
 * WO-19-create: census-artifact (backstage tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-new is included in the interact census with opens:modal
 * behavior, matching OnlyOffice parity (slugs:create).
 *
 * Run with: node create.test.mjs
 * Success: prints "create-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-19-create interact census tests...\n")

// The btn-new button must exist
assert.ok(htmlSrc.includes('id="btn-new"'), "btn-new button must exist in index.html")
console.log("ok 1 btn-new button exists")

// The btn-new must be wrapped in a span with data-wo-interact="opens:modal"
const btnNewMatch = htmlSrc.match(/<span[^>]*data-wo-interact="opens:modal"[^>]*>.*?id="btn-new"/s)
assert.ok(btnNewMatch, 'btn-new must be inside a span with data-wo-interact="opens:modal"')
console.log("ok 2 btn-new is in interact census with opens:modal")

// The btn-new must be inside the backstage overlay
const backstageMatch = htmlSrc.match(/<div id="backstage-overlay"[^>]*>.*?id="btn-new".*?<\/div>/s)
assert.ok(backstageMatch, "btn-new must be inside the backstage overlay")
console.log("ok 3 btn-new is in the backstage overlay")

// The btn-new must be in the new pane view
const newPaneMatch = htmlSrc.match(/<div[^>]*data-pane-view="new"[^>]*>.*?id="btn-new".*?<\/div>/s)
assert.ok(newPaneMatch, "btn-new must be in the new pane view")
console.log("ok 4 btn-new is in the new pane view")

// editor.js must have doNewDocument function
assert.ok(
  editorSrc.includes("function doNewDocument()"),
  "doNewDocument function must exist in editor.js",
)
console.log("ok 5 doNewDocument function exists in editor.js")

// editor.js must wire btn-new click to doNewDocument
assert.ok(
  editorSrc.includes('getElementById("btn-new")') && editorSrc.includes("doNewDocument"),
  "btn-new must have click handler wired to doNewDocument",
)
console.log("ok 6 btn-new click handler is wired to doNewDocument")

// i18n must have Menu.New key
assert.ok(i18nSrc.includes('"Menu.New"'), "Menu.New i18n key must exist")
console.log("ok 7 Menu.New i18n key exists")

// i18n must have FileScreen.TitleNew key
assert.ok(i18nSrc.includes('"FileScreen.TitleNew"'), "FileScreen.TitleNew i18n key must exist")
console.log("ok 8 FileScreen.TitleNew i18n key exists")

// i18n must have FileScreen.DescNew key
assert.ok(i18nSrc.includes('"FileScreen.DescNew"'), "FileScreen.DescNew i18n key must exist")
console.log("ok 9 FileScreen.DescNew i18n key exists")

console.log("\nAll WO-19-create interact census tests passed!\n")
console.log("create-PASS")

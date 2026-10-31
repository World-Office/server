/**
 * WO-16-asc-gen885: census-artifact (references tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-bookmark is included in the interact census with opens:modal
 * behavior in the references tab, matching OnlyOffice parity (slugs:asc-gen885).
 *
 * Run with: node asc-gen885.test.mjs
 * Success: prints "asc-gen885-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-16-asc-gen885 interact census tests...\n")

// The btn-bookmark button must exist in the references tab
assert.ok(htmlSrc.includes('id="btn-bookmark"'), "btn-bookmark button must exist in index.html")
console.log("ok 1 btn-bookmark button exists")

// The btn-bookmark must be wrapped in a span with data-wo-id and data-wo-cmd
const btnBookmarkMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-bookmark"[^>]*data-wo-cmd="btn-bookmark"[^>]*>.*?id="btn-bookmark"/s,
)
assert.ok(
  btnBookmarkMatch,
  'btn-bookmark must be inside a span with data-wo-id="btn-bookmark" and data-wo-cmd="btn-bookmark"',
)
console.log(
  "ok 2 btn-bookmark is in interact census with wo_id=btn-bookmark and wo_cmd=btn-bookmark",
)

// The btn-bookmark span must also have data-wo-interact="opens:modal"
const btnBookmarkInteractMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-bookmark"[^>]*data-wo-cmd="btn-bookmark"[^>]*data-wo-interact="opens:modal"[^>]*>.*?id="btn-bookmark"/s,
)
assert.ok(btnBookmarkInteractMatch, 'btn-bookmark span must have data-wo-interact="opens:modal"')
console.log('ok 3 btn-bookmark span has data-wo-interact="opens:modal"')

// The btn-bookmark must be in the references tab section
const referencesTabMatch = htmlSrc.match(
  /<div class="ribbon-page"[^>]*data-tab="references"[^>]*>.*?id="btn-bookmark".*?<\/div>/s,
)
assert.ok(referencesTabMatch, "btn-bookmark must be in the references tab")
console.log("ok 4 btn-bookmark is in the references tab")

// The bookmark dialog must exist (modal overlay)
assert.ok(htmlSrc.includes('id="bookmark-dialog"'), "bookmark-dialog must exist in index.html")
console.log("ok 5 bookmark-dialog exists")

// The bookmark dialog must be a modal (dialog-overlay with aria-modal="true")
const bookmarkDialogMatch = htmlSrc.match(
  /id="bookmark-dialog"[^>]*class="dialog-overlay"[^>]*aria-modal="true"/,
)
assert.ok(bookmarkDialogMatch, "bookmark-dialog must be a modal overlay with aria-modal=true")
console.log("ok 6 bookmark-dialog is a modal overlay")

// editor.js must have btn-bookmark element access
assert.ok(
  editorSrc.includes('getElementById("btn-bookmark")'),
  "btn-bookmark element must be accessed in editor.js",
)
console.log("ok 7 btn-bookmark element is accessed in editor.js")

// editor.js must wire btn-bookmark click to open bookmark-dialog
assert.ok(
  editorSrc.includes("openBookmarkDialog") &&
    editorSrc.includes('addEventListener("click", openBookmarkDialog)'),
  "btn-bookmark must have click handler wired to openBookmarkDialog",
)
console.log("ok 8 btn-bookmark click handler opens bookmark-dialog")

// i18n must have BookmarkTitle and Ref.Bookmark keys
assert.ok(i18nSrc.includes('"Toolbar.BookmarkTitle"'), "Toolbar.BookmarkTitle i18n key must exist")
console.log("ok 9 Toolbar.BookmarkTitle i18n key exists")

assert.ok(i18nSrc.includes('"Ref.Bookmark"'), "Ref.Bookmark i18n key must exist")
console.log("ok 10 Ref.Bookmark i18n key exists")

console.log("\nAll WO-16-asc-gen885 interact census tests passed!\n")
console.log("asc-gen885-PASS")

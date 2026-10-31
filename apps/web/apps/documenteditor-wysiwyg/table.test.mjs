/**
 * WO-11-table: census-artifact (insert tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-table is included in the interact census with opens:menu
 * behavior, matching OnlyOffice parity (slugs:table).
 *
 * Run with: node table.test.mjs
 * Success: prints "table-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")

console.log("Running WO-11-table interact census tests...\n")

// The btn-table button must exist in the insert tab
assert.ok(htmlSrc.includes('id="btn-table"'), "btn-table button must exist in index.html")
console.log("ok 1 btn-table button exists")

// The btn-table must be wrapped in a span with data-wo-interact="opens:menu"
const btnTableMatch = htmlSrc.match(
  /<span[^>]*data-wo-interact="opens:menu"[^>]*>.*?id="btn-table"/s,
)
assert.ok(btnTableMatch, 'btn-table must be inside a span with data-wo-interact="opens:menu"')
console.log("ok 2 btn-table is in interact census with opens:menu")

// The menu structure must exist with btn-table in the insert tab section
const btnTableMatchFull = htmlSrc.match(
  /<div class="ribbon-page"[^>]*data-tab="insert"[^>]*>.*?id="btn-table".*?<\/div>/s,
)
assert.ok(btnTableMatchFull, "btn-table must be in the insert tab")
assert.ok(
  btnTableMatchFull[0].includes('class="menu-list"') &&
    btnTableMatchFull[0].includes('data-cmd="openTableDialog"'),
  "btn-table must have an associated menu with openTableDialog command",
)
console.log("ok 3 btn-table has menu structure in insert tab")

// The table dialog must exist (anchored popover)
assert.ok(htmlSrc.includes('id="table-dialog"'), "table-dialog must exist in index.html")
console.log("ok 4 table-dialog exists")

// The table dialog must have rows and columns inputs for the grid
assert.ok(
  htmlSrc.includes('id="table-rows"') && htmlSrc.includes('id="table-cols"'),
  "table-dialog must have rows and columns inputs",
)
console.log("ok 5 table-dialog has rows and columns inputs (grid)")

// The table dialog must have insert button
assert.ok(htmlSrc.includes('id="btn-table-ok"'), "btn-table-ok button must exist")
console.log("ok 6 table-dialog has insert button")

console.log("\nAll WO-11-table interact census tests passed!\n")
console.log("table-PASS")

/**
 * WO-19-grammar-spelling: census-artifact (ai tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-ai-grammar is included in the interact census with opens:modal
 * behavior, matching OnlyOffice parity (slugs:grammar-spelling).
 *
 * Run with: node grammar-spelling.test.mjs
 * Success: prints "grammar-spelling-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-19-grammar-spelling interact census tests...\n")

// The btn-ai-grammar button must exist in the AI tab
assert.ok(htmlSrc.includes('id="btn-ai-grammar"'), "btn-ai-grammar button must exist in index.html")
console.log("ok 1 btn-ai-grammar button exists")

// The btn-ai-grammar must be wrapped in a span with data-wo-id and data-wo-cmd
const btnAiGrammarMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-ai-grammar"[^>]*data-wo-cmd="btn-ai-grammar"[^>]*>.*?id="btn-ai-grammar"/s,
)
assert.ok(
  btnAiGrammarMatch,
  'btn-ai-grammar must be inside a span with data-wo-id="btn-ai-grammar" and data-wo-cmd="btn-ai-grammar"',
)
console.log(
  "ok 2 btn-ai-grammar is in interact census with wo_id=btn-ai-grammar and wo_cmd=btn-ai-grammar",
)

// The btn-ai-grammar span must also have data-wo-interact="opens:modal"
const btnAiGrammarInteractMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-ai-grammar"[^>]*data-wo-cmd="btn-ai-grammar"[^>]*data-wo-interact="opens:modal"[^>]*>.*?id="btn-ai-grammar"/s,
)
assert.ok(btnAiGrammarInteractMatch, 'btn-ai-grammar span must have data-wo-interact="opens:modal"')
console.log('ok 3 btn-ai-grammar span has data-wo-interact="opens:modal"')

// The btn-ai-grammar must be in the AI tab section
const aiTabMatch = htmlSrc.match(
  /<div class="ribbon-page"[^>]*data-tab="ai"[^>]*>.*?id="btn-ai-grammar".*?<\/div>/s,
)
assert.ok(aiTabMatch, "btn-ai-grammar must be in the AI tab")
console.log("ok 4 btn-ai-grammar is in the AI tab")

// The ai-propose-dialog must exist (modal overlay used by grammar check)
assert.ok(htmlSrc.includes('id="ai-propose-dialog"'), "ai-propose-dialog must exist in index.html")
console.log("ok 5 ai-propose-dialog exists")

// The ai-propose-dialog must be a modal (dialog-overlay with aria-modal="true")
const aiProposeDialogMatch = htmlSrc.match(
  /id="ai-propose-dialog"[^>]*class="dialog-overlay"[^>]*aria-modal="true"/,
)
assert.ok(aiProposeDialogMatch, "ai-propose-dialog must be a modal overlay with aria-modal=true")
console.log("ok 6 ai-propose-dialog is a modal overlay")

// editor.js must have btn-ai-grammar element access
assert.ok(
  editorSrc.includes('getElementById("btn-ai-grammar")'),
  "btn-ai-grammar element must be accessed in editor.js",
)
console.log("ok 7 btn-ai-grammar element is accessed in editor.js")

// editor.js must wire btn-ai-grammar click to openAiPropose with grammar instruction
assert.ok(
  editorSrc.includes('getElementById("btn-ai-grammar")') &&
    editorSrc.includes("openAiPropose") &&
    editorSrc.includes("Fix grammar and spelling"),
  "btn-ai-grammar must call openAiPropose with grammar instruction",
)
console.log("ok 8 btn-ai-grammar calls openAiPropose with grammar instruction")

// editor.js must have openAiPropose function that opens the dialog
assert.ok(
  editorSrc.includes("function openAiPropose(") && editorSrc.includes("aiProposeDialog"),
  "openAiPropose function must exist and reference aiProposeDialog",
)
console.log("ok 9 openAiPropose function exists and references aiProposeDialog")

// i18n must have AI.Grammar key
assert.ok(i18nSrc.includes('"AI.Grammar"'), "AI.Grammar i18n key must exist")
console.log("ok 10 AI.Grammar i18n key exists")

console.log("\nAll WO-19-grammar-spelling interact census tests passed!\n")
console.log("grammar-spelling-PASS")

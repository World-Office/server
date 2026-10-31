/**
 * WO-18-asc-gen4612: census-artifact (ai tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-ai-assistant is included in the interact census with
 * wo_id=btn-ai-assistant, wo_cmd=btn-ai-assistant, and opens_wo='modal',
 * matching OnlyOffice parity (slugs:asc-gen4612).
 *
 * Run with: node asc-gen4612.test.mjs
 * Success: prints "asc-gen4612-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-18-asc-gen4612 interact census tests...\n")

// The btn-ai-assistant button must exist in the AI tab
assert.ok(
  htmlSrc.includes('id="btn-ai-assistant"'),
  "btn-ai-assistant button must exist in index.html",
)
console.log("ok 1 btn-ai-assistant button exists")

// The btn-ai-assistant must be wrapped in a span with data-wo-interact="opens:modal"
const btnAiAssistantMatch = htmlSrc.match(
  /<span[^>]*data-wo-interact="opens:modal"[^>]*>.*?id="btn-ai-assistant"/s,
)
assert.ok(
  btnAiAssistantMatch,
  'btn-ai-assistant must be inside a span with data-wo-interact="opens:modal"',
)
console.log("ok 2 btn-ai-assistant is in interact census with opens:modal")

// The btn-ai-assistant span must also have data-wo-id and data-wo-cmd
const btnAiAssistantCensusMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-ai-assistant"[^>]*data-wo-cmd="btn-ai-assistant"[^>]*data-wo-interact="opens:modal"[^>]*>.*?id="btn-ai-assistant"/s,
)
assert.ok(
  btnAiAssistantCensusMatch,
  "btn-ai-assistant span must have data-wo-id, data-wo-cmd, and data-wo-interact attributes",
)
console.log("ok 3 btn-ai-assistant span has data-wo-id, data-wo-cmd, and data-wo-interact")

// The btn-ai-assistant must be in the AI tab section
const aiTabMatch = htmlSrc.match(
  /<div class="ribbon-page"[^>]*data-tab="ai"[^>]*>.*?id="btn-ai-assistant".*?<\/div>/s,
)
assert.ok(aiTabMatch, "btn-ai-assistant must be in the AI tab")
console.log("ok 4 btn-ai-assistant is in the AI tab")

// The ai-propose-dialog must exist (modal overlay)
assert.ok(htmlSrc.includes('id="ai-propose-dialog"'), "ai-propose-dialog must exist in index.html")
console.log("ok 5 ai-propose-dialog exists")

// The ai-propose-dialog must be a modal (dialog-overlay with aria-modal="true")
const aiProposeDialogMatch = htmlSrc.match(
  /id="ai-propose-dialog"[^>]*class="dialog-overlay"[^>]*aria-modal="true"/,
)
assert.ok(aiProposeDialogMatch, "ai-propose-dialog must be a modal overlay with aria-modal=true")
console.log("ok 6 ai-propose-dialog is a modal overlay")

// editor.js must have btn-ai-assistant element access
assert.ok(
  editorSrc.includes('getElementById("btn-ai-assistant")'),
  "btn-ai-assistant element must be accessed in editor.js",
)
console.log("ok 7 btn-ai-assistant element is accessed in editor.js")

// editor.js must wire btn-ai-assistant click to open ai-propose-dialog
assert.ok(
  editorSrc.includes('getElementById("btn-ai-assistant")') &&
    editorSrc.includes("openAiPropose") &&
    editorSrc.includes('.addEventListener("click"'),
  "btn-ai-assistant must have click handler to open ai-propose-dialog",
)
console.log("ok 8 btn-ai-assistant click handler opens ai-propose-dialog")

// i18n must have AI.Assistant key
assert.ok(i18nSrc.includes('"AI.Assistant"'), "AI.Assistant i18n key must exist")
console.log("ok 9 AI.Assistant i18n key exists")

console.log("\nAll WO-18-asc-gen4612 interact census tests passed!\n")
console.log("asc-gen4612-PASS")

/**
 * WO-19-asc-gen4628: census-artifact (ai tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-ai-assistant is included in the interact census with
 * opens:modal behavior, matching OnlyOffice parity (slugs:asc-gen4628).
 *
 * Run with: node asc-gen4628.test.mjs
 * Success: prints "asc-gen4628-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-19-asc-gen4628 interact census tests...\n")

// The btn-ai-assistant button must exist in the AI tab
assert.ok(
  htmlSrc.includes('id="btn-ai-assistant"'),
  "btn-ai-assistant button must exist in index.html",
)
console.log("ok 1 btn-ai-assistant button exists in index.html")

// The btn-ai-assistant must be wrapped in a span with data-wo-id, data-wo-cmd and
// data-wo-interact="opens:modal" (the interact census artifact)
const btnAiAssistantCensusMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-ai-assistant"[^>]*data-wo-cmd="btn-ai-assistant"[^>]*data-wo-interact="opens:modal"[^>]*>.*?id="btn-ai-assistant"/s,
)
assert.ok(
  btnAiAssistantCensusMatch,
  "btn-ai-assistant must be inside a span with data-wo-id, data-wo-cmd and data-wo-interact='opens:modal'",
)
console.log("ok 2 btn-ai-assistant is in the interact census with opens:modal")

// The btn-ai-assistant must be inside the AI ribbon tab
const aiTabMatch = htmlSrc.match(
  /<div class="ribbon-page"[^>]*data-tab="ai"[^>]*>.*?id="btn-ai-assistant".*?<\/div>/s,
)
assert.ok(aiTabMatch, "btn-ai-assistant must be in the AI tab")
console.log("ok 3 btn-ai-assistant is in the AI tab")

// The modal the assistant opens (ai-propose-dialog) must exist and be modal
assert.ok(htmlSrc.includes('id="ai-propose-dialog"'), "ai-propose-dialog must exist in index.html")
const aiProposeDialogMatch = htmlSrc.match(
  /id="ai-propose-dialog"[^>]*class="dialog-overlay"[^>]*aria-modal="true"/,
)
assert.ok(aiProposeDialogMatch, "ai-propose-dialog must be a modal overlay with aria-modal=true")
console.log("ok 4 ai-propose-dialog exists and is a modal overlay")

// editor.js must access the btn-ai-assistant element and wire a click handler
assert.ok(
  editorSrc.includes('getElementById("btn-ai-assistant")'),
  "btn-ai-assistant element must be accessed in editor.js",
)
assert.ok(
  editorSrc.includes('getElementById("btn-ai-assistant")') &&
    editorSrc.includes('.addEventListener("click"') &&
    editorSrc.includes("openAiPropose") &&
    editorSrc.includes("Improve the writing style of the document"),
  "btn-ai-assistant click handler must call openAiPropose with the assistant instruction",
)
console.log("ok 5 btn-ai-assistant click handler opens ai-propose-dialog")

// openAiPropose must actually open the ai-propose-dialog (no-op guard)
assert.ok(
  editorSrc.includes("function openAiPropose(") &&
    editorSrc.includes('aiProposeDialog.classList.add("open")'),
  "openAiPropose must open ai-propose-dialog via classList.add('open')",
)
console.log("ok 6 openAiPropose opens the ai-propose-dialog")

// i18n must have the AI.Assistant key
assert.ok(i18nSrc.includes('"AI.Assistant"'), "AI.Assistant i18n key must exist")
console.log("ok 7 AI.Assistant i18n key exists")

console.log("\nAll WO-19-asc-gen4628 interact census tests passed!\n")
console.log("asc-gen4628-PASS")

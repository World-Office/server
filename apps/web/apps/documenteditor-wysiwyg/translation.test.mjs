/**
 * WO-19-translation: census-artifact (ai tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that btn-ai-translate is included in the interact census with opens:modal
 * behavior, matching OnlyOffice parity (slugs:translation).
 *
 * Run with: node translation.test.mjs
 * Success: prints "translation-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlPath = new URL("./index.html", import.meta.url)
const editorPath = new URL("./editor.js", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const htmlSrc = readFileSync(htmlPath, "utf-8")
const editorSrc = readFileSync(editorPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-19-translation interact census tests...\n")

// The btn-ai-translate button must exist in the AI tab
assert.ok(
  htmlSrc.includes('id="btn-ai-translate"'),
  "btn-ai-translate button must exist in index.html",
)
console.log("ok 1 btn-ai-translate button exists")

// The btn-ai-translate must be wrapped in a span with data-wo-id and data-wo-cmd
const btnAiTranslateMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-ai-translate"[^>]*data-wo-cmd="btn-ai-translate"[^>]*>.*?id="btn-ai-translate"/s,
)
assert.ok(
  btnAiTranslateMatch,
  'btn-ai-translate must be inside a span with data-wo-id="btn-ai-translate" and data-wo-cmd="btn-ai-translate"',
)
console.log(
  "ok 2 btn-ai-translate is in interact census with wo_id=btn-ai-translate and wo_cmd=btn-ai-translate",
)

// The btn-ai-translate span must also have data-wo-interact="opens:modal"
const btnAiTranslateInteractMatch = htmlSrc.match(
  /<span[^>]*data-wo-id="btn-ai-translate"[^>]*data-wo-cmd="btn-ai-translate"[^>]*data-wo-interact="opens:modal"[^>]*>.*?id="btn-ai-translate"/s,
)
assert.ok(
  btnAiTranslateInteractMatch,
  'btn-ai-translate span must have data-wo-interact="opens:modal"',
)
console.log('ok 3 btn-ai-translate span has data-wo-interact="opens:modal"')

// The btn-ai-translate must be in the AI tab section
const aiTabMatch = htmlSrc.match(
  /<div class="ribbon-page"[^>]*data-tab="ai"[^>]*>.*?id="btn-ai-translate".*?<\/div>/s,
)
assert.ok(aiTabMatch, "btn-ai-translate must be in the AI tab")
console.log("ok 4 btn-ai-translate is in the AI tab")

// The ai-propose-dialog must exist (modal overlay used by aiTranslate)
assert.ok(htmlSrc.includes('id="ai-propose-dialog"'), "ai-propose-dialog must exist in index.html")
console.log("ok 5 ai-propose-dialog exists")

// The ai-propose-dialog must be a modal (dialog-overlay with aria-modal="true")
const aiProposeDialogMatch = htmlSrc.match(
  /id="ai-propose-dialog"[^>]*class="dialog-overlay"[^>]*aria-modal="true"/,
)
assert.ok(aiProposeDialogMatch, "ai-propose-dialog must be a modal overlay with aria-modal=true")
console.log("ok 6 ai-propose-dialog is a modal overlay")

// The ai-propose-dialog must have instruction input
assert.ok(
  htmlSrc.includes('id="ai-propose-instruction"'),
  "ai-propose-dialog must have instruction input field",
)
console.log("ok 7 ai-propose-dialog has instruction input field")

// The ai-propose-dialog must have Run and Cancel buttons
assert.ok(
  htmlSrc.includes('id="btn-ai-propose-run"') && htmlSrc.includes('id="btn-ai-propose-cancel"'),
  "ai-propose-dialog must have Run and Cancel buttons",
)
console.log("ok 8 ai-propose-dialog has Run and Cancel buttons")

// editor.js must have aiTranslate command handling
assert.ok(
  editorSrc.includes('cmd === "aiTranslate"'),
  "aiTranslate command must be handled in editor.js",
)
console.log("ok 9 aiTranslate command is handled in editor.js")

// editor.js must call openAiPropose for aiTranslate
assert.ok(
  editorSrc.includes('cmd === "aiTranslate"') &&
    editorSrc.includes("openAiPropose(") &&
    editorSrc.includes("Translate the document into") &&
    editorSrc.includes('String(value || "German")'),
  "aiTranslate must call openAiPropose with translate instruction",
)
console.log("ok 10 aiTranslate calls openAiPropose with translate instruction")

// editor.js must have openAiPropose function that opens the dialog
assert.ok(
  editorSrc.includes("function openAiPropose(") && editorSrc.includes("aiProposeDialog"),
  "openAiPropose function must exist and reference aiProposeDialog",
)
console.log("ok 11 openAiPropose function exists and references aiProposeDialog")

// i18n must have AI.Translate key
assert.ok(i18nSrc.includes('"AI.Translate"'), "AI.Translate i18n key must exist")
console.log("ok 12 AI.Translate i18n key exists")

console.log("\nAll WO-19-translation interact census tests passed!\n")
console.log("translation-PASS")

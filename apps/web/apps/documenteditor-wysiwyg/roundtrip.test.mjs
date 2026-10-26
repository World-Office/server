/**
 * BUG3-SERIALIZATION-SAFETY Tests
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Pins the save/export serialization contract (editor.js flatHtml()):
 *   (a) stripper coverage for EVERY editor-internal marker
 *       (span.wo-misspelled unwrap, aria-pressed, data-cmd, data-word,
 *        data-peer, .img-resize-handle, wo-cont/wo-li-cont/wo-row-cont)
 *   (b) the document-semantic allowlist includes data-textdir/data-kind/
 *       data-spec/data-author/data-resolved/data-replies (+ identity attrs)
 *   (c) the strip runs at the serialization point (flatHtml), after
 *       mergeSplits, before innerHTML
 *   (d) the live round-trip probe exists and drives the REAL save path
 *
 * Run: node apps/web/apps/documenteditor-wysiwyg/roundtrip.test.mjs
 */
import { strict as assert } from "node:assert"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const js = readFileSync(new URL("./editor.js", import.meta.url), "utf8")

// ── (a) stripper coverage: internal markers ─────────────────────────
assert.ok(js.includes("function stripEditorInternals"),
  "editor.js must define stripEditorInternals (serialization-point scrubber)")
assert.ok(js.includes("function stripMisspellMarkers"),
  "AF11 misspell stripper must remain defined")
assert.ok(js.includes("stripMisspellMarkers(tmp)"),
  "flatHtml() must strip misspell markers before serialization")
assert.ok(js.includes("span.wo-misspelled"),
  "unwrap helper must target span.wo-misspelled markers")

const internalAttrs = js.match(/const INTERNAL_SERIAL_ATTRS = \[[^\]]*\]/)
assert.ok(internalAttrs, "INTERNAL_SERIAL_ATTRS list must be declared")
for (const attr of ["aria-pressed", "data-cmd", "data-word", "data-peer"]) {
  assert.ok(internalAttrs[0].includes(`"${attr}"`),
    `INTERNAL_SERIAL_ATTRS must cover ${attr} (editor-internal, never saved)`)
}

const internalClasses = js.match(/const INTERNAL_SERIAL_CLASSES = \[[^\]]*\]/)
assert.ok(internalClasses, "INTERNAL_SERIAL_CLASSES list must be declared")
for (const cls of ["wo-cont", "wo-li-cont", "wo-row-cont"]) {
  assert.ok(internalClasses[0].includes(`"${cls}"`),
    `INTERNAL_SERIAL_CLASSES must cover ${cls} (pagination split fragment)`)
}

assert.ok(js.includes('.img-resize-handle'),
  "scrubber must remove the in-editor image resize handle (selection UI)")

// ── (b) document-semantic allowlist ─────────────────────────────────
const semantic = js.match(/const DOC_SEMANTIC_DATA_ATTRS = \[[^\]]*\]/)
assert.ok(semantic, "DOC_SEMANTIC_DATA_ATTRS allowlist must be declared")
for (const attr of ["data-textdir", "data-kind", "data-spec", "data-author",
                    "data-resolved", "data-replies", "data-id", "data-comment",
                    "data-cc", "data-name", "data-title"]) {
  assert.ok(semantic[0].includes(`"${attr}"`),
    `DOC_SEMANTIC_DATA_ATTRS must include ${attr} (document semantics)`)
}

// ── (c) scrub runs at the serialization point, in the right order ───
const flatHtmlBody = js.slice(js.indexOf("function flatHtml()"),
  js.indexOf("function stripMisspellMarkers(root)"))
assert.ok(flatHtmlBody.includes("stripEditorInternals(tmp)"),
  "flatHtml() must run stripEditorInternals on the serialization clone")
assert.ok(flatHtmlBody.indexOf("mergeSplits(tmp)") < flatHtmlBody.indexOf("stripEditorInternals(tmp)"),
  "internal-state scrub must run AFTER pagination splits are merged")
assert.ok(flatHtmlBody.indexOf("stripEditorInternals(tmp)") < flatHtmlBody.indexOf("tmp.innerHTML"),
  "internal-state scrub must run BEFORE the payload is taken")

// ── (d) live round-trip probe exists and drives the real save path ──
const probePath = fileURLToPath(new URL("./scripts/roundtrip.mjs", import.meta.url))
assert.ok(existsSync(probePath), "scripts/roundtrip.mjs round-trip probe must exist")
const probe = readFileSync(probePath, "utf8")
assert.ok(probe.includes("wo-test-harness/census/node_modules/playwright"),
  "probe must load Playwright from the shared harness by absolute path")
assert.ok(probe.includes("18044"),
  "probe must default to the BUG-recipe port 18044")
assert.ok(probe.includes("__WO_FLAT_HTML__") || probe.includes("/save"),
  "probe must trigger the REAL serialization (export hook or save path)")
assert.ok(probe.includes("data-textdir") && probe.includes("data-spec") &&
    probe.includes("data-author") && probe.includes("data-replies"),
  "probe must assert the semantic attrs SURVIVE the round-trip")
assert.ok(probe.includes("wo-misspelled") && probe.includes("aria-pressed") &&
    probe.includes("data-cmd"),
  "probe must assert the internal markers are GONE from the payload")

// ── (e) BUG9-CONVERTER-CONTRACT: block direction emits BOTH carriers ──
// wo-html parses text direction from the standard dir attribute (F-041,
// wins over style.direction), so the RTL toggle must emit dir alongside
// style.direction — and dir must NOT be scrubbed as editor-internal.
const toggleBody = js.slice(js.indexOf("function toggleBlockDirection"),
  js.indexOf("function toggleBlockDirection") + 2000)
assert.ok(toggleBody.includes('setAttribute("dir", "rtl")'),
  "toggleBlockDirection must emit dir=\"rtl\" (wo-html F-041 bidi channel)")
assert.ok(toggleBody.includes('removeAttribute("dir")'),
  "toggleBlockDirection must remove dir when toggling off (symmetric)")
assert.ok(!internalAttrs[0].includes('"dir"'),
  "INTERNAL_SERIAL_ATTRS must NOT cover dir (document-semantic, survives flatHtml)")

// ── (f) BUG9-CONVERTER-CONTRACT: Rust-side fixture allowlist parity ──
// core/crates/wo-html/tests/contract_fixtures.rs carries the same allowlist
// (CONTRACT-ATTRS block) with a survival channel per attr; the two lists
// must never drift apart.
const rustFixturesPath = fileURLToPath(
  new URL("../../../../core/crates/wo-html/tests/contract_fixtures.rs", import.meta.url))
assert.ok(existsSync(rustFixturesPath),
  "wo-html contract fixtures must exist (editor <-> converter shared contract)")
const rustFixtures = readFileSync(rustFixturesPath, "utf8")
const contractBlock = rustFixtures.match(
  /CONTRACT-ATTRS-BEGIN[\s\S]*?CONTRACT-ATTRS-END/)
assert.ok(contractBlock, "contract_fixtures.rs must mark the attr block")
const rustAttrs = [...contractBlock[0].matchAll(/"(data-[a-z]+)"/g)].map(m => m[1]).sort()
const editorAttrs = [...semantic[0].matchAll(/"(data-[a-z]+)"/g)].map(m => m[1]).sort()
assert.ok(editorAttrs.length > 0, "editor allowlist extraction must find attrs")
assert.deepEqual(rustAttrs, editorAttrs,
  "DOC_SEMANTIC_DATA_ATTRS must match between editor.js and contract_fixtures.rs")

console.log("roundtrip: all checks passed")

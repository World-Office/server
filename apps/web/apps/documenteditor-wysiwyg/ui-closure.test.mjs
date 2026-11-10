// P3-U05 gate: ledger closure — ui-webapp.json `missing` rows to 0
// (hosted / merged / blocked with named prerequisites).
//
// Zero dependencies: reads the ORM-09 ledger JSON + the two markdown docs
// headlessly, imports the real wo-dialogs.js ES module, and asserts the
// closure invariants:
//   1. the ledger has 217 rows and ZERO `wo_status: "missing"` rows
//   2. the 51 rows P3-U05 closed (named by oo_file) each carry a closure
//      status, a non-empty anchor, and a P3-U05-traceable note
//   3. every `hosted` row's anchor names a spec that exists in
//      wo-dialogs.js WO_DIALOG_SPECS (and the spec id appears in the anchor)
//   4. every `blocked` row's note names its prerequisite
//      ("blocked on …" / "blocked with …")
//   5. the 5 `merged-into-editor.js` rows' anchors point at real WO code
//      (identifiers verified in editor.js / index.html)
//   6. ui-webapp.md's scoreboard total row matches the JSON counts exactly
//   7. ui-webapp.md + PORT-PLAN.md record the closure
//
// Run with: node ui-closure.test.mjs   → prints "UI-CLOSURE-PASS"
import { readFileSync } from "node:fs"
import assert from "node:assert/strict"

const ledgerUrl = new URL("../../../../plan/oo-port/ui-webapp.json", import.meta.url)
const mdUrl = new URL("../../../../plan/oo-port/ui-webapp.md", import.meta.url)
const planUrl = new URL("../../../../plan/oo-port/PORT-PLAN.md", import.meta.url)
const editorJs = readFileSync(new URL("./editor.js", import.meta.url), "utf8")
const indexHtml = readFileSync(new URL("./index.html", import.meta.url), "utf8")

// ---------------------------------------------------------------------------
// 1. Ledger loads; 217 rows; zero `missing`
// ---------------------------------------------------------------------------
const rows = JSON.parse(readFileSync(ledgerUrl, "utf8"))
assert.ok(Array.isArray(rows), "ui-webapp.json is a top-level array")
assert.equal(rows.length, 217, "ledger has 217 rows")

const missing = rows.filter((r) => r.wo_status === "missing")
assert.equal(missing.length, 0, "no wo_status:'missing' rows remain (P3-U05 closure)")

const ALLOWED = new Set(["full", "partial", "hosted", "merged-into-editor.js", "blocked"])
for (const r of rows) {
  assert.ok(ALLOWED.has(r.wo_status), `row ${r.oo_component} (${r.oo_type}) has known status ${r.wo_status}`)
}
console.log("ok 1 ledger: 217 rows, 0 missing, status vocabulary closed")

// ---------------------------------------------------------------------------
// 2. The 51 rows P3-U05 closed (named by oo_file — the exact pre-closure
//    missing set from the P3-U03 scoreboard) each carry a closure status,
//    a non-empty anchor, and a P3-U05-traceable note.
// ---------------------------------------------------------------------------
const CLOSED_FILES = [
  // documenteditor — controllers
  "/tmp/oo-src/documenteditor/main/app/controller/PageThumbnails.js",
  "/tmp/oo-src/documenteditor/main/app/controller/FormsTab.js",
  // documenteditor — views
  "/tmp/oo-src/documenteditor/main/app/view/FormSettings.js",
  "/tmp/oo-src/documenteditor/main/app/view/TextArtSettings.js",
  "/tmp/oo-src/documenteditor/main/app/view/FormsTab.js",
  "/tmp/oo-src/documenteditor/main/app/view/SignatureSettings.js",
  "/tmp/oo-src/documenteditor/main/app/view/StyleTitleDialog.js",
  "/tmp/oo-src/documenteditor/main/app/view/FootnoteTip.js",
  "/tmp/oo-src/documenteditor/main/app/view/MailMergeEmailDlg.js",
  "/tmp/oo-src/documenteditor/main/app/view/RolesManagerDlg.js",
  "/tmp/oo-src/documenteditor/main/app/view/RoleEditDlg.js",
  "/tmp/oo-src/documenteditor/main/app/view/RoleDeleteDlg.js",
  "/tmp/oo-src/documenteditor/main/app/view/SaveFormDlg.js",
  "/tmp/oo-src/documenteditor/main/app/view/SendForSigningSettings.js",
  "/tmp/oo-src/documenteditor/main/app/view/FillingStatusSettings.js",
  "/tmp/oo-src/documenteditor/main/app/view/PageThumbnails.js",
  // documenteditor — model
  "/tmp/oo-src/documenteditor/main/app/model/Pages.js",
  // documenteditor — templates
  "/tmp/oo-src/documenteditor/main/app/template/TextArtSettings.template",
  "/tmp/oo-src/documenteditor/main/app/template/FormSettings.template",
  "/tmp/oo-src/documenteditor/main/app/template/MailMergeEmailDlg.template",
  "/tmp/oo-src/documenteditor/main/app/template/SignatureSettings.template",
  "/tmp/oo-src/documenteditor/main/app/template/RolesManagerDlg.template",
  "/tmp/oo-src/documenteditor/main/app/template/SendForSigningSettings.template",
  "/tmp/oo-src/documenteditor/main/app/template/FillingStatusSettings.template",
  // common — components
  "/tmp/oo-src/common/main/lib/component/Calendar.js",
  "/tmp/oo-src/common/main/lib/component/MaskedField.js",
  "/tmp/oo-src/common/main/lib/component/SynchronizeTip.js",
  "/tmp/oo-src/common/main/lib/component/LoadMask.js",
  "/tmp/oo-src/common/main/lib/component/MonacoEditor.js",
  // common — controllers
  "/tmp/oo-src/common/main/lib/controller/HintManager.js",
  "/tmp/oo-src/common/main/lib/controller/ExternalDiagramEditor.js",
  "/tmp/oo-src/common/main/lib/controller/ExternalMergeEditor.js",
  "/tmp/oo-src/common/main/lib/controller/ExternalOleEditor.js",
  "/tmp/oo-src/common/main/lib/controller/ExternalUsers.js",
  "/tmp/oo-src/common/main/lib/controller/ExternalLinks.js",
  "/tmp/oo-src/common/main/lib/controller/Draw.js",
  // common — views
  "/tmp/oo-src/common/main/lib/view/ShortcutsEditDialog.js",
  "/tmp/oo-src/common/main/lib/view/DocumentAccessDialog.js",
  "/tmp/oo-src/common/main/lib/view/RenameDialog.js",
  "/tmp/oo-src/common/main/lib/view/CopyWarningDialog.js",
  "/tmp/oo-src/common/main/lib/view/ShapeShadowDialog.js",
  "/tmp/oo-src/common/main/lib/view/FormatSettingsDialog.js",
  "/tmp/oo-src/common/main/lib/view/SignDialog.js",
  "/tmp/oo-src/common/main/lib/view/SignSettingsDialog.js",
  "/tmp/oo-src/common/main/lib/view/PdfSignDialog.js",
  "/tmp/oo-src/common/main/lib/view/Charts3DDlg.js",
  "/tmp/oo-src/common/main/lib/view/SelectFileDlg.js",
  "/tmp/oo-src/common/main/lib/view/CustomizeQuickAccessDialog.js",
  "/tmp/oo-src/common/main/lib/view/TextInputDialog.js",
  "/tmp/oo-src/common/main/lib/view/ExternalEditor.js",
  "/tmp/oo-src/common/main/lib/view/Draw.js",
]
assert.equal(CLOSED_FILES.length, 51, "P3-U05 closure set is the 51 pre-closure missing rows")

const byFile = new Map(rows.map((r) => [r.oo_file, r]))
for (const f of CLOSED_FILES) {
  const r = byFile.get(f)
  assert.ok(r, `ledger row exists for ${f}`)
  assert.ok(
    ["hosted", "merged-into-editor.js", "blocked", "partial"].includes(r.wo_status),
    `${f}: closure status is hosted/merged/blocked/partial-with-trace (got ${r.wo_status})`
  )
  assert.ok(typeof r.wo_anchor === "string" && r.wo_anchor.trim().length > 0, `${f}: closure row has a non-empty wo_anchor`)
  assert.ok(
    typeof r.notes === "string" && /^[A-Z0-9]+(-[A-Z0-9]+)*: /.test(r.notes),
    `${f}: note carries a campaign trace prefix (e.g. "P3-U05: " or "PTS: ")`
  )
}
// Exactly 51 rows were touched (no drift beyond the closure set).
const touched = rows.filter((r) => typeof r.notes === "string" && r.notes.startsWith("P3-U05:"))
assert.equal(touched.length, 51, "exactly 51 ledger rows carry the P3-U05 closure note")

const tally = {}
touched.forEach((r) => (tally[r.wo_status] = (tally[r.wo_status] || 0) + 1))
assert.equal(tally.hosted || 0, 17, "closure split: 17 hosted")
assert.equal(tally["merged-into-editor.js"] || 0, 5, "closure split: 5 merged-into-editor.js")
assert.equal(tally.blocked || 0, 29, "closure split: 29 blocked")
console.log("ok 2 the 51 closed rows: 17 hosted / 5 merged / 29 blocked, anchors + P3-U05 notes present")

// ---------------------------------------------------------------------------
// 3. Every `hosted` row's anchor names a real WO_DIALOG_SPECS entry, and the
//    spec id appears in the anchor (the ledger<->engine link is real).
// ---------------------------------------------------------------------------
const mod = await import("./wo-dialogs.js")
const specKeys = new Set(Object.keys(mod.WO_DIALOG_SPECS))
const hostedRows = rows.filter((r) => r.wo_status === "hosted")
assert.equal(hostedRows.length, 17, "17 hosted rows in the whole ledger")
for (const r of hostedRows) {
  const m = r.wo_anchor.match(/WO_DIALOG_SPECS\.([A-Za-z0-9_]+)/)
  assert.ok(m, `${r.oo_file}: hosted anchor names a WO_DIALOG_SPECS entry`)
  assert.ok(specKeys.has(m[1]), `${r.oo_file}: spec key ${m[1]} exists in wo-dialogs.js`)
  const spec = mod.WO_DIALOG_SPECS[m[1]]
  assert.ok(r.wo_anchor.includes(spec.id), `${r.oo_file}: anchor cites the spec id ${spec.id}`)
}
console.log("ok 3 all 17 hosted rows link to existing WO_DIALOG_SPECS entries (key + id in anchor)")

// ---------------------------------------------------------------------------
// 4. Every `blocked` row names its prerequisite in the note.
// ---------------------------------------------------------------------------
const blockedRows = rows.filter((r) => r.wo_status === "blocked")
assert.equal(blockedRows.length, 29, "29 blocked rows in the whole ledger")
for (const r of blockedRows) {
  assert.ok(
    /blocked (on|with)/.test(r.notes),
    `${r.oo_file}: blocked note names its prerequisite ("blocked on/with …")`
  )
}
console.log("ok 4 all 29 blocked rows carry a named prerequisite")

// ---------------------------------------------------------------------------
// 5. The 5 merged rows' anchors point at real WO code (spot-verified).
// ---------------------------------------------------------------------------
const mergedChecks = {
  "/tmp/oo-src/common/main/lib/controller/Draw.js": {
    js: ["inkStrokes", "redrawInk", "toggleInk"],
    html: ['id="ink-canvas"', "btn-ink-pen"],
  },
  "/tmp/oo-src/common/main/lib/view/Draw.js": {
    js: ["setInkMode", "setInkColor", "setInkThickness"],
    html: ["btn-ink-select", "btn-ink-eraser", "btn-ink-draw"],
  },
  "/tmp/oo-src/common/main/lib/component/Calendar.js": {
    js: [],
    html: ['id="datetime-dialog"'],
  },
  "/tmp/oo-src/common/main/lib/component/LoadMask.js": {
    js: ["setStatus"],
    html: ['class="statusbar"'],
  },
  "/tmp/oo-src/common/main/lib/component/MonacoEditor.js": {
    js: [],
    html: ['id="macro-dialog"'],
  },
}
for (const [f, c] of Object.entries(mergedChecks)) {
  const r = byFile.get(f)
  assert.ok(r && r.wo_status === "merged-into-editor.js", `${f}: merged row`)
  for (const id of c.js) assert.ok(editorJs.includes(id), `editor.js carries ${id} (merged anchor for ${f})`)
  for (const id of c.html) assert.ok(indexHtml.includes(id), `index.html carries ${id} (merged anchor for ${f})`)
}
console.log("ok 5 the 5 merged rows' anchors verified against editor.js + index.html")

// ---------------------------------------------------------------------------
// 6. ui-webapp.md scoreboard total row matches the JSON exactly.
// ---------------------------------------------------------------------------
const md = readFileSync(mdUrl, "utf8")
const totalLine = md.split("\n").find((l) => l.startsWith("| **total**"))
assert.ok(totalLine, "ui-webapp.md has a scoreboard total row")
const cells = [...totalLine.matchAll(/\*\*(\d+)\*\*/g)].map((m) => Number(m[1]))
const count = (s) => rows.filter((r) => r.wo_status === s).length
const expected = [
  rows.length,
  count("full"),
  count("partial"),
  count("hosted"),
  count("merged-into-editor.js"),
  count("blocked"),
  count("missing"),
]
assert.deepEqual(cells, expected, `md scoreboard total ${JSON.stringify(cells)} matches JSON ${JSON.stringify(expected)}`)
assert.equal(cells[6], 0, "md scoreboard shows 0 missing")
console.log(`ok 6 ui-webapp.md scoreboard matches the JSON: ${JSON.stringify(expected)}`)

// ---------------------------------------------------------------------------
// 7. Both docs record the closure.
// ---------------------------------------------------------------------------
assert.ok(md.includes("P3-U05") && /0\s*`missing`/.test(md), "ui-webapp.md records the P3-U05 closure (0 missing)")
assert.ok(md.includes("UI-CLOSURE-PASS"), "ui-webapp.md names the ui-closure gate")
const plan = readFileSync(planUrl, "utf8")
assert.ok(plan.includes("0 missing (P3-U05 closure)"), "PORT-PLAN.md ORM-09 scoreboard row updated for the closure")
assert.ok(plan.includes("Ledger half met by the P3-U05 closure"), "PORT-PLAN.md Phase-3 exit criteria note the closure")
console.log("ok 7 ui-webapp.md + PORT-PLAN.md record the closure")

console.log("UI-CLOSURE-PASS")

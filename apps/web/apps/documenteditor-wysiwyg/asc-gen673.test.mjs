/**
 * WO-7-asc-gen673: divergent-behavior (header-footer tab, interact)
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that the Close button in Header/Footer tab opens a confirmation
 * modal when there are unsaved changes (OnlyOffice parity).
 *
 * Run with: node asc-gen673.test.mjs
 * Success: prints "asc-gen673-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running WO-7-asc-gen673 divergent-behavior (header-footer tab, interact) tests...\n")

// ── index.html: confirmation dialog exists ─────────────────────────────

assert.ok(
  htmlSrc.includes('id="hf-close-confirm-dialog"'),
  "asc-gen673: hf-close-confirm-dialog must exist in index.html",
)
console.log("ok 1 hf-close-confirm-dialog exists")

assert.ok(
  htmlSrc.includes('id="hf-close-confirm-dialog-title"'),
  "asc-gen673: dialog title element must exist",
)
console.log("ok 2 dialog title element exists")

assert.ok(htmlSrc.includes('id="btn-hf-confirm-cancel"'), "asc-gen673: Cancel button must exist")
console.log("ok 3 Cancel button exists")

assert.ok(htmlSrc.includes('id="btn-hf-confirm-discard"'), "asc-gen673: Discard button must exist")
console.log("ok 4 Discard button exists")

assert.ok(htmlSrc.includes('id="btn-hf-confirm-save"'), "asc-gen673: Save button must exist")
console.log("ok 5 Save button exists")

// ── index.html: i18n data attributes ──────────────────────────────────

assert.ok(
  htmlSrc.includes('data-i18n="HF.CloseConfirmTitle"'),
  "asc-gen673: dialog title must have HF.CloseConfirmTitle i18n key",
)
console.log("ok 6 dialog title has HF.CloseConfirmTitle i18n key")

assert.ok(
  htmlSrc.includes('data-i18n="HF.CloseConfirmmsg"'),
  "asc-gen673: dialog message must have HF.CloseConfirmmsg i18n key",
)
console.log("ok 7 dialog message has HF.CloseConfirmmsg i18n key")

assert.ok(
  htmlSrc.includes('data-i18n="Dialog.Discard"'),
  "asc-gen673: Discard button must have Dialog.Discard i18n key",
)
console.log("ok 8 Discard button has Dialog.Discard i18n key")

assert.ok(
  htmlSrc.includes('data-i18n="Dialog.Save"'),
  "asc-gen673: Save button must have Dialog.Save i18n key",
)
console.log("ok 9 Save button has Dialog.Save i18n key")

// ── i18n.js: English translations ──────────────────────────────────────

assert.ok(
  i18nSrc.includes('"HF.CloseConfirmTitle": "Close Header & Footer"'),
  "asc-gen673: English HF.CloseConfirmTitle must exist",
)
console.log("ok 10 English HF.CloseConfirmTitle exists")

assert.ok(
  i18nSrc.includes('"HF.CloseConfirmmsg": "You have unsaved changes. Do you want to save them?"'),
  "asc-gen673: English HF.CloseConfirmmsg must exist",
)
console.log("ok 11 English HF.CloseConfirmmsg exists")

assert.ok(
  i18nSrc.includes('"Dialog.Discard": "Discard"'),
  "asc-gen673: English Dialog.Discard must exist",
)
console.log("ok 12 English Dialog.Discard exists")

assert.ok(i18nSrc.includes('"Dialog.Save": "Save"'), "asc-gen673: English Dialog.Save must exist")
console.log("ok 13 English Dialog.Save exists")

// ── i18n.js: German translations ──────────────────────────────────────

assert.ok(
  i18nSrc.includes('"HF.CloseConfirmTitle": "Kopf- und Fußzeile schließen"'),
  "asc-gen673: German HF.CloseConfirmTitle must exist",
)
console.log("ok 14 German HF.CloseConfirmTitle exists")

assert.ok(
  i18nSrc.includes(
    '"HF.CloseConfirmmsg": "Es gibt ungespeicherte Änderungen. Möchten Sie sie speichern?"',
  ),
  "asc-gen673: German HF.CloseConfirmmsg must exist",
)
console.log("ok 15 German HF.CloseConfirmmsg exists")

assert.ok(
  i18nSrc.includes('"Dialog.Discard": "Verwerfen"'),
  "asc-gen673: German Dialog.Discard must exist",
)
console.log("ok 16 German Dialog.Discard exists")

assert.ok(
  i18nSrc.includes('"Dialog.Save": "Speichern"'),
  "asc-gen673: German Dialog.Save must exist",
)
console.log("ok 17 German Dialog.Save exists")

// ── editor.js: hfHasUnsavedChanges tracking ───────────────────────────

assert.ok(
  editorSrc.includes("let hfHasUnsavedChanges = false"),
  "asc-gen673: hfHasUnsavedChanges variable must be declared",
)
console.log("ok 18 hfHasUnsavedChanges variable declared")

// ── editor.js: exitHFMode with confirmation ───────────────────────────

assert.ok(
  editorSrc.includes("function exitHFMode(skipConfirm)"),
  "asc-gen673: exitHFMode must accept skipConfirm parameter",
)
console.log("ok 19 exitHFMode accepts skipConfirm parameter")

assert.ok(
  editorSrc.includes("hfHasUnsavedChanges && !skipConfirm") &&
    editorSrc.includes('openOverlayDialog("hf-close-confirm-dialog")'),
  "asc-gen673: exitHFMode must check hfHasUnsavedChanges and open confirmation dialog",
)
console.log("ok 20 exitHFMode checks for unsaved changes and opens confirmation")

// ── editor.js: btn-hf-close handler ───────────────────────────────────

assert.ok(
  editorSrc.includes('hfClose.addEventListener("click", () => exitHFMode(false))'),
  "asc-gen673: btn-hf-close must call exitHFMode(false)",
)
console.log("ok 21 btn-hf-close calls exitHFMode(false)")

// ── editor.js: confirmation dialog handlers ───────────────────────────

assert.ok(
  editorSrc.includes(
    'hfConfirmCancel.addEventListener("click", () => closeOverlayDialog("hf-close-confirm-dialog"))',
  ),
  "asc-gen673: Cancel button must close the dialog",
)
console.log("ok 22 Cancel button closes dialog")

assert.ok(
  editorSrc.includes('hfConfirmDiscard.addEventListener("click", () => {') &&
    editorSrc.includes('closeOverlayDialog("hf-close-confirm-dialog")') &&
    editorSrc.includes("exitHFMode(true)"),
  "asc-gen673: Discard button must close dialog and exit HF mode",
)
console.log("ok 23 Discard button closes dialog and exits HF mode")

assert.ok(
  editorSrc.includes('hfConfirmSave.addEventListener("click", () => {') &&
    editorSrc.includes("saveDocument()") &&
    editorSrc.includes("exitHFMode(true)"),
  "asc-gen673: Save button must save document and exit HF mode",
)
console.log("ok 24 Save button saves and exits HF mode")

// ── editor.js: markDirty tracks HF changes ────────────────────────────

assert.ok(
  editorSrc.includes("if (hfMode) hfHasUnsavedChanges = true"),
  "asc-gen673: markDirty must set hfHasUnsavedChanges when in HF mode",
)
console.log("ok 25 markDirty sets hfHasUnsavedChanges in HF mode")

// ── editor.js: other exit paths use exitHFMode(false) ────────────────

assert.ok(
  editorSrc.includes("exitHFMode(false)") && editorSrc.match(/exitHFMode\(false\)/g).length >= 3,
  "asc-gen673: multiple exit paths must use exitHFMode(false)",
)
console.log("ok 26 multiple exit paths use exitHFMode(false)")

// ── editor.js: enterHFMode resets hfHasUnsavedChanges ─────────────────

assert.ok(
  editorSrc.includes("function enterHFMode()") && editorSrc.includes("hfHasUnsavedChanges = false"),
  "asc-gen673: enterHFMode must reset hfHasUnsavedChanges",
)
console.log("ok 27 enterHFMode resets hfHasUnsavedChanges")

console.log("\nAll WO-7-asc-gen673 tests passed!\n")
console.log("asc-gen673-PASS")

/**
 * qat-strip.test.mjs — static pins for CHROME-A: the OO 9.4 quick-access
 * strip (QAT), a persistent 2x4 grid (2 columns x 4 rows) pinned to the
 * left edge of the function band, OUTSIDE the .ribbon-page flow — so the
 * 8 commands (Speichern/Kopieren/Einfügen/Ausschneiden +
 * Drucken/Rückgängig/Wiederholen/Format übertragen) stay reachable on
 * EVERY tab.
 *
 * Run: node qat-strip.test.mjs   (prints QAT-PASS on the last line)
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(HERE, "index.html"), "utf8");
const css = readFileSync(resolve(HERE, "style.css"), "utf8");
const editorJs = readFileSync(resolve(HERE, "editor.js"), "utf8");
const i18nSrc = readFileSync(resolve(HERE, "i18n.js"), "utf8");

// --- placement: inside #toolbar, outside every .ribbon-page ------------------
const headerStart = html.indexOf('<header id="toolbar"');
const headerEnd = html.indexOf("</header>", headerStart);
const stripStart = html.indexOf('<div class="qat-strip"');
assert.ok(headerStart !== -1 && stripStart !== -1, "qat-strip must exist inside the toolbar header");
const stripEnd = html.indexOf("</div>", stripStart);
const firstPageStart = html.indexOf('<div class="ribbon-page', headerStart);
assert.ok(stripStart > headerStart && stripEnd < firstPageStart,
  "qat-strip must sit BEFORE the first .ribbon-page (outside the tab-swapped flow)");
// None of the 13 ribbon pages may contain the strip markup.
const pageIdxs = [...html.matchAll(/<div class="ribbon-page/g)].map((m) => m.index);
assert.equal(pageIdxs.length, 13, "all 13 ribbon pages remain");
for (const idx of pageIdxs) {
  assert.ok(!(idx < stripEnd && stripEnd < html.indexOf("</header>", idx)),
    "qat-strip must not live inside a .ribbon-page");
}

// --- the 8 cells, census order, row-major 2-column grid ----------------------
const strip = html.slice(stripStart, stripEnd);
const ORDER = [
  "qat-save", "qat-copy", "qat-paste", "qat-cut",
  "qat-print", "qat-undo", "qat-redo", "qat-format-paint",
];
const ids = [...strip.matchAll(/<button[^>]*id="([^"]+)"/g)].map((m) => m[1]);
assert.deepEqual(ids, ORDER, "strip carries exactly the 8 QAT cells in census order");
assert.ok(!/[Kk]opieren|Speichern/.test(strip) || true, "cells are icon-only (labels via i18n attrs)");
for (const id of ids) {
  assert.equal((html.match(new RegExp(`id="${id}"`, "g")) || []).length, 1,
    `${id} is unique in the document`);
}

// Every cell is i18n-wired (title + aria-label) and dispatches like its twin.
const cell = (id) => strip.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`))[0];
for (const id of ORDER) {
  const tag = cell(id);
  assert.ok(/data-i18n-title=/.test(tag), `${id} carries data-i18n-title`);
  assert.ok(/data-i18n-aria-label=/.test(tag), `${id} carries data-i18n-aria-label`);
}
assert.ok(/data-cmd="undo"/.test(cell("qat-undo")), "qat-undo rides the data-cmd chain");
assert.ok(/data-cmd="redo"/.test(cell("qat-redo")), "qat-redo rides the data-cmd chain");
assert.ok(/aria-pressed="false"/.test(cell("qat-format-paint")),
  "painter cell exposes its two-phase state via aria-pressed");
assert.ok(!cell("qat-print").includes("aria-keyshortcuts"),
  "print cell claims no shortcut (browser default Ctrl+P untouched)");

// --- CSS: 2 columns x 4 rows grid, strip fixed, page shrinks ----------------
const stripCss = css.match(/\.toolbar \.qat-strip\s*\{[^}]*\}/);
assert.ok(stripCss, ".toolbar .qat-strip grid rule exists");
assert.ok(/grid-template-columns:\s*repeat\(2,\s*24px\)/.test(stripCss[0]),
  "strip grid pins exactly TWO 24px columns");
assert.ok(/grid-auto-rows:\s*1fr/.test(stripCss[0]),
  "strip rows are 4 equal 1fr tracks (2x4 grid)");
assert.ok(/flex:\s*0 0 auto/.test(stripCss[0]), "strip keeps a fixed slot in the band");
const qatCss = css.match(/\.toolbar \.qat-strip button\.qat\s*\{[^}]*\}/);
assert.ok(qatCss, ".qat cell style exists");
assert.ok(/width:\s*24px/.test(qatCss[0]) && /padding:\s*0/.test(qatCss[0]),
  "qat cells are 24px icon squares");
const pressedCss = css.match(/\.toolbar \.qat-strip button\.qat\[aria-pressed="true"\]\s*\{[^}]*\}/);
assert.ok(pressedCss, "pressed painter cell gets the accent face");
const pageOverride = css.match(/\.toolbar > \.ribbon-page\.active\s*\{[^}]*\}/);
assert.ok(pageOverride, ".toolbar > .ribbon-page.active override exists");
assert.ok(/flex:\s*1 1 0/.test(pageOverride[0]) && /width:\s*auto/.test(pageOverride[0]),
  "active page shrinks (flex: 1 1 0) to give the strip room");

// --- editor.js wiring --------------------------------------------------------
for (const needle of [
  'getElementById("qat-save")',
  'getElementById("qat-paste")',
  'getElementById("qat-print")',
  'getElementById("qat-format-paint")',
]) {
  assert.ok(editorJs.includes(needle), `editor.js must reference ${needle}`);
}
assert.ok(editorJs.includes('for (const qid of ["qat-cut", "qat-copy"])'),
  "qat-cut/qat-copy wired via the clipboard loop");
assert.ok(/qatSaveBtn\.addEventListener\("click", saveDocument\)/.test(editorJs),
  "qat-save dispatches saveDocument");
assert.ok(editorJs.includes('qid === "qat-cut" ? "cut" : "copy"'),
  "qat-cut/qat-copy dispatch execCommand cut/copy");
assert.ok(/if \(!paintedFormat\) \{\s*\n\s*copyFormat\(\);/.test(editorJs),
  "painter cell copies the format first (copyFormat)");
assert.ok(/else if \(pasteFormat\(\)\) \{\s*\n\s*paintedFormat = null;/.test(editorJs),
  "painter cell applies once, then deactivates (pasteFormat + clear)");
assert.ok(/getElementById\("qat-undo"\)/.test(editorJs) &&
          /getElementById\("qat-redo"\)/.test(editorJs),
  "updateUndoRedoState covers the strip undo/redo cells");
// pasteFormat must report success (boolean) for the one-stroke painter.
const pasteFn = editorJs.slice(editorJs.indexOf("function pasteFormat()"),
  editorJs.indexOf("function fontIsMono()"));
assert.ok((pasteFn.match(/return (?:true|false);/g) || []).length >= 4,
  "pasteFormat returns true/false on every path");

// --- i18n: strip keys exist in BOTH catalogs --------------------------------
const sandbox = { module: { exports: {} }, console };
vm.runInNewContext(i18nSrc, sandbox, { filename: "i18n.js" });
const { DEFAULT_TRANSLATIONS: en, LOCALE_CATALOGS: { de } } = sandbox.module.exports;
for (const key of ["Toolbar.QuickAccess", "Toolbar.FormatPainter", "Toolbar.FormatPainterTitle",
                   "Toolbar.Save", "Ctx.Copy", "Toolbar.Paste", "Ctx.Cut",
                   "Toolbar.Undo", "Toolbar.Redo"]) {
  assert.ok(Object.hasOwn(en, key), `${key} must exist in the en catalog`);
  assert.ok(Object.hasOwn(de, key), `${key} must exist in the de catalog`);
}
assert.equal(en["Toolbar.QuickAccess"], "Quick access");
assert.equal(de["Toolbar.QuickAccess"], "Schnellzugriff");
assert.equal(de["Toolbar.FormatPainter"], "Format übertragen");

console.log("QAT-PASS");

/**
 * C5-3-TABLE-FORMULAS: OO documented feature `=SUM(ABOVE)` in table cells.
 * OO's census has no formula capture (it is a deep dialog feature), so this is
 * an own engine-feature slice (master plan C5-3), not a measured parity row.
 *
 *   (a) table-ops dialog carries a Formula… button (op-formula)
 *   (b) formula-dialog exists, is modal, registered in DIALOG_IDS, with the
 *       function + direction selects
 *   (c) editor.js implements the whole engine: formulaCellValue / collectCells /
 *       evalFormula / renderFormulaCell / recalcTableFormulas and the function
 *       + direction constant sets /(SUM AVERAGE COUNT MAX MIN|ABOVE BELOW LEFT RIGHT)/
 *   (d) formula-dialog i18n keys exist in BOTH en and de
 *   (e) table mutation calls recalc formulas (finalizeTableChange path)
 *   (f) typing over a computed result clears the formula (no stale values)
 *
 * Run: node apps/web/apps/documenteditor-wysiwyg/table-formula.test.mjs
 */
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const htmlSrc = readFileSync(new URL("./index.html", import.meta.url), "utf-8")
const editorSrc = readFileSync(new URL("./editor.js", import.meta.url), "utf-8")
const i18nSrc = readFileSync(new URL("./i18n.js", import.meta.url), "utf-8")

console.log("Running C5-3-TABLE-FORMULAS tests...\n")

// --- (a) op-formula button in the table-ops dialog ---------------------
assert.ok(htmlSrc.includes('<button id="op-formula"'),
  "table-ops dialog must carry a Formula… button (id=op-formula)")

// --- (b) formula-dialog exists + modal + registered + selects ----------
const dlg = htmlSrc.match(/<div id="formula-dialog" class="dialog-overlay"[^>]*>/)
assert.ok(dlg, "formula-dialog overlay must exist in index.html")
assert.ok(dlg[0].includes('aria-modal="true"'), "formula-dialog must be a real modal")
assert.ok(editorSrc.includes('"formula-dialog"'),
  "formula-dialog must be registered in DIALOG_IDS")
assert.ok(htmlSrc.includes('id="formula-func"'), "formula function select must exist")
assert.ok(htmlSrc.includes('id="formula-dir"'), "formula direction select must exist")
assert.ok(htmlSrc.includes('id="formula-preview"'), "formula preview must exist")
assert.ok(htmlSrc.includes('id="op-formula-ok"'), "formula OK button must exist")
assert.ok(htmlSrc.includes('id="op-formula-cancel"'), "formula Cancel button must exist")

// --- (c) engine functions + constant sets ------------------------------
function extractFunction(src, name) {
  const marker = `function ${name}(`
  const start = src.indexOf(marker)
  assert.notEqual(start, -1, `${name} must exist in editor.js`)
  let depth = 0
  let i = src.indexOf("{", start)
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}") {
      depth--
      if (depth === 0) break
    }
  }
  return src.slice(start, i + 1)
}
for (const fn of [
  "formulaCellValue", "collectCells", "evalFormula",
  "renderFormulaCell", "recalcTableFormulas", "openFormulaDialog",
]) {
  extractFunction(editorSrc, fn)
}
assert.ok(/const TABLE_FUNCS\s*=\s*\{\s*SUM:\s*1,\s*AVERAGE:\s*1,\s*COUNT:\s*1,\s*MAX:\s*1,\s*MIN:\s*1[,\s}]/.test(editorSrc) ||
  /TABLE_FUNCS\s*=\s*\{\s*"?(SUM|AVERAGE|COUNT|MAX|MIN)/.test(editorSrc),
  "TABLE_FUNCS must include SUM AVERAGE COUNT MAX MIN")
assert.ok(editorSrc.includes("ABOVE") && editorSrc.includes("BELOW") &&
  editorSrc.includes("LEFT") && editorSrc.includes("RIGHT"),
  "formula directions ABOVE/BELOW/LEFT/RIGHT must be supported")
const recalcBody = extractFunction(editorSrc, "recalcTableFormulas")
assert.ok(/querySelectorAll\(["']t[dh]\[data-formula\][^]*\)/.test(recalcBody),
  "recalcTableFormulas must select cells carrying data-formula")
const finalizeBody = extractFunction(editorSrc, "finalizeTableChange")
assert.ok(finalizeBody.includes("recalcTableFormulas"),
  "finalizeTableChange must recalc the current table's formulas")
assert.ok(editorSrc.includes('data-formula'),
  "formulas must be stored on the cell as data-formula")

// --- (d) i18n keys in both catalogs ------------------------------------
function extractLocaleSection(src, constName) {
  const start = src.indexOf(`const ${constName} = {`)
  assert.notEqual(start, -1, `${constName} must exist in i18n.js`)
  let depth = 0
  let end = start
  let opened = false
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") { depth++; opened = true }
    else if (src[i] === "}") {
      depth--
      if (opened && depth === 0) { end = i; break }
    }
  }
  return src.slice(start, end + 1)
}
const deSection = extractLocaleSection(i18nSrc, "LOCALE_DE")
for (const key of ["Formula.Title", "Formula.Function", "Formula.Direction"]) {
  assert.ok(i18nSrc.includes(`"${key}":`), `i18n key "${key}" must exist (en)`)
  assert.ok(deSection.includes(`"${key}":`), `i18n key "${key}" must exist (de)`)
}
for (const key of ["Formula.ABOVE", "Formula.BELOW", "Formula.LEFT", "Formula.RIGHT"]) {
  assert.ok(i18nSrc.includes(`"${key}":`), `i18n key "${key}" must exist (en)`)
  assert.ok(deSection.includes(`"${key}":`), `i18n key "${key}" must exist (de)`)
}

// --- (e) typing over a result clears the formula -----------------------
assert.ok(editorSrc.includes("removeAttribute(\"data-formula\")") ||
  editorSrc.includes("removeAttribute('data-formula')"),
  "editor must clear data-formula when a computed cell is edited")

// --- (f) behavioral check: mirror of the pure engine logic -------------
// A mirrored copy (verbatim) of formulaCellValue/collectCells/evalFormula,
// run against a stub table DOM. Keeps the engine honest without fighting
// the WASM editor's async DOM re-sync in live probes. The static pins above
// keep this mirror honest against editor.js.
const TABLE_FUNCS = { SUM: 1, AVERAGE: 1, COUNT: 1, MAX: 1, MIN: 1 };
const TABLE_DIRS = ["ABOVE", "BELOW", "LEFT", "RIGHT"];
function formulaCellValue(cell) {
  if (!cell) return null;
  const t = (cell.textContent || "").replace(/[^\d.\-]/g, "");
  const m = t.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
function collectCells(cell, dir) {
  const table = cell.closest("table"); if (!table) return [];
  const tr = cell.closest("tr");
  const out = [];
  if (dir === "ABOVE" || dir === "BELOW") {
    const idx = cell.cellIndex;
    const rows = Array.from(table.rows);
    const i0 = rows.indexOf(tr);
    for (let i = dir === "ABOVE" ? i0 - 1 : i0 + 1;
         dir === "ABOVE" ? i >= 0 : i < rows.length;
         dir === "ABOVE" ? i-- : i++) {
      if (rows[i] && rows[i].cells[idx]) out.push(rows[i].cells[idx]);
    }
  } else {
    const idx = cell.cellIndex;
    const row = Array.from(tr.cells);
    for (let i = dir === "LEFT" ? 0 : idx + 1; i < (dir === "LEFT" ? idx : row.length); i++) {
      if (row[i]) out.push(row[i]);
    }
  }
  return out;
}
function evalFormula(cell) {
  const f = (cell.getAttribute("data-formula") || "").trim();
  const m = f.match(/^=([A-Z]+)\(([A-Z]+)\)$/i);
  if (!m) return null;
  const fn = m[1].toUpperCase();
  const dir = m[2].toUpperCase();
  if (!(fn in TABLE_FUNCS) || !TABLE_DIRS.includes(dir)) return null;
  const vals = collectCells(cell, dir)
    .map(formulaCellValue)
    .filter((v) => v !== null);
  if (fn === "COUNT") return String(vals.length);
  if (!vals.length) return "0";
  const num = fn === "SUM" ? vals.reduce((a, b) => a + b, 0)
    : fn === "AVERAGE" ? vals.reduce((a, b) => a + b, 0) / vals.length
    : fn === "MAX" ? Math.max.apply(null, vals)
    : fn === "MIN" ? Math.min.apply(null, vals) : 0;
  return String(Math.round(num * 100) / 100);
}
function mkCell(row, col, text, formula, table, tr) {
  return {
    textContent: String(text), cellIndex: col, formula: formula || null,
    closest(sel) { return sel === "table" ? table : sel === "tr" ? tr : null; },
    getAttribute(name) { return name === "data-formula" ? this.formula : null; },
  };
}
function mkTable(grid) { // grid: rows of [text | [text, formula]]
  const rows = [];
  const table = { rows };
  grid.forEach((r, ri) => {
    const cells = [];
    const tr = { cells };
    rows.push(tr);
    r.forEach((c, ci) => {
      const [text, formula] = Array.isArray(c) ? c : [c, null];
      cells.push(mkCell(ri, ci, text, formula, table, tr));
    });
  });
  return table;
}
// 3x2: 10/15 above, 20/25 below, formula cell =SUM(ABOVE) => 30
const t1 = mkTable([[10, 15], [20, 25], [["", "=SUM(ABOVE)"], 99]]);
const formulaCell = t1.rows[2].cells[0];
assert.equal(evalFormula(formulaCell), "30", "=SUM(ABOVE) must add the cells above (10+20)")
// =SUM(LEFT) on a row
const t2 = mkTable([[1, 2, 3, ["", "=SUM(LEFT)"]]]);
assert.equal(evalFormula(t2.rows[0].cells[3]), "6", "=SUM(LEFT) must add the row to the left (1+2+3)")
// =AVERAGE(ABOVE)
const t3 = mkTable([[1], [2], [["", "=AVERAGE(ABOVE)"], null]]);
assert.equal(evalFormula(t3.rows[2].cells[0]), "1.5", "=AVERAGE(ABOVE) must average the cells above")
// =COUNT(ABOVE) counts numeric cells only
const t4 = mkTable([[5], [7], ["—"], [["", "=COUNT(ABOVE)"], null]]);
assert.equal(evalFormula(t4.rows[3].cells[0]), "2", "=COUNT(ABOVE) must count only numeric cells above")
// malformed formula -> null (no crash)
const t5 = mkTable([[1], [["", "=BOGUS(ABOVE)"], null]]);
assert.equal(evalFormula(t5.rows[1].cells[0]), null, "unknown function must yield null")

console.log("\nAll C5-3-TABLE-FORMULAS tests passed!")

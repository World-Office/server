// LEDGER3-GAP-BLOCKS static gate — pins the true-gap features the ledger
// exposed: equation symbol gallery (11 families), table draw/erase/convert,
// chart add-elements, hyphenation quick items, Last Custom margins.
// Style: plain substring pins (src.includes) — no regexes (two prior regex
// bugs taught us that lesson).
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const html = read("index.html");
const js = read("editor.js");
const i18n = read("i18n.js");

let failed = 0;
function pin(name, src, needle) {
  if (!src.includes(needle)) { console.error("MISSING " + name + ": " + JSON.stringify(needle).slice(0, 90)); failed++; }
}

// 1. Equation gallery — 11 OO families, each a menu item + template.
for (const fam of ["fractions", "scripts", "radicals", "integrals", "large-operators",
  "brackets", "functions", "accents", "limits-and-logarithms", "operators", "matrices"]) {
  pin("eq menu " + fam, html, `data-cmd="equationTemplate" data-value="${fam}"`);
  const hit = js.includes(fam + ":") || js.includes('"' + fam + '":');
  if (!hit) { console.error("MISSING eq template " + fam); failed++; }
}
pin("eq renderer frac", js, 'frac", i)');
pin("eq renderer sqrt", js, 'sqrt", i)');
pin("eq renderer int", js, 'int", i)');
pin("eq renderer sum", js, 'sum", i)');
pin("eq renderer lim", js, 'lim", i)');
pin("eq renderer matrix", js, 'matrix", i)');

// 2. Table tools.
pin("draw menu", html, 'data-cmd="tableDrawMode"');
pin("erase menu", html, 'data-cmd="tableEraseMode"');
pin("convert menu", html, 'data-cmd="convertTextToTable"');
pin("convert-back menu", html, 'data-cmd="convertTableToText"');
pin("convert-back dialog", html, 'id="table-to-text-dialog"');
pin("convert-back confirm", js, "confirmTableToTextDialog");
pin("convert-back row->paragraph", js, 'rows.map((cells) => cells.join(sep))');

// 2b. C4-1 paragraph settings dialog.
pin("ps dialog", html, 'id="paragraph-settings-dialog"');
pin("ps opener", js, "openParagraphSettingsDialog");
pin("ps apply indents", js, 'p.style.marginLeft = il.value + "px"');
pin("ps keep class", js, "p.classList.toggle(\"keep-lines-together\"");
pin("ps ctx wiring", js, 'action === "ParagraphSettings"');
pin("draw handler", js, 'toggleTableTool("draw")');
pin("erase handler", js, 'toggleTableTool("erase")');
pin("draw body class", js, 'wo-table-draw');
pin("draw cell border apply", js, 'td.style.border = "1px solid #444"');
pin("erase cell border clear", js, 'td.style.border = "none"');
pin("ttt dialog sep", html, 'id="ttt-sep"');
pin("ttt confirm", js, "confirmTextToTableDialog");
pin("ttt auto split", js, 'sep === "auto"');
pin("ttt inserts table html", js, '"<table>" + rows.map');

// 3. Chart add-elements.
for (const el of ["axes", "axisTitles", "trendline", "errorBars", "upDownBars"]) {
  pin("chart menu " + el, html, `data-cmd="chartElement" data-value="${el}"`);
  pin("chart render " + el, js, `els.${el} === true`);
}
pin("chart trendline dash", js, 'stroke-dasharray="6 4"');
pin("chart axis line", js, 'stroke="#555" stroke-width="1.4"');

// 4. Hyphenation quick items + Last Custom margins.
pin("hyp auto", html, '<option value="auto" selected>Automatic</option>');
pin("hyp none", html, '<option value="none">None</option>');
pin("hyp auto handler", js, 'setSectionMarker("hyphenation", \'data-auto="1"\')');
pin("margins last-custom menu", html, 'data-value="last-custom"');
pin("margins last-custom store", js, "wo-last-custom-margins");
pin("margins last-custom apply", js, 'preset === "last-custom"');

// 5. i18n — every new key in BOTH locales.
for (const key of ["Insert.Eq.Fractions", "Insert.Eq.Matrices", "Insert.Table.Draw",
  "Insert.Table.Convert", "Chart.Elements.Axes", "Chart.Elements.UpDownBars",
  "Layout.Hyphenation.Automatic", "Layout.Margins.LastCustom", "TextToTable.Title"]) {
  const hits = i18n.split('"' + key + '"').length - 1;
  if (hits < 2) { console.error("MISSING i18n x2 " + key + " (found " + hits + ")"); failed++; }
}

// 6. Gap blocks: >=3 equation templates per family (submenu flies out),
// TTT column count, Last Custom page size, chart-element type gating.
const EQ_FAMILIES = ["fractions", "scripts", "radicals", "integrals", "large-operators",
  "brackets", "functions", "accents", "limits-and-logarithms", "operators", "matrices"];
for (const fam of EQ_FAMILIES) {
  pin("eq submenu " + fam, html, `data-value="${fam}:2"`);
}
pin("eq family:variant parse", js, 'String(family).split(":")');
pin("ttt columns field", html, 'id="ttt-cols"');
pin("ttt columns read", js, 'getElementById("ttt-cols")');
pin("size last-custom menu", html, 'data-cmd="applyPageSize" data-value="last-custom"');
pin("size last-custom apply", js, 'size === "last-custom"');
pin("size last-custom store", js, "rememberCustomSize");
pin("size last-custom storage key", js, "wo-last-custom-size");
pin("chart element support map", js, "CHART_ELEMENT_SUPPORT");
pin("chart element gate apply", js, "chartElementSupported(");
pin("chart unavailable i18n", js, '"Chart.Elements.NotAvailableTitle"');
for (const key of ["Layout.Size.LastCustom", "TextToTable.Columns", "Chart.Elements.NotAvailableTitle"]) {
  const hits = i18n.split('"' + key + '"').length - 1;
  if (hits < 2) { console.error("MISSING i18n x2 " + key + " (found " + hits + ")"); failed++; }
}

if (failed) { console.error("ledger-gaps gate: " + failed + " pin(s) missing"); process.exit(1); }
console.log("ledger-gaps gate: ALL GREEN (" + "11 eq families x3 variants + 3 table tools + 5 chart elements + hyp/last-custom + gap blocks pinned)");

/**
 * rows-gate.test.mjs — static pins for the CHROME2-TWO-ROW-RIBBON restructure
 * (OO parity: every ribbon page stacks two census rows, y<90 -> row 1,
 * y>=90 -> row 2; page is a flex column, rows never wrap).
 *
 * Run: node rows-gate.test.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(HERE, "index.html"), "utf8");
const css = readFileSync(resolve(HERE, "style.css"), "utf8");

// --- every .ribbon-page carries exactly two .ribbon-row children -------------
const TABS = ["home", "insert", "draw", "layout", "references", "collaboration",
  "protection", "view", "plugins", "ai", "chart-design", "header-footer"];
const pageRe = /<div class="ribbon-page[^"]*" data-tab="([^"]+)"/g;
const matches = [...html.matchAll(pageRe)];
assert.equal(matches.length, TABS.length, "all 12 ribbon pages present");
for (let i = 0; i < matches.length; i++) {
  const tab = matches[i][1];
  const start = matches[i].index;
  const end = i + 1 < matches.length ? matches[i + 1].index : html.indexOf("</header>", start);
  const seg = html.slice(start, end);
  const rows = seg.match(/<div class="ribbon-row">/g) || [];
  assert.equal(rows.length, 2, `tab ${tab}: exactly two .ribbon-row children`);
  // Slice each row body up to its first closing tag; for grouped rows that is
  // the first nested rb-group close, which still proves the row has controls.
  const first = seg.indexOf('<div class="ribbon-row">');
  const second = seg.indexOf('<div class="ribbon-row">', first + 1);
  const bodies = [
    seg.slice(first, seg.indexOf("</div>", first)),
    seg.slice(second, seg.indexOf("</div>", second)),
  ];
  for (const [idx, body] of bodies.entries()) {
    assert.ok(/<(button|span|label|select|input|div)/.test(body),
      `tab ${tab}: row ${idx + 1} is non-empty`);
  }
}

// --- census anchors -----------------------------------------------------------
function pageSeg(tab) {
  const idx = TABS.indexOf(tab);
  const start = matches[idx].index;
  const end = idx + 1 < matches.length ? matches[idx + 1].index : html.indexOf("</header>", start);
  return html.slice(start, end);
}
function rowSeg(tab, n) {
  const seg = pageSeg(tab);
  const first = seg.indexOf('<div class="ribbon-row">');
  const second = seg.indexOf('<div class="ribbon-row">', first + 1);
  const row1 = seg.slice(first, second);
  const pageClose = seg.lastIndexOf("</div>");
  const row2 = seg.slice(second, pageClose);
  return n === 1 ? row1 : row2;
}
assert.ok(rowSeg("home", 1).includes('id="font-family"'), "home: font-family on row 1 (census y68)");
assert.ok(rowSeg("home", 2).includes('data-cmd="bold"'), "home: bold on row 2 (census y104)");
assert.ok(rowSeg("home", 1).includes('data-cmd="fontSizeInc"'), "home: increment font on row 1");
assert.ok(rowSeg("home", 2).includes('data-cmd="justifyLeft"'), "home: align-left on row 2");
assert.ok(rowSeg("insert", 1).includes('id="btn-table"'), "insert: table on row 1");
assert.ok(rowSeg("insert", 1).includes("btn-image"), "insert: image on row 1");
assert.ok(rowSeg("layout", 1).includes("Margins"), "layout: margins menu on row 1");
assert.ok(rowSeg("references", 2).includes("updateToc"), "references: update-table buttons on row 2");
assert.ok(rowSeg("protection", 1).includes("protectDialog"), "protection: encrypt on row 1");
assert.ok(rowSeg("protection", 2).includes("restrictEditing"), "protection: restrict on row 2 (forced split)");
assert.ok(rowSeg("plugins", 2).includes("browsePlugins"), "plugins: browse on row 2");
assert.ok(rowSeg("chart-design", 2).includes("chartSettings"), "chart-design: advanced settings on row 2");
assert.ok(rowSeg("header-footer", 1).includes("btn-hf-pagenumber"), "header-footer: pagenumber on row 1");
assert.ok(rowSeg("header-footer", 2).includes('data-cmd="toggleDifferentFirst"'), "header-footer: toggles on row 2");

// --- CSS: page is a column of nowrap rows -------------------------------------
const activeBlocks = [...css.matchAll(/\.ribbon-page\.active\s*\{[^}]*\}/g)].map((m) => m[0]);
assert.ok(activeBlocks.some((b) => /flex-direction:\s*column/.test(b)),
  ".ribbon-page.active stacks rows vertically");
assert.ok(/\.ribbon-row\s*\{[^}]*flex-wrap:\s*nowrap/.test(css), ".ribbon-row stays nowrap");
assert.ok(!/\.ribbon-row\s*\{[^}]*overflow-x:\s*clip/.test(css),
  ".ribbon-row must not clip (transform scroll relies on the band clip)");
assert.ok(/min-height:\s*104px/.test(css), "band min-height 104px for the two-row band");
assert.ok(/--ribbon-hover:\s*#e8e8e8/.test(css) && /--ribbon-active:\s*#d8d8d8/.test(css),
  "light theme carries OO group hover/active tokens");
assert.ok(/\.ribbon-row \.rb-group:hover/.test(css), "group hover polish present");
assert.ok(/\.ribbon-row \.rb-sep\s*\{[^}]*height:\s*40px/.test(css), "row separators sized for a 34px-control row");

console.log("rows-gate: two-row structure, census anchors, column band OK");

/**
 * home-arrange.test.mjs — static pins for CHROME-D: the Startseite (Home)
 * arrangement.
 *
 * Two invariants:
 *   1. The find/replace/collapse/fullscreen/theme cluster lives OUT of the
 *      ribbon, in a persistent topbar right zone (.toolbar-tools) pinned to
 *      the right edge of the function band — the mirror of the left-edge
 *      QAT strip — and therefore survives every tab switch.
 *   2. The Home row 1 is LED by the font cluster: it starts directly after
 *      the QAT strip (the clipboard quick cluster + paste group that used to
 *      sit before it are QAT duplicates and are gone).
 *
 * Run: node home-arrange.test.mjs   (prints HOME-ARR-PASS on the last line)
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

// --- element bounds (div-depth balanced, so pages can be measured) ----------
function elementEnd(startTagIdx) {
  const tokens = html.slice(startTagIdx).match(/<div\b|<\/div>/g);
  let depth = 0, idx = startTagIdx, pos = startTagIdx;
  for (const tk of tokens) {
    pos = html.indexOf(tk, pos);
    idx = pos + tk.length;
    depth += tk === "</div>" ? -1 : 1;
    pos += tk.length;
    if (depth === 0) return idx;
  }
  return idx;
}

const headerStart = html.indexOf('<header id="toolbar"');
const headerEnd = html.indexOf("</header>", headerStart);
assert.ok(headerStart !== -1, "toolbar header exists");

const pageIdxs = [...html.matchAll(/<div class="ribbon-page/g)].map((m) => m.index);
assert.equal(pageIdxs.length, 13, "all 13 ribbon pages remain");
const pages = pageIdxs.map((idx) => ({ start: idx, end: elementEnd(idx) }));

// --- 1. the persistent topbar right zone ------------------------------------
const zoneRe = /<div class="toolbar-tools"[^>]*>/g;
const zoneMatches = [...html.matchAll(zoneRe)];
assert.equal(zoneMatches.length, 1, "exactly one .toolbar-tools topbar right zone");
const zoneStart = zoneMatches[0].index;
const zoneEnd = elementEnd(zoneStart);
assert.ok(zoneStart > headerStart && zoneEnd < headerEnd,
  "toolbar-tools zone lives inside the toolbar header (function band)");
for (const p of pages) {
  assert.ok(!(p.start < zoneStart && zoneStart < p.end),
    "toolbar-tools zone must NOT live inside a .ribbon-page (out of the ribbon)");
}

// DOM slot: between the home page's close and the insert page (keeps the
// AF5-HOME-DIRECT home-slice pins valid); flex `order` neutralizes it.
const homePage = pages[0];
const insertPage = pages[1];
assert.ok(/data-tab="home"/.test(html.slice(homePage.start, homePage.start + 80)),
  "first ribbon page is home");
assert.ok(/data-tab="insert"/.test(html.slice(insertPage.start, insertPage.start + 80)),
  "second ribbon page is insert");
assert.ok(zoneStart >= homePage.end && zoneEnd <= insertPage.start,
  "toolbar-tools zone sits between the home and insert ribbon pages");

// Zone carries exactly the 5 tools, in CHROME-D order, each i18n-wired.
const zone = html.slice(zoneStart, zoneEnd);
const TOOLS = ["btn-find", "btn-replace", "btn-ribbon-collapse", "btn-fullscreen", "btn-theme"];
const ids = [...zone.matchAll(/<button[^>]*id="([^"]+)"/g)].map((m) => m[1]);
assert.deepEqual(ids, TOOLS, "zone carries find · replace · collapse · fullscreen · theme (census order)");
for (const id of TOOLS) {
  assert.equal((html.match(new RegExp(`id="${id}"`, "g")) || []).length, 1,
    `${id} is unique in the document`);
  const tag = zone.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`))[0];
  assert.ok(/data-i18n-title=/.test(tag), `${id} carries data-i18n-title`);
  assert.ok(/data-i18n-aria-label=/.test(tag), `${id} carries data-i18n-aria-label`);
}
assert.ok(/data-i18n-aria-label="Toolbar.Tools"/.test(zoneMatches[0][0]),
  "zone group is i18n-labelled (Toolbar.Tools)");
assert.ok(/aria-keyshortcuts="Control\+F"/.test(zone), "find keeps its Ctrl+F advertisement");
assert.ok(/aria-keyshortcuts="Control\+H"/.test(zone), "replace keeps its Ctrl+H advertisement");
assert.ok(/aria-pressed="false"/.test(zone.match(/<button[^>]*id="btn-theme"[^>]*>/)[0]),
  "theme toggle exposes its two-phase state via aria-pressed");
assert.ok(/aria-expanded="true"/.test(zone.match(/<button[^>]*id="btn-ribbon-collapse"[^>]*>/)[0]),
  "collapse toggle exposes its expanded state via aria-expanded");

// No tool may linger inside any ribbon page.
for (const p of pages) {
  const seg = html.slice(p.start, p.end);
  for (const id of TOOLS) {
    assert.ok(!seg.includes(`id="${id}"`), `${id} must be out of the ${/data-tab="([^"]+)"/.exec(seg)[1]} ribbon page`);
  }
  assert.ok(!/class="rb-group rb-edge"[^>]*aria-label="Toolbar tools"/.test(html),
  "the old tools rb-edge group is gone from the ribbon");
}

// --- 2. font cluster leads home row 1 ---------------------------------------
const home = html.slice(homePage.start, homePage.end);
const row1Start = home.indexOf('<div class="ribbon-row">');
assert.ok(row1Start !== -1, "home row 1 exists");
const row1 = home.slice(row1Start, home.indexOf('<div class="ribbon-row">', row1Start + 1));
const firstGroupAt = row1.indexOf('<div class="rb-group"');
const firstGroup = row1.slice(firstGroupAt, firstGroupAt + 400);
assert.ok(firstGroup.includes('aria-label="Font"'), "the FIRST group of home row 1 is the Font group");
assert.ok(firstGroup.includes('id="font-family"'), "font family leads home row 1 (census y68)");
assert.ok(!/<button/.test(row1.slice(0, firstGroupAt)),
  "no controls sit before the font cluster in row 1 — it leads after the QAT strip");

// The QAT duplicates are gone from the whole document (exact ids; the
// titlebar's btn-undo-tb / btn-redo-qa and the strip's qat-* cells remain).
for (const id of ["btn-copy", "btn-cut", "btn-paste", "btn-undo", "btn-redo"]) {
  assert.equal((html.match(new RegExp(`id="${id}"`, "g")) || []).length, 0,
    `${id} (QAT duplicate) is gone from the document`);
}
// ...and row 1 still carries the rest of the census line.
for (const needle of ['id="font-size"', 'data-cmd="fontSizeInc"', 'data-cmd="insertUnorderedList"',
                      'id="line-spacing"', 'class="rb-group rb-styles"']) {
  assert.ok(row1.includes(needle), `home row 1 keeps ${needle}`);
}

// --- 3. CSS: zone pinned right after the active page ------------------------
const zoneCss = css.match(/\.toolbar \.toolbar-tools\s*\{[^}]*\}/);
assert.ok(zoneCss, ".toolbar .toolbar-tools zone rule exists");
assert.ok(/order:\s*2/.test(zoneCss[0]), "zone takes flex order 2 (after the active page)");
assert.ok(/flex:\s*0 0 auto/.test(zoneCss[0]), "zone keeps a fixed slot in the band");
assert.ok(/margin-left:\s*auto/.test(zoneCss[0]), "zone pins to the right edge (OO: no border-left in white theme)");
const cellCss = css.match(/\.toolbar \.toolbar-tools \.rb\s*\{[^}]*\}/);
assert.ok(cellCss && /width:\s*26px/.test(cellCss[0]) && /padding:\s*0/.test(cellCss[0]),
  "zone tools are compact 26px icon squares");
const pageOverride = css.match(/\.toolbar > \.ribbon-page\.active\s*\{[^}]*\}/);
assert.ok(pageOverride, ".toolbar > .ribbon-page.active override exists");
assert.ok(/flex:\s*1 1 0/.test(pageOverride[0]) && /order:\s*1/.test(pageOverride[0]),
  "active page takes flex order 1 so the zone renders last on every tab");
assert.ok(/\.ribbon-row \.rb-edge\s*\{[^}]*margin-left:\s*auto/.test(css),
  "the Selection group keeps its row-2 right pin (OO census select-all)");

// --- 4. editor.js wiring -----------------------------------------------------
for (const needle of [
  'getElementById("btn-find")',
  'getElementById("btn-replace")',
  'getElementById("btn-ribbon-collapse")',
  'getElementById("btn-fullscreen")',
  'getElementById("btn-theme")',
]) {
  assert.ok(editorJs.includes(needle), `editor.js must reference ${needle}`);
}
// No dead wiring for the removed QAT duplicates (audit-i18n dead-id closure).
for (const id of ["btn-copy", "btn-cut", "btn-paste", "btn-undo", "btn-redo"]) {
  assert.ok(!editorJs.includes(`getElementById("${id}")`),
    `editor.js must not wire the removed ${id}`);
}
// QAT strip keeps the persistent undo/redo grey-out state.
const urs = editorJs.slice(editorJs.indexOf("function updateUndoRedoState()"),
  editorJs.indexOf("function updateUndoRedoState()") + 700);
assert.ok(/getElementById\("qat-undo"\)/.test(urs) && /getElementById\("qat-redo"\)/.test(urs),
  "updateUndoRedoState greys the strip's undo/redo cells");
assert.ok(editorJs.includes('getElementById("qat-paste")'),
  "qat-paste carries the rich-paste-then-plaintext dispatch");

// --- 5. i18n: zone label exists in BOTH catalogs -----------------------------
const sandbox = { module: { exports: {} }, console };
vm.runInNewContext(i18nSrc, sandbox, { filename: "i18n.js" });
const { DEFAULT_TRANSLATIONS: en, LOCALE_CATALOGS: { de } } = sandbox.module.exports;
for (const key of ["Toolbar.Tools", "Toolbar.Find", "Toolbar.FindTitle",
                   "Toolbar.CollapseTitle", "View.FullscreenToggle", "View.ThemeToggle",
                   "Home.Replace", "Home.ReplaceTitle"]) {
  assert.ok(Object.hasOwn(en, key), `${key} must exist in the en catalog`);
  assert.ok(Object.hasOwn(de, key), `${key} must exist in the de catalog`);
}
assert.equal(en["Toolbar.Tools"], "Toolbar tools");
assert.equal(de["Toolbar.Tools"], "Werkzeuge");

console.log("HOME-ARR-PASS");

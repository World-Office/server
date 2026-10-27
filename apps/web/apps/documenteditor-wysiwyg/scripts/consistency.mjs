#!/usr/bin/env node
/**
 * consistency.mjs — BUG8-STATE-CONSISTENCY multi-surface convergence probes
 * (manual/live-only driver).
 *
 * Not picked up by the *.test.mjs acceptance gate (house convention: heavy
 * live drivers stay .mjs; static gates stay *.test.mjs). Run by hand:
 *
 *   node scripts/consistency.mjs
 *
 * Every mutation a user can reach from TWO surfaces (right panel, dialogs,
 * context menu, chart-design ribbon) must converge to the SAME document
 * state. Strategy: boot two independent editor pages from an identical seed,
 * drive surface A on page 1 and surface B on page 2, then compare the
 * resulting editor DOM (exact innerHTML equality where the code path is
 * shared, canonical fingerprints where attribute ordering could differ).
 *
 * Coverage:
 *   image:    size (rp vs image-alt dialog), alt (rp vs dialog), wrap (rp vs ctx)
 *   table:    background, border style/color/width (rp vs table-ops dialog)
 *   table ops: row above/below, col left/right, delete row/col, merge, split
 *              (ctx rows vs table-ops dialog op-* buttons)
 *   chart:    type (rp vs chart-dialog), title (rp checkbox vs chart-design
 *             menu), size (rp vs chart-design inputs) + cross-sync reactivity
 *   selection edges: collapsed-caret bold, table insert, range spanning
 *             table→paragraph, spellcheck sweep under bold, header/footer mode
 *   loud stubs: ctx AdjustListIndents / ParagraphSettings marker events
 *   viewport: all DIALOG_IDS clamp inside an 800×600 window
 *
 * Exit code 0 only when every probe passes. Prints a triage table on failure.
 */
import { spawn } from "node:child_process";
import net from "node:net";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require("/home/weiss/git/World-Office/wo-test-harness/census/node_modules/playwright");

const PORT = Number(process.env.CONSISTENCY_PORT || 18051);
const HERE = dirname(fileURLToPath(import.meta.url));
const EDITOR_DIR = resolve(HERE, "..");
const PY = "/usr/bin/python3"; // PATH python3 may be a broken shim (see smoke.mjs)

const SVG_ICON =
  "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='90'>" +
  "<rect width='120' height='90' fill='#4a7fb5'/></svg>";
const IMG_SRC = "data:image/svg+xml;utf8," + encodeURIComponent(SVG_ICON);

const SEED_HTML = [
  "<h1>Consistency Probe</h1>",
  '<header class="page-header"><p>Running head text</p></header>',
  '<p id="para-main">The quick brown fox jumps here</p>',
  "<p>A mispelled wrod lives here</p>",
  `<img src="${IMG_SRC}" width="120" height="90" alt="seed alt">`,
  "<table><tr><td>alpha</td><td>bravo</td></tr>" +
    "<tr><td>charlie</td><td>delta</td></tr></table>",
  "<ul><li>first item</li><li>second item</li></ul>",
  '<footer class="page-footer"><p>Footer line text</p></footer>',
].join("");

// Mirrors the DIALOG_IDS array in editor.js (viewport clamp probe).
const DIALOG_IDS = [
  "find-dialog", "link-dialog", "symbol-dialog", "table-ops-dialog",
  "version-history-dialog", "ai-review-dialog", "ai-propose-dialog",
  "page-setup-dialog", "borders-dialog", "protect-dialog",
  "photo-editor-dialog", "notes-dialog", "pagenumber-dialog",
  "headerfooter-dialog", "trackchanges-dialog", "dropcap-dialog",
  "linenumbers-dialog", "hyphenation-dialog", "watermark-dialog",
  "pagecolor-dialog", "colors-dialog", "addtext-dialog", "updatetoc-dialog",
  "displaymode-dialog", "bookmark-dialog", "cc-dialog", "chart-dialog",
  "columns-dialog", "comment-dialog", "crossref-dialog", "equation-dialog",
  "field-dialog", "help-dialog", "info-dialog", "mailmerge-dialog",
  "object-dialog", "plugin-unavailable-dialog", "plugins-dialog",
  "settings-dialog", "smartart-dialog", "suggest-dialog", "toc-dialog",
  "image-alt-dialog",
];

/** Runs inside the page before any editor script; intercepts all fetches.
 * Non-/api/ requests (e.g. dictionaries/en-US.dic) pass through to the
 * static server — stubbing the dictionary would flag EVERY word. */
function stubInit(cfg) {
  window.__COLLAB__ = false; // kill the 400ms collab poll for deterministic runs
  try { localStorage.removeItem("wo-zoom"); } catch {}
  navigator.sendBeacon = () => true; // no backend: keep unload/unlock off http.server (501s)
  const origFetch = window.fetch.bind(window);
  window.__API_CALLS__ = [];
  window.__STUB_STATE__ = { html: cfg.seed, saves: [] };
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : (input && input.url) || String(input);
    if (!/\/api\//.test(url)) return origFetch(input, init);
    const method = String(init.method || (input && input.method) || "GET").toUpperCase();
    window.__API_CALLS__.push({ method, url });
    const st = window.__STUB_STATE__;
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
    if (method === "GET" && /\/api\/documents\/[^/?]+\/html/.test(url)) {
      return json({ html: st.html, name: "demo.docx" });
    }
    if (method === "POST" && /\/save(\?|$)/.test(url)) {
      st.saves.push(String(init.body || ""));
      return json({ ok: true });
    }
    return json({ ok: true });
  };
}

// ---------------------------------------------------------------- helpers --
function freePort(preferred) {
  return new Promise((res) => {
    const srv = net.createServer();
    srv.once("error", () => {
      // preferred busy: ask the OS for any free port (listen 0), then reuse
      // it. Handing literal 0 to http.server would bind a random port we
      // can never learn — fetch on :0 always fails.
      const rnd = net.createServer();
      rnd.listen(0, "127.0.0.1", () => {
        const p = rnd.address().port;
        rnd.close(() => res(p));
      });
    });
    srv.listen(preferred, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => res(p));
    });
  });
}

async function waitUp(port, timeoutMs) {
  const url = `http://127.0.0.1:${port}/index.html`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  throw new Error(`http.server on :${port} did not come up`);
}

const failures = [];

/** Probe-level step: failures are collected so every probe runs (triage table). */
async function step(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    const msg = String((err && err.message) || err)
      .split("\n")
      .slice(0, 3)
      .join(" | ");
    failures.push({ name, msg });
    console.log(`  FAIL ${name}\n       -> ${msg}`);
  }
}

/** Reload a page back to the pristine seed and wait for boot settle. */
async function reseed(page, port) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500); // boot settle (smoke.mjs recipe)
  await page.waitForFunction(
    () => (document.getElementById("editor")?.innerText || "").includes("Consistency Probe"),
    undefined,
    { timeout: 8000 },
  );
}

/** Open the right settings panel (hidden by default; sync early-returns). */
async function openRightPanel(page) {
  await page.evaluate(() => {
    const p = document.getElementById("right-panel");
    if (p && p.hidden) document.getElementById("btn-right-panel-toggle").click();
  });
  await page.waitForFunction(() => !document.getElementById("right-panel")?.hidden, undefined, { timeout: 4000 });
}

/** Set an input's value (or checkbox state) and fire a change event. */
const setInput = (page, sel, value) =>
  page.evaluate(({ sel, value }) => {
    const el = document.querySelector(sel);
    if (el.type === "checkbox") el.checked = !!value;
    else el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, { sel, value });

/** Activate a ribbon tab (ribbon pages are display:none until .active). */
async function activateRibbon(page, tab) {
  await page.click(`.ribbon-tab[data-tab="${tab}"]`);
  await page.waitForTimeout(120);
}

/** Select the plain seed image. Clicking alone leaves a TEXT anchor (so
 * selectedObject() misses the img and the ctx showif='image' rows stay
 * hidden) — selectAllChildren on a childless img makes IMG the anchor,
 * which survives the subsequent right-click. */
async function selectSeedImage(page) {
  await page.evaluate(() => {
    const img = document.querySelector("#editor img");
    const s = window.getSelection();
    s.removeAllRanges();
    s.selectAllChildren(img);
    document.getElementById("editor").focus();
  });
  await page.waitForTimeout(120);
}

/** Put a collapsed caret inside the first table cell. */
const caretInFirstCell = (page) =>
  page.evaluate(() => {
    const td = document.querySelector("#editor td");
    const sel = document.getSelection();
    const r = document.createRange();
    r.selectNodeContents(td);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    document.getElementById("editor").focus();
  });

/** Select the first `n` cells of the first row (for merge). */
const selectFirstCells = (page, n) =>
  page.evaluate((n) => {
    const tds = document.querySelectorAll("#editor td");
    const sel = document.getSelection();
    const r = document.createRange();
    r.setStart(tds[0], 0);
    r.setEnd(tds[n - 1], tds[n - 1].childNodes.length);
    sel.removeAllRanges();
    sel.addRange(r);
    document.getElementById("editor").focus();
  }, n);

/** Select a whole text inside `containerSel` (deterministic word walk). */
const selectText = (page, containerSel, text) =>
  page.evaluate(({ containerSel, text }) => {
    const root = document.querySelector(containerSel);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const i = node.data.indexOf(text);
      if (i >= 0) {
        const r = document.createRange();
        r.setStart(node, i);
        r.setEnd(node, i + text.length);
        const sel = document.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        return;
      }
    }
    throw new Error(`text ${JSON.stringify(text)} not found in ${containerSel}`);
  }, { containerSel, text });

/** Open the context menu on a target and fire a ctx row action. */
async function ctxAction(page, targetSel, action) {
  await page.locator(targetSel).first().click({ button: "right" });
  const menu = page.locator("#ctx-menu");
  await page.waitForFunction(() => !document.getElementById("ctx-menu")?.hidden, undefined, { timeout: 4000 });
  const row = page.locator(`#ctx-menu [data-ctx="${action}"]`);
  await row.waitFor({ state: "visible", timeout: 4000 });
  await row.click();
  await page.waitForFunction(() => document.getElementById("ctx-menu")?.hidden, undefined, { timeout: 4000 });
}

/** Open the ctx menu via a synthetic contextmenu event so the CURRENT
 * selection survives (a real right-click collapses it to a caret), then
 * trigger the row through the real dispatcher. */
async function ctxActionKeepSelection(page, action) {
  await page.evaluate(() => {
    const editor = document.getElementById("editor");
    const r = editor.getBoundingClientRect();
    editor.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true, cancelable: true, clientX: r.x + 200, clientY: r.y + 200,
    }));
  });
  await page.waitForFunction(() => !document.getElementById("ctx-menu")?.hidden, undefined, { timeout: 4000 });
  await page.locator(`#ctx-menu [data-ctx="${action}"]`).evaluate((el) => el.click());
  await page.waitForFunction(() => document.getElementById("ctx-menu")?.hidden, undefined, { timeout: 4000 });
}

/** Insert a chart at the caret in `paraSel` via toolbar + chart dialog.
 * #btn-chart lives in the #btn-insert-more rb-menu on the INSERT ribbon
 * page — activate the tab and open the menu first. */
async function insertChart(page, paraSel) {
  await page.locator(paraSel).click();
  await activateRibbon(page, "insert");
  await page.click("#btn-insert-more");
  await page.waitForFunction(
    () => !document.getElementById("btn-chart")?.closest("ul.menu-list")?.hidden,
    undefined,
    { timeout: 4000 },
  );
  await page.click("#btn-chart");
  await page.waitForSelector("#chart-dialog.open", { timeout: 4000 });
  await page.click("#btn-chart-ok");
  await page.waitForSelector("#editor img.vector-object[data-kind='chart']", { timeout: 4000 });
  await page.waitForTimeout(150);
}

/** Canonical fingerprint of the plain image (attrs + wrap class). */
const imgFingerprint = (page) =>
  page.evaluate(() => {
    const img = document.querySelector("#editor img");
    return {
      srcLen: (img.getAttribute("src") || "").length,
      width: img.getAttribute("width"),
      height: img.getAttribute("height"),
      alt: img.getAttribute("alt"),
      cls: img.className,
      style: img.getAttribute("style") || "",
    };
  });

/** Canonical fingerprint of the first table (style-relevant attributes). */
const tableFingerprint = (page) =>
  page.evaluate(() => {
    const table = document.querySelector("#editor table");
    return {
      html: table.outerHTML,
      rows: table.rows.length,
      cols: table.rows[0] ? table.rows[0].cells.length : 0,
      cellStyle: table.querySelector("td")?.getAttribute("style") || "",
    };
  });

/** Canonical fingerprint of the chart (spec JSON + geometry). */
const chartFingerprint = (page) =>
  page.evaluate(() => {
    const img = document.querySelector("#editor img.vector-object[data-kind='chart']");
    if (!img) return null;
    let spec = {};
    try { spec = JSON.parse(img.getAttribute("data-spec") || "{}"); } catch {}
    return {
      dataSpec: spec,
      alt: img.getAttribute("alt") || "",
      style: img.getAttribute("style") || "",
      width: img.getAttribute("width") || "",
      height: img.getAttribute("height") || "",
    };
  });

const editorHTML = (page) => page.evaluate(() => document.getElementById("editor").innerHTML);

// ------------------------------------------------------------ convergence --
/** Drive surface A on pageA, surface B on pageB, then compare outcomes. */
async function convergencePair(port, pageA, pageB, name, driveA, driveB, fingerprint) {
  await step(name, async () => {
    await reseed(pageA, port);
    await reseed(pageB, port);
    await driveA(pageA);
    await driveB(pageB);
    const fa = await fingerprint(pageA);
    const fb = await fingerprint(pageB);
    assert.deepEqual(fa, fb, `surfaces diverged:\n  A: ${JSON.stringify(fa)}\n  B: ${JSON.stringify(fb)}`);
  });
}

// ------------------------------------------------------- probe definitions --
async function probeImagePairs(port, pageA, pageB) {
  const openPanelBoth = async (page) => {
    await openRightPanel(page);
    await page.click('.rail-btn[data-panel="image"]'); // section tabs: show image section
    await selectSeedImage(page);
  };

  await convergencePair(port, pageA, pageB, "image size: right panel vs image-alt dialog",
    // A: rp width+height inputs
    async (page) => {
      await openPanelBoth(page);
      await setInput(page, "#rp-image-width", "222");
      await setInput(page, "#rp-image-height", "166");
    },
    // B: image-alt dialog size inputs + OK (the funnel applies alt+size)
    async (page) => {
      await selectSeedImage(page);
      await ctxAction(page, "#editor img", "EditAltText");
      await page.waitForSelector("#image-alt-dialog.open", { timeout: 4000 });
      await setInput(page, "#image-size-width", "222");
      await setInput(page, "#image-size-height", "166");
      await page.click("#btn-image-alt-ok");
      await page.waitForTimeout(120);
    },
    imgFingerprint);

  await convergencePair(port, pageA, pageB, "image alt: right panel vs image-alt dialog",
    async (page) => { await openPanelBoth(page); await setInput(page, "#rp-image-alt", "converged alt"); },
    async (page) => {
      await selectSeedImage(page);
      await ctxAction(page, "#editor img", "EditAltText");
      await page.waitForSelector("#image-alt-dialog.open", { timeout: 4000 });
      await setInput(page, "#image-alt-input", "converged alt");
      await page.click("#btn-image-alt-ok");
      await page.waitForTimeout(120);
    },
    imgFingerprint);

  await convergencePair(port, pageA, pageB, "image wrap: right panel vs context menu",
    async (page) => { await openPanelBoth(page); await setInput(page, "#rp-image-wrap", "wrap-square"); },
    async (page) => { await selectSeedImage(page); await ctxAction(page, "#editor img", "WrapSquare"); },
    imgFingerprint);
}

async function probeTableStylePairs(port, pageA, pageB) {
  const prep = async (page) => { await caretInFirstCell(page); await openRightPanel(page); };

  await convergencePair(port, pageA, pageB, "table background: right panel vs table-ops dialog",
    async (page) => { await prep(page); await setInput(page, "#rp-table-background", "#ffcc00"); },
    async (page) => {
      await caretInFirstCell(page);
      await activateRibbon(page, "insert"); await page.click("#btn-table-ops");
      await page.waitForSelector("#table-ops-dialog.open", { timeout: 4000 });
      await setInput(page, "#table-ops-background", "#ffcc00");
      await page.click("#btn-table-ops-close");
      await page.waitForTimeout(120);
    },
    tableFingerprint);

  await convergencePair(port, pageA, pageB, "table border style+width: right panel vs table-ops dialog",
    async (page) => {
      await prep(page);
      await setInput(page, "#rp-table-border-style", "dashed");
      await setInput(page, "#rp-table-border-color", "#0066cc");
      await setInput(page, "#rp-table-border-width", "2.5");
    },
    async (page) => {
      await caretInFirstCell(page);
      await activateRibbon(page, "insert"); await page.click("#btn-table-ops");
      await page.waitForSelector("#table-ops-dialog.open", { timeout: 4000 });
      await setInput(page, "#table-ops-border-style", "dashed");
      await setInput(page, "#table-ops-border-color", "#0066cc");
      await setInput(page, "#table-ops-border-width", "2.5");
      await page.click("#btn-table-ops-close");
      await page.waitForTimeout(120);
    },
    tableFingerprint);
}

/** ctx row vs table-ops dialog op-* button, for every shared table op. */
async function probeTableOpPairs(port, pageA, pageB) {
  const cases = [
    ["row above", "TableRowAbove", "#op-row-above"],
    ["row below", "TableRowBelow", "#op-row-below"],
    ["col left", "TableColLeft", "#op-col-left"],
    ["col right", "TableColRight", "#op-col-right"],
    ["delete row", "TableDeleteRow", "#op-del-row"],
    ["delete col", "TableDeleteCol", "#op-del-col"],
  ];
  for (const [label, ctxName, opSel] of cases) {
    await convergencePair(port, pageA, pageB, `table op ${label}: context menu vs table-ops dialog`,
      async (page) => { await caretInFirstCell(page); await ctxAction(page, "#editor td", ctxName); },
      async (page) => {
        await caretInFirstCell(page);
        await activateRibbon(page, "insert"); await page.click("#btn-table-ops");
        await page.waitForSelector("#table-ops-dialog.open", { timeout: 4000 });
        await page.click(opSel);
        await page.waitForTimeout(120);
      },
      // shared code path → exact HTML equality
      (page) => page.evaluate(() => document.querySelector("#editor table").outerHTML));
  }

  await convergencePair(port, pageA, pageB, "table merge cells: context menu vs table-ops dialog",
    async (page) => { await selectFirstCells(page, 2); await ctxAction(page, "#editor td", "TableMergeCells"); },
    async (page) => {
      await selectFirstCells(page, 2);
      await activateRibbon(page, "insert"); await page.click("#btn-table-ops");
      await page.waitForSelector("#table-ops-dialog.open", { timeout: 4000 });
      await page.click("#op-merge");
      await page.waitForTimeout(120);
    },
    (page) => page.evaluate(() => document.querySelector("#editor table").outerHTML));

  await convergencePair(port, pageA, pageB, "table split cell: context menu vs table-ops dialog",
    // shared pre-step on BOTH pages (merge row 1) so split has a merged cell
    async (page) => {
      await selectFirstCells(page, 2);
      await ctxAction(page, "#editor td", "TableMergeCells");
      await caretInFirstCell(page);
      await ctxAction(page, "#editor td", "TableSplitCell");
    },
    async (page) => {
      await selectFirstCells(page, 2);
      await ctxAction(page, "#editor td", "TableMergeCells");
      await caretInFirstCell(page);
      await activateRibbon(page, "insert"); await page.click("#btn-table-ops");
      await page.waitForSelector("#table-ops-dialog.open", { timeout: 4000 });
      await page.click("#op-split");
      await page.waitForTimeout(120);
    },
    (page) => page.evaluate(() => document.querySelector("#editor table").outerHTML));
}

async function probeChartPairs(port, pageA, pageB) {
  const setup = async (page) => {
    await insertChart(page, "#para-main");
    await openRightPanel(page);
    await page.click('.rail-btn[data-panel="chart"]'); // section tabs: show chart section
    await page.locator("#editor img.vector-object[data-kind='chart']").click(); // select
  };

  await convergencePair(port, pageA, pageB, "chart type: right panel vs chart dialog update",
    async (page) => { await setup(page); await page.selectOption("#rp-chart-type", "line"); },
    async (page) => {
      await insertChart(page, "#para-main");
      await page.dblclick("#editor img.vector-object[data-kind='chart']"); // pre-filled dialog
      await page.waitForSelector("#chart-dialog.open", { timeout: 4000 });
      await page.selectOption("#chart-type-select", "line");
      await page.click("#btn-chart-ok");
      await page.waitForTimeout(150);
    },
    chartFingerprint);

  await convergencePair(port, pageA, pageB, "chart title: right panel checkbox vs chart-design menu",
    async (page) => {
      await setup(page);
      await setInput(page, "#rp-chart-title", true);
    },
    async (page) => {
      await insertChart(page, "#para-main");
      await page.locator("#editor img.vector-object[data-kind='chart']").click(); // activates chart-design tab
      await page.click('.ribbon-tab[data-tab="chart-design"]');
      // elements live in a rb-menu behind the "Chart elements" trigger
      await page.click('.ribbon-page[data-tab="chart-design"] .rb-menu .menu-trigger');
      await page.waitForFunction(
        () => {
          const ul = document.querySelector('.ribbon-page[data-tab="chart-design"] .rb-menu ul.menu-list');
          return ul && !ul.hidden;
        },
        undefined,
        { timeout: 4000 },
      );
      // Synthetic click: the menu can auto-close between the visibility
      // wait and Playwright's actionability checks (race with the global
      // outside-click handler); the cmd dispatcher only needs the event.
      await page.evaluate(() => {
        document
          .querySelector('.ribbon-page[data-tab="chart-design"] [data-cmd="chartElement"][data-value="title"]')
          .click();
      });
      await page.waitForTimeout(150);
    },
    chartFingerprint);

  await convergencePair(port, pageA, pageB, "chart size: right panel vs chart-design input",
    async (page) => { await setup(page); await setInput(page, "#rp-chart-width", "333"); },
    async (page) => {
      await insertChart(page, "#para-main");
      await page.locator("#editor img.vector-object[data-kind='chart']").click();
      await page.click('.ribbon-tab[data-tab="chart-design"]');
      await setInput(page, "#chart-width-input", "333");
    },
    chartFingerprint);
}

/** Cross-surface reactivity: each surface must mirror state to the other. */
async function probeReactivity(pageA) {
  await step("reactivity: chart-design input → right panel mirror (BUG8 sync)",
    async () => {
      await reseed(pageA, PORT);
      await insertChart(pageA, "#para-main");
      await openRightPanel(pageA);
      await pageA.locator("#editor img.vector-object[data-kind='chart']").click();
      await pageA.click('.ribbon-tab[data-tab="chart-design"]');
      await setInput(pageA, "#chart-width-input", "333");
      const rp = await pageA.evaluate(() => document.getElementById("rp-chart-width").value);
      assert.equal(rp, "333", `rp-chart-width must mirror chart-design apply (got ${rp})`);
    });

  await step("reactivity: right panel → chart-design input mirror (updateChartDesignState)",
    async () => {
      await reseed(pageA, PORT);
      await insertChart(pageA, "#para-main");
      await openRightPanel(pageA);
      await pageA.locator("#editor img.vector-object[data-kind='chart']").click();
      await setInput(pageA, "#rp-chart-width", "444");
      const cd = await pageA.evaluate(() => document.getElementById("chart-width-input").value);
      assert.equal(cd, "444", `chart-width-input must mirror rp apply (got ${cd})`);
    });

  await step("reactivity: image-alt dialog OK → right panel stays fresh (BUG8-family stale check)",
    async () => {
      await reseed(pageA, PORT);
      await selectSeedImage(pageA);
      await openRightPanel(pageA);
      await ctxAction(pageA, "#editor img", "EditAltText");
      await pageA.waitForSelector("#image-alt-dialog.open", { timeout: 4000 });
      await setInput(pageA, "#image-size-width", "180");
      await setInput(pageA, "#image-size-height", "135");
      await pageA.click("#btn-image-alt-ok");
      await pageA.waitForTimeout(150);
      const rpW = await pageA.evaluate(() => document.getElementById("rp-image-width").value);
      const imgW = await pageA.evaluate(() => document.querySelector("#editor img").getAttribute("width"));
      assert.equal(imgW, "180", `dialog OK must resize img (got width=${imgW})`);
      assert.equal(rpW, "180", `rp-image-width must reflect dialog-applied size (got ${rpW})`);
    });
}

/** Selection-edge probes that have no second surface but must not corrupt state. */
async function probeSelectionEdges(pageA) {
  await step("selection edge: collapsed caret + ctx Bold arms bold for typed text",
    async () => {
      await reseed(pageA, PORT);
      await pageA.locator("#para-main").click();
      await pageA.keyboard.press("End"); // collapse to end of paragraph
      await ctxAction(pageA, "#para-main", "Bold");
      await pageA.keyboard.type("Q", { delay: 20 });
      const state = await pageA.evaluate(() => {
        const p = document.getElementById("para-main");
        const b = p.querySelector("b");
        return { text: p.textContent, boldText: b ? b.textContent : null };
      });
      assert.ok(state.text.includes("The quick brown fox jumps hereQ"), `text corrupted: ${state.text}`);
      assert.equal(state.boldText, "Q", `typed char must land inside <b> (got ${JSON.stringify(state.boldText)})`);
    });

  await step("selection edge: insert-table dialog inserts 2×2 at caret",
    async () => {
      await reseed(pageA, PORT);
      await pageA.locator("#para-main").click();
      await pageA.keyboard.press("End");
      await activateRibbon(pageA, "insert");
      await pageA.click("#btn-table");
      await pageA.waitForSelector("#table-dialog.open", { timeout: 4000 });
      await setInput(pageA, "#table-rows", "2");
      await setInput(pageA, "#table-cols", "2");
      await pageA.click("#btn-table-ok");
      await pageA.waitForTimeout(200);
      const dims = await pageA.evaluate(() => {
        const tables = document.querySelectorAll("#editor table");
        const t = tables[tables.length - 1];
        return { count: tables.length, rows: t.rows.length, cols: t.rows[0].cells.length };
      });
      assert.ok(dims.count >= 1, "no table inserted");
      assert.equal(dims.rows, 2, "2 rows expected");
      assert.equal(dims.cols, 2, "2 cols expected");
    });

  await step("selection edge: bold across table→paragraph keeps table structure intact",
    async () => {
      await reseed(pageA, PORT);
      await pageA.evaluate(() => {
        const td = document.querySelector("#editor td");
        const p = document.querySelector("#para-main");
        // para-main sits BEFORE the table in the seed → range para→cell1
        const sel = document.getSelection();
        const r = document.createRange();
        r.setStart(p.firstChild, 4); // after "The "
        r.setEnd(td.firstChild, 3); // "alp"
        sel.removeAllRanges();
        sel.addRange(r);
        document.getElementById("editor").focus();
      });
      await ctxActionKeepSelection(pageA, "Bold");
      const state = await pageA.evaluate(() => {
        const t = document.querySelector("#editor table");
        return {
          rows: t.rows.length,
          cols: t.rows[0].cells.length,
          cellText: t.rows[0].cells[0].textContent.trim(),
          boldCount: document.querySelectorAll("#editor b").length,
        };
      });
      assert.equal(state.rows, 2, "table rows must survive cross-structure bold");
      assert.equal(state.cols, 2, "table cols must survive cross-structure bold");
      assert.ok(state.boldCount >= 1, "selection must be bolded");
    });

  await step("selection edge: spellcheck sweep tracks only misspellings under bold",
    async () => {
      await reseed(pageA, PORT);
      const enableSpell = async (on) => {
        await pageA.keyboard.press("Escape");
        await pageA.locator("#editor p").first().click();
        await pageA.click("#btn-file");
        await pageA.waitForSelector("#backstage-overlay.open", { timeout: 4000 });
        await pageA.click(`.backstage-row[data-pane="settings"]`);
        await pageA.click("#btn-filesettings");
        await pageA.waitForSelector("#settings-dialog.open", { timeout: 4000 });
        await pageA.evaluate((on) => {
          const cb = document.getElementById("settings-spellcheck");
          cb.checked = on;
        }, on);
        await pageA.click("#btn-settings-ok");
        await pageA.waitForTimeout(300);
      };
      await enableSpell(true);
      await pageA.waitForSelector("#editor .wo-misspelled", { timeout: 6000 });
      const before = await pageA.evaluate(() => ({
        words: [...document.querySelectorAll("#editor .wo-misspelled")].map((m) => m.textContent),
      }));
      assert.equal(before.words.length, 2, `expected 2 markers, got ${JSON.stringify(before.words)}`);
      assert.deepEqual(before.words.sort(), ["mispelled", "wrod"], "markers must track the misspellings");

      // bold the whole sentence, then force a re-sweep (toggle off/on).
      // The sweep wraps words in markers, so the sentence text is split
      // across nodes — select the whole containing paragraph instead.
      await pageA.evaluate(() => {
        const p = [...document.querySelectorAll("#editor p")]
          .find((el) => (el.textContent || "").includes("mispelled"));
        if (!p) throw new Error("misspelling paragraph not found");
        const sel = document.getSelection();
        const r = document.createRange();
        r.selectNodeContents(p);
        sel.removeAllRanges();
        sel.addRange(r);
        document.getElementById("editor").focus();
      });
      await ctxActionKeepSelection(pageA, "Bold");
      await enableSpell(false);
      await enableSpell(true);
      await pageA.waitForSelector("#editor .wo-misspelled", { timeout: 6000 });
      const after = await pageA.evaluate(() => {
        const marks = [...document.querySelectorAll("#editor .wo-misspelled")];
        const para = marks[0] ? marks[0].closest("p") : null;
        return {
          words: marks.map((m) => m.textContent),
          empties: marks.filter((m) => m.textContent.trim() === "").length,
          sentence: para ? para.textContent : "",
        };
      });
      assert.equal(after.empties, 0, "no empty spellcheck markers allowed");
      assert.deepEqual(
        after.words.sort(),
        ["mispelled", "wrod"],
        `markers must still track misspellings, got ${JSON.stringify(after.words)}`,
      );
      const stripped = after.sentence.replace(/\u200b/g, "");
      assert.ok(
        ["A", "mispelled", "wrod", "lives", "here"].every((w) => stripped.includes(w)),
        `sentence corrupted: ${JSON.stringify(after.sentence)}`,
      );
    });

  await step("selection edge: dblclick header enters HF mode; bold lands in header; Escape exits",
    async () => {
      await reseed(pageA, PORT);
      await pageA.dblclick("#editor .page-header");
      await pageA.waitForFunction(
        () => {
          const tab = document.querySelector('.ribbon-tab[data-tab="header-footer"]');
          return tab && !tab.hidden;
        },
        undefined,
        { timeout: 4000 },
      );
      await selectText(pageA, ".page-header", "Running head text");
      await ctxAction(pageA, ".page-header", "Bold");
      const state = await pageA.evaluate(() => ({
        headerBold: !!document.querySelector(".page-header b"),
        headerText: document.querySelector(".page-header").textContent,
      }));
      assert.ok(state.headerBold, `no <b> landed in header (text: ${JSON.stringify(state.headerText)})`);
      await pageA.keyboard.press("Escape");
      await pageA.waitForFunction(
        () => {
          const tab = document.querySelector('.ribbon-tab[data-tab="header-footer"]');
          return tab && tab.hidden;
        },
        undefined,
        { timeout: 4000 },
      );
    });
}

/** Loud-stub documentation probes: stub emits a marker event, no dialog exists. */
async function probeLoudStubs(pageA) {
  const capture = async (page, event) =>
    page.evaluate((event) => {
      window.__MARK__ = null;
      const handler = (e) => { window.__MARK__ = e.detail || {}; };
      window.addEventListener(event, handler);
      document.addEventListener(event, handler);
      document.getElementById("editor").addEventListener(event, handler);
    }, event);

  await step("loud stub: ctx AdjustListIndents announces wo:list-settings (no dialog by design)",
    async () => {
      await reseed(pageA, PORT);
      await pageA.locator("#editor li").first().click();
      await capture(pageA, "wo:list-settings");
      await ctxAction(pageA, "#editor li", "AdjustListIndents");
      const mark = await pageA.evaluate(() => window.__MARK__);
      assert.ok(mark, "wo:list-settings marker event not observed");
      assert.equal(mark.op, "adjust-list-indents", `wrong marker op: ${JSON.stringify(mark)}`);
    });

  await step("loud stub: ctx ParagraphSettings announces wo:open-paragraph-settings (no dialog by design)",
    async () => {
      await reseed(pageA, PORT);
      await pageA.locator("#para-main").click();
      await capture(pageA, "wo:open-paragraph-settings");
      await ctxAction(pageA, "#para-main", "ParagraphSettings");
      const mark = await pageA.evaluate(() => window.__MARK__);
      assert.ok(mark, "wo:open-paragraph-settings marker event not observed");
    });
}

/** Every dialog must clamp inside an 800×600 viewport (BUG8 fix contract). */
async function probeViewportClamp(port) {
  await step("viewport clamp: all 43 dialogs fit (or scroll) inside 800×600",
    async () => {
      const browser = await chromium.launch();
      try {
        const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
        const page = await context.newPage();
        page.setDefaultTimeout(6000);
        await page.addInitScript(stubInit, { seed: SEED_HTML });
        await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2500);
        const results = await page.evaluate((ids) => {
          const bad = [];
          for (const id of ids) {
            const overlay = document.getElementById(id);
            if (!overlay) { bad.push(`${id}: missing`); continue; }
            overlay.classList.add("open");
            const dialog = overlay.querySelector(".dialog") || overlay;
            const r = dialog.getBoundingClientRect();
            const scrollable =
              dialog.scrollHeight > dialog.clientHeight + 2 ||
              overlay.scrollHeight > overlay.clientHeight + 2;
            const fits =
              r.top >= -1 && r.left >= -1 && r.right <= 801 && r.bottom <= 601;
            if (!fits && !scrollable) {
              bad.push(`${id}: rect ${Math.round(r.left)},${Math.round(r.top)}..${Math.round(r.right)},${Math.round(r.bottom)} not clamped, not scrollable`);
            }
            overlay.classList.remove("open");
          }
          return bad;
        }, DIALOG_IDS);
        assert.deepEqual(results, [], `unclamped dialogs:\n  ${results.join("\n  ")}`);
        await context.close();
      } finally {
        await browser.close();
      }
    });
}

// ------------------------------------------------------------------ main --
async function main() {
  const port = (await freePort(PORT)) || 0;
  const server = spawn(PY, ["-m", "http.server", String(port), "-d", EDITOR_DIR], {
    stdio: "ignore",
  });
  let browser;
  try {
    await waitUp(port, 10000);
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const pageA = await context.newPage();
    const pageB = await context.newPage();
    pageA.setDefaultTimeout(6000); // fail fast — one probe must not eat 30s
    pageB.setDefaultTimeout(6000);
    const pageErrors = [];
    for (const page of [pageA, pageB]) {
      page.on("pageerror", (e) => pageErrors.push(String(e)));
      await page.addInitScript(stubInit, { seed: SEED_HTML });
      await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      await page.waitForFunction(
        () => (document.getElementById("editor")?.innerText || "").includes("Consistency Probe"),
        undefined,
        { timeout: 8000 },
      );
    }

    console.log("consistency: probing multi-surface convergence");
    await probeImagePairs(port, pageA, pageB);
    await probeTableStylePairs(port, pageA, pageB);
    await probeTableOpPairs(port, pageA, pageB);
    await probeChartPairs(port, pageA, pageB);
    await probeReactivity(pageA);
    await probeSelectionEdges(pageA);
    await probeLoudStubs(pageA);
    await probeViewportClamp(port);

    if (pageErrors.length) {
      failures.push({ name: "page errors", msg: pageErrors.join(" | ") });
      console.log(`  FAIL page errors: ${pageErrors.length} uncaught (see triage)`);
    }

    // triage table
    console.log("\n== TRIAGE ==");
    if (!failures.length) {
      console.log("all probes green — surfaces converge");
    } else {
      for (const f of failures) console.log(`${f.name}\n  -> ${f.msg}`);
    }
    console.log(`\nport ${port}`);
    process.exitCode = failures.length ? 1 : 0;
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

main().catch((err) => {
  console.error("consistency: fatal", err);
  process.exit(1);
});

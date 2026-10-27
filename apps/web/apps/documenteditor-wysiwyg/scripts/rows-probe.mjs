/**
 * rows-probe.mjs — CHROME2-TWO-ROW-RIBBON live probe (Playwright, chromium).
 *
 * Serves the editor statically (http.server :18053), loads it standalone and
 * asserts the OO two-row ribbon geometry against the external census ground
 * truth (wo-test-harness/census census-oo-deep.json, y<90 -> row 1,
 * y>=90 -> row 2):
 *   (a) every tab's active page has exactly two non-empty .ribbon-row children
 *   (b) census anchors: Home font-family row 1 / bold row 2; Insert table +
 *       picture row 1; Layout margins + orientation row 1; Header/footer
 *       pagenumber row 1 (census row 1; the five WO toggles -> row 2)
 *   (c) lightest tabs (protection, ai): every visible control has width at
 *       1440px (no collapsed/zero-size rows)
 *   (d) per-tab control census unchanged vs the pre-change DOM snapshot
 *       (button/select/input/label counts embedded below)
 *   (e) 900px: chevrons still scroll both rows; dropdown stays visible below
 *       the band
 *
 * Prints "rows-probe: ALL GREEN" only when every check passes.
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const EDITOR_DIR = resolve(HERE, "..");
const PORT = 18053;
const require = createRequire(import.meta.url);
const { chromium } = require("/home/weiss/git/World-Office/wo-test-harness/census/node_modules/playwright");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pre-change DOM census (button/select/input/label per ribbon page), captured
// before the restructure; the split moves controls between rows only.
const SNAPSHOT = {
  home: { button: 92, select: 3, input: 3, label: 3 },
  insert: { button: 35, select: 0, input: 0, label: 0 },
  draw: { button: 9, select: 0, input: 0, label: 0 },
  layout: { button: 57, select: 1, input: 1, label: 2 },
  references: { button: 13, select: 0, input: 0, label: 0 },
  collaboration: { button: 15, select: 1, input: 0, label: 1 },
  protection: { button: 2, select: 0, input: 0, label: 0 },
  view: { button: 21, select: 1, input: 0, label: 1 },
  plugins: { button: 13, select: 0, input: 0, label: 0 },
  ai: { button: 8, select: 0, input: 0, label: 0 },
  "chart-design": { button: 19, select: 0, input: 2, label: 2 },
  // 10 page buttons (the static pre-change snapshot counted 12 because the
  // segment ran to </header>, sweeping in the two rib-scroll chevrons).
  "header-footer": { button: 10, select: 0, input: 0, label: 0 },
};

function startServer(dir, port) {
  return spawn("/usr/bin/python3", ["-m", "http.server", String(port), "-d", dir], { stdio: "ignore" });
}
async function waitUp(port) {
  for (let i = 0; i < 50; i++) {
    try { await fetch(`http://127.0.0.1:${port}/index.html`); return true; } catch { await sleep(200); }
  }
  return false;
}

const checks = [];
const check = (name, fn) => checks.push({ name, fn });

async function activateTab(page, tab) {
  await page.evaluate((t) => {
    const el = document.querySelector(`.ribbon-tab[data-tab="${t}"]`);
    el.click();
  }, tab);
  await sleep(150);
}

check("(a) every tab: active page has exactly two non-empty .ribbon-row children", async (page) => {
  const tabs = Object.keys(SNAPSHOT);
  for (const tab of tabs) {
    await activateTab(page, tab);
    const res = await page.evaluate(() => {
      const pg = document.querySelector(".ribbon-page.active");
      const rows = [...pg.querySelectorAll(":scope > .ribbon-row")];
      return {
        rows: rows.length,
        nonEmpty: rows.filter((r) => r.children.length > 0).length,
        rowLens: rows.map((r) => r.children.length),
      };
    });
    if (res.rows !== 2) throw new Error(`${tab}: ${res.rows} .ribbon-row children != 2`);
    if (res.nonEmpty !== 2) throw new Error(`${tab}: ${res.nonEmpty} non-empty rows (lens ${res.rowLens})`);
  }
});

check("(b) census anchors: Home font/bold, Insert table/image, Layout margins, HF pagenumber", async (page) => {
  // Anchor selectors are ids or census-verified data-cmds; layout menus are
  // covered by the text-anchor check (b2) — their triggers carry no data-cmd.
  const anchors = [
    ["home", '[id="font-family"]', 0],
    ["home", '[data-cmd="bold"]', 1],
    ["insert", '[id="btn-table"]', 0],
    ["insert", '[id="btn-image"]', 0],
    ["insert", '[id="btn-headerfooter-combined"]', 0],
    ["header-footer", '[id="btn-hf-pagenumber"]', 0],
    ["header-footer", '[data-cmd="toggleDifferentFirst"]', 1],
    ["references", '[id="update-toc"], [data-cmd="updateToc"]', 1],
  ];
  for (const [tab, sel, rowIdx] of anchors) {
    await activateTab(page, tab);
    const found = await page.evaluate(({ sel, rowIdx }) => {
      const pg = document.querySelector(".ribbon-page.active");
      const row = pg.querySelectorAll(":scope > .ribbon-row")[rowIdx];
      return !!row && !!row.querySelector(sel);
    }, { sel, rowIdx });
    if (!found) throw new Error(`${tab}: ${sel} not in row ${rowIdx + 1}`);
  }
});

check("(b2) Layout margins + orientation menus on row 1", async (page) => {
  await activateTab(page, "layout");
  const res = await page.evaluate(() => {
    const row1 = document.querySelector('.ribbon-page[data-tab="layout"] > .ribbon-row');
    const text = row1.textContent;
    return { margins: text.includes("Margins"), orientation: text.includes("Orientation") };
  });
  if (!res.margins || !res.orientation) throw new Error(`layout row 1 anchors missing (${JSON.stringify(res)})`);
});

check("(c) lightest tabs (protection, ai): every control has width at 1440px", async (page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await sleep(250);
  for (const tab of ["protection", "ai"]) {
    await activateTab(page, tab);
    const bad = await page.evaluate((t) => {
      const pg = document.querySelector(`.ribbon-page[data-tab="${t}"]`);
      return [...pg.querySelectorAll("button, select, input, label")]
        .filter((el) => !el.closest("[hidden]"))
        .filter((el) => el.clientWidth <= 0)
        .map((el) => el.id || el.getAttribute("data-cmd") || el.tagName);
    }, tab);
    if (bad.length > 0) throw new Error(`${tab}: zero-width controls ${JSON.stringify(bad)}`);
  }
});

check("(d) per-tab control census unchanged (buttons/selects/inputs/labels)", async (page) => {
  const tabs = Object.keys(SNAPSHOT);
  for (const tab of tabs) {
    await activateTab(page, tab);
    const counts = await page.evaluate(() => {
      const pg = document.querySelector(".ribbon-page.active");
      const scope = (s) => pg.querySelectorAll(s).length;
      return {
        button: scope("button"),
        select: scope("select"),
        input: scope("input"),
        label: scope("label"),
      };
    });
    const want = SNAPSHOT[tab];
    for (const k of Object.keys(want)) {
      if (counts[k] !== want[k]) throw new Error(`${tab}: ${k} count ${counts[k]} != snapshot ${want[k]}`);
    }
  }
});

check("(e) 900px: chevrons scroll both rows, dropdown visible below the band", async (page) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await sleep(300);
  await activateTab(page, "home");
  const before = await page.evaluate(() => {
    const pg = document.querySelector(".ribbon-page.active");
    return { rHidden: document.getElementById("rib-scroll-right").hidden, max: pg.scrollWidth - pg.clientWidth };
  });
  if (before.rHidden) throw new Error("› hidden at 900px on Home");
  if (before.max <= 0) throw new Error("no overflow at 900px");
  await page.evaluate(() => document.getElementById("rib-scroll-right").click());
  await sleep(150);
  const shifted = await page.evaluate(() => {
    const pg = document.querySelector(".ribbon-page.active");
    const m = getComputedStyle(pg).transform.match(/matrix\(([^)]+)\)/);
    const rows = pg.querySelectorAll(":scope > .ribbon-row");
    const t1 = rows[0].getBoundingClientRect().x;
    const t2 = rows[1].getBoundingClientRect().x;
    return { tx: m ? Math.abs(parseFloat(m[1].split(",")[4])) : 0, rowDelta: Math.abs(t1 - t2) };
  });
  if (shifted.tx === 0) throw new Error("content did not shift after › click");
  if (shifted.rowDelta > 0.5) throw new Error(`rows desynced during scroll (delta ${shifted.rowDelta}px)`);
  const opened = await page.evaluate(() => {
    const trig = document.querySelector('.ribbon-page.active .rb-menu .menu-trigger');
    trig.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    trig.click();
    const list = trig.closest(".rb-menu").querySelector(".menu-list");
    return !!list && !list.hidden;
  });
  if (!opened) throw new Error("rb-menu dropdown did not open at 900px");
  const fit = await page.evaluate(() => {
    const list = document.querySelector('.ribbon-page.active .rb-menu .menu-list:not([hidden])');
    const r = list.getBoundingClientRect();
    return { bottom: r.bottom, vh: window.innerHeight };
  });
  if (fit.bottom > fit.vh) throw new Error(`dropdown bottom ${fit.bottom} below viewport ${fit.vh}`);
  await page.keyboard.press("Escape");
});

async function main() {
  const server = startServer(EDITOR_DIR, PORT);
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err && err.stack ? err.stack.split("\n")[0] : err)));

  let failed = 0;
  try {
    if (!(await waitUp(PORT))) throw new Error("http.server did not come up on :" + PORT);
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await sleep(2500);
    for (const { name, fn } of checks) {
      try {
        await fn(page, pageErrors);
        console.log(`PASS ${name}`);
      } catch (err) {
        failed++;
        console.log(`FAIL ${name}: ${err.message}`);
      }
    }
  } catch (err) {
    failed++;
    console.log(`FAIL probe boot: ${err.message}`);
  } finally {
    await browser.close().catch(() => {});
    server.kill();
  }

  if (failed > 0) {
    console.log(`rows-probe: ${failed} check(s) FAILED`);
    process.exit(1);
  }
  console.log("rows-probe: ALL GREEN");
}

main();

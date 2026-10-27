/**
 * chrome-probe.mjs — CHROME1-TITLE-TAB-ROW live probe (Playwright, chromium).
 *
 * Serves the editor statically (http.server :18052), loads it standalone at
 * 1440x900 and 900x900 and asserts the OO chrome parity state:
 *   (a) wordmark and File tab share one row; File is the first tab entry
 *   (b) function band computed background is light gray in the light theme
 *   (c) 900px: › visible on Home, click shifts the content, ‹ appears,
 *       offset clamps at max
 *   (d) 1440px Home: both chevrons hidden (content fits)
 *   (e) 900px: a ribbon dropdown opens fully visible below the band
 *   (f) tab count still 12; census-visible Home controls unchanged (76)
 *   (g) zero pageerrors
 *
 * Prints "chrome-probe: ALL GREEN" only when every check passes.
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const EDITOR_DIR = resolve(HERE, "..");
const PORT = 18052;
const require = createRequire(import.meta.url);
const { chromium } = require("/home/weiss/git/World-Office/wo-test-harness/census/node_modules/playwright");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

check("(a) wordmark + File tab share row 1; File is first", async (page) => {
  const res = await page.evaluate(() => {
    const wm = document.querySelector(".titlebar .wordmark").getBoundingClientRect();
    const file = document.getElementById("btn-file").getBoundingClientRect();
    const tabs = document.querySelector(".ribbon-tabs");
    const first = tabs.firstElementChild;
    return {
      dy: Math.abs((wm.y + wm.height / 2) - (file.y + file.height / 2)),
      firstIsFile: !!first.classList.contains("ribbon-file") && !!first.querySelector("#btn-file"),
    };
  });
  if (res.dy >= 8) throw new Error(`wordmark/File row delta ${res.dy}px >= 8`);
  if (!res.firstIsFile) throw new Error("File trigger is not the first tab-strip entry");
});

check("(b) band background is OO light gray in the light theme", async (page) => {
  const rgb = await page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById("toolbar"));
    return cs.backgroundColor;
  });
  const m = rgb.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (!m) throw new Error(`unexpected band background: ${rgb}`);
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  for (const c of [r, g, b]) {
    if (c < 235 || c > 255) throw new Error(`band channel ${c} outside 235-255 (${rgb})`);
  }
});

check("(f) 12 tabs + census Home control count unchanged", async (page) => {
  const res = await page.evaluate(() => ({
    tabs: document.querySelectorAll(".ribbon-tab").length,
    homeButtons: document.querySelectorAll(".ribbon-page.active button").length,
    hasCopy: !!document.getElementById("btn-copy"),
    hasPaste: !!document.getElementById("btn-paste"),
    hasFont: !!document.getElementById("font-family"),
  }));
  if (res.tabs !== 12) throw new Error(`tab count ${res.tabs} != 12`);
  // Census baseline: HEAD's live Home page holds 92 buttons (the wo-test-harness
  // census-wo.json golden with 76 predates the WO-RIBBON-FLEX additions and is
  // stale outside this task's scope). The restructure moves no page controls.
  if (res.homeButtons !== 92) throw new Error(`Home button census ${res.homeButtons} != 92`);
  if (!res.hasCopy || !res.hasPaste || !res.hasFont) throw new Error("key Home controls missing");
});

check("(d) 1440px Home: chevrons hidden", async (page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await sleep(300);
  const hidden = await page.evaluate(() => ({
    l: document.getElementById("rib-scroll-left").hidden,
    r: document.getElementById("rib-scroll-right").hidden,
  }));
  if (!hidden.l || !hidden.r) throw new Error(`chevrons visible at 1440 (left:${hidden.l} right:${hidden.r})`);
});

check("(c) 900px: › visible, click shifts content, ‹ appears, clamped at max", async (page) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await sleep(300);
  const state0 = await page.evaluate(() => {
    const pg = document.querySelector(".ribbon-page.active");
    return {
      rightHidden: document.getElementById("rib-scroll-right").hidden,
      leftHidden: document.getElementById("rib-scroll-left").hidden,
      tf: getComputedStyle(pg).transform,
      max: pg.scrollWidth - pg.clientWidth,
    };
  });
  if (state0.rightHidden) throw new Error("› hidden at 900px on Home");
  if (!state0.leftHidden) throw new Error("‹ visible before any scroll at 900px");
  if (state0.max <= 0) throw new Error("no overflow measured at 900px");

  await page.evaluate(() => document.getElementById("rib-scroll-right").click());
  await sleep(150);
  const state1 = await page.evaluate(() => {
    const pg = document.querySelector(".ribbon-page.active");
    const m = getComputedStyle(pg).transform.match(/matrix\(([^)]+)\)/);
    return {
      tx: m ? Math.abs(parseFloat(m[1].split(",")[4])) : 0,
      leftHidden: document.getElementById("rib-scroll-left").hidden,
    };
  });
  if (state1.tx === 0) throw new Error("content did not shift after › click");
  if (state1.leftHidden) throw new Error("‹ did not become visible after scroll");

  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => document.getElementById("rib-scroll-right").click());
    await sleep(60);
  }
  const clamped = await page.evaluate(() => {
    const pg = document.querySelector(".ribbon-page.active");
    const m = getComputedStyle(pg).transform.match(/matrix\(([^)]+)\)/);
    const tx = m ? parseFloat(m[1].split(",")[4]) : 0;
    return { tx, max: pg.scrollWidth - pg.clientWidth };
  });
  if (Math.abs(Math.abs(clamped.tx) - clamped.max) > 2) {
    throw new Error(`not clamped: translateX ${clamped.tx} vs max -${clamped.max}`);
  }
});

check("(c2) tab switch resets the offset", async (page) => {
  await page.evaluate(() => document.querySelector('.ribbon-tab[data-tab="home"]').click());
  await sleep(150);
  const tf = await page.evaluate(() => getComputedStyle(document.querySelector(".ribbon-page.active")).transform);
  if (tf !== "none") throw new Error(`offset not reset on tab switch (transform ${tf})`);
});

check("(e) 900px: dropdown opens fully visible below the band", async (page) => {
  const opened = await page.evaluate(() => {
    const trig = document.querySelector('.ribbon-page.active .rb-menu .menu-trigger, .ribbon-page.active .rb-menu .styles-trigger');
    if (!trig) return false;
    trig.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    trig.click();
    const list = trig.closest(".rb-menu").querySelector(".menu-list");
    return !!list && !list.hidden;
  });
  if (!opened) throw new Error("rb-menu dropdown did not open at 900px");
  const fit = await page.evaluate(() => {
    const list = document.querySelector('.ribbon-page.active .rb-menu .menu-list:not([hidden])');
    const r = list.getBoundingClientRect();
    return { bottom: r.bottom, height: r.height, vh: window.innerHeight };
  });
  if (fit.height <= 0) throw new Error("dropdown has zero height");
  if (fit.bottom > fit.vh) throw new Error(`dropdown bottom ${fit.bottom} below viewport ${fit.vh}`);
  await page.keyboard.press("Escape");
});

check("(g) zero pageerrors", async (_page, errors) => {
  if (errors.length > 0) throw new Error(`${errors.length} pageerror(s): ${errors[0]}`);
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
    console.log(`chrome-probe: ${failed} check(s) FAILED`);
    process.exit(1);
  }
  console.log("chrome-probe: ALL GREEN");
}

main();

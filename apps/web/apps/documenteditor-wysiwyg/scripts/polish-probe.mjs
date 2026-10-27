/**
 * polish-probe.mjs — CHROME5-POLISH-ACCENTS live probe (Playwright, chromium).
 *
 * Serves the editor statically (http.server :18056), loads it standalone at
 * 1440x900 and asserts the OO polish state:
 *   (a) statusbar slider is the live zoom control: value == zoom,
 *       input -> applyZoom, + button -> slider increases
 *   (b) Ctrl+wheel zoom syncs the slider
 *   (c) Ctrl+0 resets zoom AND the slider to 100
 *   (d) injected chart img -> chart-design tab revealed WITH the contextual
 *       accent (2px accent border, unlike Home); returning to Home hides it
 *       while the Draw tab keeps its permanent contextual accent
 *   (e) real-mouse hover on a ribbon tab flips its computed background
 *   (f) zero pageerrors
 *
 * Prints "polish-probe: ALL GREEN" only when every check passes.
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const EDITOR_DIR = resolve(HERE, "..");
const PORT = 18056;
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

check("(a) slider is the live zoom control (two-way sync)", async (page) => {
  const state = () => page.evaluate(() => ({
    slider: document.getElementById("sb-zoom-slider").value,
    zoom: document.getElementById("editor").style.zoom,
    label: document.getElementById("sb-zoom-label").textContent,
    aria: document.getElementById("sb-zoom-slider").getAttribute("aria-label"),
  }));
  let s = await state();
  if (s.slider !== "100") throw new Error(`initial slider ${s.slider} != 100`);
  if (!/zoom slider/i.test(s.aria)) throw new Error(`slider aria-label not localized: "${s.aria}"`);

  // slider -> zoom: drag to 150 (input event)
  await page.evaluate(() => {
    const el = document.getElementById("sb-zoom-slider");
    el.value = "150";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sleep(150);
  s = await state();
  if (s.zoom !== "1.5") throw new Error(`slider input did not apply zoom (zoom ${s.zoom})`);
  if (!s.label.includes("150")) throw new Error(`zoom label not updated: ${s.label}`);

  // zoom button -> slider: + steps to 160
  await page.evaluate(() => document.getElementById("btn-zoom-in").click());
  await sleep(150);
  s = await state();
  if (s.slider !== "160") throw new Error(`+ button did not move slider (${s.slider})`);
  if (s.zoom !== "1.6") throw new Error(`+ button zoom wrong (${s.zoom})`);
});

check("(b) Ctrl+wheel zoom syncs the slider", async (page) => {
  await page.evaluate(() => {
    const editor = document.getElementById("editor");
    editor.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, ctrlKey: true, bubbles: true, cancelable: true }));
  });
  await sleep(150);
  const s = await page.evaluate(() => ({
    slider: document.getElementById("sb-zoom-slider").value,
    zoom: document.getElementById("editor").style.zoom,
  }));
  if (s.slider !== "170" || s.zoom !== "1.7") {
    throw new Error(`ctrl+wheel desync: slider ${s.slider}, zoom ${s.zoom}`);
  }
});

check("(c) Ctrl+0 resets zoom and slider to 100", async (page) => {
  // The zoom shortcuts live on the #editor keydown handler (like Ctrl+Minus).
  await page.evaluate(() => document.getElementById("editor").focus());
  await page.keyboard.press("Control+0");
  await sleep(150);
  const s = await page.evaluate(() => ({
    slider: document.getElementById("sb-zoom-slider").value,
    zoom: document.getElementById("editor").style.zoom,
    label: document.getElementById("sb-zoom-label").textContent,
  }));
  if (s.slider !== "100" || s.zoom !== "1") {
    throw new Error(`Ctrl+0 did not reset: slider ${s.slider}, zoom ${s.zoom}`);
  }
  if (!s.label.includes("100")) throw new Error(`label not reset: ${s.label}`);
});

check("(d) chart-design reveals with contextual accent; Home keeps Draw accent", async (page) => {
  const accent = await page.evaluate(() => {
    const editor = document.getElementById("editor");
    const img = document.createElement("img");
    img.src = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
    img.className = "vector-object";
    img.dataset.kind = "chart";
    img.style.width = "60px";
    img.style.height = "40px";
    editor.appendChild(img);
    img.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const chartTab = document.querySelector('.ribbon-tab[data-tab="chart-design"]');
    const homeTab = document.querySelector('.ribbon-tab[data-tab="home"]');
    const cs = chartTab && getComputedStyle(chartTab);
    return {
      hidden: chartTab ? chartTab.hidden : null,
      contextual: chartTab ? chartTab.classList.contains("contextual") : false,
      chartBorder: cs ? `${cs.borderBottomWidth} ${cs.borderBottomColor}` : "",
      homeBorder: `${getComputedStyle(homeTab).borderBottomWidth} ${getComputedStyle(homeTab).borderBottomColor}`,
    };
  });
  await sleep(200);
  if (accent.hidden) throw new Error("chart-design tab not revealed by chart click");
  if (!accent.contextual) throw new Error("revealed chart-design tab lacks the contextual class");
  if (!accent.chartBorder.startsWith("2px")) throw new Error(`no accent underline on chart-design (${accent.chartBorder})`);
  if (accent.chartBorder === accent.homeBorder) {
    throw new Error(`accent indistinguishable from Home (${accent.chartBorder})`);
  }

  // Switching to Home: chart-design stays revealed (it hides on non-chart
  // clicks inside the DOCUMENT, not on tab switches) and keeps the accent
  // — now unselected, so the tinted contextual face — and Draw keeps its
  // permanent accent too.
  await page.evaluate(() => document.querySelector('.ribbon-tab[data-tab="home"]').click());
  await sleep(200);
  const after = await page.evaluate(() => {
    const chartTab = document.querySelector('.ribbon-tab[data-tab="chart-design"]');
    const drawTab = document.querySelector('.ribbon-tab[data-tab="draw"]');
    const ccs = getComputedStyle(chartTab);
    const dcs = getComputedStyle(drawTab);
    return {
      chartHidden: chartTab.hidden,
      chartSelected: chartTab.getAttribute("aria-selected"),
      chartContextual: chartTab.classList.contains("contextual"),
      chartBorder: `${ccs.borderBottomWidth} ${ccs.borderBottomColor}`,
      chartBg: ccs.backgroundColor,
      drawContextual: drawTab.classList.contains("contextual"),
      drawBorder: `${dcs.borderBottomWidth} ${dcs.borderBottomColor}`,
    };
  });
  if (after.chartHidden) throw new Error("chart-design tab wrongly hidden on tab switch");
  if (after.chartSelected !== "false") throw new Error("chart-design should be unselected after Home");
  if (!after.chartContextual) throw new Error("chart-design lost its contextual accent");
  if (!after.chartBorder.startsWith("2px")) throw new Error(`chart-design lost its accent underline (${after.chartBorder})`);
  if (after.chartBg === "rgba(0, 0, 0, 0)") throw new Error("unselected contextual tab lost its tinted face");
  if (!after.drawContextual) throw new Error("Draw tab lost its permanent contextual accent");
  if (!after.drawBorder.startsWith("2px")) throw new Error(`Draw tab lost its accent underline (${after.drawBorder})`);

  // Cleanup: a non-chart click inside the editor drops the pick and hides
  // the contextual tab again (existing hide path).
  const dropped = await page.evaluate(() => {
    const editor = document.getElementById("editor");
    editor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const chartTab = document.querySelector('.ribbon-tab[data-tab="chart-design"]');
    return { hidden: chartTab.hidden, contextual: chartTab.classList.contains("contextual") };
  });
  if (!dropped.hidden) throw new Error("non-chart editor click did not hide chart-design");
  if (dropped.contextual) throw new Error("hidden chart-design still carries the accent class");
});

check("(e) real-mouse hover flips a ribbon tab's computed background", async (page) => {
  // Park the pointer away from the chrome so no stray :hover is active.
  await page.mouse.move(720, 500);
  await sleep(250);
  const tab = '.ribbon-tab[data-tab="insert"]';
  const before = await page.evaluate((sel) => getComputedStyle(document.querySelector(sel)).backgroundColor, tab);
  await page.hover(tab);
  await sleep(250); // covers the 120ms transition
  const after = await page.evaluate((sel) => getComputedStyle(document.querySelector(sel)).backgroundColor, tab);
  if (before === after) {
    throw new Error(`hover did not change background (still ${before})`);
  }
  if (after === "rgba(0, 0, 0, 0)") throw new Error("hover face is transparent");
  // Leave the tab cleanly.
  await page.mouse.move(720, 500);
});

check("(f) zero pageerrors", async (_page, errors) => {
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
    console.log(`polish-probe: ${failed} check(s) FAILED`);
    process.exit(1);
  }
  console.log("polish-probe: ALL GREEN");
}

main();

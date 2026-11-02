/**
 * rib001-geometry-check.mjs — RIB-001 live verification (throwaway probe).
 * Serves the editor, then asserts in BOTH themes:
 *  (a) active tab bottom edge == toolbar top edge (folder-tab seam)
 *  (b) inactive tabs stay 28px inside the strip (no bleed)
 *  (c) inactive-tab hover flips computed background to the ribbon-hover tint
 *  (d) active contextual tab keeps its 2px accent underline
 * Screenshots dark + light to /tmp/rib001-*.png for eyeballing.
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const HERE = dirname(fileURLToPath(import.meta.url));
const EDITOR_DIR = resolve(HERE, "..");
const PORT = 18071;
const require = createRequire(import.meta.url);
const { chromium } = require("/home/weiss/git/World-Office/wo-test-harness/census/node_modules/playwright");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn("/usr/bin/python3", ["-m", "http.server", String(PORT), "-d", EDITOR_DIR], { stdio: "ignore" });
for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/index.html`); break; } catch { await sleep(200); } }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://127.0.0.1:${PORT}/index.html?doc=seed`);
await page.waitForTimeout(1200);

async function checkTheme(name) {
  const r = await page.evaluate(() => {
    const tab = (s) => document.querySelector(`.ribbon-tab[data-tab="${s}"]`);
    const rect = (el) => el.getBoundingClientRect();
    const active = tab("home");
    const inactive = tab("insert");
    const toolbarTop = rect(document.getElementById("toolbar")).top;
    return {
      activeBottom: rect(active).bottom,
      activeTop: rect(active).top,
      inactiveHeight: rect(inactive).height,
      toolbarTop,
      activeBg: getComputedStyle(active).backgroundColor,
      activeRadius: getComputedStyle(active).borderRadius,
      activeBorderBottom: getComputedStyle(active).borderBottomWidth + " " + getComputedStyle(active).borderBottomStyle,
    };
  });
  assert.ok(Math.abs(r.activeBottom - r.toolbarTop) < 0.51,
    `${name}: active tab bottom (${r.activeBottom.toFixed(1)}) must seam into toolbar top (${r.toolbarTop.toFixed(1)})`);
  assert.ok(Math.abs(r.inactiveHeight - 28) < 0.51, `${name}: inactive tab stays 28px (got ${r.inactiveHeight})`);

  // hover face: computed bg flips on an inactive tab
  const insert = page.locator('.ribbon-tab[data-tab="insert"]');
  const before = await insert.evaluate((el) => getComputedStyle(el).backgroundColor);
  await insert.hover();
  await page.waitForTimeout(250);
  const after = await insert.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.mouse.move(400, 600);
  assert.notEqual(before, after, `${name}: hover must flip the inactive-tab background (${before} -> ${after})`);

  // active contextual tab: accent underline present when activated
  await page.evaluate(() => {
    const t = document.querySelector('.ribbon-tab[data-tab="chart-design"]');
    t.hidden = false; // reveal without needing a chart
    t.click();
  });
  const ctx = await page.evaluate(() => {
    const t = document.querySelector('.ribbon-tab[data-tab="chart-design"]');
    const cs = getComputedStyle(t);
    return { bb: cs.borderBottomWidth + " " + cs.borderBottomStyle + " " + cs.borderBottomColor,
             bottom: t.getBoundingClientRect().bottom,
             toolbarTop: document.getElementById("toolbar").getBoundingClientRect().top };
  });
  assert.ok(ctx.bb.startsWith("2px solid"), `${name}: active contextual tab keeps 2px underline (got ${ctx.bb})`);
  assert.ok(Math.abs(ctx.bottom - ctx.toolbarTop) < 0.51, `${name}: seamed contextual tab also reaches the band`);
  await page.evaluate(() => document.querySelector('.ribbon-tab[data-tab="home"]').click());
  await page.screenshot({ path: `/tmp/rib001-${name}.png`, clip: { x: 0, y: 0, width: 1440, height: 220 } });
  console.log(`${name}: seam=${r.activeBottom.toFixed(1)}==${r.toolbarTop.toFixed(1)} bg=${r.activeBg} radius=${r.activeRadius} hoverFace=${before}->${after} ctxUnderline=${ctx.bb}`);
}

await checkTheme("light");
// true dark: applyTheme reads localStorage at startup — set + reload
await page.evaluate(() => localStorage.setItem("wo-theme", "dark"));
await page.reload();
await page.waitForTimeout(1200);
assert.ok(await page.evaluate(() => document.documentElement.classList.contains("light") === false), "dark theme active");
await checkTheme("dark");

assert.equal(errors.length, 0, `pageerrors: ${errors.join("; ")}`);
await browser.close();
server.kill();
console.log("rib001-geometry: ALL GREEN");

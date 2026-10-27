/**
 * backstage-probe.mjs — CHROME3-BACKSTAGE-STATUSBAR live probe (Playwright, chromium).
 *
 * Serves the editor statically (http.server :18054), loads it standalone at
 * 1440x900 and asserts the OO backstage + statusbar state:
 *   (a) File click opens the full-screen backstage overlay (.open, viewport-sized)
 *   (b) every legacy file-menu affordance (ids, data-cmds, data-export) survives
 *   (f) rail pane switch shows the matching view (export formats visible)
 *   (e) Tab trap keeps focus inside the overlay
 *   (c) Back row closes it (btn-file aria-expanded reset)
 *   (g) sb-lang mirrors the document language and follows changes
 *   (d) Esc closes the reopened overlay
 *   (h) statusbar clusters: page/word left half, language before zoom
 *   (i) zero pageerrors
 *
 * Prints "backstage-probe: ALL GREEN" only when every check passes.
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const EDITOR_DIR = resolve(HERE, "..");
const PORT = 18054;
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

check("(a) File click opens the full-screen backstage overlay", async (page) => {
  await page.evaluate(() => document.getElementById("btn-file").click());
  await sleep(200);
  const st = await page.evaluate(() => {
    const ov = document.getElementById("backstage-overlay");
    const r = ov.getBoundingClientRect();
    return {
      open: ov.classList.contains("open"),
      w: r.width,
      h: r.height,
      vw: window.innerWidth,
      vh: window.innerHeight,
      expanded: document.getElementById("btn-file").getAttribute("aria-expanded"),
      openActive: !!ov.querySelector('.backstage-row[data-pane="open"].active'),
    };
  });
  if (!st.open) throw new Error("overlay did not open (.open missing)");
  if (Math.abs(st.w - st.vw) > 1 || Math.abs(st.h - st.vh) > 1) {
    throw new Error(`overlay ${st.w}x${st.h} not viewport ${st.vw}x${st.vh}`);
  }
  if (st.expanded !== "true") throw new Error("btn-file aria-expanded not true");
  if (!st.openActive) throw new Error("open rail row not active on open (default pane flipped to Recent/Open in CHROME4)");
});

check("(b) legacy file-menu affordances all survive in the overlay", async (page) => {
  const st = await page.evaluate(() => {
    const ov = document.getElementById("backstage-overlay");
    const ids = ["btn-new", "btn-open", "btn-export", "btn-print", "btn-history", "btn-ai-review",
      "btn-fileinfo", "btn-fileprotect", "btn-filesettings", "btn-filehelp", "btn-filesuggest"];
    const missing = ids.filter((id) => !ov.querySelector(`#${id}`));
    const back = !!ov.querySelector('button[data-cmd="closeFileMenu"]');
    const save = !!ov.querySelector('button[data-cmd="saveDocument"]');
    const formats = [...ov.querySelectorAll("#export-sub button[data-export]")].map((b) => b.dataset.export);
    const panes = [...ov.querySelectorAll(".backstage-row[data-pane]")].map((r) => r.dataset.pane);
    return { missing, back, save, formats, panes };
  });
  if (st.missing.length) throw new Error(`missing legacy ids: ${st.missing.join(",")}`);
  if (!st.back) throw new Error("Back row (data-cmd=closeFileMenu) missing");
  if (!st.save) throw new Error("Save button (data-cmd=saveDocument) missing");
  const wantFormats = ["pdf", "odt", "html", "docx"];
  if (JSON.stringify(st.formats) !== JSON.stringify(wantFormats)) {
    throw new Error(`export formats ${JSON.stringify(st.formats)} != ${JSON.stringify(wantFormats)}`);
  }
  const wantPanes = ["new", "open", "save", "export", "info", "history", "ai", "print", "settings", "protect", "help", "suggest"];
  for (const p of wantPanes) {
    if (!st.panes.includes(p)) throw new Error(`rail pane ${p} missing`);
  }
});

check("(f) rail pane switch shows the export view with formats", async (page) => {
  await page.evaluate(() => document.querySelector('.backstage-row[data-pane="export"]').click());
  await sleep(150);
  const st = await page.evaluate(() => {
    const ov = document.getElementById("backstage-overlay");
    const view = ov.querySelector('[data-pane-view="export"]');
    const formats = [...ov.querySelectorAll("#export-sub button[data-export]")];
    return {
      visible: view.offsetParent !== null,
      rowActive: !!ov.querySelector('.backstage-row[data-pane="export"].active'),
      othersHidden: [...ov.querySelectorAll(".backstage-view")].filter((v) => v !== view).every((v) => v.hidden),
      formatsVisible: formats.every((b) => b.offsetParent !== null),
    };
  });
  if (!st.visible) throw new Error("export view not visible after rail click");
  if (!st.rowActive) throw new Error("export rail row not marked active");
  if (!st.othersHidden) throw new Error("other views not hidden after pane switch");
  if (!st.formatsVisible) throw new Error("export format buttons not visible");
});

check("(e) Tab trap keeps focus inside the overlay", async (page) => {
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    await sleep(40);
  }
  const inside = await page.evaluate(() => {
    const ov = document.getElementById("backstage-overlay");
    return ov.contains(document.activeElement);
  });
  if (!inside) throw new Error("focus escaped the overlay after 12 Tabs");
});

check("(c) Back row closes the overlay", async (page) => {
  await page.evaluate(() => document.querySelector(".backstage-back").click());
  await sleep(200);
  const st = await page.evaluate(() => ({
    open: document.getElementById("backstage-overlay").classList.contains("open"),
    expanded: document.getElementById("btn-file").getAttribute("aria-expanded"),
    focusInOverlay: document.getElementById("backstage-overlay").contains(document.activeElement),
  }));
  if (st.open) throw new Error("overlay still open after Back");
  if (st.expanded !== "false") throw new Error("btn-file aria-expanded not reset");
  if (st.focusInOverlay) throw new Error("focus left inside the closed overlay");
});

check("(g) sb-lang mirrors the document language and follows changes", async (page) => {
  const st0 = await page.evaluate(() => {
    const sel = document.getElementById("doc-lang");
    const lbl = document.getElementById("sb-lang");
    return { sel: sel.value, text: lbl.textContent.trim() };
  });
  if (st0.sel !== "en-US") throw new Error(`doc-lang boot value ${st0.sel} != en-US`);
  if (st0.text !== "English (United States)") throw new Error(`sb-lang boot text "${st0.text}" wrong`);

  await page.evaluate(() => {
    const sel = document.getElementById("doc-lang");
    sel.value = "de-DE";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await sleep(150);
  const de = await page.evaluate(() => document.getElementById("sb-lang").textContent.trim());
  if (de !== "Deutsch (Deutschland)") throw new Error(`sb-lang after de-DE switch: "${de}"`);

  await page.evaluate(() => {
    const sel = document.getElementById("doc-lang");
    sel.value = "en-US";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await sleep(150);
  const back = await page.evaluate(() => document.getElementById("sb-lang").textContent.trim());
  if (back !== "English (United States)") throw new Error(`sb-lang restore: "${back}"`);
});

check("(d) Esc closes the reopened overlay", async (page) => {
  await page.evaluate(() => document.getElementById("btn-file").click());
  await sleep(200);
  const opened = await page.evaluate(() => document.getElementById("backstage-overlay").classList.contains("open"));
  if (!opened) throw new Error("overlay did not reopen for the Esc check");
  await page.keyboard.press("Escape");
  await sleep(200);
  const st = await page.evaluate(() => ({
    open: document.getElementById("backstage-overlay").classList.contains("open"),
    expanded: document.getElementById("btn-file").getAttribute("aria-expanded"),
  }));
  if (st.open) throw new Error("overlay still open after Escape");
  if (st.expanded !== "false") throw new Error("btn-file aria-expanded not reset after Escape");
});

check("(h) statusbar clusters: page/word left, language before zoom", async (page) => {
  const st = await page.evaluate(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect();
    const page2 = r("sb-page-count");
    const words = r("sb-word-count");
    const lang = r("sb-lang");
    const zoomOut = r("btn-zoom-out");
    const zoomLabel = r("sb-zoom-label");
    return {
      leftHalf: Math.max(page2.right, words.right) <= window.innerWidth / 2,
      langBeforeZoom: lang.right <= zoomOut.left,
      zoomBeforeLabel: zoomOut.left < zoomLabel.left,
      langVisible: lang.width > 0,
    };
  });
  if (!st.leftHalf) throw new Error("page/word cluster not in the left half");
  if (!st.langVisible) throw new Error("sb-lang has zero width");
  if (!st.langBeforeZoom) throw new Error("sb-lang not left of the zoom cluster");
  if (!st.zoomBeforeLabel) throw new Error("zoom controls not left of the zoom label");
});

check("(i) zero pageerrors", async (_page, errors) => {
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
    console.log(`backstage-probe: ${failed} check(s) FAILED`);
    process.exit(1);
  }
  console.log("backstage-probe: ALL GREEN");
}

main();

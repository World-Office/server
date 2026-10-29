/**
 * shortcuts-probe.mjs — C1-SHORTCUT-PARITY live probe (Playwright, chromium).
 *
 * Serves the editor statically (:18057), loads standalone, focuses the editor
 * and dispatches each C1 OO-parity key combo, asserting the wo-command bus
 * emits the expected command (the project invariant all toolbar/ribbon actions
 * route through). Verifies bus emission + zero JS pageerrors.
 *
 * Prints "shortcuts-probe: ALL GREEN" only when every check passes.
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const EDITOR_DIR = resolve(HERE, "..");
const PORT = 18057;
const require = createRequire(import.meta.url);
const { chromium } = require("/home/weiss/git/World-Office/wo-test-harness/census/node_modules/playwright");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function startServer() {
  return spawn("/usr/bin/python3", ["-m", "http.server", String(PORT), "-d", EDITOR_DIR], { stdio: "ignore" });
}
async function waitUp(port) {
  for (let i = 0; i < 50; i++) {
    try { await fetch(`http://127.0.0.1:${port}/index.html`); return true; } catch { await sleep(200); }
  }
  return false;
}

(async () => {
  const srv = startServer();
  const ok = await waitUp(PORT);
  if (!ok) { srv.kill(); console.error("shortcuts-probe: server not up"); process.exit(1); }

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await sleep(6000);

  // Hook the wo-command bus and focus the editor.
  await page.evaluate(() => {
    window.__cmds = [];
    window.addEventListener("wo-command", (e) => {
      try { window.__cmds.push(String(e.detail && e.detail.command)); } catch (_) {}
    });
    const ed = document.querySelector("[contenteditable='true']");
    if (ed) ed.focus();
  });
  const reset = () => page.evaluate(() => { window.__cmds = []; });
  const lastCmds = () => page.evaluate(() => window.__cmds.slice());

  const combos = {
    "Control+,":                "superscript",
    "Control+Alt+-":            "insertSymbol",   // em dash
    "Control+Shift+-":          "insertSymbol",   // en dash
    "Control+Shift+Space":      "insertSymbol",   // nbsp
    "Control+Enter":            "insertPageBreak",
    "Control+Shift+Enter":      "insertColumnBreak",
    "Control+K":                "link",
    "Control+Alt+F":            "insertFootnote",
    "Control+Alt+D":            "insertEndnote",
    "Control+Shift+K":          "smallCaps",
    "Control+Alt+Q":            "toggleChat",
    "Control+Alt+E":            "insertSymbol",   // Euro
    "Control+Alt+G":            "insertSymbol",   // © copyright
  };

  const results = [];
  for (const [combo, expected] of Object.entries(combos)) {
    await reset();
    // Close any modal that a prior combo may have opened (e.g. Ctrl+K opens
    // the link dialog and steals focus) and refocus the editor so later
    // combos still reach its keydown handler.
    await page.keyboard.press("Escape");
    await sleep(80);
    await page.evaluate(() => {
      const ed = document.querySelector("[contenteditable='true']");
      if (ed) ed.focus();
    });
    await page.keyboard.press(combo);
    await sleep(150);
    const cmds = await lastCmds();
    const fired = cmds.includes(expected);
    results.push({ name: `${combo} -> ${expected}`, pass: fired, detail: cmds.join(",") });
  }

  // Zero JS pageerrors (resource 404/501 from static standalone serving is
  // expected and not an editor defect; only real JS exceptions count).
  results.push({
    name: "zero JS pageerrors",
    pass: jsErrors.length === 0,
    detail: jsErrors.slice(0, 3).join(" | ") || "",
  });

  await browser.close(); srv.kill();

  let allGreen = true;
  for (const r of results) {
    console.log(`  [${r.pass ? "PASS" : "FAIL"}] ${r.name}${r.pass ? "" : "   " + (r.detail || "")}`);
    if (!r.pass) allGreen = false;
  }
  if (!allGreen) { console.error("shortcuts-probe: FAIL"); process.exit(1); }
  console.log("shortcuts-probe: ALL GREEN");
})().catch((e) => { console.error("shortcuts-probe: FATAL", e); process.exit(1); });

#!/usr/bin/env node
import { spawn } from "node:child_process";
import net from "node:net";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("/home/weiss/git/World-Office/wo-test-harness/census/node_modules/playwright");
const PORT = 18051;
const EDITOR_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PY = "/usr/bin/python3";
const SEED_HTML = "<h1>Undo Deep Probe</h1><p>alpha bravo charlie delta echo foxtrot</p><p>second paragraph golf hotel india juliet</p>";

function stubInit(cfg) {
  window.__COLLAB__ = false;
  try { localStorage.clear(); } catch {}
  navigator.sendBeacon = () => true;
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : (input && input.url) || String(input);
    const method = String(init.method || (input && input.method) || "GET").toUpperCase();
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
    if (method === "GET" && /\/api\/documents\/[^/?]+\/html/.test(url)) return json({ html: cfg.seed, name: "demo.docx" });
    return json({ ok: true });
  };
}

function freePort(preferred) {
  return new Promise((res) => {
    const srv = net.createServer();
    srv.once("error", () => res(0));
    srv.listen(preferred, "127.0.0.1", () => { const p = srv.address().port; srv.close(() => res(p)); });
  });
}
async function waitUp(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { await fetch(`http://127.0.0.1:${port}/index.html`); return; }
    catch { await new Promise((r) => setTimeout(r, 120)); }
  }
  throw new Error("no server");
}

const selWordInPage = (word) => {
  const root = document.getElementById("editor");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const i = node.data.indexOf(word);
    if (i >= 0) {
      const r = document.createRange();
      r.setStart(node, i); r.setEnd(node, i + word.length);
      const sel = document.getSelection();
      sel.removeAllRanges(); sel.addRange(r);
      return;
    }
  }
  throw new Error(`word ${JSON.stringify(word)} not found`);
};

const port = await freePort(PORT);
const server = spawn(PY, ["-m", "http.server", String(port), "--bind", "127.0.0.1"], { cwd: EDITOR_DIR, stdio: "ignore" });
await waitUp(port, 15000);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.addInitScript(stubInit, { seed: SEED_HTML });
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

await page.evaluate(() => {
  window.__norm = (html) => {
    const t = document.createElement("template");
    t.innerHTML = html;
    const root = t.content;
    root.querySelectorAll(".wo-page").forEach((pg) => {
      while (pg.firstChild) pg.parentNode.insertBefore(pg.firstChild, pg);
      pg.remove();
    });
    root.querySelectorAll(".wo-hf-clone").forEach((el) => el.remove());
    return root.innerHTML;
  };
});

await page.evaluate((seed) => {
  const ed = document.getElementById("editor");
  ed.innerHTML = seed;
  window.__WO_HISTORY__.reset(seed);
}, SEED_HTML);
await page.waitForTimeout(80);
await page.evaluate(selWordInPage, "bravo");
await page.locator("#editor").focus();
await page.evaluate(selWordInPage, "bravo");

const rawBefore = await page.evaluate(() => document.getElementById("editor").innerHTML);
const beforeNorm = await page.evaluate((h) => window.__norm(h), rawBefore);
const h0 = await page.evaluate(() => ({ u: window.__WO_HISTORY__.undoDepth, r: window.__WO_HISTORY__.redoDepth }));
console.log("typeof __norm:", await page.evaluate(() => typeof window.__norm));
console.log("h0:", h0);
console.log("beforeNorm:", beforeNorm === undefined ? "UNDEFINED" : beforeNorm.slice(0, 120));
console.log("sel:", await page.evaluate(() => { const s = document.getSelection(); return s.rangeCount ? s.toString() : "(none)"; }));

await page.evaluate(() => document.querySelector('[data-cmd="bold"]').click());
await page.waitForTimeout(150);
const rawAfter = await page.evaluate(() => document.getElementById("editor").innerHTML);
const afterNorm = await page.evaluate((h) => window.__norm(h), rawAfter);
const h1 = await page.evaluate(() => ({ u: window.__WO_HISTORY__.undoDepth, r: window.__WO_HISTORY__.redoDepth }));
console.log("h1:", h1);
console.log("afterNorm:", afterNorm === undefined ? "UNDEFINED" : afterNorm.slice(0, 120));
console.log("norm changed:", beforeNorm !== afterNorm);
await browser.close();
server.kill();

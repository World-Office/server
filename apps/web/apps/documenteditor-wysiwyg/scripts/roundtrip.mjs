#!/usr/bin/env node
// BUG3-SERIALIZATION-SAFETY — in-page save/export round-trip probe.
//
// WHAT: boots the WYSIWYG editor in headless Chromium, builds a document
// exercising EVERY DOM-marking feature (spellcheck ON with misspellings,
// text direction, comment + reply + resolved, track changes, table cell
// alignment/vertical-align, chart, plain image, content control, TOC +
// list of figures, drop cap, footnote, bookmark, header/footer, page
// setup), plants editor-internal leak bait (resize handle, aria-pressed/
// data-cmd/wo-cont/data-word span), then triggers the REAL serialization
// (the flatHtml() funnel behind #btn-save — fetch stubbed to capture the
// POST payload instead of hitting a backend).
//
// ASSERTS on the payload:
//   (a) zero .wo-misspelled spans / data-word caches
//   (b) no aria-pressed / data-cmd / data-peer, no .img-resize-handle,
//       no wo-cont / wo-li-cont / wo-row-cont, no wo-page / wo-hf-clone
//   (c) data-textdir / data-kind / data-spec / data-author / data-replies /
//       data-resolved / data-id / data-comment / data-cc / data-name /
//       data-title all SURVIVE (document semantics)
//   (d) HTML is well-formed (stack tag-balance check)
// Reload round-trip: editor.innerHTML = payload; re-serialize → must be
// byte-identical (idempotent) and error-free.
//
// HOW TO RUN (manual/live-only; the *.test.mjs gate pins this file's
// existence and its key selectors):
//   node scripts/roundtrip.mjs [--port 18044] [--out scripts/roundtrip-report.json]
// Starts its own `python3 -m http.server` on the chosen port serving the
// editor dir (scripts/..), exits non-zero on any failed assert or real
// pageerror/console.error.
//
// Playwright is NOT an npm dependency of this app; it is loaded from the
// shared test harness by absolute path (same recipe as scripts/smoke.mjs).
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const EDITOR_DIR = resolve(HERE, "..");
const PLAYWRIGHT = "/home/weiss/git/World-Office/wo-test-harness/census/node_modules/playwright";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const PORT = Number(arg("--port", "18044"));
const OUT = resolve(process.cwd(), arg("--out", join(HERE, "roundtrip-report.json")));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function freePort(preferred) {
  return new Promise((res) => {
    const srv = net.createServer();
    srv.listen(preferred, () => { const p = srv.address().port; srv.close(() => res(p)); });
    srv.on("error", () => {
      const srv2 = net.createServer();
      srv2.listen(0, () => { const p = srv2.address().port; srv2.close(() => res(p)); });
    });
  });
}
function startServer(dir, port) {
  const exe = existsSync("/usr/bin/python3") ? "/usr/bin/python3" : "python3";
  return spawn(exe, ["-m", "http.server", String(port), "-d", dir], { stdio: "ignore" });
}
async function waitUp(port, tries = 50) {
  for (let i = 0; i < tries; i++) {
    const ok = await new Promise((res) => {
      const req = net.connect(port, "127.0.0.1", () => { req.end(); res(true); });
      req.on("error", () => res(false));
    });
    if (ok) return true;
    await sleep(100);
  }
  return false;
}

const report = { url: "", checks: [], payloadChars: 0, errors: [], ok: false };
function check(name, cond, detail) {
  const rec = { name, ok: !!cond, detail: detail || "" };
  report.checks.push(rec);
  if (!rec.ok) report.errors.push(`FAIL ${name}${detail ? " — " + detail : ""}`);
  return rec.ok;
}

// 1x1 PNG (same as smoke.mjs)
const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// The feature fixture: EXACT markup the editor's own constructors emit
// (comment span / tracked ins+del / vector object / content control /
// toc navs / dropcap / footnote / bookmark / page furniture). Plus one
// deliberate LEAK BAIT span carrying editor-internal state — the payload
// must keep its text but drop every internal marker.
const FIXTURE = `
<div class="page-setup" data-page-w="11906" data-page-h="16838" data-orient="portrait" data-margin-top="1440" data-margin-bottom="1440" data-margin-left="1440" data-margin-right="1440"></div>
<header class="page-header"><p>Header furniture</p></header>
<footer class="page-footer"><p>Footer furniture</p></footer>
<p>Intro <span class="bookmark" data-name="intro">anchor</span> text with mispeled qwertyzx words</p>
<p data-textdir="rotate-down" class="wo-textdir-down" style="writing-mode: vertical-rl;">rotated direction text</p>
<p>Commented: <span class="comment" data-id="rt-c1" data-author="Alice" data-comment="Note body" data-replies='[{"author":"Bob","text":"a reply"}]' data-resolved="1">commented text</span></p>
<p><ins class="track-insert" data-author="Alice">inserted</ins> <del class="track-delete" data-author="Alice">deleted</del></p>
<table><thead><tr><th>Head</th></tr></thead><tbody><tr><td style="text-align: center; vertical-align: top;">centered cell</td></tr></tbody></table>
<p><img class="inline-object vector-object" data-kind="chart" data-spec='{"type":"bar","title":"Q1"}' alt='__wo-chart__{"type":"bar","title":"Q1"}' src="data:image/png;base64,${PNG_1PX}" style="width: 420px;"></p>
<p><img id="rt-plain-img" src="data:image/png;base64,${PNG_1PX}" alt="photo"></p>
<p><span class="content-control" data-cc="dropdown" title="Status" contenteditable="false">▾ Status</span></p>
<nav class="toc" data-kind="toc" data-title="Table of Contents"><p><a href="#intro">Intro</a></p></nav>
<nav class="toc" data-kind="figures" data-title="List of Figures"></nav>
<p><span class="dropcap in-margin">O</span>nce upon a time</p>
<p>Body note<span class="footnote">1: note text</span></p>
<p><span aria-pressed="true" data-cmd="nope" class="wo-cont" data-word="xyz">bait text</span></p>`;

// Node-side payload assertions (payload string comes from the page).
const INTERNAL_STRINGS = [
  "wo-misspelled", "data-word", "aria-pressed", "data-cmd", "data-peer",
  "img-resize-handle", "wo-cont", "wo-li-cont", "wo-row-cont",
  "wo-page", "wo-hf-clone",
];
const SEMANTIC_STRINGS = [
  ["data-textdir", "text direction survives (AF14)"],
  ["wo-textdir-down", "textdir class survives"],
  ["data-kind=\"chart\"", "chart kind survives"],
  ["data-spec", "vector object spec survives"],
  ["__wo-chart__", "alt rehydration marker survives"],
  ["data-author", "authorship survives (comment + track changes)"],
  ["data-replies", "comment replies survive"],
  ["data-resolved", "comment resolved state survives"],
  ["data-id", "comment identity survives"],
  ["data-comment", "comment body survives"],
  ["data-cc", "content control type survives"],
  ["data-name", "bookmark name survives"],
  ["data-title", "toc/figures title survives"],
  ["class=\"comment\"", "comment span survives"],
  ["track-insert", "tracked insertion survives"],
  ["track-delete", "tracked deletion survives"],
  ["class=\"dropcap", "drop cap survives"],
  ["class=\"footnote\"", "footnote survives"],
  ["class=\"bookmark\"", "bookmark survives"],
  ["class=\"content-control\"", "content control survives"],
  ["class=\"toc\"", "toc nav survives"],
  ["page-header", "header furniture survives"],
  ["page-footer", "footer furniture survives"],
  ["page-setup", "page setup marker survives"],
  ["data-page-w", "page geometry survives"],
  ["text-align: center", "table cell alignment survives"],
  ["vertical-align: top", "table cell vertical align survives"],
  ["bait text", "internal-marker span TEXT is kept (attrs stripped, not content)"],
];

function tagBalance(html) {
  const voids = new Set(["area", "base", "br", "col", "embed", "hr", "img",
    "input", "link", "meta", "param", "source", "track", "wbr"]);
  const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/g;
  const stack = [];
  let m;
  while ((m = re.exec(html))) {
    const full = m[0];
    const tag = m[1].toLowerCase();
    if (full.startsWith("</")) {
      const top = stack.pop();
      if (top !== tag) return { ok: false, why: `mismatch: expected </${top}> got </${tag}>` };
    } else if (!full.endsWith("/>") && !voids.has(tag)) {
      stack.push(tag);
    }
  }
  return stack.length === 0 ? { ok: true } : { ok: false, why: "unclosed: " + stack.join(",") };
}

async function main() {
  const port = await freePort(PORT);
  const srv = startServer(EDITOR_DIR, port);
  try {
    if (!(await waitUp(port))) throw new Error("http.server did not come up");
    const { chromium } = require(PLAYWRIGHT);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on("pageerror", (err) => {
      report.errors.push("pageerror: " + (err && err.stack ? err.stack.split("\n")[0] : String(err)));
    });
    let consoleErrors = 0;
    let net404 = 0;
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      // benign network noise: standalone boot has no python-docserver
      // backend behind the passthrough (same rule as scripts/smoke.mjs)
      if (/Failed to load resource|net::ERR_/.test(text)) { net404++; return; }
      consoleErrors++;
    });
    report.url = `http://127.0.0.1:${port}/index.html`;
    await page.goto(report.url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#editor", { timeout: 10000 });
    await sleep(900); // boot fetches settle (standalone passthrough 404s are benign)

    // -- build the fixture document ------------------------------------
    const fixtureIn = await page.evaluate((html) => {
      const ed = document.getElementById("editor");
      ed.innerHTML = html;
      ed.dispatchEvent(new InputEvent("input", { bubbles: true }));
      return ed.innerHTML.includes("rt-c1");
    }, FIXTURE);
    await sleep(300);
    const fixtureStable = await page.evaluate(() =>
      document.getElementById("editor").innerHTML.includes("rt-c1"));
    check("fixture loaded (and survived boot settle)", fixtureIn && fixtureStable,
      `in=${fixtureIn} stable=${fixtureStable}`);

    // -- spellcheck ON via the REAL settings dialog path ----------------
    const spellOn = await page.evaluate(() => {
      document.getElementById("btn-filesettings").click();
      const cb = document.getElementById("settings-spellcheck");
      cb.checked = true;
      document.getElementById("btn-settings-ok").click();
      return true;
    });
    check("spellcheck toggled via settings dialog", spellOn);
    let misspellCount = 0;
    for (let i = 0; i < 25; i++) {
      misspellCount = await page.evaluate(() =>
        document.querySelectorAll("#editor span.wo-misspelled").length);
      if (misspellCount > 0) break;
      await sleep(200);
    }
    check("live DOM carries .wo-misspelled markers (pre-condition)",
      misspellCount > 0, `count=${misspellCount}`);

    // -- pagination wraps pages (pre-condition for unwrap-on-save) -----
    let pageCount = 0;
    for (let i = 0; i < 15; i++) {
      pageCount = await page.evaluate(() =>
        document.querySelectorAll("#editor .wo-page").length);
      if (pageCount > 0) break;
      await sleep(200);
    }
    check("live DOM carries .wo-page wrappers (pre-condition)", pageCount > 0,
      `count=${pageCount}`);

    // -- plant editor-internal leak bait (selection UI + attrs) --------
    const bait = await page.evaluate(() => {
      const ed = document.getElementById("editor");
      const h = document.createElement("div");
      h.className = "img-resize-handle";
      h.setAttribute("aria-pressed", "false");
      ed.appendChild(h); // exactly what showImageResizeHandle does
      return !!ed.querySelector(":scope > .img-resize-handle");
    });
    check("internal leak bait planted (resize handle in live DOM)", bait);

    // -- capture the REAL serialization (save button funnel) -----------
    await page.evaluate(() => {
      window.__rtSave = null;
      const real = window.fetch;
      window.fetch = function (url, opts) {
        const u = String(url || "");
        if (/\/save\?/.test(u)) {
          window.__rtSave = { url: u, body: opts && opts.body };
          return Promise.resolve(new Response(JSON.stringify({ ok: true }),
            { status: 200, headers: { "Content-Type": "application/json" } }));
        }
        return real.apply(this, arguments);
      };
    });
    await page.evaluate(() => document.getElementById("btn-save").click());
    let savedPayload = null;
    for (let i = 0; i < 20; i++) {
      savedPayload = await page.evaluate(() => {
        const s = window.__rtSave;
        if (!s || typeof s.body !== "string") return null;
        try { return JSON.parse(s.body).html || null; } catch { return null; }
      });
      if (savedPayload) break;
      await sleep(150);
    }
    check("save click produced a captured POST payload", !!savedPayload,
      "fetch stub saw no /save body");

    // payload from the export hook (same funnel) for the reload phase
    const hookPayload = await page.evaluate(() => window.__WO_FLAT_HTML__());
    check("__WO_FLAT_HTML__ export hook serializes", typeof hookPayload === "string" &&
      hookPayload.length > 100, `len=${hookPayload ? hookPayload.length : 0}`);
    const payload = savedPayload || hookPayload;
    report.payloadChars = payload.length;
    check("save payload matches the flatHtml funnel output",
      !!savedPayload && savedPayload === hookPayload,
      "saveDocument must POST exactly flatHtml()");

    // -- (a)+(b) internal markers are GONE -----------------------------
    for (const s of INTERNAL_STRINGS) {
      check(`payload free of internal marker: ${s}`, !payload.includes(s));
    }

    // -- (c) document semantics SURVIVE --------------------------------
    for (const [s, why] of SEMANTIC_STRINGS) {
      check(`payload keeps semantic markup: ${s}`, payload.includes(s), why);
    }
    check("payload keeps BOTH toc kinds (toc + figures)",
      payload.includes("data-kind=\"toc\"") && payload.includes("data-kind=\"figures\""));

    // -- (d) well-formed HTML (tag balance) ----------------------------
    const bal = tagBalance(payload);
    check("payload is tag-balanced", bal.ok, bal.why);

    // -- reload round-trip: idempotent re-serialization ----------------
    const reload = await page.evaluate((html) => {
      const ed = document.getElementById("editor");
      ed.innerHTML = html;
      return true;
    }, payload);
    await sleep(300);
    const payload2 = await page.evaluate(() => window.__WO_FLAT_HTML__());
    check("reload round-trip is byte-identical (idempotent)",
      reload && payload2 === payload,
      payload2 === payload ? "" :
        `len1=${payload.length} len2=${payload2.length} ` +
        `firstDiff=${[...payload].findIndex((c, i) => c !== payload2[i])}`);

    // -- no real crashes ------------------------------------------------
    check("no console.error during the run", consoleErrors === 0,
      `consoleErrors=${consoleErrors} net404(benign)=${net404}`);

    await browser.close();
  } finally {
    srv.kill();
  }
  report.ok = report.errors.length === 0;
  report.summary = {
    total: report.checks.length,
    failed: report.checks.filter((c) => !c.ok).length,
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  const failed = report.checks.filter((c) => !c.ok);
  console.log(`roundtrip: ${report.summary.total} checks — ` +
    `failed=${report.summary.failed} payloadChars=${report.payloadChars}`);
  for (const f of failed) console.log("  FAIL", f.name, f.detail);
  for (const e of report.errors) {
    if (!e.startsWith("FAIL")) console.log("  ERROR", e);
  }
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => { console.error("roundtrip driver:", e); process.exit(1); });

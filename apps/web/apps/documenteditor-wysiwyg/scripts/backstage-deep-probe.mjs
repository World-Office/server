/**
 * backstage-deep-probe.mjs — CHROME4-BACKSTAGE-DEEP live probe (Playwright, chromium).
 *
 * Serves the editor statically (http.server :18055) and exercises the real
 * backstage pane content in three boot contexts:
 *   (A) standalone serve, docserver REST stubbed:
 *       (a) Recent/Open pane is the default with 2 disabled rows (no /editors route)
 *       (b) Info pane meta grid renders 4 pairs (degraded fallback values)
 *       (c) Print pane CTA triggers the existing window.print path
 *       (d) REST failure degrades to the friendly empty row
 *   (B) docserver boot (history.replaceState to /editors/document/demo.docx
 *       + __DOC_ID__/__DOC_NAME__ before page scripts):
 *       (e) recent rows enabled; meta shows the real document name
 *       (f) typing mirrors into Info counters + statusbar
 *       (g) row click navigates to /editors/document/letter.docx
 *   (F) zero pageerrors across all contexts
 *
 * Prints "backstage-deep-probe: ALL GREEN" only when every check passes.
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const EDITOR_DIR = resolve(HERE, "..");
const PORT = 18055;
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

const DOCS = [
  { id: "demo.docx", name: "Quarterly report.docx", size: 48213, updated_at: 1760000000000, format: "docx" },
  { id: "letter.docx", name: "Letter to Anna.docx", size: 15334, updated_at: 1759000000000, format: "docx" },
];

// Stubs the docserver REST surface; everything else (boot fetches against
// /api/documents/unknown/...) passes through to the static server.
async function docStub() {
  const DOCS = [
    { id: "demo.docx", name: "Quarterly report.docx", size: 48213, updated_at: 1760000000000, format: "docx" },
    { id: "letter.docx", name: "Letter to Anna.docx", size: 15334, updated_at: 1759000000000, format: "docx" },
  ];
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : (input && input.url) || String(input);
    const clean = String(url).split("?")[0];
    if (clean === "/api/documents") {
      return Promise.resolve(new Response(JSON.stringify(DOCS), { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    const m = clean.match(/^\/api\/documents\/([^/]+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      const doc = DOCS.find((d) => d.id === id);
      const meta = doc
        ? { id: doc.id, name: doc.name, size: doc.size, updated_at: doc.updated_at, format: doc.format }
        : { id, name: id, size: 1024, updated_at: 1759000000000, format: "docx" };
      return Promise.resolve(new Response(JSON.stringify(meta), { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    return realFetch(input, init);
  };
}

// REST failure mode: every /api/documents answer is a 500 (!res.ok path).
async function docStubFail() {
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : (input && input.url) || String(input);
    if (String(url).split("?")[0].startsWith("/api/documents")) {
      return Promise.resolve(new Response("boom", { status: 500 }));
    }
    return realFetch(input, init);
  };
}

// Docserver boot context: editor constants before page scripts run. The
// /editors/document/<id> URL itself is applied AFTER load (replaceState in
// the init script would break the relative script URLs of the document).
async function docserverBoot() {
  window.__DOC_ID__ = "demo.docx";
  window.__DOC_NAME__ = "demo.docx";
}

async function openBackstage(page) {
  await page.evaluate(() => document.getElementById("btn-file").click());
  await sleep(400);
}

const failures = [];
const allPageErrors = [];
async function run(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`FAIL ${name}: ${err.message}`);
  }
}
function watchErrors(page, label) {
  page.on("pageerror", (err) => {
    allPageErrors.push(`${label}: ${String(err && err.stack ? err.stack.split("\n")[0] : err)}`);
  });
}

async function main() {
  const server = startServer(EDITOR_DIR, PORT);
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    if (!(await waitUp(PORT))) throw new Error("http.server did not come up on :" + PORT);

    // ---- Scenario A: standalone serve, REST stubbed -------------------
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addInitScript(docStub);
      const page = await ctx.newPage();
      watchErrors(page, "A");
      await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
      await sleep(2500);
      await openBackstage(page);

      await run("(a) standalone: Recent/Open is the default pane with 2 disabled rows", async () => {
        const st = await page.evaluate(() => {
          const ov = document.getElementById("backstage-overlay");
          const rows = [...ov.querySelectorAll("#backstage-recent .backstage-recent-row")];
          return {
            openActive: !!ov.querySelector('.backstage-row[data-pane="open"].active'),
            viewVisible: ov.querySelector('[data-pane-view="open"]').offsetParent !== null,
            names: rows.map((r) => r.querySelector(".bs-doc-name").textContent),
            allDisabled: rows.length > 0 && rows.every((r) => r.disabled),
            hasHint: rows.length > 0 && rows.every((r) => (r.title || "").length > 0),
            metaFilled: rows.every((r) => r.querySelector(".bs-doc-meta").textContent.length > 0),
          };
        });
        if (!st.openActive) throw new Error("open rail row not active by default");
        if (!st.viewVisible) throw new Error("open pane view not visible");
        const want = ["Quarterly report.docx", "Letter to Anna.docx"];
        if (JSON.stringify(st.names) !== JSON.stringify(want)) {
          throw new Error(`row names ${JSON.stringify(st.names)} != ${JSON.stringify(want)}`);
        }
        if (!st.allDisabled) throw new Error("standalone rows must be disabled (no /editors route)");
        if (!st.hasHint) throw new Error("disabled rows must carry a title hint");
        if (!st.metaFilled) throw new Error("row meta (date · size) empty");
      });

      await run("(b) standalone: Info meta grid renders 4 degraded pairs", async () => {
        await page.evaluate(() => document.querySelector('.backstage-row[data-pane="info"]').click());
        await sleep(300);
        const st = await page.evaluate(() => {
          const grid = document.getElementById("backstage-info-meta");
          const cells = [...grid.querySelectorAll(".bs-meta-value")];
          return {
            pairs: grid.querySelectorAll(".bs-meta-label").length,
            values: cells.map((c) => c.textContent),
            visible: grid.offsetParent !== null,
          };
        });
        if (!st.visible) throw new Error("info meta grid not visible");
        if (st.pairs !== 4) throw new Error(`meta grid has ${st.pairs} pairs, want 4`);
        const fmt = st.values[1];
        if (fmt !== "docx") throw new Error(`format cell "${fmt}" != docx`);
        if (!st.values[2] || st.values[2] === "—") throw new Error("size cell empty");
        if (!st.values[3] || st.values[3] === "—") throw new Error("updated cell empty");
      });

      await run("(c) standalone: Print pane CTA triggers window.print", async () => {
        await page.evaluate(() => {
          window.__printCalls = 0;
          window.print = () => { window.__printCalls += 1; };
        });
        await page.evaluate(() => document.querySelector('.backstage-row[data-pane="print"]').click());
        await sleep(200);
        await page.evaluate(() => document.getElementById("btn-print").click());
        await sleep(200);
        const calls = await page.evaluate(() => window.__printCalls);
        if (calls !== 1) throw new Error(`window.print called ${calls} times, want 1`);
      });
      await ctx.close();
    }

    // ---- Scenario A(d): REST failure degrades to the empty row --------
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addInitScript(docStubFail);
      const page = await ctx.newPage();
      watchErrors(page, "A(d)");
      await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
      await sleep(2500);
      await openBackstage(page);
      await run("(d) REST failure degrades to the friendly empty row", async () => {
        const st = await page.evaluate(() => {
          const host = document.getElementById("backstage-recent");
          return {
            empty: !!host.querySelector(".backstage-recent-empty"),
            rows: host.querySelectorAll(".backstage-recent-row").length,
          };
        });
        if (!st.empty) throw new Error(".backstage-recent-empty missing after REST failure");
        if (st.rows !== 0) throw new Error(`${st.rows} rows rendered despite REST failure`);
      });
      await ctx.close();
    }

    // ---- Scenario B: docserver boot context ---------------------------
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addInitScript(docserverBoot);
      await ctx.addInitScript(docStub);
      const page = await ctx.newPage();
      watchErrors(page, "B");
      await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
      await sleep(2500);
      await page.evaluate(() => history.replaceState(null, "", "/editors/document/demo.docx"));
      const path = await page.evaluate(() => window.location.pathname);
      if (path !== "/editors/document/demo.docx") {
        throw new Error(`docserver boot failed, pathname "${path}"`);
      }
      await openBackstage(page);

      await run("(e) docserver: recent rows enabled, meta shows the real name", async () => {
        const st = await page.evaluate(() => {
          const rows = [...document.querySelectorAll("#backstage-recent .backstage-recent-row")];
          return {
            names: rows.map((r) => r.querySelector(".bs-doc-name").textContent),
            anyDisabled: rows.some((r) => r.disabled),
          };
        });
        if (st.names.length !== 2) throw new Error(`expected 2 rows, got ${st.names.length}`);
        if (st.anyDisabled) throw new Error("docserver context rows must be enabled");
        await page.evaluate(() => document.querySelector('.backstage-row[data-pane="info"]').click());
        await sleep(300);
        const name = await page.evaluate(
          () => document.querySelector("#backstage-info-meta .bs-meta-value").textContent,
        );
        if (name !== "Quarterly report.docx") throw new Error(`meta name "${name}" != Quarterly report.docx`);
      });

      await run("(f) docserver: typing mirrors into Info counters + statusbar", async () => {
        await page.evaluate(() => {
          document.getElementById("editor").innerHTML = "<p><br></p>";
          document.getElementById("editor").focus();
        });
        await page.keyboard.type("hello world foo", { delay: 20 });
        await sleep(300);
        const st = await page.evaluate(() => ({
          bsWords: document.getElementById("bs-info-words").textContent,
          bsChars: document.getElementById("bs-info-chars").textContent,
          sb: document.getElementById("sb-word-count").textContent,
        }));
        if (st.bsWords !== "3") throw new Error(`bs-info-words "${st.bsWords}" != 3`);
        if (st.bsChars !== "15") throw new Error(`bs-info-chars "${st.bsChars}" != 15`);
        if (!st.sb.includes("Words: 3")) throw new Error(`statusbar "${st.sb}" missing "Words: 3"`);
      });

      await run("(g) docserver: row click navigates to /editors/document/letter.docx", async () => {
        await page.evaluate(() => document.querySelector('.backstage-row[data-pane="open"]').click());
        await sleep(200);
        const rows = page.locator("#backstage-recent .backstage-recent-row");
        await rows.filter({ hasText: "Letter to Anna.docx" }).first().click();
        await page.waitForURL("**/editors/document/letter.docx", { timeout: 5000 }).catch(() => {});
        const url = page.url();
        if (!url.endsWith("/editors/document/letter.docx")) {
          throw new Error(`navigation landed on "${url}"`);
        }
      });
      await ctx.close();
    }

    // ---- Final: zero pageerrors everywhere ----------------------------
    await run("(h) zero pageerrors across all contexts", async () => {
      if (allPageErrors.length > 0) {
        throw new Error(`${allPageErrors.length} pageerror(s): ${allPageErrors[0]}`);
      }
    });
  } catch (err) {
    failures.push("probe boot");
    console.log(`FAIL probe boot: ${err.message}`);
  } finally {
    await browser.close().catch(() => {});
    server.kill();
  }

  if (failures.length > 0) {
    console.log(`backstage-deep-probe: ${failures.length} check(s) FAILED`);
    process.exit(1);
  }
  console.log("backstage-deep-probe: ALL GREEN");
}

main();

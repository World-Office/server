/**
 * Shift+Enter behavior gate (BHV-001 chain pins + live browser behavior).
 *
 * Expected: Shift+Enter inserts a line break (<br>) INSIDE the same
 * paragraph, and every line lands on a .wo-page sheet — never in the gray
 * editor backdrop (gray-void bug class).
 *
 * Two layers:
 *   1. static chain pins over editor.js (zero deps, deterministic — the
 *      sibling *.test.mjs gate convention, kept from BHV-001);
 *   2. live behavior against a real editor at WO_EDITOR_URL via the
 *      playwright LIBRARY — verifies the actual DOM: same-paragraph <br>,
 *      select-all+type root-text wrapping, overflow reflow onto further
 *      sheets.
 *
 * ES module on purpose (the sibling gate convention): this suite is run by
 * Node's built-in runner, which loads .mjs as ESM — a CommonJS `require`
 * is a hard ReferenceError there. `playwright` is therefore pulled in with
 * a dynamic `import()`, and the live layer is SKIPPED (never failed) when
 * the library or the editor server is unavailable, so the static pins stay
 * the deterministic part of the gate.
 *
 * Acceptance gate (verbatim):
 *   node --test apps/web/apps/documenteditor-wysiwyg/shift-enter-behavior.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const PAGE_URL = process.env.WO_EDITOR_URL || "http://192.168.42.42:8082/word/";
const REFLOW_SETTLE = 800; // editor's scheduleReflow debounce is 600ms

// ── 1. Static chain pins: the source keeps the whole Shift+Enter chain ──
test("static chain pins: native line break + mutation reflow + split + wrap", () => {
  const src = readFileSync(join(here, "editor.js"), "utf8");

  // Plain Shift+Enter stays native: the browser's insertLineBreak puts the
  // <br> in the same block — nothing hijacks or replaces it.
  assert.equal(src.includes("insertLineBreak"), false, "editor.js must not hijack the native line break");

  // The ONLY Enter bindings in the editor keydown are the Ctrl variants
  // (Ctrl+Enter = page break, Ctrl+Shift+Enter = column break).
  const kdStart = src.indexOf('editor.addEventListener("keydown"');
  const kdEnd = src.indexOf("function autoConvertListMarker", kdStart);
  assert.ok(kdStart >= 0, "editor keydown listener must exist");
  assert.ok(kdEnd > kdStart, "autoConvertListMarker must follow the keydown listener");
  const keydownBody = src.slice(kdStart, kdEnd);
  assert.ok((keydownBody.match(/"[eE]nter"/g) || []).length > 0, "keydown handles the Ctrl+Enter variants");
  assert.equal(keydownBody.includes('ev.key === "Enter"'), false, "plain Enter must not be intercepted");
  assert.ok(
    keydownBody.includes('k === "enter") { ev.preventDefault(); emitCommand("insertColumnBreak")'),
    "Ctrl+Shift+Enter emits insertColumnBreak"
  );

  // Mutations drive the repagination that re-snaps blocks onto sheets.
  const obsStart = src.indexOf("new MutationObserver");
  assert.ok(obsStart >= 0, "editor.js installs a MutationObserver");
  assert.ok(src.slice(obsStart, obsStart + 400).includes("scheduleReflow()"), "mutations schedule a reflow");
  assert.ok(/function scheduleReflow[\s\S]{0,500}paginateQuiet\(\)/.test(src), "scheduleReflow runs paginateQuiet");
  assert.ok(/function paginateQuiet[\s\S]{0,200}paginateView\(\)/.test(src), "paginateQuiet runs paginateView");

  // Overflow splits at LINE boundaries; the tail continues as .wo-cont.
  const splitLines = src.slice(src.indexOf("function trySplitLines"), src.indexOf("function paginateView"));
  assert.ok(splitLines.length > 10, "trySplitLines body must be present");
  assert.ok(splitLines.includes("getClientRects()"), "line geometry comes from range client rects");
  assert.ok(/orphan control/.test(splitLines) && /widow control/.test(splitLines), "orphan/widow control stays in the splitter");
  assert.ok(splitLines.includes('classList.add("wo-cont")'), "split tails continue as .wo-cont");

  // A wiped/empty document still renders ONE page sheet (gray-void guard).
  assert.ok(
    /blocks\.length === 0\) \{\s*\n\s*openPage\(\);\s*\n\s*return;/.test(src),
    "paginateView emits one empty .wo-page for a wiped document"
  );

  // Bare root text (select-all + type) is wrapped into a <p> so pagination
  // never strands it in the gray backdrop next to an empty sheet.
  const pgBody = src.slice(src.indexOf("function paginateView"), src.indexOf("function writePageSetupMarker"));
  assert.ok(pgBody.includes("n.nodeType === 3 && n.nodeValue.trim()"), "paginateView wraps bare root text nodes");

  // Serialization folds view splits back: ONE paragraph with its <br>.
  const flatBody = src.slice(src.indexOf("function flatHtml()"), src.indexOf("function stripMisspellMarkers(root)"));
  assert.ok(flatBody.includes("mergeSplits(tmp)"), "flatHtml merges view splits back into one paragraph");
});

// ── 2. Live behavior against the real editor ────────────────────────────
// Probe the environment once: the live layer is real coverage when the
// editor + playwright are present, and a skip (not a failure) otherwise.
async function liveBlockerReason() {
  try {
    await import("playwright");
  } catch (e) {
    return `playwright unresolvable (${e.code || e.name || "ERR"})`;
  }
  try {
    const res = await fetch(PAGE_URL, { redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return `editor at ${PAGE_URL} answered HTTP ${res.status}`;
  } catch (e) {
    return `editor at ${PAGE_URL} unreachable (${e.cause?.code || e.cause?.message || e.name})`;
  }
  return "";
}

const liveBlocker = await liveBlockerReason();
if (liveBlocker) console.log(`# live layer skipped: ${liveBlocker}`);

async function withEditor(t, fn) {
  if (liveBlocker) return t.skip(`live layer skipped: ${liveBlocker}`);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await page.locator("#editor").click();
    // start from a clean document: replace the demo content (this also
    // exercises the bare-root-text path — Chrome leaves typed replacement
    // text directly in #editor until pagination wraps it)
    await page.keyboard.press("Control+a");
    await page.keyboard.type("Seed paragraph");
    await fn(page);
  } finally {
    await browser.close();
  }
}

// Text content of body EXCLUDING the #editor subtree (the gray backdrop is
// everything around the page sheets).
function textOutsideEditor(page) {
  return page.evaluate(() => {
    const ed = document.querySelector("#editor");
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        for (let p = n.parentElement; p; p = p.parentElement)
          if (p === ed) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let out = "";
    while (walker.nextNode()) out += walker.currentNode.nodeValue;
    return out;
  });
}

test("Shift+Enter inserts a line break within the paragraph, text stays on the page", async (t) => {
  await withEditor(t, async (page) => {
    await page.keyboard.type("Sentinel one qx7");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("Sentinel two qx7");
    await page.waitForTimeout(REFLOW_SETTLE);

    const state = await page.evaluate(() => {
      const ed = document.querySelector("#editor");
      // innermost block element holding the first typed line (document
      // order: outer -> inner, so the LAST match is the paragraph itself)
      const hosts = [...ed.querySelectorAll("p, div, h1, h2, h3")].filter((el) =>
        el.textContent.includes("Sentinel one qx7")
      );
      return {
        hosts: hosts.length,
        html: hosts.length ? hosts[hosts.length - 1].innerHTML : null,
        bareRootText: [...ed.childNodes].some(
          (n) => n.nodeType === 3 && /Sentinel (one|two) qx7/.test(n.nodeValue)
        ),
        editorText: ed.textContent,
        onSheet: hosts.length
          ? !!hosts[hosts.length - 1].closest(".wo-page")
          : false,
      };
    });

    assert.ok(state.hosts > 0, "a block element must hold the typed line");
    // both lines share ONE paragraph, separated by a soft line break <br>
    assert.ok(state.html.includes("<br"), "the paragraph keeps its soft line break");
    assert.ok(state.html.includes("Sentinel one qx7"), "line one stays in the paragraph");
    assert.ok(state.html.includes("Sentinel two qx7"), "line two stays in the same paragraph");
    // the paragraph lives on a page sheet, not the gray backdrop
    assert.equal(state.onSheet, true, "the paragraph lives on a .wo-page sheet");
    assert.equal(state.bareRootText, false, "no bare root text next to the sheets");
    // nothing typed leaked outside the editor
    assert.ok(state.editorText.includes("Sentinel one qx7"), "line one is in the editor");
    assert.ok(state.editorText.includes("Sentinel two qx7"), "line two is in the editor");
    const outside = await textOutsideEditor(page);
    assert.ok(!outside.includes("Sentinel one qx7"), "line one must not leak outside #editor");
    assert.ok(!outside.includes("Sentinel two qx7"), "line two must not leak outside #editor");
  });
});

test("Shift+Enter on a filled page keeps text inside a page sheet (no gray area)", async (t) => {
  await withEditor(t, async (page) => {
    for (let i = 0; i < 60; i++) {
      await page.keyboard.type(`Line ${i} of the first page\n`);
    }
    await page.keyboard.press("End");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("New text after Shift+Enter");
    await page.waitForTimeout(REFLOW_SETTLE);

    const state = await page.evaluate(() => {
      const ed = document.querySelector("#editor");
      const sheets = [...ed.querySelectorAll(":scope > .wo-page")];
      const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          return n.nodeValue.includes("New text after Shift+Enter")
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      });
      const found = walker.nextNode();
      if (!found) return { found: false, sheets: sheets.length };
      const host = walker.currentNode.parentElement;
      const sheet = host.closest(".wo-page");
      if (!sheet) return { found: true, inSheet: false, sheets: sheets.length };
      const r = host.getBoundingClientRect();
      const s = sheet.getBoundingClientRect();
      return {
        found: true,
        inSheet: true,
        sheets: sheets.length,
        inside:
          r.bottom <= s.bottom + 1 && r.top >= s.top - 1 && r.left >= s.left - 1,
      };
    });

    assert.equal(state.found, true, "the text typed after Shift+Enter must exist");
    assert.ok(state.sheets >= 2, "overflow reflowed onto further sheets");
    assert.equal(state.inSheet, true, "never stranded in the gray backdrop");
    assert.equal(state.inside, true, "the text sits within its sheet bounds");
  });
});

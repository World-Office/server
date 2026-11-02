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
 *      playwright LIBRARY (tests/node_modules) — verifies the actual DOM:
 *      same-paragraph <br>, select-all+type root-text wrapping, overflow
 *      reflow onto further sheets.
 *
 * jest + CommonJS on purpose: Node 22's jest cannot require ESM .mjs (see
 * root jest.config.cjs). Acceptance gate (verbatim):
 *   npx jest apps/web/apps/documenteditor-wysiwyg/shift-enter-behavior.test.mjs --testTimeout=30000
 */

const { readFileSync } = require("node:fs");
const { join, dirname } = require("node:path");

const PAGE_URL = process.env.WO_EDITOR_URL || "http://192.168.42.42:8082/word/";
const REFLOW_SETTLE = 800; // editor's scheduleReflow debounce is 600ms

// ── 1. Static chain pins: the source keeps the whole Shift+Enter chain ──
test("static chain pins: native line break + mutation reflow + split + wrap", () => {
  const src = readFileSync(join(__dirname, "editor.js"), "utf8");

  // Plain Shift+Enter stays native: the browser's insertLineBreak puts the
  // <br> in the same block — nothing hijacks or replaces it.
  expect(src.includes("insertLineBreak")).toBe(false);

  // The ONLY Enter bindings in the editor keydown are the Ctrl variants
  // (Ctrl+Enter = page break, Ctrl+Shift+Enter = column break).
  const kdStart = src.indexOf('editor.addEventListener("keydown"');
  const kdEnd = src.indexOf("function autoConvertListMarker", kdStart);
  expect(kdStart).toBeGreaterThanOrEqual(0);
  expect(kdEnd).toBeGreaterThan(kdStart);
  const keydownBody = src.slice(kdStart, kdEnd);
  expect((keydownBody.match(/"[eE]nter"/g) || []).length).toBeGreaterThan(0);
  expect(keydownBody.includes('ev.key === "Enter"')).toBe(false);
  expect(
    keydownBody.includes('k === "enter") { ev.preventDefault(); emitCommand("insertColumnBreak")')
  ).toBe(true);

  // Mutations drive the repagination that re-snaps blocks onto sheets.
  const obsStart = src.indexOf("new MutationObserver");
  expect(obsStart).toBeGreaterThanOrEqual(0);
  expect(src.slice(obsStart, obsStart + 400).includes("scheduleReflow()")).toBe(true);
  expect(/function scheduleReflow[\s\S]{0,500}paginateQuiet\(\)/.test(src)).toBe(true);
  expect(/function paginateQuiet[\s\S]{0,200}paginateView\(\)/.test(src)).toBe(true);

  // Overflow splits at LINE boundaries; the tail continues as .wo-cont.
  const splitLines = src.slice(
    src.indexOf("function trySplitLines"),
    src.indexOf("function paginateView")
  );
  expect(splitLines.length).toBeGreaterThan(10);
  expect(splitLines.includes("getClientRects()")).toBe(true);
  expect(/orphan control/.test(splitLines) && /widow control/.test(splitLines)).toBe(true);
  expect(splitLines.includes('classList.add("wo-cont")')).toBe(true);

  // A wiped/empty document still renders ONE page sheet (gray-void guard).
  expect(/blocks\.length === 0\) \{\s*\n\s*openPage\(\);\s*\n\s*return;/.test(src)).toBe(true);

  // Bare root text (select-all + type) is wrapped into a <p> so pagination
  // never strands it in the gray backdrop next to an empty sheet.
  const pgBody = src.slice(src.indexOf("function paginateView"), src.indexOf("function writePageSetupMarker"));
  expect(pgBody.includes("n.nodeType === 3 && n.nodeValue.trim()")).toBe(true);

  // Serialization folds view splits back: ONE paragraph with its <br>.
  const flatBody = src.slice(
    src.indexOf("function flatHtml()"),
    src.indexOf("function stripMisspellMarkers(root)")
  );
  expect(flatBody.includes("mergeSplits(tmp)")).toBe(true);
});

// ── 2. Live behavior against the real editor ────────────────────────────
async function withEditor(fn) {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (e) {
    throw new Error(
      "playwright not resolvable (expected from tests/node_modules via jest modulePaths): " + e.message
    );
  }
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

test("Shift+Enter inserts a line break within the paragraph, text stays on the page", async () => {
  await withEditor(async (page) => {
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

    expect(state.hosts).toBeGreaterThan(0);
    // both lines share ONE paragraph, separated by a soft line break <br>
    expect(state.html).toContain("<br");
    expect(state.html).toContain("Sentinel one qx7");
    expect(state.html).toContain("Sentinel two qx7");
    // the paragraph lives on a page sheet, not the gray backdrop
    expect(state.onSheet).toBe(true);
    expect(state.bareRootText).toBe(false);
    // nothing typed leaked outside the editor
    expect(state.editorText).toContain("Sentinel one qx7");
    expect(state.editorText).toContain("Sentinel two qx7");
    const outside = await textOutsideEditor(page);
    expect(outside).not.toContain("Sentinel one qx7");
    expect(outside).not.toContain("Sentinel two qx7");
  });
});

test("Shift+Enter on a filled page keeps text inside a page sheet (no gray area)", async () => {
  await withEditor(async (page) => {
    for (let i = 0; i < 60; i++) {
      await page.keyboard.type("Line " + i + " of the first page\n");
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

    expect(state.found).toBe(true);
    expect(state.sheets).toBeGreaterThanOrEqual(2); // overflow reflowed onto further sheets
    expect(state.inSheet).toBe(true); // never stranded in the gray backdrop
    expect(state.inside).toBe(true); // within its sheet bounds
  });
});

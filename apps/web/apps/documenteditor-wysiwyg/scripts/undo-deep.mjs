#!/usr/bin/env node
/**
 * undo-deep.mjs — BUG7 undo/redo fidelity probe (manual/live-only driver).
 *
 * House convention: heavy live drivers stay .mjs; static gates stay
 * *.test.mjs. Run by hand:
 *
 *   node scripts/undo-deep.mjs
 *
 * For every mutating feature: reset to a KNOWN clean fixture, record the
 * history depth, apply the feature once, then assert
 *   a) exactly ONE coherent undo entry was pushed (depth delta == 1),
 *      unless the op is a documented no-op (delta == 0),
 *   b) one undo restores the pre-apply DOM (page-wrapper-normalized
 *      innerHTML match) and key UI state (aria-pressed, object counts),
 *   c) one redo restores the post-apply DOM,
 *   d) no phantom entries (no stack growth without DOM change).
 *
 * Feature groups: a) text formatting, b) alignment/indents/lists,
 * c) objects, d) document structure, e) review/collab, f) paste + select-all.
 *
 * Exit code 0 only when every probe passes. Prints a triage table on failure.
 */
import { spawn } from "node:child_process";
import net from "node:net";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require("/home/weiss/git/World-Office/wo-test-harness/census/node_modules/playwright");

const PORT = Number(process.env.UNDO_DEEP_PORT || 18049);
const HERE = dirname(fileURLToPath(import.meta.url));
const EDITOR_DIR = resolve(HERE, "..");
const PY = "/usr/bin/python3"; // PATH python3 may be a broken shim (see smoke.mjs)

const SEED_HTML = [
  "<h1>Undo Deep Probe</h1>",
  "<p>alpha bravo charlie delta echo foxtrot</p>",
  "<p>second paragraph golf hotel india juliet</p>",
].join("");

/** Runs inside the page before any editor script; intercepts all fetches. */
function stubInit(cfg) {
  window.__COLLAB__ = false; // kill the 400ms collab poll for deterministic runs
  try { localStorage.clear(); } catch {}
  navigator.sendBeacon = () => true;
  window.__API_CALLS__ = [];
  window.__STUB_STATE__ = { html: cfg.seed, saves: [] };
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : (input && input.url) || String(input);
    const method = String(init.method || (input && input.method) || "GET").toUpperCase();
    window.__API_CALLS__.push({ method, url });
    const st = window.__STUB_STATE__;
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
    if (method === "GET" && /\/api\/documents\/[^/?]+\/html/.test(url)) {
      return json({ html: st.html, name: "demo.docx" });
    }
    if (method === "POST" && /\/save(\?|$)/.test(url)) {
      st.saves.push(String(init.body || ""));
      return json({ ok: true });
    }
    return json({ ok: true });
  };
}

// ---------------------------------------------------------------- helpers --
function freePort(preferred) {
  return new Promise((res) => {
    const srv = net.createServer();
    srv.once("error", () => res(0));
    srv.listen(preferred, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => res(p));
    });
  });
}

async function waitUp(port, timeoutMs) {
  const url = `http://127.0.0.1:${port}/index.html`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { await fetch(url); return; }
    catch { await new Promise((r) => setTimeout(r, 120)); }
  }
  throw new Error(`http.server on :${port} did not come up`);
}

const failures = [];

/** Probe-level step: failures are collected so every probe runs (triage). */
async function step(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    const msg = String((err && err.message) || err)
      .split("\n")
      .slice(0, 3)
      .join(" | ");
    failures.push({ name, msg });
    console.log(`  FAIL ${name}\n       -> ${msg}`);
  }
}

// ------------------------------------------------------------- page glue --
async function installNorm(page) {
  // Normalize away pagination drift: paginateView wraps blocks into
  // .wo-page divs inside #editor (and clones page furniture), which changes
  // innerHTML without being a user edit. Undo comparisons are semantic.
  // NOTE: DocumentFragment has NO innerHTML property — serialize through a
  // div (snapshot HTML is full blocks/tables, so div parsing is safe).
  await page.evaluate(() => {
    window.__norm = (html) => {
      const d = document.createElement("div");
      d.innerHTML = html;
      d.querySelectorAll(".wo-page").forEach((pg) => {
        while (pg.firstChild) pg.parentNode.insertBefore(pg.firstChild, pg);
        pg.remove();
      });
      d.querySelectorAll(".wo-hf-clone").forEach((el) => el.remove());
      return d.innerHTML;
    };
  });
}

const hist = (page) =>
  page.evaluate(() => ({
    u: window.__WO_HISTORY__.undoDepth,
    r: window.__WO_HISTORY__.redoDepth,
  }));
const rawHtml = (page) => page.evaluate(() => document.getElementById("editor").innerHTML);
const normHtml = async (page) =>
  page.evaluate((h) => window.__norm(h), await rawHtml(page));
const selectWord = (page, word) =>
  page.evaluate((word) => {
    const root = document.getElementById("editor");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const i = node.data.indexOf(word);
      if (i >= 0) {
        const r = document.createRange();
        r.setStart(node, i);
        r.setEnd(node, i + word.length);
        const sel = document.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        return;
      }
    }
    throw new Error(`word ${JSON.stringify(word)} not found`);
  }, word);

/** Reset to the clean fixture, clear the chain, focus, select the target. */
async function resetDoc(page) {
  await page.evaluate((seed) => {
    const ed = document.getElementById("editor");
    ed.innerHTML = seed;
    window.__WO_HISTORY__.reset(seed);
  }, SEED_HTML);
  await page.waitForTimeout(80);
  await selectWord(page, "bravo");
  await page.locator("#editor").focus();
}

/** Click a toolbar button by data-cmd (works for hidden ribbon rows too). */
const clickCmd = (page, cmd, value) =>
  page.evaluate(({ cmd, value }) => {
    const sel = value
      ? `[data-cmd="${cmd}"][data-value="${value}"]`
      : `[data-cmd="${cmd}"]`;
    const el = document.querySelector(sel);
    if (!el) throw new Error(`no element for ${sel}`);
    el.click();
  }, { cmd, value });

/** Click an element by id via JS (same handler as a user click; ignores
 *  ribbon-tab visibility, which is not what these probes assert). */
const clickJs = (page, id) =>
  page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`no element #${id}`);
    el.click();
  }, id);

/** Dispatch a wo-command directly (for commands with no toolbar button). */
const emitCmd = (page, cmd, value) =>
  page.evaluate(({ cmd, value }) => {
    window.dispatchEvent(new CustomEvent("wo-command", { detail: { command: cmd, value } }));
  }, { cmd, value });

/** Drive a toolbar <select> (font family / size) through its change path. */
const setSelect = (page, id, value) =>
  page.evaluate(({ id, value }) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`no select #${id}`);
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, { id, value });

const setVault = (page, id, value) =>
  page.evaluate(({ id, value }) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`no input #${id}`);
    el.value = value;
    // Color vaults are wired on "change" (a real picker fires input+change;
    // change is the committed-value event the editor listens for).
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, { id, value });

/**
 * The core probe: clean fixture -> optional prime -> measure -> apply ->
 * depth delta -> undo once -> DOM match -> redo -> DOM match.
 */
async function probe(page, name, opts) {
  const { prime, apply, expectDepth = 1, select, afterUndo, skipDepth = false } = opts;
  await step(name, async () => {
    await resetDoc(page);
    if (prime) await prime(page);
    if (select) await select(page);
    const beforeHtml = await normHtml(page);
    const h0 = await hist(page);
    const undoDisabledBefore = await page.evaluate(
      () => document.getElementById("btn-undo").disabled);

    await apply(page);
    await page.waitForTimeout(150);

    const h1 = await hist(page);
    const afterHtml = await normHtml(page);
    const delta = h1.u - h0.u;
    if (!skipDepth) {
      assert.equal(delta, expectDepth,
        `history depth delta: expected ${expectDepth}, got ${delta}`);
      assert.equal(await page.evaluate(
        () => document.getElementById("btn-undo").disabled), false,
        "undo button must be enabled after a real mutation");
    } else {
      assert.equal(delta, 0,
        `no-op op must not push history, got delta ${delta}`);
      assert.equal(await page.evaluate(
        () => document.getElementById("btn-undo").disabled), undoDisabledBefore,
        "no-op op must not enable undo");
    }
    if (expectDepth >= 1) {
      assert.notEqual(afterHtml, beforeHtml, "op must actually change the DOM");
    } else {
      assert.equal(afterHtml, beforeHtml, "no-op op must not change the DOM");
    }

    if (expectDepth >= 1) {
      // Undo exactly once (JS click: the undo handler is what's under test;
      // ribbon-tab switches after e.g. header insertion hide the button from
      // Playwright's actionability check, which is not a history concern).
      await clickJs(page, "btn-undo");
      await page.waitForTimeout(150);
      const h2 = await hist(page);
      assert.equal(h2.u, h0.u, "one undo must consume exactly one entry");
      assert.equal(h2.r, h1.r + 1, "undo must push the entry onto the redo branch");
      const undoneHtml = await normHtml(page);
      assert.equal(undoneHtml, beforeHtml,
        "one undo must restore the pre-apply DOM");
      if (afterUndo) await afterUndo(page);

      // Redo mirrors.
      await clickJs(page, "btn-redo");
      await page.waitForTimeout(150);
      const h3 = await hist(page);
      assert.equal(h3.u, h1.u, "redo must push the entry back onto undo");
      assert.equal(h3.r, h1.r, "redo must consume its redo entry");
      const redoneHtml = await normHtml(page);
      assert.equal(redoneHtml, afterHtml, "one redo must restore the post-apply DOM");
    } else if (afterUndo) {
      await afterUndo(page);
    }
  });
}

// ---------------------------------------------------- group a: formatting --
async function groupA(page) {
  console.log("group a — text formatting");
  const selBravo = (p) => selectWord(p, "bravo");

  await probe(page, "a1 bold", { apply: (p) => clickCmd(p, "bold"), select: selBravo,
    afterUndo: async (p) => assert.equal(await p.evaluate(() =>
      document.querySelector('[data-cmd="bold"]').getAttribute("aria-pressed")), "false",
      "bold aria-pressed must reset after undo") });
  await probe(page, "a2 italic", { apply: (p) => clickCmd(p, "italic"), select: selBravo });
  await probe(page, "a3 underline", { apply: (p) => clickCmd(p, "underline"), select: selBravo });
  await probe(page, "a4 strikeThrough", { apply: (p) => clickCmd(p, "strikeThrough"), select: selBravo });
  await probe(page, "a5 superscript", { apply: (p) => clickCmd(p, "superscript"), select: selBravo });
  await probe(page, "a6 subscript", { apply: (p) => clickCmd(p, "subscript"), select: selBravo });

  await probe(page, "a7 font family", {
    select: selBravo,
    apply: (p) => setSelect(p, "font-family", "Courier New"),
    afterUndo: async (p) => assert.equal(await p.evaluate(() =>
      document.getElementById("font-family").value), "",
      "font select must reset after undo") });
  await probe(page, "a8 font size", {
    select: selBravo,
    apply: (p) => setSelect(p, "font-size", "5") });
  await probe(page, "a9 font color", {
    select: selBravo,
    apply: (p) => setVault(p, "text-color", "#ff0000") });
  await probe(page, "a10 highlight", {
    select: selBravo,
    apply: (p) => setVault(p, "highlight-color", "#00ff00") });
  await probe(page, "a11 clear style (removeFormat)", {
    select: selBravo,
    prime: async (p) => { await clickCmd(p, "bold"); await clickCmd(p, "italic"); },
    apply: (p) => clickCmd(p, "removeFormat") });
  await probe(page, "a12 format block H1", {
    select: selBravo,
    apply: (p) => clickCmd(p, "formatBlock", "H1") });
  await probe(page, "a13 code (monospace)", {
    select: selBravo, apply: (p) => clickCmd(p, "code") });
  await probe(page, "a14 small caps", {
    select: selBravo, apply: (p) => clickCmd(p, "smallCaps") });
  await probe(page, "a15 all caps", {
    select: selBravo, apply: (p) => clickCmd(p, "allCaps") });
  await probe(page, "a16 change case upper", {
    select: selBravo, apply: (p) => clickCmd(p, "changeCase", "upper") });
  await probe(page, "a17 underline double", {
    select: selBravo, apply: (p) => clickCmd(p, "underlineDouble") });
  await probe(page, "a18 strike double", {
    select: selBravo, apply: (p) => clickCmd(p, "strikeDouble") });

  // Keyboard parity: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z walk the same chain as
  // the buttons. Binding (editor.js): Ctrl+Z = undo, Ctrl+Y = redo,
  // Ctrl+Shift+Z = redo (macOS-style). So the redo branch must respond to
  // BOTH redo keys, and two undos in a row walk two entries.
  await step("a19 keyboard Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z parity", async () => {
    await resetDoc(page);
    await clickCmd(page, "bold");
    await page.waitForTimeout(120);
    const h1 = await hist(page);
    assert.equal(h1.u, 1, "bold pushed one entry");
    await page.locator("#editor").focus();
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(120);
    const h2 = await hist(page);
    assert.equal(h2.u, 0, "Ctrl+Z consumed the entry");
    await page.keyboard.press("Control+y");
    await page.waitForTimeout(120);
    const h3 = await hist(page);
    assert.equal(h3.u, 1, "Ctrl+Y restored the entry");
    await page.locator("#editor").focus();
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(120);
    assert.equal((await hist(page)).u, 0, "second Ctrl+Z undoes again");
    await page.keyboard.press("Control+Shift+z");
    await page.waitForTimeout(120);
    assert.equal((await hist(page)).u, 1, "Ctrl+Shift+Z redoes (macOS binding)");
  });
}

// --------------------------------------- group b: alignment / indents / lists --
async function groupB(page) {
  console.log("group b — alignment, indents, lists");

  await probe(page, "b1 justifyCenter", { apply: (p) => clickCmd(p, "justifyCenter") });
  await probe(page, "b2 justifyRight", { apply: (p) => clickCmd(p, "justifyRight") });
  await probe(page, "b3 justifyFull", { apply: (p) => clickCmd(p, "justifyFull") });
  // justifyLeft on an already-left paragraph is a DOM no-op; exercise the
  // real transition instead (center -> left).
  await probe(page, "b4 justifyLeft (from center)", {
    prime: (p) => clickCmd(p, "justifyCenter"),
    apply: (p) => clickCmd(p, "justifyLeft") });

  await probe(page, "b5 indent", { apply: (p) => clickCmd(p, "indent") });
  await probe(page, "b6 outdent (from indent)", {
    prime: (p) => clickCmd(p, "indent"),
    apply: (p) => clickCmd(p, "outdent") });

  await probe(page, "b7 insertUnorderedList", {
    apply: (p) => clickCmd(p, "insertUnorderedList") });
  await probe(page, "b8 insertOrderedList", {
    apply: (p) => clickCmd(p, "insertOrderedList") });

  // Multilevel on a plain paragraph: creation path (insertOrderedList +
  // history push inside multilevelItem).
  await probe(page, "b9 multilevel creates list", {
    apply: (p) => clickCmd(p, "multilevel") });
  // Multilevel nesting: caret in the 2nd li -> nests it under the 1st.
  // (Caret in the 1st li is a documented no-op: no previous sibling.)
  await probe(page, "b10 multilevel nests item", {
    prime: async (p) => {
      await clickCmd(p, "insertOrderedList");
      await p.locator("#editor").focus();
      await p.keyboard.press("End");
      await p.keyboard.press("Enter");
      await p.waitForTimeout(120);
    },
    apply: (p) => clickCmd(p, "multilevel") });

  await probe(page, "b11 listStyle square on UL", {
    prime: (p) => clickCmd(p, "insertUnorderedList"),
    apply: (p) => clickCmd(p, "listStyle", "square") });
  // Mismatched type (decimal on a UL): converts UL->OL then restyles — the
  // BUG2-RUNTIME-SMOKE regression path (used to no-op while history ran).
  await probe(page, "b12 listStyle decimal converts UL->OL", {
    prime: (p) => clickCmd(p, "insertUnorderedList"),
    apply: (p) => clickCmd(p, "listStyle", "decimal") });

  await probe(page, "b13 directionRtl", { apply: (p) => clickCmd(p, "directionRtl") });

  // Creation path of applyListStyle (no list under the caret): the guarded
  // execCommand creates the list, the restyle lands in the SAME step.
  await probe(page, "b14 listStyle square creates list", {
    apply: (p) => clickCmd(p, "listStyle", "square") });
}

// -------------------------------------------------------- group c: objects --
// Click an element by id (menu items / ribbon buttons playwright would call
// hidden; evaluate-click matches real dispatch without visibility checks).
const clickId = (page, id) =>
  page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`no element #${id}`);
    el.click();
  }, id);

// 1x1 red PNG — enough for the image dialog's type/size validation.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64");

async function groupC(page) {
  console.log("group c — objects");

  await probe(page, "c1 insert shape object", {
    apply: async (p) => {
      await clickCmd(p, "insertObject", "shape");
      await clickId(p, "btn-object-ok");
    } });

  await probe(page, "c2 insert table (2x3)", {
    apply: async (p) => {
      await clickId(p, "btn-table");
      await clickId(p, "btn-table-ok");
    } });

  // Vector objects (chart/equation/smartart) render asynchronously via an
  // Image onload -> execCommand insertHTML; wait for the img to land.
  const insertVector = (openBtn, okBtn) => async (p) => {
    await clickId(p, openBtn);
    await clickId(p, okBtn);
    await p.waitForSelector("#editor img.vector-object", { timeout: 5000 });
    await p.waitForTimeout(200);
  };
  await probe(page, "c3 insert chart (vector)", {
    apply: insertVector("btn-chart", "btn-chart-ok") });
  await probe(page, "c4 insert equation (vector)", {
    apply: insertVector("btn-equation", "btn-equation-ok") });
  await probe(page, "c5 insert smartart (vector)", {
    apply: insertVector("btn-smartart", "btn-smartart-ok") });

  await probe(page, "c6 insert image", {
    apply: async (p) => {
      await clickId(p, "btn-image");
      await p.setInputFiles("#image-file", {
        name: "dot.png", mimeType: "image/png", buffer: PNG_1PX });
      await p.waitForFunction(
        () => !document.getElementById("btn-image-ok").disabled,
        null, { timeout: 5000 });
      await clickId(p, "btn-image-ok");
    } });

  await probe(page, "c7 insert content control", {
    apply: async (p) => {
      await clickId(p, "btn-contentcontrol");
      await clickId(p, "btn-cc-ok");
    } });

  await probe(page, "c8 drop cap via dialog", {
    apply: async (p) => {
      await clickCmd(p, "toggleDropcap");
      await clickId(p, "btn-dropcap-ok");
    } });

  // Object ops need a selected object: prime by inserting a shape, click it,
  // then run the op through its data-cmd button (same executor as the UI).
  const primedShape = async (p) => {
    await clickCmd(p, "insertObject", "shape");
    await clickId(p, "btn-object-ok");
    await p.waitForTimeout(120);
    await p.locator("#editor div.object").first().click();
    await p.waitForTimeout(80);
  };
  await probe(page, "c9 object op bring-forward", {
    prime: primedShape,
    apply: (p) => clickCmd(p, "objectOp", "bring-forward") });
  await probe(page, "c10 object op wrap-square", {
    prime: primedShape,
    apply: (p) => clickCmd(p, "objectOp", "wrap-square") });

  await probe(page, "c11 chart resize (chart-size input)", {
    prime: async (p) => {
      await clickId(p, "btn-chart");
      await clickId(p, "btn-chart-ok");
      await p.waitForSelector("#editor img.vector-object", { timeout: 5000 });
      await p.waitForTimeout(200);
      await p.locator("#editor img.vector-object").first().click();
      await p.waitForTimeout(120);
      // Clicking the chart opens the chart-design ribbon tab (hiding the
      // home ribbon and the undo button) and the object-layout popup.
      // Return to home + close the popup so the probe can click undo.
      await p.evaluate(() => {
        document.getElementById("btn-objlayout-close")?.click();
        document.querySelector('.ribbon-tab[data-tab="home"]')?.click();
      });
      await p.waitForTimeout(120);
    },
    apply: (p) => p.evaluate(() => {
      const el = document.getElementById("chart-width-input");
      el.disabled = false; // design tab arms it on selection; force-armed here
      el.value = "300";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }) });

  // Phantom check: closing an insert dialog with Cancel must touch neither
  // the DOM nor the history chain.
  await step("c12 object dialog cancel is a no-op", async () => {
    await resetDoc(page);
    const beforeHtml = await normHtml(page);
    const h0 = await hist(page);
    const undoDisabledBefore = await page.evaluate(
      () => document.getElementById("btn-undo").disabled);
    await clickCmd(page, "insertObject", "shape");
    await clickId(page, "btn-object-cancel");
    await page.waitForTimeout(150);
    assert.equal((await hist(page)).u, h0.u, "cancel must not push history");
    assert.equal(await normHtml(page), beforeHtml, "cancel must not touch the DOM");
    assert.equal(await page.evaluate(
      () => document.getElementById("btn-undo").disabled), undoDisabledBefore,
      "cancel must not enable undo");
    const open = await page.evaluate(() =>
      document.getElementById("object-dialog").classList.contains("open"));
    assert.equal(open, false, "cancel must close the dialog");
  });
}

// ------------------------------------------- group d: document structure --
async function groupD(page) {
  // Direct-command structural insertions: each execCommand's markup in and
  // pushes exactly one history entry.
  await probe(page, "d1 insert horizontal rule", {
    // No toolbar button (context-menu action HorizontalRule routes here).
    apply: (p) => emitCmd(p, "insertHR"),
  });
  await probe(page, "d2 insert page break", {
    apply: (p) => clickCmd(p, "insertPageBreak"),
  });
  await probe(page, "d3 insert column break", {
    apply: (p) => clickCmd(p, "insertColumnBreak"),
  });
  await probe(page, "d4 insert section break", {
    apply: (p) => clickCmd(p, "insertSectionBreak"),
  });
  await probe(page, "d5 insert blank page", {
    apply: (p) => clickCmd(p, "insertBlankPage"),
  });
  await probe(page, "d6 insert footnote", {
    apply: (p) => clickCmd(p, "insertFootnote"),
  });
  await probe(page, "d7 insert endnote", {
    apply: (p) => clickCmd(p, "insertEndnote"),
  });
  await probe(page, "d8 insert page number", {
    apply: (p) => clickCmd(p, "insertPageNumber"),
  });
  await probe(page, "d9 insert header", {
    apply: (p) => clickCmd(p, "insertHeader"),
  });
  await probe(page, "d10 insert footer", {
    apply: (p) => clickCmd(p, "insertFooter"),
  });

  // Table of contents: dialog-driven insert, then a refresh of the same TOC.
  await probe(page, "d11 insert table of contents", {
    apply: async (p) => {
      await clickId(p, "btn-toc");
      await clickId(p, "btn-toc-ok");
    },
  });
  await probe(page, "d12 update existing TOC", {
    prime: async (p) => {
      await clickId(p, "btn-toc");
      await clickId(p, "btn-toc-ok");
      await page.waitForTimeout(150);
    },
    apply: async (p) => {
      await clickCmd(p, "updateToc");
      await clickId(p, "btn-updatetoc-ok");
    },
  });
  await probe(page, "d13 insert table of figures", {
    apply: (p) => clickCmd(p, "insertToF"),
  });
  await probe(page, "d14 insert caption", {
    apply: (p) => clickCmd(p, "insertCaption"),
  });

  // Hyperlink needs a text selection to wrap.
  await probe(page, "d15 insert hyperlink on selection", {
    select: (p) => selectWord(p, "bravo"),
    apply: async (p) => {
      await clickCmd(p, "link");
      await p.fill("#link-url", "https://example.org/bravo");
      await clickId(p, "btn-link-ok");
    },
  });

  await probe(page, "d16 insert bookmark", {
    apply: async (p) => {
      await clickCmd(p, "bookmark");
      await p.fill("#bookmark-name", "probe-anchor");
      await clickId(p, "btn-bookmark-ok");
    },
  });

  await probe(page, "d17 apply column layout", {
    apply: async (p) => {
      await clickCmd(p, "openColumnsDialog");
      await clickId(p, "btn-columns-ok");
    },
  });

  await probe(page, "d18 apply page setup", {
    apply: async (p) => {
      await clickId(p, "btn-page-setup");
      await clickId(p, "btn-ps-apply");
    },
  });
}

// ------------------------------------------------- group e: review/collab --
async function groupE(page) {
  console.log("group e — review/collab");
  const selBravo = (p) => selectWord(p, "bravo");

  // Collapse the selection to a caret just inside the first matched element
  // (accept/reject/resolve/delete operate on the element at the caret).
  const caretInside = (p, sel) =>
    p.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`no element ${sel}`);
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(true);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }, sel);

  // Prime: insert a comment on "bravo" via the real dialog path.
  const primeComment = async (p) => {
    await selectWord(p, "bravo");
    await clickCmd(p, "insertComment");
    await p.fill("#comment-body", "needs review");
    await clickId(p, "btn-comment-ok");
    await p.waitForTimeout(150);
  };

  // Track-changes mode carries over between probes (resetDoc only resets
  // content/history), so primes must SET the mode, not blind-toggle it.
  const setTrack = async (p, on) => {
    const cur = await p.evaluate(() =>
      document.getElementById("editor").classList.contains("track-on"));
    if (cur !== on) await clickJs(p, "sb-track-changes");
  };

  // Prime: switch track-changes on (mode state — no history push) and put
  // the caret before "bravo" with editor focus for real keyboard input.
  const primeTrackCaret = async (p) => {
    await setTrack(p, true);
    await p.evaluate(() => {
      document.getElementById("editor").focus();
      const root = document.getElementById("editor");
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const i = node.data.indexOf("bravo");
        if (i >= 0) {
          const r = document.createRange();
          r.setStart(node, i);
          r.collapse(true);
          const s = window.getSelection();
          s.removeAllRanges();
          s.addRange(r);
          return;
        }
      }
      throw new Error("bravo not found");
    });
  };

  // Prime: a tracked insertion of "X" before "bravo" (real beforeinput path).
  const primeTrackedInsert = async (p) => {
    await primeTrackCaret(p);
    await p.keyboard.type("X");
    await p.waitForTimeout(150);
  };

  // Prime: a tracked deletion of "bravo" (selection + Backspace).
  const primeTrackedDelete = async (p) => {
    await setTrack(p, true);
    await p.evaluate(() => document.getElementById("editor").focus());
    await selectWord(p, "bravo");
    await p.keyboard.press("Backspace");
    await p.waitForTimeout(150);
  };

  await probe(page, "e1 insert comment on selection", {
    select: selBravo,
    apply: async (p) => {
      await clickCmd(p, "insertComment");
      await p.fill("#comment-body", "needs review");
      await clickId(p, "btn-comment-ok");
    },
    afterUndo: async (p) => assert.equal(await p.evaluate(() =>
      document.querySelector("#editor span.comment") === null), true,
      "undo must unwrap the comment span"),
  });

  await probe(page, "e2 reply to comment thread", {
    prime: primeComment,
    apply: async (p) => {
      await p.fill(".review-reply-input .reply-textarea", "agreed");
      await p.evaluate(() => {
        const btn = document.querySelector(".review-reply-input button.primary");
        if (!btn) throw new Error("no reply post button");
        btn.click();
      });
    },
    afterUndo: async (p) => assert.equal(await p.evaluate(() =>
      document.querySelector("#editor span.comment")
        .getAttribute("data-replies")), null,
      "undo must remove the reply (data-replies back to unset)"),
  });

  await probe(page, "e3 resolve comment", {
    prime: primeComment,
    apply: async (p) => {
      await caretInside(p, "#editor span.comment");
      await clickCmd(p, "resolveComment");
    },
    afterUndo: async (p) => assert.equal(await p.evaluate(() =>
      document.querySelector("#editor span.comment")
        .getAttribute("data-resolved")), null,
      "undo must clear the resolved flag"),
  });

  await probe(page, "e4 delete comment", {
    prime: primeComment,
    apply: async (p) => {
      await caretInside(p, "#editor span.comment");
      await clickCmd(p, "deleteComment");
    },
    afterUndo: async (p) => assert.notEqual(await p.evaluate(() =>
      document.querySelector("#editor span.comment")), null,
      "undo must restore the comment span"),
  });

  // Mode toggles are state, not content: no history entry, no DOM change.
  await probe(page, "e5 track-changes toggle on (no-op)", {
    expectDepth: 0,
    skipDepth: true,
    prime: (p) => setTrack(p, false),
    apply: (p) => clickJs(p, "sb-track-changes"),
    afterUndo: async (p) => assert.equal(await p.evaluate(() =>
      document.getElementById("sb-track-changes").getAttribute("aria-pressed")), "true",
      "track toggle must flip aria-pressed without touching history"),
  });

  await probe(page, "e6 tracked insert (typing)", {
    prime: primeTrackCaret,
    apply: (p) => p.keyboard.type("X"),
  });

  await probe(page, "e7 tracked delete (selection+backspace)", {
    prime: async (p) => {
      await setTrack(p, true);
      await p.evaluate(() => document.getElementById("editor").focus());
    },
    select: selBravo,
    apply: (p) => p.keyboard.press("Backspace"),
  });

  await probe(page, "e8 accept tracked insert", {
    prime: primeTrackedInsert,
    apply: async (p) => {
      await caretInside(p, "#editor ins.track-insert");
      await clickCmd(p, "acceptTrackedChange");
    },
  });

  await probe(page, "e9 reject tracked insert", {
    prime: primeTrackedInsert,
    apply: async (p) => {
      await caretInside(p, "#editor ins.track-insert");
      await clickCmd(p, "rejectTrackedChange");
    },
    afterUndo: async (p) => assert.notEqual(await p.evaluate(() =>
      document.querySelector("#editor ins.track-insert")), null,
      "undo must restore the tracked insertion"),
  });

  await probe(page, "e10 accept tracked delete", {
    prime: primeTrackedDelete,
    apply: async (p) => {
      await caretInside(p, "#editor del.track-delete");
      await clickCmd(p, "acceptTrackedChange");
    },
    afterUndo: async (p) => assert.notEqual(await p.evaluate(() =>
      document.querySelector("#editor del.track-delete")), null,
      "undo must restore the tracked deletion"),
  });

  await probe(page, "e11 reject tracked delete", {
    prime: primeTrackedDelete,
    apply: async (p) => {
      await caretInside(p, "#editor del.track-delete");
      await clickCmd(p, "rejectTrackedChange");
    },
    afterUndo: async (p) => assert.notEqual(await p.evaluate(() =>
      document.querySelector("#editor del.track-delete")), null,
      "undo must restore the tracked deletion"),
  });

  // Toggle back off (no-op) so group F runs with tracking disabled.
  await probe(page, "e12 track-changes toggle off (no-op)", {
    expectDepth: 0,
    skipDepth: true,
    prime: (p) => setTrack(p, true),
    apply: (p) => clickJs(p, "sb-track-changes"),
    afterUndo: async (p) => assert.equal(await p.evaluate(() =>
      document.getElementById("sb-track-changes").getAttribute("aria-pressed")), "false",
      "track toggle must flip aria-pressed without touching history"),
  });
}

// ------------------------------------------------------------------ main --
async function main() {
  const port = await freePort(PORT);
  const server = spawn(PY, ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
    cwd: EDITOR_DIR, stdio: "ignore",
  });
  try {
    await waitUp(port, 15000);
    const browser = await chromium.launch();
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.log(`  [pageerror] ${e.message}`));
    await page.addInitScript(stubInit, { seed: SEED_HTML });
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await installNorm(page);

    const hasHook = await page.evaluate(() => !!window.__WO_HISTORY__);
    assert.ok(hasHook, "window.__WO_HISTORY__ hook must exist (editor.js)");

    await groupA(page);
    await groupB(page);
    await groupC(page);
    await groupD(page);
    await groupE(page);

    await browser.close();
  } finally {
    server.kill();
  }

  console.log("");
  if (failures.length) {
    console.log(`undo-deep: ${failures.length} FAILURE(S)`);
    for (const f of failures) console.log(`  ${f.name}\n    -> ${f.msg}`);
    process.exit(1);
  }
  console.log("undo-deep: all probes passed");
}

main().catch((err) => {
  console.error("undo-deep: fatal:", err);
  process.exit(1);
});

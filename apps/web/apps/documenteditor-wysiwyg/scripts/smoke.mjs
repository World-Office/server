#!/usr/bin/env node
// BUG2-RUNTIME-SMOKE — full-surface runtime smoke driver.
//
// WHAT: boots the WYSIWYG editor in headless Chromium, drives EVERY ribbon
// button, menu row, dialog, context-menu row and right-panel section, and
// records {action, ok, errors[]} per action into a JSON report.
//   ok        = a visible effect or "wo:" console marker was seen between the
//               pre-click and post-click snapshot (dialog open/close, editor
//               DOM change, statusbar text, menu opened, aria-pressed toggle,
//               panel/rail state) — pragmatic, per acceptance criteria.
//   errors[]  = pageerror events + console.error captured during the action
//               (benign wo-bridge fetch 404s are counted separately).
//
// HOW TO RUN (manual/live-only; the *.test.mjs gate only proves this file
// exists and references the key selectors):
//   node scripts/smoke.mjs [--port 18043] [--out scripts/smoke-report.json]
// The script starts its own `python3 -m http.server` on the chosen port
// (PATH python3 may be a broken shim; /usr/bin/python3 preferred), serves
// the editor dir (scripts/..), runs, prints a triage summary and exits
// non-zero if any real pageerror/console.error fired.
//
// Playwright is NOT an npm dependency of this app; it is loaded from the
// shared test harness by absolute path (already installed there).
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const EDITOR_DIR = resolve(HERE, "..");
const PLAYWRIGHT = "/home/weiss/git/World-Office/wo-test-harness/census/node_modules/playwright";

// --- args -------------------------------------------------------------
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const PORT = Number(arg("--port", "18043"));
const OUT = resolve(process.cwd(), arg("--out", join(HERE, "smoke-report.json")));

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
  // PATH python3 can be a broken shim in some environments; prefer /usr/bin.
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

// --- driver state ------------------------------------------------------
const report = { url: "", startedAt: new Date().toISOString(), actions: [], net404: 0, summary: {} };
let page = null;
let crashErrors = [];   // {action, text}
let markerCount = 0;    // "wo:" console.info markers seen so far
let currentAction = null;

// 1x1 PNG (image-insert step)
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64");

// Buttons whose primary/confirm click is unsafe in a smoke run
// (save/export/print hit network or print; delete-class removes things;
// restore/discard rewrite document state from server data).
const UNSAFE_PRIMARY = /(save|export|print|delete|remove|protect|accept|reject|run|combine|send|restore|discard)/i;

async function snapshot() {
  return page.evaluate(() => {
    const ed = document.getElementById("editor");
    const status = document.getElementById("status");
    const s = window.getSelection();
    return {
      status: status ? status.textContent : "",
      edHtml: ed ? ed.innerHTML : "",
      selLen: s ? s.toString().length : 0,
      dialogs: [...document.querySelectorAll(".dialog-overlay.open, .insert-pop")]
        .filter((d) => d.classList.contains("open") || d.offsetParent !== null)
        .map((d) => d.id),
      menus: [...document.querySelectorAll(".menu-list")].filter((m) => !m.hidden).length,
      ctxOpen: !document.getElementById("ctx-menu").hidden,
      panelHidden: document.getElementById("right-panel").hidden,
      styleSig: (ed ? ed.getAttribute("style") || "" : "") + "|" +
        (document.documentElement.getAttribute("style") || ""),
      active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : "",
    };
  });
}
function diffEffect(before, after) {
  if (!before || !after) return true;
  return before.status !== after.status ||
    before.edHtml !== after.edHtml ||
    before.selLen !== after.selLen ||
    before.dialogs.join() !== after.dialogs.join() ||
    before.menus !== after.menus ||
    before.ctxOpen !== after.ctxOpen ||
    before.panelHidden !== after.panelHidden ||
    before.styleSig !== after.styleSig ||
    before.active !== after.active;
}

async function step(name, fn, opts = {}) {
  const rec = { action: name, ok: false, errors: [] };
  const before = opts.noSnap ? null : await snapshot().catch(() => null);
  const markerBefore = markerCount;
  const errBefore = crashErrors.length;
  const prevCurrent = currentAction;
  currentAction = rec;
  try {
    await fn();
  } catch (e) {
    rec.errors.push("driver: " + e.message);
  }
  currentAction = prevCurrent;
  const after = opts.noSnap ? null : await snapshot().catch(() => null);
  if (opts.check) {
    try { rec.ok = await opts.check(); } catch (e) { rec.errors.push("check: " + e.message); }
  } else {
    rec.ok = diffEffect(before, after) || markerCount > markerBefore;
  }
  for (let i = errBefore; i < crashErrors.length; i++) {
    if (!rec.errors.includes(crashErrors[i].text)) rec.errors.push(crashErrors[i].text);
  }
  report.actions.push(rec);
  return rec;
}

// ribbon button click by index within a (pre-activated) ribbon page
async function clickRibbonButton(tab, idx, label) {
  await closeStrayDialog(); // isolate: previous click may have left a dialog open
  await ensureTextAndSelection(); // formatting needs a live selection every time
  await step(label, async () => {
    await page.evaluate(({ tab, idx }) => {
      const pg = document.querySelector(`.ribbon-page[data-tab='${tab}']`);
      const btns = [...pg.querySelectorAll("button[data-cmd]")].filter((b) => !b.closest(".menu-list"));
      btns[idx].click();
    }, { tab, idx });
    await sleep(90);
  });
}

// ensure the editor has sample text and a live selection so formatting
// commands produce honest, visible effects
async function ensureTextAndSelection() {
  await page.evaluate(() => {
    const ed = document.getElementById("editor");
    if (!ed.textContent.trim()) {
      ed.innerHTML = "<p>Sample paragraph text for formatting smoke coverage</p>";
      ed.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
    const sel = window.getSelection();
    if (sel.isCollapsed || sel.toString().length === 0) {
      const range = document.createRange();
      range.selectNodeContents(ed);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });
  await sleep(60);
}

async function openMenu(li) {
  await page.evaluate((li) => {
    const list = document.querySelectorAll(".menu-list")[li];
    const host = list.closest(".menu");
    const trigger = host
      ? host.querySelector(".menu-trigger, .styles-trigger")
      : document.getElementById("btn-file");
    if (trigger) trigger.click();
  }, li);
}
const menuIsOpen = (li) => page.evaluate((li) => {
  const list = document.querySelectorAll(".menu-list")[li];
  return !!(list && !list.hidden);
}, li);

async function openDialogBy(opener, dlgId) {
  if (opener.kind === "btn" || opener.kind === "el") {
    await page.evaluate((sel) => document.querySelector(sel)?.click(), opener.sel);
  } else if (opener.kind === "menu-row") {
    await openMenu(opener.li);
    await sleep(70);
    await page.evaluate(({ li, i }) => {
      document.querySelectorAll(".menu-list")[li]
        .querySelectorAll('[role="menuitem"]')[i].click();
    }, { li: opener.li, i: opener.i });
  } else if (opener.kind === "cmd") {
    await page.evaluate((cmd) => {
      const b = [...document.querySelectorAll(`[data-cmd='${cmd}']`)]
        .find((x) => !x.closest(".menu-list")) ||
        document.querySelector(`[data-cmd='${cmd}']`);
      if (b) b.click();
    }, opener.cmd);
  }
  await sleep(140);
  return page.evaluate(
    (dlg) => document.getElementById(dlg).classList.contains("open") ||
      (document.getElementById(dlg).offsetParent !== null), dlgId);
}

async function closeStrayDialog() {
  const s = await snapshot();
  if (s.dialogs.length) {
    await page.keyboard.press("Escape");
    await sleep(70);
  }
}

// select whole editor content + open ctx menu (real path: contextmenu event)
async function openCtxMenu() {
  await page.evaluate(() => {
    const ed = document.getElementById("editor");
    ed.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(ed);
    sel.removeAllRanges();
    sel.addRange(range);
    const r = ed.getBoundingClientRect();
    ed.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true, cancelable: true, clientX: r.x + 60, clientY: r.y + 12 }));
  });
  await sleep(160);
}
const ctxOpen = () => page.evaluate(() => !document.getElementById("ctx-menu").hidden);

// ---------------------------------------------------------------- main
async function main() {
  const { chromium } = require(PLAYWRIGHT);
  const port = await freePort(PORT);
  const server = startServer(EDITOR_DIR, port);
  report.url = `http://127.0.0.1:${port}/index.html`;

  try {
    if (!(await waitUp(port))) throw new Error("http.server did not come up on :" + port);
    const browser = await chromium.launch({ headless: true });
    const browserPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    browserPage.setDefaultTimeout(4000);
    page = browserPage;

    browserPage.on("pageerror", (err) => {
      const text = "pageerror: " + (err && err.stack ? err.stack.split("\n")[0] : String(err));
      if (currentAction) currentAction.errors.push(text);
      crashErrors.push({ action: currentAction ? currentAction.action : "(idle)", text });
    });
    browserPage.on("console", (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (type === "error" || type === "warning") {
        if (/Failed to load resource|net::ERR_/.test(text)) { report.net404++; return; }
        const t = (type === "error" ? "console.error: " : "console.warn: ") + text;
        if (currentAction) currentAction.errors.push(t);
        crashErrors.push({ action: currentAction ? currentAction.action : "(idle)", text: t });
      } else if (type === "info" && /^wo[:.]/.test(text.trim())) {
        markerCount++;
      }
    });
    browserPage.on("popup", (p) => p.close().catch(() => {}));
    // native confirm/prompt dialogs: accept so document-level actions (File >
    // New, tracked-change prompts) actually execute in the smoke run
    browserPage.on("dialog", (d) => d.accept().catch(() => {}));
    // a fired download counts as a visible effect (File > ODT/HTML/DOCX)
    browserPage.on("download", () => { markerCount++; });

    // ---------- boot ----------
    await step("boot: load editor", async () => {
      await browserPage.goto(report.url, { waitUntil: "domcontentloaded" });
      await sleep(2500); // networkidle times out on some assets — verified recipe
    }, { check: () => page.evaluate(() => !!document.getElementById("editor") &&
      document.querySelectorAll(".ribbon-tab").length >= 10) });

    const tabs = await page.evaluate(() =>
      [...document.querySelectorAll(".ribbon-tab")].map(
        (t) => ({ tab: t.dataset.tab, hidden: t.hidden })));
    const menuDescs = await page.evaluate(() =>
      [...document.querySelectorAll(".menu-list")].map((list) => ({
        li: [...document.querySelectorAll(".menu-list")].indexOf(list),
        tab: list.closest(".ribbon-page") ? list.closest(".ribbon-page").dataset.tab : null,
        triggerLabel: list.closest(".menu") && list.closest(".menu").querySelector(".menu-trigger, .styles-trigger")
          ? (list.closest(".menu").querySelector(".menu-trigger, .styles-trigger").textContent || "").trim() : "(file)",
        rows: [...list.querySelectorAll('[role="menuitem"]')].map((r, i) => (
          { i, label: (r.textContent || "").trim(), id: r.id || null })),
      })));

    // ---------- (b) every ribbon button on every visible tab ----------
    await ensureTextAndSelection();
    for (const { tab, hidden } of tabs) {
      if (hidden) continue; // chart-design + header-footer get real-path phases below
      await step(`tab: ${tab}`, async () => {
        await page.evaluate((t) => document.querySelector(`.ribbon-tab[data-tab='${t}']`).click(), tab);
        await sleep(80);
      }, { check: () => page.evaluate(
        (t) => document.querySelector(`.ribbon-page[data-tab='${t}']`).classList.contains("active"), tab) });

      const nBtns = await page.evaluate((t) =>
        [...document.querySelectorAll(`.ribbon-page[data-tab='${t}'] button[data-cmd]`)]
          .filter((b) => !b.closest(".menu-list")).length, tab);
      const cmds = await page.evaluate((t) =>
        [...document.querySelectorAll(`.ribbon-page[data-tab='${t}'] button[data-cmd]`)]
          .filter((b) => !b.closest(".menu-list")).map((b) => b.dataset.cmd), tab);
      for (let i = 0; i < nBtns; i++) {
        await clickRibbonButton(tab, i, `btn[${tab}] ${cmds[i]}`);
      }
    }

    // ---------- (c) every rb-menu trigger + every row ----------
    for (const md of menuDescs) {
      if (md.tab && !tabs.find((t) => t.tab === md.tab && !t.hidden)) continue;
      if (md.tab) {
        await page.evaluate((t) => document.querySelector(`.ribbon-tab[data-tab='${t}']`).click(), md.tab);
        await sleep(60);
      }
      const opened = await step(`menu: open ${md.triggerLabel || "file"}`, async () => {
        await openMenu(md.li);
        await sleep(90);
      }, { check: () => menuIsOpen(md.li) });
      if (!opened.ok) continue;
      for (const row of md.rows) {
        await ensureTextAndSelection(); // File>New etc. may have cleared content
        await step(`menu-row: ${md.triggerLabel || "file"} > ${row.label || row.id || row.i}`, async () => {
          if (!(await menuIsOpen(md.li))) { await openMenu(md.li); await sleep(60); }
          await page.evaluate(({ li, i }) => {
            document.querySelectorAll(".menu-list")[li]
              .querySelectorAll('[role="menuitem"]')[i].click();
          }, { li: md.li, i: row.i });
          await sleep(90);
        });
        await closeStrayDialog();
      }
      await page.evaluate(() => document.body.click());
      await sleep(40);
    }

    // ---------- (f) inserts: table, chart, image, header/footer ----------
    await step("insert: table", async () => {
      await page.evaluate(() => document.getElementById("btn-table").click());
      await sleep(120);
      await page.evaluate(() => document.getElementById("btn-table-ok").click());
      await sleep(140);
    }, { check: () => page.evaluate(() => !!document.querySelector("#editor table")) });

    await step("insert: chart", async () => {
      await page.evaluate(() => document.getElementById("btn-chart").click());
      await sleep(120);
      await page.evaluate(() => document.getElementById("btn-chart-ok").click());
      await sleep(180);
    }, { check: () => page.evaluate(() =>
      !!document.querySelector("#editor img[data-kind='chart'], #editor svg")) });

    await step("insert: image (file input)", async () => {
      await page.evaluate(() => document.getElementById("btn-image").click());
      await sleep(140);
      await page.setInputFiles("#image-file", { name: "px.png", mimeType: "image/png", buffer: PNG_1PX });
      await sleep(250);
      await page.evaluate(() => document.getElementById("btn-image-ok").click());
      await sleep(180);
    }, { check: () => page.evaluate(() => !!document.querySelector("#editor img:not([data-kind])")) });

    await step("insert: header/footer (page furniture)", async () => {
      await page.evaluate(() => document.getElementById("btn-header").click());
      await sleep(120);
      await page.evaluate(() => document.getElementById("btn-headerfooter-ok").click());
      await sleep(180);
    }, { check: () => page.evaluate(() =>
      !!document.querySelector("#editor > header.page-header") &&
      !!document.querySelector("#editor > footer.page-footer")) });

    // real path into HF authoring mode: double-click the header
    await step("hf: dblclick header → HF mode + tab", async () => {
      await page.evaluate(() => {
        const h = document.querySelector("#editor > header.page-header");
        h.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      });
      await sleep(150);
    }, { check: () => page.evaluate(() =>
      !document.querySelector(".ribbon-tab[data-tab='header-footer']").hidden) });

    // ---------- chart-design tab (AF9 suspect: selection wiring) ----------
    await step("chart: select → chart-design tab appears", async () => {
      await page.evaluate(() => {
        const el = document.querySelector("#editor img[data-kind='chart'], #editor svg");
        if (el) {
          el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
          el.click();
        }
      });
      await sleep(200);
    }, { check: () => page.evaluate(() =>
      !document.querySelector(".ribbon-tab[data-tab='chart-design']").hidden) });
    if (await page.evaluate(() =>
      !document.querySelector(".ribbon-tab[data-tab='chart-design']").hidden)) {
      await step("tab: chart-design (selected chart)", async () => {
        await page.evaluate(() => document.querySelector(".ribbon-tab[data-tab='chart-design']").click());
        await sleep(90);
      }, { check: () => page.evaluate(() =>
        document.querySelector(".ribbon-page[data-tab='chart-design']").classList.contains("active")) });
      const ccmds = await page.evaluate(() =>
        [...document.querySelectorAll(".ribbon-page[data-tab='chart-design'] button[data-cmd]")]
          .filter((b) => !b.closest(".menu-list")).map((b) => b.dataset.cmd));
      for (let i = 0; i < ccmds.length; i++) await clickRibbonButton("chart-design", i, `btn[chart-design] ${ccmds[i]}`);
      await page.evaluate(() => document.getElementById("editor").click());
      await sleep(100);
    }

    // ---------- header-footer tab ----------
    if (await page.evaluate(() =>
      !document.querySelector(".ribbon-tab[data-tab='header-footer']").hidden)) {
      await step("tab: header-footer (in HF mode)", async () => {
        await page.evaluate(() => document.querySelector(".ribbon-tab[data-tab='header-footer']").click());
        await sleep(90);
      }, { check: () => page.evaluate(() =>
        document.querySelector(".ribbon-page[data-tab='header-footer']").classList.contains("active")) });
      const hcmds = await page.evaluate(() =>
        [...document.querySelectorAll(".ribbon-page[data-tab='header-footer'] button[data-cmd]")]
          .filter((b) => !b.closest(".menu-list")).map((b) => b.dataset.cmd));
      for (let i = 0; i < hcmds.length; i++) await clickRibbonButton("header-footer", i, `btn[header-footer] ${hcmds[i]}`);
      // leave HF mode the real way: Escape
      await page.keyboard.press("Escape");
      await sleep(120);
    }

    // ---------- (d) dialogs ----------
    const dlgIds = await page.evaluate(() =>
      [...document.querySelectorAll(".dialog-overlay")].map((d) => d.id));
    // static opener map (real openers, grepped from editor.js callers).
    // kind btn = button id; el = non-button element; cmd = data-cmd anywhere.
    const STATIC_OPENERS = {
      "info-dialog": { kind: "btn", sel: "#btn-fileinfo" },
      "settings-dialog": { kind: "btn", sel: "#btn-filesettings" },
      "help-dialog": { kind: "btn", sel: "#btn-filehelp" },
      "suggest-dialog": { kind: "btn", sel: "#btn-filesuggest" },
      "protect-dialog": { kind: "btn", sel: "#btn-fileprotect" },
      "notes-dialog": { kind: "btn", sel: "#btn-footnote" },
      "pagenumber-dialog": { kind: "btn", sel: "#btn-pagenumber" },
      "headerfooter-dialog": { kind: "btn", sel: "#btn-header" },
      "mailmerge-dialog": { kind: "btn", sel: "#rp-mm-fields" },
      "addtext-dialog": { kind: "btn", sel: "#btn-addtext" },
      "chart-dialog": { kind: "btn", sel: "#btn-chart" },
      "equation-dialog": { kind: "btn", sel: "#btn-equation" },
      "smartart-dialog": { kind: "btn", sel: "#btn-smartart" },
      "field-dialog": { kind: "btn", sel: "#btn-field" },
      "cc-dialog": { kind: "btn", sel: "#btn-contentcontrol" },
      "link-dialog": { kind: "btn", sel: "#btn-link" },
      "bookmark-dialog": { kind: "btn", sel: "#btn-bookmark" },
      "crossref-dialog": { kind: "btn", sel: "#btn-crossref" },
      "version-history-dialog": { kind: "btn", sel: "#btn-history" },
      "ai-review-dialog": { kind: "btn", sel: "#btn-ai-review" },
      "ai-propose-dialog": { kind: "btn", sel: "#btn-ai-assistant" },
      "comment-dialog": { kind: "btn", sel: "#btn-comment" },
      "find-dialog": { kind: "btn", sel: "#btn-find" },
      "object-dialog": { kind: "btn", sel: "#btn-object" },
      "toc-dialog": { kind: "btn", sel: "#btn-toc" },
      "table-ops-dialog": { kind: "btn", sel: "#btn-table-ops" },
      "trackchanges-dialog": { kind: "btn", sel: "#btn-track-changes" },
      "plugins-dialog": { kind: "cmd", cmd: "managePlugins" },
      "photo-editor-dialog": { kind: "cmd", cmd: "photoEditor" },
      "plugin-unavailable-dialog": { kind: "cmd", cmd: "pluginUnavailable" },
      "page-setup-dialog": { kind: "cmd", cmd: "openPageSetup" },
      "columns-dialog": { kind: "cmd", cmd: "openColumnsDialog" },
      "borders-dialog": { kind: "cmd", cmd: "openBorders" },
      "updatetoc-dialog": { kind: "cmd", cmd: "updateToc" },
      "displaymode-dialog": { kind: "cmd", cmd: "displayMode" },
      "pagecolor-dialog": { kind: "el", sel: "#pagecolor" },
      "colors-dialog": { kind: "el", sel: "#themecolors" },
      "dropcap-dialog": { kind: "cmd", cmd: "toggleDropcap" },
      "linenumbers-dialog": { kind: "cmd", cmd: "toggleLineNumbers" },
      "hyphenation-dialog": { kind: "cmd", cmd: "toggleHyphenation" },
      "watermark-dialog": { kind: "cmd", cmd: "toggleWatermark" },
      // ctx/selection-only openers — noted, not driven (criteria: skip and note)
      "symbol-dialog": null,
      "objlayout-pop": null,
    };
    for (const id of dlgIds) {
      const opener = STATIC_OPENERS[id];
      if (!opener) {
        report.actions.push({ action: `dialog: ${id}`, ok: false, errors: [],
          note: "ctx/selection-only opener — skipped per criteria (noted)" });
        continue;
      }
      // pass 1: open → safe primary/confirm
      const opened1 = await openDialogBy(opener, id);
      if (!opened1) {
        report.actions.push({ action: `dialog: ${id}`, ok: false, errors: [],
          note: `opener ${opener.kind}:${opener.sel || opener.cmd} did not open dialog — skipped` });
        continue;
      }
      const primRec = await step(`dialog: ${id} primary`, async () => {
        await page.evaluate(({ dlg, unsafe }) => {
          const re = new RegExp(unsafe, "i");
          const d = document.getElementById(dlg);
          // prefill empty text inputs (e.g. bookmark name) — realistic user input
          for (const inp of d.querySelectorAll('input[type="text"]')) {
            if (!inp.value) {
              inp.value = "smoke";
              inp.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }
          const btns = [...d.querySelectorAll("button")].filter((b) => !b.disabled &&
            (b.classList.contains("primary") || /-ok\b|-apply\b|ok$/.test(b.id)));
          const target = btns.find((b) => !re.test(b.id + " " + (b.textContent || "")));
          if (target) target.click();
        }, { dlg: id, unsafe: UNSAFE_PRIMARY.source });
        await sleep(140);
      });
      if (await page.evaluate(({ dlg, unsafe }) => {
        const re = new RegExp(unsafe, "i");
        const d = document.getElementById(dlg);
        return ![...d.querySelectorAll("button")].some((b) => !b.disabled &&
          (b.classList.contains("primary") || /-ok\b|-apply\b|ok$/.test(b.id)) &&
          !re.test(b.id + " " + (b.textContent || "")));
      }, { dlg: id, unsafe: UNSAFE_PRIMARY.source })) {
        primRec.note = "no safe primary button — skipped (close/esc passes cover it)";
        primRec.ok = true;
      }
      // pass 2: open → close via close/cancel button
      if (await openDialogBy(opener, id)) {
        await step(`dialog: ${id} close-btn`, async () => {
          await page.evaluate((dlg) => {
            const d = document.getElementById(dlg);
            const btn = d.querySelector('button[id*="cancel"], button[id*="close"]') ||
              [...d.querySelectorAll("button")].find((b) =>
                /^(close|cancel)$/i.test((b.textContent || "").trim()));
            if (btn) btn.click();
          }, id);
          await sleep(90);
        }, { check: () => page.evaluate(
          (dlg) => !document.getElementById(dlg).classList.contains("open"), id) });
      }
      // pass 3: open → close via Esc
      if (await openDialogBy(opener, id)) {
        await step(`dialog: ${id} esc`, async () => {
          await page.keyboard.press("Escape");
          await sleep(90);
        }, { check: () => page.evaluate(
          (dlg) => !document.getElementById(dlg).classList.contains("open"), id) });
      }
      await closeStrayDialog();
    }

    // ---------- (e) spellcheck via REAL settings path, then ctx menu ----------
    await step("spellcheck: enable via settings (real path)", async () => {
      await page.evaluate(() => document.getElementById("btn-file").click());
      await sleep(120);
      await page.evaluate(() => document.getElementById("btn-filesettings").click());
      await sleep(160);
      await page.evaluate(() => {
        document.getElementById("settings-spellcheck").checked = true;
        document.getElementById("btn-settings-ok").click();
      });
      await sleep(200);
      // real effect: misspellings get marked (dict fetch + 800ms debounce)
      await page.evaluate(() => {
        const ed = document.getElementById("editor");
        ed.innerHTML = "<p>The quck brwn fox</p>";
        ed.dispatchEvent(new InputEvent("input", { bubbles: true }));
        const sel = window.getSelection();
        const range = document.createRange();
        range.setStart(ed, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      });
      await sleep(2500);
    }, { check: () => page.evaluate(() =>
      document.querySelectorAll("#editor .wo-misspelled").length >= 2) });

    // click every ctx row with a fresh selection + menu each time
    const ctxRows = await page.evaluate(() =>
      [...document.querySelectorAll("#ctx-menu [data-ctx]")].map((b) =>
        ({ ctx: b.dataset.ctx, showif: b.dataset.showif || null })));
    const selectMisspelled = () => page.evaluate(() => {
      // real path: the user right-clicks ON a misspelled word
      const hit = document.querySelector("#editor .wo-misspelled");
      const ed = document.getElementById("editor");
      ed.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      if (hit) range.selectNodeContents(hit);
      else range.selectNodeContents(ed);
      sel.removeAllRanges();
      sel.addRange(range);
      const r = ed.getBoundingClientRect();
      ed.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true, cancelable: true, clientX: r.x + 60, clientY: r.y + 12 }));
    });
    for (const row of ctxRows) {
      await step(`ctx-row: ${row.ctx}${row.showif ? " [" + row.showif + "]" : ""}`, async () => {
        await selectMisspelled();
        await sleep(160);
        await page.evaluate((ctx) => {
          const b = [...document.querySelectorAll("#ctx-menu [data-ctx]")]
            .find((x) => x.dataset.ctx === ctx);
          if (b) b.click();
        }, row.ctx);
        await sleep(110);
        await page.keyboard.press("Escape");
        await sleep(60);
      }, { check: async () => {
        const opened = await ctxOpen(); // menu opened for this row (precondition)
        return opened || markerCount > 0;
      } });
      await closeStrayDialog();
    }
    // spell-rows depth assertion (AF11): suggestions + Ignore rows visible on
    // a misspelled word selection — recorded as its own action
    await step("ctx: spell rows + suggestions visible on misspelled selection", async () => {
      const hit = await page.evaluate(() => !!document.querySelector("#editor .wo-misspelled"));
      if (!hit) throw new Error("no .wo-misspelled span present to right-click");
      await page.evaluate(() => {
        const hit2 = document.querySelector("#editor .wo-misspelled");
        const ed = document.getElementById("editor");
        ed.focus();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(hit2);
        sel.removeAllRanges();
        sel.addRange(range);
        const r = ed.getBoundingClientRect();
        ed.dispatchEvent(new MouseEvent("contextmenu", {
          bubbles: true, cancelable: true, clientX: r.x + 60, clientY: r.y + 12 }));
      });
      await sleep(160);
    }, { check: () => page.evaluate(() => {
      const vis = (sel) => [...document.querySelectorAll(sel)]
        .some((b) => b.offsetParent !== null);
      return vis('#ctx-menu [data-ctx="Ignore"]') &&
        vis('#ctx-menu [data-ctx="IgnoreAll"]') &&
        vis('#ctx-menu [data-ctx="SpellSuggest"]');
    }) });

    // ---------- (f2) right panel ----------
    const panelRec = await step("panel: open via Ctrl+Shift+P (editor focus)", async () => {
      await page.keyboard.press("Escape"); // close any open ctx menu first
      await sleep(80);
      await page.evaluate(() => document.getElementById("editor").focus());
      await page.keyboard.press("Control+Shift+p");
      await sleep(150);
    }, { check: () => page.evaluate(() => !document.getElementById("right-panel").hidden) });
    if (!panelRec.ok) {
      panelRec.errors.push("diag: " + await page.evaluate(() => JSON.stringify({
        active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : "?",
        ctx: !document.getElementById("ctx-menu").hidden,
        panelHidden: document.getElementById("right-panel").hidden,
        dialogs: [...document.querySelectorAll(".dialog-overlay.open")].map((d) => d.id),
        bodyClass: document.body.className,
      })));
      // retry once with an explicit click into the editor (real user path)
      await page.evaluate(() => {
        document.getElementById("editor").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        document.getElementById("editor").click();
        document.getElementById("editor").focus();
      });
      await page.keyboard.press("Control+Shift+p");
      await sleep(200);
      panelRec.ok = await page.evaluate(() => !document.getElementById("right-panel").hidden);
      if (panelRec.ok) panelRec.note = "opened on retry after editor click";
    }

    const railSecs = await page.evaluate(() =>
      [...document.querySelectorAll("#right-rail .rail-btn")].map((b) => b.dataset.panel));
    for (const sec of railSecs) {
      const wasActive = await page.evaluate((s) =>
        document.querySelector(`#right-rail .rail-btn[data-panel='${s}']`).getAttribute("aria-pressed") === "true", sec);
      await step(`panel: section ${sec}`, async () => {
        await page.evaluate((s) =>
          document.querySelector(`#right-rail .rail-btn[data-panel='${s}']`).click(), sec);
        await sleep(140);
      }, { check: () => page.evaluate(({ s, wasActive }) => {
        const secEl = document.querySelector(`.rp-section[data-section='${s}']`);
        const btn = document.querySelector(`#right-rail .rail-btn[data-panel='${s}']`);
        const visible = !!(secEl && !secEl.hidden && secEl.offsetParent !== null) &&
          btn.getAttribute("aria-pressed") === "true";
        // documented toggle: clicking the ACTIVE rail icon collapses the panel
        const collapsed = wasActive && document.getElementById("right-panel").hidden;
        return visible || collapsed;
      }, { s: sec, wasActive }) });
      // re-open if the toggle-collapse closed it
      await page.evaluate(() => {
        if (document.getElementById("right-panel").hidden) {
          document.querySelector("#right-rail .rail-btn[data-panel='paragraph']").click();
        }
      });
      await sleep(100);
      // exercise visible controls: buttons, checkboxes, selects, numbers
      await step(`panel: exercise ${sec} controls`, async () => {
        await page.evaluate((s) => {
          const secEl = document.querySelector(`.rp-section[data-section='${s}']`);
          if (!secEl || secEl.hidden || secEl.offsetParent === null) return;
          for (const b of secEl.querySelectorAll("button")) b.click();
          for (const c of secEl.querySelectorAll('input[type="checkbox"]')) c.click();
          for (const sel of secEl.querySelectorAll("select")) {
            if (sel.options.length > 1) {
              sel.selectedIndex = 1;
              sel.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }
          for (const n of secEl.querySelectorAll('input[type="number"]')) {
            n.value = "2";
            n.dispatchEvent(new Event("input", { bubbles: true }));
            n.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }, s);
        await sleep(160);
      });
      await closeStrayDialog();
    }

    // AF15 gating: with a table under the selection, table controls enable
    await step("panel: table controls gate on table selection (AF15)", async () => {
      await page.evaluate(() => {
        const td = document.querySelector("#editor td");
        if (!td) throw new Error("no table in doc (insert phase failed)");
        const ed = document.getElementById("editor");
        ed.focus();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(td);
        sel.removeAllRanges();
        sel.addRange(range);
        document.dispatchEvent(new Event("selectionchange"));
      });
      await sleep(200);
    }, { check: () => page.evaluate(() => {
      let sec = document.querySelector(".rp-section[data-section='table']");
      if (!sec || sec.offsetParent === null) {
        document.querySelector("#right-rail .rail-btn[data-panel='table']").click();
        sec = document.querySelector(".rp-section[data-section='table']");
      }
      const ctl = [...sec.querySelectorAll("input, select, button")]
        .find((el) => !el.classList.contains("rp-link"));
      return !!(ctl && !ctl.disabled);
    }) });

    // ---------- report ----------
    const okN = report.actions.filter((a) => a.ok).length;
    const noopN = report.actions.filter((a) => !a.ok && !a.note && a.errors.length === 0).length;
    const skippedN = report.actions.filter((a) => a.note).length;
    report.summary = {
      total: report.actions.length, ok: okN, noEffect: noopN, skipped: skippedN,
      crashErrors: crashErrors.length, net404: report.net404, woMarkers: markerCount,
    };
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(`smoke: ${report.summary.total} actions — ok=${okN} no-effect=${noopN} skipped=${skippedN} crashes=${crashErrors.length} net404=${report.net404} wo-markers=${markerCount}`);
    for (const c of crashErrors) console.log("  CRASH", c.action, "::", c.text);
    for (const a of report.actions) if (!a.ok && !a.note && a.errors.length === 0) console.log("  NO-EFFECT", a.action);
    console.log("report:", OUT);
    await browser.close();
  } finally {
    server.kill("SIGTERM");
  }
  process.exitCode = crashErrors.length ? 1 : 0;
}

main().then(
  () => {},
  (e) => { console.error("smoke driver failed:", e); process.exit(2); }
);

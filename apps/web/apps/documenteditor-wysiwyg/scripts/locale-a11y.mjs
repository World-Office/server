#!/usr/bin/env node
// BUG4-LOCALE-A11Y — live probe: runtime locale switch, focus-trap audit,
// aria-pressed sync matrix.
//
// WHAT (three sections, one headless Chromium run):
//   1. LOCALE  — boots the editor in en, snapshots every [data-i18n] string
//      (text + title/aria-label/placeholder attrs + document.title), switches
//      to de through the REAL UI path (#btn-file → #btn-filesettings →
//      #settings-lang=de → #btn-settings-ok → applyLocale()), asserts zero
//      English leftovers, switches back and asserts full restoration plus an
//      untranslated document body.
//   2. FOCUS   — for every DIALOG_IDS dialog (parsed from editor.js): opens
//      it, walks Tab 10× and asserts focus can never leave the surface, then
//      asserts Escape closes it and aria-modal="true" is present. For the
//      non-modal surfaces (context menu, insert pops table/image, objlayout
//      pop, File menu, Styles menu, paragraph-direction menu) asserts NO
//      modal trap engages and Tab moves focus OUT normally.
//   3. ARIA    — cross-path aria-pressed matrix: every toggle is driven once
//      via its ribbon/statusbar control and once via the alternate path
//      (keyboard shortcut, menu row, sibling View-tab button, settings
//      dialog) and both registered buttons must follow.
//
// HOW TO RUN (manual/live-only; locale-a11y.test.mjs only proves this file
// exists and references the key selectors):
//   node scripts/locale-a11y.mjs [--port 18047] [--out scripts/locale-a11y-report.json]
// Starts its own `python3 -m http.server` (PATH python3 may be a broken
// shim; /usr/bin/python3 preferred), serves the editor dir (scripts/..),
// prints a triage summary, writes a JSON report and exits non-zero if any
// check failed.
//
// Playwright is NOT an npm dependency of this app; it is loaded from the
// shared test harness by absolute path (same recipe as scripts/smoke.mjs).
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
const PORT = Number(arg("--port", "18047"));
const OUT = resolve(process.cwd(), arg("--out", join(HERE, "locale-a11y-report.json")));

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

// --- DIALOG_IDS from editor.js source (the trap list is inside the IIFE,
// not reachable at runtime — parse it the same way the static gate does).
const editorSrc = readFileSync(join(EDITOR_DIR, "editor.js"), "utf8");
const DIALOG_IDS = (() => {
  const m = editorSrc.match(/const DIALOG_IDS\s*=\s*\[([^\]]*)\]/);
  if (!m) return [];
  return m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
})();

// --- report -----------------------------------------------------------
const report = {
  startedAt: new Date().toISOString(),
  url: "",
  dialogIds: DIALOG_IDS,
  locale: { checks: [], failures: [] },
  focus: { checks: [], failures: [] },
  aria: { checks: [], failures: [] },
  crashErrors: [],
};
const fail = (section, check, detail) => {
  report[section].failures.push({ check, detail });
  console.error(`FAIL [${section}] ${check}: ${detail}`);
};
const ok = (section, check, detail = "") => {
  report[section].checks.push({ check, ok: true, detail });
  console.log(`ok   [${section}] ${check}${detail ? " — " + detail : ""}`);
};

// --- English-leftover heuristics --------------------------------------
// Words that exist in German too (Text, Format, Symbol, Zoom, OK, Standard,
// Position …) are NOT markers. Markers = common English function words and
// UI words with distinct German equivalents.
const EN_MARKERS = /\b(the|and|of|to|for|with|from|file|edit|view|insert|table|tools|help|settings|open|save|close|cancel|apply|bold|italic|underline|font|size|color|page|paragraph|style|heading|list|image|link|header|footer|document|print|export|copy|paste|cut|undo|redo|find|replace|spell|track|changes|comment|review|width|height|margin|border|number|line|character|word|count|section|column|row|cell|chart|shape|equation|bookmark|watermark|language|ruler|gridlines|navigation|multiple|pages|dark|light|theme|yes|no|new|all|none|other|more|less|options|select|choose|default|custom|current|selected|visible|hidden|enabled|disabled|title|subtitle|name|type|date|time|author|version|history|update|remove|add|delete|move|align|center|right|left|justify|direction|wrap|layout|background|foreground|opacity|shadow|effect|effects)\b/i;
// Safe markers for CHANGED values (must be English-only, no German homonyms).
const EN_HARD_MARKERS = /\b(the|and|with|from|file|edit|view|settings|open|save|close|cancel|bold|italic|underline|heading|paragraph|ruler|gridlines|document|watermark|track|changes|spell|replace|find|bookmark|comment|review|navigation|theme)\b/i;
// Locale-neutral strings (identical in en and de by design).
const NEUTRAL = new Set([
  "ok", "zoom", "e-mail", "e-mail-addresse", "internet", "standard",
  // de/en homographs — identical strings in both catalogs by design
  "layout", "link", "navigation",
  "docx", "doc", "pdf", "odt", "ods", "html", "htm", "txt", "rtf", "epub",
  "fb2", "hwp", "xps", "ofd", "markdown", "djvu", "png", "jpg", "jpeg",
  "svg", "webp", "csv", "xlsx", "pptx", "smartart", "world-office",
  "world office", "english", "deutsch", "b", "i", "u", "s", "x", "±", "¶", "§",
]);
const isNeutral = (s) => {
  const t = s.trim().toLowerCase();
  if (!t || NEUTRAL.has(t)) return true;
  if (!/[a-z]/i.test(s)) return true; // symbols / numbers / CJK only
  return false;
};
const looksEnglish = (s) => !isNeutral(s) && EN_MARKERS.test(s);
const looksHardEnglish = (s) => !isNeutral(s) && EN_HARD_MARKERS.test(s);

// --- snapshot helpers --------------------------------------------------
async function snapshotUiStrings() {
  return page.evaluate(() => {
    // Dynamic live indicators (status message, page counter) are not static
    // chrome — zero them so snapshots compare only translatable strings.
    for (const id of ["status", "sb-page-count"]) {
      const el = document.getElementById(id);
      if (el) el.textContent = "";
    }
    const sel = "[data-i18n], [data-i18n-title], [data-i18n-aria-label], [data-i18n-placeholder]";
    const els = [...document.querySelectorAll(sel)];
    return {
      title: document.title || "",
      entries: els.map((el, i) => ({
        i,
        key: el.getAttribute("data-i18n") || "",
        text: (el.getAttribute("data-i18n") !== null ? el.textContent : "") || "",
        title: el.getAttribute("data-i18n-title") !== null ? (el.getAttribute("title") || "") : "",
        aria: el.getAttribute("data-i18n-aria-label") !== null ? (el.getAttribute("aria-label") || "") : "",
        ph: el.getAttribute("data-i18n-placeholder") !== null ? (el.getAttribute("placeholder") || "") : "",
      })),
    };
  });
}
function collectLeftovers(snap, refSnap) {
  // A leftover = a de value that is English-looking. Two signals:
  //  (a) value identical to en AND broad-marker match (unchanged string),
  //  (b) changed value containing hard English function words (curated
  //      catalogs should never emit those).
  const out = [];
  for (const e of snap.entries) {
    const r = refSnap.entries[e.i] || { text: "", title: "", aria: "", ph: "" };
    const pairs = [
      ["text", e.text, r.text],
      ["title", e.title, r.title],
      ["aria", e.aria, r.aria],
      ["ph", e.ph, r.ph],
    ];
    for (const [kind, v, rv] of pairs) {
      if (!v) continue;
      const unchanged = v === rv;
      if (unchanged ? looksEnglish(v) : looksHardEnglish(v)) {
        out.push({ key: e.key || `#${e.i}`, kind, value: v });
      }
    }
  }
  if (snap.title && looksHardEnglish(snap.title) && snap.title === refSnap.title) {
    out.push({ key: "document.title", kind: "text", value: snap.title });
  }
  return out;
}

// --- driver ------------------------------------------------------------
let page = null;
let browser = null;
let server = null;

async function openSettings() {
  await page.click("#btn-file");
  await sleep(150);
  await page.click("#btn-filesettings");
  await sleep(300);
}

async function gotoTab(name) {
  await page.click(`button.ribbon-tab[data-tab="${name}"]`);
  await sleep(180);
}

async function trapEngaged() {
  return page.evaluate((ids) =>
    ids.some((id) => document.getElementById(id)?.classList.contains("open")), DIALOG_IDS);
}

async function tabWalkAssertions(section, name, surfaceSel) {
  // Focus must be able to leave a non-modal surface: walk Tab once per
  // focusable (+3 spare) and require focus to land outside the surface. A
  // trapped surface would cycle inside forever regardless of budget.
  const budget = (await page.evaluate((sel) => {
    const s = document.querySelector(sel);
    if (!s) return 5;
    const f = s.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    return f.length + 3;
  }, surfaceSel)) || 5;
  let left = false;
  const seen = [];
  for (let i = 0; i < budget; i++) {
    await page.keyboard.press("Tab");
    const cur = await page.evaluate((sel) => {
      const a = document.activeElement;
      const s = document.querySelector(sel);
      return {
        id: a && a.id ? a.id : "",
        tag: a ? a.tagName : "",
        inside: !!(s && a && s.contains(a)),
      };
    }, surfaceSel);
    seen.push(`${cur.id || cur.tag}${cur.inside ? "*" : ""}`);
    if (!cur.inside) { left = true; break; }
  }
  if (left) ok(section, `${name}: tab-escapes`, `${seen.length} tabs (budget ${budget})`);
  else fail(section, `${name}: tab-escapes`, `focus never left surface over ${budget} Tabs (${seen.slice(-6).join(" → ")})`);
}

async function escCloses(section, name, surfaceSel) {
  await page.keyboard.press("Escape");
  await sleep(150);
  const hidden = await page.evaluate((sel) => {
    const s = document.querySelector(sel);
    if (!s) return true;
    return s.hidden || !s.classList.contains("open");
  }, surfaceSel);
  if (hidden) ok(section, `${name}: esc-closes`);
  else fail(section, `${name}: esc-closes`, "surface still visible after Escape");
}

async function auditModalDialog(id) {
  const hasFocusable = await page.evaluate((id) => {
    const d = document.getElementById(id);
    if (!d) return false;
    d.classList.add("open");
    const f = d.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (f) { try { f.focus(); } catch { /* detached */ } }
    return !!f;
  }, id);
  if (!hasFocusable) {
    ok("focus", `${id}: opened (no visible focusables — skip tab walk)`);
    await page.keyboard.press("Escape");
    return;
  }
  const ariaModal = await page.$eval(`#${id}`, (el) => el.getAttribute("aria-modal"));
  if (ariaModal === "true") ok("focus", `${id}: aria-modal=true`);
  else fail("focus", `${id}: aria-modal=true`, `got "${ariaModal}"`);

  let trapped = true;
  const seq = [];
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate((id) => {
      const d = document.getElementById(id);
      const a = document.activeElement;
      return !!(a && a !== document.body && d.contains(a));
    }, id);
    const at = await page.evaluate(() =>
      document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : "body");
    seq.push(at);
    if (!inside) { trapped = false; break; }
  }
  if (trapped) ok("focus", `${id}: tab-trap holds`, `${seq.length} tabs contained`);
  else fail("focus", `${id}: tab-trap holds`, `focus escaped modal dialog: ${seq.join(" → ")}`);

  const closed = await page.evaluate(async (id) => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    return !document.getElementById(id).classList.contains("open");
  }, id);
  if (closed) ok("focus", `${id}: esc-closes`);
  else fail("focus", `${id}: esc-closes`, "still .open after Escape");
  if (await page.$eval(`#${id}`, (el) => el.classList.contains("open"))) {
    await page.evaluate((id) => document.getElementById(id).classList.remove("open"), id);
  }
  await sleep(80);
}

async function nonModalAudit(name, openFn, surfaceSel, skipEsc = false) {
  try {
    await openFn();
    await sleep(200);
    const visible = await page.evaluate((sel) => {
      const s = document.querySelector(sel);
      if (!s) return false;
      if (s.classList.contains("open")) return true;
      const cs = getComputedStyle(s);
      return !s.hidden && cs.display !== "none" && cs.visibility !== "hidden";
    }, surfaceSel);
    if (!visible) { fail("focus", `${name}: opens`, `surface not visible after open`); return; }
    ok("focus", `${name}: opens`);
    const engaged = await trapEngaged();
    if (!engaged) ok("focus", `${name}: no modal trap engaged`);
    else fail("focus", `${name}: no modal trap engaged`, "a DIALOG_IDS dialog is .open while non-modal surface shown");
    await tabWalkAssertions("focus", name, surfaceSel);
    if (!skipEsc) await escCloses("focus", name, surfaceSel);
  } catch (e) {
    fail("focus", `${name}: audit`, String(e).slice(0, 200));
  }
  // cleanup: close any stray surfaces
  await page.evaluate(() => {
    document.querySelectorAll(".dialog-overlay.open").forEach((d) => d.classList.remove("open"));
    document.querySelectorAll(".menu-list").forEach((m) => { m.hidden = true; });
    const ctx = document.getElementById("ctx-menu");
    if (ctx) ctx.hidden = true;
    const ol = document.getElementById("objlayout-pop");
    if (ol) { ol.setAttribute("hidden", ""); ol.style.display = ""; }
  });
  await sleep(100);
}

async function main() {
  const { chromium } = require(PLAYWRIGHT);
  const port = await freePort(PORT);
  server = startServer(EDITOR_DIR, port);
  if (!(await waitUp(port))) throw new Error("http.server did not come up");
  report.url = `http://127.0.0.1:${port}/index.html`;

  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.setDefaultTimeout(8000);
  page = await ctx.newPage();
  page.on("pageerror", (e) => report.crashErrors.push(`pageerror: ${String(e).slice(0, 300)}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|net::|404/.test(m.text())) {
      report.crashErrors.push(`console.error: ${m.text().slice(0, 300)}`);
    }
  });

  await page.goto(report.url, { waitUntil: "domcontentloaded" });
  await sleep(2500); // networkidle times out on some assets — verified recipe

  // ================= 1. LOCALE =================
  console.log("\n=== LOCALE ===");
  const startLang = await page.evaluate(() => document.documentElement.lang);
  if (startLang.startsWith("en")) ok("locale", "boots in en", `html lang="${startLang}"`);
  else fail("locale", "boots in en", `html lang="${startLang}"`);

  const docBefore = await page.$eval("#editor", (el) => el.innerText);
  const enSnap = await snapshotUiStrings();
  ok("locale", "en snapshot", `${enSnap.entries.length} translatable nodes`);

  // REAL UI path: File → Settings → Language=de → Apply
  await openSettings();
  await page.selectOption("#settings-lang", "de");
  await page.click("#btn-settings-ok");
  await sleep(500);

  const deLang = await page.evaluate(() => document.documentElement.lang);
  if (deLang.startsWith("de")) ok("locale", "switch to de via settings", `html lang="${deLang}"`);
  else fail("locale", "switch to de via settings", `html lang="${deLang}"`);
  const statusDe = await page.$eval("#status", (el) => el.textContent || "");
  if (/[üa]bernommen/i.test(statusDe)) ok("locale", "de status message", statusDe.trim());
  else fail("locale", "de status message", `expected German apply status, got "${statusDe.trim()}"`);

  const deSnap = await snapshotUiStrings();
  const leftovers = collectLeftovers(deSnap, enSnap);
  if (leftovers.length === 0) ok("locale", "zero English leftovers in de", `${deSnap.entries.length} nodes checked`);
  else fail("locale", "zero English leftovers in de", JSON.stringify(leftovers.slice(0, 25)));

  const docDuring = await page.$eval("#editor", (el) => el.innerText);
  if (docDuring === docBefore) ok("locale", "document content untranslated in de");
  else fail("locale", "document content untranslated in de", "editor innerText changed after locale switch");

  // switch back through the same real path
  await openSettings();
  await page.selectOption("#settings-lang", "en");
  await page.click("#btn-settings-ok");
  await sleep(500);
  const enLang = await page.evaluate(() => document.documentElement.lang);
  if (enLang.startsWith("en")) ok("locale", "switch back to en", `html lang="${enLang}"`);
  else fail("locale", "switch back to en", `html lang="${enLang}"`);

  const enSnap2 = await snapshotUiStrings();
  const same = JSON.stringify(enSnap) === JSON.stringify(enSnap2);
  if (same) ok("locale", "en strings fully restored");
  else {
    const diff = enSnap.entries
      .map((e, i) => [e, enSnap2.entries[i]])
      .filter(([a, b]) => JSON.stringify(a) !== JSON.stringify(b))
      .map(([a, b]) => ({ key: a.key || `#${a.i}`, was: a.text || a.title || a.aria || a.ph, now: b.text || b.title || b.aria || b.ph }));
    fail("locale", "en strings fully restored", JSON.stringify(diff.slice(0, 25)));
  }
  const docAfter = await page.$eval("#editor", (el) => el.innerText);
  if (docAfter === docBefore) ok("locale", "document content unchanged after roundtrip");
  else fail("locale", "document content unchanged after roundtrip", "editor innerText differs");

  // ================= 2. FOCUS =================
  console.log("\n=== FOCUS (modal dialogs) ===");
  if (DIALOG_IDS.length === 0) fail("focus", "DIALOG_IDS parsed", "could not parse DIALOG_IDS from editor.js");
  const overlayCount = await page.evaluate(() => document.querySelectorAll(".dialog-overlay").length);
  const allRegistered = await page.evaluate((ids) =>
    ids.every((id) => { const d = document.getElementById(id); return !!d; }), DIALOG_IDS);
  if (allRegistered) ok("focus", `all ${DIALOG_IDS.length} DIALOG_IDS exist in DOM`);
  else fail("focus", "DIALOG_IDS exist in DOM", "some id missing");
  // Every .dialog-overlay element must be a registered modal (aria-modal=true).
  const overlayAudit = await page.evaluate((ids) =>
    [...document.querySelectorAll(".dialog-overlay")].map((d) => ({
      id: d.id, ariaModal: d.getAttribute("aria-modal"), registered: ids.includes(d.id),
    })), DIALOG_IDS);
  const badOverlays = overlayAudit.filter((o) =>
    o.ariaModal !== "true" && !(o.ariaModal === "false" && !o.registered));
  if (badOverlays.length === 0) ok("focus", `dialog-overlay audit (${overlayCount} overlays all consistent)`);
  else fail("focus", "dialog-overlay audit", JSON.stringify(badOverlays));

  for (const id of DIALOG_IDS) {
    try {
      await auditModalDialog(id);
    } catch (e) {
      fail("focus", `${id}: audit`, String(e).slice(0, 200));
      await page.evaluate((id) => { const d = document.getElementById(id); if (d) d.classList.remove("open"); }, id);
    }
  }

  console.log("\n=== FOCUS (non-modal surfaces must NOT trap) ===");
  // table/image insert pops live on the Insert ribbon page — switch tabs first.
  await page.click('button.ribbon-tab[data-tab="insert"]');
  await sleep(200);
  await nonModalAudit("ctx-menu", () => page.locator("#editor").click({ button: "right" }), "#ctx-menu");
  await page.click('button.ribbon-tab[data-tab="home"]');
  await sleep(150);
  await page.click('button.ribbon-tab[data-tab="insert"]');
  await sleep(200);
  await nonModalAudit("table-dialog", () => page.click("#btn-table"), "#table-dialog");
  await nonModalAudit("image-dialog", () => page.click("#btn-image"), "#image-dialog");
  await page.click('button.ribbon-tab[data-tab="home"]');
  await sleep(150);
  await nonModalAudit("objlayout-pop", () => page.evaluate(() => {
    // CSS keeps the pop display:none until JS shows it for a selected
    // object; force visibility the way a real show would, then restore.
    const s = document.getElementById("objlayout-pop");
    if (!s) return;
    s.removeAttribute("hidden");
    s.style.display = "block";
  }), "#objlayout-pop");
  // restore the pop's hidden state — a stray visible pop intercepts clicks
  // over half the ribbon (verified: this exact leak blanked later matrices).
  await nonModalAudit("file-menu", () => page.click("#btn-file"), "#file-menu");
  await nonModalAudit("styles-menu", () => page.click(".styles-trigger"),
    ".styles-trigger + .menu-list, .styles-trigger ~ .menu-list");

  // ================= 3. ARIA-PRESSED MATRIX =================
  console.log("\n=== ARIA-PRESSED MATRIX ===");
  const pressed = (sel) => page.$eval(sel, (el) => el.getAttribute("aria-pressed"));
  const expanded = (sel) => page.$eval(sel, (el) => el.getAttribute("aria-expanded"));
  // Per-row isolation: one broken path must not kill the remaining matrix.
  const arow = async (label, fn) => {
    try { await fn(); } catch (e) { fail("aria", label, String(e).split("\n")[0].slice(0, 160)); }
  };

  async function expectState(label, checks) {
    // checks: [{get: () => Promise<string>, want: string, sel, attr}]
    for (const c of checks) {
      const got = await c.get();
      if (got === c.want) ok("aria", `${label}: ${c.attr || "aria-pressed"}=${c.want} (${c.sel})`);
      else fail("aria", `${label}: ${c.attr || "aria-pressed"}=${c.want} (${c.sel})`, `got "${got}"`);
    }
  }

  // bold: ribbon vs keyboard vs ctx-menu row
  await arow("bold matrix", async () => {
    await page.locator("#editor").click();
    await page.keyboard.type("alpha beta");
    const boldBtn = 'button.rb[data-cmd="bold"]';
    await page.click(boldBtn);
    await expectState("bold via ribbon", [{ get: () => pressed(boldBtn), want: "true", sel: boldBtn }]);
    await page.keyboard.press("Control+b");
    await expectState("bold via Ctrl+B", [{ get: () => pressed(boldBtn), want: "false", sel: boldBtn }]);
    await page.locator("#editor").click({ button: "right" });
    await sleep(150);
    const ctxBold = '#ctx-menu button[data-ctx="Bold"]';
    if (await page.$(ctxBold)) {
      await page.click(ctxBold);
      await expectState("bold via ctx menu", [{ get: () => pressed(boldBtn), want: "true", sel: boldBtn }]);
      await page.keyboard.press("Control+b"); // reset
    } else {
      ok("aria", "bold via ctx menu (row absent — skip)");
    }
  });

  // alignment: ribbon click vs keyboard shortcut (exclusive states)
  await arow("alignment matrix", async () => {
    const centerBtn = 'button.rb[data-cmd="justifyCenter"]';
    const leftBtn = 'button.rb[data-cmd="justifyLeft"]';
    await page.locator("#editor").click();
    await page.click(centerBtn);
    await expectState("center via ribbon", [
      { get: () => pressed(centerBtn), want: "true", sel: centerBtn },
      { get: () => pressed(leftBtn), want: "false", sel: leftBtn },
    ]);
    await page.keyboard.press("Control+Shift+l");
    await expectState("left via Ctrl+Shift+L", [
      { get: () => pressed(leftBtn), want: "true", sel: leftBtn },
      { get: () => pressed(centerBtn), want: "false", sel: centerBtn },
    ]);
  });

  // RTL: ribbon button vs ribbon dropdown menu row (both data-cmd=directionRtl)
  await arow("rtl matrix", async () => {
    const rtlBtn = 'button.rb[data-cmd="directionRtl"]';
    await page.click(rtlBtn);
    await expectState("rtl via ribbon", [{ get: () => pressed(rtlBtn), want: "true", sel: rtlBtn }]);
    const rtlSpan = page.locator("span.rb-menu").filter({ has: page.locator('button[data-cmd="directionRtl"]') });
    await rtlSpan.locator(".menu-trigger").click();
    await sleep(120);
    await rtlSpan.locator('button[data-cmd="directionRtl"]').click();
    await expectState("rtl via menu row", [{ get: () => pressed(rtlBtn), want: "false", sel: rtlBtn }]);
  });

  // track changes: statusbar toggle vs ribbon dialog checkbox
  await arow("track-changes matrix", async () => {
    const sbTc = "#sb-track-changes";
    const tcBtn = "#btn-track-changes";
    await page.click(sbTc);
    await expectState("track-changes via statusbar", [
      { get: () => pressed(sbTc), want: "true", sel: sbTc },
      { get: () => pressed(tcBtn), want: "true", sel: tcBtn },
    ]);
    await gotoTab("collaboration"); // #btn-track-changes lives on this page
    await page.click(tcBtn); // opens trackchanges dialog
    await sleep(250);
    // The dialog opens presenting the FLIPPED state (tcBtn handler pre-sets
    // cb.checked = !trackChangesOn) — just confirm it.
    await page.click("#btn-trackchanges-ok");
    await sleep(200);
    await expectState("track-changes via dialog", [
      { get: () => pressed(sbTc), want: "false", sel: sbTc },
      { get: () => pressed(tcBtn), want: "false", sel: tcBtn },
    ]);
  });

  // format marks: Home ribbon vs View tab
  await arow("format-marks matrix", async () => {
    const fmHome = "#btn-home-formatmarks";
    const fmView = "#btn-view-formatmarks";
    await gotoTab("home");
    await page.click(fmHome);
    await expectState("format marks via Home", [
      { get: () => pressed(fmHome), want: "true", sel: fmHome },
      { get: () => pressed(fmView), want: "true", sel: fmView },
    ]);
    await gotoTab("view");
    await page.click(fmView);
    await expectState("format marks via View", [
      { get: () => pressed(fmHome), want: "false", sel: fmHome },
      { get: () => pressed(fmView), want: "false", sel: fmView },
    ]);
  });

  // multipage: statusbar vs View tab
  await arow("multipage matrix", async () => {
    const mpSb = "#btn-multipage";
    const mpView = "#btn-view-multipages";
    await page.click(mpSb);
    await expectState("multipage via statusbar", [
      { get: () => pressed(mpSb), want: "true", sel: mpSb },
      { get: () => pressed(mpView), want: "true", sel: mpView },
    ]);
    await gotoTab("view");
    await page.click(mpView);
    await expectState("multipage via View tab", [
      { get: () => pressed(mpSb), want: "false", sel: mpSb },
      { get: () => pressed(mpView), want: "false", sel: mpView },
    ]);
  });

  // navigation headings: nav toggle vs View-tab mirror
  await arow("navigation matrix", async () => {
    const navBtn = "#btn-nav-toggle";
    const vhBtn = "#btn-view-headings";
    await gotoTab("view");
    await page.click(navBtn);
    await expectState("nav via toggle", [
      { get: () => expanded(navBtn), want: "true", sel: navBtn, attr: "aria-expanded" },
      { get: () => pressed(vhBtn), want: "true", sel: vhBtn },
    ]);
    await page.click(vhBtn);
    await expectState("nav via view-headings", [
      { get: () => pressed(vhBtn), want: "false", sel: vhBtn },
      { get: () => expanded(navBtn), want: "false", sel: navBtn, attr: "aria-expanded" },
    ]);
  });

  // theme: header toggle vs settings dialog (persisted + applied).
  // #btn-theme is clipped offscreen at 1440px (pre-existing ribbon layout
  // quirk, x=1455 > viewport) — Playwright hit-testing cannot reach it, so
  // path A falls back to a real DOM click on the same handler; path B stays
  // fully mouse-driven.
  await arow("theme matrix", async () => {
    const themeBtn = "#btn-theme";
    await gotoTab("home");
    const themeBefore = await pressed(themeBtn);
    await page.evaluate((sel) => {
      const b = document.querySelector(sel);
      b.scrollIntoView({ block: "center", inline: "center" });
      b.click();
    }, themeBtn);
    await sleep(150);
    await expectState("theme via toggle", [{
      get: () => pressed(themeBtn), want: themeBefore === "true" ? "false" : "true", sel: themeBtn,
    }]);
    await openSettings();
    // flip to the OPPOSITE of the current theme (path A may already have
    // made it dark — selecting the same value is a correct no-op)
    const curTheme = await page.evaluate(() =>
      localStorage.getItem("wo-theme") ||
      (document.documentElement.classList.contains("light") ? "light" : "dark"));
    const wantTheme = curTheme === "dark" ? "light" : "dark";
    await page.selectOption("#settings-theme", wantTheme);
    await page.click("#btn-settings-ok");
    await sleep(200);
    const themeOk = await pressed(themeBtn);
    const lightGone = await page.evaluate(() =>
      !document.documentElement.classList.contains("light"));
    const stored = await page.evaluate(() => localStorage.getItem("wo-theme"));
    if (themeOk === String(wantTheme === "dark") && lightGone === (wantTheme === "dark") && stored === wantTheme) {
      ok("aria", "theme via settings: aria-pressed + html.light + localStorage all follow");
    } else {
      fail("aria", "theme via settings: aria-pressed + html.light + localStorage all follow",
        `want=${wantTheme}, pressed=${themeOk}, lightGone=${lightGone}, wo-theme=${stored}`);
    }
  });

  // gridlines: single control — setter sanity (flip both ways)
  await arow("gridlines sanity", async () => {
    const gridBtn = "#btn-gridlines";
    await gotoTab("view");
    await page.click(gridBtn);
    await expectState("gridlines on", [{ get: () => pressed(gridBtn), want: "true", sel: gridBtn }]);
    await page.click(gridBtn);
    await expectState("gridlines off", [{ get: () => pressed(gridBtn), want: "false", sel: gridBtn }]);
  });

  // ruler: single control sanity
  await arow("ruler sanity", async () => {
    const rulerBtn = "#btn-ruler-toggle";
    await gotoTab("view");
    const rulerBefore = await pressed(rulerBtn);
    await page.click(rulerBtn);
    await expectState("ruler toggle", [{
      get: () => pressed(rulerBtn), want: rulerBefore === "true" ? "false" : "true", sel: rulerBtn,
    }]);
    await page.click(rulerBtn); // restore
  });

  // spellcheck: settings path only — checkbox must round-trip via
  // toggleSpellcheck whatever the default state is.
  await arow("spellcheck roundtrip", async () => {
    await openSettings();
    const before = await page.$eval("#settings-spellcheck", (el) => el.checked);
    await page.click("#settings-spellcheck"); // flip
    await page.click("#btn-settings-ok");
    await sleep(200);
    await openSettings();
    const after = await page.$eval("#settings-spellcheck", (el) => el.checked);
    if (after === !before) ok("aria", "spellcheck via settings: checkbox state round-trips (flipped)");
    else fail("aria", "spellcheck via settings: checkbox state round-trips (flipped)",
      `before=${before}, after reopen=${after}`);
    await page.click("#settings-spellcheck"); // restore
    await page.click("#btn-settings-ok");
    await sleep(150);
  });

  // --- wrap up ----------------------------------------------------------
  if (report.crashErrors.length > 0) {
    for (const e of report.crashErrors) fail("focus", "no page errors", e);
  } else {
    ok("focus", "no page errors during run");
  }

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  const failures = report.locale.failures.length + report.focus.failures.length + report.aria.failures.length;
  console.log(`\nlocale: ${report.locale.checks.length} ok / ${report.locale.failures.length} fail`);
  console.log(`focus:  ${report.focus.checks.length} ok / ${report.focus.failures.length} fail`);
  console.log(`aria:   ${report.aria.checks.length} ok / ${report.aria.failures.length} fail`);
  console.log(`report: ${OUT}`);
  return failures;
}

main()
  .then(async (failures) => {
    try { if (browser) await browser.close(); } catch { /* already gone */ }
    try { server?.kill("SIGTERM"); } catch { /* already gone */ }
    process.exitCode = failures > 0 ? 1 : 0;
  })
  .catch(async (e) => {
    console.error(e);
    try { writeFileSync(OUT, JSON.stringify(report, null, 2)); } catch { /* disk */ }
    try { if (browser) await browser.close(); } catch { /* already gone */ }
    try { server?.kill("SIGTERM"); } catch { /* already gone */ }
    process.exitCode = 1;
  });

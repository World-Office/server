#!/usr/bin/env node
// surfaces/right-panel.cjs — right settings-panel parity surface (react-native
// rewrite of the WYSIWYG-era #right-panel/rail surface).
//
// The react editor implements the right panel via DocumentStore:
//   - openers are ribbon buttons (per-tab); clicking one runs
//     toggleRightPanel(panel) which sets activeRightPanel + rightMenuVisible
//   - the panel element carries data-wo-right-panel={activeRightPanel}
//     (Viewport.tsx), closed == "" or element not visible
//   - STRICT TOGGLE: clicking the SAME opener again closes it
//     (toggleRightPanel: active === panel -> null)
//   - SWITCH: opening panel B while A is open shows only B
// This surface asserts those invariants on the same provably-working openers
// the contract layer already PROMOTED (dom-mutation [data-wo-right-panel]
// contracts), so it verifies the OO parity round-trip/switch behavior the
// contracts do not. Panels/buttons are read live from the committed manifest
// (token -> sel/woTab/marker).
//
// Usage: node tests/parity/surfaces/right-panel.cjs
'use strict';
const path = require('path');
const fs = require('fs');

const LOCAL_BIN = path.join(__dirname, '..', '..', 'target', 'debug', 'wo-docserver');
const MAIN_BIN = '/home/weiss/git/World-Office/server/target/debug/wo-docserver';
if (!process.env.WO_DOCSERVER_BIN && !fs.existsSync(LOCAL_BIN) && fs.existsSync(MAIN_BIN)) {
  process.env.WO_DOCSERVER_BIN = MAIN_BIN;
}
if (!process.env.EDITOR_UI_DIR || !fs.existsSync(path.join(process.env.EDITOR_UI_DIR, 'word', 'index.html'))) {
  const stage = fs.mkdtempSync('/tmp/wo-parity-ui-');
  fs.symlinkSync('/home/weiss/git/World-Office/server/apps/web/apps/documenteditor-react/dist', path.join(stage, 'word'));
  process.env.EDITOR_UI_DIR = stage;
}

const boot = require('../_boot.cjs');

// Read every promoted panel-opener contract (selector + woTab + marker) from
// the committed manifest, keyed by marker id. These already PASS as contracts;
// the surface re-checks their open/close/switch behavior.
const MANIFEST = path.join(__dirname, '..', 'word-parity-contracts.json');
function openers() {
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const rows = Array.isArray(m.entries) ? m.entries : Object.values(m.entries);
  const seen = new Map();
  for (const r of rows) {
    const c = r.contract;
    if (!c) continue;
    const a = c.assertion;
    if (!a || typeof a !== 'object' || a.kind !== 'dom-mutation') continue;
    const mm = /data-wo-right-panel="([^"]+)"/.exec(a.selector || '');
    if (!mm) continue;
    const id = mm[1];
    const sel = c.sel || c.selector;
    if (!sel || sel.startsWith('key') || sel.startsWith('fluent-')) continue; // needs clickability
    if (!seen.has(id)) seen.set(id, { id, sel, woTab: c.woTab || '' });
  }
  return [...seen.values()];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function visible(page, sel) {
  const n = await page.$(sel);
  if (!n) return false;
  const box = await n.boundingBox().catch(() => null);
  return !!box && box.width > 0 && box.height > 0;
}

(async () => {
  const OPS = openers();
  const results = {};
  let rc = 0;

  await boot.ensureServer();
  const browser = await boot.launchBrowser();
  const { page } = await boot.openEditor(browser, boot.BASE);
  await page.locator('#editor').waitFor({ timeout: 15000 }).catch(() => {});

  // cycle through a representative spread (one per distinct woTab, up to 4)
  const picked = [];
  const byTab = new Map();
  for (const o of OPS) if (!byTab.has(o.woTab)) byTab.set(o.woTab, o);
  for (const o of byTab.values()) { picked.push(o); if (picked.length >= 4) break; }

  for (const o of picked) {
    const mark = `[data-wo-right-panel="${o.id}"]`;
    const byId = new Map(OPS.map((x) => [x.id, x]));
    const click = async () => {
      try { await page.waitForSelector(o.sel, { timeout: 10000, state: "attached" }); }
      catch { throw new Error(`opener ${o.sel} not found`); }
      await page.locator(o.sel).first().click({ timeout: 4000 });
    };
    // open
    try {
      // close whatever panel is still open (an open drawer overlays the
      // ribbon tab bar and makes the next tab un-actionable)
      const openId = await page.evaluate(() =>
        (document.querySelector('[data-wo-right-panel]')?.getAttribute('data-wo-right-panel') || ''));
      if (openId && openId !== o.id) {
        const open = byId.get(openId);
        if (open) {
          try {
            await page.waitForSelector(open.sel, { timeout: 4000, state: "attached" });
            await page.locator(open.sel).first().click({ timeout: 4000 }).catch(() => {});
            await sleep(250);
          } catch { /* leave open if its opener is gone */ }
        }
      }
      if (o.woTab) {
        const tb = page.locator(`.ribbon-tab[data-tab="${o.woTab}"]`).first();
        if (await tb.count()) {
          // DOM-event click (bubbles) — TabList's onTabSelect is a React
          // synthetic handler; a Playwright force-click can land on the
          // panel drawer overlay for right-edge tabs (ai), silently
          // skipping the tab switch. The DOM event is overlay-proof.
          await page.evaluate((t) => {
            const el = document.querySelector(`.ribbon-tab[data-tab="${t}"]`);
            if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          }, o.woTab);
          await sleep(1000);
        }
      }
      await click();
      await sleep(350);
      const opened = await visible(page, mark);
      // strict toggle: same button again closes
      await click();
      await sleep(350);
      const closed = !(await visible(page, mark)) || await page.evaluate((s) => {
        const e = document.querySelector(s);
        return !e || (e.getAttribute('data-wo-right-panel') || '').length === 0;
      }, mark);
      const ok = opened && closed;
      if (!ok) rc = 1;
      results[o.id] = { sel: o.sel, woTab: o.woTab, opened, closed, ok };
      // reopen for the next step
      await click().catch(() => {});
      await sleep(300);
    } catch (e) {
      rc = 1;
      results[o.id] = { sel: o.sel, woTab: o.woTab, ok: false, error: String(e.message).split('\n')[0] };
    }
  }

  // switch: with panel A open, opening B shows only B
  if (picked.length >= 2) {
    const a = picked[0], b = picked[1];
    const mka = `[data-wo-right-panel="${a.id}"]`, mkb = `[data-wo-right-panel="${b.id}"]`;
    // ensure A open
    if (a.woTab) { await page.evaluate((t) => { const el = document.querySelector(`.ribbon-tab[data-tab="${t}"]`); if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }, a.woTab).catch(() => {}); await sleep(600); }
    await page.locator(a.sel).first().click(); await sleep(300);
    const aOpen = await visible(page, mka);
    if (b.woTab) { await page.evaluate((t) => { const el = document.querySelector(`.ribbon-tab[data-tab="${t}"]`); if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }, b.woTab).catch(() => {}); await sleep(600); }
    await page.locator(b.sel).first().click(); await sleep(300);
    const bOpen = await visible(page, mkb);
    const aStill = await visible(page, mka);
    const switched = aOpen && bOpen && !aStill;
    if (!switched) rc = 1;
    results.switch = { a: a.id, b: b.id, aOpen, bOpen, aStill, ok: switched };
  }

  await browser.close();

  fs.writeFileSync(path.join(__dirname, '..', 'right-panel-results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 1));
  for (const [k, v] of Object.entries(results)) {
    const mark = v.ok === false ? 'FAIL' : 'ok';
    console.log(`${k.padEnd(14)} ${JSON.stringify(v)}`);
  }
  console.log(`right-panel: ${Object.values(results).filter((v) => v.ok !== false).length}/${Object.keys(results).length} green`);
  process.exit(rc);
})();

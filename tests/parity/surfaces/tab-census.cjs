#!/usr/bin/env node
// tab-census.cjs — per-tab completeness gate.
//
// The contract runner asserts individual controls exist and behave, but a
// whole ribbon page can still be EMPTY or leak another tab's panel without a
// single contract failing. This surface clicks every ribbon tab and asserts a
// per-tab floor of visible interactive controls inside the ACTIVE
// .ribbon-page, so "tab totally wrong" fails loudly with the tab named.
//
// Usage: node tests/parity/surfaces/tab-census.cjs [--results FILE]
// Contextual tabs (chart-design, header-footer) only render with a chart
// selection / header edit mode, so each runs a SETUP flow first (the same
// fixture + interaction the contract runner uses as its 'chart-selection' /
// 'hf-editing' pres) before its floor is counted. Setup tabs run LAST: their
// fixtures rewrite #editor.innerHTML / editor state, which must not perturb
// the plain-tab baselines above them.
//
// React-editor alignment (2026-11): the react port renders the contextual HF
// tab under data-tab="header-footer-contextual" and enters header/footer edit
// mode via the Insert tab's Header&Footer button (#btn-edit-header ->
// DocumentStore.headerFooterMode), not via dblclick on a .page-header.
'use strict';
const path = require('path');
const fs = require('fs');
const boot = require('../_boot.cjs');

const FLOORS = JSON.parse(fs.readFileSync(path.join(__dirname, 'tab-census-floors.json'), 'utf8'));
const ALL_TABS = Object.keys(FLOORS).filter((t) => !t.startsWith('_'));

// Census key -> react DOM tab id (react ids differ from the WYSIWYG-era keys).
const TAB_ID = {
  'header-footer': 'header-footer-contextual', // react contextual HF tab
};

// Contextual tabs: how to make the tab button exist (unhide) and its page
// become active.
const CONTEXTUAL = {
  // chart-design appears only after clicking a chart vector object: the
  // editor click handler sets lastChartPick, unhides the tab and activates it.
  'chart-design': async (page) => {
    await page.evaluate(() => {
      const ed = document.querySelector('#editor');
      if (!ed) throw new Error('#editor missing');
      const spec = { type: 'bar', title: 'Fixture', rows: [['A', '1'], ['B', '2']], elements: {} };
      const img = '<img id="fixture-chart" class="vector-object" data-kind="chart" alt="chart" style="width:420px;height:240px" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-spec="' + JSON.stringify(spec).replace(/"/g, '&quot;').replace(/&(?!(amp|lt|gt|quot);)/g, '&amp;') + '">';
      ed.innerHTML = '<p>before ' + img + ' after</p>';
      ed.focus();
    });
    await page.waitForSelector('#fixture-chart', { timeout: 3000 });
    const box = await page.locator('#fixture-chart').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(200);
  },
  // header-footer appears only in header/footer edit mode. The react editor
  // enters HF mode via the Insert tab's Header&Footer flow (editHeader sets
  // DocumentStore.headerFooterMode, which reveals the contextual tab).
  'header-footer': async (page) => {
    await page.locator('.ribbon-tab[data-tab="insert"]').first().click();
    await page.waitForTimeout(150);
    const btn = page.locator('#btn-edit-header');
    await btn.click({ timeout: 5000 });
    await page.waitForSelector('.ribbon-tab[data-tab="header-footer-contextual"]', { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 200));
  },
};

// plain tabs first, contextual (fixture-planting) tabs last
const TABS = [...ALL_TABS.filter((t) => !CONTEXTUAL[t]), ...ALL_TABS.filter((t) => CONTEXTUAL[t])];

(async () => {
  const results = {};
  let rc = 0;
  await boot.ensureServer();
  const { browser, page } = await (async () => {
    const b = await boot.launchBrowser();
    const { page: p } = await boot.openEditor(b, boot.BASE);
    return { browser: b, page: p };
  })();
  for (const tab of TABS) {
    const domId = TAB_ID[tab] || tab;
    if (CONTEXTUAL[tab]) {
      try {
        await CONTEXTUAL[tab](page);
      } catch (e) {
        results[tab] = { count: 0, floor: FLOORS[tab], error: `setup failed: ${String(e && e.message || e).split('\n')[0]}` };
        rc = 1;
        continue;
      }
    }
    const tabBtn = await page.$(`.ribbon-tab[data-tab="${domId}"]`);
    if (!tabBtn) {
      results[tab] = { count: 0, floor: FLOORS[tab], error: 'tab button not found' };
      rc = 1;
      continue;
    }
    await tabBtn.click();
    await page.waitForTimeout(400);
    const count = await page.evaluate((t) => {
      const pg = document.querySelector(`.ribbon-page[data-tab="${t}"]`);
      if (!pg) return -1;
      const sels = pg.querySelectorAll('[data-cmd], button, select, input:not([type="hidden"])');
      return Array.from(sels).filter((n) => {
        const r = n.getBoundingClientRect();
        const st = getComputedStyle(n);
        return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
      }).length;
    }, domId);
    const ok = count >= FLOORS[tab];
    if (!ok) rc = 1;
    results[tab] = { count, floor: FLOORS[tab], ok };
  }
  await browser.close();

  const outPath = process.argv.includes('--results')
    ? process.argv[process.argv.indexOf('--results') + 1]
    : path.join(__dirname, '..', 'tab-census-results.json');
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 1));

  for (const [t, v] of Object.entries(results)) {
    const mark = v.ok === false || v.error ? 'FAIL' : 'ok';
    console.log(`${mark.padEnd(5)} ${t.padEnd(14)} ${String(v.count).padStart(4)} controls (floor ${v.floor})${v.error ? ` — ${v.error}` : ''}`);
  }
  const fails = Object.entries(results).filter(([, v]) => v.ok === false || v.error).length;
  console.log(`tab-census: ${TABS.length - fails}/${TABS.length} tabs at or above floor`);
  process.exit(rc);
})();

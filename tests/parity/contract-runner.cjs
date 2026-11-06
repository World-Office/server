#!/usr/bin/env node
// contract-runner.cjs — executes the word parity contracts from the generated
// manifest (word-parity-contracts.json). Runs every entry that carries a
// machine-checkable assertion; skips covered-cluster/unclassified with a
// reason. Writes contract-results.json and prints actionable FAIL lines:
//   FAIL <token> (<tab>/<class>): expected X, observed Y
// Exit 1 if any non-xfail contract fails.
//
// Usage: node contract-runner.cjs [--only tok1,tok2] [--results FILE]
'use strict';
const fs = require('fs');
const path = require('path');
const { ensureServer, launchBrowser, openEditor } = require('./_boot.cjs');

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const only = arg('--only', null);
const RESULTS = arg('--results', path.join(__dirname, 'contract-results.json'));
const MANIFEST = arg('--manifest', path.join(__dirname, 'word-parity-contracts.json'));

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
// Overrides carry the executable details (selector/pre/xfail); re-read them so
// the runner always reflects the latest overrides without a regen step.
const overrides = require('./overrides-loader.cjs').loadOverrides(__dirname).entries;

const RUNNABLE = new Set(['format', 'structure', 'dialog', 'op', 'view']);
let entries = manifest.entries.filter(e => {
  // same key precedence as generate-manifest: binding token, then feature id
  const ov = overrides[e.token] || overrides[e.feature];
  if (!ov) return false; // no override => no executable contract yet
  return RUNNABLE.has(e.effektClass);
});
if (only) { const set = new Set(only.split(',')); entries = entries.filter(e => set.has(e.token)); }
if (!entries.length) { console.error('no runnable contracts (add overrides with assertion)'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

function placeCaret(page) {
  return page.evaluate(() => {
    const sel = window.getSelection(); const r = document.createRange();
    const walker = document.createTreeWalker(document.querySelector('#editor'), NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const txt = node.textContent.trim();
      if (txt.length >= 2) { r.setStart(node, 0); r.setEnd(node, Math.min(4, txt.length)); sel.removeAllRanges(); sel.addRange(r); return; }
    }
    throw new Error('no text node in #editor to place the caret');
  });
}

async function poll(page, fn, ms = 3000, step = 150) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < ms) { last = await fn(); if (last && last.ok) return last; await sleep(step); }
  return last;
}

// Prerequisites -------------------------------------------------------------
async function openFileMenu(page) {
  const visible = await page.evaluate(() => {
    const m = document.querySelector('#file-menu');
    return m && getComputedStyle(m).display !== 'none' && !m.hidden;
  });
  if (!visible) await page.click('#btn-file');
  await page.waitForTimeout(200);
}

// Effect observers per assertion kind ---------------------------------------
async function checkEffect(page, ov, assertion) {
  switch (assertion.kind) {
    case 'dialog-input': {
      // depth contract: the OUTER trigger (ov.selector) already opened the
      // dialog. Fill assertion.set = [{selector, value}] (input/textarea →
      // fill, select → selectOption, checkbox → check/uncheck), optionally
      // click assertion.click (apply button), then assert EITHER a
      // dom-mutation (assertion.expect = {selector, absent?}) OR that the
      // dialog closed (assertion.dialog).
      for (const s of (assertion.set || [])) {
        const loc = page.locator(s.selector).first();
        if (await loc.count() === 0) return { ok: false, observed: `dialog-input: field missing ${s.selector}` };
        const info = await loc.evaluate(el => ({ tag: el.tagName.toLowerCase(), type: el.type || '' }));
        if (info.tag === 'select') await loc.selectOption(String(s.value));
        else if (info.type === 'checkbox') { s.value ? await loc.check() : await loc.uncheck(); }
        else await loc.fill(String(s.value));
      }
      if (assertion.click) {
        const btn = page.locator(assertion.click).first();
        if (await btn.count() === 0) return { ok: false, observed: `dialog-input: button missing ${assertion.click}` };
        await btn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
        await btn.click();
        await sleep(300);
      }
      if (assertion.expect && assertion.expect.selector) {
        return poll(page, (sel) => page.evaluate((a) => {
          const el = document.querySelector(a.sel);
          const text = el ? (el.textContent || '') : '';
          const textOk = a.contains ? text.includes(a.contains) : true;
          const lacksOk = a.lacks ? !text.includes(a.lacks) : true;
          const ok = (a.want ? !el : !!el) && textOk && lacksOk;
          const observed = a.want ? (el ? `still present: ${a.sel}` : 'gone')
            : (!el ? `no ${a.sel}`
              : !textOk ? `${a.sel} found but lacks "${a.contains}"`
              : !lacksOk ? `${a.sel} found but still contains "${a.lacks}"`
              : 'found');
          return { ok, observed };
        }, { sel: assertion.expect.selector, want: assertion.expect.absent, contains: assertion.expect.contains, lacks: assertion.expect.lacks }), undefined);
      }
      const dlg = assertion.dialog || '.dialog-overlay';
      const stillOpen = await page.evaluate((sel) =>
        [...document.querySelectorAll(sel)].filter(d => getComputedStyle(d).display !== 'none' && !d.hidden).length, dlg);
      return { ok: !stillOpen, observed: stillOpen ? `dialog still open after ${assertion.click || 'set'}` : `dialog closed after ${assertion.click || 'set'}` };
    }
    case 'dialog-action': {
      // depth contract: the OUTER trigger (ov.selector) already opened the
      // dialog; here we click assertion.button and assert the dialog closed.
      // assertion.open is optional — when present we open the dialog here
      // instead (used when the contract has no natural opener trigger).
      if (assertion.open && !ov.selector) {
        await page.keyboard.press('Escape').catch(() => {});
        await sleep(100);
        if (assertion.open.backstage) {
          await openFileMenu(page);
          await page.evaluate((p) => { const b = document.querySelector(`[data-pane="${p}"]`); if (!b) throw new Error('backstage row missing: ' + p); b.click(); }, assertion.open.backstage);
          await page.click(`[data-pane="${assertion.open.backstage}"]`).catch(() => {});
        } else if (assertion.open.selector) {
          if (assertion.open.woTab) {
            const needsClick = await page.evaluate((t) => { const pg = document.querySelector(`.ribbon-page[data-tab="${t}"]`); return pg && getComputedStyle(pg).display === 'none'; }, assertion.open.woTab);
            if (needsClick) { await page.click(`.ribbon-tab[data-tab="${assertion.open.woTab}"]`); await sleep(150); }
          }
          await page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) throw new Error('dialog-action: opener missing ' + sel); el.click(); }, assertion.open.selector);
          await sleep(300);
        }
      }
      const btn = page.locator(assertion.button);
      if (await btn.count() === 0) return { ok: false, observed: `dialog-action: button missing ${assertion.button}` };
      await btn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      await btn.click();
      await sleep(300);
      // most actions close the dialog; assert the targeted dialog is gone
      const dlg = assertion.dialog || '.dialog-overlay';
      const stillOpen = await page.evaluate((sel) => {
        const roots = [...document.querySelectorAll(sel)].filter(d => getComputedStyle(d).display !== 'none' && !d.hidden);
        return roots.length;
      }, dlg);
      return { ok: !stillOpen, observed: stillOpen ? `dialog still open after ${assertion.button}` : `dialog closed after ${assertion.button}` };
    }
    case 'computed-style': {
      // Select the word under the caret, then read computed style of its element.
      return poll(page, () => page.evaluate(({ prop, equals }) => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) return { ok: false, observed: 'no-selection' };
        let el = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
        if (!el || !el.closest('#editor')) return { ok: false, observed: 'caret outside #editor' };
        const v = getComputedStyle(el.closest('b,i,u,span,p') || el)[prop];
        return { ok: v === equals, observed: `${prop}=${v}`, expected: `${prop}=${equals}` };
      }, { prop: assertion.prop, equals: assertion.equals }));
    }
    case 'dom-mutation': {
      return poll(page, (sel) => page.evaluate((a) => {
        const el = document.querySelector(a.sel);
        const want = a.want; // {absent:true} inverts: element must be GONE
        const ok = want ? !el : !!el;
        return { ok, observed: want ? (el ? `still present: ${a.sel}` : 'gone') : (el ? 'found' : `no ${a.sel}`) };
      }, { sel: assertion.selector, want: assertion.absent }), undefined);
    }
    case 'dialog-visible': {
      return poll(page, () => page.evaluate((sel) => {
        const els = [...document.querySelectorAll(sel)];
        const vis = els.find(d => getComputedStyle(d).display !== 'none' && !d.hidden && d.getBoundingClientRect().width > 0);
        return { ok: !!vis, observed: vis ? `dialog visible (${vis.id || vis.className.split(' ')[0]})` : `no visible dialog among ${els.length} × ${sel}` };
      }, assertion.dialogSelector || '.dialog-overlay'));
    }
    case 'text-mutation': {
      // the click inserted/changed text (plain text runs, dates, fields…)
      return poll(page, () => page.evaluate((a) => {
        const el = document.querySelector(a.selector || '#editor');
        if (!el) return { ok: false, observed: `no ${a.selector || '#editor'}` };
        const text = el.textContent || '';
        let ok;
        if (a.containsDate) {
          const d = new Date();
          const y = new Date(Date.now() - 864e5); // midnight race: the dialog
          // may have rendered the date a second before the check
          const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
          ok = text.includes(iso(d)) || text.includes(iso(y));
          return { ok, observed: `text ${ok ? 'contains' : 'lacks'} today/yesterday (${iso(d)}/${iso(y)})` };
        }
        ok = a.contains ? text.includes(a.contains) : text.trim().length > 0;
        return { ok, observed: ok ? `text matches ${JSON.stringify(a.contains || '(nonempty)')}` : `text lacks ${JSON.stringify(a.contains)}` };
      }, assertion));
    }
    case 'op-emitted':
      return poll(page, (ev) => page.evaluate((name) => ({
        ok: (window.__woEvents || []).includes(name),
        observed: (window.__woEvents || []).length
          ? `events: ${(window.__woEvents || []).join(',')}`
          : 'no wo:* events observed',
      }), assertion.event || `wo:${assertion.selector || ''}`), undefined);
    case 'viewport-flag': {
      // read a class / attribute / computed-style prop on a root element
      // (body, main, #editor …) after the click — for toggles that change
      // document-level state instead of selection state (zoom, dark doc,
      // format marks…)
      return poll(page, () => page.evaluate((a) => {
        const el = document.querySelector(a.rootSelector || 'main');
        if (!el) return { ok: false, observed: `no root ${a.rootSelector || 'main'}` };
        let v;
        if (a.hasClass) v = el.classList.contains(a.hasClass);
        else if (a.attr) v = el.getAttribute(a.attr);
        else if (a.prop) v = getComputedStyle(el)[a.prop];
        else return { ok: false, observed: 'viewport-flag needs hasClass|attr|prop' };
        const ok = v === (a.prop ? a.equals : true) || v === String(a.equals);
        return { ok, observed: `${a.hasClass ? 'class:' + a.hasClass : a.attr || a.prop}=${v}`, expected: `${a.equals === undefined ? true : a.equals}` };
      }, assertion));
    }
    default:
      return { ok: false, observed: `unknown assertion.kind ${assertion.kind}` };
  }
}

async function subFeatureAudit(page, ov, dialogSel) {
  const dRoot = await page.$(dialogSel);
  if (!dRoot) return { missing: ['(no dialog)'] };
  const missing = [];
  for (const sf of (ov.subFeatures || [])) {
    const found = await page.evaluate(({ rootSel, sfSel }) => {
      const roots = [...document.querySelectorAll(rootSel)].filter(d => getComputedStyle(d).display !== 'none' && !d.hidden);
      return roots.some(root => root.querySelector(sfSel));
    }, { rootSel: dialogSel, sfSel: sf.selector });
    if (!found) missing.push(`${sf.name} (${sf.selector})`);
  }
  return { missing };
}

// Main -----------------------------------------------------------------------
(async () => {
  const server = await ensureServer();
  const browser = await launchBrowser();
  const { ctx, page } = await openEditor(browser, server.base);
  const results = [];
  let fails = 0;

  for (const e of entries) {
    const ov = overrides[e.token] || overrides[e.feature] || {};
    const woTab = ov.woTab || e.woTab;
    const res = { token: e.token, feature: e.feature, tab: e.tab, cls: e.effektClass, xfail: !!ov.xfail };
    // xfail fast-path: known gaps are counted without driving the page —
    // at CI scale their hidden-control scroll waits dominate the runtime.
    // Set WO_RUN_XFAILS=1 to exercise them for real (vocabulary debugging).
    if (res.xfail && !process.env.WO_RUN_XFAILS) {
      res.ok = false; res.observed = 'known-gap (fast-path: not driven)';
      results.push(res); continue;
    }
    try {
      // fresh page per contract: contracts must be independent (no state
      // bleed from previous toggles/inserts)
      await page.goto(`${server.base}/word/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('#editor', { timeout: 15000 });
      await page.waitForTimeout(1200);
      // 1. prerequisites FIRST (a control inside a closed menu is invisible;
      // then presence + hit-test (elementFromPoint, not just DOM)
      const preMenu = ['file-menu','list','ctx-menu','ctx-menu-in-list','ctx-menu-in-table','ctx-menu-on-image','ctx-menu-on-chart','ctx-menu-cells','link-at-caret','chart-selection','ctx-menu-misspelled','ctx-menu-trackchanges','ctx-menu-two-objects'].includes(ov.pre) || /^(backstage|menu):/.test(ov.pre || ''); // list/ctx-menu manage their own caret
      if (ov.pre === 'file-menu') await openFileMenu(page);
      else if (ov.pre === 'list') {
        // 'list' — build a two-item ordered list with the caret in the second
        // item (contracts like multilevel-list nesting need real list state)
        await page.evaluate(() => {
          const ed = document.querySelector('#editor');
          if (!ed) throw new Error('#editor missing');
          ed.innerHTML = '<ol><li>alpha</li><li>beta</li></ol><p>after</p>';
          const beta = ed.querySelectorAll('li')[1];
          const range = document.createRange();
          range.setStart(beta.firstChild, 1);
          range.collapse(true);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          ed.focus();
        });
        await sleep(100);
      }
      else if (ov.pre === 'ctx-menu-in-list') {
        // ctx rows whose handlers need list state (BulletsAndNumbering,
        // SetNumberingValue…): build the list, select a word inside it, then
        // right-click inside that selection to open the context menu
        await page.evaluate(() => {
          const ed = document.querySelector('#editor');
          if (!ed) throw new Error('#editor missing');
          ed.innerHTML = '<ol><li>alpha</li><li>beta</li></ol><p>after</p>';
          const beta = ed.querySelectorAll('li')[1];
          const range = document.createRange();
          range.selectNodeContents(beta);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          ed.focus();
        });
        await sleep(100);
        const r = await page.evaluate(() => {
          const s = window.getSelection();
          const rect = s && s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null;
          return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
        });
        if (!r) throw new Error('ctx-menu-in-list pre: no selection rect');
        await page.mouse.click(r.x, r.y, { button: 'right' });
        await page.waitForSelector('#ctx-menu:not([hidden])', { timeout: 3000 });
        await sleep(150);
      }
      else if (ov.pre === 'ctx-menu-in-table') {
        // ctx rows gated on data-showif="table" (merge/split cells, row/column
        // ops…): build a 2×2 table, select a word inside cell 1, right-click
        await page.evaluate(() => {
          const ed = document.querySelector('#editor');
          if (!ed) throw new Error('#editor missing');
          ed.innerHTML = '<table><tr><td>alpha cell</td><td>beta cell</td></tr><tr><td>gamma</td><td>delta</td></tr></table><p>after</p>';
          const cell = ed.querySelectorAll('td')[0];
          const range = document.createRange();
          range.selectNodeContents(cell.firstChild);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          ed.focus();
        });
        await sleep(100);
        const r = await page.evaluate(() => {
          const s = window.getSelection();
          const rect = s && s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null;
          return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
        });
        if (!r) throw new Error('ctx-menu-in-table pre: no selection rect');
        await page.mouse.click(r.x, r.y, { button: 'right' });
        await page.waitForSelector('#ctx-menu:not([hidden])', { timeout: 3000 });
        await sleep(150);
      }
      else if (ov.pre === 'ctx-menu-on-image') {
        // object-gated ctx rows (wrap/crop/rotate/alt-text/save-as-picture…):
        // insert a plain image, then right-click ON it (any mousedown over
        // img/div.object sets lastObjectPick, so hasObjectSel holds)
        await page.evaluate(() => {
          const ed = document.querySelector('#editor');
          if (!ed) throw new Error('#editor missing');
          ed.innerHTML = '<p>before <img id="fixture-img" alt="fixture" style="width:120px;height:80px" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"> after</p>';
          ed.focus();
        });
        await page.waitForSelector('#fixture-img', { timeout: 3000 });
        const box = await page.locator('#fixture-img').boundingBox();
        if (!box) throw new Error('ctx-menu-on-image: no img box');
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
        await page.waitForSelector('#ctx-menu:not([hidden])', { timeout: 3000 });
        await sleep(150);
      }
      else if (ov.pre === 'ctx-menu-on-chart') {
        // chart-gated ctx rows: same as on-image but the fixture is a chart
        // vector object (img.vector-object[data-kind=chart] with a spec)
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
        if (!box) throw new Error('ctx-menu-on-chart: no chart box');
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
        await page.waitForSelector('#ctx-menu:not([hidden])', { timeout: 3000 });
        await sleep(150);
      }
      else if (ov.pre === 'chart-selection') {
        // chart-design tab is CONTEXTUAL: it appears only after clicking a
        // chart vector object (handler sets lastChartPick, unhides + activates
        // the tab). Fixture chart, real left-click, tab becomes clickable.
        await page.evaluate(() => {
          const ed = document.querySelector('#editor');
          if (!ed) throw new Error('#editor missing');
          const spec = { type: 'bar', title: 'Fixture', rows: [['A', '1'], ['B', '2']], elements: {} };
          const img = '<img id="fixture-chart" class="vector-object" data-kind="chart" alt="chart" style="width:420px;height:240px" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-spec="' + JSON.stringify(spec).replace(/"/g, '&quot;').replace(/&(?!(amp|lt|gt|quot);)/g, '&amp;') + '">';
          ed.innerHTML = '<p>before ' + img + ' after</p>';
          ed.focus();
        });
        await page.waitForSelector('#fixture-chart', { timeout: 3000 });
        await page.locator('#fixture-chart').click({ timeout: 5000 });
        await page.waitForSelector('.ribbon-tab[data-tab="chart-design"]:not([hidden])', { timeout: 3000 });
        await sleep(200);
      }
      else if (ov.pre === 'ctx-menu-cells') {
        // multi-cell ctx rows (merge cells…): selectedCells() = cells
        // intersecting the selection range — select across row 1's two cells,
        // right-click between them
        await page.evaluate(() => {
          const ed = document.querySelector('#editor');
          if (!ed) throw new Error('#editor missing');
          ed.innerHTML = '<table><tr><td>alpha cell</td><td>beta cell</td></tr><tr><td>gamma</td><td>delta</td></tr></table><p>after</p>';
          const tds = ed.querySelectorAll('td');
          const range = document.createRange();
          range.setStart(tds[0].firstChild, 0);
          range.setEnd(tds[1].firstChild, tds[1].firstChild.textContent.length);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          ed.focus();
        });
        await sleep(100);
        const r = await page.evaluate(() => {
          const s = window.getSelection();
          const rect = s && s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null;
          return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
        });
        if (!r) throw new Error('ctx-menu-cells pre: no selection rect');
        await page.mouse.click(r.x, r.y, { button: 'right' });
        await page.waitForSelector('#ctx-menu:not([hidden])', { timeout: 3000 });
        await sleep(150);
      }
      else if (ov.pre === 'link-at-caret') {
        // link-gated ctx rows (EditLink/RemoveLink…): anchor at the caret
        await page.evaluate(() => {
          const ed = document.querySelector('#editor');
          if (!ed) throw new Error('#editor missing');
          ed.innerHTML = '<p>see <a id="fixture-link" href="https://example.com/">link text</a> here</p>';
          const a = ed.querySelector('#fixture-link');
          const range = document.createRange();
          range.selectNodeContents(a);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          ed.focus();
        });
        await sleep(100);
        const r = await page.evaluate(() => {
          const s = window.getSelection();
          const rect = s && s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null;
          return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
        });
        if (!r) throw new Error('link-at-caret pre: no selection rect');
        await page.mouse.click(r.x, r.y, { button: 'right' });
        await page.waitForSelector('#ctx-menu:not([hidden])', { timeout: 3000 });
        await sleep(150);
      }
      else if (ov.pre === 'ctx-menu-misspelled') {
        // misspell-gated ctx rows (Ignore/IgnoreAll/AddToDictionary…):
        // fixture a pre-marked misspelling and right-click ON it (the gate
        // is misspellAtSelection() || event target inside span.wo-misspelled)
        await page.evaluate(() => {
          const ed = document.querySelector('#editor');
          if (!ed) throw new Error('#editor missing');
          ed.innerHTML = '<p>before <span id="fixture-miss" class="wo-misspelled" data-word="wordd">wordd</span> after</p>';
          ed.focus();
        });
        await page.waitForSelector('#fixture-miss', { timeout: 3000 });
        const box = await page.locator('#fixture-miss').boundingBox();
        if (!box) throw new Error('ctx-menu-misspelled: no span box');
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
        await page.waitForSelector('#ctx-menu:not([hidden])', { timeout: 3000 });
        await sleep(150);
      }
      else if (ov.pre === 'ctx-menu-trackchanges') {
        // trackchange-gated ctx rows (Accept/Reject change…): enable track
        // changes via the real UI toggle, fixture a tracked insertion, and
        // right-click inside it
        await page.evaluate(() => {
          const btn = document.querySelector('#btn-track-changes');
          if (btn) btn.click(); // setTrackChanges(true) + opens the dialog
          const close = document.querySelector('#btn-trackchanges-close');
          if (close) close.click();
          const ed = document.querySelector('#editor');
          if (!ed) throw new Error('#editor missing');
          ed.innerHTML = '<p><ins id="fixture-track" class="track-insert">added words</ins> tail text</p>';
          const range = document.createRange();
          range.selectNodeContents(ed.querySelector('#fixture-track'));
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          ed.focus();
        });
        await page.waitForSelector('#fixture-track', { timeout: 3000 });
        await sleep(100);
        const r = await page.evaluate(() => {
          const s = window.getSelection();
          const rect = s && s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null;
          return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
        });
        if (!r) throw new Error('ctx-menu-trackchanges pre: no selection rect');
        await page.mouse.click(r.x, r.y, { button: 'right' });
        await page.waitForSelector('#ctx-menu:not([hidden])', { timeout: 3000 });
        await sleep(150);
      }
      else if (ov.pre === 'ctx-menu-two-objects') {
        // multi-object ctx rows (Distribute h/v…): two fixture images, real
        // click on the first, Shift+click on the second (mousedown handler
        // adds to selectedObjects), then right-click
        await page.evaluate(() => {
          const ed = document.querySelector('#editor');
          if (!ed) throw new Error('#editor missing');
          const px = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
          ed.innerHTML = '<p><img id="fixture-obj-a" alt="a" style="width:100px;height:60px" src="' + px + '"> <img id="fixture-obj-b" alt="b" style="width:100px;height:60px" src="' + px + '"> tail</p>';
          ed.focus();
        });
        await page.waitForSelector('#fixture-obj-a', { timeout: 3000 });
        // multi-select needs SHIFT on BOTH clicks — a plain click only sets
        // lastObjectPick (single-object path), not selectedObjects[]
        await page.keyboard.down('Shift');
        await page.locator('#fixture-obj-a').click({ timeout: 5000 });
        await page.locator('#fixture-obj-b').click({ timeout: 5000 });
        await page.keyboard.up('Shift');
        const box = await page.locator('#fixture-obj-b').boundingBox();
        if (!box) throw new Error('ctx-menu-two-objects: no img box');
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
        await page.waitForSelector('#ctx-menu:not([hidden])', { timeout: 3000 });
        await sleep(150);
      }
      else if ((ov.pre || '').startsWith('menu:')) {
        // ribbon dropdown menu: pre = 'menu:<trigger-selector>' — click the
        // caret-btn trigger, wait for its .menu-list to unhide. The contract
        // selector then targets a button[role=menuitem] inside that list.
        const trig = ov.pre.slice(5);
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) throw new Error('menu pre: trigger missing ' + sel);
          // menus live inside their ribbon page — activate it first or the
          // list would unhide inside a display:none ancestor (invisible)
          const pg = el.closest('.ribbon-page[data-tab]');
          if (pg && getComputedStyle(pg).display === 'none') {
            document.querySelector(`.ribbon-tab[data-tab="${pg.dataset.tab}"]`).click();
          }
          el.click();
        }, trig);
        await page.waitForSelector('.ribbon-page .menu-list:not([hidden])', { timeout: 3000 });
        await sleep(150);
      }
      else if ((ov.pre || '').startsWith('backstage:')) {
        // 'backstage:<pane>' — open the File backstage, then switch it to
        // <pane> (rows like [data-pane=info] swap the backstage panel;
        // controls inside the pane are invisible until then)
        await openFileMenu(page);
        await page.evaluate((p) => {
          const b = document.querySelector(`[data-pane="${p}"]`);
          if (!b) throw new Error('backstage row missing: ' + p);
          b.click();
        }, ov.pre.slice('backstage:'.length));
        await sleep(250);
      }
      else if (ov.pre === 'ctx-menu') {
        // open the context menu over the selected word (right-click inside
        // the selection preserves it, so ctx format/op handlers still see it;
        // data-showif-gated items stay hidden unless their state holds)
        await placeCaret(page);
        const r = await page.evaluate(() => {
          const s = window.getSelection();
          const rect = s && s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null;
          return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
        });
        if (!r) throw new Error('ctx-menu pre: no selection rect');
        await page.mouse.click(r.x, r.y, { button: 'right' });
        await page.waitForSelector('#ctx-menu:not([hidden])', { timeout: 3000 });
        await sleep(150);
      }
      // 1b. ribbon tab context AFTER the pre (contextual tabs like
      // chart-design only become visible once the pre selected the object;
      // backstage/file-menu pres cover the ribbon, but those rows use
      // surface:/_ tab keys and never reach this click)
      if (woTab && !/^(surface:|_)/.test(woTab) && woTab !== 'backstage') {
        // a ctx-menu pre can leave the popup overlapping the ribbon — close it
        const menuOpen = await page.evaluate(() => { const m = document.querySelector('#ctx-menu'); return m && !m.hidden; });
        if (menuOpen) await page.keyboard.press('Escape');
        const needsClick = await page.evaluate((sel) => {
          const pg = document.querySelector(`.ribbon-page[data-tab="${sel}"]`);
          return pg && getComputedStyle(pg).display === 'none';
        }, woTab);
        if (needsClick) { await page.click(`.ribbon-tab[data-tab="${woTab}"]`); await sleep(150); }
      }
      const selector = ov.selector || `[data-cmd="${e.wo}"]`;
      if (!ov.key) {
      const loc = page.locator(selector).first();
      if (await loc.count() === 0) throw new Error(`control not found: ${selector}`);
      // hidden/unstable controls (contextual ctx items) never scroll into
      // view — the playwright default here is 30s, which xfail rows would
      // burn wholesale; 3s is plenty for genuinely visible controls
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      const box = await loc.boundingBox();
      const hit = box && await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el && !!el.closest('button, [role=button], input, select, label');
      }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
      if (!hit) throw new Error('control present but hit-test BLOCKED (elementFromPoint misses a control)');
      } // end selector presence + hit-test (skipped for key-trigger contracts)

      // 3. caret placement (not needed for menu/dialog flows)
      if (!preMenu) {
        // place the caret over the first word that actually has text
        await placeCaret(page);
      }

      // 3b. event collector for op-emitted assertions: a fresh window-level
      // wo:* CustomEvent listener per contract (arrow prefix keeps earlier
      // contracts' events out)
      if ((ov.assertion || {}).kind === 'op-emitted') {
        await page.evaluate(() => {
          window.__woEvents = [];
          window.__woCollect = (ev) => { if (window.__woEvents) window.__woEvents.push(ev.type); };
          window.addEventListener('wo:follow-move', window.__woCollect);
          window.addEventListener('wo:chart-3d', window.__woCollect);
          window.addEventListener('wo:chart-settings', window.__woCollect);
          window.addEventListener('wo:field-op', window.__woCollect);
          window.addEventListener('wo:chart-elements', window.__woCollect);
        });
      }

      // 4. trigger — hit-test was proven with elementFromPoint above; the
      // synthetic click keeps the live selection intact (a real mouse click
      // would collapse it before the command handler runs). One retry for
      // cold-boot races (caret not settled, dialog open animation).
      const trigger = () => {
        if (ov.key) {
          // keyboard shortcut contract: dispatch a real key chord (handlers
          // listen on #editor — placeCaret focuses it and selects word 1)
          if (!preMenu) placeCaret(page);
          return page.keyboard.press(ov.key)
            .then(() => ov.post ? sleep(250).then(() => page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) throw new Error('post selector missing: ' + sel); el.click(); }, ov.post)) : null);
        }
        if (!preMenu) placeCaret(page);
        return page.evaluate((sel) => document.querySelector(sel).click(), selector)
          .then(() => ov.post ? sleep(250).then(() => page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) throw new Error('post selector missing: ' + sel); el.click(); }, ov.post)) : null);
      };
      await trigger();
      let effect = await checkEffect(page, ov, ov.assertion || { kind: 'unspecified' });
      if (!(effect && effect.ok) && (ov.assertion || {}).kind !== 'unspecified') {
        await sleep(400);
        await trigger();
        effect = await checkEffect(page, ov, ov.assertion || { kind: 'unspecified' });
      }

      // 5. observe effect
      const effect2 = effect;
      let observed = effect2 ? (effect2.observed || '') : 'no observation';
      let ok = !!(effect2 && effect2.ok);

      // 6. dialog sub-feature audit
      if (ok && ov.assertion && ov.assertion.kind === 'dialog-visible') {
        const audit = await subFeatureAudit(page, ov, ov.assertion.dialogSelector || '.dialog-overlay');
        if (audit.missing.length) {
          ok = false;
          observed += `; missing subFeatures: ${audit.missing.join(', ')}`;
        }
      }

      res.ok = ok;
      res.expected = JSON.stringify(ov.assertion) + (ov.subFeatures ? ` +${ov.subFeatures.length} subFeatures` : '');
      res.observed = observed;
      // close whatever we opened for the next case
      if (preMenu || ov.post || (ok && ov.assertion.kind === 'dialog-visible')) {
        await page.keyboard.press('Escape').catch(() => {});
        await sleep(150);
      }
    } catch (err) {
      res.ok = false;
      res.observed = 'ERROR: ' + String(err.message || err).slice(0, 160);
    }
    if (!res.ok && !res.xfail) fails++;
    results.push(res);
    const mark = res.ok ? 'PASS' : (res.xfail ? 'KNOWN-GAP' : 'FAIL');
    console.log(`${mark} ${res.token} (${res.tab}/${res.cls})${res.ok ? '' : ': ' + res.observed}`);
  }

  await browser.close();
  if (server.owned && server.child) server.child.kill('SIGKILL');

  const summary = {
    ranAt: new Date().toISOString(),
    total: results.length,
    pass: results.filter(r => r.ok).length,
    knownGap: results.filter(r => !r.ok && r.xfail).length,
    fail: fails,
    results,
  };
  // census drift: OO blueprint controls still without ANY class. covered-
  // cluster rows are classified (deliberately not individually contracted)
  // and are NOT drift. Non-blocking by design (spec: warn, don't gate).
  const drift = manifest.entries.filter(e => e.effektClass === 'unclassified').map(e => e.token);
  summary.unclassified = drift;
  if (drift.length) {
    console.log(`\nWARNING (non-blocking): ${drift.length} census entries still unclassified — parity backlog:`);
    console.log('  ' + drift.join(', '));
  }
  fs.writeFileSync(RESULTS, JSON.stringify(summary, null, 1) + '\n');
  console.log(`\ncontract-results: ${summary.pass} pass, ${summary.knownGap} known-gap, ${fails} FAIL -> ${path.basename(RESULTS)}`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('RUNNER FAIL:', e); process.exit(1); });

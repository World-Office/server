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
const overrides = JSON.parse(fs.readFileSync(path.join(__dirname, 'word-parity-overrides.json'), 'utf8')).entries;

const RUNNABLE = new Set(['format', 'structure', 'dialog', 'op', 'view']);
let entries = manifest.entries.filter(e => {
  const ov = overrides[e.token];
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
      return poll(page, (sel) => page.evaluate((s) => {
        const el = document.querySelector(s);
        return { ok: !!el, observed: el ? 'found' : `no ${s}` };
      }, assertion.selector), undefined);
    }
    case 'dialog-visible': {
      return poll(page, () => page.evaluate((sel) => {
        const els = [...document.querySelectorAll(sel)];
        const vis = els.find(d => getComputedStyle(d).display !== 'none' && !d.hidden && d.getBoundingClientRect().width > 0);
        return { ok: !!vis, observed: vis ? `dialog visible (${vis.id || vis.className.split(' ')[0]})` : `no visible dialog among ${els.length} × ${sel}` };
      }, assertion.dialogSelector || '.dialog-overlay'));
    }
    case 'op-emitted':
    case 'viewport-flag':
      return { ok: false, observed: `observer for ${assertion.kind} not exercised yet` };
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
    const ov = overrides[e.token] || {};
    const woTab = ov.woTab || e.woTab;
    const res = { token: e.token, tab: e.tab, cls: e.effektClass, xfail: !!ov.xfail };
    try {
      // fresh page per contract: contracts must be independent (no state
      // bleed from previous toggles/inserts)
      await page.goto(`${server.base}/word/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('#editor', { timeout: 15000 });
      await page.waitForTimeout(1200);
      // 1. ribbon tab context (only real ribbon tabs — surface:/backstage
      // entries are handled by their prerequisite instead)
      if (woTab && !/^(surface:|_)/.test(woTab) && woTab !== 'backstage') {
        const needsClick = await page.evaluate((sel) => {
          const pg = document.querySelector(`.ribbon-page[data-tab="${sel}"]`);
          return pg && getComputedStyle(pg).display === 'none';
        }, woTab);
        if (needsClick) { await page.click(`.ribbon-tab[data-tab="${woTab}"]`); await sleep(150); }
      }
      // 2. prerequisites FIRST (a control inside a closed menu is invisible),
      // then presence + hit-test (elementFromPoint, not just DOM)
      if (ov.pre === 'file-menu') await openFileMenu(page);
      const selector = ov.selector || `[data-cmd="${e.wo}"]`;
      const loc = page.locator(selector).first();
      if (await loc.count() === 0) throw new Error(`control not found: ${selector}`);
      await loc.scrollIntoViewIfNeeded();
      const box = await loc.boundingBox();
      const hit = box && await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el && !!el.closest('button, [role=button], input, select, label');
      }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
      if (!hit) throw new Error('control present but hit-test BLOCKED (elementFromPoint misses a control)');

      // 3. caret placement (not needed for menu/dialog flows)
      if (ov.pre !== 'file-menu') {
        // place the caret over the first word that actually has text
        await placeCaret(page);
      }

      // 4. trigger — hit-test was proven with elementFromPoint above; the
      // synthetic click keeps the live selection intact (a real mouse click
      // would collapse it before the command handler runs). One retry for
      // cold-boot races (caret not settled, dialog open animation).
      const trigger = () => {
        if (ov.pre !== 'file-menu') placeCaret(page);
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
      if (ov.pre === 'file-menu' || ov.post || (ok && ov.assertion.kind === 'dialog-visible')) {
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
  // census drift: OO blueprint controls without a classified contract yet.
  // Non-blocking by design (spec: warn, don't gate) — the backlog for task 4.1.
  const drift = manifest.entries.filter(e => !RUNNABLE.has(e.effektClass)).map(e => e.token);
  summary.unclassified = drift;
  if (drift.length) {
    console.log(`\nWARNING (non-blocking): ${drift.length} census entries still unclassified — parity backlog:`);
    console.log('  ' + drift.join(', '));
  }
  fs.writeFileSync(RESULTS, JSON.stringify(summary, null, 1) + '\n');
  console.log(`\ncontract-results: ${summary.pass} pass, ${summary.knownGap} known-gap, ${fails} FAIL -> ${path.basename(RESULTS)}`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('RUNNER FAIL:', e); process.exit(1); });

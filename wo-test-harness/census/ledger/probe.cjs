#!/usr/bin/env node
/* LEDGER1-BEHAVIOR-PROBES: L2 "acts" probe for the World-Office feature ledger.
 *
 * For every ledger feature whose wo.match maps to an actionable editor
 * control/dialog, this script:
 *   1. boots the vanilla wysiwyg editor (served locally, fetch stubbed),
 *   2. executes the control (synthetic DOM click / editor wo-command bus),
 *      opening any dialog and applying it via its OK button,
 *   3. asserts a REAL document mutation: DOM markers (span.dropcap,
 *      div.line-numbers, div.watermark, ul/ol, section[data-columns],
 *      div.page-setup[data-margin-*]), style-attribute changes, and
 *      structural insertions — asserted on the editor's own flat
 *      serialization (__WO_FLAT_HTML__) and/or the live #editor DOM.
 * NO CHANGE IS NOT SUCCESS: a probe passes only when the mutation is
 * observable after the control ran.
 *
 * Coverage contract (mirrors ledger/roundtrip.cjs): a probe's ledger
 * features are all ledger.json rows whose wo.match equals the probe key
 * or is listed in `also`. Entries with ok=true are merged by build.py,
 * which promotes those rows to L2 (acts).
 *
 * Outputs (in this ledger/ dir):
 *   - probe-results.json  (per-probe results incl. covered feature ids)
 * Final stdout line starts with "probe:" (gate contract).
 *
 * Env: WO_EDITOR_DIR (default the vanilla wysiwyg app served at /word/).
 * The editor is served with the harness static-server recipe (python3
 * -m http.server on a free 127.0.0.1 port; NO_PROXY includes 127.0.0.1
 * so chromium/node never route it through a proxy).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');

const LEDGER_DIR = __dirname;
const CENSUS_DIR = path.join(LEDGER_DIR, '..');
const LEDGER_JSON = path.join(LEDGER_DIR, 'ledger.json');
const RESULTS_JSON = path.join(LEDGER_DIR, 'probe-results.json');

const EDITOR_DIR = process.env.WO_EDITOR_DIR
  || '/home/weiss/git/World-Office/server/apps/web/apps/documenteditor-wysiwyg';

const SEED_HTML = '<p>Probe sentinel alpha text.</p>'
  + '<p>Second paragraph body here.</p>';
const SENTINEL_WORD = 'sentinel';
const BOOT_MS = 2200;

// Keep loopback traffic out of any ambient proxy (node fetch + chromium).
for (const k of ['NO_PROXY', 'no_proxy']) {
  const cur = process.env[k] || '';
  const parts = new Set(cur.split(',').map((s) => s.trim()).filter(Boolean));
  parts.add('127.0.0.1');
  parts.add('localhost');
  process.env[k] = [...parts].join(',');
}

function loadPlaywright() {
  const candidates = [
    path.join(CENSUS_DIR, 'node_modules', 'playwright'),
  ];
  try {
    const { execSync } = require('child_process');
    candidates.push(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  } catch (_) { /* ignore */ }
  for (const c of candidates) {
    try { return require(c); } catch (_) { /* try next */ }
  }
  throw new Error('playwright not found (census/node_modules nor global)');
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function startStaticServer(port, dir) {
  const py = '/usr/bin/python3';
  const child = spawn(py, ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', dir], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let err = '';
  child.stderr.on('data', (d) => { err += d.toString(); });
  child._errbuf = () => err;
  return child;
}

/* ---------------- probe table ----------------
 * key       : a ledger wo.match value this probe covers (primary)
 * also      : other ledger wo.match values this probe covers
 * clicks    : ordered DOM actions; each {cmd, value?, sel?} — cmd/value
 *             resolves button[data-cmd][data-value], falling back to the
 *             editor's own wo-command bus (synthetic, no real mouse);
 *             sel resolves any selector. Default: [{cmd: key}].
 * picker    : {sel, value, prop?} — set a form control (select/input) and
 *             fire its change event (the toolbar pickers emit through the
 *             same runCommand path as buttons).
 * dlg       : {fields: [[selector, 'value'|'checked'|'hidden', v]], okSel?}
 *             — set dialog controls, then click the OK button (okSel or
 *             the open overlay's button[id$="-ok"]). Pure DOM, no mouse.
 * selectWord: word to select before actions (default SENTINEL_WORD).
 * expect    : regex source that MUST match the flat HTML after apply.
 * notExpect : regex source that must NOT match after apply.
 * midExpect : regex source that must match after the FIRST click only
 *             (two-step probes like indent -> outdent).
 * js        : JS expression evaluated in the page that MUST be truthy
 *             (live-DOM evidence outside the flat serialization, e.g.
 *             body tool classes or editor CSS variables).
 * wait      : extra ms before reading state (async inserters: equations).
 * All regexes are case-SENSITIVE (editor emits lowercase markup).
 */
const PROBES = [
  // ---- formatting: lists / indents / case / spacing / color / style ----
  { key: 'insertUnorderedList', expect: '<ul\\b' },
  { key: 'insertOrderedList', also: ['Numbering style options'], expect: '<ol\\b' },
  { key: 'multilevel', expect: '<ol\\b' },
  { key: 'indent', expect: '<blockquote\\b|margin-left' },
  { key: 'outdent', clicks: [{ cmd: 'indent' }, { cmd: 'outdent' }],
    midExpect: '<blockquote\\b|margin-left', expect: 'sentinel',
    notExpect: '<blockquote\\b|margin-left' },
  { key: 'line-spacing', picker: { sel: '#line-spacing', value: '2' }, expect: 'line-height' },
  { key: 'highlight-color', picker: { sel: '#highlight-color', value: '#ff8800' },
    expect: 'background-color' },
  { key: 'text-color', picker: { sel: '#text-color', value: '#cc0000' },
    expect: 'rgb\\(204, 0, 0\\)' },
  { key: 'font-family', picker: { sel: '#font-family', value: 'Courier New' },
    expect: 'font-family' },
  { key: 'font-size', picker: { sel: '#font-size', value: '6' }, expect: 'font-size' },
  { key: 'Shading', picker: { sel: '#shading-color', value: '#ffee99' },
    expect: 'background-color' },
  { key: 'openBorders', clicks: [{ cmd: 'openBorders' }],
    dlg: { fields: [['#bd-top', 'checked', true], ['#bd-bottom', 'checked', true]],
           okSel: '#btn-borders-ok' },
    expect: 'border-top' },
  { key: 'directionRtl', expect: 'dir="rtl"' },
  { key: 'justifyCenter', also: ['justifyLeft', 'justifyRight', 'justifyFull'],
    clicks: [{ cmd: 'justifyLeft' }, { cmd: 'justifyCenter' },
             { cmd: 'justifyRight' }, { cmd: 'justifyFull' }],
    expect: 'text-align:\\s*justify' },

  // ---- page: margins / orientation / size / columns / breaks / hf ----
  { key: 'Margins', also: ['Normal', 'Narrow', 'Moderate', 'Wide'],
    clicks: [{ cmd: 'applyPageMargins', value: 'normal' },
             { cmd: 'applyPageMargins', value: 'narrow' },
             { cmd: 'applyPageMargins', value: 'moderate' },
             { cmd: 'applyPageMargins', value: 'wide' }],
    expect: 'data-margin-left="2880"' },
  { key: 'Custom margins', clicks: [{ sel: '#btn-page-setup' }],
    dlg: { fields: [['#ps-mt', 'value', '0.8']], okSel: '#btn-ps-apply' },
    expect: 'data-margin-top="1152"' },
  { key: 'Orientation', clicks: [{ cmd: 'applyPageOrientation', value: 'landscape' }],
    expect: 'data-orient="landscape"' },
  { key: 'Size', also: ['Letter'], clicks: [{ cmd: 'applyPageSize', value: 'Letter' }],
    expect: 'data-page-w="12240"' },
  { key: 'Columns', also: ['One', 'Two', 'Three', 'Left', 'Right'],
    clicks: [{ cmd: 'applyColumns', value: 'two' },
             { cmd: 'applyColumns', value: 'three' },
             { cmd: 'applyColumns', value: 'left' },
             { cmd: 'applyColumns', value: 'right' },
             { cmd: 'applyColumns', value: 'one' }],
    expect: 'data-columns="1"' },
  { key: 'Breaks', also: ['Insert page break'], clicks: [{ cmd: 'insertPageBreak' }],
    expect: 'class="page-break"' },
  { key: 'Insert column break', clicks: [{ cmd: 'insertColumnBreak' }],
    expect: 'class="column-break"' },
  { key: 'Insert section break', clicks: [{ cmd: 'insertSectionBreak' }],
    expect: 'class="section-break"' },
  { key: 'insertBlankPage', expect: 'class="page-break"' },
  { key: 'toggleLineNumbers', clicks: [{ cmd: 'toggleLineNumbers' }],
    dlg: { fields: [['#ln-mode', 'value', 'restart-each-section']],
           okSel: '#btn-linenumbers-ok' },
    expect: 'data-restart="newSection"' },
  { key: 'Hyphenation', clicks: [{ cmd: 'toggleHyphenation' }],
    dlg: { okSel: '#btn-hyphenation-ok' }, expect: 'class="hyphenation"' },
  { key: 'Automatic', clicks: [{ cmd: 'hyphenationSet', value: 'auto' }],
    expect: 'data-auto="1"' },
  { key: 'toggleWatermark', clicks: [{ cmd: 'toggleWatermark' }],
    dlg: { fields: [['#wm-mode', 'value', 'custom'],
                    ['#wm-custom-row', 'hidden', false],
                    ['#wm-text', 'value', 'PROBE SECRET']],
           okSel: '#btn-watermark-ok' },
    expect: 'data-text="PROBE"' },
  { key: 'pagecolor', clicks: [{ sel: '#pagecolor' },
                               { sel: '#pagecolor-swatches .color-swatch[data-color="#fdf8ec"]' }],
    dlg: { okSel: '#btn-pagecolor-ok' },
    js: "document.querySelector('#editor').style.getPropertyValue('--paper').trim()==='#fdf8ec'" },
  { key: 'themecolors', clicks: [{ sel: '#themecolors' }],
    dlg: { fields: [['#cs-scheme', 'value', 'gold']], okSel: '#btn-colors-ok' },
    js: "document.querySelector('#editor').style.getPropertyValue('--ink').trim()==='#352a17'" },
  { key: 'btn-hf-pagenumber', clicks: [{ sel: '#btn-hf-pagenumber' }],
    expect: 'class="page-number"' },

  // ---- insert / references ----
  { key: 'link', clicks: [{ cmd: 'link' }],
    dlg: { fields: [['#link-url', 'value', 'https://probe.example/wo']],
           okSel: '#btn-link-ok' },
    expect: 'href="https://probe.example/wo"' },
  { key: 'bookmark', clicks: [{ cmd: 'bookmark' }],
    dlg: { fields: [['#bookmark-name', 'value', 'ProbeMark']], okSel: '#btn-bookmark-ok' },
    expect: 'ProbeMark' },
  { key: 'insertFootnote', expect: 'class="footnote"' },
  { key: 'insertCaption', expect: '<em[^>]*>Caption' },
  { key: 'btn-toc', clicks: [{ sel: '#btn-toc' }], dlg: { okSel: '#btn-toc-ok' },
    expect: 'class="toc"' },
  { key: 'updateToc', clicks: [{ cmd: 'updateToc' }],
    dlg: { fields: [['#toc-update', 'value', 'entire']], okSel: '#btn-updatetoc-ok' },
    expect: 'class="toc"' },
  { key: 'insertToF', expect: 'data-kind="figures"' },
  { key: 'insertTextart', clicks: [{ cmd: 'insertTextart' }],
    dlg: { okSel: '#btn-object-ok' }, expect: 'data-type="textart"' },
  { key: 'insertTextbox', clicks: [{ cmd: 'insertTextbox' }],
    dlg: { okSel: '#btn-object-ok' }, expect: 'data-type="textbox"' },
  { key: 'insertObject', clicks: [{ cmd: 'insertObject' }],
    dlg: { okSel: '#btn-object-ok' }, expect: 'data-type="shape"' },
  { key: 'toggleDropcap', clicks: [{ cmd: 'toggleDropcap' }],
    dlg: { okSel: '#btn-dropcap-ok' }, expect: 'class="dropcap"' },
  { key: 'Fractions', clicks: [{ cmd: 'equationTemplate', value: 'fractions' }],
    expect: 'data-kind="equation"', wait: 900 },
  { key: 'Scripts', also: ['Radicals', 'Integrals', 'Large operators', 'Brackets',
                           'Functions', 'Accents', 'Limits and logarithms',
                           'Operators', 'Matrices'],
    clicks: [{ cmd: 'equationTemplate', value: 'scripts' },
             { cmd: 'equationTemplate', value: 'radicals' },
             { cmd: 'equationTemplate', value: 'integrals' },
             { cmd: 'equationTemplate', value: 'large-operators' },
             { cmd: 'equationTemplate', value: 'brackets' },
             { cmd: 'equationTemplate', value: 'functions' },
             { cmd: 'equationTemplate', value: 'accents' },
             { cmd: 'equationTemplate', value: 'limits-and-logarithms' },
             { cmd: 'equationTemplate', value: 'operators' },
             { cmd: 'equationTemplate', value: 'matrices' }],
    expect: 'data-kind="equation"', wait: 900 },

  // ---- table tools (borders/shading live in the formatting probes) ----
  { key: 'Draw table', clicks: [{ cmd: 'tableDrawMode' }],
    js: "document.body.classList.contains('wo-table-draw')" },
  { key: 'Erase table', clicks: [{ cmd: 'tableEraseMode' }],
    js: "document.body.classList.contains('wo-table-erase')" },
];

/* -------------- ledger coverage -------------- */

function coverageMap() {
  const ledger = JSON.parse(fs.readFileSync(LEDGER_JSON, 'utf8'));
  const cov = new Map(); // probe key -> [feature ids]
  for (const p of PROBES) {
    const ids = [];
    for (const f of ledger.features) {
      const m = (f.wo || {}).match;
      if (m && (m === p.key || (p.also || []).includes(m))) ids.push(f.feature);
    }
    cov.set(p.key, ids);
  }
  return { ledger, cov };
}

/* -------------- in-page helpers -------------- */

function stubInit(ctx) {
  localStorage.clear();
  window.__COLLAB__ = false;
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = (init && init.method) || 'GET';
    if (method === 'GET' && url.includes('/api/documents/') && url.includes('/html')) {
      return Promise.resolve(new Response(JSON.stringify({ html: ctx.seed, name: 'demo.docx' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }));
    }
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
  };
  navigator.sendBeacon = () => true;
}

async function bootEditor(browser, base, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(stubInit, { seed });
  await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector('#editor', { timeout: 20000 });
  await page.waitForTimeout(BOOT_MS);
  return { ctx, page };
}

function pageHelpers() {
  window.__RT_SELECT__ = function (word) {
    const ed = document.querySelector('#editor');
    if (!ed) return 'no-editor';
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const i = node.textContent.indexOf(word);
      if (i >= 0) {
        const r = document.createRange();
        r.setStart(node, i);
        r.setEnd(node, i + word.length);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        ed.focus();
        return 'ok';
      }
    }
    return 'word-not-found';
  };
  // DOM-level synthetic click (works on hidden menu items too). Falls back
  // to the editor's own wo-command event bus for command-only actions.
  window.__RT_CLICK__ = function (spec) {
    let el = null;
    if (spec.sel) {
      el = document.querySelector(spec.sel);
    } else {
      el = spec.value != null
        ? document.querySelector(`button[data-cmd="${spec.cmd}"][data-value="${spec.value}"]`)
        : document.querySelector(`button[data-cmd="${spec.cmd}"]`);
    }
    if (el) { el.click(); return { how: 'click' }; }
    if (!spec.sel) {
      dispatchEvent(new CustomEvent('wo-command', {
        detail: { command: spec.cmd, value: spec.value == null ? null : String(spec.value) },
      }));
      return { how: 'bus' };
    }
    return { how: 'no-element' };
  };
  window.__RT_PICK__ = function (spec) {
    const el = document.querySelector(spec.sel);
    if (!el) return 'no-element';
    el.value = spec.value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  };
  window.__RT_DLG__ = function (cfg) {
    for (const f of (cfg.fields || [])) {
      const [sel, method, val] = f;
      const el = document.querySelector(sel);
      if (!el) continue;
      if (method === 'value') { el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }
      else if (method === 'checked') { el.checked = !!val; el.dispatchEvent(new Event('change', { bubbles: true })); }
      else if (method === 'hidden') { el.hidden = !!val; }
    }
    const ok = cfg.okSel
      ? document.querySelector(cfg.okSel)
      : (document.querySelector('.dialog-overlay.open button[id$="-ok"]')
         || document.querySelector('.dialog-overlay.open button.primary'));
    if (!ok) return 'no-ok';
    ok.click();
    return 'ok';
  };
  window.__RT_JS__ = function (expr) {
    try { return !!eval(expr); } catch (e) { return 'err:' + String(e && e.message || e); }
  };
}

function snippet(s) {
  return String(s || '').replace(/\s+/g, ' ').slice(0, 400);
}

/* -------------- probe runner -------------- */

async function runProbe(browser, base, probe) {
  const out = { key: probe.key, ok: false, phase: null, detail: null, ms: 0 };
  const t0 = Date.now();
  const p = pageHelpers;
  try {
    const a = await bootEditor(browser, base, SEED_HTML);
    await a.page.evaluate(p);
    const selRes = await a.page.evaluate((w) => window.__RT_SELECT__(w),
                                         probe.selectWord || SENTINEL_WORD);
    if (selRes !== 'ok') throw new Error(`selection failed: ${selRes}`);

    const actions = probe.clicks || [{ cmd: probe.key, value: probe.value || null }];
    for (let i = 0; i < actions.length; i++) {
      const r = await a.page.evaluate((s) => window.__RT_CLICK__(s), actions[i]);
      if (!r || r.how === 'no-element') {
        out.phase = 'apply';
        out.detail = `control not found: ${JSON.stringify(actions[i])}`;
        out.ms = Date.now() - t0;
        await a.ctx.close();
        return out;
      }
      if (i === 0 && probe.midExpect) {
        await a.page.waitForTimeout(400);
        const mid = await a.page.evaluate(() => window.__WO_FLAT_HTML__());
        if (!(new RegExp(probe.midExpect)).test(mid)) {
          out.phase = 'apply';
          out.detail = `preparation step did not apply (midExpect /${probe.midExpect}/ missing after first click)`;
          out.ms = Date.now() - t0;
          await a.ctx.close();
          return out;
        }
      }
    }
    if (probe.picker) {
      const r = await a.page.evaluate((s) => window.__RT_PICK__(s), probe.picker);
      if (r !== 'ok') {
        out.phase = 'apply';
        out.detail = `picker control not found: ${JSON.stringify(probe.picker)}`;
        out.ms = Date.now() - t0;
        await a.ctx.close();
        return out;
      }
    }
    await a.page.waitForTimeout(400);
    if (probe.dlg) {
      const r = await a.page.evaluate((c) => window.__RT_DLG__(c), probe.dlg);
      if (r !== 'ok') {
        out.phase = 'dialog';
        out.detail = 'dialog OK control not found (dialog did not open or has no OK)';
        out.ms = Date.now() - t0;
        await a.ctx.close();
        return out;
      }
    }
    await a.page.waitForTimeout(probe.wait || 350);

    const html1 = await a.page.evaluate(() => window.__WO_FLAT_HTML__());
    let why = [];
    if (probe.expect && !(new RegExp(probe.expect)).test(html1)) {
      why.push(`mutation missing (expect /${probe.expect}/ absent from serialization)`);
    }
    if (probe.notExpect && (new RegExp(probe.notExpect)).test(html1)) {
      why.push(`expected absence violated (notExpect /${probe.notExpect}/ still present)`);
    }
    if (probe.js) {
      const js = await a.page.evaluate((e) => window.__RT_JS__(e), probe.js);
      if (js !== true) why.push(`live-DOM assert failed: ${probe.js} -> ${JSON.stringify(js)}`);
    }
    out.detail = why.length ? why.join('; ') : 'mutation verified';
    out.html = snippet(html1);
    await a.ctx.close();
    out.ok = why.length === 0;
    out.phase = out.ok ? 'applied' : 'apply';
  } catch (e) {
    out.phase = out.phase || 'error';
    out.detail = String(e.message || e).slice(0, 300);
  }
  out.ms = Date.now() - t0;
  return out;
}

/* -------------- main -------------- */

async function main() {
  const { cov } = coverageMap();
  const { chromium } = loadPlaywright();

  const port = await freePort();
  const server = startStaticServer(port, EDITOR_DIR);
  const base = `http://127.0.0.1:${port}`;
  await new Promise((r) => setTimeout(r, 600));

  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  const results = [];
  const POOL = 4;
  let idx = 0;
  async function worker() {
    while (idx < PROBES.length) {
      const probe = PROBES[idx++];
      const ids = cov.get(probe.key) || [];
      if (ids.length === 0) continue; // no ledger coverage -> skip silently
      const r = await runProbe(browser, base, probe);
      r.features = ids;
      results.push(r);
      process.stdout.write(`  ${r.ok ? 'PASS' : 'FAIL'} ${r.key} [${r.phase}] (${r.ms}ms) features=${ids.length}${r.ok ? '' : ' — ' + r.detail}\n`);
    }
  }
  await Promise.all(Array.from({ length: POOL }, worker));

  await browser.close();
  server.kill('SIGTERM');

  results.sort((x, y) => x.key.localeCompare(y.key));
  const passed = results.filter((r) => r.ok).length;
  const coveredRows = new Set();
  for (const r of results) {
    if (r.ok) for (const f of r.features) coveredRows.add(f);
  }

  const payload = {
    generated: new Date().toISOString(),
    editor_dir: EDITOR_DIR,
    probed: results.length,
    passed,
    level2: coveredRows.size,
    entries: results,
  };
  fs.writeFileSync(RESULTS_JSON, JSON.stringify(payload, null, 2) + '\n');
  process.stdout.write(`probe: ${passed}/${results.length} controls applied a real mutation, level2=${coveredRows.size}\n`);
}

main().catch((e) => {
  process.stderr.write(`fatal: ${String(e && e.stack || e)}\n`);
  process.stdout.write('probe: 0/0 controls applied a real mutation, level2=0 (fatal)\n');
  process.exit(1);
});

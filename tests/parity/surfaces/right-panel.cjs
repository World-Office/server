#!/usr/bin/env node
// surfaces/right-panel.cjs — right settings-panel parity surface (L2Q-01).
//
// The OO reference for the right settings panel is captured in the deep
// census (census-oo-deep.json key .rightPanel: 'toggles' = the OO right
// tool-menu buttons, 'openedSections' = the section/field titles of the OO
// settings panels — Line spacing, Paragraph spacing, Indents, Rows & columns
// size, Borders style, Size, Rotation, Wrapping Style, Fill, …). gen-gaps
// listed that reference as a census-walk gap: no WO surface contracted it.
// This surface closes the gap. It asserts:
//   1. the WO panel affordance: View-tab #btn-right-panel-toggle opens
//      #right-panel (not [hidden]), the toggle reflects aria-pressed, the
//      editor body shifts (main.rp-open), and a second click round-trips.
//   2. per-section census: each rail button (paragraph/table/image/chart/
//      mailmerge) makes exactly its .rp-section the visible one (others
//      hidden, aria-pressed mirrors) and the section carries a floor of
//      visible interactive fields (floors in ../right-panel-floors.json).
//   3. OO anchor coverage: every OO openedSections group anchor has a WO
//      counterpart label across the 5 sections (case-insensitive substring
//      via the alias lists); missing MANDATORY anchors fail the surface.
//   4. selection gating parity: like OO, the contextual sections are dead
//      without a selection and live with one — table/image/chart controls
//      are all disabled cold and all enabled after planting the same
//      fixtures the contract runner uses; paragraph/mailmerge are always
//      available. Fixture planting runs LAST (it rewrites #editor.innerHTML
//      and must not perturb the plain census above).
//
// Usage: node tests/parity/surfaces/right-panel.cjs
//   env WO_OO_CENSUS — census-oo-deep.json location (default: harness
//   census found by walking up from this checkout, else the dev-box path).
// Results: tests/parity/right-panel-results.json. Exit 0 iff all green.
'use strict';
const fs = require('fs');
const path = require('path');

// The accept gate runs this surface standalone, without the WO_DOCSERVER_BIN
// that af-gate.sh exports: when this worktree has no cargo build of its own,
// reuse the main checkout's docserver (the same fallback af-gate.sh uses —
// surface tests change test code only, never editor/docserver source).
// Must run BEFORE requiring _boot.cjs: it captures WO_DOCSERVER_BIN at
// module-load time.
const LOCAL_BIN = path.join(__dirname, '..', '..', 'target', 'debug', 'wo-docserver');
const MAIN_BIN = '/home/weiss/git/World-Office/server/target/debug/wo-docserver';
if (!process.env.WO_DOCSERVER_BIN && !fs.existsSync(LOCAL_BIN) && fs.existsSync(MAIN_BIN)) {
  process.env.WO_DOCSERVER_BIN = MAIN_BIN;
}

const boot = require('../_boot.cjs');

const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'right-panel-floors.json'), 'utf8'));
const SECTIONS = Object.keys(CFG.floors);
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

function ooCensusPath() {
  const cands = [];
  if (process.env.WO_OO_CENSUS) cands.push(process.env.WO_OO_CENSUS);
  // the harness census sits beside the main server checkout; a worktree can
  // be N levels below it, so walk up until a sibling census shows up
  let dir = path.resolve(__dirname, '..');
  while (path.dirname(dir) !== dir) {
    cands.push(path.join(dir, 'wo-test-harness', 'census', 'census', 'census-oo-deep.json'));
    dir = path.dirname(dir);
  }
  cands.push('/home/weiss/git/World-Office/wo-test-harness/census/census/census-oo-deep.json');
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error(`census-oo-deep.json not found — set WO_OO_CENSUS (tried: ${cands.join(' ; ')})`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const results = { generatedAt: new Date().toISOString(), toggle: {}, sections: {}, anchors: {}, gating: {} };
  let rc = 0;

  // ── OO reference (deep census .rightPanel) ──────────────────────────
  const censusPath = ooCensusPath();
  const census = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
  const ooRight = census.rightPanel || {};
  const ooHeadings = (ooRight.openedSections || []).map(norm).filter(Boolean);
  results.ooCensus = {
    path: censusPath,
    capturedAt: census.capturedAt || '',
    toggles: (ooRight.toggles || []).length,
    openedSections: ooHeadings.length,
  };

  const server = await boot.ensureServer();
  const browser = await boot.launchBrowser();
  const { page } = await boot.openEditor(browser, boot.BASE);
  try {
    // ── 1. panel affordance: View-tab toggle opens/closes the panel ───
    const viewTab = await page.$('.ribbon-tab[data-tab="view"]');
    const toggleBtn = await page.$('#btn-right-panel-toggle');
    if (!viewTab || !toggleBtn) {
      results.toggle = { error: !viewTab ? 'view ribbon tab not found' : '#btn-right-panel-toggle not found' };
      rc = 1;
    } else {
      await viewTab.click();
      await sleep(300);
      await toggleBtn.click();
      await sleep(250);
      const open = await page.evaluate(() => {
        const p = document.getElementById('right-panel');
        const b = document.getElementById('btn-right-panel-toggle');
        const m = document.querySelector('main');
        return {
          panel: !!(p && !p.hidden),
          rail: !!document.querySelector('#right-rail button[data-panel]'),
          pressed: b ? b.getAttribute('aria-pressed') : null,
          shifted: !!(m && m.classList.contains('rp-open')),
        };
      });
      await toggleBtn.click(); // round-trip: same affordance must close it
      await sleep(200);
      const closed = await page.evaluate(() => {
        const p = document.getElementById('right-panel');
        const b = document.getElementById('btn-right-panel-toggle');
        const m = document.querySelector('main');
        return {
          panel: !!(p && !p.hidden),
          pressed: b ? b.getAttribute('aria-pressed') : null,
          shifted: !!(m && m.classList.contains('rp-open')),
        };
      });
      const ok = open.panel && open.rail && open.pressed === 'true' && open.shifted
        && !closed.panel && closed.pressed === 'false' && !closed.shifted;
      results.toggle = {
        opens: open.panel, railVisible: open.rail, pressedOnOpen: open.pressed,
        bodyShifted: open.shifted, closesOnRetoggle: !closed.panel,
        unpressedOnClose: closed.pressed, unshiftedOnClose: !closed.shifted, ok,
      };
      if (!ok) rc = 1;
      await toggleBtn.click(); // reopen for the section walk
      await sleep(250);
    }

    // ── helpers ────────────────────────────────────────────────────────
    // Make `name` the active section. The rail lives inside #right-panel,
    // so a closed panel must be reopened via the View toggle first; and
    // clicking the rail button of the ALREADY active section collapses the
    // panel (openRightPanelSection), so only click when it is not active.
    async function activate(name) {
      const open = await page.evaluate(() => {
        const p = document.getElementById('right-panel');
        return p && !p.hidden;
      });
      if (!open) {
        const vt = await page.$('.ribbon-tab[data-tab="view"]');
        const tb = await page.$('#btn-right-panel-toggle');
        if (!vt || !tb) throw new Error('cannot reopen panel: view toggle missing');
        await vt.click();
        await sleep(200);
        await tb.click();
        await sleep(250);
      }
      const active = await page.evaluate(() => {
        const body = document.getElementById('right-panel-body');
        if (!body) return null;
        const vis = Array.from(body.querySelectorAll('.rp-section')).filter((s) => !s.hidden);
        return vis.length === 1 ? vis[0].dataset.section : vis.map((s) => s.dataset.section).join('+');
      });
      if (active !== name) {
        const btn = await page.$(`#right-rail button[data-panel="${name}"]`);
        if (!btn) throw new Error(`rail button data-panel="${name}" not found`);
        await btn.click();
        await sleep(300);
      }
    }

    // ── 2. per-section census (rail switch, exclusivity, floors, texts) ─
    const sectionTexts = {};
    for (const name of SECTIONS) {
      try {
        await activate(name);
      } catch (e) {
        results.sections[name] = { count: 0, floor: CFG.floors[name], error: String((e && e.message) || e).split('\n')[0] };
        rc = 1;
        continue;
      }
      const info = await page.evaluate((n) => {
        const body = document.getElementById('right-panel-body');
        const sec = body ? body.querySelector(`.rp-section[data-section="${n}"]`) : null;
        if (!sec) return { error: `.rp-section[data-section="${n}"] not found` };
        const visibleSecs = Array.from(body.querySelectorAll('.rp-section')).filter((s) => !s.hidden).map((s) => s.dataset.section);
        const rail = Array.from(document.querySelectorAll('#right-rail button[data-panel]'))
          .map((b) => [b.dataset.panel, b.getAttribute('aria-pressed')]);
        const fields = Array.from(sec.querySelectorAll('input, select, button')).filter((el) => {
          const r = el.getBoundingClientRect();
          const st = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden' && !el.closest('[hidden]');
        }).length;
        const texts = Array.from(new Set(Array.from(sec.querySelectorAll('.rp-title, label, button, option, [title]'))
          .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
          .filter(Boolean)));
        return { visibleSecs, rail, fields, texts };
      }, name);
      if (info.error) {
        results.sections[name] = { count: 0, floor: CFG.floors[name], error: info.error };
        rc = 1;
        continue;
      }
      sectionTexts[name] = info.texts;
      const exclusive = info.visibleSecs.length === 1 && info.visibleSecs[0] === name;
      const ariaOk = info.rail.every(([panel, pressed]) => pressed === (panel === name ? 'true' : 'false'));
      const ok = exclusive && ariaOk && info.fields >= CFG.floors[name];
      if (!ok) rc = 1;
      results.sections[name] = {
        count: info.fields, floor: CFG.floors[name], exclusive, aria: ariaOk, ok,
        visibleSecs: info.visibleSecs, rail: info.rail, texts: info.texts,
      };
    }

    // ── 3. OO anchor coverage (deep census openedSections → WO labels) ─
    for (const a of CFG.ooAnchors) {
      const anchor = norm(a.anchor);
      const entry = { mandatory: !!a.mandatory };
      const censusHit = ooHeadings.find((h) => h === anchor || h.includes(anchor) || anchor.includes(h));
      if (!censusHit) {
        entry.error = 'anchor not present in OO census openedSections (reference drift)';
        results.anchors[a.anchor] = entry;
        if (a.mandatory) rc = 1;
        continue;
      }
      entry.censusHeading = censusHit;
      // two passes: strict (alias is a substring of a WO label — the OO
      // concept is named in the WO UI) beats loose (whole WO label inside
      // the alias), so "Paragraph spacing" reports "Spacing before (pt)"
      // rather than the generic "Paragraph" section title.
      let match = null;
      for (const strict of [true, false]) {
        if (match) break;
        for (const name of SECTIONS) {
          if (match) break;
          const texts = sectionTexts[name] || [];
          for (const alias of (a.aliases || [anchor])) {
            const al = norm(alias);
            const hit = texts.find((t) => {
              const nt = norm(t);
              return strict ? nt.includes(al) : al.includes(nt);
            });
            if (hit) { match = { section: name, alias: al, matched: hit }; break; }
          }
        }
      }
      entry.matched = match || null;
      if (!match && a.mandatory) rc = 1;
      results.anchors[a.anchor] = entry;
    }

    // ── 4. selection gating (contextual sections live, like OO) ───────
    const enabledState = async (name) => page.evaluate((n) => {
      const sec = document.querySelector(`#right-panel-body .rp-section[data-section="${n}"]`);
      if (!sec) return { error: 'section missing' };
      const hard = Array.from(sec.querySelectorAll('input, select, button'))
        .filter((el) => !el.classList.contains('rp-link')); // advanced link stays clickable
      const disabled = hard.filter((el) => el.hasAttribute('disabled')).length;
      return {
        total: hard.length,
        disabled,
        allDisabled: hard.length > 0 && disabled === hard.length,
        noneDisabled: hard.length > 0 && disabled === 0,
      };
    }, name);

    // always-available sections (OO text settings + mail merge never gate)
    for (const name of ['paragraph', 'mailmerge']) {
      await activate(name);
      const st = await enabledState(name);
      const ok = !!st.noneDisabled;
      if (!ok) rc = 1;
      results.gating[name] = { alwaysAvailable: ok, ok, state: st };
    }

    // fixture plants (contract-runner pres, verbatim flows) — LAST
    const PLANTS = {
      table: async () => {
        await page.evaluate(() => {
          const ed = document.querySelector('#editor');
          if (!ed) throw new Error('#editor missing');
          ed.innerHTML = '<table><tr><td>alpha cell</td><td>beta cell</td></tr><tr><td>gamma</td><td>delta</td></tr></table><p>after</p>';
          const cell = ed.querySelectorAll('td')[0];
          if (!cell || !cell.firstChild) throw new Error('fixture table cell missing');
          const range = document.createRange();
          range.selectNodeContents(cell.firstChild);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          ed.focus();
        });
        await sleep(250); // selectionchange → syncRightPanelControls
      },
      image: async () => {
        await page.evaluate(() => {
          const ed = document.querySelector('#editor');
          if (!ed) throw new Error('#editor missing');
          ed.innerHTML = '<p>before <img id="rp-fixture-img" alt="fixture" style="width:120px;height:80px" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"> after</p>';
        });
        await page.waitForSelector('#rp-fixture-img', { timeout: 3000 });
        const box = await page.locator('#rp-fixture-img').boundingBox();
        if (!box) throw new Error('fixture image has no box');
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); // sets lastObjectPick
        // replaced elements do not reliably fire selectionchange — nudge the
        // caret so the panel's selectionchange listener re-syncs; the pick
        // lives in lastObjectPick and survives the nudge (selectedObject
        // falls back to it, editor.js).
        await page.evaluate(() => {
          const ed = document.querySelector('#editor');
          const p = ed && ed.querySelector('p');
          if (!p) return;
          const range = document.createRange();
          range.selectNodeContents(p);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        });
        await sleep(250);
      },
      chart: async () => {
        await page.evaluate(() => {
          const ed = document.querySelector('#editor');
          if (!ed) throw new Error('#editor missing');
          const spec = { type: 'bar', title: 'Fixture', rows: [['A', '1'], ['B', '2']], elements: {} };
          const img = '<img id="rp-fixture-chart" class="vector-object" data-kind="chart" alt="chart" style="width:420px;height:240px" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-spec="' + JSON.stringify(spec).replace(/"/g, '&quot;').replace(/&(?!(amp|lt|gt|quot);)/g, '&amp;') + '">';
          ed.innerHTML = '<p>before ' + img + ' after</p>';
        });
        await page.waitForSelector('#rp-fixture-chart', { timeout: 3000 });
        await page.locator('#rp-fixture-chart').click({ timeout: 5000 }); // sets lastChartPick
        await page.evaluate(() => {
          const ed = document.querySelector('#editor');
          const p = ed && ed.querySelector('p');
          if (!p) return;
          const range = document.createRange();
          range.selectNodeContents(p);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        });
        await sleep(250);
      },
    };
    for (const name of Object.keys(PLANTS)) {
      const g = { section: name };
      try {
        await activate(name);
        g.disabledCold = await enabledState(name);
        await PLANTS[name]();
        g.liveWithSelection = await enabledState(name);
        g.ok = !!(g.disabledCold.allDisabled && g.liveWithSelection.noneDisabled);
      } catch (e) {
        g.error = String((e && e.message) || e).split('\n')[0];
        g.ok = false;
      }
      if (!g.ok) rc = 1;
      results.gating[name] = g;
    }
  } finally {
    await browser.close().catch(() => {});
    if (server.owned && server.child) server.child.kill('SIGKILL');
  }

  const outPath = path.join(__dirname, '..', 'right-panel-results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 1));

  // ── report ──────────────────────────────────────────────────────────
  if (results.toggle.error) console.log(`FAIL  toggle      — ${results.toggle.error}`);
  else if (!results.toggle.ok) console.log(`FAIL  toggle      — open=${results.toggle.opens} pressed=${results.toggle.pressedOnOpen} roundtrip=${results.toggle.closesOnRetoggle}`);
  else console.log('ok    toggle      panel opens via View tab, aria-pressed + body shift mirror, retoggle closes');
  for (const name of SECTIONS) {
    const s = results.sections[name] || {};
    const mark = s.ok === false || s.error ? 'FAIL' : 'ok';
    const extra = s.error ? ` — ${s.error}` : !s.ok
      ? ` — exclusive=${s.exclusive} aria=${s.aria}` : '';
    console.log(`${mark.padEnd(5)} ${name.padEnd(10)} ${String(s.count).padStart(3)} fields (floor ${s.floor})${extra}`);
  }
  const anchorsOk = Object.values(results.anchors).filter((a) => a.matched).length;
  const anchorsTotal = Object.keys(results.anchors).length;
  for (const [anchor, a] of Object.entries(results.anchors)) {
    if (a.error) console.log(`FAIL  OO anchor "${anchor}" — ${a.error}`);
    else if (!a.matched) console.log(`MISS  OO anchor "${anchor}"${a.mandatory ? ' (MANDATORY)' : ' (optional)'}`);
    else console.log(`ok    OO anchor "${anchor}" -> ${a.matched.section} "${a.matched.matched}"`);
  }
  for (const [name, g] of Object.entries(results.gating)) {
    if (g.error) console.log(`FAIL  gating ${name.padEnd(9)} — ${g.error}`);
    else if (g.alwaysAvailable !== undefined) console.log(`ok    gating ${name.padEnd(9)} always available (${g.state.total} fields, ${g.state.disabled} disabled)`);
    else if (g.ok) console.log(`ok    gating ${name.padEnd(9)} disabled cold (${g.disabledCold.disabled}/${g.disabledCold.total}), live with selection`);
    else console.log(`FAIL  gating ${name.padEnd(9)} cold=${JSON.stringify(g.disabledCold)} live=${JSON.stringify(g.liveWithSelection)}`);
  }
  const secsOk = SECTIONS.filter((n) => results.sections[n] && results.sections[n].ok).length;
  const gatingOk = Object.values(results.gating).filter((g) => g.ok).length;
  console.log(`right-panel: ${secsOk}/${SECTIONS.length} sections at floor, ${anchorsOk}/${anchorsTotal} OO anchors matched, gating ${gatingOk}/${Object.keys(results.gating).length} ok`
    + ` (OO census ${results.ooCensus.openedSections} sections / ${results.ooCensus.toggles} toggles)`);
  process.exit(rc);
})().catch((e) => { console.error('right-panel FAIL:', e); process.exit(1); });

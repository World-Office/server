#!/usr/bin/env node
// gen-gaps.cjs — writes plan/PARITY_GAPS.md from the parity artifacts:
// the known gaps (xfail), stubs, unverified rows, and the covered-cluster
// inventory (which replaces the old implicit "covered" balance with an
// explicit per-cluster sub-feature mapping backlog). Context-menu controls
// are a census walk gap: census-oo.cjs only captures ribbon tabs + file
// menu, so right-click surfaces cannot appear in the manifest at all.
//   node gen-gaps.cjs   (run after generate-manifest.cjs + contract-runner.cjs)
'use strict';
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'word-parity-contracts.json'), 'utf8'));
const overrides = JSON.parse(fs.readFileSync(path.join(HERE, 'word-parity-overrides.json'), 'utf8')).entries;
let results = null;
try { results = JSON.parse(fs.readFileSync(path.join(HERE, 'contract-results.json'), 'utf8')); } catch {}

function ledgerDefault() {
  for (const rel of ['../../wo-test-harness/census/census/ledger.json',
                     '../../../../wo-test-harness/census/census/ledger.json']) {
    const p = path.resolve(HERE, rel);
    if (fs.existsSync(p)) return p;
  }
  throw new Error('ledger.json not found — set WO_LEDGER');
}
// 2026-11-04: same ledger-shape port as generate-manifest.cjs — the reader
// expected the removed {ledger:[...]} envelope and rows with a .token field.
const ledger = JSON.parse(fs.readFileSync(process.env.WO_LEDGER || ledgerDefault(), 'utf8')).features;
const rowOf = tok => ledger.find(r => ((r.wo && r.wo.match) || '').toLowerCase() === tok || r.feature === tok) || {};

const out = [];
out.push('# Word-Office Parity Gaps');
out.push('');
out.push(`Generated ${new Date().toISOString().slice(0, 10)} from word-parity-contracts.json (${manifest.entries.length} entries, census-oo walk).`);
out.push('');
out.push('This report is the explicit replacement for the implicit "covered" balance: every OO control that WO does NOT fully mirror appears here with tab, control, and what exactly is missing.');
out.push('');

// 1. known gaps (xfail contracts)
const gaps = Object.entries(overrides).filter(([, o]) => o.xfail);
out.push(`## Known gaps with failing contract (${gaps.length})`);
out.push('');
for (const [tok, o] of gaps) {
  const r = rowOf(tok);
  out.push(`- **${tok}** (${r.tab || '?'}/${o.effektClass}) — ${o.note || 'no note'}`);
  for (const sf of (o.subFeatures || [])) out.push(`  - missing sub-feature: ${sf.name} (\`${sf.selector}\`)`);
}
out.push('');

// 2. stubs + unverified from the latest contract run
const stubs = manifest.entries.filter(e => e.effektClass === 'stub');
const unverified = results ? results.results.filter(r => !r.ok && !r.xfail) : [];
out.push(`## Stubs (${stubs.length})`);
out.push('');
if (stubs.length) for (const e of stubs) {
  const r = rowOf(e.token);
  out.push(`- **${e.token}** (${e.tab}) — declared divergence: ${r.ref || r.note || 'see ledger'}`);
} else out.push('none — every shipped control has a real contract target.');
out.push('');
out.push(`## Unverified — contract red (${unverified.length})`);
out.push('');
if (unverified.length) for (const r of unverified) out.push(`- **${r.token}** (${r.tab}/${r.cls}) — ${r.observed}`);
else out.push('none — all executed contracts green (gate PASS).');
out.push('');

// 3. covered clusters — the sub-feature mapping backlog
const clusters = manifest.entries.filter(e => e.effektClass === 'covered-cluster');
const byTab = {};
for (const e of clusters) (byTab[e.tab] = byTab[e.tab] || []).push(e.token);
out.push(`## Covered clusters awaiting sub-feature mapping (${clusters.length} controls in ${Object.keys(byTab).length} tabs)`);
out.push('');
out.push('These WO controls map to MULTIPLE OO controls (one WO button absorbs an OO dialog with 10-20 options). Presence is proven; behavior is not contracted per sub-feature yet. Each cluster needs: OO original dialog walked once, active controls recorded as selector list, override subFeatures[] filled.');
out.push('');
for (const [tab, toks] of Object.entries(byTab).sort((a, b) => b[1].length - a[1].length)) {
  out.push(`- **${tab}** (${toks.length}): ${[...new Set(toks)].join(', ')}`);
}
out.push('');

// 4. census walk gaps
out.push('## Census walk gaps (surfaces the manifest cannot see)');
out.push('');
out.push('- **OO right panel** — the OO properties panel reference is captured (census-oo-deep.json .rightPanel: section titles + toggles) but NOT yet contracted as a WO surface; WO\'s right settings panel (btn-right-panel-toggle / Ctrl+Shift+P) has no section-coverage contract yet.');
out.push('- **Backstage deep walk** — census-oo-deep.json .backstage holds the OO backstage reference; WO backstage has 6+6 contract rows, per-option sub-features not contracted.');
out.push('(Context menu: covered — census-ctx.json + 115 contract rows.)');
out.push('');

// dest: the parent-workspace plan/ dir when present (dev box), else
// inside the repo — CI checks out server alone and /…/plan/ does not exist
// there (first CI run after the 2026-11-04 port ENOENT'd on exactly this).
const planDir = path.join(HERE, '..', '..', '..', 'plan');
const dest = fs.existsSync(planDir)
  ? path.join(planDir, 'PARITY_GAPS.md')
  : path.join(HERE, 'word-parity-gaps.md');
fs.writeFileSync(dest, out.join('\n') + '\n');
console.log(`gap report -> ${dest}`);
console.log(`  known-gaps ${gaps.length}, stubs ${stubs.length}, unverified ${unverified.length}, covered-clusters ${clusters.length}`);

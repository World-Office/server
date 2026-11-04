// run-parity.cjs — one entry point for the word parity gates: L2 contracts
// (manifest-driven behavior) then L4 surface probes. Fails fast on the first
// red layer; exit code aggregates.
//   npm test -- test:parity            (both layers)
//   node parity/run-parity.cjs --layer=contracts|surfaces
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const HERE = __dirname;
const layer = (process.argv.find(a => a.startsWith('--layer=')) || '--layer=all').split('=')[1];
let rc = 0;

function run(label, cmd, args) {
  console.log(`\n=== parity/${label} ===`);
  const r = spawnSync(cmd, args, { cwd: HERE, stdio: 'inherit' });
  if (r.status !== 0) { console.error(`parity/${label} FAILED (exit ${r.status})`); rc = 1; }
  return r.status === 0;
}

if ((layer === 'all' || layer === 'contracts')) {
  // 2026-11-04: the generator's exit code used to be ignored — when it
  // crashed ("ledger is not iterable"), the manifest was never written,
  // every downstream step ENOENT'd with confusing errors, and the real
  // cause scrolled by. Fail fast instead.
  if (!run('generate-manifest', 'node', [path.join(HERE, 'generate-manifest.cjs')])) process.exit(1);
  run('contracts', 'node', [path.join(HERE, 'contract-runner.cjs')]);
  run('gen-gaps', 'node', [path.join(HERE, 'gen-gaps.cjs')]);
}
if (layer === 'all' || layer === 'surfaces') {
  for (const probe of ['menu-hit', 'file-menu', 'first-open', 'tab-switch-widths']) {
    run('surfaces/' + probe, 'node', [path.join(HERE, 'surfaces', probe + '.cjs')]);
  }
}
process.exit(rc);

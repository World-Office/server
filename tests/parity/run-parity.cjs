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
}

if ((layer === 'all' || layer === 'contracts')) {
  spawnSync('node', [path.join(HERE, 'generate-manifest.cjs')], { stdio: 'inherit' });
  run('contracts', 'node', [path.join(HERE, 'contract-runner.cjs')]);
  spawnSync('node', [path.join(HERE, 'gen-gaps.cjs')], { stdio: 'inherit' });
}
if (layer === 'all' || layer === 'surfaces') {
  for (const probe of ['menu-hit', 'file-menu', 'first-open', 'tab-switch-widths']) {
    run('surfaces/' + probe, 'node', [path.join(HERE, 'surfaces', probe + '.cjs')]);
  }
}
process.exit(rc);

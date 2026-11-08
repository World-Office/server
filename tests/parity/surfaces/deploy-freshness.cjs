#!/usr/bin/env node
// deploy-freshness.cjs — fail loudly when production serves a stale bundle.
//
// 2026-11-08: prod (editor.cloud.graphwiz.ai) served a 2026-09-18 editor for
// seven weeks — the entire parity arc (15→451 contracts) was never deployed
// because deploy has no automated step (legion flips compose mounts by hand).
// The deployed editor dir now carries build-info.json {sha, builtAt}; this
// probe compares it to the local server submodule HEAD.
//
// Env: WO_DEPLOY_BASE (default https://editor.cloud.graphwiz.ai)
//      WO_FRESHNESS_ALLOW_STALE=1 (warn instead of fail)
// Usage: node tests/parity/surfaces/deploy-freshness.cjs
'use strict';
const https = require('https');
const { execSync } = require('child_process');

const BASE = process.env.WO_DEPLOY_BASE || 'https://editor.cloud.graphwiz.ai';
const url = `${BASE}/word/build-info.json`;

const head = execSync('git rev-parse --short HEAD', { cwd: path0() }).toString().trim();
function path0() { return require('path').resolve(__dirname, '..', '..', '..'); }

https.get(url, { timeout: 20000 }, (res) => {
  let body = '';
  res.on('data', (c) => { body += c; });
  res.on('end', () => {
    if (res.statusCode !== 200) {
      return finish(`deploy freshness: ${url} -> HTTP ${res.statusCode} (build-info.json missing or docserver down)`);
    }
    let info;
    try { info = JSON.parse(body); } catch { return finish(`deploy freshness: ${url} is not JSON`); }
    if (!info.sha) return finish('deploy freshness: build-info.json lacks "sha"');
    if (info.sha === head) {
      console.log(`deploy freshness: ok — prod serves ${head}`);
      process.exit(0);
    }
    finish(`deploy freshness: STALE — prod serves ${info.sha}, local HEAD is ${head}. Deploy: download frontend-dist artifact for the react editors + copy apps/web/apps/documenteditor-wysiwyg/{index.html,editor.js,i18n.js,style.css,wo-bridge.js,build-info.json} to legion ~/editor-ui-${head}/, flip compose mounts, up -d docserver.`);
  });
}).on('error', (e) => finish(`deploy freshness: fetch failed — ${e.message}`));

function finish(msg) {
  if (process.env.WO_FRESHNESS_ALLOW_STALE === '1') {
    console.log(`WARN ${msg}`);
    process.exit(0);
  }
  console.error(msg);
  process.exit(1);
}

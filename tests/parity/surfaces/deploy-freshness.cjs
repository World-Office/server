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

function path0() { return require('path').resolve(__dirname, '..', '..', '..'); }
const opts = { cwd: path0() };
// Freshness is about DEPLOYED CONTENT, not harness commits: compare prod
// against the newest commit that touched any deployed editor surface.
// wysiwyg: only the 5 runtime files ship (test gates live in the same dir);
// react apps: everything under src/ ships via the vite build.
const UI_PATHS = [
  'apps/web/apps/documenteditor-wysiwyg/index.html',
  'apps/web/apps/documenteditor-wysiwyg/editor.js',
  'apps/web/apps/documenteditor-wysiwyg/i18n.js',
  'apps/web/apps/documenteditor-wysiwyg/style.css',
  'apps/web/apps/documenteditor-wysiwyg/wo-bridge.js',
  'apps/web/apps/documenteditor-react',
  'apps/web/apps/spreadsheeteditor-react',
  'apps/web/apps/presentationeditor-react',
  'apps/web/apps/pdfeditor-react',
  'apps/web/apps/visioeditor-react',
].join(' ');
const uiHead = execSync(`git log -1 --format=%h -- ${UI_PATHS}`, opts).toString().trim();
const head = uiHead || execSync('git rev-parse --short HEAD', opts).toString().trim();

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
    // fresh iff prod's sha contains the newest UI-touching commit (ancestry,
    // not equality — prod is deployed at wave boundaries, not per commit)
    let anc = false;
    try {
      execSync(`git merge-base --is-ancestor ${head} ${info.sha}`, opts);
      anc = true;
    } catch { anc = false; }
    if (anc) {
      console.log(`deploy freshness: ok — prod serves ${info.sha} (covers UI head ${head})`);
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

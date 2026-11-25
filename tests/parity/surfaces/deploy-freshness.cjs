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
// 2026-11-16: /word deploys the React canvas editor (documenteditor-react
// vite build). The wysiwyg app is retired from deployment.
const UI_PATHS = [
  'apps/web/apps/documenteditor-react',
  'apps/web/apps/spreadsheeteditor-react',
  'apps/web/apps/presentationeditor-react',
  'apps/web/apps/pdfeditor-react',
  'apps/web/apps/visioeditor-react',
].join(' ');
const uiHead = execSync(`git log -1 --format=%h -- ${UI_PATHS}`, opts).toString().trim();
const head = uiHead || execSync('git rev-parse --short HEAD', opts).toString().trim();

// Substance gate: build-info.json is a STAMP, not content — it can certify
// the wrong app. 2026-11-17..25: prod /word/ served the RETIRED vanilla
// wysiwyg app (id="toolbar" + wo-bridge.js) while the parity census measured
// the React editor. Ancestry of a sha cannot see that; the served HTML can.
const REACT_MARK = 'id="root"';          // documenteditor-react mount point
const VANILLA_MARKS = ['id="toolbar"', 'wo-bridge.js']; // retired wysiwyg app

function getText(u) {
  return new Promise((resolve, reject) => {
    const mod = u.startsWith('http:') ? require('http') : https;
    mod.get(u, { timeout: 20000 }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    }).on('error', reject);
  });
}

async function checkSubstance() {
  const u = `${BASE}/word/`;
  const { status, body } = await getText(u);
  if (status !== 200) return `deploy substance: ${u} -> HTTP ${status}`;
  const vanilla = VANILLA_MARKS.filter((m) => body.includes(m));
  if (!body.includes(REACT_MARK) || vanilla.length) {
    return `deploy substance: WRONG APP — ${u} serves ${body.length}B without "${REACT_MARK}"${vanilla.length ? ` and with the retired-editor markers ${vanilla.join(', ')}` : ''}. ` +
      `The word/ dir staged into editor-ui is the vanilla wysiwyg app, not the documenteditor-react vite build. ` +
      `Re-stage: tests/parity/make-editor-ui.sh ${head} <frontend-dist.zip> (word/ must be a React dist: index.html with id="root").`;
  }
  console.log(`deploy substance: ok — ${u} is the React editor (${body.length}B, id="root")`);
  return null;
}

(async () => {
  const bad = await checkSubstance().catch((e) => `deploy substance: fetch failed — ${e.message}`);
  if (bad) return finish(bad);

  // Freshness (ancestry) — only meaningful once substance proves the RIGHT app is served.
  let r;
  try { r = await getText(url); } catch (e) { return finish(`deploy freshness: fetch failed — ${e.message}`); }
  const { status: statusCode, body } = r;
  if (statusCode !== 200) {
    return finish(`deploy freshness: ${url} -> HTTP ${statusCode} (build-info.json missing or docserver down)`);
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
  finish(`deploy freshness: STALE — prod serves ${info.sha}, local HEAD is ${head}. Deploy: download frontend-dist artifact, then make-editor-ui.sh ${head} builds word/ from documenteditor-react; rsync ~/editor-ui-${head}/ to legion, flip compose mounts, up -d docserver.`);
})();

function finish(msg) {
  if (process.env.WO_FRESHNESS_ALLOW_STALE === '1') {
    console.log(`WARN ${msg}`);
    process.exit(0);
  }
  console.error(msg);
  process.exit(1);
}

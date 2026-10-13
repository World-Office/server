// _boot.cjs — shared boot for parity tests: ensure a wo-docserver test
// instance on :18112 serving the word editor, launch Playwright chromium.
// Env: EDITOR_UI_DIR (default deployed bundle), WO_DOCSERVER_BIN, WO_PORT.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } // installed module (CI)
catch { ({ chromium } = require('/home/weiss/.npm-global/lib/node_modules/playwright')); } // dev box

const PORT = parseInt(process.env.WO_PORT || '18113', 10); // own port: never touch a running dev server
const BASE = `http://127.0.0.1:${PORT}`;
// default UI = the REPO SOURCE, so tests always exercise what is committed
// (not a possibly-stale deployed bundle)
function defaultUiDir() {
  const src = path.resolve(__dirname, '..', '..', 'apps', 'web', 'apps', 'documenteditor-wysiwyg');
  const root = fs.mkdtempSync('/tmp/wo-parity-ui-');
  fs.symlinkSync(src, path.join(root, 'word'));
  return root;
}
const UI_DIR = process.env.EDITOR_UI_DIR || defaultUiDir();
const BIN = process.env.WO_DOCSERVER_BIN ||
  path.join(__dirname, '..', '..', 'target', 'debug', 'wo-docserver');

function httpOk(url) {
  return new Promise((res) => {
    const req = require('http').get(url, { timeout: 1500 }, (r) => { r.resume(); res(r.statusCode === 200); });
    req.on('error', () => res(false));
    req.on('timeout', () => { req.destroy(); res(false); });
  });
}

async function waitFor(url, ms, step = 300) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await httpOk(url)) return true; await new Promise(r => setTimeout(r, step)); }
  return false;
}

// Ensure a server; returns { base, owned } — owned=true means we spawned it.
async function ensureServer() {
  if (await waitFor(`${BASE}/word/`, 1500, 200)) return { base: BASE, owned: false };
  if (!fs.existsSync(BIN)) throw new Error(`docserver binary missing: ${BIN} (build with cargo build -p wo-docserver)`);
  const dataDir = fs.mkdtempSync('/tmp/wo-parity-');
  const child = spawn(BIN, [], {
    env: { ...process.env, JWT_SECRET: 't', DOCSERVER_PORT: String(PORT), DOCSERVER_DATA_DIR: dataDir, EDITOR_UI_DIR: UI_DIR },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', () => {}); // keep pipes drained
  const up = await waitFor(`${BASE}/word/`, 20000);
  if (!up) { child.kill('SIGKILL'); throw new Error('testserver did not come up on ' + BASE); }
  child._woDataDir = dataDir;
  return { base: BASE, owned: true, child };
}

async function launchBrowser() {
  return chromium.launch({ args: ['--force-prefers-reduced-motion'] });
}

async function openEditor(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(`${base}/word/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#editor', { timeout: 15000 });
  await page.waitForTimeout(1500); // editor boot settle
  return { ctx, page };
}

module.exports = { ensureServer, launchBrowser, openEditor, BASE, PORT };

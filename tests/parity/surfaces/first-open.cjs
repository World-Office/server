// surfaces/first-open.cjs — L4 surface probe.
// Guards contract area: the editor boots with the demo document and actually
// RENDERS (painted canvas / non-empty content), not a gray page. Regression
// caught here: gray first open (WASM/x2t not loaded, no doc bytes fetched).
'use strict';
const { ensureServer, launchBrowser, openEditor } = require('../_boot.cjs');

(async () => {
  const server = await ensureServer();
  const browser = await launchBrowser();
  const { page } = await openEditor(browser, server.base);
  await page.waitForTimeout(2500); // give the renderer time to paint
  const r = await page.evaluate(() => {
    const editor = document.querySelector('#editor');
    const text = editor ? editor.textContent.trim().length : 0;
    // the WO renderer paints pages as divs (no canvas) — a rendered doc has
    // visible .wo-page elements; a gray/blank boot leaves them empty or absent
    const pages = [...document.querySelectorAll('.wo-page, #editor [class*=page]')]
      .filter(el => { const r = el.getBoundingClientRect(); return r.width > 400 && r.height > 400; });
    const errors = (window.__woBootErrors || []).length;
    return { ok: text > 20 && pages.length > 0, textLen: text, pages: pages.length, bootErrors: errors };
  });
  console.log(`${r.ok ? 'PASS' : 'FAIL'} first open: text=${r.textLen}ch pages=${r.pages} bootErrors=${r.bootErrors}`);
  await browser.close();
  if (server.owned && server.child) server.child.kill('SIGKILL');
  process.exit(r.ok ? 0 : 1);
})().catch(e => { console.error('PROBE FAIL:', e); process.exit(1); });

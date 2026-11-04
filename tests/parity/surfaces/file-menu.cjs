// surfaces/file-menu.cjs — L4 surface probe.
// Guards contract area: the File backstage opens and exposes its menu items
// (the entry points for the fileinfo/filesettings/fileprotect/filehelp
// dialog contracts).
//
// 2026-11-04: retargeted from #file-menu (an element that no longer exists —
// the probe reported "0 visible items" against markup that moved) to the
// OO-style full-screen backstage (#backstage-overlay, CHROME3-BACKSTAGE).
'use strict';
const { ensureServer, launchBrowser, openEditor } = require('../_boot.cjs');

(async () => {
  const server = await ensureServer();
  const browser = await launchBrowser();
  const { page } = await openEditor(browser, server.base);
  await page.click('#btn-file');
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const m = document.querySelector('#backstage-overlay');
    const vis = m && getComputedStyle(m).display !== 'none' && !m.hidden;
    const items = m ? [...m.querySelectorAll('.backstage-nav button, .backstage-row, .backstage-nav a')] : [];
    const onScreen = items.every(b => { const r = b.getBoundingClientRect(); return r.right <= innerWidth && r.bottom <= innerHeight; });
    return { ok: !!vis && items.length >= 10 && onScreen, items: items.length, onScreen };
  });
  console.log(`${r.ok ? 'PASS' : 'FAIL'} file menu: ${r.items} visible backstage items, onScreen=${r.onScreen}`);
  await browser.close();
  if (server.owned && server.child) server.child.kill('SIGKILL');
  process.exit(r.ok ? 0 : 1);
})().catch(e => { console.error('PROBE FAIL:', e); process.exit(1); });

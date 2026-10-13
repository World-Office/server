// surfaces/file-menu.cjs — L4 surface probe.
// Guards contract area: the File backstage opens and exposes its menu items
// (the entry points for the fileinfo/filesettings/fileprotect/filehelp
// dialog contracts).
'use strict';
const { ensureServer, launchBrowser, openEditor } = require('../_boot.cjs');

(async () => {
  const server = await ensureServer();
  const browser = await launchBrowser();
  const { page } = await openEditor(browser, server.base);
  await page.click('#btn-file');
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const m = document.querySelector('#file-menu');
    const vis = m && getComputedStyle(m).display !== 'none' && !m.hidden;
    const items = m ? [...m.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width > 0) : [];
    const onScreen = items.every(b => { const r = b.getBoundingClientRect(); return r.right <= innerWidth && r.bottom <= innerHeight; });
    return { ok: !!vis && items.length >= 10 && onScreen, items: items.length, onScreen };
  });
  console.log(`${r.ok ? 'PASS' : 'FAIL'} file menu: ${r.items} visible items, onScreen=${r.onScreen}`);
  await browser.close();
  if (server.owned && server.child) server.child.kill('SIGKILL');
  process.exit(r.ok ? 0 : 1);
})().catch(e => { console.error('PROBE FAIL:', e); process.exit(1); });

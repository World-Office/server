// Gate probe for ribbon/ops "review".
// Proves: (1) every command the engine cannot do answers an honest Err — the exact status text
// and NO fake UI; (2) protect-document really toggles the engine's document restriction
// (window.woReviewProbe → get_document_restriction of the app's document) and its status says
// the truth about what typing does afterwards — exactly one consistent pair.
// One `PASS <check>` / `FAIL <check> — <detail>` line per check, page errors are FAILs, exit 1
// on any FAIL. A proven known gap prints `XFAIL <what> — <measured>` and is not counted.
const { chromium } = require('@playwright/test');
const url = process.argv[2];

let failed = 0;
let xfailed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};
const xfail = (name, detail) => {
  xfailed++;
  console.log(`XFAIL ${name} — ${detail}`);
};
const q = (s) => JSON.stringify(s);

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'ready');

  const status = () => page.textContent('#status');
  const tab = (id) => page.click(`[role=tab]#tab-${id}`);
  const pageClick = () => page.locator('.page').first().click();
  const restriction = () => page.evaluate(() => window.woReviewProbe());
  const selected = () => page.evaluate(() => window.woProbe('selected'));
  // Click a ribbon control, wait for the status line to move on from `prev` (a Leptos tick).
  const clickStatus = async (sel) => {
    const prev = await status();
    await page.click(sel);
    await page
      .waitForFunction((p) => document.querySelector('#status').textContent !== p, prev, { timeout: 5000 })
      .catch(() => {});
    return status();
  };
  // Select everything: the ribbon's select-all (Home tab). Its owning module may not be wired
  // yet — then the engine's own Ctrl+A selects instead and the gap is REPORTED, not hidden.
  let selectAllGapReported = false;
  const selectAll = async () => {
    await tab('home');
    const st = await clickStatus('#select-all');
    let sel = await selected();
    if (sel === '') {
      if (!selectAllGapReported) xfail('ribbon select-all is not wired yet (another module)', `status ${q(st)}`);
      selectAllGapReported = true;
      await pageClick();
      await page.keyboard.press('Control+a');
      await page.waitForFunction(() => window.woProbe('selected') !== '', null, { timeout: 5000 });
      sel = await selected();
    }
    return sel;
  };

  // ── 0. the module's root: present, and no fake comment/chat/compare UI inside it ──
  check('#ops-review root exists', (await page.locator('#ops-review').count()) === 1);
  check('#ops-review mounts no fake UI', (await page.locator('#ops-review *').count()) === 0);
  const r0 = JSON.parse(await restriction());
  check('engine: a fresh document is unrestricted', r0.mode === 'none', await restriction());

  // ── 1. type 'abc' ──
  await pageClick();
  await page.keyboard.type('abc');
  check("typing 'abc' lands (insert ok)", (await status()) === 'insert ok', await status());

  // ── 2. Home: track changes — honest Err, no fake toggle ──
  await tab('home');
  const tc = await clickStatus('#track-changes');
  check('Home #track-changes → honest Err', tc === 'toggleTrackChanges failed — the engine has no revision op', q(tc));
  check('#track-changes shows no pressed state', (await page.locator('#track-changes').getAttribute('aria-pressed')) !== 'true');

  // ── 3. Collaboration: comments, changes, display, compare, mail merge, chat ──
  await tab('collaboration');
  const expected = [
    ['#add-comment', 'addComment failed — the engine has no comments op'],
    ['#delete-comment', 'deleteComment failed — the engine has no comments op'],
    ['#resolve-comment', 'resolveComment failed — the engine has no comments op'],
    ['#comments-panel', 'toggleComment failed — the engine has no comments op'],
    ['#accept-change', 'acceptChange failed — there are no tracked changes — the engine has no revision op'],
    ['#reject-change', 'rejectChange failed — there are no tracked changes — the engine has no revision op'],
    ['#accept-all', 'acceptAllChanges failed — there are no tracked changes — the engine has no revision op'],
    ['#reject-all', 'rejectAllChanges failed — there are no tracked changes — the engine has no revision op'],
    ['#previous-change', 'previousChange failed — there are no tracked changes — the engine has no revision op'],
    ['#next-change', 'nextChange failed — there are no tracked changes — the engine has no revision op'],
    ['#display-mode', 'displayMode failed — display modes are not available yet'],
    ['#compare-documents', 'compareDocuments failed — document compare is not available in the editor'],
    ['#combine-documents', 'combineDocuments failed — document compare is not available in the editor'],
    ['#mail-merge', 'mailMerge failed — mail merge is not available in the editor'],
  ];
  for (const [sel, want] of expected) {
    const got = await clickStatus(sel);
    check(`Collaboration ${sel} → honest Err`, got === want, q(got));
  }
  const chat = await clickStatus('#chat-panel');
  check('Collaboration #chat-panel → honest Err', chat === 'chat failed — chat is not wired up yet', q(chat));
  check('no comment/chat panel appeared', (await page.locator('#ops-review *').count()) === 0 && (await page.locator('.chat, .comments').count()) === 0);
  check("typing 'abc' is untouched by the Err commands", (await selected()) === '' && (await restriction()).includes('"none"'), await restriction());

  // ── 4. Protection: protect → engine says readOnly; status says what typing will do ──
  await tab('protection');
  const protectStatus = await clickStatus('#protect-document');
  check('#protect-document status starts with "protect-document ok"', protectStatus.startsWith('protect-document ok'), q(protectStatus));
  const r1 = JSON.parse(await restriction());
  check('engine: restriction recorded as readOnly', r1.mode === 'readOnly', await restriction());
  check('engine: print/copy permissions untouched', r1.allowPrint === true && r1.allowCopy === true, await restriction());

  // ── 5. type 'x' after protecting, then select all and read the ENGINE's text ──
  // The page click hit-tests the text line and may drop the caret INSIDE 'abc': End puts it at
  // the line's end first, so a landed 'x' is exactly "abcx" (the spec's own step-8 pattern).
  await pageClick();
  await page.keyboard.press('End');
  check('End key reaches the engine (after protecting)', (await status()) === 'key End ok', await status());
  await page.keyboard.type('x');
  const afterX = await status();
  const sel = await selectAll(); // the ENGINE's selection text, not the status line
  check('select-all selected the typed text (read from the engine)', sel.length >= 3, q(sel));
  const claimedSeal = !protectStatus.includes('edits are not blocked yet');
  const editsLanded = sel.includes('x');
  const editsBlocked = sel === 'abc';
  check('protect verdict is ONE consistent pair (status ↔ what typing did)',
    (editsLanded && !claimedSeal) || (editsBlocked && claimedSeal),
    `status ${q(protectStatus)}, selected ${q(sel)}, typing status ${q(afterX)}`);
  check("typing after protecting is NOT blocked by the engine: selected === 'abcx' (status says 'edits are not blocked yet')",
    sel === 'abcx' && afterX === 'insert ok', q(sel));

  // ── 6. unprotect → engine says none, status says unprotected ──
  await tab('protection');
  const unprotectStatus = await clickStatus('#protect-document');
  check('#protect-document again → "protect-document ok (unprotected)"', unprotectStatus === 'protect-document ok (unprotected)', q(unprotectStatus));
  check('engine: restriction cleared', JSON.parse(await restriction()).mode === 'none', await restriction());

  // ── 7. click, End, type 'y' → select all → ends with 'y' ──
  await pageClick();
  await page.keyboard.press('End');
  check('End key reaches the engine', (await status()) === 'key End ok', await status());
  await page.keyboard.type('y');
  check("typing 'y' lands (insert ok)", (await status()) === 'insert ok', await status());
  const selY = await selectAll();
  check("selected text ends with 'y'", selY.endsWith('y'), q(selY));
  check('the text grew by the typed characters', selY.length === sel.length + 1, `${sel.length} → ${selY.length}`);

  // ── 8. Protection: encrypt ──
  await tab('protection');
  const enc = await clickStatus('#encrypt');
  check('#encrypt → honest Err', enc === 'encrypt failed — document encryption is not available in the editor', q(enc));

  // ── 9. Draw tab (edit mode) checkbox: pressed look is the base's; the status stays honest ──
  await page.evaluate(() => window.woSetEditMode(true));
  await tab('draw');
  const dtc = await clickStatus('#draw-track-changes');
  check('#draw-track-changes aria-pressed === "true" after click', (await page.locator('#draw-track-changes').getAttribute('aria-pressed')) === 'true');
  check('#draw-track-changes status starts with "toggleTrackChanges failed"', dtc.startsWith('toggleTrackChanges failed'), q(dtc));
  check('#draw-track-changes → the same honest Err', dtc === 'toggleTrackChanges failed — the engine has no revision op', q(dtc));
  const dtc2 = await clickStatus('#draw-track-changes');
  check('#draw-track-changes toggles back (aria-pressed "false"), still honest', (await page.locator('#draw-track-changes').getAttribute('aria-pressed')) === 'false' && dtc2 === 'toggleTrackChanges failed — the engine has no revision op', q(dtc2));

  // ── 10. page errors ──
  check('no page errors', errors.length === 0, errors.join(' | '));

  await browser.close();
  console.log(failed ? `MODULE: ${failed} FAILED` : `MODULE OK${xfailed ? ` (${xfailed} known gap${xfailed > 1 ? 's' : ''})` : ''}`);
  process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error('PROBE CRASHED', e.stack || e.message); process.exit(2); });

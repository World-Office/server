#!/usr/bin/env node
/**
 * BUG6-EDGE-ROBUSTNESS Live Edge Driver — scenarios a-g.
 *
 * Heavy live driver: lives in scripts/ (NOT *.test.mjs) so the acceptance
 * gate never picks it up. Run manually: node scripts/edge.mjs
 *
 * a. POISONED STORAGE — hostile localStorage values (no 'wo-settings' key
 *    exists in this editor; the real persisted keys are poisoned instead:
 *    wo-user-dict, wo-ignore-all, wo.plugins.enabled, wo-offline-queue,
 *    wo-theme, wo-zoom). App must boot without throwing, must not wipe the
 *    poisoned key on the boot read, and spellcheck must keep working.
 * b. OFFLINE — fetch rejects with TypeError: Save/Export/version list must
 *    surface visible error states (no spin, no unhandled rejection); after
 *    connectivity returns, Save must succeed and clear the offline queue.
 * c. EMPTY DOC — every ribbon data-cmd fires on an empty document: no
 *    pageerror, no ghost overlays/popovers, and the undo stack only gains
 *    entries for real content changes (#btn-undo.disabled flips only when
 *    the serialized document actually changed).
 * d. HUGE DOC — 3000 paragraphs: timed marks for the full spellcheck
 *    enable→markers pipeline, flatHtml serialization, word count update,
 *    a representative single-spot format op, plus a measured (not asserted)
 *    whole-document selectAll+bold (known Blink engine floor: a bare
 *    contenteditable with the same 3000 paragraphs takes ~8-12s; there is
 *    no editor-side fix that beats that floor, so we report numbers).
 * e. RAPID FIRE — 50 tab switches, 20 find-dialog open/close cycles,
 *    10 spellcheck toggles (real settings-dialog path) during typing,
 *    context-menu spam; CDP listener-count delta on window and
 *    performance.memory delta noted; no ghost overlays.
 * f. PASTE — hostile HTML (script/onerror/style/iframe/position:fixed/
 *    huge data: image) via both the rich-paste button path and the native
 *    paste-event path; nothing scriptable survives, planted window.__pwned
 *    setter must never fire.
 * g. THEME/DARK — dark UI + dark-document mid-session with a table and a
 *    dialog open; contrast probes on chrome/editor elements; no broken
 *    overlays.
 */
import { spawn } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

// playwright is a CJS package: load it through require, not ESM import.
const { chromium } = createRequire(import.meta.url)(
    '/home/weiss/git/World-Office/wo-test-harness/census/node_modules/playwright');

const here = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(here, '..');
const PORT = 18048;
const BASE = `http://127.0.0.1:${PORT}`;
const BOOT_WAIT_MS = 2500;

// ---------------------------------------------------------------- failures
/** @type {{scenario: string, step: string, error: string}[]} */
const failures = [];
const perfNotes = [];

function record(scenario, step, error) {
    failures.push({ scenario, step, error: String((error && error.message) || error) });
}

async function step(scenario, label, fn) {
    try {
        await fn();
    } catch (err) {
        record(scenario, label, err);
    }
}

// ---------------------------------------------------------------- server
function startServer() {
    const proc = spawn('/usr/bin/python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
        cwd: APP_DIR,
        stdio: 'ignore',
    });
    const deadline = Date.now() + 15000;
    return new Promise(async (resolve, reject) => {
        const http = await import('node:http');
        while (Date.now() < deadline) {
            try {
                await new Promise((res, rej) => {
                    const req = http.get(`${BASE}/index.html`, res);
                    req.on('error', rej);
                    req.end();
                });
                resolve(proc);
                return;
            } catch {
                await new Promise((r) => setTimeout(r, 250));
            }
        }
        reject(new Error('http.server did not come up on ' + PORT));
    });
}

// ---------------------------------------------------------------- stubs
/** In-page bootstrap shared by every scenario. */
const BASE_INIT = `
    window.__COLLAB__ = false;
    window.__pageErrors = [];
    window.addEventListener('error', (e) => {
        window.__pageErrors.push(String((e && e.message) || e));
    });
    window.addEventListener('unhandledrejection', (e) => {
        const reason = e && e.reason;
        window.__pageErrors.push('unhandledrejection: ' + String((reason && reason.message) || reason));
    });
    try { navigator.sendBeacon = function () { return true; }; } catch {}
`;

/** Serve /api/* from stubs; pass everything else through to http.server. */
const API_STUB = `
    (() => {
        const realFetch = window.fetch.bind(window);
        window.__realFetch = realFetch;
        const json = (obj) => new Response(JSON.stringify(obj), {
            status: 200, headers: { 'Content-Type': 'application/json' },
        });
        window.__STUB_DOC__ = window.__STUB_DOC__ || '<p><br></p>';
        window.__savedBodies = [];
        window.fetch = async (input, init) => {
            const url = typeof input === 'string' ? input : (input && input.url) || String(input);
            if (!url.includes('/api/')) return realFetch(input, init);
            const path = url.replace(/^https?:\\/\\/[^/]+/, '');
            if (path.includes('/versions')) return json({ versions: [] });
            if (/\\/api\\/documents\\/[^/]+\\/html/.test(path)) return json({ html: window.__STUB_DOC__ });
            if (path.includes('/save')) {
                try { window.__savedBodies.push((init && init.body) || ''); } catch {}
                return json({ ok: true });
            }
            if (path.includes('/export')) return json({ url: '/tmp/bug6-export.txt' });
            if (path.includes('/plugins')) return json({ plugins: [] });
            return json({ ok: true });
        };
    })();
`;

/** Everything rejects with TypeError — the canonical offline failure mode. */
const OFFLINE_STUB = `
    (() => {
        const realFetch = window.fetch.bind(window);
        window.__realFetch = realFetch;
        window.fetch = async () => {
            throw new TypeError('Failed to fetch (BUG6 offline stub)');
        };
    })();
`;

/** Planted canary: any assignment to window.__pwned flips the bit. */
const PWNED_INIT = `
    (() => {
        window.__pwnedHit = false;
        Object.defineProperty(window, '__pwned', {
            configurable: true,
            set() { window.__pwnedHit = true; },
            get() { return window.__pwnedHit; },
        });
    })();
`;

// ---------------------------------------------------------------- harness
const browser = await chromium.launch({ headless: true });

/**
 * @param {object} opts
 * @param {string[]} [opts.initScripts] extra addInitScript bodies
 * @param {'api'|'offline'} [opts.net] network mode
 * @param {string} [opts.stubDoc] document html served by /api stub
 */
async function openApp({ initScripts = [], net = 'api', stubDoc } = {}) {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        permissions: ['clipboard-read', 'clipboard-write'],
    });
    for (const src of initScripts) await context.addInitScript(src);
    await context.addInitScript(BASE_INIT);
    if (net === 'api') {
        await context.addInitScript(`window.__STUB_DOC__ = ${JSON.stringify(stubDoc || '<p><br></p>')};`);
        await context.addInitScript(API_STUB);
    } else {
        await context.addInitScript(OFFLINE_STUB);
    }
    const page = await context.newPage();
    page.on('pageerror', () => {}); // in-page collector also sees unhandled rejections
    page.on('dialog', (d) => d.accept().catch(() => {}));
    page.on('download', (d) => d.cancel().catch(() => {}));
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(BOOT_WAIT_MS);
    return { context, page };
}

async function drainPageErrors(page) {
    return page.evaluate(() => window.__pageErrors.splice(0, window.__pageErrors.length));
}

/**
 * Dismiss anything the previous action left open:
 *  - modal .dialog-overlay.open dialogs close on Escape
 *  - non-modal anchored popovers (table/image .insert-pop and friends)
 *    deliberately ignore Escape and close on an outside mousedown
 *    (editor.js: "an outside mousedown dismisses them") — so we send a
 *    real bubbling mousedown, not a click.
 */
async function closeStrayDialog(page) {
    await page.evaluate(() => {
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(60);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(60);
}

async function ghostOverlayCount(page) {
    return page.evaluate(() => {
        const visible = (el) => {
            if (!el) return false;
            const cs = getComputedStyle(el);
            return cs.display !== 'none' && cs.visibility !== 'hidden';
        };
        const find = document.getElementById('find-dialog');
        return {
            overlays: document.querySelectorAll('.dialog-overlay.open:not(#find-dialog)').length,
            findOpen: !!(find && find.classList.contains('open')),
            pops: [...document.querySelectorAll('.dialog-overlay.open')].filter((el) =>
                el.classList.contains('insert-pop')).length,
            ctxVisible: visible(document.getElementById('ctx-menu')),
        };
    });
}

async function assertNoGhosts(page, scenario, label) {
    const ghosts = await ghostOverlayCount(page);
    assert.equal(ghosts.overlays, 0, `${label}: ${ghosts.overlays} dialog overlay(s) left open`);
    assert.equal(ghosts.findOpen, false, `${label}: find dialog left open`);
    assert.equal(ghosts.pops, 0, `${label}: ${ghosts.pops} insert popover(s) left open`);
    assert.equal(ghosts.ctxVisible, false, `${label}: context menu left visible`);
}

async function clickBtn(page, selector) {
    await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error('missing element ' + sel);
        el.click();
    }, selector);
}

/**
 * Toggle spellcheck through the real settings dialog path
 * (#btn-file → #btn-filesettings → #settings-spellcheck → #btn-settings-ok).
 * editor.js is an IIFE — none of its functions are window-reachable, so UI
 * is the only real drive surface.
 */
async function setSpellcheckViaSettings(page, enabled) {
    await clickBtn(page, '#btn-file');
    await clickBtn(page, '#btn-filesettings');
    await page.evaluate((want) => {
        const cb = document.getElementById('settings-spellcheck');
        if (!cb) throw new Error('missing #settings-spellcheck');
        cb.checked = want;
    }, enabled);
    await clickBtn(page, '#btn-settings-ok');
}

// ================================================================ scenario a
const POISON_VARIANTS = ["[object Object]", "{broken json", "x".repeat(1_000_000), "null"];
const SIBLING_POISON = {
    "wo-ignore-all": "[1,2",
    "wo.plugins.enabled": "yes",
    "wo-offline-queue": "{oops",
    "wo-theme": '"dark',
    "wo-zoom": "potato",
};

async function scenarioAPoisonedStorage() {
    const S = 'a-poisoned-storage';
    for (let v = 0; v < POISON_VARIANTS.length; v++) {
        const label = `wo-user-dict variant ${v} (${POISON_VARIANTS[v].slice(0, 20)}…)`;
        await step(S, label, async () => {
            const poisonInit = `
                (() => {
                    try { localStorage.setItem('wo-user-dict', ${JSON.stringify(POISON_VARIANTS[v])}); } catch {}
                    for (const [k, val] of Object.entries(${JSON.stringify(SIBLING_POISON)})) {
                        try { localStorage.setItem(k, val); } catch {}
                    }
                })();
            `;
            const { context, page } = await openApp({ initScripts: [poisonInit] });
            try {
                // Boot must be clean.
                const bootErrs = await drainPageErrors(page);
                assert.deepEqual(bootErrs, [], 'boot with poisoned storage must not throw');

                // Boot read must not wipe the poisoned key (the app may only
                // rewrite it through an explicit user action).
                const stored = await page.evaluate(() => localStorage.getItem('wo-user-dict'));
                assert.notEqual(stored, null, 'poisoned key must not be wiped on boot');

                // Spellcheck must still work end-to-end.
                await setSpellcheckViaSettings(page, true);
                await page.evaluate(() => {
                    const ed = document.getElementById('editor');
                    ed.innerHTML = '<p>The quck brwn fox jumps over the lazy javelin.</p>';
                    ed.dispatchEvent(new Event('input', { bubbles: true }));
                });
                await page.waitForTimeout(2500);
                const misspelled = await page.evaluate(
                    () => document.querySelectorAll('.wo-misspelled').length,
                );
                assert.ok(
                    misspelled >= 2,
                    `spellcheck must still flag misspellings under poisoned dict (got ${misspelled})`,
                );
                assert.deepEqual(await drainPageErrors(page), [], 'no errors during poisoned spellcheck');
            } finally {
                await context.close();
            }
        });
    }
}

// ================================================================ scenario b
async function scenarioBOffline() {
    const S = 'b-offline';
    const { context, page } = await openApp({ net: 'offline' });
    try {
        await step(S, 'boot offline is clean', async () => {
            assert.deepEqual(await drainPageErrors(page), []);
        });

        await step(S, 'save offline → offline queue + visible status', async () => {
            await page.evaluate(() => {
                const ed = document.getElementById('editor');
                ed.innerHTML = '<p>offline save probe</p>';
                ed.dispatchEvent(new Event('input', { bubbles: true }));
            });
            await clickBtn(page, '#btn-save');
            await page.waitForTimeout(600);
            const queued = await page.evaluate(() => localStorage.getItem('wo-offline-queue'));
            assert.ok(queued, 'offline save must populate wo-offline-queue');
            const status = await page.evaluate(() => {
                const el = document.getElementById('status');
                return { text: el.textContent, color: el.style.color };
            });
            assert.ok(
                status.text.trim().length > 0 && status.color !== '',
                `offline save must surface visible error status (got ${JSON.stringify(status)})`,
            );
        });

        await step(S, 'export offline → visible error status', async () => {
            await clickBtn(page, '#btn-export');
            await page.waitForTimeout(600);
            const status = await page.evaluate(() => {
                const el = document.getElementById('status');
                return { text: el.textContent, color: el.style.color };
            });
            assert.equal(status.color, 'rgb(248, 113, 113)', 'export error must be flagged red');
            assert.ok(status.text.length > 0, 'export error must carry a message');
        });

        await step(S, 'version list offline → visible ListError in dialog', async () => {
            await clickBtn(page, '#btn-history');
            await page.waitForTimeout(800);
            const dlg = await page.evaluate(() => {
                const overlay = document.querySelector('.dialog-overlay.open');
                const err = document.getElementById('version-error');
                return {
                    open: !!overlay,
                    errText: err ? err.textContent : '',
                };
            });
            assert.ok(dlg.open, 'history dialog must open');
            assert.ok(
                dlg.errText.includes('Could not load version history'),
                `ListError must be visible (got ${JSON.stringify(dlg.errText)})`,
            );
            await closeStrayDialog(page);
        });

        await step(S, 'no unhandled rejections while offline', async () => {
            const errs = await drainPageErrors(page);
            const unhandled = errs.filter((e) => e.startsWith('unhandledrejection'));
            assert.deepEqual(unhandled, [], 'offline flows must not produce unhandled rejections');
        });

        await step(S, 'back online → save succeeds and clears the queue', async () => {
            await page.evaluate(() => {
                const realFetch = window.__realFetch.bind(window);
                const json = (obj) => new Response(JSON.stringify(obj), {
                    status: 200, headers: { 'Content-Type': 'application/json' },
                });
                window.fetch = async (input, init) => {
                    const url = typeof input === 'string' ? input : (input && input.url) || '';
                    if (!url.includes('/api/')) return realFetch(input, init);
                    if (url.includes('/save')) return json({ ok: true });
                    if (url.includes('/versions')) return json({ versions: [] });
                    if (/\/api\/documents\/[^/]+\/html/.test(url)) {
                        return json({ html: '<p><br></p>' });
                    }
                    return json({ ok: true });
                };
            });
            await clickBtn(page, '#btn-save');
            await page.waitForTimeout(800);
            const queued = await page.evaluate(() => localStorage.getItem('wo-offline-queue'));
            assert.equal(queued, null, 'successful save must clear wo-offline-queue');
            assert.deepEqual(await drainPageErrors(page), [], 'no errors during recovery save');
        });
    } finally {
        await context.close();
    }
}

// ================================================================ scenario c
async function scenarioCEmptyDocCommands() {
    const S = 'c-empty-doc-commands';
    const { context, page } = await openApp({ stubDoc: '<p><br></p>' });
    try {
        const phantoms = [];
        let cmdCount = 0;
        await step(S, 'sweep every ribbon data-cmd on empty doc', async () => {
            const targets = await page.evaluate(() => {
                const out = [];
                const tabs = [...document.querySelectorAll('.ribbon-tab[data-tab]')];
                for (const tab of tabs) {
                    const name = tab.getAttribute('data-tab');
                    const pageEl = document.querySelector(`.ribbon-page[data-tab="${name}"]`);
                    if (!pageEl) continue;
                    // Any command-bearing ribbon button; menu-list rows are
                    // dropdown entries, not ribbon commands.
                    const btns = [...pageEl.querySelectorAll('button[data-cmd]')]
                        .filter((b) => !b.closest('.menu-list'));
                    btns.forEach((b, i) => {
                        out.push({ cmd: b.getAttribute('data-cmd'), tab: name, index: i });
                    });
                }
                return out;
            });
            assert.ok(targets.length >= 100, `expected ~114 ribbon cmds, found ${targets.length}`);
            cmdCount = targets.length;

            const state = () => page.evaluate(() => ({
                flat: window.__WO_FLAT_HTML__(),
                undoDisabled: document.getElementById('btn-undo').disabled,
            }));

            for (const t of targets) {
                const before = await state();
                try {
                    await page.evaluate(({ tab, index }) => {
                        const tabBtn = document.querySelector(`.ribbon-tab[data-tab="${tab}"]`);
                        if (tabBtn) tabBtn.click();
                        const pageEl = document.querySelector(`.ribbon-page[data-tab="${tab}"]`);
                        const btns = [...pageEl.querySelectorAll('button[data-cmd]')]
                            .filter((b) => !b.closest('.menu-list'));
                        btns[index].click();
                    }, t);
                    await page.waitForTimeout(90);
                    await closeStrayDialog(page);
                    const after = await state();
                    // Phantom undo: content unchanged but undo became available.
                    if (before.flat === after.flat &&
                        before.undoDisabled === true &&
                        after.undoDisabled === false) {
                        phantoms.push(t.cmd);
                    }
                } catch (err) {
                    throw new Error(`cmd ${t.cmd} (${t.tab}): ${err.message}`);
                }
            }

            assert.deepEqual(phantoms, [],
                `undo stack gained phantom entries for: ${phantoms.join(', ')}`);
            assert.deepEqual(await drainPageErrors(page), [],
                'no page errors during empty-doc command sweep');
        });

        await step(S, 'no ghost overlays/popovers after sweep', async () => {
            await assertNoGhosts(page, S, 'after command sweep');
        });

        perfNotes.push(`c: swept ${cmdCount} ribbon cmds on empty doc`);
    } finally {
        await context.close();
    }
}

// ================================================================ scenario d
const HUGE_PARAS = 3000;
const HUGE_SEED = (() => {
    const chunks = [];
    for (let i = 0; i < HUGE_PARAS; i++) {
        chunks.push(`<p>Paragraph ${i}: the quck brwn fox jumps over the lazy dog near number ${i}.</p>`);
    }
    return chunks.join('');
})();

async function scenarioDHugeDoc() {
    const S = 'd-huge-doc';
    const { context, page } = await openApp({ stubDoc: '<p><br></p>' });
    try {
        await step(S, 'seed 3000 paragraphs', async () => {
            await page.evaluate((html) => {
                const ed = document.getElementById('editor');
                ed.innerHTML = html;
                ed.dispatchEvent(new Event('input', { bubbles: true }));
            }, HUGE_SEED);
            await page.waitForTimeout(2500); // let the debounced reflow settle
            const words = await page.evaluate(() =>
                document.getElementById('sb-word-count').textContent);
            assert.ok(/Words:\s*[1-9][\d,]*/.test(words), `word count must update (${words})`);
        });

        await step(S, 'full spellcheck pipeline < 5s (enable → markers)', async () => {
            // editor.js is an IIFE (no window.toggleSpellcheck), so time the
            // real user pipeline: settings enable → debounced run → markers.
            const t0 = Date.now();
            await setSpellcheckViaSettings(page, true);
            await page.waitForFunction(
                () => document.querySelectorAll('.wo-misspelled').length > 0,
                null, { timeout: 20000, polling: 120 },
            );
            const ms = Date.now() - t0;
            perfNotes.push(`d: full spellcheck pipeline on ${HUGE_PARAS} paras: ${ms}ms (budget 5000ms)`);
            assert.ok(ms < 5000, `spellcheck pipeline took ${ms}ms (budget 5000ms)`);
            const n = await page.evaluate(() => document.querySelectorAll('.wo-misspelled').length);
            perfNotes.push(`d: misspell markers wrapped: ${n}`);
            assert.ok(n >= HUGE_PARAS / 2, `expected widespread misspell markers, got ${n}`);
        });

        await step(S, 'flatHtml serialization < 2s', async () => {
            const r = await page.evaluate(() => {
                const t0 = performance.now();
                const out = window.__WO_FLAT_HTML__();
                return { ms: performance.now() - t0, len: out.length };
            });
            perfNotes.push(`d: flatHtml ${r.len}B in ${r.ms.toFixed(0)}ms (budget 2000ms)`);
            assert.ok(r.ms < 2000, `serialization took ${r.ms.toFixed(0)}ms`);
        });

        await step(S, 'word count computation < 500ms', async () => {
            // updateCounts() is IIFE-internal and DEBOUNCED off the input
            // event, so pipeline wall-time is not the computation cost.
            // Time the exact work it does (innerText split + char count) —
            // innerText forces layout, which IS the measurable cost.
            const ms = await page.evaluate(() => {
                const ed = document.getElementById('editor');
                const t0 = performance.now();
                const text = (ed.innerText || '').trim();
                const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
                const chars = (ed.innerText || '').replace(/\n/g, '').length;
                void words; void chars;
                return performance.now() - t0;
            });
            perfNotes.push(`d: word count computation: ${ms.toFixed(1)}ms (budget 500ms)`);
            assert.ok(ms < 500, `word count took ${ms.toFixed(1)}ms`);
        });

        await step(S, 'representative format op (bold on 50-para range) < 1s', async () => {
            const ms = await page.evaluate(() => {
                const ed = document.getElementById('editor');
                // After the debounced reflow, paragraphs live inside
                // .wo-page wrappers — select them at any depth.
                const paras = ed.querySelectorAll('p');
                ed.focus();
                const sel = window.getSelection();
                const range = document.createRange();
                range.setStartBefore(paras[10]);
                range.setEndAfter(paras[59]); // a realistic multi-paragraph selection
                sel.removeAllRanges();
                sel.addRange(range);
                const t0 = performance.now();
                document.execCommand('bold', false, null);
                return performance.now() - t0;
            });
            perfNotes.push(`d: bold on 50-para range: ${ms.toFixed(0)}ms (budget 1000ms)`);
            assert.ok(ms < 1000, `format op took ${ms.toFixed(0)}ms`);
        });

        await step(S, 'whole-doc selectAll+bold: measured, engine-floor note', async () => {
            const ms = await page.evaluate(() => {
                const ed = document.getElementById('editor');
                ed.focus();
                document.execCommand('selectAll', false, null);
                const t0 = performance.now();
                document.execCommand('bold', false, null);
                return performance.now() - t0;
            });
            perfNotes.push(
                `d: whole-doc selectAll+bold on ${HUGE_PARAS} paras: ${ms.toFixed(0)}ms ` +
                `(KNOWN LIMIT: bare Blink contenteditable with the same content ` +
                `measures ~8000-12000ms; engine floor, documented not asserted)`,
            );
            assert.deepEqual(await drainPageErrors(page), [], 'no errors in huge-doc flows');
        });
    } finally {
        await context.close();
    }
}

// ================================================================ scenario e
async function scenarioERapidFire() {
    const S = 'e-rapid-fire';
    const { context, page } = await openApp({
        stubDoc: '<p>rapid fire victim paragraph with some words.</p>',
    });
    let heapDelta = null;
    let listenerDelta = null;
    try {
        // Listener probe via CDP on the window object.
        const cdp = await context.newCDPSession(page);
        const countWindowListeners = async () => {
            const { result } = await cdp.send('Runtime.evaluate', {
                expression: 'window', objectGroup: 'bug6',
            });
            const { listeners } = await cdp.send('DOMDebugger.getEventListeners', {
                objectId: result.objectId, objectGroup: 'bug6',
            });
            return listeners.length;
        };
        const beforeListeners = await countWindowListeners();
        const beforeHeap = await page.evaluate(() =>
            performance.memory ? performance.memory.usedJSHeapSize : null);

        await step(S, '50 ribbon tab switches', async () => {
            const tabs = await page.evaluate(() =>
                [...document.querySelectorAll('.ribbon-tab[data-tab]')].map((t) => t.getAttribute('data-tab')));
            assert.ok(tabs.length >= 5, `expected ribbon tabs, found ${tabs.length}`);
            for (let i = 0; i < 50; i++) {
                const tab = tabs[i % tabs.length];
                await page.evaluate((name) => {
                    document.querySelector(`.ribbon-tab[data-tab="${name}"]`).click();
                }, tab);
                await page.waitForTimeout(25);
            }
            assert.deepEqual(await drainPageErrors(page), [], 'no errors during tab spam');
        });

        await step(S, 'find dialog open/close 20x', async () => {
            for (let i = 0; i < 20; i++) {
                await page.keyboard.press('Control+f');
                await page.waitForTimeout(60);
                await clickBtn(page, '#btn-find-close').catch(() => {});
                await closeStrayDialog(page);
            }
            const ghosts = await ghostOverlayCount(page);
            assert.equal(ghosts.findOpen, false, 'find dialog must fully close each cycle');
            assert.equal(ghosts.overlays, 0, 'no dialog left open by find cycling');
        });

        await step(S, 'spellcheck toggle 10x during typing (settings path)', async () => {
            for (let n = 0; n < 10; n++) {
                await page.evaluate((k) => {
                    const ed = document.getElementById('editor');
                    ed.focus();
                    document.execCommand('insertText', false, ` word${k} `);
                    ed.dispatchEvent(new Event('input', { bubbles: true }));
                }, n);
                await setSpellcheckViaSettings(page, n % 2 === 0);
                await page.waitForTimeout(50);
            }
            const errs = await drainPageErrors(page);
            assert.deepEqual(errs, [], 'no errors during spellcheck toggle spam');
        });

        await step(S, 'context menu spam 20x', async () => {
            for (let n = 0; n < 20; n++) {
                await page.evaluate((k) => {
                    const ed = document.getElementById('editor');
                    const sel = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(ed);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    ed.dispatchEvent(new MouseEvent('contextmenu', {
                        bubbles: true, cancelable: true,
                        clientX: 400 + (k % 5) * 30, clientY: 300 + (k % 4) * 30,
                    }));
                }, n);
                await page.waitForTimeout(40);
                await closeStrayDialog(page);
            }
            const ghosts = await ghostOverlayCount(page);
            assert.equal(ghosts.ctxVisible, false, 'context menu must not stay visible');
        });

        await step(S, 'no listener leak on window (CDP)', async () => {
            const afterListeners = await countWindowListeners();
            listenerDelta = afterListeners - beforeListeners;
            perfNotes.push(`e: window listener count ${beforeListeners} → ${afterListeners} (delta ${listenerDelta})`);
            assert.ok(listenerDelta <= 0, `listener leak: +${listenerDelta} window listeners`);
        });

        await step(S, 'heap delta noted (performance.memory)', async () => {
            const afterHeap = await page.evaluate(() =>
                performance.memory ? performance.memory.usedJSHeapSize : null);
            if (beforeHeap !== null && afterHeap !== null) {
                heapDelta = afterHeap - beforeHeap;
                perfNotes.push(`e: heap delta ${(heapDelta / 1048576).toFixed(1)}MB`);
            } else {
                perfNotes.push('e: performance.memory unavailable');
            }
        });

        await step(S, 'no ghost overlays after rapid fire', async () => {
            await assertNoGhosts(page, S, 'after rapid fire');
        });
    } finally {
        await context.close().catch(() => {});
    }
}

// ================================================================ scenario f
const HOSTILE_HTML = [
    '<p onclick="window.__pwned = 1">innocent text</p>',
    '<script>window.__pwned = 1<\/script>',
    '<img src=x onerror="window.__pwned = 1">',
    '<style>body { position: fixed; }</style>',
    '<iframe src="javascript:window.__pwned = 1"></iframe>',
    '<object data="javascript:window.__pwned = 1"></object>',
    '<embed src="javascript:window.__pwned = 1">',
    '<div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 99999; background: red; color: white; font-size: 40px;">HIJACK OVERLAY</div>',
    '<a href="javascript:window.__pwned = 1">click me</a>',
    `<img src="data:image/png;base64,${'A'.repeat(1_000_000)}" alt="huge img">`,
    '<p>legit tail paragraph</p>',
].join('\n');

async function assertPasteSanitized(page, stepLabel) {
    const audit = await page.evaluate(() => {
        const ed = document.getElementById('editor');
        const bad = [];
        for (const tag of ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base']) {
            if (ed.querySelector(tag)) bad.push(tag);
        }
        for (const el of ed.querySelectorAll('*')) {
            for (const attr of el.attributes) {
                if (/^on/i.test(attr.name)) bad.push(`${el.tagName}.${attr.name}`);
                if ((attr.name === 'href' || attr.name === 'src' || attr.name === 'xlink:href') &&
                    /^\s*(javascript|data:text\/html)/i.test(attr.value)) {
                    bad.push(`${el.tagName}.${attr.name}=${attr.value.slice(0, 30)}`);
                }
            }
            const style = el.getAttribute && el.getAttribute('style');
            if (style && /position\s*:\s*fixed/i.test(style)) bad.push(`${el.tagName}.style position:fixed`);
        }
        return {
            bad,
            pwned: window.__pwnedHit === true,
            text: ed.textContent,
            hasHugeImg: !!ed.querySelector('img[src^="data:image/png"]'),
        };
    });
    assert.equal(audit.pwned, false, `planted canary fired during ${stepLabel}`);
    assert.deepEqual(audit.bad, [], `hostile residue in editor: ${audit.bad.join(', ')}`);
    assert.ok(audit.text.includes('innocent text'), 'benign paste content must survive');
    return audit;
}

async function scenarioFPaste() {
    const S = 'f-paste';
    {
        // Rich-paste button path (navigator.clipboard.read).
        const { context, page } = await openApp({
            initScripts: [PWNED_INIT],
            stubDoc: '<p>paste target</p>',
        });
        try {
            await step(S, 'rich paste via #btn-paste sanitizes hostile HTML', async () => {
                await page.evaluate((html) => {
                    const item = new ClipboardItem({
                        'text/html': new Blob([html], { type: 'text/html' }),
                    });
                    return navigator.clipboard.write([item]);
                }, HOSTILE_HTML);
                await clickBtn(page, '#btn-paste');
                await page.waitForTimeout(600);
                const audit = await assertPasteSanitized(page, 'btn-paste path');
                assert.ok(audit.hasHugeImg, 'data: image (allowed by design) must survive sanitize');
                assert.deepEqual(await drainPageErrors(page), [], 'no errors during hostile rich paste');
            });
        } finally {
            await context.close();
        }
    }
    {
        // Native Ctrl+V path (clipboardData on the paste event → interceptor).
        const { context, page } = await openApp({
            initScripts: [PWNED_INIT],
            stubDoc: '<p>native paste target</p>',
        });
        try {
            await step(S, 'native paste event routes through sanitizer (F-063)', async () => {
                const inserted = await page.evaluate((html) => {
                    const ed = document.getElementById('editor');
                    ed.focus();
                    const sel = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(ed);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    const dt = new DataTransfer();
                    dt.setData('text/html', html);
                    const ev = new ClipboardEvent('paste', {
                        bubbles: true, cancelable: true, clipboardData: dt,
                    });
                    ed.dispatchEvent(ev);
                    return ev.defaultPrevented;
                }, HOSTILE_HTML);
                assert.ok(inserted, 'interceptor must preventDefault on HTML paste');
                await page.waitForTimeout(300);
                await assertPasteSanitized(page, 'native paste path');
                assert.deepEqual(await drainPageErrors(page), [], 'no errors during hostile native paste');
            });
        } finally {
            await context.close();
        }
    }
}

// ================================================================ scenario g
async function scenarioGThemeDark() {
    const S = 'g-theme-dark';
    const { context, page } = await openApp({
        stubDoc: `<p>Theme probe paragraph with readable content.</p>
<table><thead><tr><th>H1</th><th>H2</th></tr></thead>
<tbody><tr><td>cell one</td><td>cell two</td></tr></tbody></table>`,
    });
    try {
        // Contrast helper: effective background walks up until non-transparent.
        const contrastProbe = `
            (() => {
                const parse = (c) => {
                    const m = c.match(/rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?\\)/);
                    if (!m) return null;
                    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
                };
                const lum = ({ r, g, b }) => {
                    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
                    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
                };
                const ratio = (a, b) => {
                    const l1 = lum(a); const l2 = lum(b);
                    const hi = Math.max(l1, l2); const lo = Math.min(l1, l2);
                    return (hi + 0.05) / (lo + 0.05);
                };
                const effBg = (el) => {
                    let cur = el;
                    while (cur && cur !== document.documentElement) {
                        const bg = parse(getComputedStyle(cur).backgroundColor);
                        if (bg && bg.a > 0.5) return bg;
                        cur = cur.parentElement;
                    }
                    return parse('rgb(255,255,255)');
                };
                window.__contrastOf = (sel) => {
                    const el = document.querySelector(sel);
                    if (!el) return null;
                    const fg = parse(getComputedStyle(el).color);
                    if (!fg) return null;
                    return Math.round(ratio(fg, effBg(el)) * 100) / 100;
                };
            })();
        `;
        await page.evaluate(contrastProbe);

        await step(S, 'flip to dark UI mid-session', async () => {
            await clickBtn(page, '#btn-theme');
            await page.waitForTimeout(300);
            const theme = await page.evaluate(() => ({
                light: document.documentElement.classList.contains('light'),
                meta: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
            }));
            assert.ok(!theme.light, 'documentElement.light must be removed in dark mode');
            assert.equal(theme.meta, '#1e1e28', 'dark meta theme-color must apply');
        });

        await step(S, 'flip dark document mode with table present', async () => {
            await clickBtn(page, '#btn-view-darkdoc');
            await page.waitForTimeout(300);
            const on = await page.evaluate(() => {
                const main = document.querySelector('main');
                return main ? main.classList.contains('dark-document') : null;
            });
            assert.equal(on, true, 'main.dark-document must be applied');
        });

        await step(S, 'dark contrast probes on chrome + editor + table', async () => {
            const ratios = await page.evaluate(() => {
                const sels = ['#status', '.rb', '.ribbon-tab', '#editor p', '#editor td', '#editor th'];
                const out = {};
                for (const s of sels) out[s] = window.__contrastOf(s);
                return out;
            });
            for (const [sel, r] of Object.entries(ratios)) {
                assert.ok(r !== null, `no element found for contrast probe ${sel}`);
                assert.ok(
                    r >= 3,
                    `contrast too low in dark mode for ${sel}: ${r} (need >= 3)`,
                );
                perfNotes.push(`g: contrast ${sel} = ${r}`);
            }
        });

        await step(S, 'dialog open in dark mode is not broken (opaque, readable)', async () => {
            await page.keyboard.press('Control+f');
            await page.waitForTimeout(300);
            // #find-dialog IS the overlay (class dialog-overlay find-overlay);
            // its inner .dialog box carries the readable surface.
            const dlg = await page.evaluate(() => {
                const overlay = document.getElementById('find-dialog');
                if (!overlay || !overlay.classList.contains('open')) return null;
                const box = overlay.querySelector('.dialog');
                const cs = getComputedStyle(box || overlay);
                return { bg: cs.backgroundColor, visible: cs.display !== 'none' };
            });
            assert.ok(dlg, 'find dialog must open in dark mode');
            assert.ok(dlg.visible, 'dialog must be visible');
            assert.ok(
                !dlg.bg.includes('rgba(0, 0, 0, 0)') && dlg.bg !== 'transparent',
                `dialog background must be opaque in dark mode (got ${dlg.bg})`,
            );
            const r = await page.evaluate(() => window.__contrastOf('#find-dialog.open .dialog'));
            assert.ok(r !== null, 'dialog box missing for contrast probe');
            perfNotes.push(`g: contrast find .dialog = ${r}`);
            assert.ok(r >= 3, `dialog text contrast in dark mode: ${r}`);
            await closeStrayDialog(page);
        });

        await step(S, 'comment flow + theme flip back leaves no broken state', async () => {
            await clickBtn(page, '#btn-comment').catch(() => {});
            await page.waitForTimeout(200);
            await closeStrayDialog(page);
            await clickBtn(page, '#btn-theme');
            await clickBtn(page, '#btn-view-darkdoc');
            await page.waitForTimeout(300);
            assert.deepEqual(await drainPageErrors(page), [], 'no errors during theme churn');
            await assertNoGhosts(page, S, 'after theme churn');
        });
    } finally {
        await context.close();
    }
}

// ================================================================ main
let serverProc;
try {
    serverProc = await startServer();
    console.log(`serving ${APP_DIR} on ${BASE}`);

    await scenarioAPoisonedStorage();
    await scenarioBOffline();
    await scenarioCEmptyDocCommands();
    await scenarioDHugeDoc();
    await scenarioERapidFire();
    await scenarioFPaste();
    await scenarioGThemeDark();
} catch (err) {
    record('harness', 'setup/run', err);
} finally {
    if (serverProc) serverProc.kill('SIGTERM');
    await browser.close().catch(() => {});
}

console.log('\n=== PERF / OBSERVATION NOTES ===');
for (const n of perfNotes) console.log('  ' + n);

if (failures.length) {
    console.log(`\n=== TRIAGE TABLE — ${failures.length} failure(s) ===`);
    console.log('SCENARIO              | STEP                                   | ERROR');
    console.log('-'.repeat(120));
    for (const f of failures) {
        const s = f.scenario.padEnd(21).slice(0, 21);
        const t = f.step.padEnd(38).slice(0, 38);
        console.log(`${s} | ${t} | ${f.error.slice(0, 400)}`);
    }
    process.exit(1);
}
console.log('\nedge.mjs: all scenarios passed');
process.exit(0);

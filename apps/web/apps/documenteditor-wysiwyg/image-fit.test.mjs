/**
 * UI-IMG-FIT Image Fit Tests
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Extracts the two pure functions `fitToWidth` and `fitWithinPage` from
 * editor.js by name (brace-matched, so nesting/formatting doesn't matter)
 * and asserts the image-fit contract:
 *   - fitToWidth(960, 240, 602) => {width: 602, height: 151} (150.5 -> 151)
 *   - fitWithinPage never upscales a small image
 *   - fitWithinPage scales a 960x240 banner into <= 602 px wide
 *   - aspect ratio preserved within 1% for three sample pairs
 *
 * Run with: node image-fit.test.mjs
 * Success: prints "IMAGE-FIT-PASS" and exits 0.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

function extractFunction(src, name) {
  const marker = `function ${name}(`;
  const start = src.indexOf(marker);
  if (start === -1) return null;
  const braceStart = src.indexOf('{', start);
  if (braceStart === -1) return null;
  let depth = 0;
  let i = braceStart;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) return null;
  const fnSrc = src.slice(start, i + 1);
  // Build the function in a clean scope; `new Function` gives module-ish scope.
  return new Function(`return (${fnSrc});`)();
}

const editorPath = new URL('./editor.js', import.meta.url);
const editorSrc = readFileSync(editorPath, 'utf-8');

const fitToWidth = extractFunction(editorSrc, 'fitToWidth');
const fitWithinPage = extractFunction(editorSrc, 'fitWithinPage');

if (!fitToWidth || !fitWithinPage) {
  console.error('ERROR: fitToWidth / fitWithinPage not found at module scope in editor.js');
  console.error('Implement both pure functions near the top of editor.js before running this test.');
  process.exit(1);
}

console.log('Running UI-IMG-FIT image fit tests...\n');

// Test 1: fitToWidth(960, 240, 602) - exact contract case.
// 602/960 * 240 = 150.5 -> Math.round = 151
const r1 = fitToWidth(960, 240, 602);
assert.strictEqual(r1.width, 602, `fitToWidth(960,240,602).width 602, got ${r1.width}`);
const expectedH = Math.round((602 / 960) * 240);
assert.strictEqual(r1.height, expectedH,
  `fitToWidth(960,240,602).height ${expectedH}, got ${r1.height}`);
console.log(`ok 1 fitToWidth(960, 240, 602) = {width: ${r1.width}, height: ${r1.height}}`);

// Test 2: fitWithinPage leaves a small image untouched (no upscale)
const r2 = fitWithinPage(100, 50, 602, 800);
assert.strictEqual(r2.width, 100, 'small image width unchanged');
assert.strictEqual(r2.height, 50, 'small image height unchanged');
console.log('ok 2 fitWithinPage leaves small image untouched (no upscale)');

// Test 3: fitWithinPage scales 960x240 banner into 602 or fewer px wide
const r3 = fitWithinPage(960, 240, 602, 800);
assert.ok(r3.width <= 602, `banner width ${r3.width} <= 602`);
assert.ok(r3.height <= 800, `banner height ${r3.height} <= 800`);
console.log(`ok 3 fitWithinPage(960, 240, 602, 800) = {width: ${r3.width}, height: ${r3.height}}`);

// Test 4: aspect ratio preserved within 1% for three sample pairs
const samples = [
  { w: 1920, h: 1080, pageW: 800, pageH: 600 },
  { w: 960, h: 240, pageW: 602, pageH: 800 },
  { w: 100, h: 200, pageW: 150, pageH: 300 },
];
samples.forEach((s, i) => {
  const out = fitWithinPage(s.w, s.h, s.pageW, s.pageH);
  const orig = s.w / s.h;
  const got = out.width / out.height;
  const pct = Math.abs((got - orig) / orig) * 100;
  assert.ok(pct < 1, `sample ${i + 1} aspect diff ${pct.toFixed(4)}% >= 1%`);
});
console.log('ok 4 aspect ratio preserved within 1% for all three samples');

// Test 5: never zero-size for fitToWidth
[[1000, 500, 500], [1, 1, 1], [100, 1, 50]].forEach(([w, h, mw], i) => {
  const out = fitToWidth(w, h, mw);
  assert.ok(out.width > 0 && out.height > 0, `fitToWidth test ${i} zero-size`);
});
console.log('ok 5 fitToWidth never zero-size');

// Test 6: never zero-size for fitWithinPage
[[1000, 1000, 50, 50], [1, 1, 1, 1]].forEach(([w, h, pw, ph], i) => {
  const out = fitWithinPage(w, h, pw, ph);
  assert.ok(out.width > 0 && out.height > 0, `fitWithinPage test ${i} zero-size`);
});
console.log('ok 6 fitWithinPage never zero-size');

// Test 7: fitToWidth preserves aspect ratio
const r7 = fitToWidth(1920, 1080, 1000);
const d7 = Math.abs((r7.width / r7.height) - (1920 / 1080));
assert.ok(d7 < 0.01, `fitToWidth aspect diff ${d7} >= 0.01`);
console.log(`ok 7 fitToWidth preserves aspect ratio (diff: ${d7.toFixed(6)})`);

// Test 8: fitWithinPage respects both page bounds
const r8 = fitWithinPage(800, 1000, 600, 400);
assert.ok(r8.width <= 600 && r8.height <= 400,
  `800x1000 did not fit 600x400: ${r8.width}x${r8.height}`);
console.log(`ok 8 fitWithinPage(800, 1000, 600, 400) = {width: ${r8.width}, height: ${r8.height}}`);

console.log('\nAll tests passed!\nIMAGE-FIT-PASS');

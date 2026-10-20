/**
 * UI-PASTE-SANITIZE Rich Paste Sanitizer Tests
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Extracts the two pure trust-boundary predicates `isBlockedPasteTag` and
 * `isUnsafePasteAttr` from editor.js by name (brace-matched) and asserts the
 * F-063 rich-paste contract:
 *   - scriptable elements (script/iframe/object/embed/style/link/meta/base)
 *     are blocked regardless of case
 *   - event-handler attributes (on*) are unsafe
 *   - javascript: and data:text/html URLs on href/src/xlink:href are unsafe
 *   - ordinary markup (b, span, p, data: images, http links) stays allowed
 *
 * Run: node apps/web/apps/documenteditor-wysiwyg/paste-sanitize.test.mjs
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

function extractFunction(src, name) {
    const marker = `function ${name}(`;
    const start = src.indexOf(marker);
    assert.notEqual(start, -1, `${name} must exist in editor.js`);
    let depth = 0, i = src.indexOf('{', start);
    const bodyStart = i;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    return src.slice(start, i + 1);
}

const src = readFileSync(new URL('./editor.js', import.meta.url), 'utf8');

// the blocked-tag list lives in a const next to the predicate — extract both
const tagsMatch = src.match(/const PASTE_BLOCKED_TAGS = \[[^\]]*\];/);
assert.ok(tagsMatch, 'PASTE_BLOCKED_TAGS const must exist in editor.js');

// eslint-disable-next-line no-new-func
const isBlockedPasteTag = new Function(
    `${tagsMatch[0]}\n${extractFunction(src, 'isBlockedPasteTag')} return isBlockedPasteTag;`)();
// eslint-disable-next-line no-new-func
const isUnsafePasteAttr = new Function(
    `${extractFunction(src, 'isUnsafePasteAttr')} return isUnsafePasteAttr;`)();

// blocked tags (scriptable / style-injecting / base hijack), case-insensitive
for (const tag of ['script', 'SCRIPT', 'iframe', 'object', 'embed', 'style', 'link', 'meta', 'base']) {
    assert.equal(isBlockedPasteTag(tag), true, `${tag} must be blocked`);
}
for (const tag of ['b', 'span', 'p', 'table', 'img', 'a', 'blockquote']) {
    assert.equal(isBlockedPasteTag(tag), false, `${tag} must stay allowed`);
}
assert.equal(isBlockedPasteTag(''), false, 'empty tag must not crash');

// event handler attributes are unsafe, whatever the case
for (const name of ['onclick', 'ONERROR', 'onload', 'onmouseover']) {
    assert.equal(isUnsafePasteAttr(name, 'anything'), true, `${name} must be unsafe`);
}

// javascript:/data:text/html URLs on URL-bearing attributes are unsafe
assert.equal(isUnsafePasteAttr('href', 'javascript:alert(1)'), true);
assert.equal(isUnsafePasteAttr('href', '  JAVASCRIPT:alert(1)'), true, 'leading ws + case');
assert.equal(isUnsafePasteAttr('src', 'data:text/html,<script>'), true);
assert.equal(isUnsafePasteAttr('xlink:href', 'javascript:x()'), true);

// safe values stay
assert.equal(isUnsafePasteAttr('href', 'https://example.com'), false);
assert.equal(isUnsafePasteAttr('href', '/relative'), false);
assert.equal(isUnsafePasteAttr('src', 'data:image/png;base64,iVBOR'), false, 'data: images stay');
assert.equal(isUnsafePasteAttr('style', 'color: red'), false);
assert.equal(isUnsafePasteAttr('title', 'onmouseover: nope'), false, 'value that looks like handler in a safe attr stays');
assert.equal(isUnsafePasteAttr('class', 'onclick'), false, 'attr NAME containing on-words is not a handler');

console.log('PASTE-SANITIZE-PASS');

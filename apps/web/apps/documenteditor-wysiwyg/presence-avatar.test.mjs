/**
 * F-122: Presence avatars test
 * Node.js built-in test runner (node:assert, zero dependencies).
 *
 * Verifies that editor.js contains the avatar rendering logic in renderPresence.
 *
 * Run with: node presence-avatar.test.mjs
 * Success: prints "PRESENCE-AVATAR-PASS" and exits 0.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const editorPath = new URL('./editor.js', import.meta.url);
const editorSrc = readFileSync(editorPath, 'utf-8');

console.log('Running F-122 presence avatar tests...\n');

// Test 1: renderPresence function exists
const renderPresenceStart = editorSrc.indexOf('function renderPresence(');
assert.notStrictEqual(renderPresenceStart, -1, 'renderPresence function must exist');
console.log('ok 1 renderPresence function exists');

// Test 2: renderPresence checks for c.avatar
const avatarCheck = editorSrc.indexOf('if (c.avatar)', renderPresenceStart);
assert.notStrictEqual(avatarCheck, -1, 'renderPresence must check for c.avatar');
console.log('ok 2 renderPresence checks for c.avatar');

// Test 3: renderPresence creates img element when avatar present
const imgCreation = editorSrc.indexOf('document.createElement("img")', avatarCheck);
assert.notStrictEqual(imgCreation, -1, 'renderPresence must create img element');
console.log('ok 3 renderPresence creates img element when avatar present');

// Test 4: renderPresence sets img.src to c.avatar
const imgSrcSet = editorSrc.indexOf('img.src = c.avatar', avatarCheck);
assert.notStrictEqual(imgSrcSet, -1, 'renderPresence must set img.src to c.avatar');
console.log('ok 4 renderPresence sets img.src to c.avatar');

// Test 5: renderPresence has fallback to initials
const initialsFallback = editorSrc.indexOf('(c.user || c.client).slice(0, 2).toUpperCase()', renderPresenceStart);
assert.notStrictEqual(initialsFallback, -1, 'renderPresence must have initials fallback');
console.log('ok 5 renderPresence has fallback to initials');

// Test 6: renderPresence appends img to chip
const appendImg = editorSrc.indexOf('chip.appendChild(img)', avatarCheck);
assert.notStrictEqual(appendImg, -1, 'renderPresence must append img to chip');
console.log('ok 6 renderPresence appends img to chip');

// Test 7: announcePresence function exists and can send avatar
const announcePresenceStart = editorSrc.indexOf('function announcePresence(');
assert.notStrictEqual(announcePresenceStart, -1, 'announcePresence function must exist');
console.log('ok 7 announcePresence function exists');

// Test 8: announcePresence sends client_id, user, and cursor
const announceBody = editorSrc.indexOf('client_id: CLIENT_ID, user:', announcePresenceStart);
assert.notStrictEqual(announceBody, -1, 'announcePresence must send client_id and user');
console.log('ok 8 announcePresence sends client_id and user');

console.log('\nAll F-122 presence avatar code structure tests passed!\nPRESENCE-AVATAR-PASS');

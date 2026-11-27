#!/usr/bin/env node
// Vendor the SVG nodes of every icon the ribbon spec names (src/ribbon/spec.rs) into
// tools/lucide-icons.json — the tracked, dependency-free source the icon generator
// (tools/gen-lucide-icons.mjs, repo root) reads. Lucide is ISC-licensed; nothing in the
// workspace depends on lucide-react any more, so this runs only when the spec's icon
// names change and a lucide-react install is at hand:
//
//   LUCIDE_REACT_DIR=<...>/node_modules/lucide-react/dist/esm/icons node tools/vendor-lucide-icons.mjs
//
// Data: lucide-react 1.23.0 (2026-11). "key" attrs (React-only) are dropped. Four spec names
// no longer exist in lucide 1.x and use the nearest surviving icon (see _aliases).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = process.env.LUCIDE_REACT_DIR;
if (!DIR) { console.error('vendor-lucide-icons: set LUCIDE_REACT_DIR to lucide-react/dist/esm/icons'); process.exit(2); }
const here = dirname(fileURLToPath(import.meta.url));
const spec = readFileSync(resolve(here, '../src/ribbon/spec.rs'), 'utf8');
const names = [...new Set([...spec.matchAll(/icon: (?:Some\()?"([A-Za-z0-9]+)"/g)].map((m) => m[1]))].sort();

const kebab = (n) => n.replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').replace(/([a-z0-9])([A-Z])/g, '$1-$2')
  .replace(/([A-Za-z])(\d)/g, '$1-$2').replace(/(\d)([A-Za-z])/g, '$1-$2').toLowerCase();
// Spec names lucide 1.x removed (no alias file left) → nearest surviving icon.
const FALLBACK = { Youtube: 'video', CopyText: 'clipboard-copy', Remove: 'minus', LockKey: 'lock-keyhole' };

async function load(file) {
  const f = resolve(DIR, `${file}.mjs`);
  if (!existsSync(f)) return null;
  let m = await import(pathToFileURL(f).href);
  if (!m.__iconNode) { // alias file: `export { default } from './canonical.mjs'`
    const target = readFileSync(f, 'utf8').match(/from '\.\/([\w-]+)\.mjs'/);
    if (!target) return null;
    m = await import(pathToFileURL(resolve(DIR, `${target[1]}.mjs`)).href);
  }
  return m.__iconNode ? { node: m.__iconNode, file } : null;
}

const icons = {}; const aliases = {}; const missing = [];
for (const name of names) {
  let r = await load(kebab(name));
  if (!r && FALLBACK[name]) r = await load(FALLBACK[name]);
  if (!r) { missing.push(name); continue; }
  if (r.file !== kebab(name)) aliases[name] = r.file;
  icons[name] = r.node.map(([tag, attrs]) => [tag, Object.fromEntries(Object.entries(attrs).filter(([k]) => k !== 'key'))]);
}
if (missing.length) { console.error('vendor-lucide-icons: not found in lucide:', missing.join(', ')); process.exit(1); }
const json = {
  _license: 'Lucide icons — ISC License — https://lucide.dev (lucide-react 1.23.0 dist/esm/icons/*/__iconNode; "key" attrs dropped)',
  _aliases: aliases,
  icons,
};
writeFileSync(resolve(here, 'lucide-icons.json'), JSON.stringify(json, null, 1) + '\n');
console.log(`vendored ${Object.keys(icons).length} icons (${Object.values(icons).reduce((n, v) => n + v.length, 0)} nodes, ${Object.keys(aliases).length} aliases) → tools/lucide-icons.json`);

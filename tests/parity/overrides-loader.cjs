// overrides-loader.cjs — merged view of parity contract overrides.
// Base file: word-parity-overrides.json. Optional drop-ins: overrides-dropins/*.json
// (sorted by filename; duplicate keys override the base, last file wins —
// lets parallel agents own disjoint drop-in files without merge conflicts).
'use strict';
const fs = require('fs');
const path = require('path');

function loadOverrides(dir = __dirname) {
  const base = JSON.parse(fs.readFileSync(path.join(dir, 'word-parity-overrides.json'), 'utf8'));
  const entries = { ...base.entries };
  const dropDir = path.join(dir, 'overrides-dropins');
  if (fs.existsSync(dropDir)) {
    for (const f of fs.readdirSync(dropDir).filter(f => f.endsWith('.json')).sort()) {
      const part = JSON.parse(fs.readFileSync(path.join(dropDir, f), 'utf8'));
      if (!part.entries) continue;
      for (const k of Object.keys(part.entries)) {
        if (entries[k]) console.warn(`overrides: '${k}' from overrides-dropins/${f} overrides the base definition`);
        entries[k] = part.entries[k];
      }
    }
  }
  return { ...base, entries };
}

module.exports = { loadOverrides };

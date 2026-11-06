#!/usr/bin/env node
// generate-manifest.cjs — builds word-parity-contracts.json from the
// census-diff.py ledger (the authoritative OO→WO join) + manual overrides.
// Every blueprint row gets exactly one entry; --strict exits 1 on any row
// without a usable effektClass (the CI gate mode; default: unclassified rows
// are emitted as such so the manifest can be built incrementally).
//
// Usage: node generate-manifest.cjs [--strict]
//   --ledger FILE  (default: ../../../../wo-test-harness/census/census/ledger.json)
//   --out FILE     (default: ./word-parity-contracts.json)
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const arg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const HERE = __dirname;
const LEDGER = arg('--ledger', process.env.WO_LEDGER || ledgerDefault());
// CI checks the harness out INSIDE the workspace (path: wo-test-harness); on
// the dev box it is a sibling of the server git root — first existing wins
function ledgerDefault() {
  for (const rel of ['../../wo-test-harness/census/census/ledger.json',
                     '../../../../wo-test-harness/census/census/ledger.json']) {
    const p = path.resolve(__dirname, rel);
    if (fs.existsSync(p)) return p;
  }
  throw new Error('ledger.json not found — checkout World-Office/wo-test-harness or set WO_LEDGER');
}
const OUT = arg('--out', path.join(HERE, 'word-parity-contracts.json'));
const OVERRIDES = arg('--overrides', path.join(HERE, 'word-parity-overrides.json'));
const { loadOverrides } = require('./overrides-loader.cjs');
// --overrides path OR the merged base+overrides.d view
const RAW = OVERRIDES === path.join(HERE, 'word-parity-overrides.json')
  ? loadOverrides(HERE)
  : JSON.parse(fs.readFileSync(OVERRIDES, 'utf8'));

// Default effektClass by command family — first match wins. Override file wins over these.
const CLASS_RULES = [
  // ordered: op before dialog before structure — first match wins
  [/^(track-changes|trackchanges|accept|reject|resolve|copy|paste|cut|select-all|copystyle|delete)/, 'op'],
  [/^(bold|italic|underline|strikeout|strikethrough|subscript|superscript|forecolor|hilitecolor|fontname|fontsize|fontsizeinc|fontsizedec|justifyleft|justifycenter|justifyright|justifyfull|justif|lineheight|line-spacing|indent|outdent|removeformat|cleardown|case|upper|lower|capitalize|ltr|rtl|text-direction|set-markers|copystyle|change-?case|highlight-color|highlight|text-color|font-color|shading|multilevel|bring ?forward|send ?backward|align|group|mergeshapes|wrapping)/, 'format'],
  [/^(zoom|zoom-down|zoom-up|zoom-topage|zoom-towidth|display-mode|displaymode|rulers|dark|theme|multiple-pages|single-page|status-btn|gridlines|grid|fullscreen|navigation|hf-close|close|nonprinting|formatmarks)/, 'view'],
  // dialogs and pickers: open a UI surface, no direct document mutation
  [/^(paragraph-settings|font-dialog|table-props|pagesetup|page-margins|page-size|page-orient|page-color|pagecolor|symbol|equation|chart|insertobject|protect|fileprotect|fileinfo|filesettings|filehelp|filesuggest|find|replace|styles|style-gallery|openBorders|borders|btn-page-setup|margins|orientation|size|columns|btn-open|open|btn-new|create|btn-export|download|btn-file|print|recent|info|help|suggest|settings|btn-mailmerge|mailmerge|compareVersion|compare|combine|photoEditor|photo|btn-ocr|ocr|btn-bgplugins|background|btn-readaloud|speech|btn-dictate|speechinput|btn-ai|ai-|chatbot|summarization|translation|grammar|openCrossref|cross-?ref|table-of-figures|btn-symbol|btn-equation|btn-smartart|smartart|btn-image|image|btn-link|link|btn-field|field|caption|btn-contentcontrol|contentcontrol|btn-pagenumber|pagenumber|insertdatetime|word-count|replace)/, 'dialog'],
  // content structure: inserts that change the document body
  [/^(insert|new|link|bookmark|toc|table-of-contents|footnote|endnote|insertfootnote|insertendnote|header|edit-header-footer|pagenumber|datetime|insertdatetime|insertfield|field|drop-cap|toggledropcap|watermark|togglewatermark|hyphenation|togglehyphenation|linenumbering|togglelinenumbers|smart-art|text-art|textfile|page-break|blank-page|addtext|mailmerge|multilevels|insertorderedlist|insertunorderedlist|btn-toc|updatetoc|btn-textfile|btn-addtext|btn-header|btn-footnote|btn-bookmark|update-toc|add-text|breaks|blankpage|addcomment)/, 'structure'],
];
// label pass: same rules unanchored to word starts — icon-only asc-genNNN
// rows carry their meaning only in the census label ("btn-view-*", "ai*",
// camelCase like updateToc lowercase differently)
const LABEL_RULES = CLASS_RULES.map(([re, cls]) => [new RegExp(re.source.replace(/^\^/, '\\b'), re.flags), cls]);

function classify(row, override) {
  if (override && override.effektClass) return override.effektClass;
  // All current ledger rows carry a WO binding (level 1-4); classify by
  // the binding token, falling back to the OO census label — icon-only OO
  // controls come with asc-genNNN ids whose meaning only the label carries
  const tok = ((row.wo && row.wo.match) || '').toLowerCase();
  const label = (row.oo && row.oo[0] && row.oo[0].label) || '';
  const hay = (tok + ' ' + label).toLowerCase();
  for (const [re, cls] of CLASS_RULES) if (re.test(tok)) return cls;
  for (const [re, cls] of LABEL_RULES) if (re.test(hay)) return cls;
  return 'unclassified';
}

const VALID_CLASSES = new Set(['format', 'structure', 'dialog', 'op', 'view', 'stub', 'covered-cluster', 'unclassified']);
const VALID_ASSERTIONS = new Set(['computed-style', 'dom-mutation', 'dialog-visible', 'dialog-action', 'op-emitted', 'viewport-flag', 'text-mutation', 'unspecified']);

function validateOverride(key, o, errors) {
  if (!VALID_CLASSES.has(o.effektClass)) errors.push(`${key}: bad effektClass "${o.effektClass}"`);
  if (o.assertion) {
    if (!VALID_ASSERTIONS.has(o.assertion.kind)) errors.push(`${key}: bad assertion.kind "${o.assertion.kind}"`);
    if (o.assertion.kind === 'computed-style' && !(o.assertion.prop && o.assertion.equals !== undefined)) errors.push(`${key}: computed-style needs prop+equals`);
    if (o.assertion.kind === 'dom-mutation' && !o.assertion.selector) errors.push(`${key}: dom-mutation needs selector`);
  }
  if (o.effektClass === 'dialog' && o.assertion && o.assertion.kind === 'dialog-visible' && !Array.isArray(o.subFeatures)) errors.push(`${key}: dialog-visible needs subFeatures[]`);
}

// 2026-11-04: ported to the current ledger schema. The old reader expected
// {ledger: [{token, tab, id, label, status, wo, wo_tab}]} — that shape is
// gone; both committed ledgers are {version, generated, levels, totals,
// features: [{feature, cluster, kind, level, oo: [{surface,label,id}], wo:
// {match, where}, evidence}]}. The old reader crashed with "ledger is not
// iterable" (undefined .ledger), the manifest never materialized, and every
// downstream contract/surface run ENOENT'd — the CI job had been red 30/30.
const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8')).features;
const featureStatus = (row) => ({ 1: 'real', 2: 'real', 4: 'real', 3: 'deferred' }[row.level] || 'real');
const overrideFile = RAW;
const overrideErrors = [];
for (const [k, o] of Object.entries(overrideFile.entries || {})) validateOverride(k, o, overrideErrors);
if (overrideErrors.length) {
  console.error('OVERRIDE SCHEMA FAIL:');
  for (const e of overrideErrors) console.error('  ' + e);
  process.exit(1);
}
const overrides = overrideFile.entries;

const entries = [];
let unclassified = 0;
const matched = new Set();
for (const row of ledger) {
  const woMatch = (row.wo && row.wo.match) || '';
  // label-ish matches ("Table \u25be", "Ctrl+B") are not binding ids — key
  // those entries by the stable feature id instead
  const token = (woMatch && !woMatch.includes(' ') ? woMatch : row.feature).toLowerCase();
  const override = overrides[token] || overrides[row.feature] || null;
  if (override) matched.add(overrides[token] ? token : row.feature);
  const effektClass = classify(row, override);
  if (effektClass === 'unclassified') unclassified++;
  const entry = {
    tab: (row.oo && row.oo[0] && row.oo[0].surface) || '',
    ooId: (row.oo && row.oo[0] && row.oo[0].id) || row.feature,
    label: (row.oo && row.oo[0] && row.oo[0].label) || row.feature,
    token,
    feature: row.feature,
    level: row.level,
    censusStatus: featureStatus(row),
    wo: row.wo || null,
    woTab: null,
    effektClass,
    assertion: (override && override.assertion) || { kind: 'unspecified' },
    subFeatures: (override && override.subFeatures) || null,
  };
  if (override && override.note) entry.note = override.note;
  entries.push(entry);
}

// Overrides that matched no ledger row would silently vanish — keep them as
// override-only entries (their selectors/assertions are editor-side facts)
// and report the drift loudly so the keys get re-pointed at the new ids.
for (const [key, ov] of Object.entries(overrides)) {
  if (matched.has(key)) continue;
  entries.push({
    tab: ov.woTab || '', ooId: key, label: key, token: key, feature: key,
    level: null, censusStatus: 'override-only', wo: null, woTab: ov.woTab || null,
    effektClass: ov.effektClass || 'unclassified',
    assertion: ov.assertion || { kind: 'unspecified' },
    subFeatures: ov.subFeatures || null, note: (ov.note || '') + ' [override-only: no ledger row matched this key]',
  });
  console.warn(`WARN override "${key}" matched no ledger row — emitted as override-only entry`);
}

const byClass = {};
for (const e of entries) byClass[e.effektClass] = (byClass[e.effektClass] || 0) + 1;
const manifest = {
  generatedAt: new Date().toISOString(),
  source: { ledger: LEDGER, ledgerRows: ledger.length },
  counts: { total: entries.length, byClass, unclassified },
  entries,
};
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 1) + '\n');
console.log(`manifest: ${entries.length} entries -> ${path.basename(OUT)}`);
console.log(`classes: ${JSON.stringify(byClass)}`);
if (strict && unclassified > 0) {
  console.error(`STRICT FAIL: ${unclassified} unclassified entries`);
  process.exit(1);
}

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
const LEDGER = arg('--ledger', process.env.WO_LEDGER ||
  // dev box: World-Office/{server/tests/parity -> wo-test-harness};
  // CI: sibling checkout of wo-test-harness at ../wo-test-harness
  path.resolve(__dirname, '..', '..', '..', '..', 'wo-test-harness', 'census', 'census', 'ledger.json'));
const OUT = arg('--out', path.join(HERE, 'word-parity-contracts.json'));
const OVERRIDES = arg('--overrides', path.join(HERE, 'word-parity-overrides.json'));

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
  if (row.status === 'real') {
    // token first, but fall back to the label — icon-only OO controls come
    // with asc-genNNN ids whose meaning only the census label carries
    const tok = (row.wo || row.token || '').toLowerCase();
    const hay = (tok + ' ' + (row.label || '')).toLowerCase();
    for (const [re, cls] of CLASS_RULES) if (re.test(tok)) return cls;
    for (const [re, cls] of LABEL_RULES) if (re.test(hay)) return cls;
    return 'unclassified';
  }
  if (row.status === 'covered') return 'covered-cluster';
  if (row.status === 'stub') return 'stub';
  if (row.status === 'deferred') return 'stub'; // declared divergence — loud
  return row.status === 'global-repeat' ? 'view' : 'unclassified';
}

const VALID_CLASSES = new Set(['format', 'structure', 'dialog', 'op', 'view', 'stub', 'covered-cluster', 'unclassified']);
const VALID_ASSERTIONS = new Set(['computed-style', 'dom-mutation', 'dialog-visible', 'op-emitted', 'viewport-flag', 'unspecified']);

function validateOverride(key, o, errors) {
  if (!VALID_CLASSES.has(o.effektClass)) errors.push(`${key}: bad effektClass "${o.effektClass}"`);
  if (o.assertion) {
    if (!VALID_ASSERTIONS.has(o.assertion.kind)) errors.push(`${key}: bad assertion.kind "${o.assertion.kind}"`);
    if (o.assertion.kind === 'computed-style' && !(o.assertion.prop && o.assertion.equals !== undefined)) errors.push(`${key}: computed-style needs prop+equals`);
    if (o.assertion.kind === 'dom-mutation' && !o.assertion.selector) errors.push(`${key}: dom-mutation needs selector`);
  }
  if (o.effektClass === 'dialog' && o.assertion && o.assertion.kind === 'dialog-visible' && !Array.isArray(o.subFeatures)) errors.push(`${key}: dialog-visible needs subFeatures[]`);
}

const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8')).ledger;
const overrideFile = JSON.parse(fs.readFileSync(OVERRIDES, 'utf8'));
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
for (const row of ledger) {
  const key = (row.token || '').toLowerCase();
  const override = overrides[key] || overrides[row.id] || null;
  const effektClass = classify(row, override);
  if (effektClass === 'unclassified') unclassified++;
  const entry = {
    tab: row.tab,
    ooId: row.id,
    label: row.label,
    token: row.token,
    censusStatus: row.status,
    wo: row.wo || row.covered || null,
    woTab: row.wo_tab || null,
    effektClass,
    assertion: (override && override.assertion) || { kind: 'unspecified' },
    subFeatures: (override && override.subFeatures) || null,
  };
  if (override && override.note) entry.note = override.note;
  entries.push(entry);
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

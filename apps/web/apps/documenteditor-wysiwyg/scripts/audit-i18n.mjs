/**
 * BUG1-STATIC-AUDIT: i18n key parity audit (en + de).
 *
 * Loads the REAL catalogs from i18n.js (module.exports — no regex parsing of
 * the catalog source), then statically extracts every i18n key referenced by
 *
 *   - index.html: data-i18n, data-i18n-title, data-i18n-aria-label,
 *     data-i18n-placeholder  (the attributes applyTranslations() consumes),
 *   - editor.js:  every literal t("Key") call (word-boundary matched, so
 *     getContext("2d") / split("..") are not false positives).
 *
 * Each key must exist in BOTH the en catalog (DEFAULT_TRANSLATIONS) and the
 * de catalog (LOCALE_CATALOGS.de). Prints missing keys and exits non-zero
 * when any are missing, so CI and audit-i18n.test.mjs can gate on it.
 *
 * Run:   node scripts/audit-i18n.mjs
 * API:   import { collectMissing, auditStats } from this module.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.dirname(scriptDir); // the documenteditor-wysiwyg dir

// Load the REAL catalogs by evaluating i18n.js in a CommonJS sandbox.
// createRequire() is not usable here: Node's module-type detection can load
// this UMD file as ESM, where its `module` guard is undefined. The vm
// sandbox forces the CommonJS export branch deterministically (zero-dep).
function loadI18nModule() {
  const src = readFileSync(path.join(rootDir, "i18n.js"), "utf8");
  const sandbox = { module: { exports: {} }, console };
  vm.runInNewContext(src, sandbox, { filename: "i18n.js" });
  return sandbox.module.exports;
}
const i18n = loadI18nModule();
const enCatalog = i18n.DEFAULT_TRANSLATIONS;
const deCatalog = i18n.LOCALE_CATALOGS.de;

const htmlSrc = readFileSync(path.join(rootDir, "index.html"), "utf8");
const editorSrc = readFileSync(path.join(rootDir, "editor.js"), "utf8");

// Attributes applyTranslations() actually consumes: data-i18n sets
// textContent; data-i18n-<attr> sets the attribute (I18N_ATTRS in i18n.js).
const HTML_ATTRS = [
  "data-i18n",
  "data-i18n-title",
  "data-i18n-aria-label",
  "data-i18n-placeholder",
];

function collectHtmlKeys() {
  const keys = new Set();
  for (const attr of HTML_ATTRS) {
    const re = new RegExp(attr + '=["\']([^"\']+)["\']', "g");
    for (const m of htmlSrc.matchAll(re)) keys.add(m[1]);
  }
  return keys;
}

// \bt\( only matches a bare identifier t( — getContext(, split(, closest(
// etc. are not matched because the char before their trailing "t" is a word
// character (no word boundary).
function collectJsKeys() {
  const keys = new Set();
  for (const m of editorSrc.matchAll(/\bt\("([^"]+)"\)/g)) keys.add(m[1]);
  return keys;
}

export function collectMissing() {
  const keys = new Set([...collectHtmlKeys(), ...collectJsKeys()]);
  const missing = [];
  for (const key of [...keys].sort()) {
    if (!Object.hasOwn(enCatalog, key)) missing.push({ key, catalog: "en" });
    if (!Object.hasOwn(deCatalog, key)) missing.push({ key, catalog: "de" });
  }
  return missing;
}

export function auditStats() {
  const htmlKeys = collectHtmlKeys();
  const jsKeys = collectJsKeys();
  const identicalInDe = [...new Set([...htmlKeys, ...jsKeys])].filter(
    (k) => Object.hasOwn(enCatalog, k) && Object.hasOwn(deCatalog, k) && enCatalog[k] === deCatalog[k]
  );
  return {
    enKeys: Object.keys(enCatalog).length,
    deKeys: Object.keys(deCatalog).length,
    htmlKeys: htmlKeys.size,
    jsKeys: jsKeys.size,
    referencedKeys: new Set([...htmlKeys, ...jsKeys]).size,
    identicalInDeCount: identicalInDe.length,
  };
}

function main() {
  const stats = auditStats();
  console.log(
    `i18n audit: en=${stats.enKeys} keys, de=${stats.deKeys} keys, ` +
      `referenced=${stats.referencedKeys} (html=${stats.htmlKeys}, js=${stats.jsKeys})`
  );
  const missing = collectMissing();
  if (missing.length === 0) {
    console.log("i18n audit: PASS — every referenced key exists in en and de");
    return 0;
  }
  console.error(`i18n audit: FAIL — ${missing.length} missing key(s):`);
  for (const { key, catalog } of missing) {
    console.error(`  [${catalog}] ${key}`);
  }
  return 1;
}

// Run as CLI (node scripts/audit-i18n.mjs); importable for tests otherwise.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(main());
}

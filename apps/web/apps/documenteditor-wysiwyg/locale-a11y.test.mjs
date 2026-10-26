/**
 * BUG4-LOCALE-A11Y: runtime locale apply, focus-trap registration,
 * aria-pressed sync — static gate.
 * Node.js built-in test runner style (node:assert, zero dependencies).
 *
 * The LIVE probe is scripts/locale-a11y.mjs (manual, headless Chromium);
 * this gate pins the structural invariants the probe depends on:
 *   - a runtime locale-switch function exists and the language control
 *     (#settings-lang) drives it;
 *   - locale-pair seeders key off the CURRENT t.lng, not boot-time
 *     detectedLng (runtime re-seeding);
 *   - aria-pressed state setters are centralized (setMultipage, nav
 *     mirror sync, applyTheme sink for the settings dialog);
 *   - all 42 aria-modal=true dialogs are registered in DIALOG_IDS and the
 *     3 non-modal pops are NOT (so the Tab trap never engages on them).
 */
import { strict as assert } from "node:assert"
import { existsSync, readFileSync } from "node:fs"

const editorPath = new URL("./editor.js", import.meta.url)
const htmlPath = new URL("./index.html", import.meta.url)
const i18nPath = new URL("./i18n.js", import.meta.url)
const probePath = new URL("./scripts/locale-a11y.mjs", import.meta.url)
const editorSrc = readFileSync(editorPath, "utf-8")
const htmlSrc = readFileSync(htmlPath, "utf-8")
const i18nSrc = readFileSync(i18nPath, "utf-8")

console.log("Running BUG4-LOCALE-A11Y tests...\n")

// ---------------------------------------------------------------- locale
console.log("Checking runtime locale switch...")
assert.ok(editorSrc.includes("function applyLocale("),
  "editor.js must define applyLocale(code) as the single runtime locale-switch path")
assert.ok(editorSrc.includes('if (lang && lang.value !== t.lng) applyLocale(lang.value)'),
  "settings OK handler must apply the chosen language via applyLocale")
// The language control itself: <select id="settings-lang"> + translated label.
assert.ok(htmlSrc.includes('id="settings-lang"'),
  "index.html must contain the #settings-lang language select in the settings dialog")
assert.ok(htmlSrc.includes('for="settings-lang"') && htmlSrc.includes('data-i18n="Settings.Language"'),
  "settings-lang label must be wired (for=) and translatable (Settings.Language)")
// New settings strings must exist in BOTH catalogs.
assert.ok(i18nSrc.includes('"Settings.Language": "Language"') &&
  i18nSrc.includes('"Settings.Language": "Sprache"'),
  "Settings.Language must exist in DEFAULT_TRANSLATIONS (en) and LOCALE_DE")
assert.ok(i18nSrc.includes('"Settings.Theme": "Interface theme"') &&
  i18nSrc.includes('"Settings.Theme": "Erscheinungsbild"'),
  "Settings.Theme must exist in both catalogs")
assert.ok(i18nSrc.includes('"Settings.Spellchecking": "Spell checking"') &&
  i18nSrc.includes('"Settings.Spellchecking": "Rechtschreibprüfung"'),
  "Settings.Spellchecking must exist in both catalogs")
console.log("Runtime locale switch OK\n")

// ------------------------------------------------- per-locale re-seeding
console.log("Checking locale-pair seeders key off t.lng...")
const tFnLngUses = (editorSrc.match(/tFn\.lng\.indexOf\("de"\)/g) || []).length
assert.ok(tFnLngUses >= 5,
  `all locale-pair seeders must key off tFn.lng (found ${tFnLngUses}, need >= 5: heading3/toolbar/a11y/version/menu)`)
assert.ok(!editorSrc.includes('detectedLng.indexOf("de")'),
  "seeders must not use boot-time detectedLng (breaks runtime re-seed)")
console.log("Per-locale re-seeding OK\n")

// --------------------------------------------------- aria-pressed sinks
console.log("Checking centralized aria-pressed setters...")
const setMultipageAt = editorSrc.indexOf("function setMultipage(")
assert.ok(setMultipageAt >= 0, "editor.js must define a central setMultipage(on) setter")
const setMultipageBody = editorSrc.slice(setMultipageAt, setMultipageAt + 600)
assert.ok(setMultipageBody.includes("btn-multipage") && setMultipageBody.includes("btn-view-multipages"),
  "setMultipage must sync aria-pressed on BOTH #btn-multipage and #btn-view-multipages")
assert.ok(setMultipageBody.includes('setAttribute("aria-pressed"'),
  "setMultipage must write aria-pressed attributes")

const toggleNavAt = editorSrc.indexOf("function toggleNavigation(")
assert.ok(toggleNavAt >= 0, "editor.js must define toggleNavigation")
const toggleNavBody = editorSrc.slice(toggleNavAt, toggleNavAt + 1200)
assert.ok(toggleNavBody.includes("btn-view-headings") && toggleNavBody.includes('aria-pressed'),
  "toggleNavigation must keep the #btn-view-headings aria-pressed mirror in sync")

// Settings dialog theme path: must go through the shared applyTheme() sink
// (bare classList.toggle left btn-theme aria-pressed + meta + localStorage stale).
const settingsOkAt = editorSrc.indexOf('getElementById("btn-settings-ok")')
assert.ok(settingsOkAt >= 0, "settings OK handler must exist")
const settingsOkBody = editorSrc.slice(settingsOkAt, settingsOkAt + 1400)
assert.ok(settingsOkBody.includes("applyTheme()"),
  "settings theme apply must route through applyTheme()")
assert.ok(!settingsOkBody.includes('classList.toggle("light")'),
  "settings theme apply must NOT classList.toggle(\"light\") directly (BUG4 desync)")
assert.ok(settingsOkBody.includes('localStorage.setItem("wo-theme"'),
  "settings theme apply must persist the choice to localStorage")
console.log("Centralized aria-pressed setters OK\n")

// ------------------------------------------------------------ live probe
console.log("Checking live probe script...")
assert.ok(existsSync(probePath), "scripts/locale-a11y.mjs must exist")
const probeSrc = readFileSync(probePath, "utf-8")
assert.ok(probeSrc.includes("settings-lang"),
  "probe must switch locale through the real #settings-lang UI path")
assert.ok(probeSrc.includes("DIALOG_IDS"),
  "probe must audit focus traps against the DIALOG_IDS registry")
assert.ok(probeSrc.includes("aria-pressed") || probeSrc.includes("ariaPressed") || probeSrc.includes('getAttribute("aria-pressed"'),
  "probe must check aria-pressed sync")
console.log("Live probe script OK\n")

// ------------------------------------------------------------ focus trap
console.log("Checking focus-trap registration...")
const dialogIdsMatch = editorSrc.match(/const DIALOG_IDS\s*=\s*\[([^\]]*)\]/)
assert.ok(dialogIdsMatch, "editor.js must declare the DIALOG_IDS registry")
const dialogIds = dialogIdsMatch[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
assert.ok(dialogIds.length >= 40, `DIALOG_IDS must list the modal dialogs (found ${dialogIds.length})`)
for (const nonModal of ["table-dialog", "image-dialog", "objlayout-pop"]) {
  assert.ok(!dialogIds.includes(nonModal),
    `non-modal pop "${nonModal}" must NOT be in DIALOG_IDS (Tab trap would engage)`)
  const re = new RegExp(`id="${nonModal}"[^>]*aria-modal="false"`)
  assert.ok(re.test(htmlSrc),
    `non-modal pop "${nonModal}" must carry aria-modal="false" in index.html`)
}
// Every .dialog-overlay element in the markup must be consistent: registered
// modals carry aria-modal=true; the only unregistered overlays are documented
// styling-only pops (BUG1-STATIC-AUDIT, editor.js objlayout comment) and MUST
// carry aria-modal=false so assistive tech never treats them as modal.
const overlayIds = [...htmlSrc.matchAll(/class="[^"]*dialog-overlay[^"]*"[^>]*id="([^"]+)"/g)].map((m) => m[1])
const backIds = [...htmlSrc.matchAll(/id="([^"]+)"[^>]*class="[^"]*dialog-overlay[^"]*"/g)].map((m) => m[1])
const allOverlays = new Set([...overlayIds, ...backIds])
const unregistered = []
for (const id of allOverlays) {
  if (dialogIds.includes(id)) continue;
  unregistered.push(id)
  const re = new RegExp(`id="${id}"[^>]*aria-modal="false"`)
  assert.ok(re.test(htmlSrc),
    `.dialog-overlay "${id}" is not in DIALOG_IDS and must declare aria-modal="false" (styling-only pop)`)
}
console.log(`Focus-trap registration OK (${dialogIds.length} modals, ${allOverlays.size} overlays, ${unregistered.length} styling-only pop)\n`)

console.log("All BUG4-LOCALE-A11Y tests passed!\n")

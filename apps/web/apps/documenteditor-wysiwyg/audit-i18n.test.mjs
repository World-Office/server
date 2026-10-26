/**
 * BUG1-STATIC-AUDIT: i18n key parity gate (en + de).
 *
 * Reuses scripts/audit-i18n.mjs — loads the real catalogs from i18n.js and
 * asserts every i18n key referenced by index.html (data-i18n*) and editor.js
 * (literal t("Key") calls) exists in BOTH the en and de catalogs.
 *
 * Run with: node audit-i18n.test.mjs
 * Success: prints "AUDIT-I18N-PASS" and exits 0.
 */
import { strict as assert } from "node:assert"
import { collectMissing, auditStats } from "./scripts/audit-i18n.mjs"

const stats = auditStats()
assert.ok(stats.enKeys > 0, "en catalog must not be empty")
assert.ok(stats.deKeys > 0, "de catalog must not be empty")

const missing = collectMissing()
assert.deepEqual(
  missing,
  [],
  `missing i18n keys (key/catalog): ${JSON.stringify(missing)}`
)

console.log(`AUDIT-I18N-PASS (${stats.referencedKeys} keys checked in en+de)`)

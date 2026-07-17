#!/usr/bin/env node

/**
 * bundle-size-check.js
 *
 * Checks the production JS bundle sizes of all editor apps.
 * Warns if any entry chunk exceeds 10MB.
 * Can run locally via: node .forgejo/workflows/bundle-size-check.js
 */

const fs = require("fs")
const path = require("path")

const EDITOR_DIRS = [
  "apps/web/apps/documenteditor-react/dist",
  "apps/web/apps/spreadsheeteditor-react/dist",
  "apps/web/apps/presentationeditor-react/dist",
  "apps/web/apps/pdfeditor-react/dist",
  "apps/web/apps/visioeditor-react/dist",
  "apps/web/apps/editor-shell/dist",
]

const WARN_LIMIT_MB = 10
const FAIL_LIMIT_MB = 20
const ROOT = path.resolve(__dirname, "..")

let hasWarning = false
let hasError = false

function formatSize(bytes) {
  return (bytes / 1024 / 1024).toFixed(2)
}

function walkDir(dir, results = []) {
  if (!fs.existsSync(dir)) return results
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkDir(full, results)
    } else if (entry.isFile() && /\.(js|wasm)$/.test(entry.name)) {
      const stat = fs.statSync(full)
      results.push({ file: path.relative(ROOT, full), size: stat.size })
    }
  }
  return results
}

console.log("")
console.log("══════════════════════════════════════════════")
console.log("  Bundle Size Check")
console.log("══════════════════════════════════════════════")
console.log("")

for (const editorDir of EDITOR_DIRS) {
  const absDir = path.resolve(ROOT, editorDir)
  if (!fs.existsSync(absDir)) {
    console.log(`  ⚠  ${editorDir} — no dist found (SKIP)`)
    continue
  }

  const files = walkDir(absDir)
    .filter((f) => f.size > 1024 * 50)
    .sort((a, b) => b.size - a.size)

  if (files.length === 0) {
    console.log(`  • ${editorDir} — no significant assets`)
    continue
  }

  const totalSize = files.reduce((sum, f) => sum + f.size, 0)
  console.log(`  • ${editorDir}`)
  console.log(`    Total: ${formatSize(totalSize)} MB`)

  for (const f of files) {
    const sizeMB = formatSize(f.size)
    const label = sizeMB.padStart(8)
    const marker = f.size > FAIL_LIMIT_MB * 1024 * 1024 ? "🔴" : f.size > WARN_LIMIT_MB * 1024 * 1024 ? "🟡" : "  "
    console.log(`    ${marker} ${label} MB  ${path.basename(f.file)}`)

    if (f.size > FAIL_LIMIT_MB * 1024 * 1024) hasError = true
    if (f.size > WARN_LIMIT_MB * 1024 * 1024) hasWarning = true
  }

  console.log("")
}

console.log("──────────────────────────────────────────────")
if (hasError) {
  console.log("  ❌ FAIL: One or more chunks exceed 20MB limit.")
  process.exit(1)
} else if (hasWarning) {
  console.log("  ⚠  WARNING: One or more chunks exceed 10MB threshold.")
  console.log("  Consider further code-splitting or deferring.")
  process.exit(0) // warn-only for now
} else {
  console.log("  ✅ All bundle sizes are within acceptable limits.")
  process.exit(0)
}

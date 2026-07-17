#!/usr/bin/env node
/**
 * Bundle size checker for World Office web editors.
 *
 * Reads dist output directories for editor-shell and workspace editor apps,
 * reports total sizes for each entry chunk, and warns if any entry chunk
 * exceeds 10 MB.
 *
 * Usage:
 *   node scripts/bundle-size-check.js [--threshold=10] [--json]
 *
 * Options:
 *   --threshold=N   Max entry chunk size in MB (default: 10)
 *   --json          Output results as JSON (for CI parsing)
 */

import { existsSync, readFileSync, statSync } from "node:fs"
import { readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const APPS_WEB = path.join(ROOT, "apps/web/apps")

const EDITOR_APPS = [
  "documenteditor-react",
  "spreadsheeteditor-react",
  "presentationeditor-react",
  "pdfeditor-react",
  "visioeditor-react",
  "editor-shell",
]

const ENTRY_PATTERNS = ["index.html", "assets/index-*.js", "assets/index-*.mjs"]

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = { threshold: 10, json: false }
  for (const arg of args) {
    if (arg.startsWith("--threshold=")) {
      opts.threshold = Number.parseFloat(arg.split("=")[1])
      if (Number.isNaN(opts.threshold) || opts.threshold <= 0) {
        console.error(`Invalid threshold: ${arg.split("=")[1]}`)
        process.exit(1)
      }
    }
    if (arg === "--json") opts.json = true
  }
  return opts
}

function formatSize(bytes) {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(2)} MB`
}

async function findEntryChunks(distDir) {
  const indexHtmlPath = path.join(distDir, "index.html")
  if (!existsSync(indexHtmlPath)) return []

  const html = readFileSync(indexHtmlPath, "utf-8")
  const scriptTags = [...html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi)]
  const moduleTags = [...html.matchAll(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["'][^>]*>/gi)]

  const srcSet = new Set([
    ...scriptTags.map((m) => m[1]),
    ...moduleTags.map((m) => m[1]),
  ])

  const chunks = []
  for (const src of srcSet) {
    const absPath = path.resolve(distDir, src)
    if (existsSync(absPath) && statSync(absPath).isFile()) {
      chunks.push({ src, size: statSync(absPath).size, path: absPath })
    }
  }
  return chunks
}

async function getAllChunks(distDir) {
  const assetsDir = path.join(distDir, "assets")
  if (!existsSync(assetsDir)) return []

  const entries = await readdir(assetsDir, { withFileTypes: true })
  const files = entries.filter(
    (e) => e.isFile() && (e.name.endsWith(".js") || e.name.endsWith(".mjs") || e.name.endsWith(".css")),
  )

  return files.map((f) => {
    const absPath = path.join(assetsDir, f.name)
    return { src: `assets/${f.name}`, size: statSync(absPath).size, path: absPath }
  })
}

async function main() {
  const opts = parseArgs()
  const results = []
  let exitCode = 0

  for (const app of EDITOR_APPS) {
    const distDir = path.join(APPS_WEB, app, "dist")
    if (!existsSync(distDir)) {
      results.push({ app, status: "skipped", reason: "dist directory not found" })
      continue
    }

    const entryChunks = await findEntryChunks(distDir)
    const allChunks = await getAllChunks(distDir)

    if (entryChunks.length === 0) {
      results.push({ app, status: "skipped", reason: "no entry chunks found" })
      continue
    }

    const entryTotal = entryChunks.reduce((sum, c) => sum + c.size, 0)
    const totalBundle = allChunks.reduce((sum, c) => sum + c.size, 0)

    const oversized = entryChunks.filter((c) => c.size > opts.threshold * 1024 * 1024)

    if (oversized.length > 0) {
      exitCode = 1
    }

    results.push({
      app,
      status: oversized.length > 0 ? "FAIL" : "PASS",
      entryChunks: entryChunks.map((c) => ({ name: c.src, size: c.size, sizeFormatted: formatSize(c.size) })),
      entryTotal,
      entryTotalFormatted: formatSize(entryTotal),
      totalBundle,
      totalBundleFormatted: formatSize(totalBundle),
      threshold: opts.threshold,
      oversized: oversized.map((c) => c.src),
    })
  }

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2))
    process.exit(exitCode)
  }

  console.log("\n=== World Office Bundle Size Check ===\n")

  for (const r of results) {
    if (r.status === "skipped") {
      console.log(`  [SKIP] ${r.app} — ${r.reason}`)
      continue
    }

    const statusIcon = r.status === "PASS" ? "✓" : "✗"
    console.log(`  ${statusIcon} ${r.app}`)
    console.log(`      Entry chunks: ${r.entryChunks.length}`)
    for (const chunk of r.entryChunks) {
      const marker = chunk.size > r.threshold * 1024 * 1024 ? " ⚠ OVER LIMIT" : ""
      console.log(`        ${chunk.name}: ${chunk.sizeFormatted}${marker}`)
    }
    console.log(`      Entry total: ${r.entryTotalFormatted}`)
    console.log(`      Total bundle: ${r.totalBundleFormatted}`)
    console.log(`      Threshold: ${r.threshold} MB per entry chunk`)
    console.log()
  }

  if (exitCode === 0) {
    console.log("  ✓ All entry chunks within size limits.\n")
  } else {
    console.log("  ✗ Some entry chunks exceed size limits!\n")
  }

  process.exit(exitCode)
}

main().catch((err) => {
  console.error("Bundle size check failed:", err)
  process.exit(1)
})

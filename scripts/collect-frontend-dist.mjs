#!/usr/bin/env node
/**
 * Collect editor dist outputs into frontend-dist/ for Docker packaging.
 *
 * Each editor app has a Vite `base` path (e.g. "/word/", "/pdf/").
 * After `pnpm build`, their dist/ directories are at:
 *   apps/web/apps/{editor}-react/dist/
 *
 * This script copies each into frontend-dist/{base}/ so the
 * wo-docserver Dockerfile can COPY frontend-dist/ /app/editor-ui/.
 */

import { cp, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const APPS = join(ROOT, "apps/web/apps");
const OUT = join(ROOT, "frontend-dist");

// Editor dir -> output subdirectory
const EDITORS = {
  "documenteditor-react": "word",
  "pdfeditor-react": "pdf",
  "presentationeditor-react": "slide",
  "spreadsheeteditor-react": "sheet",
  "visioeditor-react": "diagram",
};

async function main() {
  let copied = 0;

  for (const [srcDir, outDir] of Object.entries(EDITORS)) {
    const srcPath = join(APPS, srcDir, "dist");
    const dstPath = join(OUT, outDir);

    if (!existsSync(srcPath)) {
      console.warn(`⚠  dist not found: ${srcPath} — skipping`);
      continue;
    }

    await mkdir(dstPath, { recursive: true });

    const entries = await readdir(srcPath, { withFileTypes: true });
    for (const entry of entries) {
      const src = join(srcPath, entry.name);
      const dst = join(dstPath, entry.name);
      await cp(src, dst, { recursive: true, force: true });
    }

    copied++;
    console.log(`✓ ${srcDir} -> frontend-dist/${outDir}/`);
  }

  console.log(`\nDone — ${copied}/${Object.keys(EDITORS).length} editors collected.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

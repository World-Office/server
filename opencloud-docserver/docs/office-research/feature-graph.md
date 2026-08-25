# World-Office — Required Editing Functions (DOCX / ODT parity graph)

> DAG of every editing function needed for full DOCX+ODT parity (ONLYOFFICE benchmark).
> Each function lists IST status (current World-Office converter) and REQUIRES edges
> to the modules that must support it (Converter-DOCX, Converter-ODT, UI, Sanitizer).
> Mirrored into chemie-neo4j (db chemie) as Function nodes + REQUIRES / ALIGNED_WITH / PART_OF.

Legend: ✅ = works now · ⚠️ = partial · ❌ = missing
Module deps: CD=converter.py(DOCX) · CO=odt_converter.py(ODT) · UI=editor.js · SA=sanitize.py

## 1. inline-text (PART_OF FeatureSurface)
- bold ✅ (CD,CO) — REQUIRES CD,CO
- italic ✅ (CD,CO)
- underline ✅ (CD,CO)
- strikethrough ❌ — REQUIRES CD,CO
- color ❌ (SA ok, converter ignores) — REQUIRES CD,CO
- highlight ❌ — REQUIRES CD,CO
- font-family ❌ — REQUIRES CD,CO
- font-size ❌ — REQUIRES CD,CO
- superscript ❌ — REQUIRES CD,CO
- subscript ❌ — REQUIRES CD,CO
- small-caps ❌ — REQUIRES CD,CO
- all-caps ❌ — REQUIRES CD,CO
- inline-code ❌ — REQUIRES CD,CO,UI

## 2. paragraph (PART_OF FeatureSurface)
- align L/C/R/justify ✅ (CD,CO)
- line-spacing ❌ — REQUIRES CD,CO
- indent L/R/first/hanging ❌ — REQUIRES CD,CO
- spacing before/after � loose (style whitelisted, not emitted) — REQUIRES CD,CO
- paragraph-style ❌ — REQUIRES CD,CO,UI
- rtl ❌ — REQUIRES CD,CO,UI
- page-break-before ❌ — REQUIRES CD,CO

## 3. lists (PART_OF FeatureSurface)
- bullet ✅ (CD,CO)
- numbered ✅ (CD,CO)
- multilevel ❌ — REQUIRES CD,CO,UI

## 4. structure (PART_OF FeatureSurface)
- headings ✅ (CD,CO)
- TOC ❌ — REQUIRES CD,CO,UI
- page-break ❌ — REQUIRES CD,CO,UI
- section-break ❌ — REQUIRES CD,CO
- columns ❌ — REQUIRES CD,CO

## 5. tables (PART_OF FeatureSurface)
- insert ❌ (no UI; only roundtrip) — REQUIRES UI,CD,CO
- add-row/col ❌ — REQUIRES UI,CD,CO
- merge ✅ (colspan/rowspan CD,CO)
- split ❌ — REQUIRES UI,CD,CO
- borders ❌ — REQUIRES CD,CO
- shading ❌ — REQUIRES CD,CO
- width/height ❌ — REQUIRES UI,CD,CO
- header-row ✅ (th CD,CO)
- caption ❌ — REQUIRES UI,CD,CO

## 6. objects (PART_OF FeatureSurface)
- image ⚠️ (insert+roundtrip; no resize/wrap UI) — REQUIRES UI,CD,CO
- shape ❌ — REQUIRES UI,CD,CO
- textbox ❌ — REQUIRES UI,CD,CO
- chart ❌ — REQUIRES UI,CD,CO
- equation ❌ — REQUIRES UI,CD,CO

## 7. links (PART_OF FeatureSurface)
- hyperlink ❌ — REQUIRES UI,CD,CO
- bookmark ❌ — REQUIRES UI,CD,CO
- cross-reference ❌ — REQUIRES UI,CD,CO

## 8. references (PART_OF FeatureSurface)
- footnote ❌ — REQUIRES UI,CD,CO
- endnote ❌ — REQUIRES UI,CD,CO

## 9. header-footer (PART_OF FeatureSurface)
- header ❌ — REQUIRES UI,CD,CO
- footer ❌ — REQUIRES UI,CD,CO
- page-number ❌ — REQUIRES UI,CD,CO

## 10. insert (PART_OF FeatureSurface)
- symbol ❌ — REQUIRES UI
- date-time ❌ — REQUIRES UI
- horizontal-rule ❌ — REQUIRES UI,CD,CO

## 11. view (PART_OF FeatureSurface)
- zoom ❌ — REQUIRES UI
- dark-mode ❌ — REQUIRES UI
- fullscreen ❌ — REQUIRES UI
- print-layout ❌ — REQUIRES UI

## 12. file (PART_OF FeatureSurface)
- new ❌ — REQUIRES UI
- open ❌ — REQUIRES UI
- save ✅ (WOPI)
- export-pdf/odt/html/docx ❌ — REQUIRES UI,CD,CO
- print ❌ — REQUIRES UI

## 13. collaboration (PART_OF FeatureSurface)
- comments ❌ — REQUIRES UI,CD,CO,collab
- track-changes ❌ — REQUIRES UI,CD,CO,collab
- presence-cursor ✅ (collab-presence spec)
- version-history ❌ — REQUIRES collab

## 14. tools (PART_OF FeatureSurface)
- spellcheck ❌ — REQUIRES UI
- find-replace ✅
- word-count ❌ — REQUIRES UI
- undo-redo ✅
- protect ❌ — REQUIRES UI

---
TOTAL functions: ~80 · ✅ ~16 · ⚠️ 1 · ❌ ~63
Converter gap (CD/CO) dominates; sanitizer already permissive.

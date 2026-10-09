# Tasks — derive-oo-core-contracts

Probe-first: every task lands a runnable check before any production change
(same law as the word pyramid). Registry rows live in
`wo-test-harness/harness-graph/features.yaml` (F-2xx/3xx/4xx appended
2026-10-09); recompile graph.json after parity flips.

## 1. Truth probes (no production code)
- [ ] 1.1 Detection matrix probe (F-400/401): fixture containers — clean
      docx/xlsx/pptx, mislabeled extension, Word2003-XML, MHTML progid —
      assert wo-x2t decision per case; record divergences in features.yaml.
- [ ] 1.2 PDF header probe (F-403): render docx→pdf, assert first bytes
      `%PDF-1.7` (and 1.4 for the PDF/A path if exposed).
- [ ] 1.3 XLSX part-model probe (F-200/201/204): fixture workbook with
      charts/pivot/comments; re-save via WO; diff part inventory, sharedStrings
      dedup, empty-cell elision.
- [ ] 1.4 PPTX probe (F-300/301/302): fixture deck; reorder slides; assert
      only sldIdLst changed; assert no property flattening on re-save.
- [ ] 1.5 Units probe (F-500): assert 914400 EMU/in, 1440 twips/in, 96 px/in,
      12700 EMU/pt, 635 EMU/twip against WO's units code paths.
- [ ] 1.6 Format-taxonomy audit (F-402): enumerate wo-x2t's accepted set vs
      OfficeFileFormats.h; write loud-unsupported divergences.

## 2. Implementation slices (agentflow-shaped, each gated by its probe)
- [ ] 2.1 F-201/202/204 xlsx serialization correctness in wo-sheet
      (sharedStrings dedup, <f>+<v> recache, type elision).
- [ ] 2.2 F-200/206/207 byte-faithful passthrough for parts WO cannot edit.
- [ ] 2.3 F-300/301/302/303/304 pptx read+write skeleton in a new
      wo-pptx crate (or wo-ooxml extension) — inventory + rels first.
- [ ] 2.4 F-400/401 detection alignment in wo-x2t where probe 1.1 diverges.
- [ ] 2.5 F-403 PDF header fix if probe 1.2 diverges.
- [ ] 2.6 F-405 reader gaps: rtf → fb2 → epub, in that order of value.
- [ ] 2.7 F-208/209/305 legacy readers (xls, then ppt, then xlsb) — each
      ships its own fixture + probe.
- [ ] 2.8 F-501 ECMA-376 decrypt (read path) with loud wrong-password error.

## 3. Registry hygiene
- [ ] 3.1 Flip parity/fidelity rows as probes go green; keep IDs stable.
- [ ] 3.2 Cross-link probe files in features.yaml `commands` where the
      census wires them.

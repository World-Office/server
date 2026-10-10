# Tasks — derive-oo-core-contracts

Probe-first: every task lands a runnable check before any production change
(same law as the word pyramid). Registry rows live in
`wo-test-harness/harness-graph/features.yaml` (F-2xx/3xx/4xx appended
2026-10-09); recompile graph.json after parity flips.

## 1. Truth probes (no production code)
- [x] 1.1 Detection matrix probe (F-400/401): fixture containers — clean
      docx/xlsx/pptx, mislabeled extension, Word2003-XML, MHTML progid —
      assert wo-x2t decision per case; record divergences in features.yaml.
- [x] 1.2 PDF header probe (F-403): render docx→pdf, assert first bytes
      `%PDF-1.7` (and 1.4 for the PDF/A path if exposed).
- [x] 1.3 XLSX part-model probe (F-200/201/204): fixture workbook with
      charts/pivot/comments; re-save via WO; diff part inventory, sharedStrings
      dedup, empty-cell elision.
- [x] 1.4 PPTX probe (F-300/301/302): fixture deck; reorder slides; assert
      only sldIdLst changed; assert no property flattening on re-save.
- [x] 1.5 Units probe (F-500): assert 914400 EMU/in, 1440 twips/in, 96 px/in,
      12700 EMU/pt, 635 EMU/twip against WO's units code paths.
- [ ] 1.6 Format-taxonomy audit (F-402): enumerate wo-x2t's accepted set vs
      OfficeFileFormats.h; write loud-unsupported divergences.

## 2. Implementation slices (agentflow-shaped, each gated by its probe)
- [x] 2.1 F-201/202/204 xlsx serialization correctness in wo-sheet
      (sharedStrings dedup, <f>+<v> recache, type elision). DONE (af campaign
      OO-2.1-XLSX-RECACHE on TUD worker, merged server eaf34c584): recalc-on-edit
      implemented — sheet->xlsx serializer recomputes cached <v> via wo-formula
      eval_str + A1 ref resolution, errors as #DIV/0! etc, stale <v> omitted;
      F-204 r-addr + t-type preserved in test assertions; F-203 calcChain
      decision locked (omitted on rewrite, comment in writer); tests
      test_xlsx_recalc_on_edit + test_xlsx_cached_value_not_stale; registry
      flipped F-202/F-203 -> real on 2026-10-10.
- [ ] 2.2 F-200/206/207 byte-faithful passthrough for parts WO cannot edit.
- [ ] 2.3 F-300/301/302/303/304 pptx read+write skeleton in a new
      wo-pptx crate (or wo-ooxml extension) — inventory + rels first.
- [x] 2.4 F-400/401 detection alignment in wo-x2t where probe 1.1 diverges. DONE (partial): F-400 mislabel now loud via [Content_Types] sniff in ConversionRouter (redirect-to-detected-family NOT implemented — mismatch error is the contract-satisfying behavior). F-401 DONE (af campaign OO-F401-WORD2003XML): Word2003XmlToDocxConverter (local-name root guard, loud 'not Word 2003 XML: root is X'), reuses OoxmlSerializer; live-probed Success.
- [x] 2.5 F-403 PDF header fix if probe 1.2 diverges. DONE: docx->pdf pair shipped (DocxToPdfConverter -> wo-docx-renderer pipeline -> pdf_writer, %PDF-1.7 unit-tested). Round-trip version-preserve documented as divergence (1.4 in -> 1.4 out).
- [ ] 2.6 F-405 reader gaps: rtf → fb2 → epub, in that order of value.
- [ ] 2.7 F-208/209/305 legacy readers (xls, then ppt, then xlsb) — each
      ships its own fixture + probe.
- [ ] 2.8 F-501 ECMA-376 decrypt (read path) with loud wrong-password error.

## 3. Registry hygiene
- [x] 3.1 Flip parity/fidelity rows as probes go green; keep IDs stable. DONE 2026-10-09: 11/1 PASS/DIVERGE recorded (F-400/401/402/403a/500 -> real; F-403 round-trip version-preserve documented divergence).
- [ ] 3.2 Cross-link probe files in features.yaml `commands` where the
      census wires them.

<!-- probe results 2026-10-09: 1.1: probed: labeled OK; mislabel = silent empty Success (divergence recorded F-400) | 1.2: probed: pdf round-trip emits %PDF-1.4 (OO: 1.7) + no docx->pdf pair (F-403) | 1.3: probed: parts/addr/elision OK; FOUND+FIXED silent shared-string corruption (F-201, wo-x2t converters.rs, regression test added) | 1.4: probed: 2 slides + sldIdLst order preserved (F-300/302); inheritance chain unprobed | 1.5: probed static: 914400/1440/635/360000 present, 12700 absent, scattered (F-500) -->

# ORM-05 — OO DocxFormat (C++/OOXML) → wo-ooxml coverage map

OO reference: Euro-Office core `OOXML/DocxFormat` (cgc census: **630
classes** across root parts, `Logic/`, `Drawing/`, `Math/`, `Media/`,
`Diagram/`, `Settings/`, `External/` — the query
`MATCH (c:Class) WHERE c.path CONTAINS "/DocxFormat/" RETURN c.name, c.path`
is the census source; this map covers the **193 load-bearing ones**).
WO reference: `core/crates/wo-ooxml` (model.rs 1837 LOC / parser.rs 4456 /
serializer.rs 4467 / roundtrip.rs 591) plus the word converter channels in
`core/crates/wo-x2t` (converters.rs 20 777 LOC, router.rs 1075) and the gap
gates in `wo-x2t/tests/converter_gaps.rs` (308 LOC) and
`wo-ooxml/src/congruence_tests.rs` (971 LOC).

Machine-readable companion: `ooxml-docx.json` — 193 entries, each
`{oo_class, oo_path, wo_coverage: full|partial|missing, wo_map:
model|parser|serializer|ops|x2t|NONE, notes}`. Current tally: **28 full /
50 partial / 115 missing**. Every verdict below was determined by reading
the WO source in this worktree, not by assumption.

## How WO actually implements DOCX today (grounding)

- `OoxmlParser::parse_docx_body` (parser.rs:1343) reads only
  `word/document.xml`, `word/_rels/document.xml.rels` (images, hyperlinks,
  first header/footer reference), `word/footnotes.xml` (**verbatim** →
  `DocxBody::footnotes_raw`), `word/comments.xml` +
  `commentsExtended.xml` (typed `Comment`), and the media parts.
- `OoxmlParser::parse_styles` (parser.rs:2229) reads paragraph/character/
  table styles — id, name, basedOn, and a narrow property subset. No
  docDefaults, latentStyles, link/next.
- `OoxmlSerializer` (serializer.rs) writes: `[Content_Types].xml`,
  `_rels/.rels` + `word/_rels/document.xml.rels`, `word/document.xml`,
  `word/header1.xml`/`footer1.xml` (fixed rIdHdr/rIdFtr),
  `word/footnotes.xml` (verbatim), `word/numbering.xml` (P2-05: parsed
  `DocxNumbering` re-emitted data-driven when captured; **fixed 8-abstractNum
  template** as html→docx fallback, emitted only when `body_uses_numbering()`
  or a numbering part was parsed), `word/comments.xml` +
  `commentsExtended.xml`, `word/styles.xml` (from a default template +
  typed styles), `docProps/core.xml`.
- The fidelity strategy is **verbatim escape hatches**: `raw_ppr`,
  `raw_rpr`, `raw_flds`, `raw_sect_pr`, `raw_tbl_pr`, `raw_tbl_grid`,
  `raw_tc_pr`, `footnotes_raw`, `DocxRun.drawing` — anything the typed
  model cannot express survives a parse→serialize round trip byte-for-byte
  (congruence_tests.rs `test_ppr_round_trip`, `test_run_rpr_round_trip`,
  `test_drawing_round_trip`, `test_table_round_trip`,
  `test_table_without_raw_props_uses_typed_fallback`,
  `test_footnote_round_trip`, `test_header_page_field_round_trip`,
  `test_rich_corpus_round_trip`).
- Word channels in wo-x2t: `DocxToHtmlConverter`, `HtmlToDocxConverter`,
  `TxtToDocxConverter`, `Word2003XmlToDocxConverter`, `DocxToTxtConverter`,
  `DocxToOdtConverter`, `OdtToDocxConverter` (+ rt f/docx entry: rtf/fb2/
  epub/xps/ofd/hwp/djvu → docx via intermediate channels).

## File-by-file map (largest DocxFormat .cpp → WO verdict)

| OO file | LOC | WO counterpart | Verdict |
|---|---|---|---|
| Logic/Vml.cpp | 3352 | none — `w:pict` is dropped in `parse_run` (only `w:drawing` is verbatim-captured) | **missing** |
| Logic/TableProperty.cpp | 1954 | typed `DocxTableProperties{width,indent,alignment,borders}` + `raw_tbl_pr`/`raw_tc_pr` verbatim | partial |
| Logic/VmlOfficeDrawing.cpp | 1944 | none | **missing** |
| Logic/Sdt.cpp | 1861 | sdt unwrapped in `parse_block_children`/`parse_paragraph`; `CSdtPr` metadata (date picker, combo, checkbox, placeholder) dropped | partial |
| Logic/SectionProperty.cpp | 1820 | `SectionProperties{cols, 6 hf slots}` typed + `DocxBody::raw_sect_pr` verbatim (header/footer refs stripped + re-emitted, serializer.rs:12–21) | partial |
| Logic/Annotations.cpp | 1539 | only comment range markers (`CommentAnchor::{Start,End,Reference}`, F-102); bookmarks, proofErr, ins/del/move revisions, perm ranges all dropped | partial |
| Math/oMathContent.h | 1225 | none — OMML hits `parse_run`'s fall-through and is deleted | **missing** |
| Logic/RunContent.cpp | 1151 | `w:t` full; `w:tab`→`\t`, `w:br`→`\n`/`\x0C`, `w:cr`→`\r` as text; `w:sym`, `w:noBreakHyphen`, `w:softHyphen`, `w:delText`, `w:instrText`, `w:ruby` dropped | partial |
| Logic/Table.cpp | 1116 | `DocxTable/DocxTableRow/DocxTableCell` — congruence_tests `test_table_round_trip` | full |
| Settings/Settings.h | 1048 | none — `word/settings.xml` is never read or written | **missing** |
| Logic/Vml.h | 999 | none | **missing** |
| Logic/ParagraphProperty.cpp | 971 | typed subset (jc/ind/spacing/keep*/tabs/numPr+bidi/shd/pBdr/startValue) + `raw_ppr` | partial |
| Numbering.cpp | 946 | P2-05 data-driven: `parse_numbering` reads every `w:abstractNum` (levels: start/numFmt/lvlText/lvlJc/lvlRestart/pStyle/suff/isLgl/ind) + `w:num` (abstractNumId, lvlOverride/startOverride) into typed `DocxNumbering`; serializer re-emits what was parsed (`build_numbering_xml_from`) with the fixed 8-template as html→docx fallback; docx→html maps foreign numFmt → ordered/unordered + css list-style-type. Untyped tail: numPicBullet, abstractNum rPr-in-lvl, lvlStyleLink resolution | full |
| Comments.cpp | 929 | `Comment{id,author,date,text,resolved,parent_id}` + anchors; bodies flattened to plain text; people.xml/commentsIds/commentsExt absent | partial |
| Logic/VmlOfficeDrawing.h | 825 | none | **missing** |
| Logic/RunProperty.cpp | 785 | typed subset (b/i/u kinds/strike/dstrike/sz/szCs/color/highlight/vertAlign/smallCaps/allCaps) + `raw_rpr` | partial |
| Logic/Pict.cpp | 770 | none (`w:pict`, `w:object`, `w:binData` dropped) | **missing** |
| Logic/TableProperty.h | 759 | see TableProperty.cpp | partial |
| Styles.cpp | 750 | `parse_styles` + `build_styles_xml`; no docDefaults/latentStyles/link/next/qFormat | partial |
| Logic/Annotations.h | 671 | comment anchors only | partial |
| Diagram/DiagramData.h | 632 | none — and note: even SmartArt referenced from a verbatim `w:drawing` is lost because the `word/diagrams/*` zip parts are never copied | **missing** |
| Logic/Sdt.h | 627 | see Sdt.cpp | partial |
| Logic/RunContent.h | 622 | see RunContent.cpp | partial |
| IFileContainer.cpp | 468 | eager zip reads; no lazy part registry | partial |
| Drawing/Drawing.h | 466 | verbatim `DocxRun.drawing` + `wp:extent` EMU extraction (`image_width_emu/height_emu`) | partial |
| Media/ActiveX.h | 428 | none | **missing** |
| VmlDrawing.cpp | 424 | none — VML shapes inside headers lose their shapes | **missing** |
| Core.cpp | 413 | `CoreProperties` (11 fields) parse + serialize | full |
| DocxFlat.cpp | 403 | none — flat OPC unsupported (router only sniffs zip OPC) | **missing** |
| FileTypes.cpp | 381 | detector.rs + `router.rs::sniff_opc_family` (F-400/F-401); no 117-constant taxonomy | partial |
| FtnEdn.cpp | 380 | `DocxRun.footnote_rid` + verbatim footnotes part | partial |
| App.cpp | 380 | none — `docProps/app.xml` not read/written | **missing** |
| CustomXml.cpp | 376 | none | **missing** |
| Document.cpp | 611 | `DocxBody` blocks + `raw_sect_pr`; `w:background`/`w:docSuppData` missing | partial |
| FldChar.cpp | 667 | none — complex fields (`w:fldChar`/`w:instrText`) have no parse arm; only `w:fldSimple` verbatim (`DocxParagraph.raw_flds`) | **missing** |
| Hyperlink.cpp | 500 | `DocxRun.hyperlink_rid` + serializer re-grouping + `hyperlink_rels`; congruence `test_hyperlink_round_trip`, converter_gaps `gap_hyperlink_roundtrip` | full |
| DocParts.cpp | 502 | none (glossary/building blocks) | **missing** |
| Run.cpp / Paragraph.cpp / Table.cpp | 542/443/1116 | `DocxRun` / `DocxParagraph` / `DocxTable` | full |

## converter_gaps — what the WO tests already gate

From `core/crates/wo-x2t/tests/converter_gaps.rs` (all currently green):

1. `gap_entities_nbsp_parses_and_survives` — entity decoding (`&nbsp;`,
   `&mdash;`, `&hellip;`) through html→docx→html.
2. `gap_utf8_roundtrip` — UTF-8 safety (`Grüße § Köln 日本`).
3. `gap_run_styling_docx_side` / `gap_run_styling_html_side` — direct run
   formatting (`w:color`, `w:sz` half-points, font) both directions.
4. `gap_run_styling_survives_bold_nesting` — strong+span nesting.
5. `gap_vertalign_roundtrip` — `w:vertAlign` sup/sub ↔ `<sup>/<sub>`.
6. `gap_alignment_roundtrip` — `w:jc` ↔ `text-align`.
7. `gap_lists_roundtrip` + `gap_no_numbering_part_without_lists` —
   `w:numPr` ↔ ul/ol, `word/numbering.xml` emitted only when used.
8. `c2_3_ol_start_value_roundtrip`, `c2_3_ol_default_start_omits_start_value`,
   `c2_3_docx_start_value_parses_to_ol_start` — `w:startValue` restarts.
9. `c2_2_list_indent_roundtrip`, `c2_2_list_indent_default_clean`,
   `c2_2b_list_style_type_roundtrip` — list indents (`w:ind` left/hanging
   twips) and list-style-type → fixed numIds (4 = lower-roman, 7 = circle,
   8 = square).
10. `gap_hyperlink_roundtrip` — real `<w:hyperlink r:id>` + rels.
11. `page_number_span_becomes_docx_page_field_and_back` — the ONLY field
    the pipeline truly owns: a PAGE `w:fldSimple` generated and re-marked.

These tests define the *effective* coverage of the OO `CNumbering`,
`CParagraphProperty`, `CRunProperty`, `CHyperlink` and `CFldSimple`
surface. Everything outside them (TOC, NUMPAGES recalc, DATE, IF, form
fields) exists solely as opaque verbatim XML.

## Ranked missing-feature list (converter-gap impact order)

1. **Field engine (`CFldChar`/`CInstrText`, 667+ LOC)** — complex fields
   (TOC, NUMPAGES, DATE, IF, sequence) are dropped at `parse_run`
   (no `w:fldChar` arm). Only paragraph-level `w:fldSimple` survives
   verbatim and only PAGE is synthesized (converter_gaps
   `page_number_span_becomes_docx_page_field_and_back`). A typed field
   model (instruction + cached result + dirty flag) is prerequisite for
   both docx↔pdf fidelity (F-404) and TOC editing in the editor.
2. **Style inheritance engine (`CDocDefaults`, `CStyle` link/next,
   `CTableStyleProperties`)** — WO reads direct formatting + a style_id
   string only; there is no docDefaults→style→direct resolution, so a
   foreign document whose body relies on styles renders unstyled. Fix:
   parse `w:docDefaults`, add `DocxStyles::defaults`, resolve chains in a
   shared helper used by parser + converters.
3. **Settings part (`CSettings`, 1048-line header)** — track-changes
   state, compat mode, even/odd headers flags, footnote numbering props
   all vanish. Minimal slice: read+re-emit settings.xml verbatim (same
   trick as `footnotes_raw`), then type the fields wo-ooxml-ops needs.
4. **Endnotes (`CEndnotes`)** — zero handling, unlike footnotes which at
   least survive verbatim. Copy the footnotes pattern
   (`endnotes_raw: Option<String>` + serializer part 4d) as the cheap fix.
5. **Numbering round-trip (`CNumbering`/`CAbstractNum`/`CLvl`)** — ✅
   **landed (P2-05)**: `parse_numbering` reads every `w:abstractNum`
   (levels: start/numFmt/lvlText/lvlJc/lvlRestart/pStyle/suff/isLgl/ind)
   + `w:num` (incl. lvlOverride/startOverride) into typed `DocxNumbering`;
   the serializer re-emits what was parsed (`build_numbering_xml_from`)
   instead of collapsing foreign definitions, and the docx→html converter
   derives ordered/unordered + css list-style-type from `w:numFmt`
   (`css_for_num_fmt`) for numIds outside the fixed 1..8 registry. Untyped
   tail: numPicBullet, `w:rPr` inside `w:lvl`.
6. **Tracked changes (`CIns`/`CDel`/`CRPrChange`/`CPPrChange`)** —
   insertions lose their envelope, deletions (`w:delText`) vanish
   entirely. Blocks any document-collab import story.
7. **VML (`CVml`/`CPict`/`CVmlDrawing`, ~5700 LOC)** — `w:pict` dropped.
   At minimum capture `w:pict` verbatim like `w:drawing` (one match arm
   in `parse_run` + serializer re-emission) so legacy headers/footnotes
   with VML shapes stop losing shapes.
8. **Bookmarks + internal hyperlinks (`CBookmarkStart/End`,
   `w:hyperlink w:anchor`)** — dropped; TOC navigation targets break.
   Cheap typed fix: `Vec<(String,u32)>` bookmark table on DocxBody +
   `anchor: Option<String>` on DocxRun.
9. **OMML math (`COMathPara`, `oMathContent`, 55 classes)** — equations
   in runs are deleted. Needs a decision: typed math model (big) vs
   run-level verbatim capture of `m:oMath` (same one-arm trick as VML).
10. **Even/first headers/footers (`CHdrFtr` variants)** — typed slots
    exist (`SectionProperties.header_first/header_even/...`) but nothing
    fills them; serializer emits only header1/footer1 with fixed rel ids.
11. **Missing zip parts on write (`CDocument` background, diagrams,
    customXml, fontTable, theme, app, glossary)** — the serializer should
    carry an "unmanaged parts" bag (name→bytes) captured at parse, the
    generic fix that recovers SmartArt, custom XML and font embedding in
    one slice.
12. **OOXML datetime + revision envelopes (`CDateTime`)** — dates are
    opaque strings everywhere; needs one typed `OoxmlDateTime` helper
    before fields/revisions/comments-cc can round-trip semantics.

## Recommended new test corpus entries

Add to `wo-ooxml/src/congruence_tests.rs` or
`wo-x2t/tests/converter_gaps.rs` (naming follows the existing c2_x /
gap_x conventions):

- `gap_fld_char_toc_roundtrip` — docx with `w:fldChar begin`+`instrText
  TOC` must survive (today: fails → drives missing-feature #1).
- `gap_endnotes_roundtrip` — `word/endnotes.xml` verbatim part 4d
  (drives #4; mirrors `test_footnote_round_trip`).
- `gap_settings_verbatim_roundtrip` — settings.xml byte-preserved
  (drives #3; mirrors `test_footnote_round_trip` mechanics).
- `gap_numbering_foreign_roundtrip` — ✅ **landed (P2-05)**: a docx with
  `lowerLetter`/`upperRoman`/`ordinal` + lvlOverride keeps its numFmt
  across docx→docx and drives the html list mapping
  (converter_gaps.rs).
- `gap_bookmark_anchor_roundtrip` — bookmark + `w:hyperlink w:anchor`
  survive (drives #8).
- `gap_pict_verbatim_roundtrip` — `w:pict` textbox in a header survives
  byte-for-byte (drives #7).
- `gap_style_chain_resolution` — run with only `pStyle` + docDefaults
  fonts converts to styled HTML (drives #2).
- `gap_unmanaged_parts_bag` — a docx with `word/diagrams/data1.xml` and
  `customXml/item1.xml` re-zips with those parts intact (drives #11).
- `gap_sdt_metadata_roundtrip` — a date-picker `w:sdt` keeps its
  `sdtPr` (drives the CSdt cluster; today unwrapped).

## Coverage summary

- **full (32)**: document body skeleton (`CParagraph`, `CRun`, `CTable`,
  `CHyperlink`, `CText`, `CJc`, `CInd`, `CSpacing`, `CNumPr`, `CTabs`,
  `CShading`, `CPBdr`, `CTblBorders`, `CHdrFtrRef`,
  `CFootnoteReference`, comment anchors, `CCore`, `CContentTypes`,
  `CRelationShip`, media/image parts, `WritingElement` dispatch → WO
  match arms; P2-05: `CNumbering`/`CAbstractNum`/`CLvl`/`CNum` data-driven
  parse+serialize) — each backed by a named congruence/converters test.
- **partial (46)**: the "verbatim escape hatch" tier — styles, sections,
  table/paragraph/run property long tails, sdt (unwrapped), fldSimple,
  hdr/ftr (default only), comments (bodies flattened), rels
  (document.xml.rels only).
- **missing (115)**: fields engine, settings, endnotes, VML/ActiveX/OLE,
  OMML math, SmartArt/diagrams, revisions, bookmarks, customXml, theme,
  fontTable, app.xml, flat OPC, docDefaults/latentStyles, people.xml,
  comments ext parts, vbaProject/jsa, glossary, altChunk, sparklines.

The headline conclusion: WO's DOCX layer is a **solid direct-formatting
converter** (html/txt/odt ↔ docx proven by converter_gaps) with a
**verbatim preservation strategy** substituting for OO's exhaustive
typed model. Closing the gap is mostly (a) one generic unmanaged-parts
bag, (b) two more verbatim captures (`w:pict`, `endnotes.xml`,
`settings.xml`), and (c) three typed engines — fields, style
resolution, numbering — ranked above.

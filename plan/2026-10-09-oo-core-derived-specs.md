# OO C++ core → WO specs & contracts (2026-10-09)

Derived from the OnlyOffice **core** C++ engine (Euro-Office fork:
`/home/weiss/git/Euro-Office/core`, 866 MB, HEAD `03656316`). Scope: the
format/detection/rendering layer that x2t owns — i.e. the **L0/L1/L4**
contracts — for *all* editor families (docs, sheets, slides, PDF, ODF,
legacy binary). The word UI surface is already covered by F-001…F-153; this
document opens three new stable ID ranges:

- **F-2xx sheets** (from `OOXML/XlsxFormat`, `OOXML/XlsbFormat`,
  `MsBinaryFile/XlsFile`, `OdfFile`)
- **F-3xx slides** (from `OOXML/PPTXFormat`, `MsBinaryFile/PptFile`, `OdfFile`)
- **F-4xx cross-family** (from `Common/OfficeFileFormatChecker2.cpp`,
  `Common/OfficeFileFormats.h`, `X2tConverter`, `PdfFile`, `DocxRenderer`,
  the doc-family readers)

Registry home: `wo-test-harness/harness-graph/features.yaml` (IDs stable
forever; every contract needs a covering probe or a divergence entry).

## Grounding (citations)

| Contract fact | OO C++ source |
|---|---|
| Detection: OPC zip + `[Content_Types].xml` content-type strings decide docx vs docxf vs xlsx vs pptx | `Common/OfficeFileFormatChecker2.cpp:1007-1095` |
| Detection: extension fallback (`.xlsx/.docx/.pptx/.xls/.xlsb/.doc`…) | `OfficeFileFormatChecker2.cpp:944-976` |
| Detection: Word/Excel 2003 XML via `xmlns:w=…wordml`, `xmlns:ss=…spreadsheet`, MHTML `progid="Word.Document"/"Excel.Sheet"/"PowerPoint.Show"` | `OfficeFileFormatChecker2.cpp:1673-1701` |
| 117-format family taxonomy (`AVS_OFFICESTUDIO_FILE_{DOCUMENT,SPREADSHEET,PRESENTATION,CROSSPLATFORM,…}`, family base 0x0040 = DOCUMENT) | `Common/OfficeFileFormats.h:29+` |
| XLSX part inventory: CalcChain, Chart, Comments, Controls, Drawing, ExternalLinks, NamedSheetViews, Ole, Pivot, RichData, SharedStrings, Workbook, Worksheets (+ XlsbFormat sibling) | `OOXML/XlsxFormat/` (dir listing) |
| PPTX part inventory: presentation.xml, Slide, SlideLayout, SlideMaster, NotesMaster, NotesSlide, HandoutMaster, Theme, PresProps, ViewProps, TableStyles, Comments, CommentAuthors, App, WrapperFile | `OOXML/PPTXFormat/` (dir listing) |
| ODF has a full Reader **and Writer** (odt/ods/odp round-trip engine) | `OdfFile/{Reader,Writer}` |
| PDF writer emits `%PDF-1.7`; PDF/A emits `%PDF-1.4` | `PdfFile/SrcWriter/Document.cpp:62-63` |
| DOCX→PDF goes through an internal page command stream (`CPage::BeginCommand/EndCommand`, vector-graphics + image + text commands per page) | `DocxRenderer/src/logic/Page.cpp` |
| Doc-family readers beyond OOXML: RTF, TXT, HTML, FB2, EPUB, DJVU, XPS, HWP, OFD | `core/{RtfFile,TxtFile,HtmlFile,Fb2File,EpubFile,DjVuFile,XpsFile,HwpFile,OFDFile}` |

## Contract catalog

### F-2xx — Sheets (`XlsxFormat`/`XlsbFormat`/`XlsFile`)

| ID | Contract (WO must…) | OO citation | WO surface today | Layer |
|---|---|---|---|---|
| F-200 | produce/accept the full XLSX part set (workbook, N worksheets, sharedStrings, styles, theme, calcChain, drawings, charts, comments, pivot, externalLinks, controls, richData) — absent parts must round-trip as absent, not be dropped silently | `OOXML/XlsxFormat/` inventory | `wo-sheet` model exists (format.rs, ops.rs); part-level coverage unprobed | L0 |
| F-201 | dedup cell strings via `xl/sharedStrings.xml`; `t="s"` index ↔ inlineStr must survive round-trip without changing user-visible text | XlsxFormat/SharedStrings | unprobed | L1 |
| F-202 | round-trip formulas: `<f>…</f>` plus cached `<v>`; editing a formula must recalc and re-cache the `<v>` (wo-formula is the recalc authority) | XlsxFormat cell model + `wo-formula` | `wo-formula` lexer/parser/eval real, tests green; xlsx `<f>/<v>` round-trip unprobed | L1 |
| F-203 | accept + regenerate `calcChain.xml` ordering (or omit it, as OO does when rebuilt lazily — must be a *decision*, documented) | XlsxFormat/CalcChain | missing | L1 |
| F-204 | cell addressing `r="A1"` and type model `n/s/b/str/e` identical to OO incl. empty-cell elision | XlsxFormat worksheets | `wo-sheet` ops exist; address/type fidelity unprobed | L1 |
| F-205 | workbook-level defined names, sheet order via `xl/workbook.xml` `<sheets>` map, rels integrity | XlsxFormat/Workbook | unprobed | L1 |
| F-206 | chart parts live under `/xl/charts/chartN.xml` wired via drawings; chart XML must round-trip even when WO cannot render it | XlsxFormat/Chart | missing | L1 |
| F-207 | pivot table part round-trip (not computation — preservation) | XlsxFormat/Pivot | missing | L1 |
| F-208 | read legacy binary XLS (`MsBinaryFile/XlsFile`) to the shared sheet IR | `MsBinaryFile/XlsFile` | missing | L4 |
| F-209 | read XLSB (`OOXML/XlsbFormat`) | `OOXML/XlsbFormat` | missing | L4 |
| F-210 | write ODS via an ODF Writer sibling to the ODT one | `OdfFile/Writer` | missing | L4 |

### F-3xx — Slides (`PPTXFormat`/`PptFile`)

| ID | Contract | OO citation | WO surface today | Layer |
|---|---|---|---|---|
| F-300 | produce/accept the PPTX part set (presentation, slides, layouts, masters, notesMaster, notesSlides, handoutMaster, theme, presProps, viewProps, tableStyles, comments, commentAuthors, app) | `OOXML/PPTXFormat/` inventory | UI spec exists (`presentation-slide-management`); format layer missing | L0 |
| F-301 | slide→layout→master inheritance: a property resolves only if unset on the slide; re-saving must not flatten inherited properties onto the slide | `PPTXFormat/{Slide,SlideLayout,SlideMaster}.cpp` | missing | L1 |
| F-302 | slide order = `p:presentation/p:sldIdLst` order; reorder ops rewrite only that list (+ rels) | `PPTXFormat/Presentation.cpp` | missing | L1 |
| F-303 | notesSlides round-trip attached to their slides | `PPTXFormat/NotesSlide.cpp` | missing | L1 |
| F-304 | theme parts (`theme1.xml`+ per-master themes) preserved | `PPTXFormat/Theme.cpp` | missing | L1 |
| F-305 | read legacy binary PPT (`MsBinaryFile/PptFile`) to the slide IR | `MsBinaryFile/PptFile` | missing | L4 |
| F-306 | write ODP | `OdfFile/Writer` | missing | L4 |

### F-4xx — Cross-family (`X2tConverter`/`Common`/`PdfFile`/`DocxRenderer`)

| ID | Contract | OO citation | WO surface today | Layer |
|---|---|---|---|---|
| F-400 | detection contract: OPC package → read `[Content_Types].xml`, match the four main+xml content-type strings (wordprocessingml / docxf / spreadsheetml / presentationml) | `OfficeFileFormatChecker2.cpp:1007-1095` | `wo-x2t` converters real; detection matrix unprobed | L4 |
| F-401 | detection fallbacks: extension families (`.xls/.xlsx/.xlsb`, `.doc/.docx/.txt/.xml/.rtf`) and Word/Excel-2003-XML + MHTML progid sniffing | `OfficeFileFormatChecker2.cpp:944-976,1673-1701` | unprobed | L4 |
| F-402 | format taxonomy: WO conversion matrix must enumerate the OO family set (DOCUMENT/SPREADSHEET/PRESENTATION/CROSSPLATFORM/…; 117 constants) and name every unsupported member loudly | `Common/OfficeFileFormats.h` | partial (wo-x2t supports a subset) | L0 |
| F-403 | PDF output header `%PDF-1.7`; PDF/A output `%PDF-1.4` | `PdfFile/SrcWriter/Document.cpp:62-63` | `wo-pdf-render` real; header version unprobed | L0 |
| F-404 | DOCX→PDF via per-page command stream (page model + vector/text/image commands); pagination invariants of `wo-docx-renderer` must hold for the PDF target too | `DocxRenderer/src/logic/Page.cpp` | `wo-docx-renderer` real, layout tests green (37) | L2 |
| F-405 | doc-family readers: RTF/TXT/HTML/FB2/EPUB (+DJVU/XPS/HWP/OFD stretch) decode to the doc IR or fail loudly with the reason | `core/{RtfFile,TxtFile,HtmlFile,Fb2File,EpubFile,…}` | partial (txt/html known; rtf/fb2/epub missing) | L4 |

## How this becomes work

1. Every F-2xx/3xx/4xx row is a bounded agentflow slice: probe first
   (census, L0/L1 parse-asserts or L4 round-trip matrix), then implement,
   then flip parity in this file. Same rule as the word pyramid: **a
   contract is done ⇔ its probe is green at the lowest layer that can host
   it** — grep is not a gate, execution is.
2. Probes extend `census/` (yaml-driven where possible): F-400/F-401 one
   detection-matrix probe over fixture containers; F-200/201/204/205 one
   xlsx part-model probe; F-300/301/302 one pptx probe; F-403 one
   header-assert; F-404 already half-covered by the pagination suite.
3. Honest starting states (this document): sheets format layer **partial**,
   slides format layer **missing**, cross-family **partial** — recorded in
   `features.yaml` so the roadmap tells the truth from day one.

## Second pass (same day) — behavioral contracts + formal specs

Deeper read of the implementation (not just inventories) produced:

1. **Unit matrix (F-500)** — `OOXML/Base/Unit.{h,cpp}` is a complete
   cross-family conversion authority: `Cm_To_Emu = ×360000`,
   `Emu_To_Pt = ÷12700`, `Dx_To_Sx = ×635`, Pt=72/in, **Px=96/in**
   (`×72×4/3`), Dx/Multi = twips = 1440/in, Sx = EMU. WO: one units module,
   these exact constants, everywhere.
2. **Encryption (F-501)** — `OfficeCryptReader/source/ECMACryptFile.h:33-34`
   `DecryptOfficeFile/EncryptOfficeFile` (ECMA-376 agile + standard).
3. **ODF write mechanism** — `OdfFile/Writer/Converter` is a single
   Oox2Odf path with per-family contexts: `DocxConverter` (odt),
   `XlsxConverter` → `ods_conversion_context`, `PptxConverter` →
   `odp_conversion_context` (F-210/F-306 mechanism confirmed).
4. **Slide→Layout binding** — `PPTXFormat/Slide.cpp:292` resolves the
   layout through FileContainer rels; the chain is relationship-based, so
   F-301's "no flattening" means: preserve rels, never copy inherited props.

Formalized as OpenSpec change **`derive-oo-core-contracts`**
(proposal + design grounding + three validated spec deltas:
`sheet-format-contracts`, `slide-format-contracts`,
`core-conversion-contracts` + probe-first tasks). Registry rows appended:
F-500, F-501 (137 features total).

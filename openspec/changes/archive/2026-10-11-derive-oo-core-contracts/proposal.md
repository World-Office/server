## Why
The WO contract registry (F-001…F-153) covers only the word-processor UI
surface. The OnlyOffice **core C++ engine** (Euro-Office fork,
`~/git/Euro-Office/core`, 866 MB) defines the format/detection/rendering
contracts for *every* family — sheets, slides, ODF, PDF, legacy binary — and
WO has never derived from it. This change turns that C++ into executable
contracts (registry IDs F-2xx/F-3xx/F-4xx, already appended to
`harness-graph/features.yaml`) and pins them with probe-first tasks.

## What Changes
- Three new capabilities with spec deltas: `sheet-format-contracts` (F-2xx),
  `slide-format-contracts` (F-3xx), `core-conversion-contracts` (F-4xx + the
  units matrix and ECMA-376 encryption found in the second C++ pass).
- Census probes for the cheapest truth-set first: detection matrix
  (F-400/401), PDF header (F-403), xlsx part model (F-200/201/204),
  pptx inventory + sldIdLst (F-300/302).
- No production code in this change; it is the contract layer that later
  implementation slices (agentflow) hang off.

## Grounding (key citations)
- Detection: `Common/OfficeFileFormatChecker2.cpp:1007-1095` (content-type
  strings), `:944-976` (extension fallbacks), `:1673-1701` (2003-XML/MHTML).
- Taxonomy: `Common/OfficeFileFormats.h` (117 constants, family base 0x0040).
- Units: `OOXML/Base/Unit.{h,cpp}` — Emu=360000/cm (914400/in),
  Twips(Dx/Multi)=1440/in, Pt=72/in, Px=96/in, Sx=EMU, Emu_To_Pt=÷12700,
  Dx→Sx=×635.
- Sheets: `OOXML/XlsxFormat/` part inventory (CalcChain, Chart, Pivot,
  RichData, SharedStrings, Workbook, …) + `OOXML/XlsbFormat`.
- Slides: `OOXML/PPTXFormat/` (Slide→Layout rel at Slide.cpp:292; parts:
  NotesMaster/NotesSlide/HandoutMaster/Theme/PresProps/ViewProps/…).
- ODF: `OdfFile/Writer/Converter/{DocxConverter,XlsxConverter(ods_context),
  PptxConverter(odp_context)}` — one Oox2Odf path for all families.
- PDF: `PdfFile/SrcWriter/Document.cpp:62-63` (`%PDF-1.7`; PDF/A `%PDF-1.4`).
- Encryption: `OfficeCryptReader/source/ECMACryptFile.h:33-34`
  (DecryptOfficeFile/EncryptOfficeFile, ECMA-376 agile/standard).
- DOCX→PDF: `DocxRenderer/src/logic/Page.cpp` per-page command stream.

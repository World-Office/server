# OO → WO port map: legacy binary formats (MsBinaryFile → wo-msbinary)

Task: ORM-08 · part of the OO→Rust 1:1 port (see `config/oo-rust-map/tasks.json`).
Companion data: `plan/oo-port/legacy-binary.json` (53 rows: 5 full, 9 partial, 1 stub, 38 missing).

Sources: the ORM task's verified OO census facts (Euro-Office core `MsBinaryFile`,
2,954 files; `DocFile` 287 files / 330 classes, `XlsFile` incl. `Converter/oox_package.h`,
`PptFile`, `Common`), read against **this worktree's** `core/crates/wo-msbinary`
(3,482 LOC measured: biff8.rs 497, crypt.rs 109, detector.rs 471, lib.rs 27,
model.rs 102, ole.rs 1,302, ppt.rs 233, roundtrip.rs 226, xlsb.rs 515) and its
consumers in `core/crates/wo-x2t/src/converters.rs`.

## 1. What wo-msbinary actually is

wo-msbinary is **not** a port of MsBinaryFile. It is a small, honest subset:

| wo-msbinary module | What it implements | OO counterpart it substitutes |
|---|---|---|
| `ole.rs` (1,302 LOC) | Full MS-CFB container **read**: header, DIFAT (109 header entries + chain), FAT, directory tree, mini-FAT, mini-stream reassembly, stream-by-name read; 512/4096-byte sectors; unit-tested (`ole.rs:734`) | `Common` CFB layer used by every legacy reader |
| `detector.rs` (471 LOC) | Magic-byte + OLE class-string detection of Word/Excel/PPT; coarse version strings; **metadata struct exists but is never filled** | `Common` format detection (OO keys off CLSID + named streams) |
| `biff8.rs` (497 LOC) | Minimal BIFF8 workbook read: SST, BOUNDSHEET, LABELSST, NUMBER, RK, MULRK, MULBLANK, BOOLERR, BLANK, FORMULA (cached value only), ROW, DIMENSIONS; unknown records skipped by length | `XlsFile/Reader/*` (OO: full BIFF incl. styles, ptg formulas, charts, pivot) |
| `ppt.rs` (233 LOC) | Minimal record-tree scan of the "PowerPoint Document" stream: SlideContainer/MainMasterContainer → title + body paragraphs (TextChars/TextBytes atoms), placeholder boilerplate filtered | `PptFile/*` (OO: escher geometry, masters, notes, animation, media) |
| `xlsb.rs` (515 LOC) | `.xlsb` (OOXML binary) reader — **WO-only extension, no OO MsBinaryFile counterpart** | none (beyond parity) |
| `crypt.rs` (109 LOC) | OOXML password protection only (MS-OFFCRYPTO agile/standard via `msoffice-crypto`; wasm returns Unsupported) | `Common/OfficeCrypto` minus legacy RC4/XOR binary support |
| `model.rs` (102 LOC) | `BinaryFormat` = Word\|Excel\|PowerPoint\|Unknown; OLE header/dir-entry types | tiny slice of `Common/OfficeFileFormats.h` (117-format taxonomy) |
| `roundtrip.rs` (226 LOC) | WO-only `FormatRoundtrip` parse/serialize smoke harness | none (WO test infra) |

Consumers (the only places legacy formats actually flow):

- `wo-x2t::XlsToWoSpreadsheetConverter` — `.xls` → `wo-spreadsheet` JSON, values-only (spec **F-208**). Picks stream `Workbook` (BIFF8) with `Book` (BIFF5/7) fallback.
- `wo-x2t::PptToWoPresentationConverter` — `.ppt` → `wo-presentation` JSON, text-only, zero-size textboxes (spec **F-305**, fidelity L4).
- `wo-x2t` password-protected OOXML path — `is_encrypted_ooxml` / `decrypt_ooxml` before dispatch.
- **There is no `.doc` converter anywhere in wo-x2t.** Legacy Word binary stops at container detection.

## 2. Module map (summary — row detail lives in legacy-binary.json)

### DocFile (OO: 287 files, 330 classes — the big one)

- **partial**: `File.cpp` bootstrap (WO opens the CFB and detects Word, but never parses the FIB, so no fWhichTblStm table-stream selection, no fEncrypted check, no fComplex flag).
- **missing (18)**: FIB structures (`Structures.h`), `Document.cpp`, `PieceTable.cpp` (fcClx cp→fc mapping — the hard prerequisite for any correct `.doc` text), `StyleSheet.cpp` (STSH), `FontTable.cpp`, `ListTable/ListFormatOverride`, `Section/SectionProperties` (SEPX sprm), `Paragraph/ParagraphProperties` (PAPX sprm), `Run/RunProperty` (CHPX sprm), `HeaderFooter`, `Table/Row` (TAP/TC), `Field`, `Bookmark`, `AnnotationInfo` (comments), `ReaderNote` (footnotes), `EmbeddedObject/Esp` (escher + Data stream), `RevisionInfo` (tracked changes), `Converter/*` (doc→internal glue), and the `.doc` **writer** (`ASCOfficeDoc.cpp`).
- Verdict: **wo-msbinary covers ~1 of 330 DocFile classes' worth of behavior** (the container). There is no sprm engine at all.

### XlsFile

- **full**: CFB stream resolution (`Workbook`/`Book`) — the one place WO matches OO completely.
- **partial**: workbook globals (SST + BOUNDSHEET), sheet cell records (the 13-record set above), and the converter orchestration role (filled by `XlsToWoSpreadsheetConverter`, targeting `wo-spreadsheet` instead of an xlsx package).
- **missing (8)**: ptg formula parser (cached values only), styles/XF, shared/array formulas + names, charts, pivot tables, `Converter/oox_package.h` (xlsx package assembly), the BIFF writer, and legacy FilePass XOR/RC4 decryption.

### PptFile

- **partial**: record-tree walker, slide/master-container text path, text atoms (both encodings, no rich runs/levels).
- **missing (9)**: `CurrentUserAtom/UserEditAtom` (incremental-write offset repair), PPDrawing/escher geometry, master/layout/theme resolution (ppt.rs *filters masters* rather than resolving them), notes, animation/timing, font collection, media, the writer, and RC4-protected `.ppt`.

### Common

- **full**: CFB container + stream chain reading (this is the crate's real deliverable), WO units placement (`F-500`, lives in the shared units module — correct), WO-only roundtrip harness.
- **partial**: format detection (class-string heuristic vs OO's CLSID + stream inventory; `BinaryMetadata` never filled) and the 117-format taxonomy (WO enum has 4 members; `F-402` loud-unsupported naming not implemented for the other 113).
- **stub**: `SummaryInformation` property sets (struct exists, never decoded).
- **missing**: shared escher record layer, legacy `OfficeCrypto` (RC4/XOR binary formats).

## 3. Realistic verdict on .doc / .xls / .ppt read support

Is legacy read even on the critical path for 1:1 parity? **No — and it is important
to say so plainly.** WO's canonical document model is OOXML-shaped: the editors
consume docx/xlsx/pptx (and WO JSON), and OO itself treats legacy binary as an
*inbound conversion* into the same OOXML models before anything else happens.
Parity with OO therefore does **not** require re-implementing 2,954 files of
binary parsing in Rust; it requires that whatever subset WO claims to support is
correct, and that everything else fails **loudly** (spec `F-402`), not silently.

Where that leaves each format:

- **`.xls`** — genuinely working at value level end-to-end (OLE → BIFF8 → `wo-spreadsheet`): names, numbers, booleans, errors, cached formula results. Good enough to *see* a legacy workbook; not good enough to *round-trip* one (no formatting, no live formulas, no charts/pivots). OO converts `.xls` to xlsx and keeps everything; WO degrades deliberately. This is an acceptable L4 read, clearly documented.
- **`.ppt`** — a text-extraction skeleton (titles + body paragraphs; shapes become zero-size textboxes; masters filtered; no images/notes/animations). Useful for search/preview-grade reads only. OO-level parity (escher geometry, theme inheritance through `wo-slide`) is a large project with modest demand.
- **`.doc`** — **the real gap, and the honest headline of this map: WO cannot read legacy Word at all.** Only the OLE container opens and the file is *detected* as Word; zero text, zero styles. OO's DocFile (287 files / 330 classes, piece tables, sprm engine, escher, revisions) has no WO counterpart beyond the container. Any user story that begins "open this 2003-era .doc" fails today.

Bottom line: legacy read is an **inbound-migration convenience**, not a parity
requirement. The current scope (container + xls values + ppt text + OOXML crypto)
is coherent; everything beyond it is optional work to be pulled on demand, not
owed by the 1:1 port contract. The one carve-out worth honoring: because OO
*round-trips* legacy (opens and saves `.doc`/`.xls`/`.ppt`), WO must at least
name these formats loudly when asked for them (`F-402`) instead of appearing to
support them and failing mid-conversion.

## 4. Recommendation: keep-vs-build

**Recommendation: KEEP the current shape — CFB container plus minimal value/text
readers — and do NOT build full DocFile/XlsFile/PptFile readers.**

Rationale:

1. **Cost vs demand.** DocFile alone is 330 classes with a sprm engine, piece
   tables, and escher. There is no evidence of legacy-binary volume in WO
   conversion traffic that justifies months of Rust work; legacy files are a
   shrinking inbound tail, and the standard cure is a one-time migration to
   OOXML (which users can do in any Office release of the last 18 years).
2. **Architecture fit.** OO's readers exist to feed its OOXML-shaped internal
   model. WO already has those models (`wo-ooxml`, `wo-sheet`, `wo-slide`) and
   OOXML writers; if `.doc` read ever ships, the right shape is a **doc → docx
   in-memory package** converter reusing them — not a parallel binary renderer
   inside wo-msbinary. The same argument extends to xls→xlsx and ppt→pptx via
   `XlsFile/Converter/oox_package.h`-style assembly, on demand.
3. **What to keep is already the hard part.** The MS-CFB container (ole.rs) is
   spec-complete, tested, and is the reusable substrate for any future reader
   *and* for OOXML crypto — keeping it is non-negotiable. The biff8/ppt readers
   are cheap to maintain, scoped in writing, and satisfy F-208/F-305.
4. **Honesty rules.** Extend `BinaryFormat`/detection toward the 117-format
   taxonomy so unsupported members are named loudly (`F-402`), and fill
   `BinaryMetadata` from `SummaryInformation` (small, high-value, already stubbed)
   before ever adding another parser.

Ordered follow-ups (only if demand materializes):

1. `.doc` minimal text read: FIB + table-stream selection + `PieceTable` +
   `StyleSheet`-free plain text (the 80/20 of DocFile; unblocks "open .doc →
   plain text/docx-lite").
2. Fill `SummaryInformation`/`DocumentSummaryInformation` metadata (title/author/subject/dates).
3. BIFF8 formula ptg → A1 string reconstruction (cached ASTs already exist as values).
4. PPT geometry via escher container read (positions/sizes only), feeding real
   shape geometry into `PptToWoPresentationConverter`.
5. Legacy binary decryption (FilePass RC4/XOR) to convert "fails loudly" into
   "asks for password" — only alongside (1).

Explicit never-build list (policy): `.doc`/`.xls`/`.ppt` **writers**, chart/pivot
binary readers, animation binaries — all better served by the OOXML layer.

## 5. Method & provenance

- OO side: figures and module names taken from the ORM-08 verified facts
  (CGC-indexed Euro-Office core `MsBinaryFile`: 2,954 files; DocFile 287 files /
  330 classes; `XlsFile/Converter/oox_package.h`; PptFile; Common). The JSON's
  `oo_path` values are representative entry points of those modules, not a
  file-by-file census of all 2,954.
- WO side: all facts read directly from this worktree
  (`core/crates/wo-msbinary/src/*.rs`, `core/crates/wo-x2t/src/converters.rs`,
  `openspec/specs/core-conversion-contracts/spec.md` F-208/F-305/F-402/F-500).
- No source files were edited; deliverables are this report and
  `legacy-binary.json` under `plan/oo-port/` only.

# core-conversion-contracts

## ADDED Requirements

### Requirement: OPC content-type detection (F-400)

Container detection SHALL follow OO `OfficeFileFormatChecker2.cpp:1007-1095`:
open the package, read `[Content_Types].xml`, and distinguish
wordprocessingml vs docxf vs spreadsheetml vs presentationml `main+xml`
content-type strings before trusting the extension.

#### Scenario: mislabeled extension
- **WHEN** a pptx is renamed `.docx` and converted
- **THEN** the converter treats it as a presentation, not a document

### Requirement: Extension and legacy fallbacks (F-401)

When content-type sniffing is impossible (flat files, MHTML, 2003 XML),
detection SHALL fall back to the OO rules: extension families
(`:944-976`) and `xmlns:w`/`xmlns:ss`/`progid` sniffing (`:1673-1701`).

#### Scenario: Word 2003 XML detected
- **WHEN** a flat XML file contains `xmlns:w="…wordml"` and `progid="Word.Document"`
- **THEN** it is treated as a document, not as generic XML

### Requirement: Loud unsupported taxonomy (F-402)

The conversion surface SHALL enumerate the OO family taxonomy
(`Common/OfficeFileFormats.h`, 117 constants) and name every unsupported
member loudly on use — never silently no-op.

#### Scenario: unsupported member named
- **WHEN** conversion is requested for a taxonomy member WO does not implement
- **THEN** the error message names that member exactly (no silent no-op, no generic failure)

### Requirement: Unit matrix (F-500)

All geometry SHALL convert through one units module with the exact OO ratios
(`OOXML/Base/Unit.cpp`): Pt=72/in, Px=96/in, Twips(Dx/Multi)=1440/in,
Emu=360000/cm (914400/in), Sx=EMU, Emu_To_Pt=÷12700, Twips→Emu=×635.

#### Scenario: EMU round number
- **WHEN** converting 1 inch to EMU and back to twips
- **THEN** results are exactly 914400 and 1440

### Requirement: PDF header version (F-403)

PDF output SHALL emit `%PDF-1.7`; PDF/A output SHALL emit `%PDF-1.4`
(OO `PdfFile/SrcWriter/Document.cpp:62-63`).

#### Scenario: header bytes
- **WHEN** any document is converted to PDF
- **THEN** the output begins with the literal `%PDF-1.7` (PDF/A path: `%PDF-1.4`)

### Requirement: DOCX→PDF page command stream (F-404)

DOCX→PDF conversion SHALL go through a per-page command stream (OO
`DocxRenderer/src/logic/Page.cpp` BeginCommand/EndCommand model) so the
pagination invariants proven for `wo-docx-renderer` hold for the PDF target.

#### Scenario: page count agrees with layout engine
- **WHEN** the same DOCX is paginated by wo-docx-renderer and converted to PDF
- **THEN** both report the same page count and page-break positions

### Requirement: ECMA-376 encryption (F-501)

The system SHALL decrypt password-protected OOXML via the ECMA-376 agile and
standard mechanisms (OO `OfficeCryptReader/source/ECMACryptFile.h`
DecryptOfficeFile) and SHALL fail loudly on wrong password; encryption on
save (EncryptOfficeFile) is a stretch goal.

#### Scenario: wrong password is loud
- **WHEN** an agile-encrypted file is opened with a wrong password
- **THEN** the error states the password is wrong (never a corrupt-file generic error)

### Requirement: Doc-family readers (F-405)

RTF, TXT, HTML, FB2 and EPUB SHALL decode into the doc IR or fail loudly
(OO `core/{RtfFile,TxtFile,HtmlFile,Fb2File,EpubFile}`); DJVU/XPS/HWP/OFD are
recorded stretch readers.

#### Scenario: RTF decodes or names itself
- **WHEN** an RTF fixture is converted
- **THEN** output contains its text, or the error names RTF as unsupported — never an empty success

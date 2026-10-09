# sheet-format-contracts

## ADDED Requirements

### Requirement: XLSX part inventory round-trip (F-200)

The system SHALL preserve the OO XLSX part inventory when re-saving a
workbook: workbook.xml, worksheets, sharedStrings, styles, theme, and — when
present in the input — calcChain, drawings, charts, comments, pivot,
externalLinks, controls, richData, namedSheetViews. Parts the system cannot
edit SHALL be preserved byte-faithfully rather than dropped. Absence SHALL
round-trip as absence.

#### Scenario: re-save keeps chart parts
- **WHEN** a workbook containing `/xl/charts/chart1.xml` is loaded and saved
- **THEN** the chart part exists in the output with equal XML semantics

### Requirement: SharedStrings dedup (F-201)

String cells SHALL round-trip between `t="s"` shared indices and `t="inlineStr"`
without changing user-visible text, and the writer SHALL deduplicate repeated
strings into `xl/sharedStrings.xml` (OO `XlsxFormat/SharedStrings`).

#### Scenario: duplicate strings share one index
- **WHEN** two cells hold the same text and the file is saved
- **THEN** sharedStrings contains the text once and both cells reference it

### Requirement: Formula and cached value (F-202)

Every formula cell SHALL serialize as `<f>` plus cached `<v>`; when a formula
input changes, recalculation (wo-formula) SHALL refresh the cached `<v>`
before save.

#### Scenario: edit recalculates dependents
- **WHEN** A1 changes and B1 contains `=A1*2`
- **THEN** B1's cached `<v>` equals the new product after save

### Requirement: Cell address and type model (F-204)

Cells SHALL use `r="A1"` addressing and the `n/s/b/str/e` type set; empty
cells SHALL be elided exactly as OO does (no `<c>` emitted for never-set
cells).

#### Scenario: never-set cells stay absent
- **WHEN** a worksheet where D7 was never touched is re-saved
- **THEN** no `<c r="D7">` element exists in the output sheet XML

### Requirement: CalcChain policy (F-203)

The system SHALL document and implement ONE policy — preserve the input
calcChain or omit it on rewrite (OO rebuilds lazily) — and never write a
calcChain inconsistent with the formulas present.

#### Scenario: policy is visible and consistent
- **WHEN** a workbook with formulas is saved twice by the same build
- **THEN** the calcChain (or its documented omission) is identical both times and lists only formulas that exist

### Requirement: Legacy XLS and XLSB read (F-208/F-209)

The system SHALL read binary `.xls` (OO `MsBinaryFile/XlsFile`) and `.xlsb`
(`OOXML/XlsbFormat`) workbooks into the shared sheet IR, or fail loudly
naming the unsupported member (gate-tells-the-truth).

#### Scenario: binary XLS loads
- **WHEN** a `.xls` fixture with two sheets and a SUM formula is opened
- **THEN** the sheet IR contains both sheets and the computed value

# doc-mutation-api

## ADDED Requirements

### Requirement: Path-addressed mutation operations

The system SHALL provide a `DocOp` enum of invertible mutation operations over a
DOCX body, each addressed by `Path` (paragraph index, run index, char offset, or
table/row/cell coordinates). Every operation SHALL have a well-defined inverse
so that `apply(inverse(apply(op)))` yields the original body.

The following operations SHALL be supported:

| Op | Inputs | Inverse |
|----|--------|---------|
| InsertText | para, char, text | DeleteText same range |
| DeleteText | para, start, end | InsertText |
| SplitParagraph | para, char | MergeWithPrevious(para+1) |
| MergeWithPrevious | para | SplitParagraph |
| InsertParagraph | after, para | DeleteParagraph(after+1) |
| DeleteParagraph | para | InsertParagraph(para-1, deleted) |
| SetParagraphProps | para, props | prior props |
| FormatRun | para, start, end, attrs | prev attrs |
| InsertTableRow | table, after_row | DeleteTableRow |
| DeleteTableRow | table, row | InsertTableRow |
| InsertTableColumn | table, after_col | DeleteTableColumn |
| MergeCells | table, r1,c1,r2,c2 | SplitCell |
| InsertImage | after_para, bytes, w, h, wrap | DeleteParagraph(after+1) |

#### Scenario: Insert then delete text returns to identity

- **GIVEN** a body containing a single paragraph "Hello"
- **WHEN** InsertText(para=0, char=5, text=" world") is applied, then its inverse (DeleteText para=0 start=5 end=11) is applied
- **THEN** the body paragraph text equals "Hello"

#### Scenario: SplitParagraph then MergeWithPrevious round-trips

- **GIVEN** a body containing paragraph "ABCD" at index 0
- **WHEN** SplitParagraph(para=0, char=2) is applied, yielding "AB" / "CD", then MergeWithPrevious(para=1) is applied
- **THEN** the body contains a single paragraph "ABCD"

#### Scenario: DeleteParagraph guards against empty body

- **GIVEN** a body containing exactly one paragraph
- **WHEN** DeleteParagraph(para=0) is applied
- **THEN** the operation returns EmptyBody error and the body is unchanged

### Requirement: Unicode-safe character addressing

All character offsets in `DocOp` paths SHALL count Unicode scalar values (via
`.chars().count()`), never byte offsets. This ensures correct text editing for
multi-byte content (CJK, emoji, combining marks).

#### Scenario: Emoji counted as one character

- **GIVEN** a paragraph containing "A😀B" (3 Unicode scalar values, 5 UTF-8 bytes)
- **WHEN** DeleteText(para=0, start=1, end=2) is applied
- **THEN** the paragraph text equals "AB" and the emoji is removed

### Requirement: FormatRun splits runs at boundaries

`FormatRun(para, start, end, attrs)` SHALL split existing runs at `[start, end)`
so that only the targeted range receives the formatting attributes, leaving
text before `start` and after `end` untouched.

#### Scenario: Bold the middle of a run

- **GIVEN** a paragraph with a single run "abcdef" (no formatting)
- **WHEN** FormatRun(para=0, start=2, end=5, attrs={bold:true}) is applied
- **THEN** the paragraph has three runs: "ab" (plain), "cde" (bold), "f" (plain)

### Requirement: Structured error model

The system SHALL return `DocOpError` for invalid operations, including:
`OutOfRange(path)` when the path does not exist in the current state;
`Invalid(reason)` for semantically invalid ops; `EmptyMerge` when
`MergeWithPrevious` targets paragraph 0; `EmptyBody` when `DeleteParagraph`
would leave the body empty.

#### Scenario: OutOfRange on nonexistent paragraph

- **GIVEN** a body with 2 paragraphs (indices 0, 1)
- **WHEN** InsertText(para=5, char=0, text="x") is applied
- **THEN** the operation returns OutOfRange(path=para:5) and the body is unchanged

### Requirement: ModelOp wire format for WASM and collaboration

Every `DocOp` SHALL be serializable to a `ModelOp` JSON object for transport
over the WASM `apply_op` boundary and WebSocket collaboration channels. The
wire format SHALL include the target `Path` (kind + coordinates) and the op
payload.

```json
{ "op": "insert", "at": { "kind": "text", "para": 3, "run": 1, "char": 14 }, "content": "Hello" }
```

#### Scenario: Round-trip serialization

- **GIVEN** an InsertText DocOp targeting paragraph 0, char 0, text "Hi"
- **WHEN** it is serialized to ModelOp JSON and deserialized back
- **THEN** the resulting DocOp is equal to the original

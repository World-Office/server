# editable-model-trait

## ADDED Requirements

### Requirement: Uniform EditableModel trait

The system SHALL define a trait `EditableModel` that every editable Rust model
implements, providing uniform mutation (`apply`), inversion (`invert`), and
operation history (`to_ops_since`) for undo, WASM export, and collaboration.

```rust
pub trait EditableModel {
    type Err: std::error::Error;
    fn apply(&mut self, op: &ModelOp) -> Result<(), Self::Err>;
    fn invert(&self, op: &ModelOp) -> ModelOp;
    fn to_ops_since(&self, rev: u64) -> Vec<ModelOp>;
}
```

#### Scenario: Apply then invert yields identity

- **GIVEN** a model `M` implementing `EditableModel` and an op `O`
- **WHEN** `M.apply(O)` succeeds, then `M.apply(M.invert(O))` is applied
- **THEN** `M` is structurally equal to its state before `O` was applied

#### Scenario: to_ops_since returns ops after a revision

- **GIVEN** a model at revision 10 that has received ops advancing it to revision 15
- **WHEN** `to_ops_since(10)` is called
- **THEN** it returns the 5 ops applied after revision 10, in order

### Requirement: Pluggable model implementors

The `EditableModel` trait SHALL be implemented by every editable engine model
so that undo, WASM serialization, and collaboration work uniformly across
document types.

Planned implementors:

- `wo-ooxml-ops`: `DocxBody` (document)
- `wo-sheet`: `Workbook` (spreadsheet)
- `wo-slide`: `Presentation` (presentation)
- `wo-chart`: `Chart`
- `wo-pdf-render`: `PdfDoc`

#### Scenario: Document model implements the trait

- **GIVEN** the `DocxBody` struct in `wo-ooxml-ops`
- **WHEN** it is checked against `EditableModel`
- **THEN** it compiles with `apply`, `invert`, and `to_ops_since` methods

### Requirement: Performance invariants

`apply` SHALL be O(n) worst-case and O(1) amortized for append operations.
`invert` SHALL be O(1). All operations SHALL be deterministic and
serde-serializable (required for CRDT merge in the collaboration engine).

#### Scenario: Append is amortized O(1)

- **GIVEN** a model with an existing body
- **WHEN** N InsertText ops are applied at the end of the last paragraph
- **THEN** total time is O(N), i.e. amortized O(1) per op

#### Scenario: Ops are serde-serializable

- **GIVEN** any `ModelOp` produced by the model
- **WHEN** it is serialized to JSON via serde and deserialized back
- **THEN** the result equals the original op (deterministic round-trip)

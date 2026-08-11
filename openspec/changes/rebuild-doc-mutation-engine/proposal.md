## Why
The document editor is ~12% of ONLYOFFICE because it edits two disconnected models
(TipTap HTML + WASM OOXML canvas) that never reconcile. `wo-ooxml`'s `DocxBody` is read-only —
zero mutation methods. Every "formatting doesn't work" / "font change fails" report traces here.
This change creates `wo-ooxml-ops`, a path-addressed mutation API, and wires it through WASM and
the frontend so the document editor has ONE editable document.

## What Changes
- New crate `core/crates/wo-ooxml-ops` implementing `DocOp` + `DocModel::apply` + `DocOpError`.
- Refactor `DocxBody { paragraphs, tables }` → `DocxBody { blocks: Vec<DocxBlock> }` (ordered).
- Add `wo-common::path::{Path, Range}` + `op::{ModelOp, EditableModel}` foundational contracts.
- Extend `wo-renderer-wasm` with `apply_op(handle, op_json)` + `model_to_bytes(handle)`.
- New `packages/editor-common/src/core/command-router.ts` (one router per editor).
- Rewire `documenteditor-react/src/lib/rte-command.ts` to emit `ModelOp` via the router; remove
  TipTap from default path (feature-flag `WO_TIPTAP=1`).

## Capabilities
### New
- `doc-mutation-api`: Path-addressed DocOp set (text, paragraph, table, image, list, section).
- `editable-model-trait`: wo-common `EditableModel` + `ModelOp` shared contract.
### Modified
- `docx-body-model`: flattened to ordered blocks.

## Impact
**Rust:** new crate `wo-ooxml-ops`; modify `wo-ooxml` (body refactor), `wo-common` (path/op),
`wo-renderer-wasm` (exports), `wo-docx-renderer` (layout adapts to blocks).
**TS:** new `command-router.ts`; rewrite `rte-command.ts`; remove TipTap from `main.tsx`.
**Tests:** ~60 new Rust unit tests; 1 conformance DOCX round-trip; JS smoke test.

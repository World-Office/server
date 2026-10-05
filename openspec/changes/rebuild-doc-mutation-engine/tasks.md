## 1. Foundation contracts (wo-common)
- [x] 1.1 Create `core/crates/wo-common/src/path.rs` with `Path`+`Range` (§2.1) — Acceptance: FC-1
- [x] 1.2 Create `core/crates/wo-common/src/op.rs` with `ModelOp`+`EditableModel` (§2.2) — Acceptance: FC-2
- [x] 1.3 Re-export from `wo-common/src/lib.rs`; run `cargo test -p wo-common`

## 2. Body refactor (breaking)
- [x] 2.1 Change `DocxBody` to `blocks: Vec<DocxBlock>` + migration in parser.rs (§3.4)
- [x] 2.2 Update `wo-ooxml/serializer.rs` to emit blocks in order
- [x] 2.3 Update `wo-docx-renderer/layout.rs` + `wo-renderer-wasm/lib.rs` + `layout.rs` handle-sites
- [ ] 2.4 Acceptance DM-1: workspace `--lib` green; conformance `06-font-times` round-trips byte-identical

## 3. New crate wo-ooxml-ops
- [x] 3.1 `cargo new --lib core/crates/wo-ooxml-ops`; add to workspace; deps per §3.1
- [x] 3.2 Create `src/ops.rs` with `DocOp`/`RunAttrs`/`WrapMode`/`DocOpError` (§3.2)
- [x] 3.3 Create `src/text.rs`: InsertText/DeleteText/SplitParagraph/MergeWithPrevious — 12 tests incl Unicode
- [x] 3.4 Create `src/paragraph.rs`: Insert/Delete/SetParagraphProps — 8 tests
- [x] 3.5 Create `src/table.rs`: 6 table ops — 14 tests incl merge→split round-trip
- [x] 3.6 Create `src/image.rs`: InsertImage + `DocxImage` on body — 3 tests
- [x] 3.7 Create `src/list.rs`+`src/section.rs`: SetListLevel, InsertSectionBreak — 5 tests
- [x] 3.8 Impl `DocModel::apply` returning inverse; impl `EditableModel for DocxBody` — 4 round-trip tests

## 4. WASM exports
- [x] 4.1 Add `apply_op(doc_handle, op_json)` to `wo-renderer-wasm/src/lib.rs` using extract_body/store_body
- [x] 4.2 Add `model_to_bytes(doc_handle)` calling wo-ooxml serializer
- [x] 4.3 `wasm-pack build --target web`; JS smoke in `__tests__/apply-op.test.ts`
- [x] 4.4 Acceptance DM-10: insert→serialize→re-parse→assert text present

## 5. Frontend router + rewire
- [x] 5.1 Create `packages/editor-common/src/core/command-router.ts` (§2.4) — Acceptance FC-4
- [ ] 5.2 Register doc-router in `DocumentHolder.tsx` mapping WoCommand → ModelOp JSON → apply_op
- [ ] 5.3 Rewrite `rte-command.ts` cases to dispatch via router (keep type names; drop TipTap chain calls)
- [ ] 5.4 **Fix `SelectControl` bug** in `ControlRenderer.tsx:133` → `dispatch.onCommand(spec.id, value)`
- [x] 5.5 Feature-flag TipTap behind `WO_TIPTAP=1`; remove from `main.tsx` default
- [ ] 5.6 Acceptance DM-11/12: `pnpm lint && typecheck && build && test` green; font dropdown works; bold/italic still work

## 6. Validation
- [x] 6.1 `openspec validate rebuild-doc-mutation-engine` → OK
- [ ] 6.2 `cargo clippy --workspace --lib -- -D warnings` → 0 warnings
- [ ] 6.3 Manual smoke: open DOCX, type, bold, insert table row — all reflect on canvas

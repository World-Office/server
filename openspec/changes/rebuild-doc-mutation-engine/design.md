# Design — Document Mutation Engine

## Core insight
All edits reduce to 5 universal ops (Insert/Delete/Replace/Format/Move) over a Path-addressed
tree. Engine-specific ops (DocOp) map onto these so collaboration, undo, and the command router
stay uniform.

## Path addressing
`Path::Text{para,run,char}` and `Path::Table{table,row,cell,para,run,char}` cover 100% of DOCX body
content. The Path is JSON over the wire, so WASM and collab layers never need engine-specific enums.

## Body refactor (DM-1) — breaking but required
Current `DocxBody.paragraphs` + `.tables` as two Vecs loses document order. Flatten to
`blocks: Vec<DocxBlock>` where `DocxBlock = Paragraph | Table`. This is a prerequisite for any
table op and for correct cursor motion. All of parser.rs, serializer.rs, layout.rs, lib.rs
handle-sites update in ONE commit to keep the workspace compiling.

## Undo
Every `DocModel::apply` returns the inverse `DocOp`. The frontend keeps undo/redo `Vec<DocOp>`
stacks. No server state required.

## Collaboration hook
`DocxBody: EditableModel` maps each `ModelOp` to a `DocOp`, applies it, appends the op to the
automerge op-log (CO-2). Conflicting inserts resolve by Path-prefix ordering.

## Borrow-checker pattern
Use the existing `extract_body`/`store_body` clone-mutate-store idiom (`lib.rs:635`). No new globals.

## Non-goals
- Rendering of new structures (tables/images) is TL-* and CH-* / DM-7 model-only here.
- Real-time collab wiring is CO-*.

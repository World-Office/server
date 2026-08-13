//! CO-6 — Per-engine integration tests.
//!
//! Verifies that the coauthoring service (op-log `Document` + `ModelOpEnvelope`
//! wire schema) works end-to-end for all three document engines:
//!   - **doc**  (DM): `Path::Text` ops in the main body
//!   - **sheet** (SS): `Path::Sheet` cell ops
//!   - **slide** (SL): `Path::Slide` shape-text ops
//!
//! Each scenario exercises: create session → two agents co-edit → op-log
//! accumulates → late joiner replays → op-log serializes/loads → merge.

use std::collections::BTreeMap;

use crate::document::Document;
use crate::model_op::ModelOpEnvelope;
use crate::replay::{ReplayManager, ReplayRequest, ReplayResponse};
use wo_common::op::ModelOp;
use wo_common::path::{Path, Range};

// ── Helpers ────────────────────────────────────────────────────────────────

fn text_path(para: usize, run: usize, char: usize) -> Path {
    Path::Text { para, run, char }
}

fn sheet_path(name: &str, row: u32, col: u32) -> Path {
    Path::Sheet {
        sheet: name.to_string(),
        row,
        col,
    }
}

fn slide_path(slide: usize, shape: usize, run: usize, char: usize) -> Path {
    Path::Slide {
        slide,
        shape,
        run,
        char,
    }
}

fn insert_op(at: Path, content: &str) -> ModelOp {
    ModelOp::Insert {
        at,
        content: content.to_string(),
    }
}

fn delete_op(start: Path, end: Path) -> ModelOp {
    ModelOp::Delete {
        range: Range::new(start, end),
    }
}

/// Push an op into the document log under a given agent + session.
fn coedit(doc: &mut Document, user: &str, session: &str, op: ModelOp) -> u64 {
    doc.apply_model_op(op, user, session)
}

// ── Integration scenarios ──────────────────────────────────────────────────

#[test]
fn integration_doc_two_agents_coedit_text() {
    let mut doc = Document::new();
    doc.register_agent("alice");
    doc.register_agent("bob");

    // Alice types paragraph 0.
    let r1 = coedit(&mut doc, "alice", "s-doc", insert_op(text_path(0, 0, 0), "Hello"));
    // Bob appends to the same paragraph.
    let r2 = coedit(&mut doc, "bob", "s-doc", insert_op(text_path(0, 0, 5), " World"));
    // Alice deletes " World" (chars 5..11).
    let r3 = coedit(
        &mut doc,
        "alice",
        "s-doc",
        delete_op(text_path(0, 0, 5), text_path(0, 0, 11)),
    );

    // Revisions are per-user: alice 0,1… and bob 0,1… independently.
    assert_eq!(r1, 0, "alice first op rev 0");
    assert_eq!(r2, 0, "bob first op rev 0");
    assert_eq!(r3, 1, "alice second op rev 1");
    assert_eq!(doc.op_count(), 3);
    // Every agent can read back its own ops.
    assert!(doc.has_op("alice", r1));
    assert!(doc.has_op("bob", r2));

    // Ops since 0 = everything; since r2 = just the delete.
    let since_r2 = doc.ops_since(r2);
    assert_eq!(since_r2.len(), 1);
    assert!(matches!(since_r2[0].op, ModelOp::Delete { .. }));
}

#[test]
fn integration_sheet_cells_coedit_and_merge() {
    let mut doc = Document::new();
    doc.register_agent("carol");
    doc.register_agent("dave");

    // Carol writes A1, Dave writes B2 — different cells, same sheet.
    coedit(
        &mut doc,
        "carol",
        "s-sheet",
        insert_op(sheet_path("Sheet1", 0, 0), "42"),
    );
    coedit(
        &mut doc,
        "dave",
        "s-sheet",
        insert_op(sheet_path("Sheet1", 1, 1), "=SUM(A1)"),
    );

    assert_eq!(doc.op_count(), 2);
    // Late joiner replays the full history.
    let ops: Vec<_> = doc.ops().iter().map(|e| e.op.clone()).collect();
    assert!(ops.iter().any(|op| matches!(op, ModelOp::Insert { at: Path::Sheet { row: 0, col: 0, .. }, .. })));
    assert!(ops.iter().any(|op| matches!(op, ModelOp::Insert { at: Path::Sheet { row: 1, col: 1, .. }, .. })));
}

#[test]
fn integration_slide_shapes_coedit() {
    let mut doc = Document::new();
    doc.register_agent("eve");

    // Eve edits slide 0, shape 0, run 0.
    coedit(
        &mut doc,
        "eve",
        "s-slide",
        insert_op(slide_path(0, 0, 0, 0), "Title"),
    );
    coedit(
        &mut doc,
        "eve",
        "s-slide",
        insert_op(slide_path(0, 1, 0, 0), "Body text"),
    );

    assert_eq!(doc.op_count(), 2);
    let ops: Vec<_> = doc.ops().iter().map(|e| e.op.clone()).collect();
    assert!(ops
        .iter()
        .any(|op| matches!(op, ModelOp::Insert { at: Path::Slide { slide: 0, shape: 1, .. }, .. })));
}

#[test]
fn integration_roundtrip_serialize_load() {
    let mut doc = Document::new();
    doc.register_agent("alice");
    doc.register_agent("bob");

    coedit(&mut doc, "alice", "s1", insert_op(text_path(0, 0, 0), "Round"));
    coedit(&mut doc, "bob", "s1", insert_op(sheet_path("S", 0, 0), "trip"));

    let json = doc.serialize_ops().expect("serialize op-log");
    let mut restored = Document::new();
    restored.load_ops(&json).expect("load op-log");

    assert_eq!(restored.op_count(), doc.op_count());
    // Both agents remain registered after round-trip.
    assert!(restored.agent_index("alice").is_some());
    assert!(restored.agent_index("bob").is_some());
}

#[test]
fn integration_merge_from_other_session() {
    let mut main = Document::new();
    main.register_agent("alice");
    let mut branch = Document::new();
    branch.register_agent("bob");

    coedit(&mut main, "alice", "s-main", insert_op(text_path(0, 0, 0), "A"));
    coedit(&mut branch, "bob", "s-branch", insert_op(text_path(0, 0, 1), "B"));

    main.merge_from(&branch);
    assert_eq!(main.op_count(), 2);
    let texts: Vec<String> = main
        .ops()
        .iter()
        .filter_map(|e| match &e.op {
            ModelOp::Insert { content, .. } => Some(content.clone()),
            _ => None,
        })
        .collect();
    assert!(texts.contains(&"A".to_string()));
    assert!(texts.contains(&"B".to_string()));
}

#[test]
fn integration_envelope_wire_roundtrip() {
    let op = insert_op(text_path(0, 0, 0), "wire");
    let env = ModelOpEnvelope::new("sess".into(), "user".into(), 7, op);
    let json = env.to_json().expect("to_json");
    let back = ModelOpEnvelope::from_json(&json).expect("from_json");

    assert_eq!(back.session_id, "sess");
    assert_eq!(back.user_id, "user");
    assert_eq!(back.revision, 7);
    assert!(matches!(back.op, ModelOp::Insert { ref content, .. } if content == "wire"));
}

#[test]
fn integration_replay_manager_for_engine_ops() {
    let mut doc = Document::new();
    doc.register_agent("alice");
    coedit(&mut doc, "alice", "s-replay", insert_op(text_path(0, 0, 0), "one"));
    coedit(&mut doc, "alice", "s-replay", insert_op(sheet_path("S", 0, 0), "two"));
    coedit(&mut doc, "alice", "s-replay", insert_op(slide_path(0, 0, 0, 0), "three"));

    // A late joiner replays everything since revision 0.
    let mut rm = ReplayManager::new("s-replay".to_string());
    let resp = rm
        .replay(&ReplayRequest::from_revision(0), &doc, "late-joiner")
        .expect("replay");

    // Replay should carry all three engine ops.
    assert_eq!(resp.ops.len(), 3);
    let kinds: BTreeMap<&str, usize> = resp
        .ops
        .iter()
        .map(|e| match &e.op {
            ModelOp::Insert { at, .. } => match at {
                Path::Text { .. } => "doc",
                Path::Sheet { .. } => "sheet",
                Path::Slide { .. } => "slide",
                _ => "other",
            },
            _ => "other",
        })
        .fold(BTreeMap::new(), |mut m, k| {
            *m.entry(k).or_insert(0) += 1;
            m
        });
    assert_eq!(kinds.get("doc"), Some(&1));
    assert_eq!(kinds.get("sheet"), Some(&1));
    assert_eq!(kinds.get("slide"), Some(&1));
}

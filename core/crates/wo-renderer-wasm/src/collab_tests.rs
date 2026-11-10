//! Tests for the collaboration boundary (P4-C01, PORT-PLAN Phase 4 item 4):
//! the camelCase serde wire contract of the `AscCUserInfo` /
//! `AscCVersionHistoryEntry` payload classes and the `WasmVersionHistory`
//! blob, the per-document `set_document_restriction`/`get_document_restriction`
//! round trip with the pushed `WsEvent::RestrictionChange` frame (native
//! test sink), and the `cc-role` set/get store.
//! Registered via `#[cfg(test)] mod collab_tests;`.

#[cfg(test)]
use super::events::{clear_event_sink_for_test, lock_test_sink, set_event_sink_for_test};
#[cfg(test)]
use super::*;
#[cfg(test)]
use std::sync::{Arc, Mutex};

/// Unique-ish doc handles so the parallel tests never share store keys.
const H1: u32 = 410_001;
const H2: u32 = 410_002;
const H3: u32 = 410_003;
const H4: u32 = 410_004;
const H5: u32 = 410_005;
const H6: u32 = 410_006;

// ── serde wire contract (camelCase = OO asc_C* schema) ───────────────

#[test]
fn asc_c_user_info_serde_round_trips_camel_case() {
    let user = AscCUserInfo {
        id: "uid-42".to_string(),
        name: "Ada Lovelace".to_string(),
        initials: "AL".to_string(),
        color: "#7F00FF".to_string(),
    };
    let s = serde_json::to_string(&user).expect("serialize");
    // The OO wire schema is camelCase (asc_getX/asc_putX surface).
    assert!(s.contains("\"id\":\"uid-42\""), "wire: {s}");
    assert!(s.contains("\"name\":\"Ada Lovelace\""), "wire: {s}");
    assert!(s.contains("\"initials\":\"AL\""), "wire: {s}");
    assert!(s.contains("\"color\":\"#7F00FF\""), "wire: {s}");
    // No snake_case leakage across the boundary.
    assert!(!s.contains("initials_"), "wire: {s}");

    let back: AscCUserInfo = serde_json::from_str(&s).expect("deserialize");
    assert_eq!(back, user);

    // An OO-shaped payload (exactly what Main.js builds) deserializes 1:1.
    let from_ui: AscCUserInfo = serde_json::from_str(
        r#"{"id":"uid-7","name":"Grace","initials":"GH","color":"FF7F00"}"#,
    )
    .expect("OO payload parses");
    assert_eq!(from_ui.id, "uid-7");
    assert_eq!(from_ui.initials, "GH");
}

#[test]
fn asc_c_version_history_entry_serde_round_trips_camel_case() {
    let entry = AscCVersionHistoryEntry {
        version: "3".to_string(),
        author: "ada".to_string(),
        date: "2026-11-10T12:00:00Z".to_string(),
        label: "before sign-off".to_string(),
    };
    let s = serde_json::to_string(&entry).expect("serialize");
    assert!(s.contains("\"version\":\"3\""), "wire: {s}");
    assert!(s.contains("\"author\":\"ada\""), "wire: {s}");
    assert!(s.contains("\"date\":\"2026-11-10T12:00:00Z\""), "wire: {s}");
    assert!(s.contains("\"label\":\"before sign-off\""), "wire: {s}");

    let back: AscCVersionHistoryEntry = serde_json::from_str(&s).expect("deserialize");
    assert_eq!(back, entry);
}

#[test]
fn version_history_blob_set_get_round_trip() {
    let history = WasmVersionHistory {
        entries: vec![
            AscCVersionHistoryEntry {
                version: "1".to_string(),
                author: "ada".to_string(),
                date: "2026-11-09T09:00:00Z".to_string(),
                label: "first save".to_string(),
            },
            AscCVersionHistoryEntry {
                version: "2".to_string(),
                author: "grace".to_string(),
                date: "2026-11-10T10:30:00Z".to_string(),
                label: String::new(),
            },
        ],
    };
    let json = serde_json::to_string(&history).expect("serialize");
    let stored = set_version_history(H1, &json).expect("set_version_history");
    let read = get_version_history(H1).expect("get_version_history");
    assert_eq!(stored, read);
    let back: WasmVersionHistory = serde_json::from_str(&read).expect("canonical JSON");
    assert_eq!(back.entries.len(), 2);
    assert_eq!(back.entries[0].author, "ada");
    assert_eq!(back.entries[1].version, "2");

    // Unset handles read the empty blob (not an error).
    let empty = get_version_history(H2).expect("unset read");
    assert_eq!(empty, r#"{"entries":[]}"#);
}

// ── restriction set/get + pushed event ───────────────────────────────

#[test]
fn restriction_set_get_round_trips_and_emits_event() {
    let _lock = lock_test_sink();
    clear_event_sink_for_test();
    let seen: Arc<Mutex<Vec<WsEvent>>> = Arc::new(Mutex::new(Vec::new()));
    let cap = Arc::clone(&seen);
    set_event_sink_for_test(move |ev| cap.lock().unwrap().push(ev.clone()));

    let stored = set_document_restriction(
        H3,
        r#"{"mode":"comment-only","allowPrint":false,"allowCopy":true}"#,
    )
    .expect("set_document_restriction");
    // Canonical blob: typed mode, camelCase flags.
    assert_eq!(
        stored,
        r#"{"mode":"comment-only","allowPrint":false,"allowCopy":true}"#
    );
    let read = get_document_restriction(H3).expect("get_document_restriction");
    assert_eq!(read, stored);

    // The frame crossed the sink exactly once with the wire strings.
    let got = seen.lock().unwrap();
    assert_eq!(got.len(), 1, "one RestrictionChange frame expected");
    match &got[0] {
        WsEvent::RestrictionChange {
            mode,
            allow_print,
            allow_copy,
        } => {
            assert_eq!(mode, "comment-only");
            assert!(!allow_print);
            assert!(allow_copy);
        }
        other => panic!("expected RestrictionChange, got {other:?}"),
    }

    // The frame serializes to the snake_case wire shape the dispatcher
    // fans out as `wo-event:restriction_change`.
    let frame = serde_json::to_value(&got[0]).expect("frame JSON");
    assert_eq!(frame["event"], "restriction_change");
    assert_eq!(frame["payload"]["mode"], "comment-only");
    assert_eq!(frame["payload"]["allow_print"], false);
    assert_eq!(frame["payload"]["allow_copy"], true);
}

#[test]
fn restriction_every_mode_round_trips_and_normalizes_spellings() {
    // set_document_restriction pushes RestrictionChange frames: hold the
    // sink lock so parallel pushes never interleave (events.rs contract).
    let _lock = lock_test_sink();
    clear_event_sink_for_test();
    for (wire, mode) in [
        ("none", "none"),
        ("readOnly", "readOnly"),
        ("comment-only", "comment-only"),
        ("fill-forms", "fill-forms"),
        ("track-changes", "track-changes"),
    ] {
        let json = format!(r#"{{"mode":"{wire}","allowPrint":true,"allowCopy":false}}"#);
        let stored = set_document_restriction(H4, &json).expect("set");
        assert_eq!(
            stored,
            format!(r#"{{"mode":"{mode}","allowPrint":true,"allowCopy":false}}"#)
        );
        assert_eq!(
            get_document_restriction(H4).expect("get"),
            stored,
            "mode {wire} round trip"
        );
    }
    // OO controller spellings normalize to the canonical wire strings.
    for (spelling, canonical) in [
        ("ReadOnly", "readOnly"),
        ("comments", "comment-only"),
        ("forms", "fill-forms"),
        ("review", "track-changes"),
    ] {
        let json = format!(r#"{{"mode":"{spelling}"}}"#);
        let stored = set_document_restriction(H5, &json).expect("set");
        assert!(
            stored.contains(&format!(r#""mode":"{canonical}""#)),
            "{spelling} → {canonical}, got {stored}"
        );
    }
}

#[test]
fn restriction_rejects_unknown_mode_and_bad_json() {
    let _lock = lock_test_sink();
    let err = set_document_restriction(H6, r#"{"mode":"total-lockdown"}"#)
        .expect_err("unknown mode must be rejected");
    assert!(err.contains("Unknown restriction mode"), "err: {err}");
    // The rejected set must not have stored anything.
    assert_eq!(
        get_document_restriction(H6).expect("get"),
        r#"{"mode":"none","allowPrint":true,"allowCopy":true}"#
    );

    let err = set_document_restriction(H6, "not json")
        .expect_err("non-JSON input must be rejected");
    assert!(err.contains("Invalid restriction JSON"), "err: {err}");

    let err = set_document_restriction(H6, r#"{"allowPrint":true}"#)
        .expect_err("missing mode must be rejected");
    assert!(err.contains("`mode`"), "err: {err}");
}

#[test]
fn restriction_defaults_and_per_document_isolation() {
    let _lock = lock_test_sink();
    clear_event_sink_for_test();
    // Unset handle → the unprotected default.
    assert_eq!(
        get_document_restriction(H4 + 900).expect("default"),
        r#"{"mode":"none","allowPrint":true,"allowCopy":true}"#
    );

    // Two documents hold independent blobs.
    let _ = set_document_restriction(H4 + 901, r#"{"mode":"readOnly"}"#).expect("doc A");
    let _ = set_document_restriction(H4 + 902, r#"{"mode":"fill-forms","allowCopy":false}"#)
        .expect("doc B");
    assert!(get_document_restriction(H4 + 901)
        .expect("A")
        .contains(r#""mode":"readOnly""#));
    assert!(get_document_restriction(H4 + 902)
        .expect("B")
        .contains(r#""mode":"fill-forms""#));
    assert!(get_document_restriction(H4 + 902)
        .expect("B")
        .contains(r#""allowCopy":false"#));
}

// ── cc-role kind ─────────────────────────────────────────────────────

#[test]
fn cc_role_set_get_round_trip() {
    let stored =
        set_cc_role(H3, r#"{"id":"cc-1","role":"plain-text"}"#).expect("set_cc_role");
    assert_eq!(stored, r#"{"id":"cc-1","role":"plain-text"}"#);
    assert_eq!(
        get_cc_role(H3, "cc-1").expect("get_cc_role"),
        r#"{"id":"cc-1","role":"plain-text"}"#
    );

    // Every allowed role value is accepted.
    for role in ["none", "rich-text", "picture", "date"] {
        let json = format!(r#"{{"id":"cc-2","role":"{role}"}}"#);
        let stored = set_cc_role(H3, &json).expect("set_cc_role");
        assert!(stored.contains(&format!(r#""role":"{role}""#)), "role {role}");
    }

    // Unset control → "null" (props store-backed convention).
    assert_eq!(get_cc_role(H3, "cc-unknown").expect("unset"), "null");
}

#[test]
fn cc_role_rejects_unknown_role_and_bad_json() {
    let err = set_cc_role(H3, r#"{"id":"cc-3","role":"barcode"}"#)
        .expect_err("unknown role must be rejected");
    assert!(err.contains("Unknown cc-role role"), "err: {err}");

    let err = set_cc_role(H3, r#"{"role":"date"}"#).expect_err("missing id");
    assert!(err.contains("`id`"), "err: {err}");

    let err = set_cc_role(H3, "{{{").expect_err("bad JSON");
    assert!(err.contains("Invalid cc-role JSON"), "err: {err}");
}

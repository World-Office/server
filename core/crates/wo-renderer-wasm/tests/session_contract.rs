//! Integration contract tests for the `wo_renderer_wasm::session` module
//! (PORT-PLAN R2 / ORM-01 `collab` + `document` core rows): the camelCase
//! serde wire schema of the `WasmUserInfo` (OO `asc_CUserInfo`) and
//! `WasmDocInfo` (core.xml properties) blobs, plus the
//! `asc_isSupportFeature` capability table. Pure serde — no session store,
//! no document handles, no sinks — so it can run anywhere the rlib links.

use wo_renderer_wasm::events::WsEvent;
use wo_renderer_wasm::session::{is_support_feature, WasmDocInfo, WasmUserInfo};

fn v(s: &str) -> serde_json::Value {
    serde_json::from_str(s).expect("valid JSON in test")
}

#[test]
fn user_info_wire_is_the_camel_case_asc_cuserinfo_schema() {
    let user = WasmUserInfo {
        id: "uid-42".into(),
        username: "ada".into(),
        firstname: Some("Ada".into()),
        lastname: Some("Lovelace".into()),
        color: Some("#7F00FF".into()),
    };
    let j = v(&serde_json::to_string(&user).unwrap());
    for key in ["id", "username", "firstname", "lastname", "color"] {
        assert!(j.get(key).is_some(), "missing wire key `{key}`");
    }
    assert_eq!(j["id"], "uid-42");
    assert_eq!(j["username"], "ada");
    // Round trip through the same schema.
    let back: WasmUserInfo = serde_json::from_value(j).unwrap();
    assert_eq!(back, user);
}

#[test]
fn doc_info_wire_is_the_camel_case_core_props_schema() {
    let info = WasmDocInfo {
        title: Some("Quarterly".into()),
        subject: Some("Wasm".into()),
        creator: Some("Ada".into()),
        keywords: Some("q3, numbers".into()),
        description: Some("d".into()),
        language: Some("en-US".into()),
        last_modified_by: Some("Grace".into()),
        created: Some("2024-01-01T00:00:00Z".into()),
        modified: Some("2024-06-01T00:00:00Z".into()),
        category: Some("cat".into()),
        revision: Some("3".into()),
    };
    let j = v(&serde_json::to_string(&info).unwrap());
    for key in [
        "title",
        "subject",
        "creator",
        "keywords",
        "description",
        "language",
        "lastModifiedBy",
        "created",
        "modified",
        "category",
        "revision",
    ] {
        assert!(j.get(key).is_some(), "missing wire key `{key}`");
    }
    assert_eq!(j["lastModifiedBy"], "Grace");
    // Unset core properties serialize as null, never as missing keys.
    let empty = v(&serde_json::to_string(&WasmDocInfo::default()).unwrap());
    assert_eq!(empty["title"], serde_json::Value::Null);
    assert_eq!(empty["lastModifiedBy"], serde_json::Value::Null);
}

#[test]
fn supported_feature_table_stays_honest_to_the_engine() {
    // Exactly the capabilities the wasm boundary ships today: text
    // editing, property-blob formatting, undo/redo, spellcheck,
    // hyphenation. Anything else (comments, track changes, co-editing,
    // forms) must answer false until the engine ships it.
    let supported = [
        "support-text-editing",
        "support-text-formatting",
        "support-undo-redo",
        "support-spellcheck",
        "support-hyphenation",
    ];
    for f in supported {
        assert!(is_support_feature(f), "{f} must be supported");
        assert!(is_support_feature(&f.to_uppercase()), "case-insensitive");
    }
    for f in [
        "support-comments",
        "support-track-changes",
        "support-co-editing",
        "support-forms",
        "unknown-feature",
        "",
    ] {
        assert!(!is_support_feature(f), "{f:?} must not be supported");
    }
}

#[test]
fn disconnect_frame_still_carries_the_reason_payload() {
    // The frame asc_coAuthoringDisconnect pushes (session flips its own
    // state; the wire contract lives here).
    let ev = WsEvent::CoAuthoringDisconnect {
        reason: "session expired".into(),
    };
    let j = serde_json::to_value(&ev).unwrap();
    assert_eq!(
        j,
        serde_json::json!({
            "event": "co_authoring_disconnect",
            "payload": { "reason": "session expired" }
        })
    );
}

//! Tests for the session module (PORT-PLAN R2 / ORM-01 `collab` +
//! `document` core rows): the camelCase serde wire contract of the
//! `WasmUserInfo` / `WasmDocInfo` blobs, the session-field and identity
//! setters/getters, `asc_isSupportFeature`, the doc-info getters over an
//! injected model, and the `asc_coAuthoringDisconnect` lifecycle (state
//! flip + pushed `WsEvent::CoAuthoringDisconnect` frame through the native
//! test sink).
//! Registered via `#[cfg(test)] mod session_tests;`.

#[cfg(test)]
use super::events::{clear_event_sink_for_test, set_event_sink_for_test};
#[cfg(test)]
use super::session::{
    asc_co_authoring_disconnect, get_category, get_created, get_creator, get_description,
    get_keywords, get_language, get_last_modified_by, get_modified, get_subject, get_title,
    put_user_id, put_user_name, reset_session_for_test, session_is_connected, session_test_lock,
    set_user_color,
};
#[cfg(test)]
use super::*;
#[cfg(test)]
use std::sync::{Arc, Mutex as StdMutex};

fn json(s: &str) -> serde_json::Value {
    serde_json::from_str(s).expect("valid JSON in test")
}
#[cfg(test)]
use serde_json::json;

/// Inject a model-backed document (no layout) with core properties.
fn inject_with_props(handle: u32, core: wo_ooxml::model::CoreProperties) {
    let doc = OoxmlDocument {
        format: wo_ooxml::model::OoxmlFormat::Unknown,
        version: "1.0".to_string(),
        content_types: Vec::new(),
        main_part: None,
        shared_strings: Vec::new(),
        part_count: 0,
        core_properties: core,
        relationships: Vec::new(),
        docx_body: Some(DocxBody::default()),
        xlsx_workbook: None,
    };
    DOC_MODEL_STORE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap()
        .insert(handle, doc);
}

// ── serde wire contract (camelCase = OO asc_CUserInfo / core.xml schema) ──

#[test]
fn session_wasm_user_info_serde_is_camel_case() {
    let user = WasmUserInfo {
        id: "uid-42".to_string(),
        username: "ada".to_string(),
        firstname: Some("Ada".to_string()),
        lastname: Some("Lovelace".to_string()),
        color: Some("#7F00FF".to_string()),
    };
    let v = serde_json::to_value(&user).unwrap();
    assert_eq!(v["id"], "uid-42");
    assert_eq!(v["username"], "ada");
    assert_eq!(v["firstname"], "Ada");
    assert_eq!(v["lastname"], "Lovelace");
    assert_eq!(v["color"], "#7F00FF");
    let back: WasmUserInfo = serde_json::from_value(v).unwrap();
    assert_eq!(back, user);
}

#[test]
fn session_wasm_doc_info_serde_is_camel_case() {
    let info = WasmDocInfo {
        title: Some("Spec".into()),
        subject: Some("Wasm".into()),
        creator: Some("Ada".into()),
        keywords: Some("key words".into()),
        description: Some("d".into()),
        language: Some("en-US".into()),
        last_modified_by: Some("Grace".into()),
        created: Some("2024-01-01T00:00:00Z".into()),
        modified: Some("2024-06-01T00:00:00Z".into()),
        category: Some("cat".into()),
        revision: Some("3".into()),
    };
    let v = serde_json::to_value(&info).unwrap();
    assert_eq!(v["title"], "Spec");
    assert_eq!(v["lastModifiedBy"], "Grace");
    assert_eq!(v["modified"], "2024-06-01T00:00:00Z");
    let back: WasmDocInfo = serde_json::from_value(v).unwrap();
    assert_eq!(back, info);
    // `null` core fields stay null on the wire, never missing.
    let empty = serde_json::to_value(WasmDocInfo::default()).unwrap();
    assert_eq!(empty["title"], serde_json::Value::Null);
    assert_eq!(empty["lastModifiedBy"], serde_json::Value::Null);
}

// ── identity (asc_getUserName / asc_getUserId / asc_CUserInfo blob) ──

#[test]
fn session_identity_defaults_to_empty_strings() {
    let _g = session_test_lock();
    reset_session_for_test();
    assert_eq!(get_user_id(), "");
    assert_eq!(get_user_name(), "");
    let v = json(&get_user_info().unwrap());
    assert_eq!(v["id"], "");
    assert_eq!(v["username"], "");
}

#[test]
fn session_identity_setters_and_oo_aliases_agree() {
    let _g = session_test_lock();
    reset_session_for_test();

    set_user_id("uid-42");
    assert_eq!(get_user_id(), "uid-42");
    // OO's two spellings land on the same state.
    set_user_id("uid-42-Set");
    assert_eq!(get_user_id(), "uid-42-Set");
    put_user_id("uid-42-put");
    assert_eq!(get_user_id(), "uid-42-put");

    set_user_name("ada");
    assert_eq!(get_user_name(), "ada");
    put_user_name("lovelace");
    assert_eq!(get_user_name(), "lovelace");

    set_user_color("#7F00FF");
    let v = json(&get_user_info().unwrap());
    assert_eq!(v["id"], "uid-42-put");
    assert_eq!(v["username"], "lovelace");
    assert_eq!(v["color"], "#7F00FF");
}

#[test]
fn session_set_user_info_blob_validates_and_canonicalizes() {
    let _g = session_test_lock();
    reset_session_for_test();

    let canonical = set_user_info(
        r#"{"id":"u1","username":"grace","firstname":"Grace","lastname":"Hopper","color":"00AAFF"}"#,
    )
    .unwrap();
    assert_eq!(json(&canonical)["username"], "grace");
    assert_eq!(get_user_name(), "grace");
    assert_eq!(get_user_id(), "u1");
    assert_eq!(get_user_info().unwrap(), canonical);

    // Unknown fields rejected, malformed JSON rejected.
    assert!(set_user_info(r#"{"id":"u2","wat":1}"#).is_err());
    assert!(set_user_info("not json").is_err());
    // A failed set leaves the previous identity untouched.
    assert_eq!(get_user_name(), "grace");
}

// ── session/connection fields (asc_setDocId/Token/ServerVersion/UrlChanges) ──

#[test]
fn session_connection_fields_round_trip() {
    let _g = session_test_lock();
    reset_session_for_test();

    assert_eq!(get_doc_id(), None);
    set_doc_id("doc-77");
    set_token("jwt.header.payload");
    set_server_version("8.1.0");
    set_url_changes("https://wo.example/changes");
    assert_eq!(get_doc_id().as_deref(), Some("doc-77"));
    assert_eq!(get_token().as_deref(), Some("jwt.header.payload"));
    assert_eq!(get_server_version().as_deref(), Some("8.1.0"));
    assert_eq!(
        get_url_changes().as_deref(),
        Some("https://wo.example/changes")
    );

    reset_session_for_test();
    assert_eq!(get_doc_id(), None);
    assert_eq!(get_token(), None);
    assert_eq!(get_server_version(), None);
    assert_eq!(get_url_changes(), None);
}

// ── feature support (asc_isSupportFeature) ───────────────────────────

#[test]
fn session_supports_declared_engine_capabilities_only() {
    for f in [
        "support-text-editing",
        "support-text-formatting",
        "support-undo-redo",
        "support-spellcheck",
        "support-hyphenation",
    ] {
        assert!(is_support_feature(f), "{f} must be supported");
    }
    for f in [
        "support-comments",
        "support-track-changes",
        "support-co-editing",
        "support-pdf-forms",
        "",
    ] {
        assert!(!is_support_feature(f), "{f:?} must not be supported");
    }
    // Case-insensitive, like OO's call sites.
    assert!(is_support_feature("Support-SpellCheck"));
}

// ── doc info (asc_getDocInfo + per-field getters) ────────────────────

#[test]
fn session_doc_info_reads_core_properties_from_the_model() {
    let _g = session_test_lock();
    reset_session_for_test();
    inject_with_props(
        9100,
        wo_ooxml::model::CoreProperties {
            title: Some("Quarterly".into()),
            creator: Some("Ada".into()),
            keywords: Some("q3, numbers".into()),
            last_modified_by: Some("Grace".into()),
            modified: Some("2024-06-01T00:00:00Z".into()),
            ..Default::default()
        },
    );

    let blob = json(&get_doc_info(9100).unwrap());
    assert_eq!(blob["title"], "Quarterly");
    assert_eq!(blob["creator"], "Ada");
    assert_eq!(blob["keywords"], "q3, numbers");
    assert_eq!(blob["lastModifiedBy"], "Grace");
    assert_eq!(blob["modified"], "2024-06-01T00:00:00Z");
    // Fields the part does not carry stay null.
    assert_eq!(blob["subject"], serde_json::Value::Null);

    // Per-field getters: present values, "" for absent ones.
    assert_eq!(get_title(9100).unwrap(), "Quarterly");
    assert_eq!(get_creator(9100).unwrap(), "Ada");
    assert_eq!(get_keywords(9100).unwrap(), "q3, numbers");
    assert_eq!(get_last_modified_by(9100).unwrap(), "Grace");
    assert_eq!(get_subject(9100).unwrap(), "");
    assert_eq!(get_created(9100).unwrap(), "");
    assert_eq!(get_description(9100).unwrap(), "");
    assert_eq!(get_language(9100).unwrap(), "");
    assert_eq!(get_category(9100).unwrap(), "");
    assert_eq!(get_modified(9100).unwrap(), "2024-06-01T00:00:00Z");

    // Unknown handle errors the same way as the rest of the boundary.
    assert!(get_doc_info(9999).is_err());
    assert!(get_title(9999).is_err());
}

// ── lifecycle: asc_coAuthoringDisconnect + reset_session ─────────────

#[test]
fn session_disconnect_flips_state_and_pushes_the_frame() {
    let _g = session_test_lock();
    reset_session_for_test();
    assert!(session_is_connected());

    let seen: Arc<StdMutex<Vec<WsEvent>>> = Arc::new(StdMutex::new(Vec::new()));
    let cap = Arc::clone(&seen);
    set_event_sink_for_test(move |ev| cap.lock().unwrap().push(ev.clone()));

    set_doc_id("doc-77");
    asc_co_authoring_disconnect("session expired");

    // The pushed frame is exactly the co_authoring_disconnect wire frame.
    let got = seen.lock().unwrap();
    assert_eq!(got.len(), 1);
    assert_eq!(
        serde_json::to_value(&got[0]).unwrap(),
        json!({"event": "co_authoring_disconnect", "payload": {"reason": "session expired"}})
    );
    drop(got);
    clear_event_sink_for_test();

    // Session state flipped, connection fields survive (identity is reset
    // by reset_session, not by the disconnect).
    assert!(!session_is_connected());
    assert_eq!(get_doc_id().as_deref(), Some("doc-77"));

    // reset_session is the re-init path: state + identity back to pristine.
    reset_session_for_test();
    assert!(session_is_connected());
    assert_eq!(get_doc_id(), None);
}

#[test]
fn session_disconnect_without_sink_still_flips_state() {
    let _g = session_test_lock();
    reset_session_for_test();
    clear_event_sink_for_test();
    asc_co_authoring_disconnect("manual");
    assert!(!session_is_connected());
    reset_session_for_test();
    assert!(session_is_connected());
}

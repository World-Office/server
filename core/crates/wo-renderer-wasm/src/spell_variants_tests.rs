//! Tests for the Phase-3 long-tail wasm events (P3-E01):
//!
//! * the `spell_check_variants` wasm export — pull JSON plus the pushed
//!   `WsEvent::SpellCheckVariants` frame (OO `asc_onSpellCheckVariantsFound`);
//! * the named comments/track-changes frames added to `WsEvent`
//!   (`CommentChange`, `TrackChange`, …) — wire names + serde round trips;
//! * the `emitOtherEvent` passthrough that rides `WsEvent::Other` 1:1.
//!
//! Registered via `#[cfg(test)] mod spell_variants_tests;`.

#[cfg(test)]
use super::events::*;
#[cfg(test)]
use super::*;

fn frame(ev: &WsEvent) -> serde_json::Value {
    serde_json::to_value(ev).expect("WsEvent serializes")
}

// ── spell_check_variants export ─────────────────────────────────────

// This module owns the "sv-test" dictionary in the global SPELL_DICT_STORE —
// a lang the `tests` module's spell tests never touch, so no cross-module
// lock is needed (loads below always write the same content, and nothing
// releases it, so results are stable under parallel test threads).
const LANG: &str = "sv-test";

fn load_test_dictionary() {
    let aff = r#"
REP 1
REP ph f
TRY esianrtolcdugmphbyfvkwz
SFX N Y 1
SFX N e ness e
"#;
    let dic = "5\nhello\nworld\nfine/N\nrun\nproject";
    spell_load_dictionary(aff.as_bytes(), dic.as_bytes(), LANG).expect("mini dict loads");
}

#[test]
fn spell_variants_returns_pull_json_and_pushes_frame() {
    let _lock = lock_test_sink();
    load_test_dictionary();
    clear_event_sink_for_test();

    let seen: std::sync::Mutex<Vec<WsEvent>> = std::sync::Mutex::new(Vec::new());
    let seen = std::sync::Arc::new(seen);
    let cap = std::sync::Arc::clone(&seen);
    set_event_sink_for_test(move |ev| cap.lock().unwrap().push(ev.clone()));

    let json = spell_check_variants("helo", LANG);
    let variants: Vec<String> = serde_json::from_str(&json).expect("valid JSON array");
    assert!(
        variants.contains(&String::from("hello")),
        "got: {variants:?}"
    );

    let got = seen.lock().unwrap();
    assert_eq!(got.len(), 1, "exactly one SpellCheckVariants frame");
    assert_eq!(
        got[0],
        WsEvent::SpellCheckVariants {
            word: "helo".into(),
            variants: variants.clone(),
            lang: LANG.into(),
        }
    );

    clear_event_sink_for_test();
}

#[test]
fn spell_variants_frame_wire_shape_is_snake_case() {
    let _lock = lock_test_sink();
    clear_event_sink_for_test();

    let seen: std::sync::Mutex<Vec<WsEvent>> = std::sync::Mutex::new(Vec::new());
    let seen = std::sync::Arc::new(seen);
    let cap = std::sync::Arc::clone(&seen);
    set_event_sink_for_test(move |ev| cap.lock().unwrap().push(ev.clone()));

    // Any word works for the wire-shape check; empty variants are fine.
    let _json = spell_check_variants("teh", LANG);
    let got = seen.lock().unwrap();
    assert_eq!(got.len(), 1);
    let j = frame(&got[0]);
    assert_eq!(j["event"], "spell_check_variants");
    assert_eq!(j["payload"]["word"], "teh");
    assert_eq!(j["payload"]["lang"], LANG);
    assert!(j["payload"]["variants"].is_array());
    clear_event_sink_for_test();
}

#[test]
fn spell_variants_correct_word_pushes_empty_frame() {
    let _lock = lock_test_sink();
    load_test_dictionary();
    clear_event_sink_for_test();

    let seen: std::sync::Mutex<Vec<WsEvent>> = std::sync::Mutex::new(Vec::new());
    let seen = std::sync::Arc::new(seen);
    let cap = std::sync::Arc::clone(&seen);
    set_event_sink_for_test(move |ev| cap.lock().unwrap().push(ev.clone()));

    let json = spell_check_variants("hello", LANG);
    assert_eq!(json, "[]", "correct word has no variants");
    let got = seen.lock().unwrap();
    assert_eq!(got.len(), 1, "frame still pushed so UI can clear its menu");
    assert_eq!(
        got[0],
        WsEvent::SpellCheckVariants {
            word: "hello".into(),
            variants: vec![],
            lang: LANG.into(),
        }
    );
    clear_event_sink_for_test();
}

#[test]
fn spell_variants_no_dict_fails_open_with_empty_frame() {
    let _lock = lock_test_sink();
    clear_event_sink_for_test();

    let seen: std::sync::Mutex<Vec<WsEvent>> = std::sync::Mutex::new(Vec::new());
    let seen = std::sync::Arc::new(seen);
    let cap = std::sync::Arc::clone(&seen);
    set_event_sink_for_test(move |ev| cap.lock().unwrap().push(ev.clone()));

    let json = spell_check_variants("helo", "nonexistent-lang");
    assert_eq!(json, "[]");
    let got = seen.lock().unwrap();
    assert_eq!(got.len(), 1);
    assert_eq!(
        got[0],
        WsEvent::SpellCheckVariants {
            word: "helo".into(),
            variants: vec![],
            lang: "nonexistent-lang".into(),
        }
    );
    clear_event_sink_for_test();
}

// ── comments & track-changes long-tail frames ───────────────────────

#[test]
fn comment_long_tail_frames_wire_names_and_round_trip() {
    let events: Vec<(WsEvent, &str)> = vec![
        (
            WsEvent::CommentChange {
                id: "c1".into(),
                kind: "data".into(),
                data: serde_json::json!({"text": "edited"}),
            },
            "comment_change",
        ),
        (
            WsEvent::AddComments {
                ids: vec!["c1".into(), "c2".into()],
                data: serde_json::json!([]),
            },
            "add_comments",
        ),
        (
            WsEvent::RemoveComments {
                ids: vec!["c1".into()],
            },
            "remove_comments",
        ),
        (
            WsEvent::ShowComment {
                id: "c1".into(),
                show: false,
            },
            "show_comment",
        ),
        (
            WsEvent::LockComment {
                id: "c1".into(),
                locked: true,
                user_id: Some("u1".into()),
            },
            "lock_comment",
        ),
    ];
    for (ev, name) in events {
        let j = frame(&ev);
        assert_eq!(j["event"], *name, "frame name for {ev:?}");
        let back = serde_json::from_value::<WsEvent>(j).expect("round trip");
        assert_eq!(back, ev, "round trip for {ev:?}");
    }
}

#[test]
fn track_change_frames_wire_names_and_round_trip() {
    let events: Vec<(WsEvent, &str)> = vec![
        (
            WsEvent::TrackChange {
                id: "r1".into(),
                kind: "accept".into(),
                data: serde_json::json!({"by": "u1"}),
            },
            "track_change",
        ),
        (
            WsEvent::ChangeDisplayModeInReview {
                mode: "markup".into(),
            },
            "change_display_mode_in_review",
        ),
        (
            WsEvent::ShowRevisionsChange { show: true },
            "show_revisions_change",
        ),
        (
            WsEvent::UpdateRevisionsChangesPosition {
                rects: vec![Rect {
                    x: 1.0,
                    y: 2.0,
                    w: 3.0,
                    h: 4.0,
                }],
            },
            "update_revisions_changes_position",
        ),
    ];
    for (ev, name) in events {
        let j = frame(&ev);
        assert_eq!(j["event"], *name, "frame name for {ev:?}");
        let back = serde_json::from_value::<WsEvent>(j).expect("round trip");
        assert_eq!(back, ev, "round trip for {ev:?}");
    }
}

// ── WsEvent::Other passthrough export ───────────────────────────────

#[test]
fn other_passthrough_export_pushes_name_and_data_verbatim() {
    let _lock = lock_test_sink();
    clear_event_sink_for_test();

    let seen: std::sync::Mutex<Vec<WsEvent>> = std::sync::Mutex::new(Vec::new());
    let seen = std::sync::Arc::new(seen);
    let cap = std::sync::Arc::clone(&seen);
    set_event_sink_for_test(move |ev| cap.lock().unwrap().push(ev.clone()));

    assert!(emit_other_event(
        "asc_onImg_wrapStyleChanged",
        r#"{"style":"square","wrap":2}"#
    ));
    // Non-JSON payload degrades to null instead of erroring.
    assert!(emit_other_event("asc_onSomeLongTail", "not-json"));

    let got = seen.lock().unwrap();
    assert_eq!(got.len(), 2);
    assert_eq!(
        got[0],
        WsEvent::Other {
            name: "asc_onImg_wrapStyleChanged".into(),
            data: serde_json::json!({"style":"square","wrap":2}),
        }
    );
    assert_eq!(
        got[1],
        WsEvent::Other {
            name: "asc_onSomeLongTail".into(),
            data: serde_json::Value::Null,
        }
    );
    clear_event_sink_for_test();
    assert!(!emit_other_event("asc_onDropped", "null"));
}

#[test]
fn other_passthrough_wire_shape_stays_tag_other() {
    let ev = WsEvent::Other {
        name: "asc_onTrackGuide".into(),
        data: serde_json::json!({"x": 1}),
    };
    let j = frame(&ev);
    assert_eq!(j["event"], "other");
    assert_eq!(j["payload"]["name"], "asc_onTrackGuide");
    assert_eq!(j["payload"]["data"], serde_json::json!({"x": 1}));
}

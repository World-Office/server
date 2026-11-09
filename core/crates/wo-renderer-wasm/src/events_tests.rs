//! Tests for the events module (ORM-02 / PORT-PLAN D1): the serde wire
//! contract of `WsEvent` (tag `event` / content `payload`, snake_case
//! variant names matching editor.js's `WO_WS_EVENT_FRAMES`), the 1:1
//! `Other` fallback, serde round trips, and the `set_event_sink`/
//! `emit_event`/`push` channel through the native test sink.
//! Registered via `#[cfg(test)] mod events_tests;`.

#[cfg(test)]
use super::events::*;
#[cfg(test)]
use super::*;
#[cfg(test)]
use serde_json::Value;

fn frame(ev: &WsEvent) -> serde_json::Value {
    serde_json::to_value(ev).expect("WsEvent serializes")
}

/// The 15 Phase-1 priority frames: (constructor, expected frame name).
/// The names must match editor.js's `WO_WS_EVENT_FRAMES` values 1:1 —
/// `wsEventDispatcher` fires `wo-event:<name>` exactly for these.
#[test]
fn phase1_priority_frames_match_editor_js_registry() {
    let frames: Vec<(WsEvent, &str)> = vec![
        (WsEvent::SelectionEnd, "selection_end"),
        (
            WsEvent::ToolbarState {
                bold: None,
                italic: None,
                underline: None,
                strikeout: None,
                font_size: None,
                font_family: None,
                para_style: None,
                align: None,
                vertical_align: None,
                text_color: None,
            },
            "toolbar_state",
        ),
        (
            WsEvent::FocusObject {
                kind: "text".into(),
            },
            "focus_object",
        ),
        (
            WsEvent::DocumentModifiedChanged { modified: true },
            "document_modified_changed",
        ),
        (
            WsEvent::DocumentContentReady { pages: 3 },
            "document_content_ready",
        ),
        (
            WsEvent::CanUndoRedo {
                undo: true,
                redo: false,
            },
            "can_undo_redo",
        ),
        (
            WsEvent::ZoomChanged { scale: 1.5 },
            "zoom_changed",
        ),
        (
            WsEvent::CurrentPage {
                page: 2,
                visible_pages: vec![2, 3],
                count_pages: 10,
            },
            "current_page",
        ),
        (
            WsEvent::Error {
                code: 42,
                message: "boom".into(),
            },
            "error",
        ),
        (
            WsEvent::LongAction {
                begin: true,
                id: "load".into(),
                text: "Loading…".into(),
            },
            "long_action",
        ),
        (
            WsEvent::ContextMenu {
                screen: Pos { x: 10.0, y: 20.0 },
                on_object: true,
            },
            "context_menu",
        ),
        (
            WsEvent::CoAuthoringDisconnect {
                reason: "timeout".into(),
            },
            "co_authoring_disconnect",
        ),
        (
            WsEvent::AuthParticipantsChanged {
                users: vec![Collaborator {
                    id: "u1".into(),
                    name: "Ada".into(),
                    color: "#ff0000".into(),
                }],
            },
            "auth_participants_changed",
        ),
        (
            WsEvent::LockDocumentProps {
                locked: true,
                user_id: Some("u1".into()),
            },
            "lock_document_props",
        ),
        (
            WsEvent::DownloadUrl {
                url: "https://x/y.docx".into(),
            },
            "download_url",
        ),
    ];
    assert_eq!(frames.len(), 15);
    for (ev, name) in frames {
        let j = frame(&ev);
        assert_eq!(j["event"], *name, "frame name for {ev:?}");
    }
}

#[test]
fn wire_shape_is_tag_event_content_payload() {
    let j = frame(&WsEvent::SelectionChanged {
        rects: vec![Rect {
            x: 10.0,
            y: 20.0,
            w: 180.0,
            h: 24.0,
        }],
        cursor: Some(Pos { x: 190.0, y: 20.0 }),
    });
    assert_eq!(
        j,
        serde_json::json!({
            "event": "selection_changed",
            "payload": {
                "rects": [{"x": 10.0, "y": 20.0, "w": 180.0, "h": 24.0}],
                "cursor": {"x": 190.0, "y": 20.0},
            }
        })
    );

    // Unit variant: `event` only, no `payload` key (the JS dispatcher maps
    // a missing payload to null).
    let j = frame(&WsEvent::SelectionEnd);
    assert_eq!(j, serde_json::json!({ "event": "selection_end" }));
    assert!(j.get("payload").is_none());

    let j = frame(&WsEvent::DocumentModifiedChanged { modified: true });
    assert_eq!(
        j,
        serde_json::json!({ "event": "document_modified_changed", "payload": { "modified": true } })
    );
}

#[test]
fn toolbar_state_wire_keys_are_snake_case() {
    let j = frame(&WsEvent::ToolbarState {
        bold: Some(true),
        italic: Some(false),
        underline: None,
        strikeout: None,
        font_size: Some(12.0),
        font_family: Some("Calibri".into()),
        para_style: Some("Heading 1".into()),
        align: Some("center".into()),
        vertical_align: Some("top".into()),
        text_color: Some("#a1b2c3".into()),
    });
    assert_eq!(j["event"], "toolbar_state");
    assert_eq!(j["payload"]["bold"], true);
    assert_eq!(j["payload"]["italic"], false);
    // `Option::None` serializes as explicit `null` (the "bool|null"
    // vocabulary of events.json) — the key stays, the value is null.
    assert_eq!(
        j["payload"].get("underline"),
        Some(&serde_json::Value::Null)
    );
    assert_eq!(j["payload"]["font_size"], 12.0);
    assert_eq!(j["payload"]["font_family"], "Calibri");
    assert_eq!(j["payload"]["para_style"], "Heading 1");
    assert_eq!(j["payload"]["align"], "center");
    assert_eq!(j["payload"]["vertical_align"], "top");
    assert_eq!(j["payload"]["text_color"], "#a1b2c3");
    // camelCase leaks would break the editor.js dispatcher contract.
    for key in [
        "fontSize",
        "fontFamily",
        "paraStyle",
        "verticalAlign",
        "textColor",
    ] {
        assert!(j["payload"].get(key).is_none(), "no camelCase key {key}");
    }
}

#[test]
fn both_zoom_frames_are_distinct_variants() {
    assert_eq!(frame(&WsEvent::ZoomChanged { scale: 2.0 })["event"], "zoom_changed");
    assert_eq!(frame(&WsEvent::ZoomChange { scale: 2.0 })["event"], "zoom_change");
    assert_eq!(
        serde_json::from_value::<WsEvent>(frame(&WsEvent::ZoomChange { scale: 2.0 })).unwrap(),
        WsEvent::ZoomChange { scale: 2.0 }
    );
}

#[test]
fn other_fallback_preserves_name_and_data() {
    let ev = WsEvent::Other {
        name: "img_wrap_style_changed".into(),
        data: serde_json::json!({ "style": "square" }),
    };
    let j = frame(&ev);
    assert_eq!(j["event"], "other");
    assert_eq!(j["payload"]["name"], "img_wrap_style_changed");
    assert_eq!(j["payload"]["data"], serde_json::json!({ "style": "square" }));
    assert_eq!(serde_json::from_value::<WsEvent>(j).unwrap(), ev);
}

#[test]
fn frames_round_trip_through_serde() {
    let events: Vec<WsEvent> = vec![
        WsEvent::SelectionEnd,
        WsEvent::SelectionChanged {
            rects: vec![Rect {
                x: 0.0,
                y: 0.0,
                w: 1.0,
                h: 2.0,
            }],
            cursor: None,
        },
        WsEvent::FocusObject {
            kind: "table".into(),
        },
        WsEvent::DocumentModifiedChanged { modified: false },
        WsEvent::CanUndoRedo {
            undo: false,
            redo: true,
        },
        WsEvent::CurrentPage {
            page: 0,
            visible_pages: vec![],
            count_pages: 1,
        },
        WsEvent::Error {
            code: -1,
            message: String::new(),
        },
        WsEvent::LongAction {
            begin: false,
            id: "a".into(),
            text: String::new(),
        },
        WsEvent::ForeignCursor {
            show: true,
            user_id: "u".into(),
            label: "L".into(),
            pos: Some(Pos { x: 0.0, y: 0.0 }),
        },
        WsEvent::TrackRevisionsChange { on: true },
        WsEvent::AddComment {
            id: "c1".into(),
            data: serde_json::json!({"body": "hi"}),
        },
        WsEvent::RemoveComment { id: "c1".into() },
        WsEvent::UpdateCommentPosition {
            id: "c1".into(),
            rects: vec![],
        },
        WsEvent::SpellCheckVariants {
            word: "teh".into(),
            variants: vec!["the".into()],
            lang: "en".into(),
        },
        WsEvent::TextLanguage {
            lang: "en-US".into(),
        },
        WsEvent::UpdateScrolls {
            h: ScrollState { pos: 0.0, max: 100.0 },
            v: ScrollState { pos: 5.0, max: 1000.0 },
        },
        WsEvent::PluginEvent {
            guid: "g".into(),
            data: Value::Null,
        },
    ];
    for ev in events {
        let back = serde_json::from_value::<WsEvent>(frame(&ev)).expect("round trip");
        assert_eq!(back, ev, "round trip for {ev:?}");
    }
}

// ── push channel (native test sink) ─────────────────────────────────

#[test]
fn emit_without_sink_returns_false_and_drops() {
    clear_event_sink_for_test();
    assert!(!emit_event(&WsEvent::SelectionEnd));
}

#[test]
fn test_sink_receives_every_pushed_frame() {
    clear_event_sink_for_test();
    let seen: std::sync::Mutex<Vec<WsEvent>> = std::sync::Mutex::new(Vec::new());
    let seen2 = std::sync::Arc::new(seen);
    let cap = std::sync::Arc::clone(&seen2);
    set_event_sink_for_test(move |ev| {
        cap.lock().unwrap().push(ev.clone());
    });

    let a = WsEvent::DocumentModifiedChanged { modified: true };
    let b = WsEvent::CoAuthoringDisconnect {
        reason: "manual".into(),
    };
    assert!(emit_event(&a));
    assert!(push(b.clone()));

    let got = seen2.lock().unwrap();
    assert_eq!(got.len(), 2);
    assert_eq!(got[0], a);
    assert_eq!(got[1], b);
    clear_event_sink_for_test();
    assert!(!emit_event(&WsEvent::SelectionEnd));
}

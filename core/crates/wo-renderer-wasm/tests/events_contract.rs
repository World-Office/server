//! Integration contract tests for the `wo_renderer_wasm::events` module
//! (ORM-02 / PORT-PLAN D1): the serde wire schema of `WsEvent` frames.
//! Pure serde — no sinks, no global stores — so it can run anywhere the
//! rlib links. The frame names and payload keys pinned here are the 15
//! Phase-1 priority frames of `apps/web/apps/documenteditor-wysiwyg/
//! events.json` (`WO_WS_EVENT_FRAMES` in editor.js), which the UI
//! dispatcher fires as named `wo-event:<frame>` CustomEvents.

use wo_renderer_wasm::events::{Collaborator, Pos, Rect, ScrollState, WsEvent};

fn frame(ev: &WsEvent) -> serde_json::Value {
    serde_json::to_value(ev).expect("WsEvent serializes")
}

#[test]
fn unit_variant_frame_has_event_tag_only() {
    assert_eq!(
        frame(&WsEvent::SelectionEnd),
        serde_json::json!({ "event": "selection_end" })
    );
}

#[test]
fn phase1_frames_pin_the_editor_js_registry_1to1() {
    // (frame name per events.json, payload pinned per its `payload` spec).
    let pins: Vec<(&str, WsEvent)> = vec![
        (
            "focus_object",
            WsEvent::FocusObject {
                kind: "image".into(),
            },
        ),
        (
            "document_modified_changed",
            WsEvent::DocumentModifiedChanged { modified: true },
        ),
        (
            "document_content_ready",
            WsEvent::DocumentContentReady { pages: 7 },
        ),
        (
            "can_undo_redo",
            WsEvent::CanUndoRedo {
                undo: true,
                redo: false,
            },
        ),
        ("zoom_changed", WsEvent::ZoomChanged { scale: 1.25 }),
        (
            "current_page",
            WsEvent::CurrentPage {
                page: 1,
                visible_pages: vec![1, 2],
                count_pages: 8,
            },
        ),
        (
            "error",
            WsEvent::Error {
                code: 1,
                message: "denied".into(),
            },
        ),
        (
            "long_action",
            WsEvent::LongAction {
                begin: true,
                id: "loading".into(),
                text: "Loading document".into(),
            },
        ),
        (
            "context_menu",
            WsEvent::ContextMenu {
                screen: Pos { x: 5.0, y: 6.0 },
                on_object: false,
            },
        ),
        (
            "co_authoring_disconnect",
            WsEvent::CoAuthoringDisconnect {
                reason: "timeout".into(),
            },
        ),
        (
            "auth_participants_changed",
            WsEvent::AuthParticipantsChanged {
                users: vec![Collaborator {
                    id: "u1".into(),
                    name: "Ada".into(),
                    color: "#00ff00".into(),
                }],
            },
        ),
        (
            "lock_document_props",
            WsEvent::LockDocumentProps {
                locked: true,
                user_id: None,
            },
        ),
        (
            "download_url",
            WsEvent::DownloadUrl {
                url: "https://host/doc.docx".into(),
            },
        ),
    ];
    for (name, ev) in pins {
        let j = frame(&ev);
        assert_eq!(j["event"], name);
        assert!(j.get("payload").is_some(), "payload key for {name}");
    }
}

#[test]
fn toolbar_state_collapses_the_formatting_family() {
    let j = frame(&WsEvent::ToolbarState {
        bold: Some(true),
        italic: None,
        underline: Some(false),
        strikeout: None,
        font_size: Some(11.0),
        font_family: Some("Calibri".into()),
        para_style: Some("Body Text".into()),
        align: Some("left".into()),
        vertical_align: None,
        text_color: None,
    });
    assert_eq!(j["event"], "toolbar_state");
    let p = &j["payload"];
    assert_eq!(p["bold"], true);
    assert_eq!(p["underline"], false);
    assert_eq!(p["font_size"], 11.0);
    assert_eq!(p["font_family"], "Calibri");
    assert_eq!(p["para_style"], "Body Text");
    assert_eq!(p["align"], "left");
    // Exactly the 10 payload keys from events.json — no more, no less.
    let payload = j["payload"].as_object().expect("payload is an object");
    let keys: Vec<&str> = payload.keys().map(|k| k.as_str()).collect();
    let expected = [
        "bold",
        "italic",
        "underline",
        "strikeout",
        "font_size",
        "font_family",
        "para_style",
        "align",
        "vertical_align",
        "text_color",
    ];
    assert_eq!(keys.len(), expected.len());
    for k in expected {
        assert!(keys.contains(&k), "toolbar_state payload key {k}");
    }
}

#[test]
fn legacy_zoom_change_stays_a_distinct_frame() {
    assert_eq!(
        frame(&WsEvent::ZoomChange { scale: 1.0 })["event"],
        "zoom_change"
    );
}

#[test]
fn other_frame_is_the_1to1_long_tail_fallback() {
    let j = frame(&WsEvent::Other {
        name: "start_update_external_reference".into(),
        data: serde_json::json!({ "url": "https://host/ref" }),
    });
    assert_eq!(j["event"], "other");
    assert_eq!(j["payload"]["name"], "start_update_external_reference");
    assert_eq!(j["payload"]["data"]["url"], "https://host/ref");
}

#[test]
fn all_named_frames_round_trip() {
    let events: Vec<WsEvent> = vec![
        WsEvent::SelectionEnd,
        WsEvent::SelectionChanged {
            rects: vec![Rect {
                x: 1.0,
                y: 2.0,
                w: 3.0,
                h: 4.0,
            }],
            cursor: Some(Pos { x: 4.0, y: 2.0 }),
        },
        WsEvent::CurrentPage {
            page: 0,
            visible_pages: vec![],
            count_pages: 0,
        },
        WsEvent::ForeignCursor {
            show: false,
            user_id: "u".into(),
            label: "L".into(),
            pos: None,
        },
        WsEvent::TrackRevisionsChange { on: false },
        WsEvent::AddComment {
            id: "c".into(),
            data: serde_json::json!(null),
        },
        WsEvent::RemoveComment { id: "c".into() },
        WsEvent::UpdateCommentPosition {
            id: "c".into(),
            rects: vec![],
        },
        WsEvent::SpellCheckVariants {
            word: "w".into(),
            variants: vec![],
            lang: "en".into(),
        },
        WsEvent::TextLanguage { lang: "en".into() },
        WsEvent::UpdateScrolls {
            h: ScrollState { pos: 0.0, max: 0.0 },
            v: ScrollState { pos: 0.0, max: 0.0 },
        },
        WsEvent::PluginEvent {
            guid: "g".into(),
            data: serde_json::json!({}),
        },
    ];
    for ev in events {
        let back = serde_json::from_value::<WsEvent>(frame(&ev)).expect("round trip");
        assert_eq!(back, ev);
    }
}

//! Engine→UI event channel for the OO→WO wasm boundary (ORM-02 / PORT-PLAN D1).
//!
//! `WsEvent` is the push enum: one variant per OO `asc_on*` callback the UI
//! registers, with variant names derived mechanically (strip `asc_on`/`on`,
//! split camel humps, snake_case — `asc_onDocumentModifiedChanged` →
//! `DocumentModifiedChanged` → frame `document_modified_changed`). The 15
//! Phase-1 priority frames (ORM-02 §5, ~85% of UI value) are the ones
//! `editor.js`'s `wsEventDispatcher` fires as named `wo-event:<frame>`
//! CustomEvents; every other variant rides the plain `wo-event` fan-out only,
//! and `Other { name, data }` preserves the long tail 1:1 so no OO event can
//! be lost.
//!
//! Wire shape — one `WsEvent` is one JSON object crossing the boundary
//! (serde internally tagged: `tag = "event"`, `content = "payload"`):
//!
//! ```json
//! { "event": "selection_changed",
//!   "payload": { "rects": [{"x":10,"y":20,"w":180,"h":24}], "cursor": {"x":190,"y":20} } }
//! { "event": "document_modified_changed", "payload": { "modified": true } }
//! ```
//!
//! `seq` (monotonic per session) is added by the JS dispatcher, not here.
//!
//! The engine pushes through one installed sink: `set_event_sink` stores the
//! JS closure, `emit_event` / `push` serialize a frame and deliver it.
//! `editor.js` attaches its dispatcher via
//! `wasm.set_event_sink((frame) => window.engineEventsSink(frame))`.

use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use wasm_bindgen::prelude::*;

/// 2D point (screen or document coordinates, per variant).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Pos {
    pub x: f64,
    pub y: f64,
}

/// Axis-aligned rectangle (selection range, comment anchor, …).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// One scroll axis state (OO `asc_onUpdateScrolls`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScrollState {
    pub pos: f64,
    pub max: f64,
}

/// A co-editing participant (OO `asc_onAuthParticipantsChanged`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Collaborator {
    pub id: String,
    pub name: String,
    pub color: String,
}

/// Engine → UI event frame. One `WsEvent` == one JSON object crossing the
/// wasm boundary; the UI consumes every frame through the single sink
/// installed by `set_event_sink`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "event", content = "payload", rename_all = "snake_case")]
pub enum WsEvent {
    // ---- selection & focus (Phase 1) ----
    /// OO `asc_onSelectionEnd` — caret/selection refresh hook.
    SelectionEnd,
    SelectionChanged {
        rects: Vec<Rect>,
        cursor: Option<Pos>,
    },
    /// OO `asc_onFocusObject` — `kind` is "text" | "image" | "chart" |
    /// "table" | "control" (toolbar context switching).
    FocusObject { kind: String },
    /// Collapsed `asc_onBold`/`asc_onItalic`/`asc_onFontSize`/… family.
    ToolbarState {
        bold: Option<bool>,
        italic: Option<bool>,
        underline: Option<bool>,
        strikeout: Option<bool>,
        font_size: Option<f64>,
        font_family: Option<String>,
        para_style: Option<String>,
        align: Option<String>,
        vertical_align: Option<String>,
        text_color: Option<String>,
    },
    /// OO `asc_onZoomChanged`.
    ZoomChanged { scale: f64 },
    /// Legacy bare `onZoom` frame. Kept a distinct variant from
    /// `ZoomChanged` so old UI consumers still match (ORM-02 §4).
    ZoomChange { scale: f64 },
    /// OO `asc_onCurrentPage` — page indicator.
    CurrentPage {
        page: u32,
        visible_pages: Vec<u32>,
        count_pages: u32,
    },

    // ---- document lifecycle & history (Phase 1) ----
    /// OO `asc_onDocumentContentReady`.
    DocumentContentReady { pages: u32 },
    /// OO `asc_onDocumentModifiedChanged` — drives `notifyHost("editing"|"saved")`.
    DocumentModifiedChanged { modified: bool },
    /// OO `asc_onCanUndo` / `asc_onCanRedo` ride the same frame.
    CanUndoRedo { undo: bool, redo: bool },
    /// OO `asc_onError` — the richest OO funnel (41 fire sites in the word
    /// bundle).
    Error { code: i32, message: String },
    /// OO `asc_onStartAction` / `asc_onEndAction` pair (end rides `begin: false`).
    LongAction {
        begin: bool,
        id: String,
        text: String,
    },
    /// OO `asc_onDownloadUrl` — export/download URL handoff.
    DownloadUrl { url: String },

    // ---- co-editing (Phase 1) ----
    /// OO `asc_onCoAuthoringDisconnect` — session-loss banner.
    CoAuthoringDisconnect { reason: String },
    /// OO `asc_onAuthParticipantsChanged` — presence chips / foreign carets.
    AuthParticipantsChanged { users: Vec<Collaborator> },
    ForeignCursor {
        show: bool,
        user_id: String,
        label: String,
        pos: Option<Pos>,
    },
    /// OO `asc_onLockDocumentProps` / `asc_onUnLockDocumentProps` (unlock
    /// rides `locked: false`).
    LockDocumentProps {
        locked: bool,
        user_id: Option<String>,
    },

    // ---- review / comments (Phase 2) ----
    TrackRevisionsChange { on: bool },
    AddComment { id: String, data: Value },
    RemoveComment { id: String },
    UpdateCommentPosition { id: String, rects: Vec<Rect> },

    // ---- proofing / view misc (Phase 2/3) ----
    SpellCheckVariants {
        word: String,
        variants: Vec<String>,
        lang: String,
    },
    TextLanguage { lang: String },
    UpdateScrolls {
        h: ScrollState,
        v: ScrollState,
    },
    /// OO `asc_onContextMenu` — mirrors editor.js's existing `ctx-menu`
    /// CustomEvent path.
    ContextMenu { screen: Pos, on_object: bool },
    PluginEvent { guid: String, data: Value },
    /// 1:1 fallback for the long tail (the ~176 events beyond the named
    /// variants): the OO callback name and its payload survive verbatim.
    Other { name: String, data: Value },
}

/// Installed JS sink: the single closure every pushed frame is delivered to.
/// WASM is single-threaded; the Mutex guards the slot, not real contention.
static SINK: OnceLock<Mutex<Option<js_sys::Function>>> = OnceLock::new();

/// Native-`cargo test`-only sink: JS functions cannot exist off-wasm, so
/// `emit_event` falls back to this slot when the wasm sink is empty.
#[cfg(test)]
static TEST_SINK: OnceLock<Mutex<Option<Box<dyn FnMut(&WsEvent) + Send>>>> = OnceLock::new();

/// Install the JS callback that receives every pushed `WsEvent` frame as a
/// `{"event": "<snake_case variant>", "payload": {...}}` object.
///
/// `editor.js` attaches its dispatcher here:
/// `wasm.set_event_sink((frame) => window.engineEventsSink(frame))`.
#[wasm_bindgen]
pub fn set_event_sink(sink: js_sys::Function) {
    *SINK.get_or_init(|| Mutex::new(None)).lock().unwrap() = Some(sink);
}

/// Remove the installed sink; frames are dropped (never queued) until a new
/// sink is set — the UI re-pulls state through the pull exports.
#[wasm_bindgen]
pub fn clear_event_sink() {
    *SINK.get_or_init(|| Mutex::new(None)).lock().unwrap() = None;
}

/// Test-only sink installer for native `cargo test` runs (off-wasm there is
/// no `js_sys::Function` to install).
#[cfg(test)]
pub(crate) fn set_event_sink_for_test(sink: impl FnMut(&WsEvent) + Send + 'static) {
    *TEST_SINK.get_or_init(|| Mutex::new(None)).lock().unwrap() = Some(Box::new(sink));
}

/// Test-only sink removal.
#[cfg(test)]
pub(crate) fn clear_event_sink_for_test() {
    *TEST_SINK.get_or_init(|| Mutex::new(None)).lock().unwrap() = None;
}

/// Serialize `ev` to its wire frame and deliver it to the installed sink.
///
/// Returns `true` when a sink consumed the frame, `false` when none is
/// installed (the frame is dropped, never queued).
pub fn emit_event(ev: &WsEvent) -> bool {
    let Ok(frame) = serde_json::to_string(ev) else {
        return false;
    };
    {
        let sink = SINK.get_or_init(|| Mutex::new(None)).lock().unwrap();
        if let Some(f) = sink.as_ref() {
            // The JS dispatcher wants an object with an `event` property,
            // not a JSON string.
            if let Ok(obj) = js_sys::JSON::parse(&frame) {
                let _ = f.call1(&JsValue::NULL, &obj);
            }
            return true;
        }
    }
    #[cfg(test)]
    {
        let mut sink = TEST_SINK.get_or_init(|| Mutex::new(None)).lock().unwrap();
        if let Some(f) = sink.as_mut() {
            f(ev);
            return true;
        }
    }
    false
}

/// Push one frame by value — the ergonomic engine-side call site used by the
/// OO-named exports (e.g. `coAuthoringDisconnect` below).
pub fn push(ev: WsEvent) -> bool {
    emit_event(&ev)
}

// ── OO-named exports that push (ORM-01 object-ops with an event answer) ──

/// OO `coAuthoringDisconnect()` object-op (ORM-01 row 12): the app asks the
/// engine to drop the co-editing session; the engine answers by pushing the
/// `WsEvent::CoAuthoringDisconnect` frame the UI banner listens for.
#[wasm_bindgen(js_name = coAuthoringDisconnect)]
pub fn co_authoring_disconnect(reason: &str) {
    let _ = push(WsEvent::CoAuthoringDisconnect {
        reason: reason.to_string(),
    });
}

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Serialize)]
pub struct MenuEventPayload {
    pub action: String,
}

pub fn emit_menu_event(app: &AppHandle, action: &str) {
    let payload = MenuEventPayload {
        action: action.to_string(),
    };

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("menu-event", &payload);
    }
}

#[allow(dead_code)]
pub fn emit_menu_event_to_window(app: &AppHandle, window_label: &str, action: &str) {
    let payload = MenuEventPayload {
        action: action.to_string(),
    };

    if let Some(window) = app.get_webview_window(window_label) {
        let _ = window.emit("menu-event", &payload);
    }
}

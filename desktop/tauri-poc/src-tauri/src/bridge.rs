use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use std::fmt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MenuEventPayload {
    pub action: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BridgeError {
    WindowNotFound(String),
    FileSystemError(String),
    SerializationError(String),
    PluginError(String),
    Unknown(String),
}

impl fmt::Display for BridgeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BridgeError::WindowNotFound(msg) => write!(f, "Window not found: {}", msg),
            BridgeError::FileSystemError(msg) => write!(f, "File system error: {}", msg),
            BridgeError::SerializationError(msg) => write!(f, "Serialization error: {}", msg),
            BridgeError::PluginError(msg) => write!(f, "Plugin error: {}", msg),
            BridgeError::Unknown(msg) => write!(f, "Unknown error: {}", msg),
        }
    }
}

impl std::error::Error for BridgeError {}

impl From<tauri::Error> for BridgeError {
    fn from(e: tauri::Error) -> Self {
        BridgeError::Unknown(e.to_string())
    }
}

impl From<std::io::Error> for BridgeError {
    fn from(e: std::io::Error) -> Self {
        BridgeError::FileSystemError(e.to_string())
    }
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

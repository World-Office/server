use crate::state::AppState;
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

const WINDOW_OFFSET: f64 = 30.0;
const WINDOW_WIDTH: f64 = 800.0;
const WINDOW_HEIGHT: f64 = 600.0;

fn cascade_position(app: &AppHandle, index: usize) -> PhysicalPosition<f64> {
    let offset = (index as f64) * WINDOW_OFFSET;
    PhysicalPosition::new(100.0 + offset, 100.0 + offset)
}

pub fn create_new_document_window(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let state = app.state::<AppState>();
    let mut window_count = state.window_count.lock().unwrap();
    *window_count += 1;
    let count = *window_count;
    let pos = cascade_position(app, count as usize);
    drop(window_count);

    let label = format!("document-{}", count);
    let title = format!("Untitled Document {}", count);

    let _ = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .title(&title)
        .inner_size(WINDOW_WIDTH, WINDOW_HEIGHT)
        .min_inner_size(400.0, 300.0)
        .position(pos.x, pos.y)
        .build()?;

    Ok(())
}

/// Return the focused webview window, falling back to "main".
pub fn get_focused_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    for (label, _) in app.webview_windows() {
        if let Some(window) = app.get_webview_window(&label) {
            if window.is_focused().unwrap_or(false) {
                return Some(window);
            }
        }
    }
    app.get_webview_window("main")
}

pub fn close_window(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(window) = get_focused_window(app) {
        window.close()?;
    }
    Ok(())
}

pub fn get_document_title(app: &AppHandle, label: &str) -> String {
    if let Some(window) = app.get_webview_window(label) {
        window
            .title()
            .unwrap_or_else(|_| "World Office".to_string())
    } else {
        "World Office".to_string()
    }
}

/// Return a list of all document windows sorted by label.
pub fn get_document_windows<R: tauri::Runtime>(app: &AppHandle<R>) -> Vec<tauri::WebviewWindow<R>> {
    let mut windows: Vec<tauri::WebviewWindow<R>> = app
        .webview_windows()
        .iter()
        .filter_map(|(label, _)| {
            let w = app.get_webview_window(label)?;
            if label == "main" || label == "settings" {
                return None;
            }
            Some(w)
        })
        .collect();
    windows.sort_by(|a, b| a.label().cmp(b.label()));
    windows
}

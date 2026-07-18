use crate::bridge::BridgeError;
use crate::state::{AppState, SessionState};
use crate::window;
use tauri::{AppHandle, Manager, PhysicalPosition, State, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub fn new_doc(app: AppHandle, _state: State<'_, AppState>) -> Result<(), BridgeError> {
    window::create_new_document_window(&app).map_err(|e| BridgeError::Unknown(e.to_string()))
}

pub fn open_file(app: &AppHandle, path: String) -> Result<(), BridgeError> {
    app.state::<AppState>().add_recent_file(path.clone());

    let state = app.state::<AppState>();
    let saved = state.get_default_window_state();
    let mut window_count = state.window_count.lock().unwrap();
    *window_count += 1;
    let count = *window_count;
    let offset = (count as f64) * 30.0;
    let pos = PhysicalPosition::new(100.0 + offset, 100.0 + offset);
    drop(window_count);

    let filename = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Document");

    let mut builder = WebviewWindowBuilder::new(app, &path, WebviewUrl::App("index.html".into()))
        .title(filename)
        .min_inner_size(400.0, 300.0)
        .inner_size(saved.width, saved.height);

    if saved.x != 100.0 || saved.y != 100.0 {
        builder = builder.position(saved.x, saved.y);
    } else {
        builder = builder.position(pos.x, pos.y);
    }

    let _ = builder.build().map_err(|e| BridgeError::WindowNotFound(e.to_string()))?;

    app.state::<SessionState>().add_document(path);
    Ok(())
}

#[tauri::command]
pub fn open_doc(app: AppHandle, _state: State<'_, AppState>, path: String) -> Result<(), BridgeError> {
    open_file(&app, path)
}

#[tauri::command]
pub fn save_doc(
    _app: AppHandle,
    state: State<'_, AppState>,
    path: Option<String>,
    _content: String,
) -> Result<(), BridgeError> {
    if let Some(path) = path {
        state.add_recent_file(path);
    }
    Ok(())
}

#[tauri::command]
pub fn close_doc(app: AppHandle, _state: State<'_, AppState>) -> Result<(), BridgeError> {
    let label = window::get_focused_window(&app)
        .as_ref()
        .map(|w| w.label().to_string());

    window::close_window(&app).map_err(|e| BridgeError::Unknown(e.to_string()))?;

    if let Some(lbl) = label {
        let session = app.state::<SessionState>();
        session.remove_document(&lbl);
    }

    Ok(())
}

#[tauri::command]
pub async fn about(app: tauri::AppHandle) -> Result<(), BridgeError> {
    use tauri_plugin_dialog::DialogExt;
    let version = env!("CARGO_PKG_VERSION");
    app.dialog()
        .message(format!(
            "World Office Desktop\nVersion {version}\n\n\
             An independent, open-source document editing suite.\n\
             Built with Rust + React + Tauri.\n\n\
             License: MIT\nhttps://world-office.org"
        ))
        .title("About World Office")
        .kind(tauri_plugin_dialog::MessageDialogKind::Info)
        .show(|_| {});
    Ok(())
}

#[tauri::command]
pub fn get_recent_files(state: State<'_, AppState>) -> Vec<String> {
    state.get_recent_files()
}

#[tauri::command]
pub fn clear_recent_files(state: State<'_, AppState>) -> Result<(), BridgeError> {
    state.clear_recent_files();
    Ok(())
}

#[tauri::command]
pub fn zoom_in(app: AppHandle) -> Result<(), BridgeError> {
    if let Some(window) = window::get_focused_window(&app) {
        window
            .set_zoom(1.1)
            .map_err(BridgeError::from)?;
    }
    Ok(())
}

#[tauri::command]
pub fn zoom_out(app: AppHandle) -> Result<(), BridgeError> {
    if let Some(window) = window::get_focused_window(&app) {
        window
            .set_zoom(0.9)
            .map_err(BridgeError::from)?;
    }
    Ok(())
}

#[tauri::command]
pub fn reset_zoom(app: AppHandle) -> Result<(), BridgeError> {
    if let Some(window) = window::get_focused_window(&app) {
        window.set_zoom(1.0).map_err(BridgeError::from)?;
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_fullscreen(app: AppHandle) -> Result<(), BridgeError> {
    if let Some(window) = window::get_focused_window(&app) {
        window
            .set_fullscreen(!window.is_fullscreen().unwrap_or(false))
            .map_err(BridgeError::from)?;
    }
    Ok(())
}

#[tauri::command]
pub fn update_window_title(app: AppHandle, title: String) -> Result<(), BridgeError> {
    if let Some(window) = window::get_focused_window(&app) {
        window.set_title(&title).map_err(BridgeError::from)?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_settings(app: AppHandle) -> Result<(), BridgeError> {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    let _ = WebviewWindowBuilder::new(
        &app,
        "settings",
        WebviewUrl::App("settings.html".into()),
    )
    .title("Settings")
    .inner_size(600.0, 500.0)
    .min_inner_size(500.0, 400.0)
    .center()
    .resizable(true)
    .decorations(true)
    .build()
    .map_err(|e| BridgeError::WindowNotFound(e.to_string()))?;

    Ok(())
}

// --- Window State Persistence Commands ---

#[tauri::command]
pub fn save_window_state(
    app: AppHandle,
    label: String,
    width: f64,
    height: f64,
    x: f64,
    y: f64,
    maximized: bool,
) -> Result<(), BridgeError> {
    let state = app.state::<AppState>();
    state.save_window_state(&label, width, height, x, y, maximized);
    Ok(())
}

#[tauri::command]
pub fn get_window_state(app: AppHandle, label: String) -> Result<Option<crate::state::WindowState>, BridgeError> {
    let state = app.state::<AppState>();
    Ok(state.get_window_state(&label))
}

// --- Native File Dialog Commands ---

#[tauri::command]
pub async fn show_open_dialog(app: AppHandle) -> Result<Option<String>, BridgeError> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("Documents", &["docx", "xlsx", "pptx", "pdf", "odt", "ods", "odp", "txt", "rtf", "csv", "md", "html"])
        .add_filter("All Files", &["*"])
        .pick_file(move |file| {
            let _ = tx.send(file.map(|f| f.to_string()));
        });
    Ok(rx.await.unwrap_or(None))
}

#[tauri::command]
pub async fn show_save_dialog(app: AppHandle) -> Result<Option<String>, BridgeError> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("Documents", &["docx", "xlsx", "pptx", "pdf", "odt", "ods", "odp", "txt", "rtf", "csv", "md", "html"])
        .add_filter("All Files", &["*"])
        .save_file(move |file| {
            let _ = tx.send(file.map(|f| f.to_string()));
        });
    Ok(rx.await.unwrap_or(None))
}

#[tauri::command]
pub async fn pick_directory(app: AppHandle) -> Result<Option<String>, BridgeError> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .pick_folder(move |dir| {
            let _ = tx.send(dir.map(|d| d.to_string()));
        });
    Ok(rx.await.unwrap_or(None))
}

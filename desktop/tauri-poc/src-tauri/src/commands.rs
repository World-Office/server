use crate::state::{AppState, SessionState};
use crate::window;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub fn new_doc(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    window::create_new_document_window(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_doc(app: AppHandle, state: State<'_, AppState>, path: String) -> Result<(), String> {
    // In a real app, you would read the file and pass content to frontend
    state.add_recent_file(path.clone());

    let filename = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Document");

    let _ = WebviewWindowBuilder::new(&app, &path, WebviewUrl::App("index.html".into()))
        .title(filename)
        .inner_size(800.0, 600.0)
        .min_inner_size(400.0, 300.0)
        .center()
        .build()
        .map_err(|e| e.to_string())?;

    let session = app.state::<SessionState>();
    session.add_document(path);

    Ok(())
}

#[tauri::command]
pub fn save_doc(
    app: AppHandle,
    state: State<'_, AppState>,
    path: Option<String>,
    content: String,
) -> Result<(), String> {
    // In a real app, you would write the content to disk
    if let Some(path) = path {
        state.add_recent_file(path);
    }
    Ok(())
}

#[tauri::command]
pub fn close_doc(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let label = window::get_focused_window(&app)
        .as_ref()
        .map(|w| w.label().to_string());

    window::close_window(&app).map_err(|e| e.to_string())?;

    if let Some(lbl) = label {
        let session = app.state::<SessionState>();
        session.remove_document(&lbl);
    }

    Ok(())
}

#[tauri::command]
pub async fn about(app: tauri::AppHandle) -> Result<(), String> {
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
pub fn zoom_in(app: AppHandle) -> Result<(), String> {
    if let Some(window) = window::get_focused_window(&app) {
        window
            .set_zoom(1.1)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn zoom_out(app: AppHandle) -> Result<(), String> {
    if let Some(window) = window::get_focused_window(&app) {
        window
            .set_zoom(0.9)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn reset_zoom(app: AppHandle) -> Result<(), String> {
    if let Some(window) = window::get_focused_window(&app) {
        window.set_zoom(1.0).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_fullscreen(app: AppHandle) -> Result<(), String> {
    if let Some(window) = window::get_focused_window(&app) {
        window
            .set_fullscreen(!window.is_fullscreen().unwrap_or(false))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn update_window_title(app: AppHandle, title: String) -> Result<(), String> {
    if let Some(window) = window::get_focused_window(&app) {
        window.set_title(&title).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_settings(app: AppHandle) -> Result<(), String> {
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
    .map_err(|e| e.to_string())?;

    Ok(())
}

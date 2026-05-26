mod bridge;
mod commands;
mod filesystem;
mod health;
mod keychain;
mod menu;
mod plugins;
mod print;
mod settings;
mod state;
mod tray;
mod updater;
mod window;

use menu::create_app_menu;
use state::{AppState, SessionState};
use std::sync::Mutex;
use tauri::Manager;
use tray::create_system_tray;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            settings::get_settings,
            settings::save_settings,
            settings::reset_settings,
            commands::open_settings,
            commands::new_doc,
            commands::open_doc,
            commands::save_doc,
            commands::close_doc,
            commands::about,
            commands::get_recent_files,
            commands::update_window_title,
            commands::zoom_in,
            commands::zoom_out,
            commands::reset_zoom,
            commands::toggle_fullscreen,
            health::check_backend_health,
            plugins::get_plugins,
            plugins::get_plugin_source,
            plugins::toggle_plugin,
            filesystem::read_file,
            filesystem::read_file_binary,
            filesystem::write_file,
            filesystem::write_file_binary,
            filesystem::delete_file,
            filesystem::rename_file,
            filesystem::copy_file,
            filesystem::list_directory,
            filesystem::create_directory,
            filesystem::get_file_info,
            filesystem::detect_document_type,
            filesystem::get_home_directory,
            filesystem::get_documents_directory,
            keychain::store_credential,
            keychain::get_credential,
            keychain::delete_credential,
            keychain::list_credentials,
            print::print_document,
            print::print_preview,
            print::get_printers,
            print::get_page_sizes,
            updater::check_for_updates,
            updater::install_update,
            updater::get_current_version,
        ])
        .manage(AppState::new())
        .manage(SessionState::new())
        .manage(plugins::PluginManager::new())
        .manage(Mutex::new(updater::UpdateState::new()))
        .setup(|app| {
            // Set application menu
            let menu = create_app_menu(app)?;
            app.set_menu(menu)?;

            // Create system tray
            let _tray = create_system_tray(app.handle())?;

            // Set main window title
            let window = app.get_webview_window("main").unwrap();
            window.set_title("World Office - Untitled Document")?;

            let handle = app.handle();
            let session = handle.state::<SessionState>();
            let docs = session.get_open_documents();
            for path in docs {
                if handle.get_webview_window(&path).is_some() {
                    continue;
                }
                let filename = std::path::Path::new(&path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("Document");
                let _ = tauri::WebviewWindowBuilder::new(
                    handle,
                    &path,
                    tauri::WebviewUrl::App("index.html".into()),
                )
                .title(filename)
                .inner_size(800.0, 600.0)
                .min_inner_size(400.0, 300.0)
                .center()
                .build();
            }

            // Startup: check for updates in background
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = updater::check_for_updates(handle).await;
            });

            // Register menu event handler
            app.on_menu_event(move |app, event| {
                handle_menu_event(app, event.id.as_ref());
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn handle_menu_event(app: &tauri::AppHandle, id: &str) {
    match id {
        "new" => {
            bridge::emit_menu_event(app, "new");
        }
        "open" => {
            bridge::emit_menu_event(app, "open");
        }
        "save" => {
            bridge::emit_menu_event(app, "save");
        }
        "save-as" => {
            bridge::emit_menu_event(app, "save-as");
        }
        "close" => {
            bridge::emit_menu_event(app, "close");
        }
        "exit" => {
            app.exit(0);
        }
        "zoom-in" => {
            let _ = commands::zoom_in(app.clone());
        }
        "zoom-out" => {
            let _ = commands::zoom_out(app.clone());
        }
        "reset-zoom" => {
            let _ = commands::reset_zoom(app.clone());
        }
        "fullscreen" => {
            let _ = commands::toggle_fullscreen(app.clone());
            bridge::emit_menu_event(app, "fullscreen");
        }
        "settings" => {
            let _ = commands::open_settings(app.clone());
        }
        "about" => {
            bridge::emit_menu_event(app, "about");
        }
        "toggle-sidebar" => {
            bridge::emit_menu_event(app, "toggle-sidebar");
        }
        "check-updates" => {
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = updater::check_for_updates(handle).await;
            });
        }
        "documentation" => {
            bridge::emit_menu_event(app, "documentation");
        }
        _ if id.starts_with("recent-") => {
            let state = app.state::<AppState>();
            let recent = state.get_recent_files();
            if let Some(index_str) = id.strip_prefix("recent-") {
                if let Ok(index) = index_str.parse::<usize>() {
                    if let Some(path) = recent.get(index) {
                        bridge::emit_menu_event(app, "open-recent");
                        let _ = commands::open_doc(app.clone(), state, path.clone());
                    }
                }
            }
        }
        _ => {
            #[cfg(debug_assertions)]
            println!("Menu item '{}' not handled", id);
        }
    }
}

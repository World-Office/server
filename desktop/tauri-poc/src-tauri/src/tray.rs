use crate::window;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

pub fn create_system_tray(
    app: &AppHandle,
) -> Result<tauri::tray::TrayIcon, Box<dyn std::error::Error>> {
    // System tray menu: Show/Hide window, separator, New Document, separator, Quit
    let show_window_item = MenuItemBuilder::with_id("show-window", "Show Window").build(app)?;
    let hide_window_item = MenuItemBuilder::with_id("hide-window", "Hide Window").build(app)?;
    let new_doc_item = MenuItemBuilder::with_id("new-doc", "New Document").build(app)?;
    let check_updates_item =
        MenuItemBuilder::with_id("check-updates", "Check for Updates").build(app)?;
    let update_available_item = MenuItemBuilder::with_id("update-available", "Update Available — Install Now")
        .build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let tray_menu = MenuBuilder::new(app)
        .item(&show_window_item)
        .item(&hide_window_item)
        .separator()
        .item(&new_doc_item)
        .separator()
        .item(&check_updates_item)
        .item(&update_available_item)
        .separator()
        .item(&quit_item)
        .build()?;

    let tray = TrayIconBuilder::with_id("main-tray")
        .menu(&tray_menu)
        .menu_on_left_click(true)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show-window" => {
                if let Some(window) = window::get_focused_window(app) {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                } else if let Some(main_window) = app.get_webview_window("main") {
                    let _ = main_window.unminimize();
                    let _ = main_window.show();
                    let _ = main_window.set_focus();
                }
            }
            "hide-window" => {
                if let Some(window) = window::get_focused_window(app) {
                    let _ = window.hide();
                } else if let Some(main_window) = app.get_webview_window("main") {
                    let _ = main_window.hide();
                }
            }
            "new-doc" => {
                let _ = window::create_new_document_window(app);
            }
            "check-updates" => {
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = crate::updater::check_for_updates(handle).await {
                        eprintln!("Update check failed: {}", e);
                    }
                });
            }
            "update-available" => {
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = crate::updater::install_update(handle).await {
                        eprintln!("Update install failed: {}", e);
                    }
                });
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = window::get_focused_window(app) {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                } else if let Some(main_window) = app.get_webview_window("main") {
                    let _ = main_window.unminimize();
                    let _ = main_window.show();
                    let _ = main_window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(tray)
}

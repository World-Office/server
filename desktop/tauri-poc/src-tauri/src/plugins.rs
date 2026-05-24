use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub source: String,
}

pub struct PluginManager {
    pub plugins: Mutex<HashMap<String, PluginInfo>>,
    pub plugin_dir: PathBuf,
}

impl PluginManager {
    pub fn new() -> Self {
        let plugin_dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("~/.config"))
            .join("world-office")
            .join("plugins");

        fs::create_dir_all(&plugin_dir).ok();

        Self {
            plugins: Mutex::new(HashMap::new()),
            plugin_dir,
        }
    }

    pub fn scan_plugins(&self) -> Vec<PluginInfo> {
        let mut plugins = self.plugins.lock().unwrap();
        plugins.clear();
        let mut result = Vec::new();

        if let Ok(entries) = fs::read_dir(&self.plugin_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |e| e == "js") {
                    let id = path
                        .file_stem()
                        .and_then(|n| n.to_str())
                        .unwrap_or("unknown")
                        .to_string();
                    let source = fs::read_to_string(&path).unwrap_or_default();
                    let info = PluginInfo {
                        id: id.clone(),
                        name: id.clone(),
                        enabled: true,
                        source,
                    };
                    plugins.insert(id.clone(), info.clone());
                    result.push(info);
                }
            }
        }
        result
    }
}

#[tauri::command]
pub async fn get_plugins(app: AppHandle) -> Result<Vec<PluginInfo>, String> {
    let state = app.state::<PluginManager>();
    Ok(state.scan_plugins())
}

#[tauri::command]
pub async fn get_plugin_source(app: AppHandle, plugin_id: String) -> Result<String, String> {
    let state = app.state::<PluginManager>();
    let plugins = state.plugins.lock().unwrap();
    plugins
        .get(&plugin_id)
        .map(|p| p.source.clone())
        .ok_or_else(|| format!("Plugin not found: {}", plugin_id))
}

#[tauri::command]
pub async fn toggle_plugin(
    app: AppHandle,
    plugin_id: String,
    enabled: bool,
) -> Result<(), String> {
    let state = app.state::<PluginManager>();
    let mut plugins = state.plugins.lock().unwrap();
    if let Some(plugin) = plugins.get_mut(&plugin_id) {
        plugin.enabled = enabled;
    }
    Ok(())
}

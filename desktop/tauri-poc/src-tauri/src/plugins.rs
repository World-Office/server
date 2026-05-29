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
    pub version: String,
    pub description: String,
    pub author: String,
    pub enabled: bool,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PluginManifest {
    name: Option<String>,
    version: Option<String>,
    description: Option<String>,
    author: Option<String>,
}

struct PluginSettings {
    plugin_dir: PathBuf,
    settings_path: PathBuf,
}

impl PluginSettings {
    fn new(plugin_dir: &PathBuf) -> Self {
        let settings_path = plugin_dir.join("plugin_settings.json");
        Self {
            plugin_dir: plugin_dir.clone(),
            settings_path,
        }
    }

    fn load_enabled(&self) -> HashMap<String, bool> {
        fs::read_to_string(&self.settings_path)
            .ok()
            .and_then(|content| serde_json::from_str::<HashMap<String, bool>>(&content).ok())
            .unwrap_or_default()
    }

    fn set_enabled(&self, plugin_id: &str, enabled: bool) {
        let mut state = self.load_enabled();
        state.insert(plugin_id.to_string(), enabled);
        let _ = fs::write(
            &self.settings_path,
            serde_json::to_string(&state).unwrap_or_default(),
        );
    }

    fn remove_state(&self, plugin_id: &str) {
        let mut state = self.load_enabled();
        state.remove(plugin_id);
        let _ = fs::write(
            &self.settings_path,
            serde_json::to_string(&state).unwrap_or_default(),
        );
    }
}

fn parse_manifest_from_js(path: &PathBuf) -> Option<PluginManifest> {
    let content = fs::read_to_string(path).ok()?;
    // Try JSON manifest file first: plugin_dir/<name>/plugin.json
    let manifest_path = path.with_file_name("plugin.json");
    if manifest_path.exists() {
        if let Ok(content) = fs::read_to_string(&manifest_path) {
            if let Ok(manifest) = serde_json::from_str::<PluginManifest>(&content) {
                return Some(manifest);
            }
        }
    }
    // Fall back to JS comment metadata: /* name: ..., version: ..., ... */
    if let Some(line) = content.lines().next() {
        if line.starts_with("/*") && line.ends_with("*/") {
            let meta = line.trim_start_matches("/*").trim_end_matches("*/");
            let mut name = None;
            let mut version = None;
            let mut description = None;
            let mut author = None;
            for part in meta.split(',') {
                let kv: Vec<&str> = part.splitn(2, ':').collect();
                if kv.len() == 2 {
                    let key = kv[0].trim();
                    let val = kv[1].trim().trim_matches('"').to_string();
                    match key {
                        "name" => name = Some(val),
                        "version" => version = Some(val),
                        "description" => description = Some(val),
                        "author" => author = Some(val),
                        _ => {}
                    }
                }
            }
            return Some(PluginManifest {
                name,
                version,
                description,
                author,
            });
        }
    }
    None
}

pub struct PluginManager {
    pub plugins: Mutex<HashMap<String, PluginInfo>>,
    pub plugin_dir: PathBuf,
    settings: Mutex<PluginSettings>,
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
            plugin_dir: plugin_dir.clone(),
            settings: Mutex::new(PluginSettings::new(&plugin_dir)),
        }
    }

    pub fn scan_plugins(&self) -> Vec<PluginInfo> {
        let mut plugins = self.plugins.lock().unwrap();
        let enabled_state = self.settings.lock().unwrap().load_enabled();
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
                    let manifest = parse_manifest_from_js(&path);
                    let info = PluginInfo {
                        id: id.clone(),
                        name: manifest
                            .as_ref()
                            .and_then(|m| m.name.clone())
                            .unwrap_or_else(|| id.clone()),
                        version: manifest
                            .as_ref()
                            .and_then(|m| m.version.clone())
                            .unwrap_or_else(|| "0.1.0".to_string()),
                        description: manifest
                            .as_ref()
                            .and_then(|m| m.description.clone())
                            .unwrap_or_default(),
                        author: manifest
                            .as_ref()
                            .and_then(|m| m.author.clone())
                            .unwrap_or_default(),
                        enabled: enabled_state.get(&id).copied().unwrap_or(true),
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
    drop(plugins);
    state.settings.lock().unwrap().set_enabled(&plugin_id, enabled);
    Ok(())
}

#[tauri::command]
pub async fn install_plugin(
    app: AppHandle,
    plugin_id: String,
    source: String,
) -> Result<PluginInfo, String> {
    let state = app.state::<PluginManager>();
    let plugin_path = state.plugin_dir.join(format!("{}.js", plugin_id));

    if plugin_path.exists() {
        return Err(format!("Plugin already exists: {}", plugin_id));
    }

    fs::write(&plugin_path, &source)
        .map_err(|e| format!("Failed to write plugin file: {}", e))?;

    let info = PluginInfo {
        id: plugin_id.clone(),
        name: plugin_id.clone(),
        version: "0.1.0".to_string(),
        description: String::new(),
        author: String::new(),
        enabled: true,
        source,
    };

    let mut plugins = state.plugins.lock().unwrap();
    plugins.insert(plugin_id, info.clone());
    Ok(info)
}

#[tauri::command]
pub async fn remove_plugin(app: AppHandle, plugin_id: String) -> Result<(), String> {
    let state = app.state::<PluginManager>();
    let plugin_path = state.plugin_dir.join(format!("{}.js", plugin_id));

    if !plugin_path.exists() {
        return Err(format!("Plugin not found: {}", plugin_id));
    }

    fs::remove_file(&plugin_path)
        .map_err(|e| format!("Failed to remove plugin file: {}", e))?;

    let mut plugins = state.plugins.lock().unwrap();
    plugins.remove(&plugin_id);
    drop(plugins);
    state.settings.lock().unwrap().remove_state(&plugin_id);
    Ok(())
}

#[tauri::command]
pub async fn reload_plugins(app: AppHandle) -> Result<Vec<PluginInfo>, String> {
    let state = app.state::<PluginManager>();
    Ok(state.scan_plugins())
}

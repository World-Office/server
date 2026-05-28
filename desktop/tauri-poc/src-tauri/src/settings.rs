use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub general: GeneralSettings,
    pub editor: EditorSettings,
    pub network: NetworkSettings,
    pub appearance: AppearanceSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            general: GeneralSettings::default(),
            editor: EditorSettings::default(),
            network: NetworkSettings::default(),
            appearance: AppearanceSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneralSettings {
    pub data_directory: String,
    pub language: String,
    pub auto_start: bool,
}

impl Default for GeneralSettings {
    fn default() -> Self {
        Self {
            data_directory: dirs::document_dir()
                .map(|p| p.join("WorldOffice").to_string_lossy().to_string())
                .unwrap_or_else(|| "~/Documents/WorldOffice".to_string()),
            language: "en".to_string(),
            auto_start: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorSettings {
    pub default_format: String,
    pub autosave_interval: u32,
    pub spellcheck: bool,
}

impl Default for EditorSettings {
    fn default() -> Self {
        Self {
            default_format: "docx".to_string(),
            autosave_interval: 60,
            spellcheck: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkSettings {
    pub proxy_url: String,
    pub server_url: String,
}

impl Default for NetworkSettings {
    fn default() -> Self {
        Self {
            proxy_url: String::new(),
            server_url: "http://localhost:8004".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppearanceSettings {
    pub theme: String,
    pub font_size: u32,
    pub toolbar_layout: String,
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            font_size: 14,
            toolbar_layout: "default".to_string(),
        }
    }
}

#[tauri::command]
pub async fn get_settings(app: AppHandle) -> Result<AppSettings, String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    let settings: AppSettings = store
        .get("app_settings")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    Ok(settings)
}

#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    let value = serde_json::to_value(settings).map_err(|e| e.to_string())?;
    store.set("app_settings", value);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginSettings {
    pub plugins: Vec<String>,
}

impl Default for PluginSettings {
    fn default() -> Self {
        Self {
            plugins: Vec::new(),
        }
    }
}

#[tauri::command]
pub async fn reset_settings(app: AppHandle) -> Result<AppSettings, String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.delete("app_settings");
    store.save().map_err(|e| e.to_string())?;
    Ok(AppSettings::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_settings_defaults() {
        let settings = AppSettings::default();
        assert_eq!(settings.general.language, "en");
        assert_eq!(settings.appearance.theme, "system");
        assert_eq!(settings.editor.autosave_interval, 60);
    }

    #[test]
    fn test_plugin_settings_defaults() {
        let settings = PluginSettings::default();
        assert!(settings.plugins.is_empty());
    }
}

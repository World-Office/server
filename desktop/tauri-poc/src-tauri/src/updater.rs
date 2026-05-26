use semver::Version;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

const RELEASES_URL: &str =
    "https://world-office.codeberg.page/desktop-releases/releases.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReleaseInfo {
    pub latest_version: String,
    pub download_url: String,
    pub release_notes_url: String,
    pub checksum: String,
}

pub struct UpdateState {
    pub latest_version: Option<String>,
    pub download_url: Option<String>,
}

impl UpdateState {
    pub fn new() -> Self {
        Self {
            latest_version: None,
            download_url: None,
        }
    }
}

#[tauri::command]
pub fn get_current_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<Option<String>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let resp = client
        .get(RELEASES_URL)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch releases.json: {}", e))?;

    let release: ReleaseInfo = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse releases.json: {}", e))?;

    let current =
        Version::parse(env!("CARGO_PKG_VERSION")).map_err(|e| format!("Invalid semver: {}", e))?;
    let latest = Version::parse(&release.latest_version)
        .map_err(|e| format!("Invalid latest version: {}", e))?;

    {
        let state = app.state::<Mutex<UpdateState>>();
        let mut st = state.lock().unwrap();
        st.latest_version = Some(release.latest_version.clone());
        st.download_url = Some(release.download_url.clone());
    }

    if latest > current {
        let _ = app.emit("update-available", &release);
        Ok(Some(release.latest_version))
    } else {
        let _ = app.emit("update-checked", ());
        Ok(None)
    }
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let url = {
        let state = app.state::<Mutex<UpdateState>>();
        let st = state.lock().unwrap();
        st.download_url
            .clone()
            .ok_or_else(|| "No pending update".to_string())?
    };

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let tmp = std::env::temp_dir().join("world-office-update.deb");
    std::fs::write(&tmp, &bytes).map_err(|e| format!("Failed to write temp file: {}", e))?;

    let _ = app.emit("update-downloaded", ());

    let status = std::process::Command::new("pkexec")
        .args(["dpkg", "-i", &tmp.to_string_lossy()])
        .status()
        .map_err(|e| format!("Failed to run installer: {}", e))?;

    if status.success() {
        Ok(())
    } else {
        Err("Installation failed (non-zero exit)".to_string())
    }
}

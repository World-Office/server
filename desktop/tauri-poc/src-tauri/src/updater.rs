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

/// Platform-specific installer file name.
#[cfg(target_os = "windows")]
fn installer_name() -> String {
    "world-office-update.msi".to_string()
}

#[cfg(target_os = "macos")]
fn installer_name() -> String {
    "world-office-update.dmg".to_string()
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn installer_name() -> String {
    "world-office-update.deb".to_string()
}

/// Platform-specific install command.
#[cfg(target_os = "windows")]
fn run_installer(path: &std::path::Path) -> Result<(), String> {
    let status = std::process::Command::new("msiexec")
        .args(["/i", &path.to_string_lossy()])
        .status()
        .map_err(|e| format!("Failed to run installer: {}", e))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("Installation failed (exit: {:?})", status.code()))
    }
}

#[cfg(target_os = "macos")]
fn run_installer(path: &std::path::Path) -> Result<(), String> {
    // Mount DMG, copy app bundle, then eject
    let mount_output = std::process::Command::new("hdiutil")
        .args(["attach", "-nobrowse", &path.to_string_lossy()])
        .output()
        .map_err(|e| format!("Failed to mount DMG: {}", e))?;
    if !mount_output.status.success() {
        return Err("Failed to mount DMG installer".to_string());
    }
    // Assume the volume mounts under /Volumes/WorldOffice
    let vol = std::path::Path::new("/Volumes/World Office");
    if vol.exists() {
        let app_src = vol.join("World Office.app");
        let app_dst = std::path::Path::new("/Applications/World Office.app");
        let _ = std::fs::remove_dir_all(app_dst);
        std::fs::rename(&app_src, app_dst)
            .map_err(|e| format!("Failed to copy app bundle: {}", e))?;
        let _ = std::process::Command::new("hdiutil")
            .args(["detach", vol])
            .status();
    }
    Ok(())
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn run_installer(path: &std::path::Path) -> Result<(), String> {
    let status = std::process::Command::new("pkexec")
        .args(["dpkg", "-i", &path.to_string_lossy()])
        .status()
        .map_err(|e| format!("Failed to run installer: {}", e))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("Installation failed (exit: {:?})", status.code()))
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

    let tmp = std::env::temp_dir().join(installer_name());
    std::fs::write(&tmp, &bytes).map_err(|e| format!("Failed to write temp file: {}", e))?;

    let _ = app.emit("update-downloaded", ());

    run_installer(&tmp)
}

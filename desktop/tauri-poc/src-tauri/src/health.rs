use tauri::AppHandle;

#[tauri::command]
pub async fn check_backend_health(app: AppHandle) -> Result<bool, String> {
    match tokio::net::TcpStream::connect("127.0.0.1:8004").await {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

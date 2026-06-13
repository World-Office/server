use keyring::Entry;
use serde::Serialize;

const SERVICE_PREFIX: &str = "com.worldoffice.";

#[derive(Debug, Clone, Serialize)]
pub struct CredentialEntry {
    pub service: String,
    pub username: String,
}

#[tauri::command]
pub async fn store_credential(
    service: String,
    username: String,
    password: String,
) -> Result<(), String> {
    let service_name = format!("{}{}", SERVICE_PREFIX, service);
    let entry = Entry::new(&service_name, &username)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

    entry
        .set_password(&password)
        .map_err(|e| format!("Failed to store credential: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn get_credential(
    service: String,
    username: String,
) -> Result<String, String> {
    let service_name = format!("{}{}", SERVICE_PREFIX, service);
    let entry = Entry::new(&service_name, &username)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

    let password = entry
        .get_password()
        .map_err(|e| format!("Failed to retrieve credential: {}", e))?;

    Ok(password)
}

#[tauri::command]
pub async fn delete_credential(
    service: String,
    username: String,
) -> Result<(), String> {
    let service_name = format!("{}{}", SERVICE_PREFIX, service);
    let entry = Entry::new(&service_name, &username)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

    entry
        .delete_credential()
        .map_err(|e| format!("Failed to delete credential: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn list_credentials(service: String) -> Result<Vec<CredentialEntry>, String> {
    let _service_name = format!("{}{}", SERVICE_PREFIX, service);

    // The keyring crate doesn't have a direct "list" function
    // For now, return an empty list as this is a placeholder
    // A real implementation would need platform-specific code to enumerate credentials
    Ok(vec![])
}

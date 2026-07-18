use crate::bridge::BridgeError;
use base64::{engine::general_purpose::STANDARD, Engine};
use mime_guess::Mime;
use serde::{Deserialize, Serialize};
use std::path::Path;
use walkdir::WalkDir;

#[derive(Serialize, Deserialize, Debug)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub extension: String,
    pub size: u64,
    pub is_dir: bool,
    pub is_file: bool,
    pub modified: String,
    pub created: String,
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, BridgeError> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err(BridgeError::FileSystemError(format!("File not found: {}", path.display())));
    }

    tokio::fs::read_to_string(path)
        .await
        .map_err(|e| BridgeError::FileSystemError(format!("Failed to read file: {}", e)))
}

#[tauri::command]
pub async fn read_file_binary(path: String) -> Result<String, BridgeError> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err(BridgeError::FileSystemError(format!("File not found: {}", path.display())));
    }

    let bytes = tokio::fs::read(path)
        .await
        .map_err(|e| BridgeError::FileSystemError(format!("Failed to read binary file: {}", e)))?;
    Ok(STANDARD.encode(&bytes))
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), BridgeError> {
    let path = Path::new(&path);

    if let Some(parent) = path.parent()
        && !parent.exists()
    {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| BridgeError::FileSystemError(format!("Failed to create directories: {}", e)))?;
    }

    tokio::fs::write(path, content)
        .await
        .map_err(|e| BridgeError::FileSystemError(format!("Failed to write file: {}", e)))
}

#[tauri::command]
pub async fn write_file_binary(path: String, content_base64: String) -> Result<(), BridgeError> {
    let path = Path::new(&path);

    if let Some(parent) = path.parent()
        && !parent.exists()
    {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| BridgeError::FileSystemError(format!("Failed to create directories: {}", e)))?;
    }

    let bytes = STANDARD
        .decode(&content_base64)
        .map_err(|e| BridgeError::SerializationError(format!("Failed to decode base64: {}", e)))?;

    tokio::fs::write(path, bytes)
        .await
        .map_err(|e| BridgeError::FileSystemError(format!("Failed to write binary file: {}", e)))
}

#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), BridgeError> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err(BridgeError::FileSystemError(format!("File not found: {}", path.display())));
    }

    if path.is_dir() {
        tokio::fs::remove_dir_all(path)
            .await
            .map_err(|e| BridgeError::FileSystemError(format!("Failed to delete directory: {}", e)))
    } else {
        tokio::fs::remove_file(path)
            .await
            .map_err(|e| BridgeError::FileSystemError(format!("Failed to delete file: {}", e)))
    }
}

#[tauri::command]
pub async fn rename_file(old_path: String, new_path: String) -> Result<(), BridgeError> {
    let old_path = Path::new(&old_path);
    let new_path = Path::new(&new_path);

    if !old_path.exists() {
        return Err(BridgeError::FileSystemError(format!("Source file not found: {}", old_path.display())));
    }

    if let Some(parent) = new_path.parent()
        && !parent.exists()
    {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| BridgeError::FileSystemError(format!("Failed to create directories: {}", e)))?;
    }

    tokio::fs::rename(old_path, new_path)
        .await
        .map_err(|e| BridgeError::FileSystemError(format!("Failed to rename file: {}", e)))
}

#[tauri::command]
pub async fn copy_file(src: String, dst: String) -> Result<(), BridgeError> {
    let src_path = Path::new(&src);
    let dst_path = Path::new(&dst);

    if !src_path.exists() {
        return Err(BridgeError::FileSystemError(format!("Source file not found: {}", src_path.display())));
    }

    if let Some(parent) = dst_path.parent()
        && !parent.exists()
    {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| BridgeError::FileSystemError(format!("Failed to create directories: {}", e)))?;
    }

    if src_path.is_dir() {
        copy_dir_recursive(src_path, dst_path).await
    } else {
        tokio::fs::copy(src_path, dst_path)
            .await
            .map_err(|e| BridgeError::FileSystemError(format!("Failed to copy file: {}", e)))?;
        Ok(())
    }
}

async fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), BridgeError> {
    for entry in WalkDir::new(src).min_depth(1) {
        let entry = entry.map_err(|e| BridgeError::FileSystemError(format!("WalkDir error: {}", e)))?;
        let src_path = entry.path();
        let dst_path = dst.join(src_path.strip_prefix(src).unwrap());

        if entry.file_type().is_dir() {
            tokio::fs::create_dir_all(&dst_path)
                .await
                .map_err(|e| BridgeError::FileSystemError(format!("Failed to create directory {}: {}", dst_path.display(), e)))?;
        } else {
            tokio::fs::copy(src_path, &dst_path)
                .await
                .map_err(|e| BridgeError::FileSystemError(format!("Failed to copy {}: {}", dst_path.display(), e)))?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn list_directory(path: String) -> Result<Vec<FileEntry>, BridgeError> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err(BridgeError::FileSystemError(format!("Directory not found: {}", path.display())));
    }

    if !path.is_dir() {
        return Err(BridgeError::FileSystemError(format!("Path is not a directory: {}", path.display())));
    }

    let mut entries = Vec::new();

    let mut dir_entries = tokio::fs::read_dir(path)
        .await
        .map_err(|e| BridgeError::FileSystemError(format!("Failed to read directory: {}", e)))?;

    while let Some(entry) = dir_entries
        .next_entry()
        .await
        .map_err(|e| BridgeError::FileSystemError(format!("Failed to read entry: {}", e)))?
    {
        let metadata = entry
            .metadata()
            .await
            .map_err(|e| BridgeError::FileSystemError(format!("Failed to get metadata: {}", e)))?;

        let modified = metadata
            .modified()
            .map_err(|e| BridgeError::FileSystemError(format!("Failed to get modified time: {}", e)))?;

        let file_entry = FileEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: entry.path().to_string_lossy().into_owned(),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
            modified: format!("{:?}", modified),
        };

        entries.push(file_entry);
    }

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.cmp(&b.name),
    });

    Ok(entries)
}

#[tauri::command]
pub async fn create_directory(path: String) -> Result<(), BridgeError> {
    let path = Path::new(&path);
    if path.exists() {
        return Err(BridgeError::FileSystemError(format!("Path already exists: {}", path.display())));
    }

    tokio::fs::create_dir_all(path)
        .await
        .map_err(|e| BridgeError::FileSystemError(format!("Failed to create directory: {}", e)))
}

#[tauri::command]
pub async fn get_file_info(path: String) -> Result<FileInfo, BridgeError> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err(BridgeError::FileSystemError(format!("File not found: {}", path.display())));
    }

    let metadata = tokio::fs::metadata(path)
        .await
        .map_err(|e| BridgeError::FileSystemError(format!("Failed to get metadata: {}", e)))?;

    let modified = metadata
        .modified()
        .map_err(|e| BridgeError::FileSystemError(format!("Failed to get modified time: {}", e)))?;

    let created = metadata.created().ok();

    let created_str = match created {
        Some(time) => format!("{:?}", time),
        None => String::from("Unknown"),
    };

    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_string();

    let file_info = FileInfo {
        path: path.to_string_lossy().into_owned(),
        name,
        extension,
        size: metadata.len(),
        is_dir: metadata.is_dir(),
        is_file: metadata.is_file(),
        modified: format!("{:?}", modified),
        created: created_str,
    };

    Ok(file_info)
}

#[tauri::command]
pub fn detect_document_type(path: String) -> Result<String, BridgeError> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err(BridgeError::FileSystemError(format!("File not found: {}", path.display())));
    }

    let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");

    let doc_type: String = match extension.to_lowercase().as_str() {
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document".into(),
        "doc" => "application/msword".into(),
        "pdf" => "application/pdf".into(),
        "odt" => "application/vnd.oasis.opendocument.text".into(),
        "ods" => "application/vnd.oasis.opendocument.spreadsheet".into(),
        "odp" => "application/vnd.oasis.opendocument.presentation".into(),
        "txt" => "text/plain".into(),
        "rtf" => "application/rtf".into(),
        "html" => "text/html".into(),
        "htm" => "text/html".into(),
        "md" => "text/markdown".into(),
        "json" => "application/json".into(),
        "xml" => "application/xml".into(),
        "csv" => "text/csv".into(),
        "xls" => "application/vnd.ms-excel".into(),
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".into(),
        "ppt" => "application/vnd.ms-powerpoint".into(),
        "pptx" => {
            "application/vnd.openxmlformats-officedocument.presentationml.presentation".into()
        }
        _ => {
            let mime: Mime = mime_guess::from_path(path).first_or_octet_stream();
            mime.to_string()
        }
    };

    Ok(doc_type)
}

#[tauri::command]
pub fn get_home_directory() -> Result<String, BridgeError> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| BridgeError::FileSystemError("Failed to get home directory".to_string()))
}

#[tauri::command]
pub fn get_documents_directory() -> Result<String, BridgeError> {
    dirs::document_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| BridgeError::FileSystemError("Failed to get documents directory".to_string()))
}

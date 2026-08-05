// Storage backend for WOPI server

use crate::{Result, WopiError};
use async_trait::async_trait;
use std::path::{Path, PathBuf};
use tokio::fs;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// Metadata about a file.
#[derive(Debug, Clone)]
pub struct FileMetadata {
    /// File name (without path)
    pub name: String,
    /// File size in bytes
    pub size: i64,
    /// File version (e.g., timestamp or revision)
    pub version: String,
    /// SHA256 hash of file content (base64 encoded)
    pub sha256: Option<String>,
    /// Whether the file is a directory
    pub is_directory: bool,
}

/// Storage backend trait for WOPI operations.
#[async_trait]
pub trait StorageBackend: Send + Sync {
    /// Read a file's content.
    async fn read_file(&self, file_id: &str) -> Result<Vec<u8>>;

    /// Write content to a file.
    async fn write_file(&self, file_id: &str, content: &[u8]) -> Result<String>;

    /// Get metadata about a file.
    async fn get_file_info(&self, file_id: &str) -> Result<FileMetadata>;

    /// List files in a directory.
    async fn list_files(&self, path: &str) -> Result<Vec<FileMetadata>>;

    /// Delete a file.
    async fn delete_file(&self, file_id: &str) -> Result<()>;

    /// Rename a file.
    async fn rename_file(&self, file_id: &str, new_name: &str) -> Result<()>;
}

/// File system based storage implementation.
#[derive(Clone)]
pub struct FileSystemStorage {
    /// Base directory for file storage
    base_path: PathBuf,
}

impl FileSystemStorage {
    /// Create a new file system storage.
    pub fn new(base_path: impl AsRef<Path>) -> Result<Self> {
        let base_path = base_path.as_ref().to_path_buf();

        std::fs::create_dir_all(&base_path)?;

        Ok(Self { base_path })
    }

    /// Get the full path for a file ID.
    fn get_file_path(&self, file_id: &str) -> PathBuf {
        self.base_path.join(file_id)
    }

    /// Calculate SHA256 hash of content.
    fn calculate_sha256(content: &[u8]) -> String {
        use base64::prelude::*;
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(content);
        let result = hasher.finalize();
        BASE64_STANDARD.encode(result)
    }
}

#[async_trait]
impl StorageBackend for FileSystemStorage {
    async fn read_file(&self, file_id: &str) -> Result<Vec<u8>> {
        let path = self.get_file_path(file_id);

        if !path.exists() {
            return Err(WopiError::FileNotFound(file_id.to_string()));
        }

        let mut file = fs::File::open(&path).await?;
        let metadata = file.metadata().await?;
        let mut buffer = vec![0; metadata.len() as usize];
        file.read_exact(&mut buffer).await?;

        Ok(buffer)
    }

    async fn write_file(&self, file_id: &str, content: &[u8]) -> Result<String> {
        let path = self.get_file_path(file_id);

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).await?;
            }
        }

        let mut file = fs::File::create(&path).await?;
        file.write_all(content).await?;
        file.flush().await?;

        // Generate version from file modification time
        let metadata = fs::metadata(&path).await?;
        let modified = metadata.modified()?;
        let version = format!("{:?}", modified);

        Ok(version)
    }

    async fn get_file_info(&self, file_id: &str) -> Result<FileMetadata> {
        let path = self.get_file_path(file_id);

        if !path.exists() {
            return Err(WopiError::FileNotFound(file_id.to_string()));
        }

        let metadata = fs::metadata(&path).await?;
        let is_directory = metadata.is_dir();
        let size = if is_directory {
            0
        } else {
            metadata.len() as i64
        };

        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(file_id)
            .to_string();

        let modified = metadata.modified()?;
        let version = format!("{:?}", modified);

        let sha256 = if !is_directory {
            let content = self.read_file(file_id).await?;
            Some(Self::calculate_sha256(&content))
        } else {
            None
        };

        Ok(FileMetadata {
            name,
            size,
            version,
            sha256,
            is_directory,
        })
    }

    async fn list_files(&self, path: &str) -> Result<Vec<FileMetadata>> {
        let full_path = self.base_path.join(path);

        if !full_path.exists() {
            return Err(WopiError::FileNotFound(path.to_string()));
        }

        let mut entries = Vec::new();
        let mut dir = fs::read_dir(&full_path).await?;

        while let Some(entry) = dir.next_entry().await? {
            let metadata = entry.metadata().await?;
            let name = entry.file_name().to_string_lossy().to_string();

            let is_directory = metadata.is_dir();
            let size = if is_directory {
                0
            } else {
                metadata.len() as i64
            };

            let modified = metadata.modified()?;
            let version = format!("{:?}", modified);

            let sha256 = if !is_directory {
                let content = match entry.path().to_str() {
                    Some(path_str) => self.read_file(path_str).await?,
                    None => {
                        // Skip files with non-UTF-8 paths
                        entries.push(FileMetadata {
                            name: "?".to_string(),
                            size: metadata.len() as i64,
                            version: format!("{:?}", modified),
                            is_directory,
                            sha256: None,
                        });
                        continue;
                    }
                };
                Some(Self::calculate_sha256(&content))
            } else {
                None
            };

            entries.push(FileMetadata {
                name,
                size,
                version,
                sha256,
                is_directory,
            });
        }

        Ok(entries)
    }

    async fn delete_file(&self, file_id: &str) -> Result<()> {
        let path = self.get_file_path(file_id);

        if !path.exists() {
            return Err(WopiError::FileNotFound(file_id.to_string()));
        }

        if path.is_dir() {
            fs::remove_dir_all(&path).await?;
        } else {
            fs::remove_file(&path).await?;
        }

        Ok(())
    }

    async fn rename_file(&self, file_id: &str, new_name: &str) -> Result<()> {
        let old_path = self.get_file_path(file_id);

        if !old_path.exists() {
            return Err(WopiError::FileNotFound(file_id.to_string()));
        }

        let new_path = old_path
            .parent()
            .map(|p| p.join(new_name))
            .unwrap_or_else(|| PathBuf::from(new_name));

        fs::rename(&old_path, &new_path).await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_file_system_storage() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();

        // Write a file
        let content = b"Hello, World!";
        let file_id = "test.txt";
        let version = storage.write_file(file_id, content).await.unwrap();

        assert!(!version.is_empty());

        // Read the file
        let read_content = storage.read_file(file_id).await.unwrap();
        assert_eq!(read_content, content.to_vec());

        // Get file info
        let info = storage.get_file_info(file_id).await.unwrap();
        assert_eq!(info.name, "test.txt");
        assert_eq!(info.size, 13);
        assert_eq!(info.version, version);
        assert!(info.sha256.is_some());
    }

    #[tokio::test]
    async fn test_file_not_found() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();

        let result = storage.read_file("nonexistent.txt").await;
        assert!(matches!(result, Err(WopiError::FileNotFound(_))));

        let result = storage.get_file_info("nonexistent.txt").await;
        assert!(matches!(result, Err(WopiError::FileNotFound(_))));
    }
}

// File system backend for WebDAV

use crate::{models::Prop, Result, WebDavError};
use chrono::{DateTime, Utc};
use sha2::Sha256;
use std::path::{Path, PathBuf};
use tokio::fs;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// WebDAV resource information.
#[derive(Debug, Clone)]
pub struct DavResource {
    /// Resource path
    pub path: String,
    /// Whether it's a collection (directory)
    pub is_collection: bool,
    /// Display name
    pub display_name: String,
    /// Content length (for files)
    pub content_length: Option<u64>,
    /// Content type (for files)
    pub content_type: Option<String>,
    /// Last modified timestamp
    pub last_modified: DateTime<Utc>,
    /// ETag
    pub etag: String,
}

impl DavResource {
    /// Convert to Prop for PROPFIND response.
    pub fn to_prop(&self) -> Prop {
        if self.is_collection {
            Prop::for_collection(
                self.display_name.clone(),
                self.last_modified,
                self.etag.clone(),
            )
        } else {
            Prop::for_file(
                self.display_name.clone(),
                self.content_length.unwrap_or(0),
                self.last_modified,
                self.content_type
                    .clone()
                    .unwrap_or_else(|| "application/octet-stream".to_string()),
                self.etag.clone(),
            )
        }
    }
}

/// File system backend for WebDAV.
#[derive(Clone)]
pub struct FileSystem {
    /// Base directory for file storage
    base_path: PathBuf,
}

impl FileSystem {
    /// Create a new file system backend.
    pub fn new(base_path: impl AsRef<Path>) -> Result<Self> {
        let base_path = base_path.as_ref().to_path_buf();

        if !base_path.exists() {
            std::fs::create_dir_all(&base_path)?;
        }

        Ok(Self { base_path })
    }

    /// Get the full path for a resource path.
    fn get_full_path(&self, resource_path: &str) -> PathBuf {
        // Remove leading slash and decode URL encoding
        let path = resource_path.strip_prefix('/').unwrap_or(resource_path);
        let decoded = urlencoding::decode(path).unwrap_or_else(|_| path.to_string().into());
        self.base_path.join(decoded.as_ref())
    }

    /// Generate ETag for a resource.
    async fn generate_etag(&self, path: &Path) -> Result<String> {
        use sha2::Digest;

        let metadata = fs::metadata(path).await?;
        let modified = metadata.modified()?;

        let mut hasher = Sha256::new();
        hasher.update(format!("{:?}-{:?}", path, modified).as_bytes());
        let result = hasher.finalize();

        Ok(hex::encode(result))
    }

    /// Detect content type for a file.
    fn detect_content_type(&self, path: &Path) -> String {
        match path.extension().and_then(|ext| ext.to_str()) {
            Some("txt") => "text/plain".to_string(),
            Some("html") | Some("htm") => "text/html".to_string(),
            Some("css") => "text/css".to_string(),
            Some("js") => "application/javascript".to_string(),
            Some("json") => "application/json".to_string(),
            Some("xml") => "application/xml".to_string(),
            Some("pdf") => "application/pdf".to_string(),
            Some("zip") => "application/zip".to_string(),
            Some("jpg") | Some("jpeg") => "image/jpeg".to_string(),
            Some("png") => "image/png".to_string(),
            Some("gif") => "image/gif".to_string(),
            Some("svg") => "image/svg+xml".to_string(),
            Some("doc") | Some("docx") => "application/msword".to_string(),
            Some("xls") | Some("xlsx") => "application/vnd.ms-excel".to_string(),
            Some("ppt") | Some("pptx") => "application/vnd.ms-powerpoint".to_string(),
            _ => "application/octet-stream".to_string(),
        }
    }

    /// Get a resource by path.
    pub async fn get_resource(&self, resource_path: &str) -> Result<DavResource> {
        let full_path = self.get_full_path(resource_path);

        if !full_path.exists() {
            return Err(WebDavError::NotFound(resource_path.to_string()));
        }

        let metadata = fs::metadata(&full_path).await?;
        let is_collection = metadata.is_dir();
        let display_name = full_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let last_modified: DateTime<Utc> = metadata.modified()?.into();
        let etag = self.generate_etag(&full_path).await?;

        let (content_length, content_type) = if is_collection {
            (None, Some("httpd/unix-directory".to_string()))
        } else {
            (
                Some(metadata.len()),
                Some(self.detect_content_type(&full_path)),
            )
        };

        Ok(DavResource {
            path: resource_path.to_string(),
            is_collection,
            display_name,
            content_length,
            content_type,
            last_modified,
            etag,
        })
    }

    /// List resources in a collection.
    pub async fn list_collection(&self, resource_path: &str) -> Result<Vec<DavResource>> {
        let full_path = self.get_full_path(resource_path);

        if !full_path.exists() {
            return Err(WebDavError::NotFound(resource_path.to_string()));
        }

        if !full_path.is_dir() {
            return Err(WebDavError::InvalidRequest(format!(
                "{} is not a collection",
                resource_path
            )));
        }

        let mut resources = Vec::new();
        let mut dir = fs::read_dir(&full_path).await?;

        while let Some(entry) = dir.next_entry().await? {
            let metadata = entry.metadata().await?;
            let is_collection = metadata.is_dir();
            let display_name = entry.file_name().to_str().unwrap_or("").to_string();

            let last_modified: DateTime<Utc> = metadata.modified()?.into();
            let etag = self
                .generate_etag(&full_path.join(display_name.as_str()))
                .await?;

            let (content_length, content_type) = if is_collection {
                (None, Some("httpd/unix-directory".to_string()))
            } else {
                (
                    Some(metadata.len()),
                    Some(self.detect_content_type(&full_path.join(display_name.as_str()))),
                )
            };

            resources.push(DavResource {
                path: format!("{}/", resource_path).replace('\\', "/"),
                is_collection,
                display_name,
                content_length,
                content_type,
                last_modified,
                etag,
            });
        }

        Ok(resources)
    }

    /// Read file content.
    pub async fn read_file(&self, resource_path: &str) -> Result<Vec<u8>> {
        let full_path = self.get_full_path(resource_path);

        if !full_path.exists() {
            return Err(WebDavError::NotFound(resource_path.to_string()));
        }

        if full_path.is_dir() {
            return Err(WebDavError::InvalidRequest(format!(
                "{} is a collection",
                resource_path
            )));
        }

        let mut file = fs::File::open(&full_path).await?;
        let metadata = file.metadata().await?;
        let mut buffer = vec![0; metadata.len() as usize];
        file.read_exact(&mut buffer).await?;

        Ok(buffer)
    }

    /// Write file content.
    pub async fn write_file(&self, resource_path: &str, content: &[u8]) -> Result<()> {
        let full_path = self.get_full_path(resource_path);

        // Ensure parent directory exists
        if let Some(parent) = full_path.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent)?;
            }
        }

        let mut file = fs::File::create(&full_path).await?;
        file.write_all(content).await?;
        file.flush().await?;

        Ok(())
    }

    /// Create a collection (directory).
    pub async fn create_collection(&self, resource_path: &str) -> Result<()> {
        let full_path = self.get_full_path(resource_path);

        if full_path.exists() {
            return Err(WebDavError::InvalidRequest(format!(
                "{} already exists",
                resource_path
            )));
        }

        fs::create_dir_all(&full_path).await?;

        Ok(())
    }

    /// Delete a resource.
    pub async fn delete_resource(&self, resource_path: &str) -> Result<()> {
        let full_path = self.get_full_path(resource_path);

        if !full_path.exists() {
            return Err(WebDavError::NotFound(resource_path.to_string()));
        }

        if full_path.is_dir() {
            fs::remove_dir_all(&full_path).await?;
        } else {
            fs::remove_file(&full_path).await?;
        }

        Ok(())
    }

    /// Copy a resource.
    pub async fn copy_resource(&self, source_path: &str, dest_path: &str) -> Result<()> {
        let full_source = self.get_full_path(source_path);
        let full_dest = self.get_full_path(dest_path);

        if !full_source.exists() {
            return Err(WebDavError::NotFound(source_path.to_string()));
        }

        if full_dest.exists() {
            return Err(WebDavError::InvalidRequest(format!(
                "{} already exists",
                dest_path
            )));
        }

        // Ensure parent directory exists
        if let Some(parent) = full_dest.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent)?;
            }
        }

        if full_source.is_dir() {
            std::fs::create_dir_all(&full_dest)?;
            copy_dir_recursive(&full_source, &full_dest)?;
        } else {
            fs::copy(&full_source, &full_dest).await?;
        }

        Ok(())
    }

    /// Move a resource.
    pub async fn move_resource(&self, source_path: &str, dest_path: &str) -> Result<()> {
        let full_source = self.get_full_path(source_path);
        let full_dest = self.get_full_path(dest_path);

        if !full_source.exists() {
            return Err(WebDavError::NotFound(source_path.to_string()));
        }

        if full_dest.exists() {
            return Err(WebDavError::InvalidRequest(format!(
                "{} already exists",
                dest_path
            )));
        }

        // Ensure parent directory exists
        if let Some(parent) = full_dest.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent)?;
            }
        }

        fs::rename(&full_source, &full_dest).await?;

        Ok(())
    }
}

/// Recursively copy a directory (synchronous helper).
fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let name = entry.file_name();
        let name_str = name.to_str().ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::InvalidData, "Invalid filename")
        })?;
        let src_path = src.join(name_str);
        let dst_path = dst.join(name_str);

        let file_type = entry.file_type()?;

        if file_type.is_dir() {
            std::fs::create_dir_all(&dst_path)?;
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_filesystem_operations() {
        let temp_dir = tempfile::TempDir::new().unwrap();
        let fs = FileSystem::new(temp_dir.path()).unwrap();

        // Create collection
        fs.create_collection("/testdir").await.unwrap();

        // Write file
        fs.write_file("/testdir/test.txt", b"Hello, World!")
            .await
            .unwrap();

        // Read file
        let content = fs.read_file("/testdir/test.txt").await.unwrap();
        assert_eq!(content, b"Hello, World!");

        // List collection
        let resources = fs.list_collection("/testdir").await.unwrap();
        assert_eq!(resources.len(), 1);

        // Delete file
        fs.delete_resource("/testdir/test.txt").await.unwrap();

        // Copy resource
        fs.copy_resource("/testdir", "/testdir-copy").await.unwrap();

        // Move resource
        fs.move_resource("/testdir-copy", "/testdir-moved")
            .await
            .unwrap();
    }
}

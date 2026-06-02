use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub id: String,
    pub file_id: String,
    pub content_hash: String,
    pub content_blob: Vec<u8>,
    pub agent_name: String,
    pub summary: String,
    pub created_at: String,
}

#[derive(Debug, thiserror::Error)]
pub enum StorageClientError {
    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("unexpected status {status}: {body}")]
    Status { status: u16, body: String },
    #[error("base64 decode failed: {0}")]
    Base64(#[from] base64::DecodeError),
}

type Result<T> = std::result::Result<T, StorageClientError>;

#[derive(Debug, Clone, Serialize)]
pub struct CreateSnapshotRequest {
    pub file_id: String,
    pub content_hash: String,
    pub content_blob: String,
    pub agent_name: String,
    pub summary: String,
}

#[derive(Debug, Clone, Deserialize)]
struct SnapshotResponse {
    id: String,
    file_id: String,
    content_hash: String,
    #[serde(with = "base64_bytes")]
    content_blob: Vec<u8>,
    agent_name: String,
    summary: String,
    created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
struct SnapshotListItem {
    id: String,
    file_id: String,
    content_hash: String,
    agent_name: String,
    summary: String,
    created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
struct SnapshotListResponse {
    snapshots: Vec<SnapshotListItem>,
    #[allow(dead_code)]
    count: usize,
}

mod base64_bytes {
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
    use serde::{Deserialize, Deserializer, Serializer};

    #[allow(dead_code)]
    pub fn serialize<S: Serializer>(data: &Vec<u8>, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&BASE64.encode(data))
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Vec<u8>, D::Error> {
        let s = String::deserialize(d)?;
        BASE64.decode(s).map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone)]
pub struct StorageClient {
    base_url: String,
    http: reqwest::Client,
}

impl StorageClient {
    pub fn new(base_url: String) -> Self {
        let base_url = base_url.trim_end_matches('/').to_string();
        Self {
            base_url,
            http: reqwest::Client::new(),
        }
    }

    pub async fn create_snapshot(
        &self,
        file_id: &str,
        content_hash: &str,
        content_blob: &[u8],
        agent_name: &str,
        summary: &str,
    ) -> Result<String> {
        let body = CreateSnapshotRequest {
            file_id: file_id.to_string(),
            content_hash: content_hash.to_string(),
            content_blob: BASE64.encode(content_blob),
            agent_name: agent_name.to_string(),
            summary: summary.to_string(),
        };

        let resp = self
            .http
            .post(format!("{}/snapshots", self.base_url))
            .json(&body)
            .send()
            .await?;

        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            tracing::error!(status, %body, "create_snapshot failed");
            return Err(StorageClientError::Status { status, body });
        }

        let snapshot: SnapshotResponse = resp.json().await?;
        tracing::info!(snapshot_id = %snapshot.id, file_id = %file_id, "snapshot created");
        Ok(snapshot.id)
    }

    pub async fn list_snapshots(&self, file_id: &str) -> Result<Vec<Snapshot>> {
        let resp = self
            .http
            .get(format!("{}/snapshots/file/{file_id}", self.base_url))
            .send()
            .await?;

        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            tracing::error!(status, %body, file_id, "list_snapshots failed");
            return Err(StorageClientError::Status { status, body });
        }

        let data: SnapshotListResponse = resp.json().await?;
        Ok(data
            .snapshots
            .into_iter()
            .map(|s| Snapshot {
                id: s.id,
                file_id: s.file_id,
                content_hash: s.content_hash,
                content_blob: Vec::new(),
                agent_name: s.agent_name,
                summary: s.summary,
                created_at: s.created_at,
            })
            .collect())
    }

    pub async fn get_snapshot(&self, id: &str) -> Result<Snapshot> {
        let resp = self
            .http
            .get(format!("{}/snapshots/{id}", self.base_url))
            .send()
            .await?;

        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            tracing::error!(status, %body, snapshot_id = id, "get_snapshot failed");
            return Err(StorageClientError::Status { status, body });
        }

        let s: SnapshotResponse = resp.json().await?;
        Ok(Snapshot {
            id: s.id,
            file_id: s.file_id,
            content_hash: s.content_hash,
            content_blob: s.content_blob,
            agent_name: s.agent_name,
            summary: s.summary,
            created_at: s.created_at,
        })
    }

    pub async fn delete_snapshot(&self, id: &str) -> Result<()> {
        let resp = self
            .http
            .delete(format!("{}/snapshots/{id}", self.base_url))
            .send()
            .await?;

        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            tracing::error!(status, %body, snapshot_id = id, "delete_snapshot failed");
            return Err(StorageClientError::Status { status, body });
        }

        tracing::info!(snapshot_id = id, "snapshot deleted");
        Ok(())
    }

    pub async fn list_files(&self) -> Result<Vec<serde_json::Value>> {
        let resp = self
            .http
            .get(format!("{}/files", self.base_url))
            .send()
            .await?;

        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            tracing::error!(status, %body, "list_files failed");
            return Err(StorageClientError::Status { status, body });
        }

        #[derive(Deserialize)]
        struct FileListResponse {
            files: Vec<serde_json::Value>,
        }

        let data: FileListResponse = resp.json().await?;
        Ok(data.files)
    }

    pub async fn get_file(&self, id: &str) -> Result<serde_json::Value> {
        let resp = self
            .http
            .get(format!("{}/files/{id}", self.base_url))
            .send()
            .await?;

        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            tracing::error!(status, %body, file_id = id, "get_file failed");
            return Err(StorageClientError::Status { status, body });
        }

        let file: serde_json::Value = resp.json().await?;
        Ok(file)
    }

    pub async fn read_content(&self, id: &str) -> Result<String> {
        let resp = self
            .http
            .get(format!("{}/files/{id}/content", self.base_url))
            .send()
            .await?;

        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            tracing::error!(status, %body, file_id = id, "read_content failed");
            return Err(StorageClientError::Status { status, body });
        }

        let content = resp.text().await?;
        Ok(content)
    }

    pub async fn create_file(&self, name: &str, content: &str) -> Result<String> {
        #[derive(Serialize)]
        struct CreateFileRequest {
            name: String,
            content_type: String,
            data: String,
        }

        let body = CreateFileRequest {
            name: name.to_string(),
            content_type: "text/plain".to_string(),
            data: content.to_string(),
        };

        let resp = self
            .http
            .post(format!("{}/files", self.base_url))
            .json(&body)
            .send()
            .await?;

        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            tracing::error!(status, %body, "create_file failed");
            return Err(StorageClientError::Status { status, body });
        }

        #[derive(Deserialize)]
        struct CreateFileResponse {
            file: serde_json::Value,
        }

        let data: CreateFileResponse = resp.json().await?;
        data.file
            .get("id")
            .and_then(|id| id.as_str())
            .map(|id| id.to_string())
            .ok_or_else(|| {
                tracing::error!("create_file response missing id");
                StorageClientError::Status {
                    status,
                    body: "Response missing file id".to_string(),
                }
            })
    }

    pub async fn write_file(&self, id: &str, content: &str) -> Result<()> {
        let body = serde_json::json!({
            "content": content
        });

        let resp = self
            .http
            .put(format!("{}/files/{id}", self.base_url))
            .json(&body)
            .send()
            .await?;

        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            tracing::error!(status, %body, file_id = id, "write_file failed");
            return Err(StorageClientError::Status { status, body });
        }

        tracing::info!(file_id = id, "file written");
        Ok(())
    }

    pub async fn restore_snapshot(&self, file_id: &str, snapshot_id: &str) -> Result<()> {
        let snapshot = self.get_snapshot(snapshot_id).await?;

        let body = serde_json::json!({
            "content": BASE64.encode(&snapshot.content_blob)
        });

        let resp = self
            .http
            .put(format!("{}/files/{file_id}", self.base_url))
            .json(&body)
            .send()
            .await?;

        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            tracing::error!(status, %body, file_id, snapshot_id, "restore_snapshot failed");
            return Err(StorageClientError::Status { status, body });
        }

        tracing::info!(file_id, snapshot_id, "snapshot restored to file");
        Ok(())
    }

    // ── Comment API methods ──

    /// List comments for a document.
    pub async fn list_comments(&self, document_id: &str) -> Result<serde_json::Value> {
        let resp = self
            .http
            .get(format!("{}/documents/{document_id}/comments", self.base_url))
            .send()
            .await?;

        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            tracing::error!(status, %body, document_id, "list_comments failed");
            return Err(StorageClientError::Status { status, body });
        }

        let data: serde_json::Value = resp.json().await?;
        Ok(data)
    }

    /// Add a top-level comment to a document. Returns the created comment JSON.
    pub async fn add_comment(
        &self,
        document_id: &str,
        author_id: &str,
        author_name: &str,
        text: &str,
    ) -> Result<serde_json::Value> {
        let body = serde_json::json!({
            "document_id": document_id,
            "author_id": author_id,
            "author_name": author_name,
            "text": text
        });

        let resp = self
            .http
            .post(format!("{}/documents/{document_id}/comments", self.base_url))
            .json(&body)
            .send()
            .await?;

        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            tracing::error!(status, %body, document_id, "add_comment failed");
            return Err(StorageClientError::Status { status, body });
        }

        let data: serde_json::Value = resp.json().await?;
        Ok(data)
    }

    /// Add a reply to an existing comment.
    pub async fn add_reply(
        &self,
        document_id: &str,
        parent_id: &str,
        author_id: &str,
        author_name: &str,
        text: &str,
    ) -> Result<serde_json::Value> {
        let body = serde_json::json!({
            "document_id": document_id,
            "parent_id": parent_id,
            "author_id": author_id,
            "author_name": author_name,
            "text": text
        });

        let resp = self
            .http
            .post(format!(
                "{}/documents/{document_id}/comments/{parent_id}/reply",
                self.base_url
            ))
            .json(&body)
            .send()
            .await?;

        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            tracing::error!(status, %body, document_id, parent_id, "add_reply failed");
            return Err(StorageClientError::Status { status, body });
        }

        let data: serde_json::Value = resp.json().await?;
        Ok(data)
    }

    /// Resolve a comment by id.
    pub async fn resolve_comment(&self, comment_id: &str) -> Result<()> {
        let resp = self
            .http
            .post(format!("{}/comments/{comment_id}/resolve", self.base_url))
            .send()
            .await?;

        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            tracing::error!(status, %body, comment_id, "resolve_comment failed");
            return Err(StorageClientError::Status { status, body });
        }

        tracing::info!(comment_id, "comment resolved");
        Ok(())
    }

    /// List mentions for a specific agent name.
    pub async fn list_mentions(&self, agent_name: &str) -> Result<serde_json::Value> {
        let resp = self
            .http
            .get(format!("{}/mentions/{agent_name}", self.base_url))
            .send()
            .await?;

        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            tracing::error!(status, %body, agent_name, "list_mentions failed");
            return Err(StorageClientError::Status { status, body });
        }

        let data: serde_json::Value = resp.json().await?;
        Ok(data)
    }
}

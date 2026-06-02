//! storage-service — World-Office document storage microservice.
//!
//! Manages document persistence and retrieval backed by local filesystem.
//! Provides CRUD endpoints for file storage.

pub mod repository;

use axum::{
    Json, Router,
    body::Bytes,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{delete, get, post},
};
use repository::StorageRepository;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;
use tokio::sync::Mutex;
use uuid::Uuid;

/// Stored file metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredFile {
    pub id: String,
    pub name: String,
    pub content_type: String,
    pub size: usize,
    pub created_at: String,
    pub storage_path: String,
}

/// Application state.
#[derive(Clone)]
pub struct AppState {
    pub repo: Arc<Mutex<StorageRepository>>,
    pub storage_dir: PathBuf,
}

/// Health check response.
#[derive(Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub service: &'static str,
    pub version: &'static str,
}

/// Upload file request.
#[derive(Deserialize)]
pub struct UploadRequest {
    pub name: String,
    #[serde(default = "default_content_type")]
    pub content_type: String,
    pub data: String, // base64-encoded
}

fn default_content_type() -> String {
    "application/octet-stream".into()
}

/// Upload response.
#[derive(Serialize)]
pub struct UploadResponse {
    pub file: StoredFile,
}

/// Error response.
#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub code: u16,
}

/// File list response.
#[derive(Serialize)]
pub struct FileListResponse {
    pub files: Vec<StoredFile>,
    pub count: usize,
}

/// Create a fresh AppState for testing with a temp directory and an in-memory DB.
pub fn create_test_state() -> Arc<AppState> {
    let dir = std::env::temp_dir().join(format!("wo-storage-test-{}", Uuid::new_v4()));
    Arc::new(AppState {
        repo: Arc::new(Mutex::new(
            StorageRepository::new_in_memory().expect("failed to open in-memory db"),
        )),
        storage_dir: dir,
    })
}

/// GET /health — liveness check.
pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "storage-service",
        version: env!("CARGO_PKG_VERSION"),
    })
}

/// POST /files — upload a file (base64-encoded body).
pub async fn upload_file(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<UploadRequest>,
) -> Result<(StatusCode, Json<UploadResponse>), (StatusCode, Json<ErrorResponse>)> {
    if payload.name.is_empty() || payload.data.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "name and data are required".into(),
                code: 400,
            }),
        ));
    }

    // Decode base64 data
    let file_data =
        match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &payload.data) {
            Ok(data) => data,
            Err(e) => {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse {
                        error: format!("Invalid base64 data: {}", e),
                        code: 400,
                    }),
                ));
            }
        };

    let file_id = Uuid::new_v4().to_string();
    let storage_path = state.storage_dir.join(&file_id);

    // Ensure storage directory exists
    if let Err(e) = fs::create_dir_all(&state.storage_dir).await {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to create storage directory: {}", e),
                code: 500,
            }),
        ));
    }

    // Write file to disk
    if let Err(e) = fs::write(&storage_path, &file_data).await {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to write file: {}", e),
                code: 500,
            }),
        ));
    }

    let stored_file = StoredFile {
        id: file_id.clone(),
        name: payload.name,
        content_type: payload.content_type,
        size: file_data.len(),
        created_at: chrono::Utc::now().to_rfc3339(),
        storage_path: storage_path.to_string_lossy().to_string(),
    };

    {
        let mut repo = state.repo.lock().await;
        if let Err(e) = repo.insert(&stored_file) {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Failed to persist file metadata: {}", e),
                    code: 500,
                }),
            ));
        }
    }

    tracing::info!(file_id = %file_id, name = %stored_file.name, size = stored_file.size, "file uploaded");

    Ok((
        StatusCode::CREATED,
        Json(UploadResponse { file: stored_file }),
    ))
}

/// GET /files — list all files.
pub async fn list_files(
    State(state): State<Arc<AppState>>,
) -> Result<Json<FileListResponse>, (StatusCode, Json<ErrorResponse>)> {
    let repo = state.repo.lock().await;
    match repo.list() {
        Ok(all) => {
            let count = all.len();
            Ok(Json(FileListResponse { files: all, count }))
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to list files: {}", e),
                code: 500,
            }),
        )),
    }
}

/// GET /files/{id} — get file metadata.
pub async fn get_file(
    State(state): State<Arc<AppState>>,
    Path(file_id): Path<String>,
) -> Result<Json<StoredFile>, (StatusCode, Json<ErrorResponse>)> {
    let repo = state.repo.lock().await;
    match repo.get(&file_id) {
        Ok(Some(file)) => Ok(Json(file)),
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("File {} not found", file_id),
                code: 404,
            }),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to get file: {}", e),
                code: 500,
            }),
        )),
    }
}

/// GET /files/{id}/content — get raw file bytes.
pub async fn get_file_content(
    State(state): State<Arc<AppState>>,
    Path(file_id): Path<String>,
) -> Result<(StatusCode, HeaderMap, Bytes), (StatusCode, Json<ErrorResponse>)> {
    let file = {
        let repo = state.repo.lock().await;
        match repo.get(&file_id) {
            Ok(Some(f)) => f,
            Ok(None) => {
                return Err((
                    StatusCode::NOT_FOUND,
                    Json(ErrorResponse {
                        error: format!("File {} not found", file_id),
                        code: 404,
                    }),
                ));
            }
            Err(e) => {
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("Failed to get file: {}", e),
                        code: 500,
                    }),
                ));
            }
        }
    };

    let data = match fs::read(&file.storage_path).await {
        Ok(d) => d,
        Err(e) => {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Failed to read file: {}", e),
                    code: 500,
                }),
            ));
        }
    };

    let mut headers = HeaderMap::new();
    headers.insert(
        "content-type",
        file.content_type
            .parse()
            .unwrap_or_else(|_| "application/octet-stream".parse().unwrap()),
    );
    headers.insert("content-length", data.len().to_string().parse().unwrap());

    Ok((StatusCode::OK, headers, Bytes::from(data)))
}

/// DELETE /files/{id} — delete a file.
pub async fn delete_file(
    State(state): State<Arc<AppState>>,
    Path(file_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let (storage_path, name) = {
        let repo = state.repo.lock().await;
        match repo.get(&file_id) {
            Ok(Some(f)) => (f.storage_path, f.name),
            Ok(None) => {
                return Err((
                    StatusCode::NOT_FOUND,
                    Json(ErrorResponse {
                        error: format!("File {} not found", file_id),
                        code: 404,
                    }),
                ));
            }
            Err(e) => {
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("Failed to get file: {}", e),
                        code: 500,
                    }),
                ));
            }
        }
    };

    // Remove from DB
    {
        let mut repo = state.repo.lock().await;
        if let Err(e) = repo.delete(&file_id) {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Failed to delete file metadata: {}", e),
                    code: 500,
                }),
            ));
        }
    }

    // Best-effort file deletion from disk
    if let Err(e) = fs::remove_file(&storage_path).await {
        tracing::warn!(path = %storage_path, error = %e, "failed to delete file from disk");
    }

    tracing::info!(file_id = %file_id, name = %name, "file deleted");

    Ok(Json(serde_json::json!({
        "deleted": true,
        "id": file_id,
    })))
}

/// PUT /files/{id} — update an existing file's content.
pub async fn update_file(
    State(state): State<Arc<AppState>>,
    Path(file_id): Path<String>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    // Verify file exists
    let file = {
        let repo = state.repo.lock().await;
        match repo.get(&file_id) {
            Ok(Some(f)) => f,
            Ok(None) => {
                return Err((
                    StatusCode::NOT_FOUND,
                    Json(ErrorResponse {
                        error: format!("File {} not found", file_id),
                        code: 404,
                    }),
                ));
            }
            Err(e) => {
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("Failed to get file: {}", e),
                        code: 500,
                    }),
                ));
            }
        }
    };

    // Extract and decode content
    let content = match payload.get("content").and_then(|v| v.as_str()) {
        Some(content) => content,
        None => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "content field is required".to_string(),
                    code: 400,
                }),
            ));
        }
    };

    let new_data = match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, content)
    {
        Ok(data) => data,
        Err(e) => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: format!("Invalid base64 data: {}", e),
                    code: 400,
                }),
            ));
        }
    };

    // Write to disk
    if let Err(e) = fs::write(&file.storage_path, &new_data).await {
        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to write file to disk: {}", e),
                code: 500,
            }),
        ));
    }

    // Update repository metadata (size)
    let mut repo = state.repo.lock().await;
    if let Err(e) = repo.update_size(&file_id, new_data.len()) {
        tracing::warn!(error = %e, file_id = %file_id, "Failed to update file size metadata");
    }
    if let Err(e) = repo.touch(&file_id) {
        tracing::warn!(error = %e, file_id = %file_id, "Failed to update file timestamp");
    }

    tracing::info!(file_id = %file_id, size = new_data.len(), "file updated");

    Ok(Json(serde_json::json!({
        "updated": true,
        "id": file_id,
        "size": new_data.len(),
    })))
}

/// Snapshot response for metadata queries (without content_blob).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotMetadataResponse {
    pub id: String,
    pub file_id: String,
    pub content_hash: String,
    pub agent_name: String,
    pub summary: String,
    pub created_at: String,
}

/// Snapshot list response.
#[derive(Debug, Clone, Serialize)]
pub struct SnapshotListResponse {
    pub snapshots: Vec<SnapshotMetadataResponse>,
    pub count: usize,
}

/// Create comment request.
#[derive(Debug, Deserialize)]
pub struct CreateCommentRequest {
    pub author_id: String,
    pub author_name: String,
    pub text: String,
    pub mentions: Option<String>,
}

/// Add reply request.
#[derive(Debug, Deserialize)]
pub struct AddReplyRequest {
    pub author_id: String,
    pub author_name: String,
    pub text: String,
    pub mentions: Option<String>,
}

/// Comment response.
#[derive(Debug, Clone, Serialize)]
pub struct CommentResponse {
    pub id: String,
    pub document_id: String,
    pub parent_id: Option<String>,
    pub author_id: String,
    pub author_name: String,
    pub text: String,
    pub resolved: bool,
    pub mentions: String,
    pub created_at: String,
    pub replies: Vec<CommentResponse>,
}

/// Comment list response.
#[derive(Debug, Clone, Serialize)]
pub struct CommentListResponse {
    pub comments: Vec<CommentResponse>,
    pub count: usize,
}

/// Create snapshot request from MCP server.
#[derive(Debug, Deserialize)]
pub struct CreateSnapshotRequest {
    pub file_id: String,
    pub content_hash: String,
    pub content_blob: String, // base64-encoded content
    pub agent_name: String,
    pub summary: String,
}

/// Snapshot creation response.
#[derive(Debug, Serialize)]
pub struct CreateSnapshotResponse {
    pub id: String,
    pub file_id: String,
}

/// POST /snapshots — create a snapshot (called by MCP server).
pub async fn create_snapshot(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateSnapshotRequest>,
) -> Result<(StatusCode, Json<CreateSnapshotResponse>), (StatusCode, Json<ErrorResponse>)> {
    // Decode base64 content
    let content_blob = match base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        &req.content_blob,
    ) {
        Ok(data) => data,
        Err(e) => {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: format!("Invalid base64 data: {}", e),
                    code: 400,
                }),
            ));
        }
    };

    let mut repo = state.repo.lock().await;

    // Check if file exists
    match repo.get(&req.file_id) {
        Ok(Some(_)) => {}
        Ok(None) => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: format!("File {} not found", req.file_id),
                    code: 404,
                }),
            ));
        }
        Err(e) => {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Failed to check file: {}", e),
                    code: 500,
                }),
            ));
        }
    }

    // Check dedup: does a snapshot with this content hash already exist?
    match repo.snapshot_hash_exists(&req.file_id, &req.content_hash) {
        Ok(true) => {
            tracing::info!(
                file_id = %req.file_id,
                hash = %req.content_hash,
                "skip snapshot creation (dedup)"
            );
            // Return the existing snapshot ID (need to query for it)
            let snapshots = repo.list_snapshots(&req.file_id, 100).unwrap();
            if let Some(existing) = snapshots
                .iter()
                .find(|s| s.content_hash == req.content_hash)
            {
                return Ok((
                    StatusCode::OK,
                    Json(CreateSnapshotResponse {
                        id: existing.id.clone(),
                        file_id: req.file_id,
                    }),
                ));
            }
        }
        Ok(false) => {}
        Err(e) => {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Failed to check snapshot hash: {}", e),
                    code: 500,
                }),
            ));
        }
    }

    // Insert the snapshot
    match repo.insert_snapshot(
        &req.file_id,
        &req.content_hash,
        &content_blob,
        &req.agent_name,
        &req.summary,
    ) {
        Ok(snapshot_id) => {
            // Prune old snapshots (keep last 50)
            if let Err(e) = repo.prune_snapshots(&req.file_id, 50) {
                tracing::warn!(error = %e, file_id = %req.file_id, "Failed to prune old snapshots");
            }

            tracing::info!(
                snapshot_id = %snapshot_id,
                file_id = %req.file_id,
                "snapshot created"
            );
            Ok((
                StatusCode::CREATED,
                Json(CreateSnapshotResponse {
                    id: snapshot_id,
                    file_id: req.file_id,
                }),
            ))
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to create snapshot: {}", e),
                code: 500,
            }),
        )),
    }
}

/// GET /snapshots/file/{file_id} — list snapshots for a file (called by MCP server).
pub async fn list_snapshots_for_file(
    State(state): State<Arc<AppState>>,
    Path(file_id): Path<String>,
) -> Result<Json<SnapshotListResponse>, (StatusCode, Json<ErrorResponse>)> {
    let repo = state.repo.lock().await;

    // Check if file exists
    match repo.get(&file_id) {
        Ok(Some(_)) => {}
        Ok(None) => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: format!("File {} not found", file_id),
                    code: 404,
                }),
            ));
        }
        Err(e) => {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Failed to check file: {}", e),
                    code: 500,
                }),
            ));
        }
    }

    match repo.list_snapshots(&file_id, 50) {
        Ok(snapshots) => {
            let count = snapshots.len();
            let response_snapshots = snapshots
                .into_iter()
                .map(|s| SnapshotMetadataResponse {
                    id: s.id,
                    file_id: s.file_id,
                    content_hash: s.content_hash,
                    agent_name: s.agent_name,
                    summary: s.summary,
                    created_at: s.created_at,
                })
                .collect();

            Ok(Json(SnapshotListResponse {
                snapshots: response_snapshots,
                count,
            }))
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to list snapshots: {}", e),
                code: 500,
            }),
        )),
    }
}

/// GET /snapshots/{id} — get a snapshot by ID (called by MCP server).
pub async fn get_snapshot_by_id(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let repo = state.repo.lock().await;

    match repo.get_snapshot(&id) {
        Ok(Some(snapshot)) => {
            // Response includes base64-encoded content_blob for consistency with MCP client
            let response = serde_json::json!({
                "id": snapshot.id,
                "file_id": snapshot.file_id,
                "content_hash": snapshot.content_hash,
                "content_blob": base64::Engine::encode(
                    &base64::engine::general_purpose::STANDARD,
                    &snapshot.content_blob
                ),
                "agent_name": snapshot.agent_name,
                "summary": snapshot.summary,
                "created_at": snapshot.created_at,
            });
            Ok(Json(response))
        }
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("Snapshot {} not found", id),
                code: 404,
            }),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to get snapshot: {}", e),
                code: 500,
            }),
        )),
    }
}

/// DELETE /snapshots/{id} — delete a snapshot (called by MCP server).
pub async fn delete_snapshot_by_id(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let mut repo = state.repo.lock().await;

    // Verify snapshot exists
    match repo.get_snapshot(&id) {
        Ok(Some(_)) => {
            repo.delete_snapshot(&id).map_err(|e| {
                tracing::error!(error = %e, snapshot_id = %id, "Failed to delete snapshot");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("Failed to delete snapshot: {}", e),
                        code: 500,
                    }),
                )
            })?;

            tracing::info!(snapshot_id = %id, "snapshot deleted");
            Ok(Json(serde_json::json!({
                "deleted": true,
                "id": id,
            })))
        }
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("Snapshot {} not found", id),
                code: 404,
            }),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to get snapshot: {}", e),
                code: 500,
            }),
        )),
    }
}

/// GET /documents/{id}/comments — list top-level comments with threaded replies.
pub async fn list_comments(
    State(state): State<Arc<AppState>>,
    Path(document_id): Path<String>,
) -> Result<Json<CommentListResponse>, (StatusCode, Json<ErrorResponse>)> {
    let repo = state.repo.lock().await;
    match repo.list_comments(&document_id) {
        Ok(top_level) => {
            let mut responses = Vec::new();
            for comment in top_level {
                let replies = repo.list_replies(&comment.id).unwrap_or_default();
                let reply_responses: Vec<CommentResponse> = replies
                    .into_iter()
                    .map(|r| CommentResponse {
                        id: r.id,
                        document_id: r.document_id,
                        parent_id: r.parent_id,
                        author_id: r.author_id,
                        author_name: r.author_name,
                        text: r.text,
                        resolved: r.resolved,
                        mentions: r.mentions,
                        created_at: r.created_at,
                        replies: vec![],
                    })
                    .collect();
                responses.push(CommentResponse {
                    id: comment.id,
                    document_id: comment.document_id,
                    parent_id: comment.parent_id,
                    author_id: comment.author_id,
                    author_name: comment.author_name,
                    text: comment.text,
                    resolved: comment.resolved,
                    mentions: comment.mentions,
                    created_at: comment.created_at,
                    replies: reply_responses,
                });
            }
            let count = responses.len();
            Ok(Json(CommentListResponse {
                comments: responses,
                count,
            }))
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to list comments: {}", e),
                code: 500,
            }),
        )),
    }
}

/// POST /documents/{id}/comments — create a top-level comment.
pub async fn create_comment(
    State(state): State<Arc<AppState>>,
    Path(document_id): Path<String>,
    Json(payload): Json<CreateCommentRequest>,
) -> Result<(StatusCode, Json<CommentResponse>), (StatusCode, Json<ErrorResponse>)> {
    let mentions = payload.mentions.unwrap_or_else(|| "[]".to_string());
    let mut repo = state.repo.lock().await;
    match repo.insert_comment(
        &document_id,
        None,
        &payload.author_id,
        &payload.author_name,
        &payload.text,
        &mentions,
    ) {
        Ok(id) => {
            let created_at = chrono::Utc::now().to_rfc3339();
            tracing::info!(comment_id = %id, document_id = %document_id, "comment created");
            Ok((
                StatusCode::CREATED,
                Json(CommentResponse {
                    id,
                    document_id,
                    parent_id: None,
                    author_id: payload.author_id,
                    author_name: payload.author_name,
                    text: payload.text,
                    resolved: false,
                    mentions,
                    created_at,
                    replies: vec![],
                }),
            ))
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to create comment: {}", e),
                code: 500,
            }),
        )),
    }
}

/// POST /comments/{id}/replies — add a reply to a comment.
pub async fn add_reply(
    State(state): State<Arc<AppState>>,
    Path(comment_id): Path<String>,
    Json(payload): Json<AddReplyRequest>,
) -> Result<(StatusCode, Json<CommentResponse>), (StatusCode, Json<ErrorResponse>)> {
    // Verify parent comment exists
    let document_id = {
        let repo = state.repo.lock().await;
        match repo.get_comment(&comment_id) {
            Ok(Some(parent)) => parent.document_id,
            Ok(None) => {
                return Err((
                    StatusCode::NOT_FOUND,
                    Json(ErrorResponse {
                        error: format!("Comment {} not found", comment_id),
                        code: 404,
                    }),
                ));
            }
            Err(e) => {
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("Failed to get comment: {}", e),
                        code: 500,
                    }),
                ));
            }
        }
    };

    let mentions = payload.mentions.unwrap_or_else(|| "[]".to_string());
    let mut repo = state.repo.lock().await;
    match repo.insert_comment(
        &document_id,
        Some(&comment_id),
        &payload.author_id,
        &payload.author_name,
        &payload.text,
        &mentions,
    ) {
        Ok(id) => {
            let created_at = chrono::Utc::now().to_rfc3339();
            tracing::info!(reply_id = %id, parent_id = %comment_id, "reply created");
            Ok((
                StatusCode::CREATED,
                Json(CommentResponse {
                    id,
                    document_id,
                    parent_id: Some(comment_id),
                    author_id: payload.author_id,
                    author_name: payload.author_name,
                    text: payload.text,
                    resolved: false,
                    mentions,
                    created_at,
                    replies: vec![],
                }),
            ))
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to create reply: {}", e),
                code: 500,
            }),
        )),
    }
}

/// POST /comments/{id}/resolve — resolve a comment.
pub async fn resolve_comment(
    State(state): State<Arc<AppState>>,
    Path(comment_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let mut repo = state.repo.lock().await;
    match repo.resolve_comment(&comment_id) {
        Ok(true) => {
            tracing::info!(comment_id = %comment_id, "comment resolved");
            Ok(Json(serde_json::json!({
                "resolved": true,
                "id": comment_id,
            })))
        }
        Ok(false) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("Comment {} not found", comment_id),
                code: 404,
            }),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to resolve comment: {}", e),
                code: 500,
            }),
        )),
    }
}

/// DELETE /comments/{id} — delete a comment.
pub async fn delete_comment(
    State(state): State<Arc<AppState>>,
    Path(comment_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let mut repo = state.repo.lock().await;
    match repo.delete_comment(&comment_id) {
        Ok(true) => {
            tracing::info!(comment_id = %comment_id, "comment deleted");
            Ok(Json(serde_json::json!({
                "deleted": true,
                "id": comment_id,
            })))
        }
        Ok(false) => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: format!("Comment {} not found", comment_id),
                code: 404,
            }),
        )),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to delete comment: {}", e),
                code: 500,
            }),
        )),
    }
}

/// GET /mentions/{agent_name} — list unresolved comments that mention a given agent.
pub async fn list_mentions(
    State(state): State<Arc<AppState>>,
    Path(agent_name): Path<String>,
) -> Result<Json<CommentListResponse>, (StatusCode, Json<ErrorResponse>)> {
    let repo = state.repo.lock().await;
    match repo.list_mentions(&agent_name) {
        Ok(comments) => {
            let responses: Vec<CommentResponse> = comments
                .into_iter()
                .map(|c| CommentResponse {
                    id: c.id,
                    document_id: c.document_id,
                    parent_id: c.parent_id,
                    author_id: c.author_id,
                    author_name: c.author_name,
                    text: c.text,
                    resolved: c.resolved,
                    mentions: c.mentions,
                    created_at: c.created_at,
                    replies: vec![],
                })
                .collect();
            let count = responses.len();
            Ok(Json(CommentListResponse {
                comments: responses,
                count,
            }))
        }
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to list mentions: {}", e),
                code: 500,
            }),
        )),
    }
}

/// Build the full application router.
pub fn app(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/files", post(upload_file).get(list_files))
        .route(
            "/files/{id}",
            get(get_file).put(update_file).delete(delete_file),
        )
        .route("/files/{id}/content", get(get_file_content))
        .route("/snapshots", post(create_snapshot))
        .route("/snapshots/file/{file_id}", get(list_snapshots_for_file))
        .route(
            "/snapshots/{id}",
            get(get_snapshot_by_id).delete(delete_snapshot_by_id),
        )
        .route("/documents/{document_id}/comments", get(list_comments).post(create_comment))
        .route("/comments/{comment_id}/replies", post(add_reply))
        .route("/comments/{comment_id}/resolve", post(resolve_comment))
        .route("/comments/{comment_id}", delete(delete_comment))
        .route("/mentions/{agent_name}", get(list_mentions))
        .with_state(state)
}

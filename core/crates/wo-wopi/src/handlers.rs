// WOPI endpoint handlers

use crate::{
    models::{
        CheckFileInfoResponse, FileLockRequest, FileUnlockRequest, PutFileResponse, WopiOverride,
    },
    storage::StorageBackend,
    Result, WopiError,
};
use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::HeaderMap,
    response::{IntoResponse, Json, Response},
};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use wo_x2t::ConversionRouter;

/// Shared conversion router instance (cached after first use).
fn conversion_router() -> &'static ConversionRouter {
    static ROUTER: OnceLock<ConversionRouter> = OnceLock::new();
    ROUTER.get_or_init(ConversionRouter::new)
}

/// State shared by all WOPI handlers.
#[derive(Clone)]
pub struct WopiState<S: StorageBackend> {
    /// Storage backend for file operations
    pub storage: Arc<S>,
    /// Access token validator (simplified - in production, use proper auth)
    pub access_tokens: HashMap<String, String>,
}

impl<S: StorageBackend> WopiState<S> {
    /// Create a new WOPI state.
    pub fn new(storage: S) -> Self {
        Self {
            storage: Arc::new(storage),
            access_tokens: HashMap::new(),
        }
    }

    /// Validate an access token.
    pub fn validate_token(&self, token: &str) -> Result<String> {
        self.access_tokens
            .get(token)
            .cloned()
            .ok_or_else(|| WopiError::InvalidToken(token.to_string()))
    }

    /// Add an access token.
    pub fn add_token(&mut self, token: String, user_id: String) {
        self.access_tokens.insert(token, user_id);
    }
}

/// Query parameters for WOPI requests.
#[derive(Debug, Deserialize)]
pub struct WopiQueryParams {
    /// Access token for authentication
    access_token: String,
    /// Output format (e.g., "svg", "pdf", "html")
    #[serde(default = "default_format")]
    format: String,
}

fn default_format() -> String {
    "native".to_string()
}

/// CheckFileInfo handler.
///
/// GET /wopi/files/{file_id}
pub async fn check_file_info<S: StorageBackend>(
    State(state): State<Arc<WopiState<S>>>,
    Path(file_id): Path<String>,
    Query(params): Query<WopiQueryParams>,
) -> Result<Json<CheckFileInfoResponse>> {
    // Validate access token
    let user_id = state.validate_token(&params.access_token)?;

    // Get file metadata
    let metadata = state.storage.get_file_info(&file_id).await?;

    // Build response
    let response = CheckFileInfoResponse::new(
        metadata.name.clone(),
        metadata.size,
        "owner".to_string(), // In production, get from storage
        user_id,
    )
    .with_version(metadata.version.clone())
    .with_sha256(metadata.sha256.unwrap_or_default())
    .with_user_can_write(true)
    .with_supports_update(true);

    Ok(Json(response))
}

/// GetFile handler.
///
/// GET /wopi/files/{file_id}/contents
pub async fn get_file<S: StorageBackend>(
    State(state): State<Arc<WopiState<S>>>,
    Path(file_id): Path<String>,
    Query(params): Query<WopiQueryParams>,
) -> Result<Body> {
    // Validate access token
    state.validate_token(&params.access_token)?;

    // Read file content
    let content = state.storage.read_file(&file_id).await?;

    // Convert to requested format if needed
    let output = if params.format == "svg" {
        // Determine source format from file extension
        let source_format = infer_format(&file_id)?;

        // Convert to SVG using the shared conversion router
        let result = conversion_router().convert(&source_format, "svg", &content);
        match result.status {
            wo_x2t::ConversionStatus::Success | wo_x2t::ConversionStatus::PartialSuccess => {
                result
                    .output
                    .ok_or_else(|| {
                        WopiError::InvalidRequest("SVG conversion produced no output".to_string())
                    })?
                    .data
            }
            _ => {
                let err_msg = result
                    .error
                    .unwrap_or_else(|| "Unknown conversion error".to_string());
                return Err(WopiError::InvalidRequest(format!(
                    "SVG conversion failed: {}",
                    err_msg
                )));
            }
        }
    } else {
        // Return native format
        content
    };

    Ok(Body::from(output))
}

/// Infer source format from file ID (e.g., "document.docx" -> "docx")
fn infer_format(file_id: &str) -> Result<String> {
    let ext = file_id
        .rsplit('.')
        .next()
        .ok_or_else(|| WopiError::InvalidRequest("No file extension".to_string()))?;

    match ext.to_lowercase().as_str() {
        "docx" => Ok("docx".to_string()),
        "pptx" => Ok("pptx".to_string()),
        "xlsx" => Ok("xlsx".to_string()),
        "odt" => Ok("odt".to_string()),
        "ods" => Ok("ods".to_string()),
        "odp" => Ok("odp".to_string()),
        "vsdx" => Ok("vsdx".to_string()),
        "pdf" => Ok("pdf".to_string()),
        _ => Err(WopiError::InvalidRequest(format!("Unsupported format: {}", ext))),
    }
}

/// PutFile handler.
///
/// POST /wopi/files/{file_id}/contents
pub async fn put_file<S: StorageBackend>(
    State(state): State<Arc<WopiState<S>>>,
    Path(file_id): Path<String>,
    Query(params): Query<WopiQueryParams>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Json<PutFileResponse>> {
    // Validate access token
    state.validate_token(&params.access_token)?;

    // Check lock header
    let current_lock = headers.get("X-WOPI-Lock").and_then(|v| v.to_str().ok());

    if let Some(_lock) = current_lock {
        // In production, verify the lock matches
        tracing::debug!("PutFile with lock: {:?}", _lock);
    }

    // Write file content
    let version = state.storage.write_file(&file_id, &body).await?;

    Ok(Json(PutFileResponse::new(version)))
}

/// Lock handler.
///
/// POST /wopi/files/{file_id} with X-WOPI-Override: LOCK
pub async fn lock_file<S: StorageBackend>(
    State(state): State<Arc<WopiState<S>>>,
    Path(file_id): Path<String>,
    Query(params): Query<WopiQueryParams>,
    _headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Response> {
    // Validate access token
    state.validate_token(&params.access_token)?;

    // Parse lock request
    let lock_request: FileLockRequest = serde_json::from_slice(&body)?;

    // In production, implement actual locking logic
    tracing::info!(
        "Lock requested for file {} with lock_id {}",
        file_id,
        lock_request.lock_id
    );

    // Return 200 OK on success
    Ok(axum::http::StatusCode::OK.into_response())
}

/// Unlock handler.
///
/// POST /wopi/files/{file_id} with X-WOPI-Override: UNLOCK
pub async fn unlock_file<S: StorageBackend>(
    State(state): State<Arc<WopiState<S>>>,
    Path(file_id): Path<String>,
    Query(params): Query<WopiQueryParams>,
    _headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Response> {
    // Validate access token
    state.validate_token(&params.access_token)?;

    // Parse unlock request
    let unlock_request: FileUnlockRequest = serde_json::from_slice(&body)?;

    // In production, implement actual unlocking logic
    tracing::info!(
        "Unlock requested for file {} with lock_id {}",
        file_id,
        unlock_request.lock_id
    );

    // Return 200 OK on success
    Ok(axum::http::StatusCode::OK.into_response())
}

/// Generic WOPI operation handler for POST to /wopi/files/{file_id}
pub async fn wopi_operation<S: StorageBackend>(
    State(state): State<Arc<WopiState<S>>>,
    Path(file_id): Path<String>,
    Query(params): Query<WopiQueryParams>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Response> {
    // Validate access token
    state.validate_token(&params.access_token)?;

    // Get WOPI override from header
    let override_header = headers
        .get("X-WOPI-Override")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| WopiError::InvalidRequest("Missing X-WOPI-Override header".to_string()))?;

    match WopiOverride::try_from(override_header) {
        Ok(WopiOverride::Lock) => {
            lock_file(State(state), Path(file_id), Query(params), headers, body).await
        }
        Ok(WopiOverride::Unlock) => {
            unlock_file(State(state), Path(file_id), Query(params), headers, body).await
        }
        Ok(op) => Err(WopiError::InvalidRequest(format!(
            "Operation {:?} not yet implemented",
            op
        ))),
        Err(e) => Err(WopiError::InvalidRequest(format!(
            "Invalid WOPI override: {}",
            e
        ))),
    }
}

/// Error handler for WOPI errors.
pub fn handle_wopi_error(err: WopiError) -> (axum::http::StatusCode, String) {
    match err {
        WopiError::FileNotFound(msg) => (axum::http::StatusCode::NOT_FOUND, msg),
        WopiError::AccessDenied(msg) => (axum::http::StatusCode::FORBIDDEN, msg),
        WopiError::InvalidToken(msg) => (axum::http::StatusCode::UNAUTHORIZED, msg),
        WopiError::LockConflict(msg) => (axum::http::StatusCode::CONFLICT, msg),
        WopiError::InvalidRequest(msg) => (axum::http::StatusCode::BAD_REQUEST, msg),
        WopiError::Io(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        WopiError::Serialization(e) => {
            (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        }
        WopiError::Storage(msg) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, msg),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::FileSystemStorage;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_check_file_info() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();
        let mut state = WopiState::new(storage);

        // Add a test file
        state
            .storage
            .write_file("test.txt", b"Hello, World!")
            .await
            .unwrap();

        state.add_token("test_token".to_string(), "user1".to_string());

        // This would require running the actual handler through axum test setup
        // For now, we just test the underlying logic
        let user_id = state.validate_token("test_token").unwrap();
        assert_eq!(user_id, "user1");
    }
}

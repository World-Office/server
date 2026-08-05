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
        _ => Err(WopiError::InvalidRequest(format!(
            "Unsupported format: {}",
            ext
        ))),
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

/// DeleteFile handler.
///
/// POST /wopi/files/{file_id} with X-WOPI-Override: DELETE_FILE
pub async fn delete_file<S: StorageBackend>(
    State(state): State<Arc<WopiState<S>>>,
    Path(file_id): Path<String>,
    Query(params): Query<WopiQueryParams>,
) -> Result<Response> {
    state.validate_token(&params.access_token)?;
    state.storage.delete_file(&file_id).await?;
    tracing::info!("Deleted file {}", file_id);
    Ok(axum::http::StatusCode::OK.into_response())
}

/// RenameFile handler.
///
/// POST /wopi/files/{file_id} with X-WOPI-Override: RENAME_FILE
/// Body: { "new_name": "filename.docx" }
pub async fn rename_file<S: StorageBackend>(
    State(state): State<Arc<WopiState<S>>>,
    Path(file_id): Path<String>,
    Query(params): Query<WopiQueryParams>,
    _headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Response> {
    state.validate_token(&params.access_token)?;

    #[derive(serde::Deserialize)]
    struct RenameRequest {
        new_name: String,
    }

    let request: RenameRequest = serde_json::from_slice(&body)
        .map_err(|e| WopiError::InvalidRequest(format!("Invalid rename request: {}", e)))?;

    state.storage.rename_file(&file_id, &request.new_name).await?;
    tracing::info!("Renamed file {} to {}", file_id, request.new_name);

    Ok(Json(serde_json::json!({
        "status": "ok",
        "new_name": request.new_name,
    }))
    .into_response())
}

/// PutRelativeFile handler (Save As / Save Copy).
///
/// POST /wopi/files/{file_id} with X-WOPI-Override: PUT_RELATIVE_FILE
/// Body: { "contents": "<base64>", "suggested_name": "copy.docx" }
pub async fn put_relative_file<S: StorageBackend>(
    State(state): State<Arc<WopiState<S>>>,
    Path(file_id): Path<String>,
    Query(params): Query<WopiQueryParams>,
    _headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Response> {
    state.validate_token(&params.access_token)?;

    #[derive(serde::Deserialize)]
    struct PutRelativeRequest {
        contents: String,
        suggested_name: Option<String>,
    }

    let request: PutRelativeRequest = serde_json::from_slice(&body)
        .map_err(|e| WopiError::InvalidRequest(format!("Invalid put_relative_file request: {}", e)))?;

    // Decode base64 contents
    use base64::Engine;
    let content = base64::engine::general_purpose::STANDARD
        .decode(&request.contents)
        .map_err(|e| WopiError::InvalidRequest(format!("Invalid base64: {}", e)))?;

    // Generate a new file ID based on the suggested name
    let new_name = request.suggested_name.unwrap_or_else(|| "copy.docx".to_string());
    let new_file_id = format!("{}-{}", file_id, chrono::Utc::now().timestamp());

    state.storage.write_file(&new_file_id, &content).await?;
    tracing::info!("PutRelativeFile: created {} as {}", new_file_id, new_name);

    Ok(Json(serde_json::json!({
        "status": "ok",
        "file_id": new_file_id,
        "name": new_name,
    }))
    .into_response())
}

/// GetShareUrl handler.
///
/// POST /wopi/files/{file_id} with X-WOPI-Override: GET_SHARE_URL
/// Returns a share URL for the file.
pub async fn get_share_url<S: StorageBackend>(
    State(state): State<Arc<WopiState<S>>>,
    Path(file_id): Path<String>,
    Query(params): Query<WopiQueryParams>,
) -> Result<Response> {
    state.validate_token(&params.access_token)?;

    // Verify file exists
    let _info = state.storage.get_file_info(&file_id).await?;

    // Build a share URL — in production this would be a signed URL
    let share_url = format!("/wopi/share/{}?token={}", file_id, params.access_token);
    tracing::info!("GetShareUrl for file {}", file_id);

    Ok(Json(serde_json::json!({
        "status": "ok",
        "share_url": share_url,
    }))
    .into_response())
}
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
        Ok(WopiOverride::DeleteFile) => {
            delete_file(State(state), Path(file_id), Query(params)).await
        }
        Ok(WopiOverride::RenameFile) => {
            rename_file(State(state), Path(file_id), Query(params), headers, body).await
        }
        Ok(WopiOverride::PutRelativeFile) => {
            put_relative_file(State(state), Path(file_id), Query(params), headers, body).await
        }
        Ok(WopiOverride::GetShareUrl) => {
            get_share_url(State(state), Path(file_id), Query(params)).await
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
    use axum::{
        body::Body,
        http::{Request, StatusCode},
        routing::get,
        Router,
    };
    use std::sync::Arc;
    use tempfile::TempDir;
    use tower::ServiceExt;

    // ---------------------------------------------------------------------------
    // WopiState tests
    // ---------------------------------------------------------------------------

    #[test]
    fn test_wopi_state_new_has_empty_tokens() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();
        let state = WopiState::new(storage);
        assert!(state.access_tokens.is_empty());
    }

    #[test]
    fn test_wopi_state_add_and_validate_token() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();
        let mut state = WopiState::new(storage);

        state.add_token("tok1".to_string(), "user_a".to_string());
        assert_eq!(state.validate_token("tok1").unwrap(), "user_a");
    }

    #[test]
    fn test_wopi_state_validate_token_invalid() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();
        let state = WopiState::new(storage);

        let err = state.validate_token("bad").unwrap_err();
        assert!(matches!(err, WopiError::InvalidToken(_)));
    }

    // ---------------------------------------------------------------------------
    // infer_format tests
    // ---------------------------------------------------------------------------

    #[test]
    fn test_infer_format_supported() {
        for (file_id, expected) in &[
            ("doc.docx", "docx"),
            ("pres.pptx", "pptx"),
            ("sheet.xlsx", "xlsx"),
            ("text.odt", "odt"),
            ("spreadsheet.ods", "ods"),
            ("slides.odp", "odp"),
            ("diagram.vsdx", "vsdx"),
            ("doc.pdf", "pdf"),
        ] {
            assert_eq!(
                infer_format(file_id).unwrap(),
                *expected,
                "mismatch for {file_id}"
            );
        }
    }

    #[test]
    fn test_infer_format_case_insensitive() {
        assert_eq!(infer_format("FILE.DOCX").unwrap(), "docx");
        assert_eq!(infer_format("file.PPTX").unwrap(), "pptx");
        assert_eq!(infer_format("file.PDF").unwrap(), "pdf");
    }

    #[test]
    fn test_infer_format_no_extension() {
        let err = infer_format("noext").unwrap_err();
        assert!(matches!(err, WopiError::InvalidRequest(_)));
    }

    #[test]
    fn test_infer_format_unsupported() {
        let err = infer_format("file.xyz").unwrap_err();
        assert!(matches!(err, WopiError::InvalidRequest(_)));
    }

    // ---------------------------------------------------------------------------
    // default_format tests
    // ---------------------------------------------------------------------------

    #[test]
    fn test_default_format_is_native() {
        assert_eq!(default_format(), "native");
    }

    // ---------------------------------------------------------------------------
    // handle_wopi_error tests
    // ---------------------------------------------------------------------------

    #[test]
    fn test_handle_wopi_error_maps_to_correct_status() {
        let cases: Vec<(WopiError, StatusCode)> = vec![
            (WopiError::FileNotFound("x".into()), StatusCode::NOT_FOUND),
            (WopiError::AccessDenied("x".into()), StatusCode::FORBIDDEN),
            (
                WopiError::InvalidToken("x".into()),
                StatusCode::UNAUTHORIZED,
            ),
            (WopiError::LockConflict("x".into()), StatusCode::CONFLICT),
            (
                WopiError::InvalidRequest("x".into()),
                StatusCode::BAD_REQUEST,
            ),
        ];
        for (err, expected_status) in cases {
            let (status, _) = handle_wopi_error(err);
            assert_eq!(status, expected_status);
        }
    }

    #[test]
    fn test_handle_wopi_error_io_is_500() {
        let err = WopiError::Io(std::io::Error::other("disk full"));
        let (status, msg) = handle_wopi_error(err);
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(msg, "disk full");
    }

    #[test]
    fn test_handle_wopi_error_serialization_is_500() {
        // Invalid JSON to trigger a serde error
        let err =
            WopiError::Serialization(serde_json::from_str::<serde_json::Value>("").unwrap_err());
        let (status, _) = handle_wopi_error(err);
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[test]
    fn test_handle_wopi_error_storage_is_500() {
        let err = WopiError::Storage("db error".into());
        let (status, msg) = handle_wopi_error(err);
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(msg, "db error");
    }

    // ---------------------------------------------------------------------------
    // check_file_info handler integration test
    // ---------------------------------------------------------------------------

    #[tokio::test]
    async fn test_check_file_info_handler_success() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();
        storage.write_file("doc.txt", b"hello").await.unwrap();

        let mut state = WopiState::new(storage);
        state.add_token("valid".to_string(), "user42".to_string());

        let app = Router::new()
            .route(
                "/wopi/files/{file_id}",
                get(check_file_info::<FileSystemStorage>),
            )
            .with_state(Arc::new(state));

        let req = Request::builder()
            .uri("/wopi/files/doc.txt?access_token=valid")
            .body(Body::empty())
            .unwrap();

        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);

        let body = axum::body::to_bytes(res.into_body(), 10_000).await.unwrap();
        let info: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(info["BaseFileName"], "doc.txt");
        assert_eq!(info["Size"], 5);
        assert_eq!(info["UserId"], "user42");
    }

    #[tokio::test]
    async fn test_check_file_info_invalid_token() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();
        let state = WopiState::new(storage);

        let app = Router::new()
            .route(
                "/wopi/files/{file_id}",
                get(check_file_info::<FileSystemStorage>),
            )
            .with_state(Arc::new(state));

        let req = Request::builder()
            .uri("/wopi/files/doc.txt?access_token=bogus")
            .body(Body::empty())
            .unwrap();

        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn test_check_file_info_file_not_found() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();
        let mut state = WopiState::new(storage);
        state.add_token("t".to_string(), "u1".to_string());

        let app = Router::new()
            .route(
                "/wopi/files/{file_id}",
                get(check_file_info::<FileSystemStorage>),
            )
            .with_state(Arc::new(state));

        let req = Request::builder()
            .uri("/wopi/files/missing.txt?access_token=t")
            .body(Body::empty())
            .unwrap();

        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }

    // ---------------------------------------------------------------------------
    // get_file handler integration test
    // ---------------------------------------------------------------------------

    #[tokio::test]
    async fn test_get_file_handler_success() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();
        storage.write_file("doc.txt", b"hello world").await.unwrap();

        let mut state = WopiState::new(storage);
        state.add_token("t".to_string(), "u1".to_string());

        let app = Router::new()
            .route(
                "/wopi/files/{file_id}/contents",
                get(get_file::<FileSystemStorage>),
            )
            .with_state(Arc::new(state));

        let req = Request::builder()
            .uri("/wopi/files/doc.txt/contents?access_token=t")
            .body(Body::empty())
            .unwrap();

        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);

        let body = axum::body::to_bytes(res.into_body(), 10_000).await.unwrap();
        assert_eq!(&body[..], b"hello world");
    }

    #[tokio::test]
    async fn test_get_file_handler_invalid_token() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();
        let state = WopiState::new(storage);

        let app = Router::new()
            .route(
                "/wopi/files/{file_id}/contents",
                get(get_file::<FileSystemStorage>),
            )
            .with_state(Arc::new(state));

        let req = Request::builder()
            .uri("/wopi/files/doc.txt/contents?access_token=bogus")
            .body(Body::empty())
            .unwrap();

        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn test_get_file_handler_not_found() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();
        let mut state = WopiState::new(storage);
        state.add_token("t".to_string(), "u1".to_string());

        let app = Router::new()
            .route(
                "/wopi/files/{file_id}/contents",
                get(get_file::<FileSystemStorage>),
            )
            .with_state(Arc::new(state));

        let req = Request::builder()
            .uri("/wopi/files/missing.txt/contents?access_token=t")
            .body(Body::empty())
            .unwrap();

        let res = app.oneshot(req).await.unwrap();
        assert_eq!(res.status(), StatusCode::NOT_FOUND);
    }

    // ---------------------------------------------------------------------------
    // put_file handler integration test
    // ---------------------------------------------------------------------------

    #[tokio::test]
    async fn test_storage_write_and_verify() {
        // Test the core storage write logic that put_file relies on
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();

        let content = b"new content";
        let version = storage.write_file("testdoc", content).await.unwrap();
        assert!(!version.is_empty());

        let read_back = storage.read_file("testdoc").await.unwrap();
        assert_eq!(read_back, content);
    }

    // ---------------------------------------------------------------------------
    // Storage-level tests (to cover delete_file, rename_file, list_files)
    // ---------------------------------------------------------------------------

    #[tokio::test]
    async fn test_storage_list_files() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();
        storage.write_file("a.txt", b"aaa").await.unwrap();
        storage.write_file("b.txt", b"bbb").await.unwrap();

        let files = storage.list_files(".").await.unwrap();
        assert!(!files.is_empty());
        assert!(files.iter().any(|f| f.name == "a.txt"));
    }

    #[tokio::test]
    async fn test_storage_list_files_not_found() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();
        let err = storage.list_files("nonexistent").await.unwrap_err();
        assert!(matches!(err, WopiError::FileNotFound(_)));
    }

    #[tokio::test]
    async fn test_storage_delete_file() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();
        storage.write_file("del.txt", b"x").await.unwrap();

        storage.delete_file("del.txt").await.unwrap();
        let err = storage.read_file("del.txt").await.unwrap_err();
        assert!(matches!(err, WopiError::FileNotFound(_)));
    }

    #[tokio::test]
    async fn test_storage_delete_not_found() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();
        let err = storage.delete_file("ghost.txt").await.unwrap_err();
        assert!(matches!(err, WopiError::FileNotFound(_)));
    }

    #[tokio::test]
    async fn test_storage_rename_file() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();
        storage.write_file("old.txt", b"x").await.unwrap();

        storage.rename_file("old.txt", "new.txt").await.unwrap();
        // Old file should be gone
        assert!(storage.read_file("old.txt").await.is_err());
        // New file should exist
        let data = storage.read_file("new.txt").await.unwrap();
        assert_eq!(data, b"x");
    }

    #[tokio::test]
    async fn test_storage_rename_not_found() {
        let temp_dir = TempDir::new().unwrap();
        let storage = FileSystemStorage::new(temp_dir.path()).unwrap();
        let err = storage.rename_file("ghost.txt", "x.txt").await.unwrap_err();
        assert!(matches!(err, WopiError::FileNotFound(_)));
    }
}

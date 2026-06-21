// wo-wopi — World-Office WOPI server implementation
//
// This crate implements the MS-WOPI (Web Application Open Platform Interface) protocol
// for Microsoft Office Online integration. It provides a WOPI server with core endpoints
// for CheckFileInfo, GetFile, PutFile, Lock, and Unlock operations.

pub mod handlers;
pub mod models;
pub mod server;
pub mod storage;

pub use models::{
    CheckFileInfoResponse, FileLockRequest, FileUnlockRequest, LockInfo, PutFileResponse,
};
pub use server::WopiServer;
pub use storage::{FileSystemStorage, StorageBackend};

/// Result type for WOPI operations.
pub type Result<T> = std::result::Result<T, WopiError>;

/// WOPI server errors.
#[derive(Debug, thiserror::Error)]
pub enum WopiError {
    #[error("File not found: {0}")]
    FileNotFound(String),

    #[error("Access denied for file: {0}")]
    AccessDenied(String),

    #[error("Invalid access token: {0}")]
    InvalidToken(String),

    #[error("Lock conflict: {0}")]
    LockConflict(String),

    #[error("Invalid request: {0}")]
    InvalidRequest(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Storage error: {0}")]
    Storage(String),
}

impl axum::response::IntoResponse for WopiError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match self {
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
        };
        (status, message).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::StatusCode;
    use axum::response::IntoResponse;

    #[test]
    fn test_wopi_error_into_response_file_not_found() {
        let err = WopiError::FileNotFound("missing.txt".into());
        let resp = err.into_response();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn test_wopi_error_into_response_access_denied() {
        let err = WopiError::AccessDenied("forbidden".into());
        let resp = err.into_response();
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }

    #[test]
    fn test_wopi_error_into_response_invalid_token() {
        let err = WopiError::InvalidToken("bad".into());
        let resp = err.into_response();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn test_wopi_error_into_response_lock_conflict() {
        let err = WopiError::LockConflict("locked".into());
        let resp = err.into_response();
        assert_eq!(resp.status(), StatusCode::CONFLICT);
    }

    #[test]
    fn test_wopi_error_into_response_invalid_request() {
        let err = WopiError::InvalidRequest("bad req".into());
        let resp = err.into_response();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn test_wopi_error_into_response_io() {
        let io_err = std::io::Error::new(std::io::ErrorKind::Other, "disk error");
        let err = WopiError::Io(io_err);
        let resp = err.into_response();
        assert_eq!(resp.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[test]
    fn test_wopi_error_into_response_serialization() {
        let json_err = serde_json::from_str::<serde_json::Value>("").unwrap_err();
        let err = WopiError::Serialization(json_err);
        let resp = err.into_response();
        assert_eq!(resp.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[test]
    fn test_wopi_error_into_response_storage() {
        let err = WopiError::Storage("disk full".into());
        let resp = err.into_response();
        assert_eq!(resp.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }
}

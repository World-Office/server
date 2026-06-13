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

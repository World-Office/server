// wo-webdav — World-Office WebDAV server implementation
//
// This crate implements RFC 4918 WebDAV (Web Distributed Authoring and Versioning)
// for remote file management. It provides a WebDAV server with support for
// PROPFIND, PROPPATCH, GET, PUT, DELETE, MKCOL, COPY, MOVE, LOCK, and UNLOCK operations.

pub mod fs;
pub mod handlers;
pub mod lock;
pub mod models;
pub mod server;
pub mod storage;

pub use fs::{DavResource, FileSystem};
pub use lock::{LockInfo, LockManager};
pub use models::{
    ActiveLock, DavResponse, LockInfo as WebDavLockInfo, LockScope, LockToken, LockType,
    MultiStatus, Owner, Prop, PropFind, PropStat,
};
pub use server::WebDavServer;
pub use storage::{LockDepth, ResourceInfo, WebDavStorage};

/// Result type for WebDAV operations.
pub type Result<T> = std::result::Result<T, WebDavError>;

/// WebDAV server errors.
#[derive(Debug, thiserror::Error)]
pub enum WebDavError {
    #[error("Resource not found: {0}")]
    NotFound(String),

    #[error("Access denied: {0}")]
    AccessDenied(String),

    #[error("Lock conflict: {0}")]
    LockConflict(String),

    #[error("Invalid request: {0}")]
    InvalidRequest(String),

    #[error("Precondition failed: {0}")]
    PreconditionFailed(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("XML error: {0}")]
    Xml(String),

    #[error("Storage error: {0}")]
    Storage(#[from] anyhow::Error),

    #[error("File system error: {0}")]
    FileSystem(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

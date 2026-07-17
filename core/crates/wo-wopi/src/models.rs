// WOPI request/response models

use serde::{Deserialize, Serialize};

/// Response for CheckFileInfo operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CheckFileInfoResponse {
    /// The base name of the file including extension
    #[serde(rename = "BaseFileName")]
    pub base_file_name: String,

    /// The size of the file in bytes
    #[serde(rename = "Size")]
    pub size: i64,

    /// Unique identifier for the owner of the file
    #[serde(rename = "OwnerId")]
    pub owner_id: String,

    /// Unique identifier for the user accessing the file
    #[serde(rename = "UserId")]
    pub user_id: String,

    // ── UI-rendering fields (required by WOPI clients) ──

    /// Display name shown in the editor UI
    #[serde(rename = "UserFriendlyName", skip_serializing_if = "Option::is_none")]
    pub user_friendly_name: Option<String>,

    /// Version of the file
    #[serde(rename = "Version", skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,

    /// Last modification time in ISO 8601 format
    #[serde(rename = "LastModifiedTime", skip_serializing_if = "Option::is_none")]
    pub last_modified_time: Option<String>,

    /// SHA256 hash of the file content (base64 encoded)
    #[serde(rename = "Sha256", skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,

    // ── Breadcrumb and navigation ──

    /// Breadcrumb document name
    #[serde(rename = "BreadcrumbDocName", skip_serializing_if = "Option::is_none")]
    pub breadcrumb_doc_name: Option<String>,

    /// URL to return to when closing the document
    #[serde(rename = "CloseUrl", skip_serializing_if = "Option::is_none")]
    pub close_url: Option<String>,

    /// Direct download URL for the file content
    #[serde(rename = "FileUrl", skip_serializing_if = "Option::is_none")]
    pub file_url: Option<String>,

    // ── Auth ──

    /// Authentication identifier from the host
    #[serde(rename = "HostAuthenticationId", skip_serializing_if = "Option::is_none")]
    pub host_authentication_id: Option<String>,

    // ── Capabilities ──

    /// Whether the user can write to the file
    #[serde(rename = "UserCanWrite", default)]
    pub user_can_write: bool,

    /// Whether the file supports update operations
    #[serde(rename = "SupportsUpdate", default)]
    pub supports_update: bool,

    /// Whether the server supports locking
    #[serde(rename = "SupportsLocks", default)]
    pub supports_locks: bool,

    /// Whether the user can rename the file
    #[serde(rename = "UserCanRename", default)]
    pub user_can_rename: bool,

    /// Whether the user can delete the file
    #[serde(rename = "UserCanDelete", default)]
    pub user_can_delete: bool,

    /// Whether the user can NOT write relative files (default true = disabled)
    #[serde(rename = "UserCanNotWriteRelative", default = "default_true")]
    pub user_can_not_write_relative: bool,

    /// Whether the server supports co-authoring
    #[serde(rename = "SupportsCoauth", default)]
    pub supports_coauth: bool,

    /// Whether to disable print in the editor
    #[serde(rename = "DisablePrint", default)]
    pub disable_print: bool,

    /// Whether to disable copy in the editor
    #[serde(rename = "DisableCopy", default)]
    pub disable_copy: bool,
}

fn default_true() -> bool {
    true
}

impl CheckFileInfoResponse {
    pub fn new(base_file_name: String, size: i64, owner_id: String, user_id: String) -> Self {
        Self {
            base_file_name,
            size,
            owner_id,
            user_id,
            user_friendly_name: None,
            version: None,
            last_modified_time: None,
            sha256: None,
            breadcrumb_doc_name: None,
            close_url: None,
            file_url: None,
            host_authentication_id: None,
            user_can_write: false,
            supports_update: false,
            supports_locks: true,
            user_can_rename: false,
            user_can_delete: false,
            user_can_not_write_relative: true,
            supports_coauth: false,
            disable_print: false,
            disable_copy: false,
        }
    }

    pub fn with_version(mut self, version: String) -> Self {
        self.version = Some(version);
        self
    }

    pub fn with_sha256(mut self, sha256: String) -> Self {
        self.sha256 = Some(sha256);
        self
    }

    pub fn with_user_can_write(mut self, user_can_write: bool) -> Self {
        self.user_can_write = user_can_write;
        self
    }

    pub fn with_supports_update(mut self, supports_update: bool) -> Self {
        self.supports_update = supports_update;
        self
    }

    pub fn with_user_friendly_name(mut self, name: String) -> Self {
        self.user_friendly_name = Some(name);
        self
    }

    pub fn with_last_modified_time(mut self, time: String) -> Self {
        self.last_modified_time = Some(time);
        self
    }

    pub fn with_breadcrumb_doc_name(mut self, name: String) -> Self {
        self.breadcrumb_doc_name = Some(name);
        self
    }

    pub fn with_close_url(mut self, url: String) -> Self {
        self.close_url = Some(url);
        self
    }

    pub fn with_host_authentication_id(mut self, id: String) -> Self {
        self.host_authentication_id = Some(id);
        self
    }

    pub fn with_supports_coauth(mut self, supports_coauth: bool) -> Self {
        self.supports_coauth = supports_coauth;
        self
    }
}

/// Response for PutFile operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct PutFileResponse {
    /// Version of the file after the put operation
    #[serde(rename = "Version")]
    pub version: String,
}

impl PutFileResponse {
    pub fn new(version: String) -> Self {
        Self { version }
    }
}

/// Lock information for a file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct LockInfo {
    /// Lock identifier
    #[serde(rename = "LockId")]
    pub lock_id: String,

    /// Time when the lock was acquired
    #[serde(rename = "LockTimestamp", skip_serializing_if = "Option::is_none")]
    pub lock_timestamp: Option<String>,

    /// User who holds the lock
    #[serde(rename = "LockOwner", skip_serializing_if = "Option::is_none")]
    pub lock_owner: Option<String>,

    /// Duration of the lock in seconds
    #[serde(
        rename = "LockDurationSeconds",
        skip_serializing_if = "Option::is_none"
    )]
    pub lock_duration_seconds: Option<u64>,
}

impl LockInfo {
    pub fn new(lock_id: String) -> Self {
        Self {
            lock_id,
            lock_timestamp: None,
            lock_owner: None,
            lock_duration_seconds: None,
        }
    }

    pub fn with_owner(mut self, owner: String) -> Self {
        self.lock_owner = Some(owner);
        self
    }

    pub fn with_duration(mut self, seconds: u64) -> Self {
        self.lock_duration_seconds = Some(seconds);
        self
    }
}

/// Request body for Lock operation.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct FileLockRequest {
    /// Lock identifier
    #[serde(rename = "LockId")]
    pub lock_id: String,

    /// Expected lock (for refresh)
    #[serde(rename = "ExpectedLockId", skip_serializing_if = "Option::is_none")]
    pub expected_lock_id: Option<String>,
}

impl FileLockRequest {
    pub fn new(lock_id: String) -> Self {
        Self {
            lock_id,
            expected_lock_id: None,
        }
    }
}

/// Request body for Unlock operation.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct FileUnlockRequest {
    /// Lock identifier to unlock
    #[serde(rename = "LockId")]
    pub lock_id: String,
}

impl FileUnlockRequest {
    pub fn new(lock_id: String) -> Self {
        Self { lock_id }
    }
}

/// WOPI operation types (from X-WOPI-Override header).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WopiOverride {
    CheckFileInfo,
    GetFile,
    PutFile,
    Lock,
    Unlock,
    PutRelativeFile,
    DeleteFile,
    RenameFile,
    GetShareUrl,
}

impl TryFrom<&str> for WopiOverride {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "CHECK_FILE_INFO" => Ok(WopiOverride::CheckFileInfo),
            "GET_FILE" => Ok(WopiOverride::GetFile),
            "PUT_FILE" => Ok(WopiOverride::PutFile),
            "LOCK" => Ok(WopiOverride::Lock),
            "UNLOCK" => Ok(WopiOverride::Unlock),
            "PUT_RELATIVE_FILE" => Ok(WopiOverride::PutRelativeFile),
            "DELETE_FILE" => Ok(WopiOverride::DeleteFile),
            "RENAME_FILE" => Ok(WopiOverride::RenameFile),
            "GET_SHARE_URL" => Ok(WopiOverride::GetShareUrl),
            _ => Err(format!("Unknown WOPI override: {}", value)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_file_info_response() {
        let response = CheckFileInfoResponse::new(
            "test.docx".to_string(),
            1024,
            "owner1".to_string(),
            "user1".to_string(),
        )
        .with_version("v1".to_string())
        .with_user_can_write(true)
        .with_supports_update(true);

        assert_eq!(response.base_file_name, "test.docx");
        assert_eq!(response.size, 1024);
        assert_eq!(response.version, Some("v1".to_string()));
        assert!(response.user_can_write);
    }

    #[test]
    fn test_lock_info() {
        let lock = LockInfo::new("lock123".to_string())
            .with_owner("user1".to_string())
            .with_duration(300);

        assert_eq!(lock.lock_id, "lock123");
        assert_eq!(lock.lock_owner, Some("user1".to_string()));
        assert_eq!(lock.lock_duration_seconds, Some(300));
    }

    #[test]
    fn test_wopi_override_from_str() {
        assert_eq!(
            WopiOverride::try_from("CHECK_FILE_INFO").unwrap(),
            WopiOverride::CheckFileInfo
        );
        assert_eq!(
            WopiOverride::try_from("GET_FILE").unwrap(),
            WopiOverride::GetFile
        );
        assert_eq!(
            WopiOverride::try_from("PUT_FILE").unwrap(),
            WopiOverride::PutFile
        );
        assert!(WopiOverride::try_from("UNKNOWN").is_err());
    }
}

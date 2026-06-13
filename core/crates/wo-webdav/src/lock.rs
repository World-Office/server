// WebDAV locking support (RFC 4918 Section 6)

use chrono::{DateTime, Duration, Utc};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

/// Lock scope.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LockScope {
    /// Exclusive lock (only one holder)
    Exclusive,
    /// Shared lock (multiple holders)
    Shared,
}

/// Lock type.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LockType {
    /// Write lock
    Write,
}

/// Lock information.
#[derive(Debug, Clone)]
pub struct LockInfo {
    /// Lock token (UUID)
    pub token: String,
    /// Lock scope
    pub scope: LockScope,
    /// Lock type
    pub lock_type: LockType,
    /// Owner of the lock
    pub owner: Option<String>,
    /// Time when lock was acquired
    pub created_at: DateTime<Utc>,
    /// Lock expiration time
    pub expires_at: Option<DateTime<Utc>>,
    /// Lock depth (0 or infinity)
    pub depth: String,
}

impl LockInfo {
    /// Create a new lock.
    pub fn new(token: String, scope: LockScope, lock_type: LockType) -> Self {
        Self {
            token,
            scope,
            lock_type,
            owner: None,
            created_at: Utc::now(),
            expires_at: None,
            depth: "0".to_string(),
        }
    }

    /// Check if the lock is expired.
    pub fn is_expired(&self) -> bool {
        if let Some(expires_at) = self.expires_at {
            Utc::now() > expires_at
        } else {
            false
        }
    }

    /// Set the lock expiration time.
    pub fn with_expiration(mut self, duration_seconds: u64) -> Self {
        self.expires_at = Some(self.created_at + Duration::seconds(duration_seconds as i64));
        self
    }

    /// Set the lock owner.
    pub fn with_owner(mut self, owner: String) -> Self {
        self.owner = Some(owner);
        self
    }

    /// Set the lock depth.
    pub fn with_depth(mut self, depth: String) -> Self {
        self.depth = depth;
        self
    }
}

/// Lock manager for WebDAV resources.
#[derive(Debug, Clone)]
pub struct LockManager {
    /// Map of resource paths to locks
    locks: Arc<RwLock<HashMap<String, LockInfo>>>,
}

impl LockManager {
    /// Create a new lock manager.
    pub fn new() -> Self {
        Self {
            locks: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Acquire a lock on a resource.
    pub async fn acquire_lock(
        &self,
        resource_path: String,
        scope: LockScope,
        lock_type: LockType,
        owner: Option<String>,
        timeout_seconds: Option<u64>,
    ) -> Result<LockInfo, crate::WebDavError> {
        let mut locks = self.locks.write().await;

        // Check if resource is already locked
        if let Some(existing_lock) = locks.get(&resource_path) {
            // For exclusive locks, reject if already locked
            if scope == LockScope::Exclusive && !existing_lock.is_expired() {
                return Err(crate::WebDavError::LockConflict(format!(
                    "Resource {} is already locked",
                    resource_path
                )));
            }
        }

        // Generate lock token
        let token = Uuid::new_v4().to_string();
        let mut lock_info = LockInfo::new(token.clone(), scope, lock_type);

        if let Some(timeout) = timeout_seconds {
            lock_info = lock_info.with_expiration(timeout);
        }

        if let Some(owner) = owner {
            lock_info = lock_info.with_owner(owner);
        }

        locks.insert(resource_path, lock_info.clone());
        Ok(lock_info)
    }

    /// Release a lock on a resource.
    pub async fn release_lock(
        &self,
        resource_path: &str,
        lock_token: &str,
    ) -> Result<(), crate::WebDavError> {
        let mut locks = self.locks.write().await;

        if let Some(existing_lock) = locks.get(resource_path) {
            if existing_lock.token == lock_token {
                locks.remove(resource_path);
                Ok(())
            } else {
                Err(crate::WebDavError::LockConflict(format!(
                    "Lock token {} does not match current lock",
                    lock_token
                )))
            }
        } else {
            Err(crate::WebDavError::NotFound(format!(
                "No lock found for resource {}",
                resource_path
            )))
        }
    }

    /// Refresh a lock on a resource.
    pub async fn refresh_lock(
        &self,
        resource_path: &str,
        lock_token: &str,
        timeout_seconds: Option<u64>,
    ) -> Result<LockInfo, crate::WebDavError> {
        let mut locks = self.locks.write().await;

        if let Some(mut existing_lock) = locks.get(resource_path).cloned() {
            if existing_lock.token == lock_token {
                // Update expiration
                if let Some(timeout) = timeout_seconds {
                    existing_lock = existing_lock.with_expiration(timeout);
                }

                locks.insert(resource_path.to_string(), existing_lock.clone());
                Ok(existing_lock)
            } else {
                Err(crate::WebDavError::LockConflict(format!(
                    "Lock token {} does not match current lock",
                    lock_token
                )))
            }
        } else {
            Err(crate::WebDavError::NotFound(format!(
                "No lock found for resource {}",
                resource_path
            )))
        }
    }

    /// Get lock information for a resource.
    pub async fn get_lock(&self, resource_path: &str) -> Option<LockInfo> {
        let locks = self.locks.read().await;
        locks.get(resource_path).cloned()
    }

    /// Check if a resource is locked.
    pub async fn is_locked(&self, resource_path: &str) -> bool {
        let locks = self.locks.read().await;
        if let Some(lock) = locks.get(resource_path) {
            !lock.is_expired()
        } else {
            false
        }
    }

    /// Clean up expired locks.
    pub async fn cleanup_expired(&self) {
        let mut locks = self.locks.write().await;
        locks.retain(|_, lock| !lock.is_expired());
    }

    /// Remove all locks.
    pub async fn clear_all(&self) {
        let mut locks = self.locks.write().await;
        locks.clear();
    }
}

impl Default for LockManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_acquire_lock() {
        let manager = LockManager::new();

        let lock = manager
            .acquire_lock(
                "/test.txt".to_string(),
                LockScope::Exclusive,
                LockType::Write,
                None,
                None,
            )
            .await
            .unwrap();

        assert_eq!(lock.scope, LockScope::Exclusive);
        assert_eq!(lock.lock_type, LockType::Write);
        assert!(manager.is_locked("/test.txt").await);
    }

    #[tokio::test]
    async fn test_release_lock() {
        let manager = LockManager::new();

        let lock = manager
            .acquire_lock(
                "/test.txt".to_string(),
                LockScope::Exclusive,
                LockType::Write,
                None,
                None,
            )
            .await
            .unwrap();

        manager
            .release_lock("/test.txt", &lock.token)
            .await
            .unwrap();

        assert!(!manager.is_locked("/test.txt").await);
    }

    #[tokio::test]
    async fn test_lock_conflict() {
        let manager = LockManager::new();

        manager
            .acquire_lock(
                "/test.txt".to_string(),
                LockScope::Exclusive,
                LockType::Write,
                None,
                None,
            )
            .await
            .unwrap();

        let result = manager
            .acquire_lock(
                "/test.txt".to_string(),
                LockScope::Exclusive,
                LockType::Write,
                None,
                None,
            )
            .await;

        assert!(matches!(result, Err(crate::WebDavError::LockConflict(_))));
    }

    #[tokio::test]
    async fn test_expiration() {
        let manager = LockManager::new();

        let lock = manager
            .acquire_lock(
                "/test.txt".to_string(),
                LockScope::Exclusive,
                LockType::Write,
                None,
                Some(1), // 1 second timeout
            )
            .await
            .unwrap();

        assert!(!lock.is_expired());
        tokio::time::sleep(tokio::time::Duration::from_millis(1100)).await;
        assert!(lock.is_expired());
    }
}

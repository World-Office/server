use crate::client::{SnapshotStorage, StorageClientError};
use sha2::{Digest, Sha256};

pub async fn auto_snapshot(
    client: &impl SnapshotStorage,
    file_id: &str,
    new_content: &str,
) -> Result<String, StorageClientError> {
    let content_bytes = new_content.as_bytes();

    let mut hasher = Sha256::new();
    hasher.update(content_bytes);
    let hash_bytes = hasher.finalize();
    let hash = hex::encode(hash_bytes);

    let snapshots = client.get_snapshots_for_file(file_id).await?;

    if snapshots.iter().any(|s| s.content_hash == hash) {
        tracing::info!(
            file_id = %file_id,
            hash = %hash,
            "skip snapshot (deduplicate: hash exists)"
        );
        return Ok("deduplicated".to_string());
    }

    let snapshot_id = client
        .save_snapshot(
            file_id,
            &hash,
            content_bytes,
            "mcp-server",
            &format!("auto-snapshot: {}", hash),
        )
        .await?;

    tracing::info!(
        file_id = %file_id,
        snapshot_id = %snapshot_id,
        hash = %hash,
        "auto-snapshot created"
    );
    Ok(snapshot_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::client::{Snapshot, StorageClientError};

    struct MockEmptyStorage;

    impl SnapshotStorage for MockEmptyStorage {
        async fn get_snapshots_for_file(
            &self,
            _file_id: &str,
        ) -> std::result::Result<Vec<Snapshot>, StorageClientError> {
            Ok(vec![])
        }

        async fn save_snapshot(
            &self,
            _file_id: &str,
            _content_hash: &str,
            _content_blob: &[u8],
            _agent_name: &str,
            _summary: &str,
        ) -> std::result::Result<String, StorageClientError> {
            Ok("snap_new".to_string())
        }
    }

    struct MockDuplicateStorage;

    impl SnapshotStorage for MockDuplicateStorage {
        async fn get_snapshots_for_file(
            &self,
            _file_id: &str,
        ) -> std::result::Result<Vec<Snapshot>, StorageClientError> {
            let hash = {
                let mut h = Sha256::new();
                h.update(b"duplicate content");
                hex::encode(h.finalize())
            };
            Ok(vec![Snapshot {
                id: "snap_existing".into(),
                file_id: "f1".into(),
                content_hash: hash,
                content_blob: vec![],
                agent_name: "test".into(),
                summary: "existing".into(),
                created_at: "now".into(),
            }])
        }

        async fn save_snapshot(
            &self,
            _file_id: &str,
            _content_hash: &str,
            _content_blob: &[u8],
            _agent_name: &str,
            _summary: &str,
        ) -> std::result::Result<String, StorageClientError> {
            panic!("save_snapshot should not be called when snapshot exists")
        }
    }

    #[tokio::test]
    async fn creates_new_snapshot_when_no_duplicate() {
        let mock = MockEmptyStorage;
        let result = auto_snapshot(&mock, "f1", "new content").await.unwrap();
        assert_eq!(result, "snap_new");
    }

    #[tokio::test]
    async fn skips_when_hash_exists() {
        let mock = MockDuplicateStorage;
        let result = auto_snapshot(&mock, "f1", "duplicate content").await.unwrap();
        assert_eq!(result, "deduplicated");
    }
}

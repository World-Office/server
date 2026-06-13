use crate::client::{StorageClient, StorageClientError};
use sha2::{Digest, Sha256};

pub async fn auto_snapshot(
    client: &StorageClient,
    file_id: &str,
    new_content: &str,
) -> Result<String, StorageClientError> {
    let content_bytes = new_content.as_bytes();

    let mut hasher = Sha256::new();
    hasher.update(content_bytes);
    let hash_bytes = hasher.finalize();
    let hash = hex::encode(hash_bytes);

    let snapshots = client.list_snapshots(file_id).await?;

    if snapshots.iter().any(|s| s.content_hash == hash) {
        tracing::info!(
            file_id = %file_id,
            hash = %hash,
            "skip snapshot (deduplicate: hash exists)"
        );
        return Ok("deduplicated".to_string());
    }

    let snapshot_id = client
        .create_snapshot(
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

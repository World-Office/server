//! storage-service — World-Office document storage microservice binary.

use std::sync::Arc;
use storage_service::{AppState, app, repository::StorageRepository};
use tokio::sync::Mutex;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let storage_dir: std::path::PathBuf = std::env::var("STORAGE_DIR")
        .unwrap_or_else(|_| "./data".into())
        .into();

    let db_path = std::env::var("STORAGE_DB_PATH").unwrap_or_else(|_| "./data/files.db".into());

    let repo = StorageRepository::new(&db_path).expect("failed to open storage database");

    let state = Arc::new(AppState {
        repo: Arc::new(Mutex::new(repo)),
        storage_dir,
    });

    let app = app(state);

    let addr = std::env::var("SERVICE_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("SERVICE_PORT")
        .unwrap_or_else(|_| "8002".into())
        .parse()
        .unwrap_or(8002);

    tracing::info!(
        "storage-service v{} starting on {}:{}",
        env!("CARGO_PKG_VERSION"),
        addr,
        port
    );

    let listener = tokio::net::TcpListener::bind(format!("{}:{}", addr, port))
        .await
        .expect("failed to bind");
    axum::serve(listener, app).await.expect("server error");
}

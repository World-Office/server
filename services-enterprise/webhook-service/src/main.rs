//! webhook-service -- World-Office enterprise webhook dispatch microservice binary.
//!
//! Manages outgoing webhook registrations and delivery for document
//! lifecycle events (created, edited, shared, deleted, etc.).
//! Enterprise-only: requires `--features enterprise` to build.

#[cfg(feature = "enterprise")]
use std::sync::Arc;
#[cfg(feature = "enterprise")]
use tokio::sync::Mutex;
#[cfg(feature = "enterprise")]
use webhook_service::{AppState, repository::WebhookRepository, run_background_worker};

#[cfg(feature = "enterprise")]
#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let db_path = std::env::var("WEBHOOK_DB_PATH").unwrap_or_else(|_| "./data/webhooks.db".into());
    if let Some(parent) = std::path::Path::new(&db_path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let repo = WebhookRepository::new(&db_path).expect("failed to open webhook database");

    let state = Arc::new(AppState {
        repo: Arc::new(Mutex::new(repo)),
    });

    // Spawn background delivery worker
    let worker_state = state.clone();
    tokio::spawn(async move {
        run_background_worker(worker_state).await;
    });

    let app = webhook_service::app(state);

    let addr = std::env::var("SERVICE_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("SERVICE_PORT")
        .unwrap_or_else(|_| "8013".into())
        .parse()
        .unwrap_or(8013);

    tracing::info!(
        "webhook-service v{} starting on {}:{}",
        env!("CARGO_PKG_VERSION"),
        addr,
        port
    );

    let listener = tokio::net::TcpListener::bind(format!("{}:{}", addr, port))
        .await
        .expect("failed to bind");
    axum::serve(listener, app).await.expect("server error");
}

#[cfg(not(feature = "enterprise"))]
fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    tracing::info!(
        "webhook-service v{} (enterprise feature not enabled)",
        env!("CARGO_PKG_VERSION")
    );
}

//! audit-service — World-Office enterprise audit logging microservice binary.

use std::sync::Arc;
use audit_service::{AppState, app, repository::AuditRepository};
use tokio::sync::Mutex;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let db_path = std::env::var("AUDIT_DB_PATH").unwrap_or_else(|_| "./data/audit.db".into());

    let repo = AuditRepository::new(&db_path).expect("failed to open audit database");

    let (event_tx, _rx) = tokio::sync::broadcast::channel::<String>(1024);

    let state = Arc::new(AppState {
        repo: Arc::new(Mutex::new(repo)),
        event_tx,
    });

    let app = app(state);

    let addr = std::env::var("SERVICE_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("SERVICE_PORT")
        .unwrap_or_else(|_| "8003".into())
        .parse()
        .unwrap_or(8003);

    tracing::info!(
        "audit-service v{} starting on {}:{}",
        env!("CARGO_PKG_VERSION"),
        addr,
        port
    );

    let listener = tokio::net::TcpListener::bind(format!("{}:{}", addr, port))
        .await
        .expect("failed to bind");
    axum::serve(listener, app).await.expect("server error");
}
